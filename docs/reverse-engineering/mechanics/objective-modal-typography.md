원본 공통 임무 목표 모달의 두 문자열이 어떤 font resource를 선택하고, 어떤 생성·폭 측정·줄바꿈·수직 배치 호출을 거쳐 content surface에 그려지는지 전체 정적 경계로 복원하여, 현재 project-adapted typography 중 어느 범위만 원본 기반으로 교체할 수 있는가?

기준일: 2026-07-27

## 판정

- 분석 상태: 명시한 font 생성·선택·해제, 두 문자열의 호출 규약, CP949 byte 흐름, 측정·wrap·draw·
  배치와 실패 경로는 `정적 확정`
- 재현 상태: `부분 재현`
  - `320 → 300` 폭 제한, ASCII-space chunk, strict fit, 줄 높이·출력 크기 계산, 빈 문자열,
    scratch clear/HDC/font-select/세로 초과 경로는 공급한 synthetic 성공 GDI 측정값 아래 재현
  - 보존된 원본에 없는 Windows font mapper 결과와 실제 K0110 glyph 폭·줄 분할은 미재현
- 구현 상태: 유효 base 폭 `300`만 `원본 기반`으로 좁게 교체. font family·size, 실제 glyph 측정,
  Korean wrap, line spacing, stroke와 responsive font scaling은 계속 `의도적 적응`

`FUN_004a9010`은 후보가 아니라 `FUN_004a5730`에서 두 번 직접 호출되는 공용 byte-string
renderer다. 다만 `Arial` 요청만으로 원본 설치 환경이 실현한 한글 font file과 glyph metrics를
확정할 수 없으므로 현재 웹 font를 `Arial 12px`로 바꾸거나 K01의 실제 줄 분할을 원본 일치로
표기하지 않는다.

## 원본 입력과 provenance

| 입력 | SHA-256 | 역할 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | 함수·전역·GDI import·상수 |
| `original/imjinrok2/script/K0110` | `d9dcc3c78d0373181677afc63fe9331ff561387e36877a62912ca66515f4aea8` | 두 `OBJECTIVE` 입력의 Windows-949 bytes |

K0110의 첫 입력은
`1. 봉화대를 짓고 적군 섬멸 (유성룡, 권율은 살아 남아야 한다.)`, 둘째 입력은 빈 문자열이다.
첫 입력의 61 bytes는 다음과 같다.

```text
312e20bac0c8adb4ebb8a620c1feb0ed20c0fbb1ba20bcb6b8ea
2028c0afbcbab7e62c20b1c7c0b2c0ba20bbecbec620b3b2bec6
bedf20c7d1b4d92e29
```

추출기는 EXE·K0110 해시뿐 아니라 `seeds.json`, `functions.json`, `references.json`의
`sourceSha256`를 확인한다. 생성 산출물은 이번 질문에서 수정하지 않았다.

## 함수 경계

| 함수 | 전체 byte range | CFG / instruction | whole-range SHA-256 | 이 질문의 역할 |
| --- | --- | ---: | --- | --- |
| `FUN_004a5730` | `0x004a5730-0x004a5978` | 13 / 157 | `84cccf7daf0e07f6a0e58041034a86be6fbc07937c768240426632bb7e8855e9` | record 추출, 두 renderer call, X·center Y blit |
| `FUN_004a9010` | `0x004a9010-0x004a9259` | 23 / 189 | `bf0bc845081af0d33719555f7ed7e735b3bfa2a00f0a5f84586744ac5cb02780` | scratch 준비, HDC/font 선택, chunk 측정·wrap·draw, 크기 출력 |
| `FUN_004a92f0` | `0x004a92f0-0x004a9307` | raw whole range / 7 | `0807b2458a2ad20dcf0a6a78bba9841295870472fcf37e5a3180760a0cfb4894` | `(0,0,300,250)` scratch 준비 wrapper |
| `FUN_004a9310` | `0x004a9310-0x004a9364` | raw whole range / 26 | `0f79789dbc8cf2aab9f887e88aed51fdfb41b35d577de88d9261e8eff5d26169` | surface lock 뒤 `(0,0)-(299,249)`를 index `0xfe`로 clear |
| `FUN_004a9370` | `0x004a9370-0x004a93bd` | raw whole range / 31 | `10a404bcdeaf01c7975a8d3ba4682355d514e78ccce2fe02f64247e9832dbbf1` | 전체 문자열의 `SIZE.cy`를 측정하고 1.5배 높이 반환 |
| `FUN_004402b0` | `0x004402b0-0x004404e7` | raw whole range / 189 | `6eeba9911fb4e75c5457b469474a09245bf51ec56908b21cd9d9158608c2ae18` | 여러 GDI font 생성, `DAT_00634e38` 생성 |
| `FUN_0045f190` | `0x0045f190-0x0045f244` | raw whole range / 42 | `b512d4288d72637a244cfbb9485ae6a2b74350414524a5c91e11afcd9f0074be` | process UI init 중 font initializer 호출 |
| `FUN_0045f250` | `0x0045f250-0x0045f308` | raw whole range / 49 | `9ea10d5aa3a36a6741055fbc2bd07d68b99c417757e5ddc918fd2f0be855ee2a` | `DAT_00634e38`을 `DeleteObject`에 전달 |

