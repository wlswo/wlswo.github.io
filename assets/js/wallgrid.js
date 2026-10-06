/*
 * 배경화면의 명령어 격자
 *
 * 크기가 제각각인 칸(1칸 · 세로 2 · 세로 3 · 가로 2 · 2×2 · 3×2)으로 화면을 빈틈없이 딱 맞게
 * 채우고, 칸마다 리눅스 명령어 하나를 적는다. 큰 칸에는 그 명령의 출력도 늘 보인다.
 * 오른쪽 위 꼬리표는 몇 번째 칸인지(i/n).
 *
 * 화면 크기로 열 · 줄 수를 정하고 칸들이 남는 폭 · 높이를 나눠 가진다. 창 크기가 바뀌어
 * 열 · 줄 수가 달라지면 다시 짠다.
 * 배경화면(.wallpaper) 안에 있으므로 창 · 폴더 · Dock 보다 늘 아래에 있다.
 *
 * 평소에는 움직이지 않는다. 메뉴 막대의 재생 단추를 누르면 화면에 보이는 칸을 하나씩
 * 무작위로 골라 터미널처럼 명령어를 한 글자씩 치고 → 결과를 찍고 → 새 프롬프트를 띄운다.
 * 정지를 누를 때까지 되풀이한다.
 *
 * 배경화면이 격자일 때만 깔린다: 시스템 설정(settings.js)에서 'Linux Commands' 를 골랐거나,
 * 고른 것이 없고 _config.yml 의 wallpaper_grid 가 true 일 때(desktop.html 이 그때만 불러온다).
 * 설정에서 다른 배경화면으로 바꾸면 setGrid(false) 로 걷는다.
 *
 * 명령 속의 사용자 이름과 블로그 주소는 _config.yml 의 desktop.username · url 이다.
 */
import { SITE } from './site.js';

const wall = document.querySelector('.wallpaper');
const USER = SITE.desktop.username;

const COL = 200; // 칸 폭의 최소. 남는 폭은 칸들이 나눠 가진다
const ROW = 140; // 칸 높이의 최소. 남는 높이도 나눠 가져 화면 아래에 딱 맞춘다
const GAP = 8; // _desktop.scss 의 .wallgrid 와 맞춘다
const PAD = 8;

// 붙여 넣은 Grid Information 의 29칸 무늬를 되풀이한다. [폭, 높이]
const PATTERN = Array.from({ length: 29 }, () => '');
Object.assign(PATTERN, { 0: 'r2', 2: 'big', 9: 'r3', 13: 'c2', 16: 'wide', 24: 'r2' });
const SIZE = { '': [1, 1], r2: [1, 2], r3: [1, 3], c2: [2, 1], big: [2, 2], wide: [3, 2] };
// 자리가 모자라면 이 차례로 줄여 본다(마지막은 늘 들어가는 1칸)
const SHRINK = { wide: ['wide', 'big', 'c2', ''], big: ['big', 'c2', 'r2', ''], r3: ['r3', 'r2', ''], r2: ['r2', ''], c2: ['c2', ''], '': [''] };

