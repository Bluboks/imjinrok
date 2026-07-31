# K01 조선 훈련소 completed-idle 오버레이 경계

기준일: 2026-07-31

## 질문과 범위

원본 internal class `50` 조선 훈련소가 완공 뒤 idle에서 `char\barrackk.spr`의 frame `9..15`를
별도 오버레이로 그리는지, 그 경우 슬롯·순서·cadence·loop·배치·state gate가 무엇인지 확인한다.

이 문서는 class 50의 타입 정의→entity constructor→일반 건물 초기화→active-list update→action `1`
primary phase producer→state `8/9` selector→entity renderer까지의 정적 경로를 다룬다. 이 범위는
slot `108` primary path가 `9..15`를 선택하지 못한다는 bounded negative를 확정한다. 이 범위 바깥의
독립 effect/compositor second-draw producer는 계속 `미확인`이다.

## 원본과 상태

| 입력 | SHA-256 | 확인 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | class 50 primary body configuration과 renderer data flow |
| `original/imjinrok2/char/barrackk.spr` | `076f727dd2d35125a0acbe7ce02d89440d93873e8fd83699bdd4813f7895bc48` | 128×117, 32 frames; frame 9..15 존재만 확인 |

- 분석 상태: primary body·phase 범위는 `정적 확정`; independent second draw 질문은 `미확인`.
- 재현 상태: primary body·phase의 정상·경계·overflow-failure 입력은 `재현 완료`; independent second draw는 `미재현`.
- 구현 상태: 이 분석 단위에서는 없음. 제품 매핑을 변경하지 않았다.

## 식별·제어 흐름

| 주소 또는 범위 | 확인한 사실 |
| --- | --- |
| `0x0045e458` | class 50 정의 레코드 `0x00886ee8`에 slot `108`, base frame `7`을 전달한다. catalog의 원본 이름은 `조선 훈련소`, path는 `char\barrackk.spr`이다. |
| `0x004291d0`, switch `0x004292b3`, case `50` | class 50은 `0x004292ba` 일반 건물 configuration branch로 간다. class 전용 frame `9..15` branch가 아니다. |
| `0x00437650` | `0x558`-byte entity constructor가 `WORD +0x1b2=0`, `WORD +0x1b0=1`을 기록한 뒤 class definition flags를 `DWORD +0x74`로 복사한다. class 50의 copied flags는 `0x00710002`다. |
| `0x004292ba-0x0042981d` | class 50 generic branch는 `BYTE +0x92=1`을 기록한다. `WORD +0x250 == 0`이면 type slot·base frame을 primary configuration에 넣고, nonzero이면 base frame에 정확히 `+1`을 넣는다. class 50에서는 각각 `108/7`, `108/8`이다. |
| `0x00447360` | active-list slot마다 `0x00635258 + slot*0x558` entity pointer를 만들고 `0x0043c9c0` high-action dispatcher를 호출한다. |
| `0x0043c9c0`, switch `0x0043cda3`, case `1` | constructor의 high action `1`은 `0x0043cdaa`로 가며 footprint clear 뒤 `0x0043c300`을 호출한다. |
| `0x0043c300-0x0043c372` | active이고 `(DWORD +0x74 & 0x01000040)==0`, 그리고 signed absolute `DWORD +0x228 - DWORD 0x007c5f80`가 `5` 이상일 때만 current tick을 `+0x228`에 저장한다. 이어 state `8`, dirty `+0x04=1`, `+0x1b2=(+0x1b2+1) signed-IDIV (signed BYTE +0x92) remainder`, `+0x34`에 같은 remainder를 쓴다. |
| `0x0043cd32-0x0043cd87` | 별도 state-`9` producer는 `DWORD +0x74` bit `0x40`, action이 `11/13`이 아님, global tick `%3==0`을 요구한다. class 50 copied flags `0x00710002`에는 bit `0x40`이 없어 이 branch는 reached 하지 않는다. |
| `0x0041d210`, state `8/9` | 두 state 모두 `0x0041d870` primary selector로 dispatch한다. |
| `0x0041d870-0x0041d977` | selector는 하나의 configured slot을 `WORD +0x0a`에, current phase와 configured frame offset의 합을 `WORD +0x0c`에 기록한다. 이 경로가 별도 slot/frame pair를 만들지 않는다. |
| `0x0041fdb0`, `0x00420000` | entity renderer는 `+0x0a/+0x0c`을 읽어 clip/owner 조건별 blit branch를 선택한다. 확인한 primary pair 선택은 draw branch보다 앞선다. |

