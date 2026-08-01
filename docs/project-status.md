# 프로젝트 상태

기준일: 2026-08-01

## 요약

현재 저장소는 기능이 풍부한 웹 RTS 프로토타입이다. 실행 가능한 기능의 수와 원작 일치 수준은 별개다.
K0110 briefing outer update cadence도 message-vs-idle 분기, state-0x14 call chain, strict delay 경계와 one-record progression까지 정적 복원·재현했지만 exact wall-clock/fps와 CHANGETITLE sprite compositor는 미확정이다.
전체 게임이 원작과 일치한다고 완료 판정할 단계는 아니다. 제한된 단위 중 브리핑 `SPEECH` 초상화와
대화 핵심 레이아웃은 정적 복원·재현·이식을 완료했다. 내부 클래스 2는 원본 `조선 창병`과
`swordk.spr`로 식별했으며 상태 1 일반 이동 방향·미러를 `move`·`walk`에 이식했다. 조선 본영은
건설·정상·반파 본체 프레임까지 정적 복원·재현·이식했다. 또한 내부 클래스 1~95의 원본 명칭,
스프라이트 슬롯·기본 프레임·자원 경로를 전수 복원했다. 이 카탈로그로 잘못 연결된 봉화대 자원을
`towerk.spr`에서 `firehousek.spr`로 교체하고 본체 상태까지 검증했다. K01의 권율과 유성룡도
사명대사 공유 비주얼에서 분리했다. 권율은 `generalk11/12/13.spr`, 유성룡은
`generalk31/32.spr`의 idle·일반 이동·공격·사망 프레임과 8방향·phase·mirror를 정적으로
복원해 이식했다. 두 영웅의 공격 효과 phase 7, 사이클 종료와 회복, 권율 직접 피해도 정적
복원·재현했다. 유성룡 subtype `0x0c`는 생성에 이어 보수적인 port accepted 좌표 subset
`0..32767`의 경로 비행, 도착 시 effect kind `9` 피해, 대상 소멸·세대 불일치와 레코드 반환까지
정적 복원·재현했고 독립 계산을 부분 이식했다. 투사체 풀은 원본 scheduler가 승인한 step마다
정확히 한 번 호출되지만, scheduler는 message queue와 가변 millisecond interval·raw gate에
의존해 고정 FPS가 아니다. 따라서 24 Hz와의 exact multiplier는 복원되지 않았다. 원본 caller의
전체 signed-WORD 좌표 범위는 미확정이다. 두 영웅의 raw 현재 대상 생산·검사, Y-major 자동
탐색과 권율의 inclusive footprint range·유성룡의 strict squared range는 정적 복원·재현했다.
다만 원본 참조·좌표·footprint를 프로젝트 모델로 옮기는 exact mapping, 실제 투사체 연결,
두 영웅의 signed-health 0 이후 행동 6 phase, 조건부 행동 7 유지/outer active-list 해제와
health→slot→generation 순서의 대상 참조 무효화도 정적 복원·재현했다. 생성 기본 flags와
incoming cadence 0/1의 timeline을 확정했으며, 확인한 사망·해제 경로에는 다른 엔티티의 현재
대상 참조 direct eager clear가 없다. runtime flag writer의 K01 도달 가능성과 alias write는
범위 밖이다. accepted original entity-update 단위를 프로젝트
24 Hz·identity 모델로 옮기는 exact mapping이 없어 현재 시뮬레이션의 제거 시점은 아직 원본
기반이 아니다. K01 봉화대 경로는 raw-relation blocker와 flag가 모두 0일 때의 1,200-slot
완성 record scan, flag 선행 write, K0120 busy·loader `0/1` 무검사·void start, 같은 scan 복수 match,
signed-WORD native 증원과 raw post-effect, exact post-state 반환 gate까지 정적 복원·재현했다.
같은 K01 updater 내부에서는 general raw presence를 먼저 검사하고, 그 뒤 봉화대 direct
return, 보호 영웅 class 76·78 loss latch 순으로 진행한다. 이 updater는 공통 dispatcher의
stage-1 분기에서 호출되며, dispatcher는 호출 전에 win-first strict `0x7d0` timer resolver를
검사하고 바깥 wrapper는 distinct raw global tick별 result code를 commit한다. 이 전체
call/order를 정적 복원·재현했다. K01 정상 완료는 win timer write가 아니라 봉화대 direct
AX 1이다.
commit된 state `0x18/0x1a` 뒤에는 shared teardown, 원본 win/loss SPR·YAV 초기화,
unsigned DWORD 50/2000 strict poll, `0x8c→0x96→0x1c` relay와 external/stage final route가
이어진다. exact-one gate, cleanup과 transient state overwrite·stage WORD wrap까지 정적
복원·재현했다.
표준 main state 1 mission entry에서는 stage 1 K01 map source를 선택하기 전에 broad
`REP STOSD`가 `[0x007c5ed8,0x00843980)`을 0으로 채워 win/loss timer를 초기화하는 순서도
정적 복원·재현했다.
native 증원의 원본 class·SPR와 K01 60×60 요청 좌표 9개도 교차 확인했다. source slot allocator·generation·validity·release의
범위 한정 lifecycle도 정적 분석·재현했지만 production에는 연결하지 않았다. K01 전용 adapter는
class 12·13·14·82 아홉 record를 각각 `japanese-gunner`, `japanese-samurai`,
`japanese-turtle-tank`, `japanese-konishi`의 exact static identity/source binding으로 연결했다.
class 12 `japanese-gunner`의 상태 8/1/4/7 frame·8방향·mirror, class 13 `japanese-samurai`의 상태 8/1/4/7 frame·8방향·mirror와 class 14
`japanese-turtle-tank`의 상태 8/1/4 grid frame·mirror도 정적 확정·이식했다. class 14의
intermediate 16-ring turn은 raw16과 마지막 grid-facing을 분리한 source-backed runtime adaptation으로
이식했다. project movement/attack target을 한 tick당 한 번 helper target으로 쓰는 정책과 spawn default는
원본 accepted update/time gate 또는 모든 action reachability의 원작 일치가 아니다. creation-default
transient destruction은 정적 확정·재현했지만 runtime에는 이식하지 않았다.
class 82 `japanese-konishi`의 상태 8/1/4/7도 세 source SPR의 grid frame·mirror를
정적 확정·이식했다. K01 action만 in-bounds 요청 좌표를 terrain/passability·occupancy·open-point
탐색 없이 생성하는 exact-position 정책을 부분 이식했다. 원본 1,200-slot pool, generation,
explicit occupancy-owner grid와 이후 movement는 포팅하지 않았다.
class 12 state 2는 원본 movement variant까지만 정적 확정했으며 사람용 환경 의미와 project policy는 이식하지 않았다.
raw owner `1`→`cpu-1`, objective trigger와 attack-move도 프로젝트 적응이다. raw clock→24 Hz와
result transition/identity policy mapping도 없어 승패 수명주기는 runtime에 연결하지 않았다.

