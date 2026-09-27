/*
 * 16 컴팩션과 재색인
 *
 * 가운데: wikipedia 의 타임 청크 일곱(09-20 ~ 09-26). 옛 청크는 이미 알맞은 세그먼트
 * 몇 개, 최근 청크는 스트리밍이 남긴 작은 세그먼트가 잔뜩. 맨 오른쪽 09-26 에는
 * 아직 이벤트가 들어온다(Kafka).
 * 위: 왼쪽 Overlord(컴팩션 수퍼바이저), 가운데 compact 태스크, 오른쪽 Coordinator(듀티).
 * 아래: 단계마다 스펙 비교 표, 건너뛰는 구간 표시, SQL 따위.
 *
 *   열:  청크 2 + 16k (k = 0..6), Kafka 118
 *   줄:  위 0 ~ 3, 선 골목 5 ~ 7, 청크 틀 8 ~ 16, 아래 17 ~
 */
import { c, table } from '../ascii.js';

const DAYS = ['09-20', '09-21', '09-22', '09-23', '09-24', '09-25', '09-26'];
const X = (k) => 2 + 16 * k;
const K = [0, 1, 2, 3, 4, 5, 6];

// 청크 칸의 세 줄(안쪽 12 글자)
const COMPACTED = (n = 2, tag = 'compacted') => [c('g', '[S]'.repeat(n)), `${n} segment${n > 1 ? 's' : ''}`, c('g', tag)];
const FRAG = (n) => [c('i', '[s][s][s][s]'), `${n} segments`, c('d', 'v1')];
const LIVE = (n) => [c('i', '[s][s][s]'), `${n} segments`, c('q', 'receiving')];
const START = [COMPACTED(), COMPACTED(), COMPACTED(), FRAG(18), FRAG(24), FRAG(21), LIVE(9)];

// 건너뛰는 구간과 찾는 차례(청크 틀 아래 두 줄)
function markers(active = -1) {
  const w = X(7) + 2;
  const a = Array(w).fill(' ');
  const b = Array(w).fill(' ');
  const put = (arr, at, s) => [...s].forEach((ch, i) => (arr[at + i] = ch));
  put(a, X(6), '├─ P1D skip ─┤');
  put(b, X(6) + 13, '▲ latest segment end');
  // 새것부터: 09-25 → 09-24 → 09-23
  const order = [5, 4, 3];
  order.forEach((k, i) => put(a, X(k) + 3, `${i + 1}${['st', 'nd', 'rd'][i]}`));
  put(b, X(3) + 1, '<──── newestSegmentFirst ────');
  const line = (arr, tone) => {
    const s = arr.join('');
    if (active < 0) return [c(tone, s)];
    const at = X(active) + 3;
    return [c(tone, s.slice(0, at)), c('b', s.slice(at, at + 3)), c(tone, s.slice(at + 3))];
  };
  return [line(a, 'd'), [c('d', b.join(''))]];
}

const SPEC = table(
  ['setting', 'before (streaming)', '', 'after (compaction)'],
  [
    [c('b', 'segmentGranularity'), 'HOUR', '->', c('g', 'DAY')],
    [c('b', 'queryGranularity'), 'NONE', '->', c('g', 'MINUTE')],
    [c('b', 'partitionsSpec'), 'dynamic', '->', c('g', 'range [channel, countryName]')],
    [c('b', 'dimensions'), '..., comment', '->', c('g', 'drop comment')],
    [c('b', 'rollup'), 'best-effort', '->', c('g', 'perfect')],
  ],
);

const SQL = [
  [c('q', 'REPLACE INTO'), ' wikipedia'],
  [c('q', 'OVERWRITE WHERE'), " __time >= TIMESTAMP '2026-09-23'"],
  ["            AND __time <  TIMESTAMP '2026-09-24'"],
  [c('q', 'SELECT'), ' * ', c('q', 'FROM'), ' wikipedia'],
  [c('q', 'WHERE'), " __time >= TIMESTAMP '2026-09-23'"],
  ["  AND __time < TIMESTAMP '2026-09-24'"],
  ['  AND ', c('x', "isRobot = 'false'"), c('d', '   -- keep only these rows')],
  [c('q', 'PARTITIONED BY'), ' DAY'],
];

