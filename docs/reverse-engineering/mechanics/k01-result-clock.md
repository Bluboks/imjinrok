# K01 result clock와 script flag source

## 질문과 범위

K01 main idle loop가 어떤 raw DWORD를 result clock으로 갱신하는지, 그 값의 단위가 무엇인지,
그리고 K01 script context의 loaded/run flag가 어떤 원본 함수와 call chain에서 나오는지를
한정해 기록한다. 이 문서는 원본 source evidence와 재현 가능한 bounded replay만 다룬다.

- 분석 상태: `정적 확정` — `0x00882e04`의 단일 direct WRITE, `timeGetTime` import/IAT,
  main queue/gate/sample order, K01 script flag source chain과 cleanup flag projection
- 재현 상태: `재현 완료` — queue/main-gate suppression, unsigned DWORD wrap, strict timer boundary,
  distinct raw tick gate, successful/failed loader, busy start, completed-record stop vectors
- 구현 상태: `bounded product adapter` — production은 이 raw millisecond source를
  `policies.result.clockMilliseconds`로 보존하고, local transport의 real elapsed sample과
  headless deterministic adapter를 별도 product policy로 연결한다. project epoch, pause policy,
  24 Hz headless cadence는 [K01 scenario policy adapter](../../development/k01-scenario-policy-adapter.md)에
  기록하며 native cadence로 주장하지 않는다. full script/compositor/scheduler parity는 범위 밖이다.

`0x00882e04`는 `WINMM.dll!timeGetTime`이 반환한 DWORD를 보관한다. 이는 raw global tick
`0x007c5f80`와 별개의 값이다.

## 원본과 독립 재현

| 입력 | bytes | SHA-256 |
| --- | ---: | --- |
| `original/imjinrok2/imjinrok2.exe` | `843833` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `analysis/generated/imjinrok2/functions.json` | `1468333` | `7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e` |
| `analysis/generated/imjinrok2/references.json` | `17206569` | `f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5` |
| `analysis/generated/imjinrok2/seeds.json` | `9436451` | `386b0f4e86c3376f34fe2b50fedb7e45b762c30784d4ebcc0387aa6f431811b2` |

추출기와 테스트는 다음과 같다.

```bash
node tools/imjinrok/extract-k01-result-clock-evidence.mjs
node --test tools/imjinrok/k01-result-clock-evidence.test.mjs
```

생성 fixture는
[`analysis/fixtures/k01-result-clock-evidence.json`](../../../analysis/fixtures/k01-result-clock-evidence.json)이며,
추출기는 source SHA, generated artifact full-file SHA, exact function metadata, raw ranges, byte
anchors, call edges, PE import names와 IAT를 먼저 검증한다. stale source, unknown import, malformed
PE import boundary, tampered artifact는 오류로 중단한다.

## 함수와 raw 범위

| 함수·범위 | 명령어 | instruction SHA-256 | 이 질문의 역할 |
| --- | ---: | --- | --- |
| `FUN_0045f9c0` `0x0045f9c0-0x004607ac` | 801 | `b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24` | main queue/gate, result-clock sample, signed state dispatch |
| `FUN_00482340` `0x00482340-0x0048238c` | 22 | `0f33a0727962c95b37e0fc232b1b921a85fe450b61dc295f73e316bc9cbdc35d` | run helper; `+4`/`+8` preconditions and run flag write |
| `FUN_00482390` `0x00482390-0x00482393` | 2 | `0f019498e796041d4448ab24729aef7f664c3ce9d648fa54ddbe4eefc6a502ab` | read context `+8` |
| `FUN_004823a0` `0x004823a0-0x004823a3` | 2 | `89917ca0f56c10aa67814cd5318e7dc1c9f1dd3e7b94e915eda062024850563e` | read context `+4` |
| `FUN_004823d0` `0x004823d0-0x004824b6` | 78 | `bf77645626bb9b349beb9538b839627be0d0a05a4bf409a552793ca726c9e7c5` | conditional run stop and Sleep tail |
| `FUN_004824c0` `0x004824c0-0x0048258b` | 62 | `95f05a63f15937b7c68e7af68969cb1af50005fe2d2030b9319268fb19961281` | completed-record readiness consumer |
| `FUN_00482180` `0x00482180-0x004822f4` | 114 | `acf831ee8a608862cb7c64595f3a90b7799a967b1c9b7b38b0da9fe6e1b20f8c` | K01 script loader success/failure return |
| `FUN_004888b0` `0x004888b0-0x00488935` | 27 | `c1d0633e74c828fdec79d86d00a83f2b50873092e4f1dc6ed3e58ae1d88fa2ab` | actual K01 context consumer chain |
| `FUN_00482010` `0x00482010-0x00482146` | 101 | `f498d313ccfd6c08016c2e612d0b579736fe8ada1348dc6d5a8fd4630a174ebd` | loaded-context cleanup and `+4` clear |
| `FUN_0048a5c0` `0x0048a5c0-0x0048a878` | 181 | `c2a0e73fb0e208846f77187fa11310cdd4177f62c6fbd61732d822f513115791` | K01 loader/start/getter callsites |

