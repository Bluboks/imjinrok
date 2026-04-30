# isorts

Phaser `3.90.0` + TypeScript 기반의 isometric 2D RTS 프로젝트 스캐폴드입니다.

목표 범위:

- AoE II 스타일의 실시간 싱글플레이/멀티플레이 RTS
- 사용자 개설 방 + 초대 기반 커스텀 매치
- 점수 기반 자동 매칭
- Warcraft 3 / StarCraft 2 계열의 맵 빌더 확장 기반
- 오디오/그래픽 에셋은 추후 사용자가 투입

## 폴더 구조

- `apps/game-client`: Phaser 기반 실제 게임 클라이언트
- `apps/map-editor`: Phaser 미리보기 + React UI 기반 맵 에디터 셸
- `apps/server`: Fastify + Socket.IO 기반 멀티플레이 서버 셸
- `packages/shared`: 공용 타입, 맵 정의, 네트워크 DTO
- `packages/simulation`: 결정론적 RTS 시뮬레이션 코어 시작점

## 바로 실행

```bash
pnpm install
pnpm dev
```

개별 실행:

```bash
pnpm dev:game
pnpm dev:editor
pnpm dev:server
```

검증:

```bash
pnpm typecheck
pnpm build
```

`pnpm-workspace.yaml`이 포함되어 있어 이후 `apps/*`, `packages/*`를 개별 패키지로 확장하기 쉽습니다.

## 현재 포함된 골격

- isometric diamond grid 렌더링
- 싱글플레이 / 커스텀 로비 / 자동매칭 시작점 메뉴
- 인메모리 로비/매치메이킹/세션 서버 셸
- JSON 내보내기 가능한 맵 에디터 셸
- 에셋 투입용 디렉터리 자리

## 다음 확장 포인트

- 자원 채집, 생산 큐, 전투, AI, 안개(Fog of War)
- 서버 authoritative lockstep / rollback / replay 전략 구체화
- DB/Redis 기반 로비, 랭크, MMR, 리플레이, 영속 저장
- 타일 팔레트 페인팅, 트리거 시스템, 스크립트 이벤트, 승리 조건 편집기
