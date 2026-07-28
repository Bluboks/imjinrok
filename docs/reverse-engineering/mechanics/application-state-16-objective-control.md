application state 0x16의 완전한 생산 경로와 컨트롤 객체 0x005527b0의 자원·정확한 사각형·표시/입력 조건을 정적으로 복원하여, K01에서 공통 임무 목표 모달을 여는 정확한 사용자 동작과 표시 조건을 확정할 수 있는가?

기준일: 2026-07-26

## 판정

- 분석 상태: 아래에 한정해 `정적 확정`
- 재현 상태: 아래 벡터 범위는 `재현 완료`
- 구현 상태: 원본 state `0x16` 입력 연쇄는 `분석 전용`; 후속 presenter의 HUD trigger와 동일하다고
  주장하지 않음

그렇다. K01에서 공통 임무 목표 모달을 여는 원본 입력 연쇄는 두 단계다.

1. application state가 3일 때 다음 둘 중 하나가 signed WORD
   `DAT_00c06e30`에 1을 기록한다.
   - `WM_KEYDOWN/VK_ESCAPE`: 게임 시간 DWORD가 3보다 크고
     `FUN_004823a0()`이 0을 반환할 때
   - 좌표 `(138,457)`, 크기 `28×15`인 gameplay-panel 객체의 **strict interior**에서
     primary button 상태 1로 누른 뒤, 같은 strict interior에서 상태 0으로 놓을 때.
     `DAT_00c06e70 == 1`이면 이 경로는 비활성이다. 이 패널의 사용자 노출 이름은 확정하지 않는다.
2. 다음 `FUN_00447bc0` 갱신에서 request가 1이고 application state가 3이면
   `0x00447c08`이 state `0x16`을 쓴다. application loop는 공통 UI를 초기화하고 state
   `0x17`로 전진한다. K01의 기존 확정 인덱스 `DAT_0088afcc=1` 때문에
   `FUN_00445730`은 mode 1을 반환하고 컨트롤 `0x005527b0`을 활성화한다. 이 컨트롤의
   strict interior `(264,110)-(376,138)`에서 primary button을 눌렀다가 놓으면
   `FUN_004495e0`이 pending `0x3f0`을 만든다. 같은 frame의 뒤 컨트롤
   `0x3ee`, `0x3ec`, `0x3ea`가 활성화되지 않아야 최종 반환과
   `DAT_00552998` 쓰기가 `0x3f0`으로 남아 공통 임무 목표 모달이 초기화된다.

`DAT_004bdfc8`의 완전한 structured direct-reference 집합 90개에서 immediate `0x16`을
쓰는 지점은 `0x00447c08` 하나다. 이 표현은 “어떤 producer도 더 없다”는 뜻이 아니다.
structured export에 없는 간접 포인터 쓰기나 handler 반환 경로가 없다고 단정하지 않는다.

분석은 원본 EXE·SPR와 재생성한 Ghidra 산출물만 사용했다. VM, runtime probe, 현재 웹 UI,
meaning 문자열, 화면 유사도와 `docs/archive/**`는 증거로 사용하지 않았다.

## 고정 원본

| 입력 | SHA-256 | 정적 용도 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | 함수·CFG·참조·embedded 경로·좌표·분기 |
| `original/imjinrok2/yfnt/buttons201.spr` | `4e55d6592b515fe8a9ebcc059fc6e2a487a3ed5db6affd0f516537a392741eec` | 컨트롤 자원, `112×28`, 42 frames |
| `original/imjinrok2/yfnt/gamemenuborder.spr` | `48f60d170a8305fbfc2a08d41b3de96bf19dfe99d9d3460996037df41ed6a8ed` | 공통 UI 배경 자원, `172×310`, 1 frame |

embedded 경로는 각각 `yfnt\buttons201.spr`와 `yfnt\gamemenuborder.spr`다.
seed를 추가한 뒤 `pnpm imjinrok:analyze-exe` 전체 파이프라인으로 생성물을 갱신했다. 기준선은
함수 2,448개, 문자열 1,545개, 참조 57,572개, 간접 분기 268개, 점프 테이블 234개,
seed 113개, 포함 seed 함수 111개다.

## 검증한 함수 경계

전용 추출기는 다음 25개 seed 포함 함수의 전체 body, CFG, 명령어 수와 body SHA-256을 검사한다.

