유성룡 투사체 subtype `0x0c`는 어떻게 비행하고, 언제 충돌하며, 최종 체력 피해를 어떻게 계산·적용하는가?

# K01 유성룡 투사체 subtype `0x0c` 파일럿

기준일: 2026-07-26

## 판정과 범위

- 분석 상태: `정적 확정` — 원본 CFG와 아래 `0..32767` accepted coordinate subset에 한정
- 재현 상태: `재현 완료` — 같은 subset의 명시된 정상·경계·실패 벡터에 한정
- 구현 상태: `부분 이식`

이미 정적 확정된 유성룡 공격 phase 7의 생성 지점부터 subtype `0x0c` 슬롯 할당, 레코드 초기화,
정수 경로 생성과 갱신, 도착 판정, effect kind `9` 피해 계산, 완충 수치·체력 적용, 레코드 반환까지
복원했다. 여기에 피해 계산 뒤 실행되는 raw mode/table 적용 gate, x86 WORD wrap과 signed 분기,
subtype 설정 word가 비행 중 분기를 끄는 경로까지 포함한다. 정상 경로, 짧은 경로, 적용 gate,
WORD 경계, 완충 수치·체력, 대상 소멸·세대 불일치, 풀 고갈을 독립 벡터로 재현했다.

호출부가 attacker `+0x6a/+0x6c`와 active target `+0x32/+0x34`의 signed WORD를 직접
읽는 사실은 증명했지만, 이 필드의 생산자와 전체 caller 범위 및 비음수 range guard는 이번
범위에서 증명하지 않았다. 따라서 독립 포트는 경로 좌표마다 `0..32767`만 받는다. 이는 원본의
유효 좌표 도메인이 아니라, 확인한 산술을 signed-WORD wrap 없이 정확히 재현하는 보수적인
accepted subset이다. 후속 cadence 분석은 투사체 풀이 accepted original scheduler step마다
한 번 갱신됨을 확정했지만, 그 scheduler가 message queue와 가변 millisecond gate를 사용하므로
고정 FPS나 24 Hz exact mapping은 나오지 않았다. 전체 signed-WORD 좌표 호출 범위, 원본 좌표와
프로젝트 `GridPoint`의 변환, 공격 전 대상 검색·사거리, 피격 반응·사망·참조 정리는 이 질문에
포함하지 않는다. 확인한 계산과 경로 선택기는 `packages/simulation`의 독립 모듈로 이식했지만,
현행 24 Hz 전투 루프에는 추정 배율로 연결하지 않았다.

## 고정 입력

| 항목 | 값 |
| --- | --- |
| 원본 파일 | `original/imjinrok2/imjinrok2.exe` |
| 파일 크기 | `843833` bytes |
| SHA-256 | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| 형식 | PE32 x86, ImageBase `0x00400000` |
| Ghidra | `12.1.2`, `x86:LE:32:default`, compiler spec `windows` |
| seed 산출물 | `analysis/generated/imjinrok2/seeds.json`, SHA-256 `88d91d582ac0b864cb3f0448e2600df16878351bde1c7c91e6e96465df2b49f9` |
| jump-table 산출물 | `analysis/generated/imjinrok2/jump-tables.json`, SHA-256 `0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f` |

## 함수와 바이트 범위

표의 raw 범위는 PE 파일 오프셋이고 끝 주소를 포함한다. Ghidra의 자동 prototype은 다수 함수에서
`unknown`이므로 호출 규약은 호출 지점의 stack 정리와 `ECX` 사용을 원본 명령어로 교차 확인했다.

