# 팀장 일정 조율 웹앱 (team-schedule-app)

팀장님의 Google Calendar 일정을 불러와 월간 달력으로 보여주고, 빈 시간을 클릭해
바로 확정 일정을 등록/수정/삭제하는 **팀장 전용** 일정 관리 웹앱입니다. 별도
역할 구분이나 승인 절차 없이, 등록한 즉시 Google Calendar에 실제 일정이
생성됩니다. 기존 저장소의 `업무 가이드`(루트 `index.html`) 앱과는 완전히
독립된 별도 프로젝트입니다.

## 실행 방법

### GitHub Pages (실사용 방식 — ZIP/설치/터미널 전부 불필요)

**주소만 열면 됩니다: https://hansol941201.github.io/shin/team-schedule/**

- 이 저장소의 `claude/team-lead-schedule-coordinator-oiy316` 브랜치에서
  `team-schedule-app/` 아래 코드가 바뀔 때마다 `.github/workflows/
  deploy-team-schedule.yml`이 자동으로 production build를 만들어 위 주소에
  배포합니다. 사용자는 ZIP을 받거나, 압축을 풀거나, `npm`/`node`/터미널을
  전혀 다룰 필요가 없습니다.
- 다른 페이지(루트 `업무 가이드`, `v2` 등)는 별도 경로에 그대로 있고, 이
  배포는 오직 `team-schedule/` 하위 폴더만 바꿉니다.
- 바탕화면/즐겨찾기에 아이콘처럼 두고 싶다면, 위 주소를 Edge/Chrome에서
  **"⋮ → 앱 설치"**(또는 "이 사이트를 앱으로 설치")로 등록하면 주소창 없는
  독립 창(제목: "팀장 일정")으로 열립니다.

### 개발자용: 로컬에서 코드를 고칠 때만

일반 사용자는 이 방법을 쓸 필요가 없습니다. 로컬에서 코드를 직접 수정하며
확인할 때만 사용하세요. 저장소 루트의 `설치.bat`/`실행.bat`/`종료.bat`/
`팀장일정열기.bat`/`구글연동설정.bat`은 GitHub Pages 배포 이전에 쓰던
로컬 실행 방식이며, 이제는 개발/디버깅용으로만 남겨둔 것입니다(일반
사용자는 볼 필요가 없습니다).

