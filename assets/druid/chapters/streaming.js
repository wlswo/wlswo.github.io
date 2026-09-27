/*
 * 07 스트리밍 수집
 *
 * 위 가운데가 Kafka 토픽(파티션 p0~p3), 그 아래가 MiddleManager(워커)와 그 안의
 * 태스크들. 오른쪽 기둥은 Overlord(수퍼바이저) → 메타데이터 저장소 → Coordinator →
 * Historical, 왼쪽 기둥은 딥 스토리지와 Broker.
 *
 * 조작으로 taskCount(1, 2, 4)와 replicas(1, 2)를 바꾸면 태스크가 다시 선다. 복제본
 * 태스크는 두 번째 MiddleManager 에 선다(복제본은 늘 다른 워커에). 핸드오프 단계에서는
 * 게시 중인 옛 태스크가 한 줄 아래로 물러나고, 새 태스크가 그 자리에서 읽기 시작한다.
 */
import { c, bar, num } from '../ascii.js';

const PARTS = [0, 1, 2, 3];
const OFF0 = [1204, 1188, 1175, 1231]; // 지난번에 커밋된 오프셋
const OFF1 = [1520, 1497, 1488, 1532]; // 이번 게시와 함께 커밋되는 오프셋

const ASSIGN = (T) => (T === 1 ? [[0, 1, 2, 3]] : T === 2 ? [[0, 2], [1, 3]] : [[0], [1], [2], [3]]);
const taskOf = (T, p) => ASSIGN(T).findIndex((ps) => ps.includes(p));
const PX = (k) => 32 + k * 15; // 파티션 상자의 x
const taskX = (T, k) => (T === 4 ? PX(k) : T === 2 ? 36 + k * 30 : 51);
const taskW = (T) => (T === 4 ? 12 : T === 2 ? 14 : 19);
const ROW1 = 11; // MiddleManager 안의 첫 줄(읽는 태스크)
const ROW2 = 17; // 둘째 줄(게시 중인 옛 태스크)
const MM2 = 16; // 두 번째 MiddleManager 는 이만큼 아래

const taskId = (gen, r, k) => `${gen}${r}${k}`;
const reads = (T, k) => `reads ${ASSIGN(T)[k].map((p) => `p${p}`).join(' ')}`;

function taskLines(T, k, { rows = 0, state = 'READING', extra = null } = {}) {
  const tone = state === 'READING' ? 'i' : state === 'FAILED' ? 'x' : state.startsWith('PUBL') ? 'g' : 'd';
  return [reads(T, k), [c('d', 'rows '), num(rows)], extra ?? c(tone, state)];
}

const LOOP = ['partitions + offsets', 'adopt running tasks', 'ask task status', 'reading -> publishing', 'stop extra replicas', 'clean up failed tasks', 'create tasks'];
function overlordLines(active = -1) {
  return [
    c('d', 'kafka supervisor, period PT30S'),
    ...LOOP.map((t, k) => (k === active ? [c('q', `▸ [${k + 1}] `), c('b', t)] : [c('d', `  [${k + 1}] `), t])),
  ];
}

function metaLines(stage = 'idle') {
  const offs = stage === 'idle' ? OFF0 : OFF1;
  const txn = stage === 'txn';
  return [
    [c('b', 'druid_segments')],
    stage === 'idle' ? c('d', '  ..._08:00_v1   (older)') : [c('g', '+ ..._09:00_v1   (new)')],
    [c('b', 'druid_dataSource'), c('d', '  offsets')],
    [txn ? c('g', '+ ') : '  ', ...offs.map((o, p) => [`p${p}:`, txn ? c('g', String(o)) : String(o), ' ']).flat()],
    txn ? c('p', '  ^ one transaction ^') : ' ',
  ];
}

const partLines = (p, off) => [[c('d', 'offset '), String(off)]];

