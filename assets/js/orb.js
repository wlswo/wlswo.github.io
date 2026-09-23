/*
 * <thinking-orb> — thinking-orbs 를 React 없이 쓰는 사용자 정의 요소
 *
 * 라이브러리의 ThinkingOrb 컴포넌트가 하는 일을 그대로 옮겼다. 기하는
 * 전부 원본 엔진(vendor/thinking-orbs/engine.js)이 계산하고, 여기서는
 * 캔버스를 만들고 시계를 돌리고 화면 밖에서 멈추는 일만 한다.
 *
 *   <thinking-orb state="searching" size="64"></thinking-orb>
 *
 * state   working · searching · solving · listening · connecting ·
 *         weaving · composing · breathing · shaping      (기본 breathing)
 * size    그릴 크기(CSS px). 기본 64
 * preset  64 · 32 · 20 중 튜닝 값을 고른다. 없으면 size 에 가까운 것
 * speed   시계 배수. 기본 1
 * dots     점 개수 배수. 기본 1 (배경처럼 크게 그릴 때 올린다)
 * dot-size 점 크기 배수. 기본 1
 * theme   auto(기본: html[data-theme] 를 따른다) · light · dark
 * paused  있으면 현재 장면에서 멈춘다
 *
 * 원본과 다른 점 하나: state 가 바뀌면 끊지 않고 두 장면을 잠깐 겹쳐
 * 넘긴다(크로스페이드). 카테고리를 고를 때 구체가 형태를 바꿔 입는다.
 */
import {
  r as resolvePreset,
  s as scaleCounts,
  a as scaleRadii,
  M as MODE_FRAMES,
  p as paintFrame,
} from './vendor/thinking-orbs/engine.js';

const STATES = new Set([
  'working', 'searching', 'solving', 'listening', 'connecting',
  'weaving', 'composing', 'breathing', 'shaping',
]);
const PRESETS = [64, 32, 20];
const FADE_MS = 420;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const darkScheme = matchMedia('(prefers-color-scheme: dark)');

function nearestPreset(size) {
  let best = 64;
  for (const p of PRESETS) if (Math.abs(p - size) < Math.abs(best - size)) best = p;
  return best;
}

function ancestorDark(el) {
  for (let n = el; n && n.getAttribute; n = n.parentElement) {
    const t = n.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
  }
  return null;
}

class ThinkingOrb extends HTMLElement {
  static observedAttributes = ['state', 'size', 'preset', 'speed', 'dots', 'dot-size', 'theme', 'paused'];

  // 떠 있는 모든 구체. 쉬는 시간(아무 입력 없이 한동안)과 화면 배율 변화를
  // 한꺼번에 알리려고 모아 둔다.
  static #all = new Set();
  static #idle = false;

