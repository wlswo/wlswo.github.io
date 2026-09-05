// 05 · THE SQUASH — 추측, 그리고 폐기
//
// 파이프는 분기 앞에서 멈추지 않는다. 한쪽을 골라 먼저 실행한다. 백 번 중
// 아흔여덟 번은 맞고, 틀린 한 번은 멈춤이 아니라 폐기다 — 이미 실행해 둔
// 일을 통째로 버린다.
//
// 그래서 이 장의 문법은 04장 그대로다. 같은 속도, 같은 레인. 달라지는 것은
// 한 프레임뿐이고, 그 한 프레임이 이 영화에서 유일한 폭력이다. 카메라는
// 한 채널도 움직이지 않는다 — 움직이지 않는 것이 이 장의 논거다.

import * as R from '../core/raster.js';
import { span, mix } from '../core/timeline.js';
import { out2 } from '../core/ease.js';
import { bit2 } from '../core/hash.js';
import { drawMachine } from './common.js';
import { CX, CZ, DIE_Y, coreRect } from '../geom/parts.js';
import { rectY } from '../geom/detail.js';
import { GHZ } from './s07.js';

const DUR = 11;

// ── 파이프의 치수 ─────────────────────────────────────────────
// 요즘 x86 은 5단이 아니라 14~20단이다. 20단을 놓고 분기가 풀리는 자리를
// 17단에 둔다. 그러면 분기가 인출된 칸에서 풀리는 칸까지 걸어간 거리가
// 그대로 벌금이 된다 — 17 사이클, 6와이드 × 17 = 102 슬롯. 화면의 숫자는
// 전부 여기서 나오고, 4.5 GHz 하나로 검산된다.
const STAGES = 20;
const LANES = 6;
const RESOLVE = 17;

const WASTED = LANES * RESOLVE;                 // 102 슬롯
const NS = (RESOLVE / GHZ).toFixed(2);          // 17 / 4.5 = 3.78 ns

// ── 시간 ──────────────────────────────────────────────────────
// 파이프는 초당 12단을 걷는다. 사이클을 시각에서 곧바로 내려받으므로
// 어디로 건너뛰어도 같은 무늬가 돌아온다.
const RATE = 12;
const BASE = 500;                 // 0초에 파이프가 이미 가득 차 있도록 앞을 채운다

const SQUASH = 5.75;              // 표시가 뒤집히는 시각. 12로 나누어떨어진다
const ERASE = SQUASH + 0.022;     // 그 다음 프레임. 60fps 에서 한 프레임은 반드시 낀다
const HOLD = 1.4;                 // 빈 파이프를 붙들고 있는 시간
const REFILL = ERASE + HOLD;      // 7.172
const NEG = 0.18;                 // 반전이 지속되는 시간. 5분의 1초

const C0 = BASE + Math.round(SQUASH * RATE);    // 오예측이 드러나는 사이클 = 569
const BB = C0 - RESOLVE;                        // 그 분기가 인출된 사이클 = 552
const TRACK = 2;                                // 그 분기가 탄 레인

// ── 자리 ──────────────────────────────────────────────────────
// 코어 하나를 다이 위로 들어올려 펼친 도면. 실제 회로의 배치가 아니라
// 확대해 놓은 것이라는 뜻으로, 네 귀퉁이를 코어에 점선으로 묶는다.
const PIPE_Y = 38;
const PIPE_X0 = CX - 38, PIPE_X1 = CX + 38;
const PIPE_Z0 = CZ - 21, PIPE_Z1 = CZ + 21;
const SPAN_X = (PIPE_X1 - PIPE_X0) / STAGES;    // 3.8
const SPAN_Z = (PIPE_Z1 - PIPE_Z0) / LANES;     // 7.0

const CORE = coreRect(0, 1);                    // 이 일을 치르는 코어. 단 하나

function edgeX(i) { return PIPE_X0 + i * SPAN_X; }
function stageX(i) { return PIPE_X0 + (i + 0.5) * SPAN_X; }
function laneZ(l) { return PIPE_Z0 + (l + 0.5) * SPAN_Z; }

// 단을 묶어 이름을 붙인다. 분기는 EXEC 의 끝에서 풀린다.
const BANDS = [
  { a: 0, b: 5, s: 'FETCH' },
  { a: 5, b: 9, s: 'DECODE' },
  { a: 9, b: 12, s: 'RENAME' },
  { a: 12, b: 15, s: 'SCHED' },
  { a: 15, b: 18, s: 'EXEC' },
  { a: 18, b: 20, s: 'RETIRE' }
];

