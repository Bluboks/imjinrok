# 정적 역공학 에이전트 지침

원본 바이너리나 데이터의 동작을 분석할 때 적용한다.

## 시작 전

- `docs/reverse-engineering/methodology.md`를 읽는다.
- `docs/reverse-engineering/evidence-levels.md`를 읽는다.
- `docs/reverse-engineering/binary-manifest.md`의 해시를 확인한다.
- `docs/reverse-engineering/status-matrix.md`에서 현재 상태를 확인한다.

## 작업 규칙

- 질문을 좁게 정의한 뒤 관련 함수의 전체 제어 흐름을 분석한다.
- 문자열, 주소, 바이트 일치는 진입점으로만 취급한다.
- 함수 경계, 점프 테이블, 간접 호출과 실패 경로를 생략하지 않는다.
- 구조체 필드는 생성·읽기·쓰기 경로에서 교차 확인한다.
- 확정되지 않은 이름에는 후보임을 표시한다.
- 현재 포팅 구현을 원본 의미 추론의 근거로 사용하지 않는다.
- 시각 비교는 이상 탐지에만 사용한다.
- 분석 결과를 구현하기 전에 독립 테스트 벡터를 만든다.

## 문서 갱신

- 함수 역할은 `function-map.md`에 기록한다.
- 공통 필드는 `data-structures/`에 기록한다.
- 메커니즘은 해당 `mechanics/` 문서에 기록한다.
- 상태 변경은 `status-matrix.md`에 반영한다.
- 같은 사실을 여러 문서에 복사하지 않는다.

## 보관 문서

`docs/archive/`의 문서는 과거 탐색점이다. 과거의 `verified`, `proof`, `parity` 표기를 현행 상태로
승계하지 않는다.
