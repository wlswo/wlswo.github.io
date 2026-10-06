/*
 * 터미널: 맥의 기본 터미널(zsh)
 *
 * 이 블로그를 작은 파일 시스템으로 보여 준다.
 *
 *   ~/Applications   Dock 의 앱들            open 으로 연다
 *   ~/Desktop        about.txt               cat 으로 읽는다
 *                    ApacheDruid.app         open 으로 Druid 창을 연다(desktop.druid 가 false 면 없다)
 *   ~/Obsidian/<태그>/<글>.md                cat 은 요약, open 은 글 창
 *   ~/Projects       개인 프로젝트            open 은 새 탭
 *
 * 사용자 이름과 컴퓨터 이름은 _config.yml 의 desktop.username · hostname 이다.
 *
 * 명령은 help 로 본다. ↑↓ 로 지난 명령, Tab 으로 명령 · 경로 채우기(빈 줄에서는
 * 보통 Tab 이라 초점이 창 밖으로 나간다),
 * ⌃L 로 화면 지우기, ⌃C 로 줄 버리기. exit 로 창을 닫는다.
 */
import { setupWindow, focusWindow, closeWindow, setCloser, openWindow, flyTo } from './windows.js';
import { loadPosts } from './posts.js';
import { getAppearance, setAppearance } from './theme.js';
import { SITE } from './site.js';

const $ = (sel, root = document) => root.querySelector(sel);

const USER = SITE.desktop.username;
const HOST = SITE.desktop.hostname;
const HOME = `/Users/${USER}`;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let win = null;
let dockButton = null;
let out = null;
let input = null;
let cwd = HOME;
let fs = null; // 경로 → { dir: true, children: Set } | { file: ... }
const history = [];
let hIndex = 0;

function projects() {
  try {
    return JSON.parse($('#projects-data')?.textContent || '[]') || [];
  } catch {
    return [];
  }
}

// ── 파일 시스템 ─────────────────────────────────────────────────
const APPS = {
  Finder: '[data-dock-finder]',
  Obsidian: '[data-dock-obsidian]',
  Notes: '[data-dock-notes]',
  Terminal: '[data-dock-terminal]',
  Games: '[data-dock-games]',
  Spotify: '[data-dock-music]',
};

async function buildFs() {
  const nodes = new Map();
  const dir = (path) => {
    if (!nodes.has(path)) {
      nodes.set(path, { dir: true, children: new Set() });
      if (path !== '/') {
        const parent = path.slice(0, path.lastIndexOf('/')) || '/';
        dir(parent).children.add(path.slice(path.lastIndexOf('/') + 1));
      }
    }
    return nodes.get(path);
  };
  const file = (path, data) => {
    nodes.set(path, { file: true, ...data });
    dir(path.slice(0, path.lastIndexOf('/'))).children.add(path.slice(path.lastIndexOf('/') + 1));
  };

  dir(HOME);
  for (const [name, sel] of Object.entries(APPS)) file(`${HOME}/Applications/${name}.app`, { app: sel });
  file(`${HOME}/Desktop/about.txt`, { about: true });
  if (SITE.desktop.druid) file(`${HOME}/Desktop/ApacheDruid.app`, { druid: true });
  for (const p of projects()) file(`${HOME}/Projects/${p.name}`, { url: p.url, desc: p.desc });

  let posts = [];
  try {
    posts = await loadPosts();
  } catch {}
  for (const p of posts) {
    const name = decodeURIComponent(p.url.split('/').filter(Boolean).pop() || 'post');
    file(`${HOME}/Obsidian/${p.slug || 'misc'}/${name}.md`, { post: p });
  }
  if (!posts.length) dir(`${HOME}/Obsidian`);
  return nodes;
}

function resolve(path = '') {
  if (!path || path === '~') return HOME;
  let base = path.startsWith('/') ? '' : cwd;
  if (path.startsWith('~/')) {
    base = HOME;
    path = path.slice(2);
  }
  const parts = `${base}/${path}`.split('/');
  const stack = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return `/${stack.join('/')}`;
}

