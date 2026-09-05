// 09 · INSIDE THE BANK — 읽으면 지워진다
//
// DRAM 의 한 비트는 래치가 아니라 트랜지스터 하나와 커패시터 하나다. 그래서
// 한 행을 읽는 일이 곧 그 행을 지우는 일이다. 전하는 비트선을 타고 아래로
// 빠져나가고, 어레이 밑을 가로지르는 감지증폭기 띠가 그 행의 유일한 사본이
// 된다. 화면 위쪽 어레이가 텅 비는 것은 그림의 실수가 아니라 이 장의 전부다.
//
// 그러므로 프리차지는 닫는 동작이 아니라 되써 넣는 동작이고, 리프레시는
// 선택이 아니라 의무다. 아무도 읽지 않아도 32 ms 안에 모든 행을 한 번씩
// 다시 써야 한다. 이 장의 마지막 몫은 사람이 시킨 일이 아니다.

import * as R from '../core/raster.js';
import { span, mix, clamp } from '../core/timeline.js';
import { out2, out3, inOut3 } from '../core/ease.js';
import { bit2, pick2 } from '../core/hash.js';
import { drawMachine, lerpBox, HOME } from './common.js';
import { BOX, MX, MZ, MEM_CHIP_Z } from '../geom/parts.js';
import { rectX } from '../geom/detail.js';

const DUR = 12;

// ── 컷어웨이의 자리 ───────────────────────────────────────────
// DIMM 0 의 앞면(-x 쪽)에 얹는다. memDetail 이 칩 앞면 x = MX[0]-4.35 에
// 셀 격자를 그리고 있으므로, 그보다 1mm 앞에 두어야 서로 뚫지 않는다.
// -x 가 카메라 쪽이라는 것은 이 장의 yaw 에서 나온다.
const FX = MX[0] - 5.4;

// 뱅크 어레이. z 가 가로, y 가 세로다. 기판 안쪽(z -125..25, y 6..58)을
// 넘지 않아야 컷어웨이가 부품 밖으로 삐져나가지 않는다.
const BZ0 = -118, BZ1 = 16;
const BY0 = 28, BY1 = 55;

// 씨앗. memDetail 이 셋째 칩 앞면에 이미 그려 둔 gridX 바로 그 자리다.
// 없던 것을 새로 띄우는 대신, 이미 화면에 있던 격자를 키운다.
const SEED_Z0 = MEM_CHIP_Z[2] - 11, SEED_Z1 = MEM_CHIP_Z[2] + 11;
const SEED_Y0 = 25, SEED_Y1 = 43;

// 감지증폭기 띠. 어레이 바로 아래 한 줄.
const SA0 = 21, SA1 = 25.5;

// 바깥으로 나가는 길. DQ 레일과 그 아래 클럭 사각파.
const DQY = 17;
const CKY = 10, CKA = 2.4;

// 여는 행. 위에서 셋째 줄이면 떨어질 거리가 어레이 높이만큼 남는다.
const ROW = 2;

// ── 시각 ──────────────────────────────────────────────────────
const T_GROW0 = 1.15, T_GROW1 = 2.50;     // 격자가 씨앗에서 뱅크로 자란다
const T_ACT0 = 2.70, T_ACT1 = 3.40;       // 워드선이 뱅크 폭을 건넌다
const T_FALL = 3.45, T_FALLD = 0.90;      // 행이 통째로 내려앉는다
const T_RD = 5.60;                        // 열 포인터가 한 조각을 꺼낸다
const T_PRE = 7.80;                       // 같은 길로 되써 넣는다
const T_OUT0 = 8.90, T_OUT1 = 10.20;      // 세 장을 다시 담는다
const T_REF = 9.80;                       // 리프레시

// 화면 왼쪽 위에 하나씩 뜨는 명령 이름. 이 장은 네 개의 명령이 전부다.
const ACTS = [
  { at: T_ACT0, s: 'ACT', kr: '행을 연다' },
  { at: T_RD, s: 'RD', kr: '한 열을 꺼낸다' },
  { at: T_PRE, s: 'PRE', kr: '되써 넣고 닫는다' },
  { at: T_REF + 0.1, s: 'REF', kr: '아무도 읽지 않아도' }
];

