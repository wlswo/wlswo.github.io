---
title: Openstack 위에 Docker Swarm Cluster배포하기
date: 2023-09-05-19:31
categories:
 - Infra 
tags: 
 - Cloud
 - Openstack
 - Docker
---

## Cloud 플랫폼위에 컨테이터 클러스터 구성
> Openstack 인프라위에 Docker Swarm 을 배포해봅니다.  

<br/><br/><br/>

## 목표
- Docker Swarm의 개념과 Openstack에 대해 알아봅니다.
- Docker Swarm을 간편하게 구성해 주는 Openstack Heat Service를 알아봅니다.
- Heat를 이용하여 Docker Swarm을 구축합니다.

<br/><br/><br/>

## 개요

오픈스택을 이용하여 인프라가 구성되어 있다는걸 전제로 설명합니다.  오픈스택 인프라위에 오케스트레이션 서비스인 Heat를 사용하여 Docker Swarm을 구성하는 방법을 정리해봅니다.

<br/><br/>

### Openstack

오픈스택은 수십 개의 오픈 소스 프로젝트들의 집합으로 간략하게 설명할 수 있습니다. 
이러한 오픈 소스 프로젝트들은 “클라우드 컴퓨팅”을 위한 주요 구성 요소들로 각각의 특징과 용도가 다릅니다.

흔히 사용하는 클라우드 플랫폼인 AWS 와 비슷한 성격을 가지고 있다고 볼 수 있습니다.

엄밀하게는 오픈스택(OpenStack)과 AWS(Amazon Web Services)는 클라우드 컴퓨팅을 위한 두 가지 주요 플랫폼이지만, 각각의 특징과 용도가 다르긴 합니다. 간략하게 설명하자면 오픈스택은 “**기업용 프라이빗 클라우드**” 환경을 구축하기 위함이고 AWS는 다수의 사용자를 타겟으로 IaaS 서비스를 제공하는 “**퍼블릭 클라우드**” 환경을 제공합니다.

프라이빗과 퍼블릭 클라우드를 같이 사용하는 하이브리드 클라우드개념도 존재합니다. 주로 민감한 데이터는 프라이빗 클라우드 플랫폼을 이용하고 온디맨드성 서비스는 퍼블릭 클라우드를 사용합니다.

다시 Openstack 으로 돌아와 Openstack 서비스들에 대해서 알아봅니다. 
AWS와 Openstack은 유사한 기능을 제공하는 서비스들이 존재합니다.  AWS의 각 서비스들과 Openstack을 빗대어 생각하면 쉽게 이해할 수 있습니다.

여기서는 Openstack의 핵심 서비스들만 정리하였습니다.

1. **Nova (Compute Service) - AWS EC2**
    - Nova는 가상 머신(VM)을 프로비저닝하고 관리하는 오픈스택의 서비스입니다.
    - AWS EC2는 비슷한 역할을 하는 서비스로, 가상 서버를 생성하고 실행합니다.
2. **Neutron (Networking Service) - AWS VPC**
    - Neutron은 네트워크를 가상화하고 관리하는 오픈스택의 서비스입니다.
    - AWS VPC는 가상 사설 클라우드 네트워크 환경을 제공하며, 네트워크 관리를 지원합니다.
3. **Cinder (Block Storage Service) - AWS EBS**
    - Cinder는 블록 스토리지를 제공하는 오픈스택의 서비스로, 가상 머신용 영구 스토리지를 관리합니다.
    - AWS EBS는 비슷한 역할을 하는 서비스로, EC2 인스턴스에 연결하여 블록 스토리지를 제공합니다.
4. **Glance (Image Service) - AWS AMI**
    - Glance는 가상 머신 이미지를 관리하는 오픈스택의 서비스입니다.
    - AWS AMI(Amazon Machine Image)는 EC2 인스턴스를 시작하기 위한 이미지를 정의하고 관리합니다.
