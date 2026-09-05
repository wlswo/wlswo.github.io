// 10 · THE TRANSLATION — 주소를 옮기다
//
// 프로그램이 부르는 주소는 어디에도 없는 주소다. 48비트를 9|9|9|9|12 로 잘라
// 앞의 네 자리로 표를 네 번 타고 내려가야 비로소 물리 주소가 되고, 낮은 열두
// 비트는 그 사이 한 번도 손대지 않는다. 이 화면에서 처음부터 끝까지 밝기가
// 변하지 않는 것이 그 열두 자리 하나뿐인 이유가 그것이다.
//
// 그리고 이 장은 실패로 끝난다. 마지막 엔트리의 present 가 0 으로 읽히면
// 하드웨어에게는 다음 바닥 주소가 없다. 뒤에 오는 기다림은 연출이 아니라
// 이 한 자리의 결과다. 그래서 계단을 거기서 죽이고, 그 자리에서 끝낸다.

import * as R from '../core/raster.js';
import { span, mix, pulse } from '../core/timeline.js';
import { out3, inOut3 } from '../core/ease.js';
import { bit2 } from '../core/hash.js';
import { drawMachine, lerpBox } from './common.js';
import { CX, CZ, MX, MZ, DIE_Y, coreRect } from '../geom/parts.js';
import { rectY } from '../geom/detail.js';
import { GHZ } from './s07.js';

const DUR = 10;

// ── 시각 ──────────────────────────────────────────────────────
// 홉 사이의 간격이 이 장의 박자다. 네 번이 서로에게 매여 있어서 겹칠 수
// 없다는 것이 논거이므로, 한 홉이 완전히 끝난 뒤에 다음 홉이 시작한다.
const T_IN = 0.15;       // 주소가 화면 위로 들린다
const T_SPLIT = 1.00;    // 세로 규칙이 9|9|9|9|12 로 가른다
const T_LABEL = 1.55;
const T_FAST = 2.30;     // 빠른 길 — TLB 와 L1 을 동시에 본다
const T_MISS = 3.45;     // 빠른 길이 닫힌다
const HOP0 = 4.05;
const HOP_D = 0.86;
const T_FAIL = HOP0 + 4 * HOP_D;   // 7.49 — 마지막 엔트리를 읽고 난 자리
const T_GHOST = 8.30;    // 번역되지 못한 주소가 유령 무게로 내려앉는다

function hopT(i) { return HOP0 + i * HOP_D; }

// ── 값 ────────────────────────────────────────────────────────
// 07장이 못박은 4.5 GHz 에서 곧바로 나온다. 1클럭 222 ps, DRAM 한 번
// 250클럭 = 55.5 ns. 화면에 찍히는 숫자는 전부 이 두 줄에서 계산한다.
const PS_PER_CYCLE = Math.round(1000 / GHZ);        // 222 ps
const NS_DRAM = 250 * PS_PER_CYCLE / 1000;          // 55.5 ns

// ── 주소 ──────────────────────────────────────────────────────
// 왼쪽 칸이 47번 비트다. 칸 색인 i 는 비트 47-i 를 가리킨다.
const FIELDS = [
  { n: 9, key: 'PML4' },
  { n: 9, key: 'PDPT' },
  { n: 9, key: 'PD' },
  { n: 9, key: 'PT' },
  { n: 12, key: 'OFFSET' }
];
const FIELD_AT = [0, 9, 18, 27, 36];

function fieldOf(i) {
  return i < 9 ? 0 : i < 18 ? 1 : i < 27 ? 2 : i < 36 ? 3 : 4;
}

// 비트는 칸 색인에서 뽑는다. 시각의 함수가 아니므로 되감아도 같은 주소가
// 돌아온다. 낮은 열두 칸은 phys 를 아예 보지 않는다 — 번역되지 않는 자리를
// 코드에서라도 흔들 수 있게 두면, 이 장의 주장이 구현에서부터 무너진다.
function bitAt(i, phys) {
  if (i >= 36) return bit2(i, 17, 0.5);
  return bit2(i, phys ? 4093 : 17, 0.5);
}

