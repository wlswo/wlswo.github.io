/*
 * 메일: 맥(Tahoe)의 Mail 앱
 *
 * 방문자가 블로그 주인에게 편지를 쓰는 곳이다. 이 사이트는 메일을 직접 보내지
 * 않는다 — '보내기'를 누르면 mailto: 주소로 방문자의 메일 앱을 열어 준다.
 *
 * 받은 편지함은 정직하게 채운다: 주인이 쓴 환영 편지(고정) 하나와, search.json 의
 * 진짜 글로 만든 '새 글' 알림. 지어낸 회사 메일이나 남의 이름을 빌린 편지는 없다.
 * 읽음 표시 · 임시 저장(Drafts) · 보낸 편지(Sent)는 이 브라우저의 localStorage 에만 남는다.
 * 주인의 주소와 이름은 dock.html 의 #site-data(_config.yml)를 site.js 로 읽는다(코드에 적지 않는다).
 *
 * 창은 둘이고 하나씩만 뜬다: 보기 창(mail)과 새 메시지 창(compose).
 * 폰에서는 메모 앱처럼 한 화면에 한 판씩(편지함 → 목록 → 편지), ‹ 로 돌아온다.
 */
import { setupWindow, focusWindow, closeWindow, setCloser, openWindow, flyTo, notify } from './windows.js';
import { loadPosts } from './posts.js';
import { SITE } from './site.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const NARROW = matchMedia('(max-width: 899px)');
const KEY = { read: 'ephemeris:mail:read', draft: 'ephemeris:mail:draft', sent: 'ephemeris:mail:sent', side: 'ephemeris:mail:side' };
const WELCOME = 'welcome';
const DRAFT = 'draft';
const FRESH = 3; // 처음 온 사람에게 '안 읽음'으로 보일 최근 글 수(26편이 다 안 읽음이면 시끄럽다)
const APP_ICON = '/assets/images/dock/mail-128.png';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let win = null; // 보기 창
let sheet = null; // 새 메시지 창
let dockButton = null;
let posts = [];
let postsState = 'loading'; // loading | ready | error
let box = 'inbox'; // inbox | sent | drafts | cat:<slug>
let current = null; // 고른 편지 id
let query = '';
let unreadOnly = false;
let readMap = {}; // id → true(읽음) / false(안 읽음). 없으면 기본값을 따른다
let saveTimer = 0;
let dirty = false; // 새 메시지 창에 방문자가 직접 손을 댔는지(미리 채운 답장만으로는 초안이 되지 않는다)

