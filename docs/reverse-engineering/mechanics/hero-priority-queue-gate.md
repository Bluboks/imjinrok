FUN_0043c300의 player-scoped production-filter queue gate는 어떤 입력·HUD control·writer·reset 경로를 가지며, FUN_00428580/FUN_0047fe10이 우선 추출하는 action/type 집합은 사용자가 기억한 unit-production queue의 global hero-priority toggle과 정확히 일치하는가?

# Hero-priority production queue gate

## 판정과 상태

- **판정: 정적 확정.** 이 후보는 사용자가 기억한 생산 queue의 영웅 우선순위 toggle이다.
  단, 저장소는 process 전체의 단일 값이 아니라 player record마다 하나씩 존재하는 WORD다.
  여기서 “global”은 특정 생산 entity 하나가 아니라 해당 player의 queue pump 전반에 적용된다는
  UI 의미다.
- **분석 상태: 정적 확정.** gate 저장 위치·폭·정확한 비교, actions `63/64` writer,
  player owner reset, selection-count-zero HUD slot, queue filter의 229개 initialized action
  record와 95개 produced-type record 전수를 원본 EXE와 current generated evidence에 고정했다.
- **재현 상태: 범위 한정 재현 완료.** synthetic layout의 control 선택·strict hit,
  actions `63/64`의 gate write, gate off/on의 full 12-byte queue record 선택·제거·FIFO
  fallback·redelivery 시도 순서를 full-result digest로 재현한다.
- **구현 상태: 분석 전용.** 제품 UI·simulation·shared contract는 변경하지 않았다. 원본은
  compatibility slice이며 responsive, multi-selection, mana, health와 추가 상태를 가진
  project UI를 지배하지 않는다. Noto/Canvas typography도 의도적 프로젝트 적응이다.
- **검토 기록:** Root Codex가 2026-07-28에 read-only review를 수행했다.

후속 [magic auto-use gate 분석](magic-auto-use-gate.md)은 인접 slot 0을 별도
player-global toggle로 정적 확정했다. 생산 버튼 우클릭 persistent HUD reservation/pinning은
계속 별도 미확정 lead다. 인접 field라는 이유만으로 두 gate나 pinning을 합치지 않는다.

## 원본 provenance

- EXE:
  `original/imjinrok2/imjinrok2.exe`
