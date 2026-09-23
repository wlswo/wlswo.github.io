/*
 * Liquid Glass
 *
 * 1) 굴절과 반사광. macOS 26/iOS 26 의 유리는 뒤를 흐리는 판이 아니라 볼록한
 *    렌즈다. 가장자리(베젤)가 둥글게 솟아 있어서, 그 위를 지나는 빛이 꺾여
 *    뒤의 글자가 안쪽으로 휘어 보이고, 빛을 받는 쪽 테두리에 반사광이 맺힌다.
 *
 *    여기서는 그 렌즈를 실제로 계산한다. 베젤 단면을 볼록한 스쿼클
 *    y = (1 − (1 − x)⁴)^¼ 로 두고, 굴절률 1.5 의 유리에 수직으로 들어온 빛이
 *    스넬의 법칙대로 꺾여 바닥에 닿는 자리까지의 거리를 베젤의 각 지점마다
 *    구한다. 그 거리를 요소의 둥근 사각형 모양에 입혀 변위 지도(displacement
 *    map)를 만들고, 같은 표면의 기울기와 빛의 방향으로 반사광 지도도 만든다.
 *    둘 다 SVG 필터로 묶어 backdrop-filter 에 건다.
 *
 *    SVG 필터를 backdrop-filter 에 걸 수 있는 것은 Chromium 뿐이다.
 *    Safari·Firefox 는 CSS 유리(흐림 · 채도 · 테두리 빛 · 그림자)로 둔다.
 *
 *    data-refract="clear"   맑은 유리. 거의 흐리지 않아 뒤가 또렷이 휜다(Dock, 단추)
 *    data-refract="regular" 서리 낀 유리. 조금 흐리고 채도를 올린다(메뉴, 패널)
 *
 * 2) 빛. 유리 위에서 누르거나 마우스를 움직이면 그 자리가 은은하게 밝아진다.
 *
 * 3) 렌즈. 목록에서 고른 항목 뒤에 떠 있는 유리 알약. 다른 항목을 고르면
 *    스프링으로 미끄러져 가고, 가는 동안 진행 방향으로 늘어났다 돌아온다.
 */

// ── 1. 굴절과 반사광 ────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';
const IOR = 1.5; // 유리의 굴절률
const LIGHT = normalize(-0.55, -0.83); // 빛은 왼쪽 위에서 온다

const VARIANTS = {
  clear: { bezel: 16, thickness: 22, blur: 0.3, saturate: 1.5, specular: 0.9 },
  regular: { bezel: 14, thickness: 18, blur: 4, saturate: 1.8, specular: 0.65 },
};

const chromium =
  !!navigator.userAgentData?.brands?.some((b) => b.brand === 'Chromium') &&
  !matchMedia('(prefers-reduced-transparency: reduce)').matches;

let defs = null;
let seq = 0;

