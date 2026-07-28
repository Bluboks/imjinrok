# 분석 도구 인벤토리

기준일: 2026-07-27

이 문서는 `tools/imjinrok/`의 도구를 현재 정적 분석 계획에 맞게 분류한다. 분류는 도구의 존재나
테스트 통과 여부가 아니라, 원본 동작의 근거로 사용할 수 있는 범위를 뜻한다.

## 분류 기준

| 상태 | 의미 |
| --- | --- |
| `유지` | 현재 정적 분석·원본 데이터 처리 흐름에서 계속 사용한다. 출력의 해석 범위는 별도로 제한한다. |
| `재검증` | 탐색점이나 변환 도구로는 유용하지만 주소·오프셋·의미 가정을 새 Ghidra 산출물로 다시 확인한다. |
| `보관` | 과거 VM·동적 실험 또는 구현 감사용이다. 기본 분석 경로에서 실행하지 않고 원본 정적 근거로 사용하지 않는다. |

## 정적 분석 기반

| 파일 | 상태 | 허용 용도와 제한 |
| --- | --- | --- |
| `static-analysis-versions.env` | 유지 | Ghidra와 JDK 버전·배포 파일 SHA-256 고정 |
| `setup-static-analysis.sh` | 유지 | 사용자 캐시에 검증된 분석 도구 설치 |
| `run-static-analysis.sh` | 유지 | 원본 EXE 해시 확인, headless import, 내보내기 검증 후 결과 설치 |
| `ghidra/ExportImjinrokAnalysis.java` | 유지 | 함수·호출 관계·문자열·seed CFG·명령어·디컴파일 결과 생성 |
| `validate-static-analysis.mjs` | 유지 | 생성 JSON의 스키마·입력 해시·정렬·참조 무결성 검사 |
| `static-analysis-pipeline.test.mjs` | 유지 | 커밋된 실제 산출물과 실패 경로 회귀 검사 |
| `pe-image.mjs` | 유지 | PE 헤더, VA와 파일 오프셋의 독립 교차 검사. 함수 의미 분석에는 사용하지 않음 |
| `static-evidence.mjs` | 유지 | 전용 추출기들이 원본 해시, seed 함수 전체 본문, 원시 코드 범위와 VA 바이트 anchor를 중복 없이 검증하는 공통 helper |
| `extract-executable-refs.mjs`, `executable-refs.test.mjs` | 유지 | ASCII 문자열과 PE 위치를 탐색점으로 수집. 문자열 존재는 동작 증거가 아님 |
| `extract-mission-portrait-mapping.mjs`, `mission-portrait-mapping.test.mjs` | 유지 | `SPEECH` 소비자·ID 조회·`hero.spr` 프레임 표의 정적 확정 결과 추출과 회귀 검사 |
| `extract-speech-layout-evidence.mjs`, `speech-layout-evidence.test.mjs` | 유지 | `SPEECH` 숫자 슬롯·초상화 사각형·대사 좌표의 정적 확정 결과 추출과 회귀 검사 |
| `extract-objective-panel-layout-evidence.mjs`, `objective-panel-layout-evidence.test.mjs` | 유지 | 임무 목표 모달 전체 흐름·원본 SPR·사각형·hit test·실패 경로는 함수 해시·CFG로 정적 검증하고, 갱신 결과와 정상 로드 자원의 종료 clear-lock 성공·실패만 원본 입력 벡터로 재현 |
| `extract-objective-modal-k01-binding.mjs`, `objective-modal-k01-binding.test.mjs` | 유지 | `0x3f0` 생산과 독립 `0x3ee→0x3ec→0x3ea` 컨트롤의 마지막 활성 우선순위, signed WORD K01 인덱스 1과 K0110 목표 텍스트·K01 map·handler 결합을 EXE·스크립트·맵 해시와 전체 함수·원시 범위로 정적 검증하고 경계 벡터로 재현 |
| `extract-application-state-16-objective-control.mjs`, `application-state-16-objective-control.test.mjs` | 유지 | application state `0x16`의 complete structured direct-reference 생산 경로, Escape·gameplay-panel request producer, K01 mode 1의 `buttons201.spr` 목표 컨트롤 사각형·strict 입력·draw 조건을 정적 검증하고 연결 벡터로 재현 |
| `extract-objective-pending-action-dispatch.mjs`, `objective-pending-action-dispatch.test.mjs` | 유지 | `DAT_00552998` 직접 참조 전수, `0x3f0→0x3ee→0x3ec→0x3ea` producer overwrite, `FUN_00449090`의 목표 모달 소비·reset·surface/resource 실패를 전체 함수·jump table·바이트 anchor로 검증하고 semantic `open-objective-modal`까지 재현 |
| `extract-objective-modal-typography.mjs`, `objective-modal-typography.test.mjs` | 유지 | 목표 모달의 5인자 renderer, `Arial`/height 12/HANGEUL_CHARSET GDI font lifecycle, CP949 byte chunk·300px strict wrap·배치·실패 경로를 EXE·K0110·함수/참조/import provenance로 검증; 실제 Windows font realization·K0110 glyph 폭은 미재현으로 분리 |
| `extract-selection-panel-slot-dispatch.mjs`, `selection-panel-slot-dispatch.test.mjs` | 유지 | `FUN_004a84e0`의 complete caller/outgoing reference, 네 slot gate·kind branch·progress WORD·label 배치·surface lifecycle을 전체 함수·원시 범위·바이트 anchor로 검증하고 synthetic GDI 측정 경계를 분리해 재현 |
| `extract-selection-panel-slot-lifecycle.mjs`, `selection-panel-slot-lifecycle.test.mjs` | 유지 | owner `0x005e3680`의 네 SPEECH portrait/label slot 생성·producer·reset·clear, 17-entry ID/CP949 label table, K0110 화자 결합과 optional overlay 독립 경계를 EXE·script·whole-function·structured reference로 검증하고 실패/no-op을 재현 |
| `extract-transient-formatted-overlay.mjs`, `transient-formatted-overlay.test.mjs` | 유지 | `FUN_004567c0` 전체와 sole structured caller·owner writer/producer, supplied post-call RECT의 block alignment·clamp·final blit, `FUN_00457460`의 비직관적 cache gate·fixed `(200,350)` draw·HDC 실패 순서를 exact EXE/function/reference/import provenance로 검증하고 synthetic metrics 아래 재현; fixed bottom selection panel 후보를 반증하되 gameplay concept는 확정하지 않음 |
| `extract-persistent-selection-action-boundary.mjs`, `persistent-selection-action-boundary.test.mjs` | 유지 | selection/no-selection owner·input transport와 action 115 payload-zero field-0x266 exact-one reservation/write·non-one common-write bypass, payload-one removal/no-match refund, action 107 early exit만 bounded full-result vector로 재현; queue pump·selected-action queue-count marker·state 0x0f handoff와 `FUN_0042de00/FUN_00483c50` dispatch boundary는 exact whole-function·anchor·complete structured set의 static-only 증거로 분리 |
| `extract-hero-priority-queue-gate.mjs`, `hero-priority-queue-gate.test.mjs` | 유지 | player record `+0x254e` WORD gate, actions 63/64 writer·전체 record reset, selection-count-zero slot 1 control, 229개 initialized action·95개 type definition의 exact 16-action named-hero 교집합을 정적 검증하고 bounded control/hit·gate write·filtered/FIFO queue removal을 full-result vector로 재현; deeper redelivery와 resource 파일명은 범위 밖 |
| `extract-magic-auto-use-gate.mjs`, `magic-auto-use-gate.test.mjs` | 유지 | player record `+0x254c` WORD의 complete direct refs·actions 61/62·전체 record reset·selection-count-zero slot 0과 `FUN_004196e0`의 sole caller·79-case table·27-call outgoing set·9-class 원본 이름을 정적 검증; bounded control/hit·gate write와 consumer case admission만 full-result vector로 재현하고 cadence·deeper effect는 static-only로 분리 |
| `extract-k01-ryu-auto-magic-path.mjs`, `k01-ryu-auto-magic-path.test.mjs` | 유지 | class 78 case, registry/live/team helpers, actions 40/59 delivery·pending consume·state/effect complete bodies와 두 switch·call projections를 source hash에 결합; cadence·선택 소유권 필드·중심 제외 8개 subtype 16 candidate gate와 manual pending/normal-attack 경계를 부분 재현 |
| `extract-k01-subtype-16-path.mjs`, `k01-subtype-16-path.test.mjs` | 유지 | action 59 loop-carried full DWORD, fixed record 생성·100-slot reset·160-WORD path·generation tracking·cleanup, subtype 16 current-slot subtype 1 재초기화와 mode 2 kind 2 dispatcher, low-active/class-95/full-generation/writer-gate 및 kind 2/9 buffer/health 경계를 EXE·generated evidence에 결합해 부분 재현 |
| `extract-unit-animation-pilot.mjs`, `unit-animation-pilot.test.mjs` | 유지 | 조선 창병·클래스 2 식별, 상태 1·2 이동 의미·방향·phase→frame·mirror와 특수 분기 격리 |
| `extract-k01-hero-movement-pilot.mjs`, `k01-hero-movement-pilot.test.mjs` | 유지 | K01 권율·유성룡의 클래스, 주·보조 SPR, 상태 8/1/4/7 대기·이동·공격·사망 방향·phase→frame·mirror 정적 추출 |
| `extract-k01-hero-basic-attack-pilot.mjs`, `k01-hero-basic-attack-pilot.test.mjs` | 유지 | K01 두 영웅의 일반 공격 상태·효과 phase·회복 카운터·payload, 권율 직접 피해와 유성룡 투사체 생성 정적 추출·재현 |
| `extract-building-state-pilot.mjs`, `building-state-pilot.test.mjs` | 유지 | 조선 본영·클래스 49·슬롯 141의 건설 진행도와 정상·반파 본체 프레임 정적 파일럿 |
| `extract-entity-type-catalog.mjs`, `entity-type-catalog.test.mjs` | 유지 | 클래스 1~95의 원본 이름·슬롯·기본 프레임·flags·SPR 경로 전수 추출과 결정론 검증 |
| `extract-beacon-state-pilot.mjs`, `beacon-state-pilot.test.mjs` | 유지 | 조선 봉화대·클래스 52·`firehousek.spr` 정체와 건설·정상·반파 본체 프레임 정적 파일럿 |
| `audit-sprite-mappings.mjs`, `sprite-mapping-audit.test.mjs` | 유지 | 타입 정체, 확정된 본체·초상화 범위와 미검증 프레임 매핑을 분리해 감사 |

