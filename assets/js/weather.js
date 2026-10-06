/*
 * 바탕의 날씨: 맥의 '날씨' 위젯
 *
 * _config.yml 의 desktop.weather 에 적은 도시의 날씨를 Open-Meteo(키 없이 쓰는 공개
 * 날씨 API)에서 받아 둥근 판에 그린다.
 * 판의 색은 날씨와 낮·밤을 따라 바뀐다(맑은 낮은 하늘색, 밤은 남색, 흐리면
 * 회청색, 비·눈은 짙은 회색).
 *
 * 크기는 셋이다. 우클릭 메뉴(contextmenu.js)에서 고르고, 같은 메뉴로 지운다
 * (지운 위젯은 바탕의 우클릭 메뉴 '위젯 추가'로 되살린다).
 *   작게   지금 기온 · 날씨 · 최고/최저
 *   중간   + 앞으로 몇 시간(해 뜨고 지는 때도 한 칸)
 *   크게   + 앞으로 닷새
 * 크기를 바꾸면 맥처럼 판이 늘거나 줄고, 옛 내용은 커지며 흐려져 사라지고
 * 새 내용은 조금 큰 데서 제자리로 내려앉는다.
 *
 * 판은 끌어 옮길 수 있다. 둔 자리와 크기는 브라우저에 기억한다.
 * 받은 날씨는 30분 동안 담아 두고(쪽을 넘길 때마다 다시 묻지 않게) 30분마다
 * 새로 받는다. 받기 전이나 받지 못하면 위젯을 숨긴 채로 둔다.
 */
import { DESKTOP } from './windows.js';
import { SITE } from './site.js';

const root = document.querySelector('[data-weather]');

const { city: CITY, latitude: LAT, longitude: LON } = SITE.desktop.weather;
// timezone=auto: 시각을 그 도시의 시간대로 받는다(아래의 시각 비교가 모두 그 시각이다).
const API =
  `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
  '&current=temperature_2m,weather_code,is_day' +
  '&hourly=temperature_2m,weather_code,is_day' +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset' +
  '&timezone=auto&forecast_days=6';
// v3: 시각 · 요일 이름을 영어로 담는다. 좌표를 이름에 넣어, 도시를 바꾸면 옛 도시의 날씨를 쓰지 않는다.
const DATA_KEY = `ephemeris:weather:v3:${LAT},${LON}`;
const PLACE_KEY = 'ephemeris:weather-widget';
const TTL = 30 * 60 * 1000;

// 판의 크기(px). 중간은 작은 것 둘에 사이 틈을 더한 폭, 크게는 중간의 폭으로 정사각.
export const SIZES = { small: [164, 164], medium: [344, 164], large: [344, 344] };

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const store = {
  get(k) {
    try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  },
};

// ── 날씨 코드와 그림 ────────────────────────────────────────────
// WMO 날씨 코드 → [이름, 모양]. 모양은 그림과 판의 색을 고른다.
function describe(code) {
  if (code === 0) return ['Clear', 'clear'];
  if (code === 1) return ['Mostly Clear', 'clear'];
  if (code === 2) return ['Partly Cloudy', 'partly'];
  if (code === 3) return ['Cloudy', 'cloudy'];
  if (code === 45 || code === 48) return ['Fog', 'fog'];
  if (code >= 51 && code <= 57) return ['Drizzle', 'rain'];
  if (code === 61 || code === 80) return ['Light Rain', 'rain'];
  if (code === 65 || code === 82) return ['Heavy Rain', 'rain'];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['Rain', 'rain'];
  if (code === 77) return ['Flurries', 'snow'];
  if ((code >= 71 && code <= 75) || code === 85 || code === 86) return ['Snow', 'snow'];
  if (code >= 95) return ['Thunderstorms', 'storm'];
  return ['Cloudy', 'cloudy'];
}

// 맥의 여러 빛깔 기호처럼 해는 노랗게, 구름은 희게, 빗방울은 파랗게.
const SUN = '<circle cx="12" cy="12" r="4.6" fill="#ffd60a"/><g stroke="#ffd60a" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></g>';
const MOON = '<path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.2A7 7 0 0 1 15.5 3.5z" fill="#f2f2f7"/>';
const CLOUD = (y = 0) => `<path d="M7 ${19 + y}h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7 ${19 + y}z" fill="#fff"/>`;
const SMALL_SUN = '<g transform="translate(-3 -4) scale(.62)">' + SUN + '</g>';
const SMALL_MOON = '<g transform="translate(-2 -3) scale(.6)">' + MOON + '</g>';
// 해돋이 · 해넘이: 지평선 위 반쪽 해와 오르내리는 화살표
const HORIZON = (up) =>
  `<path d="M7 17a5 5 0 0 1 10 0z" fill="#ffd60a"/><path d="M3 17.5h18" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>` +
  `<path d="${up ? 'M12 10V3.5M9.3 6.2L12 3.5l2.7 2.7' : 'M12 3.5V10M9.3 7.3L12 10l2.7-2.7'}" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

