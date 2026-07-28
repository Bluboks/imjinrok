# 프로젝트 상태

기준일: 2026-07-27

## 요약

현재 저장소는 기능이 풍부한 웹 RTS 프로토타입이다. 실행 가능한 기능의 수와 원작 일치 수준은 별개다.
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
native 증원의 원본 class·SPR와 K01 60×60 요청 좌표 9개도 교차 확인했다. K01 전용 adapter는
class 12·13·14·82 아홉 record를 각각 `japanese-gunner`, `japanese-samurai`,
`japanese-turtle-tank`, `japanese-konishi`의 exact static identity/source binding으로 연결했다.
class 13 `japanese-samurai`의 상태 8/1/4/7 frame·8방향·mirror도 정적 확정·이식했고,
class 14·82 visual은 base frame 0 still만 사용한다. generic open-point 배치가 최종 위치를
옮기거나 생략할 수 있다.
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
| K01 캠페인 | 처음부터 결과까지 프로토타입, native 증원 9개 exact static identity/source adapter | 표준 entry timer reset, 봉화대→K0120, native class/요청 좌표, class 13 핵심 animation, latch→timer→commit, result presentation→final route 범위 확정 | 요청 좌표·exact static identity/source 9/9, class 13 frame/direction, native effect·timer·presentation·route 경계 재현 | 단기 팬 리마스터 MVP, class 14·82 animation과 증원 stats/behavior·최종 배치·raw clock/result policy 미완료 |
| K02 캠페인 | 프로토타입 존재 | 제한적 | 원본 재현 없음 | K01 이후로 연기 |
| 전투 | 프로토타입, 유성룡 좌표 accepted subset `0..32767` 독립 계산 부분 이식 | K01 영웅 phase·피해·대상·사거리·투사체와 signed-health 사망·slot/reference 수명주기 확정 | 대상·투사체·scheduler 및 사망 phase·delay·stale reference 경계 재현 | 독립 단위 부분 이식; identity/좌표/24 Hz exact mapping과 opt-in 사망 정책 대기 |
| 이동·경로 탐색 | 구현 존재 | 후보 함수 존재 | 원본 재현 없음 | 미검증 |
| AI | 구현 존재 | 체계적 함수 지도 없음 | 원본 재현 없음 | 미검증 |
| 생산·건설·연구 | 구현 존재 | 본영·봉화대 표시 상태만 복원 | 표시 프레임 재현 | 메커니즘은 미검증 |
| 애니메이션 | 조선 창병 일반 이동, class 13 일본 사무라이와 권율·유성룡 idle·일반 이동·공격·사망 이식 | 클래스 2 상태 1·2 이동, 클래스 13·76·78 상태 1·4·7·8과 영웅 사망 phase/update-unit 수명 확정 | 방향·phase·상태별 슬롯·flags·사망 완료/해제 경계 테스트 | 세 scoped kind 핵심 프레임 원본 기반, 원본 update→FPS/24 Hz와 opt-in 사망 수명 이식 미확정 |
| 건물 상태 이미지 | 조선 본영·봉화대 건설 0~7·정상 7·반파 8 이식 | 클래스 49·52 정체와 공통 건물 진행도·체력 분기 확정 | 모든 진행도·50% 체력 경계 테스트 | 두 건물 본체 범위 원본 기반, 나머지 7개 미검증 |
| 브리핑 초상화 | 17개 ID·`hero.spr` 프레임 이식 | 파서→조회→프레임 표→그리기 정적 확정 | 추출기·클라이언트 교차 테스트 | 원본 기반 |
| `SPEECH` 대화 레이아웃 | 숫자 슬롯·초상화·대사 공통 배치 이식 | 640×480 슬롯 4개와 대사 좌표 정적 확정 | 추출기·배율 변환 테스트 | 확정 범위 원본 기반 |
| UI·입력 | 반응형 UI 존재 | 자원·호출 지점 후보 존재 | 원본 구조 복원 없음 | 의도적 프로젝트 UI |
| VM 동적 분석 | 과거 도구·기록 존재 | 다수 시행착오 기록 | 원시 증거가 저장소에 없음 | 보관, 기본 경로에서 제외 |

## 신뢰할 수 있는 출발점

- 원본 실행 파일의 경로와 SHA-256
- Ghidra 12.1.2가 생성한 함수 2,448개·문자열 1,545개·내부 참조 57,572개·간접 분기
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

1. K01 native 증원 class 14·82의 animation과 네 class 생성·점유 정책을 독립 복원
2. 원본 raw clock/entity-update 단위와 24 Hz·identity의 exact opt-in integration policy를 별도 설계
3. K01 HUD, 선택 패널, 목표·진행 표시와 미션 대화 전체 레이아웃을 정적으로 복원
4. K01에 등장하는 나머지 건물·유닛의 정체·상태·방향 매핑을 독립 복원
5. 브리핑부터 승패 결과까지 K01 종단 적합성 시나리오를 통과

사용자가 설명한 “완성 봉화가 하나라도 있으면 미니맵 enable, 마지막 봉화 제거 시 disable”은
별도 `user-reported/unverified` 정적 분석 후속 질문이다. 현재 K01 raw effect나 원본 확정
수명주기로 소급하지 않는다.

세부 단계와 통과 조건은 [로드맵](roadmap.md)에 정의한다.
