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
| 자동 분석 함수 | `2448` |
| 정의된 문자열 | `1545` |
| seed 주소 / 포함 함수 | `45` / `44` |
| 구조화 산출물 | `analysis/generated/imjinrok2/` |

도구 배포 URL과 SHA-256은 `tools/imjinrok/static-analysis-versions.env`에 고정했다. 원본 EXE 해시가
이 문서의 값과 다르면 분석 스크립트가 실행을 거부한다.

```bash
pnpm imjinrok:setup-static-analysis
pnpm imjinrok:analyze-exe
pnpm imjinrok:verify-static-analysis
```

2026-07-26에 깨끗한 임시 Ghidra 프로젝트로 전체 분석을 두 번 실행했고, `manifest.json`,
`functions.json`, `strings.json`, `references.json`, `jump-tables.json`, `seeds.json`의
SHA-256이 모두 일치했다. 생성 파일별 현재 해시는
`analysis/generated/imjinrok2/SHA256SUMS`에 있다.

Ghidra의 메모리 지도에는 PE 네 섹션 외에 헤더와 분석용 `tdb` 블록이 포함된다. 이를 PE 섹션 수가
늘어난 것으로 해석하지 않는다.

## 원본 자원

맵, 스크립트, SPR, YTL, YAV와 팔레트 파일이 `original/imjinrok2/` 아래에 있다. 전체 자원 해시
매니페스트는 아직 생성되지 않았다.

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
