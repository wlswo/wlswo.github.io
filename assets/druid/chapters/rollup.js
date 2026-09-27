/*
 * 05 데이터 모델과 롤업
 *
 * 왼쪽은 들어온 이벤트 열 건(표), 오른쪽은 세그먼트에 저장될 행(표). 컬럼의 쓰임(1),
 * queryGranularity 로 시간을 자르기(2), 같은 행을 하나로 합치기(3), 롤업 비율(4),
 * 카디널리티가 높은 차원(5), perfect 와 best-effort(6), 스펙과 SQL(7).
 * 설명 칸의 조작(rollup 켜고 끄기, queryGranularity)이 오른쪽 표와 수치를 바꾼다.
 */
import { c, pad, bar } from '../ascii.js';

// 위키백과 편집 이벤트 열 건(시각은 초까지)
const RAW = [
  { t: '09:00:05', ch: '#ko', co: 'KR', user: 'u01', added: 12 },
  { t: '09:00:41', ch: '#ko', co: 'KR', user: 'u02', added: 5 },
  { t: '09:00:52', ch: '#en', co: 'US', user: 'u03', added: 57 },
  { t: '09:01:10', ch: '#ko', co: 'KR', user: 'u01', added: 31 },
  { t: '09:01:12', ch: '#en', co: 'US', user: 'u04', added: 20 },
  { t: '09:01:47', ch: '#en', co: 'US', user: 'u03', added: 94 },
  { t: '09:02:03', ch: '#ko', co: 'KR', user: 'u05', added: 8 },
  { t: '09:31:20', ch: '#ko', co: 'KR', user: 'u02', added: 15 },
  { t: '09:32:05', ch: '#en', co: 'US', user: 'u06', added: 36 },
  { t: '09:45:59', ch: '#en', co: 'US', user: 'u03', added: 18 },
];

const TRUNC = {
  none: (t) => t,
  minute: (t) => `${t.slice(0, 5)}:00`,
  hour: (t) => `${t.slice(0, 2)}:00:00`,
};

/** 롤업한 행들. dims: 차원 컬럼. src: 합쳐진 이벤트 번호들 */
function rolled(p, dims = ['ch', 'co']) {
  const trunc = TRUNC[p.qg];
  if (!p.rollup) return RAW.map((r, i) => ({ t: trunc(r.t), ch: r.ch, co: r.co, user: r.user, count: 1, sum: r.added, src: [i] }));
  const map = new Map();
  RAW.forEach((r, i) => {
    const key = [trunc(r.t), ...dims.map((d) => r[d])].join('|');
    const row = map.get(key) || { t: trunc(r.t), ch: r.ch, co: r.co, user: r.user, count: 0, sum: 0, src: [] };
    row.count += 1;
    row.sum += r.added;
    row.src.push(i);
    map.set(key, row);
  });
  return [...map.values()];
}

// ── 표 그리기(머리칸마다 색을 달리 준다) ──
function grid(cols, rows) {
  const line = (cells) => {
    const out = [];
    cells.forEach((v, i) => {
      if (i) out.push(c('d', ' │ '));
      out.push(...pad(v, cols[i].w, cols[i].align || 'left'));
    });
    return out;
  };
  return [line(cols.map((col) => c(col.tone || 'd', col.name))), c('d', cols.map((col) => '─'.repeat(col.w)).join('─┼─')), ...rows.map(line)];
}

const GROUP_TONES = ['q', 'm', 'g', 'p', 'y', 'i'];