5. **Swift (Object Storage Service) - AWS S3**
    - Swift는 객체 스토리지 서비스로, 대량의 비정형 데이터를 저장하고 검색합니다.
    - AWS S3는 비슷한 역할을 하는 서비스로, 객체 스토리지를 제공합니다.
6. **Keystone (Identity Service) - AWS IAM**
    - Keystone은 오픈스택에서 인증 및 인가를 관리하는 서비스입니다.
    - AWS IAM(Identity and Access Management)은 비슷한 역할을 하는 서비스로, 사용자 및 권한을 관리합니다.
7. **Horizon (Dashboard) - AWS Management Console**
    - Horizon은 오픈스택의 웹 대시보드로, 사용자가 리소스를 관리하고 모니터링할 수 있도록 합니다.
    - AWS Management Console은 AWS 서비스를 관리하는 데 사용되는 웹 인터페이스입니다.
8. **Heat (Orchestration Service) - AWS CloudFormation**
    - Heat는 템플릿을 사용하여 리소스를 자동으로 프로비저닝하고 스택을 관리하는 오픈스택의 서비스입니다.
    - AWS CloudFormation은 비슷한 역할을 하는 서비스로, 리소스 및 인프라스트럭처를 정의하고 배포합니다.
9. **Ceilometer (Telemetry Service) - AWS CloudWatch**
    - Ceilometer는 클라우드 환경에서 리소스 사용량 및 성능 데이터를 수집하고 모니터링하는 오픈스택의 서비스입니다.
    - AWS CloudWatch는 AWS 리소스 및 애플리케이션 성능을 모니터링하는 서비스입니다.

위와 같은 서비스들을 이용하여 AWS와 같은 클라우드 컴퓨팅 플랫폼을 구축할 수 있습니다.

예를 들어 사용자가 요청한 사양에 맞게 VM을 생성하여 제공하고, 사용자가 직접 네트워크를 구성하여 사용하려는 작업에 맞는 인프라 환경을 사용할 수 있도록 제공합니다.

<br>

# 환경

현재 사내 오픈스택 테스트베드의 인프라 구성은 아래와 같습니다. 

- Openstack 인프라를 구성하는 코어 서비스들로 이루어져 있으며 좀 더 복잡한 인프라 구성으로 되어 있지만 Docker Swarm을 구축하는데는 아래와 같은 환경으로도 가능합니다
- Openstack Version은 2022년 10월에 릴리즈된 Zed 버전을 사용합니다.
- 노드는 총 4대로 구성되어 있습니다.

<br>

### System Architecture

