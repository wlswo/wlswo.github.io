// 장면들이 함께 쓰는 것들.
//
// drawMachine() 하나가 기계 전체를 그린다. 장면은 부품마다 '얼마나 살아
// 있는지'만 말하면 된다. 0 이면 유령(채움 없는 윤곽선), 1 이면 온전한 부품.
// 전원이 오르는 연출도, 한 부품만 남기고 나머지를 물리는 연출도 전부
// 이 숫자 하나로 만든다.

import * as R from '../core/raster.js';
import { LAYER } from '../core/raster.js';
import * as Cam from '../core/camera.js';
import {
  PARTS, BOX, boardFaces, cpuFaces, memAll, diskFaces, ioFaces, pchFaces,
  vrmFaces, armFaces, ARM_REST, MX
} from '../geom/parts.js';
import {
  boardDetail, drawWires, drawSignals, cpuDetail, memDetail,
  diskDetail, ioDetail, pchDetail, vrmDetail
} from '../geom/detail.js';

// 부품이 화면 안에 있는지, 얼마나 크게 보이는지. 밀어 들어간 장에서는
// 보드의 절반 이상이 화면 밖이고, 여기서 두세 배가 나온다.
const seen = {};
const sizes = {};

export function survey() {
  for (let i = 0; i < PARTS.length; i++) {
    const p = PARTS[i];
    seen[p.id] = Cam.boxOnScreen(p.box);
    sizes[p.id] = seen[p.id] ? Cam.boxScreenSize(p.box) : 0;
  }
  seen.board = Cam.boxOnScreen(BOX.board);
  sizes.board = seen.board ? Cam.boxScreenSize(BOX.board) : 0;
}

export function onScreen(id) { return !!seen[id]; }
export function screenSize(id) { return sizes[id] || 0; }

const ONE = { board: 1, vrm: 1, cpu: 1, mem: 1, pch: 1, io: 1, disk: 1 };

function amp(o, id) {
  if (o.power === undefined) return 1;
  const v = o.power[id];
  return v === undefined ? 0 : v;
}

// 세부 회로를 그릴 만큼 크고, 초점 안에 있는가.
// 투영 대각선이 90px 아래면 어차피 읽히지 않는다.
function wantsDetail(o, id, a) {
  if (a <= 0.02) return false;
  if (!seen[id]) return false;
  if (o.focus && o.focus.indexOf(id) < 0) return false;
  if (sizes[id] < 90) return false;
  if (o.quality === 0 && o.focus && o.focus.indexOf(id) < 0) return false;
  return true;
}

