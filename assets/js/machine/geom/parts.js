// 부품의 입체와, 그 부품을 감싸는 상자.
//
// 좌표는 예전 파일에서 값 그대로 옮겼다. 달라진 것은 두 가지다.
//
// 하나, 부품마다 sortAt 점 하나로 순서를 정하던 것을 없앴다. 이제 면을 전부
// 한 배열에 모아 한 번에 정렬한다(core/raster.js). 헤드 암을 y 220 이라는
// 가짜 좌표로 억지로 맨 뒤에 밀어 넣던 것도 함께 사라졌다.
//
// 둘, 깊이가 큰 면 — 메모리 기판, 보드 — 은 조각으로 나눈다. 중심 한 점으로
// 정렬되는 커다란 면은 카메라를 위로 올리는 순간 이웃을 뚫는다.

import { boxFaces, slab, circle, concat, splitFaces, boundsOf, box } from './solid.js';

// ── 자리 ──────────────────────────────────────────────────────
export const CX = -100, CZ = -50;          // CPU
export const MX = [30, 54, 78], MZ = -50;  // 메모리 세 장
export const DX = -95, DZ = 88;            // 디스크
export const IX = 115, IZ = 85;            // 확장 카드
export const PX = 150, PZ = -30;           // 칩셋
export const VX = -196, VZ0 = -104;        // 전원부 첫 상

// ── 보드 ──────────────────────────────────────────────────────
export const boardFaces = splitFaces(boxFaces(0, -5, 0, 440, 10, 300), 4);

// ── CPU ───────────────────────────────────────────────────────
// 소켓판 → 기판 → 다이 순으로 쌓는다.
export const cpuFaces = concat([
  boxFaces(CX, 3, CZ, 132, 6, 132),      // 소켓판
  boxFaces(CX, 9, CZ, 108, 6, 108),      // 기판
  boxFaces(CX, 15, CZ, 80, 6, 80)        // 다이
]);

export const CORE_COLS = [[-32, -10], [10, 32]];   // 코어 두 줄, 그 사이가 캐시
export const CORE_ROWS = [];
for (let cr = 0; cr < 4; cr++) CORE_ROWS.push([-30 + cr * 15.5, -30 + cr * 15.5 + 13]);

export const DIE_Y = 18.35;      // 다이 윗면. 회로를 얹는 높이
export const PKG_Y = 12.35;      // 기판 윗면
export const SOCK_Y = 6.35;      // 소켓 윗면

// 코어 하나의 사각형. 03·04장이 여기서 자란다.
export function coreRect(i, j) {
  return {
    x0: CX + CORE_COLS[i][0], x1: CX + CORE_COLS[i][1],
    z0: CZ + CORE_ROWS[j][0], z1: CZ + CORE_ROWS[j][1]
  };
}

// 여덟 코어를 링 순서대로. 06장의 링 정거장이 이 순서를 따른다.
export const CORE_ORDER = [];
for (let j = 0; j < 4; j++) CORE_ORDER.push([0, j]);
for (let j = 3; j >= 0; j--) CORE_ORDER.push([1, j]);

// ── 메모리 ────────────────────────────────────────────────────
// 기판 한 장이 곧 부품 하나다. 세 장을 따로 세워야 앞뒤가 바르게 겹친다.
export const MEM_CHIP_Z = [-110, -78, -46, -14];

export function memFaces(mx) {
  let faces = concat([
    boxFaces(mx, 3, MZ, 14, 6, 158)                     // 슬롯
  ]);
  faces = faces.concat(splitFaces(boxFaces(mx, 32, MZ, 6, 52, 150), 5));   // 기판
  for (let i = 0; i < MEM_CHIP_Z.length; i++) {
    faces = faces.concat(boxFaces(mx - 0.6, 34, MEM_CHIP_Z[i], 7.2, 20, 24));
  }
  faces = faces.concat(boxFaces(mx - 0.6, 50, MZ + 40, 7.2, 8, 10));       // SPD
  return faces;
}

export const memAll = [memFaces(MX[0]), memFaces(MX[1]), memFaces(MX[2])];

