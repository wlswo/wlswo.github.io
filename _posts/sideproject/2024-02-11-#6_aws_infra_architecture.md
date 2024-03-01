---

title: Side Project | 6. AWS 인프라 구축기

date: 2024-02-11-20:33

categories:

- Side Project

tags:

- AWS

---

## AWS Cloud 인프라 구축
> AWS Well-Architected에 가깝게 인프라를 구축하고 프로젝트를 배포해봅니다.

<br><br>

### Goal
- 구축한 AWS 아키텍처를 소개합니다.
- cloud infra를 구축한 경험을 공유해 봅니다.

<br><br>


# 시작하며
약 2주일의 시간동안 사이드 프로젝트의 배포를 위한 인프라 구축이 끝났습니다. 해당 게시글은 완성된 인프라 아키텍처를 정리하고, 그 과정에서 얻은 경험을 공유하고자 합니다. 아래는 현재 moco를 서비스 하고 있는 AWS 의 인프라 구성도 입니다.

## AWS Architecture
![moco-aws-architecture](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%236/moco-aws-architecture.png?raw=true)

## Application in AWS Architecture 

아래는 EC2 인스턴스에 구성되어 있는 애플리케이션 구성도입니다.

![moco-aws-application](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%236/moco-application.png?raw=true)

<br><br>