function normalize(x, y) {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

function ensureDefs() {
  if (defs) return defs;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  defs = document.createElementNS(SVG_NS, 'defs');
  svg.append(defs);
  document.body.append(svg);
  return defs;
}

// 베젤 단면: 가장자리(x=0)에서 가파르게 솟아 안쪽(x=1)에서 평평해지는 볼록 스쿼클.
const surface = (x) => Math.pow(1 - Math.pow(1 - x, 4), 0.25);

// 베젤 위 각 지점에서, 빛이 꺾여 바닥에 닿기까지 옆으로 밀린 거리(px)와
// 표면의 기울기(0 평평 … 1 수직)를 미리 적어 둔다.
const PROFILE_STEPS = 256;
const profiles = new Map();
function profile(bezel, thickness) {
  const key = `${bezel}:${thickness}`;
  if (profiles.has(key)) return profiles.get(key);
  const shift = new Float32Array(PROFILE_STEPS + 1);
  const tilt = new Float32Array(PROFILE_STEPS + 1);
  const dx = 1 / PROFILE_STEPS;
  for (let i = 0; i <= PROFILE_STEPS; i++) {
    const x = Math.max(dx / 4, i / PROFILE_STEPS);
    const a = Math.max(0, x - dx / 2);
    const b = Math.min(1, x + dx / 2);
    const slope = ((surface(b) - surface(a)) / (b - a)) * (thickness / bezel);
    const theta = Math.atan(slope); // 표면이 기운 각
    const theta2 = Math.asin(Math.sin(theta) / IOR); // 스넬의 법칙
    const height = thickness * surface(x); // 이 지점의 유리 두께
    shift[i] = height * Math.tan(theta - theta2);
    tilt[i] = Math.sin(theta);
  }
  const value = { shift, tilt };
  profiles.set(key, value);
  return value;
}

// 요소의 모양(둥근 사각형) 위에 베젤을 입혀 두 장의 지도를 그린다.
//   변위 지도: R·G 에 '어디서 끌어올지'. 128 이 그대로.
//   반사광 지도: 흰 빛의 세기를 알파에. 빛을 마주한 테두리가 가장 밝고,
//               반대편 테두리에도 한 번 더 약하게 맺힌다. 맨 가장자리는 가는 선.
function maps(w, h, r, v) {
  const bezel = Math.max(2, Math.min(v.bezel, w / 2, h / 2));
  const { shift, tilt } = profile(bezel, v.thickness);
  const cx = w / 2;
  const cy = h / 2;
  const hx = cx - r;
  const hy = cy - r;

  const dispCanvas = document.createElement('canvas');
  const specCanvas = document.createElement('canvas');
  dispCanvas.width = specCanvas.width = w;
  dispCanvas.height = specCanvas.height = h;
  const dctx = dispCanvas.getContext('2d');
  const sctx = specCanvas.getContext('2d');
  const disp = dctx.createImageData(w, h);
  const spec = sctx.createImageData(w, h);
  const dx = new Float32Array(w * h);
  const dy = new Float32Array(w * h);
  let peak = 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const px = x + 0.5 - cx;
      const py = y + 0.5 - cy;
      const qx = Math.abs(px) - hx;
      const qy = Math.abs(py) - hy;
      const inset = -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r);
      if (inset <= 0 || inset >= bezel) continue;

      // 바깥을 향한 법선
      let nx = 0;
      let ny = 0;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1;
        nx = (qx / l) * Math.sign(px);
        ny = (qy / l) * Math.sign(py);
      } else if (qx > qy) nx = Math.sign(px);
      else ny = Math.sign(py);

      const k = Math.min(PROFILE_STEPS, Math.round((inset / bezel) * PROFILE_STEPS));
      const s = shift[k];
      dx[i] = -nx * s; // 볼록한 베젤에서 빛은 안쪽으로 꺾인다
      dy[i] = -ny * s;
      peak = Math.max(peak, Math.abs(dx[i]), Math.abs(dy[i]));

      const facing = nx * LIGHT[0] + ny * LIGHT[1];
      const glow =
        Math.pow(tilt[k], 1.6) * (0.25 + 0.75 * Math.pow(Math.max(0, facing), 1.5)) +
        Math.pow(tilt[k], 2.5) * 0.45 * Math.pow(Math.max(0, -facing), 2);
      const rim = inset < 1.25 ? 0.55 * (1 - inset / 1.25) : 0;
      const a = Math.min(1, (glow + rim) * v.specular);
      spec.data[i * 4] = 255;
      spec.data[i * 4 + 1] = 255;
      spec.data[i * 4 + 2] = 255;
      spec.data[i * 4 + 3] = Math.round(a * 255);
    }
  }

  const scale = Math.ceil(peak * 2 + 2);
  for (let i = 0; i < w * h; i++) {
    disp.data[i * 4] = 128 + (dx[i] / scale) * 255;
    disp.data[i * 4 + 1] = 128 + (dy[i] / scale) * 255;
    disp.data[i * 4 + 2] = 128;
    disp.data[i * 4 + 3] = 255;
  }
  dctx.putImageData(disp, 0, 0);
  sctx.putImageData(spec, 0, 0);
  return { disp: dispCanvas.toDataURL(), spec: specCanvas.toDataURL(), scale };
}

