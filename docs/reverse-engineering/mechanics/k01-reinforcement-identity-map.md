# K01 native 증원 정체·요청 좌표 매핑

Can original K01 reinforcement classes 12, 13, 14, and 82 receive distinct reusable project kinds and exact static identity/source-SPR bindings without claiming stats, combat behavior, or owner meaning?

## 범위와 상태

- 분석 상태: `정적 확정` — `0x0048a7ae → FUN_00488420`의 아홉 descriptor, 원본 타입
  카탈로그의 class 12·13·14·82 정체와 SPR, K01 원본 맵 헤더와 요청 좌표에 한정한다.
- 재현 상태: `재현 완료` — descriptor 순서·signed-WORD 합산·wrap·경계, 타입/SPR와 맵
  해시·헤더, stale·tampered 입력 거부를 독립 벡터로 검사한다.
- 구현 상태: `부분 이식` — 재사용 가능한 `japanese-samurai`, `japanese-turtle-tank`,
  `japanese-konishi` kind와 source asset을 추가해 K01 descriptor 9개 모두
  `exact-static-identity-source` binding으로 연결했다. 이 판정은 정체와 source SPR에만
  한정된다.

이 문서는 원본 descriptor의 **요청 좌표**와 identity/source binding을 확정한다. slot 선택,
OOB, exact create와 occupancy의 정적 근거는
[K01 native 증원 슬롯·정확 배치 정책](k01-reinforcement-placement-policy.md)에 분리한다.

## 원본 입력과 검증 도구

| 입력 | SHA-256 | 확인 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | native descriptor 호출·배열 |
| `analysis/generated/entity-type-catalog.json` | `485344664b278c97a4ceed0756832abadbf2a71bd4a997b117b85c336d620708` | class 이름·SPR slot/base/path |
| `analysis/generated/sprite-mapping-audit.json` | `b4cb258f5d8f3142704c1b9ce489b0bca4ae438dff4d598df264d6c97b52f28c` | 네 project kind→class·source SPR binding, K01 adapter, class 13·14·82 scoped core-state animation과 관련 source provenance |
| `apps/game-client/public/assets/themes/default/entities/japanese-gunner/gunj1.manifest.json` | `f156fab6f775bcf0df46a3f52356dcdbb86634447d9a674d6d9a39476178cae5` | audit가 가리키는 실제 conversion manifest, source `original/imjinrok2/char/gunj1.spr`, 선언 80 frames와 export 80개 |
| `apps/game-client/public/assets/themes/default/entities/japanese-samurai/horseswordj1.manifest.json` | `4d2ef829d95a1b90c2e666757f29c948369e9f27c6b2b11aab992f18030bf9c9` | `horseswordj1.spr`, 80×80, 선언·export 90 frames |
| `apps/game-client/public/assets/themes/default/entities/japanese-turtle-tank/ghosttankj.manifest.json` | `5d83ac52b270f0489bcde28e83896365c58468de340ffae3cebea64943bd7dc5` | `ghosttankj.spr`, 70×60, 선언·export 88 frames |
| `apps/game-client/public/assets/themes/default/entities/japanese-konishi/generalj11.manifest.json` | `a71d9b7392a4bc366a7346c90f174c5a7e2d919296ae26d892788c0f43ac7b54` | `generalj11.spr`, 140×108, 선언·export 49 frames |
| `apps/game-client/public/assets/themes/default/entities/japanese-konishi/generalj12.manifest.json` | `ca12c083547126db0342d6bb5d0e4a4c0cdc9b0241e5d4b54f623c4927e83b48` | class 82 idle `generalj12.spr`, 140×108, 선언·export 36 frames |
| `apps/game-client/public/assets/themes/default/entities/japanese-konishi/generalj13.manifest.json` | `831e5894dc43beeaf85c14c364be57be146f1a492d667a8c405856c20b79121a` | class 82 attack `generalj13.spr`, 140×108, 선언·export 54 frames |
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
| 13 | 일본 사무라이 | `char/horseswordj1.spr` | 117/0 | `f08dba883a1e5686383d05882d2c0f21c2bb52b6b2c2bb00e4d806f41ac9fdfa` | 80×80, 90 frames | `japanese-samurai` | exact static identity/source |
| 14 | 일본 귀갑차 | `char/ghosttankj.spr` | 104/0 | `34c3fdb3bcd79bc95f907aa7c381c11a374b30c8f7dd45f89f0e762a139f04ec` | 70×60, 88 frames | `japanese-turtle-tank` | exact static identity/source |
| 82 | 일본 고니시 | `char/generalj11.spr` | 165/0 | `eff3f8eb3a60c50ea6ac534d90e568bac415526a00f6ca2e287e00bfdf4bb03f` | 140×108, 49 frames | `japanese-konishi` | exact static identity/source |

