/*
 * 데스크톱: 메뉴 막대 · Dock · Spotlight · 창
 *
 * 모든 쪽에서 돈다. 글 목록(finder.js)과 글(post.js)은 여기서 내보내는
 * openWindow() 따위를 가져다 쓴다.
 */
import { refractAll, createLens } from './glass.js';
import { loadPosts as fetchPosts } from './posts.js';
import { DESKTOP, openWindow, frontWindow } from './windows.js';
import './calendar.js';
import './contextmenu.js';
import './runcat.js';

export {
  DESKTOP,
  openWindow,
  closeWindow,
  minimizeWindow,
  restoreWindow,
  focusWindow,
  frontWindow,
  goBack,
  notify,
} from './windows.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const store = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch {}
  },
};

// ── 시계 ────────────────────────────────────────────────────────
// 맥의 메뉴 막대처럼 "9월 23일 (화) 오후 6:12". 좁은 화면에서는 시각만.
const clock = $('[data-clock]');
const DAYS = '일월화수목금토';
const timeFmt = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' });

function tick() {
  const now = new Date();
  const date = `${now.getMonth() + 1}월 ${now.getDate()}일 (${DAYS[now.getDay()]})`;
  clock.innerHTML = `<span class="menubar__date">${date}</span> <span>${timeFmt.format(now)}</span>`;
  clock.dateTime = now.toISOString();
  setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 20);
}
if (clock) tick();

// ── 메뉴 ────────────────────────────────────────────────────────
// 메뉴 하나가 열려 있는 동안에는 옆 메뉴 이름 위로 지나가기만 해도 그쪽이
// 열린다. 방향키로 오가고, Esc 로 닫는다.
const menus = $$('[data-menu]').map((root) => ({
  root,
  button: $('button[aria-haspopup]', root),
  panel: $('[role="menu"]', root),
}));
let openMenu = null;

// 지금 그려진 항목만(좁은 화면에서 숨긴 항목은 건너뛴다).
const itemsOf = (m) => $$('[role^="menuitem"]', m.panel).filter((el) => el.getClientRects().length > 0);
const liveMenus = () => menus.filter((x) => x.button.getClientRects().length > 0);

function showMenu(m, focus) {
  if (openMenu && openMenu !== m) hideMenu(openMenu);
  dispatchEvent(new CustomEvent('ephemeris:popup', { detail: 'menu' }));
  m.panel.hidden = false;
  m.button.setAttribute('aria-expanded', 'true');
  m.root.classList.add('is-open');
  openMenu = m;
  refractAll(m.panel);
  if (focus === 'first') itemsOf(m)[0]?.focus();
  if (focus === 'last') itemsOf(m).at(-1)?.focus();
}

function hideMenu(m, restoreFocus = false) {
  m.panel.hidden = true;
  m.button.setAttribute('aria-expanded', 'false');
  m.root.classList.remove('is-open');
  if (openMenu === m) openMenu = null;
  if (restoreFocus) m.button.focus();
}

menus.forEach((m) => {
  m.button.addEventListener('click', () => {
    if (openMenu === m) hideMenu(m);
    else showMenu(m);
  });
  m.button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showMenu(m, 'first');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      showMenu(m, 'last');
    }
  });
  m.button.addEventListener('pointerenter', () => {
    if (openMenu && openMenu !== m) showMenu(m);
  });
  m.panel.addEventListener('keydown', (e) => {
    const items = itemsOf(m);
    const at = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(at + 1) % items.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(at - 1 + items.length) % items.length].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items.at(-1).focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideMenu(m, true);
    } else if (e.key === 'Tab') {
      hideMenu(m);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      // 좁은 화면에서는 몇몇 메뉴가 숨는다. 보이는 메뉴 사이에서만 옮겨 다닌다.
      e.preventDefault();
      const live = liveMenus();
      const j = live.indexOf(m);
      if (live.length < 2 || j < 0) return;
      showMenu(live[(j + (e.key === 'ArrowRight' ? 1 : -1) + live.length) % live.length], 'first');
    }
  });
  // 항목을 고르면 닫고, 초점은 메뉴 이름으로 돌려놓는다(고른 항목이 사라지므로).
  m.panel.addEventListener('click', (e) => {
    if (e.target.closest('[role^="menuitem"]:not([aria-disabled="true"])')) hideMenu(m, true);
  });
});

