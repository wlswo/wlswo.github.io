---

title: Linux 파일시스템 사용량 100% 에러를 해결해봅니다.

date: 2023-06-06-21:54

categories:

- Linux 

tags: Error

---

  

## Linux OS의 Filesystem Usage 100% 에러 발생 이유에 대해 알아봅니다.

> 파일시스템 사용량이 100%인 에러가 어떤 효과들을 낳는지 알아봅니다.

<br><br>


# 목표

  

- Linux ubuntu 설치후 root 비밀번호를 바꿔봅니다.

- ACPI 에러에 대해 알아봅니다.

- Filesystem Usage 100% 에러를 해결해 봅니다.

  

<br/><br/><br/><br/>

  

# 환경

  

> 실무에서 물리 서버에 Linux ubuntu 20.04 LTS 를 설치후 서버 초기 설정중 발생한 에러 입니다.


<br><br>

# 현상

- ubuntu 설치후 root 비밀번호가 바뀌지 않는 현상이 발생했습니다. 

```bash
$ passwd root
$ Change password for root.
$ New password:
$ Retype the new password:
$ passwd: authentication token manipulation error
```
  

Linux 에서 passwd  명령은 사용자 계정 암호를 설정하거나 변경하는데 사용됩니다. 이 명령은 때때로 인증 토큰 조작 오류가 발생할 수 있습니다. 다양한 이유로 인증 토큰 오류가 발생하므로 다양한 방법을 시도하면서 원인을 찾는 것이 중요합니다.  
<br>

첫번째로 진행한 방법은 시스템 재부팅입니다. 

```bash
sudo reboot
```

명령어를 통해 재부팅을 진행했지만 결과는 동일했습니다. 
<br><br><br><br>



두번째 접근은 **/etc/shadow** 파일에 올바른 권한을 설정하였습니다.
- 리눅스 시스템에서 **/etc/shadow** 파일은 암호를 유지하거나 사용자 계정의 실제 암호를 암호화하여 저장합니다. 해당 파일에 올바른 권한을 부여하기 위해 아래와 같은 명령어를 시도했습니다.

```bash
$ sudo chmod 0640 /etc/shadow
```

두번째 방법또한 결과는 동일했습니다.
<br><br><br><br>



세번째 방법은 root 파티션을 다시 마운트 시키는 것입니다.
파티션이 읽기 전용으로 마운트된 경우에는 파일을 수정할 수 없으므로 root 비밀번호 변경이 수행되지 않을 수 있다고 생각했습니다. 아래 명령어를 통해 root 파티션을 읽기와 쓰기 전용으로 마운트를 진행합니다.

```bash
sudo mount -o remount, rw/
```

아쉽게도 결과는 동일했습니다.

<br><br>

마지막방법은 디스크 공간을 정리하는 것입니다. Linux에선 디스크가 가득 차면 인증 토큰 조작 오류를 발생시킵니다. 따라서 이 경우에는 모든 공간을 지우고 다시 로그인을 시도하는 방법이 존재합니다.

우선 아래 명령어로 root 파일 시스템의 사용량을 확인해 봅니다.

```bash
df -h 
```

