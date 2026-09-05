// 02 · THE ONLY METRONOME — 유일한 박자
//
// 보드를 가로지르는 클럭선은 없다. 들어오는 것은 100 MHz 기준 하나뿐이고,
// 블록마다 제 PLL 이 제 배수로 곱해 쓴다. 직렬 링크는 아예 클럭선을 갖지
// 않고 데이터에서 되살려 쓰며, DDR 은 스트로브를 데이터와 함께 보낸다.
//
// 클럭이 실제로 나뉘는 곳은 다이 안쪽뿐이고, 그 나눔의 모양이 H 트리다.
// 뿌리에서 여덟 잎까지의 경로 길이가 전부 같다 — 시간이 곧 거리라서
// 길이를 맞추는 것 말고는 방법이 없고, 그래서 이 그림은 장식이 아니라
// 결론이다. 마지막에 자를 하나 눕힌다. 한 클럭 동안 신호가 가는 33 mm
// 옆에 CPU→DIMM 배선을 대면, 배선이 더 길다.

import * as R from '../core/raster.js';
import { span, mix, clamp, pulse } from '../core/timeline.js';
import { inOut3, out3 } from '../core/ease.js';
import { drawMachine, lerpBox, HOME } from './common.js';
import {
  BOX, CX, CZ, DIE_Y, PKG_Y, PCH_Y, IX, IZ, PX, PZ, MZ,
  coreRect, CORE_ORDER, busByName
} from '../geom/parts.js';
import { rectY } from '../geom/detail.js';
import { GHZ } from './s07.js';

const DUR = 10;

// 4.5 GHz 는 07장이 한 번만 못박는 값이다. 이 장의 숫자는 전부 거기서 나온다.
// 한 클럭 222 ps, FR4 위에서 신호는 15 cm/ns 로 가므로 한 클럭에 33 mm.
const PS_PER_CYCLE = 1000 / GHZ;            // 222.2 ps
const MM_PER_NS = 150;                      // FR4 유전율에서 나오는 속도
const MM_PER_CYCLE = MM_PER_NS / GHZ;       // 33.3 mm
const SKEW_PS = 10;                         // 다이 전체 스큐 예산
const PS_TXT = PS_PER_CYCLE.toFixed(0);
const MM_TXT = MM_PER_CYCLE.toFixed(0);
const SKEW_PCT = (SKEW_PS / PS_PER_CYCLE * 100).toFixed(1);   // 한 클럭의 4.5 %

// ── H 트리 ────────────────────────────────────────────────────
// 잎은 지어낸 자리가 아니다. 실제 코어 사각형의 한가운데를 coreRect 에서
// 꺼내 쓴다. 두 열 네 줄이 고르게 놓여 있으므로, 넓은 축부터 반씩 나누면
// z → x → z 세 번 만에 여덟 잎에 정확히 닿고, 그때 여덟 경로의 길이가
// 저절로 같아진다. 같아지도록 맞춘 것이 아니라 반씩 나눈 결과다.
function midX(r) { return (r.x0 + r.x1) / 2; }
function midZ(r) { return (r.z0 + r.z1) / 2; }

const COLX = [midX(coreRect(0, 0)), midX(coreRect(1, 0))];
const ROWZ = [midZ(coreRect(0, 0)), midZ(coreRect(0, 1)), midZ(coreRect(0, 2)), midZ(coreRect(0, 3))];

function meanOf(list, table) {
  let s = 0;
  for (let i = 0; i < list.length; i++) s += table[list[i]];
  return s / list.length;
}

const ROOT_X = meanOf([0, 1], COLX);
const ROOT_Z = meanOf([0, 1, 2, 3], ROWZ);

// PLL. 다이 왼쪽 가장자리의 블록이다. 보드에서 오는 기준은 여기까지만
// 오고, 그 뒤로는 전부 다이 안쪽의 일이다.
const PLL_X0 = CX - 39, PLL_X1 = CX - 34;

// 다이 회로 바로 위. 화가 알고리즘이 선에 0.35 만큼 앞당김을 주므로
// 이만큼 띄우지 않으면 코어의 격자가 트리를 뚫고 올라온다.
const TREE_Y = DIE_Y + 0.2;

