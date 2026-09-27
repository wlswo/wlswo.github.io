/*
 * 04 세그먼트 안에서 찾기
 *
 * Historical 의 처리 스레드들이 세그먼트를 하나씩 맡는 모습(1)에서 시작해, 세그먼트
 * 하나 안에서 필터가 풀리는 과정을 왼쪽에서 오른쪽으로 따라간다: SQL(2) → 사전에서
 * 값의 id(3) → 그 id 의 비트맵 A, B(4) → AND, OR(5) → 맞는 행의 added 만 읽어
 * SUM(6). 숫자 컬럼 필터는 비트맵 없이 값을 훑고(7), GroupBy, Timeseries 는 512 행씩
 * 묶어 처리한다(8). 설명 칸의 조작으로 연산(AND, OR)과 두 값을 바꿀 수 있다.
 */
import { c, bits, bar } from '../ascii.js';

// 앞 장과 같은 여덟 행
const CH = { en: '#en.wikipedia', ja: '#ja.wikipedia', ko: '#ko.wikipedia' };
const CH_DICT = ['en', 'ja', 'ko'];
const CO_DICT = ['null', 'Japan', 'South Korea', 'United States'];
const ROWS = [
  { ch: 'en', co: 'null', added: 57 },
  { ch: 'ko', co: 'South Korea', added: 12 },
  { ch: 'en', co: 'United States', added: 210 },
  { ch: 'ja', co: 'Japan', added: 36 },
  { ch: 'ko', co: 'null', added: 5 },
  { ch: 'en', co: 'null', added: 94 },
  { ch: 'ko', co: 'South Korea', added: 31 },
  { ch: 'ja', co: 'null', added: 18 },
];

const coText = (co) => (co === 'null' ? 'IS NULL' : `= '${co}'`);
const bitsOf = (p) => {
  const a = ROWS.map((r) => (r.ch === p.ch ? 1 : 0));
  const b = ROWS.map((r) => (r.co === p.co ? 1 : 0));
  const r = a.map((x, i) => (p.op === 'AND' ? x & b[i] : x | b[i]));
  return { a, b, r };
};
const matched = (p) => bitsOf(p).r.flatMap((x, i) => (x ? [i] : []));
const total = (p) => matched(p).reduce((n, i) => n + ROWS[i].added, 0);

// ── 조각들 ──
const sqlLines = (p) => [
  [c('q', 'SELECT'), ' SUM(added) ', c('q', 'FROM'), ' wikipedia'],
  [c('q', 'WHERE'), ` channel = '${CH[p.ch]}'`],
  [`  ${p.op === 'AND' ? '' : ' '}`, c('q', p.op), ` countryName ${coText(p.co)}`],
];

const dictLines = (keys, names, hot, lit) =>
  keys.map((k, id) => {
    const name = names(k);
    if (lit && k === hot) return [c('q', `${id} → `), c('b', name)];
    return [c('d', `${id} → `), k === 'null' ? c('d', name) : name];
  });
const chDictLines = (p, lit) => dictLines(CH_DICT, (k) => CH[k], p.ch, lit);
const coDictLines = (p, lit) => dictLines(CO_DICT, (k) => k, p.co, lit);

const HEAD = [c('d', 'row  '), c('d', '0 1 2 3 4 5 6 7')];
const bitRow = (label, arr, tone, upto = 99) => [
  c('d', label.padEnd(5)),
  ...arr.flatMap((x, i) => {
    const bit = i > upto ? c('d', '.') : x ? (tone ? c(tone, '1') : '1') : c('d', '0');
    return i ? [' ', bit] : [bit];
  }),
];

const bmALines = (p, lit) => [c('d', `= '${CH[p.ch]}'`), HEAD, bitRow('bit', bitsOf(p).a, lit ? 'i' : null)];
const bmBLines = (p, lit) => [c('d', p.co === 'null' ? 'IS NULL (id 0)' : `= '${p.co}'`), HEAD, bitRow('bit', bitsOf(p).b, lit ? 'm' : null)];
function bmRLines(p, upto = 99) {
  const { a, b, r } = bitsOf(p);
  return [bitRow('A', a, null), bitRow('B', b, null), '---', bitRow(p.op, r, 'q', upto)];
}

