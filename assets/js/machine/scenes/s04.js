// 04 · CHAOS INSIDE — 안은 무질서, 밖은 순서
//
// 03장의 계단은 한 줄이었다. 그 줄이 해독 경계 뒤에서 열 갈래로 벌어진다.
// 포트마다 지연이 다르므로 7번이 5번보다 먼저 끝나고, 그것이 고장이 아니라
// 정상이다. 그런데 밖으로 나가는 문은 하나뿐이고, 그 문은 프로그램 순서로만
// 열린다 — 5번이 나눗셈을 끝내기 전에는 6번도 7번도 끝난 것이 아니다.
//
// 그래서 이 장은 잉크 하나로 약속을 한다. 판 안의 어떤 것도 0.35 를 넘지
// 않고, 온전한 잉크는 다이 가장자리를 나가는 순간에만 주어진다. 바깥세상이
// 보는 것 중에 순서를 어긴 것은 하나도 없다는 말을, 밝기로 하는 것이다.

import * as R from '../core/raster.js';
import { span, mix } from '../core/timeline.js';
import { out2, out3, inOut3 } from '../core/ease.js';
import { drawMachine, lerpBox } from './common.js';
import { DIE_Y } from '../geom/parts.js';
import { rectY } from '../geom/detail.js';

const DUR = 12;

// ── 판 ────────────────────────────────────────────────────────
// 03장이 코어 하나를 펼쳐 만든 그 판이다. 좌표와 높이를 그대로 옮겨 온다 —
// 같은 코어, 같은 클럭, 같은 평면. 장이 바뀌었다고 다른 자리에서 다시
// 시작하면 두 장은 서로 다른 두 그림이 된다.
const BIG = { x0: -196, z0: -124, x1: 4, z1: 16 };
const Y = DIE_Y + 1.2;

const FX0 = -196, FX1 = -172;      // 해독 창
const DZ0 = -110, DZ1 = -44;       // 해독 창의 깊이. 여섯 칸
const BOUND = -166;                // 리네임 경계. 여기서 순서가 사라진다
const LX0 = -158;                  // 레인의 시작. 앞쪽은 이름표 자리
const LEX0 = -134;                 // 실행이 실제로 걸어가는 구간의 시작
const LX1 = -30;                   // 레인의 끝
const LZ0 = -120, LZ1 = -34;       // 레인 밴드
const ZC = (LZ0 + LZ1) / 2;        // 벌어지기 전의 한 줄
const ROB_Z0 = -14, ROB_Z1 = -2;   // ROB 띠
const ROB_ZC = (ROB_Z0 + ROB_Z1) / 2;
const EDGE = BIG.z1;               // 다이 가장자리. 잉크는 여기서만 온전해진다
const FETCH_X = -206;              // 판 밖. 아직 들어오지 않은 것들

const DECODE_W = 6;                // 해독 폭. 실제는 4~8
const RETIRE_W = 8;                // 한 클럭에 은퇴할 수 있는 최대
const NCELL = 40;                  // 화면에 자른 ROB 창
const ROB_N = 512;                 // 실제 엔트리 수
const CELL_W = (BIG.x1 - BIG.x0) / NCELL;

// 화면에서의 한 클럭. 03장과 같은 박자다. 실제로는 4.5 GHz 에서 222 ps.
const T0 = 2.25;
const TICK = 0.36;

