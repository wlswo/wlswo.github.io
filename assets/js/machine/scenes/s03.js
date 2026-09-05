// 03 · THE STAIRCASE — 계단
//
// 일을 같은 길이의 칸으로 잘라 나눈다. 칸과 칸 사이에 있는 것은 빈 금이
// 아니라 플립플롭 한 줄이다 — 파이프라인은 사실 그 레지스터들이고, 단은
// 그 사이에 낀 논리일 뿐이다. 한 명령이 끝에서 끝까지 가는 데 다섯 클럭이
// 걸리는데도 줄이 차고 나면 매 클럭 하나가 나온다. 지연과 처리량이 서로
// 다른 숫자라는 것, 그것이 이 장의 전부다.
//
// 그리고 계단은 아무도 긋지 않는다. 뒤에 온 명령이 앞의 명령보다 한 단씩
// 뒤에 있을 뿐인데, 그 어긋남이 쌓여 저절로 대각선이 된다.

import * as R from '../core/raster.js';
import { span, mix } from '../core/timeline.js';
import { inOut3, out3 } from '../core/ease.js';
import { pick2 } from '../core/hash.js';
import { drawMachine, lerpBox, HOME } from './common.js';
import { BOX, coreRect, DIE_Y } from '../geom/parts.js';
import { rectY } from '../geom/detail.js';

const DUR = 12;

// 07장이 실행 중인 코어로 고른 그 사각형에서 자란다. 도표가 칩 옆에 따로
// 나타나면 그건 도표일 뿐이고, 칩에서 자라 나와야 칩의 이야기가 된다.
const CORE = coreRect(0, 1);

// cpuDetail 이 코어 안에 이미 그려 둔 5×3 격자. 안쪽으로 1.2 물린 값도 그
// 함수에서 그대로 가져왔다. 그래서 이 판의 첫 칸막이는 새로 그은 선이
// 아니라, 원래 거기 있던 격자선 위에 정확히 겹쳐 앉는다.
const SRC = { x0: CORE.x0 + 1.2, z0: CORE.z0 + 1.2, x1: CORE.x1 - 1.2, z1: CORE.z1 - 1.2 };

// 다 펼쳐진 판. 다이 평면 안에서 자란다 — 세워 들지 않는다. 눕힌 채로
// 커져야 이것이 칩의 일부라는 말이 유지된다.
const BIG = { x0: -190, z0: -140, x1: -40, z1: 30 };

// 판을 다이 위 1.2mm 에 띄운다. 화가 알고리즘이 선에 0.35 만큼 앞당김을
// 주므로 그보다 덜 띄우면 코어의 회로선이 판을 뚫고 올라온다.
const Y = DIE_Y + 1.2;

const N5 = 5;          // 생각 속의 파이프라인
const NDEEP = 18;      // 실제 x86 코어. 14~20단 사이의 한 값
const ROWS = 16;       // 가로줄 하나가 명령 하나다

// 화면에서의 한 클럭. 실제로는 4.5 GHz 에서 222 ps 다. 눈이 셀 수 있는
// 가장 느린 속도로 늦춰 두고, 숫자는 계기가 말한다.
const T0 = 4.2;
const TICK = 0.40;

const STAGE = [
  ['IF', '가져오기'], ['ID', '해독'], ['EX', '실행'], ['MEM', '메모리'], ['WB', '되쓰기']
];

const MNEM = ['MOV', 'ADD', 'CMP', 'XOR', 'SHL', 'LEA', 'SUB', 'AND', 'TEST', 'OR'];

function cycleF(t) { return (t - T0) / TICK; }
function cycleN(t) { return Math.floor(cycleF(t)); }

// 발행 표. 0번 하나를 먼저 혼자 보낸다. 그 다섯 클럭 동안 파이프가 거의
// 비어 있는 것을 보여 주지 않으면, 뒤에 나올 계단이 그냥 무늬로 읽힌다.
// 그 하나가 빠져나가는 클럭부터 매 클럭 하나씩 밀어 넣는다.
function issueAt(k) { return k === 0 ? 0 : 4 + k; }

function mnem(k) { return MNEM[pick2(k, 7919, MNEM.length)]; }

// 지금 파이프 안에 있는 것. 다섯 단이면 최대 다섯 개다.
function inFlight(T) {
  let n = 0;
  for (let k = 0; k < ROWS; k++) {
    const b = T - issueAt(k);
    if (b >= 0 && b < N5) n++;
  }
  return n;
}