const SEGS = [];
const LEAVES = [];

function push(ax, az, bx, bz, d0, level, leaf) {
  const d1 = d0 + Math.abs(bx - ax) + Math.abs(bz - az);
  const s = { ax, az, bx, bz, d0, d1, level, leaf: leaf || null, n: SEGS.length };
  SEGS.push(s);
  if (leaf) LEAVES.push(s);
  return d1;
}

// 재귀. 남은 잎을 반으로 가르고, 가른 두 무리의 한가운데로 가지를 뻗는다.
// 넓은 축을 먼저 가르므로 가지는 z·x·z 로 번갈아 꺾인다.
function grow(x, z, cols, rows, d, level) {
  if (cols.length === 1 && rows.length === 1) return;
  const byRow = rows.length > cols.length;
  const src = byRow ? rows : cols;
  const half = src.length / 2;
  for (let h = 0; h < 2; h++) {
    const part = src.slice(h * half, h * half + half);
    const nc = byRow ? cols : part;
    const nr = byRow ? part : rows;
    const nx = byRow ? x : meanOf(nc, COLX);
    const nz = byRow ? meanOf(nr, ROWZ) : z;
    const leaf = nc.length === 1 && nr.length === 1 ? [nc[0], nr[0]] : null;
    const d1 = push(x, z, nx, nz, d, level, leaf);
    grow(nx, nz, nc, nr, d1, level + 1);
  }
}

// 줄기는 PLL 에서 뿌리까지. 여기까지는 갈래가 없으므로 스큐도 없다.
const TRUNK = push(PLL_X1, ROOT_Z, ROOT_X, ROOT_Z, 0, 0, null);
grow(ROOT_X, ROOT_Z, [0, 1], [0, 1, 2, 3], TRUNK, 1);

// 여덟 잎이 전부 같은 값이다. 이 한 줄이 이 장의 주장 전부다. 화면에
// 밀리미터로 적지는 않는다 — 이 모형의 다이는 실제 치수가 아니므로,
// 길이를 숫자로 말하면 그 순간 거짓말이 된다.
const TREE_LEN = LEAVES[0].d1;

// 층마다 그려지는 구간. 줄기 → 첫 갈래 → 둘째 갈래 → 잎.
const LEVEL_WIN = [[0.95, 1.45], [1.45, 1.88], [1.88, 2.30], [2.30, 2.72]];

// ── 클럭 에지 ─────────────────────────────────────────────────
const T0 = 3.00;          // 첫 에지가 뿌리를 떠나는 시각
const PERIOD = 0.60;      // 화면에서의 에지 간격. 222 ps 를 그대로 쓸 수는 없다
const TRAVEL = 0.34;      // 파면이 뿌리에서 잎까지 가는 데 걸리는 화면 시간
const TAIL = 26;          // 지나간 자리가 식는 거리

function liveAmp(t) {
  return span(t, 2.88, 3.08) * (1 - span(t, 5.15, 5.85));
}

function edgeIndex(t) { return Math.floor((t - T0) / PERIOD); }

// 파면이 간 거리.
function headAt(t) {
  const k = edgeIndex(t);
  return ((t - T0 - k * PERIOD) / TRAVEL) * TREE_LEN;
}

// 잎에 닿은 정도. 여덟 잎이 같은 거리에 있으므로 값이 하나뿐이다 —
// '같은 프레임에 도착한다'는 말의 구현이 바로 이 하나라는 사실이다.
// 잎마다 값을 따로 두는 순간 이 장은 실패한다.
function arrivalAt(t) {
  const amp = liveAmp(t);
  if (amp <= 0.01) return 0;
  const k = edgeIndex(t);
  if (k < 0) return 0;
  return pulse(t, T0 + k * PERIOD + TRAVEL, 0.035, 0.22) * amp;
}

