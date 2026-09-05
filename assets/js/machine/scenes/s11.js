// 11 · THE WAIT — 4.17밀리초
//
// 앞 장의 페이지 폴트가 여기로 떨어진다. 팔은 호를 그리며 날아가 목표 트랙을
// 지나쳤다가 울면서 내려앉고, 그러고도 아무것도 읽지 못한다 — 섹터가 반대편에
// 있기 때문이다. 7200 rpm 에서 한 바퀴가 8.33 ms 이므로 평균은 그 절반,
// 4.17 ms 다. 탐색이 0이어도 이 시간은 남는다.
//
// 이 영화에서 사람의 몸이 길이를 느낄 수 있는 유일한 박자라서, 화면을 실제의
// 1,200분의 1 속도로 늦추고 그냥 기다린다. 늦춘 배율은 화면에 적어 둔다.
// 플래터의 회전과 두 카운터가 그 하나의 배율을 함께 쓰기 때문에, 도는 것을
// 세어서 숫자를 검산할 수 있다.

import * as R from '../core/raster.js';
import { span, mix, clamp, pulse } from '../core/timeline.js';
import { out3, inOut3, makeSpring } from '../core/ease.js';
import { bit2 } from '../core/hash.js';
import { drawMachine, lerpBox, HOME } from './common.js';
import { BOX, DX, DZ, PLATTER_Y, PLATTER_R, headAt } from '../geom/parts.js';
import { GHZ } from './s07.js';

const DUR = 13;
const TAU = Math.PI * 2;

// ── 시간 배율 ─────────────────────────────────────────────────
// 이 장의 모든 숫자가 이 네 줄에서 나온다. 화면 속 회전도, 두 카운터도
// 같은 배율 하나를 쓴다 — 따로 두면 관객이 세어 볼 수 없다.
const RPM = 7200;
const MS_REV = 60000 / RPM;                 // 한 바퀴 8.3333 ms
const SLOW = 1200;                          // 화면은 실제보다 1,200배 느리다
const SEC_REV = MS_REV * SLOW / 1000;       // 화면에서 한 바퀴 10.0초
const OMEGA = TAU / SEC_REV;                // 화면에서의 각속도
const HALF = SEC_REV / 2;                   // 반 바퀴 = 화면 5.0초

// 화면 시간 → 실제 시간, 실제 시간 → 클럭. 4.5 GHz 는 07장이 한 번 못박은 값.
function msOf(sec) { return sec * 1000 / SLOW; }
function cycOf(ms) { return ms * GHZ * 1e6; }

const MS_HALF = msOf(HALF);                 // 4.1667 ms
const CYC_HALF = cycOf(MS_HALF);            // 18,750,000

function commas(n) { return Math.round(n).toLocaleString('en-US'); }

// ── 자리 ──────────────────────────────────────────────────────
// armFaces()·headAt() 이 쓰는 것과 같은 피벗, 같은 팔 길이다. 팔은 직선이
// 아니라 이 축을 도는 호를 그린다. 그래서 장면이 다루는 값은 각도 하나이고,
// 반지름은 거기서 따라 나온다.
const PIVOT = [DX + 65, DZ + 52];
const ARM_L = 104;
const PDX = PIVOT[0] - DX, PDZ = PIVOT[1] - DZ;
const PD2 = PDX * PDX + PDZ * PDZ;
const PAMP = Math.hypot(PDX, PDZ);
const PPHI = Math.atan2(PDZ, PDX);

// 헤드가 어느 트랙 위에 있는가. r² = |P−C|² + L² + 2L|P−C|cos(θ−φ) 를 뒤집는다.
// 각도를 손으로 정하고 트랙을 눈대중으로 맞추면, 정착의 진폭이 곧바로 거짓이 된다.
function angleFor(r) {
  const c = (r * r - PD2 - ARM_L * ARM_L) / (2 * ARM_L * PAMP);
  return PPHI + Math.acos(clamp(c, -1, 1));
}

