# Source building placement evidence

The original renderer derives a building's far occupied cell from the runtime entity center and the runtime footprint bytes. In `FUN_00438930` (`0x00438930-0x00438a90`) and `FUN_00438aa0` (`0x00438aa0-0x00438be8`), the signed fields are:

```text
farX = centerX - trunc(footprintWidth / 2) + footprintWidth - 1
farY = centerY - trunc(footprintHeight / 2) + footprintHeight - 1
```

The center is runtime `entity +0x1bc/+0x1be`, and the footprint is runtime `entity +0x1e3/+0x1e4`. These byte fields describe occupied cells. They are not SPR pixel dimensions. The bounded replay in [`extract-source-building-placement-evidence.mjs`](../../../tools/imjinrok/extract-source-building-placement-evidence.mjs) validates positive signed-byte extents, signed-word centers, signed runtime offsets, and signed-word output wrapping against the source stores. Its replay domain rejects far-cell arithmetic that would leave the signed WORD range; native intermediate WORD arithmetic can wrap outside this bounded vector domain.

The native pixel dimensions are loaded separately from the SPR slot table with stride `0xbf8`, using globals `+0x88c0bc/+0x88c0c0`, and copied to runtime `entity +0x1da/+0x1dc`. The renderer writes screen placement to `entity +0x1d6/+0x1d8`. The existing source-frame local pivot remains valid: flag `0x08` uses half the pixel height, while the clear branch uses pixel height minus the signed type record offset at `+0x0c`, with the signed `entity +0x16` and runtime `+0x1e0` adjustments.

`FUN_00438930` obtains projected coordinates through `FUN_00465010`; the replay fixture supplies the resulting signed projected pair explicitly. `FUN_00438aa0` directly reads the cached words at `0x843984/0x8633c4 + 4 * (farX * 180 + farY)`, represented by a separate explicit cached projected pair in the fixture. This evidence packet does not reproduce the camera transform, infer table lifetime, or claim that the raw isometric words are a native cell projection implementation outside those bounded consumers.

The source conclusion is static-confirmed and reproduced for the fixture vectors, including 3x3 center `(5,4)` to far `(6,5)`, 3x2 to `(+1,0)`, 2x2 and 1x1 to `(+0,+0)`, both pivot flag branches, nonzero signed runtime offsets, and the cached direct path. Representative SPR bytes for source classes 48, 49, 57, and 63 are independently hash-checked through the existing original-entity visual profile artifact.

제품 통합은 shared effective-footprint resolver를 통해 원본 anchor 원칙을 사용한다. K01 source profile에서는
class 48/49/50/51/52/57/58/60/62/63의 static-confirmed logical extent와 source-center anchor를
placement·collision·range 검사·build work path·client geometry에 적용한다. Generic/K02/mobile/unknown
kind는 기존 definition footprint와 project-center 동작을 유지한다. 따라서 K01 source profile의 HQ 상호작용
footprint는 원본 근거의 3×3이고 generic fallback은 4×4이다.

class 52 건설 완료는 제한된 intentional bridge를 사용한다. 엄격한 3×3 owner admission 전에 현재 semantic
blocker와 unknown owner는 계속 blocker로 남기고, live semantic owner가 해당 칸을 더 이상 차지하지 않는
경우에만 복사한 occupancy에서 해당 owner 칸을 정리한다. 이 bridge는 전체 source movement lifecycle을
동기화하거나 raw owner history를 다시 쓰지 않는다. 기존 v3 save에는 historical 1×1
`project-adaptation` beacon record가 남을 수 있으며, gameplay resolver는 계속 3×3을 계산한다. owner/lifecycle
history를 안전하게 복원할 수 없으므로 serialized record를 migration하지 않는다. native cell-cache의
생성·수명과 native owner/player 의미는 이 통합 범위 밖이다.

제한된 client QA에서도 source footprint geometry를 확인했다. source HQ의 중심 `(5,4)`와 마지막 점유
타일 `(6,5)`에 대한 3×3 footprint는 flat `64×32` projection에서 local offset `(0,32)`, body bottom `336`, contact/depth `336/356`을
유지했고, HQ·house·barracks·Japanese camp house·Japanese camp tower의 preview tile 집합은
geometry 결과와 일치했다. 대화 진행 후 upper-body 실제 마우스 선택도 기대한 entity를 선택했다.
적 geometry는 fog가 숨겨진 상태에서 계산 결과만 확인했으며, 적 visual frame이 렌더링됐다고 주장하지
않는다. 재현 산출물은 `/tmp/imjinrok-footprint-browser-geometry.json`과
`/tmp/imjinrok-footprint-browser-contact.json`이다.
