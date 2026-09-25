/*
 * Obsidian: 글을 노트처럼 읽는 창
 *
 * Dock 의 Obsidian 을 누르면 뜬다(desktop.js 가 이 모듈을 그때 불러온다).
 * 왼쪽은 보관함(vault)의 파일 탐색기: 카테고리가 폴더, 글이 노트다. 노트를
 * 고르면 오른쪽 읽기 보기에 그 글의 속성(날짜 · 태그 · 설명)과 본문이 뜬다.
 * 본문은 그 글의 쪽을 받아 와 본문(.post-content)만 옮겨 담는다.
 *
 * 폴더는 처음에 모두 접혀 있다(검색하면 맞는 노트가 든 폴더만 펼친다).
 * 창은 하나만 뜬다. 다시 누르면 그 창이 앞으로 오고, 닫으면 치운다.
 * 폰에서는 탐색기와 읽기 보기가 한 화면씩 번갈아 나온다.
 */
import { setupWindow, focusWindow, closeWindow, setCloser, openWindow, flyTo } from './windows.js';
import { loadPosts } from './posts.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const NARROW = matchMedia('(max-width: 899px)');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let win = null;
let dockButton = null;
const pages = new Map(); // 주소 → 받아 온 본문(Promise<Element>)

const traffic = `
  <div class="traffic" role="group" aria-label="창 조작">
    <button class="traffic__btn traffic__btn--close" type="button" data-window-action="close" aria-label="닫기"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg></button>
    <button class="traffic__btn traffic__btn--min" type="button" data-window-action="minimize" aria-label="최소화"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-minus"/></svg></button>
    <button class="traffic__btn traffic__btn--zoom" type="button" data-window-action="zoom" aria-label="확대" aria-pressed="false"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-zoom"/></svg></button>
  </div>`;

const chevron = '<svg class="icon obsidian__chev" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-chevron-right"/></svg>';

function build() {
  const el = document.createElement('section');
  el.className = 'window obsidian';
  el.dataset.window = 'obsidian';
  el.dataset.dynamic = '';
  el.tabIndex = -1;
  el.setAttribute('aria-labelledby', 'obsidian-title');
  el.innerHTML = `
    <aside class="obsidian__side" aria-label="파일 탐색기">
      <div class="obsidian__chrome" data-window-drag>${traffic}</div>
      <div class="obsidian__vault">
        <h2 class="obsidian__vault-name" id="obsidian-title">Ephemeris</h2>
        <span class="obsidian__count" data-obs-count></span>
      </div>
      <label class="obsidian__search">
        <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-search"/></svg>
        <input type="search" placeholder="노트 검색" aria-label="노트 검색" autocomplete="off" spellcheck="false" data-obs-search>
      </label>
      <nav class="obsidian__tree" aria-label="노트" data-obs-tree><p class="obsidian__hint">불러오는 중…</p></nav>
    </aside>
    <div class="obsidian__main">
      <header class="obsidian__bar" data-window-drag>
        <button class="obsidian__back" type="button" data-obs-back>
          <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-chevron-left"/></svg>노트
        </button>
        <p class="obsidian__tab" data-obs-tab>노트를 고르세요</p>
        <button class="obsidian__close" type="button" data-window-action="close" aria-label="Obsidian 닫기">
          <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg>
        </button>
      </header>
      <div class="obsidian__view" role="region" aria-label="노트 읽기" tabindex="0" data-scroll data-obs-view></div>
      <footer class="obsidian__status" data-obs-status></footer>
    </div>`;
  return el;
}

// ── 파일 탐색기 ────────────────────────────────────────────────
function folders(posts, order) {
  const map = new Map(order.map((slug) => [slug, { slug, name: '', notes: [] }]));
  for (const p of posts) {
    const key = p.slug || '_';
    if (!map.has(key)) map.set(key, { slug: key, name: '', notes: [] });
    const f = map.get(key);
    f.name ||= p.category || '분류 없음';
    f.notes.push(p);
  }
  return [...map.values()].filter((f) => f.notes.length);
}

function renderTree(all, query = '') {
  const tree = $('[data-obs-tree]', win);
  const q = query.trim().toLowerCase();
  const posts = q
    ? all.filter((p) => `${p.title} ${p.description || ''} ${p.category || ''}`.toLowerCase().includes(q))
    : all;
  if (!posts.length) {
    tree.innerHTML = `<p class="obsidian__hint">‘${esc(query.trim())}’와 맞는 노트가 없습니다</p>`;
    return;
  }
  const order = (dockButton?.dataset.folders || '').split(' ').filter(Boolean);
  const current = win.dataset.note;
  tree.innerHTML = folders(posts, order)
    .map(
      (f) => `<details class="obsidian__folder"${q ? ' open' : ''}>
        <summary>${chevron}<span class="obsidian__folder-name">${esc(f.name)}</span></summary>
        <ul>${f.notes
          .map(
            (p) => `<li><button class="obsidian__note" type="button" data-note="${esc(p.url)}"${
              p.url === current ? ' aria-current="true"' : ''
            }><img class="obsidian__file" src="/assets/images/dock/file-txt-32.png" srcset="/assets/images/dock/file-txt-32.png 1x, /assets/images/dock/file-txt-64.png 2x" alt="" width="16" height="16" draggable="false"><span>${esc(p.title)}</span></button></li>`,
          )
          .join('')}</ul>
      </details>`,
    )
    .join('');
}

