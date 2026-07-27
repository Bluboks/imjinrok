# 문서 안내

이 디렉터리는 프로젝트 현황, 원본 분석, 구현 경계와 작업 계획의 단일 진입점이다.

## 처음 읽는 순서

1. [프로젝트 상태](project-status.md)
2. [원본과 포팅 구현의 경계](architecture/original-vs-port.md)
3. [정적 분석 중심 로드맵](roadmap.md)
4. [역공학 문서 안내](reverse-engineering/README.md)
5. [정적 분석 방법론](reverse-engineering/methodology.md)
6. [증거 및 상태 기준](reverse-engineering/evidence-levels.md)

## 문서 구역

### 프로젝트

- [프로젝트 상태](project-status.md): 구현과 원작 검증 상태의 요약
- [로드맵](roadmap.md): 정적 분석부터 이식까지의 단계와 통과 조건
- [원본과 포팅 구현의 경계](architecture/original-vs-port.md): 무엇이 원본 사실이고 무엇이 프로젝트 설계인지 구분

### 역공학

- [역공학 안내](reverse-engineering/README.md)
- [방법론](reverse-engineering/methodology.md)
- [증거 등급](reverse-engineering/evidence-levels.md)
- [원본 바이너리 기준 정보](reverse-engineering/binary-manifest.md)
- [분석 도구 인벤토리](reverse-engineering/tool-inventory.md)
- [분석 상태표](reverse-engineering/status-matrix.md)
- [함수 지도](reverse-engineering/function-map.md)
- [원본 엔티티 타입 카탈로그](reverse-engineering/data-structures/entity-type-catalog.md)
- [스프라이트 매핑 감사](reverse-engineering/sprite-mapping-audit.md)
- [브리핑 `SPEECH` 초상화 매핑](reverse-engineering/mechanics/briefing-portraits.md)
- [`SPEECH` 대화 레이아웃](reverse-engineering/mechanics/speech-layout.md)
- [조선 창병·내부 클래스 2 애니메이션 파일럿](reverse-engineering/mechanics/unit-animation-pilot.md)
- [K01 권율·유성룡 핵심 애니메이션 파일럿](reverse-engineering/mechanics/k01-hero-animation-pilot.md)
- [K01 권율·유성룡 일반 공격 phase 파일럿](reverse-engineering/mechanics/k01-hero-basic-attack-pilot.md)
- [K01 유성룡 투사체 subtype 0x0c 파일럿](reverse-engineering/mechanics/k01-ryu-projectile-pilot.md)
- [K01 투사체 풀 갱신 cadence](reverse-engineering/mechanics/k01-projectile-pool-cadence.md)
- [K01 권율·유성룡 대상 선택과 사거리](reverse-engineering/mechanics/k01-hero-targeting-range.md)
- [K01 권율·유성룡 사망·슬롯·대상 참조 수명주기](reverse-engineering/mechanics/k01-hero-death-lifecycle.md)
- [K01 봉화대 완성·K0120 native trigger](reverse-engineering/mechanics/k01-beacon-k0120-trigger.md)
- [K01 미션 결과 latch·timer·commit 수명주기](reverse-engineering/mechanics/k01-mission-result-lifecycle.md)
- [K01 결과 presentation·post-result 전환](reverse-engineering/mechanics/k01-final-result-transition.md)
- [K01 표준 미션 진입 timer reset](reverse-engineering/mechanics/k01-mission-timer-reset.md)
- [조선 본영 건설·체력 프레임 파일럿](reverse-engineering/mechanics/building-state-pilot.md)
- [조선 봉화대 건설·체력 프레임 파일럿](reverse-engineering/mechanics/beacon-state-pilot.md)
- [엔티티 자료구조](reverse-engineering/data-structures/entity-record.md)
- [K01 팬 리마스터 MVP 정적 분석 계획](reverse-engineering/mechanics/campaign/k01.md)

### 의사결정과 작업 규칙

- [정적 분석 우선 결정](decisions/0001-static-first-reverse-engineering.md)
- [문서 작성 규칙](development/documentation.md)
- [정적 분석 에이전트 지침](agent-guides/reverse-engineering.md)
- [스프라이트·애니메이션 매핑 지침](agent-guides/sprite-animation-mapping.md)
- [UI 레이아웃 매핑 지침](agent-guides/ui-layout-mapping.md)
- [동적 검증 예외 지침](agent-guides/dynamic-validation.md)

## 현재 문서와 보관 문서

현행 문서는 `docs/` 아래의 위 링크들이다. `docs/archive/` 아래의 파일은 과거 상태와 실험 과정을
보존하기 위한 자료이며, 현재 절차나 원작 일치 판정의 단일 출처가 아니다.

보관 문서의 주소와 실험 기록을 재사용할 때는 원본 실행 파일 해시를 확인하고, 현행 방법론으로 다시
분석한 뒤 새 문서에 출처를 기록한다.
