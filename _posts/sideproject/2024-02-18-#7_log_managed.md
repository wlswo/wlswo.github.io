---

title: Side Project | 7. Logback을 활용한 로그 관리 전략

date: 2024-02-18-19:15

categories:

- Side Project

tags:

- Log

---

## 로그 관리 전략
> 사이드프로젝트에서 사용하고 있는 로그 관리 전략에 대해 정리하고 공유합니다.

<br><br>

### Goal
- 로그 관리 전략을 정리하고 그 경험을 공유합니다.

<br><br>

# 시작하며
사이드 프로젝트에서 사용했던 로그를 관리 전략 방법과 그 경험을 공유하고자 합니다.

<br><br>

## 로그 관리의 중요성
사이드 프로젝트를 런칭 후 운영에 있어 발생하는 이슈를 대응하기 위해서는 로그를 상시 남기고 모니터링 해야 합니다. 로그는 오류 추적 및 오류 보고를 위한 기반이 되기 때문에 Observability에 반드시 필요한 요소 입니다. 

> Observability : 오직 시스템의 외부 출력만을 이용해서 시스템의 현재 상태를 이해할 수 있는 능력

로깅을 통해 어떤 API를 많이 호출 하는지, 어떤 페이지를 많이 방문하는지와 같은 유저 경험을 추적할 수 있는 장점도 있습니다. 하지만 로깅을 하는 단계에서 적절한 수준의 로그 기록 기준을 정하지 못한다면 방대한 양의 로그 파일이 생기거나, 로그 파일의 생명주기를 효율적으로 관리 하지 못한다면 로그를 관리하지 못할 문제가 발생할 수 있습니다. 결국 **효율적인 로그 관리 방법**을 이해하는 것이 중요합니다.

<br><br>

## Spring boot - Logback
스프링에서 로깅을 하는 방법은 대표적으로 **Log4j**와 **Logback**을 이용하는데요. Log4j는  가장 오래된 프레임워크로 아파치의 Java기반 로깅 프레임워크 입니다. xml, propertise 파일로 로깅 환경을 구성하고, 콘솔 및 파일 출력 형태로 로깅을 할 수 있게 도와줍니다. <br>

Logback은 Log4j 이후 출시된 Java 기반 로깅 프레임워크입니다. 가장 널리 사용되고 있으며 Slf4j의 구현체 로써 Spring boot 환경에서 별도의 dependency 설정 없이 기본적으로 포함되어 있습니다. 

<br><br>

## Logback 설정하기 

![logback-architecture](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%237/logback.png?raw=true)

Logback의 기본적인 구조는 위의 사진과 같습니다. **configuration** 태그는 내부에 최대 1개의 **<root></root>** 태그를 갖고, 0개 이상의 **<appender></appender>** 태그와 **<logger></logger>** 태그를 가질 수 있습니다. <br>

<br>

![log-1](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%237/log-1.png?raw=true)

개발 환경 (`dev` 프로필)에서 사용할 로그 설정을 정의할 수 있습니다. 저는 콘솔 Appender만을 사용하여 INFO 레벨 이상의 로그만을 출력하도록 했습니다.

<br>

![log-2](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%237/log-2.png?raw=true)

실제 운영 환경에서 사용할 로그 설정인데요. 여기서는 INFO, WARN, ERROR 각 레벨별로 파일 Appender를 정의했습니다. <br><br>

### \<fileNamePattern> 태그
각 레벨별 로그 설정에서 `<fileNamePattern>` 태그를 사용하여 로그 파일이 롤링 (새 파일로 전환)될 때 사용될 파일 이름의 패턴을 서로 다르게 지정했습니다. <br>

`<fileNamePattern>` 태그는 로그 파일의 이름을 어떻게 생성할지 결정하는데 사용됩니다. 이는 파일의 크기나 날짜에 따라 로그 파일을 적절하게 관리하고 분류하는 역할을 합니다. <br>

`<fileNamePattern>`에서 사용할 수 있는 패턴에는 날짜와 시간(%d{yyyy-MM-dd}), 인덱스(%i), 그리고 임의의 문자열을 포함할 수 있는데요. 이를 통해 로그 파일을 시간별, 날짜별, 또는 파일 크기에 따라 자동으로 분할하여 저장할 수 있습니다. <br>

로그 데이터를 시간 순으로 쉽게 정리하고, 로그 파일의 크기가 너무 커져 시스템에 부담을 주는 것을 방지할 수 있습니다. <br>

예를 들면 `<fileNamePattern>${LOG_PATH}/ERROR/%d{yyyy-MM-dd}.%i.log</fileNamePattern>`는 LOG_PATH에 지정된 경로 내 ERROR 디렉토리에 로그 파일을 저장하며, 파일 이름은 현재 날짜(yyyy-MM-dd)를 기준으로 하고, 같은 날짜에 여러 파일이 생성될 경우 인덱스(%i)를 뒤에 붙여 구분합니다. <br>

