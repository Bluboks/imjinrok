# `fnt\pannel.spr` 공통 loader → gameplay HUD blit

## 질문과 상태

질문: 공통 SPR loader가 `fnt\pannel.spr`를 어느 runtime record에 넣고, gameplay HUD frame root는
그 record를 어떤 대상 surface에 어떤 좌표·크기로 blit하며, 그 전후 lifecycle과 draw order는 무엇인가?

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | 정적 확정 | 두 번째 common-loader record, payload field, `FUN_004475a0`의 final `FUN_0044dc70` call, `(0,0)-(640,163)`, lock/unlock, 이후 command-grid order |
| 재현 | 재현 완료 | source-bound admission, lock 실패, gate 실패, 성공 blit/unlock/order의 독립 vector |
| 구현 | 없음 | 제품 코드 변경 없음 |

이 문서는 locked prior contract인
[gameplay selection/command grid](gameplay-selection-command-panel.md)의 `pannel.spr` final-blit
미해결 항목만 닫는다. action cell 크기, selected entity visual contents, action meaning, map/terrain,
clock, 또는 현재 웹 selection panel의 원작 일치는 다루지 않는다.

## 고정 입력과 증거 레코드

- source EXE: `original/imjinrok2/imjinrok2.exe`
  - SHA-256: `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- source SPR: `original/imjinrok2/fnt/pannel.spr`
  - SHA-256: `18a58466dd95fab6d946ed6dfb0647d8a315733a6a9bfb1b069c0e3a8d81b42e`
  - header: width `640`, height `163`, frame count `1`
- consumed structured reference export:
  `analysis/generated/imjinrok2/references.json`
  - SHA-256: `df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c`
  - embedded `sourceSha256` is the same EXE hash.
- extractor: `tools/imjinrok/extract-pannel-spr-hud-blit.mjs`
- vector fixture: `analysis/fixtures/pannel-spr-hud-blit-vectors.json`
- focused test: `tools/imjinrok/pannel-spr-hud-blit.test.mjs`

추출기는 변조된 EXE·SPR·소비하는 structured-reference export를 보고서 생성 전에 거부한다. 또한
나열한 instruction window만이 아니라 다음 완전한 source range를 hash한다.

| id | VA range, end exclusive | SHA-256 |
| --- | --- | --- |
| common SPR loader | `0x00443360-0x0044343d` | `80805e69437098006c8e2efce33121e9b98a1cf279f9baa19e7c4f9e2255694f` |
| common SPR object loader | `0x004434a0-0x0044357f` | `ab4c32302ba6ba9c56fad040df9689aad63a8e03eb33cdeab7b5972368170cf0` |
| gameplay HUD frame root | `0x004475a0-0x00447bb9` | `81e6e28cf3a20e2ecd6d1f2e7ede44e646f044fbf86aa581620baa41f67f9f9c` |
| indexed sprite blitter | `0x0044dc70-0x0044dd01` | `484f8032c602d26037a2606aa0d22262e0b9688fe70415cbb4870f04824643da` |

소비하는 reference subset도 count와 canonical JSON digest로 고정한다. 즉 HUD root의
`0x0044dc70` call 1개, panel field/target handle read 8개, loader table/record reference 7개다.
따라서 stale generated reference export가 새 주장을 조용히 지지할 수 없다.

## loader record binding

`FUN_00443360` begins with table pointer `0x004bc094` and destination record `0x0088c0b8`.
`0x004433ed` adds `0x0bf8` per entry; `0x004433f3` advances the path pointer by four bytes. The second table
entry is `0x004bc098`, whose little-endian pointer is `0x004bd944`, the NUL-terminated string
`fnt\pannel.spr`.

따라서 panel destination record는 정확히 다음과 같다.

```text
0x0088c0b8 + 1 * 0x0bf8 = 0x0088ccb0
```

`FUN_004434a0`은 SPR의 처음 `0x0bf4` bytes를 해당 record로 읽은 뒤, record `+0x0bc8`의 byte
count를 allocation하고 반환 payload pointer를 record `+0x0bf4`에 쓴다. 따라서 source SPR header의
offset `+0x04`와 `+0x08` field는 다음 exact global address에 나타난다.

| field | address | source value |
| --- | --- | --- |
| width | `DWORD[0x0088ccb4]` | `640` |
| height | `DWORD[0x0088ccb8]` | `163` |
| payload pointer | `DWORD[0x0088d8a4]` | loader allocation result |

이는 visual comparison이 아닌 data-flow 주장이다. 아래 final call이 같은 세 field를 읽는다.

`FUN_004434a0`은 open/type/allocation failure에 zero를 반환한다. `FUN_00443360`은 첫 zero return만
보고하고 이후 table entry를 계속 처리한다. missing/stale payload pointer의 이후 runtime result는
복원하지 않았으므로, 해당 failure 뒤 attempted HUD blit에 관한 주장은 하지 않는다.

## final HUD blit and target

exact final consumer는 prior selection/command-grid contract로 이미 범위가 한정된 gameplay HUD frame
root `FUN_004475a0`이다. 이 함수의 `FUN_0044dc70` structured direct call은 `0x00447a0f` 하나다.
직전에 root가 읽는 값은 다음과 같다.

```text
EDX = DWORD[0x0088d8a4]  ; panel payload pointer
EAX = DWORD[0x0088ccb8]  ; height = 163
ECX = DWORD[0x0088ccb4]  ; width = 640
push EDX, EAX, ECX, 0, 0
ECX = 0x00559418
call FUN_0044dc70
```

`FUN_0044dc70`은 첫 두 stack argument를 `x`, `y`로 사용한다. destination start를
`y * DWORD[this+0x10] + x`로 만들고 positive-height row마다 supplied width를 copy한다. 따라서 이
call의 exact inclusive-origin/exclusive-bound rectangle은 다음과 같다.

```text
x = 0, y = 0, width = 640, height = 163
right = 640, bottom = 163
```

locked target은 `DAT_0054926c`이고 lock helper는 `ECX=DAT_00559418`을 받는다. blitter는
`DAT_00559418 + 0x1510`의 locked byte plane에 쓰며, `DAT_00559418 + 0x10`의 DWORD stride를 쓴다.
이는 panel blit가 쓰는 concrete destination memory를 확정한다. `DAT_0054926c`/`DAT_00559418`의
concrete DirectDraw/vtable type과 더 넓은 semantic owner name은 복원하지 않았으므로 임의 이름을
붙이지 않는다.

## gates, lifecycle, and draw order

blit path에는 다음 source condition이 모두 필요하다.

1. The selected-record computed WORD at `0x0082e9d0 + selectedRecord * 0x2c10` equals zero.
2. `WORD[0x00bcbd84]` equals zero.
3. `WORD[0x00552784]` equals zero.
4. `FUN_0044abb0(DAT_0054926c)` returns exactly `1`.

nonzero gate word는 lock이나 blit 없이 `0x00447a25`로 branch한다. `1` 이외의 lock result도
`0x00447a25`로 branch하므로, root는 이 call의 panel payload를 읽지 않고 paired unlock도 호출하지
않는다. 성공하면 `0x00447a14`가 같은 `DAT_0054926c` handle로 `FUN_0044ada0`을 즉시 호출한다.
이후 root path는 `0x00447aba`에 도달해 common selection-command grid용 `FUN_0045ad90`을 호출한다.
따라서 bounded order는 다음과 같다.

```text
panel gates → lock target → pannel.spr indexed blit at (0,0) → unlock target → selection-command grid
```

이 order는 bounded panel/root path만 다룬다. 모든 earlier/later HUD element를 분류하지 않으며,
loader 또는 DirectDraw failure의 image result도 추론하지 않는다.

## 재현 벡터와 현재 구현 경계

fixture는 source branch 순서대로 validation하는 서로 독립적인 source-domain outcome 다섯 가지를 고정한다.

- all three gate words zero plus successful lock: lock → full `640×163` blit at `(0,0)` → unlock → later grid;
- all gates zero plus failed lock: lock attempt → no payload blit or unlock → later grid;
- nonzero panel gate: no lock/blit → later grid.
- nonzero selected-record gate: global/panel/lock input을 읽지 않고 later grid.
- nonzero global gate: panel/lock input을 읽지 않고 later grid.

focused test는 reached gate에 한해 unsigned raw WORD `0..65535` 밖 value와 non-boolean lock input을
거부한다. 앞선 nonzero gate가 branch하면 malformed 또는 없는 later input을 읽지 않는 것도 검증한다.
changed EXE·SPR file과 stale structured reference export도 거부하며, command-line extractor 두 번 실행은
byte-identical JSON을 낸다.

이 slice에는 product file change가 없다. 따라서 이 source-bound analysis는 현재 responsive selection
panel의 "original-game parity" 주장이 아니다. 이 질문의 유일한 remaining direct edge는
`DAT_0054926c`/`DAT_00559418`의 runtime DirectDraw/vtable type과 semantic ownership이며, 위에서
닫힌 record-to-memory, rectangle, lifecycle, ordering 사실은 바꾸지 않는다.
