/*
 * 메뉴 막대의 달리는 고양이
 *
 * 맥의 RunCat 처럼, 바쁠수록 빨리 달린다. 웹 쪽이라 CPU 대신 이 쪽의
 * "활동량"을 잰다 — 스크롤·마우스·키보드 입력이 몰리는 정도와, 프레임이
 * 늦게 도는 정도(메인 스레드가 바쁜 정도) 중 큰 쪽.
 *
 * 그림은 달리는 고양이 다섯 장(assets/images/runcat/)을 넘기는 것이다.
 */
const canvas = document.querySelector('[data-runcat]');
const loadLabel = document.querySelector('[data-runcat-load]');
const toggle = document.querySelector('[data-runcat-toggle]');
const swatches = Array.from(document.querySelectorAll('[data-runcat-color]'));
const button = canvas?.closest('button');

const W = 30;
const H = 18;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const TAU = Math.PI * 2;

const store = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch {}
  },
};

// ── 그림 ────────────────────────────────────────────────────────
// 달리는 고양이 다섯 장(assets/images/runcat/, 검은 그림에 투명 바탕, 2배 크기)을
// 번갈아 넘긴다. 메뉴의 Colors 에서 고른 색으로 칠해 그린다(기본은 흰색).
const FRAMES = [0, 1, 2, 3, 4].map((i) => {
  const img = new Image();
  img.src = `${canvas?.dataset.runcatSrc || '/assets/images/runcat/'}classic-cat-frame-${i}.png`;
  return img;
});
const tint = document.createElement('canvas');

// 고양이 색: '#rrggbb' 이거나 'menubar'(메뉴 막대 글자색을 따른다 — 배경화면이
// 바뀌면 검정 · 흰색이 바뀌므로 그릴 때마다 읽는다).
const COLOR_KEY = 'ephemeris:runcat-color';
const DEFAULT_COLOR = '#ffffff';
let color = store.get(COLOR_KEY) || DEFAULT_COLOR;
if (!swatches.some((s) => s.dataset.runcatColor === color)) color = DEFAULT_COLOR;
const ink = () => (color === 'menubar' ? getComputedStyle(button || document.body).color : color);