// ── 저장 ────────────────────────────────────────────────────────
// 저장 공간이 막혀 있으면(사생활 보호 창 따위) 이 창에서만 기억한다.
const store = {
  get(k, fallback) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

function loadDraft() {
  const d = store.get(KEY.draft, null);
  return d && typeof d === 'object' && (String(d.subject || '').trim() || String(d.body || '').trim())
    ? { subject: String(d.subject || ''), body: String(d.body || ''), updated: Number(d.updated) || Date.now() }
    : null;
}

function loadSent() {
  const v = store.get(KEY.sent, []);
  return Array.isArray(v) ? v.filter((m) => m && typeof m.id === 'string') : [];
}

// ── 사이트 주인 ─────────────────────────────────────────────────
function owner() {
  const s = SITE;
  const email = typeof s.email === 'string' && /^[^\s@<>]+@[^\s@<>]+$/.test(s.email.trim()) ? s.email.trim() : '';
  return { name: s.author || 'the author', email, blog: s.title || 'Ephemeris' };
}

const initial = (name) => (String(name).trim()[0] || '?').toUpperCase();

// ── 날짜 ────────────────────────────────────────────────────────
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
const numFmt = new Intl.DateTimeFormat('en-US', { year: '2-digit', month: 'numeric', day: 'numeric' });
const longFmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

// "2026.07.25" → 그날 0시
function parseDay(s) {
  const [y, m, d] = String(s || '').split('.').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

// 맥의 Mail 처럼: 오늘은 시각, 어제는 Yesterday, 이번 주는 요일, 그 전은 7/25/26.
function shortDate(d, dateOnly = false) {
  if (!d) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return dateOnly ? 'Today' : timeFmt.format(d);
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  const days = (now - d) / 864e5;
  if (days > 0 && days < 6) return dayFmt.format(d);
  return numFmt.format(d);
}

const longDate = (d, withTime = false) => (d ? (withTime ? `${longFmt.format(d)} at ${timeFmt.format(d)}` : longFmt.format(d)) : '');

// ── 편지들 ──────────────────────────────────────────────────────
// 편지 하나: { id, kind: welcome|post|sent|draft, who, subject, preview, date, post? }
function welcome() {
  const o = owner();
  return {
    id: WELCOME,
    kind: 'welcome',
    who: o.name,
    subject: `Welcome to ${o.blog} — write to me anytime`,
    preview: `Hi, I'm ${o.name}. If you have thoughts on a post, a question, or an opportunity, I'd love to hear from you.`,
    date: null,
  };
}

function postMessages() {
  const o = owner();
  return posts.map((p) => ({
    id: p.url,
    kind: 'post',
    who: o.blog,
    subject: p.title,
    preview: p.description || '',
    date: parseDay(p.date),
    post: p,
    ko: true,
  }));
}

function sentMessages() {
  const o = owner();
  return loadSent()
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .map((m) => ({
      id: m.id,
      kind: 'sent',
      who: o.name,
      subject: m.subject || 'No Subject',
      preview: m.body || '',
      date: m.at ? new Date(m.at) : null,
      body: m.body || '',
      rawSubject: m.subject || '',
    }));
}

function draftMessages() {
  const d = loadDraft();
  if (!d) return [];
  return [
    {
      id: DRAFT,
      kind: 'draft',
      who: owner().name,
      subject: d.subject.trim() || 'No Subject',
      preview: d.body.trim() || 'No additional text',
      date: new Date(d.updated),
      body: d.body,
      rawSubject: d.subject,
    },
  ];
}

// 카테고리마다 편지함 하나(가나다 대신 이름순)
function categories() {
  const map = new Map();
  for (const p of posts) {
    if (!p.slug) continue;
    if (!map.has(p.slug)) map.set(p.slug, { slug: p.slug, name: p.category || p.slug, icon: p.icon || 'folder' });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function messagesOf(b = box) {
  if (b === 'inbox') return [welcome(), ...postMessages()];
  if (b === 'sent') return sentMessages();
  if (b === 'drafts') return draftMessages();
  if (b.startsWith('cat:')) return postMessages().filter((m) => m.post.slug === b.slice(4));
  return [];
}

const boxName = (b = box) =>
  b === 'inbox' ? 'Inbox' : b === 'sent' ? 'Sent' : b === 'drafts' ? 'Drafts' : categories().find((c) => `cat:${c.slug}` === b)?.name || 'Mailbox';

function findMessage(id) {
  return [welcome(), ...postMessages(), ...sentMessages(), ...draftMessages()].find((m) => m.id === id) || null;
}

// ── 읽음 ────────────────────────────────────────────────────────
const canRead = (m) => m.kind === 'welcome' || m.kind === 'post';

function isUnread(m) {
  if (!canRead(m)) return false;
  if (m.id in readMap) return !readMap[m.id];
  if (m.kind === 'welcome') return true;
  return posts.indexOf(m.post) < FRESH;
}

function setRead(m, read) {
  if (!m || !canRead(m) || isUnread(m) === !read) return;
  readMap[m.id] = read;
  store.set(KEY.read, readMap);
}

const unreadCount = (list) => list.filter(isUnread).length;

// ── 그림 ────────────────────────────────────────────────────────
const svg = (body, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 20 20" aria-hidden="true">${body}</svg>`;
const use = (id) => svg(`<use href="#i-${id}"/>`);
const ICON = {
  compose: svg('<path d="M9.2 3.6H5a1.6 1.6 0 0 0-1.6 1.6v9.8A1.6 1.6 0 0 0 5 16.6h9.8a1.6 1.6 0 0 0 1.6-1.6v-4.2"/><path d="M14.6 2.8a1.5 1.5 0 0 1 2.1 2.1L10 11.6l-2.8.7.7-2.8z"/>'),
  send: svg('<path d="M17.4 2.6 2.9 8.6l5.9 2.6 2.6 5.9z"/><path d="m17.4 2.6-8.6 8.6"/>'),
  inbox: svg('<path d="M2.8 11.2 4.8 4.9a1.7 1.7 0 0 1 1.6-1.2h7.2a1.7 1.7 0 0 1 1.6 1.2l2 6.3v3.9a1.7 1.7 0 0 1-1.7 1.7H4.5a1.7 1.7 0 0 1-1.7-1.7z"/><path d="M2.9 11.2h4l.9 2h4.4l.9-2h4"/>'),
  drafts: use('doc'),
  trash: svg('<path d="M3.8 5.4h12.4M8 5.4V3.8h4v1.6M5.4 5.4l.8 10.2a1.4 1.4 0 0 0 1.4 1.3h4.8a1.4 1.4 0 0 0 1.4-1.3l.8-10.2M8.6 8.4v5.4M11.4 8.4v5.4"/>'),
  reply: svg('<path d="M8 4.4 3.4 9l4.6 4.6"/><path d="M3.6 9h7.8a5.2 5.2 0 0 1 5.2 5.2v1.2"/>'),
  unread: svg('<rect x="2.8" y="4.4" width="14.4" height="11.2" rx="2.2"/><path d="m3.4 5.6 6.6 5.2 6.6-5.2"/>'),
  read: svg('<path d="M2.8 8.6v6.6a1.8 1.8 0 0 0 1.8 1.8h10.8a1.8 1.8 0 0 0 1.8-1.8V8.6L10 3.4z"/><path d="m3.2 8.8 6.8 4.6 6.8-4.6"/>'),
  filter: svg('<circle cx="10" cy="10" r="7.4"/><path d="M6.3 7.7h7.4M7.6 10.3h4.8M8.9 12.9h2.2"/>'),
  sidebar: use('sidebar'),
  search: use('search'),
  back: use('chevron-left'),
  close: use('close'),
  pin: svg('<path d="M7.4 2.8h5.2l-.8 4.6 2.8 2.8H5.4l2.8-2.8zM10 10.2v6.6"/>', 'icon mail__pin'),
};

const traffic = (extra = '') => `
  <div class="traffic${extra}" role="group" aria-label="Window controls">
    <button class="traffic__btn traffic__btn--close" type="button" data-window-action="close" aria-label="Close"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg></button>
    <button class="traffic__btn traffic__btn--min" type="button" data-window-action="minimize" aria-label="Minimize"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-minus"/></svg></button>
    <button class="traffic__btn traffic__btn--zoom" type="button" data-window-action="zoom" aria-label="Zoom" aria-pressed="false"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-zoom"/></svg></button>
  </div>`;

// 보낸 사람 얼굴: 사람은 맥처럼 회색 동그라미에 첫 글자, 글 알림은 그 카테고리 색에 아이콘.
function avatar(m, big = false) {
  const cls = `mail__avatar${big ? ' mail__avatar--lg' : ''}`;
  if (m.kind === 'post') {
    return `<span class="${cls} mail__avatar--post" style="--c: ${esc(m.post.color || '#8e8e93')}" aria-hidden="true">${use(esc(m.post.icon || 'doc'))}</span>`;
  }
  return `<span class="${cls}" aria-hidden="true">${esc(initial(m.who))}</span>`;
}

// ── 보기 창 ─────────────────────────────────────────────────────
function build() {
  const el = document.createElement('section');
  el.className = 'window mail';
  el.dataset.window = 'mail';
  el.dataset.dynamic = '';
  el.dataset.pane = 'list';
  el.tabIndex = -1;
  el.setAttribute('aria-labelledby', 'mail-title');
  el.innerHTML = `
    <div class="mail__frame">
      <aside class="mail__side" aria-label="Mailboxes">
        <div class="mail__chrome" data-window-drag>
          ${traffic()}
          <button class="mail__tool mail__side-toggle" type="button" data-mail-side aria-label="Hide Sidebar" title="Hide Sidebar">${ICON.sidebar}</button>
          <button class="mail__close" type="button" data-window-action="close" aria-label="Close Mail">${ICON.close}</button>
        </div>
        <h2 class="mail__side-title">Mailboxes</h2>
        <nav class="mail__boxes" data-mail-boxes aria-label="Mailboxes"></nav>
      </aside>
      <div class="mail__listpane">
        <header class="mail__bar mail__bar--list" data-window-drag>
          ${traffic(' mail__traffic-alt')}
          <button class="mail__tool mail__side-toggle mail__side-toggle--alt" type="button" data-mail-side aria-label="Show Sidebar" title="Show Sidebar">${ICON.sidebar}</button>
          <button class="mail__back" type="button" data-mail-to="boxes">${ICON.back}<span>Mailboxes</span></button>
          <div class="mail__titles">
            <h2 class="mail__title" id="mail-title" data-mail-title>Inbox</h2>
            <p class="mail__sub" data-mail-sub></p>
          </div>
          <div class="mail__caps">
            <button class="mail__tool" type="button" data-mail-filter aria-pressed="false" aria-label="Show Unread Only" title="Show Unread Only">${ICON.filter}</button>
            <button class="mail__tool" type="button" data-mail-compose aria-label="New Message" title="New Message (⌥N)">${ICON.compose}</button>
          </div>
          <button class="mail__close" type="button" data-window-action="close" aria-label="Close Mail">${ICON.close}</button>
        </header>
        <label class="mail__search">
          ${ICON.search}
          <input type="search" placeholder="Search" aria-label="Search mail" autocomplete="off" spellcheck="false" data-mail-search>
        </label>
        <div class="mail__list" data-mail-list role="listbox" aria-labelledby="mail-title"></div>
      </div>
      <div class="mail__reader">
        <header class="mail__bar mail__bar--reader" data-window-drag>
          <button class="mail__back" type="button" data-mail-to="list">${ICON.back}<span data-mail-back-name>Inbox</span></button>
          <span class="mail__spacer"></span>
          <div class="mail__caps">
            <button class="mail__tool" type="button" data-mail-toggle-read aria-label="Mark as Unread" title="Mark as Unread">${ICON.unread}</button>
            <button class="mail__tool" type="button" data-mail-trash aria-label="Delete" title="Delete">${ICON.trash}</button>
          </div>
          <div class="mail__caps">
            <button class="mail__tool" type="button" data-mail-reply aria-label="Reply" title="Reply">${ICON.reply}</button>
          </div>
        </header>
        <div class="mail__view" data-mail-view tabindex="-1"></div>
      </div>
    </div>`;
  return el;
}

function boxButton(id, icon, name, count, label = '') {
  const on = box === id;
  const aria = `${name}${count ? `, ${count} ${label || 'unread'}` : ''}`;
  return `<li><button class="mail__box" type="button" data-box="${esc(id)}" aria-label="${esc(aria)}"${on ? ' aria-current="true"' : ''}>
    ${icon}<span class="mail__box-name">${esc(name)}</span><span class="mail__box-count" aria-hidden="true">${count || ''}</span>
  </button></li>`;
}

function renderBoxes() {
  const inbox = messagesOf('inbox');
  const drafts = draftMessages().length;
  let html = `
    <p class="mail__group" id="mail-fav">Favorites</p>
    <ul class="mail__boxlist" aria-labelledby="mail-fav">
      ${boxButton('inbox', ICON.inbox, 'Inbox', unreadCount(inbox))}
      ${boxButton('sent', ICON.send, 'Sent', 0)}
      ${boxButton('drafts', ICON.drafts, 'Drafts', drafts, drafts === 1 ? 'draft' : 'drafts')}
    </ul>`;
  const cats = categories();
  if (cats.length) {
    html += `
    <p class="mail__group" id="mail-cats">Mailboxes</p>
    <ul class="mail__boxlist" aria-labelledby="mail-cats">
      ${cats.map((c) => boxButton(`cat:${c.slug}`, use(esc(c.icon)), c.name, unreadCount(messagesOf(`cat:${c.slug}`)))).join('')}
    </ul>`;
  }
  $('[data-mail-boxes]', win).innerHTML = html;
}

function matches(m) {
  if (!query) return true;
  return `${m.who} ${m.subject} ${m.preview}`.normalize('NFC').toLowerCase().includes(query);
}

function visibleMessages() {
  return messagesOf().filter((m) => matches(m) && (!unreadOnly || isUnread(m) || m.id === current));
}

function row(m) {
  const on = m.id === current;
  const unread = isUnread(m);
  const when =
    m.kind === 'welcome'
      ? `<span class="mail__when mail__when--pin">${ICON.pin}Pinned</span>`
      : m.kind === 'draft'
        ? '<span class="mail__when mail__when--draft">Draft</span>'
        : `<span class="mail__when">${esc(shortDate(m.date, m.kind === 'post'))}</span>`;
  const who = m.kind === 'sent' || m.kind === 'draft' ? `To: ${m.who}` : m.who;
  const ko = m.ko ? ' lang="ko"' : '';
  return `<button class="mail__row${unread ? ' is-unread' : ''}${on ? ' is-current' : ''}" type="button" role="option" aria-selected="${on}" data-msg="${esc(m.id)}">
    <span class="mail__dot" aria-hidden="true"></span>
    ${avatar(m)}
    <span class="mail__row-main">
      <span class="mail__row-top">${unread ? '<span class="sr-only">Unread. </span>' : ''}<span class="mail__who">${esc(who)}</span>${when}</span>
      <span class="mail__row-subject"${ko}>${esc(m.subject)}</span>
      <span class="mail__row-preview"${ko}>${esc(m.preview)}</span>
    </span>
  </button>`;
}

function renderList() {
  const list = $('[data-mail-list]', win);
  const hadFocus = list.contains(document.activeElement);
  const all = messagesOf();
  const shown = visibleMessages();
  let html = shown.map(row).join('');
  if (!shown.length) {
    const why = query ? `No results for “${esc(query)}”` : unreadOnly ? 'No Unread Messages' : box === 'drafts' ? 'No Drafts' : box === 'sent' ? 'No Sent Messages' : 'No Messages';
    html = `<p class="mail__empty">${why}</p>`;
  }
  if (box !== 'sent' && box !== 'drafts' && postsState === 'loading') html += '<p class="mail__note">Loading posts…</p>';
  if (box === 'inbox' && postsState === 'error') html += '<p class="mail__note">Couldn’t load the post list.</p>';
  list.innerHTML = html;
  $('[data-mail-title]', win).textContent = boxName();
  $('[data-mail-back-name]', win).textContent = boxName();
  const unread = unreadCount(all);
  const n = all.length;
  $('[data-mail-sub]', win).textContent =
    box === 'drafts' ? `${n} ${n === 1 ? 'draft' : 'drafts'}` : `${n} ${n === 1 ? 'message' : 'messages'}${unread ? `, ${unread} unread` : ''}`;
  if (hadFocus) $(`[data-msg="${CSS.escape(current || '')}"]`, list)?.focus({ preventScroll: true });
}

function head(m, { from, addr = '', to, date }) {
  return `
    <header class="mail__head">
      ${avatar(m, true)}
      <div class="mail__head-main">
        <div class="mail__head-top">
          <p class="mail__from">${esc(from)}${addr ? ` <span class="mail__addr">&lt;${esc(addr)}&gt;</span>` : ''}</p>
          <p class="mail__date">${date}</p>
        </div>
        <h3 class="mail__subject" id="mail-subject"${m.ko ? ' lang="ko"' : ''}>${esc(m.subject)}</h3>
        <p class="mail__to">To: ${esc(to)}</p>
      </div>
    </header>`;
}

function renderReader() {
  const view = $('[data-mail-view]', win);
  const m = current ? findMessage(current) : null;
  const o = owner();
  syncTools(m);
  if (!m) {
    view.innerHTML = '<p class="mail__none">No Message Selected</p>';
    return;
  }
  let body = '';
  if (m.kind === 'welcome') {
    body = `
      ${head(m, { from: o.name, addr: o.email, to: 'You', date: `${ICON.pin}Pinned` })}
      <div class="mail__body">
        <p>Hi, I’m ${esc(o.name)} — I write ${esc(o.blog)}.</p>
        <p>Thanks for stopping by. If a post sparked a thought, left you with a question, or you have an opportunity in mind, I’d love to hear from you.</p>
        <p>${
          o.email
            ? `Your message opens in your own mail app, addressed to <span class="mail__address">${esc(o.email)}</span>.`
            : 'Your message opens in your own mail app.'
        }</p>
        <div class="mail__actions">
          <button class="mail__cta" type="button" data-mail-write>${ICON.compose}Write to ${esc(o.name)}</button>
          ${o.email ? '<button class="mail__cta mail__cta--plain" type="button" data-mail-copy>Copy Address</button>' : ''}
        </div>
        <p class="mail__sign">— ${esc(o.name)}</p>
      </div>`;
  } else if (m.kind === 'post') {
    const p = m.post;
    body = `
      ${head(m, { from: o.blog, to: 'You', date: esc(longDate(m.date)) })}
      <div class="mail__body">
        <div class="mail__card" style="--c: ${esc(p.color || '#8e8e93')}">
          <p class="mail__kicker">${use(esc(p.icon || 'doc'))}New post in ${esc(p.category || o.blog)}</p>
          <h4 class="mail__card-title" lang="ko">${esc(p.title)}</h4>
          ${p.description ? `<p class="mail__card-desc" lang="ko">${esc(p.description)}</p>` : ''}
          <a class="mail__cta" href="${esc(p.url)}" data-mail-post>Read Post</a>
        </div>
        <p class="mail__fine">This notice is made from the post list on ${esc(o.blog)}. Nothing was sent to your real inbox.</p>
      </div>`;
  } else if (m.kind === 'sent') {
    body = `
      ${head(m, { from: 'You', to: o.email ? `${o.name} <${o.email}>` : o.name, date: esc(longDate(m.date, true)) })}
      <div class="mail__body">
        <div class="mail__text">${esc(m.body) || '<span class="mail__muted">No message text</span>'}</div>
        <div class="mail__aside">
          <p>Handed to your mail app${m.date ? ` on ${esc(longDate(m.date))}` : ''}. This copy is kept only in this browser. If your mail app didn’t open, send it from any mail service.</p>
          <div class="mail__actions">
            <button class="mail__cta mail__cta--plain" type="button" data-mail-resend${o.email ? '' : ' disabled'}>Open in Mail App Again</button>
            ${o.email ? '<button class="mail__cta mail__cta--plain" type="button" data-mail-copy>Copy Address</button>' : ''}
          </div>
        </div>
      </div>`;
  } else if (m.kind === 'draft') {
    body = `
      ${head(m, { from: 'You', to: o.name, date: '<span class="mail__draft">Draft</span>' })}
      <div class="mail__body">
        <div class="mail__text">${esc(m.body.trim()) ? esc(m.body) : '<span class="mail__muted">No message text</span>'}</div>
        <div class="mail__actions">
          <button class="mail__cta" type="button" data-mail-edit>${ICON.compose}Continue Editing</button>
        </div>
      </div>`;
  }
  view.innerHTML = `<article class="mail__msg" aria-labelledby="mail-subject">${body}</article>`;
  view.scrollTop = 0;
}

function syncTools(m) {
  const toggle = $('[data-mail-toggle-read]', win);
  const trash = $('[data-mail-trash]', win);
  const reply = $('[data-mail-reply]', win);
  const readable = !!m && canRead(m);
  toggle.disabled = !readable;
  const unread = readable && isUnread(m);
  const label = unread ? 'Mark as Read' : 'Mark as Unread';
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
  toggle.innerHTML = unread ? ICON.read : ICON.unread;
  trash.disabled = !m || (m.kind !== 'sent' && m.kind !== 'draft');
  trash.title = trash.disabled ? 'Only your own sent messages and drafts can be deleted' : m.kind === 'draft' ? 'Discard Draft' : 'Delete';
  trash.setAttribute('aria-label', m?.kind === 'draft' ? 'Discard Draft' : 'Delete');
  reply.disabled = !readable;
}

function renderSide() {
  const hidden = store.get(KEY.side, true) === false;
  win.classList.toggle('is-side-hidden', hidden);
  for (const b of $$('[data-mail-side]', win)) {
    const label = b.classList.contains('mail__side-toggle--alt') ? 'Show Sidebar' : 'Hide Sidebar';
    b.setAttribute('aria-label', label);
    b.title = label;
  }
}

function refresh() {
  if (!win?.isConnected) return;
  renderBoxes();
  renderList();
  renderReader();
}

// ── 고르기 ──────────────────────────────────────────────────────
function select(id, { focus = false } = {}) {
  current = id;
  const m = findMessage(id);
  if (m) setRead(m, true);
  renderBoxes();
  renderList();
  renderReader();
  win.dataset.pane = 'reader';
  if (focus) $(`[data-msg="${CSS.escape(id)}"]`, win)?.focus({ preventScroll: true });
}

function chooseBox(id) {
  if (box !== id) {
    box = id;
    query = '';
    const search = $('[data-mail-search]', win);
    if (search) search.value = '';
    // 맥처럼 편지함을 고르면 첫 편지를 보여 준다(폰은 목록부터)
    const first = visibleMessages()[0];
    current = NARROW.matches ? null : first?.id || null;
    if (current) setRead(first, true);
  }
  win.classList.remove('is-side-peek');
  win.dataset.pane = 'list';
  refresh();
}

function toggleSide() {
  // 창이 좁으면 사이드바를 목록 위에 띄우고, 넓으면 접었다 편다(접은 상태는 기억한다).
  if (win.offsetWidth < 800) {
    win.classList.toggle('is-side-peek');
    return;
  }
  const hidden = !win.classList.contains('is-side-hidden');
  store.set(KEY.side, !hidden);
  renderSide();
}

function openPost(href) {
  const ev = new CustomEvent('ephemeris:open', { detail: { href }, cancelable: true });
  if (dispatchEvent(ev)) location.href = href;
}

function copyAddress() {
  const { email } = owner();
  if (!email) return;
  const done = () => notify(`Copied ${email}`, { title: 'Mail', icon: APP_ICON });
  const fail = () => notify(`Couldn’t copy. The address is ${email}`, { title: 'Mail', icon: APP_ICON });
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(email).then(done, fail);
  else fail();
}

function absolute(url) {
  try {
    return decodeURI(new URL(url, location.href).href);
  } catch {
    return url;
  }
}

function reply(m, from) {
  if (!m || !canRead(m)) return;
  if (m.kind === 'post') {
    openCompose({ subject: `Re: ${m.subject}`, body: `\n\n—\nAbout “${m.subject}”\n${absolute(m.post.url)}`, from, caret: 0 });
  } else {
    openCompose({ from });
  }
}

function removeCurrent() {
  const m = current && findMessage(current);
  if (!m || (m.kind !== 'sent' && m.kind !== 'draft')) return;
  const list = visibleMessages();
  const i = list.findIndex((x) => x.id === m.id);
  if (m.kind === 'draft') {
    store.del(KEY.draft);
    if (sheet?.isConnected) closeSheet({ keep: false });
  } else {
    store.set(KEY.sent, loadSent().filter((x) => x.id !== m.id));
  }
  const next = list[i + 1] || list[i - 1];
  current = next && next.id !== m.id ? next.id : null;
  refresh();
  if (NARROW.matches) win.dataset.pane = 'list';
  ($(`[data-msg="${CSS.escape(current || '')}"]`, win) || $('[data-mail-list]', win))?.focus({ preventScroll: true });
}

function sendMailto(href) {
  // 다른 모듈(이나 시험)이 가로챌 수 있게 먼저 알린다. 막지 않으면 메일 앱을 연다.
  const ev = new CustomEvent('ephemeris:mailto', { detail: { href }, cancelable: true });
  if (dispatchEvent(ev)) location.href = href;
}

// 줄바꿈은 RFC 6068 대로 CRLF 로 싸서 보낸다.
const enc = (s) => encodeURIComponent(String(s).replace(/\r\n|\r|\n/g, '\r\n'));

function mailtoURL(subject, body) {
  const { email } = owner();
  const params = [];
  if (subject) params.push(`subject=${enc(subject)}`);
  if (body.trim()) params.push(`body=${enc(body)}`);
  return `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}${params.length ? `?${params.join('&')}` : ''}`;
}

function wire() {
  // 닫기 단추를 누르면 closer 가 win 을 비운 뒤에 이 손잡이까지 올라온다. 그 창의 일이 아니면 넘긴다.
  const self = win;
  win.addEventListener('click', (e) => {
    if (win !== self) return;
    const t = e.target;
    const b = t.closest('[data-box]');
    if (b) return chooseBox(b.dataset.box);
    const r = t.closest('[data-msg]');
    if (r) return select(r.dataset.msg);
    if (t.closest('[data-mail-compose]')) return openCompose({ from: t.closest('button') });
    if (t.closest('[data-mail-side]')) return toggleSide();
    const to = t.closest('[data-mail-to]');
    if (to) {
      win.dataset.pane = to.dataset.mailTo;
      if (to.dataset.mailTo === 'list') $(`[data-msg="${CSS.escape(current || '')}"]`, win)?.focus({ preventScroll: true });
      return;
    }
    if (t.closest('[data-mail-filter]')) {
      unreadOnly = !unreadOnly;
      $('[data-mail-filter]', win).setAttribute('aria-pressed', String(unreadOnly));
      return renderList();
    }
    const m = current && findMessage(current);
    if (t.closest('[data-mail-toggle-read]')) {
      if (!m) return;
      setRead(m, isUnread(m));
      renderBoxes();
      renderList();
      return syncTools(m);
    }
    if (t.closest('[data-mail-trash]')) return removeCurrent();
    if (t.closest('[data-mail-reply]')) return reply(m, t.closest('button'));
    if (t.closest('[data-mail-write]')) return openCompose({ from: t.closest('button') });
    if (t.closest('[data-mail-edit]')) return openCompose({ from: t.closest('button') });
    if (t.closest('[data-mail-copy]')) return copyAddress();
    if (t.closest('[data-mail-resend]') && m?.kind === 'sent' && owner().email) {
      return sendMailto(mailtoURL(m.rawSubject, m.body));
    }
    const post = t.closest('[data-mail-post]');
    if (post) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      openPost(post.getAttribute('href'));
      return;
    }
    // 좁은 창에서 띄운 사이드바는 바깥을 누르면 접힌다
    if (win.classList.contains('is-side-peek') && !t.closest('.mail__side')) win.classList.remove('is-side-peek');
  });

  // 초안 편지는 두 번 누르면 새 메시지 창으로
  win.addEventListener('dblclick', (e) => {
    if (win !== self) return;
    if (e.target.closest(`[data-msg="${DRAFT}"]`)) openCompose({ from: e.target.closest('button') });
  });

  win.addEventListener('input', (e) => {
    if (win !== self || !e.target.matches('[data-mail-search]')) return;
    query = e.target.value.trim().normalize('NFC').toLowerCase();
    renderList();
  });

  // 목록에서 ↑↓ 로 옮겨 다닌다. ⌥N 은 새 메시지(⌘N 은 브라우저가 가져간다).
  win.addEventListener('keydown', (e) => {
    if (win !== self) return;
    if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyN') {
      e.preventDefault();
      openCompose({ from: $('[data-mail-compose]', win) });
      return;
    }
    if (!e.target.closest('[data-mail-list]')) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = $$('[data-msg]', win);
    const i = rows.indexOf(document.activeElement);
    const next = rows[i < 0 ? 0 : i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    select(next.dataset.msg, { focus: true });
    if (NARROW.matches) win.dataset.pane = 'list';
    $(`[data-msg="${CSS.escape(next.dataset.msg)}"]`, win)?.scrollIntoView({ block: 'nearest' });
  });
}

function syncRunning() {
  dockButton?.classList.toggle('is-running', !!(win?.isConnected || sheet?.isConnected));
}

// ── 새 메시지 창 ────────────────────────────────────────────────
function buildSheet() {
  const o = owner();
  const el = document.createElement('section');
  el.className = 'window compose';
  el.dataset.window = 'compose';
  el.dataset.dynamic = '';
  el.tabIndex = -1;
  el.setAttribute('aria-labelledby', 'compose-title');
  el.innerHTML = `
    <header class="compose__bar" data-window-drag>
      ${traffic()}
      <button class="compose__cancel" type="button" data-window-action="close">Cancel</button>
      <div class="mail__caps compose__send-caps">
        <button class="mail__tool compose__send" type="button" data-compose-send aria-label="Send" title="Send (⌥↩)" disabled>${ICON.send}</button>
      </div>
      <h2 class="compose__title" id="compose-title" data-compose-title>New Message</h2>
      <div class="mail__caps">
        <button class="mail__tool" type="button" data-compose-discard aria-label="Discard Draft" title="Discard Draft">${ICON.trash}</button>
      </div>
    </header>
    <div class="compose__fields">
      <div class="compose__row" role="group" aria-labelledby="compose-to">
        <span class="compose__label" id="compose-to">To:</span>
        <span class="compose__token"${o.email ? ` title="${esc(o.email)}"` : ''}>
          <span class="compose__token-name">${esc(o.name)}</span>${o.email ? ` <span class="compose__token-addr">&lt;${esc(o.email)}&gt;</span>` : ''}
        </span>
      </div>
      <label class="compose__row">
        <span class="compose__label">Subject:</span>
        <input class="compose__subject" type="text" autocomplete="off" data-compose-subject>
      </label>
    </div>
    <textarea class="compose__body" aria-label="Message" placeholder="Write your message…" data-compose-body></textarea>
    <footer class="compose__foot" data-compose-foot>${
      o.email
        ? 'Opens in your mail app, ready to send<span class="compose__keys"> · ⌥↩ Send</span>'
        : 'The owner’s address isn’t set up yet, so sending is off.'
    }</footer>`;
  return el;
}

function sheetFields() {
  return { subject: $('[data-compose-subject]', sheet), body: $('[data-compose-body]', sheet) };
}

function syncSheet() {
  const { subject, body } = sheetFields();
  const ok = !!owner().email && !!(subject.value.trim() || body.value.trim());
  $('[data-compose-send]', sheet).disabled = !ok;
  $('[data-compose-title]', sheet).textContent = subject.value.trim() || 'New Message';
}

function saveDraft() {
  if (!sheet?.isConnected) return;
  const { subject, body } = sheetFields();
  if (subject.value.trim() || body.value.trim()) store.set(KEY.draft, { subject: subject.value, body: body.value, updated: Date.now() });
  else store.del(KEY.draft);
  if (win?.isConnected) {
    renderBoxes();
    if (box === 'drafts') {
      if (!current && draftMessages().length && !NARROW.matches) current = DRAFT;
      renderList();
      renderReader();
    }
  }
}

function closeSheet({ keep = true } = {}) {
  if (!sheet) return;
  clearTimeout(saveTimer);
  if (keep && dirty) saveDraft();
  const s = sheet;
  sheet = null;
  closeWindow(s, { remove: true });
  syncRunning();
  if (win?.isConnected) refresh();
}

function send() {
  if (!sheet?.isConnected) return;
  const o = owner();
  const { subject, body } = sheetFields();
  const subj = subject.value.trim();
  const text = body.value.replace(/\s+$/, '');
  if (!o.email || (!subj && !text.trim())) return;
  const href = mailtoURL(subj, text);
  const id = `s${Date.now().toString(36)}`;
  store.set(KEY.sent, [{ id, subject: subj, body: text, at: Date.now() }, ...loadSent()].slice(0, 50));
  store.del(KEY.draft);
  notify(`Opening your mail app… Press Send there to deliver it to ${o.name}.`, { title: 'Mail', icon: APP_ICON });
  closeSheet({ keep: false });
  if (win?.isConnected && box === 'sent') {
    current = id;
    refresh();
  }
  sendMailto(href);
}

/**
 * 새 메시지 창을 연다. 이미 쓰던 초안이 있으면 그것을 이어 쓴다(채워 넣을 값은 무시).
 * subject · body: 비어 있는 새 편지에 미리 채울 값, caret: 본문의 커서 자리, from: 날아 나올 단추.
 */
export function openCompose({ subject = '', body = '', caret = null, from = null } = {}) {
  const draft = loadDraft();
  if (sheet?.isConnected) {
    openWindow(sheet);
    focusWindow(sheet);
    const f = sheetFields();
    // 아직 손대지 않은 편지라면 새 값으로 바꿔 채운다
    if (!dirty && !draft && (subject || body)) fill(f, subject, body, caret);
    else (f.subject.value ? f.body : f.subject).focus();
    return sheet;
  }

  sheet = buildSheet();
  $('#workspace').append(sheet);
  setupWindow(sheet);
  setCloser(sheet, () => closeSheet());
  syncRunning();
  focusWindow(sheet);
  const fromEl = from || dockButton;
  if (fromEl?.isConnected) flyTo(sheet, fromEl.getBoundingClientRect(), true);

  const f = sheetFields();
  if (draft) fill(f, draft.subject, draft.body, null);
  else fill(f, subject, body, caret);

  sheet.addEventListener('input', () => {
    dirty = true;
    syncSheet();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 250);
  });
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-compose-send]')) return send();
    if (e.target.closest('[data-compose-discard]')) {
      store.del(KEY.draft);
      closeSheet({ keep: false });
    }
  });
  // ⌥↩ 나 ⌃↩ · ⌘↩ 로 보낸다. 제목 칸의 ↩ 는 본문으로 넘어간다.
  sheet.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    if (e.altKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      send();
    } else if (e.target.matches('[data-compose-subject]')) {
      e.preventDefault();
      f.body.focus();
    }
  });
  return sheet;
}

