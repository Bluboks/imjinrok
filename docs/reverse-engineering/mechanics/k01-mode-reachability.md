# K01 scheduler mode 도달성: EBX·guard와 main-state 경계

질문: **표준 K01 single-player stage 1이 `FUN_00484130`이 조립한 `EBX`를 통해
`FUN_00485890`의 scheduler mode `WORD 0x00c06e20`에 구체적으로 `0` 또는 `1`을 쓰는가? 또
그 writer가 읽는 `WORD 0x004bdfF4` guard는 그 수명주기에서 어떤 값인가?**

- 분석 상태: `정적 확정` — 아래에 한정한 `EBX`/guard의 폭·분기·직접 writer와 K01 state-1
  continuation까지. K01이 mode 값을 생산한다는 주장은 포함하지 않는다.
- 재현 상태: `재현 완료` — EXE, generated artifact, 함수 범위·instruction hash, main/stage jump
  table, call/reference set, byte anchor와 raw WORD/DWORD vector를 독립 검증한다.
- 구현 상태: 없음 — 이 분석은 cadence, runtime clock, selector 또는 제품 코드를 바꾸지 않는다.

## 입력 고정과 검증기

| 입력 | bytes / SHA-256 | 용도 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | 843,833 / `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | 원본 x86, 전역 주소, import/vtable 인접 코드 |
| `analysis/generated/imjinrok2/functions.json` | 1,467,804 / `c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3` | 함수 body range·instruction hash |
| `analysis/generated/imjinrok2/references.json` | 17,206,553 / `df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c` | direct call·guard direct write reference |
| `analysis/generated/imjinrok2/jump-tables.json` | 607,724 / `0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f` | main-state와 signed stage switch |
| `analysis/generated/imjinrok2/seeds.json` | 8,019,560 / `eb559198f7c9082ff9402d185a679f73b4f723208a977796f0ca9340490c2b1e` | EXE source hash가 포함된 canonical generated provenance |

`tools/imjinrok/extract-k01-mode-reachability.mjs`는 JSON parse 전에 위 artifact의 exact
length/SHA-256 및 embedded `sourceSha256`을 검사한다. 이어 함수 instruction count/hash, main
state/stage jump-table 목적지, 5개 direct call edge, guard direct-write reference 5개, 15개 raw-byte
anchor를 검사한다. 다른 hash의 분석 결과를 이 근거에 섞을 수 없다.

```bash
node --test tools/imjinrok/k01-mode-reachability.test.mjs
node tools/imjinrok/extract-k01-mode-reachability.mjs
```

## 확인한 함수와 주소

| 함수 | body range | instructions / SHA-256 | 이 질문의 범위 |
| --- | --- | --- | --- |
| `FUN_0045f190` | `0x0045f190-0x0045f243` | 42 / `a69bbff3a7935d129f2786c5e0d56db59441fe460b7951b40e2b8ca637456b8b` | main-loop 초기화 호출 경계 |
| `FUN_0045f9c0` | `0x0045f9c0-0x004607ac` | 801 / `b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24` | guard 초기 store, state 1/3/5 dispatch |
| `FUN_00474770` | `0x00474770-0x00474856` | 58 / `fd1d176b03376f5c5dac2db2cec22ead092d5d17aa788ffad4e5e0b0206cc699` | reached success path의 guard 0 store |
| `FUN_004748f0` | `0x004748f0-0x00474934` | 16 / `7acacb5b16d0a2eca9305635f69c0063ad1cdc7acb03fc9cf0c5bda4eb2d4c06` | reached success path의 guard 0 store |
| `FUN_00484130` | `0x00484130-0x004851da` | 1,131 / `d44b4995e2906aa527ee362b7f6aee774bef7cd3fdf966aabc09a5fefdd13b73` | state-5 EBX assembly·mode writer caller |
| `FUN_00485890` | `0x00485890-0x0048594b` | 44 / `fb53dab9a92b41ace1d6e8c44d158a836f1e3bffdee6301f38361a08a1dbcde1` | guard/argument WORD mode writer |
| `FUN_00486430` | `0x00486430-0x00486608` | 138 / `8806df0ba708941c3e177a88ca85e189b4c827dc1aee59876da948c50e8a0845` | reached branch의 guard 0/1 store |
| `FUN_0048dbe0` | `0x0048dbe0-0x0048dda9` | 147 / `f38e4577cf36c44f26097d94e200321d2a9bc6b0aa1696d572e40a600e7f7217` | standard mission entry |
| `FUN_0048d410` | `0x0048d410-0x0048d594` | 110 / `55e9e403f208ea2de9f779cb5176d11db85b33758a30d2310d14504dabd0c13d` | signed stage switch; K01 case 1 |

필수 direct edge는 다음과 같다. main-state와 stage switch는 generated jump-table에서도 같은 목적지로
검증한다.

```text
main state 5  0x0046005c -> FUN_00484130 ->(0x004851a5) FUN_00485890
main state 1  0x004600d0 -> FUN_0048dbe0 ->(0x0048dc6d) FUN_0048d410
stage WORD 1  0x0048d42b -> FUN_0048d740
main state 3  0x0045fd5d -> FUN_00447bc0 scheduler
```

## `EBX` argument의 concrete control flow

`FUN_00484130`은 `0x0048414b`에서 saved `EBX` 뒤 working `EBX`를 DWORD zero로 초기화한다. 이
함수의 여러 UI/runtime branch는 short-circuit 순서대로 이 register를 합친다.

1. `0x00484683`의 첫 result branch는 exact-one이면 `EBX=0`, 아니면 raw DWORD stack fallback을
   넣는다.
2. 이어 `0x00484694`의 result가 exact-one이면 `EBX=1`로 덮고, 그 다음 result가 exact-one이면
   다시 `EBX=2`로 덮는다. 후자의 `2`가 앞선 `1`보다 우선한다.
3. 공통 tail `0x00484f2a`은 별도 result가 exact-one이면 `EBX=2`, 아니면 두 번째 raw DWORD
   stack fallback을 넣는다. 도달한 timeout branch `0x004850b0`은 `EBX=1`, 이후 alternate
   branch `0x0048517f`는 `EBX=2`를 선택한다.
4. `0x00485197`은 **low WORD** `BX==0xffff`일 때만 `FUN_00485890` call을 생략한다. 그 외에는
   full DWORD `EBX`를 push하지만 callee는 `[ESP+4]`의 low WORD만 읽는다.

따라서 이 unit이 확정하는 argument contract는 raw unsigned `WORD BX`다. `EBX` high 16 bit는
writer selection에 쓰이지 않는다. 두 stack fallback 값과 각 UI/runtime predicate의 사람용 의미는
이 분석 범위에서 이름을 붙이지 않았으며, selector option object `+0x10` producer도 추적하지 않았다.

### `FUN_00485890`의 mode write

`0x004858ff`는 먼저 `WORD [0x004bdfF4]`를 zero와 비교한다. 그 뒤 argument `WORD [ESP+4]`를
1과 비교한다. 정확한 결과는 다음과 같다.

| guard WORD | argument WORD | 결과 |
| --- | --- | --- |
| `0` | `1` | `WORD [0x00c06e20] = 1` |
| nonzero (예: `0xffff`) | `1` | `WORD [0x00c06e20] = 0` |
| any | `2` | 별도 `0x00474ae0` tail로 가고 mode store 없음 |
| any | `0`, `3..0xfffe` | mode store 없음 |
| any | `0xffff` | caller가 callee 호출 자체를 생략 |

guard는 equality-one이 아니라 zero/nonzero test다. 이전 mode 값은 mode-store가 없는 branch에서
그대로 남는다.

## guard producer와 persistence 경계

`WORD 0x004bdfF4`의 이 질문에 관련된 recovered direct `WRITE` reference set은 정확히 다음 5개다.

| store site | caller function | reached 값/조건 |
| --- | --- | --- |
| `0x0045fbfc` | `FUN_0045f9c0` | main-loop startup이 `EBP=0`을 WORD로 저장 |
| `0x00474845` | `FUN_00474770` | recovered success path에서 `ESI=0` 저장 |
| `0x00474929` | `FUN_004748f0` | recovered success path에서 `AX=0` 저장 |
| `0x00486585` | `FUN_00486430` | reached branch에서 `BP=0` 저장 |
| `0x004865ca` | `FUN_00486430` | sibling reached branch에서 WORD `1` 저장 |

`FUN_0048dbe0` 및 `FUN_0048d410`의 recovered K01 stage-1 scope에는 guard direct store가 없다.
그러므로 stage-1은 startup zero를 즉시 덮지 않는다. 하지만 이것은 **alias-free writer 부재** 주장이
아니다. 이 reference set은 immediate-address direct write만 고정한다. pointer alias, indirect call,
다른 state-machine transition이 guard를 바꾸지 않는다는 전역 부정 명제는 이 unit에서 증명하지 않았다.

## 표준 K01 lifecycle과 negative contract

main loop의 dispatch continuation은 `0x0045fcdf`/`0x0045fcfd`에서 `DI=3`을 설정한다. 이후 raw
main state `1`은 `0x004600cb`에서 mission-entry wrapper, `FUN_0048dbe0`, post wrapper를 호출한 뒤
`0x004600da`에서 `DI`를 state WORD에 저장한다. K01 stage WORD `1`은 signed switch의 유일한
`0x0048d429` case로 `FUN_0048d740` map copier를 호출하고, 이 recovered invocation은 raw main state
`3`으로 계속된다. State 3은 scheduler `FUN_00447bc0`을 direct-call한다.

반면 `FUN_00484130`은 main-state table의 raw state `5` (`0x0046005c`)에서만 direct-call된다. 따라서
이 slice에서 닫힌 경로는 다음이다.

```text
K01 stage 1 -> main state 1 entry -> next main state 3 -> scheduler
state 5      -> EBX assembly -> mode writer (conditional 0/1/no write)
```

두 줄 사이에 stage-1-established state 3에서 state 5로 가는 source-bound edge는 없다. 그러므로
표준 K01 single-player가 이 mechanism으로 scheduler mode `0` 또는 `1`을 쓴다고 말할 수 없다.
이는 mode가 1이면 base 50 ms라는 별도 조건부 사실을 K01 cadence에 적용하지 않는 partial/negative
contract다.

**첫 미해결 edge:** stage-1 이후 raw main state `3`에서 raw main state `5`로 가는 concrete
transition writer(간접 state-machine write 포함), 그리고 그 invocation 직전 guard `0x004bdfF4`의
persistence/value. 이 edge를 닫기 전에는 K01이 state-5 `EBX` branch를 도달하거나 mode writer를
호출한다는 주장도 할 수 없다.

## 재현 vector

focused test는 다음 raw input/output을 재생한다.

| vector | 결과 |
| --- | --- |
| guard `0`, argument DWORD `1` | invoke, low WORD `1`, mode `1` write |
| guard `0xffff`, argument DWORD `1` | invoke, low WORD `1`, mode `0` write |
| argument DWORD `2` | invoke하되 mode write 없음 |
| argument DWORD `0xffffffff` | low WORD `0xffff`; call 자체 없음 |
| argument DWORD `0x12340001` | high bits와 무관하게 low WORD `1`; guard 0이면 mode `1` |
| main state `1`, stage `1` | K01 case, next state `3`, scheduler reached, mode routine 미도달 |
| main state `5`, stage `0xffff` | K01 stage input을 읽지 않으며 mode routine state만 reached |

또한 invalid WORD/DWORD input과 functions/references/jump-tables/seeds artifact 각각의 independently
tampered 또는 stale provenance를 실패시킨다. 이 vector는 unreachable K01 stage input을 해석하지
않고 state branch가 실제로 도달했을 때만 그 값을 검사한다.

## 현재 구현과 다음 작업

현재 구현과 비교하거나 runtime cadence를 변경하지 않았다. 다음 정적 질문은 stage-3 이후의 main-state
transition과 guard persistence를 source-bound하여, state 5 도달이 실제로 K01 lifecycle에 속하는지
판정하는 것이다. 그 전에는 mode `0/1`, selector table, fixed Hz 또는 project 24 Hz adapter를 K01의
확정값으로 사용할 수 없다.
