// 부품 표면의 회로.
//
// 면이 아니라 선으로 얹는다. 예전 파일에서 값 그대로 옮겼고, 달라진 것은
// 두 가지다. 하나, 알파에 세기(amp)를 곱할 수 있게 했다 — 전원이 오르며
// 회로가 살아나는 연출이 여기서 나온다. 둘, 글자는 그리는 자리에서 바로
// 찍지 않고 목록에 쌓는다(raster 가 프레임 끝에 한꺼번에 그린다).

import { line, fillY, text3 } from '../core/raster.js';
import {
  CX, CZ, MX, MZ, DX, DZ, IX, IZ, PX, PZ,
  CORE_COLS, CORE_ROWS, MEM_CHIP_Z, ioChipX,
  DIE_Y, PKG_Y, SOCK_Y, PLATTER_Y, PCH_Y,
  BUSES, pathPoint
} from './parts.js';
import { bit2, noise } from '../core/hash.js';

// ── 평면 위에 긋는 것들 ────────────────────────────────────────
export function rectY(x0, z0, x1, z1, y, a, w, reveal) {
  line([x0, y, z0], [x1, y, z0], a, w, reveal);
  line([x1, y, z0], [x1, y, z1], a, w, reveal);
  line([x1, y, z1], [x0, y, z1], a, w, reveal);
  line([x0, y, z1], [x0, y, z0], a, w, reveal);
}

export function gridY(x0, z0, x1, z1, y, cols, rows, a) {
  for (let i = 1; i < cols; i++) {
    const x = x0 + (x1 - x0) * i / cols;
    line([x, y, z0], [x, y, z1], a);
  }
  for (let i = 1; i < rows; i++) {
    const z = z0 + (z1 - z0) * i / rows;
    line([x0, y, z], [x1, y, z], a);
  }
}

export function rectX(z0, y0, z1, y1, x, a, w) {
  line([x, y0, z0], [x, y0, z1], a, w);
  line([x, y0, z1], [x, y1, z1], a, w);
  line([x, y1, z1], [x, y1, z0], a, w);
  line([x, y1, z0], [x, y0, z0], a, w);
}

export function gridX(z0, y0, z1, y1, x, cols, rows, a) {
  for (let i = 1; i < cols; i++) {
    const z = z0 + (z1 - z0) * i / cols;
    line([x, y0, z], [x, y1, z], a);
  }
  for (let i = 1; i < rows; i++) {
    const y = y0 + (y1 - y0) * i / rows;
    line([x, y, z0], [x, y, z1], a);
  }
}

export function ring(cx, cz, r, y, seg, a, from, to) {
  const t0 = from === undefined ? 0 : from;
  const t1 = to === undefined ? 1 : to;
  let prev = null;
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    if (u < t0 || u > t1) { prev = null; continue; }
    const ang = u * Math.PI * 2;
    const p = [cx + Math.cos(ang) * r, y, cz + Math.sin(ang) * r];
    if (prev) line(prev, p, a);
    prev = p;
  }
}

