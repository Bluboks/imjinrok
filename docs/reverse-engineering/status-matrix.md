# 역공학 상태표

기준일: 2026-07-29

상태 용어는 [증거 및 상태 기준](evidence-levels.md)을 따른다.

## 전체 상태

| 영역 | 분석 상태 | 재현 상태 | 구현 상태 | 다음 통과 조건 |
| --- | --- | --- | --- | --- |
| PE 구조와 주소 변환 | 정적 확정 | 재현 완료 | 도구 존재 | 새 원본 변형을 받을 때 동일 검증 적용 |
| 원본 자원 인벤토리 | 추정 | 부분 재현 | 변환 도구 존재 | 전체 파일 해시 매니페스트와 파서 fixture |
| 공통 함수 지도 | 추정 | 부분 재현 | 구조화 산출물 존재 | 일반 참조·점프 테이블에서 주요 경계와 동적 인덱스 수동 검토 |
| 엔티티 타입 정체 | 클래스 1~95 이름·슬롯·기본 프레임·flags·SPR 경로 정적 확정 | 전수 추출·결정론 검증 완료 | 고유 연결 표시 이름과 봉화대 자원 반영 | flags 비트·행동·수치 의미는 메커니즘별 복원 |
| 엔티티 자료구조 | 추정 | 미재현 | 별도 프로젝트 모델 존재 | 생성·읽기·쓰기 경로 교차 확인 |
| 게임 틱과 메인 루프 | 투사체 pool 범위의 message-loop→scheduler, millisecond gate와 accepted-step 호출 수 정적 확정; 그 밖의 subsystem update 순서는 미확인 | 해당 raw selector·feedback·wrap·거부 벡터 재현 완료 | 독립 포트와 24 Hz loop는 미연결 | 다른 subsystem 업데이트 순서와 24 Hz port scheduling 정책 결정 |
| K01 봉화대 트리거 | raw-relation blocker→1,200-slot 완성 record scan→flag·K0120·native effect→post-state 반환과 descriptor slot/OOB/exact create·1×1 occupancy overwrite 정적 확정 | trigger 분기·descriptor·selector·return, slot/경계/overlap/WORD-wrap 및 타입/SPR·요청 좌표 9개 재현 완료 | K01 adapter 9개 exact static identity/source; K01-only in-bounds exact request-position create 부분 이식; 핵심 animation 일부 이식 | class 12 state-2·class 14 generic Facing/runtime tick, 네 class stats/behavior, raw owner, 원본 1,200-slot/generation/occupancy-owner 저장 모델·이후 movement |
| K01 시작 유닛 class 7·11·12·13·16·31 binding | K01 map active class 7·11·12·13·16·31 record, catalog 정체·primary SPR와 class 7·11·16 및 class 31 initializer/helper의 scoped core frame을 정적 확정 범위로 결합; class 7·31 `+0x47a==0` state 8/1/7과 `+0x47a!=0` state 8/1 idle/move frame·direction·mirror, 후자의 좁은 selector/quantity/capacity→coordinate-indexed tile WORD storage add 흐름을 포함 | canonical function·initializer·map·SPR 변조 거부와 core/nonzero frame vector 재현 완료 | class 7 `villager`와 class 31 `japanese-farmer`의 idle/move/walk/death 및 `carriedResource.amount > 0` adapter의 carry/carry-idle frame·direction·mirror를 부분 이식; gameplay/stats/commands는 미연결 | class 7·31 state 4, FPS/pivot/stats/behavior, owner/movement, selector 이름·tile storage add의 사람용 의미와 full gather lifecycle을 별도 정적 분석 |
| K01 승패 판정 | 표준 mission-entry broad timer reset→general/영웅 latch→timer→distinct-tick commit과 shared teardown→SPR/YAV poll→relay→external/stage route, scheduler mode WORD의 complete direct writer set과 argument-2 no-write path 범위 정적 확정 | reset 반개구간·순서, timer wrap/overflow와 result cadence·cleanup·state overwrite·WORD wrap 및 mode writer fixed-width vector 재현 완료 | 프로토타입, 원본 정책 미연결 | concrete argument-1 producer 또는 other-writer persistence/order와 raw clock·asset/result identity policy exact mapping 뒤 isolated opt-in 연결 |
| 전투·피해 | K01 영웅 phase·피해·대상·사거리·subtype `0x0c`, class 78 action 40/59·fixed reset/tracking·subtype 12/16·generic kind 2 enumeration 및 signed-health 행동 6/7·slot/reference 수명주기 정적 확정 | 대상·투사체·scheduler, delivery·flight/종료·buffer/health write·stale-reference 경계 재현 완료 | 프로토타입, 유성룡 독립 계산 부분 이식; 자동 마법·사망 수명 미이식 | generic consumer callback, K01 mode 1 producer, 좌표·identity·24 Hz mapping과 opt-in 연결 |
| 이동·경로 탐색 | 추정 | 미재현 | 프로토타입 | 좌표·경로 레코드와 실패 경로 복원 |
| K01 map field·global mask boundary | 정적 확정 | 재현 완료 | 없음 | alias/computed writer, global producer, loader/runtime mutation, derived flag writer와 ordering 분석 |
| 생산·건설·연구 | 조선 본영·봉화대 표시 진행도, action 115 admission/removal와 hero-priority gate·16-action named-hero filter 정적 확정; SPEECH 결합 가설 반증 | 건물 프레임, SPEECH lifecycle, bounded input/action 115 dispatch·hero-priority control/write/filtered FIFO pop 재현 | 메커니즘은 프로토타입, responsive·다중 선택 selection panel은 프로젝트 superset | remembered reservation owner, full production state/post-dispatch와 original construction/research producer 복원 |
| AI | 미확인 | 미재현 | 프로젝트 구현 | 원본 의사결정 함수 지도 |
| 애니메이션 | K01 class 2·3·4·7·11·12·13·16·31·82 scoped core states, class 14 상태 8/1/4와 16-ring·transient destruction, 두 영웅 상태 1·4·7·8 정적 확정; class 7·31은 `+0x47a==0` state 8/1/7 및 `+0x47a!=0` state 8/1 frame·direction·mirror를 포함 | 방향·phase·상태별 슬롯·flags, class 7/31 nonzero branch와 class 14 turn/effect tick 경계 및 K01 영웅 사망 완료/해제 경계 재현 | class 7·31 idle/move/walk/death와 `carriedResource.amount > 0` adapter의 carry/carry-idle, class 2·3·4·11·12·13·14·16·82 grid 핵심 상태, 두 영웅 핵심 상태 이식; resource adapter는 original field를 일반화하지 않음 | class 7·31 state 4·FPS/pivot/stats/behavior, class 2/3/4·12 state 2 project policy, 원본 update→FPS/24 Hz 변환 |
| 건물 상태 이미지 | 조선 본영·봉화대 본체 건설·정상·반파 범위와 K01 시작 building class 48/49/51/58/60/63의 identity·source·slot·catalog base frame 7 정적 확정 | 모든 진행도·50% 경계 및 opening building 11 record·catalog·SPR 변조 거부 재현 완료 | K01 시작 building product binding 완료; class 49 본체는 별도 검증 범위, class 48/51/58/60/63은 base frame 7만 이식 | class 49 범위 밖 construction/damaged/overlay, 모든 opening building timing/pivot/stats/commands/behavior/raw owner 의미 |
| 브리핑 초상화 | 정적 확정 | 재현 완료 | 원본 기반 | 새 원본 변형에도 추출기·클라이언트 교차 검증 적용 |
| `SPEECH` 대화 레이아웃 | 정적 확정 | 재현 완료 | 확정 좌표 원본 기반 | 제목·목표·버튼·글꼴을 별도 분석 |
| K01 공통 임무 목표 모달 결합 | frame/content/dismiss·K01 text·strict release·ordered dispatcher와 GDI font 요청·CP949 byte renderer·유효 폭 300 규칙 정적 확정 | lifecycle 재현 완료; typography 제어 흐름은 공급한 synthetic GDI metrics 아래 부분 재현; 프로젝트 lifecycle 테스트 | 검증된 raster·기하·text·strict release와 base wrap width 300은 원본 기반; HUD trigger/event는 프로젝트 전용, font realization·glyph 측정·Korean wrap·backdrop·Escape·responsive blocker는 의도적 적응 | gameplay-panel 표시 정체, mechanism source, 원본 실현 font/metrics·빈 문자열 `SIZE.cy`·dismiss visual·sound |
| UI·입력 | 기존 범위에 더해 class 78 auto origin 1과 manual origin 0의 pending-store 우선순위·일반 공격 short-circuit, 9-slot command-grid의 successful `button.spr` `34×34` source binding·strict edge, `pannel.spr` `640×163` `(0,0)` locked blit과 grid 선행 order, exact-one `FUN_00421390` lock·owner flag·unlock·final-helper dispatch order 정적 확정 | class 78 자동 action 40/59 record와 manual-block/replace·source-invalid·no-op 경계 부분 재현; command-grid exact rectangle/strict edge와 loader·blit gate failure, selected renderer의 lock failure/success·`0x200`/`0x400` call order 재현 완료 | 원본 3×3 geometry·strict hit helper/test는 research evidence로 유지; K01 `imjinrok-k01-opening` runtime의 generic 4×3 12-slot grid와 selection panel의 반응형·다중 선택·mana·추가 상태, action label/semantics·HUD background placement는 의도적 프로젝트 UI | remembered right-click reservation action/owner, 나머지 8개 magic-auto class effect, outer input/entity update 순서, computed-alias writer 부재·selected renderer subcall semantic contents·runtime surface semantic owner |
| 음향·연출 | 미확인 | 미재현 | 부분 구현 | 이벤트와 자원 매핑 복원 |

