/*
 * 14 Coordinator 와 Historical
 *
 * 위 줄: 메타데이터 저장소(druid_segments 표), Coordinator(리더, 실행마다 할 일
 * 다섯), 대기 Coordinator, ZooKeeper, 딥 스토리지. 가운데: Historical 티어(처음엔
 * _default_tier 하나, 티어 단계에서는 hot 과 _default_tier 둘). 아래: Broker 의
 * 타임라인. 왼쪽 아래: 보존 규칙.
 *
 * 세그먼트는 날짜로 부른다: [23] = wikipedia 09-23 청크의 세그먼트, [24*] = 다시 쓴 새 버전.
 */
import { c, table } from '../ascii.js';

const DUTIES = ['poll used segments', 'match rules', 'assign + load', 'balance (cost)', 'unload overshadowed'];

/** Coordinator 상자: 실행마다 할 일 다섯(active 번째가 지금 하는 일)과 아래 한 줄의 상태. */
function coordLines(active = -1, status = ' ') {
  return [c('d', 'every PT60S (period)'), '---', ...DUTIES.map((d, i) => (i === active ? c('m', `> ${d}`) : `  ${d}`)), '---', status];
}

/**
 * Historical 상자: 캐시에 든 세그먼트(한 줄에 셋, 두 줄)와 적재 큐.
 * segs 의 항목은 '23' 이거나 [이름, 색]. 줄 수를 늘 같게 해 상자 크기가 흔들리지 않게 한다.
 */
function histLines(segs, queue = '-') {
  const row = (list) => {
    const out = [];
    list.forEach((s, i) => {
      if (i) out.push(' ');
      const [name, tone] = Array.isArray(s) ? s : [s, null];
      out.push(tone ? c(tone, `[${name}]`) : `[${name}]`);
    });
    return out.length ? out : ' ';
  };
  return ['cache:', segs.length ? row(segs.slice(0, 3)) : c('d', '(empty)'), row(segs.slice(3)), Array.isArray(queue) ? queue : c('d', `queue: ${queue}`)];
}

const metaRows = (rows) => table(['segment', 'used', 'loadSpec'], rows.map(([seg, used, spec]) => [seg, used === 1 ? c('g', '1') : used === 0 ? c('x', '0') : used, spec]));
const META_BASE = [
  ['09-23 v1', 1, 's3://…/0923'],
  ['09-24 v1', 1, 's3://…/0924'],
  ['09-25 v1', 1, 's3://…/0925'],
];

const timeline = (rows) => rows.map(([day, servers, tone]) => (tone ? [c(tone, day), '  ', c(tone, servers)] : [day, '  ', servers]));
const TL_BASE = [
  ['09-23', 'h1 h2'],
  ['09-24', 'h2 h3'],
  ['09-25', 'h1 h3'],
];

const RULES_DEFAULT = [c('d', 'wikipedia: (no rules)'), '---', c('d', '_default (cluster):'), [c('b', '1 '), 'loadForever'], '  {_default_tier: 2}'];
const RULES_TIERED = [c('d', 'wikipedia:'), [c('b', '1 '), 'loadForever'], '  {hot: 1,', '   _default_tier: 1}', '---', c('d', '_default: loadForever x2')];

const HIST_X = [37, 60, 81];

