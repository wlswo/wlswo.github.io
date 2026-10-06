/*
 * 알림 센터: 메뉴 막대의 날짜를 누르면 오른쪽에서 밀려 들어오는 판
 *
 * 맥처럼 옅은 유리 판 위에 까만 유리 위젯이 떠 있다.
 *   위     지나간 알림(있을 때만. 그리는 일은 macos.js 가 한다)
 *   아래   캘린더 위젯(이달) · 코인 위젯(_config.yml 의 desktop.coins, 예: BTC-USD · ETH-USD)
 * 캘린더 위젯을 누르면 캘린더 앱(calendar.js)이 뜬다.
 *
 * 닫기: Esc, 판 바깥 누르기, 날짜 다시 누르기, 다른 메뉴가 열릴 때.
 *
 * 시세는 Coinbase 의 공개 API(키 없이 브라우저에서 부른다)에서 받는다.
 * 판을 열 때 받고(1분 안에 받은 것이 있으면 그대로), 열려 있는 동안 30초마다.
 * 오르면 빨간 ▲, 내리면 파란 ▼(한국의 시세 색). 받지 못하면 '—'.
 */
import { SITE } from './site.js';

const $ = (sel, root = document) => root.querySelector(sel);

const root = $('[data-nc-root]');
const button = $('[data-nc-button]');
const panel = $('#notification-center');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ── 캘린더 위젯 ─────────────────────────────────────────────────
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

function renderCalendar() {
  const el = $('[data-nc-calendar]', panel);
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const dow = (first + d - 1) % 7;
    const cls = [dow === 0 || dow === 6 ? 'is-weekend' : '', d === today.getDate() ? 'is-today' : ''].filter(Boolean).join(' ');
    cells += `<span${cls ? ` class="${cls}"` : ''}>${d}</span>`;
  }
  el.setAttribute('aria-label', `Open Calendar — today is ${today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`);
  el.innerHTML = `
    <span class="nwidget__month">${MONTHS[m]}</span>
    <span class="minical" aria-hidden="true">
      ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => `<b${i === 0 || i === 6 ? ' class="is-weekend"' : ''}>${d}</b>`).join('')}
      ${cells}
    </span>`;
}

// ── 코인 위젯 ───────────────────────────────────────────────────
// Coinbase 의 상품 이름(BTC-USD 꼴). 위젯이 작은 정사각이라 둘까지만 들어간다.
// 이름은 흔한 것만 적어 두고, 모르는 것은 앞의 기호(SOL 따위)로 부른다.
const NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', DOGE: 'Dogecoin', ADA: 'Cardano', LTC: 'Litecoin' };
const COINS = SITE.desktop.coins.slice(0, 2).map((id) => {
  const [base, quote] = id.split('-');
  return { id, name: NAMES[base] || base, quote };
});
// 값의 단위: 달러는 앞에 $, 다른 돈은 뒤에 이름(1,234.56 EUR)
const price = (n, quote) => (quote === 'USD' ? `$${money(n)}` : `${money(n)} ${quote}`);
const API = 'https://api.exchange.coinbase.com/products/';
let quotes = null; // { at, list: [{ id, last, open, points }] }
let quoteTimer = 0;
let failed = false; // 한 번이라도 받지 못했나(받는 중에는 '—' 대신 비워 둔다)

async function fetchCoin({ id }) {
  const [stats, candles] = await Promise.all(
    [`${API}${id}/stats`, `${API}${id}/candles?granularity=3600`].map((u) =>
      fetch(u).then((r) => {
        if (!r.ok) throw new Error(`coinbase ${r.status}`);
        return r.json();
      }),
    ),
  );
  // 캔들은 [시각, 저가, 고가, 시가, 종가, 거래량], 새것부터. 지난 하루(24개)를 옛것부터.
  const points = candles.slice(0, 24).reverse().map((c) => c[4]);
  return { id, last: Number(stats.last), open: Number(stats.open), points };
}

const money = (n) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 10000 ? 0 : 2, minimumFractionDigits: n >= 10000 ? 0 : 2 });

// 지난 하루의 선. 점선은 하루 전 값(이보다 위면 오른 것).
function spark(points, open, up) {
  if (points.length < 2) return '';
  const W = 132;
  const H = 22;
  const lo = Math.min(open, ...points);
  const hi = Math.max(open, ...points);
  const span = hi - lo || 1;
  const x = (i) => ((i / (points.length - 1)) * W).toFixed(1);
  const y = (v) => (H - 1 - ((v - lo) / span) * (H - 2)).toFixed(1);
  const line = points.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join('');
  return `<svg class="coin__spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 ${y(open)}H${W}" class="coin__base"/>
    <path d="${line}" class="coin__line ${up ? 'is-up' : 'is-down'}"/></svg>`;
}