## 주의

- 표의 `추정`은 유용한 주소나 부분 해석이 있다는 뜻이지 원작 일치가 확인됐다는 뜻이 아니다.
- 현재 구현 테스트는 재현 상태를 올리지 않는다.
- 과거 VM 기록은 이 표의 상태를 자동으로 올리지 않는다.
- PE 기반선은 Ghidra 12.1.2로 함수 2,448개·문자열 1,545개·내부 참조 57,572개·간접 분기
  268개·점프 테이블 234개·seed 198개/포함 함수 190개를 2회 생성해 산출물 해시가 일치했다.
- 공통 함수 지도의 `부분 재현`은 자동 분석 결과의 결정론을 뜻하며, 함수 역할이 정적 확정됐다는 뜻이 아니다.
- 95개 원본 타입의 정체·자원은 전수 확정했다. 현행 26개 비주얼 중 25개는 원본 타입 하나와
  고유하게 연결된다. `farmerk.spr`는 두 타입이 공유하지만 K01 source-created class-7 creator
  경계로 `villager`를 조선 농부로 분리했으며, `advtowerj.spr`만 원본 타입 정의에 없어 `unbound`다.
- 조선 본영과 봉화대 본체 상태 2개는 `scoped-static-proven`, 정체와 일부 또는 미확정 프레임이
  함께 있는 23개는 `mixed`, 나머지 1개는 `unverified`다.
