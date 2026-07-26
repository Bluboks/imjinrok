# K01 UI 파일럿 후보로 선택한 원본 공통 임무 목표 모달은 어떤 자원과 사각형을 사용하며, 언제 표시·종료되고 어느 입력 영역에서 닫히는가?

기준일: 2026-07-26

## 판정과 범위

- 분석 상태: `정적 확정`
- 재현 상태: 아래에 명시한 갱신·종료 cleanup 범위만 `재현 완료`
- 구현 상태: 확정 자원·좌표·입력 판정·종료 cleanup의 독립 모듈은 해당 재현 범위에서
  `원본 기반`, 실제 장면 연결은 `없음`

세 후보 가운데 이 질문을 선택했다. 전체 HUD 루트는 여러 위젯의 공통 좌표계와 입력 전파를 함께
복원해야 하고, 하단 선택 패널은 더 많은 상태별 자원과 수치 필드를 소비한다. 반면 임무 목표 모달은
소유 상태 머신, 초기화·갱신·해제 함수, 단일 SPR과 단일 닫기 컨트롤로 경계가 닫혀 있어 가장 좁게
독립 완료할 수 있다.

정적 확정 범위는 임무 목표 모달의 생명주기, 프레임 자원, 외곽·내용·닫기 컨트롤 사각형, 두 텍스트
블록의 최대 폭과 세로 중심, 엄격한 경계의 닫기 히트 테스트, 외부 종료 플래그, draw·cleanup 표면
잠금 실패, 자원 로드 실패, 컨트롤 sound/latch 부수효과다. 후속
[K01 결합 분석](objective-modal-k01-binding.md)은 상태 `0x3f0`의 handler 반환 생산 경로와
`DAT_0088afcc = 1`이 `script\k0110`의 K01 목표 텍스트를 선택하는 경로를 정적 확정했다. 이
문서는 그 결합이 아니라 공통 모달 자체의 기하·입력·생명주기 범위를 다룬다.

재현 완료 및 이식 범위는 정확한 사각형, 닫기 반환·one-shot 소비·이전 버튼 정규화·draw 순서,
비활성·초기화·표시 소유 상태, 정상적으로 로드된 자원의 종료 해제와 그 뒤 clear 시도, clear용 lock
성공·실패다. 이 문서의 벡터는 원본 런타임 SPR 로더 실패와 계속 진행 동작, 컨트롤 press sound와
내부 latch 변경을 재현·이식하지 않았다. 후속 dispatcher 벡터는 loader 실패 보고 뒤
`0x3f1`로 계속하는 제어 효과만 별도 재현했다. sound/latch는 이번 질문의 닫기 반환값에는 영향을
주지 않는 부수효과다.

K01 목표 문자열 두 입력은 후속 분석에서 확정했지만 글꼴과 줄바꿈 언어 규칙은 아직 확정하지
않았다. 현재 실행 중인 웹 목표 추적 패널은 별개의 프로젝트 전용 HUD이며 이 모달과 같다고 주장하지
않는다.

## 원본과 재생성 입력

| 파일 | SHA-256 | 확인 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | 제어 흐름, 필드, 좌표, 호출·실패 경로 |
| `original/imjinrok2/yfnt/objectiveborder.spr` | `62552fecc34139e6729b84d4e15dcbe6ea3622eb76b7f443af29fa5322813ea5` | 416×236, 1프레임 |

`analysis/config/seed-addresses.txt`에 필요한 함수 시작점을 추가하고 전체 파이프라인으로 다시 생성했다.
현재 산출물은 seed 113개, 포함 함수 111개다. 이 추출기는 `seeds.json`의 원본 해시뿐 아니라 이 질문에
필요한 20개 함수의 전체 바이트 SHA-256, 본문 범위, CFG 블록 수와 명령어 수를 검사한다.
`FUN_00448ff0`·`FUN_00449030`은 원시 함수 범위 전체 해시로 추가 고정하고, `references.json`의
원본 해시와 `DAT_00552998` 직접 참조 14개 전수 집합도 검사한다.

## 함수와 코드 범위

### 소유·생명주기

