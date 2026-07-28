# K01 표준 미션 진입 timer reset

For standard K01 mission entry, which exact call chain resets DWORD 0x0084373c/0x00843740, how does FUN_00460ba0's zero fill cover both timer addresses before the stage-1 K01 map initializer runs, and what are the exact range/boundary/order semantics?

## 범위와 상태

- 분석 상태: `정적 확정` — main state 1 진입에서 broad DWORD zero fill을 거쳐 stage 1
  K01 map 문자열을 선택하는 순서와 `[start,end)` 범위
- 재현 상태: `재현 완료` — timer nonzero→zero, start/last/end 경계, 주소·index,
  stage 1/비-1, 폭·정렬·stale/tampered 실패 벡터
- 구현 상태: `없음` — 원본 raw clock·result·identity와 프로젝트 24 Hz·generic policy 사이의
  exact mapping이 없으므로 integration gate를 닫았다.

이 문서는 **표준 main-loop state 1 진입 경로**만 다룬다. 다른 reset 진입점의 존재 여부,
result timer의 초 단위 의미, `0x00445770/0x004457d0`의 사람용 의미, K01 map을 읽은 뒤의
전체 미션 초기화는 범위 밖이다.

## 원본과 canonical 재현

| 입력 | SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |

독립 추출기는
[`extract-k01-mission-timer-reset.mjs`](../../../tools/imjinrok/extract-k01-mission-timer-reset.mjs),
집중 테스트는
[`k01-mission-timer-reset.test.mjs`](../../../tools/imjinrok/k01-mission-timer-reset.test.mjs)다.
EXE/source hash, 5개 함수 range·instruction hash·CFG, 6개 direct call edge, 11개 canonical
instruction, 7개 byte anchor, main/stage jump table, K01 문자열·reference와 timer direct
reference count를 함께 검사한다. stale source, 누락 seed, 변조된 instruction·call·function
hash·jump table·reference·string·EXE는 오류로 중단한다.

네 semantic site seed를 추가한 canonical 분석을 깨끗한 임시 Ghidra 프로젝트에서 두 번
생성했으며 두 실행의 해시는 같았다.

| 산출물 | 두 실행의 SHA-256 |
| --- | --- |
| `SHA256SUMS` | `b74f06eca72e5d22695a907bd20b9f4dd459ead0d7224b0f05dbfbed9540bb3d` |
| `manifest.json` | `f5f2d972d9447ecf052ce71359f02874bc081c63c19ff1fa5783f2fd62ed48dd` |
| `seeds.json` | `8e7c8821e9c84c5d0877bb977b119b3b878271502b36bf75e7426b570507bfb7` |

canonical count는 seed 주소 149개, 포함 함수 148개다.

## 함수와 정적 근거

| 함수·범위 | CFG / 명령어 | instruction SHA-256 | 이 질문의 raw 역할 |
| --- | ---: | --- | --- |
| `0x0045f9c0-0x004607ac` | 209 / 801 | `b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24` | main state switch와 state 1 진입 block |
| `0x00460ba0-0x00460e20` | 17 / 144 | `248c49519c1c692efde84ee3aac2159912097dca7ed46fe3f93ab7b7048b748e` | ECX base에서 128,682 DWORD zero fill 후 나머지 초기화 |
| `0x0048dbe0-0x0048dda9` | 21 / 147 | `f38e4577cf36c44f26097d94e200321d2a9bc6b0aa1696d572e40a600e7f7217` | reset base 전달 뒤 stage WORD를 map dispatcher에 전달 |
| `0x0048d410-0x0048d594` | 31 / 110 | `55e9e403f208ea2de9f779cb5176d11db85b33758a30d2310d14504dabd0c13d` | signed stage switch; stage 1에서 K01 source copier 호출 |
| `0x0048d740-0x0048d768` | 1 / 20 | `9cb35ae658845161b05e2ea647d46fd8a70b410856ae056859458c0015ff235e` | `stagemap\k01.map\0` 길이를 구해 ECX destination으로 복사 |