// ── 시계 ──────────────────────────────────────────────────────
// 정지 구간에서는 필름이 멈춘 것이지 기계가 멈춘 것이 아니다. 그래서 시각을
// 되돌려 넘겨준다 — 다시 흐를 때 다른 일곱 코어의 무늬가 끊긴 자리에서
// 그대로 이어지고, 그 이음매가 '저쪽은 아무 일도 없었다'는 말이 된다.
function filmT(t) {
  if (t < SQUASH) return t;
  if (t < REFILL) return SQUASH;
  return t - (REFILL - SQUASH);
}

function cycAt(t) { return BASE + Math.floor(filmT(t) * RATE); }

// 슬롯이 채워졌는가. 레인과 태어난 사이클만 보므로 무늬가 매 사이클
// 오른쪽으로 한 칸씩 밀려간다 — 그게 파이프가 걷는 것처럼 보이는 이유다.
function occupied(lane, birth) {
  return bit2(birth, lane * 7919 + 17, 0.82) === 1;
}

// 분기는 약 5 명령마다 하나.
function isBranch(lane, birth) {
  return bit2(birth * 13 + lane, 9137, 0.2) === 1;
}

// 이 칸이 살아 있는가.
//
// 오예측이 드러난 뒤에는 '그 분기보다 어린 것'만 죽는다. 먼저 인출된 일은
// 옳았으므로 그대로 순서대로 은퇴하고, 되돌린 방향에서 새로 태어난 것은
// 산다. 죽는 구간은 태어난 사이클로 딱 열일곱 개다.
function alive(lane, birth, erased) {
  if (lane === TRACK && birth === BB) return true;        // 문제의 분기 자신
  if (lane === TRACK && birth === C0 + 1) return true;     // 되돌린 방향의 첫 uop
  if (erased && birth > BB && birth <= C0) return false;
  return occupied(lane, birth);
}

// 적중률. 세 눈금에 머물렀다가 딸깍 넘어간다 — 소수점이 계속 흐르면
// 읽을 수 없고, 읽을 수 없는 숫자는 없는 숫자다.
function hitRate(t) {
  if (t >= REFILL) return mix(99.0, 99.2, span(t, REFILL + 0.6, 10.6));
  if (t >= SQUASH) return 99.0;                            // 한 번 틀린 값이 그대로 멈춰 있다
  let v = mix(97.4, 98.6, span(t, 2.2, 2.8));
  v = mix(v, 99.1, span(t, 4.2, 4.8));
  return v;
}

export default {
  id: 's05',
  no: '05',
  title: 'THE SQUASH',
  kr: '추측, 그리고 폐기',
  line: '멈추는 대신 추측하고, 틀리면 지운다.',
  nums: [
    '예측 적중 98–99.5 %',
    '오예측 ' + RESOLVE + ' 사이클 · ' + NS + ' ns',
    '버려지는 슬롯 ' + WASTED + ' 개',
    '1000 명령당 오예측 1–5 회',
    '분기는 약 5 명령마다'
  ],
  dur: DUR,
  // 표시가 뒤집힌 프레임. 지워지기 직전, 파이프가 아직 가득한 한 장.
  keyT: SQUASH + 0.012,

  camAt() {
    // 상수다. 한 채널도 움직이지 않는다. 이 장에서 움직이는 것은 파이프의
    // 내용뿐이고, 그것이 사라질 때 화면이 정말로 비어야 하므로, 카메라가
    // 조금이라도 흐르면 논거가 무너진다.
    return {
      focus: { x0: CX - 46, y0: DIE_Y - 2, z0: CZ - 44, x1: CX + 46, y1: PIPE_Y + 4, z1: CZ + 44 },
      yaw: -0.26,
      pitch: 0.86,
      dolly: 2200,
      flatten: 0.45,
      fill: 0.82
    };
  },

  render(t, env) {
    const q = env.quality;
    const ft = filmT(t);
    const c = cycAt(t);
    const erased = t >= ERASE;

    drawMachine(ft, {
      quality: q,
      focus: ['cpu'],
      wires: 0.28,
      signals: 0,
      cpu: {
        labels: false,
        // 이 코어는 내내 일한다. 오예측은 이 코어의 일이지 기계의 일이 아니므로
        // 나머지 일곱은 제 박자대로 계속 깜빡인다.
        busy: (i, j) => (i === 0 && j === 1
          ? 1
          : (Math.sin(ft * (1.9 + (i * 4 + j) * 0.21) + (i * 4 + j) * 2.3) > 0.1 ? 1 : 0))
      }
    });

    drawCallout(t);
    drawFrame(t, q);
    drawPenalty(t);
    drawUops(c, erased, q);
    drawForks(c, erased, q);
    drawBranch(t, c);
    drawTarget(c);
    drawCounters(t);
    drawCopy(t);
  },

  // 반전. 딱 한 번, 180ms. 계기판이 종이로 뒤집혔다가 돌아온다.
  // 지우는 프레임(ERASE)이 이 창 안에 떨어지도록 잡았다 — 폭력은 흰 화면
  // 안에서 일어나야 한다. 모션 감소에서 이것을 끄는 일은 필름이 한다.
  negativeAt(t) { return t >= SQUASH && t < SQUASH + NEG; }
};

