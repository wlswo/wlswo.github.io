/*
 * 10 쿼리의 여정
 *
 * 윗줄: 클라이언트 → Router → Broker. 가운데 오른쪽: Broker 의 타임라인(어느 날
 * 어느 파티션을 어느 서버가 들고 있나). 아랫줄: 데이터 서버(Historical ×3, Peon).
 * 가운데 왼쪽은 단계마다 바뀌는 판(SQL → 네이티브, 결과, 결과 캐시, 스케줄러).
 *
 * 데이터: wikipedia, 09-21 ~ 09-26 은 게시된 세그먼트(하루 두 파티션: channel 로 범위
 * 파티션 — p0 은 '#ja' 앞, p1 은 그 뒤, 사본 둘), 09-27(오늘)은 실시간 태스크(Peon)가
 * 들고 있다. 조작: 쿼리 기간(최근 N일), channel 필터, 캐시.
 */
import { c, table, bar, num } from '../ascii.js';

const DAYS = ['21', '22', '23', '24', '25', '26', '27']; // 09-21 … 09-27(오늘, 실시간)
const PAIRS = [['H1', 'H2'], ['H2', 'H3'], ['H1', 'H3']];
const SEGS = [];
for (let d = 0; d < 6; d++) for (let p = 0; p < 2; p++) SEGS.push({ id: `${DAYS[d]}p${p}`, d, p, holders: PAIRS[(d * 2 + p) % 3] });
const LIVE = { id: '27rt', d: 6, p: null, holders: ['Peon'] };
const ALL = [...SEGS, LIVE];
const SERVERS = ['H1', 'H2', 'H3', 'Peon'];
const NODE = { H1: 'h1', H2: 'h2', H3: 'h3', Peon: 'peon' };
// 날마다 한국어 위키의 추가량(그림용 예시 숫자)
const ADDED = [9120, 11480, 8705, 10230, 12408, 9771, 3120];

const inTime = (s, P) => s.d >= 7 - P.days;
const pruned = (s, P) => P.filter && s.p === 0; // '#ko.wikipedia' 는 p1(>= '#ja') 에만 있다
const kept = (s, P, phase) => (phase === 'none' ? true : phase === 'time' ? inTime(s, P) : inTime(s, P) && !pruned(s, P));

// ── Broker 타임라인 ──
const COLW = 7;
function timeline(P, phase) {
  const cell = (s) => {
    const txt = s.holders.join(s.holders.length > 1 ? ' ' : '').padEnd(COLW);
    if (phase === 'none') return txt;
    if (!inTime(s, P)) return c('d', txt);
    if (phase === 'all' && pruned(s, P)) return c('x', 'skip'.padEnd(COLW));
    return c(s === LIVE ? 'i' : 'q', txt);
  };
  const dash = c('d', '-'.padEnd(COLW));
  const row = (label, pick) => [label, ...DAYS.map((_, d) => pick(d) || dash)];
  const segAt = (d, p) => SEGS.find((s) => s.d === d && s.p === p);
  const bar1 = DAYS.map((_, d) => {
    if (phase === 'none') return c('d', '.'.repeat(COLW - 1) + ' ');
    return d >= 7 - P.days ? c('q', '═'.repeat(COLW - 1) + ' ') : c('d', '─'.repeat(COLW - 1) + ' ');
  });
  const n = ALL.filter((s) => kept(s, P, phase)).length;
  const summary =
    phase === 'none'
      ? c('d', `${ALL.length} segments: 12 published + 1 realtime`)
      : phase === 'time'
        ? [c('d', 'in query interval: '), c('q', String(n)), c('d', ` / ${ALL.length}`)]
        : [c('d', 'after time + filter: '), c('q', String(n)), c('d', ` / ${ALL.length}`)];
  return [
    ['          ', ...DAYS.map((d) => c('d', `09-${d}`.padEnd(COLW)))],
    row('p0 < #ja  ', (d) => (d < 6 ? cell(segAt(d, 0)) : null)),
    row('p1 >= #ja ', (d) => (d < 6 ? cell(segAt(d, 1)) : null)),
    row('realtime  ', (d) => (d === 6 ? cell(LIVE) : null)),
    ['intervals ', ...bar1],
    '---',
    summary,
  ];
}

