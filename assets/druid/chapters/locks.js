/*
 * 09 태스크, 락, 원자적 교체
 *
 * 위: 왼쪽의 태스크 API 에서 들어온 태스크가 Overlord 의 세 칸(WAITING → PENDING →
 * RUNNING)을 지나 오른쪽 MiddleManager 의 자리(slot)에서 돈다.
 * 아래: wikipedia 의 타임 청크 넷(09-22 ~ 09-25). 칸마다 누가 락을 쥐었는지와 버전.
 *
 * 단계마다 한 장면을 되풀이한다: 큐를 지나는 태스크(1), 타임 청크 락(2), 우선순위와
 * 선점(3), APPEND 와 REPLACE 가 함께 쓰는 청크(4), 새 버전으로의 원자적 교체(5).
 *
 *   열:  API 0, Overlord 30 (칸 33 / 57 / 81), MiddleManager 110, 청크 30 / 51 / 72 / 93
 *   줄:  Overlord 0 ~ 11, 청크 틀 14 ~ 22, 아래 표와 Broker 25
 */
import { c, table } from '../ascii.js';

// 태스크 한 줄(칸 안쪽 20 글자): 't2 index_parallel 50'
const T = (id, type, prio, tone = 'm') => [`${id} `, c(tone, type), ' '.repeat(Math.max(1, 15 - type.length)), c('d', String(prio))];
const NOTE = (text, tone = 'd') => c(tone, text);
const BLANK = c('d', ' ');
const lane = (...rows) => [...rows, ...Array(Math.max(0, 5 - rows.length)).fill(BLANK)].slice(0, 5);

const t1 = T('t1', 'index_kafka', 75, 'i');
const t2 = T('t2', 'index_parallel', 50);
const t3 = T('t3', 'compact', 25, 'y');
const t4 = T('t4', 'index_parallel', 50);
const t5 = T('t5', 'index_kafka', 75, 'i');
const t6 = T('t6', 'kill', 0, 'n');

const slot = (id, tone = 'm') => (id ? c(tone, `[${id}]`) : c('d', '[  ]'));
const mm = (a, b, ta = 'm', tb = 'm') => ['capacity: 2', ['slots ', slot(a, ta), slot(b, tb)]];

// 청크 칸: 첫 줄은 락, 둘째 줄은 버전
const lockL = (text, tone = 'q') => ['lock ', c(tone, text)];
const NOLOCK = ['lock ', c('d', '-')];
const verL = (v, segs = '[s][s]', tone = 'g') => [`${v} `, c(tone, segs)];
const chunk = (lock = NOLOCK, ver = verL('v1')) => [lock, ver];

const PRIO = table(
  ['task type', 'priority'],
  [
    [c('i', 'realtime index (Kafka, Kinesis)'), c('b', '75')],
    ['batch (native, SQL)', c('b', '50')],
    [c('y', 'merge, append, compaction'), c('b', '25')],
    [c('d', 'other (kill ...)'), c('b', '0')],
  ],
  { align: ['left', 'right'] },
);

const DAYS = ['09-22', '09-23', '09-24', '09-25'];
const CX = [30, 51, 72, 93];