// diskDetail 이 그리는 트랙은 20·28·36·44·52 다. 그 위에서만 출발하고 멈춘다.
const R_FROM = 52;                 // 앞의 접근이 남겨 둔 자리 — 가장 바깥
const R_TO = 36;                   // 목표 트랙
const R_OVER = R_TO - 2.6;         // 감속이 끝난 자리. 목표를 지나쳐 있다

// ── 시각 ──────────────────────────────────────────────────────
// 정착은 스프링으로 푼다. 이 영화에서 스프링을 쓰는 자리는 여기 한 곳뿐이다 —
// 보이스코일이 목표에 닿는 방식이 실제로 감쇠 진동이기 때문이고, 다른 어떤
// 이징도 '지나쳤다가 울며 내려앉는다'를 말하지 못하기 때문이다.
const SP_K = 210, SP_C = 7, SP_M = 1;
const SETTLE = makeSpring({ mass: SP_M, stiffness: SP_K, damping: SP_C });

// 울음의 주파수. 화면 배율을 되돌리면 실제 값이 된다. 팔의 굽힘 모드로 그럴듯한 자리.
const W0 = Math.sqrt(SP_K / SP_M);
const ZETA = SP_C / (2 * Math.sqrt(SP_K * SP_M));
const RING_HZ = (W0 * Math.sqrt(1 - ZETA * ZETA)) / TAU * SLOW;

const T_CMD = 0.45;                          // 명령이 도착한다
const T_SEEK = 1.05;                         // 팔이 떠난다
const MOVE = 2.85;                           // 굵은 이동
const T_MOVE = T_SEEK + MOVE;                // 3.90
const T_ARRIVE = T_MOVE + SETTLE.duration;   // 6.18 — 정착이 끝난 자리
const T_READ = T_ARRIVE + HALF;              // 11.18 — 반 바퀴 뒤
const T_WIDE = T_READ + 0.37;

const MS_MOVE = msOf(MOVE);                  // 2.4 ms
const MS_SETTLE = msOf(SETTLE.duration);     // 1.9 ms
const MS_SEEK = msOf(T_ARRIVE - T_SEEK);     // 4.3 ms

// ── 팔 ────────────────────────────────────────────────────────
// 굵은 이동의 속도 프로파일. 세게 가속하고, 타성으로 가고, 세게 제동한다.
// 사다리꼴의 넓이가 1 이 되도록 나눠 두면 위치가 곧바로 나온다.
const ACC = 0.26, DEC = 0.30;
const PK = 1 - (ACC + DEC) / 2;

function moveProfile(p) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  if (p < ACC) return (p * p / (2 * ACC)) / PK;
  if (p < 1 - DEC) return (ACC / 2 + (p - ACC)) / PK;
  const rest = 1 - p;
  return (ACC / 2 + (1 - DEC - ACC) + (DEC * DEC - rest * rest) / (2 * DEC)) / PK;
}

// 헤드가 앉은 트랙 반지름. 이동은 목표를 지나쳐서 끝나고, 거기서부터 스프링이
// 목표를 중심으로 울며 잦아든다. 그림에서는 진폭을 크게 잡았다 — 실제
// 오버슈트는 트랙 폭 수준이라 이 배율에서는 한 점이 된다.
function armRadius(t) {
  if (t <= T_SEEK) return R_FROM;
  if (t < T_MOVE) return mix(R_FROM, R_OVER, moveProfile(span(t, T_SEEK, T_MOVE)));
  if (t < T_ARRIVE) return mix(R_OVER, R_TO, SETTLE.ease(span(t, T_MOVE, T_ARRIVE)));
  return R_TO;
}

function armAngle(t) { return angleFor(armRadius(t)); }

// 내려앉은 뒤의 헤드. 이 점이 이 장의 정지점이다.
const HEAD_END = headAt(angleFor(R_TO));
const HEAD_ANG = Math.atan2(HEAD_END[2] - DZ, HEAD_END[0] - DX);

