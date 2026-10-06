/*
 * 다운로드 폴더: Dock 의 스택
 *
 * 맥의 Dock 스택처럼, 구분선 오른쪽의 다운로드 폴더를 누르면 그 위로 내용이 펼쳐진다.
 * 보기는 맥의 '자동'을 따른다 — 항목이 적고 화면 높이에 다 들어가면 부채(fan),
 * 아니면 격자(grid) 판. 좁은 화면(폰)은 늘 격자다.
 *   부채   아이콘이 Dock 아이콘에서 튀어나와 오른쪽으로 휘며 쌓인다(새것이 맨 아래).
 *          이름표는 아이콘 왼쪽, 맨 위는 'Open in Finder'.
 *   격자   Dock 아이콘을 가리키는 꼬리가 달린 둥근 유리 판이 아이콘에서 커지며 뜬다.
 *          위에 폴더 이름, 아래에 'Open in Finder'.
 * 파일은 진짜가 아니다. 누르면 맥의 'Finder 에서 보기'처럼 Finder 의 다운로드 폴더를
 * 열고 그 파일을 골라 둔다. Finder 창이 없는 쪽(글)에서는 첫 화면의 그 자리
 * (/?at=downloads&select=…)로 넘어간다.
 *
 * 목록(DOWNLOADS)은 Finder 의 다운로드 칸(finder.js)도 함께 쓴다. 날짜는 오늘에서
 * 거꾸로 센다 — 언제 와서 열어 봐도 오늘 · 어제 · 지난주에 받은 파일들이다.
 * 보기를 고정하려면 localStorage 'ephemeris:stack-view' 에 'fan' · 'grid' 를 둔다
 * (setStackView). 없으면 '자동'.
 */
import { DESKTOP } from './windows.js';
import { showInfo } from './macos.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const FILES = '/assets/images/files/';
const VIEW_KEY = 'ephemeris:stack-view';

// ── 목록 ────────────────────────────────────────────────────────
// 백엔드 개발자의 다운로드 폴더. at 은 몇 분 전(숫자) 또는 [며칠 전, 시, 분, 초].
// 이름이 날짜를 품은 파일(스크린샷, 회의록, 청구서)은 받은 날에서 이름을 짓는다.
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 맥의 스크린샷 이름: "Screenshot 2026-10-06 at 11.24.03 AM.png"
function screenshotName(d) {
  const h = d.getHours();
  return `Screenshot ${ymd(d)} at ${h % 12 || 12}.${pad(d.getMinutes())}.${pad(d.getSeconds())} ${h < 12 ? 'AM' : 'PM'}.png`;
}

// IntelliJ 는 해마다 봄(.1) · 여름(.2) · 늦가을(.3)에 새 판이 나온다.
function ideaVersion(d) {
  const y = d.getFullYear();
  const m = d.getMonth();
  return m >= 10 ? `${y}.3` : m >= 7 ? `${y}.2` : m >= 3 ? `${y}.1` : `${y - 1}.3`;
}

// 청구서는 받은 달의 지난달 것이다.
function invoiceName(d) {
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `invoice_${p.getFullYear()}-${pad(p.getMonth() + 1)}.pdf`;
}

const SPEC = [
  { id: 'screenshot', at: 26, name: screenshotName, ext: 'png', size: 1284312, thumb: 'screenshot-light' },
  { id: 'slow-query-report', at: 112, name: 'slow_query_report.csv', ext: 'csv', size: 86214 },
  { id: 'docker-compose', at: 251, name: 'docker-compose.yml', ext: 'yml', size: 1842 },
  { id: 'meeting-notes', at: [1, 17, 42, 9], name: (d) => `회의록_${pad(d.getMonth() + 1)}${pad(d.getDate())}.md`, ext: 'md', size: 6120 },
  { id: 'postman-collection', at: [1, 14, 5, 31], name: 'order-api.postman_collection.json', ext: 'json', size: 48733 },
  { id: 'invoice', at: [2, 10, 31, 2], name: invoiceName, ext: 'pdf', size: 182406, page: 'invoice' },
  { id: 'intellij', at: [3, 21, 14, 40], name: (d) => `ideaIU-${ideaVersion(d)}-aarch64.dmg`, ext: 'dmg', size: 1243551744 },
  { id: 'architecture', at: [4, 16, 47, 12], name: 'aws-architecture.drawio.png', ext: 'png', size: 412880, thumb: 'architecture' },
  { id: 'docker', at: [5, 11, 20, 5], name: 'Docker.dmg', ext: 'dmg', size: 612385021 },
  { id: 'kafka', at: [6, 15, 3, 44], name: 'kafka_2.13-3.8.0', ext: 'folder' }, // 아래 tgz 를 푼 폴더
  { id: 'kafka-tgz', at: [6, 15, 2, 18], name: 'kafka_2.13-3.8.0.tgz', ext: 'tgz', size: 118153224 },
  { id: 'jdk', at: [9, 13, 33, 27], name: 'jdk-21.0.4_macos-aarch64_bin.dmg', ext: 'dmg', size: 196820551 },
  { id: 'resume', at: [12, 23, 8, 15], name: (d) => `resume_${d.getFullYear()}.pdf`, ext: 'pdf', size: 248117, page: 'resume' },
  { id: 'aws-cli', at: [17, 10, 55, 3], name: 'AWSCLIV2.pkg', ext: 'pkg', size: 41203117 },
  { id: 'old-screenshot', at: [24, 15, 8, 51], name: screenshotName, ext: 'png', size: 2035118, thumb: 'screenshot-dark' },
];

