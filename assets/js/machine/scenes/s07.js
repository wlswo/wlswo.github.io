// 07 · THE DISTANCE MAP — 거리가 곧 시간
//
// 이 영화의 중심. 실행 중인 코어를 중심으로 보드 평면에 동심원을 긋고,
// 반지름을 지연시간의 로그로 잡는다.
//
// 정직하게 말할 수 있는 것만 말한다. 다이 안쪽 배치는 지연시간 순이 아니다 —
// L3 는 코어 두 열 사이에 있어서 어떤 코어에게는 옆 코어보다 가깝다. 그래서
// '반지름이 그 층의 부품 위에 떨어진다'는 주장은 보드 스케일에서만 한다.
// DRAM 의 원이 DIMM 위에 정확히 앉는 것, 그리고 디스크의 원이 화면을
// 벗어나 돌아오지 않는 것. 그 둘이 이 장의 논거 전부다.
//
// 그리고 눈금을 사람의 시간으로 바꾼다. 1클럭을 1초로 두면 L1 은 4초,
// DRAM 은 4분, 디스크는 1.4년이다.

import * as R from '../core/raster.js';
import { span, mix } from '../core/timeline.js';
import { out3, inOut3, out2 } from '../core/ease.js';
import { drawMachine, power, lerpBox, HOME } from './common.js';
import { BOX, CX, CZ, coreRect, MX, MZ, DX, DZ } from '../geom/parts.js';

const DUR = 15;

// 4.5 GHz 를 한 번만 못박아 두고, 화면의 모든 환산을 여기서 낸다.
// 그래야 관객이 검산할 수 있다.
export const GHZ = 4.5;
const NS_PER_CYCLE = 1 / GHZ;         // 0.2222 ns

const LEVELS = [
  { key: 'L1', cyc: 4, size: '32 KiB' },
  { key: 'L2', cyc: 14, size: '1 MiB' },
  { key: 'L3', cyc: 45, size: '32 MiB' },
  { key: 'DRAM', cyc: 250, size: '64 GiB' },
  { key: 'SSD', cyc: 225000, size: '' },
  { key: 'DISK', cyc: 45000000, size: '' }
];

// 실행 중인 코어. 08장이 여기서 출발한다.
const c0 = coreRect(0, 1);
export const CORE_PT = [(c0.x0 + c0.x1) / 2, 0.5, (c0.z0 + c0.z1) / 2];

// DRAM 의 원이 DIMM 위에 앉도록 배율을 잡는다. 그 하나만 맞추면 나머지는
// 로그가 알아서 정한다.
const DIMM_DIST = Math.hypot(MX[0] - CORE_PT[0], MZ - CORE_PT[2]);
const A = DIMM_DIST / Math.log(1 + 250);

export function radiusOf(cyc) { return A * Math.log(1 + cyc); }

function human(cyc) {
  const s = cyc;                        // 1클럭 = 1초
  if (s < 60) return s + '초';
  if (s < 3600) return Math.round(s / 60) + '분 ' + (s % 60 ? (s % 60) + '초' : '');
  if (s < 86400) return (s / 3600).toFixed(1) + '시간';
  if (s < 86400 * 400) return (s / 86400).toFixed(1) + '일';
  return (s / (86400 * 365)).toFixed(1) + '년';
}

function ns(cyc) {
  const v = cyc * NS_PER_CYCLE;
  if (v < 1000) return v.toFixed(v < 10 ? 1 : 0) + ' ns';
  if (v < 1e6) return (v / 1000).toFixed(0) + ' µs';
  return (v / 1e6).toFixed(0) + ' ms';
}

export default {
  id: 's07',
  no: '07',
  title: 'THE DISTANCE MAP',
  kr: '거리가 곧 시간',
  line: '보드는 이미 지연시간 순으로 놓여 있다. 거리로 놓았기 때문이다.',
  nums: ['L1 4 · L2 14 · L3 45 클럭', 'DRAM 250 클럭 = 55 ns', 'DISK 45,000,000 클럭', '@ 4.5 GHz · 1클럭 = 222 ps'],
  dur: DUR,
  keyT: 10.4,

  camAt(t) {
    // 첫 프레임보다 더 멀리 물러선다. 기계가 화면 안에서 작아져야
    // 원이 기계보다 커질 수 있다.
    const wide = { x0: -430, y0: -10, z0: -330, x1: 430, y1: 40, z1: 330 };
    const p = inOut3(span(t, 0.2, 4.2));
    const p2 = inOut3(span(t, 10.6, 14.4));
    const box = lerpBox(lerpBox(BOX.all, wide, p), { x0: -720, y0: -10, z0: -560, x1: 720, y1: 40, z1: 560 }, p2);
    return {
      focus: box,
      yaw: mix(HOME.yaw, -0.30, p),
      pitch: mix(HOME.pitch, 0.92, p),
      // 정사영에 가까워질수록 원이 원으로 읽힌다. 이 장이 dolly 채널을
      // 가장 크게 쓰는 곳이다.
      dolly: mix(HOME.dolly, 2600, p),
      flatten: mix(0, 0.55, p),
      fill: 0.9
    };
  },

  render(t, env) {
    const q = env.quality;

    drawMachine(t, {
      power: { board: 1, vrm: 1, cpu: 1, mem: 1, pch: 1, io: 1, disk: 1 },
      quality: q,
      focus: t < 3.2 ? ['cpu'] : [],
      wires: mix(1, 0.35, span(t, 2.6, 4.4)),
      signals: (1 - span(t, 1.6, 3.0)) * 0.8,
      cpu: { labels: false, busy: (i, j) => (i === 0 && j === 1 ? 1 : 0) }
    });

    markCore(t);
    drawRings(t, env);
    drawRescale(t);
  }
};

