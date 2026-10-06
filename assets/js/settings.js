/*
 * 시스템 설정: macOS Tahoe 의 시스템 설정 앱
 *
 * Dock 의 톱니바퀴, 애플 메뉴의 '시스템 설정…', 바탕 메뉴의 '배경화면 변경…'이 연다
 * (desktop.js 가 이 모듈을 그때 불러온다). 왼쪽은 검색 칸과 사용자 줄, 그 아래 칸 목록,
 * 오른쪽은 고른 칸의 설정이다. 실제로 무언가 바뀌는 칸만 둔다:
 *   Wi-Fi          메뉴 막대의 Wi-Fi 메뉴와 같은 것(status.js 의 단추를 대신 누른다)
 *   배터리         저전력 모드(desktop.js 의 단추를 대신 누른다)
 *   일반 › 정보    이 블로그의 이름 · 글쓴이 · 글 수
 *   모양           자동 · 라이트 · 다크(theme.js)
 *   데스크톱과 Dock  Dock 크기 · 확대 · 점, 바탕의 폴더 · 위젯
 *   배경화면       그림 셋과 단색 몇 가지. 첫 그림 전 적용은 head.html · desktop.html 이 한다
 *   알림           방해 금지(제어 센터의 것을 대신 누른다)
 *
 * 상태는 원래 주인(메뉴 · 제어 센터 · theme.js)이 갖고, 여기서는 그것을 읽어 그리기만
 * 한다. 다른 곳에서 바꿔도 따라오도록 그 단추들의 속성 변화를 지켜본다.
 * 폰에서는 목록과 설정이 한 화면씩(메모 앱처럼).
 */
import {
  setupWindow,
  focusWindow,
  closeWindow,
  setCloser,
  openWindow,
  flyTo,
  DESKTOP,
  notificationHistory,
  clearNotifications,
} from './windows.js';
import { getAppearance, setAppearance } from './theme.js';
import { SITE } from './site.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const root = document.documentElement;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const store = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch {}
  },
  remove(k) {
    try { localStorage.removeItem(k); } catch {}
  },
};

let win = null;
let dockButton = null;
let view = 'appearance';
let trail = []; // 지나온 칸(뒤로 · 앞으로)
let at = -1;
let query = '';
let watcher = null;
let paintQueued = false;

// ── 그림 ────────────────────────────────────────────────────────
const use = (id) => `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const svg = (body) => `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true">${body}</svg>`;

// 칸 목록의 색 타일 안에 드는 흰 기호(SF Symbols 를 흉내 낸 선화 · 면)
const GLYPH = {
  wifi: use('wifi'),
  battery: svg('<rect x="2.4" y="6" width="13.2" height="8" rx="2.3"/><rect x="4.2" y="7.8" width="7.6" height="4.4" rx="1" fill="currentColor" stroke="none"/><path d="M17.4 8.7v2.6"/>'),
  general: use('gear'),
  appearance: use('theme-auto'),
  dock: svg('<rect x="2.6" y="3.4" width="14.8" height="13.2" rx="2.4"/><rect x="5.2" y="12" width="9.6" height="2.4" rx="1.2" fill="currentColor" stroke="none"/>'),
  wallpaper: svg('<rect x="2.6" y="3.6" width="14.8" height="12.8" rx="2.4"/><path d="m2.9 14 4.3-4.3 3.4 3.4 2.2-2.2 4.4 4.4"/><circle cx="13" cy="7.6" r="1.4" fill="currentColor" stroke="none"/>'),
  notifications: svg('<path d="M10 3.1a4.6 4.6 0 0 0-4.6 4.6v3L3.9 13.7h12.2l-1.5-3V7.7A4.6 4.6 0 0 0 10 3.1z" fill="currentColor"/><path d="M8.1 15.8a2 2 0 0 0 3.8 0"/>'),
  moon: svg('<path d="M15.4 12.8A6.6 6.6 0 0 1 7.2 4.6a6.6 6.6 0 1 0 8.2 8.2z" fill="currentColor"/>'),
  info: svg('<rect x="2.6" y="3.6" width="14.8" height="10" rx="1.8"/><path d="M1.4 16.4h17.2"/>'),
};

// 칸: 목록에 서는 차례대로. 무리(group)마다 사이가 벌어진다. keys 는 검색어.
const PANES = [
  { id: 'wifi', group: 0, label: 'Wi-Fi', tile: 'blue', keys: 'wifi wi-fi network internet wireless 와이파이 네트워크 인터넷' },
  { id: 'battery', group: 0, label: 'Battery', tile: 'green', keys: 'battery low power mode energy 배터리 저전력 전원' },
  { id: 'general', group: 1, label: 'General', tile: 'gray', keys: 'general about blog author posts 일반 정보 블로그' },
  { id: 'appearance', group: 1, label: 'Appearance', tile: 'black', keys: 'appearance dark mode light auto theme 모양 다크 라이트 테마 화면 모드' },
  { id: 'dock', group: 1, label: 'Desktop & Dock', tile: 'black', keys: 'desktop dock size magnification indicators widgets items 데스크톱 독 크기 확대 위젯' },
  { id: 'wallpaper', group: 1, label: 'Wallpaper', tile: 'cyan', keys: 'wallpaper background picture color linux commands grid 배경화면 배경 단색 색' },
  { id: 'notifications', group: 2, label: 'Notifications', tile: 'red', keys: 'notifications do not disturb focus dnd 알림 방해 금지 집중' },
];
const GROUPS = ['Network', 'System', 'Notifications'];
// 목록에 없는 하위 칸 → 목록에서 밝혀 둘 칸
const PARENT = { about: 'general' };
const TITLE = { about: 'About' };
// 바깥에서 부르는 이름(ephemeris:settings 의 detail.pane)
const ALIAS = { desktop: 'dock', 'desktop-dock': 'dock', theme: 'appearance', dnd: 'notifications', 'wi-fi': 'wifi' };

