// 스태거.
//
// 여러 개를 한꺼번에 움직이되 조금씩 어긋나게 하는 것. 값싸 보이는 스태거와
// 비싸 보이는 스태거를 가르는 것은 두 가지다.
//
// 하나, 격자에서는 왼쪽에서 오른쪽으로 훑지 않고 한 점에서 파문처럼 퍼진다.
// 거리는 맨해튼이 아니라 유클리드여야 원이 원으로 보인다.
//
// 둘, 간격 자체에 이징을 걸 수 있어야 한다. 항목마다 걸리는 이징과는 다른
// 조절판이다. 가장자리로 갈수록 촘촘해지는 파문은 이것 없이는 나오지 않는다.

import { resolveEase } from './ease.js';

// 항목 수만큼의 지연시간(초)을 Float32Array 로 미리 계산해 둔다.
// 그리는 쪽은 배열을 읽기만 하므로 매 프레임 분기도 정렬도 없다.
//
//   count   항목 수
//   step    이웃 사이의 기본 간격(초)
//   grid    [열, 행]. 없으면 한 줄로 본다
//   from    'first' | 'last' | 'center' | 'edges' | 숫자(색인)
//   ease    간격에 거는 이징. 이름이나 함수
//   start   전체를 밀어내는 시작 지연(초)
//   reverse 순서를 뒤집는다
export function staggerDelays(count, step, opts) {
  const o = opts || {};
  const delays = new Float32Array(count);
  if (count === 0) return delays;

  const grid = o.grid;
  const gx = grid ? grid[0] : count;
  const gy = grid ? grid[1] : 1;

  // 기준점을 격자 좌표로 옮긴다.
  let fx, fy;
  const from = o.from === undefined ? 'first' : o.from;
  if (from === 'center') { fx = (gx - 1) / 2; fy = (gy - 1) / 2; }
  else if (from === 'last') { fx = gx - 1; fy = gy - 1; }
  else if (from === 'edges' || from === 'first') { fx = 0; fy = 0; }
  else if (typeof from === 'number') { fx = from % gx; fy = Math.floor(from / gx); }
  else { fx = 0; fy = 0; }

  let maxV = 0;
  for (let i = 0; i < count; i++) {
    const tx = i % gx;
    const ty = Math.floor(i / gx);
    let v = Math.hypot(fx - tx, fy - ty);
    if (from === 'edges') {
      // 바깥에서 안으로. 가장 먼 모서리까지의 거리에서 빼면 방향이 뒤집힌다.
      v = Math.hypot((gx - 1) / 2, (gy - 1) / 2) - Math.hypot((gx - 1) / 2 - tx, (gy - 1) / 2 - ty);
      v = Math.abs(v);
    }
    delays[i] = v;
    if (v > maxV) maxV = v;
  }

  // 간격에 거는 이징. 항목의 이징과는 별개다.
  if (o.ease && maxV > 0) {
    const se = resolveEase(o.ease);
    for (let i = 0; i < count; i++) delays[i] = se(delays[i] / maxV) * maxV;
  }

  const start = o.start || 0;
  if (o.reverse) {
    for (let i = 0; i < count; i++) delays[i] = start + (maxV - delays[i]) * step;
  } else {
    for (let i = 0; i < count; i++) delays[i] = start + delays[i] * step;
  }
  return delays;
}

// 지연 배열을 두고 항목 i 의 진행도를 구한다. 시간의 순수 함수라
// 되감아도 같은 그림이 나온다.
export function staggerAt(delays, i, t, dur) {
  const p = (t - delays[i]) / dur;
  return p <= 0 ? 0 : p >= 1 ? 1 : p;
}

// 전체가 끝나는 데 걸리는 시간.
export function staggerSpan(delays, dur) {
  let m = 0;
  for (let i = 0; i < delays.length; i++) if (delays[i] > m) m = delays[i];
  return m + dur;
}
