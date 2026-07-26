How often is original projectile-pool updater 0x00447360 invoked, what static scheduling/call-chain controls that cadence, and can that cadence be mapped exactly to this project's fixed simulation tick without an inferred multiplier?

# K01 투사체 풀 갱신 cadence

기준일: 2026-07-26

## 판정

- 분석 상태: `정적 확정` — 원본 idle message loop에서 `0x00447360`까지의 호출·거부 경로와
  raw 고정폭 시간 입력에 한정
- 재현 상태: `재현 완료` — selector, feedback producer, 50-step 보정, DWORD wrap,
  전체 scheduler direct-call 순서, 정상·경계·거부 입력 15개
- 구현 상태: `이식 보류` — 24 Hz fixed tick에 연결할 정확한 원본 규칙이 없음

`0x00447360`의 direct caller는 `0x00447bc0` 안의 `0x00447cb8` 하나뿐이다. scheduler
attempt가 모든 gate를 통과하면 DWORD `0x007c5f80`을 한 번 증가시키고 풀 갱신기를 정확히 한
번 호출한다. 어느 gate에서든 거부되면 호출 수는 0이다. 풀 갱신기 한 번은 slot 0~99를 한 번
앞으로 순회하며, 지연분을 여러 갱신으로 보충하는 loop는 scheduler에 없다.

이는 “초당 고정 횟수”를 뜻하지 않는다. 원본은 Windows message가 없을 때만 `timeGetTime`을
샘플하고, 선택·보정되는 millisecond 임계값과 두 개의 별도 raw gate를 통과시킨다. 따라서
실제 초당 호출 횟수나 고정 FPS는 정적으로 확정되지 않는다. 기본 interval 50 ms와 프로젝트
24 Hz의 한 tick `125/3` ms의 비는 `6/5` tick이며 정수 배율이 아니다. 더구나 원본은 고정
callback이 아니라 message-loop polling이므로 accumulator·resampling·배율 중 어느 것도
원본 CFG에서 나오지 않는다. 기존 독립 유성룡 투사체 포트는 실제 simulation loop와 계속
분리한다.

## 고정 입력과 산출물

| 항목 | 값 |
| --- | --- |
| 원본 EXE SHA-256 | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `seeds.json` SHA-256 | `88d91d582ac0b864cb3f0448e2600df16878351bde1c7c91e6e96465df2b49f9` |
| `references.json` SHA-256 | `df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c` |
| `jump-tables.json` SHA-256 | `0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f` |
| 독립 추출기 | `tools/imjinrok/extract-k01-projectile-pool-cadence.mjs` |
| 재현 테스트 | `tools/imjinrok/k01-projectile-pool-cadence.test.mjs` |

추출기는 원본 EXE에서 PE import directory도 직접 읽어 IAT `0x004b7170`이
`KERNEL32.dll!GetModuleHandleA`, `0x004b7244`가 `USER32.dll!PeekMessageA`,
`0x004b7270`이 `WINMM.dll!timeGetTime`임을 검증한다. 20개 필수 direct call edge와
21개 code anchor는 VA, file raw offset, instruction bytes를 함께 강제한다.

## 함수 경계와 호출 규약

표의 raw 범위는 이 PE에서 VA에서 ImageBase를 뺀 file offset과 같다.

