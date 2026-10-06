/*
 * 맥다운 몸짓들
 *
 *   메뉴 막대      앞에 선 앱의 이름(굵게)과 그 앱의 메뉴(파일, 셸, 제어, 윈도우, 도움말)
 *   단축키         ⌥W 창 닫기, ⌥M 최소화, ⌥H 가리기, ⌥Q 종료, ⌥⇥ 앱 전환, ⌥↑ Mission Control
 *                  (브라우저가 ⌘W, ⌘Q, ⌘M, ⌘Tab 을 먼저 가져가므로 ⌥ 로 쓴다)
 *   앱 전환기      ⌥ 를 누른 채 ⇥ 로 떠 있는 앱을 고르고, ⌥ 를 떼면 그 앱이 앞으로
 *   Mission Control 떠 있는 창을 한 화면에 펼쳐 놓고 하나를 고른다
 *   Dock 확대      마우스 가까운 아이콘일수록 물결처럼 커진다
 *   정보 가져오기   데스크톱 아이콘, 앱의 정보 창, 아이콘 이름 바꾸기
 *   알림 센터      시계를 누르면 뜨는 판 위쪽에 지나간 알림
 *   바쁨 표시      앱을 불러오느라 늦어지면 마우스 자리에 무지개 공이 돈다
 */
import {
  DESKTOP,
  frontWindow,
  focusWindow,
  openWindow,
  requestClose,
  minimizeWindow,
  restoreWindow,
  setupWindow,
  setCloser,
  closeWindow,
  notify,
  notificationHistory,
  clearNotifications,
} from './windows.js';
import { APPS, appOf } from './apps.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const workspace = $('#workspace');

// ── 창 ──────────────────────────────────────────────────────────
const openWindows = () =>
  $$('[data-window]').filter((w) => w.isConnected && !w.closest('.dock') && !w.classList.contains('is-closed') && w.dataset.window !== 'alert');
const isMinimized = (w) => w.classList.contains('is-minimized');
const byRecent = (list) => [...list].sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0));
const windowsOf = (app) => byRecent(openWindows().filter((w) => appOf(w) === app));

function titleOf(win) {
  const id = win.getAttribute('aria-labelledby');
  return (id && document.getElementById(id)?.textContent.trim()) || APPS[appOf(win)].name;
}

/** 앱을 앞으로: 가장 최근 창을 앞으로(모두 최소화돼 있으면 하나를 되살린다). 창이 없으면 연다. */
export function activateApp(key) {
  const wins = windowsOf(key);
  const shown = wins.find((w) => !isMinimized(w));
  if (shown) return openWindow(shown);
  if (wins[0]) return restoreWindow(wins[0]);
  launchApp(key);
}

/** 앱 열기(Dock 의 단추를 누른 것처럼). */
export function launchApp(key) {
  const app = APPS[key];
  if (key === 'druid') {
    dispatchEvent(new CustomEvent('ephemeris:druid', { detail: { href: '/druid/' } }));
    return;
  }
  if (key === 'calendar') {
    dispatchEvent(new CustomEvent('ephemeris:calendar'));
    return;
  }
  if (key === 'system') {
    location.href = '/about/';
    return;
  }
  if (app.dock) $(app.dock)?.click();
  else if (key === 'preview') activateApp('finder');
}

// ── 메뉴 막대: 앞에 선 앱 ───────────────────────────────────────
let front = 'finder';

function syncMenubar() {
  const win = frontWindow();
  front = win ? appOf(win) : 'finder';
  const app = APPS[front];
  const nameEl = $('[data-app-name]');
  if (nameEl) nameEl.textContent = app.name;
  const label = (k, text) => {
    const el = $(`[data-app-label="${k}"]`);
    if (el) el.textContent = text;
  };
  // '이 Mac에 관하여'는 이름이 이미 About 으로 시작하므로 겹쳐 쓰지 않는다
  label('about', front === 'system' ? app.name : `About ${app.name}`);
  label('hide', `Hide ${app.name}`);
  label('quit', `Quit ${app.name}`);
  // Finder 는 맥처럼 끌 수 없다
  const quit = $('[data-cmd="app-quit"]');
  if (quit) quit.setAttribute('aria-disabled', String(front === 'finder'));
  for (const m of $$('[data-app-menu]')) {
    const list = m.dataset.appMenu;
    m.hidden = !(list === '*' || list.split(' ').includes(front));
  }
  for (const it of $$('[data-only]')) it.hidden = !it.dataset.only.split(' ').includes(front);
  renderWindowList();
  syncDockTiles();
}