검증한 raw byte ranges는 main queue/gate `0x0045fc88-0x0045fd02`, main sample
`0x0045fd02-0x0045fd36`, state dispatch `0x0045fd36-0x0045fd63`, run helper
`0x00482340-0x0048238d`, stop helper `0x004823d0-0x004824b7`, record consumer
`0x004824c0-0x0048258c`, loader `0x00482180-0x004822f5`, K01 consumer
`0x004888b0-0x00488936`, cleanup `0x00482010-0x00482147`다. 각 범위의 digest는 fixture에
있으며 추출기가 직접 계산한다.

## PE import와 main sample order

추출기는 import 문자열을 찾는 대신 PE import descriptor, lookup thunk, FirstThunk를 순서대로
읽어 exact DLL/name/IAT를 검증한다.

| DLL | name | hint | lookup RVA | IAT VA | 의미 |
| --- | --- | ---: | ---: | ---: | --- |
| `WINMM.dll` | `timeGetTime` | 152 | `0x000b9996` | `0x004b7270` | DWORD milliseconds since system start |
| `KERNEL32.dll` | `Sleep` | 662 | `0x000b9360` | `0x004b7168` | stop helper의 raw Sleep call |

Microsoft 문서는 [`timeGetTime`](https://learn.microsoft.com/en-us/windows/win32/api/timeapi/nf-timeapi-timegettime)를
system start 이후 milliseconds를 반환하는 DWORD로 정의하며, 값은 `2^32`에서 wrap하고 precision은
system dependent다. 그러므로 이 source evidence는 fixed native Hz를 말하지 않는다.

main loop는 다음 순서다.

1. `PeekMessageA`가 queued message를 먼저 확인하고 dispatch한다. queue가 남아 있으면 idle
   sample로 가지 않는다.
2. queue가 비면 idle-block WORD와 signed state gate를 평가한다. `0x00634c90 == 0`일 때
   signed state가 accepted idle states `3`, `23`, `24`, `26` 밖이면 gate가 막힌다.
   `0x00634c90 != 0`이면 그 override가 state list를 대신해 sample을 허용한다.
3. `0x0045fd02`에서 이전 `DWORD [0x00882e04]`를 읽고 `0x0045fd08`에서
   `DWORD [0x0088c0b0]`에 복사한다.
4. `0x0045fd0e`에서 IAT `0x004b7270`의 `timeGetTime`을 호출하고, `0x0045fd14`에서
   반환 DWORD를 `0x00882e04`에 쓴다.
5. `0x0045fd36` 이후 signed main state dispatch를 수행한다.

main의 `0x00882e04` reference set은 READ `0x0045fd02`, WRITE `0x0045fd14`, READ
`0x0045fd62` 세 개뿐이다. whole reference inventory에서 이 전역에 대한 direct WRITE set은
`0x0045fd14` 하나이며, 다른 writer를 추정하지 않는다.

## K01 script flag source chain

K01 context base는 `ECX = 0x00bcbe08`이다.

- `FUN_00482180`는 K01 callsite `0x0048a794`에서 호출된다. `+4 == 0`인 load attempt가
  성공하면 `+4 = 1`을 쓰고 `EAX = 1`을 반환한다. failure return은 그 success write보다
  먼저 `EAX = 0`으로 돌아간다. K01은 loader return을 run gate로 쓰지 않고 getter를 쓴다.
- `FUN_00482340`는 `+4 != 0`이고 `+8 == 0`일 때 `+8 = 1`을 쓴다. 함께 run metadata
  `+0xc18`, `+0xc`, `+0xc20`, `+0xc24`를 clear한다.
- K01의 `FUN_0048a5c0`는 `FUN_004823a0` getter를 `0x0048a781`에서 사용해 busy 상태를
  판정하고, loader `0x0048a794`, start `0x0048a79e`, post-run `FUN_00482390` getter
  `0x0048a800`를 포함한다. `+4`가 nonzero인 K01 busy context에서는 load/start를 다시
  호출하지 않는 bounded vector를 사용한다.
- 더 이른 K01 context update는 `0x0048a6e8`에서 `FUN_004888b0`을 호출하고, 이는 일반
  source/presence update `0x0048a707`보다 먼저 실행된다. `FUN_004888b0`는 같은 `ECX`로
  `+4` getter `0x004888b5`를 확인하고 `FUN_004824c0`를 `0x004888c4`에서 호출한다.
- consumer 뒤 `+8` getter `0x00488919`가 clear를 확인하면 `FUN_00482010`을
  `0x00488927`에서 호출한다. cleanup은 `+8 == 1`일 때 먼저 `FUN_004823d0`을
  `0x0048201a`에서 호출하고, `FUN_00483050` 및 record cleanup 뒤 `0x00482141`에서
  `+4 = 0`을 쓴다.
- `FUN_004824c0`의 completed-record branch는 readiness가 충족되고 `+0xc == 0`일 때
  `FUN_004823d0`을 `0x0048257e`에서 호출한다. `FUN_004823d0`의 projected write는
  `+8 = 0`이며, 이후 추가 cleanup과 `Sleep(1000)`은 별도 raw effect다.

이 chain은 `+8` stop과 `+4` loaded-context cleanup을 구분한다. fixture replay는 이 두 flag와
`Sleep(1000)` vector만 projection하며, stop routine의 resource/compositor/scheduler cleanup
전체를 재구성하지 않는다.

## Bounded replay vectors

`replayResultClockSample`은 sample이 실제로 허용된 경우에만 unsigned DWORD를 result clock에
넣고, elapsed를 modulo `2^32`로 계산한다. message queue 또는 main gate가 막히면 sample하지
않고 이전 clock을 유지한다. 별도 `rawGlobalTick` gate는 기존
[`extract-k01-mission-result-lifecycle.mjs`](../../../tools/imjinrok/extract-k01-mission-result-lifecycle.mjs)의
`runDistinctRawTickResultCommit`를 그대로 사용한다.

| vector | 결과 |
| --- | --- |
| idle sample `100 -> 151` | sample, result `151`, elapsed `51` |
| queued message | no sample, previous result 유지 |
| main gate blocked | no sample, previous result 유지 |
| `0xfffffffe -> 1` | sample, elapsed `3`, wrap 표시 |
| timer delta `2000` | strict `> 2000`에 걸리지 않아 immature |
| timer delta `2001` | mature; 기존 resolver가 result를 반환 |
| same raw tick | dispatcher skip |
| distinct raw tick | cache write 뒤 dispatcher call |

script flag vectors는 다음 source cases를 고정한다.

| vector | bounded result |
| --- | --- |
| successful load | loader called, `+4: 0 -> 1`, return `1` |
| successful load/start | 위 load 뒤 `+8: 0 -> 1` |
| loader zero | start helper는 호출되지만 unloaded `+4` 상태라 `+8` write가 없고 `+4`는 `0` 유지 |
| busy context | `+4` already nonzero라 loader/start call 없이 busy 유지 |
| final record stop | `+8: 1 -> 0`, `Sleep(1000)`, cleanup tail `+4: 1 -> 0` |

## 현재 integration gate와 불확실성

이 evidence unit에서 확정한 것은 millisecond raw source와 accepted call/gate order다. production은
이를 [K01 scenario policy adapter](../../development/k01-scenario-policy-adapter.md)의 bounded v5
result policy로 연결하며, epoch·UI pause·headless 24 Hz는 product adaptation으로 표시한다.
native accepted-update cadence, stop routine의 모든 cleanup effect, native result presentation과
compositor parity는 이 문서와 production adapter의 범위 밖이다.

`0x007c5f80` raw global tick은 result clock과 같은 값이나 같은 unit이라고 말하지 않는다.
기존 `resolveMissionTimers`의 strict `2000/2001` 경계와 distinct-tick commit은 source helper와
production pure kernel에서 재현한다. product policy는 source raw global tick, full owner identity,
native presentation parity를 추가로 주장하지 않는다.
