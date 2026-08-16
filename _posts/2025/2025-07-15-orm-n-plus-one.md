---
layout: minimal_post
title: "N+1 쿼리는 ORM의 잘못이 아니다"
date: 2025-07-15 06:58:00 +0900
description: "지연 로딩이라는 합리적인 기본값이 어떻게 함정이 되는지, 그리고 각 해법의 한계."
---

### 어떻게 생기나

주문 목록을 조회하고 각 주문의 회원 이름을 출력한다.

```java
List<Order> orders = orderRepository.findAll();   // 1번
for (Order order : orders) {
    System.out.println(order.getMember().getName());  // N번
}
```

목록 조회 1번, 그리고 주문마다 회원 조회 1번씩. 주문이 100건이면 쿼리가 101번 나간다.

### 지연 로딩은 합리적인 기본값이다

ORM을 탓하기 쉽지만, 지연 로딩 자체는 타당한 선택이다.

주문을 조회할 때마다 연관된 회원·상품·배송 정보를 전부 가져온다면, 쓰지도 않을 데이터를 매번 읽는다. 연관이 연관을 물고 테이블 열 개를 조인하는 일도 생긴다. **필요할 때 가져오는 편**이 기본값으로는 맞다.

문제는 "필요할 때"가 **반복문 안**일 때다. ORM은 그게 반복문인지 알 수 없다.

### 해법들과 각각의 한계

**fetch join**

한 번의 쿼리로 연관까지 가져온다.

```java
@Query("select o from Order o join fetch o.member")
List<Order> findAllWithMember();
```

가장 직접적이지만 제약이 있다.

- **컬렉션은 하나만** fetch join할 수 있다. 둘 이상이면 카테시안 곱이 생긴다
- **컬렉션 fetch join에는 페이징을 쓸 수 없다.** 조인 결과의 행 수와 엔티티 수가 달라, 하이버네이트가 전부 메모리로 읽은 뒤 잘라낸다(경고 로그가 남는다)

**batch size**

```yaml
spring.jpa.properties.hibernate.default_batch_fetch_size: 100
```

연관을 개별 조회하는 대신 `IN` 절로 묶는다. N번이 N/100번이 된다.

쿼리를 완전히 없애지는 못하지만 **페이징과 함께 쓸 수 있다.** 컬렉션 연관에는 사실상 이쪽이 표준적인 답이다.

**DTO 프로젝션**

애초에 엔티티를 안 쓰고 필요한 컬럼만 조회한다.

```java
@Query("select new com.example.OrderView(o.id, m.name) " +
       "from Order o join o.member m")
```

화면에 맞춘 조회라면 가장 단순하고 빠르다. 대신 영속성 컨텍스트의 이점(변경 감지 등)은 없다.

### 근본 원인

객체는 참조를 따라 하나씩 탐색한다. 데이터베이스는 집합을 한 번에 다룬다. **N+1은 이 둘의 어긋남이 드러나는 지점**이다.

그래서 완전히 없앨 수는 없고, 어긋나는 자리를 찾아 명시적으로 처리하는 수밖에 없다.

### 실무에서

- 개발 환경에서 **SQL 로그를 켜둔다.** 눈에 보이지 않으면 잡을 수 없다
- 컬렉션은 batch size, 단일 연관은 fetch join을 기본으로 잡는다
- 목록 화면은 DTO 조회를 먼저 검토한다
