# K01 시작 건물 source binding

## 질문과 범위

K01 canonical map의 active building records가 어떤 original class, type catalog identity, SPR source, slot 및
base frame에 결합하는지만 확인한다. frame 7의 건설 완료·정상·피해 의미는 이 문서의 질문이 아니다.

## 원본 파일과 해시

- `original/imjinrok2/imjinrok2.exe`: `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- `original/imjinrok2/stagemap/k01.map`: `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb`
- six SPR SHA-256은 [binary manifest](../binary-manifest.md)에 기록한다.

## 분석·재현·구현 상태

- 분석 상태: `정적 확정`
- 재현 상태: `재현 완료`
- 구현 상태: `없음`

현재 게임 비주얼 또는 project proxy를 원본 건물 state 구현으로 승격하지 않는다.

## 데이터 주소와 catalog contract

`analysis/generated/entity-type-catalog.json`은 canonical SHA-256
`572044d9eec6162689154f3625c7572f27d7ee9030d4e4f9f51151b6a88f8745` 및
`static-proven-type-identities` status를 만족해야 한다. extractor는 이 catalog를 신뢰하는 데 그치지
않고 EXE sprite pointer table, 각 SPR hash와 header를 다시 교차 검사한다.

| class | 이름 | catalog record | flags | slot | base | SPR |
| ---: | --- | --- | --- | ---: | ---: | --- |
| 48 | 조선 방앗간 | `0x00886c50` | `0x00310182` | 146 | 7 | `char\\millk.spr` |
| 49 | 조선 본영 | `0x00886d9c` | `0x00710082` | 141 | 7 | `char\\hqk.spr` |
| 51 | 조선 훈련도감 | `0x00887034` | `0x00710002` | 213 | 7 | `char\\advbarrackk.spr` |
| 58 | 일본 본영 | `0x00887948` | `0x00510082` | 106 | 7 | `char\\jhq.spr` |
| 60 | 일본 훈련소 | `0x00887be0` | `0x00510042` | 110 | 7 | `char\\barrackj.spr` |
| 63 | 일본 망루 | `0x00887fc4` | `0x00112006` | 219 | 7 | `char\\towerj.spr` |

## map source records

Map parser가 확인한 active records는 다음 11개다. raw owner word는 source record 값이며 사람용
소유권 의미나 runtime ownership policy를 확정하지 않는다.

| raw owner | class | source positions |
| ---: | ---: | --- |
| 0 | 49 | `(5,4)` |
| 0 | 48 | `(11,5)` |
| 0 | 51 | `(5,8)` |
| 1 | 58 | `(7,57)`, `(56,6)` |
| 1 | 60 | `(6,50)`, `(55,11)` |
| 1 | 63 | `(18,49)`, `(44,5)`, `(32,40)`, `(35,29)` |

## SPR header 교차 검사

각 input은 source path와 EXE pointer cell도 대조한다. header는 각각 `millk` 114×107/16,
`hqk` 131×131/20, `advbarrackk` 137×118/14, `jhq` 120×133/24, `barrackj` 125×110/24,
`towerj` 71×98/40 frames다. header와 frame 존재는 action 또는 body-state 의미를 증명하지 않는다.

## 확인된 사실

이 11개 record는 `exact-static-identity-source` 범위에서 class identity, original name, slot, base frame
7 및 SPR source와 결합한다. 이 범위는 K01 map source record에 한정된다.

## 추정과 미확인 항목

construction, damaged, overlay, timing, pivot, stats, behavior와 raw owner word의 사람용 의미는
`미확인`이다. class 49 `hqk.spr`의 body-state 파일럿은 별도의 좁은 질문이며 이 결과를 다른
건물 또는 overlay로 일반화하지 않는다.

## 재현 테스트 벡터

[`analysis/fixtures/k01-opening-building-bindings.json`](../../../analysis/fixtures/k01-opening-building-bindings.json)은
11개 record의 class·owner·position·identity·slot·base·source를 고정한다. test는 supplied binding,
catalog, map 및 SPR 변조를 모두 거부한다.

## 현재 구현과의 차이

이 작업은 `packages/shared/**`, game asset 및 project proxy를 변경하지 않는다. 따라서 현재 renderer나
content name은 원본 building state 근거가 아니다.

## 다음 분석 작업

필요할 경우 각 건물별 renderer field, construction/health 분기, overlay와 timing을 별도 정적 질문과
독립 vector로 분석한다. source record·catalog identity만으로 frame 7의 의미를 부여하지 않는다.
