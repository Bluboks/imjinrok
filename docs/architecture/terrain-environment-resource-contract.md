# 지형·환경·자원 시각 계약

## 목적과 구현 상태

이 문서는 웹 포트의 모딩 가능한 계약을 설명한다. 원본의 타일 record decode, K01의 밤 전환 시점,
원본 맵 자원 배치 또는 원본 resource sprite 의미를 확정하는 문서가 아니다.

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| tileset·자원·환경 source file 존재와 hash | `원본 사실` | fixture의 경로·SHA-256 |
| representative PNG/palette manifest export | `source-backed project adaptation` | hash가 고정된 frame 0 export; 원본 선택 규칙 아님 |
| map의 `tilesetId`·visual profile·resource visual set 선택 | `프로젝트 전용` | 명시적 registry 참조와 loud validation |
| K01 palette step identity | `원본 기반` | bounded 8,640 admitted-update schedule과 `night1`~`night4` identity; product tick calibration은 별도 적응 |
| light curve와 dawn/day/dusk/night simulation output | `의도적 적응` | opt-in fixed-tick curve |
| K01 원본 tile source object/frame selector | `원본 사실` | `FUN_00469330`의 K01 normal source object/frame 범위; pixel placement와 terrain 의미는 별도 |
| K01 exact visual export·map assignment | `source-backed project adaptation` | 243 normal PNG와 K01-only explicit flat asset assignment; hash-bound raw `0/16` second-argument stream을 보존하되 emitted `grss1_0000` alpha/low-nibble coverage vector로 선택한 shared ground anchor와 source-art footprint underlay |

## 원본 source fact

`analysis/fixtures/imjinrok-environment-assets.json`은 다음 원본 파일을 입력 hash와 함께 카탈로그한다.

- `tile/{normal,snow,brown}`의 `grss`, `sea`, `shallow`, `hill`, `diff`, `castle`, `newblk`, `fog`.
- `pal/night1.pal`부터 `pal/night4.pal`, `tempeft/night1.YAV`.
- `fnt/crop0.spr`, `crop1.spr`, `tree0.spr`, `resource.spr`, `helpresource.spr`.

파일 존재만으로 일반 map byte가 어떤 tile/file/frame을 선택한다고 주장하지 않는다. 단, K01은
[source tile selector](../reverse-engineering/mechanics/k01-source-tile-selector.md)가 map byte→normal loader
object/frame의 제한된 경로를 정적 확정했다. `crop0` frame 0→`rice`/`potato`, `tree0` frame 0→`tree`/`bamboo`은 source file identity 위에
올린 **source-backed project adaptation**이다. `resource.spr` frame 0은 UI sack source fact로 catalog에만
남기며 `gold`/`stone` field node에는 자동 연결하지 않는다. K01 `themeId=0 → normal`은 위 selector의
제한된 source selection 범위에서만 원본 사실이며, terrain 의미나 product resource policy는 아니다.

## 프로젝트 계약

`MapDefinition`은 선택적으로 `tilesetId`, `environmentVisualProfileId`, `resourceVisualSetId`를 가진다.
이전 map은 이 필드 없이도 유효하다. 새 map은 `core-default`를 선택한다. `validateMapDefinition`과
`assertValidMapDefinition`은 존재하지 않는 reference, 알려지지 않은 terrain/resource, 음수 elevation,
잘못된 layer 길이를 오류로 낸다.

`ContentPackDefinition`은 gameplay definition과 독립된 tileset/environment/resource visual registry를
가질 수 있다. `imjinrok-source-assets` pack은 gameplay terrain/resource/unit을 재선언하지 않는 source
catalog pack이다. 이를 `isorts-core`와 조합해야 map reference가 resolve된다.

K01/K02 scaffold는 `imjinrok-normal` tileset identity를 선택한다. K01은 source selector가 확정한 3,600개
object/frame stream을 243개 exported normal PNG의 explicit **flat** selection으로 적용한다. 이것은 terrain
type/passability/elevation을 바꾸지 않으며 `hill`/`diff` filename도 world meaning으로 승격하지 않는다. K02에는
이 K01-only selection을 적용하지 않는다. K01의 bounded palette schedule은 아래의 별도 visual-step contract만
적용하며, K01에 자원 node를 새로 추가하지 않고 existing K01 resource tile가 없는 상태도 그대로다.

## light curve

`EnvironmentPreset.dayNight.lightCurve`의 keyframe은 cycle 안 fixed tick, phase, `0..1` light level이다.
두 keyframe 사이 light level은 선형 보간한다. curve가 없으면 종전 day/night 상태만 유지한다. 이는 original
palette timing을 추측하지 않는 opt-in project adaptation이다. deterministic world tick에서 output
`EnvironmentState.lightLevel01`을 관찰할 수 있다.

