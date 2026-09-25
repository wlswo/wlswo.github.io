/*
 * 음악: Dock 의 Spotify 를 누르면 뜨는 유리 뮤직 플레이어 창
 *
 * SZA 의 앨범 SOS(23곡)를 처음부터 끝까지 튼다. 소리는 유튜브의 앨범 재생목록을
 * 유튜브 공식 임베드 플레이어(IFrame Player API)로 받는다. 창에는 앨범 그림과
 * 곡 이름 · 진행 막대 · 조작 · 음량만 보인다. 유튜브 영상은 앨범 그림 밑에
 * 같은 크기로 깔아 두고(작게 줄이거나 display: none 으로 치우면 재생이 멈추는
 * 브라우저가 있다) 그림으로 덮는다. 곡이 끝나면 다음 곡으로, 재생할 수 없는
 * 곡은 건너뛴다.
 *
 * 유튜브의 임베드 정책은 플레이어가 보이게 두기를 요구한다. 영상을 가리는 것은
 * 사이트 주인의 선택이다(가리지 않으려면 .music__cover 를 치우면 된다).
 *
 *   https://www.youtube.com/playlist?list=PLf7ytxKzTZxvXeAH2MPmZO54Ej47Ol0Nc
 *
 * 창을 닫으면 음악도 멈춘다(최소화하면 계속 나온다).
 */
import { setupWindow, focusWindow, closeWindow, setCloser, openWindow, flyTo } from './windows.js';

const $ = (sel, root = document) => root.querySelector(sel);

const ALBUM = {
  title: 'SOS',
  artist: 'SZA',
  year: 2022,
  art: 'https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/bd/3b/a9/bd3ba9fb-9609-144f-bcfe-ead67b5f6ab3/196589564931.jpg/600x600bb.jpg',
};

// [유튜브 영상 id, 곡 이름, 함께한 사람]
const TRACKS = [
  ['WxflcXmtVTM', 'SOS'],
  ['SQnc1QibapQ', 'Kill Bill'],
  ['SB0GxBSFUJk', 'Seek & Destroy'],
  ['Z-T_O_vl-8Y', 'Low'],
  ['npu0F7n4M9Y', 'Love Language'],
  ['RwFflrGOsv8', 'Blind'],
  ['Yd0IYrgrss4', 'Used', 'Don Toliver'],
  ['Sv5yCzPCkv8', 'Snooze'],
  ['d5HnmWR8JIQ', 'Notice Me'],
  ['rA6DIHIg5To', 'Gone Girl'],
  ['0pWcpuyYrRk', 'Smoking on my Ex Pack'],
  ['s8EU5Sm9GQY', 'Ghost in the Machine', 'Phoebe Bridgers'],
  ['h-oGPR9jHtk', 'F2F'],
  ['7frfkBdV0-w', 'Nobody Gets Me'],
  ['MgGdikddX_g', 'Conceited'],
  ['2B-G_jB0Wzo', 'Special'],
  ['w_6Ds6hr01M', 'Too Late'],
  ['lyNbWD07o1Q', 'Far'],
  ['hdFDrjfW548', 'Shirt'],
  ['JLd09jmEAYA', 'Open Arms', 'Travis Scott'],
  ['iwyAxyE2Ajg', 'I Hate U'],
  ['0BdlKkvjEgA', 'Good Days'],
  ['2ing0GBYUws', 'Forgiveless', "Ol' Dirty Bastard"],
].map(([id, title, feat]) => ({ id, title, feat }));

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8A.8.8 0 0 0 8 5.2z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="5.5" width="2.4" height="13" rx="1"/><path d="M19.5 6.4v11.2a.8.8 0 0 1-1.2.7L9.4 12.7a.8.8 0 0 1 0-1.4l8.9-5.6a.8.8 0 0 1 1.2.7z"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="17.1" y="5.5" width="2.4" height="13" rx="1"/><path d="M4.5 6.4v11.2a.8.8 0 0 0 1.2.7l8.9-5.6a.8.8 0 0 0 0-1.4L5.7 5.7a.8.8 0 0 0-1.2.7z"/></svg>',
  volume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  close: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg>',
};

const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

