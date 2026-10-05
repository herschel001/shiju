import { nativeRequest } from './native.js';

const $ = id => document.getElementById(id);
let currentJob = null;
let timer = null;
let hasFiles = false;

function status(message, error = false) {
  $('progress').textContent = message;
  $('progress').classList.toggle('error', error);
}

function showFolder(folder) {
  $('folder-path').textContent = folder.directory;
  $('folder-count').textContent = `当前文件夹有 ${folder.count} 张待整理的拾句截图`;
  $('reset-folder').hidden = !folder.custom;
  $('reset-folder').disabled = currentJob?.status === 'running';
  hasFiles = folder.count > 0;
  $('start').disabled = !hasFiles || currentJob?.status === 'running';
  return folder.count;
}

async function refreshFolder() {
  return showFolder(await nativeRequest('organize-folder'));
}

function suggestedName(source, phrase, subtitle) {
  const match = source.match(/_(\d{2}-\d{2}-\d{2})_\d{8}-\d{6}_[0-9a-f]{8}\.jpg$/i);
  const clean = phrase.replaceAll('’', "'").replace(/\s+/g, ' ').trim();
  const word = /[a-z]+(?:['-][a-z]+)*/g;
  const words = value => value.replaceAll('’', "'").toLowerCase().match(word) || [];
  const chosen = words(clean);
  const original = words(subtitle || '');
  if (!match || clean.length > 65 || !/^[A-Za-z]+(?:['-][A-Za-z]+)*(?: [A-Za-z]+(?:['-][A-Za-z]+)*){0,5}$/.test(clean))
    return '请用 1 至 6 个英文词';
  if (!original.some((_, index) =>
    chosen.every((item, offset) => original[index + offset] === item))) return '须使用字幕中的连续英文词';
  return `${clean}_${match[1]}.jpg`;
}

async function loadThumbnail(job, source, image, button) {
  try {
    const result = await nativeRequest('organize-thumbnail', { id: job.id, name: source });
    image.src = `data:image/jpeg;base64,${result.data}`;
    button.disabled = false;
  } catch { image.alt = '预览不可用'; }
}

function openPreview(image, suggestion, phrase) {
  $('preview-image').src = image.src;
  $('preview-image').alt = suggestion.source;
  $('preview-filename').textContent = suggestion.source;
  $('preview-subtitle').textContent = `英文字幕：${suggestion.subtitle || '未识别'}`;
  $('preview-suggested').textContent = `当前建议：${suggestedName(suggestion.source, phrase, suggestion.subtitle)}`;
  $('image-preview').showModal();
}

function renderSuggestions(job) {
  $('review').hidden = false;
  $('suggestions').replaceChildren();
  $('review-count').textContent = `${job.suggestions.length} 张 · ${job.directory}`;
  $('apply').hidden = job.status === 'applied';
  $('undo').hidden = job.status !== 'applied';
  $('suggestions').hidden = job.status === 'applied';
  if (job.status === 'applied') return;
  for (const suggestion of job.suggestions) {
    const row = document.createElement('div');
    row.className = 'suggestion-row';
    const image = document.createElement('img');
    image.alt = suggestion.source;
    image.loading = 'lazy';
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'thumbnail-button';
    preview.disabled = true;
    preview.title = '点击查看大图';
    preview.setAttribute('aria-label', `查看截图大图：${suggestion.source}`);
    preview.append(image);
    void loadThumbnail(job, suggestion.source, image, preview);
    const details = document.createElement('div');
    details.className = 'suggestion-details';
    const oldName = document.createElement('small');
    oldName.textContent = suggestion.source;
    const subtitle = document.createElement('small');
    subtitle.textContent = `英文字幕：${suggestion.subtitle || '未识别'}`;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = suggestion.phrase || '';
    input.placeholder = '看不清，保留原名';
    input.maxLength = 65;
    const proposed = document.createElement('small');
    proposed.className = 'proposed-name';
    proposed.textContent = suggestedName(suggestion.source, input.value, suggestion.subtitle);
    input.addEventListener('input', () => { proposed.textContent = suggestedName(suggestion.source, input.value, suggestion.subtitle); });
    preview.addEventListener('click', () => openPreview(image, suggestion, input.value));
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = Boolean(suggestion.phrase && suggestion.confidence === 'high');
    const label = document.createElement('label');
    label.className = 'suggestion-check';
    label.append(check, document.createTextNode('使用此名称'));
    details.append(oldName, subtitle, input, proposed, label);
    row.append(preview, details);
    row.dataset.source = suggestion.source;
    $('suggestions').append(row);
  }
}

$('close-preview').addEventListener('click', () => $('image-preview').close());
$('image-preview').addEventListener('click', event => {
  if (event.target === $('image-preview')) $('image-preview').close();
});

async function poll() {
  if (!currentJob) return;
  try {
    currentJob = (await nativeRequest('organize-status', { id: currentJob.id })).job;
    const job = currentJob;
    if (job.status === 'running') {
      status(`Codex 正在识别：${job.processed}/${job.files.length} 张（每批 8 张完成后更新）`);
      $('start').disabled = true;
      $('folder').disabled = true;
      $('reset-folder').disabled = true;
      timer = setTimeout(poll, 2000);
    } else if (job.status === 'review') {
      $('start').disabled = !hasFiles;
      $('folder').disabled = false;
      $('reset-folder').disabled = false;
      status('建议已生成，请检查后确认。');
      renderSuggestions(job);
    } else if (job.status === 'applied') {
      $('start').disabled = !hasFiles;
      $('folder').disabled = false;
      $('reset-folder').disabled = false;
      status(`已改名 ${job.applied.length} 张。`);
      renderSuggestions(job);
    } else if (job.status === 'error') {
      $('start').disabled = !hasFiles;
      $('folder').disabled = false;
      $('reset-folder').disabled = false;
      status(job.error || '整理失败，请重试。', true);
    } else if (job.status === 'undone') {
      $('start').disabled = !hasFiles;
      $('folder').disabled = false;
      $('reset-folder').disabled = false;
      status('本次改名已撤销。');
    }
  } catch (error) { status(error.message, true); }
}

$('folder').addEventListener('click', async () => {
  $('folder').disabled = true;
  try {
    const selected = await nativeRequest('organize-choose-folder');
    showFolder(selected);
    status(selected.count ? '已选择截图文件夹，可以生成命名建议。' : '这个文件夹没有待整理的拾句截图。');
  } catch (error) { status(error.message, true); }
  finally { $('folder').disabled = currentJob?.status === 'running'; }
});

$('reset-folder').addEventListener('click', async () => {
  try {
    showFolder(await nativeRequest('organize-use-save-folder'));
    status('已切回当前截图保存文件夹。');
  } catch (error) { status(error.message, true); }
});

$('start').addEventListener('click', async () => {
  $('start').disabled = true;
  $('review').hidden = true;
  status('正在启动 Codex…');
  try {
    currentJob = (await nativeRequest('organize-start')).job;
    await poll();
  } catch (error) { status(error.message, true); }
  finally { if (currentJob?.status !== 'running') $('start').disabled = !hasFiles; }
});

$('apply').addEventListener('click', async () => {
  const choices = [...$('suggestions').children].filter(row => row.querySelector('input[type="checkbox"]').checked)
    .map(row => ({ source: row.dataset.source, phrase: row.querySelector('input[type="text"]').value }));
  $('apply').disabled = true;
  try {
    const result = await nativeRequest('organize-apply', { id: currentJob.id, choices });
    status(`已改名 ${result.count} 张，可撤销。`);
    await poll();
    await refreshFolder();
  } catch (error) { status(error.message, true); }
  finally { $('apply').disabled = false; }
});

$('undo').addEventListener('click', async () => {
  $('undo').disabled = true;
  try {
    const result = await nativeRequest('organize-undo', { id: currentJob.id });
    status(`已撤销 ${result.count} 张改名。`);
    $('undo').hidden = true;
    $('review').hidden = true;
    await refreshFolder();
  } catch (error) { status(error.message, true); }
  finally { $('undo').disabled = false; }
});

window.addEventListener('unload', () => { if (timer) clearTimeout(timer); });
refreshFolder().then(async count => {
  if (!count) status('还没有待整理的截图。');
  try {
    currentJob = (await nativeRequest('organize-status')).job;
    if (['running', 'review', 'applied'].includes(currentJob.status)) await poll();
  } catch { /* No earlier job. */ }
}).catch(error => status(error.message, true));