const pretty = (path) => (path === HOME ? '~' : path.startsWith(`${HOME}/`) ? `~${path.slice(HOME.length)}` : path);
const baseName = (path) => (path === HOME ? '~' : path.slice(path.lastIndexOf('/') + 1) || '/');

// 맥의 date · Last login 꼴: 'Tue Oct  6 13:56:06'(날은 두 칸에 맞춘다)
function stamp(d) {
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  const mon = d.toLocaleDateString('en-US', { month: 'short' });
  return `${wd} ${mon} ${String(d.getDate()).padStart(2, ' ')} ${d.toTimeString().slice(0, 8)}`;
}

// 시간대 약자. en-US 는 서울을 'GMT+9' 로 적으니 맥처럼 KST 로.
function zone(d) {
  if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Seoul') return 'KST';
  const part = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName');
  return part?.value || 'UTC';
}

// ── 출력 ────────────────────────────────────────────────────────
function print(html = '', cls = '') {
  const line = document.createElement('div');
  line.className = `term__line${cls ? ` ${cls}` : ''}`;
  line.innerHTML = html || '&nbsp;';
  out.append(line);
}
const printText = (text, cls) => String(text).split('\n').forEach((l) => print(esc(l), cls));
const prompt = () => `<span class="term__prompt">${esc(USER)}@${esc(HOST)} ${esc(baseName(cwd))} %</span>`;

function scrollDown() {
  const body = $('.term__body', win);
  body.scrollTop = body.scrollHeight;
}

