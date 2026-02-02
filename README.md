# Minimal Theme Migration

이 블로그는 Jekyll 기반의 Minimal 테마로 마이그레이션되었습니다.

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
categories: [카테고리1, 카테고리2]
tags: [태그1, 태그2]
---
```

*   **layout**: 반드시 `minimal_post`를 사용해야 합니다.
*   **title**: 글의 제목입니다.
*   **date**: 작성 날짜 및 시간입니다.
*   **categories**, **tags**: (선택 사항) 글의 분류를 위해 사용합니다.

### 3. 본문 작성
Front Matter 아래에 일반적인 마크다운 문법으로 내용을 작성하시면 됩니다.

#### 주요 기능 및 스타일
*   **폰트**: Pretendard (본문/제목), JetBrains Mono (코드 블럭)
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