아래 사진은 EC2에서 로그 레벨별로 디렉토리가 생성되고, 각 레벨별로 로그 파일이 생성된 모습을 확인할 수 있습니다.

![ec-log](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%237/ec2-log.png?raw=true)


<br><br>

### \<maxFileSize> & \<maxHistory> 태그
태그 이름에서 알 수 있듯이 로그 파일의 생명주기를 관리할 수 있는 태그라고 생각하면 되는데요. 이 두 설정은 로그 파일의 크기와 보관 기간을 관리합니다.  

`<maxFileSize>` 태그는 각 로그 파일이 커질 수 있는 최대 크기를 지정합니다. 이 크기에 도달하면, 현재 로그 파일을 닫히고 새로운 로그 파일이 생성됩니다. 하루에 최대로 발생 한 로그 파일의 크기를 `5MB`를 넘는경우가 드물거라 생각하여 `5MB`로 설정하였습니다. 

`<maxHistory>` 태그는 롤링 로그 파일을 보관할 수 있는 최대 기간(일 수)또는 최대 개수를 지정합니다. 예를 들어 3으로 설정된 경우 가장 최근 3개의 롤링된 파일만을 유지하고, 그 이전의 로그 파일은 자동으로 삭제됩니다.

<br>

## Logback과 Slack 연동
ERROR 로그가 발생했다는 것은 중대한 로직 오류 등 심각한 문제를 알리는 신호입니다. 대응이 늦어 질수록 사용자 경험에 악영향을 줄 수 있는 이슈로 이어질 수 있는데요. 저희는 에러 로그가 발생했을대 실시간으로 공유받기를 원했습니다. Slack과 Logback을 연동하여 빠르게 대응가능한 환경을 구성했는데요.

![slack-log](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%237/slack-log.png?raw=true)

위의 사진의 `SlackAppender`를 통해 ERROR 로그를 실시간으로 Slack으로 전송할 수 있습니다. 이 설정은 다음과 같은 요소로 구성되는데요.

- Webhook URI: Slack Incoming Webhook을 설정하여 얻은 URI를 사용하여 Logback에서 Slack으로 메시지를 전송할
- Channel: 로그 메시지가 전송될 Slack 채널을 지정
- Username, IconEmoji: 메시지를 보낼 때 사용될 사용자 이름과 아이콘 이모티콘을 설정
- Filter: ERROR 레벨의 로그 이벤트만을 선택적으로 전송하도록 필터링

username, iconEmoji 태그는 prod.yml 의 파일에 있는 값을 매핑하여 사용되도록 구성했습니다. 
```yml
# application-prod.yml
...
# slack
webhook-uri: https://hooks.slack.com/services/~
channel: error-log
username: ERROR BOT
emoji: pepe-why
...
```

<br><br>

# Docker 환경에서의 로그 관리
현재 MOCO는 백엔드로 Spring boot를 컨테이너 이미지화 하며 Docker로 관리하고 있는데요. Docker 환경에서의 로그는 기본적으로 컨테이너의 표준 출력(standard output)과 표준 에러(standard error) 스트림을 로그로 캡처하여 Docker 데몬이 자동으로 관리하는 로그 파일에 저장합니다. <br>

이러한 방식은 간단한 로그 관리 요구에는 충분할 수 있으나, 컨테이너가 삭제되어 소멸되면 컨테이너가 가지고 있는 로그또한 소멸됩니다. 이러한 문제를 Docker 볼륨 마운트 기능을 사용하여 해결할 수 있습니다. <br>

Docker 볼륨 마운트는 호스트 시스템의 디렉토리나 파일을 컨테이너 내부의 경로에 마운트하는 기능인데요. 이를 통해 컨테이너가 생성하여 사용하는 데이터를 컨테이너 외부에서 접근하고 관리할 수 있게됩니다. <br>

![script](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%237/script.png?raw=true)

위의 사진은 현재 사용하고 있는 배포 스크립트 중 일부인데요, 새롭게 배포가 된 컨테이너 이미지를 실행시킬때 -v 옵션으로 어떤 경로에 볼륨을 마운트 시킬건지 정의할 수 있습니다.
```shell
docker run -d -p ... -v /home/ec2-user/logs:/logs ~

# 컨테이너 내부의 /logs 경로를 -> /home/ec2-user/logs 경로에 마운트 시킵니다.
```

이로써 새로운 버전의 애플리케이션이 배포될때 기존 컨테이너 이미지가 삭제되어도 로그의 삭제를 방지할 수 있습니다.

<br><br>

# 결론 
길다면 긴 개발을 거쳐 실 서비스를 앞에 두고 있습니다.  <br>

개발에 정답이 없듯이 위의 구성방식이 정답일 순 없습니다. 서비스를 런칭하고 운영에 들어가는 순간 `어떻게 효율적으로 관리해야 지속 가능한 서비스를 유지할 수 있을까` 에 대해서 깊게 고민이 드는건 저뿐만이 아닐 것 입니다. 이 게시글이 도움이 됐으면 좋겠으며 좋은 경험으로 남는 사이드 프로젝트가 되길 희망합니다.