| 주소 범위 | CFG / 명령어 | 확인한 역할 |
| --- | ---: | --- |
| `FUN_00449090`, `0x00449090-0x00449260` | 26 / 118 | 전체 UI 상태 switch. `0x3f0`에서 초기화 후 `0x3f1`, `0x3f1`에서 갱신 결과가 0이 아니면 상태 1000으로 복귀하고 해제 |
| `FUN_004a5730`, `0x004a5730-0x004a5977` | 13 / 157 | SPR 로드, 닫기 컨트롤 초기화, 내용 지우기, 텍스트 두 블록 준비·배치 |
| `FUN_004a5980`, `0x004a5980-0x004a5ab3` | 6 / 87 | 닫기 입력·외부 종료 검사, 프레임·컨트롤 draw, 내용 영역 present |
| `FUN_004a5ac0`, `0x004a5ac0-0x004a5ada` | 3 / 7 | SPR 포인터가 있을 때만 해제한 뒤, 포인터·해제 여부와 무관하게 `FUN_004a5ae0`으로 tail-jump |
| `FUN_004a5ae0`, `0x004a5ae0-0x004a5b29` | 3 / 18 | clear용 잠금을 항상 시도하고, 성공할 때만 내용 영역을 투명 팔레트 인덱스 `0xfe`로 지운 뒤 unlock |

### 자원·그리기·입력

| 주소 범위 | 확인한 역할 |
| --- | --- |
| `FUN_00442dd0`, `0x00442dd0-0x00442e23` | `%s%s`로 자원 경로 생성 |
| `FUN_004434a0`, `0x004434a0-0x0044357e` | SPR 열기, magic `9` 검사, `0xbf4`바이트 헤더 읽기, frame data 할당·읽기 |
| `FUN_004838f0`, `0x004838f0-0x0048399f` | 텍스트 입력 레코드에서 종류 `7` 항목 두 문자열을 찾음 |
| `FUN_004113a0`, `0x004113a0-0x0041146d` | 닫기 컨트롤의 signed WORD X·Y·폭·높이와 활성 필드 초기화 |
| `FUN_00411cb0`, `0x00411cb0-0x00411ccc` | 컨트롤 X·Y와 이전 버튼 상태를 vtable `+0x30`으로 전달 |
| `FUN_00411cd0`, `0x00411cd0-0x00411d86` | 활성 검사, hit test, 눌림·해제 상태와 사운드 latch 처리 |
| `0x00411df0-0x00411e37` | vtable `+0x28`의 실제 hit-test 코드. Ghidra 자동 함수로 잡히지 않아 원시 범위 전체 해시로 고정 |
| `FUN_004492d0`, `0x004492d0-0x004492ec` | 외부 종료 DWORD가 정확히 `1`이면 `0`으로 소비하고 `1` 반환 |
| `FUN_0044abb0`, `0x0044abb0-0x0044ad93` | DirectDraw 표면 잠금. 이미 잠김·HRESULT 실패를 메시지로 드러내고 `0` 반환 |
| `FUN_0044ada0`, `0x0044ada0-0x0044addd` | 잠금 해제 및 대상 표면 vtable `+0x80` 통지 |
| `FUN_0044ae80`, `0x0044ae80-0x0044aeb2` | 공유 dirty rect 저장 |
| `FUN_0044af20`, `0x0044af20-0x0044af42` | dirty rect를 공유 캔버스 전체로 설정 |
| `FUN_0044aef0`, `0x0044aef0-0x0044af1a` | dirty rect 복원 |
| `FUN_0044dfd0`, `0x0044dfd0-0x0044e03a` | `0xfe, run` 형식 SPR 프레임을 목적지에 row blit |
| `FUN_004119f0`, `0x004119f0-0x00411a20` | 닫기 컨트롤의 X·Y와 상태별 frame 네 개를 vtable `+0x3c`으로 전달 |
| `0x00411a30-0x00411b47` | vtable `+0x3c`의 실제 컨트롤 frame draw 코드. 원시 범위 전체 해시로 고정 |
| `FUN_0044b040`, `0x0044b040-0x0044b09e` | 상세 오류 문자열을 MessageBox로 표시. 실패를 조용히 삼키지 않음 |