// ── 명령 ────────────────────────────────────────────────────────
const COMMANDS = {
  help: {
    about: 'Show this list',
    run() {
      print('<b>Available commands:</b>');
      for (const [name, c] of Object.entries(COMMANDS)) print(`  <span class="term__cmd">${name.padEnd(9)}</span>${esc(c.about)}`);
      print('');
      print('Examples: <span class="term__cmd">ls Obsidian</span> · <span class="term__cmd">cat Desktop/about.txt</span> · <span class="term__cmd">open -a Spotify</span> · <span class="term__cmd">search redis</span>');
    },
  },
  ls: {
    about: 'List directory contents (ls -l for details)',
    run(args) {
      const long = args.some((a) => a.startsWith('-') && a.includes('l'));
      const target = resolve(args.find((a) => !a.startsWith('-')) || '.');
      const node = fs.get(target);
      if (!node) return printText(`ls: ${args.find((a) => !a.startsWith('-'))}: No such file or directory`, 'term__err');
      if (node.file) return print(esc(baseName(target)));
      const names = [...node.children].sort((a, b) => a.localeCompare(b, 'ko'));
      if (!names.length) return;
      const show = (n) => {
        const child = fs.get(`${target === '/' ? '' : target}/${n}`);
        return child?.dir ? `<span class="term__dir">${esc(n)}/</span>` : child?.app ? `<span class="term__app">${esc(n)}</span>` : esc(n);
      };
      if (long) {
        for (const n of names) {
          const child = fs.get(`${target}/${n}`);
          const kind = child?.dir ? 'drwxr-xr-x' : '-rw-r--r--';
          const date = child?.post?.date ? child.post.date.replace(/\./g, '-') : '2026-09-25';
          print(`${kind}  ${esc(USER)}  staff  ${date}  ${show(n)}`);
        }
      } else {
        print(names.map(show).join('   '));
      }
    },
  },
  ll: {
    about: 'Same as ls -l',
    run: (args) => COMMANDS.ls.run(['-l', ...args]),
  },
  cd: {
    about: 'Change directory (cd .. · cd ~)',
    run(args) {
      const target = resolve(args[0] || '~');
      const node = fs.get(target);
      if (!node) return printText(`cd: no such file or directory: ${args[0]}`, 'term__err');
      if (!node.dir) return printText(`cd: not a directory: ${args[0]}`, 'term__err');
      cwd = target;
    },
  },
  pwd: { about: 'Print working directory', run: () => print(esc(cwd)) },
  cat: {
    about: 'Print a file (about.txt, post .md)',
    run(args) {
      if (!args[0]) return printText('usage: cat file ...', 'term__err');
      const target = resolve(args[0]);
      const node = fs.get(target);
      if (!node) return printText(`cat: ${args[0]}: No such file or directory`, 'term__err');
      if (node.dir) return printText(`cat: ${args[0]}: Is a directory`, 'term__err');
      if (node.about) {
        const s = SITE;
        const fill = (t) => String(t).replace('{posts}', s.posts ?? '').replace('{latest}', s.latest ?? '');
        print(`<b>${esc(s.about?.title || 'about me')}</b>`);
        for (const b of s.about?.bullets || []) print(`  • ${esc(fill(b))}`);
        return;
      }
      if (node.post) {
        const p = node.post;
        print(`<b># ${esc(p.title)}</b>`);
        print(`<span class="term__dim">${esc(p.date)} · ${esc(p.category || '')}</span>`);
        if (p.description) printText(p.description);
        print(`<span class="term__dim">→ open ${esc(args[0])} to read the full post</span>`);
        return;
      }
      if (node.url) return printText(`${node.desc || ''}\n${node.url}`);
      if (node.app || node.druid) {
        printText(`cat: ${args[0]}: Is a directory`, 'term__err');
        print(`<span class="term__dim">→ open ${esc(args[0])} to launch it</span>`);
      }
    },
  },
  open: {
    about: 'Open a post, app or URL (open -a <app>)',
    run(args) {
      const a = args.indexOf('-a');
      if (a >= 0) {
        const name = args.slice(a + 1).join(' ');
        const key = Object.keys(APPS).find((k) => k.toLowerCase() === name.toLowerCase());
        if (!key && SITE.desktop.druid && /druid/i.test(name)) return dispatchEvent(new CustomEvent('ephemeris:druid'));
        if (!key) return printText(`Unable to find application named '${name}'`, 'term__err');
        $(APPS[key])?.click();
        return;
      }
      if (!args[0]) return printText('Usage: open [-a <application>] [filenames | URL]', 'term__err');
      if (/^https?:\/\//.test(args[0])) {
        window.open(args[0], '_blank', 'noopener');
        return;
      }
      const node = fs.get(resolve(args[0]));
      if (!node) return printText(`The file ${resolve(args[0])} does not exist.`, 'term__err');
      if (node.dir) {
        if (resolve(args[0]).startsWith(`${HOME}/Obsidian`)) $(APPS.Obsidian)?.click();
        else $(APPS.Finder)?.click();
        return;
      }
      if (node.app) return $(node.app)?.click();
      if (node.druid) return dispatchEvent(new CustomEvent('ephemeris:druid'));
      if (node.url) return window.open(node.url, '_blank', 'noopener');
      if (node.about) return $(APPS.Notes)?.click();
      if (node.post) {
        const ev = new CustomEvent('ephemeris:open', { detail: { href: node.post.url }, cancelable: true });
        if (dispatchEvent(ev)) location.href = node.post.url;
      }
    },
  },
  search: {
    about: 'Search posts by title and description',
    run(args) {
      const q = args.join(' ').toLowerCase();
      if (!q) return printText('usage: search <words>', 'term__err');
      const hits = [...fs.entries()].filter(([, n]) => n.post && `${n.post.title} ${n.post.description}`.toLowerCase().includes(q));
      if (!hits.length) return printText(`No posts match '${q}'`, 'term__dim');
      for (const [path, n] of hits) print(`${esc(n.post.title)}  <span class="term__dim">${esc(pretty(path))}</span>`);
    },
  },
  posts: {
    about: 'Recent posts (posts 5)',
    run(args) {
      const n = Math.max(1, Math.min(50, Number(args[0]) || 5));
      const all = [...fs.values()].filter((x) => x.post).map((x) => x.post);
      all.sort((a, b) => (a.date < b.date ? 1 : -1));
      for (const p of all.slice(0, n)) print(`<span class="term__dim">${esc(p.date)}</span>  ${esc(p.title)}`);
    },
  },
  tags: {
    about: 'Tags (categories) and post counts',
    run() {
      const count = new Map();
      for (const x of fs.values()) if (x.post) count.set(x.post.category, (count.get(x.post.category) || 0) + 1);
      for (const [name, c] of count) print(`${esc(name)}  <span class="term__dim">${c}</span>`);
    },
  },
  echo: { about: 'Print text', run: (args) => printText(args.join(' ')) },
  date: {
    about: 'Show the date and time',
    run() {
      const d = new Date();
      printText(`${stamp(d)} ${zone(d)} ${d.getFullYear()}`);
    },
  },
  whoami: { about: 'Print user name', run: () => printText(USER) },
  hostname: { about: 'Print computer name', run: () => printText(HOST) },
  uname: {
    // 커널 판 이름과 neofetch 의 macOS 이름 자리에는 블로그 이름(_config.yml 의 title)이 선다.
    about: 'System information (uname -a)',
    run: (args) => printText(args.includes('-a') ? `Darwin ${HOST} 26.0.0 Darwin Kernel Version 26.0.0: ${SITE.title || HOST}; root:xnu arm64` : 'Darwin'),
  },
  neofetch: {
    about: 'About This Mac',
    run() {
      const s = SITE;
      const logo = ['       .:\'', '    __ :\'__', ' .\'`__`-\'__``.', ':__________.-\'', ':_________:', ' :_________`-;', '  `.__.-.__.\''];
      const info = [
        `<b>${esc(USER)}@${esc(HOST)}</b>`,
        '-----------------',
        `<b>OS</b>: macOS ${esc(s.title || HOST)}`,
        `<b>Host</b>: ${esc(s.host)}`,
        `<b>Shell</b>: zsh 5.9`,
        `<b>Posts</b>: ${esc(s.posts ?? '?')}`,
        `<b>Latest</b>: ${esc(s.latest ?? '')}`,
      ];
      for (let i = 0; i < Math.max(logo.length, info.length); i++) {
        print(`<span class="term__logo">${esc((logo[i] || '').padEnd(16))}</span>${info[i] || ''}`);
      }
    },
  },
  theme: {
    about: 'Change appearance (theme auto|light|dark)',
    run(args) {
      if (!args[0]) return print(`Appearance: ${getAppearance()}`);
      if (!['auto', 'light', 'dark'].includes(args[0])) return printText('usage: theme [auto | light | dark]', 'term__err');
      setAppearance(args[0]);
      print(`Appearance set to ${args[0]}`);
    },
  },
  lock: {
    about: 'Lock Screen',
    async run() {
      const { showLock } = await import('./power.js');
      showLock();
    },
  },
  history: {
    about: 'Command history',
    run: () => history.forEach((h, i) => print(`${String(i + 1).padStart(4)}  ${esc(h)}`)),
  },
  clear: { about: 'Clear the screen (⌃L)', run: () => (out.innerHTML = '') },
  sudo: {
    about: 'Run a command as administrator',
    run: () => printText(`${USER} is not in the sudoers file. This incident will be reported.`, 'term__err'),
  },
  exit: { about: 'Close the window', run: () => $('[data-window-action="close"]', win)?.click() },
};

