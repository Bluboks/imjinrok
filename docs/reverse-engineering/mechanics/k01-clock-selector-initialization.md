# K01 cold-start interval selector initialization·persisted config 경계

## 질문과 범위

`DWORD 0x00634acc`를 무엇이 초기화하며, 언제 `config.hq`의 bytes가 그 값을 대신할 수 있고,
그로부터 어떤 제한된 cadence 사실만 말할 수 있는가?

- 분석 상태: `정적 확정` — main cold-start의 config open failure/default 및 successful transfer가
  selector `+0x14`에 미치는 범위에 한정한다.
- 재현 상태: `재현 완료` — failure→default, success→persisted offset retention 및 linked consumer
  boundary vector에 한정한다.
- 구현 상태: 없음 — product runtime/tick policy를 변경하지 않는다.

## 입력과 재현

| 입력 | bytes / SHA-256 | 역할 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `843833` / `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | original code, global address, embedded file string |
| `analysis/generated/imjinrok2/functions.json` | `1468333` / `7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e` | function range and instruction digest |
| `analysis/generated/imjinrok2/references.json` | `17206569` / `f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5` | direct call edge |

`config.hq`는 `0x004bb980`의 NUL-terminated string이며, NUL을 포함한 bytes의 SHA-256은
`449c3469bb28cf424c82acaadb56b4f977d0b4aba5fa4d3824ebe4079fd2e836`.

extractor는 parse 전에 이 full-file digest를 확인하고, 각 generated artifact가 담은 source SHA와
function instruction digest, complete raw range, call edge, byte anchor를 이어서 확인한다.

```bash
node --test tools/imjinrok/k01-clock-selector-initialization-evidence.test.mjs
pnpm imjinrok:extract-k01-clock-selector-initialization-evidence
```

생성되는 replay fixture는
[`analysis/fixtures/k01-clock-selector-initialization-evidence.json`](../../../analysis/fixtures/k01-clock-selector-initialization-evidence.json).

## Function and field evidence

| function | range / instructions / instruction SHA-256 | 제한된 확인 사실 |
| --- | --- | --- |
| `FUN_0043f4f0` | `0x0043f4f0-0x0043f55a`, 37, `eeee18b6012892ee3e108fadc425827e06bbb185ba583aeb6f514c16fbb74802` | clears `0x75` DWORDs, then writes `DWORD [object+0x14]=2` at `0x0043f504` |
| `FUN_0043f6e0` | `0x0043f6e0-0x0043f74f`, 38, `c2066429a049d75f33dd69b1bf75d590af1684d824b2aed345d08a1e798f4c24` | opens `config.hq`; zero open result returns zero, success transfers bytes and returns one |
| `FUN_0045f190` | `0x0045f190-0x0045f243`, 42, `a69bbff3a7935d129f2786c5e0d56db59441fe460b7951b40e2b8ca637456b8b` | invokes load with `ECX=0x00634ab8`; only zero result invokes initializer with the same base |
| `FUN_0043f580` | `0x0043f580-0x0043f5c6`, 20, `dbdc4447f4bd656a29d55e10f719e29341276c62e4767778dc5decea3671dfc1` | linked selector consumer boundary |
| `FUN_0045f9c0` | `0x0045f9c0-0x004607ac`, 801, `b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24` | main calls `FUN_0045f190` at `0x0045fa3b` |

settings object base는 `0x00634ab8`이고 selector는 `DWORD object+0x14`, 즉
`DWORD 0x00634acc`이다. `FUN_0043f4f0`의 다른 default write에는 이 문서에서 의도적으로 역할을
부여하지 않는다.

## Control and data flow

확인한 direct edge는 다음과 같다.

```text
0x0045fa3b: FUN_0045f9c0 -> FUN_0045f190
0x0045f20c: FUN_0045f190 -> FUN_0043f6e0  (ECX = 0x00634ab8)
0x0045f21a: FUN_0045f190 -> FUN_0043f4f0  (only after zero return)
0x0043f728: FUN_0043f6e0 -> FUN_004adf44
0x0043f73d: FUN_0043f6e0 -> FUN_0043f750
```

`FUN_0043f6e0`은 `0x0043f70f`에서 open result를 검사한다. zero이면 곧바로 return하며 그 zero
result가 `FUN_0045f190`에 전달된다. 따라서 failure는 initializer를 호출해 selector를 `2`로 만든다.

successful open의 `0x0043f728` 직전 push는 last push부터 first push 순서로 callee argument
destination `ESI` (settings object), count `0x1d4`, element size `1`, stream `EDI`이다. 중립적인
source-bound 결론은 `FUN_004adf44`가 object에 `0x1d4` bytes를 transfers/loads한다는 것이다.
offset `+0x14`는 이 range 안이므로 그 위치의 persisted bytes는 selector DWORD를 replace할 수 있다.
loader는 그 뒤 stream을 close하고 `WORD object+0x10`으로 `FUN_0043f750`을 호출한다. 이는 selector와
다른 field이다.

## Limited cadence statement

이 문서는 [K01 scheduler mode·selector producer boundary](k01-clock-mode-producers.md)의 consumer
calculation을 import하고 [게임 속도·마우스 인터페이스 상태 경계](gameplay-speed-mouse-settings.md)의
interval table과 cross-check한다.

successfully loaded persisted config가 없고 later option change 전이면 이 initializer가 selector `2`를
establish한다. scheduler mode가 `1`이 아닐 때 existing consumer는 selector `2`를 `50 ms` base로
mapping한다. mode `1`은 selector를 읽지 않고 independent하게 `50 ms`를 return한다.

이는 every K01 session이 `50 ms`로 fixed된다는 claim이 아니다. successful persisted config는 다른
selector value를 retain할 수 있고 existing `FUN_004ac480`/`FUN_004ac490` option-control path는 later에
이를 mutate할 수 있다. scheduler mode, K01/session reachability, feedback, accepted-update cadence는
여전히 separate evidence boundary다.

## Replay vectors

| vector | input | 기대하는 제한된 결과 |
| --- | --- | --- |
| load failure | config open/load result `0` | initializer writes selector `2`; mode other than `1` consumer base `50 ms` |
| load success | persisted offset `+0x14` contains selector `3` | transfer retains selector `3`; mode other than `1` consumer base `40 ms` |
| consumer mode boundary | mode `1`, selector `0` | selector bypassed; base `50 ms` |

## Uncertainties and next question

- 이 문서는 every `config.hq` byte sequence를 validate하거나 특정 K01 session이 어느 cold-start outcome을
  선택하는지 prove하지 않는다.
- transfer callee는 verified stack order와 edge로만 기술한다. stronger generic stream-function role은
  claim하지 않는다.
- 다음 narrow question은 persisted config validity/lifetime, scheduler mode와 later option control까지의
  K01 reachability, accepted-update wall-clock cadence다. initializer branch만으로는 어느 것도 settle되지
  않는다.