| VA / raw 범위 | CFG / 명령어 | 호출 규약·출력 | cadence 역할 |
| --- | ---: | --- | --- |
| `0x004ae539-0x004ae623` / `0x000ae539-0x000ae623` | 6 / 75 | PE entry | `0x004ae602`에서 main loop 호출 |
| `0x0045f9c0-0x004607ac` / `0x0005f9c0-0x000607ac` | 209 / 801 | stack 인수 16 bytes를 `ret 0x10`으로 정리 | message drain, clock sample, state switch |
| `0x00447bc0-0x00447cfa` / `0x00047bc0-0x00047cfa` | 21 / 75 | 인수 없음, `AX=0` | 모든 scheduler gate와 유일한 pool call |
| `0x004464c0-0x0044735e` / `0x000464c0-0x0004735e` | 224 / 988 | 인수 없음, `EAX` raw gate 결과 | 정확히 `1`이면 scheduler 거부 |
| `0x00447e10-0x00447ec8` / `0x00047e10-0x00047ec8` | 18 / 66 | 인수 없음, `EAX=0/1` | interval 계산과 millisecond gate |
| `0x00477f50-0x00478246` / `0x00077f50-0x00078246` | 45 / 231 | 인수 없음, `AL`을 zero/nonzero로 반환 | 조건부 command-readiness gate |
| `0x0043f580-0x0043f5c6` / `0x0003f580-0x0003f5c6` | 8 / 20 | `ECX=0x00634ab8`, `EAX` interval | mode·selector별 base 선택 |
| `0x0043f560-0x0043f573` / `0x0003f560-0x0003f573` | 1 / 5 | `thiscall`형, stack DWORD를 `ret 4` | selector DWORD 기록 후 interval 갱신 |
| `0x00443080-0x00443089` / `0x00043080-0x00043089` | 1 / 3 | `cdecl`, stack DWORD | accepted step 20 timestamp 초기화 |
| `0x00443090-0x004430a6` / `0x00043090-0x000430a6` | 3 / 8 | 인수 없음 | timestamp/feedback record 표 reset |
| `0x004430b0-0x004430e4` / `0x000430b0-0x000430e4` | 3 / 15 | `cdecl`, stack DWORD 2개 | step 21 이후 timestamp history 갱신 |
| `0x004430f0-0x00443146` / `0x000430f0-0x00043146` | 12 / 30 | `cdecl`형, stack DWORD 3개 | raw record 비교로 feedback `-1/+1` 생산 |
| `0x00446420-0x004464be` / `0x00046420-0x000464be` | 9 / 33 | 인수 없음 | base interval DWORD를 50으로 reset |
| `0x00447360-0x00447599` / `0x00047360-0x00047599` | 35 / 156 | 인수 없음, `AX=0` | slot 0~99 한 번 순회 |
| `0x00473b50-0x0047418b` / `0x00073b50-0x0007418b` | 47 / 498 | stack record 인수 | 두 message-record case에서 feedback producer 호출 |

`0x004ac490-0x004ac49f`는 Ghidra가 독립 함수로 만들지 않은 짧은 code island다. 원본 bytes는
`WORD [ECX+0x10]`을 sign-extend해 `0x0043f560`에 전달함을 직접 검증한다. 이 raw selector의
사람용 설정명과 K01 한 실행에서 선택되는 값은 확정하지 않는다.

## 완전한 호출·실패 순서

1. PE entry는 `0x004ae590`에서 ESI를 0으로 만들며, 전체 entry instruction listing에는
   `0x004ae5fa`까지 ESI를 직접 다시 쓰는 명령이 없다. 따라서 `0x004ae5fa`의 push는
   `GetModuleHandleA(NULL)` 인수이고, IAT call 반환 module handle을 push한 뒤
   `0x004ae602`에서 `0x0045f9c0`을 호출한다.
2. main loop의 `PeekMessageA(..., PM_NOREMOVE)`가 message 존재를 알리면
   GetMessage/TranslateMessage/DispatchMessage 뒤 loop 처음으로 돌아간다. 이 iteration에는
   update clock도 scheduler도 실행하지 않는다.
3. idle 차단 global과 main state guard를 통과한 iteration만 `timeGetTime`의 DWORD
   millisecond 값을 `0x00882e04`에 쓴다.
4. `0x0045fd1e`에서 ESI를 1로 초기화한 뒤 main-state switch에 들어간다. signed-WORD
   state 3은 `0x0045fd5d`에서 scheduler를 호출한다. state 23은
   `WORD 0x00c06e20 == SI`, 즉 1일 때만 `0x004602e4`에서 호출한다. 이 두 callsite가
   `0x00447bc0`의 전체 direct caller다.
5. scheduler는 먼저 `ECX=0x004cafb0`으로 `0x00406af0`을 무조건 호출한다. accepted-step
   counter `0x007c5f80`이 0이면 현재 milliseconds를 `0x00c06db8`에 복사한다.
6. 특수 전환 guard `WORD 0x00c06e30 == 1 && main state == 3`이면 인수 2를 놓고
   `0x0046f870`, raw pointer `0x005e20b8`을 놓고 `0x004400b0` 순으로 호출한다.
   main state를 `0x16`으로 쓴 뒤 ordinary gate 전에 반환한다.