// [명령, 설명, 출력] — 작은 칸. 출력은 평소엔 숨겨 두고 재생할 때만 찍는다
const SMALL = [
  ['pwd', 'where am i', `/home/${USER}/blog`],
  ['whoami', 'who am i', USER],
  ['uname -sr', 'kernel info', 'Linux 6.8.0-45-generic'],
  ['uptime', 'how long up', ' 09:24:11 up 42 days, 3:17\n load average: 0.12, 0.08'],
  ['cd -', 'back to last dir', '/var/www/blog'],
  ['ls -1 | wc -l', 'count files', '48'],
  ['mkdir -pv a/b/c', 'make nested dirs', "mkdir: created 'a'\nmkdir: created 'a/b'\nmkdir: created 'a/b/c'"],
  ['cp -rv src/ dst/', 'copy recursively', "'src/app.js' -> 'dst/app.js'\n'src/util.js' -> 'dst/util.js'"],
  ['mv -v old.txt new.txt', 'rename', "renamed 'old.txt' -> 'new.txt'"],
  ['rm -rfv ./build', 'clean build', "removed './build/app.js'\nremoved directory './build'"],
  ['ln -sv /opt/app current', 'symlink', "'current' -> '/opt/app'"],
  ['chmod -v +x deploy.sh', 'make executable', "mode of 'deploy.sh'\nchanged 0644 -> 0755"],
  ['chown -v www:www /srv', 'change owner', "ownership of '/srv'\nchanged to www:www"],
  ['cat /etc/hosts', 'print file', '127.0.0.1  localhost\n::1        localhost\n10.0.0.12  db'],
  ['head -n 3 data.csv', 'first lines', 'id,name,score\n1,kim,92\n2,lee,87'],
  ['wc -l *.md', 'count lines', ' 120 README.md\n  48 CHANGELOG.md\n 168 total'],
  ['grep -rn "TODO" .', 'find todos', './app.js:42: // TODO retry\n./api.js:7: // TODO cache'],
  ["sed -n '1,3p' nginx.conf", 'print lines 1-3', 'user www;\nworker_processes auto;\npid /run/nginx.pid;'],
  ["awk '{print $1}' access.log", 'first column', '203.0.113.7\n198.51.100.23\n203.0.113.7'],
  ['sort ips | uniq -c | sort -nr', 'count + rank', '  42 203.0.113.7\n  17 198.51.100.23\n   3 192.0.2.9'],
  ['cut -d, -f2 data.csv', 'second field', 'name\nkim\nlee'],
  ['seq 3 | xargs -n1 echo hi', 'one per line', 'hi 1\nhi 2\nhi 3'],
  ['find . -name "*.log" -mtime +7', 'old logs', './logs/app-0921.log\n./logs/app-0922.log'],
  ['du -sh * | sort -h', 'what is big', '4.0K README.md\n 12M assets\n 48M node_modules'],
  ['nproc', 'cpu count', '8'],
  ['pgrep -l java', 'find process', '1290 java'],
  ['kill -9 1290; echo $?', 'force stop', '0'],
  ['lsof -i :8080', 'who owns the port', 'COMMAND  PID USER\njava    1290 app'],
  ['nohup ./run.sh &', 'keep running', '[1] 4821\nnohup: ignoring input'],
  ['jobs -l', 'background jobs', '[1]+ 4821 Running\n     nohup ./run.sh &'],
  ['ping -c 2 1.1.1.1', 'is it up', '64 bytes: time=3.1 ms\n64 bytes: time=2.9 ms'],
  [`curl -sI ${SITE.url}`, 'headers only', 'HTTP/2 200\nserver: GitHub.com\ncontent-type: text/html'],
  [`dig +short ${SITE.host}`, 'resolve name', '185.199.108.153\n185.199.109.153'],
  ['nc -zv db 5432', 'port open?', 'Connection to db 5432\nport [tcp] succeeded!'],
  ['ssh ubuntu@host uptime', 'remote shell', ' 09:25:02 up 12 days\n load average: 0.03'],
  ['scp app.jar host:/opt/', 'copy over ssh', 'app.jar  100%  42MB\n11.2MB/s   00:03'],
  ['rsync -avz ./ host:/srv/', 'sync files', 'sending incremental file list\nindex.html\nsent 4,211 bytes'],
  ['tar -czvf backup.tgz ./data', 'archive', './data/\n./data/users.csv\n./data/orders.csv'],
  ['crontab -l', 'scheduled jobs', '0 3 * * * /opt/backup.sh\n*/5 * * * * /opt/health.sh'],
  ['journalctl -u nginx -n 2', 'service log', 'nginx[812]: started\nnginx[812]: reload ok'],
  ['systemctl is-active nginx', 'service up?', 'active'],
  ['sudo !!', 'again, as root', 'sudo systemctl restart nginx'],
  ['history | tail -2', 'what did i run', ' 844  ssh ubuntu@host\n 845  history | tail -2'],
  ['echo $PATH | tr : "\\n"', 'path, one per line', '/usr/local/bin\n/usr/bin\n/bin'],
  ['echo $SHELL', 'which shell', '/bin/zsh'],
  ['date', 'what time', 'Fri Oct  2 09:24:11 KST 2026'],
  ['cal', 'calendar', '    October 2026\nSu Mo Tu We Th Fr Sa\n             1  2  3'],
  ['which java', 'where is it', '/usr/bin/java'],
  ["jq '.items[].name' res.json", 'pick from json', '"api"\n"worker"\n"cron"'],
  ['git status -sb', 'short status', '## main...origin/main\n M _config.yml'],
  ['docker logs --tail 2 api', 'container log', 'INFO Started in 2.31s\nINFO Listening on :8080'],
  ['kubectl get ns', 'namespaces', 'NAME         STATUS\ndefault      Active\nkube-system  Active'],
  ['id', 'user and groups', `uid=1000(${USER})\ngroups=1000(${USER}),27(sudo)`],
  ['hostname -I', 'my addresses', '10.0.0.5 172.17.0.1'],
];

