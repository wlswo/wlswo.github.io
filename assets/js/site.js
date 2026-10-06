/*
 * 사이트 설정: _config.yml 과 _data/*.yml 의 값을 JS 에 건넨다
 *
 * 사람마다 다른 값(이름 · 호스트 · Wi-Fi · 도시 · 코인 · 앨범)은 코드에 적지 않는다.
 * 이 코드를 가져다 쓰는 사람이 설정 파일만 고치면 되게 하려는 것이다.
 * dock.html 이 모든 쪽에 #site-data(JSON 한 덩어리)를 심어 두고, 여기서 한 번 읽어 나눠 준다.
 *
 *   SITE.title · author · email · url · host     _config.yml 의 맨 위 설정
 *   SITE.about · posts · latest · first           메모 앱 · 터미널이 쓰는 글 정보
 *   SITE.desktop.username · hostname · wifi        _config.yml 의 desktop 묶음
 *   SITE.desktop.weather · coins · druid
 *   SITE.music.album · tracks                      _data/music.yml
 *
 * 값이 빠지거나 모양이 틀려도 앱이 멈추지 않게 아래 기본값으로 채운다.
 * 다른 모듈을 가져오지 않는다(누구나 가져다 쓰게).
 */
function read() {
  try {
    return JSON.parse(document.getElementById('site-data')?.textContent || '{}') || {};
  } catch {
    return {};
  }
}

// 빈 값이면 기본값. YAML 이 숫자로 읽은 값(username: 1234 따위)도 글자로 받는다.
const text = (v, fallback) => (v === null || v === undefined ? '' : String(v).trim()) || fallback;
const num = (v, fallback) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const raw = read();
const desk = raw.desktop || {};
const weather = desk.weather || {};
const album = raw.music?.album || {};
const tracks = Array.isArray(raw.music?.tracks) ? raw.music.tracks : [];

// 설정에 주소가 없으면 지금 연 주소. host 는 앞의 https:// 와 끝의 / 를 뗀 이름이다.
const url = text(raw.url, location.origin).replace(/\/+$/, '');

// 코인은 Coinbase 의 상품 이름(BTC-USD 꼴)만 받는다. 키가 없으면 둘을 보이고, 빈 목록이면 위젯을 숨긴다.
const coins =
  desk.coins === null || desk.coins === undefined
    ? ['BTC-USD', 'ETH-USD']
    : [].concat(desk.coins).map((c) => text(c, '').toUpperCase()).filter((c) => /^[A-Z0-9]+-[A-Z0-9]+$/.test(c));

export const SITE = {
  ...raw,
  url,
  host: url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ''),
  desktop: {
    username: text(desk.username, 'guest'),
    hostname: text(desk.hostname, text(raw.title, 'MacBook')),
    wifi: text(desk.wifi, 'Home-5G'),
    // 날씨 도시가 없으면 맥의 날씨 위젯이 처음 보여 주는 쿠퍼티노
    weather: {
      city: text(weather.city, 'Cupertino'),
      latitude: num(weather.latitude, 37.323),
      longitude: num(weather.longitude, -122.0322),
    },
    coins,
    // Apache Druid 앱은 false 라고 적었을 때만 뺀다(키가 없으면 그대로 둔다).
    druid: desk.druid !== false,
  },
  music: {
    album: {
      title: text(album.title, ''),
      artist: text(album.artist, ''),
      year: text(album.year, ''),
      // 앨범 그림이 없으면 Spotify 아이콘으로 덮는다(유튜브 영상이 드러나지 않게).
      art: text(album.art, '/assets/images/dock/spotify-256.png'),
    },
    // 유튜브 영상 id 가 없는 줄은 틀 수 없으니 버린다.
    tracks: tracks
      .filter((t) => t && text(t.id, ''))
      .map((t) => ({ id: text(t.id, ''), title: text(t.title, text(t.id, '')), feat: text(t.feat, '') })),
  },
};
