// 필름.
//
// 시계 하나와 장면 목록. 매 프레임 하는 일은 세 가지뿐이다.
//
//   1. 지금이 몇 초인지 정한다 (자동 재생이면 흐른 시간, 아니면 사용자가 잡은 값)
//   2. 그 시각이 어느 장의 몇 초인지 찾는다
//   3. 카메라를 그 시각으로 맞추고 장면에게 그리라고 한다
//
// 어디에도 누적이 없다. 같은 t 를 두 번 주면 같은 그림이 두 번 나온다.
// 스크럽도 되감기도 리사이즈도 그래서 따로 만들 것이 없다.

import * as R from './core/raster.js';
import * as Cam from './core/camera.js';
import { clamp } from './core/timeline.js';
import { SCENES } from './scenes/index.js';
import AMBIENT from './scenes/ambient.js';

export const film = {
  scenes: SCENES,
  // 'ambient' 가 기본이다. 버튼을 누르면 기계가 나올 뿐, 아무것도 스스로
  // 재생되지 않는다. 'film' 은 12장을 순서대로 트는 모드이고, 주소로만 든다.
  mode: 'ambient',
  ambient: AMBIENT,
  duration: 0,
  t: 0,
  playing: true,
  auto: true,
  ended: false,
  quality: 2,          // 2 온전히 · 1 가볍게 · 0 최소
  reduced: false,
  // 전면 반전은 광과민성 문제다. 모션 감소와 고대비에서는 아예 끈다.
  highContrast: false,
  negative: false
};

// 장면마다 시작 시각을 매겨 둔다.
(function layout() {
  let at = 0;
  for (let i = 0; i < SCENES.length; i++) {
    SCENES[i].start = at;
    SCENES[i].index = i;
    at += SCENES[i].dur;
  }
  film.duration = at;
})();

export function sceneAt(t) {
  const s = SCENES;
  for (let i = s.length - 1; i >= 0; i--) {
    if (t >= s[i].start) return s[i];
  }
  return s[0];
}

export function sceneBoundaries() {
  return SCENES.map((s) => s.start);
}

// ── 시계 ──────────────────────────────────────────────────────
let t0 = 0;              // 자동 재생의 기준점 (performance.now 기준, ms)
let manualT = 0;
let lastScrub = -1e9;
let now = 0;

const SCRUB_RELEASE = 900;   // 스크럽을 놓고 이만큼 지나면 자동 재생으로 돌아간다

export function setNow(ms) { now = ms; }

export function currentTime() {
  if (film.reduced) return manualT;
  if (!film.playing) return manualT;
  if (film.auto) return (now - t0) / 1000;
  return manualT;
}

export function play() {
  if (film.playing) return;
  film.playing = true;
  t0 = now - manualT * 1000;
  film.auto = true;
}

export function pause() {
  if (!film.playing) return;
  manualT = currentTime();
  film.playing = false;
}

export function toggle() { film.playing ? pause() : play(); }

// 사용자가 시간을 잡는다. 자동 재생은 잠시 물러난다.
export function scrubTo(t, byUser) {
  manualT = clamp(t, 0, film.duration);
  film.auto = false;
  film.ended = false;
  if (byUser !== false) lastScrub = now;
}

export function scrubBy(dt) { scrubTo(manualT + dt); }

export function seekScene(dir) {
  const cur = currentTime();
  const s = sceneAt(cur);
  let target;
  if (dir < 0) {
    // 장 안에서 1.2초 넘게 흘렀으면 이 장의 처음으로, 아니면 앞 장으로.
    target = (cur - s.start > 1.2) ? s.start : (s.index > 0 ? SCENES[s.index - 1].start : 0);
  } else {
    target = s.index < SCENES.length - 1 ? SCENES[s.index + 1].start : film.duration - 0.001;
  }
  scrubTo(target);
  if (!film.reduced) resumeSoon();
}

export function restart() {
  manualT = 0;
  film.ended = false;
  film.auto = true;
  film.playing = true;
  t0 = now;
}

// 스크럽을 놓으면 잡았던 자리에서 이어 재생한다. 처음으로 돌아가지 않는다.
function resumeSoon() { lastScrub = now - SCRUB_RELEASE + 260; }

