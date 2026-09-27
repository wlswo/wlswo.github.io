/*
 * 08 배치 수집
 *
 * 왼쪽에 입력 파일, 위에 index_parallel(슈퍼바이저 태스크), Overlord, 메타데이터 저장소.
 * 가운데가 파이프라인이다: 1단계 워커(세 줄) → 로컬 디스크(조각) → 셔플 → 2단계
 * 머지 워커 → 오른쪽의 딥 스토리지. 아래쪽은 게시 방식 표, SQL, 락, 비교 표 자리.
 *
 * 조작의 partitionsSpec(dynamic, hashed, range)에 따라 3, 4단계의 그림과 글이
 * 바뀐다: dynamic 은 한 단계로 곧장 딥 스토리지로, hashed 는 맵 → 셔플 → 리듀스,
 * range 는 분포를 먼저 재고(입력을 두 번 읽는다) 맵 → 셔플 → 리듀스.
 *
 *   열:  files 0, worker 28, disk 48, shuffle 72, merge 90, deep 110
 *   줄:  위 0, 머리글 7, 워커 10 / 18 / 26, 표 33
 */
import { c, table } from '../ascii.js';

const K = [0, 1, 2];
const BT = ['i', 'q', 'y']; // 버킷 #0, #1, #2 의 색
const ROW = [10, 18, 26]; // 워커 줄(윗변)
const LABEL = {
  dynamic: ['p0', 'p1', 'p2'],
  hashed: ['#0', '#1', '#2'],
  range: ['r0', 'r1', 'r2'],
};
const two = (spec) => spec !== 'dynamic';

const bucketLine = (spec, chunk) => {
  const L = LABEL[spec];
  return [`${chunk} `, c(BT[0], L[0]), ' ', c(BT[1], L[1]), ' ', c(BT[2], L[2])];
};
const segLine = (spec, chunk) => (two(spec) ? [`${chunk} `, c(BT[0], 'p0'), ' ', c(BT[1], 'p1'), ' ', c(BT[2], 'p2')] : [`${chunk} `, c('n', 'p0 p1 p2')]);
const diskLines = (spec) => (two(spec) ? [bucketLine(spec, '09-23'), bucketLine(spec, '09-24')] : [c('d', 'not used'), ' ']);
const deepLines = (spec) => [segLine(spec, '09-23'), segLine(spec, '09-24')];
// 빈 줄은 '' 대신 ' ' 로(빈 조각은 그림판이 한 칸짜리 빈칸으로 그려 틀이 어긋난다)
const EMPTY = [c('d', 'empty'), ' '];

const HDR1 = {
  dynamic: [c('m', 'phase 1/1: single_phase_sub_task')],
  hashed: [c('m', 'phase 1: partial_index_generate'), c('d', '  (map)')],
  range: [c('m', 'phase 2: partial_range_index_generate')],
};
const HDR1_DIST = [c('m', 'phase 1: partial_dimension_distribution')];
const HDR2 = {
  hashed: [c('m', 'phase 2: shuffle → partial_index_generic_merge')],
  range: [c('m', 'phase 3: shuffle → partial_index_generic_merge')],
};
const RANGE_LINE = ['r0 ', c('d', '< France'), '  r1 ', c('d', '< Japan'), '  r2'];

const supLines = (phase, extra = c('d', ' ')) => ['supervisor task', c('d', 'maxNumConcurrentSubTasks: 3'), ['phase: ', c('b', phase)], extra];
const PHASE1 = { dynamic: 'single phase', hashed: 'map', range: 'distribution' };