# AWS를 선택한 이유
클라우드 인프라는 현재 IT 프로젝트의 필수적인 요소가 되었습니다. <br> 
다양한 클라우드 서비스 제공 업체 중 AWS를 선택한 이유는 클라우드 서비스의 점유율 1위로 인해 넓은 생태계를 가지고 있습니다. 이는 AWS를 사용하는 유저들이 자주 겪는 이슈나 궁금증들이 [FAQ](https://aws.amazon.com/ko/faqs/)로 제공되고 있어 큰 어려움 없이 인프라를 구축할 수 있습니다. <br>
무엇보다도 AWS의 다양한 서비스를 무료로 체험할 수 있는 "프리티어" 서비스 제공이 굉장히 매력적인 이유도 포함되어 있습니다.

최근에는 오라클 클라우드에서 **평생 무료**로 이용할 수 있는 VM(1core, 1GB ram) 2개를 제공하고 있으니 오라클 클라우드도 좋은 선택이 될 수 있을 것 같습니다. 

![cloud platform market share](https://www.cloudzero.com/wp-content/uploads/2023/10/cloud-infrastructure-services-market-share.webp)

스타트업이나, 사이드 프로젝트를 진행하는 개발자는 AWS 프리티어를 활용하여 새로운 아이디어를 시험하거나 프로토타입을 빠르게 개발하여 초기 단계에서의 리스크를 최소화하면서 빠르게 시장에 출시할 수 있는 기회를 얻을 수 있다는 점이 장점이지 않을까 싶습니다.


<br><br>

# 계획 및 설계
AWS을 사용함에 따라 아래와 같은 우선순위를 염두해 두고 설계를 시작했습니다.

1. 비용 최소화 전략을 사용할 것
2. AWS의 모범사례인 Well-Architected Framework 참고하여 고가용성과 성능을 확보할 것
3. 오버 엔지니어링을 피할 것

<br><br>

## 비용 최소화 전략

AWS의 프리티어를 활용하여 1년간 무료인 서비스들을 적극 활용하여 비용을 최소화 해야 했습니다.
아래는 AWS의 프리티어를 제공하는 서비스를 확인할 수 있습니다.
- [AWS 프리티어 서비스 목록](https://aws.amazon.com/ko/free/?gclid=Cj0KCQiAoKeuBhCoARIsAB4WxtfxuHcdXKkhyPVNCehxxssYfUTE7my5XXLDjTi2rv50nFGEGOiK-2EaAnblEALw_wcB&trk=b088c8c6-1a6b-43e1-90e7-0a44a208e012&sc_channel=ps&ef_id=Cj0KCQiAoKeuBhCoARIsAB4WxtfxuHcdXKkhyPVNCehxxssYfUTE7my5XXLDjTi2rv50nFGEGOiK-2EaAnblEALw_wcB:G:s&s_kwcid=AL!4422!3!563761819807!e!!g!!aws%20%ED%94%84%EB%A6%AC%20%ED%8B%B0%EC%96%B4!15286221773!129400439706&all-free-tier.sort-by=item.additionalFields.SortRank&all-free-tier.sort-order=asc&awsf.Free%20Tier%20Types=*all&awsf.Free%20Tier%20Categories=*all)

위와 같은 이유로 인프라를 구축하기전 사용하기 위한 서비스들을 추려 정리하였습니다.
- 컴퓨팅
	- EC2
- 관계형 데이터 베이스
	- RDS
- 인메모리 데이터 스토어
	- Elasticahe for Redis (single-node)
- 로드 밸런서
	- ALB
-	DNS 서비스
	- ROUTE53
- 오브젝트 스토리지
	- S3
- CDN
	- Cloudfront
- Slack 챗봇 서비스
	- Chatbot
- 컨테이너 이미지 저장소
	- ECR
- CD(continuous deployment)
	- Code deploy


<br><br>

### EC2 예약 인스턴스 구매

EC2는 next.js 와 spring boot 를 사용하기 위해 2대로 구성해야했습니다. 프리티어로 제공해주는 사양은 t2.micro로 1core, 1gb ram 사양을 가지고 있습니다. next.js 와 spring boot 그리고 code deploy 서비스를 이용하기 위해선 code deploy agent 3개의 프로세스를 항상 기동 시켜야 합니다. 프리티어 사양으로는 spring boot 와 code deploy agent를 기동시켰을때 사용할 수 있는 메모리가 턱없이 부족함을 확인하여 서버용 ec2 예약 인스턴스를 구매하기로 결정했습니다.

예약 인스턴스를 최소 비용으로 구매하기 위해서는 ec2 요금을 미리 결제하는 "전체 선결제" 옵션과 테넌시 공유를 활성화 시켜야 합니다. 테넌시는 여러 AWS 계정이 동일한 물리적 하드웨어를 공유할 수 있기 때문에 좀더 싼 가격에 구매할 수 있는 장점이 있지만 다른 AWS 계정이 높은 네트워크 사용량을 차지할 때 해당 하드웨어를 공유하는 인스턴스들은 낮은 네트워크 대역폭을 가지는 단점이 있을 수 있습니다.

<br>

### IPv4 요금 발생
- [aws public ipv4](https://aws.amazon.com/ko/blogs/korea/new-aws-public-ipv4-address-charge-public-ip-insights/)

AWS에서 2024년 2월 1일 부터 퍼블릭 IPv4 주소에 대한 요금이 부과된다는 공지가 발생했고 구성하고 있던 인프라 구조에서 퍼블릭 Ipv4의 사용을 최소화 해야 했습니다.

링크에 있는 공지 게시글 내용에 존재하는 **Public IP Insights 기능**을 이용하여 퍼블릭 IPv4 주소 사용량을 쉽게 확인할 수 있습니다.

현재 ALB가 2개, EC2 인스턴스가 각각 1개, RDS가 1개 총 5개의 퍼블릭 IPv4 를 사용하고 있었습니다.
여기서 퍼블릭 ALB 와 EC2는 퍼블릭 IPv4를 사용해야만 했고, RDS는 외부에서 접근할 이유가 없기 때문에 RDS의 퍼블릭 IP를 삭제하기로 했습니다.

기존의 RDS 인스턴스를 삭제하고 프라이빗 서브넷에 배포하여 외부의 접근을 제한하고 IPv4의 할당을 해제하여 현재는 총4개의 퍼블릭 IPv4를 사용중에 있습니다.

![aws-public-insight](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%236/aws-ip-insight.png?raw=true)

요금은 시간당 0.005 USD로 한 달간 사용했을 때는 약 3.6 USD 정도가 부과되어 총 4개의 대한 퍼블릭 IPv4 요금은 14.4 USD 정도가 부과되고 있습니다.



<br><br>


## AWS Well-Architected란
AWS Well-Architected Framework는 클라우드 인프라 설계의 모범 사례와 가이드라인을 제공합니다. 이 프레임워크는 운영 우수성, 보안, 안정성, 신뢰성, 성능 효율성, 비용 최적화의 여섯 가지 핵심 원칙에 중점을 둡니다.

[AWS Well-Architected](https://aws.amazon.com/ko/architecture/well-architected/?wa-lens-whitepapers.sort-by=item.additionalFields.sortDate&wa-lens-whitepapers.sort-order=desc&wa-guidance-whitepapers.sort-by=item.additionalFields.sortDate&wa-guidance-whitepapers.sort-order=desc)

여섯 가지의 핵심 원칙 중 아래와 같은 사항을 고려하였습니다.

<br>

**고가용성을 위한 설계 원칙 적용**

- **다중 AZ(Availability Zone) 배포:** 애플리케이션과 데이터를 다수의 AZ에 걸쳐 배포함으로써 하나의 지역에 장애가 발생해도 서비스가 지속될 수 있도록 합니다.

 **성능 효율성 향상 전략**

- **적절한 서비스 선택:** 애플리케이션의 요구 사항에 맞는 AWS 서비스를 선택합니다.
- **캐싱 전략 활용:** Amazon CloudFront와 같은 CDN(Content Delivery Network) 서비스와 Amazon ElastiCache를 사용하여 캐싱 전략을 구현함으로써 응답 시간을 단축하고 성능을 향상시킵니다.

**보안 설계 원칙 적용**

- **강력한 자격 증명 기반 구현:** 최소 권한 원칙을 구현하고 AWS 리소스와의 각 상호작용에 필요한 권한을 적절히 부여하여 업무를 분리합니다.

<br>

### 다중 AZ 배포

위와 같은 가이드 라인을 참고하여 2개의 EC2 인스턴스와 RDS 인스턴스를 각각 다른 AZ에 배포하였습니다. 하지만 현재 서비스가 지속되기 위해서는 각 AZ 별로 동일한 환경을 가진 AZ가 존재해야 합니다. AWS 서비스 관점에서는 하나의 AZ에 이슈가 생겨도 다른 AZ에 존재하는 AWS 서비스에는 영향을 주진 않지만 애플리케이션 관점에서는 중단되는 구성을 가지고 있습니다. <br>
이 문제는 2개의 EC2에 각각 Next.js 와 Spring boot 애플리케이션을 구동시키고 하나의 AZ에 이슈가 생기면 다른 AZ로 트래픽을 라우팅 시키도록 마이그레이션을 생각중에 있습니다.

<br>

### 캐싱 전략

API 서버가 캐싱 전략을 활용하기 위해 자주 사용되는 데이터를 ElastiCache for Redis에 저장해 응답 시간을 단축하고 성능을 향상 시켰습니다.  데이터는 JWT 의 리프레시 토큰을 저장했습니다.

moco 는 이미지를 업로드하고 이미지를 확인할 수 있는 기능이 존재합니다. 이미지를 S3에 저장하여 S3의 이미지의 퍼블릭 엑세스 링크를 통해 제공해주기 보다 짧은 지연 시간과 빠른 전송 속도를 가지는 CDN 서비스인 Cloudfront를 사용하였습니다.  이는 
컨텐츠가 캐싱되고 유저에게 제공되는 지점인 엣지 로케이션을 이용하여 서버의 부하를 낮추는 장점또한 가질수 있었습니다.

<br>

### ALB 의 호스트 기반 라우팅

moco 는 현재 front 서버와 api 서버를 사용하고 있습니다. page 이동에 필요한 url 은 프론트 서버가 존재하는 ec2로 라우팅하고, api call 시점에는 api 서버가 존재하는 ec2로 라우팅해야 했습니다.

이러한 상황에서는 ALB의 호스트 기반 라우팅 기능을 이용하면 쉽게 해결할 수 있습니다.
ALB 의 호스트 기반 라우팅이란  HTTP 요청 URL의 경로를 기반으로 트래픽을 다르게 라우팅할 수 있는 기능입니다.

예를 들어 **api.example.com**에 대한 요청은 A라는 대상 그룹에 보내고 **example.com**에 대한 요청은 다른 그룹에 보낼 수 있습니다.

이렇게 하면 api에 대한 트래픽과 page에 대한 요청을 구분하여 각각 다른 EC2에 트래픽을 라우팅 할 수 있습니다.

저희는 현재 api.moco.run 의 url은 Spring boot 가 실행되는 EC2로, moco.run/* 경로는 next.js 가 존재하는 EC2로 라우팅을 보내고 있습니다.

![aws-alb](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%236/aws-alb.png?raw=true)

<br>

### AWS Chatbot

저희는 서버의 에러 로그와 배포 서비스인 Code deploy 의 배포 결과를 Slack을 통해 알람 받기를 원했습니다.

AWS는 대화형 서비스 기반으로 모니터링 기능을 제공하는 'Chatbot' 서비스가 존재합니다. AWS Chatbot은 Slack 채널 및 Amazon Chime을 통해 AWS 리소스를 쉽게 모니터링하고 지표를 감시하여 알림을 수신하고 빠르게 이벤트에 대응할 수 있게 도와주는 대화형 서비스입니다.

AWS Chatbot 과 Code deploy 를 연동하여 Github에 코드가 Push 되어 새로운 버전의 애플리케이션을 배포했을 때 결과를 Slack으로 확인하고 있습니다.
또한 Spring boot 의 logback을 이용하여 에러 발생시 slack에서 확인하고 있습니다.

![code deploy slack](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%236/slack-code%20deploy.png?raw=true)


![error log slack](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%236/slack-error%20log.png?raw=true)

<br>

## 오버엔지니어링 검토

AWS 아키텍처를 설계할 때 오버 엔지니어링은 곧 비용으로 귀결되기 때문에 이 점에 유의하여 진행해야 하지만 실제로 구축이 진행되고 나서는 아쉬운 부분이 있었습니다.

서버용 EC2 인스턴스를 구매할 때 넉넉한 사양으로 구매해야겠다는 추상적인 생각만으로 구매를 진행했는데요

Spring Boot 애플리케이션과 AWS Code Deploy 에이전트를 실행하기 위한 적합한 인스턴스 유형과 사양을 결정하기 위해서는 애플리케이션의 특성, 예상 트래픽, 자원리소스 사용 패턴 등을 고려해야 합니다. 하지만 추상적으로 1 core, 1gb 사양으로 정상적으로 실행 됐었다는 조건 하나만으로 인스턴스 사양을 결정했습니다.

실제로 t3. small 인스턴스에서 Spring boot 와 Code deploy agent를 실행했을 때 여유 메모리가 1.1GB가 존재했고 CPU 사용량 또한 낮은 수준을 유지했습니다.

이는 요구 사항보다 과도하게 충분했고 오버 엔지니어링으로 이어졌던 경험을 했습니다.

적절한 인스턴스 유형과 사양 선택은 애플리케이션의 요구 사항과 예산에 따라 달라질 수 있습니다. 따라서, 실제 사용 패턴과 성능 요구 사항을 면밀히 분석한 후 결정하는 것이 중요합니다.

<br>

# 느낀점

첫번째로 AWS의 서비스들을 적재적소에 잘 사용하기 위해서는 각 서비스들에 대한 깊은 이해와 사용하고자 하는 워크로드를 분석하는 것이 필요합니다.  <br>

예를 들어 현재 MOCO 웹 서비스는 복잡한 워크로드를 가지고 있지 않기 때문에 EC2 대신에 컨테이너 기반 관리형 서비스인 ECS Fargate 를 사용해서 인스턴스에 대한 관리 포인트를 줄이거나, AWS Lambda를 이용한 서버리스 아키텍처로도 충분하게 서비스가 가능했었을 것 같습니다. <br>

두번째로는 클라우드 플랫폼을 잘 이용하기 위해서는 러닝 커브가 존재합니다. 
클라우드 인프라 서비스라고도 하는 IaaS(Infrastructure-as-a-service)는 용어 하나하나가 가지는 의미가 굉장히 깊은 이해를 바탕으로 합니다. 이 개념이 단순히 하드웨어를 대여하는 것을 넘어서 클라우드 환경에서의 네트워킹, 스토리지, 서버, 가상화 기술 등 다양한 추상화 및 자동화 기능을 포함하기 때문인데요.  <br>

예를 들어, '가상화'는 IaaS에서 중요한 개념 중 하나인데요. 이 가상화만 해도 가지는 의미가 아래와 같습니다.

> 가상화란 베어메탈에서 Hypervisor를 사용하여 가상 머신을 만들고, 다수의 가상 단위로 분할하여 여러 운영 체제를 동시에 실행할 수 있는 기술

베어메탈, Hypervisor이 원리들도 이해해야 하고, 가상화의 종류도 전가상화와 반가상화로 나뉘기도 합니다. 

저는 업무에서 백엔드 업무도 진행하지만 Openstack 이라는 IaaS를 구축하는 오픈소스 기술을 사용하고 있어서 사이드프로젝트를 굉장히 재미있게 진행하고 있지만 클라우드를 처음 접한다면 이러한 것들을 고려해서 진행한다면 클라우드의 매력을 충분히 느낄수 있을 거라 생각합니다. 


