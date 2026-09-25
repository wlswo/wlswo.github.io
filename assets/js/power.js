/*
 * 잠금 화면과 전원(애플 메뉴의 잠자기 · 재시동 · 시스템 종료)
 *
 * 잠금 화면(lockscreen.html)은 세션마다 한 번 먼저 뜬다. 암호는 없다: 아무
 * 데나 누르거나 아무 키나 누르면, 폰에서는 위로 쓸어 올려도 열린다.
 * 잠긴 동안에는 뒤의 데스크톱을 inert 로 막아 두어 초점이 새지 않는다.
 *
 * 전원 메뉴는 흉내만 낸다.
 *   잠자기      화면이 까맣게 꺼진다. 아무 키나 누르거나 누르면 깨어나 잠금 화면.
 *   재시동…     까만 화면에 사과와 진행 막대, 그리고 쪽을 새로 불러 잠금 화면부터.
 *   시스템 종료… 까맣게 꺼지고 전원 단추만 남는다. 누르면 켜지며 재시동과 같다.
 */
const $ = (sel, root = document) => root.querySelector(sel);

const UNLOCKED = 'ephemeris:unlocked';
const lock = $('[data-lock]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');

const session = {
  set(v) {
    try {
      if (v) sessionStorage.setItem(UNLOCKED, '1');
      else sessionStorage.removeItem(UNLOCKED);
    } catch {}
  },
};

// 잠긴 동안 뒤의 모든 것을 막는다(잠금 화면과 전원 화면만 빼고).
function holdDesktop(hold) {
  for (const el of document.body.children) {
    if (el === lock || el.classList.contains('power') || el.tagName === 'SCRIPT') continue;
    el.inert = hold;
  }
}

// ── 시계 ────────────────────────────────────────────────────────
let clockTimer = 0;
function paintClock() {
  const d = new Date();
  $('[data-lock-date]', lock).textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`;
  $('[data-lock-time]', lock).textContent = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
  clockTimer = setTimeout(paintClock, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 20);
}

// ── 잠그기 · 열기 ───────────────────────────────────────────────
export function showLock() {
  if (!lock) return;
  lock.classList.remove('is-leaving');
  lock.hidden = false;
  document.documentElement.classList.add('is-locked');
  holdDesktop(true);
  clearTimeout(clockTimer);
  paintClock();
  lock.focus({ preventScroll: true }); // 판 자체에 초점(키를 누르면 열린다). 사진에 테두리가 생기지 않게
}

function unlock() {
  if (!lock || lock.hidden || lock.classList.contains('is-leaving')) return;
  session.set(true);
  holdDesktop(false);
  clearTimeout(clockTimer);
  document.documentElement.classList.remove('is-locked');
  lock.classList.add('is-leaving');
  setTimeout(
    () => {
      lock.hidden = true;
      lock.classList.remove('is-leaving');
      const front = document.querySelector('.window.is-front') ?? document.getElementById('main-window');
      front?.focus({ preventScroll: true });
    },
    reducedMotion.matches ? 0 : 450,
  );
}

if (lock) {
  // 누르면(또는 쓸어 올리면) 열린다. 끌다가 짧게 뗀 것도 누른 것으로 친다.
  lock.addEventListener('click', unlock);
  let from = null;
  lock.addEventListener('pointerdown', (e) => {
    from = e.isPrimary ? e.clientY : null;
  });
  lock.addEventListener('pointerup', (e) => {
    if (from != null && from - e.clientY > 60) unlock();
    from = null;
  });
  // 아무 키나(Tab · 조합 키는 빼고)
  lock.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    unlock();
  });

  if (!lock.hidden) {
    holdDesktop(true);
    paintClock();
    lock.focus({ preventScroll: true }); // 판 자체에 초점(키를 누르면 열린다). 사진에 테두리가 생기지 않게
  }
}

// ── 전원 ────────────────────────────────────────────────────────
function curtain() {
  const el = document.createElement('div');
  el.className = 'power';
  el.tabIndex = -1;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  document.body.append(el);
  holdDesktop(true);
  requestAnimationFrame(() => el.classList.add('is-on'));
  return el;
}

const wait = (ms) => new Promise((r) => setTimeout(r, reducedMotion.matches ? Math.min(ms, 150) : ms));

// 사과와 진행 막대. 다 차면 쪽을 새로 불러 잠금 화면부터 다시.
async function boot(el) {
  el.setAttribute('aria-label', '시동 중');
  el.innerHTML = `
    <div class="power__boot">
      <svg class="power__apple" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-apple"/></svg>
      <div class="power__bar" role="progressbar" aria-label="시동 중"><span></span></div>
    </div>`;
  el.focus();
  await wait(2600);
  session.set(false);
  location.reload();
}

async function sleep() {
  const el = curtain();
  el.setAttribute('aria-label', '잠자는 중. 아무 키나 누르면 깨어납니다');
  el.focus();
  await wait(500);
  const wake = (e) => {
    // 누른 자리(까만 판)가 초점을 가져가지 않게. 초점은 잠금 화면의 암호 칸으로.
    e.preventDefault();
    el.removeEventListener('pointerdown', wake);
    el.removeEventListener('keydown', wake);
    session.set(false);
    showLock();
    el.inert = true;
    el.classList.remove('is-on');
    setTimeout(() => el.remove(), reducedMotion.matches ? 0 : 500);
  };
  el.addEventListener('pointerdown', wake);
  el.addEventListener('keydown', wake);
}

async function restart() {
  const el = curtain();
  await wait(700);
  boot(el);
}

async function shutdown() {
  const el = curtain();
  el.setAttribute('aria-label', '시스템 꺼짐');
  await wait(1400);
  el.innerHTML = `
    <button class="power__button" type="button">
      <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-power"/></svg>
      <span>켜기</span>
    </button>`;
  const btn = $('.power__button', el);
  btn.focus();
  btn.addEventListener('click', () => boot(el), { once: true });
}

const ACTIONS = { sleep, restart, shutdown };
document.addEventListener('click', (e) => {
  const item = e.target.closest('[data-power]');
  if (item) ACTIONS[item.dataset.power]?.();
});