// ── 디스크 ────────────────────────────────────────────────────
export const diskFaces = concat([
  boxFaces(DX, 3, DZ, 150, 6, 120),                 // 섀시
  slab(circle(DX, DZ, 9, 16), 6, 12),               // 스핀들
  slab(circle(DX, DZ, 54, 32), 12, 14),             // 아래 플래터
  slab(circle(DX, DZ, 11, 16), 14, 20),             // 스페이서
  slab(circle(DX, DZ, 54, 32), 20, 22),             // 위 플래터
  slab(circle(DX + 65, DZ + 52, 9, 12), 6, 26),     // 액추에이터 축
  boxFaces(DX - 5, 7.5, DZ + 50, 100, 3, 16),       // 컨트롤러 기판
  boxFaces(DX - 35, 12, DZ + 50, 20, 6, 10),        // 컨트롤러 칩
  boxFaces(DX + 5, 12, DZ + 50, 26, 6, 10),         // 버퍼
  boxFaces(DX + 67, 10, DZ + 42, 16, 8, 14)         // 신호 커넥터
]);

export const PLATTER_Y = 22.3;
export const PLATTER_R = 54;

// 헤드 암. 각도를 받아 그때의 입체를 만든다.
export function armFaces(angle) {
  const pivot = [DX + 65, DZ + 52];
  const nx = Math.cos(angle), nz = Math.sin(angle);
  const px = -nz, pz = nx;
  const len = 104;
  const poly = [
    [pivot[0] + px * 8, pivot[1] + pz * 8],
    [pivot[0] + nx * len + px * 2.2, pivot[1] + nz * len + pz * 2.2],
    [pivot[0] + nx * len - px * 2.2, pivot[1] + nz * len - pz * 2.2],
    [pivot[0] - px * 8, pivot[1] - pz * 8]
  ];
  return slab(poly, 24, 27);
}

// 암 끝(헤드)이 놓이는 자리.
export function headAt(angle) {
  const pivot = [DX + 65, DZ + 52];
  return [pivot[0] + Math.cos(angle) * 104, 25.5, pivot[1] + Math.sin(angle) * 104];
}

export const ARM_REST = Math.PI * 1.22;

// ── 확장 카드 ─────────────────────────────────────────────────
export const ioChipX = [IX - 56, IX, IX + 56];

export const ioFaces = (function () {
  let f = boxFaces(IX, 4, IZ, 180, 8, 56);
  for (let i = 0; i < ioChipX.length; i++) {
    f = f.concat(boxFaces(ioChipX[i], 13, IZ, 34, 10, 30));
  }
  f = f.concat(boxFaces(IX - 84, 12, IZ, 8, 8, 40));
  for (let p = 0; p < 3; p++) {
    f = f.concat(boxFaces(IX - 56 + p * 56, 14, IZ + 23, 30, 12, 14));
  }
  return f;
})();

// ── 칩셋 ──────────────────────────────────────────────────────
// CPU 와 디스크 사이를 중계한다. 디스크로 가는 신호는 전부 여기를 거친다.
export const pchFaces = concat([
  boxFaces(PX, 2, PZ, 52, 4, 52),
  boxFaces(PX, 9, PZ, 44, 10, 44)
]);

export const PCH_Y = 14.3;

// ── 전원부 ────────────────────────────────────────────────────
// 인터리브 벅 컨버터 다섯 상. 72도씩 어긋나 켜져 리플이 서로 상쇄된다.
export const VRM_PHASES = 5;
export const vrmChoke = [];
export const vrmFet = [];
for (let i = 0; i < VRM_PHASES; i++) {
  const z = VZ0 + i * 24;
  vrmChoke.push(slab(circle(VX, z, 8, 12), 0, 18));
  vrmFet.push(boxFaces(-170, 5, z, 16, 10, 12));
}
export const vrmFaces = concat(vrmChoke.concat(vrmFet));
export function vrmPhaseZ(i) { return VZ0 + i * 24; }

