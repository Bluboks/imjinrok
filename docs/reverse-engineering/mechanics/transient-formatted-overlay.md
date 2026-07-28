what exactly does full function FUN_004567c0 at 0x004567c0-0x00457445 render for owner 0x00bcdd58 when called at the sole structured callsite 0x00447b23 in FUN_004475a0, what gates and field producers control it, and can its semantic identity be statically confirmed as the original gameplay bottom selection panel rather than inferred from current candidate names?

# Transient formatted overlay

## 판정

- 분석 상태: **정적 확정, producer alias 경계 명시**. `FUN_004567c0` 전체와 sole structured
  caller, 유일한 structured owner writer 및 그 두 callsite를 검증했다.
- 재현 상태: **범위 한정 재현 완료**. producer write·retain 규칙, dirty/HDC gate, 공급한
  synthetic GDI `SIZE`, 동적 surface 크기·배치·clamp, 조건부 숫자·문자열 draw 순서와
  실패/no-op을 원본 입력 벡터로 재현한다.
- 구현 상태: **분석 전용**. 제품 UI는 변경하지 않았다.
- 의미 판정: **고정 bottom selection panel 후보는 반증**됐다. `FUN_004567c0`은 producer
  좌표를 기준으로 측정한 surface를 한 번 blit하고, 이어 `FUN_00457460`을 통해 owner base
  byte string을 cache gate 아래 target `(200,350)`에 그릴 수 있다. 이 결합 동작에도 persistent
  gameplay bottom panel의 resource·rect·owner lifecycle 증거는 없다. 모든 producer
  table·숫자·icon의 gameplay 개념도 닫히지 않으므로 tooltip, unit/building/resource/stat
  같은 이름을 확정하지 않는다.

현재 `selectionPanel.ts`의 responsive layout, multi-selection, mana, health와 추가 상태는
project-owned superset이다. 이 원본 slice가 프로젝트 구조를 고정 640×480 renderer나 owner
record에 맞추게 하지 않으며, Noto/Canvas typography도 의도적 프로젝트 적응으로 유지한다.

## 재현 가능한 provenance

`tools/imjinrok/extract-transient-formatted-overlay.mjs`는 원본 EXE를 직접 읽고 PE VA를 raw
offset으로 변환한다. `functions.json`과 `references.json`은 같은 원본 해시에 묶여야 하며,
whole-function metadata, raw byte range, exact byte anchor, import identity, format string,
canonical structured reference projection 중 하나라도 다르면 실패한다.

