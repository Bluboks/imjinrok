# 임진록 낮·밤 팔레트 schedule

## 질문과 상태

질문: 원본은 어느 팔레트 파일을 어떤 상태 전이와 순서로 적용하며, 한 cycle은 몇 번의 허용된 update에서 wrap하는가?

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | 정적 확정 | `imjin2`·`night1`~`night4` 파일 identity, loader destination, state constructor/advance, palette/event 순서 |
| 재현 | 재현 완료 | constructor, 540/16 wrap, 모든 schedule event, gate, malformed input·변조 입력 거부 |
| 구현 | 부분 이식 | K01만 8,640 admitted-update cycle과 seven palette identity step을 opt-in한다. 한 product simulation tick을 한 admitted update로 취급하는 것은 의도적 calibration이며, renderer는 source-byte-backed overlay adapter다. |

## 고정 입력과 증거

- EXE: `original/imjinrok2/imjinrok2.exe`, SHA-256 `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`.
- structured reference artifact: `analysis/generated/imjinrok2/references.json`, SHA-256 `f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5`.
- palette files are each exactly 768 bytes and are individually SHA-bound by [`extract-imjinrok-day-night-schedule.mjs`](../../../tools/imjinrok/extract-imjinrok-day-night-schedule.mjs):

| file | SHA-256 | `FUN_00440540` path reference | destination |
| --- | --- | --- | --- |
| `pal/imjin2.pal` | `5ba2c020e9bd89210a10550fb4baaee8ab8bb316d4a2c7e66bdb24c6c8c4323b` | `0x004bbb58` | 이 bounded schedule은 destination을 명명하지 않는다 |
| `pal/night1.pal` | `b085583412b8bb79bdf9b72d836881be37f6f36ad50d073db06bebd1c2670122` | `0x004bbb2c` | `0x00bcd148` |
| `pal/night2.pal` | `c45727bd8ffed04bf572da5ab38b14b7fcb819f540a15a2e5d13730357bda17d` | `0x004bbafc` | `0x00bcd448` |
| `pal/night3.pal` | `4fe0c28dc64480c6f00876c5ee484e1b3caa77b3b63b27387c6cf7702c3d2f97` | `0x004bbaec` | `0x00bcd748` |
| `pal/night4.pal` | `f8328d22007407df426dff9e489f43718e28772d03b3ddd5f663a5dd57156e95` | `0x004bbadc` | `0x00bcda48` |

extractor는 `FUN_00440540` load/copy, `FUN_004400b0` palette apply, `FUN_004924c0` constructor, `FUN_00492510` advancement/schedule, `FUN_00492630` force branch, `FUN_00447360` caller branch의 여섯 raw range를 검증한다. destination, 일곱 schedule apply, 두 event, forced branch, gameplay call의 direct structured-reference edge도 검사한다.

## loader와 apply 경계

`FUN_00440540`은 각 path를 loader에 전달하고 반환 결과를 검사한다. 실패마다 shared cannot-open-palette reporting path를 타며 다른 palette로 조용히 대체하지 않는다. `night1`~`night4`는 연속한 0x300-byte region에 놓인다. `0x004407ab..0x004407ba`는 `0x00bcd148`에서 시작해 `0x300` DWORD를 `REP MOVSD`로 `0x00aa33e8`에 복사하므로, 연속한 네 palette의 0x0c00-byte block을 옮긴다.

`FUN_004400b0`은 palette address를 받는다. 처음 768 bytes를 256 RGB triple로 읽어 각 component를 두 bit left shift한 뒤 256-entry palette update를 downstream routine에 전달한다. 그 다음 supplied address에서 0x300 DWORD를 복사한다. 따라서 이 증거는 768-byte selected palette application과 0x0c00-byte contiguous block copy를 구분하며, 어느 address도 웹 true-color rule로 바꾸지 않는다.

## state와 schedule

`FUN_004924c0` initializes the state at `ECX`: `+0x00` cycle `0`, `+0x04` `-1`, `+0x08` phase `0`, `+0x0c` subTick `0`, `+0x10/+0x14` `0`, `+0x18` advance gate `0`, and `+0x1c` phase light flag `1`.

`FUN_00492510` first increments `subTick` only when `+0x18 == 0` and `subTick < 540`. When `subTick == 540`, it resets it to zero and increments phase. Phase 16 resets to zero and increments cycle. Every call then writes `+0x1c = 1` for phase `0..7`, otherwise zero. Consequently one complete raw cycle is `16 × 540 = 8640` admitted updates; phase 8/subTick 0 is reached after 4320 admitted updates from the constructor state.

Palette/event checks happen after that transition work:

| phase | subTick | ordered operations |
| ---: | ---: | --- |
| 8 | 0 | apply `night1`, then call event `0x41` |
| 8 | 2 | apply `night2` |
| 8 | 4 | apply `night3` |
| 8 | 6 | apply `night4` |
| 0 | 0 | apply `night3`, then call event `0x42` |
| 0 | 2 | apply `night2` |
| 0 | 4 | apply `night1` |

`FUN_00447360`은 관찰한 outer branch에서만 state address `0x007c60a8`로 이 update를 호출한다. 이 caller가 유일한 enable/disable condition이라는 주장은 하지 않는다. `FUN_00492630`은 별도로 `+0x1c == 1`이면 `night1`, 아니면 `night4`를 고른다. 상위 trigger와 전체 의미는 범위 밖이다.

## 재현 벡터와 경계

`analysis/fixtures/imjinrok-day-night-schedule-vectors.json`은 compact deterministic fixture다. test는 initial state, 540 boundary, phase-16/cycle wrap, 일곱 schedule branch와 operation order, held gate, forced palette branch, malformed synthetic state, tampered EXE, 모든 다섯 tampered palette input, stale references를 검사한다.

제품의 `imjinrok-k01` scaffold만 `cycleTicks: 8640`, `dayStartTick: 0`, `nightStartTick: 4320` 및
`night3 → night2 → night1` (tick `0/2/4`), `night1 → night2 → night3 → night4`
(tick `4320/4322/4324/4326`) visual step을 선택한다. tick `0`의 `night3`는 wrap event의 palette identity이고,
각 simulation tick을 one admitted update로 대응하는 정책은 원본 wall-clock/24 Hz equivalence 주장이 아닌
**의도적 calibration**이다. K01은 `nightSightMultiplier`를 설정하지 않으므로 sight는 `1`을 유지한다.

생성된 palette JSON은 source SHA-256과 768개 source RGB6 byte를 포함한다. 웹 renderer는 이 byte에서
결정론적으로 한 overlay tint/alpha를 계산하는 **source-backed-adaptation**만 수행한다. 이것은 original
indexed palette update나 true-color LUT/shader 일치가 아니다. 선택된 profile/palette resource가 없거나 SHA/data가
맞지 않으면 renderer가 명시적으로 실패한다.

이 증거는 raw update calls per wall-clock second, 24 Hz conversion, phase-light flag의 의도된 사람용 이름,
sight radius 변화, palette-shader/true-color port, 원본 map별 enablement, `FUN_00492630` caller를 확정하지 않는다.
generic map의 기존 light curve와 fog는 별도 intentional adaptation으로 유지한다.
