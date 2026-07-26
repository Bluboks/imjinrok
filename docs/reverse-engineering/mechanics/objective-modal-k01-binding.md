# Which upstream return-value or indirect producer makes signed WORD DAT_00552998 equal 0x3f0, and does the DAT_0088afcc-selected 128-byte record statically bind the common objective modal to K01 objective text?

기준일: 2026-07-26

## 판정

- 분석 상태: `정적 확정`
- 재현 상태: 이 문서에 적은 상태 반환·signed WORD 인덱스·레코드 결합 범위는 `재현 완료`
- 구현 상태: `분석 전용`, 새 클라이언트 장면 연결 없음

K01은 공통 임무 목표 모달에 정적으로 결합된다. 한국 캠페인 1단계 선택은
`DAT_0088afcc = 1`을 기록한다. 모달은 이 signed WORD를 128배해 `0x00abf0e8`에 더하므로
`0x00abf168`의 첫 유효 레코드와 `script\k0110`을 선택하고, 해당 파일의 `OBJECTIVE` 명령 두
인수를 텍스트 입력으로 사용한다. 같은 인덱스 1은 `stagemap\k01.map`과 K01 임무 handler
`FUN_0048a5c0`에도 연결된다.

`DAT_00552998 = 0x3f0`의 생산자도 복원했다. `FUN_004495e0`에서 컨트롤 객체
`0x005527b0`의 갱신 결과가 1이면 `0x004496b5`가 `EDI = 0x3f0`을 기록한다. 그 뒤
`0x005528f8`, `0x00552ae0`, `0x00552850` 세 컨트롤이 독립적으로 차례로 평가되어, 활성화된
컨트롤은 pending 상태를 각각 `0x3ee`, `0x3ec`, `0x3ea`로 바꾼다. 여러 개가 활성화되면 마지막
활성 컨트롤의 값이 남는다. 아무것도 덮어쓰지 않을 때 `0x004498ec`가 `0x3f0`을 AX로 반환한다.
`FUN_00449090`은
`0x004490ed`에서 이 함수를 호출하고 nonzero 반환을 `0x00449105`에서 signed WORD
`DAT_00552998`에 기록한다. 따라서 이전 문서에서 미해결이던 return-value 생산 경로는 직접 literal
메모리 쓰기가 아니라 handler 반환을 통한 경로로 확인됐다.

이 판정은 원본 EXE·스크립트·맵과 완전한 정적 함수·원시 범위 검사에만 근거한다. VM, 런타임 probe,
화면 유사도와 동적 playthrough는 사용하지 않았다.

## 고정 입력

| 입력 | SHA-256 | 용도 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | 제어·데이터 흐름, 경계, embedded 경로 |
| `original/imjinrok2/script/K0110` | `d9dcc3c78d0373181677afc63fe9331ff561387e36877a62912ca66515f4aea8` | K01 목표 텍스트 입력 |
| `original/imjinrok2/script/K0210` | `53a0a6f03b6ff7bc8d2456b5c66712054a73a2c4b921fff6c62f765552bd4331` | 인접 인덱스 교차 검사 |
| `original/imjinrok2/stagemap/k01.map` | `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb` | K01 맵 결합 입력 |

`analysis/config/seed-addresses.txt`를 바꾸고 전체 `pnpm imjinrok:analyze-exe` 파이프라인으로
`analysis/generated/imjinrok2/`를 재생성했다. 현재 기준선은 seed 113개, 포함 seed 함수 111개다.
전역 자동 분석 개수는 함수 2,448개, 정의 문자열 1,545개, 내부 참조 57,572개, 간접 분기 268개,
점프 테이블 234개로 유지된다.

## 완전 함수와 원시 범위

전용 추출기는 다음 16개 seed 포함 함수의 전체 본문 범위, CFG 블록 수, 명령어 수와 바이트
SHA-256을 검사한다.

