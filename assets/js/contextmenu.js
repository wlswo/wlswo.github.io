/*
 * 우클릭 메뉴
 *
 * 맥처럼 누른 자리에 유리 메뉴가 뜬다. 어디를 눌렀는지에 따라 항목이 다르다:
 *   바탕           Finder 열기 · 아이콘 정리 · Spotlight · 모양(자동/라이트/다크)
 *   데스크톱 아이콘 열기 · 새 탭에서 열기 · 링크 복사 · 정보 가져오기 · 이름 변경 · Finder 에서 보기
 *   글 목록의 한 줄 열기 · 새 탭에서 열기 · 링크 복사
 *   Dock 의 앱     열기(링크인 Finder 는 새 탭에서 열기 · 링크 복사도)
 *   날씨 위젯      Size(Small · Medium · Large) · Remove Widget
 *   (바탕에서 위젯을 지웠으면 바탕 메뉴에 '위젯 추가')
 * 그 밖의 자리(본문의 글자, 링크, 입력 칸)는 브라우저의 메뉴를 그대로 둔다.
 * 키보드로는 초점이 간 항목에서 ContextMenu 키나 ⇧F10 으로 연다.
 */
import { notify, openWindow } from './windows.js';
import { iconInfo, renameIcon, revealInFinder } from './macos.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const workspace = $('#workspace');
let menu = null;
let returnTo = null;

function copyLink(href) {
  const url = new URL(href, location.href).href;
  navigator.clipboard
    ?.writeText(url)
    .then(() => notify('Link copied.'))
    .catch(() => notify('Couldn’t copy the link.'));
}

function linkItems(el, open) {
  const href = el.getAttribute('href');
  return [
    { label: 'Open', run: open },
    { label: 'Open in New Tab', run: () => window.open(href, '_blank', 'noopener') },
    '-',
    { label: 'Copy Link', run: () => copyLink(href) },
  ];
}

const WIDGET_SIZES = { small: 'Small', medium: 'Medium', large: 'Large' };

function itemsFor(target) {
  const widget = target.closest('[data-weather]');
  if (widget) {
    // 맥의 위젯 메뉴(영어 그대로): 흐린 'Size' 머리 아래 셋, 지금 크기는 왼쪽에 ✓.
    return [
      { heading: 'Size' },
      ...Object.entries(WIDGET_SIZES).map(([size, label]) => ({
        label,
        radio: widget.dataset.size === size,
        lead: true,
        run: () => dispatchEvent(new CustomEvent('ephemeris:widget-size', { detail: size })),
      })),
      '-',
      { label: 'Remove Widget', lead: true, run: () => dispatchEvent(new Event('ephemeris:widget-remove')) },
    ];
  }
  const icon = target.closest('[data-desktop-icon]');
  if (icon) {
    return [
      ...linkItems(icon, () => icon.dispatchEvent(new CustomEvent('ephemeris:open-icon', { bubbles: true }))),
      '-',
      { label: 'Get Info', run: () => iconInfo(icon) },
      { label: 'Rename', run: () => renameIcon(icon) },
      { label: 'Show in Finder', run: () => revealInFinder(icon) },
    ];
  }
  const row = target.closest('.row__link');
  if (row) return linkItems(row, () => row.click());
  const app = target.closest('.dock__app');
  // 다운로드 폴더(스택): 맥처럼 '보기 방식'을 고른다(downloads.js 가 기억한다).
  if (app?.matches('[data-dock-downloads]')) {
    let view = 'auto';
    try {
      view = localStorage.getItem('ephemeris:stack-view') || 'auto';
    } catch {}
    const pick = (v) => () => import('./downloads.js').then((m) => m.setStackView(v));
    return [
      { label: 'Open', run: () => app.click() },
      '-',
      { label: 'View Content as Fan', radio: view === 'fan', run: pick('fan') },
      { label: 'View Content as Grid', radio: view === 'grid', run: pick('grid') },
      { label: 'View Content as Automatic', radio: view === 'auto', run: pick('auto') },
    ];
  }
  if (app) return app.href ? linkItems(app, () => app.click()) : [{ label: 'Open', run: () => app.click() }];
  if (target === workspace) {
    const finder = $('[data-window="finder"]');
    return [
      {
        label: 'Open Finder',
        run: () => (finder ? openWindow(finder) : (location.href = '/')),
      },
      ...(finder ? [{ label: 'Clean Up', run: () => dispatchEvent(new Event('ephemeris:icons-cleanup')) }] : []),
      ...($('[data-weather][data-removed]')
        ? [{ label: 'Add Widget', run: () => dispatchEvent(new Event('ephemeris:widget-add')) }]
        : []),
      { label: 'Spotlight Search', run: () => $('[data-open-spotlight]')?.click() },
      '-',
      {
        label: 'Change Wallpaper…',
        run: () => dispatchEvent(new CustomEvent('ephemeris:settings', { detail: { pane: 'wallpaper' } })),
      },
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
  menu.setAttribute('aria-label', 'Context menu');
  menu.tabIndex = -1;
  for (const it of list) {
    if (it === '-') {
      const sep = document.createElement('div');
      sep.className = 'menu__sep';
      sep.setAttribute('role', 'separator');
      menu.append(sep);
      continue;
    }
    if (it.heading) {
      const h = document.createElement('div');
      h.className = 'menu__heading';
      h.setAttribute('role', 'presentation');
      h.textContent = it.heading;
      menu.append(h);
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = it.lead ? 'menu__item menu__item--lead' : 'menu__item';
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