// 목표 섹터의 위상. 팔이 내려앉는 순간 헤드의 정반대에 오도록 거꾸로 잡는다.
// 우연히 발밑에 와 있게 두면 이 장이 할 말이 없어진다. 반 바퀴가 평균이다.
const SECTOR0 = HEAD_ANG + Math.PI - OMEGA * T_ARRIVE;
const SEC_W = 0.07;                 // 그림에서의 섹터 폭. 실제 4 KiB 섹터는 약 1°

function spinAt(t) { return OMEGA * t; }
function sectorAt(t) { return SECTOR0 + OMEGA * t; }

// 헤드까지 남은 각도. 내려앉는 순간 π, 읽는 순간 0.
function remainAt(t) {
  const d = HEAD_ANG - sectorAt(t);
  return ((d % TAU) + TAU) % TAU;
}

// ── 상자 ──────────────────────────────────────────────────────
const WIDE_BOX = { x0: -186, y0: -6, z0: 14, x1: 22, y1: 42, z1: 162 };

export default {
  id: 's11',
  no: '11',
  title: 'THE WAIT',
  kr: '4.17밀리초',
  line: '탐색이 0이어도 반 바퀴는 남는다.',
  nums: [
    '7200 rpm · 한 바퀴 ' + MS_REV.toFixed(2) + ' ms',
    '회전 지연 평균 ' + MS_HALF.toFixed(2) + ' ms = 반 바퀴',
    MS_HALF.toFixed(2) + ' ms = ' + commas(CYC_HALF) + ' 클럭',
    '평균 탐색 4–9 ms · 절반이 정착',
    '무작위 100 IOPS · 순차 200 MB/s'
  ],
  dur: DUR,
  keyT: 8.6,

  camAt(t) {
    // 플래터 바로 위로 내려앉는다. dolly 를 크게 올려 원근을 빼야 트랙이
    // 동심원으로 읽히고, 그래야 '반대편'이 눈으로 재진다.
    const drop = inOut3(span(t, 0.10, 1.55));
    const wide = out3(span(t, T_WIDE, T_WIDE + 0.75));
    const near = lerpBox(BOX.disk, BOX.platter, drop);
    return {
      focus: lerpBox(near, WIDE_BOX, wide),
      yaw: mix(mix(HOME.yaw, -0.28, drop), -0.58, wide),
      pitch: mix(mix(0.46, 1.26, drop), 0.76, wide),
      dolly: mix(mix(700, 2100, drop), 1150, wide),
      flatten: mix(mix(0, 0.50, drop), 0.16, wide),
      fill: mix(mix(0.80, 0.70, drop), 0.66, wide)
    };
  },

  render(t, env) {
    const q = env.quality;

    drawMachine(t, {
      quality: q,
      focus: ['disk'],
      wires: 0.35,
      // 케이블 위의 비트는 읽고 난 뒤에만. 기다리는 동안 이 선은 비어 있다.
      signals: span(t, T_READ + 0.35, T_READ + 0.8) * 0.45,
      busOnly: ['SATA'],
      busLabels: false,
      // 화면 속 회전과 카운터가 같은 배율을 쓴다. 여기가 그 한 줄이다.
      spin: spinAt(t),
      arm: armAngle(t)
    });

    drawTrack(t);
    drawSector(t);
    drawHead(t, env);
    drawFarSide(t);
    drawWaitArc(t, env);
    drawSettleTrace(t, env);
    drawRead(t, env);
    drawScale(t, env);
    drawCounters(t);
  }
};

// ── 평면 위의 호 ──────────────────────────────────────────────
function arc(r, a0, a1, alpha, width, seg, dash) {
  let prev = null;
  for (let i = 0; i <= seg; i++) {
    const a = mix(a0, a1, i / seg);
    const p = [DX + Math.cos(a) * r, PLATTER_Y, DZ + Math.sin(a) * r];
    if (prev) R.line(prev, p, alpha, width, 1, dash);
    prev = p;
  }
}

function radial(r0, r1, a, alpha, width) {
  const c = Math.cos(a), s = Math.sin(a);
  R.line([DX + c * r0, PLATTER_Y, DZ + s * r0], [DX + c * r1, PLATTER_Y, DZ + s * r1], alpha, width);
}

