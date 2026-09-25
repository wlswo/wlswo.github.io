/*
 * 문서 창: 목차 사이드바 · 읽는 자리 · 코드 블록 · 절 링크 · 공유 · 그림 크게 보기
 *
 * 글 페이지에 처음부터 있는 창에도, 첫 화면에서 Finder 위로 새로 연 창에도
 * 똑같이 쓰인다(initDoc). 본문은 창 안(.doc__scroll)에서 스크롤되므로 목차와
 * 읽는 자리 표시도 그 상자를 기준으로 잰다. 닫기·끌기·확대는 windows.js 몫이다.
 */
import { createLens } from './glass.js';
import { notify } from './windows.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const store = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch {}
  },
};

// 알림(복사했다 따위). 단추 이름만 바꾸면 화면 낭독기가 잘 읽지 않는다.
const live = document.createElement('p');
live.className = 'sr-only';
live.setAttribute('role', 'status');
document.body.append(live);
function say(text) {
  live.textContent = text;
  setTimeout(() => {
    if (live.textContent === text) live.textContent = '';
  }, 1600);
}

function slug(text) {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

// 이 창이 보여 주는 글의 주소(새로 연 창이면 그 창의 주소).
const pathOf = (win) => win.dataset.path || location.pathname;
const urlOf = (win, hash = '') => new URL(pathOf(win) + hash, location.origin).href;

async function copy(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    notify(done);
    say(done);
    return true;
  } catch {
    notify('복사하지 못했습니다');
    return false;
  }
}

// ── 목차 ────────────────────────────────────────────────────────
// 글마다 제목 단계가 다르다(### 만 쓰는 글, # ~ ### 를 다 쓰는 글).
// 실제로 쓰인 단계 중 위의 두 단계만 올리고, 그래도 너무 길면 한 단계만.
function pickHeadings(content) {
  const all = $$('h1, h2, h3', content);
  const levels = [...new Set(all.map((h) => Number(h.tagName[1])))].sort();
  let use = levels.slice(0, 2);
  if (all.filter((h) => use.includes(Number(h.tagName[1]))).length > 20) use = levels.slice(0, 1);
  return { heads: all.filter((h) => use.includes(Number(h.tagName[1]))), top: use[0] };
}

function initToc(win, scroller, content) {
  const tocPanel = $('.doc__toc', win);
  const toggle = $('[data-toc-toggle]', win);
  if (!tocPanel || !toggle) return;
  const toc = $('.toc', tocPanel);
  const { heads, top } = pickHeadings(content);
  if (heads.length < 2) return;

  const used = new Set($$('[id]').map((el) => el.id));
  const items = heads.map((h) => {
    if (!h.id) {
      const base = slug(h.textContent) || 'section';
      let id = base;
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
      h.id = id;
      used.add(id);
    }
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = `toc__link${Number(h.tagName[1]) > top ? ' toc__link--sub' : ''}`;
    a.href = `#${h.id}`;
    a.textContent = h.textContent.trim();
    // 해시를 히스토리에 쌓으면 뒤로 가기가 직전 절로 가 버린다. 기본 이동 대신
    // 직접 스크롤하고 주소만 바꿔 둔다. 초점도 그 절로 옮겨, 다음 Tab 이 거기서 이어진다.
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (win.classList.contains('doc--narrow')) setToc(false);
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (location.pathname === pathOf(win)) history.replaceState(history.state, '', `#${h.id}`);
      if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    });
    li.append(a);
    toc.append(li);
    return { h, a };
  });

  const lens = createLens(toc);
  let active = null; // 지금 읽고 있는 절
  toggle.hidden = false;

  // 창이 좁으면 목차는 본문 위에 떠 있는 판이 되고, 처음엔 닫혀 있다.
  // 넓으면 본문 옆에 붙고, 여닫은 상태를 기억한다.
  const narrow = () => win.classList.contains('doc--narrow');
  function setToc(open, { remember = true } = {}) {
    tocPanel.hidden = !open;
    toggle.setAttribute('aria-pressed', String(open));
    win.classList.toggle('doc--toc', open);
    if (remember && !narrow()) store.set('ephemeris:toc', open ? '1' : '0');
    if (open) {
      requestAnimationFrame(() => active && lens.moveTo(active.a, { instant: true }));
    }
  }

  let ready = false;
  new ResizeObserver(([entry]) => {
    const wasNarrow = narrow();
    const isNarrow = entry.contentRect.width < 940;
    if (wasNarrow === isNarrow && ready) return;
    ready = true;
    win.classList.toggle('doc--narrow', isNarrow);
    setToc(isNarrow ? false : store.get('ephemeris:toc') !== '0', { remember: false });
  }).observe(win);

  toggle.addEventListener('click', () => setToc(tocPanel.hidden));
  win.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && narrow() && !tocPanel.hidden) {
      e.stopPropagation();
      setToc(false);
      toggle.focus();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (narrow() && !tocPanel.hidden && !tocPanel.contains(e.target) && !toggle.contains(e.target)) setToc(false);
  });

  // 읽는 자리: 보이는 부분의 위쪽 1/5 선을 지난 마지막 제목. 아주 낮은 화면에서는
  // 창 대신 문서 전체가 스크롤되므로(확대 400% 따위) 상자와 화면이 겹치는 부분으로 잰다.
  function spy() {
    const box = scroller.getBoundingClientRect();
    const topEdge = Math.max(box.top, 0);
    const line = topEdge * 0.8 + Math.min(box.bottom, innerHeight) * 0.2;
    let current = items[0];
    for (const it of items) {
      if (it.h.getBoundingClientRect().top <= line) current = it;
      else break;
    }
    if (current === active) return;
    active?.a.removeAttribute('aria-current');
    current.a.setAttribute('aria-current', 'location');
    if (!tocPanel.hidden) lens.moveTo(current.a, { instant: !active });
    active = current;
    if (!tocPanel.hidden) {
      const b = tocPanel.getBoundingClientRect();
      const r = current.a.getBoundingClientRect();
      if (r.top < b.top + 40 || r.bottom > b.bottom - 12) {
        tocPanel.scrollBy({ top: r.top - b.top - b.height / 2, behavior: 'smooth' });
      }
    }
  }
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      spy();
    });
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });
  spy();
}

