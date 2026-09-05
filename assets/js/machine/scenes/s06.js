// 06 · ONE LINE, EIGHT OWNERS — 하나의 줄, 여덟 주인
//
// 사각형 하나와 그 위를 옮겨 다니는 글자 하나. 이 장은 그것뿐이다.
//
// 일관성은 변수 단위가 아니라 64바이트 줄 단위로 걸린다. 그래서 서로 한
// 바이트도 겹치지 않는 두 변수를 만지는 두 코어가, 같은 줄에 앉아 있다는
// 이유만으로 서로를 계속 무효화한다. 나머지 여섯은 원하지도 않는 줄이
// 오가는 것을 지켜본다.
//
// 그리고 이 장에서 DIMM 은 한 번도 켜지지 않는다. 고쳐 쓴 줄은 DRAM 에
// 없고, 다른 코어의 읽기는 메모리가 아니라 옆 캐시가 답한다. 메모리를
// 켜는 순간 이 장의 논거가 통째로 무너진다.

import * as R from '../core/raster.js';
import { span, mix } from '../core/timeline.js';
import { out2, out3, inOut3 } from '../core/ease.js';
import { drawMachine, power, lerpBox, HOME } from './common.js';
import { BOX, CX, CZ, DIE_Y, CORE_ORDER, coreRect } from '../geom/parts.js';

const DUR = 10;

// ── 링 ────────────────────────────────────────────────────────
// 좌표를 새로 만들지 않는다. 다이 위의 링 사각형은 cpuDetail 이 이미
// CX±36 · CZ±36 에 긋고 있고, 이 장은 머리카락 하나만큼 위에서 그 위를
// 굵게 덧그릴 뿐이다.
const RX0 = CX - 36, RX1 = CX + 36;
const RZ0 = CZ - 36, RZ1 = CZ + 36;
const RING_Y = DIE_Y + 0.9;
const SIDE = RZ1 - RZ0;              // 72
const PERIM = SIDE * 4;

// 둘레 거리 d 를 링 위의 한 점으로. 0 은 왼쪽 뒤 모서리, 왼변을 따라
// 내려가 아래변·오른변·윗변 순으로 한 바퀴 돈다.
function ringAt(d) {
  let u = d % PERIM;
  if (u < 0) u += PERIM;
  if (u < SIDE) return [RX0, RING_Y, RZ0 + u];
  if (u < SIDE * 2) return [RX0 + (u - SIDE), RING_Y, RZ1];
  if (u < SIDE * 3) return [RX1, RING_Y, RZ1 - (u - SIDE * 2)];
  return [RX1 - (u - SIDE * 3), RING_Y, RZ0];
}

// 링의 한 토막. 모서리에서만 꺾으므로 아무리 길어도 선분 다섯 개를 넘지
// 않는다. 링 위를 도는 것은 전부 이 함수를 지난다.
function arc(d0, d1, a, w, glow, dash) {
  if (d1 - d0 <= 0.01) return;
  let prev = ringAt(d0);
  const k0 = Math.ceil(d0 / SIDE), k1 = Math.floor(d1 / SIDE);
  for (let k = k0; k <= k1; k++) {
    const dc = k * SIDE;
    if (dc <= d0 || dc >= d1) continue;
    const p = ringAt(dc);
    if (glow) R.glowLine(prev, p, a, w); else R.line(prev, p, a, w, 1, dash);
    prev = p;
  }
  const end = ringAt(d1);
  if (glow) R.glowLine(prev, end, a, w); else R.line(prev, end, a, w, 1, dash);
}

// ── 정거장 ────────────────────────────────────────────────────
// 여덟 개. CORE_ORDER 를 따르므로 배열 순서가 아니라 링 순서로 돈다 —
// 코어 배열 순서대로 세우면 요청이 링을 건너뛰며 날아다니게 되고, 그건
// 링이 아니라 그냥 선 여덟 개다.
const STOPS = [];
for (let k = 0; k < CORE_ORDER.length; k++) {
  const r = coreRect(CORE_ORDER[k][0], CORE_ORDER[k][1]);
  const cz = (r.z0 + r.z1) / 2;
  const left = CORE_ORDER[k][0] === 0;
  STOPS.push({
    cx: (r.x0 + r.x1) / 2,
    cz,
    x: left ? RX0 : RX1,               // 정거장은 코어 중심을 링 변으로 내린 자리
    inx: left ? 1 : -1,                // 코어 쪽 방향
    d: left ? cz - RZ0 : SIDE * 2 + (RZ1 - cz)
  });
}

