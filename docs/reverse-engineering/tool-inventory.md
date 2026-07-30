# 분석 도구 인벤토리

기준일: 2026-07-29

이 문서는 `tools/imjinrok/`의 도구를 현재 정적 분석 계획에 맞게 분류한다. 분류는 도구의 존재나
테스트 통과 여부가 아니라, 원본 동작의 근거로 사용할 수 있는 범위를 뜻한다.

## 분류 기준

| 상태 | 의미 |
| --- | --- |
| `유지` | 현재 정적 분석·원본 데이터 처리 흐름에서 계속 사용한다. 출력의 해석 범위는 별도로 제한한다. |
| `재검증` | 탐색점이나 변환 도구로는 유용하지만 주소·오프셋·의미 가정을 새 Ghidra 산출물로 다시 확인한다. |
| `보관` | 과거 VM·동적 실험 또는 구현 감사용이다. 기본 분석 경로에서 실행하지 않고 원본 정적 근거로 사용하지 않는다. |

## 정적 분석 기반

| 파일 | 상태 | 허용 용도와 제한 |
| --- | --- | --- |
| `static-analysis-versions.env` | 유지 | Ghidra와 JDK 버전·배포 파일 SHA-256 고정 |
| `setup-static-analysis.sh` | 유지 | 사용자 캐시에 검증된 분석 도구 설치 |
| `run-static-analysis.sh` | 유지 | 원본 EXE 해시 확인, headless import, 내보내기 검증 후 결과 설치 |
| `ghidra/ExportImjinrokAnalysis.java` | 유지 | 함수·호출 관계·문자열·seed CFG·명령어·디컴파일 결과 생성 |
| `validate-static-analysis.mjs` | 유지 | 생성 JSON의 스키마·입력 해시·정렬·참조 무결성 검사 |
| `static-analysis-pipeline.test.mjs` | 유지 | 커밋된 실제 산출물과 실패 경로 회귀 검사 |
| `pe-image.mjs` | 유지 | PE 헤더, VA와 파일 오프셋의 독립 교차 검사. 함수 의미 분석에는 사용하지 않음 |
| `static-evidence.mjs` | 유지 | 전용 추출기들이 원본 해시, seed 함수 전체 본문, 원시 코드 범위와 VA 바이트 anchor를 중복 없이 검증하는 공통 helper |
| `extract-executable-refs.mjs`, `executable-refs.test.mjs` | 유지 | ASCII 문자열과 PE 위치를 탐색점으로 수집. 문자열 존재는 동작 증거가 아님 |
| `extract-mission-portrait-mapping.mjs`, `mission-portrait-mapping.test.mjs` | 유지 | `SPEECH` 소비자·ID 조회·`hero.spr` 프레임 표의 정적 확정 결과 추출과 회귀 검사 |
| `extract-speech-layout-evidence.mjs`, `speech-layout-evidence.test.mjs` | 유지 | `SPEECH` 숫자 슬롯·초상화 사각형·대사 좌표의 정적 확정 결과 추출과 회귀 검사 |
| `extract-objective-panel-layout-evidence.mjs`, `objective-panel-layout-evidence.test.mjs` | 유지 | 임무 목표 모달 전체 흐름·원본 SPR·사각형·hit test·실패 경로는 함수 해시·CFG로 정적 검증하고, 갱신 결과와 정상 로드 자원의 종료 clear-lock 성공·실패만 원본 입력 벡터로 재현 |
| `extract-objective-modal-k01-binding.mjs`, `objective-modal-k01-binding.test.mjs` | 유지 | `0x3f0` 생산과 독립 `0x3ee→0x3ec→0x3ea` 컨트롤의 마지막 활성 우선순위, signed WORD K01 인덱스 1과 K0110 목표 텍스트·K01 map·handler 결합을 EXE·스크립트·맵 해시와 전체 함수·원시 범위로 정적 검증하고 경계 벡터로 재현 |
| `extract-application-state-16-objective-control.mjs`, `application-state-16-objective-control.test.mjs` | 유지 | application state `0x16`의 complete structured direct-reference 생산 경로, Escape·gameplay-panel request producer, K01 mode 1의 `buttons201.spr` 목표 컨트롤 사각형·strict 입력·draw 조건을 정적 검증하고 연결 벡터로 재현 |
| `extract-objective-pending-action-dispatch.mjs`, `objective-pending-action-dispatch.test.mjs` | 유지 | `DAT_00552998` 직접 참조 전수, `0x3f0→0x3ee→0x3ec→0x3ea` producer overwrite, `FUN_00449090`의 목표 모달 소비·reset·surface/resource 실패를 전체 함수·jump table·바이트 anchor로 검증하고 semantic `open-objective-modal`까지 재현 |
| `extract-objective-modal-typography.mjs`, `objective-modal-typography.test.mjs` | 유지 | 목표 모달의 5인자 renderer, `Arial`/height 12/HANGEUL_CHARSET GDI font lifecycle, CP949 byte chunk·300px strict wrap·배치·실패 경로를 EXE·K0110·함수/참조/import provenance로 검증; 실제 Windows font realization·K0110 glyph 폭은 미재현으로 분리 |
| `extract-selection-panel-slot-dispatch.mjs`, `selection-panel-slot-dispatch.test.mjs` | 유지 | `FUN_004a84e0`의 complete caller/outgoing reference, 네 slot gate·kind branch·progress WORD·label 배치·surface lifecycle을 전체 함수·원시 범위·바이트 anchor로 검증하고 synthetic GDI 측정 경계를 분리해 재현 |
| `extract-single-selection-renderer-dispatch.mjs`, `single-selection-renderer-dispatch.test.mjs` | 유지 | `FUN_0045ad90`의 sole exact-one `0x0045adcd→FUN_00421390` call, lock exact-one gate, owner WORD copy, four opaque subcall·`0x600` optional call·success-only unlock·unconditional final helper 순서를 EXE/function/reference provenance로 검증하고 lock/flag bounded vector로 재현; subrenderer 의미는 확정하지 않음 |
| `extract-selection-panel-slot-lifecycle.mjs`, `selection-panel-slot-lifecycle.test.mjs` | 유지 | owner `0x005e3680`의 네 SPEECH portrait/label slot 생성·producer·reset·clear, 17-entry ID/CP949 label table, K0110 화자 결합과 optional overlay 독립 경계를 EXE·script·whole-function·structured reference로 검증하고 실패/no-op을 재현 |
| `extract-transient-formatted-overlay.mjs`, `transient-formatted-overlay.test.mjs` | 유지 | `FUN_004567c0` 전체와 sole structured caller·owner writer/producer, supplied post-call RECT의 block alignment·clamp·final blit, `FUN_00457460`의 비직관적 cache gate·fixed `(200,350)` draw·HDC 실패 순서를 exact EXE/function/reference/import provenance로 검증하고 synthetic metrics 아래 재현; fixed bottom selection panel 후보를 반증하되 gameplay concept는 확정하지 않음 |
| `extract-persistent-selection-action-boundary.mjs`, `persistent-selection-action-boundary.test.mjs` | 유지 | selection/no-selection owner·input transport와 action 115 payload-zero field-0x266 exact-one reservation/write·non-one common-write bypass, payload-one removal/no-match refund, action 107 early exit만 bounded full-result vector로 재현; queue pump·selected-action queue-count marker·state 0x0f handoff와 `FUN_0042de00/FUN_00483c50` dispatch boundary는 exact whole-function·anchor·complete structured set의 static-only 증거로 분리 |
| `extract-command-icon-frame-binding.mjs`, `command-icon-frame-binding.test.mjs` | 유지 | common loader index 18의 `button.spr` record/payload·offset table, `FUN_0048ea90` CP949 source label→runtime pointer copy, `FUN_004576c0` action/frame WORD writer, action 2/3/5/11/16/19/21/35/39와 61/62/63/64→pixel frame, `FUN_0045ad90`의 `34×34` draw path를 canonical EXE/SPR/references hash·raw range·anchor로 검증한다. disabled slot·loader failure·out-of-range는 successful draw를 만들지 않으며 product semantic mapping은 제외한다. |
| `extract-hero-priority-queue-gate.mjs`, `hero-priority-queue-gate.test.mjs` | 유지 | player record `+0x254e` WORD gate, actions 63/64 writer·전체 record reset, selection-count-zero slot 1 control, 229개 initialized action·95개 type definition의 exact 16-action named-hero 교집합을 정적 검증하고 bounded control/hit·gate write·filtered/FIFO queue removal을 full-result vector로 재현; deeper redelivery와 resource 파일명은 범위 밖 |
| `extract-magic-auto-use-gate.mjs`, `magic-auto-use-gate.test.mjs` | 유지 | player record `+0x254c` WORD의 complete direct refs·actions 61/62·전체 record reset·selection-count-zero slot 0과 `FUN_004196e0`의 sole caller·79-case table·27-call outgoing set·9-class 원본 이름을 정적 검증; bounded control/hit·gate write와 consumer case admission만 full-result vector로 재현하고 cadence·deeper effect는 static-only로 분리 |
| `extract-k01-ryu-auto-magic-path.mjs`, `k01-ryu-auto-magic-path.test.mjs` | 유지 | class 78 case, registry/live/team helpers, actions 40/59 delivery·pending consume·state/effect complete bodies와 두 switch·call projections를 source hash에 결합; cadence·선택 소유권 필드·중심 제외 8개 subtype 16 candidate gate와 manual pending/normal-attack 경계를 부분 재현 |
| `extract-k01-subtype-16-path.mjs`, `k01-subtype-16-path.test.mjs` | 유지 | action 59 loop-carried full DWORD, fixed record 생성·100-slot reset·160-WORD path·generation tracking·cleanup, subtype 16 current-slot subtype 1 재초기화와 mode 2 kind 2 dispatcher, low-active/class-95/direct kind 9 full-generation/writer-gate 및 kind 2/9 buffer/health 경계를 EXE·generated evidence에 결합해 부분 재현 |
| `extract-generic-mode1-kind2-enumeration.mjs`, `generic-mode1-kind2-enumeration.test.mjs` | 유지 | `FUN_00413700` shared branch의 kind 집합, radius 정규화·Chebyshev ring 순서·bounds·mode 1 map/mode 2 supplied-low·live/dedup·거리 감쇠·low-WORD primary override·current full reference consumer 인자와 30-entry append 경계를 EXE·functions·references·jump table에 결합해 완전 출력 벡터로 부분 재현 |
| `extract-unit-animation-pilot.mjs`, `unit-animation-pilot.test.mjs` | 유지 | 조선 창병·클래스 2 식별, 상태 1·2 이동 의미·방향·phase→frame·mirror와 특수 분기 격리 |
| `extract-k01-hero-movement-pilot.mjs`, `k01-hero-movement-pilot.test.mjs` | 유지 | K01 권율·유성룡의 클래스, 주·보조 SPR, 상태 8/1/4/7 대기·이동·공격·사망 방향·phase→frame·mirror 정적 추출 |
| `extract-k01-samurai-animation-pilot.mjs`, `k01-samurai-animation-pilot.test.mjs` | 유지 | K01 class 13 일본 사무라이의 두 SPR slot, 상태 8/1/4/7 normal path, 8방향·phase→frame·mirror와 class-specific attack wrapper 정적 추출·재현 |
| `extract-k01-japanese-farmer-frames.mjs`, `k01-japanese-farmer-frames.test.mjs` | 유지 | K01 class 31 일본 농부의 map loader→wrapper→creator zero-fill→initializer order, `+0x47a==0` creation-default state 8/1/7 slot·frame·방향·mirror를 canonical EXE/map/catalog/SPR/raw bytes로 추출·재현; state 4/nonzero branch와 mechanics는 제외 |
| `extract-k01-farmer-resource-branch-frames.mjs`, `k01-farmer-resource-branch-frames.test.mjs` | 유지 | class 7·31 `+0x47a!=0` idle/move slot·frame·방향·mirror와 `+0x45c` selector/quantity/capacity, increment, gated coordinate-indexed tile WORD storage add 흐름을 canonical EXE/functions/jump tables/references/seeds/catalog/SPR/raw evidence로 추출·재현한다. state 4, tick/FPS, pivot, stats, behavior, death lifetime, selector 이름과 tile storage add의 사람용 의미·full gather lifecycle은 제외한다. |
| `extract-k01-farmer-resource-work-frames.mjs`, `k01-farmer-resource-work-frames.test.mjs` | 유지 | class 7·31의 original visual state 10/11/16 resource-work slot·frame·direction·mirror와 dispatcher·initializer triple·resource flow raw state write를 canonical EXE/functions/references/seeds/두 SPR/raw evidence로 추출하고 96 boundary vector를 재현한다. build/repair·selector 사람용 이름, state-16 내부 조건과 product adapter는 제외한다. |
| `extract-k01-turtle-tank-animation-pilot.mjs`, `k01-turtle-tank-animation-pilot.test.mjs` | 유지 | K01 class 14 상태 8/1/4 grid, intermediate 16-ring·cadence, action-6 transient destruction·resource/tick·release를 EXE/SPR/function contract로 추출·재현; generic Facing/runtime mapping은 제외 |
| `extract-k01-konishi-animation-pilot.mjs`, `k01-konishi-animation-pilot.test.mjs` | 유지 | K01 class 82 일본 고니시의 세 SPR slot, 상태 8/1/4/7 normal consumer와 class-switch 밖 attack default gate, grid 8방향·모든 phase→frame·mirror 정적 추출·재현 |
| `extract-k01-korean-farmer-core-frames.mjs`, `k01-korean-farmer-core-frames.test.mjs` | 유지 | K01 class 7 조선 농부의 canonical EXE/functions/jump-tables/seeds/map/catalog/`farmerk.spr`를 교차 검증한다. map-loader→wrapper→creator의 full zero와 `+0x45c` callee zero, class-7 initializer와 helper zero branch를 연결해 `+0x47a==0` source-created 범위의 state 8/1/7 slot·frame·direction·mirror만 재현하며 nonzero resource/carry·state 4·timing은 제외한다. |
| `extract-k01-hero-basic-attack-pilot.mjs`, `k01-hero-basic-attack-pilot.test.mjs` | 유지 | K01 두 영웅의 일반 공격 상태·효과 phase·회복 카운터·payload, 권율 직접 피해와 유성룡 투사체 생성 정적 추출·재현 |
| `extract-k01-ryu-projectile-pilot.mjs`, `k01-ryu-projectile-pilot.test.mjs` | 유지 | 유성룡 subtype `0x0c`의 slot·레코드·보수적 port accepted 좌표 subset `0..32767`·control-word 비행 분기·도착 dispatcher·effect kind `9` WORD 피해·raw health gate와 실패 경로 정적 추출·재현; 원본 caller 전체 좌표 범위는 미확정 |
| `extract-k01-projectile-pool-cadence.mjs`, `k01-projectile-pool-cadence.test.mjs` | 유지 | main message loop→scheduler→투사체 풀의 유일 call chain, scheduler의 13개 resolved direct call raw 조건·pre-clock/post-pool 순서, selector·feedback·DWORD millisecond gate와 거부 경로 재현; callee 의미·fixed FPS·24 Hz exact mapping은 확정하지 않음 |
| `extract-k01-hero-targeting-range.mjs`, `k01-hero-targeting-range.test.mjs` | 유지 | K01 두 영웅의 full DWORD 대상 writer, low-WORD 검사, raw relation 필터, Y-major 자동 scan, WORD/DWORD wrap 사거리와 취소·이동·재검사 전이 추출·재현; 프로젝트 참조·좌표·footprint mapping은 미확정 |
| `extract-k01-hero-death-lifecycle.mjs`, `k01-hero-death-lifecycle.test.mjs` | 유지 | K01 두 영웅의 signed-health 행동 6 진입, incoming cadence/runtime flags별 phase·행동 7/`0x16`·조건부 release, health→slot→generation 무효화와 확인한 경로의 direct eager-clear 부재를 정적 추출·재현; runtime flag 도달·alias write·24 Hz mapping은 미확정 |
| `extract-k01-beacon-k0120-trigger.mjs`, `k01-beacon-k0120-trigger.test.mjs` | 유지 | K01 raw-relation blocker, 1,200-slot 봉화대 세 active gate·match, flag·script busy·loader 0/1·void start, 같은 scan 반복, signed-WORD 증원 descriptor, selector 5 raw grid, 조건부 post-state 반환을 정적 추출·재현; 승리 결과와 runtime mapping은 포함하지 않음 |
| `extract-k01-reinforcement-identity-map.mjs`, `k01-reinforcement-identity-map.test.mjs` | 유지 | native descriptor, 타입 카탈로그·K01 map·class 12/13/14 primary와 class 82의 세 SPR, 여섯 conversion manifest와 current sprite audit/K01 adapter provenance를 교차 검증해 요청 좌표·exact static identity/source 9/9를 확정; class 13·14·82 animation은 별도 파일럿을 링크하며 최종 배치·행동·stats는 포함하지 않음 |
| `extract-k01-opening-unit-bindings.mjs`, `k01-opening-unit-bindings.test.mjs` | 유지 | K01 map owner 1의 active class 12·13 여섯 시작 record를 canonical type catalog hash·원본 이름·primary SPR와 교차해 class 12→`japanese-gunner`, class 13→`japanese-samurai`로 제한적으로 검증한다. shared `farmerk.spr`는 canonical class 7과 K01 owner 0 class-7 record를 함께 확인해 `villager` identity를 분리한다. binding/catalog 변조는 거부하며, animation·stats·owner·movement는 범위 밖이다. |
| `extract-k01-opening-building-bindings.mjs`, `k01-opening-building-bindings.test.mjs` | 유지 | K01 active source building class 48/49/51/58/60/63의 11개 record를 canonical EXE·catalog hash/status·map·sprite table·six SPR hash/header와 교차 검증한다. 원본 이름·slot·base frame 7·source path만 `exact-static-identity-source`로 재현하며, construction/damaged/overlay/timing/pivot/stats/behavior/owner 의미는 제외한다. |
| `extract-k01-reinforcement-placement-policy.mjs`, `k01-reinforcement-placement-policy.test.mjs` | 유지 | `pnpm imjinrok:extract-k01-reinforcement-placement-policy`; K01 descriptor의 signed reuse-age slot 1..1199 선택·WORD wrap, allocate-before-bounds, slot failure/OOB/terminator, exact x/y·1×1 mode-1 occupancy overwrite를 추출·재현; 원본 pool/grid 저장 모델과 이후 이동은 포함하지 않음 |
| `extract-k01-mission-result-lifecycle.mjs`, `k01-mission-result-lifecycle.test.mjs` | 유지 | K01 general/영웅 loss latch, beacon bypass, strict wrapped timer, dispatcher pre-gate/stage와 distinct raw-tick final commit 추출·재현; raw clock·result transition·identity mapping은 포함하지 않음 |
| `extract-k01-mode-direct-writers.mjs`, `k01-mode-direct-writers.test.mjs` | 유지 | scheduler mode `WORD 0x00c06e20`의 complete canonical direct WRITE set, BP/DI zero dataflow, `FUN_00485890` arg 1/2 output과 source-bound `FUN_004a5070` arg-2 no-write closure를 EXE·generated evidence에 결합해 재현 |
| `extract-k01-final-result-transition.mjs`, `k01-final-result-transition.test.mjs` | 유지 | result state `0x18/0x1a` 이후 shared teardown, win/loss SPR·YAV 초기화, unsigned cadence/completion, `0x8c→0x96` relay와 external/stage final route 추출·재현; phase→SPR frame, timer reset, 프로젝트 24 Hz/result policy mapping은 포함하지 않음 |
| `extract-k01-mission-timer-reset.mjs`, `k01-mission-timer-reset.test.mjs` | 유지 | 표준 main state 1→broad `REP STOSD`→stage 1 K01 map copy의 timer zero·반개구간·순서를 sparse 입력으로 추출·재현; 다른 reset topology와 프로젝트 mapping은 포함하지 않음 |
| `extract-k01-global-mask-boundary.mjs`, `k01-global-mask-boundary.test.mjs` | 유지 | global mask initial/copy/direct-reference boundary; alias/computed/loader/runtime mutation 부재는 주장하지 않음 |
| `extract-building-state-pilot.mjs`, `building-state-pilot.test.mjs` | 유지 | 조선 본영·클래스 49·슬롯 141의 건설 진행도와 정상·반파 본체 프레임 정적 파일럿 |
| `extract-entity-type-catalog.mjs`, `entity-type-catalog.test.mjs` | 유지 | 클래스 1~95의 원본 이름·슬롯·기본 프레임·flags·SPR 경로 전수 추출과 결정론 검증 |
| `extract-beacon-state-pilot.mjs`, `beacon-state-pilot.test.mjs` | 유지 | 조선 봉화대·클래스 52·`firehousek.spr` 정체와 건설·정상·반파 본체 프레임 정적 파일럿 |
| `audit-sprite-mappings.mjs`, `sprite-mapping-audit.test.mjs` | 유지 | 타입 정체, 확정된 본체·초상화 범위와 미검증 프레임 매핑을 분리해 감사 |

