/*
 * 18 최근 버전의 변화 (31 → 37)
 *
 * 맨 위는 판 일곱 개의 시간 줄(17열 간격)과 판마다의 상자. 아래 칸(y 13~)은
 * 단계마다 바뀐다: 프로젝션, 쿼리 엔진(MSQ, Dart), 저장(가상 스토리지, v10),
 * 37 에서 정식이 된 운영 기능, 빠진 것들.
 * 상자 속 '*' 는 문서가 실험적이라고 한 기능이다.
 */
import { c, table } from '../ascii.js';

const GAP = 17;
const RELEASES = [
  ['31.0.0', '2024-10-22', ['projections *', 'Dart *', 'append+replace', '  locks GA', 'ZK loading off']],
  ['32.0.0', '2025-02-13', ['SQL nulls only', 'Java 8 removed', 'Hadoop deprec.']],
  ['33.0.0', '2025-04-29', ['Overlord cache', 'compaction as', '  supervisor', 'turbo loading']],
  ['34.0.0', '2025-08-11', ['Dart->/v2/sql', 'SET statements', 'clone Hist. *', 'Hadoop opt-in']],
  ['35.0.0', '2025-11-18', ['MSQ in core', 'virt.storage *', 'Java 17 / 21', 'Jetty 12']],
  ['36.0.0', '2026-02-09', ['segment v10', '  (opt-in)', 'cost autosc. *', 'Dart reports']],
  ['37.0.0', '2026-05-08', ['Hadoop removed', 'K8s tasks GA', 'compaction GA', '  (supervisors)', 'multi-supv. GA']],
];
const RIDS = RELEASES.map(([v]) => `r${v.slice(0, 2)}`);

// 시간 줄: 판 이름, 날짜, 눈금
function timeline(hot = []) {
  const names = [];
  const dates = [];
  const ticks = [];
  RELEASES.forEach(([v, d], i) => {
    const on = hot.includes(RIDS[i]);
    names.push(c(on ? 'b' : 'n', v.padEnd(GAP)));
    dates.push(c('d', d.padEnd(GAP)));
    ticks.push(c(on ? 'q' : 'n', '●'));
    if (i < RELEASES.length - 1) ticks.push(c('d', '─'.repeat(GAP - 1)));
  });
  ticks.push(c('d', '──▶'));
  return [names, dates, ticks];
}

const base = [
  ['09:01', '#ko', 'user-007', '12'],
  ['09:14', '#ko', 'user-031', '9'],
  ['09:40', '#ko', 'user-044', '37'],
  ['09:52', '#en', 'user-013', '23'],
];

