/*
 * 01 아키텍처 한눈에
 *
 * 네 줄로 선다(위에서부터): MASTER(Overlord, Coordinator) 와 오른쪽의 ZooKeeper,
 * 저장소 줄(메타데이터 저장소, 딥 스토리지), DATA(Peon, MiddleManager,
 * Historical ×3, 왼쪽 밖에 Kafka), QUERY(Broker, Router, 오른쪽 밖에 클라이언트).
 * 줄 사이의 빈 골목(cy)으로 선이 지나간다.
 */
import { c } from '../ascii.js';

const HIST = ['segment cache', '[s][s][s]', ':8083'];

export default {
  title: '아키텍처 한눈에',
  docs: [
    ['Architecture', 'https://druid.apache.org/docs/latest/design/architecture'],
    ['Storage', 'https://druid.apache.org/docs/latest/design/storage'],
    ['Query processing', 'https://druid.apache.org/docs/latest/querying/query-processing'],
  ],
  legend: ['query', 'ingest', 'control', 'storage', 'meta', 'zk'],

  nodes: [
    { id: 'zMaster', type: 'frame', x: 10, y: 2, cols: 88, rows: 9, title: 'MASTER', caption: '마스터 서버', tone: 'm' },
    { id: 'overlord', x: 14, y: 4, title: 'Overlord', lines: ['task queue, locks', 'supervisors', c('d', ':8090')], tone: 'm', caption: '태스크 배정, 락', hint: 'Overlord' },
    { id: 'coord', x: 70, y: 4, title: 'Coordinator', lines: ['load / drop segments', 'replicas, balance', c('d', ':8081')], tone: 'm', caption: '세그먼트 배치, 균형' },
    { id: 'zk', x: 104, y: 4, title: 'ZooKeeper', lines: ['service discovery', 'leader election'], tone: 'y', frame: 'round', caption: '서비스 찾기, 리더 선출' },

    { id: 'meta', x: 0, y: 13, title: 'metadata store', lines: ['PostgreSQL, MySQL', 'segments, rules', 'tasks, supervisors'], tone: 'p', frame: 'round', caption: '메타데이터 저장소' },
    { id: 'deep', x: 44, y: 13, title: 'deep storage', lines: ['S3, HDFS, GCS, NFS', 'every segment file', c('g', '[s][s][s][s][s][s]')], tone: 'g', frame: 'round', caption: '딥 스토리지 — 세그먼트 원본' },

    { id: 'zData', type: 'frame', x: 16, y: 22, cols: 108, rows: 10, title: 'DATA', caption: '데이터 서버', tone: 'i' },
    { id: 'kafka', x: 0, y: 25, title: 'Kafka', lines: ['topic: edits', 'p0 p1 p2 p3'], tone: 'n', caption: '이벤트 스트림' },
    { id: 'peon', x: 20, y: 25, title: 'Peon', lines: ['index_kafka', 'task JVM'], tone: 'i', caption: '태스크 하나' },
    { id: 'mm', x: 40, y: 24, title: 'MiddleManager', lines: ['worker slots', 'forks Peons', c('d', ':8091')], tone: 'i', caption: '태스크 실행' },
    { id: 'hist1', x: 64, y: 24, title: 'Historical 1', lines: HIST, tone: 'i', caption: '세그먼트 캐시, 쿼리' },
    { id: 'hist2', x: 84, y: 24, title: 'Historical 2', lines: HIST, tone: 'i', caption: '세그먼트 캐시, 쿼리' },
    { id: 'hist3', x: 104, y: 24, title: 'Historical 3', lines: HIST, tone: 'i', caption: '세그먼트 캐시, 쿼리' },

    { id: 'zQuery', type: 'frame', x: 60, y: 35, cols: 52, rows: 9, title: 'QUERY', caption: '쿼리 서버', tone: 'q' },
    { id: 'broker', x: 64, y: 37, title: 'Broker', lines: ['plans SQL (Calcite)', 'scatter / gather', c('d', ':8082')], tone: 'q', caption: '쿼리 분배, 결과 병합' },
    { id: 'router', x: 90, y: 37, title: 'Router', lines: ['routes → Brokers', 'web console', c('d', ':8888')], tone: 'q', caption: '라우팅, 웹 콘솔' },
    { id: 'client', x: 119, y: 37, title: 'client', lines: ['SQL, JSON', 'JDBC, HTTP'], tone: 'n', caption: '클라이언트' },
  ],

  edges: [
    // 쿼리
    { id: 'cr', from: 'client', to: 'router', via: 'l-r', tone: 'q', label: 'SQL' },
    { id: 'rb', from: 'router', to: 'broker', via: 'l-r', tone: 'q' },
    { id: 'bh1', from: 'broker', to: 'hist1', via: 't-b', cy: 32.8, tone: 'q' },
    { id: 'bh2', from: 'broker', to: 'hist2', via: 't-b', cy: 32.8, tone: 'q', label: 'subquery' },
    { id: 'bh3', from: 'broker', to: 'hist3', via: 't-b', cy: 32.8, tone: 'q' },
    { id: 'bp', from: 'broker', to: 'peon', via: 'tl-b', cy: 33.6, tone: 'q', label: 'realtime' },
    // 수집
    { id: 'kp', from: 'kafka', to: 'peon', via: 'r-l', tone: 'i', label: 'read' },
    { id: 'mp', from: 'mm', to: 'peon', via: 'l-r', tone: 'i', label: 'fork' },
    // 제어
    { id: 'om', from: 'overlord', to: 'mm', via: 'b-t', cy: 20.2, tone: 'm', label: 'assign task' },
    { id: 'ch1', from: 'coord', to: 'hist1', via: 'b-tr', cy: 21.1, tone: 'm' },
    { id: 'ch2', from: 'coord', to: 'hist2', via: 'b-tr', cy: 21.1, tone: 'm', label: 'load, drop' },
    { id: 'ch3', from: 'coord', to: 'hist3', via: 'b-tr', cy: 21.1, tone: 'm' },
    // 저장
    { id: 'pd', from: 'peon', to: 'deep', via: 't-b', cy: 19.3, tone: 'g', label: 'push segment' },
    { id: 'dh1', from: 'deep', to: 'hist1', via: 'r-t', tone: 'g' },
    { id: 'dh2', from: 'deep', to: 'hist2', via: 'r-t', tone: 'g', label: 'download' },
    { id: 'dh3', from: 'deep', to: 'hist3', via: 'r-t', tone: 'g' },
    // 메타데이터
    { id: 'po', from: 'peon', to: 'overlord', via: 'tr-br', tone: 'p', label: 'publish' },
    { id: 'ometa', from: 'overlord', to: 'meta', via: 'bl-tr', cy: 11.2, tone: 'p' },
    { id: 'cmeta', from: 'coord', to: 'meta', via: 'bl-t', cy: 12, tone: 'p', label: 'poll segments' },
    // ZooKeeper
    { id: 'czk', from: 'coord', to: 'zk', via: 'r-l', tone: 'y' },
    { id: 'ozk', from: 'overlord', to: 'zk', via: 't-t', cy: 1, tone: 'y', label: 'leader election' },
  ],

  steps: [
    {
      title: '역할별로 나뉜 서비스들',
      edges: [],
      body: `<p>Druid 는 한 덩어리 프로그램이 아니라 <b>역할이 다른 서비스 여러 개</b>로 이뤄진 분산 시스템이에요. 서비스마다 따로 설정하고, 따로 늘리고 줄일 수 있어요.</p>
      <p>공식 문서는 이 서비스들을 흔히 <b>서버 종류 셋</b>으로 묶어 배치하라고 권해요: <span class="m">Master</span>, <span class="q">Query</span>, <span class="i">Data</span>. 그리고 바깥에 기대는 것이 셋 있어요: 메타데이터 저장소, 딥 스토리지, ZooKeeper.</p>
      <p class="note">그림은 끌어서 옮기고 휠로 키울 수 있어요. 단계마다 그 단계에서 오가는 길만 점선으로 나타나요.</p>`,
    },
    {
      title: 'Master 서버: Coordinator 와 Overlord',
      on: ['zMaster', 'overlord', 'coord', 'meta', 'zk', 'mm', 'hist1', 'hist2', 'hist3', 'cmeta', 'om', 'ch1', 'ch2', 'ch3', 'czk', 'ozk'],
      focus: ['zMaster', 'zk', 'meta', 'deep', 'hist1', 'hist3', 'mm'],
      body: `<p><b class="m">Coordinator</b> 는 <b>세그먼트가 어디에 있어야 하는지</b>를 관리해요. 메타데이터 저장소에서 쓰는(used) 세그먼트 목록을 읽고, Historical 에 세그먼트를 싣거나(load) 내리라고(drop) 지시하며, 복제본 수와 서버 사이의 균형을 맞춰요.</p>
      <p><b class="m">Overlord</b> 는 <b>수집 작업(태스크)</b>을 관리해요. 태스크를 받아 MiddleManager 에 나눠 주고, 태스크 락과 세그먼트 게시를 조정해요.</p>
      <p>둘 다 여러 대를 띄울 수 있고 <b>리더 한 대</b>만 일해요. 리더는 ZooKeeper 로 뽑아요.</p>
      <p class="note">Coordinator 가 Overlord 역할까지 맡게 할 수도 있어요(<code>druid.coordinator.asOverlord.enabled</code>). 공식 예제 클러스터 설정이 이렇게 한 프로세스로 띄워요.</p>`,
      play: async (s) => {
        s.pulse('coord');
        await s.send('cmeta', { reverse: true, dur: 1.2 });
        await s.sendAll(['ch1', 'ch2', 'ch3'], { dur: 1.2, glyph: '▸' });
        s.pulse('overlord');
        await s.send('om', { dur: 1.2, glyph: '▸' });
        s.pulse('mm');
      },
      gap: 1.2,
    },
    {
      title: 'Query 서버: Router 와 Broker',
      on: ['zQuery', 'client', 'router', 'broker', 'hist1', 'hist2', 'hist3', 'peon', 'cr', 'rb', 'bh1', 'bh2', 'bh3', 'bp'],
      focus: ['zQuery', 'client', 'hist1', 'hist3', 'peon'],
      body: `<p><b class="q">Broker</b> 는 클라이언트의 쿼리를 받아, 필요한 세그먼트를 가진 데이터 서버들에 나눠 보내고, 돌아온 부분 결과를 <b>합쳐서</b> 돌려줘요. SQL 은 Broker 가 Apache Calcite 로 네이티브 쿼리로 바꿔서 실행해요.</p>
      <p><b class="q">Router</b> 는 선택 사항이에요. 쿼리는 알맞은 Broker 로, 관리 요청은 Coordinator 와 Overlord 로 보내는 단일 창구이고, <b>웹 콘솔</b>도 띄워요.</p>`,
      play: async (s) => {
        await s.send('cr', { dur: 0.9 });
        await s.send('rb', { dur: 0.8 });
        s.pulse('broker');
        await s.sendAll(['bh1', 'bh2', 'bh3', 'bp'], { dur: 1.1 });
        await s.sendAll(['bh1', 'bh2', 'bh3', 'bp'], { dur: 1.1, reverse: true, glyph: '◆' });
        s.pulse('broker');
        await s.send('rb', { dur: 0.7, reverse: true, glyph: '◆' });
        await s.send('cr', { dur: 0.7, reverse: true, glyph: '◆' });
      },
    },
    {
      title: 'Data 서버: Historical 과 MiddleManager',
      on: ['zData', 'kafka', 'peon', 'mm', 'hist1', 'hist2', 'hist3', 'kp', 'mp'],
      focus: ['zData', 'kafka'],
      body: `<p><b class="i">Historical</b> 은 쿼리할 수 있는 세그먼트를 <b>로컬 디스크에 내려받아(세그먼트 캐시)</b> 들고 있다가, 그 세그먼트에 대한 쿼리를 처리해요. 파일은 메모리 매핑으로 읽고, 쓰기는 받지 않아요.</p>
      <p><b class="i">MiddleManager</b> 는 수집 태스크를 실행해요. 태스크 하나마다 <b>Peon</b> 이라는 별도 JVM 을 띄우고, Peon 이 데이터를 읽어 세그먼트를 만들어요. 스트리밍 태스크는 아직 넘기지 않은 <b>실시간 데이터에 대한 쿼리</b>도 받아요.</p>
      <p class="note">태스크를 돌리는 방법은 셋 중 하나를 골라요: MiddleManager 와 Peon, 태스크마다 Kubernetes Job 을 띄우는 <b>MiddleManager 없는 방식</b>(37 부터 정식), 한 JVM 의 스레드로 돌리는 <b>Indexer</b>(실험적).</p>`,
      play: async (s) => {
        s.pulse('mm');
        await s.send('mp', { dur: 0.8, glyph: '▸' });
        for (let k = 0; k < 4; k++) {
          s.send('kp', { dur: 1, glyph: '•' }).catch(() => {});
          await s.wait(0.35);
        }
        await s.wait(0.8);
        s.pulse('peon');
      },
    },
    {
      title: '바깥에 기대는 것 셋',
      on: ['meta', 'deep', 'zk'],
      focus: ['meta', 'deep', 'zk', 'zMaster'],
      body: `<p><b class="g">딥 스토리지</b>(S3, HDFS, GCS, Azure, NFS 등)는 모든 세그먼트의 <b>원본</b>이에요. 서비스 사이에 세그먼트를 옮기는 통로이자 백업이라, 데이터 서버를 모두 잃어도 여기서 다시 일어설 수 있어요. 보통의 쿼리는 여기서 곧장 읽지 않고 Historical 이 미리 받아 둔 사본으로 답해요.</p>
      <p><b class="p">메타데이터 저장소</b>(PostgreSQL, MySQL)는 세그먼트 목록과 쓰임 여부, 태스크, 수퍼바이저, 보존 규칙, 설정을 담아요.</p>
      <p><b class="y">ZooKeeper</b> 는 서비스 찾기와 Coordinator, Overlord 의 리더 선출에 써요.</p>
      <p class="note">세그먼트를 싣고 내리라는 지시와 태스크 배정, 누가 어떤 세그먼트를 가졌는지 알아내는 일은 이제 기본으로 <b>HTTP</b> 로 오가요. ZooKeeper 가 맡던 건 옛 방식이에요.</p>`,
      play: async (s) => {
        s.pulse('deep');
        await s.wait(0.9);
        s.pulse('meta');
        await s.wait(0.9);
        s.pulse('zk');
        await s.wait(1.2);
      },
    },
    {
      title: '수집 경로: 스트림이 세그먼트가 되기까지',
      on: ['kafka', 'peon', 'mm', 'overlord', 'coord', 'meta', 'deep', 'hist1', 'om', 'mp', 'kp', 'pd', 'po', 'ometa', 'cmeta', 'ch1', 'dh1'],
      focus: ['kafka', 'zMaster', 'meta', 'deep', 'hist1', 'zData'],
      hold: 14,
      body: `<ol>
        <li><b class="m">Overlord</b> 가 태스크를 <b class="i">MiddleManager</b> 에 맡기면 <b>Peon</b> 이 떠서 <b>Kafka</b> 를 읽어요. 읽은 행은 곧바로 쿼리할 수 있어요.</li>
        <li>세그먼트로 묶어 <b class="g">딥 스토리지</b>에 올리고, <b class="m">Overlord</b> 를 거쳐 <b class="p">메타데이터 저장소</b>에 게시해요. 태스크는 DB 에 직접 붙지 않아요.</li>
        <li><b class="m">Coordinator</b> 가 이를 보고(기본 1분 주기) <b class="i">Historical</b> 에 싣게 하면, 태스크는 세그먼트를 넘기고(핸드오프) 끝나요.</li>
      </ol>`,
      play: async (s) => {
        s.reset();
        await s.send('om', { dur: 1, glyph: '▸' });
        await s.send('mp', { dur: 0.6, glyph: '▸' });
        for (let k = 0; k < 4; k++) {
          s.send('kp', { dur: 0.8, glyph: '•' }).catch(() => {});
          await s.wait(0.3);
        }
        await s.wait(0.7);
        s.pulse('peon');
        await s.send('pd', { dur: 1.4, glyph: '[s]' });
        s.pulse('deep');
        await s.send('po', { dur: 1, glyph: '✎' });
        await s.send('ometa', { dur: 0.9, glyph: '✎' });
        s.pulse('meta');
        await s.send('cmeta', { dur: 1.1, reverse: true });
        s.pulse('coord');
        await s.send('ch1', { dur: 1, glyph: '▸' });
        await s.send('dh1', { dur: 1.2, glyph: '[s]' });
        s.patch('hist1', { lines: ['segment cache', ['[s][s][s]', { t: '[s]', c: 'g' }], ':8083'] });
        s.pulse('hist1');
        await s.wait(1.4);
      },
      gap: 1,
    },
    {
      title: '쿼리 경로: 흩어 보내고, 모아서 합쳐요',
      on: ['client', 'router', 'broker', 'hist1', 'hist2', 'hist3', 'peon', 'zQuery', 'cr', 'rb', 'bh1', 'bh2', 'bh3', 'bp'],
      focus: ['zQuery', 'client', 'zData'],
      hold: 11,
      body: `<ol>
        <li>클라이언트가 SQL(또는 네이티브 JSON 쿼리)을 보내요. <b class="q">Router</b> 가 Broker 로 넘겨요.</li>
        <li><b class="q">Broker</b> 는 쿼리의 시간 범위에 걸리는 세그먼트와, 그 세그먼트를 가진 서버를 찾아요(타임라인).</li>
        <li>해당 <b class="i">Historical</b> 과, 실시간 데이터를 가진 <b>Peon</b> 에 하위 쿼리를 보내요(scatter).</li>
        <li>각 서버가 세그먼트별로 계산한 부분 결과를 돌려주면, Broker 가 <b>합쳐서</b> 답해요(gather).</li>
      </ol>`,
      play: async (s) => {
        await s.send('cr', { dur: 0.9 });
        await s.send('rb', { dur: 0.8 });
        s.pulse('broker');
        await s.wait(0.3);
        await s.sendAll(['bh1', 'bh2', 'bh3', 'bp'], { dur: 1.1 });
        ['hist1', 'hist2', 'hist3', 'peon'].forEach((id) => s.pulse(id));
        await s.wait(0.6);
        await s.sendAll(['bh1', 'bh2', 'bh3', 'bp'], { dur: 1.1, reverse: true, glyph: '◆' });
        s.pulse('broker');
        await s.wait(0.3);
        await s.send('rb', { dur: 0.7, reverse: true, glyph: '◆' });
        await s.send('cr', { dur: 0.7, reverse: true, glyph: '◆' });
        s.pulse('client');
      },
    },
    {
      title: '한 대가 쓰러져도 괜찮아요: 원본은 딥 스토리지에',
      on: ['coord', 'meta', 'deep', 'hist2', 'hist3', 'cmeta', 'ch2', 'ch3', 'dh2', 'dh3'],
      focus: ['zMaster', 'meta', 'deep', 'hist1', 'hist3'],
      hold: 13,
      body: `<p>Historical 한 대가 사라지면 <b class="m">Coordinator</b> 는 그 서버의 세그먼트를 빠진 것으로 봐요. 곧 돌아오면 제 캐시로 다시 답하게 두고, 정해진 시간이 지나도 돌아오지 않으면 <b>남은 Historical 에 다시 싣게</b> 해요. 원본은 <b class="g">딥 스토리지</b>에 있으니 데이터를 잃지 않아요.</p>
      <p>기본 보존 규칙은 세그먼트마다 <b>복제본 2개</b>를 둬요. 그래서 그동안에도 쿼리는 다른 사본으로 계속돼요. Coordinator 가 모두 멈춰도 클러스터는 돌아가요. 세그먼트 배치만 바뀌지 않을 뿐이에요.</p>`,
      play: async (s) => {
        s.reset();
        await s.wait(1.2);
        s.state('hist1', 'warn');
        s.patch('hist1', { lines: ['segment cache', { t: '× offline', c: 'x' }, ':8083'] });
        await s.wait(1.4);
        s.pulse('coord');
        await s.send('cmeta', { dur: 1, reverse: true });
        await s.sendAll(['ch2', 'ch3'], { dur: 1.1, glyph: '▸' });
        await s.sendAll(['dh2', 'dh3'], { dur: 1.3, glyph: '[s]' });
        const more = ['segment cache', ['[s][s][s]', { t: '[s]', c: 'g' }], ':8083'];
        s.patch('hist2', { lines: more });
        s.patch('hist3', { lines: more });
        s.pulse('hist2');
        s.pulse('hist3');
        await s.wait(3);
      },
      gap: 0.4,
    },
  ],
};
