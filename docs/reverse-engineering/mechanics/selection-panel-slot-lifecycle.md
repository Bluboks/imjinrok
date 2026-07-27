원본 owner object 0x005e3680의 네 selection-panel slot record에서 label index(owner+0x10+slot*2 = 0x005e3690 계열), kind(owner+0xc8+slot*4 = 0x005e3748 계열), active(owner+0xe8+slot*4 = 0x005e3768 계열), progress(owner+0x13c+slot*2 = 0x005e37bc 계열)를 생성·갱신·초기화·해제하는 complete upstream producer 집합과 record lifecycle은 무엇인가? optional gate fields owner+0xf8/+0x564/+0x568은 이 lifecycle과 결합되는가? 각 write가 어떤 입력 record·global·호출자에서 유래하며, kind exact 1과 label table 0x00c83e44의 원본 의미를 건설·생산·연구 중 하나로 정적으로 확정할 수 있는가?

## 판정

- 분석 상태: **정적 확정, alias 경계 명시**. `0x005e3680` owner의 생성·초기화·SPEECH
  producer·reset·clear method family와 구조화된 direct caller 집합을 전체 함수 범위로 고정했다.
  다만 generic memory copy, 구조화 산출물이 복원하지 못한 indirect target, 임의 alias write까지
  전역적으로 부재한다고 증명하지 않았으므로 무제한 의미의 complete producer 집합이라고 부르지
  않는다.
- 재현 상태: **범위 한정 재현 완료**. 생성, 새 화자, 같은 화자 교체, surface lock 실패,
  음성 resource 실패, admission no-op, lookup `-1`의 조건부 unsafe 경계, reset, mode별 clear를
  결정론 vector로 재현한다.
- 구현 상태: **분석 전용, production 변경 없음**. 이 record는 현재 프로젝트 selection panel의
  건설·생산·연구 record가 아니라 원본 `SPEECH` 화자 portrait/label slot이다.

따라서 이전 문서의 “selection-panel slot”은 위치를 가리키던 탐색 명칭일 뿐 mechanic 의미가
아니다. kind exact `1`은 **이전 label index와 새로 조회한 SPEECH 화자 index가 다르다**는
boolean이다. 건설·생산·연구 중 어느 하나로 이름 붙이는 가설은 정적으로 반증된다.

## 원본과 독립 추출기

| 입력 | SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `original/imjinrok2/script/K0110` | `d9dcc3c78d0373181677afc63fe9331ff561387e36877a62912ca66515f4aea8` |
| `functions.json` / `references.json` source | 위 EXE 해시와 일치 |

`tools/imjinrok/extract-selection-panel-slot-lifecycle.mjs`는 EXE와 K0110을 직접 읽는다. 원본
해시, 28개 raw whole-function range, 같은 28개 function catalog 경계·instruction digest,
22개 exact byte anchor, 14개 incoming 및 핵심 함수 5개의 complete outgoing canonical
structured-reference projection을 검증한다. K0110은 Windows-949로 직접 decode하며,
stale·변조 EXE/script/functions/references를 거부한다.

주요 raw whole-function 범위는 다음과 같다.

