# K0110 `CHANGETITLE` resource owner와 consumer

## 질문과 판정

K0110의 `CHANGETITLE` record가 어떤 owner/resource field를 만들고 교체하는지, load 실패와
teardown에서 무엇이 남는지, 로드된 title sprite가 어디서 소비되는지를 정적 범위로 한정한다.

- 분석 상태: **정적 확정**. command lookup, kind-1 record dispatcher/consumer, image load/release,
  teardown, overlay caller의 전체 raw range·function catalog·outgoing-reference projection과 byte
  anchor를 exact source에 고정했다.
- 재현 상태: **범위 한정 재현 완료**. 최초 load, 같은/다른 경로 replacement, 실패 후 빈 slot,
  direct load gate, teardown 순서를 독립 vector로 재현한다.
- 구현 상태: **분석 전용, production 변경 없음**. B01은 CHANGETITLE의 owner/resource lifecycle만
  다루며 outer cadence와 실제 sprite draw consumer는 닫지 않는다.

## provenance와 공식 추출

| 입력 | SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `original/imjinrok2/script/K0110` | `d9dcc3c78d0373181677afc63fe9331ff561387e36877a62912ca66515f4aea8` |

공식 명령은 다음과 같다.

```sh
pnpm imjinrok:extract-changetitle-consumer
node --test tools/imjinrok/changetitle-consumer-evidence.test.mjs
```

추출기는 EXE·K0110·`functions.json`·`references.json`의 source hash를 먼저 확인하고, 14개 raw
range, 14개 function body/instruction digest, 14개 complete outgoing-reference projection, 11개
byte anchor를 검사한다. 새 Ghidra seed나 production asset은 추가하지 않았다.

## command와 record

`FUN_00482590` (`0x00482590-0x0048285c`)의 lookup index는 `CHANGETITLE=1`,
`SETDELAYTIME=3`, `OBJECTIVE=7`, `TITLE=9`이다. `FUN_00482860`
(`0x00482860-0x00482eda`) dispatcher의 case 1은 약 `0x80` byte payload에 source path를 복사하고
kind 1 record를 만든다. K0110 첫 `SPEECH` 전에는 초기 `CHANGETITLE` 1회와 `k0101.spr`부터
`k0111.spr`까지 11회가 exact text로 존재한다.

## owner/resource lifecycle

owner는 global script object `0x005e3680`이다. resource subobject는 `owner+0x20`, 로드된 image
pointer는 `owner+0xc14` (`resourceBase+0xbf4`), 처리 record count는 `owner+0x60c`이다.

`FUN_004830f0` (`0x004830f0-0x004833bc`)의 case 1은 record path를 local buffer로 복사한 뒤 항상
`FUN_00483050` release를 먼저 호출하고 `FUN_00482fc0` load gate를 호출한다. 관찰된 gate 결과는
항상 1이므로 record는 소비되고 `owner+0x60c`가 증가한다.

| 상황 | 정적 결과 |
| --- | --- |
| 최초 load 성공 | `owner+0xc14`에 새 image pointer가 남는다. |
| 같은 path 반복 | 이전 image를 먼저 free한 뒤 같은 path를 다시 load한다. |
| 다른 path replacement | 이전 image를 먼저 free한 뒤 새 path를 load한다. |
| missing/malformed/empty source | release 뒤 loader failure log가 나고 `owner+0xc14=0`; record는 여전히 소비된다. |
| consumer 이전 image가 이미 존재 | direct gate만 호출하면 `TitleSpr Already Allocated Memory` branch가 기존 image를 보존한다. consumer는 이 gate보다 먼저 release하므로 replacement에서는 이 branch가 남지 않는다. |

`FUN_00483050` (`0x00483050-0x00483074`)는 `owner+0xc14 != 0`일 때
`FUN_00443440(owner+0x20)`을 호출하고 pointer를 0으로 만든다. `FUN_00443440`
(`0x00443440-0x00443464`)은 image resource를 free한다. `FUN_00482fc0`
(`0x00482fc0-0x0048304f`)은 empty slot에서 path normalization과 `FUN_004434a0`
(`0x004434a0-0x0044357e`) image load를 시도하며, 실패해도 gate return은 1이다.

## 소비 경로와 미확정 경계

관찰된 `FUN_004a84e0` (`0x004a84e0-0x004a8606`)는 caller가 준 target surface에 scratch surface
`DAT_0054927c`를 blit하고, `owner+0x568` objective rectangle 뒤 `owner+0x564` title rectangle을
그린다. `FUN_004a88f0`/`FUN_004a89e0`는 각각 OBJECTIVE/TITLE 문자열을 같은 scratch surface의
HDC에 직접 쓰는 별도 text producer다.

현재 `references.json`과 함수 body에는 `owner+0xc14`를 `FUN_004a84e0` 또는 다른 관찰된 draw
consumer가 직접 읽는 edge가 없다. 따라서 **CHANGETITLE image의 실제 sprite compositor는
미해결**이며, `TITLE`/`OBJECTIVE` text overlay가 존재한다는 사실을 sprite 소비 증거로 사용하지
않는다. 이 slice에서 dynamic probe, outer update cadence, wall-clock sprite duration을 주장하지
않는다.

## teardown

`FUN_00482010` (`0x00482010-0x00482146`)는 `FUN_004823d0` (`0x004823d0-0x004824b6`)를 호출하고
record payload를 정리한 뒤 `FUN_00483050`으로 `owner+0xc14`를 release한다. shutdown은
`FUN_004a8ac0` objective clear (`+0x568=0`) 후 `FUN_004a8ae0` title clear (`+0x564=0`) 순서이며,
마지막에 `Sleep(1000)`이 관찰된다.

재현 fixture는
`analysis/fixtures/changetitle-consumer-evidence-vectors.json`에 있고 focused test는 source hash,
replacement/release/failure/teardown 결과와 stale structured evidence 거부를 검사한다.

## 다음 경계

sprite consumer를 닫으려면 `owner+0xc14` 또는 resource subobject를 실제 draw API로 전달하는
별도 static slice가 필요하다. 그 결과 전까지는 현재 web renderer에 CHANGETITLE sprite를 이식하거나
정확한 표시 시간을 주장하지 않는다.