// ── 포트 ──────────────────────────────────────────────────────
// 열 개. 실제 코어는 10~12개다. 포트마다 지연이 다른 것, 그 하나가 이 장에서
// 벌어지는 모든 일의 원인이다. 나눗셈기만 파이프라인이 아니어서 한 번 물면
// 열네 클럭 동안 다음을 받지 못한다 — 다른 포트는 매 클럭 하나씩 받는다.
const PORTS = [
  { n: 'ALU', lat: 1, tag: 'ALU 1', pipe: true },
  { n: 'ALU', lat: 1, tag: 'ALU 1', pipe: true },
  { n: 'IMUL', lat: 3, tag: 'IMUL 3', pipe: true },
  { n: 'FADD', lat: 4, tag: 'FADD 4', pipe: true },
  { n: 'FMA', lat: 4, tag: 'FMA 4', pipe: true },
  { n: 'DIV', lat: 14, tag: 'DIV 14+', pipe: false },
  { n: 'LD', lat: 4, tag: 'LD 4', pipe: true },
  { n: 'LD', lat: 5, tag: 'LD 5', pipe: true },
  { n: 'ST', lat: 1, tag: 'ST 1', pipe: true },
  { n: 'BR', lat: 1, tag: 'BR 1', pipe: true }
];

const NLANE = PORTS.length;
const LANE_H = (LZ1 - LZ0) / NLANE;

// ── 프로그램 ──────────────────────────────────────────────────
// 손으로 적은 서른여덟 개. 난수로 뽑으면 5번이 언제 벽이 되는지가 매번
// 달라지고, 이 장의 박자는 그 한 자리에 걸려 있다.
const CODE = [
  ['MOV', 6], ['ADD', 0], ['CMP', 1], ['IMUL', 2], ['DIVSD', 5], ['ADD', 0],
  ['MOV', 7], ['XOR', 1], ['ADDSD', 3], ['MOV', 8], ['LEA', 0], ['MOV', 6],
  ['MULSD', 4], ['ADD', 1], ['CMP', 0], ['JNE', 9], ['MOV', 7], ['ADDSD', 3],
  ['SUB', 0], ['MOV', 8], ['MOV', 6], ['IMUL', 2], ['ADD', 1], ['MULSD', 4],
  ['MOV', 7], ['ADDSD', 3], ['SHL', 0], ['MOV', 8], ['CMP', 1], ['JNE', 9],
  ['MOV', 6], ['ADD', 0], ['MULSD', 4], ['MOV', 7], ['SUB', 1], ['MOV', 8],
  ['CMP', 0], ['JNE', 9]
];

// 클럭마다 몇 개를 해독하는가. 창은 여섯 칸인데 한둘만 차는 것이 보통이다 —
// 폭 6은 천장이지 속도가 아니다.
const GROUPS = [3, 2, 3, 2, 1, 2, 3, 1, 2, 2, 3, 1, 2, 2, 3, 1, 2, 3];

// 표를 미리 푼다. 매 프레임 다시 풀 것이 아니고, 무엇보다 시간에 따라
// 값이 자라면 되감기가 깨진다. 여기서 한 번 정해지면 끝이다.
const INST = (function () {
  const list = [];
  let k = 0;
  for (let c = 0; c < GROUPS.length && k < CODE.length; c++) {
    for (let g = 0; g < GROUPS[c] && k < CODE.length; g++) {
      list.push({ k: k, m: CODE[k][0], p: CODE[k][1], issue: c, slot: g });
      k++;
    }
  }

  // 발행. 피연산자가 준비되면 해독 다음 클럭에 나간다. 포트가 물려 있으면
  // 그만큼만 밀린다 — 앞의 명령을 기다려서 미는 것이 아니다.
  const free = new Array(PORTS.length).fill(0);
  for (let i = 0; i < list.length; i++) {
    const it = list[i], P = PORTS[it.p];
    it.lat = P.lat;
    it.start = Math.max(it.issue + 1, free[it.p]);
    it.done = it.start + P.lat;
    free[it.p] = it.start + (P.pipe ? 1 : P.lat);
  }

  // 은퇴. 여기서만 순서가 되살아난다. 앞의 것이 나가기 전에는 나갈 수 없고,
  // 한 클럭에 여덟까지다. 이 두 줄이 이 장의 결론 전부다.
  let cur = -1, used = 0;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    let c = Math.max(it.done, i === 0 ? 0 : list[i - 1].ret);
    if (c === cur && used >= RETIRE_W) c = cur + 1;
    if (c !== cur) { cur = c; used = 0; }
    it.ret = c;
    used++;
  }
  return list;
})();

