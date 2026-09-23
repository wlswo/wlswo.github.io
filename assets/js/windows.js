/*
 * 창 관리자
 *
 * 맥의 창처럼: 제목 막대를 끌어 옮기고, 가장자리·모서리를 끌어 넓히고 줄인다.
 * 옮기거나 크기를 바꾼 자리(frame)는 창 종류마다 기억해 두었다가 다음에도 그
 * 자리에 연다. 신호등: 빨강 닫기, 노랑 Dock 으로 최소화, 초록 확대.
 *
 * 창은 여럿일 수 있다(첫 화면에서 글을 열면 Finder 위에 글 창이 겹쳐 뜬다).
 * 누른 창이 맨 앞으로 오고, 뒤에 있는 창은 신호등이 회색이 된다.
 *
 * 창을 화면 가장자리로 끌면 붙는다: 위 → 화면 가득, 왼쪽·오른쪽 → 반쪽,
 * 네 모서리 → 1/4. 끄는 동안 붙을 자리가 유리로 먼저 보인다. 붙은 창을 다시
 * 끌어내면 붙기 전의 크기로 돌아온다.
 */
import { refractAll } from './glass.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const DESKTOP = matchMedia('(min-width: 900px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const store = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch {}
  },
};

const workspace = $('#workspace');
const dockWindows = $('[data-dock-windows]');
const minimized = new Map(); // 창 → Dock 의 칸
const closers = new WeakMap(); // 창 → 닫을 때 할 일 (글 창은 docs.js 가 정한다)
const snapped = new WeakMap(); // 창 → 붙기 전의 자리
export const MIN = { finder: [560, 380], doc: [460, 360] };
const EDGES = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];
let order = []; // 뒤 → 앞

