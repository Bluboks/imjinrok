# 전비 capacity·reservation·completion transfer

## 질문과 범위

원본의 player 전비가 어느 record field에 저장되고, 즉시 생성·예약·환불·생산 완료·제거 및 UI가
어떤 순서와 경계로 이를 읽고 쓰는가? 특히 사용자가 기억한 모집/장수 수 상한 증가가 원본의
`+0x1b52` 전비 maximum을 실제로 변경하는지까지를 다룬다. 이 문서는 원본 정적 근거와 독립
재현 모델만 기록하며 제품 simulation/gameplay를 변경하지 않는다.

## 상태

- 분석 상태: **정적 확정** (이 문서가 한정한 player record, admission, reservation, transfer,
  removal 및 UI read 범위).
- 재현 상태: **재현 완료** (정상·경계·실패·순서 vectors).
- 구현 상태: **없음**. 분석 결과를 프로젝트 mechanic으로 이식하지 않았다.
- 검토 기록: Root Codex가 2026-07-31에 제공한 전체 정적 control/data-flow 분석을 이
  hash-bound extractor와 fixture로 고정했다.

## 원본 provenance와 extractor

- EXE: `original/imjinrok2/imjinrok2.exe`
- SHA-256: `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- extractor: `tools/imjinrok/extract-war-expense-capacity-evidence.mjs`
- fixture: `analysis/fixtures/war-expense-capacity-vectors.json`
- 생성/검증:

```bash
pnpm imjinrok:extract-war-expense-capacity-evidence
node --test tools/imjinrok/war-expense-capacity-evidence.test.mjs
```

extractor는 EXE·`seeds.json`·`functions.json`·`references.json`의 SHA-256, 8개 raw code range
SHA-256, 17개 exact byte anchor를 확인한다. 따라서 fixture의 숫자·주소·순서는 다른 EXE 또는
다른 generated-analysis artifact로부터 조용히 생성되지 않는다.

## player record와 진단 문자열

`FUN_004457d0`의 `0x004457d1-0x004457f0` loop는 base `0x0082c480`에서 8개 record를 stride
`0x2c10`으로 순회한다. 각 record에 `+0x1b50=250`, `+0x1b52=2500`을 쓴다.

| field | 폭 | 정적 확인 범위 |
| --- | --- | --- |
| `+0x1b4a` | signed WORD | live entity count |
| `+0x1b4c` | signed WORD | live war-expense sum |
| `+0x1b4e` | signed WORD | type flags bit `0x2`의 original building category count |
| `+0x1b50` | signed WORD | maximum entity count, initial 250 |
| `+0x1b52` | signed WORD | maximum war expense, initial 2500 |
| `+0x10` | DWORD | queued/reserved (pending) war expense |

`+0x1b4e`는 `FUN_0047e0d0`/`FUN_0047e160`의 type flags bit `0x2` test와 증가/감소로 연결된다.
이번 extractor는 canonical 95-type catalog를 함께 검증해 flags `& 0x2`가 class `40..74`의 정확히
35 type뿐이며 모두 원본 building name/SPR임을 전수 확인한다. 따라서 이 한정 범위에서는 이를
**original building category count**라고 부른다.

CP949 source `0x004c7a48`은 `전비가 부족합니다.`이며, `FUN_0048ea90`은 `0x0049142a`에서 이를
runtime message table `0x00aa67e8`에 복사한다. 문자열 존재만으로 admission semantics를 정한
것이 아니라 아래 전체 control/data-flow의 보조 진단 anchor로 쓴다.

## 확정된 제어 흐름

### 즉시 admission과 live add/remove

`FUN_0047e050`은 normal branch에서 `liveCount < maximumEntityCount`를 요구한다. raw alternate
branch는 `liveCount < maximumEntityCount - 6`을 요구한다. 이어 produced type record `+0x0e`의
signed WORD expense를 더해 `liveExpense + typeExpense <= maximumWarExpense`일 때만 통과한다.

`FUN_0047e0d0`은 live entity를 넣고 `+0x1b4a`를 증가시키며 type `+0x0e`를 `+0x1b4c`에 더한다.
flags bit `0x2`면 `+0x1b4e`도 증가한다. `FUN_0047e160`은 matching live entity를 제거·shift하고
반대로 count/expense/raw category count를 뺀다.

### reservation, refund, completion

`FUN_0047e330`은 두 resource의 잔액을 먼저 검사한 뒤 다음 식을 검사한다.

```text
liveExpense + pendingExpense + newTypeExpense <= maximumWarExpense
```

성공 시 두 resource를 차감하고 `pendingExpense += newTypeExpense`를 수행한다. `FUN_0047e300`은
두 resource를 되돌리고 `pendingExpense -= typeExpense`를 수행한다.

생산 완료 경로 `FUN_0042de00`의 `0x0042dfb1..0x0042dfeb`은 constructor handoff 직전에 producer
pending과 player pending을 차례로 뺀다. 그 뒤 생성된 live entity의 일반 add path가 live count와
live expense로 옮긴다. 따라서 UI와 admission이 보는 pending은 constructor 이후까지 남아 있지
않다.

`FUN_0047e400`은 `0x0047e5ba`에서 `liveExpense + pendingExpense`를 표시하고,
`0x0047e66b`에서 `maximumWarExpense`를 표시한다.

Action `115`→class `76` 권율과 class 76 type `+0x0e=0`은 hardcode가 아니다. extractor가
hash-bound persistent-selection action evidence의 action definition/typed raw fields와 canonical
entity-type catalog의 class 76 identity를 교차 확인해 fixture에 provenance를 기록한다. 이 사실은
count admission을 우회한다는 뜻이 아니다. zero-cost vector는 expense가 이미 2500이어도 expense
sum이 변하지 않는 범위만 보인다.

### 별도 building-category admission gate

`FUN_0047b200`은 fixed entity count 또는 war expense 식에 합쳐지지 않는 별도 gate다. global WORD
`0x0088afcc == 0`이고 player `+0x02` byte가 정확히 `1`일 때만 signed `+0x1b4e`와 signed
`+0x1b50`을 비교한다. magic signed-divider sequence의 결과는
`truncTowardZero(maximumEntityCount / 5)`이며, building count가 그 값 이상이면 이 gate에서 reject한다.
기본 `250`에서는 `49`가 통과하고 `50`이 거절된다. global 또는 player-byte 조건이 다르면 이 gate는
bypass한다. 이 함수 뒤의 type/action별 다른 gate까지 일반화하지 않는다.

## 재현 vectors

fixture는 input과 independent replay output을 함께 기록한다. 다음 경계를 포함한다.

- 8-player initialization 및 `250`/`2500` defaults
- normal/alternate immediate entity-count 마지막 slot·거절 경계
- `<= maximumWarExpense`의 equal/over boundary
- resource와 live+pending capacity reservation success/failure
- reserve → refund와 reserve → producer/player pending subtract → constructor handoff → live add 순서
- live add/remove와 original building-category accounting
- building category `49/50` boundary, global/player-byte bypass, signed division vector
- action 115/class 76의 zero-cost hero

이 replay는 원본 binary를 실행하지 않으며, 위에 고정한 정적 명세의 독립 참조 구현이다.

## maximum writer 범위와 미확인 사항

extractor는 hash-bound `references.json`에서 player 0 `+0x1b52` absolute address `0x0082dfd2`의
complete generated direct-reference projection(6 entries)을 SHA-256으로 고정한다. 그 중 direct
`WRITE`는 initializer `FUN_004457d0`의 `0x004457e4` 하나뿐이며 다른 direct `WRITE`는 없다. 이는
**alias writer, save/load writer, map writer, script writer가 없다는 주장도 아니다.** 그 경로들은
아직 미확인이다.

따라서 사용자가 기억한 모집/장수 수 상한 증가가 `+0x1b52`를 올린다는 원본 동작은 현재
**확인되지 않았으며 구현해서는 안 된다.** `+0x1b50` entity count max와 `+0x1b52` war-expense max,
그리고 building category gate를 fixed entity-count/war-expense admission과 서로 바꾸어 해석하지 않는다.

## 현재 구현과 다음 분석

현재 구현에 원본 기반 전비 mechanic 변경은 없다. 다음 정적 작업은 `+0x1b52`의 alias/save/map/script
writer와 전체 production owner/post-dispatch를 분리해 조사하는 것이다. 새 writer가 발견되면 이
문서의 analysis status와 vectors를 그 근거에 맞춰 갱신한다.