function addedLines(p) {
  const rows = matched(p);
  if (!rows.length) return [c('d', 'no rows match'), '---', c('d', 'nothing to read')];
  const skipped = ROWS.map((_, i) => i).filter((i) => !rows.includes(i));
  return [
    ...rows.map((i) => [c('d', `row ${i}  →  `), c('g', String(ROWS[i].added).padStart(3))]),
    '---',
    c('d', `skip rows ${skipped.join(',')}`),
  ];
}
const sumLines = (p) => [[c('d', '= '), c('b', String(total(p)))]];

// ── 처리 스레드(1단계) ──
const THREADS = 7;
const threadLines = (seg, prog) => [seg ? `seg ${String(seg).padStart(2, '0')}` : c('d', 'idle'), bar(prog, 1, 7, { tone: 'i' })];
const queueLine = (next) => {
  const waiting = [];
  for (let k = next; k < next + 7; k++) waiting.push(`[s${String(k).padStart(2, '0')}]`);
  return [[c('d', 'waiting  '), c('i', waiting.join('')), c('d', ' …')]];
};

// ── 숫자 컬럼 훑기(7단계) ──
const COLS4 = (vals) => vals.map((v) => String(v).padStart(4)).join('');
function scanLines(upto = -1) {
  const hits = ROWS.map((r) => (r.added > 50 ? 1 : 0));
  const matchRow = [c('d', 'match')];
  hits.forEach((h, i) => matchRow.push(i <= upto ? (h ? c('q', '   1') : c('d', '   0')) : c('d', '   .')));
  const cur = [c('d', '     ')];
  ROWS.forEach((_, i) => cur.push(i === upto ? c('q', '   ▲') : '    '));
  return [[c('d', 'row  '), c('d', COLS4([0, 1, 2, 3, 4, 5, 6, 7]))], ['added', COLS4(ROWS.map((r) => r.added))], cur, matchRow];
}

// ── 벡터화(8단계) ──
function vecLines(k = -1) {
  const scalarPos = Math.max(0, k) % 31;
  const scalar = [c('d', 'row-at-a-time  '), c('d', '.'.repeat(scalarPos)), c('q', '▸'), c('d', '.'.repeat(30 - scalarPos)), c('d', '  2048 calls')];
  const batches = [c('d', 'vectorized     ')];
  for (let b = 0; b < 4; b++) batches.push(b <= Math.floor(k / 8) && k >= 0 ? c('i', '[ 512 ]') : c('d', '[ 512 ]'));
  batches.push(c('d', '     4 calls'));
  return [c('d', 'rows 0 … 2047 of one segment'), '---', scalar, batches];
}

const nodes = [
  // 1단계
  { id: 'pool', type: 'frame', x: 0, y: 0, cols: 88, rows: 10, title: 'Historical: processing threads', tone: 'i', tag: 'numThreads = cores - 1' },
  ...Array.from({ length: THREADS }, (_, k) => ({ id: `t${k}`, x: 2 + k * 12, y: 2, title: `T${k + 1}`, lines: threadLines(k + 1, 0.3 + k * 0.08), tone: 'i', w: 9 })),
  { id: 'queue', type: 'text', x: 2, y: 7, lines: queueLine(8) },

  // 2~6단계
  { id: 'sql', x: 0, y: 0, title: 'query', lines: [], tone: 'q' },
  { id: 'chDict', x: 0, y: 7, title: 'channel dictionary', lines: [], tone: 'i', caption: 'channel 사전' },
  { id: 'coDict', x: 0, y: 14, title: 'countryName dictionary', lines: [], tone: 'm', caption: 'countryName 사전' },
  { id: 'bmA', x: 36, y: 7, title: 'bitmap A: channel', lines: [], tone: 'i' },
  { id: 'bmB', x: 36, y: 14, title: 'bitmap B: countryName', lines: [], tone: 'm' },
  { id: 'bmR', x: 68, y: 10, title: 'A op B', lines: [], tone: 'q', caption: '맞는 행 = 1' },
  { id: 'added', x: 68, y: 21, title: 'added', lines: [], tone: 'g', caption: '맞는 행의 값만 읽어요' },
  { id: 'sum', x: 100, y: 21, title: 'SUM(added)', lines: [], tone: 'g' },
  { id: 'skip', type: 'text', x: 38, y: 22, lines: [c('d', 'page  user  deleted  …'), c('d', 'not needed: never opened')] },

  // 7단계
  { id: 'scan', x: 30, y: 22, title: 'WHERE added > 50', lines: scanLines(), tone: 'x', caption: '숫자 컬럼: 인덱스 없이 값을 하나씩 비교' },

  // 8단계
  { id: 'vec', x: 0, y: 25, title: 'GroupBy, Timeseries', lines: vecLines(), tone: 'i', caption: 'vectorSize = 512' },
];