function nodes() {
  return [
    { id: 'tl', type: 'text', x: 0, y: 0, lines: timeline() },
    ...RELEASES.map(([v, , lines], i) => ({ id: RIDS[i], x: i * GAP, y: 4, title: v, lines, w: 14, tone: 'n' })),

    // 2. 프로젝션
    { id: 'frSeg', type: 'frame', x: 0, y: 13, cols: 104, rows: 12, title: 'one segment of wikipedia', tag: 'projections *', tone: 'i' },
    {
      id: 'base',
      x: 2,
      y: 15,
      title: 'base rows',
      lines: table(['__time', 'channel', 'user', 'added'], base, { align: ['left', 'left', 'left', 'right'] }),
      tone: 'i',
      caption: '원래 행은 그대로',
    },
    {
      id: 'proj',
      x: 58,
      y: 15,
      title: 'projection',
      tag: 'channel_hourly',
      lines: table(['hour', 'channel', 'SUM(added)'], [['09:00', '#ko', '58'], ['09:00', '#en', '23']], { align: ['left', 'left', 'right'] }),
      tone: 'y',
      caption: '미리 묶어 집계한 행',
    },
    {
      id: 'q',
      type: 'text',
      x: 44,
      y: 27,
      lines: [[c('b', 'SELECT'), ' channel, SUM(added) ', c('b', 'FROM'), ' wikipedia'], [c('b', 'GROUP BY'), ' channel, FLOOR(__time TO HOUR)']],
    },

    // 3. 쿼리 엔진
    {
      id: 'eNative',
      x: 0,
      y: 13,
      title: 'native engine',
      lines: ['Broker: scatter / gather', 'Historicals, realtime tasks', c('d', 'interactive queries')],
      tone: 'q',
      caption: '보통의 쿼리',
    },
    {
      id: 'eMsq',
      x: 34,
      y: 13,
      title: 'MSQ task engine',
      tag: 'core since 35',
      lines: ['controller + worker tasks', 'SQL ingestion: INSERT, REPLACE', 'query from deep storage'],
      tone: 'm',
      caption: '확장이 아니라 핵심 기능으로',
    },
    {
      id: 'eDart',
      x: 74,
      y: 13,
      title: 'Dart *',
      lines: ['Broker = controller', 'Historicals = workers', "engine: 'msq-dart'", c('d', '/druid/v2/sql since 34')],
      tone: 'q',
      caption: '실험적',
    },

    // 4. 저장
    { id: 'vHist', x: 0, y: 13, title: 'Historical', tag: 'virtualStorage *', lines: ['local disk: [s][s][s]', c('d', 'serves more than fits'), c('d', 'loads on demand')], tone: 'i' },
    { id: 'vDeep', x: 0, y: 22, title: 'deep storage', lines: [c('g', '[s][s][s][s][s][s][s][s][s]')], tone: 'g', frame: 'round' },
    {
      id: 'v10',
      x: 48,
      y: 13,
      title: 'segment format v10',
      tag: 'opt-in, 36',
      lines: ['druid.indexer.task.buildV10=true', c('d', 'improves on format v9'), c('x', 'older Druid cannot read v10')],
      tone: 'g',
      caption: '되돌리려면 다시 색인',
    },

    // 5. 37 에서 정식
    { id: 'ga1', x: 0, y: 13, title: 'K8s task management', tag: 'GA', lines: ['no MiddleManagers', 'a Kubernetes Job per task'], tone: 'm' },
    { id: 'ga2', x: 34, y: 13, title: 'compaction supervisors', tag: 'GA', lines: ['auto-compaction on Overlord', 'the recommended way', "states in 'indexingStates'"], tone: 'm' },
    { id: 'ga3', x: 72, y: 13, title: 'multi-supervisor', tag: 'GA', lines: ['many stream supervisors', '-> one datasource'], tone: 'm' },
    { id: 'gone', x: 0, y: 21, title: 'removed in 37', lines: ['Hadoop-based ingestion', ['parser, ParseSpec', c('d', '  -> inputSource + inputFormat')]], tone: 'x', frame: 'dashed' },

    // 6. 빠진 것들
    {
      id: 'rm',
      x: 0,
      y: 13,
      title: 'removed',
      lines: [
        [c('b', '28   '), 'groupBy v1 engine, cachingCost balancer'],
        [c('b', '30/31'), ' ZooKeeper-based segment loading'],
        [c('b', '32   '), 'legacy null handling, Java 8'],
        [c('b', '35   '), 'Java 11 (use 17 or 21)'],
        [c('b', '37   '), 'Hadoop-based ingestion, parser, ParseSpec'],
      ],
      tone: 'x',
      caption: '올릴 때 부딪히는 것',
    },
  ];
}

const edges = [
  { id: 'bp', from: 'base', to: 'proj', via: 'r-l', tone: 'y', label: 'pre-aggregate' },
  { id: 'qp', from: 'q', to: 'proj', via: 'tr-br', tone: 'q', label: 'shape fits' },
  { id: 'dv', from: 'vDeep', to: 'vHist', via: 't-b', tone: 'g', label: 'on query' },
];

const TOP = ['tl', ...RIDS];

