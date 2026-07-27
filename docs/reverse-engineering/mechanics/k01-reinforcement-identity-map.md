# K01 native 증원 정체·요청 좌표 매핑

For K01, how do the native reinforcement descriptor classes and requested map coordinates map into the project while keeping static-proven original facts separate from project adaptations?

## 범위와 상태

- 분석 상태: `정적 확정` — `0x0048a7ae → FUN_00488420`의 아홉 descriptor, 원본 타입
  카탈로그의 class 12·13·14·82 정체와 SPR, K01 원본 맵 헤더와 요청 좌표에 한정한다.
- 재현 상태: `재현 완료` — descriptor 순서·signed-WORD 합산·wrap·경계, 타입/SPR와 맵
  해시·헤더, stale·tampered 입력 거부를 독립 벡터로 검사한다.
- 구현 상태: `부분 이식` — K01 전용 opt-in adapter에서 class 12 세 개만 프로젝트의
  `exact-static-identity-source` binding으로 고쳤다. 이는 정체와 source SPR에만
  한정되며, 나머지 여섯 개는 명시적 proxy다.

generic simulation의 생성·충돌·배치 규칙은 변경하지 않았다. 이 문서는 원본 descriptor의
**요청 좌표**를 확정하지만 실제 생성 후 최종 위치를 확정하지 않는다.

## 원본 입력과 검증 도구

| 입력 | SHA-256 | 확인 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | native descriptor 호출·배열 |
| `analysis/generated/entity-type-catalog.json` | `572044d9eec6162689154f3625c7572f27d7ee9030d4e4f9f51151b6a88f8745` | class 이름·SPR slot/base/path |
| `analysis/generated/sprite-mapping-audit.json` | `106df3ac933d5963ffd1893c0fbaa9cc9b8114eebe1563a6033cf3591b3b122e` | 프로젝트 `japanese-gunner`→class 12·`gunj1.spr` binding, animation mapping 미확정, 관련 source provenance |
| `apps/game-client/public/assets/themes/default/entities/japanese-gunner/gunj1.manifest.json` | `f156fab6f775bcf0df46a3f52356dcdbb86634447d9a674d6d9a39476178cae5` | audit가 가리키는 실제 conversion manifest, source `original/imjinrok2/char/gunj1.spr`, 선언 80 frames와 export 80개 |
| `original/imjinrok2/stagemap/k01.map` | `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb` | 1,097,100 bytes, 60×60, view `(13,8)`, source spawn `(6,6)` |

독립 추출기는
[`extract-k01-reinforcement-identity-map.mjs`](../../../tools/imjinrok/extract-k01-reinforcement-identity-map.mjs),
테스트는
[`k01-reinforcement-identity-map.test.mjs`](../../../tools/imjinrok/k01-reinforcement-identity-map.test.mjs)다.
기존
[K01 봉화대/K0120 추출기](k01-beacon-k0120-trigger.md)가 EXE의 함수·call edge·byte와
stack descriptor를 검증한 결과를 직접 소비하고, `map-codec.mjs`와 SPR parser를 재사용한다.

## 원본 descriptor와 요청 좌표

`0x0048a7ae`는 origin `(55,53)`, raw argument `0x10`과 다음 signed-WORD 배열을
`FUN_00488420`에 전달한다.

| 순서 | class | raw owner WORD | `(dx,dy)` | K01 요청 `(x,y)` | 범위 |
| ---: | ---: | ---: | --- | --- | --- |
| 0 | 13 | 1 | `(-2,-2)` | `(53,51)` | 안 |
| 1 | 82 | 1 | `(0,-2)` | `(55,51)` | 안 |
| 2 | 13 | 1 | `(2,-2)` | `(57,51)` | 안 |
| 3 | 14 | 1 | `(-2,0)` | `(53,53)` | 안 |
| 4 | 14 | 1 | `(0,0)` | `(55,53)` | 안 |
| 5 | 14 | 1 | `(2,0)` | `(57,53)` | 안 |
| 6 | 12 | 1 | `(-2,2)` | `(53,55)` | 안 |
| 7 | 12 | 1 | `(0,2)` | `(55,55)` | 안 |
| 8 | 12 | 1 | `(2,2)` | `(57,55)` | 안 |

뒤에는 class `0` terminator가 온다. 좌표 합은 원본 helper처럼 low signed WORD로 복원하며,
음수 또는 map width/height 이상이면 그 descriptor를 건너뛴다. 위 아홉 요청은 K01 60×60
범위 안이다. 프로젝트 K01 adapter가 동일한 `(x,y)` origin과 offset을 직접 사용하며,
focused report와 adapter의 아홉 record를 테스트에서 직접 대조한다. 이 좁은 대조는 다른 맵의
축 의미나 generic coordinate parity를 확정하지 않는다.

## 원본 정체와 프로젝트 binding