// 게시 방식: 09-23/09-26 구간을 다시 쓰는데, 새 데이터는 09-23, 09-24 에만 있다
const OPTS = (hi = -1) =>
  table(
    ['  interval 09-23/09-26', '09-22', '09-23', '09-24', '09-25'],
    [
      ['existing', 'v1', 'v1', 'v1', 'v1'],
      ['new data', c('d', '-'), c('i', 'rows'), c('i', 'rows'), c('d', '-')],
      ['default', 'v1', c('g', 'v2'), c('g', 'v2'), 'v1'],
      ['appendToExisting', 'v1', c('g', 'v1+'), c('g', 'v1+'), 'v1'],
      ['dropExisting', 'v1', c('g', 'v2'), c('g', 'v2'), c('x', 'tombstone')],
    ].map((r, i) => r.map((cell, j) => (j ? cell : i === hi ? c('b', `> ${cell}`) : `  ${cell}`))),
  );

const SQL = [
  [c('q', 'REPLACE INTO'), ' wikipedia'],
  [c('q', 'OVERWRITE WHERE'), ' __time >= TIMESTAMP ', c('g', "'2026-09-23'")],
  ['            AND __time <  TIMESTAMP ', c('g', "'2026-09-25'")],
  [c('q', 'SELECT'), ' ... ', c('q', 'FROM TABLE'), '(EXTERN(...))'],
  [c('q', 'PARTITIONED BY'), ' DAY'],
  [c('q', 'CLUSTERED BY'), ' countryName'],
];

const LOCKS = table(
  ['statement', '09-22', '09-23', '09-24', '09-25', 'lock'],
  [
    [c('i', 'INSERT'), c('i', 'S'), c('i', 'S'), c('i', 'S'), c('i', 'S'), c('i', 'shared')],
    [c('q', 'REPLACE'), c('d', '.'), c('q', 'X'), c('q', 'X'), c('d', '.'), c('q', 'exclusive')],
  ],
);

const CMP = table(
  ['', 'native batch', 'SQL (MSQ)'],
  [
    [c('b', 'controller'), 'index_parallel', 'query_controller'],
    [c('b', 'parallelism'), 'subtasks if maxNumConcurrentSubTasks > 1', 'query_worker tasks'],
    [c('b', 'fault tolerance'), 'failed workers relaunched', 'any task failure = job failure'],
    [c('b', 'partitioning'), 'dynamic, hashed, range', 'range (CLUSTERED BY)'],
    [c('b', 'rollup'), 'perfect with forceGuaranteedRollup', c('g', 'always perfect')],
    [c('b', 'append'), 'appendToExisting', 'INSERT'],
    [c('b', 'overwrite'), 'default, dropExisting', 'REPLACE ... OVERWRITE'],
    [c('b', 'input'), 'any inputSource', 'EXTERN, FROM datasource'],
  ],
);

function nodes({ spec = 'hashed' }) {
  return [
    { id: 'files', x: 0, y: 12, title: 'input files', lines: ['s3://wiki/2026-09/', 'part-0.json.gz', 'part-1.json.gz', 'part-2.json.gz'], tone: 'n', frame: 'round', caption: '입력 파일' },
    { id: 'sup', x: 26, y: 0, title: 'index_parallel', lines: supLines('split input'), w: 30, tone: 'm', caption: '슈퍼바이저 태스크' },
    { id: 'ovl', x: 64, y: 0, title: 'Overlord', lines: ['task queue', 'slots on MMs'], tone: 'm', caption: '태스크 배정' },
    { id: 'meta', x: 106, y: 0, title: 'metadata store', lines: ['druid_segments', c('d', 'published: -')], w: 18, tone: 'p', frame: 'round', caption: '메타데이터 저장소' },
    { id: 'hdr1', type: 'text', x: 28, y: 7, lines: [HDR1[spec]] },
    { id: 'hdr2', type: 'text', x: 72, y: 7, lines: [HDR2[spec] || ' '] },
    ...K.map((k) => ({ id: `w${k}`, x: 28, y: ROW[k], title: 'worker', lines: [`split ${k}`, c('d', `@ MM-${k + 1}`)], tone: 'm' })),
    ...K.map((k) => ({ id: `d${k}`, x: 48, y: ROW[k], title: 'local disk', lines: EMPTY, w: 16, tone: 'n', caption: k === 2 ? '워커의 로컬 디스크' : undefined })),
    { id: 'shuf', x: 72, y: 17, title: 'shuffle', lines: ['same key', '-> same', 'reducer'], tone: 'n' },
    ...K.map((k) => ({ id: `r${k}`, x: 90, y: ROW[k], title: 'merge', lines: [['bucket ', c(BT[k], LABEL[spec][k])], c('d', `@ MM-${((k + 1) % 3) + 1}`)], tone: BT[k] })),
    { id: 'deep', x: 110, y: 16, title: 'deep storage', lines: [c('d', 'no new segments'), ' '], w: 16, tone: 'g', frame: 'round', caption: '딥 스토리지' },
    { id: 'opts', type: 'text', x: 20, y: 33, lines: OPTS() },
    { id: 'sql', type: 'text', x: 0, y: 33, lines: SQL },
    { id: 'locks', type: 'text', x: 56, y: 34, lines: LOCKS },
    { id: 'cmp', type: 'text', x: 14, y: 33, lines: CMP },
  ];
}