function fieldValue(f) {
  let v = 0;
  for (let i = 0; i < FIELDS[f].n; i++) v = v * 2 + bitAt(FIELD_AT[f] + i, false);
  return v;
}

// 화면에 찍는 색인은 화면에 찍는 비트에서 곧바로 낸다. 관객이 칸을 세어
// 검산할 수 있어야 한다.
const IDX = [fieldValue(0), fieldValue(1), fieldValue(2), fieldValue(3)];
const OFFSET_HEX = '0x' + fieldValue(4).toString(16).toUpperCase().padStart(3, '0');

// ── TLB 와 L1 ─────────────────────────────────────────────────
// 07·08장이 따라다닌 그 코어다. 그 안에 두 블록을 나란히 둔다. 나란히
// 두는 것 자체가 이 장의 첫 주장이다 — 하나가 다른 하나 뒤에 오지 않는다.
const C0 = coreRect(0, 1);
const TLB_R = { x0: C0.x0 + 1.6, x1: C0.x0 + 10.0, z0: C0.z0 + 2.6, z1: C0.z1 - 2.6 };
const L1_R = { x0: C0.x0 + 11.6, x1: C0.x1 - 1.6, z0: C0.z0 + 2.6, z1: C0.z1 - 2.6 };
const FORK = [C0.x0 - 7, DIE_Y + 15, C0.z0 - 7];

// ── 계단 ──────────────────────────────────────────────────────
// z 를 DDR 축(MZ)에 맞춰 둔다. 표를 읽으러 가는 길과 메모리로 가는 길이 같은
// 평면 위에 있어야 '내려간다'가 거짓이 아니게 된다.
const WALK_Z = MZ;
const ORIGIN = { x: CX + 42, y: 100 };
const TIE_Y = 63;        // 모듈 윗면(58)보다 위. 가로 연결선이 기판을 뚫지 않는다.

// 네 단계의 표는 서로 아무 상관 없는 물리 페이지에 흩어져 있다. 그래서
// 답하는 모듈이 홉마다 바뀌고, 마지막 홉은 앞서 쓴 모듈로 되돌아간다.
const HOPS = [
  { key: 'PML4', x: -16, y: 92, dimm: 1 },
  { key: 'PDPT', x: 20, y: 84, dimm: 2 },
  { key: 'PD', x: 56, y: 76, dimm: 0 },
  { key: 'PT', x: 92, y: 68, dimm: 2 }
];

// ── 상자 ──────────────────────────────────────────────────────
const DIE_BOX = { x0: CX - 48, y0: 8, z0: CZ - 48, x1: CX + 48, y1: 28, z1: CZ + 48 };
const TLB_BOX = { x0: CX - 38, y0: 14, z0: CZ - 28, x1: CX + 6, y1: 26, z1: CZ + 6 };
const WALK_BOX = { x0: -170, y0: 0, z0: -128, x1: 130, y1: 112, z1: 26 };
const HOLD_BOX = { x0: -186, y0: -6, z0: -144, x1: 148, y1: 120, z1: 38 };