// 품질에 따라 줄 수만 줄인다. 시각은 건드리지 않는다.
function dims(q) {
  if (q === 2) return { nc: 32, nr: 10, dotc: 16 };
  if (q === 1) return { nc: 20, nr: 8, dotc: 10 };
  return { nc: 12, nr: 6, dotc: 0 };
}

// 자라는 중의 어레이 사각형.
function bankRect(t) {
  const e = inOut3(span(t, T_GROW0, T_GROW1));
  return {
    e,
    z0: mix(SEED_Z0, BZ0, e), z1: mix(SEED_Z1, BZ1, e),
    y0: mix(SEED_Y0, BY0, e), y1: mix(SEED_Y1, BY1, e)
  };
}

function colZ(r, j, nc) { return r.z0 + (r.z1 - r.z0) * (j + 0.5) / nc; }
function rowY(r, i, nr) { return r.y1 - (r.y1 - r.y0) * (i + 0.5) / nr; }

// 비트선 하나가 태어나는 시각. 씨앗이 있던 가운데에서 바깥으로 퍼진다.
function colBirth(t, j, nc) {
  const c = (nc - 1) / 2;
  const d = c > 0 ? Math.abs(j - c) / c * 0.55 : 0;
  return span(t, T_GROW0 + d, T_GROW0 + 0.7 + d);
}

// 활성 행의 전하가 아직 어레이에 남아 있는 정도. 읽는 동안은 0 이다 —
// 그 사이 그 행은 어레이에 없다. 이 한 값이 장면의 논거다.
function rowHeld(t) {
  return clamp(1 - span(t, 3.50, 3.85) + span(t, 8.35, 8.85), 0, 1);
}

// 띠가 그 행을 들고 있는 정도.
function stripLit(t) {
  return span(t, 4.50, 4.90) * (1 - span(t, 7.75, 8.05));
}

// 컷어웨이가 접히는 정도. 세 장을 다시 담으러 물러설 때 사라진다.
function folded(t) { return span(t, 9.30, 10.10); }

export default {
  id: 's09',
  no: '09',
  title: 'INSIDE THE BANK',
  kr: '읽으면 지워진다',
  line: '한 행을 읽는 일이 그 행을 지우는 일이다.',
  nums: [
    'tCK 0.333 ns · DDR5-6000',
    '행 히트 CL 40 = 13.3 ns',
    '행 미스 120 tCK ≈ 40 ns',
    'BL16 × 32비트 = 64 B',
    'REF 3.9 µs · tRFC 295 ns'
  ],
  dur: DUR,
  keyT: 5.1,

  camAt(t) {
    // DIMM 0 의 앞면으로 거의 정면에서 내려앉는다. yaw 를 -π/2 가까이 두면
    // -x 면이 화면과 나란해져 z 가 가로, y 가 세로가 된다. 그래야 행이
    // 가로줄로 읽히고, 낙하가 세로 방향으로 읽힌다. 그 둘이 맞아야
    // 이 장의 몸짓이 몸짓으로 보인다.
    const inP = inOut3(span(t, 0.15, 1.90));
    const outP = inOut3(span(t, T_OUT0, T_OUT1));
    const near = { x0: FX - 8, y0: 3, z0: BZ0 - 20, x1: FX + 8, y1: 58, z1: BZ1 + 12 };
    const wide = { x0: MX[0] - 26, y0: -6, z0: MZ - 116, x1: MX[2] + 26, y1: 74, z1: MZ + 116 };
    return {
      focus: lerpBox(lerpBox(BOX.mem, near, inP), wide, outP),
      yaw: mix(mix(HOME.yaw, -1.46, inP), -1.02, outP),
      pitch: mix(mix(HOME.pitch, 0.06, inP), 0.34, outP),
      // 붙는 순간 원근을 빼야 도면이 도면으로 앉는다.
      dolly: mix(mix(HOME.dolly, 2400, inP), 1150, outP),
      flatten: mix(mix(0, 0.70, inP), 0.30, outP),
      fill: mix(0.86, 0.90, inP)
    };
  },

  render(t, env) {
    const q = env.quality;
    const d = dims(q);
    const wide = span(t, T_OUT0, T_OUT1 - 0.2);

    drawMachine(t, {
      quality: q,
      focus: ['mem0', 'mem1', 'mem2'],
      wires: mix(0.30, 0.80, wide),
      // 붙어 있는 동안 DDR 위의 비트는 끈다. 이 장에서 밝은 것은 떨어지는
      // 행 하나뿐이어야 한다.
      signals: wide * 0.45,
      busOnly: ['DDR'],
      busLabels: false,
      cpu: { labels: false },
      mem: [
        { activity: wide * (0.5 + 0.5 * Math.sin(t * 2.7)) },
        { activity: wide * (0.5 + 0.5 * Math.sin(t * 3.3 + 1.1)) },
        { activity: wide * (0.5 + 0.5 * Math.sin(t * 2.2 + 2.4)) }
      ]
    });

    drawArray(t, d);
    drawStrip(t, d);
    drawFall(t, d);
    drawColumn(t, d);
    drawBurst(t, d, q);
    drawRuler(t);
    drawRefresh(t, q);
    drawActs(t);
  }
};