| 함수 VA / raw 범위 | 호출 규약과 역할 | 관련 호출자·피호출자 |
| --- | --- | --- |
| `0x0040c470-0x0040c692` / `0x0000c470-0x0000c692` | `cdecl`, subtype 표 21개 초기화 | 호출자 `0x0045f190`, writer `0x0040c420` |
| `0x0040c6c0-0x0040c96e` / `0x0000c6c0-0x0000c96e` | `thiscall`, `ECX=0x3a0` 레코드, 15개 stack 인수로 전체 초기화 | 호출자 `0x004111b0`; 경로 `0x0040f9b0` 등 |
| `0x0040c970-0x0040df03`의 비연속 switch body / 대응 raw `0x0000c970-0x0000df03` | `fastcall`, subtype별 시각 레코드 후처리 | 초기화기 호출; label `12`→stub `0x0040c9d1`→body `0x0040ccf0` |
| `0x0040df10-0x0040e06f` / `0x0000df10-0x0000e06f` | `fastcall`, `ECX=record`, subtype 1~21 switch | 호출자 `0x00410cc0`; case `0x0c`→`0x0040e270` |
| `0x0040e270-0x0040e2b5` / `0x0000e270-0x0000e2b5` | `fastcall`, subtype `0x0c` 도착 handler | `0x00413700`에 kind `9` 전달 |
| `0x0040f0e0-0x0040f0f0` / `0x0000f0e0-0x0000f0f0` | `fastcall`, record subtype을 active 표 slot에 기록 | `0x004111b0`이 초기화 뒤 호출 |
| `0x0040f9b0-0x0040fc8f` / `0x0000f9b0-0x0000fc8f` | `fastcall`, signed-word Bresenham 경로 생성 | 초기화·재추적 경로에서 호출 |
| `0x0040fd50-0x0040ffa9` / `0x0000fd50-0x0000ffa9` | `fastcall`, 현재 경로 점을 시각 위치 필드로 변환 | `0x00410cc0` 후처리 |
| `0x004107a0-0x00410aa6`의 비연속 body / 대응 raw `0x000107a0-0x00010aa6` | `fastcall`, subtype별 render 상태 갱신 | 비도착 update가 `0x0040fd50` 다음 호출 |
| `0x00410ab0-0x00410ada` / `0x00010ab0-0x00010ada` | `thiscall`, 시작·끝 좌표를 route 관련 필드에 복사 | 초기화기와 retracking 경로 |
| `0x00410cc0-0x0041115b` / `0x00010cc0-0x0001115b` | `fastcall`, 투사체 한 번 갱신 | 풀 `0x00447360`; 경로·dispatcher 호출 |
| `0x00411160-0x0041117f` / `0x00011160-0x0001117f` | `cdecl`, free slot을 `AX`로 반환 | 공격 resolver 등; 실패 시 `0` |
| `0x00411180-0x0041118f` / `0x00011180-0x0001118f` | `cdecl`, slot active word를 `0`으로 반환 | 풀 `0x00447360` |
| `0x004111b0-0x00411229` / `0x000111b0-0x00011229` | `cdecl`, 15개 인수, `AX=1`; `base + slot*0x3a0` 생성 | 유성룡 callsite `0x00417bfb` |
| `0x00413070-0x0041362d` / `0x00013070-0x0001362d` | `cdecl`, kind별 최종 피해 계산 | kind `9` class·방어 분기 |
| `0x00413700-0x00413b02` / `0x00013700-0x00013b02` | `cdecl`, 9개 인수, effect kind dispatcher | kind `9` 단일 저장 대상 전달 |
| `0x00413b30-0x00413ddd` / `0x00013b30-0x00013ddd` | `cdecl`, 대상 참조·피해·후속 호출 조정 | 계산 `0x00413070`, 적용 `0x00438130` |
| `0x0041a880-0x0041a98d` / `0x0001a880-0x0001a98d` | `fastcall`, 생성 직전 좌표 조건별 호출 조정; 함수 자체 direct store 없음 | global-object `ECX`와 좌표를 `0x00466340`, 조건부 `0x00461550`, `0x004abec0`에 전달; callee 간접 효과 미확정 |
| `0x0041a990-0x0041a9ae` / `0x0001a990-0x0001a9ae` | `thiscall`, 공격자 `+0x4d0/+0x4d4/+0x4d6` 기록 | 대상 참조, 상태값 `1`, `5` |
| `0x00438130-0x0043819d` / `0x00038130-0x0003819d` | `ECX=defender`, stack 8 bytes 정리, 완충→체력 적용 | 체력 0이면 `0`, 생존·무변경이면 `1` |
| `0x00438c50-0x00438e22` / `0x00038c50-0x00038e22` | `thiscall`, 생성 전 대상 활성·거리 판정 | 유성룡 spawn 선행 guard |
| `0x0043e1e0-0x0043e3e2` / `0x0003e1e0-0x0003e3e2` | `thiscall`형 command switch, 첫 stack WORD와 26개 stack 인수, `ret 0x68` | raw input `302`가 `0x007c6282`를 0/1 toggle |
| `0x00441db0-0x00441dd8` / `0x00041db0-0x00041dd8` | `cdecl`, low-WORD slot table nonzero·record positive WORD 검사 | 레코드 초기화가 attacker 참조 low WORD로 호출 |
| `0x00441e40-0x00441e7a` / `0x00041e40-0x00041e7a` | `cdecl`, index의 활성 엔티티 확인 | 생성 전과 충돌 effect 소비자 |
| `0x00447360-0x00447599` / `0x00047360-0x00047599` | `cdecl`, 100개 투사체 풀 순회 | 갱신 반환 `0`이면 `0x00411180` |

