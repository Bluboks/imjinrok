# K01 시작 유닛 class 12·13 binding

질문: **원본 `k01.map`의 owner 1 class 12·13 시작 레코드 여섯 개를, 이미 이식된
`japanese-gunner`·`japanese-samurai` 핵심 상태 프레임에만 정확히 연결할 수 있는가?**

## 상태와 범위

- 분석 상태: `정적 확정` — 원본 K01 map entity 배열의 active owner 1 class 12·13 record,
  타입 카탈로그의 class 정체·primary SPR, 그리고 각 기존 animation pilot의 범위에 한정한다.
- 재현 상태: `재현 완료` — map record 수·좌표·class→project kind, canonical catalog hash와
  변조된 binding/catalog 거부를 focused vector로 검사한다.
- 구현 상태: `부분 이식` — 여섯 시작 record가 class 12→`japanese-gunner`, class 13→
  `japanese-samurai`를 선택한다. 이 변경은 원본 gameplay·stats·owner 의미를 이식하지 않는다.

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
| 12 | 일본 조총병 | `char/gunj1.spr` | `japanese-gunner` | [normal reinforcement batch](k01-normal-reinforcement-animation-batch.md)의 상태 8/1/4/7 |
| 13 | 일본 사무라이 | `char/horseswordj1.spr` | `japanese-samurai` | [samurai pilot](k01-samurai-animation-pilot.md)의 상태 8/1/4/7 |

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
않는다. 따라서 class 2 조선 창병, class 4 조선 궁수, class 7 조선 농부도 각각
`swordsman`·`archer`·`villager`의 `exact-static-identity-source`다. class 7은 공유
`farmerk.spr`만으로 정체를 고른 것이 아니라 canonical catalog의 class 7 `조선 농부`와 K01 map의
owner 0 class-7 record `(7,6)`, `(8,6)`를 focused vector에서 함께 검사한다.

일반 `StartingUnitDefinition[]`은 이 K01 전용 표에서 파생하므로 원본 전용 필드를 generic scenario
타입에 추가하지 않는다.

독립 검증은 다음을 수행한다.

```bash
node --test tools/imjinrok/k01-opening-unit-bindings.test.mjs
```

- 정상: 여섯 record 수, 정확한 좌표와 class 12→gunner/class 13→samurai mapping
- 실패: 하나라도 project kind를 바꾼 binding, canonical catalog byte 변조

## 남은 우선순위와 경계

이 여섯 binding으로 K01 전체 unit mapping 또는 original simulation parity를 주장하지 않는다.

1. class 31 일본 농부와 class 16 일본 무녀는 현재 `japanese-gunner` proxy다. 고유 kind·frame
   mapping을 만들지 않는다.
2. local class 11 조선 승병과 genuinely mismatched K01 start building class 48/49/51, 58/60,
   63은 proxy다. 자원·state·project kind를
   시각적 유사성으로 교체하지 않는다.
3. class 2는 일반 이동만 정적 확정·이식했고, idle·attack과 state 2 project policy는 별도다.
   class 3 일본 창병과 class 4 조선 궁수·class 7 조선 농부는 identity/source binding만
   `exact-static-identity-source`이며 remaining animation states는 current audit에서 미확정이다.

class 12 state 2 policy, class 12·13의 tick→FPS·pivot, 모든 unit stats·combat behavior, raw owner의
사람용 의미와 이후 movement/placement는 계속 별도 근거가 필요하다.
