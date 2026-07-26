# Archived project README

> 2026-07-26 이전 프로젝트 상태를 기록한 보관 문서다. 현행 프로젝트 설명과 작업 절차로 사용하지 않는다.

# isorts

Phaser `3.90.0` + TypeScript 기반의 웹 브라우저용 2D isometric RTS 포팅 작업물입니다.

현재 우선 목표는 원본 임진록 2 바이너리/데이터를 참고해, 멀티플레이어 없이도 브라우저에서 실행 가능한 싱글플레이 게임 루프를 만드는 것입니다. 멀티플레이어 서버와 맵 에디터는 확장 지점으로 남아 있지만, 당장 플레이 대상은 게임 클라이언트입니다.

## 현재 플레이 가능 범위

- 캠페인 미션: K01, K02 기반 싱글플레이 미션, 브리핑, 목표, 대사, 승패 결과 화면
- 임의게임: seed 기반 랜덤 스커미시 맵 생성
- 컴퓨터대전: 1v1 및 4인 CPU 스커미시, 난이도 선택
- RTS 기본 시스템: 선택/드래그 선택, 이동, 공격 이동, 순찰, 정지, 홀드, 건설, 수리, 자원 채집, 생산 큐, 연구, 집결지, 인구 제한
- 전장 시스템: Fog of War, 미니맵, 체력/피격 피드백, 전투 이벤트, 빠른 저장/불러오기, 일시정지/속도 조절
- 원본 데이터 활용: 원본 맵 메타데이터, terrain mask, 변환된 스프라이트 테마, 스크립트/맵/애셋 분석 도구

## 폴더 구조

- `apps/game-client`: Phaser 기반 브라우저 게임 클라이언트
- `apps/map-editor`: React + Phaser 기반 맵 에디터 셸
- `apps/server`: 추후 멀티플레이어용 Fastify + Socket.IO 서버 셸
- `packages/shared`: 공용 타입, 콘텐츠 정의, 맵/시나리오/테마 정의
- `packages/simulation`: 결정론적 RTS 시뮬레이션 코어
- `tools/imjinrok`: 원본 임진록 2 데이터 분석/변환 도구
- `original`: 원본 게임 데이터 보관 위치
- `spriteparser`: 원본 파일 구조 파악용 참고 도구

## 실행

의존성 설치:

```bash
pnpm install
```

게임 클라이언트만 실행:

```bash
pnpm dev:game
```

전체 개발 서버 실행:

```bash
pnpm dev
```

프로덕션 빌드:

```bash
pnpm build
```

검증:

```bash
pnpm typecheck
pnpm test
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

`imjinrok:inspect-maps -- --json --file ...`는 원본 `.map` 앞부분의 0x320개 entity 슬롯도 함께 출력한다. 이 슬롯은
exe가 type/x/y/owner 배열로 읽어 미션 시작 유닛을 생성하는 근거로 사용한다.

`imjinrok:inspect-map-records`는 K01/K02 parity 조사용으로 특정 좌표/영역을 좁혀 볼 수 있다.

```bash
pnpm imjinrok:inspect-map-records -- --file original/imjinrok2/stagemap/k02.map --point 6,71 --bbox 0,65..6,77
pnpm imjinrok:inspect-map-records -- --file original/imjinrok2/stagemap/k02.map --bbox 28,70..41,73 --signature 0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f
```

## 아직 남은 큰 작업

- 원본 메커니즘과 수치의 추가 대조
- 더 많은 원본 미션/맵/트리거 이식
- 스프라이트 애니메이션/방향/프레임 매핑 정밀화
- 사운드, 음성, UI 애셋 적용
- 맵 에디터 고도화
- 추후 멀티플레이어 lockstep/server authoritative 구조 구현
