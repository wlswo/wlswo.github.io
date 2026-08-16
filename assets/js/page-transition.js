/*
 * Page Transition
 * 페이지를 넘길 때 목록만 사라졌다가 새 목록이 차례로 올라온다.
 * (들어오는 쪽은 CSS 의 item-rise 가 맡는다. 여기서는 나가는 쪽만 다룬다.)
 *
 * 문서 간 View Transition 을 지원하는 브라우저에서는 CSS 의 @view-transition
 * 이 전환을 그리므로 여기서는 아무것도 하지 않는다. 두 전환이 겹치면
 * 목록이 두 번 사라진다.
 */
(function () {
  'use strict';

  var OUT_MS = 200; // CSS 의 list-out 길이와 맞출 것

  var list = document.getElementById('post-list');
  if (!list) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // @view-transition 을 해석할 수 있는 브라우저인지 본다. 같은 문서 안에서만
  // 쓰이는 document.startViewTransition 은 문서 간 전환 지원과 시점이 달라
  // 판단 근거로 쓰지 않는다.
  if (typeof window.CSSViewTransitionRule !== 'undefined') return;

  var pagination = document.querySelector('.pagination');
  if (!pagination) return;

  pagination.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('a[href]') : null;
    if (!link || !pagination.contains(link)) return;

    // 새 탭·다른 사이트로 여는 경우엔 개입하지 않는다.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (link.target === '_blank' || link.origin !== location.origin) return;

    e.preventDefault();
    list.classList.add('is-leaving');

    setTimeout(function () {
      location.href = link.href;
    }, OUT_MS);
  });

  // 뒤로 가기로 bfcache 에서 살아 돌아오면 사라지던 상태가 그대로 남아
  // 목록이 투명한 채 멈춘다. 그 상태를 되돌린다.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) list.classList.remove('is-leaving');
  });
})();