// ── 코어와 도면을 묶는 선 ──────────────────────────────────────
// 이 도면이 저 코어라는 것. 그 말을 하지 않으면 파이프는 허공에 뜬 그림이 된다.
function drawCallout(t) {
  const a = span(t, 0.2, 1.0);
  if (a <= 0.02) return;
  rectY(CORE.x0, CORE.z0, CORE.x1, CORE.z1, DIE_Y, 0.45 * a, 1.2);
  const pairs = [
    [[CORE.x0, CORE.z0], [PIPE_X0, PIPE_Z0]],
    [[CORE.x1, CORE.z0], [PIPE_X1, PIPE_Z0]],
    [[CORE.x1, CORE.z1], [PIPE_X1, PIPE_Z1]],
    [[CORE.x0, CORE.z1], [PIPE_X0, PIPE_Z1]]
  ];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    R.line([p[0][0], DIE_Y, p[0][1]], [p[1][0], PIPE_Y, p[1][1]], 0.12 * a, 1, a, 1);
  }
}

// ── 파이프의 뼈대 ─────────────────────────────────────────────
// 단 경계는 플립플롭이다. 그래서 경계마다 짧은 이가 위아래로 물린다.
// 이 뼈대가 있어야 파이프가 비었을 때에도 파이프로 읽힌다 — 지운 다음에
// 남는 것이 아무것도 없으면 그건 폐기가 아니라 장면 전환이다.
function drawFrame(t, q) {
  const a = span(t, 0.1, 0.7);
  if (a <= 0.02) return;

  rectY(PIPE_X0, PIPE_Z0, PIPE_X1, PIPE_Z1, PIPE_Y, 0.28 * a);

  for (let l = 1; l < LANES; l++) {
    const z = PIPE_Z0 + l * SPAN_Z;
    R.line([PIPE_X0, PIPE_Y, z], [PIPE_X1, PIPE_Y, z], 0.12 * a);
  }

  const step = q === 0 ? 5 : 1;
  for (let i = 0; i <= STAGES; i += step) {
    const x = edgeX(i);
    R.line([x, PIPE_Y, PIPE_Z0], [x, PIPE_Y, PIPE_Z0 + 2.2], 0.16 * a);
    R.line([x, PIPE_Y, PIPE_Z1 - 2.2], [x, PIPE_Y, PIPE_Z1], 0.16 * a);
  }

  for (let b = 0; b < BANDS.length; b++) {
    const g = BANDS[b];
    const z = PIPE_Z1 + 4;
    R.line([edgeX(g.a) + 0.6, PIPE_Y, z], [edgeX(g.b) - 0.6, PIPE_Y, z], 0.16 * a);
    R.text3([(edgeX(g.a) + edgeX(g.b)) / 2, PIPE_Y, z], g.s, 7, 0.35 * a, 0, 9);
  }

  // 분기가 풀리는 자리. 그 칸의 오른쪽 경계, 결과를 물어 두는 플립플롭이다.
  // 처음부터 못박아 두어야 표시가 뒤집힐 때 어디를 보고 있었는지가 남는다.
  const rx = edgeX(RESOLVE + 1);
  R.line([rx, PIPE_Y, PIPE_Z0 - 3], [rx, PIPE_Y, PIPE_Z1 + 1], 0.28 * a);
  R.text3([rx, PIPE_Y, PIPE_Z0 - 3], 'RESOLVE', 7, 0.45 * a, 0, -9);
}

