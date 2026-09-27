/*
 * 03 세그먼트 해부
 *
 * 앞 장의 09-23 청크에서 세그먼트 하나를 열어, 여덟 행이 컬럼으로 저장되는 모양을
 * 한 겹씩 벗긴다: 행 표(1) → 컬럼 넷(2), __time 의 LZ4 블록(3), 문자열 차원
 * countryName 의 사전, 인코딩된 목록(4)과 값마다 하나인 비트맵(5), 비트맵이 없는
 * 숫자 컬럼(6), 멀티 값, 중첩 JSON(7), 파일로 묶기(8).
 *
 * 자리(칸): 행 표는 위(y 0~11), 컬럼 넷은 가운데 줄(y 15~), countryName 의 자료
 * 구조 셋은 아래 줄(y 30~), 오른쪽(x 80~)은 단계마다 바뀌어 쓰는 빈터다.
 */
import { c, table, bits } from '../ascii.js';

// 공식 튜토리얼의 wikipedia 데이터소스에서 여덟 행(__time 순으로 정렬돼 있다)
const CH = { en: '#en.wikipedia', ja: '#ja.wikipedia', ko: '#ko.wikipedia' };
const ROWS = [
  { t: '09:02:11', ch: 'en', co: null, added: 57 },
  { t: '09:05:43', ch: 'ko', co: 'South Korea', added: 12 },
  { t: '09:07:30', ch: 'en', co: 'United States', added: 210 },
  { t: '09:11:02', ch: 'ja', co: 'Japan', added: 36 },
  { t: '09:12:48', ch: 'ko', co: null, added: 5 },
  { t: '09:15:19', ch: 'en', co: null, added: 94 },
  { t: '09:20:05', ch: 'ko', co: 'South Korea', added: 31 },
  { t: '09:24:37', ch: 'ja', co: null, added: 18 },
];

// countryName 의 사전: null 은 늘 0 번
const CO = [null, 'Japan', 'South Korea', 'United States'];
const CO_SHORT = ['null ', 'Japan', 'S.Kor', 'U.S. '];
const IDS = ROWS.map((r) => CO.indexOf(r.co));

const coName = (v) => (v == null ? c('d', 'null') : v);

// ── 행 표 ──
function rowTable(cursor = -1) {
  return table(
    ['#', '__time', 'channel', 'countryName', 'added'],
    ROWS.map((r, i) => [
      i === cursor ? c('q', '▸') : String(i),
      i === cursor ? c('b', r.t) : r.t,
      i === cursor ? c('b', CH[r.ch]) : CH[r.ch],
      r.co == null ? c('d', 'null') : i === cursor ? c('b', r.co) : r.co,
      i === cursor ? c('b', String(r.added)) : String(r.added),
    ]),
    { align: ['right', 'left', 'left', 'left', 'right'] },
  );
}

// ── 컬럼 넷 ──
const timeLines = (block = -1) => {
  const val = (i) => (block >= 0 && Math.floor(i / 4) === block ? c('q', ROWS[i].t) : ROWS[i].t);
  return [val(0), val(1), val(2), val(3), '---', val(4), val(5), val(6), val(7), '---', c('d', 'long[], lz4')];
};
const chLines = ROWS.map((r) => CH[r.ch]).concat(['---', c('d', 'string')]);
const coLines = ROWS.map((r) => coName(r.co)).concat(['---', c('d', 'string')]);
function addedLines(cursor = -1) {
  const vals = ROWS.map((r, i) => {
    const v = String(r.added).padStart(3);
    if (i === cursor) return [c('q', '▸ '), c('b', v)];
    return `  ${v}`;
  });
  return [...vals, '---', c('d', 'long[], lz4')];
}