// ── 트랙 ──────────────────────────────────────────────────────
// 목표 트랙 하나만 다른 트랙보다 밝게 둔다. 명령이 정하는 것은 각도가 아니라
// 이 원 하나이고, 각도는 그 다음 문제다.
function drawTrack(t, env) {
  const a = span(t, T_CMD, T_CMD + 0.6);
  if (a <= 0.02) return;
  arc(R_TO, 0, TAU, 0.35 * a, 1.2, 48);
  arc(R_FROM, 0, TAU, 0.16 * a, 1, 40);
  const lab = span(t, T_CMD + 0.2, T_CMD + 0.8) * (1 - span(t, T_ARRIVE + 0.2, T_ARRIVE + 0.5) * 0.6);
  if (lab > 0.02) {
    R.text3([DX, PLATTER_Y, DZ - R_TO], '목표 트랙', 8, 0.45 * lab, 0, -8);
  }
}

// ── 목표 섹터 ─────────────────────────────────────────────────
// 플래터에 붙어 함께 돈다. 읽는 순간까지 이것과 서보 마크 말고는 화면에서
// 움직이는 것이 없다.
function drawSector(t) {
  const a = span(t, T_CMD + 0.3, T_CMD + 0.9);
  if (a <= 0.02) return;
  const c = sectorAt(t);
  const hit = pulse(t, T_READ, 0.10, 0.55);
  const k = 0.55 * a + 0.45 * hit;
  arc(R_TO - 2.2, c - SEC_W / 2, c + SEC_W / 2, k, 1.4, 3);
  arc(R_TO + 2.2, c - SEC_W / 2, c + SEC_W / 2, k, 1.4, 3);
  radial(R_TO - 2.2, R_TO + 2.2, c - SEC_W / 2, k, 1.4);
  radial(R_TO - 2.2, R_TO + 2.2, c + SEC_W / 2, k, 1.4);
  const lab = span(t, T_CMD + 0.5, T_CMD + 1.1) * (1 - span(t, T_SEEK + 0.8, T_SEEK + 1.4));
  if (lab > 0.02) {
    R.text3([DX + Math.cos(c) * (R_TO + 9), PLATTER_Y, DZ + Math.sin(c) * (R_TO + 9)],
      '이 섹터', 8, 0.7 * lab, 0, 0);
  }
}

// ── 헤드 ──────────────────────────────────────────────────────
// 액추에이터는 하나다. 팔이 하나 움직이면 네 면의 헤드가 전부 같은 반지름으로
// 함께 옮겨간다. 위아래 플래터 사이에 눈금을 세워 그 말을 그림으로 둔다.
function drawHead(t, env) {
  const h = headAt(armAngle(t));
  const a = span(t, T_CMD, T_CMD + 0.5);
  if (a <= 0.02) return;

  const live = 0.7 * a + 0.3 * span(t, T_ARRIVE - 0.2, T_ARRIVE + 0.2);
  R.line([h[0] - 3, h[1], h[2]], [h[0] + 3, h[1], h[2]], live, 1.4);
  R.line([h[0], h[1], h[2] - 3], [h[0], h[1], h[2] + 3], live, 1.4);

  // 네 면. 아래 플래터 12–14, 위 플래터 20–22 — diskFaces 가 쌓은 그대로다.
  if (env.quality > 0) {
    const st = span(t, T_SEEK - 0.2, T_SEEK + 0.3) * 0.8;
    if (st > 0.02) {
      R.line([h[0], 11.5, h[2]], [h[0], 25.5, h[2]], 0.22 * st, 1);
      const S = [12, 14, 20, 22];
      for (let i = 0; i < S.length; i++) {
        R.line([h[0] - 2, S[i], h[2]], [h[0] + 2, S[i], h[2]], 0.28 * st, 1);
      }
    }
  }

  // 기다리는 동안에만 붙는 두 숫자. 실제 3.5인치 플래터 바깥 둘레의 속도다.
  const note = span(t, T_ARRIVE + 0.1, T_ARRIVE + 0.45) * (1 - span(t, T_READ, T_READ + 0.3));
  if (note > 0.02) {
    R.text3(h, '3 nm 떠서', 8, 0.45 * note, 0, -18);
    R.text3(h, '바깥 둘레 36 m/s 가 지나간다', 8, 0.35 * note, 0, -8);
  }
}