// ── 클럭 도메인 ───────────────────────────────────────────────
// 깜빡이는 속도는 비율 그대로가 아니다. 45 대 1 을 화면에 그대로 넣으면
// 한쪽은 보이지 않는다. 그래서 사실은 숫자가 말하고, 깜빡임은 '서로 다르고
// 서로에게 맞추지 않는다'만 말한다. 배수가 아닌 값으로 골라 두어 여섯이
// 한 박자로 겹치는 프레임이 없다.
const DOMAINS = [
  { key: 'CORE', ratio: '×45', hz: '4.5 GHz', rate: 3.10, off: 0.00, lead: true },
  { key: 'RING', ratio: '×30', hz: '3.0 GHz', rate: 2.35, off: 0.41 },
  { key: 'IMC', ratio: '×30', hz: '3000 MHz', rate: 1.90, off: 0.73 },
  { key: 'PCIE', ratio: '×1', hz: '100 MHz', rate: 1.45, off: 0.17 },
  { key: 'PCH', ratio: '×1', hz: '100 MHz', rate: 1.07, off: 0.59 },
  { key: 'CARD', ratio: 'CDR', hz: '데이터에서', rate: 0.73, off: 0.31 }
];

const DOM_IN = 5.45, DOM_OUT = 8.05;

function domAlpha(t, i) {
  return span(t, DOM_IN + i * 0.22, DOM_IN + 0.5 + i * 0.22) * (1 - span(t, DOM_OUT, DOM_OUT + 0.45));
}

// 톱니 하나. 딱 켜졌다가 잦아든다. 표시등의 문법이다.
function blink(d, t) {
  const p = ((t * d.rate + d.off) % 1 + 1) % 1;
  return p < 0.34 ? 1 - p / 0.34 : 0;
}

// 윤곽은 cpuDetail·pchDetail·ioDetail 이 실제로 그린 사각형 위에 앉는다.
// 없는 자리에 테를 두르면 도메인이 아니라 그림이 된다.
function domainRect(key, a) {
  const y = DIE_Y + 0.15;
  if (key === 'CORE') {
    for (let i = 0; i < 2; i++) {
      const r0 = coreRect(i, 0), r3 = coreRect(i, 3);
      rectY(r0.x0 - 1, r0.z0 - 1, r0.x1 + 1, r3.z1 + 1, y, a, 1.2);
    }
  } else if (key === 'RING') {
    rectY(CX - 36, CZ - 36, CX + 36, CZ + 36, y, a, 1.2);
  } else if (key === 'IMC') {
    rectY(CX + 34, CZ - 30, CX + 39, CZ + 30, y, a, 1.2);
  } else if (key === 'PCIE') {
    rectY(CX - 30, CZ + 34, CX + 30, CZ + 39, y, a, 1.2);
  } else if (key === 'PCH') {
    rectY(PX - 22, PZ - 22, PX + 22, PZ + 22, PCH_Y + 0.2, a, 1.2);
  } else {
    rectY(IX - 88, IZ - 26, IX + 88, IZ + 26, 8.5, a, 1.2);
  }
}

// 비율을 도메인 옆에 작게 적는다. 다이 안쪽 넷은 서로 다른 방향으로
// 밀어 두어야 카메라가 물러선 뒤에도 겹치지 않는다.
const DOM_TAG = [
  { pos: [CX - 21, DIE_Y, CZ - 30], s: '코어 ×45', dx: -7, dy: -9, align: 'right', die: true },
  { pos: [CX, DIE_Y, CZ - 36], s: '링 ×30', dx: 0, dy: -10, align: 'center', die: true },
  { pos: [CX + 36.5, DIE_Y, CZ], s: 'IMC ×30', dx: 9, dy: 0, align: 'left', die: true },
  { pos: [CX, DIE_Y, CZ + 36.5], s: 'PCIE ×1', dx: 0, dy: 11, align: 'center', die: true },
  { pos: [PX, PCH_Y, PZ], s: 'PCH ×1', dx: 0, dy: -15, align: 'center', die: false },
  { pos: [IX, 14, IZ], s: 'CARD · CDR', dx: 0, dy: -17, align: 'center', die: false }
];

// ── 자 ────────────────────────────────────────────────────────
const DDR = busByName('DDR');
const TRACE_MM = DDR.length;                        // 57 mm
const TRACE_CYC = TRACE_MM / MM_PER_CYCLE;          // 1.7 클럭

