// 카메라.
//
// 예전 렌더러는 setView() 로 기계 전체를 화면에 자동으로 맞췄다. 돌릴 때마다
// 모형의 겉보기 크기가 변한다는 뜻이고, 그건 카메라가 아니다. 연출을 하려면
// 프레임을 사람이 정해야 한다.
//
// 채널은 일곱 개다. 채널마다 키프레임을 따로 두므로 팬이 줌보다 먼저,
// 다른 곡선으로 나갈 수 있다.
//
//   yaw pitch   방향
//   tx ty tz    무엇을 보는가
//   scale       얼마나 크게 (대상 평면에서 mm당 픽셀)
//   dolly       원근의 세기
//
// dolly 가 이 파일의 핵심이다. s 를 대상 평면에서 1 로 정규화해 두었으므로
// scale 은 순수하게 크기, dolly 는 순수하게 원근 왜곡이 된다. 도면이 되는
// 장에서 밀어 들어가며 dolly 를 함께 올리면, 가까워지는 바로 그 순간
// 왜곡이 빠져나가 평면이 평면으로 읽힌다. 장식이 아니라 구조를 지탱한다.
//
// 롤은 없다. 항상 0. 화면이 기울면 모든 헤어라인이 축과 어긋나고, 이 테마의
// 정체성인 1px 선이 2px 얼룩이 된다.

export const FOCAL = 900;

export const cam = {
  yaw: -0.62,
  pitch: 0.42,
  tx: 0, ty: 18, tz: 0,
  scale: 1,
  dolly: 620,
  flatten: 0
};

// 사용자가 끌어서 더한 값. 연출된 각도 위에 얹혔다가 손을 떼면 0 으로 녹는다.
export const drag = { yaw: 0, pitch: 0 };

let CY = 1, SY = 0, CP = 1, SP = 0;
let W = 0, H = 0, U = 1, DPR = 1;
let den0 = FOCAL;      // FOCAL + dolly
let halfW = 0, halfH = 0;

// scale = 1 이 '보드가 화면을 가득 채운다' 가 되도록 단위를 잡는다.
// 그래야 장면 파일에 적힌 숫자를 눈으로 읽을 수 있다. 보드의 x 폭이 440mm.
const BOARD_W = 440;

export function setViewport(w, h, dpr) {
  W = w; H = h; DPR = dpr || 1;
  halfW = w / 2; halfH = h / 2;
  U = Math.min(w, h * 1.15) / BOARD_W;
  commit();
}

export function viewport() { return { w: W, h: H, u: U, dpr: DPR }; }

// yaw·pitch·dolly 가 바뀌면 불러야 한다.
export function commit() {
  const y = cam.yaw + drag.yaw;
  // 수직을 넘기면 화면이 뒤집힌다. 부감으로 고정한 장에서 손으로 더 끌어
  // 올릴 수 있으므로, 합친 값에 상한을 둔다.
  let p = cam.pitch + drag.pitch;
  if (p > 1.52) p = 1.52;
  else if (p < 0.04) p = 0.04;
  CY = Math.cos(y); SY = Math.sin(y);
  CP = Math.cos(p); SP = Math.sin(p);
  den0 = FOCAL + cam.dolly;
}

// ── 변환 ──────────────────────────────────────────────────────
// 배열을 새로 만들지 않는다. 예전 렌더러는 프레임마다 수천 개의 짧은 배열을
// 만들었고, 5초짜리 장난감에서는 티가 나지 않지만 2분을 연속으로 재생하면
// GC 가 끊김으로 드러난다.

export function rotateInto(p, out) {
  const qx = p[0] - cam.tx, qy = p[1] - cam.ty, qz = p[2] - cam.tz;
  const x = qx * CY - qz * SY;
  const z1 = qx * SY + qz * CY;
  out[0] = x;
  out[1] = qy * CP - z1 * SP;
  out[2] = qy * SP + z1 * CP;
  return out;
}

