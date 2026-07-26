# 조선 본영 건설·체력 프레임 파일럿

기준일: 2026-07-26

## 판정

원본 내부 클래스 `49`가 `조선 본영`, 런타임 스프라이트 슬롯 `141`,
`char\hqk.spr`에 연결되는 식별 경로와 건설·정상·반파 본체 프레임 선택을 `정적 확정`했다.
정상·경계·실패 입력은 독립 추출기와 테스트로 `재현 완료`했고, 확인한 본체 상태만 현재 테마에
`원본 기반`으로 이식했다.

이 판정은 `hqk.spr`의 프레임 0~8에만 적용한다. 프레임 9~19, 오버레이·효과, 피벗과 다른 건물에는
확장하지 않는다.

## 원본과 식별 경로

| 파일 | SHA-256 | 확인된 형식 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | PE32 x86 |
| `original/imjinrok2/char/hqk.spr` | `17e5640a7b34f8aaf1063d210bd087b8ba59d769e194f5025e92941e422c2d4e` | 131×131, 20프레임 |

| 주소 | 확인한 동작 |
| ---: | --- |
| `0x0045bd00` | 타입 정의 레코드의 sprite slot `+0x04`, base frame `+0x06`, 이름 포인터 `+0x6c` 기록 |
| `0x0045e1d4` | 클래스 49 초기화 인수로 이름 포인터 `0x00aa5808` 전달 |
| `0x0045e23c` | 슬롯 `141`, base frame `7`, 레코드 `0x00886d9c` 연결 |
| `0x0049012b`, `0x0049013f` | 런타임 이름 저장소 `+0x17f0`에 `0x004c80d8`의 CP949 문자열 복사 |
| `0x004c80d8` | CP949 문자열 `조선 본영` |
| `0x004bc2c8` | 자원 포인터 표에서 슬롯 141의 셀 |
| `0x004bcf34` | 셀이 가리키는 문자열 `char\hqk.spr` |
| `0x004292b3` case 49 | 공통 건물 본체 설정 경로 `0x004292ba`로 분기 |

타입 정의 표는 `0x00882e10`, stride는 `0x14c`다. 따라서 클래스 49 레코드는
`0x00882e10 + 49 × 0x14c = 0x00886d9c`다.

## 건설 진행도에서 프레임으로

`FUN_0041aa90`은 signed `BYTE entity+0x8c`의 정수 백분율을 읽고 아래 phase를
`WORD +0x1b2`와 건설 frame phase `WORD +0x34`에 함께 기록한다. 애니메이션 상태 12는
`FUN_0041a9e0`으로 디스패치되고 다음 식으로 최종 렌더 필드 `WORD +0x0c`를 만든다.

```text
renderFrame = constructionFramePhase + (typeBaseFrame - 7)
```

조선 본영의 base frame은 7이므로 `renderFrame = constructionFramePhase`다. 같은 함수가 타입의
sprite slot을 렌더 필드 `WORD +0x0a`에 기록하며, `FUN_0041fdb0`이 `+0x0a`와 `+0x0c`를
소비한다.

| 건설 진행도 | `hqk.spr` 프레임 |
| ---: | ---: |
| 0~9 | 0 |
| 10~19 | 1 |
| 20~29 | 2 |
| 30~39 | 3 |
| 40~49 | 4 |
| 50~69 | 5 |
| 70~99 | 6 |
| 100 | 7 |

비균등한 `50~69`, `70~99` 구간이 있으므로 프레임 0~7을 균등 간격으로 나누는 기존 구현은 원본
규칙과 달랐다.

## 정상·반파 선택

`FUN_0043b4d0`은 타입 플래그의 `0x2`가 설정된 엔티티에서 다음 정수식을 사용한다.

```text
effectiveHealth =
  (100 - constructionPercent) * trunc(maximumHealth / 100)
  + currentHealth

threshold = trunc(maximumHealth * 50 / 100)
damaged = effectiveHealth < threshold
```

`effectiveHealth == threshold`는 정상이다. 반파로 전환할 때 `WORD entity+0x250`을 `1`, 회복할 때
`0`으로 바꾸고 `FUN_004291d0`을 다시 호출한다. 공통 건물 경로는 상태 `0`에서 타입 base frame,
상태 `1`에서 base frame `+1`을 선택하므로 조선 본영은 다음과 같다.

| 상태 | 프레임 |
| --- | ---: |
| 완공·정상 | 7 |
| 반파 | 8 |

기존 테마는 정상 idle에 프레임 8을 사용해 정상 체력 본영을 반파 이미지로 표시했다. 이 가정은 원본
코드에 의해 `반증됨`이다.

## 재현과 이식

- `tools/imjinrok/extract-building-state-pilot.mjs`가 두 원본 해시, 타입 정의 인수, 이름, 자원
  포인터, 클래스 switch, 건설 임계값, 체력 수식과 상태 전이를 검사한다.
- `tools/imjinrok/building-state-pilot.test.mjs`가 모든 진행도 경계, 체력 50% 경계, 건설 중 유효
  체력과 잘못된 입력을 검사한다.
- `packages/shared/src/themes.ts`의 `korean-hq`는 건설 프레임 0~7, 정상 7, 반파 8을 사용한다.
- `apps/game-client/src/originalBuildingVisualState.ts`는 테마별 진행도 임계값과 엄격한 50% 미만
  판정을 적용한다. 임계값이 없는 다른 건물은 기존 임시 균등 선택을 유지한다.

재생성:

```bash
pnpm imjinrok:extract-building-state-pilot
pnpm imjinrok:audit-sprite-mappings
```

## 남은 경계

- `hqk.spr` 프레임 9~19의 역할
- 본체 외 오버레이와 효과 선택
- 원본 피벗·지면 접점
- 다른 조선·일본 건물의 타입 정의와 상태별 frame delta

클래스 52 조선 봉화대는 같은 공통 경로를 별도로 교차 확인해
[조선 봉화대 파일럿](beacon-state-pilot.md)으로 승격했다. 그 밖의 건물도 타입 정의→자원 슬롯→건설
함수→체력 분기 경로를 독립적으로 완결해야 한다.