// ── 데이터 서버 상자 ──
const held = (srv) => ALL.filter((s) => s.holders.includes(srv));
const tokLines = (srv, color) => {
  const toks = held(srv).map((s) => color(s));
  const lines = [];
  for (let k = 0; k < 4 * 2; k += 4) {
    const row = [];
    toks.slice(k, k + 4).forEach((t, j) => {
      if (j) row.push(' ');
      row.push(t);
    });
    lines.push(row.length ? row : ' ');
  }
  return lines;
};

function serverLines(srv, P, mode, st = {}) {
  const assigned = st.assign ? st.assign.filter((a) => a.srv === srv).map((a) => a.seg) : [];
  if (mode === 'plain') return [...tokLines(srv, (s) => s.id), '---', c('d', `${held(srv).length} segment${held(srv).length > 1 ? 's' : ''}`)];
  if (mode === 'kept' || mode === 'time') {
    const phase = mode === 'time' ? 'time' : 'all';
    const k = held(srv).filter((s) => kept(s, P, phase)).length;
    return [...tokLines(srv, (s) => (kept(s, P, phase) ? c(s === LIVE ? 'i' : 'q', s.id) : c('d', s.id))), '---', k ? [c('d', 'to query: '), c('q', String(k))] : c('d', 'nothing to do')];
  }
  if (mode === 'assign') {
    return [
      ...tokLines(srv, (s) => (assigned.includes(s) ? c(s === LIVE ? 'i' : 'q', s.id) : kept(s, P, 'all') ? s.id : c('d', s.id))),
      '---',
      assigned.length ? [c('d', 'subquery: '), c('q', String(assigned.length)), c('d', ` segment${assigned.length > 1 ? 's' : ''}`)] : c('d', 'not asked'),
    ];
  }
  if (mode === 'threads') {
    // 세그먼트 하나에 처리 스레드 하나(그림에서는 서버마다 스레드 2개). 끝나지 않은
    // 세그먼트를 앞에서부터 두 개 보이고, 나머지는 차례를 기다린다.
    const prog = st.prog || {};
    const left = assigned.filter((sg) => (prog[sg.id] ?? 0) < 1);
    const shown = left.slice(0, 2);
    if (shown.length < 2) shown.push(...assigned.filter((sg) => (prog[sg.id] ?? 0) >= 1).slice(-(2 - shown.length)));
    const lines = [0, 1].map((t) => {
      const sg = shown[t];
      if (!sg) return c('d', `t${t + 1} idle`);
      return [`t${t + 1} ${sg.id} `, ...bar(st.done ? 1 : prog[sg.id] ?? 0, 1, 10, { tone: sg === LIVE ? 'i' : 'q' })];
    });
    const waiting = left.length - 2;
    const status = !assigned.length
      ? c('d', 'not asked')
      : st.done
        ? [c('g', 'merged'), c('d', ` ${assigned.length} -> 1`)]
        : waiting > 0
          ? c('d', `queued: ${waiting} segment${waiting > 1 ? 's' : ''}`)
          : c('d', 'processing');
    return [...lines, '---', status];
  }
  if (mode === 'cache') {
    const lines = [0, 1].map((t) => {
      const s = assigned[t];
      if (!s) return c('d', ' ');
      const hit = st.hits?.includes(s.id);
      return [`${s.id} `, hit ? c('g', 'cache hit') : c('q', 'computed ')];
    });
    const more = assigned.length - 2;
    const anyHit = assigned.some((sg) => st.hits?.includes(sg.id));
    const status = !assigned.length ? c('d', 'not asked') : more > 0 ? c('d', `+${more} more`) : srv === 'Peon' ? c('d', 'realtime: computed') : anyHit ? c('g', 'from cache') : c('d', P.cache ? 'computed -> cache' : 'computed');
    return [...lines, '---', status];
  }
  return [];
}

function assignRandom(P) {
  return ALL.filter((s) => kept(s, P, 'all')).map((s) => ({ seg: s, srv: s.holders[Math.floor(Math.random() * s.holders.length)] }));
}
// 스크립트가 돌기 전의 모습(다시 그릴 때마다 바뀌지 않게, 첫 사본)
function assignFirst(P) {
  return ALL.filter((s) => kept(s, P, 'all')).map((s) => ({ seg: s, srv: s.holders[0] }));
}