7. ordinary path는 `0x004464c0`을 호출한다. 반환이 정확히 1이면 반환한다.
8. `WORD 0x00c06e2e == 0`이면 pre-clock raw 상태 준비에 들어간다.
   `DWORD 0x00552770 == 0`일 때만 `0x00447ed0`을 호출한 뒤 그 DWORD를 1로 쓰고,
   `WORD 0x00552790=0`, `ECX=0x00bcbd80` 상태로 `0x0043dc90`을 호출한다.
9. 위 조건과 무관하게 ordinary path는 `ECX=0x00abfff0`으로 `0x004676e0`을 호출한
   직후 `0x00447e10` clock gate를 호출한다. clock 반환이 0이면 반환한다.
10. `WORD 0x00c06e2e == 0`일 때만 `0x00477f50`을 호출하며, 그 반환이 0이면 반환한다.
   이 WORD가 0이 아니면 readiness call 자체를 건너뛴다.
11. 승인되면 `DWORD 0x007c5f80`을 wrap 증가시킨다. 새 값 20은 `0x00443080`, 21 이상은
   `0x004430b0`을 pool보다 먼저 호출한다.
12. `0x00447cb8`에서 `0x00447360`을 한 번 호출한다.
13. pool 이후 `DWORD 0x00634c90 == 1`이면 stack 주소를 IAT `0x004b71c4` call에
    전달하고, call 뒤 stack의 두 raw WORD를 `0x00aa4012`, `0x00aa4010`에 쓴 뒤
    `0x0046feb0`을 호출한다. 이 조건부 post-pool side effect가 끝난 뒤 모든 accepted
    path가 `DWORD 0x007c5f84`를 증가시킨다.

큰 pre-update 함수와 command-readiness 함수의 전체 seed CFG와 반환 branch는 산출물에
포함했다. 다만 cadence 재현 API는 그 내부 게임 상태를 사람용 의미로 추측하지 않고 호출자가
관찰하는 raw 반환값을 독립 입력으로 받는다. 위에서 추가한 `0x00406af0`, `0x0046f870`,
`0x004400b0`, `0x00447ed0`, `0x0043dc90`, `0x004676e0`, `0x0046feb0`도 raw 조건과
호출 순서만 확정했으며, 큰 callee 내부 의미를 복원했다고 주장하지 않는다. 앞의 여섯 호출은
ordinary clock gate 이전 상태 또는 특수 조기 반환을 제어하고, 마지막 `0x0046feb0`은
pool 이후 조건부 부수 효과다.

## millisecond interval 산술

reset base는 DWORD 50이다. `WORD 0x00c06e20 == 1`이면 selector와 무관하게 base를
반환한다. 그 외에는 unsigned DWORD selector `0x00634acc`가 다음 값을 고른다.

| selector | base interval |
| ---: | ---: |
| `0` | `base + 14` = 64 ms |
| `1` | `base + 10` = 60 ms |
| `2` | `base` = 50 ms |
| `3` | `base - 10` = 40 ms |
| unsigned `>3` | `base - 20` = 30 ms |

모든 합·차는 x86 DWORD wrap이다. `0x00447e10`은 raw feedback DWORD
`0x0054a4a8`을 base에 더해 `0x00552794`에 저장하고 feedback을 0으로 만든다.
이 feedback의 writer `0x004430f0`은 message-record consumer `0x00473b50`의 callsite
`0x00473c7a`, `0x00473d1b`에서 호출된다. history/record guard가 통과하면 선택된 timestamp와
raw comparison input을 unsigned 비교해 큰 쪽이면 DWORD `0xffffffff`(-1), 작은 쪽이면
`1`을 쓰고, 같거나 guard가 실패하면 기존 값을 유지한다. message record의 사람용 protocol
의미는 붙이지 않는다.
accepted-step counter를 unsigned `DIV 50`한 나머지가 0이면 signed WORD
`0x00552788`을 읽는다.

- counter `>10`: effective가 unsigned `base+20`보다 작을 때만 1 증가
- counter `<4`: effective가 unsigned base 이상일 때만 1 감소
- counter `4..10`: 변경 없음