function animate(el, keyframes, opts) {
  if (reducedMotion.matches || !el.animate) return Promise.resolve();
  return el.animate(keyframes, { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)', ...opts }).finished.catch(() => {});
}

const isShown = (win) => win.isConnected && !win.classList.contains('is-closed') && !minimized.has(win);

// ── 앞뒤 ────────────────────────────────────────────────────────
/** 맨 앞에 떠 있는 창(닫히거나 최소화된 것은 빼고). */
export function frontWindow() {
  order = order.filter((w) => w.isConnected);
  for (let i = order.length - 1; i >= 0; i--) if (isShown(order[i])) return order[i];
  return null;
}

/** 창을 맨 앞으로. 뒤의 창들은 흐려진 신호등으로 물러난다. */
export function focusWindow(win) {
  if (!win) return;
  order = order.filter((w) => w !== win && w.isConnected);
  order.push(win);
  order.forEach((w, i) => {
    w.style.zIndex = String(2 + i);
    w.classList.toggle('is-front', w === win);
  });
  dispatchEvent(new CustomEvent('ephemeris:focus', { detail: { win } }));
}

function focusNext() {
  const next = frontWindow();
  if (next) focusWindow(next);
  else dispatchEvent(new CustomEvent('ephemeris:focus', { detail: { win: null } }));
}

// ── 자리(frame) ─────────────────────────────────────────────────
// 작업 공간(메뉴 막대 아래) 기준의 x·y·폭·높이. 여닫는 애니메이션(transform)이
// 돌고 있어도 흔들리지 않게 레이아웃 값으로 잰다(창의 offsetParent 는 작업 공간이다).
function frameOf(win) {
  return { x: win.offsetLeft, y: win.offsetTop, w: win.offsetWidth, h: win.offsetHeight };
}

export function setFrame(win, f) {
  win.classList.add('has-frame');
  win.style.setProperty('--x', `${Math.round(f.x)}px`);
  win.style.setProperty('--y', `${Math.round(f.y)}px`);
  win.style.setProperty('--w', `${Math.round(f.w)}px`);
  win.style.setProperty('--h', `${Math.round(f.h)}px`);
}

function readFrame(win) {
  return {
    x: parseFloat(win.style.getPropertyValue('--x')),
    y: parseFloat(win.style.getPropertyValue('--y')),
    w: parseFloat(win.style.getPropertyValue('--w')),
    h: parseFloat(win.style.getPropertyValue('--h')),
  };
}

const frameKey = (win) => `ephemeris:frame:${win.dataset.window}`;

function saveFrame(win) {
  // 새로 연 두 번째·세 번째 글 창은 첫 창에서 비껴 앉은 것이라 기억하지 않는다.
  if (win.classList.contains('has-frame') && !win.hasAttribute('data-cascade')) {
    store.set(frameKey(win), JSON.stringify(readFrame(win)));
  }
}

// 제목 막대(와 신호등) 44px 가 Dock 위에 남도록 창 윗변이 내려갈 수 있는 한계.
function maxTop(ws) {
  const dock = $('[data-dock]');
  const limit = dock ? dock.getBoundingClientRect().top - ws.top : ws.height;
  return Math.max(0, Math.min(ws.height, limit) - 44);
}

// Dock 위로 창이 쓸 수 있는 높이
function usableHeight(ws) {
  return maxTop(ws) + 44 - 12;
}

// 창이 화면 밖으로 빠지지 않게: 옆으로는 140px 는 보이고, 제목 막대는 잡을 수 있게.
function clampFrame(f, ws) {
  const x = Math.min(Math.max(f.x, -f.w + 140), ws.width - 140);
  const y = Math.min(Math.max(f.y, 0), maxTop(ws));
  return { ...f, x, y };
}

export function clearFrame(win) {
  win.classList.remove('has-frame');
  for (const k of ['--x', '--y', '--w', '--h']) win.style.removeProperty(k);
}

// 기억해 둔 자리가 지금 화면에 들어맞을 때만 쓴다(창 크기가 바뀌었을 수 있다).
function restoreFrame(win) {
  let f = null;
  try { f = JSON.parse(store.get(frameKey(win)) || 'null'); } catch {}
  if (!f || !DESKTOP.matches) {
    clearFrame(win); // 첫 그림 전에(frame-restore.html) 입혔지만 맞지 않았다면 걷는다
    return;
  }
  const ws = workspace.getBoundingClientRect();
  const [mw, mh] = MIN[win.dataset.window] || [320, 240];
  const fits =
    f.w >= mw && f.h >= mh && f.w <= ws.width + 40 && f.h <= ws.height &&
    f.x >= -f.w + 140 && f.x <= ws.width - 140 && f.y >= 0 && f.y <= maxTop(ws);
  if (fits) setFrame(win, f);
  else clearFrame(win);
}

// 숨은 창(최소화·닫힘) 안의 구체는 세워 둔다. 원래 멈춰 있던 것은 건드리지 않는다.
function holdOrbs(win, hold) {
  for (const orb of win.querySelectorAll('thinking-orb')) {
    if (hold && !orb.hasAttribute('paused')) {
      orb.dataset.held = '';
      orb.setAttribute('paused', '');
    } else if (!hold && orb.hasAttribute('data-held')) {
      delete orb.dataset.held;
      orb.removeAttribute('paused');
    }
  }
}

// ── 열기 · 닫기 · 최소화 ────────────────────────────────────────
// 창을 다른 사각형(Dock 칸, 목록의 한 줄)으로 빨려 들어가듯 줄인다(reverse 면 거기서 나온다).
export function flyTo(win, target, reverse = false) {
  const from = win.getBoundingClientRect();
  const to = target.getBoundingClientRect ? target.getBoundingClientRect() : target;
  const end = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`;
  const frames = [
    { transform: 'none', opacity: 1, transformOrigin: '0 0' },
    { transform: end, opacity: 0.15, transformOrigin: '0 0' },
  ];
  return animate(win, reverse ? frames.reverse() : frames, { duration: 460, easing: 'cubic-bezier(.5,0,.2,1)' });
}

function windowTitle(win) {
  const id = win.getAttribute('aria-labelledby');
  return (id && document.getElementById(id)?.textContent.trim()) || document.title;
}

export async function minimizeWindow(win) {
  if (minimized.has(win) || !dockWindows) return;
  const slot = document.createElement('li');
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'dock__window glass';
  tile.dataset.refract = 'clear';
  tile.innerHTML = '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-doc"/></svg><span class="dock__tip"></span>';
  $('.dock__tip', tile).textContent = windowTitle(win);
  tile.setAttribute('aria-label', `${windowTitle(win)} 창 다시 열기`);
  tile.addEventListener('click', () => restoreWindow(win));
  slot.append(tile);
  dockWindows.append(slot);
  refractAll(slot);
  minimized.set(win, slot);
  const hadFocus = win.contains(document.activeElement);
  await flyTo(win, tile);
  win.classList.add('is-minimized');
  holdOrbs(win, true);
  focusNext();
  if (hadFocus) tile.focus();
}

export async function restoreWindow(win) {
  const slot = minimized.get(win);
  if (!slot) return;
  minimized.delete(win);
  win.classList.remove('is-minimized');
  holdOrbs(win, false);
  focusWindow(win);
  await flyTo(win, slot.firstElementChild, true);
  slot.remove();
  win.focus({ preventScroll: true });
}

export async function closeWindow(win, { remove = false } = {}) {
  const hadFocus = win.contains(document.activeElement);
  await animate(win, [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.94' }], { duration: 220 });
  if (remove) {
    minimized.get(win)?.remove();
    minimized.delete(win);
    win.remove();
  } else {
    win.classList.add('is-closed');
    holdOrbs(win, true);
  }
  focusNext();
  // 초점이 사라진 창 안에 있었다면, 다음 창이나 창을 다시 열 수 있는 곳(Dock)으로 옮긴다.
  if (hadFocus) {
    const next = frontWindow();
    if (next) next.focus({ preventScroll: true });
    else ($('.dock__tab[aria-current]') ?? $('.dock__tab'))?.focus();
  }
}

/** 닫히거나 최소화된 창을 다시 띄운다. 떠 있으면 맨 앞으로만. */
export async function openWindow(win) {
  if (!win) return;
  if (minimized.has(win)) return restoreWindow(win);
  focusWindow(win);
  if (!win.classList.contains('is-closed')) return;
  win.classList.remove('is-closed');
  holdOrbs(win, false);
  await animate(win, [{ opacity: 0, scale: '0.94' }, { opacity: 1, scale: '1' }], { duration: 260 });
}

// 문서 창을 닫으면 글 목록으로. 목록에서 들어왔다면 그 목록(고른 카테고리,
// 스크롤 자리)으로 되돌아가고, 바깥에서 곧장 들어왔다면 첫 화면을 연다.
export function goBack(href) {
  let fromList = false;
  try {
    const ref = new URL(document.referrer);
    fromList = ref.origin === location.origin && ref.pathname === new URL(href, location.href).pathname;
  } catch {}
  if (fromList && history.length > 1) history.back();
  else location.href = href;
}

/** 닫기 단추·바탕 누르기·Esc 따위가 부르는 '이 창 닫기'. 창마다 할 일을 바꿀 수 있다. */
export function setCloser(win, fn) {
  closers.set(win, fn);
}

export function requestClose(win) {
  if (!win) return;
  const fn = closers.get(win);
  if (fn) return fn(win);
  if (win.dataset.closeHref) return goBack(win.dataset.closeHref);
  return closeWindow(win);
}

// ── 확대 ────────────────────────────────────────────────────────
function zoom(win, on = !win.classList.contains('is-zoomed'), { instant = false } = {}) {
  const before = win.getBoundingClientRect();
  win.classList.toggle('is-zoomed', on);
  $('[data-window-action="zoom"]', win)?.setAttribute('aria-pressed', String(on));
  if (!win.hasAttribute('data-cascade')) store.set(`ephemeris:zoom:${win.dataset.window}`, on ? '1' : '0');
  if (instant) return;
  const after = win.getBoundingClientRect();
  animate(
    win,
    [
      {
        transformOrigin: '0 0',
        transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})`,
      },
      { transformOrigin: '0 0', transform: 'none' },
    ],
    { duration: 380, easing: 'cubic-bezier(.2,.9,.25,1)' },
  );
}

