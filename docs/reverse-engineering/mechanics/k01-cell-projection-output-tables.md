# K01 cell projection output-table boundary

## 질문과 상태

질문: **`FUN_004648e0`과 `FUN_00481c50`은 `FUN_00464cc0`을 통해 K01의 cell별 projection output table을
미리 쓰는가? 그렇다면 K01에서 `(lowNibble, family, runtime WORD, helper, outputY branch)`의 정확한 결합
vector는 무엇인가?**

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | `정적 확정` | `FUN_00464cc0`의 callee-cleaned four-argument output 순서, `FUN_004648e0`의 x-major cell별 두 output table write, `FUN_00481c50`의 nested cell call과 y-only overwrite, `FUN_004653d0`의 반환 좌표 squared-distance consumer, K01 3,600 cell joint vector |
| 재현 | `재현 완료` | EXE/map/generated JSON hash, complete body·call edge·opcode anchor, table initializer cross-check, corrected K01 joint stream/digest와 malformed/tampered input rejection |
| 구현 | `없음` | 제품 runtime 또는 terrain/elevation policy를 변경하지 않았다. |

이 문서는 [tile placement-level·object/frame boundary](k01-tile-placement-elevation-boundary.md)의
`FUN_00464cc0` formula와 runtime WORD table을 import하여 cross-check한다. low-nibble direct writer의 범위는
[별도 writer 분석](k01-map-low-nibble-writers.md)을 따른다.

## 고정 provenance

