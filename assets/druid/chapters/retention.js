/*
 * 15 보존 규칙과 삭제
 *
 * 위 줄: 규칙 사슬(wikipedia 의 규칙 셋 + 클러스터 _default), Coordinator, 메타데이터
 * 저장소(used / unused 수). 가운데 줄: hot 티어(Historical 둘), cold 티어(하나), 딥
 * 스토리지, kill 태스크(또는 딥 스토리지 쿼리). 아래: 시간 줄 — 한 칸이 하루인
 * 최근 100일. 왼쪽이 오래된 날, 오른쪽 끝이 오늘(now).
 *
 * 'now' 막대를 밀면 날이 가고, 세그먼트가 hot 에서 cold 로, 다시 unused 로 늙는다.
 * auto-kill 을 켜면 오래 쓰지 않은 세그먼트가 지워진다(빈칸).
 */
import { c } from '../ascii.js';

const DAY = 86400000;
const BASE = Date.UTC(2026, 8, 27); // now = 2026-09-27 + 막대 값(일)
const D0 = Date.UTC(2026, 5, 1); // 데이터는 2026-06-01 부터 날마다 한 세그먼트
const WINDOW = 100; // 시간 줄에 보이는 날 수
const HOT = 7; // loadByPeriod P7D
const COLD = 30; // loadByPeriod P30D
const KILL_AGE = 90; // durationToRetain P90D(bufferPeriod P30D 는 이미 넘는다)

const mmdd = (ms) => new Date(ms).toISOString().slice(5, 10);
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

/** 나이(오늘부터 며칠 전)에 따라 세그먼트의 처지. mode 'deep' 은 딥 스토리지 전용 규칙일 때. */
function fate(age, kill, mode) {
  if (age < HOT) return 'hot';
  if (age < COLD) return 'cold';
  if (mode === 'deep') return 'deep';
  if (kill && age >= KILL_AGE) return 'killed';
  return 'unused';
}

const GLYPH = { hot: ['█', 'q'], cold: ['▓', 'i'], unused: ['░', 'd'], deep: ['▒', 'g'], killed: [' ', 'd'], none: [' ', 'd'] };

/** 시간 줄의 모든 것: 칸들, 수, 눈금. */
function model(nowDays, kill, mode = 'drop') {
  const now = BASE + nowDays * DAY;
  const total = Math.round((now - D0) / DAY) + 1;
  const count = { hot: 0, cold: 0, unused: 0, deep: 0, killed: 0 };
  for (let a = 0; a < total; a++) count[fate(a, kill, mode)]++;
  const cells = [];
  for (let j = 0; j < WINDOW; j++) {
    const a = WINDOW - 1 - j;
    cells.push(a >= total ? 'none' : fate(a, kill, mode));
  }
  return { now, total, count, cells };
}

/** 칸들을 같은 색끼리 묶어 한 줄로. mark 가 있으면 그 칸을 ^ 로 가리킨다. */
function stateLine(cells) {
  const out = [c('d', 'state  ')];
  let run = '';
  let tone = null;
  for (const f of cells) {
    const [g, t] = GLYPH[f];
    if (t !== tone && run) {
      out.push(c(tone, run));
      run = '';
    }
    tone = t;
    run += g;
  }
  if (run) out.push(c(tone, run));
  return out;
}

function markerLine(kill, mode) {
  const row = Array(WINDOW).fill(' ');
  const put = (age, text) => {
    const j = WINDOW - 1 - age;
    for (let k = 0; k < text.length && j + k < WINDOW + 8; k++) row[j + k] = text[k];
  };
  put(HOT - 1, '|P7D');
  put(COLD - 1, '|P30D');
  if (kill && mode !== 'deep') put(KILL_AGE - 1, '|P90D kill');
  return [c('d', 'rules  '), c('m', row.join(''))];
}

function pointerLine(age) {
  const row = Array(WINDOW).fill(' ');
  if (age != null) row[WINDOW - 1 - age] = '^';
  return [c('d', '       '), c('x', row.join(''))];
}

