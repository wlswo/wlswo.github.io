---

title: Side Project | 4. Next.js & Spring Boot의 Oauth2 JWT 인증 방식으로의 전환

date: 2023-12-02-14:45

categories:

- Side Project 

tags: 

- Oauth2
- JWT

---

## 사이드 프로젝트 인증 방식 전환
> Next.js 도입으로 기존 Session 방식에서 Oauth2 JWT 인증 방식으로 개선해 봅니다.

<br><br>

# 목표

- Next.js 와 Springboot를 이용한 Oauth2,JWT 방식을 설명합니다.
- 기존의 인증 방식과 새롭게 변경한 인증 방식에 관해 설명합니다.
- Oauth2 와 JWT 도입에 있어 고민 경험에 대해 정리합니다.
- 새롭게 변경한 인증 방식 도입 과정을 정리합니다.

<br><br>


# 개요

기존의 프로젝트는 Spring Boot 단일 어플리케이션이었습니다. 템플릿 엔진으로 타임리프를 사용하여 SSR 방식으로 뷰 페이지까지 제공합니다. Next.js 사용하여 프론트 서버를 도입하고 기존의 Springboot는 REST API 서버로 마이그레이션을 진행하고 있습니다. 이에 따라 기존의 인증 방식을 새롭게 변경해야 했습니다. 


<br><br>

# 기존의 인증 방식

기존의 인증 방식은 시큐리티를 이용하여 Oauth2을 이용한 SNS 로그인, 애플리케이션 레벨의 자체 로그인을 구현하여 사용했습니다. 
인증과 인가는 스프링 시큐리티가 기본적으로 제공하는 세션으로 관리했습니다.  기존의 인증 방식의 흐름을 그려보면 아래와 같습니다.

![기존인증방식.drawio.png](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%234/%EA%B8%B0%EC%A1%B4%EC%9D%B8%EC%A6%9D%EB%B0%A9%EC%8B%9D.drawio.png?raw=true)

스프링 시큐리티로 Oauth2 인증을 처리하기 위해서는 사전 설정이 필요합니다. 소셜 로그인 페이지를 제공하기 위한 설정과 소셜 로그인을 이용하기 위한 API 키 설정이 필요합니다. 나아가 스프링 시큐리티 내부적으로 복잡한 인증 Flow로 인증을 처리합니다. 

<br><br>

```shell
oauth2Login()를 활성화 
-> OAuth2AuthorizationRequestRedirectFilter 를 통해 “/oauth2/authorization” 를 받아와 requestMatcher 세팅 
-> “/oauth2/authorization/{registrationId}” 에 맞는 로그인 페이지로 리다이렉트 
-> 로그인 성공 
-> Oauth2UserService의 loadUserByname를 통해 유저 정보를 가져옴 
-> ...₩
-> 회원 검증 
-> 로그인 처리 
-> SecurityContextHolderd에 인증 정보를 저장 
```

<br>

이처럼 쉽지 않은 Flow들을 시큐리티가 대신 처리해주는 장점이 존재합니다. Oauth2 인증 흐름을 개발자가 전부 구현해도 되지 않는 이점이 있습니다. 러닝 커브가 있는 프레임워크 이지만 서블릿, 필터 같은 스프링 컨테이너 외부 영역에 대한 보안 처리를 스프링 시큐리티를 이용해서 유연하게 처리할 수 있습니다. 단일 Spring 애플리케이션이라면 시큐리티는 좋은 옵션이 될 수 있습니다. 


<br><br>

## 단점

HTTP는 상태를 가지지 않는 Stateless한 비접속형 프로토콜입니다. 서버는 로그인한 사용자라는 걸 알기 위해서 이전 요청의 상태를 기억해야 합니다. <br>

Session은 이전 요청의 상태를 기억할 수 있는 방법입니다. 톰캣의 고유한 세션 ID(JESSIONID)를 웹 브라우저 쿠키로 전달하고, 클라이언트는 세션ID (JSESSIONID)를 헤더에 담아 함께 전달합니다. <br>

서버는 전달받은 SessionID를 서버에 저장되어 있는 ID와 비교하여 클라이언트의 상태를 지속적으로 유지합니다. HttpSession 인터페이스의 getId() 메서드를 호출하면 JSESSIONID 쿠키의 정보를 확인할 수 있습니다.