export default {
  id: 's10',
  no: '10',
  title: 'THE TRANSLATION',
  kr: '주소를 옮기다',
  line: '아래 열두 비트는 끝까지 번역되지 않는다.',
  nums: [
    '48비트 VA = 9|9|9|9|12',
    '4 KiB 페이지 · 4단 워크',
    'TLB 적중 0클럭 · 실패 4회 종속',
    'dTLB 64–96 · L2 TLB 2048',
    'present = 0 → 페이지 폴트'
  ],
  dur: DUR,
  keyT: 8.35,

  camAt(t) {
    // 빠른 길은 코어 안에서 끝난다. 그래서 다이에 붙었다가 TLB 로 더 밀어
    // 들어가고, 워크가 열리면 DIMM 까지 담으려고 크게 물러난다. 물러날 때
    // dolly 를 함께 올려 계단이 계단으로 읽히게 한다 — 원근이 남아 있으면
    // 네 칸의 높이가 서로 다른 것처럼 보인다.
    const inA = inOut3(span(t, 0.55, 2.05));
    const outA = inOut3(span(t, T_MISS - 0.1, T_MISS + 1.65));
    const tail = inOut3(span(t, 7.3, 9.3));
    const near = lerpBox(DIE_BOX, TLB_BOX, inA);
    const box = lerpBox(lerpBox(near, WALK_BOX, outA), HOLD_BOX, tail);
    return {
      focus: box,
      yaw: mix(mix(-0.44, -0.36, inA), -0.66, outA),
      pitch: mix(mix(0.44, 0.36, inA), 0.24, outA),
      dolly: mix(mix(520, 380, inA), 1900, outA),
      flatten: mix(0, 0.24, outA),
      fill: mix(0.78, 0.64, outA),
      // 주소 막대가 화면 위를 통째로 차지한다. 기계를 그만큼 내려 앉힌다.
      oy: mix(0.05, 0.13, outA)
    };
  },

  render(t, env) {
    const q = env.quality;

    drawMachine(t, {
      quality: q,
      focus: t < T_MISS + 0.4 ? ['cpu'] : ['cpu', 'mem0', 'mem1', 'mem2'],
      wires: mix(0.28, 0.55, span(t, T_MISS, T_MISS + 0.9)),
      // DDR 만 켠다. 워크의 네 번은 전부 이 한 길로 나가고, 빠른 길에서는
      // 아예 나가지 않는다 — TLB 적중은 메모리 참조가 0회다.
      signals: span(t, HOP0 - 0.25, HOP0 + 0.35) * (1 - span(t, T_FAIL + 0.2, T_FAIL + 0.8)) * 0.45,
      busOnly: ['DDR'],
      busLabels: false,
      cpu: { labels: false, busy: (i, j) => (i === 0 && j === 1 ? 1 : 0) },
      mem: [
        { activity: dimmAct(t, 0) },
        { activity: dimmAct(t, 1) },
        { activity: dimmAct(t, 2) }
      ]
    });

    drawParallel(t);
    drawWalk(t, env);
    drawPresent(t);
    drawFault(t);
    drawBar(t, env);
    drawCost(t);
  }
};

// 홉마다 어느 모듈이 답하는지. 표 하나를 읽고 오는 동안만 켜진다.
function dimmAct(t, m) {
  let v = 0;
  for (let i = 0; i < HOPS.length; i++) {
    if (HOPS[i].dimm !== m) continue;
    const p = pulse(t, hopT(i) + 0.50, 0.10, 0.42);
    if (p > v) v = p;
  }
  return v;
}