// ── 벌금의 길이 ───────────────────────────────────────────────
// 예측한 칸에서 풀리는 칸까지의 거리가 곧 벌금이다. 자로 재듯 한 번만
// 그어 두면 뒤에 나오는 102 라는 숫자를 관객이 직접 셀 수 있다.
function drawPenalty(t) {
  const a = span(t, 3.6, 4.1) * (1 - span(t, 9.6, 9.9));
  if (a <= 0.02) return;
  const z = PIPE_Z0 - 8;
  const x0 = stageX(0), x1 = stageX(RESOLVE);
  R.line([x0, PIPE_Y, z], [x1, PIPE_Y, z], 0.22 * a);
  R.line([x0, PIPE_Y, z], [x0, PIPE_Y, z + 2.4], 0.22 * a);
  R.line([x1, PIPE_Y, z], [x1, PIPE_Y, z + 2.4], 0.22 * a);
  R.text3([(x0 + x1) / 2, PIPE_Y, z], RESOLVE + ' 사이클 · ' + NS + ' ns', 8, 0.45 * a, 0, -8);
  R.text3([x0, PIPE_Y, z], 'PREDICT', 7, 0.35 * a, 0, -8, 'left');
}

// ── 파이프의 내용 ─────────────────────────────────────────────
// 칸마다 uop 하나. 실행부를 지나는 것은 조금 더 진하다 — 잘못된 길의 일도
// 여기까지 와서 실제로 실행된다는 것이 이 장의 요점이므로.
function drawUops(c, erased, q) {
  const gx = 1.3, gz = 2.4;
  for (let s = 0; s < STAGES; s++) {
    const birth = c - s;
    if (birth < 0) continue;
    const x = stageX(s);
    const inExec = s >= 15 && s <= RESOLVE;
    for (let l = 0; l < LANES; l++) {
      if (!alive(l, birth, erased)) continue;
      const z = laneZ(l);
      R.fillY(x - gx, z - gz, x + gx, z + gz, PIPE_Y, inExec ? 0.45 : 0.35);
      if (q === 2 && inExec) R.line([x - gx, PIPE_Y, z], [x + gx, PIPE_Y, z], 0.22);
    }
  }
}

// ── 갈래 ──────────────────────────────────────────────────────
// 앞단에서 분기를 만나면 한쪽에만 잉크가 든다. 가지 않은 길은 점선으로
// 남고, 파이프는 그 자리에서 한 박자도 쉬지 않는다. 멈춤이 없다는 것을
// 말하는 자리라 갈래는 늘 걸어가는 중이어야 한다.
function drawForks(c, erased, q) {
  const last = q === 0 ? 2 : 4;
  for (let s = 1; s <= last; s++) {
    const birth = c - s;
    if (birth < 0) continue;
    for (let l = 0; l < LANES; l++) {
      if (!alive(l, birth, erased)) continue;
      if (!isBranch(l, birth)) continue;
      const x = stageX(s), z = laneZ(l);
      R.line([x + 1.5, PIPE_Y, z], [stageX(s + 1) - 1.5, PIPE_Y, z], 0.70, 1.4, 1);
      const dz = (l < LANES / 2 ? 1 : -1) * 4.6;
      R.line([x + 1.5, PIPE_Y, z], [stageX(s + 2), PIPE_Y, z + dz], 0.16, 1, 1, 2);
    }
  }
}

// ── 문제의 분기 ───────────────────────────────────────────────
// 인출될 때부터 표를 달고 열일곱 칸을 걸어 내려간다. 17단에 닿는 순간
// 표가 뒤집힌다 — 점선이었던 쪽에 잉크가 들고, 인쇄되어 있던 쪽이 점선이
// 된다. 그 한 프레임만 온전한 무게로 서 있다가, 다음 프레임에 뒤가 사라진다.
function drawBranch(t, c) {
  const s = c - BB;
  if (s < 0 || s >= STAGES) return;
  const x = stageX(s), z = laneZ(TRACK);
  const flipped = t >= SQUASH;

  rectY(x - 1.9, z - 3.0, x + 1.9, z + 3.0, PIPE_Y, flipped ? 1.00 : 0.55, flipped ? 1.8 : 1.2);

  if (!flipped) {
    if (s <= 5) R.text3([x, PIPE_Y, z], 'BR', 7, 0.45, 0, -8);
    return;
  }

  R.line([x + 2.2, PIPE_Y, z], [x + 6.4, PIPE_Y, z], 0.16, 1, 1, 2);
  R.line([x + 2.2, PIPE_Y, z], [x + 5.6, PIPE_Y, z - 4.6], 1.00, 1.6, 1);
  const la = 1 - span(t, REFILL, REFILL + 0.25);
  if (la > 0.02) R.text3([x, PIPE_Y, z], '예측 T · 실제 N', 9, 1.00 * la, 0, -13);
}