const HELD = 6;        // 7번. 끝났는데 끝난 것이 아닌 그 하나
const SLOW = 4;        // 5번. 나눗셈

function cycleF(t) { return (t - T0) / TICK; }

function retiredBy(c) {
  let n = 0;
  for (let i = 0; i < INST.length; i++) if (INST[i].ret <= c) n++;
  return n;
}

function allocBy(c) {
  let n = 0;
  for (let i = 0; i < INST.length; i++) if (INST[i].issue <= c) n++;
  return n;
}

function inFlight(c) {
  let n = 0;
  for (let i = 0; i < INST.length; i++) if (INST[i].issue <= c && INST[i].ret > c) n++;
  return n;
}

function laneZ(i, fan) { return mix(ZC, LZ0 + (i + 0.5) * LANE_H, fan); }
function cellX(k) { return BIG.x0 + (k + 0.5) * CELL_W; }
function slotZ(s) { return DZ0 + (s + 0.5) * (DZ1 - DZ0) / DECODE_W; }

// 은퇴한 글리프가 가장자리를 향해 내려가는 길. 판 안에서는 옅고,
// 가장자리를 넘는 순간 온전한 잉크가 된다.
function exitZ(e) { return mix(ROB_ZC, 40, out2(e)); }

const START = { x0: BIG.x0 - 36, y0: Y - 6, z0: BIG.z0 - 30, x1: BIG.x1 + 36, y1: Y + 6, z1: BIG.z1 + 30 };
const FULL = { x0: BIG.x0 - 22, y0: Y - 6, z0: BIG.z0 - 14, x1: BIG.x1 + 22, y1: Y + 6, z1: 46 };
const BEAT = { x0: -206, y0: Y - 6, z0: -96, x1: -26, y1: Y + 6, z1: 30 };

export default {
  id: 's04',
  no: '04',
  title: 'CHAOS INSIDE',
  kr: '안은 무질서, 밖은 순서',
  line: '밖에서 보이는 것 중에 순서를 어긴 것은 없다.',
  nums: [
    '해독 폭 4–8 · 실행 포트 10–12',
    'ALU 1 · LD 4~5 · IMUL 3 · DIV 14+',
    'ROB 512엔트리 · 은퇴 최대 8/클럭',
    '코어 하나에 ~500개가 떠 있다',
    '실제 코드 IPC 1–3 · 폭 6은 천장'
  ],
  dur: DUR,
  keyT: 8.12,

  camAt(t) {
    // 03장의 마지막 프레임에서 그대로 이어붙는다. 각도도 배율도 그 값이다.
    // 그 다음 하는 일은 가장자리 바깥을 프레임에 넣는 것뿐이다 — 이 장의
    // 결론이 판 안이 아니라 판을 나가는 자리에서 나기 때문이다.
    const a = inOut3(span(t, 0.3, 2.2));
    const b = inOut3(span(t, 5.4, 6.4));     // 멈춰 선 칸으로 다가간다
    const c = inOut3(span(t, 7.2, 7.9));     // 삼킴은 통째로 봐야 한다
    let box = lerpBox(START, FULL, a);
    box = lerpBox(box, BEAT, b * (1 - c));
    return {
      focus: box,
      yaw: mix(-0.24, -0.19, a),
      pitch: mix(1.06, 1.10, a),
      // 도표가 되는 장이므로 원근을 거의 뺀다. 레인의 길이가 서로 달라
      // 보이면 '지연이 다르다'는 주장이 그림에서 무너진다.
      dolly: mix(2300, 2500, a),
      flatten: mix(0.56, 0.62, a),
      fill: 0.88
    };
  },

  render(t, env) {
    const q = env.quality;

    // 판 밑의 기계는 03장이 남긴 밝기 그대로 둔다. 이 도표가 어느
    // 사각형에서 나왔는지가 계속 보여야 한다.
    drawMachine(t, {
      power: { board: 1, vrm: 0.5, cpu: 0.45, mem: 0.5, pch: 0.5, io: 0.5, disk: 0.5 },
      quality: q,
      focus: ['cpu'],
      wires: 0.12,
      signals: 0,
      cpu: { labels: false, busy: (i, j) => (i === 0 && j === 1 ? 1 : 0) }
    });

    const fan = inOut3(span(t, 0.7, 2.2));
    const f = cycleF(t);
    const c = Math.floor(f);
    const frac = f - c;
    // 전역 틱. 한 프레임 동안 경계가 함께 번쩍이고, 그 한 번에 판 위의
    // 모든 것이 한 칸씩 옮겨 간다. 03장에서 정한 문법 그대로다.
    const edge = f < 0 ? 0 : Math.max(0, 1 - frac / 0.14);

    drawPlate(t, fan, edge, q);
    drawLanes(t, f, c, fan, q);
    drawFront(t, c, fan);
    drawRob(t, f, c, frac, q);
    drawExit(f, c);
    drawBeat(t, f, c, fan);

    drawPanel(t, c);
    drawNarration(t);
    drawClose(t);
  }
};