// T 클럭까지 끝까지 나간 명령 수. 은퇴는 프로그램 순서대로 일어나므로
// 발행 순서를 그대로 세면 된다.
function retiredBy(T) {
  let n = 0;
  for (let k = 0; k < ROWS; k++) if (T - issueAt(k) >= N5) n++;
  return n;
}

function plate(p) {
  return {
    x0: mix(SRC.x0, BIG.x0, p), x1: mix(SRC.x1, BIG.x1, p),
    z0: mix(SRC.z0, BIG.z0, p), z1: mix(SRC.z1, BIG.z1, p)
  };
}

// 칸 하나. 가로는 단, 세로는 명령이다. 시간축은 그리지 않는다 — 이 판은
// 한 클럭의 스냅숏이고, 계단은 그 한 장 안에 이미 들어 있다.
function cellAt(pl, cols, rows, c, r) {
  const bw = (pl.x1 - pl.x0) / cols;
  const lh = (pl.z1 - pl.z0) / rows;
  const mx = bw * 0.10, mz = lh * 0.16;
  const x0 = pl.x0 + bw * c + mx;
  const z0 = pl.z0 + lh * r + mz;
  return { x0, z0, x1: x0 + bw - mx * 2, z1: z0 + lh - mz * 2 };
}

const PLATE = { x0: BIG.x0 - 16, y0: Y - 6, z0: BIG.z0 - 20, x1: BIG.x1 + 16, y1: Y + 6, z1: BIG.z1 + 24 };
const PLATE_WIDE = { x0: BIG.x0 - 34, y0: Y - 6, z0: BIG.z0 - 30, x1: BIG.x1 + 34, y1: Y + 6, z1: BIG.z1 + 30 };

export default {
  id: 's03',
  no: '03',
  title: 'THE STAIRCASE',
  kr: '계단',
  line: '한 명령에 다섯 클럭, 그런데 매 클럭 하나가 나온다.',
  nums: ['5단은 생각 · 칩은 14–20단', '지연 5클럭 · 처리량 1클럭', '단 경계 하나 = 222 ps', '코어당 초당 45억 개 은퇴'],
  dur: DUR,
  keyT: 9.8,

  camAt(t) {
    // 코어 하나로 밀어 들어갔다가, 그 사각형이 자라는 만큼 물러난다.
    // 도표가 되는 장이므로 dolly 를 크게 올려 원근을 뺀다 — 칸의 폭이 서로
    // 달라 보이면 '같은 시간으로 잘랐다'는 주장이 그림에서 먼저 무너진다.
    const a = inOut3(span(t, 0.3, 2.2));
    const b = inOut3(span(t, 2.3, 4.1));
    const c = inOut3(span(t, 10.4, 11.4));

    let box = lerpBox(BOX.cpu, BOX.core0, a);
    box = lerpBox(box, PLATE, b);
    box = lerpBox(box, PLATE_WIDE, c);

    return {
      focus: box,
      yaw: mix(mix(HOME.yaw, -0.40, a), -0.22, b),
      pitch: mix(mix(HOME.pitch, 0.94, a), 1.08, b),
      dolly: mix(mix(HOME.dolly, 1650, a), 2350, b),
      flatten: mix(mix(0, 0.28, a), 0.52, b),
      fill: mix(0.86, 0.90, b)
    };
  },

  render(t, env) {
    const q = env.quality;

    const grow = inOut3(span(t, 2.3, 4.1));
    const pl = plate(grow);
    const morph = inOut3(span(t, 10.4, 11.2));
    const shallow = 1 - morph;

    // 판이 자라 다이를 덮으므로 밑의 회로는 물러나되 사라지지는 않는다.
    // 이 도표가 어느 사각형에서 나왔는지가 끝까지 보여야 한다.
    drawMachine(t, {
      power: { board: 1, vrm: 0.4, cpu: mix(1, 0.45, grow), mem: 0.4, pch: 0.4, io: 0.4, disk: 0.4 },
      quality: q,
      focus: ['cpu'],
      wires: mix(0.5, 0.12, grow),
      signals: 0,
      cpu: { labels: false, busy: (i, j) => (i === 0 && j === 1 ? 1 : 0) }
    });

    markCore(t);

    const T = cycleN(t);
    const frac = t < T0 ? 0 : cycleF(t) - T;
    // 전역 틱. 한 프레임 동안 모든 경계가 한꺼번에 번쩍이고, 그 한 번에
    // 판 위의 모든 것이 한 칸씩 옮겨 간다. 클럭이 하는 일이 그것뿐이다.
    const edge = t < T0 ? 0 : Math.max(0, 1 - frac / 0.13);

    const on = span(t, 1.8, 2.6);

    drawPlate(pl, N5, on * shallow, grow, edge, q);
    drawStages(t, pl, shallow);
    drawRegisterNote(t, pl, shallow);
    drawFlow(pl, T, on * shallow, q);
    drawRetire(pl, T, frac, on * shallow);

    if (morph > 0.02) {
      drawPlate(pl, NDEEP, morph, 1, edge, q);
      drawDeep(pl, T, frac, morph, q);
    }

    drawNarration(t);
    drawCounters(t, T, morph);
    drawEndNote(t);
  }
};

