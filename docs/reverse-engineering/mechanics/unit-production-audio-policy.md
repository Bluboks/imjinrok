# 유닛 생산 완료 음성 자원 경계

기준일: 2026-07-31

## 질문과 판정

질문은 `tempeft/trainspotdonemessage.YAV`와 `gamejvi/train{1..6}{c,j,k}1.YAV`가 K01 장수 또는
일반 유닛의 생산 완료 이벤트에 어떤 정확한 결합을 가지는지다.

- 분석 상태: `추정` — 아래의 리소스 초기화·파일 존재·무결성은 정적으로 확인했지만, 어떤 클래스가
  어느 생산 완료 event에서 재생하는지는 닫히지 않았다.
- 재현 상태: `부분 재현` — EXE/리소스 해시, common loader call, 문자열 및 파일 목록을 독립 extractor가
  재현한다. 재생 call-site의 정상·실패 경로는 재현하지 않았다.
- 구현 상태: `의도적 적응` — 제품은 일반 생산 완료를 기본 무음으로 두고, 콘텐츠의 unit audio profile이
  `productionComplete` cue를 명시할 때만 재생한다. 이는 원작 event parity 주장이 아니다.

원본 EXE는 `original/imjinrok2/imjinrok2.exe`, SHA-256
`25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`다.

## 좁은 정적 근거

`FUN_004714d0` (`0x004714d0-0x00472eb6`)은 음향 리소스를 초기화한다.
`0x00471df0`의 byte range는 `tempeft\\trainspotdonemessage.yav` (`0x004c1abc`)를 push하고,
`ECX=0x00c4b620`에서 `0x00470f20`을 호출한다. 이 common message 파일의 SHA-256은
`9bdca60d29bbf3514917ba721273829dd72f5b1b2419047400c9f2081284c7f6`다.

별도로 EXE 문자열 영역 `0x004c4ce0..0x004c585c`에는 `gamejvi\\train1k1.yav`부터
`gamejvi\\train5c1.yav`까지 실제 존재하는 16개 train family 경로가 있다. 이 목록에는
`train6k1`만 있고 `train6j1`/`train6c1`은 없다. filename 및 같은 initializer 영역의 존재만으로는
장수 정체, production completion, 또는 `UnitDefinitionId`를 추론할 수 없다.

따라서 다음을 **확정하지 않는다**.

- `trainspotdonemessage`를 일반 유닛 완료 음성으로 사용하는 call-site
- 각 `train*c1/j1/k1` 리소스의 consumer와 event
- class 76 권율, class 78 유성룡, 또는 K01 project kind와의 production-complete binding

## 재현 벡터와 제품 경계

`tools/imjinrok/extract-unit-production-audio-policy.mjs`와
`tools/imjinrok/unit-production-audio-policy.test.mjs`는 EXE hash, common loader bytes/slot,
문자열 VA, 17개 YAV hash를 검사하고 EXE·resource 변조를 거부한다.

제품의 `selectProductionCompleteAudioCue`는 다음 project policy를 테스트로 고정한다.

1. `swordsman`·`villager`를 포함한 기본 profile은 `productionComplete`가 없으므로 무음이다.
2. 모드/콘텐츠가 해당 kind profile에 등록된 cue를 명시하면 그 새 allied unit만 후보가 된다.
3. 초기화·resume은 먼저 모든 현재 ID를 tracked set에 넣어 replay하지 않는다.
4. 한 sync에 여러 후보가 생기면 ID 오름차순의 첫 cue 하나만 고른다. 실제 playback의 cue-level
   cooldown은 기존 audio player가 유지한다.

K01 장수의 cue 등록은 위 static binding이 후속 분석에서 닫힐 때까지 금지한다. 기존
select/move/attack/die adapter 범위는 이 문서와 무관하다.

## 다음 분석

1. common slot `0x00c4b620`의 모든 read/call consumer를 원본 CFG에서 추적한다.
2. train family의 loader slot/table과 consumer를 각 entry별로 닫는다.
3. producer entity class와 completion state transition을 교차 확인한 뒤에만 K01 장수 profile을
   별도 재현 벡터와 함께 등록한다.