## 단기 목표

단기 제품 목표는 **조선 캠페인 K01 하나를 원본 플레이 경험에 최대한 가까운 팬 리마스터 MVP로
완성하는 것**이다. OpenRA·OpenRCT 계열 프로젝트처럼 원작을 사랑한 기존 팬에게 이 프로젝트의
가능성을 실제 플레이 가능한 한 미션으로 보여주는 것이 완료 결과다.

K01 완료 범위는 브리핑, 원본 기반 맵·초기 배치, 주요 유닛·건물 정체와 표시, 이동·전투, 미션 중
대사와 봉화대·증원 스크립트, HUD·입력, 음향·연출, 승리·패배 결과까지의 연속 경험이다. 각 원작
일치 주장은 원본 바이너리·스크립트·맵·자원 정적 분석과 재현 테스트로 뒷받침한다.

K02는 이 단기 MVP의 완료 조건이 아니다. 기존 K02 프로토타입과 자료는 보존하되 K01을 완료한 뒤
별도 후속 마일스톤에서 다룬다.

## 영역별 상태

| 영역 | 현재 구현 | 원본 분석 | 재현 검증 | 현재 판정 |
| --- | --- | --- | --- | --- |
| 원본 PE·주소 변환 | 고정 Ghidra 파이프라인 존재 | 일반 참조·점프 테이블 포함 | 2회 생성 해시 일치 | 정적 분석 1단계 완료 |
| 스크립트·맵·SPR·YAV 파서 | 도구 존재 | 원본 파일 기반 | 파서별 편차 있음 | 재감사 후 유지 |
| 엔티티 정체·자원 | 고유 연결 표시 이름 반영, 봉화대·K01 영웅 자원 수정 | 클래스 1~95 명칭·슬롯·기본 프레임·flags·경로 전수 확정 | 연속성·대표 타입·공유 경로·입력 해시 테스트 | 타입 정체 정적 확정, 행동·수치 의미는 별도 |
| K01 캠페인 | 처음부터 결과까지 프로토타입, native 증원 9개 exact static identity/source adapter와 K01-only exact-position create 부분 이식 | 표준 entry timer reset, 봉화대→K0120, native class/요청 좌표·slot/OOB/exact create·1×1 occupancy overwrite, source handle allocator/generation/validity/release 범위, class 13·14·82 scoped 핵심 animation와 class-14 16-ring/destruction, latch→timer→commit, result presentation→final route 범위 확정 | 요청 좌표·slot/경계/overlap/WORD-wrap·source handle 19-vector·exact static identity/source 9/9, class 13·14·82 grid frame/direction, class-14 turn/effect, native effect·timer·presentation·route 경계 재현 | 단기 팬 리마스터 MVP, class 14 generic Facing/runtime tick, 증원 stats/behavior·raw owner, 전체 entity mega-struct와 모든 writer/alias, 원본 occupancy-owner 저장 모델·이후 movement, raw clock/result policy 미완료 |
| K02 캠페인 | 프로토타입 존재 | 제한적 | 원본 재현 없음 | K01 이후로 연기 |
| 전투 | 프로토타입, 유성룡 좌표 accepted subset `0..32767` 독립 계산 부분 이식 | K01 영웅 phase·피해·대상·사거리·투사체와 signed-health 사망·slot/reference 수명주기 확정 | 대상·투사체·scheduler 및 사망 phase·delay·stale reference 경계 재현 | 독립 단위 부분 이식; identity/좌표/24 Hz exact mapping과 opt-in 사망 정책 대기 |
| 전투 | 프로토타입 구현 존재 | K01 일반 공격 phase·회복, action 40 소유권 이전, action 59 loop-carried full DWORD와 fixed reset·tracking·subtype 16 same-slot subtype 1 전환·mode 2 kind 2, generic mode 1 kind 2 열거/callback 입력, subtype 12 kind 9 및 direct full-generation/writer gate 경계 확정 | 일반 공격 제한 범위와 class 78 선택·pending 충돌·subtype 12/16 flight/종료·generic enumeration 입력/call 경계·선택 buffer/health write 부분 재현 | K01 영웅 제한 범위 부분 재현, generic K01 mode 1 producer 미확정, 자동 마법은 분석-only |
| 이동·경로 탐색 | 구현 존재 | 후보 함수 존재 | 원본 재현 없음 | 미검증 |
| AI | 구현 존재 | 체계적 함수 지도 없음 | 원본 재현 없음 | 미검증 |
| 생산·건설·연구 | 구현 존재 | 본영·봉화대 표시 상태만 복원 | 표시 프레임 재현 | 메커니즘은 미검증 |
| 애니메이션 | 조선 창병 일반 이동, class 7·31 carry/carry-idle와 generic `gather`의 original state-10 source-layout adapter, class 7 `build`/`repair`의 original state-11 source-layout adapter, class 13 일본 사무라이와 권율·유성룡 idle·일반 이동·공격·사망 이식 | 클래스 2 상태 1·2 이동, class 7·31 source-created creation-default state 4→state-8 idle fallback·state 8·1·7·10·11·16, raw action substate 8의 state-16 fast-start/cadence numeric boundary, 클래스 13·76·78 상태 1·4·7·8과 영웅 사망 phase/update-unit 수명 확정 | 방향·phase·상태별 슬롯·flags·class 7·31 state-4 fallback·nonzero/resource-work 96-vector·state-16 numeric cadence·사망 완료/해제 경계 테스트 | state-4 이후 mutation/reachability·combat meaning, state 11/16 product mapping·사람용 의미·selector identity와 원본 update→FPS/24 Hz, opt-in 사망 수명 이식 미확정. class-7 `build`/`repair`는 state-11 의미가 아닌 의도적 source-layout adapter |
| 건물 상태 이미지 | 조선 본영·봉화대 건설 0~7·정상 7·반파 8 이식 | 클래스 49·52 정체와 공통 건물 진행도·체력 분기 확정 | 모든 진행도·50% 체력 경계 테스트 | 두 건물 본체 범위 원본 기반, 나머지 7개 미검증 |
| 브리핑 초상화 | 17개 ID·`hero.spr` 프레임 이식 | 파서→조회→프레임 표→그리기 정적 확정 | 추출기·클라이언트 교차 테스트 | 원본 기반 |
| `SPEECH` 대화 레이아웃 | 숫자 슬롯·초상화·대사 공통 배치 이식. K01 브리핑의 blank→완성 frame fade, 초상화 첫 등장 motion, 대화 중 simulation pause와 전면 click advance는 웹 포트 연출 | 640×480 슬롯 4개와 대사 좌표 정적 확정 | 추출기·배율 변환 테스트, 포트 timeline·pause ownership 단위 테스트 | 좌표·초상화 frame은 원본 기반; 도입·pause·입력 연출은 의도적 적응 |
| K0110 outer update cadence | production 변경 없음 | `PeekMessageA` idle path→state `0x14`→briefing queue, one-record/strict delay·TITLE/OBJECTIVE/SPEECH ordering 정적 확정 | hash-bound extractor·fixture·tamper/progression tests | exact wall-clock/fps와 CHANGETITLE compositor 미확정 |
| K01 공통 임무 목표 모달 결합 | 검증된 raster·기하·K0110 텍스트·strict release와 유효 base wrap 폭 300을 독립 presenter에 연결; HUD button/event는 프로젝트 전용 | 진입·dispatcher에 더해 GDI `Arial` height 12/HANGEUL_CHARSET 요청, CP949 byte chunk·strict wrap·배치·실패 경로 정적 확정 | lifecycle 재현 완료; typography 제어 흐름은 공급한 synthetic GDI metrics 아래 부분 재현 | frame/content/dismiss·action·text·유효 폭은 원본 기반; 실제 font realization·glyph 폭·Korean wrap·빈 문자열 `SIZE.cy`, gameplay-panel 정체, mechanism source, dismiss visual·sound 미확정 |
| UI·입력 | 반응형 목표 추적 HUD와 K01 generic 4×3 12-slot action grid, K01 opt-in `button.spr` command frame profile 존재 | 임무 목표 모달 확정; transient overlay 후보 반증; action 115 admission/removal, queue-count marker·type 76 state handoff와 player-scoped hero-priority·magic-auto-use gates, class 78 auto/manual pending-store·일반 공격 경계와 bounded command control 2/3/5/11/16/19/21/35/39→pixel frame 정적 확정; original 3×3 command-grid는 정적 evidence로 보존 | 기존 범위와 class 78 cadence·target admission·action 40/59 delivery·manual pending 충돌 부분 재현 | original raw queue/state/gate와 3×3 command-grid는 product에 이식하지 않는다. K01 4×3 12-slot grid와 selection UI는 의도적 프로젝트 UI이며, `attack-move`/`build` source icons는 semantic adaptation이다. |
| VM 동적 분석 | 과거 도구·기록 존재 | 다수 시행착오 기록 | 원시 증거가 저장소에 없음 | 보관, 기본 경로에서 제외 |

