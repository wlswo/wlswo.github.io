/*
 * 제어 센터
 *
 * 메뉴 막대의 스위치 두 개 모양을 누르면 뜬다. 맥의 제어 센터처럼 자주 쓰는 것을
 * 한 판에 모았다:
 *   Wi-Fi        메뉴 막대의 Wi-Fi 와 같은 스위치(status.js)
 *   방해 금지    켜 두면 알림 판을 띄우지 않는다(알림 센터에는 남는다)
 *   다크 모드    모양을 라이트, 다크로(theme.js)
 *   저전력 모드  배터리 메뉴의 것과 같다(움직임을 멈춘다)
 *   디스플레이   화면을 어둡게(덮개 한 장의 짙기)
 *   사운드       Spotify 창의 음량
 *   지금 재생 중 Spotify 의 곡 이름과 이전, 재생, 다음
 */
import { setAppearance } from './theme.js';
import { SITE } from './site.js';

const $ = (sel, root = document) => root.querySelector(sel);
const root = document.documentElement;
const panel = $('#menu-cc');

const store = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch {}
  },
};

// ── 방해 금지 ──
function setDnd(on) {
  root.dataset.dnd = on ? 'on' : 'off';
  store.set('ephemeris:dnd', on ? 'on' : 'off');
}
setDnd(store.get('ephemeris:dnd') === 'on');

// ── 밝기: 화면 위에 까만 덮개 한 장 ──
let dim = null;
function setBrightness(v) {
  const k = Math.max(40, Math.min(100, Number(v) || 100));
  if (!dim) {
    dim = document.createElement('div');
    dim.className = 'screen-dim';
    dim.setAttribute('aria-hidden', 'true');
    document.body.append(dim);
  }
  dim.style.opacity = String(((100 - k) / 100) * 1.2);
  store.set('ephemeris:brightness', String(k));
  const input = $('[data-cc-bright]');
  if (input) {
    input.value = String(k);
    input.style.setProperty('--p', `${((k - 40) / 60) * 100}%`);
  }
}
setBrightness(store.get('ephemeris:brightness') || 100);

// ── 판의 모습을 지금 상태에 맞춘다 ──
function sync() {
  if (!panel) return;
  const check = (key, on) => $(`[data-cc="${key}"]`, panel)?.setAttribute('aria-checked', String(on));
  const wifi = $('[data-wifi-toggle]');
  check('wifi', wifi ? wifi.getAttribute('aria-checked') === 'true' : true);
  const net = $('.menu__net.is-joined .menu__text')?.textContent;
  $('[data-cc-wifi-name]', panel).textContent = wifi?.getAttribute('aria-checked') === 'false' ? 'Off' : net || SITE.desktop.wifi;
  check('dnd', root.dataset.dnd === 'on');
  check('dark', root.dataset.theme === 'dark');
  check('still', root.classList.contains('is-still'));

  const vol = $('.window.music [data-music-volume]');
  const volInput = $('[data-cc-volume]', panel);
  if (vol) volInput.value = vol.value;
  volInput.style.setProperty('--p', `${volInput.value}%`);

  const music = $('.window.music');
  const title = music && $('[data-music-title]', music)?.textContent;
  $('[data-cc-title]', panel).textContent = title || 'Not Playing';
  $('[data-cc-artist]', panel).textContent = title ? $('[data-music-artist]', music)?.textContent || SITE.music.album.artist : 'Spotify';
  const cover = music && $('.music__cover', music)?.src;
  $('[data-cc-art]', panel).src = cover || $('[data-cc-art]', panel).src;
  const playing = music?.classList.contains('is-playing');
  $('[data-cc-play]', panel).innerHTML = playing
    ? '<rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/>'
    : '<path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8A.8.8 0 0 0 8 5.2z"/>';
}

if (panel) {
  $('[data-cc-button]')?.addEventListener('click', sync);
  addEventListener('ephemeris:theme', sync);
  addEventListener('ephemeris:still', sync);

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cc]');
    if (!b) return;
    const key = b.dataset.cc;
    if (key === 'wifi') $('[data-wifi-toggle]')?.click();
    if (key === 'dnd') setDnd(root.dataset.dnd !== 'on');
    if (key === 'dark') setAppearance(root.dataset.theme === 'dark' ? 'light' : 'dark');
    if (key === 'still') $('[data-still-toggle]')?.click();
    if (key === 'play' || key === 'next' || key === 'prev') {
      const music = $('.window.music');
      if (!music) $('[data-dock-music]')?.click();
      else $(`[data-music-${key}]`, music)?.click();
    }
    setTimeout(sync, 60);
  });

  $('[data-cc-bright]', panel).addEventListener('input', (e) => setBrightness(e.target.value));
  $('[data-cc-volume]', panel).addEventListener('input', (e) => {
    e.target.style.setProperty('--p', `${e.target.value}%`);
    const vol = $('.window.music [data-music-volume]');
    if (!vol) return;
    vol.value = e.target.value;
    vol.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // 슬라이더를 끄는 동안 방향키가 메뉴를 옮기지 않게
  for (const input of panel.querySelectorAll('input[type="range"]')) {
    input.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.stopPropagation();
    });
  }
  sync();
}