- EXE SHA-256:
  `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- `seeds.json` SHA-256:
  `386b0f4e86c3376f34fe2b50fedb7e45b762c30784d4ebcc0387aa6f431811b2`
- `functions.json` SHA-256:
  `7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e`
- `references.json` SHA-256:
  `f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5`
- extractor:
  `tools/imjinrok/extract-hero-priority-queue-gate.mjs`
- fixture:
  `analysis/fixtures/hero-priority-queue-gate-vectors.json`

extractor는 21개 whole raw-code range와 대응하는 complete function body metadata, 28개 exact
byte anchor를 검증한다. 주요 경계는 다음과 같다.

| 경계 | VA 범위 | raw SHA-256 |
| --- | --- | --- |
| queue pump owner | `0x0043c300-0x0043c9b2` | `58058d5b317f151334c5e9190703a5ed7b8aa88cce02a8be36ffa7746f75b756` |
| filtered/FIFO wrapper | `0x00428530-0x004285ca` | `96e30386c3110857061d79b6de7a43ec1d4e3e35ec7525e0798176fc21d1f285`, `63cd5585177b970d0175bee6e5f6485bdb0cfc55436f784d6cc4967e33427d3d` |
| filtered/FIFO pop | `0x0047fda0-0x0047fef0` | `7fe6f43a6f56e7100c1777bfbc1b1b14b5764e70de24985eafda8e771462283a`, `f3ebc24568b1e02822bb704d26eb62fdb0fa0eb4cd295f1e9836a261a7bf0225` |
| gate command consumer | `0x00477f50-0x00478247` | `e6ddd9ed5fd10ea374e4d37b349234f6a1ee638978350e7fa82b1015f574a4ca` |
| no-selection producer | `0x0045b3a0-0x0045b41a` | `782d749759dac1060c16b04fb2bf7388530bfd02245b663f92be3f247931514e` |
| control initializer/writer | `0x00457700-0x004590ab`, `0x004576c0-0x004576f9` | `0a5ab739311f3a5a9f34bc40130e4f920eca24c9a7d0338346858c2a898117c3`, `ec5599a94d3add2e24c2ddaf431d9340f6e58028c478425c02e9a909a89b04ec` |
| action definitions | `0x00476820-0x00477cb6` | `560fffd80c7690646e58fa46a662eea0f18bacb329f5ad067287176c2dc5aad4` |
| type definitions | `0x0045bf50-0x0045efba` | `dd9fb78ef95091369b138c654a1f157a9425a778ce92d226aa975b73a90ff93b` |
| player reset | `0x0047df30-0x0047e041` | `9caa28a318ca161e0c859536ce6a4135e5b08f4fbc1e3668149f599d798c93db` |

canonical structured set도 count와 SHA-256 digest로 고정한다.

| complete set | count | canonical SHA-256 |
| --- | ---: | --- |
| player-0 gate `0x0082e9ce` direct refs | 6 | `10892d3d70ade33544cf16377e398ee8a3baa8d9852495a0bb2d69e24ceecbac` |
| `FUN_0043c300` callers | 1 | `511ee9c058f2d70d7c5b1509b85c0b22030b48e2d75f7d2202f7bba42db8b5fe` |
| `FUN_00428530` / `FUN_00428580` callers | 1 / 1 | `98c395ace336d81b5579a8c4d50ff3fae53630f3975e7a9984df72b99ac49835` / `13ea87efa571b11679528e08cb1054fb4d7ad39e7b872a93666215ca1d51690b` |
| `FUN_0047fda0` / `FUN_0047fe10` callers | 1 / 1 | `97e818f37081180ae9a910cafb361360224696b12918eef4246cd91bf5ef3311` / `2ee46265c8423e5bbe7f7fdb1948c9b71b0db8358313b63acd348246ed326cec` |
| action constructor callers | 229 | `a2f09338859687dbc5ec10894af3c24efbab06e55590b952ce87d2f39777af3f` |
| type constructor callers | 95 | `fff383cbaf779191fa07b02392b16681cd5254f59227dfc474bdfb4a98781181` |

## player-scoped gate와 lifecycle

player record base는 `0x0082c480`, stride는 `0x2c10`, player 수는 8이다. gate는 각 record
`+0x254e`의 raw WORD이며 player 0 absolute address가 `0x0082e9ce`다.

1. `FUN_00460ba0`은 정확히 8개 record를 stride `0x2c10`으로 순회해 `FUN_0047df30`을
   호출한다.
2. `FUN_0047df30`은 record 전체 `0x2c10` bytes를 zero로 채운다. gate 초기/reset 값은 0이다.
3. `FUN_00477f50`은 player마다 50개 command record를 스캔한다. action WORD `63`은 gate에
   exact WORD `1`, action WORD `64`는 WORD `0`을 쓰고 command를 소비한다.
4. `FUN_0043c300`은 entity `+0x38` player byte를 signed extend해 같은 `0x2c10` stride를
   만든다. gate WORD가 정확히 1일 때만 filtered wrapper를 먼저 부른다. 다른 모든 raw WORD는
   off와 같다.

absolute direct-reference set은 player 0 주소의 read/write를 닫는다. player loop의 indexed access와
whole-record reset은 exact instructions와 whole functions로 별도 고정했다. 구조화 참조 밖 alias나
save/load bulk copy가 없다고 주장하지 않는다.

## selection-count-zero HUD control

`FUN_00459490`은 action slot 9개를 clear한 뒤 selection-count raw WORD가 정확히 0일 때만
`FUN_0045b3a0`을 호출한다. 이 producer는 action owner `0x007c5ed8`에 다음 두 control을 둔다.

| slot | 조건 | control ID | action WORD | frame/resource index |
| ---: | --- | ---: | ---: | ---: |
| 0 | 인접 별도 gate가 0 / nonzero | `0x21` / `0x22` | 61 / 62 | 27 / 26 |
| 1 | hero-priority gate가 0 / nonzero | `0x23` / `0x24` | 63 / 64 | 28 / 29 |

slot 1이 이번 질문의 대상이다. slot 0의 actions `61/62`는 이 문서 범위에서는 별도 gate이며,
후속 [독립 분석](magic-auto-use-gate.md)에서 global magic auto-use로 확정했다.

`FUN_00459110`의 slot rectangle은 signed WORD layout globals로 계산한다.

```text
column = slot % WORD[0x0088bd62]
row    = trunc(slot / WORD[0x0088bd62])
x      = WORD[0x0088bd6c] + column * (WORD[0x0088bd64] + WORD[0x0088bd68])
y      = WORD[0x0088bd6e] + row    * (WORD[0x0088bd66] + WORD[0x0088bd6a])
w      = WORD[0x0088bd64]
h      = WORD[0x0088bd66]
```

hit은 `left < pointerX < right`, `top < pointerY < bottom`의 strict interior다. frame/resource
indices `28/29`의 원본 파일명과 픽셀 의미는 이번 slice에서 닫지 않았다. generic pointer-release
command packing도 이전 input-transport 분석의 static evidence로 남기고 이 fixture의 재현 결과에
포함하지 않았다.

## production filter 전수 분류

`FUN_0047fe10`은 queue record의 action WORD로 20-byte action definition을 찾는다. 먼저
action flags WORD bit `0x8`을 검사하고, 통과하면 action `+4`의 produced internal class가
가리키는 type record `+0x20` DWORD bit `0x8`을 검사한다.

extractor는 `FUN_00476820`의 constructor call 229개와 `FUN_0045bf50`의 type constructor
call 95개를 모두 복원했다. 두 조건의 교집합은 정확히 다음 16개 action이다.

| action | internal class | 원본 catalog 이름 |
| ---: | ---: | --- |
| 115 | 76 | 조선 권율 |
| 116 | 77 | 조선 이순신 |
| 117 | 78 | 조선 유성룡 |
| 118 | 79 | 조선 사명대사 |
| 119 | 80 | 조선 곽재우 |
| 120 | 94 | 조선 허준 |
| 121 | 82 | 일본 고니시 |
| 122 | 83 | 일본 가토 |
| 123 | 84 | 일본 와카자키 |
| 124 | 85 | 일본 세이쇼오 |
| 125 | 86 | 일본 우기다 |
| 126 | 87 | 명 이여송 |
| 127 | 88 | 명 조승훈 |
| 128 | 89 | 명 심유경 |
| 129 | 90 | 명 진린 |
| 130 | 91 | 명 여여문 |

모두 action flags `0x108`, produced-type `+0x20` value `8`이다. bit `0x8`인 type class 집합에서
분신 81, 선조의 어가 92, 도공 93은 제외되고, named character class 76~80, 82~91, 94만
action 교집합에 남는다. 한 action이나 권율 하나에서 “hero”를 추정한 것이 아니라 action/type
전수 교집합과 원본 type catalog 이름으로 분류를 닫았다.

## queue ordering과 실패/no-op

- gate off: `FUN_00428530`/`FUN_0047fda0`이 index 0 FIFO record를 제거한다.
- gate exact 1: `FUN_00428580`/`FUN_0047fe10`이 앞에서부터 첫 hero action을 찾는다.
- hero action이 없으면 filtered pop은 0을 반환하고 owner가 FIFO wrapper로 fallback한다.
- queue count signed WORD가 nonpositive이면 pop은 record를 읽지 않고 0을 반환한다.
- 성공 시 선택한 12-byte record 전체를 복사하고 뒤 record를 앞으로 shift한 다음 count WORD를
  감소시킨다.
- wrapper는 제거 후 `FUN_00426740`을 호출한다. filtered wrapper constant는 30, FIFO wrapper
  constant는 20이다. 둘 다 deeper delivery return을 관찰하지 않아 실패해도 제거를 rollback하지
  않는다.

fixture는 bounded queue `0..20` records만 받는다. 정상 FIFO, first-hero priority,
no-hero fallback, exact-one 비교, empty queue, 20-record boundary를 full returned output과
SHA-256 digest로 검사한다. control 입력은 supplied synthetic layout이며 실제 runtime 좌표나
resource pixel을 관찰했다는 뜻이 아니다. invalid raw DWORD/WORD, queue width, reached-only
field는 loud하게 검사한다.

## 남은 경계와 다음 질문

이번 질문의 verdict는 **confirmed hero-priority toggle**이다. 다만 다음은 범위 밖이다.

- `FUN_00426740` 이후 재전달 성공/실패와 생산 entity의 후속 state update
- frame/resource indices `28/29`의 파일 identity
- structured direct refs 밖 save/load 또는 alias writer
- adjacent actions `61/62` gate의 class별 deeper effect
- 생산 버튼 우클릭 persistent HUD reservation/pinning의 실제 action/owner

후속 분석은 selection-count-zero slot 0의 actions `61/62`와 인접 player WORD gate가
사용자가 기억한 global magic auto-use toggle임을 정적 확정했다. 다음 독립 질문은 K01 class
78의 auto-use effect 전체 또는 remembered right-click pinning의 실제 action/owner다.