추가한 seed는 함수 시작을 새로 주장하는 주소가 아니라 다음 의미 있는 함수 내부 지점이다.

| site | label | canonical containing function |
| ---: | --- | ---: |
| `0x00460baf` | `mission-session-zero-fill` | `0x00460ba0` |
| `0x0048dbe4` | `mission-entry-reset-base` | `0x0048dbe0` |
| `0x0048d42b` | `k01-stage-map-dispatch` | `0x0048d410` |
| `0x0048d744` | `k01-stage-map-source-copy` | `0x0048d740` |

## 표준 state 1의 exact order

main switch `0x0045fd56`은 current raw state에서 1을 뺀 label을 사용한다. canonical
jump table의 label 0, 즉 raw state 1은 `0x004600cb`로 간다.

1. `0x004600cb`: `0x00445770` 호출
2. `0x004600d0`: `FUN_0048dbe0` 호출
3. `0x0048dbe4`: `ECX=0x007c5ed8`
4. `0x0048dbe9`: `FUN_00460ba0` 호출
5. `0x00460ba3`: `ESI=ECX`
6. `0x00460ba6`: `ECX=0x0001f6aa`
7. `0x00460bab`: `EAX=0`
8. `0x00460bad`: `EDI=ESI`
9. `0x00460baf`: `REP STOSD`
10. `FUN_0048dbe0`의 중간 raw 초기화가 계속된다.
11. `0x0048dc4c`: `WORD 0x0088afcc`를 AX로 읽고 `0x0048dc5b`에서 push
12. `0x0048dc68`: `ECX=0x00abf068`
13. `0x0048dc6d`: `FUN_0048d410(stage WORD)` 호출
14. stage 1 case `0x0048d429`는 `0x0048d42b`에서 `FUN_0048d740` 호출
15. `FUN_0048d740`은 `0x004c31c8`의 17-byte `stagemap\k01.map\0`을 ECX destination에 복사
16. `FUN_0048dbe0` 반환 뒤 `0x004600d5`가 `0x004457d0` 호출
17. `0x004600da`가 current state WORD를 DI에서 기록

따라서 broad zero fill은 stage WORD read와 stage-specific map dispatch보다 앞선다.
`0x00445770`, `0x004457d0`과 `FUN_0048dbe0`의 다른 큰 초기화 block에는 이 질문만으로
사람용 이름을 붙이지 않는다.

## `REP STOSD` 범위와 경계

원본 prefix의 식은 다음과 같다.

```text
start        = 0x007c5ed8
dwordCount   = 0x0001f6aa
byteLength   = dwordCount * 4 = 0x0007daa8
endExclusive = start + byteLength = 0x00843980
covered      = start <= alignedAddress < endExclusive
offset       = alignedAddress - start
dwordIndex   = offset / 4
```

즉 정확한 byte interval은 `[0x007c5ed8, 0x00843980)`이다.
`0x0084397c`는 마지막으로 지워지는 DWORD이고 `0x00843980`은 지워지지 않는다. exclusive
end를 cleared address라고 표현하지 않는다.

| raw address | offset | DWORD index | 이 질문의 제한된 표기 |
| ---: | ---: | ---: | --- |
| `0x00843738` | `0x0007d860` | `0x0001f618` | active count 포함 DWORD |
| `0x0084373c` | `0x0007d864` | `0x0001f619` | win timer |
| `0x00843740` | `0x0007d868` | `0x0001f61a` | loss timer |
| `0x00843744` | `0x0007d86c` | `0x0001f61b` | 인접 raw DWORD |
| `0x00843748` | `0x0007d870` | `0x0001f61c` | 인접 raw DWORD |
| `0x008438dc` | `0x0007da04` | `0x0001f681` | K01 trigger flag를 포함하는 raw DWORD |

timer가 `0xffffffff`를 포함해 어떤 DWORD bit pattern이든 이 진입의 `REP STOSD` 뒤에는 0이다.
`0x008438dc`도 이 범위에서 incidental mission-entry zero가 되지만, 이것만으로 trigger flag의
전체 reset lifecycle이나 minimap enable/disable을 증명하지 않는다.

