# POUR 업무 대시보드

개인 업무와 지식을 한곳에서 정리하고 관리하기 위한 웹 대시보드입니다.

## 바로 사용하기

**[POUR 업무 대시보드 열기](https://hansol941201.github.io/shin/)**

별도의 설치 없이 웹브라우저에서 바로 사용할 수 있습니다.

## 주요 기능

- 업무 현황과 진행 상태 확인
- 일정 및 할 일 관리
- 팀 업무 트래커 (루틴 업무 · 프로젝트 · KPI · 마인드맵)
- AI 문구 수정 기능
- Firebase Firestore 기반 실시간 데이터 동기화
- 운영 화면과 QA 테스트 화면 분리

## 페이지 구성

| 구분 | 경로 | 용도 |
| --- | --- | --- |
| 메인 화면 | `index.html` | 실제 업무용 대시보드 |
| 업무 트래커 | `tracker/` | 팀 업무 트래커 (localStorage 저장) |
| 배포 화면 | `docs/` | GitHub Pages 배포 파일 |
| QA 화면 | `qa/` | 기능 확인 및 테스트 |

## 개발 환경에서 실행하기

```bash
npm install
npm run dev
```

## 프로젝트 구조

```text
css/                 화면 스타일
js/                  주요 기능
tracker/             업무 트래커 (단일 HTML, localStorage 저장)
docs/                GitHub Pages 배포 파일
docs/tracker/        업무 트래커 배포본
qa/                  QA 테스트 페이지
index.html           메인 화면
firebaseConfig.js    Firebase 연결 설정
```

> Firebase 설정값을 변경할 때는 공개 저장소에 민감한 인증 정보가 포함되지 않도록 확인해 주세요.

## 업무 트래커

`tracker/index.html` 은 별도 설치 없이 열리는 단일 HTML 앱입니다.
사이드바 **업무도구 → 업무트래커** 로도 들어갈 수 있고,
배포본은 [https://hansol941201.github.io/shin/tracker/](https://hansol941201.github.io/shin/tracker/) 에서 열립니다.

- **저장 방식**: 브라우저 `localStorage` (`task_tracker_v18` 키)에 JSON으로 저장합니다.
  추가·수정·삭제 즉시 저장되고, 새로고침하거나 브라우저를 껐다 켜도 유지됩니다.
- **처음 열었을 때**: `[예시]` 가 붙은 샘플 데이터가 채워집니다.
  관리 탭의 **전체 초기화** 로 비우거나, **JSON 불러오기** 로 실제 데이터를 넣어 쓰면 됩니다.
- **백업**: 상단 **내보내기 / 가져오기** 버튼으로 JSON 파일을 주고받습니다.
- **여럿이 함께 쓰기**: 상단 **로컬만** 배지를 눌러 Firebase Realtime Database URL 과
  팀 ID 를 입력하면 실시간 동기화가 켜집니다. 입력하지 않으면 계속 이 PC에만 저장됩니다.
