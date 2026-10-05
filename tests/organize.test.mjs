import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('organizer previews complete short expressions and excerpts from long subtitles', () => {
  const source = '第一集_00-12-35_20260929-120000_abcd1234.jpg';
  const script = readFileSync(new URL('../english-clips/organize.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').split('async function loadThumbnail')[0];
  const context = { document: { getElementById() {} } };
  vm.runInNewContext(script, context);
  const preview = (phrase, subtitle) => vm.runInNewContext(
    `suggestedName(${JSON.stringify(source)}, ${JSON.stringify(phrase)}, ${JSON.stringify(subtitle)})`, context);

  assert.equal(preview('lift you up', 'I can lift you up today.'), 'lift you up_00-12-35.jpg');
  assert.equal(preview('a while ago', 'A while ago.'), 'a while ago_00-12-35.jpg');
  assert.equal(preview('I can lift you up today', 'I can lift you up today.'), 'I can lift you up today_00-12-35.jpg');
  assert.match(preview('one two three four five six seven', 'One two three four five six seven.'), /1 至 6 个英文词/);
  assert.match(preview('鼓励 lift you up', 'I can lift you up today.'), /英文词/);
  assert.match(preview('different words', 'I can lift you up today.'), /须使用字幕中的连续英文词/);
});

test('organizer presents the selected folder path', () => {
  const html = readFileSync(new URL('../english-clips/organize.html', import.meta.url), 'utf8');
  assert.match(html, /id="folder-path"/);
  assert.match(html, /id="reset-folder"/);
  assert.doesNotMatch(html, /id="group"/);
});

test('organizer chooses a folder without changing the capture folder', async () => {
  const handlers = new Map();
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', disabled: false, hidden: false,
      classList: { toggle() {} },
      addEventListener(type, handler) { handlers.set(`${id}:${type}`, handler); },
    });
    return elements.get(id);
  };
  const actions = [];
  const nativeRequest = async action => {
    actions.push(action);
    if (action === 'organize-folder') return { directory: '/tmp/当前截图', count: 38, custom: false };
    if (action === 'organize-choose-folder') return { directory: '/tmp/另一部剧', count: 5, custom: true };
    if (action === 'organize-use-save-folder') return { directory: '/tmp/当前截图', count: 38, custom: false };
    throw new Error('没有先前任务');
  };
  const code = readFileSync(new URL('../english-clips/organize.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '');
  vm.runInNewContext(code, {
    document: { getElementById: element }, nativeRequest,
    window: { addEventListener() {} }, setTimeout,
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(element('folder-path').textContent, '/tmp/当前截图');
  assert.equal(element('start').disabled, false);
  await handlers.get('folder:click')();
  assert.equal(element('folder-path').textContent, '/tmp/另一部剧');
  assert.equal(element('reset-folder').hidden, false);
  await handlers.get('reset-folder:click')();
  assert.equal(element('folder-path').textContent, '/tmp/当前截图');
  assert.equal(element('reset-folder').hidden, true);
  assert.deepEqual(actions, ['organize-folder', 'organize-status', 'organize-choose-folder', 'organize-use-save-folder']);
});

test('clicking a suggestion thumbnail opens and closes the full image preview', async () => {
  const elements = new Map();
  const createElement = () => ({
    children: [], handlers: {}, dataset: {}, disabled: false,
    append(...children) { this.children.push(...children); },
    replaceChildren() { this.children = []; },
    addEventListener(type, handler) { this.handlers[type] = handler; },
    setAttribute() {},
    showModal() { this.open = true; },
    close() { this.open = false; },
  });
  const element = id => {
    if (!elements.has(id)) elements.set(id, createElement());
    return elements.get(id);
  };
  const code = readFileSync(new URL('../english-clips/organize.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').split('async function poll')[0];
  const context = {
    document: { getElementById: element, createElement, createTextNode: text => text },
    nativeRequest: async () => ({ data: 'abc123' }),
  };
  vm.runInNewContext(code, context);
  vm.runInNewContext(`renderSuggestions({ id: 'job', status: 'review', directory: '/tmp/screenshots',
    suggestions: [{ source: '剧集_00-12-35_20260929-120000_abcd1234.jpg',
    subtitle: 'I can lift you up today.', phrase: 'lift you up', confidence: 'high' }] })`, context);
  await new Promise(resolve => setImmediate(resolve));

  const thumbnail = element('suggestions').children[0].children[0];
  assert.equal(thumbnail.disabled, false);
  thumbnail.handlers.click();
  assert.equal(element('image-preview').open, true);
  assert.equal(element('preview-image').src, 'data:image/jpeg;base64,abc123');
  assert.match(element('preview-subtitle').textContent, /I can lift you up today/);
  assert.match(element('preview-suggested').textContent, /lift you up_00-12-35\.jpg/);
  element('close-preview').handlers.click();
  assert.equal(element('image-preview').open, false);
});
