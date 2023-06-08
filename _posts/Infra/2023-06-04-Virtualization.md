---
title: 여러 개의 서버를 효율적으로 관리하기 위한 도구
date: 2023-06-04-21:17
categories:
 - Infra 
tags: 
 - Cloud
 - Virtualization
---

## 물리적인 하드웨어 리소스를 모방하여 생성해내는 기술
> 하드웨어 자원을 격리시켜 효율적으로 관리할수 있는 방법에 대해 알아봅니다.  

<br/><br/><br/>

## 목표
- 가상화에 대해 이해합니다.
- 가상화를 사용하는 이유에 대해 알아봅니다.

<br><br>


# 가상화(Virtualization)와 하이퍼바이저(Hypervisor)


## 가상화란

> 서버, 스토리지, 네트워크 및 기타 물리적 시스템에 대한 표현을 생성하는데 사용하는 기술
가상 소프트웨어는 물리적 하드웨어의 기능을  모방하여 하나의 물리적 머신에서 여러 가상 시스템을 동시에 실행합니다. 기업은 가상화를 사용하여 하드웨어 리소스를 효율적으로 사용하여 투자 대비 이익을 얻을 수 있습니다.
> 

<br><br>

컴퓨팅에 필요한 물리적 자원을 복제하는 기술입니다.

물리 자원을 복제하여 가상의 자원을 생성하는 행위를 “가상화”한다 라고 표현합니다. 

*물리적 자원 : CPU, 메모리, 디스크, 네트워크, 사운드 카드 등*

<br/><br/><br/>

## 가상화를 쓰는 이유

<br><br>

### 리소스 비용 절감

가상화 기술을 사용하는 가장 큰 이유는 “**리소스 비용 절감**” 효과의 기댓값입니다. 기존 물리 장비에서 사용하던 서버나 애플리케이션을 클라우드 기반의 가상화 된 환경으로 마이그레이션 함으로써 물리 자원의 소비를 줄일 수 있습니다.

<br><br>

### 복구 용이성

가상화 환경을 구축하여 물리적 자원에서부터 격리시킨 시스템을 구축함으로써 문제가 발생해도 전체 시스템에 영향을 미치는 것을 방지할 수 있습니다. 

<br><br><br><br>

# Hyperviser

> **VM(Virtual Machine) 을 생성하고 실행하는 프로세스**입니다. 메모리 및 처리와 같은 단일 호스트 컴퓨터의 리소스를 가상으로 공유하여 **호스트 컴퓨터가 여러 게스트 가상 머신을 지원할 수 있도록** 합니다.
> 

하이퍼바이저는 가상화를 지원하는 프로세스이빈다. 실제 물리 자원을 가상화하고 이를 VM(Guest OS)이 사용할수 있도록 중간에서 “매개체” 역할을 하는 SW입니다. 

대표적으로 알려진 하이퍼바이저는 Hyper-V인 반면에, 리눅스에서는 가상화를 위해 KVM/QEMU 하이퍼바이저를 기본적으로 지원하고 있습니다.  
<br><br>

KVM (Kernel-based Virtual Machine)

- 리눅스 커널의 mainline에 포함된 정식 커널 모듈 중 하나입니다.
- 동일 하드웨어에서 구동하기 위해 **가상 환경**을 구축하고 관리하는 것
    - 가상화 기술

QEMU 

- 이기종 하드웨어에서 구동하기 위해 **가상의 하드웨어 환경을 소프트웨어적으로 구현**한 것
    - 에뮬레이션

<br>

하이퍼바이저는 하드웨어를 직접 제어할 권한이 있습니다. 나아가 **VM에 대한 라이프 사이클을 관리**, 마이그레이션, 실시간 리소스 할당 등 다양한 기능들을 수행합니다.

<br><br>

💡 하이퍼바이저는 **타입1**과 **타입2**로 구분할 수 있습니다. 두 타입의 차이는 **호스트 OS 필요 여부에 따라 구분**됩니다. 

<br>

- 타입1
    - 네이티브 혹은 베어 메탈 하이퍼바이저라고 불립니다. 그림1과 같이 하이퍼바이저가 하드웨어와 직접 상호작용 하는 것이 특징입니다.
    - 구체적으로는 호스트 OS 상에 하이퍼바이저가 올라가지 않고 직접 하드웨어를 제어할 수 있음을 의미합니다.
    - Host OS 계층에 존재한다고 봐도 무방합니다.
    - 위에서 본 KVM/QEMU, XEM 등이 대표적인 타입1 하이퍼 바이저에 속합니다.

![type1](https://raw.githubusercontent.com/wlswo/wlswo.github.io/2f360a98cebed137c65e72e150fa9041546f97a6/assets/images/Infra/virtualization-type1.png)

- 타입2
    - 타입2는 호스트OS 위에서 동작합니다.
    - 따라서 호스티드 하이퍼바이저라고 부릅니다.
    - VM이 타입2에 속합니다.

![type2](https://raw.githubusercontent.com/wlswo/wlswo.github.io/2f360a98cebed137c65e72e150fa9041546f97a6/assets/images/Infra/virtualization-type2.png)