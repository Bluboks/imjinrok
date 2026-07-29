# Gameplay selection/command grid

## 범위와 상태

질문: 원본 gameplay 화면에서 selection/command action grid를 소유하는 객체는 무엇이고, 공유
`640×480` canvas 안에서 grid의 draw·no-selection dispatch·입력 허용 경계는 정확히 무엇인가?

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | 정적 확정 | `0x007c5ed8`의 9개 command slot, source-bound `34×34` `3×3` geometry, `pannel.spr` final blit, renderer/input 분기와 lock 실패 |
| 재현 | 재현 완료 | source-bound exact rectangle, strict-edge, disabled, lock 실패, owner index와 loader/blit failure 범위 벡터 |
| 구현 | 부분 이식 | `imjinrok-k01-opening`에서만 9-slot geometry·strict hit를 적용; action label·icon·의미와 HUD 구성은 의도적 적응 |

이는 [persistent selection/action boundary](persistent-selection-action-boundary.md)의 selected-action
mirror와 no-selection seven-slot surface를 다시 이름 붙이는 문서가 아니다. 여기서는 그와 별개로
`FUN_0045ad90`이 공통으로 그리는 아홉 action slot의 owner와 geometry만 닫는다.

## 고정 입력과 증거

- EXE: `original/imjinrok2/imjinrok2.exe`, SHA-256
  `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- structured reference export: SHA-256
  `f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5`
- 검증 추출기: `tools/imjinrok/extract-gameplay-selection-command-panel.mjs`
- 재현 fixture: `analysis/fixtures/gameplay-selection-command-panel-vectors.json`
- focused test: `tools/imjinrok/gameplay-selection-command-panel.test.mjs`
- cell-size source binding: [command-grid-cell-size-binding](command-grid-cell-size-binding.md)
- panel loader/blit binding: [pannel-spr-hud-blit](pannel-spr-hud-blit.md)

추출기는 `FUN_004475a0`, `FUN_0045ad90`, `FUN_00459490`, `FUN_00459110`,
`FUN_0045b3a0`, `FUN_00481ee0`, `FUN_0044a040`, `FUN_00461200`의 raw range hash, bytes,
structured direct-call set, 그리고 두 SPR header를 함께 확인한다. 이 추출기는 cell-size와 panel
blit의 hash-bound extractor도 호출해 successful record-18 load와 final blit을 같은 EXE·SPR·reference
export로 다시 검증한다. source artifact와 일치하지 않는 resource hash는 결과를 만들기 전에 거부한다.

## owner와 canvas

`FUN_0045ad90`의 loop는 `0x007c5ed8`을 `ECX` owner로 놓고 index 0에서 시작한다. storage
cursor는 `0x007c66f0`에서 시작해 2바이트씩 증가하고 `0x007c6702` 직전까지 반복하므로 정확히
9회다. `FUN_00461200`은 signed index `<0` 또는 `>=9`를 owner field read 전에 zero 반환으로
막는다. 따라서 이 owner의 정적 확정 index domain은 `0..8`이다.

`FUN_0044a040`은 같은 destination surface `DAT_00559418`에 width `640`, height `480`을
기록한다. action grid는 이 좌상단 원점 shared canvas 좌표를 사용한다.

common loader `FUN_00443360`의 index 18은 `fnt\button.spr`이고 its record는 `0x00899828`이다.
[cell-size binding](command-grid-cell-size-binding.md)은 successful type-9 object load가 header DWORD
`34×34`를 record `+4/+8` (`DAT_0089982c/0x00899830`)에 복사하고, `FUN_00481ee0`이 raw low WORD를
layout에 보존하며 renderer/input consumer가 signed `int16` `34×34`로 읽는 full path를 닫는다. record
load failure 뒤의 cell value나 later computed-alias mutation 부재는 이 주장에 포함하지 않는다.

[pannel HUD blit](pannel-spr-hud-blit.md)은 table index 1의 `fnt\pannel.spr` (`640×163`, 1 frame)이
locked target에 indexed blit되는 final call을 닫는다. source-bound rectangle은 `(0,0)-(640,163)`이고
unlock 뒤 `FUN_0045ad90` command grid가 온다. concrete runtime DirectDraw/vtable semantic owner는
미확정이며, 이 사실은 웹 제품의 panel background나 screen placement를 원작 일치로 만드는 근거가 아니다.

## 확정된 source-bound 3×3 grid

`FUN_00445770 → FUN_00481ee0`은 layout object `0x0088bd60`을 초기화한다.

```text
columns = WORD[0x0088bd62] = 3
rows    = WORD[0x0088bd60] = 3
cellW   = WORD[0x0088bd64] = signed int16 34 from WORD[0x0089982c]
cellH   = WORD[0x0088bd66] = signed int16 34 from WORD[0x00899830]
gap     = WORD[0x0088bd68..0x0088bd6a] = 2×2
origin  = WORD[0x0088bd6c..0x0088bd6e] = (525,363)
```

`FUN_0045ad90`과 `FUN_00459110`은 모두 다음 계산을 사용한다.

```text
column = slot % 3
row    = trunc(slot / 3)
left   = 525 + column * 36
top    = 363 + row * 36
right  = left + 34
bottom = top + 34
```

exact slot rectangle은 모두 right/bottom exclusive다.

| slot | rectangle |
| --- | --- |
| 0, 1, 2 | `(525,363)-(559,397)`, `(561,363)-(595,397)`, `(597,363)-(631,397)` |
| 3, 4, 5 | `(525,399)-(559,433)`, `(561,399)-(595,433)`, `(597,399)-(631,433)` |
| 6, 7, 8 | `(525,435)-(559,469)`, `(561,435)-(595,469)`, `(597,435)-(631,469)` |

이 numeric geometry는 successful initial load에 대해 정적 확정이다. full process lifetime 동안
post-initialization computed alias writer가 없다는 더 강한 주장은 아직 하지 않는다.

## frame draw와 no-selection

`FUN_004475a0`의 `0x00447aba` call은 `FUN_0045ad90`으로 간다. renderer는 raw WORD
`DAT_007c662a`를 다음처럼 분기한다.

1. 정확히 `1`: 선택 record를 탐색하고 `FUN_00421390`에 위임한다.
2. 정확히 `0`: `FUN_0045b8b0`에 위임한다.
3. 그 밖의 nonzero: 두 위임을 건너뛴다.

세 경우 모두 이후 공통 command-grid path에 합류한다. 먼저 `DAT_00559418`에
`FUN_0044abb0` lock을 호출하고 반환값이 정확히 `1`일 때만 9 slot의 owner getter와 draw
호출을 수행한다. lock 실패는 slot read/draw 없이 해당 bounded path를 건너뛴다.

no-selection update에서는 `FUN_00459490`이 9개 action slot을 reset한 뒤 selection count가
정확히 zero일 때만 `FUN_0045b3a0`을 호출한다. 이 producer는 `FUN_004593c0` 경유로 slot 0과
1에 실제 control을 설치할 수 있다. 이 문서는 각 action의 gameplay 의미를 일반화하지 않는다.

이 call 뒤 root는 별도의 `0x005e3680` SPEECH path와 `0x00bcdd58` transient formatted-overlay
path를 호출한다. 둘 다 이 grid owner가 아니며, 전자는
[selection-panel-slot dispatch](selection-panel-slot-dispatch.md), 후자는
[transient formatted overlay](transient-formatted-overlay.md)에 분리돼 있다.

## 입력과 실패 경계

`FUN_00459110`은 다음 순서로 admission만 판정한다.

1. `DAT_00c06e70 == 1`이면 false를 반환한다.
2. 요청 index와 field `0x8a`로 `FUN_00461200`을 호출한다. control WORD가 zero이면 false다.
3. 위 rectangle의 strict interior, 즉
   `left < pointerX < right && top < pointerY < bottom`일 때만 true다.

`FUN_00461200` 자체가 signed index `< 0` 또는 `>= 9`를 진단 경로 뒤 zero 반환으로 막으므로,
`FUN_00459110`은 이런 index에서 owner field를 읽지 못하고 false가 된다. 성공 반환은 command
delivery 전체가 아니라 slot admission만 뜻한다. `FUN_00459490`의 이후 button-release와 command
delivery는 이 문서 범위 밖이다.

## 재현 벡터와 남은 경계

fixture와 report는 source-bound `34×34`를 기준으로 다음을 고정한다. loader failure가 cell value를
만들지 않는 경계와 pannel blit의 gate/lock failure는 각각 linked focused extractor에서 별도로
재현한다.

- lock 실패: slot input 없이 command-grid path를 건너뜀
- no-selection slot 1의 strict interior `(562,364)` 허용
- slot 8 top edge `(598,435)` 거절
- disabled slot 4 거절
- index 9 거절

모델은 renderer의 enable word, frame/resource word, input-control word를 별도 field로 받는다.
원본도 renderer의 `0x78`/`0x86` read와 input의 `0x8a` read가 서로 다르므로 이들을 하나의
“frame 값”으로 합치지 않는다.

남은 불확실성은 post-initialization computed alias writer, selected-entity renderer
`FUN_00421390`의 전체 visual contents, action identifier별 의미, concrete runtime
DirectDraw/vtable semantic owner, 그리고 runtime sprite/resource pointer failure의 화면 결과다.
제품은 `imjinrok-k01-opening`에서만 이 문서의 9-slot geometry와 strict interior admission을
사용한다. 기존 action label·icon·action semantics, responsive HUD/minimap/selection contents 및 panel
background placement는 프로젝트 적응이며 원작 일치라고 주장하지 않는다.