// ── 판과 경계 ─────────────────────────────────────────────────
function drawPlate(t, fan, edge, q) {
  const a = span(t, 0.2, 1.0);
  if (a <= 0.02) return;

  rectY(BIG.x0, BIG.z0, BIG.x1, BIG.z1, Y, 0.28 * a);

  // 인오더 앞단. 여섯 칸짜리 창 하나.
  rectY(FX0, DZ0, FX1, DZ1, Y, 0.22 * a);
  for (let i = 1; i < DECODE_W; i++) {
    const z = DZ0 + (DZ1 - DZ0) * i / DECODE_W;
    R.line([FX0, Y, z], [FX1, Y, z], 0.12 * a);
  }

  // 리네임 경계. 03장의 이중선과 같은 것이다 — 나누는 금이 아니라 붙잡는 것.
  // 왼쪽은 프로그램 순서이고, 오른쪽에는 순서가 없다.
  const w = (0.22 + 0.13 * edge) * a;
  R.line([BOUND - 1.2, Y, LZ0 - 8], [BOUND - 1.2, Y, LZ1 + 8], w, 1);
  R.line([BOUND + 1.2, Y, LZ0 - 8], [BOUND + 1.2, Y, LZ1 + 8], w, 1);
  const ba = span(t, 1.4, 2.2) * a;
  if (ba > 0.02) {
    R.text3([BOUND, Y, LZ0 - 8], 'RENAME', 8, 0.35 * ba, 0, -18);
    R.text3([BOUND, Y, LZ0 - 8], '여기서 순서가 사라진다', 8, 0.28 * ba, 0, -8);
  }

  // 벌어짐. 한 줄이던 밴드가 열 갈래가 된다. 갈래를 그리는 것이 아니라
  // 갈래가 놓일 자리를 벌리는 것이므로, 칸막이만 옮기면 된다.
  const la = span(t, 0.7, 1.4) * a;
  if (la <= 0.02) return;
  for (let i = 0; i <= NLANE; i++) {
    const z = mix(ZC, LZ0 + i * LANE_H, fan);
    R.line([LX0, Y, z], [LX1, Y, z], (i === 0 || i === NLANE ? 0.16 : 0.08) * la);
  }

  // 디스패치. 경계 하나에서 열 갈래로 흩어진다.
  for (let i = 0; i < NLANE; i++) {
    R.line([BOUND + 2, Y, ZC], [LX0 - 2, Y, laneZ(i, fan)], 0.16 * la * fan);
  }

  // 포트 이름표. 지연시간을 이름에 붙여 둔다 — 레인이 서로 다른 이유를
  // 다른 곳에서 설명하지 않아도 되게.
  const na = span(t, 1.6, 2.4) * a;
  if (na > 0.02 && q > 0) {
    for (let i = 0; i < NLANE; i++) {
      R.text3([LX0 + 2, Y, laneZ(i, fan)], PORTS[i].tag, 8, 0.3 * na * fan, 0, 0, 'left');
    }
  }
}

