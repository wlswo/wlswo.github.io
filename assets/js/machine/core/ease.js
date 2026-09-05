// 이징.
//
// 곡선을 많이 두면 화면이 산만해진다. 세 개의 감싸개(inPow·out·inOut)로
// 일곱 개만 만들고, 그 이상은 이유가 있을 때만 꺼낸다. out3 과 inOut3 이
// 전체의 절반을 넘게 쓰인다 — 들어오는 것은 out3, 상태가 바뀌는 것은 inOut3.

export const linear = (t) => t;

export const inPow = (p) => (t) => Math.pow(t, p);
export const out = (f) => (t) => 1 - f(1 - t);
export const inOut = (f) => (t) => (t < 0.5 ? f(t * 2) / 2 : 1 - f(t * -2 + 2) / 2);

export const in2 = inPow(2);
export const in3 = inPow(3);

export const out2 = out(in2);          // 기본값
export const out3 = out(in3);          // 모든 등장, 모든 팬
export const out5 = out(inPow(5));     // 아주 멀리서 미끄러져 들어올 때만
export const inOut2 = inOut(in2);
export const inOut3 = inOut(in3);      // 모든 상태 변화, 모든 줌
export const inOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;   // 숨쉬기

// 계단. 오도미터의 눈금이 딸깍 넘어가는 느낌.
export const steps = (n) => (t) => Math.min(1, Math.floor(t * n) / (n - 1 || 1));

// 세제곱 베지어. 테마의 $ease-out 과 같은 곡선을 캔버스에서도 쓰려고 둔다.
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {          // 뉴턴법으로 여섯 번이면 충분하다
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      const e = sampleX(t) - x;
      if (Math.abs(e) < 1e-6) break;
      t -= e / d;
    }
    return sampleY(t);
  };
}

// 테마가 CSS 에서 쓰는 곡선. 화면 안팎의 움직임이 같은 성격을 갖게 한다.
export const themeOut = cubicBezier(0.16, 1, 0.3, 1);
export const themeInOut = cubicBezier(0.65, 0, 0.35, 1);

// 스프링.
//
// 감쇠 진동을 풀어 이징 함수로 만든다. 지속시간은 정하는 것이 아니라
// 구하는 것이다 — 값이 1 에 충분히 붙어 200ms 동안 머무르는 시각을 찾는다.
//
// 변위에만 쓴다. 알파에 쓰면 1 을 넘어간 구간이 소리 없이 잘려서, 밝아지다
// 멈칫하는 것처럼 보인다. 그게 손으로 만든 티가 가장 크게 나는 자리다.
export function makeSpring(opts) {
  const o = opts || {};
  const mass = o.mass === undefined ? 1 : o.mass;
  const stiffness = o.stiffness === undefined ? 100 : o.stiffness;
  const damping = o.damping === undefined ? 10 : o.damping;
  const v0 = o.velocity === undefined ? 0 : o.velocity;

  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  let solve;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    solve = (t) =>
      1 - Math.exp(-zeta * w0 * t) *
      (Math.cos(wd * t) + ((zeta * w0 + v0) / wd) * Math.sin(wd * t));
  } else {
    solve = (t) => 1 - Math.exp(-w0 * t) * (1 + (w0 + v0) * t);
  }

  // 20ms 씩 걸어가며 정착 시각을 찾는다.
  let settled = 0;
  let duration = 0;
  for (let ms = 0; ms <= 6000; ms += 20) {
    if (Math.abs(1 - solve(ms / 1000)) < 0.0005) {
      settled += 20;
      if (settled >= 200) { duration = ms / 1000; break; }
    } else {
      settled = 0;
    }
  }
  if (!duration) duration = 6;

  return { duration, ease: (t) => (t >= 1 ? 1 : solve(t * duration)) };
}

export const EASES = {
  linear, out2, out3, out5, inOut2, inOut3, inOutSine,
  themeOut, themeInOut
};

// 이징을 이름으로도 함수로도 받는다. 장면 파일이 문자열로 쓰는 편이 읽기 좋다.
export function resolveEase(e) {
  if (!e) return out2;
  if (typeof e === 'function') return e;
  return EASES[e] || out2;
}