공유 캔버스 초기화 코드 `0x0044a040-0x0044a071`은 `+0x04/+0x10 = 640`,
`+0x08/+0x14 = 480`을 기록한다. 목표 모달의 frame blit, dirty rect와 clear가 같은
`DAT_00559418` 객체를 사용하므로 이 질문의 좌표계는 좌상단 원점 640×480으로 확정된다.
`SPEECH`가 640×480이라는 기존 사실을 일반화한 결과가 아니다.

## 자료구조 필드와 signedness

| 소유자 | 주소/오프셋 | 폭 | 확인한 역할 |
| --- | ---: | --- | --- |
| 닫기 컨트롤 | `+0x04`, `+0x08` | DWORD | 둘 다 정확히 `1`일 때만 입력 활성 |
| 닫기 컨트롤 | `+0x8c` | signed WORD | X = 415 |
| 닫기 컨트롤 | `+0x8e` | signed WORD | Y = 267 |
| 닫기 컨트롤 | `+0x90` | signed WORD | 폭 = 80 |
| 닫기 컨트롤 | `+0x92` | signed WORD | 높이 = 24 |
| 닫기 컨트롤 | `+0x94` | DWORD | 누름 사운드 latch |
| 닫기 컨트롤 | `+0x98` | DWORD | hit/pressed latch |
| 전역 | `0x00aa4012` | signed WORD | 포인터 X |
| 전역 | `0x00aa4010` | signed WORD | 포인터 Y |
| 전역 | `0x00c06e3c` | DWORD | 현재 primary-button 상태. `0`과 nonzero로 비교 |
| 전역 | `0x00552d70` | DWORD | 이전 프레임 버튼 상태. 갱신 끝에서 정확한 `0/1`로 정규화 |
| 전역 | `0x00552b80` | DWORD | 외부 종료 one-shot. 정확히 `1`만 소비 |
| 전역 | `0x00552998` | signed WORD | UI 소유 상태. 목표 모달 초기화 `0x3f0`, 갱신 `0x3f1` |

텍스트 측정 결과의 폭·높이도 signed WORD로 읽는다. 폭은 signed 비교로 `320` 이상이면 `320`으로
제한한다. 음수와 높이에는 이 호출자 범위에서 별도 하한 검사가 없다.

## 사각형과 right/bottom 계산

| 구역 | X | Y | 폭×높이 | right / bottom | 경계 방식 |
| --- | ---: | ---: | ---: | ---: | --- |
| `objectiveborder.spr` 외곽 | 112 | 81 | 416×236 | `112+416=528`, `81+236=317` | frame 크기에서 계산한 exclusive 끝 |
| 내용 갱신 영역 | 158 | 135 | 320×124 | `478`, `259` | DirectDraw `RECT` exclusive 끝 |
| 내용 clear 영역 | 158 | 135 | 320×124 | `477`, `258` | clear 함수의 inclusive 끝 |
| 닫기 컨트롤 | 415 | 267 | 80×24 | `495`, `291` | hit test는 네 변 모두 제외 |

이전 부분 분석은 `(158,135)-(478,259)`를 패널 자체로 잘못 분류했다. 원본 SPR 헤더와
`FUN_004a5980`의 `(112,81)` frame blit을 연결하면 실제 외곽은
`(112,81)-(528,317)`이다. `(158,135)-(478,259)`는 프레임 안쪽의 내용 갱신 영역이다.

닫기 hit test는 `x < pointerX < x+width`, `y < pointerY < y+height`다. 따라서 정수 좌표로 실제
hit 되는 범위는 X `416..494`, Y `268..290`이고 X `415/495`, Y `267/291`은 모두 바깥이다.
패널 전체를 클릭하는 경로나 별도 hover 영역은 확인되지 않았다.

두 텍스트 결과의 X는 158이며 최대 폭은 320이다. 첫 결과는 측정 높이의 절반을 Y 166에서 빼고,
둘째 결과는 Y 228에서 뺀다. K01 입력 문자열은 후속 결합 분석에서 확정했으며 정확한 글꼴과
한국어 줄바꿈 규칙은 미확정이다.

## 전체 제어·데이터 흐름

### 소유 상태 머신

```text
if DAT_00634c90 == 0:
  목표 모달을 포함한 소유 UI switch를 실행하지 않음

state 0x3f0:
  FUN_004a5730()
  state = 0x3f1

state 0x3f1:
  result = low_signed_WORD(FUN_004a5980(presentation_surface))
  if result != 0:
    state = 1000
    FUN_004a5ac0()
      if objective_sprite != null:
        release objective_sprite
      tail-call FUN_004a5ae0()
        attempt clear-surface lock
        if lock == 1:
          clear inclusive (158,135)-(477,258) with 0xfe
          unlock clear surface
```

