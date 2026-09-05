// 결정적 난수.
//
// 이 영화는 어느 시각으로든 건너뛸 수 있어야 한다. Math.random() 을 쓰면
// 같은 시각을 두 번 그렸을 때 다른 그림이 나오고, 뒤로 감으면 지나온 화면이
// 돌아오지 않는다. 그래서 난수를 상태로 두지 않고 좌표에서 계산한다.
//
// hash2(i, bucket) 은 항상 같은 값을 준다. bucket 에 floor(t*30) 을 넣으면
// 초당 서른 번 값이 바뀌면서도 되감기가 되는 잡음이 된다.

// 32비트 정수 해시. 두 정수를 섞어 고르게 퍼뜨린다.
export function hash2(a, b) {
  let h = (a | 0) * 0x27d4eb2d ^ (b | 0) * 0x165667b1;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  return (h ^ (h >>> 16)) >>> 0;
}

// [0, 1)
export function rand2(a, b) {
  return hash2(a, b) / 4294967296;
}

// [lo, hi)
export function range2(a, b, lo, hi) {
  return lo + (hi - lo) * rand2(a, b);
}

// 0 또는 1. p 는 1 이 나올 확률.
export function bit2(a, b, p) {
  return rand2(a, b) < (p === undefined ? 0.5 : p) ? 1 : 0;
}

// [0, n)
export function pick2(a, b, n) {
  return hash2(a, b) % n;
}

// 초당 rate 번 바뀌는 잡음. 같은 t 로 부르면 같은 값이 나온다.
export function noise(seed, t, rate) {
  return rand2(seed, Math.floor(t * (rate || 30)));
}

// 부드러운 잡음. 칸과 칸 사이를 smoothstep 으로 잇는다. 떨림이 아니라
// 흔들림이 필요한 곳 — 전원 리플, 암의 잔진동 — 에 쓴다.
export function smoothNoise(seed, t, rate) {
  const r = rate || 6;
  const x = t * r;
  const i = Math.floor(x);
  let f = x - i;
  f = f * f * (3 - 2 * f);
  const a = rand2(seed, i);
  const b = rand2(seed, i + 1);
  return a + (b - a) * f;
}