export function tickClock() {
  if (film.mode === 'ambient') {
    // 기계가 살아 있는 데 필요한 시간만 흐른다. 끝나지 않으므로 끝을
    // 검사하지 않고, 장이 없으므로 경계를 넘지도 않는다.
    return film.reduced ? 0 : (now - t0) / 1000;
  }
  if (film.reduced) return manualT;
  if (!film.playing) return manualT;
  if (!film.auto && now - lastScrub > SCRUB_RELEASE) {
    film.auto = true;
    t0 = now - manualT * 1000;
  }
  let t = film.auto ? (now - t0) / 1000 : manualT;
  if (t >= film.duration) {
    // 끝나면 멈추고 카메라를 돌려준다. 영화가 장난감으로 되돌아가는 것이
    // 이 작품의 마지막 동작이다.
    t = film.duration - 0.001;
    manualT = t;
    film.auto = false;
    film.playing = false;
    film.ended = true;
  }
  if (film.auto) manualT = t;
  return t;
}

export function rebaseTo(t) { t0 = now - t * 1000; manualT = t; }

// ── 드래그 ────────────────────────────────────────────────────
// 재생 중에도 손은 살아 있다. 사용자가 더한 각도는 연출된 각도 위에 얹혔다가
// 손을 떼면 녹아 없어진다. 트래킹 숏과 싸우지 않으면서도, 오늘 존재하는
// 장난감의 손맛을 잃지 않는 방법.
const dragTarget = { yaw: 0, pitch: 0 };
let dragging = false;
let dragHoldUntil = 0;

export function addDrag(dy, dp) {
  if (film.mode === 'ambient') {
    // 자유 회전. 좌우는 한 바퀴를 다 돌 수 있고, 상하만 수직을 넘지
    // 않도록 막는다. 기준이 부감(1.46)이므로 아래로 1.40 까지 내려간다.
    dragTarget.yaw += dy;
    dragTarget.pitch = clamp(dragTarget.pitch + dp, -1.40, 0.06);
    return;
  }
  dragTarget.yaw = clamp(dragTarget.yaw + dy, -1.15, 1.15);
  dragTarget.pitch = clamp(dragTarget.pitch + dp, -0.42, 0.62);
  dragHoldUntil = now + 700;
}

export function setDragging(on) {
  dragging = on;
  if (!on) dragHoldUntil = now + 700;
}

export function dragOffset() { return dragTarget; }

export function resetDrag() { dragTarget.yaw = 0; dragTarget.pitch = 0; }

function decayDrag(dt) {
  // 앰비언트에서는 녹지 않는다. 연출된 숏이 없으므로 되돌릴 각도도 없고,
  // 손으로 맞춰 둔 시점이 저절로 풀리면 그건 고장으로 읽힌다.
  if (film.mode === 'ambient') return;
  if (film.ended) return;                 // 끝난 뒤에는 사용자 것이다
  if (dragging || now < dragHoldUntil) return;
  const k = Math.pow(0.0016, dt);         // 900ms 쯤에 걸쳐 녹는다
  dragTarget.yaw *= k;
  dragTarget.pitch *= k;
  if (Math.abs(dragTarget.yaw) < 1e-4) dragTarget.yaw = 0;
  if (Math.abs(dragTarget.pitch) < 1e-4) dragTarget.pitch = 0;
}

// ── 그리기 ────────────────────────────────────────────────────
let lastFrame = 0;