![이미지](https://raw.githubusercontent.com/wlswo/wlswo.github.io/599fc82b098cb64458cbd10ec595b789e3149ed3/assets/images/Linux/linux-error1%20.png)

<br>

하루 전날 특별한 설정 없이 ubuntu OS 설치만 진행한후 다음날 디스크 사용량을 확인해 보니 root 파티션의 사용량이 100%인걸 확인하였습니다.


<br>
OS설치후 진행한 작업이 없는데도 불구하고 디스크 사용량이 100% 라는건 무엇인가 계속 쌓이는걸 의심해볼 필요가 있습니다. 아래 명령어를 통해 log 파일 확인이 필요합니다.


```bash
$ cd var/etc
$ du -sh #파일 및 디렉토리의 용량을 확인합니다.
```

<br>
스크린샷은 찍지 못했지만 **syslog** (시스템 로그)의 파일이 root 파티션의 용량을 전부 차지하고 있었습니다.


<br><br><br><br>

# 원인 

원인은 ubuntu20.04 버전과 CPU 펌웨어 버전이 맞지 않아 백그라운드에서 **ACPI** 라는 오류를 계속 뱉어내며 시스템 로그에 적재되고 있었습니다.

<br>
에러로그는 아래와 같습니다.

```shell
...
May 24 15:42:34 openstack-compute01 kernel: [  228.002201]
May 24 15:42:34 openstack-compute01 kernel: [  228.002202] No Local Variables are initialized for Method [_L6F]
May 24 15:42:34 openstack-compute01 kernel: [  228.002203]
May 24 15:42:34 openstack-compute01 kernel: [  228.002204] No Arguments are initialized for method [_L6F]
May 24 15:42:34 openstack-compute01 kernel: [  228.002205]
May 24 15:42:34 openstack-compute01 kernel: [  228.002206] ACPI Error: Aborting method \_GPE._L6F due to previous error (AE_NOT_FOUND) (20210730/psparse-529)
May 24 15:42:34 openstack-compute01 kernel: [  228.002212] ACPI Error: AE_NOT_FOUND, while evaluating GPE method [_L6F] (20210730/evgpe-511)
May 24 15:42:34 openstack-compute01 kernel: [  228.004711] ACPI BIOS Error (bug): Could not resolve symbol [\_GPE._L6F.PGRT], AE_NOT_FOUND (20210730/psargs-330)
May 24 15:42:34 openstack-compute01 kernel: [  228.004734]
May 24 15:42:34 openstack-compute01 kernel: [  228.004735] No Local Variables are initialized for Method [_L6F]
May 24 15:42:34 openstack-compute01 kernel: [  228.004736]
May 24 15:42:34 openstack-compute01 kernel: [  228.004737] No Arguments are initialized for method [_L6F]
May 24 15:42:34 openstack-compute01 kernel: [  228.004738]
May 24 15:42:34 openstack-compute01 kernel: [  228.004739] ACPI Error: Aborting method \_GPE._L6F due to previous error (AE_NOT_FOUND) (20210730/psparse-529)
May 24 15:42:34 openstack-compute01 kernel: [  228.004745] ACPI Error: AE_NOT_FOUND, while evaluating GPE method [_L6F] (20210730/evgpe-511)
May 24 15:42:34 openstack-compute01 kernel: [  228.006473] ACPI BIOS Error (bug): Could not resolve symbol [\_GPE._L6F.PGRT], AE_NOT_FOUND (20210730/psargs-330)May 24 15:42:34 openstack-compute01 kernel: [  228.006477]
May 24 15:42:34 openstack-compute01 kernel: [  228.006478] No Local Variables are initialized for Method [_L6F]
May 24 15:42:34 openstack-compute01 kernel: [  228.006479]
May 24 15:42:34 openstack-compute01 kernel: [  228.006480] No Arguments are initialized for method [_L6F]
May 24 15:42:34 openstack-compute01 kernel: [  228.006481]
May 24 15:42:34 openstack-compute01 kernel: [  228.006482] ACPI Error: Aborting method \_GPE._L6F due to previous error (AE_NOT_FOUND) (20210730/psparse-529)
May 24 15:42:34 openstack-compute01 kernel: [  228.006487] ACPI Error: AE_NOT_FOUND, while evaluating GPE method [_L6F] (20210730/evgpe-511)
May 24 15:42:34 openstack-compute01 kernel: [  228.008165] ACPI BIOS Error (bug): Could not resolve symbol [\_GPE._L6F.PGRT], AE_NOT_FOUND (20210730/psargs-330)
May 24 15:42:34 openstack-compute01 kernel: [  228.008170]
May 24 15:42:34 openstack-compute01 kernel: [  228.008170] No Local Variables are initialized for Method [_L6F]
May 24 15:42:34 openstack-compute01 kernel: [  228.008171]
May 24 15:42:34 openstack-compute01 kernel: [  228.008172] No Arguments are initialized for method [_L6F]
May 24 15:42:34 openstack-compute01 kernel: [  228.008173]
May 24 15:42:34 openstack-compute01 kernel: [  228.008174] ACPI Error: Aborting method \_GPE._L6F due to previous e
...
```

<br><br>

*ACPI란
- Advanced Configuration and Power Interface의 약자로 하드웨어 감지, 메인보드 및 장치 구성, 전원 관리를 담당하는 일반적인 인터페이스를 정의합니다.

Ubuntu 18.04 버전 부터 발생했던 이슈였으며 Ubuntu20.04, 22.04 버전에도 지속적으로 발생중입니다. 
ACPI 오류는 Linux 기반 컴퓨터에서 정기적으로 발생하는 이슈이며, 컴퓨터에서 문제를 일으키지는 않습니다.
하지만 해당 에러로 인한 **로그정보가 무한정 쌓이는 상황**이 발생할 수 있기 때문에 조치가 필요할 수 있습니다.



# 해결

- /etc/default/grub 파일을 편집합니다.
```bash
vi /etc/default/grub
```

- **GRUB_CMDLINE_LINUX_DEFAULT="quiet splash"** 항목을 수정 합니다.
```shell
#/etc/default/grub
...
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash acpi=off"
...
```

- 저장 후 재부팅
```bash
sudo update-grub
sudo shutdown -r now
```


<br><br><br><br>

# Reference

- [https://sysreseau.net/passwd-authentication-token-manipulation-error](https://sysreseau.net/passwd-authentication-token-manipulation-error/)

- [https://mapoo.net/os/oslinux/acpi-apic관련-설명-및-리눅스-부팅옵션/](https://mapoo.net/os/oslinux/acpi-apic관련-설명-및-리눅스-부팅옵션/)

- [https://ko.wikipedia.org/wiki/ACPI](https://ko.wikipedia.org/wiki/ACPI)