// 윈도우 메뉴 아래쪽: 떠 있는 창 목록(누르면 그 창으로)
function renderWindowList() {
  const box = $('[data-window-list]');
  if (!box) return;
  const wins = byRecent(openWindows());
  const top = frontWindow();
  $('[data-window-list-sep]').hidden = !wins.length;
  box.innerHTML = wins
    .map(
      (w, i) => `<button class="menu__item" role="menuitemradio" aria-checked="${w === top}" type="button" data-cmd="focus-win" data-i="${i}">
        <span class="menu__text">${esc(titleOf(w))}</span><span class="menu__meta">${esc(APPS[appOf(w)].name)}${isMinimized(w) ? ' (Minimized)' : ''}</span>
      </button>`,
    )
    .join('');
  box.wins = wins;
}

addEventListener('ephemeris:focus', syncMenubar);

// ── 명령 ────────────────────────────────────────────────────────
const COMMANDS = {
  close: () => {
    const w = frontWindow();
    if (w) requestClose(w);
  },
  minimize: () => {
    const w = frontWindow();
    if (w && DESKTOP.matches) minimizeWindow(w);
  },
  zoom: () => frontWindow()?.querySelector('[data-window-action="zoom"]:not([disabled])')?.click(),
  'app-hide': () => {
    if (!DESKTOP.matches) return;
    for (const w of windowsOf(front)) if (!isMinimized(w)) minimizeWindow(w);
  },
  'app-quit': () => {
    if (front === 'finder') {
      notify("Finder can't be quit.", { title: 'Finder', icon: APPS.finder.icon });
      return;
    }
    for (const w of windowsOf(front)) requestClose(w);
  },
  'app-about': () => {
    const app = APPS[front];
    showInfo({ name: app.name, icon: app.icon, kind: 'Application', rows: [['Description', app.about]] });
  },
  'new-tab': () => {
    const w = frontWindow();
    const href = w?.querySelector('.druid__pop')?.href || w?.dataset.href || location.href;
    window.open(href, '_blank', 'noopener');
  },
  spotlight: () => $('[data-open-spotlight]')?.click(),
  'term-clear': () => dispatchEvent(new Event('ephemeris:term-clear')),
  'music-play': () => $('.window.music [data-music-play]')?.click(),
  'music-next': () => $('.window.music [data-music-next]')?.click(),
  'music-prev': () => $('.window.music [data-music-prev]')?.click(),
  mission: () => missionControl(),
  switcher: () => {
    switcherStep(1);
    // 메뉴로 열었으면 ⌥ 를 떼는 순간이 없으니 잠시 보여 주고 고른다
    setTimeout(commitSwitcher, 900);
  },
  shortcuts: () =>
    showInfo({
      name: 'Keyboard Shortcuts',
      icon: APPS.finder.icon,
      kind: 'Help',
      rows: [
        ['⌘K', 'Spotlight Search'],
        ['⌥⇥', 'Switch apps (hold ⌥ and press ⇥ to choose)'],
        ['⌥↑', 'Mission Control'],
        ['⌥W', 'Close Window'],
        ['⌥M', 'Minimize Window'],
        ['⌥H', 'Hide App'],
        ['⌥Q', 'Quit App'],
        ['⌥ instead of ⌘', 'The browser takes ⌘W, ⌘Q and ⌘Tab first, so these use ⌥.'],
      ],
    }),
};

document.addEventListener('click', (e) => {
  const item = e.target.closest('[data-cmd]');
  if (!item || item.getAttribute('aria-disabled') === 'true') return;
  if (item.dataset.cmd === 'focus-win') {
    const w = $('[data-window-list]').wins?.[Number(item.dataset.i)];
    if (w) (isMinimized(w) ? restoreWindow(w) : openWindow(w));
    return;
  }
  COMMANDS[item.dataset.cmd]?.();
});

