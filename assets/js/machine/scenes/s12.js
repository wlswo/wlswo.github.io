// 12 · STEADY STATE — 전부 한꺼번에
//
// 첫 프레임으로 돌아온다. 같은 각도, 같은 배율. 달라진 것은 그 사이에
// 본 것뿐이다.
//
// 앞의 열한 장에서 나온 모든 움직임이 각자의 속도로 함께 돈다. 지휘자는
// 없다 — 어느 것도 서로에게 맞추지 않는다. 그게 정상 동작의 정직한 그림이다.
//
// 그리고 라벨을 태어난 역순으로 지운다. 마지막에 붙인 것이 먼저 사라지고,
// 처음에 붙인 것이 마지막까지 남는다. 다 지우고 나면 기계만 남는다.
// 라벨은 우리를 위한 것이었다는 뜻이다.

import * as R from '../core/raster.js';
import { span, mix, pulse } from '../core/timeline.js';
import { out3, inOut3 } from '../core/ease.js';
import { staggerDelays, staggerAt } from '../core/stagger.js';
import { noise } from '../core/hash.js';
import { drawMachine, HOME } from './common.js';
import { BOX, CX, CZ, MX, MZ, DX, DZ, PX, PZ, IX, IZ, ARM_REST } from '../geom/parts.js';
import { GHZ } from './s07.js';

const DUR = 14;

// 한 프레임(16.7ms) 안에서 기계가 한 일. 전부 4.5 GHz 와 7200 rpm 에서
// 곧바로 나오는 숫자다.
const FACTS = [
  ['이 영화의 한 프레임', '16.7 ms'],
  ['클럭', '75,000,000 회'],
  ['플래터 회전', '2 바퀴'],
  ['DRAM 리프레시', '약 4,280 회'],
  ['전원부 스위칭', '약 16,700 회'],
  ['지휘자', '0']
];

// 라벨. birth 는 영화 전체에서 이것이 처음 등장한 순서다. 지울 때는
// 이 순서를 거꾸로 쓴다.
const LABELS = [
  { birth: 0, pos: [-196, 20, -50], s: 'VRM', dx: 0, dy: -14 },
  { birth: 1, pos: [CX, 22, CZ], s: 'CPU', dx: 0, dy: -18 },
  { birth: 2, pos: [MX[1], 60, MZ], s: 'MEM', dx: 0, dy: -12 },
  { birth: 3, pos: [PX, 16, PZ], s: 'PCH', dx: 0, dy: -12 },
  { birth: 4, pos: [IX, 20, IZ], s: 'I/O', dx: 0, dy: -12 },
  { birth: 5, pos: [DX, 24, DZ], s: 'DISK', dx: 0, dy: -14 }
];

const fadeDelays = staggerDelays(LABELS.length, 0.09, { from: 'last' });

