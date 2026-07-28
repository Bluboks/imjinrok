# K01 원시 맵 값 투영 계약

## 질문과 범위

질문: **원본 `K01.map`에서 현재 포트의 `K01_TERRAIN_RLE`을 재현하는 정확한 원시 바이트는 무엇이며,
그 바이트에 원본 지형 이름·좌표 의미를 붙일 수 있는가?**

이 문서는 K01 증원, 초기 엔티티, 이동 가능성, 충돌 또는 스폰 의미를 복원하지 않는다. 특히 K01의
`requested-position-exact` 증원 계약에는 관여하지 않는다.

## 상태

| 구분 | 상태 | 정확한 범위 |
| --- | --- | --- |
| 분석 | `추정` | 아래의 바이트 투영이 원본 지형 필드이거나 원본 좌표계라는 증거는 없다. |
| 정적 확정 부분 | `정적 확정` | 기준 EXE가 고정 크기 `0x10bd8c`의 맵 이미지를 읽고, `+0x2da0`/`+0x2da4`를 루프 경계로 읽는다. |
| 재현 | `재현 완료` | 해시가 고정된 K01 입력에서 현재 RLE와 같은 3,600개 원시 값을, 경계·잘림·변조 거부까지 재현한다. |
| 구현 | `없음` | 이 계약은 제품 런타임을 변경하지 않는다. 기존 포트의 지형 이름과 플레이 가능성 보정은 아래처럼 별도 프로젝트 동작이다. |

따라서 이 문서는 `grass`, `water`, `forest`, `shallowWater`를 원본 K01 값의 의미로 주장하지 않는다.
원본 지형 의미와 원본 타일 좌표 순서는 다음 분석 질문으로 남는다.

## 고정 입력과 EXE 근거

| 입력 | 크기 | SHA-256 |
| --- | ---: | --- |
| `original/imjinrok2/stagemap/k01.map` | 1,097,100 | `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb` |
| `original/imjinrok2/imjinrok2.exe` | 843,833 | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |

`FUN_00462af0`의 `0x00462b11-0x00462b1f`는 `0x10bd8c` 바이트를 맵 로드 호출에 전달한다. 이 값은
K01 파일 크기와 일치한다. `FUN_004648e0`의 `0x004648eb-0x00464939`는 맵 베이스
`+0x2da4`, `+0x2da0`을 읽어 중첩 루프의 경계로 사용한다. 따라서 헤더의 `0x2da0`/`0x2da4`는
이 기준 입력에서 각각 `60`/`60`인 실행 파일 소비 필드다.

헤더의 관측값은 `themeId=0`, `view=(13,8)`, 그리고 `0x04`에서 시작하는 첫 좌표쌍 `(6,6)`이다.
마지막 항목은 현재 파서가 `spawn`으로 부르는 값이지만, 이 문서는 그 이름 또는 게임 내 의미를 확정하지
않고 원시 좌표쌍으로만 취급한다.

## 현재 RLE를 만드는 정확한 원시 투영

기존 `map-codec.mjs`의 레거시 record-region 기준은 파일 오프셋 `0x0000bd8c`부터이며, 이 계약은
그 기준을 주소 분해에만 사용한다. 논리 좌표 `(x,y)`의 원시 값은 다음이다.

```text
조건: 0 <= x < 60, 0 <= y < 60
logicalIndex = y * 60 + x
relativeOffset = 0x0e050c + y * 180 + x
absoluteOffset = 0x0000bd8c + relativeOffset
rawValue = K01.map[absoluteOffset]
```

출력 순서는 `y=0..59`의 각 행 안에서 `x=0..59`인 row-major다. 시작 절대 오프셋은 `0x000ec298`,
마지막 바이트는 `0x000eec4f`, 읽는 구간의 끝(배타)은 `0x000eec50`이다. 이 투영은 1바이트 값
3,600개를 읽는다.

레거시 `256 × 256 × 16` 바이트 record-grid로 **산술 분해하면**, 시작점은 record `(80,224)`의
byte `12`다. 한 논리 행의 stride는 180바이트라서 다음 행은 11 records와 4 bytes를 더 이동한다.
즉 이 결과는 한 논리 타일당 한 record field를 읽지 않고 record 경계를 지속적으로 가로지른다.
그 사실 때문에 이 투영을 원본의 타일 record 또는 원본 지형 필드라고 해석할 수 없다.

대표 벡터는 다음과 같다. `record`는 위 레거시 격자의 주소 분해일 뿐 원본 타일 좌표가 아니다.

| 논리 `(x,y)` | raw | 절대 오프셋 | record / byte |
| --- | ---: | --- | --- |
| `(0,0)` | 0 | `0x000ec298` | `(80,224)` / 12 |
| `(59,0)` | 0 | `0x000ec2d3` | `(84,224)` / 7 |
| `(0,1)` | 1 | `0x000ec34c` | `(92,224)` / 0 |
| `(45,40)` | 3 | `0x000edee5` | `(21,226)` / 9 |
| `(57,32)` | 2 | `0x000ed951` | `(188,225)` / 5 |
| `(59,59)` | 3 | `0x000eec4f` | `(236,226)` / 3 |