const paneOf = (id) => PANES.find((p) => p.id === id);
const titleOf = (id) => TITLE[id] || paneOf(id)?.label || '';
const validView = (id) => !!(paneOf(id) || PARENT[id]);
const NARROW = () => !DESKTOP.matches;

// 사용자 사진 자리: 잠금 화면 · About 창의 그 캐릭터(bot.js 가 눈을 움직인다)
const BOT = (cls) => `<svg class="bot ${cls}" viewBox="0 0 120 120" data-bot aria-hidden="true" focusable="false">
  <g class="bot__body" data-bot-head><circle cx="60" cy="60" r="56"/>
    <g class="bot__face" data-bot-face><g transform="rotate(7 60 55)">
      <rect class="bot__eye bot__eye--l" x="38.5" y="41" width="13" height="28" rx="6.5"/>
      <rect class="bot__eye bot__eye--r" x="65.5" y="41" width="13" height="28" rx="6.5"/>
    </g></g></g></svg>`;

const tile = (kind, glyph, size = '') => `<span class="settings__tile settings__tile--${kind}${size ? ` settings__tile--${size}` : ''}" aria-hidden="true">${glyph}</span>`;
// 켬/끔 스위치. 이름은 줄의 글자(labelId), 설명이 있으면 그것도(descId) 읽힌다.
const sw = (key, labelId, descId = '') =>
  `<button class="settings__switch" type="button" role="switch" aria-checked="false" aria-labelledby="${labelId}"${descId ? ` aria-describedby="${descId}"` : ''} data-set="${key}"><span></span></button>`;

// ── 남이 가진 상태 읽기 · 바꾸기 ────────────────────────────────
// 메뉴의 단추를 대신 누르면, 메뉴가 닫히며 초점을 메뉴 막대로 가져간다. 누른 뒤 돌려놓는다.
function press(el) {
  if (!el) return;
  const keep = document.activeElement;
  el.click();
  if (keep && keep !== document.activeElement && keep.isConnected) keep.focus({ preventScroll: true });
}

const wifiToggle = () => $('[data-wifi-toggle]');
const wifiOn = () => wifiToggle()?.getAttribute('aria-checked') !== 'false';

// 메뉴의 네트워크 목록(status.js 가 그린 것)을 그대로 읽는다
function networks(sel) {
  return $$(`${sel} [data-net]`).map((b) => ({
    name: b.dataset.net,
    joined: b.classList.contains('is-joined'),
    meta: $('.menu__meta', b)?.textContent.trim() || '',
    lock: !!$('.menu__lock', b),
    fan: $('.menu__net-icon', b)?.innerHTML || use('wifi'),
  }));
}

const PREFS = {
  magnify: { key: 'ephemeris:dock-magnify', data: 'dockMagnify' },
  dots: { key: 'ephemeris:dock-dots', data: 'dockDots' },
  items: { key: 'ephemeris:desktop-items', data: 'desktopItems' },
  widgets: { key: 'ephemeris:desktop-widgets', data: 'desktopWidgets' },
};

const STATE = {
  wifi: wifiOn,
  lowpower: () => root.classList.contains('is-still'),
  dnd: () => root.dataset.dnd === 'on',
  magnify: () => root.dataset.dockMagnify !== 'off',
  dots: () => root.dataset.dockDots !== 'off',
  items: () => root.dataset.desktopItems !== 'off',
  widgets: () => root.dataset.desktopWidgets !== 'off',
};

function toggle(key) {
  if (key === 'wifi') return press(wifiToggle());
  if (key === 'lowpower') return press($('[data-still-toggle]'));
  if (key === 'dnd') return press($('#menu-cc [data-cc="dnd"]'));
  const pref = PREFS[key];
  if (!pref) return;
  const on = !STATE[key]();
  // head.html 이 다음 쪽에서도 첫 그림 전에 같은 값을 입힌다
  if (on) delete root.dataset[pref.data];
  else root.dataset[pref.data] = 'off';
  store.set(pref.key, on ? 'on' : 'off');
  paint();
}

// ── Dock 크기 ───────────────────────────────────────────────────
const DOCK = { min: 44, max: 72, base: 62 };
function dockSize() {
  const v = Number(store.get('ephemeris:dock-size'));
  return v >= DOCK.min && v <= DOCK.max ? v : DOCK.base;
}
function setDockSize(v) {
  const n = Math.round(Math.min(DOCK.max, Math.max(DOCK.min, Number(v) || DOCK.base)));
  root.dataset.dockSize = '';
  root.style.setProperty('--dock-icon', `${n}px`);
  root.style.setProperty('--dock-k', String(n / DOCK.base));
  store.set('ephemeris:dock-size', String(n));
}