dispatcher `0x0040df92`의 점프 테이블은 label `1..21`과 default를 모두 복원한다. label `12`는
stub `0x0040e039`로 가며 `0x0040e03b`에서 `0x0040e270`을 호출한다. 범위 밖 subtype은
`0`을 반환한다. subtype `0x0c` handler에는 추가 switch나 간접 호출이 없고 항상 effect를 한 번
요청한 뒤 `1`을 반환한다.

## subtype 설정과 레코드

`0x0040c470`은 `0x005281c8 + subtype * 0x10`에 8개 signed word를 기록한다. subtype
`0x0c` 레코드는 `0x00528288`이며 값은 다음과 같다.

```text
[14, 29, 0, 0, 0, 0, 1, 1]
```

초기화기 `0x0040c8f2-0x0040c956`은 config word 0..7을 순서대로 레코드 `+0x2c`,
`+0x12`, `+0x14`, `+0x112`, `+0x114`, `+0x96`, `+0x06`, `+0x08`에 복사한다.
첫 word `14`는 경로 샘플 간격, 두 번째 word `29`는 sprite slot이다. 특히 config word
3과 4의 `0`은 각각 `+0x112`, `+0x114`로 가며 비행 중 분기를 끈다. 나머지 사람용 의미는
확정하지 않고 raw 값과 소비 분기만 유지한다.

투사체 active 표는 `0x00842500`의 100개 word다. 레코드 풀은 `0x00aa85e8`부터
`0x3a0` stride로 100개다. slot `0`은 할당기에서 제외하고 `1..99`를 순서대로 검사한다.

| 레코드 오프셋 | 폭·signedness | 이 범위의 의미 |
| ---: | --- | --- |
| `+0x26` | signed word | subtype `0x0c` |
| `+0x2e` | signed byte | effect에 전달되는 owner/side 후보 |
| `+0x2c` | signed word | 경로 샘플 간격 `14` |
| `+0x76`, `+0x78` | signed word | 비행 경로 시작 X, Y와 현재 X, Y |
| `+0x7a`, `+0x7c` | signed word | 활성 대상 레코드 `+0x32`, `+0x34`에서 읽은 경로 끝 X, Y |
| `+0x7e`, `+0x80` | signed word | 공격자 `+0x1bc`, `+0x1be`에서 전달한 별도 좌표 쌍 |
| `+0x82`, `+0x84` | signed word | 공격자 `+0x134`, `+0x136`에서 전달해 effect에 쓰는 좌표 |
| `+0x9a` | dword | 세대를 포함한 대상 참조 |
| `+0x9e` | signed word | payload, 유성룡 기본값 `45 + attacker+0x4a` |
| `+0xa0` | dword | 세대를 포함한 공격자 참조 |
| `+0xa4` | signed word | 공격자 참조에서 복사한 owner/분류 후보 |
| `+0xa6` | signed word | 현재 경로 index |
| `+0xa8` | signed word | 마지막 경로 index |
| `+0x112` | word | config word 3=`0`; 값 `1`일 때만 mid-flight effect block 진입 |
| `+0x114` | word | config word 4=`0`; 값 `1`일 때만 target retracking block 진입 |
| `+0x11c` | signed word[160] | 경로 X |
| `+0x25c` | signed word[160] | 경로 Y |

`WORD +0x2c`가 0이면 원본 `IDIV`가 실패하지만 subtype 초기화기는 14를 강제한다. 생성 함수는
slot 범위를 자체 검사하지 않으므로 모든 정상 호출자는 `0x00411160`의 결과를 사용한다.