## 원본 데이터 파서와 변환기

| 파일 | 상태 | 허용 용도와 제한 |
| --- | --- | --- |
| `asset-inventory.mjs` | 유지 | 원본 자원 파일 목록과 참조 후보 조사 |
| `extract-imjinrok-environment-assets.mjs`, `imjinrok-environment-assets.test.mjs` | 유지 | normal/snow/brown tileset의 78개씩 source path·size·SHA-256·extension/family stem과 sprite-like header/frame range를 결정론 fixture로 catalog한다. source byte 또는 header 변조는 거부하며, tile/frame 의미·renderer 연결은 주장하지 않는다. |
| `extract-imjinrok-tileset-loader-boundary.mjs`, `imjinrok-tileset-loader-boundary.test.mjs` | 유지 | `FUN_00443160`의 signed-WORD prefix selector·76-entry filename table/sentinel·record stride와 `FUN_00443320` cleanup count를 source-bound fixture로 검증한다. disk-only `diff13l.ytl`/`hill0.ypr`는 이 main table 밖으로만 기록하며 renderer/frame/map-cell 의미는 주장하지 않는다. |
| `extract-k01-source-tile-selector.mjs`, `k01-source-tile-selector.test.mjs` | 유지 | K01 map `+0x3a3a4/+0x42234+x*180+y`의 object/frame byte를 main loader normal source/header에 결합하고 3,600 pair를 digest로 재현한다. renderer parity·terrain/passability/elevation 의미는 주장하지 않는다. |
| `extract-k01-tile-placement-elevation-evidence.mjs`, `k01-tile-placement-elevation-evidence.test.mjs` | 유지 | `FUN_00469330`/`FUN_00469510`의 signed x/y·`+0x32514` low-nibble branch와 `FUN_0046d650`의 selector/lookup return을 K01 3,600-cell stream으로 재현하고 기존 source object/frame header boundary를 다시 고정한다. helper의 height/elevation 인간 의미, axis/pivot과 product renderer parity는 주장하지 않는다. |
| `extract-source-pathfinding-evidence.mjs`, `source-pathfinding-evidence.test.mjs` | 유지 | `FUN_00425b20→FUN_00445290→FUN_00444770` bounded pathfinding call, exact candidate state vector, strict score/tie, open-frontier capacity, footprint mask/OOB and fallback/postprocess call boundary를 EXE/functions/references full hashes와 raw function bodies/call edges에 결합한다. terrain producer semantics, workspace lifecycle, product coordinate/full navigation parity는 주장하지 않는다. |
| `codec.mjs`, `convert-sprites.mjs` | 유지 | SPR·YTL·PAL 구조 해석과 시각화용 변환. 게임 상태 의미는 별도 분석 |
| `convert-audio.mjs` | 유지 | 원본 음성 자원의 웹용 변환. 이벤트 타이밍의 근거가 아님 |
| `inspect-scripts.mjs` | 유지 | 원본 스크립트 레코드 탐색 |
| `map-codec.mjs`, `map-codec.test.mjs` | 재검증 | 지도 헤더·레코드 탐색에 사용하되 추론된 오프셋과 필드 의미를 교차 확인 |
| `inspect-maps.mjs`, `inspect-map-records.mjs` | 재검증 | 지도 후보 구조와 분포 조사 |
| `extract-map-terrain-mask.mjs` | 재검증 | 지형 마스크 후보 탐색. 휴리스틱 결과는 원본 형식 확정 근거가 아님 |
| `export-map-definition.mjs` | 재검증 | 포팅용 지도 생성. placeholder와 추론 필드는 원본 사실로 승격하지 않음 |
| `extract-sprite-table.mjs` | 유지 | EXE의 연속 `char\*.spr` 포인터 표를 독립 추출. 타입 정체는 타입 카탈로그와 교차 확인 |

