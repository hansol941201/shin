# 협약서 이메일 자동발송 PoC (원본 미변경 복사본)

- 원본 사이트: https://poursolution.github.io/pour-contract/
- 원본 저장소: `poursolution/pour-contract` — **이 작업에서 원본 저장소/운영 사이트는 전혀 건드리지 않았습니다.**
  여기 있는 `index.html`은 원본을 그대로 복사한 뒤 이 폴더 안에서만 수정한 별도 사본입니다.

## 무엇이 바뀌었나

`index.html`에서 PDF 발행이 성공하는 3곳(개별 저장폴더 자동저장 / ZIP 일괄발행 / 단일 다운로드)
바로 뒤에 `maybeSendContractEmail(...)` 호출을 추가했습니다.

- 업체(`c.email`)에 등록된 이메일이 있으면 → 방금 만든 PDF를 그대로 첨부해서 백엔드로 전송 요청
- 이메일이 없으면 → 조용히 건너뜀 (기존 발행 동작에는 영향 없음)
- 전송 성공 → 기존 "발송완료" 상태(`c.mailSent`)를 자동으로 체크
- 전송 실패 → 발행 자체는 이미 끝난 뒤이므로 막지 않고, 토스트로만 알림 (기존 발송완료 버튼으로 수동 처리 가능)

**브라우저는 SMTP를 직접 호출할 수 없고, 하이웍스 계정 비밀번호를 사이트 코드에 넣는 것도 위험하므로**
실제 발송은 `functions/` 에 있는 작은 서버(Firebase Cloud Function)가 대신합니다.
사이트는 PDF를 그 서버로 보내기만 하고, 서버가 하이웍스 SMTP로 로그인해서 메일을 보냅니다.

```
브라우저(index.html) → (PDF base64 POST) → Cloud Function(functions/index.js) → 하이웍스 SMTP → 수신자
```

## 적용하려면 (원본 저장소에는 그대로 두고 별도로 진행)

1. 이 폴더를 Firebase 프로젝트(현재 pour-contract가 쓰는 것과 같은 프로젝트, 또는 새 프로젝트)에 연결
2. 하이웍스 계정 정보를 서버 쪽에만 저장:
   ```bash
   firebase functions:config:set hiworks.user="발송용_아이디@회사도메인" hiworks.pass="비밀번호_또는_전용_비밀번호"
   ```
3. 함수 배포:
   ```bash
   cd functions && npm install
   firebase deploy --only functions:sendContractEmail
   ```
4. 배포 후 나오는 함수 URL을 `index.html` 상단의 `EMAIL_API_URL` 값에 채워 넣기
5. 이 사본으로 실제 계정으로 테스트 발송 → 문제 없으면, **운영 담당자가 원본 저장소에 정식으로 반영**

## 확인이 필요한 부분

- 하이웍스가 외부 SMTP 릴레이(회사 계정 비밀번호로 서버에서 로그인해 발송)를 허용하는지 — 관리자 페이지에서 SMTP 사용 설정/전용 비밀번호 발급 여부 확인 필요
- SMTP host/port가 `smtp.hiworks.com:465`가 맞는지 (하이웍스 고객센터/관리자 설정에서 재확인 권장)
- 발신자 주소가 "대표 협약서 발송용" 계정으로 통일되어도 되는지, 아니면 실제 발행자 개인 계정이어야 하는지

## 파일 구성

```
index.html          원본 pour-contract/index.html 사본 + 이메일 발송 훅 추가
functions/index.js   하이웍스 SMTP로 PDF 첨부 메일을 보내는 Cloud Function
functions/package.json
```