const edges = [
  { id: 'sOv', from: 'sup', to: 'ovl', via: 'r-l', tone: 'm', label: 'tasks' },
  { id: 'sMeta', from: 'sup', to: 'meta', via: 't-t', offset: 20, tone: 'p', label: 'publish — all at once' },
  { id: 'f0', from: 'files', to: 'w0', via: 'rt-l', cx: 24.2, tone: 'n' },
  { id: 'f1', from: 'files', to: 'w1', via: 'r-l', cx: 25, tone: 'n' },
  { id: 'f2', from: 'files', to: 'w2', via: 'rb-l', cx: 25.8, tone: 'n' },
  ...K.map((k) => ({ id: `wd${k}`, from: `w${k}`, to: `d${k}`, via: 'r-l', tone: 'n', label: k === 0 ? 'partials' : undefined })),
  ...K.map((k) => ({ id: `ds${k}`, from: `d${k}`, to: 'shuf', via: `r-${['lt', 'l', 'lb'][k]}`, cx: 67.5 + k, tone: 'n' })),
  ...K.map((k) => ({ id: `sr${k}`, from: 'shuf', to: `r${k}`, via: `${['rt', 'r', 'rb'][k]}-l`, cx: 86.3 + k * 0.8, tone: BT[k] })),
  ...K.map((k) => ({ id: `rd${k}`, from: `r${k}`, to: 'deep', via: `r-${['lt', 'l', 'lb'][k]}`, cx: 105 + k, tone: 'g', label: k === 0 ? 'push' : undefined })),
  ...K.map((k) => ({ id: `wg${k}`, from: `w${k}`, to: 'deep', via: `r-${['lt', 'l', 'lb'][k]}`, cx: 105 + k, tone: 'g', ...(k === 0 ? { label: 'push segments', lx: -34, ly: -2.5 } : {}) })),
];

const ids = (p) => K.map((k) => `${p}${k}`);
const W = ids('w');
const D = ids('d');
const R = ids('r');
const F = ids('f');
const WD = ids('wd');
const DS = ids('ds');
const SR = ids('sr');
const RD = ids('rd');
const WG = ids('wg');
const TOP = ['files', 'sup', 'ovl', 'meta'];

const MODE_NOTE = `<p class="note">위의 <b>partitionsSpec</b> 을 바꾸면 그림과 설명이 그 방식으로 바뀌어요.</p>`;