export default {
  title: '최근 버전의 변화',
  docs: [
    ['Release notes (37)', 'https://druid.apache.org/docs/latest/release-info/release-notes'],
    ['Upgrade notes', 'https://druid.apache.org/docs/latest/release-info/upgrade-notes'],
    ['Projections', 'https://druid.apache.org/docs/latest/querying/projections'],
  ],
  legend: [
    ['판', 'n'],
    ['쿼리 엔진', 'q'],
    ['운영', 'm'],
    ['저장', 'g'],
    ['빠진 것', 'x'],
  ],
  nodes,
  edges,
  steps: [
    {
      title: '31 에서 37 까지, 1년 반',
      show: TOP,
      patch: { tl: { lines: timeline(RIDS) } },
      body: `<p>Druid 는 서너 달마다 큰 판을 내요. 31.0.0(2024-10-22)부터 37.0.0(2026-05-08)까지 일곱 판을 한 줄로 늘어놓았어요. 이 앱의 설명은 모두 37.0.0 문서를 따라요.</p>
      <p>상자 속 <code>*</code> 는 문서가 <b>실험적</b>이라고 한 기능이에요. 운영에 쓰기 전에 문서의 주의 사항을 꼭 확인하세요. 다음 단계부터 주제별로 하나씩 살펴볼게요.</p>`,
      play: async (s) => {
        for (const id of RIDS) {
          s.pulse(id);
          await s.wait(0.45);
        }
        await s.wait(2);
      },
    },
    {
      title: '프로젝션: 미리 집계해 둔 행 (실험적)',
      show: [...TOP, 'frSeg', 'base', 'proj', 'q'],
      on: ['tl', 'r31', 'r35', 'frSeg', 'base', 'proj', 'q', 'bp', 'qp'],
      patch: { tl: { lines: timeline(['r31', 'r35']) } },
      focus: ['r31', 'r35', 'frSeg', 'q'],
      hold: 10,
      body: `<p><b>프로젝션</b>은 세그먼트 안에 함께 저장하는, 미리 묶어 집계해 둔 행이에요. 31 에서 실험적으로 나왔고 35 에서 정적 필터 따위가 더해졌어요. 롤업과 달리 원래 행은 그대로 남아요.</p>
      <p>쿼리의 모양이 프로젝션과 맞으면 Druid 가 알아서 프로젝션을 읽어 처리할 행 수를 줄여요. 세그먼트는 조금 커지지만 값 사전 같은 것은 원래 컬럼과 나눠 써요. 공식 문서는 아직 운영에 쓰기를 권하지 않아요.</p>`,
      play: async (s) => {
        await s.send('bp', { dur: 1.1, glyph: 'Σ' });
        s.pulse('proj');
        await s.wait(0.8);
        await s.send('qp', { dur: 1, glyph: '?' });
        s.pulse('proj');
        await s.wait(2.2);
      },
    },
    {
      title: '쿼리 엔진: MSQ 는 핵심으로, Dart 는 실험 중',
      show: [...TOP, 'eNative', 'eMsq', 'eDart'],
      on: ['tl', 'r31', 'r34', 'r35', 'eNative', 'eMsq', 'eDart'],
      patch: { tl: { lines: timeline(['r31', 'r34', 'r35']) } },
      focus: ['r31', 'r35', 'eNative', 'eMsq', 'eDart'],
      body: `<p><b>MSQ 태스크 엔진</b>은 35 부터 확장이 아니라 Druid 의 핵심 기능이 되었어요(로드 목록에서 <code>druid-multi-stage-query</code> 를 빼야 해요). SQL 기반 수집과 딥 스토리지 쿼리가 이 엔진으로 돌아요.</p>
      <p><b>Dart</b> 는 31 에서 실험적으로 나왔어요. MSQ 를 Broker(컨트롤러)와 Historical(워커)에서 돌려 큰 조인과 고유 값이 많은 GROUP BY 를 병렬로 처리해요. 34 부터는 전용 엔드포인트 대신 <code>/druid/v2/sql</code> 에 <code>engine: 'msq-dart'</code> 를 붙여 써요.</p>`,
      play: async (s) => {
        s.pulse('eNative');
        await s.wait(0.9);
        s.pulse('eMsq');
        await s.wait(0.9);
        s.pulse('eDart');
        await s.wait(2.2);
      },
    },
    {
      title: '저장: 가상 스토리지와 세그먼트 형식 v10',
      show: [...TOP, 'vHist', 'vDeep', 'v10'],
      on: ['tl', 'r35', 'r36', 'vHist', 'vDeep', 'v10', 'dv'],
      patch: { tl: { lines: timeline(['r35', 'r36']) } },
      focus: ['r33', 'r37', 'vHist', 'vDeep', 'v10'],
      body: `<p><b>가상 스토리지</b>(35, 실험적): <code>druid.segmentCache.virtualStorage=true</code> 면 Historical 이 디스크에 다 담지 못할 만큼의 세그먼트를 맡아요. 게시될 때 미리 싣지 않고, 쿼리에 필요할 때 내려받고, 필요 없어지면 디스크에서 치워요.</p>
      <p><b>세그먼트 형식 v10</b>(36): v9 를 개선한 새 형식이에요. 기본은 꺼져 있고 <code>druid.indexer.task.buildV10=true</code> 로 켜요. 그 전 판의 Druid 는 v10 을 읽지 못해서, 되돌리려면 지원하는 형식으로 다시 색인해야 해요.</p>`,
      play: async (s) => {
        await s.send('dv', { dur: 1.2, glyph: '[s]' });
        s.pulse('vHist');
        await s.wait(0.8);
        s.pulse('v10');
        await s.wait(2.2);
      },
    },
    {
      title: '37: 정식이 된 운영 기능들',
      show: [...TOP, 'ga1', 'ga2', 'ga3', 'gone'],
      on: ['tl', 'r37', 'ga1', 'ga2', 'ga3'],
      warn: ['gone'],
      patch: { tl: { lines: timeline(['r37']) } },
      focus: ['r33', 'r37', 'ga1', 'ga2', 'ga3', 'gone'],
      body: `<ul>
        <li><b>MiddleManager 없는 Kubernetes 태스크 관리</b>가 정식(GA)이 되었어요. 태스크마다 Kubernetes Job 을 띄워요.</li>
        <li><b>컴팩션 수퍼바이저</b>로 하는 자동 컴팩션이 정식이 되고 권장 방식이 되었어요. 컴팩션 상태는 새 <code>indexingStates</code> 표에 모아 둬요.</li>
        <li><b>여러 스트림 수퍼바이저</b>가 한 데이터소스로 함께 수집할 수 있게 되었어요.</li>
      </ul>
      <p class="note"><b>Hadoop 기반 수집</b>은 37 에서 빠졌어요(32 에서 폐기 예고, 34 부터 켜야만 쓸 수 있었어요). SQL 기반 수집이나 Kubernetes 기반 수집으로 옮기라고 안내해요.</p>`,
      play: async (s) => {
        for (const id of ['ga1', 'ga2', 'ga3']) {
          s.pulse(id);
          await s.wait(0.7);
        }
        await s.wait(2);
      },
    },
    {
      title: '빠진 것들',
      show: [...TOP, 'rm'],
      on: ['tl', 'rm', 'r31', 'r32', 'r35', 'r37'],
      patch: { tl: { lines: timeline(['r31', 'r32', 'r35', 'r37']) } },
      focus: ['r31', 'r37', 'rm'],
      body: `<p>판을 올릴 때 부딪히는 것은 대개 빠진 기능이에요.</p>
      <ul>
        <li>28: groupBy v1 엔진, <code>cachingCost</code> 밸런서</li>
        <li>30, 31: ZooKeeper 로 세그먼트를 싣던 방식(30 에서 걷어 내고 31 에서 완전히 꺼졌어요). 이제는 HTTP 로 실어요.</li>
        <li>32: 옛 null 처리 설정(SQL 표준 방식만 남았어요), Java 8</li>
        <li>35: Java 11 (17 이나 21 이 필요해요)</li>
        <li>37: Hadoop 기반 수집, <code>parser</code> 와 <code>ParseSpec</code></li>
      </ul>`,
      play: async (s) => {
        s.pulse('rm');
        await s.wait(3);
      },
    },
  ],
};
