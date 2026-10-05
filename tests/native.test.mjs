import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeRequest, nativeStatus, saveNativeImage, NATIVE_HOST } from '../english-clips/native.js';

test('native helper checks configuration and sends JPG data without a web page', async () => {
  const messages = [];
  globalThis.chrome = { runtime: { async sendNativeMessage(name, message) {
    assert.equal(name, NATIVE_HOST);
    messages.push(message);
    if (message.action === 'status') return { ok: true, configured: true, directory: '/tmp/拾句截图' };
    if (message.action === 'save') return { ok: true, directory: '/tmp/拾句截图', bytes: 4 };
    return { ok: false, error: '不支持的操作' };
  } } };
  try {
    assert.equal((await nativeStatus()).directory, '/tmp/拾句截图');
    const saved = await saveNativeImage(new Blob([Uint8Array.from([255, 216, 255, 217])], { type: 'image/jpeg' }), 'clip.jpg');
    assert.equal(saved.bytes, 4);
    assert.equal(messages[1].filename, 'clip.jpg');
    assert.equal(messages[1].data, '/9j/2Q==');
    await assert.rejects(nativeRequest('unknown'), /不支持的操作/);
    globalThis.chrome.runtime.sendNativeMessage = async () => ({ ok: true, configured: false });
    await assert.rejects(nativeStatus(), /尚未选择保存文件夹/);
  } finally { delete globalThis.chrome; }
});
