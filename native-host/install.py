#!/usr/bin/python3
"""Install the macOS native messaging host for this extension."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys


HOST_NAME = 'com.hershel.shiju'
PROJECT = Path(__file__).resolve().parents[1]
EXTENSION = PROJECT / 'english-clips'
APP_DIRECTORY = Path.home() / 'Library/Application Support/拾句'
MANIFEST_DIRECTORIES = (
    Path.home() / 'Library/Application Support/Google/Chrome/NativeMessagingHosts',
    Path.home() / 'Library/Application Support/Dia/NativeMessagingHosts',
)


def extension_id(value):
    digest = hashlib.sha256(value).digest()[:16]
    return ''.join(chr(ord('a') + int(nibble, 16)) for nibble in digest.hex())


def allowed_origins(extra_id=None):
    ids = {extension_id(str(EXTENSION.resolve()).encode('utf-8'))}
    if extra_id:
        if len(extra_id) != 32 or any(character < 'a' or character > 'p' for character in extra_id):
            raise ValueError('扩展 ID 格式无效。')
        ids.add(extra_id)
    key = PROJECT / '拾句.pem'
    if key.is_file():
        public_key = subprocess.run(
            ['openssl', 'pkey', '-in', str(key), '-pubout', '-outform', 'DER'],
            capture_output=True, check=True,
        ).stdout
        ids.add(extension_id(public_key))
    return [f'chrome-extension://{value}/' for value in sorted(ids)]


def install(directory=None, extra_id=None):
    if sys.platform != 'darwin':
        raise RuntimeError('这个安装脚本目前只支持 macOS。')
    target = None
    if directory:
        target = Path(directory).expanduser().resolve(strict=True)
        if not target.is_dir():
            raise ValueError('指定的保存位置不是文件夹。')
    origins = allowed_origins(extra_id)
    APP_DIRECTORY.mkdir(mode=0o700, parents=True, exist_ok=True)
    host = APP_DIRECTORY / 'host.py'
    shutil.copy2(PROJECT / 'native-host/host.py', host)
    host.chmod(0o700)
    for filename in ('organize_worker.py', 'organize-schema.json'):
        shutil.copy2(PROJECT / 'native-host' / filename, APP_DIRECTORY / filename)
    contents = json.dumps({
        'name': HOST_NAME,
        'description': '拾句本地截图保存程序',
        'path': str(host),
        'type': 'stdio',
        'allowed_origins': origins,
    }, ensure_ascii=False, indent=2) + '\n'
    manifests = []
    for manifest_directory in MANIFEST_DIRECTORIES:
        manifest_directory.mkdir(parents=True, exist_ok=True)
        manifest = manifest_directory / f'{HOST_NAME}.json'
        manifest.write_text(contents, encoding='utf-8')
        manifests.append(manifest)
    if target:
        config = APP_DIRECTORY / 'native-config.json'
        config.write_text(json.dumps({'directory': str(target)}, ensure_ascii=False), encoding='utf-8')
        config.chmod(0o600)
    print(f'已安装本地辅助程序：{host}')
    for manifest in manifests:
        print(f'浏览器宿主清单：{manifest}')
    print(f'允许的扩展 ID：{", ".join(origin.split("/")[2] for origin in origins)}')
    print('请在浏览器的扩展管理页刷新拾句，并在设置页选择“本地辅助程序 · 独立文件夹”。')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', help='可选：预先设定截图保存文件夹的完整路径')
    parser.add_argument('--extension-id', help='可选：当前浏览器中显示的拾句扩展 ID')
    arguments = parser.parse_args()
    install(arguments.directory, arguments.extension_id)
