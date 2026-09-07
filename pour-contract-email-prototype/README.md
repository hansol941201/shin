# 협약서 PDF 발행 → 자동 이메일 발송 (실 연동)

**원본 저장소(`poursolution/pour-contract`)와 운영 사이트는 전혀 수정하지 않았습니다.**
여기 있는 `index.html`은 사용자가 올려준 프로젝트 원본을 그대로 복사한 것입니다.

---

## 현재 상태

1. 독립 테스트("🧪 테스트 메일 발송" 버튼, 수동 PDF 첨부)로 Cloud Run → 하이웍스 SMTP → 실제 수신까지 **검증 완료**
2. 이제 실제 "PDF 발행 확정" 흐름에 자동 발송을 연결한 **실 연동 버전**

## 1. 분석 결과

| 항목 | 내용 |
|---|---|
| "PDF 발행 확정" 버튼 핸들러 | `#pv-download-btn`, `onclick="confirmPreview()"` → `async function confirmPreview()` |
| PDF 실제 생성 함수 | `capturePDF(p, c, pat, returnBlob)` — `returnBlob=true`면 `{ blob, filename }` 반환 |
| 시공사 이메일 필드 | `c.email` (문자열 1개). 콤마/세미콜론으로 여러 개를 넣는 경우까지 방어적으로 파싱 |
| 발행완료 상태 저장 | 각 성공 분기에서 `c.status[patId]='done'` → `saveProjects()` |

## 2. 수정한 파일 / 함수

`index.html`의 **기존 함수 `confirmPreview()` 안에 3곳만** 최소 추가 (그 외 원본 코드 무변경):

1. **FSA(폴더 자동저장) 분기** — `FSA.savePDF()` 성공 직후 `maybeSendPatentEmail(...)` 호출 추가
2. **ZIP 일괄발행 분기** — `zip.file()`로 담은 직후 `maybeSendPatentEmail(...)` 호출 추가
3. **단일 발행 분기** — 기존에는 `capturePDF(p,c,pat)`을 blob 없이 호출해 메일 첨부가 불가능했음.
   → `capturePDF(p,c,pat,true)`로 바꿔 blob을 받고, 기존과 동일한 다운로드를 직접 트리거(jsPDF의
   `save()`와 동일한 anchor 클릭 방식)한 뒤 `maybeSendPatentEmail(...)` 호출 추가.
   **`capturePDF` 함수 내부(PDF 생성 로직 자체)는 한 글자도 안 바뀜** — 호출 인자만 FSA/ZIP 분기가
   이미 쓰던 `true`로 통일한 것.

파일 맨 끝에는 두 개의 독립 `<script>` 블록이 있습니다:
- `[CONTRACT-EMAIL-ADDON]` — 위 3곳에서 호출하는 `maybeSendPatentEmail()`, 이메일 파싱, 메일 문구 템플릿
- `[TEST-EMAIL-ADDON]` — 이전 단계의 독립 테스트 버튼 (요청대로 그대로 유지)

## 3. 발송 흐름

```
발행 미리보기 → PDF 발행 확정 → 기존 PDF 생성/저장 성공
  → c.email에서 유효한 이메일 추출 (콤마/세미콜론 구분, 중복 제거)
  → 없으면: "PDF 발행 완료 / 이메일 주소가 없어 메일은 발송되지 않았습니다" (PDF는 정상 처리)
  → 있으면: 방금 만든 그 PDF blob → base64 → Cloud Run(sendTestEmail) POST
      → 성공: "PDF 발행 및 이메일 발송이 완료되었습니다"
      → 실패: "PDF 발행은 완료되었습니다. 이메일 발송에 실패했습니다: <서버 error>"
```

이메일 발송 결과는 **PDF 발행 성공/실패와 완전히 분리**되어 있고, `maybeSendPatentEmail()`은
내부에서 모든 예외를 잡아 절대 밖으로 던지지 않으므로 메일 실패가 발행 상태를 되돌리지 않습니다.

## 4. 중복 발송 방지

기존 `confirmPreview()`가 이미 갖고 있던 중복 클릭 방지(`btn.disabled`, `btn.dataset.busy`) 로직을
그대로 사용합니다. 새 코드를 추가하지 않았고, 발행 자체가 끝날 때까지 버튼이 잠기므로 이메일도
같이 한 번만 나갑니다.

## 5. 메일 제목/본문

- 제목: `[POUR] {현장명} 신기술(특허) 기술사용 협약서`
- 본문: `buildContractEmailBody(p, c, pat)` 함수로 분리 (문구 수정은 이 함수만 고치면 됨)

## 6. 새로 만든 파일

| 파일 | 용도 |
|---|---|
| `functions/index.js` | 메일 발송 전용 Cloud Run 서버 함수. 발신 표시명 `"넷폼" <실제주소>` |
| `functions/package.json` | 필요 라이브러리(nodemailer, cors) |
| `TEST_GUIDE.md` | 배포/테스트 절차 |

## 7. 건드리지 않은 부분

- ✅ PDF 생성 로직(`capturePDF` 내부), 양식/레이아웃 — 무변경
- ✅ 발행 상태 저장 순서, Firebase 구조/데이터 — 무변경
- ✅ 기존 UI/CSS, 로그인, 파일명/폴더 구조 — 무변경
- ✅ 독립 테스트 버튼(`🧪 테스트 메일 발송`) — 요청대로 그대로 유지

## 8. 보안

- 하이웍스 계정/비밀번호는 이 저장소 어디에도 없음. `functions/index.js`는
  `process.env.HIWORKS_USER` / `HIWORKS_PASS`만 읽으며, 값은 Cloud Run 배포 화면에서
  환경변수로만 입력 (Git에 올라가지 않음).
- 브라우저 코드(`index.html`)에는 Cloud Run URL만 존재.

## 9. functions/index.js 변경 — 재배포 필요

발신자 표시명을 `"넷폼" <실제주소>`로 바꿨습니다 (실제 주소/환경변수/SMTP 설정은 무변경).
**Cloud Run 콘솔에서 이 함수를 다시 배포해야 반영됩니다** — 인라인 편집기 `index.js` 내용을
현재 `functions/index.js`로 교체 후 "배포"만 다시 누르면 됩니다 (환경변수 재입력 불필요).

자세한 배포 절차는 `TEST_GUIDE.md` 참고.
