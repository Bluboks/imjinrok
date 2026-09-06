# K01 opening building footprint anchor

## 질문과 결론

K01 opening building의 위치 `(x,y)`는 sprite pixel 크기나 top-left가 아니라, 원본 type record의
논리 footprint 중심 anchor다. type writer가 저장한 `+0x14`/`+0x16` WORD의 low BYTE를 creator가 runtime
`+0x1e3`/`+0x1e4`로 복사하고, occupancy writer는 다음 식으로 각 cell을 만든다.

```text
cellX = x - floor(width / 2) + column
cellY = y - floor(height / 2) + row
column = 0 .. width-1, row = 0 .. height-1
```

따라서 class 49 조선 본영 `(5,4)`의 `3×3` 점유는 `x=4..6, y=3..5`의 9 cells다. `(7,6)`의
class 7 조선 농부는 `1×1`이므로 `(7,6)` 하나만 점유하며 본영의 `3×3`에 포함되지 않는다.
class 7은 footprint rounding/충돌 여부를 제어하는 source-created 1×1 비교 벡터이지 opening
building class가 아니다. 클래스 52 조선 봉화대도 같은 type initializer의 argument 8/9에서
`3×3` logical footprint가 정적으로 확인되지만 K01 map opening record가 아니며, 동적 건설
경로의 source class로 별도 분류한다.

짝수 extent에서는 half-cell을 만들지 않는다. `2×2` anchor `(2,2)`는 `x=1..2, y=1..2`이고,
`3×2` anchor `(2,2)`는 `x=1..3, y=1..2`다. 모든 cell은 map bounds를 따로 검사해 OOB면
skip하고, 유효 cell에는 **mask WORD OR 후 owner-grid WORD store** 순서로 기록한다. 이 mode는
기존 owner를 읽어 거부하지 않으므로 overwrite는 writer ordering 결과일 뿐 collision admission
정책이 아니다.

## 분석·재현·구현 상태

- 분석 상태: `정적 확정` — canonical EXE, generated seed/function/reference, K01 map과 type catalog를
  함께 hash-bound하고, type arguments→runtime fields→map loader→action-1 writer call chain을 닫았다.
- 재현 상태: `재현 완료` — 9개 fixture vector가 odd/even/mixed extent, map edge/OOB, existing-owner
  overwrite, active gate, footprint-copy 이전 경계를 검사한다.
- 구현 상태: `bounded-source-footprint-integration` — K01 source profile이 확인된 building class의
  logical extent와 source-center anchor를 shared resolver로 선택하며, placement·collision·range·build
  work·client geometry가 이 bounded 계약을 소비한다. 원본 raw owner overwrite/lifecycle semantics와
  미확정 native occupancy 정책은 이 통합에서 바꾸지 않는다.
- 동적 class 52 건설 완료 admission은 `3×3` source footprint를 쓰기 전에 semantic unit의 현재
  effective occupancy와 source owner cell을 대조한다. 현재 semantic blocker와 미확정/unknown owner는
  그대로 admission을 거부하고, live semantic unit이 현재 cell을 더 이상 점유하지 않는 것으로 확인된
  stale owner만 복사본에서 제거한다. 이는 의도적인 construction-time adaptation이며 전체 source
  movement lifecycle 동기화를 주장하지 않는다.

재현 entry point는 `tools/imjinrok/extract-k01-opening-footprint-anchor.mjs`, fixture는
`analysis/fixtures/k01-opening-footprint-anchor-vectors.json`, test는
`tools/imjinrok/k01-opening-footprint-anchor.test.mjs`다.

## source와 data inventory

| 입력 | SHA-256 | 확인 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | type writer, creator, map loader/wrapper, action dispatcher, occupancy writer |
| `analysis/generated/imjinrok2/seeds.json` | `386b0f4e86c3376f34fe2b50fedb7e45b762c30784d4ebcc0387aa6f431811b2` | type initializer arguments 8/9와 call instruction text |
| `analysis/generated/entity-type-catalog.json` | `4cce8fd314848556433c5fd98263893919049b6be6a7a7e75988f628079c54da` | class identity/name만 사용; sprite pixel dimensions는 footprint로 해석하지 않음 |
| `original/imjinrok2/stagemap/k01.map` | `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb` | 60×60 map, source type/x/y/owner arrays와 15개 opening building records |

함수 본체 계약은 다음과 같다. instruction count와 instruction SHA-256도 extractor가 검사한다.

| 함수 | 범위 | instruction | 역할 |
| --- | --- | ---: | --- |
| `FUN_0045bd00` | `0x0045bd00-0x0045bef8` | 103 | type argument 8→type WORD `+0x14`, argument 9→type WORD `+0x16` |
| `FUN_0048dbe0` | `0x0048dbe0-0x0048dda9` | 147 | 0..799 source entity scan, center bounds/type gate, wrapper call |
| `FUN_00483c50` | `0x00483c50-0x00483c9f` | 26 | source index/owner/x/y/type를 pool record에 전달, generation 증가 |
| `FUN_00437650` | `0x00437650-0x00438025` | 539 | `0x558` record zero-init, slot/generation/x/y, footprint copy, dispatcher call |
| `FUN_0043c9c0` | `0x0043c9c0-0x0043d35f` | 684 | `+0x1b0` action dispatcher; action 1 clear/helper/writer edge |
| `FUN_0043b2d0` | `0x0043b2d0-0x0043b4cd` | 157 | predecessor owner/mask clear helper |
| `FUN_0043ad30` | `0x0043ad30-0x0043b2c0` | 399 | active-gated footprint loop, OOB skip, mask/owner writes |