// 어느 코어 이야기인지 먼저 못박는다.
function markCore(t) {
  const a = span(t, 0.6, 1.4);
  if (a <= 0) return;
  const r = c0;
  const y = 18.5;
  R.fillY(r.x0, r.z0, r.x1, r.z1, y, 0.22 * a);
  R.glowLine([r.x0, y, r.z0], [r.x1, y, r.z0], 0.85 * a, 1.2);
  R.glowLine([r.x1, y, r.z0], [r.x1, y, r.z1], 0.85 * a, 1.2);
  R.glowLine([r.x1, y, r.z1], [r.x0, y, r.z1], 0.85 * a, 1.2);
  R.glowLine([r.x0, y, r.z1], [r.x0, y, r.z0], 0.85 * a, 1.2);
}

function drawRings(t, env) {
  const y = 0.55;
  const seg = env.quality === 2 ? 96 : env.quality === 1 ? 64 : 40;
  const scaled = span(t, 10.8, 13.2);       // 사람의 시간으로 바꾸는 구간

  for (let i = 0; i < LEVELS.length; i++) {
    const lv = LEVELS[i];
    const born = span(t, 2.6 + i * 0.62, 3.5 + i * 0.62);
    if (born <= 0) continue;

    // 마지막 두 원은 사람의 시간으로 바꿀 때 더 크게 부풀어 화면을 나간다.
    const grow = i >= 4 ? mix(1, 1.5, out2(scaled)) : 1;
    const r = radiusOf(lv.cyc) * grow;

    const strong = lv.key === 'DRAM' || lv.key === 'DISK';
    const alpha = (strong ? 0.7 : 0.35) * born;

    // 원. 그리다 만 상태로 자라 들어온다.
    let prev = null;
    for (let k = 0; k <= seg; k++) {
      const u = k / seg;
      if (u > born) break;
      const ang = u * Math.PI * 2 - Math.PI / 2;
      const p = [CORE_PT[0] + Math.cos(ang) * r, y, CORE_PT[2] + Math.sin(ang) * r];
      if (prev) R.line(prev, p, alpha, strong ? 1.4 : 1);
      prev = p;
    }

    // 눈금표. 원 위쪽에 붙인다.
    if (born > 0.75) {
      const la = (born - 0.75) * 4;
      const lp = [CORE_PT[0], y, CORE_PT[2] - r];
      const label = scaled > 0.5
        ? lv.key + '  ' + human(lv.cyc)
        : lv.key + '  ' + lv.cyc.toLocaleString('en-US') + ' cyc · ' + ns(lv.cyc);
      R.text3(lp, label, 9, Math.min(1, la) * (strong ? 0.9 : 0.6), 0, -8);
      if (lv.size && scaled < 0.5) R.text3(lp, lv.size, 8, Math.min(1, la) * 0.4, 0, 5);
    }
  }

  // DRAM 의 원이 DIMM 위에 앉는다는 것을 한 번만 짚는다. 이 장에서 유일하게
  // '떨어진다'고 말할 수 있는 자리다.
  const hit = span(t, 6.6, 7.4) * (1 - span(t, 10.4, 11.2));
  if (hit > 0.02) {
    R.glowLine([MX[0] - 9, 60, MZ - 82], [MX[0] - 9, 60, MZ + 82], 0.85 * hit, 1.4);
    R.text3([MX[0], 62, MZ], '여기', 10, 0.85 * hit, 0, -14);
  }
}

// 1클럭을 1초로 늘린다. 표가 아니라 거리가 되는 순간.
function drawRescale(t) {
  const a = span(t, 10.6, 11.4) * (1 - span(t, 14.2, 15.0));
  if (a <= 0.02) return;
  const sa = R.safeArea();
  const x = (sa.x0 + sa.x1) / 2;
  const top = sa.y0;
  R.textS(x, top, '1 CYCLE = 1 SECOND', 12, 0.85 * a, 'center', 'middle', 500);
  R.lineS(x - 96, top + 12, x + 96, top + 12, 0.28 * a, 1);

  const rows = [
    ['L1', '4초'],
    ['L3', '45초'],
    ['DRAM', '4분 10초'],
    ['SSD', '2.6일'],
    ['DISK', '1.4년']
  ];
  for (let i = 0; i < rows.length; i++) {
    const rb = span(t, 11.3 + i * 0.26, 11.8 + i * 0.26);
    if (rb <= 0) continue;
    const y = top + 30 + i * 15;
    R.textS(x - 88, y, rows[i][0], 9, 0.45 * a * rb, 'left');
    R.textS(x + 88, y, rows[i][1], 10, 0.85 * a * rb, 'right');
  }
}