// ── 배경화면 ────────────────────────────────────────────────────
// head.html 의 첫 스크립트가 같은 표(이름 → 밝기)를 갖고 있다. 고치면 함께 고친다.
// tone: 메뉴 막대 글자를 어느 쪽에 맞출지. auto 는 모양(라이트 · 다크)을 따른다.
const WALLS = [
  { id: 'monterey', name: 'Monterey', tone: 'dark', desc: 'Violet hills at dusk. The same picture in Light and Dark.' },
  { id: 'ephemeris', name: 'Ephemeris', tone: 'auto', desc: 'Soft waves with light and dark versions that follow your appearance.' },
  { id: 'grid', name: 'Linux Commands', tone: 'light', desc: 'A grid of Linux commands. Press ▶ in the menu bar to watch them run.' },
];
const COLORS = [
  ['Sage', '#d3d9b3'],
  ['Sky', '#8ab8e6'],
  ['Blue', '#1f5fbf'],
  ['Teal', '#1d7874'],
  ['Green', '#3e7b4f'],
  ['Yellow', '#f0c94a'],
  ['Orange', '#e5763a'],
  ['Rose', '#e6a5b6'],
  ['Purple', '#5a3f9a'],
  ['Graphite', '#3a3a3c'],
];
const WALL_KEY = 'ephemeris:wallpaper';
const isColor = (id) => /^color:#[0-9a-f]{6}$/i.test(id || '');
const validWall = (id) => isColor(id) || WALLS.some((w) => w.id === id);
const wallEl = () => $('.wallpaper');

// 단색이 밝으면 검은 글자가, 어두우면 흰 글자가 더 잘 읽힌다(WCAG 상대 휘도)
function toneOf(hex) {
  const l = [1, 3, 5].reduce((s, i, n) => {
    let c = parseInt(hex.substr(i, 2), 16) / 255;
    c = c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    return s + c * [0.2126, 0.7152, 0.0722][n];
  }, 0);
  return l > 0.179 ? 'light' : 'dark';
}

// 저장한 것이 없으면 _config.yml 의 것(desktop.html 이 data-default 로 적어 둔다)
function currentWall() {
  const v = store.get(WALL_KEY);
  if (validWall(v)) return v.toLowerCase();
  return (wallEl()?.dataset.default || 'monterey').toLowerCase();
}

function wallName(id) {
  if (isColor(id)) return COLORS.find(([, c]) => c === id.slice(6))?.[0] || 'Custom Color';
  if (id === 'custom') return 'Default';
  return WALLS.find((w) => w.id === id)?.name || 'Default';
}

function wallDesc(id) {
  if (isColor(id)) return `A solid ${id.slice(6).toUpperCase()} background.`;
  if (id === 'custom') return 'The wallpaper set in _config.yml.';
  return WALLS.find((w) => w.id === id)?.desc || '';
}

async function applyWall(id) {
  const body = document.body;
  if (id === 'custom') {
    // _config.yml 의 그림으로: 덮어쓴 것을 다 걷는다
    delete root.dataset.wallpaper;
    delete root.dataset.wallTone;
    root.style.removeProperty('--wall-color');
    body.dataset.wallpaperTone = wallEl()?.dataset.defaultTone || 'light';
    store.remove(WALL_KEY);
  } else {
    const color = isColor(id) ? id.slice(6) : '';
    const tone = color ? toneOf(color) : WALLS.find((w) => w.id === id).tone;
    root.dataset.wallpaper = color ? 'color' : id;
    if (color) root.style.setProperty('--wall-color', color);
    else root.style.removeProperty('--wall-color');
    root.dataset.wallTone = tone;
    body.dataset.wallpaperTone = tone;
    store.set(WALL_KEY, id);
  }
  paint();
  // 명령어 격자는 고른 동안만 깐다(처음 고를 때 불러온다)
  const grid = id === 'grid' || (id === 'custom' && wallEl()?.dataset.default === 'grid');
  if (grid || $('.wallgrid')) {
    const { setGrid } = await import('./wallgrid.js');
    setGrid(grid);
  }
}

// 리눅스 명령어 격자의 작은 그림: 크기 제각각의 칸과 글줄
const GRID_CELLS = [
  [4, 4, 34, 44], [42, 4, 34, 20], [80, 4, 76, 44], [42, 28, 34, 20], [4, 52, 34, 20],
  [42, 52, 72, 20], [118, 52, 38, 44], [4, 76, 34, 20], [42, 76, 34, 20], [80, 76, 34, 20],
];
const GRID_THUMB = `<svg class="settings__grid-art" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
  ${GRID_CELLS.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.2" fill="none" stroke="#1b1d12" stroke-width="1.3"/>
  <rect x="${x + 3.5}" y="${y + 4.5}" width="${(w * 0.55).toFixed(1)}" height="2.2" rx="1" fill="#1b1d12"/>
  <rect x="${x + 3.5}" y="${y + 9}" width="${(w * 0.35).toFixed(1)}" height="1.8" rx="0.9" fill="#1b1d12" opacity=".45"/>`).join('')}
