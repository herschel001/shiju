export const DEFAULTS = Object.freeze({ enabled: true, destination: 'downloads', folder: '英语截图', mode: 'video', preset: 'balanced', hideDanmaku: true });
export const PRESETS = Object.freeze({ compact: { width: 960, quality: 0.72 }, balanced: { width: 1280, quality: 0.82 }, clear: { width: 1920, quality: 0.92 } });

export function settingsWithDefaults(value = {}) {
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    destination: ['custom', 'native'].includes(value.destination) ? value.destination : 'downloads',
    folder: sanitizeFolder(value.folder ?? DEFAULTS.folder),
    mode: value.mode === 'subtitle' ? 'subtitle' : 'video',
    preset: Object.hasOwn(PRESETS, value.preset) ? value.preset : 'balanced',
    hideDanmaku: typeof value.hideDanmaku === 'boolean' ? value.hideDanmaku : true,
  };
}

export function sanitizeFolder(value) {
  const result = String(value).split(/[\\/]/).filter(part => part.trim() && !/^\.+$/.test(part.trim()))
    .map(part => part.replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim().replace(/[. ]+$/g, '').slice(0, 60)).filter(Boolean).slice(0, 4).join('/');
  return result || '英语截图';
}

export function isBilibili(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && (parsed.hostname === 'bilibili.com' || parsed.hostname.endsWith('.bilibili.com')); }
  catch { return false; }
}

export function timestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(n => String(n).padStart(2, '0')).join('-');
}

export function makeFilename(title, seconds, date = new Date(), suffix = crypto.randomUUID().slice(0, 8)) {
  const safe = String(title || 'B站视频').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '').slice(0, 70) || 'B站视频';
  const pad = n => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const clock = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${safe}_${timestamp(seconds)}_${day}-${clock}_${suffix}.jpg`;
}

export function cropGeometry(meta, bitmap, mode, maxWidth) {
  const { rect, viewport } = meta;
  if (![rect.x, rect.y, rect.width, rect.height, viewport.width, viewport.height, bitmap.width, bitmap.height].every(Number.isFinite) || rect.width < 2 || rect.height < 2 || viewport.width < 2 || viewport.height < 2 || bitmap.width < 2 || bitmap.height < 2) throw new Error('播放器尺寸无效，请刷新视频页面。');
  if (rect.x < -2 || rect.y < -2 || rect.x + rect.width > viewport.width + 2 || rect.y + rect.height > viewport.height + 2) throw new Error('播放器没有完整显示。请滚动到完整画面，或进入网页全屏后再截图。');
  const scaleX = bitmap.width / viewport.width;
  const scaleY = bitmap.height / viewport.height;
  const top = mode === 'subtitle' ? 0.65 : 0;
  const x = Math.max(0, Math.round(rect.x * scaleX));
  const y = Math.max(0, Math.round((rect.y + rect.height * top) * scaleY));
  const width = Math.min(bitmap.width - x, Math.round(rect.width * scaleX));
  const height = Math.min(bitmap.height - y, Math.round(rect.height * (1 - top) * scaleY));
  const factor = Math.min(1, maxWidth / width);
  return { x, y, width, height, outputWidth: Math.max(1, Math.round(width * factor)), outputHeight: Math.max(1, Math.round(height * factor)) };
}

export function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