`FUN_00449090`의 switch에는 다른 UI 상태와 두 번째 결과 switch가 있지만 목표 모달 분기는 위 두
case뿐이다. 간접 점프 목적지는 생성된 CFG에서 전부 복구됐고 추출기가 26개 블록 전체를 고정한다.

### K01 결합 감사의 후속 판정

생성된 `references.json`에서 `DAT_00552998`로 향하는 직접 참조 14개를 전수 고정했다.

- `FUN_00448ff0`, `0x00448ff0-0x00449026`: `0x0044900e`에서 signed WORD `0x3e8` 기록
- `FUN_00449030`, `0x00449030-0x0044908c`: `0x00449044`에서 signed WORD `0x3ed` 기록
- `FUN_00449090`, `0x00449090-0x00449260`: `0x004490b8`에서 상태를 읽고 내부 case 전이만 기록

완전한 구조화 직접 참조 집합에는 literal `0x3f0` 쓰기가 없다. 다만 `0x00449105`,
`0x00449143`, `0x00449188`, `0x004491af`는 각각 앞선 handler 반환값을 상태에 기록한다. 후속
분석은 이 가운데 `0x00449105`에 도달하는 상위 경로를 복원했다. `FUN_004495e0`의
`0x004496b5`가 컨트롤 `0x005527b0`의 성공 반환을 `EDI = 0x3f0`으로 바꾸고,
뒤의 독립 컨트롤 `0x005528f8`, `0x00552ae0`, `0x00552850`이 차례로 활성화되면 이를
`0x3ee`, `0x3ec`, `0x3ea`로 덮어쓴다. 여러 개가 활성화되면 마지막 활성 값이 남는다. 세
컨트롤이 모두 비활성이면 `0x004498ec`가 `0x3f0`을 AX로 반환하고 `FUN_00449090`이 그 값을
상태에 기록한다. 이는 직접 literal 메모리 쓰기가 아니라 확인된 return-value 생산 경로다. 이
판정은 간접 메모리 쓰기가 전혀 없다고 일반화한 것이 아니다.

텍스트 경로는 `0x004a57fa-0x004a581a`에서 signed WORD `DAT_0088afcc`를 128배하여
`0x00abf0e8`의 128바이트 레코드를 선택한다. 후속 분석은 한국 캠페인 1단계가
`FUN_0048d690`을 통해 이 전역에 1을 기록하고, 인덱스 1이 `script\k0110`,
`stagemap\k01.map`, K01 handler `FUN_0048a5c0`에 함께 결합됨을 복원했다. 자세한 함수 범위,
원본 입력 해시와 재현 벡터는 [전용 결합 문서](objective-modal-k01-binding.md)에 있다.

### 초기화와 자원 로드

1. `FUN_004a5730`이 `yfnt\objectiveborder.spr`와 설치 경로를 결합한다.
2. 이전 버튼 상태 `DAT_00552d70`을 `0`으로 초기화한다.
3. SPR 구조체가 이미 할당돼 있으면 상세 메시지를 표시한다.
4. `FUN_004434a0`이 파일 open, magic `9`, 헤더 읽기, frame data 할당·읽기를 수행한다.
5. open 실패, magic 불일치, 할당 실패는 각각 메시지를 표시하고 `0`을 반환한다. 호출자는 다시
   “Sprite File Load Failed” 메시지를 표시하지만 조기 반환하지 않고 초기화를 계속한다.
6. 닫기 컨트롤을 `(415,267)`, `80×24`, 활성 DWORD 둘 다 `1`로 초기화한다.
7. 내용 영역 잠금에 성공하면 `(158,135)-(477,258)`을 `0xfe`로 지운다. 실패하면 지우기만
   건너뛴다.
8. 첫 텍스트 레코드 탐색이 실패하면 두 텍스트 blit을 모두 건너뛰고 정리한다.
9. 첫 레코드가 성공하면 측정 폭을 320으로 제한해 X 158, center Y 166에 blit한다.
10. 둘째 레코드 탐색의 반환값은 검사하지 않으며 초기화된 출력 버퍼를 그대로 소비해 X 158,
    center Y 228에 blit한다.
