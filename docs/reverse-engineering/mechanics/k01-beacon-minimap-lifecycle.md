# K01 봉화대와 HUD 컴팩트 맵 수명주기

## 질문과 판정

질문: **K01에서 완성된 봉화대가 없으면 미니맵을 disable하고, 하나 이상이면 enable하며, 마지막 완성 봉화대가 파괴·제거되면 다시 disable하는 원본 수명주기가 있는가?**

전체 질문의 판정은 **`미확인`** 이다. `FUN_004475a0`의 실제 컴팩트 맵 surface draw 경로는 현재
player record의 raw `WORD`와 `WORD[0x00bcbd84]`로 진입을 판정하고, `0x9` 입력 경로가 별도의
mode/redraw state를 쓴다. 그러나 그 두 primary gate operand의 producer는 아직 닫히지 않았으므로,
봉화대 completion/destruction이 computed/alias write로 도달하는지를 배제할 수 없다.

대신 **`WORD[0x008438dc]` 자체가 live completed-beacon count gate라는 가설은 `반증됨`** 이다.
이 one-shot flag는 renderer root나 복원한 control/draw anchor의 direct input이 아니고, 마지막 봉화대
제거를 0으로 쓰는 known direct path도 없다.

이 결론은 fog-of-war를 포함하지 않는다. `FUN_00442ca0` selector-5 raw grid 변경은 이 문서에서
그 consumer를 추적하지 않았으므로 fog/minimap 기능으로 명명하지 않는다.

| 구분 | 상태 | 근거 범위 |
| --- | --- | --- |
| 보고한 completed-beacon count enable/disable 규칙 | `미확인` | HUD entry는 복원했지만 두 primary raw gate producer/alias writer와 completion·destruction reachability가 미확인이다. |
| `WORD[0x008438dc]`가 live count gate라는 가설 | `반증됨` | one-shot direct set과 renderer input 경계가 이 가설과 모순된다. |
| `WORD[0x008438dc]` one-shot lifecycle | `정적 확정` | writer, standard-entry reset, complete canonical direct-reference set, post-state consumer CFG를 확인했다. |
| raw primary-gate field의 게임플레이 이름·alias writer | `미확인` | `0x00bcbd84`에는 direct read만 있고 player field operand는 computed다. |
| 재현 | `재현 완료` | normal/zero/first/multiple/last-removal/stale-inactive/reset, primary-gate 및 malformed/source-tamper vector를 전용 test가 검사한다. |
| 구현 | `프로젝트 전용` | 원본 규칙 이식은 없다. K01 map metadata가 선택하는 교체 가능한 product policy가 local-player의 live completed `beacon`으로 HUD compact map의 표시·입력만 제어한다. |

## 프로젝트 전용 minimap availability 정책

이 절은 원본 동작 판정이 아니라 제품 규칙이다. `imjinrok-k01`은 map data의
`minimapAvailabilityPolicyId="imjinrok:k01-local-completed-beacon"`을 선택한다. 정책 registry는
generic map의 `core:always-enabled`와 K01 product policy를 분리하며, mod는 stable ID를 등록하거나
교체할 수 있다. 알 수 없는 configured ID는 scene setup에서 error로 중단한다.

K01 product policy는 local player의 `UnitState` 가운데 `kind === "beacon"`, positive current health,
그리고 `isUnitUnderConstruction(unit) === false`인 record가 하나 이상일 때만 enabled이다. 따라서
unfinished→complete, one-of-many removal, final removal, foreign-owner, dead record와 removed record를
독립 test vector로 고정했다. enabled가 아니면 HUD는 playable minimap diamond interior를 opaque black으로
덮고 terrain/fog/resources/objectives/entities/viewport를 보이지 않게 하며 minimap navigation 및 alerts를
받지 않는다. source fog composition 자체는 바꾸지 않는다.

이 제품 정책은 `WORD[0x008438dc]`가 live completed-beacon count gate라는 가설의 **반증됨** 결론이나,
actual compact-map primary gate producer/alias writer와 completion/destruction reachability가 **미확인**이라는
원본 분석 상태를 바꾸지 않는다. 그러므로 이 UI behavior를 원본 일치 또는 원본 수명주기 구현으로 부르지
않는다.

## 고정 원본과 재현 도구

