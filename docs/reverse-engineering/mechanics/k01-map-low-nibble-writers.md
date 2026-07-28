# K01 `field_0x00032514` 표준 주소형 직접 writer

## 질문과 범위

질문: **원본 `imjinrok2.exe`에서 `map + 0x00032514 + x * 180 + y`라는 정확한 표준 주소식을 만드는
직접 byte store는 어디이며, low nibble에 무엇을 쓰는가?**

이 문서는 그 표준 주소형의 정적 scan만 닫는다. field의 사람용 지형 의미, 최종 이동·경로 탐색 결과,
`WORD[0x004bdfd0]`와 `derivedFlags_0x000227f4`의 producer, 별칭·간접·계산된 주소를 통한 writer의 전역
부재는 주장하지 않는다.

| 구분 | 상태 | 정확한 범위 |
| --- | --- | --- |
| 분석 | `정적 확정` | 해시 고정 EXE의 `.text`에서 해당 표준 `0x165d → *9 → *4` 주소형은 정확히 21개이고, local opcode window로 16 read와 5 direct write를 분류했다. |
| 재현 | `재현 완료` | 표준 scan set, opcode anchor, 함수·call edge provenance와 `uint8` mask/OR 변환의 정상·경계·변조 실패 vector를 독립 extractor/fixture로 고정했다. |
| 구현 | `없음` | 제품 map, codec, 이동 또는 pathfinding은 바꾸지 않았다. |

이 문서의 `정적 확정`은 **표준 주소형 direct writer set**에 한정된다. 따라서 "writer가 다섯 개뿐"이라는
문장은 전체 프로그램의 alias/computed writer까지 포함하는 전역 부재 주장으로 읽으면 안 된다.

## 고정 provenance