function rawLines(p, { trunc = false, hot = null } = {}) {
  const cols = [
    { name: '__time', w: 8, tone: 'n' },
    ...(trunc ? [{ name: `→ ${p.qg}`, w: 9, tone: 'q' }] : []),
    { name: 'channel', w: 7, tone: 'i' },
    { name: 'country', w: 7, tone: 'i' },
    { name: 'user', w: 4, tone: 'd' },
    { name: 'added', w: 5, tone: 'g', align: 'right' },
  ];
  const rows = RAW.map((r, i) => {
    const lit = hot && hot.includes(i);
    const v = (x, tone) => (lit ? c('b', x) : tone ? c(tone, x) : x);
    return [
      v(r.t),
      ...(trunc ? [c('q', TRUNC[p.qg](r.t))] : []),
      v(r.ch),
      v(r.co),
      c('d', r.user),
      lit ? c('b', String(r.added)) : String(r.added),
    ];
  });
  return grid(cols, rows);
}

function rolledLines(p, { user = false, hot = -1 } = {}) {
  const rows = rolled(p, user ? ['ch', 'co', 'user'] : ['ch', 'co']);
  if (!p.rollup) {
    const cols = [
      { name: '__time', w: 8, tone: 'n' },
      { name: 'channel', w: 7, tone: 'i' },
      { name: 'country', w: 7, tone: 'i' },
      { name: 'added', w: 5, tone: 'g', align: 'right' },
    ];
    return grid(cols, rows.map((r) => [r.t, r.ch, r.co, String(r.sum)]));
  }
  const cols = [
    { name: '__time', w: 8, tone: 'n' },
    { name: 'channel', w: 7, tone: 'i' },
    { name: 'country', w: 7, tone: 'i' },
    ...(user ? [{ name: 'user', w: 4, tone: 'i' }] : []),
    { name: 'count', w: 5, tone: 'g', align: 'right' },
    { name: 'sum_added', w: 9, tone: 'g', align: 'right' },
  ];
  return grid(
    cols,
    rows.map((r, k) => {
      const tone = k === hot ? GROUP_TONES[k % GROUP_TONES.length] : null;
      const v = (x) => (tone ? c(tone, x) : x);
      return [v(r.t), v(r.ch), v(r.co), ...(user ? [v(r.user)] : []), v(String(r.count)), v(String(r.sum))];
    }),
  );
}

function statsLines(p, { withUser = false } = {}) {
  const base = rolled(p).length;
  const ratio = (n) => (10 / n).toFixed(2);
  const lines = [
    [c('d', 'input events   '), '10'],
    [c('d', 'stored rows    '), c('b', String(base).padStart(2))],
    '---',
    [c('d', 'SUM(count) / COUNT(*) = '), c('q', ratio(base))],
    bar(10 - base, 9, 18, { tone: 'q' }),
  ];
  if (withUser) {
    const u = rolled(p, ['ch', 'co', 'user']).length;
    lines.push('---', [c('d', 'dims + user    '), c('x', String(u).padStart(2)), c('d', ' rows, '), c('x', ratio(u))]);
  }
  return lines;
}

const specLines = (p) => [
  c('d', '"granularitySpec": {'),
  ['  "segmentGranularity": ', c('q', '"day"'), ','],
  ['  "queryGranularity": ', c('q', `"${p.qg}"`), ','],
  ['  "rollup": ', c('q', String(!!p.rollup))],
  c('d', '}'),
];

const SQL = [
  [c('q', 'INSERT INTO'), ' wikipedia'],
  [c('q', 'SELECT'), " TIME_FLOOR(__time, 'PT1M') AS __time,"],
  '       channel, countryName,',
  '       COUNT(*) AS "count",',
  '       SUM(added) AS sum_added',
  [c('q', 'FROM'), ' TABLE(EXTERN(…))'],
  [c('q', 'GROUP BY'), ' 1, 2, 3'],
  [c('q', 'PARTITIONED BY'), ' DAY'],
  c('d', '-- context: finalizeAggregations = false'),
];

// best-effort: 같은 키(09:01, #en, US)가 두 세그먼트에 나뉘어 남는다
const segRows = (rows) =>
  grid(
    [
      { name: '__time', w: 6, tone: 'n' },
      { name: 'ch', w: 3, tone: 'i' },
      { name: 'co', w: 2, tone: 'i' },
      { name: 'count', w: 5, tone: 'g', align: 'right' },
      { name: 'sum', w: 3, tone: 'g', align: 'right' },
    ],
    rows,
  );
