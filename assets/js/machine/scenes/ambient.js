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
import { drawMachine } from './common.js';
import { BOX, MX, MZ, ARM_REST } from '../geom/parts.js';

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
      spin: t * 1.9,
      arm: ARM_REST + Math.sin(t * 0.47) * 0.22,
      cpu: {
        labels: false,
        // 여덟 코어가 한 박자로 깜빡이지 않는다. 코어마다 주파수가 다르고,
        // 서로 배수가 아닌 값을 골라 두어 무늬가 반복되지 않는다.
        busy: (i, j) => (Math.sin(t * (1.7 + (i * 4 + j) * 0.23) + (i * 4 + j) * 2.1) > 0.15 ? 1 : 0)
      },
      mem: [
        { activity: 0.5 + 0.5 * Math.sin(t * 2.7) },
        { activity: 0.5 + 0.5 * Math.sin(t * 3.3 + 1.1) },
        { activity: 0.5 + 0.5 * Math.sin(t * 2.2 + 2.4) }
      ]
    });

    drawRefresh(t);
  }
};

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