| class | 원본 정체 | 원본 SPR | slot/base | SPR SHA-256 | 헤더 | 프로젝트 kind | 판정 |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 12 | 일본 조총병 | `char/gunj1.spr` | 114/0 | `e35c3dddfc4860d3e8ccbb7d86ecb006b11230e269d04091dcfa320dc116a7a8` | 60×60, 80 frames | `japanese-gunner` | exact static identity/source |
| 13 | 일본 사무라이 | `char/horseswordj1.spr` | 117/0 | `f08dba883a1e5686383d05882d2c0f21c2bb52b6b2c2bb00e4d806f41ac9fdfa` | 80×80, 90 frames | `japanese-swordsman` | proxy |
| 14 | 일본 귀갑차 | `char/ghosttankj.spr` | 104/0 | `34c3fdb3bcd79bc95f907aa7c381c11a374b30c8f7dd45f89f0e762a139f04ec` | 70×60, 88 frames | `japanese-swordsman` | proxy |
| 82 | 일본 고니시 | `char/generalj11.spr` | 165/0 | `eff3f8eb3a60c50ea6ac534d90e568bac415526a00f6ca2e287e00bfdf4bb03f` | 140×108, 49 frames | `japanese-gunner` | proxy |

focused 추출기는 sprite audit의 current project binding과 visual record도 읽어
`japanese-gunner`가 class 12·원본 이름 `일본 조총병`·
`original/imjinrok2/char/gunj1.spr`와 연결되고 `nameMatchesOriginal == true`,
identity `static-proven`임을 검사한다. 관련 `themes.ts`, `visuals.ts`, `content.ts`,
`scenarios.ts`, 타입 카탈로그와 audit generator의 현재 SHA-256이 artifact provenance와
다르면 실패한다. audit의 conversion manifest logical path·SHA도 실제 파일과 대조하고,
manifest의 source·frame count·exported frame count가 각각 `gunj1.spr`·80·80인지 검사한다.
visual은 `mixed`, animation state mapping은 `unverified`여야 한다.
따라서 이 binding은 class 정체와 source SPR 파일에만 정적으로 연결되어 있다. 이 사실만으로
현재 animation state, 방향, 전투 행동이나 stats가 원본과 같다고 판정하지 않는다.
`japanese-swordsman`은 실제로 class 3 일본 창병과 `swordj.spr`다. 따라서 class 13·14에
사용하는 것은 정확한 정체가 아니다. class 82 역시 프로젝트에 고니시 kind/asset이 없어
`japanese-gunner` proxy로 남는다.

아홉 record 기준 결과는 다음과 같다.

- 3/9: class 12 `japanese-gunner`, exact static identity/source binding
- 6/9: class 13·14·82 proxy
- 9/9: K01 원본 요청 좌표 exact
- 0/9: 이 문서만으로 최종 배치·전투 수치·행동·animation parity를 확정

## isolated K01 adapter와 적응 경계

`packages/shared/src/scenarios.ts`의 `k01ReinforcementAdapter`는 각 record에 원본 class,
raw owner WORD, offset, project kind와 `exact-static-identity-source`/`proxy` 상태를 함께 둔다.
기존 `StartingUnitDefinition[]`은 이 K01 전용 표에서 파생하므로 generic 타입에 원본 전용
필드를 추가하지 않았다.

다음은 프로젝트 적응이며 원본 정적 사실이 아니다.

- raw owner WORD `1`을 `playerId: "cpu-1"`에 연결
- `build-beacon` objective completion으로 event를 시작
- 생성 뒤 `(10,10)` attack-move를 부여
- class 13·14·82를 기존 kind로 대체

K0120 script에는 spawn command가 없고 원본 native code가 직접 생성한다. 현재 simulation은
`origin+offset` 요청을 map에 clamp한 뒤 `findOpenSpawnPoint`를 호출한다. 따라서 점유·경계
상태에 따라 최종 위치가 이동하거나 생성이 생략될 수 있다. 테스트 fixture에서 열린 요청 칸에
그대로 놓이는 결과는 generic runtime 동작의 예일 뿐 원본 최종 배치 parity 증거가 아니다.

## 재현 벡터와 남은 gate

- 정상: 아홉 descriptor·요청 좌표, 네 class 정체/SPR, 60×60 맵과 3/9 exact static
  identity/source·6/9 proxy
- 경계: signed-WORD 합 `0x7fff+1→-0x8000`, 음수 요청, map 하한/상한
- 실패: terminator 누락, field 폭 위반, catalog/map/SPR 변조, descriptor 증거 변조,
  sprite audit binding·source provenance 변조, conversion manifest 변조

남은 integration gate는 class 13·14·82의 정확한 프로젝트 kind/asset/animation, class 12를
포함한 전투 수치·행동, raw owner의 사람용 의미와 원본 생성 실패/점유 정책의 프로젝트 identity다.
generic superset는 유지하며 이들이 별도 정적 확정·재현되기 전에는 K01 adapter를 원본 전체
동작으로 승격하지 않는다.
