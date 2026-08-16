---
layout: minimal_post
title: "Docker 레이어 캐시 제대로 쓰기"
date: 2025-06-17 11:33:00 +0900
description: "빌드 시간을 좌우하는 것은 명령의 내용이 아니라 순서다."
---

### 캐시가 깨지는 규칙

Dockerfile의 명령 하나가 레이어 하나를 만든다. 빌드할 때 도커는 각 레이어가 이전과 같은지 확인하고, 같으면 재사용한다.

중요한 건 이 규칙이다. **한 레이어가 무효화되면 그 뒤의 모든 레이어가 함께 무효화된다.** 앞 단계 결과 위에 쌓인 것이라 다시 만들 수밖에 없다.

그래서 **자주 바뀌는 것을 뒤에** 두어야 한다.

### 흔한 실수

```dockerfile
FROM node:20
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
```

`COPY . .`이 앞에 있다. 소스 파일 한 줄만 고쳐도 이 레이어가 바뀌고, 뒤의 `npm ci`가 매번 다시 돈다. 의존성은 바뀐 게 없는데 몇 분씩 다시 받는다.

### 고친 형태

```dockerfile
FROM node:20
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
```

**의존성 정의 파일만 먼저 복사해 설치한다.** 소스를 고쳐도 `package-lock.json`이 그대로면 `npm ci` 레이어는 캐시가 살아 있다. 빌드 시간이 몇 분에서 몇 초로 줄어든다.

같은 원리가 다른 생태계에도 적용된다. Gradle이면 `build.gradle`과 래퍼를 먼저, Python이면 `requirements.txt`를 먼저 복사한다.

### .dockerignore

`COPY . .`은 생각보다 많은 걸 가져온다. `node_modules`, `.git`, 빌드 산출물, 로컬 설정까지 들어가면 이미지가 커지고, 이 파일들이 바뀔 때마다 캐시가 깨진다.

```
.git
node_modules
dist
*.log
.env*
```

`.env`를 제외하는 건 캐시 문제만이 아니다. **이미지에 자격 증명이 그대로 들어가는 것**을 막는 일이기도 하다.

### 멀티스테이지 빌드

빌드 도구는 실행에 필요 없다.

```dockerfile
FROM node:20 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "dist/main.js"]
```

최종 이미지에는 결과물만 담긴다. 크기가 줄고, 이미지에 남는 도구가 줄어드니 공격 표면도 줄어든다.

### 정리

- **바뀌는 빈도 순으로** 명령을 배치한다
- 의존성 설치와 소스 복사를 분리한다
- `.dockerignore`를 먼저 쓴다
- 빌드 환경과 실행 환경을 나눈다