| 함수와 전체 범위 | CFG / 명령어 | 이 질문의 역할 |
| --- | ---: | --- |
| `FUN_00411290`, `0x00411290-0x004112e2` | 1 / 20 | 공통 컨트롤 생성자 |
| `FUN_004113a0`, `0x004113a0-0x0041146d` | 6 / 56 | 컨트롤 자원·좌표·크기 초기화 |
| `FUN_004114d0`, `0x004114d0-0x004114ef` | 3 / 12 | 컨트롤 활성 필드 설정 |
| `FUN_004119f0`, `0x004119f0-0x00411a20` | 1 / 17 | frame draw vtable 전달 |
| `FUN_00411cb0`, `0x00411cb0-0x00411ccc` | 1 / 9 | 컨트롤 update vtable 전달 |
| `FUN_00411cd0`, `0x00411cd0-0x00411d86` | 14 / 57 | 활성·hit·버튼·sound/latch 갱신 |
| `FUN_00412e40`, `0x00412e40-0x00412fbf` | 7 / 94 | 공통 button SPR 목록 로드 |
| `FUN_004434a0`, `0x004434a0-0x0044357e` | 7 / 77 | SPR 파일 로드와 실패 반환 |
| `FUN_00445730`, `0x00445730-0x00445760` | 5 / 15 | 선택 단계에서 공통 UI mode 결정 |
| `FUN_00445770`, `0x00445770-0x004457c4` | 1 / 17 | gameplay UI 사각형 객체 초기화 호출 |
| `FUN_004457d0`, `0x004457d0-0x0044598d` | 23 / 135 | gameplay UI 초기화와 request reset |
| `FUN_004464c0`, `0x004464c0-0x0044735e` | 224 / 988 | gameplay 입력 상위 갱신 |
| `FUN_00447bc0`, `0x00447bc0-0x00447cfa` | 21 / 75 | request 1과 state 3을 state `0x16`으로 전환 |
| `FUN_004481d0`, `0x004481d0-0x00448225` | 6 / 21 | 전환 선행 갱신 호출자 |
| `FUN_00449090`, `0x00449090-0x00449260` | 26 / 118 | 공통 UI handler 반환 기록과 `0x3f0` 소비 |
| `FUN_00449320`, `0x00449320-0x004495dd` | 13 / 184 | 공통 UI 자원·컨트롤 생성과 mode별 활성화 |
| `FUN_004495e0`, `0x004495e0-0x004498f3` | 31 / 228 | 컨트롤 update, 상태 우선순위와 draw |
| `FUN_004590b0`, `0x004590b0-0x0045910b` | 7 / 26 | gameplay-panel strict hit test |
| `FUN_00459490`, `0x00459490-0x0045acfc` | 313 / 1,566 | panel press/release request producer |
| `FUN_0045bb50`, `0x0045bb50-0x0045bc45` | 14 / 61 | 포인터 입력 큐 갱신 |
| `FUN_0045f320`, `0x0045f320-0x0045f928` | 110 / 479 | Win32 key dispatch와 Escape producer |
| `FUN_0045f9c0`, `0x0045f9c0-0x004607ac` | 209 / 801 | application state `0x16/0x17` owner |
| `FUN_00460a10`, `0x00460a10-0x00460b4e` | 5 / 90 | 입력 handler 설치 |
| `FUN_004700b0`, `0x004700b0-0x0047056d` | 65 / 350 | map pointer/button 입력 갱신 |
| `FUN_00481ee0`, `0x00481ee0-0x00481fce` | 1 / 45 | gameplay UI signed WORD 사각형 필드 초기화 |

Ghidra가 함수 entry로 정의하지 않은 실제 vtable target과 key dispatch table은 원시 범위 전체를
별도로 고정한다.

| 원시 범위 | SHA-256 | 역할 |
| --- | --- | --- |
| `0x00411a30-0x00411b46` | `484b535fcfe85b683ccdbb1042d7211e8e7366a912ecacaff6609750113d6b71` | 컨트롤 상태별 frame draw |
| `0x00411df0-0x00411e36` | `3863eae89c0d3d1848aad35171f43a1eb4da0bc8f5a1299a7d106c84a72b3b55` | signed WORD strict-edge hit test |
| `0x0045f92c-0x0045f9b9` | `3a1a384453c2883c2c151e26017a83c0c882e91241912ba6ffe4f87ad44363bd` | Win32 key jump tables |

## application state `0x16` 생산

application state는 `DAT_004bdfc8`의 signed WORD다. 전용 추출기는 이 주소의 structured
direct references 90개 전체와 순서 digest
`4a779148bfc0fb3aad420557a89aaaef2b1134694c9e50b51409baaa172c921c`를
고정한다. 이 집합의 immediate `0x16` write는 다음 하나다.

```text
FUN_00447bc0
  0x00447be0: DAT_00c06e30 == 1 ?
  0x00447bea: DAT_004bdfc8 == 3 ?
  0x00447bf4: play sound 2
  0x00447bfb: FUN_004400b0(0x005e20b8)
  0x00447c08: DAT_004bdfc8 = 0x16
  return early
```

