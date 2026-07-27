# K01 결과 presentation과 post-result 전환

For a K01 result already committed as raw state 0x18 or 0x1a, what exact shared teardown order has already run, how do main-loop states 0x18/0x19 and 0x1a/0x1b initialize and poll the two original result presentations across unsigned 32-bit timing and exact completion gates, how does the 0x8c→0x96 target-state relay reach the shared 0x1c/0x1d post-result path, and how does the final consumer route by external-mode, result flag, campaign stage, WORD wrap, and overwrite precedence?

## 범위와 상태

- 분석 상태: `정적 확정` — 이미 commit된 raw result state `0x18/0x1a` 이후 shared teardown,
  presentation 초기화·poll, `0x8c→0x96` relay와 `0x1c/0x1d` 최종 consumer 범위
- 재현 상태: `재현 완료` — exact-one gate, call/write 순서, unsigned DWORD 시간 경계,
  signed WORD phase, key 순서, cleanup, 외부/local route, stage 특수값·wrap·overwrite 벡터
- 구현 상태: `없음` — 원본 raw clock·state/asset과 프로젝트 24 Hz·generic result policy 사이의
  exact mapping이 없으므로 integration gate를 닫았다.

이 문서는 [K01 미션 결과 latch·timer·commit 수명주기](k01-mission-result-lifecycle.md)가
확정한 `0x004481d0`의 commit 이후부터 시작한다. win/loss timer latch/fallback producer,
`0x0048df40/0x0048dfc0`, 봉화대/minimap 일반 수명주기, `FUN_00480180`과 `FUN_00480300`
내부는 범위 밖이다.
표준 mission-entry zero reset은
[K01 표준 미션 진입 timer reset](k01-mission-timer-reset.md)에서 별도 확정했다.

## 원본과 canonical 재현

| 입력 | SHA-256 | 정적 확정 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | CFG·instruction·전역·점프 테이블 |
| `yfnt/winlogo.spr` | `045b64ce026386413098f339681e8ac859e641c2e28d86d6dc2a25e4fa84851e` | 250×100, 28-frame header |
| `yfnt/loselogo.spr` | `94a33a66783eaa9ab4f458542707cc5fa81ea29c0057eabb3a659fdc39d78ad7` | 250×100, 28-frame header |
| `music/win.YAV` | `d50d4146bd5c423b78ea41ac83d6cd737b083586afff48a7761024dfee1bc61d` | exact initializer path |
| `music/lose.YAV` | `deb38aae3e4d034774d79953189cfa51408a61d25232abb72f72affca80833e6` | exact initializer path |

독립 추출기는
[`extract-k01-final-result-transition.mjs`](../../../tools/imjinrok/extract-k01-final-result-transition.mjs),
집중 테스트는
[`k01-final-result-transition.test.mjs`](../../../tools/imjinrok/k01-final-result-transition.test.mjs)다.
EXE·네 자원 hash, SPR header, 9개 함수의 range/hash/CFG, 47개 direct call edge,
10개 byte anchor, import/data reference, 두 main-loop jump table, raw phase table을 함께 검증한다.
stale source, seed/label/function/call/jump-table/asset/EXE 변조는 오류로 중단한다.

presentation seed 7개와 후속 mission-entry timer-reset semantic site 4개를 포함한 현재
canonical 분석을 깨끗한 임시 Ghidra 프로젝트로 두 번 전체 생성했으며 두 실행의 해시가 같았다.

| 산출물 | SHA-256 |
| --- | --- |
| `SHA256SUMS` | `b74f06eca72e5d22695a907bd20b9f4dd459ead0d7224b0f05dbfbed9540bb3d` |
| `manifest.json` | `f5f2d972d9447ecf052ce71359f02874bc081c63c19ff1fa5783f2fd62ed48dd` |
| `seeds.json` | `eb559198f7c9082ff9402d185a679f73b4f723208a977796f0ca9340490c2b1e` |

현재 canonical count는 seed 주소 149개, 포함 함수 148개다.

## 함수와 데이터

