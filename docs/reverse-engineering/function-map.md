# 원본 함수 지도

## 상태

이 문서는 과거 수동 분석에서 확보한 주소와 Ghidra가 재현 가능하게 생성한 포함 함수 경계를 연결한다.
아래 경계·명령어 수·CFG 수는
[`analysis/generated/imjinrok2/seeds.json`](../../analysis/generated/imjinrok2/seeds.json)의 자동 분석
결과다. 같은 입력을 두 번 분석해 생성 파일 해시가 일치함을 확인했다. 자동 경계 자체는 탐색 기반이며,
아래 역할은 별도 메커니즘 문서가 `정적 확정`으로 승격한 경우를 제외하면 `추정`이다.

## seed와 포함 함수

| seed 주소 | Ghidra 포함 함수·범위 | CFG / 명령어 | 현재 역할 후보 | 다음 확인 |
| ---: | --- | ---: | --- | --- |
| `0x00401710` | `FUN_00401710`, `0x00401710-0x00401a99` | 19 / 303 | 런타임 엔티티 그리기 경로 | 모든 draw 분기와 입력 객체 |
| `0x0040c470` | `FUN_0040c470`, `0x0040c470-0x0040c692` | 1 / 211 | 투사체 subtype 1~21 설정 표 초기화 | subtype `0x0c`의 8-word 설정 정적 확정 |
| `0x0040c6c0` | `FUN_0040c6c0`, `0x0040c6c0-0x0040c96e` | 18 / 165 | 이동 관련 레코드 초기화 | 호출자, 레코드 타입과 범위 검사 |
| `0x0040c970` | `FUN_0040c970`, 비연속 subtype body 22개 | 47 / 1,802 | 투사체 subtype별 시각 레코드 후처리 | subtype `0x0c` label 12 경로 정적 확정 |
| `0x0040df10` | `FUN_0040df10`, `0x0040df10-0x0040e06f` | 27 / 150 | 투사체 subtype 1~21 도착 dispatcher | 전체 jump table과 subtype `0x0c` 분기 정적 확정 |
| `0x0040e270` | `FUN_0040e270`, `0x0040e270-0x0040e2b5` | 1 / 20 | subtype `0x0c` 도착 시 effect kind 9 요청 | 저장 대상·payload 전달 순서 정적 확정 |
| `0x0040f0e0` | `FUN_0040f0e0`, `0x0040f0e0-0x0040f0f0` | 1 / 4 | record subtype을 active 표 slot에 기록 | spawn 후 호출 순서 정적 확정 |
| `0x00401000`, `0x00401040`, `0x00401390`, `0x00401430`, `0x00401440` | transient effect config/materialize/update | ? / 13; ? / 297; ? / 38; ? / 4; ? / 35 | effect kind config, 60-record materialization, unsigned raw tick phase update | class-14 action-6 kind 2/4 범위 정적 확정; seconds/FPS 의미 미확정 |
| `0x00401aa0`, `0x00401b70`, `0x00401bb0` | transient effect pool/helper | ? / 10; ? / 21; ? / 21 | slot 1..59 first-free, kind 2/4 materialize | class-14 destruction full-pool/odd-even path 정적 확정 |
| `0x0040f320` | `FUN_0040f190`, `0x0040f190-0x0040f98b` | 111 / 558 | 다른 투사체 이동점·궤적 계산 후보 | subtype별 호출 관계와 부동소수점 결과 |
| `0x0040f9b0` | `FUN_0040f9b0`, `0x0040f9b0-0x0040fc8f` | 61 / 242 | signed-word Bresenham 계열 경로를 14-step으로 보존 | subtype `0x0c` 경로와 160-point 상한 정적 확정 |
| `0x0040fd50` | `FUN_0040fd50`, `0x0040fd50-0x0040ffa9` | 24 / 169 | 현재 경로 점을 시각 위치 필드로 변환 | subtype `0x0c` 호출 순서 정적 확정 |
| `0x004107a0` | `FUN_004107a0`, 비연속 body 4개 | 34 / 152 | 투사체 subtype별 render 상태 갱신 | 비도착 update 호출 순서 정적 확정 |
| `0x00410ab0` | `FUN_00410ab0`, `0x00410ab0-0x00410ada` | 3 / 14 | 시작·끝 좌표의 route 관련 필드 복사 | 초기화·retracking 호출 순서 정적 확정 |
| `0x00410cc0` | `FUN_00410cc0`, `0x00410cc0-0x0041115b` | 70 / 347 | 투사체 레코드 한 번 갱신·도착 dispatch | subtype `0x0c` 비행·도착·반환 정적 확정 |
| `0x00411160` | `FUN_00411160`, `0x00411160-0x0041117f` | 5 / 10 | 투사체 free slot 1~99 할당 | 풀 고갈 반환 0 정적 확정 |
| `0x00411180` | `FUN_00411180`, `0x00411180-0x0041118f` | 1 / 3 | 투사체 active word 해제 | 도착·실패 후 반환 정적 확정 |
| `0x004111b0` | `FUN_004111b0`, `0x004111b0-0x00411229` | 1 / 44 | `0x3a0` 투사체 레코드 생성 | 유성룡 callsite와 15개 인수 정적 확정 |
| `0x00413070` | `FUN_00413070`, `0x00413070-0x0041362d` | 160 / 442 | 공격 kind·defender class별 payload 보정과 방어 백분율 차감 | effect kind 1·권율 직접 피해 범위 정적 확정 |
| `0x00413700` | `FUN_00413700`, `0x00413700-0x00413b02` | 61 / 329 | 공격 effect kind별 단일·범위 대상 전달 | kind 1→단일 defender 경로 정적 확정 |
| `0x00413b30` | `FUN_00413b30`, `0x00413b30-0x00413ddd` | 30 / 208 | defender 피해 계산·체력 적용·사망 후속 처리 | 권율 직접 피해 호출 순서 정적 확정 |
| `0x00416870` | `FUN_00416870`, `0x00416870-0x004168eb` | 6 / 41 | command 5의 full DWORD 대상 참조 writer | low-WORD raw guard·self-reference 거부·`+0x122` write 정적 확정 |
| `0x004168f0` | `FUN_004168f0`, `0x004168f0-0x00416966` | 11 / 46 | 저장 대상의 low-WORD active·raw category/flag 검사 | generation/관계 검사가 아님을 포함해 정적 확정 |
| `0x00416c70` | `FUN_00416c70`, `0x00416c70-0x0041737e` | 84 / 555 | 행동 상태 5의 대상 검사·접근·일반 공격 하위 상태 | missing 취소/scan, out-of-range 이동, arrival 재검사 정적 확정 |
| `0x0040f320` | `FUN_0040f190`, `0x0040f190-0x0040f98b` | 111 / 558 | 투사체 이동점·궤적 계산 | 입력 구조체와 부동소수점 결과 |
| `0x00411290` | `FUN_00411290`, `0x00411290-0x004112e2` | 1 / 20 | 공통 UI 컨트롤 객체 생성자 | 목표 컨트롤 생성 경로 정적 확정 |
| `0x004114d0` | `FUN_004114d0`, `0x004114d0-0x004114ef` | 3 / 12 | 공통 UI 컨트롤 활성 필드 설정 | K01 mode 1 활성 경로 정적 확정 |
| `0x004119f0` | `FUN_004119f0`, `0x004119f0-0x00411a20` | 1 / 17 | 컨트롤 X·Y와 상태별 frame 4개를 vtable+0x3c에 전달 | 목표 모달의 실제 target `0x00411a30-0x00411b47`과 frame draw 경로 정적 확정 |
| `0x00411cb0` | `FUN_00411cb0`, `0x00411cb0-0x00411ccc` | 1 / 9 | 컨트롤 signed WORD X·Y와 이전 버튼 DWORD를 vtable+0x30에 전달 | 목표 모달의 실제 target `FUN_00411cd0`과 닫기 입력 경로 정적 확정 |
| `0x00411cd0` | `FUN_00411cd0`, `0x00411cd0-0x00411d86` | 14 / 57 | 활성 검사, strict-edge hit test 호출, 현재·이전 버튼 상태와 sound latch 처리 | 목표 모달 내부 해제 종료 경로 정적 확정; hit-test target은 `0x00411df0-0x00411e37` |
| `0x00412e40` | `FUN_00412e40`, `0x00412e40-0x00412fbf` | 7 / 94 | 공통 button SPR 객체를 고정 순서로 로드 | `buttons201.spr`→`0x00529428` 결합 정적 확정; 런타임 실패 결과는 정적-only |
| `0x00413070` | `FUN_00413070`, `0x00413070-0x0041362d` | 160 / 442 | full-reference generation 재검사 뒤 공격 kind별 payload·방어 계산; direct raw-reference mismatch는 damage 0, generic kind 2 current-reference 전달에서는 race 없이는 구조적으로 불가 | kind 1과 kind 2/9 제한 범위 정적 확정 |
| `0x00413700` | `FUN_00413700`, `0x00413700-0x00413b02` | 61 / 329 | low-index active admission과 공격 effect kind별 대상 전달; shared multi-cell branch의 ring 열거·mode 1 map/mode 2 supplied-low·live/dedup·payload·current-reference callback 입력 | kind 1, generic kind 2 입력/call 경계 및 action 59 mode 2 제한 범위 정적 확정 |
| `0x00413b30` | `FUN_00413b30`, `0x00413b30-0x00413ddd` | 30 / 208 | class 95 special callback 또는 피해 계산·writer·사망 후속 처리 | 권율 직접 피해와 subtype 16 제한 경로 정적 확정 |
| `0x00416c70` | `FUN_00416c70`, `0x00416c70-0x0041737e` | 84 / 555 | 행동 상태 5의 대상 검증·접근·일반 공격 하위 상태와 `0x00416f6e` 자동 특수행동 dispatcher 호출 | 하위 상태 3→공격 resolver와 [class 78 자동 마법](mechanics/k01-ryu-auto-magic-path.md)의 return-1 short-circuit 정적 확정 |
| `0x00417430` | `FUN_00417430`, `0x00417430-0x004196de` | 272 / 2,468 | 일반 공격 readiness·phase·효과 전달·사이클 완료 | K01 권율·유성룡 phase·전달 분기 정적 확정 |
| `0x0041a880` | `FUN_0041a880`, `0x0041a880-0x0041a98d` | 7 / 70 | 유성룡 투사체 생성 직전 좌표 조건별 전역 객체 호출 | direct store·attacker pointer 전달 없음; callee의 전역·좌표-indexed mutation과 사람용 의미 미확정 |
| `0x0041a990` | `FUN_0041a990`, `0x0041a990-0x0041a9ae` | 1 / 5 | 공격자에 대상 참조와 상태값 1·5 기록 | 유성룡 생성 전 호출 순서 정적 확정 |
| `0x0041a9e0` | `FUN_0041a9e0`, `0x0041a9e0-0x0041aa33` | 6 / 23 | 상태 12에서 slot `+0x0a`, frame `+0x0c` 선택 | 조선 본영 범위 정적 확정, 다른 건물 base frame |
| `0x0041aa90` | `FUN_0041aa90`, `0x0041aa90-0x0041ad8b` | 44 / 219 | 건설 진행도 `+0x8c`→8단계 phase | 조선 본영 범위 정적 확정 |
| `0x0041d210`, `0x0041ecd0`, `0x0041edc0`, `0x0041d560` | state dispatcher와 state 10/11/16 consumer | 52 / 177; 1 / 24; 1 / 63; 15 / 55 | entity `BYTE +0x03` animation dispatch와 resource-work triple consumer | class 7/31에서 state 10→`+0x482/+0x484`, state 11→`+0x480/+0x488/+0x48a`, state 16→`+0x48c/+0x48e/+0x490` frame/slot/phase 경로 정적 확정; 사람용 상태명·다른 class는 미확인 |
| `0x0041d700` | `FUN_0041d700`, `0x0041d700-0x0041d7f5` | ? / 49 | standard state-7 slot·frame renderer | `+0x192/+0x194..+0x19c` 소비; class-14 creation initializer가 이 table을 구성하지 않음 정적 확정 |
| `0x0041d470` | `FUN_0041d470`, `0x0041d470-0x0041d4ee` | 10 / 26 | 방향별 main entity sprite slot `+0x0a` 설정 후보 | 호출 상태와 `+0x456` 표 |
| `0x0041d560` | `FUN_0041d560`, `0x0041d560-0x0041d67d` | 15 / 55 | state 16 sprite slot/frame consumer | class 7/31 `+0x48c/+0x48e/+0x490` resource-work triple; 사람용 상태명은 미확인 |
| `0x0041e370` | `FUN_0041e370`, 비연속 body 2개 | class 점프 테이블 / 115 | 상태 4 class wrapper; class 7·31은 high-bit-clear와 creation-default `WORD +0x144==0`에서 `0x0041e3b3→0x0041d870` state-8 idle consumer fallback, class 13은 case normal, class 14는 phase-count special, class 82는 out-of-range default gate 뒤 common normal 공격 consumer로 진입 | class 7·31 fallback은 source-created creation-default 범위만 정적 확정; 이후 mutation/reachability·combat meaning은 미확정. class 13·14·82 scoped 범위 정적 확정 |
| `0x0041efa0` | `FUN_0041efa0` | 점프 테이블 포함 | 상태 1 방향·phase→frame·mirror | 클래스 2·13·76·78·82 normal path와 class 14 생성-default special path 정적 확정 |
| `0x0041f380` | `FUN_0041f380` | 점프 테이블 포함 | 내부 클래스 2의 상태 2 방향·phase→frame·mirror | 정적 확정 범위는 애니메이션 파일럿 참조 |
| `0x0041fdb0` | `FUN_0041fdb0` | 렌더 분기 포함 | main entity slot `+0x0a`, frame `+0x0c`, mirror `+0x1b5` 소비 | 나머지 draw 분기 |
| `0x004233f0` | `FUN_004233f0`, `0x004233f0-0x0042373d` | 34 / 273 | 행동 6 raw flags·cadence·signed phase 진행 | class-14 `+0x84&0x08`은 transient kind 2/4 path, full pool도 1 반환; state-7 table과 별도임을 정적 확정 |
| `0x00423740` | `FUN_00423740`, `0x00423740-0x00423753` | 3 / 7 | 행동 7 helper, 조건부 call 뒤 1 반환 | dispatcher는 helper 반환을 무시하고 현재 `+0x74 & 0x80`으로 retain/release 선택 |
| `0x00425af0` | 이동 dispatcher | 두 호출 분기 | flags `+0x74` bit `0x08`로 이동 갱신 함수 선택 | bit 설정 경로의 클래스별 적용 |
| `0x00426bf0` | `FUN_00426bf0`, `0x00426bf0-0x00426c1f` | 1 / 9 | 현재 대상 DWORD `+0x122/+0x124` 두 WORD raw clear | direct caller 2곳; 확인한 사망·release 경로에는 direct call/write 없음 |
| `0x00425b20` | `FUN_00425b20`, `0x00425b20-0x004262df` | 일반 이동 전체 경로 | 방향·좌표·phase 갱신과 상태 1·2 선택 | 상태 2 조건의 원본 사람용 명칭 |
| `0x004291d0`, `0x00428fb0`, `0x00428e10` | `FUN_004291d0`와 class helper | 클래스 jump table·idle/move class switch | class 7→`0x0042981d`, class 31→`0x00429b90`; zero/nonzero `+0x47a` branch→각 idle/move helper | class 7 state 8/1/7 slot 105·frame 0/40/240와 class 31 state 8/1/7 slot 145·frame 0/160/240, 두 class의 nonzero state 8/1 frame 범위와 source-created state-4→state-8 fallback endpoint 정적 확정; 이후 state-4 mutation/reachability·combat meaning 미확정 |
| `0x00428fb0`, `0x00428e10` | `FUN_00428fb0`, `FUN_00428e10` | class switch / 148; class switch / 86 | state 8 idle·state 1 move setup helper | class 7 `+0x47a==0` branch는 slot 105 start 0/40·phase 8, class 31 `+0x47a==0` branch는 slot 145 start 0/160 범위를 정적 확정; nonzero branches는 별도 |
| `0x0042a752`, `0x00438e50`, `0x00438ef0`, `0x00438f70`, `0x004390b0`, `0x004390e0` | class-12 normal reinforcement initializer/helpers | ? / block; ? / 24; ? / 24; ? / 24; ? / 6; ? / 24 | state 8/1/2/7/4 slot·base·phase setup | class 12 core state frames와 class 13/82 normal batch direction contract 정적 확정; state-2 project policy 미확정 |
| `0x0048dbe0`, `0x00483c50`, `0x00437650` | map loader, wrapper, `FUN_00437650` | 21/147, 26, 39/539 | K01 map record→pool slot→creator; `REP STOSD` 0x558-byte initialization | source-created class 31 initializer-time `+0x47a==0`과 8/1/7 frame 범위 정적 확정; 이후 mutation 별도 |
| `0x00437650`, `0x004550c0` | `FUN_00437650`, `FUN_004550c0` | 39 / 539; 1 / 26 | `0x558`-byte 엔티티 초기화와 `+0x45c` 0x38-byte subrecord clear | K01 map loader→wrapper→creator가 source class 7을 생성할 때 `REP STOSD` zero와 `+0x45c` callee zero 뒤 initializer를 호출해 initializer-time `+0x47a==0`을 정적 확정; subrecord `+0x1c/+0x1e/+0x20`이 entity `+0x478/+0x47a/+0x47c`인 nonzero resource flow는 별도 정적 확정 |
| `0x004557a3`, `0x004564d4`, `0x0045650c`, `0x00456524`, `0x0043ce75`, `0x00424510` | resource selector/increment/config-refresh/gate/tile-storage-add candidate | subrecord selector write, quantity increment, immediate move/idle helper refresh, quantity/selector/capacity gate, `+0x1bc/+0x1be`→`x*45+y` coordinate-indexed tile WORD storage add | `+0x45c` subrecord `+0x1c/+0x1e/+0x20`과 entity `+0x478/+0x47a/+0x47c`의 offset equivalence; `0x0043ca1e XOR EBP,EBP`→`CMP AX,BP` | class 7/31 nonzero idle/move branch의 `+0x47a`를 이 flow의 carried/gathered resource quantity로 좁게 정적 확정; selector 이름·tile storage add의 사람용 의미·full lifecycle·범용 field 의미는 미확인 |
| `0x004245d0`, `0x004554c0`, `0x004562d0` | resource-work wrapper, raw action dispatcher, resource-flow writer | `+0x45c` tail jump, `+0x88-1` unsigned 0..9 jump table, selector/quantity path | `0x004245d0`은 entity 기준 `+0x45c` 뒤 `0x004554c0`으로 tail jump; latter label 7은 raw action substate 8의 state-16 fast-start/cadence numeric branch이고, `0x004562d0`은 selector 1/2→raw visual state 10, 3→11을 write | class 7/31 resource-work raw frame consumer와 substate-8 numeric boundary만 정적 확정; selector·state 10/11/16의 사람용 의미와 full lifecycle은 미확정 |
| `0x00456329`, `0x0045633c`, `0x00455937` | resource flow visual-state writers | raw visual state 10/11/16 writes | selector 1/2→10, selector 3→11, alternate routine path→16 | class 7/31 resource-work consumer에 연결되는 raw state 값과 raw action substate 8 state-16 numeric cadence만 정적 확정; selector 이름·state-16/selector 3 사람용 의미·사람용 행동명은 미확인 |
| `0x004381c0`, `0x0043d450` | class-14 special turn helper/wrapper | ? / 84; ? / 10 | `+0x1e8` 16-ring turn, `0x80000008` helper selection | shortest forward `<8`, opposite backward tie, byte cadence와 conditional normal copy 정적 확정 |
| `0x00438fa0`, `0x00438ff0` | class-14 ancillary 9-entry setup | ? / 6; ? / 24 | `+0xd1/+0xd2` record 설정 | state-7 `+0x192..+0x19c` table이 아닌 ancillary field임을 정적 확정 |
| `0x00438130` | `FUN_00438130`, `0x00438130-0x0043819d` | 9 / 29 | raw mode/table gate 뒤 signed-WORD 완충 수치·체력 적용 | 유성룡 kind 9 gate·wrap·실패 분기 정적 확정 |
| `0x00438c50` | `FUN_00438c50`, `0x00438c50-0x00438e22` | 26 / 165 | low-WORD active 뒤 footprint 또는 squared range 판정 | 권율 signed low-WORD `<=1`, 유성룡 signed DWORD strict `<50625`와 wrap 정적 확정 |
| `0x00439770` | `FUN_00439770`, `0x00439770-0x00439d62` | 63 / 425 | raw gate 뒤 occupancy/list 자동 대상 후보 scan | Y-major/X-minor 순서·제외·첫 command 성공 정적 확정 |
| `0x00439d70` | `FUN_00439d70`, `0x00439d70-0x00439f40` | 24 / 153 | 후보 재검사와 command 5 queue | 현재 action 1/5 조건과 raw 선호 검사 정적 확정 |
| `0x0043e1e0` | `FUN_0043e1e0`, `0x0043e1e0-0x0043e3e2` | 37 / 179 | raw command WORD switch | input 302가 health-application mode WORD를 toggle하는 범위 정적 확정 |
| `0x0043f560` | `FUN_0043f560`, `0x0043f560-0x0043f573` | 1 / 5 | raw simulation interval selector 기록 | 호출 규약과 interval 재계산 순서 정적 확정 |
| `0x0043f580` | `FUN_0043f580`, `0x0043f580-0x0043f5c6` | 8 / 20 | mode·selector별 millisecond base interval 선택 | 64/60/50/40/30 DWORD 산술 정적 확정 |
| `0x00443090` | `FUN_00443090`, `0x00443090-0x004430a6` | 3 / 8 | timestamp/feedback record 표 reset | raw zero-write 범위 정적 확정 |
| `0x004430f0` | `FUN_004430f0`, `0x004430f0-0x00443146` | 12 / 30 | message record 비교 기반 interval feedback writer | DWORD `-1/+1` 및 무변경 실패 경로 정적 확정 |
| `0x0043b4d0` | `FUN_0043b4d0`, `0x0043b4d0-0x0043c2f5` | 238 / 1,018 | 엔티티 주기 갱신과 건물 유효 체력→반파 상태 | 조선 본영 체력 분기 범위 정적 확정 |
| `0x0043aa80` | `FUN_0043aa80`, `0x0043aa80-0x0043ab6f` | ? / 52 | record constructor direct helper | K01 create initializer가 `0x00437f9c`에서 먼저 호출하는 범위 정적 확정 |
| `0x00438790` | `FUN_00438790`, `0x00438790-0x0043892b` | ? / 126 | record constructor direct helper | K01 create initializer가 `0x00438013`에서 호출하는 범위 정적 확정 |
| `0x0043ad30` | `FUN_0043ad30`, `0x0043ad30-0x0043b2c0` | ? / 399 | mode별 footprint occupancy writer | K01 네 class의 mode-1 1×1 path가 existing-owner zero 검사 없이 slot을 덮어씀 정적 확정 |
| `0x0043c300` | `FUN_0043c300`, `0x0043c300-0x0043c9b1` | ? / 524 | action-1 create-return direct helper | `+0x1bc/+0x1be`를 읽고 rewrite하지 않는 K01 immediate scope 정적 확정 |
| `0x0043c9c0` | `FUN_0043c9c0`, `0x0043c9c0-0x0043d35f` | 143 / 684 | `+0x1b0` 상위 행동 dispatcher와 outer keep/release 반환 | K01 action 1 call edge `0x0043b2d0→0x0043c300→0x0043ad30`, 상태 5 공격·클래스 76·78 health-zero 행동 6/7/`0x16` 정적 확정 |
| `0x00443360` | `FUN_00443360` | 자원 순회 | 경로 포인터 표→런타임 스프라이트 레코드 로드 | 타입 1~95 및 effect table index 5/6 `exp1/exp2` 경로 정적 확정 |
| `0x004400b0`, `0x00440540` | `FUN_004400b0`, `FUN_00440540` | 팔레트 apply 및 `imjin2`/`night1`~`night4` loader | first 768-byte RGB triple block `<<2`→256-entry update, then 0x0c00-byte source block copy; four night destinations and initial contiguous copy | [낮·밤 팔레트 schedule](mechanics/imjinrok-day-night-palette-schedule.md) 범위 정적 확정; product true-color mapping은 미확정 |
| `0x00447360`, `0x004924c0`, `0x00492510`, `0x00492630` | gameplay outer caller, state constructor, advance/schedule, force palette | `+0x18` gate·540 subTick·16 phase/cycle wrap, phase light flag와 phase 8/0 palette/event order | constructor/advance/7개 schedule branch와 force branch 정적 확정; caller outer condition, wall-clock rate·force caller semantic은 미확정 |
| `0x004576c0` | `FUN_004576c0`, `0x004576c0-0x004576f9` | 1 / raw range | UI control record constructor | argument action WORD→record `+0x00`, frame/resource WORD→`+0x02`; action 61/62/63/64의 button frames 27/26/28/29 결합 정적 확정 |
| `0x0045ad90` | `FUN_0045ad90`, `0x0045ad90-0x0045b39f` | selected-command renderer | owner slot/action frame→`0x005e3f02`→`0x00899ce8`/`0x0089a41c` `button.spr` payload draw | action 61..64의 exact button pixel frame과 `34×34` draw path 정적 확정; 다른 action의 semantic identity는 미확정 |
| `0x00469330`, `0x00469510` | `FUN_00469330`, `FUN_00469510` | ? / 150; ? / 341 | K01 bounded map coordinate에서 `+0x3a3a4/+0x42234+x*180+y` unsigned byte→tileset loader object/frame | K01 normal source object/frame selector와 3,600 pair frame bounds 정적 확정; terrain 의미·pixel placement·product renderer는 미확정 |
| `0x00443160`, `0x00443320` | `FUN_00443160`, `FUN_00443320` | ? / 148; ? / 17 | main tileset prefix selector·76-entry filename table→`0x00bcdff8` stride `0x0bf8` loader, 그리고 76-record cleanup | signed-WORD `0/1/2`→normal/snow/brown/default normal, table sentinel `0x004cab44`, cleanup `0x4c` 범위 정적 확정; renderer/frame/map-cell selector는 미확정 |
| `0x00446420` | `FUN_00446420`, `0x00446420-0x004464be` | 9 / 33 | shared session teardown raw write/call chain | result state write 뒤 순서와 exact-one 분기 정적 확정; opaque callee 의미 미확정, unrelated caller 존재 |
| `0x00447360` | `FUN_00447360`, `0x00447360-0x00447599` | 35 / 156 | active entity list 뒤 투사체 slot 0~99 순회 | entity dispatcher 반환 0→`0x00483aa0`, subtype `0x0c` pool 범위 정적 확정 |
| `0x00447bc0` | `FUN_00447bc0`, `0x00447bc0-0x00447cfa` | 21 / 75 | 원본 simulation-step scheduler | 13개 resolved direct call의 raw 조건·순서, 모든 gate 승인 뒤 pool 1회와 조건부 post-pool call 정적 확정; callee 의미 미확정 |
| `0x00447e10` | `FUN_00447e10`, `0x00447e10-0x00447ec8` | 18 / 66 | `timeGetTime` DWORD interval gate | wrap·50-step 보정·backlog 1회 처리 정적 확정 |
| `0x00473b50` | `FUN_00473b50`, `0x00473b50-0x0047418b` | 47 / 498 | raw message-record consumer | 두 case의 feedback writer callsite 정적 확정, protocol 의미 미확정 |
| `0x00438ef0` | `FUN_00438ef0` | 5회 반복 | 상태 1 slot과 다섯 frame base 초기화 | 클래스 2·76·78 호출 인수 정적 확정 |
| `0x00441db0` | `FUN_00441db0`, `0x00441db0-0x00441dd8` | 3 / 12 | low-WORD slot table nonzero·record signed health `>0` | generation 비교 없이 두 raw 조건만 검사함을 정적 확정 |
| `0x00441de0` | `FUN_00441de0`, `0x00441de0-0x00441e36` | 8 / 30 | slot·signed health·full DWORD reference alive 검사 | K01 클래스 76·78 health-zero 즉시 실패 정적 확정 |
| `0x00441e40` | `FUN_00441e40`, `0x00441e40-0x00441e7a` | 5 / 19 | slot·signed health·raw `+0x1f0` active 검사 | health-zero와 slot-release 실패 순서 정적 확정 |
| `0x00441e80` | `FUN_00441e80`, `0x00441e80-0x00441ee4` | 10 / 36 | 위 active 조건 + full DWORD reference 검사 | generation mismatch 실패 정적 확정 |
| `0x004481d0` | `FUN_004481d0`, `0x004481d0-0x00448225` | 6 / 21 | raw global tick cache→mission dispatcher→AX별 result code/call | same-tick skip와 cache 선행 write 정적 확정 |
| `0x004492f0` | `FUN_004492f0`, `0x004492f0-0x004492fa` | 1 / 2 | `DWORD 0x0055299c=1` raw writer | dispatcher의 matured timer result에서만 호출 정적 확정 |
| `0x00442ca0` | `FUN_00442ca0`, `0x00442ca0-0x00442d95` | 25 / 82 | selector별 raw byte-grid 변경 | K01 selector 5 table·경계·두 grid write 정적 확정; 사람용 의미 미확정 |
| `0x004517a0` | `FUN_004517a0`, `0x004517a0-0x00451905` | 10 / 104 | 스프라이트 프레임 blit | 호출 규약과 좌표계 |
| `0x0045bd00` | `FUN_0045bd00`, `0x0045bd00-0x0045bef8` | 1 / 103 | stride `0x14c` 타입 정의 레코드 writer | slot·base frame·이름·footprint `+0x14/+0x16` 필드 정적 확정 |
| `0x0045bf50` | `FUN_0045bf50`, `0x0045bf50-0x0045efb9` | 1 / 5,100 | 전체 엔티티 타입 정의 초기화 | class 1~95 슬롯·기본 프레임·flags·이름 포인터와 K01 class 12/13/14/82 1×1·bit `0x08` clear 정적 확정 |
| `0x0045f9c0` | `FUN_0045f9c0`, `0x0045f9c0-0x004607ac` | 209 / 801 | main Windows message loop와 state switch | scheduler와 result `0x18..0x1d`, `0x8c/0x96` relay·final route 범위 정적 확정 |
| `0x00460ba0` | `FUN_00460ba0`, `0x00460ba0-0x00460e20` | 17 / 144 | ECX base에서 `0x1f6aa` DWORD zero fill 후 후속 raw 초기화 | 표준 mission entry의 `[0x007c5ed8,0x00843980)` prefix 범위 정적 확정 |
| `0x00461570` | `FUN_00461570`, `0x00461570-0x00461590` | 1 / 6 | raw enable·좌표 DWORD writer | K01 call의 `0x00843674/78/7c = 1/55/53` 정적 확정; consumer 의미 미확정 |
| `0x004648d0` | `FUN_004648d0`, `0x004648d0-0x004648d9` | 1 / 3 | stack BYTE→`ECX+2` writer | K01 call의 `BYTE 0x00abfff2=1` 정적 확정; consumer 의미 미확정 |
| `0x00482180` | `FUN_00482180`, `0x00482180-0x004822f4` | 16 / 114 | `0/1` 반환 script loader 계약 정적 확정 | 반환값의 내부 의미·오류 원인은 미확정 |
| `0x00482340` | `FUN_00482340`, `0x00482340-0x0048238c` | 4 / 22 | void script start 계약 정적 확정 | 내부 상태 변화는 미확정 |
| `0x00482390` | `FUN_00482390`, `0x00482390-0x00482393` | 1 / 2 | script context `+8` raw accessor | K01 flag exact 1 뒤 zero early-return gate 정적 확정 |
| `0x004291d0` | `FUN_004291d0` | 클래스 점프 테이블 포함 | 내부 클래스별 애니메이션 설정 초기화 | class 2·49·76·78의 문서화된 범위 정적 확정 |
| `0x00437650` | `FUN_00437650`, `0x00437650-0x00438025` | 39 / 539 | 엔티티 초기화와 건설 진행도·체력 초기값 설정 | 조선 본영 관련 필드 범위 정적 확정 |
| `0x00438130` | `FUN_00438130`, `0x00438130-0x0043819d` | 9 / 29 | global/owner table gate 0이면 no-write return 1; 아니면 zero buffer는 health 직행, nonzero signed buffer≥signed damage면 buffer 감소, 그 외 signed-negative 포함 buffer clear 뒤 원 damage 전량 체력 차감 | kind 1/2/9 제한 범위 정적 확정 |
| `0x0043b4d0` | `FUN_0043b4d0`, `0x0043b4d0-0x0043c2f5` | 238 / 1,018 | 엔티티 주기 갱신과 건물 유효 체력→반파 상태 | 조선 본영 체력 분기 범위 정적 확정 |
| `0x0043c300` | `FUN_0043c300`, `0x0043c300-0x0043c9b1` | 90 / 524 | player record `+0x254e` WORD가 exact 1이면 hero-filtered pop을 먼저 시도하고 실패 시 FIFO fallback | [영웅 생산 queue 우선순위](mechanics/hero-priority-queue-gate.md) 정적 확정 |
| `0x0043c9c0` | `FUN_0043c9c0`, `0x0043c9c0-0x0043d35f` | 143 / 684 | `+0x1b0` 상위 행동 상태 dispatcher | 상태 5→일반 공격 경로 정적 확정 |
| `0x0043e620` | `FUN_0043e620`, `0x0043e620-0x0043e870` | 34 / 154 | 국가·단계 선택을 `FUN_0048d690`에 전달 | K01 인덱스 1 생산 경로 정적 확정 |
| `0x00443360` | `FUN_00443360` | 자원 순회 | 경로 포인터 표→런타임 스프라이트 레코드 로드 | 타입 1~95의 슬롯 경로 정적 확정 |
| `0x00438ef0` | `FUN_00438ef0` | 5회 반복 | 상태 1 slot과 다섯 frame base 초기화 | 클래스 2·76·78 호출 인수 정적 확정 |
| `0x00441de0` | `FUN_00441de0`, `0x00441de0-0x00441e36` | 8 / 30 | 선택된 유닛 레코드 생존 확인 | 입력 선택 과정과 `+0x07` 의미 |
| `0x00441e40` | `FUN_00441e40`, `0x00441e40-0x00441e7a` | 5 / 19 | 인덱스로 활성 레코드 선택 | 반환 포인터와 비활성 조건 |
| `0x00445730` | `FUN_00445730`, `0x00445730-0x00445760` | 5 / 15 | 선택 stage·mode flag에서 공통 UI mode 반환 | K01 index 1→mode 1 정적 확정 |
| `0x00445770` | `FUN_00445770`, `0x00445770-0x004457c4` | 1 / 17 | gameplay UI 사각형 필드 초기화 호출 | `0x0088bd60`→`FUN_00481ee0` 경로 정적 확정 |
| `0x004457d0` | `FUN_004457d0`, `0x004457d0-0x0044598d` | 23 / 135 | gameplay UI 객체 초기화와 open request reset | gameplay-panel 좌표·초기 request 경로 정적 확정 |
| `0x004464c0` | `FUN_004464c0`, `0x004464c0-0x0044735e` | 224 / 988 | gameplay UI 입력 상위 갱신 | open request producer 호출 흐름 정적 확정 |
| `0x00447bc0` | `FUN_00447bc0`, `0x00447bc0-0x00447cfa` | 21 / 75 | open request 1과 application state 3을 state `0x16`으로 전환 | complete structured direct-reference 범위의 유일한 immediate `0x16` write 정적 확정 |
| `0x004481d0` | `FUN_004481d0`, `0x004481d0-0x00448225` | 6 / 21 | application 전환 선행 갱신 | `FUN_00447bc0` 호출 순서 정적 확정 |
| `0x00449090` | `FUN_00449090`, `0x00449090-0x00449260` | 26 / 118 | signed WORD UI dispatcher; `0x3f0`은 목표 모달 초기화 뒤 무조건 `0x3f1`, 종료는 `1000` reset 뒤 cleanup | producer 반환→단일 owner write→`open-objective-modal` 소비와 surface/resource 실패 상태 전이 정적 확정 |
| `0x00449320` | `FUN_00449320`, `0x00449320-0x004495dd` | 13 / 184 | 공통 UI menu border와 컨트롤 생성·mode별 활성화 | K01 mode 1의 목표 컨트롤 활성·사각형 정적 확정 |
| `0x004492d0` | `FUN_004492d0`, `0x004492d0-0x004492ec` | 3 / 8 | `DAT_00552b80 == 1`이면 `0`으로 소비하고 종료값 `1` 반환 | 목표 모달 외부 one-shot 종료 경로 정적 확정, 생산자는 미확정 |
| `0x004495e0` | `FUN_004495e0`, `0x004495e0-0x004498f3` | 31 / 228 | 컨트롤 `0x005527b0`의 성공을 `0x3f0`으로 변환한 뒤 독립 컨트롤 세 개를 `0x3ee→0x3ec→0x3ea` 순으로 평가해 마지막 활성 값을 AX로 반환 | `0x3f0` 생산·동시 활성 우선순위와 input 뒤 surface-lock 실패가 반환을 보존하는 범위 정적 확정 |
| `0x0044abb0` | `FUN_0044abb0`, `0x0044abb0-0x0044ad93` | 28 / 159 | 공유 합성 캔버스(`DAT_00559418`) DirectDraw 표면 Lock, 실패 시 오류 메시지박스 | 임무 목표 모달의 하위 그리기 게이트 역할은 정적 확정, DDraw 표면 필드 전체는 범위 밖 |
| `0x0044ada0` | `FUN_0044ada0`, `0x0044ada0-0x0044addd` | 4 / 17 | 공유 합성 캔버스 Unlock과 호출자 객체 vtable+0x80 통지 | 임무 목표 모달 호출 범위 정적 확정 |
| `0x0044ae80` | `FUN_0044ae80`, `0x0044ae80-0x0044aeb2` | 1 / 13 | 공유 합성 캔버스의 dirty-rect(`this+0x4d0..0x4dc`) 4필드 읽기 | 임무 목표 모달 호출 범위 정적 확정, 필드는 캔버스 전용이지 내용 사각형이 아님 |
| `0x0044aef0` | `FUN_0044aef0`, `0x0044aef0-0x0044af1a` | 1 / 9 | 공유 합성 캔버스의 dirty-rect 4필드 쓰기 | 임무 목표 모달 호출 범위 정적 확정 |
| `0x0044af20` | `FUN_0044af20`, `0x0044af20-0x0044af42` | 1 / 10 | 공유 합성 캔버스 dirty-rect를 `this+4`·`this+8` 크기로 확장 | 임무 목표 모달 호출 범위 정적 확정 |
| `0x0044dfd0` | `FUN_0044dfd0`, `0x0044dfd0-0x0044e03a` | 10 / 46 | `0xfe` 마커 투명 스킵을 포함한 행 단위 RLE 스프라이트 blit | 임무 목표 모달 frame blit 호출 범위 정적 확정 |
| `0x004517a0` | `FUN_004517a0`, `0x004517a0-0x00451905` | 10 / 104 | 스프라이트 프레임 blit | 호출 규약과 좌표계 |
| `0x0045bd00` | `FUN_0045bd00`, `0x0045bd00-0x0045bef8` | 1 / 103 | stride `0x14c` 타입 정의 레코드 writer; `+0x20` DWORD도 기록 | class 1~95 identity와 [hero filter bit 경계](mechanics/hero-priority-queue-gate.md) 정적 확정 |
| `0x0045bf50` | `FUN_0045bf50`, `0x0045bf50-0x0045efb9` | 1 / 5,100 | 전체 95개 엔티티 타입 정의와 `+0x20` DWORD 초기화 | class 1~95 identity와 [16-action hero 교집합](mechanics/hero-priority-queue-gate.md) 정적 확정 |
| `0x004590b0` | `FUN_004590b0`, `0x004590b0-0x0045910b` | 7 / 26 | gameplay-panel disabled guard와 signed WORD strict hit test | `(138,457)-(166,472)` 입력 사각형 정적 확정 |
| `0x00459490` | `FUN_00459490`, `0x00459490-0x0045acfc` | 313 / 1,566 | gameplay-panel 입력·slot rebuild; selection-count WORD 0에서 no-selection control producer 호출 | 목표 request 생산과 [hero-priority control admission](mechanics/hero-priority-queue-gate.md) 정적 확정 |
| `0x0045bb50` | `FUN_0045bb50`, `0x0045bb50-0x0045bc45` | 14 / 61 | 포인터 입력 큐 갱신 | gameplay 입력 상위 흐름 정적 확정 |
| `0x0045f320` | `FUN_0045f320`, `0x0045f320-0x0045f928` | 110 / 479 | Win32 key dispatch와 Escape open request 생산 | state·시간·script busy gate 정적 확정 |
| `0x0045f9c0` | `FUN_0045f9c0`, `0x0045f9c0-0x004607ac` | 209 / 801 | application state `0x16`에서 공통 UI를 초기화하고 `0x17`에서 소유 함수 호출 | 공통 목표 모달 application owner 경로 정적 확정 |
| `0x00460a10` | `FUN_00460a10`, `0x00460a10-0x00460b4e` | 5 / 90 | Win32 입력 handler 설치 | Escape dispatch 상위 설치 경로 정적 확정 |
| `0x004700b0` | `FUN_004700b0`, `0x004700b0-0x0047056d` | 65 / 350 | map pointer/button 입력 갱신 | gameplay-panel 현재 button 상태 공급 경로 정적 확정 |
| `0x00481ee0` | `FUN_00481ee0`, `0x00481ee0-0x00481fce` | 1 / 45 | gameplay UI signed WORD 사각형 필드 초기화 | panel left 138, top 457, width 28, height 15 정적 확정 |
| `0x00482180` | `FUN_00482180`, `0x00482180-0x004822f4` | 16 / 114 | 스크립트 적재 또는 큐 등록 | 인수, 반환값과 오류 경로 |
| `0x00482340` | `FUN_00482340`, `0x00482340-0x0048238c` | 4 / 22 | 스크립트 시작 또는 commit | 엔진 상태 변화 |
| `0x004823a0` | `FUN_004823a0`, `0x004823a0-0x004823a3` | 1 / 2 | 스크립트 엔진 busy 확인 | 반환값을 읽는 모든 호출자 |
| `0x004824c0` | `FUN_004824c0`, `0x004824c0-0x0048258b` | 16 / 62 | 스크립트 큐 소비와 레코드 전달 | `SPEECH` 경로는 정적 확정 |
| `0x00482590` | `FUN_00482590`, `0x00482590-0x0048285c` | 169 명령어 | 11개 스크립트 명령 lookup | 명령 번호와 디스패처 분기 연결 |
| `0x00482860` | `FUN_00482860`, `0x00482860-0x00482eda` | 31 / 456 | 스크립트 명령 디스패처, case 0은 `SPEECH` 레코드 생성 | 종류 0 레코드 소비자와 초상화 계산 |
| `0x004830f0` | `FUN_004830f0`, `0x004830f0-0x004833bc` | 29 / 218 | 레코드 종류별 소비, case 0은 대사 표시 호출 | `SPEECH` 경로는 정적 확정 |
| `0x00483a60` | `FUN_00483a60`, `0x00483a60-0x00483a9c` | 7 / 25 | inactive slot 1..1199 signed reuse-age 선택 | active table 0 후보, later-tie, 모든 inactive candidate WORD 증가·slot 0 failure 정적 확정 |
| `0x00483aa0` | `FUN_00483aa0`, `0x00483aa0-0x00483c2e` | 12 / 95 | active-list swap-last 제거와 active/reuse WORD clear | dispatcher가 0을 반환한 class 76·78 state-7 경로의 release 순서 정적 확정 |
| `0x00483c50` | `FUN_00483c50`, `0x00483c50-0x00483c9f` | 1 / 26 | generation WORD 증가와 entity create wrapper | 16-bit wrap·initializer 전달 및 K01 exact x/y create chain 정적 확정 |
| `0x00487fa0` | `FUN_00487fa0`, `0x00487fa0-0x0048800f` | 7 / 37 | active list의 `+0x74` mask와 raw relation-table 차이 blocker | K01 scan 전 first-difference return 정적 확정; 관계의 사람용 의미 미확정 |
| `0x00488080` | `FUN_00488080`, `0x00488080-0x004880e4` | 7 / 32 | active list의 positive record·`+0x74` mask·signed owner equality 검사 | K01 general-presence raw predicate 정적 확정; 사람용 관계 의미 미확정 |
| `0x00488420` | `FUN_00488420`, `0x00488420-0x004884b5` | 11 / 59 | signed-WORD descriptor entity creator | class-zero 종료, allocate-before-bounds, slot-zero failure, signed OOB create skip·continue와 prior creation 유지 정적 확정 |
| `0x004885e0` | `FUN_004885e0`, `0x004885e0-0x0048866f` | 7 / 53 | owner/class 목록의 positive-record full reference 선택 | K01 76·78 alive-check 연결 정적 확정 |
| `0x0048a731` | `FUN_0048a5c0`, `0x0048a5c0-0x0048a878` | 32 / 181 | K01 raw-relation/flag gate→봉화대 scan→K0120/native effect→post-state 반환 | 같은 scan 복수 match·loader 0/1 무검사·void start·ignored descriptor-helper failure 포함 범위 정적 확정 |
| `0x0048a812` | `FUN_0048a5c0`, `0x0048a5c0-0x0048a878` | 32 / 181 | K01 general→beacon→class 76/78 loss latch와 direct AX 1 | zero sentinel·first-write order와 K01 win-timer direct write 부재 정적 확정 |
| `0x0048d410` | `FUN_0048d410`, `0x0048d410-0x0048d594` | 31 / 110 | signed stage map-source dispatcher | stage 1→`0x0048d740` K01 source copy 범위 정적 확정 |
| `0x0048d6f0` | `FUN_0048d6f0`, `0x0048d6f0-0x0048d73a` | 7 / 31 | win-first 공통 미션 timer resolver | zero sentinel, DWORD wrap·signed abs overflow, strict `>0x7d0` 정적 확정 |
| `0x0048d740` | `FUN_0048d740`, `0x0048d740-0x0048d768` | 1 / 20 | `stagemap\k01.map` NUL-terminated source copy | stage 1 destination copy 범위 정적 확정 |
| `0x0048dbe0` | `FUN_0048dbe0`, `0x0048dbe0-0x0048dda9` | 21 / 147 | broad mission initializer와 stage map dispatch 연결 | `0x007c5ed8` zero-fill 선행 순서 정적 확정 |
| `0x0048dde0` | `FUN_0048ddb0`, `0x0048ddb0-0x0048deca` | 36 / 105 | 세 WORD pre-gate→timer→signed stage dispatcher | timer result flag writer와 stage 1 K01 순서 정적 확정 |
| `0x00493290` | `FUN_00493290`, `0x00493290-0x0049329e` | 1 / 5 | selector 1 presentation initializer wrapper | state `0x18`, AX 1 반환 정적 확정 |
| `0x004932a0` | `FUN_004932a0`, `0x004932a0-0x004932b4` | 1 / 9 | selector 1 presentation poll wrapper | common EAX exact 1→WORD `0x1c`, 그 외 0 정적 확정 |
| `0x004932c0` | `FUN_004932c0`, `0x004932c0-0x004932ce` | 1 / 5 | selector 0 presentation initializer wrapper | state `0x1a`, AX 1 반환 정적 확정 |
| `0x004932d0` | `FUN_004932d0`, `0x004932d0-0x004932e4` | 1 / 9 | selector 0 presentation poll wrapper | common EAX exact 1→WORD `0x1c`, 그 외 0 정적 확정 |
| `0x004932f0` | `FUN_004932f0`, `0x004932f0-0x004933f4` | 8 / 69 | result SPR·YAV 공통 initializer | phase/두 clock reset, selector exact-one 자원 분기·load 실패 log 정적 확정 |
| `0x00493400` | `FUN_00493400`, `0x00493400-0x00493534` | 13 / 99 | result presentation 공통 poll | variant 인수 미사용, unsigned 50/2000 경계·key 순서 정적 확정 |
| `0x00493540` | `FUN_00493540`, `0x00493540-0x00493596` | 7 / 25 | result presentation cleanup | handle gate·stop exact-one·release·zero write 순서 정적 확정 |
| `0x0048ea90` | `FUN_0048ea90`, `0x0048ea90-0x004924b2` | 1 / 5,587 | 원본 문자열을 런타임 저장소에 초기화 | class 1~95 CP949 이름 복사와 초상화 ID 저장 범위 정적 확정 |
| `0x004ae539` | `entry`, `0x004ae539-0x004ae623` | 6 / 75 | PE entry | `0x004ae602` main loop call 정적 확정 |
| `0x004a7410` | `FUN_004a7410`, `0x004a7410-0x004a75d6` | 5 / 64 | `hero.spr` 로드와 인물 조회 포인터 표 초기화 | 초상화 경로는 정적 확정 |
| `0x004a7690` | `FUN_004a7690`, `0x004a7690-0x004a7874` | 13 / 130 | ID 조회 결과→프레임 표→`hero.spr` 그리기 | 초상화 경로는 정적 확정 |
| `0x0048a731` | `FUN_0048a5c0`, `0x0048a5c0-0x0048a878` | 32 / 181 | K01 K0120 조건 검사 지점 | 선행 guard와 전체 분기 |
| `0x0048a812` | `FUN_0048a5c0`, `0x0048a5c0-0x0048a878` | 32 / 181 | K01 보호 영웅 손실 검사 지점 | 같은 함수의 상태 변경 전체 |
| `0x0048d030` | `FUN_0048d030`, `0x0048d030-0x0048d401` | 1 / 371 | 임무 레코드 객체 초기화와 K0110·K0210 경로 기록 | K01 모달 레코드 경로 정적 확정 |
| `0x0048d410` | `FUN_0048d410`, `0x0048d410-0x0048d594` | 31 / 110 | signed WORD 임무 인덱스별 map dispatch | 인덱스 1→`stagemap\k01.map` 정적 확정 |
| `0x0048d610` | `FUN_0048d610`, `0x0048d610-0x0048d650` | 7 / 24 | 국가·단계별 임무 레코드 선택 | 국가 1→K01 레코드 경로 정적 확정 |
| `0x0048d660` | `FUN_0048d660`, `0x0048d660-0x0048d681` | 6 / 13 | 국가별 단계 수 반환 | 국가 1·2는 8, 국가 3은 7로 정적 확정 |
| `0x0048d690` | `FUN_0048d690`, `0x0048d690-0x0048d6e4` | 7 / 22 | 국가별 offset을 적용해 signed WORD `DAT_0088afcc` 기록 | 한국 캠페인 1단계→인덱스 1 정적 확정 |
| `0x0048d6f0` | `FUN_0048d6f0`, `0x0048d6f0-0x0048d73a` | 7 / 31 | 공통 미션 결과 타이머 판정 | 모든 반환 경로와 시간 단위 |
| `0x0048dbe0` | `FUN_0048dbe0`, `0x0048dbe0-0x0048dda9` | 21 / 147 | `DAT_0088afcc` 기반 임무 map 로드 | K01 map 결합 정적 확정 |
| `0x0048ddb0` | `FUN_0048ddb0`, `0x0048ddb0-0x0048deca` | 36 / 105 | `DAT_0088afcc` 기반 임무 handler dispatch | 인덱스 1→`FUN_0048a5c0` 정적 확정 |
| `0x0048dde0` | `FUN_0048ddb0`, `0x0048ddb0-0x0048deca` | 36 / 105 | 미션 결과 소비·전환 | 호출 주기와 후속 함수 |
| `0x0048ea90` | `FUN_0048ea90`, `0x0048ea90-0x004924b2` | 1 / 5,587 | 원본 문자열을 런타임 저장소에 초기화 | class 1~95 CP949 이름·초상화 ID와 magic controls의 `자동마법설정/해제` label 복사 정적 확정 |
| `0x004a5730` | `FUN_004a5730`, `0x004a5730-0x004a5977` | 13 / 157 | `objectiveborder.spr` 로드, 닫기 컨트롤 `(415,267)` 80×24 초기화, K01 인덱스 1의 두 텍스트를 `FUN_004a9010` 결과로 X 158·center Y 166/228에 배치 | 목표 모달 초기화·로드·텍스트 실패 분기·호출 규약·배치 정적 확정 |
| `0x004a5980` | `FUN_004a5980`, `0x004a5980-0x004a5ab3` | 6 / 87 | 내부 해제·외부 one-shot 종료, frame `(112,81)` 416×236 draw, 내용 RECT `(158,135)-(478,259)` present | 목표 모달 갱신·종료·잠금 실패 범위 정적 확정 |
| `0x004a5ac0` | `FUN_004a5ac0`, `0x004a5ac0-0x004a5ada` | 3 / 7 | SPR 포인터가 있으면 해제한 뒤 조건과 무관하게 `FUN_004a5ae0`으로 tail-jump | 목표 모달 종료 정리 순서 정적 확정 |
| `0x004a5ae0` | `FUN_004a5ae0`, `0x004a5ae0-0x004a5b29` | 3 / 18 | clear 잠금을 시도하고 성공 시 `(158,135)-(477,258)`을 투명 index `0xfe`로 clear·unlock | 목표 모달 내용 clear 성공·실패 범위 정적 확정 |
| `0x004a7410` | `FUN_004a7410`, `0x004a7410-0x004a75d6` | 5 / 64 | `hero.spr` 로드와 17-entry ID/CP949 화자 label 포인터 표 초기화 | SPEECH slot lifecycle 정적 확정 |
| `0x004a7690` | `FUN_004a7690`, `0x004a7690-0x004a7874` | 13 / 130 | SPEECH ID 조회, old/new 화자 kind, portrait slot active/progress 생산 | 전체 producer 순서·실패 경계 정적 확정 |
| `0x004a7a50` | `FUN_004a7a50` | 텍스트 계산 포함 | `SPEECH` 대사 폭 278, X 188, Y 190 중심 배치 | 배치 수식은 정적 확정 |
| `0x004a7b10` | `FUN_004a7b10`, `0x004a7b10-0x004a7bb3` | 7 / 73 | SPEECH portrait slot producer와 별도 text producer 조정 | wrapper direct caller·분기 정적 확정 |
| `0x004a7f70` | `FUN_004a7f70` | 사각형 helper 호출 | SPEECH slot producer admission guard | 전체 guard 분기 정적 확정 |
| `0x004a8030` | `FUN_004a8030` | 사각형 helper 호출 | SPEECH slot mode별 clear/redraw와 text/resource cleanup | record clear·retain 경계 정적 확정 |
| `0x004a8410` | `FUN_004a8410` | 4-case switch | signed slot 0~3의 130×120 RECT initializer; draw는 caller 소유 | dispatcher·progress·label caller와 범위 밖 origin 미초기화 경로 정적 확정 |
| `0x004a8870` | `FUN_004a8870`, `0x004a8870-0x004a88e9` | 12 / 51 | 17개 SPEECH 화자 ID 조회, 실패 보고 후 signed WORD `-1` | producer의 unchecked frame-table 경계까지 정적 확정 |
| `0x004a9010` | `FUN_004a9010`, `0x004a9010-0x004a9258` | 23 / 189 | 공용 Windows-949 byte renderer; `DAT_00634e38` GDI font 선택, caller 폭을 300으로 제한, ASCII-space chunk strict wrap, shadow/main `TextOutA`, WORD 크기 출력 | 목표 모달 두 direct call과 전체 경계 정적 확정; 실제 Windows font realization·K0110 glyph metrics 미확정 |
| `0x004aafa0` | `FUN_004aafa0`, `0x004aafa0-0x004ab2ac` | 12 / 170 | 단계 선택 UI의 임무 레코드 소비 | K01 인덱스 결합 정적 확정 |
| `0x004ab630` | `FUN_004ab630`, `0x004ab630-0x004ab6b5` | 8 / 58 | 단계 선택 레코드 정리 | K01 레코드 생명주기 정적 확정 |