// ── 단축키 ──────────────────────────────────────────────────────
const KEYS = { KeyW: 'close', KeyM: 'minimize', KeyH: 'app-hide', KeyQ: 'app-quit', ArrowUp: 'mission' };

document.addEventListener(
  'keydown',
  (e) => {
    if (!e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.code === 'Tab') {
      e.preventDefault();
      switcherStep(e.shiftKey ? -1 : 1);
      return;
    }
    if (switcher && e.key === 'Escape') {
      e.preventDefault();
      closeSwitcher();
      return;
    }
    const cmd = KEYS[e.code];
    // 입력 칸 안에서도 먹는다(맥의 ⌘W 처럼). ⌥ 로 치는 특수 문자(µ, ∑ 따위)는 포기한다.
    if (!cmd) return;
    e.preventDefault();
    COMMANDS[cmd]();
  },
  true,
);
document.addEventListener('keyup', (e) => {
  if (e.key === 'Alt' && switcher) commitSwitcher();
});
addEventListener('blur', () => closeSwitcher());

// ── 앱 전환기(⌥⇥) ───────────────────────────────────────────────
let switcher = null;

function runningApps() {
  const keys = [];
  for (const w of byRecent(openWindows())) {
    const k = appOf(w);
    if (!keys.includes(k)) keys.push(k);
  }
  if (!keys.includes('finder')) keys.push('finder'); // Finder 는 늘 떠 있다
  return keys;
}

function switcherStep(dir) {
  if (!switcher) {
    const keys = runningApps();
    const el = document.createElement('div');
    el.className = 'switcher glass';
    el.setAttribute('role', 'listbox');
    el.setAttribute('aria-label', 'App Switcher');
    el.innerHTML = keys
      .map((k) => `<div class="switcher__app" role="option" data-app="${k}"><img src="${APPS[k].icon}" alt="" width="72" height="72" draggable="false"><span>${esc(APPS[k].name)}</span></div>`)
      .join('');
    el.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-app]');
      if (!opt) return;
      switcher.index = keys.indexOf(opt.dataset.app);
      commitSwitcher();
    });
    document.body.append(el);
    switcher = { el, keys, index: 0 };
  }
  const n = switcher.keys.length;
  switcher.index = (switcher.index + dir + n) % n;
  $$('.switcher__app', switcher.el).forEach((o, i) => o.setAttribute('aria-selected', String(i === switcher.index)));
}

function commitSwitcher() {
  if (!switcher) return;
  const key = switcher.keys[switcher.index];
  closeSwitcher();
  activateApp(key);
}

function closeSwitcher() {
  switcher?.el.remove();
  switcher = null;
}

// ── Mission Control ─────────────────────────────────────────────
let mission = null;

function missionControl() {
  if (mission) return leaveMission();
  if (!DESKTOP.matches) return;
  const wins = byRecent(openWindows().filter((w) => !isMinimized(w)));
  if (!wins.length) {
    notify('No open windows.', { title: 'Mission Control', icon: APPS.finder.icon });
    return;
  }
  const ws = workspace.getBoundingClientRect();
  const dock = $('[data-dock]')?.getBoundingClientRect();
  const H = (dock ? dock.top : ws.bottom) - ws.top - 30;
  const W = ws.width;
  const n = wins.length;
  const cols = Math.max(1, Math.round(Math.sqrt((n * W) / H)));
  const rows = Math.ceil(n / cols);
  const gap = 36;
  const cellW = (W - gap * (cols + 1)) / cols;
  const cellH = (H - gap * (rows + 1)) / rows - 22;

  const veil = document.createElement('div');
  veil.className = 'mission-veil';
  workspace.append(veil);
  document.documentElement.classList.add('is-mission');
  const labels = [];

  wins.forEach((w, i) => {
    const r = w.getBoundingClientRect();
    const col = i % cols;
    const row = Math.floor(i / cols);
    // 마지막 줄은 가운데로 모은다
    const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
    const offset = ((cols - inRow) * (cellW + gap)) / 2;
    const cx = offset + gap + col * (cellW + gap) + cellW / 2;
    const cy = gap + row * (cellH + 22 + gap) + cellH / 2;
    const k = Math.min(0.92, cellW / r.width, cellH / r.height);
    const tx = cx - (r.left - ws.left + r.width / 2);
    const ty = cy - (r.top - ws.top + r.height / 2);
    w.style.transition = reducedMotion.matches ? 'none' : 'transform 0.42s cubic-bezier(0.2, 0.8, 0.2, 1)';
    w.style.transformOrigin = '50% 50%';
    w.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
    const label = document.createElement('div');
    label.className = 'mission-label';
    label.textContent = titleOf(w);
    label.style.left = `${cx}px`;
    label.style.top = `${cy + (r.height * k) / 2 + 10}px`;
    workspace.append(label);
    labels.push(label);
  });

  const onClick = (e) => {
    const w = e.target.closest?.('[data-window]');
    e.preventDefault();
    e.stopPropagation();
    leaveMission(w && wins.includes(w) ? w : null);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      leaveMission();
    }
  };
  workspace.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
  mission = { wins, veil, labels, onClick, onKey };
}

