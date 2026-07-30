# K01 조선 창병 locomotion raw field·walk cadence

기준일: 2026-07-31

## 질문과 범위

K01 내부 클래스 `2`(원본 이름 `조선 창병`)의 일반 이동 함수는 어떤 type-record raw 값을 런타임
locomotion 필드로 복사하며, 상태 1·2의 walk phase를 언제 전진시키는가? 이 문서는 해당 raw
field 연결과 phase cadence만 다룬다. 속도 단위, 실제 world-cell 변위, 원본 update의 초 단위,
전투 cooldown 및 프로젝트 24 Hz 변환은 범위 밖이다.

## 원본과 분석 상태

| 파일 | SHA-256 | 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | type writer/initializer, entity initializer, normal movement |
| `original/imjinrok2/char/swordk.spr` | `414d285b207ba12afdd856a0f16ddde615381cf491fe493d6ededf91681b55eb` | class 2 identity binding |

- 분석 상태: `정적 확정` — 아래에 적은 raw field 복사와 cadence 제어 흐름에 한정한다.
- 재현 상태: `재현 완료` — 정상·phase-zero·signed-WORD 경계를 순수 replay vector로 고정했다.
- 구현 상태: `없음` — 분석 도구만 추가했다.

클래스 2는 type record `0x008830a8`, 원본 이름 `조선 창병`, sprite slot 100,
`char\swordk.spr`다. 프로젝트 안정 ID `swordsman`은 이 식별과 별개인 호환 이름이다.

## 주소·필드 데이터 흐름

| 단계 | 주소 | 확인한 raw 동작 |
| --- | ---: | --- |
| type writer | `0x0045bd00` | argument 30을 type `+0x3c`, argument 38을 type `+0x50`에 기록 |
| class 2 type call | `0x0045bfc4`~`0x0045c043` | type `+0x3c`, `+0x50`의 초기 argument는 모두 0 |
| entity initializer | `0x00437650`, `0x00437dd4`~`0x00437e1a` | type `+0x50`→entity `+0x4ea`, type `+0x3c`→entity `+0x4ee` 복사 |
| entity initializer | `0x00437b0b`~`0x00437b27` | entity `+0x4ec`, `+0x4f2`, `+0x4ee`를 먼저 0으로 초기화 |
| normal movement | `0x00425f03`~`0x00425f5b` | `+0x4ee`을 읽어 `+0x4f2` 갱신 경로에 사용 |
| normal movement | `0x00425c9f`~`0x00425d21`, `0x004261e3`~`0x00426269` | `+0x4ec` increment·`+0x4ea` signed compare·state 1/2 write·`+0x1b2` signed-IDIV phase update |

따라서 `+0x4ee`은 class 2 type record의 raw input과 runtime accumulator `+0x4f2`를 잇는
확정된 연결이다. 하지만 그 raw 값의 좌표 단위, 사람용 속도 의미, 이후 writer 및 모든 분기는
아직 닫히지 않았다. 이를 `movementSpeed`라고 이름 붙이거나 초당 거리로 환산하지 않는다.

## walk phase cadence

상태 선택자는 `BYTE +0xba`다. 값 1이면 animation state 2, 그 외면 state 1을 기록한다. 두
상태 모두 클래스 2 초기화에서 phase count 8을 받는다.

두 cadence entry가 있다.

1. `0x00425c9f` pre-displacement entry는 시작 `WORD +0x1b2 == 0`이면 이 cadence block을 건너뛴다.
2. `0x004261e3` post-displacement entry는 phase zero에도 state/counter 경로를 실행한다.

실행한 entry는 `WORD +0x4ec`을 16-bit increment하고 signed-WORD로 `WORD +0x4ea`와 비교한다.
증가한 counter가 limit보다 작으면 phase를 유지한다. 그 외에는 counter를 0으로 쓰고,
`signed WORD(+0x1b2 + 1) IDIV 8`의 remainder low WORD를 `+0x1b2`와 `+0x34`에 기록하며
dirty `BYTE +0x04 = 1`을 쓴다. 이 signed arithmetic은 UI FPS나 wall-clock을 읽지 않는 local
field rule일 뿐, 호출 빈도를 확정하지 않는다.

## 재현 fixture와 도구

```bash
pnpm imjinrok:extract-k01-class2-locomotion-cadence
node --test tools/imjinrok/k01-class2-locomotion-cadence.test.mjs
```

- 추출기는 EXE·`swordk.spr`·Ghidra seed source hash와 함수 전체/핵심 code range hash를 검사한다.
- [`k01-class2-locomotion-cadence-vectors.json`](../../../analysis/fixtures/k01-class2-locomotion-cadence-vectors.json)는
  normal hold, alternate wrap, pre-entry phase-zero skip, post-entry phase-zero advance, signed counter와
  signed phase dividend 경계를 고정한다.
- 테스트는 변조된 seed와 EXE도 거부한다. fixture는 product simulation이나 browser frame clock을 입력으로 쓰지 않는다.

## 현재 구현과의 경계

현 제품의 `movementSpeed`는 project fallback이며 simulation은 `movementSpeed * SIM_TICK_SECONDS`로
이동량을 만든다. renderer clip은 `clip.fps`의 free-running duration과 playback speed를 사용한다.
현재 K01 content의 수치와 provisional clip FPS는 위 raw field 또는 cadence에서 유도하지 않았다.
그러므로 이 분석은 제품 movement/attack/FPS 값을 바꾸거나 원작 일치를 주장하는 근거가 아니다.

## 다음 분석

1. `+0x4ee`와 `+0x4ea`의 K01 runtime writer 집합 및 reachability를 정적으로 닫는다.
2. `+0x4f2` accumulator가 좌표·보간·cell commit에 연결되는 전체 branch를 복원한다.
3. 원본 accepted entity-update 호출 빈도를 scheduler까지 연결한 뒤에만 별도, 명시적인 project 24 Hz conversion 정책을 검토한다.
