// 입체를 만드는 기본 도구. 예전 파일에서 값 그대로 옮겼다.
//
// 단위는 mm 라고 생각하면 편하다. 보드 윗면이 y = 0 이고 부품은 전부 그 위에
// 선다. x 는 오른쪽, z 는 보는 사람 쪽이다.

export function boxFaces(cx, cy, cz, w, h, d) {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const y0 = cy - h / 2, y1 = cy + h / 2;
  const z0 = cz - d / 2, z1 = cz + d / 2;
  // 바깥에서 봤을 때 반시계 방향. 그래야 법선이 바깥을 향한다.
  return [
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]
  ];
}

// 바닥 평면의 다각형을 위로 밀어 올려 기둥을 만든다. 원기둥이든 팔이든
// 밑면 모양만 주면 되고, 감는 방향은 부호 있는 넓이를 보고 맞춘다.
export function slab(poly, y0, y1) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const p = area > 0 ? poly.slice().reverse() : poly.slice();
  const top = [], bot = [];
  for (let i = 0; i < p.length; i++) {
    top.push([p[i][0], y1, p[i][1]]);
    bot.push([p[i][0], y0, p[i][1]]);
  }
  const faces = [top, bot.slice().reverse()];
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    faces.push([bot[i], bot[j], top[j], top[i]]);
  }
  return faces;
}

export function circle(cx, cz, r, seg, phase) {
  const p = [];
  for (let i = 0; i < seg; i++) {
    const a = (phase || 0) + (i / seg) * Math.PI * 2;
    p.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return p;
}

export function concat(list) {
  let out = [];
  for (let i = 0; i < list.length; i++) out = out.concat(list[i]);
  return out;
}

// 큰 면을 깊이 방향으로 잘라 여러 조각으로 만든다.
//
// 화가 알고리즘은 면의 중심 하나로 순서를 정한다. 메모리 기판처럼 깊이가
// 150mm 나 되는 면은 중심 한 점으로는 제대로 줄을 설 수 없고, 카메라를
// 위로 올리면 DIMM 이 CPU 를 뚫고 나온다. 조각으로 나누면 각 조각의 중심이
// 제자리를 찾는다.
export function splitFaces(faces, n) {
  if (n <= 1) return faces;
  const out = [];
  for (let f = 0; f < faces.length; f++) {
    const q = faces[f];
    if (q.length !== 4) { out.push(q); continue; }
    // 네 점 중 가장 긴 변의 방향으로 자른다.
    const e01 = dist(q[0], q[1]), e12 = dist(q[1], q[2]);
    if (Math.max(e01, e12) < 40) { out.push(q); continue; }
    if (e01 >= e12) {
      for (let i = 0; i < n; i++) {
        const a = i / n, b = (i + 1) / n;
        out.push([lerp3(q[0], q[1], a), lerp3(q[0], q[1], b), lerp3(q[3], q[2], b), lerp3(q[3], q[2], a)]);
      }
    } else {
      for (let i = 0; i < n; i++) {
        const a = i / n, b = (i + 1) / n;
        out.push([lerp3(q[0], q[3], a), lerp3(q[1], q[2], a), lerp3(q[1], q[2], b), lerp3(q[0], q[3], b)]);
      }
    }
  }
  return out;
}

function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// 면 목록을 감싸는 상자. 카메라가 대상을 잡을 때, 화면 밖 판정을 할 때 쓴다.
export function boundsOf(faces) {
  const b = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    for (let j = 0; j < f.length; j++) {
      const p = f[j];
      if (p[0] < b.x0) b.x0 = p[0];
      if (p[1] < b.y0) b.y0 = p[1];
      if (p[2] < b.z0) b.z0 = p[2];
      if (p[0] > b.x1) b.x1 = p[0];
      if (p[1] > b.y1) b.y1 = p[1];
      if (p[2] > b.z1) b.z1 = p[2];
    }
  }
  return b;
}

export function box(x0, y0, z0, x1, y1, z1) {
  return { x0, y0, z0, x1, y1, z1 };
}