앞의 두 함수는 현재 configured seed이므로 전체 instruction bytes와 CFG를 검증한다. 나머지는 seed
table에 추가하지 않고 `functions.json`의 정확한 경계·instruction digest와 원본의 전체 연속 byte
range SHA-256을 함께 검증한다. 주요 raw whole-range digest는 extractor report에 기록된다.

## `FUN_004a9010` 연결과 실제 호출 규약

`references.json`에서 `to == 0x004a9010`인 complete structured direct-call set은 8개다.

| call VA | caller |
| --- | --- |
| `0x00486315` | `FUN_00485f20` |
| `0x00494de1` | `FUN_00494d40` |
| `0x004a5863` | `FUN_004a5730`, 첫 OBJECTIVE |
| `0x004a58e4` | `FUN_004a5730`, 둘째 OBJECTIVE |
| `0x004a6259` | `FUN_004a6120` |
| `0x004a7ac4` | `FUN_004a7a50` |
| `0x004a8916` | `FUN_004a88f0` |
| `0x004a897e` | `FUN_004a88f0` |

canonical projection SHA-256은
`4937ac71aa4365a25ca0bfb4549bf172fd2ce9d0d14dda103fbfa969f6c90138`이다.
따라서 이 함수는 objective 전용이 아닌 공용 renderer지만 objective 연결 자체는 직접 확정된다.

Ghidra의 parameter 추정 대신 `0x004a5847-0x004a586d`와
`0x004a58c8-0x004a58ee`의 x86 push·stack cleanup을 사용하면 실제 선언은 다음과 같다.

```text
cdecl FUN_004a9010(
  signed WORD requestedMaxWidth,
  const BYTE* nulTerminatedWindows949,
  signed WORD* widthOut,
  signed WORD* heightOut,
  COLORREF textColor
)
```

caller는 오른쪽부터 `0x0000ffff`, `heightOut`, `widthOut`, text pointer, `320`을 push하고 반환
후 `ESP += 0x14`를 수행한다. 두 output의 순서는 caller가 반환 직후 width WORD를 읽고, 별도로
height WORD를 세로 중심 계산에 사용하는 것으로 교차 확인했다. decompiler의 잘못된 3인자
prototype이나 미정 레지스터를 근거로 쓰지 않는다.

requested width와 두 output은 signed WORD다. GDI `SIZE.cx/SIZE.cy`는 signed 32-bit `LONG`이며,
renderer의 source index·current X/Y는 DWORD local이지만 여러 비교·출력 지점에서 low WORD를
sign-extend한다. 정상 font metrics 범위를 벗어난 truncation/overflow는 원본 코드가 방어하지
않으며 이번 재현 모델도 지원 범위 밖 입력으로 거부한다.

## font 생성·선택·해제

`DAT_00634e38`의 complete structured reference set은 11개이며 canonical SHA-256은
`041fca1e4c4ae1b2ac7c92d96322ad29752fac958c7aba3f4cd688fc8f857581`이다. 유일한 write는
`0x004403af`, objective renderer read는 `0x004a908c`, teardown read는 `0x0045f293`이다.
나머지 read는 `0x0049433b`, `0x004948fb`, `0x004a822d`, `0x004a8681`, `0x004a8ba0`,
`0x004a8efd`, `0x004ab3ef`, `0x004ac85d`로 같은 HFONT가 다른 공용 텍스트 경로에도 쓰인다.

`0x00440389-0x004403b3`의 `CreateFontA` 인자는 다음과 같다.

| LOGFONT 의미 | 값 |
| --- | --- |
| height / width | `12` / `0` |
| escapement / orientation | `0` / `0` |
| weight | `0`, 즉 explicit bold 요청 없음 |
| italic / underline / strikeout | 모두 `0` |
| charset | `0x81`, `HANGEUL_CHARSET` |
| output/clip precision, quality, pitch/family | 모두 `0` |
| face string | EXE `0x004bba98`의 `Arial` |

이는 SPR 같은 game font resource 선택이 아니라 GDI logical font 요청이다. GDI32 import descriptor
`0x004b8f80`과 IAT를 직접 파싱해 다음 identity를 고정했다.