- 권율은 클래스 76 `generalk11/12/13.spr`, 유성룡은 클래스 78 `generalk31/32.spr`로
  분리했다. 두 영웅의 상태 8 idle, 상태 1 일반 이동, 상태 4 공격, 상태 7 사망의 슬롯·프레임·
  방향은 정적 확정·이식했다. 두 공격 모두 효과 phase는 7이며 권율은 직접 피해, 유성룡은
  subtype `0x0c` 투사체임을 정적 확정·재현했다. 유성룡 투사체는 보수적인 `0..32767`
  accepted subset에서 매 14번째 signed-word 경로
  점을 소비해 도착하면 effect kind `9`를 저장 대상에 적용하고, 대상 부재·세대 불일치에서도
  레코드를 반환한다. pool은 원본 scheduler가 승인한 step마다 한 번 갱신되지만 message queue와
  가변 millisecond interval 때문에 fixed FPS가 아니며 24 Hz exact mapping은 없다. 이 계산은
  부분 이식했지만 좌표 변환과 scheduling port 정책, 실제 전투 연결은 미확정이다. signed health
  0부터 행동 6 phase와 runtime flags에 따른 행동 7 유지/active slot 해제는 정적 확정·재현했다.
  확인한 사망·해제 경로는 다른 record의 `+0x122`를 direct eager clear하지 않는다. runtime
  flag writer의 K01 도달 가능성과 alias write는 미확정이다. 원본 update 단위와 프로젝트
  24 Hz·identity mapping이
  없어 이 수명주기는 미이식이다.
- `SPEECH` 초상화 17개는 EXE 조회 표와 `hero.spr` 프레임 표를 추출해 `정적 확정`했다.
- K01 봉화대 trigger는 blocker가 0이고 flag WORD가 0일 때만 1,200 slot을 훑는다. match마다
  flag를 먼저 1로 쓰고, script busy이면 load/start만 생략하며 네 native effect는 계속 실행한다.
  idle이면 loader의 `0/1` 반환을 검사하지 않고 void start를 호출한다. post-state는 최종 flag가
  정확히 1일 때만 native block 뒤에서 읽는다.
  같은 scan의 복수 match는 반복되고, scan 뒤 flag가 정확히 1이며 script context `+8`이 0일
  때만 1을 caller에 넘긴다. flag reset과 native raw state의 사람용 의미는 미확정이다.
