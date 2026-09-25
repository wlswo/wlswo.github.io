/*
 * 메모: 맥의 메모 앱
 *
 * 왼쪽은 메모 목록(맨 위에 '고정됨'), 오른쪽은 편집기. 맨 위의 '📍about me'는
 * 사이트 주인이 쓴 잠긴 메모다(_data/about_me.yml → dock.html 의 #site-data).
 * 방문자는 새 메모를 쓰고, 고치고, 지울 수 있다. 쓴 메모는 이 브라우저의
 * localStorage 에만 저장된다(다른 기기나 다른 사람에게는 보이지 않는다).
 *
 * 맥처럼 첫 줄이 제목이 되고, 비워 둔 새 메모는 다른 메모로 옮겨 가면 사라진다.
 * 바탕의 About.txt 를 열면 이 앱이 about me 메모를 펼친 채로 뜬다.
 */
import { setupWindow, focusWindow, closeWindow, setCloser, openWindow, flyTo } from './windows.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const NARROW = matchMedia('(max-width: 899px)');
const KEY = 'ephemeris:notes';
const ABOUT = 'about-me';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let win = null;
let dockButton = null;
let notes = []; // [{ id, text, updated }]
let current = ABOUT;
let query = '';
let saveTimer = 0;

// ── 저장 ────────────────────────────────────────────────────────
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    notes = Array.isArray(v) ? v.filter((n) => n && typeof n.text === 'string') : [];
  } catch {
    notes = [];
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    // 저장 공간이 없거나 막혀 있으면(사생활 보호 창 따위) 이 창에서만 쓴다.
  }
}

// ── 사이트 정보(about me) ───────────────────────────────────────
function site() {
  try {
    return JSON.parse($('#site-data')?.textContent || '{}');
  } catch {
    return {};
  }
}

function aboutNote() {
  const s = site();
  const about = s.about || { title: '📍about me', bullets: [] };
  const fill = (t) => String(t).replace('{posts}', s.posts ?? '').replace('{latest}', s.latest ?? '');
  return { id: ABOUT, title: about.title, bullets: (about.bullets || []).map(fill), locked: true };
}

// ── 글자 다루기 ─────────────────────────────────────────────────
const titleOf = (n) => (n.locked ? n.title : n.text.split('\n').find((l) => l.trim())?.trim() || '새로운 메모');
function previewOf(n) {
  if (n.locked) return n.bullets[0] || '';
  const lines = n.text.split('\n').filter((l) => l.trim());
  return lines[1]?.trim() || '추가 텍스트 없음';
}
const dateFmt = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const shortFmt = new Intl.DateTimeFormat('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' });
function when(ts, long = false) {
  if (!ts) return '';
  const d = new Date(ts);
  if (long) return dateFmt.format(d);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(d)
    : shortFmt.format(d);
}

// ── 창 ──────────────────────────────────────────────────────────
const traffic = `
  <div class="traffic" role="group" aria-label="창 조작">
    <button class="traffic__btn traffic__btn--close" type="button" data-window-action="close" aria-label="닫기"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg></button>
    <button class="traffic__btn traffic__btn--min" type="button" data-window-action="minimize" aria-label="최소화"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-minus"/></svg></button>
    <button class="traffic__btn traffic__btn--zoom" type="button" data-window-action="zoom" aria-label="확대" aria-pressed="false"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-zoom"/></svg></button>
  </div>`;

const ICON = {
  compose:
    '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M9.2 3.6H5a1.6 1.6 0 0 0-1.6 1.6v9.8A1.6 1.6 0 0 0 5 16.6h9.8a1.6 1.6 0 0 0 1.6-1.6v-4.2"/><path d="M14.6 2.8a1.5 1.5 0 0 1 2.1 2.1L10 11.6l-2.8.7.7-2.8z"/></svg>',
  trash:
    '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.8 5.4h12.4M8 5.4V3.8h4v1.6M5.4 5.4l.8 10.2a1.4 1.4 0 0 0 1.4 1.3h4.8a1.4 1.4 0 0 0 1.4-1.3l.8-10.2M8.6 8.4v5.4M11.4 8.4v5.4"/></svg>',
  pin: '<svg class="icon notes__pin" viewBox="0 0 20 20" aria-hidden="true"><path d="M7.4 2.8h5.2l-.8 4.6 2.8 2.8H5.4l2.8-2.8zM10 10.2v6.6"/></svg>',
  lock: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-lock"/></svg>',
  back: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-chevron-left"/></svg>',
  close: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg>',
};

