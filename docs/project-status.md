# 프로젝트 상태

기준일: 2026-09-06
기준 커밋: `0021479` (`fix: correct source fog and building placement geometry`)

## 요약

현재 저장소는 기능이 풍부한 웹 RTS 프로토타입이며, 실행 가능한 기능의 수와 원작 일치 수준은
별개다. 전체 게임 또는 K01 MVP를 완료 판정할 단계는 아니다.

현재 구현된 source-backed 범위는 다음 문서를 단일 출처로 삼는다.

- [K01 원본 맵 데이터 추출 프로토콜 v1](reverse-engineering/mechanics/k01-map-data-extraction-protocol.md)은
  60×60 K01에서 원본이 읽는 11개 채널과 해시·실패 게이트를 고정한다. `rawRasterVerticalShift`는
  원본 raw shift로만 보존하며 물리적 고도를 추론하지 않는다. 웹의 hole-free coverage와 neutral
  product elevation은 별도 `의도적 적응`이다.
- [K01 tile placement-level·object/frame boundary](reverse-engineering/mechanics/k01-tile-placement-elevation-boundary.md)는
  `FUN_0046d650`의 누락된 마지막 `LEA ... *4`를 교정해 lookup을
  `map+0x51f54+selector*0x7e90+x*180+y`로 확정했다. 기존 `0x147d5/0x1fa4` baseline은 폐기하고,
  corrected raw shift `0/16/32/48/64`와 outputY joint를 hash-bound fixture로 기록한다. 243 PNG decode의
  `746,496` RGBA pixel·0 mismatch는 별도 독립 diagnostic이며, K01 physical elevation은 계속 neutral `0`이고
  canonical coverage는 별도 product adaptation이다. 제한된 clean browser diagnostic은 대표 offset과 page error 부재를 확인했지만,
  전체 browser scenario와 원본 full parity는 미완료다.
- [원본 fog renderer 경계](reverse-engineering/mechanics/source-fog-rendering.md)는 low-nibble `0` early skip,
  center state `0`의 state `4`→`8` ordered boundary dispatch, center state `4`의 state `8` boundary dispatch,
  center state `8`의 base path와 state-8 indexed-pixel palette/LUT remap을 추가로 고정한다. 따라서 product `visible`
  center가 항상 fog composite 없는 상태라는 설명은 폐기한다. K01 base tile coverage/underlay는 유지하고,
  explored silhouette와 unseen gradient opacity는 native palette/alpha parity가 아닌 명시적 product adaptation으로
  분리한다. 전체 renderer·visibility gameplay parity는 아직 미완료다.
- [원본 엔티티 전수 시각 프로필](reverse-engineering/mechanics/original-entity-visual-profiles.md)은
  원본 타입 95개와 building renderer 35개를 생성 프로필로 연결한다. 공유 테마 경로는 확인된
  source profile을 소비하며 복잡한 overlay와 미확정 gameplay 의미는 별도 범위다.
- [원본 building placement evidence](reverse-engineering/mechanics/source-building-placement.md)는
  native signed center/footprint far-cell formula와 SPR slot pixel-dimension source를 분리해 고정한다.
  source runtime profile은 정적으로 확인된 10개 building class(48/49/50/51/52/57/58/60/62/63)의
  source-center logical extent를 shared resolver로 placement·collision·range·build work·client geometry에
  연결한다. product building renderer는 실제 interaction footprint의 elevation-aware far contact와
  polygon을 semantic-center container에 적용한다. native cell-cache producer/lifetime과 full source
  movement ownership은 아직 product parity 범위가 아니다.
- [K01 source entity runtime·admission](reverse-engineering/mechanics/k01-source-entity-runtime-admission.md)은
  v3 source runtime의 slot·generation·occupancy 상태를 정의한다. K01 opening seed와 완성
  봉화대 class-52 3×3의 명시적 construction adapter, K0120 native reinforcement admission이
  production 경로에 연결되어 있다. construction adapter는 현재 semantic blocker를 보존하고,
  live semantic owner가 이동해 남긴 stale owner만 admission-time 복사본에서 제한적으로 제거한다.
  기존 v3 save의 1×1 serialized beacon record는 이력 보존을 위해 migration하지 않는다.
