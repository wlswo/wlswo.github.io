/*
 * 앱 목록
 *
 * 창의 종류(data-window)가 어느 앱의 것인지, 그 앱의 이름, 아이콘, Dock 단추가
 * 무엇인지 한데 적어 둔다. 메뉴 막대(앞에 선 앱 이름), 앱 전환기(⌥Tab),
 * Spotlight 의 앱 찾기, 최소화한 창의 미리보기가 모두 여기를 본다.
 * 다른 모듈을 가져오지 않는다(누구나 가져다 쓰게).
 */
const base = '/assets/images/';

export const APPS = {
  finder: {
    name: 'Finder',
    icon: `${base}dock/finder-128.png`,
    dock: '[data-dock-finder]',
    windows: ['finder', 'info'],
    about: '글 목록과 데스크톱을 둘러보는 앱이에요.',
    keywords: 'finder 파인더 글 목록 파일',
  },
  preview: {
    name: '미리보기',
    icon: `${base}dock/file-txt-128.png`,
    windows: ['doc'],
    about: '글 한 편을 문서 창으로 읽는 앱이에요.',
    keywords: 'preview 미리보기 문서',
  },
  system: {
    name: '이 Mac에 관하여',
    icon: `${base}dock/finder-128.png`,
    windows: ['about'],
    about: '이 블로그와 쓴 사람을 소개해요.',
    keywords: 'about 소개 정보',
  },
  obsidian: {
    name: 'Obsidian',
    icon: `${base}dock/obsidian-128.png`,
    dock: '[data-dock-obsidian]',
    windows: ['obsidian'],
    about: '글을 노트처럼 읽는 앱이에요.',
    keywords: 'obsidian 옵시디언 노트',
  },
  notes: {
    name: '메모',
    icon: `${base}dock/notes-128.png`,
    dock: '[data-dock-notes]',
    windows: ['notes'],
    about: '고정 메모(about me)와 방문자의 메모가 있어요.',
    keywords: 'notes 메모 노트',
  },
  terminal: {
    name: '터미널',
    icon: `${base}dock/terminal-128.png`,
    dock: '[data-dock-terminal]',
    windows: ['terminal'],
    about: '블로그를 작은 파일 시스템으로 보여 줘요.',
    keywords: 'terminal 터미널 셸 shell zsh',
  },
  games: {
    name: '게임',
    icon: `${base}dock/games-128.png`,
    dock: '[data-dock-games]',
    windows: ['games'],
    about: '개인 프로젝트를 모아 둔 곳이에요.',
    keywords: 'games 게임 프로젝트 projects',
  },
  music: {
    name: 'Spotify',
    icon: `${base}dock/spotify-128.png`,
    dock: '[data-dock-music]',
    windows: ['music'],
    about: 'SZA 의 앨범 SOS 를 틀어요.',
    keywords: 'spotify 스포티파이 음악 music 노래',
  },
  druid: {
    name: 'Apache Druid',
    icon: `${base}apps/apache-druid.svg`,
    windows: ['druid'],
    about: 'Apache Druid 가 어떻게 돌아가는지 그림으로 보여 줘요.',
    keywords: 'druid 드루이드 apache 아파치',
  },
};

/** 창 → 앱 이름(키). 모르는 창은 Finder 로 친다. */
export function appOf(win) {
  const type = win?.dataset?.window;
  for (const [key, app] of Object.entries(APPS)) if (app.windows.includes(type)) return key;
  return 'finder';
}
