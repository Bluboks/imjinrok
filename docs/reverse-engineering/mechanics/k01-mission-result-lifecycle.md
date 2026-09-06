# K01 미션 결과 latch·timer·commit 수명주기

이 문서는 K01 general-presence와 보호 영웅 loss latch, beacon post-state bypass,
`FUN_0048d6f0`의 strict 2000 ms timer resolver, distinct raw-global-tick result commit의 순서와
raw 조건을 기록한다. source timer는 [K01 result clock](k01-result-clock.md)에 기록한
`timeGetTime` millisecond result clock을 독립적으로 사용하며, 별도 raw global tick은 dispatcher
cache key로 남는다.

## 범위와 상태

- 분석 상태: `정적 확정` — K01 updater의 loss latch와 beacon/영웅 순서,
  공통 timer resolver, dispatcher의 K01 분기, raw global tick별 result commit 범위
- 재현 상태: `재현 완료` — raw active list, full reference, zero sentinel, strict timer 경계,
  wrap·signed overflow, 동시 timer, pre-gate, distinct-tick 정상·경계·실패 벡터
- 구현 상태: `bounded product integration` — `k01MissionResult.ts`가 unsigned DWORD timer
  arithmetic, strict `>2000`, signed-absolute overflow, win-first priority, latch order와
  distinct raw-tick cache를 pure kernel으로 보존한다. `k01MissionResultPolicy.ts`는 source
  profile v5와 local/headless clock adapter를 연결한다. project epoch와 cadence는
  [K01 scenario policy adapter](../../development/k01-scenario-policy-adapter.md)에 기록한
  intentional product adaptation이다.

이 문서는 K01 결과 판정의 raw 반환과 write/call 순서를 다룬다. 결과 화면, 사람용 승패 연출,
초 단위 지연, generic simulation의 결과 정책은 범위 밖이다.

## 원본과 독립 재현

| 입력 | SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |

독립 추출기는
[`extract-k01-mission-result-lifecycle.mjs`](../../../tools/imjinrok/extract-k01-mission-result-lifecycle.mjs),
집중 테스트는
[`k01-mission-result-lifecycle.test.mjs`](../../../tools/imjinrok/k01-mission-result-lifecycle.test.mjs)다.
EXE/source hash, 함수 range·instruction hash·CFG, 13개 call edge, 7개 raw byte anchor,
관련 direct reference와 K01 jump-table case를 함께 검사한다. stale source, 누락 seed,
변조된 call edge·reference·jump-table·EXE는 오류로 중단한다.

seed를 추가한 canonical 분석은 두 번 생성했고 다음 세 파일의 SHA-256이 두 실행에서 같았다.

| 산출물 | SHA-256 |
| --- | --- |
| `SHA256SUMS` | `e36f03c993e3716e4414d5912f70b34127ac7ea01ec05b3709e04e5fd6f33936` |
| `manifest.json` | `b486491b62178154c8039e86a909b46023c639251031cf36c30bed0b952f06dd` |
| `seeds.json` | `da15d5f00b094b90d422bac9c197eb72e31d0677f2513a0a0882492cb121f200` |

## 함수와 raw 전역

| 함수·범위 | CFG / 명령어 | instruction SHA-256 | 이 질문의 raw 역할 |
| --- | ---: | --- | --- |
| `0x004481d0-0x00448225` | 6 / 21 | `3c4ad59801dd66dcb03339fb810c187160b58ccdc18848f6e80ee39bd77b4d91` | distinct raw global tick gate와 최종 result write/call |
| `0x00488080-0x004880e4` | 7 / 32 | `329a17acba64de024a67a0e61cfde1782db422d657ac5c2a89556ed20cebeca5` | active-list raw general-presence 검사 |
| `0x004492f0-0x004492fa` | 1 / 2 | `db1aafb4547828393fb63a1866d2d905456d693b577cdbd67ad50fa5c18d78c5` | timer result에서 `DWORD 0x0055299c=1` |
| `0x0048d6f0-0x0048d73a` | 7 / 31 | `387402e726dae19fdb34ebfe157422a3f02a64b67f29e5b1067ff05386466ff3` | win/loss timer resolver |
| `0x0048ddb0-0x0048deca` | 36 / 105 | `276da99513996baa45d73bd4c09da0fe231fb10e65b762b4bbf3bfb144908981` | pre-gate→timer→stage dispatcher |
| `0x0048a5c0-0x0048a878` | 32 / 181 | `c2a0e73fb0e208846f77187fa11310cdd4177f62c6fbd61732d822f513115791` | K01 loss latch·beacon direct return·영웅 검사 |
| `0x004885e0-0x0048866f` | 7 / 53 | `09d7b2ff5ca83aef9a91e08043581e56378ee4374634b1e8a8bdaf5d0f62a175` | owner별 class full-reference 첫 선택 |
| `0x00441de0-0x00441e36` | 8 / 30 | `089aff03f0dfdb520bdbf644b5070da4937027184f506790454cd129c6092528` | slot·signed health·full-reference alive 검사 |
| `0x00441db0-0x00441dd8` | 3 / 12 | `12984df20c7bb82eb364b29180f75185fe17ac268bffb3d3c782a7fa6c5adf8e` | slot-table nonzero·positive signed WORD 검사 |