// ── 단계마다 바뀌는 판 ──
const FROM = (P) => `2026-09-${DAYS[7 - P.days]}`;
const SQL = (P) => [
  [c('q', 'SELECT'), ' FLOOR(__time TO DAY) AS day,'],
  '       SUM(added) AS added',
  [c('q', 'FROM'), ' wikipedia'],
  [c('q', 'WHERE'), ` __time >= TIMESTAMP '${FROM(P)}'`],
  ...(P.filter ? [[c('q', '  AND'), " channel = '#ko.wikipedia'"]] : []),
  [c('q', 'GROUP BY'), ' 1'],
];
const NATIVE = (P) => [
  ['{ ', c('d', '"queryType":'), ' "timeseries",'],
  ['  ', c('d', '"intervals":'), ` ["${FROM(P)}T00:00:00.000Z/…"],`],
  ...(P.filter
    ? [
        ['  ', c('d', '"filter":'), ' { "type": "equals", "column": "channel",'],
        '              "matchValueType": "STRING",',
        '              "matchValue": "#ko.wikipedia" },',
      ]
    : []),
  ['  ', c('d', '"granularity":'), ' "day",'],
  ['  ', c('d', '"aggregations":'), ' [{ "type": "longSum",'],
  '        "name": "added", "fieldName": "added" }] }',
];

function resultLines(P) {
  const rows = [];
  for (let d = 7 - P.days; d < 7; d++) {
    const v = P.filter ? ADDED[d] : ADDED[d] * 7 + 311;
    rows.push([`09-${DAYS[d]}`, c(d === 6 ? 'i' : 'q', num(v))]);
  }
  return table(['day', 'added'], rows, { align: ['left', 'right'] });
}

const SCHED = (st = {}) => {
  const slot = (k, kind) => (kind === 'h' ? c('q', '[q]') : kind === 'l' ? c('m', '[l]') : c('d', '[ ]'));
  const slots = [];
  for (let k = 0; k < 6; k++) slots.push(slot(k, st.slots?.[k]));
  return [
    ['http threads ', ...slots.flatMap((s, i) => (i ? [' ', s] : [s]))],
    ['low lane max ', c('m', '2'), c('d', ' of 6 (maxLowPercent 33)')],
    '---',
    st.reject ? [c('x', 'HTTP 429'), c('d', ' low query rejected')] : st.msg ? c('d', st.msg) : c('d', 'priority >= 0 : interactive'),
  ];
};

const nodes = (P) => [
  { id: 'client', x: 0, y: 1, title: 'client', lines: ['SQL over HTTP', 'or JDBC'], tone: 'n', caption: '클라이언트' },
  { id: 'router', x: 21, y: 1, title: 'Router', lines: ['-> a Broker', c('d', ':8888')], tone: 'q', caption: '라우팅' },
  { id: 'broker', x: 40, y: 0, title: 'Broker', lines: ['1 plan (Calcite)', '2 timeline lookup', '3 scatter', '4 gather + merge'], w: 20, tone: 'q', caption: '계획, 분배, 병합' },
  { id: 'tl', x: 54, y: 8, title: 'broker timeline: wikipedia', lines: timeline(P, 'none'), tone: 'q', caption: 'Broker 가 아는 세그먼트 지도' },

  { id: 'sql', type: 'text', x: 0, y: 8, lines: SQL(P) },
  { id: 'native', type: 'text', x: 0, y: 16, lines: NATIVE(P), tone: 'q' },
  { id: 'result', x: 0, y: 8, title: 'result', lines: resultLines(P), tone: 'q', caption: '최종 결과' },
  { id: 'rcache', x: 20, y: 8, title: 'result cache', tag: 'Broker', lines: [c('d', 'whole-query'), P.cache ? c('x', 'miss: live data') : c('d', 'off (default)')], tone: 'g', caption: '전체 쿼리 결과 캐시' },
  { id: 'sched', x: 0, y: 8, title: 'query scheduler', tag: 'hilo', lines: SCHED(), tone: 'm', caption: 'Broker 의 레인' },

  { id: 'h1', x: 0, y: 20, title: 'Historical 1', lines: serverLines('H1', P, 'plain'), w: 21, tone: 'i', caption: '세그먼트 8개(사본)' },
  { id: 'h2', x: 25, y: 20, title: 'Historical 2', lines: serverLines('H2', P, 'plain'), w: 21, tone: 'i', caption: '세그먼트 8개(사본)' },
  { id: 'h3', x: 50, y: 20, title: 'Historical 3', lines: serverLines('H3', P, 'plain'), w: 21, tone: 'i', caption: '세그먼트 8개(사본)' },
  { id: 'peon', x: 75, y: 20, title: 'Peon', tag: 'realtime', lines: serverLines('Peon', P, 'plain'), w: 21, tone: 'i', caption: '오늘 들어오는 데이터' },
];

