/*
 * Finder 창: 위치(응용 프로그램 · 데스크탑 · Obsidian) · 태그 · 검색 · 데스크톱 아이콘
 *
 * 맥의 Finder 처럼 사이드바의 위치를 오간다. 글은 빌드할 때 Obsidian 폴더에
 * 전부 내보내 두고, 여기서는 보이고 숨기는 일만 한다. 고른 위치와 태그는
 * 주소(?at=위치, ?c=태그)에 남겨 새로고침 · 뒤로 가기 · 링크 공유에서도 그대로
 * 돌아온다. 카테고리(태그)를 여는 길은 여럿이다 — Finder 사이드바, 메뉴 막대,
 * Obsidian 창의 태그. 모두 여기로 모인다.
 */
import { openWindow, DESKTOP } from './desktop.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const win = $('[data-window="finder"]');
const list = $('[data-scroll="finder"]');
const rows = $$('.row', list);
const years = $$('[data-year]', list);
const title = $('[data-list-title]');
const status = $('[data-status]');
const empty = $('[data-empty]');
const emptyQuery = $('[data-empty-query]');
const search = $('[data-search]');
const clear = $('[data-search-clear]');
const icons = $$('[data-desktop-icon]');
const baseTitle = document.title;

const PLACES = { apps: '응용 프로그램', desktop: '데스크탑', obsidian: 'Obsidian' };
const views = new Map($$('[data-place-view]', win).map((v) => [v.dataset.placeView, v]));

// 태그(카테고리) 이름은 Finder 사이드바가 이미 들고 있다.
const categories = new Map(
  $$('.finder__item[data-category]', win).map((a) => [
    a.dataset.category,
    { name: $('.finder__label', a).textContent.trim() },
  ]),
);

const state = { place: 'apps', category: '', query: '' };

// 목록 주소. 글 창이 앞에 있으면 주소창은 그 글을 가리키므로, 목록 쪽 주소는
// history.state.list 에 따로 적어 둔다(docs.js).
function readURL() {
  const list = history.state?.list ?? location.pathname + location.search;
  const q = new URL(list, location.origin).searchParams;
  const c = q.get('c') || '';
  state.category = categories.has(c) ? c : '';
  state.place = state.category ? 'obsidian' : q.get('at') in PLACES ? q.get('at') : 'apps';
}

// 주소에는 위치와 태그만 남긴다(건너뛰기 링크 따위의 #조각은 떼어 낸다).
function urlFor(place, category) {
  const url = new URL(history.state?.list ?? location.pathname + location.search, location.origin);
  url.searchParams.delete('c');
  url.searchParams.delete('at');
  if (category) url.searchParams.set('c', category);
  else if (place !== 'apps') url.searchParams.set('at', place);
  return url.pathname + url.search;
}

// ── 그리기 ──────────────────────────────────────────────────────
function render() {
  const { place, category, query } = state;
  for (const [name, view] of views) view.hidden = name !== place;

  let shown = 0;
  if (place === 'obsidian') {
    for (const row of rows) {
      const ok =
        (!category || row.dataset.category === category) &&
        (!query || row.dataset.search.includes(query));
      row.hidden = !ok;
      if (ok) shown++;
    }
    for (const year of years) {
      year.hidden = !$$('.row', year).some((r) => !r.hidden);
    }
    empty.hidden = shown > 0;
    emptyQuery.textContent = search.value.trim();
  } else {
    shown = $$('.ficon', views.get(place)).length;
  }

  const name = category ? categories.get(category).name : PLACES[place];
  title.textContent = name;
  // 아래 상태 막대의 항목 수는 role=status 라 바뀔 때 읽힌다. 같은 글을 다시 쓰면
  // 괜히 읽히므로 바뀔 때만 쓴다.
  const said = place === 'obsidian' && query ? `${shown}개 일치` : `${shown}개 항목`;
  if (status.textContent !== said) status.textContent = said;
  const pageTitle = category ? `${name} · ${baseTitle}` : baseTitle;
  // 글 창이 앞에 있으면 쪽 제목은 그 글의 것이다. Finder 가 앞일 때만 바꾼다.
  if (win.classList.contains('is-front') || !document.querySelector('.window.is-front')) document.title = pageTitle;

  // 사이드바: 태그를 골랐으면 그 태그만, 아니면 위치에 불을 켠다.
  for (const a of $$('a[data-category]:not([data-no-current])')) {
    if (category && a.dataset.category === category) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  }
  for (const a of $$('a[data-place]', win)) {
    if (!category && a.dataset.place === place) a.setAttribute('aria-current', 'true');
    else if (a.closest('.finder__places') && a.dataset.place === place) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  }

  dispatchEvent(new CustomEvent('ephemeris:category', { detail: { category, title: pageTitle } }));
}

