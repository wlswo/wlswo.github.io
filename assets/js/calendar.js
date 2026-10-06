/*
 * 캘린더: 맥의 캘린더 앱
 *
 * 알림 센터의 캘린더 위젯(ncenter.js)을 누르면 위젯 자리에서 펼쳐진다
 * (Spotlight 로도 연다. desktop.js 가 이 모듈을 그때 불러온다).
 * 쓴 글이 그날의 일정처럼 카테고리 색 라벨로 붙고, 누르면 그 글이 열린다.
 *
 *   왼쪽   카테고리를 블로그 이름 아래 캘린더 목록처럼(체크를 끄면 그 글을 숨긴다) · 작은 달력
 *   위     Day · Week · Month · Year, 제목, ‹ Today ›
 *   가운데 고른 보기. 처음에는 Month.
 *
 * 숨긴 카테고리는 이 브라우저에 기억한다. 창은 하나만 뜬다.
 */
import { setupWindow, focusWindow, closeWindow, setCloser, openWindow, flyTo } from './windows.js';
import { loadPosts } from './posts.js';
import { SITE } from './site.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const HIDDEN_KEY = 'ephemeris:calendar-hidden';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const VIEWS = ['day', 'week', 'month', 'year'];

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameDay = (a, b) => keyOf(a) === keyOf(b);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d) => addDays(d, -d.getDay());

let win = null;
let view = 'month';
let cursor = new Date(); // 보고 있는 날
let mini = new Date(); // 작은 달력이 보이는 달
let byDay = new Map(); // 'YYYY-MM-DD' → [글]
let cals = []; // [{ slug, name, color }]
let hidden = new Set();

try {
  hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'));
} catch {}

function saveHidden() {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
  } catch {}
}

const postsOn = (d) => (byDay.get(keyOf(d)) || []).filter((p) => !hidden.has(p.slug || ''));

// ── 글 → 일정 ───────────────────────────────────────────────────
function ingest(posts) {
  byDay = new Map();
  const seen = new Map();
  for (const p of posts) {
    const key = String(p.date || '').replace(/\./g, '-');
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(p);
    const slug = p.slug || '';
    if (!seen.has(slug)) seen.set(slug, { slug, name: p.category || 'Other', color: p.color || '#8e8e93' });
  }
  cals = [...seen.values()];
}

function eventHTML(p, cls = 'calapp__event') {
  return `<a class="${cls}" href="${esc(p.url)}" style="--c: ${esc(p.color || '#8e8e93')}" data-cal-post title="${esc(p.title)}">
    <i aria-hidden="true"></i><span>${esc(p.title)}</span></a>`;
}

// ── 보기 ────────────────────────────────────────────────────────
function monthView() {
  const today = new Date();
  const m = cursor.getMonth();
  const start = startOfWeek(new Date(cursor.getFullYear(), m, 1));
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const posts = postsOn(d);
    const out = d.getMonth() !== m;
    const num = d.getDate() === 1 ? `${SHORT[d.getMonth()]} 1` : d.getDate();
    const shown = posts.slice(0, 3);
    cells += `<div class="calapp__cell${out ? ' is-out' : ''}${d.getDay() % 6 === 0 ? ' is-weekend' : ''}" role="gridcell"
      aria-label="${MONTHS[d.getMonth()]} ${d.getDate()}${posts.length ? `, ${posts.length} event${posts.length > 1 ? 's' : ''}` : ''}">
      <button class="calapp__num${sameDay(d, today) ? ' is-today' : ''}" type="button" data-cal-day="${keyOf(d)}">${num}</button>
      ${shown.map((p) => eventHTML(p)).join('')}
      ${posts.length > shown.length ? `<button class="calapp__more" type="button" data-cal-day="${keyOf(d)}">${posts.length - shown.length} more</button>` : ''}
    </div>`;
  }
  return `<div class="calapp__month" role="grid">
    <div class="calapp__dows" role="row">${DAYS.map((d) => `<span role="columnheader">${d.slice(0, 3)}</span>`).join('')}</div>
    <div class="calapp__cells">${cells}</div></div>`;
}

function weekView() {
  const today = new Date();
  const start = startOfWeek(cursor);
  let cols = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    cols += `<div class="calapp__col${sameDay(d, today) ? ' is-today' : ''}">
      <button class="calapp__colhead" type="button" data-cal-day="${keyOf(d)}">${DAYS[i].slice(0, 3)} <b>${d.getDate()}</b></button>
      <div class="calapp__allday">${postsOn(d).map((p) => eventHTML(p)).join('')}</div>
    </div>`;
  }
  return `<div class="calapp__week">${cols}</div>`;
}

