---

title: Side Project | 5. 효과적인 API 디자인 Public과 Private 엔드포인트 분리, Argument Resolver를 활용한 관심사 분리하기

date: 2023-12-17-11:51

categories:

- Side Project 

tags: 

- Spring Boot
- AOP
- Argument Resolver

---

## Public과 Private API를 분리, 공통 관심사의 중복 코드 제거
> 사이드 프로젝트에 적용한 API 디자인과 Argument Resolver를 적용한 과정을 정리합니다.

<br><br>

# 목표
- 인증이 필요한 API를 분리하여 적용한 과정을 기술해봅니다.
- Argument Resolver을 적용하여 중복 코드를 제거해 봅니다.
- 적용 방법에 대해 정리합니다.

<br><br>



# 개요

MoCo2는 로그인이 된 사용자만 호출할 수 있는 API와 누구든 호출할 수 있는 API가 나뉘어 존재합니다. 이에 API를 분리한 방법을 설명하고 그에 따른 인증 로직과 로그인한 유저 정보를 가져오는 관심사를 분리한 경험을 정리해 봅니다. 

<br><br>


# Private API, Public API 

<br>

**로그인 유저만 호출 가능한 API**
- 게시글 생성, 수정, 삭제
- 댓글 생성, 수정, 삭제
- 북마크 추가, 제거

<br>

**누구든 호출 가능한 API**

- 게시글 목록 조회, 상세 조회

<br><br>

로그인된 유저만 호출 가능한 API는 매 요청마다 헤더에 Jwt를 삽입하여 요청해야 합니다. JwtFilter를 거쳐 만료되지 않고 유효한 토큰임을 인증 받아야만 로그인된 사용자라고 판별하고 해당 API들을 정상적으로 호출할 수 있습니다. 

로그인이 되어있는 유저만이 호출 가능한 API 와 누구든 호출 가능한 API url를 어떻게 효과적으로 분리하여 적용할 수 있었는지 작성합니다.

일반적으로 REST API 설계의 관례에서 인증이 필요하거나 특정 권한이 필요한 경우 **`/private/~`** 또는 **`/api/v1/private/~`**와 같이 경로를 지정합니다. 예를 들면 로그인한 사용자에게만 허용되는 리소스에 해당합니다.

누구나 접근할 수 있으며 인증이 필요하지 않은 경우, **`/public/~`** 또는 **`/api/v1/public/~`**와 같은 경로를 사용합니다. 예를 들면, 공용 정보를 제공하는 리소스에 해당합니다.

API 디자인 및 보안 요소를 효과적으로 구현하기 위해서는 다양한 요구사항을 고려해야 했습니다. 특히, Private 및 Public API를 분리하고 인증 전략 구성에서 설계의 복잡성이 증가했습니다.

이러한 REST API 가이드라인을 따르면서 아래와 같은 사항을 고려했습니다. 이에 따라 저희는 아래 표와 같은 방식으로 API 경로를 분리했습니다.

- 명확한 의미를 가져야 한다.
    - 경로는 API 의도를 명확하게 전달해야 합니다.
- 일관성을 가져야 한다.
    - API 디자인에서 일관성은 굉장히 중요합니다. 기존의 구조와 일치하도록 선택된 경로가 다른 부분과 어떻게 조화 되는지 고려해야 합니다.
- 버전 관리
    - API 버전을 명시적으로 관리하는 것도 중요합니다. **`/api/v1/private/~`**와 같은 방식으로 버전을 명시하면 이후 변경에 유연하게 대응할 수 있습니다.

ex) 게시글 API 

| 구분 | API URL | 설명 |
| --- | --- | --- |
| Private API 🔒 | /api/v1/private/~ | 로그인된 유저만 호출 가능 |
|  | [POST] /api/v1/private/posts/{postId} | 게시글 작성 |
|  | [PUT] /api/v1/private/posts/{postId} | 게시글 수정 |
|  | [DELETE] /api/v1/private/posts/{postId} | 게시글 삭제 |
| Public API ✅ | /api/v1/public/~ | 누구든 호출 가능 |
|  | [GET] /api/v1/public/posts | 게시글 목록 조회 |
|  | [GET] /api/v1/public/posts/{postId} | 게시글 상세 조회 |


<br><br>

# API 분리로 인한 인증 전략

Private API와 Public API를 구분하는 데 있어서 인증 및 권한 처리에 대한 구체적인 전략을 세워야 했습니다. 