const edges = [
  { id: 'eA', from: 'chDict', to: 'bmA', via: 'r-l', tone: 'i' },
  { id: 'eB', from: 'coDict', to: 'bmB', via: 'r-l', tone: 'm' },
  { id: 'eAR', from: 'bmA', to: 'bmR', via: 'r-lt', tone: 'i' },
  { id: 'eBR', from: 'bmB', to: 'bmR', via: 'r-lb', tone: 'm' },
  { id: 'eRA', from: 'bmR', to: 'added', via: 'b-t', tone: 'q' },
  { id: 'eAS', from: 'added', to: 'sum', via: 'r-l', tone: 'g' },
];

const FILTER = ['sql', 'chDict', 'coDict', 'bmA', 'bmB', 'bmR', 'added', 'sum'];
const POOL = ['pool', ...Array.from({ length: THREADS }, (_, k) => `t${k}`), 'queue'];

// 단계마다 글자를 조작 값에 맞춰 채운다. lit: 이 단계에서 밝힐 자리
function fill(p, lit = {}) {
  const id = (keys, k) => keys.indexOf(k);
  return {
    sql: { lines: sqlLines(p) },
    chDict: { lines: chDictLines(p, lit.dict) },
    coDict: { lines: coDictLines(p, lit.dict) },
    bmA: { lines: bmALines(p, lit.bits) },
    bmB: { lines: bmBLines(p, lit.bits) },
    bmR: { lines: bmRLines(p), title: `A ${p.op} B` },
    added: { lines: addedLines(p) },
    sum: { lines: sumLines(p) },
    eA: { label: `id ${id(CH_DICT, p.ch)}` },
    eB: { label: `id ${id(CO_DICT, p.co)}` },
    eRA: { label: matched(p).length ? `rows ${matched(p).join(',')}` : 'no rows' },
  };
}