export default {
  id: 's02',
  no: '02',
  title: 'THE ONLY METRONOME',
  kr: '유일한 박자',
  line: '보드를 가로지르는 클럭선은 없다.',
  nums: [
    'BCLK 100 MHz × 45 = 4.5 GHz',
    '1 클럭 = 222 ps',
    '다이 스큐 < 10 ps',
    '한 클럭에 33 mm (FR4)',
    'DDR5-6000 · 3000 MHz 클럭'
  ],
  dur: DUR,
  keyT: 3.975,

  camAt(t) {
    // 다이 바로 위로 올라가 거의 내려다본다. 트리가 평면으로 읽혀야
    // '길이가 같다'가 눈에 보이므로, 가까워지는 만큼 dolly 를 올려
    // 원근을 빼낸다. 그다음 물러서서 보드 전체, 마지막에 자를 놓을 복도.
    const push = inOut3(span(t, 0.15, 1.9));
    const back = inOut3(span(t, 5.0, 6.5));
    const lay = inOut3(span(t, 7.6, 8.9));
    const lane = { x0: -152, y0: -4, z0: -106, x1: 64, y1: 30, z1: 16 };

    let box = lerpBox(BOX.cpu, BOX.die, push);
    box = lerpBox(box, BOX.all, back);
    box = lerpBox(box, lane, lay);

    return {
      focus: box,
      yaw: mix(mix(HOME.yaw, -0.22, push), -0.36, back),
      pitch: mix(mix(HOME.pitch, 1.10, push), 0.94, back),
      dolly: mix(mix(HOME.dolly, 2400, push), 1900, back),
      flatten: mix(mix(0, 0.58, push), 0.42, back),
      fill: 0.88
    };
  },

  render(t, env) {
    const q = env.quality;
    const wide = span(t, 5.0, 6.2);
    const arr = arrivalAt(t);
    // 도메인 구간에서는 여덟 코어가 CORE 도메인의 박자로 함께 뛴다.
    const beat = blink(DOMAINS[0], t) * domAlpha(t, 0) * 0.8;

    drawMachine(t, {
      power: { board: 1, vrm: 1, cpu: 1, mem: 1, pch: 1, io: 1, disk: 1 },
      quality: q,
      focus: t < 5.2 ? ['cpu'] : (t < 7.9 ? ['cpu', 'pch', 'io', 'mem'] : ['cpu', 'mem']),
      wires: mix(0.25, 1, wide),
      signals: span(t, 6.0, 6.8) * (1 - span(t, 7.6, 8.2)) * 0.6,
      busOnly: ['DDR', 'PCIE'],
      busLabels: false,
      cpu: {
        labels: t < 2.85,
        // 여덟이 같은 값으로 켜진다. 코어마다 값을 달리 주면 안 된다.
        busy: () => Math.max(arr, beat)
      }
    });

    drawPll(t, q);
    drawTree(t);
    drawEdge(t);
    drawArrival(t, arr);
    drawPaths(t);
    drawDomains(t);
    drawStack(t);
    drawRuler(t, q);
  }
};

// ── PLL ───────────────────────────────────────────────────────
// 기준이 들어오는 자리. 보드에서 오는 100 MHz 는 여기까지만 오고,
// 그다음부터는 다이 안쪽의 일이다. 이 선이 보드를 도는 클럭선으로
// 읽히면 이 장 전체가 거짓말이 되므로, 짧게 점선으로만 그린다.
function drawPll(t, q) {
  const a = span(t, 0.3, 0.85) * (1 - span(t, 5.4, 6.1));
  if (a <= 0.02) return;

  rectY(PLL_X0, ROOT_Z - 6, PLL_X1, ROOT_Z + 6, DIE_Y, 0.35 * a, 1.2);
  if (q > 0) {
    for (let i = 0; i < 3; i++) {
      const z = ROOT_Z - 3 + i * 3;
      R.line([PLL_X0, DIE_Y, z], [PLL_X1, DIE_Y, z], 0.16 * a);
    }
  }

  const rv = span(t, 0.4, 1.0);
  R.line([CX - 52, PKG_Y, ROOT_Z], [PLL_X0, PKG_Y, ROOT_Z], 0.35 * a, 1, rv, 1);
  if (t > 0.95) R.text3([CX - 46, PKG_Y, ROOT_Z], 'BCLK 100 MHz', 8, 0.45 * a, 0, -10);

  const m = span(t, 1.85, 2.35);
  if (m > 0) {
    const cx = (PLL_X0 + PLL_X1) / 2;
    R.text3([cx, DIE_Y, ROOT_Z], '×45', 10, 0.7 * a * m, -2, -10);
    R.text3([cx, DIE_Y, ROOT_Z], '4.5 GHz', 8, 0.45 * a * m, -2, 10);
  }
}

