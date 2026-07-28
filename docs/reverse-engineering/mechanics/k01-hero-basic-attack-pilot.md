# K01 권율·유성룡 일반 공격 phase 파일럿

기준일: 2026-07-26

## 판정

K01의 두 보호 영웅에 한해 일반 공격 행동 상태에서 공격 애니메이션 phase, 실제 효과 발생
phase, 한 사이클 종료, 다음 공격을 허용하는 회복 카운터까지 정적으로 연결했다.

| 원본 클래스 | 이름 | 공격 phase 수 | 효과 phase | phase당 내부 갱신 | 종료 후 회복 | 전달 방식 | 기본 payload |
| ---: | --- | ---: | ---: | ---: | ---: | --- | ---: |
| 76 | 조선 권율 | 8 | 7 | 1 | 짝수 전역 틱 2회 | 직접 피해 kind 1 | 80 |
| 78 | 조선 유성룡 | 10 | 7 | 1 | 짝수 전역 틱 2회 | 투사체 subtype `0x0c` | 45 |

여기서 phase와 회복 수치는 원본 내부 갱신 단위다. 원본 전역 틱 한 번이 몇 초인지와 프로젝트의
24 Hz simulation·현재 8 FPS 공격 클립에 어떻게 대응하는지는 아직 확정하지 않았다. 따라서 이
결과로 현재 프로젝트의 초 단위 공격 속도가 원본과 같다고 주장하거나, 현행 `cooldownTicks`를 바로
교체하지 않는다.

## 고정 입력과 상태 경로

