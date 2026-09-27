/*
 * 11 SQL 에서 네이티브로
 *
 * 위: SQL → (Broker 의 Calcite 계획기) → 네이티브 쿼리(JSON). 조작으로 예시 쿼리 넷
 * 중 하나를 고른다. 아래: 그 쿼리가 세그먼트 셋(09-27 의 파티션 p0, p1, p2)에서 계산되고
 * Broker 에서 합쳐지는 모양. 뒤의 두 단계는 TopN 의 근사와 GroupBy 의 메모리를 따로 본다.
 */
import { c, table, num } from '../ascii.js';

const QUERIES = {
  scan: {
    type: 'scan',
    sql: [
      [c('q', 'SELECT'), ' __time, channel, page'],
      [c('q', 'FROM'), ' wikipedia'],
      [c('q', 'WHERE'), " __time >= TIMESTAMP '2026-09-27'"],
      [c('q', 'LIMIT'), ' 5'],
    ],
    where: 2,
    native: [
      ['{ ', c('d', '"queryType":'), ' ', c('q', '"scan"'), ','],
      ['  ', c('d', '"dataSource":'), ' "wikipedia",'],
      ['  ', c('d', '"intervals":'), ' ["2026-09-27T00:00:00.000Z/…"],'],
      ['  ', c('d', '"columns":'), ' ["__time", "channel", "page"],'],
      ['  ', c('d', '"limit":'), ' 5 }'],
    ],
    intervals: 2,
    rule: 0,
  },
  timeseries: {
    type: 'timeseries',
    sql: [
      [c('q', 'SELECT'), ' FLOOR(__time TO HOUR) AS hour,'],
      '       SUM(added) AS added',
      [c('q', 'FROM'), ' wikipedia'],
      [c('q', 'WHERE'), " __time >= TIMESTAMP '2026-09-27'"],
      [c('q', 'GROUP BY'), ' 1'],
    ],
    where: 3,
    native: [
      ['{ ', c('d', '"queryType":'), ' ', c('q', '"timeseries"'), ','],
      ['  ', c('d', '"dataSource":'), ' "wikipedia",'],
      ['  ', c('d', '"intervals":'), ' ["2026-09-27T00:00:00.000Z/…"],'],
      ['  ', c('d', '"granularity":'), ' "hour",'],
      ['  ', c('d', '"aggregations":'), ' [{ "type": "longSum",'],
      '      "name": "added", "fieldName": "added" }] }',
    ],
    intervals: 2,
    rule: 1,
  },
  topn: {
    type: 'topN',
    sql: [
      [c('q', 'SELECT'), ' page, SUM(added) AS added'],
      [c('q', 'FROM'), ' wikipedia'],
      [c('q', 'WHERE'), " __time >= TIMESTAMP '2026-09-27'"],
      [c('q', 'GROUP BY'), ' page'],
      [c('q', 'ORDER BY'), ' added DESC'],
      [c('q', 'LIMIT'), ' 3'],
    ],
    where: 2,
    native: [
      ['{ ', c('d', '"queryType":'), ' ', c('q', '"topN"'), ','],
      ['  ', c('d', '"dataSource":'), ' "wikipedia",'],
      ['  ', c('d', '"intervals":'), ' ["2026-09-27T00:00:00.000Z/…"],'],
      ['  ', c('d', '"dimension":'), ' "page",'],
      ['  ', c('d', '"metric":'), ' "added", ', c('d', '"threshold":'), ' 3,'],
      ['  ', c('d', '"aggregations":'), ' [{ "type": "longSum",'],
      '      "name": "added", "fieldName": "added" }] }',
    ],
    intervals: 2,
    rule: 2,
  },
  groupby: {
    type: 'groupBy',
    sql: [
      [c('q', 'SELECT'), ' channel, isRobot,'],
      '       COUNT(*) AS edits',
      [c('q', 'FROM'), ' wikipedia'],
      [c('q', 'WHERE'), " __time >= TIMESTAMP '2026-09-27'"],
      [c('q', 'GROUP BY'), ' channel, isRobot'],
    ],
    where: 3,
    native: [
      ['{ ', c('d', '"queryType":'), ' ', c('q', '"groupBy"'), ','],
      ['  ', c('d', '"dataSource":'), ' "wikipedia",'],
      ['  ', c('d', '"intervals":'), ' ["2026-09-27T00:00:00.000Z/…"],'],
      ['  ', c('d', '"dimensions":'), ' ["channel", "isRobot"],'],
      ['  ', c('d', '"granularity":'), ' "all",'],
      ['  ', c('d', '"aggregations":'), ' [{ "type": "count",'],
      '                     "name": "edits" }] }',
    ],
    intervals: 2,
    rule: 3,
  },
};
const NAME = { scan: 'Scan', timeseries: 'Timeseries', topn: 'TopN', groupby: 'GroupBy' };

