/*
 * 지니 효과
 *
 * 맥에서 창을 최소화하면 창이 Dock 의 칸으로 빨려 들어간다. 아랫단이 먼저
 * 칸 폭으로 오므라들고, 윗단은 조금 늦게 따라 내려오며 몸통이 호리병처럼 휜다.
 *
 * DOM 은 줄마다 다르게 휠 수 없으므로 창을 한 장의 그림으로 뜬 다음(html-to-image),
 * 화면 전체를 덮는 캔버스에 그 그림을 한 줄(1px)씩 다른 폭과 자리로 그린다.
 * 되살릴 때는 최소화할 때 뜬 그림을 거꾸로 돌린다(최소화된 동안 창은 바뀌지 않는다).
 *
 * 그림 뜨기는 보통 0.1초 안팎이지만 Druid 처럼 그림이 큰 창은 1초가 넘는다. 그래서
 * 마우스가 창의 제목 막대나 신호등에 닿는 순간 미리 떠 두고, 누를 때 아직이면 잠깐
 * 기다린다. 그래도 늦으면 조금 전에 뜬 그림(1분 안, 크기가 같을 때)을 쓰고, 그마저
 * 없으면 null 을 돌려준다. 그땐 부르는 쪽(windows.js)이 예전의 가벼운 효과를 쓴다.
 */
const DUR = 560;
const FRESH_MS = 1500; // 미리 뜬 그림을 새것으로 치는 시간
const STALE_MS = 60000; // 늦을 때 대신 쓸 수 있는 옛 그림의 나이
const WAIT_MS = 450; // 누른 뒤 그림을 기다리는 시간

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInQuad = (t) => t * t;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lib = null;
const loadLib = () => (lib ??= import('./vendor/html-to-image.js'));

// ── 그림 뜨기 ───────────────────────────────────────────────────
const shots = new WeakMap(); // 창 → { at, w, h, promise } 뜨는 중이거나 막 뜬 그림
const lastShot = new WeakMap(); // 창 → { at, w, h, canvas } 마지막으로 다 뜬 그림
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

async function shoot(win) {
  const { toCanvas } = await loadLib();
  const w = win.offsetWidth;
  const h = win.offsetHeight;
  const bottom = win.getBoundingClientRect().bottom;
  return toCanvas(win, {
    width: w,
    height: h,
    pixelRatio: Math.min(devicePixelRatio || 1, 2),
    // 웹 글꼴을 모두 끼워 넣으면 느리다(Pretendard 는 조각이 수백 개). 0.5초 동안 보이는
    // 그림이라 시스템 글꼴로 그려도 티가 나지 않는다.
    skipFonts: true,
    cacheBust: false,
    imagePlaceholder: PIXEL,
    // 창 안의 자리(top, left)와 움직임을 떼어 내 그림의 (0, 0) 에 놓는다.
    style: {
      position: 'absolute',
      top: '0',
      left: '0',
      right: 'auto',
      bottom: 'auto',
      margin: '0',
      width: `${w}px`,
      height: `${h}px`,
      transform: 'none',
      translate: 'none',
      scale: 'none',
      animation: 'none',
      transition: 'none',
      opacity: '1',
      visibility: 'visible',
    },
    // 창 아래로 벗어난(스크롤해야 보이는) 것은 빼서 긴 글도 빨리 뜬다.
    // 그 아래의 것만 빼므로 보이는 것들의 자리는 움직이지 않는다.
    filter: (node) => {
      if (!(node instanceof Element)) return true;
      if (node.matches('.window__grip, script')) return false;
      const r = node.getBoundingClientRect();
      return !(r.height && r.top > bottom + 40);
    },
  });
}

