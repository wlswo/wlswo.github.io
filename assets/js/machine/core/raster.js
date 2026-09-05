// 래스터.
//
// ctx 를 만지는 유일한 곳이다. 예전 파일의 가장 큰 잠재 위험은 모든 함수가
// fillStyle·strokeStyle·lineWidth·font·textAlign·textBaseline 을 더럽힌 채
// 돌아가고 save/restore 가 한 번도 없다는 것이었다. 한 곳으로 모으면 프레임
// 시작에 여섯 가지를 한 번만 정리하면 된다.
//
// 그리는 방식은 두 단계다.
//
//   1. 장면이 면과 선과 글자를 밀어 넣는다. 아직 아무것도 그려지지 않는다.
//   2. paint() 가 깊이로 한 번에 정렬해 뒤에서 앞으로 칠한다.
//
// 면과 선을 따로 정렬해서는 안 된다. 부품 표면의 회로선은 자기 면 위에 있고,
// 그보다 앞에 있는 부품이 덮어 가려야 한다. 그래서 둘을 한 배열에 섞어
// 정렬하고, 연속한 선들만 묶어 한 번에 긋는다. 배칭은 그 안에서 일어난다.

// ── 팔레트 ────────────────────────────────────────────────────
// 어두운 계기판. 종이 모드는 상수 하나 뒤집기다 — 팔레트가 여기 다 있다.
//
// 어두운 바탕에서 밝은 헤어라인은 번진다. 종이에서 쓰던 알파를 그대로
// 옮기면 화면이 뿌예진다. 사다리 위쪽 세 단은 살아 있는 신호에만 쓰고,
// 구조선은 0.28 이하로 누른다.

export const LADDER = [0.05, 0.08, 0.12, 0.16, 0.22, 0.28, 0.35, 0.45, 0.55, 0.70, 0.85, 1.00];

export const THEMES = {
  dark: {
    ground: '#0B0B0A',
    opaque: true,
    ink: [253, 253, 252],
    faceLo: 15, faceHi: 54        // g = faceLo + (faceHi-faceLo)*lit
  },
  paper: {
    ground: '#FDFDFC',
    opaque: false,                // 페이지의 종이와 격자가 틈으로 비쳐 보인다
    ink: [0, 0, 0],
    faceLo: 220, faceHi: 252
  }
};

let theme = THEMES.dark;
let negative = false;            // 05장의 180ms. 딱 한 번, 5분의 1초.

export function setTheme(name) {
  theme = THEMES[name] || THEMES.dark;
  buildStyleCache();
}
export function setNegative(on) {
  if (negative === on) return;
  negative = on;
  buildStyleCache();
}
export function isNegative() { return negative; }

function activeInk() {
  const t = theme;
  if (!negative) return t.ink;
  return t === THEMES.dark ? THEMES.paper.ink : THEMES.dark.ink;
}
function activeGround() {
  const t = theme;
  if (!negative) return t.ground;
  return t === THEMES.dark ? THEMES.paper.ground : THEMES.dark.ground;
}
function activeFaceRange() {
  const t = theme;
  if (!negative) return [t.faceLo, t.faceHi];
  return [255 - t.faceHi, 255 - t.faceLo];
}

// 알파를 사다리의 한 칸으로 스냅한다. 색조를 고르는 일이면서, 동시에
// 배칭 버그를 고치는 일이다. 0.1+0.2 같은 계산 결과가 그대로 키가 되면
// 배치가 무한히 늘어난다. 정지 화면에서는 드러나지 않고 애니메이션에서는
// 매 프레임 터진다.
export function alphaIndex(a) {
  if (a <= LADDER[0]) return 0;
  const n = LADDER.length;
  if (a >= LADDER[n - 1]) return n - 1;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (LADDER[mid] <= a) lo = mid; else hi = mid;
  }
  return (a - LADDER[lo] < LADDER[hi] - a) ? lo : hi;
}

let inkStyle = [];      // alphaIdx -> 'rgba(...)'
let grayStyle = [];     // 0..255 -> 'rgb(g,g,g)'