아래 그림과 같이 서버는 세션 정보를 저장하고, 클라이언트는 발급받은 세션 ID를 헤더에 담아 요청합니다. 서버는 헤더에 담긴 세선 ID로 사용자를 식별하게 됩니다.

![session1](https://raw.githubusercontent.com/wlswo/wlswo.github.io/aa3500cfea40f3e8adaa3c53d2deda49bbb556c7/assets/images/SideProject/side%234/session1.png)

해당 방식의 문제점은 서버를 확장하거나 축소하는 스케일링이 진행될 때 **세션 정보가 일치하지 않는 상황**이 발생합니다. 나아가 서버의 메모리에 세션 데이터를 저장하므로 많은 사용자가 동시에 접속하면 서버 부하가 증가할 수 있습니다.  <br>


트래픽 증가로 인해 서버를 증설한다고 가정한다면 아래 그림과 같은 상황이 발생할 수 있습니다. 프론트엔드에서는 NginX로 API 요청을 하고 NginX는 두 대의 백엔드 서버에 요청을 분산하여 호출합니다.  <br>

각각의 백엔드 서버에서 관리하는 세션 정보는 공유하고 있지 않기 때문에 Server 2 에서 발급한 세션 ID를 가지고 서버 1에 요청될 경우 세션 정보가 일치하지 않는 상황이 발생합니다. 

![session2](https://raw.githubusercontent.com/wlswo/wlswo.github.io/aa3500cfea40f3e8adaa3c53d2deda49bbb556c7/assets/images/SideProject/side%234/session2.png)

이런 경우 보통 Sticky Session을 사용하거나, 공유 Session 저장소를 별도로 두어 해결하곤 합니다.

<br>

### AWS ELB의 Sticky Session

Sticky Session이란 특정 세션의 요청을 처음 처리한 서버로만 전송하는 것을 의미합니다. <br>

자신의 세션 ID를 가지고 있는 특정 백엔드 서버로만 요청하기 때문에 세션 불일치 문제를 해소할 수 있습니다. 하지만 특정 서버로만 요청이 몰릴 수 있는 상황이 있고, 서버가 다운되면 해당 서버에 붙어 있는 세션들이 소실될 수 있습니다.

- [AWS Elastic Load Balancing Feature: Sticky Sessions](https://aws.amazon.com/ko/blogs/aws/new-elastic-load-balancing-feature-sticky-sessions/)

<br>

## Redis를 이용한 Session 저장소 공유

세션 저장소를 별도로 둔다면 아래 그림과 같은 아키텍처를 구성할 수 있습니다. Spring Session를 이용하면 간편하게 세션 공유 저장소를 이용할 수 있습니다. 

![session3](https://raw.githubusercontent.com/wlswo/wlswo.github.io/aa3500cfea40f3e8adaa3c53d2deda49bbb556c7/assets/images/SideProject/side%234/session3.png)

이러한 세션 저장소를 이용하는 일반적인 사용자 인증 방법에는 단점도 존재합니다. 세션 저장소는 요청을 식별하기 위해 상태를 저장하는 공간입니다. 
요청이 있을때마다 세션 저장소에 매번 조회해야 하며 이는 모든 요청이 세션저장소와 강한 의존성을 띠게 됩니다. <br>

최근 많이 등장하는 MSA 환경에서도 공유 세션 저장소를 이용한다면 각 마이크로 서비스들이 세션 저장소 한 곳을 바라보게 됩니다. 즉 세션 저장소에 대한 부하관리, 세션 저장소 확장성에 있어서 관리 포인트가 증가할 수 있게 됩니다. <br>


<br><br>

# NEXT.js 도입

프론트 팀원의 합류로 백엔드와 프론트 서버를 분리하여 개발할 수 있는 기회가 생겼습니다.  Spring Boot는 Fullstack Framework로 Server Side Rendering(SSR) 방식을 사용하는 웹 프레임워크입니다. 다양한 프론트 프레임워크들 중 어떤 프레임워크를 사용할지 고민이 있었습니다.  React, Next.js, Vue.js 중에서 각각의 장단점과 현재 환경을 비교해 보기로 했습니다. 

<br>

프론트 프레임워크 선택 기준은 아래와 같았습니다.

- 기존 Spring Framework의 SSR 방식을 동일하게 가져갈 것
- 검색 엔진 최적화(SEO)를 통해 서비스를 쉽게 노출할 수 있을 것

<br>

React와 Vue는 기본적으로 CSR을 지원하며, SSR을 구현하기 위해서는 추가적인 작업이 필요합니다. 하지만 이처럼 React는 자유도가 높아 필요한 모든 기능을 직접 설정해야 하지만, 이는 프로젝트의 특수한 요구에 더 유연하게 대응할 수 있는 장점을 가지고 있습니다. Nextjs는 React 기반으로 구축되어 React의 풍부한 생태계를 활용할 수 있고 SSR 방식을 사용하므로 SEO를 가져갈 수 있는 장점이 현재 저희가 도입하기 위한 조건에 부합했습니다.

이러한 이유로 Next.js를 도입하기로 했습니다. 

<br><br>

# NEXT.js 도입과 새로운 인증 방식

Next.js를 이용한 프론트 서버 도입으로 인해 인증 방식의 변화가 필요했습니다. 뷰 페이지까지 반환하던 단일 Spring Boot 애플리케이션은 REST API로 전환해야 했고, Next.js와 REST API 성격을 가진 서버 간의 적합한 인증 방식을 생각해야 했습니다. 

<br><br>

# JWT 인증 방식 선택

세션 저장소를 매번 조회하지 않고 인증 기능을 구현할 수 있는 방법으로 JWT를 이용하여 해결할 수 있었습니다. <br>

백엔드 서버가 여러대일 경우 클라이언트는 어떤 백엔드 서버에서 JWT 를 발급받았는지 알 수 없습니다. 클라이언트는 L4, L7, ELB 등에 의해서 백엔드 서버 중 1대로 요청하게 됩니다. 

![jwt1](https://raw.githubusercontent.com/wlswo/wlswo.github.io/730224d40b92ee11254e5e0f179da343d3aca294/assets/images/SideProject/side%234/jwt1.png)

각 백엔드 서버는 동일한 검증 전략으로 토큰의 유효성을 판단합니다. 각 백엔드 서버에서 해당 토큰이 유효한지 검증하기 위해서는 모두 동일한 시크릿키를 보유하고 있어야 합니다. JWT 토큰에 대한 인증 검증을 백엔드 서버에서 직접하기 때문에 사용자의 식별 정보를 세션 저장도에 보관하지 않아도 됩니다.  <br>

요청이 있을 때마다 세션 저장소를 거치지 않아도 되는 장점이 존재합니다. 이는 백엔드 서버가 각 요청을 식별하기 위한 상태정보를 가지고 있지 않음을 의미합니다. 이러한 stateless한 인증방식은 다음의 장점을 가집니다. <br>

- 상대적으로 가볍다. 서버가 요청을 식별하기 위한 정보를 client가 작은 크기로 부담하게 됩니다.
- 확장하기 쉽습니다. 서버가 가지고 있는 세션을 거치지 않기 때문에 서버를 증설하거나 축소하는 스케일링에 적용하기 용이합니다. 

<br>

한편 단점으로는 클라이언트에서 인증 정보를 관리하기 때문에 보안과 관련한 문제들을 적절히 수행할 수 있어야 합니다. 저희 프로젝트에서는 탈취를 대비하여 JWT 토큰에 대한 만료시간을 짧게 설정하였습니다. refresh 토큰을 두어 만료시간을 갱신하여 자주 로그인 시도를 하는 나쁜 UX 경험을 최소화 하고자 했습니다.  

<br><br>

시퀀스 다이어그램을 그려보며 큰 흐름을 이해하기로 했습니다. 아래 시퀀스 다이어그램은 고민과 시행착오를 거쳐 완성된 현재 인증 방식 Flow입니다.

![oauthFlow](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%234/oauth%20flow.drawio.png?raw=true)

기존 프로젝트의 Spring Boot는 역할은 Client 측을 thymleaf로, Server 측을 Springboot로 사용하여 전통적인 MVC 패턴 흐름으로 인증을 처리했었습니다. NEXT.js 도입으로 인해 thymleaf 의 역할을 NEXT.js로 가져가면서 기존의 Spring Boot에서 처리하던 Flow를 그대로 가져갈 수 있게 되었습니다.

NEXT.js가 thymleaf의 역할을 하므로 직접 인증 서버를 바라보며 로그인 페이지를 사용자에게 반환합니다. 

로그인이 성공적으로 진행되면 인증서버에서 받아온 Access Token을 Spring Boot로 보내 유저 정보를 받아올 수 있도록 합니다. 

이 시점은 저희 서비스를 이용하기 위한 인증 과정으로 Access Token이 변조되지 않았는지, 실제로 SNS 로그인에 성공한 것인지 검증하는 단계입니다. 

JWT 발급을 위해 Access Token으로 유저 정보를 요청합니다. 유저 정보로 기존 회원인지 새로운 회원인지를 검사하며 기존 회원인 경우 JWT 발급을 통해 로그인 과정을 마무리합니다. 새로운 회원이라면 JWT 토큰 발급을 미루고 회원가입을 위해 받아온 유저 정보를 NEXT.js 측으로 응답합니다. 이후 NEXT.js는 회원가입 페이지를 반환하고 사용자는 회원가입을 통해 JWT 발급 받습니다. 

<br><br>

## Spring Boot

*시퀀스 다이어그램의 순서에 맞게 설명합니다.* 

Spring Boot 입장에서 인증이 시작되는 첫 시작은 NEXT.js 에서 넘어온 Access Token으로 유저 정보를 요청하는 부분입니다. 

![loginController](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%234/%EC%BB%A8%ED%8A%B8%EB%A1%A4%EB%9F%AC.png?raw=true)

로그인 컨트롤러가 Access Token을 받아 유저 정보를 받아오고 JWT를 발급하는 서비스를 호출합니다.

해당 컨트롤러는 두 가지 응답을 반환합니다.

### 기존 회원인 경우 JWT 발급

```json
{
	"accessToken" : "eyJhbGciOiJIUzM4NCJ9.eyJyb2xlcyI6WyJVU0VSIl0sImlkIjoyLCJlbWFpbCI6InRlc3RAZ2l0aHViLmNvbSIsInN1YiI6ImFjY2VzcyB0b2tlbiIsImlhdCI6MTcwMTUyNjQyNSwiZXhwIjoxNzAyMTI1ODI1fQ.Enb4J1vARc-MsHMlCHIwrGFY-aPSULKnmcQfzo88xWCujLDgHfJNg_xqWvzCwQJD",
	"refreshToken" : "eyJhbGciOiJIUzM4NCJ9.eyJyb2xlcyI6WyJVU0VSIl0sImlkIjoyLCJlbWFpbCI6InRlc3RAZ2l0aHViLmNvbSIsInN1YiI6ImFjY2VzcyB0b2tlbiIsImlhdCI6MTcwMTUyNjQyNSwiZXhwIjoxNzAyMTI1ODI1fQ.Enb4J1vARc-MsHMlCHIwrGFY-aPSULKnmcQfzo88xWCujLDgHfJNg_xqWvzCwQJD",
	"result" : true
}
```

### 새로운 회원인 경우

```json
{
	"id": "kakao38129381",
	"result" : false
}
```

하나의 메소드에서 두 개의 다른 응답을 반환하기 위해서 아래와 같은 방법이 존재했습니다.

- ResponseEntity의 타입을 Object로 열어두어 다양한 타입을 반환한다.
- 응답 DTO를 추상화하여 반환 값이 다른 두 개의 dto 클래스를 생성하여 상속받는다. ✅

Object로 열어두는 것 보다 추상 클래스의 상속 클래스의 타입만 들어올 수 있도록 제한하였습니다.

![응답DTO](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%234/response.png?raw=true)

컨트롤러에서 호출하는 jwt 발급 서비스입니다. 

![유저서비스.png](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%234/%EC%9C%A0%EC%A0%80%EC%84%9C%EB%B9%84%EC%8A%A4.png?raw=true)

각 소셜 로그인마다 유저 정보를 받아오는 요청이 다르기 때문에 각 Provider 별로 요청할 수 있도록 따로 구현해 둡니다.

각 Provider 별로 유저정보를 가져오기 위해 Rest API를 호출할 수 있는 RestTemplate을 사용합니다. 

Json, XML, String 응답을 받을 수 있으며 유저 정보는 Json 문자열로 응답받습니다. 
헤더에 access token을 삽입하고  각 Provider 별로 정해진 url로 GET 요청을 진행합니다.

![유저정보 가져오기.png](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%234/%EC%9C%A0%EC%A0%80%EC%A0%95%EB%B3%B4%20%EA%B0%80%EC%A0%B8%EC%98%A4%EA%B8%B0.png?raw=true)

요청이 성공적일 경우 유저 정보가 Json 구조의 문자열 타입으로 응답이 오게됩니다. 

![google응답.png](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/SideProject/side%234/google%EC%9D%91%EB%8B%B5.png?raw=true)

 Json 구조의 문자열이기 때문에 Java객체로 직렬화를 위해 `GsonBuilder`를 사용합니다. 

`setFieldNamingPolicy(FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES)` 를 호출하여 Gson이 사용할 필드 네이밍 규칙을 설정합니다. 필드 이름을 소문자 및 언더스코어(_)로 변환하였습니다.

`gson.fromJson(response.getBody(), OauthUserInfoDto.UserInfo.class)`를 사용하여 Gson을 통해 JSON 문자열을 Java 객체로 변환하며 타겟 클래스를 OauthUserInfoDto.UserInfo.class 로 설정합니다.

UserInfo.Class 는 Dto와 같은 역할을 합니다.  id값만을 필요로 하기 때문에 문자열 타입의 필드를 설정합니다.

```java
//OauthUserInfoDto.UserInfo.class

public class OauthUserInfoDto {

	@Setter
	@Getter
	public static class UserInfo {
		private String id;
	}
}
```

각 인증 서버의 ID 값이 중복될 여지가 있기에 받아온 id에 SNS 타입을 적절히 섞어 유저 PK로 사용토록 했습니다.

- ex. id (PK) :  **google48299183**
    - 받아온 id 앞에 google, kakao, github 타입을 붙여 중복가능성을 제거합니다.

기존 회원인 경우 JWT 발급을 진행하고, 새로운 유저인 경우 id값을 반환해 회원가입을 진행합니다.
이로써 Oauth2를 이용한 JWT 발급 과정을 통해 stateless한 인증 전략을 가져갈 수 있습니다.

인증의 한 부분인 로그인의 과정이 끝났습니다. 이제 stateless한 인증의 이점을 살리기 위해 로그인 이후의 **검증과 인가**에 대한 전략을 어떻게 세울 것인가 고민이 필요했고 Spring Filter를 이용하여 검증을 진행했습니다.

<br><br>

# Speing Security 인증 & 인가

요청이 오면 여러 필터들이 묶인 필터체인을 거치게 됩니다. JWT를 검증하기 위한 새로운 필터를 생성하여 스프링 시큐리티에 등록합니다. 

![jwt2](https://raw.githubusercontent.com/wlswo/wlswo.github.io/c0c6cc484dc68c0f17e26128dd90fa7517831766/assets/images/SideProject/side%234/jwt2.png)

`getTokenInHeaderAndVerify` 메서드로 토큰을 검증합니다. 해당 메서드는 헤더에서 꺼낸 JWT를 시크릿 키로 복호화하는 작업입니다. 복호화 된  header, payload를 시크릿 키와 함께 해싱했을 때 JWT발급 할때 사용했던 시그니처키와 동일한지 비교합니다. 

토큰 검증 과정중 예외가 발생하면 그에 맞는 예외 응답을 반환하도록 진행합니다.

인증에 성공하면 Spring이 관리하는 SecurityContext에 인증 객체를 설정해줍니다.

JWT 필터를 SecurityConfig의 filterChain에 등록시켜 줍니다.

![jwt3.png](https://raw.githubusercontent.com/wlswo/wlswo.github.io/c0c6cc484dc68c0f17e26128dd90fa7517831766/assets/images/SideProject/side%234/jwt3.png)

이제 모든 사용자의 요청은 해당 필터를 통과하게 됩니다.