async function runLine(line) {
  print(`${prompt()} ${esc(line)}`);
  const trimmed = line.trim();
  if (trimmed) {
    history.push(trimmed);
    const [cmd, ...args] = trimmed.split(/\s+/);
    const c = COMMANDS[cmd];
    if (c) {
      try {
        await c.run(args);
      } catch (err) {
        printText(`${cmd}: ${err.message}`, 'term__err');
      }
    } else {
      printText(`zsh: command not found: ${cmd}`, 'term__err');
    }
  }
  hIndex = history.length;
  $('[data-term-prompt]', win).innerHTML = prompt();
  scrollDown();
}

// Tab: 첫 말은 명령, 그다음은 경로를 채운다. 여럿이면 후보를 보여 준다.
function complete() {
  const value = input.value;
  const parts = value.split(/\s+/);
  const last = parts.at(-1);
  let options;
  let prefix;
  if (parts.length === 1) {
    options = Object.keys(COMMANDS).filter((c) => c.startsWith(last));
    prefix = '';
  } else {
    const slash = last.lastIndexOf('/');
    const dirPart = slash >= 0 ? last.slice(0, slash + 1) : '';
    const node = fs.get(resolve(dirPart || '.'));
    if (!node?.dir) return;
    const namePart = last.slice(slash + 1);
    options = [...node.children]
      .filter((n) => n.startsWith(namePart))
      .map((n) => dirPart + n + (fs.get(resolve(dirPart + n))?.dir ? '/' : ''));
    prefix = parts.slice(0, -1).join(' ') + ' ';
  }
  if (options.length === 1) input.value = prefix + options[0] + (parts.length === 1 ? ' ' : '');
  else if (options.length > 1) {
    print(`${prompt()} ${esc(value)}`);
    print(options.map((o) => esc(o)).join('   '));
    scrollDown();
  }
}