| 주소 | 폭 | 이 범위의 사용 |
| ---: | ---: | --- |
| `0x007c5f80` | DWORD | raw global tick |
| `0x00552780` | DWORD | 마지막 처리 raw global tick cache |
| `0x00882e04` | DWORD | result clock; latch와 timer 거리 계산 입력 |
| `0x0084373c` | DWORD | win timer, zero는 disabled sentinel |
| `0x00843740` | DWORD | loss timer, zero는 disabled sentinel |
| `0x0055299c` | DWORD | matured timer result일 때만 1을 쓰는 raw flag |
| `0x007c6614` | WORD | final AX 1 경로에서 1 |
| `0x004bdfc8` | WORD | final AX 1은 `0x18`, AX `0xffff`는 `0x1a` |

`0x007c5f80`과 `0x00882e04`는 서로 다른 전역·입력이다. 이 문서는 두 값을 같은 clock이나
같은 단위로 합치지 않는다.

## K01 loss timer latch 순서

### `FUN_00488080` raw general-presence

`0x00488080`은 signed `WORD [0x00843738]` active count가 양수일 때 index 0부터 signed
`JL`로 순회한다. 각 `WORD [0x00842dd8 + index*2]`를 sign-extend한 뒤 다음을 순서대로
요구한다.

합성 API의 각 active-list entry는 이 signed slot index와, 그 index로 선택된 slot-table/
record raw 값을 명시적으로 함께 제공한다. 이 값들을 프로젝트 entity 모델에서 추론하지 않는다.

1. `0x00441db0`: slot-table WORD가 nonzero
2. 같은 helper: record signed health WORD `+0x3e > 0`
3. record DWORD `+0x74 & 0x00020002`가 nonzero
4. record signed BYTE `+0x38`을 WORD로 sign-extend한 값이 current-player
   `WORD 0x00bccc44`와 같음

첫 일치에서 1, 끝까지 없으면 0이다. mask와 owner equality의 사람용 의미는 일반화하지 않고
raw presence predicate로만 기록한다.

### first-write-wins와 zero-clock 예외

`FUN_0048a5c0`의 결과 관련 순서는 다음과 같다.

1. `0x0048a707`에서 `FUN_00488080`을 호출한다.
2. 반환 0이고 loss timer가 0이면 `0x0048a718-0x0048a71e`가 result clock을 loss timer에
   기록한다.
3. 기존 봉화대 blocker/scan/native block과 post-state gate를 처리한다.
4. 봉화대 flag가 정확히 1이고 script context `+8`이 0이면 AX 1로 즉시 반환한다.
5. 그렇지 않을 때만 class 76 reference lookup→alive check를 한다. 실패하고 loss timer가
   여전히 0이면 result clock을 기록한다.
6. 이어 class 78을 독립적으로 같은 방식으로 검사하고 조건부 기록한다.
7. direct victory가 아니면 AX 0으로 반환한다.

따라서 nonzero result clock을 처음 기록하면 뒤 실패는 timer를 덮지 않는다. 그러나 result
clock 자체가 0이면 write 뒤에도 zero sentinel이 남는다. 같은 invocation에서 general,
class 76, class 78 failure가 각각 0을 다시 쓰는 세 write가 가능하다.

