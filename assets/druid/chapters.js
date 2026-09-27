/*
 * 장 목록. 순서대로 읽으면 Druid 가 데이터를 받아 저장하고, 찾아 주고, 관리하는
 * 흐름을 따라가게 짰다. 장 모듈(chapters/*.js)은 고를 때 불러온다.
 * ready 가 아닌 장은 목차에 '만드는 중'으로 보이고 열리지 않는다.
 */
export const GROUPS = [
  { id: 'big', title: '큰 그림' },
  { id: 'storage', title: '저장' },
  { id: 'ingest', title: '수집' },
  { id: 'query', title: '쿼리' },
  { id: 'manage', title: '데이터 관리' },
  { id: 'advanced', title: '더 깊이' },
];

export const CHAPTERS = [
  { id: 'architecture', ready: true, group: 'big', title: '아키텍처 한눈에', sub: '서비스, 서버 종류, 외부 의존성', load: () => import('./chapters/architecture.js') },
  { id: 'segments', ready: true, group: 'storage', title: '데이터소스와 세그먼트', sub: '타임 청크, 파티션, 버전', load: () => import('./chapters/segments.js') },
  { id: 'anatomy', ready: true, group: 'storage', title: '세그먼트 해부', sub: '컬럼, 사전, 비트맵, 압축', load: () => import('./chapters/anatomy.js') },
  { id: 'filtering', ready: true, group: 'storage', title: '세그먼트 안에서 찾기', sub: '비트맵 필터, 필요한 것만 읽기', load: () => import('./chapters/filtering.js') },
  { id: 'rollup', ready: true, group: 'ingest', title: '데이터 모델과 롤업', sub: '__time, 차원, 지표, 미리 합치기', load: () => import('./chapters/rollup.js') },
  { id: 'partitioning', ready: true, group: 'ingest', title: '파티셔닝', sub: '시간, 2차 파티션, 정렬, 프루닝', load: () => import('./chapters/partitioning.js') },
  { id: 'streaming', ready: true, group: 'ingest', title: '스트리밍 수집', sub: 'Kafka 수퍼바이저, 태스크, 핸드오프', load: () => import('./chapters/streaming.js') },
  { id: 'batch', ready: true, group: 'ingest', title: '배치 수집', sub: '네이티브 병렬, SQL INSERT/REPLACE', load: () => import('./chapters/batch.js') },
  { id: 'locks', ready: true, group: 'ingest', title: '태스크, 락, 원자적 교체', sub: 'Overlord 큐, 락 우선순위, 동시 쓰기', load: () => import('./chapters/locks.js') },
  { id: 'query-path', ready: true, group: 'query', title: '쿼리의 여정', sub: '흩뿌리고 모으기, 프루닝, 캐시', load: () => import('./chapters/query-path.js') },
  { id: 'sql-native', ready: true, group: 'query', title: 'SQL 에서 네이티브로', sub: 'Scan, Timeseries, TopN, GroupBy', load: () => import('./chapters/sql-native.js') },
  { id: 'joins', ready: true, group: 'query', title: '조인과 룩업', sub: '브로드캐스트 해시 조인, 룩업', load: () => import('./chapters/joins.js') },
  { id: 'sketches', ready: true, group: 'query', title: '근사 집계와 스케치', sub: 'HLL, Theta, 분위수', load: () => import('./chapters/sketches.js') },
  { id: 'coordinator', ready: true, group: 'manage', title: 'Coordinator 와 Historical', sub: '적재, 복제, 균형, 티어', load: () => import('./chapters/coordinator.js') },
  { id: 'retention', ready: true, group: 'manage', title: '보존 규칙과 삭제', sub: 'load, drop 규칙, unused, kill', load: () => import('./chapters/retention.js') },
  { id: 'compaction', ready: true, group: 'manage', title: '컴팩션과 재색인', sub: '작은 세그먼트 합치기, 다시 나누기', load: () => import('./chapters/compaction.js') },
  { id: 'msq', ready: true, group: 'advanced', title: '멀티 스테이지 엔진', sub: 'MSQ, 딥 스토리지 쿼리, Dart', load: () => import('./chapters/msq.js') },
  { id: 'recent', ready: true, group: 'advanced', title: '최근 버전의 변화', sub: '31 → 37, 프로젝션, 가상 스토리지', load: () => import('./chapters/recent.js') },
];