관련 seeded function 전체 바이트는 추출기가 `0x004291d0-0x0042c548`과
`0x0041fdb0-0x0042083a`로 검증한다. raw 범위 hash도 `0x004292ba-0x0042981d` 및
`0x0041d870-0x0041d977`에 고정한다.

## 확인한 primary body·phase 벡터

`WORD entity+0x250`은 이 범위에서 normal/damaged body configuration gate다. 사람이 읽는
damage 상태 전체 수명주기는 이 문서 범위가 아니지만, 두 configuration 결과는 아래처럼 고정된다.

| `+0x250` | primary slot | configured frame offset | 별도 overlay |
| ---: | ---: | --- | --- |
| `0` | `108` | `7` | 이 경로에서 없음 |
| nonzero | `108` | `8` | 이 경로에서 없음 |

여기서 `7`과 `8`은 일반 건물 branch가 설정하는 primary configuration의 offset이다. selector는
`renderFrame = currentPhase + configuredFrameOffset`을 사용한다. constructor가 `currentPhase=0`을
기록하고 class-50 configuration이 divisor `+0x92=1`을 기록하므로, reached action-1 update는
`(0+1) % 1 = 0`만 저장한다. elapsed gate 미통과면 phase도 그대로 `0`이다. 따라서 exact primary
sequence는 healthy `7,7,7,…`, nonzero `+0x250`에서는 `8,8,8,…`이고 loop는 singleton `0`이다.

cadence는 source global tick의 signed-absolute elapsed threshold `>=5`다. gate 통과 때마다 `+0x228`을
current global tick으로 갱신하므로 fixed FPS나 web `24 Hz` 변환은 이 증거에서 나오지 않는다. primary
update는 state `8`만 쓴다. state `9` generic producer는 bit `0x40` gate 때문에 class 50에는 도달하지
않는다.

`+0x250` nonzero는 이 범위에서 offset `7→8`만 바꾼다. divisor·initial phase·state-9 flag gate를
바꾸는 writer는 reached class-50 primary CFG에서 확인되지 않았다. 이는 damage lifecycle 전체 또는
damage transition ordering을 확정하는 주장이 아니다.

## 반증된 가정과 남은 경계

다음 주장은 이 정적 범위에서 지지되지 않는다.

- state `8/9` primary path의 `currentPhase` writer·값 범위·cadence·loop가 slot `108`에서 frame
  `9..15`를 선택한다는 주장: 위 primary CFG와 모순되어 `반증됨`
- primary path가 frame `9→15` 순서, cadence, loop 또는 restart 규칙을 가진다는 주장: singleton
  phase `0`과 모순되어 `반증됨`
- frame `9..15`가 class 50 completed-idle flag overlay라는 주장: independent second draw가 아직
  분석되지 않아 `미확인`
- 본체 전/후 compositor order와 source pivot·placement
- overlay의 health, production queue, selection 또는 completed gate

frame들이 SPR 파일에 있다는 사실은 source mapping·의미·draw call의 증거가 아니다. 따라서 과거의
`9..15` 웹 flag layer는 시각적 유사성만으로 복원할 수 없다.

primary candidate는 반증됐다. 다음 독립 분석 단위는 class 50 또는 generic world-draw/effect/compositor
caller가 second slot/frame을 쓰거나 independent blit을 호출하는지다. 그 producer의 input gate,
counter writer·cadence, frame sequence·loop/restart, pivot·placement와 compositor order를 함께
고정하기 전에는 제품 `9..15` overlay를 이식하지 않는다.

## 재현

```bash
node tools/imjinrok/extract-k01-korean-barracks-idle-overlay.mjs --json
node --test tools/imjinrok/k01-korean-barracks-idle-overlay.test.mjs
```

fixture [`analysis/fixtures/k01-korean-barracks-idle-overlay-vectors.json`](../../../analysis/fixtures/k01-korean-barracks-idle-overlay-vectors.json)는 normal phase update, elapsed `4/5` boundary,
negative delta와 signed `INT32_MIN` overflow failure, 두 damage configuration과 unresolved second-draw
boundary를 고정한다. EXE, SPR, static artifact source hash, seeded function body, raw code range 또는
frame/phase configuration이 변조되면 추출기 또는 테스트가 실패한다.