## 원본 데이터 파서와 변환기

| 파일 | 상태 | 허용 용도와 제한 |
| --- | --- | --- |
| `asset-inventory.mjs` | 유지 | 원본 자원 파일 목록과 참조 후보 조사 |
| `codec.mjs`, `convert-sprites.mjs` | 유지 | SPR·YTL·PAL 구조 해석과 시각화용 변환. 게임 상태 의미는 별도 분석 |
| `convert-audio.mjs` | 유지 | 원본 음성 자원의 웹용 변환. 이벤트 타이밍의 근거가 아님 |
| `inspect-scripts.mjs` | 유지 | 원본 스크립트 레코드 탐색 |
| `map-codec.mjs`, `map-codec.test.mjs` | 재검증 | 지도 헤더·레코드 탐색에 사용하되 추론된 오프셋과 필드 의미를 교차 확인 |
| `inspect-maps.mjs`, `inspect-map-records.mjs` | 재검증 | 지도 후보 구조와 분포 조사 |
| `extract-map-terrain-mask.mjs` | 재검증 | 지형 마스크 후보 탐색. 휴리스틱 결과는 원본 형식 확정 근거가 아님 |
| `export-map-definition.mjs` | 재검증 | 포팅용 지도 생성. placeholder와 추론 필드는 원본 사실로 승격하지 않음 |
| `extract-sprite-table.mjs` | 유지 | EXE의 연속 `char\*.spr` 포인터 표를 독립 추출. 타입 정체는 타입 카탈로그와 교차 확인 |