// [명령, 설명, 출력] — 큰 칸. 출력이 늘 보인다
const LARGE = [
  ['ls -alh', 'list everything', `drwxr-xr-x 12 ${USER} staff 384B .
drwxr-xr-x  5 ${USER} staff 160B ..
-rw-r--r--  1 ${USER} staff 1.2K _config.yml
drwxr-xr-x 48 ${USER} staff 1.5K _posts
-rwxr-xr-x  1 ${USER} staff 412B deploy.sh
-rw-r--r--  1 ${USER} staff  86B .gitignore`],
  ['top -bn1 | head -5', 'what is busy', `top - 09:24:11 up 42 days, 3:17
Tasks: 213 total,   1 running
%Cpu(s):  3.1 us,  1.2 sy, 95.4 id
MiB Mem :  7972.0 total,  2204.6 free
MiB Swap:  2048.0 total,  2048.0 free`],
  ['df -h /', 'disk usage', `Filesystem  Size  Used Avail Use%
/dev/sda1    50G   21G   27G  44%`],
  ['ps aux --sort=-%cpu', 'hungry processes', `USER   PID %CPU %MEM COMMAND
app   1290 12.7  9.8 java -jar api.jar
www    812  2.4  1.3 nginx: worker
pg     644  1.1  4.2 postgres: writer
root     1  0.0  0.1 /sbin/init`],
  ['tail -f access.log', 'live traffic', `"GET / HTTP/2.0" 200 5123
"GET /feed.xml HTTP/2.0" 304 0
"GET /assets/css/main.css" 200 48211
"GET /search.json HTTP/2.0" 200 91822
"GET /robots.txt HTTP/2.0" 200 67`],
  ['git log --oneline --graph', 'history', `* 03be4a0 feat: notification center
* bd8ec36 feat: weather widget
* f50b9ea feat: menu bar details
* 1a87916 feat: druid diagrams
* 5558666 feat: desktop layout`],
  ['ss -tulpn', 'listening ports', `Netid State  Local Address:Port
tcp   LISTEN 0.0.0.0:22
tcp   LISTEN 0.0.0.0:443
tcp   LISTEN 127.0.0.1:5432
tcp   LISTEN 127.0.0.1:6379`],
  ['docker ps', 'running containers', `CONTAINER ID  IMAGE        STATUS
3f2a9c1e0b7d  nginx:1.25   Up 3 days
9b8e7d6c5a41  postgres:16  Up 3 days
1c2d3e4f5a6b  redis:7      Up 3 days`],
  ['kubectl get pods', 'pods', `NAME                READY  STATUS
api-7d9f8c-x2kq     1/1    Running
worker-5b6c7d-p9zt  1/1    Running
cron-28466-hw8n     0/1    Completed`],
  ['systemctl status nginx', 'service health', `● nginx.service - web server
   Loaded: loaded (nginx.service)
   Active: active (running) 3 days ago
 Main PID: 812 (nginx)
    Tasks: 3 (limit: 9284)`],
  ['cat /etc/os-release', 'which distro', `PRETTY_NAME="Ubuntu 24.04 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
ID=ubuntu`],
  ['free -m', 'memory in MiB', `       total  used  free  cache
Mem:    7972  3120  2204   2647
Swap:   2047     0  2047`],
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 칸마다 [명령, 출력] — 재생할 때 다시 쳐 보이려고 둔다
let items = [];

// 열 × 줄을 빈틈도 넘침도 없이 채운다. 왼쪽 위부터 빈자리마다 무늬의 다음 칸을 놓고,
// 들어가지 않으면 줄여서 놓는다. 그래서 격자는 늘 화면 아래 끝에서 딱 끝난다.
function build(grid, cols, rows) {
  items = [];
  const taken = new Uint8Array(cols * rows);
  const fits = (x, y, w, h) => {
    if (x + w > cols || y + h > rows) return false;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (taken[x + dx + (y + dy) * cols]) return false;
    return true;
  };
  const cells = [];
  for (let p = 0; p < cols * rows; p++) {
    if (taken[p]) continue;
    const x = p % cols, y = (p / cols) | 0;
    const kind = SHRINK[PATTERN[cells.length % PATTERN.length]].find((k) => fits(x, y, ...SIZE[k]));
    const [w, h] = SIZE[kind];
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) taken[x + dx + (y + dy) * cols] = 1;
    cells.push({ x, y, w, h });
  }

  let small = 0;
  let large = 0;
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  grid.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  grid.innerHTML = cells
    .map(({ x, y, w, h }, i) => {
      const roomy = h > 1; // 세로로 긴 칸에는 출력이 늘 보인다
      const [cmd, note, out] = roomy ? LARGE[large++ % LARGE.length] : SMALL[small++ % SMALL.length];
      items.push([cmd, out]);
      return (
        `<div class="wallgrid__cell" style="grid-area: ${y + 1} / ${x + 1} / span ${h} / span ${w}">` +
        `<span class="wallgrid__i">${i + 1}/${cells.length}</span>` +
        `<code class="wallgrid__cmd"><b>$</b> ${esc(cmd)}</code>` +
        `<span class="wallgrid__note"># ${esc(note)}</span>` +
        `<pre class="wallgrid__out${roomy ? '' : ' wallgrid__out--run'}">${esc(out)}</pre>` +
        `</div>`
      );
    })
    .join('');
}

