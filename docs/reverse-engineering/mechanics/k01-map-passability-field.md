# K01 원본 셀 통과성 게이트 필드

## 질문과 범위

질문: **원본 `K01.map`에서 EXE가 실제 셀 좌표로 읽어 통과성 관련 판정에 쓰는 필드는 무엇이며,
그 주소식·폭·분기 값은 무엇인가?**

이 문서는 K01의 초기 배치, 증원, spawn, 이동 경로 선택, 최종 목적지 도달 또는 타일 그림을 복원하지
않는다. 특히 `requested-position-exact` 증원 계약, starter-area/spawn-lane 보정과 두 번째 시작점은 이
분석의 입력·출력·수정 범위 밖이다.

## 상태

| 구분 | 상태 | 정확한 범위 |
| --- | --- | --- |
| 분석 | `정적 확정` | 아래 고정 EXE의 맵 로드→초기화→`FUN_00465960` 소비자 경로에서 `field_0x000cc90c`의 주소식·`uint8` 폭·0/3/기타 nonzero 분기를 확인했다. |
| 재현 | `재현 완료` | 해시 고정 K01 입력의 완전 3,600셀 값·보조 필드·좌표 경계·변조 거부·분기 경계 벡터를 독립 추출기와 fixture로 재현한다. |
| 구현 | `없음` | 제품 런타임과 기존 지형 RLE·초기 배치·spawn 보정은 변경하지 않는다. |

이 상태는 **한 원본 통과성 관련 게이트**에만 적용한다. 이 문서는 원본의 최종 이동 가능성, 원본
지형 이름, 타일 렌더링 필드나 원작 일치를 주장하지 않는다.

## 고정 입력과 주소

| 입력 | 크기 | SHA-256 |
| --- | ---: | --- |
| `original/imjinrok2/stagemap/k01.map` | 1,097,100 | `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb` |
| `original/imjinrok2/imjinrok2.exe` | 843,833 | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |

K01 헤더의 EXE 소비 차원은 `map+0x2da0=60`, `map+0x2da4=60`이다. 아래 모든 좌표는 이 범위의
`0 <= x < 60`, `0 <= y < 60`만 다룬다.

| 항목 | 주소/범위 | 확인한 역할 |
| --- | --- | --- |
| 맵 전송 호출 | `0x00462b11-0x00462b1f` | `FUN_00462af0`이 map destination, count `0x10bd8c`, size `1`, opened stream을 `FUN_004adf44`에 전달한다. |
| 초기화 소비자 | `FUN_004648e0`, `0x00464b83-0x00464c15` | `field_0x000cc90c`을 전수 순회해 값 3 분기와 별도 derived flag grid 갱신을 수행한다. |
| 게이트 소비자 | `FUN_00465960`, `0x00465960-0x00465a12` | 좌표를 검사한 뒤 같은 `field_0x000cc90c`과 보조 `field_0x000dc62c`을 읽어 이후 검사 전의 continue/reject를 결정한다. |
| 직접 호출자 | `FUN_00465d50`, `FUN_0046e450` | 각각 셀 영역/국소 영역을 순회하며 `FUN_00465960` 반환값이 false이면 즉시 false를 반환한다. 사람용 함수명은 미확정이다. |

`FUN_004adf44`의 내부 전송 구현에 별도의 디코더라는 역할 이름을 붙이지 않았다. 이 문서가 확정하는
것은 `FUN_00462af0`의 성공 경로가 stream, element size `1`, element count `0x10bd8c`, destination을
순서대로 push한 뒤 `FUN_004adf44`를 호출하고 stream을 닫으며, 뒤의 초기화·predicate가 그 destination
base의 상대 오프셋을 읽는다는 좁은 데이터 흐름이다.

## 구조화 정적 근거 고정

추출기는 EXE 해시만 확인한 뒤 사람이 적은 주소를 믿지 않는다. 아래의 커밋된 Ghidra 산출물도 파일 전체
SHA-256과 `sourceSha256`을 검사하며, 둘 다 위 EXE SHA-256과 같지 않으면 거부한다.

| 산출물 | 파일 SHA-256 | `sourceSha256` |
| --- | --- | --- |
| `analysis/generated/imjinrok2/functions.json` | `c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `analysis/generated/imjinrok2/references.json` | `df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |

다음 여섯 함수는 `functions.json`의 entry/body range/body size/instruction SHA-256/caller 또는 callee
set을 정확히 비교하고, EXE에서 같은 body range의 raw SHA-256도 다시 계산한다. 따라서 같은 EXE 안에서
짧은 anchor만 우연히 남아 함수 경계나 CFG 범위가 바뀌는 경우를 허용하지 않는다.