// ── 빠른 길 ───────────────────────────────────────────────────
// TLB 는 L1 뒤에 오지 않는다. 같은 순간에 함께 본다. 두 선을 같은 reveal 로
// 긋는 이유가 그것이다 — 하나가 끝난 다음 다른 하나가 시작하면 그건 거짓말이
// 되고, L1 이 32 KiB 8-way 인 이유도 함께 사라진다. 4 KiB × 8 way = 32 KiB 라
// 세트 색인이 번역되지 않는 열두 비트 안에서 나오고, 그래서 번역을 기다리지
// 않고 세트를 먼저 열 수 있다.
function drawParallel(t) {
  const on = span(t, 1.85, 2.30) * (1 - span(t, T_MISS, T_MISS + 0.45));
  if (on <= 0.02) return;
  const y = DIE_Y + 0.06;
  const tcx = (TLB_R.x0 + TLB_R.x1) / 2, tcz = (TLB_R.z0 + TLB_R.z1) / 2;
  const lcx = (L1_R.x0 + L1_R.x1) / 2, lcz = (L1_R.z0 + L1_R.z1) / 2;

  rectY(TLB_R.x0, TLB_R.z0, TLB_R.x1, TLB_R.z1, y, 0.55 * on, 1.2);
  rectY(L1_R.x0, L1_R.z0, L1_R.x1, L1_R.z1, y, 0.45 * on, 1.2);
  R.text3([tcx, y, TLB_R.z0], 'dTLB 64', 8, 0.7 * on, 0, -9);
  R.text3([lcx, y, L1_R.z1], 'L1D 32 KiB · 8 way', 8, 0.45 * on, 0, 10);

  // 갈래 하나에서 두 선이 같은 reveal 로 동시에 뻗는다.
  const r = span(t, T_FAST - 0.30, T_FAST + 0.10);
  if (r > 0) {
    R.line(FORK, [tcx, y, tcz], 0.7 * on, 1.2, r);
    R.line(FORK, [lcx, y, lcz], 0.7 * on, 1.2, r);
    R.text3(FORK, '동시에', 8, 0.55 * on * r, 0, -9);
  }

  // 적중. 한 번 번쩍하고 끝난다. 표를 타고 내려가는 일은 일어나지 않는다.
  const hit = pulse(t, T_FAST + 0.32, 0.10, 0.55);
  if (hit > 0) {
    R.fillY(TLB_R.x0, TLB_R.z0, TLB_R.x1, TLB_R.z1, y, 0.55 * hit);
    R.glowLine([TLB_R.x0, y, TLB_R.z0], [TLB_R.x1, y, TLB_R.z0], 0.85 * hit, 1.4);
    R.glowLine([TLB_R.x1, y, TLB_R.z1], [TLB_R.x0, y, TLB_R.z1], 0.85 * hit, 1.4);
  }
}

// ── 페이지 워크 ───────────────────────────────────────────────
// 계단 한 칸이 참조 한 번이다. 가로로 가는 것은 앞 엔트리에서 꺼낸 포인터를
// 다음 표의 바닥 주소로 들고 가는 일이고, 아래로 내려가는 것은 그 표를
// 읽으러 DRAM 쪽으로 내려가는 일이다.
//
// 이 걸음을 걷는 것은 OS 가 아니라 MMU 다. x86 에서 페이지 워크는 하드웨어고,
// 소프트웨어는 마지막 한 자리가 0 으로 읽힌 다음에야 불려온다.
function drawWalk(t, env) {
  const live = span(t, T_MISS + 0.15, T_MISS + 0.55);
  if (live <= 0.02) return;
  const q = env.quality;

  // CR3. 워크의 출발점은 표가 아니라 레지스터 하나다.
  const rise = span(t, T_MISS + 0.15, T_MISS + 0.65);
  R.line([ORIGIN.x, DIE_Y, WALK_Z], [ORIGIN.x, ORIGIN.y, WALK_Z], 0.45 * rise, 1.2, rise);
  R.text3([ORIGIN.x, ORIGIN.y, WALK_Z], 'CR3', 8, 0.55 * rise, 0, -9);

  let px = ORIGIN.x, py = ORIGIN.y;

  for (let i = 0; i < HOPS.length; i++) {
    const h = HOPS[i];
    const t0 = hopT(i);
    const tread = span(t, t0, t0 + 0.28);
    const riser = span(t, t0 + 0.26, t0 + 0.50);
    const tie = span(t, t0 + 0.44, t0 + 0.64);
    const table = span(t, t0 + 0.60, t0 + 0.78);
    const entry = span(t, t0 + 0.66, t0 + 0.84);

    // 지나온 칸은 눌러 둔다. 밝은 것은 지금 걷는 한 칸뿐이고, 그게 네 번이
    // 겹칠 수 없다는 말의 그림이다. 마지막 칸은 끝까지 눌리지 않는다.
    const spent = i === 3 ? 0 : span(t, t0 + 0.88, t0 + 1.20);
    const k = mix(1, 0.5, spent);

    if (tread > 0) R.line([px, py, WALK_Z], [h.x, py, WALK_Z], 0.55 * k, 1.2, tread);
    if (riser > 0) R.glowLine([h.x, py, WALK_Z], [h.x, h.y, WALK_Z], 0.85 * k, 1.4, riser);

    // 표를 읽으러 내려간다. 모듈 윗면 위로 가로질러 가므로 기판을 뚫지 않는다.
    if (tie > 0) {
      const mx = MX[h.dimm] - 3.4;
      const fade = 1 - span(t, t0 + 1.05, t0 + 1.5) * 0.7;
      const a = 0.45 * tie * fade;
      R.line([h.x, h.y, WALK_Z], [h.x, TIE_Y, WALK_Z], a, 1, 1, 1);
      R.line([h.x, TIE_Y, WALK_Z], [mx, TIE_Y, WALK_Z], a, 1, 1, 1);
      R.line([mx, TIE_Y, WALK_Z], [mx, 48, WALK_Z], a, 1, 1, 1);
    }

    // 표의 크기는 한 번만 말한다. 넷 다 512 엔트리라는 것은 첫 표에서 끝난다.
    const say = i === 0 && t < hopT(1) + 0.7;
    if (table > 0) drawTable(h, table * k, IDX[i], entry * k, say, q);
    px = h.x; py = h.y;
  }

  // 마지막 엔트리 다음은 만들어지지 않았다. 점선으로 남겨 둔다 — 이 영화에서
  // 점선은 그려졌지만 아직 아닌 것이다.
  const dead = span(t, T_FAIL + 0.55, T_FAIL + 1.05);
  if (dead > 0) {
    const h = HOPS[3];
    R.line([h.x, h.y, WALK_Z], [h.x + 26, h.y - 12, WALK_Z], 0.12 * dead, 1, dead, 1);
    R.text3([h.x + 26, h.y - 12, WALK_Z], '물리 프레임', 8, 0.16 * dead, 0, 11);
  }
}