| 입력 | 크기 | SHA-256 |
| --- | ---: | --- |
| `original/imjinrok2/imjinrok2.exe` | 843,833 | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `analysis/generated/imjinrok2/functions.json` | 1,468,333 | `7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e` |
| `analysis/generated/imjinrok2/references.json` | 17,206,569 | `f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5` |
| `analysis/generated/imjinrok2/seeds.json` | 9,112,063 | `8e7c8821e9c84c5d0877bb977b119b3b878271502b36bf75e7426b570507bfb7` |

모든 generated artifact의 `sourceSha256`도 EXE hash와 같아야 한다. 전용 추출기
[`extract-k01-beacon-minimap-lifecycle.mjs`](../../../tools/imjinrok/extract-k01-beacon-minimap-lifecycle.mjs),
fixture [`k01-beacon-minimap-lifecycle.json`](../../../analysis/fixtures/k01-beacon-minimap-lifecycle.json) 및
test는 입력 hash, 함수 body hash, byte anchor와 direct-reference set을 함께 고정한다.

```bash
node tools/imjinrok/extract-k01-beacon-minimap-lifecycle.mjs
node --test tools/imjinrok/k01-beacon-minimap-lifecycle.test.mjs
```

## HUD entry 후보 검색 기록

이 문서는 이름이나 화면 유사성으로 renderer를 정하지 않았다. 다음은 같은 hash-bound artifact에 대해
실행하고 report에도 고정한 정적 검색 입력과 결과다.

| 검색 입력 | concrete 결과 | 판정에 쓴 이유 |
| --- | --- | --- |
| `references.json`에서 direct target `0x008438dc` filter | `0x0048a731` READ, `0x0048a77a` WRITE, `0x0048a7f2` READ; 모두 `FUN_0048a5c0` | completed-beacon state의 complete direct set에 HUD consumer가 없음을 확인했다. |
| hash-bound EXE의 ASCII strings 및 generated `imjinrok2` JSON에서 `mini-map`, `minimap`, `small-map` spelling search | original named string/resource candidate 없음 | 문자열 이름으로 renderer를 추정하지 않았다. 이 결과는 resource 전체 부재 주장이 아니다. |
| function graph의 HUD surface candidate | `FUN_004475a0`의 caller는 `0x0045f9c0`; callee에 paired `0x0044abb0`/`0x0044ada0` lock/unlock와 `0x004abbc0`, `0x004abe50`가 있다. 두 helper는 이 root가 유일 caller다. | surface lifecycle과 compact map/marker helper 관계로 concrete draw candidate를 골랐다. |
| 선택한 candidate의 raw bytes | `0x004478d5` primary gate, `0x00447903` request/mode→surface draw, `0x0045f464` interactive writer | candidate가 단순 resource reference가 아니라 완결된 draw/control entry임을 확인했다. |

따라서 이 unit에 필요한 minimap draw/control entry의 seed나 추가 artifact는 없다. 다음 정확한 edge는
primary raw gate의 gameplay 의미가 아니라, 두 operand의 **모든 producer/alias writer**와 그 producer로
향하는 completed-beacon completion·destruction/removal reachability다. 그것이 닫히기 전 전체 규칙은
`미확인`으로 유지한다.

## 분석 함수와 byte 범위

| 함수 / byte 범위 (end exclusive) | 명령 수 | whole-body SHA-256 | 역할 |
| --- | ---: | --- | --- |
| `FUN_0048a5c0`, `0x0048a5c0-0x0048a879` | 181 | `0b78f8d459c6fa6d316d00bfa07148949a9156d182d3428726623749a0d9eed8` | K01 봉화대 scan, one-shot flag write, post-state CFG |
| `FUN_00460ba0`, `0x00460ba0-0x00460e21` | 144 | `47f5f8e1743260ffdbc0f378f46510ec4126c2accc74cc41e2464dd77a5f3b32` | standard mission-entry zero fill |
| `FUN_004475a0`, `0x004475a0-0x00447bb9` | 418 | `81e6e28cf3a20e2ecd6d1f2e7ede44e646f044fbf86aa581620baa41f67f9f9c` | HUD compact-map gate, cadence/request, surface draw |
| `FUN_0045f320`, `0x0045f320-0x0045f929` | 479 | `0e1f7677a947bb9499881bb308a55adced0c1cbf516408a3fb1056428d60c469` | `0x9` input의 compact-map mode/request writer |
| `FUN_004abbc0`, `0x004abbc0-0x004abcac` | 70 | `f836259410483095b460877f36604666713d9f432c86e8dc9a0e460323a7bcf5` | role-neutral HUD compact-map terrain/map-cell byte helper |
| `FUN_004abe50`, `0x004abe50-0x004abebe` | 36 | `59d03958417ea5e31fafff2f10f517faf8c41344210fdeaed1baa0ad527a3549` | role-neutral active-entity marker projection helper |
| `FUN_004abd90`, `0x004abd90-0x004abe49` | 63 | `f7e991299d06f83d49733276dd14a0080a75a1890c55bd26570778fc3fcdf7e3` | two-WORD marker coordinate → HUD surface pixel-call helper |

