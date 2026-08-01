# K01 native 증원 슬롯·정확 배치 정책

분석 질문: K01의 아홉 native 증원 descriptor는 어떤 slot을 고르고, 언제 순회를 중단하며, signed
좌표 경계와 exact create 좌표는 어떻게 처리하고, 1×1 mobile occupancy는 기존 점유자를 어떻게 다루는가?

## 범위와 상태

- 분석 상태: `정적 확정` — descriptor→slot→create→create-return 직후의 위치·footprint·mode-1
  occupancy write에 한정한다.
- 재현 상태: `재현 완료` — 정상, 중첩, OOB, slot 고갈, signed WORD wrap 및 terminator 경로를
  독립 벡터로 재현했다.
- 구현 상태: `부분 이식` — K01 전용 action만 요청 좌표의 exact create를 선택한다. 원본 1,200-slot
  pool, generation, 명시적 occupancy-owner grid와 이후 이동·경로는 이식하지 않았다.

이 문서는 [native 증원 정체·요청 좌표 매핑](k01-reinforcement-identity-map.md)의 class/SPR 정체와
요청 좌표, [봉화대 완성·K0120 native trigger](k01-beacon-k0120-trigger.md)의 trigger gate를 전제한다.
raw owner WORD의 사람용 의미와 create-return 뒤의 이동 경로는 범위 밖이다.

## 원본 입력과 재현 도구

| 입력 | SHA-256 | 용도 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | 원본 PE32 x86 |
| `analysis/generated/imjinrok2/functions.json` | 같은 EXE source SHA-256 | 함수 경계·instruction hash |
| `analysis/generated/imjinrok2/seeds.json` | 같은 EXE source SHA-256 | call edge·anchor 교차 검증 |

독립 추출기는 [`extract-k01-reinforcement-placement-policy.mjs`](../../../tools/imjinrok/extract-k01-reinforcement-placement-policy.mjs),
재현 테스트는 [`k01-reinforcement-placement-policy.test.mjs`](../../../tools/imjinrok/k01-reinforcement-placement-policy.test.mjs)다.
`pnpm imjinrok:extract-k01-reinforcement-placement-policy`는 canonical JSON을 출력한다. 추출기는 입력
해시, 함수 instruction hash, call edge와 byte anchor가 canonical 분석 산출물과 다르면 실패한다.

## 함수 contract와 call chain

| 함수·범위 | 명령어 / instruction SHA-256 | 이 질문에서 확정한 역할 |
| --- | --- | --- |
| `0x00488420-0x004884b5` | 59 / `4b4841d6b3756b3d2dd3f3c6621ab98a413ce4608ea3d5c9c737ee1618c3ee8b` | signed descriptor 순회, allocate-before-bounds, failure/skip |
| `0x00483a60-0x00483a9c` | 25 / `887217ddc12a9bc4dd90c38b9365be9bcaf65f14e1d0c709de86c62479cbd917` | inactive slot 1..1199 signed reuse-age 선택·증가 |
| `0x00483c50-0x00483c9f` | 26 / `d33ed40b3a614bcc92bc4b3b429dd372e61b4ef6ccb03b290feffd80c7a9ab4e` | generation WORD 증가 뒤 initializer 호출 |
| `0x00437650-0x00438025` | 539 / `4605056775f6f43c9b2065ea5a4ddff5570137eb87587f4a09d2018618e13c28` | slot/generation/x/y·footprint·action·mode 초기화 |
| `0x0045bd00-0x0045bef8` | 103 / `6561fe98f630ac5f7f0765426c257c4bc3900aae6d2964afa649447cb5030e8a` | type footprint writer |
| `0x0045bf50-0x0045efb9` | 5,100 / `1fcf54f5ad46f30893b04871058a6c307a0ef32e8dab2c689be4cc18fb980133` | type flags/initializer |
| `0x0043aa80-0x0043ab6f` | 52 / `4d12a0f4c96872eeba5e2fa89f6bba5176be525322cc6e69fd54f62ff8c2291f` | constructor direct helper |
| `0x00438790-0x0043892b` | 126 / `4f4ef2f14f512d8f16a39acdcd0febb611cd2ec63801f37a4a987f21ecc026da` | constructor direct helper |
| `0x0043c9c0-0x0043d35f` | 684 / `eb1c7c21a9af5a2099a2d716ad1253db65fff75ef0befcae871e3462f4d3bcfa` | action-1 create-return dispatcher |
| `0x0043c300-0x0043c9b1` | 524 / `7b235cc2bd3826f8cc3e6d7c69cd7dd063cbd753a09e2cd2ee6904d4d17900ee` | immediate path의 x/y read, rewrite 없음 |
| `0x0043ad30-0x0043b2c0` | 399 / `73e365929407986912a6ab530245b134f87af2d5a65290b2137ffedef90acdfa` | mode-1 footprint occupancy write |

