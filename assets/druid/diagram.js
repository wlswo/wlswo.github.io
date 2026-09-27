/*
 * 그림판: React Flow 위에 아스키 상자와 점선을 올린다
 *
 * 장(chapter)은 상자(nodes), 선(edges), 단계(steps)를 적은 모듈이다. 자리는 글자
 * 칸 단위(x: 열, y: 줄)라, 아스키 그림을 그리듯 놓는다.
 *
 *   nodes: [{ id, x, y, type?: 'box'|'frame'|'text'|'note', title, lines, caption, tone, … }]
 *   edges: [{ id, from, to, tone, label?, via?: 'r-l' }]
 *   steps: [{ title, body, show?, hide?, on?, warn?, dim?, patch?, focus?, play?(s), loop?, gap?, hold? }]
 *
 * 단계는 어느 것을 밝히고(on: 겹선 ╔═╗), 흐리고, 숨길지와, 상자의 글자를 어떻게
 * 바꿀지(patch)를 적는다. play(s) 는 그 단계 동안 되풀이되는 움직임이다:
 *
 *   play: async (s) => {
 *     await s.send('e-router-broker');           // 선을 따라 ● 이 간다
 *     s.pulse('broker');                          // 상자가 잠깐 물든다
 *     s.patch('seg', { lines: [...] });           // 글자를 바꾼다(단계가 바뀌면 되돌아간다)
 *     await s.wait(0.5);
 *   }
 *
 * 시간은 그림판의 시계를 따른다 — 멈추면 함께 멈추고, 빠르게 하면 함께 빨라진다.
 */
import {
  React,
  html,
  createRoot,
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  useNodesInitialized,
  ConnectionMode,
} from './vendor/flow.js';
import { box, frame, width, parts } from './ascii.js';

const { useState, useEffect, useMemo, useRef, useCallback, memo, Fragment } = React;

export const CW = 7.8; // 한 칸의 폭(13px 고정폭 글꼴의 0.6em)
export const LH = 18; // 한 줄의 높이
const SVGNS = 'http://www.w3.org/2000/svg';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

export class Abort extends Error {
  constructor() {
    super('aborted');
    this.name = 'Abort';
  }
}

// ── 상자 ────────────────────────────────────────────────────────
function Lines({ lines }) {
  // 빈 줄만 빈칸 하나로 채운다(줄 높이를 지키려고). 빈 조각은 그대로 비워 폭이 늘지 않게.
  return lines.map((l, i) => {
    const ps = parts(l);
    const empty = !ps.some((p) => (typeof p === 'string' ? p : p.t).length);
    return html`<div className="ln" key=${i}>${
      empty ? ' ' : ps.map((p, j) => (typeof p === 'string' ? p : html`<span key=${j} className=${`t-${p.c}`}>${p.t}</span>`))
    }</div>`;
  });
}

// 선이 붙는 자리: 네 면의 가운데(t r b l)와, 한 면에 여러 선이 붙을 때 겹치지
// 않게 쓰는 4분의 1 자리(tl tr, bl br, lt lb, rt rb).
const HANDLE_SPOTS = {
  t: [Position.Top, null],
  tl: [Position.Top, { left: '25%' }],
  tr: [Position.Top, { left: '75%' }],
  b: [Position.Bottom, null],
  bl: [Position.Bottom, { left: '25%' }],
  br: [Position.Bottom, { left: '75%' }],
  l: [Position.Left, null],
  lt: [Position.Left, { top: '25%' }],
  lb: [Position.Left, { top: '75%' }],
  r: [Position.Right, null],
  rt: [Position.Right, { top: '25%' }],
  rb: [Position.Right, { top: '75%' }],
};
const HANDLES = Object.entries(HANDLE_SPOTS).map(
  ([id, [pos, style]]) => html`<${Handle} key=${id} id=${id} type="source" position=${pos} style=${style || undefined} isConnectable=${false} />`,
);

/** 상자에 그릴 줄들(단계의 모습에 따라 틀이 바뀐다: on 은 겹선, warn 은 굵은 선). */
function artOf(data) {
  if (data.art) return data.art;
  const st = data.state || 'normal';
  const kind = st === 'on' ? 'double' : st === 'warn' ? 'heavy' : data.frame || 'single';
  return box(data.title || '', data.lines || [], { frame: kind, w: data.w || 0, tag: data.tag || '' });
}

const BoxNode = memo(({ data }) => {
  const st = data.state || 'normal';
  return html`<div className=${`an tone-${data.tone || 'n'} is-${st}`} title=${data.hint || undefined}>
    <div className="an__art"><${Lines} lines=${artOf(data)} />${HANDLES}</div>
    ${data.caption ? html`<div className="an__cap">${data.caption}</div>` : null}
  </div>`;
});