const SEG_A = segRows([
  ['09:00', '#ko', 'KR', '2', '17'],
  [c('q', '09:01'), c('q', '#en'), c('q', 'US'), c('q', '1'), c('q', '20')],
]);
const SEG_B = segRows([
  [c('q', '09:01'), c('q', '#en'), c('q', 'US'), c('q', '1'), c('q', '94')],
  ['09:02', '#ko', 'KR', '1', '8'],
]);
const MERGED = segRows([[c('q', '09:01'), c('q', '#en'), c('q', 'US'), c('q', '2'), c('q', '114')]]);

const nodes = [
  { id: 'raw', x: 0, y: 2, title: 'input events', lines: [], tone: 'n', caption: '들어온 이벤트 열 건' },
  { id: 'rolled', x: 62, y: 2, title: 'segment rows', lines: [], tone: 'g', caption: '세그먼트에 저장되는 행' },
  { id: 'spec', x: 0, y: 19, title: 'ingestion spec', lines: [], tone: 'q' },
  { id: 'stats', x: 62, y: 19, title: 'rollup ratio', lines: [], tone: 'q', caption: '롤업 비율' },
  { id: 'sql', x: 38, y: 19, title: 'SQL-based ingestion', lines: SQL, tone: 'm', caption: 'SQL 로 롤업하기' },

  { id: 'segA', x: 0, y: 19, title: 'segment A (task 1)', lines: SEG_A, tone: 'i', caption: '태스크 1 이 게시한 세그먼트' },
  { id: 'segB', x: 38, y: 19, title: 'segment B (task 2)', lines: SEG_B, tone: 'i', caption: '태스크 2 가 게시한 세그먼트' },
  { id: 'merge', x: 76, y: 20, title: 'query-time merge', lines: MERGED, tone: 'q', caption: '쿼리할 때 다시 합쳐요' },
];

const edges = [
  { id: 'ingest', from: 'raw', to: 'rolled', via: 'r-l', tone: 'g', label: 'ingest' },
  { id: 'toStats', from: 'rolled', to: 'stats', via: 'bl-t', tone: 'q' },
  { id: 'aMerge', from: 'segA', to: 'merge', via: 't-t', offset: 22, tone: 'q' },
  { id: 'bMerge', from: 'segB', to: 'merge', via: 'r-l', tone: 'q' },
];

// 단계마다 표를 조작 값에 맞춰 채운다
const fill = (p, o = {}) => ({
  raw: { lines: rawLines(p, o.raw || {}), title: o.raw?.trunc ? 'input events + truncated __time' : 'input events' },
  rolled: {
    lines: rolledLines(p, o.rolled || {}),
    title: !p.rollup ? 'segment rows (rollup off)' : o.rolled?.user ? 'segment rows (dims + user)' : 'segment rows',
  },
  spec: { lines: specLines(p) },
  stats: { lines: statsLines(p, o.stats || {}) },
  ingest: { label: p.rollup ? `10 → ${rolled(p).length} rows` : 'no rollup' },
});