| 함수·범위 | CFG / 명령어 | instruction SHA-256 | 이 질문의 raw 역할 |
| --- | ---: | --- | --- |
| `0x00446420-0x004464be` | 9 / 33 | `439694b6de69137d87c47d6687e97d8a74f2ad073c808b443606a0b42906910a` | shared session teardown |
| `0x0045f9c0-0x004607ac` | 209 / 801 | `b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24` | main-loop state switch·relay·final consumer |
| `0x00493290-0x0049329e` | 1 / 5 | `1ea8ffe512653b2969ff443fcd05080b27100d289cbb3556cc90c26cb42c2cba` | selector 1 initializer wrapper |
| `0x004932a0-0x004932b4` | 1 / 9 | `558b261cb05641704769a9486e726df60760519bfd0cb8941c33612622b97159` | selector 1 poll wrapper |
| `0x004932c0-0x004932ce` | 1 / 5 | `4696a43d2ed7740cbc445e1fa67882a2f24c1676855bcfecc101edee070d72d0` | selector 0 initializer wrapper |
| `0x004932d0-0x004932e4` | 1 / 9 | `d19c6d9e3b1783c591a2b4135022ac8c2bac5b182183c4fa91f0d82e23c2dff1` | selector 0 poll wrapper |
| `0x004932f0-0x004933f4` | 8 / 69 | `c75f5051d72e78e8797baabceceb3007a88f2220eae8bbccc9ca9989e3da1ee9` | 공통 presentation 초기화 |
| `0x00493400-0x00493534` | 13 / 99 | `eea3fdcdd7ef8f773323c18a78da31223ac73a3a5c9209d34be98ebe1da58fb9` | 공통 presentation poll |
| `0x00493540-0x00493596` | 7 / 25 | `8fa4d6023b1df5ee617a3efb55c92ee0413c9e0fcecaed84bae38ef983cb648f` | presentation resource cleanup |

| 주소 | 폭 | raw 역할 |
| ---: | ---: | --- |
| `0x004bdfc8` | WORD | current main-loop state |
| `0x00c06da0` | WORD | relay target state |
| `0x007c6614` | WORD | committed result flag |
| `0x0088afcc` | WORD | campaign stage |
| `0x0088afce` | WORD | state `0x18`의 opaque companion input |
| `0x00c79ba8` | WORD | presentation phase |
| `0x00c79ba4` | DWORD | cadence clock |
| `0x00c79ba0` | DWORD | presentation start clock |
| `0x00c7a7a4` | DWORD | cleanup이 검사하는 raw resource handle |
| `0x00c7a7a8` | DWORD | audio object handle |

## result state write 뒤 shared teardown

기존 증거의 `FUN_004481d0`은 AX 1일 때 `WORD 0x007c6614=1`, current state `0x18`,
AX `0xffff`일 때 current state `0x1a`를 쓴 뒤 `FUN_00446420`을 호출한다. state write가
teardown보다 먼저다.

`FUN_00446420`은 결과 전용 finalizer가 아니다. canonical caller는 `0x00405f20`,
`0x004481d0`, `0x0045f250`, `0x0045f9c0`, `0x0046af80`이며 함수 자신은 result state를 쓰지
않는다. 이 질문에서 확정한 raw 순서는 다음과 같다.

1. `DWORD 0x004bdfbc=0x32`
2. `WORD 0x00bccc44=0`
3. `DWORD 0x00634ac0 == 1`이면 `DWORD 0x00c06e74=1`, `FUN_004145b0`
4. `FUN_0046f870(2)`
5. `FUN_004400b0(0x005e20b8)`
6. `FUN_00483c30`
7. `FUN_00411190`
8. `FUN_00401ad0`
9. `WORD 0x00c06e20 == 1`이면 ECX `0x00a9b068`의 `FUN_00474ae0`, 이어 해당 WORD 0
10. ECX `0x00bcbe08`의 `FUN_00482390`; 반환이 정확히 1일 때만 `FUN_004823d0`
11. 같은 ECX의 `FUN_004823a0`; 반환이 정확히 1일 때만 `FUN_00482010`으로 tail jump

opaque callee의 사람용 의미는 붙이지 않는다. `0x00446420`의 역할 표기는 이 raw 범위에 한해
`shared-session-teardown`이다.

## states `0x18/0x19`와 `0x1a/0x1b`

main-loop의 state-minus-one switch `0x0045fd56`은 다음과 같이 연결된다.

| raw state | label | block | 동작 |
| ---: | ---: | ---: | --- |
| `0x18` | 23 | `0x00460164` | `0x00493290`, current `0x19` |
| `0x19` | 24 | `0x004601b9` | `0x004932a0`, 공통 반환 consumer |
| `0x1a` | 25 | `0x004601c3` | `0x004932c0`, current `0x1b` |
| `0x1b` | 26 | `0x004601d6` | `0x004932d0`, 공통 반환 consumer |
| `0x1c` | 27 | `0x004601e0` | shared post-result initializer |
| `0x1d` | 28 | `0x004601f3` | shared final consumer |