application loop의 state `0x16` case는 `0x004602c8`에서 `FUN_00448ff0`을 호출하고
`0x004602cd`에서 state `0x17`을 쓴다. 다음 state `0x17` case가
`0x004602e9`에서 `FUN_00449090`을 호출한다.

open request `DAT_00c06e30`의 structured direct references는 8개이고 순서 digest는
`ed254d697398a88e31e9e85491a9ab807385c593d1154c83eccc5ea7593ce4d1`다.
값 1의 direct producer는 두 개다.

### Escape 경로

`FUN_0045f320`은 `WM_KEYDOWN(0x100)` jump table에서 `VK_ESCAPE(0x1b)`를
`0x0045f4a1`로 보낸다.

- request가 이미 1이면 `FUN_004492c0`에 외부 종료를 요청하고 새 request를 쓰지 않는다.
- 아니면 application state가 정확히 3이어야 한다.
- game-time DWORD `DAT_007c5f80`은 3보다 커야 한다.
- `FUN_004823a0()`은 0이어야 한다.
- 성공하면 sound 2 뒤 `0x0045f4ea`가 request 1을 쓴다.

### gameplay-panel 경로

`FUN_00445770`은 `0x0088bd60`을 `FUN_00481ee0`에 전달한다. 후자는 offset
`+0x38`, `+0x3a`, `+0x3c`, `+0x3e`, 즉 주소 `0x0088bd98..0x0088bd9e`에 signed WORD
`left=138`, `top=457`, `width=28`, `height=15`를 초기화한다.
`FUN_004590b0`은 `DAT_00c06e70 == 1`일 때 false를 반환하며, 그 밖에는
`138 < x < 166 && 457 < y < 472`를 사용한다.

strict interior에서 primary state 1을 처음 관찰하면 sound 14를 호출하고
`DAT_005e2e16=1`, `DAT_005e2e14=1`을 쓴다. 뒤 frame에서 같은 interior의 state 0과
두 latch 1을 관찰하면 `0x0045a1b3`이 request 1을 쓰고 armed latch를 0으로 만들며 selection을
`-1`로 쓴다. 밖으로 나가거나 disabled이면 armed latch를 지운다. 객체의 화면상 이름은 코드와
사각형만으로 추정하지 않았다.

## 컨트롤 `0x005527b0`

`FUN_00412e40`은 고정 stride의 공통 SPR 객체들을 순서대로 적재한다. 두 번째 전역 객체
`0x00529428`은 `buttons201.spr`다. 이 객체의 structured direct references 12개 순서 digest는
`a246591344922ef12bfbab7db904629f536717ecf6ffe1bae21562946b4dee0b`다.

`FUN_00449320`은 `0x004493b6`에서 다음 값으로 컨트롤을 만든다.

| 객체 offset | 저장 폭 | 값 | 계산 |
| ---: | --- | ---: | --- |
| `+0x8c` | signed WORD | 264 | left |
| `+0x8e` | signed WORD | 110 | top |
| `+0x90` | signed WORD | 112 | `buttons201.spr` width |
| `+0x92` | signed WORD | 28 | `buttons201.spr` height |

따라서 right는 `264+112=376`, bottom은 `110+28=138`이다. hit 조건은
`264 < x < 376 && 110 < y < 138`이며 네 edge는 모두 제외된다.

`FUN_00411290`은 생성할 때 두 active DWORD field `+0x04`, `+0x08`을 모두 1로 초기화한다.
`FUN_00449320`의 mode 0은 `FUN_004114d0` setter를 호출하지 않고 끝으로 fallthrough하므로
이 생성자 초기 active 상태를 **보존**한다. mode 1은 setter로 active 1을 명시적으로 다시 쓰고,
mode 2와 mode 3은 setter로 active 0을 쓴다. 따라서 mode 0과 mode 1의 최종 active 값은
같지만 호출 부수효과는 같다고 모델링하지 않는다.

K01은 기존 결합 질문에서 `DAT_0088afcc=1`로 확정됐다. `FUN_00445730`은 선택 stage가
0이 아니면 mode 1을 반환하고, `0x004495a7`은 mode 1에서 이 컨트롤을 활성화한다.
두 active DWORD field가 모두 1이어야 update가 입력을 처리한다. 안쪽에서 누르는 동안 sound 15는
sound latch가 0일 때 한 번 호출되고 inside latch가 1이 된다. 현재 primary DWORD가 0이고 이전
정규화 DWORD가 1인 안쪽 release가 handler result 1을 만든다. 이전 값 2는 release로 인정되지
않는다.

