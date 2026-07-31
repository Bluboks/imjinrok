# 원본 `clock.spr` 정체와 웹 HUD 시계 경계

## 질문과 범위

원본 실행 파일과 자원은 `fnt\\clock.spr`을 어떤 자원으로 식별하며, 그 사실만으로 원작의 미니맵 인근
시계 프레임·배치·갱신과 시간→바늘 각도를 확정할 수 있는가?

이 문서는 자원 정체와 컨테이너 형식만 다룬다. `clock.spr`의 외형을 보고 프레임이나 바늘 의미를 붙이지
않으며, 640×480 화면 관찰을 배치 근거로 사용하지 않는다.

## 분석 상태

- 분석 상태: `정적 확정` — 자원 정체와 SPR 컨테이너의 한정 범위
- 재현 상태: `재현 완료` — 경로 pointer·자원 hash·header vector
- 구현 상태: 웹 시계의 표시·반응형 배치는 `의도적 적응`; 원본 시계 frame/draw/time mapping은 `없음`

## 원본 입력과 정적 근거

| 입력 | SHA-256 | 확인 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | `0x004bc200` data-table entry와 `0x004bd2ec` ASCII path |
| `analysis/generated/imjinrok2/references.json` | `f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5` | `0x004bc200 → 0x004bd2ec` DATA edge |
| `original/imjinrok2/fnt/clock.spr` | `c142349b5aa68f3659a99b42fc9aff8ca541758f0504549b24f27a928e1a08e6` | IMJIN SPR header와 20개 frame container |

`0x004bc200`의 four-byte little-endian 값은 `0x004bd2ec`이며, 그 주소의 null-terminated 문자열은
정확히 `fnt\\clock.spr`이다. 해시 결박 파서는 `clock.spr`가 32×36, 20 frame임을 확인한다. frame
0~15의 encoded byte size는 각각 900이고 decoded opaque pixel은 각각 804이다. frame 16~19는 각각
72 byte이며 decoded opaque pixel은 0이다. 따라서 제품 adapter는 실제 nonblank subset 0~15만 선택한다.
그러나 이 데이터 차이만으로 각 frame의 시계면·바늘·상태 의미를 부여할 수 없다.

재현 fixture와 export 명령:

```bash
pnpm imjinrok:extract-source-clock-asset
pnpm imjinrok:export-source-clock-assets
```

두 번째 명령은 `apps/game-client/public/assets/themes/default/ui/source-clock/`에 원본 20 frame을
손실 없이 PNG로 내보내고 manifest에 원본 hash를 기록한다. manifest의
`source-identity-with-intentional-superset-runtime-adapter` 표기는 source identity와 제품 frame selection을
분리한다.

## 닫히지 않은 경계

현재 canonical reference artifact에서 위 data-table entry를 원본 draw call까지 잇는 완전한 제어 흐름은
복원하지 못했다. 따라서 다음은 모두 `미확인`이다.

- 어느 frame이 시계면·시침·분침 또는 다른 UI 상태인지
- 원본 HUD/minimap에서의 픽셀 배치, clip, input ownership
- 원본 update trigger와 game clock의 단위
- 원본 시간 상태에서 frame/hand angle로 가는 계산식

이 항목을 원작 일치로 올리려면 loader→draw caller의 전체 분기, 입력 상태, frame selector, placement와
갱신 경로를 확인하고 정상·경계·실패 vector를 추가해야 한다.

## 제품 적응 계약

`apps/game-client/src/ui/hudClock.ts`는 source identity를 사용하는 제품 HUD clock adapter다.

- 입력은 `SkirmishScene`이 simulation `worldState.environment`에서 그대로 publish한
  `BattlefieldEnvironmentView.environment.timeOfDay01` 하나다. browser wall clock이나 scene time은 읽지 않는다.
- adapter는 exported `clock.spr` frame 0~15만 preload하고 nearest filtering으로 하나의 non-interactive
  Phaser Image를 재사용한다. environment publish마다 object를 만들지 않고 texture만 바꾼다.
- frame selector는 `floor(normalized timeOfDay01 * 16) % 16`이다. 0~15가 nonblank라는 컨테이너 관찰과
  normalized simulation progress를 연결한 명시적 web superset 정책일 뿐, 해당 frame의 원작 시계면·바늘
  의미나 원작 시간→frame mapping을 복원했다는 주장이 아니다. frame 16~19는 runtime에서 선택하지 않는다.
- `resolveMinimapHudAncillaryLayout()`은 minimap panel bounds에서 clock bounds와 left zoom rail bounds를
  함께 반환한다. 시계는 title rail의 오른쪽, zoom rail은 왼쪽 본문에 예약되어 이후 +/- control과 겹치지 않는다.
- Image는 interactive object를 만들지 않아 minimap navigate 또는 후속 zoom input을 가로채지 않는다.

이 어댑터는 원본 palette schedule의 `8,640 admitted update` 단위나 프로젝트 24 Hz 변환을 frame selector에
재사용하지 않는다. 이는 [낮·밤 팔레트 schedule](imjinrok-day-night-palette-schedule.md)의 미해결
wall-clock calibration 경계를 유지한다.

## 재현 벡터

| vector | 입력 | 기대 결과 |
| --- | --- | --- |
| resource pointer | original EXE의 `0x004bc200` | `0x004bd2ec`, `fnt\\clock.spr` |
| sprite header | hash-bound `clock.spr` | `32×36`, 20 frame |
| cycle start | `timeOfDay01=0` | source frame 0 |
| quarter cycle | `timeOfDay01=.25` | source frame 4 |
| end boundary | `timeOfDay01=.9999` | source frame 15 |
| wrap | `timeOfDay01=1` | source frame 0 |
| responsive collision | 190×136 / 280×178 minimap bounds | clock bounds와 left zoom rail bounds가 disjoint |

`tools/imjinrok/source-clock-asset.test.mjs`는 원본 identity fixture와 hash rejection을, `hudClock.test.ts`는
adapter frame selection 및 responsive rail collision을 검사한다.

## 다음 분석 작업

원본 resource-table index를 소비하는 loader와 실제 HUD drawing caller를 정적으로 추적하고, frame selector와
placement/update state를 별도 좁은 질문으로 복원한다. 그 전에는 exported PNG나 현재 web clock의 자연스러운
외관을 원작 시계의 증거로 사용하지 않는다.