| 함수 | inclusive VA | raw SHA-256 | 범위 내 역할 |
| --- | --- | --- | --- |
| `FUN_0044b040` | `0x0044b040-0x0044b09e` | `6c562893188cec5ce2a87b48a7911e3d3bb7744543f0db3e63b7a2390af64aa8` | caller가 준 진단 문자열 format과 UI/import-side 보고 |
| `FUN_004830f0` | `0x004830f0-0x004833bc` | `7550c0a70805130394c37c3f1a1bc5e30dbb34abc5b7da7032321445ad0c6df1` | script command 소비와 SPEECH case |
| `FUN_0048ea90` | `0x0048ea90-0x004924b2` | `55b7a67bd8d391eda3cc97f4eeaa1117334917ad0e7b0da8b129d15d1a6be92a` | 정적 ID·CP949 label을 runtime buffer로 복사 |
| `FUN_004a7300` | `0x004a7300-0x004a73d3` | `1643347bd0e12eb8693cfa6065ebb883cde247acd49137eaef49377639846165` | owner 생성 초기화 |
| `FUN_004a7410` | `0x004a7410-0x004a75d6` | `61bcc26e305254514a7930100c2ab7d74c5b86dfe6550d73be80e21cf8854c4e` | `hero.spr`와 17-entry pointer table 초기화 |
| `FUN_004a75e0` | `0x004a75e0-0x004a7640` | `6dcf7725a4d0e3835fae0c4d066cf14f2d60ac7b3718d47242a92dfc9320fb68` | 네 slot bulk reset |
| `FUN_004a7650` | `0x004a7650-0x004a7688` | `cca2842253bab5ff4f963ccc43a1e93337043f847ed338021258540c64302000` | active slot reset |
| `FUN_004a7690` | `0x004a7690-0x004a7874` | `8e486757f3e3b9192bcac5883d78644e63bcda4283ecf4016c629a139f5bf9a9` | slot producer |
| `FUN_004a7a50` | `0x004a7a50-0x004a7b0c` | `d9cac0a631c10029910f6893ee82f3d2a216835494eb1cd301a97d48c19f468f` | 별도 SPEECH text producer |
| `FUN_004a7b10` | `0x004a7b10-0x004a7bb3` | `f27f1424cc4c9c0793fabe2abff78190f926f9f7bdb3fb2ee686d1f3efc71c6c` | slot/text wrapper |
| `FUN_004a7f70` | `0x004a7f70-0x004a7fde` | `bdbf1a6bebbd2b86b87a86be214d336d71bc0df48e70ead04caeadb2020a6ff7` | producer admission guard |
| `FUN_004a8030` | `0x004a8030-0x004a8129` | `a61dae0e8a6916bf6ac02da5198d96edc728d39187c0f20b41c83a4fc533e42f` | slot clear/redraw와 resource 정리 |
| `FUN_004a8150` | `0x004a8150-0x004a8195` | `b68adf66f9680eb28e5d624c6e1f8850ec4cb9e8cb090273aa3d97990ed4b2f0` | 별도 text-state clear |
| `FUN_004a8870` | `0x004a8870-0x004a88e9` | `73bf10b346168bf86d4fec169c17b380004bad792e5147cc7d98b375d6142fd7` | 17-entry identifier lookup |
| `FUN_004a88f0` / `FUN_004a8ac0` | `0x004a88f0-0x004a89dd` / `0x004a8ac0-0x004a8ad3` | `0f793d13f8118a747fd59627f340392d02b1ad1012a9c47fb338d2964940b26e` / `1311a40d59c3881d4494c510b56441c30d8a232a59cc107f5baa53afcd6c3ada` | `+0x568` 독립 overlay 생산/clear |
| `FUN_004a89e0` / `FUN_004a8ae0` | `0x004a89e0-0x004a8abb` / `0x004a8ae0-0x004a8af3` | `c6cf2e355d2970b0683d253c32c422a5913525719f542bf116c47bdb0e862e41` / `98db5d2847d785342d4b34b954b8ccc0eebe463864ae13d61ba93d7b598bd364` | `+0x564` 독립 overlay 생산/clear |

## caller와 completeness 경계

`references.json`의 `from/to/type/fromFunctionEntry`만 canonical 정렬한 complete structured
direct-reference 집합을 고정했다.

- `FUN_004a7690`은 `FUN_004a7b10`의 `0x004a7b40`, `0x004a7b79` 두 call만 갖는다
  (`count=2`, digest
  `117a30ffda72c1eea239faae7bdd9ad540287f04db4fd0607177539163b2a261`).
- wrapper `FUN_004a7b10`은 `FUN_004830f0`의 SPEECH case `0x0048313c`와
  `FUN_004a84b0`의 `0x004a84cf` 두 call만 갖는다
  (`count=2`, digest
  `9fc9782b00890e23c921188d092da2219a7e2824dd5cd3255c813f255f8b49cd`).