- K01 updater는 general raw presence, 봉화대 direct return, class 76, class 78 순으로 처리한다.
  loss timer zero일 때만 result clock을 기록하지만 clock 자체가 zero면 같은 invocation에서
  재기록할 수 있다. 공통 resolver의 strict `0x7d0`, signed overflow와 win-first 동시 timer,
  dispatcher pre-gate/timer 우선, distinct raw global tick result commit은 정적 확정·재현했다.
  raw clock→24 Hz와 result/identity policy mapping은 미확정이라 runtime에는 연결하지 않았다.
- 표준 main state 1 진입은 stage-specific map 선택 전에 `[0x007c5ed8,0x00843980)`을
  DWORD zero-fill해 win/loss timer와 K01 trigger flag 포함 DWORD를 0으로 만든다. 이는
  trigger flag 전체 수명주기나 minimap 의미를 확정하지 않는다.
- commit된 result state `0x18/0x1a`는 shared teardown 뒤 win/loss SPR·YAV initializer와
  unsigned cadence/completion poll을 거친다. exact-one wrapper는 target `0x1c`를 `0x8c→0x96`
  relay로 전달하고 final consumer는 external mode를 stage보다 우선하며 special stage,
  WORD increment/wrap과 transient `0x0a` overwrite를 적용한다. raw phase pair→SPR frame,
  프로젝트 24 Hz·result/asset policy mapping은 미확정이라 미이식이다.
- `SPEECH` 숫자 슬롯 0~3과 대사 배치는 EXE의 사각형·텍스트 계산을 추출해 `정적 확정`했다.
- K01 UI 파일럿 후보로 선택한 공통 임무 목표 모달은 `FUN_00449090`의 상태 `0x3f0/0x3f1`,
  `FUN_004a5730`·`FUN_004a5980`·`FUN_004a5ac0` 전체 흐름에서 640×480 frame
  `(112,81)-(528,317)`, 내용 영역 `(158,135)-(478,259)`, 닫기 컨트롤
  `(415,267)-(495,291)`, 엄격한 내부 hit test, 외부 one-shot 종료, draw·clear 잠금 실패,
  SPR 로더 실패와 sound/latch 부수효과를 `정적 확정`했다. 이 가운데 좌표·종료 판정·one-shot
  소비·이전 버튼 정규화·draw 순서와 정상 로드 자원의 종료 cleanup(clear 시도 및 clear-lock
  성공·실패)만 `재현 완료`·`원본 기반`으로 이식했다. 로더 내부 객체 결과와 sound/latch는
  정적-only이며, 후속 dispatcher 벡터는 실패 보고 뒤 `0x3f1`로 계속하는 제어 효과만 재현한다.
  변조 추출기 입력 거부 테스트를 로더 실패 재현으로 세지 않는다. `DAT_00552998`의 완전한 구조화
  직접 참조 집합에는 literal `0x3f0` 쓰기가 없지만, 후속 분석은 `FUN_004495e0`의
  `0x004496b5`가 컨트롤 반환을 `0x3f0`으로 만들고 `FUN_00449090`의 `0x00449105`가 이를
  상태 WORD에 기록하는 return-value 경로를 복원했다. 한국 캠페인 1단계는
  `FUN_0048d690`에서 `DAT_0088afcc=1`을 기록하고, 이 인덱스는 `script\k0110`의 목표
  텍스트·`stagemap\k01.map`·K01 handler `FUN_0048a5c0`에 함께 결합된다. 이 결합 범위는
  `정적 확정`·`재현 완료`지만 분석 전용이다. 후속 분석은 application state 3에서
  Escape 또는 strict gameplay-panel press/release가 request 1을 만들고 state `0x16`으로
  전환한 뒤, K01 mode 1의 `buttons201.spr` 컨트롤 `(264,110)-(376,138)` strict release가
  `0x3f0`을 만드는 연쇄를 정적 확정·재현했다. structured direct-reference 집합 밖의 간접 state
  write는 없다고 단정하지 않는다. 이어 `FUN_00449090`이 살아남은 `0x3f0`을
  `FUN_004a5730` 호출로 소비해 `0x3f1`로 전진하고, dismiss에서 `1000` reset 뒤 resource
  release·clear 시도를 수행하는 흐름과 surface/resource 실패를 재현했다. 확정 의미는 숫자 상태를
  노출하지 않는 `open-objective-modal` UI-domain 계약으로만 이식했다. 후속 프로젝트 구조 감사는
  K01 HUD objective button을 명시적인 project trigger로 삼아 `UIScene`의 독립 presenter까지
  event를 전달했다. 후속 typography 분석은 GDI `Arial`, logical height 12,
  `HANGEUL_CHARSET`, CP949 byte chunk와 내부 유효 폭 300을 정적 확정했다. 유효 base 폭 300만
  같은 vector로 이식했고 실제 Windows font realization·K0110 glyph 폭·줄 분할은 미재현이다.
  따라서 font family/size·Canvas glyph 측정·Korean wrap·backdrop·Escape·responsive blocker는
  의도적 적응이다. 원본 mechanism 발행 source,
  gameplay-panel의 사용자 노출 정체와 원본 dismiss visual·sound는 미확정이다. 실행 중 목표 추적
  HUD는 별도 프로젝트 전용 구현이다.
