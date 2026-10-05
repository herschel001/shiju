import { settingsWithDefaults, PRESETS, isBilibili, cropGeometry, makeFilename, formatBytes } from './core.js';
import { writableDirectory, writeImage } from './directory.js';
import { nativeStatus, saveNativeImage } from './native.js';

let busy = false;
let lastCaptureAt = 0;
const pageMessage = (tabId, message) => chrome.tabs.sendMessage(tabId, { ...message, target: 'english-clips-page' });

async function blobDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function downloadImage(blob, filename) {
  const id = await chrome.downloads.download({ url: await blobDataUrl(blob), filename, conflictAction: 'uniquify', saveAs: false });
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      chrome.downloads.onChanged.removeListener(listener);
      clearTimeout(timer);
      error ? reject(error) : resolve(id);
    };
    const checkState = state => {
      if (state === 'complete') finish();
      if (state === 'interrupted') finish(new Error('下载被取消或写入失败。请检查 Chrome 下载记录和磁盘空间。'));
    };
    const listener = delta => { if (delta.id === id) checkState(delta.state?.current); };
    const timer = setTimeout(() => finish(new Error('下载尚未确认完成，请检查 Chrome 下载记录，避免重复截图。')), 20000);
    chrome.downloads.onChanged.addListener(listener);
    chrome.downloads.search({ id }).then(items => checkState(items[0]?.state)).catch(finish);
  });
}

async function feedback(tabId, message, error = false) {
  const details = { text: error ? '!' : '✓' };
  if (Number.isInteger(tabId)) details.tabId = tabId;
  await chrome.action.setBadgeBackgroundColor({ color: error ? '#a33f32' : '#28725d', ...(Number.isInteger(tabId) ? { tabId } : {}) }).catch(() => {});
  await chrome.action.setBadgeText(details).catch(() => {});
  if (Number.isInteger(tabId)) await pageMessage(tabId, { type: 'notify', message, error }).catch(() => {});
}

export async function capture(tab, { delay = 0 } = {}) {
  if (busy || Date.now() - lastCaptureAt < 650) return;
  busy = true;
  let meta;
  try {
    if (!tab?.id || !isBilibili(tab.url)) throw new Error('请在 B 站视频页面使用拾句快捷键。');
    const { settings } = await chrome.storage.local.get('settings');
    const config = settingsWithDefaults(settings);
    if (!config.enabled) throw new Error('拾句已暂停，请点击扩展图标重新开启。');
    // Check write permission before capturing, so a failed save does not interrupt playback.
    const directory = config.destination === 'custom' ? await writableDirectory() : null;
    if (config.destination === 'native') await nativeStatus();
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const prepared = await pageMessage(tab.id, { type: 'prepare', settings: config });
    if (!prepared?.ok) throw new Error(prepared?.error || '无法读取播放器。');
    meta = prepared.data;
    // Reject partially visible videos before asking Chrome to capture the tab.
    cropGeometry(meta, meta.viewport, config.mode, PRESETS[config.preset].width);
    const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (active?.id !== tab.id) throw new Error('截图时切换了标签页，请回到视频后重试。');
    lastCaptureAt = Date.now();
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const [after] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    const validation = await pageMessage(tab.id, { type: 'validate', token: meta.token });
    if (after?.id !== tab.id || !validation?.ok) throw new Error('截图时播放器位置发生变化，请保持页面不动后重试。');
    await pageMessage(tab.id, { type: 'restore', token: meta.token });
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    let blob;
    let geometry;
    try {
      const preset = PRESETS[config.preset];
      geometry = cropGeometry(meta, bitmap, config.mode, preset.width);
      const canvas = new OffscreenCanvas(geometry.outputWidth, geometry.outputHeight);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('无法处理图片，请重新启动 Chrome 后再试。');
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, geometry.x, geometry.y, geometry.width, geometry.height, 0, 0, geometry.outputWidth, geometry.outputHeight);
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: preset.quality });
    } finally { bitmap.close(); }
    const filename = makeFilename(meta.title, meta.time);
    let downloadId = null;
    let nativeResult = null;
    if (directory) await writeImage(directory, filename, blob);
    else if (config.destination === 'native') nativeResult = await saveNativeImage(blob, filename);
    else downloadId = await downloadImage(blob, `${config.folder}/${filename}`);
    const message = `已保存 · ${formatBytes(blob.size)} · ${geometry.outputWidth} × ${geometry.outputHeight}`;
    await chrome.storage.local.set({ lastResult: { ok: true, message, filename, bytes: blob.size, downloadId, directory: nativeResult?.directory || directory?.name || `下载/${config.folder}`, at: Date.now() } });
    await feedback(tab.id, message);
    return { ok: true, filename, bytes: blob.size };
  } catch (error) {
    const message = error?.name === 'NotAllowedError' ? '文件夹权限不足，请打开拾句设置重新授权。' : error?.message || '截图失败，请重试。';
    await chrome.storage.local.set({ lastResult: { ok: false, message, at: Date.now() } }).catch(() => {});
    await feedback(tab?.id, message, true);
    return { ok: false, error: message };
  } finally {
    if (meta && tab?.id) await pageMessage(tab.id, { type: 'restore', token: meta.token }).catch(() => {});
    busy = false;
  }
}

async function maskMessage(tab, type, active) {
  if (!tab?.id || !isBilibili(tab.url)) throw new Error('请先打开 B 站视频页面。');
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  const result = await pageMessage(tab.id, { type, active });
  if (!result?.ok) throw new Error(result?.error || '无法切换字幕遮挡。');
  return result;
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'capture') {
    if (tab) void capture(tab);
    else chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([active]) => capture(active));
  }
  if (['toggle-mask', 'mask-on', 'mask-off'].includes(command)) {
    const toggle = active => maskMessage(active, command === 'toggle-mask' ? 'toggle-mask' : 'set-mask', command === 'mask-on').then(result => feedback(active.id, result.active ? '字幕已遮挡' : '字幕已显示')).catch(error => feedback(active?.id, error.message, true));
    if (tab) void toggle(tab);
    else chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([active]) => toggle(active));
  }
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === 'open-options' && sender.tab) {
    chrome.runtime.openOptionsPage().then(() => respond({ ok: true })).catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (sender.tab) return;
  if (message.type === 'capture-from-popup') {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => { respond({ queued: true }); void capture(tab, { delay: 180 }); });
    return true;
  }
  if (message.type !== 'mask-state' && message.type !== 'set-mask') return;
  chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => maskMessage(tab, message.type, message.active)).then(respond).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