document.addEventListener('pointerdown', (e) => {
  if (openMenu && !openMenu.root.contains(e.target)) hideMenu(openMenu);
});

// 달력이 열리면 메뉴는 접는다.
addEventListener('ephemeris:popup', (e) => {
  if (e.detail !== 'menu' && openMenu) hideMenu(openMenu);
});

// 마우스로 연 메뉴도 Esc 로 닫힌다(초점이 패널 밖에 있어도).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !openMenu || e.defaultPrevented) return;
  e.preventDefault();
  hideMenu(openMenu, openMenu.root.contains(document.activeElement));
});

// ── 창 ──────────────────────────────────────────────────────────
// 창 관리(옮기기·크기·붙이기·앞뒤·닫기·최소화)는 windows.js 에 있다.

// ── Dock: Liquid Glass 탭 막대 ──────────────────────────────────
// 고른 칸 뒤에 유리 렌즈가 놓인다. 칸을 누르면 렌즈가 떠올라 부풀고,
// 누른 채 옆으로 끌면 손끝을 따라 미끄러진다. 렌즈 밑에 든 칸(.is-hot)은
// 구체와 이름이 커져 돋보기 아래처럼 보인다. 놓으면 가장 가까운 칸에
// 내려앉고 그 카테고리가 열린다.
const tabs = $('[data-dock-tabs]');

export function syncDock({ instant = false } = {}) {
  if (!tabs) return;
  dockLens.moveTo($('.dock__tab[aria-current]', tabs) ?? null, { instant });
  if (!$('.dock__tab[aria-current]', tabs)) dockLens.hide();
}

// 떠오른 렌즈는 맑은 유리: 밑의 구체와 이름이 테두리에서 휘어 보인다.
const dockLens = tabs ? createLens(tabs, { glass: 'clear' }) : null;

if (tabs) {
  let press = null;

  tabs.addEventListener('pointerdown', (e) => {
    const tab = e.target.closest('.dock__tab');
    if (!tab || e.button !== 0) return;
    press = { id: e.pointerId, x: e.clientX, tab, moved: false, hot: tab };
    tab.classList.add('is-hot');
    dockLens.press(tab);
  });

  tabs.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (!press.moved && Math.abs(e.clientX - press.x) < 6) return;
    if (!press.moved) {
      press.moved = true;
      tabs.setPointerCapture(e.pointerId); // 이제부터는 끌기. 링크의 누름은 없던 일로.
      tabs.classList.add('is-scrubbing');
    }
    const hot = dockLens.follow(e.clientX);
    if (hot && hot !== press.hot) {
      press.hot?.classList.remove('is-hot');
      hot.classList.add('is-hot');
      press.hot = hot;
    }
  });

  const finish = (e) => {
    if (!press || (e && e.pointerId !== press.id)) return;
    // 손가락은 처음 닿은 요소(구체의 캔버스)가 포인터를 쥐고 있다. 끌기가 시작되어
    // 목록이 그걸 넘겨받을 때 캔버스 쪽에서 오는 '놓침'은 끝이 아니다.
    if (e && e.type === 'lostpointercapture' && e.target !== tabs) return;
    const { moved, hot } = press;
    press = null;
    hot?.classList.remove('is-hot');
    tabs.classList.remove('is-scrubbing');
    dockLens.release();
    if (moved && hot) {
      dockLens.moveTo(hot);
      // 링크를 누른 것과 똑같이 다룬다. 첫 화면이면 finder.js 가 걸러 보이고,
      // 다른 쪽이면 그 주소로 간다.
      if (!hot.hasAttribute('aria-current')) hot.click();
      else syncDock();
    } else if (!e || e.type !== 'pointerup') {
      syncDock();
    } else {
      // 끌지 않고 뗐다면 곧 click 이 온다. 렌즈는 그대로 두고 그쪽에 맡긴다.
      // 칸 밖에서 떼어 click 이 오지 않으면 원래 자리로 돌려놓는다.
      clicked = false;
      setTimeout(() => {
        if (!clicked) syncDock();
      }, 0);
    }
  };
  tabs.addEventListener('pointerup', finish);
  tabs.addEventListener('pointercancel', finish);
  tabs.addEventListener('lostpointercapture', finish);
  // 끌기가 시작되기 전에 막대 밖에서 뗀 경우(아직 포인터를 쥐지 않았다).
  document.addEventListener('pointerup', finish);
  document.addEventListener('pointercancel', finish);

  // 링크를 곧장 누른 경우: 다른 쪽으로 넘어가는 동안 렌즈가 먼저 그 칸으로 간다.
  let clicked = false;
  tabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.dock__tab');
    if (!tab) return;
    clicked = true;
    // ⌘·Ctrl 로 새 탭에 여는 경우엔 이 쪽은 그대로다.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) syncDock();
    else dockLens.moveTo(tab);
  });

  new ResizeObserver(() => syncDock({ instant: true })).observe(tabs);
  syncDock({ instant: true });
}

