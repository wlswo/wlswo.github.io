/*
 * 12 조인과 룩업
 *
 * 위 줄: Coordinator(룩업 설정) 밑으로 쿼리를 받는 서버 다섯(Router, Broker,
 * Historical ×2, Peon). 모두 룩업 사본을 메모리에 들고 있다.
 * 아래 칸(y 14~)은 단계마다 바뀐다: LOOKUP 이 행마다 값을 바꾸는 모습, 플래너의
 * 재작성, 브로드캐스트 해시 조인, 서브쿼리 인라인, 조인 트리, MSQ sortMerge.
 */
import { c, table } from '../ascii.js';

const SW = 18; // 서버 상자 안쪽 폭
const SERVER_X = [0, 24, 48, 72, 96];
const LOADED = c('y', '[channel_lang]');
const EMPTY = c('d', '[ ...        ]');

const server = (id, i, title, role, tone) => ({ id, x: SERVER_X[i], y: 8, title, lines: [LOADED, role], w: SW, tone });

// LOOKUP 을 보여 줄 세그먼트의 행
const ROWS = [
  ['09:00', '#ko.wikipedia', '31'],
  ['09:01', '#en.wikipedia', '12'],
  ['09:02', '#ja.wikipedia', '7'],
  ['09:04', '#ko.wikipedia', '18'],
  ['09:05', '#fr.wikipedia', '4'],
];
const MAP = [
  ['#ko.wikipedia', 'Korean'],
  ['#en.wikipedia', 'English'],
  ['#ja.wikipedia', 'Japanese'],
  ['#fr.wikipedia', 'French'],
];
const LANG = Object.fromEntries(MAP);

const segLines = (hot = -1) =>
  table(
    ['__time', 'channel', 'added'],
    ROWS.map((r, k) => (k === hot ? r.map((v) => c('q', v)) : r)),
    { align: ['left', 'left', 'right'] },
  );
const mapLines = (hot = null) => table(['key', 'value'], MAP.map(([k, v]) => (k === hot ? [c('y', k), c('y', v)] : [k, v])));
const outLines = (n = ROWS.length) =>
  table(
    ['lang', 'added'],
    ROWS.map((r, k) => (k < n ? [c(k === n - 1 ? 'y' : 'n', LANG[r[1]]), r[2]] : [c('d', '.'), c('d', '.')])),
    { align: ['left', 'right'] },
  );

const REVERSE = [
  "WHERE LOOKUP(channel, 'channel_lang') = 'Korean'",
  c('d', '          │  rewritten by the SQL planner'),
  c('d', '          ▼'),
  ['WHERE ', c('i', "channel = '#ko.wikipedia'")],
  c('d', '-> the filter can use the index of channel'),
];
const PULLUP = [
  "GROUP BY LOOKUP(channel, 'channel_lang')",
  c('d', '          │  lookup is injective'),
  c('d', '          ▼'),
  ['GROUP BY ', c('i', 'channel')],
  c('d', '-> LOOKUP runs after the GROUP BY'),
];

const JOIN_SQL = [
  [c('b', 'SELECT'), ' l.v AS lang, SUM(w.added)'],
  [c('b', 'FROM'), ' ', c('i', 'wikipedia'), ' w'],
  [c('b', 'JOIN'), ' ', c('y', 'lookup.channel_lang'), ' l'],
  ['  ', c('b', 'ON'), ' w.channel = l.k'],
  [c('b', 'GROUP BY'), ' 1'],
];

const TREE = [
  [c('b', 'join'), ' ─┬─ ', c('b', 'join'), ' ─┬─ ', c('i', 'wikipedia'), '            ', c('d', '<- base (bottom-left)')],
  ['      │        └─ ', c('y', 'lookup.channel_lang'), '  ', c('d', '<- leaf')],
  ['      └─ ', c('y', 'query (subquery)'), '             ', c('d', '<- leaf -> inline')],
];