## 기존 정적 probe와 구현 감사

| 파일 | 상태 | 허용 용도와 제한 |
| --- | --- | --- |
| `extract-animation-evidence.mjs`, `animation-evidence.test.mjs` | 재검증 | 작은 draw 레코드와 main entity 구조를 구분한 기존 주소 탐색점. 의미 확정에는 파일럿 추출기를 사용 |
| `extract-ui-layout-evidence.mjs`, `ui-layout-evidence.test.mjs` | 재검증 | UI 관련 코드 범위와 문자열의 탐색점. 기존 objective 의미는 내부 내용 RECT를 전체 패널로 오인하고 닫기 hit test를 놓쳤다. [목표 모달 파일럿](mechanics/objective-panel-layout.md)이 전체 경계와 호출 흐름으로 교정했다 |
| `extract-client-ui-layout-audit.mjs`, `client-ui-layout-audit.test.mjs` | 유지 | 정적 확정 `SPEECH` 슬롯·텍스트와 원작 3×3 research helper를, 의도적 웹 4×3/12-slot 명령 정책·초상화 scale-in·briefing base→frame fade 적응에서 분리해 감사 |
| `extract-campaign-mvp-audit.mjs`, `campaign-mvp-audit.test.mjs` | 보관 | 구현·문자열 존재 중심의 과거 MVP 판정. 현행 원작 일치 상태에 반영하지 않음 |

