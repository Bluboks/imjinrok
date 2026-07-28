# Command grid cell-size: common `button.spr` loader 결합

## 질문과 상태

질문: command-grid가 읽는 `DAT_0089982c`/`DAT_00899830`은 공통 SPR table의 어느 source record에서
생기며, 원본 `fnt\button.spr` header의 `34×34`가 `FUN_00481ee0`까지 보존되는가?

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | 정적 확정 | common table 18번, `0x0bf8` record stride, source header `+4/+8` → runtime aliases → grid initializer의 low-WORD read |
| 재현 | 재현 완료 | table boundary/reachability, per-record loader failure, DWORD-to-low-WORD transfer, 결정론 및 stale/tampered artifact 거부 |
| 구현 | 없음 | 제품 코드 변경 없음 |

이는 [gameplay selection/command grid](gameplay-selection-command-panel.md)의 이전 parameterized
contract에 남아 있던 cell-size producer edge만 닫는다. action 의미, selected-entity 내용, 다른 UI
resource 또는 post-initialization alias writer의 전역 탐색은 범위 밖이다.

## 고정 입력과 검증 산출물

- EXE: `original/imjinrok2/imjinrok2.exe`, SHA-256
  `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- 원본 SPR: `original/imjinrok2/fnt/button.spr`, SHA-256
  `cfe7bab02f2cb8a1f97a3161075e617ace22d6ecf5a976546263a7c67e4efbb4`
- structured reference export: `analysis/generated/imjinrok2/references.json`, SHA-256
  `df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c`
- extractor: `tools/imjinrok/extract-command-grid-cell-size-binding.mjs`
- fixture: `analysis/fixtures/command-grid-cell-size-binding-vectors.json`
- focused test: `tools/imjinrok/command-grid-cell-size-binding.test.mjs`

추출기는 EXE·SPR·structured reference export 각각의 hash를 먼저 확인하고, common loader,
object loader, bootstrap dispatcher, wrapper 및 `FUN_00481ee0` 전체 raw range hash, exact evidence
bytes와 reference-set digest를 확인한다. 어느 입력이 변조되거나 export가 stale이면 결과를 만들지 않고
거부한다.

| 범위 | byte range (end exclusive) | SHA-256 |
| --- | --- | --- |
| common loader | `0x00443360-0x0044343d` | `80805e69437098006c8e2efce33121e9b98a1cf279f9baa19e7c4f9e2255694f` |
| sprite object loader | `0x004434a0-0x0044357f` | `ab4c32302ba6ba9c56fad040df9689aad63a8e03eb33cdeab7b5972368170cf0` |
| bootstrap dispatcher | `0x0045f9c0-0x004607ad` | `7081ada042adc4fa3a7d7b838f717c52bbd63fae2c45be566b0351cfd12dc022` |
| layout wrapper | `0x00445770-0x004457c5` | `f2a8d3a8e0ca3daedac42775a954e5eb372ef27e498f16e04abc84604997ee85` |
| layout initializer | `0x00481ee0-0x00481fcf` | `e354e42cf17dd8ed5316d764d265f973666897f46e48571ae0b1349e589a6946` |

## table, record 및 header 산식

`FUN_00443360`은 `0x004bc094`의 path-pointer table과 `0x0088c0b8`의 runtime record cursor에서
시작한다. 매 반복 뒤 `EDI += 4`, `ESI += 0x0bf8`이며, 다음 path가 `0x004cab44`의 empty string과
같을 때만 멈춘다. EXE의 sentinel은 table index 226 (`0x004bc41c`)이므로 index `0..225`의 총
226 record를 시도한다. index 18은 이 termination 전에 반드시 도달한다.

```text
tableEntry(18) = 0x004bc094 + 18 * 4      = 0x004bc0dc
               -> 0x004bd830 -> "fnt\\button.spr"