11. 임시 레코드를 정리하고 반환한다.

위 로더 실패 흐름은 전체 정적 제어 흐름으로 확정했다. 이 문서의 독립 재현 벡터나 클라이언트 이식
범위에는 포함하지 않으며, 후속 dispatcher 벡터는 실패 보고 뒤 `0x3f1` 전진만 재현한다.

### 프레임 갱신·표시·종료

```text
release = control_update(
  x=415, y=267, width=80, height=24,
  pointer=(signed WORD globals),
  current_down=DAT_00c06e3c,
  previous_down=DAT_00552d70
)
if release == 1:
  return 1

if DAT_00552b80 == 1:
  DAT_00552b80 = 0
  return 1

if lock(presentation_surface) == 1:
  save dirty rect
  expand dirty rect to 640×480
  blit objectiveborder frame 0 at (112,81), 416×236
  draw dismiss control at (415,267)
  unlock
  restore dirty rect

present source RECT (158,135)-(478,259) at destination (158,135)
DAT_00552d70 = DAT_00c06e3c != 0 ? 1 : 0
return with low WORD 0
```

닫기 컨트롤은 활성 DWORD 둘 다 `1`, 포인터가 엄격한 내부, 현재 버튼 상태가 `0`, 이전 상태가
정확히 `1`일 때만 `1`을 반환한다. 즉 누른 동안이 아니라 내부에서 해제된 프레임에 닫힌다. 이전
상태 `2`나 외부 one-shot 값 `2`는 nonzero라는 이유만으로 종료하지 않는다.

정상 경로의 EAX 상위 WORD에는 현재 버튼 DWORD의 상위 비트가 남을 수 있지만 소유자는 반환값을
signed WORD로 받으므로 종료 판정에는 low WORD `0`만 사용한다.

## 실패·비활성·범위 밖 경로

- 소유 플래그가 `0`이거나 상태가 `0x3f0/0x3f1`이 아니면 목표 모달 초기화·draw·입력이 없다.
- 닫기 컨트롤의 활성 DWORD 중 하나가 `1`이 아니면 hit여도 닫히지 않는다.
- signed WORD 최소·최대 포인터 값 `-32768`, `32767`은 닫기 영역 밖이다.
- 네 변과 이전 버튼 값 `2`, 외부 종료 값 `2`는 닫히지 않는 경계 벡터로 재현했다.
- 표면 잠금 실패는 frame·컨트롤 하위 draw만 건너뛴다. 내용 영역 present와 이전 버튼 정규화는
  계속된다.
- 닫기 해제 또는 외부 one-shot 종료는 draw 전에 반환한다. 소유자는 SPR 포인터가 있으면 먼저
  해제하고, 이어서 반드시 내용 clear를 시도한다. clear용 lock 실패는 clear와 unlock만
  건너뛰며 “시도하지 않음”을 뜻하지 않는다.
- SPR 입력 해시·magic·크기·frame 범위가 다르면 독립 추출기는 즉시 상세 오류로 실패한다. 원본
  런타임의 로더 실패는 메시지를 표시한 뒤 호출자가 계속한다는 위험한 정적 확정 동작이다. 변조
  입력을 거부하는 추출기 테스트는 이 원본 런타임 실패를 재현한 것이 아니다.
- 컨트롤 press sound와 내부 latch 변경은 `FUN_00411cd0`에서 정적 확정했지만 이번 재현 모델과
  클라이언트 이식에는 없다. 이 부수효과는 이번 질문의 닫기 반환 판정을 바꾸지 않는다.

## 독립 재현 벡터

`analysis/fixtures/objective-panel-layout-vectors.json`은 원본 EXE·SPR 해시를 고정하고 다음 관찰
가능 결과를 담는다.

