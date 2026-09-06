# 개발 workspace inventory

기준일: 2026-09-06
기준 workspace: `/home/agent/coding/imjinrok/dev`

이 문서는 K01 작업 재개 시점의 Git worktree와 보존 대상을 기록한다. 통합 여부는 workspace
audit의 `git cherry`·range-diff 확인을 따른다. 이 문서 자체가 각 브랜치의 모든 커밋을 다시
검증하는 감사 보고서는 아니다.

이번 재개 기준 첫 통합 커밋은 `ad327a5` (`fix: preserve K01 source lifecycle and correct scheduler
replay`)이며, 현재 uncommitted draft는 [K01 tile placement boundary](../reverse-engineering/mechanics/k01-tile-placement-elevation-boundary.md)의
corrected lookup 산술과 hash-bound placement/projection/fog/compositor/terrain diagnostic을 반영한다.
physical elevation은 neutral `0`으로 유지한다. 최신 게이트와 전체 K01 parity·browser 판정은
[project status의 workspace 상태](../project-status.md)와 canonical mechanics 문서를 참조한다.

## 현재 worktree

| 경로 | 브랜치 | HEAD | 상태 |
| --- | --- | --- | --- |
| `dev` | `dev` | `ad327a5` | 현재 작업 기준 |
| `master` | `master` | `37a9f2f` | `dev`보다 뒤처짐 |
| `sprite` | `sprite` | `60c7206` | worktree 폴더가 없고 등록은 `prunable`; 보존 |

다음 17개 `codex/*` 브랜치의 작업은 audit 기준으로 `dev`에 통합된 상태다. 아래 경로와 HEAD는
현재 등록된 worktree 인벤토리다.

| 작업 경로 | 브랜치 | HEAD |
| --- | --- | --- |
| `a01-source-runtime-profile` | `codex/a01-k01-source-runtime-profile` | `118eddb` |
| `a02-source-entity-runtime` | `codex/a02-k01-source-entity-runtime` | `0c741c5` |
| `b01-changetitle-consumer` | `codex/b01-k0110-changetitle-consumer` | `310ce3d` |
| `b02-outer-update-cadence` | `codex/b02-k0110-outer-update-cadence` | `5bd7a29` |
| `b03-briefing-timing-policy` | `codex/b03-briefing-timing-policy` | `8689c81` |
| `c01-accepted-update-scheduler` | `codex/c01-k01-accepted-update-scheduler` | `d7bc2b5` |
| `e01-source-handle-lifecycle` | `codex/e01-k01-source-handle-lifecycle` | `fc92ed8` |
| `e02-occupancy-owner-transition` | `codex/e02-k01-occupancy-owner-transition` | `6d5817e` |
| `eco01-construction-completed-event` | `codex/eco01-construction-completed-event` | `79210ac` |
| `final-k01-mechanics-integration` | `codex/final-k01-mechanics-integration` | `8781995` |
| `k01-integrated-oracle-remediation` | `codex/k01-integrated-oracle-remediation` | `eb29977` |
| `p01-exact-opening-placement` | `codex/p01-k01-exact-opening-placement` | `850fc4c` |
| `post-a01-integration` | `codex/post-a01-integration` | `0b63c0b` |
| `post-v02-static-integration` | `codex/post-v02-static-integration` | `bad6c05` |
| `t01-beacon-k0120-policy` | `codex/t01-k01-beacon-k0120-policy` | `3d99c65` |
| `x01-source-coordinate-bridge` | `codex/x01-k01-source-coordinate-bridge` | `4854c62` |
| `x02-opening-footprint-anchor` | `codex/x02-k01-opening-footprint-anchor` | `119d9ef` |

세 쌍은 context 변경으로 patch ID가 byte-for-byte 동일하지 않았다: `118eddb`/`1a89f96`,
`850fc4c`/`db55590`, `3d99c65`/`8781995`. range-diff 검토로 각 브랜치 작업은 추적됐지만, 모든
과거 commit object가 exact patch copy라는 뜻은 아니다.

이 audit의 등록 worktree 항목은 `dev`·`master`·17개 Codex worktree·`sprite`를 합쳐 19개다.
`sprite`는 폴더가 없어 등록만 `prunable` 상태지만 브랜치와 관련 객체를 보존한다. 과거 worktree에
남은 미추적 작업 파일은 현재 `dev` 작업을 제외하면 확인되지 않았고 stash도 비어 있다. workspace
사용량은 약 6.9 GiB이며, 정리·삭제 권한은 이 기록에 포함되지 않는다.

## 보존 대상과 저장소 무결성

- 사용자가 2026-08-01에 sprite 작업을 보존하기로 했으므로 `sprite` 브랜치의 15개 미통합 5월
  커밋과 관련 Git 객체는 삭제하거나 garbage-collect하지 않는다. 이 객체들은 branch가 도달할 수
  있는 보존 대상이며, 아래 dangling object 집계와 혼동하지 않는다.
- `.codex-worktrees`는 비어 있다. 기존 worktree에서 발견된 ignored material은 일반적인
  `node_modules`·`dist`와 `dev/..gitignore.swp`뿐이다. swap 파일은 1,024-byte Nano header,
  pid `2705623`, 2026-07-26 시각을 가진 것으로 확인했으며 복구·삭제하지 않았다.
- `/home/agent/coding/imjinrok/Trace-20260730T130801.json.gz`는 압축 해제·파싱되며
  `610249`개 trace event를 포함하고 압축 파일 크기는 `19326646` bytes다. trace 성능이나 내용의
  완전성을 이 문서에서 판정하지 않는다.
- `git fsck --connectivity-only`는 exit 0이다. dangling objects는 commit 30개, tree 13개,
  blob 12개이며, 연결성 오류가 없어도 보존 대상은 유지한다. 확인된 WIP 예시는
  `e1d432f` terrain-elevation-render-wave, `acd6c73` entity-elevation-projection-wave다.
  확인된 오래된 WIP snapshot 14개 중 12개는 audit/hash-only 기록이고 2개는 elevation code snapshot이며
  후속 조상에 통합됐다.
  `acd6c73`과 `f45e33f`의 8개 변경 경로 diff는 비어 있어 해당 entity-elevation work가 후속
  조상에 반영된 것으로 확인됐다. `e1d432f`와 `7ea872b`의 차이는 terrain elevation presentation
  모듈·테스트와 `Skirmish`의 두 줄 추출이며, 이후 `a6f9db6`에서 K01 physical elevation 정책을
  의도적으로 다시 조정했다. 객체들을 모두 현재 patch와 동일하다고 간주하지 않는다.

## 한계

이 인벤토리는 작업 경로·통합 provenance·보존 대상을 확인하는 기록이다. 과거 브랜치 전체의
정확성, 각 trace event의 의미·성능, opaque binary의 수동 분석 완결성을 감사하지 않는다. 삭제,
정리, merge 또는 push는 이 문서의 범위가 아니다.
