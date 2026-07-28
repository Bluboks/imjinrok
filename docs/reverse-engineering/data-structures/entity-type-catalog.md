# 원본 엔티티 타입 카탈로그

기준일: 2026-07-28

## 판정

원본 내부 클래스 `1`부터 `95`까지의 타입 정의를 전수 추출했다. 각 클래스의 원본 CP949 명칭,
스프라이트 슬롯, 기본 프레임, raw flags와 `SPR` 경로를 하나의 정적 데이터 흐름으로 연결했으며
95개 타입 모두를 `정적 확정`했다.

이 판정은 타입 정체와 자원 출처에만 적용한다. raw flags의 개별 비트 의미, 행동 상태, 방향,
공격·생산 수치와 프레임 의미를 카탈로그만으로 확정하지 않는다.

기계 생성 결과는
[`analysis/generated/entity-type-catalog.json`](../../../analysis/generated/entity-type-catalog.json)에
있다.

## 원본과 구조

| 파일 | SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |

| 주소 | 확인한 동작 |
| ---: | --- |
| `0x0045bd00` | 타입 레코드 writer. 슬롯 `+0x04`, 기본 프레임 `+0x06`, flags `+0x4c`, 이름 포인터 `+0x6c` 기록 |
| `0x0045bf50` | 95개 타입 레코드의 인수를 구성해 writer 호출 |
| `0x00882e10` | 타입 정의 표 base |
| `0x014c` | 타입 정의 레코드 stride |
| `0x0048ea90` | 원본 CP949 문자열을 런타임 이름 저장소로 복사 |
| `0x00aa4018` | 런타임 이름 저장소 base |
| `0x00443360` | 슬롯별 자원 경로를 읽는 스프라이트 로더 |
| `0x004bc094` | 런타임 슬롯 인덱스 기준 자원 포인터 표 |

타입 레코드 주소는 다음 식으로 검증한다.

```text
typeRecordAddress = 0x00882e10 + internalClass * 0x014c
```

`extract-entity-type-catalog.mjs`는 Ghidra가 내보낸 두 초기화 함수의 명령어를 사용해 각 writer 호출의
51개 인수와 상수 레지스터를 복원한다. 이름 포인터는 `FUN_0048ea90`의 원본 문자열→런타임 저장소
복사 경로와 연결하고, 스프라이트 슬롯은 원본 PE의 자원 포인터 표를 직접 읽어 경로까지 연결한다.
EXE와 Ghidra 산출물의 입력 SHA-256이 다르면 추출을 거부한다.

## 전체 결과 요약

- 내부 클래스: `1..95`, 누락·중복 없음
- 고유 원본 명칭: 95개
- 고유 스프라이트 경로: 93개
- 기본 프레임 0: 58개
- 기본 프레임 7: 35개
- 다른 기본 프레임: 클래스 23의 80, 클래스 75의 14
- 공유 경로:
  - `farmerk.spr`: 클래스 7 `조선 농부`, 클래스 93 `솜씨 좋은 도공`
  - `generalk51.spr`: 클래스 80 `조선 곽재우`, 클래스 81 `조선 곽재우분신`

따라서 자원 경로 하나만으로 프로젝트 엔티티를 원본 타입 하나에 연결할 수 없는 경우가 실제로 존재한다.
이 경우 이름을 임의로 선택하지 않고 `ambiguous`로 유지한다.

## 현행 21개 비주얼 대조