// ── 어레이 ────────────────────────────────────────────────────
// 칩 앞면의 셀 격자가 자라 뱅크 하나가 된다. 격자선은 구조이므로 끝까지
// 0.16 아래에 머문다. 여기가 밝아지면 떨어지는 행이 묻힌다.
function drawArray(t, d) {
  const r = bankRect(t);
  const k = 1 - folded(t);
  if (r.e <= 0 || k <= 0.02) return;

  rectX(r.z0, r.y0, r.z1, r.y1, FX, 0.28 * k, 1);

  for (let j = 1; j < d.nc; j++) {                      // 비트선
    const b = colBirth(t, j, d.nc);
    if (b <= 0) continue;
    const z = r.z0 + (r.z1 - r.z0) * j / d.nc;
    R.line([FX, r.y0, z], [FX, r.y1, z], 0.12 * k * b);
  }
  for (let i = 1; i < d.nr; i++) {                      // 워드선
    const y = r.y0 + (r.y1 - r.y0) * i / d.nr;
    R.line([FX, y, r.z0], [FX, y, r.z1], 0.12 * k * r.e);
  }

  // 셀. 짧은 눈금 하나가 커패시터 하나에 담긴 전하다. 활성 행만은 읽는
  // 동안 여기에 없다. 눈금을 지우지 않고 흐리게만 두면 주장이 무너진다.
  if (d.dotc > 0 && r.e > 0.55) {
    const held = rowHeld(t);
    for (let j = 0; j < d.dotc; j++) {
      const z = colZ(r, j * 2, d.nc);
      for (let i = 0; i < d.nr; i++) {
        const a = (i === ROW ? held : 1) * 0.12 * k * r.e;
        if (a <= 0.03) continue;
        const y = rowY(r, i, d.nr);
        R.line([FX, y, z - 0.9], [FX, y, z + 0.9], a);
      }
    }
  }

  drawWordLine(t, r, d, k);
  drawArrayLabels(t, r, k);
}

// 워드선 하나. 행 디코더에서 나와 뱅크 폭을 건넌다. 이 선이 서는 것이
// ACT 의 전부이고, 이 선이 서는 순간 그 행의 운명이 정해진다.
function drawWordLine(t, r, d, k) {
  const rev = span(t, T_ACT0, T_ACT1);
  if (rev <= 0) return;
  const a = 0.70 * k * (1 - span(t, 8.60, 9.00));
  if (a <= 0.02) return;
  const y = rowY(r, ROW, d.nr);
  R.glowLine([FX, y, r.z0 - 9], [FX, y, r.z1], a, 1.4, rev);

  // 행 디코더. 고른 행 하나만 밝다. 나머지는 눈금이다.
  for (let i = 0; i < d.nr; i++) {
    const yy = rowY(r, i, d.nr);
    R.line([FX, yy, r.z0 - 9], [FX, yy, r.z0 - 4], (i === ROW ? 0.55 : 0.12) * k * rev);
  }
  if (rev > 0.9) R.text3([FX, y, r.z0 - 10], 'ROW', 7, 0.35 * a, -3, 0, 'right');
}

