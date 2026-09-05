// 08 · THE LONG WALK — 캐시 미스
//
// 07장이 그린 거리 지도를, 이번에는 걸어서 지나간다. 컷은 한 번도 없다.
// 코어에서 L1·L2·L3 를 지나 링을 타고 다이를 가로지르고, IMC 로 나가
// DDR 배선 위에서 주소가 되어 DIMM 0 까지 갔다가, 64바이트 한 줄이 되어
// 같은 길로 돌아온다.
//
// 층마다 태그는 전 웨이가 같은 순간에 비교된다. 하나씩 훑는 그림을 그리는
// 순간 이 장은 통째로 거짓이 된다. 그리고 돌아오는 길에, 들어온 줄마다
// 한 줄이 나간다. 그 축출이 이 장의 조용한 논거다.

import * as R from '../core/raster.js';
import { span, mix, track } from '../core/timeline.js';
import { out3, inOut3 } from '../core/ease.js';
import { rand2, noise, pick2 } from '../core/hash.js';
import { drawMachine, lerpBox } from './common.js';
import {
  BOX, CX, CZ, MX, MZ, MEM_CHIP_Z, DIE_Y, PKG_Y,
  coreRect, busByName, pathPoint
} from '../geom/parts.js';
import { rectY, gridY, rectX } from '../geom/detail.js';
import { CORE_PT, GHZ } from './s07.js';

const DUR = 14;

// 미해결 미스. 코어당 10~16개. 그 숫자만큼 코어는 멈추지 않는다.
const MSHR = 12;

// 64 B 경계에 앉은 주소. 하위 6비트가 0 이 아니면 줄의 주소가 아니다.
const ADDR = '0x7F4A2C40';

// ── 층의 자리 ─────────────────────────────────────────────────
// 새 좌표를 만들지 않는다. L1D 는 10장이 코어(0,1) 안에 둔 그 사각형이고,
// L2 는 코어 열과 가운데 L3 띠 사이에 남아 있는 틈이다. L3 는 cpuDetail 이
// 이미 열 칸으로 나눠 그려 둔 띠의 일곱째 칸이다.
const DIE = DIE_Y + 0.14;

const L1_R = { x0: CX - 19, x1: CX - 10, z0: CZ - 12.5, z1: CZ - 3.5 };
const L2_R = { x0: CX - 9.6, x1: CX - 7.4, z0: CZ - 14.5, z1: CZ - 1.5 };

const SLICE = 6;                       // 0부터 센다. 화면에는 7 / 10
const BANDS = 10;
const BAND_H = 68 / BANDS;
const SL_Z0 = CZ - 34 + BAND_H * SLICE;
const SL_Z1 = SL_Z0 + BAND_H;
const SL_Z = (SL_Z0 + SL_Z1) / 2;
const L3_R = { x0: CX - 7, x1: CX + 7, z0: SL_Z0, z1: SL_Z1 };

const RX = CX + 36;                    // 링 오른변. cpuDetail 이 CX±36 에 그은 그 사각형
const RZN = CZ - 36;                   // 링 윗변
const GX = (L2_R.x0 + L2_R.x1) / 2;    // 코어와 L3 사이의 틈. 여기로 링에 오른다

// ── 길 ────────────────────────────────────────────────────────
// 이 장의 모든 움직임이 이 하나의 꺾인 선 위에서 일어난다. 나갈 때는 앞으로,
// 돌아올 때는 뒤로 걷는다. 뒤로 걸으면 층을 만나는 순서가 저절로 뒤집힌다 —
// DRAM · L3 · L2 · L1. 그래서 채움 순서를 따로 짤 필요가 없다.
const PATH = [];
const MARK = {};

function put(name, p) {
  if (name) MARK[name] = PATH.length;
  PATH.push(p);
}

put('CORE', [CORE_PT[0], DIE, CORE_PT[2]]);                 // 07장이 표시한 그 코어
put('L1', [(L1_R.x0 + L1_R.x1) / 2, DIE, (L1_R.z0 + L1_R.z1) / 2]);
put('L2', [GX, DIE, (L2_R.z0 + L2_R.z1) / 2]);
put('RN', [GX, DIE, RZN]);                                  // 링에 오른다
put('RNE', [RX, DIE, RZN]);
put('RS', [RX, DIE, SL_Z]);                                 // 슬라이스 앞
put('L3', [CX, DIE, SL_Z]);
put('RS2', [RX, DIE, SL_Z]);                                // 같은 자리로 되돌아 나온다
put('IMC', [RX + 0.5, DIE, CZ]);                            // 링 위의 정거장이 곧 메모리 컨트롤러다
put('DIEE', [CX + 40, PKG_Y + 0.1, CZ]);                    // 다이에서 기판으로 한 단 내려선다
put('SOCK', [CX + 66, PKG_Y + 0.1, CZ]);                    // 소켓 가장자리 = DDR 배선의 시작점

