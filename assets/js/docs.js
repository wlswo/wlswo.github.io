/*
 * 첫 화면에서 글을 창으로 열기
 *
 * 맥에서 Finder 의 문서를 열면 Finder 는 그대로 있고 그 위에 문서 창이 뜬다.
 * 여기서도 목록의 글을 누르면 쪽을 넘기지 않고, 그 글의 창을 받아 와 Finder
 * 위에 띄운다. 여러 편을 열 수 있고, 새 창은 앞 창에서 조금씩 비껴 앉는다.
 * 이미 열린 글을 다시 누르면 그 창이 맨 앞으로 온다.
 *
 * 주소는 맨 앞의 창을 따른다(글 창이면 그 글의 주소, Finder 면 목록 주소).
 * 그래서 새로고침하거나 주소를 나누면 그 글의 쪽이 곧장 열린다. 열린 글 창들은
 * history.state.docs 에 적어 두어, 뒤로·앞으로 가기가 창을 닫고 다시 연다
 * (폰에서는 뒤로 가기가 곧 '창 닫기'다).
 *
 * 받아 오지 못하면(오프라인 따위) 그냥 그 쪽으로 넘어간다.
 */
import { setupWindow, focusWindow, closeWindow, setCloser, flyTo, restoreWindow } from './windows.js';
import { initDoc } from './post.js';

const $ = (sel, root = document) => root.querySelector(sel);

const workspace = $('#workspace');
const finder = $('[data-window="finder"]');
const open = new Map(); // 주소 → 창
const pages = new Map(); // 주소 → 받아 온 문서(Promise)
let seq = 0;
let listTitle = document.title;

const isDocURL = (u) =>
  u.origin === location.origin && (/^\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/$/.test(u.pathname) || u.pathname === '/about/');

const docsInState = () => history.state?.docs ?? [];
const listURL = () => history.state?.list ?? '/';

// 목록 쪽 상태를 처음 한 번 적어 둔다(finder.js 가 카테고리를 바꿀 때 이어 쓴다).
history.replaceState({ ...(history.state || {}), list: location.pathname + location.search, docs: [] }, '');

function fetchPage(path) {
  if (!pages.has(path)) {
    const p = fetch(path, { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.text();
      })
      .then((html) => new DOMParser().parseFromString(html, 'text/html'))
      .catch((err) => {
        pages.delete(path);
        throw err;
      });
    pages.set(path, p);
  }
  return pages.get(path);
}

// 받아 온 창 안의 id(창 틀의 것만 — 본문 제목의 id 는 절 링크라 그대로 둔다)를
// 겹치지 않게 바꾸고, 그 id 를 가리키던 aria 속성도 함께 고친다.
function uniquify(win, n) {
  const map = new Map();
  win.id = `win-${n}`;
  for (const el of win.querySelectorAll('[id]')) {
    if (el.closest('.post-content')) continue;
    const next = `${el.id}-w${n}`;
    map.set(el.id, next);
    el.id = next;
  }
  const refs = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'for'];
  for (const el of [win, ...win.querySelectorAll(refs.map((a) => `[${a}]`).join(','))]) {
    for (const a of refs) {
      const v = el.getAttribute(a);
      if (v) el.setAttribute(a, v.split(/\s+/).map((id) => map.get(id) ?? id).join(' '));
    }
  }
}

function setDocs(docs, url, push = false) {
  const state = { ...(history.state || {}), docs };
  if (push) history.pushState(state, '', url);
  else history.replaceState(state, '', url);
}

/** 글 창 닫기: 창을 치우고, 주소는 그 다음 앞 창(없으면 목록)으로. */
function closeDoc(win, { record = true } = {}) {
  const path = win.dataset.path;
  if (open.get(path) === win) open.delete(path);
  if (record) {
    const docs = docsInState().filter((p) => p !== path);
    const next = [...open.values()].filter((w) => w !== win).sort((a, b) => (Number(b.style.zIndex) || 0) - (Number(a.style.zIndex) || 0))[0];
    setDocs(docs, next ? next.dataset.path : listURL());
  }
  closeWindow(win, { remove: true });
}

/**
 * 글 창 열기.
 *   from     어디서 나왔는지(누른 목록 줄). 창이 그 자리에서 커지며 나온다.
 *   replace  이 창 자리에 바꿔 연다(글 창 안의 '이전 글·다음 글').
 *   hash     열고 나서 그 절로 옮긴다.
 */