- `FUN_004a8870`의 유일 structured caller는 producer의 `0x004a76d0`이다.
- `FUN_004a8030` caller는 `0x0048341d`, `0x004a76f9`, `0x004a7e82`,
  `0x004a813f` 네 개다. bulk clear `FUN_004a8130` caller는 `0x00482358`,
  `0x004823f2` 두 개이고, text clear `FUN_004a8150` caller는 `0x004a80d7`
  하나다.
- optional overlay producer/clear 네 함수는 각각 structured caller가 하나이며 SPEECH command
  dispatcher 또는 owner teardown 쪽에서 독립적으로 호출된다.

이 집합은 구조화 분석이 식별한 direct call에 대해서 exact하다. ECX/this indexed write를
absolute-address xref만으로 누락하지 않도록 owner method 전체를 별도로 읽고 byte anchor로
검증했다. SPEECH dispatcher, table loader, slot producer, wrapper, clear 함수의 complete
structured outgoing reference 집합도 별도 digest로 고정했다. 구조화되지 않은 vtable call은
원본 instruction과 전체 함수 raw hash로 call site·분기를 고정하되 실제 target identity까지
확정하지 않는다. 따라서 미복원 indirect target이나 arbitrary alias write의 부재까지 뜻하지는
않는다.

## 입력 record와 필드 폭

`FUN_004830f0`의 SPEECH case `0x00483115`는 owner ECX를 `0x005e3680`으로 고정하고 다음
record 값을 wrapper에 넘긴다.

| SPEECH 입력 | 폭·해석 | producer 사용 |
| --- | --- | --- |
| record `+0x80` | signed `WORD` | slot index; 정상 script 범위는 `0..3` |
| record `+0x82` | NUL-terminated identifier bytes | `FUN_004a8870`의 17-entry 비교 입력 |
| record `+0x482` 및 인접 payload | pointer/byte fields | 별도 text/resource wrapper 입력 |

owner slot field는 다음과 같다.

| owner field | 폭·해석 | lifecycle |
| --- | --- | --- |
| `+0x10+slot*2` | signed `WORD` label index | 초기/clear `-1`; surface lock 성공 때 lookup 결과 저장 |
| `+0xc8+slot*4` | canonical raw `DWORD` boolean | `(old label != resolved label)`을 `0/1`로 저장 |
| `+0xe8+slot*4` | raw `DWORD`; exact `1`만 active | 초기 `0`, producer 완료 `1`, reset/clear `0` |
| `+0x13c+slot*2` | signed `WORD` progress | 초기/producer `0`; downstream `FUN_004a7880`만 `+5` |
| `+0xd8+slot*4` | raw `DWORD` disposition | replacement/reset/clear와 draw mode에서 별도 갱신 |
| `+0x148+slot` | byte | producer input byte 저장 |

dispatcher의 progress `+5` 및 `>=100` kind clear는 upstream producer가 아니다. 이 문서의
producer 집합과 [dispatcher 문서](selection-panel-slot-dispatch.md)의 downstream 소비를
분리한다.

## 생성과 producer 순서

### 생성

`FUN_004a7300`의 네 번 loop는 각 slot에 `label=-1`, `kind=0`, `active=0`,
`progress=0`을 쓴다. 이어 `+0xf8`, `+0x560` resource pointer, `+0x564`, `+0x568`도
각각 0으로 초기화한다. owner 생성 caller는 `0x0045f075`, hero table 초기화 caller는
`0x0045f1df` 하나씩이다.

### SPEECH 생산

`FUN_004a7690`의 순서는 다음과 같다.

1. `FUN_004a7f70` admission 결과가 exact `1`이 아니면 반환 `0`; lookup과 slot field write를
   하지 않는다.
2. `FUN_004a8870(identifier)`의 signed WORD 결과를 받고 기존 label WORD와 비교해
   `changed`를 만든다.
3. 기존 active가 exact `1`이면 `FUN_004a8030(slot,0)`으로 먼저 clear한다. 이 호출은 slot
   label/kind/active/disposition clear 뒤 `FUN_004a8150(0)`을 호출해 `+0xf8` exact-one을
   0으로 만들고, 기존 `+0x560` resource pointer가 non-null이면 해제한 뒤 null로 만든다.