general failure가 먼저 timer를 latch해도 그 invocation의 봉화대 post-state가 direct AX 1을
반환할 수 있다. 이 direct return은 class 76·78 검사를 모두 건너뛴다.

### 보호 영웅 reference 검사

`0x004885e0`은 signed owner WORD로 선택한 목록의 signed count를 index 오름차순으로 훑는다.
합성 API는 이 selector와 그 owner에 대해 이미 선택된 raw 목록을 별도 입력으로 유지한다. 각 full
DWORD reference의 low WORD slot이 `0x00441db0`을 통과하고 record class BYTE가 인수 `76`
또는 `78`과 같은 첫 reference를 반환한다. 없으면 raw fallback DWORD `0x00949710`을 반환한다.

그 reference는 `0x00441de0`에서 다음 순서로 검사된다.

1. low-WORD slot table nonzero
2. record signed health `+0x3e > 0`
3. record `+0x1b6/+0x1b8` full DWORD와 입력 reference 정확히 일치

## K01 win timer 부재와 beacon direct victory

canonical `references.json`에서 `FUN_0048a5c0`의 `0x0084373c` direct reference는 0개다.
반대로 loss timer에는 세 read/write pair가 있다. 따라서 이 K01 updater의 정상 완료는 win
timer producer가 아니라 봉화대 exact flag/post-state의 direct AX 1 경로다.

이는 whole-binary에서 win timer writer가 없다는 주장이 아니다. 다른 mission updater의
`0x0084373c` writer는 존재하며 이 문서의 K01 함수 범위 밖이다.

## `FUN_0048d6f0` timer resolver

resolver는 win timer를 먼저, loss timer를 나중에 검사한다. 각 timer에 대해:

1. timer가 0이면 disabled로 건너뛴다.
2. `delta = (resultClock - timer) mod 2^32`
3. `CDQ; XOR EAX,EDX; SUB EAX,EDX`로 absolute-value bit pattern을 만든다.
4. 그 결과를 `0x7d0`과 signed `CMP/JLE`한다.
5. signed 결과가 **엄격히** `0x7d0`보다 클 때만 win은 1, loss는 `-1`을 반환한다.

경계는 2000에서 미성숙, 2001에서 성숙이다. `current < timer`도 먼저 DWORD wrap한 뒤
absolute idiom을 적용한다. `delta=0x80000000`은 같은 bit pattern으로 남아 signed
`-2147483648`이므로 `JLE`를 타고 성숙하지 않는다.

두 timer가 모두 설정됐을 때 win이 이미 성숙하면 즉시 1을 반환해 loss를 읽지 않는다. win이
미성숙하고 loss가 성숙하면 `-1`이다.

## dispatcher와 timer 우선순위

`FUN_0048ddb0`은 다음 순서다.

1. `WORD 0x00c06e34 == 1`: AX 0 즉시 반환
2. `WORD 0x007c627c == 1`: AX 1 즉시 반환
3. `WORD 0x007c627e == 1`: AX `0xffff` 즉시 반환
4. `0x0048d6f0` 호출
5. timer 결과가 nonzero이면 `0x004492f0`을 호출해 `DWORD 0x0055299c=1`, timer AX 반환
6. timer 결과가 0일 때만 signed stage selector `WORD 0x0088afcc` jump-table dispatch

canonical 27-case table에서 selector 1은 `0x0048de12`로 가 `FUN_0048a5c0`을 호출한다.
이미 성숙한 loss timer가 있으면 5단계에서 `0xffff`를 반환하므로 K01 updater와 봉화대 검사는
호출되지 않는다. K01 updater의 direct AX 1은 timer result가 아니므로 `0x004492f0`을
호출하지 않는다.

## distinct raw global tick final commit

`FUN_004481d0`은 raw global tick `0x007c5f80`과 cache `0x00552780`을 비교한다.

- 같으면 dispatcher를 호출하지 않고 0을 반환한다.
- 다르면 cache에 새 tick을 **먼저** 쓴 뒤 `FUN_0048ddb0`을 호출한다.
- 반환 AX 1이면 `WORD 0x007c6614=1`, `WORD 0x004bdfc8=0x18`,
  `FUN_00446420` 호출, EAX 1 반환이다.