// Calcite 계획기의 규칙(sql-translation 의 Query types)
const RULES = [
  [['no aggregation', '(no GROUP BY, no DISTINCT)'], 'scan'],
  [['GROUP BY FLOOR(__time TO ..) only', 'or a grand total, no HAVING'], 'timeseries'],
  [['GROUP BY one expression', '+ ORDER BY + LIMIT, no HAVING'], 'topN'],
  [['anything else'], 'groupBy'],
];
function planLines(pick = -1) {
  const out = [];
  RULES.forEach(([text, type], i) => {
    const on = i === pick;
    const mark = on ? c('q', '> ') : '  ';
    text.forEach((t, k) => {
      const left = (t + ' '.repeat(34)).slice(0, 34);
      const line = [k === 0 ? mark : '  ', on ? c('b', left) : pick >= 0 ? c('d', left) : left];
      // 빈 문자열 조각은 넣지 않는다(그림판이 빈 조각을 빈칸 하나로 그린다)
      if (k === 0) line.push(on ? c('q', `-> ${type}`) : c('d', `-> ${type}`));
      out.push(line);
    });
  });
  return out;
}

// 쿼리 줄에서 한 줄만 밝히기(__time 조건, intervals)
const lit = (lines, k) => lines.map((l, i) => (i === k ? [c('y', '> '), ...(Array.isArray(l) ? l : [l])] : ['  ', ...(Array.isArray(l) ? l : [l])]));

// ── 세그먼트 셋(09-27 의 p0, p1, p2)의 부분 결과 ──
const TS = [
  [1204, 987, 1433],
  [845, 1120, 690],
  [402, 511, 877],
];
const TOPN = [
  [['Main', 90], ['Seoul', 70], ['Jazz', 50], ['Mars', 45], ['Kpop', 10]],
  [['Seoul', 80], ['Kpop', 60], ['Main', 40], ['Mars', 38], ['Jazz', 5]],
  [['Main', 70], ['Kpop', 45], ['Jazz', 40], ['Mars', 34], ['Seoul', 20]],
];
const GB = [
  [['#en', 'false', 41], ['#en', 'true', 7], ['#ko', 'false', 12]],
  [['#en', 'false', 38], ['#ko', 'false', 9], ['#ko', 'true', 2]],
  [['#en', 'false', 44], ['#en', 'true', 5], ['#ja', 'false', 11]],
];
const SCAN = [
  [['09:00:02', '#en', 'Apple'], ['09:00:07', '#ko', 'Seoul']],
  [['09:00:03', '#ja', 'Tokyo'], ['09:00:09', '#en', 'Mars']],
  [['09:00:05', '#fr', 'Paris'], ['09:00:11', '#ko', 'Busan']],
];