| VA / raw offset | byte 범위 | 고정한 사실 |
| --- | --- | --- |
| `0x0048a724` / `0x0008a724` | `0x0048a724-0x0048a781` | initial flag-zero gate, 1,200 slot scan, owner/class/progress 검사, `WORD[0x008438dc]=1` |
| `0x0048a781` / `0x0008a781` | `0x0048a781-0x0048a7da` | post-write native/script calls; flag clear store 없음 |
| `0x0048a7da` / `0x0008a7da` | `0x0048a7da-0x0048a812` | exact-one post-state consumer와 `AX=1` return |
| `0x00460ba3` / `0x00060ba3` | `0x00460ba3-0x00460bb1` | `ECX=0x1f6aa`, zero EAX, `REP STOSD` |
| `0x004478d5` / `0x000478d5` | `0x004478d5-0x00447903` | renderer primary gate |
| `0x00447903` / `0x00047903` | `0x00447903-0x00447991` | latch/request cadence, mode read, surface lock/draw/unlock |
| `0x0045f464` / `0x0005f464` | `0x0045f464-0x0045f49c` | key-9 mode toggle와 redraw request write |
| `0x004abbc0` / `0x000abbc0` | `0x004abbc0-0x004abbe3` | stack mode `1`이 terrain/map-cell byte-writing loop를 선택 |
| `0x004abbe3` / `0x000abbe3` | `0x004abbe3-0x004abc5f` | mode-one cell loop이 table/cell source byte를 HUD surface destination에 write |
| `0x004abe50` / `0x000abe50` | `0x004abe50-0x004abeb0` | active-entity index loop, active-record byte gate, two record WORD를 `FUN_004abd90`에 전달 |
| `0x004abd90` / `0x000abd90` | `0x004abd90-0x004abde8` | two WORD에서 compact-surface coordinate를 만들고 `0x0044ba50` pixel operation call |

## 실제 HUD 컴팩트 맵 draw/control flow

`FUN_004475a0`의 `0x004478d5`는 `signed WORD[0x00bccc44]`에서 current player index를 만들고 다음
raw condition을 적용한다.

```text
playerWord = WORD[0x0082e9d0 + signed(WORD[0x00bccc44]) * 0x2c10]
continue to compact-map cadence/render control iff
  playerWord == 0 OR WORD[0x00bcbd84] == 0
otherwise skip the draw block
```

허용된 경로 `0x00447903-0x00447991`는 prior latch `WORD[0x00552784]`, 30-tick cadence 및
`WORD[0x007c6610]` redraw request를 처리한다. 요청이 `1`이면 `0x00447940`이 0으로 clear한 뒤
draw로 진행한다. draw block은 `0x0044abb0`으로 surface lock, `0x004abbc0`에
`WORD[0x007c6612]` mode를 전달, `0x004abe50` 호출, `0x0044ada0` unlock 순서다. 이 raw surface와
map/marker helper call chain을 이 문서에서는 HUD compact-map renderer로 한정해 부른다.

이 helper label도 caller 관계만으로 정하지 않았다. `FUN_004abbc0`의 mode-one branch는
`WORD[ECX]` count만큼 cell/table byte를 읽어 compact HUD surface destination에 byte를 write한다.
`FUN_004abe50`은 active-entity index list를 순회하고 active-record byte가 1인 항목에서 두 record WORD와
surface context를 `FUN_004abd90`에 넘긴다. 이어서 `FUN_004abd90`은 그 두 WORD에서 surface coordinate를
계산해 `0x0044ba50` pixel operation을 호출한다. 그러므로 이 문서는 과도한 게임플레이 명명 없이
**HUD compact-map terrain/map-cell byte helper**와 **active-entity marker projection helper**라는
role-neutral label만 사용한다.