K01 match block은 `0x0048a7ae → 0x00488420(55, 53, 0x10, descriptors)`를 호출한다. helper의 내부
chain은 `0x00488440 → 0x00483a60`, 허용 좌표만 `0x00488494 → 0x00483c50`,
`0x00483c95 → 0x00437650`이다. constructor는 `0x00437f9c → 0x0043aa80`,
`0x00438013 → 0x00438790`, `0x0043801a → 0x0043c9c0`을 순서대로 호출한다. action 1 case는
`0x0043cdac → 0x0043b2d0`, `0x0043cdb3 → 0x0043c300`, `0x0043cdba → 0x0043ad30` 순서다.

## descriptor·slot·좌표 정책

K01 descriptor는 class, raw owner, signed `dx`, signed `dy`의 WORD 네 개이며 class `0`이 terminator다.

```text
(13,1,-2,-2) (82,1,0,-2) (13,1,2,-2)
(14,1,-2, 0) (14,1,0, 0) (14,1,2, 0)
(12,1,-2, 2) (12,1,0, 2) (12,1,2, 2)
class 0
```

`0x00488420`은 terminator면 allocate/create 없이 성공 `1`을 반환한다. 각 nonzero descriptor는 좌표
검사보다 먼저 allocator를 호출한다. `0x00483a60`은 active table 값이 `0`인 slot `1..1199`만 후보로
훑고, signed reuse age의 초기 best `0`보다 `age >= best`인 후보를 선택한다. 동률이면 나중 slot이
이긴다. 훑는 모든 inactive 후보의 age WORD는 선택 여부와 무관하게 증가하며 wrap한다. slot `0`은
훑거나 증가시키지 않으며, 모든 inactive age가 음수이면 best가 갱신되지 않아 `0`이 반환된다.

allocator가 `0`을 반환하면 남은 descriptor를 즉시 중단하고 `0`을 반환한다. 이미 생성한 record는
되돌리지 않는다. allocator 성공 뒤 signed WORD `origin + offset`을 계산한다. x/y 중 하나가 음수거나
map width/height 이상이면 해당 descriptor의 create만 건너뛰고 다음 descriptor로 계속한다. allocator가
갱신한 age는 남는다. 허용 좌표만 `0x00483c50(type, slot, x, y, 0x10, 100, owner)`로 넘긴다.

origin `(55,53)`의 정상 요청 좌표는 다음 순서이며 fresh state에서는 slot `1199..1191`, generation
`1..9`가 된다.

```text
(53,51) (55,51) (57,51)
(53,53) (55,53) (57,53)
(53,55) (55,55) (57,55)
```

`0x00483c50`은 generation WORD를 먼저 증가시키므로 `0xffff → 0` wrap도 원본 규칙이다.

## record·footprint·occupancy

`0x00437650`은 record에 slot을 `+0x1b6`, generation을 `+0x1b8`, signed x/y를 `+0x1bc/+0x1be`에
기록한다. action `1`은 `0x00437719`에서 설정되어 `0x0043783a`에서 `+0x1b0`에 기록된다.
create-return의 `0x0043c300`은 이 좌표를 읽지만 다시 쓰지 않는다.

type writer `0x0045bd00`은 paired footprint argument를 type `+0x14/+0x16`에 쓰며 K01 class의 두 값은
모두 `1`이다.