// 맥 Finder 의 '종류'
const KINDS = {
  png: 'PNG image',
  csv: 'CSV document',
  yml: 'YAML document',
  md: 'Markdown document',
  json: 'JSON document',
  pdf: 'PDF document',
  dmg: 'Disk Image',
  folder: 'Folder',
  tgz: 'gzip compressed archive',
  pkg: 'Installer package',
};

/** Finder 처럼 1000 단위로: 86 KB, 612.4 MB, 1.24 GB. 폴더는 '--'. */
export function formatSize(bytes) {
  if (bytes == null) return '--';
  if (bytes < 1e3) return `${bytes} bytes`;
  if (bytes < 1e6) return `${Math.round(bytes / 1e3)} KB`;
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e9).toFixed(2)} GB`;
}

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const longFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long' });
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// 서머타임이 낀 날도 하루로 센다(round).
const daysAgo = (d, now) => Math.round((midnight(now) - midnight(d)) / 864e5);

/** Finder 의 날짜 열: "Today at 11:24 AM", "Yesterday at 5:42 PM", "Oct 1, 2026 at 3:15 PM" */
export function addedLabel(d, now = new Date()) {
  const n = daysAgo(d, now);
  return `${n === 0 ? 'Today' : n === 1 ? 'Yesterday' : dayFmt.format(d)} at ${timeFmt.format(d)}`;
}

// Finder 의 '추가된 날짜'로 묶기
function groupOf(d, now) {
  const n = daysAgo(d, now);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  if (n <= 7) return 'Previous 7 Days';
  if (n <= 30) return 'Previous 30 Days';
  return d.getFullYear() === now.getFullYear() ? monthFmt.format(d) : String(d.getFullYear());
}

// 받은 때는 쪽을 연 순간에 한 번만 정한다. 스택과 Finder 가 같은 이름을 보이게
// (스크린샷 이름의 분이 둘 사이에 바뀌지 않게).
const ANCHOR = new Date();
const FILES_LIST = SPEC.map((s) => {
  let added;
  if (typeof s.at === 'number') {
    added = new Date(ANCHOR.getTime() - s.at * 6e4);
    added.setSeconds(17, 0);
  } else {
    const [days, h, m, sec] = s.at;
    added = new Date(ANCHOR.getFullYear(), ANCHOR.getMonth(), ANCHOR.getDate() - days, h, m, sec);
  }
  const name = typeof s.name === 'function' ? s.name(added) : s.name;
  return {
    id: s.id,
    name,
    ext: s.ext,
    kind: KINDS[s.ext] || 'Document',
    size: s.size ?? null,
    sizeLabel: formatSize(s.size),
    added,
    thumb: s.thumb || '',
    page: s.page || '',
  };
}).sort((a, b) => b.added - a.added);

/** 새것부터. 날짜 글(addedLabel)과 묶음(group)은 부를 때의 오늘로 다시 센다. */
export function listDownloads(now = new Date()) {
  return FILES_LIST.map((f) => ({ ...f, addedLabel: addedLabel(f.added, now), group: groupOf(f.added, now) }));
}

export const DOWNLOADS = listDownloads();

const fileById = (id) => FILES_LIST.find((f) => f.id === id);

// ── 파일 아이콘 ─────────────────────────────────────────────────
// 맥의 아이콘처럼: 디스크 이미지 · 설치 꾸러미 · 폴더는 시스템 아이콘 그대로,
// 그림은 작은 미리보기(흰 테두리), PDF 는 첫 쪽의 축소판, 그 밖의 문서는 빈 종이
// 위에 내용의 윤곽(Quick Look 미리보기처럼)과 확장자. 크기는 --s 로 정한다.
const SYSTEM = { dmg: 'disk-image', pkg: 'package', folder: 'folder' };
let clipCount = 0;

// 종이 그림의 좌표(256 칸). 접힌 귀퉁이는 오른쪽 위(대각선이 x 136,y 4 → x 218,y 86).
const line = (x1, x2, y, w = 7, c = '#c9c9ce') => `<path d="M${x1} ${y}H${x2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const SKETCH = {
  // 마크다운: 굵은 제목, 문단, 글머리 목록
  md: () =>
    line(58, 132, 34, 12, '#7c7c82') + line(58, 196, 62) + line(58, 188, 80) + line(58, 150, 98) +
    `<circle cx="62" cy="124" r="4.5" fill="#a1a1a6"/>` + line(76, 182, 124) +
    `<circle cx="62" cy="142" r="4.5" fill="#a1a1a6"/>` + line(76, 160, 142) + line(58, 192, 168) + line(58, 124, 186),
  // YAML: 들여쓴 열쇠와 값
  yml: () =>
    line(58, 112, 32, 7, '#8e8e93') + line(78, 108, 52, 7, '#8e8e93') + line(98, 142, 72, 7, '#8e8e93') + line(150, 196, 72) +
    line(98, 134, 92, 7, '#8e8e93') + line(142, 192, 92) + line(98, 124, 112, 7, '#8e8e93') + line(118, 178, 132) +
    line(78, 120, 152, 7, '#8e8e93') + line(98, 138, 172, 7, '#8e8e93') + line(146, 186, 172),
  // JSON: 중괄호 사이의 열쇠: 값
  json: () =>
    line(58, 66, 32, 7, '#8e8e93') + line(76, 128, 52, 7, '#8e8e93') + line(136, 192, 52) +
    line(76, 116, 72, 7, '#8e8e93') + line(124, 178, 72) + line(76, 136, 92, 7, '#8e8e93') + line(144, 152, 92) +
    line(96, 140, 112, 7, '#8e8e93') + line(148, 196, 112) + line(96, 128, 132, 7, '#8e8e93') + line(136, 172, 132) +
    line(76, 84, 152) + line(58, 66, 172, 7, '#8e8e93'),
  // CSV: 머리줄이 있는 표
  csv: () => {
    const rows = [28, 52, 76, 100, 124, 148, 172];
    const cols = [56, 104, 152, 200];
    let s = `<rect x="56" y="28" width="144" height="24" fill="#e6e6ea"/>`;
    for (const y of rows) s += `<path d="M56 ${y}H200" stroke="#d4d4d8" stroke-width="2"/>`;
    for (const x of cols) s += `<path d="M${x} 28V172" stroke="#d4d4d8" stroke-width="2"/>`;
    for (const y of rows.slice(0, -1)) for (const x of cols.slice(0, -1)) s += line(x + 9, x + (y === 28 ? 30 : 36), y + 12, 6, y === 28 ? '#8e8e93' : '#c4c4c9');
    return s;
  },
  // 압축 파일: 가운데로 내려오는 지퍼
  tgz: () => {
    let s = `<rect x="118" y="4" width="20" height="118" fill="#e8e8ec"/>`;
    for (let y = 6, k = 0; y < 116; y += 8, k++) s += `<rect x="${k % 2 ? 128 : 121}" y="${y}" width="7" height="5" rx="1" fill="${k % 2 ? '#a1a1a6' : '#8e8e93'}"/>`;
    return s + `<rect x="117" y="116" width="22" height="34" rx="6" fill="#8e8e93"/><rect x="123" y="132" width="10" height="11" rx="3" fill="#f2f2f5"/>`;
  },
};