// ── countryName 의 자료 구조 셋 ──
function dictLines(hot = -1) {
  return CO.map((v, k) => {
    const name = v == null ? 'null' : v;
    if (k === hot) return [c('q', `${k} → `), c('b', name)];
    return [c('d', `${k} → `), v == null ? c('d', name) : name];
  });
}
function listLines(hot = -1) {
  const head = [c('d', 'row  ')];
  const ids = ['id   '];
  ROWS.forEach((_, i) => {
    if (i) {
      head.push(' ');
      ids.push(' ');
    }
    head.push(i === hot ? c('q', String(i)) : c('d', String(i)));
    ids.push(i === hot ? c('q', String(IDS[i])) : String(IDS[i]));
  });
  return [head, ids];
}
function bitmapLines(hot = -1, col = -1) {
  return CO.map((v, k) => {
    const row = IDS.map((id) => (id === k ? 1 : 0));
    const label = CO_SHORT[k];
    if (k === hot) return [c('b', `${label}  `), ...bits(row, { tone: 'q' })];
    if (col >= 0) return [c('d', `${label}  `), ...row.flatMap((b, i) => [...(i ? [' '] : []), i === col && b ? c('q', '1') : b ? '1' : c('d', '0')])];
    return [c('d', `${label}  `), ...bits(row)];
  });
}

// ── 숫자 컬럼 훑기 ──
function scanLines(upto = -1) {
  const hits = ROWS.map((r) => (r.added > 50 ? 1 : 0));
  const shown = hits.map((b, i) => (i <= upto ? (b ? c('q', '1') : c('d', '0')) : c('d', '.')));
  return [c('x', 'no bitmap index'), '---', ['match  ', ...shown.flatMap((p, i) => (i ? [' ', p] : [p]))], c('d', 'compare every value')];
}

// ── 멀티 값, 중첩 JSON ──
const MV = [[0], [0, 1], [1], [1]];
function mvLines(hot = false) {
  const row = (vals, i) => {
    const text = vals.length > 1 ? `[${vals.join(',')}]` : `[${vals[0]}]`;
    return [c('d', `row${i}  `), hot && vals.length > 1 ? c('q', text) : text];
  };
  const bm = (k, name) => {
    const b = MV.map((vals) => (vals.includes(k) ? 1 : 0));
    // 빈 문자열 조각은 넣지 않는다(그림판이 빈 조각을 빈칸 하나로 그린다)
    return [c('d', `${name} `), ...b.flatMap((x, i) => [...(i ? [' '] : []), hot && i === 1 && x ? c('q', '1') : x ? '1' : c('d', '0')])];
  };
  return [[c('d', 'dict  '), '0=druid 1=sql'], '---', ...MV.map(row), '---', bm(0, 'druid'), bm(1, 'sql  ')];
}
const JSON_LINES = [
  [c('d', 'raw   '), '{"geo":{"cc":"KR"},"n":3}'],
  '---',
  [c('i', 'geo.cc'), '  string col + index'],
  [c('g', 'n     '), '  long col + index'],
  c('d', 'JSON_VALUE reads these'),
];

// ── 파일 ──
function smooshLines(hot = -1) {
  const files = ['__time', 'channel', 'countryName', 'added', 'index.drd'];
  return [...files.map((f, i) => (i === hot ? c('q', `▸ ${f}`) : `  ${f}`)), '---', c('d', '<= 2 GB, mmap')];
}
const SPEC = [
  c('d', '"indexSpec": {'),
  ['  "bitmap": { "type": ', c('q', '"roaring"'), ' },'],
  ['  "dimensionCompression": ', c('q', '"lz4"'), ','],
  ['  "metricCompression": ', c('q', '"lz4"'), ','],
  ['  "longEncoding": ', c('q', '"longs"')],
  c('d', '}'),
];

