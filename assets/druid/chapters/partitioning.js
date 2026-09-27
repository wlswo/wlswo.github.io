/*
 * 06 파티셔닝
 *
 * 위쪽(1 , 2단계)은 하루치 타임라인이다: 한 칸이 한 시간, 두 글자 하나가 wikipedia
 * 편집 한 건(글자는 countryName 의 나라 코드). 조작 ① 로 segmentGranularity 를
 * 바꾸면 청크 경계(│)가 다시 그어진다.
 *
 * 아래쪽(3단계부터)은 그 하루 청크 하나(36행)를 세 줄로 펼친다: dynamic , hashed ,
 * range. 같은 행들이 줄마다 다르게 세그먼트(p0 p1 p2)에 담긴다. 7단계는 Broker 가
 * 필터(조작 ②)로 건너뛸 세그먼트를 고르는 모습이다.
 */
import { c, bar } from '../ascii.js';

// ── 데이터: 하루치 편집 36건(시간 순) ────────────────────────────
const COUNTRY = {
  BR: { name: 'Brazil', tone: 'y' },
  FR: { name: 'France', tone: 'p' },
  DE: { name: 'Germany', tone: 'g' },
  JP: { name: 'Japan', tone: 'm' },
  KR: { name: 'South Korea', tone: 'q' },
  US: { name: 'United States', tone: 'i' },
};
// 이름(값)의 사전 순서 — range 파티셔닝은 이 순서로 자른다
const BY_NAME = Object.keys(COUNTRY).sort((a, b) => (COUNTRY[a].name < COUNTRY[b].name ? -1 : 1));

const ROWS = (
  '00KR 00US 01JP 02US 03DE 03KR 04FR 05US 05BR 06KR 07JP 07US ' +
  '08DE 08KR 09US 09FR 10BR 11JP 11KR 12US 12DE 13KR 14JP 14US ' +
  '15FR 15KR 16US 16BR 17DE 18JP 18KR 19US 20BR 21KR 22FR 23US'
)
  .split(' ')
  .map((s, i) => ({ i, h: Number(s.slice(0, 2)), c: s.slice(2) }));

const tok = (r, dim = false) => (dim ? c('d', r.c) : c(COUNTRY[r.c].tone, r.c));

// 세 가지 나누기. 해시 값은 이해를 돕는 예시다(실제 값은 murmur3_32_abs 가 정한다).
const BUCKET = { KR: 0, FR: 0, US: 1, BR: 1, JP: 2, DE: 2 };
const RANGE_OF = (code) => (COUNTRY[code].name < 'Japan' ? 0 : COUNTRY[code].name < 'United States' ? 1 : 2);
const LAYOUT = {
  dynamic: (r) => Math.floor(r.i / 12),
  hashed: (r) => BUCKET[r.c],
  range: (r) => RANGE_OF(r.c),
};
const segRows = (spec) => [0, 1, 2].map((k) => ROWS.filter((r) => LAYOUT[spec](r) === k));

const TAGS = {
  dynamic: ['rows 1-12', 'rows 13-24', 'rows 25-36'],
  hashed: ['hash % 3 = 0', 'hash % 3 = 1', 'hash % 3 = 2'],
  range: ['< JP', '>= JP, < US', '>= US'],
};

/** 세그먼트 상자의 줄: 토큰 세 줄(한 줄에 6개) + 요약. */
function segLines(rows) {
  const out = [];
  for (let k = 0; k < 18; k += 6) {
    const line = [];
    for (let j = k; j < k + 6; j++) {
      if (j > k) line.push(' ');
      line.push(rows[j] ? tok(rows[j]) : c('d', '..'));
    }
    out.push(line);
  }
  const distinct = new Set(rows.map((r) => r.c)).size;
  out.push(c('d', `${String(rows.length).padStart(2)} rows, ${distinct} value${distinct === 1 ? '' : 's'}`));
  return out;
}

// 들어오는 행(도착 = 시간 순). taken 에 든 행은 빈자리로
function streamLines(taken = new Set()) {
  const out = [c('d', 'incoming rows, in time order ->')];
  for (let k = 0; k < 36; k += 12) {
    const line = [];
    for (let j = k; j < k + 12; j++) {
      if (j > k) line.push(' ');
      line.push(taken.has(j) ? c('d', '..') : tok(ROWS[j]));
    }
    out.push(line);
  }
  return out;
}