// ── CPU ───────────────────────────────────────────────────────
export function cpuDetail(t, amp, opts) {
  const k = amp === undefined ? 1 : amp;
  if (k <= 0.01) return;
  const o = opts || {};
  const y = DIE_Y;

  rectY(CX - 65, CZ - 65, CX + 65, CZ + 65, SOCK_Y, 0.16 * k);
  for (let i = 0; i < 26; i++) {                                  // 랜드 그리드
    const lx = CX - 63 + i * 5;
    line([lx, SOCK_Y, CZ - 63], [lx, SOCK_Y, CZ - 56], 0.13 * k);
    line([lx, SOCK_Y, CZ + 56], [lx, SOCK_Y, CZ + 63], 0.13 * k);
  }
  for (let i = 0; i < 24; i++) {
    const lz = CZ - 58 + i * 5;
    line([CX - 63, SOCK_Y, lz], [CX - 56, SOCK_Y, lz], 0.13 * k);
    line([CX + 56, SOCK_Y, lz], [CX + 63, SOCK_Y, lz], 0.13 * k);
  }

  rectY(CX - 52, CZ - 52, CX + 52, CZ + 52, PKG_Y, 0.2 * k);
  for (let i = 0; i < 9; i++) {                                   // 커패시터 열
    const px = CX - 44 + i * 11;
    fillY(px, CZ + 44, px + 6, CZ + 50, PKG_Y, 0.42 * k);
    fillY(px, CZ - 50, px + 6, CZ - 44, PKG_Y, 0.42 * k);
  }

  rectY(CX - 40, CZ - 40, CX + 40, CZ + 40, y, 0.3 * k);          // 다이 테두리
  rectY(CX - 36, CZ - 36, CX + 36, CZ + 36, y, 0.22 * k);         // 링 버스

  const busyOf = o.busy || function (i, j) {
    return Math.sin(t * 2.1 + (i * 4 + j) * 1.7) > 0.35 ? 1 : 0;
  };

  for (let i = 0; i < CORE_COLS.length; i++) {
    for (let j = 0; j < CORE_ROWS.length; j++) {
      const x0 = CX + CORE_COLS[i][0], x1 = CX + CORE_COLS[i][1];
      const z0 = CZ + CORE_ROWS[j][0], z1 = CZ + CORE_ROWS[j][1];
      const busy = busyOf(i, j, t);
      if (busy > 0) fillY(x0, z0, x1, z1, y, 0.13 * k * busy);
      rectY(x0, z0, x1, z1, y, 0.5 * k);
      gridY(x0 + 1.2, z0 + 1.2, x1 - 1.2, z1 - 1.2, y, 5, 3, 0.13 * k);
      fillY(x0 + 1.4, z0 + 1.4, x0 + 4.2, z1 - 1.4, y, 0.3 * k);
      line([x0, y, z1 + 0.7], [x1, y, z1 + 0.7], 0.2 * k);         // 링 정거장
    }
  }

  rectY(CX - 7, CZ - 34, CX + 7, CZ + 34, y, 0.28 * k);           // L3
  for (let i = 1; i < 10; i++) {
    const sz = CZ - 34 + (68 * i / 10);
    line([CX - 7, y, sz], [CX + 7, y, sz], 0.18 * k);
  }

  // 다이 가장자리의 세 블록. 바깥으로 나가는 신호는 전부 여기서 난다.
  rectY(CX + 34, CZ - 30, CX + 39, CZ + 30, y, 0.3 * k);          // IMC
  rectY(CX - 30, CZ + 34, CX + 30, CZ + 39, y, 0.3 * k);          // PCIE
  rectY(CX - 30, CZ - 39, CX + 30, CZ - 34, y, 0.3 * k);          // DMI
  for (let i = 0; i < 12; i++) {
    const q = -28 + i * 5;
    line([CX + 34, y, CZ + q], [CX + 39, y, CZ + q], 0.18 * k);
    line([CX + q, y, CZ + 34], [CX + q, y, CZ + 39], 0.18 * k);
    line([CX + q, y, CZ - 39], [CX + q, y, CZ - 34], 0.18 * k);
  }

  // 다이에서 난 신호를 기판과 소켓 가장자리까지 이어 붙인다.
  for (let i = 0; i < 5; i++) {
    const lz = CZ - 20 + i * 10;
    line([CX + 40, PKG_Y, lz], [CX + 66, PKG_Y, lz], 0.16 * k);
    const lx = CX - 20 + i * 10;
    line([lx, PKG_Y, CZ + 40], [lx, PKG_Y, CZ + 66], 0.16 * k);
    line([lx, PKG_Y, CZ - 66], [lx, PKG_Y, CZ - 40], 0.16 * k);
  }

  if (o.labels !== false) {
    const la = 0.5 * k;
    text3([CX, y, CZ], 'L3', 7, la);
    text3([CX + 36.5, y, CZ], 'IMC', 7, la);
    text3([CX, y, CZ + 36.5], 'PCIE', 7, la);
    text3([CX, y, CZ - 36.5], 'DMI', 7, la);
    text3([CX - 21, y, CZ - 30], 'CORE', 7, 0.42 * k);
  }
}