// ── 어느 사각형에서 나오는가 ──────────────────────────────────
// 07장이 고른 그 코어다. 안에 이미 그려져 있는 5×3 격자를 가리키기만 한다.
function markCore(t) {
  const a = span(t, 0.8, 1.6) * (1 - span(t, 2.9, 3.6));
  if (a <= 0.02) return;
  const cx = (CORE.x0 + CORE.x1) / 2;
  rectY(CORE.x0, CORE.z0, CORE.x1, CORE.z1, DIE_Y + 0.2, 0.55 * a, 1.4);
  R.text3([cx, DIE_Y, CORE.z0], '코어 하나', 10, 0.7 * a, 0, -14);
  R.text3([cx, DIE_Y, CORE.z1], '이 다섯 칸이 그대로 다섯 단이 된다', 8, 0.35 * a, 0, 13);
}

// ── 판과 이중선 ───────────────────────────────────────────────
function drawPlate(pl, n, a, grow, edge, q) {
  if (a <= 0.02) return;
  rectY(pl.x0, pl.z0, pl.x1, pl.z1, Y, 0.28 * a);

  const bw = (pl.x1 - pl.x0) / n;
  const gap = Math.min(2.2, bw * 0.12);
  // 이 이중선이 레지스터다. 단과 단 사이에 있는 것은 나누는 금이 아니라
  // 붙잡는 것이다. 한 줄로 그으면 칸막이가 되고, 두 줄로 그어야 값이 한
  // 클럭 동안 갇혀 있다가 다음 칸으로 넘어간다는 말이 된다.
  const w = 0.22 + 0.48 * edge;
  for (let i = 0; i <= n; i++) {
    const x = pl.x0 + bw * i;
    R.line([x - gap / 2, Y, pl.z0], [x - gap / 2, Y, pl.z1], w * a, 1);
    R.line([x + gap / 2, Y, pl.z0], [x + gap / 2, Y, pl.z1], w * a, 1);
  }

  // 가로줄. 한 줄이 명령 하나다. 코어 안의 격자는 세 줄뿐이므로, 줄은 판이
  // 충분히 자란 뒤에야 들어온다. 구조선이니 거의 보이지 않게 둔다.
  if (q === 0) return;
  const rows = a * span(grow, 0.45, 0.95);
  if (rows <= 0.02) return;
  for (let i = 1; i < ROWS; i++) {
    const z = pl.z0 + (pl.z1 - pl.z0) * i / ROWS;
    R.line([pl.x0, Y, z], [pl.x1, Y, z], 0.08 * rows);
  }
}

function drawStages(t, pl, a) {
  const k = out3(span(t, 3.6, 4.5)) * a;
  if (k <= 0.02) return;
  const bw = (pl.x1 - pl.x0) / N5;
  for (let i = 0; i < N5; i++) {
    const x = pl.x0 + bw * (i + 0.5);
    R.text3([x, Y, pl.z0], STAGE[i][0], 10, 0.7 * k, 0, -21);
    R.text3([x, Y, pl.z0], STAGE[i][1], 8, 0.35 * k, 0, -9);
  }
}

// 이중선에 딱 한 번 이름을 붙인다. 이 장에서 가장 중요한 한 문장이므로
// 화면에 두 번 나오지 않게 한다.
function drawRegisterNote(t, pl, a) {
  const k = span(t, 4.8, 5.5) * (1 - span(t, 7.6, 8.3)) * a;
  if (k <= 0.02) return;
  const x = pl.x0 + (pl.x1 - pl.x0) * (2 / N5);
  R.line([x, Y, pl.z1], [x, Y, pl.z1 + 12], 0.35 * k);
  R.text3([x, Y, pl.z1 + 12], '파이프라인 레지스터', 10, 0.7 * k, 0, 13);
  R.text3([x, Y, pl.z1 + 12], '단 경계 = 플립플롭 한 줄 · 222 ps', 8, 0.42 * k, 0, 25);
}