고정 주소의 바이트가 남아 있는지만 검사하는 테스트는 코드 변조 탐지에는 유용하지만, 사람이 붙인
`meaning`을 검증하지 않는다. 해당 주소는 `analysis/config/seed-addresses.txt`에서 시작해 전체 포함
함수와 데이터 흐름을 다시 분석한다.

## VM·디버거 기반 도구

다음 파일은 모두 `보관`이다. [동적 검증 예외 지침](../agent-guides/dynamic-validation.md)을 만족하는
좁은 질문에 한해 다시 사용할 수 있지만, Codex가 VM에서 게임 진행을 따라가는 기본 작업에는 사용하지
않는다.

- 계획·생성기:
  `extract-campaign-runtime-trace-plan.mjs`,
  `generate-campaign-x64dbg-script.mjs`,
  `extract-ui-runtime-trace-plan.mjs`,
  `generate-ui-x64dbg-script.mjs`
- 계획·스크립트 테스트:
  `campaign-runtime-trace-plan.test.mjs`,
  `campaign-x64dbg-script.test.mjs`,
  `ui-runtime-trace-plan.test.mjs`,
  `ui-x64dbg-script.test.mjs`,
  `ui-callsite-debugger-script.test.mjs`
- 실행·제어:
  `run-campaign-headless-init-capture.ps1`,
  `run-campaign-x32dbg-target-launch.ps1`,
  `run-x32dbg-attach-to-marker.ps1`,
  `send-x32dbg-command-sequence.ps1`,
  `cleanup-codex-marker-processes.ps1`,
  `inspect-x32dbg-window-tree.ps1`,
  `trace-ui-callsite-debugger.ps1`
