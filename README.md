# POUR 업무 대시보드

개인 업무와 지식을 한곳에서 정리하고 관리하기 위한 웹 대시보드입니다.

## 바로 사용하기

**[POUR 업무 대시보드 열기](https://hansol941201.github.io/shin/)**

별도의 설치 없이 웹브라우저에서 바로 사용할 수 있습니다.

## 주요 기능

- 업무 현황과 진행 상태 확인
- 일정 및 할 일 관리
- AI 문구 수정 기능
- Firebase Firestore 기반 실시간 데이터 동기화
- 운영 화면과 QA 테스트 화면 분리

## 페이지 구성

| 구분 | 경로 | 용도 |
| --- | --- | --- |
| 메인 화면 | `index.html` | 실제 업무용 대시보드 |
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
docs/                GitHub Pages 배포 파일
qa/                  QA 테스트 페이지
index.html           메인 화면
firebaseConfig.js    Firebase 연결 설정
```

> Firebase 설정값을 변경할 때는 공개 저장소에 민감한 인증 정보가 포함되지 않도록 확인해 주세요.
