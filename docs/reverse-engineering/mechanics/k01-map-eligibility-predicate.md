# K01 `FUN_00465960` bounded eligibility predicate

## 질문과 범위

원본 `FUN_00465960` (`0x00465960-0x00465a12`)은 주어진 map object와 두 좌표에 대해 어떤 **순서의
boolean**을 반환하는가? 이 문서는 그 함수만의 반환값을 다룬다. 이를 최종 이동·경로 탐색 통과성이라고
부르지 않으며, 호출자의 더 넓은 의미도 확정하지 않는다.

| 구분 | 상태 | 근거 |
| --- | --- | --- |
| 분석 | `정적 확정` | 전체 함수 179 byte, 모든 함수 내부 reference 10개, direct caller set, 관련 load/clear producer byte를 고정했다. |
| 재현 | `재현 완료` | 정상·경계·실패·malformed reached value·short-circuit 미접근·tamper·결정론 vector를 독립 evaluator로 검사한다. |
| 구현 | `없음` | 제품 코드나 map codec은 바꾸지 않았다. |

## 원본과 고정 provenance

| 입력 | 크기 / SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | 843,833 / `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `analysis/generated/imjinrok2/functions.json` | 1,467,804 / `c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3` |
| `analysis/generated/imjinrok2/references.json` | 17,206,553 / `df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c` |

두 generated artifact 모두 EXE SHA-256을 `sourceSha256`으로 가져야 한다. 추출기는 세 파일의 전체
hash, 아래 세 함수의 raw whole-body hash·instruction hash·body range·caller/callee set, 그리고 call
edge를 검사한다.

| 함수 | 범위 | raw body SHA-256 | 이 문서에서의 역할 |
| --- | --- | --- | --- |
| `FUN_00462af0` | `0x00462af0-0x00462b7b` | `c462e822540d7bede0c75eeeab2661001164209cd831f639c99e1ab8401fe6e0` | 성공 load 뒤 runtime grid clear |
| `FUN_004648e0` | `0x004648e0-0x00464cb2` | `e8bba48e9c6925826914eab6f55a038ee275500831e70ec496b1bcc7dfd63112` | locked primary field의 초기화 소비자 contact |
| `FUN_00465960` | `0x00465960-0x00465a12` | `2b1f10655b34fce18f72a990661788d7298f0dc6e8c1ef9f99feb4e23e9a45d0` | 이 bounded predicate |

`references.json`의 `FUN_00465960` 출발 set는 조건 jump 9개와 `0x004659f1 → 0x004bdfd0` READ
1개로 정확히 고정한다. 또한 `0x00465da2` 및 `0x0046e472`의 direct call edge가 각각 하나여야 한다.
기존 [K01 map passability field](k01-map-passability-field.md) contract의 `0/3` primary gate는 read-only
contact로 사용하며, 이 문서는 그것을 추출·문서화하여 중복하지 않는다.

## canonical 입력 폭·주소식

함수는 entry stack에서 두 좌표 word를 읽고 `MOVSX`한다. 따라서 evaluator 입력 `x`, `y`는 canonical
`int16`이다. `-32768..32767` 밖의 값은 이 함수 ABI의 값이 아니다. 경계는 signed 음수 검사 뒤,
sign-extended `int32`와 map runtime DWORD `width=map+0x2da0`, `height=map+0x2da4`를 `>=` 비교한다.
`CMP` 뒤의 branch가 `JGE`이므로 이 비교는 signed다: input은 canonical raw `uint32` DWORD로 보존하되,
비교할 때 `int32(width)` 및 `int32(height)`로 해석한다. 따라서 raw `0x80000000..0xffffffff` dimension은
음수여서 nonnegative coordinate를 즉시 reject한다.

```text
index = x * 180 + y

occupancyWord = uint16(map + 0x00002db4 + index * 2)
primaryValue  = uint8 (map + 0x000cc90c + index)
auxiliaryValue= uint8 (map + 0x000dc62c + index)
lowNibbleField= uint8 (map + 0x00032514 + index)
derivedFlags  = uint16(map + 0x000227f4 + index * 2)
globalMaskWord= uint16[0x004bdfd0]
```

`uint16`은 여기서 signed quantity가 아니라 bit pattern이다. `MOVSX` after `lowNibbleField & 0x0f`는
결과가 0..15이므로 comparison의 signedness를 바꾸지 않는다.

## 정확한 short-circuit와 반환

다음 순서는 x86 branch target `0x004659ca` (false return)를 그대로 풀어 쓴 것이다. 앞 단계에서 false가
되면 뒤 입력은 읽지 않는다.

```text
if x < 0: return false
if x >= int32(widthRawDword): return false
if y < 0: return false
if y >= int32(heightRawDword): return false