// ── 메모리 ────────────────────────────────────────────────────
export function memDetail(mx, t, amp, opts) {
  const k = amp === undefined ? 1 : amp;
  if (k <= 0.01) return;
  const o = opts || {};
  const sx = mx - 3.15;          // 기판 왼쪽 면
  const px = mx - 4.35;          // 칩 왼쪽 면

  line([sx, 56, MZ - 75], [sx, 56, MZ + 75], 0.18 * k);
  line([sx, 8, MZ - 75], [sx, 8, MZ + 75], 0.14 * k);

  for (let i = 0; i < MEM_CHIP_Z.length; i++) {
    const z0 = MEM_CHIP_Z[i] - 12, z1 = MEM_CHIP_Z[i] + 12;
    rectX(z0 + 1, 25, z1 - 1, 43, px, 0.28 * k);
    gridX(z0 + 1, 25, z1 - 1, 43, px, 6, 4, 0.15 * k);            // 셀 어레이
    line([px, 24, z0 + 2], [px, 24, z0 + 5], 0.4 * k, 1.4);        // 1번 핀
    for (let q = 0; q < 3; q++) {
      const tz = z1 + 2 + q * 2;
      if (tz > MZ + 74) continue;
      line([sx, 12, tz], [sx, 50, tz], 0.13 * k);
    }
  }

  for (let i = 0; i < 34; i++) {                                   // 접점
    const fz = MZ - 72 + i * 4.4;
    line([sx, 7, fz], [sx, 12, fz], 0.22 * k);
  }

  const lit = o.activity === undefined
    ? (Math.sin(t * 3.1 + mx) * 0.5 + 0.5)
    : o.activity;
  if (lit > 0) line([sx, 58, MZ - 75], [sx, 58, MZ - 75 + 150 * lit], 0.55 * k, 1.4);
}

// ── 디스크 ────────────────────────────────────────────────────
// 회전 각도를 밖에서 받는다. 11장은 화면 속 회전 속도와 카운터를 같은
// 시간 배율로 묶어야 하므로, 여기서 제멋대로 돌면 안 된다.
export function diskDetail(t, amp, opts) {
  const k = amp === undefined ? 1 : amp;
  if (k <= 0.01) return;
  const o = opts || {};
  const y = PLATTER_Y;
  const spin = o.spin === undefined ? t * 1.9 : o.spin;

  rectY(DX - 72, DZ - 58, DX + 72, DZ + 58, SOCK_Y, 0.16 * k);
  for (let i = 0; i < 4; i++) {
    const sx2 = DX + (i % 2 ? 64 : -64), sz2 = DZ + (i < 2 ? -51 : 51);
    rectY(sx2 - 3, sz2 - 3, sx2 + 3, sz2 + 3, SOCK_Y, 0.24 * k);
  }
  rectY(DX - 53, DZ + 44, DX + 43, DZ + 56, 9.3, 0.2 * k);
  for (let i = 0; i < 16; i++) {
    const bz = DX - 50 + i * 6;
    line([bz, 9.3, DZ + 45], [bz, 9.3, DZ + 55], 0.12 * k);
  }

  for (let i = 0; i < 5; i++) ring(DX, DZ, 20 + i * 8, y, 32, 0.12 * k);   // 트랙
  ring(DX, DZ, 52, y, 32, 0.22 * k);

  // 서보 마크. 각도 방향이라 존으로 나뉘지 않는다 — 존으로 나뉘는 것은
  // 데이터 섹터이고, 그건 바깥 트랙이 더 많다. 실제로는 회전당 100~400개라
  // 다 그리면 검은 원반이 되므로, 굵기로 성글게 추린다.
  const marks = o.servo === undefined ? 60 : o.servo;
  for (let i = 0; i < marks; i++) {
    const a = spin + (i / marks) * Math.PI * 2;
    const bold = i % 15 === 0;
    line([DX + Math.cos(a) * 52, y, DZ + Math.sin(a) * 52],
      [DX + Math.cos(a) * (bold ? 18 : 47), y, DZ + Math.sin(a) * (bold ? 18 : 47)],
      (bold ? 0.3 : 0.08) * k);
  }
}

