# K01 일본 귀갑차 accepted-update turn clock

class 14 일본 귀갑차의 raw 16-ring 방향은 원본 scheduler가 승인한 update 중 정확히 어느 시점에
전진하며, intermediate 값은 이동·공격 소비자에 어떻게 보이는가? 또한 이를 8방향 `Facing` 손실
없이 프로젝트 시간축에 옮기려면 어떤 최소 계약이 필요한가?

## 상태

- 분석 상태: `정적 확정` — scheduler accepted path, active entity dispatch, class-14 turn-wrapper의
  도달 가능한 call path, 16-ring mutation 및 두 consumer의 읽기 필드에 한정한다.
- 재현 상태: `재현 완료` — 승인·거부, equality/no-step, grid→intermediate→grid, opposite tie,
  BYTE/DWORD wrap을 독립 vector로 재현한다.
- 구현 상태: `없음` — runtime/UI와 `Facing`은 수정하지 않았다. 아래 project 계약은 설계 note다.

## 입력 고정과 검증 도구

| 입력 | 값 |
| --- | --- |
| 원본 EXE | `original/imjinrok2/imjinrok2.exe` |
| EXE SHA-256 | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| 추출기 | [`extract-k01-turtle-tank-runtime-clock.mjs`](../../../tools/imjinrok/extract-k01-turtle-tank-runtime-clock.mjs) |
| focused test | [`k01-turtle-tank-runtime-clock.test.mjs`](../../../tools/imjinrok/k01-turtle-tank-runtime-clock.test.mjs) |

추출기는 EXE hash, canonical `functions.json`/`references.json`/`jump-tables.json`의 source hash,
16개 함수의 instruction count/hash, 19개 direct-call edge와 9개 raw byte anchor를 함께 검증한다.
주요 function contract는 다음과 같다.

| 함수 | body range | instructions / SHA-256 |
| --- | --- | --- |
| `FUN_00447bc0` | `0x00447bc0-0x00447cfa` | 75 / `c5166177633b255028ae02aa6f7a60350f7e93f09ce5fcf101ac92ba066eefde` |
| `FUN_00447e10` | `0x00447e10-0x00447ec8` | 66 / `75860fcb9a74162cab2cbe0b72b7d0238d774205c7f63f118dd6c5da6af2e4f5` |
| `FUN_00447360` | `0x00447360-0x00447599` | 156 / `8700298d4e2900a0f2833b1f9e1143c47d324478ef5fa419170e7945de7dd772` |
| `FUN_0043c9c0` | `0x0043c9c0-0x0043d35f` | 684 / `eb1c7c21a9af5a2099a2d716ad1253db65fff75ef0befcae871e3462f4d3bcfa` |
| `FUN_0043d450` | `0x0043d450-0x0043d472` | 10 / `68070666ba954c3ee6d0b5fc857e6bdbb5fe86416ad724e22eb1986cc0724ced` |
| `FUN_004381c0` | `0x004381c0-0x00438300` | 84 / `3bda3c12b28b9cd641aa3d8af3d133754554800f3212d45c778e538ea022be4d` |
| `FUN_0041efa0` | `0x0041efa0-0x0041f272` | 140 / `0dd6b72b3f73f96672d22ceac55b7565cb93e92e3bc38598fa25a7b55013a646` |
| `FUN_0041e370` | `0x0041e370-0x0041e3bd`, `0x0041e3f0-0x0041e5db` | 115 / `aa96086d04f698f4965205fa74803f0cc7d7db9a05ee610834a0ccffac293a61` |

나머지 chain function(`0x0045f9c0`, `0x00416c60`, `0x00416c70`, `0x00416ad0`,
`0x00425af0`, `0x00425b20`, `0x004262e0`, `0x004381a0`)의 body/hash도 extractor output에서
같이 고정한다. 테스트는 EXE와 functions/reference/jump-table artifact 각각의 변조를 거부한다.

## accepted update에서 helper까지