## 생성과 비행

유성룡 분기는 다음 순서를 지킨다.

1. 공격 대상 low-word index가 활성인지 `0x00441e40`으로 확인한다.
2. `0x00438c50`으로 현재 대상과 공격 조건을 다시 확인한다.
3. `0x0041a990`이 공격자 `+0x4d0`에 대상 참조, `+0x4d4/+0x4d6`에 `1/5`를 기록한다.
4. `0x00411160`으로 free slot을 찾는다. `0`이면 생성하지 않고 공격 phase 종료 경로로 간다.
5. 대상 low-word index로 활성 엔티티 레코드를 계산해 signed word `+0x32/+0x34`를 경로 끝
   X/Y로 읽는다.
6. `0x0041a880`을 호출한다. 이 함수는 owner와 좌표 조건에 따라 세 외부 함수를 호출할 수 있지만
   직접 memory store를 하지 않고 attacker pointer도 callee에 넘기지 않는다. 다만 global-object
   `ECX`와 좌표를 넘기므로 callee가 전역 또는 좌표-indexed 상태를 바꾸는지는 미확정이다.
7. callsite `0x00417bfb`에서 subtype `0x0c`, free slot, 공격자·대상 참조, payload 45와
   `attacker+0x4a`, 시작 좌표 `attacker+0x6a/+0x6c`, 끝 좌표 `target+0x32/+0x34`,
   두 보조 좌표 쌍을 `0x004111b0`에 전달한다.
8. `0x0040c6c0`이 레코드 `0x3a0` bytes를 0으로 지우고 필드를 기록한다. 그 과정에서
   `0x00410ab0`, attacker 참조 검사 `0x00441db0`, 경로 `0x0040f9b0`, subtype 후처리
   `0x0040c970` 순으로 관련 호출을 수행한다.
9. `0x0040f0e0`이 active 표의 해당 slot에 subtype `0x0c`를 기록한다.

두 보조 좌표 쌍 중 `attacker+0x1bc/+0x1be`와 `attacker+0x134/+0x136`이 맵 범위 밖이면
초기화기는 진단 함수를 호출하지만 생성 실패를 반환하지 않는다. 전체 레코드를 먼저 0으로 지웠기
때문에 기록되지 않은 잘못된 보조 좌표는 0으로 남는다. 경로 시작·끝은 각각
`attacker+0x6a/+0x6c`, 활성 대상 `+0x32/+0x34`에서 직접 복사한다. 이 오류 경로를 성공으로
가장하는 fallback으로 포팅하지 않았다.

경로 생성기는 시작점을 index 0에 저장하고 error accumulator를 `0`으로 둔 뒤, 주축을 한 정수씩 전진하는 Bresenham 계열 계산에서
매 14번째 점만 보존한다. 끝점까지 거리가 14보다 작으면 마지막 index도 0이므로 다음 풀 갱신 한 번에
시작점에서 바로 도착 처리된다. 보존 count는 160에서 증가를 멈추지만 원본은 index 160 쓰기를 먼저
수행하므로 매우 긴 경로에서는 `X[160]`이 `Y[0]`과 겹친다. K01 정상 벡터에는 이 상한이 걸리지
않지만 독립 구현은 같은 record memory alias 순서를 유지한다. 원본 빌더는 signed WORD 비교와
low-WORD 중간값을 섞는다. 호출부의 네 좌표 WORD 직접 읽기는 증명했지만 그 생산자, range guard,
전체 caller 범위는 증명하지 않았다. 독립 API가 강제하는 좌표별 `0..32767`은 이 미확정 영역을
원본 보장으로 오인하지 않기 위한 보수적인 포트 계약이다. 음수 좌표와 나머지 signed-WORD
극단에서 원본과 같다고 주장하지 않으며 조용히 JS 산술로 처리하지 않는다.

풀 `0x00447360`은 레코드 순회 전에 전역 random 상태를 다음 순서로 갱신한다.

```text
previousSeed = currentSeed
seed = unsignedLow32(seed * 0xff83) % 0xfffb
currentSeed = seed
```