| 함수 | 전체 body 범위 | raw body SHA-256 |
| --- | --- | --- |
| `FUN_00462af0` | `0x00462af0-0x00462b7b` | `c462e822540d7bede0c75eeeab2661001164209cd831f639c99e1ab8401fe6e0` |
| `FUN_004adf44` | `0x004adf44-0x004ae02b` | `98a6266b6c4f467c2e79fb664e8ca3e539073f51231e4aa1ea37f87499279591` |
| `FUN_004648e0` | `0x004648e0-0x00464cb2` | `e8bba48e9c6925826914eab6f55a038ee275500831e70ec496b1bcc7dfd63112` |
| `FUN_00465960` | `0x00465960-0x00465a12` | `2b1f10655b34fce18f72a990661788d7298f0dc6e8c1ef9f99feb4e23e9a45d0` |
| `FUN_00465d50` | `0x00465d50-0x00465dde` | `11ff70b95110d01f0c2b5f6682918f0698edeb0629289afaf0811f028a16a67e` |
| `FUN_0046e450` | `0x0046e450-0x0046e49d` | `cdc40bba56aabb8a66b40ea69c14ecb8fd6fd55ba568b945344dbe2a13b36ad0` |

`references.json`에서는 다음 `UNCONDITIONAL_CALL` edge가 각각 정확히 하나여야 한다. 이 조건과
`FUN_00465960`의 정확한 caller set `{FUN_00465d50, FUN_0046e450}`를 함께 확인하므로, 두 “direct caller”
주장은 함수명 문자열이나 부분 바이트가 아니라 source-bound call graph에 묶인다.

| callsite | caller | callee |
| --- | --- | --- |
| `0x00462b1a` | `FUN_00462af0` | `FUN_004adf44` |
| `0x00465da2` | `FUN_00465d50` | `FUN_00465960` |
| `0x0046e472` | `FUN_0046e450` | `FUN_00465960` |

## 확정한 필드와 주소식

`field_0x000cc90c`은 원본 K01에서 위 게이트가 직접 읽는 실제 셀 필드다.

```text
width  = DWORD map[0x2da0] = 60
height = DWORD map[0x2da4] = 60

field_0x000cc90c(x, y):
  offset = 0x000cc90c + x * 180 + y
  width = 1 byte
  load  = unsigned (MOV byte / zero-extension in consumer path)
  storage order = column-major with a fixed padded x stride of 180 bytes
```

유효 K01 부분의 첫 바이트는 `(0,0)`의 `0x000cc90c`, 마지막 바이트는 `(59,59)`의
`0x000cf2c3`, 읽는 범위 끝은 `0x000cf2c4`다. 논리 출력 fixture는 비교하기 쉽게 `y` 바깥,
`x` 안의 순서로 3,600개 값을 나열하지만, 그것은 저장 주소식의 순서를 바꾸지 않는다.

`0x00464b83`은 source pointer를 `map+0x000cc90c`로 잡는다. 같은 바깥 `y` 안에서
`0x00464bde-0x00464be4`가 source pointer에 `0xb4`(180)를 더하므로 안쪽 인덱스는 `x`다.
다음 바깥 반복에서 `0x00464c00-0x00464c04`가 source pointer를 1 증가시키므로 바깥 인덱스는
`y`다. `FUN_00465960`의 `0x004659a2-0x004659b5`도 독립적으로
`36 * 0x5aeb = 0x000cc90c`, `36 * 5 = 180` 산술을 만들어 같은 식으로 `uint8`을 읽는다.

보조 `field_0x000dc62c`도 같은 폭·식으로 읽힌다.

```text
field_0x000dc62c(x, y) = map[0x000dc62c + x * 180 + y]
```

보조 필드는 게이트의 값 3 분기에만 확인했으며 사람용 의미는 미확정이다.

## 전체 확인 경로와 분기

### 로드 후 초기화

`FUN_004648e0`은 `y=0..height-1`, 그 안에서 `x=0..width-1`을 순회한다. 해당 셀의 source
byte가 정확히 3일 때만 아래 경로로 들어간다.

```text
if field_0x000cc90c(x, y) == 3:
    if WORD[0x00c06e34] != 0:
        derivedFlags_0x000227f4(x, y) |= 0x40
    else if FUN_00462720(map, x, y) != 0:
        derivedFlags_0x000227f4(x, y) |= 0x40
    else:
        FUN_00462300(map, x, y, 0)
```

그 외 source 값에는 이 특정 3-분기에서 derived flag를 직접 쓰지 않는다. `FUN_00462720`,
`FUN_00462300`, `derivedFlags_0x000227f4`의 사람용 의미는 이 문서에서 확정하지 않는다.

### 원본 게이트 predicate

`FUN_00465960`은 먼저 입력 `(x,y)`가 header width/height 안인지 확인하고, occupancy 관련
`map+0x2db4` 조건을 확인한다. 그 뒤 source field에 대해 다음을 실행한다.

```text
primary = field_0x000cc90c(x, y)       // uint8

if primary == 3:
    if field_0x000dc62c(x, y) != 0:
        return false
else if primary != 0:
    return false

// field_0x00032514 low nibble, derived flags_0x000227f4 등
// 독립 조건을 계속 검사한다.
```

따라서 source field만 놓고 확정 가능한 제어 범주는 다음과 같다.

| primary 값 | 보조 값 | 이 지점 결과 | 최종 이동 가능성 주장 |
| ---: | ---: | --- | --- |
| `0` | 아무 값 | 이후 검사 계속 | 불가 |
| `3` | `0` | 이후 검사 계속 | 불가 |
| `3` | nonzero | 이후 검사 전에 false | 불가 |
| 그 외 nonzero | 아무 값 | 이후 검사 전에 false | 불가 |

