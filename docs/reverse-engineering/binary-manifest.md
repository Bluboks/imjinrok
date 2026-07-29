# 원본 바이너리 기준 정보

## 분석 기준 실행 파일

| 항목 | 값 |
| --- | --- |
| 경로 | `original/imjinrok2/imjinrok2.exe` |
| 파일 크기 | `843833` bytes |
| SHA-256 | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| 형식 | PE32 Windows GUI, Intel 80386 |
| 섹션 수 | `4` |
| ImageBase | `0x00400000` |
| Entry point | `0x004ae539` |
| Linker | Microsoft 계열 linker `6.0` |
| PE 타임스탬프 | 2000-04-26 09:08:51, PE 기록값 |
| 재배치 | stripped, base relocation directory 없음 |
| 디버그 디렉터리 | 존재 |

해시 확인:

```bash
sha256sum original/imjinrok2/imjinrok2.exe
```

PE 헤더 확인:

```bash
file original/imjinrok2/imjinrok2.exe
objdump -x original/imjinrok2/imjinrok2.exe
```

## 현재 정적 분석 평가

- 고정 주소를 사용하는 32비트 x86 바이너리다.
- 일반적인 코드·데이터·리소스 섹션과 Win32 임포트를 가진다.
- 본격적인 패킹이나 난독화 징후는 현재까지 확인되지 않았다.
- 문자열, 자원 경로와 진단 문자열이 분석 진입점으로 사용 가능하다.
- 로컬 PDB는 현재 확인되지 않았다.

이 평가는 분석 가능성에 대한 기초 판단이며 개별 함수 의미의 증거는 아니다.

## 고정 정적 분석 기준선

| 항목 | 값 |
| --- | --- |
| Ghidra | `12.1.2` |
| Java | Eclipse Temurin `21.0.12+8` |
| Ghidra 언어 | `x86:LE:32:default` |
| compiler spec | `windows` |
| 자동 분석 함수 | `2449` |
| 정의된 문자열 | `1545` |
| seed 주소 / 포함 함수 | `199` / `191` |
| 구조화 산출물 | `analysis/generated/imjinrok2/` |

도구 배포 URL과 SHA-256은 `tools/imjinrok/static-analysis-versions.env`에 고정했다. 원본 EXE 해시가
이 문서의 값과 다르면 분석 스크립트가 실행을 거부한다.

```bash
pnpm imjinrok:setup-static-analysis
pnpm imjinrok:analyze-exe
pnpm imjinrok:verify-static-analysis
```

2026-07-27에 K01 mission-entry timer-reset seed를 포함해 깨끗한 임시 Ghidra 프로젝트로
전체 분석을 두 번 실행했고, `manifest.json`,
`functions.json`, `strings.json`, `references.json`, `jump-tables.json`, `seeds.json`의
SHA-256이 모두 일치했다. 생성 파일별 현재 해시는
`analysis/generated/imjinrok2/SHA256SUMS`에 있다.

Ghidra의 메모리 지도에는 PE 네 섹션 외에 헤더와 분석용 `tdb` 블록이 포함된다. 이를 PE 섹션 수가
늘어난 것으로 해석하지 않는다.

## 원본 자원

맵, 스크립트, SPR, YTL, YAV와 팔레트 파일이 `original/imjinrok2/` 아래에 있다. 전체 자원 해시
매니페스트는 아직 생성되지 않았다.

현재 정적 파일럿이 입력 해시를 강제하는 자원은 다음과 같다.

