// 01 · RAILS UP — 전원이 오른다
//
// 보드 위에서 아무것도 스위칭하지 않는다, 전원이 유효해지기 전까지는.
// 그래서 이 장의 순서는 연출이 아니라 물리다. 12V 가 들어오고, 다섯 상이
// 72도씩 어긋나 점화하고, 전원면이 퍼져 나가고, 닿는 부품마다 유령에서
// 실선으로 승격한다. PWR_OK 가 찍힌 다음에야 다이가 켜진다.
//
// 화면의 문법도 여기서 정해진다. 온전한 선은 살아 있는 것, 옅은 윤곽선은
// 아직 아닌 것.

import * as R from '../core/raster.js';
import { span, mix, pulse } from '../core/timeline.js';
import { out3, inOut3, out2 } from '../core/ease.js';
import { smoothNoise } from '../core/hash.js';
import { drawMachine, power, lerpBox, HOME } from './common.js';
import { BOX, vrmPhaseZ, VRM_PHASES, CX, CZ, MX, PX, DX } from '../geom/parts.js';
import { ring } from '../geom/detail.js';

const DUR = 12;

// 전원면이 퍼져 나가는 앞머리의 x 좌표. VRM(-196)에서 오른쪽으로 간다.
function floodX(t) {
  const p = span(t, 4.0, 8.2);
  return mix(-210, 250, out2(p));
}

// 부품이 켜지는 정도. 앞머리가 지나가면 0.35초에 걸쳐 실선이 된다.
function lit(t, x) {
  const f = floodX(t);
  return span(f, x, x + 26);
}

export default {
  id: 's01',
  no: '01',
  title: 'RAILS UP',
  kr: '전원이 오른다',
  line: '무엇도 제 전원이 유효해지기 전에는 스위칭하지 않는다.',
  nums: ['+12V → Vcore 0.7–1.4 V', '5상 · 72° 간격', '한 다이에 최대 150 A', '상당 스위칭 300 kHz – 1 MHz'],
  dur: DUR,
  keyT: 8.8,

  camAt(t) {
    // 스치듯 낮은 각도로 전원부에 붙었다가, 전원면이 퍼지기 시작하면
    // 물러서서 보드 전체를 담는다.
    const vrmBox = { x0: -215, y0: -6, z0: -120, x1: -120, y1: 28, z1: 20 };
    const p = span(t, 3.4, 7.4);
    const e = inOut3(p);
    return {
      focus: lerpBox(vrmBox, BOX.all, e),
      yaw: mix(-0.95, HOME.yaw, e),
      pitch: mix(0.13, HOME.pitch, e),
      dolly: mix(300, HOME.dolly, e),
      fill: mix(0.80, 0.84, e)
    };
  },

  render(t, env) {
    const q = env.quality;

    const boardA = span(t, 1.0, 2.2);
    const p = power({
      board: boardA * 0.9,
      vrm: span(t, 1.3, 2.0),
      cpu: lit(t, CX) * (t > 8.4 ? 1 : 0.55),   // 다이는 PWR_OK 전까지 반만
      mem: lit(t, MX[0]),
      pch: lit(t, PX),
      io: lit(t, 115),
      disk: lit(t, DX + 40)
    });

    drawMachine(t, {
      power: p,
      quality: q,
      focus: ['vrm', 'cpu'],
      wires: boardA * 0.8,
      wireReveal: () => span(t, 5.0, 7.6),
      signals: span(t, 9.6, 11.2) * 0.9,
      cpu: { labels: t > 9.0 }
    });

    drawRail(t);
    drawPhases(t);
    drawFlood(t);
    drawWave(t, env);
    drawPwrOk(t);
  }
};

// +12V 가 보드 가장자리에서 전원부로 들어온다. 이 장에서 처음으로
// 온전한 굵기를 갖는 선.
function drawRail(t) {
  const r = span(t, 1.15, 2.0);
  if (r <= 0) return;
  R.glowLine([-215, 0.7, -50], [-196, 0.7, -50], 0.85, 1.6, r);
  for (let i = 0; i < VRM_PHASES; i++) {
    const z = vrmPhaseZ(i);
    const rr = span(t, 1.5 + i * 0.08, 2.2 + i * 0.08);
    if (rr > 0) R.line([-196, 0.7, -50], [-196, 0.7, z], 0.55, 1.2, rr);
  }
  if (t > 1.9) R.text3([-206, 3, -50], '+12V', 8, 0.7, 0, -9);
}

