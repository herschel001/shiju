import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('subtitle switch keeps popup open and remains usable after each change', async () => {
  const handlers = new Map();
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      checked: false,
      disabled: false,
      textContent: '',
      classList: { add() {} },
      addEventListener(type, handler) { handlers.set(`${id}:${type}`, handler); },
    });
    return elements.get(id);
  };
  let closeCount = 0;
  let fail = false;
  const chrome = {
    runtime: { async sendMessage(message) {
      assert.equal(message.type, 'set-mask');
      return fail ? { ok: false, error: '切换失败' } : { ok: true, active: message.active };
    } },
  };
  const code = readFileSync(new URL('../english-clips/popup.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^refresh\(\)\.catch.*$/m, '');
  vm.runInNewContext(code, { chrome, document: { getElementById: element }, window: { close() { closeCount += 1; } } });

  const toggle = element('toggle-mask');
  toggle.checked = true;
  await handlers.get('toggle-mask:change')();
  assert.equal(toggle.checked, true);
  assert.equal(toggle.disabled, false);
  assert.equal(closeCount, 0);

  toggle.checked = false;
  await handlers.get('toggle-mask:change')();
  assert.equal(toggle.checked, false);
  assert.equal(toggle.disabled, false);
  assert.equal(closeCount, 0);

  fail = true;
  toggle.checked = true;
  await handlers.get('toggle-mask:change')();
  assert.equal(toggle.checked, false);
  assert.equal(toggle.disabled, false);
  assert.equal(element('status').textContent, '切换失败');
  assert.equal(closeCount, 0);
});

test('configured native folder opens from the popup and reports failures', async () => {
  const handlers = new Map();
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      checked: false,
      disabled: false,
      textContent: '',
      title: '',
      classList: { add() {}, toggle() {} },
      addEventListener(type, handler) { handlers.set(`${id}:${type}`, handler); },
    });
    return elements.get(id);
  };
  const actions = [];
  const openedTabs = [];
  let fail = false;
  const chrome = {
    storage: { local: { async get() { return { settings: { destination: 'native' } }; } } },
    commands: { async getAll() { return []; } },
    runtime: { async sendMessage() { return { ok: true, active: false, available: true }; }, getURL: path => `chrome-extension://example/${path}` },
    tabs: { create(options) { openedTabs.push(options); } },
  };
  const nativeRequest = async action => {
    actions.push(action);
    if (action === 'status') return { ok: true, configured: true, directory: '/tmp/拾句截图' };
    if (fail) throw new Error('无法在访达中打开保存文件夹。');
    return { ok: true };
  };
  const code = readFileSync(new URL('../english-clips/popup.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^refresh\(\)\.catch.*$/m, '');
  const context = { chrome, document: { getElementById: element }, nativeRequest, settingsWithDefaults: value => ({ enabled: true, ...value }) };
  vm.runInNewContext(code, context);
  await vm.runInNewContext('refresh()', context);
  assert.equal(element('destination').textContent, '/tmp/拾句截图');
  assert.equal(element('destination').disabled, false);
  assert.equal(element('organize').disabled, false);
  await handlers.get('organize:click')();
  assert.equal(openedTabs[0].url, 'chrome-extension://example/organize.html');
  await handlers.get('destination:click')();
  assert.deepEqual(actions, ['status', 'open']);
  assert.equal(element('destination').disabled, false);

  fail = true;
  await handlers.get('destination:click')();
  assert.equal(element('status').textContent, '无法在访达中打开保存文件夹。');
  assert.equal(element('destination').disabled, false);
});
