import { settingsWithDefaults } from './core.js';
import { readDirectory } from './directory.js';
import { nativeRequest } from './native.js';
const $ = id => document.getElementById(id);
async function refresh() {
  const { settings, lastResult } = await chrome.storage.local.get(['settings', 'lastResult']);
  const config = settingsWithDefaults(settings);
  $('enabled').checked = config.enabled;
  $('capture').disabled = !config.enabled;
  const commands = await chrome.commands.getAll();
  $('shortcut').textContent = commands.find(command => command.name === 'capture')?.shortcut || '尚未设置快捷键';
  $('mask-shortcut').textContent = commands.find(command => command.name === 'toggle-mask')?.shortcut || '尚未设置';
  const maskState = await chrome.runtime.sendMessage({ type: 'mask-state' });
  $('toggle-mask').disabled = !maskState?.ok || (!maskState.active && !maskState.available);
  $('toggle-mask').checked = Boolean(maskState?.active);
  $('destination').disabled = true;
  $('destination').title = '';
  $('organize').hidden = config.destination !== 'native';
  $('organize').disabled = true;
  if (config.destination === 'custom') $('destination').textContent = (await readDirectory())?.name || '尚未选择文件夹';
  else if (config.destination === 'native') {
    try {
      const result = await nativeRequest('status');
      $('destination').textContent = result.directory || '本地助手尚未选择文件夹';
      $('destination').disabled = !result.configured;
      $('organize').disabled = !result.configured;
      if (result.configured) $('destination').title = '在访达中打开保存文件夹';
    }
    catch { $('destination').textContent = '本地辅助程序未连接'; }
  } else $('destination').textContent = `下载 / ${config.folder}`;
  $('status').textContent = !config.enabled ? '已暂停，开启后可继续收藏。' : lastResult ? `${lastResult.ok ? '上次收藏：' : '上次未保存：'}${lastResult.message}` : '打开 B 站视频，即可开始收藏。';
  $('status').classList.toggle('error', Boolean(config.enabled && lastResult && !lastResult.ok));
}
$('enabled').addEventListener('change', async () => {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...settingsWithDefaults(settings), enabled: $('enabled').checked } });
  await refresh();
});
$('capture').addEventListener('click', async () => {
  $('capture').disabled = true;
  try { await chrome.runtime.sendMessage({ type: 'capture-from-popup' }); window.close(); }
  catch { $('status').textContent = '无法启动截图，请重新打开扩展后再试。'; $('capture').disabled = false; }
});
$('toggle-mask').addEventListener('change', async () => {
  const active = $('toggle-mask').checked;
  $('toggle-mask').disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'set-mask', active });
    if (!result?.ok) throw new Error(result?.error || '无法切换字幕遮挡。');
    $('toggle-mask').checked = result.active;
  } catch (error) {
    $('toggle-mask').checked = !active;
    $('status').textContent = error.message;
    $('status').classList.add('error');
  } finally { $('toggle-mask').disabled = false; }
});
$('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
$('organize').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('organize.html') }));
$('destination').addEventListener('click', async () => {
  if ($('destination').disabled) return;
  $('destination').disabled = true;
  try { await nativeRequest('open'); }
  catch (error) {
    $('status').textContent = error.message;
    $('status').classList.add('error');
  } finally { $('destination').disabled = false; }
});
refresh().catch(error => { $('status').textContent = error.message; });