function renderCoins() {
  const el = $('[data-nc-coins]', panel);
  // 설정의 코인 목록이 비었으면 위젯을 숨긴다.
  el.hidden = !COINS.length;
  el.innerHTML = COINS.map(({ id, name, quote }) => {
    const q = quotes?.list.find((c) => c.id === id);
    if (!q) {
      const v = failed ? '—' : '';
      return `<div class="coin" aria-label="${name}: ${failed ? 'couldn’t load price' : 'loading price'}"><p class="coin__row"><b>${id}</b><span>${v}</span></p><p class="coin__row coin__sub"><span>${name}</span><span>${v}</span></p></div>`;
    }
    const diff = q.last - q.open;
    const pct = (diff / q.open) * 100;
    const up = diff >= 0;
    const sign = up ? '+' : '−';
    return `<div class="coin ${up ? 'is-up' : 'is-down'}" aria-label="${name} ${price(q.last, quote)}, ${sign}${Math.abs(pct).toFixed(2)}% today">
      <p class="coin__row" aria-hidden="true"><b><i>${up ? '▲' : '▼'}</i>${id}</b><span class="coin__chg">${sign}${Math.abs(pct).toFixed(2)}%</span></p>
      <p class="coin__row coin__sub" aria-hidden="true"><span>${money(q.last)}</span><span class="coin__chg">${sign}${money(Math.abs(diff))}</span></p>
      ${spark(q.points, q.open, up)}
    </div>`;
  }).join('');
}

async function refreshCoins({ force = false } = {}) {
  clearTimeout(quoteTimer);
  if (!COINS.length) return; // 숨긴 위젯의 시세는 받지 않는다
  if (force || !quotes || Date.now() - quotes.at > 60_000) {
    try {
      quotes = { at: Date.now(), list: await Promise.all(COINS.map(fetchCoin)) };
      failed = false;
    } catch {
      failed = true;
      // 받지 못하면 전에 받은 값(없으면 '—')을 그대로 둔다.
    }
  }
  if (!panel.hidden) {
    renderCoins();
    quoteTimer = setTimeout(() => refreshCoins({ force: true }), 30_000);
  }
}

// ── 열고 닫기 ───────────────────────────────────────────────────
// 맥처럼 오른쪽에서 밀려 들어오고, 닫으면 오른쪽으로 빠져나간다.
let closing = null;

export function openNotificationCenter() {
  if (!panel.hidden && !closing) return;
  closing?.cancel();
  closing = null;
  dispatchEvent(new CustomEvent('ephemeris:popup', { detail: 'ncenter' }));
  panel.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  renderCalendar();
  renderCoins();
  refreshCoins();
  if (!reducedMotion.matches) {
    panel.animate(
      [
        { transform: 'translateX(calc(100% + 24px))' },
        { transform: 'none' },
      ],
      { duration: 460, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
    );
  }
  $('[data-nc-calendar]', panel).focus({ preventScroll: true });
}

export function closeNotificationCenter({ restoreFocus = false } = {}) {
  if (panel.hidden || closing) return;
  button.setAttribute('aria-expanded', 'false');
  clearTimeout(quoteTimer);
  if (restoreFocus) button.focus();
  const done = () => {
    panel.hidden = true;
    closing = null;
  };
  if (reducedMotion.matches) return done();
  closing = panel.animate(
    [
      { transform: 'none' },
      { transform: 'translateX(calc(100% + 24px))' },
    ],
    { duration: 280, easing: 'cubic-bezier(0.4, 0, 1, 1)' },
  );
  closing.finished.then(done, () => {});
}

if (root && panel) {
  button.addEventListener('click', () => (panel.hidden || closing ? openNotificationCenter() : closeNotificationCenter()));

  // 캘린더 위젯 → 캘린더 앱(위젯 자리에서 창이 펼쳐진다)
  $('[data-nc-calendar]', panel).addEventListener('click', (e) => {
    const from = e.currentTarget.getBoundingClientRect();
    closeNotificationCenter();
    dispatchEvent(new CustomEvent('ephemeris:calendar', { detail: { from } }));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden && !closing) {
      e.preventDefault();
      closeNotificationCenter({ restoreFocus: true });
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !root.contains(e.target)) closeNotificationCenter();
  });
  // 다른 메뉴가 열리면 접는다.
  addEventListener('ephemeris:popup', (e) => {
    if (e.detail !== 'ncenter') closeNotificationCenter();
  });
}