let win = null;
let dockButton = null;
let player = null;
let ready = false;
let index = 0;
let playing = false;
let tick = 0;
let pending = null; // 플레이어가 준비되기 전에 누른 것

// ── 유튜브 IFrame Player API ────────────────────────────────────
let api = null;
function loadApi() {
  if (window.YT?.Player) return Promise.resolve();
  api ??= new Promise((resolve, reject) => {
    const before = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      before?.();
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      api = null;
      reject(new Error('youtube'));
    };
    document.head.append(s);
  });
  return api;
}

// ── 창 ──────────────────────────────────────────────────────────
const traffic = `
  <div class="traffic" role="group" aria-label="창 조작">
    <button class="traffic__btn traffic__btn--close" type="button" data-window-action="close" aria-label="닫기"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-close"/></svg></button>
    <button class="traffic__btn traffic__btn--min" type="button" data-window-action="minimize" aria-label="최소화"><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-minus"/></svg></button>
    <button class="traffic__btn traffic__btn--zoom" type="button" aria-label="확대" disabled><svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-zoom"/></svg></button>
  </div>`;

function build() {
  const el = document.createElement('section');
  el.className = 'window music';
  el.dataset.window = 'music';
  el.dataset.dynamic = '';
  el.tabIndex = -1;
  el.setAttribute('aria-labelledby', 'music-title');
  el.innerHTML = `
    <header class="music__bar" data-window-drag>
      ${traffic}
      <h2 class="music__app" id="music-title">Spotify</h2>
      <button class="music__close" type="button" data-window-action="close" aria-label="음악 창 닫기">${ICON.close}</button>
    </header>
    <div class="music__main">
      <div class="music__art">
        <div class="music__video" aria-hidden="true"><div data-music-player></div></div>
        <img class="music__cover" src="${ALBUM.art}" alt="${ALBUM.artist} — ${ALBUM.title} 앨범 표지" width="600" height="600" draggable="false">
      </div>
      <div class="music__now">
        <div class="music__meta">
          <p class="music__title" data-music-title></p>
          <p class="music__artist" data-music-artist></p>
          <p class="music__count" data-music-count></p>
        </div>
        <div class="music__progress">
          <input class="music__seek" type="range" min="0" max="1" step="0.5" value="0" aria-label="재생 위치" data-music-seek>
          <div class="music__times"><span data-music-now>0:00</span><span data-music-dur>0:00</span></div>
        </div>
        <div class="music__controls">
          <button class="music__btn" type="button" data-music-prev aria-label="이전 곡">${ICON.prev}</button>
          <button class="music__btn music__btn--play" type="button" data-music-play aria-label="재생">${ICON.play}</button>
          <button class="music__btn" type="button" data-music-next aria-label="다음 곡">${ICON.next}</button>
        </div>
        <label class="music__volume">
          ${ICON.volume}
          <input class="music__seek" type="range" min="0" max="100" step="1" value="80" aria-label="음량" data-music-volume>
        </label>
        <p class="music__status" data-music-status role="status"></p>
      </div>
    </div>`;
  return el;
}

// ── 그리기 ──────────────────────────────────────────────────────
function paintTrack() {
  if (!win) return;
  const t = TRACKS[index];
  $('[data-music-title]', win).textContent = t.title;
  $('[data-music-artist]', win).textContent = `${ALBUM.artist}${t.feat ? `, ${t.feat}` : ''} — ${ALBUM.title}`;
  $('[data-music-count]', win).textContent = `${index + 1} / ${TRACKS.length}`;
}

function paintState() {
  if (!win) return;
  const btn = $('[data-music-play]', win);
  btn.innerHTML = playing ? ICON.pause : ICON.play;
  btn.setAttribute('aria-label', playing ? '일시 정지' : '재생');
  win.classList.toggle('is-playing', playing);
}

function paintTime() {
  if (!win || !ready) return;
  const now = player.getCurrentTime?.() || 0;
  const dur = player.getDuration?.() || 0;
  const seek = $('[data-music-seek]', win);
  seek.max = String(Math.max(1, dur));
  if (!seek.matches(':active')) seek.value = String(now);
  seek.style.setProperty('--p', `${dur ? (now / dur) * 100 : 0}%`);
  $('[data-music-now]', win).textContent = fmt(now);
  $('[data-music-dur]', win).textContent = fmt(dur);
}

