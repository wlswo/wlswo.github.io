/*
 * Apache Druid 동작 원리 — 아스키 다이어그램으로 보기
 *
 * 왼쪽 목차에서 장(chapter)을 고르면 가운데 그림판(React Flow)에 그 장의 그림이
 * 올라오고, 오른쪽 설명 칸에 단계별 설명이 나온다. ◀ ▶(또는 방향키)로 단계를
 * 오가고 스페이스로 움직임을 멈춘다. 주소는 #장/단계 로 남아 공유할 수 있다.
 *
 * 장 하나는 chapters/*.js 의 모듈 하나다. 모양은 diagram.js 맨 위에:
 *
 *   export default {
 *     title, docs: [[이름, 주소]], legend: ['query', …],
 *     controls: [{ id, label, type: 'seg' | 'range' | 'toggle' | 'button', … }],
 *     nodes, edges,              // 배열이거나 (params) => 배열
 *     steps: [{ title, body, show, on, patch, focus, play, hold }],
 *   }
 */
import { mountDiagram } from './diagram.js';
import { CHAPTERS, GROUPS } from './chapters.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const embedded = new URLSearchParams(location.search).has('embed') || window.top !== window;
document.documentElement.classList.toggle('is-embed', embedded);

// 선 색의 뜻: 경로마다 한 색
const LEGEND = {
  query: ['쿼리', 'q'],
  ingest: ['수집, 데이터', 'i'],
  control: ['제어, 조정', 'm'],
  storage: ['세그먼트 저장', 'g'],
  meta: ['메타데이터', 'p'],
  zk: ['ZooKeeper', 'y'],
};

const ui = {
  app: $('[data-app]'),
  tocList: $('[data-toc-list]'),
  tocToggle: $$('[data-toc-toggle]'),
  scrim: $('[data-toc-scrim]'),
  diagram: $('[data-diagram]'),
  legend: $('[data-legend]'),
  loading: $('[data-loading]'),
  error: $('[data-error]'),
  chNo: $('[data-ch-no]'),
  chTitle: $('[data-ch-title]'),
  stepCount: $('[data-step-count]'),
  stepTitle: $('[data-step-title]'),
  stepBody: $('[data-step-body]'),
  scroll: $('[data-panel-scroll]'),
  controls: $('[data-controls]'),
  docs: $('[data-docs]'),
  dots: $('[data-dots]'),
  prev: $('[data-prev]'),
  next: $('[data-next]'),
  play: $('[data-play]'),
  speed: $('[data-speed]'),
  auto: $('[data-auto]'),
  live: $('[data-live]'),
};