// ── 앞단 ──────────────────────────────────────────────────────
// 번호를 달고 순서대로 들어간다. 이 번호가 이 장에서 끝까지 따라다니는
// 유일한 것이고, 마지막에 이 번호 순서대로 나간다.
function drawFront(t, c, fan) {
  if (c < 0 || fan < 0.99) return;
  const a = span(t, 2.2, 2.6);
  if (a <= 0.02) return;

  for (let i = 0; i < INST.length; i++) {
    const it = INST[i];

    // 판 밖에서 차례를 기다리는 것들. 순서는 여기서 이미 정해져 있다.
    if (it.issue === c + 1) {
      R.text3([FETCH_X, Y, slotZ(it.slot)], String(it.k + 1), 8, 0.16 * a);
      continue;
    }
    if (it.issue !== c) continue;

    const z = slotZ(it.slot);
    const h = (DZ1 - DZ0) / DECODE_W / 2 - 1;
    R.fillY(FX0 + 1.5, z - h, FX1 - 1.5, z + h, Y, 0.16 * a);
    rectY(FX0 + 1.5, z - h, FX1 - 1.5, z + h, Y, 0.28 * a);
    R.text3([FX0 + 6, Y, z], String(it.k + 1), 9, 0.35 * a, 0, 0);
    R.text3([FX1 - 6, Y, z], it.m, 7, 0.22 * a, 0, 0);
  }
}

// ── 레인 ──────────────────────────────────────────────────────
// 글리프는 미끄러지지 않는다. 실행 유닛 안에서도 한 클럭에 한 단씩 간다.
// 그래서 지연 1짜리는 한 프레임 스쳐 지나가고, 지연 14짜리는 열네 번을
// 기어간다. 같은 판 위에서 그 둘이 함께 보이는 것이 이 장의 그림이다.
function drawLanes(t, f, c, fan, q) {
  if (c < 0 || fan < 0.99) return;

  for (let i = 0; i < INST.length; i++) {
    const it = INST[i];
    const z = laneZ(it.p, fan);

    // 완료. 레인 끝에서 제 ROB 칸으로 값을 써 넣는다. 칸은 프로그램
    // 순서로 놓여 있으므로, 이 선은 늘 비스듬하다. 그 비스듬함이 곧
    // '순서 밖에서 끝났다'는 뜻이다.
    if (q > 0 && c === it.done && f - c < 0.5) {
      const fade = 1 - (f - c) / 0.5;
      const lastU = (it.lat - 0.5) / it.lat;
      R.line([mix(LEX0, LX1, lastU), Y, z], [cellX(it.k), Y, ROB_ZC], 0.28 * fade, 1);
    }

    if (c < it.start || c >= it.done) continue;

    const stage = c - it.start;
    const u = (stage + 0.5) / it.lat;
    const x = mix(LEX0, LX1, u);

    // 오래 걸리는 것은 지나온 자리를 옅게 남긴다. 나눗셈 레인에 막대가
    // 길게 쌓이는 것, 그것이 이 장에서 가장 정직한 그림이다.
    if (it.lat >= 3) R.fillY(LEX0, z - 3, x, z + 3, Y, 0.08);

    R.fillY(x - 2.4, z - 3, x + 2.4, z + 3, Y, 0.16);
    rectY(x - 2.4, z - 3, x + 2.4, z + 3, Y, 0.28);
    R.text3([x, Y, z], String(it.k + 1), 9, 0.35);
    if (it.lat >= 3 && q > 0) R.text3([x, Y, z], it.m, 7, 0.22, 0, -8);
  }
}