// 표 하나. 512개 가운데 하나를 색인이 곧바로 고른다 — 훑지 않는다. 그래서
// 밝은 칸은 표가 나타나는 순간 이미 정해져 있고, 찾아가는 그림이 없다.
function drawTable(h, a, idx, entry, first, q) {
  if (a <= 0.02) return;
  const z0 = WALK_Z - 28, z1 = WALK_Z + 28;
  const n = q === 0 ? 6 : q === 1 ? 10 : 16;

  R.line([h.x, h.y, z0], [h.x, h.y, z1], 0.35 * a, 1);
  for (let i = 0; i <= n; i++) {
    const z = mix(z0, z1, i / n);
    R.line([h.x, h.y, z], [h.x, h.y + 3, z], 0.16 * a, 1);
  }
  if (first) R.text3([h.x, h.y, z1], '512 엔트리', 7, 0.35 * a, 0, 10);

  if (entry <= 0.02) return;
  const ez = mix(z0, z1, idx / 512);
  R.glowLine([h.x, h.y, ez], [h.x, h.y + 7, ez], 0.85 * entry, 1.4);
  R.text3([h.x, h.y + 7, ez], h.key + '[' + idx + ']', 8, 0.85 * entry, 0, -8);
}

// ── 한 자리 ───────────────────────────────────────────────────
// 마지막 엔트리의 아래 다섯 자리를 펼친다. 엔트리의 0번 비트가 present 이고,
// 왼쪽이 위 자리라 그 한 칸은 맨 오른쪽에 온다. 이 자리가 0 이면 하드웨어에게는
// 다음 바닥 주소가 없고, 그래서 걸음이 여기서 죽는다.
function drawPresent(t) {
  const a = span(t, T_FAIL - 0.08, T_FAIL + 0.36);
  if (a <= 0.02) return;
  const h = HOPS[3];
  const ez = mix(WALK_Z - 28, WALK_Z + 28, IDX[3] / 512);
  const y = h.y + 26;
  const z0 = WALK_Z - 25, cw = 10, cells = 5;

  // 고른 칸에서 위로 펼친다. 두 선이 확대의 문법이다.
  R.line([h.x, h.y + 7, ez], [h.x, y - 4, z0], 0.28 * a, 1, a);
  R.line([h.x, h.y + 7, ez], [h.x, y - 4, z0 + cw * cells], 0.28 * a, 1, a);

  for (let i = 0; i <= cells; i++) {
    const z = z0 + i * cw;
    R.line([h.x, y - 4, z], [h.x, y + 4, z], 0.35 * a, 1);
  }
  R.line([h.x, y + 4, z0], [h.x, y + 4, z0 + cw * cells], 0.35 * a, 1);
  R.line([h.x, y - 4, z0], [h.x, y - 4, z0 + cw * cells], 0.35 * a, 1);

  // 위 네 자리는 아직 뜻이 있다. 마지막 한 칸만 0 이다.
  for (let i = 0; i < cells - 1; i++) {
    const z = z0 + (i + 0.5) * cw;
    R.text3([h.x, y, z], bit2(i, 71, 0.5) ? '1' : '0', 8, 0.35 * a, 0, 0);
  }
  const pz = z0 + (cells - 0.5) * cw;
  const beat = span(t, T_FAIL + 0.16, T_FAIL + 0.40);
  R.text3([h.x, y, pz], '0', 12, mix(0.45, 1.0, beat) * a, 0, 0);
  R.text3([h.x, y + 4, pz], 'P', 8, 0.55 * a, 0, 11);
}