export async function openDoc(path, { push = true, from = null, replace = null, hash = '' } = {}) {
  const already = open.get(path);
  if (already?.isConnected) {
    await restoreWindow(already);
    focusWindow(already);
    if (push && location.pathname !== path) setDocs([...docsInState().filter((p) => p !== path), path], path, true);
    return already;
  }

  let page;
  try {
    page = await fetchPage(path);
  } catch {
    location.href = path + hash;
    return null;
  }
  const src = page.querySelector('#main-window');
  if (!src) {
    location.href = path + hash;
    return null;
  }

  const win = document.importNode(src, true);
  const n = ++seq;
  uniquify(win, n);
  win.dataset.dynamic = '';
  win.dataset.path = path;
  win.dataset.title = page.title;

  if (push) setDocs([...docsInState().filter((p) => p !== path && (!replace || p !== replace.dataset.path)), path], path, true);

  // 바꿔 여는 경우엔 앞 창의 자리를 그대로 물려받는다.
  if (replace) {
    for (const k of ['--x', '--y', '--w', '--h']) {
      const v = replace.style.getPropertyValue(k);
      if (v) win.style.setProperty(k, v);
    }
    win.classList.toggle('has-frame', replace.classList.contains('has-frame'));
    win.classList.toggle('is-zoomed', replace.classList.contains('is-zoomed'));
  }

  workspace.append(win);
  const others = [...open.values()].filter((w) => w.isConnected && w !== replace).length;
  setupWindow(win, { cascade: replace ? 0 : others * 26, keepFrame: !!replace });
  setCloser(win, (w) => closeDoc(w));
  open.set(path, win);
  initDoc(win);
  focusWindow(win);

  if (replace) closeDoc(replace, { record: false });
  else if (from) flyTo(win, from.getBoundingClientRect(), true);

  if (hash) {
    const target = win.querySelector(`[id="${CSS.escape(decodeURIComponent(hash.slice(1)))}"]`);
    target?.scrollIntoView({ block: 'start' });
  }
  $('[data-scroll]', win)?.focus({ preventScroll: true });
  return win;
}

// ── 앞 창이 바뀌면 주소와 제목도 ───────────────────────────────
addEventListener('ephemeris:focus', (e) => {
  const win = e.detail.win;
  if (win?.dataset.path) {
    if (location.pathname !== win.dataset.path) history.replaceState(history.state, '', win.dataset.path);
    document.title = win.dataset.title || document.title;
  } else {
    const list = listURL();
    if (location.pathname + location.search !== list) history.replaceState(history.state, '', list);
    document.title = listTitle;
  }
});

// Finder 의 제목(카테고리)이 바뀌면 기억해 둔다. Finder 가 앞으로 오면 그 제목을 쓴다.
addEventListener('ephemeris:category', (e) => {
  if (e.detail.title) listTitle = e.detail.title;
});

// ── 뒤로 · 앞으로 ──────────────────────────────────────────────
addEventListener('popstate', () => {
  const want = docsInState();
  for (const [path, w] of [...open]) if (!want.includes(path)) closeDoc(w, { record: false });
  for (const path of want) if (!open.has(path)) openDoc(path, { push: false });
  const here = open.get(location.pathname);
  if (here) focusWindow(here);
  else if (finder && !finder.classList.contains('is-closed')) focusWindow(finder);
});

// ── 링크를 창으로 ──────────────────────────────────────────────
// 목록의 글, 최근 글 메뉴, 달력의 글, 글 창 안의 '이전·다음 글', About.
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
  const u = new URL(a.href, location.href);
  if (!isDocURL(u)) return;
  // 글 안의 같은 쪽 절 링크(#…)는 그대로 둔다.
  if (u.pathname === location.pathname && u.hash && a.closest('.post-content')) return;
  e.preventDefault();
  const inDoc = a.closest('[data-dynamic]');
  openDoc(u.pathname, {
    from: a.closest('.row__link, .desktop-icon'),
    replace: inDoc && a.closest('.pager') ? inDoc : null,
    hash: u.hash,
  });
});

// Spotlight 에서 ↩ 로 고른 글도 창으로.
addEventListener('ephemeris:open', (e) => {
  const u = new URL(e.detail.href, location.href);
  if (!isDocURL(u)) return;
  e.preventDefault();
  openDoc(u.pathname, { hash: u.hash });
});