4. clear 전 비교 결과를 kind DWORD `0/1`로 쓴다.
5. indexed slot surface lock 결과가 exact `1`이면 label WORD를 저장하고
   `0x004c91ac[index]` frame table을 거쳐 portrait를 draw/unlock한다. lock 실패면 label
   저장과 frame lookup/draw/unlock을 모두 건너뛴다.
6. 두 경로 모두 caller가 준 raw DWORD를 disposition에 저장한 뒤 progress WORD `0`,
   active DWORD `1`을 쓴다.
7. 기존 speech resource pointer `+0x560`이 non-null이면 `YPRG004`
   (`0x004c921c`)와 `FKJE8567` (`0x004babb0`)을 `FUN_0044b040`에 넘겨 진단을
   보고한다. 이 분기는 resource pointer를 helper에 넘기거나 release/null하지 않는다.
   이어 새 resource loader를 호출하고, 그 반환 `EAX`가 기존 pointer를 `0x004a780c`에서
   덮어쓴다. 새 load 결과가 null이면 별도의 `YPRG005 [%s]` (`0x004c920c`) 진단을
   보고하지만 producer는 반환 `1`까지 진행한다.
8. wrapper 성공 경로는 별도 `FUN_004a7a50` text producer를 호출할 수 있다.

동일 화자 교체도 active clear는 먼저 수행하지만, kind는 clear 이전 비교 결과이므로 `0`으로
복원된다. 다른 화자면 kind `1`이다.

lookup은 17개를 모두 실패하면 오류를 보고하고 signed WORD `-1`을 반환한다. producer에는
range guard가 없다. surface lock이 실패하면 frame table을 읽지 않아 나머지 lifecycle이
계속되지만, lock이 성공하면 label `-1`을 저장한 직후 `0x004c91ac[-1]`에 해당하는 unchecked
out-of-range read에 도달한다. 그 이후 외부 결과는 재현하지 않고 unsafe 경계로 중단한다.

## reset과 clear

- `FUN_004a7650(slot)`은 active exact `1`일 때만 slot surface를 지우고 active/kind/disposition을
  `0`으로 만든다. label과 progress는 유지한다. active가 `1`이 아니면 해당 record의 label,
  kind, progress를 읽지 않는 no-op이다.
- `FUN_004a75e0`은 slot `0..3`에 위 reset을 적용하고 별도 `+0xf8` 상태를 처리한다.
- `FUN_004a8030(slot,mode)`은 active exact `1`과 mode `0`에서
  disposition/kind/active를 `0`, label을 `-1`로 만든다. mode nonzero에서는 record를
  유지하고 alternate redraw/disposition 경로를 쓴다.
- `FUN_004a8030`은 slot branch와 무관하게 `FUN_004a8150(0)`으로 separate text clear를
  호출한다. `+0xf8`이 exact `1`일 때만 실제 0 clear가 일어나며, `+0x560` speech resource
  pointer가 non-null일 때만 실제 release 호출과 null 저장이 일어난다. null이면 release
  호출을 하지 않는다.
- `FUN_004a8130`은 네 slot에 `FUN_004a8030`을 적용한다.

## optional gate field 결합

`FUN_004a7de0` visibility는 네 slot의 active exact `1`, `+0xf8` nonzero, `+0x568`
nonzero, `+0x564` nonzero를 OR한다. 이것은 동일 visibility surface를 공유한다는 뜻이지 세
optional field가 slot record producer의 일부라는 뜻은 아니다.

- `+0xf8`은 `FUN_004a7a50`의 별도 SPEECH text state다. wrapper와 reset/clear에서 slot
  lifecycle과 함께 정리될 수 있지만 slot별 field가 아니다.
- `+0x568`은 `FUN_004a88f0`/`FUN_004a8ac0`이 독립 생산/clear한다.
- `+0x564`는 `FUN_004a89e0`/`FUN_004a8ae0`이 독립 생산/clear한다.

