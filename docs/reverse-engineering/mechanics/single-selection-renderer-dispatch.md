# 단일 선택 renderer dispatch

`FUN_0045ad90`의 exact-one 선택 분기가 어느 함수를 부르고, 그 함수가 lock 결과와 owner
flag에 따라 어떤 **호출 순서**를 보장하는가? 이 문서는 subrenderer의 표시 내용이나 사람용
의미를 추정하지 않고, `FUN_00421390`의 단일 범위만 닫는다.

## 판정

- 분석 상태: **정적 확정**. sole structured callsite, 두 whole-function 경계, raw code range,
  exact byte anchor와 complete reference projection을 원본 EXE에 결합했다.
- 재현 상태: **범위 한정 재현 완료**. lock failure/success, `owner+0x74`의 `0x200`/`0x400`
  optional-call gate와 reached-only 입력 검증을 결정론 vector로 재현한다.
- 구현 상태: **분석 전용, product UI 변경 없음**. 이 근거는 현재 selection panel의 내용·
  action label·responsive 정책을 원본 동작으로 승격하지 않는다.

## 원본과 provenance

| 입력 | SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `analysis/generated/imjinrok2/functions.json` | `c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3` |
| `analysis/generated/imjinrok2/references.json` | `df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c` |

전용 추출기
[`extract-single-selection-renderer-dispatch.mjs`](../../../tools/imjinrok/extract-single-selection-renderer-dispatch.mjs)는
PE VA를 독립 변환해 EXE와 generated JSON의 해시를 먼저 검증한다. 이어 두 function metadata,
raw code range, 일곱 byte anchor, selected renderer의 complete outgoing reference 14개와
incoming exact-one projection을 검증한다. stale JSON, 변조 EXE, caller 누락·추가와 outgoing
reference 변조는 거부한다.

| 함수 | generated body 범위 | 명령어 | instruction SHA-256 | raw range SHA-256 |
| --- | --- | ---: | --- | --- |
| `FUN_0045ad90` | `0x0045ad90-0x0045b39e` | 458 | `7a994e241299d22b0ea3dd79f23805885fe369986236e0d59d4bbf3e5c96c430` | `3f7d38194db1f906737522ec6aa63509c3b3768ac2c4dcb3938df9695f671684` |
| `FUN_00421390` | `0x00421390-0x004213fb` | 35 | `42b9f50cb822fdf2dc6943f38f719cd4d651840e289b22dc76424c236188f7d1` | `9a18481846deba1286c0363a516a4dabd6895d836f43d606e324fd60793f1a30` |

`FUN_00421390`의 incoming structured direct call은 정확히 하나다
(digest `3656d454a2340955df296b779cdea6f523d984e50c0aaadfd15c98bb036c80b0`):

| callsite | caller | callee | type |
| --- | --- | --- | --- |
| `0x0045adcd` | `FUN_0045ad90` | `FUN_00421390` | `UNCONDITIONAL_CALL` |

`FUN_0045adbf`에서 caller가 유도해 push한 DWORD를 여기서는 **selected argument**로만 부른다.
callee는 이를 lock, 성공 시 unlock, 마지막 helper에 같은 값으로 전달한다. ECX의 owner와
`DAT_00559418`의 구체 구조·표시 의미는 이 범위 밖이다.

## 정적으로 닫힌 순서

모든 경로는 먼저 `DAT_00559418` receiver와 selected argument로 `FUN_0044abb0`을 호출한다.
EAX 반환이 **정확히 1**일 때만 success block에 진입한다. `0`뿐 아니라 `2` 같은 non-one 값도
success block이 아니다.

성공 block의 순서는 다음과 같이 고정된다.

1. ECX owner로 `FUN_00420c20`을 호출한다.
2. `WORD[0x0088bd94]`를 `owner+0x2a`에 복사한다.
3. ECX owner로 `FUN_00421810`, `FUN_004218b0`, `FUN_00421a40`, `FUN_00421960`을 이 순서로
   호출한다.
4. `DWORD[owner+0x74]`의 `0x600` mask가 nonzero이면 ECX owner로 `FUN_00421b20`을 호출한다.
   원본은 `test ah, 0x6`을 사용하므로 `0x200` 또는 `0x400` 각각이 이 호출을 허용한다.
5. `DAT_00559418` receiver와 같은 selected argument로 `FUN_0044ada0`을 호출한다.

그 후 lock 결과와 무관하게 ECX owner 및 같은 selected argument로 `FUN_00421550`을 호출하고
반환한다. 그러므로 lock failure는 success-only field read·subcall·unlock을 모두 건너뛰지만,
마지막 `FUN_00421550`은 반드시 호출한다. unlock은 success path에만 존재한다.

다음 anchor가 이 순서와 argument 보존을 고정한다.

| VA | 검증한 코드 경계 |
| --- | --- |
| `0x0045adb8` | sole caller의 selected argument 유도·push와 `0x0045adcd` call |
| `0x00421390` | lock setup, `FUN_0044abb0`, exact-one compare |
| `0x004213a8` | `FUN_00420c20` 뒤 `WORD[0x0088bd94] → owner+0x2a` copy |
| `0x004213bb` | 네 opaque subrenderer의 source order |
| `0x004213d8` | `test ah,0x6` optional call gate |
| `0x004213e4` | success-only unlock과 selected argument 재전달 |
| `0x004213ef` | unconditional final `FUN_00421550` |

## 재현 vector와 입력 경계

[`single-selection-renderer-dispatch-vectors.json`](../../../analysis/fixtures/single-selection-renderer-dispatch-vectors.json)은
다음 four full-result vector를 고정한다.

- lock failure는 `FUN_0044abb0 → FUN_00421550`만 남기며 success-only 입력을 읽지 않는다.
- success + flags `0`은 optional `FUN_00421b20` 없이 unlock 뒤 final helper로 간다.
- success + `0x200`과 success + `0x400`은 각각 optional call을 포함한다.

선택 argument, lock result와 owner flag는 unsigned original DWORD(`0..0xffffffff`)로, success
경로의 copied layout 값은 unsigned WORD(`0..65535`)로만 받는다. malformed width 또는
negative/out-of-range 값은 큰 오류로 거부한다. 반대로 lock failure/non-one 결과에서는 later
success-only `layoutWord`·`ownerFlags`를 요구하거나 검사하지 않는다. 이는 원본의 도달 순서를
보존하기 위한 reached-only contract다.

## 미확정 경계

이번 분석은 `FUN_00420c20`, `FUN_00421810`, `FUN_004218b0`, `FUN_00421a40`, `FUN_00421960`,
`FUN_00421b20`, `FUN_00421550`의 **호출·순서·조건**만 확정한다. 다음은 확정하지 않는다.

- 각 subrenderer가 표시하거나 갱신하는 내용과 사람용 이름
- action label/icon, portrait, health, mana 또는 HUD background의 의미·배치
- `DAT_00559418`의 concrete surface/vtable owner와 runtime object type
- 현재 product selection panel과의 visual/semantic parity

따라서 이 추출기는 dispatch ordering의 정적 근거와 bounded reproduction일 뿐, UI product
변경의 근거가 아니다.
