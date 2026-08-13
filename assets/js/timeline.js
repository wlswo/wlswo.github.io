/*
 * Collapsible Timeline
 * 항목의 화살표를 누르면 본문이 열리고 닫힌다.
 * 원본: https://codepen.io/jkantner/pen/NWoVGXx
 *
 * height:auto 로는 트랜지션이 걸리지 않으므로, 열 때마다 내용의 실제 높이를
 * 재서 0 ↔ 그 높이로 애니메이션한다. 내용이 바뀌어도 높이를 다시 재기 때문에
 * 고정값을 박아두는 방식보다 안전하다.
 *
 * 펼친 상태는 sessionStorage 에 저장한다. 글을 읽고 뒤로 오면 펼쳐두었던
 * 항목이 그대로 열려 있다. 단 목록 페이지를 넘기면(1 → 2쪽) 초기화된다.
 * 탭을 닫으면 함께 사라진다.
 */
(function () {
  'use strict';

  var EXPANDED = 'timeline__item-body--expanded';
  var DURATION = 300;
  var EASING = 'cubic-bezier(0.65,0,0.35,1)';
  var STORE_KEY = 'timeline:expanded';
  var STORE_MAX = 100; // 저장 항목 상한

  var root = document.getElementById('timeline');
  if (!root) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 어느 목록 페이지에서 펼친 상태인지 함께 저장한다. 저장된 경로와 지금
  // 경로가 다르면 페이지를 넘긴 것이므로 상태를 버린다. 글을 읽고 뒤로
  // 돌아온 경우에는 경로가 같으므로 그대로 복원된다.
  //
  // sessionStorage 는 사파리 프라이빗 모드 등에서 쓰기가 막힐 수 있다.
  // 저장이 안 되더라도 여닫기 자체는 계속 동작해야 한다.
  function load() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      if (!data || data.path !== location.pathname) return [];
      return data.keys || [];
    } catch (e) {
      return [];
    }
  }

  function save(keys) {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({
        path: location.pathname,
        keys: keys.slice(-STORE_MAX)
      }));
    } catch (e) {
      /* 저장 실패는 무시 */
    }
  }

  function remember(key, isExpanded) {
    if (!key) return;
    var keys = load().filter(function (k) { return k !== key; });
    if (isExpanded) keys.push(key);
    save(keys);
  }

  function bodyOf(button) {
    return document.getElementById('item' + button.getAttribute('data-item') + '-ctrld');
  }

  function setState(button, body, expanded) {
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    body.setAttribute('aria-hidden', expanded ? 'false' : 'true');
    body.classList.toggle(EXPANDED, expanded);
  }

  function toggle(button, body, shouldCollapse) {
    var height = body.firstElementChild ? body.firstElementChild.offsetHeight : 0;

    setState(button, body, !shouldCollapse);
    remember(button.getAttribute('data-key'), !shouldCollapse);

    if (reduceMotion || typeof body.animate !== 'function') return;

    if (shouldCollapse) {
      // 닫을 때는 내용이 먼저 사라지고(CSS 트랜지션) 그다음 높이가 줄어든다.
      // 그래서 높이를 유지하는 구간을 앞에 두고 두 배 길이로 재생한다.
      body.animate(
        [{ height: height + 'px' }, { height: height + 'px' }, { height: '0px' }],
        { duration: DURATION * 2, easing: EASING }
      );
    } else {
      body.animate(
        [{ height: '0px' }, { height: height + 'px' }],
        { duration: DURATION, easing: EASING }
      );
    }
  }

  // 저장된 항목을 애니메이션 없이 즉시 펼친다. 트랜지션이 살아 있으면
  // 페이지에 들어오자마자 요약이 스르륵 나타나 되돌아온 느낌을 해친다.
  function restore() {
    var keys = load();
    if (!keys.length) return;

    root.classList.add('timeline--restoring');

    var buttons = root.querySelectorAll('.timeline__arrow');
    for (var i = 0; i < buttons.length; i++) {
      var key = buttons[i].getAttribute('data-key');
      if (keys.indexOf(key) === -1) continue;
      var body = bodyOf(buttons[i]);
      if (body) setState(buttons[i], body, true);
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        root.classList.remove('timeline--restoring');
      });
    });
  }

  // 전체 열기 / 전체 닫기. 이미 원하는 상태인 항목은 건드리지 않는다.
  function toggleAll(shouldCollapse) {
    var want = shouldCollapse ? 'true' : 'false';
    var buttons = root.querySelectorAll('.timeline__arrow[aria-expanded="' + want + '"]');

    for (var i = 0; i < buttons.length; i++) {
      var body = bodyOf(buttons[i]);
      if (body) toggle(buttons[i], body, shouldCollapse);
    }
  }

  root.addEventListener('click', function (e) {
    if (!e.target.closest) return;

    var control = e.target.closest('[data-action]');
    if (control && root.contains(control)) {
      toggleAll(control.getAttribute('data-action') === 'collapse');
      return;
    }

    // 아이콘은 pointer-events:none 이라 target 은 항상 버튼이다.
    var button = e.target.closest('.timeline__arrow');
    if (!button || !root.contains(button)) return;

    var body = bodyOf(button);
    if (!body) return;

    toggle(button, body, button.getAttribute('aria-expanded') === 'true');
  });

  restore();

  // 뒤로 가기로 bfcache 에서 복원되면 DOM 이 이미 그대로다. 그래도 다른
  // 탭에서 상태가 바뀌었을 수 있으니 한 번 더 맞춘다(같은 상태면 무해).
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) restore();
  });
})();