function segLines(q, k, detail = false) {
  if (q === 'scan') return [...SCAN[k].map((r) => r.join(' ')), c('d', 'batch -> broker')];
  if (q === 'timeseries') return TS[k].map((v, h) => [`h0${h}  `, c('q', num(v).padStart(5))]);
  if (q === 'topn') {
    const rows = detail ? TOPN[k] : TOPN[k].slice(0, 3);
    return rows.map(([p, v], i) => (i < 3 ? [`${i + 1} ${p.padEnd(6)}`, c('q', String(v).padStart(4))] : [c('d', `${i + 1} ${p.padEnd(6)}${String(v).padStart(4)}`), c('x', ' cut')]));
  }
  return GB[k].map(([ch, rb, n]) => [`${ch} ${rb.padEnd(6)}`, c('q', String(n).padStart(3))]);
}

function mergeLines(q) {
  if (q === 'scan') return ['concatenate batches', 'no aggregation', c('d', 'stream as it arrives')];
  if (q === 'timeseries') return ['sum per hour bucket', 'no hash table needed', c('d', 'stream as it arrives')];
  if (q === 'topn') return ['sum the local top 3s', 'keep global top 3', c('d', 'computed in memory')];
  return ['merge by key (exact)', 'hash table per query', c('d', 'stream: no ORDER BY')];
}

function sumTop() {
  const m = new Map();
  TOPN.forEach((rows) => rows.slice(0, 3).forEach(([p, v]) => m.set(p, (m.get(p) || 0) + v)));
  return [...m].sort((a, b) => b[1] - a[1]);
}
function sumExact() {
  const m = new Map();
  TOPN.forEach((rows) => rows.forEach(([p, v]) => m.set(p, (m.get(p) || 0) + v)));
  return [...m].sort((a, b) => b[1] - a[1]);
}

function resultLines(q) {
  if (q === 'scan') {
    const rows = SCAN.flat().slice(0, 5);
    return table(['__time', 'channel', 'page'], rows.map((r) => [r[0], r[1], c('q', r[2])]));
  }
  if (q === 'timeseries') {
    return table(['hour', 'added'], [0, 1, 2].map((h) => [`2026-09-27 0${h}:00`, c('q', num(TS[0][h] + TS[1][h] + TS[2][h]))]), { align: ['left', 'right'] });
  }
  if (q === 'topn') {
    return [...table(['page', 'added'], sumTop().slice(0, 3).map(([p, v]) => [p, c('q', String(v))]), { align: ['left', 'right'] }), c('d', 'approximate (K=3 here)')];
  }
  const m = new Map();
  GB.flat().forEach(([ch, rb, n]) => m.set(`${ch} ${rb}`, (m.get(`${ch} ${rb}`) || 0) + n));
  return table(['channel', 'isRobot', 'edits'], [...m].sort().map(([k, n]) => [...k.split(' '), c('q', String(n))]), { align: ['left', 'left', 'right'] });
}

const MEM = (st = {}) => {
  const buf = (k) => (st.merge?.[k] ? c('q', `[${st.merge[k]}]`) : c('d', '[  ]'));
  return [
    ['processing  ', c('i', '[t1] [t2] [t3]'), c('d', '  one buffer each')],
    [c('d', '            per-segment hash table (off-heap)')],
    ['merge       ', buf(0), ' ', buf(1), c('d', '       max(2, 3 / 4) = 2')],
    ['waiting     ', st.wait ? c('x', st.wait) : c('d', '-')],
    '---',
    [c('d', 'maxOnDiskStorage = 0 (default) -> no spill')],
    st.full ? [c('x', 'table full -> "Resource limit exceeded"')] : [c('d', 'table full -> "Resource limit exceeded"')],
  ];
};

const NOTES = table(
  ['SQL shape', 'native query'],
  [
    ['GROUP BY page ORDER BY page LIMIT 3', [c('q', 'groupBy'), c('d', ' (v34+)')]],
    ['... LIMIT 10 OFFSET 20', c('q', 'scan or groupBy')],
    ['useApproximateTopN = false', [c('q', 'groupBy'), c('d', ' (exact)')]],
    ['HAVING, or nested aggregation', c('q', 'groupBy')],
    ['groupBy v1 engine', c('x', 'removed in v28')],
  ],
);

