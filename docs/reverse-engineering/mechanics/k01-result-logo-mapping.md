# K01 결과 phase → win/loss SPR frame 매핑

## 질문과 범위

K01 승패 결과가 이미 raw state `0x18` 또는 `0x1a`로 확정된 뒤, 원본 poll이 결과 phase pair를
어느 `winlogo.spr`·`loselogo.spr` payload에 연결해 raw blitter로 넘기는지 확인한다. 이 문서는
compressed payload 선택과 그 주소 계산만 다루며, 최종 clipped pixel, palette, surface compositor와
브라우저 presentation 정책은 다루지 않는다.

분석 상태는 `정적 확정`, 재현 상태는 `재현 완료`, 구현 상태는 `없음`이다. 기존 [K01 결과
presentation과 post-result 전환](k01-final-result-transition.md)의 initializer·poll·21개 table pair
검증만 입력 계약으로 재사용했다. [pannel.spr HUD blit 결합](pannel-spr-hud-blit.md)은 공통 SPR
loader 해석의 배경 참고이며 이 추출기의 실행 의존성은 아니다. 이 단위는 제품 코드를 변경하지
않는다.

## 원본 입력과 근거

| 입력 | SHA-256 | 사용 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | loader, poll, blitter의 raw bytes·함수 metadata |
| `original/imjinrok2/yfnt/winlogo.spr` | `045b64ce026386413098f339681e8ac859e641c2e28d86d6dc2a25e4fa84851e` | `250×100`, 28 frame, win payload |
| `original/imjinrok2/yfnt/loselogo.spr` | `94a33a66783eaa9ab4f458542707cc5fa81ea29c0057eabb3a659fdc39d78ad7` | `250×100`, 28 frame, loss payload |

관련 함수의 전체 structured metadata는 `analysis/generated/imjinrok2/functions.json`에서 고정했다.

| 함수 | body range | instruction 수 / metadata SHA-256 | 역할 범위 |
| --- | --- | --- | --- |
| `FUN_004434a0` | `0x004434a0-0x0044357e` | `77` / `3f38878b35ed942a336b2c68705c6adb90084f6702e5bdd46a68fffaad6cb308` | SPR header 복사, `header+bc8` payload 할당, `record+bf4` payload 포인터 저장 |
| `FUN_00493400` | `0x00493400-0x00493534` | `99` / `eea3fdcdd7ef8f773323c18a78da31223ac73a3a5c9209d34be98ebe1da58fb9` | phase pair 읽기와 offset/payload pointer 합산, `FUN_00450c10` 호출 |
| `FUN_00450c10` | `0x00450c10-0x00450d52` | `111` / `cbf4d4f73d352a8f7f967de454b924dd4526ce16aabc1ec62a82c38bbddf4ffe` | 5개 인수의 raw indexed payload blit 및 `0xfe` run 처리 |

추출기는 세 함수의 raw range도 별도로 고정한다. 아래 raw range는 모두 반열린 구간 `[start, end)`으로
표기하며, loader range는 `[0x004434a0, 0x0044357f)`, poll range는 `[0x00493400, 0x00493535)`
(RET at `0x00493534`), blitter range는 `[0x00450c10, 0x00450d53)`이다. 각각의 raw SHA-256은
fixture에 기록되어 있다. 주소 표와 공통 loader는 이 추출기의 함수 metadata·raw code·byte anchor
검증을 통과해야 한다.

## 제어·데이터 흐름

loader는 선택된 source의 `0xbf4` header bytes를 destination record에 복사하고, header의
`DWORD[record+0xbc8]`를 payload 크기로 사용한다. 성공하면 `DWORD[record+0xbf4]`에 payload
버퍼를 저장한다. header offset table은 source file offset `0x4c0`에 남고, payload bytes는
`0xbf4` 이후에 놓인다.

`FUN_00493400`은 기존 initializer가 만든 signed-WORD pair를 읽는다. K01에서 접근 가능한 21개
pair는 다음과 같다.

