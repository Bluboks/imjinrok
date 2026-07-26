# 분석 도구 인벤토리

기준일: 2026-07-26

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
| `extract-executable-refs.mjs`, `executable-refs.test.mjs` | 유지 | ASCII 문자열과 PE 위치를 탐색점으로 수집. 문자열 존재는 동작 증거가 아님 |
| `extract-mission-portrait-mapping.mjs`, `mission-portrait-mapping.test.mjs` | 유지 | `SPEECH` 소비자·ID 조회·`hero.spr` 프레임 표의 정적 확정 결과 추출과 회귀 검사 |
| `audit-sprite-mappings.mjs`, `sprite-mapping-audit.test.mjs` | 유지 | 확정된 초상화와 미검증 엔티티 매핑을 분리해 감사 |

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
| `extract-sprite-table.mjs` | 재검증 | EXE의 스프라이트 테이블 후보 조사 |

## 기존 정적 probe와 구현 감사

| 파일 | 상태 | 허용 용도와 제한 |
| --- | --- | --- |
| `extract-animation-evidence.mjs`, `animation-evidence.test.mjs` | 재검증 | 기존 주소와 바이트를 Ghidra seed로 옮기는 탐색점 |
| `extract-ui-layout-evidence.mjs`, `ui-layout-evidence.test.mjs` | 재검증 | UI 관련 코드 범위와 문자열의 탐색점 |
| `extract-client-ui-layout-audit.mjs`, `client-ui-layout-audit.test.mjs` | 유지 | 현재 웹 구현의 임시 좌표·레이아웃 감사. 원본 증거가 아님 |
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