// (i, j) 코어를 정거장 번호로. cpuDetail 의 busy 가 이 사상을 쓴다.
function stopOf(i, j) { return i === 0 ? j : 7 - j; }

const OWNER = 0;      // 처음 줄을 가진 코어. 변수 x 를 만진다
const OTHER = 4;      // 링의 정확히 반대편 — 둘레의 절반이 딱 144다
const JOIN3 = 2;
const JOIN4 = 6;

// ── 시각표 ────────────────────────────────────────────────────
const T_RING0 = 0.30, T_RING1 = 1.25;
const T_STOP = 1.05;
const T_E = 1.70;
const T_REQ0 = 2.30, T_REQ1 = 3.02;     // 요청이 링을 돈다
const T_ANS0 = 3.02, T_ANS1 = 3.52;     // 주인이 가로질러 답한다
const T_S3 = 4.10, T_S4 = 4.60;
const T_INV0 = 5.10, T_INV1 = 5.48;     // 무효화가 날아간다
const T_M = 5.80;                       // 확인 응답이 다 돌아온 뒤에야 M 이 된다
const T_FS = 5.98;                      // 거짓 공유
const FS_P = 0.45;                      // 한 번 튀는 데
const FS_N = 8;
const FS_COST = 100;                    // 튈 때마다 캐시→캐시 한 번

// n 번째 튐. 짝수는 OTHER→OWNER, 홀수는 OWNER→OTHER. 다 튀고 나면
// 마지막 상태에서 멈춘다 — 장이 끝난 자리에도 줄은 한쪽에 있다.
function bounceAt(t) {
  let n = Math.floor((t - T_FS) / FS_P);
  let local = (t - T_FS) - n * FS_P;
  if (n < 0) { n = 0; local = 0; }
  if (n > FS_N - 1) { n = FS_N - 1; local = FS_P; }
  const even = n % 2 === 0;
  return { n, local, from: even ? OTHER : OWNER, to: even ? OWNER : OTHER };
}

// 줄이 건너간 횟수. 건너간 그 순간에 값이 오른다.
function bouncesDone(t) {
  const b = bounceAt(t);
  return Math.min(FS_N, b.n + (b.local >= 0.40 ? 1 : 0));
}

// ── 줄의 상태 ─────────────────────────────────────────────────
// 가지고 있지 않은 줄은 Invalid 다. 그래서 마지막 그림에서 M 은 하나,
// I 는 일곱이 된다.
const IDLE = { s: 'I', a: 0.16, size: 10 };

function stateAt(k, t) {
  if (t >= T_FS) {
    const b = bounceAt(t);
    // 받는 쪽은 줄이 도착한 뒤에야 M 이 된다.
    if (k === b.to) {
      const rise = span(b.local, 0.30, 0.44);
      return rise > 0 ? { s: 'M', a: mix(0.55, 1, rise), size: 14 } : IDLE;
    }
    // 주는 쪽은 줄을 넘기면서 꺼진다. 하나가 다른 하나를 끈다.
    if (k === b.from) {
      const die = span(b.local, 0.10, 0.36);
      return die < 1 ? { s: 'M', a: mix(1, 0.05, die), size: 14 } : IDLE;
    }
    return IDLE;
  }

  if (t >= T_INV1) {
    if (k === OTHER) {
      if (t >= T_M) return { s: 'M', a: mix(0.55, 1, span(t, T_M, T_M + 0.25)), size: 14 };
      // 무효화를 뿌려 놓고 확인 응답을 기다리는 동안. 아직 M 이 아니다.
      return { s: 'S', a: mix(0.85, 0.35, span(t, T_INV1, T_M)), size: 12 };
    }
    const settle = span(t, T_INV1, T_INV1 + 0.55);
    const had = k === OWNER || k === JOIN3 || k === JOIN4;
    // 실제로 무언가를 잃은 셋만 깜빡이고 꺼진다. 나머지 넷은 애초에
    // 가진 적이 없어서 잃을 것도 없다 — 그래도 무효화는 받는다.
    if (!had) return { s: 'I', a: 0.16 * settle, size: 10 };
    const blink = Math.floor((t - T_INV1) / 0.08) % 2;
    return { s: 'I', a: mix(blink ? 0.85 : 0.22, 0.16, settle), size: 10 };
  }

  if (t >= T_ANS1) {
    if (k === OWNER || k === OTHER) return { s: 'S', a: 0.85, size: 12 };
    if (k === JOIN3) { const b = span(t, T_S3, T_S3 + 0.2); return b > 0 ? { s: 'S', a: 0.85 * b, size: 12 } : null; }
    if (k === JOIN4) { const b = span(t, T_S4, T_S4 + 0.2); return b > 0 ? { s: 'S', a: 0.85 * b, size: 12 } : null; }
    return null;
  }

  // 아직 하나뿐이다. 깨끗하고, 이 캐시에만 있다.
  if (t >= T_E && k === OWNER) return { s: 'E', a: mix(0.55, 1, span(t, T_E, T_E + 0.3)), size: 14 };
  return null;
}

