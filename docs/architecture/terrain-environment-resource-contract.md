# 지형·환경·자원 시각 계약

## 목적과 구현 상태

이 문서는 웹 포트의 모딩 가능한 계약을 설명한다. 원본의 타일 record decode, K01의 밤 전환 시점,
원본 맵 자원 배치 또는 원본 resource sprite 의미를 확정하는 문서가 아니다.

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| tileset·자원·환경 source file 존재와 hash | `원본 사실` | fixture의 경로·SHA-256 |
| map의 `tilesetId`·visual profile·resource visual set 선택 | `프로젝트 전용` | 명시적 registry 참조와 loud validation |
| light curve와 dawn/day/dusk/night simulation output | `의도적 적응` | opt-in fixed-tick curve |
| K01 원본 tile layout·palette selection/timing·resource placement | `미확인` | 구현에 강제하지 않음 |

## 원본 source fact

`analysis/fixtures/imjinrok-environment-assets.json`은 다음 원본 파일을 입력 hash와 함께 카탈로그한다.

- `tile/{normal,snow,brown}`의 `grss`, `sea`, `shallow`, `hill`, `diff`, `castle`, `newblk`, `fog`.
- `pal/night1.pal`부터 `pal/night4.pal`, `tempeft/night1.YAV`.
- `fnt/crop0.spr`, `crop1.spr`, `tree0.spr`, `resource.spr`, `helpresource.spr`.

파일 존재는 source asset catalog의 사실일 뿐, map byte가 어떤 tile/file/frame을 선택하는지 또는
`crop/tree/resource`가 현재 게임의 six-node kind와 정확히 대응하는지를 뜻하지 않는다. K01의
`themeId=0 → normal`도 기존 [원시 맵 값 투영 계약](../reverse-engineering/mechanics/k01-map-terrain-contract.md)의
`추정` 범위를 넘지 않는다.

## 프로젝트 계약

`MapDefinition`은 선택적으로 `tilesetId`, `environmentVisualProfileId`, `resourceVisualSetId`를 가진다.
이전 map은 이 필드 없이도 유효하다. 새 map은 `core-default`를 선택한다. `validateMapDefinition`과
`assertValidMapDefinition`은 존재하지 않는 reference, 알려지지 않은 terrain/resource, 음수 elevation,
잘못된 layer 길이를 오류로 낸다.

`ContentPackDefinition`은 gameplay definition과 독립된 tileset/environment/resource visual registry를
가질 수 있다. `imjinrok-source-assets` pack은 gameplay terrain/resource/unit을 재선언하지 않는 source
catalog pack이다. 이를 `isorts-core`와 조합해야 map reference가 resolve된다.

K01/K02 scaffold는 `imjinrok-normal` tileset identity만 선택한다. source night catalog나 cycle은 K01 map에
적용하지 않는다. K01에 자원 node를 새로 추가하지 않으며, existing K01 resource tile가 없는 상태도 그대로다.

## light curve

`EnvironmentPreset.dayNight.lightCurve`의 keyframe은 cycle 안 fixed tick, phase, `0..1` light level이다.
두 keyframe 사이 light level은 선형 보간한다. curve가 없으면 종전 day/night 상태만 유지한다. 이는 original
palette timing을 추측하지 않는 opt-in project adaptation이다. deterministic world tick에서 output
`EnvironmentState.lightLevel01`을 관찰할 수 있다.

## renderer bridge contact

후속 renderer는 registry를 resolve한 뒤 다음만 소비한다.

1. terrain: `tileset.terrainAssets[tile.terrain]`, then optional
   `tileset.elevationAssets[String(tile.elevation)]`.
2. resource: `resourceVisualSet.resources[node.kind]?.states[getResourceNodeState(node)]`.
3. environment: opt-in state의 `lightLevel01`; `EnvironmentVisualProfile`은
   `evidenceStatus !== "unresolved"`인 asset만 자동 선택한다.

Imjinrok resource candidate URL은 `evidenceStatus: "unresolved"`다. renderer가 이를 일반 gameplay visual로
자동 승격하거나 state/frame 의미를 원본 사실로 표현해서는 안 된다. normal/snow/brown representative export도
동일하게 원본 tile selection의 증거가 아니다.

## 재현과 다음 분석

```bash
node tools/imjinrok/extract-imjinrok-environment-assets.mjs --output analysis/fixtures/imjinrok-environment-assets.json
node tools/imjinrok/export-imjinrok-environment-assets.mjs
node --test tools/imjinrok/imjinrok-environment-assets.test.mjs
```

다음 원본 분석은 renderer의 raw field → tile resource/frame CFG, night palette/YAV selection/update path,
그리고 map/source record에서 직접 확인 가능한 resource placement/identity를 각각 좁은 질문으로 닫아야 한다.