// ── 상자 ──────────────────────────────────────────────────────
// 카메라가 무엇을 볼지 이름으로 고를 수 있게.
export const BOX = {
  board: boundsOf(boardFaces),
  cpu: boundsOf(cpuFaces),
  die: box(CX - 40, DIE_Y - 1, CZ - 40, CX + 40, DIE_Y + 1, CZ + 40),
  pkg: box(CX - 54, 0, CZ - 54, CX + 54, 20, CZ + 54),
  core0: (function () { const r = coreRect(0, 1); return box(r.x0, DIE_Y - 1, r.z0, r.x1, DIE_Y + 1, r.z1); })(),
  l3: box(CX - 7, DIE_Y - 1, CZ - 34, CX + 7, DIE_Y + 1, CZ + 34),
  mem: boundsOf(memAll[0].concat(memAll[1], memAll[2])),
  mem0: boundsOf(memAll[0]),
  disk: boundsOf(diskFaces),
  platter: box(DX - PLATTER_R, PLATTER_Y - 2, DZ - PLATTER_R, DX + PLATTER_R, PLATTER_Y + 6, DZ + PLATTER_R),
  io: boundsOf(ioFaces),
  pch: boundsOf(pchFaces),
  vrm: boundsOf(vrmFaces),
  // 전체. 첫 프레임과 마지막 프레임이 이 상자를 쓴다.
  all: box(-220, -10, -150, 220, 62, 150)
};

// 부품 목록. 화면 밖 판정과 LOD 가 이 단위로 돈다.
export const PARTS = [
  { id: 'vrm', faces: vrmFaces, box: BOX.vrm },
  { id: 'cpu', faces: cpuFaces, box: BOX.cpu },
  { id: 'mem0', faces: memAll[0], box: boundsOf(memAll[0]) },
  { id: 'mem1', faces: memAll[1], box: boundsOf(memAll[1]) },
  { id: 'mem2', faces: memAll[2], box: boundsOf(memAll[2]) },
  { id: 'pch', faces: pchFaces, box: BOX.pch },
  { id: 'io', faces: ioFaces, box: BOX.io },
  { id: 'disk', faces: diskFaces, box: BOX.disk }
];

// ── 보드 배선 ─────────────────────────────────────────────────
// 부품 사이를 실제로 지나갈 수 있는 길만 남긴다. 다른 부품의 발자국을
// 밟고 지나가는 배선은 없고, 서로 교차하지도 않는다. 양 끝은 부품의
// 가장자리에 닿는다. 디스크는 CPU 와 직접 닿지 않고 칩셋을 거친다.
export const BUSES = [
  { name: 'DDR', speed: 34, path: [[-34, -50], [23, -50]] },
  { name: 'PCIE', speed: 46, path: [[-34, 4], [-14, 4], [-14, 70], [25, 70]] },
  { name: 'DMI', speed: 58, path: [[-34, -104], [-28, -104], [-28, -140], [PX, -140], [PX, -52]] },
  { name: 'SATA', speed: 40, path: [[PX, -8], [212, -8], [212, 130], [-20, 130]] }
];

// 길이를 미리 재 둔다. 예전 코드는 pathPoint 를 부를 때마다 전체 길이를
// 다시 걸었다 — 프레임당 70번쯤 헛걸음이었다.
for (let i = 0; i < BUSES.length; i++) {
  const p = BUSES[i].path;
  let total = 0;
  const seg = [];
  for (let k = 0; k < p.length - 1; k++) {
    const d = Math.abs(p[k + 1][0] - p[k][0]) + Math.abs(p[k + 1][1] - p[k][1]);
    seg.push(d);
    total += d;
  }
  BUSES[i].seg = seg;
  BUSES[i].length = total;
}

export function pathPoint(bus, t) {
  const path = bus.path;
  let target = bus.length * t;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const s = bus.seg[i];
    if (target <= s || i === path.length - 2) {
      const k = s === 0 ? 0 : target / s;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    target -= s;
  }
  return path[0];
}

export function busByName(n) {
  for (let i = 0; i < BUSES.length; i++) if (BUSES[i].name === n) return BUSES[i];
  return null;
}