function icon(kind, day = true) {
  const body = {
    clear: day ? SUN : MOON,
    partly: (day ? SMALL_SUN : SMALL_MOON) + CLOUD(1),
    cloudy: CLOUD(),
    fog: '<g stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M4 9h16M6 13h12M4 17h16"/></g>',
    rain: CLOUD(-3) + '<g stroke="#64d2ff" stroke-width="2" stroke-linecap="round"><path d="M8.5 19l-1 2.5M12.5 19l-1 2.5M16.5 19l-1 2.5"/></g>',
    snow: CLOUD(-3) + '<g fill="#fff"><circle cx="8" cy="20" r="1.2"/><circle cx="12" cy="21.5" r="1.2"/><circle cx="16" cy="20" r="1.2"/></g>',
    storm: CLOUD(-3) + '<path d="M12.5 16.5l-2.5 4h2.5l-1 3.5 3.5-5h-2.5l1-2.5z" fill="#ffd60a"/>',
    sunrise: HORIZON(true),
    sunset: HORIZON(false),
  }[kind];
  return `<svg class="weather__icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${body}</svg>`;
}

const ARROW = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M11 1L1 5.2l4.4 1.4L6.8 11z" fill="currentColor"/></svg>';

const deg = (n) => `${Math.round(n)}°`;
// 도시 이름은 설정에서 오므로 판에 넣기 전에 HTML 글자를 막는다.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ── 받기 ────────────────────────────────────────────────────────
// 시각은 모두 그 도시 시각의 글자('2026-09-29T16:00')로 온다. 글자 그대로 비교한다.
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// 맥의 날씨처럼 '3PM', 해 뜨고 지는 때는 '6:42AM'
function hourLabel(t, withMinutes = false) {
  const h = Number(t.slice(11, 13));
  const m = t.slice(14, 16);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return withMinutes ? `${h12}:${m}${ampm}` : `${h12}${ampm}`;
}

// 지금 다음 시각부터 여섯 칸. 그 사이에 해가 뜨거나 지면 그때도 한 칸 끼운다.
function buildHours(hourly, daily, now) {
  const slots = [];
  for (let i = 0; i < hourly.time.length && slots.length < 6; i++) {
    const t = hourly.time[i];
    if (t <= now) continue;
    slots.push({ t, label: hourLabel(t), kind: describe(hourly.weather_code[i])[1], day: hourly.is_day[i] === 1, temp: hourly.temperature_2m[i] });
  }
  if (!slots.length) return slots;
  const last = slots.at(-1).t;
  const events = [
    ...daily.sunrise.map((t) => [t, 'sunrise']),
    ...daily.sunset.map((t) => [t, 'sunset']),
  ].filter(([t]) => t > now && t < last);
  for (const [t, kind] of events) {
    // 그 시각이 든 한 시간의 기온
    const i = hourly.time.indexOf(`${t.slice(0, 13)}:00`);
    slots.push({ t, label: hourLabel(t, true), kind, day: true, temp: hourly.temperature_2m[i] });
  }
  return slots.sort((a, b) => (a.t < b.t ? -1 : 1)).slice(0, 6);
}

function buildDays(daily) {
  return daily.time.slice(0, 5).map((t, i) => {
    const [y, m, d] = t.split('-').map(Number);
    return {
      label: i === 0 ? 'Today' : WEEK[new Date(y, m - 1, d).getDay()],
      kind: describe(daily.weather_code[i])[1],
      hi: daily.temperature_2m_max[i],
      lo: daily.temperature_2m_min[i],
    };
  });
}

async function fetchWeather() {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const { current, hourly, daily } = await res.json();
  return {
    at: Date.now(),
    temp: current.temperature_2m,
    code: current.weather_code,
    day: current.is_day === 1,
    hi: daily.temperature_2m_max[0],
    lo: daily.temperature_2m_min[0],
    hours: buildHours(hourly, daily, current.time),
    days: buildDays(daily),
  };
}

