# K01 일본 농부 class 31 핵심 프레임

질문: K01 map loader가 생성한 internal class 31 `일본 농부`는 creation-default 경로에서 어떤
`Farmerj.spr` slot·frame·방향을 선택하는가?

## 상태

- 분석: `정적 확정`
- 재현: `재현 완료`
- 구현: `부분 이식` — 고유 `japanese-farmer` visual의 idle/move/walk/death에만 반영했다.

## 입력과 증거

| 입력 | SHA-256 | 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | loader→wrapper→creator→initializer와 helper branches |
| `original/imjinrok2/stagemap/k01.map` | `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb` | active owner 1 class 31 records `(7,48)`, `(7,47)`, `(48,1)` |
| `original/imjinrok2/char/Farmerj.spr` | `e6cc67849a872f391c977079fc04118bf06d57b99ad8b5137b02398e26d9cdc5` | 66×56, 248 frames |

catalog record `0x00885644`는 class 31 `일본 농부`, flags `0x00081001`, slot 145,
pointer cell `0x004bc2d8`, path `char\\farmerj.spr`다.

`0x0048dbe0`는 최대 800 map record를 순회해 `0x0048dcca`에서 wrapper
`0x00483c50`을 호출하고, wrapper는 `0x00483c95`에서 creator `0x00437650`을 호출한다.
creator는 `0x00437656`에서 `ECX=0x156`, `EAX=0`, `EDI=entity`를 준비하고
`0x00437666 REP STOSD`로 `0x558` bytes를 zero-fill한다. class는 `0x00437b86`에서
기록되고 `0x00437f29`에서 initializer `0x004291d0`을 호출한다. 따라서 이 source-created
입력에서 initializer-time WORD `+0x47a`는 0이다.

class switch `0x004292b3`의 case 31은 `0x00429b90..0x00429c59`이다. 이 범위는
idle helper `0x00428fb0`, move helper `0x00428e10`, slot 145/start 240/phase 8의
five-facing death helper `0x004390b0`을 설정한다. helper switch의 case 31은 각각
`0x00429108`, `0x00428f1a`이며 zero branch에서 state 8 idle/start 0/phase 8와
state 1 move/start 160/phase 8을 설정한다.

## frame 규칙

normal direction profile은 raw `1,5,4,20,16,80,64,65` →
`s,sw,w,nw,n,ne,e,se`, base index `0,1,2,3,2,1,0,4`, mirror
`false,false,false,false,true,true,true,false`다.

| state | project state | slot | start | stride | phase | 범위 |
| ---: | --- | ---: | ---: | ---: | ---: | --- |
| 8 | idle | 145 | 0 | 8 | 8 | 0..39 |
| 1 | move / walk | 145 | 160 | 8 | 8 | 160..199 |
| 7 | death | 145 | 240 | 0 | 8 | 240..247 |

state 4 attack과 `+0x47a != 0` branch는 이 범위에서 `미확인`이다. visual에는 attack
clip을 추정해 추가하지 않았으며, 현재 renderer의 state candidate fallback이 idle을 고른다.
FPS, pivot, stats, commands, behavior, raw owner의 사람용 의미와 death lifetime은 프로젝트
적응 또는 미확인이다.

## 재현

[`extract-k01-japanese-farmer-frames.mjs`](../../../tools/imjinrok/extract-k01-japanese-farmer-frames.mjs)는
canonical functions/jump tables/seeds/catalog/map/SPR/raw bytes를 고정하고,
[`k01-japanese-farmer-frames.test.mjs`](../../../tools/imjinrok/k01-japanese-farmer-frames.test.mjs)는
fixture, phase/direction boundaries, state 4·nonzero branch rejection, artifact/map/SPR/EXE tamper를
검사한다.
