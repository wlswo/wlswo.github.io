/*
 * 게임: 개인 프로젝트를 앱 아이콘으로 모아 둔 창
 *
 * Dock 의 게임(로켓)을 누르면 뜬다(desktop.js 가 이 모듈을 그때 불러온다).
 * 맥의 Launchpad 처럼 유리 판 위에 앱 아이콘이 줄지어 서고(이름 밑에 한 줄
 * 설명), 누르면 그 프로젝트를 새 탭에서 연다. 마우스를 대면 아래 상태 막대에
 * 그 주소가 뜬다(브라우저가 링크 주소를 보여 주듯이).
 * 프로젝트 목록은 _data/projects.yml 에 있다(dock.html 이 JSON 으로 싣는다).
 *
 * 창은 하나만 뜬다. 다시 누르면 앞으로 오고, 닫으면 치운다.
 */
import { setupWindow, focusWindow, closeWindow, setCloser, openWindow, flyTo } from './windows.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let win = null;
let dockButton = null;

function projects() {
  try {
    return JSON.parse($('#projects-data')?.textContent || '[]') || [];
  } catch {
    return [];
  }
}

const traffic = `
  <div class="traffic" role="group" aria-label="창 조작">
    <button class="traffic__btn traffic__btn--close" type="button" data-window-action="close" aria-label="닫기"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg></button>
    <button class="traffic__btn traffic__btn--min" type="button" data-window-action="minimize" aria-label="최소화"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-minus"/></svg></button>
    <button class="traffic__btn traffic__btn--zoom" type="button" data-window-action="zoom" aria-label="확대" aria-pressed="false"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-zoom"/></svg></button>
  </div>`;

function build(list) {
  const el = document.createElement('section');
  el.className = 'window games';
  el.dataset.window = 'games';
  el.dataset.dynamic = '';
  el.tabIndex = -1;
  el.setAttribute('aria-labelledby', 'games-title');
  const base = '/assets/images/apps/';
  el.innerHTML = `
    <header class="games__bar" data-window-drag>
      ${traffic}
      <h2 class="games__title" id="games-title">게임</h2>
      <button class="games__close" type="button" data-window-action="close" aria-label="게임 창 닫기">
        <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg>
      </button>
    </header>
    <ul class="games__grid" aria-label="개인 프로젝트">
      ${list
        .map(
          (p) => `<li>
            <a class="games__app" href="${esc(p.url)}" target="_blank" rel="noopener"
               aria-label="${esc(p.name)} — ${esc(p.desc)} (새 탭)">
              <img class="games__icon" src="${base}${esc(p.icon)}-128.png"
                   srcset="${base}${esc(p.icon)}-128.png 1x, ${base}${esc(p.icon)}-256.png 2x" alt="" draggable="false">
              <span class="games__name">${esc(p.name)}</span>
              <span class="games__desc">${esc(p.desc)}</span>
            </a>
          </li>`,
        )
        .join('')}
    </ul>
    <footer class="games__status" data-games-status aria-hidden="true">개인 프로젝트 ${list.length}개</footer>`;
  return el;
}

export async function openGames(button) {
  dockButton = button || dockButton;
  if (win?.isConnected) {
    await openWindow(win);
    focusWindow(win);
    return win;
  }

  const list = projects();
  win = build(list);
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

  // 마우스나 초점이 머문 앱의 주소를 아래 상태 막대에(https:// 는 떼고)
  const status = $('[data-games-status]', win);
  const idle = status.textContent;
  const show = (e) => {
    const app = e.target.closest?.('.games__app');
    status.textContent = app ? app.href.replace(/^https?:\/\//, '').replace(/\/$/, '') : idle;
  };
  win.addEventListener('pointerover', show);
  win.addEventListener('focusin', show);
  $('.games__grid', win).addEventListener('pointerleave', () => (status.textContent = idle));

  $$('.games__app', win)[0]?.focus({ preventScroll: true });
  return win;
}
