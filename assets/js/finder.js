/*
 * Finder 창: 카테고리 · 검색 · 데스크톱 폴더
 *
 * 글은 빌드할 때 전부 내보내 두고, 여기서는 보이고 숨기는 일만 한다.
 * 고른 카테고리는 주소(?c=slug)에 남겨 새로고침·뒤로 가기·링크 공유에서도
 * 그대로 돌아온다. 카테고리를 여는 길은 여럿이다 — Finder 사이드바, Dock,
 * 메뉴 막대, 데스크톱 폴더. 모두 여기로 모인다.
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

// 카테고리 이름과 구체 상태는 Finder 사이드바가 이미 들고 있다.
const categories = new Map(
  $$('.finder__item[data-category]', win).map((a) => [
    a.dataset.category,
    { name: $('.finder__label', a).textContent.trim(), orb: a.dataset.orb || 'listening' },
  ]),
);

const state = { category: '', query: '' };

// 목록 주소. 글 창이 앞에 있으면 주소창은 그 글을 가리키므로, 목록 쪽 주소는
// history.state.list 에 따로 적어 둔다(docs.js).
function readURL() {
  const list = history.state?.list ?? location.pathname + location.search;
  const c = new URL(list, location.origin).searchParams.get('c') || '';
  state.category = categories.has(c) ? c : '';
}

// 주소에는 카테고리만 남긴다(건너뛰기 링크 따위의 #조각은 떼어 낸다).
function urlFor(category) {
  const url = new URL(history.state?.list ?? location.pathname + location.search, location.origin);
  if (category) url.searchParams.set('c', category);
  else url.searchParams.delete('c');
  return url.pathname + url.search;
}

// ── 그리기 ──────────────────────────────────────────────────────
function render() {
  const { category, query } = state;
  let shown = 0;

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

  const meta = categories.get(category) ?? { name: '전체', orb: 'listening' };
  title.textContent = meta.name;
  // 아래 상태 막대의 글 수는 role=status 라 바뀔 때 읽힌다. 같은 글을 다시 쓰면
  // 괜히 읽히므로 바뀔 때만 쓴다.
  const said = query ? `${shown}개 일치` : `${shown}개 항목`;
  if (status.textContent !== said) status.textContent = said;
  const pageTitle = category ? `${meta.name} · ${baseTitle}` : baseTitle;
  // 글 창이 앞에 있으면 쪽 제목은 그 글의 것이다. Finder 가 앞일 때만 바꾼다.
  if (win.classList.contains('is-front') || !document.querySelector('.window.is-front')) document.title = pageTitle;

  empty.hidden = shown > 0;
  emptyQuery.textContent = search.value.trim();

  for (const a of $$('a[data-category]:not([data-no-current])')) {
    if (a.dataset.category === category) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  }

  dispatchEvent(new CustomEvent('ephemeris:category', { detail: { category, orb: meta.orb, title: pageTitle } }));
}

function select(category) {
  openWindow(win);
  if (category !== state.category) {
    state.category = category;
    const url = urlFor(category);
    // 열린 글 창 목록(docs)은 그대로 이어 적는다.
    history.pushState({ ...(history.state || {}), c: category, list: url }, '', url);
    render();
    list.scrollTop = 0;
  }
}

// ── 카테고리 링크 ───────────────────────────────────────────────
// 데스크톱 폴더는 따로 다룬다(아래). 그 밖의 카테고리 링크는 여기서 가로챈다.
// 나중에 열린 글 창 안의 링크도 잡도록 문서 전체에서 듣는다.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-category]:not([data-desktop-icon])');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  select(a.dataset.category);
});

// 뒤로·앞으로: 카테고리가 바뀌었다면 닫아 둔 Finder 도 다시 띄운다.
addEventListener('popstate', () => {
  const before = state.category;
  readURL();
  if (state.category === before) return;
  render();
  openWindow(win);
});

// ── 데스크톱 폴더 ───────────────────────────────────────────────
// 맥처럼 한 번 누르면 고르고, 두 번 누르면 연다. 키보드는 ↩ 로 연다.
// 손가락으로는 두 번 누르기가 어색하니 한 번에 연다.
function selectIcon(icon) {
  for (const i of icons) i.classList.toggle('is-selected', i === icon);
}

function openIcon(icon) {
  selectIcon(icon);
  if (icon.dataset.category !== undefined) {
    select(icon.dataset.category);
    return;
  }
  // About.txt 따위: 첫 화면이면 docs.js 가 창으로 연다. 아니면 그 쪽으로.
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
search.addEventListener('input', () => {
  state.query = search.value.trim().toLowerCase().normalize('NFC');
  clear.hidden = !search.value;
  render();
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
