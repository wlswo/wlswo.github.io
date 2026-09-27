/*
 * 02 데이터소스, 타임 청크, 세그먼트
 *
 * 큰 틀이 데이터소스(wikipedia)다. 왼쪽에서 오른쪽으로 시간이 흐른다(닷새, 한
 * 칸에 하루 = 22열). 이벤트(•)가 쌓이고(1), 하루 단위 청크로 나뉘고(2), 청크마다
 * 세그먼트 상자로 묶인다(3). 한 상자의 이름을 풀어 읽고(4), 한 청크를 다시 쓰면
 * 새 버전이 옛 버전을 가린다(5). 작은 세그먼트가 많으면(6), 세그먼트가 사는 세 곳(7).
 */
import { c, bar, table } from '../ascii.js';

const DAYS = ['09-21', '09-22', '09-23', '09-24', '09-25'];
const COUNTS = [14, 22, 31, 12, 9];
const PER_SEG = 12; // 그림에서 쓰는 maxRowsPerSegment (실제 기본값은 5,000,000)
const X0 = 2;
const W = 22; // 청크 하나의 폭(열)
const V1 = '2026-09-24T02:10:07.412Z';
const V2 = '2026-09-26T08:12:45.123Z';

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 청크마다 파티션별 행 수
const PARTS = COUNTS.map((n) => Array.from({ length: Math.ceil(n / PER_SEG) }, (_, p) => Math.min(PER_SEG, n - p * PER_SEG)));

// 이벤트: 시간 순으로 한 줄에 흩어 놓은 점(1단계)
const R = rng(20260923);
const EVENTS = COUNTS.flatMap((n, d) => Array.from({ length: n }, () => ({ d, t: R(), row: Math.floor(R() * 4) })));
function streamLines(upto = 999) {
  const rows = Array.from({ length: 4 }, () => Array(W * 5).fill(' '));
  for (const e of EVENTS) {
    let col = e.d * W + 1 + Math.floor(e.t * (W - 2));
    if (col > upto) continue;
    let r = e.row;
    for (let k = 0; k < 4 && rows[r][col] !== ' '; k++) r = (r + 1) % 4;
    if (rows[r][col] === ' ') rows[r][col] = '•';
  }
  return rows.map((r) => [c('i', r.join(''))]);
}

// 청크 안에 모아 놓은 점(2단계)
const dotLines = (n) => {
  const out = [];
  for (let k = 0; k < n; k += 8) out.push(c('i', Array(Math.min(8, n - k)).fill('•').join(' ')));
  return out;
};

const segLines = (rows) => [`rows: ${String(rows).padStart(2)}`, bar(rows, PER_SEG, 10, { tone: 'i' })];

// 식별자 풀어 읽기
const ID_PARTS = [
  ['wikipedia', 'datasource', 'i'],
  ['2026-09-23T00:00:00.000Z', 'interval start', 'q'],
  ['2026-09-24T00:00:00.000Z', 'interval end', 'q'],
  [V1, 'version', 'm'],
  ['1', 'partitionNum', 'g'],
];
function idLines() {
  const starts = [];
  let col = 0;
  const head = [];
  ID_PARTS.forEach(([text, , tone], i) => {
    if (i) {
      head.push(c('d', '_'));
      col += 1;
    }
    starts.push(col);
    head.push(c(tone, text));
    col += text.length;
  });
  const lines = [head];
  for (let k = ID_PARTS.length - 1; k >= 0; k--) {
    const row = [];
    let at = 0;
    for (let j = 0; j <= k; j++) {
      const gap = starts[j] - at;
      if (gap > 0) row.push(' '.repeat(gap));
      if (j < k) row.push(c(ID_PARTS[j][2], '│'));
      else row.push(c(ID_PARTS[j][2], `└─ ${ID_PARTS[j][1]}`));
      at = starts[j] + 1;
    }
    lines.push(row);
  }
  return lines;
}

const AXIS = (() => {
  const labels = Array(W * 5 + 12).fill(' ');
  ['09-21', '09-22', '09-23', '09-24', '09-25', '09-26'].forEach((d, i) => {
    for (let k = 0; k < d.length; k++) labels[i * W + k] = d[k];
  });
  const rule = `├${[0, 1, 2, 3, 4].map(() => '─'.repeat(W - 1)).join('┼')}┤──▶ __time`;
  return [c('d', labels.join('').trimEnd()), c('d', rule)];
})();

