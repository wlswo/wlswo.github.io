/*
 * 13 근사 집계와 스케치
 *
 * 가운데 그림은 Theta 스케치(KMV): 사용자마다 해시를 [0, 1) 위의 한 점으로 찍고,
 * 가장 작은 K 개(●)만 남긴다. K 번째 점의 자리가 θ 이고, 추정치는 (K − 1) / θ.
 * 조작: K 를 바꾸고, 사용자를 더해 추정치와 참값을 견준다.
 * 둘째 그림은 두 세그먼트의 스케치를 합치는(union) 모습 — 합칠 수 있다는 것이
 * 스케치의 핵심이다.
 */
import { c, table, num } from '../ascii.js';

const L = 64; // 수직선의 칸 수

// 사용자 이름 → [0, 1) (FNV-1a + 섞기)
function h01(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const user = (i) => `user-${String(i).padStart(3, '0')}`;
const hashes = (from, to) => Array.from({ length: to - from + 1 }, (_, k) => h01(user(from + k)));

/** K 개의 가장 작은 해시로 추정. N ≤ K 면 스케치가 모두 담고 있어 정확하다. */
function sketch(hs, K) {
  const sorted = [...new Set(hs)].sort((a, b) => a - b);
  if (sorted.length <= K) return { exact: true, kept: sorted, theta: 1, est: sorted.length };
  const kept = sorted.slice(0, K);
  const theta = kept[K - 1];
  return { exact: false, kept, theta, est: (K - 1) / theta };
}

/** 수직선 한 줄: 0 ──•──●── 1 (남긴 점 ●, 버린 점 •) */
function numberLine(hs, sk, tone = 'y') {
  const kept = new Set(sk.kept);
  const cells = Array(L).fill(0); // 0 빈칸, 1 버림, 2 남김
  for (const h of hs) {
    const col = Math.min(L - 1, Math.floor(h * L));
    cells[col] = Math.max(cells[col], kept.has(h) ? 2 : 1);
  }
  const parts = [c('d', '0 ')];
  for (const v of cells) parts.push(v === 2 ? c(tone, '●') : v === 1 ? c('n', '•') : c('d', '─'));
  parts.push(c('d', ' 1'));
  return parts;
}
function thetaMark(sk) {
  if (sk.exact) return [c('d', '  (N <= K: the sketch keeps every hash)')];
  const col = Math.min(L - 1, Math.floor(sk.theta * L));
  return ['  ', ' '.repeat(col), c('q', '▲'), c('q', ` theta = ${sk.theta.toFixed(3)}`)];
}
const pct = (est, truth) => {
  const e = ((est - truth) / truth) * 100;
  return `${e >= 0 ? '+' : ''}${e.toFixed(1)}%`;
};

// 조작이 바꾸는 값(장 안에 둔다)
const START = 60;
let N = START;

// 합치기에 쓰는 두 세그먼트: A = 301..350, B = 331..380 (20명이 겹친다)
const A = hashes(301, 350);
const B = hashes(331, 380);

function nodes(params) {
  const K = params.k;
  const hs = hashes(1, N);
  const sk = sketch(hs, K);
  const skA = sketch(A, K);
  const skB = sketch(B, K);
  const skU = sketch([...A, ...B], K);

  return [
    // 1. COUNT(DISTINCT)
    {
      id: 'sql',
      x: 0,
      y: 0,
      title: 'SQL',
      lines: [[c('b', 'SELECT'), ' COUNT(DISTINCT user)'], [c('b', 'FROM'), ' wikipedia']],
      tone: 'n',
      caption: '보통의 SQL',
    },
    {
      id: 'plan',
      x: 38,
      y: 0,
      title: 'Broker, SQL planner',
      lines: [
        ['useApproximateCountDistinct = ', c('q', 'true')],
        [c('d', '-> '), 'APPROX_COUNT_DISTINCT(user)'],
        '---',
        ['druid.sql.approxCountDistinct.function'],
        ['  = ', c('y', 'APPROX_COUNT_DISTINCT_BUILTIN')],
        [c('d', '    built-in HyperLogLog (hyperUnique)')],
      ],
      tone: 'q',
      caption: '기본값: 근사',
    },
    {
      id: 'exact',
      x: 38,
      y: 11,
      title: 'exact mode',
      lines: [['useApproximateCountDistinct = ', c('x', 'false')], c('d', 'one exact distinct per query'), c('d', '(unless useGroupingSetForExactDistinct)')],
      tone: 'x',
      frame: 'dashed',
      caption: '정확히 세려면',
    },

    // 2. 왜 더할 수 없나
    {
      id: 'segA',
      x: 0,
      y: 0,
      title: 'segment A',
      tag: '09-23',
      lines: ['user-301 .. user-350', ['distinct = ', c('b', '50')]],
      tone: 'i',
    },
    {
      id: 'segB',
      x: 0,
      y: 6,
      title: 'segment B',
      tag: '09-24',
      lines: ['user-331 .. user-380', ['distinct = ', c('b', '50')]],
      tone: 'i',
    },
    {
      id: 'naive',
      x: 40,
      y: 2,
      title: 'Broker',
      lines: [['50 + 50 = ', c('x', '100'), c('x', '  wrong')], ['truth   = ', c('g', '80'), c('d', '  (20 users in both)')], '---', c('d', 'exact needs every user id'), c('d', 'shipped to one place')],
      tone: 'q',
      caption: '고유 개수는 더할 수 없어요',
    },

    // 3. Theta 스케치
    { id: 'users', x: 0, y: 0, title: 'users', lines: [[c('b', num(N)), ' distinct users'], c('d', 'hash(user) -> [0, 1)')], tone: 'n' },
    {
      id: 'line',
      type: 'text',
      x: 0,
      y: 11,
      lines: [numberLine(hs, sk), thetaMark(sk), '', [c('y', '●'), c('d', ` kept: the K = ${K} smallest hashes   `), c('n', '•'), c('d', ' dropped')]],
    },
    {
      id: 'est',
      x: 38,
      y: 0,
      title: 'theta sketch',
      lines: sk.exact
        ? [['K      : ', String(K)], ['stored : ', String(sk.kept.length), c('d', ' hashes')], ['count  : ', c('g', String(N)), c('d', ' (exact)')]]
        : [
            ['K        : ', String(K)],
            ['theta    : ', sk.theta.toFixed(3)],
            ['estimate : ', c('y', `(K-1)/theta = ${Math.round(sk.est)}`)],
            ['truth    : ', c('g', String(N))],
            ['error    : ', pct(sk.est, N)],
          ],
      tone: 'y',
      frame: 'round',
      caption: 'K 개만 남기고 추정해요',
    },

    // 4. 합치기
    { id: 'lA', type: 'text', x: 12, y: 0, lines: [numberLine(A, skA, 'i')] },
    { id: 'lB', type: 'text', x: 12, y: 3, lines: [numberLine(B, skB, 'i')] },
    { id: 'lU', type: 'text', x: 12, y: 7, lines: [numberLine([...A, ...B], skU, 'y'), thetaMark(skU)] },
    { id: 'tA', type: 'text', x: 0, y: 0, lines: [c('i', '  sketch A')] },
    { id: 'tB', type: 'text', x: 0, y: 3, lines: [c('i', '  sketch B')] },
    { id: 'tU', type: 'text', x: 0, y: 7, lines: [c('y', '  A union B')] },
    {
      id: 'uni',
      x: 12,
      y: 11,
      title: 'union at query time',
      lines: [
        ['keep the K smallest of A + B', c('d', '  (duplicates count once)')],
        ['estimate : ', c('y', skU.exact ? `${skU.est} (exact)` : String(Math.round(skU.est))), c('d', '   truth : '), c('g', '80')],
        [c('d', 'per-segment sum would say 100')],
      ],
      tone: 'y',
      frame: 'round',
      caption: '스케치는 합칠 수 있어요: 세그먼트마다 만든 것을 모아 union',
    },

    // 5. 수집할 때 만든다
    {
      id: 'raw',
      x: 0,
      y: 0,
      title: 'user as a dimension',
      lines: table(
        ['hour', 'channel', 'user', 'added'],
        [
          ['09:00', '#ko', 'user-007', '12'],
          ['09:00', '#ko', 'user-031', '9'],
          ['09:00', '#ko', 'user-044', '21'],
          ['09:00', '#ko', 'user-052', '16'],
          ['09:00', '#en', 'user-013', '15'],
          ['09:00', '#en', 'user-068', '8'],
        ],
        { align: ['left', 'left', 'left', 'right'] },
      ),
      tone: 'i',
      caption: '행마다 사용자가 달라서 거의 안 합쳐져요',
    },
    {
      id: 'rolled',
      x: 50,
      y: 0,
      title: 'HLLSketchBuild(user)',
      lines: table(
        ['hour', 'channel', 'user_hll', 'added'],
        [
          ['09:00', '#ko', c('y', '<hll: 4 users>'), '58'],
          ['09:00', '#en', c('y', '<hll: 2 users>'), '23'],
        ],
        { align: ['left', 'left', 'left', 'right'] },
      ),
      tone: 'y',
      caption: '6행 → 2행, 사용자 수는 스케치에',
    },
    {
      id: 'spec',
      type: 'text',
      x: 0,
      y: 13,
      lines: [
        c('d', '"dimensionsSpec": { "dimensions": ["channel"] },   // user is left out'),
        '"metricsSpec": [',
        '  { "type": "count", "name": "count" },',
        '  { "type": "longSum", "name": "added", "fieldName": "added" },',
        ['  { "type": ', c('y', '"HLLSketchBuild"'), ', "name": "user_hll", "fieldName": "user" }'],
        ']',
      ],
    },

    // 6. 종류와 기본값
    {
      id: 'kinds',
      x: 0,
      y: 0,
      title: 'sketches in druid-datasketches',
      lines: table(
        ['sketch', 'default', 'good for'],
        [
          [c('y', 'HLL'), 'lgK 12, HLL_4', 'distinct count, very compact'],
          [c('y', 'Theta'), 'size 16384', 'distinct + union / intersect / not'],
          [c('y', 'Quantiles'), 'k 128', 'percentiles (p50, p99)'],
          [c('y', 'KLL'), 'k 200', 'percentiles'],
          [c('y', 'Tuple'), '16384 entries', 'distinct keys + values'],
          [c('d', 'builtin'), c('d', 'hyperUnique'), c('d', 'default APPROX_COUNT_DISTINCT')],
        ],
      ),
      tone: 'y',
      caption: 'druid-datasketches 확장을 싣고 써요',
    },

    // 7. SQL 에서
    {
      id: 'sqlfin',
      x: 0,
      y: 0,
      title: 'SQL',
      lines: [
        [c('b', 'SELECT')],
        ['  APPROX_COUNT_DISTINCT_DS_HLL(user_hll)  ', c('d', '-> a number')],
        ['  DS_HLL(user_hll)                        ', c('d', '-> a sketch object')],
        ['  APPROX_QUANTILE_DS(added, 0.99)         ', c('d', '-> a number')],
        [c('b', 'FROM'), ' wikipedia'],
        '---',
        ['sqlFinalizeOuterSketches = ', c('q', 'false'), c('d', '  (default)')],
      ],
      tone: 'q',
      caption: 'DS_* 는 숫자가 아니라 스케치를 돌려줘요',
    },
  ];
}

const edges = [
  { id: 'sp', from: 'sql', to: 'plan', via: 'r-l', tone: 'q', label: 'plan' },
  { id: 'pe', from: 'plan', to: 'exact', via: 'br-tr', tone: 'x', label: 'or' },
  { id: 'aN', from: 'segA', to: 'naive', via: 'r-lt', tone: 'i' },
  { id: 'bN', from: 'segB', to: 'naive', via: 'r-lb', tone: 'i' },
  { id: 'uL', from: 'users', to: 'line', via: 'b-t', tone: 'n', label: 'hash' },
  { id: 'uE', from: 'users', to: 'est', via: 'r-l', tone: 'y' },
  { id: 'aU', from: 'tA', to: 'tU', via: 'lb-lt', offset: 16, tone: 'i' },
  { id: 'bU', from: 'tB', to: 'tU', via: 'l-l', offset: 10, tone: 'i' },
  { id: 'rawRolled', from: 'raw', to: 'rolled', via: 'r-l', tone: 'y', label: 'rollup' },
];

const S1 = ['sql', 'plan', 'exact'];
const S2 = ['segA', 'segB', 'naive'];
const S3 = ['users', 'line', 'est'];
const S4 = ['lA', 'lB', 'lU', 'tA', 'tB', 'tU', 'uni'];
const S5 = ['raw', 'rolled', 'spec'];

export default {
  title: '근사 집계와 스케치',
  docs: [
    ['SQL aggregations', 'https://druid.apache.org/docs/latest/querying/sql-aggregations'],
    ['HLL sketch', 'https://druid.apache.org/docs/latest/development/extensions-core/datasketches-hll'],
    ['Theta sketch', 'https://druid.apache.org/docs/latest/development/extensions-core/datasketches-theta'],
  ],
  legend: [
    ['쿼리', 'q'],
    ['스케치', 'y'],
    ['세그먼트, 행', 'i'],
    ['참값', 'g'],
  ],
  controls: [
    { id: 'k', label: 'K (스케치 크기)', type: 'seg', options: [[8, '8'], [16, '16'], [32, '32'], [64, '64']], value: 32 },
    { id: 'add', label: '+ 사용자 25명', type: 'button' },
    { id: 'reset', label: '처음으로(60명)', type: 'button' },
  ],
  onAction(id) {
    if (id === 'add') N = Math.min(400, N + 25);
    if (id === 'reset') N = START;
  },
  nodes,
  edges,
  steps: [
    {
      title: 'COUNT(DISTINCT) 는 기본이 근사',
      show: S1,
      on: ['sql', 'plan', 'sp'],
      edges: ['pe'],
      dim: false,
      body: `<p>Druid SQL 에서 <code>COUNT(DISTINCT user)</code> 는 기본으로 <b>근사치</b>예요(<code>useApproximateCountDistinct = true</code>). 플래너가 <code>APPROX_COUNT_DISTINCT</code> 로 바꾸고, 그 알고리즘은 <code>druid.sql.approxCountDistinct.function</code> 이 정해요. 기본은 Druid 에 들어 있는 HyperLogLog 변형(<code>APPROX_COUNT_DISTINCT_BUILTIN</code>)이에요.</p>
      <p>정확히 세려면 컨텍스트에 <code>useApproximateCountDistinct: false</code> 를 줘요. 이때는 쿼리 하나에 정확한 고유 개수를 하나만 쓸 수 있어요(<code>useGroupingSetForExactDistinct</code> 를 켜지 않으면).</p>`,
      play: async (s) => {
        await s.send('sp', { dur: 1.1 });
        s.pulse('plan');
        await s.wait(2.4);
      },
    },
    {
      title: '고유 개수는 더할 수 없어요',
      show: S2,
      on: [...S2, 'aN', 'bN'],
      body: `<p>세그먼트는 따로따로 처리돼요. 세그먼트 A 에 사용자 50명, B 에도 50명이 있어도, 둘을 합친 고유 사용자는 100명이 아니에요. 두 세그먼트에 모두 나오는 사람이 있기 때문이에요.</p>
      <p>정확히 세려면 모든 사용자 id 를 한곳에 모아 중복을 지워야 하고, 필요한 메모리는 고유 값의 수만큼 늘어나요. 그래서 Druid 는 <b>합칠 수 있는 작은 요약</b>, 곧 <b class="y">스케치</b>를 써요.</p>`,
      play: async (s) => {
        await s.sendAll(['aN', 'bN'], { dur: 1.2, glyph: '50' });
        s.pulse('naive');
        await s.wait(2.6);
      },
    },
    {
      title: 'Theta 스케치: 가장 작은 K 개만 남겨요',
      show: S3,
      on: [...S3, 'uL', 'uE'],
      hold: 12,
      body: (p) => `<p>사용자마다 해시를 [0, 1) 사이의 한 점으로 찍어요. 해시는 고르게 흩어지니까 <b>가장 작은 K 개</b>(●)만 남겨도 전체가 얼마나 빽빽한지 알 수 있어요. K 번째 점의 자리를 θ 라 하면, 추정치는 <b>(K − 1) / θ</b> 예요.</p>
      <p>아래 조작 칸에서 K 를 바꾸거나 사용자를 더해 보세요(지금 K = ${p.k}). K 가 클수록 정확하지만 스케치가 커져요. 사용자가 K 명 이하면 스케치가 해시를 모두 담아서 정확히 세요. Druid 의 Theta 기본 크기(<code>size</code>)는 16384 예요.</p>`,
      play: async (s) => {
        s.pulse('users');
        await s.send('uL', { dur: 1, glyph: '•' });
        s.pulse('line');
        await s.send('uE', { dur: 0.9, glyph: '≈' });
        s.pulse('est');
        await s.wait(2.4);
      },
    },
    {
      title: '합치기: 스케치의 합집합은 합집합의 스케치',
      show: S4,
      on: [...S4, 'aU', 'bU'],
      hold: 11,
      body: `<p>세그먼트마다 스케치를 따로 만들어도, 두 스케치를 합칠 때 <b>둘을 모아 다시 가장 작은 K 개</b>만 남기면 돼요. 같은 사용자는 같은 해시라서 한 번만 세요. 그러면 처음부터 A ∪ B 로 만든 스케치와 같아져요.</p>
      <p>그래서 데이터 서버는 세그먼트별 스케치를 모아 합치고, Broker 가 서버들의 결과를 다시 합쳐요. 세그먼트별 개수를 더하면 100 이 나오지만, 스케치 union 은 참값 80 에 가깝게 추정해요.</p>`,
      play: async (s) => {
        await s.sendAll(['aU', 'bU'], { dur: 1.1, glyph: '●' });
        s.pulse('lU');
        s.pulse('uni');
        await s.wait(2.6);
      },
    },
    {
      title: '수집할 때 미리 만들어 둬요',
      show: S5,
      on: [...S5, 'rawRolled'],
      hold: 10,
      body: `<p>스케치는 수집 때 <b>지표 컬럼</b>으로 만들어 세그먼트에 저장해요. 예를 들어 <code>metricsSpec</code> 에 <code>HLLSketchBuild</code> 로 <code>user</code> 의 스케치를 만들고, <code>user</code> 는 차원에서 빼요.</p>
      <p>그러면 사용자가 달라도 같은 시간, 같은 채널의 행이 한 줄로 롤업되어 행 수가 크게 줄고, 쿼리 때는 저장된 스케치를 읽어 합치기만 하면 돼요. SQL 기반 수집에서는 <code>finalizeAggregations: false</code> 여야 숫자가 아니라 스케치가 저장돼요.</p>`,
      play: async (s) => {
        s.pulse('raw');
        await s.send('rawRolled', { dur: 1.3, glyph: '<hll>' });
        s.pulse('rolled');
        await s.wait(2.8);
      },
    },
    {
      title: '스케치의 종류와 기본값',
      show: ['kinds'],
      on: ['kinds'],
      body: `<p>공식 문서는 옛 내장 집계기보다 <b>DataSketches</b> 확장(<code>druid-datasketches</code>)을 권해요.</p>
      <ul>
        <li><b>HLL</b>: 고유 개수. 아주 작아요(<code>lgK</code> 12, <code>HLL_4</code>). 교집합과 차집합은 못 해요.</li>
        <li><b>Theta</b>: 고유 개수에 합집합, 교집합, 차집합까지(<code>size</code> 16384). 메모리를 더 써요.</li>
        <li><b>Quantiles</b>, <b>KLL</b>: 분위수(p50, p99). <code>k</code> 는 각각 128, 200.</li>
      </ul>
      <p class="note">내장 <code>hyperUnique</code> 스케치와 DataSketches 의 HLL, Theta 스케치는 서로 섞어 합칠 수 없어요.</p>`,
    },
    {
      title: 'SQL 에서 쓰기: 숫자와 스케치',
      show: ['sqlfin'],
      on: ['sqlfin'],
      body: `<p><code>APPROX_COUNT_DISTINCT_DS_HLL</code> 과 <code>APPROX_QUANTILE_DS</code> 는 숫자를 돌려줘요. 반면 <code>DS_HLL</code>, <code>DS_THETA</code>, <code>DS_QUANTILES_SKETCH</code> 는 <b>스케치 자체</b>를 돌려줘서 다른 쿼리에서 다시 합칠 수 있어요. 숫자로 받고 싶으면 <code>sqlFinalizeOuterSketches = true</code> 를 줘요(기본은 false).</p>
      <p class="note">근사는 스케치만이 아니에요. <b>TopN</b> 도 세그먼트마다 상위 일부만 돌려주는 근사 알고리즘이에요(쿼리 장의 'SQL 에서 네이티브로').</p>`,
    },
  ],
};
