import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

test('subtitle mask toggles and stays out of saved screenshots', async () => {
  const events = new Map();
  let rect = { left: 40, top: 60, right: 840, bottom: 510, x: 40, y: 60, width: 800, height: 450 };
  let tick;
  const video = {
    isConnected: true,
    paused: true,
    readyState: 3,
    currentTime: 12,
    getBoundingClientRect: () => rect,
  };
  const element = () => ({
    style: {},
    textContent: '',
    parentElement: null,
    handlers: {},
    dataset: {},
    children: [],
    setAttribute() {},
    setPointerCapture() {},
    addEventListener(type, listener) { this.handlers[type] = listener; },
    remove() {
      if (this.parentElement) {
        const siblings = this.parentElement.children;
        siblings.splice(siblings.indexOf(this), 1);
        this.parentElement.child = siblings.at(-1) || null;
      }
      this.parentElement = null;
    },
    append(child) { child.parentElement = this; this.children.push(child); this.child = child; },
  });
  const body = element();
  const document = {
    body,
    documentElement: element(),
    title: '英语视频_哔哩哔哩',
    fullscreenElement: null,
    pictureInPictureElement: null,
    querySelectorAll: () => [video],
    createElement: element,
    addEventListener(type, listener) { events.set(type, listener); },
    removeEventListener(type) { events.delete(type); },
  };
  let listener;
  const outgoing = [];
  const context = {
    document,
    window: { addEventListener() {}, removeEventListener() {} },
    chrome: { runtime: { onMessage: { addListener(callback) { listener = callback; } }, async sendMessage(message) { outgoing.push(message); return { ok: true }; } } },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    innerWidth: 1200,
    innerHeight: 800,
    visualViewport: null,
    location: { href: 'https://www.bilibili.com/video/test' },
    crypto: webcrypto,
    requestAnimationFrame: callback => callback(),
    setInterval: callback => { tick = callback; return 1; },
    clearInterval() {},
    setTimeout: () => 2,
    clearTimeout() {},
  };
  vm.runInNewContext(readFileSync(new URL('../english-clips/content.js', import.meta.url), 'utf8'), context);
  const send = message => new Promise(resolve => listener({ target: 'english-clips-page', ...message }, null, resolve));

  assert.equal((await send({ type: 'toggle-mask' })).active, true);
  const mask = body.child;
  const near = (actual, expected) => assert.ok(Math.abs(parseFloat(actual) - expected) < 0.01, `${actual} ≈ ${expected}px`);
  near(mask.style.left, 112);
  near(mask.style.top, 379);
  near(mask.style.width, 656);
  near(mask.style.height, 59);
  assert.equal(mask.textContent, '');
  assert.match(mask.style.cssText, /background:rgba\(255,255,255,\.8\)/);
  assert.match(mask.style.cssText, /backdrop-filter:blur\(12px\)/);
  near(510 - (parseFloat(mask.style.top) + parseFloat(mask.style.height)), 72);
  assert.equal((await send({ type: 'mask-state' })).active, true);

  const pointer = (target, clientX, clientY) => ({ button: 0, pointerId: 1, target, clientX, clientY, preventDefault() {} });
  mask.handlers.pointerdown(pointer(mask, 200, 400));
  mask.handlers.pointermove(pointer(mask, 220, 420));
  mask.handlers.pointerup(pointer(mask, 220, 420));
  near(mask.style.left, 132);
  near(mask.style.top, 399);
  const handle = edge => mask.children.find(child => child.dataset.edge === edge);
  for (const edge of ['top', 'bottom', 'left', 'right']) {
    assert.ok(handle(edge));
    assert.equal(handle(edge).children.length, 0);
    assert.match(handle(edge).style.cssText, /cursor:[nsew]-resize/);
  }
  const dragEdge = (edge, dx, dy) => {
    const target = handle(edge);
    mask.handlers.pointerdown(pointer(target, 400, 400));
    mask.handlers.pointermove(pointer(target, 400 + dx, 400 + dy));
    mask.handlers.pointerup(pointer(target, 400 + dx, 400 + dy));
  };
  dragEdge('right', 50, 0);
  near(mask.style.width, 706);
  near(mask.style.height, 59);
  dragEdge('bottom', 0, 20);
  near(mask.style.height, 79);
  near(mask.style.top, 399);
  dragEdge('left', 30, 0);
  near(mask.style.left, 162);
  near(mask.style.width, 676);
  near(parseFloat(mask.style.left) + parseFloat(mask.style.width), 838);
  dragEdge('top', 0, 10);
  near(mask.style.top, 409);
  near(mask.style.height, 69);
  near(parseFloat(mask.style.top) + parseFloat(mask.style.height), 478);

  let defaultMenuPrevented = false;
  mask.handlers.contextmenu({ clientX: 400, clientY: 420, preventDefault() { defaultMenuPrevented = true; }, stopPropagation() {} });
  assert.equal(defaultMenuPrevented, true);
  assert.equal(body.child.textContent, '关闭遮挡');

  const prepared = await send({ type: 'prepare', settings: { hideDanmaku: false } });
  assert.equal(prepared.ok, true);
  assert.equal(body.child, mask);
  assert.equal(mask.style.visibility, 'hidden');
  await send({ type: 'restore', token: prepared.data.token });
  assert.equal(mask.style.visibility, 'visible');
  assert.equal((await send({ type: 'set-mask', active: false })).active, false);
  assert.equal(mask.parentElement, null);
  assert.equal((await send({ type: 'set-mask', active: true })).active, true);
  assert.equal((await send({ type: 'set-mask', active: true })).active, true);
  near(body.child.style.left, 162);
  near(body.child.style.width, 676);

  rect = { left: 40, top: 60, right: 1040, bottom: 660, x: 40, y: 60, width: 1000, height: 600 };
  tick();
  near(body.child.style.left, 192.5);
  near(body.child.style.width, 845);
  const resizedMask = body.child;
  resizedMask.handlers.pointerdown(pointer(resizedMask, 500, 500));
  resizedMask.handlers.pointermove(pointer(resizedMask, 5000, 5000));
  resizedMask.handlers.pointerup(pointer(resizedMask, 5000, 5000));
  near(parseFloat(resizedMask.style.left) + parseFloat(resizedMask.style.width), 1040);
  near(parseFloat(resizedMask.style.top) + parseFloat(resizedMask.style.height), 660);

  resizedMask.handlers.contextmenu({ clientX: 1190, clientY: 790, preventDefault() {}, stopPropagation() {} });
  const menu = body.child;
  assert.equal(menu.textContent, '关闭遮挡');
  assert.ok(parseFloat(menu.style.cssText.match(/left:([\d.]+)px/)[1]) <= 1060);
  events.get('keydown')({ type: 'keydown', key: 'Escape' });
  assert.equal(menu.parentElement, null);
  assert.equal((await send({ type: 'mask-state' })).active, true);
  resizedMask.handlers.contextmenu({ clientX: 300, clientY: 400, preventDefault() {}, stopPropagation() {} });
  body.child.handlers.click({ stopPropagation() {} });
  assert.equal((await send({ type: 'mask-state' })).active, false);
  assert.equal(body.child, null);
  assert.equal(resizedMask.parentElement, null);

  await send({ type: 'notify', message: '保存文件夹需要授权。请打开拾句设置，点击“重新授权”或重新选择文件夹，再截图。', error: true });
  const notice = body.child;
  assert.equal(notice.textContent, '保存文件夹需要授权。请打开拾句');
  const settingsLink = notice.children[0];
  assert.equal(settingsLink.textContent, '设置');
  assert.match(settingsLink.style.cssText, /text-decoration:underline/);
  assert.equal(notice.children[1].textContent, '，点击“重新授权”或重新选择文件夹，再截图。');
  assert.match(notice.style.cssText, /pointer-events:auto/);
  await settingsLink.handlers.click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].type, 'open-options');
});