## 메커니즘 전용 whole-function 경계

아래 함수는 위 `seeds.json` 표의 configured seed가 아니다. 전용 extractor가 원본 raw range를
검증하고, 범위·명령어 수는 current
[`functions.json`](../../analysis/generated/imjinrok2/functions.json) whole-function metadata와
일치시킨다. 상세 제어·데이터 흐름은 각 행에 연결한
[영웅 생산 queue 우선순위](mechanics/hero-priority-queue-gate.md)와
[마법 자동사용 gate](mechanics/magic-auto-use-gate.md)를 단일 출처로 삼는다.

| 함수 | generated body 범위 | 명령어 | 정적 확정 역할·경계 |
| ---: | --- | ---: | --- |
| `0x00428530` | `0x00428530-0x00428579` | 28 | FIFO pop wrapper; 제거 뒤 constant 20으로 redelivery 시도 |
| `0x00428580` | `0x00428580-0x004285c9` | 28 | hero-filtered pop wrapper; 제거 뒤 constant 30으로 redelivery 시도 |
| `0x00421390` | `0x00421390-0x004213fb` | 35 | sole exact-one single-selection dispatch의 lock, owner WORD copy, opaque subcall 순서, flag-gated optional call, success-only unlock과 unconditional final helper; subrenderer 의미는 미확정 |
| `0x004196e0` | 비연속 body 10개, `0x004196e0-0x0041a018` | 665 | player `+0x254c` nonzero에서 9-class 자동 특수행동 case를 선택; class 78 case는 target·actions 40/59까지 정적 확정 |
| `0x0041c870` | `0x0041c870-0x0041c990` | 101 | class 78 action 40의 적 team·저체력·flags·resource target admission |
| `0x00426740` | `0x00426740-0x004267fe` | 44 | `+0x266..+0x273` 14-byte pending 영역 store; origin 1 auto가 non-idle origin 0 manual pending을 덮지 못함 |
| `0x00426c20` | `0x00426c20-0x00428154` | 1,428 | actions 2..69 pending consumer; class 78 actions 40/59 admission·state handoff·consume 확정 |
| `0x00416600` | `0x00416600-0x00416860` | 174 | state 59 charge decrement·negative `+0x448` clamp, 중심 제외 최대 8개 subtype 16 creation call과 payload-construction-reached attempt 사이 EDI 상위 WORD 누적 |
| `0x00411160` | `0x00411160-0x00411180` | 10 | fixed effect registry slot 1..99의 first-zero admission; full이면 0 |
| `0x00411190` | `0x00411190-0x004111a5` | 10 | `FUN_00411180`으로 registry slots 0..99 bulk clear; record bytes는 유지 |
| `0x004111b0` | `0x004111b0-0x0041122a` | 44 | supplied slot의 `0x3a0`-byte record 생성·초기화·subtype registry write wrapper |
| `0x0040c6c0` | `0x0040c6c0-0x0040c96f` | 165 | fixed record 전체 zero와 subtype·payload low WORD·source·path field 초기화 |
| `0x00410cc0` | `0x00410cc0-0x0041115c` | 347 | tick%3 phase wrap, generation tracking, non-end index 증가와 current slot의 subtype 1 full-reference 재초기화 |
| `0x0040f9b0` | `0x0040f9b0-0x0040fc8f` | 242 | 160-WORD X/Y storage의 promoted path end 0..159 기록; tracking reset 뒤 `+0xa6`은 유지 |
| `0x0040eab0` | `0x0040eab0-0x0040ebc5` | 90 | same-slot 전환된 subtype 1 final에서 radius 1·effect kind 2로 `FUN_00413700` 호출 |
| `0x004426f0` | `0x004426f0-0x0044274a` | 35 | source/candidate invalid면 0, 둘 다 live면 same-team 결과; subtype 16 caller는 0을 accept |
| `0x00438e30` | `0x00438e30-0x00438e48` | 7 | generation 검증 뒤 tracking target 좌표 read helper |
| `0x00447360` | `0x00447360-0x0044759a` | 156 | 100-slot outer updater; updater가 0일 때만 registry WORD cleanup |
| `0x00412ff0` / `0x00413000` / `0x00413040` | `0x00412ff0-0x00412ffa` / `0x00413000-0x00413032` / `0x00413040-0x00413065` | 2 / 18 / 9 | generic shared branch의 exclusion count reset, WORD list contains, signed count `<30` append |
| `0x00413700` | `0x00413700-0x00413b03` | 329 | kinds 2/3/4/13/14/18/24/25/26/27 shared branch; kind 2의 Chebyshev 열거·mode별 후보·live/dedup·low-WORD primary override·current full reference callback 경계 |
| `0x00413b30` | `0x00413b30-0x00413dde` | 208 | class 95 special callback, full-generation 재검사·damage writer 반환 0→`FUN_00442b10`, 1→`FUN_00439400`; generic kind 2는 current full reference를 받고 이후 death/reference invalidation은 미재현 |
| `0x0041cb10` | `0x0041cb10-0x0041ccc4` | 128 | state 40 effect phase의 resource 70 차감·target status·owner transfer |
| `0x00478320` | `0x00478320-0x004783a4` | 43 | source 검증 뒤 pending store; reached store 결과와 무관한 return-1 core |
| `0x004784c0` / `0x004788b0` | `0x004784c0-0x004784f0` / `0x004788b0-0x004788d4` | 17 / 13 | action 40/59 payload를 고정하고 core 결과와 무관하게 1을 반환하는 wrapper |
| `0x00441db0` | `0x00441db0-0x00441dd8` | 12 | registry WORD slot nonzero·common entity signed health `+0x3e` positive 검사 |
| `0x00441e40` | `0x00441e40-0x00441e7a` | 19 | 위 검사에 common entity active gate `+0x1f0` nonzero를 추가한 target admission |
| `0x004426a0` | `0x004426a0-0x004426e1` | 23 | 두 player record team BYTE `+0x05` equality |
| `0x0045b3a0` | `0x0045b3a0-0x0045b419` | 40 | selection-count-zero slot 0에 magic actions `61/62`, slot 1에 hero-priority actions `63/64` control 생산 |
| `0x004767a0` | `0x004767a0-0x004767d1` | 13 | 20-byte action definition의 flags·produced-type 등 여섯 필드 writer |
| `0x004767e0` | `0x004767e0-0x004767f1` | 6 | action flags WORD에 공급된 mask가 모두 설정됐는지 검사 |
| `0x00476820` | `0x00476820-0x00477cb5` | 1,833 | constructor call 229개로 initialized action definition 집합 생산 |
| `0x00477f50` | `0x00477f50-0x00478246` | 231 | player command actions `61/62`와 `63/64`를 소비해 각각 `+0x254c`/`+0x254e` gate WORD `1/0` 기록 |
| `0x0047df30` | `0x0047df30-0x0047e040` | 65 | `0x2c10`-byte player record 전체 zero reset; 두 인접 gate 초기값 0 포함 |
| `0x0047fda0` | `0x0047fda0-0x0047fe0d` | 35 | FIFO index 0의 full 12-byte record 제거·shift·count 감소 |
| `0x0047fe10` | `0x0047fe10-0x0047feef` | 78 | action flags bit `0x8`와 produced-type `+0x20` bit `0x8`의 첫 record 제거 |

