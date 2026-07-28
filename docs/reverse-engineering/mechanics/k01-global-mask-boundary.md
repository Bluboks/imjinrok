# K01 global mask `WORD[0x004bdfd0]` source/copy boundary

| 구분 | 상태 |
| --- | --- |
| 분석 | `정적 확정` (canonical direct-reference bounded-negative 포함) |
| 재현 | `재현 완료` (초기 WORD, OR, copy, owner 경계 vector) |
| 구현 | `없음` |

원본 입력은 `original/imjinrok2/imjinrok2.exe` (843,833 bytes,
`25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`)다. `.data`
`0x004bdfd0`의 `6a 13`은 little-endian `WORD 0x136a`다.

`references.json`의 canonical target set은 정확히 세 READ다: `0x00437e9a`
(`FUN_00437650`), `0x0045f0f0` (`FUN_0045f0f0`), `0x004659f1` (`FUN_00465960`). 이
structured set의 direct WRITE는 0개다.

새 seed `global-mask-runtime-copy`는 `FUN_0045f0f0` 전체
`0x0045f0f0-0x0045f0fc` (13 bytes, 3 instructions, raw SHA-256
`97dd35c13d3a1c70908ae6318fdfc6d29137cbaea95fa8ec9a17c661564217b5`)를 bind한다.
`0x0045f0e0` jump는 이 함수로 들어가고, 함수는 global WORD를 `0x00aa3fe8`에 copy한다.
`FUN_00437650`은 owner `WORD+0x126 <= 2`일 때 copy를, 그 외에는 global을 선택한다.
기존 [eligibility contract](k01-map-eligibility-predicate.md)는 global과 `0x2004`를 OR하며,
초기 vector는 `0x136a | 0x2004 = 0x336e`이다. predicate 전체는 중복 정의하지 않는다.

`directWriteCount == 0`은 alias/computed address, loader 또는 runtime mutation의 부재를 증명하지
않으며 producer와 update ordering도 주장하지 않는다.

```bash
pnpm imjinrok:extract-k01-global-mask-boundary
node --test tools/imjinrok/k01-global-mask-boundary.test.mjs
```