const nodes = [
  { id: 'api', x: 0, y: 3, title: 'task API', lines: [c('d', 'POST'), '/druid/indexer/v1/task'], tone: 'n', frame: 'round', caption: '태스크 제출' },
  { id: 'ovl', type: 'frame', x: 30, y: 0, cols: 76, rows: 12, title: 'Overlord', tone: 'm', caption: '태스크 큐' },
  { id: 'hW', type: 'text', x: 33, y: 2, lines: [[c('d', 'waits for '), c('b', 'locks')]] },
  { id: 'hP', type: 'text', x: 57, y: 2, lines: [[c('d', 'waits for a '), c('b', 'slot')]] },
  { id: 'hR', type: 'text', x: 81, y: 2, lines: [[c('d', 'runs on a '), c('b', 'worker')]] },
  { id: 'wait', x: 33, y: 3, title: 'WAITING', lines: lane(t4), w: 20, tone: 'm' },
  { id: 'pend', x: 57, y: 3, title: 'PENDING', lines: lane(t2), w: 20, tone: 'm' },
  { id: 'run', x: 81, y: 3, title: 'RUNNING', lines: lane(t1, t3), w: 20, tone: 'm' },
  { id: 'mm1', x: 110, y: 1, title: 'MiddleManager 1', lines: mm('t1', 't3', 'i', 'y'), w: 20, tone: 'i' },
  { id: 'mm2', x: 110, y: 7, title: 'MiddleManager 2', lines: mm('t5', null, 'i'), w: 20, tone: 'i' },

  { id: 'ds', type: 'frame', x: 27, y: 14, cols: 89, rows: 9, title: 'datasource: wikipedia', tag: 'time chunk locks', tone: 'q', caption: '타임 청크' },
  ...DAYS.map((d, k) => ({ id: `c${k}`, x: CX[k], y: 16, title: d, lines: chunk(), w: 18, tone: 'q' })),

  { id: 'prio', type: 'text', x: 30, y: 25, lines: PRIO },
  { id: 'broker', x: 60, y: 25, title: 'Broker', lines: ['queries 09-23', c('d', 'one version per chunk')], tone: 'q', caption: '쿼리' },
];

const edges = [
  { id: 'submit', from: 'api', to: 'wait', via: 'r-l', tone: 'n' },
  { id: 'wp', from: 'wait', to: 'pend', via: 'r-l', tone: 'm' },
  { id: 'pr', from: 'pend', to: 'run', via: 'r-l', tone: 'm' },
  { id: 'rm1', from: 'run', to: 'mm1', via: 'rt-l', cx: 106.6, tone: 'i' },
  { id: 'rm2', from: 'run', to: 'mm2', via: 'rb-l', cx: 107.4, tone: 'i' },
  ...[0, 1, 2].map((k) => ({ id: `wl${k}`, from: 'wait', to: `c${k}`, via: 'b-t', cy: 12.6, tone: 'q', label: k === 1 ? 'lockAcquire' : undefined })),
  { id: 'rl1', from: 'run', to: 'c1', via: 'bl-tr', cy: 13.3, tone: 'y' },
  { id: 'q1', from: 'broker', to: 'c1', via: 'tl-b', tone: 'q', label: 'query' },
];

const QUEUE = ['api', 'ovl', 'hW', 'hP', 'hR', 'wait', 'pend', 'run', 'mm1', 'mm2'];
const LANES = ['ovl', 'hW', 'hP', 'hR', 'wait', 'pend', 'run'];
const CHUNKS = ['ds', 'c0', 'c1', 'c2', 'c3'];