const FrameNode = memo(({ data }) => {
  const st = data.state || 'normal';
  const lines = frame(data.title || '', data.cols || 20, data.rows || 6, { frame: st === 'on' ? 'single' : data.frame || 'dashed', tag: data.tag || '' });
  return html`<div className=${`an af tone-${data.tone || 'n'} is-${st}`}>
    <div className="an__art"><${Lines} lines=${lines} />${HANDLES}</div>
    ${data.caption ? html`<div className="af__cap">${data.caption}</div>` : null}
  </div>`;
});

const TextNode = memo(({ data }) => {
  const st = data.state || 'normal';
  return html`<div className=${`an at tone-${data.tone || 'n'} is-${st}`}>
    <div className="an__art"><${Lines} lines=${data.lines || []} />${HANDLES}</div>
    ${data.caption ? html`<div className="an__cap">${data.caption}</div>` : null}
  </div>`;
});

const NoteNode = memo(({ data }) => {
  const st = data.state || 'normal';
  return html`<div className=${`ano tone-${data.tone || 'n'} is-${st}`} style=${{ width: data.cols ? `${data.cols * CW}px` : undefined }} dangerouslySetInnerHTML=${{ __html: data.html || '' }} />`;
});

const NODE_TYPES = { box: BoxNode, frame: FrameNode, text: TextNode, note: NoteNode };