// ── 흐름 ──────────────────────────────────────────────────────
// 글리프는 미끄러지지 않는다. 레지스터가 한 클럭 동안 붙잡고 있다가 틱에서
// 한 칸을 건너뛴다. 부드럽게 흐르게 하면 그건 파이프라인이 아니라
// 컨베이어 벨트이고, 경계에 왜 플립플롭이 있는지 설명할 수 없게 된다.
//
// 계단은 여기서 저절로 생긴다. k번 줄의 명령은 k−1번 줄의 명령보다 정확히
// 한 단 뒤에 있다. 그 어긋남을 줄마다 쌓아 놓은 것이 대각선이다.
function drawFlow(pl, T, a, q) {
  if (a <= 0.02 || T < 0) return;

  for (let k = 0; k < ROWS; k++) {
    const b = T - issueAt(k);
    if (b < 0 || b >= N5) continue;

    // 꼬리. 지난 클럭에 있던 칸이다. 혼자 가는 동안은 지나온 길을 다 남겨
    // 한 명령이 다섯 단을 차례로 밟는다는 것을 보이고, 줄이 찬 뒤에는 한
    // 칸이면 족하다 — 나머지는 이미 옆 줄의 명령이 차지하고 있다.
    const depth = k === 0 ? 4 : (q === 2 ? 2 : 1);
    for (let d = 1; d <= depth; d++) {
      const pb = b - d;
      if (pb < 0) break;
      const c = cellAt(pl, N5, ROWS, pb, k);
      R.fillY(c.x0, c.z0, c.x1, c.z1, Y, (0.16 / d) * a);
      rectY(c.x0, c.z0, c.x1, c.z1, Y, (0.28 / d) * a);
    }

    const c = cellAt(pl, N5, ROWS, b, k);
    R.fillY(c.x0, c.z0, c.x1, c.z1, Y, 0.22 * a);
    rectY(c.x0, c.z0, c.x1, c.z1, Y, 0.7 * a, 1.4);
    R.text3([(c.x0 + c.x1) / 2, Y, (c.z0 + c.z1) / 2], mnem(k), 10, 1.0 * a);
  }
}

// 은퇴. 나간 것마다 판 오른쪽에 눈금이 하나씩 남는다. 매 클럭 하나씩
// 늘어나는 그 눈금이 이 장의 결론 그 자체다. 방금 나간 하나에만 빛을
// 준다 — 이 장에서 발광을 쓰는 유일한 자리다.
function drawRetire(pl, T, frac, a) {
  if (a <= 0.02 || T < 0) return;
  for (let k = 0; k < ROWS; k++) {
    const b = T - issueAt(k);
    if (b < N5) continue;
    const c = cellAt(pl, N5, ROWS, N5 - 1, k);
    const zc = (c.z0 + c.z1) / 2;
    R.line([pl.x1 + 2, Y, zc], [pl.x1 + 8, Y, zc], 0.28 * a, 1);
    if (b === N5) {
      const g = Math.max(0, 1 - frac / 0.3) * a;
      if (g > 0.02) R.glowLine([pl.x1, Y, c.z0], [pl.x1, Y, c.z1], 0.85 * g, 1.4);
    }
  }
}

// ── 열여덟 단 ─────────────────────────────────────────────────
// 다섯은 생각이고 칩은 열넷에서 스물이다. 칸이 늘면 계단은 길어지고
// 완만해진다. 정상 상태에서는 열여덟 개가 동시에 떠 있고, 그림 자체는
// 더 이상 변하지 않는다 — 바뀌는 것은 칸 안에 든 명령뿐이다. 그런데도
// 한 클럭에 나오는 것은 여전히 하나다.
function drawDeep(pl, T, frac, a, q) {
  for (let r = 0; r < NDEEP; r++) {
    const col = NDEEP - 1 - r;
    const c = cellAt(pl, NDEEP, NDEEP, col, r);
    R.fillY(c.x0, c.z0, c.x1, c.z1, Y, 0.22 * a);
    rectY(c.x0, c.z0, c.x1, c.z1, Y, 0.55 * a);
    if (col > 0 && q > 0) {
      const p = cellAt(pl, NDEEP, NDEEP, col - 1, r);
      R.fillY(p.x0, p.z0, p.x1, p.z1, Y, 0.12 * a);
    }
  }
  const g = Math.max(0, 1 - frac / 0.3) * a;
  if (g > 0.02) {
    const c = cellAt(pl, NDEEP, NDEEP, NDEEP - 1, 0);
    R.glowLine([pl.x1, Y, c.z0], [pl.x1, Y, c.z1], 0.85 * g, 1.4);
  }
  R.text3([(pl.x0 + pl.x1) / 2, Y, pl.z0], 'x86 · 14–20단', 10, 0.7 * a, 0, -21);
}