`0x0045fd5d`와 `0x004602e4`가 main loop `FUN_0045f9c0`에서 scheduler
`FUN_00447bc0`으로 가는 두 direct caller다. queue message가 있는 iteration은 scheduler 이전에
되돌아가며, ordinary scheduler path는 `0x00447e10` time gate가 0이면 `0x00447cf4`로 반환한다.

승인된 경우의 순서는 엄격하다.

1. `0x00447c85-0x00447c8e`가 `DWORD [0x007c5f80]`을 wrap increment한다.
2. `0x00447cb8`이 `FUN_00447360`을 정확히 한 번 호출한다.
3. active list entry는 `0x00447480-0x0044749e`에서 `0x558` stride runtime entity로 바뀌어
   `FUN_0043c9c0`에 전달된다.
4. `+0x1b0 WORD` action switch (`0x0043cd88-0x0043cda3`)의 action 5 destination은
   `0x0043d153`이다. 이 path는 `0x00416c60`이 1을 반환할 때 `0x00416c70`을 호출한다.
5. 이 handler의 verified branches는 `0x00416ad0`, 그리고 flags bit `0x08`에 따라
   `0x00425af0→0x00425b20` 또는 `0x00425af0→0x004262e0`에 도달한다. 세 branch family는
   `0x0043d450`을 호출한다.
6. wrapper `0x0043d450`은 `DWORD [entity+0x74] & 0x80000008`가 nonzero일 때
   `0x0043d45e→FUN_004381c0`을 호출한다. zero면 `0x004381a0`이 normal/extended 방향을
   함께 쓴다.

따라서 **accepted update 하나가 곧 방향 helper 한 번은 아니다.** scheduler가 승인되고 해당 active
class-14 entity의 그 행동 branch가 wrapper에 도달하며 special mask가 참일 때에만 `FUN_004381c0`이
그 accepted update 안에서 실행된다. scheduler가 pre-update, time, readiness 또는 transition
branch에서 거부되면 global tick 증가·pool update·active entity dispatch 모두 발생하지 않으므로 이
helper도 실행되지 않는다.

이 문서는 위의 도달 가능한 path를 확정하지만 모든 class-14 action 상태가 wrapper에 도달하는
조건 전체에 사람용 이름을 붙이거나, active class-14마다 accepted update마다 반드시 helper가
호출된다고 주장하지 않는다.

## 16-ring advance와 consumer visibility

기존 turtle-tank pilot의 ring은 다음과 같다.

```text
[1, 1000, 5, 1001, 4, 1002, 20, 1003, 16, 1004, 80, 1005, 64, 1006, 65, 1007]
```

`FUN_004381c0`은 `+0x1e8 WORD` current와 target을 비교한다. 같으면 `+0x1f1 BYTE`만 0으로
쓰고 1을 반환한다. 다르면 `+0x70 BYTE`를 wrap increment해 `+0x71 BYTE`와 비교한다. incremented
counter가 limit보다 작으면 no-step이고, 그렇지 않으면 counter를 0으로 reset한 뒤 ring을 한 칸
전진한다. forward distance `<8`은 forward, `>=8`은 backward이므로 정반대 tie도 backward다.
class-14 creation default limit는 2다.

cadence step은 다음 순서로 관찰된다.

1. 새 raw value를 `+0x1e8 WORD`에 쓴다.
2. 새 value가 `<1000`인 grid entry일 때만 `+0x1e6 WORD`에도 복사한다.
3. `+0x1f1=1`, `+0x04=1`을 쓴다.

그 결과 intermediate `1000..1007`은 helper 반환 직후부터 special movement consumer
`FUN_0041efa0`가 읽는 `+0x1e8`에서 보인다. 반면 class-14 special attack consumer
`FUN_0041e3f0`는 `+0x1e6`을 읽으므로, intermediate step에서는 이전 grid 방향을 계속 받는다.
다음 cadence step이 grid에 착지한 뒤에야 attack consumer도 새 grid 값을 받는다.

예를 들어 current `1`, target `5`, counter `0`, limit `2`이면 helper invocation 네 번의
결과는 `1` no-step → `1000` (move만 새 intermediate) → `1000` no-step → `5`
(move/attack 모두 새 grid)다. equality는 cadence를 reset하지 않으며 `+0x1f1`만 clear한다.