// 회전된 좌표를 화면으로. 근평면 뒤로 넘어가면 false 를 준다.
// 예전 코드에는 이 가드가 없었다. 카메라를 훨씬 더 밀어 넣는 이상 필요하다.
export function projectInto(r, out) {
  const den = den0 - r[2];
  if (den < 0.25 * den0) return false;
  let s = den0 / den;
  if (cam.flatten > 0) s = s + (1 - s) * cam.flatten;
  const m = s * cam.scale * U;
  out[0] = halfW + r[0] * m;
  out[1] = halfH - r[1] * m;
  return true;
}

const _r = [0, 0, 0];

// 월드 좌표 하나를 화면으로. 깊이는 _r[2] 에 남는다.
export function projectPoint(p, out) {
  rotateInto(p, _r);
  if (!projectInto(_r, out)) return false;
  out[2] = _r[2];
  return true;
}

// 정렬에 쓰는 깊이. 클수록 앞이다.
export function depthOf(p) {
  rotateInto(p, _r);
  return _r[2];
}

// 그 점에서의 배율. mm 를 픽셀로 바꿀 때, 그리고 화면 크기로 LOD 를 정할 때.
export function scaleAt(r2) {
  const den = den0 - r2;
  if (den < 0.25 * den0) return 0;
  let s = den0 / den;
  if (cam.flatten > 0) s = s + (1 - s) * cam.flatten;
  return s * cam.scale * U;
}

// ── 상자 맞추기 ────────────────────────────────────────────────
// 장면은 숫자가 아니라 대상을 선언한다. 어디를 보고 얼마나 크게 볼지는
// 여기서 실제 화면 크기로부터 구한다. 세로 화면 보정이 장면마다 따로
// 필요하지 않은 것은 이 함수가 두 축을 모두 맞추기 때문이다.
//
//   box    { x0, y0, z0, x1, y1, z1 }
//   opts   { yaw, pitch, dolly, flatten, fill, pad, ox, oy }
//          fill 은 화면에서 차지할 비율. pad 는 그 위에 곱하는 여유.
//          ox·oy 는 대상을 화면 중앙에서 밀어낼 때(mm 아닌 화면 비율).
//
// 반환: { tx, ty, tz, scale } — 그대로 cam 에 넣거나 트랙의 키 값으로 쓴다.
export function fitBox(box, opts) {
  const o = opts || {};
  const yaw = o.yaw === undefined ? cam.yaw : o.yaw;
  const pitch = o.pitch === undefined ? cam.pitch : o.pitch;
  const dolly = o.dolly === undefined ? cam.dolly : o.dolly;
  const flatten = o.flatten === undefined ? 0 : o.flatten;
  const fill = o.fill === undefined ? 0.86 : o.fill;
  const pad = o.pad === undefined ? 1 : o.pad;

  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const cz = (box.z0 + box.z1) / 2;

  const cy_ = Math.cos(yaw), sy_ = Math.sin(yaw);
  const cp_ = Math.cos(pitch), sp_ = Math.sin(pitch);
  const d0 = FOCAL + dolly;

  const xs = [box.x0, box.x1], ys = [box.y0, box.y1], zs = [box.z0, box.z1];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++)
      for (let k = 0; k < 2; k++) {
        const qx = xs[i] - cx, qy = ys[j] - cy, qz = zs[k] - cz;
        const x = qx * cy_ - qz * sy_;
        const z1 = qx * sy_ + qz * cy_;
        const ry = qy * cp_ - z1 * sp_;
        const rz = qy * sp_ + z1 * cp_;
        const den = d0 - rz;
        let s = den < 0.25 * d0 ? 4 : d0 / den;
        if (flatten > 0) s = s + (1 - s) * flatten;
        const px = x * s, py = -ry * s;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }

  const spanX = Math.max(maxX - minX, 1e-3);
  const spanY = Math.max(maxY - minY, 1e-3);
  const scale = Math.min(W * fill / spanX, H * fill / spanY) / U / pad;

  // 상자의 투영 중심이 화면 중심에 오도록 대상점을 살짝 되민다.
  // (박스 중심과 투영 중심은 원근 때문에 정확히 같지 않다)
  const offX = (minX + maxX) / 2;
  const offY = (minY + maxY) / 2;

  return {
    tx: cx, ty: cy, tz: cz,
    scale,
    // 화면 공간 보정. raster 가 그릴 때 더한다.
    shiftX: -offX * scale * U + (o.ox || 0) * W,
    shiftY: -offY * scale * U + (o.oy || 0) * H
  };
}