## 신뢰할 수 있는 출발점

- 원본 실행 파일의 경로와 SHA-256
- Ghidra 12.1.2가 생성한 함수 2,449개·문자열 1,545개·내부 참조 57,572개·간접 분기
  268개·점프 테이블 234개의 구조화된 기준선
- 내부 클래스 1~95의 원본 명칭·스프라이트 슬롯·기본 프레임·raw flags·자원 경로 카탈로그
- 원본 스크립트·맵·스프라이트·음성 파일
- PE 가상 주소와 파일 오프셋 변환 코드
- K01 봉화대와 승패 처리 주변의 주소 및 명령어 기록
- 원본 파일을 직접 읽는 일부 데이터 파서

함수의 자동 경계와 이름은 재현 가능한 탐색 기반일 뿐, 개별 역할은 전체 제어·데이터 흐름을 검토해야
정적 확정할 수 있다.

## 신뢰하면 안 되는 판정

- 현재 구현이나 테스트에 특정 함수명·문자열이 있다는 이유로 내린 원작 일치 판정
- 미리 선택한 주소의 바이트가 일치한다는 이유로 붙인 의미
- 화면을 보고 비슷하게 조정한 좌표·프레임·타이밍
- VM에서 특정 화면에 도달했다는 사실만으로 해석한 전체 메커니즘
- 원시 캡처 없이 문서에만 남은 런타임 값