// ── 절 링크 ─────────────────────────────────────────────────────
// 제목에 마우스를 올리면 옆에 # 이 떠오르고, 누르면 그 절의 주소를 복사한다.
function initAnchors(win, content) {
  let n = 0;
  for (const h of $$('h1, h2, h3', content)) {
    if (!h.id) h.id = slug(h.textContent) || `section-${++n}`;
    const a = document.createElement('a');
    a.className = 'anchor';
    a.href = `#${h.id}`;
    a.textContent = '#';
    a.setAttribute('aria-label', `‘${h.textContent.trim()}’ 절의 링크 복사`);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      copy(urlOf(win, `#${h.id}`), '이 절의 링크를 복사했습니다');
    });
    h.append(a);
  }
}

// ── 공유 ────────────────────────────────────────────────────────
// 폰에서는 시스템 공유 시트, 그 밖에서는 링크 복사.
function initShare(win) {
  const btn = $('[data-share]', win);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const url = urlOf(win);
    const title = $('.article__title', win)?.textContent.trim() || document.title;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    copy(url, '링크를 복사했습니다');
  });
}

// ── 그림 크게 보기 ──────────────────────────────────────────────
// 본문의 그림을 누르면 맥의 훑어보기(Quick Look)처럼 유리 판 위에 크게 뜬다.
// 다시 누르거나 Esc 로 닫는다. 초점은 연 그림으로 돌아온다.
function initZoom(content) {
  for (const img of $$('img', content)) {
    if (img.closest('a')) continue;
    img.classList.add('is-zoomable');
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', `${img.alt || '그림'} 크게 보기`);
    const open = () => {
      const view = document.createElement('div');
      view.className = 'lightbox';
      view.setAttribute('role', 'dialog');
      view.setAttribute('aria-modal', 'true');
      view.setAttribute('aria-label', img.alt || '그림');
      view.tabIndex = -1;
      const big = img.cloneNode();
      for (const a of ['tabindex', 'role', 'aria-label']) big.removeAttribute(a);
      big.className = 'lightbox__img';
      const panel = document.createElement('div');
      panel.className = 'lightbox__panel glass';
      panel.append(big);
      view.append(panel);
      document.body.append(view);
      view.focus();
      const shut = () => {
        view.classList.add('is-leaving');
        setTimeout(() => view.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200);
        img.focus({ preventScroll: true });
      };
      view.addEventListener('click', shut);
      view.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          shut();
        } else if (e.key === 'Tab') {
          e.preventDefault(); // 판 밖으로 나가지 않게
        }
      });
    };
    img.addEventListener('click', open);
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  }
}

// ── 코드 블록 ───────────────────────────────────────────────────
// 언어 이름을 머리에 달고, 복사 단추를 붙인다.
const LANGS = {
  java: 'Java', sql: 'SQL', json: 'JSON', yaml: 'YAML', yml: 'YAML', dockerfile: 'Dockerfile',
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', kotlin: 'Kotlin', swift: 'Swift',
  bash: 'Shell', sh: 'Shell', shell: 'Shell', python: 'Python', go: 'Go', text: 'Text', plaintext: 'Text',
};
const COPY_ICON = '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-copy"/></svg>';
const DONE_ICON = '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-check"/></svg>';

function initCode(content) {
  for (const block of $$('div.highlighter-rouge', content)) {
    const lang = [...block.classList].find((c) => c.startsWith('language-'))?.slice(9);
    const code = $('pre code', block) ?? $('pre', block);
    if (!code || $('.code-bar', block)) continue;

    const bar = document.createElement('div');
    bar.className = 'code-bar';
    const label = document.createElement('span');
    label.className = 'code-bar__lang';
    label.textContent = LANGS[lang] ?? (lang && lang !== 'plaintext' ? lang : '');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-bar__copy';
    btn.setAttribute('aria-label', '코드 복사');
    btn.innerHTML = COPY_ICON;
    let timer = 0;
    btn.addEventListener('click', async () => {
      if (!(await copy(code.innerText.replace(/\n$/, ''), '코드를 복사했습니다'))) return;
      btn.innerHTML = DONE_ICON;
      btn.setAttribute('aria-label', '복사됨');
      clearTimeout(timer);
      timer = setTimeout(() => {
        btn.innerHTML = COPY_ICON;
        btn.setAttribute('aria-label', '코드 복사');
      }, 1600);
    });
    bar.append(label, btn);
    block.prepend(bar);
  }
}

/** 문서 창 하나를 살린다. */
export function initDoc(win) {
  if (!win || win.dataset.docReady != null) return;
  win.dataset.docReady = '';
  const scroller = $('[data-scroll="doc"]', win);
  const content = scroller && $('.post-content', scroller);
  initShare(win);
  if (!content) return;
  initToc(win, scroller, content);
  initAnchors(win, content);
  initZoom(content);
  initCode(content);
}

// 글 페이지에 처음부터 있는 창
initDoc($('#main-window[data-window="doc"]'));