- 원본 EXE SHA-256:
  `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- 검증 raw whole-code range 6개:

| 함수 | raw 범위 | raw SHA-256 | 이 문서의 범위 |
| --- | --- | --- | --- |
| `FUN_004475a0` | `0x004475a0-0x00447bb8` | `81e6e28cf3a20e2ecd6d1f2e7ede44e646f044fbf86aa581620baa41f67f9f9c` | frame caller와 sole callsite |
| `FUN_00456630` | `0x00456630-0x004567bc` | `0c7e7e46adef48e73a9e7fd49bd60b923ce1ca84753f83edbae427612a1c4187` | owner field writer |
| `FUN_004567c0` | `0x004567c0-0x00457445` | `8b373abab831078972be8d5a5d935e9f80bac32d9dd16e9694b6a3d2a4d04444` | complete measured overlay renderer |
| `FUN_00457460` | `0x00457460-0x004575a8` | `0019b6552638c7b0899513e0b8faa673289f699efadfd8b6ee7cff27bf3bb1f1` | 별도 base-string helper |
| `FUN_00459490` | `0x00459490-0x0045acfc` | `f6d20a3bbc4426f27cd430a743eb24e75812a544a034f85b3551b7fadfbec202` | writer의 두 producer callsite |
| `FUN_0046f140` | `0x0046f140-0x0046f3b4` | `4e50b8b44bb4fbb7364345a5fb1ee848be9d193f5ba882975f5b1be426e004db` | base helper의 다른 caller 경계 |

생성 함수 metadata도 같은 6개 함수의 단일 body range, body size, instruction count와 instruction
digest를 검증한다. 전용 추출기는 동작을 고정하는 exact byte anchor 27개와 다음 complete
structured set 12개를 검증한다.

| canonical structured set | count | projection SHA-256 |
| --- | ---: | --- |
| `to == 0x004567c0` | 1 | `80e9cdf106a698ec6f02a31415e1cb85f9eabd82401568230ecf8460a9cec4a0` |
| `to == 0x00456630` | 2 | `e18c3682a28bf08d9c7bd4c4b3ef9a9a3e928dec9a8dac2cfea928297e67fe9a` |
| `to == 0x00457460` | 2 | `0b85dc71938c8450ee4f8e7fc44cbb22e9c04cd898d1f291f82975f6420f194a` |
| `to == 0x00459490` | 1 | `9d09b0b25b4ecf842b832bfef9ef370a8bb724e53470cc0770ee4cfd8dce310e` |
| renderer outgoing | 212 | `9862079da8d5e3a4d6c2e9c0c9344f0f29618d9ece14c0a4a89c9ad8460b1684` |
| writer outgoing | 11 | `8e6517c81e364d3520ecb13deff2b2e6dccc2f56f0cf957361e051a78249e36f` |
| frame caller outgoing | 233 | `81f7e6c7c7aba4adaa5ee2e3b18ac6e26672481a6bd8aeb6a68ef4918af07dc9` |
| producer outgoing | 848 | `eb8e49be85f069a15dfaef4be5c2e7f08caa605bf40ce61dac5d9736f8aeb05f` |
| base helper outgoing | 32 | `86d0bbfb0719c73289bb9c4d3b4c20bb15a6e11807f01a03841349f87f50754b` |
| `to == 0x005e2dc4` | 2 | `ac549747e647f55a8457758f48d6639db4195ef04b8ebbbcb00c0bff2ce081d7` |
| `to == 0x005e29c4` | 4 | `fda82db1ee6ac6c439a75f536da5acf0eebabadf9d543ea0966b0e12a8e847c4` |
| `to == 0x00bcdd58` | 4 | `4ae5cf834395b0c1fadfad1714523f8f82bb9f41a373ef406fdb354f13e4656b` |

`FUN_004567c0`의 complete structured incoming set은
`0x00447b23/FUN_004475a0`의 `UNCONDITIONAL_CALL` 하나뿐이다. `FUN_00456630`의 complete
structured incoming set은 `0x0045aa2f`와 `0x0045acd9`, 둘 다 `FUN_00459490`에 속한다.
`FUN_00457460`의 두 structured caller는 `0x0045740c/FUN_004567c0`과
`0x0046f253/FUN_0046f140`이다. 후자는 caller set completeness를 보존하기 위한 경계이며
두 번째 UI 질문으로 의미를 확장하지 않는다.
이는 structured direct reference 범위의 completeness이며 arbitrary alias write가 없다는
전역 증명은 아니다.

## owner field와 producer

`FUN_00456630`은 `ECX=0x00bcdd58`에 다음을 쓴다.

| offset | 폭·판정 | 정적으로 확정한 사용 |
| ---: | --- | --- |
| `+0x00` | 128-byte NUL byte-string region | producer argument 4를 unchecked copy하며 null이면 빈 static string을 복사한다. transient text row가 아니라 `FUN_00457460`이 소비한다. |
| `+0x80` | WORD | writer가 `1`; renderer가 exact zero no-op gate로 읽고 도달 시 surface 처리 전에 `0`으로 clear한다. |
| `+0x82/+0x84` | signed WORD | producer 좌표. post-call `RECT.right` low WORD 절반과 `RECT.bottom` low WORD를 빼고 runtime dimensions에 clamp한다. |
| `+0x88/+0x8c/+0x90` | canonical DWORD | `+0x114/+0x194/+0x214` 세 line의 exact-one presence flag다. |
| `+0x94` | 128-byte NUL byte-string region | primary string. producer pointer가 null이면 기존 buffer를 보존한다. |
| `+0x114..+0x293` | 128-byte stride buffer 3개 | 대응 pointer가 있으면 복사하고 flag `1`, 없으면 buffer는 보존하고 flag `0`이다. |
| `+0x294..+0x29a` | signed WORD 4개 | exact zero인 값은 해당 numeric icon/text branch를 생략한다. |
| `+0x29c` | signed byte | zero면 `%s`, nonzero면 `%s(%c)`를 만들고 primary를 네 segment로 그린다. |

`FUN_00459490`의 첫 callsite는 table/pointer에서 유래한 값들과 conditional formatted line을
전달한다. 두 번째 callsite는 producer coordinates, primary pointer, signed WORD 값 세 개와
optional line 하나를 전달하고 나머지는 zero/null로 채운다. 테이블 값의 domain identity와
간접 resource method의 구체 구현은 structured evidence가 완전히 경계 짓지 못하므로 raw
input 관계 이상으로 이름 붙이지 않는다.

## `FUN_004567c0` 전체 제어 흐름

1. `+0x80 == 0`이면 다른 owner field를 읽지 않고 반환한다.
2. nonzero이면 `+0x80=0`을 먼저 기록한다. 초기 HDC 획득이 실패하면 text/value/extra-line을
   읽지 않고 측정 크기 `0×0`에서 15×15 surface 요청으로 진행한다.
3. HDC가 있으면 primary를 `%s` 또는 `%s(%c)`로 format하고
   `GetTextExtentPoint32A`로 측정한다.
4. 네 signed WORD 중 nonzero 값만 ` %d `로 format·측정한다. 각 row 항목 폭은
   runtime icon width와 text width의 합이며 row 높이는 icon/text 높이의 최대값이다.
5. 세 extra line은 presence DWORD가 정확히 `1`일 때만 buffer를 읽고 측정한다.
6. `maxWidth=max(primary,numericRow,extra lines)`,
   `totalHeight=primaryHeight+numericRowHeight+sum(extraLineHeight)`이다.
7. native code는 `maxWidth`와 `totalHeight`의 low WORD를 sign-extend한 뒤 15를 더한다.
   재현 모델은 조용한 narrowing을 피하려고 두 derived 값이 `0..0x7fff`인 subset만 받는다.
   초기 local RECT는 `{left:0,top:0,right:maxWidth+15,bottom:totalHeight+15}`이고 unresolved
   indirect vtable `+0x14`에 전체 RECT를 넘긴다.
8. call 뒤 RECT의 mutation·실패 convention은 미확정이다. 재현기는 supplied synthetic
   `postCallRect`를 받는다. screen X는 `+0x82-trunc(signedLowWord(right)/2)`, Y는
   `+0x84-signedLowWord(bottom)`이며, full `right/bottom`을 써서 각 축을
   `[0,runtimeDimension-bound-1]`에 clamp한다. surface가 runtime보다 큰 지원 범위는 0으로
   clamp된다.
9. content block 좌표는
   `blockLeft=trunc(postCallRect.right/2)-trunc(maxWidth/2)`,
   `blockTop=trunc(postCallRect.bottom/2)-trunc(totalHeight/2)`다. 두 half는 빼기 전에
   각각 truncation한다. primary, numeric row reset, 모든 extra line은 같은 block-left를
   쓴다. 좁은 extra line도 개별 centered가 아니다.
10. draw HDC가 있으면 primary, numeric row, extra line 순으로 그린다.
   selector가 nonzero이면 primary text, `(`, selector character, `)` 네 segment를 순서대로
   그리고 selector만 색 `0x00b4dce1`을 쓴다.
11. numeric item마다 HDC를 놓고 runtime icon lock/draw를 시도한 뒤 HDC를 다시 얻고 숫자를
   그린다. icon lock 실패는 icon과 그 폭 advance만 생략한다. HDC 재획득 결과는 원본이
   검사하지 않으므로 실패 후 동작은 이 재현 범위에서 unresolved로 loud rejection한다.
12. draw HDC 실패는 transient content draw만 생략한다. 이후 `FUN_00457460`과 final blit는
    계속 수행한다. final blit는 owner `+0x82/+0x84`와 **full post-call RECT**를 받는다.

## `FUN_00457460` cache gate와 고정 좌표 draw

helper는 supplied base pointer에 대해 null test보다 먼저 length scan을 실행한다. null은 안전한
no-op이 아니라 선행 dereference 경계이므로 재현기는 loud rejection한다.

1. empty string이면 `0x00457476`에서 반환한다.
2. current DWORD `0x007c5f80`과 cached DWORD `0x005e2dc4`가 다르면 기존 cached text bytes를
   읽지 않고 cache update로 바로 간다.
3. context가 같으면 cached bytes `0x005e29c4`와 input을 비교한다. **같으면** comparison
   result zero라 `0x004574cb`의 JNE를 타지 않고 update/draw로 진행한다. **다르면** JNE를
   타고 반환한다. 이 비직관적 방향에 gameplay 의미를 부여하지 않는다.
4. proceeding path는 cached context와 bytes를 먼저 갱신한다.
5. target `0x00549580` HDC 획득이 실패하면 갱신된 cache는 그대로 남고 반환한다.
6. 성공하면 global `0x00c06d9c`를 선택하고 background `0x00ff0000`, text
   `0x00fafafa`, mode `1`을 설정한다. `GetTextExtentPoint32A`를 호출하지만 반환 SIZE는
   후속 좌표·layout에 쓰지 않는다. `TextOutA`는 exact `x=200,y=350`이고 마지막에 HDC를
   release한다.

검증된 Win32 import identity는 `SetBkColor`, `SetTextColor`, `SetBkMode`, `TextOutA`,
`SelectObject`, `GetTextExtentPoint32A`, `lstrlenA`, `wsprintfA`다. format bytes는
`)`, `%c`, `(`, ` %d `, `%s`, `%s(%c)`다. 이 import 연결은 실제 font realization이나
실제 문자열의 glyph metrics를 확정하지 않는다.

## 재현 벡터와 실패 경계

`analysis/fixtures/transient-formatted-overlay-vectors.json`은 exact EXE SHA-256에 묶여 있고
모든 GDI `SIZE`와 post-call RECT가 **공급한 synthetic 값**임을 provenance에 명시한다.
전체 output SHA-256으로 다음을 비교한다.

- writer의 모든 reached field 갱신, null primary buffer retain, null base의 empty 복사,
  extra-line flag와 retained inactive buffer
- separate-half block alignment와 좁은 extra line의 block-left 정렬
- primary·두 numeric item·extra line의 measured layout, 한 icon lock 실패, 정확한 draw 순서
- nonzero selector의 네 segment, near/far 양축 clamp, 1픽셀 far margin과 runtime보다 큰
  post-call bounds의 zero clamp
- 초기 HDC 실패에서 downstream content field가 unread인 15×15 경로
- base empty no-op, same-context/different-text no-op, changed-context draw,
  same-context/same-text draw, cache update 뒤 base HDC 실패
- base helper의 unused measurement call, fixed `(200,350)` draw와 HDC release
- draw HDC 실패 뒤에도 base helper와 full-RECT final blit가 실행되는 경로
- dirty zero에서 모든 downstream field가 unread인 완전 no-op
- 128-byte owner buffers와 128-byte formatted-primary local의 bounded non-overflow subset,
  byte-only string 표현, derived signed-WORD와 post-call RECT bounds의 loud rejection
- reached signed BYTE/WORD/DWORD·측정값 오류, 누락·순서가 틀린 측정값과 원본이 무시한
  numeric HDC reacquisition failure의 loud rejection
- 변조 EXE, whole-function metadata, structured reference set의 deterministic rejection

indirect vtable `+0x14`의 post-call RECT mutation·failure convention, 간접 icon resource
method identity와 그 실패 후 내부 side effect, arbitrary alias producer, 실제 runtime text와
GDI metrics는 정적으로 완결되지 않았다. 따라서 supplied metric/RECT 재현을 실제 원본 pixel
layout이나 allocator 반환 크기로 승격하지 않는다.

## 다음 좁은 질문

고정 bottom selection panel 가설을 이 owner에 계속 적용하지 않는다. 다음 질문은
`FUN_004475a0`의 다른 draw branches와 owner/resource producers에서 **지속적으로 화면 하단에
남는 gameplay selection surface**의 owner를 먼저 식별하고, 그 complete producer/consumer
경계가 현재 project selection view data의 construction/production/research와 의미상 결합되는지
검증하는 것이다.