const edges = [
  { id: 'cr', from: 'client', to: 'router', via: 'r-l', tone: 'q', label: 'SQL' },
  { id: 'rb', from: 'router', to: 'broker', via: 'r-l', tone: 'q' },
  { id: 'bt', from: 'broker', to: 'tl', via: 'r-t', tone: 'q', label: 'lookup' },
  { id: 'sn', from: 'sql', to: 'native', via: 'b-t', tone: 'q', label: 'Calcite: SQL -> native', lx: 8 },
  { id: 'b1', from: 'broker', to: 'h1', via: 'b-t', cy: 18.5, tone: 'q' },
  { id: 'b2', from: 'broker', to: 'h2', via: 'b-t', cy: 18.5, tone: 'q' },
  { id: 'b3', from: 'broker', to: 'h3', via: 'b-t', cy: 18.5, tone: 'q', label: 'subqueries' },
  { id: 'bp', from: 'broker', to: 'peon', via: 'b-t', cy: 18.5, tone: 'q' },
];
const TO = { H1: 'b1', H2: 'b2', H3: 'b3', Peon: 'bp' };
const DATA = ['h1', 'h2', 'h3', 'peon'];
const TOP = ['client', 'router', 'broker'];

function serverPatch(P, mode, st) {
  return Object.fromEntries(SERVERS.map((srv) => [NODE[srv], { lines: serverLines(srv, P, mode, st) }]));
}

async function scatter(s, asg) {
  const hit = SERVERS.filter((srv) => asg.some((a) => a.srv === srv));
  await s.sendAll(hit.map((srv) => TO[srv]), { dur: 1.1 });
  hit.forEach((srv) => s.pulse(NODE[srv]));
  return hit;
}

