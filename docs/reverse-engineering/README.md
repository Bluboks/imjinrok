# 역공학 문서 안내

이 디렉터리는 원본 임진록 2 바이너리와 데이터에서 복원한 사실의 단일 출처다.

## 읽는 순서

1. [정적 분석 방법론](methodology.md)
2. [증거 및 상태 기준](evidence-levels.md)
3. [원본 바이너리 기준 정보](binary-manifest.md)
4. [분석 도구 인벤토리](tool-inventory.md)
5. [분석 상태표](status-matrix.md)
6. [함수 지도](function-map.md)
7. [원본 엔티티 타입 카탈로그](data-structures/entity-type-catalog.md)
8. [원본 엔티티 전수 시각 프로필](mechanics/original-entity-visual-profiles.md)
9. [스프라이트 매핑 감사](sprite-mapping-audit.md)
10. [브리핑 `SPEECH` 초상화 매핑](mechanics/briefing-portraits.md)
11. [`SPEECH` 대화 레이아웃](mechanics/speech-layout.md)
12. [조선 창병·내부 클래스 2 애니메이션 파일럿](mechanics/unit-animation-pilot.md)
13. [K01 권율·유성룡 핵심 애니메이션 파일럿](mechanics/k01-hero-animation-pilot.md)
14. [K01 권율·유성룡 일반 공격 phase 파일럿](mechanics/k01-hero-basic-attack-pilot.md)
15. [K01 권율·유성룡 nearby aura 조사](mechanics/k01-hero-aura.md)
16. [조선 본영 건설·체력 프레임 파일럿](mechanics/building-state-pilot.md)
17. [조선 봉화대 건설·체력 프레임 파일럿](mechanics/beacon-state-pilot.md)
18. [K01 팬 리마스터 MVP 정적 분석 계획](mechanics/campaign/k01.md)
19. [원본 command control의 `button.spr` pixel-frame 결합](mechanics/command-icon-frame-binding.md)
20. [K01 mission unit animation coverage guard](mechanics/k01-unit-animation-coverage.md)
21. [K01 단일 선택 `portrait.spr` 결합](mechanics/k01-selection-portraits.md)
22. [K01 원본 맵 데이터 추출 프로토콜 v1](mechanics/k01-map-data-extraction-protocol.md)
23. 분석할 나머지 자료구조와 메커니즘 문서

## 문서 역할

- `methodology.md`: 분석 질문부터 재현 테스트까지의 절차
- `evidence-levels.md`: 주장과 구현 상태에 사용하는 공통 용어
- `binary-manifest.md`: 분석 입력 파일의 해시와 PE 정보
- `tool-inventory.md`: 기존 도구의 유지·재검증·보관 분류
- `status-matrix.md`: 영역별 분석·재현·이식 상태
- `function-map.md`: 함수와 주요 코드 지점의 주소·역할·신뢰도
- `data-structures/entity-type-catalog.md`: 내부 클래스 1~95의 원본 이름과 SPR 자원 연결
- `mechanics/original-entity-visual-profiles.md`: 전수 pivot·building selector·생성 산출물과 상태 한계
- `mechanics/k01-map-data-extraction-protocol.md`: hash-bound MAP/EXE 채널 추출과 native/product coverage 경계
- `sprite-mapping-audit.md`: 유닛·건물 매핑의 미검증 가정과 초상화 복원 결과
- `data-structures/`: 구조체와 전역 상태
- `mechanics/`: 캠페인·전투·이동·AI·애니메이션·UI 동작

## 분석 산출물 원칙

분석 결과는 다음 흐름을 유지해야 한다.

```text
원본 파일 해시
  -> 함수·데이터 주소
  -> 전체 제어 흐름과 자료구조
  -> 수식·상태 전이
  -> 독립 테스트 벡터
  -> 포팅 구현
```

문서에 주소만 있거나 바이트가 존재하는 것만으로는 의미가 확정되지 않는다.

## 구축된 기반

다음 기반은 2026-07-26에 실제 원본 EXE로 생성하고 같은 입력의 2회 실행 해시가 일치하는지 확인했다.

- SHA-256으로 배포본을 고정한 Ghidra 12.1.2와 Temurin JDK 21.0.12+8 설치
- 원본 EXE 해시를 강제하는 headless import와 분석
- 함수·호출 관계·문자열·일반 메모리 참조·간접 분기·점프 테이블·seed CFG·명령어·디컴파일
  결과의 JSON 내보내기
- 생성 산출물 스키마와 해시 검증

생성 방법과 산출물은 [분석 산출물 안내](../../analysis/README.md)를 따른다.

## 아직 구축되지 않은 기반

- 원본 함수 격리 실행 또는 에뮬레이션 하네스
- 일반 메모리 참조에서 구조체 필드와 동적 인덱스 참조를 승격하는 수동 검토 기록

기존 주소의 역할은 위 기반의 존재만으로 확정되지 않으며 여전히 분석 시작점으로만 사용한다.

## 과거 기록

2026-07-26 이전의 VM 중심 분석 기록은
[보관소](../archive/legacy-2026-07-26/README.md)에 있다. 그 문서는 탐색 단서와 역사적 맥락으로만 사용한다.