const nodes = (P) => {
  const q = P.q;
  const Q = QUERIES[q];
  return [
    { id: 'sql', x: 0, y: 0, title: 'SQL', lines: Q.sql, w: 44, tone: 'n', caption: '보낸 SQL' },
    { id: 'plan', x: 52, y: 0, title: 'Calcite planner', tag: 'Broker', lines: planLines(), tone: 'q', caption: 'Broker 의 계획기: 네 규칙' },
    { id: 'native', x: 52, y: 13, title: 'native query', tag: 'JSON', lines: Q.native, w: 48, tone: 'q', caption: '데이터 서버가 받는 쿼리' },

    { id: 's0', x: 0, y: 27, title: 'segment p0', lines: segLines(q, 0), w: 22, tone: 'i', caption: '09-27, 파티션 0' },
    { id: 's1', x: 28, y: 27, title: 'segment p1', lines: segLines(q, 1), w: 22, tone: 'i', caption: '09-27, 파티션 1' },
    { id: 's2', x: 56, y: 27, title: 'segment p2', lines: segLines(q, 2), w: 22, tone: 'i', caption: '09-27, 파티션 2' },
    { id: 'merge', x: 8, y: 37, title: 'Broker merge', tag: NAME[q], lines: mergeLines(q), w: 26, tone: 'q', caption: 'Broker 에서 합치기' },
    { id: 'result', x: 44, y: 37, title: 'result', lines: resultLines(q), tone: 'q' },
    { id: 'exact', x: 84, y: 27, title: 'exact answer', tag: 'groupBy', lines: table(['page', 'added'], sumExact().slice(0, 3).map(([p, v]) => [p, c('g', String(v))]), { align: ['left', 'right'] }), tone: 'g', caption: '정확한 답(비교용)' },

    { id: 'mem', x: 0, y: 27, title: 'Historical memory', tag: 'groupBy', lines: MEM(), tone: 'i', caption: '처리 버퍼와 병합 버퍼' },
    { id: 'notes', type: 'text', x: 52, y: 13, lines: NOTES },
  ];
};

const edges = [
  { id: 'sp', from: 'sql', to: 'plan', via: 'r-l', tone: 'q', label: 'parse' },
  { id: 'pn', from: 'plan', to: 'native', via: 'b-t', tone: 'q', label: 'plan' },
  { id: 'ns', from: 'native', to: 's1', via: 'bl-t', cy: 24.5, tone: 'q', label: 'run on segments' },
  { id: 'm0', from: 's0', to: 'merge', via: 'b-t', cy: 35, tone: 'q' },
  { id: 'm1', from: 's1', to: 'merge', via: 'b-t', cy: 35, tone: 'q' },
  { id: 'm2', from: 's2', to: 'merge', via: 'b-t', cy: 35, tone: 'q' },
  { id: 'mr', from: 'merge', to: 'result', via: 'r-l', tone: 'q' },
];

const TOP = ['sql', 'plan', 'native'];
const EXEC = ['s0', 's1', 's2', 'merge', 'result'];
const GLYPH = { scan: '≡', timeseries: 'Σ', topn: '▲', groupby: '#' };