## 기존 정적 probe와 구현 감사

| 파일 | 상태 | 허용 용도와 제한 |
| --- | --- | --- |
| `extract-animation-evidence.mjs`, `animation-evidence.test.mjs` | 재검증 | 작은 draw 레코드와 main entity 구조를 구분한 기존 주소 탐색점. 의미 확정에는 파일럿 추출기를 사용 |
| `extract-ui-layout-evidence.mjs`, `ui-layout-evidence.test.mjs` | 재검증 | UI 관련 코드 범위와 문자열의 탐색점. 기존 objective 의미는 내부 내용 RECT를 전체 패널로 오인하고 닫기 hit test를 놓쳤다. [목표 모달 파일럿](mechanics/objective-panel-layout.md)이 전체 경계와 호출 흐름으로 교정했다 |
| `extract-client-ui-layout-audit.mjs`, `client-ui-layout-audit.test.mjs` | 유지 | 정적 확정한 `SPEECH` 배치와 나머지 임시 웹 UI 레이아웃을 분리해 감사 |
| `extract-campaign-mvp-audit.mjs`, `campaign-mvp-audit.test.mjs` | 보관 | 구현·문자열 존재 중심의 과거 MVP 판정. 현행 원작 일치 상태에 반영하지 않음 |

고정 주소의 바이트가 남아 있는지만 검사하는 테스트는 코드 변조 탐지에는 유용하지만, 사람이 붙인
`meaning`을 검증하지 않는다. 해당 주소는 `analysis/config/seed-addresses.txt`에서 시작해 전체 포함
함수와 데이터 흐름을 다시 분석한다.