function fill(f, subject, body, caret) {
  dirty = false;
  f.subject.value = subject;
  f.body.value = body;
  syncSheet();
  if (!subject) {
    f.subject.focus();
    return;
  }
  f.body.focus();
  const at = caret ?? f.body.value.length;
  f.body.setSelectionRange(at, at);
  f.body.scrollTop = 0;
}

// ── 열기 ────────────────────────────────────────────────────────
/**
 * Mail 을 연다. compose: true 면 새 메시지 창도 띄운다('연락하기' 링크 따위).
 * subject · body 는 그 새 메시지에 미리 채울 값이다.
 */
export async function openMail(button, { compose = false, subject = '', body = '' } = {}) {
  dockButton = button || dockButton;
  if (win?.isConnected) {
    await openWindow(win);
    focusWindow(win);
  } else {
    const stored = store.get(KEY.read, {});
    readMap = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    box = 'inbox';
    query = '';
    unreadOnly = false;
    current = NARROW.matches ? null : WELCOME;
    win = build();
    $('#workspace').append(win);
    setupWindow(win);
    setCloser(win, (w) => {
      closeWindow(w, { remove: true });
      win = null;
      syncRunning();
    });
    syncRunning();
    focusWindow(win);
    if (dockButton) flyTo(win, dockButton.getBoundingClientRect(), true);
    renderSide();
    if (current) setRead(welcome(), true);
    refresh();
    win.dataset.pane = 'list';
    wire();
    if (!compose) ($('.mail__row.is-current', win) || $('[data-mail-list]', win))?.focus({ preventScroll: true });

    if (postsState !== 'ready') {
      postsState = 'loading';
      loadPosts()
        .then((list) => {
          posts = (Array.isArray(list) ? list : []).filter((p) => p && p.url && p.title);
          // 날짜가 새로운 글부터(search.json 의 순서를 믿지 않는다)
          posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
          postsState = 'ready';
        })
        .catch(() => {
          postsState = 'error';
        })
        .finally(() => refresh());
    }
  }
  if (compose) openCompose({ subject, body, from: dockButton });
  return win;
}