- [K01 봉화대 완성·K0120 native trigger](reverse-engineering/mechanics/k01-beacon-k0120-trigger.md)와
  `packages/simulation/src/k01BeaconPolicy.ts`는 source admission에서 native 증원까지의
  좁은 정책을 연결한다. 원본 전체 scheduler·movement·death/release·result 수명주기는 아직
  이 정책에 연결되지 않았다.
- [K01 시나리오 목표 source policy adapter](development/k01-scenario-policy-adapter.md)는 source
  `triggerFlag === 1`만 `build-beacon` objective completion으로 투영하고, legacy K0120 scripted
  spawn은 source profile에서 소비 처리한다. 이 projection은 의도적 웹 적응이며 result timing과
  전체 scenario lifecycle parity를 확정하지 않는다.

상태 표기는 `구현`, `의도적 적응`, `미해결`을 분리한다. 구현은 source runtime/admission, 맵
protocol 산출물, source visual profile 소비와 기존 K01 기능의 제한된 포팅을 뜻한다. 의도적
적응은 raw map shift를 elevation으로 바꾸지 않는 정책, coverage underlay, project owner/identity,
24 Hz presentation 같은 웹 경계를 뜻한다. 미해결은 source scheduler/update 단위의 runtime 연결,
movement·death/release·result lifecycle과 브리핑부터 승패까지의 종단 scenario 통합이다.

이미 확인한 제한 범위의 세부 근거:
K0110 briefing outer update cadence도 message-vs-idle 분기, state-0x14 call chain, strict delay 경계와 one-record progression까지 정적 복원·재현했지만 exact wall-clock/fps와 CHANGETITLE sprite compositor는 미확정이다.
제한된 단위 중 브리핑 `SPEECH` 초상화와
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
범위 한정 lifecycle은 v3 source runtime admission으로 production에 연결했다. K01 전용 adapter는
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
explicit occupancy-owner grid는 v3 source runtime admission이 보존하며, 이후 scheduler와 movement는
포팅하지 않았다. 별도 [K01 occupancy-owner transition]
(reverse-engineering/mechanics/k01-occupancy-owner-transition.md)은 native create→action-1
clear/helper/writer, movement `0x32` coordinate commit, death retain/release와 active-gate 실패 뒤
stale owner 가능성을 20개 hash-bound vector로 정적 확정·재현했으며, 해당 후속 transition은
production에 연결하지 않았다.
class 12 state 2는 원본 movement variant까지만 정적 확정했으며 사람용 환경 의미와 project policy는 이식하지 않았다.
raw owner `1`→`cpu-1`, objective trigger와 attack-move도 프로젝트 적응이다. raw clock→24 Hz와
result transition/identity policy mapping도 없어 승패 수명주기는 runtime에 연결하지 않았다.
K01 opening building footprint는 별도 [K01 opening footprint anchor](reverse-engineering/mechanics/k01-opening-footprint-anchor.md)에서
class 48/49/50/51/57/58/60/62/63의 15개 source record, type `+0x14/+0x16` width/height,
centered anchor와 mask→slot-owner write/OOB 순서를 정적 확정·9개 vector로 재현했다. class 52는
opening record가 아니라 동적 건설 source class로 별도 추출했다. source runtime resolver가 이
10개 class의 source-confirmed extent와 anchor를 placement·collision·range·build work·client
geometry에 연결했지만 sprite pixel dimensions, pivot, raw owner/player 의미, native cell-cache와
full movement lifecycle은 별도 경계다.

## 현재 workspace 상태

