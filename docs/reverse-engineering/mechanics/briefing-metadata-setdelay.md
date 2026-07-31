# K0110 briefing `TITLE`·`OBJECTIVE` overlay와 `SETDELAYTIME`

## 질문과 판정

K0110의 첫 `SPEECH` 이전에 `TITLE`, `OBJECTIVE`, `SETDELAYTIME`가 어떤 record와 owner field를
만들고, 어떤 640×480 overlay 좌표·순서로 소비되는가를 한정한다.

- 분석 상태: **정적 확정**. command lookup, record dispatcher/consumer/readiness, 두 overlay
  producer의 전체 raw function·구조화 reference projection·byte anchor를 고정했다.
- 재현 상태: **범위 한정 재현 완료**. 정상·엄격 경계·DWORD wrap·signed-WORD sign extension과
  두 overlay rectangle/order를 독립 vector로 재현한다.
- 구현 상태: **분석 전용, production 변경 없음**. 현재 프로젝트의 briefing timing 또는 dialogue
  inter-line gap에 원작 일치 주장을 추가하지 않는다.

## provenance와 추출기

| 입력 | SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `original/imjinrok2/script/K0110` | `d9dcc3c78d0373181677afc63fe9331ff561387e36877a62912ca66515f4aea8` |

`tools/imjinrok/extract-briefing-metadata-evidence.mjs`는 EXE를 직접 PE VA→raw offset으로 변환한다.
6개 전체 function raw range SHA-256, `functions.json`의 body boundary·instruction digest,
12개 byte anchor, 4개 complete structured outgoing-reference projection을 검사한다. EXE·K0110,
`functions.json`·`references.json`의 stale source hash 및 projection 변조는 report 전에 거부한다.
새 Ghidra seed는 추가하지 않았다.

| 함수 | inclusive VA 범위 | 범위 역할 |
| --- | --- | --- |
| `FUN_00482590` | `0x00482590-0x0048285c` | 11개 command 문자열 lookup |
| `FUN_00482860` | `0x00482860-0x00482eda` | command index별 record payload 생성 |
| `FUN_004830f0` | `0x004830f0-0x004833bc` | record 소비 및 overlay producer 호출 |
| `FUN_00483500` | `0x00483500-0x00483657` | record readiness |
| `FUN_004a88f0` | `0x004a88f0-0x004a89dd` | `OBJECTIVE` overlay producer |
| `FUN_004a89e0` | `0x004a89e0-0x004a8abb` | `TITLE` overlay producer |

## command record와 delay

`FUN_00482590` lookup은 `SETDELAYTIME=3`, `OBJECTIVE=7`, `TITLE=9`를 반환한다.
`FUN_00482860`은 각각 signed `WORD`, `0x200` byte two-string, `0x40` byte string payload를 만든다.
`FUN_004830f0` case 3은 `timeGetTime()`을 `owner+0xc20` DWORD에, payload WORD를 signed 확장한
DWORD를 `owner+0xc24`에 쓴다. case 7은 `FUN_004a88f0`, case 9는 `FUN_004a89e0`를 호출한다.

case 3 readiness는 먼저 stored duration을 검사한다. 0이면 `0x00483543`의 `JE 0x00483626`으로
즉시 ready를 반환하며 `owner+0xc20` start field를 읽거나 clear하지 않는다. nonzero일 때만 다음과
같다.

```text
elapsed = (timeGetTime() - owner+0xc20) modulo 2^32
if unsigned(elapsed) > unsigned(owner+0xc24):
    owner+0xc20 = 0
    owner+0xc24 = 0
    ready
else:
    retain
```

따라서 `elapsed == duration`은 retain이고 `duration + 1`에서만 clear/ready다. signed negative
WORD는 `0xffff8000..0xffffffff`로 확장되어 unsigned 비교에서는 매우 긴 wrap-sensitive wait가
된다. 특히 `-1`은 어떤 DWORD elapsed도 초과할 수 없다. 이것은 음수 script 입력을 정상
presentation delay로 승인한다는 뜻이 아니다.

## K0110 source order

K0110의 첫 `SPEECH` 전 command 순서는 다음과 같이 fixture가 exact text와 함께 고정한다.

1. `CHANGEMUSIC music\briefmusic.yav`
2. `CHANGETITLE ybriefingfnt\k01\k01.spr`, 뒤 `SETDELAYTIME 500`
3. `CHANGETITLE ybriefingfnt\K01\k0101.spr`부터 `k0111.spr`까지 11회, 각각 뒤
   `SETDELAYTIME 15`
4. `TITLE 1. 불안한 전운`
5. `OBJECTIVE 1. 봉화대를 짓고 적군 섬멸 (유성룡, 권율은 살아 남아야 한다.)`, second string empty
6. `SETDELAYTIME 100`, 그 다음 첫 `SPEECH K3/slot 0/k01010`

`CHANGETITLE`와 결합된 delay의 raw subtotal은 `500 + 11×15 = 665`다. 뒤의 100은 첫
`SPEECH` 직전의 별도 delay다. strict `>` 비교와 caller/update cadence가 있으므로 665 ms 또는
765 ms를 어떤 overlay의 정확한 wall-clock visible duration이라고 주장하지 않는다.

## overlay geometry와 draw order

| command | source clear/draw RECT | text input | activation |
| --- | --- | --- | --- |
| `OBJECTIVE` | `(188,290)-(466,376)`, 278×86 | width 278 wrap; x 188, vertical centers around y 311 then y 354 | `owner+0x568=1` |
| `TITLE` | `(188,65)-(466,95)`, 278×30 | x 188 left anchor, vertical center around y 80 | `owner+0x564=1` |

이 좌표는 `FUN_004a88f0`/`FUN_004a89e0`가 shared source surface에서 clear와 text draw에 쓰는
원본 640×480 좌표다. 실제 Windows font realization, wrapped Korean glyph height와 pixel output은
이 slice에 포함하지 않는다.

기존 [선택 패널 slot dispatcher](selection-panel-slot-dispatch.md)의 `FUN_004a84e0`는 slot 뒤에
`owner+0x568 == 1` rectangle을 먼저, `owner+0x564 == 1` rectangle을 다음에 blit한다. 두 field가
nonzero라도 exact one이 아니면 visibility gate는 열릴 수 있지만 해당 optional rectangle은 draw하지
않는다.

## 재현 vector와 현재 구현 경계

`analysis/fixtures/briefing-metadata-evidence-vectors.json`과 focused test는 다음을 검사한다.

- duration 100의 `elapsed=100` retain, `101` clear, `0xfffffff0→0x00000006` wrap elapsed 22
- `-1` sign-extension non-completion과 `-32768` high unsigned duration boundary
- `+0x568` objective rectangle 후 `+0x564` title rectangle 순서 및 non-one no-draw
- K0110 exact pre-first-`SPEECH` command/order/text/duration
- EXE, script, function catalog, structured reference projection의 stale/tampered 거부

이것은 source timing/metadata 분석일 뿐 현재 web rendering calibration이나 `SPEECH` 사이 pause의
원작 일치 증거가 아니다. 다음 좁은 작업은 필요할 때 `CHANGETITLE` producer/consumer와 outer update
cadence를 별도로 닫는 것이다.