function activeLetter(t) {
  if (t >= T_M) return 'M';
  if (t >= T_INV1) return 'I';
  if (t >= T_ANS1) return 'S';
  if (t >= T_E) return 'E';
  return '';
}

const MESI = [['M', 'MODIFIED'], ['E', 'EXCLUSIVE'], ['S', 'SHARED'], ['I', 'INVALID']];

// 한 번에 한 줄. 앞의 것이 다 지워진 뒤에 다음이 들어온다.
const CAPS = [
  [1.60, 2.24, 'E · 이 줄을 가진 캐시는 하나뿐이다'],
  [2.32, 3.00, '다른 코어가 읽는다 — 요청이 링을 돈다'],
  [3.08, 4.00, '주인이 직접 답한다 · 캐시→캐시 60–100 클럭'],
  [4.08, 5.02, 'S · 넷이 나눠 갖는다. DRAM 은 부른 적 없다'],
  [5.10, 5.92, '하나가 쓴다 — 무효화가 여덟 정거장에 한꺼번에'],
  [6.02, 7.10, '서로 다른 변수다. 같은 64바이트 줄이다'],
  [7.18, 8.50, '여섯은 원하지도 않는 줄이 오가는 것을 본다'],
  [8.58, 10.0, '가장 병렬적인 순간에 아무것도 이루지 못한다']
];

export default {
  id: 's06',
  no: '06',
  title: 'ONE LINE, EIGHT OWNERS',
  kr: '하나의 줄, 여덟 주인',
  line: '일관성의 단위는 변수가 아니라 64바이트 줄이다.',
  nums: ['M · E · S · I', '캐시→캐시 60–100 클럭', '일관성 단위 64 B', '1클럭 저장 → 100+ 클럭', '8 코어 · 링 1 · 주인 1'],
  dur: DUR,
  keyT: 7.55,

  camAt(t) {
    // 위에서 곧게 내려다본다. yaw 를 0 으로 놓아야 링의 네 변이 화면의
    // 두 축과 나란해지고, 그래야 사각형이 1px 헤어라인으로 떨어진다.
    // dolly 를 올려 원근을 빼는 것은 장식이 아니다 — 원근이 남으면 링의
    // 반대편이 가까운 쪽보다 작아지고, '정확히 맞은편'이 눈에 안 보인다.
    const p = inOut3(span(t, 0.0, 1.9));
    const p2 = inOut3(span(t, 5.7, 8.6));
    const die = { x0: CX - 46, y0: DIE_Y - 3, z0: CZ - 46, x1: CX + 46, y1: DIE_Y + 3, z1: CZ + 46 };
    const tight = { x0: CX - 40, y0: DIE_Y - 3, z0: CZ - 40, x1: CX + 40, y1: DIE_Y + 3, z1: CZ + 40 };
    return {
      focus: lerpBox(lerpBox(BOX.pkg, die, p), tight, p2),
      yaw: mix(HOME.yaw, 0, p),
      pitch: mix(HOME.pitch, 1.28, p),
      dolly: mix(HOME.dolly, 2400, p),
      flatten: mix(0, 0.72, p),
      fill: mix(0.86, 0.80, p)
    };
  },

  render(t, env) {
    const q = env.quality;

    // 메모리는 보이되 아무 일도 하지 않는다. activity 를 0 으로 못박고
    // signals 를 0 으로 둔다 — 이 장에서 DDR 위를 지나가는 것은 없다.
    const p = power({
      board: 0.35,
      vrm: 0.22,
      cpu: mix(1, 0.62, span(t, 0.6, 1.8)),
      mem: 0.8,
      pch: 0.22,
      io: 0.22,
      disk: 0.22
    });

    drawMachine(t, {
      power: p,
      quality: q,
      focus: ['cpu'],
      wires: 0.12,
      signals: 0,
      mem: [{ activity: 0 }, { activity: 0 }, { activity: 0 }],
      cpu: {
        labels: false,
        // 줄을 쥐고 있는 코어 하나만 아주 옅게 켠다. 여덟이 함께
        // 깜빡이면 이 장의 주장이 사라진다.
        busy: (i, j) => {
          const st = stateAt(stopOf(i, j), t);
          return st && (st.s === 'M' || st.s === 'E') ? 1 : 0;
        }
      }
    });

    drawRing(t);
    drawStops(t, q);
    drawTraffic(t, q);
    drawLetters(t);
    drawLegend(t);
    drawCaption(t);
    drawLine64(t);
    drawCost(t);
  }
};