// ── 반대편 ────────────────────────────────────────────────────
// 내려앉은 헤드에서 축을 지나 반대편까지. 이 선은 움직이지 않는다 — 움직이는
// 것은 섹터 쪽이고, 그것이 이 장의 전부다.
function drawFarSide(t) {
  const a = span(t, T_ARRIVE, T_ARRIVE + 0.35) * (1 - span(t, T_READ, T_READ + 0.35));
  if (a <= 0.02) return;
  const c = Math.cos(HEAD_ANG), s = Math.sin(HEAD_ANG);
  R.line([DX + c * R_TO, PLATTER_Y, DZ + s * R_TO],
    [DX - c * R_TO, PLATTER_Y, DZ - s * R_TO], 0.28 * a, 1, 1, 2);
  R.text3([DX, PLATTER_Y, DZ], '목표 섹터는 반대편에 있다', 10, 0.85 * a, 0, -14);
  R.text3([DX, PLATTER_Y, DZ], '평균은 반 바퀴다 · 좋으면 0, 나쁘면 한 바퀴', 8, 0.45 * a, 0, -2);
  R.text3([DX, PLATTER_Y, DZ], '탐색이 0이어도 이 시간은 남는다', 8, 0.35 * a, 0, 8);
}

// ── 남은 각도 ─────────────────────────────────────────────────
// 헤드까지 남은 호. π 에서 0 으로 줄어든다. 이 장에서 유일하게 살아 있는 선.
function drawWaitArc(t, env) {
  if (t < T_ARRIVE - 0.1 || t > T_READ) return;
  const a = span(t, T_ARRIVE, T_ARRIVE + 0.25);
  if (a <= 0.02) return;
  const c = sectorAt(t);
  const rem = remainAt(t);
  const seg = Math.max(2, Math.round(rem / TAU * (env.quality === 2 ? 64 : 32)));
  arc(R_TO + 5, c, c + rem, 0.85 * a, 1.4, seg);
  radial(R_TO + 3, R_TO + 7, c, 0.85 * a, 1.4);
  radial(R_TO + 3, R_TO + 7, HEAD_ANG, 0.55 * a, 1.2);
}

// ── 정착 ──────────────────────────────────────────────────────
// 팔이 목표에 닿는 방식. 매끄럽게 도착하지 않고 지나쳤다가 울며 잦아든다.
// 각도의 움직임은 이 배율에서 몇 밀리미터라 눈으로 세기 어려우므로, 반지름을
// 시간에 대해 그대로 펼쳐 둔다. 순수 함수라 지나간 구간을 다시 그려도 같다.
function drawSettleTrace(t, env) {
  const a = span(t, T_MOVE - 0.3, T_MOVE + 0.1) * (1 - span(t, T_READ + 0.2, T_READ + 0.6));
  if (a <= 0.02) return;
  const sa = R.safeArea();
  const w = Math.min(190, (sa.x1 - sa.x0) * 0.30);
  const h = 42;
  const x = sa.x0, y = sa.y1 - h - 26;
  if (w < 90) return;

  const lo = R_TO - 3.4, hi = R_TO + 2.2;
  const mapY = (r) => y + h * (1 - (r - lo) / (hi - lo));

  R.rectS(x, y, w, h, 0.16 * a, 1);
  R.textS(x, y - 9, 'SETTLE', 8, 0.35 * a, 'left');
  R.textS(x + w, y - 9, '≈ ' + (RING_HZ / 1000).toFixed(1) + ' kHz', 8, 0.35 * a, 'right');

  // 목표 트랙. 궤적이 이 선을 여러 번 가로지른다.
  R.lineS(x, mapY(R_TO), x + w, mapY(R_TO), 0.28 * a, 1, 1);

  const N = env.quality === 2 ? 72 : env.quality === 1 ? 44 : 22;
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const tau = mix(T_MOVE, T_ARRIVE, i / N);
    if (tau > t) break;
    const px = x + w * (i / N);
    const py = mapY(clamp(armRadius(tau), lo, hi));
    if (prev) R.lineS(prev[0], prev[1], px, py, 0.55 * a, 1);
    prev = [px, py];
  }

  R.textS(x, y + h + 11,
    '이동 ' + MS_MOVE.toFixed(1) + ' ms · 정착 ' + MS_SETTLE.toFixed(1) + ' ms', 8, 0.35 * a, 'left');
}