이는 subtype `0x0c` 끝 좌표를 무작위 보정하는 계산이 아니라 모든 투사체 레코드보다 먼저 일어나는
풀 전역 부수 효과다. 곱셈의 32-bit wrap을 먼저 적용하며, 정상 상태에서는 seed가 이미
`0..0xfffa`에 있다. 그 뒤 slot 0부터 99까지 active word가 0이 아닌 레코드만 순서대로 갱신한다.
`0x00410cc0`은 먼저 `+0x114 == 1`일 때만 retracking block에 들어간다. subtype `0x0c`는
`+0x114=0`이므로 이 분기를 건너뛴다. 현재 index의 X/Y를 현재 위치에 쓴 뒤:

- `currentIndex != finalIndex`: `+0x112 == 1`일 때만 mid-flight effect block에 들어가는데
  subtype `0x0c`는 `0`이라 건너뛴다. index를 1 올리고 `0x0040fd50`, `0x004107a0` 순으로
  visual/render 갱신한 뒤 `1` 반환
- `currentIndex == finalIndex`: subtype dispatcher를 호출하고 `0` 반환

따라서 보존 점이 `N`개면 도착까지 풀 갱신은 정확히 `N`번이다. subtype `0x0c`는 비행 중 다른
엔티티나 지형과 충돌 검사하거나 effect를 전달하는 분기에 들어가지 않는다. 이 결론은 두 control
word의 initializer mapping과 전체 subtype-relevant update path에 한정된다. 마지막 보존 점에
도착했을 때 저장된 대상 참조를 한 번 소비하는 것이 이 subtype의 충돌이다.

## 충돌과 최종 피해

도착 handler `0x0040e270`은 다음 순서로 `0x00413700`을 호출한다.

```text
attacker reference = record DWORD +0xa0
attacker owner/class candidate = record WORD +0xa4
effect kind = 9
selector/radius argument = 1
owner/side candidate = record signed BYTE +0x2e
payload = record signed WORD +0x9e
target reference = record DWORD +0x9a
stored X/Y = record signed WORD +0x82/+0x84
```

kind `9`는 범위 검색이 아니라 저장된 대상 하나를 전달한다. low-word index가 비활성이면 피해
resolver를 호출하지 않는다. index가 재사용됐지만 generation high word가 다르면
`0x00413070`이 0을 반환하지만 `0x00413b30`은 그 0을 그대로 `0x00438130`에 전달한다.
따라서 보통의 positive buffer/health 벡터는 그대로지만 signed-WORD 경계 state는 0 damage에도
clear/clamp될 수 있다. 두 실패 경로 모두 handler는 완료하고 같은 풀 갱신에서 active word가
0으로 지워진다.

정상 대상의 계산은 다음과 같다. 나눗셈은 signed 정수의 0 방향 버림이다.

```text
classPercent =
  defender class +0x80 == 4 ? 30 :
  defender class +0x80 == 5 ? 50 :
  0

rawDefense = signedWord(word(
  signed WORD [defender+0x44] + signed WORD [defender+0x50]
))
defense = signedWord(word(
  rawDefense +
  (BYTE [defender+0x83] == 1 ? trunc(rawDefense / 2) : 0)
))
if signed(defense) > 90: defense = 90

modifiedWord = signedWord(word(
  payload + trunc(payload * classPercent / 100)
))
resultWord = signedWord(word(
  modifiedWord - trunc(defense * modifiedWord / 100)
))
calculatedDamage = signed(resultWord) > 0 ? resultWord : 1
```

즉 base+modifier는 `ADD DI,word ptr [...]`에서 먼저 wrap한다. 조건부 절반은 그 signed
`DI`를 0 방향으로 나눈 뒤 case 9의 `ADD EDI,ESI` low WORD가 다시 wrap한다. class 보정 뒤
payload는 `CX`의 low WORD를 `MOVSX`로 소비하고, 마지막 최소값은 `TEST AX,AX; JG`로 결정한다.

계산 뒤 `0x00413b30`은 제거 precondition 없이 `0x00438130`을 호출한다. 이 함수의 첫 분기는
다음 raw 입력을 사용하며 사람용 명칭은 미확정이다.

```text
mode = WORD [0x007c6282]
index = signed BYTE [defender+0x38]
tableByte = BYTE [0x0082c482 + index * 0x2c10]

if mode == 1 and tableByte == 0:
  return 1  // buffer와 health를 읽거나 쓰기 전
```