function buildFilter(el, id) {
  // 변형(scale)이 걸려 있어도 레이아웃 크기로 잰다. 필터는 그 좌표계에서 돈다.
  const w = Math.round(el.offsetWidth);
  const h = Math.round(el.offsetHeight);
  if (w < 4 || h < 4) return false;
  const v = VARIANTS[el.dataset.refract] || VARIANTS.clear;
  const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);

  let filter = document.getElementById(id);
  if (!filter) {
    filter = document.createElementNS(SVG_NS, 'filter');
    filter.id = id;
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.innerHTML = `
      <feGaussianBlur in="SourceGraphic" stdDeviation="${v.blur}" result="frost"/>
      <feImage result="map" preserveAspectRatio="none"/>
      <feDisplacementMap in="frost" in2="map" xChannelSelector="R" yChannelSelector="G" result="bent"/>
      <feColorMatrix in="bent" type="saturate" values="${v.saturate}" result="rich"/>
      <feImage result="light" preserveAspectRatio="none"/>
      <feComposite in="light" in2="rich" operator="over"/>`;
    ensureDefs().append(filter);
  }
  const box = { x: 0, y: 0, width: w, height: h };
  for (const [k, val] of Object.entries(box)) filter.setAttribute(k, val);
  const [mapImage, lightImage] = filter.querySelectorAll('feImage');
  const m = maps(w, h, r, v);
  for (const img of [mapImage, lightImage]) {
    for (const [k, val] of Object.entries(box)) img.setAttribute(k, val);
  }
  mapImage.setAttribute('href', m.disp);
  lightImage.setAttribute('href', m.spec);
  filter.querySelector('feDisplacementMap').setAttribute('scale', m.scale);
  return true;
}

function refract(el) {
  const id = `lg-${++seq}`;
  let size = '';
  const update = () => {
    const next = `${Math.round(el.offsetWidth)}x${Math.round(el.offsetHeight)}`;
    if (next === size) return;
    size = next;
    if (buildFilter(el, id)) {
      el.style.setProperty('backdrop-filter', `url(#${id})`);
      el.style.setProperty('-webkit-backdrop-filter', `url(#${id})`);
      el.classList.add('is-refracting');
    }
  };
  new ResizeObserver(update).observe(el);
}

export function refractAll(root = document) {
  if (!chromium) return;
  const found = [...root.querySelectorAll('[data-refract]:not([data-refract-ready])')];
  if (root.matches?.('[data-refract]:not([data-refract-ready])')) found.push(root);
  for (const el of found) {
    el.setAttribute('data-refract-ready', '');
    refract(el);
  }
}

// ── 2. 빛 ───────────────────────────────────────────────────────
// 유리 위의 손끝(마우스) 자리를 --gx/--gy 로 넘긴다. CSS 가 그 자리에 은은한
// 빛을 둔다. 누르는 동안(.is-lit)에는 조금 더 밝게.
function light(el) {
  const move = (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--gx', `${e.clientX - r.left}px`);
    el.style.setProperty('--gy', `${e.clientY - r.top}px`);
  };
  el.addEventListener('pointermove', move, { passive: true });
  el.addEventListener('pointerenter', (e) => {
    move(e);
    el.classList.add('is-hover');
  });
  el.addEventListener('pointerleave', () => el.classList.remove('is-hover', 'is-lit'));
  el.addEventListener('pointerdown', (e) => {
    move(e);
    el.classList.add('is-lit');
  });
  for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, () => el.classList.remove('is-lit'));
}

function init() {
  refractAll();
  for (const el of document.querySelectorAll('[data-glass-light]')) light(el);
}

// 레이아웃이 자리 잡은 뒤에 잰다. hidden 으로 시작한 요소는 보일 때 다시 부른다.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

// ── 3. 렌즈 ─────────────────────────────────────────────────────

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/**
 * group  렌즈가 떠다닐 목록(ul/ol). position: relative 여야 한다.
 * 반환   { moveTo(item, { instant }), press(item), follow(clientX), release(), hide() }
 */
