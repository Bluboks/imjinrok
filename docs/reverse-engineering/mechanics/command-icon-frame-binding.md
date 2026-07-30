# 원본 command control의 `button.spr` pixel-frame 결합

## 질문과 상태

질문: 원본 command control action이 어떤 정확한 `fnt\\button.spr` pixel frame을 `34×34` draw
경로에 넘기며, label이 있는 bounded control은 어느 CP949 source string을 runtime label pointer로
복사하는가?

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | 정적 확정 | action 2/3/5/11/16/19/21/35/39의 CP949 source label→runtime pointer→frame, action 61..64의 frame, `button.spr` payload→`34×34` draw의 닫힌 경로 |
| 재현 | 재현 완료 | 열세 action/frame vector, label copy metadata, disabled slot·loader 실패·out-of-range no-draw 경계 |
| 구현 | 원본 기반 source binding + 의도적 적응 | K01 opt-in profile이 bounded pixel frame을 사용한다. responsive 4×3 grid는 유지하며 `attack-move`/`build`는 semantic adaptation으로 기록한다. |

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
| 39 | 25529 | 28589 | 908 |
| 43 | 29161 | 32221 | 908 |
| 45 | 30977 | 34037 | 908 |

## action record에서 draw까지

`FUN_004576c0`은 argument action WORD를 record `+0x00`에, frame/resource WORD를 `+0x02`에
쓴다. `FUN_0045f190`은 `ECX=0x00aa4018`로 `FUN_0048ea90`을 먼저 호출하고 그 뒤
`FUN_00457700`을 호출한다. `FUN_0048ea90`의 string-length/`REP MOVS` chain은 아래 CP949 source
bytes를 `0x00aa4018+offset` runtime buffer에 복사하며, 각 constructor는 그 runtime address를
후속 argument로 넘긴다.

| action | CP949 label source → runtime pointer | constructor callsite | `button.spr` pixel frame |
| ---: | --- | --- | ---: |
| 2 | `정지`, `0x004c8524` → `0x00aa4ae8` | `0x00457700` | 43 |
| 3 | `이동`, `0x004c851c` → `0x00aa4b08` | `0x0045771b` | 6 |
| 5 | `공격`, `0x004c8514` → `0x00aa4b28` | `0x00457736` | 4 |
| 11 | `건설`, `0x004c8504` → `0x00aa4b68` | `0x0045776c` | 16 |
| 16 | `수리`, `0x004c84f4` → `0x00aa4ba8` | `0x004577a2` | 12 |
| 19 | `취소`, `0x004c84dc` → `0x00aa4c08` | `0x004577f3` | 45 |
| 21 | `집결지설정`, `0x004c84d0` → `0x00aa4c28` | `0x00457847` | 11 |
| 35 | `순찰`, `0x004c84b0` → `0x00aa4ca8` | `0x004578b3` | 10 |
| 39 | `사수`, `0x004c848c` → `0x00aa4d28` | `0x0045791f` | 39 |
| 61 | — | `0x004579f5` | 27 |
| 62 | — | `0x00457a13` | 26 |
| 63 | — | `0x00457a27` | 28 |
| 64 | — | `0x00457a45` | 29 |

action 61..64는 이 slice에서 source label binding을 추가로 주장하지 않는다. 위 table의 label은
원본 bounded command record의 CP949 text이며 현재 product action의 name 또는 semantic parity가 아니다.

`FUN_0045ad90`의 selected command renderer는 slot owner가 present일 때 action을 `*0x10`으로
scale해 `0x005e3f02+2`의 frame WORD를 읽는다. 이어 `DWORD[0x00899ce8 + frame*4]`의 relative
offset에 `DWORD[0x0089a41c]` payload base를 더하고, 결과 frame을 width/height `34×34`로 draw
helper에 제출한다. 따라서 위 네 값은 단순 resource index 추정이 아니라 `button.spr`의 정확한
pixel frame index다.

이 결론은 `FUN_0048ea90` 전체 raw range `0x0048ea90..0x004924b2`, bounded label-copy chain
`0x0048f201..0x0048f50f`, initializer caller `0x0045f190..0x0045f1b2`, `FUN_004576c0` 전체 raw range
`0x004576c0..0x004576f9`, labelled constructor range `0x00457700..0x0045793a`, action 61..64 call range
`0x004579f5..0x00457a63`, selected renderer `0x0045ad90..0x0045b39f`, 그리고 frame path
`0x0045ae26..0x0045af59`를 hash와 byte anchor로 고정한 extractor로 재검증한다. renderer에서
`0x005e3f02`, `0x00899ce8`, `0x0089a41c`, `0x0089982c`, `0x00899830`로 향하는 complete structured
direct-reference projection도 함께 고정한다.

## 실패 및 제품 경계

- disabled 또는 absent selected slot은 frame lookup과 draw를 하지 않는다.
- button loader가 실패하면 valid payload pointer나 successful frame draw를 만들었다고 주장할 수 없다.
  이 분석은 loader 내부 성공 결과를 재현하거나 보충하지 않는다.
- selected action이 이 bounded binding 밖이거나 frame index가 supplied frame-count 범위를 벗어나면 이
  bounded reproducer는 successful draw를 만들지 않는다.
- K01 opt-in profile은 product `move`, `stop`, `patrol`, `repair`, `hold`, `rally-point`,
  `cancel-production`, `cancel-construction`에 각각 action 3/2/35/16/39/21/19의 bounded source
  record와 frame을 사용한다. `attack-move`→action 5 `공격` frame 4 및 `build`→action 11 `건설`
  frame 16은 source-backed adaptation이며 original semantic parity를 주장하지 않는다.
- 제품 responsive 4 columns × 3 rows command grid는 그대로이며 original 3×3 layout을 이식하지 않는다.

## 재현 도구

- [extract-command-icon-frame-binding.mjs](../../../tools/imjinrok/extract-command-icon-frame-binding.mjs)
- [command-icon-frame-binding.test.mjs](../../../tools/imjinrok/command-icon-frame-binding.test.mjs)
- [command-icon-frame-binding-vectors.json](../../../analysis/fixtures/command-icon-frame-binding-vectors.json)

`node tools/imjinrok/extract-command-icon-frame-binding.mjs --fixture`는 fixture를 결정론적으로
재생성하며, test는 fixture bytes가 동일한지와 canonical source EXE/SPR/references 변조 거부를
검사한다.