const nodes = [
  { id: 'tbl', x: 10, y: 0, title: 'segment: wikipedia/2026-09-23', lines: rowTable(), tone: 'i' },

  { id: 'tcol', x: 0, y: 15, title: '__time', lines: timeLines(), tone: 'n', w: 14 },
  { id: 'chcol', x: 20, y: 15, title: 'channel', lines: chLines, tone: 'i', w: 15 },
  { id: 'cocol', x: 40, y: 15, title: 'countryName', lines: coLines, tone: 'i', w: 15 },
  { id: 'adcol', x: 60, y: 15, title: 'added', lines: addedLines(), tone: 'g', w: 14 },

  { id: 'dict', x: 12, y: 30, title: 'dictionary', lines: dictLines(), tone: 'i', caption: '사전 — 값 → 정수 id' },
  { id: 'list', x: 38, y: 30, title: 'list', lines: listLines(), tone: 'i', caption: '인코딩된 목록 — 행마다 id' },
  { id: 'bmap', x: 66, y: 30, title: 'bitmaps', lines: bitmapLines(), tone: 'q', caption: '값마다 비트맵 하나' },

  { id: 'scan', x: 82, y: 15, title: 'WHERE added > 50', lines: scanLines(), tone: 'x', caption: '숫자 컬럼은 값을 하나씩 비교' },

  { id: 'mv', x: 84, y: 13, title: 'tags (multi-value)', lines: mvLines(), tone: 'i', caption: '멀티 값 차원' },
  { id: 'json', x: 80, y: 27, title: 'COMPLEX<json>', lines: JSON_LINES, tone: 'm', caption: '중첩 JSON 컬럼' },

  { id: 'fVer', x: 82, y: 2, title: 'version.bin', lines: ['00 00 00 09', c('d', 'format v9')], tone: 'n' },
  { id: 'fMeta', x: 82, y: 8, title: 'meta.smoosh', lines: [c('d', 'file      → where'), '__time    → 00000', 'channel   → 00000', 'index.drd → 00000'], tone: 'n' },
  { id: 'fSm', x: 104, y: 2, title: '00000.smoosh', lines: smooshLines(), tone: 'g', caption: '컬럼 파일을 이어 붙인 것' },
  { id: 'spec', type: 'text', x: 82, y: 17, lines: SPEC },
];

const edges = [
  { id: 'toT', from: 'tbl', to: 'tcol', via: 'b-t', cy: 13.4, tone: 'n' },
  { id: 'toCh', from: 'tbl', to: 'chcol', via: 'b-t', cy: 13.4, tone: 'i' },
  { id: 'toCo', from: 'tbl', to: 'cocol', via: 'b-t', cy: 13.4, tone: 'i' },
  { id: 'toAd', from: 'tbl', to: 'adcol', via: 'b-t', cy: 13.4, tone: 'g' },
  { id: 'toDict', from: 'cocol', to: 'dict', via: 'bl-t', cy: 28.3, tone: 'i', label: 'values' },
  { id: 'toList', from: 'cocol', to: 'list', via: 'br-t', cy: 28.3, tone: 'i' },
  { id: 'listDict', from: 'list', to: 'dict', via: 'l-r', tone: 'i' },
];

const COLS = ['tcol', 'chcol', 'cocol', 'adcol'];
const STRUCT = ['dict', 'list', 'bmap'];

