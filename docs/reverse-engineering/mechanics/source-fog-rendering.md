# 원본 fog resource·mask·six-subframe renderer 경계

## 질문과 상태

질문: `FUN_00467de0`와 `FUN_0046a530`이 원본 fog 자원, 인접 mask lookup, state별 호출과
subframe 합성에 대해 바이트로 확정하는 범위는 어디까지인가?

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | 정적 확정 | `fog0..14`/`black` loader record, 16-byte lookup, literal state `4`/`8`의 별도 mask 경로, family byte→record, 3×2 six-subframe loop와 두 call path |
| 재현 | 재현 완료 | EXE·SPR hash/header, VA/raw offset/hash, 16 lookup vector, record address와 loop bound의 결정론 추출 |
| 구현 | 없음 | 제품 renderer, visibility 상태와 assets는 변경하지 않았다. |

## 고정 입력과 생성 산출물

- EXE: `original/imjinrok2/imjinrok2.exe`, SHA-256
  `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`.
- extractor: [`extract-source-fog-render-evidence.mjs`](../../../tools/imjinrok/extract-source-fog-render-evidence.mjs)
- fixture: [`source-fog-render-evidence.json`](../../../analysis/fixtures/source-fog-render-evidence.json)
- test: [`source-fog-render-evidence.test.mjs`](../../../tools/imjinrok/source-fog-render-evidence.test.mjs)

`pnpm imjinrok:extract-source-fog-render-evidence`는 fixture를 다시 생성한다. 생성기는 EXE,
각 `tile/normal/fog*.spr`, `black.spr`의 SHA-256과 header를 먼저 검사하고, 고정 VA를 PE raw
offset으로 변환해 code/data range hash를 기록한다. test는 두 번의 JSON 생성이 committed fixture와
byte-identical인지와 lookup의 16 입력·출력 vector를 확인한다.

## 함수·자료 주소

| 항목 | 주소/범위 | 정적 사실 |
| --- | --- | --- |
| caller | `FUN_00467de0`, `0x00467de0-0x004689ce` (end exclusive) | 각 cell에서 literal state `4`, literal state `8`에 대해 별도의 8-neighbor mask build 경로를 둔다. nonzero·non-`0x0f` mask만 lookup/call에 도달한다. |
| lookup | `0x004bf9c4-0x004bf9d4`, raw `0x000bf9c4` | bytes `[0,9,8,2,10,1,12,5,11,13,3,6,0,4,7,0]`; SHA-256 `9df1139c03ffc0cb749f8cc292d6a07825f95d7cb52fe62c746f7cb3bc747dae`. |
| compositor | `FUN_0046a530`, `0x0046a530-0x0046a8e8` (end exclusive) | per-cell family byte를 읽고 `0x3c`를 더해 common loader record를 고른 뒤 state별 3×2 path로 합성한다. |
| loader records | base `0x00bcdff8`, stride `0x0bf8` | index `60..74`는 `fog0.spr..fog14.spr`, index `75`는 `black.spr`이다. |

fixture에는 위 두 함수 전체의 byte range SHA-256, 의미 있는 instruction window의 VA/raw offset/bytes,
그리고 fog/black 16개의 resource index·runtime record address·source path·SHA-256·header를 모두
넣는다. 이는 `FUN_00443160`의 common tileset loader contract를 사용한 resource identity이며,
runtime record payload의 사람용 자료구조 이름을 확정하는 주장이 아니다.

## 정적 제어·데이터 흐름

1. `FUN_00467de0`은 state `4`와 state `8`을 같은 mask accumulator로 합치지 않는다. 각 경로는
   해당 literal과 같은 인접 cell만 검사해 byte mask를 만든다.
2. 각 경로는 mask `0`과 `15`를 넘기지 않고, 나머지 `0..15` 값에서 `0x004bf9c4[mask]`를 읽어
   `FUN_0046a530`의 마지막 stack argument로 전달한다. caller는 각각 literal `4`, `8`도 전달한다.
3. `FUN_0046a530`은 검증한 byte address 식 `this + 0x12831 + mapX * 45 + mapY`에서 family byte를
   읽고 `0x3c`를 더한다. 결과는 `0x00bcdff8 + index * 0x0bf8` common record selection으로 이어진다.
4. state `4`는 `FUN_0044e3c0` call path, caller가 전달한 state `8`은 distinct
   `FUN_00452b30` call path를 사용한다. 각 path의 loop bound는 outer `< 3`, inner `< 2`이므로
   full tile은 6 subframe의 3×2 composite이다.

이 문서는 bit의 방향 이름, mask의 사람용 뜻, 또는 두 state의 visibility 뜻을 지정하지 않는다.

## 재현 vector

| lookup input | output |
| --- | --- |
| 0, 1, 2, 3 | 0, 9, 8, 2 |
| 4, 5, 6, 7 | 10, 1, 12, 5 |
| 8, 9, 10, 11 | 11, 13, 3, 6 |
| 12, 13, 14, 15 | 0, 4, 7, 0 |

추출 test는 모든 16 vector, fog index `60..74`의 `32×16`/96-frame header, black index `75`의
`64×32`/1-frame header, `3×2=6` subframe contract를 독립적으로 확인한다. table-domain 밖의
mask는 helper에서 오류다.

## 미확인과 이식 경계

- state `4`/`8`의 visible, explored, unseen 등 사람용 semantics
- family byte의 map-file source 또는 producer
- six subframe의 정확한 frame-index algebra, scheduler/wall-clock behavior, pixel placement/pivot
- 현재 제품 visibility/neighbor mask/alpha와 원본 state·bit ordering의 대응

`FUN_0046a530` 내부에는 runtime helper와 record field를 포함한 frame arithmetic가 있지만, 이 분석은
그 입력 정의와 출력 index를 닫는 정적 test vector를 아직 만들지 못했다. 따라서 fixture와 문서는
frame selection formula를 제공하지 않으며, 제품 renderer parity 또는 asset bridge 변경의 근거가 아니다.