workspace audit 기준으로 현재 `dev`의 기준 커밋은 `0021479`이며, 기존 17개 Codex 작업 브랜치의
변경은 `dev`에 통합된 상태다. 별도 sprite 작업 브랜치의 15개 5월 커밋은 통합하지 않고 보존한다.
이는 2026-08-01의 명시적 `sprite는 그냥 둘게` 선택을 따른다. `master`는 `dev`보다 뒤처져 있고,
작업 디렉터리 정리나 sprite 브랜치 삭제는 이 상태 기록의 범위가 아니다.

이전 `fd5daf5`에 포함된 placement correction의 기준 검증은 `pnpm test` `1,430/1,430` 통과·fail/skip 0,
`pnpm typecheck` exit 0, `pnpm imjinrok:verify-static-analysis` exit 0으로 확인했다. building placement
작업 이전의 historical fog-only draft는 source fog dispatch evidence와 bounded client fog rendering
correction만 포함했으며, 그 게이트 결과는 아래 current combined workspace 수치와 구분한다.
안정화된 fog draft 전체 게이트는 `pnpm test` `1,435/1,435` 통과·fail/cancelled/skipped 0,
duration `68,227ms`, `pnpm typecheck` exit 0, `pnpm imjinrok:verify-static-analysis` exit 0으로 확인했다.
이후 building placement/source-anchor와 sprite-audit provenance를 포함한 `0021479` 기준 workspace는
`pnpm test` `1,442/1,442` 통과·fail/cancelled/skipped 0, duration `71,842ms`,
`pnpm typecheck` exit 0, `pnpm imjinrok:verify-static-analysis` exit 0으로 확인했다.
현재 uncommitted source-footprint integration draft는 `pnpm test` `1,452/1,452` 통과·fail/cancelled/skipped 0,
`pnpm typecheck` exit 0, `pnpm imjinrok:verify-static-analysis` exit 0으로 검증했다. 앞의
`1,442/1,442`와 `1,435/1,435` 수치는 각각 committed baseline과 fog-only draft의 historical gate로 유지한다.

`0021479` 기준 draft의 제한된 fog browser pass는 controlled visibility injection에서 edge-only visible chunk의 state-8
selector 3, 이웃 dirty halo의 이전 edge 제거, opaque terrain 위 fog-0 depth, derived texture cleanup
`32/32`와 fresh browser error 부재를 확인했고 server 응답은 `200`이었다. 이 pass는 bounded client
rendering evidence이며 full K01 scenario 또는 native renderer parity를 뜻하지 않는다.

`0021479` 기준 building placement의 이전 bounded browser pass는 source-profile building만 native far-cell 원칙을
product actual footprint에 적용해 HQ/house/barracks의 local offset `(0,64)/(0,32)/(0,32)`와
semantic center 보존, body·enemy target·box selection hit, zoom 뒤 bounds를 확인했다. HQ는
controlled probe에서 source frames `0/8`을 명시적으로 preload한 뒤 healthy `7`, damaged `8`,
construction `0`의 서로 다른 texture가 모두 bottom `368`과 stable pick을 유지했다. 이 frame preload는
probe 조건이며 raw startup의 frame-7-only loading과 native asset lifecycle을 검증한 주장이 아니다.
현재 source-footprint integration의 client geometry 결과와 제한된 선택 QA는 [source building placement mechanics](reverse-engineering/mechanics/source-building-placement.md)에
기록한다.

커밋된 K01 work에는 source-profile removal hook과 source trigger→`build-beacon` objective projection adapter가
포함되어 있다. focused source-removal `43/43`·scenario-policy `142/142`와
독립 blocked/remove/rebuild/save sequence는 통과했다. 이 기록은 committed prior work의 provenance이며,
placement correction의 `1,430/1,430` gate는 `fd5daf5`에 귀속되며, current committed baseline은 `0021479`다.

### K01 accepted-update 재개 상태