// 소프트웨어가 불려오는 자리. 이 장에서 처음이자 마지막으로 OS 가 나온다.
function drawFault(t) {
  const a = span(t, T_FAIL + 0.42, T_FAIL + 0.80);
  if (a <= 0.02) return;
  const h = HOPS[3];
  R.text3([h.x, h.y, WALK_Z], 'present = 0', 10, 0.85 * a, 0, 30);
  R.text3([h.x, h.y, WALK_Z], 'PAGE FAULT', 12, 1.0 * a, 0, 45);
  R.text3([h.x, h.y, WALK_Z], '여기서 하드웨어가 손을 뗀다', 8, 0.45 * a, 0, 59);
}

// ── 주소 막대 ─────────────────────────────────────────────────
// 화면 좌표로 둔다. 카메라가 어디로 가든 주소는 늘 같은 자리에 있어야
// 계단이 '이 자리에서 저 자리로' 간다는 말이 성립한다.
function barGeom() {
  const sz = R.size();
  const sa = R.safeArea();
  const m = Math.max(26, Math.min(70, sz.w * 0.07));
  const x = Math.max(m, sa.x0);
  const w = Math.max(140, sz.w - m - x);
  return { x: x, y: Math.max(30, sa.y0 + 8), w: w, h: 22, cw: w / 48 };
}

// 자리마다 제 차례가 있다. 한 번에 하나만 밝은 것이 곧 네 번이 서로에게
// 매여 있다는 말의 그림이다.
function fieldActive(t, f) {
  if (f >= 4) return 0;               // 오프셋에는 차례가 없다
  const t0 = hopT(f);
  const up = span(t, t0 - 0.16, t0 + 0.08);
  if (f === 3) return up;             // 실패한 자리는 끝까지 켜져 있다
  return up * (1 - span(t, t0 + 0.86, t0 + 1.18) * 0.85);
}

function digitAlpha(t, f) {
  // 오프셋은 상수다. 이 장에서 변하지 않는 유일한 값이고, 화면에서
  // 유일하게 변하지 않는 것이 그것이어야 한다.
  if (f === 4) return 0.70;
  const fast = span(t, T_FAST + 0.30, T_FAST + 0.60) * (1 - span(t, T_MISS - 0.28, T_MISS));
  const spent = f < 3 ? span(t, hopT(f) + 0.88, hopT(f) + 1.20) : 0;
  return mix(mix(mix(0.35, 0.55, fast), 0.85, fieldActive(t, f)), 0.22, spent);
}