export default {
  title: '데이터 모델과 롤업',
  docs: [
    ['Rollup', 'https://druid.apache.org/docs/latest/ingestion/rollup'],
    ['Schema model', 'https://druid.apache.org/docs/latest/ingestion/schema-model'],
    ['granularitySpec', 'https://druid.apache.org/docs/latest/ingestion/ingestion-spec#granularityspec'],
  ],
  legend: [
    ['타임스탬프', 'n'],
    ['차원', 'i'],
    ['지표', 'g'],
    ['잘린 시간, 합친 행', 'q'],
  ],
  controls: [
    { id: 'rollup', label: 'rollup 켜기', type: 'toggle', value: true },
    { id: 'qg', label: '<code>queryGranularity</code>', type: 'seg', options: [['none', 'none'], ['minute', 'minute'], ['hour', 'hour']], value: 'minute' },
  ],
  nodes,
  edges,
  steps: [
    {
      title: '데이터 모델: __time, 차원, 지표',
      show: ['raw'],
      on: ['raw'],
      patch: (p) => fill(p),
      body: `<p>Druid 테이블의 컬럼은 세 가지예요. 늘 있는 기본 타임스탬프 <b><code>__time</code></b>(<code>timestampSpec</code> 으로 읽어요), 값을 그대로 저장하는 <b class="i">차원</b>(<code>dimensionsSpec</code>), 집계해서 저장하는 <b class="g">지표</b>(<code>metricsSpec</code>).</p>
      <p>여기서는 위키백과 편집 이벤트 열 건을 받아요. <code>channel</code>, <code>country</code> 는 차원, <code>added</code> 는 지표로 쓰고, <code>user</code> 는 이번 스키마에서 빼요.</p>`,
    },
    {
      title: 'queryGranularity: 시간을 잘라요',
      show: ['raw', 'spec'],
      on: ['raw', 'spec'],
      patch: (p) => fill(p, { raw: { trunc: true } }),
      body: (p) => `<p><code>queryGranularity</code> 는 행마다 타임스탬프를 얼마나 잘게 남길지 정해요. <b>${p.qg}</b> 이면 <code>09:00:41</code> 이 <code>${TRUNC[p.qg]('09:00:41')}</code> 이 돼요. 이보다 거친 단위로는 쿼리할 수 있지만 더 잘게는 못 해요.</p>
      <p>기본값은 <code>none</code>(자르지 않음)이에요. 그래도 롤업은 켜져 있어서, 타임스탬프까지 똑같은 행은 합쳐져요.</p>
      <p class="note">설명 칸 아래에서 <code>none</code>, <code>minute</code>, <code>hour</code> 를 바꿔 보세요.</p>`,
    },
    {
      title: '롤업: 같은 행을 하나로',
      show: ['raw', 'rolled'],
      on: ['raw', 'rolled', 'ingest'],
      patch: (p) => fill(p),
      hold: 12,
      body: (p) => `<p>롤업(기본값 켜짐)은 잘린 타임스탬프와 차원 값이 <b>모두 같은 행을 하나로</b> 합쳐요. 지표는 집계돼요: <code>count</code> 는 합친 이벤트 수, <code>sum_added</code> 는 <code>added</code> 의 합이에요.</p>
      <p>${p.rollup ? `지금 설정이면 열 건이 <b>${rolled(p).length}행</b>으로 줄어요. 그 대신 합쳐진 뒤에는 <b>개별 이벤트를 다시 볼 수 없어요</b>.` : '지금은 롤업을 껐어요. 이벤트 하나가 한 행으로 그대로 들어가서, 개별 이벤트를 모두 다시 볼 수 있는 대신 저장할 행이 줄지 않아요.'}</p>`,
      play: async (s) => {
        await s.send('ingest', { dur: 1.2, glyph: '▸' });
        const rows = rolled(s.params);
        if (!s.params.rollup) {
          await s.wait(2);
          return;
        }
        for (let k = 0; k < rows.length; k++) {
          s.patch('raw', { lines: rawLines(s.params, { hot: rows[k].src }) });
          s.patch('rolled', { lines: rolledLines(s.params, { hot: k }) });
          await s.wait(1);
        }
        s.patch('raw', { lines: rawLines(s.params) });
        s.patch('rolled', { lines: rolledLines(s.params) });
        await s.wait(0.8);
      },
      gap: 0.3,
    },
    {
      title: '롤업 비율 재기',
      show: ['raw', 'rolled', 'stats'],
      on: ['rolled', 'stats', 'toStats'],
      patch: (p) => fill(p),
      body: (p) => `<p>롤업이 얼마나 줄였는지는 이렇게 재요. <code>count</code> 는 수집할 때 만든 count 지표예요. 값이 클수록 롤업의 덕을 많이 봐요.</p>
      <pre><code>SELECT SUM("count") / (COUNT(*) * 1.0)
FROM wikipedia</code></pre>
      <p>${p.rollup ? `지금은 <b>${(10 / rolled(p).length).toFixed(2)}</b> 이에요.` : '롤업을 끄면 1.00 이에요.'} <code>queryGranularity</code> 를 거칠게(예: 1분 대신 5분) 잡으면 타임스탬프가 같아지는 행이 많아져 비율이 올라가요.</p>`,
      play: async (s) => {
        await s.send('toStats', { dur: 1, glyph: 'Σ' });
        s.pulse('stats');
        await s.wait(2);
      },
    },
    {
      title: '카디널리티가 높은 차원은 롤업을 깨요',
      show: ['raw', 'rolled', 'stats'],
      on: ['rolled', 'stats'],
      patch: (p) => fill(p, { rolled: { user: true }, stats: { withUser: true } }),
      hold: 10,
      body: (p) => `<p><code>user</code> 처럼 값이 거의 겹치지 않는 차원을 넣으면 합쳐질 행이 사라져요. 지금 설정에서 <code>user</code> 를 차원에 넣으면 <b>${rolled(p, ['ch', 'co', 'user']).length}행</b>이 남아요.</p>
      <p>공식 문서는 차원을 줄이고 카디널리티가 낮은 차원을 쓰라고 권해요. 고유 사용자 수처럼 카디널리티가 높은 값은 차원 대신 <b>스케치</b>(근사 집계) 지표로 담아요(근사 집계 장에서 자세히).</p>`,
    },
    {
      title: 'perfect 롤업과 best-effort 롤업',
      show: ['segA', 'segB', 'merge'],
      on: ['segA', 'segB', 'merge', 'aMerge', 'bMerge'],
      hold: 12,
      body: `<p>스트리밍처럼 여러 태스크가 나눠 받거나 세그먼트를 중간중간 게시하면, 같은 키의 행이 <b>서로 다른 세그먼트</b>에 남을 수 있어요. 이것이 <b>best-effort</b> 롤업이에요. 쿼리할 때 다시 합쳐지니 답은 같지만 행은 더 많이 저장돼요.</p>
      <p>Kafka, Kinesis 는 늘 best-effort, SQL 기반 배치는 늘 <b>perfect</b> 예요. 네이티브 배치는 <code>forceGuaranteedRollup</code> 과 hashed, single_dim, range 파티셔닝을 쓰면 perfect 예요. best-effort 로 쌓인 행은 나중에 컴팩션으로 다시 합칠 수 있어요.</p>`,
      play: async (s) => {
        s.pulse('segA');
        s.pulse('segB');
        await s.wait(0.8);
        await s.sendAll(['aMerge', 'bMerge'], { dur: 1.2, glyph: '●' });
        s.pulse('merge');
        await s.wait(2);
      },
    },
    {
      title: '스펙과 SQL 로 켜기',
      show: ['spec', 'sql'],
      on: ['spec', 'sql'],
      patch: (p) => fill(p),
      hold: 10,
      body: `<p>JSON 수집 스펙에서는 <code>granularitySpec</code> 으로 정해요. 기본값은 <code>segmentGranularity</code> 가 <code>day</code>, <code>queryGranularity</code> 가 <code>none</code>, <code>rollup</code> 이 <code>true</code> 예요.</p>
      <p>SQL 기반 수집에서는 <code>GROUP BY</code> 로 차원을 정하고, 컨텍스트에 <code>finalizeAggregations: false</code> 를 줘야 집계의 중간 상태가 세그먼트에 남아요. 수집 때의 <code>COUNT</code> 는 쿼리할 때 <code>SUM</code> 으로 합치고, <code>AVG</code> 대신 <code>SUM</code> 과 <code>COUNT</code> 를 담아 쿼리에서 나눠요.</p>`,
    },
  ],
};