`0x0043e1e0`의 첫 stack WORD command switch에서 raw 입력 `302`가 `0x0043e3ba`로 가며
mode WORD를 `0↔1`로 toggle한다. 이 생산자와 적용 소비자까지가 이 질문의 완전 입력·mutation
증거다. command 302, mode, table, signed byte의 사람용 의미와 signed index의 범위 보장은
추가로 추정하지 않는다.

독립 API는 원본 테이블 전체를 받지 않는다. `defenderSignedByte38`은 원본 주소 계산에 쓰인 raw
signed index를 기록·검증하는 입력이고, `selectedHealthApplicationTableByte`는 그 계산된 주소에서
이미 선택된 raw byte를 별도로 전달하는 입력이다. 따라서 전자가 포트 내부 테이블 조회에 다시
사용되지 않는 것은 누락이 아니라 명시적인 입력 계약이다.

gate를 통과하면 `0x00438130`은 `WORD [defender+0x90]` 완충 수치를 검사한다.

- `AX != 0`이고 signed `AX >= DX`: buffer WORD만 damage WORD만큼 감소
- `AX == 0` 또는 signed `AX < DX`: buffer를 0으로 만든 뒤 **남은 차이가 아니라 전체 damage**를 현재 체력
  `WORD +0x3e`에서 감소
- WORD subtraction 뒤 signed health가 `> 0`일 때만 값을 유지하고, 아니면 0으로 고정

따라서 raw buffer `0xffff`는 unsigned 대용량이 아니라 signed `-1`로 비교되어 damage를 흡수하지
않는다. raw health `0xffff`도 damage subtraction 뒤 signed-positive가 아니므로 0으로 clamp된다.
독립 결과는 `calculatedDamage`, `damageAppliedToBuffer`, `healthSubtractionOperand`를 분리한다.
`healthSubtractionOperand`는 원본 `SUB [health],DX`에 전달된 WORD operand이지 실제 HP delta가
아니다. 예를 들어 HP 30에서 operand 45를 빼고 0으로 clamp하면 이 값은 45이고 실제 HP 감소량은
30이다. 이 구분으로 gate 때문에 계산은 됐지만 state에는 적용되지 않은 경우와 clamp 결과를
숨기지 않는다.

## 재현 벡터

```bash
node tools/imjinrok/extract-k01-ryu-projectile-pilot.mjs --json
node --test tools/imjinrok/k01-ryu-projectile-pilot.test.mjs
node --import tsx --test packages/simulation/src/originalRyuProjectile.test.ts
```

| 벡터 | 입력 요약 | 관찰 결과 |
| --- | --- | --- |
| 정상 비행·충돌 | `(10,20)→(38,20)`, payload 45, class 4, 방어 20+10 | 경로 `(10,20),(24,20),(38,20)`, 3회 갱신, damage 41, HP `100→59`, slot 반환 |
| 짧은 경로 경계 | `(10,20)→(23,20)` | 시작점 하나, 1회 갱신 뒤 충돌 |
| 경로 error 초기값 | `(0,0)→(15,8)` | error 0에서 시작해 14번째 보존점 `(14,7)`; 2회 갱신 |
| 경로 상한·메모리 alias | `(0,100)→(3000,100)` | 160점으로 고정, `X[160]` 반복 기록 때문에 첫 점 Y가 `2996`, 마지막 점 `(2226,100)` |
| 풀 random 상태 순서 | seed `12345`, current `54321` | previous `54321`, seed·current `25813`; 레코드 순회 전에 적용 |
| 완충 우선 | payload 45, buffer 50, HP 100 | buffer `50→5`, HP 유지 |
| 적용 table gate 실패 | mode `1`, raw signed index `3`, 이미 선택된 raw table byte `0` | calculated 45, buffer 적용 0, health SUB operand 0, buffer·HP 무변경, return `1` |
| defense ADD WORD wrap | defense `32767+1`, payload 45 | raw defense `-32768`, calculated 14790, HP `20000→5210` |
| 조건부 절반 WORD wrap | defense `-32768`, flag `1`, payload 45 | half `-16384`를 더한 low WORD `16384`가 cap 90, calculated 5 |
| class 5 payload CX wrap | payload `32767`, class 5 | 보정 low WORD `-16386`, `TEST AX/JG` 실패, calculated 1 |
| signed buffer 경계 | buffer `0xffff`, payload 45, HP 100 | signed `-1 < 45`, buffer 0, HP `100→55` |
| signed health 경계 | buffer 0, HP `0xffff`, payload 45 | WORD subtraction 뒤 signed-positive 아님, HP 0, return `0` |
| 체력 0 경계 | payload 45, buffer 10, HP 30 | buffer 0, health SUB operand 45, 실제 HP delta 30, HP 0 |
| 대상 소멸 | low-word index 비활성 | effect 미전달, damage 0, slot 반환 |
| 대상 세대 불일치 | index 활성, generation 불일치 | effect 진입 뒤 계산 0, HP 유지, slot 반환 |
| 세대 불일치+signed health | generation 불일치, buffer 0, HP `0xffff` | calculated 0이어도 health 적용 호출, signed clamp로 HP 0 |
| 풀 고갈 | slot 1..99 모두 active | allocator 0, 생성 없음 |
| 방어·class 경계 | class 5, defense 90 | modified 67, damage 7 |