</svg>`;

function wallThumb(id, extra = '') {
  if (isColor(id)) return `<span class="settings__wall ${extra}" style="background:${esc(id.slice(6))}"></span>`;
  if (id === 'custom') {
    const img = wallEl()?.style.getPropertyValue('--wallpaper') || '';
    return `<span class="settings__wall ${extra}" style="background-image:${esc(img)}"></span>`;
  }
  return `<span class="settings__wall settings__wall--${id} ${extra}">${id === 'grid' ? GRID_THUMB : ''}</span>`;
}

// ── 칸 그리기 ───────────────────────────────────────────────────
const VIEWS = {
  wifi() {
    return `
      <div class="settings__card">
        <div class="settings__row">
          ${tile('blue', GLYPH.wifi, 'md')}
          <span class="settings__label" id="set-wifi-l">Wi-Fi</span>
          ${sw('wifi', 'set-wifi-l')}
        </div>
        <div data-wifi-current></div>
      </div>
      <div data-wifi-area></div>
      <p class="settings__foot">These networks are a model of the macOS menu. This page can't see the Wi-Fi of the device you're using.</p>`;
  },

  battery() {
    const percent = $('[data-battery-percent]')?.textContent.trim() || '92%';
    const left = $('[data-battery-left]')?.textContent.trim() || '';
    return `
      <div class="settings__card">
        <div class="settings__row settings__row--tall">
          <span class="settings__batt" aria-hidden="true"><i style="--level:${parseInt(percent, 10) / 100 || 0.92}"></i></span>
          <span class="settings__label"><span class="settings__big">${esc(percent)}</span>
            <small>Power Source: Battery${left ? ` · ${esc(left)}` : ''}</small></span>
        </div>
      </div>
      <h3 class="settings__head">Energy</h3>
      <div class="settings__card">
        <div class="settings__row">
          <span class="settings__label"><span id="set-lowpower-l">Low Power Mode</span>
            <small id="set-lowpower-d">Reduces energy usage. The RunCat in the menu bar takes a rest and the battery turns yellow.</small></span>
          ${sw('lowpower', 'set-lowpower-l', 'set-lowpower-d')}
        </div>
      </div>`;
  },

  general() {
    return `
      <div class="settings__card settings__hero">
        ${tile('gray', GLYPH.general, 'xl')}
        <h3 class="settings__hero-title">General</h3>
        <p class="settings__hero-text">Information about this blog and the person who writes it.</p>
      </div>
      <div class="settings__card">
        <button class="settings__row settings__row--link" type="button" data-go="about">
          ${tile('gray', GLYPH.info)}
          <span class="settings__label">About</span>
          ${use('chevron-right')}
        </button>
      </div>`;
  },

  about() {
    const s = SITE;
    const about = $('#menu-app a[href$="/about/"]')?.getAttribute('href') || '/about/';
    const first = s.first ? new Date(`${s.first}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const rows = [
      ['Name', s.title],
      ['Author', s.author],
      ['Posts', s.posts],
      ['First Post', first],
      ['Latest Post', s.latest],
    ].filter(([, v]) => v !== undefined && v !== null && v !== '');
    return `
      <div class="settings__hero settings__hero--about">
        <span class="settings__about-icon">${BOT('settings__about-bot')}</span>
        <h3 class="settings__hero-title">${esc(s.title || 'Ephemeris')}</h3>
        <p class="settings__hero-text">A blog by ${esc(s.author || '')}</p>
      </div>
      <div class="settings__card">
        ${rows.map(([k, v]) => `<div class="settings__row"><span class="settings__label">${esc(k)}</span><span class="settings__value"${k === 'Latest Post' ? ' lang="ko"' : ''}>${esc(v)}</span></div>`).join('')}
      </div>
      <div class="settings__actions"><a class="settings__push" href="${esc(about)}">About This Mac…</a></div>`;
  },

  appearance() {
    const look = (kind) => `<span class="settings__look settings__look--${kind}"><i></i></span>`;
    const option = (v, label) => `
      <button class="settings__choice" type="button" role="radio" aria-checked="false" tabindex="-1" data-appearance="${v}">
        ${v === 'auto' ? `<span class="settings__look settings__look--auto">${look('light')}${look('dark')}</span>` : look(v)}
        <span class="settings__choice-name">${label}</span>
      </button>`;
    return `
      <div class="settings__card">
        <div class="settings__row settings__row--looks">
          <span class="settings__label" id="set-look-l">Appearance</span>
          <div class="settings__looks" role="radiogroup" aria-labelledby="set-look-l">
            ${option('auto', 'Auto')}${option('light', 'Light')}${option('dark', 'Dark')}
          </div>
        </div>
      </div>
      <p class="settings__foot">Auto follows the light or dark setting of your device. Dark Mode in Control Center changes this too.</p>`;
  },

  dock() {
    return `
      <h3 class="settings__head settings__head--first">Dock</h3>
      <div class="settings__card">
        <div class="settings__row settings__row--slider">
          <label class="settings__label" for="set-dock-size">Size</label>
          <span class="settings__slider">
            <input class="settings__range" id="set-dock-size" type="range" min="${DOCK.min}" max="${DOCK.max}" step="1" data-dock-size aria-valuetext="">
            <span class="settings__ticks" aria-hidden="true"><span>Small</span><span>Large</span></span>
          </span>
        </div>
        <div class="settings__row">
          <span class="settings__label" id="set-magnify-l">Magnification</span>
          ${sw('magnify', 'set-magnify-l')}
        </div>
        <div class="settings__row">
          <span class="settings__label" id="set-dots-l">Show indicators for open applications</span>
          ${sw('dots', 'set-dots-l')}
        </div>
      </div>
      <p class="settings__foot settings__foot--narrow">On a phone the Dock always fits the width of the screen and doesn't magnify.</p>
      <h3 class="settings__head">Desktop</h3>
      <div class="settings__card">
        <div class="settings__row">
          <span class="settings__label"><span id="set-items-l">Show Items on Desktop</span><small id="set-items-d">${SITE.desktop.druid ? 'About.txt and Apache Druid' : 'About.txt'}</small></span>
          ${sw('items', 'set-items-l', 'set-items-d')}
        </div>
        <div class="settings__row">
          <span class="settings__label"><span id="set-widgets-l">Show Widgets on Desktop</span><small id="set-widgets-d">The weather widget</small></span>
          ${sw('widgets', 'set-widgets-l', 'set-widgets-d')}
        </div>
      </div>
      <p class="settings__foot">Items and widgets live on the desktop of the home page.</p>`;
  },

  wallpaper() {
    const def = wallEl()?.dataset.default;
    const pics = def === 'custom' ? [{ id: 'custom', name: 'Default' }, ...WALLS] : WALLS;
    const pick = (id, name) => `
      <button class="settings__pick" type="button" role="radio" aria-checked="false" tabindex="-1" data-wall="${esc(id)}" aria-label="${esc(name)}">
        ${wallThumb(id)}<span class="settings__pick-name" aria-hidden="true">${esc(name)}</span>
      </button>`;
    const swatch = ([name, hex]) => `
      <button class="settings__swatch" type="button" role="radio" aria-checked="false" tabindex="-1" data-wall="color:${hex}" aria-label="${esc(name)}" title="${esc(name)}" style="--c:${hex}"></button>`;
    return `
      <div class="settings__card settings__now">
        <span data-wall-now></span>
        <span class="settings__label"><span class="settings__big" data-wall-name></span><small data-wall-desc></small></span>
      </div>
      <div role="radiogroup" aria-label="Wallpaper" data-wall-group>
        <h3 class="settings__head">Pictures</h3>
        <div class="settings__picks">${pics.map((w) => pick(w.id, w.name)).join('')}</div>
        <h3 class="settings__head">Colors</h3>
        <div class="settings__swatches">
          ${COLORS.map(swatch).join('')}
          <label class="settings__swatch settings__swatch--custom" title="Custom Color">
            <input type="color" aria-label="Custom color" data-wall-custom>
          </label>
        </div>
      </div>`;
  },

  notifications() {
    return `
      <div class="settings__card">
        <div class="settings__row settings__row--tall">
          ${tile('indigo', GLYPH.moon, 'md')}
          <span class="settings__label"><span id="set-dnd-l">Do Not Disturb</span>
            <small id="set-dnd-d">Notifications won't pop up on the screen. You can still find them in Notification Center.</small></span>
          ${sw('dnd', 'set-dnd-l', 'set-dnd-d')}
        </div>
      </div>
      <h3 class="settings__head">Notification Center</h3>
      <div class="settings__card">
        <div class="settings__row">
          <span class="settings__label"><span>History</span><small data-notif-count></small></span>
          <button class="settings__push" type="button" data-notif-clear>Clear All</button>
        </div>
      </div>
      <p class="settings__foot">Open Notification Center by clicking the date in the menu bar.</p>`;
  },
};