  static setIdle(idle) {
    if (idle === ThinkingOrb.#idle) return;
    ThinkingOrb.#idle = idle;
    for (const orb of ThinkingOrb.#all) orb.#sync();
  }

  static repaintAll() {
    for (const orb of ThinkingOrb.#all) orb.#repaint();
  }

  static rescaleAll() {
    for (const orb of ThinkingOrb.#all) {
      orb.#layout();
      orb.#repaint();
    }
  }

  #canvas = document.createElement('canvas');
  #ctx = null;
  #raf = 0;
  #running = false;
  #visible = true;
  #io = null;
  #scene = null; // 지금 그리는 장면 { fn, opts, speed }
  #leaving = null; // 크로스페이드 중 사라지는 장면
  #fadeFrom = 0;
  #size = 64;
  #dpr = 1;

  connectedCallback() {
    // 업그레이드 전에 .state 를 넣었다면 그 값이 접근자를 가리고 있다. 속성으로 옮긴다.
    if (Object.prototype.hasOwnProperty.call(this, 'state')) {
      const v = this.state;
      delete this.state;
      this.state = v;
    }
    ThinkingOrb.#all.add(this);
    if (!this.#canvas.isConnected) {
      this.#canvas.setAttribute('aria-hidden', 'true');
      this.#canvas.style.cssText = 'display:block;width:100%;height:100%';
      this.append(this.#canvas);
      this.#ctx = this.#canvas.getContext('2d');
    }
    if (!this.hasAttribute('role') && this.getAttribute('aria-hidden') !== 'true') {
      this.setAttribute('role', 'img');
    }
    this.#layout();
    this.#scene = this.#resolve();
    this.#draw(this.#now());

    this.#io = new IntersectionObserver(([entry]) => {
      this.#visible = entry.isIntersecting;
      this.#sync();
    });
    this.#io.observe(this);
    document.addEventListener('visibilitychange', this.#sync);
    reducedMotion.addEventListener('change', this.#sync);
    darkScheme.addEventListener('change', this.#repaint);
    this.#sync();
  }

  disconnectedCallback() {
    ThinkingOrb.#all.delete(this);
    this.#visible = false;
    this.#stop();
    this.#io?.disconnect();
    document.removeEventListener('visibilitychange', this.#sync);
    reducedMotion.removeEventListener('change', this.#sync);
    darkScheme.removeEventListener('change', this.#repaint);
  }

  attributeChangedCallback(name, oldValue, value) {
    if (!this.#ctx || oldValue === value) return;
    if (name === 'state') {
      // 같은 모양으로 다시 들어오는 경우는 넘김 없이 그대로 둔다.
      const next = this.#resolve();
      if (this.#scene && next.fn !== this.#scene.fn) {
        this.#leaving = this.#scene;
        this.#fadeFrom = performance.now();
      }
      this.#scene = next;
    } else if (name === 'size' || name === 'preset') {
      this.#layout();
      this.#scene = this.#resolve();
      this.#leaving = null;
    } else if (name === 'speed' || name === 'dots' || name === 'dot-size') {
      this.#scene = this.#resolve();
    }
    // 돌고 있으면 다음 프레임이 그리고, 서 있으면 #sync 가 바로 한 장 그린다.
    this.#sync();
  }

  get state() { return this.getAttribute('state') || 'breathing'; }
  set state(v) { this.setAttribute('state', v); }

  #layout() {
    const size = Math.max(8, Number(this.getAttribute('size')) || 64);
    this.#size = size;
    // 작은 구체는 3배 화면에서도 또렷하게. 큰 구체는 원본처럼 2배까지만(칠하는 비용).
    this.#dpr = Math.min(size <= 64 ? 3 : 2, window.devicePixelRatio || 1);
    this.#canvas.width = Math.round(size * this.#dpr);
    this.#canvas.height = Math.round(size * this.#dpr);
    this.style.setProperty('--orb-size', `${size}px`);
  }

  #resolve() {
    const state = STATES.has(this.state) ? this.state : 'breathing';
    const presetAttr = Number(this.getAttribute('preset'));
    const preset = PRESETS.includes(presetAttr) ? presetAttr : nearestPreset(this.#size);
    const { mode, speed, opts: base } = resolvePreset(state, preset);
    const mult = Number(this.getAttribute('speed'));
    const dots = Number(this.getAttribute('dots')) || 1;
    const dotSize = Number(this.getAttribute('dot-size')) || 1;
    let opts = dots !== 1 ? scaleCounts(base, Math.max(0.1, dots)) : base;
    if (dotSize !== 1) opts = scaleRadii(opts, Math.max(0.1, dotSize));
    return {
      fn: MODE_FRAMES[mode],
      opts,
      speed: speed * (Number.isFinite(mult) && mult > 0 ? mult : 1),
    };
  }

  #dark() {
    const theme = this.getAttribute('theme') || 'auto';
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return ancestorDark(this) ?? darkScheme.matches;
  }

  #now() {
    // 움직임을 원치 않으면 원본과 같이 t = 0.6 의 한 장면으로 둔다.
    return reducedMotion.matches ? null : performance.now();
  }

  #paint(scene, now, alpha) {
    const t = now == null ? 0.6 : (now / 1000) * scene.speed;
    this.#ctx.globalAlpha = alpha;
    paintFrame(this.#ctx, scene.fn(this.#size, t, scene.opts), this.#dark());
  }

  #draw(now) {
    const ctx = this.#ctx;
    if (!ctx || !this.#scene) return;
    ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    ctx.clearRect(0, 0, this.#size, this.#size);

    let k = 1;
    if (this.#leaving) {
      const clock = now ?? performance.now();
      k = Math.min(1, (clock - this.#fadeFrom) / FADE_MS);
      k = k * k * (3 - 2 * k); // smoothstep
      if (k >= 1 || now == null) this.#leaving = null;
      else this.#paint(this.#leaving, now, 1 - k);
    }
    this.#paint(this.#scene, now, this.#leaving ? k : 1);
    ctx.globalAlpha = 1;
  }

  #loop = () => {
    this.#draw(performance.now());
    if (this.#running) this.#raf = requestAnimationFrame(this.#loop);
  };

  #start() {
    if (this.#running) return;
    this.#running = true;
    this.#raf = requestAnimationFrame(this.#loop);
  }

  #stop() {
    this.#running = false;
    cancelAnimationFrame(this.#raf);
  }

  // 보일 때만 돈다. 화면 밖, 숨은 탭, 멈춤, 쉬는 시간, 움직임 줄이기 중에는 서 있다.
  #sync = () => {
    const live =
      this.isConnected &&
      this.#visible &&
      !ThinkingOrb.#idle &&
      document.visibilityState !== 'hidden' &&
      !this.hasAttribute('paused') &&
      !reducedMotion.matches;
    if (live) this.#start();
    else {
      // 서 있는 동안에는 넘김을 그릴 시계가 없으니, 바로 새 장면으로 둔다.
      this.#stop();
      this.#leaving = null;
      this.#draw(this.#now());
    }
  };

  #repaint = () => this.#draw(this.#now());
}

if (!customElements.get('thinking-orb')) {
  customElements.define('thinking-orb', ThinkingOrb);

  // 쉬는 시간: 아무 입력 없이 12초가 지나면 모든 구체가 그 자리에 선다.
  // Dock 과 메뉴 막대의 구체는 늘 화면 안에 있어서, 이게 없으면 글을 읽는 내내
  // 캔버스 여럿이 1초에 60번씩 다시 그려진다. 손을 대면 곧바로 다시 돈다.
  const IDLE_MS = 12000;
  let idleTimer = 0;
  const wake = () => {
    ThinkingOrb.setIdle(false);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      ThinkingOrb.setIdle(true);
      dispatchEvent(new Event('ephemeris:idle'));
    }, IDLE_MS);
  };
  for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) {
    addEventListener(type, wake, { passive: true, capture: true });
  }
  wake();

  // 모양(라이트·다크)이 바뀌면 점의 먹을 뒤집는다.
  new MutationObserver(() => ThinkingOrb.repaintAll()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  // 브라우저 확대나 다른 모니터로 옮겨 화면 배율이 바뀌면 캔버스를 다시 잡는다.
  (function watchDpr() {
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        ThinkingOrb.rescaleAll();
        watchDpr();
      },
      { once: true },
    );
  })();
}