// ── 1 , 2단계: 하루치 타임라인 ──────────────────────────────────
const CHUNK_H = { HOUR: 1, SIX_HOUR: 6, DAY: 24 };
const QUERY = [6, 12]; // __time >= 06:00 AND __time < 12:00

/**
 * upto: 이 시각까지의 행만(도착하는 모습). query: 1단계의 시간 필터를 보인다.
 */
function timeline(gran, { upto = 24, query = false } = {}) {
  const step = CHUNK_H[gran];
  const scanned = (h) => Math.floor(h / step) * step < QUERY[1] && Math.floor(h / step) * step + step > QUERY[0];
  const col = (h) => h * 4;
  const W = 24 * 4 + 1;
  const lines = [];
  // 시간 필터 괄호
  if (query) {
    const a = col(QUERY[0]);
    const b = col(QUERY[1]);
    const label = ' 06:00 - 12:00 ';
    const inner = b - a - 1;
    const left = Math.floor((inner - label.length) / 2);
    lines.push([' '.repeat(a), c('q', `[${'='.repeat(left)}${label}${'='.repeat(inner - left - label.length)}]`)]);
  } else lines.push(' ');
  // 시각 눈금
  lines.push([c('d', Array.from({ length: 24 }, (_, h) => ` ${String(h).padStart(2, '0')} `).join(''))]);
  // 윗변
  const edge = (l, m, r) => {
    const out = [];
    for (let x = 0; x < W; x++) {
      const h = x / 4;
      const boundary = x % 4 === 0 && (h % step === 0 || x === W - 1);
      out.push(x === 0 ? l : x === W - 1 ? r : boundary ? m : '─');
    }
    return c('b', out.join(''));
  };
  lines.push(edge('┌', '┬', '┐'));
  // 행: 한 시간에 많아야 두 건
  for (let row = 0; row < 2; row++) {
    const line = [];
    for (let h = 0; h < 24; h++) {
      const bound = h % step === 0;
      line.push(bound ? c('b', '│') : ' ');
      const r = ROWS.filter((x) => x.h === h)[row];
      if (!r || h >= upto) line.push('   ');
      else if (query && !scanned(h)) line.push(tok(r, true), ' ');
      else if (query && (h < QUERY[0] || h >= QUERY[1])) line.push(c('n', r.c), ' ');
      else line.push(tok(r), ' ');
    }
    line.push(c('b', '│'));
    lines.push(line);
  }
  lines.push(edge('└', '┴', '┘'));
  return lines;
}

function timeSummary(gran, query = false) {
  const step = CHUNK_H[gran];
  const chunks = 24 / step;
  const per = (36 / chunks).toFixed(chunks === 1 ? 0 : 1);
  const out = [
    [c('d', 'segmentGranularity: '), c('b', gran.padEnd(8)), '  -> ', c('b', `${chunks} time chunk${chunks > 1 ? 's' : ''}`), c('d', `  (${per} rows per chunk)`)],
  ];
  if (gran === 'HOUR') out.push(c('x', '   24 tiny chunks -> at least 24 tiny segments'));
  else out.push(' ');
  if (query) {
    const scanned = [];
    for (let s = 0; s < 24; s += step) if (s < QUERY[1] && s + step > QUERY[0]) scanned.push(s);
    const rows = ROWS.filter((r) => scanned.includes(Math.floor(r.h / step) * step)).length;
    out.push(' ');
    out.push([c('q', "WHERE __time >= '06:00' AND __time < '12:00'")]);
    out.push([c('d', '   chunks scanned: '), c('b', `${scanned.length} / ${chunks}`), c('d', '   rows read: '), c('b', String(rows)), c('d', '   rows matched: '), c('b', '10')]);
  }
  return out;
}