- 원본 EXE SHA-256:
  `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- 행동 상태 `WORD [entity+0x1b0] == 5`
- `0x0043d168`: `FUN_0043c9c0`이 일반 공격 갱신기 `FUN_00416c70` 호출
- 공격 하위 상태 `DWORD [entity+0x88] == 3`
- `0x0041733c`: `FUN_00416c70`이 phase·효과 처리기 `FUN_00417430` 호출

`FUN_00416c70`은 대상이 사거리 안에 들어오면 phase `+0x1b2`를 0으로 초기화하고 하위 상태
3으로 전환한다. `FUN_00417430`은 다음 순서로 한 번의 공격 갱신을 처리한다.

1. 주·보조 회복 카운터가 임계값에 도달했는지 검사한다.
2. `BYTE +0x6f`를 올리고 `BYTE +0x6e`에 도달하면 0으로 되돌린다.
3. 공격 상태 4를 선택하고 `WORD +0x1b2`를 `WORD +0x144`로 나눈 나머지로 순환한다.
4. 새 phase가 signed `BYTE +0x143`과 같을 때 공격 효과를 낸다.
5. phase가 0으로 돌아오면 `WORD +0x13a`를 0으로 초기화하고 사이클 완료값 1을 반환한다.

두 영웅은 `+0x6e == 1`, `+0x143 == 7`이다. 권율은 7번째 phase 전진에서 직접 피해를 내고
8번째에 0으로 돌아온다. 유성룡은 7번째에 투사체를 만들고 phase 8·9를 거쳐 10번째에
0으로 돌아온다.

## 타입 정의에서 런타임 필드까지

타입 정의 표 base는 `0x00882e10`, stride는 `0x14c`다. `FUN_0045bd00`의 인수와
`FUN_00437650`의 복사 경로를 함께 검사했다.

| 타입 정의 필드 | writer 인수 | 런타임 필드 | 이 파일럿의 의미 |
| ---: | ---: | ---: | --- |
| `+0x00` | 18 | `+0x46` | 기본 공격 payload |
| `+0x38` | 27 | `+0x138` | 주 회복 임계값 |
| `+0x3a` | 28 | `+0x143` | 효과 발생 phase |
| `+0x3e` | 30 | `+0x13e` | 보조 회복 임계값 |
| `+0x42` | 32 | `+0x6e` | phase 전진에 필요한 내부 갱신 수 |
| `+0x58` | 40 | `+0x7c` | 공격 전달 분기값 |

두 영웅의 주 회복 임계값은 2, 보조 임계값은 0이다. `FUN_0043b4d0`의 `0x0043c060`
분기는 전역 틱 `0x007c5f80`의 최하위 비트가 0일 때만 `+0x13a`를 증가시킨다. 따라서 공격
사이클이 `+0x13a`를 0으로 되돌린 뒤에는 짝수 전역 틱에 해당하는 갱신 두 번을 거쳐야 다시
준비된다. 사이클 종료 시점의 전역 틱 홀짝에 따라 실제로 지나가는 전체 갱신 횟수는 달라질 수 있다.

## 권율 직접 피해

권율의 타입 정의 `DWORD +0x58`은 `0x13`이다. `FUN_00417430`의 이 분기는 phase 7에서
공통 직접 공격 경로로 합류해 다음 값을 `FUN_00413700`에 전달한다.

```text
effect kind = 1
payload = WORD [attacker+0x46] + WORD [attacker+0x4a]
base WORD [attacker+0x46] = 80
```

`+0x4a`는 임시 공격 보정 필드이며 K01에서 값이 바뀌는 경로는 아직 이 파일럿 범위에 포함하지
않았다. effect kind 1은 `FUN_00413b30`에서 `FUN_00413070`의 피해 계산을 거쳐
`FUN_00438130`으로 전달된다.

방어 합은 defender `WORD +0x44`와 `WORD +0x50`을 더한 뒤 최대 90으로 제한한다. defender
`DWORD +0x80` 값이 1이면 payload를 10%, 3 또는 6이면 30% 올리고, 그 외에는 보정하지
않는다. 정수 나눗셈의 소수부를 버린 원본 수식은 다음과 같다.

```text
modified = payload + trunc(payload * classModifierPercent / 100)
defense = min(defenseBase + defenseModifier, 90)
damage = max(1, modified - trunc(defense * modified / 100))
```

`FUN_00438130`은 defender `WORD +0x90` buffer가 damage 이상이면 buffer만 줄인다. buffer가
0보다 크지만 damage보다 작으면 buffer를 0으로 만들고 잔여가 아니라 원 damage 전량을 현재
체력 `WORD +0x3e`에서 빼며 signed-positive가 아니면 0으로 고정한다.

## 유성룡 투사체 경계

유성룡의 타입 정의 `DWORD +0x58`은 9다. phase 7에서 대상 유효성 확인 뒤
`FUN_004111b0`을 subtype `0x0c`로 호출하고, 기본 payload 45와 `+0x4a` 보정값을 투사체
레코드에 전달한다.

후속 [subtype `0x10` 경로 분석](k01-subtype-16-path.md)은 공유 fixed record·path updater와
subtype `0x0c`의 final dispatcher를 추적했다. subtype `0x0c`는 path end에서 effect kind 9를
`FUN_00413700`에 넘기고 cleanup되며, 선택된 target health write는 부분 재현됐다. kind 9의 모든
callback과 공격 전 target 탐색·사거리는 이 파일럿 전체 범위에서 계속 미완료다.

## 재현

```bash
pnpm imjinrok:extract-k01-hero-basic-attack-pilot
node --test tools/imjinrok/k01-hero-basic-attack-pilot.test.mjs
```

추출기는 타입 정의 writer 인수, 런타임 필드 복사, 행동 상태와 공격 하위 상태 호출, phase 7
분기, 권율 직접 피해 호출, 유성룡 투사체 생성, phase 0 완료와 체력 감소 명령어를 원본
바이트와 교차 검증한다.

테스트는 다음을 재현한다.

- 권율: 7번째 phase 전진에서 hit, 8번째에 사이클 종료
- 유성룡: 7번째 phase 전진에서 projectile spawn, 10번째에 사이클 종료
- 준비 전 공격 차단과 짝수 전역 틱 2회의 회복
- 권율 직접 피해의 방어 90 상한, 최소 피해 1, defender class 10%·30% 보정
- 변조된 타입 상수와 다른 EXE에서 만든 Ghidra 산출물 거부

## 다음 경계

subtype `0x0c` dispatcher·kind 9·선택 health write는 후속 분석에서 닫혔다. 다음 정적 분석
우선순위는 kind 9 callback 전수와 공격 전 대상 탐색·사거리다. 그 다음 원본 전역 틱 생산자와
메인 루프의 시간 단위를 복원해 이 phase 벡터를 프로젝트 simulation과
클립 FPS에 같은 기준으로 이식한다. 대상 검색·사거리와 사망·참조 정리는 공격 주기 파일럿의 남은
단계로 유지한다.
