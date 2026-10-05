import { settingsWithDefaults, sanitizeFolder } from './core.js';
import { readDirectory, storeDirectory } from './directory.js';
import { nativeRequest } from './native.js';
const $ = id => document.getElementById(id);
let directory = null;
let directoryBusy = false;
let saveQueue = Promise.resolve();
let saveRevision = 0;
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function folderStatus(text, error = false) { $('folder-status').textContent = text; $('folder-status').classList.toggle('error', error); }
function showDestination() {
  $('download-settings').hidden = $('destination').value !== 'downloads';
  $('native-settings').hidden = $('destination').value !== 'native';
  $('custom-settings').hidden = $('destination').value !== 'custom';
}
function setDirectoryBusy(busy) {
  directoryBusy = busy;
  $('choose-directory').disabled = busy;
  $('grant-directory').disabled = busy;
}
function directoryError(error, action) {
  if (/file picker already active/i.test(error?.message || '')) return 'Chrome 已有文件夹选择窗口。请先完成选择或按 Esc 取消；若看不到弹窗，请关闭并重新打开拾句设置页。';
  if (error?.name === 'AbortError') return action === '重新授权' ? '已取消授权；仍可点击“重新授权”对同一文件夹再试。' : '未选中文件夹。如果没有主动取消，可能是 Chrome 阻止了访问；请检查文件访问权限后重试。';
  return `${action}失败：${error?.message || '未知错误'}`;
}
function saveChange(change) {
  const revision = ++saveRevision;
  status('正在保存…');
  const write = saveQueue.catch(() => {}).then(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: settingsWithDefaults({ ...settings, ...change }) });
  });
  saveQueue = write;
  write.then(
    () => { if (revision === saveRevision) status('已自动保存'); },
    error => { if (revision === saveRevision) status(`保存失败：${error.message}`, true); },
  );
  return write;
}
async function refreshDirectory() {
  directory = await readDirectory();
  const granted = directory && await directory.queryPermission({ mode: 'readwrite' }) === 'granted';
  $('directory-name').textContent = directory?.name || '尚未选择文件夹';
  $('permission').textContent = granted ? '已获得写入权限' : directory ? '需要重新授权，才能保存截图。' : '选择一次，让截图直接存到这里。';
  $('grant-directory').hidden = !directory || granted;
}
async function refreshNative() {
  try {
    const result = await nativeRequest('status');
    $('native-directory-name').textContent = result.directory || '尚未选择文件夹';
    $('native-connection').textContent = result.configured ? '本地辅助程序已连接，可以持续保存。' : '本地辅助程序已连接，请选择保存文件夹。';
    $('choose-native-directory').disabled = false;
  } catch (error) {
    $('native-directory-name').textContent = '本地辅助程序未连接';
    $('native-connection').textContent = error.message;
    $('choose-native-directory').disabled = true;
  }
}
async function refreshShortcuts() {
  const commands = await chrome.commands.getAll();
  for (const [name, id] of [['capture', 'shortcut'], ['toggle-mask', 'mask-shortcut'], ['mask-on', 'mask-on-shortcut'], ['mask-off', 'mask-off-shortcut']]) {
    $(id).textContent = commands.find(command => command.name === name)?.shortcut || '未设置';
  }
}
async function init() {
  const { settings } = await chrome.storage.local.get('settings');
  const config = settingsWithDefaults(settings);
  $('destination').value = config.destination;
  $('folder').value = config.folder;
  $('preset').value = config.preset;
  $('hide-danmaku').checked = config.hideDanmaku;
  document.querySelector(`input[name="mode"][value="${config.mode}"]`).checked = true;
  showDestination();
  await refreshDirectory();
  if (config.destination === 'native') await refreshNative();
  await refreshShortcuts();
}
$('destination').addEventListener('change', () => {
  showDestination();
  if ($('destination').value === 'native') void refreshNative();
  return saveChange({ destination: $('destination').value }).catch(() => {});
});
$('folder').addEventListener('input', () => saveChange({ folder: sanitizeFolder($('folder').value) }).catch(() => {}));
$('folder').addEventListener('change', () => {
  $('folder').value = sanitizeFolder($('folder').value);
  return saveChange({ folder: $('folder').value }).catch(() => {});
});
for (const input of document.querySelectorAll('input[name="mode"]')) input.addEventListener('change', () => saveChange({ mode: input.value }).catch(() => {}));
$('preset').addEventListener('change', () => saveChange({ preset: $('preset').value }).catch(() => {}));
$('hide-danmaku').addEventListener('change', () => saveChange({ hideDanmaku: $('hide-danmaku').checked }).catch(() => {}));
$('choose-directory').addEventListener('click', async () => {
  if (directoryBusy) return;
  if (typeof window.showDirectoryPicker !== 'function') {
    folderStatus('当前浏览器无法打开文件夹选择器。请用 Chrome 打开此设置页。', true);
    return;
  }
  setDirectoryBusy(true);
  folderStatus('正在打开文件夹选择器…');
  try {
    const handle = await window.showDirectoryPicker({ id: 'english-clips', mode: 'readwrite' });
    await storeDirectory(handle);
    await refreshDirectory();
    try { await saveChange({ destination: 'custom' }); }
    catch (error) { folderStatus(`已选择“${handle.name}”，但设置未保存：${error.message}`, true); return; }
    folderStatus(`已选择“${handle.name}”，设置已自动保存。`);
  } catch (error) {
    folderStatus(directoryError(error, '选择文件夹'), error?.name !== 'AbortError');
  } finally { setDirectoryBusy(false); }
});
$('grant-directory').addEventListener('click', async () => {
  if (directoryBusy) return;
  if (!directory) { folderStatus('没有已保存的文件夹，请先选择文件夹。', true); return; }
  setDirectoryBusy(true);
  folderStatus(`正在请求“${directory.name}”的写入权限…`);
  try {
    const result = await directory.requestPermission({ mode: 'readwrite' });
    await refreshDirectory();
    folderStatus(result === 'granted' ? `已重新授权“${directory.name}”，可以继续截图。` : '没有获得写入权限，请在 Chrome 弹窗中允许。', result !== 'granted');
  } catch (error) { folderStatus(directoryError(error, '重新授权'), true); }
  finally { setDirectoryBusy(false); }
});
$('choose-native-directory').addEventListener('click', async () => {
  if ($('choose-native-directory').disabled) return;
  $('choose-native-directory').disabled = true;
  $('native-status').textContent = '正在打开系统文件夹选择窗口…';
  try {
    const result = await nativeRequest('choose');
    await refreshNative();
    await saveChange({ destination: 'native' });
    $('native-status').textContent = `已选择“${result.directory}”，设置已自动保存。`;
  } catch (error) {
    $('native-status').textContent = error.message;
  } finally { $('choose-native-directory').disabled = false; }
});
$('shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
window.addEventListener('focus', () => { void refreshShortcuts().catch(error => status(error.message, true)); });
init().catch(error => { folderStatus(`无法读取文件夹设置：${error.message}`, true); status(error.message, true); });