![openstack-arch](https://github.com/wlswo/wlswo.github.io/blob/main/assets/images/Infra/openstack-arch.png?raw=true)

실제 물리 장비인 node 구성도로는 4대의 노드로 구성되어 있습니다. 

각 노드안에 프로세스들은 실행되고 있는 프로세스들 입니다.

```bash
------------+-----------------------------+-----------------------------+-----------------------------------------
            |                             |                             |                             |
        eth0|192.168.100.11           eth0|192.168.100.12           eth0|192.168.100.13           eth0|192.168.100.14
+-----------+-----------+     +-----------+-----------+     +-----------+-----------+     +-----------+-----------+
|     (Control Node)    |     |     (Network Node)    |     |     (Compute Node)    |     |     (Storage Node)    |
|                       |     |                       |     |                       |     |                       |
|  MariaDB    RabbitMQ  |     |      Open vSwitch     |     |        Libvirt        |     |       NFS Server      |
|  Memcached  Nginx     |     |     Neutron Server    |     |      Nova Compute     |     |                       |
|  Keystone   httpd     |     |      OVN-Northd       |     |      Open vSwitch     |     |                       |
|  Glance     Nova API  |     |  Nginx  iSCSI Target  |     |   OVN Metadata Agent  |     |                       |
|  Cinder API           |     |     Cinder Volume     |     |     OVN-Controller    |     |                       |
|                       |     |                       |     |                       |     |                       |
+-----------------------+     +-----------------------+     +-----------------------+     +-----------------------+
```

<br><br>

# Heat Service Install

### 1. Heat 서비스를 위한 유저를 생성

- 대문자로 이루어진 PASSWORD와 NETWORK_HOST_NAME은 설치하는 환경에 맞추어 설정이 필요합니다.

```bash
openstack user create --domain default --project service --password PASSWORD heat
+---------------------+----------------------------------+
| Field               | Value                            |
+---------------------+----------------------------------+
| default_project_id  | 62f531f4d2934e75b8d7f11cd7d53be3 |
| domain_id           | default                          |
| enabled             | True                             |
| id                  | 03b59cb43c8547d4bf0a055dd9edd7a8 |
| name                | heat                             |
| options             | {}                               |
| password_expires_at | None                             |
+---------------------+----------------------------------+

openstack role add --project service --user heat admin

openstack role create heat_stack_owner
openstack role create heat_stack_user
openstack role add --project admin --user admin heat_stack_owner

openstack service create --name heat --description "Openstack Orchestration" orchestration
openstack service create --name heat-cfn --description "Openstack Orchestration" cloudformation

heat_api=NETWORK_HOST_NAME
openstack endpoint create --region RegionOne orchestration public https://$heat_api:8004/v1/%\(tenant_id\)s
openstack endpoint create --region RegionOne orchestration internal https://$heat_api:8004/v1/%\(tenant_id\)s
openstack endpoint create --region RegionOne orchestration admin https://$heat_api:8004/v1/%\(tenant_id\)s
openstack endpoint create --region RegionOne cloudformation public https://$heat_api:8000/v1
openstack endpoint create --region RegionOne cloudformation internal https://$heat_api:8000/v1
openstack endpoint create --region RegionOne cloudformation admin https://$heat_api:8000/v1

openstack domain create --description "Stack projects and users" heat

openstack user create --domain heat --password PASSWORD heat_domain_admin
openstack role add --domain heat --user heat_domain_admin admin
```

### 2. Heat 서비스 데이터를 저장할 DataBase를 생성

```bash
[root@ ~(keystone)]# mysql
Welcome to the MariaDB monitor.  Commands end with ; or \g.
Your MariaDB connection id is 77
Server version: 10.5.16-MariaDB MariaDB Server

Copyright (c) 2000, 2018, Oracle, MariaDB Corporation Ab and others.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

MariaDB [(none)]> create database heat; 
Query OK, 1 row affected (0.00 sec)

MariaDB [(none)]> grant all privileges on heat.* to heat@'localhost' identified by 'password'; 
Query OK, 0 rows affected (0.00 sec)

MariaDB [(none)]> grant all privileges on heat.* to heat@'%' identified by 'password'; 
Query OK, 0 rows affected (0.00 sec)

MariaDB [(none)]> flush privileges; 
Query OK, 0 rows affected (0.00 sec)

MariaDB [(none)]> exit 
Bye
```

### 3. Network 노드에 Heat을 설치

```bash
dnf --enablerepo=centos-openstack-zed,epel,crb -y install openstack-heat-api openstack-heat-api-cfn openstack-heat-engine python3-heatclient
```

### 4. Heat 설정하기

- PASSWORD, NETWORK_HOST_NAME, CONTROLLER_HOST_NAME은 설치하는 환경에 맞추어 변경이 필요합니다.

```bash
mv /etc/heat/heat.conf /etc/heat/heat.conf.org
vi /etc/heat/heat.conf

# 아래와 같이 설정합니다.
[DEFAULT]
deferred_auth_method = trusts
trusts_delegated_roles = heat_stack_owner
# specify Heat API Host
heat_metadata_server_url = https://NETWORK_HOST_NAME:8000
heat_waitcondition_server_url = https://NETWORK_HOST_NAME8000/v1/waitcondition
heat_stack_user_role = heat_stack_user
# Heat domain name
stack_user_domain_name = heat
# Heat domain admin username
stack_domain_admin = heat_domain_admin
# Heat domain admin's password
stack_domain_admin_password = PASSWORD
# RabbitMQ connection info
transport_url = rabbit://openstack:PASSWORD@CONTROLLER_HOST_NAME

# MariaDB connection info
[database]
connection = mysql+pymysql://heat:PASSWORD@CONTROLLER_HOST_NAME/heat

# Keystone connection info
[clients_keystone]
auth_uri = https://CONTROLLER_HOST_NAME:5000

[heat_api]
bind_host = 192.168.100.12
bind_port = 8004

[heat_api_cfn]
bind_host = 192.168.100.12
bind_port = 8000

# Keystone auth info
[keystone_authtoken]
www_authenticate_uri = https://CONTROLLER_HOST_NAME:5000
auth_url = https://CONTROLLER_HOST_NAME:5000
memcached_servers = CONTROLLER_HOST_NAME:11211
auth_type = password
project_domain_name = default
user_domain_name = default
project_name = service
username = heat
password = servicepassword
# if using self-signed certs on Apache2 Keystone, turn to [true]
insecure = false

[trustee]
auth_url = https://dlp.srv.world:5000
auth_type = password
user_domain_name = default
username = heat
password = PASSWORD

chgrp heat /etc/heat/heat.conf
chmod 640 /etc/heat/heat.conf
su -s /bin/bash heat -c "heat-manage db_sync"
systemctl enable --now openstack-heat-api openstack-heat-api-cfn openstack-heat-engine
```

## Dashboard에 heat ui plugin 설정

- 오픈스택 대시보드 서비스인 호라이즌에 heat ui plugin을 사용하여 heat ui를 사용할 수 있습니다.

### 1.   heat 대시보드 설치 (Controller Node)

```bash
pip3 install heat-dashboard

# 패키지 설치 확인
cd /usr/local/lib/python3.9/site-packages
ll
[root@controller site-packages(keystone)]# ll
total 20
-rw-r--r--.  1 root root 1702 Aug 28 10:58 XStatic_Angular_UUID-0.0.4.0-py2.7-nspkg.pth
drwxr-xr-x.  2 root root  117 Aug 28 10:58 XStatic_Angular_UUID-0.0.4.0.dist-info
-rw-r--r--.  1 root root 1702 Aug 28 10:58 XStatic_Angular_Vis-4.16.0.0-py2.7-nspkg.pth
drwxr-xr-x.  2 root root  117 Aug 28 10:58 XStatic_Angular_Vis-4.16.0.0.dist-info
-rw-r--r--.  1 root root 1702 Aug 28 10:58 XStatic_FileSaver-1.3.2.0-py2.7-nspkg.pth
drwxr-xr-x.  2 root root  117 Aug 28 10:58 XStatic_FileSaver-1.3.2.0.dist-info
-rw-r--r--.  1 root root 1702 Aug 28 10:58 XStatic_JS_Yaml-3.8.1.0-py2.7-nspkg.pth
drwxr-xr-x.  2 root root  117 Aug 28 10:58 XStatic_JS_Yaml-3.8.1.0.dist-info
-rw-r--r--.  1 root root 1702 Aug 28 10:58 XStatic_Json2yaml-0.1.1.0-py2.7-nspkg.pth
drwxr-xr-x.  2 root root  117 Aug 28 10:58 XStatic_Json2yaml-0.1.1.0.dist-info
drwxr-xr-x. 11 root root  182 Aug 28 10:58 heat_dashboard
drwxr-xr-x.  2 root root  150 Aug 28 10:58 heat_dashboard-9.0.0.dist-info
drwxr-xr-x.  7 root root  155 Aug 28 10:58 heatclient
drwxr-xr-x.  2 root root  157 Aug 28 10:58 python_heatclient-3.3.0.dist-info
drwxr-xr-x.  3 root root   17 Aug 28 10:58 xstatic
```

### 2. Heat 대시보드 플러그인 활성화 (Controller Node)

```bash
# horizon 플러그인 설정 파일 복사 
cp /usr/local/lib/python3.9/site-packages/heat_dashboard/enabled/_[1-9]*.py \
> /usr/share/openstack-dashboard/openstack_dashboard/local/enabled

# heat-dashboard 정책 파일 구성
cd /usr/share/openstack-dashboard/openstack_dashboard/local
vi local_settings.py

# 맨 밑에 추가 
POLICY_FILES = {
    'compute': 'nova.yaml',
    'identity': 'keystone.yaml',
    'image': 'glance.yaml',
    'network': 'neutron.yaml',
    'volume': 'cinder.yaml',
    'orchestration': '/usr/local/lib/python3.9/site-packages/heat_dashboard/conf/heat_policy.yaml'
}
```

### 3. Heat 대시보드 설정 ( Compute Node)

```bash
vi /etc/neutron/plugins/ml2/ml2_conf.ini

[ml2]
extension_dirvers = port_security,qos
```

## Docker Swarm Template 생성

- Heat는 yaml 형식의 템플릿 파일을 읽어 프로비저닝을 가능하게 합니다.
- Openstack 공식문서에서 Heat Template 가이드가 존재하며 자세하게 확인할 수 있습니다.
    - [https://docs.openstack.org/heat/pike/template_guide/hot_guide.html](https://docs.openstack.org/heat/pike/template_guide/hot_guide.html)

- 아래는 제가 만들어본 Heat Template 입니다.
    - Docker Swarm Master, Worker VM을 생성하는 템플릿으로 구성되어 있습니다.


### DockerSwarmMaster.yaml

```yaml
heat_template_version: 2023-09-04
description:  template to deploy dockerswarm-manager
parameters:
  public_net:
    type: string
    default: public
    description: >
      ID or name of public network for which floating IP addresses will be allocated
  existing_private_net:
    type: string
    default: private
    description: Name or ID of the existing private network
  dns_servers:
    type: comma_delimited_list
    default: 8.8.8.8
    description: Comma separated list of DNS nameservers for the private network.
  router_name:
    type: string
    default: router01
    description: Name of the router
  dns_domain_name:
    type: string
    default: yassinemaachi.com
    description: Name of the DNS Domain
  private_net_name:
    type: string
    default: private
    description: Name of private network to be created
  private_subnet_name:
    type: string
    default: private-subnet
    description: Name of private subnet to be created
  private_net_cidr:
    type: string
    default: 172.27.1.0/24
    description: Private network address (CIDR notation)
  private_net_gateway:
    type: string
    default: 172.27.1.1
    description: Private network gateway address
  private_net_pool_start:
    type: string
    default: 172.27.1.2
    description: Start of private network IP address allocation pool
  private_net_pool_end:
    type: string
    default: 172.27.1.254
    description: End of private network IP address allocation pool
  key_name:
    type: string
    label: Key Name
    default: cluster
    description: Name of key-pair to be used for compute instance
  image_name:
    type: string
    label: Image ID
    default: vm-4-snapshot
    description: Image to be used for compute instance
  docker_server_flavor_name:
    type: string
    default: m1.small
    description: Type of instance (flavor) to be used
  docker_server_name:
    type: string
    default: docker-server
    description: Name of the Instance.
  docker_volume_size:
    type: number
    default: 3
    description: Size of the Volume.
  docker_volume_name:
    type: string
    default: docker_server_disk
    description: Name of the Volume.
  docker_secgroup:
    type: string
    default: secgroup01
    description: Name of the docker server Security Group.
  docker_private_ip:
    type: string
    default: 172.27.1.105
    description: Fixed IP Address for docker server.
  docker_floating_ip:
    type: string
    default: 192.168.1.129
    description: IP address of the floating IP.
resources:
  docker_server_port:
    type: OS::Neutron::Port
    properties:
      network: { get_param: existing_private_net }
      fixed_ips:
        - ip_address: { get_param: docker_private_ip }
      security_groups:
      - { get_param: docker_secgroup }
  docker_server_floating_ip:
    type: OS::Neutron::FloatingIP
    properties:
      floating_network: { get_param: public_net }
  docker_server_floating_asso:
    type: OS::Neutron::FloatingIPAssociation
    depends_on: docker_server_instance
    properties:
      floatingip_id: { get_resource: docker_server_floating_ip }
      port_id: { get_resource: docker_server_port }
  docker_volume:
    type: OS::Cinder::Volume
    properties:
      size: { get_param: docker_volume_size }
      name: { get_param: docker_volume_name }
  volume_attachment:
    type: OS::Cinder::VolumeAttachment
    properties:
      volume_id: { get_resource: docker_volume }
      instance_uuid: { get_resource: docker_server_instance }
  docker_server_instance:
    type: OS::Nova::Server
    properties:
      name: { get_param: docker_server_name }
      key_name: { get_param: key_name }
      image: { get_param: image_name }
      flavor: { get_param: docker_server_flavor_name }
      networks:
      - port: { get_resource: docker_server_port }
      user_data_format: SOFTWARE_CONFIG
      user_data: {get_resource: docker_server_init}
  docker_server_init:
    type: OS::Heat::MultipartMime
    properties:
      parts:
      - config: {get_resource: install_docker}
  install_docker:
      type: OS::Heat::SoftwareConfig
      properties:
        group: script
        outputs:
        - name: result
        config: |
          #!/bin/sh -x
          sed -i '/Defaults    requiretty/c\#Defaults    requiretty' /etc/sudoers
          sudo yum -y install docker
          DOCKER_STORAGE_CONFIG="/etc/sysconfig/docker-storage"
          NEW_DOCKER_STORAGE_OPTIONS="--storage-driver devicemapper"
          sed -i "s/^DOCKER_STORAGE_OPTIONS=.*/DOCKER_STORAGE_OPTIONS=\"$NEW_DOCKER_STORAGE_OPTIONS\"/" "$DOCKER_STORAGE_CONFIG"
          sudo systemctl start docker
          sudo systemctl enable docker

outputs:
  docker_server_name:
    description: The hostname of the docker server instance
    value:
    - { get_attr: [ docker_server_instance, name ] }
  docker_server_private_IP:
    description: The private IP address of the docker server instance
    value:
    - { get_attr: [ docker_server_instance, first_address ] }
  docker_server_public_IP:
    description: The public IP address of the docker server instance
    value:
    - { get_attr: [ docker_server_floating_ip, floating_ip_address ] }
  docker_site_addresse:
    description: This is the url of the docker docker site.
    value:
      str_replace:
        params:
          site_ip: { get_attr: [ docker_server_floating_ip, floating_ip_address ] }
        template: http://site_ip
```

### DockerSwarmWorker.yaml

```yaml
heat_template_version: 2023-09-04
description:  template to deploy dockerswarm-worker
parameters:
  public_net:
    type: string
    default: public
    description: >
      ID or name of public network for which floating IP addresses will be allocated
  existing_private_net:
    type: string
    default: private
    description: Name or ID of the existing private network
  dns_servers:
    type: comma_delimited_list
    default: 8.8.8.8
    description: Comma separated list of DNS nameservers for the private network.
  router_name:
    type: string
    default: router01
    description: Name of the router
  dns_domain_name:
    type: string
    default: yassinemaachi.com
    description: Name of the DNS Domain
  private_net_name:
    type: string
    default: private
    description: Name of private network to be created
  private_subnet_name:
    type: string
    default: private-subnet
    description: Name of private subnet to be created
  private_net_cidr:
    type: string
    default: 172.27.1.0/24
    description: Private network address (CIDR notation)
  private_net_gateway:
    type: string
    default: 172.27.1.1
    description: Private network gateway address
  private_net_pool_start:
    type: string
    default: 172.27.1.2
    description: Start of private network IP address allocation pool
  private_net_pool_end:
    type: string
    default: 172.27.1.254
    description: End of private network IP address allocation pool
  key_name:
    type: string
    label: Key Name
    default: cluster
    description: Name of key-pair to be used for compute instance
  image_name:
    type: string
    label: Image ID
    default: vm-4-snapshot
    description: Image to be used for compute instance
  docker_server_flavor_name:
    type: string
    default: m1.small
    description: Type of instance (flavor) to be used
  docker_server_name:
    type: string
    default: docker-server
    description: Name of the Instance.
  docker_volume_size:
    type: number
    default: 3
    description: Size of the Volume.
  docker_volume_name:
    type: string
    default: docker_server_disk
    description: Name of the Volume.
  docker_secgroup:
    type: string
    default: secgroup01
    description: Name of the docker server Security Group.
  docker_private_ip:
    type: string
    default: 172.27.1.106
    description: Fixed IP Address for docker server.
  docker_floating_ip:
    type: string
    default: 192.168.1.116
    description: IP address of the floating IP.
resources:
  docker_server_port:
    type: OS::Neutron::Port
    properties:
      network: { get_param: existing_private_net }
      fixed_ips:
        - ip_address: { get_param: docker_private_ip }
      security_groups:
      - { get_param: docker_secgroup }
  docker_server_floating_ip:
    type: OS::Neutron::FloatingIP
    properties:
      floating_network: { get_param: public_net }
  docker_server_floating_asso:
    type: OS::Neutron::FloatingIPAssociation
    depends_on: docker_server_instance
    properties:
      floatingip_id: { get_resource: docker_server_floating_ip }
      port_id: { get_resource: docker_server_port }
  docker_volume:
    type: OS::Cinder::Volume
    properties:
      size: { get_param: docker_volume_size }
      name: { get_param: docker_volume_name }
  volume_attachment:
    type: OS::Cinder::VolumeAttachment
    properties:
      volume_id: { get_resource: docker_volume }
      instance_uuid: { get_resource: docker_server_instance }
  docker_server_instance:
    type: OS::Nova::Server
    properties:
      name: { get_param: docker_server_name }
      key_name: { get_param: key_name }
      image: { get_param: image_name }
      flavor: { get_param: docker_server_flavor_name }
      networks:
      - port: { get_resource: docker_server_port }
      user_data_format: SOFTWARE_CONFIG
      user_data: {get_resource: docker_server_init}
  docker_server_init:
    type: OS::Heat::MultipartMime
    properties:
      parts:
      - config: {get_resource: install_docker}
  install_docker:
      type: OS::Heat::SoftwareConfig
      properties:
        group: script
        outputs:
        - name: result
        config: |
          #!/bin/sh -x
          sed -i '/Defaults    requiretty/c\#Defaults    requiretty' /etc/sudoers
          sudo yum -y install docker
          DOCKER_STORAGE_CONFIG="/etc/sysconfig/docker-storage"
          NEW_DOCKER_STORAGE_OPTIONS="--storage-driver devicemapper"
          sed -i "s/^DOCKER_STORAGE_OPTIONS=.*/DOCKER_STORAGE_OPTIONS=\"$NEW_DOCKER_STORAGE_OPTIONS\"/" "$DOCKER_STORAGE_CONFIG"
          sudo systemctl start docker
          sudo systemctl enable docker
  
outputs:
  docker_server_name:
    description: The hostname of the docker server instance
    value:
    - { get_attr: [ docker_server_instance, name ] }
  docker_server_private_IP:
    description: The private IP address of the docker server instance
    value:
    - { get_attr: [ docker_server_instance, first_address ] }
  docker_server_public_IP:
    description: The public IP address of the docker server instance
    value:
    - { get_attr: [ docker_server_floating_ip, floating_ip_address ] }
  docker_site_addresse:
    description: This is the url of the docker docker site.
    value:
      str_replace:
        params:
          site_ip: { get_attr: [ docker_server_floating_ip, floating_ip_address ] }
        template: http://site_ip
```