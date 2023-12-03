---

title: Side Project | 2. 스프링부트 2 에서 3로 마이그레이션 하기

date: 2023-11-12-16:57

categories:

- Side Project 

tags: 

- Springboot
- Migration

---

## 사이드 프로젝트 스프링 부트 버전 변경
> 사이드 프로젝트의 스프링 부트 버전을 변경해봅니다.

<br><br>

# 개요

- 기존의 프로젝트의 spring boot 버전을 2에서 3으로 변경해 봅니다.
- java 버전을 11 에서 17로 업그레이드 합니다.
- 그 과정을 정리 합니다.

<br><br>

# 1. JDK 17 이상으로 변경

스프링 부트2 와 3의 가장 큰 변화는 스프링 부트3에서 더이상 JDK 17 미만의 버전을 지원하지 않는다는 것입니다. 기존 프로젝트는 JDK 11 버전을 사용하고 있기 때문에 JDK 버전 업그레이드를 진행합니다.

## 1.1 build.gradle 수정

```yaml
sourceCompatibility = '17'
```

## 1.2 Intellij JDK 변경

### 1.2.1 Project Structure 설정

**[File] -> [Project Structure] -> [Project]** 선택

JDK 17 설정

![1](https://raw.githubusercontent.com/wlswo/wlswo.github.io/1b521d0f6d04c72c1680c8e097e366850c7b7cb5/assets/images/SideProject/1.png)

<br>

## 1.2.2 Java Compiler 설정

**[Settings] → [Build, Execution, Deployment] → [Compiler] → [Java Compiler]** 선택

![2](https://raw.githubusercontent.com/wlswo/wlswo.github.io/1b521d0f6d04c72c1680c8e097e366850c7b7cb5/assets/images/SideProject/2.png)


## 1.2.3 Gradle JVM 변경

**[Build, Execution, Deployment] -> [Build Tools] -> [Gradle]** 선택

Gradle JVM 17로 변경합니다.

![3](https://raw.githubusercontent.com/wlswo/wlswo.github.io/1b521d0f6d04c72c1680c8e097e366850c7b7cb5/assets/images/SideProject/3.png)

<br><br>

# 2. 스프링 부트 2.7.17 업그레이드

스프링부트3으로 업그레이드 하기전 스프링부트 2버전의 가장 높은 버전으로 업그레이드를 거쳐야 합니다. 바로 스프링부트3으로 넘어가는 것은 스프링부트3에 변경된 많은 내용으로 인해 마이그레이션이 복잡해 지는 경우가 있습니다. 순차적으로 버전을 거쳐 업그레이드 하는 것이 좋습니다.

현재 게시글 작성일 기준으로 2.7.17 버전이 스프링 부트 2의 가장 높은 버전입니다. 


## 2.1 build.gradle 수정

```yaml
implementation 'org.springframework.boot:spring-boot:2.7.17'
```

<br><br>

# 3. 2.7.17 Deprecation 제거

2.7.17 버전에서 Deprecated 되어있는 기능을 확인하고 변경해야 합니다.

2.7.17 업그레이드 후 확인결과 Deprecated된 기능은 없는 것으로 확인되어 수정된 코드는 없습니다.

<br><br>

# 4. 스프링 부트 3 로 업그레이드

이제 gradle에서 스프링 부트 3로 업그레이드를 진행합니다.

## 4.1 build.gradle 수정

```yaml
implementation 'org.springframework.boot:spring-boot:3.0.0'
```

gradle 설정 후 리로드하여 스프링 부트3 의존성들을 다운로드 합니다.

<br><br>

# 5. 컴파일 에러 해결

버전 업데이트하면서 다양한 컴파일 에러를 만날 수 있습니다. 제 프로젝트에서 변경된 부분을 정리합니다.

## 5.1 Querydsl 설정 변경

javax.persistence.*가 jakarta.persistence.*로 변경되면서 Querydsl 관련 build.gradle 설정 변경이 필요합니다.

- queryDsl 플러그인을 제거
- queryDsl 의존성 네이밍 변경

```java
plugins {
    //queryDsl 플러그인 제거 
    //id 'com.ewerk.gradle.plugins.querydsl' version "1.0.10"
}

implementation "com.querydsl:querydsl-jpa:5.0.0:jakarta"      
annotationProcessor "com.querydsl:querydsl-apt:5.0.0:jakarta" 
annotationProcessor "jakarta.annotation:jakarta.annotation-api"
annotationProcessor "jakarta.persistence:jakarta.persistence-api"
```

## 5.2 스프링 시큐리티 변경

SecurityConfig 에서 다음과 같은 메서드들을 변경하였습니다.

- authorizeRequests() → authorizeHttpRequests()
- antMatchers() → requestMatchers()
- regexMatchers() → RegexRequestMatchers()


## 5.3 javax 패키지를 jakarta 로 변경

스프링 부트3로 업그레이드 했을때 가장먼저 만나는 에러입니다. JavaEE에서 Jakarta EE로 전환하며 패키지 이름이 변경되었습니다. javax로 시작하는 패키지 이름을 전부 jakarta로 변경합니다.

![4](https://raw.githubusercontent.com/wlswo/wlswo.github.io/1b521d0f6d04c72c1680c8e097e366850c7b7cb5/assets/images/SideProject/spring2%20to%203%20javax.png)

- javax.persistence.* ➔ jakarta.persistence.*
- javax.validation.* ➔ jakarta.validation.*
- javax.servlet.* ➔ jakarta.servlet.*
- javax.annotation.* ➔ jakarta.annotation.*
- javax.transaction.* ➔ jakarta.transaction.*


## 5.4 Jpa Dialect 설정 삭제

 springboot3 에서 dialect 설정 부분이 변경되었으며, Dialect 설정을 하지 않는 것이 더욱 좋은 방법이기에  기존 코드에 존재하던 JPA Dialect 설정옵션을 삭제했습니다.

ORM의 큰 특징중 하나는 객체 맵핑을 통해 자동으로 쿼리를 작성해주는 것입니다. 하지만 수 많은 DBMS 종류가 있고 각 종류마다 쿼리가 조금씩 다르기 때문에, 이를 알릴 수 있도록 데이터베이스 유형을 지정하도록 하는 것이 **Dialect** 설정 입니다.

이런 Dialect 설정은 연결되는 Springboot 실행 시, 연결되어있는 데이터베이스에 알맞게 자동으로 지정이 되므로, 특별한 이유가 존재하지 않는 이상 수동으로 설정할 필요가 없습니다.


### 5.4.1 application.yml 수정

```yaml
jpa:
    #database-platform: org.hibernate.dialect.MySQL5InnoDBDialect  # JPA 데이터베이스 플랫폼 (InnoDB)
```