```bash
cd team-schedule-app
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속(HMR 즉시 반영). production build를
로컬에서 직접 확인하려면:

```bash
npm run build
npm run preview -- --port 5173 --strictPort
```

---

## 공동 백엔드(서버리스) 설정 — 팀원 로그인 없이 다 같이 쓰기

**이 섹션은 아래 "Google Calendar 연동 설정(기존 방식)"보다 우선합니다.**
`VITE_FIREBASE_*` 6개 값이 전부 설정되면 앱은 자동으로 이 모드로
전환되고, 팀원들은 Google 로그인 없이 바로 같은 일정을 보고 편집 코드만
으로 추가/수정/삭제할 수 있습니다. 아래 절차를 관리자(팀장님 또는 IT
담당자)가 한 번만 해두면 됩니다 — 이 저장소의 Claude 세션은 GCP/Firebase
콘솔에 로그인할 수 없어서 이 단계는 반드시 사람이 직접 해야 합니다.

### 1) Google Cloud: Calendar API + 서비스 계정

1. https://console.cloud.google.com 접속 → 프로젝트 생성(또는 아래 3번의
   Firebase 프로젝트를 먼저 만들면 여기 자동으로 같이 생김)
2. **API 및 서비스 → 라이브러리** → `Google Calendar API` 검색 → 사용 설정
3. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 →
   서비스 계정** → 이름은 아무거나(예: `team-schedule-calendar-bot`) →
   만들기만 하면 됨(역할 부여는 생략 가능 — Calendar 권한은 다음 단계에서
   캘린더 공유로 준다)
4. 방금 만든 서비스 계정 클릭 → **키** 탭 → **키 추가 → 새 키 만들기 →
   JSON** → 다운로드됨(예: `team-schedule-calendar-bot-xxxx.json`).
   **이 파일은 절대 이 저장소에 커밋하지 않습니다** — 4단계(Cloud
   Functions Secret)에서 내용만 그대로 붙여넣고 파일은 폐기하세요.
5. 서비스 계정 이메일(`...@...iam.gserviceaccount.com` 형태, JSON 파일의
   `client_email` 값)을 복사해둡니다.

### 2) 팀장님 Google Calendar에 서비스 계정 공유

1. 팀장님 계정으로 https://calendar.google.com 접속
2. 왼쪽에서 실제 쓸 캘린더(보통 기본 캘린더) → **설정 및 공유**
3. **특정 사용자와 공유** → 위에서 복사한 서비스 계정 이메일 추가 →
   권한: **일정 변경** (또는 그 이상) → 저장
4. 왼쪽 패널에서 그 캘린더의 **캘린더 ID**도 확인해둡니다(설정 페이지
   맨 아래 "캘린더 통합" 섹션 — 기본 캘린더면 보통 팀장님 이메일 자체가
   캘린더 ID입니다. 아니면 `xxxxx@group.calendar.google.com` 형태)

### 3) Firebase 프로젝트 생성

1. https://console.firebase.google.com → 프로젝트 추가 → (1번에서 만든
   GCP 프로젝트가 있으면 그걸 그대로 선택 가능)
2. **빌드 → Firestore Database** → 데이터베이스 만들기 → 위치는
   `asia-northeast3`(서울) 권장 → 처음엔 아무 모드나 선택해도 무방(이후
   4단계에서 `firebase deploy --only firestore:rules`로 이 저장소의
   `firestore.rules`가 그대로 덮어씁니다)
3. **프로젝트 설정 → 요금제** → Cloud Functions를 쓰려면 **Blaze(종량제)**
   로 전환 필요(카드 등록 필요하지만, 이 정도 트래픽이면 매달 대부분
   무료 한도 안에서 끝납니다)
4. **프로젝트 설정 → 일반 → 내 앱 → 웹 앱 추가**(아이콘: `</>`) → 앱
   닉네임 아무거나 → **Firebase Hosting은 설정하지 않아도 됨**(체크 해제)
   → 등록하면 `firebaseConfig` 객체가 표시됩니다. 그 6개 값
   (`apiKey`, `authDomain`, `projectId`, `storageBucket`,
   `messagingSenderId`, `appId`)을 아래 6번에서 그대로 씁니다.

### 4) Cloud Functions 배포 (이 저장소의 `functions/` 폴더)

이 저장소에는 `functions/index.js`(Firestore 쓰기 + 서비스 계정으로
Google Calendar 연동)가 이미 준비돼 있습니다. 로컬에 이 저장소를
내려받은 뒤, 관리자 PC에서 딱 한 번 실행하면 됩니다.

```bash
npm install -g firebase-tools
cd team-schedule-app
firebase login
firebase use --add          # 3번에서 만든 Firebase 프로젝트 선택

# 비밀값 3개 등록 — 값을 붙여넣으라는 프롬프트가 뜹니다.
firebase functions:secrets:set EDIT_CODE
# → 팀원들에게 알려줄 짧은 편집 코드(숫자/문자 조합 권장, 예: 4~8자리)

firebase functions:secrets:set GOOGLE_SERVICE_ACCOUNT_KEY
# → 1-4단계에서 받은 JSON 파일의 전체 내용을 그대로 붙여넣기
#   (예: cat team-schedule-calendar-bot-xxxx.json | firebase functions:secrets:set GOOGLE_SERVICE_ACCOUNT_KEY)