function drawBar(t, env) {
  const inA = span(t, T_IN, T_IN + 0.85);
  if (inA <= 0) return;
  const g = barGeom();
  const q = env.quality;
  const y = g.y + mix(-26, 0, out3(inA));
  // 끝에서 통째로 유령 무게로 내려앉는다. 번역되지 못한 주소다.
  const base = mix(1, 0.28, span(t, T_GHOST, T_GHOST + 0.6));
  const split = span(t, T_SPLIT, T_SPLIT + 0.7);

  R.rectS(g.x, y, g.w, g.h, 0.28 * inA * base, 1);

  // 마흔여덟 칸. 눈금으로만 긋고, 자리를 가르는 넷은 여기서 비워 둔다.
  if (g.cw >= 5) {
    for (let i = 1; i < 48; i++) {
      if (i === 9 || i === 18 || i === 27 || i === 36) continue;
      const bx = g.x + i * g.cw;
      R.lineS(bx, y + 3, bx, y + g.h - 3, 0.08 * inA * base, 1);
    }
  }
  // 어느 끝이 위 자리인지 한 번만 말해 두고, 자리 이름이 붙으면 물러난다.
  const ends = 0.28 * inA * base * (1 - span(t, T_LABEL + 0.4, T_LABEL + 0.9));
  if (ends > 0.02) {
    R.textS(g.x, y - 8, '47', 7, ends, 'left');
    R.textS(g.x + g.w, y - 8, '0', 7, ends, 'right');
  }

  // 자리를 가르는 세로 규칙. 이 넷이 그어지는 순간 주소가 주소이기를 그치고
  // 네 개의 색인과 하나의 오프셋이 된다.
  for (let f = 1; f < 5; f++) {
    const s = span(split, (f - 1) * 0.16, 0.52 + (f - 1) * 0.16);
    if (s <= 0) continue;
    const bx = g.x + FIELD_AT[f] * g.cw;
    R.lineS(bx, y - 5 * s, bx, y + g.h + 5 * s, 0.55 * s * base, 1.4);
  }

  // 지금 걷는 자리를 채운다. 오프셋은 갈린 순간부터 끝까지 같은 값으로 켜 둔다.
  for (let f = 0; f < 5; f++) {
    const x0 = g.x + FIELD_AT[f] * g.cw;
    const w = FIELDS[f].n * g.cw;
    const fill = f === 4 ? 0.08 * split : 0.16 * fieldActive(t, f);
    if (fill > 0.02) R.fillRectS(x0, y, w, g.h, fill * base);
  }

  // 비트. 칸이 좁거나 품질이 낮으면 글자를 놓고 눈금만 남긴다.
  if (g.cw >= 9.5 && q === 2) {
    // 빠른 길에서 높은 서른여섯 자리만 갈아 끼운다. 낮은 열두 자리는
    // bitAt 이 phys 를 보지 않으므로 바뀔 수가 없다.
    const phys = t >= T_FAST + 0.42 && t < T_MISS - 0.1;
    for (let i = 0; i < 48; i++) {
      const f = fieldOf(i);
      const a = digitAlpha(t, f) * inA * base;
      if (a <= 0.03) continue;
      R.textS(g.x + (i + 0.5) * g.cw, y + g.h / 2, bitAt(i, phys && i < 36) ? '1' : '0', 8, a, 'center');
    }
  }

  // 자리 이름과, 오프셋 아래 괄호.
  const lab = span(t, T_LABEL, T_LABEL + 0.5);
  if (lab > 0.02) {
    for (let f = 0; f < 5; f++) {
      const cx = g.x + (FIELD_AT[f] + FIELDS[f].n / 2) * g.cw;
      const a = f === 4 ? 0.70 : mix(0.35, 0.85, fieldActive(t, f));
      R.textS(cx, y + g.h + 11, FIELDS[f].key + ' · ' + FIELDS[f].n, 8, a * lab * base, 'center');
    }
    const ox0 = g.x + FIELD_AT[4] * g.cw;
    const ox1 = g.x + g.w;
    R.lineS(ox0, y + g.h + 21, ox1, y + g.h + 21, 0.35 * lab * base, 1);
    R.lineS(ox0, y + g.h + 21, ox0, y + g.h + 17, 0.35 * lab * base, 1);
    R.lineS(ox1, y + g.h + 21, ox1, y + g.h + 17, 0.35 * lab * base, 1);
    R.textS(ox1, y + g.h + 31, '2¹² = 4 KiB · 페이지 안의 자리', 8, 0.55 * lab * base, 'right');
  }

  // 판정. 적중이면 홉이 0회, 실패면 4회다.
  const hitA = span(t, T_FAST + 0.42, T_FAST + 0.68) * (1 - span(t, T_MISS - 0.25, T_MISS));
  if (hitA > 0.02) {
    R.textS(g.x + g.w, y - 22, 'TLB 적중 · 추가 0클럭', 9, 0.85 * hitA, 'right');
    R.textS(g.x, y + g.h + 45, '높은 서른여섯 자리만 바뀐다 · 낮은 열두 자리는 그대로', 9, 0.70 * hitA, 'left');
    R.textS(g.x, y + g.h + 57, '4 KiB × 8 way = 32 KiB · 세트 색인이 오프셋 안에서 나온다', 8, 0.35 * hitA, 'left');
  }
  const missA = span(t, T_MISS, T_MISS + 0.3) * base;
  if (missA > 0.02) {
    R.textS(g.x + g.w, y - 22, 'TLB 실패 · 종속 참조 4회', 9, 0.85 * missA, 'right');
    R.textS(g.x, y + g.h + 45, '오프셋 ' + OFFSET_HEX + ' 는 네 번 내내 손대지 않는다', 9, 0.70 * missA, 'left');
  }
}