// ── 트리 ──────────────────────────────────────────────────────
// 한 층씩 자란다. 줄기가 서고, 갈라지고, 갈라지고, 여덟 잎이 코어 위에 앉는다.
function drawTree(t) {
  const fade = 1 - span(t, 5.3, 6.3) * 0.55;
  for (let i = 0; i < SEGS.length; i++) {
    const s = SEGS[i];
    const w = LEVEL_WIN[s.level];
    const r = out3(span(t, w[0] + s.n * 0.011, w[1] + s.n * 0.011));
    if (r <= 0) continue;
    R.line([s.ax, TREE_Y, s.az], [s.bx, TREE_Y, s.bz],
      (s.level === 0 ? 0.45 : 0.35) * fade, 1.6 - s.level * 0.15, r);
  }

  // 잎 끝의 눈금. 여덟 개가 지어낸 자리가 아니라 코어 사각형 한가운데에
  // 떨어진다는 표시다.
  const lf = span(t, 2.6, 2.95) * fade;
  if (lf <= 0.02) return;
  for (let i = 0; i < LEAVES.length; i++) {
    const s = LEAVES[i];
    R.line([s.bx - 2.6, TREE_Y, s.bz], [s.bx + 2.6, TREE_Y, s.bz], 0.55 * lf, 1.2);
  }
}

// 살아 있는 신호. 이 장에서 사다리 위쪽 세 단을 쓰는 것은 이것 하나다.
function drawEdge(t) {
  const amp = liveAmp(t);
  if (amp <= 0.02) return;
  const head = headAt(t);
  if (head <= 0) return;

  for (let i = 0; i < SEGS.length; i++) {
    const s = SEGS[i];
    if (head <= s.d0) continue;
    const a = [s.ax, TREE_Y, s.az], b = [s.bx, TREE_Y, s.bz];
    if (head < s.d1) {
      R.glowLine(a, b, 0.85 * amp, 1.5, (head - s.d0) / (s.d1 - s.d0));
    } else {
      const f = 1 - (head - s.d1) / TAIL;
      if (f > 0) R.glowLine(a, b, 0.85 * amp * f, 1.4);
    }
  }
}

// 도착. 여덟 잎이 한 프레임에 켜진다. 하나씩 켜지면 이 장은 실패한다.
function drawArrival(t, f) {
  if (f <= 0.02) return;
  const y = DIE_Y + 0.25;
  for (let i = 0; i < CORE_ORDER.length; i++) {
    const c = CORE_ORDER[i];
    const r = coreRect(c[0], c[1]);
    R.fillY(r.x0, r.z0, r.x1, r.z1, y, 0.28 * f);
    rectY(r.x0, r.z0, r.x1, r.z1, y, 0.85 * f, 1.4);
  }
  R.text3([ROOT_X, DIE_Y, CZ + 42], '여덟 잎, 같은 프레임', 10, 0.85 * f, 0, 12);
}