// 끌기(옮기기·크기 바꾸기)를 시작할 때: 확대돼 있었다면 그 크기 그대로 풀고,
// 아직 CSS 가 정한 자리에 있다면 지금 자리를 frame 으로 옮겨 적는다.
function beginFrame(win) {
  const f = frameOf(win);
  if (win.classList.contains('is-zoomed')) {
    win.classList.remove('is-zoomed');
    $('[data-window-action="zoom"]', win)?.setAttribute('aria-pressed', 'false');
    if (!win.hasAttribute('data-cascade')) store.set(`ephemeris:zoom:${win.dataset.window}`, '0');
  }
  setFrame(win, f);
  return f;
}

function trackPointer(el, { start, move, end }) {
  let state = null;
  el.addEventListener('pointerdown', (e) => {
    if (!DESKTOP.matches || e.button !== 0) return;
    state = start(e);
    if (!state) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (state) move(state, e);
  });
  const stop = (e) => {
    if (!state) return;
    end(state, e);
    state = null;
  };
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
}

// ── 가장자리에 붙이기 ───────────────────────────────────────────
let preview = null;

function snapZone(e, ws) {
  const EDGE = 6;
  const CORNER = 80;
  const bottom = ws.top + usableHeight(ws);
  const left = e.clientX <= ws.left + EDGE;
  const right = e.clientX >= ws.right - EDGE;
  const top = e.clientY <= ws.top + EDGE;
  const high = e.clientY < ws.top + CORNER;
  const low = e.clientY > bottom - CORNER;
  if (left) return high ? 'tl' : low ? 'bl' : 'left';
  if (right) return high ? 'tr' : low ? 'br' : 'right';
  if (top) return 'fill';
  return null;
}