`0x18`은 initializer 결과와 무관하게 current state를 `0x19`로 쓴다. stage WORD가 nonzero이면
stage를 signed WORD로 sign-extend해 signed 10 나눗셈을 하고, remainder와 raw companion WORD를
원본 register 폭 그대로 조합한 push 뒤 `0x0043fbe0→0x0043fb30→0x0043f670`을 호출한다.
이 세 call의 사람용 의미는 미확정이다. `0x1a`도 initializer 결과와 무관하게 `0x1b`를 쓴다.

`0x00493290`은 1, `0x004932c0`은 0을 공통 initializer에 전달하고 둘 다 AX 1을 반환한다.
공통 initializer는:

1. phase WORD를 0
2. `timeGetTime`을 한 번 호출
3. 같은 반환 DWORD를 cadence와 start clock 모두에 저장
4. 입력이 정확히 1이면 `yfnt\winlogo.spr`와 `music\win.YAV`
5. 그 외 모든 DWORD이면 `yfnt\loselogo.spr`와 `music\lose.YAV`
6. sprite load 결과 0이면 optional `WINLOSE` log
7. audio object 생성 결과를 저장하고 raw common setup 호출

순서로 처리한다. 두 SPR header는 250×100, 28 frames다.

## 공통 poll의 고정폭 시간과 완료

`0x004932a0/0x004932d0`은 각각 1/0을 `FUN_00493400`에 넘기지만, canonical body에는 stack
argument read가 없다. 따라서 두 presentation은 이 함수의 raw poll 계약에서 variant-invariant다.
wrapper는 callee EAX가 정확히 1이면 WORD `0x1c`, 0·2·`0xffffffff`를 포함한 그 외 값이면
0을 만든다.

`FUN_00493400`의 순서는 다음과 같다.

1. `DWORD 0x00634c90 == 0`이면 즉시 0
2. raw UI helper 반환이 정확히 1일 때만 draw path
3. draw path의 첫 `timeGetTime` sample에서
   `(sample-cadenceClock) mod 2^32 > 50`이고 signed phase `<20`이면 WORD phase 증가
4. 증가했을 때만 `timeGetTime`을 다시 호출해 cadence clock 갱신
5. 현재 phase의 raw table pair를 소비하고 draw call
6. draw 여부와 무관하게 별도 `timeGetTime`을 호출해 completion sample 획득
7. `(completion-startClock) mod 2^32 > 0x7d0`일 때만 completion gate 진입
8. `DWORD 0x00c06e3c !=0`이면 즉시 finish
9. 아니면 `GetAsyncKeyState(0x1b)`, `(0x0d)`, `(0x20)` 순서; 첫 signed AX 음수에서 finish
10. finish이면 `FUN_00493540`, EAX 1; 아니면 EAX 0

두 비교는 unsigned DWORD다. cadence 50은 증가하지 않고 51은 증가한다. completion 2000은
끝나지 않고 2001은 끝난다. subtraction은 DWORD wrap하므로 current가 start보다 작아도 큰
unsigned elapsed가 될 수 있다.

phase는 signed WORD `<20` 비교다. initializer가 0을 생산하는 reachable 범위에서는 20까지만
증가한다. `0x004c88e8`에는 signed-WORD pair 21개 `(0,0)..(0,20)`가 있다. 이 table과
28-frame SPR header는 각각 정적 확정했지만, pair의 두 값이 정확히 어느 SPR frame identity와
대응하는지는 증명하지 않았다. 재현 API는 adjacent table data를 추측하지 않고 reachable
phase `0..20`만 받는다.

## cleanup

`FUN_00493540`은 다음 순서다.

1. `DWORD 0x00c7a7a4 !=0`: `FUN_00443440(0x00c79bb0)`
2. `DWORD 0x00c7a7a8 !=0`: `FUN_00441b50(obj,0)`
3. 위 반환이 정확히 1일 때만 `FUN_004413c0(obj)`
4. audio handle이 nonzero이면 항상 `FUN_00441550(obj)`
5. audio handle이 nonzero이면 마지막에 `DWORD 0x00c7a7a8=0`

zero handle에는 해당 call/write가 없다. stop 반환 2 같은 non-one은 추가 call만 생략하고
release와 zero write는 유지한다.

## poll 반환에서 `0x1c`까지의 relay

main-loop 공통 consumer `0x0045fe3f`는 wrapper AX를 sign-extend한다. 0이면 현재 `0x19/0x1b`를
유지한다. nonzero이면 그 WORD를 target `0x00c06da0`에 쓰고 current state를 `0x8c`로 쓴다.
wrapper 계약상 이 경로의 target은 `0x1c`다.

high-state switch `0x0046042b`의 canonical cases는:

