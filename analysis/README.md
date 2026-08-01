# 정적 분석 산출물

이 디렉터리는 원본 바이너리에서 재현 가능하게 생성한 구조화된 분석 산출물을 보관한다.

## 구조

- `config/seed-addresses.txt`: 초기 분석 대상 주소와 임시 라벨
- `generated/imjinrok2/manifest.json`: 입력 해시, Ghidra 버전과 프로그램 메타데이터
- `generated/imjinrok2/functions.json`: 함수 경계, 호출 관계와 명령어 바이트 해시
- `generated/imjinrok2/strings.json`: Ghidra가 정의한 문자열과 참조
- `generated/imjinrok2/references.json`: 원본 메모리 안의 일반 코드·데이터 참조와 포함 함수
- `generated/imjinrok2/jump-tables.json`: 간접 분기 후보와 디컴파일러가 복원한 점프 테이블
- `generated/imjinrok2/seeds.json`: seed 주소가 포함된 함수, CFG, 명령어와 디컴파일 결과
- `generated/imjinrok2/SHA256SUMS`: 생성 파일별 해시
- `generated/entity-type-catalog.json`: 클래스 1~95의 원본 이름·슬롯·기본 프레임·flags·SPR 경로
- `generated/sprite-mapping-audit.json`: 현행 엔티티·초상화 매핑과 원본 자원 해시의 의미 검증 상태

`generated/`는 사람이 직접 편집하지 않는다.

현재 스키마 2 기준선은 Ghidra 12.1.2가 원본 EXE에서 생성한 함수 2,449개, 문자열 1,545개,
내부 메모리 참조 57,572개, 간접 분기 후보 268개, 복원된 점프 테이블 234개와 seed 199개
(포함 함수 191개)다.
2026-07-26의 당시 기준선은 전체 분석을 연속 두 번 실행해 여섯 JSON 파일의 SHA-256이 모두 일치했다.
이 기록은 2026-07-28에 변경된 현재 seed 기준선의 두 번 실행 검증을 뜻하지 않는다.

## 생성

```bash
pnpm imjinrok:setup-static-analysis
pnpm imjinrok:analyze-exe
pnpm imjinrok:verify-static-analysis
pnpm imjinrok:extract-entity-type-catalog
pnpm imjinrok:extract-k01-class2-locomotion-cadence
pnpm imjinrok:extract-k01-source-coordinate-bridge
pnpm imjinrok:extract-k01-hero-movement-pilot
pnpm imjinrok:audit-sprite-mappings
```

Ghidra와 JDK는 저장소 안에 설치하지 않는다. 기본적으로 사용자 캐시의
`imjinrok-static-analysis` 디렉터리에 버전과 SHA-256이 고정된 배포본을 설치한다.

캐시 위치를 바꾸려면 `IMJINROK_ANALYSIS_CACHE`에 전용 디렉터리를 지정한다.

## 해석 범위

생성된 함수명과 디컴파일 결과는 Ghidra 자동 분석 결과다. 산출물에 주소가 존재한다는 사실만으로 함수의
게임 내 의미가 확정되지 않는다. 의미와 상태 승격은
`docs/reverse-engineering/methodology.md`와 `evidence-levels.md`를 따른다.
