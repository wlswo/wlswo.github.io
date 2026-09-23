/*
 * 메뉴 막대의 달력
 *
 * 날짜를 누르면 맥 캘린더 앱의 '월' 보기처럼 한 달이 펼쳐진다. 오늘은 빨간
 * 동그라미, 달의 첫날은 'N월 1일'. 글은 그 카테고리 색(_data/categories.yml 의
 * color)의 종일 일정처럼 칸에 적힌다. 날을 고르면 아래에 그날 쓴 글이 나온다.
 *
 * 키보드: 방향키로 날을 옮기고(←→ 하루, ↑↓ 한 주), PageUp/PageDown 으로
 * 달을 넘기고, Home/End 로 그 주의 처음과 끝, Esc 로 닫는다.
 */
import { loadPosts } from './posts.js';

const $ = (sel, root = document) => root.querySelector(sel);

const root = $('[data-calendar-root]');
const button = $('[data-calendar-button]');
const panel = $('#calendar');
const title = $('[data-cal-title]');
const body = $('[data-cal-body]');
const agenda = $('[data-cal-agenda]');
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameDay = (a, b) => keyOf(a) === keyOf(b);

let byDay = new Map(); // 'YYYY-MM-DD' → [글]
let selected = new Date();
let view = new Date(selected.getFullYear(), selected.getMonth(), 1);

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// 카테고리 색. 데이터에서 온 값이라 색 모양일 때만 쓴다.
const tint = (p) => (/^#[0-9a-f]{3,8}$/i.test(p.color || '') ? ` style="--c:${p.color}"` : '');

// 칸에는 일정을 둘까지. 더 있으면 하나만 적고 '+N'.
function eventsHTML(posts) {
  if (!posts.length) return '';
  const shown = posts.length > 2 ? posts.slice(0, 1) : posts;
  const more = posts.length - shown.length;
  return `<span class="calendar__events" aria-hidden="true">${shown
    .map((p) => `<span class="calendar__event"${tint(p)}>${escapeHTML(p.title)}</span>`)
    .join('')}${more ? `<span class="calendar__more">+${more}</span>` : ''}</span>`;
}

function renderAgenda() {
  const posts = byDay.get(keyOf(selected)) || [];
  const head = `${selected.getMonth() + 1}월 ${selected.getDate()}일 ${DAYS[selected.getDay()]}요일`;
  agenda.innerHTML =
    `<p class="calendar__day-title">${head}</p>` +
    (posts.length
      ? `<ul class="calendar__posts">${posts
          .map(
            (p) => `<li><a href="${escapeHTML(p.url)}"${tint(p)}>
              <span class="calendar__bar" aria-hidden="true"></span>
              <span class="calendar__post"><span class="calendar__post-title">${escapeHTML(p.title)}</span>${
                p.category ? `<span class="calendar__post-cat">${escapeHTML(p.category)}</span>` : ''
              }</span></a></li>`,
          )
          .join('')}</ul>`
      : '<p class="calendar__empty">이 날 쓴 글이 없습니다</p>');
}

function render() {
  const today = new Date();
  const y = view.getFullYear();
  const m = view.getMonth();
  title.innerHTML = `${y}년 <strong>${m + 1}월</strong>`;

  // 그 달 1일이 든 주의 일요일부터 6주
  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay());
  let html = '';
  for (let w = 0; w < 6; w++) {
    html += '<tr>';
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const key = keyOf(day);
      const posts = byDay.get(key) || [];
      const cls = [];
      if (day.getMonth() !== m) cls.push('is-outside');
      if (d === 0 || d === 6) cls.push('is-weekend');
      const isSel = sameDay(day, selected);
      const label = `${day.getMonth() + 1}월 ${day.getDate()}일 ${DAYS[d]}요일${posts.length ? `, 글 ${posts.length}편` : ''}`;
      // 캘린더 앱처럼 달의 첫날은 'N월 1일'로 적는다(오늘이면 빨간 알약이 된다).
      const num = day.getDate() === 1 ? `${day.getMonth() + 1}월 1일` : day.getDate();
      html += `<td role="gridcell" aria-selected="${isSel}"${cls.length ? ` class="${cls.join(' ')}"` : ''}><button type="button" class="calendar__day"
        data-date="${key}" tabindex="${isSel ? 0 : -1}" aria-label="${label}"${sameDay(day, today) ? ' aria-current="date"' : ''}>
        <span class="calendar__date" aria-hidden="true"><span class="calendar__num">${num}</span></span>${eventsHTML(posts)}</button></td>`;
    }
    html += '</tr>';
  }
  body.innerHTML = html;
  renderAgenda();
}

function select(date, { focus = true } = {}) {
  selected = date;
  if (date.getMonth() !== view.getMonth() || date.getFullYear() !== view.getFullYear()) {
    view = new Date(date.getFullYear(), date.getMonth(), 1);
  }
  render();
  if (focus) body.querySelector(`[data-date="${keyOf(selected)}"]`)?.focus();
}

function step(months) {
  const d = new Date(selected.getFullYear(), selected.getMonth() + months, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(selected.getDate(), last));
  select(d, { focus: panel.contains(document.activeElement) });
}

export function openCalendar() {
  if (!panel.hidden) return;
  dispatchEvent(new CustomEvent('ephemeris:popup', { detail: 'calendar' }));
  selected = new Date();
  view = new Date(selected.getFullYear(), selected.getMonth(), 1);
  panel.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  render();
  body.querySelector(`[data-date="${keyOf(selected)}"]`)?.focus();
  loadPosts()
    .then((posts) => {
      byDay = new Map();
      for (const p of posts) {
        const key = String(p.date || '').replace(/\./g, '-');
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(p);
      }
      if (!panel.hidden) {
        const had = panel.contains(document.activeElement);
        render();
        if (had) body.querySelector(`[data-date="${keyOf(selected)}"]`)?.focus();
      }
    })
    .catch(() => {});
}

export function closeCalendar({ restoreFocus = false } = {}) {
  if (panel.hidden) return;
  panel.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  if (restoreFocus) button.focus();
}

export const calendarOpen = () => !!panel && !panel.hidden;

if (root && panel) {
  button.addEventListener('click', () => (panel.hidden ? openCalendar() : closeCalendar()));

  panel.addEventListener('click', (e) => {
    if (e.target.closest('.calendar__posts a')) {
      closeCalendar();
      return;
    }
    const day = e.target.closest('[data-date]');
    if (day) {
      const [y, m, d] = day.dataset.date.split('-').map(Number);
      select(new Date(y, m - 1, d));
      return;
    }
    const stepBtn = e.target.closest('[data-cal-step]');
    if (stepBtn) step(Number(stepBtn.dataset.calStep));
    if (e.target.closest('[data-cal-today]')) select(new Date(), { focus: false });
  });

  body.addEventListener('keydown', (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in moves) {
      e.preventDefault();
      select(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + moves[e.key]));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      step(e.key === 'PageUp' ? -1 : 1);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const shift = e.key === 'Home' ? -selected.getDay() : 6 - selected.getDay();
      select(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + shift));
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      e.preventDefault();
      closeCalendar({ restoreFocus: true });
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !root.contains(e.target)) closeCalendar();
  });
  // 메뉴가 열리면 달력은 접는다.
  addEventListener('ephemeris:popup', (e) => {
    if (e.detail !== 'calendar') closeCalendar();
  });
}