export default {
  title: '배치 수집',
  docs: [
    ['Native batch', 'https://druid.apache.org/docs/latest/ingestion/native-batch'],
    ['SQL-based ingestion', 'https://druid.apache.org/docs/latest/multi-stage-query/concepts'],
    ['Ingestion overview', 'https://druid.apache.org/docs/latest/ingestion/'],
  ],
  legend: [
    ['행', 'n'],
    ['#0', 'i'],
    ['#1', 'q'],
    ['#2', 'y'],
    ['태스크, 제어', 'm'],
    ['세그먼트 저장', 'g'],
    ['메타데이터', 'p'],
  ],
  controls: [{ id: 'spec', label: 'partitionsSpec', type: 'seg', options: ['dynamic', 'hashed', 'range'], value: 'hashed' }],
  nodes,
  edges,
  steps: [
    {
      title: '파일을 읽어 세그먼트 만들기',
      show: [...TOP, ...W, 'deep'],
      edges: [],
      body: `<p>배치 수집은 이미 쌓여 있는 파일(S3, HDFS, 로컬 따위)이나 다른 데이터소스를 한 번에 읽어 세그먼트로 만드는 <b>한 번짜리 작업</b>이에요. 방법은 둘이에요.</p>
      <ul><li><b>네이티브 배치</b>: JSON 스펙을 태스크 API 로 보내면 <code>index_parallel</code> 태스크가 돌아요.</li>
      <li><b>SQL</b>: <code>INSERT</code>, <code>REPLACE</code> 문을 SQL 태스크 API 로 보내면 <code>query_controller</code> 태스크가 돌아요(멀티 스테이지 엔진).</li></ul>
      <p>이 장은 네이티브 배치를 따라가고, 끝에서 SQL 과 견줘요.</p>`,
    },
    {
      title: '슈퍼바이저 태스크의 입력 쪼개기',
      show: [...TOP, ...W, 'deep'],
      on: ['sup', 'ovl', 'files', ...W, 'sOv', ...F],
      focus: ['files', 'sup', 'ovl', ...W],
      hold: 10,
      body: `<p><code>index_parallel</code> 은 작업 전체를 지휘하는 <b>슈퍼바이저 태스크</b>예요(스트리밍의 수퍼바이저와는 달라요). 입력을 조각(split)으로 나누고, 조각마다 <b>워커 태스크</b>를 만들어 Overlord 에 보내면 Overlord 가 MiddleManager(또는 Indexer)에서 돌려요. 실패한 워커는 <code>maxRetry</code>(기본 3)번까지 다시 띄워요.</p>
      <p class="note"><code>maxNumConcurrentSubTasks</code> 의 기본값은 1 이에요. 그때는 워커 없이 슈퍼바이저가 파일을 하나씩 직접 읽어요. 병렬로 돌리려면 1 보다 크게 줘요.</p>`,
      play: async (s) => {
        s.pulse('sup');
        await s.wait(0.5);
        await s.send('sOv', { glyph: '▸▸▸', dur: 1 });
        s.pulse('ovl');
        await s.wait(0.4);
        W.forEach((id) => s.pulse(id));
        await s.wait(0.5);
        await s.sendAll(F, { glyph: '≡', dur: 1.2 });
        await s.wait(1.4);
      },
    },
    {
      title: '1단계: 읽어서 나누기',
      show: ({ spec }) => [...TOP, 'hdr1', ...W, ...(two(spec) ? D : ['deep'])],
      on: ({ spec }) => ['hdr1', ...W, 'files', ...F, ...(two(spec) ? [...D, ...WD] : ['deep', ...WG])],
      focus: ({ spec }) => (two(spec) ? ['files', 'sup', 'hdr1', ...W, ...D] : ['files', 'sup', ...W, 'deep']),
      patch: ({ spec }) => ({ sup: { lines: supLines(PHASE1[spec]) } }),
      hold: 14,
      body: ({ spec }) =>
        ({
          dynamic: `<p>기본값인 <code>dynamic</code> 에서는 워커(<code>single_phase_sub_task</code>)가 제 조각을 읽으면서 곧바로 세그먼트를 만들어 딥 스토리지에 올려요. 세그먼트가 <code>maxRowsPerSegment</code>(기본 5,000,000 행)를 넘으면 새 세그먼트를 열고, 모인 행이 <code>maxTotalRows</code>(기본 20,000,000)에 닿으면 그때까지 만든 것을 먼저 올려요.</p>
          <p>단계가 이것 하나뿐이라 가장 빨라요.</p>`,
          hashed: `<p><code>hashed</code> 는 MapReduce 처럼 돌아요. 맵 워커(<code>partial_index_generate</code>)가 행을 먼저 <b>타임 청크</b>로, 다시 <code>partitionDimensions</code> 값의 <b>해시</b>(<code>murmur3_32_abs</code>)로 나눠 제 MiddleManager 의 <b>로컬 디스크</b>에 둬요.</p>
          <p class="note"><code>numShards</code> 를 주지 않으면 그 앞에 카디널리티를 재는 단계(<code>partial_dimension_cardinality</code>)가 붙어서, <code>targetRowsPerSegment</code> 로 샤드 수를 정해요.</p>`,
          range: `<p><code>range</code>(와 <code>single_dim</code>)는 먼저 워커(<code>partial_dimension_distribution</code>)가 파티션 차원 값의 <b>히스토그램</b>을 만들고, 슈퍼바이저가 행이 고르게 나뉘도록 <b>구간 경계</b>를 정해요. 그다음 워커(<code>partial_range_index_generate</code>)가 입력을 <b>한 번 더</b> 읽어 (타임 청크, 구간)별로 나눠 로컬 디스크에 둬요.</p>
          <p class="note">입력을 두 번 읽으니, 그 사이에 입력이 바뀌면 실패할 수 있어요.</p>`,
        })[spec] + MODE_NOTE,
      play: async (s) => {
        const spec = s.params.spec;
        if (spec === 'dynamic') {
          await s.sendAll(F, { glyph: '•', dur: 1 });
          W.forEach((id) => s.pulse(id));
          await s.wait(0.5);
          await s.sendAll(WG, { glyph: '[s]', dur: 1.5 });
          s.patch('deep', { lines: deepLines(spec) });
          s.pulse('deep');
          await s.wait(2.4);
          s.reset();
          return;
        }
        if (spec === 'range') {
          s.patch('hdr1', { lines: [HDR1_DIST] });
          await s.sendAll(F, { glyph: '•', dur: 1 });
          for (const k of K) {
            s.pulse(`w${k}`);
            s.patch('sup', { lines: supLines('distribution', ['histograms: ', c('b', `${k + 1}/3`)]) });
            await s.wait(0.5);
          }
          s.pulse('sup');
          s.patch('sup', { lines: supLines('boundaries', RANGE_LINE) });
          await s.wait(1.8);
          s.patch('hdr1', { lines: [HDR1.range] });
          s.patch('sup', { lines: supLines('generate', RANGE_LINE) });
        }
        await s.sendAll(F, { glyph: '•', dur: 1 });
        W.forEach((id) => s.pulse(id));
        await s.wait(0.3);
        for (const b of K) {
          s.sendAll(WD, { glyph: LABEL[spec][b], tone: BT[b], dur: 0.9 }).catch(() => {});
          await s.wait(0.3);
        }
        await s.wait(0.8);
        D.forEach((id) => {
          s.patch(id, { lines: diskLines(spec) });
          s.pulse(id);
        });
        await s.wait(2.6);
        s.reset();
      },
      gap: 0.6,
    },
    {
      title: '셔플하고 합치기',
      show: ({ spec }) => (two(spec) ? [...TOP, 'hdr1', 'hdr2', ...W, ...D, 'shuf', ...R, 'deep'] : [...TOP, 'hdr1', ...W, 'deep']),
      on: ({ spec }) => (two(spec) ? ['hdr2', ...D, 'shuf', ...R, 'deep', ...DS, ...SR, ...RD] : [...W, 'deep', ...WG]),
      focus: ({ spec }) => (two(spec) ? ['hdr1', 'hdr2', ...W, ...D, 'shuf', ...R, 'deep'] : ['files', 'sup', ...W, 'deep']),
      patch: ({ spec }) => ({
        ...Object.fromEntries(D.map((id) => [id, { lines: diskLines(spec) }])),
        sup: { lines: supLines(two(spec) ? 'merge' : 'done', spec === 'range' ? RANGE_LINE : undefined) },
      }),
      hold: 14,
      body: ({ spec }) =>
        two(spec)
          ? `<p>리듀스 워커(<code>partial_index_generic_merge</code>)는 같은 (타임 청크, ${spec === 'hashed' ? '해시 버킷' : '구간'}) 조각을 여러 MiddleManager 에서 끌어와(<b>셔플</b>) 합쳐 최종 세그먼트를 만들고 딥 스토리지에 올려요. 같은 키가 한 세그먼트에 모이니 롤업은 <b>완전(perfect)</b>해요(이 방식들은 <code>forceGuaranteedRollup</code> 과 함께 써요).</p>
            <p class="note">셔플할 조각은 워커의 로컬 디스크에 두었다 가져가요. 설정 <code>…intermediaryData.storage.type</code> 을 <code>deepstore</code> 로 두면 딥 스토리지를 거쳐요.${spec === 'range' ? ' 세그먼트마다 값의 구간이 정해지니 Broker 가 필터로 세그먼트를 건너뛸(프루닝) 수 있어요.' : ''}</p>${MODE_NOTE}`
          : `<p><code>dynamic</code> 에는 이 단계가 없어요. 워커마다 제가 읽은 행으로 세그먼트를 만드니 같은 키의 행이 여러 세그먼트에 흩어지고, 롤업은 <b>best-effort</b> 예요. 쿼리할 때 마저 합쳐요.</p>
            <p>대신 셔플이 없어 가장 빠르고, 세그먼트를 더하는 작업(<code>appendToExisting</code>)에는 이 방식만 쓸 수 있어요.</p>${MODE_NOTE}`,
      play: async (s) => {
        const spec = s.params.spec;
        if (!two(spec)) {
          await s.sendAll(WG, { glyph: '[s]', dur: 1.4 });
          s.patch('deep', { lines: deepLines(spec) });
          s.pulse('deep');
          await s.wait(2.6);
          s.reset();
          return;
        }
        for (const b of K) {
          s.sendAll(DS, { glyph: LABEL[spec][b], tone: BT[b], dur: 0.9 }).catch(() => {});
          await s.wait(0.25);
        }
        await s.wait(0.8);
        s.pulse('shuf');
        await s.wait(0.3);
        await Promise.all(K.map((b) => s.send(`sr${b}`, { glyph: `${LABEL[spec][b]}×3`, tone: BT[b], dur: 1 })));
        R.forEach((id) => s.pulse(id));
        await s.wait(0.5);
        await Promise.all(K.map((b) => s.send(`rd${b}`, { glyph: '[s]', tone: BT[b], dur: 1.2 })));
        s.patch('deep', { lines: deepLines(spec) });
        s.pulse('deep');
        await s.wait(2.4);
        s.reset();
      },
      gap: 0.6,
    },
    {
      title: '끝에서 한꺼번에 게시',
      show: ({ spec }) => [...TOP, ...W, ...(two(spec) ? R : []), 'deep', 'opts'],
      on: ['sup', 'meta', 'sMeta', 'opts', 'deep'],
      focus: ['files', 'sup', 'meta', 'deep', 'opts'],
      patch: ({ spec }) => ({ deep: { lines: deepLines(spec) }, sup: { lines: supLines('publish') } }),
      hold: 14,
      body: `<p>워커는 만든 세그먼트 목록을 슈퍼바이저에 <b>보고만</b> 하고, 모두 성공하면 슈퍼바이저가 <b>한꺼번에 게시</b>해요. 실패하면 기존 세그먼트는 그대로예요. 새 세그먼트는 더 큰 버전이라 같은 청크의 옛 세그먼트를 가려요.</p>
      <ul><li><b>기본</b>: 새 데이터가 들어간 청크만 바꿔요.</li>
      <li><code>appendToExisting</code>: 바꾸지 않고 최신 버전 옆에 더해요(<code>dynamic</code> 만).</li>
      <li><code>dropExisting</code>: 구간 안에서 새 데이터가 없는 청크는 <b>툼스톤</b>으로 비워요.</li></ul>`,
      play: async (s) => {
        const workers = two(s.params.spec) ? R : W;
        for (let k = 0; k < 3; k++) {
          s.pulse(workers[k]);
          s.patch('sup', { lines: supLines('publish', ['reports: ', c('b', `${k + 1}/3`)]) });
          await s.wait(0.5);
        }
        await s.send('sMeta', { glyph: '✎✎✎', dur: 1.5 });
        s.patch('meta', { lines: ['druid_segments', ['published: ', c('g', '6 (v2)')]] });
        s.pulse('meta');
        for (const hi of [2, 3, 4]) {
          s.patch('opts', { lines: OPTS(hi) });
          await s.wait(1.6);
        }
        await s.wait(0.6);
        s.reset();
      },
      gap: 0.6,
    },
    {
      title: 'SQL 배치: INSERT 와 REPLACE',
      show: ['files', 'sup', 'ovl', 'meta', ...W, 'deep', 'sql', 'locks'],
      on: ['sql', 'locks', 'sup', ...W, 'deep', 'sOv', ...F, ...WG],
      patch: {
        sup: { title: 'query_controller', caption: '컨트롤러 태스크', lines: ['plans the query', c('d', 'launches workers'), ['REPLACE ', c('b', '09-23..09-24')], c('d', ' ')] },
        ...Object.fromEntries(K.map((k) => [`w${k}`, { title: 'query_worker', lines: [`worker ${k + 1}`, c('d', 'reads EXTERN')] }])),
        deep: { lines: [['09-23 ', c('g', 'p0 p1 p2')], ['09-24 ', c('g', 'p0 p1 p2')]] },
      },
      hold: 14,
      body: `<p><code>INSERT</code> 는 더하면서 <b>공유 락</b>을 잡아요. 태스크 자리만 있으면 여러 INSERT 가 함께 돌아요. <code>REPLACE … OVERWRITE ALL | WHERE</code> 는 그 시간 범위를 갈아 끼우며 <b>배타 락</b>을 잡아요. 그동안 그 범위에는 다른 수집이나 컴팩션이 들어오지 못하고, 다른 범위는 괜찮아요.</p>
      <p><code>PARTITIONED BY</code> 는 꼭 적고, <code>CLUSTERED BY</code> 로 청크 안을 범위로 나눠요(세그먼트당 기본 <code>rowsPerSegment</code> 3,000,000 행). <code>query_controller</code> 가 <code>query_worker</code> 태스크를 띄우고, 워커들이 새 세그먼트를 만들어 끝에서 게시해요(멀티 스테이지 엔진 장).</p>`,
      play: async (s) => {
        s.pulse('sql');
        await s.wait(0.6);
        s.pulse('sup');
        await s.send('sOv', { glyph: '▸▸', dur: 0.9 });
        await s.sendAll(F, { glyph: '•', dur: 1 });
        await s.sendAll(WG, { glyph: '[s]', dur: 1.3 });
        s.pulse('deep');
        await s.wait(0.6);
        s.pulse('locks');
        await s.wait(2);
      },
    },
    {
      title: '두 방법 견주기',
      show: ['cmp'],
      on: ['cmp'],
      focus: ['cmp'],
      hold: 12,
      body: `<p>네이티브 배치는 실패한 워커를 다시 띄우고, 파티셔닝을 셋 중에서 고를 수 있어요. SQL 은 익숙한 문법으로 외부 파일(<code>EXTERN</code>)이나 다른 데이터소스(<code>FROM</code>)를 읽고, 롤업이 늘 완전해요. 다만 태스크 하나가 실패하면 작업 전체가 실패해요(MSQ 의 <code>faultTolerance</code> 를 켜면 워커는 다시 띄워요).</p>
      <p class="note">Hadoop 기반 배치 수집(<code>index_hadoop</code>)은 Druid 37 에서 제거됐어요. 배치 수집은 이 두 방법이에요.</p>`,
    },
  ],
};