// ── ROB ───────────────────────────────────────────────────────
// 다이 가장자리를 따라 놓인 긴 띠. 칸은 프로그램 순서이고, 채워지는 순서는
// 제멋대로다. 머리 포인터는 제 앞칸이 빌 때까지 한 칸도 움직이지 않는다.
function drawRob(t, f, c, frac, q) {
  const a = span(t, 1.4, 2.0);
  if (a <= 0.02) return;

  const alloc = c < 0 ? 0 : allocBy(c);
  const head = c < 0 ? 0 : retiredBy(c);

  // 이미 나간 자리. 아주 옅게만 남긴다.
  if (head > 0) R.fillY(BIG.x0, ROB_Z0, BIG.x0 + head * CELL_W, ROB_Z1, Y, 0.05);

  R.line([BIG.x0, Y, ROB_Z0], [BIG.x1, Y, ROB_Z0], 0.22 * a, 1);
  R.line([BIG.x0, Y, ROB_Z1], [BIG.x1, Y, ROB_Z1], 0.22 * a, 1);
  const step = q > 0 ? 1 : 2;
  for (let i = 0; i <= NCELL; i += step) {
    const born = span(t, 1.4 + i * 0.018, 1.7 + i * 0.018);
    if (born <= 0) continue;
    const x = BIG.x0 + i * CELL_W;
    R.line([x, Y, ROB_Z0], [x, Y, ROB_Z1], 0.16 * born);
  }

  // 칸의 내용. 끝난 것은 작은 네모로 앉아 있고, 자리만 잡은 것은 점이다.
  for (let i = 0; i < INST.length; i++) {
    const it = INST[i];
    if (c < it.issue || c >= it.ret) continue;
    const x = cellX(it.k);
    if (c >= it.done) R.fillY(x - 1.7, ROB_ZC - 1.7, x + 1.7, ROB_ZC + 1.7, Y, 0.35);
    else R.fillY(x - 0.6, ROB_ZC - 0.6, x + 0.6, ROB_ZC + 0.6, Y, 0.12);
  }

  if (c < 0) return;

  // 꼬리. 매 클럭 부드럽게 오른쪽으로 간다.
  const tx = BIG.x0 + alloc * CELL_W;
  R.line([tx, Y, ROB_Z0 - 3], [tx, Y, ROB_Z1 + 3], 0.22, 1);
  R.text3([tx, Y, ROB_Z0], 'ALLOC', 7, 0.22, 0, -9);

  // 머리. 삼킬 때만 움직인다. 채우기는 매끄럽고 비우기는 덩어리다 —
  // 그 어긋남이 이 장의 심장 박동이다.
  const hx = BIG.x0 + head * CELL_W;
  const gulp = head - retiredBy(c - 1);
  const beatK = gulp > 0 ? Math.max(0, 1 - frac / 0.4) : 0;
  R.line([hx, Y, ROB_Z0 - 5], [hx, Y, ROB_Z1 + 5], 0.28 + 0.07 * beatK, 1.4);
  R.text3([hx, Y, ROB_Z0], 'HEAD', 8, 0.35, 0, -18);

  R.text3([BIG.x0 + 2, Y, ROB_Z0], 'ROB · ' + ROB_N + ' 중 ' + NCELL + '칸', 8, 0.28 * a, 0, -9, 'left');
}

