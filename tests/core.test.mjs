import test from 'node:test';
import assert from 'node:assert/strict';
import { cropGeometry, makeFilename, sanitizeFolder, settingsWithDefaults, isBilibili, timestamp } from '../english-clips/core.js';
const meta = { rect: { x: 40, y: 100, width: 960, height: 540 }, viewport: { width: 1200, height: 800 } };
test('Retina screenshot uses physical pixels and preserves aspect ratio', () => {
  assert.deepEqual(cropGeometry(meta, { width: 2400, height: 1600 }, 'video', 1280), { x: 80, y: 200, width: 1920, height: 1080, outputWidth: 1280, outputHeight: 720 });
});
test('subtitle crop keeps bottom 35 percent without upscaling', () => {
  assert.deepEqual(cropGeometry(meta, { width: 1200, height: 800 }, 'subtitle', 1280), { x: 40, y: 451, width: 960, height: 189, outputWidth: 960, outputHeight: 189 });
});
test('partial videos and invalid geometry fail instead of silently losing subtitles', () => {
  assert.throws(() => cropGeometry({ ...meta, rect: { ...meta.rect, y: 500 } }, meta.viewport, 'video', 1280), /完整/);
  assert.throws(() => cropGeometry({ ...meta, viewport: { width: 0, height: 800 } }, meta.viewport, 'video', 1280), /尺寸/);
  assert.throws(() => cropGeometry({ ...meta, rect: { ...meta.rect, x: NaN } }, meta.viewport, 'video', 1280), /尺寸/);
});
test('folder input cannot escape downloads using traversal or platform separators', () => {
  assert.equal(sanitizeFolder('../../口语/../美剧'), '口语/美剧');
  assert.equal(sanitizeFolder('C:\\clips\\..\\talk?'), 'C_/clips/talk_');
  assert.equal(sanitizeFolder('.../ /.'), '英语截图');
});
test('filename keeps video position, safe title, and uniqueness suffix', () => {
  assert.equal(makeFilename('a/b: c?', 3661, new Date(2026, 8, 24, 12, 30, 15), 'abcd1234'), 'a_b_ c__01-01-01_20260924-123015_abcd1234.jpg');
  assert.equal(timestamp(-1), '00-00-00');
});
test('only HTTPS Bilibili and real subdomains are accepted', () => {
  for (const url of ['https://www.bilibili.com/video/a', 'https://bilibili.com', 'https://m.bilibili.com']) assert.equal(isBilibili(url), true);
  for (const url of ['https://bilibili.com.evil.test', 'https://notbilibili.com', 'file:///video', 'http://bilibili.com', 'broken']) assert.equal(isBilibili(url), false);
});
test('stale or tampered settings fall back to supported values', () => {
  assert.deepEqual(settingsWithDefaults({ preset: 'huge', mode: 'invalid', destination: 'server', enabled: 'false' }), settingsWithDefaults());
  assert.equal(settingsWithDefaults({ enabled: false }).enabled, false);
  assert.equal(settingsWithDefaults({ destination: 'native' }).destination, 'native');
});
