/*
 * 17 멀티 스테이지 엔진(MSQ)
 *
 * 위 줄: 클라이언트, Broker, Overlord. 그 아래 query_controller(쿼리 하나에 하나).
 * 가운데: 스테이지 셋(열)과 워커(행). 스테이지 사이는 셔플 — 모든 워커가 모든
 * 워커에게 파티션을 보낸다. 왼쪽에 입력 파일. 아래 줄: 내구 저장소, 딥 스토리지,
 * 메타데이터.
 *
 * maxNumTasks 막대(컨트롤러 포함 태스크 수)로 워커 수를 바꾼다. Dart 단계에서는
 * Broker 가 컨트롤러, Historical 이 워커가 된다.
 */
import { c } from '../ascii.js';

const STAGE_X = [21, 50, 79];
const STAGE_W = 26;
const STAGE_TITLE = ['stage 0: read', 'stage 1: sort', 'stage 2: segments'];
const KEYS = [
  ['#de .. #fr'],
  ['#de .. #it', '#ja .. #zh'],
  ['#de .. #fr', '#it .. #pl', '#ru .. #zh'],
];

const workersOf = (p) => Math.max(1, Math.min(3, (p.maxNumTasks ?? 3) - 1));
const frameRows = (n) => 3 + n * 4;
const bottomY = (n) => 17 + frameRows(n) + 2;

function workerLines(stage, k, n) {
  if (stage === 0) return [`read part-000${k + 1}`];
  if (stage === 1) return [`${KEYS[n - 1][k]}`];
  return [`segment p${k}`];
}

function nodes(p) {
  const n = workersOf(p);
  const by = bottomY(n);
  const out = [
    { id: 'client', x: 0, y: 1, title: 'client', lines: ['INSERT, REPLACE', 'or SELECT'], tone: 'n', caption: '클라이언트' },
    { id: 'broker', x: 26, y: 1, title: 'Broker', lines: ['plans the SQL,', 'wraps it as a', 'query_controller'], tone: 'q', caption: 'SQL 계획' },
    { id: 'overlord', x: 50, y: 1, title: 'Overlord', lines: ['task queue', 'slots on', 'MiddleManagers'], tone: 'm' },
    { id: 'ctrl', x: 52, y: 9, title: 'query_controller', lines: ['one per query', 'stage 0 -> 1 -> 2', [c('d', 'workers: '), c('b', String(n))]], tone: 'm', w: 18 },
    { id: 'input', x: 0, y: 19, title: 'input', lines: ['s3://bucket/', 'part-*.json.gz', c('d', 'EXTERN(...)')], tone: 'n', frame: 'round', caption: '입력 파일' },
    { id: 'durable', x: 50, y: by, title: 'durable storage', lines: ['S3, GCS, Azure', c('d', 'shuffle, results')], tone: 'y', frame: 'round', caption: '내구 저장소' },
    { id: 'deep', x: 79, y: by, title: 'deep storage', lines: ['new segments', c('d', '3,000,000 rows each')], tone: 'g', frame: 'round', caption: '딥 스토리지' },
    { id: 'meta', x: 106, y: by, title: 'metadata', lines: ['publish', c('d', 'segments')], tone: 'p', frame: 'round', caption: '메타데이터 저장소' },
    { id: 'pad', type: 'text', x: 0, y: by + 7, lines: [' '] },
  ];
  STAGE_X.forEach((x, s) => {
    out.push({ id: `st${s}`, type: 'frame', x, y: 17, cols: STAGE_W, rows: frameRows(n), title: STAGE_TITLE[s], tone: 'i' });
    for (let k = 0; k < n; k++) {
      out.push({ id: `w${s}${k}`, x: x + 2, y: 19 + k * 4, title: `worker ${k + 1}`, lines: workerLines(s, k, n), tone: 'i', w: 20 });
    }
  });
  return out;
}