const nodes = [
  { id: 'coord', x: 48, y: 0, title: 'Coordinator', lines: ['lookup config', c('d', 'tier: __default')], w: SW, tone: 'm', caption: '룩업 설정, 배포' },
  server('router', 0, 'Router', 'routes queries', 'q'),
  server('broker', 1, 'Broker', 'plans, merges', 'q'),
  server('hist1', 2, 'Historical 1', 'wikipedia segs', 'i'),
  server('hist2', 3, 'Historical 2', 'wikipedia segs', 'i'),
  server('peon', 4, 'Peon', 'realtime rows', 'i'),

  // 2. LOOKUP 이 행마다
  { id: 'seg', x: 0, y: 15, title: 'Historical 1, scan wikipedia', lines: segLines(), tone: 'i', caption: '기본 테이블의 세그먼트' },
  { id: 'map', x: 42, y: 15, title: 'lookup channel_lang', tag: 'in memory', lines: mapLines(), tone: 'y', frame: 'round', caption: '룩업: 키 → 값' },
  { id: 'out', x: 84, y: 15, title: 'LOOKUP(channel)', lines: outLines(0), tone: 'q', caption: '바꾼 결과' },

  // 3. 재작성
  { id: 'rw1', x: 0, y: 15, title: 'reverse lookup', lines: REVERSE, tone: 'q', caption: '거꾸로 찾기: 인덱스를 써요' },
  { id: 'rw2', x: 57, y: 15, title: 'pull up', tag: 'injective', lines: PULLUP, tone: 'q', caption: '끌어올리기: 집계 뒤로 미뤄요' },

  // 4. 브로드캐스트 해시 조인
  { id: 'jsql', x: 0, y: 15, title: 'SQL', lines: JOIN_SQL, tone: 'n', caption: '룩업에 JOIN' },
  {
    id: 'plan',
    x: 46,
    y: 15,
    title: 'broadcast hash join',
    lines: [
      [c('i', 'base (left) '), ': wikipedia -> scattered by time'],
      [c('y', 'right       '), ': lookup | inline | query'],
      [c('d', '              must fit in memory')],
      '---',
      'each server scans its segments',
      'and matches every row in memory',
    ],
    tone: 'q',
    caption: '네이티브 조인의 방식',
  },

  // 5. 서브쿼리 → 인라인
  {
    id: 'subq',
    x: 20,
    y: 16,
    title: 'inline, subquery result',
    lines: [...table(['user', 'edits'], [['alice', '42'], ['bob', '37'], ['carol', '29']], { align: ['left', 'right'] }), c('d', '<= maxSubqueryRows 100,000')],
    tone: 'y',
    frame: 'round',
    caption: 'Broker 메모리의 결과',
  },

  // 6. 조인 트리
  { id: 'tree', x: 0, y: 15, type: 'text', lines: TREE },
  {
    id: 'flat',
    x: 70,
    y: 15,
    title: 'flattened by the Broker',
    lines: [[c('i', 'base  '), ': wikipedia'], [c('y', 'leaves'), ': lookup.channel_lang'], ['        inline (subquery)'], '---', 'runs like a query on the base', c('d', 'no join reordering')],
    tone: 'q',
    caption: '기본 하나 + 잎들',
  },

  // 7. MSQ sortMerge
  { id: 'setj', type: 'text', x: 0, y: 9, lines: [[c('b', 'SET'), " sqlJoinAlgorithm = '", c('q', 'sortMerge'), "';"], c('d', "-- default 'broadcast': all leaf inputs <= 30% of a processor bundle")] },
  { id: 'stA', x: 0, y: 14, title: 'stage 0, read wikipedia', lines: ['worker 1, worker 2', c('d', 'rows -> hash(channel)')], tone: 'i', caption: '왼쪽 입력' },
  { id: 'stB', x: 0, y: 21, title: 'stage 1, read channel_meta', lines: ['worker 1, worker 2', c('d', 'rows -> hash(channel)')], tone: 'y', caption: '오른쪽 입력' },
  {
    id: 'stJ',
    x: 44,
    y: 16,
    title: 'stage 2, sortMerge join',
    lines: ['worker A  keys h=0  sort | merge', 'worker B  keys h=1  sort | merge', '---', c('d', 'rows buffered per key <= 10 MB')],
    tone: 'q',
    caption: '같은 키끼리 한 워커로',
  },
  { id: 'res', x: 96, y: 17, title: 'result', lines: ['joined rows', c('d', 'any size')], tone: 'q' },
];