// ── 되돌린 방향의 첫 uop ──────────────────────────────────────
// 다시 흐르기 시작하는 것은 옳은 목표에서다. 파이프가 앞에서부터 다시
// 차오르는 동안 이 한 칸이 그 선두라는 것만 짚어 둔다.
function drawTarget(c) {
  const s = c - (C0 + 1);
  if (s < 0 || s >= STAGES) return;
  const x = stageX(s), z = laneZ(TRACK);
  rectY(x - 1.9, z - 3.0, x + 1.9, z + 3.0, PIPE_Y, 0.85, 1.4);
  if (s <= 6) R.text3([x, PIPE_Y, z], '정정된 목표', 8, 0.55, 0, -9);
}

// ── 계기 ──────────────────────────────────────────────────────
// 캔버스는 제 위에 앉은 DOM 을 모른다. 자리를 물어보고 그 안에 넣는다.
function drawCounters(t) {
  const sa = R.safeArea();
  const right = sa.x1;
  const top = sa.y0 + 8;

  const a = span(t, 0.7, 1.3);
  if (a > 0.02) {
    R.textS(right, top, '예측 적중', 9, 0.35 * a, 'right');
    R.textS(right, top + 18, hitRate(t).toFixed(1) + ' %', 12, 0.70 * a, 'right', 'middle', 500);
    R.lineS(right - 132, top + 32, right, top + 32, 0.16 * a, 1);
    R.textS(right, top + 44, '1000 명령당 오예측 1–5', 8, 0.28 * a, 'right');
  }

  // 버린 것을 센다. 정지 구간에는 아무것도 세지 않는다 — 그 1.4초는
  // 비어 있어야 하고, 셈은 파이프가 다시 흐른 뒤의 일이다.
  const wa = span(t, REFILL + 0.1, REFILL + 0.4);
  if (wa > 0.02) {
    const n = Math.round(WASTED * out2(span(t, REFILL + 0.15, REFILL + 1.15)));
    R.textS(right, top + 74, '버린 슬롯', 9, 0.35 * wa, 'right');
    R.textS(right, top + 92, String(n), 12, 0.85 * wa, 'right', 'middle', 500);
    R.textS(right, top + 108, RESOLVE + ' 사이클 · ' + NS + ' ns', 8, 0.35 * wa, 'right');
  }
}

// ── 자막 ──────────────────────────────────────────────────────
// 정지 구간에 걸치는 것은 SQUASH 한 줄뿐이고, 그 줄은 그 구간 내내 알파가
// 상수다. 페이드가 하나라도 걸리면 정지 프레임이 아니게 된다.
function drawCopy(t) {
  const sa = R.safeArea();
  const cx = (sa.x0 + sa.x1) / 2;
  const base = sa.y1 - 40;

  const fork = span(t, 1.5, 1.9) * (1 - span(t, 3.3, 3.7));
  if (fork > 0.02) {
    R.textS(cx, base + 26, '한쪽에만 잉크가 든다. 가지 않은 길은 점선으로 남는다.', 9, 0.55 * fork, 'center');
  }

  const sq = t >= SQUASH ? (1 - span(t, REFILL + 0.05, REFILL + 0.45)) : 0;
  if (sq > 0.02) {
    R.textS(cx, base, 'SQUASH', 12, 1.00 * sq, 'center', 'middle', 500);
    R.lineS(cx - 92, base + 12, cx + 92, base + 12, 0.28 * sq, 1);
    R.textS(cx, base + 26, '추측해서 실행한 일을 통째로 버린다.', 9, 0.55 * sq, 'center');
  }

  const after = span(t, REFILL + 0.8, REFILL + 1.2) * (1 - span(t, 9.0, 9.3));
  if (after > 0.02) {
    R.textS(cx, base + 26, '멈춘 적은 없다. 버린 것이 이미 실행된 일일 뿐이다.', 9, 0.55 * after, 'center');
  }

  const last = span(t, 9.5, 9.9) * (1 - span(t, 10.7, 11.0));
  if (last > 0.02) {
    R.textS(cx, base + 26, '코어 하나가 치른다. 나머지 일곱은 이 일을 모른다.', 9, 0.55 * last, 'center');
  }
}