# 캘린더 ID/알림 기본값 — Secret이 아니라 그냥 설정값(선택, 기본값 있음)
firebase functions:config:set 2>/dev/null || true   # (v2 함수는 아래처럼 params로 직접 지정)
```

`MANAGER_CALENDAR_ID`(기본값 `primary`), `REMINDER_MODE`(기본값
`app`), `REMINDER_MINUTES`(기본값 `30`)는 `functions/index.js`의
`defineString(...)` 기본값을 그대로 써도 되고, 다른 캘린더 ID를 쓰려면
배포 시 `firebase deploy --only functions --set-params MANAGER_CALENDAR_ID=...`
형태로 넘기거나 `functions/.env` 파일(Firebase Functions params 규칙)로
지정할 수 있습니다.

```bash
firebase deploy --only firestore:rules,functions
```

배포가 끝나면 Firebase 콘솔 → Functions에서 함수 목록(`verifyEditCode`,
`acceptRequest`, `syncGoogleEvents` 등)이 보이고, 몇 분 안에
`syncGoogleEvents`(5분 간격 스케줄)가 처음 실행되면서 `settings/sync`
문서와 `googleEventsCache` 컬렉션이 채워집니다.

### 5) GitHub Pages에 프론트엔드 설정값 등록

저장소 → **Settings → Secrets and variables → Actions**에 아래 6개를
추가하고(3-4단계에서 확인한 `firebaseConfig` 값), 배포 워크플로를 한 번
더 실행(또는 아무 커밋 push)하면 다음 빌드부터 공동 백엔드 모드로
전환됩니다:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

이 값들은 비밀값이 아닙니다(Firebase 클라이언트 SDK 설정은 원래
브라우저에 그대로 노출되는 값입니다) — 실제 접근 제어는 Firestore 보안
규칙(`firestore.rules`, 클라이언트 직접 쓰기 전면 차단)과 Cloud
Functions의 편집 코드 검증이 담당합니다.

### 완료 후 동작

- 일반 팀원: 사이트 접속 → 로그인 없이 바로 일정 확인. 추가/수정/삭제를
  처음 시도할 때만 "편집 코드 확인" 팝업이 뜨고, 한 번 맞으면 그 브라우저
  에서는 약 90일간 다시 묻지 않습니다.
- 팀장님이 휴대폰 Google Calendar에서 직접 일정을 넣거나 바꾸면, 최대
  5분 안에(스케줄 동기화 주기) 사이트에도 반영됩니다.
- 사이트에서 확정한 일정(수락/바로 확정)은 서버가 즉시 팀장님 Google
  Calendar에 실제로 생성합니다.
- 관리자는 ⚙ 설정 팝오버의 "Google 동기화" 섹션에서 마지막 동기화
  시각/성공 여부만 확인할 수 있고, credential/토큰/시크릿 값은 어디에도
  노출되지 않습니다.

---

## Google Calendar 연동 설정(기존 방식 — 위 "공동 백엔드"를 설정하지
않았을 때만 쓰임)

이 앱은 백엔드 서버 없이, 브라우저에서 Google Identity Services로 로그인해
Google Calendar API를 직접 호출합니다. 비밀번호는 어떤 형태로도 저장하지
않고, Google 계정 자체를 저장하지도 않습니다. 로그인 상태(만료 시간이 짧은
액세스 토큰)는 브라우저 localStorage에 보관되어 창을 닫았다 다시 열어도
최초 1회 연결 이후에는 자동으로 재연결을 시도합니다(자세한 동작은 "구현된
기능" 참고).

### 1) Google Cloud 프로젝트 준비 (딱 한 번만 하면 됩니다)

1. https://console.cloud.google.com 접속 → 새 프로젝트 생성(또는 기존 프로젝트 사용)
2. **API 및 서비스 → 라이브러리**에서 `Google Calendar API` 검색 후 **사용 설정**
3. **API 및 서비스 → OAuth 동의 화면**
   - User Type: 조직 내부용이면 "내부", 아니면 "외부" 선택
   - 앱 이름/지원 이메일 등 기본 정보만 입력
   - 범위(Scopes) 추가: 아래 3개만 추가하면 됩니다(그 이상 필요 없음)
     - `.../auth/calendar.readonly`
     - `.../auth/calendar.events`
     - `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
   - 테스트 사용자에 팀장님/코디네이터 Google 계정을 추가(앱을 "게시"하지 않고
     테스트 상태로만 둬도 등록된 테스트 사용자는 바로 사용 가능합니다)
4. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - **승인된 자바스크립트 원본**에 아래를 추가 (경로 없이 프로토콜+도메인까지만):
     - **`https://hansol941201.github.io`** ← 실제 사용 주소(GitHub Pages)의 origin.
       `/shin/team-schedule/` 같은 경로는 넣지 않습니다 — Google이 요구하는 건
       origin(스킴+호스트)까지만입니다.
     - (선택, 로컬 개발용으로 남겨둬도 됨) `http://localhost:5173`
   - 리디렉션 URI는 필요 없습니다(입력하지 않아도 됩니다)
5. 발급된 **클라이언트 ID**를 복사

### 2) 앱에 클라이언트 ID 설정 (GitHub Pages 배포용)

Client ID는 비밀번호나 Client Secret이 아니라 브라우저 프론트엔드 번들에
원래 그대로 들어가는 값이지만, 저장소 코드에 직접 커밋하지 않고 **GitHub
저장소 Secret**을 통해 빌드 시점에 주입합니다.

1. GitHub 저장소 → **Settings → Secrets and variables → Actions**
2. **New repository secret** 클릭
3. Name: `VITE_GOOGLE_CLIENT_ID`, Secret: 위에서 복사한 클라이언트 ID 붙여넣기 → 저장
4. `.github/workflows/deploy-team-schedule.yml`을 다시 실행(가장 쉬운 방법:
   Actions 탭에서 해당 워크플로 선택 → **Run workflow**, 또는 team-schedule-app
   코드를 아무 커밋이나 다시 push)하면 이 Secret이 반영된 새 빌드가 배포됩니다.

