# 조선 봉화대 건설·체력 프레임 파일럿

기준일: 2026-07-26

## 판정

원본 내부 클래스 `52`가 `조선 봉화대`, 슬롯 `113`, `char\firehousek.spr`에 연결됨을
`정적 확정`했다. 클래스 52가 공통 건물 본체 초기화 경로를 사용하고 damage flag `0x2`를
포함하는 것도 교차 확인했다.

이에 따라 건설 frame 0~7, 완공 정상 frame 7, 반파 frame 8과 엄격한 체력 50% 미만 분기를
`재현 완료`하고 현재 `beacon` 비주얼에 이식했다. 프레임 9~15, 피벗, 오버레이와 효과는 이
판정 범위에 포함하지 않는다.

## 원본과 정체

| 파일 | SHA-256 | 형식 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | PE32 x86 |
| `original/imjinrok2/char/firehousek.spr` | `ac6621124bbf2106a5d9309499da7701a5c4e5223692dd2f4f51e2e9c1ab97aa` | 114×108, 16프레임 |

| 항목 | 값 |
| --- | --- |
| 내부 클래스 | 52 |
| 타입 레코드 | `0x00887180` |
| 타입 writer 호출 | `0x0045e826` |
| 원본 이름 | `조선 봉화대` |
| 이름 원본 주소 | `0x004c8098` |
| 스프라이트 슬롯 | 113 |
| 스프라이트 경로 | `char\firehousek.spr` |
| 기본 프레임 | 7 |
| raw flags | `0x00310002` |
| 클래스 switch 목적지 | `0x004292ba`, 공통 건물 본체 초기화 |

과거 프로젝트의 봉화대 비주얼은 `towerk.spr`를 사용했다. 타입 카탈로그는 이 자원이 클래스 42
`조선 화포망루`임을 증명하므로 기존 연결은 원본에 의해 반증됐다.

## 본체 프레임

건설 진행도와 체력 수식은
[조선 본영 건물 상태 파일럿](building-state-pilot.md)에서 복원한 공통 건물 경로를 사용한다.
클래스 52의 기본 프레임이 7이고 damage flag가 있으므로 최종 결과는 다음과 같다.

| 상태 | `firehousek.spr` 프레임 |
| --- | ---: |
| 건설 0~9% | 0 |
| 건설 10~19% | 1 |
| 건설 20~29% | 2 |
| 건설 30~39% | 3 |
| 건설 40~49% | 4 |
| 건설 50~69% | 5 |
| 건설 70~99% | 6 |
| 완공·정상 | 7 |
| 반파 | 8 |

반파 판정은 다음과 같고 50%와 같은 값은 정상이다.

```text
effectiveHealth =
  (100 - constructionPercent) * trunc(maximumHealth / 100)
  + currentHealth

damaged =
  effectiveHealth < trunc(maximumHealth * 50 / 100)
```

## 재현과 이식

- `extract-beacon-state-pilot.mjs`가 타입 카탈로그, 클래스 switch, 공통 건물 경로와
  `firehousek.spr` 해시를 교차 검증한다.
- `beacon-state-pilot.test.mjs`가 모든 건설 구간과 체력 50% 경계를 검사한다.
- `themes.ts`의 `korean-signal-beacon`은 `firehousek.spr` 변환본, 정상 frame 7, 반파 frame 8과
  비균등 건설 임계값을 사용한다.
- `advtowerj.spr` 등 다른 건물에는 이 결과를 자동으로 복사하지 않는다.

재현:

```bash
pnpm imjinrok:extract-beacon-state-pilot
pnpm imjinrok:audit-sprite-mappings
```
