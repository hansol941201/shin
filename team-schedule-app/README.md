# 팀장 일정 조율 웹앱 (team-schedule-app)

팀장님의 Google Calendar 일정을 불러와 빈 시간을 자동으로 보여주고, 코디네이터가 빈
시간을 클릭/드래그해 일정을 제안하면 팀장님이 수락/시간변경/거절하는 일정 조율
전용 웹앱입니다. 기존 저장소의 `업무 가이드`(루트 `index.html`) 앱과는 완전히
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

## Google Calendar 연동 설정 (팀장님/관리자가 한 번만)

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
  requester, manager,
  status: 'pending' | 'confirmed' | 'reschedule_requested' | 'rejected',
  googleEventId, googleCalendarEventId, calendarId,
  createdAt, updatedAt,
  proposedStart?, proposedEnd?   // 팀장이 시간변경을 제안했을 때만
  allDay?                        // Google 하루종일 일정인 경우 true
  source: 'google' | 'platform'  // 'google' = Calendar에서 읽어온 확정 일정
}
```

상태 전이: `요청(pending) → 팀장 수락 → Google Calendar에 실제 생성 → confirmed` /
`팀장 시간변경 → reschedule_requested → 코디네이터 수락 → Google Calendar에 실제 생성 → confirmed` /
`팀장 거절 → rejected(빈 시간으로 복귀)`.

화면에 보이는 일정 목록은 **Google Calendar에서 읽어온 확정 일정**과 **이 앱이
로컬로 들고 있는 승인대기/시간변경 요청**을 합쳐서 보여줍니다(이미 Google에
생성되어 다음 조회에 잡히는 항목은 중복 표시되지 않도록 자동으로 걸러집니다).

## 구현된 기능

- 주간 캘린더 기본 화면 (월~금, 09~18시, 1시간 단위 라벨 + 30분 점선 그리드)
- **Google Calendar 로그인(Google Identity Services) + 팀장 캘린더 선택**
- **선택한 캘린더의 실제 일정 조회**(주간/월간 각각 보고 있는 기간만, 반복 일정
  포함, 하루종일 일정은 "종일"로 표시), 그 데이터를 기준으로 실제 빈 시간 자동 계산
- 연속된 빈 시간을 하나의 노란 블록으로 병합 표시, 월간뷰도 동일하게 빈 시간 표시
- 점심시간(기본 12~13시) 회색 처리, 근무시간/점심시간 설정 팝오버
- 빈 시간 클릭 또는 드래그(30분 단위 스냅) → 클릭 위치 근처 팝오버로 일정 요청
  (이 시점에는 아직 Google Calendar에 쓰지 않고 로컬 승인대기 상태로만 저장)
- 요청 제출 시점 + **팀장 수락 시점 두 번** Google Calendar를 다시 조회해 그 사이
  다른 일정이 생기지 않았는지 확인(동시성/중복 방지)
- **팀장 수락 시에만 실제 `events.insert` 호출로 Google Calendar에 확정 일정 생성**,
  성공한 뒤에만 화면 상태를 confirmed로 전환. 쓰기 권한이 없으면 한글 오류 메시지 표시
- 팀장 시간변경/거절, 코디네이터의 시간변경 재확인(수락/다른 시간 선택)
- 상단 **↻ 새로고침** 버튼 + 주/월 이동 시 자동 재조회로 Google Calendar에서 직접
  추가/수정/삭제한 내용을 앱에도 반영(수동 새로고침 기반 — 실시간 push는 아직 아님)
- 월간보기(날짜별 요약 + 빈 시간 표시, 클릭 시 해당 주간으로 이동)
- 오늘 날짜 강조 + 실시간 빨간 현재시간 선
- 팀장이 모바일로 접속 시 수락/거절/시간변경에 최적화된 리스트 화면으로 전환
- 상태별 색상 규칙(빈 시간=노랑, 확정=연한 남색+좌측선, 승인대기=주황 점선) + 우측 상단 미니 범례
- **데모 모드(개발용 옵션)**: 설정 팝오버에서 켜면 Google 연동 없이도 샘플 데이터로
  전체 흐름(요청 → 승인대기 → 수락/시간변경/거절 → 확정)을 테스트할 수 있습니다.
  Google 연동이 켜져 있으면 데모 데이터는 사용되지 않습니다.
- **확정 일정 클릭 → 상세 팝오버 안에서 [수정]/[삭제]**. Google 연동 중인 확정
  일정은 실제 `events.patch`/`events.delete`까지 함께 호출되고(실패 시 화면은
  그대로 유지 + 한글 오류), 저장 전 Google Calendar에서 겹침을 다시 확인합니다.
  승인대기 요청은 요청자(코디네이터)가 [수정]/[요청 취소]할 수 있고, 아직 Google에
  생성 전이므로 로컬에서만 처리됩니다. 삭제/취소는 항상 확인 단계를 한 번 더 거칩니다.
- **Google 로그인 유지**: 최초 1회 연결하면 앱을 껐다 켜도(바탕화면 아이콘을 다시
  눌러도) 자동으로 조용히 재연결을 시도합니다. 선택한 팀장 캘린더도 그대로 기억되어,
  두 번째 실행부터는 버튼을 누를 필요 없이 바로 실제 일정이 표시됩니다.
- **터미널 없는 실행 구조**: 바탕화면 아이콘은 개발 서버가 아니라 매번 새로 만드는
  production build를 숨겨진 프로세스로 서빙하고, Edge `--app` 모드(주소창/탭바 없는
  창)로 엽니다.

## 알려진 제한 / 다음 단계

- 순수 브라우저 토큰 클라이언트 방식이라 Google이 refresh token을 발급하지
  않습니다. 액세스 토큰(보통 1시간)이 만료되면 앱이 자동으로 조용히 재획득을
  시도하지만, 브라우저에 Google 로그인 자체가 끊겨 있거나 이 앱에 대한 동의가
  철회된 경우에는 그마저 실패하므로 이때만 "Google 다시 연결"을 눌러야 합니다.
- 여러 날짜에 걸친 하루종일(멀티데이 all-day) 일정은 시작일에만 표시됩니다.
- Google → 앱 동기화는 "새로고침 버튼 / 화면 진입 / 주·월 이동" 시점에만
  일어나는 폴링 방식입니다. Google Calendar Push Notifications(watch API)로
  실시간 반영하도록 확장할 수 있는 구조(`src/services/googleCalendar.js`)로
  분리되어 있습니다.
- Firestore 실 저장은 아직입니다(`src/services/firebase.js`가 현재는
  localStorage로 대체 — 승인대기/시간변경 같은 로컬 상태만 해당하며, 확정 일정
  자체는 이미 실제 Google Calendar에 저장됩니다).