// 링. 이 장에서 유일하게 굵은 선이고, 나머지는 전부 구조선이다.
function drawRing(t) {
  const rev = span(t, T_RING0, T_RING1);
  if (rev <= 0) return;
  arc(0, PERIM * rev, 0.35, 1.6, false, 0);
  if (rev >= 1) R.text3(ringAt(SIDE * 3.5), 'RING', 8, 0.35, 0, -10);
}

// 정거장. 링에 얹힌 짧은 눈금 하나와, 코어 쪽으로 뻗은 더 짧은 발.
function drawStops(t, q) {
  for (let k = 0; k < STOPS.length; k++) {
    const s = STOPS[k];
    const born = span(t, T_STOP + k * 0.045, T_STOP + 0.4 + k * 0.045);
    if (born <= 0) continue;
    const h = stopHeat(k, t);
    const a = mix(0.28, 0.85, h) * born;
    R.line([s.x, RING_Y, s.cz - 3.2], [s.x, RING_Y, s.cz + 3.2], a, mix(1.2, 1.6, h));
    if (q >= 1) R.line([s.x, RING_Y, s.cz], [s.x + s.inx * 5, RING_Y, s.cz], a * 0.7, 1);
  }
}

// 정거장이 밝아지는 때. 무효화는 여덟 곳에 한꺼번에 닿는다 — 줄을 가진
// 적도 없는 코어까지 포함해서. 그게 브로드캐스트의 값이다.
function stopHeat(k, t) {
  let h = span(t, T_INV0, T_INV0 + 0.28) * (1 - span(t, T_INV1, T_INV1 + 0.5));
  if (t >= T_E && t < T_REQ0 && k === OWNER) h = Math.max(h, 0.5);
  if (t >= T_FS - 0.2 && (k === OWNER || k === OTHER)) h = Math.max(h, 0.5);
  return h;
}

// ── 오가는 것 ─────────────────────────────────────────────────
// 링을 도는 것은 요청이고, 가로지르는 것은 줄 자체다. 실제로는 둘 다 같은
// 링을 타지만, 같은 모양으로 그리면 누가 누구에게 답했는지가 사라진다.
// 가로지르는 선은 '메모리가 아니라 저 캐시가 주었다'는 뜻이다.
function drawCross(from, to, p, fade) {
  const a = [from.cx, RING_Y, from.cz];
  const b = [to.cx, RING_Y, to.cz];
  R.line(a, b, 0.12 * fade, 1, 1, 2);
  R.glowLine(a, b, 0.85 * fade, 1.4, p);
  const hx = mix(a[0], b[0], p), hz = mix(a[2], b[2], p);
  R.fillY(hx - 2.6, hz - 2.6, hx + 2.6, hz + 2.6, RING_Y, 0.85 * fade);
}