function dayView() {
  const posts = postsOn(cursor);
  return `<div class="calapp__day">
    <p class="calapp__dow">${DAYS[cursor.getDay()]}</p>
    ${
      posts.length
        ? `<ul class="calapp__agenda">${posts
            .map(
              (p) => `<li>${eventHTML(p, 'calapp__card')}
                <p class="calapp__meta">${esc(p.category || '')}${p.description ? ` · ${esc(p.description)}` : ''}</p></li>`,
            )
            .join('')}</ul>`
        : '<p class="calapp__empty">No Events</p>'
    }</div>`;
}

function miniMonth(y, m, { yearView = false } = {}) {
  const today = new Date();
  const start = startOfWeek(new Date(y, m, 1));
  const weeks = yearView ? Math.ceil((new Date(y, m, 1).getDay() + new Date(y, m + 1, 0).getDate()) / 7) : 6;
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const out = d.getMonth() !== m;
    if (yearView && out) {
      cells += '<span></span>';
      continue;
    }
    const cls = ['calapp__mday', out ? 'is-out' : '', sameDay(d, today) ? 'is-today' : '', postsOn(d).length ? 'has-events' : '', !yearView && sameDay(d, cursor) ? 'is-picked' : '']
      .filter(Boolean)
      .join(' ');
    cells += `<button class="${cls}" type="button" data-cal-day="${keyOf(d)}" aria-label="${MONTHS[d.getMonth()]} ${d.getDate()}">${d.getDate()}</button>`;
  }
  return `<div class="calapp__mgrid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<b>${d}</b>`).join('')}${cells}</div>`;
}

function yearView() {
  const y = cursor.getFullYear();
  const now = new Date();
  return `<div class="calapp__year">${MONTHS.map(
    (name, m) => `<section class="calapp__ymonth">
      <button class="calapp__yname${y === now.getFullYear() && m === now.getMonth() ? ' is-now' : ''}" type="button" data-cal-month="${m}">${name}</button>
      ${miniMonth(y, m, { yearView: true })}</section>`,
  ).join('')}</div>`;
}

function title() {
  const y = cursor.getFullYear();
  if (view === 'year') return `<b>${y}</b>`;
  if (view === 'day') return `<b>${MONTHS[cursor.getMonth()]} ${cursor.getDate()},</b> ${y}`;
  return `<b>${MONTHS[cursor.getMonth()]}</b> ${y}`;
}

function renderMini() {
  $('[data-cal-mini-title]', win).textContent = `${MONTHS[mini.getMonth()]} ${mini.getFullYear()}`;
  $('[data-cal-mini]', win).innerHTML = miniMonth(mini.getFullYear(), mini.getMonth());
}

function renderSide() {
  $('[data-cal-list]', win).innerHTML = cals
    .map(
      (c) => `<li><label class="calapp__cal" style="--c: ${esc(c.color)}">
        <input type="checkbox" data-cal-toggle="${esc(c.slug)}"${hidden.has(c.slug) ? '' : ' checked'}>
        <span class="calapp__check" aria-hidden="true"></span><span>${esc(c.name)}</span></label></li>`,
    )
    .join('');
}

function render() {
  if (!win) return;
  $('[data-cal-title]', win).innerHTML = title();
  $('[data-cal-view]', win).innerHTML = { day: dayView, week: weekView, month: monthView, year: yearView }[view]();
  $('[data-cal-view]', win).dataset.view = view;
  for (const b of $$('[data-cal-mode]', win)) b.setAttribute('aria-checked', String(b.dataset.calMode === view));
  renderMini();
}

// ── 옮겨 다니기 ─────────────────────────────────────────────────
function step(dir) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  if (view === 'day') cursor = addDays(cursor, dir);
  else if (view === 'week') cursor = addDays(cursor, dir * 7);
  else if (view === 'year') cursor = new Date(y + dir, m, 1);
  else {
    // 달을 넘길 때 31일 → 30일까지밖에 없는 달이면 그 달의 끝날로
    const last = new Date(y, m + dir + 1, 0).getDate();
    cursor = new Date(y, m + dir, Math.min(cursor.getDate(), last));
  }
  mini = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  render();
}

function goTo(date, v = view) {
  cursor = date;
  view = v;
  mini = new Date(date.getFullYear(), date.getMonth(), 1);
  render();
}

const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

function openPost(href) {
  const ev = new CustomEvent('ephemeris:open', { detail: { href }, cancelable: true });
  if (dispatchEvent(ev)) location.href = href;
}

// ── 창 ──────────────────────────────────────────────────────────
const traffic = `
  <div class="traffic" role="group" aria-label="Window controls">
    <button class="traffic__btn traffic__btn--close" type="button" data-window-action="close" aria-label="Close"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg></button>
    <button class="traffic__btn traffic__btn--min" type="button" data-window-action="minimize" aria-label="Minimize"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-minus"/></svg></button>
    <button class="traffic__btn traffic__btn--zoom" type="button" data-window-action="zoom" aria-label="Zoom" aria-pressed="false"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-zoom"/></svg></button>
  </div>`;

const chev = (d) => `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const LEFT = chev('M12.5 4.5 7 10l5.5 5.5');
const RIGHT = chev('M7.5 4.5 13 10l-5.5 5.5');