// ── 확장 카드 ─────────────────────────────────────────────────
export function ioDetail(t, amp) {
  const k = amp === undefined ? 1 : amp;
  if (k <= 0.01) return;
  const y = 8.35;

  rectY(IX - 88, IZ - 26, IX + 88, IZ + 26, y, 0.2 * k);
  for (let i = 0; i < 10; i++) {
    const tz = IZ - 22 + i * 4.9;
    line([IX - 86, y, tz], [IX + 86, y, tz], 0.1 * k);
  }
  for (let q = 0; q < ioChipX.length; q++) {
    const cx2 = ioChipX[q];
    rectY(cx2 - 15, IZ - 13, cx2 + 15, IZ + 13, 18.3, 0.3 * k);
    gridY(cx2 - 15, IZ - 13, cx2 + 15, IZ + 13, 18.3, 5, 3, 0.15 * k);
    fillY(cx2 - 13.5, IZ - 11.5, cx2 - 11, IZ - 9, 18.3, 0.45 * k);
    const on = Math.sin(t * 2.4 + q * 2.2) > 0;
    fillY(cx2 + 18, IZ - 2, cx2 + 22, IZ + 2, y, (on ? 0.5 : 0.12) * k);
  }
}

// ── 칩셋 ──────────────────────────────────────────────────────
export function pchDetail(t, amp, opts) {
  const k = amp === undefined ? 1 : amp;
  if (k <= 0.01) return;
  const o = opts || {};
  const y = PCH_Y;

  rectY(PX - 22, PZ - 22, PX + 22, PZ + 22, y, 0.28 * k);
  gridY(PX - 18, PZ - 18, PX + 18, PZ + 18, y, 6, 6, 0.14 * k);
  fillY(PX - 20, PZ - 20, PX - 17, PZ - 17, y, 0.45 * k);
  rectY(PX - 26, PZ - 26, PX + 26, PZ + 26, 4.3, 0.18 * k);
  for (let i = 0; i < 10; i++) {
    const q = PX - 22 + i * 5;
    line([q, 4.3, PZ - 26], [q, 4.3, PZ - 22], 0.15 * k);
    line([q, 4.3, PZ + 22], [q, 4.3, PZ + 26], 0.15 * k);
  }
  const on = Math.sin(t * 3.4) > 0;
  fillY(PX + 16, PZ + 16, PX + 20, PZ + 20, y, (on ? 0.55 : 0.12) * k);
  if (o.labels !== false) text3([PX, y, PZ], 'PCH', 7, 0.5 * k);
}

// ── 전원부 ────────────────────────────────────────────────────
export function vrmDetail(t, amp) {
  const k = amp === undefined ? 1 : amp;
  if (k <= 0.01) return;
  for (let i = 0; i < 5; i++) {
    const z = -104 + i * 24;
    ring(-196, z, 8, 18.2, 12, 0.22 * k);
    line([-188, 0.6, z], [-178, 0.6, z], 0.28 * k);
    line([-162, 0.6, z], [-152, 0.6, z], 0.28 * k);
  }
}

// ── 보드 ──────────────────────────────────────────────────────
export function boardDetail(amp, opts) {
  const k = amp === undefined ? 1 : amp;
  if (k <= 0.01) return;
  const o = opts || {};
  const y = 0.4;
  const step = o.coarse ? 40 : 20;

  for (let x = -200; x <= 200; x += step) line([x, y, -140], [x, y, 140], 0.05 * k);
  for (let z = -140; z <= 140; z += step) line([-200, y, z], [200, y, z], 0.05 * k);

  for (let i = 0; i < 8; i++) {                    // CPU 와 메모리를 잇는 다발
    const tz = -78 + i * 8;
    line([-34, y, tz], [16, y, tz], 0.1 * k);
  }
  for (let i = 0; i < 14; i++) {                   // 비아
    const vx = -34 + i * 3.6;
    line([vx, y, -84], [vx, y, -82], 0.24 * k, 1.6);
  }

  rectY(CX - 66, CZ - 66, CX + 66, CZ + 66, y, 0.12 * k);   // 실크스크린
  rectY(DX - 76, DZ - 62, DX + 76, DZ + 62, y, 0.12 * k);
  rectY(IX - 92, IZ - 30, IX + 92, IZ + 30, y, 0.12 * k);
  rectY(PX - 30, PZ - 30, PX + 30, PZ + 30, y, 0.12 * k);
  for (let i = 0; i < MX.length; i++) rectY(MX[i] - 8, MZ - 82, MX[i] + 8, MZ + 82, y, 0.12 * k);
}