function drawArrayLabels(t, r, k) {
  // 한 비트가 무엇으로 되어 있는지를 먼저 못박는다. 래치가 아니라는 말을
  // 하지 않으면 뒤의 낙하가 그냥 연출로 보인다.
  const seed = span(t, T_GROW0 + 0.35, T_GROW0 + 0.90) * (1 - span(t, 3.20, 3.70));
  if (seed > 0.02) {
    R.text3([FX, r.y1, r.z0], '한 비트 = 트랜지스터 1 + 커패시터 1', 8, 0.45 * seed * k, 0, -11, 'left');
    R.text3([FX, r.y1, r.z1], 'BANK', 8, 0.35 * seed * k, 0, -11, 'right');
  }

  // 어레이가 비어 있는 그 순간에만, 비어 있는 바로 그 자리에 놓는다.
  const claim = span(t, 4.95, 5.35) * (1 - span(t, 6.30, 6.80));
  if (claim > 0.02) {
    const cy = (r.y0 + r.y1) / 2 + 3;
    const cz = (r.z0 + r.z1) / 2;
    R.text3([FX, cy, cz], '읽으면 지워진다', 12, 0.85 * claim * k, 0, 0);
    R.text3([FX, cy, cz], '어레이는 비었다. 이게 맞다.', 9, 0.45 * claim * k, 0, 17);
  }
}

// ── 감지증폭기 띠 ─────────────────────────────────────────────
// 어레이 아래를 가로지르는 한 줄. 행이 내려앉는 동안 이것이 그 행의 유일한
// 사본이다. 그래서 이 띠만 화면에서 사다리 위쪽 단을 쓴다.
function drawStrip(t, d) {
  const born = span(t, 2.55, 3.20);
  const k = born * (1 - folded(t));
  if (k <= 0.02) return;
  const r = bankRect(t);
  const lit = stripLit(t);
  // 붙잡고 있는 동안이 가장 밝고, 열을 꺼내기 시작하면 한 단 내린다.
  const peak = lit * (1 - 0.25 * span(t, 5.50, 5.90));

  rectX(r.z0, SA0, r.z1, SA1, FX, mix(0.22, 0.45, lit) * k, 1);

  for (let j = 0; j < d.nc; j++) {
    const z = colZ(r, j, d.nc);
    const v = bit2(j, 7, 0.5);
    const a = mix(0.12, v ? 0.85 : 0.35, peak) * k;
    R.line([FX, SA0 + 0.9, z], [FX, SA1 - 0.9, z], a, v && peak > 0.5 ? 1.4 : 1);
  }

  if (lit > 0.35) {
    R.text3([FX, SA1, r.z0 + 3], '감지증폭기 — 지금 이 행의 유일한 사본', 8, 0.55 * lit * k, 0, -8, 'left');
  }
}

