# K01 scheduler mode·selector producer 경계

질문: **표준 K01 single-player가 scheduler mode `WORD 0x00c06e20` 또는 selector
`DWORD 0x00634acc`를 정적으로 고정하여 accepted-update wall-clock interval을 기존
`64/60/50/40/30 ms` 표보다 더 좁힐 수 있는가?**

- 분석 상태: `정적 확정` — 아래의 mode/selector/feedback producer와 consumer의 폭, 분기,
  call edge 및 K01 stage-1 경로의 **미확정 연결 경계**에 한정한다.
- 재현 상태: `재현 완료` — EXE와 canonical generated artifact의 exact byte length/SHA-256,
  함수 instruction hash, jump-table, call edge 및 byte anchor가 바뀌면 extractor가 실패한다.
- 구현 상태: 없음 — 이 단위는 project 24 Hz adapter를 고르지 않으며 turtle-tank `raw16`
  계약을 바꾸지 않는다.

결론은 의도적으로 좁다. `mode == 1`일 때 원본 base가 정확히 `50 ms`인 것은 확인했지만,
이 slice에서 K01 stage 1이 그 mode를 생산한다는 정적 edge는 닫히지 않았다. 따라서 **K01 실행의 base를
50 ms로도, selector 표의 어느 값으로도 확정하지 않는다.** 아래 feedback producer만으로도
조건부 50 ms base는 `49/50/51 ms`가 될 수 있으므로 accepted-update를 fixed Hz라고 부를
근거도 없다.

## 재현 입력과 검증기

| 입력 | bytes / SHA-256 | 역할 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | 원본 코드·vtable·전역 데이터 주소 |
| `analysis/generated/imjinrok2/functions.json` | 1,467,804 / `c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3` | 함수 범위와 instruction hash |
| `analysis/generated/imjinrok2/references.json` | 17,206,553 / `df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c` | 직접 call edge |
| `analysis/generated/imjinrok2/jump-tables.json` | 607,724 / `0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f` | main-state와 K01 stage switch |

`tools/imjinrok/extract-k01-clock-mode-producers.mjs`는 위 세 generated artifact의 exact byte
length와 SHA-256을 JSON parse 전에 확인한다. 이어 embedded EXE source hash, 함수 instruction
hash, 7개 call edge, K01 stage case와 15개 byte anchor를 함께 확인한다. 다음은 재현 명령이다.

```bash
node --test tools/imjinrok/k01-clock-mode-producers.test.mjs
node tools/imjinrok/extract-k01-clock-mode-producers.mjs
```

## 확인한 코드 범위

| 함수 | instruction 수 / SHA-256 | 이 질문의 역할 |
| --- | --- | --- |
| `0x0043f560-0x0043f573` | 5 / `6b9beb20a706f798049e6891a9ab637878ae09daaa367b804e3cf6c980a540d7` | selector DWORD 저장 후 base 갱신 |
| `0x0043f580-0x0043f5c6` | 20 / `dbdc4447f4bd656a29d55e10f719e29341276c62e4767778dc5decea3671dfc1` | mode equality 및 selector table |
| `0x004430f0-0x00443146` | 30 / `e23c64ff754ac83e87662223cf1598ea4a4bfb87320150e9402cd9d6c205b9ce` | guarded feedback writer |
| `0x00447bc0-0x00447cfa` | 75 / `c5166177633b255028ae02aa6f7a60350f7e93f09ce5fcf101ac92ba066eefde` | scheduler가 wall-clock gate를 호출 |
| `0x00447e10-0x00447ec8` | 66 / `75860fcb9a74162cab2cbe0b72b7d0238d774205c7f63f118dd6c5da6af2e4f5` | base+feedback 및 elapsed-time gate |
| `0x00473b50-0x00473dd6` | 498 / `9ceb40f3a8548d1bed0ea93548b724a1054edb5339b28dc3f05700e85a54135f` | 두 message-record feedback caller |
| `0x00484130-0x0048459a` | 1131 / `d44b4995e2906aa527ee362b7f6aee774bef7cd3fdf966aabc09a5fefdd13b73` | mode writer 인수 EBX를 조립하는 UI/runtime 경로 |
| `0x00485890-0x00485966` | 44 / `fb53dab9a92b41ace1d6e8c44d158a836f1e3bffdee6301f38361a08a1dbcde1` | 조건부 mode WORD writer |
| `0x0045f9c0-0x0046014d` | 801 / `b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24` | main-state dispatch |
| `0x0048dbe0-0x0048dda9` | 147 / `f38e4577cf36c44f26097d94e200321d2a9bc6b0aa1696d572e40a600e7f7217` | standard mission entry에서 stage dispatch |
| `0x0048d410-0x0048d594` | 110 / `55e9e403f208ea2de9f779cb5176d11db85b33758a30d2310d14504dabd0c13d` | signed stage switch; case 1의 K01 map copier |

직접 확인한 edge는 다음과 같다.

```text
main state 5 0x0046005c -> 0x00484130 -> 0x00485890 -> mode WORD
main state 1 0x004600d0 -> 0x0048dbe0 -> 0x0048d410 -> K01 stage-1 case
0x00447bc0:0x00447c65 -> 0x00447e10
0x00473b50:0x00473c7a/0x00473d1b -> 0x004430f0 -> feedback DWORD
```

main jump table `0x0045fd56`은 normalized label `0`을 `0x004600cb`(raw state 1),
label `4`를 `0x0046005c`(raw state 5)로 보낸다. stage jump table `0x0048d422`에서 label
`1`만 `0x0048d429`이며, 이 case의 call `0x0048d42b -> 0x0048d740`가 `stagemap\\k01.map`
copier다. 이로써 K01 표준 stage와 mode writer의 main-state 경로는 같은 것으로 가정하지 않고
각각 source-bound한다.