function nodes(pr) {
  const T = pr.T;
  const R = pr.R;
  const list = [
    { id: 'topic', type: 'frame', x: 30, y: 0, cols: 64, rows: 6, title: 'Kafka topic: wikipedia-edits', tone: 'n', caption: '스트림' },
    ...PARTS.map((p) => ({ id: `p${p}`, x: PX(p), y: 2, title: `p${p}`, lines: partLines(p, OFF0[p]), w: 12, tone: 'n' })),
    { id: 'mm1', type: 'frame', x: 30, y: 9, cols: 64, rows: 14, title: 'MiddleManager 1', tone: 'i', caption: '워커' },
    { id: 'mm2', type: 'frame', x: 30, y: 9 + MM2, cols: 64, rows: 14, title: 'MiddleManager 2', tone: 'i', caption: '복제본은 다른 워커에' },
    { id: 'ov', x: 100, y: 0, title: 'Overlord', tag: 'supervisor', lines: overlordLines(), tone: 'm', caption: '수퍼바이저가 여기서 돌아요' },
    { id: 'meta', x: 100, y: 13, title: 'metadata store', lines: metaLines(), tone: 'p', frame: 'round', w: 32 },
    { id: 'coord', x: 100, y: 22, title: 'Coordinator', lines: ['polls metadata, 1 min'], tone: 'm' },
    { id: 'hist', x: 100, y: 28, title: 'Historical', lines: ['segment cache', c('d', '[s][s][s]')], tone: 'i' },
    { id: 'broker', x: 0, y: 11, title: 'Broker', lines: ['realtime query'], tone: 'q' },
    { id: 'deep', x: 0, y: 18, title: 'deep storage', lines: ['segments/', c('d', '[s][s][s]')], tone: 'g', frame: 'round' },
    { id: 'small', type: 'text', x: 0, y: 26, lines: [c('d', 'many small segments'), c('g', '[s][s][s][s][s][s]'), c('d', '-> compaction later')], tone: 'n' },
    // 아래로 돌아가는 선(download, query)이 화면에 들어오도록 잡는 빈 자리
    { id: 'pad', type: 'text', x: 60, y: R === 2 ? 44 : 38, lines: [' '] },
  ];
  for (let r = 0; r < R; r++) {
    ASSIGN(T).forEach((ps, k) => {
      const w = taskW(T);
      list.push({ id: taskId('a', r, k), x: taskX(T, k), y: ROW1 + r * MM2, title: r ? `task${k} r${r}` : `task${k}`, lines: taskLines(T, k), w, tone: 'i', z: 2 });
      list.push({ id: taskId('b', r, k), x: taskX(T, k), y: ROW1 + r * MM2, title: r ? `task${k}' r${r}` : `task${k}'`, lines: taskLines(T, k), w, tone: 'i', z: 3 });
    });
  }
  return list;
}

function edges(pr) {
  const T = pr.T;
  const list = [
    { id: 'ov-mm1', from: 'ov', to: 'mm1', via: 'l-r', cx: 98.5, tone: 'm', label: 'create tasks' },
    { id: 'ov-mm2', from: 'ov', to: 'mm2', via: 'lt-r', cx: 99.3, tone: 'm' },
    { id: 'pub', from: 'mm1', to: 'ov', via: 'rt-lb', cx: 97, tone: 'p', label: 'publish', ly: 1.2 },
    { id: 'ov-meta', from: 'ov', to: 'meta', via: 'b-t', tone: 'p' },
    { id: 'poll', from: 'coord', to: 'meta', via: 't-b', tone: 'p', label: 'poll' },
    { id: 'load', from: 'coord', to: 'hist', via: 'b-t', tone: 'm', label: 'load' },
    { id: 'push', from: 'mm1', to: 'deep', via: 'lb-r', tone: 'g', label: 'push' },
    { id: 'dl', from: 'deep', to: 'hist', via: 'b-br', offset: pr.R === 2 ? 150 : 44, tone: 'g', label: 'download' },
    { id: 'rq', from: 'broker', to: 'mm1', via: 'r-lt', tone: 'q', label: 'query' },
  ];
  for (const p of PARTS) {
    const k = taskOf(T, p);
    list.push({ id: `pa${p}`, from: `p${p}`, to: taskId('a', 0, k), via: 'b-t', cy: 7.4, tone: 'i' });
    list.push({ id: `pb${p}`, from: `p${p}`, to: taskId('b', 0, k), via: 'b-t', cy: 7.4, tone: 'i' });
  }
  return list;
}