// ── 낙하 ──────────────────────────────────────────────────────
// 이 장의 몸짓. 행 전체가 아래로 빠져나가고, 프리차지에서 같은 길로 되돌아
// 올라간다. 두 방향이 서로 다른 두 동작이 아니라 한 동작의 앞뒤라는 것을
// 보이려고, 표식도 경로도 그대로 되쓴다. 내려갈 때 쓴 그림을 올라갈 때
// 다시 그리는 것이 아니라, 같은 진행도 하나를 빼는 것으로 만든다.
function drawFall(t, d) {
  const k = 1 - folded(t);
  if (k <= 0.02) return;
  const mk = 1 - stripLit(t);          // 띠가 들고 있는 동안은 하늘에 아무것도 없다
  if (mk <= 0.02) return;

  const r = bankRect(t);
  const y0 = rowY(r, ROW, d.nr);
  const yS = (SA0 + SA1) / 2;

  for (let j = 0; j < d.nc; j++) {
    // 워드선이 디코더 쪽에서부터 서므로 열마다 아주 조금 어긋나 떨어진다.
    // 한 줄로 딱 떨어지면 선 하나가 통째로 미끄러지는 것으로 읽힌다.
    const dly = (j / d.nc) * 0.22;
    const down = out2(span(t, T_FALL + dly, T_FALL + T_FALLD + dly));
    const up = inOut3(span(t, T_PRE + 0.10 + dly * 0.5, T_PRE + 0.90 + dly * 0.5));
    const p = clamp(down - up, 0, 1);
    if (p <= 0.004) continue;

    const z = colZ(r, j, d.nc);
    const y = mix(y0, yS, p);
    R.line([FX, y - 1.1, z], [FX, y + 1.1, z], 0.85 * mk * k, 1.4);
    // 비트선 위에 남는 자국. 전하가 지나온 길이지 새로 그은 선이 아니다.
    if (p < 0.99) R.line([FX, y0, z], [FX, y, z], 0.16 * mk * k);
  }
}

// ── 열 고르기 ─────────────────────────────────────────────────
// 열 포인터가 띠를 훑다가 한 자리에 멈추고, 그 한 조각만 아래로 뽑는다.
// 어레이에는 손을 대지 않는다 — 댈 것이 남아 있지 않다.
function drawColumn(t, d) {
  const on = span(t, T_RD, T_RD + 0.25) * (1 - span(t, 7.60, 7.95)) * (1 - folded(t));
  if (on <= 0.02) return;
  const r = bankRect(t);
  const sel = Math.floor(d.nc * 0.63);
  const zSel = colZ(r, sel, d.nc);
  const z = mix(r.z0 + 3, zSel, out3(span(t, T_RD + 0.05, T_RD + 0.85)));

  R.glowLine([FX, SA0 - 3, z], [FX, SA1 + 1.5, z], 0.70 * on, 1.4);
  R.text3([FX, SA0 - 3, z], 'COL', 7, 0.45 * on, 0, 10);

  const lift = span(t, T_RD + 0.80, T_RD + 1.15);
  if (lift > 0) R.glowLine([FX, SA0, zSel], [FX, DQY, zSel], 0.70 * on, 1.4, lift);
}

// ── 버스트 ────────────────────────────────────────────────────
// DQ 레일 아래에 클럭 사각파를 깔고, 글자를 상승 모서리와 하강 모서리에
// 하나씩 얹는다. 한 주기에 둘 — double data rate 이 말 그대로 그것이다.
// 여덟 주기 × 두 번 = 열여섯 번, 한 번에 32비트, 합쳐서 64 B. 캐시 라인
// 하나가 이 한 장면 안에 정확히 들어간다.
function drawBurst(t, d, q) {
  const on = span(t, T_RD + 0.90, T_RD + 1.20) * (1 - span(t, 8.30, 8.80)) * (1 - folded(t));
  if (on <= 0.02) return;
  const r = bankRect(t);
  const z0 = r.z0 + 6, z1 = r.z1 - 4;
  const P = (z1 - z0) / 8;                    // 여덟 클럭 주기

  R.line([FX, DQY, z0], [FX, DQY, z1], 0.28 * on);
  R.text3([FX, DQY, z0], 'DQ ×32', 7, 0.42 * on, -5, 0, 'right');

  // 클럭. 반주기마다 준위가 뒤집힌다. 모서리를 세로선으로 분명히 그어야
  // 글자가 '모서리 위에' 있다는 말이 그림이 된다.
  for (let k = 0; k <= 16; k++) {
    const zz = z0 + k * (P / 2);
    const hi = (k % 2 === 0) ? CKY + CKA : CKY - CKA;
    const lo = (k % 2 === 0) ? CKY - CKA : CKY + CKA;
    R.line([FX, lo, zz], [FX, hi, zz], 0.28 * on);
    if (k < 16) R.line([FX, hi, zz], [FX, hi, zz + P / 2], 0.28 * on);
  }

  for (let k = 0; k < 16; k++) {
    const b = span(t, T_RD + 1.15 + k * 0.045, T_RD + 1.25 + k * 0.045);
    if (b <= 0) continue;
    const zz = z0 + k * (P / 2);
    const v = bit2(k, 21, 0.5);
    R.text3([FX, DQY, zz], v ? '1' : '0', 8, (v ? 0.70 : 0.28) * b * on, 0, -6, 'center', true);
    if (q >= 1) R.line([FX, CKY + CKA, zz], [FX, DQY - 1.4, zz], 0.16 * b * on, 1, 1, 2);
  }

  const lab = span(t, T_RD + 1.75, T_RD + 2.00);
  if (lab > 0.02) {
    const mid = (z0 + z1) / 2;
    R.text3([FX, CKY - CKA, mid], '한 클럭 주기에 두 번 — DDR', 8, 0.45 * lab * on, 0, 13);
    R.text3([FX, CKY - CKA, mid], 'BL16 × 32비트 서브채널 = 64 B', 9, 0.70 * lab * on, 0, 26);
  }
}

