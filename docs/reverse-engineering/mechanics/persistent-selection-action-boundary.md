`FUN_004475a0`의 refuted call 0x00447b23→FUN_004567c0을 제외한 다른 draw/input branches 가운데, 어떤 owner·resource·slot lifecycle이 gameplay 하단 HUD에 지속적으로 남는 selection/production surface를 구성하며, 그 producer/consumer 경계가 실제 production action 또는 current project construction/production/research view data와 의미상 결합되는가?

# Persistent selection/action boundary

## 좁힌 질문과 판정

사용자가 기억한 “생산 버튼 우클릭 등록”은 후보를 찾는 lead로만 사용했다. `FUN_004475a0`
전체의 다른 draw branch를 triage한 뒤, 이번에는 서로 혼동하기 쉬운 다음 세 경계를 한 질문으로
좁혔다.

1. 선택된 action의 right-button release가 command record에 어떻게 전달되는가?
2. selection이 없을 때 보이는 일곱 slot owner는 누가 clear·populate·draw하는가?
3. production-capable action 하나에서 command payload가 entity queue, 상태 `0x0f`, produced
   type, selected-action queue-count marker와 produced-entity dispatch까지 어떻게 소비되는가?
4. 선택된 entity 아래의 별도 열 개 slot은 같은 owner나 production queue인가?

판정은 다음과 같다.

- **분석 상태: 범위 한정 정적 확정.** 선택 action의 right-release 판정부터 command payload,
  action `115`의 production definition, `FUN_00426c20`의 bit-`0x8` generic branch, entity별
  queue, selected-action queue-count marker, 상태 `0x0f`와 produced-entity dispatch까지 닫았다.
  selection 없음의 일곱 slot과 선택 entity의 contained-object strip은 별도 owner로 구분했다.
- **재현 상태: 부분 재현.** selection 없음, surface lock 실패, left/right release,
  zero/nonzero target-mode, immediate/queued delivery, payload-zero admission·중복·전체
  capacity·예약 실패, payload-one removal/no-match rollback을 full output와 digest로 재현한다.
  queue pump·selected-action queue-count marker·state `0x0f` handoff와 `FUN_0042de00` 이후
  progress/completion/post-dispatch는 static-only다.
- **구현 상태: 분석 전용.** 제품 UI와 `selectionPanel.ts`는 변경하지 않았다.
- **일곱 slot 결합: 없음.** 이번에 bounded한 right-release 경로에는
  `0x007c6702..0x007c670e`에 대한 직접 read/write link가 없다. 이는 이 특정 owner와의 결합만
  부정하며, 사용자 기억의 우클릭 생산 등록 기능 자체를 부정하지 않는다.
- **생산 action data flow: 좁은 범위 정적 확정.** action `115`는 original internal class
  `76` (`조선 권율`) 생산으로 결합된다. payload `0`에서 `entity+0x266` exact `1`만
  prerequisite/`FUN_0047e330` reservation을 검사한다. non-1은 reservation뿐 아니라
  entity `+0x3f0` add/assign과 optional action-indexed decrement도 건너뛰고 common
  player/type writes에 합류한다. 이후 current state WORD exact `1`이면 상태 `0x0f`를 시작하고,
  다른 값이면 entity별 queue에 한 개까지 append한다.
  right-release payload `1`은 matching queue entry가 있으면 caller refund 없이 제거하고,
  없으면 `FUN_0047e300` refund와 produced-type/entity/player bookkeeping을 수행한다.
  renderer는 selected action slot에 matching queue count만큼 marker를 그린다.
- **사용자 기억의 우클릭 예약 기능: 미확정.** 이 action `115` 후보의 right-release는 등록이
  아니라 remove 또는 no-match rollback이다. 따라서 marker는 ordinary queue-count display일
  수 있으며, 기억한 persistent pin/reservation 기능은 별도 action/owner lead로 남는다.
- **프로젝트 view-data 결합: 의미상 일부 호환, 계약은 별도.** original queue count와
  current `productionQueue` count/progress는 “선택된 producer의 생산 대기/진행 표시”라는 좁은
  의미가 겹친다. 하지만 original 12-byte action record, raw state와 resource reservation을
  project contract로 복제하지 않으며 `construction`과 `researchQueue` 동치는 확인되지 않았다.