function leaveMission(pick = null) {
  if (!mission) return;
  const { wins, veil, labels, onClick, onKey } = mission;
  mission = null;
  workspace.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKey, true);
  document.documentElement.classList.remove('is-mission');
  veil.classList.add('is-leaving');
  labels.forEach((l) => l.remove());
  for (const w of wins) w.style.transform = '';
  setTimeout(() => {
    veil.remove();
    for (const w of wins) {
      w.style.transition = '';
      w.style.transformOrigin = '';
    }
  }, reducedMotion.matches ? 0 : 440);
  if (pick) focusWindow(pick);
}

// ── Dock: 확대와 떠 있는 앱 ─────────────────────────────────────
// 맥의 '확대'처럼 마우스에 가까운 아이콘일수록 커진다(가장 가까운 것이 1.55배).
// 아이콘의 자리(레이아웃)는 그대로 두고 scale 로 키우고, 커진 만큼 이웃을
// translate 로 밀어내고, 판만 양옆으로 늘인다. 크기를 바꾸면 움직일 때마다
// 레이아웃과 그림을 새로 해야 하지만, 이 값들은 합성기(GPU)가 맡는다.
// 마우스 아래의 점은 그 자리에 머물고 나머지가 양쪽으로 비켜선다.
// 마우스 이벤트는 프레임마다 한 번으로 모으고, 값은 요소에 바로 넣는다
// (CSS 변수로 주면 Dock 안의 모든 요소가 물려받아 스타일을 다시 계산한다).
const dockBar = $('.dock__bar');
const dockPlate = $('.dock__plate');
if (dockBar && dockPlate) {
  const MAX = 1.55;
  let items = null; // 확대 전 자리: [{ app, icon, tip, left, w, sep }] (판 왼쪽 끝 기준)
  let barLeft = 0;
  let x = 0;
  let raf = 0;
  let entering = 0;
  // 구분선도 함께 밀려나야 하므로 같이 잰다(커지지는 않는다).
  const TILES = '.dock__app, .dock__sep';
  // offsetLeft 는 translate 를 무시하므로, 밀려나 있는 동안 재도 확대 전 자리다.
  const measure = () => {
    barLeft = dockBar.getBoundingClientRect().left;
    items = $$(TILES, dockBar).map((app) => {
      let left = 0;
      for (let n = app; n && n !== dockBar; n = n.offsetParent) left += n.offsetLeft;
      const sep = app.classList.contains('dock__sep');
      return { app, icon: $('.dock__icon', app), tip: $('.dock__tip', app), left, w: app.offsetWidth, sep };
    });
  };
  const apply = () => {
    raf = 0;
    if (!items || items.length !== dockBar.querySelectorAll(TILES).length) measure();
    const px = x - barLeft;
    const reach = (items.find((it) => !it.sep)?.w || 62) * 2.6;
    // 커진 만큼(e)을 왼쪽부터 쌓는다. at = 마우스 자리 왼쪽에 쌓인 양.
    let sum = 0;
    let at = 0;
    const grown = items.map((it) => {
      const d = Math.abs(px - (it.left + it.w / 2));
      const g = d < reach ? (Math.cos((d / reach) * Math.PI) + 1) / 2 : 0;
      const s = it.sep ? 1 : 1 + (MAX - 1) * g;
      const e = it.w * (s - 1);
      if (px >= it.left + it.w) at = sum + e;
      else if (px > it.left) at = sum + e * ((px - it.left) / it.w);
      const dx = sum + e / 2;
      sum += e;
      return { it, s, dx };
    });
    for (const { it, s, dx } of grown) {
      it.app.style.translate = `${(dx - at).toFixed(1)}px 0`;
      if (it.icon) it.icon.style.scale = s.toFixed(3);
      if (it.tip) it.tip.style.translate = `0 ${((1 - s) * it.w).toFixed(1)}px`;
    }
    dockPlate.style.left = `${(-at).toFixed(1)}px`;
    dockPlate.style.right = `${(at - sum).toFixed(1)}px`;
  };
  const reset = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    clearTimeout(entering);
    dockBar.classList.remove('is-magnifying', 'is-entering');
    for (const app of $$(TILES, dockBar)) {
      app.style.removeProperty('translate');
      $('.dock__icon', app)?.style.removeProperty('scale');
      $('.dock__tip', app)?.style.removeProperty('translate');
    }
    dockPlate.style.removeProperty('left');
    dockPlate.style.removeProperty('right');
    items = null;
  };
  // 들어올 때만 0.12초 동안 부드럽게 커지고, 그 뒤로는 마우스를 바로 좇는다.
  dockBar.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || reducedMotion.matches || !DESKTOP.matches) return;
    if (document.documentElement.dataset.dockMagnify === 'off') return;
    x = e.clientX;
    if (!dockBar.classList.contains('is-magnifying')) {
      dockBar.classList.add('is-magnifying', 'is-entering');
      clearTimeout(entering);
      entering = setTimeout(() => dockBar.classList.remove('is-entering'), 120);
    }
    if (!raf) raf = requestAnimationFrame(apply);
  }, { passive: true });
  dockBar.addEventListener('pointerleave', reset);
}