export default {
  title: '쿼리의 여정',
  docs: [
    ['Query execution', 'https://druid.apache.org/docs/latest/querying/query-execution'],
    ['Query caching', 'https://druid.apache.org/docs/latest/querying/caching'],
    ['Mixed workloads', 'https://druid.apache.org/docs/latest/operations/mixed-workloads'],
  ],
  legend: [
    ['쿼리 경로, 쿼리할 세그먼트', 'q'],
    ['실시간 세그먼트', 'i'],
    ['걸러진 세그먼트', 'x'],
    ['캐시', 'g'],
  ],
  controls: [
    { id: 'days', label: '쿼리 기간', type: 'range', min: 1, max: 7, step: 1, value: 3, format: (v) => `최근 ${v}일` },
    { id: 'filter', label: "channel = '#ko.wikipedia'", type: 'toggle', value: true },
    { id: 'cache', label: '캐시 켜기 (Historical, Broker)', type: 'toggle', value: false },
  ],
  nodes,
  edges,
  steps: [
    {
      title: 'SQL 이 Broker 에 닿기까지',
      show: [...TOP, 'sql', 'native'],
      on: ['client', 'router', 'broker', 'sql', 'native', 'cr', 'rb', 'sn'],
      dim: false,
      body: `<p>클라이언트가 보낸 SQL 은 <b class="q">Router</b> 를 거쳐 <b class="q">Broker</b> 에 닿아요. Broker 는 Apache Calcite 로 SQL 을 해석해 <b>네이티브 쿼리</b>(JSON)로 바꿔요. <code>__time</code> 조건은 네이티브 쿼리의 <code>intervals</code> 가 돼요.</p>
      <p>이 장은 <code>wikipedia</code> 에서 한국어 위키의 날짜별 추가량을 묻는 쿼리를 따라가요. 오른쪽 칸 아래의 조작으로 기간, 필터, 캐시를 바꿀 수 있어요.</p>`,
      play: async (s) => {
        await s.send('cr', { dur: 0.9 });
        await s.send('rb', { dur: 0.8 });
        s.pulse('broker');
        await s.send('sn', { dur: 1.2, glyph: '{ }' });
        s.pulse('native');
        await s.wait(1.8);
      },
    },
    {
      title: 'Broker 의 타임라인',
      show: [...TOP, 'tl', ...DATA],
      on: ['broker', 'tl', 'bt'],
      dim: false,
      body: `<p>Broker 는 데이터소스마다 <b>타임라인</b>을 들고 있어요. 어느 구간에 어떤 세그먼트가 있고, 그 세그먼트를 <b>어느 서버가 들고 있는지</b>(Historical, 실시간 태스크) 적은 지도예요. 서버들이 무엇을 들고 있는지는 기본으로 HTTP 로 지켜봐요(<code>druid.serverview.type=http</code>).</p>
      <p>기본 보존 규칙이라 게시된 세그먼트마다 사본이 둘이에요(칸의 <code>H1 H2</code> 따위). 오늘(09-27) 데이터는 아직 게시 전이라 실시간 태스크(Peon)가 들고 있어요.</p>`,
      play: async (s) => {
        await s.send('bt', { dur: 1.1 });
        s.pulse('tl');
        await s.wait(2.4);
      },
    },
    {
      title: '먼저 시간으로 거르기',
      show: [...TOP, 'tl', ...DATA],
      on: ['tl', ...DATA],
      dim: false,
      patch: (P) => ({ tl: { lines: timeline(P, 'time') }, ...serverPatch(P, 'time') }),
      body: `<p>세그먼트는 늘 시간으로 나뉘어 있어서, Broker 는 쿼리 <code>intervals</code> 와 <b>겹치는 구간의 세그먼트만</b> 골라요. 이 가지치기(pruning)는 <b>언제나</b> 일어나요.</p>
      <p><b>쿼리 기간</b>을 바꿔 보세요. 기간 밖의 세그먼트는 흐려지고, 그것만 가진 서버에는 아무것도 가지 않아요. <code>__time</code> 조건이 가장 값싼 최적화인 까닭이에요.</p>`,
    },
    {
      title: '필터로 한 번 더 거르기',
      show: [...TOP, 'tl', ...DATA],
      on: ['tl', ...DATA],
      dim: false,
      patch: (P) => ({ tl: { lines: timeline(P, 'all') }, ...serverPatch(P, 'kept') }),
      body: `<p>이 데이터는 하루 안에서 <code>channel</code> 로 <b>범위 파티션</b>됐어요. p0 은 <code>'#ja'</code> 앞, p1 은 그 뒤예요. <code>channel = '#ko.wikipedia'</code> 필터가 있으면 Broker 는 p0 을 <b>열어 보지도 않고</b> 빼요(<code>secondaryPartitionPruning</code>, 기본 켜짐).</p>
      <p>range, single_dim 파티션과, 필터가 모든 파티션 차원을 덮는 hashed 파티션에서 돼요. 실시간 세그먼트는 이렇게 거르지 못해요. 필터를 꺼 보세요.</p>`,
    },
    {
      title: '사본 고르기와 흩어 보내기',
      show: [...TOP, 'tl', ...DATA],
      on: ['broker', ...DATA, 'b1', 'b2', 'b3', 'bp'],
      dim: false,
      patch: (P) => ({ tl: { lines: timeline(P, 'all') }, ...serverPatch(P, 'kept') }),
      hold: 10,
      body: `<p>남은 세그먼트마다 Broker 는 그것을 가진 서버 중 <b>한 곳</b>을 골라요. 기본은 무작위(<code>druid.broker.balancer.type=random</code>)이고, 사본이 여러 티어에 있으면 우선순위가 높은 티어를 골라요(<code>highestPriority</code>).</p>
      <p>그리고 서버마다 <b>하위 쿼리 하나</b>를 그 서버가 맡을 세그먼트 목록과 함께 보내요. 되풀이할 때마다 고르는 사본이 바뀌어요.</p>`,
      play: async (s) => {
        const asg = assignRandom(s.params);
        for (const srv of SERVERS) s.patch(NODE[srv], { lines: serverLines(srv, s.params, 'assign', { assign: asg }) });
        await s.wait(0.6);
        await scatter(s, asg);
        await s.wait(2.2);
      },
      gap: 0.4,
    },
    {
      title: '세그먼트마다 스레드 하나',
      show: [...TOP, 'tl', ...DATA],
      on: DATA,
      dim: false,
      patch: (P) => ({ tl: { lines: timeline(P, 'all') }, ...serverPatch(P, 'threads', { assign: assignFirst(P) }) }),
      hold: 11,
      body: `<p>데이터 서버는 맡은 세그먼트를 <b>병렬로</b> 처리해요. 처리 스레드 하나가 세그먼트 하나를 맡고(<code>druid.processing.numThreads</code>, 기본 코어 수 − 1), 세그먼트 안에서는 인덱스로 맞는 행을 찾아 필요한 행과 컬럼만 읽어요. 스레드보다 세그먼트가 많으면 차례를 기다려요.</p>
      <p>세그먼트마다 나온 <b>부분 결과</b>는 서버 안에서 먼저 합쳐져요. 예외는 <b>Scan</b> 쿼리로, 세그먼트를 스레드 하나가 차례대로 읽어요.</p>
      <p class="note">그림에서는 서버마다 스레드를 2개로 그렸어요. 기간을 늘리고 필터를 끄면 기다리는 세그먼트가 생겨요.</p>`,
      play: async (s) => {
        const asg = assignRandom(s.params);
        const prog = {};
        const st = { assign: asg, prog, done: false };
        const draw = () => SERVERS.forEach((srv) => s.patch(NODE[srv], { lines: serverLines(srv, s.params, 'threads', st) }));
        draw();
        await scatter(s, asg);
        // 서버마다 끝나지 않은 앞의 두 세그먼트가 스레드를 잡고 나아간다
        while (asg.some((a) => (prog[a.seg.id] ?? 0) < 1)) {
          for (const srv of SERVERS) {
            const mine = asg.filter((a) => a.srv === srv && (prog[a.seg.id] ?? 0) < 1).slice(0, 2);
            for (const a of mine) prog[a.seg.id] = Math.min(1, (prog[a.seg.id] ?? 0) + 0.05 + Math.random() * 0.05);
          }
          draw();
          await s.wait(0.12);
        }
        st.done = true;
        draw();
        DATA.forEach((id) => s.pulse(id));
        await s.wait(2.4);
      },
      gap: 0.3,
    },
    {
      title: '모아서 합치기',
      show: [...TOP, 'tl', ...DATA, 'result'],
      on: ['broker', 'result', 'client', 'b1', 'b2', 'b3', 'bp', 'rb', 'cr'],
      dim: false,
      hold: 12,
      patch: (P) => ({ tl: { lines: timeline(P, 'all') }, ...serverPatch(P, 'threads', { assign: assignFirst(P), done: true }) }),
      body: `<p>서버들이 돌려준 부분 결과를 Broker 가 <b>합쳐</b> 최종 답을 만들어요(기본으로 전용 ForkJoin 풀에서 병렬로 합쳐요). Timeseries, Scan, 그리고 정렬 없는 GroupBy 는 합치는 대로 <b>흘려보내고</b>, 그 밖의 쿼리는 다 계산한 뒤 돌려줘요.</p>
      <p>이렇게 흩어 보내고(scatter) 모아 합치는(gather) 방식이 Druid 쿼리의 기본 모양이에요.</p>`,
      play: async (s) => {
        const asg = assignRandom(s.params);
        SERVERS.forEach((srv) => s.patch(NODE[srv], { lines: serverLines(srv, s.params, 'threads', { assign: asg, done: true }) }));
        s.state('result', 'hidden');
        const hit = SERVERS.filter((srv) => asg.some((a) => a.srv === srv));
        await s.wait(0.5);
        await s.sendAll(hit.map((srv) => TO[srv]), { dur: 1.2, reverse: true, glyph: '◆' });
        s.pulse('broker');
        await s.wait(0.4);
        s.state('result', null);
        s.pulse('result');
        await s.send('rb', { dur: 0.7, reverse: true, glyph: '◆' });
        await s.send('cr', { dur: 0.7, reverse: true, glyph: '◆' });
        s.pulse('client');
        await s.wait(2.4);
      },
      gap: 0.3,
    },
    {
      title: '캐시: 세그먼트 결과와 쿼리 결과',
      show: [...TOP, 'tl', ...DATA, 'rcache'],
      on: ['broker', 'rcache', ...DATA, 'b1', 'b2', 'b3', 'bp'],
      dim: false,
      hold: 16,
      patch: (P) => ({ tl: { lines: timeline(P, 'all') }, ...serverPatch(P, 'cache', { assign: assignFirst(P), hits: [] }) }),
      body: `<p><b>세그먼트 단위 캐시</b>는 세그먼트별 부분 결과를 담아요. Historical, 태스크, Broker 에 둘 수 있고, 공식 예제 설정은 Historical 에서 켜 둬요(설정 기본값은 꺼짐). 같은 모양의 쿼리가 다시 오면 계산 없이 꺼내요.</p>
      <p><b>전체 쿼리 결과 캐시</b>는 Broker 에만 있고 기본은 꺼짐이에요. 실시간 데이터가 섞인 쿼리는 새 데이터가 계속 무효로 만들어 도움이 적어요. 실시간 세그먼트는 Broker 가 캐시하지 않아요. <b>캐시 켜기</b>를 눌러 보세요.</p>`,
      play: async (s) => {
        const P = s.params;
        const asg = assignRandom(P);
        const hits = [];
        const draw = () => SERVERS.forEach((srv) => s.patch(NODE[srv], { lines: serverLines(srv, P, 'cache', { assign: asg, hits }) }));
        for (let round = 0; round < 2; round++) {
          draw();
          s.pulse('broker');
          if (P.cache) s.pulse('rcache');
          await scatter(s, asg);
          await s.wait(round === 0 || !P.cache ? 1.4 : 0.3); // 계산하거나, 캐시에서 곧장
          if (round === 0 && P.cache) {
            // 처음 계산한 결과를 캐시에 넣는다(게시된 세그먼트만)
            asg.filter((a) => a.seg !== LIVE).forEach((a) => hits.push(a.seg.id));
          }
          const back = SERVERS.filter((srv) => asg.some((a) => a.srv === srv));
          await s.sendAll(back.map((srv) => TO[srv]), { dur: 1, reverse: true, glyph: '◆' });
          s.pulse('broker');
          draw();
          await s.wait(1.2);
        }
        await s.wait(1.5);
      },
      gap: 0.3,
    },
    {
      title: '우선순위, 레인, 한도',
      show: [...TOP, 'tl', ...DATA, 'sched'],
      on: ['broker', 'sched'],
      hold: 13,
      body: `<p>쿼리 하나는 Broker 의 HTTP 스레드 하나를 써요. 무거운 쿼리가 스레드를 다 차지하지 않게 <b>레인</b>을 둘 수 있어요(기본은 레인 없음). <code>hilo</code> 전략은 우선순위(<code>priority</code>, 기본 0)가 0 보다 낮은 쿼리를 <code>low</code> 레인에 넣고, 그 레인이 쓸 스레드를 <code>maxLowPercent</code> 로 묶어요. 넘치면 <b>HTTP 429</b> 로 거절해요.</p>
      <p class="note">다른 안전장치도 있어요: 쿼리 타임아웃 기본 300초(<code>druid.server.http.defaultQueryTimeout</code>), 서브쿼리 결과는 기본 100,000 행까지(<code>maxSubqueryRows</code>).</p>`,
      play: async (s) => {
        const slots = [];
        const draw = (extra = {}) => s.patch('sched', { lines: SCHED({ slots, ...extra }) });
        draw();
        const arrive = async (kind) => {
          s.pulse('broker');
          await s.send('rb', { dur: 0.6, glyph: kind === 'l' ? 'l' : 'q' });
          const lows = slots.filter((k) => k === 'l').length;
          if (kind === 'l' && lows >= 2) {
            draw({ reject: true });
            await s.wait(1.4);
            draw();
            return;
          }
          const free = slots.findIndex((k) => !k);
          if (free >= 0) slots[free] = kind;
          else slots.push(kind);
          draw({ msg: kind === 'l' ? 'priority < 0 -> low lane' : 'priority 0 -> interactive' });
          s.pulse('sched');
          await s.wait(0.5);
        };
        for (const k of ['h', 'l', 'h', 'l', 'l']) await arrive(k);
        await s.wait(1.2);
        slots.length = 0;
        draw({ msg: 'queries finished, threads free' });
        await s.wait(1.4);
      },
      gap: 0.4,
    },
  ],
};
