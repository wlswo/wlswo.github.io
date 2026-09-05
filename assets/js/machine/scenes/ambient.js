// 가운데 버튼을 누르면 나오는 화면.
//
// 위에서 곧게 내려다본 기계 한 판. 장면이 흘러가지 않고, 무엇도 스스로
// 재생되지 않는다. 움직이는 것은 기계 자신뿐이다 — 선 위를 지나가는 비트,
// 제 속도로 깜빡이는 코어, 도는 플래터, 잦아드는 헤드 암.
//
// yaw 를 0 으로 두어야 보드의 네 변이 화면의 네 변과 나란해지고, dolly 를
// 크게 올리고 flatten 을 섞어야 원근이 빠져 한 장의 평면도로 읽힌다.
//
// 여기에는 라벨도 계기도 없다. 필요한 말은 이미 도면이 하고 있다.

import * as R from '../core/raster.js';
import { noise } from '../core/hash.js';
import { drawMachine, screenSize } from './common.js';
import { BOX, MX, MZ, ARM_REST, CX, CZ, DIE_Y, coreRect } from '../geom/parts.js';

export const AMBIENT_CAM = {
  focus: BOX.all,
  yaw: 0,
  pitch: 1.46,
  dolly: 2600,
  flatten: 0.62,
  fill: 0.9,
  turnPortrait: true
};

export default {
  id: 'ambient',
  no: '',
  title: 'MACHINE',
  kr: '기계',
  line: '',
  nums: [],
  dur: 0,
  keyT: 0,
  index: 0,
  start: 0,

  camAt() { return AMBIENT_CAM; },

  render(t, env) {
    const q = env.quality;

    drawMachine(t, {
      quality: q,
      focus: ['cpu', 'mem0', 'mem1', 'mem2', 'disk', 'pch', 'io', 'vrm'],
      wires: 1,
      signals: 0.95,
      // 버스 이름도 여기서 따로 찍는다. drawSignals 는 선 한가운데에
      // 얹는데, 거기는 0 과 1 이 끊임없이 지나가는 자리다.
      busLabels: false,
      spin: t * 1.9,
      arm: ARM_REST + Math.sin(t * 0.47) * 0.22,
      // 다이 위의 블록 이름은 여기서 따로 찍는다. cpuDetail 의 7px 는
      // 영화에서 스치듯 지나갈 때의 크기라, 멈춰 서서 읽는 이 화면에서는
      // 배경에 묻힌다.
      cpu: {
        labels: false,
        // 여덟 코어가 한 박자로 깜빡이지 않는다. 코어마다 주파수가 다르고,
        // 서로 배수가 아닌 값을 골라 두어 무늬가 반복되지 않는다.
        busy: (i, j) => (Math.sin(t * (1.7 + (i * 4 + j) * 0.23) + (i * 4 + j) * 2.1) > 0.15 ? 1 : 0)
      },
      // 칩셋 이름은 바깥에 지시선으로 붙이므로 칩 위에는 찍지 않는다.
      pch: { labels: false },
      mem: [
        { activity: 0.5 + 0.5 * Math.sin(t * 2.7) },
        { activity: 0.5 + 0.5 * Math.sin(t * 3.3 + 1.1) },
        { activity: 0.5 + 0.5 * Math.sin(t * 2.2 + 2.4) }
      ]
    });

    drawRefresh(t);
    drawNames();
  }
};