// 떠 있는데 Dock 에 자리가 없는 앱(미리보기 · Apache Druid · 캘린더): 창이 떠 있는 동안 Dock 에 칸이 생긴다.
function syncDockTiles() {
  const list = $('.dock__apps');
  if (!list) return;
  for (const [key, app] of Object.entries(APPS)) {
    if (app.dock || key === 'finder' || key === 'system') continue;
    const running = windowsOf(key).length > 0;
    let li = $(`[data-dock-extra="${key}"]`);
    if (running && !li) {
      li = document.createElement('li');
      li.dataset.dockExtra = key;
      li.innerHTML = `<button class="dock__app is-running" type="button" aria-label="${esc(app.name)}">
        <img class="dock__icon" src="${app.icon}" alt="" draggable="false"><span class="dock__tip" aria-hidden="true">${esc(app.name)}</span></button>`;
      li.firstElementChild.addEventListener('click', () => activateApp(key));
      list.append(li);
    } else if (!running && li) li.remove();
  }
  // 떠 있는 앱의 점(메뉴 막대와 같은 때에 맞춘다)
  for (const [key, app] of Object.entries(APPS)) {
    if (!app.dock || key === 'finder') continue;
    $(app.dock)?.classList.toggle('is-running', windowsOf(key).length > 0);
  }
  fitDock();
}

// 폰: 보이는 칸 수에 맞춰 아이콘 크기를 정해 Dock 이 화면 밖으로 넘치지 않게 한다(_desktop.scss).
function fitDock() {
  const dock = $('[data-dock]');
  if (!dock) return;
  const tiles = $$('.dock__app', dock).filter((a) => a.getClientRects().length).length;
  dock.style.setProperty('--dock-tiles', String(tiles + 0.3));
}
DESKTOP.addEventListener('change', fitDock);
new MutationObserver(() => syncDockTiles()).observe(workspace || document.body, { childList: true });