function snapFrame(zone, ws) {
  const H = usableHeight(ws);
  const W = ws.width;
  const half = (W - 18) / 2;
  const qh = (H - 6) / 2;
  switch (zone) {
    case 'fill': return { x: 6, y: 6, w: W - 12, h: H };
    case 'left': return { x: 6, y: 6, w: half, h: H };
    case 'right': return { x: W - 6 - half, y: 6, w: half, h: H };
    case 'tl': return { x: 6, y: 6, w: half, h: qh };
    case 'tr': return { x: W - 6 - half, y: 6, w: half, h: qh };
    case 'bl': return { x: 6, y: 12 + qh, w: half, h: qh };
    case 'br': return { x: W - 6 - half, y: 12 + qh, w: half, h: qh };
    default: return null;
  }
}

function showPreview(f) {
  if (!f) {
    preview?.classList.remove('is-visible');
    return;
  }
  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'snap-preview glass';
    preview.setAttribute('aria-hidden', 'true');
    workspace.append(preview);
  }
  preview.style.transform = `translate(${f.x}px, ${f.y}px)`;
  preview.style.width = `${f.w}px`;
  preview.style.height = `${f.h}px`;
  preview.classList.add('is-visible');
}

// ── 창 하나 준비하기 ────────────────────────────────────────────
/**
 * cascade:   이미 같은 종류의 창이 떠 있을 때, 그만큼 오른쪽 아래로 비껴 연다(px).
 * keepFrame: 이미 입혀 둔 자리를 그대로 쓴다(다른 창 자리에 바꿔 열 때).
 */