추출기는 EXE·Ghidra 산출물 해시, subtype 표 인수, dispatcher의 전체 jump table,
생성·도착·반환 call order, target 좌표 직접 읽기, control-word mapping과 disabled branch,
kind `9` WORD 수식, health gate·signed 적용 분기와 원본 바이트 anchor 27개를 강제한다.
필수 call edge와 분석 함수는 각각 25개다. 변조된 subtype 설정과 다른
EXE 해시의 jump-table 산출물을 거부한다. simulation 테스트는 추출기가 내는 같은 16개
원본-input 벡터를 직접 소비한다.

## 현재 구현과 차이

`packages/simulation/src/originalRyuProjectile.ts`는 다음 좁은 정적 확정·재현 단위를 제공한다.

- free slot `1..99` 선택과 풀 고갈 결과 0
- 풀 순회 전 전역 random 상태 갱신 순서
- 보수적인 port accepted subset `0..32767` 좌표 경로, 14-step 샘플, 160-point record alias
- effect kind `9`의 WORD wrap, signed 분기, 최소 피해 수식
- 대상 부재·세대 불일치, raw health gate, signed buffer→health 적용 순서

현행 `advanceUnitCombat`은 유성룡을 프로젝트 임시 수치인 damage 10, range 1.5,
cooldown 18의 즉시 공격으로 처리한다. 이를 교체하려면 아직 미확정인 원본 좌표·시간 변환과
공격 전 대상 검색·사거리가 필요하다. 현재 모듈을 임의의 24 Hz 상수로 연결하지 않았으므로
실제 플레이 전투 구현 상태는 계속 `프로토타입`, 이 문서가 증명한 독립 계산 단위만 `부분 이식`이다.

## 남은 불확실성과 다음 질문

- `entity+0x4a` payload 보정값의 생산자와 전체 의미
- 원본 풀 호출은 accepted scheduler step당 1회지만 message-loop·가변 millisecond gate를
  프로젝트 24 Hz로 옮길 exact mapping
- attacker `+0x6a/+0x6c`와 active target `+0x32/+0x34` 좌표의 생산자·range guard 및
  호출자가 전달할 수 있는 전체 signed-WORD 범위
- signed-word 투사체 좌표와 프로젝트 world/grid 좌표의 정확한 변환
- subtype 설정의 나머지 6개 word 사람용 의미
- raw command `302`, mode `0x007c6282`, table `0x0082c482`, defender `+0x38`의 사람용 의미와 signed index 범위 보장
- 생성 직전 `0x0041a880`이 조건부 호출하는 세 함수의 사람용 의미와 global/coordinate-indexed 간접 mutation
- defender `+0x80` class와 `+0x83` flag의 사람용 명칭
- 대상 검색, 공격 전 유효성, 자동 탐색과 정확한 사거리 경계
- 피격 반응, 사망 처리, 대상 참조 정리와 표시 수명

다음 독립 질문은 브리프 후보 2인 “공격 전 대상 유효성·탐색·사거리 경계”가 적합하다. 이 질문을
완료한 뒤 원본 좌표 변환·틱 시간 단위와 결합해야 subtype `0x0c`를 실제 fixed-tick 전투 루프에
추정 없이 연결할 수 있다.