// ── 3단계부터: 청크 안의 세 줄 ─────────────────────────────────
const SPECS = ['dynamic', 'hashed', 'range'];
const ROW_Y = { dynamic: 26, hashed: 34, range: 42 };
const BOX_X = [14, 46, 78];
const LABEL = {
  dynamic: [c('b', 'dynamic'), c('d', 'in order')],
  hashed: [c('b', 'hashed'), c('d', 'hash(value)')],
  range: [c('b', 'range'), c('d', 'value range')],
};
const boxId = (spec, k) => `${spec[0]}${k}`;
const ALL_BOXES = SPECS.flatMap((s) => [0, 1, 2].map((k) => boxId(s, k)));

function hashLines(active = null) {
  const pair = (a, b) => {
    const one = (code) => {
      const t = `${code} ${COUNTRY[code].name}`.padEnd(17);
      return [active === code ? c('b', `▸ ${t}`) : `  ${t}`, c('d', '-> '), c(COUNTRY[code].tone, String(BUCKET[code]))];
    };
    return [...one(a), '    ', ...one(b)];
  };
  return [
    [c('d', 'partitionFunction: '), 'murmur3_32_abs'],
    [c('d', 'bucket = hash(countryName) % numShards'), c('b', ' (3)')],
    pair('KR', 'FR'),
    pair('US', 'BR'),
    pair('JP', 'DE'),
    c('d', '(bucket numbers are illustrative)'),
  ];
}

function distLines(grown = 6, cuts = true) {
  const counts = Object.fromEntries(BY_NAME.map((k) => [k, ROWS.filter((r) => r.c === k).length]));
  const out = [[c('d', 'pass 1  '), 'partial_dimension_distribution']];
  BY_NAME.forEach((k, i) => {
    const n = i < grown ? counts[k] : 0;
    const line = [`  ${COUNTRY[k].name.padEnd(14)}`, ...bar(n, 10, 10, { tone: COUNTRY[k].tone }), ` ${String(n).padStart(2)}`];
    if (cuts && (k === 'DE' || k === 'KR')) line.push(c('b', `  <- p${k === 'DE' ? 0 : 1} ends`));
    out.push(line);
  });
  return out;
}

const FILTERS = {
  eq: "countryName = 'South Korea'",
  in: "countryName IN ('Japan', 'South Korea')",
  like: "countryName LIKE 'South%'",
  city: "cityName = 'Seoul'",
};
// Broker 가 훑는 세그먼트(k). dynamic 은 나눈 기준이 없어 늘 모두.
const SCAN = {
  dynamic: { eq: [0, 1, 2], in: [0, 1, 2], like: [0, 1, 2], city: [0, 1, 2] },
  hashed: { eq: [0], in: [0, 2], like: [0, 1, 2], city: [0, 1, 2] },
  range: { eq: [1], in: [1], like: [0, 1, 2], city: [0, 1, 2] },
};
const WHY = {
  eq: 'hashed / range know where the value lives',
  in: 'each IN value is looked up separately',
  like: 'LIKE cannot prune (not hashable, not a range)',
  city: 'cityName is not a partition dimension',
};

function brokerLines(q) {
  const out = [[c('d', 'WHERE '), c('q', FILTERS[q])]];
  for (const s of SPECS) out.push([`${s.padEnd(8)} scan `, c('b', `${SCAN[s][q].length}/3`), c('d', `   skip ${3 - SCAN[s][q].length}`)]);
  out.push(c('d', WHY[q]));
  return out;
}

const SQL_LINES = [
  [c('q', 'REPLACE INTO '), 'wikipedia ', c('q', 'OVERWRITE ALL')],
  [c('q', 'SELECT '), '__time, countryName, ...'],
  [c('q', 'FROM '), 'TABLE(EXTERN(...))'],
  [c('q', 'PARTITIONED BY '), c('b', 'DAY')],
  [c('q', 'CLUSTERED BY '), c('b', 'countryName, cityName')],
];
const RULES = [
  [c('d', 'filter'.padEnd(42)), c('d', 'prune?')],
  ["countryName = 'South Korea'".padEnd(42), c('g', 'yes')],
  ["countryName IN ('Japan', 'South Korea')".padEnd(42), c('g', 'yes')],
  ['countryName = .. AND cityName = ..'.padEnd(42), c('g', 'yes')],
  ["cityName = 'Seoul'".padEnd(42), c('x', 'no'), c('d', '  leftmost dim missing')],
  ["countryName LIKE 'South%'".padEnd(42), c('x', 'no'), c('d', '  LIKE')],
  ['segments written by INSERT'.padEnd(42), c('x', 'no'), c('d', '  REPLACE only')],
];