// ── 읽기 ──────────────────────────────────────────────────────
// 섹터가 헤드 밑에 온다. 비트는 팔을 타고 축으로, 축에서 커넥터로 나간다.
// CPU 로 곧장 가는 선은 없다 — 여기서 나간 비트는 SATA 를 지나 칩셋까지 간다.
const READ_PATH = [
  [HEAD_END[0], HEAD_END[1], HEAD_END[2]],
  [PIVOT[0], 26, PIVOT[1]],
  [DX + 67, 14, DZ + 42],
  [-20, 0.6, 130]
];
const READ_SEG = [];
let READ_LEN = 0;
for (let i = 0; i < READ_PATH.length - 1; i++) {
  const a = READ_PATH[i], b = READ_PATH[i + 1];
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  READ_SEG.push(d);
  READ_LEN += d;
}

function readPoint(u) {
  let d = READ_LEN * clamp(u, 0, 1);
  for (let i = 0; i < READ_SEG.length; i++) {
    if (d <= READ_SEG[i] || i === READ_SEG.length - 1) {
      const k = READ_SEG[i] === 0 ? 0 : d / READ_SEG[i];
      const a = READ_PATH[i], b = READ_PATH[i + 1];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    d -= READ_SEG[i];
  }
  return READ_PATH[0];
}

function drawRead(t, env) {
  const a = span(t, T_READ, T_READ + 0.2);
  if (a <= 0.02) return;

  const flash = pulse(t, T_READ, 0.08, 0.5);
  if (flash > 0) {
    R.fillY(HEAD_END[0] - 3, HEAD_END[2] - 3, HEAD_END[0] + 3, HEAD_END[2] + 3, PLATTER_Y, 0.7 * flash);
  }

  // 팔을 타고 나가는 선. 축까지는 팔 위, 그 다음은 기판 위다.
  const rev = span(t, T_READ, T_READ + 0.55);
  R.glowLine(READ_PATH[0], READ_PATH[1], 0.85 * a, 1.4, rev);
  const rev2 = span(t, T_READ + 0.35, T_READ + 0.75);
  if (rev2 > 0) {
    R.line(READ_PATH[1], READ_PATH[2], 0.55 * a, 1.2, rev2);
    R.line(READ_PATH[2], READ_PATH[3], 0.45 * a, 1.2, span(t, T_READ + 0.6, T_READ + 0.95));
  }

  // 비트. 자리마다 값이 정해져 있어 되감아도 같은 열이 돌아온다.
  const n = env.quality === 2 ? 11 : env.quality === 1 ? 7 : 4;
  const flow = (t - T_READ) * 0.42;
  for (let i = 0; i < n; i++) {
    const u = flow - i * 0.085;
    if (u <= 0 || u >= 1) continue;
    const p = readPoint(u);
    const v = bit2(i * 7919 + Math.floor(u * 24), 31, 0.45);
    R.text3(p, v ? '1' : '0', 8, (v ? 0.7 : 0.28) * a, 0, -5, 'center', true);
  }

  const lab = span(t, T_READ + 0.25, T_READ + 0.6);
  if (lab > 0.02) {
    R.text3(READ_PATH[0], 'READ', 10, 0.85 * lab, 0, 14);
    // 4 KiB 를 200 MB/s 로 옮기면 20.5 µs. 기다린 시간의 400분의 1이다.
    R.text3(READ_PATH[0], '4 KiB 전송 20 µs', 8, 0.45 * lab, 0, 26);
    R.text3(READ_PATH[0], '기다린 시간의 400분의 1', 8, 0.35 * lab, 0, 36);
  }
}

// ── 배율 ──────────────────────────────────────────────────────
// 화면이 몇 배 느린지 적어 두지 않으면 카운터가 검산되지 않는다.
function drawScale(t, env) {
  const a = span(t, 0.3, 1.0);
  if (a <= 0.02) return;
  const sa = R.safeArea();
  const x = sa.x0, y = sa.y0;
  const marks = env.quality === 2 ? 60 : env.quality === 1 ? 30 : 15;

  R.textS(x, y, '화면 속도  실제의 1/' + commas(SLOW), 9, 0.55 * a, 'left');
  R.lineS(x, y + 11, x + 168, y + 11, 0.22 * a, 1);
  R.textS(x, y + 22, '7200 rpm · 한 바퀴 ' + MS_REV.toFixed(2) + ' ms', 8, 0.35 * a, 'left');
  R.textS(x, y + 35, '화면에서 한 바퀴 ' + SEC_REV.toFixed(1) + ' 초', 8, 0.35 * a, 'left');
  R.textS(x, y + 48, '서보 마크 회전당 100–400 · 화면엔 ' + marks, 8, 0.28 * a, 'left');
  const sec = span(t, T_CMD + 0.6, T_CMD + 1.2);
  if (sec > 0.02) {
    R.textS(x, y + 61, '4 KiB 섹터는 트랙의 약 1° · 여기선 4°', 8, 0.28 * a * sec, 'left');
  }
}

// ── 카운터 ────────────────────────────────────────────────────
// 내려앉은 순간에 0에서 출발해 읽는 순간에 멈춘다. 재는 것은 회전 지연
// 하나뿐이다 — 탐색까지 더한 값을 여기 얹으면 한 바퀴어치 숫자처럼 읽힌다.
function drawCounters(t) {
  const a = span(t, T_ARRIVE - 0.15, T_ARRIVE + 0.25);
  if (a <= 0.02) return;
  const sa = R.safeArea();
  const x = sa.x1, y = sa.y0 + 8;

  const el = clamp(t - T_ARRIVE, 0, HALF);
  const ms = msOf(el);
  // 십분의 일 밀리초 자리가 초당 여덟 번 넘어간다. 사람이 따라 셀 수 있는
  // 가장 아래 자리라서 이 배율을 골랐다.
  const cyc = Math.round(cycOf(ms) / 1000) * 1000;

  R.textS(x, y, '회전 지연 · 반 바퀴', 8, 0.35 * a, 'right');
  R.textS(x, y + 16, ms.toFixed(2) + ' ms', 12, 1.0 * a, 'right', 'middle', 500);
  R.textS(x, y + 36, '같은 시간 동안 CPU 클럭 @ ' + GHZ + ' GHz', 8, 0.35 * a, 'right');
  R.textS(x, y + 52, commas(cyc), 12, 0.85 * a, 'right', 'middle', 500);
  R.lineS(x - 190, y + 66, x, y + 66, 0.22 * a, 1);
  R.textS(x, y + 76, MS_REV.toFixed(2) + ' ms ÷ 2 = ' + MS_HALF.toFixed(2) + ' ms', 8, 0.28 * a, 'right');

  // 탐색은 따로 적는다. 굵은 이동과 정착이 거의 같은 값이라는 것이 요점이다.
  const sk = span(t, T_ARRIVE + 0.1, T_ARRIVE + 0.5);
  if (sk > 0.02) {
    R.textS(x, y + 90, '탐색 ' + MS_SEEK.toFixed(1) + ' ms · 이동 '
      + MS_MOVE.toFixed(1) + ' + 정착 ' + MS_SETTLE.toFixed(1), 8, 0.35 * a * sk, 'right');
  }
  const io = span(t, T_READ + 0.5, T_READ + 1.0);
  if (io > 0.02) {
    R.textS(x, y + 104, '이 한 번에 ' + (MS_SEEK + MS_HALF).toFixed(1)
      + ' ms · 무작위 초당 100회', 8, 0.45 * a * io, 'right');
  }
}