| class | flags | footprint push / initializer call | 결과 |
| ---: | --- | --- | --- |
| 12 | `0x0c082805` | `0x0045c3a4`, `0x0045c3a5` / `0x0045c3be` | 1×1, bit `0x08` clear |
| 13 | `0x00089005` | `0x0045c527`, `0x0045c528` / `0x0045c541` | 1×1, bit `0x08` clear |
| 14 | `0x80143205` | `0x0045c826`, `0x0045c827` / `0x0045c843` | 1×1, bit `0x08` clear |
| 82 | `0x00880805` | `0x0045dd0d`, `0x0045dd0e` / `0x0045dd2a` | 1×1, bit `0x08` clear |

`0x00437d46`은 type flag bit `0x08`이 clear이면 record mode `+0x68 = 1`로 만든다.
`0x0043adf9`의 mode-1 loop는 map x/y만 경계 검사한 뒤 record slot `+0x1b6`을
`0x00ac2da4 + cell*2`에 무조건 기록한다. 기존 owner가 0인지 검사하지 않으므로 같은 1×1 cell에
나중에 생성한 record가 occupancy owner를 덮어쓴다. reject나 relocate는 이 범위에 없다.
`0x0043c58c`의 nearby-empty search는 bit `0x08`이 set일 때만 들어가므로 K01 네 class에는 적용되지 않는다.

이 문서의 native 증원 class 12·13·14·82는 type `+0x14/+0x16 = 1×1`인 별도 범위다. K01 map opening
building의 wider footprint는 [K01 opening footprint anchor](k01-opening-footprint-anchor.md)에서
class 49 `(5,4) → x=4..6,y=3..5`의 3×3, class 7 `(7,6) → (7,6)`의 1×1 control과 함께 닫았다.
따라서 class 49의 3×3은 class 7 cell을 포함하지 않으며, 이 결과는 P01의 증원 1×1 contract를
확장하거나 production placement를 바꾸지 않는다.

## 재현 벡터

- 정상: 위 descriptor에서 요청 좌표 9개, slot `1199..1191`, generation `1..9`.
- 중첩: 같은 cell 두 create는 둘 다 record를 보존하고 occupancy owner만 뒤 slot으로 덮어쓴다.
- OOB: allocator와 age update 뒤 create를 skip하고 다음 descriptor를 계속 처리한다.
- 고갈: all-active 또는 모든 inactive age가 음수여서 slot `0`이면 이후 descriptor를 중단하되 앞선
  record는 보존한다.
- WORD 경계: generation `0xffff → 0`, reuse age `0x7fff → -0x8000`.
- terminator: class `0`은 allocate나 create 없이 성공 `1`.

## 현재 포트와 경계

`packages/shared/src/scenarios.ts`의 K01 `k01-reinforcement-wave`만
`placementPolicy: "requested-position-exact"`을 쓴다. 이 opt-in은 raw `origin+offset` 요청을 그대로
사용하고 OOB request를 skip하며, in-bounds request는 terrain/passability, occupancy,
`findOpenSpawnPoint`를 우회해 exact create한다. 기본 spawn은 기존 clamp+open-point 탐색 정책을 유지한다.

이식 범위는 요청 좌표의 exact creation뿐이다. create-return 이후 action 1, movement coordinate commit,
death/release와 stale owner side-effect의 source-bound 결과는 [K01 occupancy-owner transition](k01-occupancy-owner-transition.md)에서
별도로 정적 확정·재현했다. 프로젝트 `state.units`는 동일 좌표의 unit 공존을 허용하지만,
원본의 1,200-slot allocator, signed reuse-age, generation, explicit occupancy-owner grid와 그 grid의
overwrite 저장 모델을 구현하지 않는다. 이후 movement/pathfinding 및 네 class의 stats·행동도 이 메커니즘으로
원작 일치라고 주장하지 않는다.

현재 project `town-center` definition의 `4×4 blocksMovement` footprint는 UI/gameplay collision을 위한
프로젝트 adaptation이다. X02는 이 값을 source class 49의 3×3으로 교체하지 않았고 production runtime
footprint/collision behavior를 변경하지 않는다. source parity가 필요한 경우에는 source anchor evidence와
별도의 project coordinate/visual adapter를 먼저 승인해야 한다.

## 남은 질문

- create-return 뒤 movement/pathfinding이 slot·occupancy를 언제 어떻게 소비·갱신하는가
- raw owner WORD의 사람용 의미
- 원본 1,200-slot record/occupancy grid를 프로젝트 저장 모델에 옮길 필요와 방법