function go(place, category = '') {
  openWindow(win);
  if (place === state.place && category === state.category) return;
  state.place = place;
  state.category = category;
  const url = urlFor(place, category);
  // 열린 글 창 목록(docs)은 그대로 이어 적는다.
  history.pushState({ ...(history.state || {}), c: category, at: place, list: url }, '', url);
  render();
  views.get(place).scrollTop = 0;
}

// 태그(카테고리)를 고르면 Obsidian 폴더의 그 글만. 빈 태그('')는 Obsidian 폴더 전체.
const select = (category) => go('obsidian', category);

// ── 위치 · 태그 링크 ────────────────────────────────────────────
// 데스크톱 아이콘은 따로 다룬다(아래). 나중에 열린 창 안의 태그 링크도 잡도록
// 문서 전체에서 듣는다.
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const place = e.target.closest('a[data-place]');
  if (place && win.contains(place)) {
    e.preventDefault();
    go(place.dataset.place);
    return;
  }
  const a = e.target.closest('a[data-category]:not([data-desktop-icon])');
  if (!a) return;
  e.preventDefault();
  select(a.dataset.category);
});

// 뒤로·앞으로: 위치나 태그가 바뀌었다면 닫아 둔 Finder 도 다시 띄운다.
addEventListener('popstate', () => {
  const before = `${state.place}|${state.category}`;
  readURL();
  if (`${state.place}|${state.category}` === before) return;
  render();
  openWindow(win);
});

// ── 응용 프로그램 · 데스크탑의 아이콘 ────────────────────────────
// 맥처럼 한 번 누르면 고르고, 두 번 누르면(↩, 손가락은 한 번에) 연다.
// 앱은 Dock 의 그 앱 단추를 누른 것과 같고, About.txt 는 창으로 연다.
const DOCK = {
  finder: '[data-dock-finder]',
  obsidian: '[data-dock-obsidian]',
  notes: '[data-dock-notes]',
  terminal: '[data-dock-terminal]',
  games: '[data-dock-games]',
  music: '[data-dock-music]',
};
const ficons = $$('.ficon', win);

function pickIcon(icon) {
  for (const i of ficons) i.classList.toggle('is-selected', i === icon);
}

function launch(icon) {
  pickIcon(icon);
  if (icon.dataset.openApp) {
    $(DOCK[icon.dataset.openApp])?.click();
    return;
  }
  if (icon.hasAttribute('data-about-note')) {
    dispatchEvent(new Event('ephemeris:about-note'));
    return;
  }
  const ev = new CustomEvent('ephemeris:open', { detail: { href: icon.href }, cancelable: true });
  if (dispatchEvent(ev)) location.href = icon.href;
}

let ficonPointer = 'mouse';
for (const icon of ficons) {
  icon.addEventListener('pointerdown', (e) => {
    ficonPointer = e.pointerType;
  });
  icon.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (e.detail === 0 || ficonPointer !== 'mouse') launch(icon); // detail 0: 키보드 ↩
    else pickIcon(icon);
  });
  icon.addEventListener('dblclick', (e) => {
    e.preventDefault();
    launch(icon);
  });
}
// 빈 곳을 누르면 고른 것을 푼다.
for (const view of views.values()) {
  view.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.ficon')) pickIcon(null);
  });
}