| 프로젝트 비주얼 | 원본 SPR | 클래스 | 정적으로 확인된 정체 | 현재 판정 |
| --- | --- | ---: | --- | --- |
| `korean-swordsman` | `swordk.spr` | 2 | 조선 창병 | 정체·일반 이동 매핑 확정, idle·전투 미확정 |
| `japanese-swordsman` | `swordj.spr` | 3 | 일본 창병 | 정체 확정, 프레임 의미 미확정 |
| `korean-archer` | `archerk.spr` | 4 | 조선 궁수 | 정체 확정, 프레임 의미 미확정 |
| `japanese-gunner` | `gunj1.spr` | 12 | 일본 조총병 | 정체 확정, 프레임 의미 미확정 |
| `japanese-samurai` | `horseswordj1.spr`·`horseswordj2.spr` | 13 | 일본 사무라이 | 정체·상태 8/1/4/7 frame·8방향·mirror 확정 |
| `japanese-turtle-tank` | `ghosttankj.spr` | 14 | 일본 귀갑차 | 정체·source와 상태 8/1/4 grid frame·mirror 확정; opaque 방향·death/destruction·timing 미확정 |
| `japanese-konishi` | `generalj11.spr` | 82 | 일본 고니시 | 정체·source 확정, base-frame still 외 프레임 의미 미확정 |
| `korean-general-k4` | `generalk4.spr` | 79 | 조선 사명대사 | 정체 확정, 현행 K01 영웅 바인딩 없음 |
| `korean-gwon-yul` | `generalk11.spr` | 76 | 조선 권율 | 정체·상태 8/1/4/7 대기·이동·공격·사망 확정 |
| `korean-ryu-seong-ryong` | `generalk31.spr` | 78 | 조선 유성룡 | 정체·상태 8/1/4/7 대기·이동·공격·사망 확정 |
| `korean-royal-cart` | `koreanking.spr` | 92 | 조선 선조의 어가 | 정체 확정, 프레임 의미 미확정 |
| `villager-korean-farmer` | `farmerk.spr` | 7·93 | 조선 농부·솜씨 좋은 도공 | 자원만으로는 모호 |
| `korean-hq` | `hqk.spr` | 49 | 조선 본영 | 본체 상태까지 범위 확정 |
| `korean-mill-house-proxy` | `millk.spr` | 48 | 조선 방앗간 | 정체 확정, 본체 상태 미확정 |
| `korean-barracks` | `barrackk.spr` | 50 | 조선 훈련소 | 정체 확정, 본체·오버레이 미확정 |
| `korean-signal-beacon` | `firehousek.spr` | 52 | 조선 봉화대 | 본체 상태까지 범위 확정 |
| `japanese-camp-house` | `millj.spr` | 57 | 일본 시장 | 정체 확정, 본체·오버레이 미확정 |
| `japanese-camp-barracks` | `barrackj.spr` | 60 | 일본 훈련소 | 정체 확정, 본체·오버레이 미확정 |
| `japanese-camp-firehouse` | `firehousej.spr` | 62 | 일본 관측소 | 정체 확정, 본체·오버레이 미확정 |
| `japanese-camp-tower` | `towerj.spr` | 63 | 일본 망루 | 정체 확정, 본체 상태 미확정 |
| `japanese-camp-advanced-tower` | `advtowerj.spr` | - | 95개 타입 정의에 사용되지 않음 | 원본 타입 바인딩 미확정 |

고유하게 연결된 원본 정체는 프로젝트 표시 이름에 반영했다. 안정 ID는 저장 데이터와 명령 호환을 위해
유지한다.

## 확인된 프로젝트 수정과 남은 충돌

- `beacon`은 과거 `towerk.spr`를 사용했지만 그 자원은 클래스 42 `조선 화포망루`다. 실제 클래스
  52 `조선 봉화대`의 `firehousek.spr`로 교체하고 본체 상태를 별도 검증했다.
- `gwon-yul`과 `ryu-seong-ryong`이 클래스 79 `조선 사명대사`의 `generalk4.spr`를 공유하던
  충돌을 제거했다.
- 원본 권율은 클래스 76 `generalk11.spr`, 유성룡은 클래스 78 `generalk31.spr`다. 주 자원
  정체뿐 아니라 보조 슬롯 `generalk12`·`generalk13`·`generalk32`와 대기·이동·공격·사망
  프레임을 [K01 영웅 파일럿](../mechanics/k01-hero-animation-pilot.md)에서 정적 확정했다.
  두 영웅의 효과 phase 7과 공격 payload·회복은
  [일반 공격 파일럿](../mechanics/k01-hero-basic-attack-pilot.md)에서 별도 확정했다.
  [사망 수명주기](../mechanics/k01-hero-death-lifecycle.md)는 생성 기본값과 현재 raw flags에
  따른 행동 6/7·조건부 slot 해제를 원본 accepted update 단위로 확정했다. runtime writer의
  K01 도달 여부, 초 단위 재생 속도와 프로젝트 수명 이식은
  여전히 미확정이다.
- 클래스 13 일본 사무라이는 primary slot 117 `horseswordj1.spr`와 secondary slot 118
  `horseswordj2.spr`를 사용한다. 상태 8/1/4/7의 frame·방향·mirror는
  [K01 일본 사무라이 파일럿](../mechanics/k01-samurai-animation-pilot.md)에 기록했다.

## 재생성과 검증

```bash
pnpm imjinrok:extract-entity-type-catalog
pnpm imjinrok:audit-sprite-mappings
node --test tools/imjinrok/entity-type-catalog.test.mjs
```

테스트는 95개 클래스의 연속성, 대표 유닛·건물·영웅 정체, 공유 자원 경로, 코드 anchor, 입력 해시
불일치 실패와 생성 결과의 결정론을 검사한다.
