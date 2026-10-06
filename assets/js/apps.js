/*
 * 앱 목록
 *
 * 창의 종류(data-window)가 어느 앱의 것인지, 그 앱의 이름, 아이콘, Dock 단추가
 * 무엇인지 한데 적어 둔다. 메뉴 막대(앞에 선 앱 이름), 앱 전환기(⌥Tab),
 * Spotlight 의 앱 찾기, 최소화한 창의 미리보기가 모두 여기를 본다.
 * 설정(site.js) 말고는 다른 모듈을 가져오지 않는다(누구나 가져다 쓰게).
 */
import { SITE } from './site.js';

const base = '/assets/images/';
const { album } = SITE.music;

/** 캘린더 앱 아이콘: 흰 둥근 판 위에 빨간 요일, 큰 날짜(SVG 를 data: 주소로). */
export function calendarIcon(d) {
  const dow = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
    <rect x="8" y="8" width="112" height="112" rx="26" fill="#fff"/>
    <rect x="8.5" y="8.5" width="111" height="111" rx="25.5" fill="none" stroke="#000" stroke-opacity=".12"/>
    <text x="64" y="41" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="19" font-weight="600" fill="#ff3b30">${dow}</text>
    <text x="64" y="100" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="62" font-weight="300" fill="#1d1d1f">${d.getDate()}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const APPS = {
  finder: {
    name: 'Finder',
    icon: `${base}dock/finder-128.png`,
    dock: '[data-dock-finder]',
    windows: ['finder', 'info'],
    about: 'Browse the post list and the desktop.',
    keywords: 'finder 파인더 글 목록 파일 posts files',
  },
  preview: {
    name: 'Preview',
    icon: `${base}dock/preview-128.png`,
    windows: ['doc'],
    about: 'Read a single post in a document window.',
    keywords: 'preview 미리보기 문서 document',
  },
  system: {
    name: 'About This Mac',
    icon: `${base}dock/finder-128.png`,
    windows: ['about'],
    about: 'About this blog and the person who writes it.',
    keywords: 'about 소개 정보 this mac info',
  },
  obsidian: {
    name: 'Obsidian',
    icon: `${base}dock/obsidian-128.png`,
    dock: '[data-dock-obsidian]',
    windows: ['obsidian'],
    about: 'Read posts like notes in a vault.',
    keywords: 'obsidian 옵시디언 노트 notes vault',
  },
  mail: {
    name: 'Mail',
    icon: `${base}dock/mail-128.png`,
    dock: '[data-dock-mail]',
    windows: ['mail', 'compose'],
    about: 'Write to the person behind this blog.',
    keywords: 'mail 메일 email 이메일 contact 연락',
  },
  notes: {
    name: 'Notes',
    icon: `${base}dock/notes-128.png`,
    dock: '[data-dock-notes]',
    windows: ['notes'],
    about: 'A pinned note (about me) and notes from visitors.',
    keywords: 'notes 메모 노트 memo',
  },
  terminal: {
    name: 'Terminal',
    icon: `${base}dock/terminal-128.png`,
    dock: '[data-dock-terminal]',
    windows: ['terminal'],
    about: 'Explore the blog as a tiny file system.',
    keywords: 'terminal 터미널 셸 shell zsh',
  },
  games: {
    name: 'Games',
    icon: `${base}dock/games-128.png`,
    dock: '[data-dock-games]',
    windows: ['games'],
    about: 'A collection of personal projects.',
    keywords: 'games 게임 프로젝트 projects',
  },
  music: {
    name: 'Spotify',
    icon: `${base}dock/spotify-128.png`,
    dock: '[data-dock-music]',
    windows: ['music'],
    // 앨범은 _data/music.yml
    about: album.title && album.artist ? `Plays ${album.title}, the album by ${album.artist}.` : 'Plays an album from YouTube.',
    keywords: 'spotify 스포티파이 음악 music 노래',
  },
  settings: {
    name: 'System Settings',
    icon: `${base}dock/settings-128.png`,
    dock: '[data-dock-settings]',
    windows: ['settings'],
    about: 'Appearance, wallpaper, Dock and other settings.',
    keywords: 'settings 설정 system preferences 환경설정 wallpaper 배경화면 appearance 화면 모드 dock',
  },
  calendar: {
    name: 'Calendar',
    // 맥의 캘린더 아이콘처럼 오늘의 요일과 날짜가 찍힌다.
    get icon() {
      return calendarIcon(new Date());
    },
    windows: ['calendar'],
    about: 'Shows posts as events on the days they were written.',
    keywords: 'calendar 캘린더 달력 일정 schedule events',
  },
  druid: {
    name: 'Apache Druid',
    icon: `${base}apps/apache-druid.svg`,
    windows: ['druid'],
    about: 'An illustrated look at how Apache Druid works.',
    keywords: 'druid 드루이드 apache 아파치',
  },
};

// _config.yml 의 desktop.druid 가 false 면 Apache Druid 를 목록에서 뺀다.
// Spotlight · 앱 전환기 · Dock 의 임시 칸이 모두 이 목록을 보므로 여기 한 곳에서.
if (!SITE.desktop.druid) delete APPS.druid;

/** 창 → 앱 이름(키). 모르는 창은 Finder 로 친다. */
export function appOf(win) {
  const type = win?.dataset?.window;
  for (const [key, app] of Object.entries(APPS)) if (app.windows.includes(type)) return key;
  return 'finder';
}
