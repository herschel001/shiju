import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('shortcut commands can toggle, enable, and disable subtitle masking', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../english-clips/manifest.json', import.meta.url), 'utf8'));
  for (const command of ['toggle-mask', 'mask-on', 'mask-off']) assert.ok(manifest.commands[command]);

  let listener;
  let messageListener;
  let optionsOpened = 0;
  let active = false;
  const messages = [];
  const chrome = {
    commands: { onCommand: { addListener(callback) { listener = callback; } } },
    runtime: {
      id: 'test-extension',
      onMessage: { addListener(callback) { messageListener = callback; } },
      async openOptionsPage() { optionsOpened += 1; },
    },
    scripting: { executeScript: async () => {} },
    tabs: {
      sendMessage: async (_id, message) => {
        messages.push(message);
        if (message.type === 'toggle-mask') active = !active;
        if (message.type === 'set-mask') active = message.active;
        return { ok: true, active };
      },
    },
    action: {
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async () => {},
    },
  };
  const code = readFileSync(new URL('../english-clips/background.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export async function capture', 'async function capture');
  vm.runInNewContext(code, { chrome, isBilibili: () => true });
  const tab = { id: 7, url: 'https://www.bilibili.com/video/test' };
  const command = async name => { listener(name, tab); await new Promise(resolve => setImmediate(resolve)); };

  await command('mask-on');
  assert.equal(active, true);
  assert.equal(messages.findLast(message => message.type === 'set-mask').active, true);
  await command('mask-off');
  assert.equal(active, false);
  assert.equal(messages.findLast(message => message.type === 'set-mask').active, false);
  await command('toggle-mask');
  assert.equal(active, true);
  await command('toggle-mask');
  assert.equal(active, false);

  const optionsResult = await new Promise(resolve => {
    assert.equal(messageListener({ type: 'open-options' }, { id: 'test-extension', tab }, resolve), true);
  });
  assert.equal(optionsResult.ok, true);
  assert.equal(optionsOpened, 1);
  assert.equal(messageListener({ type: 'open-options' }, { id: 'other-extension', tab }, () => {}), undefined);
  assert.equal(optionsOpened, 1);
});