// ── 지금 상태를 그린다(어디서 바꿨든) ───────────────────────────
function paint() {
  if (!win) return;
  const page = $('[data-settings-page]', win);

  for (const s of $$('[data-set]', page)) s.setAttribute('aria-checked', String(!!STATE[s.dataset.set]?.()));

  if (view === 'wifi') paintWifi(page);

  if (view === 'battery') $('.settings__batt', page)?.classList.toggle('is-low', STATE.lowpower());

  if (view === 'appearance') {
    const v = getAppearance();
    for (const r of $$('[data-appearance]', page)) {
      const on = r.dataset.appearance === v;
      r.setAttribute('aria-checked', String(on));
      r.tabIndex = on ? 0 : -1;
    }
  }

  if (view === 'dock') {
    const input = $('[data-dock-size]', page);
    if (input && document.activeElement !== input) input.value = String(dockSize());
    if (input) {
      input.style.setProperty('--p', `${((input.value - DOCK.min) / (DOCK.max - DOCK.min)) * 100}%`);
      input.setAttribute('aria-valuetext', `${input.value} pixels`);
    }
  }

  if (view === 'wallpaper') {
    const cur = currentWall();
    const radios = $$('[data-wall]', page);
    const hit = radios.find((r) => r.dataset.wall === cur);
    for (const r of radios) {
      r.setAttribute('aria-checked', String(r === hit));
      r.tabIndex = r === hit ? 0 : -1;
    }
    if (!hit && radios[0]) radios[0].tabIndex = 0;
    // 목록에 없는 단색이면 '사용자 색' 칸이 그 색을 띠고 골라진 것으로 보인다
    const custom = $('[data-wall-custom]', page);
    if (custom) {
      const own = isColor(cur) && !hit;
      custom.closest('label').classList.toggle('is-checked', own);
      custom.closest('label').style.setProperty('--c', own ? cur.slice(6) : '');
      if (isColor(cur) && document.activeElement !== custom) custom.value = cur.slice(6);
    }
    $('[data-wall-now]', page).innerHTML = wallThumb(cur, 'settings__wall--lg');
    $('[data-wall-name]', page).textContent = wallName(cur);
    $('[data-wall-desc]', page).textContent = wallDesc(cur);
  }

  if (view === 'notifications') {
    const n = notificationHistory().length;
    $('[data-notif-count]', page).textContent = n ? `${n} notification${n === 1 ? '' : 's'} in this session` : 'No notifications yet';
    $('[data-notif-clear]', page).disabled = !n;
  }
}