export default {
  title: '세그먼트 해부',
  docs: [
    ['Segments', 'https://druid.apache.org/docs/latest/design/segments'],
    ['indexSpec', 'https://druid.apache.org/docs/latest/ingestion/ingestion-spec#indexspec'],
    ['Nested columns', 'https://druid.apache.org/docs/latest/querying/nested-columns'],
  ],
  legend: [
    ['타임스탬프', 'n'],
    ['문자열 차원', 'i'],
    ['지표, 숫자', 'g'],
    ['비트맵의 1', 'q'],
  ],
  nodes,
  edges,
  steps: [
    {
      title: '세그먼트 하나를 열어 봐요',
      show: ['tbl'],
      body: `<p>앞 장의 <code>2026-09-23</code> 청크에서 세그먼트 하나를 열었어요. 행이 수백만 개지만 여기서는 여덟 행만 봐요. 행은 <b><code>__time</code> 순서로 정렬</b>돼 있어요.</p>
      <p>행 단위로 저장한다면 <code>SUM(added)</code> 하나를 구하려 해도 행마다 <b>모든 컬럼</b>을 함께 읽어야 해요(▸ 가 훑는 줄). Druid 는 그렇게 저장하지 않아요.</p>`,
      play: async (s) => {
        for (let i = 0; i < ROWS.length; i++) {
          s.patch('tbl', { lines: rowTable(i) });
          await s.wait(0.45);
        }
        s.patch('tbl', { lines: rowTable() });
        await s.wait(1.2);
      },
      gap: 0.3,
    },
    {
      title: '행을 컬럼으로',
      show: ['tbl', ...COLS],
      on: [...COLS, 'toT', 'toCh', 'toCo', 'toAd'],
      dim: false,
      body: `<p>세그먼트 파일은 <b>컬럼 기반</b>이에요. 컬럼마다 따로 된 자료 구조에 담기고, 쿼리는 <b>필요한 컬럼만</b> 읽어요. <code>SUM(added)</code> 라면 <code>added</code> 컬럼만 읽고 나머지는 건너뛰어요.</p>
      <p>컬럼은 세 종류예요: <b>타임스탬프</b>, <b class="i">차원</b>(dimension), <b class="g">지표</b>(metric).</p>`,
      play: async (s) => {
        await s.sendAll(['toT', 'toCh', 'toCo', 'toAd'], { dur: 1.2, glyph: '▾' });
        COLS.forEach((id) => s.pulse(id));
        await s.wait(2.2);
      },
    },
    {
      title: '__time 은 늘 있고, 먼저 정렬돼요',
      show: COLS,
      on: ['tcol', 'adcol'],
      body: `<p>모든 세그먼트에는 <b><code>__time</code></b> 컬럼이 반드시 있어요. 행은 먼저 <code>__time</code> 으로 정렬되고, 그다음 차원 순서로 정렬돼요.</p>
      <p>타임스탬프와 지표 컬럼은 <b>정수, 실수 배열</b>을 <b>LZ4</b> 로 블록 단위 압축한 거예요(그림의 가로줄이 블록 경계). 쿼리가 고른 행이 든 블록만 풀어서 읽고, 필요 없는 컬럼은 통째로 건너뛰어요.</p>`,
      play: async (s) => {
        s.patch('tcol', { lines: timeLines(0) });
        s.pulse('tcol');
        await s.wait(1.6);
        s.patch('tcol', { lines: timeLines(1) });
        s.pulse('tcol');
        await s.wait(1.6);
      },
      gap: 0.2,
    },
    {
      title: '문자열 차원 ①: 사전과 인코딩된 목록',
      show: [...COLS, 'dict', 'list'],
      on: ['cocol', 'dict', 'list', 'toDict', 'toList', 'listDict'],
      focus: [...COLS, 'dict', 'list'],
      hold: 10,
      body: `<p>문자열 차원 하나는 자료 구조 셋으로 저장돼요. 먼저 <b>사전</b>(dictionary): 값마다 정수 id 를 붙인 표예요. <code>null</code> 은 늘 <b>0번</b>이에요.</p>
      <p>다음은 <b>인코딩된 목록</b>(list): 각 행의 값을 문자열 대신 <b>id</b> 로 적은 배열이에요. GroupBy, TopN 처럼 값을 꺼내야 하는 쿼리가 이 목록을 읽어요. 필터로 고른 행의 지표만 합하는 쿼리는 목록을 읽지 않고도 끝나요.</p>`,
      play: async (s) => {
        await s.sendAll(['toDict', 'toList'], { dur: 1, glyph: '▾' });
        for (let i = 0; i < ROWS.length; i++) {
          s.patch('list', { lines: listLines(i) });
          s.patch('dict', { lines: dictLines(IDS[i]) });
          await s.wait(0.6);
        }
        s.patch('list', { lines: listLines() });
        s.patch('dict', { lines: dictLines() });
        await s.wait(0.8);
      },
      gap: 0.3,
    },
    {
      title: '문자열 차원 ②: 값마다 비트맵 하나',
      show: [...COLS, ...STRUCT],
      on: ['dict', 'bmap'],
      focus: [...COLS, ...STRUCT],
      hold: 10,
      body: `<p>셋째는 <b>비트맵</b>: 고유한 값마다 하나씩, 그 값이 들어 있는 행에 1 을 찍은 비트 배열이에요(역색인). 필터는 비트맵끼리 AND, OR 해서 풀어요.</p>
      <p>행마다 1 은 한 비트맵에만 있으니, 고유값이 많을수록 비트맵은 성기고 압축이 잘 돼요. 기본 압축은 <b>Roaring</b> 이고 <b>Concise</b> 도 고를 수 있어요. <code>null</code> 도 비트맵을 가져요.</p>`,
      play: async (s) => {
        for (let k = 0; k < CO.length; k++) {
          s.patch('dict', { lines: dictLines(k) });
          s.patch('bmap', { lines: bitmapLines(k) });
          await s.wait(1.1);
        }
        s.patch('dict', { lines: dictLines() });
        s.patch('bmap', { lines: bitmapLines() });
        await s.wait(0.6);
      },
      gap: 0.3,
    },
    {
      title: '숫자 컬럼에는 비트맵이 없어요',
      show: [...COLS, 'scan'],
      on: ['adcol', 'scan'],
      focus: [...COLS, 'scan'],
      hold: 10,
      body: `<p><code>added</code> 같은 지표는 <b>LZ4 로 압축한 숫자 배열</b>일 뿐, 값을 찾는 비트맵 인덱스가 없어요. 숫자 차원(LONG, DOUBLE)도 마찬가지예요(null 인 행을 표시하는 비트맵만 따로 둬요).</p>
      <p>그래서 <code>added &gt; 50</code> 같은 필터는 값을 <b>하나씩 비교</b>해야 해서, 문자열 필터보다 느릴 수 있어요. 대신 숫자 컬럼은 GROUP BY 가 빨라요.</p>`,
      play: async (s) => {
        for (let i = 0; i < ROWS.length; i++) {
          s.patch('adcol', { lines: addedLines(i) });
          s.patch('scan', { lines: scanLines(i) });
          await s.wait(0.55);
        }
        await s.wait(1.4);
        s.patch('adcol', { lines: addedLines() });
        s.patch('scan', { lines: scanLines() });
      },
      gap: 0.4,
    },
    {
      title: '멀티 값 차원과 중첩 JSON',
      show: [...COLS, 'mv', 'json'],
      on: ['mv', 'json'],
      focus: ['cocol', 'adcol', 'mv', 'json'],
      hold: 10,
      body: `<p><b>멀티 값</b> 문자열 차원은 한 행에 값이 여럿이에요. 목록의 그 칸이 <b>id 배열</b>이 되고, 값이 n 개인 행은 비트맵 n 개에 1 을 찍어요(그림의 row1).</p>
      <p><b>중첩 JSON</b>(<code>COMPLEX&lt;json&gt;</code>) 컬럼은 원본 JSON 사본과 함께, 안쪽의 원시값 경로마다 <b>내부 컬럼과 인덱스</b>를 따로 만들어요. <code>JSON_VALUE</code> 는 이 내부 컬럼을 보통 컬럼만큼 빠르게 읽어요.</p>`,
      play: async (s) => {
        s.patch('mv', { lines: mvLines(true) });
        s.pulse('mv');
        await s.wait(2.2);
        s.patch('mv', { lines: mvLines(false) });
        s.pulse('json');
        await s.wait(2.2);
      },
      gap: 0.2,
    },
    {
      title: '파일로 묶기: smoosh',
      show: [...COLS, 'fVer', 'fMeta', 'fSm', 'spec'],
      on: ['fVer', 'fMeta', 'fSm', 'spec'],
      focus: [...COLS, 'fVer', 'fMeta', 'fSm', 'spec'],
      hold: 11,
      body: `<p>컬럼 하나는 <code>ColumnDescriptor</code>(JSON 메타데이터)와 이진 데이터로 저장되고, 모든 컬럼 파일과 세그먼트 메타데이터 <code>index.drd</code> 가 <b><code>XXXXX.smoosh</code></b> 에 이어 붙어요. smoosh 파일은 자바 메모리 매핑의 한도에 맞춰 <b>2 GB 이하</b>예요.</p>
      <p><code>meta.smoosh</code> 는 파일 이름과 위치를, <code>version.bin</code> 은 포맷 판(<b>v9</b>)을 적어요. v10 은 36 부터 켤 수 있는 새 포맷이에요. 압축 방식은 컬럼마다가 아니라 세그먼트 단위(<code>indexSpec</code>)로 정해요.</p>`,
      play: async (s) => {
        s.pulse('fVer');
        await s.wait(0.8);
        s.pulse('fMeta');
        await s.wait(0.8);
        for (let k = 0; k < 5; k++) {
          s.patch('fSm', { lines: smooshLines(k) });
          await s.wait(0.6);
        }
        s.patch('fSm', { lines: smooshLines() });
        await s.wait(1.2);
      },
      gap: 0.3,
    },
  ],
};