function edges(p) {
  const n = workersOf(p);
  const out = [
    { id: 'cb', from: 'client', to: 'broker', via: 'r-l', tone: 'q', label: 'sql/task' },
    { id: 'bo', from: 'broker', to: 'overlord', via: 'r-l', tone: 'm', label: 'task' },
    { id: 'oc', from: 'overlord', to: 'ctrl', via: 'br-tl', tone: 'm', label: 'runs' },
    { id: 'c0', from: 'ctrl', to: 'st0', via: 'b-t', cy: 15, tone: 'm' },
    { id: 'c1', from: 'ctrl', to: 'st1', via: 'b-t', cy: 15, tone: 'm', label: 'launch workers' },
    { id: 'c2', from: 'ctrl', to: 'st2', via: 'b-t', cy: 15, tone: 'm' },
    { id: 'd0', from: 'broker', to: 'st0', via: 'bl-t', cy: 15.8, tone: 'q' },
    { id: 'd1', from: 'broker', to: 'st1', via: 'bl-t', cy: 15.8, tone: 'q', label: 'Dart workers' },
    { id: 'd2', from: 'broker', to: 'st2', via: 'bl-t', cy: 15.8, tone: 'q' },
    { id: 'push', from: 'st2', to: 'deep', via: 'b-t', tone: 'g', label: 'push' },
    { id: 'pub', from: 'st2', to: 'meta', via: 'br-t', tone: 'p', label: 'publish' },
    { id: 'spill', from: 'st0', to: 'durable', via: 'b-l', tone: 'y', label: 'shuffle' },
    { id: 'reread', from: 'durable', to: 'st1', via: 't-b', tone: 'y' },
    { id: 'res', from: 'st2', to: 'durable', via: 'bl-r', tone: 'y', label: 'results' },
  ];
  for (let k = 0; k < n; k++) out.push({ id: `in${k}`, from: 'input', to: `w0${k}`, via: 'r-l', cx: 19.6, tone: 'n' });
  for (let s = 0; s < 2; s++) {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        out.push({ id: `sh${s}${a}${b}`, from: `w${s}${a}`, to: `w${s + 1}${b}`, via: 'r-l', cx: STAGE_X[s + 1] - 1.6, tone: 'i', arrow: b === a || n === 1 });
      }
    }
  }
  return out;
}

const WORKERS = (p) => {
  const n = workersOf(p);
  const ids = [];
  for (let s = 0; s < 3; s++) for (let k = 0; k < n; k++) ids.push(`w${s}${k}`);
  return ids;
};
const SHUFFLE = (p, s) => {
  const n = workersOf(p);
  const ids = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) ids.push(`sh${s}${a}${b}`);
  return ids;
};
const INPUTS = (p) => Array.from({ length: workersOf(p) }, (_, k) => `in${k}`);
const BASE = (p) => ['client', 'broker', 'overlord', 'ctrl', 'input', 'st0', 'st1', 'st2', 'deep', 'meta', 'durable', 'pad', ...WORKERS(p)];
// 아래 줄(내구 저장소, 딥 스토리지, 메타데이터)은 쓰일 때만 보인다
const TOP = (p) => BASE(p).filter((id) => !['durable', 'deep', 'meta', 'pad'].includes(id));