기본 `river-crossing` skirmish map은 10 tick/s 기준 6,000 tick(10분) project-authored cycle을 opt-in하며,
tick 0에서 dawn으로 시작해 600 tick 뒤 day가 된다. K01/K02와 다른 Imjinrok source map에는 원본 일정
근거가 없으므로 이 cycle을 적용하지 않는다.

K01은 `imjinrok-source-day-night-palette` profile과 generic `visualSteps` contract를 opt-in한다. source fixture가
확정한 8,640 admitted-update cycle에서 tick `0/2/4`는 `night3/night2/night1`, tick
`4320/4322/4324/4326`은 `night1/night2/night3/night4`를 선택한다. 프로젝트 simulation tick 하나를 admitted update
하나로 취급하는 것은 **의도적 calibration**이고 raw update rate/24 Hz equivalence는 미확인이다. K01에는
`nightSightMultiplier`가 없으므로 visual selection은 sight를 바꾸지 않는다.

## renderer bridge contact

후속 renderer는 registry를 resolve한 뒤 다음만 소비한다.

1. terrain: K01은 exact original map byte→normal source object/frame rule로 고른 243개 frame을 `TileCell`
   `flatAssetKey`에 명시적으로 연결한다. catalog의 `grss1`/`hill0` frame 0을 전 tile에 반복 선택하지 않는다.
   K02와 모드 map은 `TileCell.tilesetVisuals`의 `flatAssetKey`/`elevationAssetKey`로 선택한 `tilesetId`
   collection key만 명시적으로 사용할 수 있고, 선택하지 않은 surface는 기존 theme fallback을 유지한다. tile
   image geometry `(64×48, anchor 32,16)`, raw K01 second-placement-argument stream, source-canvas overhang chunk
   bounds는 product/mod renderer 계약이며 original tile canvas/pivot/placement parity 주장이 아니다. emitted-PNG
   alpha coverage fixture는 per-cell web `y=-16` 해석의 low-nibble boundary seam을 반증하므로, K01 source art는
   shared ground contact에 놓고 map stream에 포함된 `grss1_0000` source-art `underlayAssetKey` 위에 합성한다. test는
   이 PNG alpha로 logical diamond 전체가 실제로 덮이는지를 재현한다. 이는 source-backed-adaptation이며 original
   renderer layer parity 주장이 아니다. 같은 shared contract는 explicit terrain/world bounds와 fog base/source composite가
   함께 소비한다.
2. resource: generic `resolveMapResourceVisual(registry, map, kind, state)`가 map-selected set의
   `resourceVisualSet.resources[kind]?.states[state]`를 반환한다. visual set ID가 없는 legacy map과
   매핑되지 않은 kind/state는 `null`이고 preload는 빈 배열이다. scene preload는 launch map 확정 전이므로
   registry의 모든 등록 descriptor를 결정론적으로 읽는다. 명시했지만 등록되지 않은 set 또는 선택된
   descriptor의 preload 누락은 오류다.
3. environment: opt-in state의 `lightLevel01`과 `visualPaletteId`; `visualSteps`는 map-selected profile의 stable
   palette ID를 골라 snapshot/network에도 그대로 보존한다. Imjinrok palette manifest는 generated 768 RGB6 bytes와
   source SHA-256을 제공하고, adapter는 이것에서 deterministic tint/alpha를 계산한다. 이 renderer policy는
   **source-backed-adaptation**이며 original indexed palette/true-color shader match가 아니다. selected profile,
   palette ID, hash 또는 byte data가 없으면 loud failure다. fog behavior는 이 adapter가 바꾸지 않는다.

Imjinrok crop/tree adaptation은 active state frame 0만 가진다. depleted state와 `gold`/`stone`은 `null`
fallback으로 기존 renderer behavior를 보존한다. active crop/tree는 native pixel aspect ratio를 유지하고
map diamond ground contact에 놓는 project scale/pivot policy를 사용한다. 이는 frame 0 source identity만
소비하는 source-backed project adaptation이며 원본 pivot·scale 또는 K01 resource placement 주장이 아니다.
normal/snow/brown representative export도 원본 tile selection의 증거가 아니다.

## 재현과 다음 분석

```bash
node tools/imjinrok/extract-imjinrok-environment-assets.mjs --output analysis/fixtures/imjinrok-environment-assets.json
node tools/imjinrok/export-imjinrok-environment-assets.mjs
node --test tools/imjinrok/imjinrok-environment-assets.test.mjs
node tools/imjinrok/export-k01-source-tile-visuals.mjs
node --test tools/imjinrok/export-k01-source-tile-visuals.test.mjs
node --test tools/imjinrok/k01-terrain-composition-coverage.test.mjs
```

다음 원본 분석은 K01 source frame의 pixel placement/pivot과 다른 map/theme selector, night palette/YAV
selection/update path, 그리고 map/source record에서 직접 확인 가능한 resource placement/identity를 각각 좁은 질문으로 닫아야 한다.