Secret을 아직 등록하지 않았거나 값이 비어 있으면 배포된 사이트는
"Google 미설정" 상태로 정상적으로 뜨며(오류로 죽지 않음), 헤더의 버튼을
누르면 안내 팝오버가 나타납니다.

**로컬 개발 시:** `team-schedule-app/.env.example`을 같은 폴더에 `.env.local`로
복사한 뒤 `VITE_GOOGLE_CLIENT_ID=...`를 채우면 됩니다(Git에는 포함되지 않음).
Windows에서는 `구글연동설정.bat`(개발용, 로컬 실행 방식을 쓸 때만 필요)으로도
같은 작업을 자동으로 할 수 있습니다.

### 3) 팀장님 Google Calendar 공유 (코디네이터가 대신 일정을 넣으려면 필수)

팀장님 Google Calendar(웹)에서:

1. 왼쪽 "내 캘린더" 목록에서 공유할 캘린더에 마우스를 올리고 **⋮ → 설정 및 공유**
2. **특정 사용자와 공유**에서 **사용자 추가**
3. 코디네이터의 Google 계정 이메일 입력
4. 권한을 **"일정 변경" (Make changes to events)** 이상으로 설정 — 이게 없으면
   앱에서 수락을 눌러도 "이 캘린더에는 일정 등록 권한이 없습니다" 오류가 납니다
5. 저장

### 4) 앱에서 연결

1. 코디네이터 계정으로 앱 접속 → 헤더의 **"Google 캘린더 연결"** 클릭 → Google
   로그인 팝업에서 동의
2. 헤더의 ⚙(설정) 클릭 → **팀장 캘린더**에서 방금 공유받은 캘린더 선택
   (기본 캘린더를 임의로 쓰지 않고, 실제로 접근 가능한 캘린더 목록에서 고릅니다)
3. 선택 즉시 그 캘린더의 실제 일정과 빈 시간이 표시됩니다

### Samsung Calendar

Samsung Calendar를 이 앱이 직접 제어하지는 않습니다. 팀장님 휴대폰에서 Samsung
Calendar가 같은 Google 계정과 동기화되어 있으면, 이 앱이 Google Calendar에
생성한 확정 일정이 동기화를 통해 Samsung Calendar에도 자동으로 보이는 구조를
그대로 활용합니다.

### 권한 범위(scope)

일정 조회에 필요한 `calendar.readonly`, 확정 일정 생성에 필요한
`calendar.events`, 헤더에 로그인 이메일을 보여주기 위한 최소 프로필 정보
(`openid`, `email`, `profile`)만 요청합니다. 캘린더 자체를 삭제/공유설정
변경할 수 있는 더 넓은 권한은 요청하지 않습니다.

### 문제 해결: "액세스 차단됨 / invalid_client / Client missing a project id"

헤더에 "Google 캘린더 연결" 버튼이 보이는데(= Client ID 형식 자체는 앱이
정상으로 판단한 상태) 로그인 시 이 오류가 뜬다면, 앱 코드 문제가 아니라
Google Cloud 쪽 설정 문제일 가능성이 높습니다. 순서대로 확인해주세요.

1. **클라이언트 유형 확인**: 사용자 인증 정보에서 만든 OAuth 클라이언트가
   반드시 **"웹 애플리케이션(Web application)"** 유형이어야 합니다. "데스크톱
   앱/Android/iOS/TVOS" 등 다른 유형의 클라이언트 ID를 넣으면 이 오류가 납니다.
2. **프로젝트 상태 확인**: Google Cloud Console 왼쪽 상단에서 이 클라이언트를
   만든 프로젝트가 그대로 선택되어 있는지, 삭제되거나 다른 프로젝트로 착각한
   것은 아닌지 확인해주세요.
3. **값을 다시 한 번 복사**: 사용자 인증 정보 화면에서 클라이언트 ID를 다시
   복사해 `구글연동설정.bat`으로 다시 입력해주세요. (이 스크립트는 앞뒤 공백을
   자동으로 제거하고, ".apps.googleusercontent.com"으로 끝나는지 형식을
   검증한 뒤에만 저장합니다 — 형식이 이상하면 "Client ID 형식 오류"라고
   버튼에 바로 표시되니, 그 상태라면 형식 문제, 이 오류가 뜬다면 형식은
   맞지만 Cloud Console 쪽 설정 문제입니다.)