// ── 경로 여덟 줄 ──────────────────────────────────────────────
// 트리를 펴서 여덟 줄로 눕힌다. 줄의 길이가 눈으로 같고, 파면 표시가
// 여덟 줄 위에서 늘 같은 자리에 있다. 도착을 두 번 말하는 셈인데,
// 한 번은 칩 위에서 한 번은 자로.
function drawPaths(t) {
  const a = span(t, 2.5, 3.0) * (1 - span(t, 5.3, 5.9));
  if (a <= 0.02) return;
  const sa = R.safeArea();
  const w = Math.min(148, (sa.x1 - sa.x0) * 0.30);
  if (w < 60) return;

  const x = sa.x0;
  const rowH = 8;
  const top = sa.y1 - 7 * rowH - 40;
  const head = clamp(headAt(t) / TREE_LEN, 0, 1) * liveAmp(t);
  const px = x + w * head;

  R.textS(x, top - 13, 'PLL → CORE  ×8', 8, 0.35 * a, 'left');

  for (let i = 0; i < 8; i++) {
    const y = top + i * rowH;
    R.lineS(x, y, x + w, y, 0.22 * a, 1);
    R.lineS(x, y - 2.5, x, y + 2.5, 0.28 * a, 1);
    R.lineS(x + w, y - 2.5, x + w, y + 2.5, 0.28 * a, 1);
    if (head > 0.01 && head < 0.995) R.lineS(px, y - 3, px, y + 3, 0.85 * a, 1.4);
  }

  R.textS(x, sa.y1 - 27, '여덟 경로, 같은 길이', 10, 0.55 * a, 'left');
  const s = span(t, 3.25, 3.7) * a;
  if (s > 0.02) {
    R.textS(x, sa.y1 - 9, 'DIE SKEW < ' + SKEW_PS + ' ps', 11, 0.7 * s, 'left', 'middle', 500);
    R.textS(x + w + 8, sa.y1 - 9, '한 클럭의 ' + SKEW_PCT + ' %', 8, 0.35 * s, 'left');
  }
}

// ── 도메인 ────────────────────────────────────────────────────
// 각자의 박자로 깜빡인다. 서로를 잇는 선은 그리지 않는다. 그런 선이
// 실제로 없기 때문이고, 하나 그리는 순간 이 장의 제목이 무너진다.
function drawDomains(t) {
  // 다이 안쪽 넷의 라벨은 카메라가 다 물러서기 전에 물린다. 보드 전체에서
  // 다이는 손톱만 해서, 그 위에 넉 줄을 올리면 읽히지 않는다.
  const near = 1 - span(t, 6.4, 7.0);

  for (let i = 0; i < DOMAINS.length; i++) {
    const d = DOMAINS[i];
    const a = domAlpha(t, i);
    if (a <= 0.02) continue;
    const b = blink(d, t);
    domainRect(d.key, (0.16 + (d.lead ? 0.54 : 0.29) * b) * a);

    const g = DOM_TAG[i];
    const ta = a * (g.die ? near : 1);
    if (ta > 0.02) R.text3(g.pos, g.s, 7, 0.45 * ta, g.dx, g.dy, g.align);
  }

  // 두 개의 진실. DDR 은 스트로브를 데이터와 함께 보내고, 직렬 링크는
  // 데이터에서 클럭을 되살린다. 둘 다 '클럭선이 따로 없다'의 다른 얼굴이다.
  const tag = span(t, 6.6, 7.1) * (1 - span(t, DOM_OUT, DOM_OUT + 0.4));
  if (tag > 0.02) {
    R.text3([-5.5, 1, MZ], 'DDR · DQS 동봉', 7, 0.45 * tag, 0, 13);
    R.text3([96, 1, 130], 'SATA · CDR', 7, 0.45 * tag, 0, 12);
    const sa = R.safeArea();
    R.textS((sa.x0 + sa.x1) / 2, sa.y1 - 26, '보드를 가로지르는 클럭선은 없다.', 11, 0.55 * tag, 'center', 'middle', 500);
  }
}

