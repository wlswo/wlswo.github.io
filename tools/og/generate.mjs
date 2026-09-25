#!/usr/bin/env node
/*
 * 공유 썸네일(Open Graph 이미지) 굽기
 *
 *   cd tools/og && npm install && node generate.mjs [--force] [--base http://127.0.0.1:4000]
 *
 * GitHub Pages 는 우리 빌드 단계를 돌려 주지 않으니, 썸네일은 여기서 미리 구워
 * assets/og/ 에 커밋한다. 글 목록은 떠 있는 개발 서버(bundle exec jekyll serve)의
 * /search.json 에서 읽고, 글마다 _card.html 을 그 서버와 같은 주소에 띄워
 * 배경화면과 <thinking-orb> 를 사이트 그대로 불러 1200×630 JPEG 로 찍는다.
 *
 *   assets/og/<og>.jpg   글마다 한 장. <og> 는 search.json 의 og(글 날짜의 유닉스 초)
 *   assets/og/default.jpg 글이 아닌 페이지(홈, About)에 쓰는 사이트 카드
 *
 * 바뀐 것만 다시 굽는다. 각 JPEG 안(주석 구간)에 그림을 만든 재료의 지문을 적어 두고,
 * 제목·설명·날짜·카테고리나 _card.html·배경화면이 바뀌어 지문이 달라진 것만 새로 찍는다.
 * --force 를 주면 전부 다시 찍는다. 지워진 글의 썸네일은 치운다.
 *
 * 서버 주소는 --base 나 OG_BASE 로 바꾼다(기본 http://127.0.0.1:4000).
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'assets/og');
// 밑줄로 시작하는 파일은 Jekyll 이 읽지 않는다(사이트와 사이트맵에 실리지 않게).
const TEMPLATE = path.join(HERE, '_card.html');
// 그림에 그대로 찍히는 사이트 파일. 이것들이 바뀌어도 다시 굽는다.
const LOOK = ['assets/images/wallpaper@2x.webp', 'tools/og/orb/vendor/thinking-orbs/engine.js'];
// 카드의 구체 모양. 사이트에서는 구체를 걷어냈고, 공유 썸네일에만 남았다.
// (구체 코드도 이 도구 안의 orb/ 로 옮겨 왔다.)
const ORBS = {
  database: 'searching',
  network: 'connecting',
  runtime: 'working',
  distributed: 'weaving',
  ops: 'shaping',
  notes: 'composing',
};

const WIDTH = 1200;
const HEIGHT = 630;
const QUALITY = 85;
const SCALE = 2; // 2배로 그려 1배로 줄여 찍는다(글자와 점이 또렷해진다)
const BUDGET = 120 * 1024; // 넘으면 경고만 한다
const STAMP = 'ephemeris-og ';

// ── 인자 ─────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const force = argv.includes('--force');
const baseArg = argv.find((a) => a.startsWith('--base'));
const base = (
  (baseArg?.includes('=') ? baseArg.split('=')[1] : baseArg && argv[argv.indexOf(baseArg) + 1]) ||
  process.env.OG_BASE ||
  'http://127.0.0.1:4000'
).replace(/\/+$/, '');

// ── 사이트 설정: _config.yml 의 맨 윗단 값과 _data/categories.yml ────────
function unquote(v) {
  v = v.trim();
  if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
  return v;
}

async function readConfig() {
  const text = await readFile(path.join(ROOT, '_config.yml'), 'utf8');
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*?)\s*$/);
    if (m && m[2] && !m[2].startsWith('#')) out[m[1]] = unquote(m[2]);
  }
  return out;
}

async function readCategories() {
  const text = await readFile(path.join(ROOT, '_data/categories.yml'), 'utf8');
  const list = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '');
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const m = line.match(/^(\s*-\s*|\s+)([\w-]+):\s*(.*)$/);
    if (!m) continue;
    if (m[1].includes('-')) list.push({});
    if (list.length) list.at(-1)[m[2]] = unquote(m[3]);
  }
  return new Map(list.map((c) => [c.slug, c]));
}

// ── JPEG 주석 구간(COM)에 지문을 적고 읽는다 ──────────────────────
function readStamp(buf) {
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    if (marker === 0xda) break; // 그림 데이터 시작
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xfe) {
      const text = buf.subarray(i + 4, i + 2 + len).toString('latin1');
      if (text.startsWith(STAMP)) return text.slice(STAMP.length);
    }
    i += 2 + len;
  }
  return null;
}

function writeStamp(buf, stamp) {
  const body = Buffer.from(STAMP + stamp, 'latin1');
  const seg = Buffer.alloc(4 + body.length);
  seg.writeUInt16BE(0xfffe, 0);
  seg.writeUInt16BE(body.length + 2, 2);
  body.copy(seg, 4);
  // JFIF(APP0)가 있으면 그 뒤에, 없으면 SOI 바로 뒤에 끼운다.
  let at = 2;
  if (buf[2] === 0xff && buf[3] === 0xe0) at = 4 + buf.readUInt16BE(4);
  return Buffer.concat([buf.subarray(0, at), seg, buf.subarray(at)]);
}

async function existingStamp(file) {
  try {
    return readStamp(await readFile(file));
  } catch {
    return null;
  }
}

// ── 날짜: search.json 의 "2026.07.25" → "2026. 7. 25." ─────────────
function koDate(s) {
  const [y, m, d] = String(s).split('.').map(Number);
  return y && m && d ? `${y}. ${m}. ${d}.` : String(s || '');
}

// ── 본 작업 ──────────────────────────────────────────────────
async function main() {
  const [config, categories, template] = await Promise.all([
    readConfig(),
    readCategories(),
    readFile(TEMPLATE, 'utf8'),
  ]);

  let posts;
  try {
    const res = await fetch(`${base}/search.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    posts = await res.json();
  } catch (err) {
    console.error(`개발 서버(${base})에서 search.json 을 읽지 못했습니다: ${err.message}`);
    console.error('저장소 루트에서 `bundle exec jekyll serve` 를 먼저 띄우세요. 주소가 다르면 --base 로 알려 주세요.');
    process.exit(1);
  }
  if (!Array.isArray(posts) || posts.some((p) => !p.og)) {
    console.error('search.json 의 글마다 og 값이 있어야 합니다. search.json 을 확인하세요.');
    process.exit(1);
  }

  const host = (config.url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const look = createHash('sha256').update(template);
  for (const file of LOOK) look.update(await readFile(path.join(ROOT, file)));
  const lookHash = look.digest('hex');

  const jobs = [
    {
      file: 'default.jpg',
      data: {
        kind: 'site',
        title: config.title || 'Ephemeris',
        description: config.description || '',
        orb: 'listening',
        label: '',
        labelEn: '',
        footLead: config.author || '',
        footTail: '',
        host,
      },
    },
    ...posts.map((p) => {
      const cat = categories.get(p.slug) || {};
      return {
        file: `${p.og}.jpg`,
        data: {
          kind: 'post',
          title: p.title,
          description: p.description || '',
          orb: ORBS[p.slug] || 'listening',
          label: cat.name || p.category || '',
          labelEn: cat.en || '',
          footLead: config.title || 'Ephemeris',
          footTail: koDate(p.date),
          host,
        },
      };
    }),
  ];

  const dupes = jobs.map((j) => j.file).filter((f, i, a) => a.indexOf(f) !== i);
  if (dupes.length) {
    console.error(`같은 이름의 썸네일이 겹칩니다: ${dupes.join(', ')} (날짜·시각이 같은 글이 있는지 확인하세요)`);
    process.exit(1);
  }

  const settings = { WIDTH, HEIGHT, QUALITY, SCALE };
  for (const job of jobs) {
    job.stamp = createHash('sha256')
      .update(JSON.stringify({ lookHash, settings, data: job.data }))
      .digest('hex')
      .slice(0, 16);
    job.path = path.join(OUT, job.file);
  }

  await mkdir(OUT, { recursive: true });
  const todo = [];
  for (const job of jobs) {
    if (force || (await existingStamp(job.path)) !== job.stamp) todo.push(job);
  }

  // 지워진 글의 썸네일 치우기(이 스크립트가 짓는 숫자 이름만)
  const keep = new Set(jobs.map((j) => j.file));
  const stale = (await readdir(OUT)).filter((f) => /^\d+\.jpg$/.test(f) && !keep.has(f));
  for (const f of stale) {
    await unlink(path.join(OUT, f));
    console.log(`치움   assets/og/${f}`);
  }

  if (!todo.length) {
    console.log(`썸네일 ${jobs.length}장 모두 최신입니다. (다시 찍으려면 --force)`);
    return;
  }

  const failed = [];
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome' });
  } catch (err) {
    console.error('Google Chrome 을 띄우지 못했습니다. Chrome 이 설치되어 있는지 확인하세요.');
    throw err;
  }

  try {
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: SCALE,
      colorScheme: 'light',
      locale: 'ko-KR',
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => console.warn(`  (페이지 오류) ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.warn(`  (콘솔) ${msg.text()}`);
    });

    const cardUrl = `${base}/__og__/card.html`;
    await page.route(cardUrl, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: template }),
    );
    // 구체 코드는 사이트에 없고 이 도구 안(orb/)에 있다. 카드 옆 주소로 내어 준다.
    await page.route(`${base}/__og__/orb/**`, async (route) => {
      const rel = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/__og__\//, ''));
      const file = path.join(HERE, rel);
      if (!file.startsWith(path.join(HERE, 'orb') + path.sep)) return route.fulfill({ status: 404 });
      try {
        route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: await readFile(file) });
      } catch {
        route.fulfill({ status: 404 });
      }
    });
    try {
      await page.goto(cardUrl, { waitUntil: 'load' });
      await page.waitForFunction(() => window.cardReady === true, null, { timeout: 15000 });
    } catch (err) {
      console.error(`카드 틀(_card.html)을 띄우지 못했습니다: ${err.message.split('\n')[0]}`);
      process.exitCode = 1;
      return;
    }

    for (const job of todo) {
      let info;
      try {
        info = await page.evaluate((d) => window.renderCard(d), job.data);
      } catch (err) {
        info = { error: err.message.split('\n')[0] };
      }
      // 망가진 그림은 쓰지 않는다. 지문이 남으면 다음에도 최신으로 여겨지기 때문이다.
      const broken = [];
      if (info.error) broken.push(info.error);
      else {
        if (!info.orbInk) broken.push('구체가 그려지지 않음');
        if (!info.fontsOk) broken.push('Pretendard 를 다 받지 못함');
        if (info.overflow) broken.push('글이 카드 밖으로 넘침');
      }
      if (broken.length) {
        failed.push(job.file);
        console.error(`실패   assets/og/${job.file.padEnd(16)}       ${job.data.title}  ✗ ${broken.join(', ')}`);
        continue;
      }

      const shot = await page.screenshot({ type: 'jpeg', quality: QUALITY, scale: 'css' });
      const jpg = writeStamp(shot, job.stamp);
      await writeFile(job.path, jpg);

      const notes = [];
      if (info.fit.clamped) notes.push('제목이 길어 말줄임');
      if (jpg.length > BUDGET) notes.push(`${Math.round(jpg.length / 1024)}KB 로 큼`);
      console.log(
        `구움   assets/og/${job.file.padEnd(16)} ${String(Math.round(jpg.length / 1024)).padStart(3)}KB  ${job.data.title}` +
          (notes.length ? `  ⚠ ${notes.join(', ')}` : ''),
      );
    }
  } finally {
    await browser.close();
  }

  const skipped = jobs.length - todo.length;
  const made = todo.length - failed.length;
  console.log(`${made}장 구움${skipped ? `, ${skipped}장은 그대로` : ''}${failed.length ? `, ${failed.length}장 실패` : ''}.`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