// 종이(빈 문서 아이콘) 위에 그린다. 접힌 귀퉁이 밖으로 내용이 나가지 않게 자른다.
function docOverlay(ext, small) {
  const id = `dlclip-${++clipCount}`;
  const body = (SKETCH[ext] || SKETCH.md)();
  const label = small ? '' : `<text x="128" y="224" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif" font-size="${ext.length > 3 ? 34 : 38}" font-weight="700" letter-spacing="1" fill="#9a9aa0">${esc(ext.toUpperCase())}</text>`;
  return `<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false"><defs><clipPath id="${id}"><path d="M50 8H134L210 84V${small ? 232 : 192}H50Z"/></clipPath></defs><g clip-path="url(#${id})">${body}</g>${label}</svg>`;
}

// PDF 의 첫 쪽: 이력서와 청구서
const PAGES = {
  resume: () =>
    `<rect x="58" y="32" width="86" height="13" rx="2" fill="#2c2c2e"/><rect x="58" y="51" width="58" height="6" rx="2" fill="#3a7bd5"/>` +
    `<rect x="152" y="34" width="46" height="4" rx="2" fill="#b4b4b9"/><rect x="160" y="42" width="38" height="4" rx="2" fill="#b4b4b9"/><rect x="156" y="50" width="42" height="4" rx="2" fill="#b4b4b9"/>` +
    `<path d="M58 68H198" stroke="#d8d8dc" stroke-width="2"/>` +
    `<rect x="58" y="78" width="42" height="6" rx="2" fill="#48484a"/>` +
    [92, 101, 110].map((y, i) => `<rect x="58" y="${y}" width="${[140, 128, 104][i]}" height="4" rx="2" fill="#c7c7cc"/>`).join('') +
    `<rect x="58" y="124" width="50" height="6" rx="2" fill="#48484a"/>` +
    [138, 147, 156, 170, 179].map((y, i) => `<circle cx="61" cy="${y + 2}" r="2.2" fill="#a1a1a6"/><rect x="68" y="${y}" width="${[124, 112, 96, 128, 84][i]}" height="4" rx="2" fill="#c7c7cc"/>`).join('') +
    `<rect x="58" y="194" width="38" height="6" rx="2" fill="#48484a"/>` +
    [208, 217].map((y, i) => `<rect x="58" y="${y}" width="${[136, 92][i]}" height="4" rx="2" fill="#c7c7cc"/>`).join(''),
  invoice: () =>
    `<rect x="58" y="32" width="20" height="20" rx="5" fill="#34a853"/><rect x="132" y="34" width="66" height="11" rx="2" fill="#2c2c2e"/>` +
    `<rect x="150" y="52" width="48" height="4" rx="2" fill="#b4b4b9"/><rect x="162" y="60" width="36" height="4" rx="2" fill="#b4b4b9"/>` +
    [76, 84, 92].map((y, i) => `<rect x="58" y="${y}" width="${[46, 62, 40][i]}" height="4" rx="2" fill="#c7c7cc"/>`).join('') +
    `<rect x="58" y="108" width="140" height="12" rx="1.5" fill="#e6e6ea"/>` +
    [128, 144, 160, 176].map((y, i) => `<rect x="62" y="${y}" width="${[72, 58, 80, 50][i]}" height="4" rx="2" fill="#c7c7cc"/><rect x="172" y="${y}" width="22" height="4" rx="2" fill="#c7c7cc"/><path d="M58 ${y + 10}H198" stroke="#ececf0" stroke-width="1.5"/>`).join('') +
    `<path d="M136 194H198" stroke="#aeaeb2" stroke-width="2"/><rect x="140" y="200" width="58" height="8" rx="2" fill="#2c2c2e"/>` +
    `<rect x="58" y="226" width="96" height="3" rx="1.5" fill="#dcdce0"/>`,
};

