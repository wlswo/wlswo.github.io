/*
 * Viewport-fit Pagination
 * 화면에 들어가는 만큼만 목록을 보여주고 나머지는 다음 쪽으로 넘긴다.
 *
 * 몇 개를 보여줄지는 빌드 시점에 정할 수 없다. 그때는 방문자의 화면
 * 높이를 모르기 때문이다. 그래서 글은 전부 내보내 두고, 여기서 실제
 * 높이를 재서 나눈다. 스크립트가 실행되지 않으면 전체가 그대로 보인다.
 */
(function () {
  'use strict';

  var MIN_PER_PAGE = 4; // 화면이 아무리 낮아도 이보다 적게는 안 보여준다
  var RESIZE_WAIT = 140; // 창 크기 조절이 멎을 때까지 기다리는 시간 (ms)

  var list = document.getElementById('post-list');
  var pager = document.getElementById('pagination');
  if (!list || !pager) return;

  var items = Array.prototype.slice.call(list.children);
  if (items.length === 0) return;

  var page = 0;
  var perPage = items.length;

  function px(el, prop) {
    return parseFloat(getComputedStyle(el)[prop]) || 0;
  }

  // 지금 보이는 항목 하나의 높이. 글자 크기가 clamp 라 창 폭에 따라
  // 달라지므로 상수로 두지 않고 매번 실제 값을 잰다.
  function rowHeight() {
    for (var i = 0; i < items.length; i++) {
      var h = items[i].getBoundingClientRect().height;
      if (h > 0) return h;
    }
    return 0;
  }

  // 목록이 시작되는 지점부터 화면 아래까지 남는 높이를 재고,
  // 거기서 목록의 안쪽 여백과 쪽 넘김이 차지할 자리를 빼둔다.
  function capacity(row) {
    if (!row) return items.length;

    var top = list.getBoundingClientRect().top + window.scrollY;
    var reserved =
      px(list, 'paddingTop') +
      px(list, 'paddingBottom') +
      px(list, 'borderTopWidth') +
      px(list, 'borderBottomWidth') +
      pager.getBoundingClientRect().height +
      px(pager, 'marginTop') +
      px(list.parentNode, 'paddingBottom');

    var avail = window.innerHeight - top - reserved;
    return Math.max(MIN_PER_PAGE, Math.floor(avail / row));
  }

  // 마지막 쪽처럼 항목이 덜 찬 경우에도 목록이 줄어들지 않게 높이를 못박는다.
  // 이게 없으면 쪽마다 아래 테두리와 쪽 번호가 위아래로 움직인다.
  function lockHeight(row) {
    if (!row) return;

    var h = perPage * row;
    if (getComputedStyle(list).boxSizing === 'border-box') {
      h +=
        px(list, 'paddingTop') +
        px(list, 'paddingBottom') +
        px(list, 'borderTopWidth') +
        px(list, 'borderBottomWidth');
    }
    list.style.minHeight = h + 'px';
  }

  function totalPages() {
    return Math.max(1, Math.ceil(items.length / perPage));
  }

  function show() {
    var from = page * perPage;
    var to = from + perPage;
    for (var i = 0; i < items.length; i++) {
      items[i].hidden = i < from || i >= to;
    }
  }

  function cell(tag, text) {
    var n = document.createElement(tag);
    n.textContent = text;
    return n;
  }

  function link(text, target, label) {
    var a = document.createElement('a');
    a.href = '#';
    a.textContent = text;
    a.setAttribute('aria-label', label || text);
    a.addEventListener('click', function (e) {
      e.preventDefault();
      go(target);
    });
    return a;
  }

  // 쪽 번호는 처음·끝과 현재 주변만 남기고 가운데를 … 로 접는다.
  function pageNumbers(total) {
    if (total <= 7) {
      var all = [];
      for (var i = 0; i < total; i++) all.push(i);
      return all;
    }

    var out = [0];
    var from = Math.max(1, page - 1);
    var to = Math.min(total - 2, page + 1);
    if (from > 1) out.push(-1);
    for (var j = from; j <= to; j++) out.push(j);
    if (to < total - 2) out.push(-1);
    out.push(total - 1);
    return out;
  }

  function renderPager() {
    var total = totalPages();
    pager.textContent = '';

    // 한 쪽에 다 들어가면 쪽 넘김 자체가 필요 없다.
    if (total <= 1) {
      pager.hidden = true;
      return;
    }
    pager.hidden = false;

    pager.appendChild(
      page > 0 ? link('<', page - 1, '이전 쪽') : cell('span', '<')
    );

    pageNumbers(total).forEach(function (n) {
      if (n === -1) {
        pager.appendChild(cell('span', '…'));
        return;
      }
      if (n === page) {
        var cur = cell('span', String(n + 1));
        cur.className = 'current';
        cur.setAttribute('aria-current', 'page');
        pager.appendChild(cur);
      } else {
        pager.appendChild(link(String(n + 1), n, n + 1 + '쪽'));
      }
    });

    pager.appendChild(
      page < total - 1 ? link('>', page + 1, '다음 쪽') : cell('span', '>')
    );
  }

  function go(next) {
    page = Math.min(Math.max(next, 0), totalPages() - 1);
    show();
    renderPager();

    // 클래스를 떼었다 다시 붙이는 것만으로는 애니메이션이 재생되지 않는다.
    // 사이에 리플로우를 한 번 일으켜 브라우저가 상태 변화를 인식하게 한다.
    list.classList.remove('is-turning');
    void list.offsetWidth;
    list.classList.add('is-turning');

    // 쪽을 넘겨도 화면은 항상 맨 위에서 시작한다.
    window.scrollTo(0, 0);
  }

  function layout() {
    // 지금 보고 있는 첫 항목을 기억해 두었다가, 개수가 바뀌어도
    // 같은 자리 근처를 계속 보여준다.
    var anchor = page * perPage;

    // 재는 동안에는 전부 펼치고 고정 높이도 풀어 둔다.
    // 접힌 상태나 고정된 높이로는 실제 크기를 알 수 없다.
    for (var i = 0; i < items.length; i++) items[i].hidden = false;
    pager.hidden = false;
    list.style.minHeight = '';

    var row = rowHeight();
    perPage = capacity(row);
    page = Math.min(Math.floor(anchor / perPage), totalPages() - 1);

    lockHeight(row);
    show();
    renderPager();
  }

  layout();

  var timer = null;
  window.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(layout, RESIZE_WAIT);
  });

  // 웹폰트가 늦게 도착하면 글줄 높이가 달라진다. 폰트가 자리를 잡은
  // 뒤 한 번 더 잰다.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(layout);
  }
})();
