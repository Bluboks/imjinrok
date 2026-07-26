# 스프라이트 시스템 구축 계획안

> 보관 문서: 현재 구현과 일치하지 않는 과거 계획이다. 현행 계획으로 사용하지 않는다.

## 배경

이 프로젝트는 2D RTS 게임을 목표로 하며, 향후 26년 전 개발된 2D RTS 게임의 스프라이트 애셋을 가져와 유닛, 건물, 애니메이션 지형지물을 렌더링하는 것을 목표로 한다.

현재 프로젝트에는 지형용 정적 visual 시스템이 일부 존재한다.

- `packages/shared/src/visuals.ts`
  - `FrameRef`, `AnimationClip`, `EntityVisual`, `TerrainVisual` 타입 존재
- `packages/shared/src/themes.ts`
  - `terrainBindings`와 `entityBindings` 구조 존재
  - 현재 `entityBindings`는 비어 있음
- `apps/game-client/src/render/placeStaticVisual.ts`
  - 정적 visual 배치 헬퍼 존재
- 현재 유닛/건물은 Phaser `Graphics.fillCircle(...)` 기반 placeholder로 렌더링됨

따라서 목표는 기존 visual/theme 구조를 유지하면서, 유닛/건물/애니메이션 지형지물을 위한 실제 스프라이트 시스템을 점진적으로 도입하는 것이다.

---

## 핵심 설계 방향

MVP는 다음 방향을 따른다.

1. 기존 `VisualDefinition`, `EntityVisual`, `AnimationClip`, `ThemeDefinition` 구조를 확장해서 사용한다.
2. Phaser의 `Sprite`와 `AnimationManager`를 사용한다.
3. 자체 애니메이션 엔진은 만들지 않는다.
4. 프레임별 개별 PNG 로딩 대신 atlas 기반 로딩을 목표로 한다.
5. 방향 처리는 8방향을 기본으로 하되, 원본 5방향 애셋 + 좌우 반전 mirror를 지원한다.
6. animation state는 표준 이름을 제공하되, 커스텀 확장을 위해 `string` 기반으로 열어둔다.
7. 팀컬러는 MVP에서 `base sprite + team mask overlay sprite` 방식으로 시작한다.
8. 성능 또는 색상 정확도 문제가 확인되면 나중에 shader/palette remap 방식으로 승격한다.

---

## 목표 구조

런타임에서 엔티티 visual은 다음 흐름으로 해석한다.

```txt
entity type id
-> theme.entityBindings[entity type id]
-> visualId
-> EntityVisual
-> current state + facing
-> AnimationClip
-> Phaser Sprite animation
```

렌더러는 다음 책임만 가진다.

- visual lookup
- state/facing에 맞는 animation clip 선택
- mirror 방향이면 `flipX` 적용
- team color mask sprite가 있으면 base sprite와 동기화
- visual이 없으면 기존 placeholder 렌더링으로 fallback

---

## 데이터 모델 확장안

### 방향 정의

기존 8방향 타입은 유지한다.

```ts
export type Facing = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
```

MVP에서는 visual마다 실제로 보유한 방향과 mirror 규칙을 데이터로 둔다.

```ts
export interface FacingSet {
  /** 실제 애셋에 존재하는 방향. 예: n, ne, e, se, s */
  source: readonly Facing[];

  /** 없는 방향을 다른 방향의 좌우 반전으로 대체하는 규칙. */
  mirrors?: Partial<Record<Facing, { from: Facing; flipX: true }>>;
}
```

예시:

```ts
const fiveDirectionFacingSet = {
  source: ["n", "ne", "e", "se", "s"],
  mirrors: {
    nw: { from: "ne", flipX: true },
    w: { from: "e", flipX: true },
    sw: { from: "se", flipX: true },
  },
} as const;
```

### Animation State

표준 state 이름은 제공하되, 타입을 엄격한 union으로 고정하지 않는다.

권장 표준 state:

```txt
idle
move
attack
gather
death
corpse
construct
damaged
destroyed
```

원본 애셋의 이름은 프로젝트 표준 이름으로 매핑한다.

```txt
stand        -> idle
walking      -> move
crawl        -> move:crawl
gathering    -> gather
constructing -> construct
```

상세 변형은 콜론 네임스페이스를 사용한다.

```txt
move:crawl
attack:melee
attack:ranged
gather:wood
gather:gold
death:burn
idle:carry
```

### EntityVisualState

`EntityVisualState`는 다음 방향으로 확장한다.

```ts
export interface EntityVisualState {
  facingSet?: FacingSet;
  clips: Partial<Record<Facing | "default", AnimationClip>>;
  fallbackState?: string;
}
```

방향이 없는 건물이나 지형지물은 `clips.default`만 사용할 수 있다.