function pdfPage(page) {
  return `<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false"><rect x="40.5" y="10.5" width="175" height="235" rx="3" fill="#fff" stroke="rgba(0,0,0,.14)"/>${(PAGES[page] || PAGES.resume)()}</svg>`;
}

const pic = (name, size) => {
  const [a, b] = SYSTEM[name] ? [128, 256] : size <= 32 ? [64, 128] : [128, 256];
  const file = SYSTEM[name] || name;
  return `<img src="${FILES}${file}-${a}.png" srcset="${FILES}${file}-${a}.png 1x, ${FILES}${file}-${b}.png 2x" alt="" draggable="false">`;
};

/**
 * 파일 아이콘(HTML). size 는 그릴 크기(px) — 작으면 확장자 글을 빼고 낮은 해상도를 쓴다.
 * fixed 가 false 면 크기는 CSS(--s)가 정한다(Finder 의 목록처럼 화면 폭에 따라 바뀔 때).
 */
export function fileIcon(f, size = 64, { fixed = true } = {}) {
  const style = fixed ? ` style="--s:${size}px"` : '';
  const small = size < 32;
  if (f.thumb) {
    return `<span class="dlicon dlicon--thumb"${style}><img src="${FILES}${f.thumb}-256.webp" alt="" draggable="false" decoding="async"></span>`;
  }
  if (f.page) return `<span class="dlicon dlicon--pdf"${style}>${pdfPage(f.page)}</span>`;
  if (SYSTEM[f.ext]) return `<span class="dlicon"${style}>${pic(f.ext, size)}</span>`;
  return `<span class="dlicon dlicon--doc"${style}>${pic('document', size)}${docOverlay(f.ext, small)}</span>`;
}

// ── 긴 이름 ─────────────────────────────────────────────────────
// 맥처럼 넘치는 이름은 가운데를 줄인다(끝의 확장자는 남는다). 원래 이름은 data-full.
function middle(name, max) {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.length - dot : 0;
  const tail = Math.max(1, Math.min(Math.max(Math.ceil(max * 0.45), ext + 2), max - 2, name.length - 1));
  return `${name.slice(0, Math.max(0, max - tail - 1)).trimEnd()}…${name.slice(-tail).trimStart()}`;
}