`FUN_0045f320`의 `0x0045f464` key-9 path는 `WORD[0x004bdfc8] == 3` 및 prior latch nonzero일 때
`WORD[0x007c6610]=1`을 쓰고, `WORD[0x007c6612]`를 `0`과 `1` 사이에서 toggle한다.
`FUN_00460ba0`의 broad zero fill `[0x007c5ed8, 0x00843980)`은 두 WORD 모두 포함하므로 standard
mission entry에서 reset한다.

| state | canonical direct-reference set | writer/reset/clearer/consumer |
| --- | --- | --- |
| `WORD[0x007c6610]` redraw request | read `0x00447930`; write `0x00447940`, `0x0045f482` | key-9 writer → renderer consumer-clearer; standard-entry broad reset |
| `WORD[0x007c6612]` compact-map mode | read `0x00447964`, `0x0045f48b`; write `0x0045f495` | key-9 toggle → renderer mode argument; standard-entry broad reset |
| `WORD[0x00bcbd84]` primary raw gate | read `0x0044670c`, `0x004478f6`, `0x004479b3`, `0x00447a6b`, `0x004610e6` | known direct writer 없음; computed/alias producer는 이 unit에서 미확인 |

위 두 compact-map control state의 canonical direct-reference set에는 destruction/removal clear가 없다.
그것은 global alias absence 주장이 아니며, primary gate operand의 computed/alias write 가능성도 남는다.

## K01 completed-beacon one-shot state

`FUN_0048a5c0`은 initial `WORD[0x008438dc] == 0`일 때만 정확히 1,200 slot을 scan한다. active lookup이
성공하고 `signed BYTE runtime+0x38 == WORD[0x00bccc44]`, `BYTE runtime+0x37 == 52`,
`BYTE runtime+0x8c == 100`을 모두 만족한 slot마다 `0x0048a77a`가 flag에 `1`을 쓴다. loop에는 break가
없어 same invocation의 multiple completion은 다시 1을 쓰지만, 다음 invocation은 nonzero flag로 scan을
skip한다.

`0x008438dc`의 complete canonical direct-reference set은 오직 다음 세 곳이다.

| site | type | 효과 |
| --- | --- | --- |
| `0x0048a731` | READ | nonzero이면 scan skip |
| `0x0048a77a` | WRITE | qualifying completed beacon마다 `WORD 1` |
| `0x0048a7f2` | READ | exact-one post-state script/context gate |

`0x0048a7f2`는 `flag == 1`일 때 `0x00482390`으로 script context `+8`을 얻고, 0이면 `AX=1`로
return한다. 이 CFG에는 HUD compact-map renderer call이 없다. `FUN_00460ba0`의 standard-entry zero fill은
이 flag도 reset하지만, destruction/removal/progress decrease가 0을 쓰는 branch는 above CFG/direct set에 없다.

따라서 vector `flag=1, record 없음`은 scan-skip으로 1을 유지하며, first/multiple completion과 last removal은
이 **one-shot state**에서 live completed-beacon count를 만들지 않는다. 이 state 자체를 actual HUD
compact-map gate로 연결하는 것은 원본 direct control flow와 모순되지만, 다른 primary-gate operand로의
computed/alias reachability는 아직 판정하지 않는다.

## 독립 vector와 남은 범위

fixture/test는 zero-completed, first completion, multiple completion, last removal, inactive/incomplete,
stale standard-entry reset 및 malformed flag/record를 재현한다. primary raw gate는 `(0,1)`과 `(1,0)`에서
render control을 허용하고 `(1,1)`에서 skip하는 vector를 가진다. EXE/functions/references/seeds 각각의
1-byte 변조는 hash mismatch로 해석 전에 거부하고, copied EXE override CLI는 deterministic JSON을 낸다.

남은 불확실성은 `playerWord`와 `WORD[0x00bcbd84]`의 게임 내 명칭 및 **모든 computed/alias producer**다.
다음 작업은 completion 및 destruction/removal path에서 그 producer까지의 reachability를 정적으로 닫는
것이다. 이 불확실성은 one-shot `0x008438dc`가 direct renderer input이 아니라는 복원 결과를 약화하지
않는다. 이 문서는 다른 map/fog surface 또는 selector-5 grid의 의미까지 확장하지 않는다.
