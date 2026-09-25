/*
 * 메뉴 막대의 달리는 고양이
 *
 * 맥의 RunCat 처럼, 바쁠수록 빨리 달린다. 웹 쪽이라 CPU 대신 이 쪽의
 * "활동량"을 잰다 — 스크롤·마우스·키보드 입력이 몰리는 정도와, 프레임이
 * 늦게 도는 정도(메인 스레드가 바쁜 정도) 중 큰 쪽.
 *
 * 그림은 이미지가 아니라 매 프레임 선과 타원으로 그린다. 다리 넷이
 * 갤럽의 순서로 앞뒤로 흔들리고, 몸통이 오르내리며, 꼬리가 따라 흔들린다.
 */
const canvas = document.querySelector('[data-runcat]');
const loadLabel = document.querySelector('[data-runcat-load]');
const toggle = document.querySelector('[data-runcat-toggle]');
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
function leg(ctx, hx, hy, phase, spread) {
  const swing = Math.sin(phase) * spread;
  const bend = Math.max(0, Math.sin(phase + Math.PI / 2)) * 0.9;
  const kx = hx + Math.sin(swing) * 3.1;
  const ky = hy + Math.cos(swing) * 3.1;
  const lower = swing - bend;
  const fx = kx + Math.sin(lower) * 3;
  const fy = ky + Math.cos(lower) * 3;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(kx, ky);
  ctx.lineTo(fx, Math.min(fy, H - 0.9));
  ctx.stroke();
}

// 메뉴 막대 위라 배경화면을 따른다: 다크 모양이거나 배경화면이 어두우면 흰 고양이.
const onDark = () =>
  document.documentElement.dataset.theme === 'dark' || document.body.dataset.wallpaperTone === 'dark';
const ink = () => (onDark() ? '#fff' : '#000');
const paper = () => (onDark() ? '#000' : '#fff');

function drawCat(ctx, t, running) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = ink();
  ctx.strokeStyle = ink();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 쉬는 고양이: 앉아서 꼬리만 느리게.
  if (!running) {
    ctx.beginPath();
    ctx.ellipse(13, 12, 6.2, 4.4, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(18.6, 7.4, 3.1, 2.8, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(16.4, 6.3);
    ctx.lineTo(16.9, 3);
    ctx.lineTo(18.4, 5.2);
    ctx.moveTo(18.8, 5);
    ctx.lineTo(20.6, 3.1);
    ctx.lineTo(21.2, 6);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(7.4, 14);
    ctx.quadraticCurveTo(3, 15.5, 3.4, 11.8 + Math.sin(t * 1.2) * 0.8);
    ctx.stroke();
    return;
  }

  const bob = Math.sin(t * 2) * 0.55;
  const reach = Math.sin(t) * 0.6;

  // 꼬리
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(8, 8.4 + bob);
  ctx.quadraticCurveTo(4.6, 6.8 + bob, 2.2, 3.6 + Math.sin(t + 1.2) * 1.5);
  ctx.stroke();

  // 다리: 뒤쪽 한 쌍, 앞쪽 한 쌍. 짝끼리 조금씩 어긋나 갤럽이 된다.
  ctx.lineWidth = 1.6;
  const hip = 10.6 + bob;
  leg(ctx, 18.4 + reach, hip, t, 0.95);
  leg(ctx, 17.1 + reach, hip, t + 0.8, 0.95);
  leg(ctx, 10.2 - reach, hip, t + Math.PI, 0.9);
  leg(ctx, 8.9 - reach, hip, t + Math.PI + 0.8, 0.9);

  // 몸통
  ctx.beginPath();
  ctx.ellipse(13.6, 9 + bob, 6.6 + reach * 0.6, 3.1, -0.04, 0, TAU);
  ctx.fill();

  // 머리 · 주둥이 · 귀
  const hy = 6.9 + bob * 0.6;
  ctx.beginPath();
  ctx.ellipse(21.4, hy, 3, 2.7, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(23.9, hy + 0.8, 1.4, 1.05, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(19.3, hy - 1.2);
  ctx.lineTo(19.9, hy - 4.1);
  ctx.lineTo(21.4, hy - 1.9);
  ctx.moveTo(21.7, hy - 2);
  ctx.lineTo(23.3, hy - 4);
  ctx.lineTo(23.5, hy - 0.9);
  ctx.fill();

  // 눈
  ctx.fillStyle = paper();
  ctx.beginPath();
  ctx.arc(22.4, hy - 0.4, 0.5, 0, TAU);
  ctx.fill();
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

    // 쉬엄쉬엄 1초에 0.9 보폭, 바쁘면 5 보폭까지. 12fps 에서 한 칸에 반 보폭을
    // 넘으면 다리가 뒤로 도는 것처럼 보이므로 그 아래에서 멈춘다.
    phase += Math.min(TAU * 0.45, dt * TAU * (0.9 + load * 4.1));
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
      if (loadLabel) loadLabel.textContent = resting || idle || still() ? '쉬는 중' : '—';
    }
    if (toggle) {
      toggle.setAttribute('aria-checked', String(resting));
    }
    button?.setAttribute('aria-label', resting ? 'RunCat (쉬는 중)' : 'RunCat');
  }

  toggle?.addEventListener('click', () => {
    resting = !resting;
    store.set('ephemeris:runcat', resting ? 'rest' : 'run');
    sync();
  });
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
