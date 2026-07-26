# 임진록 2 웹 포팅 프로젝트

Phaser와 TypeScript로 임진록 2의 싱글플레이 게임 경험을 웹 브라우저에 이식하는 프로젝트다.

현재 저장소에는 실행 가능한 RTS 프로토타입과 원본 데이터 변환 도구가 존재한다. 그러나 구현된 기능이
원작 메커니즘과 정확히 일치한다고 보장하지는 않는다. 원작 일치 여부는 원본 바이너리와 데이터의 정적
분석 결과, 그리고 그 결과로 만든 재현 테스트를 통과한 범위에만 표시한다.

## 프로젝트 원칙

- 원본 게임 바이너리와 데이터의 정확한 정적 분석을 최우선 근거로 사용한다.
- 화면이 비슷하거나 현재 구현 테스트가 통과한다는 이유만으로 원작 일치를 주장하지 않는다.
- 분석 결과는 `정적 확정`, `추정`, `미확인`, `반증됨`으로 구분한다.
- 원작 동작은 독립 테스트로 재현된 뒤에 현재 구현으로 이식한다.
- VM에서 게임을 직접 조작하는 작업은 기본 절차가 아니다. 정적으로 해소할 수 없는 좁은 질문에만
  예외적으로 사용한다.

## 현재 상태

- 브라우저 게임 클라이언트와 결정론적 시뮬레이션 프로토타입이 구현되어 있다.
- K01·K02 기반 캠페인, 스커미시, AI, 생산, 전투, 이동, UI 등 다양한 기능이 구현되어 있다.
- 위 기능 대부분은 원작 일치가 아직 검증되지 않은 프로젝트 구현이다.
- K01 봉화대 트리거와 승패 타이머에는 부분적인 원본 정적 분석 근거가 있다.
- 재현 가능한 Ghidra 기반 정적 분석 파이프라인이 구축되어 함수·호출 관계·문자열·seed 함수의
  CFG·명령어·디컴파일 결과를 생성한다.

상세 상태는 [프로젝트 상태](docs/project-status.md)와
[역공학 상태표](docs/reverse-engineering/status-matrix.md)를 확인한다.

## 문서

문서의 시작점은 [문서 안내](docs/README.md)다.

- [프로젝트 상태](docs/project-status.md)
- [정적 분석 중심 로드맵](docs/roadmap.md)
- [원본과 포팅 구현의 경계](docs/architecture/original-vs-port.md)
- [역공학 문서 안내](docs/reverse-engineering/README.md)
- [정적 분석 방법론](docs/reverse-engineering/methodology.md)
- [증거 및 상태 기준](docs/reverse-engineering/evidence-levels.md)
- [과거 문서 보관소](docs/archive/legacy-2026-07-26/README.md)

## 저장소 구조

- `apps/game-client`: Phaser 기반 브라우저 게임 클라이언트
- `apps/map-editor`: React와 Phaser 기반 맵 에디터
- `apps/server`: 향후 멀티플레이어용 서버 셸
- `packages/shared`: 공용 타입과 콘텐츠·맵·시나리오·테마 정의
- `packages/simulation`: 결정론적 RTS 시뮬레이션 코어
- `tools/imjinrok`: 원본 데이터 분석·변환 도구와 과거 동적 분석 도구
- `original`: 원본 게임 바이너리와 데이터
- `docs`: 현행 프로젝트·분석 문서

## 실행과 검증

```bash
pnpm install
pnpm dev:game
pnpm typecheck
pnpm test
pnpm build
```

전체 개발 서버는 다음 명령으로 실행한다.

```bash
pnpm dev
```

## 원본 데이터 도구

```bash
pnpm imjinrok:inventory
pnpm imjinrok:convert-sprites
pnpm imjinrok:convert-audio
pnpm imjinrok:inspect-scripts
pnpm imjinrok:inspect-maps
pnpm imjinrok:inspect-map-records
pnpm imjinrok:export-map
pnpm imjinrok:extract-terrain-mask
```

이 도구들의 출력은 원본 데이터 해석에 유용하지만, 도구가 실행된다는 사실만으로 해석의 의미나 원작
일치가 증명되지는 않는다.

## 정적 분석

```bash
pnpm imjinrok:setup-static-analysis
pnpm imjinrok:analyze-exe
pnpm imjinrok:verify-static-analysis
```

도구 버전과 배포 파일 해시는 고정되어 있으며, 분석 입력이 기준 원본 EXE의 SHA-256과 다르면 실행을
거부한다. 생성 결과와 해석 범위는 [정적 분석 산출물 안내](analysis/README.md)를 확인한다.