| IAT VA | import |
| --- | --- |
| `0x004b703c` | `CreateFontA` |
| `0x004b7048` | `SetTextColor` |
| `0x004b704c` | `SetBkMode` |
| `0x004b7050` | `TextOutA` |
| `0x004b7054` | `SelectObject` |
| `0x004b7058` | `GetTextExtentPoint32A` |
| `0x004b705c` | `DeleteObject` |

init 호출은 `0x0045fa3b → FUN_0045f190 → 0x0045f202 → FUN_004402b0`이다. 생성 결과는 null도
`DAT_00634e38`에 기록한다. null이면 `FUN_0044b040`으로 오류를 보고하고 다음 font 초기화로
계속한다. renderer는 acquired HDC에 이 전역을 `SelectObject`하고 반환을 검사하지 않는다.

teardown의 complete direct caller set은 `0x0045f40f/FUN_0045f320`,
`0x00460b3b/FUN_00460a10`이다. `FUN_0045f250`은 전역을 `DeleteObject`에 전달하고 반환을
검사하지 않는다. null·이미 무효 handle에 대한 GDI 결과를 별도 상태로 반영하지 않는다.

## CP949 byte에서 content surface까지

```text
DAT_0088afcc=1
  -> 128-byte record script\k0110
  -> FUN_004838f0 copies two OBJECTIVE payloads into local buffers
  -> FUN_004a9010(320, bytes, &width, &height, 0x0000ffff)
       FUN_004a92f0()
         FUN_004a9310(0,0,300,250)
       effectiveWidth = min_signed(requestedWidth, 300)
       acquire DAT_00549268 HDC through vtable+0x44
       SetBkMode(hdc, 1)
       SelectObject(hdc, DAT_00634e38)
       lineHeight = FUN_004a9370(hdc, full bytes)
       split/measure/draw chunks
       release HDC through vtable+0x68
       widthOut = maxLineWidth + 1
       heightOut = currentY + lineHeight + 1
  -> DAT_0054927c vtable+0x1c blits scratch result
```

`FUN_004a9010`은 caller의 `320`을 signed compare한 뒤 내부 최대 `300`으로 제한한다. 정상
출력에서 line width는 항상 `300` 미만이고 output에 1을 더하므로 caller의 후속 `320` clamp는
도달 가능한 정상 폭을 더 줄이지 않는다.

문자열 처리는 Unicode나 CP949 code point를 해석하지 않는다. NUL까지 byte length를 구하고,
byte `0x20`을 만날 때까지 복사하며 space 자체를 chunk에 포함한다. 따라서
`GetTextExtentPoint32A`와 `TextOutA`에는 원래 Windows-949 bytes가 그대로 전달된다. character
break 경로는 없다.

각 chunk에 대해 `currentX + measuredChunkWidth < effectiveWidth`일 때만 현재 줄에 그린다.
같으면 wrap한다. accepted chunk는 `0x010101`로 `(x+1,y+1)`에 shadow를 먼저 그리고, caller
color `0x0000ffff`로 `(x,y)`에 본문을 그린다.

`FUN_004a9370`은 전체 문자열을 `GetTextExtentPoint32A`로 측정한 `SIZE.cy`에
`trunc(SIZE.cy/2)`를 더한다. wrap은 Y를 `lineHeight+1`만큼 전진시킨다. 새 Y와 lineHeight의
합이 `250`을 넘으면 오류를 보고하고 종료한다. output width·height는 각각 최대 줄 폭+1,
현재 Y+lineHeight+1이다. 빈 둘째 문자열도 HDC 측정이 성공하면 width `1`과
`height = supplied SIZE.cy + trunc(SIZE.cy/2) + 1`을 출력하지만 그릴 chunk는 없다.

caller는 signed height를 2로 나눌 때 음수 보정을 포함한 truncation toward zero를 사용한다.
첫 blit Y는 `166 - trunc(height/2)`, 둘째는 `228 - trunc(height/2)`, 두 X는 모두 `158`이다.

## 실패와 early return

- `FUN_004838f0 != 1`: 두 renderer call과 두 blit 모두 생략한다.
- scratch surface null 또는 `FUN_004a9310` lock 실패: clear만 생략하고 renderer는 HDC 획득을
  계속 시도한다. stale scratch pixels가 남을 가능성을 코드가 막지 않는다.
- HDC 획득 결과 nonzero: font·measure·draw를 건너뛰며 release 없이 width `1`, height `1`을
  기록한다.
- font 생성 null: 오류를 보고하고 계속한다. 이후 null `HFONT` 선택 결과도 검사하지 않는다.
- `SetBkMode`, `SelectObject`, `SetTextColor`, `TextOutA`, `DeleteObject` 실패: 반환을 무시한다.
- `GetTextExtentPoint32A` 실패: 반환을 무시하고 초기화되지 않은 stack `SIZE`를 소비한다. 이
  경우의 dimension·분기·pixels는 deterministic original behavior로 재현할 수 없다.
