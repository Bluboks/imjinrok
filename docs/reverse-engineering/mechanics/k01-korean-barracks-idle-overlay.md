# K01 조선 훈련소 completed-idle 오버레이 경계

기준일: 2026-07-31

## 질문과 범위

원본 internal class `50` 조선 훈련소가 완공 뒤 idle에서 `char\barrackk.spr`의 frame `9..15`를
별도 오버레이로 그리는지, 그 경우 슬롯·순서·cadence·loop·배치·state gate가 무엇인지 확인한다.

이 문서는 class 50의 타입 정의→일반 건물 초기화→state `8/9`의 primary frame selector→entity
renderer까지의 정적 경로만 다룬다. 이 범위 바깥의 독립 effect/compositor producer까지 부재를
증명하지 않으므로, `9..15` 오버레이의 원작 규칙은 아직 `미확인`이다.

## 원본과 상태

| 입력 | SHA-256 | 확인 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | class 50 primary body configuration과 renderer data flow |
| `original/imjinrok2/char/barrackk.spr` | `076f727dd2d35125a0acbe7ce02d89440d93873e8fd83699bdd4813f7895bc48` | 128×117, 32 frames; frame 9..15 존재만 확인 |

- 분석 상태: primary body 범위는 `정적 확정`; 별도 overlay 질문은 `미확인`.
- 재현 상태: primary body의 정상·반파 입력은 `재현 완료`; overlay는 `미재현`.
- 구현 상태: 이 분석 단위에서는 없음. 제품 매핑을 변경하지 않았다.

## 식별·제어 흐름

| 주소 또는 범위 | 확인한 사실 |
| --- | --- |
| `0x0045e458` | class 50 정의 레코드 `0x00886ee8`에 slot `108`, base frame `7`을 전달한다. catalog의 원본 이름은 `조선 훈련소`, path는 `char\barrackk.spr`이다. |
| `0x004291d0`, switch `0x004292b3`, case `50` | class 50은 `0x004292ba` 일반 건물 configuration branch로 간다. class 전용 frame `9..15` branch가 아니다. |
| `0x004292ba-0x0042981d` | `WORD entity+0x250 == 0`이면 type slot·base frame을 primary configuration에 넣고, nonzero이면 base frame에 정확히 `+1`을 넣는다. class 50에서는 각각 `108/7`, `108/8`이다. |
| `0x0041d210`, state `8/9` | 두 state 모두 `0x0041d870` primary selector로 dispatch한다. |
| `0x0041d870-0x0041d977` | selector는 하나의 configured slot을 `WORD +0x0a`에, current phase와 configured frame offset의 합을 `WORD +0x0c`에 기록한다. 이 경로가 별도 slot/frame pair를 만들지 않는다. |
| `0x0041fdb0`, `0x00420000` | entity renderer는 `+0x0a/+0x0c`을 읽어 clip/owner 조건별 blit branch를 선택한다. 확인한 primary pair 선택은 draw branch보다 앞선다. |

관련 seeded function 전체 바이트는 추출기가 `0x004291d0-0x0042c548`과
`0x0041fdb0-0x0042083a`로 검증한다. raw 범위 hash도 `0x004292ba-0x0042981d` 및
`0x0041d870-0x0041d977`에 고정한다.

## 확인한 primary body 벡터

`WORD entity+0x250`은 이 범위에서 normal/damaged body configuration gate다. 사람이 읽는
damage 상태 전체 수명주기는 이 문서 범위가 아니지만, 두 configuration 결과는 아래처럼 고정된다.

| `+0x250` | primary slot | configured frame offset | 별도 overlay |
| ---: | ---: | --- | --- |
| `0` | `108` | `7` | 이 경로에서 없음 |
| nonzero | `108` | `8` | 이 경로에서 없음 |

여기서 `7`과 `8`은 일반 건물 branch가 설정하는 primary configuration의 offset이다.
selector는 `renderFrame = currentPhase + configuredFrameOffset`을 사용한다. `currentPhase`의
completed-idle cadence·loop를 이 범위에서 끝까지 복원하지 않았으므로, 이를 `barrackk.spr`의 다른
frame 의미나 독립 애니메이션의 부재로 일반화하지 않는다.

## 반증된 가정과 남은 경계

다음 주장은 이 정적 범위에서 지지되지 않는다.

- frame `9..15`가 class 50 completed-idle flag overlay라는 주장
- 그 frame의 `9→15` 순서, cadence, loop 또는 restart 규칙
- 본체 전/후 compositor order와 source pivot·placement
- overlay의 health, production queue, selection 또는 completed gate

frame들이 SPR 파일에 있다는 사실은 source mapping·의미·draw call의 증거가 아니다. 따라서 과거의
`9..15` 웹 flag layer는 시각적 유사성만으로 복원할 수 없다.

정확한 제품 매핑을 열려면 class 50 또는 generic world draw caller가 second slot/frame을 쓰거나
독립 blit을 호출하는 source producer를 찾아야 한다. 그 producer의 입력 gate, counter writer와
wrap, source coordinate/pivot 및 first primary blit과의 순서를 같은 EXE hash에서 끝까지 연결해야 한다.

## 재현

```bash
node tools/imjinrok/extract-k01-korean-barracks-idle-overlay.mjs --json
node --test tools/imjinrok/k01-korean-barracks-idle-overlay.test.mjs
```

fixture [`analysis/fixtures/k01-korean-barracks-idle-overlay-vectors.json`](../../../analysis/fixtures/k01-korean-barracks-idle-overlay-vectors.json)는 두 primary body 입력과 unresolved overlay boundary를
고정한다. EXE, SPR, static artifact source hash, seeded function body, raw code range 또는 frame
configuration이 변조되면 추출기 또는 테스트가 실패한다.