## 현재 최우선 작업

1. K01 native 증원의 class 14 generic Facing/runtime tick mapping과 원본 slot/generation/occupancy-owner 저장 모델의 이후 소비·movement를 독립 복원
2. 원본 raw clock/entity-update 단위와 24 Hz·identity의 exact opt-in integration policy를 별도 설계
3. K01 HUD, 선택 패널, 목표·진행 표시와 미션 대화 전체 레이아웃을 정적으로 복원
4. K01에 등장하는 나머지 건물·유닛의 정체·상태·방향 매핑을 독립 복원
5. 브리핑부터 승패 결과까지 K01 종단 적합성 시나리오를 통과

사용자가 설명한 “완성 봉화가 하나라도 있으면 미니맵 enable, 마지막 봉화 제거 시 disable”은
별도 `user-reported/unverified` 정적 분석 후속 질문이다. 현재 K01 raw effect나 원본 확정
수명주기로 소급하지 않는다.
1. subtype `0x0c`/`0x10`의 bounded flight·종료와 generic mode 1 kind 2 enumeration/call 입력
   경계 뒤 consumer callback whole result, K01 mode 1 producer, 재경로 좌표 결과·
   death/reference invalidation과 `FUN_00464cc0` map field 의미를 정적으로 닫기
2. K01 일반 공격의 공격 전 대상 유효성·탐색·사거리와 원본 전역 틱 시간 단위를 닫기
3. K01 봉화대·증원·영웅 보호·승패 경로를 합성 입력으로 재현
4. K01 HUD, 선택 패널, 목표·진행 표시와 미션 대화 전체 레이아웃을 정적으로 복원 — 공통 임무
   목표 모달 자체와 `0x3f0` handler 반환 생산 경로, K01 인덱스 1→K0110 목표 텍스트 결합은
   복원했고 state `0x16`의 direct 생산, 목표 컨트롤 입력, ordered overwrite 뒤 dispatcher의
   목표 모달 소비·reset까지 연결했다. 프로젝트에서는 K01 HUD objective button을 명시적 적응
   trigger로 삼아 semantic action을 `UIScene`의 독립 presenter에 한 번 전달한다. 검증된 raster·
   geometry·K0110 text·strict release와 renderer의 유효 base 폭 300은 원본 기반이다. GDI
   `Arial`/height 12/HANGEUL_CHARSET 요청과 CP949 space wrap 제어는 복원했지만 실제 Windows
   font realization·K0110 glyph metrics는 보존 입력에 없어 font family/size·Canvas 측정·
   Korean wrap·backdrop·Escape·responsive blocker는 의도적 적응이다. 설치 매체 font
   provenance 조사는 중단한다. 선택 panel로 탐색한 `FUN_004a84e0`의 네 slot은 후속 producer
   분석에서 SPEECH 화자 portrait/label lifecycle로 확정됐고 kind는 화자 index 변경
   boolean이므로 건설·생산·연구 결합 가설은 반증됐다. gameplay 선택 UI의 실제 owner/producer,
   이어 selection 없음의 seven-slot owner와 별도로 action 115의 payload `0`이 field
   `0x266` exact-one reservation 성공에서만 add/assign bookkeeping을 수행하며 non-one
   bypass는 이를 건너뛰고 common player/type writes에 합류한 뒤 state WORD exact `1`에서
   state `0x0f` direct start 또는 non-one one-entry queue append를 수행하고, right-release
   payload `1`은 matching queue removal without caller refund 또는 no-match refund/bookkeeping
   경로로 소비됨을 확정했다. selected action queue-count marker와 produced type 76
   (`조선 권율`) state handoff/dispatch boundary도 정적으로 닫았다. `FUN_0042de00`의
   progress/completion/post-dispatch 전체 결과는 미재현이다. 별도 player record `+0x254e`
   WORD gate는 selection-count-zero slot 1의 actions `63/64`로 제어되고, action/type table
   전수 교집합이 정확히 16개 named-hero production action이라 영웅 queue 우선순위 toggle로
   정적 확정했다. control/hit·gate write·filtered/FIFO removal은 범위 한정 재현했다.
   action 115 후보는 사용자가 기억한 right-click persistent reservation을 확정하지 않는다.
   인접 player-global magic auto-use gate·actions `61/62`·9-class 영향 집합도 정적으로
   확정했고 control/hit·writer·consumer admission을 부분 재현했다. class별 cadence·target·
   delivery 전체 효과, remembered pinning의 실제 action/owner, deeper redelivery와
   production state update, gameplay-panel의 전체 화면상 정체, 원본 dismiss visual·sound와
   HUD 루트 좌표계는 남음
5. K01에 등장하는 나머지 건물·유닛의 정체·상태·방향 매핑을 독립 복원
6. 브리핑부터 승패 결과까지 K01 종단 적합성 시나리오를 통과

세부 단계와 통과 조건은 [로드맵](roadmap.md)에 정의한다.