- 하나의 chunk 폭이 유효 폭 이상이면 소비하지 않은 같은 chunk를 새 줄에서 반복 측정한다.
  prospective bottom이 250을 넘을 때 오류를 보고하고 HDC를 release한다.

## 독립 재현

`analysis/fixtures/objective-modal-typography-vectors.json`은 EXE·K0110 SHA-256과 정확한 두
OBJECTIVE byte payload를 고정한다. 다음 observable 결과를 full deep equality로 검사한다.

- font 생성 성공과 null 저장·오류 보고·계속
- 실제 K01 CP949 chunk 분할과 공급한 synthetic chunk 폭 아래의 조건부 wrap
- caller 320 요청의 renderer 300 제한
- 빈 둘째 문자열의 공급 synthetic `SIZE.cy=0` 아래 width `1`·height `1`·무 draw
- strict equality가 wrap되는 경계와 oversized chunk의 250-pixel overflow
- scratch clear lock 실패 뒤 render 계속
- HDC 획득 실패의 `1×1`, no-release
- font selection 실패 반환 무시
- signed WORD·hex·metric vector 범위 밖 입력 거부
- 변조 EXE/K0110, stale functions/seeds/references, 빠진 caller와 변조 font write 거부

fixture의 `fullStringMeasuredHeight`는 `CreateFontA` logical height나 관측된 원본 pixel height가
아니라 전체 문자열 `GetTextExtentPoint32A`의 `SIZE.cy`로 공급하는 입력이다. K01 vector의
`fullStringMeasuredHeight=12`와 chunk widths는 원본에서 관측한 값이 아니라 control-flow를
재현하기 위해 명시적으로 공급한 synthetic 측정값이다. 따라서 실제 K0110 line breaks를
재현했다는 증거가 아니다. 빈 둘째 문자열 vector의 `fullStringMeasuredHeight=0`도 원본 빈
문자열의 `SIZE.cy`를 확정하지 않는 공급 synthetic 입력이다. 이 vector는 성공한 측정이 0을
반환할 때 helper가 `lineHeight=0`, width `1`, height `1`을 결정적으로 산출한다는 경계만
재현한다. 실패한
`GetTextExtentPoint32A`는 undefined stack 값을 만들므로 모델도 가짜 fallback dimension을 만들지
않고 해당 입력을 거부한다.

HDC 획득 실패는 원본이 font 선택과 GDI 측정에 도달하지 않으므로 fixture도 그 경로에
`fontSelectionSucceeded`, `gdiMeasurementsSucceeded`, `fullStringMeasuredHeight`,
`chunkWidths`를 요구하지 않는다. HDC 획득 뒤에는 이 입력들을 검증하며,
`GetTextExtentPoint32A` 실패는 여전히 undefined `SIZE` 때문에 거부한다.

## 클라이언트 이식 경계

`apps/game-client/src/originalObjectivePanelLayout.ts`는 같은 K01 vector에서 확정한
`effectiveMaxWidth=300`만 presentation layout에 노출하고 uniform scale로 확장한다. caller
요청값 320은 extractor evidence에만 남긴다. `objectiveModalPhaserView.ts`도 실제 wrap width에
유효 폭만 사용한다.

이 변경은 원본의 fixed 640×480 typography 폭 규칙만 이식한다. 다음은 계속 프로젝트 적응이다.

- `"Noto Serif KR", Batang, serif`와 base `16px`
- Phaser/Canvas의 glyph measurement와 `useAdvancedWrap`
- Korean character wrapping, line spacing `5`, color stroke
- 640×480 밖의 uniform font scaling

원본의 ASCII-space-only retry 정책을 Phaser에 억지로 복제하지 않았다. 실제 Windows font
realization·metrics가 없으면 K0110 줄 결과를 같은 vector로 닫을 수 없기 때문이다. project는 원본
GDI renderer architecture나 numeric state를 public UI contract에 노출하지 않는다.

## 미확정과 후속 경계

- 원본 설치 Windows가 `Arial` + `HANGEUL_CHARSET` 요청에 실현한 실제 face/file/version
- 그 실현 font의 K0110 chunk별 `SIZE.cx`, `SIZE.cy`, 실제 line breaks와 pixels
- 빈 문자열을 측정했을 때 원본 환경이 반환한 실제 `SIZE.cy`
- unchecked GDI measurement 실패에서 나타나는 undefined stack 결과

사용자는 pixel-identical typography를 요구하지 않으며 현재 가용한 Noto/Canvas 조합을 허용했다.
따라서 설치 매체의 font provenance 조사는 중단하고 위 actual metric 항목은 미확정으로 유지한다.
후속 UI 정적 분석은 [선택 패널 slot dispatcher](selection-panel-slot-dispatch.md)처럼 project
superset을 지배하지 않는 좁은 compatibility slice 단위로 진행한다.
