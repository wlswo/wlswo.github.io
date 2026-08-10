/*
 * The Marauder's Map
 * 보이지 않는 누군가가 페이지를 돌아다니며 발자국을 남긴다.
 * 한 번 찍힌 자국은 지워지지 않고 종이에 그대로 남는다.
 */
(function () {
  'use strict';

  var STRIDE = 42; // 한 걸음 거리 (px)
  var STANCE = 10; // 좌우 발 간격 — 진행 방향의 수직으로 벌린다
  var STEP_INTERVAL = 840; // 한 걸음 사이 시간 (ms)
  var TURN = 0.28; // 걸음마다 방향이 틀어지는 최대 각도 (rad)
  var MARGIN = 44; // 화면 가장자리에서 이만큼 안쪽까지만 걷는다
  var START_ZONE = 0.28; // 시작점을 화면 중앙 44% 안에서 고른다 (모서리 회피)
  var MAX_PRINTS = 600; // 안전장치. 아주 오래 열어둬도 DOM 이 무한히 불어나지 않게.

  var stage = document.getElementById('marauder-tracks');
  if (!stage) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // 남자 구두 자국: 앞창(둥근 코 → 잘록한 허리)과 뒷굽이 떨어져 찍힌다.
  // 굽 달린 신발은 창 가운데(shank)가 바닥에 닿지 않아 자국이 둘로 나뉜다.
  // 기본 방향은 위(-Y).
  var FOOT =
    '<svg viewBox="0 0 24 40" xmlns="http://www.w3.org/2000/svg">' +
    // 앞창 — 코는 둥글고 허리로 갈수록 좁아진다
    '<path d="M12 1.6c4.3 0 7.1 2.8 7.4 7 .3 4.2-.5 7.6-1.3 10.6-.5 1.9-1 3.4-1.2 4.8-.2 1.2-1.9 1.8-4.9 1.8s-4.7-.6-4.9-1.8c-.2-1.4-.7-2.9-1.2-4.8C5.1 16.2 4.3 12.8 4.6 8.6 4.9 4.4 7.7 1.6 12 1.6z"/>' +
    // 뒷굽 — 앞창보다 작고 각진 사각에 가깝다
    '<path d="M8.5 30.4c0-.7.6-1.2 1.4-1.3 1.4-.2 3-.2 4.4 0 .8.1 1.4.6 1.4 1.3v5.1c0 1.4-1.4 2.4-3.6 2.4s-3.6-1-3.6-2.4z"/>' +
    '</svg>';

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  // 걸을 수 있는 범위 — 가로는 화면 폭, 세로는 지금 보고 있는 화면 안.
  // 좌표는 문서 기준이라 스크롤해도 발자국이 종이 위 제자리에 남는다.
  function bounds() {
    var top = window.scrollY || window.pageYOffset || 0;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    // 좁은 화면에서는 고정 44px 여백이 걸을 공간을 너무 잡아먹는다.
    var m = Math.min(MARGIN, vw * 0.1, vh * 0.1);
    return {
      minX: m,
      maxX: vw - m,
      minY: top + m,
      maxY: top + vh - m
    };
  }

  var prints = [];

  function stamp(x, y, angle, side) {
    var el = document.createElement('div');
    el.className = 'footprint';
    el.innerHTML = FOOT;

    // 진행 방향의 수직으로 좌우 발을 벌린다.
    var perp = angle + Math.PI / 2;
    el.style.left = (x + Math.cos(perp) * STANCE * side) + 'px';
    el.style.top = (y + Math.sin(perp) * STANCE * side) + 'px';

    // SVG 발끝이 위를 보므로 진행각에 90도를 더하고, 반대쪽 발은 좌우 반전.
    var deg = angle * 180 / Math.PI + 90;
    el.style.transform =
      'translate(-50%, -50%) rotate(' + deg + 'deg) scaleX(' + side + ')';

    stage.appendChild(el);
    prints.push(el);
    while (prints.length > MAX_PRINTS) {
      var old = prints.shift();
      if (old.parentNode) old.parentNode.removeChild(old);
    }
  }

  var walker = null;
  var timer = null;

  function newWalk() {
    var b = bounds();
    var w = b.maxX - b.minX;
    var h = b.maxY - b.minY;
    walker = {
      x: b.minX + rand(w * START_ZONE, w * (1 - START_ZONE)),
      y: b.minY + rand(h * START_ZONE, h * (1 - START_ZONE)),
      angle: rand(0, Math.PI * 2),
      side: Math.random() < 0.5 ? 1 : -1
    };
  }

  function tick() {
    // 탭이 백그라운드면 걷지 않는다. 돌아왔을 때 발자국이 한꺼번에 쏟아지는 걸 막는다.
    if (document.hidden) {
      timer = setTimeout(tick, 1000);
      return;
    }

    if (!walker) {
      newWalk();
      timer = setTimeout(tick, STEP_INTERVAL);
      return;
    }

    var b = bounds();

    // 스크롤해서 보이는 영역이 바뀌었으면 걷던 사람도 그리로 데려온다.
    walker.y = Math.min(Math.max(walker.y, b.minY), b.maxY);
    walker.x = Math.min(Math.max(walker.x, b.minX), b.maxX);

    walker.angle += rand(-TURN, TURN);
    var nx = walker.x + Math.cos(walker.angle) * STRIDE;
    var ny = walker.y + Math.sin(walker.angle) * STRIDE;

    // 벽에 닿으면 나가지 않고 튕겨 돌아선다. 좌우 벽은 수직축으로,
    // 위아래 벽은 수평축으로 각도를 반사시킨다.
    if (nx < b.minX || nx > b.maxX) {
      walker.angle = Math.PI - walker.angle;
      nx = walker.x + Math.cos(walker.angle) * STRIDE;
    }
    if (ny < b.minY || ny > b.maxY) {
      walker.angle = -walker.angle;
      ny = walker.y + Math.sin(walker.angle) * STRIDE;
    }

    walker.x = Math.min(Math.max(nx, b.minX), b.maxX);
    walker.y = Math.min(Math.max(ny, b.minY), b.maxY);

    stamp(walker.x, walker.y, walker.angle, walker.side);
    walker.side *= -1;

    // 쉬거나 순간이동하지 않는다. 한 사람이 계속 이어서 걷는다.
    timer = setTimeout(tick, STEP_INTERVAL);
  }

  timer = setTimeout(tick, 1200);
})();