export default {
  title: '세그먼트 안에서 찾기',
  docs: [
    ['Query processing', 'https://druid.apache.org/docs/latest/querying/query-processing'],
    ['Segments', 'https://druid.apache.org/docs/latest/design/segments'],
    ['Vectorization', 'https://druid.apache.org/docs/latest/querying/query-context-reference#vectorization-parameters'],
  ],
  legend: [
    ['channel', 'i'],
    ['countryName', 'm'],
    ['합친 결과', 'q'],
    ['읽는 지표', 'g'],
  ],
  controls: [
    { id: 'op', label: '두 조건을', type: 'seg', options: [['AND', 'AND'], ['OR', 'OR']], value: 'AND' },
    { id: 'ch', label: '<code>channel</code> 값', type: 'seg', options: [['en', '#en'], ['ja', '#ja'], ['ko', '#ko']], value: 'ko' },
    { id: 'co', label: '<code>countryName</code> 값', type: 'seg', options: [['null', 'NULL'], ['Japan', 'Japan'], ['South Korea', 'Korea'], ['United States', 'US']], value: 'South Korea' },
  ],
  nodes,
  edges,
  steps: [
    {
      title: '세그먼트 하나에 스레드 하나',
      show: POOL,
      hold: 10,
      body: `<p>쿼리가 Historical 에 닿으면, 처리 스레드들이 세그먼트를 <b>하나씩</b> 맡아 동시에 처리해요. 스레드 수 <code>druid.processing.numThreads</code> 의 기본값은 <b>코어 수 − 1</b> 이에요(그림은 8코어).</p>
      <p>스레드 하나가 세그먼트 하나를 끝까지 처리하니까, 세그먼트에 담긴 행 수가 곧 병렬 처리의 단위예요. 공식 문서가 세그먼트당 <b>약 500만 행</b>을 권하는 까닭이에요.</p>`,
      play: async (s) => {
        const prog = Array.from({ length: THREADS }, (_, k) => 0.3 + k * 0.08);
        const seg = Array.from({ length: THREADS }, (_, k) => k + 1);
        const speed = [0.09, 0.07, 0.11, 0.06, 0.08, 0.1, 0.075];
        let next = 8;
        for (let tick = 0; tick < 60; tick++) {
          for (let k = 0; k < THREADS; k++) {
            prog[k] += speed[k];
            if (prog[k] >= 1) {
              prog[k] = 0;
              seg[k] = next++;
              s.pulse(`t${k}`);
            }
            s.patch(`t${k}`, { lines: threadLines(seg[k], Math.min(1, prog[k])) });
          }
          s.patch('queue', { lines: queueLine(next) });
          await s.wait(0.18);
        }
      },
      gap: 0,
    },
    {
      title: '세그먼트 하나에 필터가 와요',
      show: FILTER,
      on: ['sql'],
      dim: false,
      patch: (p) => fill(p),
      body: (p) => `<p>한 스레드가 맡은 세그먼트 하나를 들여다봐요. 조건은 두 문자열 차원 <code>channel</code> 과 <code>countryName</code> 에 걸려 있어요. 행은 여덟 개예요.</p>
      <p>Druid 는 행을 하나씩 확인하지 않아요. 세그먼트 안의 <b>인덱스 구조</b>로 맞는 행을 먼저 찾고, 그 행의 필요한 컬럼만 읽어요. 지금 조건이면 <b>${matched(p).length}행</b>이 맞아요.</p>
      <p class="note">설명 칸 아래의 조작으로 연산(AND, OR)과 두 값을 바꿔 보세요.</p>`,
    },
    {
      title: '사전에서 값의 id 를 찾아요',
      show: FILTER,
      on: ['sql', 'chDict', 'coDict'],
      patch: (p) => fill(p, { dict: true }),
      body: `<p>먼저 각 컬럼의 <b>사전</b>에서 조건의 값을 찾아 정수 <b>id</b> 로 바꿔요. 사전은 값(문자열)과 id 를 잇는 표예요.</p>
      <p><code>IS NULL</code> 조건이라면 늘 <b>id 0</b> 이에요. 문자열 컬럼은 null 을 사전의 0번에 둬요.</p>`,
      play: async (s) => {
        s.pulse('chDict');
        s.pulse('coDict');
        await s.wait(2.5);
      },
    },
    {
      title: '그 id 의 비트맵을 꺼내요',
      show: FILTER,
      on: ['chDict', 'coDict', 'bmA', 'bmB', 'eA', 'eB'],
      patch: (p) => fill(p, { dict: true, bits: true }),
      body: `<p>id 마다 비트맵이 하나씩 있어요. 비트맵의 <b>i 번째 비트가 1</b> 이면 i 번 행에 그 값이 있다는 뜻이에요.</p>
      <p>두 조건의 비트맵 두 장(A, B)만 꺼내면 돼요. 행 데이터는 아직 한 칸도 읽지 않았어요.</p>`,
      play: async (s) => {
        await s.sendAll(['eA', 'eB'], { dur: 1.1, glyph: '#' });
        s.pulse('bmA');
        s.pulse('bmB');
        await s.wait(1.8);
      },
    },
    {
      title: 'AND, OR 는 비트 연산으로',
      show: FILTER,
      on: ['bmA', 'bmB', 'bmR', 'eAR', 'eBR'],
      patch: (p) => fill(p, { bits: true }),
      hold: 9,
      body: (p) => `<p>두 비트맵을 자리마다 <b>AND</b>(둘 다 1) 또는 <b>OR</b>(하나라도 1) 해요. 비트 연산이라 매우 빠르고, Roaring 같은 압축 비트맵은 압축된 그대로 계산해요.</p>
      <p>결과 비트맵의 1 이 곧 조건에 맞는 행이에요(지금은 <b>${p.op}</b> → ${matched(p).length ? `${matched(p).join(', ')}번 행` : '맞는 행 없음'}). NOT 이나 조건이 더 많아도 같은 방식으로 겹쳐 풀어요.</p>`,
      play: async (s) => {
        await s.sendAll(['eAR', 'eBR'], { dur: 1, glyph: '▸' });
        for (let i = 0; i < ROWS.length; i++) {
          s.patch('bmR', { lines: bmRLines(s.params, i) });
          await s.wait(0.35);
        }
        s.pulse('bmR');
        await s.wait(1.8);
      },
      gap: 0.4,
    },
    {
      title: '맞는 행의 필요한 컬럼만 읽어요',
      show: [...FILTER, 'skip'],
      on: ['bmR', 'added', 'sum', 'skip', 'eRA', 'eAS'],
      patch: (p) => fill(p),
      hold: 9,
      body: (p) => `<p>이제서야 데이터를 읽어요. 결과 비트맵이 가리키는 행의 <code>added</code> 값만 꺼내 <code>SUM</code> 을 구해요(지금은 <b>${total(p)}</b>).</p>
      <p>쿼리에 필요 없는 <code>page</code>, <code>user</code>, <code>deleted</code> 컬럼은 <b>열어 보지도 않아요</b>. 인덱스로 읽을 행을 줄이고, 컬럼 저장으로 읽을 컬럼을 줄이는 것, Druid 가 빠른 두 가지 까닭이에요.</p>`,
      play: async (s) => {
        await s.send('eRA', { dur: 1, glyph: '▾' });
        s.pulse('added');
        await s.wait(0.5);
        await s.send('eAS', { dur: 0.9, glyph: 'Σ' });
        s.pulse('sum');
        await s.wait(2);
      },
    },
    {
      title: '숫자 컬럼 필터는 값을 훑어요',
      show: ['sql', 'chDict', 'coDict', 'bmA', 'bmB', 'scan'],
      on: ['scan'],
      focus: ['chDict', 'coDict', 'bmA', 'bmB', 'scan'],
      patch: (p) => fill(p),
      hold: 10,
      body: `<p>숫자 컬럼에는 비트맵 인덱스가 없어요. <code>added &gt; 50</code> 같은 조건은 값을 <b>하나씩 비교</b>해야 해요(▲ 가 훑는 칸).</p>
      <p>그래서 자주 거르는 값은 문자열 차원으로 두는 편이 필터에 유리하고, 숫자 컬럼은 GROUP BY 에 유리해요. 공식 문서도 쓰임새에 맞게 실험해 보라고 권해요.</p>`,
      play: async (s) => {
        for (let i = 0; i < ROWS.length; i++) {
          s.patch('scan', { lines: scanLines(i) });
          await s.wait(0.5);
        }
        await s.wait(1.6);
      },
      gap: 0.3,
    },
    {
      title: '512 행씩 묶어서: 벡터화',
      show: ['vec'],
      on: ['vec'],
      hold: 10,
      body: `<p>GroupBy, Timeseries 쿼리는 <b>벡터화</b>되어, 행을 하나씩이 아니라 <b>512 행씩</b>(<code>vectorSize</code> 기본값) 묶어 처리해요. <code>vectorize</code> 의 기본값은 <code>true</code> 예요.</p>
      <p>TopN, Scan 은 벡터화하지 않고, 아직 넘기지 않은 <b>실시간 세그먼트</b>는 벡터화할 수 없어요. 필터와 집계가 벡터화를 지원해야 벡터화돼요.</p>`,
      play: async (s) => {
        for (let k = 0; k < 32; k++) {
          s.patch('vec', { lines: vecLines(k) });
          await s.wait(0.16);
        }
        await s.wait(1);
      },
      gap: 0.2,
    },
  ],
};