export default {
  id: 's12',
  no: '12',
  title: 'STEADY STATE',
  kr: '전부 한꺼번에',
  line: '어느 것도 서로에게 맞추지 않는다. 그런데도 돌아간다.',
  nums: ['한 프레임 = 75,000,000 클럭', '플래터 2회전', 'DRAM 리프레시 4,280회', '지휘자 0'],
  dur: DUR,
  keyT: 6.0,

  camAt(t) {
    // 위에서 곧게 내려다본다. 이 장에서는 카메라가 전혀 움직이지 않는다.
    //
    // yaw 를 0 으로 두어야 보드의 네 변이 화면의 네 변과 나란해지고,
    // dolly 를 크게 올리고 flatten 을 섞어야 원근이 빠져 도면처럼 읽힌다.
    // 마지막에 남는 것은 움직이는 그림이 아니라 한 장의 평면도여야 한다.
    return {
      focus: BOX.all,
      yaw: 0,
      pitch: 1.46,
      dolly: 2600,
      flatten: 0.62,
      fill: 0.9
    };
  },

  render(t, env) {
    const q = env.quality;

    // 각 부품이 자기 속도로 돈다. 서로 배수가 아닌 값을 골랐다.
    drawMachine(t, {
      quality: q,
      focus: ['cpu', 'mem0', 'mem1', 'mem2', 'disk', 'pch', 'io', 'vrm'],
      wires: 1,
      signals: 0.95,
      spin: t * 1.9,
      arm: ARM_REST + Math.sin(t * 0.47) * 0.22,
      cpu: {
        labels: false,
        // 여덟 코어가 한 박자로 깜빡이지 않는다. 코어마다 주파수가 다르다.
        busy: (i, j) => (Math.sin(t * (1.7 + (i * 4 + j) * 0.23) + (i * 4 + j) * 2.1) > 0.15 ? 1 : 0)
      },
      mem: [
        { activity: 0.5 + 0.5 * Math.sin(t * 2.7) },
        { activity: 0.5 + 0.5 * Math.sin(t * 3.3 + 1.1) },
        { activity: 0.5 + 0.5 * Math.sin(t * 2.2 + 2.4) }
      ]
    });

    drawRefresh(t);
    drawLabels(t);
    drawFacts(t);
  }
};

// 리프레시. 3.9µs 마다 어느 뱅크 하나가 잠깐 쓸 수 없게 된다. 화면에서는
// 뱅크 하나가 잠시 흐려지는 것으로 충분하다.
function drawRefresh(t) {
  const on = (1 - span(t, 8.6, 9.8));
  if (on <= 0.02) return;
  for (let m = 0; m < 3; m++) {
    const phase = (t * 3.1 + m * 0.77) % 1;
    if (phase > 0.16) continue;
    const z = MZ - 110 + Math.floor(noise(m + 40, t, 3.1) * 4) * 32;
    const x = MX[m] - 4.4;
    R.line([x, 25, z - 12], [x, 43, z - 12], 0.45 * on, 1.2);
    R.line([x, 25, z + 12], [x, 43, z + 12], 0.45 * on, 1.2);
    R.text3([x, 46, z], 'REF', 7, 0.5 * on);
  }
}

// 라벨이 붙고, 그리고 역순으로 사라진다.
function drawLabels(t) {
  const inA = span(t, 0.6, 1.6);
  const outStart = 9.6;
  for (let i = 0; i < LABELS.length; i++) {
    const L = LABELS[i];
    const born = span(t, 0.6 + L.birth * 0.13, 1.4 + L.birth * 0.13);
    // 태어난 역순으로 지운다. 마지막에 붙은 것이 먼저 간다.
    const gone = staggerAt(fadeDelays, i, t - outStart, 0.55);
    const a = born * (1 - gone);
    if (a <= 0.02) continue;
    R.text3(L.pos, L.s, 10, 0.85 * a, L.dx, L.dy);
    R.line([L.pos[0], L.pos[1] - 2, L.pos[2]], [L.pos[0], L.pos[1] + 1, L.pos[2]], 0.3 * a);
  }
}

// 숫자. 한 줄씩 내려앉는다.
function drawFacts(t) {
  const a = span(t, 4.4, 5.2) * (1 - span(t, 9.0, 9.9));
  if (a <= 0.02) return;
  const sa = R.safeArea();
  const right = sa.x1;
  const top = sa.y0 + 18;

  R.lineS(right - 210, top - 16, right, top - 16, 0.28 * a, 1);
  for (let i = 0; i < FACTS.length; i++) {
    const rb = span(t, 4.7 + i * 0.34, 5.3 + i * 0.34);
    if (rb <= 0) continue;
    const y = top + i * 17;
    const slide = mix(8, 0, out3(rb));
    R.textS(right - 210, y + slide, FACTS[i][0], 9, 0.42 * a * rb, 'left');
    R.textS(right, y + slide, FACTS[i][1], 11, 0.9 * a * rb, 'right', 'middle', 500);
  }
}