function dateLines(now) {
  const ticks = Array(WINDOW).fill('─');
  const labels = Array(WINDOW + 6).fill(' ');
  for (let j = 0; j < WINDOW; j += 10) {
    ticks[j] = '┬';
    const d = mmdd(now - (WINDOW - 1 - j) * DAY);
    for (let k = 0; k < 5; k++) labels[j + k] = d[k];
  }
  ticks[WINDOW - 1] = '┤';
  const nowLabel = 'now';
  for (let k = 0; k < nowLabel.length; k++) labels[WINDOW - 2 + k] = nowLabel[k];
  return [
    [c('d', '       '), c('d', ticks.join(''))],
    [c('d', '       '), c('d', labels.join(''))],
  ];
}

function timelineLines(p, { mode = 'drop', pointer = null } = {}) {
  const m = model(p.now, p.kill, mode);
  return [markerLine(p.kill, mode), stateLine(m.cells), pointerLine(pointer), ...dateLines(m.now)];
}

const RULES = [
  [c('b', '1 '), 'loadByPeriod P7D   ', c('q', '{hot: 2}')],
  [c('b', '2 '), 'loadByPeriod P30D  ', c('i', '{cold: 1}')],
  [c('b', '3 '), c('x', 'dropForever')],
  '---',
  c('d', '_default: loadForever {_default_tier: 2}'),
];
const RULES_DEEP = [
  [c('b', '1 '), 'loadByPeriod P7D   ', c('q', '{hot: 2}')],
  [c('b', '2 '), 'loadByPeriod P30D  ', c('i', '{cold: 1}')],
  [c('b', '3 '), 'loadForever ', c('g', '{}')],
  ['  ', c('d', 'useDefaultTierForNull: false')],
  '---',
  c('d', '_default: loadForever {_default_tier: 2}'),
];

/** 규칙 사슬에서 k 번째 규칙을 가리킨 모습(첫 번째로 맞는 규칙). */
function rulesPointing(rules, k) {
  let n = 0;
  return rules.map((l) => {
    if (l === '---' || !Array.isArray(l)) return l;
    const hit = n === k;
    n++;
    return hit ? [c('x', '> '), ...l.slice(1)] : l;
  });
}

function metaLines(p, mode = 'drop') {
  const m = model(p.now, p.kill, mode);
  const used = m.count.hot + m.count.cold + m.count.deep;
  return [
    ['used    ', c('g', String(used).padStart(4))],
    ['unused  ', c('d', String(m.count.unused).padStart(4))],
    ['deleted ', c('x', String(m.count.killed).padStart(4))],
  ];
}

function deepLines(p, mode = 'drop') {
  const m = model(p.now, p.kill, mode);
  const files = m.total - m.count.killed;
  return [`files  ${String(files).padStart(4)}`, c('d', `unused ${String(m.count.unused).padStart(4)}`)];
}

function nodes(p) {
  const m = model(p.now, p.kill);
  return [
    { id: 'rules', x: 0, y: 1, title: 'rules: wikipedia', lines: RULES, tone: 'p', frame: 'round', caption: '위에서부터, 처음 맞는 규칙 하나', w: 44 },
    { id: 'coord', x: 52, y: 1, title: 'Coordinator', lines: ['each run, each', 'used segment:', c('m', 'first matching rule'), '-> load or drop'], tone: 'm' },
    { id: 'meta', x: 82, y: 1, title: 'druid_segments', lines: metaLines(p), tone: 'p', frame: 'round', w: 16 },

    { id: 'tHot', type: 'frame', x: 0, y: 11, cols: 36, rows: 7, title: '', tone: 'q', caption: 'tier: hot' },
    { id: 'hot1', x: 2, y: 12, title: 'hot-1', lines: [`segments ${String(m.count.hot).padStart(2)}`], tone: 'q', w: 12 },
    { id: 'hot2', x: 18, y: 12, title: 'hot-2', lines: [`segments ${String(m.count.hot).padStart(2)}`], tone: 'q', w: 12 },
    { id: 'tCold', type: 'frame', x: 38, y: 11, cols: 19, rows: 7, title: '', tone: 'i', caption: 'tier: cold' },
    { id: 'cold1', x: 40, y: 12, title: 'cold-1', lines: [`segments ${String(m.count.cold).padStart(2)}`], tone: 'i', w: 13 },
    { id: 'deep', x: 60, y: 12, title: 'deep storage', lines: deepLines(p), tone: 'g', frame: 'round', caption: '딥 스토리지(파일 원본)', w: 14 },
    { id: 'kill', x: 86, y: 12, title: 'kill task', lines: ['unused only', 'files + rows', c('x', 'cannot undo')], tone: 'x', frame: 'heavy', w: 14 },
    { id: 'msq', x: 86, y: 12, title: 'MSQ query', lines: ['POST /druid/v2', '/sql/statements', c('d', 'ASYNC')], tone: 'q', w: 15 },

    { id: 'tl', type: 'frame', x: 0, y: 21, cols: 114, rows: 8, title: 'timeline: wikipedia (1 col = 1 day)', tone: 'n', tag: `now = ${ymd(m.now)}` },
    { id: 'tlText', type: 'text', x: 2, y: 22, lines: timelineLines(p) },
    {
      id: 'key',
      type: 'text',
      x: 2,
      y: 29,
      lines: [[c('q', '█'), c('d', ' hot   '), c('i', '▓'), c('d', ' cold   '), c('d', '░ unused (still in deep storage)   '), c('g', '▒'), c('d', ' deep storage only   '), c('d', '(blank) killed')]],
    },
    { id: 'sql', type: 'text', x: 2, y: 31, lines: [] },
  ];
}