// ── 정보 가져오기 ───────────────────────────────────────────────
let infoCount = 0;
export function showInfo({ name, icon, kind = '', rows = [] }) {
  const id = `info-title-${++infoCount}`;
  const el = document.createElement('section');
  el.className = 'window info';
  el.dataset.window = 'info';
  el.dataset.dynamic = '';
  el.tabIndex = -1;
  el.setAttribute('aria-labelledby', id);
  el.innerHTML = `
    <header class="info__bar" data-window-drag>
      <div class="traffic" role="group" aria-label="Window controls">
        <button class="traffic__btn traffic__btn--close" type="button" data-window-action="close" aria-label="Close"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg></button>
        <button class="traffic__btn traffic__btn--min" type="button" data-window-action="minimize" aria-label="Minimize"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-minus"/></svg></button>
        <button class="traffic__btn traffic__btn--zoom" type="button" aria-label="Zoom" disabled><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-zoom"/></svg></button>
      </div>
      <h2 class="info__title" id="${id}">${esc(name)} Info</h2>
    </header>
    <div class="info__body">
      <div class="info__head"><img src="${esc(icon)}" alt="" width="56" height="56" draggable="false"><div><p class="info__name">${esc(name)}</p><p class="info__kind">${esc(kind)}</p></div></div>
      <dl class="info__list">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    </div>`;
  el.style.setProperty('--nudge', `${(infoCount % 5) * 24}px`);
  workspace.append(el);
  setupWindow(el);
  setCloser(el, (w) => closeWindow(w, { remove: true }));
  focusWindow(el);
  return el;
}

// 데스크톱 아이콘의 정보
export function iconInfo(icon) {
  const label = icon.querySelector('.desktop-icon__label, .ficon__label')?.textContent.trim() || '';
  const img = icon.querySelector('img')?.src || APPS.finder.icon;
  if (icon.hasAttribute('data-druid')) {
    showInfo({
      name: label,
      icon: img,
      kind: 'Application',
      rows: [
        ['Where', 'Desktop'],
        ['Opens', new URL(icon.getAttribute('href'), location.href).pathname],
        ['Description', APPS.druid.about],
      ],
    });
  } else {
    showInfo({
      name: label,
      icon: img,
      kind: 'Plain Text Document',
      rows: [
        ['Where', 'Desktop'],
        ['Opens', 'The “about me” note in Notes'],
        ['Description', 'An introduction to the person who writes this blog.'],
      ],
    });
  }
}

// ── 아이콘 이름 바꾸기 ──────────────────────────────────────────
// 바꾼 이름은 이 브라우저에만 남는다(데스크톱과 Finder 의 데스크탑 칸에 함께).
const NAMES_KEY = 'ephemeris:icon-names';
const readNames = () => {
  try {
    return JSON.parse(localStorage.getItem(NAMES_KEY) || '{}');
  } catch {
    return {};
  }
};
function applyNames() {
  const names = readNames();
  for (const a of $$('[data-desktop-icon], .ficon[href]')) {
    const href = a.getAttribute('href');
    const label = a.querySelector('.desktop-icon__label, .ficon__label');
    if (!label) continue;
    label.dataset.original ??= label.textContent;
    label.textContent = names[href] || label.dataset.original;
  }
}
applyNames();

export function renameIcon(icon) {
  const label = icon.querySelector('.desktop-icon__label');
  if (!label) return;
  const before = label.textContent;
  label.contentEditable = 'plaintext-only';
  label.spellcheck = false;
  label.classList.add('is-editing');
  label.focus();
  getSelection().selectAllChildren(label);
  // 고치는 동안에는 누르기, 끌기가 아이콘을 열거나 옮기지 않게
  const stopClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const stopPointer = (e) => e.stopPropagation();
  icon.addEventListener('click', stopClick, true);
  icon.addEventListener('pointerdown', stopPointer, true);
  icon.addEventListener('dblclick', stopClick, true);
  const done = (keep) => {
    label.removeAttribute('contenteditable');
    label.classList.remove('is-editing');
    label.removeEventListener('keydown', onKey);
    label.removeEventListener('blur', onBlur);
    setTimeout(() => {
      icon.removeEventListener('click', stopClick, true);
      icon.removeEventListener('pointerdown', stopPointer, true);
      icon.removeEventListener('dblclick', stopClick, true);
    }, 0);
    const text = label.textContent.replace(/\s+/g, ' ').trim();
    const names = readNames();
    const href = icon.getAttribute('href');
    if (keep && text && text !== label.dataset.original) names[href] = text;
    else if (keep && (!text || text === label.dataset.original)) delete names[href];
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(names));
    } catch {}
    if (!keep) label.textContent = before;
    applyNames();
  };
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      label.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      label.removeEventListener('blur', onBlur);
      done(false);
    }
  };
  const onBlur = () => done(true);
  label.addEventListener('keydown', onKey);
  label.addEventListener('blur', onBlur);
}

