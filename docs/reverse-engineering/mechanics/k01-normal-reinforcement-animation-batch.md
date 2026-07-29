# K01 normal reinforcement animation batch

질문: **“K01 증원 class 12/13/82의 creation-default normal animation은 shared dispatcher/helper 계약에서 어떤 slot/frame/direction/mirror를 고르며, class 14가 왜 special exception인가?”**

- 분석 상태: `정적 확정`
- 재현 상태: `재현 완료` — canonical EXE·functions/jump-tables/seeds와 SPR SHA-256을 검사하는 focused extractor가 selector와 80개 경계 벡터를 생산한다.
- 구현 상태: `부분 이식` — class 12의 idle/move/walk/attack/death만 테마에 이식했다. simulation 정책은 변경하지 않았다.

## 근거와 복구 범위

EXE SHA-256은 `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`다. `gunj1.spr` SHA-256은 `e35c3dddfc4860d3e8ccbb7d86ecb006b11230e269d04091dcfa320dc116a7a8`다. canonical generated artifact는 EXE source SHA-256을 `functions.json`·`jump-tables.json`·`seeds.json`에 각각 기록하며, 현재 파일 SHA-256은 차례로 `7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e`, `0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f`, `8e7c8821e9c84c5d0877bb977b119b3b878271502b36bf75e7426b570507bfb7`다. `FUN_004291d0`의 class-12 dispatch는 `0x0042a752`에 도달하고 inclusive `0x0042a752-0x0042a807` block은 seed instruction/call로 다음을 만든다.

| state | helper | slot/resource | start/stride/phase |
| ---: | --- | --- | --- |
| 8 | `0x00438e50` | 114, `char\gunj1.spr` | 0 / 8 / 8 |
| 1 | `0x00438ef0` | 114, `char\gunj1.spr` | 40 / 8 / 8 |
| 2 | `0x00438f70` | 115, `char\gunj2.spr` | 40 / 8 / 8 |
| 4 | `0x004390e0` | 115, `char\gunj2.spr` | 0 / 8 / 8 |
| 7 | `0x004390b0` ×5 | 116, `char\gunj3.spr` | base 60 / stride 0 / phase 8 |

`gunj2.spr` SHA-256은 `2153ff0f336845e9ae097ceb9f0388725c9ae0f1a9b2123dfa4928fc48fbbd02`, `gunj3.spr` SHA-256은 `fc42e17581dc51b15f45368790517be49f53f2fb3d4ecb97e4a070a5ea0b04f7`이며 각각 60×60, 80 frame이다. `0x0041d210` shared dispatcher와 state 8/1/2/7/4 consumer `0x0041d870/0x0041efa0/0x0041f380/0x0041d700/0x0041e370`의 canonical body/count/hash를 함께 고정한다.

모든 normal state의 raw direction은 `1,5,4,20,16,80,64,65`이고 source base index는 `0,1,2,3,2,1,0,4`, mirror는 `false,false,false,false,true,true,true,false`다. class 13과 82 extractor의 normal direction profiles를 batch assert한다. class 14는 idle은 normal이지만 **movement/attack만** creation-default special gate와 9-base topology라 같은 normal port 대상이 아니다.

| state | source | s/sw/w/nw/n/ne/e/se phase-0 frame | mirror n/ne/e |
| ---: | --- | --- | --- |
| 8 | `gunj1` | 0/8/16/24/16/8/0/32 | yes |
| 1 | `gunj1` | 40/48/56/64/56/48/40/72 | yes |
| 2 (quarantined) | `gunj2` | 40/48/56/64/56/48/40/72 | yes |
| 4 | `gunj2` | 0/8/16/24/16/8/0/32 | yes |
| 7 | `gunj3` | 60/60/60/60/60/60/60/60 | yes |

## gates, vectors, uncertainty

class 12 flags `0x0c082805`는 idle bit `0x08` clear, state-1 mask `0x80000008` clear, attack high bit clear와 nonzero `+0x144`을 만족한다. Config/runtime fields are `BYTE +0x03` state, `DWORD +0x74` gate flags, idle `+0x92/+0x93/+0x94..`, move `+0xa6/+0xa7/+0xa8..`, state2 `+0xbb/+0xbc/+0xbe..`, attack `+0x144/+0x146/+0x148..`, death `+0x18c/+0x192/+0x194..`, phase `+0x1b2`, mirror `+0x1b5`, and normal direction `+0x1e6`. alternate-movement eligibility bit `0x04000000`은 set이다. state 2는 original movement variant까지 확정했지만 environment label과 project policy는 미확정이라 이식하지 않는다. unknown raw directions도 default 의미를 추정하지 않고 selector 입력에서 거부한다.

focused command `node --test tools/imjinrok/k01-normal-reinforcement-animation-batch.test.mjs`는 3 tests/3 passes로 각 state 8방향의 phase 0/7 source/frame/mirror(80 vectors), function/jump/seed/gunj2 tamper, flags/word-width failures를 확인한다. FPS·pivot은 project display adaptation이며 원본 tick/FPS parity가 아니다.