4. 설정(⚙) 팝오버의 "설정된 Client ID: ••••…" 표시로 실제 앱이 사용 중인
   값의 마지막 일부를 확인해, Cloud Console에 표시된 값과 일치하는지
   대조해보세요.

## 핵심 데이터 모델

```
{
  id, title, start, end, location, memo,
  googleEventId, googleCalendarEventId, calendarId,
  createdAt, updatedAt,
  allDay?                                    // Google 하루종일 일정인 경우 true
  source: 'google' | 'shared_team_calendar'  // 'google' = 팀장 본인 확정 일정
                                              // 'shared_team_calendar' = 다른 팀 읽기 전용 공유 일정
}
```

일정은 승인 절차 없이 등록 즉시 Google Calendar에 실제로 생성됩니다(`status`나
`pending` 같은 중간 상태 자체가 없습니다). 화면에 보이는 일정 목록은 **Google
Calendar에서 읽어온 확정 일정**과 **다른 팀 Firebase에서 읽어온 읽기 전용 공유
일정**을 합쳐서 보여줍니다(같은 일정이 Google에도 이미 등록돼 있으면 중복
표시되지 않도록 자동으로 걸러집니다).

## 구현된 기능

- **팀장 전용 월간 달력 화면** — 역할 전환이나 승인 대기 개념 없이, 팀장님 본인의
  Google Calendar 일정만 관리합니다.
- **Google Calendar 로그인(Google Identity Services) + 캘린더 선택**
- **선택한 캘린더의 실제 일정 조회**(보고 있는 달만, 반복 일정 포함, 하루종일
  일정은 "종일"로 표시), 화면 안내용 빈 시간 계산
- 빈 시간(또는 아무 날짜) 클릭 → 팝오버에서 제목/장소/메모/시간 입력 → 등록과
  동시에 실제 `events.insert` 호출로 Google Calendar에 확정 일정 생성(겹치는
  일정이 있으면 등록 전에 한글 오류로 막음)
- 상단 **↻ 새로고침** 버튼 + 월 이동 시 자동 재조회로 Google Calendar에서 직접
  추가/수정/삭제한 내용을 앱에도 반영. 공동 백엔드 모드에서는 여기에 더해
  휴대폰에서 바꾼 내용이 5분 간격 서버 동기화로도 자동 반영됩니다.
- 월간보기(날짜별 확정 일정 + 공유 일정 표시, 오늘 날짜 강조)
- 확정 일정 클릭 → 상세 팝오버에서 [수정]/[삭제](Google Calendar에 실제
  `events.patch`/`events.delete`까지 함께 호출, 저장 전 겹침 재확인). 다른 팀
  공유 일정은 읽기 전용으로 상세만 볼 수 있습니다. 삭제는 항상 확인 단계를 한 번
  더 거칩니다.
- **Google 로그인 유지**: 최초 1회 연결하면 앱을 껐다 켜도 자동으로 조용히
  재연결을 시도합니다. 휴대폰 등 다른 기기에서 Google Calendar를 직접 바꿔도
  포커스/화면 복귀 시 1분 간격으로 자동 재조회합니다.
- **데모 모드(개발용 옵션)**: 설정 팝오버에서 켜면 Google 연동 없이도 샘플
  데이터로 화면 확인이 가능합니다(Google 연동이 켜져 있으면 사용되지 않음).
- **공동 백엔드 모드(선택)**: 아래 "공동 백엔드(서버리스) 설정"을 완료하면
  팀원들이 로그인 없이 같은 일정을 보고, 편집 코드로만 추가/수정/삭제할 수
  있습니다.

## 알려진 제한 / 다음 단계

- 순수 브라우저 토큰 클라이언트 방식이라 Google이 refresh token을 발급하지
  않습니다. 액세스 토큰(보통 1시간)이 만료되면 앱이 자동으로 조용히 재획득을
  시도하지만, 브라우저에 Google 로그인 자체가 끊겨 있거나 이 앱에 대한 동의가
  철회된 경우에는 그마저 실패하므로 이때만 "Google 다시 연결"을 눌러야 합니다.
- 여러 날짜에 걸친 하루종일(멀티데이 all-day) 일정은 시작일에만 표시됩니다.
- 기존 Google OAuth 모드(공동 백엔드를 설정하지 않은 경우)에서는 Google → 앱
  동기화가 "새로고침 버튼 / 화면 진입 / 월 이동 / 1분 간격 포커스 감지" 시점에만
  일어나는 폴링 방식입니다. Google Calendar Push Notifications(watch API)로
  실시간 반영하도록 확장할 수 있는 구조(`src/services/googleCalendar.js`)로
  분리되어 있습니다.