// ── 타이밍 자 ─────────────────────────────────────────────────
// 위가 행 미스, 아래가 행 히트. 두 막대를 같은 왼쪽 끝에서 시작한다 —
// 길이 차이가 곧 답이기 때문이다. 세 값을 매 접근마다 다 무는 것이
// 아니라는 말은, 이렇게 두 막대를 나란히 두는 것으로 한 번만 하면 된다.
function drawRuler(t) {
  const a = span(t, T_RD + 1.00, T_RD + 1.40) * (1 - span(t, 8.90, 9.50));
  if (a <= 0.02) return;
  const sa = R.safeArea();
  const w = Math.min(292, (sa.x1 - sa.x0) * 0.42);
  const u = w / 120;                          // 120 tCK 가 막대 전체
  const x = sa.x0;
  const y = sa.y1 - 84;

  R.textS(x, y - 20, 'tCK 0.333 ns  ·  DDR5-6000', 8, 0.35 * a, 'left');

  const mA = span(t, T_RD + 1.25, T_RD + 1.75) * a;
  if (mA > 0.02) {
    const bands = [['tRP', 40], ['tRCD', 40], ['CL', 40]];
    let at = 0;
    for (let i = 0; i < bands.length; i++) {
      const x0 = x + at * u, x1 = x + (at + bands[i][1]) * u;
      R.lineS(x0, y, x1, y, 0.45 * mA, 1.5);
      R.lineS(x0, y - 4, x0, y + 4, 0.28 * mA, 1);
      R.textS((x0 + x1) / 2, y - 10, bands[i][0] + ' ' + bands[i][1], 8, 0.35 * mA, 'center');
      at += bands[i][1];
    }
    R.lineS(x + w, y - 4, x + w, y + 4, 0.28 * mA, 1);
    R.textS(x, y + 14, '행 미스 — 120 tCK · 40 ns', 9, 0.45 * mA, 'left');
  }

  const hA = span(t, T_RD + 2.10, T_RD + 2.60) * a;
  if (hA > 0.02) {
    const y2 = y + 40;
    R.lineS(x, y2, x + 40 * u, y2, 0.55 * hA, 1.5);
    R.lineS(x, y2 - 4, x, y2 + 4, 0.28 * hA, 1);
    R.lineS(x + 40 * u, y2 - 4, x + 40 * u, y2 + 4, 0.28 * hA, 1);
    R.textS(x + 20 * u, y2 - 10, 'CL 40', 8, 0.35 * hA, 'center');
    R.textS(x, y2 + 14, '행 히트 — 40 tCK · 13.3 ns', 9, 0.55 * hA, 'left');
    R.textS(x, y2 + 29, '열려 있는 행을 다시 읽으면 CL 만 문다', 8, 0.35 * hA, 'left');
  }
}