두 overlay field의 draw는 [dispatcher 문서](selection-panel-slot-dispatch.md)에 고정된
별도 rectangle이다. 이 분석은 그것에 건설·생산·연구 의미를 붙이지 않는다.

## `0x00c83e44` table과 K0110 결합

`FUN_0048ea90`은 정적 ID와 CP949 label byte string을 runtime buffer로 복사하고,
`FUN_004a7410`은 그 buffer pointer 17개를 ID table `0x00c83e00`과 label table
`0x00c83e44`에 같은 index 순서로 기록한다. extractor는 `0x004a747c-0x004a75cf`의
34개 `mov [absolute], immediate`를 직접 decode하고, 각 runtime destination offset과
`FUN_0048ea90`의 정적 source immediate가 같은 copy sequence에 있는지 확인한 뒤 원본
NUL-terminated bytes를 함께 검증한다.

| index | ID | CP949 label |
| ---: | --- | --- |
| 0–4 | `K1`…`K5` | 조선 권율, 조선 이순신, 조선 유성룡, 조선 사명대사, 조선 곽재우 |
| 5–9 | `J1`…`J5` | 일본 고니시, 일본 가토, 일본 와카자키, 일본 세이쇼오, 일본 우기다 |
| 10–14 | `C1`…`C5` | 명 이여송, 명 조승훈, 명 심유경, 명 진린, 명 여여문 |
| 15–16 | `K10`, `K6` | 조선 선조, 조선 허준 |

K0110의 11개 SPEECH record는 `K3`, `K10`, `K1`만 선택하며 같은 table에서 각각
조선 유성룡, 조선 선조, 조선 권율로 resolve된다. 이는 문자열 존재만으로 붙인 의미가 아니라
script record identifier → producer lookup → 동일 index label pointer의 data flow다.

## 재현 범위

`analysis/fixtures/selection-panel-slot-lifecycle-vectors.json`은 exact EXE/K0110 해시에 묶여
다음을 전체 output SHA-256으로 비교한다.

- 네 slot constructor state
- 새 K3와 같은 K3 replacement의 kind/clear 순서
- active replacement에서 기존 text exact-one clear와 resource release 뒤 새 resource load가
  실패하고 text path도 재활성화되지 않는 경로
- inactive target slot에서도 reached resource-replacement 단계가 기존 non-null pointer를
  보존한 채 `YPRG004`를 먼저 보고하고, 그 뒤 실패한 새 load 결과가 pointer를 null로
  덮어쓰며 `YPRG005 [%s]`를 보고하는 순서
- surface lock 실패 뒤 label retain과 active/progress write
- speech resource load 실패 보고 뒤 completed return
- admission rejection에서 downstream 입력 비검사
- active replacement cleanup을 마친 뒤 lookup `-1` + lock 성공의 label store 후 unsafe
  frame read
- lookup `-1` + lock 실패의 안전한 나머지 lifecycle
- active reset의 label/progress retain과 non-one no-op
- mode zero clear와 nonzero record retain, resource present/absent release guard
- reached field의 signed WORD/canonical unsigned DWORD 폭 오류

이 vector는 original indirect surface/resource implementation의 crash 결과를 만들어내지 않는다.
정적으로 결정되는 caller-side control flow까지만 재현한다.

## 프로젝트 compatibility와 다음 질문

현재 `apps/game-client/src/ui/selectionPanel.ts`의 construction/research/production,
responsive layout, multi-selection, mana, health와 추가 상태는 project-owned superset이다.
이번 slot record와 semantic binding이 없으므로 production UI는 변경하지 않는다. 원본
고정 4-slot speech architecture도 public project contract로 승격하지 않는다.

다음 좁은 질문은 기존 dispatcher 명칭을 더 확장하는 것이 아니라, 실제 gameplay 선택 UI
owner와 건설·생산·연구 progress producer를 별도로 찾아 현재 project selection view data와
결합 가능한 semantic record가 존재하는지 확인하는 것이다.
