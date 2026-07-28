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
| `0x00417430` | `FUN_00417430`, `0x00417430-0x004196de` | 272 / 2,468 | 일반 공격 readiness·phase·효과 전달·사이클 완료 | K01 권율·유성룡 phase·전달 분기 정적 확정 |
| `0x0041a880` | `FUN_0041a880`, `0x0041a880-0x0041a98d` | 7 / 70 | 유성룡 투사체 생성 직전 좌표 조건별 전역 객체 호출 | direct store·attacker pointer 전달 없음; callee의 전역·좌표-indexed mutation과 사람용 의미 미확정 |
| `0x0041a990` | `FUN_0041a990`, `0x0041a990-0x0041a9ae` | 1 / 5 | 공격자에 대상 참조와 상태값 1·5 기록 | 유성룡 생성 전 호출 순서 정적 확정 |
| `0x0041a9e0` | `FUN_0041a9e0`, `0x0041a9e0-0x0041aa33` | 6 / 23 | 상태 12에서 slot `+0x0a`, frame `+0x0c` 선택 | 조선 본영 범위 정적 확정, 다른 건물 base frame |
| `0x0041aa90` | `FUN_0041aa90`, `0x0041aa90-0x0041ad8b` | 44 / 219 | 건설 진행도 `+0x8c`→8단계 phase | 조선 본영 범위 정적 확정 |
| `0x0041d210` | `FUN_0041d210`, 비연속 body 3개 | 52 / 177 | 엔티티 `BYTE +0x03` 애니메이션 상태 디스패처 | class 2 상태 1·2, class 13·76·78·82 상태 1·4·7·8과 class 14 상태 8/1/4의 scoped consumer 경로 확정; 다른 class/state는 별도 |
| `0x0041d700` | `FUN_0041d700`, `0x0041d700-0x0041d7f5` | ? / 49 | standard state-7 slot·frame renderer | `+0x192/+0x194..+0x19c` 소비; class-14 creation initializer가 이 table을 구성하지 않음 정적 확정 |
| `0x0041d470` | `FUN_0041d470`, `0x0041d470-0x0041d4ee` | 10 / 26 | 방향별 main entity sprite slot `+0x0a` 설정 후보 | 호출 상태와 `+0x456` 표 |
| `0x0041d560` | `FUN_0041d560`, `0x0041d560-0x0041d67d` | 15 / 55 | 두 번째 sprite slot `+0x0a` 설정 후보 | 호출 상태와 `+0x48e` 표 |
| `0x0041e370` | `FUN_0041e370`, 비연속 body 2개 | class 점프 테이블 / 115 | 상태 4 class wrapper; class 13은 case normal, class 14는 phase-count special, class 82는 out-of-range default gate 뒤 common normal 공격 consumer로 진입 | class 13·14·82 scoped 범위 정적 확정 |
| `0x0041efa0` | `FUN_0041efa0` | 점프 테이블 포함 | 상태 1 방향·phase→frame·mirror | 클래스 2·13·76·78·82 normal path와 class 14 생성-default special path 정적 확정 |
| `0x0041f380` | `FUN_0041f380` | 점프 테이블 포함 | 내부 클래스 2의 상태 2 방향·phase→frame·mirror | 정적 확정 범위는 애니메이션 파일럿 참조 |
| `0x0041fdb0` | `FUN_0041fdb0` | 렌더 분기 포함 | main entity slot `+0x0a`, frame `+0x0c`, mirror `+0x1b5` 소비 | 나머지 draw 분기 |
| `0x004233f0` | `FUN_004233f0`, `0x004233f0-0x0042373d` | 34 / 273 | 행동 6 raw flags·cadence·signed phase 진행 | class-14 `+0x84&0x08`은 transient kind 2/4 path, full pool도 1 반환; state-7 table과 별도임을 정적 확정 |
| `0x00423740` | `FUN_00423740`, `0x00423740-0x00423753` | 3 / 7 | 행동 7 helper, 조건부 call 뒤 1 반환 | dispatcher는 helper 반환을 무시하고 현재 `+0x74 & 0x80`으로 retain/release 선택 |
| `0x00425af0` | 이동 dispatcher | 두 호출 분기 | flags `+0x74` bit `0x08`로 이동 갱신 함수 선택 | bit 설정 경로의 클래스별 적용 |
| `0x00426bf0` | `FUN_00426bf0`, `0x00426bf0-0x00426c1f` | 1 / 9 | 현재 대상 DWORD `+0x122/+0x124` 두 WORD raw clear | direct caller 2곳; 확인한 사망·release 경로에는 direct call/write 없음 |
| `0x00425b20` | `FUN_00425b20`, `0x00425b20-0x004262df` | 일반 이동 전체 경로 | 방향·좌표·phase 갱신과 상태 1·2 선택 | 상태 2 조건의 원본 사람용 명칭 |
| `0x004291d0` | `FUN_004291d0` | 클래스 점프 테이블 포함 | 내부 클래스별 애니메이션 설정 초기화 | class 13→`0x0042a492`, class 82→`0x0042ae03` 상태 8/1/4/7, class 14→`0x0042bae1` 상태 8/1/4, class 76→`0x0042a9da`, 78→`0x0042ab2a` 범위 정적 확정 |
| `0x0042a752`, `0x00438e50`, `0x00438ef0`, `0x00438f70`, `0x004390b0`, `0x004390e0` | class-12 normal reinforcement initializer/helpers | ? / block; ? / 24; ? / 24; ? / 24; ? / 6; ? / 24 | state 8/1/2/7/4 slot·base·phase setup | class 12 core state frames와 class 13/82 normal batch direction contract 정적 확정; state-2 project policy 미확정 |
| `0x00437650` | `FUN_00437650`, `0x00437650-0x00438025` | 39 / 539 | `0x558`-byte 엔티티 초기화·slot/generation·exact x/y·footprint·action/mode 기록 | K01 class 12/13/14/82 create-return의 exact placement·mode-1 occupancy 진입과 클래스 76·78 사망 flags·cadence/delay 생성 기본값 정적 확정; 이후 runtime mutation 별도 |
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
| `0x004a7a50` | `FUN_004a7a50` | 텍스트 계산 포함 | `SPEECH` 대사 폭 278, X 188, Y 190 중심 배치 | 배치 수식은 정적 확정 |
| `0x004a7b10` | `FUN_004a7b10`, `0x004a7b10-0x004a7bb3` | 7 / 73 | 대사 표시 조정과 초상화 그리기 호출 | 초상화 경로는 정적 확정 |
| `0x004a7f70` | `FUN_004a7f70` | 사각형 helper 호출 | `SPEECH` 슬롯 지우기 후보 | 전체 호출 조건 |
| `0x004a8030` | `FUN_004a8030` | 사각형 helper 호출 | `SPEECH` 슬롯 blit 후보 | 활성·비활성 표시 전체 |
| `0x004a8410` | `FUN_004a8410` | 4-case switch | 슬롯 0~3→130×120 사각형 | 정적 확정 |
| `0x004a8870` | `FUN_004a8870`, `0x004a8870-0x004a88e9` | 12 / 51 | 17개 인물 ID 조회, 실패 시 `-1` | 정적 확정 |
| `0x004a9010` | `FUN_004a9010` | 텍스트 처리 | `SPEECH` 줄바꿈·높이 계산 후보 | 글꼴과 세부 줄바꿈 규칙 |

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