// ── 데스크톱 아이콘 ─────────────────────────────────────────────
// 맥처럼 한 번 누르면 고르고, 두 번 누르면 연다. 키보드는 ↩ 로 연다.
// 손가락으로는 두 번 누르기가 어색하니 한 번에 연다.
function selectIcon(icon) {
  for (const i of icons) i.classList.toggle('is-selected', i === icon);
}

function openIcon(icon) {
  selectIcon(icon);
  // About.txt: 메모 앱의 about me 메모로 연다.
  if (icon.hasAttribute('data-about-note')) {
    dispatchEvent(new Event('ephemeris:about-note'));
    return;
  }
  // 그 밖의 문서 따위: 첫 화면이면 docs.js 가 창으로 연다. 아니면 그 쪽으로.
  const ev = new CustomEvent('ephemeris:open', { detail: { href: icon.href }, cancelable: true });
  if (dispatchEvent(ev)) location.href = icon.href;
}

// 우클릭 메뉴의 '열기'
document.addEventListener('ephemeris:open-icon', (e) => {
  const icon = e.target.closest?.('[data-desktop-icon]');
  if (icon) openIcon(icon);
});

let lastPointer = 'mouse';
for (const icon of icons) {
  icon.addEventListener('pointerdown', (e) => {
    lastPointer = e.pointerType;
  });
  icon.addEventListener('click', (e) => {
    if (icon.dataset.dragged != null) {
      // 방금 끌어 옮긴 것이다. 누른 것으로 치지 않는다.
      e.preventDefault();
      delete icon.dataset.dragged;
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (e.detail === 0 || lastPointer !== 'mouse') openIcon(icon); // detail 0: 키보드 ↩
    else selectIcon(icon);
  });
  icon.addEventListener('dblclick', (e) => {
    e.preventDefault();
    openIcon(icon);
  });
}

// ── 폴더 옮기기 ─────────────────────────────────────────────────
// 맥처럼 폴더를 끌어 아무 데나 둔다. 고른 폴더가 여럿이면 함께 움직인다.
// 둔 자리는 기억하고(오른쪽 위 모서리에서 잰 거리라, 창 폭이 바뀌어도 오른쪽에
// 붙어 있다), 바탕의 우클릭 메뉴 '아이콘 정리'로 처음 줄로 돌아간다.
const iconList = $('[data-desktop-icons]');
const POS_KEY = 'ephemeris:icons';
const liOf = (icon) => icon.closest('li');
const store = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {}
  },
};

function place(li, r, t) {
  li.style.setProperty('--ir', `${Math.round(r)}px`);
  li.style.setProperty('--it', `${Math.round(t)}px`);
}

function readPlace(li) {
  return { r: parseFloat(li.style.getPropertyValue('--ir')) || 0, t: parseFloat(li.style.getPropertyValue('--it')) || 0 };
}

// 줄 맞춤(grid)으로 놓인 지금 자리를 그대로 좌표로 옮겨 적는다.
function freeze() {
  if (!iconList || iconList.classList.contains('is-free')) return;
  const box = iconList.getBoundingClientRect();
  const spots = icons.map((icon) => [liOf(icon), liOf(icon).getBoundingClientRect()]);
  for (const [li, r] of spots) place(li, box.right - r.right, r.top - box.top);
  iconList.classList.add('is-free');
}

// 폴더가 화면 밖(또는 Dock 뒤)으로 나가지 않게.
function clampPlace(li, p) {
  const box = iconList.getBoundingClientRect();
  const ws = document.getElementById('workspace').getBoundingClientRect();
  const r = li.getBoundingClientRect();
  const dock = document.querySelector('[data-dock]')?.getBoundingClientRect();
  const bottom = (dock ? dock.top : ws.bottom) - 8;
  return {
    r: Math.min(Math.max(p.r, box.right - ws.right + 4), box.right - ws.left - r.width - 4),
    t: Math.min(Math.max(p.t, ws.top - box.top + 4), bottom - box.top - r.height),
  };
}

function savePlaces() {
  const map = {};
  for (const icon of icons) map[icon.getAttribute('href')] = readPlace(liOf(icon));
  store.set(POS_KEY, JSON.stringify(map));
}