const edges = [
  { id: 'rc', from: 'rules', to: 'coord', via: 'r-l', tone: 'p', label: 'rules' },
  { id: 'cm', from: 'coord', to: 'meta', via: 'r-l', tone: 'p', label: 'used=0' },
  { id: 'ch', from: 'coord', to: 'tHot', via: 'bl-t', cy: 9.5, tone: 'm', label: 'load' },
  { id: 'cc', from: 'coord', to: 'tCold', via: 'b-t', cy: 10.3, tone: 'm' },
  { id: 'kd', from: 'kill', to: 'deep', via: 'l-r', tone: 'x', label: 'delete' },
  { id: 'km', from: 'kill', to: 'meta', via: 't-b', tone: 'x', label: 'delete rows' },
  { id: 'qd', from: 'msq', to: 'deep', via: 'l-r', tone: 'q', label: 'read' },
];

const BASE_SHOW = ['rules', 'coord', 'meta', 'tHot', 'hot1', 'hot2', 'tCold', 'cold1', 'deep', 'tl', 'tlText', 'key'];

export default {
  title: '보존 규칙과 삭제',
  docs: [
    ['Rule configuration', 'https://druid.apache.org/docs/latest/operations/rule-configuration'],
    ['Data deletion', 'https://druid.apache.org/docs/latest/data-management/delete'],
    ['Query from deep storage', 'https://druid.apache.org/docs/latest/querying/query-deep-storage'],
  ],
  legend: [
    ['hot 티어', 'q'],
    ['cold 티어', 'i'],
    ['제어', 'm'],
    ['메타데이터', 'p'],
    ['삭제', 'x'],
  ],
  controls: [
    { id: 'now', label: 'now (오늘 날짜)', type: 'range', min: 0, max: 60, step: 1, value: 0, format: (v) => ymd(BASE + v * DAY) },
    { id: 'kill', label: 'druid.coordinator.kill.on', type: 'toggle', value: false },
  ],
  nodes,
  edges,
  steps: [
    {
      title: '규칙은 위에서부터, 처음 맞는 하나',
      show: BASE_SHOW,
      on: ['rules', 'coord', 'rc', 'tl', 'tlText'],
      dim: false,
      body: `<p>보존 규칙은 데이터소스마다 <b>순서 있는 목록</b>이에요. 그 뒤에 클러스터 기본 규칙(<code>_default</code>, 처음엔 <code>loadForever</code> 로 기본 티어에 복제본 2개)이 붙어요. Coordinator 는 쓰는 세그먼트마다 규칙을 위에서부터 대 보고, <b>처음 맞는 규칙 하나</b>만 따라요.</p>
      <p>여기 사슬은 최근 7일은 hot 티어에 둘, 30일까지는 cold 티어에 하나, 그보다 오래된 것은 내려요. <code>includeFuture</code> 가 기본 <code>true</code> 라 앞날 구간의 세그먼트도 기간 규칙에 맞아요.</p>
      <p class="note">아래 <b>now</b> 막대를 밀면 날이 흘러요. 세그먼트가 hot 에서 cold 로, 다시 unused 로 늙어 가요.</p>`,
      play: async (s) => {
        const ages = [3, 16, 55];
        for (const age of ages) {
          const k = age < HOT ? 0 : age < COLD ? 1 : 2;
          s.patch('tlText', { lines: timelineLines(s.params, { pointer: age }) });
          s.patch('rules', { lines: rulesPointing(RULES, k) });
          s.pulse('rules');
          await s.wait(1.8);
        }
        s.patch('tlText', { lines: timelineLines(s.params) });
        s.patch('rules', { lines: RULES });
        await s.wait(1);
      },
      gap: 0.3,
    },
    {
      title: 'hot 에서 cold 로: 나이에 따라 옮겨 가요',
      show: BASE_SHOW,
      on: ['coord', 'tHot', 'hot1', 'hot2', 'tCold', 'cold1', 'ch', 'cc', 'tl', 'tlText'],
      body: `<p>규칙의 <code>tieredReplicants</code> 가 티어마다 복제본 수를 정해요. 최근 7일 세그먼트는 hot 티어의 두 서버에 하나씩(복제본 2개), 8~30일 세그먼트는 cold 티어에 하나씩 실려요. 날이 지나 규칙이 바뀌면 Coordinator 가 새 티어에 싣고 옛 티어에서 내려요.</p>
      <p>새 티어는 그 티어를 가리키는 로드 규칙이 생기기 전까지 비어 있어요. 기간 로드 규칙만 두고 drop 규칙을 두지 않으면, 기간 밖의 데이터는 <code>_default</code>(<code>loadForever</code>)에 걸려 계속 실린 채로 남아요.</p>`,
      play: async (s) => {
        s.pulse('tHot');
        await s.send('ch', { dur: 1.1, glyph: '▸' });
        s.pulse('hot1');
        s.pulse('hot2');
        await s.wait(0.6);
        await s.send('cc', { dur: 1.1, glyph: '▸' });
        s.pulse('cold1');
        await s.wait(2.4);
      },
    },
    {
      title: 'drop 은 지우지 않아요: unused 표시',
      show: BASE_SHOW,
      on: ['coord', 'meta', 'deep', 'cm', 'tl', 'tlText'],
      body: `<p>drop 규칙에 걸린 세그먼트는 클러스터에서 내려오지만 <b>지워지지 않아요</b>. 메타데이터에 <code>used = 0</code> 으로 표시될 뿐이고(소프트 삭제), 파일은 딥 스토리지에, 메타데이터의 줄도 그대로 남아요. 시간 줄의 <code>░</code> 칸이 이런 세그먼트예요.</p>
      <p>그래서 되살릴 수 있어요: 규칙을 넓히고 세그먼트를 다시 used 로 표시하면 돼요. 손으로 내릴 때는 Overlord 의 <code>POST /druid/indexer/v1/datasources/{ds}/markUnused</code> 나 웹 콘솔을 써요.</p>`,
      play: async (s) => {
        await s.send('cm', { dur: 1.2, glyph: '0' });
        s.pulse('meta');
        await s.wait(0.6);
        s.pulse('deep');
        await s.wait(2.4);
      },
    },
    {
      title: 'kill: 되돌릴 수 없는 삭제',
      show: [...BASE_SHOW, 'kill'],
      on: ['kill', 'deep', 'meta', 'kd', 'km', 'tl', 'tlText'],
      hold: 11,
      body: (p) => `<p><code>kill</code> 태스크는 <b>unused 인 세그먼트만</b> 딥 스토리지의 파일과 메타데이터의 줄까지 지워요(하드 삭제). <b>되돌릴 수 없어요.</b></p>
      <p>Coordinator 의 자동 kill 은 기본으로 <b>꺼져 있어요</b>(<code>druid.coordinator.kill.on = false</code>). 켜면 unused 가 된 지 <code>bufferPeriod</code>(기본 <code>P30D</code>)가 지나고, 구간이 <code>now - durationToRetain</code>(기본 <code>P90D</code>)보다 앞선 세그먼트를 지워요.</p>
      <p class="note">지금 auto-kill 은 <b>${p.kill ? '켜져' : '꺼져'} 있어요</b>. 오른쪽 조작에서 바꿔 보세요. 켜면 시간 줄에서 90일보다 오래된 칸이 빈칸이 돼요.</p>`,
      play: async (s) => {
        if (!s.params.kill) {
          s.pulse('kill');
          await s.wait(3);
          return;
        }
        await s.sendAll(['kd', 'km'], { dur: 1.2, glyph: 'x' });
        s.pulse('deep');
        s.pulse('meta');
        await s.wait(2.4);
      },
    },
    {
      title: '딥 스토리지에만 두고 쿼리하기',
      show: [...BASE_SHOW, 'msq'],
      on: ['rules', 'deep', 'msq', 'qd', 'tl', 'tlText'],
      patch: (p) => ({
        rules: { lines: RULES_DEEP },
        tlText: { lines: timelineLines(p, { mode: 'deep' }) },
        meta: { lines: metaLines(p, 'deep') },
        deep: { lines: deepLines(p, 'deep') },
      }),
      hold: 11,
      body: `<p>오래된 데이터를 Historical 에 싣지 않으면서도 쿼리하고 싶다면, 마지막 규칙을 <code>tieredReplicants: {}</code> 와 <code>useDefaultTierForNull: false</code> 로 둬요. 그러면 세그먼트는 <b>used 인 채로</b> 어느 티어에도 실리지 않아요(<code>replication_factor</code> 0, 시간 줄의 <code>▒</code>).</p>
      <p>이런 세그먼트는 <b>딥 스토리지에서 쿼리</b>로 읽어요: <code>POST /druid/v2/sql/statements</code> 에 <code>executionMode: ASYNC</code> 를 주면 MSQ 태스크가 딥 스토리지에서 바로 읽어요. drop 규칙으로 내린(unused) 세그먼트는 이 방법으로도 읽지 못해요.</p>`,
      play: async (s) => {
        await s.send('qd', { dur: 1.3, glyph: '?' });
        s.pulse('deep');
        await s.wait(0.4);
        await s.send('qd', { dur: 1.3, glyph: '◆', reverse: true });
        s.pulse('msq');
        await s.wait(2);
      },
    },
    {
      title: '행 단위로 지우려면: 다시 쓰기',
      show: ['rules', 'coord', 'meta', 'deep', 'tl', 'tlText', 'key', 'sql', 'kill'],
      on: ['sql', 'deep', 'meta', 'kill'],
      patch: {
        sql: {
          lines: [
            c('q', 'REPLACE INTO wikipedia'),
            c('q', "OVERWRITE WHERE __time >= TIMESTAMP '2026-09-01'"),
            c('q', "            AND __time <  TIMESTAMP '2026-09-02'"),
            c('q', 'SELECT * FROM wikipedia'),
            c('q', "WHERE __time >= TIMESTAMP '2026-09-01'"),
            c('q', "  AND __time <  TIMESTAMP '2026-09-02'"),
            [c('q', '  AND "user" <> '), c('x', "'bob'")],
            c('q', 'PARTITIONED BY DAY'),
          ],
        },
      },
      focus: ['rules', 'meta', 'sql', 'tl'],
      body: `<p>Druid 에는 키로 한 행을 고치거나 지우는 <code>UPDATE</code> 나 <code>DELETE</code> 가 없어요. 특정 행을 지우려면 그 시간 범위를 <b>다시 써요</b>: 남길 행만 고르는 필터로 <code>REPLACE … OVERWRITE WHERE</code> 를 돌리면 돼요(네이티브 배치라면 <code>transformSpec</code> 의 not 필터).</p>
      <p>다시 쓴 새 버전이 옛 세그먼트를 가리면 옛 것은 unused 가 돼요. 파일까지 지우려면 여기서도 <b>kill</b> 이 필요해요.</p>`,
    },
  ],
};
