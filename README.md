# Ephemeris

맥북 데스크톱처럼 생긴 Jekyll 블로그입니다. 잠금 화면으로 시작해, 배경화면 위에
메뉴 막대와 Dock 이 있습니다. Dock 에는 Finder · Obsidian · 메모 · 터미널 · 게임 ·
Spotify · 휴지통이 섭니다(아이콘 그림은 `assets/images/dock/`).

- 글은 Obsidian(창) 이나 Finder 의 Obsidian 폴더 · 태그에서 찾고, 문서 창으로 읽습니다.
- 바탕의 About.txt 는 메모 앱의 '📍about me' 메모로 열립니다(`_data/about_me.yml`).
  방문자가 쓴 메모는 그 브라우저의 localStorage 에만 저장됩니다.
- 터미널은 블로그를 작은 파일 시스템으로 보여 줍니다(`help` 로 명령 목록).
- 게임 창의 앱은 `_data/projects.yml`, Spotify 는 유튜브 임베드로 SZA 앨범을 틉니다
  (유튜브가 `127.0.0.1` 에서는 재생을 막으니 로컬에서는 `localhost` 로 여세요).
- 바탕의 Apache Druid 는 Druid 의 동작을 그림으로 보여 주는 창을 엽니다(아래 'Apache Druid 동작 원리').
- 메뉴 막대의 Wi-Fi · 배터리 메뉴는 모형 자료입니다.

## 블로그 포스트 작성 방법

새로운 글을 작성하려면 `_posts` 폴더 안에 마크다운 파일(`.md`)을 생성하세요.

### 1. 파일명 규칙
파일명은 반드시 다음과 같은 형식을 따라야 합니다:
```
YYYY-MM-DD-제목.md
```
예시: `2024-01-20-minimal-theme-update.md`

### 2. Front Matter (머리말) 설정
파일의 최상단에 아래와 같이 머리말을 작성해야 합니다.

```yaml
---
layout: minimal_post
title: "글의 제목을 입력하세요"
date: 2024-01-20 12:00:00 +0900
categories: [database]
---
```

*   **layout**: 반드시 `minimal_post`를 사용해야 합니다.
*   **title**: 글의 제목입니다.
*   **date**: 작성 날짜 및 시간입니다.
*   **categories**: `_data/categories.yml` 에 있는 slug 하나를 적습니다.
    (`database` · `network` · `runtime` · `distributed` · `ops` · `notes`)
    새 카테고리가 필요하면 `_data/categories.yml` 에 항목을 더하세요. 이름, 아이콘,
    그리고 달력에서 그 카테고리 글이 입는 색(`color`)을 정합니다.
*   **description**: 목록과 Spotlight 에 보이는 한 줄 요약입니다.

### 3. 본문 작성
Front Matter 아래에 일반적인 마크다운 문법으로 내용을 작성하시면 됩니다.

#### 주요 기능 및 스타일
*   **폰트**: Pretendard (모든 글자), 코드 블럭만 고정폭(SF Mono / JetBrains Mono)
*   **코드 블럭**:
    ```java
    public class HelloWorld {
        public static void main(String[] args) {
            System.out.println("Hello, World!");
        }
    }
    ```
*   **인용문**:
    > 인용문은 이렇게 표시됩니다.
*   **테이블**:
    | 헤더 1 | 헤더 2 |
    |--------|--------|
    | 내용 1 | 내용 2 |

## 로컬 실행 방법

블로그를 로컬에서 미리 확인하려면 터미널에서 다음 명령어를 실행하세요.

```bash
bundle exec jekyll serve
```

브라우저에서 `http://localhost:4000`으로 접속하여 확인할 수 있습니다.

## 공유 썸네일 만들기

카카오톡·슬랙·X 에 글 주소를 붙이면 뜨는 미리보기 그림(Open Graph 이미지)은
글마다 한 장씩 `assets/og/` 에 미리 구워 둡니다. GitHub Pages 는 빌드할 때
그림을 만들어 주지 않기 때문입니다.

새 글을 올리거나 제목·설명·날짜·카테고리를 고쳤다면, `bundle exec jekyll serve` 를
띄워 둔 채로 다른 터미널에서 아래를 실행하고 바뀐 그림을 글과 함께 커밋하세요.

```bash
cd tools/og
npm install        # 처음 한 번
node generate.mjs
```

*   바뀐 글만 다시 굽고, 지운 글의 그림은 알아서 치웁니다. 전부 다시 구우려면 `--force` 를 붙이세요.
*   개발 서버 주소가 다르면 `--base http://127.0.0.1:4001` 처럼 알려 주세요.
*   Google Chrome 이 설치되어 있어야 합니다.
*   그림 이름은 글 날짜의 유닉스 초(`search.json` 의 `og`)입니다. 그림이 없는 글과 홈·About 은
    `assets/og/default.jpg` 를 씁니다.
*   카드 모양은 `tools/og/_card.html` 에서 고칩니다. 고치면 다음 실행 때 전부 새로 구워집니다.

## Apache Druid 동작 원리

`/druid/` 는 Apache Druid 가 어떻게 돌아가는지 장(chapter)마다 한 단계씩 보여 주는 한 장짜리
앱입니다. 그림은 [React Flow](https://reactflow.dev) 위에 고정폭 글자로 그린 아스키 다이어그램이고,
모양(라이트 · 다크)은 블로그 설정을 따릅니다. 데스크톱의 Apache Druid 아이콘은 이 쪽을
창(iframe)으로 띄우고(`assets/js/druid.js`), 창의 ↗ 로 새 탭에서 화면 가득 볼 수도 있습니다.
내용은 Apache Druid 공식 문서(druid.apache.org/docs/latest, 37.0.0 기준)를 바탕으로 합니다.

*   쪽: `druid/index.html`(틀) · `_layouts/druid.html`(머리말)
*   코드: `assets/druid/`
    *   `diagram.js` — 그림판(React Flow · 아스키 상자 · 점선 · 움직이는 점 · 시계)
    *   `ascii.js` — 아스키 도구(상자 · 표 · 비트맵 · 막대)
    *   `app.js` — 목차 · 설명 칸 · 단계 넘기기 · 주소(`#장/단계`)
    *   `chapters.js` — 장 목록, `chapters/*.js` — 장 하나에 파일 하나
*   장을 더하려면 `chapters/` 에 모듈을 만들고 `chapters.js` 에 한 줄 넣습니다. 모듈의 모양은
    `diagram.js` 맨 위 설명에 있습니다. 상자의 자리는 글자 칸(열 · 줄) 단위입니다.
*   React · React Flow 는 빌드 없이 쓰도록 `assets/druid/vendor/flow.js` 한 파일로 묶어 두었습니다.
    판을 올릴 때만 다시 묶습니다:

```bash
cd tools/druid
npm install        # 처음 한 번
npm run build      # assets/druid/vendor/flow.js · flow.css 를 새로 만든다
```