`FUN_00465d50`은 지정된 직사각형의 각 셀에서 이 predicate가 모두 true인지 검사한다. `FUN_0046e450`은
중심 주변 `-4..4`의 9×9 셀에 같은 predicate를 호출한다. 이것은 이 source field가 map
eligibility/passability 계열 판정에 직접 연결됨을 보이지만, 이후 occupancy·flag·별도 field 조건이 남으므로
`true`를 “최종 통과 가능”이라고 바꾸어 말할 수 없다.

## K01 값과 재현 벡터

K01의 primary 3,600값 SHA-256은
`d78d6da683882d1b8b1458892fa35832584021d9454013ae287aeadf61b9af42`다.

| 값 | 개수 |
| ---: | ---: |
| 0 | 3,203 |
| 1 | 103 |
| 2 | 77 |
| 3 | 206 |
| 7 | 1 |
| 9 | 1 |
| 11 | 3 |
| 14 | 6 |

| `(x,y)` | primary / offset | auxiliary / offset | source-gate 결과 |
| --- | --- | --- | --- |
| `(0,0)` | 3 / `0x000cc90c` | 200 / `0x000dc62c` | reject |
| `(0,7)` | 0 / `0x000cc913` | 0 / `0x000dc633` | continue |
| `(14,4)` | 1 / `0x000cd2e8` | 100 / `0x000dd008` | reject |
| `(0,41)` | 2 / `0x000cc935` | 60 / `0x000dc655` | reject |
| `(8,15)` | 7 / `0x000ccebb` | 1 / `0x000dcbdb` | reject |
| `(59,59)` | 0 / `0x000cf2c3` | 0 / `0x000defe3` | continue |

여기서 `continue`은 위 표의 source gate만 통과했다는 뜻이다. 별도 runtime condition을 생략한
“passable” fixture가 아니다.

## 기존 RLE 휴리스틱과의 경계

기존 원시 투영은 다음 식이었다.

```text
heuristic(x, y) = map[0x000ec298 + y * 180 + x]
```

이는 확정 field와 base와 축이 모두 다르다.

```text
actual gate(x, y) = map[0x000cc90c + x * 180 + y]
```

또한 `0x00464c72-0x00464ca4`는 `map+0x000ec34c+x*180+y` 배열을 0으로 초기화한다. `0x000ec298`은
그 배열 시작보다 180바이트 앞이며, 휴리스틱은 field boundary를 따라가지 않고 반대 축으로 걷는다.
그러므로 현재 RLE가 재현 가능하다는 사실은 원본 셀 field, 원본 렌더링 값, 지형 이름 또는 통과성을
증명하지 않는다.

## 미확정 항목

- primary 값 `0`, `1`, `2`, `3`, `7`, `9`, `11`, `14`의 원본 사람용 지형·오브젝트 이름
- `field_0x000dc62c`과 이후 검사하는 `field_0x00032514`, derived flag의 의미 및 생성 전체 경로
- 원본 타일 그림/팔레트/프레임을 선택하는 raw rendering field와 좌표식
- 이 gate 뒤 occupancy·flag·별도 조건까지 포함한 최종 이동 가능성 및 경로 탐색 반환 규칙
- 현행 포트의 `water`, `grass`, `forest`, `shallowWater` 매핑과 K01 starter-area/spawn-lane 보정의
  원본 대응 여부

## 재현 도구와 실패 경로

```bash
node tools/imjinrok/extract-k01-map-passability-field.mjs
node --test tools/imjinrok/k01-map-passability-field.test.mjs
```

추출기는 MAP·EXE 크기와 SHA-256을 해석 전에 검증하고, EXE의 모든 위 byte evidence, functions/references
산출물의 전체 SHA-256·source SHA·함수 body·caller/callee set·필수 call edge가 맞는지 확인한다.
stale/tampered MAP·EXE·정적 산출물은 모두 거부한다. `field_0x000cc90c`의 필요 끝 `848580`보다 작은
Buffer, 범위 밖 좌표, 비정수 좌표, `uint8` 밖의 분기 벡터도 거부한다.

`analysis/fixtures/k01-map-passability-field.json`은 입력 해시, 정확한 field formula, 전체 값 digest와
분포, 대표 좌표, branch boundary, 그리고 고정 EXE의 byte evidence를 함께 고정한다.

## 다음 분석 작업

1. `field_0x00032514`, derived flag grid와 occupancy field의 생성·소비자 전체 경로를 닫아
   `FUN_00465960` 이후의 최종 반환 조건을 분리한다.
2. 렌더러의 raw field→타일 리소스/프레임 선택 CFG를 독립적으로 추적한다. 이 passability gate를
   rendering field로 재사용해 추측하지 않는다.
3. 위 두 항목이 정적 확정·재현 완료된 뒤에만 포트 지형 이름·이동 규칙과 별도 bridge/cross-test를
   논의한다. 초기 배치·증원·spawn 보정 계약은 그 bridge에서도 별도 범위로 유지한다.
