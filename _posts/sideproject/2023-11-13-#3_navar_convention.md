---

title: Side Project | 3. 프로젝트 Naver Java 코딩 컨벤션 적용

date: 2023-11-13-23:06

categories:

- Side Project 

tags: 

- Project
- Springboot

---

## 사이드 프로젝트 Naver 코딩 컨벤션 적용
> Naver 코딩 컨벤션을 적용해 봅니다.

<br><br>

# 1. Naver-intelliJ-formatter.xml 다운로드

아래 링크에서 해당 xml 파일을 다운로드 합니다. 

- [naver-intellij-formatter](https://github.com/naver/hackday-conventions-java/blob/master/rule-config/naver-intellij-formatter.xml)

<br><br>

# 2. Scheme 설정하기

**[IntelliJ IDEA] → [Settings…] → [Editor] → [Code Style] → [Java]** 선택

![1.png](https://raw.githubusercontent.com/wlswo/wlswo.github.io/6c475a190f61f7465e950715659d5a465bf74eb3/assets/images/SideProject/naver_coding_convention_1.1.png)

Scheme 항목의 오른쪽 톱니바퀴 아이콘을 선택합니다. 
IntelliJ IDEA code style XML 을 클릭합니다.

![1.2.png](https://raw.githubusercontent.com/wlswo/wlswo.github.io/6c475a190f61f7465e950715659d5a465bf74eb3/assets/images/SideProject/naver_coding_convention_1.2.png)

다운로드 받은 naver-intelij-formatter.xml 파일을 선택한 후 OK 버튼을 누릅니다.

![1.3.png](https://raw.githubusercontent.com/wlswo/wlswo.github.io/6c475a190f61f7465e950715659d5a465bf74eb3/assets/images/SideProject/naver_coding_convention_1.3.png)

## 2.1 코드 저장 시점마다 코딩 컨벤션 자동 적용하기

**[IntelliJ IDEA] → [Settings…] → [Tools] → [Actions on Save]** 선택

![2.1.png](https://raw.githubusercontent.com/wlswo/wlswo.github.io/6c475a190f61f7465e950715659d5a465bf74eb3/assets/images/SideProject/naver_coding_convention_2.1.png)

- Reformat code 옵션을 체크합니다.
    - 해당 옵션은 설정한 코드 컨벤션에 맞게 코드 스타일을 자동 수정하여 적용해줍니다.
- Optimize imports 옵션을 체크합니다.
    - 해당 옵션은 사용하지 않는 import 구문들을 자동으로 제거해 줍니다.

<br><br>

# 3. Checkstyle 적용하기

checkstyle이란 Java 코드가 설정한 코드 컨벤션을 준수하는지 확인해주는 정적 코드 분석 도구입니다. 
지정된 규칙에 어긋나는 경우 컴파일 시 경고 또는 에러를 보여줍니다.

아래 링크에서 naver-checkstyle-rules.xml과 naver-checkstyle-suppressions.xml를 다운로드 합니다. 

- [naver-checkstyle-rules.xml](https://github.com/naver/hackday-conventions-java/blob/master/rule-config/naver-checkstyle-rules.xml)

- [naver-checkstyle-suppressions.xml](https://github.com/naver/hackday-conventions-java/blob/master/rule-config/naver-checkstyle-suppressions.xml)

## 3.1 Checkstyle 플러그인 설치

**[IntelliJ IDEA] → [Settings…]  → [Plugins]** 선택

- Marketplace에 CheckStyle을 검색하여 CheckStyle-IDEA 플러그인을 설치합니다.
- IntelliJ를 재기동 합니다.

![2.2.png](https://raw.githubusercontent.com/wlswo/wlswo.github.io/6c475a190f61f7465e950715659d5a465bf74eb3/assets/images/SideProject/naver_coding_convention_3.1.png)

## 3.2 Checkstyle 설정하기

**[IntelliJ IDEA] → [Settings…]  → [Tools] → [Checkstyle] 선택**

![3.2.png](https://raw.githubusercontent.com/wlswo/wlswo.github.io/6c475a190f61f7465e950715659d5a465bf74eb3/assets/images/SideProject/naver_coding_convention_3.2.png)

- Scan scope를 **All source including tests**로 변경합니다.
- **Treat Checkstyle errors as warnings**를 체크합니다.
- Configuration File에서 + 버튼을 클릭합니다.
- Description은 **Naver Checkstyle Rules** 로 작성합니다.
- Use a Local Checkstyle File을 선택하고 Browse 버튼을 눌러 **naver-checkstyle-rules.xml**를 지정하고 Next 버튼을 누릅니다.
- suppressionFile 변수를 설정하라는 창이 뜨면 Value에 **naver-checkstyle-suppressions.xml**를 입력하고 Next 버튼을 누릅니다.
- Naver Checkstyle Rules의 Active를 체크해 줍니다.