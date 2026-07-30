# 캠페인 국가 선택 화면

## 질문과 범위

원본 캠페인 국가 선택 화면에서 지도 위 조선·일본·명의 어떤 픽셀이 선택 대상인지, hover가 어떤
국가 화면을 표시하는지, 선택 뒤 어떤 국가 값으로 임무 화면으로 넘기는지를 복원한다. 웹의
`pointerup` 의미와 일본·명 임무 목록의 제품 제공 여부는 이 분석 범위 밖이다.

## 원본과 분석 상태

- 실행 파일: `original/imjinrok2/imjinrok2.exe`
- SHA-256: `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- 분석 상태: `정적 확정` — 선택 mask 색, 세 국가 화면, hover selection index와 이후 국가
  routing에 한정한다.
- 재현 상태: `재현 완료` — 원본 mask의 색상 입력과 선택 결과를 fixture로 검증한다.
- 구현 상태: 고전 640×480 profile의 source-backed presentation; 브라우저 pointer event와
  지원하지 않는 임무 목록은 `의도적 적응`이다.

## 자원과 상태 전이

`FUN_0043e920` (`0x0043e920-0x0043ec12`)는 아래 640×480 SPR을 이 순서로 로드한다.

| 역할 | 원본 자원 | SHA-256 |
| --- | --- | --- |
| 기본 화면 | `yfnt/titlestartstage.spr` | `d457f6409dab0697b5434f49315a3bed3b552278b42619fc3719ed355e1ed1ba` |
| 정확한 선택 mask | `yfnt/titlestartstagetoselect.spr` | `98f0b6f38e7fc341f7a869fb4488c852d394093a2bc455c11a74ce843fa404ca` |
| 조선 hover 화면 | `yfnt/titlestartstagekorea.spr` | `65e6758ccf575925b9b20b346a786eeeae39fcc9bd8a96d2ec4c6c0916909c53` |
| 일본 hover 화면 | `yfnt/titlestartstagejapan.spr` | `29f202d78c67df2515643c38fc2608a27b5530ec4611380127acac456540bd45` |
| 명 hover 화면 | `yfnt/titlestartstagechina.spr` | `f570f95741097955a1fbdc7cff48682588043d00aa18d816cb82b0cc7e96311c` |

`titlestartstagetoselect.spr` frame 0은 투명 색 `0xfe` 밖에서는 세 색으로 정확한 territory
pixel 집합을 인코딩한다. bounding box는 설명용일 뿐, 제품 hit test는 사각형이 아니라 mask의
원본 픽셀 색을 사용한다.

| 국가 | mask 색 index | pixel 수 | bounding box | selection index | source nation 값 |
| --- | ---: | ---: | --- | ---: | ---: |
| 조선 | `0x44` | 33,492 | `(431,28)-(612,346)` | 0 | 1 |
| 일본 | `0x46` | 19,518 | `(517,72)-(613,342)` | 1 | 2 |
| 명 | `0x45` | 23,891 | `(320,59)-(445,350)` | 2 | 3 |

`FUN_0043ec70` (`0x0043ec70-0x0043eddf`)는 세 control의 입력 결과를 순서대로 확인한다.
첫 번째·두 번째·세 번째 hit는 `WORD[owner+0x25e8]`에 각각 0·1·2를 기록한다. 이미 선택된
값이 있으면 해당 control의 후속 virtual call을 수행한다. 원본 virtual method의 사람이 읽을 수
있는 이름과 exact press/release gesture는 아직 미확인이다.

상위 흐름 `FUN_0043e620` (`0x0043e620-0x0043e7be`)는 이 selection index를 source nation 값
1·2·3으로 변환한 뒤 stage chooser로 넘긴다. 따라서 map hover와 국가별 selected screen, 그 뒤의
mission selection은 같은 state machine의 인접 단계다.

## 재현 벡터

[`campaign-country-selection-evidence.json`](../../../../analysis/fixtures/campaign-country-selection-evidence.json)과
[`extract-campaign-country-selection-evidence.mjs`](../../../../tools/imjinrok/extract-campaign-country-selection-evidence.mjs)는
다음을 독립 검증한다.

- `0x44 → korea`, `0x46 → japan`, `0x45 → china`
- 투명 `0xfe`와 무관한 색은 선택을 지운다.
- EXE의 세 raw code 범위, 로드 순서, mask 색 인수, selection index 쓰기와 nation routing 상수
- 모든 source SPR의 SHA-256와 `titlestartstagetoselect.spr`의 640×480/1-frame header

## 현재 포팅과 차이

고전 profile은 원본 mask PNG를 보이지 않는 hit test 자원으로 사용하고, 기본·국가별 640×480
source screen을 같은 uniform projection으로 표시한다. 조선 territory 활성화만 현재 제공된 조선
mission list로 이동한다. 일본과 명은 hover 화면을 계속 보이지만, 목록 자료를 임의로 만들지 않으므로
activation은 inert다. `1` 키는 기존 조선 keyboard access이고 Escape/back navigation도 유지한다.

브라우저의 `pointermove`/`pointerout`/`pointerup`은 웹 입력 adaptation이다. 원본은 selection
control의 virtual input method까지는 확인했지만, 그 method가 어떤 physical mouse edge를 요구하는지
이 범위에서는 확정하지 않았다.

## 다음 분석 작업

- 일본·명 mission list의 원본 데이터·unlock policy를 별도 정적 분석한다.
- country control virtual methods의 호출자와 raw mouse edge를 복원해야 exact desktop input gesture를
  주장할 수 있다.
