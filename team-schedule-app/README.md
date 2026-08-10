# 팀장 일정 조율 웹앱 (team-schedule-app)

팀장님의 Google Calendar 일정을 불러와 빈 시간을 자동으로 보여주고, 코디네이터가 빈
시간을 클릭/드래그해 일정을 제안하면 팀장님이 수락/시간변경/거절하는 일정 조율
전용 웹앱입니다. 기존 저장소의 `업무 가이드`(루트 `index.html`) 앱과는 완전히
독립된 별도 프로젝트입니다.

## 실행 방법

### Windows - 바탕화면 아이콘 (권장)

저장소 최상위(루트)의 `설치.bat`을 **처음 한 번만** 더블클릭하세요. 바탕화면에
"팀장 일정" 아이콘이 자동으로 생성됩니다. 이후에는 그 아이콘만 더블클릭하면 됩니다.

- 검은 CMD 창 없이 조용히 서버를 켜고, 준비되면 브라우저를 자동으로 엽니다.
- 이미 서버가 켜져 있으면 새로 켜지 않고 기존 주소를 그대로 엽니다(중복 실행 방지).
- `node_modules`가 없으면 자동 설치, 있으면 건너뜁니다. 포트는 5173부터 자동 탐색.
- 저장소를 다른 위치로 옮기면 `설치.bat`을 다시 실행해 바로가기를 재생성하세요.
- 오류가 나면 한글 안내 메시지 창(팝업)으로 원인을 보여줍니다.
- 서버를 끄려면 `team-schedule-app\종료.bat`을 더블클릭하세요.

### Windows - 폴더에서 직접 실행 (대안)

`team-schedule-app` 폴더 안의 `실행.bat`을 더블클릭하면 검은 CMD 창에서 서버가
바로 켜지고(로그가 보임) 준비되면 브라우저가 자동으로 열립니다. 창을 닫으면
서버도 함께 종료됩니다. 오류가 나면 창이 닫히지 않고 오류 메시지가 표시됩니다.
같은 폴더의 `종료.bat`으로도 서버를 종료할 수 있습니다.

공통: Node.js가 설치되어 있지 않으면 https://nodejs.org 에서 LTS 버전을 먼저
설치해주세요. Google/Firebase 설정 없이도 데모 모드로 정상 동작합니다.

### macOS/Linux, 또는 수동 실행

```bash
cd team-schedule-app
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속. 별도 설정 없이 **데모 모드**로 동작하며
샘플 일정(현재 주 월~금)과 승인대기/시간변경 예시가 미리 채워져 있습니다.

- 상단 우측 "코디네이터 / 팀장" 셀렉트로 역할을 바꿔가며 전체 흐름(요청 → 승인대기 →
  수락/시간변경/거절 → 확정)을 테스트할 수 있습니다. (실 서비스에서는 Google
  로그인 계정에 따라 역할이 자동으로 결정되어야 하며, 이 셀렉트는 데모/QA용입니다.)
- 데이터는 브라우저 `localStorage`에 저장되어 새로고침해도 유지됩니다. 초기화하려면
  브라우저 개발자도구에서 `localStorage.clear()`.

## 지금 데모 모드로 동작하는 이유

이 프로젝트에는 실제 Google OAuth 클라이언트 ID와 Firebase 프로젝트 자격증명이
없습니다(비밀값이므로 코드에 넣을 수 없습니다). 아래 두 서비스 어댑터가 그
경계를 담당하며, 지금은 데모 데이터를 반환하도록 되어 있습니다.

- `src/services/googleCalendar.js` — Google Calendar 읽기/쓰기 어댑터
- `src/services/firebase.js` — Firestore 저장 어댑터 (지금은 localStorage로 대체)

### 실제 연동 체크리스트

1. **Google Cloud Console**에서 OAuth 2.0 클라이언트(웹 애플리케이션) 생성 +
   Calendar API 활성화 → `VITE_GOOGLE_CLIENT_ID` 발급
2. **Firebase 프로젝트** 생성 → Authentication(Google 로그인) + Firestore 활성화 →
   `.env.example`을 `.env.local`로 복사 후 `VITE_FIREBASE_*` 값 입력
3. `googleCalendar.js`의 `fetchManagerEvents/createManagerEvent/updateManagerEvent`를
   실제 `googleapis` Calendar v3 REST 호출로 교체 (파일 상단 주석에 엔드포인트 명시)
4. `firebase.js`를 Firestore `collection('events')`의 `onSnapshot`/`setDoc` 호출로 교체
5. 삼성 캘린더는 직접 제어하지 않습니다. 팀장님 기기에서 Google 계정 동기화가
   켜져 있으면, Google Calendar에 생성된 확정 일정이 자동으로 삼성 캘린더에도
   반영되는 구조를 그대로 활용합니다.

비밀번호는 어떤 형태로도 저장하지 않습니다(Google OAuth만 사용).

## 핵심 데이터 모델

```
{
  id, title, start, end, location, memo,
  requester, manager,
  status: 'pending' | 'confirmed' | 'reschedule_requested' | 'rejected',
  googleCalendarEventId, createdAt, updatedAt,
  proposedStart?, proposedEnd?   // 팀장이 시간변경을 제안했을 때만
}
```

상태 전이: `요청(pending) → 팀장 수락 → confirmed` /
`팀장 시간변경 → reschedule_requested → 코디네이터 수락 → confirmed` /
`팀장 거절 → rejected(빈 시간으로 복귀)`.

## 구현된 기능

- 주간 캘린더 기본 화면 (월~금, 09~18시, 1시간 단위 라벨 + 30분 점선 그리드)
- 기존(확정) 일정 표시, 연속된 빈 시간을 하나의 노란 블록으로 병합 표시
- 점심시간(기본 12~13시) 회색 처리, 근무시간/점심시간 설정 팝오버
- 빈 시간 클릭 또는 드래그(30분 단위 스냅) → 클릭 위치 근처 팝오버로 일정 요청
- 요청 제출 시점에 빈 시간 재확인(동시성/중복 방지)
- 승인대기 → 팀장 수락/시간변경/거절, 코디네이터의 시간변경 재확인(수락/다른 시간 선택)
- 월간보기(날짜별 요약, 클릭 시 해당 주간으로 이동)
- 오늘 날짜 강조 + 실시간 빨간 현재시간 선
- 팀장이 모바일로 접속 시 수락/거절/시간변경에 최적화된 리스트 화면으로 전환
- 상태별 색상 규칙(빈 시간=노랑, 확정=연한 남색+좌측선, 승인대기=주황 점선) + 우측 상단 미니 범례

## 아직 실제 연동이 필요한 부분 (자격증명 필요)

- Google OAuth 로그인 UI 자체 (현재는 역할 셀렉트로 대체)
- Google Calendar 실제 읽기/쓰기, 양방향 동기화
- Firestore 실 저장 (현재는 localStorage)
