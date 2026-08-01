# K01 occupancy-owner transition: create·movement·death/release

## 범위와 상태

이 문서는 원본 K01 native entity의 슬롯 선택·record 초기화 뒤 `action 1`에서 occupancy-owner와
mask를 읽고 쓰는 순서, 이동 좌표 commit 경계, death/outer-release 실패 부작용을 정적 분석으로
닫는다. 프로젝트 production package/app에는 변경이 없다.

- 분석 상태: `정적 확정` — 아래 함수·call edge·byte anchor 범위에 한정
- 재현 상태: `재현 완료` — 20개 독립 vector와 tamper/root-independence test
- 구현 상태: `analysis-only-no-production-change`
- 상위 문서: [K01 source handle lifecycle](k01-source-handle-lifecycle.md), [K01 native placement policy](k01-reinforcement-placement-policy.md)
- 기존 경계 문서: [K01 mobile occupancy update boundary](k01-mobile-occupancy-boundary.md)은 이 문서가
  action 1/movement/release의 bounded successor다.

## 입력·재현 도구

| 입력 | SHA-256/경로 |
| --- | --- |
| 원본 PE32 x86 | `original/imjinrok2/imjinrok2.exe` · `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| 함수 산출물 | `analysis/generated/imjinrok2/functions.json` · source SHA 위와 동일 |
| reference 산출물 | `analysis/generated/imjinrok2/references.json` · source SHA 위와 동일 |
| seed 산출물 | `analysis/generated/imjinrok2/seeds.json` · source SHA 위와 동일 |
| vector fixture | `analysis/fixtures/k01-occupancy-owner-transition-vectors.json` |

추출기는 [`extract-k01-occupancy-owner-transition.mjs`](../../../tools/imjinrok/extract-k01-occupancy-owner-transition.mjs),
테스트는 [`k01-occupancy-owner-transition.test.mjs`](../../../tools/imjinrok/k01-occupancy-owner-transition.test.mjs)다.
다음 명령은 canonical root를 출력하며 EXE/source SHA, 함수 instruction SHA, 두 artifact의 call edge,
raw byte anchor, vector replay SHA가 어긋나면 실패한다.

```sh
pnpm imjinrok:extract-k01-occupancy-owner-transition
node --test tools/imjinrok/k01-occupancy-owner-transition.test.mjs
```

## 함수 계약과 raw 근거

| 함수 | body range · instruction count/SHA-256 | 이 질문에서 확정한 역할 |
| --- | --- | --- |
| `FUN_00488420` | `0x00488420-0x004884b5` · 59 / `4b4841d6b3756b3d2dd3f3c6621ab98a413ce4608ea3d5c9c737ee1618c3ee8b` | native descriptor allocate-before-bounds, skip/abort |
| `FUN_00483a60` | `0x00483a60-0x00483a9c` · 25 / `887217ddc12a9bc4dd90c38b9365be9bcaf65f14e1d0c709de86c62479cbd917` | inactive slot `1..1199`, signed reuse-age |
| `FUN_00483c50` | `0x00483c50-0x00483c9f` · 26 / `d33ed40b3a614bcc92bc4b3b429dd372e61b4ef6ccb03b290feffd80c7a9ab4e` | generation increment → initializer |
| `FUN_00437650` | `0x00437650-0x00438025` · 539 / `4605056775f6f43c9b2065ea5a4ddff5570137eb87587f4a09d2018618e13c28` | record slot/generation/signed x/y/action/mode init |
| `FUN_0043c9c0` | `0x0043c9c0-0x0043d35f` · 684 / `eb1c7c21a9af5a2099a2d716ad1253db65fff75ef0befcae871e3462f4d3bcfa` | action dispatcher |
| `FUN_0043b2d0` | `0x0043b2d0-0x0043b4cd` · 157 / `c786f3bdbb59cd8e26ec6701baede222c2b8f756ae26dfc1acddc48e2e1f285d` | mobile prior owner/mask clear |
| `FUN_0043c300` | `0x0043c300-0x0043c9b1` · 524 / `7b235cc2bd3826f8cc3e6d7c69cd7dd063cbd753a09e2cd2ee6904d4d17900ee` | action-1 movement helper; immediate path reads, not x/y rewrite |
| `FUN_0043ad30` | `0x0043ad30-0x0043b2c0` · 399 / `73e365929407986912a6ab530245b134f87af2d5a65290b2137ffedef90acdfa` | mobile mode-1 mask OR/slot store |
| `FUN_00425af0`/`FUN_00425b20` | `0x00425af0-0x00425b10` 11 / `272a5455b2f3c25d58ce435d1823c517615c8b739dc4952c8aec1f8cb03ce29c`; `0x00425b20-0x004262df` 506 / `088a31ecaf83338b1823a4a21e14bb859690289d56f8bc53338145492a8e24c7` | K01 normal movement wrapper/commit |
| `FUN_0043ac50` | `0x0043ac50-0x0043ad21` · 74 / `bc64656f61574d2f6ad65590c9ee8b565f34b99fd5be10bb72d6ee5c311583bb` | footprint mask blocked consumer |
| `FUN_00445290`/`FUN_0043d540` | `0x00445290-0x0044532d` 58 / `02f38d2a527b4e57521e7872f0d0f8c6952b9cad70044dbe7a1dffa672fc3438`; `0x0043d540-0x0043d65b` 71 / `98aea3591f2813434aeb6cc048dc36b911c858067f86b2d25ed3eccb2025453f` | movement path gate / post-coordinate processing |
| `FUN_004651b0` | `0x004651b0-0x00465206` · 25 / `e6d8ffb30a8a925132578ce7c128fecc49f90e0d5a4d3a58dc42a33b02a0fd26` | mask cell high-nibble clear |
| `FUN_00447360`/`FUN_00483aa0` | `0x00447360-0x00447599` 156 / `8700298d4e2900a0f2833b1f9e1143c47d324478ef5fa419170e7945de7dd772`; `0x00483aa0-0x00483c2e` 95 / `f9b1728467f73a29667e631456c36d26eda15b6f44e8c89b78c6b1ec25f27be9` | outer update release gate / active-list release |

검증된 action-1 edge는 `0x0043cdac → 0x0043b2d0 → 0x0043c300 → 0x0043ad30` 순서다.
movement는 `0x00425e1e → 0x0043ac50`, `0x00425c59 → 0x00445290`, commit 뒤
`0x00426004 → 0x0043d540`를 거친다. outer update는 `0x00447499 → 0x0043c9c0`, 반환 `0`일 때
`0x004474a6 → 0x00483aa0`, release는 `0x00483ad4 → 0x0043b2d0`다.

주요 raw anchor는 native allocation `0x0048843f`, initializer stores `0x0043782e`, action-1 call
sequence `0x0043cdac`, mobile clear/store `0x0043b35a`/`0x0043adf9`, movement mask/commit
`0x00425e1e`/`0x00425f90`/`0x00425fb3`, mask clear `0x004651ee`, outer release
`0x00447499`/`0x00483c1b`다. 추출기가 각 anchor의 raw bytes와 file offset을 함께 보고한다.

## 저장 모델과 전이 순서

- owner grid: `0x00ac2da4`, WORD, `index = x*0xb4+y`, K01 map 60×60, empty `0`; mobile mode-1은
  record `+0x1b6` slot만 쓴다.
- mask grid: `0x00ae27e4`, WORD, 같은 index; create는 `| record +0x1ec`, clear는 `&=0x0fff`.
- record: slot `+0x1b6`, generation `+0x1b8`, signed x/y `+0x1bc/+0x1be`, footprint
  `+0x1e3/+0x1e4`, mobile mode `+0x68`, occupancy-ready `+0x40c`, active gate `+0x1f0`.
- `0x00ad2ac4`는 alternate/non-mobile writer branch라 K01 mobile owner grid로 합치지 않는다.

정확한 bounded transition은 다음과 같다.

1. create는 slot `1..1199`를 먼저 고른 뒤 generation과 record x/y를 초기화한다. signed OOB면
   allocator age만 남기고 해당 create를 건너뛴다. action 1은 prior footprint owner를 0으로 만들고
   mask high nibble을 지운다.
2. movement helper는 current `+0x1bc/+0x1be`를 읽는다. collision/mask 또는 path gate가 실패하면
   좌표 field를 쓰지 않는다. progress `< 0x32`도 interpolation만 쓰며 좌표를 commit하지 않는다.
   progress `>= 0x32`에서만 `+0x1bc` 뒤 `+0x1be`를 쓰고 postprocess를 호출한다.
3. 후속 mobile writer는 footprint 각 cell에 mask를 먼저 OR하고, bounds 안에서 기존 owner를
   load/test하지 않은 채 slot WORD를 저장한다. 따라서 same/other/self occupant 모두 overwrite하며
   reject·relocate는 확인되지 않는다. 끝에서 `+0x40c=1`이다.
4. outer dispatcher action 7이 retain bit와 nonzero reference를 가지면 `1`을 반환해 release하지
   않는다. `0`이면 release가 active-list swap/count/category를 정리하고 active table과 reuse-age를
   0으로 만든다. release 진입 active table이 이미 0이면 occupancy clear 전 early return이다.
5. active record의 `+0x40c==1`일 때만 clear helper를 부른다. helper는 `+0x1f0==0`이면 다시
   early return하므로 active table이 0이 된 뒤 stale owner/mask가 남을 수 있다. E01 handle consumer는
   slot만 보지 않고 active/health/generation을 함께 검사하므로 stale slot WORD와 stale reference는
   별개의 결과다.

## 재현 vector와 남은 질문

fixture에는 create 6개(빈 셀·same/other/self overwrite·OOB·partial footprint), move 4개(blocked,
same-cell, progress threshold 포함), commit 2개, release 4개(ready/gate/double), death 2개(retain/
release), stale-generation handle, allocator tie 1개가 있다. 각 결과의 canonical JSON SHA-256을
검사하며 fixture expected object가 비어 있어도 hash가 맞지 않으면 fail-closed다.

아직 확정하지 않은 것은 `0x00ad2ac4`의 전체 producer와 raw owner/player 의미, K01 네 class 밖 footprint의
실제 타입 값, 모든 alias/computed writer와 scheduler serialization이다. 따라서 이 문서는 source slot을
player ownership으로 승격하지 않고, occupancy 저장 모델을 production에 이식하지 않는다.
