# K01 source fog assets and command-icon extraction boundary

## 질문과 상태

질문: 원본 `tile\\normal\\fog0.spr`부터 `fog14.spr`, 그리고 `fnt\\button.spr`을 웹 제품에서 추적 가능한 source asset으로 내보낼 수 있는가? 이 자원의 frame과 현재 제품 action ID 또는 visibility/neighbor-mask 의미를 원본 규칙으로 연결할 수 있는가?

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | 자원 identity와 원본 action 61..64→button pixel frame 결합은 정적 확정; fog의 resource family·16-byte lookup·state별 six-subframe renderer 경계는 [별도 static evidence](source-fog-rendering.md)에서 정적 확정, fog frame-index algebra·mask/visibility 의미와 product action 대응은 미확인 | SHA-256, SPR header, button frames 26..29, original control path |
| 재현 | 추출 범위 재현 완료 | hash/header 검증, 결정론 PNG·manifest export |
| 구현 | 의도적 적응 | source asset catalog, fog project mapping policy, 4×3/12 product command grid fallback |

## 고정 입력과 좁은 export 범위

- `original/imjinrok2/fnt/button.spr`, SHA-256 `cfe7bab02f2cb8a1f97a3161075e617ace22d6ecf5a976546263a7c67e4efbb4`, header `34×34`, 289 frames.
- `original/imjinrok2/tile/normal/fog0.spr` … `fog14.spr`: 각각 SHA-256을 [extractor](../../../tools/imjinrok/extract-source-fog-command-icons.mjs)의 source table에 고정했고 모두 header `32×16`, 96 frames다.
- generated manifest: `apps/game-client/public/assets/themes/default/source-fog-command-icons.manifest.json`
- fixture/test: `analysis/fixtures/source-fog-command-icons-vectors.json`, `tools/imjinrok/source-fog-command-icons.test.mjs`

extractor는 기존 `codec.mjs` decoder/PNG encoder를 재사용한다. 원본 SHA와 header가 다르면 output을 만들기 전에 실패한다. export 범위는 `button.spr` frame `26,27,28,29` 및 각 normal fog source의 **frame 0 하나**다. fog의 96 frame 중 frame 0 이외의 선택 규칙은 정적으로 닫히지 않았으므로 내보내지 않았다. 이 범위는 asset identity 보존용이며 fog animation·terrain transition 규칙 주장도 아니다.

## command control과 제품 action의 분리

기존 [마법 자동사용 gate](magic-auto-use-gate.md)는 no-selection control의 action 61/62, CP949 labels `자동마법설정`/`자동마법해제`, frame/resource indices 27/26을 정적 확정했다. [hero-priority gate](hero-priority-queue-gate.md)는 action 63/64와 indices 28/29를 확정했다. 이어 [command control의 pixel-frame 결합](command-icon-frame-binding.md)이 네 index가 각각 `button.spr` pixel frame 27/26/28/29임을 source loader·record·renderer path로 정적 확정했다.

현재 제품의 `ActionDefinitionId` 중 위 원본 control과 action constructor, CP949 label, frame/resource index를 모두 함께 만족하는 항목은 **없다**. 따라서 `sourceFogAndCommandAssets.ts`의 product-action map은 의도적으로 비어 있고, 현재 `actionGrid.ts`는 모든 제품 action에 기존 glyph fallback을 유지한다. pixel resource identity는 이제 닫혔지만 exported PNG와 original control binding은 product semantic mapping으로 쓰지 않는다. source record가 후속 정적 분석으로 product action에 연결되면 action grid는 loaded texture를 image로 그리며, texture가 없으면 glyph로 조용히 대체하지 않고 오류를 낸다.

제품의 responsive 4 columns × 3 rows, 12 slot layout·hit zone·hotkey는 바꾸지 않는다. 원본의 3×3 grid는 별도 research evidence이고 이 변화는 원작 UI layout 이식이 아니다.

## fog bridge contract

`resolveSourceFogTile(visibility, neighborMask)`은 `visible`에서 `null`, `explored`/`unseen`에서 source normal fog asset record를 반환한다. `neighborMask`는 0..15만 받으며 잘못된 값은 오류다. 이 16→15 table(15→14 fallback), explored alpha `0.58`, 그리고 visibility 의미는 **프로젝트 적응**이다. 원본의 neighbor-mask→fogN/frame 규칙으로 주장하지 않는다. catalog의 source path, source sprite index와 frame 0 identity만 source-backed다.

SkirmishScene battlefield bridge는 resolver 결과와 `NORMAL_FOG_ASSETS`의 texture key/path를 preload·draw contract로 사용하며, missing texture는 `requireSourceTexture`로 명시적으로 실패한다. `grss1`과 resource frame 0 catalog는 file/hash/frame identity만 보존하며 terrain·resource 의미와 original selection rule이 미확정이므로 이 bridge가 자동으로 tile 또는 resource에 적용하지 않는다.

bridge는 map id가 아니라 `tilesetId: "imjinrok-normal"`을 선택한 지도에서만 original normal PNG를 transition layer로 사용한다. 따라서 legacy/core 지도는 기존 생성 fog를 유지하고, 모딩 지도는 해당 tilesetId를 명시해 opt-in할 수 있다. non-visible tile의 기존 complete fog/elevation bake를 먼저 유지하고, cardinal visible-neighbor 4-bit project mask가 nonzero인 flat tile에만 source PNG를 map diamond `tileWidth/32 × tileHeight/16`으로 draw한다. `64×32` K01 map tile에서는 정확히 `2×2`다. visible tile과 elevated tile에는 source transition을 draw하지 않으며, chunk boundary의 visible-neighbor 변화는 인접 dirty chunk도 한 번 더 bake한다. 이 bit order, mask table, alpha와 draw eligibility는 모두 source-backed **프로젝트 적응**이며 원작 parity 주장이 아니다.

## 재현 벡터와 남은 작업

focused tests는 original SHA/header mismatch가 extraction을 중단하는지와 두 output manifest/PNG hash가 일치하는지, visible/explored/unseen catalog result·invalid mask·missing source texture 오류, source/glyph actionGrid branch, 기존 4×3/12 slot geometry를 확인한다.

남은 작업은 fog 96-frame scheduler와 exact six-frame index algebra, mask/visibility 의미, 그리고 original control과 product action ID의 source-complete mapping이다.