export default {
  title: '태스크, 락, 원자적 교체',
  docs: [
    ['Task lock system', 'https://druid.apache.org/docs/latest/ingestion/tasks#task-lock-system'],
    ['Concurrent append and replace', 'https://druid.apache.org/docs/latest/ingestion/concurrent-append-replace'],
    ['Data updates', 'https://druid.apache.org/docs/latest/data-management/update'],
  ],
  legend: [
    ['태스크, 제어', 'm'],
    ['실시간 수집', 'i'],
    ['컴팩션', 'y'],
    ['락, 쿼리', 'q'],
    ['세그먼트', 'g'],
  ],
  nodes,
  edges,
  steps: [
    {
      title: 'Overlord 의 태스크 큐',
      show: [...QUEUE, ...CHUNKS],
      on: [...QUEUE, 'submit', 'wp', 'pr', 'rm1', 'rm2'],
      focus: QUEUE,
      hold: 12,
      body: `<p>태스크는 Overlord 의 태스크 API 로 들어와요. 먼저 필요한 락을 기다리는 <b>WAITING</b>, 락을 얻으면 워커 자리를 기다리는 <b>PENDING</b>, 자리가 나면 MiddleManager 에서 도는 <b>RUNNING</b> 으로 넘어가요.</p>
      <p>MiddleManager 한 대가 함께 돌리는 태스크 수는 <code>druid.worker.capacity</code>(기본 CPU 수 − 1)예요. 어느 워커에 맡길지는 <code>selectStrategy</code> 가 정하고, 기본값 <code>equalDistribution</code> 은 워커들에 고르게 나눠요.</p>`,
      play: async (s) => {
        s.reset();
        await s.wait(0.6);
        await s.send('submit', { glyph: 't6', dur: 1 });
        s.patch('wait', { lines: lane(t4, t6) });
        s.pulse('wait');
        await s.wait(0.8);
        await s.send('wp', { glyph: 't4', dur: 0.9 });
        s.patch('wait', { lines: lane(t6) });
        s.patch('pend', { lines: lane(t2, t4) });
        s.pulse('pend');
        await s.wait(0.8);
        await s.send('pr', { glyph: 't2', dur: 0.9 });
        s.patch('pend', { lines: lane(t4) });
        s.patch('run', { lines: lane(t1, t3, t2) });
        await s.send('rm2', { glyph: 't2', dur: 0.8 });
        s.patch('mm2', { lines: mm('t5', 't2', 'i') });
        s.pulse('mm2');
        await s.wait(2.4);
      },
      gap: 0.4,
    },
    {
      title: '타임 청크 락',
      show: [...LANES, ...CHUNKS],
      on: ['wait', 'pend', ...CHUNKS, 'wl1', 'wl2', 'wp'],
      patch: { wait: { lines: lane(t4, T('t7', 'index_parallel', 50)) }, pend: { lines: lane(t2) } },
      focus: [...LANES, ...CHUNKS],
      hold: 13,
      body: `<p>세그먼트를 만들기 전에 태스크는 쓸 <b>타임 청크 전체</b>에 락을 잡아요(타임 청크 락, 기본값). 락을 쥔 동안 다른 태스크는 그 청크에 세그먼트를 만들 수 없고, 락을 잡고 만든 세그먼트는 <b>더 높은 버전</b>을 받아요.</p>
      <p>그림에서 <code>t4</code> 는 09-23, 09-24 를 덮어쓰려고 두 청크를 잠가요. 09-24 가 필요한 <code>t7</code> 은 락이 풀릴 때까지 WAITING 에 남아요.</p>
      <p class="note">락은 태스크 액션(<code>lockAcquire</code>)으로 Overlord 에 청하고, <code>taskLockTimeout</code>(기본 5분)까지 기다려요. 세그먼트 하나하나를 잠그는 세그먼트 락은 폐기 예정이에요.</p>`,
      play: async (s) => {
        s.reset();
        await s.wait(0.6);
        s.pulse('wait');
        await s.sendAll(['wl1', 'wl2'], { glyph: 't4', dur: 1.1 });
        s.patch('c1', { lines: chunk(lockL('X t4')) });
        s.patch('c2', { lines: chunk(lockL('X t4')) });
        s.pulse('c1');
        s.pulse('c2');
        await s.wait(0.6);
        await s.send('wp', { glyph: 't4', dur: 0.9 });
        s.patch('wait', { lines: lane(T('t7', 'index_parallel', 50), ['   ', NOTE('wants 09-24: wait', 'x')]) });
        s.patch('pend', { lines: lane(t2, t4) });
        await s.wait(0.8);
        await s.send('wl2', { glyph: 't7', dur: 1.1, tone: 'x' });
        s.pulse('c2');
        await s.wait(1.6);
        // t4 가 끝나 게시하면 두 청크가 v2 가 되고 락이 풀린다
        s.patch('c1', { lines: chunk(NOLOCK, verL('v2', '[s][s][s]')) });
        s.patch('c2', { lines: chunk(NOLOCK, verL('v2', '[s][s][s]')) });
        s.pulse('c1');
        s.pulse('c2');
        s.patch('wait', { lines: lane(['t7 ', c('m', 'index_parallel'), ' ', c('g', 'go')]) });
        await s.wait(2.6);
      },
      gap: 0.4,
    },
    {
      title: '락이 부딪히면: 우선순위와 선점',
      show: ['api', ...LANES, ...CHUNKS, 'prio'],
      on: ['wait', 'run', 'c1', 'prio', 'submit', 'wl1', 'rl1'],
      patch: {
        wait: { lines: lane() },
        run: { lines: lane(t1, t3) },
        c1: { lines: chunk(lockL('X t3', 'y')) },
      },
      focus: ['api', ...LANES, ...CHUNKS, 'prio'],
      hold: 14,
      body: `<p>같은 청크를 두 태스크가 원하면 <b>우선순위</b>로 정해요. 기본값은 실시간 수집 75, 배치(네이티브, SQL) 50, 머지나 컴팩션 25, 그 밖 0 이에요.</p>
      <p>우선순위가 같으면 먼저 청한 쪽이 갖고 뒤에 온 쪽은 기다려요. 높은 태스크가 나중에 오면 낮은 태스크의 락을 <b>빼앗아요</b>(선점). 그림에서 09-23 을 쥐고 있던 컴팩션 <code>t3</code> 은 실시간 태스크 <code>t5</code> 에게 락을 빼앗기고 실패해요. 단, 세그먼트를 게시하는 임계 구역 안에서는 빼앗기지 않아요.</p>
      <p class="note">같은 groupId 의 태스크(예: 한 수퍼바이저의 Kafka 태스크들)는 락을 함께 써요.</p>`,
      play: async (s) => {
        s.reset();
        await s.wait(0.8);
        s.pulse('c1');
        await s.wait(0.6);
        await s.send('submit', { glyph: 't5', dur: 0.9, tone: 'i' });
        s.patch('wait', { lines: lane(T('t5', 'index_kafka', 75, 'i')) });
        s.pulse('wait');
        await s.wait(0.5);
        await s.send('wl1', { glyph: 't5 75', dur: 1.1, tone: 'i' });
        s.patch('c1', { lines: chunk(lockL('X t5', 'i')) });
        s.pulse('c1');
        s.state('run', 'warn');
        s.patch('run', { lines: lane(t1, [c('y', 't3 compact'), ' ', c('x', 'revoked')]) });
        await s.send('rl1', { glyph: '×', dur: 0.8, tone: 'x', reverse: true });
        await s.wait(1.2);
        s.state('run', null);
        s.patch('run', { lines: lane(t1, T('t5', 'index_kafka', 75, 'i')) });
        s.patch('wait', { lines: lane() });
        s.pulse('run');
        await s.wait(2.6);
      },
      gap: 0.4,
    },
    {
      title: '함께 쓰기: APPEND 락과 REPLACE 락',
      show: ['api', ...LANES, ...CHUNKS],
      on: ['run', 'c1', 'wait', 'submit', 'wl1', 'rl1'],
      patch: {
        wait: { lines: lane() },
        run: { lines: lane(T('t5', 'index_kafka', 75, 'i'), T('t3', 'compact', 25, 'y')) },
        c1: { lines: [['lock ', c('i', 'A t5'), ' ', c('y', 'R t3')], verL('v1', '[s][s]')] },
      },
      focus: ['api', ...LANES, ...CHUNKS],
      hold: 14,
      body: `<p>컨텍스트 <code>useConcurrentLocks</code> 를 켜면 Druid 가 락 종류를 알아서 골라요. 더하는 태스크는 <b>APPEND</b>, 갈아 끼우는 태스크는 <b>REPLACE</b> 락을 잡아요. APPEND 락은 여러 개가 함께 있을 수 있고, REPLACE 락은 한 구간에 하나뿐이에요.</p>
      <p>그래서 컴팩션(<code>t3</code>)이 09-23 을 다시 쓰는 동안에도 스트리밍(<code>t5</code>, 늘 APPEND)은 그 청크에 계속 데이터를 더해요. 그동안 들어온 데이터는 dynamic 으로 나뉘고, 다음 컴팩션이 정리해요.</p>
      <p class="note">APPEND 태스크의 세그먼트 단위는 REPLACE 태스크와 같거나 더 잘아야 해요. 31 부터 정식 기능이에요.</p>`,
      play: async (s) => {
        s.reset();
        await s.wait(0.6);
        for (let k = 0; k < 3; k++) {
          s.send('rl1', { glyph: '+s', dur: 1, tone: 'i' }).catch(() => {});
          await s.wait(0.5);
          s.patch('c1', { lines: [['lock ', c('i', 'A t5'), ' ', c('y', 'R t3')], ['v1 ', c('g', '[s][s]'), c('i', '[+]'.repeat(k + 1))]] });
          await s.wait(0.6);
        }
        await s.send('submit', { glyph: 't8', dur: 0.8, tone: 'y' });
        s.patch('wait', { lines: lane(T('t8', 'compact', 25, 'y'), ['   ', NOTE('2nd REPLACE: wait', 'x')]) });
        s.pulse('wait');
        await s.send('wl1', { glyph: 'R?', dur: 1, tone: 'x' });
        s.pulse('c1');
        await s.wait(2.4);
      },
      gap: 0.4,
    },
    {
      title: '게시: 새 버전으로 원자적 교체',
      show: [...LANES, ...CHUNKS, 'broker'],
      on: ['c1', 'broker', 'q1', 'wait', 'wl1'],
      patch: {
        wait: { lines: lane(['t9 ', c('i', 'index_kafka'), ' ', c('d', 'queue')]) },
        run: { lines: lane(T('t2', 'index_parallel', 50)) },
        c1: { lines: [lockL('X t2'), ['v1 ', c('g', '[s][s]'), ' ', c('d', 'v2 0/3')]] },
      },
      focus: [...LANES, ...CHUNKS, 'broker'],
      hold: 14,
      body: `<p>덮어쓰기(SQL <code>REPLACE</code>, <code>appendToExisting</code> 없는 배치, 컴팩션)는 새 버전의 세그먼트 한 벌(<b>core set</b>)을 만들어요. 한 벌이 <b>모두 실려야</b> Broker 가 새 버전으로 넘어가고, 청크 하나에는 한 번에 한 버전만 써요. 그래서 쿼리는 옛 데이터에서 새 데이터로 한순간에 넘어가요.</p>
      <p>덮어쓰는 동안 그 구간의 다른 수집은 줄을 서고, 쿼리는 옛 버전으로 계속 답해요.</p>
      <p class="note">교체는 청크마다 따로 일어나요. 여러 청크를 덮어쓰면 청크별로 차례로 넘어가요. 가려진 옛 버전은 쓰지 않음(<code>used = false</code>)으로 표시돼 내려가요.</p>`,
      play: async (s) => {
        s.reset();
        for (let k = 1; k <= 3; k++) {
          s.send('q1', { glyph: '?', dur: 0.9 }).catch(() => {});
          await s.wait(0.5);
          s.patch('c1', { lines: [lockL('X t2'), ['v1 ', c('g', '[s][s]'), ' ', c('d', `v2 ${k}/3`)]] });
          await s.wait(0.6);
        }
        s.patch('c1', { lines: [NOLOCK, ['v2 ', c('g', '[s][s][s]'), c('d', ' (v1)')]] });
        s.patch('run', { lines: lane() });
        s.patch('wait', { lines: lane(['t9 ', c('i', 'index_kafka'), ' ', c('g', 'go')]) });
        s.pulse('c1');
        await s.wait(0.4);
        for (let k = 0; k < 2; k++) {
          await s.send('q1', { glyph: '?', dur: 0.9 });
          s.pulse('c1');
        }
        await s.wait(1.8);
      },
      gap: 0.4,
    },
  ],
};
