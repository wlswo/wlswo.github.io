/*
 * 메뉴 막대의 Wi-Fi 와 배터리 — 모형
 *
 * 브라우저는 기기의 Wi-Fi 를 읽을 수 없고, 읽을 수 있더라도 방문자의 것을
 * 보여 줄 까닭이 없다. 그래서 맥의 메뉴를 흉내 낸 가짜 자료를 보인다.
 * Wi-Fi 는 끄고 켜고, 다른 네트워크를 골라 붙을 수 있다(붙는 척만 한다).
 * 배터리 메뉴의 '저전력 모드'는
 * 진짜로 움직임(고양이 따위)을 멈춘다(desktop.js). 그동안 배터리는 노랗게 된다(CSS).
 */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// 신호 세기(1~3), 잠금 여부. 앞의 둘은 전에 붙어 본 네트워크다.
const NETWORKS = [
  { name: 'Ephemeris-5G', bars: 3, lock: true, known: true },
  { name: 'Ephemeris', bars: 3, lock: true, known: true },
  { name: 'iptime', bars: 2, lock: true },
  { name: 'KT_GiGA_5G_3F1C', bars: 2, lock: true },
  { name: 'U+Net8A2C', bars: 1, lock: true },
  { name: 'Cafe_Free_WiFi', bars: 1, lock: false },
];

const button = $('[data-wifi-button]');
const glyph = $('[data-wifi-glyph]');
const toggle = $('[data-wifi-toggle]');
const knownList = $('[data-wifi-list]');
const otherList = $('[data-wifi-others]');

let on = true;
let current = 'Ephemeris-5G';
let joining = null;

const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 세기에 따라 바깥 띠를 흐리게 한 부채꼴
function fan(bars) {
  const dim = (n) => (bars >= n ? '' : ' opacity=".28"');
  return `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M1.59 7.79a11.9 11.9 0 0 1 16.82 0" stroke-width="2"${dim(3)}/>
    <path d="M4.27 10.47a8.1 8.1 0 0 1 11.46 0" stroke-width="2"${dim(2)}/>
    <path d="M6.96 13.16a4.3 4.3 0 0 1 6.08 0" stroke-width="2"/>
    <circle cx="10" cy="16.2" r="1.7" fill="currentColor" stroke="none"/></svg>`;
}

function row(n) {
  const isOn = n.name === current;
  const state = joining === n.name ? '연결 중…' : '';
  return `<button class="menu__item menu__net${isOn ? ' is-joined' : ''}" role="menuitemradio" aria-checked="${isOn}"
      type="button" data-net="${escapeHTML(n.name)}" aria-label="${escapeHTML(n.name)}${n.lock ? ', 암호 걸림' : ''}${isOn ? ', 연결됨' : ''}">
    <span class="menu__net-icon">${fan(n.bars)}</span>
    <span class="menu__text">${escapeHTML(n.name)}</span>
    ${state ? `<span class="menu__meta">${state}</span>` : ''}
    ${n.lock ? '<svg class="icon menu__lock" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-lock"/></svg>' : ''}
  </button>`;
}

function render() {
  if (!button) return;
  toggle.setAttribute('aria-checked', String(on));
  for (const el of $$('[data-wifi-on]')) el.hidden = !on;
  knownList.innerHTML = NETWORKS.filter((n) => n.known).map(row).join('');
  otherList.innerHTML = NETWORKS.filter((n) => !n.known).map(row).join('');

  glyph.setAttribute('href', on ? '#i-wifi' : '#i-wifi-off');
  if (!on) button.setAttribute('aria-label', 'Wi-Fi: 꺼짐');
  else if (joining) button.setAttribute('aria-label', `Wi-Fi: ${joining}에 연결하는 중`);
  else button.setAttribute('aria-label', `Wi-Fi: ${current} 연결됨`);
  button.classList.toggle('is-off', !on);
}

if (button) {
  toggle.addEventListener('click', () => {
    on = !on;
    joining = null;
    render();
    toggle.focus();
  });

  // 다른 네트워크를 고르면 잠깐 '연결 중…'이었다가 붙는다.
  button.closest('[data-menu]').addEventListener('click', (e) => {
    const item = e.target.closest('[data-net]');
    if (!item || item.dataset.net === current) return;
    const net = NETWORKS.find((n) => n.name === item.dataset.net);
    joining = net.name;
    render();
    setTimeout(() => {
      if (joining !== net.name || !on) return;
      joining = null;
      current = net.name;
      net.known = true;
      render();
    }, 1100);
  });

  render();
}