let stopGrid = null; // 격자를 깔아 두었으면, 걷는 함수

/** 명령어 격자를 깔거나 걷는다. 시스템 설정에서 배경화면을 바꿀 때 부른다. */
export function setGrid(on) {
  if (!wall) return;
  if (on && !stopGrid) stopGrid = start();
  else if (!on && stopGrid) {
    stopGrid();
    stopGrid = null;
  }
}

// 재생 단추. _config.yml 의 wallpaper_grid 면 menubar.html 이 그려 두고,
// 아니면(설정에서 격자를 고르면) 여기서 같은 모양으로 만들어 메뉴 막대 오른쪽 맨 앞에 단다.
function playButton() {
  const found = document.querySelector('[data-wallgrid-play]');
  const bar = document.querySelector('.menubar__right');
  if (found || !bar) return found;
  bar.insertAdjacentHTML(
    'afterbegin',
    `<button class="menubar__item menubar__icon menubar__play" type="button" aria-pressed="false" aria-label="Play Wallpaper Commands" data-wallgrid-play>
      <svg class="icon menubar__play-on" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8.3 6.6v6.8l5.4-3.4z" fill="currentColor" stroke="none"/></svg>
      <svg class="icon menubar__play-off" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="7.2" y="7.2" width="5.6" height="5.6" rx="0.9" fill="currentColor" stroke="none"/></svg>
    </button>`,
  );
  return bar.firstElementChild;
}