주요 storage는 `0x00ae27e4` WORD mask grid와 `0x00ac2da4` WORD owner grid다. 후자는
map raw owner/player word가 아니라 runtime `+0x1b6` slot을 저장한다. runtime `+0x1b8` generation은
별도 record field다.

## opening records와 type footprint

아래 표의 `cells`는 center anchor를 적용한 논리 범위다. `x=a..b, y=c..d`는 그 직사각형의 모든
정수 cell을 뜻한다. raw owner는 map source word 그대로이며 player 의미를 부여하지 않는다.

| source index | class / 원본 이름 | raw owner | center | footprint | occupied cells |
| ---: | --- | ---: | --- | ---: | --- |
| 9 | 49 / 조선 본영 | 0 | `(5,4)` | 3×3 | `x=4..6, y=3..5` |
| 10 | 58 / 일본 본영 | 1 | `(7,57)` | 3×3 | `x=6..8, y=56..58` |
| 11 | 58 / 일본 본영 | 1 | `(56,6)` | 3×3 | `x=55..57, y=5..7` |
| 12 | 48 / 조선 방앗간 | 0 | `(11,5)` | 3×3 | `x=10..12, y=4..6` |
| 13 | 50 / 조선 훈련소 | 0 | `(13,10)` | 3×3 | `x=12..14, y=9..11` |
| 14 | 60 / 일본 훈련소 | 1 | `(6,50)` | 3×3 | `x=5..7, y=49..51` |
| 15 | 62 / 일본 관측소 | 1 | `(12,57)` | 3×3 | `x=11..13, y=56..58` |
| 16 | 57 / 일본 시장 | 1 | `(12,52)` | 3×2 | `x=11..13, y=51..52` |
| 17 | 57 / 일본 시장 | 1 | `(51,5)` | 3×2 | `x=50..52, y=4..5` |
| 18 | 60 / 일본 훈련소 | 1 | `(55,11)` | 3×3 | `x=54..56, y=10..12` |
| 26 | 51 / 조선 훈련도감 | 0 | `(5,8)` | 3×3 | `x=4..6, y=7..9` |
| 39 | 63 / 일본 망루 | 1 | `(18,49)` | 2×2 | `x=17..18, y=48..49` |
| 40 | 63 / 일본 망루 | 1 | `(44,5)` | 2×2 | `x=43..44, y=4..5` |
| 42 | 63 / 일본 망루 | 1 | `(32,40)` | 2×2 | `x=31..32, y=39..40` |
| 43 | 63 / 일본 망루 | 1 | `(35,29)` | 2×2 | `x=34..35, y=28..29` |

따라서 기존 opening-building identity 문서의 11 records에 포함되지 않던 class 50, 57, 62도
이 footprint packet에서는 source map에 실제 존재하는 세 class(및 class 57 두 records)를 포함한다.
class 48/49/50/51/52/58/60/62는 3×3, class 57은 3×2, class 63은 2×2다. class 52는
opening records 표에는 포함하지 않고 동적 건설 source class로만 추출한다.

## 생성 순서와 경계

1. `FUN_0048dbe0`는 source index 0..799를 읽고 type `>1` 및 center coordinate bounds를 먼저 검사한다.
2. 유효 record에서 raw owner, `100`, `1`, y, x, source index, type을 push해 `FUN_00483c50`을 호출한다.
3. wrapper는 global generation WORD를 증가시키고 source index를 runtime `+0x1b6`으로 연결한다.
   creator는 record 0x558 bytes를 zero-fill한 뒤 signed x/y와 type footprint를 저장한다.
4. creator의 `0x0043801a → FUN_0043c9c0` call은 initial action `+0x1b0=1`을 dispatcher로 보낸다.
   action 1은 `0x0043b2d0` clear, movement/helper edge, `0x0043ad30` writer 순서다.
5. writer는 runtime width/height를 읽어 각 cell을 bounds-check한다. valid cell은 mask OR 후
   owner grid에 slot을 store하고 `+0x40c` occupancy-ready side effect를 남긴다.

map loader의 center bounds gate와 footprint writer의 per-cell OOB skip은 다른 경계다. 예를 들어
loader가 생성한 center `(0,0)`의 3×3 record는 writer에서 음수 cell을 skip하고 `(0,0),(1,0),(0,1),(1,1)`만
쓴다. `+0x1f0 == 0`이면 writer는 early return한다. footprint copy 이전에는 writer를 호출하는 opening
sequence가 없지만 fixture의 pre-copy vector를 통해 “아직 extent를 복사하지 않은 record는 write하지
않는다”는 ordering gate를 고정한다.

## 재현과 남은 범위

```bash
pnpm imjinrok:extract-k01-opening-footprint-anchor
node --test tools/imjinrok/k01-opening-footprint-anchor.test.mjs
```

이 결과는 논리 occupancy footprint와 source slot ordering만 닫는다. sprite pixel width/height,
pivot, 건설/반파/overlay frame, timing, stats, raw owner의 사람용 player 의미, alternate/non-mobile
writer branch와 전체 scheduler serialization은 이 packet에서 확정하지 않는다.
