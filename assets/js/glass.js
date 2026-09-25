/*
 * 유리와 렌즈
 *
 * 유리(.glass)는 이제 CSS 만으로 그린다: About 창처럼 뒤를 부드럽게 흐리고
 * 채도를 올린 반투명 판(_sass/mac/_glass.scss). 굴절을 계산하던 코드는 걷어냈다.
 *
 * 여기 남은 것은 렌즈 하나: 목록에서 고른 항목 뒤에 떠 있는 알약(글의 목차).
 * 다른 항목을 고르면 스프링으로 미끄러져 가고, 가는 동안 진행 방향으로
 * 늘어났다 돌아온다.
 */

// ── 렌즈 ────────────────────────────────────────────────────────

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/**
 * group  렌즈가 떠다닐 목록(ul/ol). position: relative 여야 한다.
 * 반환   { moveTo(item, { instant }), press(item), follow(clientX), release(), hide() }
 */
export function createLens(group) {
  const lens = document.createElement('li');
  lens.className = 'lens';
  lens.setAttribute('aria-hidden', 'true');
  lens.setAttribute('role', 'presentation');
  const body = document.createElement('span');
  body.className = 'lens__body';
  lens.append(body);
  group.prepend(lens);

  let current = null;
  let last = null;

  // 창이 열리거나 Dock 에서 돌아오는 동안(scale 애니메이션)에도 레이아웃 크기로 잰다.
  // getBoundingClientRect 는 조상의 변형까지 담으므로, 그 배율만큼 되돌린다.
  function place(item) {
    const g = group.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    const kx = g.width && group.offsetWidth ? g.width / group.offsetWidth : 1;
    const ky = g.height && group.offsetHeight ? g.height / group.offsetHeight : 1;
    return {
      x: (r.left - g.left) / kx + group.scrollLeft - group.clientLeft,
      y: (r.top - g.top) / ky + group.scrollTop - group.clientTop,
      w: r.width / kx,
      h: r.height / ky,
    };
  }

  function apply(p) {
    lens.style.setProperty('--lx', `${p.x}px`);
    lens.style.setProperty('--ly', `${p.y}px`);
    lens.style.setProperty('--lw', `${p.w}px`);
    lens.style.setProperty('--lh', `${p.h}px`);
  }

  // 움직이는 방향으로 늘어났다가, 도착하면서 반대로 한 번 눌렸다 돌아온다.
  function stretch(from, to) {
    if (reducedMotion.matches || !body.animate) return;
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    if (dx + dy < 2) return;
    const along = dy > dx ? 'Y' : 'X';
    const across = along === 'Y' ? 'X' : 'Y';
    const amt = Math.min(0.16, 0.05 + (dx + dy) / 1600);
    body.animate(
      [
        { transform: 'scale(1, 1)' },
        { transform: `scale${along}(${1 + amt}) scale${across}(${1 - amt * 0.6})`, offset: 0.3 },
        { transform: `scale${along}(${1 - amt * 0.35}) scale${across}(${1 + amt * 0.25})`, offset: 0.62 },
        { transform: 'scale(1, 1)' },
      ],
      { duration: 560, easing: 'cubic-bezier(.3,.7,.3,1)' },
    );
  }

  function moveTo(item, { instant = false } = {}) {
    lens.classList.remove('is-following');
    if (!item) return;
    const p = place(item);
    if (instant || !last) {
      lens.classList.add('is-instant');
      apply(p);
      lens.getBoundingClientRect(); // 전환 없이 자리를 먼저 잡는다
      lens.classList.remove('is-instant');
    } else {
      stretch(last, p);
      apply(p);
    }
    lens.classList.add('is-visible');
    current = item;
    last = p;
  }

  // 눌린 동안에는 유리가 손끝 쪽으로 살짝 떠오른다.
  function press(item) {
    if (item !== current) moveTo(item);
    lens.classList.add('is-pressed');
  }

  // 누른 채로 끄는 동안: 렌즈가 손끝을 곧바로 따라온다. 목록 밖으로는 나가지 않는다.
  // 렌즈 한가운데에 가장 가까운 항목을 돌려준다.
  function follow(clientX) {
    if (!last) return null;
    const g = group.getBoundingClientRect();
    const min = group.clientLeft;
    const max = group.clientWidth - last.w; // scrollWidth 는 렌즈가 밀려날수록 늘어난다
    const x = Math.max(min, Math.min(max, clientX - g.left + group.scrollLeft - last.w / 2));
    lens.classList.add('is-following');
    lens.style.setProperty('--lx', `${x}px`);
    last = { ...last, x };
    const mid = clientX;
    let best = null;
    let dist = Infinity;
    for (const el of group.querySelectorAll(':scope > li:not(.lens) > *')) {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < dist) {
        dist = d;
        best = el;
      }
    }
    return best;
  }

  function release() {
    lens.classList.remove('is-pressed');
  }

  function hide() {
    lens.classList.remove('is-visible');
    current = null;
    last = null;
  }

  // 글꼴이 늦게 들어오거나 창 폭이 바뀌면 항목의 크기가 달라진다.
  new ResizeObserver(() => {
    if (current) moveTo(current, { instant: true });
  }).observe(group);

  return { moveTo, press, follow, release, hide, el: lens, get current() { return current; } };
}