| 입력 | 크기 / SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | 843,833 / `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `analysis/generated/imjinrok2/functions.json` | 1,467,804 / `c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3` |
| `analysis/generated/imjinrok2/references.json` | 17,206,553 / `df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c` |

두 generated JSON의 전체 hash와 `sourceSha256`, 아래 함수의 body range·instruction count·instruction
SHA-256·raw whole-body SHA-256·caller/callee set을 extractor가 모두 검사한다.

| 함수 | body range | 명령 수 | raw body SHA-256 |
| --- | --- | ---: | --- |
| `FUN_004646e0` | `0x004646e0-0x004648ca` | 137 | `036a602fc7cdf5ea37c5da2146b2e90e4b7612544d3078e18a55ef94346ba8c9` |
| `FUN_0046dbc0` | `0x0046dbc0-0x0046dfc4` | 329 | `ed2d5cf7fbb1c0736ac671ffbb10a299e862ad6869e8138d61ca45bf03d22e17` |
| `FUN_0046dfd0` | `0x0046dfd0-0x0046e29f` | 219 | `17efb630c7e96349b0300b89927c3619867fb41353ae537530e2c095bcda3664` |
| `FUN_0046ba00` | `0x0046ba00-0x0046ba58` | 34 | `7233c1a8619b985ccac54d72f03ef7a9617bacab27dc34a0424ef63d7f701abf` |

`FUN_004646e0`의 structured caller는 `0x00445990`이며 `0x00445a33` call edge가 이를 확인한다.
`0x0046c073 → 0x004646e0`도 exact reference로 확인되지만 generated function assignment는 없다.
`FUN_0046ba00`은 `0x0046ba17`에서 `FUN_0046dfd0`, `0x0046ba4e`에서 `FUN_0046dbc0`을 호출한다. 뒤 두
함수의 self recursion edge는 각각 `0x0046dd29`/`0x0046df69`와 `0x0046e0b7`/`0x0046e243`이다.

## 주소식과 표준 scan

각 site의 첫 `LEA`는 `x * 5 + 0x165d`를 만들고, 다음 `*9`, `*4`, `+y`를 거쳐 다음 주소를 만든다.

```text
field_0x00032514(x, y) = uint8(map + 0x00032514 + x * 180 + y)
```

`.text` 전체를 `LEA reg,[reg+reg*4+0x165d]` immediate form으로 scan하면 다음 21개 construction VA가
정확히 나온다.

```text
0x00426133  0x0045f566  0x00464817  0x00464d45  0x00464f7c
0x004659d5  0x00465a9e  0x0046708a  0x00467c76  0x004686e2
0x00469370  0x00469554  0x00469aa9  0x00469e49  0x0046a1e9
0x0046a570  0x0046dc48  0x0046df17  0x0046e071  0x0046e217
0x0046e2d8
```

그 중 `0x00426133`, `0x0045f566`, `0x00464d45`, `0x00464f7c`, `0x004659d5`, `0x00465a9e`,
`0x0046708a`, `0x00467c76`, `0x004686e2`, `0x00469370`, `0x00469554`, `0x00469aa9`, `0x00469e49`,
`0x0046a1e9`, `0x0046a570`, `0x0046e2d8`은 construction 뒤의 fixed local window가 `MOV r8,r/m8`
(`0x8a`) load와 mask/compare만 포함함을 byte-for-byte 검증해 `read`로 분류한다. 단순히 다섯 writer를
뺀 나머지라서 read라고 한 것이 아니다.

## 직접 store와 정확한 byte 변환

각 writer는 `MOV r/m8,r8` (`0x88 0x08`) store까지 포함하는 exact anchor를 검사한다.

| 함수 | construction VA | store VA | 원본 byte 연산 | 결과 |
| --- | --- | --- | --- | --- |
| `FUN_004646e0` | `0x00464817` | `0x0046482f` | `(old & 0xf2) | 0x02` | high nibble 보존, low nibble 정확히 `2` |
| `FUN_0046dbc0` | `0x0046dc48` | `0x0046dc5f` | `(old & 0xf2) | 0x02` | high nibble 보존, low nibble 정확히 `2` |
| `FUN_0046dbc0` | `0x0046df17` | `0x0046df2f` | `(old & 0xf1) | 0x01` | high nibble 보존, low nibble 정확히 `1` |
| `FUN_0046dfd0` | `0x0046e071` | `0x0046e08a` | `(old & 0xf2) | 0x02` | high nibble 보존, low nibble 정확히 `2` |
| `FUN_0046dfd0` | `0x0046e217` | `0x0046e22f` | `(old & 0xf1) | 0x01` | high nibble 보존, low nibble 정확히 `1` |

`FUN_004646e0`에는 in-bounds width/height loop와 위 `low=2` store가 함께 있다. 여기서 eligible cell의
사람용 terrain/state 이름을 붙이지 않는다. 두 recursive 함수의 store도 같은 byte 변환만 확정한다.

## 기존 eligibility predicate와의 경계

[K01 `FUN_00465960` bounded eligibility predicate](k01-map-eligibility-predicate.md)는 이 field의
`lowNibble == 1`만 reject한다. 그러므로 여기서 확인한 `low=1` writer는 그 **특정 gate**를 실패시킬 수
있고, `low=2`는 그 gate를 통과시킬 수 있다. 그 사실은 이후 `globalMaskWord | 0x2004`와 derived flag
검사까지 통과한다는 뜻이 아니며, 전역적인 이동 가능/불가능 의미도 아니다.

## 재현 fixture와 실패 경로

```bash
pnpm imjinrok:extract-k01-map-low-nibble-writers
node --test tools/imjinrok/k01-map-low-nibble-writers.test.mjs
```

`analysis/fixtures/k01-map-low-nibble-writers.json`은 21/16/5 site set, writer store VA·opcode, generated
input digest와 필수 call edge, 다음 `uint8` vector를 고정한다.

| old | low=1 결과 | low=2 결과 |
| ---: | ---: | ---: |
| `0x00` | `0x01` | `0x02` |
| `0x0f` | `0x01` | `0x02` |
| `0xa5` | `0xa1` | `0xa2` |
| `0xff` | `0xf1` | `0xf2` |

테스트는 `-1`, `256`, fraction, `undefined`를 uint8 evaluator에서 거부하고, EXE/functions/references
각각의 단일-byte 변조를 해석 전에 거부한다. 또한 canonical address-form과 displacement 또는 마지막
byte가 다른 near match를 구분하고, CLI의 `--executable`, `--functions`, `--references` override를 각각
검사한다.

## 남은 경계와 다음 작업

- 이 표준 address form 밖의 alias/computed/indirect writer와 writer ordering은 별도 static analysis가 필요하다.
- `WORD[0x004bdfd0]` producer와 `derivedFlags_0x000227f4` writer set은 아직 닫히지 않았다.
- field 값의 terrain/state 이름, rendering, 최종 이동·경로 탐색 결과는 이 evidence에서 도출하지 않는다.