const nodes = [
  { id: 'ds', type: 'frame', x: 0, y: 0, cols: W * 5 + 4, rows: 21, title: 'datasource: wikipedia', tone: 'i', caption: '데이터소스 = 테이블' },
  { id: 'evAll', type: 'text', x: X0, y: 7, lines: streamLines(), tone: 'i' },
  { id: 'axis', type: 'text', x: X0, y: 21, lines: AXIS },
  { id: 'kttm', type: 'frame', x: 0, y: 25, cols: W * 5 + 4, rows: 6, title: 'datasource: kttm', tone: 'n', caption: '다른 데이터소스' },
  { id: 'kdots', type: 'text', x: X0, y: 27, lines: [c('d', '  •    •      •  •     •       •   •      •     •  •       •     •    •   •     •        •   •     •    •  •')], tone: 'n' },

  ...DAYS.map((d, i) => ({ id: `ch${i}`, type: 'frame', x: X0 + i * W, y: 2, cols: W - 2, rows: 17, title: d, tone: 'q', frame: 'dashed' })),
  ...DAYS.map((d, i) => ({ id: `ev${i}`, type: 'text', x: X0 + i * W + 2, y: 5, lines: dotLines(COUNTS[i]), tone: 'i' })),

  ...PARTS.flatMap((ps, d) =>
    ps.map((rows, p) => ({ id: `s${d}${p}`, x: X0 + d * W + 2, y: 4 + p * 4, title: `p${p}`, lines: segLines(rows), w: 14, tone: 'i', z: 2 })),
  ),
  // 다시 쓴 09-23 청크(v2): 두 파티션
  ...[16, 15].map((rows, p) => ({ id: `v2${p}`, x: X0 + 2 * W + 2, y: 4 + p * 4, title: `v2 p${p}`, lines: segLines(rows).map((l, k) => (k === 0 ? `rows: ${rows}` : bar(rows, 16, 10, { tone: 'g' }))), w: 14, tone: 'g', z: 3 })),
  // 스트리밍이 남긴 작은 세그먼트들(09-25)
  { id: 'tiny', type: 'text', x: X0 + 4 * W + 2, y: 4, lines: [c('i', '[s][s][s][s]'), c('i', '[s][s][s][s]'), c('d', '8 tiny segments')] },

  { id: 'idn', type: 'text', x: X0 + 2, y: 24, lines: idLines() },

  { id: 'deep', x: 0, y: 27, title: 'deep storage', lines: ['s3://druid/segments/', 'wikipedia/…/index.zip'], tone: 'g', frame: 'round', caption: '딥 스토리지 — 파일 원본' },
  {
    id: 'meta',
    x: 32,
    y: 27,
    title: 'druid_segments',
    lines: table(['id', 'used', 'payload'], [['wikipedia_2026-09-21…_1', c('g', 'true'), '{ loadSpec: s3 … }']]),
    tone: 'p',
    frame: 'round',
    caption: '메타데이터 저장소 — 한 건에 한 줄',
  },
  { id: 'hist', x: 92, y: 27, title: 'Historical', lines: ['segment cache', '[s][s][s]'], tone: 'i', caption: '쿼리용 사본' },
];

const edges = [
  { id: 'toDeep', from: 's01', to: 'deep', via: 'bl-t', cy: 24.5, tone: 'g', label: 'push' },
  { id: 'toMeta', from: 's01', to: 'meta', via: 'br-t', cy: 25.4, tone: 'p', label: 'publish' },
  { id: 'toHist', from: 'deep', to: 'hist', via: 'b-b', offset: 46, tone: 'g', label: 'download' },
];

const CHUNKS = DAYS.map((_, i) => `ch${i}`);
const SEGS = PARTS.flatMap((ps, d) => ps.map((_, p) => `s${d}${p}`));
const V1IDS = ['s20', 's21', 's22'];