원본 sprite pointer cell과 `0x004bc224` 기준 table index는 class 12
`0x004bc25c`/14, class 13 `0x004bc268`/17, class 14 `0x004bc234`/4,
class 82 `0x004bc328`/65다. focused extractor는 카탈로그의 cell과
`(cell-0x004bc224)/4`를 함께 검사한다.

focused 추출기는 sprite audit의 네 current project binding과 visual record를 읽어 각 kind가
class 12·13·14·82의 원본 이름과 고유 source SPR에 연결되고
`nameMatchesOriginal == true`, identity `static-proven`인지 검사한다. 관련 `themes.ts`,
`visuals.ts`, `content.ts`,
`scenarios.ts`, 타입 카탈로그와 audit generator의 현재 SHA-256이 artifact provenance와
다르면 실패한다. class 12의 core animation 판정은 [normal reinforcement batch](k01-normal-reinforcement-animation-batch.md)가 생산하며, class 13·14·82 focused extractor와 함께 현재 SHA-256 provenance를 검증한다.
여섯 conversion manifest를 먼저 parse해 source·dimensions·declared/exported
frame count·첫/마지막 index·base-frame 참조를 검사한 뒤 canonical manifest SHA와 audit의
logical path/SHA provenance를 검사한다. 구조가 맞아도 canonical bytes가 다르면 거부한다.
참조된 base-frame PNG의 존재와 고정 SHA-256도 실제 파일에서 검사한다.

| kind | base-frame PNG | SHA-256 |
| --- | --- | --- |
| `japanese-gunner` | `gunj1_0000.png` | `7d17b5bc01f785e7d2e8530db10c7fc0371b39d8558b7084676ea33296918003` |
| `japanese-samurai` | `horseswordj1_0000.png` | `9294f923426de05f81e5d18be55bbe8deb31d96282e70469abe3382088ff4d02` |
| `japanese-turtle-tank` | `ghosttankj_0000.png` | `104517e7249550c719ccda7473720c2384bc217f56c71543894e8ace55dcf354` |
| `japanese-konishi` | `generalj11_0000.png` | `9b94fe4900a4343de2842c60caae2575e1e949bebba3e72bbdfcfc819a1caeaf` |

visual은 모두 `mixed`다. class 13 `japanese-samurai`의 animation state mapping은 별도
[K01 일본 사무라이 파일럿](k01-samurai-animation-pilot.md)이 확정한
`static-proven-core-state-frames`다. class 14 `japanese-turtle-tank`도
[K01 일본 귀갑차 파일럿](k01-turtle-tank-animation-pilot.md)이 상태 8/1/4 grid
frame·mirror와 intermediate 16-ring raw turn position, creation-default transient destruction
path를 정적 확정했다. generic Facing과 project-side transient destruction/tick mapping은 계속
미확정이다. class 82는
[K01 일본 고니시 파일럿](k01-konishi-animation-pilot.md)이 상태 8/1/4/7의
세 SPR slot과 grid frame·mirror를 확정했다. class 12 animation은 이 문서 범위에서
`unverified`다. identity/source binding 판정 자체는 계속 class 정체와 primary source
SPR 파일에만 한정된다.

아홉 record 기준 결과는 다음과 같다.

- 9/9: class 12·13·14·82, exact static identity/source binding
- 0/9: proxy identity
- 9/9: K01 원본 요청 좌표 exact
- 배치: slot·OOB·exact create·occupancy는 [별도 배치 정책 문서](k01-reinforcement-placement-policy.md)에서 정적 확정·재현
- 이 문서만으로 확정하지 않음: 전투 수치·행동·raw owner 의미
- class 13 record 2/9: 상태 8/1/4/7 frame·8방향·mirror 확정·이식
- class 14 record 3/9: 상태 8/1/4 grid frame·mirror, intermediate 16-ring과 creation-default
  transient destruction은 확정; generic Facing·project-side tick mapping은 미이식