draw는 입력 update 뒤 shared surface lock을 시도한다. lock이 성공하면 이 컨트롤은
`buttons201.spr` frame 3(normal), 4(hover), 5(held)를 사용한다. inactive여도 frame 3을
그린다. lock 실패는 앞서 발생한 입력 결과를 되돌리지 않으며 전체 공통 UI draw 구간만 건너뛴다.
draw 순서는 menu border, `0x005529a0`, **`0x005527b0`**, `0x005528f8`,
`0x00552b88`, `0x00552850`, `0x00552ae0`, `0x00552c28`, `0x00552a40`이다.

목표 컨트롤 뒤의 state-producing 컨트롤은 독립적으로 `0x3ee`, `0x3ec`, `0x3ea` 순서로
평가된다. 여러 개가 성공하면 마지막 성공 값이 최종 handler 반환이다. 최종 nonzero 반환만
`FUN_00449090`이 `DAT_00552998`에 기록한다.

## 재현 범위와 실패 경계

`analysis/fixtures/application-state-16-objective-control-vectors.json`은 세 원본 SHA-256을
고정하고 다음 결과 전체를 담는다.

- Escape 정상, 기존 request 종료 요청, state·시간 경계·script busy, 다른 message/key
- gameplay-panel press와 release, press 없는 release, 네 strict edge, disabled
- request/state 조합별 state `0x16` 전환
- K01 mode 1 setter 활성, mode 0의 생성자 active 보존, mode 2·3 setter 비활성과 multiplayer 조건
- 목표 컨트롤 normal·hover·held·release, 이전 primary 값 2, 네 strict edge, inactive
- 목표 release 뒤 `0x3ec` overwrite와 세 후속 컨트롤 동시 활성의 최종 `0x3ea`
- surface-lock 실패 뒤에도 유지되는 `0x3f0`

`tools/imjinrok/application-state-16-objective-control.test.mjs`는 모든 update 벡터를
조건 없이 결과 전체 `deepEqual`로 비교하고, Escape→state `0x16`→K01 mode 1→목표 release
연쇄를 연결한다. mode 0이 activation setter event를 만들지 않는 전용 회귀 검사도 있다. 필드
폭·boolean 검증과 변조 EXE·두 SPR·stale seed 실패도 검사한다.

SPR 런타임 load 실패는 **정적 전용**이다. 원본의 button loader와 menu-border loader가 실패를
보고한 뒤 계속한다는 호출 흐름은 고정했지만, 실패 이후 객체 크기나 화면 결과를 추정해 재현하지
않는다. 변조 SPR을 거부하는 추출기 테스트는 원본 런타임 loader 실패 재현이 아니다. sound 2·14·15와
내부 latch는 입력 순서에 필요한 호출/event·상태로만 재현하며 오디오 자원 parity를 주장하지 않는다.

## 이식 경계와 handoff

이번 질문은 클라이언트에 이식하지 않았다. 원본의 gameplay application state, Win32 입력,
gameplay-panel 객체와 공통 UI owner를 현재 허용된 UI 모듈만으로 정확히 연결할 수 없다.
`SkirmishScene.ts`, `packages/simulation/src/**`,
`packages/shared/src/scenarios.ts`는 수정하지 않았다.

향후 이식에는 simulation 소유 gameplay 상태와 UI 사이에 적어도 다음 계약이 필요하다.

- application state 3에서 objective-menu open request가 발생한 시점과 원인
- primary pointer의 현재/이전 정규화 상태와 원본 좌표계 위치
- K01 stage index와 공통 UI mode
- 목표 컨트롤 activation 결과 및 뒤 state-control overwrite 결과

이 계약의 소유 위치와 수명주기가 합의되기 전에는 임의 shared shape를 만들지 않는다.

## 미확정과 다음 질문

- `0x0088bd80` gameplay-panel의 사용자 노출 이름과 시각 자원
- 컨트롤 `0x005527b0`이 그리는 한국어 label의 문자열·글꼴·줄바꿈
- structured direct-reference export 밖의 application-state 간접 write 존재 여부
- 정상 원본 자원 대신 SPR runtime load가 실패한 뒤의 실제 객체·표시 결과

[후속 pending action dispatcher 분석](objective-pending-action-dispatch.md)은 목표 control
release 뒤 경쟁 overwrite, `0x3f0` 소비·활성·reset·실패 경로와 semantic
`open-objective-modal` 계약을 정적 확정·재현했다. 다음 연결 질문은 mechanism 소유 semantic
원본 mechanism action 발행 source를 찾는 것이다. 프로젝트 HUD button→`UIScene` event 경계는
[후속 프로젝트 구조 문서](objective-modal-ui-event-boundary.md)에서 별도 적응으로 연결했다.
`0x0088bd80` gameplay-panel의 생성 자원과 draw 경로도
화면상 원본 표시 식별을 위해 여전히 미확정이다.