// ── 읽기 보기 ──────────────────────────────────────────────────
function fetchBody(url) {
  if (!pages.has(url)) {
    const p = fetch(url, { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.text();
      })
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const body = doc.querySelector('#main-window .post-content');
        if (!body) throw new Error('본문 없음');
        // 이미 열린 글 창과 id 가 겹치지 않게 본문 제목의 id 는 뗀다.
        for (const el of body.querySelectorAll('[id]')) el.removeAttribute('id');
        return body;
      })
      .catch((err) => {
        pages.delete(url);
        throw err;
      });
    pages.set(url, p);
  }
  return pages.get(url);
}

// 코드 색(syntax.css)은 글 · 목록 쪽에만 걸려 있다. 다른 쪽에서 열면 붙인다.
function ensureSyntax() {
  if ($('link[href$="/assets/css/syntax.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/assets/css/syntax.css';
  document.head.append(link);
}

async function showNote(post, { focus = false } = {}) {
  if (!win) return;
  win.dataset.note = post.url;
  for (const b of $$('[data-note]', win)) {
    if (b.dataset.note === post.url) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  }
  $('[data-obs-tab]', win).textContent = post.title;
  const view = $('[data-obs-view]', win);
  const tag = post.category ? post.category.replace(/\s+/g, '-') : '';
  view.innerHTML = `
    <article class="obsidian__note-view">
      <h1 class="obsidian__title">${esc(post.title)}</h1>
      <dl class="obsidian__props">
        <div><dt>날짜</dt><dd>${esc(String(post.date).replace(/\./g, '-'))}</dd></div>
        ${
          post.slug
            ? `<div><dt>태그</dt><dd><a class="obsidian__tag" href="/?c=${esc(post.slug)}" data-category="${esc(post.slug)}" data-no-current>#${esc(tag)}</a></dd></div>`
            : ''
        }
        ${post.description ? `<div><dt>설명</dt><dd>${esc(post.description)}</dd></div>` : ''}
      </dl>
      <div class="obsidian__body" data-obs-body><p class="obsidian__hint">불러오는 중…</p></div>
      <p class="obsidian__open"><a href="${esc(post.url)}">문서 창으로 열기</a></p>
    </article>`;
  view.scrollTop = 0;
  win.classList.add('is-reading');
  if (focus) view.focus({ preventScroll: true });

  const status = $('[data-obs-status]', win);
  status.textContent = '';
  try {
    const body = await fetchBody(post.url);
    if (win?.dataset.note !== post.url) return; // 그새 다른 노트를 골랐다
    ensureSyntax();
    const slot = $('[data-obs-body]', win);
    slot.replaceChildren(document.importNode(body, true));
    const text = slot.textContent.trim();
    const words = text ? text.split(/\s+/).length : 0;
    status.textContent = `단어 ${words.toLocaleString('ko-KR')}개 · 글자 ${text.length.toLocaleString('ko-KR')}자`;
  } catch {
    if (win?.dataset.note !== post.url) return;
    $('[data-obs-body]', win).innerHTML =
      `<p class="obsidian__hint">본문을 불러오지 못했습니다. <a href="${esc(post.url)}">글 쪽으로 가기</a></p>`;
  }
}

// ── 창 ──────────────────────────────────────────────────────────
export async function openObsidian(button) {
  dockButton = button || dockButton;
  if (win?.isConnected) {
    await openWindow(win);
    focusWindow(win);
    return win;
  }

  win = build();
  $('#workspace').append(win);
  setupWindow(win);
  setCloser(win, (w) => {
    closeWindow(w, { remove: true });
    dockButton?.classList.remove('is-running');
    win = null;
  });
  dockButton?.classList.add('is-running');
  focusWindow(win);
  if (dockButton) flyTo(win, dockButton.getBoundingClientRect(), true);

  const self = win;
  const search = $('[data-obs-search]', win);
  let posts = [];

  win.addEventListener('click', (e) => {
    if (self !== win) return; // 닫히는 중인 창
    const note = e.target.closest('[data-note]');
    if (note) {
      const post = posts.find((p) => p.url === note.dataset.note);
      if (post) showNote(post, { focus: NARROW.matches });
      return;
    }
    if (e.target.closest('[data-obs-back]')) {
      win.classList.remove('is-reading');
      $('[data-note][aria-current]', win)?.focus();
    }
  });
  search.addEventListener('input', () => renderTree(posts, search.value));

  try {
    posts = await loadPosts();
  } catch {
    if (self === win) $('[data-obs-tree]', win).innerHTML = '<p class="obsidian__hint">노트를 불러오지 못했습니다</p>';
    return win;
  }
  if (self !== win) return self; // 불러오는 사이에 닫혔다
  $('[data-obs-count]', win).textContent = `노트 ${posts.length}개`;
  renderTree(posts);
  // 처음에는 가장 최근 글을 펼쳐 둔다. 폰에서는 탐색기부터 보인다.
  if (posts[0]) {
    await showNote(posts[0]);
    if (NARROW.matches) win.classList.remove('is-reading');
  }
  return win;
}