| 입력 | 크기 / SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | 843,833 / `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `original/imjinrok2/stagemap/k01.map` | 1,097,100 / `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb` |
| `analysis/generated/imjinrok2/functions.json` | 1,468,333 / `7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e` |
| `analysis/generated/imjinrok2/references.json` | 17,206,569 / `f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5` |

| 함수 | raw byte range (끝 제외) | raw body SHA-256 | 확인 범위 |
| --- | --- | --- | --- |
| `FUN_004648e0` | `0x004648e0-0x00464cb2` | `e8bba48e9c6925826914eab6f55a038ee275500831e70ec496b1bcc7dfd63112` | y-outer/x-inner loop와 cell별 output pointer |
| `FUN_00464cc0` | `0x00464cc0-0x00464dde` | `40b41b7ce95c3e7516c0bf2f6d01f1e86bf2848ed0ec5256f63d7858f55a1d10` | projection base와 output argument write 순서 |
| `FUN_004653d0` | `0x004653d0-0x00465502` | `be8ebc57dd7773790c1ad63902b5e3e7fe734c5add75ceefe70095f3e75e82d1` | returned pair의 local squared-distance comparison |
| `FUN_00481c50` | `0x00481c50-0x00481ed1` | `d7c601f3aa90d2154224add77351929121efc63c778b21474478dc26589a46a9` | nested loop의 y-only output pointer |

fixture schema version은 `1`이며, `analysis/fixtures/k01-cell-projection-evidence.json`은 source digest,
function/instruction digest, call edge, opcode anchor 및 K01 vector stream digest를 함께 고정한다.

## 호출 규약과 output pointer order

`FUN_00464cc0`은 `ECX=map`과 stack의 `x`, `y`, outputX pointer, outputY pointer를 받고 `RET 0x10`으로
정리한다. `0x00464d30`은 argument 3에 `(x-y)<<5`를 쓰고, `0x00464d32`는 argument 4에
`(x+y)<<4` 및 아래 adjustment를 더해 쓴다.

```text
argument3 -> outputX
argument4 -> outputY
```

`FUN_004648e0:0x00464908`은 먼저 `0x008633c4 + 4*(x*180+y)`를 push하고, 이어
`0x00843984 + 4*(x*180+y)`를 push한다. x86 right-to-left push와 위 callee contract를 합치면 다음과 같다.

```text
outputX = 0x00843984 + 4*(x*180+y)
outputY = 0x008633c4 + 4*(x*180+y)
```

loop는 y outer (`EBP`), x inner (`EDI`)이며 `EBX += 0x2d0`가 x 한 칸의 `180*4` stride를 만든다.
따라서 이 caller는 각 loop cell에 서로 다른 x-major output pair를 미리 쓴다.

반대로 `FUN_00481c50:0x00481e01`은 y outer (`EDI`), x inner (`ESI`)로 `FUN_00464cc0`을 호출하지만,
pointer 계산의 `EAX`를 zero로 시작한다. 따라서 pointer는 x를 포함하지 않는다.

```text
outputX = 0x00843984 + 4*y
outputY = 0x008633c4 + 4*y
```

즉 이 함수는 nested cell loop 전체에서 `FUN_00464cc0`을 호출하되 inner x iteration마다 같은 row pair를
덮어쓴다. 이 증거 범위에서 `FUN_00481c50`을 cell별 output table writer라고 부를 수 없다.

`references.json`의 `FUN_00464cc0` direct unconditional caller edge는 정확히 여섯 개다:
`0x00410f7e`, `0x00416749`, `0x0046491a`, `0x0046547b`, `0x0047301c`, `0x00481e27`.
각각의 enclosing function은 `FUN_00410cc0`, `FUN_00416600`, `FUN_004648e0`, `FUN_004653d0`,
`FUN_00472f90`, `FUN_00481c50`다. 이것은 direct reference inventory이지 indirect call의 전역 부재 주장이 아니다.

## consumer 경계

`FUN_004653d0:0x0046547b`은 nearby candidate loop에서 local outputX/outputY pointers를 `FUN_00464cc0`에
전달한다. 반환 후 두 output에서 input pair를 각각 빼고 제곱해 합산한 뒤 현재 minimum과 비교한다. 따라서 이
범위는 returned projected coordinates를 bounded nearest-cell selection에 소비함을 확정한다. 좌표 축의 사람용
이름이나 terrain 의미까지 정하지는 않는다.

## K01 outputY joint vector

기존 outputY joint table은 `FUN_0046d650` lookup 주소의 마지막 `LEA ... *4`를 누락해 helper를 전부
0으로 만들었다. 따라서 기존의 outputY `+16/+9` 단일 분류와 raw `0/16` 비교는 **반증된 기존 잘못된
계산의 측정값**이다. 정확한 instruction derivation, corrected corner vectors와 canonical diagnostic은
[K01 tile placement-level·object/frame boundary](k01-tile-placement-elevation-boundary.md)를 단일 출처로 삼는다.

독립 corrected replay의 outputY addition histogram은 `-48:156, -39:33, -32:41, -23:87, -16:1028,
-7:307, 0:309, 9:308, 16:1331`이다. outputY joint stream SHA-256은
`4483d6b50a3bf13220c21e4aa7fcf5c7e10216010be45e6aee759dd4a6c14796`이며, 이 수치는 terrain
height/elevation, world-axis 또는 rendering pivot을 뜻하지 않는다. 전체 selector-indexed lookup와
placement-level/raw-shift stream은 [placement evidence fixture](../../../analysis/fixtures/k01-tile-placement-elevation-evidence.json)에
보존한다.

## 재현과 실패 경계

```sh
pnpm imjinrok:extract-k01-cell-projection-evidence
node --test tools/imjinrok/k01-cell-projection-evidence.test.mjs
```

extractor는 EXE, K01 map, `functions.json`, `references.json`의 hash와 크기, 관련 complete body digest,
six direct call edge, 네 opcode anchor를 report를 내기 전에 검사한다. malformed map storage, non-`60×60`
dimensions와 한 byte input mutation을 거부한다.

## 미확정 경계

- `DAT_00c06e86`의 complete lifetime/order, alias/computed writer와 사람용 의미는 미확정이다.
- `FUN_00481c50`이 row overwrite 뒤 해당 pair를 어떤 더 큰 state 의미로 소비하는지는 이 unit 밖이다.
- projection output의 pixel/world axis, gameplay elevation/height, pivot·clip·palette와 full renderer parity는 미확정이다.