/** Finder 에서 보기: Finder 의 데스크탑 칸을 열고 그 아이콘을 고른다. */
export function revealInFinder(icon) {
  const finder = $('[data-window="finder"]');
  const href = icon.getAttribute('href');
  if (!finder) {
    location.href = '/?at=desktop';
    return;
  }
  openWindow(finder);
  $('[data-place="desktop"]', finder)?.click();
  for (const f of $$('.ficon', finder)) f.classList.toggle('is-selected', f.getAttribute('href') === href);
}

// ── 알림 센터 ───────────────────────────────────────────────────
function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function renderNotifications() {
  const list = $('[data-nc-list]');
  if (!list) return;
  const items = notificationHistory();
  // 잇달아 온 같은 알림은 한 장으로 묶는다(맥의 알림 묶기)
  const groups = [];
  for (const n of items) {
    const last = groups[groups.length - 1];
    if (last && last.title === n.title && last.text === n.text) last.times++;
    else groups.push({ ...n, times: 1 });
  }
  list.innerHTML = groups
    .map(
      (n) => `<li class="nc__item">
        <img class="nc__icon" src="${esc(n.icon || APPS.finder.icon)}" alt="" width="32" height="32" draggable="false">
        <div class="nc__text"><p class="nc__row"><b>${esc(n.title || 'Notification')}${n.times > 1 ? `<span class="nc__times">×${n.times}</span>` : ''}</b><time>${ago(n.at)}</time></p><p>${esc(n.text)}</p></div>
      </li>`,
    )
    .join('');
  // 알림이 없으면 알림 칸을 통째로 접는다(알림 센터에는 위젯만 남는다).
  $('[data-nc]').hidden = !items.length;
  $('[data-nc-empty]').hidden = items.length > 0;
  $('[data-nc-clear]').hidden = !items.length;
}
addEventListener('ephemeris:notify', renderNotifications);
addEventListener('ephemeris:popup', (e) => {
  if (e.detail === 'ncenter') renderNotifications();
});
$('[data-nc-clear]')?.addEventListener('click', (e) => {
  e.stopPropagation();
  clearNotifications();
});
renderNotifications();

// ── 바쁨 표시(무지개 공) ────────────────────────────────────────
// 앱을 불러오는 데 0.3초가 넘게 걸리면, 맥처럼 마우스 자리에 무지개 공이 돈다.
let busyCount = 0;
let busyTimer = 0;
let ball = null;
let lastPointer = { x: -100, y: -100 };
addEventListener('pointermove', (e) => {
  lastPointer = { x: e.clientX, y: e.clientY };
  if (ball) ball.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
}, { passive: true });

function showBall() {
  if (ball || !matchMedia('(pointer: fine)').matches) return;
  ball = document.createElement('div');
  ball.className = 'beachball';
  ball.setAttribute('aria-hidden', 'true');
  ball.style.transform = `translate(${lastPointer.x}px, ${lastPointer.y}px)`;
  document.body.append(ball);
  document.documentElement.classList.add('is-busy');
}

function hideBall() {
  ball?.remove();
  ball = null;
  document.documentElement.classList.remove('is-busy');
}

/** 일(promise)이 끝날 때까지 바쁨 표시. 약속을 그대로 돌려준다. */
export function busy(work) {
  busyCount++;
  clearTimeout(busyTimer);
  busyTimer = setTimeout(showBall, 300);
  return Promise.resolve(work).finally(() => {
    busyCount = Math.max(0, busyCount - 1);
    if (!busyCount) {
      clearTimeout(busyTimer);
      hideBall();
    }
  });
}

syncMenubar();