index = x * 180 + y
if occupancyWord != 0: return false

# Locked contact: primary == 0 continues; primary == 3 needs zero auxiliary.
if primaryValue == 3:
    if auxiliaryValue != 0: return false
elif primaryValue != 0:
    return false

if (lowNibbleField & 0x0f) == 1: return false

return (derivedFlags & (globalMaskWord | 0x2004)) == 0
```

The final `NEG AX; SBB EAX,EAX; INC EAX` returns canonical `1` for a zero `AND` result and `0` otherwise.
The executable file's initialized `WORD[0x004bdfd0]` is `0x136a`, which would yield `0x336e` after OR with
`0x2004`; that initial byte is not substituted for a runtime mask in the reproduction model.

## producer boundary: file bytes vs runtime state

`0x00462b11` first copies `0x10bd8c` bytes into the map object on successful load. It then explicitly clears
two separate 180×180 grids: `map+0x2db4` and `map+0x227f4`, each as 2-byte cells with x stride 180 and y stride
1. Therefore neither grid is treated as raw K01.map content in a vector.

| value | classification in this bounded analysis | first unresolved producer edge |
| --- | --- | --- |
| width, height | runtime DWORD read; loader copies raw image first | later writer is not closed; supplied synthetically |
| `occupancyWord` | runtime occupancy grid, zeroed just after load | first later occupancy population writer |
| primary / auxiliary | locked file-field gate contact | covered by the prior contract, not re-extracted here |
| `lowNibbleField` | address lies in the copied map image, but modeled as synthetic runtime byte | first post-load writer/absence-of-writer proof for `field_0x00032514` |
| `derivedFlags` | runtime grid, zeroed just after load | first later derived-flag writer |
| `globalMaskWord` | external global runtime word | producer/update path for `0x004bdfd0` |

The first unresolved edge reached after the primary gate is `field_0x00032514(x,y)`. Consequently this extractor
does not read raw K01.map at that offset, and no raw map byte is asserted to be the value later consumed by the
predicate.

## byte anchors

| VA | checked bytes / fact |
| --- | --- |
| `0x00462b11` | direct `0x10bd8c` load then `map+0x2db4` clear setup |
| `0x00462b4d` | separate `map+0x227f4` clear setup |
| `0x00465960` | signed word coordinate load, sign extension, width/height bounds |
| `0x0046598e` | `x*180+y`, `map+0x2db4+index*2` WORD nonzero reject |
| `0x004659a2` | locked primary/auxiliary contact after occupancy |
| `0x004659d1` | other primary nonzero reject and `0x32514` low-nibble == 1 reject |
| `0x004659f1` | global word, derived flag word, `|0x2004`, final canonical boolean |

## reproduction vectors

The fixture contains complete evaluator inputs and outputs for: `x=-1`, `x=width`, high-bit raw `width`, `y=-1`, `y=height`, high-bit raw `height`, nonzero
occupancy, primary `3` with nonzero auxiliary, other primary nonzero, both `0` and `3/0` locked-gate continuation,
low nibble `0xf1`, final mask rejection, and success. The focused test additionally proves that getters for
unreachable later inputs are never read, rejects malformed reached int16/uint8/uint16/uint32 values, rejects each
tampered source/generated artifact, and runs the CLI twice for byte-identical output.

```bash
node tools/imjinrok/extract-k01-map-eligibility-predicate.mjs
node --test tools/imjinrok/k01-map-eligibility-predicate.test.mjs
```

## 현재 구현과 다음 작업

이 결과는 map rendering label, terrain name, final movement permission, or pathfinding result을 증명하지
않는다. 제품 구현은 변경하지 않았다.

다음 최소 작업은 `field_0x00032514`의 post-load writer set을 정적으로 닫는 것이다. 그 뒤
`0x004bdfd0` producer와 `derivedFlags_0x000227f4` writer set을 별도 bounded unit으로 닫아야 runtime
inputs를 source-derived facts로 승격할 수 있다.