function buildStyleCache() {
  const ink = activeInk();
  inkStyle = LADDER.map((a) => 'rgba(' + ink[0] + ',' + ink[1] + ',' + ink[2] + ',' + a + ')');
  grayStyle = new Array(256);
  for (let g = 0; g < 256; g++) grayStyle[g] = 'rgb(' + g + ',' + g + ',' + g + ')';
}
buildStyleCache();

// ── 화폭 ──────────────────────────────────────────────────────
let ctx = null, W = 0, H = 0, DPR = 1;

export function attach(canvas, w, h, dpr) {
  ctx = canvas.getContext('2d', { alpha: true });
  W = w; H = h; DPR = dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
export function context() { return ctx; }

// 화면 위젯이 앉아도 되는 자리.
//
// 장의 제목과 숫자와 장 목록은 DOM 이라 캔버스가 그것들을 모른다. 그래서
// 자리를 알려 준다. 파형이나 눈금자를 여기 안에 두면 글자와 겹치지 않는다.
const safe = { x0: 0, y0: 0, x1: 0, y1: 0 };

export function setSafeInsets(l, t, r, b) {
  safe.x0 = l; safe.y0 = t; safe.x1 = W - r; safe.y1 = H - b;
}
export function safeArea() { return safe; }

// 헤어라인 스냅. 1px 선이 두 픽셀에 걸쳐 흐려지면, 얇은 선이 전부인
// 이 테마에서는 그대로 품질 문제가 된다.
function snap(v) { return (Math.round(v * DPR) + 0.5) / DPR; }

// ── 모으기 ────────────────────────────────────────────────────
import { rotateInto, projectInto, shift } from './camera.js';

const MAXF = 6000;
const MAXL = 14000;
const MAXT = 400;

const fDepth = new Float32Array(MAXF);
const fMode = new Uint8Array(MAXF);      // 0 음영 면, 1 잉크 채움, 2 윤곽만
const fVal = new Float32Array(MAXF);     // 0: lit(0..1)  1·2: 알파 색인
const fEdge = new Int8Array(MAXF);       // 테두리 알파 색인, -1 이면 없음
const fStart = new Int32Array(MAXF);
const fLen = new Int32Array(MAXF);
let fPts = new Float32Array(MAXF * 10);
let fn = 0, fp = 0;

const lDepth = new Float32Array(MAXL);
const lStyle = new Int32Array(MAXL);
const lXY = new Float32Array(MAXL * 4);
let ln = 0;

const texts = new Array(MAXT);
let tn = 0;
for (let i = 0; i < MAXT; i++) texts[i] = { x: 0, y: 0, s: '', size: 10, a: 0, align: 'center', base: 'middle', weight: 400, dot: 0 };

const screenOps = [];
let sn = 0;

const _r = [0, 0, 0], _p = [0, 0], _q = [0, 0];
const _n3 = new Float64Array(9);      // 면의 앞 세 점, 회전 좌표

let stats = { faces: 0, lines: 0, text: 0, strokes: 0, culled: 0 };
export function frameStats() { return stats; }

export function beginFrame() {
  fn = 0; fp = 0; ln = 0; tn = 0; sn = 0;
  stats = { faces: 0, lines: 0, text: 0, strokes: 0, culled: 0 };

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (theme.opaque || negative) {
    ctx.fillStyle = activeGround();
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.clearRect(0, 0, W, H);
  }
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 1;
}

// 빛의 방향. 예전 값을 그대로 쓴다.
const LIGHT = (function () {
  const v = [-0.42, 0.86, 0.5];
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

// 면 하나. 뒤를 향하면 버리고, 화면 밖이면 버린다.
//   mode 0  음영 채움      val 무시
//   mode 1  잉크 채움      val 알파
//   mode 2  윤곽만        val 알파
function pushFaceRaw(pts, mode, val, edgeAlpha, noCull, dim) {
  if (fn >= MAXF) return;
  const n = pts.length;
  if (fp + n * 2 > fPts.length) return;

  let depth = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const base = fp;

  // 앞의 세 점은 빛 계산에 다시 쓰이므로 회전 좌표를 붙들어 둔다.
  // 같은 점을 네 번 회전시키는 것이 예전 파일의 낭비 중 하나였다.
  for (let i = 0; i < n; i++) {
    rotateInto(pts[i], _r);
    depth += _r[2];
    if (i < 3) { _n3[i * 3] = _r[0]; _n3[i * 3 + 1] = _r[1]; _n3[i * 3 + 2] = _r[2]; }
    if (!projectInto(_r, _p)) { return; }
    const x = _p[0] + shift.x, y = _p[1] + shift.y;
    fPts[base + i * 2] = x;
    fPts[base + i * 2 + 1] = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  // 뒷면 버리기. 화면 좌표에서 부호 있는 넓이를 보면 회전 방향을 알 수 있고,
  // 3차원 법선을 다시 구할 필요가 없다.
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += fPts[base + i * 2] * fPts[base + j * 2 + 1] - fPts[base + j * 2] * fPts[base + i * 2 + 1];
  }
  if (mode !== 2 && area >= 0) { stats.culled++; return; }   // y 가 아래로 자라므로 부호가 뒤집힌다

  if (!noCull && (maxX < -40 || minX > W + 40 || maxY < -40 || minY > H + 40)) {
    stats.culled++;
    return;
  }

  let lit = 0;
  if (mode === 0) {
    const bx = _n3[3] - _n3[0], by = _n3[4] - _n3[1], bz = _n3[5] - _n3[2];
    const cx = _n3[6] - _n3[3], cy = _n3[7] - _n3[4], cz = _n3[8] - _n3[5];
    const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
    const len = Math.hypot(nx, ny, nz) || 1;
    lit = Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / len);
    if (dim !== undefined && dim < 1) lit *= dim;
  }

  fDepth[fn] = depth / n;
  fMode[fn] = mode;
  fVal[fn] = mode === 0 ? lit : val;
  fEdge[fn] = edgeAlpha === undefined || edgeAlpha < 0 ? -1 : alphaIndex(edgeAlpha);
  fStart[fn] = base;
  fLen[fn] = n;
  fn++;
  fp += n * 2;
  stats.faces++;
}

// 부품의 입체. 목록으로 받는다.
//
// dim 은 초점 밖으로 물러나는 정도다. 도면이 되는 장에서 보드의 커다란
// 면이 그대로 밝으면, 화면에서 가장 넓은 것이 이야기와 상관없는 것이
// 되어 버린다. 어두운 바탕에서는 물러나는 것이 곧 지워지는 것이다.
export function solid(faces, edgeAlpha, dim) {
  const e = edgeAlpha === undefined ? 0.28 : edgeAlpha;
  for (let i = 0; i < faces.length; i++) pushFaceRaw(faces[i], 0, 0, e, false, dim);
}

// 전원이 오르기 전의 유령. 채움 없이 윤곽선만. 옅은 회색으로 채우면
// 그냥 흐린 부품으로 읽히고, 채우지 않아야 '그려졌지만 아직 아닌' 것이 된다.
export function ghost(faces, alpha) {
  const a = alpha === undefined ? 0.08 : alpha;
  for (let i = 0; i < faces.length; i++) pushFaceRaw(faces[i], 2, a, -1);
}

// 월드 평면 위의 채운 다각형.
export function fillPoly(pts, alpha) {
  pushFaceRaw(pts, 1, alpha, -1, true);
}

// 수평면 위의 사각형 채움. 예전 fillY 와 같은 역할.
const _quad = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
export function fillY(x0, z0, x1, z1, y, alpha) {
  _quad[0][0] = x0; _quad[0][1] = y; _quad[0][2] = z0;
  _quad[1][0] = x1; _quad[1][1] = y; _quad[1][2] = z0;
  _quad[2][0] = x1; _quad[2][1] = y; _quad[2][2] = z1;
  _quad[3][0] = x0; _quad[3][1] = y; _quad[3][2] = z1;
  pushFaceRaw(_quad, 1, alpha, -1, true);
}

// 폭 색인. 0.5 단위로 끊어 배치 키를 유한하게 만든다.
function widthIndex(w) {
  const i = Math.round((w || 1) * 2);
  return i < 1 ? 1 : i > 12 ? 12 : i;
}

// 선 하나. 월드 좌표.
//   reveal 이 1 보다 작으면 a 에서 b 쪽으로 그만큼만 그린다. 선이 스스로
//   그려지는 연출은 전부 이것 하나로 만든다.
export function line(a, b, alpha, width, reveal, dash) {
  if (ln >= MAXL) return;
  rotateInto(a, _r);
  const da = _r[2];
  if (!projectInto(_r, _p)) return;
  const ax = _p[0] + shift.x, ay = _p[1] + shift.y;
  rotateInto(b, _r);
  const db = _r[2];
  if (!projectInto(_r, _q)) return;
  let bx = _q[0] + shift.x, by = _q[1] + shift.y;

  if (reveal !== undefined && reveal < 1) {
    if (reveal <= 0) return;
    bx = ax + (bx - ax) * reveal;
    by = ay + (by - ay) * reveal;
  }

  if ((ax < -40 && bx < -40) || (ax > W + 40 && bx > W + 40)) return;
  if ((ay < -40 && by < -40) || (ay > H + 40 && by > H + 40)) return;

  const i4 = ln * 4;
  lXY[i4] = ax; lXY[i4 + 1] = ay; lXY[i4 + 2] = bx; lXY[i4 + 3] = by;
  // 선은 제 면 위에 있다. 아주 조금 앞으로 당겨야 자기 면에 먹히지 않는다.
  lDepth[ln] = (da + db) / 2 + 0.35;
  lStyle[ln] = alphaIndex(alpha) * 64 + widthIndex(width) * 4 + (dash || 0);
  ln++;
  stats.lines++;
}

// 발광. 어두운 바탕에서 살아 있는 신호에만. shadowBlur 는 쓰지 않는다 —
// 느리고, 어차피 흐린 얼룩이 된다. 넓고 옅은 획 위에 좁고 밝은 획을 얹는다.
export function glowLine(a, b, alpha, width, reveal) {
  line(a, b, alpha * 0.28, (width || 1) + 2.5, reveal);
  line(a, b, alpha, width, reveal);
}

// 화면 좌표 선. 계기판의 눈금과 진행 막대처럼 기계에 붙지 않은 것들.
export function lineS(x0, y0, x1, y1, alpha, width, dash) {
  if (ln >= MAXL) return;
  const i4 = ln * 4;
  lXY[i4] = x0; lXY[i4 + 1] = y0; lXY[i4 + 2] = x1; lXY[i4 + 3] = y1;
  lDepth[ln] = 1e9;      // 항상 맨 앞
  lStyle[ln] = alphaIndex(alpha) * 64 + widthIndex(width) * 4 + (dash || 0);
  ln++;
  stats.lines++;
}

export function rectS(x, y, w, h, alpha, width) {
  lineS(x, y, x + w, y, alpha, width);
  lineS(x + w, y, x + w, y + h, alpha, width);
  lineS(x + w, y + h, x, y + h, alpha, width);
  lineS(x, y + h, x, y, alpha, width);
}

export function fillRectS(x, y, w, h, alpha) {
  if (sn >= screenOps.length) screenOps.push({ x: 0, y: 0, w: 0, h: 0, a: 0 });
  const o = screenOps[sn++];
  o.x = x; o.y = y; o.w = w; o.h = h; o.a = alphaIndex(alpha);
}

// 글자.
//
// 예전 코드의 text3 는 부를 때마다 flush() 를 했다. 라벨 하나마다 배처가
// 통째로 무너진다는 뜻이다. 여기서는 목록에 모아 두었다가 프레임 맨
// 마지막에 한꺼번에 그린다. 라벨이 기계 위에 얹히는 것은 어차피 그 편이 낫다.
const TEXT_FLOOR = 6.5;

export function text3(pos, str, size, alpha, dx, dy, align, degrade) {
  if (tn >= MAXT) return;
  rotateInto(pos, _r);
  if (!projectInto(_r, _p)) return;
  const x = _p[0] + shift.x + (dx || 0);
  const y = _p[1] + shift.y + (dy || 0);
  if (x < -60 || x > W + 60 || y < -30 || y > H + 30) return;
  pushText(x, y, str, size, alpha, align, 'middle', 400, degrade);
}

export function textS(x, y, str, size, alpha, align, base, weight) {
  pushText(x, y, str, size, alpha, align, base || 'middle', weight || 400, false);
}

let textScale = 1;
export function setTextScale(k) { textScale = k; }

function pushText(x, y, str, size, alpha, align, base, weight, degrade) {
  if (tn >= MAXT) return;
  size *= textScale;
  // 6.5px 아래로 내려가면 버스 위의 비트열은 점이 된다. 그 크기에서는
  // 점이 더 싸고, 그 크기에서는 점이 더 잘 읽힌다.
  //
  // 라벨은 다르다. degrade 를 주지 않은 글자는 이름이고, 이름은 작아질
  // 지언정 사라지면 안 된다. 좁은 화면에서 부품 이름이 통째로 빠지는
  // 것이 예전 동작이었다.
  if (size < TEXT_FLOOR) {
    if (degrade) {
      const t = texts[tn++];
      t.dot = 1; t.x = x; t.y = y; t.a = alphaIndex(alpha); t.size = 1.5;
      stats.text++;
      return;
    }
    size = TEXT_FLOOR;
  }
  const t = texts[tn++];
  t.dot = 0;
  t.x = x; t.y = y; t.s = str; t.size = size;
  t.a = alphaIndex(alpha); t.align = align || 'center';
  t.base = base; t.weight = weight;
  stats.text++;
}

// ── 칠하기 ────────────────────────────────────────────────────
const order = new Int32Array(MAXF + MAXL);
const orderArr = [];      // 정렬용. subarray.sort 는 비교자를 받지만 안정성이 없다

function primDepth(code) {
  return (code & 1) ? lDepth[code >> 1] : fDepth[code >> 1];
}
function cmpDepth(a, b) { return primDepth(a) - primDepth(b); }

const textOrder = [];
function cmpText(a, b) {
  const A = texts[a], B = texts[b];
  return (A.weight - B.weight) || (A.size - B.size) || (A.a - B.a);
}

export function paint() {
  const total = fn + ln;
  orderArr.length = total;
  let k = 0;
  for (let i = 0; i < fn; i++) orderArr[k++] = i << 1;
  for (let i = 0; i < ln; i++) orderArr[k++] = (i << 1) | 1;
  const view = orderArr;
  view.sort(cmpDepth);

  const range = activeFaceRange();
  const lo = range[0], hi = range[1];

  let batchStyle = -1;
  let batching = false;

  function endBatch() {
    if (batching) { ctx.stroke(); stats.strokes++; batching = false; batchStyle = -1; }
  }

  for (let i = 0; i < total; i++) {
    const code = view[i];
    if (code & 1) {
      // ── 선 ──
      const idx = code >> 1;
      const st = lStyle[idx];
      if (st !== batchStyle) {
        endBatch();
        const aIdx = (st / 64) | 0;
        const wIdx = ((st % 64) / 4) | 0;
        const dIdx = st % 4;
        ctx.strokeStyle = inkStyle[aIdx];
        ctx.lineWidth = wIdx / 2;
        if (dIdx === 0) ctx.setLineDash([]);
        else if (dIdx === 1) ctx.setLineDash([3, 3]);
        else if (dIdx === 2) ctx.setLineDash([1, 3]);
        else ctx.setLineDash([8, 4]);
        ctx.beginPath();
        batchStyle = st;
        batching = true;
      }
      const i4 = idx * 4;
      const thin = ((st % 64) / 4 | 0) <= 2;
      if (thin) {
        // 축과 나란한 얇은 선만 스냅한다. 비스듬한 선을 스냅하면 계단이 진다.
        let x0 = lXY[i4], y0 = lXY[i4 + 1], x1 = lXY[i4 + 2], y1 = lXY[i4 + 3];
        if (Math.abs(y1 - y0) < 0.35) { const s = snap((y0 + y1) / 2); y0 = s; y1 = s; }
        if (Math.abs(x1 - x0) < 0.35) { const s = snap((x0 + x1) / 2); x0 = s; x1 = s; }
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      } else {
        ctx.moveTo(lXY[i4], lXY[i4 + 1]);
        ctx.lineTo(lXY[i4 + 2], lXY[i4 + 3]);
      }
    } else {
      // ── 면 ──
      endBatch();
      const idx = code >> 1;
      const s = fStart[idx], n = fLen[idx];
      ctx.beginPath();
      ctx.moveTo(fPts[s], fPts[s + 1]);
      for (let q = 1; q < n; q++) ctx.lineTo(fPts[s + q * 2], fPts[s + q * 2 + 1]);
      ctx.closePath();
      const mode = fMode[idx];
      if (mode === 0) {
        const g = Math.round(lo + (hi - lo) * fVal[idx]);
        ctx.fillStyle = grayStyle[g < 0 ? 0 : g > 255 ? 255 : g];
        ctx.fill();
      } else if (mode === 1) {
        ctx.fillStyle = inkStyle[fVal[idx] | 0];
        ctx.fill();
      }
      const e = fEdge[idx];
      if (e >= 0) {
        ctx.strokeStyle = inkStyle[e];
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.stroke();
        stats.strokes++;
      } else if (mode === 2) {
        ctx.strokeStyle = inkStyle[fVal[idx] | 0];
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.stroke();
        stats.strokes++;
      }
    }
  }
  endBatch();
  ctx.setLineDash([]);

  // 화면 공간 채움
  for (let i = 0; i < sn; i++) {
    const o = screenOps[i];
    ctx.fillStyle = inkStyle[o.a];
    ctx.fillRect(o.x, o.y, o.w, o.h);
  }

  // 글자. 폰트를 자주 바꾸면 비싸므로 크기·굵기로 묶어 정렬한다.
  if (tn > 0) {
    const idx = textOrder;
    idx.length = tn;
    for (let i = 0; i < tn; i++) idx[i] = i;
    idx.sort(cmpText);
    let curFont = '', curAlign = '', curBase = '', curA = -1;
    for (let i = 0; i < idx.length; i++) {
      const t = texts[idx[i]];
      if (t.dot) {
        ctx.fillStyle = inkStyle[t.a];
        ctx.fillRect(t.x - 0.75, t.y - 0.75, 1.5, 1.5);
        curA = -1;
        continue;
      }
      const f = t.weight + ' ' + t.size.toFixed(1) + 'px ' + FONT;
      if (f !== curFont) { ctx.font = f; curFont = f; }
      if (t.align !== curAlign) { ctx.textAlign = t.align; curAlign = t.align; }
      if (t.base !== curBase) { ctx.textBaseline = t.base; curBase = t.base; }
      if (t.a !== curA) { ctx.fillStyle = inkStyle[t.a]; curA = t.a; }
      ctx.fillText(t.s, t.x, t.y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  }
}

const FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const FONT_MONO = FONT;
export const FONT_KR = '"IBM Plex Sans KR", "Pretendard", system-ui, sans-serif';

// 05장의 반전을 화면 전체에 칠한다. clearRect 가 아니라 불투명 채움이어야
// 한다 — 지우면 페이지의 종이와 격자가 새어 들어와 반전이 깨진다.
export function flashGround() {
  ctx.fillStyle = activeGround();
  ctx.fillRect(0, 0, W, H);
}

export function size() { return { w: W, h: H, dpr: DPR }; }