export default {
  title: '멀티 스테이지 엔진',
  docs: [
    ['SQL-based ingestion concepts', 'https://druid.apache.org/docs/latest/multi-stage-query/concepts'],
    ['Query from deep storage', 'https://druid.apache.org/docs/latest/querying/query-deep-storage'],
    ['Dart', 'https://druid.apache.org/docs/latest/querying/dart'],
  ],
  legend: [
    ['쿼리', 'q'],
    ['제어', 'm'],
    ['데이터(셔플)', 'i'],
    ['내구 저장소', 'y'],
    ['세그먼트 저장', 'g'],
    ['메타데이터', 'p'],
  ],
  controls: [{ id: 'maxNumTasks', label: 'maxNumTasks', type: 'range', min: 2, max: 4, step: 1, value: 3, format: (v) => `${v} (workers ${v - 1})` }],
  nodes,
  edges,
  steps: [
    {
      title: 'SQL 이 태스크가 돼요',
      show: TOP,
      on: ['client', 'broker', 'overlord', 'ctrl', 'cb', 'bo', 'oc'],
      focus: ['client', 'broker', 'overlord', 'ctrl', 'st0', 'st2'],
      body: `<p>SQL 의 <code>INSERT</code> 와 <code>REPLACE</code>(그리고 실험적인 <code>SELECT</code>)를 <code>/druid/v2/sql/task</code> 로 보내면, <b class="q">Broker</b> 가 평소처럼 SQL 을 네이티브 쿼리로 계획한 뒤 그것을 <b class="m">query_controller</b> 태스크로 싸서 인덱싱 서비스에 넘겨요.</p>
      <p>Broker 는 <b>태스크 id 만 돌려주고</b> 물러나요. 쿼리는 태스크로 돌아가고, 클라이언트는 그 id 로 상태와 결과를 물어봐요.</p>
      <p class="note">MSQ 는 35 부터 Druid 코어에 들어 있어요(확장을 따로 올리지 않아요).</p>`,
      play: async (s) => {
        await s.send('cb', { dur: 1, glyph: '§' });
        s.pulse('broker');
        await s.wait(0.4);
        await s.send('bo', { dur: 1, glyph: '▸' });
        s.pulse('overlord');
        s.send('cb', { dur: 0.9, glyph: 'id', reverse: true }).catch(() => {});
        await s.send('oc', { dur: 0.9, glyph: '▸' });
        s.pulse('ctrl');
        await s.wait(2);
      },
    },
    {
      title: '컨트롤러 하나와 워커 여럿',
      show: TOP,
      on: (p) => ['ctrl', 'input', 'st0', 'st1', 'st2', 'c0', 'c1', 'c2', ...WORKERS(p), ...INPUTS(p)],
      focus: (p) => ['ctrl', 'input', 'st0', 'st1', 'st2'],
      body: `<p><b class="m">query_controller</b> 는 쿼리 하나에 하나예요. 컨트롤러가 <b>query_worker</b> 태스크들을 띄우는데, 그 수는 <code>maxNumTasks</code>(컨트롤러를 포함한 최대 태스크 수, 기본 <b>2</b>, 곧 워커 하나)와 <code>taskAssignment</code>(<code>max</code> 는 되는 대로 많이, <code>auto</code> 는 태스크 하나에 512 MiB 나 파일 10,000개를 넘지 않을 만큼만)로 정해요.</p>
      <p>워커는 <code>EXTERN</code> 으로 입력 파일을 나눠 읽어요. 파일 여러 개는 여러 워커가 함께 읽지만, <b>파일 하나를 쪼개 읽지는 않아요</b>. 오른쪽 막대로 워커 수를 바꿔 보세요.</p>`,
      play: async (s) => {
        await s.sendAll(['c0', 'c1', 'c2'], { dur: 1, glyph: '▸' });
        await s.sendAll(INPUTS(s.params), { dur: 1.1, glyph: '≡' });
        WORKERS(s.params)
          .filter((id) => id.startsWith('w0'))
          .forEach((id) => s.pulse(id));
        await s.wait(2.2);
      },
    },
    {
      title: '스테이지와 셔플',
      show: TOP,
      on: (p) => ['st0', 'st1', 'st2', ...WORKERS(p), ...SHUFFLE(p, 0), ...SHUFFLE(p, 1)],
      focus: (p) => ['st0', 'st1', 'st2', 'input'],
      hold: 10,
      body: `<p>쿼리는 <b>스테이지</b>로 나뉘고, 스테이지 하나는 여러 워커에 나눠 돌아가요. 스테이지 사이에서는 워커끼리 <b>파티션 단위로 데이터를 주고받아요(셔플)</b>. 셔플하는 동안 파티션마다 <b>클러스터링 키로 정렬</b>돼요. 여기선 <code>CLUSTERED BY channel</code> 이라 채널 범위별로 모여요.</p>
      <p>스테이지 사이의 데이터는 1 MB 짜리 프레임으로 오가고, 아래쪽 스테이지는 위쪽 워커 하나마다 1 MB 의 버퍼를 잡아요.</p>`,
      play: async (s) => {
        const n = workersOf(s.params);
        for (let st = 0; st < 2; st++) {
          const sends = [];
          for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) sends.push(s.send(`sh${st}${a}${b}`, { dur: 1.3, glyph: '▪' }));
          await Promise.all(sends);
          for (let b = 0; b < n; b++) s.pulse(`w${st + 1}${b}`);
          await s.wait(0.6);
        }
        await s.wait(1.4);
      },
    },
    {
      title: '마지막 스테이지의 파티션이 세그먼트가 돼요',
      show: BASE,
      on: (p) => ['st2', 'deep', 'meta', 'push', 'pub', ...WORKERS(p).filter((id) => id.startsWith('w2'))],
      focus: ['st1', 'st2', 'deep', 'meta', 'pad'],
      body: `<p><code>INSERT</code> 나 <code>REPLACE</code> 라면 <b>마지막 스테이지의 파티션 하나하나가 Druid 세그먼트</b>가 돼요. 세그먼트 하나에는 기본 <code>rowsPerSegment</code> = 3,000,000 행이 들어가요. 워커가 세그먼트를 만들어 딥 스토리지에 올리고 게시해요.</p>
      <p><code>INSERT</code> 는 공유 락으로 덧붙이고, <code>REPLACE</code> 는 그 시간 범위에 배타 락을 잡고 덮어써요. <code>SELECT</code> 라면 워커가 결과를 컨트롤러에 보내고, 컨트롤러가 태스크 보고서에 적어요.</p>`,
      play: async (s) => {
        WORKERS(s.params)
          .filter((id) => id.startsWith('w2'))
          .forEach((id) => s.pulse(id));
        await s.wait(0.5);
        await s.send('push', { dur: 1.3, glyph: '[s]' });
        s.pulse('deep');
        await s.send('pub', { dur: 1.1, glyph: '✎' });
        s.pulse('meta');
        await s.wait(2.2);
      },
    },
    {
      title: '내구 저장소와 장애 허용',
      show: BASE,
      on: (p) => ['durable', 'st0', 'st1', 'spill', 'reread', ...WORKERS(p).filter((id) => !id.startsWith('w2'))],
      focus: ['st0', 'st1', 'durable', 'input', 'pad'],
      hold: 12,
      body: `<p><b>내구 저장소</b>(durable storage)는 S3, GCS, Azure 만 돼요. 켜 두면 셔플 데이터를 워커 디스크 대신 그곳에 둘 수 있고(<code>durableShuffleStorage</code>), 큰 <code>SELECT</code> 결과도 그곳에 써요.</p>
      <p><code>faultTolerance</code>(기본 <code>false</code>)를 켜면 실패한 <b>워커</b>를 다시 띄워, 앞 스테이지의 결과를 내구 저장소에서 다시 읽어 이어 가요. <b>컨트롤러</b>가 실패하면 되살리지 않아요.</p>`,
      play: async (s) => {
        s.reset();
        await s.send('spill', { dur: 1.3, glyph: '▪' });
        s.pulse('durable');
        await s.wait(0.6);
        s.state('w10', 'warn');
        s.patch('w10', { title: 'worker 1', lines: [c('x', 'x failed')] });
        await s.wait(1.2);
        s.patch('w10', { title: 'worker 1 (retry)', lines: [c('g', 'relaunched')] });
        s.state('w10', 'on');
        await s.send('reread', { dur: 1.3, glyph: '▪' });
        s.pulse('w10');
        await s.wait(2.4);
      },
      gap: 0.3,
    },
    {
      title: '딥 스토리지에서 곧바로 쿼리',
      show: (p) => BASE(p).filter((id) => id !== 'deep' && id !== 'meta'),
      on: (p) => ['client', 'input', 'st0', 'st1', 'st2', 'durable', 'res', ...INPUTS(p), ...WORKERS(p)],
      focus: ['client', 'input', 'st0', 'st1', 'st2', 'durable', 'pad'],
      patch: (p) => {
        const out = {
          client: { lines: ['sql/statements', 'executionMode:', c('q', 'ASYNC')] },
          cb: { label: 'sql/statements' },
          input: { title: 'deep storage', lines: ['used segs', 'replication 0', c('d', 'not loaded')], tone: 'g', caption: '딥 스토리지(원본)' },
        };
        for (let k = 0; k < workersOf(p); k++) out[`w2${k}`] = { lines: [`results p${k}`] };
        out.st2 = { title: 'stage 2: results' };
        return out;
      },
      hold: 11,
      body: `<p>Historical 에 싣지 않은 세그먼트(<code>replication_factor</code> 0)도 쿼리할 수 있어요. <code>POST /druid/v2/sql/statements</code> 에 <code>executionMode: ASYNC</code> 를 주면 MSQ 태스크가 <b>딥 스토리지에서 바로</b> 읽어요. 느린 대신 Historical 을 늘리지 않고도 오래된 데이터를 쿼리할 수 있어요.</p>
      <p>결과가 3000행을 넘으면 <code>selectDestination: durableStorage</code> 로 내구 저장소에 쓰는 편이 좋아요. 이런 세그먼트를 만드는 보존 규칙은 <b>보존 규칙과 삭제</b> 장에 있어요.</p>`,
      play: async (s) => {
        await s.sendAll(INPUTS(s.params), { dur: 1.2, glyph: '[s]' });
        await s.wait(0.5);
        const n = workersOf(s.params);
        const sends = [];
        for (let a = 0; a < n; a++) sends.push(s.send(`sh0${a}${a}`, { dur: 1, glyph: '▪' }).catch(() => {}));
        await s.wait(1.1);
        await s.send('res', { dur: 1.2, glyph: '◆' });
        s.pulse('durable');
        await s.wait(2);
      },
    },
    {
      title: 'Dart: Broker 가 컨트롤러, Historical 이 워커 (실험적)',
      show: (p) => ['client', 'broker', 'st0', 'st1', 'st2', 'pad', ...WORKERS(p)],
      on: (p) => ['client', 'broker', 'd0', 'd1', 'd2', 'cb', ...WORKERS(p), ...SHUFFLE(p, 0), ...SHUFFLE(p, 1)],
      focus: ['client', 'broker', 'st0', 'st1', 'st2'],
      patch: (p) => {
        const n = workersOf(p);
        const out = {
          client: { lines: ['/druid/v2/sql', 'engine:', c('q', 'msq-dart')] },
          cb: { label: 'sql' },
          broker: { lines: ['Dart controller', 'plans + drives', 'the stages'], tag: 'controller' },
          input: { title: 'segments', lines: ['published +', 'realtime', c('d', '(default)')], caption: '읽을 세그먼트' },
          st2: { title: 'stage 2: results' },
        };
        for (let s = 0; s < 3; s++) {
          for (let k = 0; k < n; k++) {
            out[`w${s}${k}`] = { title: `Historical h${k + 1}`, ...(s === 0 ? { lines: ['scan segments'] } : s === 2 ? { lines: [`results p${k}`] } : {}) };
          }
        }
        return out;
      },
      hold: 11,
      body: `<p><b>Dart</b>(실험적)는 MSQ 의 한 모양이에요. 태스크를 띄우는 대신 <b class="q">Broker</b> 가 컨트롤러가 되고 <b class="i">Historical</b> 이 워커가 되어 <code>SELECT</code> 를 돌려요. <code>druid.msq.dart.enabled=true</code> 로 켜고, <code>/druid/v2/sql</code> 에 <code>engine: msq-dart</code> 를 주면 돼요.</p>
      <p>병렬 sort-merge 로 도는 <b>큰 조인</b>, 카디널리티가 높은 <b>정확한 groupBy 와 count distinct</b> 에 강해요. 쿼리 캐시와 레이닝(우선순위)은 쓰지 않아요.</p>`,
      play: async (s) => {
        await s.send('cb', { dur: 0.9, glyph: '§' });
        s.pulse('broker');
        await s.sendAll(['d0', 'd1', 'd2'], { dur: 1.1, glyph: '▸' });
        const n = workersOf(s.params);
        for (let st = 0; st < 2; st++) {
          const sends = [];
          for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) sends.push(s.send(`sh${st}${a}${b}`, { dur: 1.1, glyph: '▪' }));
          await Promise.all(sends);
        }
        await s.send('cb', { dur: 0.9, glyph: '◆', reverse: true });
        s.pulse('client');
        await s.wait(1.6);
      },
    },
  ],
};