// ── 창 ──────────────────────────────────────────────────────────
const traffic = `
  <div class="traffic" role="group" aria-label="Window controls">
    <button class="traffic__btn traffic__btn--close" type="button" data-window-action="close" aria-label="Close"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg></button>
    <button class="traffic__btn traffic__btn--min" type="button" data-window-action="minimize" aria-label="Minimize"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-minus"/></svg></button>
    <button class="traffic__btn traffic__btn--zoom" type="button" data-window-action="zoom" aria-label="Zoom" aria-pressed="false"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-zoom"/></svg></button>
  </div>`;

function build() {
  const el = document.createElement('section');
  el.className = 'window term';
  el.dataset.window = 'terminal';
  el.dataset.dynamic = '';
  el.tabIndex = -1;
  el.setAttribute('aria-labelledby', 'term-title');
  el.innerHTML = `
    <header class="term__bar" data-window-drag>
      ${traffic}
      <h2 class="term__title" id="term-title">${esc(USER)} — -zsh — 80×24</h2>
      <button class="term__close" type="button" data-window-action="close" aria-label="Close Terminal"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg></button>
    </header>
    <div class="term__body" data-term-body>
      <div class="term__out" data-term-out role="log" aria-live="polite"></div>
      <label class="term__row">
        <span data-term-prompt></span>
        <input class="term__input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Command input" data-term-input>
      </label>
    </div>`;
  return el;
}

// 메뉴 막대의 셸 > 화면 지우기(⌃L 과 같다)
addEventListener('ephemeris:term-clear', () => {
  if (out) out.innerHTML = '';
});

export async function openTerminal(button) {
  dockButton = button || dockButton;
  if (win?.isConnected) {
    await openWindow(win);
    focusWindow(win);
    input.focus();
    return win;
  }

  win = build();
  $('#workspace').append(win);
  setupWindow(win);
  setCloser(win, (w) => {
    closeWindow(w, { remove: true });
    dockButton?.classList.remove('is-running');
    win = null;
  });
  dockButton?.classList.add('is-running');
  focusWindow(win);
  if (dockButton) flyTo(win, dockButton.getBoundingClientRect(), true);

  out = $('[data-term-out]', win);
  input = $('[data-term-input]', win);
  cwd = HOME;
  $('[data-term-prompt]', win).innerHTML = prompt();
  print(`<span class="term__dim">Last login: ${esc(stamp(new Date()))} on ttys000</span>`);
  print('<span class="term__dim">Type help to see the available commands.</span>');
  input.focus();

  fs = await buildFs();

  // 창 안 어디를 눌러도 입력 줄로(글자를 고르는 중이면 둔다).
  $('[data-term-body]', win).addEventListener('mouseup', () => {
    if (!getSelection().toString()) input.focus({ preventScroll: true });
  });

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const line = input.value;
      input.value = '';
      await runLine(line);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      hIndex = Math.max(0, Math.min(history.length, hIndex + (e.key === 'ArrowUp' ? -1 : 1)));
      input.value = history[hIndex] ?? '';
    } else if (e.key === 'Tab' && input.value && !e.shiftKey) {
      // 빈 줄에서의 Tab 은 그대로 둔다(키보드로 창 밖에 나갈 수 있게).
      e.preventDefault();
      complete();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      out.innerHTML = '';
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      print(`${prompt()} ${esc(input.value)}^C`);
      input.value = '';
      scrollDown();
    }
  });
  return win;
}