function drawTraffic(t, q) {
  const A = STOPS[OWNER], B = STOPS[OTHER];

  // 읽기 요청. 정거장에서 정거장으로, 링을 벗어나지 않는다.
  if (t >= T_REQ0 && t < T_ANS0 + 0.25) {
    const fade = 1 - span(t, T_ANS0, T_ANS0 + 0.25);
    const d0 = B.d, d1 = A.d + PERIM;
    if (q >= 1) arc(d0, d1, 0.12 * fade, 1, false, 2);
    arc(d0, mix(d0, d1, out2(span(t, T_REQ0, T_REQ1))), 0.7 * fade, 1.5, true);
  }

  // 응답. 링을 가로질러 곧장 온다. 이 줄은 DRAM 에 없으므로 DRAM 은
  // 물어볼 수조차 없다.
  if (t >= T_ANS0 && t < T_ANS1 + 0.7) {
    const p = span(t, T_ANS0, T_ANS1);
    const fade = 1 - span(t, T_ANS1, T_ANS1 + 0.7);
    drawCross(A, B, out2(p), fade);
    if (p > 0.55) {
      R.text3([(A.cx + B.cx) / 2, RING_Y, (A.cz + B.cz) / 2], '60–100 클럭', 9, 0.7 * fade, 0, -13);
    }
  }

  // 셋째와 넷째가 붙는다. 이미 가진 캐시가 준다.
  drawJoin(t, STOPS[JOIN3], T_S3);
  drawJoin(t, STOPS[JOIN4], T_S4);

  // 무효화. 하나씩 순서대로가 아니라 한꺼번에 여덟 곳으로.
  if (t >= T_INV0 && t < T_INV1 + 0.5) {
    const rev = out3(span(t, T_INV0, T_INV1));
    const fade = 1 - span(t, T_INV1, T_INV1 + 0.5);
    const from = [B.cx, RING_Y, B.cz];
    for (let k = 0; k < STOPS.length; k++) {
      if (k === OTHER) continue;
      R.glowLine(from, [STOPS[k].x, RING_Y, STOPS[k].cz], 0.7 * fade, 1.2, rev);
    }
    if (rev > 0.4) R.text3(from, 'INVALIDATE', 9, 0.85 * fade, 0, -24);
  }

  // 거짓 공유. 같은 줄이 링을 가로질러 오가고, 매번 하나가 다른 하나를 끈다.
  if (t >= T_FS) {
    const b = bounceAt(t);
    const p = span(b.local, 0.06, 0.40);
    if (p > 0 && p < 1) {
      const f = STOPS[b.from], to = STOPS[b.to];
      drawCross(f, to, p, 1);
      // 값이 왜 오르는지를 오르는 자리에서 말한다.
      if (q >= 1) R.text3([(f.cx + to.cx) / 2, RING_Y, (f.cz + to.cz) / 2], '+100', 8, 0.45, 0, -13);
    }
  }
}

function drawJoin(t, s, at) {
  const p = span(t, at - 0.42, at);
  if (p <= 0 || t > at + 0.4) return;
  drawCross(STOPS[OWNER], s, out2(p), 1 - span(t, at, at + 0.4));
}

// ── 글자 ──────────────────────────────────────────────────────
// 이 장의 살아 있는 신호는 이 여덟 글자 하나뿐이다.
function drawLetters(t) {
  for (let k = 0; k < STOPS.length; k++) {
    const st = stateAt(k, t);
    if (!st || st.a <= 0.03) continue;
    const s = STOPS[k];
    R.text3([s.cx, RING_Y, s.cz], st.s, st.size, st.a, 0, 0);
  }

  // 두 코어가 만지는 것은 서로 다른 변수다. 그 사실을 코어 위에 붙여 둔다.
  const a = 0.45 * span(t, T_INV0 - 0.2, T_INV0 + 0.4);
  if (a > 0.03) {
    R.text3([STOPS[OWNER].cx, RING_Y, STOPS[OWNER].cz], 'x++', 8, a, 0, -21);
    R.text3([STOPS[OTHER].cx, RING_Y, STOPS[OTHER].cz], 'y++', 8, a, 0, -21);
  }
}