- 런처·smoke 자료:
  `run-campaign-headless-init-smoke.cmd`,
  `run-campaign-x32dbg-target.cmd`,
  `run-x32dbg-gui-smoke.cmd`,
  `x32dbg-gui-script-smoke.xdbg`,
  `x64dbg-headless-smoke.xdbg`,
  `x64dbg-headless-target-smoke.xdbg`,
  `campaign-x32dbg-capture-run-smoke-commands.txt`,
  `campaign-x32dbg-setup-smoke-commands.txt`,
  `x32dbg-gui-scriptexec-smoke-commands.txt`
- 상태 probe:
  `probe-k01-defeat-state.ps1`,
  `probe-k01-k0120-state.ps1`
- 실행 중 메모리·코드 patch:
  `patch-k01-defeat-alive-word.ps1`,
  `patch-k01-defeat-heroes.ps1`,
  `patch-k01-k0120-condition.ps1`,
  `patch-k01-k0120-control-flow.ps1`

특히 patch 결과는 경로 탐색의 보조 기록일 뿐 자연 조건, 전체 분기 또는 원본 메커니즘의 증거가 아니다.

## 현재 결론

- 0단계의 도구 분류는 완료했다. 기존 파일은 삭제하지 않고 역할과 증거 한계를 명시했다.
- 기본 분석 진입점은 `pnpm imjinrok:analyze-exe`다.
- 기존 주소 probe는 새 구조화 산출물의 seed로만 승계한다.
- VM·x32dbg 계열은 보관 상태이며 정적 분석이 막힌 좁은 질문에서만 예외적으로 재검토한다.
