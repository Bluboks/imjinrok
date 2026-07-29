# 임진록 main tileset loader 경계

## 질문과 상태

질문: `FUN_00443160`은 어떤 selector와 filename table로 main tileset sprite container를 적재하며,
`FUN_00443320`은 어떤 record 범위를 정리하는가?

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | 정적 확정 | signed-WORD prefix selector, 76-entry filename table·sentinel, record base/stride, cleanup count |
| 재현 | 재현 완료 | canonical EXE byte/table/cleanup 검증, selector 경계 벡터와 branch/table/sentinel/cleanup 변조 거부 |
| 구현 | 없음 | renderer, frame 선택, map-cell 연결을 변경하지 않음 |

## 고정 입력과 재현

- 원본: `original/imjinrok2/imjinrok2.exe`, SHA-256
  `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`.
- extractor: [`extract-imjinrok-tileset-loader-boundary.mjs`](../../../tools/imjinrok/extract-imjinrok-tileset-loader-boundary.mjs).
- fixture: [`imjinrok-tileset-loader-boundary.json`](../../../analysis/fixtures/imjinrok-tileset-loader-boundary.json).

```sh
node tools/imjinrok/extract-imjinrok-tileset-loader-boundary.mjs \
  --output analysis/fixtures/imjinrok-tileset-loader-boundary.json
node --test tools/imjinrok/imjinrok-tileset-loader-boundary.test.mjs
```

생성기는 `0x00443160-0x00443311`, `0x00443320-0x00443352`, 그리고
`0x004bc420-0x004bc554`의 원시 SHA-256과 selector branch, table sentinel, cleanup loop byte anchor를
확인한다. 변조 테스트는 branch, table 첫 entry, sentinel, cleanup count 지점을 각각 바꾼 EXE를 원본
SHA-256 mismatch로 거부한다.

## `FUN_00443160`의 제한된 적재 계약

`0x00443187`의 `MOVSX`는 첫 인수를 signed `WORD`로 읽는다. `SUB`/`DEC`/`JE` chain은 값 `0`, `1`,
`2`에서 다음 prefix를 각각 선택한다.

| selector | prefix |
| ---: | --- |
| `0` | `tile\normal\` |
| `1` | `tile\snow\` |
| `2` | `tile\brown\` |
| 그 밖의 signed-WORD 값 | `tile\normal\` fallback |

`0x004bc420`의 pointer table은 `0x004cab44` empty-string sentinel 직전까지 정확히 76개 filename을
순서대로 적재한다. 각 반복은 record base `0x00bcdff8`에서 시작해 `0x0bf8`을 더하고, table cursor는
4 bytes를 더한다. fixture의 `loader.filenameTable.entries`가 이 76개 source-order의 단일 출처다.

명단은 `hill0..15`, `diff1..15`, `grss1..15`, `sea0..3`, `newblk0..3`, `newblkgate`, `castle0..2`,
`blacktile`, `shallow`, `fog0..14`, `black` 순서다. 이 목록은 path prefix와 결합된 container filename일
뿐이며 terrain 의미 또는 frame 선택 규칙이 아니다.

## cleanup과 디스크 catalog의 차이

`FUN_00443320`은 `0x00bcebec` (`record base + 0x0bf4`)에서 active pointer를 검사하고, nonzero면
`record base`를 `FUN_00443440`에 넘긴 뒤 pointer를 zero로 만든다. `EDI=0x4c`로 시작해 매 반복
`0x0bf8`을 더하므로 정확히 76 record를 정리한다.

`tile/normal`의 container disk catalog는 78개다. main loader table에 없는 두 파일은
`diff13l.ytl`과 `hill0.ypr`이다. 이 사실은 **이 main loader table 밖**이라는 뜻만 가지며, 다른 원본
경로에서도 사용되지 않는다고 단정하지 않는다.

## 미확정 경계와 다음 질문

이 분석은 filename pointer table과 runtime record stride까지만 닫는다. renderer가 record의 어느 field를
읽는지, map cell의 어느 field/값이 filename·frame을 선택하는지, tile 또는 frame의 화면 의미가 무엇인지는
미확정이다. 다음 정적 질문은 map-cell render field에서 이 loader record와 frame selector까지의 complete
branch/range/default 경로다.