// ── Spotlight ───────────────────────────────────────────────────
// 입력 칸(combobox)이 초점을 쥔 채, 방향키로 목록(listbox)의 선택지를 옮긴다.
// 선택지 안에는 링크를 두지 않는다(선택지 자체가 누를 수 있는 것이다).
const spot = $('[data-spotlight]');
const spotInput = $('[data-spotlight-input]');
const spotList = $('[data-spotlight-results]');
const spotNone = $('[data-spotlight-none]');
const spotStatus = $('[data-spotlight-status]');
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
let posts = null;
let loadError = false;
let hits = [];
let active = 0;
let gen = 0; // 그릴 때마다 선택지 id 를 새로 매겨, 화면 낭독기가 바뀐 걸 알아채게

const norm = (s) => (s || '').normalize('NFC').toLowerCase();

// 한글 음절을 첫소리로 바꾼다. "데이터베이스" → "ㄷㅇㅌㅂㅇㅅ"
function choseong(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out += c >= 0xac00 && c <= 0xd7a3 ? CHO[Math.floor((c - 0xac00) / 588)] : ch;
  }
  return out;
}

async function loadPosts() {
  if (posts) return posts;
  posts = (await fetchPosts()).map((p) => ({
    ...p,
    hay: norm(`${p.title} ${p.description} ${p.category} ${p.short || ''}`),
    cho: choseong(norm(p.title)).replace(/\s+/g, ''),
  }));
  return posts;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function mark(title, q) {
  const i = q ? norm(title).indexOf(q) : -1;
  if (i < 0) return escapeHTML(title);
  return `${escapeHTML(title.slice(0, i))}<mark>${escapeHTML(title.slice(i, i + q.length))}</mark>${escapeHTML(title.slice(i + q.length))}`;
}

function search(qRaw) {
  const q = norm(qRaw.trim());
  if (!posts) return { label: '', list: [], q };
  if (!q) return { label: '최근 글', list: posts.slice(0, 6), q };
  const onlyCho = /^[ㄱ-ㅎ\s]+$/.test(q);
  const qc = q.replace(/\s+/g, '');
  const scored = [];
  for (const p of posts) {
    const t = norm(p.title);
    let score = 0;
    if (t.startsWith(q)) score = 4;
    else if (t.includes(q)) score = 3;
    else if (onlyCho && p.cho.includes(qc)) score = 2;
    else if (p.hay.includes(q)) score = 1;
    if (score) scored.push({ p, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return { label: '글', list: scored.slice(0, 8).map((s) => s.p), q };
}

const optionId = (i) => `spot-${gen}-${i}`;

function renderSpot() {
  const { label, list, q } = search(spotInput.value);
  hits = list;
  gen++;
  active = Math.min(active, Math.max(0, hits.length - 1));

  let message = '';
  if (!posts) message = loadError ? '글 목록을 불러오지 못했습니다' : '불러오는 중…';
  else if (!hits.length) message = `“${spotInput.value.trim()}”에 대한 결과 없음`;

  if (message) {
    spotList.hidden = true;
    spotList.innerHTML = '';
    spotNone.hidden = false;
    spotNone.textContent = message;
    spotInput.removeAttribute('aria-activedescendant');
    spotInput.setAttribute('aria-expanded', 'false');
  } else {
    spotNone.hidden = true;
    spotList.hidden = false;
    spotList.setAttribute('aria-label', label);
    spotList.innerHTML =
      `<li class="spotlight__group" aria-hidden="true">${label}</li>` +
      hits
        .map(
          (p, i) => `<li class="spotlight__hit" role="option" id="${optionId(i)}" data-i="${i}" data-href="${escapeHTML(p.url)}" aria-selected="${i === active}">
            <span class="spotlight__row">
              <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-${escapeHTML(p.icon)}"/></svg>
              <span class="spotlight__title">${mark(p.title, q)}</span>
              <span class="spotlight__meta">${escapeHTML(p.category || '')} · ${escapeHTML(p.date)}</span>
            </span>
          </li>`,
        )
        .join('');
    spotInput.setAttribute('aria-expanded', 'true');
    spotInput.setAttribute('aria-activedescendant', optionId(active));
  }

  // 결과 수를 알린다(처음 열 때의 '최근 글'은 조용히).
  if (spotStatus) {
    spotStatus.textContent = !posts
      ? loadError ? message : ''
      : q ? (hits.length ? `${hits.length}개 결과` : '결과 없음') : '';
  }
}

function moveActive(delta) {
  if (!hits.length) return;
  active = (active + delta + hits.length) % hits.length;
  for (const li of $$('[role="option"]', spotList)) {
    li.setAttribute('aria-selected', String(Number(li.dataset.i) === active));
  }
  spotInput.setAttribute('aria-activedescendant', optionId(active));
  document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
}

function openHit(href, newTab) {
  if (!href) return;
  if (newTab) {
    window.open(href, '_blank', 'noopener');
    return;
  }
  // 첫 화면이면 docs.js 가 글을 창으로 연다. 아니면 그 쪽으로 넘어간다.
  const ev = new CustomEvent('ephemeris:open', { detail: { href }, cancelable: true });
  if (!dispatchEvent(ev)) spot.close();
  else location.href = href;
}

export function openSpotlight() {
  if (!spot || spot.open) return;
  // 메뉴에서 열었다면, 닫을 때 초점이 돌아올 곳은 (사라질) 메뉴 항목이 아니라 메뉴 이름이다.
  if (openMenu) hideMenu(openMenu, openMenu.root.contains(document.activeElement));
  spotInput.value = '';
  active = 0;
  loadError = false;
  spot.showModal();
  refractAll(spot);
  renderSpot();
  loadPosts()
    .then(renderSpot)
    .catch(() => {
      loadError = true;
      renderSpot();
    });
}

if (spot) {
  spotInput.addEventListener('input', () => {
    active = 0;
    renderSpot();
  });
  spotInput.addEventListener('keydown', (e) => {
    // 한글을 조합하는 중의 ↩ 는 글자를 확정할 뿐이다(Safari 는 keyCode 229 로 온다).
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault();
      openHit(hits[active].url, e.metaKey || e.ctrlKey);
    }
  });
  spotList.addEventListener('pointermove', (e) => {
    const li = e.target.closest('[role="option"]');
    if (li && Number(li.dataset.i) !== active) moveActive(Number(li.dataset.i) - active);
  });
  spotList.addEventListener('click', (e) => {
    const li = e.target.closest('[role="option"]');
    if (li) openHit(li.dataset.href, e.metaKey || e.ctrlKey);
  });
  // 패널 바깥(흐린 배경)을 누르면 닫힌다.
  spot.addEventListener('click', (e) => {
    if (e.target === spot) spot.close();
  });
  for (const btn of $$('[data-open-spotlight]')) btn.addEventListener('click', openSpotlight);
}

document.addEventListener('keydown', (e) => {
  if ((e.key === 'k' || e.key === 'K') && (isMac ? e.metaKey : e.ctrlKey) && !e.altKey) {
    e.preventDefault();
    if (spot?.open) spot.close();
    else openSpotlight();
  }
});
if (!isMac) {
  for (const kbd of $$('.menu__kbd')) kbd.textContent = 'Ctrl K';
  $('[data-open-spotlight][aria-label]')?.setAttribute('aria-label', 'Spotlight 검색 (Ctrl+K)');
}

// ── 움직임 멈추기 ───────────────────────────────────────────────
// 구체와 고양이는 쉬지 않고 돈다. 화면 안에서 멈출 수 있어야 한다(로고 메뉴).
const STILL = 'ephemeris:still';
function applyStill(on) {
  document.documentElement.classList.toggle('is-still', on);
  for (const orb of $$('thinking-orb')) {
    if (on && !orb.hasAttribute('paused')) {
      orb.dataset.still = '';
      orb.setAttribute('paused', '');
    } else if (!on && orb.hasAttribute('data-still')) {
      delete orb.dataset.still;
      if (!orb.hasAttribute('data-held')) orb.removeAttribute('paused');
    }
  }
  $('[data-still-toggle]')?.setAttribute('aria-checked', String(on));
  dispatchEvent(new Event('ephemeris:still'));
}
applyStill(store.get(STILL) === '1');
$('[data-still-toggle]')?.addEventListener('click', () => {
  const on = store.get(STILL) !== '1';
  store.set(STILL, on ? '1' : '0');
  applyStill(on);
});

// ── 본문으로 건너뛰기 ───────────────────────────────────────────
// 앞에 선 창을(숨어 있었다면 다시 띄워) 그 안의 스크롤 칸으로 들어간다.
// 주소에 #main-window 를 남기지 않는다.
$('.skip-link')?.addEventListener('click', (e) => {
  const win = frontWindow() ?? $('#main-window');
  if (!win) return;
  e.preventDefault();
  Promise.resolve(openWindow(win)).then(() => ($('[data-scroll]', win) ?? win).focus());
});

// ── 스크롤 자리 ─────────────────────────────────────────────────
// 창 안에서 스크롤하므로 브라우저가 자리를 기억해 주지 않는다. 뒤로 가기나
// 새로고침으로 돌아왔을 때 떠날 때의 자리로 되돌린다(목차로 옮겨 주소에 #절이
// 붙어 있어도 — 브라우저는 창 안의 상자까지 그 절로 옮겨 주지 않는다).
const scrollers = $$('[data-scroll]');
const scrollKey = (el) => `ephemeris:scroll:${location.pathname}${location.search}:${el.dataset.scroll}`;

addEventListener('pagehide', () => {
  for (const el of scrollers) {
    try { sessionStorage.setItem(scrollKey(el), String(Math.round(el.scrollTop))); } catch {}
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const nav = performance.getEntriesByType('navigation')[0];
  const returning = nav && (nav.type === 'back_forward' || nav.type === 'reload');
  for (const el of scrollers) {
    let y = null;
    try { y = sessionStorage.getItem(scrollKey(el)); } catch {}
    if (returning && y) el.scrollTop = Number(y);
  }
  // 방향키·스페이스로 곧장 스크롤할 수 있게, 앞에 선 창의 본문에 초점을 둔다.
  // 이렇게 들어간 초점에는 테두리를 그리지 않는다. 사용자가 키를 누르면 그때부터 그린다.
  const main = $('#main-window [data-scroll]');
  if (main && document.activeElement === document.body && !location.hash) {
    main.dataset.autofocus = '';
    const clear = () => delete main.dataset.autofocus;
    main.addEventListener('blur', clear, { once: true });
    addEventListener('keydown', clear, { once: true, capture: true });
    main.focus({ preventScroll: true });
  }
});

// ── 카테고리가 바뀌면 ───────────────────────────────────────────
// finder.js 가 알린다. Dock 의 렌즈가 그 칸으로 옮겨 간다.
addEventListener('ephemeris:category', () => syncDock());

document.documentElement.classList.add('is-ready');