// 비율과 주파수는 여기에 적는다. 깜빡이는 것은 숫자 쪽이다.
function drawStack(t) {
  const a0 = span(t, 5.6, 6.1) * (1 - span(t, 7.9, 8.4));
  if (a0 <= 0.02) return;
  const sa = R.safeArea();
  const w = Math.min(184, (sa.x1 - sa.x0) * 0.42);
  if (w < 96) return;
  const right = sa.x1;
  const left = right - w;
  const top = sa.y0 + 20;

  R.textS(left, top - 18, 'CLOCK DOMAINS', 8, 0.35 * a0, 'left');
  R.lineS(left, top - 10, right, top - 10, 0.22 * a0, 1);

  for (let i = 0; i < DOMAINS.length; i++) {
    const d = DOMAINS[i];
    const a = domAlpha(t, i) * a0;
    if (a <= 0.02) continue;
    const b = blink(d, t);
    const y = top + i * 16;
    R.textS(left, y, d.key, 9, 0.45 * a, 'left');
    R.textS(left + w * 0.42, y, d.ratio, 9, 0.45 * a, 'left');
    R.textS(right, y, d.hz, 10, (0.22 + (d.lead ? 0.63 : 0.33) * b) * a, 'right');
  }
  R.textS(left, top + DOMAINS.length * 16 + 4, '기준 100 MHz 하나 · 블록마다 제 PLL', 8, 0.35 * a0, 'left');
}

// ── 자 ────────────────────────────────────────────────────────
// 보드 평면에 눕힌다. 33 mm 막대와 CPU→DIMM 배선이 같은 평면에서 나란히
// 놓여야 비교가 정직하다. 도표로 옆에 세우면 그건 비교가 아니라 삽화다.
function drawRuler(t, q) {
  const a = span(t, 8.1, 8.6);
  if (a <= 0.02) return;
  const y = 0.75;
  const x0 = DDR.path[0][0], x1 = DDR.path[1][0], z = DDR.path[0][1];
  const rz = z + 26;

  const rv = span(t, 8.15, 8.85);
  R.glowLine([x0, y, z], [x1, y, z], 0.85 * a, 1.5, rv);
  cap(x0, z, y, 0.55 * a);
  if (rv > 0.98) cap(x1, z, y, 0.55 * a);
  R.text3([(x0 + x1) / 2, y, z], 'CPU → DIMM  ' + TRACE_MM.toFixed(0) + ' mm', 9, 0.7 * a, 0, -13);

  // 한 클럭. 왼쪽 끝을 배선과 맞춰야 길이가 눈으로 비교된다.
  const rr = span(t, 8.65, 9.15);
  if (rr <= 0) return;
  const xc = x0 + MM_PER_CYCLE;
  R.glowLine([x0, y, rz], [xc, y, rz], 0.85 * a * rr, 1.5, rr);
  cap(x0, rz, y, 0.55 * a * rr);
  cap(xc, rz, y, 0.55 * a * rr);
  if (q > 0) {
    for (let i = 1; i < 5; i++) {
      const tx = x0 + MM_PER_CYCLE * i / 5;
      R.line([tx, y, rz - 2], [tx, y, rz + 2], 0.28 * a * rr);
    }
  }
  R.text3([(x0 + xc) / 2, y, rz], '1 CYCLE', 11, 0.85 * a * rr, 0, 13);
  R.text3([(x0 + xc) / 2, y, rz], PS_TXT + ' ps · ' + MM_TXT + ' mm', 8, 0.45 * a * rr, 0, 25);

  // 막대를 배선 위로 올려 대 본다. 남는 만큼이 이 장의 결론이다.
  const g = span(t, 9.1, 9.55);
  if (g <= 0) return;
  R.line([xc, y, rz], [xc, y, z], 0.28 * g, 1, 1, 1);
  R.line([xc, y, z], [x1, y, z], 0.45 * g, 1.4, g, 2);
  R.text3([(xc + x1) / 2, y, z], '= ' + TRACE_CYC.toFixed(1) + ' 클럭', 9, 0.7 * g, 0, 14);

  const sa = R.safeArea();
  const cx = (sa.x0 + sa.x1) / 2;
  R.textS(cx, sa.y1 - 26, '한 클럭 동안 신호는 ' + MM_TXT + ' mm 를 간다.', 11, 0.7 * a * rr, 'center', 'middle', 500);
  const g2 = span(t, 9.35, 9.75);
  if (g2 > 0.02) R.textS(cx, sa.y1 - 9, '배선 하나가 그보다 길다.', 10, 0.55 * g2, 'center');
}

// 자의 끝동. 배선과 직각으로 세운다.
function cap(x, z, y, a) {
  R.line([x, y, z - 4.5], [x, y, z + 4.5], a, 1.2);
}