// ── 은퇴 ──────────────────────────────────────────────────────
// 이 장에서 온전한 잉크가 주어지는 유일한 자리. 가장자리를 넘기 전에는
// 0.35 를 넘지 않고, 넘는 순간 0.85 가 된다. 밖에서 볼 수 있는 것은
// 이것뿐이고, 이것은 언제나 번호 순서다.
function drawExit(f, c) {
  if (c < 0) return;
  let flash = 0, fx0 = 1e9, fx1 = -1e9;

  for (let i = 0; i < INST.length; i++) {
    const it = INST[i];
    const e = (f - it.ret) / 1.1;
    if (e < 0 || e >= 1) continue;
    const z = exitZ(e);
    const x = cellX(it.k);
    // 가장자리에서 승격하고, 판에서 멀어지며 사그라든다.
    const ink = mix(0.22, 0.85, span(z, 12, 20)) * (1 - span(z, 28, 40));
    if (ink <= 0.02) continue;
    R.text3([x, Y, z], String(it.k + 1), mix(9, 11, span(z, 12, 20)), ink);

    const near = 1 - Math.min(1, Math.abs(z - EDGE) / 7);
    if (near > flash) flash = near;
    if (near > 0) {
      if (x < fx0) fx0 = x;
      if (x > fx1) fx1 = x;
    }
  }

  // 가장자리가 한 번 빛난다. 이 장에서 발광을 쓰는 유일한 자리다.
  if (flash > 0.02 && fx1 > fx0) {
    R.glowLine([fx0 - 3, Y, EDGE], [fx1 + 3, Y, EDGE], 0.85 * flash, 1.4);
  }
}

// ── 멈춰 선 칸 ────────────────────────────────────────────────
// 이 장에서 가장 오래 붙드는 그림. 7번은 8클럭째에 이미 끝났고, 16클럭까지
// 제 칸에 앉아 있는다. 끝났는데 끝난 것이 아니다 — 5번이 아직 나눗셈 중이고,
// 나가는 문은 번호 순서로만 열리기 때문이다.
function drawBeat(t, f, c, fan) {
  const a = span(t, 5.6, 6.2) * (1 - span(t, 7.6, 7.95));
  if (a <= 0.02 || c < 0 || fan < 0.99) return;

  const held = INST[HELD], slow = INST[SLOW];
  if (c < held.done || c >= held.ret) return;

  const hx = cellX(held.k);
  const pulseA = 0.28 + 0.07 * (0.5 + 0.5 * Math.sin(t * 3.4));
  rectY(hx - 2.2, ROB_ZC - 2.2, hx + 2.2, ROB_ZC + 2.2, Y, pulseA * a, 1.4);
  R.text3([hx, Y, ROB_Z0], String(held.k + 1) + '번 · 끝났다', 10, 0.35 * a, 0, -30);

  // 무엇을 기다리는지 선으로 잇는다. 이 선이 이 장의 문장이다.
  if (c >= slow.start && c < slow.done) {
    const u = (c - slow.start + 0.5) / slow.lat;
    const sx = mix(LEX0, LX1, u);
    const sz = laneZ(slow.p, fan);
    R.line([hx, Y, ROB_ZC - 3], [sx, Y, sz + 4], 0.22 * a, 1, 1, 1);
    R.text3([sx, Y, sz], String(slow.k + 1) + '번 · 남은 ' + (slow.done - c) + '클럭', 9, 0.35 * a, 0, 10);
  }
}