// 배선. 두께 없는 선 하나로만 긋는다. 부품 가장자리에서 부품 가장자리까지
// 끊기지 않고 이어지는 것, 그것만 하면 된다.
export function drawWires(amp, reveal) {
  const k = amp === undefined ? 1 : amp;
  if (k <= 0.01) return;
  const y = 0.6;
  for (let i = 0; i < BUSES.length; i++) {
    const path = BUSES[i].path;
    const r = reveal ? reveal(BUSES[i].name, i) : 1;
    if (r <= 0) continue;
    // 여러 마디를 이어 그리므로, 드러남은 전체 길이에 대해 잰다.
    let walked = 0;
    for (let q = 0; q < path.length - 1; q++) {
      const segLen = BUSES[i].seg[q];
      const from = walked / BUSES[i].length;
      const to = (walked + segLen) / BUSES[i].length;
      walked += segLen;
      if (r <= from) break;
      const local = r >= to ? 1 : (r - from) / (to - from);
      line([path[q][0], y, path[q][1]], [path[q + 1][0], y, path[q + 1][1]], 0.55 * k, 1.5, local);
    }
  }
  line([-34, y, -66], [23, y, -66], 0.28 * k);
  line([-34, y, -34], [23, y, -34], 0.28 * k);
  line([-188, y, -50], [-166, y, -50], 0.28 * k);
}

// ── 신호 ──────────────────────────────────────────────────────
// 선 위로 0 과 1 이 지나간다. 흐르는 것은 값이 아니라 비트열을 읽는 자리다.
// 그래서 같은 글자가 선을 따라 계속 밀려가는 것처럼 보인다.
//
// 비트는 hash 에서 뽑는다. Math.random 으로 뒤집으면 되감기가 깨진다.
const BIT = 13;
const BITS = 48;

function bitOf(busIdx, i, t) {
  // 몇 초에 한 자리씩 뒤집힌다. 시각의 함수라 되감아도 같은 무늬가 돌아온다.
  const epoch = Math.floor(t / 0.35);
  return bit2(busIdx * 7919 + (((i % BITS) + BITS) % BITS), epoch, 0.45);
}

export function drawSignals(t, amp, opts) {
  const k = amp === undefined ? 1 : amp;
  if (k <= 0.01) return;
  const o = opts || {};
  const only = o.only;      // 이름 배열. 주면 그 버스만 그린다

  for (let b = 0; b < BUSES.length; b++) {
    const bus = BUSES[b];
    if (only && only.indexOf(bus.name) < 0) continue;
    const speed = o.speed === undefined ? 1 : o.speed;
    const offset = (t * bus.speed * speed) % (BIT * BITS);
    const L = bus.length;

    for (let q = Math.ceil((-offset) / BIT - 0.5); ; q++) {
      const d = offset + (q + 0.5) * BIT;
      if (d > L) break;
      if (d < 0) continue;
      const i = Math.floor((d - offset) / BIT);
      const v = bitOf(b, i, t);
      const p = pathPoint(bus, d / L);
      text3([p[0], 1, p[1]], v ? '1' : '0', 9, (v ? 0.85 : 0.3) * k, 0, -5, 'center', true);
    }

    if (o.labels !== false) {
      const mid = pathPoint(bus, 0.5);
      text3([mid[0], 1, mid[1]], bus.name, 7, 0.42 * k, 0, 11);
    }
  }
}
