# K01 권율·유성룡 nearby aura 조사

## 질문과 범위

K01 내부 클래스 `76` 조선 권율과 `78` 조선 유성룡이 가까운 아군에게 적용한다는 관찰된 효과가 있다면,
원본 EXE에서 producer class, 대상 관계·타입, 거리 수식과 경계, 변경 필드·정수 산술, 갱신·제거
순서, 중첩·동률 및 수혜 표시의 `SPR`/frame/compositor/fog gate를 모두 복원한다.

## 상태

- 분석 상태: `미확인`
- 재현 상태: `미재현`
- K01 구현 상태: `없음`

관찰된 화면 모양은 이 상태를 올리는 근거가 아니다. 이 문서는 source-backed aura를 주장하지 않는다.

## 고정 입력과 제한된 확인

`pnpm imjinrok:extract-k01-hero-aura-evidence`는 `analysis/fixtures/k01-hero-aura-evidence.json`과
같은 사실을 검증한다.

- EXE: `original/imjinrok2/imjinrok2.exe`, SHA-256
  `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- candidate resource: `original/imjinrok2/fnt/eventmark.spr`, SHA-256
  `30bcdcc2236fe88b28be0321ba826543ce0fc313982f5d52c6e8cfb039535ee3`
- type initializer `0x0045d998`은 type record `0x008890a0`의 class `76`을, `0x0045daa1`은
  `0x00889338`의 class `78`을 초기화한다. 두 이름과 identity는 entity catalog와 교차 확인한다.
- EXE resource pointer table `0x004bc214`은 slot `96`의 `fnt\\eventmark.spr` 문자열을 가리킨다.

이 resource entry는 eventmark가 aura 표식이라는 뜻이 아니다. frame, anchor, display condition, fog
visibility 또는 blend/compositor 순서를 확정하지 못하므로 `SPR` 변환물을 추가하지 않았고 client도
source asset을 preload하거나 참조하지 않는다.

## 미확인 항목과 다음 정적 작업

현재 EXE 분석에는 class `76`/`78` record에서 수혜 entity field write로 닫히는 전체 CFG/DFG가 없다.
다음 작업은 한 producer 후보에서 caller, entity pool iteration, relation predicate, coordinate reads,
recipient writes와 inverse/removal path를 같은 unit으로 복원해야 한다.

1. producer의 실제 class와 행동·health·active slot gate를 확인한다.
2. 아군 relation, target class/flag predicate, self 포함 여부를 복원한다.
3. 좌표 field, metric, signedness, strict/inclusive boundary 및 footprint 처리를 복원한다.
4. stat field와 modifier/rounding, tick cadence, producer death·movement·team change 제거를 복원한다.
5. overlapping provider와 tie write order를 복원한다.
6. renderer call chain을 eventmark 또는 다른 resource의 slot/frame/pivot/fog gate까지 닫는다.

정상·경계·실패·overlap 벡터가 모두 재현되기 전에는 K01 profile 또는 source indicator를 등록하지 않는다.

## 프로젝트 적응 경계

`packages/shared/src/aura.ts`와 `packages/simulation/src/aura.ts`는 generic/mod scenario용 opt-in contract다.
profile id가 없으면 derived `auraEffects`도 없고 기존 world behavior는 변하지 않는다. 선택된 profile은
snapshot에 stable id와 현재 recipient 결과만 저장하고 executable definition은 caller registry가 소유한다.
`grid-chebyshev`, inclusive maximum, multiplier floor, same stacking key의 strongest→provider-id tie, 서로
다른 key의 multiplicative composition 및 client diamond marker는 모두 `프로젝트 전용`이다.

client는 authoritative `auraEffects`가 있으며 visible unit일 때만 marker를 그린다. visibility filter는
기존 `SkirmishScene` unit reconciliation이 소유하므로 fog로 숨긴 unit의 marker를 별도로 노출하지 않는다.
provider removal은 `removeUnitFromWorld`에서 즉시 recipient state에서 제거되고 다음 tick refresh는
movement/team/overlap을 재계산한다.