function paintWifi(page) {
  const on = wifiOn();
  const known = networks('[data-wifi-list]');
  const others = networks('[data-wifi-others]');
  const current = known.find((n) => n.joined);
  const sig = JSON.stringify([on, known.map((n) => [n.name, n.joined, n.meta]), others.map((n) => [n.name, n.meta])]);
  const area = $('[data-wifi-area]', page);
  if (area.dataset.sig === sig) return;
  area.dataset.sig = sig;

  // 다시 그려도 초점은 같은 네트워크에 남긴다
  const focused = document.activeElement?.closest?.('[data-join]')?.dataset.join;
  const lock = '<svg class="icon settings__lock" viewBox="0 0 20 20" aria-label="Secured" role="img"><use href="#i-lock"/></svg>';
  const row = (n) => `
    <div class="settings__row settings__row--net">
      <span class="settings__fan">${n.fan}</span>
      <span class="settings__label">${esc(n.name)}${n.meta ? `<small>${esc(n.meta)}</small>` : ''}</span>
      <button class="settings__push settings__push--quiet" type="button" data-join="${esc(n.name)}" aria-label="Connect to ${esc(n.name)}"${n.meta ? ' disabled' : ''}>Connect</button>
      <span class="settings__lockbox">${n.lock ? lock : ''}</span>
    </div>`;

  $('[data-wifi-current]', page).innerHTML =
    on && current
      ? `<div class="settings__row settings__row--net">
          <span class="settings__fan is-joined">${current.fan}</span>
          <span class="settings__label">${esc(current.name)}<small class="settings__ok">Connected</small></span>
          <span class="settings__lockbox">${current.lock ? lock : ''}</span>
        </div>`
      : '';

  const rest = known.filter((n) => !n.joined);
  area.innerHTML = !on
    ? '<p class="settings__empty">Wi-Fi is turned off.</p>'
    : `${rest.length ? `<h3 class="settings__head">Known Networks</h3><div class="settings__card">${rest.map(row).join('')}</div>` : ''}
       ${others.length ? `<h3 class="settings__head">Other Networks</h3><div class="settings__card">${others.map(row).join('')}</div>` : ''}`;
  if (focused) $(`[data-join="${CSS.escape(focused)}"]`, area)?.focus({ preventScroll: true });
}

// 여러 곳에서 한꺼번에 바뀌어도 한 번만 그린다
function schedulePaint() {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    paint();
  });
}

// ── 창 ──────────────────────────────────────────────────────────
const traffic = `
  <div class="traffic" role="group" aria-label="Window controls">
    <button class="traffic__btn traffic__btn--close" type="button" data-window-action="close" aria-label="Close"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg></button>
    <button class="traffic__btn traffic__btn--min" type="button" data-window-action="minimize" aria-label="Minimize"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-minus"/></svg></button>
    <button class="traffic__btn traffic__btn--zoom" type="button" data-window-action="zoom" aria-label="Zoom" aria-pressed="false"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-zoom"/></svg></button>
  </div>`;

function sidebar() {
  return GROUPS.map(
    (name, g) => `
      <div class="settings__group" role="group" aria-label="${name}">
        ${PANES.filter((p) => p.group === g)
          .map(
            (p) => `<button class="settings__item" type="button" role="option" aria-selected="false" tabindex="-1" data-pane="${p.id}">
              ${tile(p.tile, GLYPH[p.id])}<span class="settings__item-name">${esc(p.label)}</span></button>`,
          )
          .join('')}
      </div>`,
  ).join('');
}