따라서 현재 responsive layout, multi-selection, mana, health와 추가 상태를 가진 selection UI는
project-owned superset으로 유지한다. 원본의 일곱 slot이나 command 숫자를 public contract로
승격하지 않는다. Noto/Canvas typography도 의도적 프로젝트 적응이다.
artifact 이름의 `persistent`는 update마다 rebuild되는 seven-slot owner가 아니라 entity별
production queue가 update 사이에 유지되고 selected-action queue-count marker로 관찰되는
경계를 가리킨다. 사용자 기억의 persistent right-click pin을 확정하는 이름은 아니다.

## 원본 provenance

- 원본 EXE SHA-256:
  `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- generated function/reference input SHA-256:
  `c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3`,
  `df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c`
- 전용 extractor:
  `tools/imjinrok/extract-persistent-selection-action-boundary.mjs`
- fixture:
  `analysis/fixtures/persistent-selection-action-boundary-vectors.json`

extractor는 원본 PE를 직접 읽고 다음 34개 raw whole-code range와 같은 함수의 generated
single-body metadata를 검증한다.

| 경계 | VA 범위 | raw SHA-256 |
| --- | --- | --- |
| render coordinator | `0x004475a0-0x00447bb8` | `81e6e28cf3a20e2ecd6d1f2e7ede44e646f044fbf86aa581620baa41f67f9f9c` |
| slot reset | `0x00459430-0x0045948d` | `91ab94fcc48ff982d9c8afb014d2e1d86e67fd9ad461851b968f4fa75b2a5fc3` |
| input rebuild | `0x00459490-0x0045acfc` | `f6d20a3bbc4426f27cd430a743eb24e75812a544a034f85b3551b7fadfbec202` |
| selection renderer | `0x0045ad90-0x0045b39e` | `f82b78ede2f143ebabd5ca357b5580d09bfdb5c33755bdc1e9c34c1ccc8974fc` |
| seven-slot producer | `0x0045b420-0x0045b8ab` | `767d88ab9cad2cc37abeccdaab80df61d7b4090a9cd761beb295519efbc91394` |
| seven-slot renderer | `0x0045b8b0-0x0045b9a8` | `5c5795bbb4799ae6ef721f9a1bc5aadec6ccc03402992dfcca797da299d67ea1` |
| seven-slot getter/setter | `0x00461360-0x00461389`, `0x00461390-0x004613fd` | `fa3182350b1541dbee6fabc0a644eaaecc67b43180187a19ed05ba11f3283702`, `d174f96bf0eef5680b40ef68ae61be79d25be9e7279b2fc478f7588a67c59358` |
| command pack/delivery | `0x00477cc0-0x00477db8`, `0x00478250-0x0047831a` | `7fab05352ff9a58f470bace2d9947ad9115c4008df2c9fa5b44819dc7801d3b5`, `64430138e066f087daddb2aa00edf91963b8d2ac03c53b08ed60077cc405da0b` |
| entity pending store/dispatch | `0x00426740-0x004267fe`, `0x00426c20-0x00428154` | `8dbf09b2ffd03bebde48d70613dd8237bd25a66b665250de34547513d66e9f9c`, `04ed69acd326a5bcf2858a42dfacf8dacfe674de2f2e941fd0d4be157a654576` |
| selected-entity/contained strip | `0x00421390-0x004213fb`, `0x00421b20-0x00421c40` | `8f75043c3ed2c77e5a0e1a95b3719105197db76fddb5668eb80b3eaac3e8d879`, `cd31b600f3a8a7123ecdcd693d2361b5c0f034b2177d63f3ad99dfffce60668d` |
| contained container add/remove | `0x00481340-0x0048138d`, `0x00481390-0x0048155b` | `340f042e8074ffda9870951259069833b0f9bfc0c62c8376892986ea3b7612fb`, `2c62ba2f55e268795e5abdf4b87bf4eac4d17e50bd308ebf7c08f09c7f52062e` |
| selection-count producer | `0x0043a8b0-0x0043aa27` | `7cf8d80ea61b0c45315a1c129cd4944c193023e2d996a420efa84b0c859b0539` |
| state `0x0f` cancel/update | `0x00426930-0x00426be1`, `0x0042de00-0x0042e180` | `002fcf586fea37384233ca7edd4c394799a8a6dbbb9e49901bb7f980be9bd1c8`, `38877b0f924c5c347e9b96ff9a7e8d75ed860988277a19cdeb4dc2de9244af4d` |
| queue pump owner/wrappers | `0x0043c300-0x0043c9b1`, `0x00428530-0x00428579`, `0x00428580-0x004285c9` | `58058d5b317f151334c5e9190703a5ed7b8aa88cce02a8be36ffa7746f75b756`, `96e30386c3110857061d79b6de7a43ec1d4e3e35ec7525e0798176fc21d1f285`, `63cd5585177b970d0175bee6e5f6485bdb0cfc55436f784d6cc4967e33427d3d` |
| action table constructor/init | `0x004767a0-0x004767d1`, `0x00476820-0x00477cb5` | `54c30133efc5064982113731b24551cb0722544b7a860b84faf50de41df7c7a7`, `560fffd80c7690646e58fa46a662eea0f18bacb329f5ad067287176c2dc5aad4` |
| produced-ID/resource reservation | `0x0047e050-0x0047e0c8`, `0x0047e300-0x0047e32d`, `0x0047e330-0x0047e398` | `5767f4eb3019c48b872536d704f6031368e406975a15d2f9598964c314b5443f`, `9989e25aa7084d3f0e3e146223f8f5ac3d89a2e4a2206b54e070a2d723db6661`, `9af66fdc69d8501fde684c2cab7fb1954881223a342046a113d8720b2603f0b2` |
| queue shift/append/check/count/remove | `0x0047fda0-0x00480088` (six complete functions) | extractor report의 개별 raw SHA-256 |
| produced-entity dispatch | `0x00483c50-0x00483c9f` | `e268694e2d2c2fc57c5b0e9a547004b77a6ccb1c700f9b30f5f3329d6e602ac9` |

동작을 고정하는 exact byte anchor 41개와 complete structured projection 20개를 검증한다.
기존 표의 열 개 set에 `FUN_00426930`, `FUN_0042de00`, queue wrapper/helper의 complete incoming
set과 `FUN_0042de00`, `FUN_0043c300`, `FUN_00476820` complete outgoing set을 더했다.
전체 canonical count/digest는 extractor report와 focused test가 고정한다.

| target | count | projection SHA-256 |
| --- | ---: | --- |
| `FUN_00459430` | 1 | `d24c4c84dfa0f7be5e8d0b8a38609122ccc5b44ab1e67e33086bf489b0842058` |
| `FUN_0045b420` | 1 | `b2e3cfa60d4d551344c8b754968039478e0320bb62f8184c66c9ddc9a146b497` |
| `FUN_0045b8b0` | 1 | `c2a9684f993fb285ff29be15b30a867b3da1ade9f13d7bac8e934c2821ef893d` |
| `FUN_00461390` | 3 | `20c637b4dd92d7e2411828dd7eeb10e439715eb4e9bc325a16b8a8735a241752` |
| `FUN_00477cc0` | 15 | `478860c8462d22e4f7b68f14c5247dadc21ae7ab987dd8e33f05a611869c5146` |
| `FUN_00478250` | 2 | `da33c8d26873f69a654b83bca62c3821a46cee2918975c5f7698f6bc0962cdb6` |
| `FUN_00421b20` | 1 | `a220c209844c46fb1361aed201f58724508c19917ec8090667c687b6281e58fd` |
| `FUN_004475a0` outgoing | 233 | `81f7e6c7c7aba4adaa5ee2e3b18ac6e26672481a6bd8aeb6a68ef4918af07dc9` |
| `FUN_00459490` outgoing | 848 | `eb8e49be85f069a15dfaef4be5c2e7f08caa605bf40ce61dac5d9736f8aeb05f` |
| `FUN_00426c20` outgoing | 379 | `b5be97466e55145f1eb9b1976354f7f475a01a77ac68dd57afa69e849eddbd6c` |
| `FUN_00426930` callers | 2 | `5297a63228ad546449dc9f3f7561b21677ad7cdfc26cbe8c8656e09eac1234d7` |
| `FUN_0042de00` callers | 1 | `02b86dcb71b5e547fd237bac313cfc5d6823fa0c340be866dca37b0b29ecfef6` |
| `FUN_00428530` callers | 1 | `98c395ace336d81b5579a8c4d50ff3fae53630f3975e7a9984df72b99ac49835` |
| `FUN_00428580` callers | 1 | `13ea87efa571b11679528e08cb1054fb4d7ad39e7b872a93666215ca1d51690b` |
| `FUN_0047fef0` callers | 3 | `d19803dabe0ab63d61efd31efed82c577e95767d5c3fb513a4c4863465b28470` |
| `FUN_0047ff80` callers | 2 | `cdb75d465ffc1a31202fa20416867a963fd4b9fca2d4d43bc0b43bf8ea2f4680` |
| `FUN_00480010` callers | 2 | `e0d0adec12f3178ca761570d44c2c02d18b532ad697baf4c8ddb424a1a2ab677` |
| `FUN_0042de00` outgoing | 59 | `5c9bba3fbe3674f0b0f6d9dc87448efe38e692b830af0490fb1911576bb373e6` |
| `FUN_0043c300` outgoing | 106 | `800e8c54d21c64052537708e7288d5d37d7f6c6728b02d5e7115611306e06e6a` |
| `FUN_00476820` outgoing | 458 | `3d15ed4165d753bc70e95743620e6aa41f98f72bc33710196171c0f291f6316c` |

이는 generated `references.json`의 structured direct-call completeness다. arbitrary alias write나
unresolved indirect callback이 없다는 전역 증명은 아니다.

## `FUN_004475a0` draw triage

`FUN_004475a0`은 selection/action HUD의 단일 renderer가 아니라 여러 UI branch를 조정한다.
이번 질문에 relevant한 호출은 다음과 같다.

- `0x00447ab3 → FUN_0045ad90`: selection count에 따라 selected entity/action surface와
  no-selection surface를 나눈다.
- `0x00447b05 → FUN_004a7de0`, `0x00447b19 → FUN_004a84e0`: 앞선 분석에서 SPEECH
  portrait/label owner `0x005e3680`으로 확정된 별도 경계다.
- `0x00447b23 → FUN_004567c0`: 앞선 분석에서 transient measured overlay로 반증된 경계다.

따라서 SPEECH 네 slot, transient overlay owner `0x00bcdd58`, 이번 일곱 slot owner
`0x007c5ed8`, per-entity contained-object container는 서로 다른 record다.

## selection 없음의 일곱 slot lifecycle

owner는 `0x007c5ed8`이며 slot WORD는 `owner+0x82a+slot*2`,
즉 `0x007c6702..0x007c670e`다.

1. `FUN_00459430`은 매 update 시작에 `slot=0..6`을 `FUN_00461390(slot,0)`으로 clear한다.
2. selection count가 zero일 때만 `FUN_00459490`이 `FUN_0045b420`을 호출한다. 이 함수는
   faction/scenario-derived table rows의 여러 prerequisite WORD를 검사하고, accepted type WORD를
   순서대로 최대 일곱 slot에 setter로 쓴다.
3. `FUN_0045ad90`의 no-selection branch가 `FUN_0045b8b0`을 호출한다.
4. target surface `0x00559418` lock 결과가 exact `1`이 아니면 아무 slot도 그리지 않는다.
   owner 값은 이미 rebuild된 채 유지된다.
5. lock 성공 시 `FUN_0045b8b0`은 setter가 쓴 바로 그 owner array
   `0x007c6702..0x007c670e`를 직접 순회한다. getter만을 통한 접근도, 별도 draw mirror도 아니다.
   exact zero slot은 no-op이고 nonzero WORD는 signed-extend한 뒤
   `type*0x10 + 0x005e3f02`의 frame WORD를 읽는다.
6. 첫 layer draw의 좌표 인자는
   `x=WORD[0x0088bd80] + slot*(WORD[0x0088bd84]+WORD[0x0088bd64])`,
   `y=WORD[0x0088bd82]`다. 두 번째 layer는 같은 X와
   `y=WORD[0x0088bd82]-2`, width `WORD[0x0088bd64]`,
   height `WORD[0x0088bd66]`을 사용한다.
7. draw resource 인자는 `0x00899ce8`, `0x0089a41c`, `0x0089982c`,
   `0x00899830`과 resolved frame index를 통해 계산된다. 이 slice는 그 runtime table이
   가리키는 원본 파일명이나 gameplay label을 완결하지 않았으므로 resource identity를 추정하지
   않는다.
8. slot index는 signed WORD `0..6` 경계다. 저장 값 자체는 raw WORD이며 setter는 low WORD를
   쓴다. 이 producer가 전달하는 값은 zero 또는 완전 복원된 entity internal-class 범위
   `1..95`다. renderer가 nonzero 값을 signed-extend하므로 임의 high-bit raw WORD를 “지원되는
   type”으로 일반화하지 않는다.
9. selection count `0x007c662a`도 raw WORD다. `FUN_0043a8b0`은 20개의 four-byte selection
   record에서 빈 record를 찾았을 때만 increment하고, 존재하는 record를 제거할 때만
   decrement하므로 이 producer domain은 `0..20`이다. fixture는 assumed signed `0..0x7fff`
   domain 대신 이 정확한 범위를 사용한다.

이 owner는 “지속 등록 목록”이 아니라 update마다 clear된 뒤 selection 없음에서 predefined
table로 다시 만들어지는 조건부 surface다. right-button path에서 이 setter로 가는 data flow는
없다. 이 renderer에는 label text나 progress field도 없다. nonzero type WORD에서 두 resource
layer를 호출할 뿐이며, 개별 resource lookup 결과에 대한 별도 null/failure guard는 보이지 않는다.

## right-button release부터 command까지

selected action mirror는 `FUN_00459490`이 update마다 재구성하는 transient 배열
`0x007c66cc..0x007c6701`이다.

1. left release는 flags WORD `0x007c662e` bit `0x2`를 세운다.
2. right release는 selected action definition의 target-mode WORD
   `type*5 + 0x00947e12`가 zero일 때만 admitted되고 bit `0x4`와 action WORD
   `0x007c662c`를 기록한다. nonzero target-mode의 right release는 no-op이다.
3. `0x004472ef`는 `(flags & 4) >> 2`를 만든다. call-site push 순서와 x86 store를
   교차 확인하면 이는 `FUN_00477cc0`의 세 번째 argument다.
4. `FUN_00477cc0`은 이를 command record `+4` DWORD에 넣는다. record byte `+2`는 zero이고,
   byte `+3`은 별도의 immediate/queued mode다.
5. `FUN_00478250`은 action WORD, byte `+2`, byte `+3`, right-release DWORD와 context
   DWORD를 복원한다. byte `+3`만 immediate와 queued delivery를 선택한다.
6. immediate `FUN_00426740`은 action/bytes를 entity `+0x268`, right-release DWORD를
   `+0x26c`, context를 `+0x270`에 쓴다. replacement guard는 byte `+2`를 비교하며
   `+0x26c` payload를 비교하지 않는다.

이 input transport의 immediate/queued byte는 아래 production action queue와 별개다.
전자는 command가 entity pending record에 언제 도착하는지를 고르고, 후자는
`FUN_00426c20`이 action별 의미로 소유하는 entity 내부 queue다.

## action 115 production action dispatch

`FUN_00476820`의 action table initializer와 `FUN_004767a0`의 20-byte record writer를 함께
복원했다. `0x004770fd..0x00477111`은 action `115`, record `0x0094870c`를 다음처럼 만든다.

- raw bits WORD `0x0108`: generic dispatcher bit `0x8`과 per-action-one-entry bit `0x100`
- target-mode WORD `0`
- produced type DWORD `76`
- prerequisite/index DWORD `0`
- 나머지 recovered raw fields `2`, `2`

같은 원본 EXE에서 entity type initializer/name-copy 경로를 다시 실행한 결과 internal class
`76`은 `조선 권율`이다. 원본 문자열 source pointer는 `0x004c81b0`, type definition은
`0x008890a0`, initializer call은 `0x0045d998`이다. 문자열 존재만으로 생산이라고 부른 것이
아니다. `FUN_00426c20` bit-`0x8` branch가 action definition `+4`를 produced type으로 읽어
state `0x0f`의 `entity+0x1f4`에 쓰고, `FUN_0042de00`이 같은 값을 type table과
produced-entity dispatcher에 넘기는 complete data flow가 의미를 닫는다.

### `FUN_00426c20` payload와 우선순위

`FUN_00426c20` prologue `0x00426c2c`가 `EBX=1`을 설정한 뒤 `0x004274e8`에서
`entity+0x26c`과 비교한다. bounded transport domain에서 exact 분기는 다음과 같다.

- `0`, current state WORD `entity+0x1b0 == 1`: `entity+0x266` raw WORD를 비교한다. exact
  `1`만 prerequisite/`FUN_0047e330` reservation 검사를 수행한다. reservation 성공 시에만
  type `+0x0e` WORD를 entity `+0x3f0`에 **assign**하고 action `+0x08`이 nonzero이면 indexed
  player WORD를 decrement한다. non-1은 `0x004278cd`에서 `0x004279f8`로 점프해 reservation과
  이 두 write를 모두 건너뛴다. 두 경로가 합류한 뒤 player/type
  `0x0082c55c[...] = 0`, `0x0082c624[...] = entity+0x1b6`을 쓴 뒤 state `0x0f`, progress
  byte `+0x8d=0`, `entity+0x1f4=76`을 설정한다.
- `0`, current state WORD가 `1`이 아님: 먼저 `FUN_0047ff80`이 total/per-action capacity를
  확인한다. 그 뒤 `entity+0x266` exact `1`만 prerequisite/`FUN_0047e330` reservation을
  검사한다. reservation 성공 시에만 type `+0x0e` WORD를 entity `+0x3f0`에 **add**하고
  optional action-indexed player WORD를 decrement한다. non-1은 `0x00427632`에서
  `0x00427766`으로 점프해 reservation과 이 두 write를 모두 건너뛴다. 두 경로가 합류한 뒤
  `0x0082c55c[...] = 0`, `0x0082c624[...] = entity+0x1b6`을 쓰고 `FUN_0047fef0`이 full
  12-byte record를 append한다. command payload/context도 보존된다.
- `1`: `FUN_00480010`으로 `entity+0x2fc` queue의 첫 matching action을 찾는다. return `1`이면
  helper가 queue shift/count decrement를 끝낸 뒤 caller는 `0x00428143`으로 바로 consume한다.
  이 found-match 경로에는 caller `FUN_0047e300` 호출이 없다.
- `1`, matching entry 없음: `0x0042750a`로 fall through해 produced-type record의 raw
  `+0x0e/+0x10/+0x12` 값을 `FUN_0047e300`에 넘긴다. 이후 produced-type `+0x0e` WORD를
  entity `+0x3f0`에서 빼고, action definition `+0x08`이 nonzero이면 player-indexed WORD를
  증가시키며, produced-type record `+0x20` DWORD bit `0x8`이면 player/type WORD
  `0x0082c55c[...] = 1`, `0x0082c624[...] = 0`을 쓴다. action `115`의 definition `+0x08`은
  zero이므로 indexed increment는 건너뛴다. type `76`의 raw refund fields는
  `+0x0e=0`, `+0x10=400`, `+0x12=0`이고 `+0x20` DWORD는 exact `0x8`이다.

이 no-match refund/bookkeeping edge의 gameplay 명칭은 닫히지 않았다. 현재 production을
cancel하거나 persistent toggle을 바꾼다고 부르지 않는다. 별도의 persistent enable/disable
bit이나 “모든 queue clear” action도 이 action `115` 경로에서 확인되지 않았다.

queue count는 `entity+0x2fc+0xf0 == entity+0x3ec`의 raw WORD이고 최대 `20`이다.
`FUN_0047fef0`/`FUN_0047ff80`은 action bit `0x100`이면 matching count `<1`, 아니면 `<5`만
허용한다. 따라서 action `115`는 state WORD non-one entity queue에 같은 action 하나만 둘 수 있고
duplicate는 resource check 전에 거부된다. action `107`은 같은 bit-`0x8` production branch지만 bit `0x100`은
없고 prerequisite index `7`을 가지므로, fixture는 prerequisite 부재와 일반 five-entry limit도
별도 경계로 재현한다. 이 action의 gameplay 이름을 이번 Kwon Yul 대표 action과 합치지 않는다.
action `107`은 capacity/prerequisite early-boundary control vector로만 사용한다. prerequisite
통과 또는 `entity+0x266` non-1 bypass 뒤 type-specific admission에 도달하면 fixture는 loud
scope rejection한다. type `28`의 raw fields와 downstream writes를 action `115`에서 빌려오지
않으며 payload-one rollback도 이번 fixture 범위로 확장하지 않는다.

`FUN_0047e330`은 `entity+0x266 == 1`일 때만 도달한다. 두 resource가 충분하고 current reserved
capacity와 produced type cost가 maximum 이하일 때 resource를 차감하고 reserved capacity를
더한다. 실패 후 dispatcher는 어느 resource 또는 capacity가 모자랐는지를 구분해 local-player
report 경로를 선택하고 command를 consume한다. non-1 gate bypass에서는 이 helper와
prerequisite input뿐 아니라 entity `+0x3f0` add/assign과 optional action-indexed decrement도
도달하지 않는다. 다만 common player/type writes는 수행한다.
fixture의 `resource-a/resource-b/capacity`는 이 exact branch 결과를 supplied input으로 재현할 뿐
Kwon Yul의 실제 cost 숫자를 새로 추정하지 않는다.

### queue 표시와 한 번의 재전달

`FUN_0045ad90`의 `0x0045b2d7..0x0045b365`는 selected action WORD를 entity queue에 넘겨
matching count를 얻고, positive count만큼 action slot에 marker를 그린다. 이것이 이번 slice에서
확정한 persistent lower-HUD queue-count 표시 결합이다. 별도의 seven-slot owner가 아니며
right-click pin/reservation 표식이라고 단정하지 않는다.

`FUN_0043c300`은 player-scoped WORD gate가 exact `1`이면 `FUN_00428580`을 먼저 호출해 action
bit `0x8`이면서 produced-type flag bit `0x8`인 첫 queue record를 골라 제거·redeliver한다.
그렇지 않거나 matching entry가 없으면 `FUN_00428530`의 일반 first-entry pop을 시도한다.
두 wrapper 모두 queue helper가 full 12-byte record를 제거한 뒤 `FUN_00426740`으로 다시
entity pending action을 전달한다.

이는 action `115`의 “무한 auto-repeat”이나 사용자 기억의 right-click reservation을 증명하지
않는다. bit `0x100`은 같은 queue action의 최대 한 개 제한일 뿐 hero priority나 persistent
toggle 의미가 아니다. pump는 실행 전에 entry를 제거한다. 정확한 scheduler admission을 넘어선
반복 loop는 이번 증거에 없다.

### state `0x0f` produced entity 경계 — static-only

`FUN_00426c20`이 state `0x0f`와 `entity+0x1f4=76`을 쓰고, complete structured caller set은
`FUN_0042de00`이 이 state를 갱신하며 `FUN_00483c50` dispatch boundary에 도달할 수 있음을
정적으로 고정한다. 그러나 이 함수의 전체 결과는 이번 fixture에서 재현하지 않는다.

특히 `0x0042de26`은 signed progress 비교보다 먼저 produced-type flags bit `0x8`을 검사한다.
type `76`은 이 bit가 set되어 있으므로 player/type indexed WORD가 nonzero이면
`FUN_004783b0(entity+0x1b6,1)`을 호출하고 progress/placement 전에 return한다. 뒤쪽 성공
경로에도 entity/player reservation bookkeeping, type-specific player WORD writes,
entity `+0x54a/+0x54c`, optional UI/SPEECH, optional linked callback과 reset이 있다.
이 입력과 side effect 전부를 fixture로 닫지 않았으므로 progress 증가, placement 실패,
identifier 부재, dispatch 성공을 “완료 재현”으로 주장하지 않는다.

`FUN_00483c50 → FUN_00437650` 아래 entity constructor/factory 내부와 placement helper
`FUN_0043a020/0043a120/0043a210`의 전체 gameplay 의미도 이 bounded UI question에 포함하지
않았다. complete `FUN_0042de00` whole range와 outgoing structured reference set은 static
provenance지만 더 깊은 object construction이나 state-update 결과를 UI parity로 승격하지 않는다.

## 선택 entity의 별도 열 slot

`FUN_00421390`은 entity flags `0x600` 아래 `FUN_00421b20`을 호출한다.
후자는 entity `+0x51a`의 bounded count/capacity와 `+0x522`부터의 DWORD identifier pairs를
최대 열 개 위치에 그린다. `FUN_00481340`은 add, `FUN_00481390`은 remove/release lifecycle을
제공한다.

이 data flow는 “contained-object identifier container”까지 정적으로 말할 수 있다. 일곱 slot
owner와 주소·폭·producer가 다르고, 이번 범위에는 production command나
`productionQueue`와의 결합이 없다. 문자열이나 현행 UI를 근거로 garrison/transport 같은 더
강한 gameplay 이름을 붙이지 않는다.

## 재현 벡터와 실패 경계

fixture는 exact EXE hash에 묶이며 synthetic action/type WORD가 gameplay 의미를 확정하지
않는다고 명시한다. 각 vector는 전체 결과를 `deepEqual`하고 SHA-256 digest도 비교한다.

- selection 없음의 seven-slot rebuild, nonzero slot draw와 all-zero per-slot no-op
- surface lock 실패 뒤 rebuild owner 유지와 draw 생략
- right release + zero target-mode의 immediate/queued command
- right release + nonzero target-mode no-op
- left release의 zero right-release payload
- held/no release, unavailable action, other button no-op
- draw lock 실패와 독립적인 accepted input command
- branch 밖 입력 unread와 reached WORD/slot bound loud rejection
- action 115 payload zero + `entity+0x266` exact-one reservation과 non-one bypass
- exact-one reservation 성공에서만 state WORD에 따른 entity `+0x3f0` assign/add; 두 non-one
  bypass 모두 이 write와 optional indexed decrement 없이 common player/type write 뒤
  direct start 또는 queue append
- duplicate, total-20, 일반 five-entry, prerequisite, resource/capacity failure
- right-release payload one matching removal without caller refund
- right-release payload one no-match의 refund와 exact bookkeeping writes, 뒤쪽 admission 입력 unread
- 변조 EXE, whole-function metadata, 14개 complete caller set과 6개 complete outgoing set의
  deterministic rejection

surface lock 실패 뒤 내부 side effect, indirect action callback의 구체 target·failure convention,
runtime resource table의 파일 identity, state `0x0f` progress/completion/post-dispatch,
deeper placement/entity-constructor convention은 미확정 또는 static-only다.
이를 deceptive fallback이나 research/construction 의미로 채우지 않는다. seven-slot owner에는
이 action의 right-release branch는 queue admission에 도달하지 않으므로 seven-slot owner와
synthetic state를 합치지 않았다. 기억한 right-click registration action/owner는 아직 식별하지
않았다.

## 독립 후속 static leads

다음 두 사용자 기억은 이 production-action trace의 사실이나 구현 claim이 아니었다.

- selection이 없을 때 lower-left HUD에 global magic auto-use enable/disable toggle이 있다는
  lead는 후속 [magic auto-use 분석](magic-auto-use-gate.md)에서 별도 정적 확정했다.
- unit-production queue에서 hero를 우선하는 global toggle이 있다는 lead는 후속
  [hero-priority 분석](hero-priority-queue-gate.md)에서 별도 정적 확정했다.

두 후속 gate는 인접 player fields지만 서로 다른 actions·비교·consumer를 가지며 seven-slot
owner나 remembered right-click pinning과 동일시하지 않는다.

## 다음 좁은 질문

remembered right-click reservation의 실제 action/owner를 식별한다. 또는 K01 class 78의
magic auto-use target·delivery 전체를 독립적으로 닫는다. 두 질문을 합치지 않는다.
