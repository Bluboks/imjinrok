# K01 조선 창병 locomotion writer·accumulator coordinate bridge

기준일: 2026-07-31

## 질문과 범위

K01 내부 클래스 `2`의 bounded normal-movement lifecycle에서 entity `WORD +0x4ee`와 `+0x4ea`는 어떤
direct/computed write로 초기화되며, `+0x4f2` 누적값은 언제 field-level coordinate pair에 commit되는가?
이 문서는 initializer와 wrapper·normal-movement entry만 다룬다. 필드의 사람용 속도 의미, 좌표 단위,
occupancy, scheduler 빈도와 project 24 Hz/FPS 변환은 다루지 않는다.

## 원본과 분석 상태

| 파일 | SHA-256 | 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | initializer, movement wrapper, normal accumulator/coordinate branch |

- 분석 상태: `정적 확정` — 아래 bounded field lifecycle와 threshold branch에 한정한다.
- 재현 상태: `재현 완료` — raw signed-WORD accumulator/coordinate vector를 독립 replay로 고정했다.
- 구현 상태: `없음` — product locomotion을 변경하지 않았다.

## writer inventory와 reachability

`FUN_00483c50`의 `0x00483c82`~`0x00483c95`는 slot-derived address를 `ECX`에 계산해
`FUN_00437650`을 호출한다. initializer의 시작 `0x00437653`~`0x00437667`은 그 entity base에서
`REP STOSD`로 `[entity, entity + 0x558)`을 zero-fill한다. 이 computed bulk write는 `+0x4ea`,
`+0x4ee`, `+0x4f2`를 모두 덮는다.

그 뒤 direct writer set은 `.text` 전체에서 operand-size-prefixed `MOV [base+disp32],r16` store와
각 field displacement를 결정론적으로 scan하여 고정했다.

| field | direct write VA | 초기화 후 값 |
| --- | --- | --- |
| `+0x4ea` | `0x00437dde` | type `WORD +0x50` |
| `+0x4ee` | `0x00437b20`, `0x00437e14` | direct zero 후 type `WORD +0x3c` |
| `+0x4f2` | `0x00425f41`, `0x00425f4a`, `0x00425f55`, `0x00425fa5`, `0x00426401`, `0x00437b12` | initializer final value 0; normal path later mutates it |

`FUN_00425af0` preserves `ECX`; `BYTE +0x74` bit `0x08` clear는 `0x00425b09`에서 normal entry
`FUN_00425b20`으로, set은 `0x00425b01`에서 alternate entry `FUN_004262e0`으로 dispatch한다.
따라서 `0x00426401`의 `+0x4f2=0`은 same wrapper lifecycle의 alternate path이며 normal entry의
later writer가 아니다. initializer dispatch와 movement wrapper가 같은 runtime slot을 어떤 session order로
공유한다는 전역 claim은 이 범위 밖이다.

## accumulator에서 coordinate commit까지

normal entry는 `0x00425f09`에서 `+0x4ee`를 읽는다. `BYTE +0xba == 1`이면 `0x00425f10`~`0x00425f2e`의
signed magic-division sequence가 input을 `raw - trunc(raw / 3)`으로 바꾼 뒤 `+0x4f2`에 더한다. 그 외
selector 값은 이 selector branch에서 raw를 그대로 더한다. `0x00425f16`으로 직접 들어오는 앞선 조건의
same transform path는 selector-only replay input 밖으로 남긴다.

`0x00425ea6`의 `XOR EBX,EBX`는 clamp compare의 `BX`를 0으로 만든다. 따라서 이전 accumulator가 음수이고
합이 양수가 되면 `0x00425f4a`에서 0으로 clamp한다. `0x00425f63`의 signed compare가 `+0x4f2 < 50`이면
coordinate current pair를 commit하지 않는다.

`+0x4f2 >= 50`이면 `0x00425f6d` 이후 branch는 다음 순서로 field-level pair를 갱신한다.

1. old current `+0x1bc/+0x1be`를 `+0x1cc/+0x1ce`에 snapshot한다.
2. next `+0x4d8/+0x4da`를 `+0x1d0/+0x1d2`에 copy한다.
3. same next pair를 current `+0x1bc/+0x1be`에 write한다.
4. `+0x4f2 -= 100`을 signed 16-bit storage로 기록한다.

이는 `+0x4f2`가 recovered current coordinate fields의 commit guard임을 `정적 확정`한다. 뒤따르는
`FUN_00465010`/`FUN_00438460`의 interpolation/output semantics, pair의 coordinate unit와 map occupancy
effect는 미확인이다.

## 재현 fixture와 도구

```bash
node tools/imjinrok/extract-k01-class2-locomotion-bridge.mjs
node --test tools/imjinrok/k01-class2-locomotion-bridge.test.mjs
```

[`k01-class2-locomotion-bridge-vectors.json`](../../../analysis/fixtures/k01-class2-locomotion-bridge-vectors.json)은
other-selector raw hold, selector-1 third-reduction commit, negative-to-positive clamp와 selector-1 signed
negative input을 고정한다. fixture는 raw WORD와 recovered field pair만 입력으로 받고 product tick이나
clock을 사용하지 않는다.

## 미확인 경계와 다음 분석

- Direct scan은 명시한 x86 `MOV [base+disp32],r16` form을 `.text` 전체에서 닫았지만, 임의 pointer alias나
  다른 computed-address construction의 전역 부재를 증명하지 않는다.
- `+0x4ee/+0x4ea`의 source unit·사람용 속도 의미, coordinate unit, occupancy/collision and scheduler
  reachability는 `미확인`이다.
- 그러므로 source scheduler frequency까지 닫히기 전 product `movementSpeed`, clip FPS, simulation tick을
  원본 값으로 환산하거나 변경하지 않는다.