export function renderAt(t, overlay) {
  const ambientMode = film.mode === 'ambient';
  const s = ambientMode ? AMBIENT : sceneAt(t);
  const local = ambientMode ? t : t - s.start;

  // 카메라. 장면이 대상과 각도를 말하면 여기서 화면 크기에 맞춘다.
  const desc = s.camAt ? s.camAt(local, s) : s.cam;
  if (desc) {
    // 세로 화면 보정. 장면마다 예외를 두지 않고 여기 한 곳에서 끝낸다.
    const vp = Cam.viewport();
    const portrait = vp.h > vp.w * 1.1 ? Math.min(1, (vp.h / vp.w - 1.1) / 0.9) : 0;
    // 보정은 더하기만 한다. 상한으로 자르면 부감으로 적어 둔 장면이
    // 가로 화면에서도 도로 내려앉는다.
    const base = desc.pitch === undefined ? 0.42 : desc.pitch;
    const pitch = base + portrait * Math.max(0, Math.min(0.24, 1.42 - base));

    // 부감에서는 각도를 더 세울 수가 없다. 대신 보드를 90도 돌린다 —
    // 긴 변을 화면의 긴 변에 맞추면 세로 화면에서 남는 자리가 사라진다.
    let yaw = desc.yaw === undefined ? 0 : desc.yaw;
    if (desc.turnPortrait && portrait > 0.5) yaw += Math.PI / 2;

    // 손으로 더한 각도를 여기서 함께 넣는다.
    //
    // 예전에는 화면 맞추기를 끝낸 뒤에 드래그를 얹었다. 조금 흔드는
    // 정도라면 표가 나지 않지만, 자유롭게 돌리면 맞춰 둔 틀 밖으로
    // 기계가 걸어 나가 잘린다. 각도를 먼저 정하고 그 각도로 맞춰야
    // 어느 방향에서 보든 전체가 화면 안에 남는다.
    const finalYaw = yaw + dragTarget.yaw;
    const finalPitch = clamp(pitch + dragTarget.pitch, 0.06, 1.52);

    const fitted = Cam.fitBox(desc.focus,
      Object.assign({}, desc, { pitch: finalPitch, yaw: finalYaw }));
    Cam.applyState({
      yaw: finalYaw, pitch: finalPitch,
      dolly: desc.dolly, flatten: desc.flatten,
      tx: fitted.tx, ty: fitted.ty, tz: fitted.tz,
      scale: fitted.scale,
      shiftX: fitted.shiftX, shiftY: fitted.shiftY
    });
  }
  // 각도에 이미 들어갔으므로 여기서 또 더하지 않는다.
  Cam.drag.yaw = 0;
  Cam.drag.pitch = 0;
  Cam.commit();

  const neg = !!(s.negativeAt && !film.reduced && !film.highContrast && s.negativeAt(local));
  R.setNegative(neg);
  film.negative = neg;
  R.beginFrame();
  s.render(local, { quality: film.quality, film, scene: s, t });
  // 계기는 칠하기 전에 얹어야 한다. paint() 뒤에 밀어 넣으면 아무도
  // 그것을 그려 주지 않는다.
  if (overlay) overlay(s, local);
  R.paint();

  return s;
}

// ── 품질 ──────────────────────────────────────────────────────
// 30프레임 이동 중앙값을 본다. 타이밍은 절대 바뀌지 않고 밀도만 바뀐다 —
// 타임라인이 시간 기반이므로 그래도 되고, 그래야 한다.
const times = new Float32Array(30);
let ti = 0, filled = 0;
let badRun = 0, goodRun = 0;

export function recordFrameTime(ms) {
  times[ti] = ms;
  ti = (ti + 1) % times.length;
  if (filled < times.length) filled++;
  if (filled < times.length) return;

  const sorted = Array.prototype.slice.call(times).sort((a, b) => a - b);
  const med = sorted[15];

  if (med > 20) { badRun++; goodRun = 0; } else { badRun = 0; }
  if (med < 12) { goodRun++; } else { goodRun = 0; }

  if (badRun >= 30 && film.quality > 0) { film.quality--; badRun = 0; }
  else if (goodRun >= 90 && film.quality < 2) { film.quality++; goodRun = 0; }
}

export function medianFrame() {
  if (filled < times.length) return 0;
  const sorted = Array.prototype.slice.call(times).sort((a, b) => a - b);
  return sorted[15];
}

export { decayDrag };
export function frameDelta(ms) {
  // 탭을 되돌아왔을 때 한 프레임이 재앙이 되지 않게 자른다.
  const dt = Math.min(0.05, (ms - lastFrame) / 1000);
  lastFrame = ms;
  return dt > 0 ? dt : 0.016;
}
