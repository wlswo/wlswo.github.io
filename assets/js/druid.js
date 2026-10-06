/*
 * Apache Druid: 데스크톱의 'Apache Druid' 아이콘이 여는 창
 *
 * 창 안은 /druid/ 쪽(Druid 의 동작을 아스키 다이어그램으로 보여 주는 앱)을 iframe 으로
 * 띄운 것이다. 창을 닫으면 iframe 째 치우고, 최소화하면 움직임을 멈추게 한다.
 * iframe 안을 누르면 이 창이 앞으로 온다(iframe 의 누름은 바깥까지 올라오지 않아,
 * 안쪽 쪽이 postMessage 로 알려 준다).
 *
 * 창은 하나만 뜬다. 다시 열면 앞으로 온다. 새 탭으로 보려면 제목 막대의 ↗.
 */
import { setupWindow, focusWindow, closeWindow, setCloser, openWindow, flyTo } from './windows.js';

const $ = (sel, root = document) => root.querySelector(sel);

let win = null;
let frame = null;

const traffic = `
  <div class="traffic" role="group" aria-label="Window controls">
    <button class="traffic__btn traffic__btn--close" type="button" data-window-action="close" aria-label="Close"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg></button>
    <button class="traffic__btn traffic__btn--min" type="button" data-window-action="minimize" aria-label="Minimize"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-minus"/></svg></button>
    <button class="traffic__btn traffic__btn--zoom" type="button" data-window-action="zoom" aria-label="Zoom" aria-pressed="false"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-zoom"/></svg></button>
  </div>`;

function build(src) {
  const el = document.createElement('section');
  el.className = 'window druid';
  el.dataset.window = 'druid';
  el.dataset.dynamic = '';
  el.tabIndex = -1;
  el.setAttribute('aria-labelledby', 'druid-title');
  el.innerHTML = `
    <header class="druid__bar" data-window-drag>
      ${traffic}
      <h2 class="druid__title" id="druid-title">Apache Druid</h2>
      <div class="druid__tools">
        <a class="druid__pop" href="${src}" target="_blank" rel="noopener" aria-label="Open in New Tab" title="Open in New Tab">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4.5H5.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V12M11 4.5h4.5V9M15.5 4.5 9 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <button class="druid__close" type="button" data-window-action="close" aria-label="Close Apache Druid">
          <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg>
        </button>
      </div>
    </header>
    <iframe class="druid__frame" src="${src}?embed" title="How Apache Druid Works" allow="fullscreen"></iframe>`;
  return el;
}

function tell(msg) {
  frame?.contentWindow?.postMessage({ druid: msg }, location.origin);
}

addEventListener('message', (e) => {
  if (e.origin !== location.origin || !win || e.source !== frame?.contentWindow) return;
  if (e.data?.druid === 'focus' && !win.classList.contains('is-front')) focusWindow(win);
});

/** from: 창이 솟아 나올 자리(누른 아이콘), href: 앱의 주소(/druid/). */
export async function openDruid(from, href = '/druid/') {
  if (win?.isConnected) {
    await openWindow(win);
    focusWindow(win);
    return win;
  }

  const src = new URL(href, location.href).pathname;
  win = build(src);
  frame = $('.druid__frame', win);
  $('#workspace').append(win);
  setupWindow(win);
  setCloser(win, (w) => {
    closeWindow(w, { remove: true });
    win = null;
    frame = null;
  });
  focusWindow(win);
  if (from) flyTo(win, from.getBoundingClientRect(), true);

  // 최소화, 닫힘이면 그림판을 쉬게 한다.
  let resting = false;
  new MutationObserver(() => {
    if (!win) return;
    const rest = win.classList.contains('is-minimized') || win.classList.contains('is-closed');
    if (rest !== resting) tell(rest ? 'pause' : 'resume');
    resting = rest;
  }).observe(win, { attributes: true, attributeFilter: ['class'] });

  // 쪽이 다 뜰 때까지 마우스 자리에 무지개 공(오래 걸릴 때만)
  const { busy } = await import('./macos.js');
  busy(new Promise((resolve) => frame.addEventListener('load', resolve, { once: true })));
  frame.addEventListener('load', () => frame.focus({ preventScroll: true }), { once: true });
  return win;
}