| 벡터 | 기대 결과 |
| --- | --- |
| 정상, lock 성공 | frame → 컨트롤 → 내용 present 순서, 다음 이전 버튼 `0` |
| lock 실패 | frame·컨트롤 draw 없음, 내용 present는 실행, 다음 이전 버튼 `1` |
| 내부 해제 | draw 없이 pointer-release 종료 |
| 좌·우·상·하 정확한 변 | 종료하지 않음 |
| 버튼 계속 눌림 | 종료하지 않음 |
| 이전 버튼 `2` | 종료하지 않음 |
| 외부 one-shot `1` | 값을 소비하고 종료 |
| 외부 one-shot `2` | 종료하지 않음 |
| 컨트롤 비활성 | 내부 해제여도 종료하지 않음 |
| signed WORD 최소·최대 | 범위 밖, 외부 one-shot 경로 재현 |
| 소유 비활성·다른 상태 | 목표 모달 동작 없음 |
| 상태 `0x3f0` | 초기화 후 `0x3f1` |
| 종료 cleanup, clear lock 성공 | SPR 해제 → clear 시도 → 내용 clear → unlock |
| 종료 cleanup, clear lock 실패 | SPR 해제 → clear 시도; 실제 clear·unlock 없음 |

`tools/imjinrok/objective-panel-layout-evidence.test.mjs`가 독립 참조 모델로 이 벡터를 실행한다.
모든 update 벡터는 종료 여부뿐 아니라 hit, one-shot 소비, 이전 버튼 정규화와 전체 draw 순서를
완전한 기대 결과로 비교한다. 변조 EXE, 변조 SPR, stale·불완전 `seeds.json`, 표현 범위를 벗어난
입력도 추출기 입력 거부 테스트로 검사하며, 이는 후속 dispatcher의 원본 loader 실패 제어 효과
벡터와도 별개다.

## 클라이언트 이식과 웹 적응

- `apps/game-client/public/assets/themes/default/ui/objective-panel/objectiveborder_0000.png`는 고정
  원본 SPR frame 0을 416×236으로 변환한 자원이다.
- `apps/game-client/src/originalObjectivePanelLayout.ts`는 원본 frame·내용·닫기 사각형, 닫기
  판정과 성공적으로 로드된 자원의 종료 cleanup 순서를 독립 모듈로 이식한다. cleanup 모델은 clear
  시도와 clear용 lock 성공 뒤 실제 clear·unlock을 구분한다.
- 클라이언트 테스트는 독립 추출기 결과와 같은 JSON 벡터를 직접 사용한다.
- 640×480 원본 좌표는 고정 상수다. 다른 viewport에서는 하나의 균일 배율과 중앙 여백만 적용하고
  종횡비를 늘이지 않는다. 이것은 `의도적 적응`이다.
- 실제 장면에는 연결하지 않았다. K01 목표 문자열과 원본 사용자 표시 입력은 후속 정적 분석에서
  확정했지만 글꼴·줄바꿈과 simulation↔UI 계약이 미확정인 상태에서 기존
  `SkirmishScene.updateObjectiveTrackerOverlay`를 이 모달로 바꾸면 검증되지 않은 UI를 원본 기반처럼
  보이게 하므로 보류했다. `SkirmishScene.ts`는 수정하지 않았다.

## 미확정 항목과 다음 질문

- `DAT_00552b80`을 설정하는 생산자와 그 도메인 의미
- 텍스트 측정·표시에서 사용하는 글꼴 face·크기와 한국어 줄바꿈 규칙
- 동적으로 전달되는 presentation surface의 구체 vtable 타입
- 컨트롤 객체 `0x005527b0`의 사용자 노출 한국어 label
- state `0x16` request를 만드는 gameplay-panel의 화면상 정체·자원·draw 경로

K01 결합 질문은 [별도 문서](objective-modal-k01-binding.md)에서, state `0x16` 진입과 목표
컨트롤 질문은 [후속 문서](application-state-16-objective-control.md)에서 각각 정적 확정·재현
완료했다. [pending action dispatcher 분석](objective-pending-action-dispatch.md)은 살아남은
`0x3f0`의 목표 모달 소비·reset과 scoped surface/resource 실패를 정적 확정·재현하고 semantic
UI-domain 계약까지 추가했다. 후속
[프로젝트 UI 이벤트 경계 분석](objective-modal-ui-event-boundary.md)은 HUD button의 staged
프로젝트 적응 trigger에서 `UIScene` private active request까지 연결했지만 사용자에게 보이는
panel presenter는 아직 없다. 원본 mechanism 소유
semantic action source도 계속 미확정이다.