// ── 값 ────────────────────────────────────────────────────────
// 한 홉이 DRAM 까지 내려가면 250클럭 = 55.5 ns. 넷이 겹칠 수 없으니 그냥
// 더해진다. 실제로는 페이징 구조 캐시와 L2 TLB 가 대부분을 걷어내므로,
// 이 표는 평균이 아니라 최악의 줄이다.
const COST = [];
for (let i = 0; i < 4; i++) {
  COST.push([(i + 1) + ' · ' + HOPS[i].key, (NS_DRAM * (i + 1)).toFixed(1) + ' ns']);
}

function drawCost(t) {
  const a = span(t, HOP0 + 0.25, HOP0 + 0.65) * (1 - span(t, T_GHOST + 0.6, T_GHOST + 1.2) * 0.45);
  if (a <= 0.02) return;
  const sa = R.safeArea();
  const right = sa.x1;
  const top = Math.max(sa.y0 + 120, sa.y1 - 156);
  const wide = 196;

  R.textS(right, top, '최악의 줄 · 주소 하나', 8, 0.35 * a, 'right');
  R.lineS(right - wide, top + 10, right, top + 10, 0.22 * a, 1);

  for (let i = 0; i < COST.length; i++) {
    const rb = span(t, hopT(i) + 0.62, hopT(i) + 0.84);
    if (rb <= 0) continue;
    const y = top + 26 + i * 16;
    const slide = mix(7, 0, out3(rb));
    // 지나온 줄은 눌러 둔다. 밝은 줄이 지금 걷는 홉이다.
    const live = i === 3 ? 1 : 1 - span(t, hopT(i) + 1.0, hopT(i) + 1.4) * 0.45;
    R.textS(right - wide, y + slide, COST[i][0], 9, 0.35 * a * rb, 'left');
    R.textS(right, y + slide, COST[i][1], 11, 0.85 * a * rb * live, 'right', 'middle', 500);
  }

  const note = span(t, hopT(3) + 0.90, hopT(3) + 1.30);
  if (note > 0.02) {
    R.lineS(right - wide, top + 100, right, top + 100, 0.16 * a * note, 1);
    R.textS(right, top + 112, '데이터 한 줄까지 ' + (NS_DRAM * 5).toFixed(1) + ' ns', 8, 0.35 * a * note, 'right');
    R.textS(right, top + 124, '행 미스와 줄서기까지 세면 400 ns 근처', 8, 0.28 * a * note, 'right');
    R.textS(right, top + 140, '2 MiB 페이지 = 3단 · 도달 범위 512배', 8, 0.28 * a * note, 'right');
  }
}