- 반환 AX `0xffff`이면 `WORD 0x004bdfc8=0x1a`, `FUN_00446420` 호출,
  EAX 1 반환이다.
- 다른 AX이면 0을 반환한다.

`FUN_00446420`의 내부 사람용 상태 변화는 이 질문에서 복원하지 않았다. 여기서 확정한 것은 두
결과 code write 뒤에 이 함수가 직접 호출되는 순서뿐이다. cache가 선행 갱신되므로 같은 raw
global tick 값에서는 final result path를 다시 호출하지 않는다.

## 재현 벡터

- general presence: signed active count `-1/0/1`, slot-table `0/1`, signed health
  `-1/0/1`, mask `0`과 독립 비트 `0x00000002`/`0x00020000`, signed owner 같음/다름
- full reference: owner/class 목록 첫 일치, fallback, slot 0, health `-1/0/1`,
  full-generation mismatch
- latch: general→beacon→76→78 순서, nonzero first-write-wins, result clock 0의 세 write
- beacon: general loss latch 뒤 direct AX 1, 영웅 check bypass
- timer: zero disabled, win/loss 각각 exact 2000/2001, current-before-timer, DWORD wrap,
  `delta=0x80000000`, simultaneous mature win/loss, immature win+mature loss
- dispatcher: 세 pre-gate와 결합 시 첫 gate→victory→defeat 우선순위, timer result의
  `0x0055299c` write, timer-before-K01, stage 1 jump-table
- final wrapper: same tick skip, distinct tick cache 선행 write, AX `1/0xffff/other`
- 실패: unsigned/signed 폭 위반, K01 외 stage 입력, stale source, seed/call edge/reference/
  jump-table/EXE 변조

## 현재 프로젝트와 integration boundary

현재 production은 source result state를 `K01_SOURCE_RUNTIME_PROFILE_ID`의 v5 envelope 안
`policies.result` sibling으로 보존한다. accepted world tick의 첫 단계에서 result policy를
실행하고, mature result는 generic construction/movement 전에 scenario status를 commit한다.
K01의 general presence와 class 76/78 hero checks는 generated source flags, ordered active-list
identity와 semantic liveness를 결합한 bounded product projection이다. 이는 raw owner-list,
full scheduler, death/release 또는 original result presentation parity를 주장하지 않는다.

`LocalSessionTransport`는 frame마다 real elapsed milliseconds를 한 번 sample해 result clock에
누적하고 playback speed와 pause commit을 분리한다. App pause 동안 clock은 누적되지만 accepted
tick이 없어 result commit은 지연된다. Headless `advanceWorldTick`의 24 Hz sample은 deterministic
test adapter이며 native cadence가 아니다. v4 legacy save는 한 번 정규화한다. epoch-1 clock을
legacy world tick과 failed K01 protect objective에서 backdate하고, post-state가 없는 running
K0120 trigger는 pending loaded/running dialogue state로 복원한다.

## 남은 불확실성과 다음 질문

- 표준 main state 1의 mission-entry reset은
  [K01 표준 미션 진입 timer reset](k01-mission-timer-reset.md)에서 정적 확정·재현했다.
  다른 진입·reset topology의 전수 범위는 별도다.
- raw global tick `0x007c5f80`의 scheduler cadence와 source result clock과의 presentation relationship
- `FUN_00480180/0x00480300` 내부와 final destination별 후속 lifecycle
- bounded adapter 범위를 넘는 full source scheduler/death/release와 result presentation parity

`FUN_00446420` 이후 presentation과 final route는
[K01 결과 presentation과 post-result 전환](k01-final-result-transition.md)에서 별도
정적 확정·재현했다. K01 native 증원 class와 프로젝트 identity/map 요청 좌표의 현재 범위는
[native 증원 정체·요청 좌표 매핑](k01-reinforcement-identity-map.md)에서 후속 확정했다.
사용자가 제공한 “완성 봉화가 하나라도 있으면 미니맵 enable, 마지막 봉화 제거
시 disable” 수명주기는 이 결과 경로의 증거가 아니며, 별도 정적 분석 전까지
`user-reported/unverified` 후속 질문으로만 유지한다.
