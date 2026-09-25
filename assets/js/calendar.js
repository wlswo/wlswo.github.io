/*
 * 메뉴 막대의 달력: 맥의 '캘린더' 위젯
 *
 * 날짜를 누르면 까만 둥근 판에 한 달이 펼쳐진다. 빨간 달 이름, 요일 머리글자,
 * 오늘은 빨간 동그라미, 주말은 회색. 그 달이 아닌 날은 비워 둔다(위젯처럼).
 * 글을 쓴 날에는 숫자 밑에 작은 점이 찍히고, 그날을 고르면 아래에 글이 나온다.
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

// 고른 날에 쓴 글이 있을 때만 아래에 목록을 편다.
function renderAgenda() {
  const posts = byDay.get(keyOf(selected)) || [];
  agenda.hidden = !posts.length;
  agenda.innerHTML = posts.length
    ? `<ul class="calendar__posts">${posts
        .map(
          (p) => `<li><a href="${escapeHTML(p.url)}"><span class="calendar__post-title">${escapeHTML(p.title)}</span>${
            p.category ? `<span class="calendar__post-cat">${escapeHTML(p.category)}</span>` : ''
          }</a></li>`,
        )
        .join('')}</ul>`
    : '';
}

function render() {
  const today = new Date();
  const y = view.getFullYear();
  const m = view.getMonth();
  // 위젯처럼 달 이름만. 올해가 아니면 옆에 해를 작게.
  title.innerHTML = `${m + 1}월${y !== today.getFullYear() ? ` <small>${y}</small>` : ''}`;
  title.setAttribute('aria-label', `${y}년 ${m + 1}월`);

  // 그 달 1일이 든 주의 일요일부터, 그 달이 끝나는 주까지(4~6주)
  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay());
  let html = '';
  for (let w = 0; w < 6; w++) {
    if (w > 0 && new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7).getMonth() !== m) break;
    html += '<tr>';
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const key = keyOf(day);
      const posts = byDay.get(key) || [];
      const isSel = sameDay(day, selected);
      const inMonth = day.getMonth() === m;
      const label = `${day.getMonth() + 1}월 ${day.getDate()}일 ${DAYS[d]}요일${posts.length ? `, 글 ${posts.length}편` : ''}`;
      const cls = ['calendar__day'];
      if (d === 0 || d === 6) cls.push('is-weekend');
      if (posts.length) cls.push('has-posts');
      // 그 달이 아닌 날: 칸은 두되(키보드로 건너갈 수 있게) 숫자는 보이지 않는다.
      html += `<td role="gridcell" aria-selected="${isSel}"${inMonth ? '' : ' class="is-outside"'}><button type="button" class="${cls.join(' ')}"
        data-date="${key}" tabindex="${isSel ? 0 : -1}" aria-label="${label}"${sameDay(day, today) ? ' aria-current="date"' : ''}>
        <span aria-hidden="true">${day.getDate()}</span></button></td>`;
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