function drawCat(ctx, t, running) {
  ctx.clearRect(0, 0, W, H);
  // 쉬는 고양이는 첫 장에 멈춰 선다. 달릴 때는 보폭(t)에 맞춰 한 장씩.
  const img = FRAMES[running ? Math.floor(t / (TAU / FRAMES.length)) % FRAMES.length : 0];
  if (!img.complete || !img.naturalWidth) {
    img.addEventListener('load', () => drawCat(ctx, t, running), { once: true });
    return;
  }
  tint.width = img.naturalWidth;
  tint.height = img.naturalHeight;
  const g = tint.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = ink();
  g.fillRect(0, 0, tint.width, tint.height);
  // 그림은 63×36 — 30×18 칸에 비율대로 맞춘다
  const k = Math.min(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  ctx.drawImage(tint, (W - w) / 2, (H - h) / 2, w, h);
}

// ── 활동량 ──────────────────────────────────────────────────────
// 입력은 쌓였다가 1.2초 반감으로 식는다. 프레임이 늦게 오면 그만큼 바쁜 것.
let energy = 0;
let busy = 0;
let load = 0.05;

const bump = (n) => () => {
  energy = Math.min(40, energy + n);
};
addEventListener('scroll', bump(1.2), { passive: true, capture: true });
addEventListener('wheel', bump(0.8), { passive: true });
addEventListener('pointermove', bump(0.35), { passive: true });
addEventListener('pointerdown', bump(4), { passive: true });
addEventListener('keydown', bump(3));

// ── 돌리기 ──────────────────────────────────────────────────────
// 맥의 RunCat 처럼 몇 장의 그림을 넘기듯 1초에 12번만 그린다. 매 프레임
// 그리면 메뉴 막대가 쉬지 않고 다시 합성되어, 가만히 읽는 동안에도 배터리를 먹는다.
const FRAME_MS = 1000 / 12;

if (canvas) {
  const ctx = canvas.getContext('2d');
  function scale() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  scale();

  let resting = store.get('ephemeris:runcat') === 'rest';
  let idle = false; // 한동안 아무 입력이 없으면 쉰다(아래)
  let phase = 0;
  let prev = 0;
  let drawn = 0;
  let raf = 0;
  let lastLabel = 0;

  const still = () => document.documentElement.classList.contains('is-still');
  const running = () => !resting && !still() && !reducedMotion.matches;

  function frame(now) {
    if (now - drawn < FRAME_MS) {
      raf = requestAnimationFrame(frame);
      return;
    }
    drawn = now;
    const dt = prev ? Math.min(0.25, (now - prev) / 1000) : 0;
    prev = now;

    energy *= Math.exp(-dt / 1.2);
    // 12fps 로 그리므로 한 칸은 약 83ms. 그보다 한참 늦게 왔다면 메인 스레드가 바빴던 것.
    const lag = dt ? Math.max(0, Math.min(1, (dt * 1000 - FRAME_MS - 25) / 90)) : 0;
    busy += (lag - busy) * Math.min(1, dt * 4);
    const target = Math.min(1, Math.max(energy / 28, busy) * 0.92 + 0.04);
    load += (target - load) * Math.min(1, dt * 3);

    // 쉬엄쉬엄 1초에 0.9 보폭(다섯 장 한 바퀴), 바쁘면 더 빨리. 한 번 그릴 때
    // 한 장보다 많이 건너뛰면 끊겨 보이므로 한 장에서 멈춘다.
    phase += Math.min(TAU / 5, dt * TAU * (0.9 + load * 4.1));
    drawCat(ctx, phase, true);

    if (loadLabel && now - lastLabel > 500) {
      lastLabel = now;
      loadLabel.textContent = `${Math.round(load * 100)}%`;
    }
    raf = requestAnimationFrame(frame);
  }

  function sync() {
    cancelAnimationFrame(raf);
    prev = 0;
    drawn = 0;
    if (running() && !idle && document.visibilityState !== 'hidden') {
      raf = requestAnimationFrame(frame);
    } else {
      drawCat(ctx, performance.now() / 1000, running() && !idle);
      if (loadLabel) loadLabel.textContent = resting || idle || still() ? 'Resting' : '—';
    }
    if (toggle) {
      toggle.setAttribute('aria-checked', String(resting));
    }
    button?.setAttribute('aria-label', resting ? 'RunCat (resting)' : 'RunCat');
  }

  toggle?.addEventListener('click', () => {
    resting = !resting;
    store.set('ephemeris:runcat', resting ? 'rest' : 'run');
    sync();
  });

  // 색 고르기: 메뉴는 열어 둔 채(data-keep-open) 바로 다시 그려 보여 준다.
  const markColor = () => {
    for (const s of swatches) s.setAttribute('aria-checked', String(s.dataset.runcatColor === color));
  };
  for (const s of swatches) {
    s.addEventListener('click', () => {
      color = s.dataset.runcatColor;
      store.set(COLOR_KEY, color);
      markColor();
      sync();
    });
  }
  markColor();
  // 아무 입력 없이 12초가 지나면 고양이도 쉰다. 글을 읽는 내내 캔버스를
  // 다시 그리지 않게. 손을 대면 곧바로 다시 달린다.
  const IDLE_MS = 12000;
  let idleTimer = 0;
  const wakeCat = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idle = true;
      sync();
    }, IDLE_MS);
    if (!idle) return;
    idle = false;
    sync();
  };
  wakeCat();
  for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) {
    addEventListener(type, wakeCat, { passive: true, capture: true });
  }
  addEventListener('ephemeris:still', sync);
  addEventListener('ephemeris:theme', sync);
  // 'Menu Bar' 색은 배경화면의 밝기(data-wallpaper-tone)를 따라 바뀌므로, 배경화면을 바꾸면 다시 그린다.
  new MutationObserver(() => color === 'menubar' && sync()).observe(document.body, {
    attributes: true,
    attributeFilter: ['data-wallpaper-tone'],
  });
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', sync);

  // 화면 배율이 바뀌면(확대, 다른 모니터) 캔버스를 다시 잡는다.
  (function watchDpr() {
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        scale();
        sync();
        watchDpr();
      },
      { once: true },
    );
  })();

  sync();
}