function build() {
  const el = document.createElement('section');
  el.className = 'window notes';
  el.dataset.window = 'notes';
  el.dataset.dynamic = '';
  el.tabIndex = -1;
  el.setAttribute('aria-labelledby', 'notes-title');
  el.innerHTML = `
    <aside class="notes__side" aria-label="메모 목록">
      <div class="notes__chrome" data-window-drag>
        ${traffic}
        <button class="notes__tool notes__compose" type="button" data-notes-new aria-label="새로운 메모">${ICON.compose}</button>
        <button class="notes__close" type="button" data-window-action="close" aria-label="메모 닫기">${ICON.close}</button>
      </div>
      <div class="notes__head">
        <h2 class="notes__title" id="notes-title">메모</h2>
        <span class="notes__count" data-notes-count></span>
      </div>
      <label class="notes__search">
        <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-search"/></svg>
        <input type="search" placeholder="검색" aria-label="메모 검색" autocomplete="off" spellcheck="false" data-notes-search>
      </label>
      <div class="notes__list" data-notes-list role="listbox" aria-label="메모"></div>
    </aside>
    <div class="notes__main">
      <header class="notes__bar" data-window-drag>
        <button class="notes__tool notes__back" type="button" data-notes-back aria-label="메모 목록으로">${ICON.back}<span>메모</span></button>
        <span class="notes__spacer"></span>
        <button class="notes__tool" type="button" data-notes-delete aria-label="메모 삭제">${ICON.trash}</button>
        <button class="notes__tool" type="button" data-notes-new aria-label="새로운 메모">${ICON.compose}</button>
      </header>
      <div class="notes__page" data-notes-page></div>
    </div>`;
  return el;
}

// ── 그리기 ──────────────────────────────────────────────────────
function allNotes() {
  const mine = [...notes].sort((a, b) => b.updated - a.updated);
  return { pinned: [aboutNote()], mine };
}

function matches(n) {
  if (!query) return true;
  const text = n.locked ? `${n.title} ${n.bullets.join(' ')}` : n.text;
  return text.toLowerCase().includes(query);
}

function item(n) {
  const on = n.id === current;
  return `<button class="notes__item${on ? ' is-current' : ''}" type="button" role="option" aria-selected="${on}" data-note="${esc(n.id)}">
    <span class="notes__item-title">${n.locked ? ICON.lock : ''}${esc(titleOf(n))}</span>
    <span class="notes__item-meta"><span class="notes__item-date">${n.locked ? '고정됨' : esc(when(n.updated))}</span> ${esc(previewOf(n))}</span>
  </button>`;
}

function renderList() {
  const { pinned, mine } = allNotes();
  const p = pinned.filter(matches);
  const m = mine.filter(matches);
  let html = '';
  if (p.length) html += `<p class="notes__group">${ICON.pin}고정됨</p>${p.map(item).join('')}`;
  if (m.length) html += `<p class="notes__group">메모</p>${m.map(item).join('')}`;
  if (!html) html = `<p class="notes__empty">‘${esc(query)}’와 맞는 메모가 없습니다</p>`;
  $('[data-notes-list]', win).innerHTML = html;
  $('[data-notes-count]', win).textContent = `${notes.length + 1}개`;
}

function renderPage({ focus = false } = {}) {
  const page = $('[data-notes-page]', win);
  const del = $('[data-notes-delete]', win);
  if (current === ABOUT) {
    const a = aboutNote();
    del.disabled = true;
    del.title = '고정된 메모는 지울 수 없습니다';
    page.innerHTML = `
      <p class="notes__date">${ICON.lock} 잠긴 메모 · 사이트 주인이 쓴 글</p>
      <article class="notes__doc">
        <h1 class="notes__doc-title">${esc(a.title)}</h1>
        <ul class="notes__bullets">${a.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      </article>`;
    return;
  }
  const n = notes.find((x) => x.id === current);
  if (!n) {
    current = ABOUT;
    return renderPage();
  }
  del.disabled = false;
  del.title = '';
  page.innerHTML = `
    <p class="notes__date" data-notes-date>${esc(when(n.updated, true))}</p>
    <textarea class="notes__editor" aria-label="메모 내용(첫 줄이 제목)" placeholder="제목을 쓰고 Enter…" spellcheck="false" data-notes-editor></textarea>`;
  const ta = $('[data-notes-editor]', page);
  ta.value = n.text;
  if (focus) {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }
}