// 보드 구간은 실제 배선에서 뽑는다. 배선이 꺾이면 글리프도 같이 꺾여야 한다.
const DDR = busByName('DDR');
for (let i = 0; i <= 6; i++) {
  const p = pathPoint(DDR, i / 6);
  put(i === 0 ? 'BUS0' : i === 6 ? 'BUSE' : null, [p[0], 0.7, p[1]]);
}

put('DIMM', [MX[0] - 4.45, 8, MZ]);                         // 모듈 발치
put('CHIP', [MX[0] - 4.45, 33, MEM_CHIP_Z[2]]);             // MZ 에 가장 가까운 칩

const ACC = [0];
for (let i = 0; i < PATH.length - 1; i++) {
  const a = PATH[i], b = PATH[i + 1];
  ACC.push(ACC[i] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
}
const TOTAL = ACC[ACC.length - 1];

const U = {};
for (const k in MARK) U[k] = ACC[MARK[k]] / TOTAL;

function walk(u) {
  const d = (u < 0 ? 0 : u > 1 ? 1 : u) * TOTAL;
  let i = 0;
  while (i < ACC.length - 2 && ACC[i + 1] <= d) i++;
  const seg = ACC[i + 1] - ACC[i];
  const k = seg <= 0 ? 0 : (d - ACC[i]) / seg;
  const a = PATH[i], b = PATH[i + 1];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

// ── 시각표 ────────────────────────────────────────────────────
// 나가는 길은 층마다 멈춰 서고, 돌아오는 길은 빠르다. 그것이 연출이 아니라
// 사실이다 — 212 클럭까지가 나가는 길이고, 돌아와 채우는 데 38 클럭이다.
const T_L1 = 1.05, T_L1X = 1.42;
const T_L2 = 2.02, T_L2X = 2.32;
const T_L3 = 5.24, T_L3X = 5.55;
const T_BUS = 7.12, T_BUSE = 8.02;
const T_CHIP = 8.58;
const T_BACK = 9.24;

// 층별 채움. 각각 [멈춤 시작, 멈춤 끝].
const DEP = { L3: [11.24, 11.74], L2: [12.60, 13.00], L1: [13.12, 13.46] };
const T_HOME = 13.66;

const WALKT = [
  [0.55, U.CORE],
  [T_L1, U.L1], [1.62, U.L1],
  [T_L2, U.L2], [2.48, U.L2],
  [3.08, U.RN],
  [3.46, U.RNE],
  [5.00, U.RS],
  [T_L3, U.L3], [5.68, U.L3],
  [6.00, U.RS2],
  [6.22, U.IMC],
  [6.52, U.DIEE],
  [6.98, U.SOCK],
  [T_BUS, U.BUS0],
  [T_BUSE, U.BUSE],
  [8.22, U.DIMM],
  [T_CHIP, U.CHIP], [T_BACK, U.CHIP],
  [9.70, U.DIMM],
  [9.86, U.BUSE],
  [10.34, U.BUS0],
  [10.50, U.SOCK],
  [10.66, U.DIEE],
  [10.82, U.IMC],
  [11.00, U.RS2],
  [DEP.L3[0], U.L3], [DEP.L3[1], U.L3],
  [11.96, U.RS],
  [12.24, U.RNE],
  [12.44, U.RN],
  [DEP.L2[0], U.L2], [DEP.L2[1], U.L2],
  [DEP.L1[0], U.L1], [DEP.L1[1], U.L1],
  [T_HOME, U.CORE]
];

// 클럭 카운터. 화면의 눈금이 걸음과 어긋나면 검산이 깨지므로, 층에 닿는
// 시각과 눈금을 같은 표에 묶어 둔다.
const CYCT = [
  [0.55, 0], [T_L1X, 4], [T_L2X, 14], [T_L3X, 45],
  [6.6, 62], [7.6, 150], [T_CHIP, 212], [9.70, 226],
  [DEP.L3[0], 238], [T_HOME, 250]
];

function tableAt(tab, t) {
  const n = tab.length;
  if (t <= tab[0][0]) return tab[0][1];
  if (t >= tab[n - 1][0]) return tab[n - 1][1];
  let i = 0;
  while (i < n - 2 && tab[i + 1][0] <= t) i++;
  const a = tab[i], b = tab[i + 1];
  return mix(a[1], b[1], span(t, a[0], b[0]));
}

function uAt(t) { return tableAt(WALKT, t); }
function cycAt(t) { return tableAt(CYCT, t); }

// ── 카메라 ────────────────────────────────────────────────────
// 상자를 이어 붙여 한 번의 이동으로 만든다. 상자가 바뀌는 시각은 걸음이
// 멈춰 서는 시각과 같다. 그래야 카메라가 스스로 멈추는 것처럼 보이지 않는다.
const B_CORE = { x0: CX - 36, y0: 13, z0: CZ - 24, x1: CX - 2, y1: 25, z1: CZ + 4 };
const B_LEAVE = { x0: CX - 40, y0: 13, z0: CZ - 42, x1: CX + 8, y1: 25, z1: CZ + 6 };
const B_DIE = { x0: CX - 44, y0: 12, z0: CZ - 44, x1: CX + 44, y1: 26, z1: CZ + 44 };
const B_SLICE = { x0: CX - 14, y0: 13, z0: CZ - 26, x1: CX + 44, y1: 25, z1: CZ + 20 };
const B_EXIT = { x0: CX + 4, y0: 0, z0: CZ - 26, x1: 2, y1: 26, z1: CZ + 18 };
const B_TRACE = { x0: -54, y0: -2, z0: -86, x1: 42, y1: 34, z1: -14 };
const B_BACK = { x0: CX - 6, y0: -2, z0: -92, x1: 42, y1: 40, z1: -8 };
const B_DIE2 = { x0: CX - 24, y0: 10, z0: CZ - 40, x1: CX + 50, y1: 26, z1: CZ + 34 };
const B_END = { x0: CX - 46, y0: 6, z0: CZ - 46, x1: CX + 86, y1: 30, z1: CZ + 46 };

const CAM = [
  { t: 0.0, b: B_CORE }, { t: 2.5, b: B_LEAVE }, { t: 4.2, b: B_DIE },
  { t: 5.5, b: B_SLICE }, { t: 6.9, b: B_EXIT }, { t: 8.0, b: B_TRACE },
  { t: 8.9, b: BOX.mem0 }, { t: 9.8, b: BOX.mem0 }, { t: 10.4, b: B_BACK },
  { t: 11.4, b: B_DIE2 }, { t: 12.4, b: B_DIE }, { t: 13.4, b: B_END }
];

function boxAt(t) {
  const n = CAM.length;
  if (t <= CAM[0].t) return CAM[0].b;
  if (t >= CAM[n - 1].t) return CAM[n - 1].b;
  let i = 0;
  while (i < n - 2 && CAM[i + 1].t <= t) i++;
  return lerpBox(CAM[i].b, CAM[i + 1].b, inOut3(span(t, CAM[i].t, CAM[i + 1].t)));
}

const camYaw = track([
  { t: 0, v: -0.46 }, { t: 2.5, v: -0.44 }, { t: 4.2, v: -0.40 }, { t: 5.5, v: -0.44 },
  { t: 6.9, v: -0.56 }, { t: 8.0, v: -0.74 }, { t: 8.9, v: -0.94 }, { t: 9.8, v: -0.94 },
  { t: 10.4, v: -0.78 }, { t: 11.4, v: -0.50 }, { t: 12.4, v: -0.42 }, { t: 13.4, v: -0.50 }
]);
const camPitch = track([
  { t: 0, v: 0.52 }, { t: 2.5, v: 0.60 }, { t: 4.2, v: 0.74 }, { t: 5.5, v: 0.68 },
  { t: 6.9, v: 0.54 }, { t: 8.0, v: 0.38 }, { t: 8.9, v: 0.26 }, { t: 9.8, v: 0.26 },
  { t: 10.4, v: 0.40 }, { t: 11.4, v: 0.62 }, { t: 12.4, v: 0.70 }, { t: 13.4, v: 0.60 }
]);
// 링을 사각형으로 읽히게 하려면 다이 위에서 원근을 빼야 한다. 이 장이
// dolly 를 가장 넓게 쓰는 곳이고, 그 값이 곧 '걸어서 건너간다'는 감각이다.
const camDolly = track([
  { t: 0, v: 380 }, { t: 2.5, v: 700 }, { t: 4.2, v: 1700 }, { t: 5.5, v: 1500 },
  { t: 6.9, v: 1050 }, { t: 8.0, v: 820 }, { t: 8.9, v: 640 }, { t: 9.8, v: 640 },
  { t: 10.4, v: 900 }, { t: 11.4, v: 1500 }, { t: 12.4, v: 1800 }, { t: 13.4, v: 1600 }
]);
const camFlat = track([
  { t: 0, v: 0 }, { t: 4.2, v: 0.28 }, { t: 5.5, v: 0.24 }, { t: 6.9, v: 0.14 },
  { t: 8.9, v: 0 }, { t: 10.4, v: 0.08 }, { t: 12.4, v: 0.30 }, { t: 13.4, v: 0.28 }
]);
const camFill = track([
  { t: 0, v: 0.80 }, { t: 4.2, v: 0.84 }, { t: 8.9, v: 0.86 },
  { t: 11.4, v: 0.84 }, { t: 13.4, v: 0.82 }
]);

// ── 층 ────────────────────────────────────────────────────────
const LEVELS = [
  { key: 'L1', r: L1_R, ways: 8, t0: T_L1, tx: T_L1X, cyc: 4, alongZ: true, seed: 31, dep: DEP.L1 },
  { key: 'L2', r: L2_R, ways: 16, t0: T_L2, tx: T_L2X, cyc: 14, alongZ: true, seed: 57, dep: DEP.L2 },
  { key: 'L3', r: L3_R, ways: 16, t0: T_L3, tx: T_L3X, cyc: 45, alongZ: false, seed: 83, dep: DEP.L3 }
];

export default {
  id: 's08',
  no: '08',
  title: 'THE LONG WALK',
  kr: '캐시 미스',
  line: '들어온 만큼, 어느 층에서든 한 줄이 나간다.',
  nums: [
    '64 B 줄 · 언제나 64 B',
    'L1 4 · L2 14 · L3 45 클럭',
    'DRAM 250 클럭 · 55.6 ns',
    '태그 비교 전 웨이 동시 · 1 클럭',
    '미해결 미스 10–16'
  ],
  dur: DUR,
  keyT: 7.6,

  camAt(t) {
    return {
      focus: boxAt(t),
      yaw: camYaw(t),
      pitch: camPitch(t),
      dolly: camDolly(t),
      flatten: camFlat(t),
      fill: camFill(t),
      // 왼쪽 위의 클럭 카운터가 앉을 자리만큼 기계를 내린다.
      oy: 0.04
    };
  },

  render(t, env) {
    const q = env.quality;
    const board = t > 6.2 && t < 11.2;

    drawMachine(t, {
      quality: q,
      focus: board ? ['cpu', 'mem0'] : ['cpu'],
      wires: mix(0.28, 0.55, span(t, 6.0, 6.8)) * (1 - span(t, 11.6, 12.4) * 0.5),
      // 배선 위의 다른 비트들은 우리 주소가 아니다. 동시에 나가 있는
      // 나머지 미스들이다. 그래서 이 장에서 선이 비는 순간은 없다.
      signals: board ? 0.22 : 0,
      busOnly: ['DDR'],
      busLabels: false,
      cpu: {
        labels: false,
        // 미스를 낸 코어도 멈추지 않는다. 나머지 일곱도 각자 돌아간다.
        busy: (i, j) => (i === 0 && j === 1 ? 1 : (Math.sin(t * (1.9 + (i * 4 + j) * 0.21) + (i * 4 + j) * 2.3) > 0.2 ? 1 : 0))
      },
      mem: [{ activity: dimmAct(t) }, { activity: 0 }, { activity: 0 }]
    });

    drawLanes(t, q);
    drawProbes(t);
    drawSlices(t, q);
    drawExit(t);
    drawDimm(t);
    drawGlyph(t, q);
    drawFills(t);
    drawEvict(t, q);
    drawCounter(t);
    drawUnderneath(t);
  }
};

// ── 코어 ──────────────────────────────────────────────────────
// 레인은 미스가 나 있는 내내 움직인다. 미스는 코어를 멈추지 않는다 —
// 채움 버퍼가 열두 개 열려 있고, 그 아래에서 실행은 계속된다.
function drawLanes(t, q) {
  if (q === 0) return;
  const r = coreRect(0, 1);
  for (let i = 0; i < 3; i++) {
    const z = r.z0 + (r.z1 - r.z0) * (i + 0.5) / 3;
    const u = (t * (0.9 + i * 0.37) + i * 0.31) % 1;
    const x = mix(r.x0 + 1.6, r.x1 - 3.4, u);
    R.fillY(x, z - 1.1, x + 1.8, z + 1.1, DIE_Y + 0.05, 0.35);
  }
}

// ── 태그 비교 ─────────────────────────────────────────────────
// 웨이마다 태그가 다르므로 눈금의 길이는 다르다. 그러나 시각은 하나다.
// 여기서 웨이를 하나씩 훑으면 캐시는 연관 검색기가 되어 버리고, 색인이
// 세트 하나를 고른다는 사실도, 1클럭이라는 숫자도 함께 사라진다.
function wayRow(r, ways, lit, seed, alongZ, victim, out) {
  if (lit <= 0.02) return;
  const dx = r.x1 - r.x0, dz = r.z1 - r.z0;
  for (let i = 0; i < ways; i++) {
    const u = (i + 0.5) / ways;
    const h = 0.4 + rand2(seed, i) * 0.5;
    const hit = victim === i;
    const a = (hit ? 0.85 : 0.55) * lit;
    if (alongZ) {
      const z = r.z0 + dz * u;
      const x = r.x0 + dx * 0.14;
      R.line([x, DIE, z], [x + dx * 0.72 * h, DIE, z], a, hit ? 1.4 : 1);
    } else {
      const x = r.x0 + dx * u;
      const z = r.z0 + dz * 0.14;
      R.line([x, DIE, z], [x, DIE, z + dz * 0.72 * h], a, hit ? 1.4 : 1);
    }
  }
  if (out) R.text3([(r.x0 + r.x1) / 2, DIE, r.z1], ways + ' way 동시 · 1 클럭', 8, 0.45 * lit, 0, 11);
}

function cross(r, a) {
  R.glowLine([r.x0, DIE, r.z0], [r.x1, DIE, r.z1], a, 1.4);
  R.glowLine([r.x0, DIE, r.z1], [r.x1, DIE, r.z0], a, 1.4);
}

function drawProbes(t) {
  for (let i = 0; i < LEVELS.length; i++) {
    const lv = LEVELS[i];
    const on = span(t, lv.t0 - 0.22, lv.t0) * (1 - span(t, lv.tx + 1.1, lv.tx + 1.7));
    if (on <= 0.02) continue;
    rectY(lv.r.x0, lv.r.z0, lv.r.x1, lv.r.z1, DIE, 0.45 * on, 1.2);

    // 전 웨이가 같은 한 값으로 깜빡인다. 값 하나를 나눠 쓰는 것이 곧 동시다.
    const flick = 0.55 + 0.45 * noise(lv.seed, t, 26);
    const lit = span(t, lv.t0, lv.t0 + 0.1) * (1 - span(t, lv.tx, lv.tx + 0.12)) * flick * on;
    wayRow(lv.r, lv.ways, lit, lv.seed, lv.alongZ, -1, i === 0);

    const x = span(t, lv.tx, lv.tx + 0.14) * (1 - span(t, lv.tx + 1.1, lv.tx + 1.7));
    if (x > 0.02) {
      cross(lv.r, 0.85 * x);
      R.text3([(lv.r.x0 + lv.r.x1) / 2, DIE, lv.r.z0], lv.key + ' 미스 · ' + lv.cyc + ' 클럭', 10, 0.85 * x, 0, -10);
    }
  }
}

// ── L3 ────────────────────────────────────────────────────────
// 슬라이스는 링을 따라 잘려 있고, 어느 조각인지는 주소 해시가 고른다.
// 그래서 미스 하나가 다이의 반대편까지 간다. 지나가는 칸을 세어 보면
// 그 거리가 연출이 아니라는 것을 알 수 있다.
function drawSlices(t, q) {
  const on = span(t, 3.30, 3.70) * (1 - span(t, 6.30, 6.90));
  if (on <= 0.02) return;
  const u = uAt(t);
  const gz = u <= U.RNE ? -1e9 : (u >= U.RS ? SL_Z : walk(u)[2]);

  let count = 0;
  for (let i = 0; i < BANDS; i++) {
    const z0 = CZ - 34 + BAND_H * i;
    const z1 = z0 + BAND_H;
    const passed = span(gz, z0, z0 + 1.6);
    if (passed > 0.5) count = i + 1;
    const mine = i === SLICE;
    rectY(CX - 7, z0, CX + 7, z1, DIE, (0.12 + 0.16 * passed) * on, mine && passed > 0.5 ? 1.2 : 1);
    if (passed > 0.02 && q > 0) {
      R.text3([CX + 7, DIE, (z0 + z1) / 2], String(i + 1), 8, (mine ? 0.7 : 0.35) * passed * on, 12, 0);
    }
  }

  if (count > 0) {
    R.text3([RX, DIE, RZN], count + ' / ' + BANDS, 10, 0.7 * on, 16, -4);
  }
  const got = span(t, T_L3 - 0.1, T_L3 + 0.2) * (1 - span(t, 6.1, 6.6));
  if (got > 0.02) {
    R.text3([CX, DIE, SL_Z], '슬라이스 7 / 10 · 주소 해시가 골랐다', 9, 0.55 * got, 0, 16);
  }
}

// ── 나가는 길 ─────────────────────────────────────────────────
// 다이 밖으로 나가는 신호는 전부 가장자리의 세 블록에서 난다. 메모리는
// IMC 다. 링의 오른변이 그 블록을 지나가므로, 정거장 하나가 곧 문이다.
function drawExit(t) {
  const on = span(t, 5.95, 6.30) * (1 - span(t, 7.6, 8.2));
  if (on > 0.02) {
    rectY(CX + 34, CZ - 30, CX + 39, CZ + 30, DIE, 0.45 * on, 1.2);
    R.text3([CX + 36.5, DIE, CZ], 'IMC', 9, 0.7 * on, 0, -12);
  }
  // 기판 위의 짧은 마디. cpuDetail 이 이미 그어 둔 그 선 위를 지난다.
  const r = span(t, 6.45, 7.05) * (1 - span(t, 9.0, 9.6));
  if (r > 0.02) {
    R.line([CX + 40, PKG_Y + 0.1, CZ], [CX + 66, PKG_Y + 0.1, CZ], 0.35 * r, 1.2);
  }
  // 배선 위의 주소. 여기서 글리프는 글자가 된다.
  drawAddress(t);
}

const DU = 2.9 / TOTAL;

function drawAddress(t) {
  const u = uAt(t);
  if (u < U.BUS0 - DU || u > U.BUSE + 0.01 || t > T_BACK) return;
  const fade = span(t, T_BUS - 0.12, T_BUS + 0.1) * (1 - span(t, 8.3, 8.6));
  const n = ADDR.length;
  for (let i = 0; i < n; i++) {
    const uu = u - (n - 1 - i) * DU;
    if (uu < U.BUS0 - 0.004) continue;
    const p = walk(uu);
    R.text3(p, ADDR.charAt(i), 9, (i === n - 1 ? 0.85 : 0.55) * fade, 0, -6);
  }
  const mid = walk((U.BUS0 + U.BUSE) / 2);
  R.text3(mid, '하위 6비트 0 · 64 B 경계', 8, 0.35 * fade, 0, 13);
}

// ── DIMM ──────────────────────────────────────────────────────
// 한 줄은 한 칩에서 오지 않는다. x8 네 개가 32비트 서브채널 하나를 이루고,
// 16번 전송하면 64 B 다. 한 칩만 켜면 이 숫자가 성립하지 않는다.
function dimmAct(t) {
  return span(t, 8.35, 8.6) * (1 - span(t, 9.5, 10.0));
}

function drawDimm(t) {
  const on = span(t, 8.30, 8.62) * (1 - span(t, 9.45, 9.95));
  if (on <= 0.02) return;
  const px = MX[0] - 4.45;
  for (let i = 0; i < MEM_CHIP_Z.length; i++) {
    rectX(MEM_CHIP_Z[i] - 11, 25, MEM_CHIP_Z[i] + 11, 43, px, 0.7 * on, 1.2);
  }
  R.text3([px, 50, MEM_CHIP_Z[1]], 'x8 네 칩 = 32비트 서브채널', 9, 0.55 * on, 0, 0);
  R.text3([px, 18, MEM_CHIP_Z[2]], 'BL16 × 32비트 = 64 B', 10, 0.85 * on, 0, 0);
}

// ── 걸어가는 것 ───────────────────────────────────────────────
// 나갈 때는 표식 하나, 돌아올 때는 64칸짜리 블록. 같은 길 위를 같은 함수로
// 움직인다.
function mark(p, r, a, w) {
  R.glowLine([p[0] - r, p[1], p[2]], [p[0] + r, p[1], p[2]], a, w);
  R.glowLine([p[0], p[1], p[2] - r], [p[0], p[1], p[2] + r], a, w);
  R.line([p[0], p[1] - r * 0.8, p[2]], [p[0], p[1] + r * 0.8, p[2]], a * 0.55, w);
}

// 64칸. 8×8 이 곧 64 B 다. 이보다 적게 실어 나르는 일은 없다.
function block(c, s, a, q) {
  const h = s / 2;
  R.fillY(c[0] - h, c[2] - h, c[0] + h, c[2] + h, c[1], 0.12 * a);
  rectY(c[0] - h, c[2] - h, c[0] + h, c[2] + h, c[1], 0.85 * a, 1.2);
  const n = q === 0 ? 4 : 8;
  gridY(c[0] - h, c[2] - h, c[0] + h, c[2] + h, c[1], n, n, 0.28 * a);
}

function drawGlyph(t, q) {
  if (t < 0.42 || t > T_HOME + 0.5) return;
  const u = uAt(t);
  const p = walk(u);
  const born = span(t, 0.42, 0.7);

  // 꼬리. 지나온 길을 조금만 남긴다.
  const tail = q === 0 ? 3 : 6;
  for (let i = 0; i < tail; i++) {
    const u0 = u - (i + 1) * 0.006 * (t < T_BACK ? 1 : -1);
    const u1 = u - i * 0.006 * (t < T_BACK ? 1 : -1);
    if (u0 < 0 || u0 > 1) break;
    R.line(walk(u0), walk(u1), 0.28 * (1 - i / tail) * born, 1);
  }

  if (t < T_BACK) {
    // 주소가 배선 위 글자로 읽히는 동안에는 표식을 죽인다.
    const q2 = 1 - span(t, T_BUS - 0.1, T_BUS + 0.1) * (1 - span(t, 8.2, 8.4));
    if (q2 > 0.02) mark(p, 1.6, 0.85 * born * q2, 1.4);
    if (t < 1.0) R.text3(p, '로드 · 64 B 줄 하나', 9, 0.55 * span(t, 0.5, 0.8) * (1 - span(t, 1.1, 1.4)), 0, -11);
    return;
  }

  // 돌아오는 길. 층에 닿으면 그 층의 칸 크기로 줄어든다.
  let s = mix(4.6, 9.5, span(u, U.IMC, U.SOCK));
  let c = p;
  for (let i = 0; i < LEVELS.length; i++) {
    const lv = LEVELS[i];
    const d = span(t, lv.dep[0], lv.dep[1]);
    if (d <= 0 || d >= 1) continue;
    const w = Math.min(lv.r.x1 - lv.r.x0, lv.r.z1 - lv.r.z0);
    s = mix(s, Math.max(w, 2.2), out3(d));
    c = [(lv.r.x0 + lv.r.x1) / 2, DIE, (lv.r.z0 + lv.r.z1) / 2];
  }
  const fade = 1 - span(t, T_HOME, T_HOME + 0.4);
  block(c, s, fade, q);
  if (t < 10.4) R.text3(c, '64 B · 한 줄', 9, 0.7 * span(t, T_BACK, T_BACK + 0.3) * fade, 0, -12);
}

// ── 채움 ──────────────────────────────────────────────────────
// 층마다 사본이 하나씩 앉는다. 끝나면 세 층이 같은 줄을 들고 있다.
function drawFills(t) {
  for (let i = 0; i < LEVELS.length; i++) {
    const lv = LEVELS[i];
    const a = span(t, lv.dep[1] - 0.18, lv.dep[1] + 0.12);
    if (a <= 0.02) continue;
    R.fillY(lv.r.x0, lv.r.z0, lv.r.x1, lv.r.z1, DIE, 0.22 * a);
    rectY(lv.r.x0, lv.r.z0, lv.r.x1, lv.r.z1, DIE, 0.55 * a, 1.2);
    // 어느 웨이에 앉았는지. 색인이 고른 세트 안의 한 자리다.
    wayRow(lv.r, lv.ways, 0.45 * a, lv.seed, lv.alongZ, pick2(lv.seed, 7, lv.ways), false);
  }
  const home = span(t, T_HOME - 0.1, T_HOME + 0.2);
  if (home > 0.02) {
    R.text3([CORE_PT[0], DIE, CORE_PT[2]], '줄 도착 · 250 클럭', 10, 0.85 * home, 0, -13);
  }
}

// ── 축출 ──────────────────────────────────────────────────────
// 이 장의 조용한 논거. 어느 층이든 자리는 다 차 있으므로, 하나가 들어오면
// 하나가 나간다.
//
// 나가는 곳은 층마다 다르다. L1 의 희생자는 L2 로, L2 의 희생자는 L3 로
// 내려간다. DRAM 까지 되돌려 써야 하는 것은 L3 에서 쫓겨난 더티 줄 하나뿐이다.
// 그 하나만 굵게 그린다.
const EV = [
  { lv: 2, at: 11.62, dirty: true, kr: 'L3 축출 · M · DRAM 으로' },
  { lv: 1, at: 12.88, dirty: false, kr: 'L2 축출 → L3' },
  { lv: 0, at: 13.34, dirty: false, kr: 'L1 축출 → L2' }
];

const D_T0 = 11.62, D_T1 = 14.0;

function drawEvict(t, q) {
  for (let i = 0; i < EV.length; i++) {
    const e = EV[i];
    const lv = LEVELS[e.lv];
    const p = span(t, e.at, e.at + 1.15);
    if (p <= 0) continue;
    const cx = (lv.r.x0 + lv.r.x1) / 2;
    const cz = (lv.r.z0 + lv.r.z1) / 2;

    if (e.dirty) {
      // 더티 줄은 떨어지지 않는다. 같은 길을 거꾸로 되짚어 메모리로 간다.
      const du = mix(U.L3, 0.88, span(t, D_T0, D_T1));
      const dp = walk(du);
      const a = span(t, D_T0, D_T0 + 0.25);
      mark(dp, 2.2, 0.85 * a, 1.6);
      R.text3(dp, 'M', 10, 0.85 * a, 0, -11);
      if (q > 0) {
        const foot = walk(U.DIMM);
        R.line(dp, [foot[0], dp[1], foot[2]], 0.16 * a, 1, 1, 1);
      }
      if (t < 12.9) R.text3([cx, DIE, cz], e.kr, 9, 0.7 * span(t, e.at, e.at + 0.2) * (1 - span(t, 12.6, 13.0)), 0, 15);
      continue;
    }

    // 나머지는 프레임 밖으로 밀려난다. 한 층 아래로 내려가는 길이지만,
    // 이 화면에서는 사라지는 것이 맞다 — 자리를 잃었다는 것이 요점이다.
    const e3 = out3(p);
    const x = cx - 13 * e3;
    const y = DIE - 7 * e3;
    const z = cz - 4 * e3;
    const a = (1 - p) * 0.85;
    R.line([x - 1.8, y, z], [x + 1.8, y, z], a, 1.2);
    R.line([x, y, z - 1.2], [x, y, z + 1.2], a * 0.55, 1);
    if (p < 0.45) R.text3([x, y, z], e.kr, 8, 0.55 * (1 - p / 0.45), 0, -10);
  }

  // 셈. 세 층에서 각각 하나씩.
  const n = (t > EV[0].at ? 1 : 0) + (t > EV[1].at ? 1 : 0) + (t > EV[2].at ? 1 : 0);
  const a = span(t, EV[0].at, EV[0].at + 0.4);
  if (a > 0.02) {
    const sa = R.safeArea();
    R.textS(sa.x1, sa.y1 - 16, '들어온 줄 1 · 나간 줄 ' + n, 10, 0.7 * a, 'right', 'middle', 500);
  }
}

// ── 계기 ──────────────────────────────────────────────────────
const MARKS = [['L1', 4], ['L2', 14], ['L3', 45], ['DRAM', 250]];

function drawCounter(t) {
  const a = span(t, 0.5, 1.1);
  if (a <= 0.02) return;
  const sa = R.safeArea();
  const x = sa.x0, y = sa.y0 + 10;
  const c = Math.round(cycAt(t));

  R.textS(x, y, '경과 클럭', 8, 0.35 * a, 'left');
  R.textS(x, y + 20, String(c), 12, 0.85 * a, 'left', 'middle', 500);
  R.textS(x + 44, y + 20, (c / GHZ).toFixed(1) + ' ns · @ 4.5 GHz', 8, 0.35 * a, 'left');
  R.lineS(x, y + 33, x + 168, y + 33, 0.16 * a, 1);

  for (let i = 0; i < MARKS.length; i++) {
    const passed = c >= MARKS[i][1] ? 1 : 0;
    const px = x + i * 42;
    R.textS(px, y + 46, MARKS[i][0], 8, (0.16 + 0.19 * passed) * a, 'left');
    R.textS(px, y + 59, String(MARKS[i][1]), 9, (0.22 + 0.48 * passed) * a, 'left');
  }

  // 돌아오는 길이 빠른 이유를 한 줄로 적어 둔다. 화면에서 오래 걸리는 것과
  // 클럭에서 오래 걸리는 것은 다르다.
  const b = span(t, T_BACK, T_BACK + 0.4) * (1 - span(t, T_HOME, T_HOME + 0.4));
  if (b > 0.02) R.textS(x, y + 78, '되돌아와 채우는 데 38 클럭', 8, 0.35 * b, 'left');
}

// 미스가 나 있는 동안에도 코어는 돈다. 이 한 줄이 이 장에서 가장 자주
// 오해받는 사실이다.
function drawUnderneath(t) {
  const a = span(t, 1.6, 2.3);
  if (a <= 0.02) return;
  const sa = R.safeArea();
  const x = sa.x0, y = sa.y1 - 14;
  R.textS(x, y, '코어는 계속 실행 중 · 미해결 미스 ' + MSHR, 9, 0.45 * a, 'left');
  for (let i = 0; i < MSHR; i++) {
    const bx = x + 3 + i * 7;
    R.lineS(bx, y - 15, bx, y - 8, 0.45 * a, 1.4);
  }
}