이번 재개는 [K01 accepted source-update scheduler 경계](reverse-engineering/mechanics/k01-accepted-update-scheduler.md)를
기준으로 연구 replay의 결과 우선순위·조기 전환·호출 간 raw 상태 반환 보정을 완료·재현한 단계다.
이 bounded 보정은 production scheduler·world timing·gameplay·visual에는 연결하지 않는다.
mode/guard producer lifetime과 clock/identity projection을 확정하기 전에는 production 통합으로
넘어가지 않으며, K01 종단·browser 검증도 미완료다. 최신 검증 결과는 위 workspace 상태에 기록했다.

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
| 스크립트·맵·SPR·YAV 파서 | 도구와 K01 map-data-protocol/v1 산출물 존재 | 원본 파일·MAP/EXE 해시와 11개 K01 채널·helper arithmetic 고정 | 결정론 JSON/TS·tamper/truncate/dimension/coordinate 실패 벡터 | protocol 구현; terrain/elevation/compositor 의미는 별도 |
| 엔티티 정체·시각 프로필 | 생성된 source profile을 공유 테마가 소비; 95개 타입·35개 building renderer 프로필 연결 | 클래스 1~95 명칭·슬롯·기본 프레임·flags·경로와 source dimension/pivot 규칙 확정 | 프로필 생성기·벡터·해시/헤더 검증 | source visual profile 범위 구현; 복잡한 overlay와 gameplay 의미는 별도 |
| building placement/selection geometry | source building visual이 있는 building만 actual product footprint far contact/polygon, sprite local offset·depth·bounds selection을 소비; generic/mobile 경로 유지 | native far occupied-cell formula와 separate runtime SPR pixel-dimension fields 정적 확정 | source replay vectors·geometry golden/elevation tests·game-client typecheck | native cell-cache producer/lifetime·native footprint extents·full compositor/occupancy parity 미해결 |
| K01 캠페인 | source runtime v3가 opening seed·completed beacon adapter·native reinforcement admission을 보존하고, beacon policy와 [scenario policy adapter](development/k01-scenario-policy-adapter.md)가 source trigger→objective/native effect를 연결 | 표준 entry timer reset, 봉화대→K0120, native class/요청 좌표·slot/OOB/exact create·1×1 occupancy overwrite, source handle allocator/generation/validity/release 범위, occupancy-owner transition의 create/movement/death/release 경계, opening building 15-record footprint/anchor, class 13·14·82 scoped 핵심 animation와 class-14 16-ring/destruction, latch→timer→commit, result presentation→final route 범위 확정 | 기존 벡터와 새 objective projection boundary vectors가 문서·테스트에 추가됨; focused source-removal·scenario-policy와 독립 blocked/remove/rebuild/save sequence 통과. 최신 전체 게이트는 workspace 상태에 기록 | admission·좁은 beacon/objective projection은 구현; source scheduler/movement/death/release/result lifecycle과 종단 K01 시나리오는 미완료 |
| K02 캠페인 | 프로토타입 존재 | 제한적 | 원본 재현 없음 | K01 이후로 연기 |
| 전투 | 프로토타입, 유성룡 좌표 accepted subset `0..32767` 독립 계산 부분 이식 | K01 영웅 phase·피해·대상·사거리·투사체와 signed-health 사망·slot/reference 수명주기 확정 | 대상·투사체·scheduler 및 사망 phase·delay·stale reference 경계 재현 | 독립 단위 부분 이식; identity/좌표/24 Hz exact mapping과 opt-in 사망 정책 대기 |
| 전투 | 프로토타입 구현 존재 | K01 일반 공격 phase·회복, action 40 소유권 이전, action 59 loop-carried full DWORD와 fixed reset·tracking·subtype 16 same-slot subtype 1 전환·mode 2 kind 2, generic mode 1 kind 2 열거/callback 입력, subtype 12 kind 9 및 direct full-generation/writer gate 경계 확정 | 일반 공격 제한 범위와 class 78 선택·pending 충돌·subtype 12/16 flight/종료·generic enumeration 입력/call 경계·선택 buffer/health write 부분 재현 | K01 영웅 제한 범위 부분 재현, generic K01 mode 1 producer 미확정, 자동 마법은 분석-only |
| 이동·경로 탐색 | 구현 존재 | 후보 함수 존재 | 원본 재현 없음 | 미검증 |
| AI | 구현 존재 | 체계적 함수 지도 없음 | 원본 재현 없음 | 미검증 |
| 생산·건설·연구 | 구현 존재 | 본영·봉화대 표시 상태만 복원 | 표시 프레임 재현 | 메커니즘은 미검증 |
| 애니메이션 | 조선 창병 일반 이동, class 7·31 carry/carry-idle와 generic `gather`의 original state-10 source-layout adapter, class 7 `build`/`repair`의 original state-11 source-layout adapter, class 13 일본 사무라이와 권율·유성룡 idle·일반 이동·공격·사망 이식 | 클래스 2 상태 1·2 이동, class 7·31 source-created creation-default state 4→state-8 idle fallback·state 8·1·7·10·11·16, raw action substate 8의 state-16 fast-start/cadence numeric boundary, 클래스 13·76·78 상태 1·4·7·8과 영웅 사망 phase/update-unit 수명 확정 | 방향·phase·상태별 슬롯·flags·class 7·31 state-4 fallback·nonzero/resource-work 96-vector·state-16 numeric cadence·사망 완료/해제 경계 테스트 | state-4 이후 mutation/reachability·combat meaning, state 11/16 product mapping·사람용 의미·selector identity와 원본 update→FPS/24 Hz, opt-in 사망 수명 이식 미확정. class-7 `build`/`repair`는 state-11 의미가 아닌 의도적 source-layout adapter |
| 건물 상태 이미지 | 조선 본영·봉화대 건설 0~7·정상 7·반파 8 이식; 35 building renderer source profiles는 공유 테마가 소비 | 클래스 49·52 정체와 공통 건물 진행도·체력 분기, 35개 renderer profile 범위 확정 | 본영·봉화대 진행도·50% 체력 경계와 profile 생성 벡터 | 두 K01 본체 state 범위는 원본 기반; 나머지 K01 construction/overlay/compositor와 gameplay state는 미해결 |
| 브리핑 초상화 | 17개 ID·`hero.spr` 프레임 이식; source raw delay/frame words are metadata-only and the web scene consumes an explicit calibrated intentional-adaptation timing policy | 파서→조회→프레임 표→그리기 정적 확정; K0110 strict `>`·one-record idle-visit order is preserved without exact wall-clock claim | 추출기·클라이언트 교차 테스트와 raw-vs-calibrated policy vectors | portraits/source labels 원본 기반; briefing wall-clock/FPS는 미확정, timing policy는 의도적 적응 |
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

1. [K01 시나리오 목표 source policy adapter](development/k01-scenario-policy-adapter.md)의
   source `triggerFlag === 1` objective completion, canonical semantic-unit removal, blocker·
   destroyed·rebuild·save 경계를 현재 K01 흐름에 연결했다. focused source-removal·scenario-policy와
   독립 sequence를 통과했다. 최신 전체 게이트는 workspace 상태에 기록했다.
2. 원본 source scheduler/update 단위와 movement·health/death lifecycle의 남은 production 연결,
   그리고 result/presentation integration을 복원한다.
3. 원본 raw clock/entity-update 단위와 24 Hz·identity의 exact opt-in integration policy를
   별도 설계한다.
4. K01의 브리핑부터 승패까지 종단 적합성 시나리오를 정의하고 검증한다. K01 MVP 완료 판정은
   이 단계 이후다.

사용자가 설명한 “완성 봉화가 하나라도 있으면 미니맵 enable, 마지막 봉화 제거 시 disable”은
별도 `user-reported/unverified` 정적 분석 후속 질문이다. 현재 K01 raw effect나 원본 확정
수명주기로 소급하지 않는다.

세부 단계와 통과 조건은 [로드맵](roadmap.md)에 정의한다.