현재 전체 자동 분석 기준은 함수 2,448개, 정의된 문자열 1,545개, 내부 참조 57,572개, 간접 분기
268개와 복원된 점프 테이블 234개다. 전체 함수 요약과 호출 관계는
[`functions.json`](../../analysis/generated/imjinrok2/functions.json), 문자열 참조는
[`strings.json`](../../analysis/generated/imjinrok2/strings.json), 일반 참조는
[`references.json`](../../analysis/generated/imjinrok2/references.json), 간접 분기와 점프 테이블은
[`jump-tables.json`](../../analysis/generated/imjinrok2/jump-tables.json)에 있다.

## 함수 레코드 작성 형식

각 함수가 재분석되면 다음을 기록한다.

```text
stable id:
entry VA:
byte range:
analysis state:
working name:
prototype:
callers:
callees:
global reads:
global writes:
structure fields:
side effects:
error/early-return paths:
mechanic documents:
reproduction fixtures:
```

## 주소 이름 규칙

- 의미가 확정되기 전에는 `FUN_00482180` 같은 주소 기반 이름을 유지한다.
- 유력한 역할은 `candidateScriptLoad`처럼 후보임을 드러낸다.
- 호출자 하나의 문맥만 보고 일반 함수 이름을 확정하지 않는다.
- 코드 지점과 함수 시작 주소를 같은 것으로 취급하지 않는다.
