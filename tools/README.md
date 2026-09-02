# 빌드 스크립트

`customer-card-migration/` 산출물을 **원본에서 다시 만들어 내는** 스크립트입니다.
수작업으로 옮겨 적은 값이 없다는 것을 확인하거나, 원본이 갱신됐을 때 다시 돌리기 위한 용도입니다.

## 준비

원본 저장소를 읽기 전용으로 받아 둡니다 (수정하지 않습니다).

```sh
git clone --depth 1 https://github.com/pourservice/partner-dashboard /경로/partner-dashboard
```

## 실행

```sh
node tools/build-integration.js [원본 index.html 경로] [출력 폴더]
node tools/build-preview.js
node tools/build-docs.js
node tools/build-list.js
```

기본 경로는 `/home/user/pourservice/partner-dashboard/index.html` → `customer-card-migration/` 입니다.
`build-integration.js` 를 먼저 실행해야 합니다(나머지 셋이 `companies-integrated.json` 을 읽습니다).

| 스크립트 | 하는 일 | 산출물 |
|---|---|---|
| `build-integration.js` | 원본 `index.html` 의 내장 시드(`const DATA`, `CHANGELOG`, `CHECKLIST_DATA`)를 파싱해 업체 단위로 통합·검증 | `companies-integrated.json` |
| `build-preview.js` | 상태별 샘플 8종을 실제 데이터에서 골라 시안·마크업 생성 | `customer-card-preview.html`, `customer-card-component.html` |
| `build-docs.js` | 검증 수치를 JSON 에서 직접 계산해 보고서 작성 | `DATA-VALIDATION-REPORT.md` |
| `build-list.js` | 전체 업체 표 목록을 데이터 내장 단일 HTML 로 생성 | `companies-list.html` |

`customer-card-component.css` / `.js` / `README.md` / `CUSTOMER-CARD-MAPPING.md` 는 손으로 작성한 파일이라
스크립트가 덮어쓰지 않습니다.

## 데이터를 어떻게 읽었나

원본 사이트는 빌드 단계가 없는 단일 `index.html` 이고, 모든 기준 데이터가
`const DATA = {...}` 한 줄에 JSON 으로 들어 있습니다. 화면을 긁는 대신 이 시드를 직접 파싱했습니다.

사이트는 로드 시 이 시드 위에 Firebase Realtime Database 와 브라우저 `localStorage` 값을 덮어씁니다.
**그 두 곳은 비공개라 접근하지 않았고**, 따라서 산출물은 GitHub Pages 에 배포된 공개 기준값입니다.
자세한 내용은 `customer-card-migration/DATA-VALIDATION-REPORT.md` §10 을 보세요.

## 검증 도구

시안 HTML 의 동작(상세 펼치기·탭·검색·필터·반응형·콘솔 오류)은 Playwright + Chromium 으로 확인했습니다.
Playwright 는 검증용이라 프로젝트 의존성에 넣지 않았습니다.

```sh
npm i -D playwright && node <검증 스크립트>
```