이 50-step 분기 뒤 counter WORD는 0이 된다. 이는 “50 ms마다”가 아니라 accepted step
번호가 50의 배수일 때다.

clock gate는 `elapsed = current - lastAccepted`를 unsigned DWORD로 계산한다.

- `elapsed < interval`: 정상 positive interval에서는 거부하고 timestamp를 유지한다. extractor는
  sign bit가 선 interval까지 원본의 signed `JGE` fallback을 재현한다.
- `interval <= elapsed < 2*interval`: 한 번 승인하고 `lastAccepted += interval`.
- `elapsed >= 2*interval`: 한 번만 승인하고 `lastAccepted = current - interval`.

두 번째와 세 번째 판정도 실제로는 `excess = elapsed - interval`과 unsigned 비교로 이루어져
DWORD overflow를 그대로 따른다. backlog가 커도 호출을 여러 번 반복하지 않는다.

## 재현 벡터

독립 테스트는 다음 기대값을 코드에 고정한다.

| 벡터 | 기대 결과 |
| --- | --- |
| selector `0..4` | `64, 60, 50, 40, 30` ms |
| mode 1, selector `0xffffffff` | 50 ms |
| step 50, periodic 11 | 50→51 ms |
| step 100, periodic 3 | 50→49 ms |
| feedback selected 101/99/100, input 100 | `-1`, `+1`, 기존 값 유지 |
| current 1049, last 1000, interval 50 | 거부, last 1000 |
| current 1050, last 1000, interval 50 | 승인, last 1050 |
| current 1120, last 1000, interval 50 | 승인 한 번, last 1070 |
| current `0x22`, last `0xfffffff0`, interval 50 | wrap elapsed 50, 승인 |
| pre-update return 1 | pool call 0 |
| readiness return 0, mode 0 | pool call 0 |
| accepted counter 19→20 | history initialize 뒤 pool call 1 |
| mode 0, pre-clock init 0, accepted 20번째 step, post mode 1 | `0x406af0→0x4464c0→0x447ed0→0x43dc90→0x4676e0→0x447e10→0x477f50`, `0x443080→0x447360`, IAT call→`0x46feb0` |
| queued message | clock sample 0, scheduler attempt 0 |
| state 23, mode 0 | clock sample 1, scheduler attempt 0 |

추가 focused test는 raw base wrap, feedback `-1`/`0xffffffff`, delayed timestamp 보정,
interval sign-bit fallback, clock gate 실패, early transition, boolean·DWORD 범위 오류를
검증한다.

## 24 Hz integration gate와 남은 불확실성

원본에서 정적으로 확정한 것은 accepted original step당 pool call `1`, rejected attempt당
`0`이다. wall-clock 쪽은 millisecond clock과 현재 raw interval 규칙까지만 확정했다.
실제 FPS는 message availability와 gate state 때문에 고정되지 않는다.

프로젝트 24 Hz와 단순 비교하면 nominal 50 ms는 `50 × 24 / 1000 = 6/5` tick이다.
selector의 64/60/50/40/30 ms 어느 것도 정수 tick 수가 아니다. raw feedback과 periodic
보정은 interval을 더 바꿀 수 있다. 그러므로 exact integer multiplier는 없으며, 현재 증거로
어떤 resampling 정책이 원본과 같다고 선택할 수도 없다. `packages/simulation`은 수정하지 않았다.

남은 불확실성은 다음과 같다.

- 특정 K01 실행에서 raw selector가 어떤 값으로 생산되는지
- pre-update/readiness gate 내부 상태의 사람용 의미와 상위 producer 전체
- feedback DWORD와 periodic WORD를 만드는 전체 상위 상태의 사람용 의미
- message arrival 분포를 포함한 실제 wall-clock accepted-step 빈도
- 24 Hz에 연결할 원본 기반 accumulator·phase·resampling 규칙

다음 좁은 질문은 root brief의 우선순위대로 “공격 전 대상 유효성, 자동 대상 획득, 정확한 사거리
경계는 무엇인가?”다. 24 Hz phase/resampling 부재는 이 질문의 integration uncertainty와
명시적인 port-policy gate로 유지하며, 다음 정적 메커니즘 질문의 우선순위를 바꾸지 않는다.