## 값 흐름과 폭

| 대상 | 정적 흐름 | 폭·비교 |
| --- | --- | --- |
| mode | `0x00485890`은 `WORD [0x004bdfF4]`와 stack `WORD` argument를 검사한다. argument가 `1`일 때 guard가 0이면 `WORD [0x00c06e20]=1`, guard가 nonzero이면 같은 주소에 `0`을 쓴다. argument가 `1`이 아니면 이 writer는 mode를 쓰지 않는다. | unsigned raw WORD store; consumer는 `CMP WORD ...,1` equality |
| selector | option object setter `0x004ac480`가 `WORD [ECX+0x10]`을 쓴다. vtable `0x004b813c`의 sixth slot `0x004b8150`은 `0x004ac490`; 그 forwarder는 `MOVSX EAX,WORD [ECX+0x10]`, `ECX=0x00634ab8`, `CALL 0x0043f560`을 수행한다. setter는 `DWORD [ECX+0x14]`, 즉 `DWORD [0x00634acc]`에 EAX를 저장한다. | input WORD는 signed sign-extension된 DWORD; consumer table index는 unsigned DWORD |
| base | `0x0043f580`은 mode가 정확히 1이면 selector를 읽지 않고 `DWORD [0x004bdfbc]`를 반환한다. 이 base는 `50 ms`다. 그 밖에는 selector `0/1/2/3/>3`에 각각 `64/60/50/40/30 ms`를 고른다. | mode WORD equality; selector `JA` unsigned default |
| feedback | message case 두 개가 `0x004430f0`으로 record fields와 derived index를 넘긴다. history/입력/record/selected 값의 guard 뒤 selected timestamp가 input보다 unsigned로 크면 `DWORD [0x0054a4a8]=0xffffffff`, 작으면 `1`, 같으면 기존 값을 보존한다. | raw DWORD, unsigned `JA/JB`; `0xffffffff`는 이 산술 위치에서 -1 |
| periodic field | `0x00447e10`은 accepted-step counter mod 50이 0일 때 `WORD [0x00552788]`을 signed `JLE/JGE`로 읽고 결국 0을 저장한다. | signed WORD read/reset; direct reference만으로 alias-free writer 부재는 주장하지 않음 |

`0x00447e10`은 base에 `DWORD [0x0054a4a8]`를 더하고 feedback을 즉시 0으로 clear한 뒤
elapsed-time acceptance를 검사한다. 따라서 feedback은 다음 gate에 전달되는 one-shot raw 보정이다.
이 gate와 message queue의 더 큰 흐름은 기존 [K01 투사체 풀 갱신 cadence](k01-projectile-pool-cadence.md)의
source-bound 계약을 따른다.

## K01에 대해 닫힌 것과 닫히지 않은 것

K01 stage-1 entry에서 `0x0048dbe0 -> 0x0048d410`까지는 닫혔고, stage 1의 K01 map case도
닫혔다. 반면 이 bounded source-bound slice는 다음 정적 edge를 아직 닫거나 확립하지 않는다.

```text
K01 stage selector/value -> 0x00484130의 EBX argument
K01 stage selector/value -> WORD [0x004bdfF4] guard
K01 stage selector/value -> option object +0x10 writer
```

그러므로 다음은 모두 **미확정**이다.

- 특정 K01 실행에서 `WORD 0x00c06e20`이 1 또는 0인지
- mode가 1이 아닐 때 K01 selector가 어떤 signed-WORD source 값인지
- K01의 exact accepted-update wall-clock frequency 또는 fixed interval
- `0x00552788`의 실제 producer와 periodic 보정의 전체 범위

이는 “mode 1이면 50 ms”라는 조건부 코드 사실을 K01 parity claim으로 승격하지 않는
source-bound negative contract다. 이 문서는 project tick, 24 Hz adapter, turtle-tank raw16에
새 값을 부여하지 않는다.

## 재현 벡터

extractor test가 아래 raw vector를 직접 replay한다.

| 벡터 | 입력 | 기대 결과 |
| --- | --- | --- |
| mode bypass | mode `1`, selector `0xffffffff` | selector 무시, base `50 ms` |
| non-mode table | mode `0`, selector `0,1,2,3,4` | `64,60,50,40,30 ms` |
| signed forwarder | object WORD `0x0002,0xffff,0x8000` | selector DWORD `2,0xffffffff,0xffff8000` |
| mode writer | `(previous, guard, argument)=(0,0,1),(1,1,1),(1,0,2)` | result mode `1,0,1` |
| feedback | base `50`, input `100`, selected `101,100,99` | effective interval `49,50,51 ms` |

또한 test는 functions/references/jump-tables generated artifact 각각의 같은-size 독립 변조를
exact file SHA-256 단계에서, source hash를 바꾼 stale functions artifact를 exact byte-length
단계에서 거부한다. canonical file을 통과한 뒤에는 EXE hash, embedded source hash,
함수 instruction hash, feedback call edge와 main/stage jump-table 목적지를 계속 확인한다. 따라서
상수만 읽어 만든 table이 아니라 해당 CFG/data-flow의 재현 가능성을 검증한다.

## 다음 정적 질문

범위를 넓히지 않는 다음 질문은 `0x00484130`이 만든 EBX와 `0x004bdfF4` guard의 concrete
producer가 K01 standard-session path에 도달하는지, 그리고 K01이 option object `+0x10`을
설정하는지를 각각 source-bound call/data-flow로 닫는 것이다. 그 전에는 이 문서의 조건부 범위를
K01의 확정 cadence로 사용할 수 없다.