const edges = [
  // 룩업 배포
  ...['router', 'broker', 'hist1', 'hist2', 'peon'].map((to) => ({ id: `push-${to}`, from: 'coord', to, via: 'b-t', cy: 6.3, tone: 'm' })),
  // LOOKUP
  { id: 'segMap', from: 'seg', to: 'map', via: 'r-l', tone: 'y', label: 'key' },
  { id: 'mapOut', from: 'map', to: 'out', via: 'r-l', tone: 'y', label: 'value' },
  // 흩어 보내기
  { id: 'rb', from: 'router', to: 'broker', via: 'r-l', tone: 'q' },
  { id: 'b1', from: 'broker', to: 'hist1', via: 'br-bl', offset: 26, tone: 'q' },
  { id: 'b2', from: 'broker', to: 'hist2', via: 'br-bl', offset: 34, tone: 'q', label: 'scatter' },
  { id: 'bp', from: 'broker', to: 'peon', via: 'br-bl', offset: 42, tone: 'q' },
  // 인라인
  { id: 'toSub', from: 'broker', to: 'subq', via: 'bl-t', tone: 'y', label: 'materialize' },
  { id: 'sub1', from: 'subq', to: 'hist1', via: 'rt-b', tone: 'y', label: 'inline' },
  { id: 'sub2', from: 'subq', to: 'hist2', via: 'rb-b', tone: 'y' },
  // MSQ
  { id: 'aJ', from: 'stA', to: 'stJ', via: 'r-lt', tone: 'i', label: 'hash partition' },
  { id: 'bJ', from: 'stB', to: 'stJ', via: 'r-lb', tone: 'y' },
  { id: 'jR', from: 'stJ', to: 'res', via: 'r-l', tone: 'q' },
  // Dart
  { id: 'd12', from: 'hist1', to: 'hist2', via: 'tr-tl', offset: 20, tone: 'i', label: 'exchange' },
];

const SERVERS = ['router', 'broker', 'hist1', 'hist2', 'peon'];
const PUSH = SERVERS.map((s) => `push-${s}`);