export default {
  title: 'SQL 에서 네이티브로',
  docs: [
    ['SQL query translation', 'https://druid.apache.org/docs/latest/querying/sql-translation'],
    ['TopN queries', 'https://druid.apache.org/docs/latest/querying/topnquery'],
    ['GroupBy queries', 'https://druid.apache.org/docs/latest/querying/groupbyquery'],
  ],
  legend: [
    ['쿼리, 계획', 'q'],
    ['세그먼트, 처리 스레드', 'i'],
    ['정확한 답', 'g'],
    ['잘린 값', 'x'],
  ],
  controls: [
    {
      id: 'q',
      label: '예시 쿼리',
      type: 'seg',
      options: [
        ['scan', '행 그대로'],
        ['timeseries', '시간별 합계'],
        ['topn', '상위 3개'],
        ['groupby', '두 열로 묶기'],
      ],
      value: 'timeseries',
    },
  ],
  nodes,
  edges,
  steps: [
    {
      title: 'SQL 이 네이티브 쿼리가 되기까지',
      show: TOP,
      on: [...TOP, 'sp', 'pn'],
      dim: false,
      body: `<p>Druid SQL 은 <b class="q">Broker</b> 에서 계획돼요. Broker 는 Apache Calcite 로 SQL 을 해석하고, 데이터 서버가 알아듣는 <b>네이티브 쿼리</b>(JSON)로 바꿔서 실행해요.</p>
      <p>오른쪽 칸 아래에서 <b>예시 쿼리</b> 넷 중 하나를 고를 수 있어요. 고른 SQL 이 어떤 네이티브 쿼리가 되는지, 그리고 세그먼트에서 어떻게 계산되는지 차례로 봐요.</p>`,
      play: async (s) => {
        s.pulse('sql');
        await s.send('sp', { dur: 1, glyph: '{ }' });
        s.pulse('plan');
        await s.wait(0.5);
        await s.send('pn', { dur: 1, glyph: '{ }' });
        s.pulse('native');
        await s.wait(2.2);
      },
    },
    {
      title: '네 가지 네이티브 쿼리와 고르는 규칙',
      show: TOP,
      on: ['plan', 'native', 'pn'],
      patch: (P) => ({ plan: { lines: planLines(QUERIES[P.q].rule) } }),
      body: (P) => `<p>SQL 은 네 가지 네이티브 쿼리 중 하나가 돼요.</p>
      <ul>
        <li><b>Scan</b>: 집계가 없을 때(GROUP BY 도 DISTINCT 도 없음).</li>
        <li><b>Timeseries</b>: <code>FLOOR(__time TO …)</code> 나 <code>TIME_FLOOR</code> 로만 묶거나, GROUP BY 없이 전체를 합칠 때. HAVING 과 중첩이 없어야 해요.</li>
        <li><b>TopN</b>: 식 하나로 묶고 ORDER BY 와 LIMIT 이 있으며, HAVING 과 중첩이 없을 때.</li>
        <li><b>GroupBy</b>: 그 밖의 모든 집계.</li>
      </ul>
      <p>지금 고른 쿼리는 <b class="q">${NAME[P.q]}</b> 가 돼요. 예시 쿼리를 바꿔 보세요.</p>`,
      play: async (s) => {
        s.pulse('plan');
        await s.send('pn', { dur: 1, glyph: '{ }' });
        s.pulse('native');
        await s.wait(2.6);
      },
    },
    {
      title: '__time 조건은 intervals 로',
      show: TOP,
      on: ['sql', 'native'],
      patch: (P) => ({ sql: { lines: lit(QUERIES[P.q].sql, QUERIES[P.q].where) }, native: { lines: lit(QUERIES[P.q].native, QUERIES[P.q].intervals) } }),
      body: `<p><code>__time</code> 에 거는 조건은 되도록 네이티브 쿼리의 <code>intervals</code> 로 바뀌어요. Broker 는 이것으로 쿼리할 세그먼트를 시간으로 먼저 걸러요(쿼리의 여정 장).</p>
      <p>절대 시각과의 비교(<code>__time >= TIMESTAMP '…'</code>), 상대 시각(<code>CURRENT_TIMESTAMP - INTERVAL …</code>), 특정한 날(<code>FLOOR(__time TO DAY) = …</code>) 같은 꼴을 알아봐요. 제대로 바뀌었는지는 <code>EXPLAIN PLAN FOR</code> 로 확인할 수 있어요.</p>`,
      play: async (s) => {
        s.pulse('sql');
        await s.wait(0.8);
        s.pulse('native');
        await s.wait(2.6);
      },
    },
    {
      title: '세그먼트에서 Broker 까지',
      show: ['native', ...EXEC],
      on: [...EXEC, 'ns', 'm0', 'm1', 'm2', 'mr'],
      dim: false,
      focus: ['native', ...EXEC],
      hold: 10,
      body: (P) =>
        ({
          scan: `<p><b>Scan</b> 은 집계하지 않고 행을 그대로 <b>흘려보내요</b>. 한 번에 최대 <code>batchSize</code>(기본 20,480) 행씩 묶어 보내고, Broker 는 받은 묶음을 이어 붙이기만 해요.</p>
          <p>다른 쿼리와 달리 Scan 은 서버에서 세그먼트를 <b>스레드 하나가 차례대로</b> 읽어요. 그림의 조각들이 p0, p1, p2 순서로 오는 까닭이에요.</p>`,
          timeseries: `<p><b>Timeseries</b> 는 세그먼트마다 시간 칸(여기서는 한 시간)별로 부분 합을 내고, Broker 가 같은 칸끼리 더해요.</p>
          <p>세그먼트가 이미 시간순으로 정렬돼 있어서, 해시 테이블 없이 흘려보내면서 합칠 수 있어요. 시간으로만 묶는 쿼리라면 GroupBy 보다 대체로 빨라요.</p>`,
          topn: `<p><b>TopN</b> 은 세그먼트마다 제 안에서 상위 K 개만 남겨 올려 보내고, Broker 가 모아서 다시 상위 N 개를 골라요. K 는 <code>max(1000, threshold)</code> 예요. 그림은 K 를 3 으로 줄여 그렸어요.</p>
          <p>결과는 메모리에서 다 계산한 뒤 돌려줘요. 이 방식이 왜 근사인지는 다음 단계에서 봐요.</p>`,
          groupby: `<p><b>GroupBy</b> 는 세그먼트마다 오프힙 해시 테이블에 묶음별 부분 결과를 쌓고, 서버에서 한 번, Broker 에서 한 번 더 키별로 합쳐요. 결과와 순위가 정확해요.</p>
          <p>ORDER BY 가 없거나 묶은 식 그대로 정렬하면 Broker 가 합치는 대로 흘려보내요. 집계값으로 정렬하면 LIMIT 까지 모은 뒤 돌려줘요.</p>`,
        })[P.q] + '<p class="note">예시 쿼리를 바꾸면 세그먼트 안의 부분 결과와 합치는 방법이 함께 바뀌어요.</p>',
      play: async (s) => {
        const q = s.params.q;
        const g = GLYPH[q];
        s.state('result', 'hidden');
        await s.send('ns', { dur: 1, glyph: '{ }' });
        ['s0', 's1', 's2'].forEach((id) => s.pulse(id));
        await s.wait(0.6);
        if (q === 'scan') {
          // 스레드 하나가 세그먼트를 차례대로
          for (const [k, e] of [['s0', 'm0'], ['s1', 'm1'], ['s2', 'm2']]) {
            s.pulse(k);
            await s.send(e, { dur: 0.8, glyph: g });
          }
        } else {
          await s.sendAll(['m0', 'm1', 'm2'], { dur: 1.1, glyph: g });
        }
        s.pulse('merge');
        await s.wait(0.5);
        await s.send('mr', { dur: 0.8, glyph: g });
        s.state('result', null);
        s.pulse('result');
        await s.wait(2.6);
      },
      gap: 0.3,
    },
    {
      title: 'TopN 의 근사',
      show: ['s0', 's1', 's2', 'merge', 'result', 'exact'],
      on: ['s0', 's1', 's2', 'merge', 'result', 'exact', 'm0', 'm1', 'm2', 'mr'],
      dim: false,
      focus: ['s0', 's1', 's2', 'merge', 'result', 'exact'],
      patch: () => ({
        s0: { lines: segLines('topn', 0, true), tag: 'top 3' },
        s1: { lines: segLines('topn', 1, true), tag: 'top 3' },
        s2: { lines: segLines('topn', 2, true), tag: 'top 3' },
        merge: { lines: mergeLines('topn'), tag: 'topN' },
        result: { lines: resultLines('topn') },
      }),
      hold: 12,
      body: `<p>TopN 은 세그먼트마다 상위 K 개만 올려 보내요. 그래서 모든 세그먼트에서 조금씩 밀려난 값은 <b>통째로 빠질 수</b> 있고, 합계도 모자랄 수 있어요. 그림(K = 3)에서 <code>Mars</code> 는 다 더하면 3등(117)이지만 어느 세그먼트에서도 3위 안에 들지 못해 빠졌어요. 대신 <code>Kpop</code> 이 들어갔고, <code>Seoul</code> 의 합도 150 으로 모자라요(실제 170).</p>
      <p>이런 일은 서로 다른 값이 <b>1,000 개를 넘을 때만</b> 생겨요(K 의 기본이 1,000, <code>minTopNThreshold</code>). 정확한 순위가 필요하면 <code>useApproximateTopN</code> 을 꺼서 GroupBy 로 돌리면 돼요.</p>`,
      play: async (s) => {
        s.state('exact', 'dim');
        await s.sendAll(['m0', 'm1', 'm2'], { dur: 1.2, glyph: '▲3' });
        s.pulse('merge');
        await s.wait(0.4);
        await s.send('mr', { dur: 0.8, glyph: '▲' });
        s.pulse('result');
        await s.wait(1.2);
        s.state('exact', null);
        s.pulse('exact');
        await s.wait(3);
      },
      gap: 0.3,
    },
    {
      title: 'GroupBy 와 메모리',
      show: ['mem'],
      on: ['mem'],
      focus: ['mem'],
      hold: 12,
      body: `<p>GroupBy 는 세그먼트를 처리할 때 처리 스레드마다의 버퍼 안에 있는 <b>오프힙 해시 테이블</b>로 묶어요. 서버에서 부분 결과를 합칠 때는 쿼리마다 <b>병합 버퍼</b> 하나가 필요한데, 그 수(<code>druid.processing.numMergeBuffers</code>, 기본 <code>max(2, numThreads / 4)</code>)가 곧 동시에 돌 수 있는 GroupBy 쿼리의 수예요.</p>
      <p>테이블이 넘칠 때 디스크로 흘려 쓰기(spill)는 <code>maxOnDiskStorage</code> 가 0 보다 클 때만 해요. 기본은 0 이라, 넘치면 "Resource limit exceeded" 오류가 나요.</p>`,
      play: async (s) => {
        const st = { merge: [], wait: '' };
        const draw = () => s.patch('mem', { lines: MEM(st) });
        draw();
        await s.wait(0.8);
        for (const q of ['q1', 'q2', 'q3']) {
          const free = [0, 1].find((k) => !st.merge[k]);
          if (free === undefined) st.wait = `${q} waits for a merge buffer`;
          else st.merge[free] = q;
          draw();
          s.pulse('mem');
          await s.wait(1);
        }
        await s.wait(1);
        st.merge[0] = 'q3';
        st.wait = '';
        draw();
        s.pulse('mem');
        await s.wait(1.4);
        st.full = true;
        draw();
        await s.wait(2);
      },
      gap: 0.4,
    },
    {
      title: '알아 두면 좋은 것',
      show: ['plan', 'notes'],
      on: ['notes'],
      focus: ['plan', 'notes'],
      patch: () => ({ plan: { lines: planLines(3) } }),
      body: `<ul>
        <li>v34 부터 값 순서(사전순)로 정렬하는 TopN 모양은 GroupBy 로 계획돼요(<code>useLexicographicTopN</code> 기본 false). GroupBy 는 벡터화돼 있고 TopN 은 아니기 때문이에요.</li>
        <li><code>OFFSET</code> 은 Scan 과 GroupBy 만 지원해서, 쓰면 둘 중 하나로 바뀌어요.</li>
        <li>HAVING 이나 중첩 집계가 있으면 GroupBy 가 돼요.</li>
        <li>GroupBy v1 엔진은 28 에서 없어졌어요. 이제 엔진은 하나예요.</li>
      </ul>`,
    },
  ],
};
