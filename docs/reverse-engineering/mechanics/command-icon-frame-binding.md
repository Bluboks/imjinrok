# 원본 command control의 `button.spr` pixel-frame 결합

## 질문과 상태

질문: 원본 selected command control의 action `61..64`가 어떤 정확한 `fnt\\button.spr`
pixel frame을 선택하여 `34×34` draw 경로에 넘기는가?

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | 정적 확정 | action WORD→control record frame WORD→`button.spr` offset table/payload→`34×34` draw의 닫힌 경로 |
| 재현 | 재현 완료 | 네 control binding, disabled slot·loader 실패·out-of-range no-draw 경계 |
| 구현 | 없음 | product action semantic mapping과 제품의 4×3 grid는 변경하지 않음 |

기준 입력은 `original/imjinrok2/imjinrok2.exe` SHA-256
`25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`,
`original/imjinrok2/fnt/button.spr` SHA-256
`cfe7bab02f2cb8a1f97a3161075e617ace22d6ecf5a976546263a7c67e4efbb4`,
그리고 같은 EXE를 source로 하는 `references.json` SHA-256
`f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5`다.

## source loader와 frame table

공통 loader의 index `18`은 `fnt\\button.spr`을 runtime record `0x00899828`에 넣는다.
object loader는 source header `0x0bf4` bytes를 record에 복사하고, payload pointer를
`record+0x0bf4 = 0x0089a41c`에 저장한다. 따라서 source sprite의 offset table 시작
`0x04c0`은 runtime `0x00899ce8`, source payload base `0x0bf4`는 runtime payload pointer field
`0x0089a41c`에 대응한다.

`button.spr` header는 type DWORD `9`, width `34`, height `34`, frame count `289`다. 필요한
source frame offsets는 다음과 같다. `dataOffset`은 source file의 byte offset이며 runtime pointer는
`payloadBase + relativeOffset`으로만 계산한다.

| frame | relative offset | source data offset | byte size |
| ---: | ---: | ---: | ---: |
| 26 | 13748 | 16808 | 908 |
| 27 | 14656 | 17716 | 908 |
| 28 | 15564 | 18624 | 908 |
| 29 | 16472 | 19532 | 908 |

## action record에서 draw까지

`FUN_004576c0`은 argument action WORD를 record `+0x00`에, frame/resource WORD를 `+0x02`에
쓴다. 네 callsite의 raw push sequence는 다음 exact binding을 만든다.

| action | constructor callsite | `button.spr` pixel frame |
| ---: | --- | ---: |
| 61 | `0x004579f5` | 27 |
| 62 | `0x00457a13` | 26 |
| 63 | `0x00457a27` | 28 |
| 64 | `0x00457a45` | 29 |

`FUN_0045ad90`의 selected command renderer는 slot owner가 present일 때 action을 `*0x10`으로
scale해 `0x005e3f02+2`의 frame WORD를 읽는다. 이어 `DWORD[0x00899ce8 + frame*4]`의 relative
offset에 `DWORD[0x0089a41c]` payload base를 더하고, 결과 frame을 width/height `34×34`로 draw
helper에 제출한다. 따라서 위 네 값은 단순 resource index 추정이 아니라 `button.spr`의 정확한
pixel frame index다.

이 결론은 `FUN_004576c0` 전체 raw range `0x004576c0..0x004576f9`, 네 constructor call range
`0x004579f5..0x00457a63`, selected renderer `0x0045ad90..0x0045b39f`, 그리고 frame path
`0x0045ae26..0x0045af59`를 hash와 byte anchor로 고정한 extractor로 재검증한다. renderer에서
`0x005e3f02`, `0x00899ce8`, `0x0089a41c`, `0x0089982c`, `0x00899830`로 향하는 complete structured
direct-reference projection도 함께 고정한다.

## 실패 및 제품 경계

- disabled 또는 absent selected slot은 frame lookup과 draw를 하지 않는다.
- button loader가 실패하면 valid payload pointer나 successful frame draw를 만들었다고 주장할 수 없다.
  이 분석은 loader 내부 성공 결과를 재현하거나 보충하지 않는다.
- selected action이 이 네 binding 밖이거나 frame index가 supplied frame-count 범위를 벗어나면 이
  bounded reproducer는 successful draw를 만들지 않는다.
- action `61..64`의 원본 control 의미와 현재 제품 `ActionDefinitionId`의 source-complete semantic
  mapping은 별개다. 현재 대응은 없으며 제품 responsive 4 columns × 3 rows command grid는 그대로다.

## 재현 도구

- [extract-command-icon-frame-binding.mjs](../../../tools/imjinrok/extract-command-icon-frame-binding.mjs)
- [command-icon-frame-binding.test.mjs](../../../tools/imjinrok/command-icon-frame-binding.test.mjs)
- [command-icon-frame-binding-vectors.json](../../../analysis/fixtures/command-icon-frame-binding-vectors.json)

`node tools/imjinrok/extract-command-icon-frame-binding.mjs --fixture`는 fixture를 결정론적으로
재생성하며, test는 fixture bytes가 동일한지와 canonical source EXE/SPR/references 변조 거부를
검사한다.