| 함수 범위 | CFG / 명령어 | 이 질문에서 확인한 역할 |
| --- | ---: | --- |
| `FUN_0043e620`, `0x0043e620-0x0043e870` | 34 / 154 | 국가·단계 선택을 `FUN_0048d690`에 전달 |
| `FUN_00449090`, `0x00449090-0x00449260` | 26 / 118 | handler 반환을 UI 상태 WORD에 기록하고 `0x3f0` 소비 |
| `FUN_004495e0`, `0x004495e0-0x004498f3` | 31 / 228 | 컨트롤 갱신 결과를 `0x3f0` 등 상태 반환값으로 변환 |
| `FUN_0045f9c0`, `0x0045f9c0-0x004607ac` | 209 / 801 | application state `0x16`에서 공통 UI 초기화 후 `0x17`, 다음 state에서 소유 함수 호출 |
| `FUN_004838f0`, `0x004838f0-0x0048399f` | 9 / 68 | 선택 스크립트의 종류 7 레코드에서 두 문자열 선택 |
| `FUN_0048a5c0`, `0x0048a5c0-0x0048a878` | 32 / 181 | 인덱스 1의 K01 임무 handler |
| `FUN_0048d030`, `0x0048d030-0x0048d401` | 1 / 371 | 레코드 객체 초기화와 K0110·K0210 경로 기록 |
| `FUN_0048d410`, `0x0048d410-0x0048d594` | 31 / 110 | signed WORD 임무 인덱스별 맵 로더 dispatch |
| `FUN_0048d610`, `0x0048d610-0x0048d650` | 7 / 24 | 국가·단계별 레코드 선택 |
| `FUN_0048d660`, `0x0048d660-0x0048d681` | 6 / 13 | 국가별 단계 수 반환(국가 1·2는 8, 국가 3은 7) |
| `FUN_0048d690`, `0x0048d690-0x0048d6e4` | 7 / 22 | 국가별 offset을 적용해 `DAT_0088afcc` 기록 |
| `FUN_0048dbe0`, `0x0048dbe0-0x0048dda9` | 21 / 147 | 선택 인덱스에 대응하는 맵 로드 |
| `FUN_0048ddb0`, `0x0048ddb0-0x0048deca` | 36 / 105 | 선택 인덱스에 대응하는 임무 handler dispatch |
| `FUN_004a5730`, `0x004a5730-0x004a5977` | 13 / 157 | 모달에서 signed WORD 인덱스로 128바이트 레코드 선택 |
| `FUN_004aafa0`, `0x004aafa0-0x004ab2ac` | 12 / 170 | 단계 선택 UI의 데이터 소비 |
| `FUN_004ab630`, `0x004ab630-0x004ab6b5` | 8 / 58 | 단계 선택 레코드 정리 |

Ghidra가 함수로 정의하지 않은 단계 제목 레코드 로더 `0x004ab4f0-0x004ab62d`는 seed 함수로
꾸미지 않고 원시 코드 범위 전체 SHA-256
`3c02ea5bd0c671671e50b5d7e14b7c86be7b8dda32bb639feb48fa7dc2e48209`로 검사한다.

## `0x3f0` return-value 생산 경로

```text
application state 0x16:
  0x004602c8 FUN_00448ff0()
  application state = 0x17

application state 0x17:
  0x004602e9 FUN_00449090()

FUN_00449090:
  0x004490ed result = FUN_004495e0(surface)
  if low WORD result != 0:
    0x00449105 DAT_00552998 = low WORD result

FUN_004495e0:
  0x004496a5 update control object 0x005527b0
  if result == 1:
    0x004496b5 EDI = 0x3f0
  0x004496ba update control object 0x005528f8
  if result == 1:
    EDI = 0x3ee
  0x004496fd update control object 0x00552ae0
  if result == 1:
    EDI = 0x3ec
  0x00449712 update control object 0x00552850
  if result == 1:
    EDI = 0x3ea
  0x004498ec AX = DI
```

따라서 정확한 `0x3f0` 전제는 컨트롤 `0x005527b0`이 1을 반환하고 뒤의 다른 return-producing
컨트롤 세 개가 모두 1을 반환하지 않는 것이다. 세 컨트롤은 서로 배타적인 enum이 아니며
`0x3ee → 0x3ec → 0x3ea` 순서로 독립 평가한다. 따라서 `0x3ee`와 `0x3ec`이 함께 활성화되면
`0x3ec`, 세 개가 모두 활성화되면 마지막 `0x3ea`가 최종 반환이다. 이 질문은 컨트롤 객체의 사용자
노출 한국어 이름이나 아이콘 의미를 확정하지 않는다.

재현 모델의 시작점은 목표 컨트롤이다. 그보다 앞서 평가되는 one-shot과 상태 3 컨트롤은 비활성인
범위로 고정한다. 목표 컨트롤 이후의 상태 생산 컨트롤 세 개는 모두 원본 순서대로 재현한다. 따라서
목표 컨트롤이 비활성이고 `0x3ec` 컨트롤만 활성인 벡터에서는 기존 pending 값이 0이므로
“pending `0x3ec` 설정”으로 기록하고, 기존 값이 있으면 이전 값과 새 값을 모두 표시하는
“덮어쓰기” 이벤트로 기록한다.

## K01 인덱스와 128바이트 레코드

`FUN_0043e620`은 선택 단계를 signed WORD `0x00532b44`에 저장하고, 국가 signed WORD
`0x0053025c`와 함께 `0x0043e799`에서 `FUN_0048d690(0x00abf068, country, stage)`에
전달한다. `FUN_0048d690`의 쓰기 규칙은 다음과 같다.

| 국가 | `DAT_0088afcc` 결과 |
| ---: | --- |
| 1 | signed WORD `stage` |
| 2 | signed WORD `stage + 10` |
| 3 | signed WORD `stage + 20` |
| 그 밖 | 기존 값 유지 |

덧셈과 저장은 signed WORD 결과로 관찰하므로 재현 모델은 16비트 wrap을 포함한다. 정상 K01 입력
`country=1, stage=1`은 `0x0048d6dc`에서 `DAT_0088afcc=1`을 기록한다.