```ts
states: {
  idle: {
    clips: {
      default: buildingIdleClip,
    },
  },
}
```

### 팀컬러 정의

기존 `teamColorMask?: FrameRef`는 단일 프레임만 표현할 수 있으므로, 프레임별 mask 규칙을 표현하는 방식이 더 적합하다.

추천 형태:

```ts
export interface TeamColorSpec {
  mode: "mask";
  maskFrameSuffix?: string; // 예: "_team" 또는 "_mask"
}

export interface EntityVisual extends VisualBase {
  kind: "entity";
  states: Record<string, EntityVisualState>;
  shadow?: FrameRef;
  teamColor?: TeamColorSpec;
  portrait?: FrameRef;
}
```

예:

```txt
base frame: move/e/0003
mask frame: move/e/0003_team
```

---

## Atlas 전략

유닛/건물 애니메이션은 프레임 수가 많기 때문에 개별 PNG를 직접 로드하지 않는다.

권장 방식:

```ts
FrameRef {
  textureKey: "default_units_villager",
  frameName: "move/e/0003"
}
```

Phaser 로딩:

```ts
this.load.atlas(textureKey, atlasPngUrl, atlasJsonUrl);
```

기존 `FrameRef.frameName` 필드가 이미 있으므로, atlas 기반 visual로 확장하기 좋은 상태다.

향후 지형 `hill0`도 가능하면 atlas 기반으로 이전한다. 다만 MVP에서는 유닛/건물부터 적용해도 된다.

---

## 방향 해석 규칙

렌더러는 state와 facing을 받아 clip을 해석한다.

```txt
1. state.clips[requestedFacing]이 있으면 사용
2. 없고 mirror 규칙이 있으면 mirror.from 방향 clip 사용 + flipX 적용
3. 없으면 state.clips.default 사용
4. 없으면 fallback state 사용
5. 없으면 idle 사용
6. 없으면 첫 번째 사용 가능한 clip 사용
```

예:

```txt
요청: move + e
결과: move/e clip, flipX false

요청: move + w
결과: move/e clip, flipX true

요청: move + nw
결과: move/ne clip, flipX true
```

16방향/32방향 등 더 세밀한 방향은 지금 구현하지 않는다. 나중에 필요해지면 `FacingSet`에 `angleCount`, `directionMode` 같은 필드를 추가하는 방식으로 확장한다.

---

## Animation Fallback 전략

state fallback은 필수다. 애셋이 일부만 준비된 상태에서도 게임이 깨지지 않아야 한다.

추천 fallback 순서:

```txt
정확한 state + 정확한 facing
-> 정확한 state + default
-> prefix state
   예: attack:ranged -> attack
-> fallbackState
-> idle
-> 첫 번째 사용 가능한 state/clip
-> placeholder
```

`death`와 `corpse`는 구분한다.

- `death`: 1회 재생, `loop: false`
- `corpse`: 마지막 상태의 정적 visual 또는 loop 없는 정지 clip

death animation 완료 후 corpse state로 전이하는 helper를 둘 수 있다.

---

## 팀컬러 전략

원본 애셋은 256 indexed color palette에서 특정 색상 2~3개를 팀컬러로 사용하는 구조다.

현재 프로젝트에는 palette 개념이 없으므로, MVP에서는 palette remap을 바로 구현하지 않고 `base + mask` 방식으로 시작한다.

### 권장 MVP: Base Sprite + Team Mask Overlay

빌드 타임에 원본 indexed sprite를 다음 두 종류로 분리한다.

```txt
원본 frame
-> base frame
-> team mask frame
```

- `base frame`
  - 일반 색상을 포함한 본체 이미지
  - 팀컬러 영역은 중립색 또는 제거된 상태
- `team mask frame`
  - 팀컬러 영역만 포함
  - 원본 팀컬러 index의 밝기 차이를 grayscale/alpha로 보존

런타임에서는 sprite 두 개를 겹친다.

```txt
baseSprite
teamMaskSprite.setTint(teamColor)
```

두 sprite는 항상 다음 속성을 동기화한다.

- position
- depth
- scale
- origin/pivot
- animation frame
- flipX
- visibility
- alpha

이를 위해 wrapper 객체를 둔다.

```ts
class AnimatedEntityRenderable {
  base: Phaser.GameObjects.Sprite;
  teamMask?: Phaser.GameObjects.Sprite;
}
```

### 대안 비교