- 내부 클래스 2의 원본 이름은 `조선 창병`으로 확정했다. 프로젝트 ID `swordsman`은 호환용 별칭이며
  상태 1·2는 모두 이동 비주얼이다. 상태 1 일반 이동은 이식했지만 상태 2의 사람용 환경 명칭,
  idle·전투와 전투 수치는 아직 확정하지 않았다.
- 조선 본영은 진행도 `0/10/20/30/40/50/70/100` 경계와 정상 frame 7, 반파 frame 8을
  정적 확정·재현·이식했다.
- 조선 봉화대는 클래스 52·`firehousek.spr`로 바로잡고 같은 건설 경계, 정상 frame 7, 반파
  frame 8을 독립 교차 확인·이식했다.
- K01 `field_0x00032514`의 `map+0x32514+x*180+y` 표준 주소형은 21 occurrence(16 read, 5 direct
  writer)로 닫았다. 다섯 writer는 low nibble을 정확히 1 또는 2로 만들지만, alias/computed writer와
  global mask·derived flag producer는 이 결과에 포함하지 않는다.

## 파일럿 승격 목표

### K01

- 분석 상태: `추정` → `정적 확정`
- 재현 상태: `미재현` → `재현 완료`
- 구현 상태: `프로토타입` → 브리핑부터 승패까지 검증된 K01 팬 리마스터 MVP
- K02: K01 완료 뒤의 별도 후속 마일스톤

### 공격 주기

- 분석 상태: K01 두 영웅의 raw 대상 생산·검사·자동 scan, 사거리·접근/취소와 signed-health
  행동 6/7·slot/reference 사망 정리는 `정적 확정`; 원본 참조·좌표·identity의 프로젝트
  mapping은 계속 `추정` 또는 `미확인`
- 재현 상태: 대상 inactive·range wrap/boundary·scan tie/실패와 두 영웅 phase·피해,
  subtype `0x0c` 및 사망 phase·delay·stale-reference 정상·경계·실패는 `재현 완료`;
  전체 주기는 부분 재현
- 구현 상태: 유성룡 `0..32767` accepted coordinate subset 독립 계산은 부분 이식, 실제 전투
  연결은 원본 caller 전체 좌표 범위·좌표 변환과 24 Hz scheduling port 정책 대기

### 스프라이트 매핑

- 내부 클래스 2 `조선 창병`, 3 `일본 창병`, 4 `조선 궁수`는 상태 8/1/4/7 core frame·방향·mirror를
  정적 확정·이식했다. 세 클래스의 상태 2 alternate movement는 정적 복원했지만 제품에 매핑하지 않았다.
- 클래스 76 `조선 권율`과 78 `조선 유성룡`의 전용 SPR와 상태 8 idle·1 일반 이동·4 공격·
  7 사망 이식 완료
- 영웅 효과 phase 7은 정적 확정·재현 완료; 원본 틱→FPS 변환·피격·사망 표시 수명과 class 2/3/4
  state 2 project policy는 다음 단계
- 클래스 1~95 타입 정체·자원 카탈로그 완료
- 조선 본영과 봉화대의 건설·정상·피해 본체 프레임 선택은 `재현 완료`·이식 완료
- `SPEECH` 초상화 ID 계산식은 `hero.spr` 기준으로 `정적 확정`·이식 완료
- 나머지 행동·방향·건물 상태는 확정 전까지 현행 하드코딩 값을 프로토타입으로 유지