const nodes = [
  { id: 'meta', x: 0, y: 1, title: 'druid_segments', lines: metaRows(META_BASE), tone: 'p', frame: 'round', caption: '메타데이터 저장소', w: 31 },
  { id: 'rules', x: 0, y: 12, title: 'rules', lines: RULES_DEFAULT, tone: 'p', frame: 'round', caption: '보존 규칙(druid_rules)', w: 23 },
  { id: 'coord', x: 44, y: 1, title: 'Coordinator', tag: 'leader', lines: coordLines(), tone: 'm' },
  { id: 'standby', x: 74, y: 2, title: 'Coordinator', tag: 'standby', lines: ['redirects to', 'the leader'], tone: 'd', frame: 'dashed', caption: '대기 중' },
  { id: 'zk', x: 103, y: 2, title: 'ZooKeeper', lines: ['leader latch'], tone: 'y', frame: 'round', caption: '리더 선출' },
  { id: 'deep', x: 106, y: 7, title: 'deep storage', lines: ['every file:', c('g', '23 24 25'), c('d', 'loadSpec → here')], tone: 'g', frame: 'round' },

  { id: 'tierAll', type: 'frame', x: 34, y: 17, cols: 68, rows: 10, title: '', tone: 'i', caption: 'tier: _default_tier' },
  { id: 'tierHot', type: 'frame', x: 34, y: 17, cols: 24, rows: 10, title: '', tone: 'q', caption: 'tier: hot' },
  { id: 'tierDef', type: 'frame', x: 58, y: 17, cols: 44, rows: 10, title: '', tone: 'i', caption: 'tier: _default_tier' },
  { id: 'h1', x: HIST_X[0], y: 19, title: 'Historical h1', lines: histLines(['23', '25']), tone: 'i', w: 17 },
  { id: 'h2', x: HIST_X[1], y: 19, title: 'Historical h2', lines: histLines(['23', '24']), tone: 'i', w: 17 },
  { id: 'h3', x: HIST_X[2], y: 19, title: 'Historical h3', lines: histLines(['24', '25']), tone: 'i', w: 17 },

  { id: 'broker', x: 37, y: 29, title: 'Broker', tag: 'timeline', lines: timeline(TL_BASE), tone: 'q', caption: '쿼리 보낼 서버 고르기', w: 20 },
  {
    id: 'mmap',
    type: 'note',
    x: 64,
    y: 29,
    cols: 36,
    rows: 4,
    tone: 'i',
    html: '<b>세그먼트 캐시</b>는 로컬 디스크의 파일을 <b>메모리 매핑</b>해서 써요. 자주 읽는 부분은 OS 페이지 캐시에 올라 있고, 나머지는 디스크에서 읽어요(JVM 힙에 싣지 않아요).',
  },
  // 그림 아래 여백(화면 맞춤에 넣어, 아래쪽 범례가 이름표를 가리지 않게)
  { id: 'pad', type: 'text', x: 0, y: 39, lines: [' '] },
];

const edges = [
  { id: 'poll', from: 'meta', to: 'coord', via: 'r-l', tone: 'p', label: 'poll PT1M' },
  { id: 'rule', from: 'rules', to: 'coord', via: 'rt-lb', cx: 38.5, tone: 'p', label: 'first match' },
  { id: 'c1', from: 'coord', to: 'h1', via: 'b-t', cy: 13.6, tone: 'm' },
  { id: 'c2', from: 'coord', to: 'h2', via: 'b-t', cy: 13.6, tone: 'm', label: 'HTTP load / drop' },
  { id: 'c3', from: 'coord', to: 'h3', via: 'b-t', cy: 13.6, tone: 'm' },
  { id: 'd1', from: 'deep', to: 'h1', via: 'b-tr', cy: 15.1, tone: 'g' },
  { id: 'd2', from: 'deep', to: 'h2', via: 'b-tr', cy: 15.1, tone: 'g' },
  { id: 'd3', from: 'deep', to: 'h3', via: 'b-tr', cy: 15.1, tone: 'g', label: 'download' },
  { id: 'a1', from: 'h1', to: 'broker', via: 'b-t', cy: 27.6, tone: 'q' },
  { id: 'a2', from: 'h2', to: 'broker', via: 'b-t', cy: 27.6, tone: 'q', label: 'announce' },
  { id: 'a3', from: 'h3', to: 'broker', via: 'b-t', cy: 27.6, tone: 'q' },
  { id: 'lz1', from: 'coord', to: 'zk', via: 't-tl', tone: 'y' },
  { id: 'lz2', from: 'standby', to: 'zk', via: 't-t', tone: 'y' },
];

const SINGLE = ['meta', 'rules', 'coord', 'standby', 'zk', 'deep', 'tierAll', 'h1', 'h2', 'h3', 'broker', 'pad'];
const TIERED = ['meta', 'rules', 'coord', 'standby', 'zk', 'deep', 'tierHot', 'tierDef', 'h1', 'h2', 'h3', 'broker', 'pad'];

