# K01 시작 유닛 class 7·11·12·13·16·31 binding

질문: **원본 `k01.map`의 class 7·11·12·13·16·31 시작 레코드를 해당 고유 project kind와
정적으로 확정한 핵심 상태 프레임에만 정확히 연결할 수 있는가?**

## 상태와 범위

- 분석 상태: `정적 확정` — canonical EXE/catalog/map/SPR와 class switch·initializer helper를
  함께 재검증한 class 7·11·16 및 class 31의 확인된 core state 범위, 그리고 기존 class 12·13 범위에 한정한다.
- 재현 상태: `재현 완료` — class 7·11·16·31의 slot/frame/direction/mirror, map 좌표와 canonical
  function·initializer·map·SPR 변조 거부 vector를 검사한다.
- 구현 상태: `부분 이식` — class 7은 `villager`, class 11은 `korean-monk`, class 16은
  `japanese-shrine-maiden`, class 31은 `japanese-farmer` 고유 visual을 선택한다. gameplay·stats·owner 의미는 이식하지 않는다.

## 원본과 정체 근거

| 입력 | SHA-256 | 확인 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | type writer·name copy·sprite pointer table의 canonical source |
| `analysis/generated/entity-type-catalog.json` | `572044d9eec6162689154f3625c7572f27d7ee9030d4e4f9f51151b6a88f8745` | class 12·13 원본 이름·primary SPR |
| `original/imjinrok2/stagemap/k01.map` | `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb` | 60×60 K01 map과 source entity arrays |

map header의 source entity 배열은 type/x/y/owner signed-WORD 배열이며 각각 `+0xa4`,
`+0x6e4`, `+0xd24`, `+0x1364`에 있다. active 판정은 type `>1` 및 map bounds다. 이 binding은
그 중 owner `1`, class `12` 또는 `13`인 record만 대상으로 한다.

타입 카탈로그가 정적으로 확정한 항목은 다음과 같다.

| class | 원본 이름 | primary SPR | 기존 project kind | core-frame 근거 |
| ---: | --- | --- | --- | --- |
| 7 | 조선 농부 | `char/farmerk.spr` | `villager` | [Korean farmer core frames](k01-korean-farmer-core-frames.md)의 source-created `+0x47a==0` 상태 8/1/7 |
| 12 | 일본 조총병 | `char/gunj1.spr` | `japanese-gunner` | [normal reinforcement batch](k01-normal-reinforcement-animation-batch.md)의 상태 8/1/4/7 |
| 13 | 일본 사무라이 | `char/horseswordj1.spr` | `japanese-samurai` | [samurai pilot](k01-samurai-animation-pilot.md)의 상태 8/1/4/7 |
| 11 | 조선 승병 | `char/budak.spr` | `korean-monk` | `0x0042a520..0x0042a5d4`, 상태 8/1/4/7 |
| 16 | 일본 무녀 | `char/advbudaj.spr` | `japanese-shrine-maiden` | `0x0042a5d5..0x0042a689`, 상태 8/1/4/7 |
| 31 | 일본 농부 | `char/farmerj.spr` | `japanese-farmer` | [Japanese farmer frames](k01-japanese-farmer-frames.md)의 source-created `+0x47a==0` 상태 8/1/7 |

## 재현 벡터와 구현 binding

K01 owner 1의 해당 active record는 정확히 여섯 개다.

| class | source `(x,y)` | project kind | identity mapping |
| ---: | --- | --- | --- |
| 13 | `(20,29)` | `japanese-samurai` | `exact-static-identity-source` |
| 13 | `(36,26)` | `japanese-samurai` | `exact-static-identity-source` |
| 12 | `(38,6)` | `japanese-gunner` | `exact-static-identity-source` |
| 12 | `(50,8)` | `japanese-gunner` | `exact-static-identity-source` |
| 13 | `(31,44)` | `japanese-samurai` | `exact-static-identity-source` |
| 12 | `(38,27)` | `japanese-gunner` | `exact-static-identity-source` |

`packages/shared/src/scenarios.ts`의 `k01SourceOpeningAdapter`는 local owner `0`와 enemy owner
`1` record 모두에 original class, raw owner, offset, project kind, identity status를 보존한다.
`identityMapping`은 class→project kind→source identity만 기록하며 animation completeness를 뜻하지
않는다. class 2 조선 창병, class 3 일본 창병, class 4 조선 궁수는 상태 8/1/4/7의 핵심
frame·방향·mirror까지 정적 확정·이식했지만, 상태 2는 정적으로 복원한 alternate movement를
프로젝트에 매핑하지 않고 격리한다. class 7 조선 농부와 class 31 일본 농부는 source-created
`+0x47a==0` 상태 8/1/7 core frame·direction·mirror까지 정적 확정·이식했다. class 7은 공유
`farmerk.spr`만으로 정체를 고른 것이 아니라 canonical catalog의 class 7 `조선 농부`와 K01 map의
owner 0 class-7 record `(7,6)`, `(8,6)`를 focused vector에서 함께 검사한다.

일반 `StartingUnitDefinition[]`은 이 K01 전용 표에서 파생하므로 원본 전용 필드를 generic scenario
타입에 추가하지 않는다.

class 11의 `budak.spr` SHA-256은
`310a88a083316f3f5172cec3d5df667c6eb76648830bf153ef625fa276da3e17` (65×50, 140 frames)이고,
class 16의 `advbudaj.spr` SHA-256은
`18399ae5b01edc38e58127c57d06f1463d0f5b86a1ded99970d8bb70b8c27754` (50×50, 300 frames)이다.
공통 normal direction은 raw `[1,5,4,20,16,80,64,65]`에서 project facing
`s,sw,w,nw,n,ne,e,se`, base index `0,1,2,3,2,1,0,4`, 북·북동·동 mirror로 복원했다.
class 11은 idle/move/attack/death가 각각 `100/0/50/40` (stride `8/8/10/0`), class 16은
`120/0/60/40` (stride `8/8/10/0`)이다. FPS와 pivot은 명시적인 프로젝트 적응이다.

독립 검증은 다음을 수행한다.

```bash
node --test tools/imjinrok/k01-opening-unit-bindings.test.mjs tools/imjinrok/k01-special-unit-animations.test.mjs
```

- 정상: 여섯 record 수, 정확한 좌표와 class 12→gunner/class 13→samurai mapping
- 실패: 하나라도 project kind를 바꾼 binding, canonical catalog byte 변조

## 남은 우선순위와 경계

이 시작 binding으로 K01 전체 unit mapping 또는 original simulation parity를 주장하지 않는다.

1. class 7 조선 농부와 class 31 일본 농부는 state 4와 `+0x47a != 0` branch, FPS·pivot·stats·behavior가
   계속 미확인이다.
2. class 2/3/4 state 2의 project policy를 결정한다. alternate movement frame은 정적 확정했지만
   제품에 매핑하지 않았다.
3. K01 시작 building class 48/49/51/58/60/63의 exact identity/source/slot/catalog base-frame-only
   범위는 [opening building binding](k01-opening-building-bindings.md)에서 정적 확정·이식했다.
   class 49의 별도 body-state 범위를 제외한 construction/damaged/overlay/timing/pivot/stats/commands/
   behavior와 raw owner 의미는 이 unit binding 문서 밖의 미확정 범위다.

class 12 state 2 policy, class 11·12·13·16의 tick→FPS·pivot, 모든 unit stats·combat behavior, raw owner의
사람용 의미와 이후 movement/placement는 계속 별도 근거가 필요하다.
