# 건물 해체 action 13: 진행도·환불·선박 변환 경계

## 질문과 범위

원본 action `13`이 어떤 command record로 등록되고, entity update에서 진행도와 시각 phase를 어떻게
갱신하며, 완료 때 어떤 자원을 환불하고 type flag `0x10` 분기에 무엇을 하는가? 이 문서는 그
한정된 정적 경로와 독립 replay vector만 다룬다. 제품 simulation·UI는 변경하지 않는다.

## 상태

- 분석 상태: **정적 확정** — action 13 record/dispatch, progress·phase, decrement·health, completion
  refund 및 `flags & 0x10` transformation의 범위.
- 재현 상태: **재현 완료** — phase 경계, decrement/underflow, health clamp, non-flag refund,
  flag-`0x10` conversion과 strict tie vector.
- 구현 상태: **없음** — 이 분석은 게임플레이에 연결되지 않았다.

## provenance와 재현 입력

- EXE: `original/imjinrok2/imjinrok2.exe`
- SHA-256: `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- extractor: `tools/imjinrok/extract-building-demolition-evidence.mjs`
- compact fixture: `analysis/fixtures/building-demolition-evidence.json`

```bash
node tools/imjinrok/extract-building-demolition-evidence.mjs --output /tmp/building-demolition-evidence.json
node --test tools/imjinrok/building-demolition-evidence.test.mjs
```

extractor는 EXE뿐 아니라 `functions.json`, `references.json`, canonical 95-type catalog의 SHA-256도
고정하고, 여섯 개 function record의 body range/instruction count/instruction digest와 다섯 raw
code range, command·phase·refund·transform byte anchors를 검증한다.

## command와 update 흐름

`0x00457787`의 command record는 action `13`, `button.spr` frame `13`, runtime label
`0x00aa4b88`로 초기화된다. label source `0x004c84fc`는 CP949 `해체`이고, help source
`0x004c7764`는 `건물을 해체하여 없앱니다.`다. 해당 NUL-inclusive 26 bytes는
`b0 c7 b9 b0 c0 bb 20 c7 d8 c3 bc c7 cf bf a9 20 be f8 be db b4 cf b4 d9 2e 00`,
SHA-256은 `1bc5358ae5413b83c49d2b0151d0b3aaa5115e9d4b924e6eb8d6ccb1b4a85dd5`로 extractor가
고정한다.

`FUN_00426c20`의 action-13 arm (`0x004271c0`)은 visual substate `+0x1b2`를 zero로 하고 common
command reset을 호출한 뒤 queued action을 entity `+0x1b0`으로 복사한다. 이어 linked identifier
두 개를 `+0x3f2`부터 순회한다. 이 순회가 어떤 queue cancellation/refund를 의미하는지는 이 문서의
범위에서 확정하지 않는다.

`FUN_0043c9c0`의 action-13 jump-table arm `0x0043d276`은 cleanup 뒤 `FUN_0041aa90`을 호출한다.
그 함수는 먼저 `FUN_0042e280(13)`을 호출하고 progress byte `+0x8c`을 읽는다.

## phase와 decrement

`+0x8c`에서 `+0x1b2`로 가는 phase는 다음과 같이 고정된다.

| progress | phase |
| --- | --- |
| `<10` | 0 |
| `<20` | 1 |
| `<30` | 2 |
| `<40` | 3 |
| `<50` | 4 |
| `<70` | 5 |
| `<100` | 6 |
| `>=100` | 7 |

phase가 바뀌면 `+0x1b2`와 `+0x34`에 같은 WORD를 쓰고 dirty byte `+0x4=1`을 쓴다. positive
progress가 `>=2`이면 `FUN_00438090(2)`, `1`이면 `FUN_00438090(1)`을 호출한다.

helper는 progress가 delta보다 작을 때만 `+0x8c=0`, return `1`로 완료를 보고한다. 그렇지 않으면
progress를 빼고 다음을 계산한다.

```text
target = max(1, truncTowardZero(maximumHealth(+0x3c) * progress / 100))
currentHealth(+0x3e) = min(currentHealth, target)
```

따라서 helper는 current health를 올리지 않는다.

## completion refund와 flags-0x10 분기

progress가 0 이하가 되면 `FUN_0041aa90`은 owner player record와 type `+0x10` grain cost,
type `+0x12` wood cost, third argument zero로 `FUN_0047e300`을 호출한다. 이 범위에서 확정된 결과는
**grain·wood 전액 환불과 pending 전비 delta 0**이다.

type flags의 `0x10` bit가 꺼져 있으면 이 refund 뒤 return한다. 전체 deletion·selection UI lifecycle은
여기서 이름 붙이지 않는다.

bit가 켜진 경우만 old entity를 `FUN_00483aa0`으로 제거하고, 원 위치의 inclusive `[-2,+2]` square에서
eligible cell을 조사한다. 적격 cell 중 strict하게 더 작은 squared distance만 채택하므로 동점은 먼저
방문한 후보를 유지한다. 그런 뒤 same identifier/owner와 chosen coordinate로 `FUN_00483c50(75, ...)`을
호출한다.

hash-bound canonical catalog에서 bit `0x10`은 정확히 다음 internal class에만 있다.

- 18 일본 안택선, 19 일본 누각선, 26 조선 거북선, 27 조선 판옥선
- 29 명 사선, 30 명 호선, 38 조선 수송선

class `75`는 `일본 건설수레`, `char/carj.spr`다. 이 결과는 원본 코드가 실제로 만드는 class를
기록한 것이며, 왜 선박 해체가 건설수레로 변환되는지에 대한 인간적 설계 이유를 추측하지 않는다.

## 명시적 미확정 사항

- action 13을 어떤 selected entity에 노출하는 command producer/UI 조건
- `+0x3f2` linked-id cleanup의 정확한 queue cancellation/refund semantics
- 선택·해제와 화면 합성의 완전한 lifecycle
- 7종 선박과 class 75 변환의 gameplay rationale

따라서 이 문서는 원본 기반 gameplay implementation authorization이 아니라, 후속 이식의 필요한
정적 evidence와 replay contract만 제공한다.
