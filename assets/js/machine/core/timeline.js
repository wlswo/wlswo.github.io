// 타임라인과 키프레임 트랙.
//
// 이 파일 전체가 하나의 규칙 위에 서 있다.
//
//   seek(t) 는 멱등이다. 어디서도 value += delta 를 하지 않는다.
//
// 프레임을 시간의 순수 함수로 두면 스크럽·되감기·리사이즈·모션 감소 대응이
// 전부 공짜로 따라온다. 반대로 한 군데라도 상태를 누적하면, 그 한 군데 때문에
// 앞의 네 가지가 전부 무너진다.

import { resolveEase } from './ease.js';

// ── 위치 문법 ──────────────────────────────────────────────────
// anime 의 문법을 그대로 쓴다. GSAP 과 다르고, 그 차이가 중요하다.
//
//   undefined     타임라인 끝에 붙인다
//   0.8           절대 시각
//   '<'           앞 항목이 끝나는 시각
//   '<<'          앞 항목이 시작하는 시각
//   '<-=0.15'     앞 항목 끝에서 0.15초 당긴다 (겹침)
//   '+=0.2'       타임라인 끝에서 0.2초 뒤
//   'LABEL'       이름표
//   'LABEL+=0.1'  이름표에서 0.1초 뒤
function resolvePosition(pos, ctx) {
  if (pos === undefined || pos === null) return ctx.end;
  if (typeof pos === 'number') return pos;

  const s = String(pos).trim();
  const m = s.match(/^(<<|<|[A-Za-z_][\w-]*)?\s*(?:([+-])=\s*([\d.]+))?$/);
  if (!m) return ctx.end;

  let base;
  const anchor = m[1];
  if (anchor === '<') base = ctx.prevEnd;
  else if (anchor === '<<') base = ctx.prevStart;
  else if (anchor) base = ctx.labels[anchor] === undefined ? ctx.end : ctx.labels[anchor];
  else base = ctx.end;

  if (m[2]) {
    const d = parseFloat(m[3]) || 0;
    base += m[2] === '-' ? -d : d;
  }
  return base;
}

export function timeline() {
  const items = [];
  const labels = Object.create(null);
  let end = 0;
  let prevStart = 0;
  let prevEnd = 0;

  const tl = {
    items,
    labels,
    get duration() { return end; },

    // item: { dur, ease, render(p, localT, item) }
    // render 는 진행도 p(이징 적용 후)와 항목 안에서의 경과 시각을 받는다.
    add(item, pos) {
      const start = resolvePosition(pos, { end, prevStart, prevEnd, labels });
      const dur = item.dur === undefined ? 0 : item.dur;
      const rec = {
        start,
        dur,
        ease: resolveEase(item.ease),
        render: item.render,
        // 시작 전·끝난 뒤에도 그릴지. 기본은 구간 안에서만.
        hold: !!item.hold,
        data: item.data
      };
      items.push(rec);
      prevStart = start;
      prevEnd = start + dur;
      if (prevEnd > end) end = prevEnd;
      return tl;
    },

    // 이름표. 스태거의 start 값으로도 쓴다.
    label(name, pos) {
      labels[name] = resolvePosition(pos, { end, prevStart, prevEnd, labels });
      return tl;
    },

    // 빈 시간. 다음 항목을 뒤로 밀 때.
    gap(sec) {
      end += sec;
      return tl;
    },

    at(name) { return labels[name]; },

    // 여기가 전부다. 항목마다 진행도를 구해 render 를 부른다.
    // 순서에 의존하지 않고, 몇 번을 불러도 같은 결과가 나온다.
    seek(t) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.render) continue;
        const local = t - it.start;
        let p;
        if (it.dur <= 0) {
          if (local < 0) { if (!it.hold) continue; p = 0; }
          else p = 1;
        } else {
          p = local / it.dur;
          if (p < 0) { if (!it.hold) continue; p = 0; }
          else if (p > 1) { if (!it.hold) continue; p = 1; }
        }
        it.render(it.ease(p), local, it);
      }
    }
  };

  return tl;
}

// ── 키프레임 트랙 ──────────────────────────────────────────────
// 스칼라 하나가 시간을 따라 변하는 것. 카메라의 일곱 채널이 각각 이것이다.
//
// 채널마다 따로 두는 이유: 팬이 줌보다 120ms 먼저, 다른 곡선으로 나가는 것을
// 표현하려면 이 방법밖에 없다. 하나의 곡선에 모아 버리면 그건 카메라가 아니라
// CSS transform 이다. 손으로 만든 3D 에서 가장 흔한 티가 그것이다.
//
//   keys: [{ t, v, ease }] — t 오름차순. ease 는 앞 키에서 이 키로 오는 곡선.
export function track(keys) {
  const k = keys.slice().sort((a, b) => a.t - b.t);
  for (let i = 0; i < k.length; i++) k[i].fn = resolveEase(k[i].ease || 'inOut3');

  return function trackAt(t) {
    const n = k.length;
    if (n === 0) return 0;
    if (t <= k[0].t) return k[0].v;
    if (t >= k[n - 1].t) return k[n - 1].v;

    // 이분 탐색으로 구간을 찾는다.
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (k[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = k[lo], b = k[hi];
    const span = b.t - a.t;
    if (span <= 0) return b.v;
    return a.v + (b.v - a.v) * b.fn((t - a.t) / span);
  };
}

// 구간 [a, b] 안에서의 진행도. 장면 안에서 손으로 시각을 다룰 때 쓴다.
export function span(t, a, b) {
  if (b <= a) return t >= b ? 1 : 0;
  const p = (t - a) / (b - a);
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

// 값 사이를 섞는다.
export function mix(a, b, p) { return a + (b - a) * p; }

// 구간 밖으로 나가면 잘라낸다.
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// 들어왔다 나가는 봉우리. 잠깐 켜졌다 꺼지는 표시등에 쓴다.
export function pulse(t, at, rise, fall) {
  if (t < at) return 0;
  if (t < at + rise) return (t - at) / rise;
  if (t < at + rise + fall) return 1 - (t - at - rise) / fall;
  return 0;
}