// 단계마다 보일 것
const tasks = (pr, gen) => Array.from({ length: pr.R }, (_, r) => ASSIGN(pr.T).map((_, k) => taskId(gen, r, k))).flat();
const frames = (pr) => (pr.R === 2 ? ['mm1', 'mm2'] : ['mm1']);
const BASE = ['topic', 'p0', 'p1', 'p2', 'p3', 'ov', 'meta', 'coord', 'hist', 'deep', 'broker'];

/** 파티션마다 빛 방울 하나씩(읽기). */
async function readOnce(s, gen, pr, glyph = '•') {
  await Promise.all(PARTS.map((p) => s.send(`${gen === 'a' ? 'pa' : 'pb'}${p}`, { dur: 0.9, glyph })));
  tasks(pr, gen).forEach((id) => s.pulse(id));
}

export default {
  title: '스트리밍 수집',
  docs: [
    ['Supervisor', 'https://druid.apache.org/docs/latest/ingestion/supervisor'],
    ['Kafka ingestion', 'https://druid.apache.org/docs/latest/ingestion/kafka-ingestion'],
    ['Indexing and handoff', 'https://druid.apache.org/docs/latest/design/storage#indexing-and-handoff'],
  ],
  legend: ['ingest', 'control', 'storage', 'meta', 'query'],
  controls: [
    { id: 'T', label: 'taskCount <code>기본 1</code>', type: 'seg', options: [[1, '1'], [2, '2'], [4, '4']], value: 2 },
    { id: 'R', label: 'replicas <code>기본 1</code>', type: 'seg', options: [[1, '1'], [2, '2']], value: 1 },
  ],
  nodes,
  edges,
  steps: [
    {
      title: '수퍼바이저와 실행 루프',
      show: (pr) => [...BASE, ...frames(pr), ...tasks(pr, 'a')],
      on: (pr) => ['ov', ...tasks(pr, 'a'), 'ov-mm1', 'ov-mm2'],
      edges: (pr) => (pr.R === 2 ? ['ov-mm1', 'ov-mm2'] : ['ov-mm1']),
      body: `<p>스트리밍 수집은 <b>수퍼바이저</b>가 맡아요. 수퍼바이저 스펙을 내면 <b class="m">Overlord</b> 안에서 수퍼바이저가 돌며, 기본 <code>period</code> <code>PT30S</code> 마다 실행 루프를 한 바퀴 돌아요.</p>
      <p>파티션과 시작 오프셋 확인, 돌고 있는 태스크 거두기, 상태 묻기, 읽기에서 게시로 넘기기, 남는 복제본 멈추기, 실패 정리, 그리고 모자란 만큼 <b>태스크 만들기</b>(<code>taskCount × replicas</code>)예요.</p>`,
      play: async (s) => {
        for (let k = 0; k < LOOP.length; k++) {
          s.patch('ov', { lines: overlordLines(k) });
          if (k === 6) tasks(s.params, 'a').forEach((id) => s.pulse(id));
          if (k === 6) await s.send('ov-mm1', { dur: 0.9, glyph: '▸' });
          await s.wait(0.75);
        }
        s.patch('ov', { lines: overlordLines() });
        await s.wait(1.2);
      },
      gap: 0.3,
    },
    {
      title: '파티션을 태스크에 나눠요',
      show: (pr) => [...BASE, ...frames(pr), ...tasks(pr, 'a')],
      on: (pr) => ['topic', 'p0', 'p1', 'p2', 'p3', ...tasks(pr, 'a'), ...PARTS.map((p) => `pa${p}`)],
      hold: 10,
      body: `<p>Kafka 파티션은 태스크에 나눠 맡겨요. <code>taskCount</code>(기본 1)는 한 복제 세트 안의 읽는 태스크 수의 최대이고, 파티션보다 크게 잡아도 태스크는 파티션 수만큼만 떠요. 위 조작으로 바꿔 보세요(그림은 2로 시작해요).</p>
      <p><code>replicas</code>(기본 1)를 2로 하면 같은 파티션을 읽는 <b>복제본 태스크</b>가 하나 더 떠요. 복제본은 늘 <b>다른 워커</b>에 놓여 한 대가 죽어도 버텨요.</p>
      <p class="note">파티션을 어느 태스크에 줄지 정하는 정확한 식은 문서에 없어요. 그림의 짝은 예시예요.</p>`,
      play: async (s) => {
        for (let k = 0; k < 3; k++) {
          await readOnce(s, 'a', s.params);
          await s.wait(0.3);
        }
        await s.wait(1);
      },
    },
    {
      title: '읽기: 메모리에 쌓고 바로 쿼리돼요',
      show: (pr) => [...BASE, ...frames(pr), ...tasks(pr, 'a')],
      on: (pr) => ['topic', 'p0', 'p1', 'p2', 'p3', 'broker', ...tasks(pr, 'a'), ...PARTS.map((p) => `pa${p}`), 'rq'],
      hold: 10,
      body: `<p>태스크는 파티션에서 읽은 행을 먼저 <b>메모리</b>에 쌓아요. 이때부터 그 행은 <b>쿼리할 수 있어요</b>(아직 게시 전이지만 보이는 상태). Broker 는 실시간 태스크도 살피다가(<code>watchRealtimeTasks</code>, 기본 <code>true</code>) 그 태스크에 하위 쿼리를 보내요.</p>
      <p>오프셋은 파티션마다 차례로 늘어나요. 태스크가 어디까지 읽었는지는 태스크가 들고 있고, 게시할 때 세그먼트와 함께 커밋돼요.</p>`,
      play: async (s) => {
        const pr = s.params;
        const offs = [...OFF0];
        const rows = ASSIGN(pr.T).map(() => 0);
        for (let round = 0; round < 4; round++) {
          await readOnce(s, 'a', pr);
          PARTS.forEach((p) => {
            offs[p] += 70 + p * 3;
            rows[taskOf(pr.T, p)] += 70 + p * 3;
            s.patch(`p${p}`, { lines: partLines(p, offs[p]) });
          });
          for (let r = 0; r < pr.R; r++) ASSIGN(pr.T).forEach((_, k) => s.patch(taskId('a', r, k), { lines: taskLines(pr.T, k, { rows: rows[k] }) }));
          if (round === 1) {
            await s.send('rq', { dur: 1, glyph: '?' });
            tasks(pr, 'a').forEach((id) => s.pulse(id));
            await s.send('rq', { dur: 0.9, glyph: '◆', reverse: true });
            s.pulse('broker');
          }
        }
        await s.wait(1.4);
      },
      gap: 0.4,
    },
    {
      title: '메모리가 차면 디스크로: persist',
      show: (pr) => [...BASE, ...frames(pr), ...tasks(pr, 'a')],
      on: (pr) => ['p0', 'p1', 'p2', 'p3', ...tasks(pr, 'a'), ...PARTS.map((p) => `pa${p}`)],
      hold: 11,
      body: `<p>메모리의 행은 때가 되면 디스크에 <b>중간 저장(persist)</b>해요. 셋 중 하나라도 닿으면 저장해요: <code>maxRowsInMemory</code>(스트리밍 기본 150,000행), <code>maxBytesInMemory</code>(기본 JVM 힙의 6분의 1), <code>intermediatePersistPeriod</code>(기본 <code>PT10M</code>).</p>
      <p>저장된 조각들도 계속 쿼리에 쓰이고, 게시할 때 하나의 세그먼트로 합쳐져요.</p>`,
      play: async (s) => {
        const pr = s.params;
        let disk = 0;
        for (let round = 0; round < 3; round++) {
          for (let m = 0; m <= 150; m += 30) {
            readOnce(s, 'a', pr).catch(() => {});
            for (let r = 0; r < pr.R; r++)
              ASSIGN(pr.T).forEach((_, k) =>
                s.patch(taskId('a', r, k), {
                  lines: [reads(pr.T, k), ['mem ', ...bar(m, 150, 6, { tone: 'i' }), c('d', ` ${m}k`)], [c('d', 'disk '), c('g', '[p]'.repeat(disk)) || '']],
                }),
              );
            await s.wait(0.35);
          }
          disk += 1;
          tasks(pr, 'a').forEach((id) => s.pulse(id));
          await s.wait(0.4);
        }
        await s.wait(1.4);
      },
      gap: 0.3,
    },
    {
      title: '게시: 세그먼트와 오프셋을 한 번에',
      show: (pr) => [...BASE, ...frames(pr), ...tasks(pr, 'a')],
      on: (pr) => ['ov', 'meta', 'deep', ...tasks(pr, 'a'), 'push', 'pub', 'ov-meta'],
      patch: (pr) => Object.fromEntries(tasks(pr, 'a').map((id) => [id, { lines: taskLines(pr.T, Number(id[2]), { rows: 316, state: 'PUBLISHING' }) }])),
      hold: 12,
      body: `<p><code>taskDuration</code>(기본 <code>PT1H</code>)이 지나면 태스크는 읽기를 멈추고 <b>게시</b>를 시작해요: 저장해 둔 조각을 세그먼트로 합쳐 <b class="g">딥 스토리지</b>에 올리고, Overlord 의 태스크 액션으로 <b class="p">메타데이터 저장소</b>에 기록해요.</p>
      <p>이때 <b>세그먼트 기록과 스트림 오프셋을 같은 트랜잭션</b>으로 커밋해요. 그래서 한 번만(exactly-once) 들어가요. 오프셋은 Kafka 의 컨슈머 그룹이 아니라 Druid 의 메타데이터 저장소에 남아요.</p>`,
      play: async (s) => {
        s.patch('meta', { lines: metaLines('idle') });
        await s.wait(0.6);
        await s.send('push', { dur: 1.2, glyph: '[s]' });
        s.pulse('deep');
        await s.send('pub', { dur: 1, glyph: '✎' });
        s.pulse('ov');
        await s.send('ov-meta', { dur: 0.8, glyph: '✎' });
        s.patch('meta', { lines: metaLines('txn') });
        s.pulse('meta');
        await s.wait(3);
      },
      gap: 0.4,
    },
    {
      title: '핸드오프, 그리고 다음 태스크',
      show: (pr) => [...BASE, ...frames(pr), ...tasks(pr, 'a'), ...tasks(pr, 'b'), 'pad'],
      on: (pr) => ['coord', 'hist', 'meta', 'deep', 'broker', ...tasks(pr, 'b'), 'poll', 'load', 'dl', ...PARTS.map((p) => `pb${p}`)],
      patch: (pr) => ({
        ...Object.fromEntries(
          tasks(pr, 'a').map((id) => [id, { y: ROW2 + Number(id[1]) * MM2, lines: taskLines(pr.T, Number(id[2]), { rows: 316, state: 'PUBLISHING' }) }]),
        ),
        ...Object.fromEntries(PARTS.map((p) => [`p${p}`, { lines: partLines(p, OFF1[p]) }])),
        meta: { lines: metaLines('done') },
        mm1: { tag: `capacity >= 2 x ${pr.R} x ${pr.T} = ${2 * pr.R * pr.T}` },
      }),
      focus: (pr) => [...BASE, ...frames(pr), 'pad'],
      hold: 14,
      body: `<p>게시된 세그먼트는 <b class="m">Coordinator</b> 가 메타데이터를 살피다가(기본 1분마다) Historical 에 싣게 해요. Historical 이 딥 스토리지에서 받아 서빙하기 시작하면 태스크는 그 세그먼트를 넘기고 끝나요(<b>핸드오프</b>, Kafka 는 기본 15분까지 기다려요).</p>
      <p>그동안 수퍼바이저는 <b>새 태스크</b>를 띄워 방금 커밋된 오프셋부터 계속 읽어요. 읽는 세트와 게시하는 세트가 겹치니 워커 자리는 적어도 <code>2 × replicas × taskCount</code> 가 있어야 해요.</p>`,
      play: async (s) => {
        const pr = s.params;
        s.reset();
        await readOnce(s, 'b', pr).catch(() => {});
        await s.send('poll', { dur: 1, glyph: '?' });
        s.pulse('coord');
        await s.send('load', { dur: 0.9, glyph: '▸' });
        await s.send('dl', { dur: 1.6, glyph: '[s]' });
        s.patch('hist', { lines: ['segment cache', [c('d', '[s][s][s]'), c('g', '[s]')]] });
        s.pulse('hist');
        await s.wait(0.6);
        tasks(pr, 'a').forEach((id) => s.state(id, 'hidden'));
        // 이제 Broker 는 그 구간을 Historical 에 물어요
        s.patch('broker', { lines: [[c('d', 'now asks '), 'Historical']] });
        s.pulse('broker');
        s.pulse('hist');
        for (let k = 0; k < 2; k++) {
          await readOnce(s, 'b', pr);
          await s.wait(0.3);
        }
        await s.wait(1.4);
      },
      gap: 0.3,
    },
    {
      title: '실패하면: 마지막 커밋 오프셋부터',
      show: (pr) => [...BASE, ...frames(pr), ...tasks(pr, 'b')],
      on: (pr) => ['ov', 'meta', ...tasks(pr, 'b'), 'ov-meta', 'ov-mm1', ...PARTS.map((p) => `pb${p}`)],
      patch: () => ({ meta: { lines: metaLines('done') }, ...Object.fromEntries(PARTS.map((p) => [`p${p}`, { lines: partLines(p, OFF1[p]) }])) }),
      hold: 12,
      body: `<p>태스크가 게시 전에 죽으면, 그 태스크가 메모리와 디스크에 모은 <b>아직 게시하지 않은 데이터는 버려요</b>. 수퍼바이저가 새 태스크를 띄우고, 새 태스크는 메타데이터에 <b>마지막으로 커밋된 오프셋</b>부터 다시 읽어요.</p>
      <p>게시와 오프셋 커밋이 한 트랜잭션이라 빠지거나 두 번 들어가는 행이 없어요. 콘솔의 오프셋 재설정(reset) 같은 조작은 이 보장을 깰 수 있어 조심해야 해요.</p>`,
      play: async (s) => {
        const pr = s.params;
        s.reset();
        const victim = taskId('b', 0, 0);
        await readOnce(s, 'b', pr);
        await s.wait(0.5);
        s.state(victim, 'warn');
        s.patch(victim, { lines: taskLines(pr.T, 0, { rows: 0, state: 'FAILED' }) });
        await s.wait(1.4);
        s.patch('ov', { lines: overlordLines(5) });
        await s.send('ov-meta', { dur: 0.9, glyph: '?', reverse: true });
        s.pulse('meta');
        s.patch('ov', { lines: overlordLines(6) });
        await s.send('ov-mm1', { dur: 0.9, glyph: '▸' });
        s.state(victim, 'on');
        s.patch(victim, { lines: taskLines(pr.T, 0, { rows: 0, extra: c('i', `from p0:${OFF1[0]}`) }) });
        s.pulse(victim);
        s.patch('ov', { lines: overlordLines() });
        await readOnce(s, 'b', pr);
        await s.wait(1.6);
      },
      gap: 0.4,
    },
    {
      title: '작은 세그먼트와 최선 노력 롤업',
      show: (pr) => [...BASE, ...frames(pr), ...tasks(pr, 'b'), 'small'],
      on: ['deep', 'small'],
      patch: () => ({ meta: { lines: metaLines('done') }, ...Object.fromEntries(PARTS.map((p) => [`p${p}`, { lines: partLines(p, OFF1[p]) }])) }),
      hold: 12,
      body: `<p>태스크는 세그먼트가 <code>maxRowsPerSegment</code>(기본 5,000,000)나 <code>maxTotalRows</code>(기본 20,000,000)에 닿으면 그때까지 만든 세그먼트를 먼저 넘기고 새 파티션을 시작해요(<b>점진적 핸드오프</b>). 태스크 경계마다 <b>작은 세그먼트</b>가 남기 쉬워 나중에 <b>컴팩션</b>으로 합쳐요.</p>
      <p>스트리밍의 롤업은 늘 <b>최선 노력</b>이에요. 읽는 양에 따라 태스크 수를 늘리고 줄이는 오토스케일러(<code>lagBased</code>)도 있지만 <code>enableTaskAutoScaler</code> 를 켜야 동작해요.</p>`,
      play: async (s) => {
        await readOnce(s, 'b', s.params);
        s.pulse('small');
        await s.wait(2.4);
      },
    },
  ],
};