const nodes = [
  { id: 'ovl', x: 0, y: 0, title: 'Overlord', lines: ['compaction supervisor', c('d', 'type: autocompact')], tone: 'm', caption: '컴팩션 수퍼바이저(권장)' },
  { id: 'task', x: 44, y: 0, title: 'compact', lines: ['priority 25', c('d', 'interval 09-24')], w: 16, tone: 'y' },
  { id: 'coord', x: 86, y: 0, title: 'Coordinator', lines: ['duty: compactSegments', c('d', 'every 30m (indexingPeriod)')], tone: 'm', caption: 'Coordinator 듀티' },
  { id: 'ds', type: 'frame', x: 0, y: 8, cols: X(7) + 2, rows: 9, title: 'datasource: wikipedia', tag: 'segmentGranularity: DAY', tone: 'i', caption: '타임 청크' },
  ...K.map((k) => ({ id: `c${k}`, x: X(k), y: 10, title: DAYS[k], lines: START[k], w: 12, tone: k < 3 ? 'g' : 'i' })),
  { id: 'kafka', x: X(7) + 6, y: 10, title: 'Kafka', lines: ['events', c('d', 'late ones too')], tone: 'n', frame: 'round', caption: '스트림' },
  { id: 'marks', type: 'text', x: 0, y: 17, lines: markers() },
  { id: 'spec', type: 'text', x: 8, y: 19, lines: SPEC },
  { id: 'sql', type: 'text', x: 8, y: 19, lines: SQL },
  { id: 'mode', type: 'text', x: 2, y: 5, lines: [c('d', ' ')] },
];

const edges = [
  { id: 'ot', from: 'ovl', to: 'task', via: 'r-l', tone: 'm', label: 'autocompact' },
  { id: 'ct', from: 'coord', to: 'task', via: 'l-r', tone: 'm', label: 'duty' },
  ...[3, 4, 5].map((k) => ({ id: `tc${k}`, from: 'task', to: `c${k}`, via: 'b-t', cy: 6.4, tone: 'y', label: k === 4 ? 'lock, read, rewrite' : undefined })),
  { id: 'k6', from: 'kafka', to: 'c6', via: 'l-r', tone: 'i' },
  { id: 'k4', from: 'kafka', to: 'c4', via: 'b-b', offset: 40, tone: 'i', label: 'late events for 09-24' },
];

const CH = K.map((k) => `c${k}`);
const TOP = ['ovl', 'task', 'coord'];

