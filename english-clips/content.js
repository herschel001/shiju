(() => {
  if (globalThis.__englishClipsLoaded) return;
  globalThis.__englishClipsLoaded = true;
  let current = null;
  let toast = null;
  let subtitleMask = null;
  let maskTimer = null;
  let maskActive = false;
  let maskLayout = null;
  let maskDrag = null;
  let maskMenu = null;
  function restore(token) {
    if (!current || (token && current.token !== token)) return;
    const previous = current;
    current = null;
    clearTimeout(previous.timer);
    previous.style.remove();
    if (subtitleMask) subtitleMask.style.visibility = 'visible';
    updateMask();
    if (previous.resume && previous.video.isConnected && previous.video.paused) {
      try { Promise.resolve(previous.video.play()).catch(() => {}); } catch { /* The player may have navigated away. */ }
    }
  }
  function notify(message, error) {
    toast?.remove();
    toast = document.createElement('div');
    const settingsLabel = '拾句设置';
    const settingsIndex = message.indexOf(settingsLabel);
    if (settingsIndex < 0) toast.textContent = message;
    else {
      toast.textContent = message.slice(0, settingsIndex) + '拾句';
      const settingsLink = document.createElement('button');
      settingsLink.type = 'button';
      settingsLink.textContent = '设置';
      settingsLink.setAttribute('aria-label', '打开拾句设置');
      settingsLink.style.cssText = 'appearance:none;border:0;background:none;padding:0;color:inherit;font:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer;';
      settingsLink.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        try {
          const result = await chrome.runtime.sendMessage({ type: 'open-options' });
          if (!result?.ok) throw new Error(result?.error || '无法打开设置页');
        } catch {
          notify('无法打开设置页，请从扩展菜单进入。', true);
        }
      });
      const ending = document.createElement('span');
      ending.textContent = message.slice(settingsIndex + settingsLabel.length);
      toast.append(settingsLink);
      toast.append(ending);
    }
    toast.setAttribute('role', 'status');
    toast.style.cssText = `position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:12px 18px;border:1px solid ${error ? '#f9aaaa' : '#97cbbd'};border-radius:10px;background:#142d27;color:#fff;font:14px/1.6 sans-serif;max-width:min(620px,85vw);box-shadow:0 8px 30px #0003;pointer-events:${settingsIndex < 0 ? 'none' : 'auto'};`;
    (document.fullscreenElement || document.body).append(toast);
    const element = toast;
    setTimeout(() => element.remove(), error ? 7000 : 2200);
  }
  function videoElement() {
    const candidates = [...document.querySelectorAll('video, bwp-video')].map(video => {
      const rect = video.getBoundingClientRect();
      const style = getComputedStyle(video);
      const visible = style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
      const area = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)) * Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      return { video, area: visible ? area : 0 };
    }).filter(item => item.area > 10000).sort((a, b) => b.area - a.area);
    return candidates[0]?.video;
  }
  function updateMask() {
    if (!maskActive || !subtitleMask) return;
    const video = videoElement();
    if (!video) { subtitleMask.style.display = 'none'; return; }
    const rect = video.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) { subtitleMask.style.display = 'none'; return; }
    const host = document.fullscreenElement || document.body;
    if (subtitleMask.parentElement !== host) host.append(subtitleMask);
    if (!maskLayout) {
      const width = rect.width * 0.82;
      const height = Math.min(60, Math.max(28, rect.height * 0.1));
      const controlsSpace = Math.min(88, Math.max(40, rect.height * 0.12));
      const extraHeight = Math.min(30, controlsSpace - 40);
      const clearanceShift = Math.min(36, Math.round(rect.height * 0.07));
      maskLayout = { x: (rect.width - width) / (2 * rect.width), y: (rect.height - controlsSpace - height - clearanceShift) / rect.height, width: width / rect.width, height: (height + extraHeight) / rect.height };
    }
    subtitleMask.style.display = 'block';
    subtitleMask.style.left = `${rect.left + maskLayout.x * rect.width}px`;
    subtitleMask.style.top = `${rect.top + maskLayout.y * rect.height}px`;
    subtitleMask.style.width = `${maskLayout.width * rect.width}px`;
    subtitleMask.style.height = `${maskLayout.height * rect.height}px`;
  }
  function maskPointerDown(event) {
    if (event.button !== 0) return;
    const video = videoElement();
    if (!video || !maskLayout) return;
    const rect = video.getBoundingClientRect();
    maskDrag = { pointerId: event.pointerId, mode: event.target?.dataset?.edge || 'move', clientX: event.clientX, clientY: event.clientY, x: maskLayout.x * rect.width, y: maskLayout.y * rect.height, width: maskLayout.width * rect.width, height: maskLayout.height * rect.height };
    subtitleMask.setPointerCapture(event.pointerId);
    subtitleMask.style.cursor = { move: 'grabbing', top: 'n-resize', bottom: 's-resize', left: 'w-resize', right: 'e-resize' }[maskDrag.mode];
    event.preventDefault();
  }
  function maskPointerMove(event) {
    if (!maskDrag || event.pointerId !== maskDrag.pointerId) return;
    const video = videoElement();
    if (!video) return;
    const rect = video.getBoundingClientRect();
    const dx = event.clientX - maskDrag.clientX;
    const dy = event.clientY - maskDrag.clientY;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const minWidth = Math.min(100, rect.width);
    const minHeight = Math.min(28, rect.height);
    let left = clamp(maskDrag.x, 0, rect.width - minWidth);
    let right = clamp(maskDrag.x + maskDrag.width, left + minWidth, rect.width);
    let top = clamp(maskDrag.y, 0, rect.height - minHeight);
    let bottom = clamp(maskDrag.y + maskDrag.height, top + minHeight, rect.height);
    if (maskDrag.mode === 'move') {
      const width = right - left;
      const height = bottom - top;
      left = clamp(maskDrag.x + dx, 0, rect.width - width);
      top = clamp(maskDrag.y + dy, 0, rect.height - height);
      right = left + width;
      bottom = top + height;
    }
    if (maskDrag.mode === 'left') left = clamp(maskDrag.x + dx, 0, right - minWidth);
    if (maskDrag.mode === 'right') right = clamp(maskDrag.x + maskDrag.width + dx, left + minWidth, rect.width);
    if (maskDrag.mode === 'top') top = clamp(maskDrag.y + dy, 0, bottom - minHeight);
    if (maskDrag.mode === 'bottom') bottom = clamp(maskDrag.y + maskDrag.height + dy, top + minHeight, rect.height);
    maskLayout = { x: left / rect.width, y: top / rect.height, width: (right - left) / rect.width, height: (bottom - top) / rect.height };
    updateMask();
  }
  function maskPointerEnd(event) {
    if (maskDrag?.pointerId !== event.pointerId) return;
    maskDrag = null;
    if (subtitleMask) subtitleMask.style.cursor = 'grab';
  }
  function dismissMaskMenu(event) {
    if (event.type === 'pointerdown' && event.target === maskMenu) return;
    if (event.type === 'keydown' && event.key !== 'Escape') return;
    closeMaskMenu();
  }
  function closeMaskMenu() {
    maskMenu?.remove();
    maskMenu = null;
    document.removeEventListener('pointerdown', dismissMaskMenu, true);
    document.removeEventListener('keydown', dismissMaskMenu, true);
  }
  function showMaskMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    closeMaskMenu();
    maskMenu = document.createElement('button');
    maskMenu.type = 'button';
    maskMenu.textContent = '关闭遮挡';
    maskMenu.style.cssText = `position:fixed;left:${Math.min(Math.max(8, event.clientX), Math.max(8, innerWidth - 140))}px;top:${Math.min(Math.max(8, event.clientY), Math.max(8, innerHeight - 52))}px;z-index:2147483647;min-width:132px;padding:10px 14px;border:1px solid #dfe5e1;border-radius:8px;background:#fff;color:#193b32;box-shadow:0 8px 24px rgba(0,0,0,.18);font:14px/20px sans-serif;text-align:left;cursor:pointer;`;
    maskMenu.addEventListener('pointerdown', event => event.stopPropagation());
    maskMenu.addEventListener('click', event => { event.stopPropagation(); setMask(false); });
    (document.fullscreenElement || document.body).append(maskMenu);
    document.addEventListener('pointerdown', dismissMaskMenu, true);
    document.addEventListener('keydown', dismissMaskMenu, true);
  }
  function setMask(active) {
    if (active && !videoElement()) throw new Error('没有找到可见的 B 站视频，请先打开视频页面。');
    maskActive = active;
    if (active) {
      if (!subtitleMask) {
        subtitleMask = document.createElement('div');
        subtitleMask.setAttribute('aria-hidden', 'true');
        subtitleMask.style.cssText = 'position:fixed;z-index:2147483646;display:block;box-sizing:border-box;background:rgba(255,255,255,.8);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(25,59,50,.45);border-radius:5px;box-shadow:0 2px 10px rgba(0,0,0,.14);cursor:grab;touch-action:none;user-select:none;';
        const edges = {
          top: 'top:-6px;left:12px;right:12px;height:12px;cursor:n-resize;',
          bottom: 'bottom:-6px;left:12px;right:12px;height:12px;cursor:s-resize;',
          left: 'left:-6px;top:12px;bottom:12px;width:12px;cursor:w-resize;',
          right: 'right:-6px;top:12px;bottom:12px;width:12px;cursor:e-resize;',
        };
        for (const [edge, hitArea] of Object.entries(edges)) {
          const handle = document.createElement('div');
          handle.dataset.edge = edge;
          handle.style.cssText = `position:absolute;z-index:1;touch-action:none;${hitArea}`;
          subtitleMask.append(handle);
        }
        subtitleMask.addEventListener('pointerdown', maskPointerDown);
        subtitleMask.addEventListener('pointermove', maskPointerMove);
        subtitleMask.addEventListener('pointerup', maskPointerEnd);
        subtitleMask.addEventListener('pointercancel', maskPointerEnd);
        subtitleMask.addEventListener('contextmenu', showMaskMenu);
      }
      updateMask();
      if (!maskTimer) {
        maskTimer = setInterval(updateMask, 250);
        window.addEventListener('scroll', updateMask, true);
        window.addEventListener('resize', updateMask);
        document.addEventListener('fullscreenchange', updateMask);
      }
    } else {
      maskDrag = null;
      closeMaskMenu();
      clearInterval(maskTimer);
      maskTimer = null;
      window.removeEventListener('scroll', updateMask, true);
      window.removeEventListener('resize', updateMask);
      document.removeEventListener('fullscreenchange', updateMask);
      subtitleMask?.remove();
      subtitleMask = null;
    }
    return { ok: true, active: maskActive };
  }
  async function prepare(settings) {
    restore();
    toast?.remove();
    closeMaskMenu();
    if (document.pictureInPictureElement) throw new Error('请先退出画中画，再在网页播放器里截图。');
    if (visualViewport && (Math.abs(visualViewport.scale - 1) > 0.01 || Math.abs(visualViewport.offsetLeft) > 1 || Math.abs(visualViewport.offsetTop) > 1)) throw new Error('请先退出触控板放大状态，再截图。');
    const video = videoElement();
    if (!video) throw new Error('没有找到可见的 B 站视频。请先打开视频并播放，再截图。');
    if ('readyState' in video && video.readyState < 2) throw new Error('视频还在加载，请等画面出现后再截图。');
    const token = crypto.randomUUID();
    const style = document.createElement('style');
    style.textContent = '.bpx-player-control-wrap,.bpx-player-top-wrap,.bpx-player-toast-wrap,.bpx-player-state-wrap,.bpx-player-progress,.bilibili-player-video-control-wrap,.bilibili-player-video-top {visibility:hidden!important;}';
    if (settings.hideDanmaku) style.textContent += '.bpx-player-dm-wrap,.bilibili-player-video-danmaku,.bili-danmaku-x-dm {visibility:hidden!important;}';
    document.documentElement.append(style);
    const resume = video.paused === false && typeof video.pause === 'function' && typeof video.play === 'function';
    current = { token, video, style, resume, timer: setTimeout(() => restore(token), 5000) };
    if (resume) video.pause();
    if (subtitleMask) subtitleMask.style.visibility = 'hidden';
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = video.getBoundingClientRect();
    const meta = { token, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, viewport: { width: innerWidth, height: innerHeight }, title: document.title.replace(/_哔哩哔哩.*$/, ''), time: Number(video.currentTime) || 0, url: location.href };
    current.meta = meta;
    return meta;
  }
  function validate(token) {
    if (!current || current.token !== token || !current.video.isConnected || !current.meta || current.meta.url !== location.href) return false;
    const rect = current.video.getBoundingClientRect();
    const meta = current.meta;
    return innerWidth === meta.viewport.width && innerHeight === meta.viewport.height && ['x', 'y', 'width', 'height'].every(key => Math.abs(rect[key] - meta.rect[key]) < 1);
  }
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.target !== 'english-clips-page') return;
    if (message.type === 'prepare') {
      prepare(message.settings).then(data => respond({ ok: true, data })).catch(error => { restore(); respond({ ok: false, error: error.message }); });
      return true;
    }
    if (message.type === 'validate') respond({ ok: validate(message.token) });
    if (message.type === 'restore') { restore(message.token); respond({ ok: true }); }
    if (message.type === 'notify') { notify(message.message, message.error); respond({ ok: true }); }
    if (message.type === 'mask-state') respond({ ok: true, active: maskActive, available: Boolean(videoElement()) });
    if (message.type === 'toggle-mask') {
      try { respond(setMask(!maskActive)); }
      catch (error) { respond({ ok: false, error: error.message }); }
    }
    if (message.type === 'set-mask') {
      try { respond(setMask(Boolean(message.active))); }
      catch (error) { respond({ ok: false, error: error.message }); }
    }
  });
})();