function build() {
  const s = SITE;
  const el = document.createElement('section');
  el.className = 'window settings';
  el.dataset.window = 'settings';
  el.dataset.dynamic = '';
  el.tabIndex = -1;
  el.setAttribute('aria-labelledby', 'settings-title');
  el.innerHTML = `
    <aside class="settings__side">
      <div class="settings__chrome" data-window-drag>
        ${traffic}
        <button class="settings__close" type="button" data-window-action="close" aria-label="Close System Settings">${use('close')}</button>
      </div>
      <h2 class="settings__app" id="settings-title">System Settings</h2>
      <label class="settings__search">
        ${use('search')}
        <input type="search" placeholder="Search" aria-label="Search settings" autocomplete="off" spellcheck="false" data-settings-search>
      </label>
      <div class="settings__scroll">
        <button class="settings__me" type="button" data-go="about">
          <span class="settings__avatar">${BOT('settings__me-bot')}</span>
          <span class="settings__me-text"><span class="settings__me-name">${esc(s.author || 'Guest')}</span><small>${esc(s.title || 'Ephemeris')}</small></span>
        </button>
        <div class="settings__list" role="listbox" aria-label="Settings" data-settings-list>${sidebar()}</div>
        <p class="settings__none" data-settings-none hidden>No Results</p>
      </div>
    </aside>
    <div class="settings__main">
      <header class="settings__bar" data-window-drag>
        <button class="settings__back" type="button" data-settings-up aria-label="Back to all settings">${use('chevron-left')}</button>
        <div class="settings__navs" role="group" aria-label="History">
          <button class="settings__nav" type="button" data-settings-back aria-label="Back" disabled>${use('chevron-left')}</button>
          <button class="settings__nav" type="button" data-settings-fwd aria-label="Forward" disabled>${use('chevron-right')}</button>
        </div>
        <h2 class="settings__title" id="settings-pane-title" data-settings-title></h2>
        <button class="settings__close settings__close--bar" type="button" data-window-action="close" aria-label="Close System Settings">${use('close')}</button>
      </header>
      <div class="settings__page" role="region" aria-labelledby="settings-pane-title" tabindex="-1" data-settings-page></div>
    </div>`;
  return el;
}

// 칸 하나를 띄운다. push 면 뒤로 가기 길에 남긴다.
function show(id, { push = true } = {}) {
  if (!validView(id)) return;
  if (push && trail[at] !== id) {
    trail = trail.slice(0, at + 1);
    trail.push(id);
    at = trail.length - 1;
  }
  view = id;
  if (paneOf(id)) store.set('ephemeris:settings-pane', id);

  const page = $('[data-settings-page]', win);
  page.innerHTML = VIEWS[id]();
  page.scrollTop = 0;
  $('[data-settings-title]', win).textContent = titleOf(id);
  win.dataset.view = id;

  const lit = PARENT[id] || id;
  for (const o of $$('[data-pane]', win)) {
    const on = o.dataset.pane === lit;
    o.setAttribute('aria-selected', String(on));
    o.tabIndex = on ? 0 : -1;
  }
  $('[data-settings-back]', win).disabled = at <= 0;
  $('[data-settings-fwd]', win).disabled = at >= trail.length - 1;
  // 폰의 '‹' 단추: 하위 칸이면 윗칸으로, 아니면 목록으로
  $('[data-settings-up]', win).setAttribute('aria-label', PARENT[id] ? `Back to ${titleOf(PARENT[id])}` : 'Back to all settings');
  paint();
}

function reading(on) {
  win.classList.toggle('is-reading', on);
}

// 검색: 이름과 검색어에 맞는 칸만 남긴다
function filter() {
  const q = query.toLowerCase();
  let any = false;
  for (const o of $$('[data-pane]', win)) {
    const p = paneOf(o.dataset.pane);
    const hit = !q || `${p.label} ${p.keys}`.toLowerCase().includes(q);
    o.hidden = !hit;
    if (hit) any = true;
  }
  for (const g of $$('.settings__group', win)) g.hidden = !$('[data-pane]:not([hidden])', g);
  $('.settings__me', win).hidden = !!q && !'about author profile blog 정보'.includes(q) && !(SITE.author || '').toLowerCase().includes(q);
  $('[data-settings-none]', win).hidden = any;
  // 고른 칸이 걸러져 숨으면 Tab 으로 목록에 들어올 자리를 첫 결과에 준다
  const items = visibleOptions();
  if (items.length && !items.some((o) => o.tabIndex === 0)) items[0].tabIndex = 0;
}

const visibleOptions = () => $$('[data-pane]', win).filter((o) => !o.hidden);

function choose(id) {
  show(id);
  if (NARROW()) {
    reading(true);
    $('[data-settings-page]', win).focus({ preventScroll: true });
  }
}