1. state `0x8c` → `0x00460525`: opaque `FUN_004407d0`, current `0x96`
2. state `0x96` → `0x00460538`: opaque `FUN_00440860`
3. 두 번째 반환이 정확히 EAX 1일 때만 target WORD를 current state에 복사
4. 0·2·`0xffffffff` 등 그 외 값은 `0x96` 유지

따라서 완료 경로는 `0x19/0x1b → target 0x1c,current 0x8c → 0x96 → 0x1c`다. 두 opaque
callee를 presentation transition의 사람용 init/poll 의미로 승격하지 않는다.

## shared `0x1c/0x1d`와 final route

state `0x1c`는 `FUN_00480180` 반환을 무시하고 current state를 `0x1d`로 강제한다.

state `0x1d`는 result flag WORD `0x007c6614`를 ECX `0x007c5ed8`의 `FUN_004615a0`에
전달하고 `FUN_00480300`을 호출한다. 반환 AX를 sign-extend한 값이 0이면 `0x1d`에 남는다.
nonzero이면 다음 순서다.

1. `DWORD 0x00c06e38 == 1`이면 current state `0x0a`를 transient write
2. `DWORD 0x004cc548 == 1`이면 external branch:
   - result flag가 정확히 1이면 `FUN_00409790` route 1
   - 그 외 모든 WORD이면 route 2
   - target `0x140`, current `0x8c`; relay가 나중에 `0x140` 도달
3. external이 아니고 stage WORD가 0이면 raw `FUN_00480300` low WORD를 current state에 write
4. stage nonzero, result flag 정확히 1:
   - stage `8`, `0x12`, `0x1b`: current `0x64`, stage 불변
   - 그 외: stage를 WORD increment, current `0x10`; `0xffff→0`
5. stage nonzero, result flag가 1이 아니면 current `0x20`, stage 불변

nonzero poll의 모든 후속 route는 앞의 transient `0x0a`를 덮는다. external branch는 stage
route보다 우선하며 역시 `0x0a`를 덮는다. 따라서 `0x0a`는 이 범위의 final state가 아니다.

## 재현 벡터

- teardown: 네 exact-one 조건 각각의 1/2, shared call/write/tail-jump 순서
- initializer: selector 1, 0, 2, `0xffffffff`; sprite load 0/nonzero; 같은 clock sample 두 write
- state `0x18`: stage 0 skip, signed `0xffff` 나눗셈과 raw companion 조합; `0x1a` 고정 path
- poll: active zero, UI result 1/2, cadence 50/51, phase 19/20, 별도 time sample 순서
- completion: 2000/2001, unsigned wrap, finish flag, key `0x1b/0x0d/0x20` signed AX 순서
- cleanup: zero/nonzero handle, stop return 1/2, additional-call과 unconditional release 순서
- wrapper/relay: EAX 1/0/2/`0xffffffff`, current `0x8c/0x96`
- final: post poll zero/nonzero, transient overwrite, external result 1/non-one, stage 0 raw WORD,
  특수 stage와 인접값, `0xffff→0`, non-one result flag
- 실패: width 위반, 누락 callback sample, reachable phase 밖, stale/tampered canonical 입력

## 프로젝트 integration gate

원본 `timeGetTime` sample·main-loop state를 프로젝트 fixed 24 Hz, generic campaign result,
웹 자원 수명·입력 policy로 옮기는 exact mapping이 없다. 원본 SPR/YAV 존재와 raw state code는
프로젝트 asset/state identity의 자동 mapping이 아니다.

따라서 packages/apps/UI/scenario를 수정하지 않았다. 향후 연결은 generic superset을 좁히지
않는 isolated opt-in original-K01 policy여야 하며, 같은 벡터를 프로젝트 경계에 적용할 수 있을
때만 가능하다.

## 남은 불확실성과 다음 질문

- 표준 main state 1의 `0x0084373c/0x00843740` zero reset은 별도 문서에서 확정했다.
  다른 reset topology와 reset이 아닌 `0x0048df40/0x0048dfc0` fallback producer는 별도 단위다.
- `FUN_00480180`, `FUN_00480300` 내부와 후자의 raw 반환 생산 의미
- `FUN_004407d0`, `FUN_00440860`의 opaque 내부 상태와 사람이 보는 transition 의미
- raw phase pair와 28개 SPR frame의 exact correlation
- final call 이후 `0x140/0x64/0x10/0x20/raw WORD` 각 destination의 독립 lifecycle
- original clock/result/asset identity를 generic 프로젝트에 옮기는 opt-in mapping

다음 좁은 질문은 K01 native 증원 class와 프로젝트 identity/map 좌표의 exact mapping이다.