export default {
  title: '컴팩션과 재색인',
  docs: [
    ['Compaction', 'https://druid.apache.org/docs/latest/data-management/compaction'],
    ['Automatic compaction', 'https://druid.apache.org/docs/latest/data-management/automatic-compaction'],
    ['Data updates', 'https://druid.apache.org/docs/latest/data-management/update'],
  ],
  legend: [
    ['작은 세그먼트, 수집', 'i'],
    ['컴팩션된 세그먼트', 'g'],
    ['컴팩션 태스크', 'y'],
    ['제어', 'm'],
  ],
  nodes,
  edges,
  steps: [
    {
      title: '쌓이는 작은 세그먼트',
      show: ['ds', ...CH, 'kafka'],
      on: ['c3', 'c4', 'c5', 'c6', 'kafka', 'k6'],
      dim: false,
      hold: 10,
      body: `<p>스트리밍 수집은 태스크가 넘길 때마다, 또 늦게 온 데이터 때문에 <b>작은 세그먼트</b>를 많이 남겨요. <code>appendToExisting</code> 으로 더하거나 병렬 배치의 워커가 많을 때도 그래요. 쿼리는 세그먼트마다 스레드 하나로 처리하니, 작은 세그먼트가 많으면 세그먼트마다 드는 비용이 쌓여요.</p>
      <p><b>컴팩션</b>은 한 시간 구간의 세그먼트를 읽어, 알맞은 크기의 새 세그먼트 묶음으로 다시 써요. 보통은 더 적고 더 커져요.</p>`,
      play: async (s) => {
        for (let k = 0; k < 4; k++) {
          await s.send('k6', { glyph: '•', dur: 0.8 });
          s.patch('c6', { lines: LIVE(9 + k + 1) });
        }
        s.pulse('c6');
        await s.wait(2);
      },
    },
    {
      title: '컴팩션 태스크의 다시 쓰기',
      show: ['ds', ...CH, 'task', 'kafka'],
      on: ['task', 'c4', 'tc4'],
      focus: ['task', 'ds', ...CH],
      hold: 12,
      body: `<p>컴팩션은 같은 데이터소스를 읽어 같은 데이터소스에 다시 쓰는 특별한 수집 태스크(<code>compact</code>)예요. 그 구간을 잠그고(우선순위 25), 새 버전의 세그먼트를 게시해 옛 세그먼트를 가려요. 가려진 세그먼트는 쓰지 않음으로 표시돼 내려가요.</p>
      <p class="note">따로 바꾸지 않으면 데이터 자체는 그대로예요. 쿼리 결과가 바뀌는 건 스펙에서 일부러 바꾼 것뿐이에요.</p>`,
      play: async (s) => {
        s.reset();
        await s.wait(0.6);
        s.pulse('task');
        await s.send('tc4', { glyph: 'R', dur: 1 });
        s.patch('c4', { lines: [c('i', '[s][s][s][s]'), '24 segments', c('y', 'locked')] });
        s.pulse('c4');
        await s.wait(0.6);
        await s.send('tc4', { glyph: '[s]x24', dur: 1.1, reverse: true });
        s.patch('task', { lines: ['priority 25', c('b', 'rewriting ...')] });
        await s.wait(1);
        await s.send('tc4', { glyph: '[S][S]', dur: 1.1 });
        s.patch('c4', { lines: COMPACTED(2, 'v2') });
        s.patch('task', { lines: ['priority 25', c('g', 'published v2')] });
        s.pulse('c4');
        await s.wait(2.4);
      },
      gap: 0.4,
    },
    {
      title: '컴팩션으로 바꿀 수 있는 것',
      show: ['ds', ...CH, 'spec'],
      on: ['spec'],
      focus: ['ds', ...CH, 'spec'],
      patch: { c3: { lines: COMPACTED(2, 'v2') }, c4: { lines: COMPACTED(2, 'v2') }, c5: { lines: COMPACTED(1, 'v2') } },
      hold: 12,
      body: `<p>스펙으로 몇 가지를 바꾸며 다시 쓸 수 있어요.</p>
      <ul><li><b>segmentGranularity</b>: 드문드문한 HOUR 청크를 DAY 로 합쳐요.</li>
      <li><b>queryGranularity</b>: 오래된 데이터를 더 굵게(예: minute 에서 hour) 롤업해 공간을 줄여요.</li>
      <li><b>파티셔닝</b>: best-effort 인 dynamic 을 hashed 나 range 로 바꿔 완전한 롤업으로.</li>
      <li>차원 순서와 타입을 고치거나, 안 쓰는 컬럼을 빼고 지표를 더해요.</li></ul>
      <p class="note">queryGranularity 를 굵게 바꾼 뒤 옛 세그먼트를 kill 하면, 잘게 나뉘었던 데이터는 영영 사라져요.</p>`,
      play: async (s) => {
        for (const id of ['c3', 'c4', 'c5']) {
          s.pulse(id);
          await s.wait(0.5);
        }
        s.pulse('spec');
        await s.wait(3);
      },
    },
    {
      title: '자동 컴팩션: 두 가지 방법',
      show: ['ds', ...CH, ...TOP],
      on: ['ovl', 'coord', 'task', 'ot', 'ct', 'tc5'],
      focus: [...TOP, 'ds', ...CH],
      hold: 13,
      body: `<p>대부분은 자동 컴팩션으로 충분해요. 방법은 둘이에요.</p>
      <ul><li><b>컴팩션 수퍼바이저</b>(Overlord, <code>type: autocompact</code>): 권장 방법이에요. MSQ 엔진도 쓸 수 있고, 자리가 나는 대로 바로 태스크를 내요.</li>
      <li><b>Coordinator 듀티</b>(<code>compactSegments</code>): <code>indexingPeriod</code>(기본 30분)마다 살펴 태스크를 내요.</li></ul>
      <p>컴팩션이 쓰는 태스크 자리는 전체 자리의 <code>compactionTaskSlotRatio</code>(0.1)와 <code>maxCompactionTaskSlots</code> 중 작은 쪽이에요(최소 1).</p>
      <p class="note">클러스터 설정 <code>useSupervisors</code> 의 기본값이 false 라서, 수퍼바이저 방식은 켜야 써요. 37 에서 정식 기능이 됐어요.</p>`,
      play: async (s) => {
        s.reset();
        s.patch('task', { lines: ['priority 25', c('d', 'interval 09-25')] });
        s.pulse('ovl');
        await s.send('ot', { glyph: '▸', dur: 1 });
        s.pulse('task');
        await s.send('tc5', { glyph: 'R', dur: 1 });
        s.patch('c5', { lines: COMPACTED(2, 'v2') });
        s.pulse('c5');
        await s.wait(1.2);
        s.pulse('coord');
        await s.send('ct', { glyph: '▸', dur: 1 });
        s.pulse('task');
        await s.wait(2);
      },
      gap: 0.4,
    },
    {
      title: '최근 데이터 건너뛰기',
      show: ['ds', ...CH, 'marks', 'kafka'],
      on: ['c3', 'c4', 'c5', 'marks', 'k6'],
      dim: false,
      patch: { c6: { lines: [c('i', '[s][s][s]'), '9 segments', c('x', 'skipped')] } },
      focus: ['ds', ...CH, 'marks', 'kafka'],
      hold: 12,
      body: `<p>자동 컴팩션은 새 데이터부터 옛 데이터 쪽으로 훑어요(기본 정책 <code>newestSegmentFirst</code>). 아직 데이터가 들어오는 최근 구간은 건너뛰는데, 그 폭이 <code>skipOffsetFromLatest</code>(기본 <code>P1D</code>)예요.</p>
      <p>이 폭은 <b>지금 시각이 아니라 가장 최근 세그먼트의 끝</b>에서 재요. 늦게 오는 데이터가 잦으면 몇 시간에서 하루쯤으로 잡아요.</p>
      <p class="note">세그먼트가 많이 흩어진 구간부터 고르는 <code>mostFragmentedFirst</code> 정책은 실험적이에요.</p>`,
      play: async (s) => {
        s.send('k6', { glyph: '•', dur: 0.8 }).catch(() => {});
        for (const k of [5, 4, 3]) {
          s.patch('marks', { lines: markers(k) });
          s.pulse(`c${k}`);
          await s.wait(1);
        }
        await s.wait(1.6);
      },
      gap: 0.4,
    },
    {
      title: '수집과 부딪힐 때',
      show: ['ds', ...CH, 'task', 'kafka', 'mode'],
      on: ['task', 'c4', 'kafka', 'tc4', 'k4', 'mode'],
      focus: ['task', 'ds', ...CH, 'kafka', 'mode'],
      hold: 16,
      body: `<p>컴팩션이 잠근 구간에 수집 태스크가 써야 하면, 기본으로는 수집(실시간 75, 배치 50)이 이기고 컴팩션(25)은 끝내지 못한 채 실패해요. 피하는 방법은 셋이에요.</p>
      <ul><li>데이터소스와 수집 태스크에 <code>useConcurrentLocks</code> 를 켜서 함께 쓰기</li>
      <li><code>skipOffsetFromLatest</code> 를 늘려 늦은 데이터가 드는 구간을 건너뛰기</li>
      <li>컴팩션 우선순위(<code>taskPriority</code>) 올리기(고급, 수집이 밀릴 수 있어요)</li></ul>`,
      play: async (s) => {
        s.reset();
        s.patch('mode', { lines: [[c('b', 'default locks'), c('d', ': ingestion wins')]] });
        await s.send('tc4', { glyph: 'R', dur: 0.9 });
        s.patch('c4', { lines: [c('i', '[s][s][s][s]'), '24 segments', c('y', 'R compact')] });
        await s.wait(0.5);
        await s.send('k4', { glyph: '• 75', dur: 1.3 });
        s.state('task', 'warn');
        s.patch('task', { lines: ['priority 25', c('x', 'lock revoked')] });
        s.patch('c4', { lines: [c('i', '[s][s][s][s][s]'.slice(0, 12)), '25 segments', c('i', 'X realtime')] });
        s.pulse('c4');
        await s.wait(2.2);
        s.reset();
        s.patch('mode', { lines: [[c('b', 'useConcurrentLocks'), c('d', ': both proceed')]] });
        await s.send('tc4', { glyph: 'R', dur: 0.9 });
        s.patch('c4', { lines: [c('i', '[s][s][s][s]'), '24 segments', ['', c('i', 'A'), ' + ', c('y', 'R')]] });
        await s.send('k4', { glyph: '•', dur: 1.3 });
        s.pulse('c4');
        await s.send('tc4', { glyph: '[S][S]', dur: 1 });
        s.patch('c4', { lines: [[c('g', '[S][S]'), c('i', '[s]')], '3 segments', c('g', 'v2 + append')] });
        s.pulse('c4');
        await s.wait(2.4);
      },
      gap: 0.4,
    },
    {
      title: '재색인: 행 지우기와 나이별 규칙',
      show: ['ds', ...CH, 'sql'],
      on: ['sql', 'c3'],
      focus: ['ds', ...CH, 'sql'],
      patch: { c3: { lines: [c('i', '[s][s][s][s]'), '18 segments', c('d', 'v1')] } },
      hold: 12,
      body: `<p>Druid 에는 키로 행 하나를 고치는 UPDATE 가 없어요. 대신 구간을 통째로 다시 써요(<b>재색인</b>). 특정 행을 지우려면 그 구간을 <code>REPLACE … WHERE</code> 로 다시 쓰거나, 네이티브 배치에서 <code>druid</code> 입력 소스와 <code>transformSpec</code> 필터로 걸러 내요. 원자적 교체와 락은 다른 덮어쓰기와 똑같아요.</p>
      <p class="note">37 에 나온 <b>cascading reindexing</b>(실험적)은 데이터 나이에 따라 서로 다른 컴팩션 규칙(세그먼트 단위, 행 지우기 따위)을 차례로 적용해요. MSQ 엔진에서만 돼요.</p>`,
      play: async (s) => {
        s.reset();
        await s.wait(1.2);
        s.pulse('sql');
        await s.wait(1);
        s.patch('c3', { lines: [c('g', '[S][S]'), '2 segments', c('g', 'v2 no robots')] });
        s.pulse('c3');
        await s.wait(2.6);
      },
      gap: 0.4,
    },
  ],
};
