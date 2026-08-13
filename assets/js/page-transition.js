/*
 * Page Transition
 * 페이지를 넘길 때 글 목록만 페이드 아웃 → 이동 → 페이드 인.
 * 헤더와 페이지네이션은 고정된 채로 남아서 목록만 갈아 끼워지는 느낌이 된다.
 *
 * JS 가 없거나 실패해도 링크는 평범한 <a> 로 동작한다. 페이드는 덤이다.
 */
(function () {
  'use strict';

  var OUT_MS = 220; // 이 시간이 지나면 이동한다 (CSS 의 fade-out 길이와 맞출 것)

  var list = document.getElementById('timeline');
  if (!list) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  list.classList.add('is-entering');

  var pagination = document.querySelector('.pagination');
  if (!pagination) return;

  pagination.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('a[href]') : null;
    if (!link || !pagination.contains(link)) return;

    // 새 탭·다른 사이트로 여는 경우엔 개입하지 않는다.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (link.target === '_blank' || link.origin !== location.origin) return;

    e.preventDefault();
    list.classList.remove('is-entering');
    list.classList.add('is-leaving');

    setTimeout(function () {
      location.href = link.href;
    }, OUT_MS);
  });

  // 뒤로 가기로 bfcache 에서 살아 돌아오면 사라지던 상태가 그대로 남아
  // 목록이 투명한 채 멈춘다. 그 상태를 되돌린다.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    list.classList.remove('is-leaving');
    list.classList.add('is-entering');
  });
})();