// 가장 긴 것을 반으로 갈라 찾는다(넘치는지는 fits 가 잰다).
function longest(full, fits) {
  if (fits(full)) return full;
  let lo = 3;
  let hi = full.length - 1;
  let best = middle(full, 3);
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const text = middle(full, mid);
    if (fits(text)) {
      best = text;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

// 글 폭은 캔버스로 잰다(레이아웃을 건드리지 않는다).
let ruler = null;
function measurer(cs) {
  ruler ??= document.createElement('canvas').getContext('2d');
  ruler.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return (text) => ruler.measureText(text).width;
}

/**
 * 그려진 칸에 맞춘다(스택처럼 한 번만 잴 때).
 * 한 줄 칸(부채의 이름표)은 가운데를 줄이고, 두 줄 칸(격자)은 맥처럼 첫 줄을 앞에서부터
 * 채우고(낱말 사이에서 끊되 너무 비면 글자에서) 둘째 줄의 가운데를 줄인다.
 */
export function fitNames(root) {
  for (const el of $$('[data-full]', root)) {
    const full = el.dataset.full;
    el.textContent = full;
    if (!el.clientWidth) continue;
    const cs = getComputedStyle(el);
    const measure = measurer(cs);
    const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
    if (cs.whiteSpace === 'nowrap') {
      if (el.scrollWidth > el.clientWidth) el.textContent = longest(full, (t) => measure(t) <= w);
      continue;
    }
    if (measure(full) <= w) continue;
    el.textContent = twoLines(full, measure, w);
    // 캔버스와 실제 글자가 조금 달라 넘치면, 그려 보며 줄인다.
    if (el.scrollHeight > el.clientHeight + 0.5) {
      el.textContent = longest(full, (t) => {
        el.textContent = t;
        return el.scrollHeight <= el.clientHeight + 0.5;
      });
    }
  }
}

// 첫 줄은 앞에서부터 채우고, 낱말이 끝나는 자리(빈칸 · - · _ · .)에서 끊는다. 너무 비면
// 글자에서 끊되 둘째 줄이 너무 짧지 않게. 확장자만 둘째 줄로 떨어뜨리지는 않는다.
function twoLines(full, measure, w) {
  let n = 1;
  while (n < full.length && measure(full.slice(0, n + 1)) <= w) n++;
  const dot = full.lastIndexOf('.');
  const ext = dot > 0 ? full.slice(dot + 1) : '';
  let cut = 0;
  for (let i = n; i > 0; i--) {
    // 점은 판 번호(3.8.0) 사이가 아닐 때만 끊는 자리로 친다.
    const at = ' -_'.includes(full[i - 1]) || (full[i - 1] === '.' && !/\d/.test(full[i] || ''));
    if (at && full.slice(i) !== ext && measure(full.slice(0, i)) >= w * 0.45) {
      cut = i;
      break;
    }
  }
  if (!cut) cut = Math.min(n, Math.max(1, full.length - 4));
  const rest = full.slice(cut).trimStart();
  return `${full.slice(0, cut).trimEnd()}\n${longest(rest, (t) => measure(t) <= w)}`;
}

/**
 * 한 줄 이름들을 칸 폭에 맞춘다(Finder 의 목록처럼 창 크기가 자주 바뀔 때).
 * 레이아웃은 한 번만 읽는다. 감기는 칸(폰)이면 이름을 그대로 둔다.
 */
export function fitLines(els) {
  if (!els.length) return;
  const cs = getComputedStyle(els[0]);
  const measure = measurer(cs);
  const wrap = cs.whiteSpace !== 'nowrap';
  const widths = els.map((el) => el.clientWidth);
  els.forEach((el, i) => {
    const full = el.dataset.full;
    const w = widths[i] - 1;
    if (w <= 0) return;
    const text = wrap ? full : longest(full, (t) => measure(t) <= w);
    if (el.textContent !== text) el.textContent = text;
    el.title = text === full ? '' : full;
  });
}

// ── 열기 · Finder 에서 보기 ─────────────────────────────────────
/**
 * Finder 의 다운로드 폴더에서 그 파일을 골라 보인다(id 가 없으면 폴더만).
 * Finder 창이 있는 첫 화면이면 finder.js 가 받아 열고, 아니면 첫 화면으로 넘어간다.
 */
export function revealDownload(id = '') {
  if ($('[data-window="finder"]')) {
    dispatchEvent(new CustomEvent('ephemeris:reveal-download', { detail: { id } }));
    return;
  }
  location.href = `/?at=downloads${id ? `&select=${encodeURIComponent(id)}` : ''}`;
}

/**
 * Finder 에서 두 번 누르면: 진짜 파일이 없으니 맥의 '정보 가져오기' 창으로 무엇인지
 * 보여 준다.
 */
export function openDownload(id) {
  const f = fileById(id);
  if (!f) return null;
  const el = showInfo({
    name: f.name,
    icon: `${FILES}document-128.png`,
    kind: f.size == null ? f.kind : `${f.kind} — ${f.sizeLabel}`,
    rows: [
      ['Kind', f.kind],
      ['Size', f.size == null ? '--' : `${f.size.toLocaleString('en-US')} bytes (${f.sizeLabel} on disk)`],
      ['Where', 'Downloads'],
      ['Added', `${longFmt.format(f.added)} at ${timeFmt.format(f.added)}`],
      ['Comments', 'A sample file in a pretend Downloads folder. There’s nothing inside to open.'],
    ],
  });
  // 정보 창의 아이콘도 목록과 같은 그림으로
  const img = $('.info__head img', el);
  if (img) img.outerHTML = fileIcon(f, 56);
  return el;
}

// ── 스택 ────────────────────────────────────────────────────────
const FAN = { icon: 50, step: 56, gap: 6, max: 10, sweep: 0.25, tilt: 0.5 };
const GRID = { cell: 104, narrowCell: 84, tail: 11, tailW: 14, radius: 22, gap: 6 };
const ARROW = `<svg class="stack__go" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="15"/><path d="M9.5 16h12M16.5 10.5l5.5 5.5-5.5 5.5"/></svg>`;

let stack = null; // { el, button, view, items, foot, index, cols, closing }

/** 맥의 '내용 보기 방식': 'auto' · 'fan' · 'grid' */
export function stackView() {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'fan' || v === 'grid' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function setStackView(view) {
  try {
    if (view === 'fan' || view === 'grid') localStorage.setItem(VIEW_KEY, view);
    else localStorage.removeItem(VIEW_KEY);
  } catch {}
  if (stack && !stack.closing) {
    const button = stack.button;
    closeStack({ instant: true });
    openStack(button);
  }
}

const menubarBottom = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--menubar-h')) || 30;

// Dock 아이콘의 자리. 확대(macos.js)로 커져 있으면 커진 그림 위에 뜬다. 연 순간에 잰다.
// 마우스가 Dock 위에 있으면(확대 중) 누른 아이콘은 곧 가장 크게(1.55배) 자라므로, 아직
// 덜 자랐어도 그만큼 위에 띄운다(펼친 판이 커지는 아이콘에 덮이지 않게).
function anchorOf(button) {
  const icon = $('.dock__icon', button) || button;
  const r = icon.getBoundingClientRect();
  const b = button.getBoundingClientRect();
  const growing = button.closest('.dock__bar')?.classList.contains('is-magnifying');
  const top = Math.min(r.top, b.top - (growing ? icon.offsetHeight * 0.55 : 0));
  return { x: r.left + r.width / 2, top, half: (b.bottom - top) / 2 };
}

function pickView(count, anchor) {
  if (!DESKTOP.matches) return 'grid';
  const pref = stackView();
  if (pref !== 'auto') return pref;
  const room = anchor.top - FAN.gap - menubarBottom() - 12;
  return count <= FAN.max && (count + 1) * FAN.step <= room ? 'fan' : 'grid';
}

const fileButton = (f, view) =>
  view === 'fan'
    ? `<button class="stack__item" type="button" tabindex="-1" data-id="${esc(f.id)}" aria-label="${esc(`${f.name}, ${f.kind}`)}"><span class="stack__label" data-full="${esc(f.name)}">${esc(f.name)}</span><span class="stack__icon">${fileIcon(f, FAN.icon)}</span></button>`
    : `<button class="stack__cell" type="button" tabindex="-1" data-id="${esc(f.id)}" title="${esc(f.name)}" aria-label="${esc(`${f.name}, ${f.kind}`)}"><span class="stack__icon">${fileIcon(f, 64)}</span><span class="stack__name" data-full="${esc(f.name)}">${esc(f.name)}</span></button>`;

// 부채: 원호를 따라 위로 갈수록 오른쪽으로 휘고 조금씩 기운다. 휘는 각은 높이와
// 상관없이 같아서, 항목이 많으면 크게, 적으면 작게 휜다.
function buildFan(files, anchor) {
  const room = anchor.top - FAN.gap - menubarBottom() - 12;
  const fit = Math.max(1, Math.floor(room / FAN.step) - 1);
  const shown = files.slice(0, fit);
  const more = files.length - shown.length;
  const rows = shown.length + 1;
  const R = (rows * FAN.step) / FAN.sweep;
  const li = (i, inner) => {
    const t = ((i + 0.5) * FAN.step) / R;
    const x = R * (1 - Math.cos(t));
    const y = R * Math.sin(t) - FAN.icon / 2;
    return `<li class="stack__fanitem" style="--x:${x.toFixed(1)}px;--y:${y.toFixed(1)}px;--r:${((t * 180) / Math.PI * FAN.tilt).toFixed(2)}deg;--i:${i}">${inner}</li>`;
  };
  const el = document.createElement('div');
  el.className = 'stack stack--fan';
  el.style.left = `${anchor.x}px`;
  el.style.top = `${anchor.top - FAN.gap}px`;
  el.style.setProperty('--icon', `${FAN.icon}px`);
  el.style.setProperty('--from', `${FAN.gap + anchor.half}px`);
  el.innerHTML = `<ul class="stack__fan" role="list">${shown.map((f, i) => li(i, fileButton(f, 'fan'))).join('')}${li(
    shown.length,
    `<button class="stack__item stack__item--finder" type="button" tabindex="-1" data-finder><span class="stack__label">${more > 0 ? `${more} More in Finder` : 'Open in Finder'}</span><span class="stack__icon">${ARROW}</span></button>`,
  )}</ul>`;
  return el;
}

// 격자 판의 모양: 둥근 사각형 아래에 Dock 아이콘을 가리키는 꼬리. 꼬리 끝은 둥글고
// 밑동은 판으로 부드럽게 이어진다.
function bubble(w, h, ax) {
  const r = GRID.radius;
  const t = GRID.tailW;
  const th = GRID.tail;
  const x = Math.min(Math.max(ax, r + t + 2), w - r - t - 2);
  return [
    `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H${x + t}C${x + t * 0.5} ${h} ${x + 3.2} ${h + th} ${x} ${h + th}`,
    `C${x - 3.2} ${h + th} ${x - t * 0.5} ${h} ${x - t} ${h}`,
    `H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`,
  ].join('');
}

function gridCols(n) {
  if (n <= 4) return Math.max(2, n);
  if (n <= 9) return 3;
  if (n <= 12) return 4;
  return n <= 20 ? 5 : 6;
}

function buildGrid(files, anchor) {
  const narrow = !DESKTOP.matches;
  const cell = narrow ? GRID.narrowCell : GRID.cell;
  const maxW = Math.min(innerWidth - 16, narrow ? 480 : 640);
  const cols = Math.max(2, Math.min(Math.floor((maxW - 24) / cell), gridCols(files.length)));
  const el = document.createElement('div');
  el.className = 'stack stack--grid';
  el.setAttribute('aria-labelledby', 'stack-title');
  el.style.bottom = `${innerHeight - (anchor.top - GRID.gap)}px`;
  el.style.setProperty('--tail', `${GRID.tail}px`);
  el.innerHTML = `
    <svg class="stack__shadow" aria-hidden="true" focusable="false"><defs>
      <filter id="stack-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
      <filter id="stack-blur-near" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
      <mask id="stack-mask" maskUnits="userSpaceOnUse"><rect x="-200" y="-200" width="4000" height="4000" fill="#fff"/><path class="stack__path" fill="#000"/></mask>
    </defs><g mask="url(#stack-mask)"><path class="stack__path stack__shade" transform="translate(0 14)" filter="url(#stack-blur)"/><path class="stack__path stack__shade stack__shade--near" transform="translate(0 1)" filter="url(#stack-blur-near)"/></g></svg>
    <div class="stack__glass"></div>
    <svg class="stack__edge" aria-hidden="true" focusable="false"><path class="stack__path"/></svg>
    <div class="stack__panel">
      <h2 class="stack__title" id="stack-title">Downloads</h2>
      <ul class="stack__grid" role="list" style="--cols:${cols};--cell:${cell}px">${files.map((f) => `<li>${fileButton(f, 'grid')}</li>`).join('')}</ul>
      <div class="stack__foot"><button class="stack__open" type="button" data-finder>Open in Finder${ARROW}</button></div>
    </div>`;
  return { el, cols };
}

// 붙인 뒤에 잰다: 판의 크기를 보고 자리(화면 안으로)와 꼬리 · 그림자 · 테두리의 path 를 정한다.
function layoutGrid(el, anchor) {
  const panel = $('.stack__panel', el);
  const grid = $('.stack__grid', el);
  const room = anchor.top - GRID.gap - GRID.tail - menubarBottom() - 10;
  const chrome = panel.offsetHeight - grid.offsetHeight;
  if (panel.offsetHeight > room) grid.style.maxHeight = `${Math.max(120, room - chrome)}px`;
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const left = Math.round(Math.min(Math.max(8, anchor.x - w / 2), innerWidth - w - 8));
  const ax = anchor.x - left;
  const d = bubble(w, h, ax);
  el.style.left = `${left}px`;
  el.style.setProperty('--ax', `${Math.min(Math.max(ax, 0), w)}px`);
  $('.stack__glass', el).style.clipPath = `path('${d}')`;
  for (const p of $$('.stack__path', el)) p.setAttribute('d', d);
  const pad = 60;
  const shadow = $('.stack__shadow', el);
  shadow.setAttribute('viewBox', `${-pad} ${-pad} ${w + pad * 2} ${h + GRID.tail + pad * 2}`);
  shadow.style.cssText = `left:${-pad}px;top:${-pad}px;width:${w + pad * 2}px;height:${h + GRID.tail + pad * 2}px`;
  const edge = $('.stack__edge', el);
  edge.setAttribute('viewBox', `0 0 ${w} ${h + GRID.tail}`);
  edge.style.cssText = `width:${w}px;height:${h + GRID.tail}px`;
}

function openStack(button) {
  if (stack) closeStack({ instant: true });
  dispatchEvent(new CustomEvent('ephemeris:popup', { detail: 'stack' }));
  const files = listDownloads();
  const anchor = anchorOf(button);
  const view = pickView(files.length, anchor);
  let el;
  let cols = 1;
  if (view === 'fan') el = buildFan(files, anchor);
  else ({ el, cols } = buildGrid(files, anchor));
  el.setAttribute('role', 'dialog');
  if (view === 'fan') el.setAttribute('aria-label', 'Downloads');
  el.dataset.stack = view;
  document.body.append(el);
  fitNames(el);
  if (view === 'grid') layoutGrid(el, anchor);

  const items = view === 'fan' ? $$('.stack__item', el) : $$('.stack__cell', el);
  const foot = view === 'grid' ? $('.stack__open', el) : null;
  stack = { el, button, view, items, foot, cols, index: 0, closing: false };
  button.setAttribute('aria-expanded', 'true');
  el.addEventListener('click', onClick);
  el.addEventListener('keydown', onKey);
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  // 처음 자리(Dock 아이콘 속)를 한 번 그린 뒤에 펼친다.
  void el.offsetWidth;
  el.classList.add('is-open');
  focusAt(0);
}

/** 스택을 접는다. restore 면 초점을 Dock 아이콘으로 돌려놓는다. */
export function closeStack({ restore = false, instant = false } = {}) {
  const st = stack;
  if (!st || (st.closing && !instant)) return;
  const done = () => {
    st.el.remove();
    if (stack === st) stack = null;
  };
  // 접히는 중에 다시 열면 남은 그림은 바로 걷는다.
  if (st.closing) return done();
  st.closing = true;
  st.button.setAttribute('aria-expanded', 'false');
  if (restore) st.button.focus({ preventScroll: true });
  if (instant || reducedMotion.matches) return done();
  st.el.classList.remove('is-open');
  st.el.classList.add('is-closing');
  setTimeout(done, 240);
}

/** Dock 의 다운로드 폴더를 누르면: 접혀 있으면 펼치고, 펼쳐져 있으면 접는다. */
export function toggleDownloads(button) {
  if (!button) return;
  if (stack && !stack.closing && stack.button === button) closeStack();
  else openStack(button);
}

// 고른 항목에 초점(로빙 tabindex: 목록은 탭 한 번에 들어가고, 안에서는 방향키로)
function focusAt(i) {
  const st = stack;
  if (!st || !st.items.length) return;
  st.index = Math.min(Math.max(i, 0), st.items.length - 1);
  st.items.forEach((b, k) => (b.tabIndex = k === st.index ? 0 : -1));
  st.items[st.index].focus({ preventScroll: st.view === 'fan' });
}

function onClick(e) {
  const b = e.target.closest('button');
  if (!b || !stack || stack.closing) return;
  // 열면(Finder 로 가면) 스택은 접힌다. 초점은 Finder 가 가져간다.
  closeStack();
  revealDownload(b.hasAttribute('data-finder') ? '' : b.dataset.id);
}

function onKey(e) {
  const st = stack;
  if (!st || st.closing) return;
  const at = st.items.indexOf(document.activeElement);
  const onFoot = st.foot && document.activeElement === st.foot;
  let next = null;
  if (e.key === 'Tab') {
    // 판 안에서만 돈다(격자: 목록 ↔ 'Open in Finder'). 나가려면 Esc.
    e.preventDefault();
    if (st.foot) (onFoot ? focusAt(st.index) : st.foot.focus());
    return;
  }
  if (st.view === 'fan') {
    // 부채는 위로 쌓인다: ↑ 가 다음(더 오래된 것), ↓ 가 앞(새것)
    next = { ArrowUp: at + 1, ArrowRight: at + 1, ArrowDown: at - 1, ArrowLeft: at - 1, Home: 0, End: st.items.length - 1 }[e.key];
  } else if (onFoot) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = st.items.length - 1 - ((st.items.length - 1) % st.cols) + Math.min(st.index % st.cols, (st.items.length - 1) % st.cols);
  } else {
    const c = st.cols;
    if (e.key === 'ArrowDown' && at + c >= st.items.length) {
      // 맨 아랫줄에서 ↓: 아래 줄이 덜 찼으면 그 끝으로, 아니면 'Open in Finder'
      e.preventDefault();
      if (Math.floor(at / c) < Math.floor((st.items.length - 1) / c)) focusAt(st.items.length - 1);
      else st.foot.focus();
      return;
    }
    next = { ArrowRight: at + 1, ArrowLeft: at - 1, ArrowDown: at + c, ArrowUp: at - c, Home: 0, End: st.items.length - 1 }[e.key];
  }
  if (next == null) return;
  e.preventDefault();
  if (next < 0 || next >= st.items.length) return;
  focusAt(next);
}

// 바깥을 누르거나, 다른 것이 초점을 가져가거나, 다른 판이 뜨거나, 화면 크기가
// 바뀌면 접는다. Dock 아이콘 자신을 누른 것은 toggleDownloads 가 맡는다.
document.addEventListener(
  'pointerdown',
  (e) => {
    if (!stack || stack.closing || stack.el.contains(e.target) || stack.button.contains(e.target)) return;
    closeStack();
  },
  true,
);
document.addEventListener('focusin', (e) => {
  if (!stack || stack.closing || stack.el.contains(e.target) || stack.button.contains(e.target)) return;
  closeStack();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !stack || stack.closing) return;
  e.preventDefault();
  closeStack({ restore: true });
});
addEventListener('resize', () => closeStack({ instant: true }));
addEventListener('ephemeris:popup', (e) => {
  if (e.detail !== 'stack') closeStack();
});