// ── 모양(라이트, 다크): 블로그에서 바꾸면 여기도 따라 바뀐다 ──
addEventListener('storage', (e) => {
  if (e.key === 'ephemeris:appearance') window.druidTheme?.();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => window.druidTheme?.());

// ── 목차 ────────────────────────────────────────────────────────
function renderToc() {
  ui.tocList.innerHTML = GROUPS.map(
    (g) => `<li class="toc__group">
      <p class="toc__heading">${esc(g.title)}</p>
      <ol class="toc__items">
        ${CHAPTERS.filter((c) => c.group === g.id)
          .map(
            (c) => `<li><a class="toc__item${c.ready ? '' : ' is-soon'}" href="#${c.id}" data-chapter="${c.id}"${c.ready ? '' : ' aria-disabled="true"'}>
              <span class="toc__no">${String(CHAPTERS.indexOf(c) + 1).padStart(2, '0')}</span>
              <span class="toc__text"><span class="toc__title">${esc(c.title)}${c.ready ? '' : ' <span class="toc__soon">만드는 중</span>'}</span><span class="toc__sub">${esc(c.sub)}</span></span>
            </a></li>`,
          )
          .join('')}
      </ol>
    </li>`,
  ).join('');
}

function markToc(id) {
  for (const a of $$('[data-chapter]', ui.tocList)) {
    const on = a.dataset.chapter === id;
    if (on) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
    if (on) a.scrollIntoView({ block: 'nearest' });
  }
}

const narrow = matchMedia('(max-width: 900px)');
function setToc(open) {
  ui.app.classList.toggle('is-toc-open', open);
  for (const b of ui.tocToggle) b.setAttribute('aria-expanded', String(open));
  ui.scrim.hidden = !(open && narrow.matches);
  requestAnimationFrame(() => dia.fit(0));
}
for (const b of ui.tocToggle) b.addEventListener('click', () => setToc(!ui.app.classList.contains('is-toc-open')));
ui.scrim.addEventListener('click', () => setToc(false));
// 목차는 넓은 화면에서만 처음부터 편다(블로그 창 안에서는 그림판에 자리를 준다).
const roomy = () => !narrow.matches && innerWidth >= 1500;
narrow.addEventListener('change', () => setToc(roomy()));

// ── 그림판 ──────────────────────────────────────────────────────
const dia = mountDiagram(ui.diagram);
new ResizeObserver(() => {
  if (!dia.userMoved) dia.fit(0);
}).observe(ui.diagram);
document.fonts?.ready.then(() => dia.fit(0));
for (const b of $$('[data-zoom]')) b.addEventListener('click', () => dia.zoom(Number(b.dataset.zoom)));
$('[data-fit]').addEventListener('click', () => dia.fit(400));

const cur = { index: -1, def: null, step: 0, params: {}, auto: false, autoTimer: null, token: 0 };

// ── 장 열기 ─────────────────────────────────────────────────────
const nextReady = (i, dir = 1) => {
  for (let k = i; k >= 0 && k < CHAPTERS.length; k += dir) if (CHAPTERS[k].ready) return k;
  return -1;
};

async function openChapter(index, step = 0) {
  index = Math.max(0, Math.min(CHAPTERS.length - 1, index));
  // 아직 만드는 중인 장은 건너뛴다(주소로 곧장 들어와도).
  if (!CHAPTERS[index].ready) {
    const k = nextReady(index, 1) >= 0 ? nextReady(index, 1) : nextReady(index, -1);
    if (k < 0) return;
    index = k;
    step = 0;
  }
  const meta = CHAPTERS[index];
  const token = ++cur.token;
  ui.loading.hidden = false;
  markToc(meta.id);
  if (narrow.matches) setToc(false);
  let def;
  try {
    def = (await meta.load()).default;
  } catch (e) {
    console.error(e);
    if (token !== cur.token) return;
    ui.loading.hidden = true;
    // 자동 재생 중이면 멈춰 서지 않고 다음 장으로 넘어간다.
    if (cur.auto && index < CHAPTERS.length - 1) {
      openChapter(index + 1, 0);
      return;
    }
    if (cur.auto) setAuto(false);
    showError('그림을 불러오지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.');
    return;
  }
  if (token !== cur.token) return;
  ui.error.hidden = true;
  clearTimeout(cur.autoTimer);

  try {
    cur.index = index;
    cur.def = def;
    cur.step = -1;
    cur.params = Object.fromEntries((def.controls || []).filter((c) => 'value' in c).map((c) => [c.id, c.value]));
    dia.load(def, cur.params);

    ui.chNo.textContent = String(index + 1).padStart(2, '0');
    ui.chTitle.textContent = meta.title;
    document.title = `${meta.title}, Apache Druid 동작 원리`;
    renderDocs(def);
    renderLegend(def.legend);
    renderControls(def);
    renderDots(def);
    ui.loading.hidden = true;
    goStep(step, { instant: true });
  } catch (e) {
    // 장의 코드에 문제가 있어도 앱이 멈춰 서지 않게
    console.error(e);
    ui.loading.hidden = true;
    showError('이 장을 그리다가 문제가 생겼어요. 다른 장을 골라 주세요.');
  }
}

function showError(text) {
  ui.error.hidden = false;
  ui.error.textContent = text;
  clearTimeout(showError.t);
  showError.t = setTimeout(() => (ui.error.hidden = true), 6000);
}

// ── 단계 ────────────────────────────────────────────────────────
function goStep(i, { instant = false } = {}) {
  const def = cur.def;
  if (!def) return;
  i = Math.max(0, Math.min(def.steps.length - 1, i));
  if (i === cur.step && !instant) return;
  cur.step = i;
  dia.step(i, { instant });
  renderStep();
  writeHash();
  scheduleAuto();
}

function renderStep() {
  const def = cur.def;
  const s = def.steps[cur.step];
  ui.stepTitle.textContent = s.title;
  ui.stepBody.innerHTML = typeof s.body === 'function' ? s.body(cur.params) : s.body;
  ui.stepCount.textContent = `step ${cur.step + 1}/${def.steps.length}`;
  ui.scroll.scrollTo(0, 0);
  $$('button', ui.dots).forEach((b, j) => {
    b.setAttribute('aria-current', j === cur.step ? 'step' : 'false');
    b.classList.toggle('is-done', j < cur.step);
  });
  ui.prev.disabled = cur.step === 0 && nextReady(cur.index - 1, -1) < 0;
  const last = cur.step === def.steps.length - 1;
  const nextChapter = CHAPTERS[nextReady(cur.index + 1, 1)];
  ui.next.disabled = last && !nextChapter;
  ui.next.setAttribute('aria-label', last && nextChapter ? `다음 장: ${nextChapter.title}` : '다음 단계');
  ui.next.classList.toggle('is-chapter', last && !!nextChapter);
  ui.next.querySelector('span').textContent = last && nextChapter ? '다음 장' : '다음';
  ui.live.textContent = `${cur.step + 1}단계: ${s.title}`;
}

function renderDots(def) {
  ui.dots.innerHTML = def.steps.map((s, j) => `<button type="button" class="dot" aria-label="${j + 1}단계: ${esc(s.title)}"></button>`).join('');
  $$('button', ui.dots).forEach((b, j) => b.addEventListener('click', () => goStep(j)));
}

function renderDocs(def) {
  ui.docs.innerHTML = (def.docs || []).map(([name, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)} ↗</a>`).join('');
  ui.docs.parentElement.hidden = !(def.docs || []).length;
}

function renderLegend(keys = []) {
  ui.legend.hidden = !keys.length;
  ui.legend.innerHTML = keys
    .map((k) => {
      const [name, tone] = Array.isArray(k) ? k : LEGEND[k] || [k, 'n'];
      return `<li class="tone-${esc(tone)}"><span class="legend__sw" aria-hidden="true">╌╌▸</span>${esc(name)}</li>`;
    })
    .join('');
}

function renderControls(def) {
  const list = def.controls || [];
  const params = cur.params;
  ui.controls.hidden = !list.length;
  ui.controls.innerHTML = list
    .map((c) => {
      if (c.type === 'seg') {
        return `<div class="ctl" role="group" aria-label="${esc(c.label)}">
          <p class="ctl__label">${c.label}</p>
          <div class="ctl__seg">${c.options
            .map((o) => {
              const [v, name] = Array.isArray(o) ? o : [o, o];
              return `<button type="button" data-ctl="${c.id}" data-value="${esc(v)}" aria-pressed="${String(params[c.id] === v)}">${esc(name)}</button>`;
            })
            .join('')}</div>
        </div>`;
      }
      if (c.type === 'range') {
        return `<label class="ctl ctl--range">
          <span class="ctl__label">${c.label} <output data-out="${c.id}">${esc(c.format ? c.format(params[c.id]) : params[c.id])}</output></span>
          <input type="range" min="${c.min}" max="${c.max}" step="${c.step ?? 1}" value="${params[c.id]}" data-ctl="${c.id}">
        </label>`;
      }
      if (c.type === 'toggle') {
        return `<button type="button" class="ctl ctl--toggle" data-ctl="${c.id}" aria-pressed="${String(!!params[c.id])}"><span class="ctl__box" aria-hidden="true"></span>${c.label}</button>`;
      }
      if (c.type === 'button') {
        return `<button type="button" class="ctl ctl--button" data-action="${c.id}">${c.label}</button>`;
      }
      return '';
    })
    .join('');
}

ui.controls.addEventListener('click', (e) => {
  const act = e.target.closest('[data-action]');
  if (act) {
    cur.def.onAction?.(act.dataset.action, cur.params);
    dia.setParams(cur.params);
    return;
  }
  const b = e.target.closest('button[data-ctl]');
  if (!b) return;
  const c = cur.def.controls.find((x) => x.id === b.dataset.ctl);
  if (c.type === 'toggle') setParam(c, !cur.params[c.id]);
  else setParam(c, c.options.map((o) => (Array.isArray(o) ? o[0] : o)).find((o) => String(o) === b.dataset.value));
});

ui.controls.addEventListener('input', (e) => {
  const r = e.target.closest('input[type="range"][data-ctl]');
  if (!r) return;
  setParam(cur.def.controls.find((x) => x.id === r.dataset.ctl), Number(r.value));
});

function setParam(c, v) {
  if (cur.params[c.id] === v) return;
  cur.params = { ...cur.params, [c.id]: v };
  for (const b of $$(`button[data-ctl="${c.id}"]`, ui.controls)) {
    if (c.type === 'toggle') b.setAttribute('aria-pressed', String(!!v));
    else b.setAttribute('aria-pressed', String(b.dataset.value === String(v)));
  }
  const out = $(`[data-out="${c.id}"]`, ui.controls);
  if (out) out.textContent = c.format ? c.format(v) : v;
  dia.setParams(cur.params);
  // 설명이 조작에 따라 달라지는 단계도 있다
  const s = cur.def.steps[cur.step];
  if (typeof s.body === 'function') ui.stepBody.innerHTML = s.body(cur.params);
}

// ── 자동 재생, 멈춤, 빠르기 ───────────────────────────────────
function scheduleAuto() {
  clearTimeout(cur.autoTimer);
  if (!cur.auto || !cur.def) return;
  const s = cur.def.steps[cur.step];
  const hold = s.hold ?? cur.def.hold ?? 8;
  const started = dia.time();
  const tick = () => {
    if (!cur.auto) return;
    if (dia.time() - started >= hold) next();
    else cur.autoTimer = setTimeout(tick, 250);
  };
  cur.autoTimer = setTimeout(tick, 250);
}

function next() {
  const def = cur.def;
  if (!def) return;
  const after = nextReady(cur.index + 1, 1);
  if (cur.step < def.steps.length - 1) goStep(cur.step + 1);
  else if (after >= 0) openChapter(after, 0);
  else setAuto(false);
}

function prev() {
  if (cur.step > 0) goStep(cur.step - 1);
  else {
    const i = nextReady(cur.index - 1, -1);
    if (i >= 0) CHAPTERS[i].load().then((m) => openChapter(i, m.default.steps.length - 1));
  }
}

function setAuto(on) {
  cur.auto = on;
  ui.auto.setAttribute('aria-pressed', String(on));
  if (on && dia.clock.paused) setPaused(false);
  scheduleAuto();
}

function setPaused(on) {
  dia.pause(on);
  ui.play.setAttribute('aria-pressed', String(on));
  ui.play.setAttribute('aria-label', on ? '움직임 재생' : '움직임 멈춤');
  ui.app.classList.toggle('is-paused', on);
}

const SPEEDS = [0.5, 1, 2];
function cycleSpeed() {
  const i = (SPEEDS.indexOf(dia.clock.speed) + 1) % SPEEDS.length;
  dia.speed(SPEEDS[i]);
  ui.speed.textContent = `${SPEEDS[i]}×`;
  ui.speed.setAttribute('aria-label', `빠르기 ${SPEEDS[i]}배`);
}

ui.prev.addEventListener('click', prev);
ui.next.addEventListener('click', next);
ui.play.addEventListener('click', () => setPaused(!dia.clock.paused));
ui.speed.addEventListener('click', cycleSpeed);
ui.auto.addEventListener('click', () => setAuto(!cur.auto));

// 블로그의 창 안(iframe)에 떠 있을 때: 창과 앱의 ⌥ 단축키(⌥W, ⌥M, ⌥⇥ 따위)는
// 이 문서가 먼저 받으므로 바깥 문서(macos.js)로 넘긴다.
const host = (() => {
  try {
    return window.parent !== window && window.parent.document ? window.parent.document : null;
  } catch {
    return null;
  }
})();
if (host) {
  const WINDOW_KEYS = ['KeyW', 'KeyM', 'KeyH', 'KeyQ', 'Tab', 'ArrowUp', 'Escape'];
  const pass = (e) => {
    const keep = e.type === 'keyup' ? e.key === 'Alt' : e.altKey && !e.metaKey && !e.ctrlKey && WINDOW_KEYS.includes(e.code);
    if (!keep) return;
    e.preventDefault();
    const { key, code, altKey, shiftKey } = e;
    host.dispatchEvent(new KeyboardEvent(e.type, { key, code, altKey, shiftKey, bubbles: true, cancelable: true }));
  };
  document.addEventListener('keydown', pass, true);
  document.addEventListener('keyup', pass, true);
}

document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    next();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    prev();
  } else if (e.key === ' ' && !e.target.closest?.('button, a')) {
    e.preventDefault();
    setPaused(!dia.clock.paused);
  } else if (e.key === 'Escape' && narrow.matches && ui.app.classList.contains('is-toc-open')) {
    setToc(false);
  }
});

// ── 주소 ────────────────────────────────────────────────────────
function writeHash() {
  const meta = CHAPTERS[cur.index];
  const h = `#${meta.id}${cur.step ? `/${cur.step + 1}` : ''}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}

function readHash() {
  const [id, s] = decodeURIComponent(location.hash.slice(1)).split('/');
  const index = Math.max(0, CHAPTERS.findIndex((c) => c.id === id));
  return { index, step: Math.max(0, (parseInt(s, 10) || 1) - 1) };
}

ui.tocList.addEventListener('click', (e) => {
  const a = e.target.closest('[data-chapter]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const i = CHAPTERS.findIndex((c) => c.id === a.dataset.chapter);
  if (!CHAPTERS[i].ready) {
    showError(`'${CHAPTERS[i].title}' 장은 지금 만드는 중이에요.`);
    return;
  }
  if (i === cur.index) {
    goStep(0);
    if (narrow.matches) setToc(false);
  } else openChapter(i, 0);
});

addEventListener('hashchange', () => {
  const { index, step } = readHash();
  if (index !== cur.index) openChapter(index, step);
  else if (step !== cur.step) goStep(step);
});

// ── 창 속에서 ───────────────────────────────────────────────────
// 블로그의 창(iframe) 안에 떠 있으면: 누르면 그 창을 앞으로, 창이 숨으면 쉰다.
let resting = false;
if (embedded) {
  document.addEventListener('pointerdown', () => parent.postMessage({ druid: 'focus' }, location.origin), true);
  addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    if (e.data?.druid === 'pause') {
      resting = true;
      dia.run(false);
    }
    if (e.data?.druid === 'resume') {
      resting = false;
      dia.run(true);
    }
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) dia.run(false);
  else if (!resting) dia.run(true);
});

// ── 시작 ────────────────────────────────────────────────────────
renderToc();
setToc(roomy());
const { index, step } = readHash();
openChapter(index, step);
