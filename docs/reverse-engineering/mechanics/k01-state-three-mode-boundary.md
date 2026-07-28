# K01 active state-3 mode 경계

질문: **K01 stage 1이 raw main state `3`으로 계속된 뒤, active scheduler
`FUN_00447bc0`의 transitive canonical call closure는 main-state `WORD 0x004bdfc8`에 어떤
직접 값을 쓰며, 이 active closure가 state `5` writer 또는 scheduler mode guard/writer에 직접
도달하는가?**

- 분석 상태: `정적 확정` — 이 문서가 고정한 active state-3 direct-call closure, direct
  reference/write set, 그리고 아래 raw branch 순서에 한정한다.
- 재현 상태: `재현 완료` — EXE/artifact provenance, 함수 body hash, main-state table, call
  edge, closure/write-set digest, zero reference와 byte anchor를 독립 extractor/test로 확인한다.
- 구현 상태: 없음 — project state, scheduler mode, clock, 24 Hz adapter를 변경하지 않는다.

결론은 bounded negative contract다. **active state-3 transitive direct-call closure에는 state-5
direct writer/guard/mode routine edge가 없다.** 이는 K01 session 전체가 state `5`에 도달하지
않는다는 주장이 아니다. indirect call, pointer alias, scheduler return 뒤의 state write와 result
state `24/26`의 후속 consumer는 이 범위 밖이다.

## 고정 입력과 검증기