// ── 리프레시 ──────────────────────────────────────────────────
// 세 장을 다시 담고, 뱅크 하나씩 잠깐 쓸 수 없게 만든다. 회색으로 덮인
// 동안 그 뱅크는 어떤 요청도 받지 않는다. 화면의 박자는 사람이 볼 수 있게
// 늦춘 것이고, 실제 간격은 3.9 µs 다.
function drawRefresh(t, q) {
  const on = span(t, T_REF, T_REF + 0.50);
  if (on <= 0.02) return;

  const rate = 2.9;
  for (let m = 0; m < 3; m++) {
    const raw = t * rate + m * 0.41;
    const phase = raw % 1;
    if (phase > 0.42) continue;
    const i = pick2(m * 31 + Math.floor(raw), 5, MEM_CHIP_Z.length);
    const z = MEM_CHIP_Z[i];
    const px = MX[m] - 4.6;
    const a = on * (1 - span(phase, 0.28, 0.42));
    if (a <= 0.03) continue;
    R.fillPoly([[px, 24, z - 12], [px, 24, z + 12], [px, 44, z + 12], [px, 44, z - 12]], 0.16 * a);
    rectX(z - 12, 24, z + 12, 44, px, 0.45 * a, 1.2);
    if (q >= 1) R.text3([px, 44, z], 'REF', 7, 0.55 * a, 0, -8);
  }

  drawTally(t, on);
}

// 기억만 하는 시간의 몫. 32 ms 안에 REF 명령 8,192 회, 한 번에 tRFC 295 ns.
// 두 숫자를 곱하면 2.42 ms 가 나오고, 그게 32 ms 의 7.6 % 다. 관객이 셋을
// 곱해 검산할 수 있도록 세 숫자를 다 적어 둔다.
function drawTally(t, on) {
  const sa = R.safeArea();
  const x = sa.x1;
  const y = sa.y0 + 22;
  const p = out2(span(t, T_REF + 0.40, T_REF + 1.90));

  R.textS(x, y - 19, '아무도 읽지 않는 동안', 9, 0.35 * on, 'right');
  R.textS(x, y, Math.floor(8192 * p).toLocaleString('en-US') + ' / 8,192 REF', 11, 0.55 * on, 'right', 'middle', 500);
  R.textS(x, y + 16, '3.9 µs 마다 · 32 ms 안에 전 행', 8, 0.35 * on, 'right');

  const bw = Math.min(176, (sa.x1 - sa.x0) * 0.32);
  R.lineS(x - bw, y + 34, x, y + 34, 0.16 * on, 1);
  R.lineS(x - bw, y + 34, x - bw + bw * 0.076 * p, y + 34, 0.85 * on, 2.5);

  const fin = span(t, T_REF + 1.50, T_REF + 1.90);
  if (fin > 0.02) {
    R.textS(x, y + 52, '7.6 %', 12, 0.85 * on * fin, 'right', 'middle', 500);
    R.textS(x - bw, y + 52, 'tRFC 295 ns × 8,192 = 2.42 ms', 8, 0.42 * on * fin, 'left');
  }
}

// ── 명령 이름 ─────────────────────────────────────────────────
// 이 장에 나오는 명령은 넷뿐이다. 하나가 뜨면 앞의 것이 진다.
function drawActs(t) {
  const sa = R.safeArea();
  for (let i = 0; i < ACTS.length; i++) {
    const A = ACTS[i];
    const next = i + 1 < ACTS.length ? ACTS[i + 1].at : DUR + 1;
    const a = span(t, A.at, A.at + 0.30) * (1 - span(t, next - 0.34, next - 0.04));
    if (a <= 0.02) continue;
    R.textS(sa.x0, sa.y0 + 14, A.s, 12, 0.70 * a, 'left', 'middle', 500);
    R.textS(sa.x0, sa.y0 + 31, A.kr, 9, 0.45 * a, 'left');
  }
}
