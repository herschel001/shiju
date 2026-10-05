import base64
import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch


HOST_FILE = Path(__file__).resolve().parents[1] / 'native-host/host.py'
SPEC = importlib.util.spec_from_file_location('shiju_host', HOST_FILE)
HOST = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HOST)


class NativeHostTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name) / 'screenshots'
        self.directory.mkdir()
        self.original_config = HOST.CONFIG_PATH
        HOST.CONFIG_PATH = Path(self.temporary.name) / 'config.json'
        self.addCleanup(setattr, HOST, 'CONFIG_PATH', self.original_config)
        self.original_job_path = HOST.JOB_PATH
        HOST.JOB_PATH = Path(self.temporary.name) / 'organize-job.json'
        self.addCleanup(setattr, HOST, 'JOB_PATH', self.original_job_path)
        self.original_organize_config = HOST.ORGANIZE_CONFIG_PATH
        HOST.ORGANIZE_CONFIG_PATH = Path(self.temporary.name) / 'organize-config.json'
        self.addCleanup(setattr, HOST, 'ORGANIZE_CONFIG_PATH', self.original_organize_config)

    def test_configured_folder_survives_repeated_messages_and_saves(self):
        self.assertFalse(HOST.handle_message({'action': 'status'})['configured'])
        with patch.object(HOST.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = str(self.directory) + '\n'
            HOST.handle_message({'action': 'choose'})
        self.assertEqual(HOST.handle_message({'action': 'status'})['directory'], str(self.directory.resolve()))
        image = b'\xff\xd8example\xff\xd9'
        message = {'action': 'save', 'filename': '英语截图.jpg', 'data': base64.b64encode(image).decode()}
        self.assertEqual(HOST.handle_message(message)['bytes'], len(image))
        self.assertEqual((self.directory / '英语截图.jpg').read_bytes(), image)
        with self.assertRaisesRegex(ValueError, '同名截图'):
            HOST.handle_message(message)

    def test_rejects_traversal_and_non_jpg(self):
        HOST.store_directory(self.directory)
        data = base64.b64encode(b'\xff\xd8test\xff\xd9').decode()
        for filename in ['../other.jpg', '/tmp/other.jpg', 'other.png', '.hidden.jpg']:
            with self.subTest(filename=filename), self.assertRaisesRegex(ValueError, '文件名无效'):
                HOST.handle_message({'action': 'save', 'filename': filename, 'data': data})
        with self.assertRaisesRegex(ValueError, '有效的 JPG'):
            HOST.handle_message({'action': 'save', 'filename': 'bad.jpg', 'data': base64.b64encode(b'not jpeg').decode()})

    def test_opens_only_configured_directory(self):
        with self.assertRaisesRegex(ValueError, '尚未选择保存文件夹'):
            HOST.handle_message({'action': 'open', 'directory': '/tmp/other'})
        HOST.store_directory(self.directory)
        with patch.object(HOST.subprocess, 'run') as run:
            run.return_value.returncode = 0
            self.assertTrue(HOST.handle_message({'action': 'open', 'directory': '/tmp/other'})['ok'])
            run.assert_called_once_with(
                ['/usr/bin/open', str(self.directory.resolve())],
                capture_output=True, text=True, timeout=15,
            )
            run.return_value.returncode = 1
            with self.assertRaisesRegex(ValueError, '无法在访达中打开'):
                HOST.handle_message({'action': 'open'})

    def test_native_message_framing(self):
        request = json.dumps({'action': 'unknown'}).encode()
        packet = struct.pack('=I', len(request)) + request
        result = subprocess.run(['/usr/bin/python3', str(HOST_FILE)], input=packet, capture_output=True, check=True)
        size = struct.unpack('=I', result.stdout[:4])[0]
        response = json.loads(result.stdout[4:])
        self.assertEqual(size, len(result.stdout) - 4)
        self.assertFalse(response['ok'])

    def test_organize_generates_preview_then_applies_and_undoes(self):
        HOST.store_directory(self.directory)
        filename = '第一集_00-12-35_20260929-120000_abcd1234.jpg'
        image = b'\xff\xd8example\xff\xd9'
        (self.directory / filename).write_bytes(image)
        self.assertEqual(HOST.handle_message({'action': 'organize-groups'})['groups'],
                         [{'title': '第一集', 'count': 1}])
        with patch.object(HOST, 'codex_binary', return_value='/fake/codex'), patch.object(HOST.subprocess, 'Popen') as popen:
            popen.return_value.pid = os.getpid()
            job = HOST.handle_message({'action': 'organize-start', 'title': '第一集'})['job']
        self.assertEqual(job['status'], 'running')

        def fake_run(command, **_):
            self.assertIn('read-only', command)
            self.assertIn('gpt-6-luna', command)
            self.assertIn('model_reasoning_effort="low"', command)
            self.assertIn(str(self.directory.resolve() / filename), command)
            self.assertIn('例如 a while ago', command[command.index('-C') + 2])
            Path(command[command.index('-o') + 1]).write_text(json.dumps({
                'items': [{'index': 1, 'subtitle': "It's not a big deal when you think about it",
                           'phrase': "It's not a big deal", 'confidence': 'high'}]
            }), encoding='utf-8')
            return SimpleNamespace(returncode=0)

        with patch.object(HOST.subprocess, 'run', side_effect=fake_run):
            HOST.run_organize_job(job['id'], '/fake/codex')
        reviewed = HOST.handle_message({'action': 'organize-status', 'id': job['id']})['job']
        self.assertEqual(reviewed['status'], 'review')
        self.assertEqual(reviewed['suggestions'][0]['suggested'], "It's not a big deal_00-12-35.jpg")
        thumbnail = HOST.handle_message({'action': 'organize-thumbnail', 'id': job['id'], 'name': filename})
        self.assertEqual(base64.b64decode(thumbnail['data']), image)

        result = HOST.handle_message({'action': 'organize-apply', 'id': job['id'], 'choices': [
            {'source': filename, 'phrase': "It's not a big deal"}
        ]})
        self.assertEqual(result['count'], 1)
        self.assertFalse((self.directory / filename).exists())
        self.assertTrue((self.directory / "It's not a big deal_00-12-35.jpg").exists())
        self.assertEqual(HOST.handle_message({'action': 'organize-undo', 'id': job['id']})['count'], 1)
        self.assertEqual((self.directory / filename).read_bytes(), image)

    def test_organizer_selects_folder_without_changing_capture_destination(self):
        HOST.store_directory(self.directory)
        selected = Path(self.temporary.name) / 'another-series'
        selected.mkdir()
        filename = '另一部剧_00-01-02_20260929-120000_abcd1234.jpg'
        (selected / filename).write_bytes(b'example')
        (selected / '第二部剧_00-03-04_20260929-120100_dcba4321.jpg').write_bytes(b'another')
        initial = HOST.handle_message({'action': 'organize-folder'})
        self.assertEqual(initial['directory'], str(self.directory.resolve()))
        self.assertEqual(initial['count'], 0)
        self.assertFalse(initial['custom'])

        with patch.object(HOST.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = str(selected) + '\n'
            chosen = HOST.handle_message({'action': 'organize-choose-folder'})
            self.assertEqual(run.call_args.args[0][-1], str(self.directory.resolve()))
        self.assertEqual(chosen['directory'], str(selected.resolve()))
        self.assertEqual(chosen['count'], 2)
        self.assertTrue(chosen['custom'])
        self.assertEqual(HOST.read_directory(), self.directory.resolve())

        with patch.object(HOST, 'codex_binary', return_value='/fake/codex'), patch.object(HOST.subprocess, 'Popen') as popen:
            popen.return_value.pid = os.getpid()
            job = HOST.handle_message({'action': 'organize-start'})['job']
        self.assertEqual(job['directory'], str(selected.resolve()))
        self.assertEqual({item['name'] for item in job['files']},
                         {filename, '第二部剧_00-03-04_20260929-120100_dcba4321.jpg'})
        reset = HOST.handle_message({'action': 'organize-use-save-folder'})
        self.assertEqual(reset['directory'], str(self.directory.resolve()))
        self.assertFalse(reset['custom'])
        self.assertEqual(HOST.job_directory(HOST.read_job(job['id'])), selected.resolve())

    def test_organize_rejects_changed_files_and_name_collisions(self):
        HOST.store_directory(self.directory)
        filename = '第一集_00-12-35_20260929-120000_abcd1234.jpg'
        path = self.directory / filename
        path.write_bytes(b'original')
        job = {'id': 'a' * 32, 'status': 'review', 'directory': str(self.directory.resolve()),
               'title': '第一集', 'files': [{'name': filename, 'sha256': HOST.file_hash(path)}],
               'suggestions': [{'source': filename, 'subtitle': 'That is a useful expression to remember'}],
               'processed': 1}
        HOST.write_job(job)
        choice = {'source': filename, 'phrase': 'A useful expression'}
        with self.assertRaisesRegex(ValueError, '长句须提炼'):
            HOST.handle_message({'action': 'organize-apply', 'id': job['id'], 'choices': [
                {'source': filename, 'phrase': 'That is a useful expression to remember'}
            ]})
        with self.assertRaisesRegex(ValueError, '包含中文'):
            HOST.handle_message({'action': 'organize-apply', 'id': job['id'], 'choices': [
                {'source': filename, 'phrase': '有用的 expression'}
            ]})
        (self.directory / 'A useful expression_00-12-35.jpg').write_bytes(b'existing')
        with self.assertRaisesRegex(ValueError, '已存在'):
            HOST.handle_message({'action': 'organize-apply', 'id': job['id'], 'choices': [choice]})
        (self.directory / 'A useful expression_00-12-35.jpg').unlink()
        path.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, '已变化'):
            HOST.handle_message({'action': 'organize-apply', 'id': job['id'], 'choices': [choice]})

    def test_expression_keeps_short_subtitle_and_extracts_from_long_subtitle(self):
        subtitle = "I'd like to lift you up when you're feeling down."
        self.assertEqual(HOST.expression_from_subtitle('lift you up', subtitle), 'lift you up')
        self.assertEqual(HOST.expression_from_subtitle('lift you up 字幕', subtitle), '')
        self.assertEqual(HOST.expression_from_subtitle(subtitle.rstrip('.'), subtitle), '')
        self.assertEqual(HOST.expression_from_subtitle('a phrase not on screen', subtitle), '')
        self.assertEqual(HOST.expression_from_subtitle('a while ago', 'A while ago.'), 'a while ago')
        self.assertEqual(HOST.expression_from_subtitle('one two three four five six',
                                                       'One two three four five six.'),
                         'one two three four five six')
        self.assertEqual(HOST.safe_phrase('one two three four five six seven'), '')

    def test_organize_applies_complete_short_subtitle(self):
        filename = '第一集_00-12-35_20260929-120000_abcd1234.jpg'
        source = self.directory / filename
        source.write_bytes(b'original')
        job = {'id': 'c' * 32, 'status': 'review', 'directory': str(self.directory.resolve()),
               'title': '第一集', 'files': [{'name': filename, 'sha256': HOST.file_hash(source)}],
               'suggestions': [{'source': filename, 'subtitle': 'A while ago.',
                                'phrase': 'a while ago'}], 'processed': 1}
        HOST.write_job(job)
        result = HOST.handle_message({'action': 'organize-apply', 'id': job['id'], 'choices': [
            {'source': filename, 'phrase': 'a while ago'}
        ]})
        self.assertEqual(result['count'], 1)
        self.assertEqual((self.directory / 'a while ago_00-12-35.jpg').read_bytes(), b'original')
        self.assertFalse(source.exists())

    def test_interrupted_apply_and_undo_resume_safely(self):
        HOST.store_directory(self.directory)
        source_name = '第一集_00-12-35_20260929-120000_abcd1234.jpg'
        target_name = 'A useful expression_00-12-35.jpg'
        source = self.directory / source_name
        target = self.directory / target_name
        source.write_bytes(b'original')
        item = {'source': source_name, 'target': target_name, 'sha256': HOST.file_hash(source)}
        job = {'id': 'b' * 32, 'status': 'applying', 'directory': str(self.directory.resolve()),
               'title': '第一集', 'files': [{'name': source_name, 'sha256': item['sha256']}],
               'suggestions': [], 'processed': 1, 'applied': [item]}
        HOST.write_job(job)
        os.link(source, target)
        source.unlink()
        self.assertEqual(HOST.handle_message({'action': 'organize-status', 'id': job['id']})['job']['status'], 'review')
        self.assertTrue(source.exists())
        self.assertFalse(target.exists())

        job['status'] = 'undoing'
        HOST.write_job(job)
        os.link(source, target)
        self.assertEqual(HOST.handle_message({'action': 'organize-status', 'id': job['id']})['job']['status'], 'undone')
        self.assertTrue(source.exists())
        self.assertFalse(target.exists())

    def test_large_thumbnail_is_reduced_for_native_messaging(self):
        HOST.store_directory(self.directory)
        name = '第一集_00-12-35_20260929-120000_abcd1234.jpg'
        (self.directory / name).write_bytes(b'x' * 600_001)
        job = {'id': 'c' * 32, 'status': 'review', 'directory': str(self.directory.resolve()),
               'title': '第一集', 'files': [{'name': name, 'sha256': ''}],
               'suggestions': [], 'processed': 1}
        HOST.write_job(job)

        def fake_sips(command, **_):
            Path(command[command.index('--out') + 1]).write_bytes(b'preview')
            return SimpleNamespace(returncode=0)

        with patch.object(HOST.subprocess, 'run', side_effect=fake_sips):
            response = HOST.handle_message({'action': 'organize-thumbnail', 'id': job['id'], 'name': name})
        self.assertEqual(base64.b64decode(response['data']), b'preview')


if __name__ == '__main__':
    unittest.main()
