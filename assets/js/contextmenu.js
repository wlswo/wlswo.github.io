/*
 * 우클릭 메뉴
 *
 * 맥처럼 누른 자리에 유리 메뉴가 뜬다. 어디를 눌렀는지에 따라 항목이 다르다:
 *   바탕           Finder 열기 · 아이콘 정리 · Spotlight · 모양(자동/라이트/다크)
 *   데스크톱 아이콘 열기 · 새 탭에서 열기 · 링크 복사
 *   글 목록의 한 줄 열기 · 새 탭에서 열기 · 링크 복사
 *   Dock 의 앱     열기(링크인 Finder 는 새 탭에서 열기 · 링크 복사도)
 * 그 밖의 자리(본문의 글자, 링크, 입력 칸)는 브라우저의 메뉴를 그대로 둔다.
 * 키보드로는 초점이 간 항목에서 ContextMenu 키나 ⇧F10 으로 연다.
 */
import { notify, openWindow } from './windows.js';
import { getAppearance, setAppearance } from './theme.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const workspace = $('#workspace');
let menu = null;
let returnTo = null;

function copyLink(href) {
  const url = new URL(href, location.href).href;
  navigator.clipboard
    ?.writeText(url)
    .then(() => notify('링크를 복사했습니다'))
    .catch(() => notify('링크를 복사하지 못했습니다'));
}

function linkItems(el, open) {
  const href = el.getAttribute('href');
  return [
    { label: '열기', run: open },
    { label: '새 탭에서 열기', run: () => window.open(href, '_blank', 'noopener') },
    '-',
    { label: '링크 복사', run: () => copyLink(href) },
  ];
}

function itemsFor(target) {
  const icon = target.closest('[data-desktop-icon]');
  if (icon) return linkItems(icon, () => icon.dispatchEvent(new CustomEvent('ephemeris:open-icon', { bubbles: true })));
  const row = target.closest('.row__link');
  if (row) return linkItems(row, () => row.click());
  const app = target.closest('.dock__app');
  if (app) return app.href ? linkItems(app, () => app.click()) : [{ label: '열기', run: () => app.click() }];
  if (target === workspace) {
    const finder = $('[data-window="finder"]');
    const a = getAppearance();
    return [
      {
        label: 'Finder 열기',
        run: () => (finder ? openWindow(finder) : (location.href = '/')),
      },
      ...(finder ? [{ label: '아이콘 정리', run: () => dispatchEvent(new Event('ephemeris:icons-cleanup')) }] : []),
      { label: 'Spotlight 검색', run: () => $('[data-open-spotlight]')?.click() },
      '-',
      { label: '모양: 자동', radio: a === 'auto', run: () => setAppearance('auto') },
      { label: '모양: 라이트', radio: a === 'light', run: () => setAppearance('light') },
      { label: '모양: 다크', radio: a === 'dark', run: () => setAppearance('dark') },
    ];
  }
  return null;
}

function close({ restore = false } = {}) {
  if (!menu) return;
  menu.remove();
  menu = null;
  if (restore) returnTo?.focus?.({ preventScroll: true });
}

function items() {
  return menu ? $$('[role^="menuitem"]', menu) : [];
}

function open(list, x, y, { keyboard = false, from = null } = {}) {
  close();
  dispatchEvent(new CustomEvent('ephemeris:popup', { detail: 'context' }));
  returnTo = from ?? document.activeElement;
  menu = document.createElement('div');
  menu.className = 'context-menu glass';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '바로 가기 메뉴');
  menu.tabIndex = -1;
  for (const it of list) {
    if (it === '-') {
      const sep = document.createElement('div');
      sep.className = 'menu__sep';
      sep.setAttribute('role', 'separator');
      menu.append(sep);
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu__item';
    b.textContent = it.label;
    if ('radio' in it) {
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', String(it.radio));
    } else {
      b.setAttribute('role', 'menuitem');
    }
    b.addEventListener('click', () => {
      close({ restore: true });
      it.run();
    });
    menu.append(b);
  }
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(6, Math.min(x, innerWidth - r.width - 6))}px`;
  menu.style.top = `${Math.max(6, Math.min(y, innerHeight - r.height - 6))}px`;
  if (keyboard) items()[0]?.focus();
  else menu.focus({ preventScroll: true });

  menu.addEventListener('keydown', (e) => {
    const list = items();
    const at = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(at + 1) % list.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(at - 1 + list.length) % list.length].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list.at(-1).focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close({ restore: true });
    } else if (e.key === 'Tab') {
      close();
    }
  });
}

document.addEventListener('contextmenu', (e) => {
  if (menu && menu.contains(e.target)) {
    e.preventDefault();
    return;
  }
  const list = itemsFor(e.target);
  if (!list) {
    close();
    return;
  }
  e.preventDefault();
  open(list, e.clientX, e.clientY, { from: e.target.closest('a, button') ?? e.target });
});

// 키보드: ContextMenu 키, ⇧F10
document.addEventListener('keydown', (e) => {
  if (!(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) return;
  const el = document.activeElement;
  if (!el || el === document.body) return;
  const list = itemsFor(el);
  if (!list) return;
  e.preventDefault();
  const r = el.getBoundingClientRect();
  open(list, r.left + Math.min(24, r.width / 2), r.top + Math.min(r.height, 28), { keyboard: true, from: el });
});

document.addEventListener('pointerdown', (e) => {
  if (menu && !menu.contains(e.target)) close();
});
addEventListener('resize', () => close());
addEventListener('blur', () => close());
addEventListener(
  'scroll',
  (e) => {
    if (menu && !menu.contains(e.target)) close();
  },
  true,
);
addEventListener('ephemeris:popup', (e) => {
  if (e.detail !== 'context') close();
});
