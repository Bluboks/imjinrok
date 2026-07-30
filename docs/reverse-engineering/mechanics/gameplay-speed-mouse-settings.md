# 게임 속도·마우스 인터페이스 상태 경계

## 질문과 범위

원본의 다섯 단계 게임 속도와 `mouseinterface.spr`의 두 control state를, 웹 포팅의 저장 설정·pointer
동작과 분리해 어느 범위까지 확정할 수 있는가를 다룬다. 브라우저의 one/two-button 조작 규칙은 이 문서의
원본 일치 범위가 아니라 프로젝트 적응이다.

## 원본과 분석 상태

- 원본: `original/imjinrok2/imjinrok2.exe`
- SHA-256: `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- 분석 상태: 정적 확정 (game-speed state/interval/visual group, mouse-interface resource/state control 한정)
- 재현 상태: 재현 완료 (아래의 고정 interval 및 control-state vector 한정)
- 구현 상태: 게임 속도 preference foundation은 원본 기반; localStorage, 반응형 설정 UI와 web pointer
  routing은 의도적 적응이다.

## 게임 속도

`FUN_0043f580` (`0x0043f580-0x0043f5c6`)은 alternate scheduler WORD가 정확히 `1`이면
`DWORD[0x004bdfbc]`를 그대로 반환한다. 그 외에는 `DWORD[0x00634acc]`을 읽는다.

| 상태 | `DWORD[0x004bdfbc]`에 적용 | base `50ms` vector | 고정 `50ms` web tick 배율 |
| --- | --- | --- | --- |
| 0 | `+14` | `64ms` | `50/64` |
| 1 | `+10` | `60ms` | `50/60` |
| 2 | `+0` | `50ms` | `1` |
| 3 | `-10` | `40ms` | `50/40` |
| 4 및 jump-table 범위 밖 | `-20` | `30ms` | `50/30` |

`FUN_004ac4c0` (`0x004ac4c0-0x004ac5bb`)은 control `WORD[ECX+0x10]` state `0..4`를 받아 세
frame씩의 visual group을 만든다. 각각 `[1,1,1]`, `[4,4,4]`, `[7,7,7]`, `[10,10,10]`,
`[13,13,13]`이다. 이 frame group은 speed resource의 원본 상태 표시 근거이며, 웹 HUD의 배치나
입력 control을 확정하지 않는다.

## 마우스 인터페이스 control

`yfnt/mouseinterface.spr`는 SHA-256
`d2f65790f34feca12a28e0f047a76473dd5b2abac108a0627ee2e058a33fd6f4`, `54×24`, 18 frames다.

`FUN_004a5180`은 global `DWORD[0x00634ab8]`가 `1`일 때 첫 control을, `2`일 때 둘째 control을
선택한다. 첫 control은 state WORD `0`과 frames `0..2` (`FUN_004a52a0`/`FUN_004a52c0`), 둘째는
state WORD `1`과 frames `3..5` (`FUN_004a52b0`/`FUN_004a52d0`)를 사용한다.
`FUN_004a52e0`은 첫 control의 exact-one 결과를 global `1`, 그렇지 않고 둘째 control 결과가
exact-one이면 global `2`로 기록한다.

이것은 두 resource/state control의 존재만 확정한다. source control의 플레이어용 label, 원작의
left/right click semantics, drag threshold, command priority는 이 분석 범위 밖이다.

## 재현과 구현 경계

`tools/imjinrok/extract-gameplay-input-speed-settings-evidence.mjs`는 함수 raw-code digest, byte
anchor, EXE hash와 mouse sprite hash/header를 확인하고
`analysis/fixtures/gameplay-input-speed-settings-evidence.json`을 생성한다. 테스트는 base `50ms`에서
state `0..5`가 `[64,60,50,40,30,30]`이 되는 vector와 EXE/resource tamper rejection을 고정한다.

클라이언트의 `gameplayPreferences.ts`는 source state를 five-preset 및 fixed tick multiplier로
변환한다. browser persistence와 pointer policy는 generic engine input action (`select`, pending
confirm/cancel, default action)만 내보내며 실제 command dispatch는 다음 integration slice가 맡는다.

## 다음 작업

- `SkirmishScene` owner가 이 module을 읽어 initial speed·runtime speed persistence·semantic pointer
  action routing만 연결한다.
- source pointer dispatch의 더 넓은 static evidence가 생기기 전에는 web one-button/two-button
  semantics를 원본 일치라고 표기하지 않는다.