// ── 그리기 ──────────────────────────────────────────────────────
let data = null;
let size = 'small';

function hoursHTML(hours) {
  return `<ol class="weather__hours">${hours
    .map((h) => `<li><span class="weather__hour">${h.label}</span>${icon(h.kind, h.day)}<span>${deg(h.temp)}</span></li>`)
    .join('')}</ol>`;
}

// 닷새의 막대: 닷새 가운데 가장 낮은 기온에서 가장 높은 기온까지를 한 줄로 보고,
// 그날의 최저~최고만큼을 칠한다.
function daysHTML(days) {
  const min = Math.min(...days.map((d) => d.lo));
  const max = Math.max(...days.map((d) => d.hi));
  const span = max - min || 1;
  return `<ol class="weather__days">${days
    .map((d) => {
      const from = ((d.lo - min) / span) * 100;
      const to = ((d.hi - min) / span) * 100;
      return `<li><span class="weather__day">${d.label}</span>${icon(d.kind)}<span class="weather__lo">${deg(d.lo)}</span>
        <span class="weather__bar"><i style="left:${from.toFixed(1)}%;right:${(100 - to).toFixed(1)}%"></i></span><span>${deg(d.hi)}</span></li>`;
    })
    .join('')}</ol>`;
}

function bodyFor(s) {
  const [name, kind] = describe(data.code);
  const now = `<div class="weather__now"><span class="weather__city">${esc(CITY)} ${ARROW}</span><span class="weather__temp">${deg(data.temp)}</span></div>`;
  const sky = `<div class="weather__sky">${icon(kind, data.day)}<span class="weather__name">${name}</span><span class="weather__range">H:${deg(data.hi)} L:${deg(data.lo)}</span></div>`;
  const el = document.createElement('div');
  el.className = `weather__body weather__body--${s}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    s === 'small'
      ? now + sky
      : `<div class="weather__top">${now}${sky}</div>${hoursHTML(data.hours)}${s === 'large' ? daysHTML(data.days) : ''}`;
  return el;
}

function label() {
  const [name] = describe(data.code);
  return `Weather in ${CITY}: ${name}, ${deg(data.temp)}, high ${deg(data.hi)}, low ${deg(data.lo)}`;
}

function paint() {
  const [, kind] = describe(data.code);
  root.dataset.sky = kind;
  root.dataset.time = data.day ? 'day' : 'night';
  root.setAttribute('aria-label', label());
  root.querySelectorAll('.weather__body').forEach((n) => n.remove());
  root.append(bodyFor(size));
  if (removed) return;
  root.hidden = false;
  clampInto();
}

// ── 지우기 · 되살리기 ───────────────────────────────────────────
// 맥처럼 지운 위젯은 작아지며 사라진다. 바탕의 우클릭 메뉴 '위젯 추가'로 되살린다.
let removed = false;

function removeWidget() {
  if (removed) return;
  removed = true;
  root.dataset.removed = '';
  savePlace();
  const hide = () => (root.hidden = true);
  if (reducedMotion.matches) return hide();
  root
    .animate(
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.8)' },
      ],
      { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)' },
    )
    .finished.then(hide, hide);
}

function addWidget() {
  if (!removed) return;
  removed = false;
  delete root.dataset.removed;
  savePlace();
  if (!data) return;
  paint();
  if (!reducedMotion.matches) {
    root.animate(
      [
        { opacity: 0, transform: 'scale(0.8)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: 320, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
    );
  }
}

// ── 크기 바꾸기 ─────────────────────────────────────────────────
function applySize(s) {
  const [w, h] = SIZES[s];
  root.dataset.size = s;
  root.style.width = `${w}px`;
  root.style.height = `${h}px`;
}

function setSize(s) {
  if (!SIZES[s] || s === size) return;
  const from = size;
  size = s;
  savePlace();
  if (!data) return applySize(s);

  // 앞선 전환이 아직 도는 중이면 끝을 내고 시작한다.
  root.querySelectorAll('.weather__body.is-leaving').forEach((n) => n.remove());
  const old = root.querySelector('.weather__body');
  old?.getAnimations().forEach((a) => a.finish());
  const fresh = bodyFor(s);

  if (reducedMotion.matches || !old) {
    old?.remove();
    root.append(fresh);
    applySize(s);
    clampInto();
    return;
  }

  // 옛 내용은 옛 크기 그대로 붙잡아 두고(판이 커져도 다시 흐르지 않게) 사라지게 한다.
  const [ow, oh] = SIZES[from];
  old.style.width = `${ow}px`;
  old.style.height = `${oh}px`;
  old.classList.add('is-leaving');
  root.append(fresh);
  applySize(s);
  clampInto();

  old
    .animate(
      [
        { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
        { opacity: 0, transform: 'scale(1.32)', filter: 'blur(8px)' },
      ],
      { duration: 280, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    )
    .finished.then(() => old.remove(), () => old.remove());
  fresh.animate(
    [
      { opacity: 0, transform: 'scale(1.1)', filter: 'blur(6px)' },
      { opacity: 1, transform: 'none', filter: 'blur(0)' },
    ],
    { duration: 360, delay: 60, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' },
  );
}

// ── 옮기기 ──────────────────────────────────────────────────────
// 자리는 바탕(workspace)의 왼쪽 위에서 잰 거리. 처음에는 CSS 의 자리(왼쪽 위)에 있다.
const workspace = document.getElementById('workspace');

// 자리는 style 에 적힌 값으로 적는다(지운 위젯은 숨어 있어 offsetLeft 가 0 이다).
function savePlace() {
  const placed = root.style.left !== '';
  store.set(PLACE_KEY, {
    size,
    ...(placed ? { x: parseFloat(root.style.left), y: parseFloat(root.style.top) } : {}),
    ...(removed ? { removed } : {}),
  });
}

// 판이 화면 밖(또는 Dock 뒤)으로 나가지 않게. 크기를 바꾸는 중이면 바뀔 크기로 잰다.
function clamp(x, y) {
  const [w, h] = SIZES[size];
  const ws = workspace.getBoundingClientRect();
  const dock = document.querySelector('[data-dock]')?.getBoundingClientRect();
  const bottom = (dock && dock.height ? dock.top : ws.bottom) - ws.top - 8;
  return {
    x: Math.max(4, Math.min(x, ws.width - w - 4)),
    y: Math.max(4, Math.min(y, bottom - h)),
  };
}

function moveTo(x, y) {
  const p = clamp(x, y);
  root.style.left = `${Math.round(p.x)}px`;
  root.style.top = `${Math.round(p.y)}px`;
}

function clampInto() {
  if (root.hidden || !DESKTOP.matches) return;
  const p = clamp(root.offsetLeft, root.offsetTop);
  if (p.x !== root.offsetLeft || p.y !== root.offsetTop) moveTo(p.x, p.y);
}

let drag = null;

function onDown(e) {
  if (e.button !== 0 || e.pointerType === 'touch' || !DESKTOP.matches) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: root.offsetLeft, top: root.offsetTop, moving: false };
  root.setPointerCapture(e.pointerId);
}

function onMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (!drag.moving) {
    if (Math.hypot(dx, dy) < 4) return;
    drag.moving = true;
    root.classList.add('is-dragging');
  }
  moveTo(drag.left + dx, drag.top + dy);
}

function onUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  if (drag.moving) {
    root.classList.remove('is-dragging');
    savePlace();
  }
  drag = null;
}

// ── 시작 ────────────────────────────────────────────────────────
// 담아 둔 값이 있으면 그걸 그리고 그 값이 낡을 때 다시 온다.
async function refresh() {
  let v = store.get(DATA_KEY);
  if (!v || Date.now() - v.at >= TTL) {
    try {
      v = await fetchWeather();
      store.set(DATA_KEY, v);
    } catch {
      v = null; // 받지 못하면 조용히 둔다(이미 그려 둔 값이 있으면 그대로).
    }
  }
  if (v) {
    data = v;
    paint();
  }
  setTimeout(refresh, v ? TTL - (Date.now() - v.at) + 1000 : TTL);
}

if (root) {
  const saved = store.get(PLACE_KEY);
  if (saved && SIZES[saved.size]) size = saved.size;
  applySize(size);
  if (saved && Number.isFinite(saved.x)) {
    root.style.left = `${saved.x}px`;
    root.style.top = `${saved.y}px`;
  }
  if (saved?.removed) {
    removed = true;
    root.dataset.removed = '';
  }

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  addEventListener('resize', clampInto);
  // 우클릭 메뉴(contextmenu.js)
  addEventListener('ephemeris:widget-size', (e) => setSize(e.detail));
  addEventListener('ephemeris:widget-remove', removeWidget);
  addEventListener('ephemeris:widget-add', addWidget);

  refresh();
}