## stage 경계

`FUN_0048d410`은 stack의 stage WORD를 `MOVSX`하고 switch한다. canonical table에서 stage 1만
`0x0048d429`로 가 K01 copier를 호출한다.

- stage 1: broad reset 뒤 `stagemap\k01.map` copy
- stage 0, 2와 signed/unsigned WORD 극값: broad reset은 이미 실행됐지만 K01 copier
  `0x0048d740`을 호출하지 않음; destination의 최종 값은 이 재현에서 `unknown`으로 유지

두 번째 문장은 다른 stage가 아무 초기화도 하지 않는다는 뜻이 아니다. 이 질문은 K01 copier의
실행 여부만 구분하며, 다른 stage case의 map source와 공통 후속 초기화는 해석하지 않는다.
합성 API도 비-stage-1에 `mapDestinationAfterKnown=false`, `mapDestinationAfter=null`을
반환하며 입력 destination이 유지된다고 주장하지 않는다.

## direct timer reference와 indirect range write

canonical whole-binary direct reference count는 다음과 같다.

| timer | direct refs | direct WRITE refs |
| --- | ---: | ---: |
| `0x0084373c` | 20 | 9 |
| `0x00843740` | 70 | 33 |

`0x00460baf`는 immediate timer 주소를 operand로 쓰지 않고 EDI부터 연속 범위를 쓰므로
`references.json`의 timer direct WRITE로 나타나지 않는다. 추출기는 이 mission-entry chain의
네 함수에 두 timer direct reference가 0개임과 동시에 수학적으로 두 주소가 `REP STOSD`
범위 안에 있음을 각각 검증한다.

이 구분은 mission-entry reset을 증명하지만, whole binary에서 다른 indirect writer가 없다는
주장은 아니다. direct writer들의 모든 의미나 전역 유일성도 이 문서에서 확정하지 않는다.

## 독립 재현

합성 재현은 500 KiB가 넘는 원본 전역 영역을 가짜 byte array로 만들지 않는다. 관심 DWORD
주소와 prevalue만 넘기는 sparse replay가 각 주소의 coverage·offset·index를 계산하고, 범위
안이면 0, 밖이면 기존 bit pattern을 유지한다.

고정 벡터:

- start `0x007c5ed8`, win/loss timer, trigger flag-containing DWORD
- last covered `0x0084397c`, excluded `0x00843980`
- win/loss timer `0xffffffff→0`
- stage 1: zero fill 뒤 K01 map copy exact event order
- stage `0/2/0x7fff/0x8000/0xffff`: zero fill, K01 copier 미호출, destination 결과 unknown
- misaligned start/address, unsigned 폭 위반, range overflow, duplicate sparse address
- stale source, 누락 function, 변조 instruction·jump table·timer reference·string·EXE

## 현재 프로젝트와 integration gate

원본 result clock과 raw global tick의 초·24 Hz 변환, original result identity와 generic campaign
state, raw map/identity/policy의 exact mapping이 없다. 따라서 packages/apps/UI/scenario를
수정하지 않았다.

향후 연결이 필요해도 generic superset을 좁히지 않는 isolated opt-in original-K01 policy여야
하며, 동일 원본 벡터를 프로젝트 경계에서 재현할 exact mapping이 먼저 필요하다.

## 남은 불확실성과 다음 질문

- 이 broad initializer에 도달하는 표준 state 1 밖의 모든 진입·reset topology
- result clock `0x00882e04`, raw global tick `0x007c5f80`과 timer의 시간 단위 관계
- final destination `0x140/0x64/0x10/0x20/raw WORD`별 후속 lifecycle
- 원본 class/map/result identity를 프로젝트 generic policy에 연결하는 exact mapping

사용자가 설명한 “완성 봉화가 하나라도 있으면 미니맵 enable, 마지막 봉화 제거 시 disable”은
별도 `user-reported/unverified` 질문이다. 이 문서의 incidental `0x008438dc` zero와 연결하지
않는다.
