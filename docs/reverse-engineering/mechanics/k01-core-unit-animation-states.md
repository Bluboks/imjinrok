# K01 class 2·3·4 핵심 유닛 애니메이션

질문: **“K01 내부 class 2 조선 창병, class 3 일본 창병, class 4 조선 궁수는 생성 기본 normal 경로에서 상태 8 idle, 상태 1 일반 이동, 상태 4 공격, 상태 7 사망에 어떤 SPR slot·frame·방향·mirror를 사용하는가?”**

- 분석 상태: `정적 확정`
- 재현 상태: `재현 완료`
- 구현 상태: `원본 기반` — generic theme의 세 visual에 frame/direction 범위만 이식했다. FPS, size, pivot은 명시적인 프로젝트 표시 적응이다.

## 입력과 범위

| 입력 | SHA-256 / 확인값 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `char/swordk.spr` | `414d285b207ba12afdd856a0f16ddde615381cf491fe493d6ededf91681b55eb`, 60×60, 192 frames |
| `char/swordj.spr` | `f3dc53b8606b09e7c65f6a9dabefcf8f6ffef4ec281ff38fb59bc9b2cf8de17e`, 60×50, 192 frames |
| `char/archerk.spr` | `5f3cf34ed44a2b011e8d4d7e51ff3974b461f903ce7d8dc37589ea1bc5af4df4`, 56×46, 176 frames |
| `analysis/generated/imjinrok2/{functions,jump-tables,seeds}.json` | EXE source hash와 canonical body/count/hash, class switch 및 initializer instruction을 함께 검사 |

`FUN_004291d0`는 `0x004292b3` switch에서 `BYTE [entity+0x37]` class를 선택한다. 세 case와
inclusive initializer 범위는 다음과 같다.

| class | 원본 이름 | flags | case 목적지와 범위 | slot / SPR |
| ---: | --- | --- | --- | --- |
| 2 | 조선 창병 | `0x04080805` | `0x00429f48..0x00429feb` | 100 / `char\swordk.spr` |
| 3 | 일본 창병 | `0x04080805` | `0x00429fec..0x0042a09a` | 101 / `char\swordj.spr` |
| 4 | 조선 궁수 | `0x04082805` | `0x0042a156..0x0042a204` | 102 / `char\archerk.spr` |

## initializer와 common consumer

`0x00438e50`, `0x00438ef0`, `0x00438f70`, `0x004390b0`, `0x004390e0`의 canonical function
body/count/hash와 각 범위의 seed instruction을 잠근다. 상태 7은 `0x004390b0` 호출 다섯 개로
five-base record를 설정한다. 표의 `start/stride/phase`는 initializer 인수이며 death의 stride 0은
동일 frame phase block을 모든 방향에 사용한다.

| class | state 8 idle | state 1 normal move | state 2 alternate move (격리) | state 4 attack | state 7 death |
| ---: | --- | --- | --- | --- | --- |
| 2 | 128 / 10 / 10 | 0 / 8 / 8 | 88 / 8 / 8 | 48 / 8 / 8 | 40 / 0 / 8 |
| 3 | 0 / 8 / 8 | 40 / 8 / 8 | 80 / 8 / 8 | 120 / 8 / 8 | 176 / 0 / 8 |
| 4 | 0 / 8 / 8 | 80 / 8 / 8 | 40 / 8 / 8 | 120 / 8 / 8 | 160 / 0 / 8 |

`0x0041d210` state dispatcher와 consumers를 함께 고정한다.

- state 8은 `0x0041d870` normal consumer이며 flags bit `0x08` clear가 필요하다.
- state 1은 `0x0041efa0` normal `WORD +0x1e6` path이며 `(flags & 0x80000008) == 0`이 필요하다.
- state 4의 class 2/3/4는 `0x0041e385` switch의 class-5 범위보다 아래라 `0x0041e3a0` default gate를
  탄다. high bit clear와 nonzero `WORD +0x144` 뒤 `0x0041e200` common consumer로 간다.
- state 7은 health-zero/action-state path의 `0x0041d700` common consumer다.

## 방향과 frame

상태 8/1/4/7은 raw direction `1,5,4,20,16,80,64,65`에 대해 source base index
`0,1,2,3,2,1,0,4`, mirror `false,false,false,false,true,true,true,false`를 공통으로 쓴다.
이는 순서대로 s, sw, w, nw, n, ne, e, se다. state 7도 같은 mirror 계약을 유지한다.

## 재현 fixture와 theme port

`tools/imjinrok/extract-k01-core-unit-animations.mjs`는 canonical EXE, generated artifacts, type
catalog, sprite table, three SPR hash/header, class switch, inclusive initializer calls와 gate bytes를
검사하고 240개의 phase boundary vector를 만든다. fixture는
`analysis/fixtures/k01-core-unit-animation-vectors.json`, focused test는
`tools/imjinrok/k01-core-unit-animations.test.mjs`다. 변조 EXE/artifact/sprite, 범위 밖 class/state/
direction/phase/word width 및 wrong normal gate는 실패한다.

`packages/shared/src/themes.ts`는 다음만 product state로 노출한다.

- `korean-swordsman`: idle 128/10/10, move/walk 0/8/8, attack 48/8/8, death 40/0/8
- `japanese-swordsman`: idle 0/8/8, move/walk 40/8/8, attack 120/8/8, death 176/0/8
- `korean-archer`: idle 0/8/8, move/walk 80/8/8, attack 120/8/8, death 160/0/8

idle/move/walk은 loop, attack/death는 non-loop이다. state 2는 원본 alternate movement variant라는
범위까지만 확정되어 있으며 환경 이름과 프로젝트 policy가 미확정이므로 named theme state로 이식하지
않는다.

## 남은 경계

- 원본 phase/update를 초 단위 FPS로 환산하는 규칙
- 원본 pivot, render scale, hit reaction 및 death lifetime
- 생성 뒤 flags mutation과 class 2 state-1 masked `+0x1e8` path
- state 2의 환경 의미와 product exposure policy