// ── 계기 ──────────────────────────────────────────────────────
// 값의 최대 밝기를 0.7 로 눌러 둔다. 0.85 는 가장자리를 나가는 잉크의
// 것이고, 이 장에서 그 자리를 나눠 가지면 약속이 흐려진다.
function drawPanel(t, c) {
  const a = span(t, 2.6, 3.2) * (1 - span(t, 11.4, 12.0));
  if (a <= 0.02) return;
  const sa = R.safeArea();
  const right = sa.x1;
  const left = right - 176;
  const top = sa.y0 + 10;

  R.lineS(left, top - 16, right, top - 16, 0.22 * a, 1);

  const cyc = c < 0 ? 0 : c;
  const ret = c < 0 ? 0 : retiredBy(c);
  const fl = c < 0 ? 0 : inFlight(c);
  const ipc = c < 8 ? 0 : (retiredBy(c) - retiredBy(c - 8)) / 8;

  const rows = [
    ['CYCLE', String(cyc), 0.7],
    ['IN FLIGHT', String(fl), 0.7],
    ['RETIRED', String(ret), 0.7],
    ['IPC (8클럭 창)', ipc.toFixed(2), 0.7]
  ];
  for (let i = 0; i < rows.length; i++) {
    const rb = span(t, 2.8 + i * 0.18, 3.3 + i * 0.18);
    if (rb <= 0) continue;
    const y = top + i * 19;
    const slide = mix(8, 0, out3(rb));
    R.textS(left, y + slide, rows[i][0], 9, 0.42 * a * rb, 'left');
    R.textS(right, y + slide, rows[i][1], 12, rows[i][2] * a * rb, 'right', 'middle', 500);
  }

  // 이번 클럭에 몇이 나갔는가. 열 클럭을 내리 비어 있다가 여덟 칸이
  // 한꺼번에 차는 것을 눈으로 세게 한다.
  const gulp = c < 0 ? 0 : retiredBy(c) - retiredBy(c - 1);
  R.textS(left, top + 82, 'RETIRE / CYCLE', 9, 0.42 * a, 'left');
  for (let i = 0; i < RETIRE_W; i++) {
    const bx = right - (RETIRE_W - i) * 11;
    if (i < gulp) R.fillRectS(bx, top + 77, 8, 9, 0.7 * a);
    else R.rectS(bx, top + 77, 8, 9, 0.22 * a, 1);
  }

  R.textS(right, top + 104, '해독 폭 6 · 실행 포트 10', 8, 0.35 * a, 'right');
  R.textS(right, top + 118, 'ROB 512 · 은퇴 최대 8/클럭', 8, 0.35 * a, 'right');
  R.textS(right, top + 132, '코어 하나에 ~500개가 떠 있다', 8, 0.28 * a, 'right');
  R.textS(right, top + 146, '1 클럭 = 222 ps @ 4.5 GHz', 8, 0.28 * a, 'right');
}

// ── 자막 ──────────────────────────────────────────────────────
function drawNarration(t) {
  const sa = R.safeArea();
  const cx = (sa.x0 + sa.x1) / 2;
  const y = sa.y1 - 24;

  const lines = [
    [2.5, 3.9, '번호를 달고 순서대로 들어간다 · 창은 여섯 칸인데 한둘만 찬다'],
    [4.2, 5.4, '포트마다 지연이 다르다 · 7번이 5번보다 먼저 끝난다'],
    [5.7, 7.9, '7번은 끝났다 · 5번이 끝나기 전에는 끝난 것이 아니다'],
    [8.0, 9.6, '한 클럭에 여덟까지 · 그것도 번호 순서로만']
  ];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const a = span(t, L[0], L[0] + 0.5) * (1 - span(t, L[1] - 0.4, L[1]));
    if (a <= 0.02) continue;
    R.textS(cx, y, L[2], 9, 0.45 * a, 'center');
  }
}

function drawClose(t) {
  const a = span(t, 10.7, 11.3) * (1 - span(t, 11.8, 12.0));
  if (a <= 0.02) return;
  const sa = R.safeArea();
  const cx = (sa.x0 + sa.x1) / 2;
  const y = sa.y1 - 64;
  R.textS(cx, y, '안은 무질서 · 밖은 순서', 12, 0.7 * a, 'center', 'middle', 500);
  R.lineS(cx - 96, y + 12, cx + 96, y + 12, 0.22 * a, 1);
  R.textS(cx, y + 28, '실행은 순서를 지키지 않는다', 9, 0.45 * a, 'center');
  R.textS(cx, y + 42, '밖에서 볼 수 있는 것은 은퇴뿐이고, 은퇴는 언제나 순서다', 9, 0.45 * a, 'center');
}