function wire() {
  win.addEventListener('click', (e) => {
    const t = e.target;
    const opt = t.closest('[data-pane]');
    if (opt) return choose(opt.dataset.pane);
    const go = t.closest('[data-go]');
    if (go) return choose(go.dataset.go);
    const set = t.closest('[data-set]');
    if (set) return toggle(set.dataset.set);
    const look = t.closest('[data-appearance]');
    if (look) {
      setAppearance(look.dataset.appearance);
      return paint();
    }
    const wall = t.closest('[data-wall]');
    if (wall) return applyWall(wall.dataset.wall);
    const join = t.closest('[data-join]');
    if (join) return press($(`[data-wifi-list] [data-net="${CSS.escape(join.dataset.join)}"], [data-wifi-others] [data-net="${CSS.escape(join.dataset.join)}"]`));
    if (t.closest('[data-notif-clear]')) {
      clearNotifications();
      return paint();
    }
    if (t.closest('[data-settings-back]') && at > 0) return show(trail[--at], { push: false });
    if (t.closest('[data-settings-fwd]') && at < trail.length - 1) return show(trail[++at], { push: false });
    if (t.closest('[data-settings-up]')) {
      if (PARENT[view]) return show(PARENT[view]);
      reading(false);
      $(`[data-pane="${view}"]`, win)?.focus({ preventScroll: true });
    }
  });

  win.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-settings-search]')) {
      query = t.value.trim();
      filter();
    } else if (t.matches('[data-dock-size]')) {
      setDockSize(t.value);
      paint();
    } else if (t.matches('[data-wall-custom]')) {
      applyWall(`color:${t.value.toLowerCase()}`);
    }
  });

  // 검색 칸: ↓ 로 목록에, Return 으로 첫 결과를 연다, Esc 로 비운다
  $('[data-settings-search]', win).addEventListener('keydown', (e) => {
    const first = visibleOptions()[0];
    if (e.key === 'ArrowDown' && first) {
      e.preventDefault();
      first.focus();
    } else if (e.key === 'Enter' && first) {
      e.preventDefault();
      choose(first.dataset.pane);
    } else if (e.key === 'Escape' && e.target.value) {
      e.preventDefault();
      e.stopPropagation();
      e.target.value = '';
      query = '';
      filter();
    }
  });

  // 목록: ↑↓ 로 옮기면 그 칸이 바로 뜬다(맥처럼). Home · End 도.
  $('[data-settings-list]', win).addEventListener('keydown', (e) => {
    const items = visibleOptions();
    const i = items.indexOf(document.activeElement);
    // 맨 위에서 ↑ 이면 검색 칸으로
    if (e.key === 'ArrowUp' && i === 0) {
      e.preventDefault();
      $('[data-settings-search]', win).focus();
      return;
    }
    const next = { ArrowDown: items[i + 1], ArrowUp: items[i - 1], Home: items[0], End: items.at(-1) }[e.key];
    if (!next) return;
    e.preventDefault();
    show(next.dataset.pane);
    next.focus();
  });

  // 단추 묶음(모양 · 배경화면): 화살표로 옮겨 가며 고른다
  win.addEventListener('keydown', (e) => {
    const group = e.target.closest?.('[role="radiogroup"]');
    if (!group || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    const radios = $$('[role="radio"]', group);
    const i = radios.indexOf(e.target.closest('[role="radio"]'));
    if (i < 0) return;
    e.preventDefault();
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? radios.length - 1 : (i + step + radios.length) % radios.length;
    radios[j].click();
    $$('[role="radio"]', group)[j]?.focus();
  });
}

// 다른 곳(메뉴 · 제어 센터 · 단축키)에서 바꾼 것을 따라 그린다
function watch() {
  const mo = new MutationObserver(schedulePaint);
  const wt = wifiToggle();
  if (wt) mo.observe(wt, { attributes: true, attributeFilter: ['aria-checked'] });
  for (const list of $$('[data-wifi-list], [data-wifi-others]')) mo.observe(list, { childList: true, subtree: true });
  mo.observe(root, { attributes: true, attributeFilter: ['data-dnd', 'class', 'data-theme'] });
  const events = ['ephemeris:theme', 'ephemeris:still', 'ephemeris:notify'];
  for (const ev of events) addEventListener(ev, schedulePaint);
  return () => {
    mo.disconnect();
    for (const ev of events) removeEventListener(ev, schedulePaint);
  };
}

// ── 열기 ────────────────────────────────────────────────────────
/** 시스템 설정을 연다. pane: 처음 보일 칸('wallpaper', 'appearance', 'dock' …) */
export async function openSettings(button, { pane } = {}) {
  dockButton = button || dockButton;
  const want = ALIAS[pane] || pane;
  const target = validView(want) ? want : null;

  if (win?.isConnected) {
    await openWindow(win);
    focusWindow(win);
    if (target) {
      if (target !== view) show(target);
      if (NARROW()) reading(true);
    }
    return win;
  }

  win = build();
  $('#workspace').append(win);
  setupWindow(win);
  setCloser(win, (w) => {
    watcher?.();
    watcher = null;
    closeWindow(w, { remove: true });
    dockButton?.classList.remove('is-running');
    win = null;
  });
  dockButton?.classList.add('is-running');
  focusWindow(win);
  if (dockButton) flyTo(win, dockButton.getBoundingClientRect(), true);

  trail = [];
  at = -1;
  query = '';
  wire();
  watcher = watch();
  const last = store.get('ephemeris:settings-pane');
  show(target || (validView(last) ? last : 'appearance'));
  // 폰: 칸을 짚어 열었으면 그 칸부터, 아니면 목록부터
  reading(!NARROW() || !!target);
  if (NARROW() && target) $('[data-settings-page]', win).focus({ preventScroll: true });
  else $(`[data-pane="${PARENT[view] || view}"]`, win)?.focus({ preventScroll: true });
  return win;
}