function sortLines() {
  const p1 = ROWS.filter((r) => RANGE_OF(r.c) === 1);
  const byTime = p1.slice(0, 5);
  const byName = [...p1].sort((a, b) => (COUNTRY[a.c].name < COUNTRY[b.c].name ? -1 : COUNTRY[a.c].name > COUNTRY[b.c].name ? 1 : a.h - b.h)).slice(0, 5);
  const hh = (r) => `${String(r.h).padStart(2, '0')}:00`;
  const out = [[c('d', 'rows inside p1 (>= JP, < US)')]];
  out.push([c('b', '__time first (default)'), '   ', c('d', 'forceSegmentSortByTime=false')]);
  for (let k = 0; k < 5; k++) {
    const a = byTime[k];
    const b = byName[k];
    out.push([`${hh(a)} `, c(COUNTRY[a.c].tone, COUNTRY[a.c].name.padEnd(13)), '      ', c(COUNTRY[b.c].tone, COUNTRY[b.c].name.padEnd(13)), ` ${hh(b)}`]);
  }
  return out;
}

// ── 노드 ────────────────────────────────────────────────────────
function nodes(p) {
  const list = [
    { id: 'tl', type: 'text', x: 2, y: 0, lines: timeline(p.gran), tone: 'n' },
    { id: 'tsum', type: 'text', x: 2, y: 8, lines: timeSummary(p.gran), tone: 'n' },

    { id: 'chunk', type: 'frame', x: 0, y: 16, cols: 112, rows: 34, title: 'time chunk 2026-09-23/2026-09-24', tag: '36 rows', tone: 'n', caption: '하루치 청크 하나' },
    { id: 'stream', type: 'text', x: 3, y: 18, lines: streamLines(), tone: 'n' },
    { id: 'hash', type: 'text', x: 46, y: 18, lines: hashLines(), tone: 'n' },
    { id: 'dist', type: 'text', x: 46, y: 18, lines: distLines(), tone: 'n' },
    { id: 'broker', x: 46, y: 17, title: 'Broker', tag: 'secondaryPartitionPruning: true', lines: brokerLines(p.q), tone: 'q', w: 56, z: 3 },
    { id: 'sql', type: 'text', x: 3, y: 18, lines: SQL_LINES, tone: 'n' },
    { id: 'rules', type: 'text', x: 44, y: 18, lines: RULES, tone: 'n' },
    { id: 'sort', type: 'text', x: 46, y: 18, lines: sortLines(), tone: 'n' },
  ];
  for (const s of SPECS) {
    list.push({ id: `lbl-${s}`, type: 'text', x: 1, y: ROW_Y[s] + 1, lines: LABEL[s], tone: 'n' });
    segRows(s).forEach((rows, k) => {
      list.push({ id: boxId(s, k), x: BOX_X[k], y: ROW_Y[s], title: `p${k}`, tag: TAGS[s][k], lines: segLines(rows), w: 28, tone: 'i' });
    });
  }
  return list;
}

const edges = [{ id: 'rewrite', from: 'lbl-dynamic', to: 'lbl-range', via: 'l-l', offset: 22, tone: 'm', label: 'compaction / REPLACE', lx: 8, ly: -3 }];

const REGION_B = ['chunk', ...SPECS.map((s) => `lbl-${s}`), ...ALL_BOXES];

/** 한 줄(spec)의 세 상자를 비워 두고, 행을 하나씩 옮겨 담는다. */
async function fill(s, spec, order = ROWS, pace = 0.13) {
  const got = [[], [], []];
  const taken = new Set();
  [0, 1, 2].forEach((k) => s.patch(boxId(spec, k), { lines: segLines([]) }));
  s.patch('stream', { lines: streamLines(taken) });
  await s.wait(0.6);
  for (const r of order) {
    const k = LAYOUT[spec](r);
    got[k].push(r);
    got[k].sort((a, b) => a.i - b.i);
    taken.add(r.i);
    s.patch(boxId(spec, k), { lines: segLines(got[k]) });
    s.patch('stream', { lines: streamLines(taken) });
    if (spec === 'hashed') s.patch('hash', { lines: hashLines(r.c) });
    await s.wait(pace);
  }
  if (spec === 'hashed') s.patch('hash', { lines: hashLines() });
  [0, 1, 2].forEach((k) => s.pulse(boxId(spec, k)));
}