buttonRecord  = 0x0088c0b8 + 18 * 0x0bf8 = 0x00899828
record + 0x04 = 0x0089982c  (DAT_0089982c)
record + 0x08 = 0x00899830  (DAT_00899830)
```

`FUN_004434a0`은 source type DWORD `9`만 수락한다. 성공 시 sprite source의 정확히 `0x0bf4` bytes를
선택 record에 복사하고, 그 뒤 payload를 record `+0x0bf4`에 따로 allocate/copy한다. 따라서 source
header DWORD `+0x04`와 `+0x08`은 header-copy 중 변경 없이 식별된 runtime record DWORD `+0x04`와
`+0x08`에 놓인다.

hash-bound `button.spr` header는 `magic=9`, `width DWORD=34`, `height DWORD=34`,
`frameCount DWORD=289`이다. 이는 화면 비교가 아닌 binary header 사실이다.

## initializer 흐름과 canonical width

`FUN_0045f9c0`은 dispatcher loop 앞 `0x0045fc17`에서 common loader를 호출한다. 이후 dispatcher
arm `0x0045fe89`, `0x004600cb`, `0x004600e6`은 `FUN_00445770`을 호출하고, 그 `0x004457bb` tail
transfer는 `ECX=0x0088bd60`을 설정한 뒤 `FUN_00481ee0`으로 들어간다.

`FUN_00481ee0`은 full-DWORD layout field가 아니라 16-bit load/store를 사용한다. 이 명령은 raw low
WORD를 copy할 뿐 sign-extend하지 않는다.

```text
0x00481eeb: AX = WORD[0x0089982c]; WORD[ECX+0x04] = AX
0x00481ef5: DX = WORD[0x00899830]; WORD[ECX+0x06] = DX

0x00481f31: DX = WORD[0x0089982c]; WORD[ECX+0x14] = DX
0x00481f3c: DX = WORD[0x00899830]
0x00481f61: WORD[ECX+0x16] = DX
```

따라서 source와 runtime record header field는 canonical DWORD이고 `FUN_00481ee0`은 그 low 16 bit를
raw WORD로 layout에 보존한다. 앞선 command-grid contract의 geometry consumer는 그 layout WORD를
signed `int16`으로 해석한다. 두 source DWORD는 정확히 `34`(high half zero)이므로 raw WORD와 effective
signed `int16` 모두 `34`다. 성공한 index-18 load 뒤 이 initializer가 실행되면 `cellW=34`,
`cellH=34`다. 이는 이전 grid의 numeric rectangle 전제를 source-bound로 만드는 누락 증거이며,
slot-rectangle formula는 이 문서에서 중복하지 않는다.

## failure, reachability 및 later-writer 경계

`FUN_004434a0`이 index-18 resource open, type validation, allocation 또는 read에 실패하면 zero를
return한다. `FUN_00443360`은 첫 failure만 log하지만 이후 entry로 계속 진행한다. 따라서 table
reachability만으로 button-record failure 뒤 유효한 button dimension을 만들 수는 없다. 이후 wrapper는
loader status를 소비하지 않으며, numeric claim은 성공한 source-load initialization contract에 한정된다.

두 exact address의 hash-bound complete structured direct-reference set에는 9개 entry가 있고 전부
`READ`이며 direct `WRITE`는 없다. loader header copy는 indexed base-pointer writer라서 이 export의
literal-address reference가 아니다. 이로써 source-proven initialization value와, 더 강하지만 아직
증명되지 않은 이후 computed pointer alias mutation 부재 주장을 구분한다. 첫 unresolved edge는 바로
post-initialization computed-alias writer이며, 이 bounded unit 안에 그러한 source evidence는 없다.

## 재현 벡터

fixture는 다음을 다룬다.

- exact source table count 226, index-18 reachability, record/table arithmetic, 성공한 `34×34` header
  transfer;
- index 18에서 끝나는 table boundary: 이후 loader input을 검사하면 안 된다;
- common table은 계속하지만 indeterminate cell value를 내는 button loader failure;
- low word가 34인 synthetic noncanonical header DWORD: actual original source header가 exact DWORD 34인
  채로 initializer가 raw low WORD를 copy함을 보인다;
- high-bit synthetic raw WORD `0x8001`/`0xffff`: geometry의 effective signed `int16`가 각각
  `-32767`/`-1`임을 보인다.

focused test는 malformed reachable value와 tampered EXE, SPR, structured reference export도 독립적으로
거부하고, index-18 미도달 또는 button-load failure 뒤에는 malformed later value를 읽지 않는다. synthetic
field-width vector는 representation test일 뿐 alternate original resource 존재 주장이 아니다.

## 현재 구현과 다음 작업

product implementation은 변경하지 않았다. 앞선 command-grid 문서가 renderer/input geometry와
integration review를 소유하며, 이 증거는 source-bound `34×34` producer contract만 제공한다.

더 강한 lifetime guarantee가 필요하면 common-loader initialization 뒤 전체 `0x00899828` runtime record를
대상으로 별도 범위의 static alias/writer audit을 수행한다. 위 9개의 literal-address reference만으로
그 부재를 추론하지 않는다.