export default {
  title: '데이터소스와 세그먼트',
  docs: [
    ['Segments', 'https://druid.apache.org/docs/latest/design/segments'],
    ['Storage overview', 'https://druid.apache.org/docs/latest/design/storage'],
    ['Segment size optimization', 'https://druid.apache.org/docs/latest/operations/segment-optimization'],
  ],
  legend: [
    ['세그먼트, 행', 'i'],
    ['타임 청크', 'q'],
    ['새 버전', 'g'],
    ['메타데이터', 'p'],
  ],
  nodes,
  edges,
  steps: [
    {
      title: '데이터소스는 테이블이에요',
      show: ['ds', 'evAll', 'axis', 'kttm', 'kdots'],
      body: `<p>Druid 의 데이터는 <b>데이터소스</b>에 담겨요. 관계형 DB 의 테이블과 같아요. 여기서는 공식 튜토리얼의 <code>wikipedia</code> 데이터소스(위키백과 편집 이벤트)를 예로 들어요.</p>
      <p>모든 행에는 <b>기본 타임스탬프 <code>__time</code></b> 이 있어요. Druid 는 이 시간을 기준으로 데이터를 나누고, 찾고, 지워요. 점(•) 하나가 이벤트 한 건이고, 왼쪽에서 오른쪽으로 시간이 흘러요.</p>`,
      play: async (s) => {
        for (let k = 0; k <= W * 5; k += 4) {
          s.patch('evAll', { lines: streamLines(k) });
          await s.wait(0.12);
        }
        await s.wait(2.4);
      },
      gap: 0.2,
    },
    {
      title: '먼저 시간으로 잘라요: 타임 청크',
      show: ['ds', 'axis', ...CHUNKS, 'ev0', 'ev1', 'ev2', 'ev3', 'ev4'],
      on: CHUNKS,
      dim: false,
      patch: { ds: { tag: 'segmentGranularity: DAY' } },
      body: `<p>Druid 는 먼저 <b>시간</b>으로 데이터를 나눠요. 수집 스펙의 <code>segmentGranularity</code> 가 <code>DAY</code> 면 하루가 한 <b>타임 청크</b>(time chunk)가 돼요. <code>DAY</code> 가 기본값이에요.</p>
      <p>청크는 <code>2026-09-23/2026-09-24</code> 처럼 반열린 구간(interval)으로 적어요. 한 청크의 이벤트는 반드시 그 청크의 세그먼트로만 들어가고, 데이터가 없는 구간에는 세그먼트도 없어요.</p>`,
    },
    {
      title: '청크 안에서 다시 나눠요: 세그먼트',
      show: ['ds', 'axis', ...CHUNKS, ...SEGS],
      patch: { ds: { tag: 'segmentGranularity: DAY' } },
      body: `<p>청크 하나의 데이터가 많으면 여러 <b>세그먼트</b>로 나뉘어요. 같은 청크의 세그먼트들을 <b>파티션</b>이라 부르고, 0 부터 번호(<code>partitionNum</code>)를 매겨요.</p>
      <p>세그먼트 하나는 보통 수백만 행을 담는 <b>컬럼 기반 파일</b>이에요. 게시되고 나면 바꾸지 않아요(불변). 고치려면 새 세그먼트를 만들어 바꿔 끼워요.</p>
      <p class="note">그림에서는 세그먼트 하나에 12행씩 담았어요. 동적 파티셔닝의 기본값 <code>maxRowsPerSegment</code> 는 5,000,000 이에요.</p>`,
      play: async (s) => {
        for (const id of SEGS) {
          s.pulse(id);
          await s.wait(0.18);
        }
        await s.wait(2.5);
      },
    },
    {
      title: '세그먼트 식별자 읽기',
      show: ['ds', 'axis', ...CHUNKS, ...SEGS, 'idn'],
      on: ['ch2', 's21', 'idn'],
      focus: ['ch1', 'ch2', 'ch3', 'idn'],
      patch: { s21: { tag: 'id ↓' } },
      body: `<p>세그먼트마다 이름이 있어요. 네 조각을 밑줄로 이어요:</p>
      <p><span class="i">데이터소스</span> _ <span class="q">구간 시작</span> _ <span class="q">구간 끝</span> _ <span class="m">버전</span> _ <span class="g">파티션 번호</span></p>
      <p><b>버전</b>은 보통 그 세그먼트 묶음을 만든 작업이 시작된 시각(ISO8601)이고, 문자열로 비교해요. 같은 구간을 다시 쓰면 더 큰 버전이 매겨져요. <b>파티션 번호가 0 이면 이름에서 빠져요.</b></p>`,
    },
    {
      title: '다시 쓰면 새 버전이 옛 버전을 가려요',
      show: ['ds', 'axis', ...CHUNKS, ...SEGS, 'v20', 'v21'],
      on: ['ch2', 'v20', 'v21'],
      focus: ['ch1', 'ch2', 'ch3'],
      patch: Object.fromEntries(
        V1IDS.map((id, p) => [id, { x: X0 + 2 * W + 3, y: 5 + p * 4, title: `v1 p${p}`, lines: [c('d', 'overshadowed'), c('d', '..........')], frame: 'dashed', tone: 'd', z: 1 }]),
      ),
      hold: 10,
      body: `<p>09-23 청크를 다시 수집(덮어쓰기)하면 새 세그먼트들이 <b>더 큰 버전</b>으로 만들어져요. 새 버전 한 벌이 모두 실린 뒤에야 Broker 가 넘어가서, 한 청크 안에서 옛 버전과 새 버전이 섞여 보이는 일은 없어요(MVCC). Druid 는 청크 하나에 <b>한 번에 한 버전만</b> 써요.</p>
      <p>바꿔 끼우기는 <b>청크마다</b> 원자적이에요. 가려진(overshadowed) 세그먼트는 Coordinator 가 쓰지 않음(<code>used = false</code>)으로 표시해 내리고, <b>kill</b> 작업을 돌리면 딥 스토리지와 메타데이터에서 지워져요.</p>`,
      play: async (s) => {
        s.state('v20', 'hidden');
        s.state('v21', 'hidden');
        V1IDS.forEach((id, p) => s.patch(id, { x: X0 + 2 * W + 2, y: 4 + p * 4, title: `v1 p${p}`, lines: segLines(PARTS[2][p]), frame: 'single', tone: 'i' }));
        await s.wait(1.6);
        s.state('v20', null);
        s.state('v21', null);
        s.pulse('v20');
        s.pulse('v21');
        await s.wait(1);
        V1IDS.forEach((id, p) => s.patch(id, { x: X0 + 2 * W + 3, y: 5 + p * 4, title: `v1 p${p}`, lines: [c('d', 'overshadowed'), c('d', '..........')], frame: 'dashed', tone: 'd' }));
        await s.wait(4);
      },
      gap: 0.4,
    },
    {
      title: '세그먼트 크기가 중요한 이유',
      show: ['ds', 'axis', ...CHUNKS, ...SEGS.filter((id) => id !== 's40'), 'tiny'],
      on: ['ch4', 'tiny'],
      focus: ['ch2', 'ch3', 'ch4'],
      hold: 10,
      body: `<p>쿼리는 <b>세그먼트마다 스레드 하나</b>로 처리돼요. 작은 세그먼트가 너무 많으면 세그먼트마다 드는 고정 비용이 쌓이고, 너무 크면 나눠서 병렬로 처리하지 못해요.</p>
      <p>공식 문서는 세그먼트 하나에 <b>약 500만 행</b>을 권하고(바이트보다 행 수가 더 중요하다고 해요), 크기로는 <b>300 MB ~ 700 MB</b> 를 들어요. 스트리밍 수집은 작은 세그먼트를 많이 남기기 쉬워서 <b>컴팩션</b>으로 합쳐 줘요.</p>`,
      play: async (s) => {
        await s.wait(2.4);
        s.state('tiny', 'hidden');
        s.state('s40', 'on');
        s.patch('s40', { lines: ['rows: 9', bar(9, 12, 10, { tone: 'g' })], title: 'p0 (compacted)' });
        s.pulse('s40');
        await s.wait(3.2);
      },
      gap: 0.2,
    },
    {
      title: '세그먼트가 사는 세 곳',
      show: ['ds', 'axis', ...CHUNKS, ...SEGS, 'deep', 'meta', 'hist'],
      on: ['s01', 'deep', 'meta', 'hist', 'toDeep', 'toMeta', 'toHist'],
      hold: 11,
      body: `<ul>
        <li><b class="g">딥 스토리지</b>: 세그먼트 파일 원본이에요. 여기 있으면 잃지 않아요.</li>
        <li><b class="p">메타데이터 저장소</b>: 세그먼트 한 건당 한 줄(<code>druid_segments</code>)이에요. 식별자, 쓰임 여부 <code>used</code>, 어디서 받는지(<code>loadSpec</code>) 같은 걸 적어요. Coordinator 는 이 목록을 보고 무엇을 실을지 정해요.</li>
        <li><b class="i">Historical</b>: 쿼리에 답하려고 딥 스토리지에서 내려받아 둔 사본(세그먼트 캐시)이에요.</li>
      </ul>`,
      play: async (s) => {
        await s.sendAll(['toDeep', 'toMeta'], { dur: 1.3, glyph: '[s]' });
        s.pulse('deep');
        s.pulse('meta');
        await s.wait(0.5);
        await s.send('toHist', { dur: 1.3, glyph: '[s]' });
        s.pulse('hist');
        await s.wait(1.6);
      },
    },
  ],
};