이는 helper 이후의 **필드 관찰 가능성**을 확정한다. recovered scheduler/renderer 전체 순서가
아니므로 특정 화면 frame에서 같은 update 직후 반드시 draw가 일어난다는 별도 주장은 하지 않는다.

## fixed-width 경계와 시간 단위

- accepted counter `0x007c5f80`은 DWORD이며 `0xffffffff→0` wrap 뒤에도 accepted pool call은
  한 번이다.
- cadence counter와 limit는 unsigned BYTE다. `0xff` counter는 increment 시 `0`이 된 뒤 비교한다.
- `0x00882e04`는 `timeGetTime`에서 샘플한 DWORD milliseconds다. `FUN_00447e10`은 selectable,
  feedback/periodic-adjusted interval과 message-loop/pregate/readiness 조건을 쓴다.

그러나 exact accepted updates per second, class-14 turn seconds-per-step, 고정 Hz, 또는 project
24 Hz에 대한 exact multiplier는 **정적으로 증명되지 않았다**. delayed clock gate도 backlog를 여러
accepted update로 반복 보충하지 않는다. 따라서 transient effect의 raw global-tick delta threshold
2를 초로 환산할 수 없으며 24 Hz를 근거로 그것을 보완해서도 안 된다.

## 최소 lossless project contract (설계 note)

runtime/UI 구현 전 root review가 필요한 최소 상태는 다음과 같다.

```ts
type TurtleTankRaw16 = 1 | 5 | 4 | 20 | 16 | 80 | 64 | 65
  | 1000 | 1001 | 1002 | 1003 | 1004 | 1005 | 1006 | 1007;

interface TurtleTankTurnState {
  originalAcceptedUpdate: number; // unsigned DWORD, wrap 보존; project tick과 별도
  movementRaw16: TurtleTankRaw16; // +0x1e8에 대응
  attackGrid8: Facing;            // +0x1e6에 대응, raw16 grid entry일 때만 갱신
  cadenceCounter: number;         // unsigned BYTE
  cadenceLimit: number;           // unsigned BYTE
  turnPending: number;            // raw BYTE
  dirty: boolean;
}
```

`Facing`만 저장하거나 `1000..1007`을 가장 가까운 8방향으로 즉시 반올림하면 movement intermediate와
attack의 이전-grid 유지라는 두 소비자 계약이 사라진다. move는 `movementRaw16`을, attack은
`attackGrid8`을 사용해야 한다. `originalAcceptedUpdate` 생산과 `timeGetTime` gate를 project 24 Hz
loop에 연결하는 accumulator/resampling은 원작에서 복원된 사실이 아니라 명시적인 port policy로
분리해야 한다.

## 재현 vector

focused test는 다음 관찰값을 고정한다.

| vector | 결과 |
| --- | --- |
| clock gate reject | scheduler counter와 모든 turn field 불변, helper 0회 |
| normal cadence | counter 1/limit 2에서 16-ring 한 칸, counter reset |
| grid→intermediate→grid | `1→1000→5`; `+0x1e6`은 중간에 1, 마지막에 5 |
| equality/no-step | pending clear만, cadence 불변 |
| opposite tie | `1→1007` backward |
| BYTE/DWORD wrap | cadence `0xff→0` no-step, accepted `0xffffffff→0` |
| no helper behavior branch | accepted scheduler step은 발생하지만 turn state는 불변 |

## 미확정과 다음 작업

- K01 실행별 selector/feedback/message 분포와 실제 accepted-update wall-clock 빈도
- 모든 class-14 action path가 wrapper에 도달하는 완전한 gameplay 조건
- raw accepted update/time gate를 24 Hz generic runtime에 연결할 의도적 project policy
- renderer 호출 순서와 실제 화면 표시 시점

다음 정적 질문은 runtime port가 아니라, class-14의 각 action state가 위 wrapper로 들어가는 정확한
gameplay reachability를 좁게 분리하거나, 별도의 승인 아래 raw scheduler를 project clock adapter로
설계하는 것이다.