| 방식 | 장점 | 단점 | 판단 |
|---|---|---|---|
| Palette remap shader | 원본에 가장 가까움, 메모리 효율 좋음 | indexed PNG/palette/LUT 파이프라인 필요, 구현 비용 큼 | 미래 후보 |
| Base + mask overlay | 구현 쉬움, 결과 예측 가능 | 드로우콜 증가 | MVP 추천 |
| Base + mask shader | overlay보다 성능 좋음 | shader 구현 필요 | 성능 문제 시 승격 |
| 팀별 pre-tint atlas | 런타임 단순 | 팀 수만큼 VRAM/로드 증가 | 비추천 |
| base sprite에 Phaser setTint | 구현 매우 쉬움 | 본체 전체가 물들어 팀컬러 품질 낮음 | 비추천 |

MVP에서는 overlay 방식으로 시작하고, 200~500개 유닛 규모에서 성능을 측정한 뒤 필요할 때 shader로 승격한다.

---

## 건물과 애니메이션 지형지물

유닛, 건물, 애니메이션 지형지물은 같은 animation visual 시스템을 공유할 수 있다.

### 유닛

```txt
idle
move
attack
gather
death
corpse
```

- 방향 있음
- 팀컬러 있음
- 이동 상태에 따라 facing 변경

### 건물

```txt
construct
idle
damaged
destroyed
```

- 보통 방향 없음
- `clips.default` 사용
- 팀컬러가 있을 수 있음

### 애니메이션 지형지물

```txt
idle
depleted
damaged
destroyed
```

- 보통 방향 없음
- 팀컬러 없음
- 월드 오브젝트처럼 같은 visual renderer 사용 가능

---

## 구현 로드맵

### Phase 1 — 타입 확장

- `FacingSet` 추가
- `EntityVisualState.facingSet` 추가
- `EntityVisualState.fallbackState` 추가
- `EntityVisual.teamColor` 추가
- 기존 `teamColorMask?: FrameRef`는 deprecated 또는 제거 후보로 정리

### Phase 2 — Atlas 로더 확장

- visual asset이 image인지 atlas인지 구분할 수 있게 확장
- `FrameRef.frameName`을 실제 Phaser atlas frame으로 사용
- `getThemeFrameRefs` 또는 별도 asset manifest 로딩 로직 정리

### Phase 3 — 데모 유닛 1종 구현

- `idle` 5방향
- `move` 5방향
- `nw/w/sw`는 `ne/e/se` mirror로 처리
- `entityBindings`에 데모 유닛 연결
- visual이 없으면 기존 circle placeholder 유지

### Phase 4 — AnimatedEntityRenderable 도입

- Phaser Sprite 생성/재생 wrapper 추가
- state/facing 변경 시 animation 갱신
- `flipX` 동기화
- depth/origin/scale 처리
- 기존 유닛 placeholder 렌더링을 점진적으로 대체

### Phase 5 — 팀컬러 Overlay MVP

- build script 또는 수동 변환으로 `base + team mask` 프레임 준비
- `teamMaskSprite.setTint(teamColor)` 적용
- base sprite와 mask sprite animation frame 동기화
- 유닛 수 증가 시 성능 측정

### Phase 6 — 건물/지형지물 애니메이션

- 건물 `construct/idle/damaged/destroyed` 지원
- 방향 없는 `default` clip 지원 검증
- 애니메이션 지형지물도 같은 renderer에서 처리

### Phase 7 — 선택적 고도화

- 팀컬러 overlay를 shader로 승격
- palette remap shader 실험
- 16방향/32방향 지원
- 커스텀 맵/모드용 external visual manifest 지원

---

## MVP에서 하지 않을 것

다음은 의도적으로 뒤로 미룬다.

- 자체 애니메이션 엔진
- 처음부터 16/32방향 일반화
- 완전한 mod/skin pack 시스템
- palette remap shader 즉시 구현
- 모든 state 이름을 TypeScript union으로 고정
- 팀별 pre-tint atlas 생성
- base sprite 전체에 `setTint()` 적용
- UI visual까지 같은 시스템에 통합

---

## 최종 결정 요약

MVP 스프라이트 시스템은 다음 결정을 기준으로 구축한다.

```txt
기존 Visual/Theme 구조 유지
EntityVisual 실사용 시작
Atlas + FrameRef.frameName 기반 프레임 참조
Phaser Sprite/AnimationManager 사용
FacingSet으로 5방향 원본 + 3방향 mirror 처리
State는 string 기반 + 표준 이름 제공
Fallback 체인 필수
팀컬러는 base + mask overlay로 시작
Shader/palette remap/16방향은 미래 확장으로 유지
```

이 방향은 원본 2D RTS 애셋의 특징인 방향별 애니메이션, mirror, pivot, 팀컬러를 MVP 수준에서 안정적으로 표현하면서도, 향후 커스텀 애니메이션 세트와 더 세밀한 방향 시스템으로 확장할 수 있는 여지를 남긴다.