| 경로 | SHA-256 | 확정 범위 |
| --- | --- | --- |
| `char/swordk.spr` | `414d285b207ba12afdd856a0f16ddde615381cf491fe493d6ededf91681b55eb` | 조선 창병 정체와 상태 1 일반 이동·상태 2 별도 이동 프레임 식 |
| `char/farmerk.spr` | `98e370f4dec6f147a2556340bf93d293d23c3ee3a5367bc22fd3984e7209e5ca` | K01 source-created class 7 조선 농부의 `+0x47a==0` 상태 8/1/7 core frame |
| `char/generalk11.spr` | `658617ea4c762e85ff4e47167f6ed2f8cf1b37e8daea69338ed3e2c61c5bd829` | 조선 권율 상태 1 이동 0~39, 상태 7 사망 40~47 |
| `char/generalk12.spr` | `9ae22b6fb4e4218b7625b6d73aaaf44a2696822d1ff4e518e396a1128c95a72b` | 조선 권율 상태 4 공격 방향 block, phase 8 |
| `char/generalk13.spr` | `2576233295024781ab5c83da38116ac43ce24a2a2a7b0203876126b480bcdcf9` | 조선 권율 상태 8 대기 0~39 |
| `char/generalk31.spr` | `11d3877f31e196d46b39d90f7153ccb931af9b92225b64ad334e9e6c031611e2` | 조선 유성룡 상태 8 대기 0~39, 상태 1 이동 40~79 |
| `char/generalk32.spr` | `475c60db795407a4fba38f498c466e49d19b53cf83c31da63769aed8021af4bb` | 조선 유성룡 상태 4 공격 0~49, 상태 7 사망 50~57 |
| `char/hqk.spr` | `17e5640a7b34f8aaf1063d210bd087b8ba59d769e194f5025e92941e422c2d4e` | 조선 본영 본체 frame 0~8 |
| `char/firehousek.spr` | `ac6621124bbf2106a5d9309499da7701a5c4e5223692dd2f4f51e2e9c1ab97aa` | 조선 봉화대 본체 frame 0~8 |
| `yfnt/hero.spr` | `a701bd0a66ec30dfd0bbc33ad7e78b937e725292fd37e9cae983ca28ad6af853` | `SPEECH` 초상화 17개 |
| `script/K0120` | `6d9b8043f4634c8b8f1696e6d9b49b17dff99b53280b9934c1dfbd998be6054d` | 519-byte CP949/EUC-KR, 봉화대 match 뒤 `SPEECH` 3개 |
| `yfnt/winlogo.spr` | `045b64ce026386413098f339681e8ac859e641c2e28d86d6dc2a25e4fa84851e` | result selector 1, 250×100·28-frame header |
| `yfnt/loselogo.spr` | `94a33a66783eaa9ab4f458542707cc5fa81ea29c0057eabb3a659fdc39d78ad7` | result selector non-one, 250×100·28-frame header |
| `music/win.YAV` | `d50d4146bd5c423b78ea41ac83d6cd737b083586afff48a7761024dfee1bc61d` | result selector 1 initializer path |
| `music/lose.YAV` | `deb38aae3e4d034774d79953189cfa51408a61d25232abb72f72affca80833e6` | result selector non-one initializer path |
| `yfnt/objectiveborder.spr` | `62552fecc34139e6729b84d4e15dcbe6ea3622eb76b7f443af29fa5322813ea5` | 임무 목표 모달 frame 0, 416×236 |
| `yfnt/buttons201.spr` | `4e55d6592b515fe8a9ebcc059fc6e2a487a3ed5db6affd0f516537a392741eec` | K01 공통 UI 목표 컨트롤 112×28, frames 3·4·5 |
| `yfnt/gamemenuborder.spr` | `48f60d170a8305fbfc2a08d41b3de96bf19dfe99d9d3460996037df41ed6a8ed` | 공통 UI menu border 172×310, frame 0 |
| `script/K0110` | `d9dcc3c78d0373181677afc63fe9331ff561387e36877a62912ca66515f4aea8` | K01 인덱스 1의 임무 목표 텍스트 입력 |
| `script/K0210` | `53a0a6f03b6ff7bc8d2456b5c66712054a73a2c4b921fff6c62f765552bd4331` | 인접 인덱스 2의 목표 텍스트 교차 검사 |
| `stagemap/k01.map` | `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb` | 인덱스 1의 K01 map 결합 |

향후 매니페스트에는 다음을 포함한다.

- 상대 경로
- 파일 크기
- SHA-256
- 형식 판정
- 파서 지원 상태
- 원본 그대로인지 변환본인지 여부

## 변경된 실행 파일

패치된 실행 파일이나 VM 작업 복사본을 분석할 때는 이 문서의 기준 파일과 구분한다. 별도 해시와 변경
목적을 기록하고, 패치 결과를 원본 정적 증거로 사용하지 않는다.