// ── 선 ──────────────────────────────────────────────────────────
// 꺾인 점선(아스키 그림의 ─ │ 처럼 직각으로 꺾인다). 끝에 작은 > 화살.
const FlowEdge = memo(({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data = {} }) => {
  // cx, cy(칸): 꺾이는 가운데 토막의 자리. 상자 사이의 빈 골목으로 지나가게 한다.
  const [d, lx, ly] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: data.round ?? 0,
    offset: data.offset ?? 14,
    centerX: data.cx != null ? data.cx * CW : undefined,
    centerY: data.cy != null ? data.cy * LH : undefined,
  });
  const tone = data.tone || 'n';
  const st = data.state || 'normal';
  return html`<${Fragment}>
    <path id=${`ep-${id}`} className=${`ae tone-${tone} is-${st}${data.solid ? ' is-solid' : ''}`} d=${d} fill="none" markerEnd=${data.arrow === false ? undefined : `url(#mk-${tone})`} />
    <g className=${`ae__pk tone-${tone}`} data-packets=${id}></g>
    ${
      data.label
        ? html`<${EdgeLabelRenderer}>
            <div className=${`ael tone-${tone} is-${st}`} style=${{ transform: `translate(-50%, -50%) translate(${lx + (data.lx || 0) * CW}px, ${ly + (data.ly || 0) * LH}px)` }}>${data.label}</div>
          </${EdgeLabelRenderer}>`
        : null
    }
  </${Fragment}>`;
});

const EDGE_TYPES = { flow: FlowEdge };
const TONES = ['q', 'i', 'm', 'g', 'p', 'y', 'x', 'n', 'd'];

function Markers() {
  return html`<svg className="mk-defs" width="0" height="0" aria-hidden="true">
    <defs>
      ${TONES.map(
        (t) => html`<marker key=${t} id=${`mk-${t}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path className=${`mk tone-${t}`} d="M1.5,1.5 L8.5,5 L1.5,8.5" fill="none" />
        </marker>`,
      )}
    </defs>
  </svg>`;
}

// ── 모형: 장 + 단계 + 조작 → React Flow 의 노드, 엣지 ─────────
/** 상자의 크기(칸). 자동으로 선의 붙는 면을 고를 때 쓴다. */
function cellsOf(n) {
  if (n.type === 'frame') return { cols: n.cols || 20, rows: n.rows || 6 };
  if (n.type === 'note') return { cols: n.cols || 24, rows: n.rows || 3 };
  const lines = n.type === 'text' ? n.lines || [] : artOf({ ...n, state: 'normal' });
  return { cols: Math.max(1, ...lines.map(width)), rows: lines.length };
}

function sides(a, b) {
  const dx = (b.x + b.cols / 2 - (a.x + a.cols / 2)) * CW;
  const dy = (b.y + b.rows / 2 - (a.y + a.rows / 2)) * LH;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
  return dy >= 0 ? ['b', 't'] : ['t', 'b'];
}

function buildModel(def, i, params, over) {
  const step = def.steps[i] || {};
  const rawNodes = (typeof def.nodes === 'function' ? def.nodes(params) : def.nodes) || [];
  const rawEdges = (typeof def.edges === 'function' ? def.edges(params) : def.edges) || [];
  const patch = { ...((typeof step.patch === 'function' ? step.patch(params) : step.patch) || {}) };
  for (const [id, p] of over.patch) patch[id] = { ...(patch[id] || {}), ...p };
  const show = step.show ? new Set(typeof step.show === 'function' ? step.show(params) : step.show) : null;
  const hide = new Set(step.hide || []);
  const on = new Set(typeof step.on === 'function' ? step.on(params) : step.on || []);
  const warn = new Set(step.warn || []);
  const dimRest = !!step.on && step.dim !== false;
  const stateOf = (id, hidden) => {
    if (over.state.has(id)) return over.state.get(id);
    if (hidden || hide.has(id)) return 'hidden';
    if (warn.has(id)) return 'warn';
    if (on.has(id)) return 'on';
    return dimRest ? 'dim' : 'normal';
  };

  const cells = new Map();
  const nodes = rawNodes.map((n) => {
    const data = { ...n, ...(patch[n.id] || {}) };
    data.state = stateOf(n.id, show && !show.has(n.id));
    cells.set(n.id, { x: data.x, y: data.y, ...cellsOf(data), hidden: data.state === 'hidden' });
    return {
      id: n.id,
      type: n.type || 'box',
      position: { x: data.x * CW, y: data.y * LH },
      data,
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: data.z ?? (n.type === 'frame' ? 0 : 1),
    };
  });

  // 선: step.edges 에 적은 것만 보인다(적지 않으면 on 에 든 것만, on 도 없으면 모두).
  const listed = step.edges ? new Set(typeof step.edges === 'function' ? step.edges(params) : step.edges) : null;
  const tones = new Map();
  const edges = rawEdges.map((e) => {
    const a = cells.get(e.from);
    const b = cells.get(e.to);
    let [sh, th] = (e.via || '').split('-');
    if ((!sh || !th) && a && b) [sh, th] = sides(a, b);
    const shown = listed ? listed.has(e.id) || on.has(e.id) || warn.has(e.id) : step.on ? on.has(e.id) || warn.has(e.id) : true;
    const hidden = !a || !b || a.hidden || b.hidden || !shown;
    tones.set(e.id, e.tone || 'n');
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      sourceHandle: sh,
      targetHandle: th,
      type: 'flow',
      data: { ...e, ...(patch[e.id] || {}), state: hidden ? over.state.get(e.id) || 'hidden' : stateOf(e.id, false) === 'dim' ? 'normal' : stateOf(e.id, false) },
      focusable: false,
      selectable: false,
    };
  });

  const visible = nodes.filter((n) => n.data.state !== 'hidden' && !n.data.noFit).map((n) => n.id);
  const focus = step.focus ? (typeof step.focus === 'function' ? step.focus(params) : step.focus) : visible;
  return { nodes, edges, focus, tones };
}

// ── React 쪽 ────────────────────────────────────────────────────
function Diagram({ model, api }) {
  const rf = useReactFlow();
  const initialized = useNodesInitialized();
  const measured = useRef(new Map());
  const [tick, setTick] = useState(0);

  // 장이 바뀌면 잰 크기를 버린다(같은 id 라도 다른 상자다).
  const chapter = model.chapter;
  const lastChapter = useRef(chapter);
  if (lastChapter.current !== chapter) {
    lastChapter.current = chapter;
    measured.current = new Map();
  }

  const nodes = useMemo(
    () =>
      model.nodes.map((n) => {
        const m = measured.current.get(n.id);
        return m ? { ...n, measured: m } : n;
      }),
    [model.nodes, tick],
  );

  const onNodesChange = useCallback((changes) => {
    let dirty = false;
    for (const ch of changes) {
      if (ch.type === 'dimensions' && ch.dimensions) {
        measured.current.set(ch.id, ch.dimensions);
        dirty = true;
      }
    }
    if (dirty) setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    api.rf = rf;
  }, [rf]);

  useEffect(() => {
    if (!initialized) return;
    // 크기를 잰 뒤에 맞춘다(한 프레임 쉬어 선까지 그려진 뒤).
    const id = requestAnimationFrame(() => api.fit(model.instant ? 0 : 700));
    return () => cancelAnimationFrame(id);
  }, [initialized, model.fitKey]);

  return html`<${ReactFlow}
    key=${model.chapter}
    nodes=${nodes}
    edges=${model.edges}
    nodeTypes=${NODE_TYPES}
    edgeTypes=${EDGE_TYPES}
    onNodesChange=${onNodesChange}
    connectionMode=${ConnectionMode.Loose}
    nodesDraggable=${false}
    nodesConnectable=${false}
    elementsSelectable=${false}
    nodesFocusable=${false}
    edgesFocusable=${false}
    zoomOnDoubleClick=${false}
    minZoom=${0.15}
    maxZoom=${2.5}
    onMoveStart=${(e) => {
      if (e) api.userMoved = true;
    }}
    proOptions=${{ hideAttribution: false }}
  >
    <${Background} variant=${BackgroundVariant.Dots} gap=${[CW * 2, LH]} size=${1} className="bg" />
    <${Markers} />
  </${ReactFlow}>`;
}

// ── 그림판 ──────────────────────────────────────────────────────
export function mountDiagram(el) {
  const root = createRoot(el);
  const over = { patch: new Map(), state: new Map() };
  const clock = { time: 0, speed: 1, paused: false };
  let waits = [];
  const packets = new Set();
  let running = true;
  let raf = 0;
  let last = performance.now();
  let ctrl = null;
  let fitKey = 0;

  const api = {
    def: null,
    index: 0,
    params: {},
    model: null,
    rf: null,
    userMoved: false,
    clock,

    /** 장을 올린다. */
    load(def, params) {
      api.def = def;
      api.params = { ...params };
      api.chapter = (api.chapter || 0) + 1;
    },

    /** i 번째 단계로. instant 면 카메라가 곧장 그 자리로. */
    step(i, { instant = false } = {}) {
      api.index = i;
      abort();
      over.patch.clear();
      over.state.clear();
      fitKey++;
      render(instant);
      startScript();
    },

    /** 조작(컨트롤)이 바뀌었다. 같은 단계를 다시 그린다(맞출 곳이 바뀔 때만 카메라를 옮긴다). */
    setParams(params) {
      api.params = { ...params };
      abort();
      over.patch.clear();
      over.state.clear();
      const before = JSON.stringify(api.model?.focus || []);
      render(false, false);
      if (JSON.stringify(api.model.focus) !== before) {
        fitKey++;
        render(false);
      }
      startScript();
    },

    fit(dur = 0) {
      if (!api.rf || !api.model) return;
      const ids = api.model.focus;
      // 아래쪽은 색의 뜻(범례) 자리만큼 더 비운다
      const legend = el.parentElement?.querySelector('[data-legend]');
      const below = legend && !legend.hidden && legend.offsetHeight ? legend.offsetHeight + 18 : 24;
      api.rf.fitView({
        nodes: ids?.length ? ids.map((id) => ({ id })) : undefined,
        padding: { top: '26px', right: '28px', bottom: `${below}px`, left: '28px' },
        duration: reduced.matches ? 0 : dur,
        maxZoom: api.def?.maxZoom ?? 1.35,
        minZoom: 0.15,
      });
      api.userMoved = false;
    },

    zoom(dir) {
      if (!api.rf) return;
      if (dir > 0) api.rf.zoomIn({ duration: 200 });
      else api.rf.zoomOut({ duration: 200 });
    },

    pause(on) {
      clock.paused = on;
      el.classList.toggle('is-paused', on);
    },

    speed(k) {
      clock.speed = k;
    },

    /** 창이 숨으면 쉬고, 보이면 다시. */
    run(on) {
      running = on;
      cancelAnimationFrame(raf);
      if (on) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    },

    time: () => clock.time,
  };

  function render(instant, refit = true) {
    if (!api.def) return;
    const m = buildModel(api.def, api.index, api.params, over);
    m.chapter = api.chapter;
    m.fitKey = refit || !api.model ? `${api.chapter}:${api.index}:${fitKey}` : api.model.fitKey;
    m.instant = instant;
    api.model = m;
    root.render(html`<${ReactFlowProvider}><${Diagram} model=${m} api=${api} /></${ReactFlowProvider}>`);
  }

  // 글자만 바뀔 때(스크립트의 patch, state): 카메라는 그대로 두고 다시 그린다.
  let queued = false;
  function rerender() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!api.def) return;
      const m = buildModel(api.def, api.index, api.params, over);
      m.chapter = api.chapter;
      m.fitKey = api.model?.fitKey;
      m.instant = true;
      api.model = m;
      root.render(html`<${ReactFlowProvider}><${Diagram} model=${m} api=${api} /></${ReactFlowProvider}>`);
    });
  }

  // ── 시계, 기다림, 빛 방울 ──
  function wait(sec, signal) {
    if (signal?.aborted) return Promise.reject(new Abort());
    return new Promise((resolve, reject) => {
      const w = { at: clock.time + Math.max(0, sec), resolve };
      waits.push(w);
      signal?.addEventListener(
        'abort',
        () => {
          waits = waits.filter((x) => x !== w);
          reject(new Abort());
        },
        { once: true },
      );
    });
  }

  function send(edgeId, { glyph = '●', dur = 1.1, reverse = false, tone } = {}, signal) {
    if (signal?.aborted) return Promise.reject(new Abort());
    return new Promise((resolve, reject) => {
      const pk = { edgeId, glyph, dur: Math.max(0.05, dur), reverse, tone, t: 0, tries: 0, resolve, el: null, path: null };
      packets.add(pk);
      signal?.addEventListener(
        'abort',
        () => {
          drop(pk);
          reject(new Abort());
        },
        { once: true },
      );
    });
  }

  function drop(pk) {
    pk.el?.remove();
    packets.delete(pk);
  }

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;
    const dt = clock.paused ? 0 : real * clock.speed;
    clock.time += dt;
    if (waits.length) {
      const due = waits.filter((w) => w.at <= clock.time);
      if (due.length) {
        waits = waits.filter((w) => w.at > clock.time);
        for (const w of due) w.resolve();
      }
    }
    for (const pk of packets) {
      if (!pk.path) {
        pk.path = document.getElementById(`ep-${pk.edgeId}`);
        const g = el.querySelector(`[data-packets="${pk.edgeId}"]`);
        if (!pk.path || !g) {
          pk.path = null;
          // 선이 아직 그려지지 않았다. 잠시 기다려도 없으면 건너뛴다.
          if (++pk.tries > 90) {
            drop(pk);
            pk.resolve();
          }
          continue;
        }
        pk.el = document.createElementNS(SVGNS, 'text');
        pk.el.setAttribute('class', `pk tone-${pk.tone || api.model?.tones.get(pk.edgeId) || 'n'}`);
        pk.el.textContent = pk.glyph;
        g.append(pk.el);
      }
      pk.t += reduced.matches ? 1 : dt / pk.dur;
      const u = ease(Math.min(1, pk.t));
      const len = pk.path.getTotalLength();
      const p = pk.path.getPointAtLength(len * (pk.reverse ? 1 - u : u));
      pk.el.setAttribute('x', p.x.toFixed(1));
      pk.el.setAttribute('y', p.y.toFixed(1));
      if (pk.t >= 1) {
        drop(pk);
        pk.resolve();
      }
    }
  }

  function pulse(id) {
    const node = el.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"] > .an, .react-flow__node[data-id="${CSS.escape(id)}"] > .ano`);
    if (!node) return;
    node.classList.remove('is-pulse');
    void node.offsetWidth; // 연달아 불러도 처음부터 다시
    node.classList.add('is-pulse');
    node.addEventListener('animationend', () => node.classList.remove('is-pulse'), { once: true });
  }

  function abort() {
    ctrl?.abort();
    ctrl = null;
    for (const pk of [...packets]) drop(pk);
  }

  function startScript() {
    const step = api.def?.steps[api.index];
    if (!step?.play) return;
    ctrl = new AbortController();
    const signal = ctrl.signal;
    const live = () => !signal.aborted;
    const s = {
      signal,
      alive: live,
      params: api.params,
      wait: (sec) => wait(sec, signal),
      send: (edgeId, o) => send(edgeId, o, signal),
      /** 여러 선에 한꺼번에 보내고 모두 닿을 때까지 기다린다. */
      sendAll: (ids, o) => Promise.all(ids.map((id) => send(id, o, signal))),
      pulse: (id) => live() && pulse(id),
      patch: (id, p) => {
        if (!live()) return;
        over.patch.set(id, { ...(over.patch.get(id) || {}), ...p });
        rerender();
      },
      state: (id, st) => {
        if (!live()) return;
        if (st == null) over.state.delete(id);
        else over.state.set(id, st);
        rerender();
      },
      /** 이 스크립트가 바꾼 것을 모두 되돌린다(되풀이의 처음에). */
      reset: () => {
        if (!live()) return;
        over.patch.clear();
        over.state.clear();
        rerender();
      },
    };
    const loopOn = step.loop !== false;
    const gap = step.gap ?? 0.8;
    (async () => {
      try {
        do {
          await step.play(s);
          if (loopOn) await s.wait(gap);
        } while (loopOn && live());
      } catch (e) {
        if (!(e instanceof Abort)) console.error(e);
      }
    })();
  }

  api.run(true);
  return api;
}
