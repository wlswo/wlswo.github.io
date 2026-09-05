// 진입점.
//
// 여닫기와 입력만 맡는다. 기존 계약은 그대로다 — #machine-open 을 누르면
// .blog-index 에 is-machine 이 붙고, 문서에 machine-open 이 붙고, #machine 에
// is-open 이 붙는다. Esc 로 닫히고, #machine 해시로 열린 채 시작한다.

import * as R from './core/raster.js';
import * as Cam from './core/camera.js';
import * as F from './film.js';
import { buildOverlay } from './overlay.js';
import { SCENES } from './scenes/index.js';

const toggleBtn = document.getElementById('machine-open');
const stage = document.getElementById('machine');
const index = document.querySelector('.blog-index');
const canvas = document.getElementById('machine-canvas');

if (toggleBtn && stage && index && canvas) init();

function init() {
  const params = new URLSearchParams(location.search);
  const showFps = params.has('fps');
  const showCam = params.has('cam');
  const jumpTo = params.has('t') ? parseFloat(params.get('t')) : null;

  // 기본은 앰비언트다. 버튼을 누르면 위에서 내려다본 기계가 나올 뿐,
  // 아무것도 스스로 재생되지 않는다. 12장짜리 영화는 주소로만 든다.
  const filmMode = params.has('film') || jumpTo !== null;
  F.film.mode = filmMode ? 'film' : 'ambient';

  let w = 0, h = 0, dpr = 1;
  let raf = 0, open = false, closeTimer = 0;

  // 모션 감소는 한 번 읽고 끝내지 않는다. 예전 코드는 로드 시점의 값을
  // 붙들고 있어서, 설정을 바꾸면 새로고침해야 했다.
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mqContrast = window.matchMedia('(prefers-contrast: more)');
  F.film.reduced = mq.matches;
  F.film.highContrast = mqContrast.matches;
  if (mqContrast.addEventListener) {
    mqContrast.addEventListener('change', () => { F.film.highContrast = mqContrast.matches; });
  }
  const onMq = () => {
    F.film.reduced = mq.matches;
    ui.setReduced(F.film.reduced);
    if (open) { if (F.film.reduced) stopLoop(); else startLoop(); drawOnce(); }
  };
  if (mq.addEventListener) mq.addEventListener('change', onMq);

  const ui = buildOverlay(stage, SCENES, {
    goScene(i) { F.scrubTo(SCENES[i].start); after(); },
    step(d) { F.seekScene(d); after(); },
    toggle() { F.toggle(); after(); },
    seekFraction(f) { F.scrubTo(f * F.film.duration); after(); },
    nudge(d) { F.scrubBy(d); after(); }
  });
  ui.setReduced(F.film.reduced);

  function after() { if (F.film.reduced) drawOnce(); }

  // ── 크기 ──
  function resize() {
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, F.film.quality === 0 ? 1.5 : 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    R.attach(canvas, w, h, dpr);
    Cam.setViewport(w, h, dpr);
    // 보드 폭에 견준 화면 크기. 좁을수록 글자를 줄인다.
    const u = Cam.viewport().u;
    R.setTextScale(Math.max(0.78, Math.min(1, u / 2.2)));
    measureSafe();
    // 아주 큰 화면에서는 처음부터 한 단 낮춰 시작한다.
    if (w * h * dpr * dpr > 2.2e6 && F.film.quality === 2) F.film.quality = 1;
  }

  // 캔버스는 제 위에 얹힌 DOM 글자를 모른다. 실제로 재서 알려 준다.
  //
  // 위쪽은 장의 제목이, 왼쪽 아래는 장 목록이 물고 있다. 둘을 한꺼번에
  // 피하는 사각형을 준다 — 위는 제목 아래로, 왼쪽은 목록 오른쪽으로.
  // 제목은 장마다 길이가 달라지므로 장이 바뀔 때마다 다시 잰다.
  function measureSafe() {
    const c = canvas.getBoundingClientRect();
    if (!c.width || !c.height) return;
    const pad = 16;
    let l = 12, t = 12;

    const hud = stage.querySelector('.machine__hud');
    if (hud) {
      const q = hud.getBoundingClientRect();
      if (q.height) t = Math.max(t, q.bottom - c.top + pad);
    }
    const list = stage.querySelector('.machine__scenes');
    if (list) {
      const q = list.getBoundingClientRect();
      if (q.width && q.bottom > c.top) l = Math.max(l, q.right - c.left + pad);
    }
    R.setSafeInsets(Math.round(l), Math.round(t), 24, 12);
  }

  // ── 그리기 ──
  let negOn = false;

  // 마지막 장의 끝. 캔버스가 라벨을 다 지우고 나면 조작부와 제목도 함께
  // 물러난다. 남는 것은 위에서 내려다본 기계 한 장뿐이다.
  //
  // 다만 영영 지워 두지는 않는다. 화면을 건드리면 조작부가 돌아온다 —
  // 되감을 방법이 사라지면 그건 마무리가 아니라 막다른 길이다.
  const BARE_AT = 8.4;
  let bareOn = false;
  let wakeUntil = 0;

  function updateBare(t, scene) {
    const last = scene.index === SCENES.length - 1;
    const inZone = last && (t - scene.start) > BARE_AT;
    const bare = inZone && performance.now() > wakeUntil;
    if (bare === bareOn) return;
    bareOn = bare;
    stage.classList.toggle('is-bare', bare);
    document.documentElement.classList.toggle('machine-bare', bare);
  }

  function wake() {
    if (!open) return;
    wakeUntil = performance.now() + 2600;
    if (bareOn) {
      bareOn = false;
      stage.classList.remove('is-bare');
      document.documentElement.classList.remove('machine-bare');
    }
  }

  // 장이 바뀌면 제목 길이가 달라지므로 안전 영역을 다시 잰다.
  let lastScene = -1;
  function afterUpdate(scene) {
    if (scene.index === lastScene) return;
    lastScene = scene.index;
    measureSafe();
  }

  const debug = (showFps || showCam)
    ? (scene, local) => { if (showFps) drawFps(); if (showCam) drawCam(scene, local); }
    : null;

  function drawOnce() {
    const t = F.film.reduced ? F.currentTime() : F.tickClock();
    const scene = F.renderAt(t, debug);
    ui.update(t, scene, F.film);
    afterUpdate(scene);
  }

  function frame(ms) {
    F.setNow(ms);
    const dt = F.frameDelta(ms);
    F.decayDrag(dt);

    const t0 = performance.now();
    const t = F.tickClock();
    const scene = F.renderAt(t, debug);
    const cost = performance.now() - t0;
    F.recordFrameTime(cost);

    if (!filmMode) { raf = requestAnimationFrame(frame); return; }

    ui.update(t, scene, F.film);
    afterUpdate(scene);
    updateBare(t, scene);
    if (F.film.negative !== negOn) {
      negOn = F.film.negative;
      stage.classList.toggle('is-negative', negOn);
      document.documentElement.classList.toggle('machine-negative', negOn);
    }

    raf = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (raf || F.film.reduced) return;
    F.setNow(performance.now());
    F.rebaseTo(F.currentTime());
    raf = requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  // ── 계기 ──
  function drawFps(cost) {
    const med = F.medianFrame();
    R.rectS(10, 10, 150, 34, 0.22, 1);
    R.textS(16, 22, 'MED ' + med.toFixed(1) + 'ms  Q' + F.film.quality, 9, 0.85, 'left');
    const s = R.frameStats();
    R.textS(16, 36, s.faces + 'f ' + s.lines + 'l ' + s.text + 't ' + s.strokes + 's', 9, 0.55, 'left');
  }
  function drawCam(scene, local) {
    const c = Cam.cam;
    const rows = [
      scene.id + ' +' + local.toFixed(2),
      'yaw ' + c.yaw.toFixed(3) + '  pitch ' + c.pitch.toFixed(3),
      'scale ' + c.scale.toFixed(3) + '  dolly ' + c.dolly.toFixed(0),
      'flat ' + c.flatten.toFixed(2) + '  drag ' + Cam.drag.yaw.toFixed(2) + '/' + Cam.drag.pitch.toFixed(2)
    ];
    for (let i = 0; i < rows.length; i++) R.textS(10, 60 + i * 13, rows[i], 9, 0.7, 'left');
  }

  // ── 시점 끌기 ──
  // 재생 중에도 살아 있다. 연출된 각도 위에 얹혔다가 손을 떼면 녹는다.
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-dragging');
    F.setDragging(true);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    F.addDrag((e.clientX - drag.x) * 0.006, (e.clientY - drag.y) * 0.004);
    drag = { x: e.clientX, y: e.clientY };
    if (F.film.reduced) drawOnce();
  });
  function endDrag() {
    if (!drag) return;
    drag = null;
    canvas.classList.remove('is-dragging');
    F.setDragging(false);
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  stage.addEventListener('pointermove', wake);
  stage.addEventListener('pointerdown', wake);

  // 두 번 누르면 처음 각도로 돌아온다. 예전과 같은 몸짓이고, 이제
  // 영화를 처음부터 다시 트는 것도 겸한다.
  canvas.addEventListener('dblclick', () => {
    F.resetDrag();
    if (filmMode) F.restart();
    if (F.film.reduced) { if (filmMode) F.scrubTo(0); drawOnce(); }
  });

  // ── 굴려서 시간 옮기기 ──
  // 트랙패드의 raw 델타는 튀고 단조롭지도 않아서 그대로 쓰면 화면이 떤다.
  // 목표값을 두고 damped follow 로 따라간다.
  let wheelTarget = null;
  canvas.addEventListener('wheel', (e) => {
    if (!filmMode) return;
    e.preventDefault();
    wake();
    const base = wheelTarget === null ? F.currentTime() : wheelTarget;
    // 화면 한 폭쯤 굴리면 한 장 넘어간다.
    wheelTarget = Math.max(0, Math.min(F.film.duration, base + e.deltaY * 0.014));
    F.scrubTo(wheelTarget);
    if (F.film.reduced) drawOnce();
    clearTimeout(wheelIdle);
    wheelIdle = setTimeout(() => { wheelTarget = null; }, 260);
  }, { passive: false });
  let wheelIdle = 0;

  // ── 키보드 ──
  // 이 캔버스에 키보드 조작이 생기는 것은 이번이 처음이다.
  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') { hide(); return; }
    if (!filmMode) return;
    wake();
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === ' ' || e.key === 'Spacebar') {
      if (F.film.reduced) return;
      e.preventDefault(); F.toggle();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault(); F.seekScene(1); after();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault(); F.seekScene(-1); after();
    } else if (e.key === 'Home') {
      e.preventDefault(); F.scrubTo(0); after();
    } else if (e.key === 'End') {
      e.preventDefault(); F.scrubTo(F.film.duration - 0.01); after();
    }
  });

  // ── 여닫기 ──
  function show() {
    open = true;
    clearTimeout(closeTimer);
    index.classList.add('is-machine');
    document.documentElement.classList.add('machine-open');
    stage.classList.add('is-open');
    stage.setAttribute('aria-hidden', 'false');
    toggleBtn.setAttribute('aria-expanded', 'true');
    toggleBtn.setAttribute('aria-label', '글 목록으로 돌아가기');

    resize();
    bareOn = false;
    stage.classList.remove('is-bare');
    document.documentElement.classList.remove('machine-bare');
    stage.classList.toggle('is-ambient', !filmMode);
    wakeUntil = 0;
    F.setNow(performance.now());

    if (!filmMode) {
      // 시계를 0 으로 맞추기만 한다. 재생할 것이 없다.
      F.rebaseTo(0);
    } else if (jumpTo !== null && !isNaN(jumpTo)) {
      // ?t= 로 들어오면 그 자리에 멈춘다. 한 프레임을 확인하려고 준 주소인데
      // 계속 흘러가 버리면 매번 다른 그림이 나온다.
      F.scrubTo(jumpTo, false);
      F.pause();
    } else {
      F.restart();
    }

    // 제목이 채워진 뒤에 한 번 더 재야 첫 장의 안전 영역이 맞는다.
    if (F.film.reduced) { stopLoop(); drawOnce(); drawOnce(); }
    else { startLoop(); }
  }

  function hide() {
    open = false;
    index.classList.remove('is-machine');
    document.documentElement.classList.remove('machine-open');
    document.documentElement.classList.remove('machine-bare');
    document.documentElement.classList.remove('machine-negative');
    stage.classList.remove('is-open');
    stage.setAttribute('aria-hidden', 'true');
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.setAttribute('aria-label', '기계 내부 열기');
    toggleBtn.focus();

    // 사라지는 동안에도 계속 돌다가, 다 사라지고 나면 멈춘다. 시간을
    // 하드코딩하지 않고 전환이 끝나는 것을 듣는다 — CSS 를 고치면
    // 여기도 따라온다.
    let done = false;
    const stop = () => {
      if (done) return;
      done = true;
      stage.removeEventListener('transitionend', onEnd);
      stopLoop();
      R.beginFrame();
    };
    const onEnd = (e) => { if (e.target === stage && e.propertyName === 'opacity') stop(); };
    stage.addEventListener('transitionend', onEnd);
    closeTimer = setTimeout(stop, 900);
  }

  toggleBtn.addEventListener('click', () => (open ? hide() : show()));

  // ── 창 크기 ──
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    if (!open) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      if (F.film.reduced || !raf) drawOnce();
    }, 120);
  });

  // ── 탭을 떠났다 돌아올 때 ──
  // 배경에서 돌지 않고, 돌아왔을 때 40초 건너뛴 자리에서 시작하지도 않는다.
  document.addEventListener('visibilitychange', () => {
    if (!open) return;
    if (document.hidden) stopLoop();
    else { F.setNow(performance.now()); F.rebaseTo(F.currentTime()); startLoop(); }
  });

  if (showFps || showCam) {
    window.__machine = {
      film: F.film,
      stats: () => R.frameStats(),
      median: () => F.medianFrame(),
      safe: () => R.safeArea(),
      cam: Cam.cam,
      // 아무 시각이나 한 프레임 그려 본다. 전체를 훑어 예외를 찾을 때 쓴다.
      probe: (t) => { F.scrubTo(t, false); F.renderAt(t, null); }
    };
  }

  if (location.hash === '#machine') show();
}