export function setupWindow(win, { cascade = 0, keepFrame = false } = {}) {
  const type = win.dataset.window;
  const resizable = type in MIN;
  if (keepFrame) {
    // 그대로
  } else if (cascade) {
    win.setAttribute('data-cascade', '');
    if (DESKTOP.matches) {
      requestAnimationFrame(() => {
        const ws = workspace.getBoundingClientRect();
        const f = frameOf(win);
        setFrame(win, clampFrame({ ...f, x: f.x + cascade, y: f.y + cascade }, ws));
      });
    }
  } else {
    if (resizable) restoreFrame(win);
    if (store.get(`ephemeris:zoom:${type}`) === '1') zoom(win, true, { instant: true });
  }

  // 누르거나 초점이 들어오면 맨 앞으로
  win.addEventListener('pointerdown', () => focusWindow(win), true);
  win.addEventListener('focusin', () => {
    if (!win.classList.contains('is-front')) focusWindow(win);
  });

  for (const btn of $$('[data-window-action]', win)) {
    btn.addEventListener('click', () => {
      const act = btn.dataset.windowAction;
      if (act === 'zoom') zoom(win);
      else if (act === 'minimize') minimizeWindow(win);
      else if (act === 'close') requestClose(win);
    });
  }

  // 좁은 화면의 '‹ 글 목록' 단추는 닫기와 같다.
  for (const back of $$('[data-back]', win)) {
    back.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      requestClose(win);
    });
  }

  // 옮기기: 제목 막대(와 Finder 사이드바 윗부분)를 끈다. 누르기만 하고 움직이지
  // 않았다면 아무 일도 없던 것이다 — 그래야 두 번 눌러 확대·복귀할 수 있다.
  for (const handle of $$('[data-window-drag]', win)) {
    trackPointer(handle, {
      start(e) {
        if (e.target.closest('button, a, input, label, select, textarea, [data-no-drag]')) return null;
        return { sx: e.clientX, sy: e.clientY, f: null, zone: null };
      },
      move(s, e) {
        const ws = workspace.getBoundingClientRect();
        if (!s.f) {
          if (Math.hypot(e.clientX - s.sx, e.clientY - s.sy) < 3) return;
          s.f = beginFrame(win);
          // 붙어 있던 창을 끌어내면 붙기 전 크기로, 손끝이 창의 같은 비율 자리에 오게.
          const pre = snapped.get(win);
          if (pre) {
            snapped.delete(win);
            const ratio = (s.sx - ws.left - s.f.x) / s.f.w;
            s.f = { ...s.f, w: pre.w, h: pre.h, x: s.sx - ws.left - ratio * pre.w };
            setFrame(win, s.f);
          }
          win.classList.add('is-dragging');
        }
        setFrame(win, clampFrame({ ...s.f, x: s.f.x + e.clientX - s.sx, y: s.f.y + e.clientY - s.sy }, ws));
        s.zone = resizable ? snapZone(e, ws) : null;
        showPreview(s.zone && snapFrame(s.zone, ws));
      },
      end(s) {
        win.classList.remove('is-dragging');
        showPreview(null);
        if (!s.f) return;
        if (s.zone) {
          const ws = workspace.getBoundingClientRect();
          snapped.set(win, { w: s.f.w, h: s.f.h });
          const target = snapFrame(s.zone, ws);
          const before = win.getBoundingClientRect();
          setFrame(win, target);
          const after = win.getBoundingClientRect();
          animate(
            win,
            [
              {
                transformOrigin: '0 0',
                transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})`,
              },
              { transformOrigin: '0 0', transform: 'none' },
            ],
            { duration: 320, easing: 'cubic-bezier(.2,.9,.25,1)' },
          );
        }
        saveFrame(win);
      },
    });
    handle.addEventListener('dblclick', (e) => {
      if (!DESKTOP.matches || e.target.closest('button, a, input, label')) return;
      zoom(win);
    });
  }

  // 크기 바꾸기: 네 변과 네 모서리. 최소 크기 아래로, 메뉴 막대 위로는 못 간다.
  if (resizable) {
    const [minW, minH] = MIN[type];
    for (const edge of EDGES) {
      const grip = document.createElement('div');
      grip.className = `window__grip window__grip--${edge}`;
      grip.setAttribute('aria-hidden', 'true');
      win.append(grip);
      trackPointer(grip, {
        start(e) {
          return { sx: e.clientX, sy: e.clientY, f: null };
        },
        move(s, e) {
          const dx = e.clientX - s.sx;
          const dy = e.clientY - s.sy;
          if (!s.f) {
            if (Math.hypot(dx, dy) < 3) return;
            s.f = beginFrame(win);
            snapped.delete(win);
            win.classList.add('is-resizing');
          }
          const ws = workspace.getBoundingClientRect();
          let { x, y, w, h } = s.f;
          if (edge.includes('e')) w = Math.min(Math.max(minW, s.f.w + dx), ws.width - x);
          if (edge.includes('s')) h = Math.min(Math.max(minH, s.f.h + dy), ws.height - y);
          if (edge.includes('w')) {
            x = Math.min(Math.max(s.f.x + dx, 0), s.f.x + s.f.w - minW);
            w = s.f.w + s.f.x - x;
          }
          if (edge.includes('n')) {
            y = Math.min(Math.max(s.f.y + dy, 0), s.f.y + s.f.h - minH, maxTop(ws));
            h = s.f.h + s.f.y - y;
          }
          setFrame(win, { x, y, w, h });
        },
        end(s) {
          win.classList.remove('is-resizing');
          if (s.f) saveFrame(win);
        },
      });
      grip.addEventListener('dblclick', () => zoom(win));
    }
  }

  focusWindow(win);
}

// ── 바탕 ────────────────────────────────────────────────────────
const popupOpen = () => !!document.querySelector('[data-menu].is-open, .calendar:not([hidden]), .context-menu');

if (workspace) {
  // 화면이 줄면 떠 있는 창을 화면 안으로 들인다. 기억한 자리는 그대로 두어,
  // 다시 넓어지면 원래 자리로 열린다.
  new ResizeObserver(() => {
    if (!DESKTOP.matches) return;
    const ws = workspace.getBoundingClientRect();
    for (const win of $$('[data-window].has-frame')) {
      const [mw, mh] = MIN[win.dataset.window] || [320, 240];
      const f = readFrame(win);
      const sized = {
        ...f,
        w: Math.max(mw, Math.min(f.w, ws.width - 12)),
        h: Math.max(mh, Math.min(f.h, ws.height - 12)),
      };
      const c = clampFrame(sized, ws);
      if (c.x !== f.x || c.y !== f.y || c.w !== f.w || c.h !== f.h) setFrame(win, c);
    }
  }).observe(workspace);

  // 바탕을 누르면 맨 앞의 창을 닫는다. 바탕에서 눌렀다가 바탕에서 뗀 경우만 —
  // 창 안에서 글자를 끌다가 바탕에서 뗀 것, 메뉴나 달력을 접으려고 누른 것은 아니다.
  let press = null;
  workspace.addEventListener('pointerdown', (e) => {
    press = e.target === workspace && e.button === 0 && !popupOpen() ? { x: e.clientX, y: e.clientY } : null;
  });
  workspace.addEventListener('click', (e) => {
    const p = press;
    press = null;
    if (!p || e.target !== workspace || !DESKTOP.matches) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) return;
    const win = frontWindow();
    if (!win || win.dataset.window === 'alert') return;
    requestClose(win);
  });

  // 바탕을 끌면 맥처럼 선택 상자가 그려지고, 상자에 걸친 데스크톱 폴더가 골라진다.
  // ⇧ 나 ⌘ 를 누른 채 끌면 이미 고른 것에 더한다.
  let box = null;
  let drag = null;
  const iconRects = () =>
    $$('[data-desktop-icon]').map((icon) => {
      const art = icon.querySelector('svg');
      const label = icon.querySelector('.desktop-icon__label');
      const a = (art ?? icon).getBoundingClientRect();
      const l = (label ?? icon).getBoundingClientRect();
      return { icon, left: Math.min(a.left, l.left), right: Math.max(a.right, l.right), top: a.top, bottom: l.bottom };
    });

  workspace.addEventListener('pointerdown', (e) => {
    if (e.target !== workspace || e.button !== 0 || e.pointerType === 'touch' || !DESKTOP.matches) return;
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      ws: workspace.getBoundingClientRect(),
      icons: iconRects(),
      keep: e.shiftKey || e.metaKey ? new Set($$('[data-desktop-icon].is-selected')) : new Set(),
      shown: false,
    };
  });
  workspace.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.shown) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      drag.shown = true;
      workspace.setPointerCapture(e.pointerId);
      box = document.createElement('div');
      box.className = 'marquee';
      box.setAttribute('aria-hidden', 'true');
      workspace.append(box);
    }
    const { ws } = drag;
    const x = Math.min(Math.max(e.clientX, ws.left), ws.right);
    const y = Math.min(Math.max(e.clientY, ws.top), ws.bottom);
    const left = Math.min(x, drag.x);
    const top = Math.min(y, drag.y);
    const right = Math.max(x, drag.x);
    const bottom = Math.max(y, drag.y);
    box.style.transform = `translate(${left - ws.left}px, ${top - ws.top}px)`;
    box.style.width = `${right - left}px`;
    box.style.height = `${bottom - top}px`;
    for (const r of drag.icons) {
      const hit = r.left < right && r.right > left && r.top < bottom && r.bottom > top;
      r.icon.classList.toggle('is-selected', hit || drag.keep.has(r.icon));
    }
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    drag = null;
    if (!box) return;
    const old = box;
    box = null;
    old.classList.add('is-leaving');
    setTimeout(() => old.remove(), reducedMotion.matches ? 0 : 160);
  };
  workspace.addEventListener('pointerup', endDrag);
  workspace.addEventListener('pointercancel', endDrag);
}

// 좁은 화면에는 Dock 의 창 단추도 신호등도 없다. 숨겨 둔 창을 모두 되돌린다.
DESKTOP.addEventListener('change', (e) => {
  if (e.matches) return;
  for (const win of [...minimized.keys()]) restoreWindow(win);
  for (const win of $$('[data-window].is-closed')) openWindow(win);
});

// 창 자리 고르기(메뉴): 끌지 않고도 맨 앞의 창을 채우거나 반으로 나눈다.
for (const item of $$('[data-window-preset]')) {
  item.addEventListener('click', () => {
    const win = frontWindow() ?? $('#main-window');
    if (!win || !(win.dataset.window in MIN) || !DESKTOP.matches) return;
    openWindow(win);
    zoom(win, false, { instant: true });
    snapped.delete(win);
    const preset = item.dataset.windowPreset;
    if (preset === 'default') {
      clearFrame(win);
      store.set(frameKey(win), 'null');
      return;
    }
    const ws = workspace.getBoundingClientRect();
    setFrame(win, snapFrame(preset, ws));
    saveFrame(win);
  });
}

// Finder 의 ◀ ▶: 브라우저의 뒤로·앞으로. 갈 곳이 없으면(알 수 있는 브라우저에서) 흐리게.
const historyButtons = $$('[data-history]');
function syncHistoryButtons() {
  const nav = window.navigation;
  for (const btn of historyButtons) {
    if (!nav) continue;
    btn.disabled = btn.dataset.history === 'back' ? !nav.canGoBack : !nav.canGoForward;
  }
}
for (const btn of historyButtons) {
  btn.addEventListener('click', () => (btn.dataset.history === 'back' ? history.back() : history.forward()));
}
window.navigation?.addEventListener('currententrychange', syncHistoryButtons);
syncHistoryButtons();

for (const btn of $$('[data-history-back]')) {
  btn.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.href = '/';
  });
}

// ── 알림 ────────────────────────────────────────────────────────
// 맥의 알림처럼 오른쪽 위에서 유리 판이 내려왔다가 사라진다(링크 복사 따위).
let toasts = null;
export function notify(text) {
  if (!toasts) {
    toasts = document.createElement('div');
    toasts.className = 'toasts';
    toasts.setAttribute('role', 'status');
    document.body.append(toasts);
  }
  const t = document.createElement('div');
  t.className = 'toast glass';
  t.dataset.refract = 'regular';
  t.textContent = text;
  toasts.append(t);
  refractAll(toasts);
  setTimeout(() => {
    t.classList.add('is-leaving');
    setTimeout(() => t.remove(), reducedMotion.matches ? 0 : 260);
  }, 2400);
}

// 페이지에 처음부터 있는 창들
$$('[data-window]').forEach((win) => setupWindow(win));
const main = $('#main-window');
if (main) focusWindow(main);
