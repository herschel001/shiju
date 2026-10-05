import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { settingsWithDefaults, sanitizeFolder } from '../english-clips/core.js';

test('settings save on change and folder permission reuses the saved handle', async () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', checked: false, hidden: false, handlers: {},
      classList: { toggle() {} },
      addEventListener(type, handler) { this.handlers[type] = handler; },
    });
    return elements.get(id);
  };
  let permission = 'prompt';
  let permissionGate = null;
  let permissionRequests = 0;
  const original = {
    name: '原文件夹',
    async queryPermission() { return permission; },
    async requestPermission(options) {
      permissionRequests++;
      assert.equal(options.mode, 'readwrite');
      if (permissionGate) await permissionGate;
      permission = 'granted';
      return permission;
    },
  };
  let saved = original;
  let nativeDirectory = '';
  let pickerCalls = 0;
  const replacement = { name: '新文件夹', async queryPermission() { return 'granted'; } };
  const window = {
    addEventListener() {},
    async showDirectoryPicker(options) {
      pickerCalls++;
      assert.equal(options.mode, 'readwrite');
      return replacement;
    },
  };
  const document = {
    getElementById: element,
    querySelector: selector => element(`mode-${selector.match(/value="([^"]+)"/)[1]}`),
    querySelectorAll: () => [element('mode-video'), element('mode-subtitle')],
  };
  element('mode-video').value = 'video';
  element('mode-subtitle').value = 'subtitle';
  let storedSettings = settingsWithDefaults({ destination: 'custom', hideDanmaku: false });
  let failNextWrite = false;
  const chrome = {
    storage: { local: {
      get: async () => ({ settings: storedSettings }),
      set: async ({ settings }) => {
        if (failNextWrite) { failNextWrite = false; throw new Error('磁盘不可用'); }
        if (settings.folder === 'first') await new Promise(resolve => setTimeout(resolve, 10));
        storedSettings = settings;
      },
    } },
    commands: { getAll: async () => [
      { name: 'capture', shortcut: '⌘Y' },
      { name: 'toggle-mask', shortcut: '⌘U' },
      { name: 'mask-on', shortcut: '' },
      { name: 'mask-off', shortcut: '' },
    ] },
    tabs: { create() {} },
  };
  const code = readFileSync(new URL('../english-clips/options.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  vm.runInNewContext(code, {
    window, document, chrome,
    settingsWithDefaults, sanitizeFolder,
    readDirectory: async () => saved,
    storeDirectory: async handle => { saved = handle; },
    nativeRequest: async action => {
      if (action === 'choose') nativeDirectory = '/tmp/拾句截图';
      return { ok: true, configured: Boolean(nativeDirectory), directory: nativeDirectory };
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(element('grant-directory').hidden, false);
  assert.equal(element('mask-shortcut').textContent, '⌘U');
  assert.equal(element('mask-on-shortcut').textContent, '未设置');
  assert.doesNotMatch(readFileSync(new URL('../english-clips/options.html', import.meta.url), 'utf8'), /保存设置/);

  element('destination').value = 'downloads';
  await element('destination').handlers.change();
  assert.equal(storedSettings.destination, 'downloads');
  element('destination').value = 'custom';
  await element('destination').handlers.change();
  assert.equal(storedSettings.destination, 'custom');

  storedSettings = { ...storedSettings, enabled: false };
  element('preset').value = 'clear';
  await element('preset').handlers.change();
  assert.equal(storedSettings.preset, 'clear');
  assert.equal(storedSettings.enabled, false);
  await element('mode-subtitle').handlers.change();
  assert.equal(storedSettings.mode, 'subtitle');
  element('hide-danmaku').checked = true;
  await element('hide-danmaku').handlers.change();
  assert.equal(storedSettings.hideDanmaku, true);

  const folder = element('folder');
  folder.value = 'first';
  const firstWrite = folder.handlers.input();
  folder.value = 'second';
  const secondWrite = folder.handlers.input();
  await Promise.all([firstWrite, secondWrite]);
  assert.equal(storedSettings.folder, 'second');
  folder.value = 'A?';
  await folder.handlers.change();
  assert.equal(folder.value, 'A_');
  assert.equal(storedSettings.folder, 'A_');
  assert.equal(element('status').textContent, '已自动保存');

  failNextWrite = true;
  element('preset').value = 'compact';
  await element('preset').handlers.change();
  assert.match(element('status').textContent, /保存失败：磁盘不可用/);
  element('preset').value = 'balanced';
  await element('preset').handlers.change();
  assert.equal(storedSettings.preset, 'balanced');
  assert.equal(element('status').textContent, '已自动保存');

  let finishPermission;
  permissionGate = new Promise(resolve => { finishPermission = resolve; });
  const pendingGrant = element('grant-directory').handlers.click();
  assert.equal(element('grant-directory').disabled, true);
  assert.equal(element('choose-directory').disabled, true);
  await element('choose-directory').handlers.click();
  assert.equal(pickerCalls, 0);
  assert.equal(permissionRequests, 1);
  finishPermission();
  await pendingGrant;
  permissionGate = null;
  assert.equal(saved, original);
  assert.match(element('folder-status').textContent, /已重新授权“原文件夹”/);
  assert.equal(element('grant-directory').hidden, true);
  assert.equal(element('grant-directory').disabled, false);
  assert.equal(element('choose-directory').disabled, false);

  let finishPicker;
  window.showDirectoryPicker = async options => {
    pickerCalls++;
    assert.equal(options.mode, 'readwrite');
    return new Promise(resolve => { finishPicker = () => resolve(replacement); });
  };
  const pendingChoice = element('choose-directory').handlers.click();
  assert.equal(element('choose-directory').disabled, true);
  assert.equal(element('grant-directory').disabled, true);
  await element('choose-directory').handlers.click();
  await element('grant-directory').handlers.click();
  assert.equal(pickerCalls, 1);
  assert.equal(permissionRequests, 1);
  finishPicker();
  await pendingChoice;
  assert.equal(element('choose-directory').disabled, false);
  assert.equal(element('grant-directory').disabled, false);
  assert.equal(saved, replacement);
  assert.match(element('folder-status').textContent, /已选择“新文件夹”，设置已自动保存/);
  assert.equal(storedSettings.destination, 'custom');

  window.showDirectoryPicker = async () => { throw new Error('File picker already active.'); };
  await element('choose-directory').handlers.click();
  assert.match(element('folder-status').textContent, /已有文件夹选择窗口/);
  assert.equal(element('choose-directory').disabled, false);

  window.showDirectoryPicker = async () => { throw Object.assign(new Error('Aborted'), { name: 'AbortError' }); };
  await element('choose-directory').handlers.click();
  assert.match(element('folder-status').textContent, /未选中文件夹/);

  window.showDirectoryPicker = undefined;
  await element('choose-directory').handlers.click();
  assert.equal(pickerCalls, 1);
  assert.match(element('folder-status').textContent, /无法打开文件夹选择器/);

  element('destination').value = 'native';
  await element('destination').handlers.change();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(storedSettings.destination, 'native');
  assert.equal(element('native-directory-name').textContent, '尚未选择文件夹');
  await element('choose-native-directory').handlers.click();
  assert.equal(element('native-directory-name').textContent, '/tmp/拾句截图');
  assert.match(element('native-status').textContent, /设置已自动保存/);
});