export default {
  title: '조인과 룩업',
  docs: [
    ['Lookups', 'https://druid.apache.org/docs/latest/querying/lookups'],
    ['Join datasource', 'https://druid.apache.org/docs/latest/querying/datasource#join'],
    ['MSQ joins', 'https://druid.apache.org/docs/latest/multi-stage-query/reference#joins'],
  ],
  legend: [
    ['쿼리', 'q'],
    ['룩업, 메모리의 오른쪽 입력', 'y'],
    ['기본(왼쪽) 테이블', 'i'],
    ['룩업 설정 배포', 'm'],
  ],
  nodes,
  edges,
  steps: [
    {
      title: '룩업: 모든 서버가 들고 있는 작은 사전',
      show: ['coord', ...SERVERS],
      on: ['coord', ...SERVERS, ...PUSH],
      dim: false,
      body: `<p><b class="y">룩업</b>은 문자열 키를 문자열 값으로 바꾸는 표예요. 여기서는 <code>channel_lang</code>: <code>#ko.wikipedia → Korean</code>.</p>
      <p>설정은 <b class="m">Coordinator</b> 에 두고, Coordinator 가 쿼리를 받는 서버(Broker, Router, Historical, Peon)에 <b>미리 실어 메모리에</b> 올려요. 룩업 티어(기본 <code>__default</code>)마다 나눠 주고, 2분(<code>druid.manager.lookups.period</code>)마다 살펴요.</p>
      <p class="note">룩업에는 <b>이력이 없어요</b>. 어느 시간 범위를 쿼리하든 지금의 값으로 바꿔요.</p>`,
      play: async (s) => {
        SERVERS.forEach((id) => s.patch(id, { lines: [EMPTY, nodes.find((n) => n.id === id).lines[1]] }));
        await s.wait(0.6);
        s.pulse('coord');
        await s.sendAll(PUSH, { dur: 1.3, glyph: '{k:v}' });
        SERVERS.forEach((id) => {
          s.patch(id, { lines: [LOADED, nodes.find((n) => n.id === id).lines[1]] });
          s.pulse(id);
        });
        await s.wait(3.2);
      },
      gap: 0.3,
    },
    {
      title: 'LOOKUP 함수: 행마다 값 바꾸기',
      show: ['coord', 'hist1', 'seg', 'map', 'out'],
      on: ['hist1', 'seg', 'map', 'out', 'segMap', 'mapOut'],
      hold: 11,
      body: `<p>SQL 의 <code>LOOKUP(channel, 'channel_lang')</code> 은 각 행의 <code>channel</code> 값을 룩업으로 바꿔요. 룩업은 이미 서버 메모리에 있으니, 데이터 서버가 세그먼트를 읽으면서 곧바로 바꿀 수 있어요.</p>
      <p>세 번째 인자를 주면 없는 키를 그 값으로 채워요(<code>COALESCE</code> 처럼). 여러 키가 같은 값으로 가도 돼요.</p>`,
      play: async (s) => {
        s.patch('out', { lines: outLines(0) });
        for (let k = 0; k < ROWS.length; k++) {
          s.patch('seg', { lines: segLines(k) });
          await s.send('segMap', { dur: 0.7, glyph: ROWS[k][1].slice(0, 3) });
          s.patch('map', { lines: mapLines(ROWS[k][1]) });
          await s.send('mapOut', { dur: 0.7, glyph: LANG[ROWS[k][1]] });
          s.patch('out', { lines: outLines(k + 1) });
          await s.wait(0.25);
        }
        s.patch('seg', { lines: segLines() });
        s.patch('map', { lines: mapLines() });
        await s.wait(2.4);
      },
      gap: 0.3,
    },
    {
      title: '더 빠르게: 룩업을 뒤로 미뤄요',
      show: ['coord', 'broker', 'rw1', 'rw2'],
      on: ['rw1', 'rw2', 'broker'],
      hold: 11,
      body: `<p><code>LOOKUP</code> 함수는 <code>JOIN</code> 으로 쓸 때는 못 받는 자동 재작성을 받아요.</p>
      <ul>
        <li><b>거꾸로 찾기</b>: <code>WHERE LOOKUP(...) = 'Korean'</code> 은 <code>WHERE channel = '#ko.wikipedia'</code> 로 바뀌어서, 데이터 서버가 <code>channel</code> 의 인덱스를 써요.</li>
        <li><b>끌어올리기</b>: 룩업이 일대일(injective)이면 <code>GROUP BY channel</code> 을 먼저 하고, 줄어든 결과에만 룩업을 적용해요.</li>
      </ul>
      <p>조인 연산자는 행마다 조건을 따져야 하지만 <code>LOOKUP</code> 은 집계 뒤로 미룰 수 있어서, 대개 룩업에 조인하는 것보다 빨라요.</p>`,
      play: async (s) => {
        s.pulse('rw1');
        await s.wait(2.2);
        s.pulse('rw2');
        await s.wait(2.6);
      },
    },
    {
      title: 'JOIN 은 브로드캐스트 해시 조인',
      show: ['coord', ...SERVERS, 'jsql', 'plan'],
      on: ['broker', 'hist1', 'hist2', 'peon', 'plan', 'jsql', 'rb', 'b1', 'b2', 'bp'],
      patch: {
        hist1: { lines: [c('i', 'base: wikipedia'), LOADED] },
        hist2: { lines: [c('i', 'base: wikipedia'), LOADED] },
        peon: { lines: [c('i', 'base: realtime'), LOADED] },
      },
      hold: 10,
      body: `<p>네이티브 조인은 <b>브로드캐스트 해시 조인</b>이에요. 맨 아래 왼쪽의 <b class="i">기본(base) 데이터소스</b>만 여느 쿼리처럼 시간으로 추려 데이터 서버들에 흩어 보내고, 나머지 입력은 <b class="y">모두 메모리에</b> 들어가야 해요.</p>
      <p>오른쪽 입력은 <code>lookup</code>, <code>inline</code>, <code>query</code>(서브쿼리)만 돼요. 룩업은 이미 실려 있어서 해시 테이블을 새로 만들 필요가 없어요. 각 서버는 기본 테이블을 읽으면서 <b>행마다</b> 짝을 찾아 붙여요.</p>`,
      play: async (s) => {
        await s.send('rb', { dur: 0.8 });
        s.pulse('broker');
        await s.sendAll(['b1', 'b2', 'bp'], { dur: 1.2 });
        ['hist1', 'hist2', 'peon'].forEach((id) => s.pulse(id));
        await s.wait(0.9);
        await s.sendAll(['b1', 'b2', 'bp'], { dur: 1.1, reverse: true, glyph: '◆' });
        s.pulse('broker');
        await s.wait(1.4);
      },
    },
    {
      title: '서브쿼리는 Broker 가 먼저 돌려 인라인으로',
      show: ['coord', 'router', 'broker', 'hist1', 'hist2', 'subq'],
      on: ['broker', 'hist1', 'hist2', 'subq', 'b1', 'b2', 'toSub', 'sub1', 'sub2'],
      patch: { b2: { label: '' }, sub1: { label: 'inline' } },
      hold: 14,
      body: `<ol>
        <li>Broker 가 조인의 입력인 <b>서브쿼리를 먼저 실행</b>하고 결과를 메모리에 모아요(모든 서브쿼리를 합쳐 기본 <code>maxSubqueryRows</code> 100,000 행까지).</li>
        <li>그 결과를 <b class="y">inline</b> 데이터소스로 바꿔 본 쿼리와 함께 데이터 서버에 보내요.</li>
        <li>각 서버는 inline 입력으로 <b>해시 테이블을 만든 뒤</b> 기본 테이블을 읽으며 조인해요.</li>
      </ol>`,
      play: async (s) => {
        s.reset();
        s.state('subq', 'dim');
        await s.sendAll(['b1', 'b2'], { dur: 1.1, glyph: '?' });
        await s.sendAll(['b1', 'b2'], { dur: 1.1, reverse: true, glyph: '◆' });
        s.pulse('broker');
        await s.send('toSub', { dur: 0.9, glyph: '◆' });
        s.state('subq', null);
        s.pulse('subq');
        await s.wait(0.6);
        await s.sendAll(['sub1', 'sub2'], { dur: 1.3, glyph: '[inline]' });
        s.patch('hist1', { lines: [c('i', 'base: wikipedia'), c('y', 'hash table: built')] });
        s.patch('hist2', { lines: [c('i', 'base: wikipedia'), c('y', 'hash table: built')] });
        s.pulse('hist1');
        s.pulse('hist2');
        await s.wait(2.6);
      },
      gap: 0.4,
    },
    {
      title: '조인 트리 펴기와 SQL 조인의 규칙',
      show: ['coord', 'broker', 'tree', 'flat'],
      on: ['tree', 'flat', 'broker'],
      body: `<p>Broker 는 조인 트리를 <b class="i">기본 데이터소스</b>(맨 아래 왼쪽) 하나와 <b class="y">잎(leaf)</b> 입력들로 펴요. 실행은 기본 데이터소스의 방식을 그대로 따라요.</p>
      <ul>
        <li>효율적으로 도는 조건은 <b>등호</b>예요: 왼쪽 식 = 오른쪽 <b>컬럼</b>이고 양쪽 타입이 같을 때(룩업 키는 늘 문자열). 아니면 서브쿼리나 교차 조인 + 필터가 돼요.</li>
        <li>조인 순서를 바꿔 주지 않고, 필터를 조인 아래로 밀어 넣지 않아요.</li>
        <li>네이티브 엔진의 RIGHT, FULL OUTER 조인은 아직 결과가 늘 맞지는 않아요.</li>
      </ul>`,
      play: async (s) => {
        s.pulse('tree');
        await s.wait(1.8);
        s.pulse('flat');
        await s.wait(2.8);
      },
    },
    {
      title: '큰 테이블끼리: MSQ 의 sortMerge',
      show: ['setj', 'stA', 'stB', 'stJ', 'res'],
      on: ['stA', 'stB', 'stJ', 'res', 'setj', 'aJ', 'bJ', 'jR'],
      hold: 12,
      body: `<p>SQL 기반 수집과 MSQ 쿼리는 기본이 브로드캐스트라서, 기본이 아닌 입력들이 처리 메모리 묶음의 30% 를 넘으면 <code>BroadcastTablesTooLarge</code> 로 실패해요.</p>
      <p><code>SET sqlJoinAlgorithm = 'sortMerge';</code> 이면 조인 한 쌍이 한 <b>스테이지</b>가 돼요. 두 입력을 <b>조인 키의 해시</b>로 나눠 같은 워커에 모으고, 정렬해 맞물려요. 입력 크기에 제한이 없고 모든 조인 종류를 써요. 다만 한 키에 몰린 데이터가 양쪽 모두 10 MB 를 넘으면 <code>TooManyRowsWithSameKey</code> 로 실패해요.</p>`,
      play: async (s) => {
        s.pulse('stA');
        s.pulse('stB');
        for (let k = 0; k < 3; k++) {
          s.send('aJ', { dur: 1, glyph: 'h0' }).catch(() => {});
          s.send('bJ', { dur: 1, glyph: 'h1' }).catch(() => {});
          await s.wait(0.45);
        }
        await s.wait(0.8);
        s.pulse('stJ');
        await s.send('jR', { dur: 0.9, glyph: '◆' });
        s.pulse('res');
        await s.wait(1.6);
      },
    },
    {
      title: 'Dart: Broker 가 지휘하고 Historical 이 일해요 (실험적)',
      show: ['coord', ...SERVERS],
      on: ['broker', 'hist1', 'hist2', 'b1', 'b2', 'd12'],
      focus: ['router', 'broker', 'hist1', 'hist2', 'peon'],
      patch: {
        broker: { lines: [c('q', 'Dart controller'), c('d', 'engine: msq-dart')] },
        hist1: { lines: [c('i', 'Dart worker'), c('d', 'sort-merge part')] },
        hist2: { lines: [c('i', 'Dart worker'), c('d', 'sort-merge part')] },
      },
      hold: 11,
      body: `<p><b>Dart</b> 는 SELECT 를 태스크가 아니라 Broker 와 Historical 에서 돌리는 MSQ 의 한 모습이에요. <b class="q">Broker 가 컨트롤러</b>, <b class="i">Historical 이 워커</b>가 되어 큰 조인을 <b>병렬 sort-merge</b> 로 처리해요. 카디널리티가 큰 정확한 GROUP BY 와 COUNT DISTINCT 에도 강해요.</p>
      <p><code>druid.msq.dart.enabled=true</code> 로 켜고, 여느 SQL 처럼 <code>/druid/v2/sql</code> 에 컨텍스트 <code>engine: 'msq-dart'</code> 를 붙여요. 실험적 기능이에요.</p>`,
      play: async (s) => {
        s.pulse('broker');
        await s.sendAll(['b1', 'b2'], { dur: 1.1, glyph: '▸' });
        for (let k = 0; k < 2; k++) {
          s.send('d12', { dur: 0.9, glyph: 'k' }).catch(() => {});
          s.send('d12', { dur: 0.9, glyph: 'k', reverse: true }).catch(() => {});
          await s.wait(0.6);
        }
        await s.wait(0.6);
        await s.sendAll(['b1', 'b2'], { dur: 1.1, reverse: true, glyph: '◆' });
        s.pulse('broker');
        await s.wait(1.4);
      },
    },
  ],
};