`FUN_0048d030`이 초기화하는 객체의 시작은 `0x00abf068`이고, 모달 레코드 기준은 그보다
`0x80` 뒤인 `0x00abf0e8`이다. `FUN_004a5730`의 `0x004a57fa-0x004a581a`는
`DAT_0088afcc`를 sign-extend하고 7비트 왼쪽 이동해 아래 주소를 만든다.

```text
selected_record = 0x00abf0e8 + signed(DAT_0088afcc) * 128
K01 index 1   -> 0x00abf168 -> script\k0110
neighbor 2    -> 0x00abf1e8 -> script\k0210
boundary -1   -> 0x00abf068 -> 초기화된 zero record
```

EXE embedded 문자열도 바이트 단위로 고정한다.

| VA | 값 |
| --- | --- |
| `0x004c31b8` | `script\k0110` |
| `0x004c31a8` | `script\k0210` |
| `0x004c31c8` | `stagemap\k01.map` |
| `0x004c31dc` | `stagemap\k02.map` |

인덱스 1은 `FUN_0048d410`의 맵 dispatch에서 `stagemap\k01.map`을, `FUN_0048ddb0`의
`0x0048de12`에서 `FUN_0048a5c0`을 선택한다. 이 handler는
`0x0048a6cf`에서 `script\K0115`, `0x0048a78a`에서 `script\K0120`을 참조한다. 이 독립된
맵·임무 handler 결합이 같은 인덱스 1을 K01로 식별한다.

## K01 목표 텍스트 입력

고정 SHA-256의 `script/K0110`을 fatal Windows-949로 해석하고 정확히 하나인 `OBJECTIVE`
명령을 파싱한다. 모달에 전달되는 두 입력은 다음과 같다.

1. `1. 봉화대를 짓고 적군 섬멸 (유성룡, 권율은 살아 남아야 한다.)`
2. 빈 문자열

인접 인덱스 오프셋 오류를 잡기 위해 `script/K0210`도 같은 방식으로 검증한다.

1. `1. 어가를 평양성까지 대피시킨다. (유성룡은 살아 남아야 한다.)`
2. 빈 문자열

이 문자열 결합은 정적 확정됐지만 글꼴 face·크기와 한국어 줄바꿈은 이번 질문에 포함하지 않는다.

## 재현과 실패 경계

`analysis/fixtures/objective-modal-k01-binding-vectors.json`은 네 원본 입력 해시를 고정하고 다음
관찰 가능 결과를 담는다.

- 무반응과 정상 `0x3f0`
- 각 독립 컨트롤의 `0x3ee`, `0x3ec`, `0x3ea` 결과와 목표 컨트롤 없이 뒤 컨트롤만 활성화된 경로
- `0x3ee+0x3ec` 동시 활성화와 세 컨트롤 동시 활성화의 마지막 활성 값 우선순위
- 국가 1·2·3의 정상 offset, 지원하지 않는 국가의 기존 값 유지, 음수 단계와 signed WORD wrap
- 인덱스 1의 K0110·K01 map·K01 handler 결합, 인접 인덱스 2의 K0210 교차 검사, 인덱스
  `-1`의 zero-record 주소

`tools/imjinrok/objective-modal-k01-binding.test.mjs`는 모든 벡터의 완전한 기대 결과를
`deepEqual`로 비교한다. 변조 EXE·K0110·K0210·K01 map, stale 분석 산출물, signed WORD 범위
밖 입력과 boolean이 아닌 컨트롤 활성 값은 상세 오류로 실패한다. 추출기는 전체 seed 함수·원시
범위·26개 정적 anchor와 embedded 경로를 다시 검사하므로 문자열만 맞춘 테스트가 아니다.

## 이식 경계와 미확정 항목

이번 질문의 결과는 분석 전용이다. 기존
`apps/game-client/src/originalObjectivePanelLayout.ts`는 앞선 질문에서 재현 완료한 공통 모달
기하·입력·cleanup 모델이며, 이번에 복원한 K01 진입 상태나 텍스트를 장면에 연결하지 않았다.
`SkirmishScene.ts`도 수정하지 않았다. K01 결합이 정적 확정됐다는 사실만으로 미확정 글꼴·줄바꿈과
표시 트리거를 임의 구현하지 않는다.

남은 항목은 다음과 같다.

- 컨트롤 객체 `0x005527b0`의 사용자 노출 한국어 label
- state `0x16` request를 만드는 gameplay-panel의 화면상 정체·자원·draw 경로
- 원본 글꼴 face·크기와 K01 목표 문장의 한국어 줄바꿈 규칙
- 레코드 객체가 비워 둔 zero record의 역사적 이유

[후속 분석](application-state-16-objective-control.md)은 state `0x16`의 complete structured
direct-reference 생산, Escape·gameplay-panel request와 `0x005527b0`의
`buttons201.spr` 자원·사각형·입력을 정적 확정·재현했다. 다음 좁은 UI 질문은 gameplay-panel의
화면상 정체·자원·draw 경로를 복원하는 것이다.