// ── 조작 ────────────────────────────────────────────────────────
function play(i = index) {
  index = (i + TRACKS.length) % TRACKS.length;
  paintTrack();
  if (!ready) {
    pending = { play: index };
    return;
  }
  player.loadVideoById(TRACKS[index].id);
}

function toggle() {
  if (!ready) {
    pending = { play: index };
    return;
  }
  if (playing) player.pauseVideo();
  else if (player.getVideoData?.().video_id === TRACKS[index].id) player.playVideo();
  else play(index);
}

function onState(e) {
  const S = window.YT.PlayerState;
  playing = e.data === S.PLAYING || e.data === S.BUFFERING;
  paintState();
  if (e.data === S.ENDED) play(index + 1);
  clearInterval(tick);
  if (playing) tick = setInterval(paintTime, 250);
  paintTime();
}

// 재생할 수 없는 곡(삭제 · 임베드 막힘)은 건너뛴다. 그런데 여러 곡이 잇달아
// 막히면 곡이 아니라 이 주소가 막힌 것이다(유튜브는 127.0.0.1 같은 주소에서
// 음반사 영상을 틀지 않는다). 그때는 건너뛰기를 멈추고 알려 준다.
let skipped = 0;
function onError() {
  if (++skipped >= 3) {
    skipped = 0;
    const note = win && $('[data-music-status]', win);
    if (note) note.textContent = '이 주소에서는 재생이 막혔습니다. wlswo.me 나 localhost 에서 열어 주세요.';
    return;
  }
  play(index + 1);
}

async function startPlayer() {
  try {
    await loadApi();
  } catch {
    $('[data-music-status]', win).textContent = '플레이어를 불러오지 못했습니다';
    return;
  }
  if (!win) return;
  const self = win;
  player = new window.YT.Player($('[data-music-player]', win), {
    width: '100%',
    height: '100%',
    videoId: TRACKS[index].id,
    playerVars: { playsinline: 1, rel: 0, controls: 0, disablekb: 1, iv_load_policy: 3 },
    events: {
      onReady() {
        if (self !== win) return;
        ready = true;
        player.setVolume(Number($('[data-music-volume]', win).value));
        paintTime();
        if (pending) {
          const { play: i } = pending;
          pending = null;
          play(i);
        }
      },
      onStateChange(e) {
        if (e.data === window.YT.PlayerState.PLAYING) skipped = 0;
        onState(e);
      },
      onError,
    },
  });
}

function teardown() {
  clearInterval(tick);
  try {
    player?.destroy();
  } catch {}
  player = null;
  ready = false;
  playing = false;
  pending = null;
}

export async function openMusic(button) {
  dockButton = button || dockButton;
  if (win?.isConnected) {
    await openWindow(win);
    focusWindow(win);
    return win;
  }

  win = build();
  $('#workspace').append(win);
  setupWindow(win);
  setCloser(win, (w) => {
    teardown();
    closeWindow(w, { remove: true });
    dockButton?.classList.remove('is-running');
    win = null;
  });
  dockButton?.classList.add('is-running');
  focusWindow(win);
  if (dockButton) flyTo(win, dockButton.getBoundingClientRect(), true);
  paintTrack();
  paintState();

  win.addEventListener('click', (e) => {
    if (e.target.closest('[data-music-play]')) return toggle();
    if (e.target.closest('[data-music-next]')) return play(index + 1);
    if (e.target.closest('[data-music-prev]')) {
      // 맥처럼: 3초 넘게 들었으면 처음으로, 아니면 이전 곡
      if (ready && player.getCurrentTime() > 3) player.seekTo(0, true);
      else play(index - 1);
    }
  });
  $('[data-music-seek]', win).addEventListener('input', (e) => {
    if (!ready) return;
    player.seekTo(Number(e.target.value), true);
    paintTime();
  });
  $('[data-music-volume]', win).addEventListener('input', (e) => {
    e.target.style.setProperty('--p', `${e.target.value}%`);
    if (ready) player.setVolume(Number(e.target.value));
  });
  $('[data-music-volume]', win).style.setProperty('--p', '80%');

  startPlayer();
  return win;
}