// 비워 둔 새 메모는 떠날 때 치운다(맥처럼).
function dropIfEmpty(id) {
  const n = notes.find((x) => x.id === id);
  if (n && !n.text.trim()) {
    notes = notes.filter((x) => x !== n);
    save();
  }
}

function open(id, { focus = false } = {}) {
  if (id !== current) dropIfEmpty(current);
  current = id;
  renderList();
  renderPage({ focus });
  win.classList.add('is-reading');
}

function create() {
  query = '';
  $('[data-notes-search]', win).value = '';
  dropIfEmpty(current);
  const n = { id: `n${Date.now().toString(36)}`, text: '', updated: Date.now() };
  notes.push(n);
  save();
  open(n.id, { focus: true });
}

function remove() {
  if (current === ABOUT) return;
  const { mine } = allNotes();
  const i = mine.findIndex((n) => n.id === current);
  notes = notes.filter((n) => n.id !== current);
  save();
  const next = mine[i + 1] || mine[i - 1];
  current = next && next.id !== current ? next.id : ABOUT;
  renderList();
  renderPage();
  $(`[data-note="${CSS.escape(current)}"]`, win)?.focus();
}

// ── 열기 ────────────────────────────────────────────────────────
/** 메모 앱을 연다. note: 'about-me' 면 about me 메모를 펼친다. */
export async function openNotes(button, { note } = {}) {
  dockButton = button || dockButton;
  if (win?.isConnected) {
    await openWindow(win);
    focusWindow(win);
    if (note) open(note);
    return win;
  }

  load();
  current = note || ABOUT;
  win = build();
  $('#workspace').append(win);
  setupWindow(win);
  setCloser(win, (w) => {
    dropIfEmpty(current);
    closeWindow(w, { remove: true });
    dockButton?.classList.remove('is-running');
    win = null;
  });
  dockButton?.classList.add('is-running');
  focusWindow(win);
  if (dockButton) flyTo(win, dockButton.getBoundingClientRect(), true);
  renderList();
  renderPage();
  // 폰: About.txt 로 열었으면 바로 그 메모를, 아니면 목록부터
  win.classList.toggle('is-reading', !NARROW.matches || !!note);

  win.addEventListener('click', (e) => {
    const it = e.target.closest('[data-note]');
    if (it) return open(it.dataset.note);
    if (e.target.closest('[data-notes-new]')) return create();
    if (e.target.closest('[data-notes-delete]')) return remove();
    if (e.target.closest('[data-notes-back]')) {
      dropIfEmpty(current);
      renderList();
      win.classList.remove('is-reading');
    }
  });

  // 쓰는 대로 저장(잠깐 멈추면). 목록의 제목 · 미리 보기도 따라 바뀐다.
  win.addEventListener('input', (e) => {
    if (e.target.matches('[data-notes-search]')) {
      query = e.target.value.trim().toLowerCase();
      renderList();
      return;
    }
    if (!e.target.matches('[data-notes-editor]')) return;
    const n = notes.find((x) => x.id === current);
    if (!n) return;
    n.text = e.target.value;
    n.updated = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      save();
      renderList();
      const d = $('[data-notes-date]', win);
      if (d) d.textContent = when(n.updated, true);
    }, 250);
  });

  // 목록에서 ↑↓ 로 메모를 옮겨 다닌다.
  $('[data-notes-list]', win).addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = $$('[data-note]', win);
    const i = items.indexOf(document.activeElement);
    const next = items[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    open(next.dataset.note);
    $(`[data-note="${CSS.escape(next.dataset.note)}"]`, win)?.focus();
  });

  return win;
}
