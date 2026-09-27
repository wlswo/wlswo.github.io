/*
 * 아스키 아트 도구
 *
 * 그림 속 글자는 모두 고정폭(JetBrains Mono)으로 그린다. 한 줄은 문자열이거나,
 * 색을 입힌 조각들의 배열이다:
 *
 *   'plain text'
 *   ['bitmap ', c('q', '1 0 1 1'), ' rows']     // c(색, 글자)
 *
 * 색 이름: q(쿼리) i(수집, 데이터) m(제어) g(저장) p(메타데이터) y(ZooKeeper)
 *          x(경고) d(흐림) b(굵게), f(틀) h(제목) — CSS 의 .t-q 따위와 짝이다.
 *
 * 한글은 고정폭 글꼴에서 폭이 맞지 않으니 틀(상자) 안에는 넣지 않는다. 한글
 * 설명은 상자 밖 이름표(caption)나 설명 칸에 쓴다.
 */

/** 색을 입힌 조각 하나. */
export const c = (tone, text) => ({ t: String(text), c: tone });

/** 한 줄을 조각 배열로(문자열, c() 조각 하나, 배열 모두 받는다). */
export const parts = (line) => (Array.isArray(line) ? line : line && typeof line === 'object' ? [line] : [String(line ?? '')]);

/** 줄의 보이는 글자 수. */
export const width = (line) => parts(line).reduce((n, p) => n + (typeof p === 'string' ? p : p.t).length, 0);

/** 줄을 n 칸에 맞춰 오른쪽을 빈칸으로 채운다(align: left, right, center). */
export function pad(line, n, align = 'left') {
  const w = width(line);
  const gap = Math.max(0, n - w);
  const ps = parts(line);
  if (!gap) return ps;
  if (align === 'right') return [' '.repeat(gap), ...ps];
  if (align === 'center') return [' '.repeat(Math.floor(gap / 2)), ...ps, ' '.repeat(Math.ceil(gap / 2))];
  return [...ps, ' '.repeat(gap)];
}

// 틀 모양. on(강조) 은 겹선, warn(경고) 은 굵은 선.
export const FRAMES = {
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│', lt: '├', rt: '┤' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║', lt: '╠', rt: '╣' },
  heavy: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃', lt: '┣', rt: '┫' },
  round: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│', lt: '├', rt: '┤' },
  dashed: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '┄', v: '┆', lt: '├', rt: '┤' },
};

/**
 * 상자 한 개의 줄들. title 은 윗변에 박힌다: ┌─ Broker ─────┐
 * lines 안의 '---' 한 줄은 가로 칸막이(├────┤)가 된다.
 * w 를 주면 그 폭(안쪽 글자 수)보다 좁아지지 않는다. tag 는 윗변 오른쪽의 작은 글자.
 * 틀 글자는 c('f', …), 제목은 c('h', …) 로 싸서 CSS 가 따로 칠하게 한다.
 */
export function box(title, lines = [], { frame = 'single', w = 0, padX = 1, tag = '' } = {}) {
  const f = FRAMES[frame] || FRAMES.single;
  const tagw = tag ? tag.length + 3 : 0;
  const inner = Math.max(w, ...lines.map((l) => (l === '---' ? 0 : width(l) + padX * 2)), title ? title.length + 4 + tagw : 0);
  const top = title
    ? [c('f', `${f.tl}${f.h} `), c('h', title), c('f', ` ${f.h.repeat(Math.max(1, inner - title.length - 3 - tagw))}`), ...(tag ? [c('f', ' '), c('d', tag), c('f', ` ${f.h}`)] : []), c('f', f.tr)]
    : [c('f', f.tl + f.h.repeat(inner) + f.tr)];
  const out = [top];
  for (const l of lines) {
    if (l === '---') out.push([c('f', f.lt + f.h.repeat(inner) + f.rt)]);
    else out.push([c('f', f.v), ' '.repeat(padX), ...pad(l, inner - padX * 2), ' '.repeat(padX), c('f', f.v)]);
  }
  out.push([c('f', f.bl + f.h.repeat(inner) + f.br)]);
  return out;
}

/** 큰 틀(구역): 안은 비어 있고 크기를 칸 수로 준다. */
export function frame(title, cols, rows, { frame: kind = 'dashed', tag = '' } = {}) {
  const f = FRAMES[kind] || FRAMES.dashed;
  const tagw = tag ? tag.length + 3 : 0;
  const inner = Math.max(cols - 2, title ? title.length + 4 + tagw : 0);
  const head = title
    ? [c('f', `${f.tl}${f.h} `), c('h', title), c('f', ` ${f.h.repeat(Math.max(1, inner - title.length - 3 - tagw))}`), ...(tag ? [c('f', ' '), c('d', tag), c('f', ` ${f.h}`)] : []), c('f', f.tr)]
    : [c('f', f.tl + f.h.repeat(inner) + f.tr)];
  const out = [head];
  for (let r = 0; r < Math.max(0, rows - 2); r++) out.push([c('f', f.v), ' '.repeat(inner), c('f', f.v)]);
  out.push([c('f', f.bl + f.h.repeat(inner) + f.br)]);
  return out;
}

/**
 * 표. rows 의 칸은 문자열이나 c() 조각. 머리 밑에 가는 선을 긋는다.
 *   table(['__time', 'channel'], [['09:00', '#ko'], …])
 */
export function table(head, rows, { align = [], sep = ' │ ', rule = '─' } = {}) {
  const cols = head.length;
  const wid = Array.from({ length: cols }, (_, i) => Math.max(width(head[i] ?? ''), ...rows.map((r) => width(r[i] ?? ''))));
  const line = (cells) => {
    const out = [];
    cells.forEach((cell, i) => {
      if (i) out.push(sep);
      out.push(...pad(cell ?? '', wid[i], align[i] || 'left'));
    });
    return out;
  };
  const ruler = wid.map((w) => rule.repeat(w)).join(rule + (sep.includes('│') ? '┼' : rule) + rule);
  // 머리칸: 글자면 흐린 색으로, 이미 색을 입힌 조각이면 그대로
  return [line(head.map((h) => (typeof h === 'string' ? c('d', h) : h))), ruler, ...rows.map(line)];
}

/** 비트맵: [1,0,1] → '1 0 1'. on 인 칸만 색을 입힐 수 있다. */
export function bits(arr, { tone = null, sep = ' ' } = {}) {
  const parts = [];
  arr.forEach((b, i) => {
    if (i) parts.push(sep);
    parts.push(tone && b ? c(tone, '1') : b ? '1' : c('d', '0'));
  });
  return parts;
}

/** 막대: value/max 를 n 칸으로. */
export function bar(value, max, n = 20, { tone = null, fill = '█', rest = '░' } = {}) {
  const k = max > 0 ? Math.round((value / max) * n) : 0;
  const on = fill.repeat(Math.max(0, Math.min(n, k)));
  const off = rest.repeat(Math.max(0, n - on.length));
  return [tone ? c(tone, on) : on, c('d', off)];
}

/** 숫자에 천 단위 쉼표. */
export const num = (n) => Number(n).toLocaleString('en-US');