현재 모든 API를 호출하는 요청은 JwtFilter를 거쳐 헤더에 유효한 JWT를 가지고 있어야만 스프링 컨테이너 진영으로 요청이 도달하게 됩니다. 

<br><br>

## Public API 설정

Public API에 대해서는 이러한 인증 과정을 생략해야 합니다.  아래 그림과 같은 Flow로 진행되어야 합니다.

요청은 JwtFilter를 거치지 않아야 하고 인증 정보를 보관하는 SecurityContext 에는 익명 사용자정보를 담아 해당 리소스에 접근할 수 있도록 허용해야 합니다. 

![securit1.png](https://raw.githubusercontent.com/wlswo/wlswo.github.io/a62e08de87782f0f8abcc9cacb5fa27eed10c213/assets/images/SideProject/side%235/securit1.png)

`JwtVerificationFilter` 는 `OncePerRequestFilter` 를 상속받아 구현한 필터입니다. `OncePerRequestFilter`는 요청이 해당 필터를 거치지 않을수 있는 기능인 `shouldNotFilter` 메서드를 지원합니다.

<br>

![security2.png](https://raw.githubusercontent.com/wlswo/wlswo.github.io/a62e08de87782f0f8abcc9cacb5fa27eed10c213/assets/images/SideProject/side%235/security2.png)

shouldNotFilter는 API Path을 검사하여 excludPath로 설정한 문자열로 시작할 경우 true를 반환하여 해당 필터를 거치지 않습니다. 

두 번째는 Security Context Holder에 익명 사용자 권한을 저장하여 요청이 허용될 수 있어야 합니다. 이 작업은 Security 의 permitAll()을 이용하여 처리할 수 있습니다. 

![security3.png](https://raw.githubusercontent.com/wlswo/wlswo.github.io/a62e08de87782f0f8abcc9cacb5fa27eed10c213/assets/images/SideProject/side%235/security3.png)


<br><br>

## Private API 설정

인증이 필요한 API 인 경우 `JwtVerificationFilter`를 통해 토큰의 유효성을 검증받아야 하며 Security Context에 사용자 인증 정보가 담겨져 있어야 합니다. 이는 Security의 authenticated() 를 이용하여 사용자가 인증되었는지 여부를 확인할 수 있습니다. 

- **`authenticated()`** 메서드의 메커니즘
    
    **`authenticated()`** 메서드의 메커니즘은 Spring Security의 **`ExpressionUrlAuthorizationConfigurer`**에서 제공하는 메서드 중 하나입니다. 이 메서드는 SpEL (Spring Expression Language)을 사용하여 사용자의 인증 여부를 평가합니다. 
    
    **`ExpressionUrlAuthorizationConfigurer`** 는 “보안 감독관”의 역할처럼 “통행 승인 여부”를 검토하여 어떤 사용자가 어떤 경로에 접근할 수 있는지를 결정합니다. 
    
    Spring Security의 SpEL을 사용하면 다양한 조건을 정의하여 접근 권한을 설정할 수 있습니다. **`authenticated()`**는 그 중에서 현재 사용자가 인증되었는지 여부를 검사합니다. 이를 위해 내부적으로는 **`SecurityContextHolder`**에서 **`Authentication`** 객체를 가져와 해당 객체가 **`AnonymousAuthenticationToken`**이 아닌지 여부를 확인합니다.
    
<br>

이제 private api의 경우 `JwtVerificationFilter` 를 통해 security context에 현재 로그인된 유저 정보가 저장되어야만 Spring 진영의 Controller 레이어로 요청이 도달합니다.

<br><br>

# Security Context의 유저 정보 획득 중복 코드 제거

여러 인증 과정을 거쳐 들어온 요청은 Security Context에 유저 정보가 담겨있습니다. 

> **Security** **Context는 Thread Local 하기 대문에 한 쓰레드에서 공용으로 저장하는 객체입니다. 파라미터를 넘기지 않더라도 데이터에 접근이 가능한 성질을 가지고 있습니다. 즉 authentication을 한 쓰레드 내에서 공유할 수 있습니다*.***
> 

이러한 특징을 이용해서 Controller 레이어에서 현재 로그인한 유저의 정보를 쉽게 가져올 수 있습니다.

![security4.png](https://raw.githubusercontent.com/wlswo/wlswo.github.io/a62e08de87782f0f8abcc9cacb5fa27eed10c213/assets/images/SideProject/side%235/security4.png)

위처럼 Security Context에 쉽게 접근할 수 있지만 이는 공통된 관심 사항으로 중복 코드가 발생합니다. Spring은 이러한 문제를 해결하기 위해 소스 코드에 퍼져 있는 공통 관심 사항을 한 곳에 모아 별도의 기능으로 분리시킬수 있는 기능을 제공합니다. 대표적으로 AOP가 존재합니다. 

AOP 말고도 **Argument Resolve** 라는 것이 존재합니다. 이 둘은 두 기술 모두 코드의 모듈화와 재사용성을 증가시키는 것에 공통점을 가지고 있지만 사용하는 목적에 있어 그 방향이 다릅니다. 

<br>

**AOP 목적**

- AOP는 메서드 실행 전, 후 또는 예외 발생 시 등과 같은 특정 지점(pointcut)에서 관심사를 적용합니다.
- 주로 로깅, 트랜잭션 처리, 보안 등과 같은 횡단 관심사에 주로 적용됩니다.

**적용 대상**

- AOP는 메서드 실행 전, 후 또는 예외 발생 시 등과 같은 특정 지점(pointcut)에서 관심사를 적용합니다.
- 주로 로깅, 트랜잭션 처리, 보안 등과 같은 횡단 관심사에 적용됩니다.

<br>

**Argument Resolver 목적**

- Argument Resolver는 주로 웹 애플리케이션에서 HTTP 요청의 파라미터나 헤더 등에서 필요한 값을 추출하여 메서드의 파라미터로 주입하는 데 사용됩니다.
- 주로 사용자 요청과 관련된 정보를 효과적으로 추출하여 컨트롤러에서 사용 가능하게 합니다.

**적용 대상**

- 주로 웹 애플리케이션의 컨트롤러에서 사용자 요청과 관련된 정보를 추출하는 데 활용됩니다.
- SecurityContext나 인증된 사용자 정보 등을 메서드 파라미터로 주입할 수 있습니다.

Argument Resolver를 이용하여 SecurityContext나 인증된 사용자 정보 등을 메서드 파라미터로 주입하는 방식을 이용해 코드를 리팩토링를 진행하였습니다.

Context에 있는 유저의 ID와 권한을 가져와 UserInfo 에 담아줍니다.

![security5.png](https://raw.githubusercontent.com/wlswo/wlswo.github.io/a62e08de87782f0f8abcc9cacb5fa27eed10c213/assets/images/SideProject/side%235/security5.png)

<br>

특정 어노테이션이 붙은 곳에서만 사용하고 싶기에 커스텀 어노테이션을 구현합니다.

![security6.png](https://raw.githubusercontent.com/wlswo/wlswo.github.io/a62e08de87782f0f8abcc9cacb5fa27eed10c213/assets/images/SideProject/side%235/security6.png)

<br><br>

### **HandlerMethodArgumentResolver 인터페이스**

Argument Resolver를 만들기 위해서는 클래스가 **`HandlerMethodArgumentResolver`** 를 구현해야 합니다.  **`HandlerMethodArgumentResolver`** 는 두개의 메소드를 가지고 있습니다.

- **`supportsParameter()`** : 주어진 메소드의 파라미터가 이 Argument Resolver에서 지원하는 타입인지 검사합니다. 지원한다면 **`true`** 를, 그렇지 않다면 **`false`** 를 반환한다.
- **`resolveArgument()`** : 이 메소드의 반환값이 대상이 되는 메소드의 파라미터에 바인딩됩니다.

<br><br>

**LoginUserArgumentResolver** 구현

![security7.png](https://raw.githubusercontent.com/wlswo/wlswo.github.io/a62e08de87782f0f8abcc9cacb5fa27eed10c213/assets/images/SideProject/side%235/security7.png)

supportParameter 함수에서 사전에 만든 어노테이션에 매핑될 수 있도록 검사합니다. 

resolveArgument 에서는 공통 관심사인 security context에서 유저 정보를 가져와 UserInfo에 매핑될 수 있도록 반환 합니다. 

 아래 코드와 같이 @LoginUserInfo 이 붙은 파라미터에만 UserInfo가 바인딩됩니다. 

![security8.png](https://raw.githubusercontent.com/wlswo/wlswo.github.io/a62e08de87782f0f8abcc9cacb5fa27eed10c213/assets/images/SideProject/side%235/security8.png)

해당 코드는 [Github](https://github.com/MoCo-v2/moco-v2-backend/blob/master/src/main/java/com/moco/moco/controller/PostController.java)에서 보실 수 있습니다.