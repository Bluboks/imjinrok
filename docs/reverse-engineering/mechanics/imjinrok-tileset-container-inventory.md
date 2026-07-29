# 임진록 tileset 컨테이너 인벤토리

## 질문과 상태

질문: 원본 `tile/normal`, `tile/snow`, `tile/brown`의 tile source 컨테이너를 파일 단위로 고정하고,
각 파일이 sprite-like header를 끝까지 만족하는지 재현 가능하게 기록할 수 있는가?

| 구분 | 상태 | 제한된 범위 |
| --- | --- | --- |
| 분석 | 정적 확정 | 세 theme의 source 파일명·크기·SHA-256, 확장자·family stem, sprite-like header와 frame range |
| 재현 | 재현 완료 | 결정론 fixture 일치, source byte 변조와 malformed header 거부 |
| 구현 | 없음 | renderer, PNG export, map 또는 terrain runtime 연결을 추가하지 않음 |

이 문서의 `정적 확정`은 **asset container inventory**에만 적용한다. filename이 terrain 의미를 갖는지,
어느 map cell이 어떤 파일·frame을 고르는지, 또는 현재 renderer가 원본과 일치하는지는 주장하지 않는다.

## 고정 입력과 추출

- 입력: `original/imjinrok2/tile/{normal,snow,brown}` 아래의 `.spr`, `.ytl`, `.ypr` source files.
- 생성기: [`extract-imjinrok-environment-assets.mjs`](../../../tools/imjinrok/extract-imjinrok-environment-assets.mjs).
- fixture: [`imjinrok-environment-assets.json`](../../../analysis/fixtures/imjinrok-environment-assets.json). 각 source의 SHA-256과 size,
  header `width`, `height`, `frameCount`, `endOffset`을 보존한다.
- parser: `codec.mjs`의 `parseSpriteLikeHeader`; magic `0x00000009`, width/height/frame count, offset table
  (`0x04c0`), end-offset pointer (`0x0bc8`), 그리고 모든 frame byte range를 검사한다.

다음 명령은 fixture를 결정론적으로 다시 만든다.

```sh
node tools/imjinrok/extract-imjinrok-environment-assets.mjs \
  --output analysis/fixtures/imjinrok-environment-assets.json
node --test tools/imjinrok/imjinrok-environment-assets.test.mjs
```

추출기는 theme마다 ordered `sourcePath`, size, SHA-256의 aggregate digest도 검사한다. 따라서 source bytes가
달라지면 output을 만들기 전에 실패하며, header magic 또는 frame range가 손상되면 parser가 해당 source path와
함께 실패한다.

## 확인한 컨테이너 범위

각 theme는 정확히 78개 source file을 가진다. 세 theme의 filename set과 다음 header shape
(`extension`, `familyStem`, `width`, `height`, `frameCount`)는 대칭이다. `endOffset`은 개별 source의
압축 byte range를 나타내므로 fixture에는 보존하지만, theme 간 shape 동등성의 조건에는 넣지 않는다.

| family stem | 파일 수/theme |
| --- | ---: |
| `black`, `blacktile` | 각 1 |
| `castle` | 3 |
| `diff` | 16 |
| `fog` | 15 (`fog0.spr` … `fog14.spr`) |
| `grss` | 15 |
| `hill` | 17 |
| `newblk` | 5 |
| `sea` | 4 |
| `shallow` | 1 |

이 집계는 전체 78개에는 `black.spr`와 `blacktile.ytl`, 그리고 기존 family-filter가 함께 다루던 `.ypr` source를
포함한다. 이는 container completeness 검증이며 타일·frame의 화면 의미 매핑은 아니다.

## 다음 정적 질문

다음 질문은 map cell render record의 source field와 완전한 selector를 정적으로 추적하는 것이다. 최소한
cell field/값·좌표가 tile filename과 frame index에 이르는 모든 branch, range/default 경로를 닫기 전에는
terrain 선택 규칙이나 renderer parity를 표기하지 않는다.