// ── 자막 ──────────────────────────────────────────────────────
function drawNarration(t) {
  const sa = R.safeArea();
  const cx = (sa.x0 + sa.x1) / 2;
  const y = sa.y1 - 22;

  const solo = span(t, 4.35, 4.95) * (1 - span(t, 5.6, 6.0));
  if (solo > 0.02) {
    R.textS(cx, y, '명령 하나가 다섯 단을 지난다 · 끝에서 끝까지 다섯 클럭', 9, 0.45 * solo, 'center');
  }
  const flood = span(t, 6.2, 6.8) * (1 - span(t, 7.4, 7.8));
  if (flood > 0.02) {
    R.textS(cx, y, '이제 매 클럭 하나씩 밀어 넣는다 · 나오는 것도 매 클럭 하나', 9, 0.45 * flood, 'center');
  }
  const stair = span(t, 8.1, 8.7) * (1 - span(t, 9.5, 9.9));
  if (stair > 0.02) {
    R.textS(cx, y, '아무도 계단을 그리지 않았다', 9, 0.45 * stair, 'center');
  }
}

// ── 계기 ──────────────────────────────────────────────────────
function drawCounters(t, T, morph) {
  const a = span(t, 4.3, 5.0) * (1 - span(t, 11.7, 12.0));
  if (a <= 0.02) return;
  const sa = R.safeArea();
  const right = sa.x1;
  const left = right - 176;
  const top = sa.y0 + 16;

  R.lineS(left, top - 16, right, top - 16, 0.22 * a, 1);

  const cyc = T < 0 ? 0 : T;
  const stages = Math.round(mix(N5, NDEEP, morph));
  const flight = Math.round(mix(inFlight(T), NDEEP, morph));
  // 다섯 클럭 창으로 잰다. 혼자 가는 동안은 1/5 = 0.2, 줄이 차면 1.0 이다.
  const ipc = T < N5 ? 0 : (retiredBy(T) - retiredBy(T - N5)) / N5;

  const rows = [
    ['CYCLE', String(cyc)],
    ['STAGES', String(stages)],
    ['IN FLIGHT', String(flight)],
    ['RETIRED / CYCLE', mix(ipc, 1, morph).toFixed(1)]
  ];
  for (let i = 0; i < rows.length; i++) {
    const rb = span(t, 4.5 + i * 0.18, 5.0 + i * 0.18);
    if (rb <= 0) continue;
    const y = top + i * 20;
    const slide = mix(8, 0, out3(rb));
    R.textS(left, y + slide, rows[i][0], 9, 0.42 * a * rb, 'left');
    R.textS(right, y + slide, rows[i][1], 12, 0.85 * a * rb, 'right', 'middle', 500);
  }

  // 다섯 칸 눈금. 1 · 2 · 3 · 4 · 5 로 차오르는 것을 눈으로도 세게 한다.
  const bars = a * (1 - morph);
  if (bars > 0.02) {
    for (let i = 0; i < N5; i++) {
      const bx = right - 4 - (N5 - i) * 10;
      if (i < inFlight(T)) R.fillRectS(bx, top + 88, 7, 5, 0.7 * bars);
      else R.rectS(bx, top + 88, 7, 5, 0.22 * bars, 1);
    }
  }

  R.textS(right, top + 108, '1 클럭 = 222 ps @ 4.5 GHz', 8, 0.35 * a, 'right');
  R.textS(right, top + 122, '코어당 초당 45억 개 은퇴', 8, 0.28 * a, 'right');
}

function drawEndNote(t) {
  const a = span(t, 10.6, 11.2) * (1 - span(t, 11.8, 12.0));
  if (a <= 0.02) return;
  const sa = R.safeArea();
  const cx = (sa.x0 + sa.x1) / 2;
  const y = sa.y1 - 62;
  R.textS(cx, y, '5 단 → 18 단', 12, 0.85 * a, 'center', 'middle', 500);
  R.lineS(cx - 88, y + 12, cx + 88, y + 12, 0.22 * a, 1);
  R.textS(cx, y + 26, '계단은 길어지고 완만해진다', 9, 0.45 * a, 'center');
  R.textS(cx, y + 40, '한 클럭에 하나가 나오는 것은 그대로다', 9, 0.45 * a, 'center');
}