/** 노란 단추에 마우스가 닿으면 미리 떠 둔다. */
export function prime(win) {
  if (!win || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const old = shots.get(win);
  const w = win.offsetWidth;
  const h = win.offsetHeight;
  if (old && performance.now() - old.at < FRESH_MS && old.w === w && old.h === h) return;
  const at = performance.now();
  const promise = shoot(win)
    .then((canvas) => {
      if (canvas?.width) lastShot.set(win, { at, w, h, canvas });
      return canvas;
    })
    .catch(() => null);
  shots.set(win, { at, w, h, promise });
}

/** 창의 그림. 늦으면 옛 그림, 그마저 없으면 null. */
export async function snapshot(win, wait = WAIT_MS) {
  prime(win);
  const shot = shots.get(win);
  shots.delete(win); // 한 번 쓴 그림은 다음에 다시 뜬다
  if (!shot) return null;
  const canvas = await Promise.race([shot.promise, sleep(wait).then(() => null)]);
  if (canvas?.width) return canvas;
  const old = lastShot.get(win);
  const fits = old && old.w === win.offsetWidth && old.h === win.offsetHeight;
  return fits && performance.now() - old.at < STALE_MS ? old.canvas : null;
}

// 마우스가 제목 막대나 신호등에 닿으면(노란 단추로 가는 길). 창을 끄는 중에는 뜨지 않는다.
document.addEventListener(
  'pointerover',
  (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const bar = e.target.closest?.('.traffic, [data-window-drag]');
    const win = bar?.closest('[data-window]');
    if (win && !win.closest('.dock')) prime(win);
  },
  { passive: true },
);

// ── 그리기 ──────────────────────────────────────────────────────
let stage = null;

function openStage() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  stage ??= document.createElement('canvas');
  stage.className = 'genie-stage';
  stage.setAttribute('aria-hidden', 'true');
  stage.width = Math.round(innerWidth * dpr);
  stage.height = Math.round(innerHeight * dpr);
  document.body.append(stage);
  const ctx = stage.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

/**
 * t(0 → 1)일 때의 모습. from 은 창, to 는 Dock 칸의 화면 위 자리.
 * 줄마다 출발이 다르다: 아랫줄일수록 일찍 오므라들고(폭), 일찍 내려간다(높이).
 */
function frame(ctx, img, from, to, t) {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  const h = Math.round(from.height);
  const k = img.height / h; // 그림의 한 줄 높이(레티나에서는 2)
  const ys = new Float32Array(h + 1);
  const rows = [];
  for (let y = 0; y <= h; y++) {
    const r = y / h;
    const xStart = (1 - r) * 0.62;
    const xe = easeInOutCubic(clamp((t - xStart) / (1 - xStart), 0, 1));
    const yStart = (1 - r) * 0.22;
    const ye = easeInQuad(clamp((t - yStart) / (1 - yStart), 0, 1));
    ys[y] = lerp(from.top + y, to.top + r * to.height, ye);
    rows.push([lerp(from.left, to.left, xe), lerp(from.right, to.right, xe)]);
  }
  for (let y = 0; y < h; y++) {
    const [left, right] = rows[y];
    const w = right - left;
    if (w < 0.6) continue;
    // 줄 사이가 벌어지면 틈이 보이므로 다음 줄까지 늘려 그린다
    const hgt = Math.max(1, ys[y + 1] - ys[y]) + 0.35;
    ctx.drawImage(img, 0, y * k, img.width, k, left, ys[y], w, hgt);
  }
}

/**
 * 창을 Dock 칸으로(reverse 면 칸에서 창으로). 첫 그림을 그린 뒤 onStart 로 진짜 창을
 * 숨기고, 끝나는 그 순간 onEnd 로 진짜 창을 보인 다음 캔버스를 걷는다.
 * 둘이 같은 틀(frame)에서 바뀌므로 창이 겹치거나 비는 순간이 없다.
 */
export function play(img, from, to, { reverse = false, onStart, onEnd } = {}) {
  const ctx = openStage();
  return new Promise((resolve) => {
    let start = 0;
    const step = (now) => {
      start ||= now;
      const p = clamp((now - start) / DUR, 0, 1);
      frame(ctx, img, from, to, reverse ? 1 - p : p);
      if (p < 1) return requestAnimationFrame(step);
      onEnd?.();
      stage.remove();
      resolve();
    };
    frame(ctx, img, from, to, reverse ? 1 : 0);
    onStart?.();
    requestAnimationFrame(step);
  });
}