```text
phase 0..20 → [bank, frame] = [0, phase]
```

poll의 x86 산술은 다음 순서다.

```text
bankStride = ((3 * bank) << 7) - bank = 383 * bank
tableIndex = frame + 2 * bankStride = frame + 766 * bank
offset     = DWORD[0x00c7a070 + tableIndex * 4]
payload    = DWORD[0x00c7a7a4 + bankStride * 8]
source     = payload + offset
```

`source`가 `FUN_00450c10`의 다섯 번째 stack argument로 전달되는 callsite는 `0x004934d7`다.
bank가 0인 K01 결과에서는 `tableIndex == frame`, payload pointer는 `record+0xbf4`, offset은
SPR header `0x4c0 + frame*4`의 값이다. 따라서 phase와 source SPR frame은 `0..20`에서
일대일이며, header가 28 frame이라는 사실만으로 frame `21..27`을 reachable하다고 확장하지 않는다.

blitter는 payload에서 byte를 읽고 `0xfe`를 만나면 다음 byte를 투명 run 길이로 더한다. 그 외
literal byte는 destination에 직접 기록한다. 이 문서가 확정하는 것은 이 raw byte path와 선택된
compressed payload이며, 전체 clip 경계·palette realization·DirectDraw surface 상태까지의
동일성은 주장하지 않는다.

## 재현 자료와 벡터

독립 추출기 [`extract-k01-result-logo-mapping.mjs`](../../../tools/imjinrok/extract-k01-result-logo-mapping.mjs)는
`extract-k01-final-result-transition.mjs`의 결과만 재사용하고, 결과 로고 loader·poll·blitter의 함수
metadata·raw range·byte anchor를 직접 검증한다. [`k01-result-logo-mapping.json`](../../../analysis/fixtures/k01-result-logo-mapping.json)은
다음 생성 명령으로 결정론적으로 생성한다.

```text
node tools/imjinrok/extract-k01-result-logo-mapping.mjs --output analysis/fixtures/k01-result-logo-mapping.json
```

fixture에는 실행 파일·분석 산출물·SPR/YAV 입력 hash, 주소 계산식, win/loss 각각의 phase `0..20`
기록이 들어 있다. 각 기록은 `bank`, `frame`, `offsetTableIndex`, source SPR-relative offset,
file data offset, compressed payload 크기와 SHA-256을 보존한다. 현재 두 SPR 모두 선택 frame의
compressed payload 크기가 `25000` bytes이며 frame `phase`의 source-relative offset은
`25000 * phase`다.

집중 테스트 [`k01-result-logo-mapping.test.mjs`](../../../tools/imjinrok/k01-result-logo-mapping.test.mjs)는
다음을 확인한다.

- 두 variant의 21개 mapping과 fixture의 실제 codec header/payload bytes가 일치한다.
- 독립 x86 산술로 계산한 `bankStride`, `offsetTableIndex`, frame index가 codec parser 결과와 일치한다.
- phase `21`, `27`, 음수, 비정수와 지원하지 않는 variant를 거부한다.
- EXE, SPR, `functions.json`의 blitter metadata를 변조하면 추출이 실패한다.

## 남은 경계

원본 raw phase → compressed SPR payload 선택은 이 범위에서 `정적 확정`·`재현 완료`다. 다음 항목은
별도 증거 단위가 필요하다.

- raw blitter 출력의 전체 clipped pixel raster와 화면 compositor 순서
- palette 파일·palette entry 변환 및 결과 surface의 실제 표시 identity
- original `timeGetTime` cadence와 프로젝트 24 Hz scheduling/presentation 정책의 mapping
- raw result state 전환 이후의 사용자 입력·후속 state lifecycle

따라서 이 결과는 production result UI에 자동 연결하지 않으며, 확인된 payload frame 선택만 향후
별도 integration packet의 입력 계약으로 사용한다.