function build() {
  const el = document.createElement('section');
  el.className = 'window calapp';
  el.dataset.window = 'calendar';
  el.dataset.dynamic = '';
  el.tabIndex = -1;
  el.setAttribute('aria-labelledby', 'calapp-title');
  el.innerHTML = `
    <aside class="calapp__side" aria-label="Calendars">
      <div class="calapp__chrome" data-window-drag>${traffic}</div>
      <div class="calapp__lists">
        <p class="calapp__group">${esc(SITE.title || 'Calendars')}</p>
        <ul class="calapp__cals" data-cal-list></ul>
      </div>
      <div class="calapp__mini">
        <div class="calapp__minihead">
          <button class="calapp__icon" type="button" data-mini-step="-1" aria-label="Previous month">${LEFT}</button>
          <span data-cal-mini-title></span>
          <button class="calapp__icon" type="button" data-mini-step="1" aria-label="Next month">${RIGHT}</button>
        </div>
        <div data-cal-mini></div>
      </div>
    </aside>
    <div class="calapp__main">
      <header class="calapp__bar" data-window-drag>
        <div class="calapp__modes" role="radiogroup" aria-label="View">
          ${VIEWS.map((v) => `<button type="button" role="radio" data-cal-mode="${v}">${v[0].toUpperCase()}${v.slice(1)}</button>`).join('')}
        </div>
      </header>
      <div class="calapp__head">
        <h2 class="calapp__title" id="calapp-title" data-cal-title></h2>
        <div class="calapp__nav">
          <button class="calapp__icon calapp__pill" type="button" data-cal-step="-1" aria-label="Previous">${LEFT}</button>
          <button class="calapp__today calapp__pill" type="button" data-cal-today>Today</button>
          <button class="calapp__icon calapp__pill" type="button" data-cal-step="1" aria-label="Next">${RIGHT}</button>
        </div>
      </div>
      <div class="calapp__view" data-cal-view></div>
    </div>`;

  el.addEventListener('click', (e) => {
    const post = e.target.closest('[data-cal-post]');
    if (post) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      openPost(post.getAttribute('href'));
      return;
    }
    const mode = e.target.closest('[data-cal-mode]');
    if (mode) return goTo(cursor, mode.dataset.calMode);
    const s = e.target.closest('[data-cal-step]');
    if (s) return step(Number(s.dataset.calStep));
    if (e.target.closest('[data-cal-today]')) return goTo(new Date());
    const ms = e.target.closest('[data-mini-step]');
    if (ms) {
      mini = new Date(mini.getFullYear(), mini.getMonth() + Number(ms.dataset.miniStep), 1);
      return renderMini();
    }
    const month = e.target.closest('[data-cal-month]');
    if (month) return goTo(new Date(cursor.getFullYear(), Number(month.dataset.calMonth), 1), 'month');
    const day = e.target.closest('[data-cal-day]');
    if (day) {
      // 달 칸의 숫자나 '더 보기', 주 머리, 해 보기의 날은 그날로. 작은 달력은 보기를 두고 날만 옮긴다.
      const inMini = day.closest('.calapp__mini');
      return goTo(parseKey(day.dataset.calDay), inMini ? view : 'day');
    }
  });

  el.addEventListener('change', (e) => {
    const t = e.target.closest('[data-cal-toggle]');
    if (!t) return;
    if (t.checked) hidden.delete(t.dataset.calToggle);
    else hidden.add(t.dataset.calToggle);
    saveHidden();
    render();
  });
  return el;
}

export async function openCalendar(from) {
  if (win?.isConnected) {
    await openWindow(win);
    focusWindow(win);
    return win;
  }
  cursor = new Date();
  mini = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  view = 'month';
  win = build();
  $('#workspace').append(win);
  setupWindow(win);
  setCloser(win, (w) => {
    closeWindow(w, { remove: true });
    win = null;
  });
  render();
  focusWindow(win);
  if (from) flyTo(win, from, true);

  loadPosts()
    .then((posts) => {
      ingest(posts);
      if (!win) return;
      renderSide();
      render();
    })
    .catch(() => {});
  return win;
}