function restorePlaces() {
  if (!iconList || !DESKTOP.matches) return;
  let map = null;
  try { map = JSON.parse(store.get(POS_KEY) || 'null'); } catch {}
  if (!map) return;
  freeze();
  for (const icon of icons) {
    const p = map[icon.getAttribute('href')];
    if (p) place(liOf(icon), p.r, p.t);
  }
  for (const icon of icons) {
    const li = liOf(icon);
    const c = clampPlace(li, readPlace(li));
    place(li, c.r, c.t);
  }
}

addEventListener('ephemeris:icons-cleanup', () => {
  store.set(POS_KEY, null);
  iconList?.classList.remove('is-free');
  for (const icon of icons) {
    liOf(icon).style.removeProperty('--ir');
    liOf(icon).style.removeProperty('--it');
  }
});

for (const icon of icons) {
  let drag = null;
  // 폴더는 링크라, 그냥 두면 브라우저가 링크 끌기를 시작해 버린다.
  icon.draggable = false;
  icon.addEventListener('dragstart', (e) => e.preventDefault());
  icon.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType === 'touch' || !DESKTOP.matches) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moving: false, group: null };
    // 빠르게 끌어도 손끝을 놓치지 않게 바로 쥔다. 쥔 것이 폴더 자신이라 누르기·두 번 누르기는 그대로다.
    icon.setPointerCapture(e.pointerId);
  });
  icon.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moving) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      drag.moving = true;
      freeze();
      if (!icon.classList.contains('is-selected')) selectIcon(icon);
      drag.group = icons.filter((i) => i.classList.contains('is-selected')).map((i) => [liOf(i), readPlace(liOf(i))]);
      iconList.classList.add('is-dragging');
    }
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    for (const [li, p] of drag.group) {
      const c = clampPlace(li, { r: p.r - dx, t: p.t + dy });
      place(li, c.r, c.t);
    }
  });
  const end = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    if (drag.moving) {
      icon.dataset.dragged = '';
      iconList.classList.remove('is-dragging');
      savePlaces();
    }
    drag = null;
  };
  icon.addEventListener('pointerup', end);
  icon.addEventListener('pointercancel', end);
}

restorePlaces();
addEventListener('resize', () => {
  if (!iconList?.classList.contains('is-free')) return;
  for (const icon of icons) {
    const li = liOf(icon);
    const c = clampPlace(li, readPlace(li));
    place(li, c.r, c.t);
  }
});

// 바탕을 누르면 고른 것을 푼다. ⇧·⌘ 를 누른 채면 선택 상자로 더 고르는 중이니 둔다.
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('[data-desktop-icon]') || e.shiftKey || e.metaKey) return;
  selectIcon(null);
});

// ── 검색 ────────────────────────────────────────────────────────
// 글은 Obsidian 폴더에 있다. 다른 위치에서 찾기 시작하면 그리로 옮겨 가 찾는다.
search.addEventListener('input', () => {
  state.query = search.value.trim().toLowerCase().normalize('NFC');
  clear.hidden = !search.value;
  if (state.query && state.place !== 'obsidian') go('obsidian', state.category);
  else render();
  list.scrollTop = 0;
});

search.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (search.value) {
    search.value = '';
    search.dispatchEvent(new Event('input'));
  } else {
    search.blur();
  }
});

clear.addEventListener('click', () => {
  search.value = '';
  search.dispatchEvent(new Event('input'));
  search.focus();
});

// "/" 로 이 창의 검색 칸에 들어간다. 한 글자 단축키라 Finder 창 안에 초점이
// 있을 때만 듣는다(처음 열면 초점이 목록에 있다). 어디서나 쓰는 건 ⌘K(Spotlight).
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || !win.contains(document.activeElement)) return;
  if (e.target.closest('input, textarea, [contenteditable], dialog[open]')) return;
  e.preventDefault();
  search.focus();
});

// ── 시작 ────────────────────────────────────────────────────────

readURL();
render();