// 다섯 상이 72도씩 어긋나 점화한다. 리플이 서로 상쇄되라고 그렇게 둔 것이므로,
// 순서대로 도는 것이 이 부품의 전부다.
function drawPhases(t) {
  const on = span(t, 1.9, 3.6);
  if (on <= 0) return;
  const spin = (t - 1.9) * 2.4;
  for (let i = 0; i < VRM_PHASES; i++) {
    const z = vrmPhaseZ(i);
    const born = span(t, 1.9 + i * 0.26, 2.3 + i * 0.26);
    if (born <= 0) continue;
    // 72도 간격으로 도는 채움
    const phase = (spin - i * (Math.PI * 2 / VRM_PHASES)) % (Math.PI * 2);
    const duty = phase > 0 && phase < 1.25 ? 1 : 0;
    ring(-196, z, 8, 18.4, 12, 0.35 * born);
    if (duty) {
      R.fillY(-204, z - 8, -188, z + 8, 18.5, 0.45 * born);
      R.glowLine([-196, 18.6, z], [-170, 18.6, z], 0.85 * born, 1.4);
    }
    R.text3([-196, 19, z], String(i + 1), 7, 0.35 * born, 0, 0);
  }
}

// 전원면. 앞머리에 밝은 선 하나를 세우고, 지나온 쪽은 아주 옅게 채운다.
function drawFlood(t) {
  const on = span(t, 3.9, 8.6);
  if (on <= 0 || t > 9.4) return;
  const x = floodX(t);
  if (x < -205 || x > 245) return;
  const fade = 1 - span(t, 8.0, 9.4);
  R.fillY(-200, -140, Math.min(x, 200), 140, 0.42, 0.05 * fade);
  if (x > -200 && x < 200) {
    R.glowLine([x, 0.5, -140], [x, 0.5, 140], 0.7 * fade, 1.4);
  }
}

// 파형. 한 상만 켜졌을 때는 톱니가 크고, 상이 붙을수록 평평해진다.
// 인터리브가 왜 인터리브인지 한 화면으로 말하는 방법.
function drawWave(t, env) {
  const on = span(t, 2.1, 2.8) * (1 - span(t, 7.4, 8.4));
  if (on <= 0.02) return;
  // 글자가 앉은 자리를 피해서 놓는다. 캔버스는 제 위의 DOM 을 모르므로
  // 안전한 자리를 물어봐야 한다.
  const sa = R.safeArea();
  const w = Math.min(190, (sa.x1 - sa.x0) * 0.3);
  const h = 34;
  const x = sa.x0;
  const y = sa.y1 - h - 16;

  const phases = Math.min(VRM_PHASES, Math.floor(span(t, 1.9, 3.6) * VRM_PHASES) + 1);
  R.rectS(x, y, w, h, 0.16 * on, 1);
  R.textS(x, y - 9, 'VCORE RIPPLE', 8, 0.35 * on, 'left');
  R.textS(x + w, y - 9, phases + ' / 5 PH', 8, 0.35 * on, 'right');

  let prev = null;
  const N = 56;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    // 상이 늘수록 리플의 진폭이 1/n 로 줄고 주파수가 n 배가 된다.
    let v = 0;
    for (let k = 0; k < phases; k++) {
      v += Math.abs(((u * 3 + t * 0.55 + k / phases) % (1 / phases)) * phases - 0.5);
    }
    v = (v / phases) * (1.1 / phases) + 0.5;
    v += (smoothNoise(11, t + u, 9) - 0.5) * 0.03;
    const px = x + u * w, py = y + h - v * h;
    if (prev) R.lineS(prev[0], prev[1], px, py, 0.55 * on, 1);
    prev = [px, py];
  }
}

// PWR_OK. 이 글자가 찍히기 전에는 다이가 켜지지 않는다.
function drawPwrOk(t) {
  const a = span(t, 8.4, 8.7);
  if (a <= 0) return;
  const fade = 1 - span(t, 10.6, 11.6) * 0.55;
  R.text3([CX, 26, CZ], 'PWR_OK', 11, 0.9 * a * fade, 0, -34);
  const r = span(t, 8.5, 9.3);
  if (r > 0) {
    R.glowLine([CX - 40, 21.4, CZ - 40], [CX + 40, 21.4, CZ - 40], 0.85 * fade, 1.4, r);
    R.glowLine([CX + 40, 21.4, CZ - 40], [CX + 40, 21.4, CZ + 40], 0.85 * fade, 1.4, r);
    R.glowLine([CX + 40, 21.4, CZ + 40], [CX - 40, 21.4, CZ + 40], 0.85 * fade, 1.4, r);
    R.glowLine([CX - 40, 21.4, CZ + 40], [CX - 40, 21.4, CZ - 40], 0.85 * fade, 1.4, r);
  }
  const rst = pulse(t, 8.9, 0.25, 0.9);
  if (rst > 0) R.text3([CX, 26, CZ], 'RESET# ↑', 8, 0.7 * rst, 0, -20);
}