// 네 글자의 뜻. 배우고 나면 어두워진다.
function drawLegend(t) {
  const a = span(t, 1.30, 2.00);
  if (a <= 0.02) return;
  const dim = mix(1, 0.55, span(t, T_FS - 0.4, T_FS + 0.4));
  const sa = R.safeArea();
  const x = sa.x0 + 14;
  const mid = (sa.y0 + sa.y1) / 2;
  const act = activeLetter(t);
  R.textS(x, mid - 52, 'MESI', 8, 0.35 * a * dim, 'left');
  for (let i = 0; i < MESI.length; i++) {
    const on = MESI[i][0] === act;
    const y = mid - 34 + i * 18;
    R.textS(x, y, MESI[i][0], 12, (on ? 0.85 : 0.16) * a, 'left', 'middle', 500);
    R.textS(x + 17, y, MESI[i][1], 8, (on ? 0.45 : 0.12) * a * dim, 'left');
  }
}

function drawCaption(t) {
  const sa = R.safeArea();
  for (let i = 0; i < CAPS.length; i++) {
    const c = CAPS[i];
    const a = span(t, c[0], c[0] + 0.22) * (1 - span(t, c[1] - 0.22, c[1]));
    if (a <= 0.02) continue;
    R.textS((sa.x0 + sa.x1) / 2, sa.y0 + 16, c[2], 11, 0.7 * a, 'center', 'middle', 500);
  }
}

// 64바이트 줄 하나. x 와 y 는 한 바이트도 겹치지 않는데 같은 칸 묶음
// 안에 있다. 이 그림 하나가 거짓 공유의 전부다.
function drawLine64(t) {
  const a = span(t, T_FS - 0.35, T_FS + 0.3);
  if (a <= 0.02) return;
  const sa = R.safeArea();
  const cw = 19, h = 14, w = cw * 8;
  const x = (sa.x0 + sa.x1) / 2 - w / 2;
  const y = sa.y1 - 74;

  R.textS(x, y - 11, 'ONE 64 B LINE · 8 × 8 B', 8, 0.35 * a, 'left');
  R.rectS(x, y, w, h, 0.28 * a, 1);
  for (let i = 1; i < 8; i++) R.lineS(x + cw * i, y, x + cw * i, y + h, 0.16 * a, 1);

  // 지금 줄을 쥔 쪽의 변수만 밝다. 값이 바뀌는 것은 한 칸인데 오가는
  // 것은 줄 전체다.
  const w2 = bounceAt(t).to;
  R.fillRectS(x + cw + 1, y + 1, cw - 2, h - 2, 0.08 * a);
  R.fillRectS(x + cw * 6 + 1, y + 1, cw - 2, h - 2, 0.08 * a);
  R.textS(x + cw * 1.5, y + h / 2, 'x', 10, (w2 === OWNER ? 0.85 : 0.28) * a, 'center', 'middle', 500);
  R.textS(x + cw * 6.5, y + h / 2, 'y', 10, (w2 === OTHER ? 0.85 : 0.28) * a, 'center', 'middle', 500);
  R.textS(x + w / 2, y + h + 14, '겹치는 바이트는 없다. 겹치는 것은 줄이다.', 9, 0.55 * a, 'center');
}

// 튈 때마다 값이 오른다. 여덟 번의 저장이 여덟 클럭이 아니라 800 클럭이 된다.
function drawCost(t) {
  const a = span(t, T_FS - 0.25, T_FS + 0.35);
  if (a <= 0.02) return;
  const done = bouncesDone(t);
  const sa = R.safeArea();
  const right = sa.x1 - 14;
  const w = 168;
  const top = (sa.y0 + sa.y1) / 2 - 30;

  R.lineS(right - w, top - 16, right, top - 16, 0.28 * a, 1);
  R.textS(right, top, 'FALSE SHARING', 8, 0.35 * a, 'right');
  R.textS(right, top + 26, (done * FS_COST).toLocaleString('en-US') + ' 클럭', 16, 0.9 * a, 'right', 'middle', 500);
  R.textS(right, top + 46, '저장 ' + done + '번 · 본래 ' + done + ' 클럭', 9, 0.45 * a, 'right');

  R.lineS(right - w, top + 60, right, top + 60, 0.16 * a, 1);
  if (done > 0) R.lineS(right - w, top + 60, right - w + w * (done / FS_N), top + 60, 0.85 * a, 2);
}