export function createLens(group, { glass = null } = {}) {
  const lens = document.createElement('li');
  lens.className = 'lens';
  lens.setAttribute('aria-hidden', 'true');
  lens.setAttribute('role', 'presentation');
  const body = document.createElement('span');
  body.className = 'lens__body';
  if (glass) {
    body.dataset.refract = glass;
    if (document.readyState !== 'loading') queueMicrotask(() => refractAll(lens));
  }
  lens.append(body);
  group.prepend(lens);

  let current = null;
  let last = null;

  // 창이 열리거나 Dock 에서 돌아오는 동안(scale 애니메이션)에도 레이아웃 크기로 잰다.
  // getBoundingClientRect 는 조상의 변형까지 담으므로, 그 배율만큼 되돌린다.
  function place(item) {
    const g = group.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    const kx = g.width && group.offsetWidth ? g.width / group.offsetWidth : 1;
    const ky = g.height && group.offsetHeight ? g.height / group.offsetHeight : 1;
    return {
      x: (r.left - g.left) / kx + group.scrollLeft - group.clientLeft,
      y: (r.top - g.top) / ky + group.scrollTop - group.clientTop,
      w: r.width / kx,
      h: r.height / ky,
    };
  }

  function apply(p) {
    lens.style.setProperty('--lx', `${p.x}px`);
    lens.style.setProperty('--ly', `${p.y}px`);
    lens.style.setProperty('--lw', `${p.w}px`);
    lens.style.setProperty('--lh', `${p.h}px`);
  }

  // 움직이는 방향으로 늘어났다가, 도착하면서 반대로 한 번 눌렸다 돌아온다.
  function stretch(from, to) {
    if (reducedMotion.matches || !body.animate) return;
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    if (dx + dy < 2) return;
    const along = dy > dx ? 'Y' : 'X';
    const across = along === 'Y' ? 'X' : 'Y';
    const amt = Math.min(0.16, 0.05 + (dx + dy) / 1600);
    body.animate(
      [
        { transform: 'scale(1, 1)' },
        { transform: `scale${along}(${1 + amt}) scale${across}(${1 - amt * 0.6})`, offset: 0.3 },
        { transform: `scale${along}(${1 - amt * 0.35}) scale${across}(${1 + amt * 0.25})`, offset: 0.62 },
        { transform: 'scale(1, 1)' },
      ],
      { duration: 560, easing: 'cubic-bezier(.3,.7,.3,1)' },
    );
  }

  function moveTo(item, { instant = false } = {}) {
    lens.classList.remove('is-following');
    if (!item) return;
    const p = place(item);
    if (instant || !last) {
      lens.classList.add('is-instant');
      apply(p);
      lens.getBoundingClientRect(); // 전환 없이 자리를 먼저 잡는다
      lens.classList.remove('is-instant');
    } else {
      stretch(last, p);
      apply(p);
    }
    lens.classList.add('is-visible');
    current = item;
    last = p;
  }

  // 눌린 동안에는 유리가 손끝 쪽으로 살짝 떠오른다.
  function press(item) {
    if (item !== current) moveTo(item);
    lens.classList.add('is-pressed');
  }

  // 누른 채로 끄는 동안: 렌즈가 손끝을 곧바로 따라온다. 목록 밖으로는 나가지 않는다.
  // 렌즈 한가운데에 가장 가까운 항목을 돌려준다.
  function follow(clientX) {
    if (!last) return null;
    const g = group.getBoundingClientRect();
    const min = group.clientLeft;
    const max = group.clientWidth - last.w; // scrollWidth 는 렌즈가 밀려날수록 늘어난다
    const x = Math.max(min, Math.min(max, clientX - g.left + group.scrollLeft - last.w / 2));
    lens.classList.add('is-following');
    lens.style.setProperty('--lx', `${x}px`);
    last = { ...last, x };
    const mid = clientX;
    let best = null;
    let dist = Infinity;
    for (const el of group.querySelectorAll(':scope > li:not(.lens) > *')) {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < dist) {
        dist = d;
        best = el;
      }
    }
    return best;
  }

  function release() {
    lens.classList.remove('is-pressed');
  }

  function hide() {
    lens.classList.remove('is-visible');
    current = null;
    last = null;
  }

  // 글꼴이 늦게 들어오거나 창 폭이 바뀌면 항목의 크기가 달라진다.
  new ResizeObserver(() => {
    if (current) moveTo(current, { instant: true });
  }).observe(group);

  return { moveTo, press, follow, release, hide, el: lens, get current() { return current; } };
}