function start() {
  const grid = document.createElement('div');
  grid.className = 'wallgrid';
  wall.append(grid);

  let shape = '';
  const fit = () => {
    const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--menubar-h')) || 30;
    const cols = Math.max(1, Math.floor((innerWidth - PAD * 2 + GAP) / (COL + GAP)));
    const rows = Math.max(1, Math.floor((innerHeight - top - PAD * 2 + GAP) / (ROW + GAP)));
    if (`${cols}x${rows}` === shape) return;
    shape = `${cols}x${rows}`;
    build(grid, cols, rows);
  };

  fit();
  let timer = 0;
  const onResize = () => {
    clearTimeout(timer);
    timer = setTimeout(fit, 150);
  };
  addEventListener('resize', onResize);
  // ── 재생 ──────────────────────────────────────────────────────
  const button = playButton();
  let run = 0; // 재생할 때마다 늘린다. 값이 바뀌면 돌던 차례는 그만둔다

  // 기다리는 동안 정지하면 곧바로 false 로 깨운다(칸이 바로 원래대로 돌아오게)
  let wake = null;
  const wait = (ms, id) =>
    new Promise((ok) => {
      const t = setTimeout(() => {
        wake = null;
        ok(id === run);
      }, ms);
      wake = () => {
        clearTimeout(t);
        ok(false);
      };
    });

  // 화면 안에 다 보이고 아무것도(창 · 위젯 · 폴더 · Dock) 덮고 있지 않은 칸.
  // 배경화면은 누를 수 없으니, 칸의 가운데와 네 귀퉁이에서 맨 위가 빈 작업 공간이면 드러난 것이다.
  const workspace = document.getElementById('workspace');
  const bare = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return !el || el === workspace || el === document.body || el === document.documentElement;
  };
  const visible = () =>
    [...grid.children].filter((c) => {
      const r = c.getBoundingClientRect();
      if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) return false;
      const ix = Math.min(12, r.width / 4), iy = Math.min(12, r.height / 4);
      return (
        bare(r.left + r.width / 2, r.top + r.height / 2) &&
        bare(r.left + ix, r.top + iy) &&
        bare(r.right - ix, r.top + iy) &&
        bare(r.left + ix, r.bottom - iy) &&
        bare(r.right - ix, r.bottom - iy)
      );
    });

  // 칸 하나에 명령어를 쳐 보인다. 도중에 정지하면 false. 어떻게 끝나든 칸은 원래대로 돌려 둔다
  async function type(cell, id) {
    const [cmd, out] = items[[...grid.children].indexOf(cell)] || [];
    if (!cmd) return true;
    const code = cell.querySelector('.wallgrid__cmd');
    const pre = cell.querySelector('.wallgrid__out');
    const before = code.innerHTML;
    cell.classList.add('is-typing');
    pre.textContent = '';
    try {
      for (let i = 0; i <= cmd.length; i++) {
        code.innerHTML = `<b>$</b> ${esc(cmd.slice(0, i))}<span class="wallgrid__caret"></span>`;
        if (!(await wait(45 + Math.random() * 90, id))) return false;
      }
      if (!(await wait(380, id))) return false; // 엔터
      code.innerHTML = before;
      cell.classList.add('is-ran');
      // 결과가 한 줄씩 찍히고, 끝나면 다음 명령을 기다리는 프롬프트
      const lines = out.split('\n');
      for (let i = 1; i <= lines.length; i++) {
        pre.textContent = lines.slice(0, i).join('\n');
        if (!(await wait(90 + Math.random() * 80, id))) return false;
      }
      if (!(await wait(200, id))) return false;
      pre.innerHTML = `${esc(out)}\n<b>$</b> <span class="wallgrid__caret"></span>`;
      return await wait(2200, id);
    } finally {
      cell.classList.remove('is-typing', 'is-ran');
      code.innerHTML = before;
      pre.textContent = out;
    }
  }

  async function play(id) {
    let last = null;
    while (id === run) {
      const pool = visible().filter((c) => c !== last);
      if (!pool.length) {
        if (!(await wait(500, id))) return;
        continue;
      }
      last = pool[(Math.random() * pool.length) | 0];
      if (!(await type(last, id))) return;
      if (!(await wait(250, id))) return;
    }
  }

  const onPlay = () => {
    const on = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Stop Wallpaper Commands' : 'Play Wallpaper Commands');
    run++;
    wake?.();
    if (on) play(run);
  };
  button?.addEventListener('click', onPlay);

  // 걷기: 돌던 차례를 멈추고, 단추를 처음 모양으로 돌리고, 격자를 떼어 낸다.
  // 단추는 남겨 둔다 — 다른 배경화면인 동안에는 _settings.scss 가 숨긴다.
  return () => {
    run++;
    wake?.();
    clearTimeout(timer);
    removeEventListener('resize', onResize);
    button?.removeEventListener('click', onPlay);
    button?.setAttribute('aria-pressed', 'false');
    button?.setAttribute('aria-label', 'Play Wallpaper Commands');
    grid.remove();
  };
}

// 처음 불러왔을 때: 고른 배경화면(없으면 _config.yml 의 것)이 격자면 바로 깐다
const chosen = document.documentElement.dataset.wallpaper;
setGrid(chosen ? chosen === 'grid' : wall?.dataset.default === 'grid');
