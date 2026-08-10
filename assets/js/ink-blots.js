/*
 * Ink Blots
 * 일정한 간격으로 종이 위에 잉크 방울이 떨어진다.
 * 떨어진 자리가 젖으면서 잉크가 섬유를 타고 빠르게 번지다 서서히 멎고,
 * 마르면서 옅어진다.
 */
(function () {
  'use strict';

  var INTERVAL = 7000; // 방울이 떨어지는 간격 (ms)
  var LIFETIME = 10000; // 떨어져서 완전히 지워지기까지 (ms)
  var SIZE = [70, 150]; // 다 번졌을 때의 지름 범위 (px, 데스크톱 기준)
  var SIZE_SM = [42, 88]; // 좁은 화면에서의 지름 범위
  var MAX_BLOTS = 24; // 안전장치

  var stage = document.getElementById('ink-blots');
  if (!stage) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var seq = 0;
  var blots = [];

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function drop() {
    if (document.hidden) return;

    var id = 'blot' + (seq++);
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    // 좁은 화면에서 데스크톱 크기 그대로 떨어지면 화면 절반을 덮는다.
    var range = vw < 768 ? SIZE_SM : SIZE;
    var size = rand(range[0], range[1]);

    // 여백도 화면 폭에 비례시킨다. 고정 60px 은 좁은 화면에서 과하다.
    var margin = Math.min(60, vw * 0.12, vh * 0.12);

    var top = window.scrollY || window.pageYOffset || 0;
    var x = rand(margin, vw - margin);
    var y = top + rand(margin, vh - margin);

    var el = document.createElement('div');
    el.className = 'ink-blot';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    // 애니메이션 길이의 단일 출처. CSS 는 키프레임(비율)만 갖는다.
    el.style.animationDuration = LIFETIME + 'ms';

    // feTurbulence 로 원의 윤곽을 밀어내면(feDisplacementMap) 매끈한 원이
    // 아니라 종이 섬유를 타고 제멋대로 번진 잉크 자국이 된다.
    // seed 를 방울마다 바꿔서 같은 모양이 두 번 나오지 않게 한다.
    el.innerHTML =
      '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
      '<filter id="' + id + '" x="-35%" y="-35%" width="170%" height="170%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.038" numOctaves="3"' +
      ' seed="' + Math.floor(rand(1, 9999)) + '" result="t"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="t" scale="26"' +
      ' xChannelSelector="R" yChannelSelector="G"/>' +
      '<feGaussianBlur stdDeviation="1.1"/>' +
      '</filter>' +
      '<circle cx="50" cy="50" r="26" filter="url(#' + id + ')"/>' +
      '</svg>';

    stage.appendChild(el);
    blots.push(el);
    while (blots.length > MAX_BLOTS) {
      var old = blots.shift();
      if (old.parentNode) old.parentNode.removeChild(old);
    }

    // 다 마르면 치운다.
    setTimeout(function () {
      var i = blots.indexOf(el);
      if (i !== -1) blots.splice(i, 1);
      if (el.parentNode) el.parentNode.removeChild(el);
    }, LIFETIME + 200);
  }

  setTimeout(function () {
    drop();
    setInterval(drop, INTERVAL);
  }, 2000);
})();
