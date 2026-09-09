# GitHub Pages 배포

게임 클라이언트만 `dist/game-client`로 빌드해 GitHub Pages에 올린다. 배포 workflow는 개발 중인 모든 커밋에서 자동 실행하지 않고 `workflow_dispatch`로 수동 실행한다.

## 빌드 경로

Pages workflow는 Vite `base`를 `/imjinrok/`로 설정한다. Phaser preload와 JSON loader가 사용하는 public asset URL은 이 base를 통해 `/imjinrok/assets/...`로 해석되며, 기본 개발 서버에서는 `/assets/...`를 유지한다. 원격 API 서버는 Pages 산출물에 포함하지 않는다.

로컬에서 Pages 산출물의 경로를 확인하려면 다음을 실행한다.

```sh
VITE_BASE_PATH=/imjinrok/ pnpm build:game
```

개발 서버는 기존처럼 다음 명령으로 실행한다.

```sh
pnpm dev:game
```

## 수동 실행

GitHub 저장소의 Actions에서 `Deploy game client to GitHub Pages` workflow를 선택하고 `Run workflow`를 누른다. workflow는 `pnpm install --frozen-lockfile`과 `pnpm build:game`만 실행하며, `dist/game-client`를 Pages artifact로 업로드한 뒤 `github-pages` environment에 배포한다.

Pages 설정의 publishing source는 `GitHub Actions`로 지정한다. 프로젝트의 기본 브랜치가 `dev`인 경우에도 workflow dispatch는 해당 기본 브랜치의 현재 커밋을 빌드한다.

공식 workflow action 사용법은 [GitHub Pages custom workflows 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows), [upload-pages-artifact](https://github.com/actions/upload-pages-artifact), [deploy-pages](https://github.com/actions/deploy-pages)를 따른다.
