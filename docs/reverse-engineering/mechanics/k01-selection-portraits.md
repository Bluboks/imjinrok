# K01 단일 선택 `portrait.spr` 결합

K01에서 선택 가능한 원본 entity class가 단일 선택 패널에 어떤 `fnt\portrait.spr` frame을
표시하는가를 다룬다. body SPR의 idle frame이나 `SPEECH` 화자 portrait와 혼동하지 않는다.

## 판정

- 분석 상태: **정적 확정**. common SPR loader의 path-table/runtime-record 대응, 선택 renderer의
  `FUN_00420c20` 호출, type record `+0x08` frame read, `portrait.spr` frame-offset/surface 사용을
  같은 원본 EXE에서 닫았다.
- 재현 상태: **재현 완료**. K01 범위의 22 class에 대해 class→frame→PNG file vector를 고정하고,
  EXE·seed analysis·`portrait.spr` 변조를 거부한다.
- 구현 상태: **source-backed selection portrait binding**. K01의 22개 현재 theme entity는
  recovered `ui/portraits/portrait_XXXX.png`를 명시적으로 preload·표시한다.

## provenance와 데이터 흐름

| 입력 | SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `analysis/generated/imjinrok2/seeds.json` | `8e7c8821e9c84c5d0877bb977b119b3b878271502b36bf75e7426b570507bfb7` |
| `original/imjinrok2/fnt/portrait.spr` | `1a124007c267f4fa8686475e31dcb57f0ea281513f4c5f213df1ee41df141885` |

`fnt\portrait.spr` path pointer `0x004bd714`은 common loader table `0x004bc094`의 index 34다.
`FUN_00443360-0x0044343c`는 한 iteration마다 path cell을 4 byte, runtime record를 `0x0bf8`
byte 이동한다. 따라서 portrait runtime record는 `0x008a57a8`, frame-offset table은
`0x008a5c68`, loaded surface pointer는 `0x008a639c`다.

단일 선택 success path의 `FUN_00421390`은 먼저 `FUN_00420c20`을 호출한다. 그 helper
`FUN_00420c20-0x00420ca4`는 `WORD[typeRecord + 0x08]`을 읽어 `0x008a5c68[frameIndex]`와
`DWORD[0x008a639c]`로 source를 만들고 `FUN_0044dfd0`에 전달한다. `0x0045bd1c`는 type
initializer의 argument 2를 같은 `typeRecord+0x08`에 기록한다. 따라서 이는 class별 원본
선택 portrait frame binding이며 body animation frame의 유사성에 근거하지 않는다.

전용 추출기
[`extract-k01-selection-portrait-bindings.mjs`](../../../tools/imjinrok/extract-k01-selection-portrait-bindings.mjs)는
두 raw code range와 seven byte anchor를 검증한 뒤, 51-argument type initializer에서 argument 2를
복원한다. 출력의 `testVectors`가 K01 22 class의 exact `frameIndex`와 `portrait_XXXX.png`를
단일 출처로 제공한다. 관련 test는
[`k01-selection-portrait-bindings.test.mjs`](../../../tools/imjinrok/k01-selection-portrait-bindings.test.mjs)다.

## 제품 결합 범위

`packages/shared/src/themes.ts`는 K01 entity의 explicit `EntityVisual.portrait`를
`ui/portraits/portrait_XXXX.png`로 설정한다. `getK01SelectionPortraitRegistry()`와 sprite mapping
audit는 theme file name이 추출기의 class→frame output과 다르면 blocking finding을 낸다.

이 결합은 다음을 주장하지 않는다.

- 원본 panel의 exact destination rectangle, scale, clipping 또는 surface-lock failure 결과
- 후속 `FUN_00421810` 등 selection helper의 의미
- K01 밖 class의 portrait binding
- `SPEECH` portrait/label slot과의 공통 semantic identity