// 새로 게시된 09-26 이 h1, h3 에 실린 뒤의 모습
const AFTER26 = {
  meta: { lines: metaRows([...META_BASE, ['09-26 v1', 1, 's3://…/0926']]) },
  deep: { lines: ['every file:', c('g', '23 24 25 26'), c('d', 'loadSpec → here')] },
  h1: { lines: histLines(['23', '25', '26']) },
  h3: { lines: histLines(['24', '25', '26']) },
  broker: { lines: timeline([...TL_BASE, ['09-26', 'h1 h3']]) },
};

export default {
  title: 'Coordinator 와 Historical',
  docs: [
    ['Coordinator', 'https://druid.apache.org/docs/latest/design/coordinator'],
    ['Historical', 'https://druid.apache.org/docs/latest/design/historical'],
    ['Coordinator configuration', 'https://druid.apache.org/docs/latest/configuration/#coordinator'],
  ],
  legend: ['control', 'storage', 'meta', 'query', 'zk'],
  nodes,
  edges,
  steps: [
    {
      title: 'Coordinator: 세그먼트의 자리를 정하는 곳',
      show: SINGLE,
      on: ['coord'],
      dim: false,
      edges: [],
      body: `<p><b class="m">Coordinator</b> 는 어떤 세그먼트를 어느 <b class="i">Historical</b> 에 둘지 정해요. 새 세그먼트를 싣고, 낡은 것을 내리고, 복제본 수를 맞추고, 서버 사이의 균형을 잡아요.</p>
      <p>일은 주기적으로 해요(<code>druid.coordinator.period</code>, 기본 <code>PT60S</code>). 실행마다 "실려 있어야 할 세그먼트"와 "지금 실린 세그먼트"를 견주어 차이를 메워요. <b>쿼리에는 끼지 않아요.</b></p>
      <p class="note">리더가 된 뒤 바로 움직이지 않고, 클러스터 상태를 모을 시간을 둬요(<code>druid.coordinator.startDelay</code>, 기본 <code>PT300S</code>).</p>`,
      play: async (s) => {
        for (let k = 0; k < DUTIES.length; k++) {
          s.patch('coord', { lines: coordLines(k) });
          await s.wait(1.1);
        }
        s.patch('coord', { lines: coordLines() });
        await s.wait(0.8);
      },
      gap: 0.2,
    },
    {
      title: '실어야 할 목록: used 세그먼트',
      show: SINGLE,
      on: ['meta', 'coord', 'poll'],
      focus: ['meta', 'coord', 'rules'],
      body: `<p>게시된 세그먼트는 메타데이터 저장소의 <code>druid_segments</code> 표에 한 줄씩 있어요. <code>used = 1</code> 이면 "클러스터에 실려 있어야 할" 세그먼트이고, <code>payload</code> 의 <code>loadSpec</code> 에 딥 스토리지 위치가 적혀 있어요.</p>
      <p>Coordinator 는 이 목록을 기본 1분마다(<code>druid.manager.segments.pollDuration</code> = <code>PT1M</code>) 새로 읽어서, 방금 게시된 <b>09-26</b> 세그먼트를 알아채요.</p>`,
      play: async (s) => {
        s.reset();
        await s.wait(1);
        s.patch('meta', { lines: metaRows([...META_BASE, [c('g', '09-26 v1'), 1, c('g', 's3://…/0926')]]) });
        s.pulse('meta');
        await s.wait(1);
        s.patch('coord', { lines: coordLines(0) });
        await s.send('poll', { dur: 1.2, glyph: '≡' });
        s.pulse('coord');
        await s.wait(2.4);
      },
      gap: 0.4,
    },
    {
      title: '규칙에 대 보기: 처음 맞는 규칙 하나',
      show: SINGLE,
      on: ['rules', 'coord', 'rule'],
      focus: ['meta', 'coord', 'rules'],
      patch: { meta: AFTER26.meta },
      body: `<p>Coordinator 는 쓰는(used) 세그먼트마다 보존 규칙을 <b>위에서부터</b> 대 보고, <b>처음 맞는 규칙 하나</b>만 따라요. 데이터소스의 규칙 뒤에는 클러스터 기본 규칙(<code>_default</code>)이 붙어요.</p>
      <p>기본 규칙은 <code>loadForever</code>, <code>{"_default_tier": 2}</code> 예요. 규칙을 따로 두지 않으면 모든 세그먼트가 기본 티어에 <b>복제본 2개</b>로 실려요. 규칙은 <code>druid_rules</code> 표에 저장돼요.</p>`,
      play: async (s) => {
        s.patch('coord', { lines: coordLines(1) });
        s.pulse('rules');
        await s.send('rule', { dur: 1.2, glyph: '1' });
        s.pulse('coord');
        await s.wait(2.2);
      },
      gap: 0.6,
    },
    {
      title: '싣기: 지시는 HTTP 로, 파일은 딥 스토리지에서',
      show: [...SINGLE, 'mmap'],
      on: ['coord', 'h1', 'h3', 'deep', 'broker', 'c1', 'c3', 'd1', 'd3', 'a1', 'a3', 'tierAll'],
      focus: ['coord', 'deep', 'tierAll', 'broker', 'mmap', 'pad'],
      patch: { meta: AFTER26.meta, deep: AFTER26.deep },
      hold: 12,
      body: `<p>Coordinator 는 복제본이 모자란 세그먼트를 Historical 에 배정하고(기본 "스마트 적재": 먼저 돌아가며 배정하고 균형은 나중에), 그 서버의 <b>적재 큐</b>에 싣기 요청을 <b>HTTP</b> 로 보내요. Historical 끼리는 서로 말하지 않아요.</p>
      <p>Historical 은 <code>loadSpec</code> 대로 딥 스토리지에서 파일을 받아 <b>세그먼트 캐시</b>(<code>druid.segmentCache.locations</code>)에 둬요. 동시에 받는 수는 <code>numLoadingThreads</code>(기본 코어 수 / 6, 최소 1)예요. 가졌다고 알리면 Broker 의 타임라인에 오르고, 그때부터 쿼리가 와요.</p>`,
      play: async (s) => {
        s.reset();
        s.patch('coord', { lines: coordLines(2) });
        await s.wait(0.6);
        await s.sendAll(['c1', 'c3'], { dur: 1.1, glyph: '▸' });
        s.patch('h1', { lines: histLines(['23', '25'], [c('m', 'queue: [26]')]) });
        s.patch('h3', { lines: histLines(['24', '25'], [c('m', 'queue: [26]')]) });
        await s.wait(0.6);
        await s.sendAll(['d1', 'd3'], { dur: 1.3, glyph: '[26]' });
        s.patch('h1', { lines: histLines(['23', '25', ['26', 'g']]) });
        s.patch('h3', { lines: histLines(['24', '25', ['26', 'g']]) });
        s.pulse('h1');
        s.pulse('h3');
        await s.wait(0.6);
        await s.sendAll(['a1', 'a3'], { dur: 1.1, glyph: '!' });
        s.patch('broker', { lines: timeline([...TL_BASE, ['09-26', 'h1 h3', 'g']]) });
        s.pulse('broker');
        await s.wait(3);
      },
      gap: 0.3,
    },
    {
      title: '복제본과 티어',
      show: TIERED,
      on: ['rules', 'tierHot', 'tierDef', 'h1', 'h2', 'h3'],
      dim: false,
      patch: {
        rules: { lines: RULES_TIERED },
        meta: AFTER26.meta,
        deep: AFTER26.deep,
        h1: { lines: histLines([['23', 'q'], ['24', 'q'], ['25', 'q'], ['26', 'q']]), tone: 'q' },
        h2: { lines: histLines(['23', '24', '26']) },
        h3: { lines: histLines(['24', '25']) },
        broker: { lines: timeline([['09-23', 'h1 h2'], ['09-24', 'h1 h3'], ['09-25', 'h1 h3'], ['09-26', 'h1 h2']]) },
      },
      hold: 10,
      body: `<p>Historical 마다 <b>티어</b>가 있어요(<code>druid.server.tier</code>, 기본 <code>_default_tier</code>). 규칙의 <code>tieredReplicants</code> 로 티어마다 복제본 수를 정해요. 여기서는 공식 문서의 예처럼 <code>{"hot": 1, "_default_tier": 1}</code>, 곧 hot 티어에 하나, 기본 티어에 하나예요.</p>
      <p>같은 세그먼트의 복제본은 서로 다른 서버에 놓여요. 새 티어는 그 티어를 가리키는 로드 규칙이 생기기 전까지 비어 있어요. Broker 는 기본으로 우선순위(<code>druid.server.priority</code>)가 가장 높은 티어의 사본에 쿼리를 보내요.</p>`,
      play: async (s) => {
        s.pulse('rules');
        await s.wait(1.2);
        s.pulse('h1');
        await s.wait(0.9);
        s.pulse('h2');
        s.pulse('h3');
        await s.wait(3);
      },
    },
    {
      title: '균형 잡기: cost 전략',
      show: SINGLE.filter((id) => id !== 'broker' && id !== 'pad'),
      on: ['coord', 'h1', 'h2', 'h3', 'deep', 'c2', 'd2', 'tierAll'],
      focus: ['coord', 'deep', 'tierAll'],
      patch: {
        meta: AFTER26.meta,
        deep: AFTER26.deep,
        h1: { lines: histLines([['23', 'x'], ['24', 'x'], ['25', 'x'], ['26', 'x']]) },
        h2: { lines: histLines(['23', '26']) },
        h3: { lines: histLines(['24', '25']) },
      },
      hold: 13,
      body: `<p>기본 밸런서 <code>cost</code> 는 세그먼트를 둘 서버마다 비용을 세요. 그 서버에 이미 있는 세그먼트와 구간이 <b>겹치거나 이웃할수록</b> 비싸요. 한 쿼리에 함께 쓰일 이웃 구간이 한 서버에 몰리면(여기선 h1 에 23~26) 그 서버만 바빠지기 때문이에요.</p>
      <p>실행마다 몇 개씩 옮겨요(스마트 적재의 <code>maxSegmentsToMove</code>: 쓰는 세그먼트의 2%, 100~1000). 옮길 때도 새 서버가 딥 스토리지에서 받아 실은 뒤 옛 서버에서 내려요. <code>decommissioningNodes</code> 에 넣은 서버도 이렇게 비워져요.</p>`,
      play: async (s) => {
        s.reset();
        s.patch('coord', { lines: coordLines(3, c('x', 'h1: 23-26 adjacent')) });
        await s.wait(1.6);
        s.patch('coord', { lines: coordLines(3, c('m', 'move [25] h1 -> h2')) });
        await s.send('c2', { dur: 1, glyph: '▸' });
        await s.send('d2', { dur: 1.3, glyph: '[25]' });
        s.patch('h2', { lines: histLines(['23', ['25', 'g'], '26']) });
        s.pulse('h2');
        await s.wait(0.8);
        s.patch('h1', { lines: histLines(['23', '24', '26']) });
        s.pulse('h1');
        await s.wait(3);
      },
      gap: 0.3,
    },
    {
      title: '가려진 세그먼트 정리',
      show: SINGLE,
      on: ['meta', 'coord', 'h2', 'h3', 'broker', 'poll', 'c2', 'c3'],
      focus: ['meta', 'coord', 'tierAll', 'broker', 'pad'],
      patch: {
        deep: { lines: ['every file:', c('g', '23 24 24* 25 26'), c('d', 'loadSpec → here')] },
        broker: { lines: timeline([['09-23', 'h1 h2'], ['09-24', 'h2 h3'], ['09-25', 'h1 h3'], ['09-26', 'h1 h3']]) },
        h1: { lines: histLines(['23', '25', '26']) },
      },
      hold: 13,
      body: `<p>09-24 청크를 다시 써서 <b>새 버전(24*)</b>이 게시되면 Coordinator 는 그것을 실어요. 새 버전이 실려 쿼리가 넘어가면, 옛 버전은 <b>가려진(overshadowed)</b> 세그먼트가 돼서 <code>used = 0</code> 으로 표시되고, <b>다음 실행</b>에서 Historical 에서 내려져요.</p>
      <p>파일은 딥 스토리지에 남아요(지우려면 kill). Coordinator 는 리더가 된 지 15분(<code>millisToWaitBeforeDeleting</code>)이 지나야 이 정리를 시작해요.</p>`,
      play: async (s) => {
        s.reset();
        s.patch('meta', { lines: metaRows([...META_BASE, ['09-26 v1', 1, 's3://…/0926'], [c('g', '09-24 v2'), 1, c('g', 's3://…/0924b')]]) });
        s.patch('h2', { lines: histLines(['23', '24']) });
        s.patch('h3', { lines: histLines(['24', '25', '26']) });
        await s.wait(0.8);
        s.patch('coord', { lines: coordLines(2) });
        await s.send('poll', { dur: 1, glyph: '≡' });
        await s.sendAll(['c2', 'c3'], { dur: 1, glyph: '▸' });
        s.patch('h2', { lines: histLines(['23', '24', ['24*', 'g']]) });
        s.patch('h3', { lines: histLines(['24', ['24*', 'g'], '25', '26']) });
        s.patch('broker', { lines: timeline([['09-23', 'h1 h2'], ['09-24*', 'h2 h3', 'g'], ['09-25', 'h1 h3'], ['09-26', 'h1 h3']]) });
        await s.wait(1.4);
        s.patch('coord', { lines: coordLines(4) });
        s.patch('meta', { lines: metaRows([['09-23 v1', 1, 's3://…/0923'], [c('d', '09-24 v1'), 0, c('d', 's3://…/0924')], ['09-25 v1', 1, 's3://…/0925'], ['09-26 v1', 1, 's3://…/0926'], ['09-24 v2', 1, 's3://…/0924b']]) });
        s.pulse('meta');
        await s.wait(1.2);
        await s.sendAll(['c2', 'c3'], { dur: 1, glyph: 'x' });
        s.patch('h2', { lines: histLines(['23', '24*']) });
        s.patch('h3', { lines: histLines(['24*', '25', '26']) });
        s.pulse('h2');
        s.pulse('h3');
        await s.wait(3);
      },
      gap: 0.3,
    },
    {
      title: 'Historical 이 쓰러지면',
      show: SINGLE,
      on: ['coord', 'h1', 'h3', 'deep', 'broker', 'zk', 'c1', 'c3', 'd1', 'd3', 'lz1', 'lz2', 'standby'],
      focus: ['coord', 'zk', 'deep', 'tierAll', 'broker', 'pad'],
      patch: { meta: AFTER26.meta, deep: AFTER26.deep, h1: AFTER26.h1, h3: AFTER26.h3, broker: AFTER26.broker },
      hold: 16,
      body: `<p>Historical 이 멈추면 Coordinator 는 그 서버의 세그먼트를 빠진 것으로 보지만, <b>바로 다시 배정하지는 않아요</b>. 수명이 있는 임시 목록에 두었다가, 그 사이 서버가 돌아오면 제 캐시로 곧장 다시 답하게 두고, 끝내 안 오면 남은 Historical 에 다시 실어요. 그동안에는 다른 복제본이 답해요.</p>
      <p>Coordinator 는 여러 대를 띄워도 ZooKeeper 로 뽑힌 <b>리더</b> 한 대만 일해요. 모두 멈춰도 클러스터는 돌아가요. 세그먼트 배치만 바뀌지 않을 뿐이에요.</p>`,
      play: async (s) => {
        s.reset();
        await s.wait(1);
        s.state('h2', 'warn');
        s.patch('h2', { lines: ['cache:', c('x', 'x offline'), ' ', c('d', 'queue: -')] });
        s.patch('broker', { lines: timeline([['09-23', 'h1 --', 'x'], ['09-24', '-- h3', 'x'], ['09-25', 'h1 h3'], ['09-26', 'h1 h3']]) });
        await s.wait(1.2);
        const life = ['#####', '####.', '###..', '##...', '#....'];
        for (const l of life) {
          s.patch('coord', { lines: coordLines(2, [c('d', 'h2 lifetime '), c('x', l)]) });
          await s.wait(0.55);
        }
        s.patch('coord', { lines: coordLines(2, c('m', 'reassign [23] [24]')) });
        await s.sendAll(['c1', 'c3'], { dur: 1, glyph: '▸' });
        await s.sendAll(['d1', 'd3'], { dur: 1.3, glyph: '[s]' });
        s.patch('h1', { lines: histLines(['23', '25', '26', ['24', 'g']]) });
        s.patch('h3', { lines: histLines(['24', '25', '26', ['23', 'g']]) });
        s.patch('broker', { lines: timeline([['09-23', 'h1 h3', 'g'], ['09-24', 'h3 h1', 'g'], ['09-25', 'h1 h3'], ['09-26', 'h1 h3']]) });
        s.pulse('h1');
        s.pulse('h3');
        await s.wait(3.4);
      },
      gap: 0.3,
    },
  ],
};