// 기계 한 판.
//
//   o.power    부품별 0..1. 없으면 전부 1
//   o.focus    id 배열. 주면 그 부품만 회로를 그린다
//   o.hideBoard  보드를 아예 빼고 부품만 (도면이 되는 장에서)
//   o.spin     디스크 회전 각도 (라디안). 주지 않으면 시간에서 만든다
//   o.arm      헤드 암 각도
//   o.wires / o.signals   0..1
//   o.wireReveal(name, i) -> 0..1
//   o.quality  0..2
export function drawMachine(t, opts) {
  const o = opts || {};
  const q = o.quality === undefined ? 2 : o.quality;
  survey();

  // 초점이 정해진 장에서는 나머지가 물러난다. 어두운 바탕에서 물러난다는
  // 것은 어두워진다는 뜻이다. 이것이 없으면 도면이 되는 장마다 보드의
  // 커다란 면이 화면에서 가장 밝은 것이 되어, 정작 이야기하는 부품을
  // 눌러 버린다.
  const focused = o.focus && o.focus.length ? o.focus : null;
  const back = o.recede === undefined ? 0.34 : o.recede;
  const dimOf = (id) => (focused && focused.indexOf(id) < 0 ? back : 1);

  // ── 보드 ──
  // 보드가 맨 아래, 그 표면의 격자와 배선이 그 위, 부품이 그 위.
  R.setLayer(LAYER.BOARD);
  if (!o.hideBoard) {
    const a = amp(o, 'board');
    // 장면이 보드를 초점에 넣었다면 흐리지 않는다.
    const bd = focused && focused.indexOf('board') < 0 ? back : 1;
    if (seen.board) {
      if (a > 0.02) R.solid(boardFaces, 0.28 * a * bd, bd);
      else R.ghost(boardFaces, 0.08);
      if (a > 0.02) {
        R.setLayer(LAYER.TRACE);
        boardDetail(a * bd, { coarse: q < 2, grid: o.boardGrid });
      }
    }
  }

  // ── 부품 ──
  R.setLayer(LAYER.PART);
  const spin = o.spin === undefined ? t * 1.9 : o.spin;
  const armA = o.arm === undefined ? ARM_REST + Math.sin(t * 0.55) * 0.2 : o.arm;

  drawPart(o, 'vrm', vrmFaces, () => vrmDetail(t, amp(o, 'vrm')), dimOf('vrm'));
  drawPart(o, 'cpu', cpuFaces, () => cpuDetail(t, amp(o, 'cpu'), o.cpu), dimOf('cpu'));

  for (let i = 0; i < 3; i++) {
    const id = 'mem' + i;
    const a = amp(o, 'mem');
    if (!seen[id]) continue;
    const md = focused ? (focused.indexOf(id) >= 0 || focused.indexOf('mem') >= 0 ? 1 : back) : 1;
    if (a > 0.02) R.solid(memAll[i], 0.28 * a * md, md);
    else { R.ghost(memAll[i], 0.08); continue; }
    if (wantsDetail(o, id, a) || (o.focus && o.focus.indexOf('mem') >= 0 && sizes[id] >= 90)) {
      memDetail(MX[i], t, a, o.mem && o.mem[i]);
    }
  }

  drawPart(o, 'pch', pchFaces, () => pchDetail(t, amp(o, 'pch'), o.pch), dimOf('pch'));
  drawPart(o, 'io', ioFaces, () => ioDetail(t, amp(o, 'io')), dimOf('io'));

  const da = amp(o, 'disk');
  const dd = dimOf('disk');
  if (seen.disk) {
    if (da > 0.02) {
      R.solid(diskFaces, 0.28 * da * dd, dd);
      R.solid(armFaces(armA), 0.28 * da * dd, dd);
      if (wantsDetail(o, 'disk', da)) {
        diskDetail(t, da, { spin, servo: q === 2 ? 60 : q === 1 ? 30 : 15 });
      }
    } else {
      R.ghost(diskFaces, 0.08);
    }
  }

  // ── 배선과 신호 ──
  // 배선은 보드 표면에 있다. 그 위에 선 부품이 배선을 가려야 한다.
  R.setLayer(LAYER.TRACE);
  const wa = o.wires === undefined ? amp(o, 'board') : o.wires;
  if (wa > 0.02) drawWires(wa, o.wireReveal);
  const sa = o.signals === undefined ? 0 : o.signals;
  if (sa > 0.02) drawSignals(t, sa, { only: o.busOnly, labels: o.busLabels, speed: o.busSpeed });
  R.setLayer(LAYER.PART);
}

function drawPart(o, id, faces, detail, dim) {
  const a = amp(o, id);
  const d = dim === undefined ? 1 : dim;
  if (!seen[id]) return;
  if (a > 0.02) {
    R.solid(faces, 0.28 * a * d, d);
    if (wantsDetail(o, id, a)) detail();
  } else {
    R.ghost(faces, 0.08);
  }
}

export const ALL_ON = ONE;

// 전부 유령.
export const ALL_OFF = { board: 0, vrm: 0, cpu: 0, mem: 0, pch: 0, io: 0, disk: 0 };

export function power(over) {
  const p = { board: 0, vrm: 0, cpu: 0, mem: 0, pch: 0, io: 0, disk: 0 };
  if (over) for (const k in over) p[k] = over[k];
  return p;
}

// ── 상자 섞기 ─────────────────────────────────────────────────
// 카메라가 한 대상에서 다른 대상으로 옮겨갈 때. 상자를 섞으면 위치와 배율이
// 함께 따라오므로, 채널을 따로 맞출 필요가 없다.
export function lerpBox(a, b, p) {
  const q = p < 0 ? 0 : p > 1 ? 1 : p;
  return {
    x0: a.x0 + (b.x0 - a.x0) * q, y0: a.y0 + (b.y0 - a.y0) * q, z0: a.z0 + (b.z0 - a.z0) * q,
    x1: a.x1 + (b.x1 - a.x1) * q, y1: a.y1 + (b.y1 - a.y1) * q, z1: a.z1 + (b.z1 - a.z1) * q
  };
}

// 첫 프레임이자 마지막 프레임. 이 값이 오늘의 화면과 같은 각도다.
export const HOME = { yaw: -0.62, pitch: 0.42, dolly: 620, focus: BOX.all, fill: 0.84 };