// ── 이름 ──────────────────────────────────────────────────────
// 도면이 하는 방식으로 붙인다. 이름은 부품 바깥의 빈 자리에 두고, 가는
// 지시선 하나로 부품 가장자리까지 잇는다. 부품 위에 글자를 얹으면 그
// 아래의 회로를 가리고, 각도를 돌리는 순간 어디를 가리키는지 잃는다.
//
// 자리는 월드 좌표라 손으로 돌려도 이름이 제 부품을 따라간다.
// 자리를 고를 때 지킨 것 하나: 네 개의 버스가 지나가는 길을 피한다.
// 배선 위에는 0 과 1 이 끊임없이 흘러가므로, 그 위에 이름을 얹으면
// 글자와 비트가 서로를 갉아먹는다.
//
//   DDR   z=-50  x -34..23        PCIE  x=-14 z 4..70
//   DMI   z=-140 x -28..150,      그리고 x=150 z -140..-52
//   SATA  z=-8 x 150..212,        x=212 z -8..130,  z=130 x -20..212
const NAMES = [
  { at: [-196, 1.2, -130], from: [-196, 1.2, -124], to: [-196, 1.2, -114], en: 'VRM', kr: '전원부' },
  { at: [-100, 1.2, -134], from: [-100, 1.2, -128], to: [-100, 1.2, -118], en: 'CPU', kr: '프로세서' },
  { at: [-8, 1.2, -110], from: [-1, 1.2, -110], to: [19, 1.2, -110], en: 'MEM', kr: '메모리 ×3' },
  { at: [196, 1.2, -32], from: [189, 1.2, -32], to: [181, 1.2, -32], en: 'PCH', kr: '칩셋' },
  { at: [160, 1.2, 38], from: [160, 1.2, 44], to: [160, 1.2, 54], en: 'I/O', kr: '확장 카드' },
  { at: [-200, 1.2, 88], from: [-187, 1.2, 88], to: [-173, 1.2, 88], en: 'DISK', kr: '저장장치' }
];

// 다이 안쪽. 여기는 영문 약어만 적는다 — 블록이 좁아 한글을 덧붙이면
// 아래의 회로를 덮고, 이 이름들이 무엇의 줄임말인지는 도면이 답할 일이
// 아니다. 바깥의 여섯 부품만 한글을 함께 단다.
const CORE0 = coreRect(0, 0);
const DIE = [
  { at: [CX, DIE_Y, CZ], s: 'L3' },
  { at: [CX + 36.5, DIE_Y, CZ], s: 'IMC' },
  { at: [CX, DIE_Y, CZ + 36.5], s: 'PCIE' },
  { at: [CX, DIE_Y, CZ - 36.5], s: 'DMI' },
  { at: [(CORE0.x0 + CORE0.x1) / 2, DIE_Y, (CORE0.z0 + CORE0.z1) / 2], s: 'CORE' }
];

// 배선. 이름은 선 옆의 빈 자리에 둔다. 무엇과 무엇을 잇는지는 선이
// 이미 말하고 있으므로, 이름은 그 선이 무엇으로 불리는지만 말하면 된다.
const BUSES_NAMED = [
  { at: [-5, 1.2, -14], s: 'DDR' },
  { at: [-2, 1.2, 40], s: 'PCIE' },
  { at: [110, 1.2, -128], s: 'DMI' },
  { at: [60, 1.2, 142], s: 'SATA' }
];

function drawNames() {
  for (let i = 0; i < BUSES_NAMED.length; i++) {
    R.text3(BUSES_NAMED[i].at, BUSES_NAMED[i].s, 8, 0.45);
  }
  for (let i = 0; i < NAMES.length; i++) {
    const n = NAMES[i];
    R.line(n.from, n.to, 0.35, 1);
    R.text3(n.at, n.en, 10, 0.85, 0, -6);
    R.text3(n.at, n.kr, 8, 0.45, 0, 7);
  }
  // 다이가 화면에서 충분히 클 때만. 손으로 돌려 멀어지면 스스로 빠진다.
  if (screenSize('cpu') < 320) return;
  for (let i = 0; i < DIE.length; i++) {
    R.text3(DIE[i].at, DIE[i].s, 8.5, 0.55);
  }
}

// 리프레시. 3.9µs 마다 어느 뱅크 하나가 잠깐 쓸 수 없게 된다. 화면에서는
// 뱅크 하나가 잠시 흐려지는 것으로 충분하다. 글자는 얹지 않는다.
function drawRefresh(t) {
  for (let m = 0; m < 3; m++) {
    const phase = (t * 3.1 + m * 0.77) % 1;
    if (phase > 0.16) continue;
    const z = MZ - 110 + Math.floor(noise(m + 40, t, 3.1) * 4) * 32;
    const x = MX[m] - 4.4;
    R.line([x, 25, z - 12], [x, 43, z - 12], 0.45, 1.2);
    R.line([x, 25, z + 12], [x, 43, z + 12], 0.45, 1.2);
  }
}