## VM·디버거 기반 도구

다음 파일은 모두 `보관`이다. [동적 검증 예외 지침](../agent-guides/dynamic-validation.md)을 만족하는
좁은 질문에 한해 다시 사용할 수 있지만, Codex가 VM에서 게임 진행을 따라가는 기본 작업에는 사용하지
않는다.

- 계획·생성기:
  `extract-campaign-runtime-trace-plan.mjs`,
  `generate-campaign-x64dbg-script.mjs`,
  `extract-ui-runtime-trace-plan.mjs`,
  `generate-ui-x64dbg-script.mjs`
- 계획·스크립트 테스트:
  `campaign-runtime-trace-plan.test.mjs`,
  `campaign-x64dbg-script.test.mjs`,
  `ui-runtime-trace-plan.test.mjs`,
  `ui-x64dbg-script.test.mjs`,
  `ui-callsite-debugger-script.test.mjs`
- 실행·제어:
  `run-campaign-headless-init-capture.ps1`,
  `run-campaign-x32dbg-target-launch.ps1`,
  `run-x32dbg-attach-to-marker.ps1`,
  `send-x32dbg-command-sequence.ps1`,
  `cleanup-codex-marker-processes.ps1`,
  `inspect-x32dbg-window-tree.ps1`,
  `trace-ui-callsite-debugger.ps1`
- 런처·smoke 자료:
  `run-campaign-headless-init-smoke.cmd`,
  `run-campaign-x32dbg-target.cmd`,
  `run-x32dbg-gui-smoke.cmd`,
  `x32dbg-gui-script-smoke.xdbg`,
  `x64dbg-headless-smoke.xdbg`,
  `x64dbg-headless-target-smoke.xdbg`,
  `campaign-x32dbg-capture-run-smoke-commands.txt`,
  `campaign-x32dbg-setup-smoke-commands.txt`,
  `x32dbg-gui-scriptexec-smoke-commands.txt`
- 상태 probe:
  `probe-k01-defeat-state.ps1`,
  `probe-k01-k0120-state.ps1`
- 실행 중 메모리·코드 patch:
  `patch-k01-defeat-alive-word.ps1`,
  `patch-k01-defeat-heroes.ps1`,
  `patch-k01-k0120-condition.ps1`,
  `patch-k01-k0120-control-flow.ps1`

특히 patch 결과는 경로 탐색의 보조 기록일 뿐 자연 조건, 전체 분기 또는 원본 메커니즘의 증거가 아니다.

## 현재 결론

- 0단계의 도구 분류는 완료했다. 기존 파일은 삭제하지 않고 역할과 증거 한계를 명시했다.
- 기본 분석 진입점은 `pnpm imjinrok:analyze-exe`다.
- 기존 주소 probe는 새 구조화 산출물의 seed로만 승계한다.
- VM·x32dbg 계열은 보관 상태이며 정적 분석이 막힌 좁은 질문에서만 예외적으로 재검토한다.