- class 82 record 1/9: 상태 8/1/4/7의 세 SPR slot·frame·8방향·mirror 확정·이식

### 프로젝트 gameplay·표시 적응

| kind | 복사한 프로젝트 gameplay | source size | 잠정 pivot |
| --- | --- | --- | --- |
| `japanese-samurai` | `japanese-swordsman`: infantry, HP 55, speed 4, damage 9/range 1.5/cooldown 18/aggro 7, 1×1 footprint | 80×80 | `(40,72)` |
| `japanese-turtle-tank` | `japanese-swordsman`과 동일 | 70×60 | `(35,52)` |
| `japanese-konishi` | `japanese-gunner`: infantry, HP 38, speed 3.8, damage 7/range 5.5/cooldown 24/aggro 8, 1×1 footprint | 140×108 | `(70,100)` |

actions, population, sight/minimap 값과 selection/hit/render radius도 각각 위 기존 kind에서 그대로
복사했다. `portraitGlyph`, `portraitColor`, `groupBorderColor` 역시 기존 kind에서 가져온 UI
fallback이다. 이 표의 category·stats·collision radius·combat behavior, UI fallback과
`srcPxPerWu=32`, pivot은 현재 플레이를 보존하기 위한 프로젝트 적응이며 원본 사실이 아니다.

## isolated K01 adapter와 적응 경계

`packages/shared/src/scenarios.ts`의 `k01ReinforcementAdapter`는 각 record에 원본 class,
raw owner WORD, offset, project kind와 `exact-static-identity-source` 상태를 함께 둔다.
기존 `StartingUnitDefinition[]`은 이 K01 전용 표에서 파생하므로 generic 타입에 원본 전용
필드를 추가하지 않았다.

다음은 프로젝트 적응이며 원본 정적 사실이 아니다.

- raw owner WORD `1`을 `playerId: "cpu-1"`에 연결
- `build-beacon` objective completion으로 event를 시작
- 생성 뒤 `(10,10)` attack-move를 부여
- class 13·14의 category·actions·stats·combat·footprint·collision 값을 현행
  `japanese-swordsman`에서 복사
- class 82의 같은 프로젝트 값을 현행 `japanese-gunner`에서 복사
- 신규 세 visual의 `srcPxPerWu`, render size, pivot과 잠정 FPS

K0120 script에는 spawn command가 없고 원본 native code가 직접 생성한다. 현재 K01 action만
`placementPolicy: "requested-position-exact"` opt-in으로 raw `origin+offset`의 in-bounds 요청을
terrain/passability·occupancy·open-point 탐색 없이 그대로 만든다. 원본 1,200-slot pool,
generation 및 explicit occupancy-owner grid는 포팅하지 않았으므로 이식 상태는 `부분 이식`이다.
상세 근거와 차이는 [배치 정책](k01-reinforcement-placement-policy.md)을 따른다.

## 재현 벡터와 남은 gate

- 정상: 아홉 descriptor·요청 좌표, 네 class 정체/primary SPR·pointer cell/table index,
  class 82 보조 SPR 둘, 60×60 맵과 9/9 exact static identity/source·0 proxy,
  여섯 manifest 전체 export
- 경계: signed-WORD 합 `0x7fff+1→-0x8000`, 음수 요청, map 하한/상한
- 실패: terminator 누락, field 폭 위반, catalog/map/SPR 변조, descriptor 증거 변조,
  신규 project binding·sprite audit source provenance 변조, class 82 보조 SPR/manifest 변조,
  audit SHA를 변조본에 맞춘 manifest
  구조 불일치, 구조가 유효한 canonical manifest byte 변조, base-frame asset 누락·고정 PNG
  SHA 불일치

남은 integration gate는 class 12·14·82의 나머지 animation state·방향, 네 class의
stats·category·collision·전투 행동, raw owner의 사람용 의미와 원본 1,200-slot/generation/
occupancy-owner 저장 모델 및 이후 movement다. class 13도 exact timing·pivot·사망 lifetime은 미확정이다.
generic superset는 유지하며 이들이 별도 정적 확정·재현되기 전에는 K01 adapter를 원본 전체
동작으로 승격하지 않는다.