// 화면 공간 보정값. fitBox 가 준 것을 그대로 받는다.
export const shift = { x: 0, y: 0 };

export function applyState(s) {
  if (!s) return;
  if (s.yaw !== undefined) cam.yaw = s.yaw;
  if (s.pitch !== undefined) cam.pitch = s.pitch;
  if (s.tx !== undefined) cam.tx = s.tx;
  if (s.ty !== undefined) cam.ty = s.ty;
  if (s.tz !== undefined) cam.tz = s.tz;
  if (s.scale !== undefined) cam.scale = s.scale;
  if (s.dolly !== undefined) cam.dolly = s.dolly;
  if (s.flatten !== undefined) cam.flatten = s.flatten;
  shift.x = s.shiftX || 0;
  shift.y = s.shiftY || 0;
  commit();
}

// 화면 밖 판정에 쓰는 여유. 라벨과 선 굵기 때문에 넉넉히 잡는다.
const CULL_PAD = 80;

// 월드 AABB 가 화면 안에 걸치는지. 부품 하나를 통째로 버릴 때 쓴다.
// 03~08 장은 카메라가 밀려 들어가 보드의 절반 이상이 화면 밖이다.
const _c = [0, 0, 0], _p = [0, 0];
export function boxOnScreen(box) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let any = false;
  const xs = [box.x0, box.x1], ys = [box.y0, box.y1], zs = [box.z0, box.z1];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++)
      for (let k = 0; k < 2; k++) {
        _c[0] = xs[i]; _c[1] = ys[j]; _c[2] = zs[k];
        rotateInto(_c, _r);
        if (!projectInto(_r, _p)) continue;
        any = true;
        const x = _p[0] + shift.x, y = _p[1] + shift.y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (!any) return false;
  if (maxX < -CULL_PAD || minX > W + CULL_PAD) return false;
  if (maxY < -CULL_PAD || minY > H + CULL_PAD) return false;
  return true;
}

// 투영된 대각선 길이(px). LOD 를 정할 때 쓴다.
export function boxScreenSize(box) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const xs = [box.x0, box.x1], ys = [box.y0, box.y1], zs = [box.z0, box.z1];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++)
      for (let k = 0; k < 2; k++) {
        _c[0] = xs[i]; _c[1] = ys[j]; _c[2] = zs[k];
        rotateInto(_c, _r);
        if (!projectInto(_r, _p)) continue;
        if (_p[0] < minX) minX = _p[0];
        if (_p[0] > maxX) maxX = _p[0];
        if (_p[1] < minY) minY = _p[1];
        if (_p[1] > maxY) maxY = _p[1];
      }
  if (minX === Infinity) return 0;
  return Math.hypot(maxX - minX, maxY - minY);
}

// 여러 상자를 감싸는 상자.
export function unionBox() {
  const out = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
  for (let i = 0; i < arguments.length; i++) {
    const b = arguments[i];
    if (!b) continue;
    if (b.x0 < out.x0) out.x0 = b.x0;
    if (b.y0 < out.y0) out.y0 = b.y0;
    if (b.z0 < out.z0) out.z0 = b.z0;
    if (b.x1 > out.x1) out.x1 = b.x1;
    if (b.y1 > out.y1) out.y1 = b.y1;
    if (b.z1 > out.z1) out.z1 = b.z1;
  }
  return out;
}

// 상자를 키우거나 옮긴다. 장면에서 대상을 조금 넓게 잡을 때.
export function growBox(b, m) {
  return { x0: b.x0 - m, y0: b.y0 - m, z0: b.z0 - m, x1: b.x1 + m, y1: b.y1 + m, z1: b.z1 + m };
}