export default {
  title: '파티셔닝',
  docs: [
    ['Partitioning', 'https://druid.apache.org/docs/latest/ingestion/partitioning'],
    ['partitionsSpec', 'https://druid.apache.org/docs/latest/ingestion/native-batch#partitionsspec'],
    ['SQL clustering', 'https://druid.apache.org/docs/latest/multi-stage-query/concepts#clustering'],
  ],
  legend: [
    ['KR South Korea', 'q'],
    ['US United States', 'i'],
    ['JP Japan', 'm'],
    ['DE Germany', 'g'],
    ['FR France', 'p'],
    ['BR Brazil', 'y'],
  ],
  controls: [
    {
      id: 'gran',
      label: '① segmentGranularity <code>1–2단계</code>',
      type: 'seg',
      options: [
        ['HOUR', 'HOUR'],
        ['SIX_HOUR', 'SIX_HOUR'],
        ['DAY', 'DAY'],
      ],
      value: 'DAY',
    },
    {
      id: 'q',
      label: '② Broker 에 보낼 필터 <code>7단계</code>',
      type: 'seg',
      options: [
        ['eq', "= 'South Korea'"],
        ['in', 'IN (Japan, South Korea)'],
        ['like', "LIKE 'South%'"],
        ['city', "cityName = 'Seoul'"],
      ],
      value: 'eq',
    },
  ],
  nodes,
  edges,
  steps: [
    {
      title: '1차 파티션은 언제나 시간',
      edges: [],
      show: ['tl', 'tsum'],
      body: `<p>Druid 는 모든 데이터소스를 먼저 <b>시간</b>으로 나눠요. <code>segmentGranularity</code>(SQL 은 <code>PARTITIONED BY</code>)가 <b>타임 청크</b>의 길이를 정하고, 세그먼트 하나는 반드시 한 청크 안에 들어가요.</p>
      <p>그림은 하루치 편집 36건이에요(한 칸이 한 시간, 글자는 나라 코드). 조작 ① 에서 <b>HOUR, SIX_HOUR, DAY</b> 를 골라 청크 경계 <code>│</code> 가 어떻게 그어지는지 보세요.</p>`,
      play: async (s) => {
        for (let h = 0; h <= 24; h += 1) {
          s.patch('tl', { lines: timeline(s.params.gran, { upto: h }) });
          await s.wait(0.12);
        }
        s.pulse('tsum');
        await s.wait(3);
      },
      gap: 0.3,
    },
    {
      title: '청크를 얼마나 잘게 자를까',
      edges: [],
      show: ['tl', 'tsum'],
      patch: (p) => ({ tl: { lines: timeline(p.gran, { query: true }) }, tsum: { lines: timeSummary(p.gran, true) } }),
      hold: 11,
      body: `<p>시간으로 나눠 두면 <code>__time</code> 조건으로 청크째 건너뛸 수 있고(그림의 흐린 글자), 덮어쓰기와 컴팩션이 <b>청크 단위로 락</b>을 잡아요.</p>
      <p>너무 잘게 자르면 <b>작은 세그먼트가 잔뜩</b> 생겨 느려져요(① 에서 HOUR). 흔히 <code>HOUR</code> 나 <code>DAY</code> 를 쓰고, 스트리밍은 컴팩션이 금방 뒤따를 수 있는 HOUR 가 특히 흔해요. <code>WEEK</code> 는 달, 해와 경계가 맞지 않아 피하라고 권해요.</p>`,
    },
    {
      title: '2차 파티셔닝: 청크 안을 다시 나눠요',
      edges: [],
      show: [...REGION_B, 'stream'],
      focus: ['chunk'],
      body: `<p>청크 하나를 여러 세그먼트로 나누는 규칙이 <b>2차 파티셔닝</b>이에요. 같은 값을 가진 행을 한 세그먼트에 모으면(지역성) <b>압축이 좋아지고</b>, Broker 가 필요 없는 세그먼트를 <b>건너뛸</b> 수 있어요.</p>
      <p>같은 36행을 세 가지로 나눠 나란히 놓았어요. 네이티브 배치는 <code>tuningConfig</code> 의 <code>partitionsSpec</code>, SQL 은 <code>CLUSTERED BY</code> 로 정하고, Kafka 와 Kinesis 는 스트림의 파티션을 그대로 따라요.</p>`,
    },
    {
      title: 'dynamic: 들어온 순서대로 채워요',
      edges: [],
      show: [...REGION_B, 'stream'],
      on: ['lbl-dynamic', 'd0', 'd1', 'd2', 'stream'],
      focus: ['chunk'],
      hold: 10,
      body: `<p><code>dynamic</code> 은 행이 오는 대로 세그먼트를 채우다가 <code>maxRowsPerSegment</code>(기본 5,000,000)를 넘으면 다음 세그먼트로 넘어가요. 쌓인 행이 <code>maxTotalRows</code>(기본 20,000,000)에 닿으면 그때까지 만든 세그먼트를 내보내요.</p>
      <p>가장 빠르지만 값이 뒤섞여(상자마다 값이 5~6가지) <b>2차 프루닝이 없고</b> 롤업도 최선 노력(best-effort)이에요. 기존 데이터에 덧붙이는 <code>appendToExisting</code> 은 dynamic 으로만 돼요.</p>`,
      play: async (s) => {
        await fill(s, 'dynamic');
        await s.wait(2.6);
      },
      gap: 0.4,
    },
    {
      title: 'hashed: 값의 해시가 버킷을 정해요',
      edges: [],
      show: [...REGION_B, 'stream', 'hash'],
      on: ['lbl-hashed', 'h0', 'h1', 'h2', 'stream', 'hash'],
      focus: ['chunk'],
      hold: 10,
      body: `<p><code>hashed</code> 는 <code>partitionDimensions</code> 값의 해시(<code>murmur3_32_abs</code>)를 버킷 수로 나눈 나머지로 세그먼트를 골라요. 버킷 수는 <code>numShards</code> 로 주거나 <code>targetRowsPerSegment</code> 로 맞춰요(둘 다 없으면 5,000,000행 기준).</p>
      <p>같은 값은 늘 같은 버킷에 가서 퍼펙트 롤업이 되지만, 크기는 값의 분포를 따라 들쭉날쭉해요. 수집 때 <b>적어 둔</b> <code>partitionDimensions</code> <b>모두</b>에 조건이 걸려야 프루닝돼요.</p>`,
      play: async (s) => {
        await fill(s, 'hashed', ROWS, 0.15);
        await s.wait(2.6);
      },
      gap: 0.4,
    },
    {
      title: 'range: 값의 구간으로 잘라요',
      edges: [],
      show: [...REGION_B, 'stream', 'dist'],
      on: ['lbl-range', 'r0', 'r1', 'r2', 'stream', 'dist'],
      focus: ['chunk'],
      hold: 12,
      body: `<p><code>single_dim</code>, <code>range</code> 는 먼저 값의 <b>분포(히스토그램)</b>를 훑어(<code>partial_dimension_distribution</code>), 세그먼트마다 행 수가 비슷해지도록 <b>경계값</b>을 골라요. 그래서 세그먼트마다 이어진 값의 구간을 맡아요.</p>
      <p>분포가 치우치면 크기가 고르지 않을 수 있어요. <code>range</code> 는 차원을 여럿(3~5개 권장) 쓸 수 있고, 다중 값 차원은 쓸 수 없어요. 가장 느리지만 퍼펙트 롤업과 프루닝을 줘요.</p>`,
      play: async (s) => {
        [0, 1, 2].forEach((k) => s.patch(boxId('range', k), { lines: segLines([]) }));
        for (let g = 0; g <= 6; g++) {
          s.patch('dist', { lines: distLines(g, false) });
          await s.wait(0.35);
        }
        s.patch('dist', { lines: distLines(6, true) });
        s.pulse('dist');
        await s.wait(1.2);
        await fill(s, 'range', ROWS, 0.12);
        await s.wait(2.4);
      },
      gap: 0.4,
    },
    {
      title: 'Broker 의 프루닝: 건너뛸 세그먼트 고르기',
      edges: [],
      show: [...REGION_B, 'broker'],
      on: (p) => ['broker', ...SPECS.map((s) => `lbl-${s}`), ...SPECS.flatMap((s) => SCAN[s][p.q].map((k) => boxId(s, k)))],
      patch: (p) =>
        Object.fromEntries([
          ...SPECS.map((s) => [`lbl-${s}`, { lines: [LABEL[s][0], c('b', `scan ${SCAN[s][p.q].length}/3`)] }]),
          ...SPECS.flatMap((s) => [0, 1, 2].map((k) => [boxId(s, k), { tag: SCAN[s][p.q].includes(k) ? 'scan' : 'skip' }])),
        ]),
      focus: ['chunk'],
      hold: 12,
      body: `<p>Broker 는 <b>언제나 시간 조건</b>으로 세그먼트를 거르고, hash 나 range 로 나뉜 데이터면 필터로 한 번 더 걸러요(<code>secondaryPartitionPruning</code>, 기본 <code>true</code>). 조작 ② 로 필터를 바꿔 보세요.</p>
      <p>range 는 문자열 값의 <code>=</code>, <code>IN</code>, <code>&lt;</code>, <code>&gt;</code>, <code>&lt;=</code>, <code>&gt;=</code> 로 거르고 <code>LIKE</code> 는 못 걸러요. 파티션 차원이 아닌 컬럼의 조건으로도 못 걸러요. dynamic 은 나눈 기준이 없어 늘 전부 훑어요.</p>`,
      play: async (s) => {
        for (const spec of SPECS) {
          for (const k of SCAN[spec][s.params.q]) {
            s.pulse(boxId(spec, k));
            await s.wait(0.35);
          }
          await s.wait(0.3);
        }
        await s.wait(1.6);
      },
    },
    {
      title: 'SQL: PARTITIONED BY 와 CLUSTERED BY',
      edges: [],
      show: [...REGION_B, 'sql', 'rules'],
      on: ['sql', 'rules', 'lbl-range', 'r0', 'r1', 'r2'],
      focus: ['chunk'],
      hold: 12,
      body: `<p>SQL 수집은 <code>PARTITIONED BY</code> 가 필수이고, <code>CLUSTERED BY</code> 가 청크 안을 <b>range</b> 로 나눠요(세그먼트당 기본 <code>rowsPerSegment</code> 3,000,000행).</p>
      <p>차원 프루닝은 <code>REPLACE</code> 로 쓴 세그먼트만 되고(INSERT 로 쓴 것은 안 돼요), <code>CLUSTERED BY</code> 가 단일 값 문자열 컬럼으로 시작해야 해요. 차원이 여럿이면 <b>왼쪽부터</b> 써요: <code>countryName</code> 없이 <code>cityName</code> 만으로는 못 걸러요.</p>`,
    },
    {
      title: '세그먼트 안의 정렬, 그리고 스트리밍 데이터',
      show: [...REGION_B, 'sort'],
      on: ['sort', 'r0', 'r1', 'r2', 'lbl-dynamic', 'lbl-range', 'rewrite'],
      edges: ['rewrite'],
      focus: ['chunk'],
      hold: 12,
      body: `<p>세그먼트 안의 행은 <b><code>__time</code> 먼저</b>, 그다음 차원 순서(SQL 은 <code>CLUSTERED BY</code>)로 정렬돼요. 파티션 차원을 정렬의 맨 앞에도 두면 압축과 속도가 더 좋아져요. <code>forceSegmentSortByTime=false</code> 로 시간 먼저를 끌 수 있지만 <b>실험적</b>이에요.</p>
      <p>Kafka 와 Kinesis 는 스트림 파티션을 따르고 롤업도 최선 노력이라 dynamic 처럼 값이 섞여요. 나중에 <b>컴팩션</b>이나 <code>REPLACE … CLUSTERED BY</code> 로 다시 쓰면 range 로 나뉜 새 버전이 옛 세그먼트를 가려요.</p>`,
      play: async (s) => {
        await s.send('rewrite', { dur: 1.6, glyph: '▸' });
        s.pulse('r0');
        s.pulse('r1');
        s.pulse('r2');
        await s.wait(2.4);
      },
    },
  ],
};