| 입력 | bytes / SHA-256 | 용도 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | 843,833 / `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | 원본 x86 bytes와 VA→raw offset |
| `analysis/generated/imjinrok2/functions.json` | 1,467,804 / `c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3` | function range·instruction hash·closure entry universe |
| `analysis/generated/imjinrok2/references.json` | 17,206,553 / `df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c` | canonical call/reference relation과 direct write set |
| `analysis/generated/imjinrok2/jump-tables.json` | 607,724 / `0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f` | main-state switch의 raw state `3` destination |

`tools/imjinrok/extract-k01-state-three-mode-boundary.mjs`는 JSON parse 전에 EXE와 세
generated artifact의 exact length/SHA-256, embedded source hash를 검사한다. 이후 relevant
function instruction count/hash, main-state `0x0045fd56`의 label `2`→`0x0045fd5d`, 7개 required
call edge, closure 1,070 entries와 normalized digest, `0x004bdfc8` exact write set/digest, 세
zero direct-reference target, 네 byte anchor를 함께 확인한다.

```bash
node --test tools/imjinrok/k01-state-three-mode-boundary.test.mjs
node tools/imjinrok/extract-k01-state-three-mode-boundary.mjs
```

## 코드 범위와 closure

| function | instructions / SHA-256 | 이 질문의 역할 |
| --- | --- | --- |
| `FUN_0045f9c0` | 801 / `b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24` | main-state switch와 raw state `3` callsite |
| `FUN_00447bc0` | 75 / `c5166177633b255028ae02aa6f7a60350f7e93f09ce5fcf101ac92ba066eefde` | active state-3 scheduler와 special state `22` branch |
| `FUN_004464c0` | 988 / `07f105738a43b7411865e1d6d08791c2768e2a89fb28e289b0eb349fb7354904` | ordinary scheduler pre-path; result helper caller |
| `FUN_004481d0` | 21 / `3c4ad59801dd66dcb03339fb810c187160b58ccdc18848f6e80ee39bd77b4d91` | changed progress/result state `24/26` writer |
| `FUN_0048ddb0` | 105 / `276da99513996baa45d73bd4c09da0fe231fb10e65b762b4bbf3bfb144908981` | changed-progress result producer |
| `FUN_00446420` | 33 / `439694b6de69137d87c47d6687e97d8a74f2ad073c808b443606a0b42906910a` | result `1/-1` reached-side call |

필수 edge는 다음과 같다.

```text
main state 3  0x0045fd5d -> FUN_00447bc0
ordinary path  0x00447c18 -> FUN_004464c0 ->(0x004464f5) FUN_004481d0
changed result 0x004481e4 -> FUN_0048ddb0
result 1/-1   0x004481fe / 0x00448218 -> FUN_00446420
```

`FUN_00447bc0`을 root로 canonical `references.json` call relation을 함수 entry에 대해
transitively 닫으면 정확히 1,070 entries다. sorted entry array의 SHA-256은
`90f252b91ca3b4acc0e80ba9c8937721249bd28225dd894f552791af68885657`이다. 이 값은 closure가
확장·축소되거나 source artifact가 바뀌면 extractor를 실패시킨다.

## 상태 write와 branch 순서

closure 안에서 target `WORD 0x004bdfc8`인 canonical direct `WRITE`는 정확히 세 개다. sorted
normalized set SHA-256은 `cc3cd3124c0188f28d84d660fc4a21022f76476273ed8e705b5e79739b6807cc`이다.

| site | caller | reached condition | direct write |
| --- | --- | --- | --- |
| `0x00447c08` | `FUN_00447bc0` | `WORD 0x00c06e30 == 1` 및 current state `== 3` | `22` |
| `0x004481f5` | `FUN_004481d0` | progress changed, `FUN_0048ddb0` result WORD `== 1` | `24` |
| `0x0044820f` | `FUN_004481d0` | progress changed, result WORD `== 0xffff` | `26` |

raw byte anchor는 state-3 call `0x0045fd5d`, special writer range
`0x00447be0..0x00447c0f`, `0x004464f5` result-helper call, result writer range
`0x004481d0..0x00448216`을 exact match한다.

reached-only evaluator는 source branch order만 재현한다.

1. special `0x00c06e30/current-state` branch를 먼저 검사한다. reached면 later progress와 result를
   읽지 않고 state `22`를 쓴다.
2. 그렇지 않으면 progress DWORD equality를 검사한다. 같으면 result를 읽지 않고 현재 state를
   유지한다.
3. changed progress에서만 result WORD를 읽는다. `1`은 `24`, `0xffff`는 `26`, 그 외는 state
   write 없이 current state를 유지한다.

이 evaluator는 result의 인간 친화적 의미, result-state 후속 state, 또는 closure 밖 branch를
추정하지 않는다.

## mode/guard negative boundary

같은 closure에서 다음 direct-reference subset은 모두 정확히 0개다.

| target | count | 이 문서가 말하는 범위 |
| --- | ---: | --- |
| `WORD 0x004bdfF4` | 0 | guard direct reference 없음 |
| `FUN_00484130` | 0 | state-5 EBX/mode routine direct edge 없음 |
| `FUN_00485890` | 0 | mode writer direct edge 없음 |

따라서 active state-3 closure가 mode `0/1` writer를 실행한다거나 state `5`를 직접 쓴다고 말할
근거는 없다. 반대로 direct-reference count `0`은 alias-free absence proof가 아니며, indirect call,
pointer-mediated access, caller가 scheduler 반환 뒤 수행하는 write, 그리고 state `22/24/26` 뒤의
새 dispatch는 검사하지 않았다.

## 재현 vector와 다음 경계

focused test는 special short-circuit, equal-progress result non-read, changed result `1/0xffff/other`,
WORD/DWORD malformed input과 functions/references/jump-tables의 independent same-size tamper/stale
artifact를 검사한다. 특히 `3/22/24/26` vector는 state `3` active invocation 안에서만 의미를
고정한다.

다음 좁은 질문은 scheduler가 return한 뒤 또는 state `22/24/26` consumer가 다음 raw main state를
어떻게 쓰는지, 그 경로가 state `5`/guard/mode routine에 도달하는지를 source-bound하는 것이다.
그 전에는 K01 전체 session의 state-5 도달 여부나 mode persistence를 결론내리지 않는다.