값 분포는 `0:60`, `1:2854`, `2:194`, `3:492`이고, 바이트 배열 SHA-256은
`0dc671d29bce196b984cec3d37d00bb15cb393e8ae44f96eb329bced53d6d488`이다. 완전한 출력 계약은
fixture의 RLE와 그 SHA-256이다. 이는 현재 포트의 `K01_TERRAIN_RLE` 문자열과 정확히 같지만,
문자열 일치는 값의 원본 지형 의미를 증명하지 않는다.

이 포트 접점도 수동 비교가 아니다. 추출기는
`packages/shared/src/imjinrokMaps.ts`의 기준 크기 `15,920`과 SHA-256
`6ea348459a0782b6359e346e0e995f59148349ce105726de08255d42ede10b0b`를 먼저 검증하고, 그
해시 고정 소스에서 이름이 정확히 `K01_TERRAIN_RLE`인 문자열 literal만 추출한다. 추출한 literal은
원시 투영 RLE와 byte-for-byte 같아야 한다. 따라서 MAP·EXE·포트 소스 중 어느 하나가 바뀌거나,
명명된 literal이 달라지면 report와 fixture test가 실패한다. 이 binding은 현재 포트 데이터와의
정확한 동일성만 고정하며, 원본 지형 의미의 증거가 아니다.

## 원시 값과 포트 지형 이름의 분리

현재 포트는 `packages/shared/src/imjinrokMaps.ts`에서 다음 프로젝트 매핑을 적용한다.

| 원시 값 | 현재 포트 이름 | 원본 증거 상태 |
| ---: | --- | --- |
| 0 | `water` | 미확인 |
| 1 | `grass` | 미확인 |
| 2 | `forest` | 미확인 |
| 3 | `shallowWater` | 미확인 |

이 이름들은 `content.ts`의 이동 차단·색상 등 프로젝트 규칙까지 동반한다. EXE의 위 맵 로드·차원
근거는 이 변환표나 해당 이동성 규칙을 뒷받침하지 않는다. `themeId=0 → normal` 역시 현행
`INFERRED_TILE_THEMES`의 추론이며 원본 타일 이름 매핑으로 승격하지 않는다.

## 확인된 프로젝트 적응과 패치

다음은 원본 데이터 사실이 아니라 현재 포트 구현을 읽어 확인한 적응이다.

- K01 메타데이터는 원시 헤더에서 읽은 `(6,6)` 외에 `(52,52)`를 두 번째 플레이어 시작점으로 추가한다.
- 지형 RLE를 적용한 뒤 `clearStarterAreas`가 각 시작점 주변 radius 10을 `grass`로 덮어쓴다.
- 이어서 `carveSpawnLanes`가 첫 시작점과 추가된 시작점 사이에 radius 2의 `grass` 통로를 만든다.
- K01에는 `missionRouteWaypoints`가 없으므로 이 K01 경로에서 `carveMissionRoute`는 작동하지 않는다.
- `export-map-definition.mjs`의 기본 지형 `grass`와 좌표 clamp도 내보내기용 scaffold 정책이며 원본
  맵 의미가 아니다.

그러므로 현재 포트에서 `(6,6)` 또는 `(52,52)`가 `grass`이고 두 시작점이 통행 가능하다는 테스트는
원본 K01의 해당 지형·시작·이동 가능성 증거가 아니다.

## 재현 도구와 실패 경로

다음 도구와 fixture가 이 문서의 완전 출력 계약이다.

```bash
node tools/imjinrok/extract-k01-map-terrain-contract.mjs
node --test tools/imjinrok/k01-map-terrain-contract.test.mjs
```

도구는 K01 MAP과 EXE의 크기와 SHA-256을 해석 전에 검증한다. 바이트 하나라도 바뀐 stale/tampered
MAP 또는 EXE는 거부한다. 포트 source hash가 달라져도 named-literal 추출 전에 거부한다. 투영에 필요한
`978000`바이트보다 짧은 Buffer와 범위 밖·비정수 좌표도 거부한다. fixture
`analysis/fixtures/k01-map-terrain-contract.json`은 세 입력 해시, 완전 RLE, 값 digest, 포트 literal
binding, 경계와 대표 record-crossing 벡터를 고정한다.

## 다음 분석 작업

1. `0x0000bd8c` 이후 레이아웃과 각 record field를 EXE의 생성·읽기·쓰기 경로에서 교차 확인한다.
2. EXE가 원본 타일의 좌표·지형·통행성을 선택하는 전체 제어 흐름을 찾아, 이 바이트 stream과 독립적으로
   원본 field와 값 의미를 검증한다.
3. 그 뒤에만 원시 값→포트 terrain 변환과 K01의 플레이 가능성 적응을 원본 기반 이식 후보로 비교한다.
