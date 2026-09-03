# 고객관리카드 필드 매핑표

`companies-integrated.json` 의 각 필드를 **기존 고객관리카드에 연결**하기 위한 문서입니다.

- 원본: [POUR 파트너 대시보드](https://pourservice.github.io/partner-dashboard/)
- 데이터 기준일: **2026-07-23** · 조사일: **2026-09-02**
- 표기 규칙: 값이 없으면 JSON 은 `null`, 카드 화면은 **“미확인”** 을 출력합니다. **빈칸을 두지 않습니다.**
- 이 문서는 **필드 정의만** 다룹니다. 기존 카드의 실제 HTML 구조는 아직 받지 못했으므로
  기존 코드를 추측해 고치지 않았습니다.

---

## 0. 읽는 법

각 필드는 다음 항목으로 기술합니다.

| 항목 | 뜻 |
|---|---|
| 새 필드명 | JSON 경로 |
| 표시명 | 카드에 쓸 한글 라벨 |
| 형식 | 데이터 타입 |
| 필수 | 카드 렌더에 반드시 필요한지 |
| 출처 | 원본 대시보드의 어느 메뉴·어느 열에서 왔는지 |
| 변환 | 원본값 → 새 값 변환 규칙 |
| 값 없음 | 값이 비었을 때 처리 |
| 카드 위치 | 헤더 / 요약 / 상세 탭 중 어디에 표시하는지 |
| 배지·색상 | 배지로 표현할 때의 색 |
| 검증 | 이 필드에 걸린 검증 규칙 |

카드 화면 구성(§5 참조)은 **첫 화면 10개 항목 + 상세 8개 탭** 입니다.

---

## 1. 식별 / 카드 헤더

### `id`
- **표시명** 내부 ID · **형식** `string` (`C0001` 형태) · **필수** 예
- **출처** 통합 과정에서 부여(업체명 가나다순 일련번호)
- **변환** 원본에 고유 ID가 없어 새로 생성. **원본 시스템의 키가 아니므로 영구 키로 쓰지 마세요.**
- **값 없음** 없음(항상 존재) · **카드 위치** 표시하지 않음(`data-pcm-id` 속성)
- **검증** 기존 카드에 이미 PK 가 있다면 `companyCode` 또는 `businessNumber` 로 조인하고 `id` 는 버리세요.

### `companyCode`
- **표시명** 업체코드 · **형식** `string | null` (예 `"25047"`) · **필수** 아니오
- **출처** 협력업체 리스트(내부용) → **업체코드** 열
- **변환** 원본 문자열 그대로. 규칙은 `연도(YY) + 순번 3자리`(원본 변경사항 내역 2026-07-23 항목)
- **값 없음** 카드에 “업체코드 미확인”. 신규 MOU 프로세스에만 있는 업체는 아직 코드가 없습니다.
- **카드 위치** 헤더 부제 · **검증** 서로 다른 업체가 같은 코드를 쓰면 `validation.possibleDuplicate = true`
- **조인 키 1순위.** 코드가 같고 상호도 같으면 동일 업체로 봐도 안전합니다.

### `businessNumber`
- **표시명** 사업자등록번호 · **형식** `string | null` (하이픈 없는 10자리) · **필수** 아니오
- **출처** 협력업체 리스트(내부용) → **사업자번호** 열
- **변환** 숫자만 남김 (`130-86-10502` → `1308610502`)
- **값 없음** “미확인” (261/273 만 보유)
- **카드 위치** 상세 › 기본 정보 (공개 시안에서는 `662-**-*****` 로 마스킹)
- **검증** 상호가 다른데 번호가 같으면 병합하지 않고 `possibleDuplicate` 로 표시 — **3쌍 발견**
- **조인 키 2순위.**

### `companyName` / `originalNames`
- **표시명** 업체명 / 원본 업체명 · **형식** `string` / `string[]` · **필수** 예
- **출처** 모든 메뉴의 업체명 열
- **변환** `companyName` = 가장 먼저 등장한 원본 표기. **원본 표기는 하나도 버리지 않고** `originalNames` 에 전부 보존
- **값 없음** 없음 · **카드 위치** 헤더 제목 / 상세 › 기본 정보
- **검증** `originalNames.length > 1` 이면 표기가 다른 행을 통합한 것이므로 `possibleDuplicate = true`
- **정규화 규칙(조인 3순위)**: `㈜` `(주)` `주식회사` `(유)` `유한회사` `(사)` `(재)` `(합)` 제거 → 모든 공백 제거 → 소문자화.
  **이 정규화가 일치할 때만 자동 병합**했습니다. 이름이 비슷하다는 이유만으로는 합치지 않았습니다.

### `identifiedBy`
- **표시명** 업체 식별 근거 · **형식** `string[]` · **출처** 통합 로직
- **값** `업체코드` / `사업자등록번호` / `정규화 업체명` 중 실제로 매칭에 쓰인 것
- **카드 위치** 상세 › 기본 정보

### `isExistingPartner`
- **표시명** 기존 협력업체 · **형식** `boolean` · **필수** 예
- **출처** 협력업체 리스트(내부용/시공사/외부) 중 하나라도 존재하면 `true`
- **변환** 없음 · **값 없음** 없음(항상 `true`/`false`)
- **카드 위치** 헤더 배지 + 첫 화면 요약
- **배지** 회색 (`pcm-badge--plain`) — **상태 배지와 색을 나누세요**
- **검증** **기존 협력업체는 MOU 상태가 아닙니다.** 협력업체라는 이유로 체결 완료로 추정하지 않았습니다.
  협약체결 칸이 빈 협력업체 71개사는 `mou.status = "기존 협력업체·MOU 상태 확인 필요"` 입니다.

### `isNewCompany` / `newBadgeOnSite`
- **표시명** 신규 유입 여부 · **형식** `boolean`
- **출처** `isNewCompany` = 신규 MOU 프로세스(진행 현황·체결 완료·허들·보류) 중 하나라도 등장.
  `newBadgeOnSite` = **원본 사이트가 “신규” 뱃지를 붙이는 기준**(체결 완료 목록에 존재).
- **두 값이 다릅니다.** 기존 카드의 “신규 업체” 정의에 맞는 쪽을 고르세요.
- **카드 위치** 헤더 배지

### `grade`
- **표시명** 현재 등급 · **형식** `"S"|"A"|"B"|"C"|"N"|"F"|null` · **출처** 등급 현황 메뉴
- **등급 정의** `meta.gradeDefinitions` 에 원본 설명 전문 보존
  (S 핵심 파트너 / A 주요 / B 활동 / C 협약 유지 / N 신규 협약 / F 이슈 고객 / D 잠재 고객)
- **값 없음** “미확인” — 등급 현황에 없는 업체 (353 − 257 = 96개사)
- **카드 위치** 헤더 배지 (`pcm-badge--grade`, 보라) · **검증** 연도별 등급과 값이 다르면 `gradeHistory[].conflictingGrades` 에 기록

### `lastActivityAt`
- **표시명** 마지막 업데이트 · **형식** `YYYY-MM-DD | null`
- **출처** 타임라인 날짜 중 가장 진행된 값 (체결 → 2차 → 1차 → 회신 → 발송 순으로 첫 존재값)
- **값 없음** “미확인” — 협력업체 리스트에만 있고 날짜가 전혀 없는 업체
- **카드 위치** 헤더 부제
- **주의** 원본 사이드바의 “최종 업데이트”는 **접속일을 그대로 출력**하는 값이라 쓰지 않았습니다.

---

## 2. 기본 정보 (`profile`)

| 새 필드명 | 표시명 | 형식 | 출처 (협력업체 리스트 내부용) | 값 없음 | 카드 위치 |
|---|---|---|---|---|---|
| `profile.region` | 지역 | `string \| null` | 지역 열 | 미확인 | 상세 › 기본 정보 |
| `profile.ceo` | 대표자 | `string \| null` | 대표자 열 | 미확인 | 상세 › 기본 정보 / 담당자 |
| `profile.phone` | 연락처 | `string \| null` | 연락처 열 | 미확인 | 상세 › 기본 정보 |
| `profile.fax` | FAX | `string \| null` | FAX 열 | 미확인 | 상세 › 기본 정보 |
| `profile.email` | 이메일 | `string \| null` | Email 열 | 미확인 | 상세 › 기본 정보 |
| `profile.address` | 주소 | `string \| null` | 주소 열 | 미확인 | 상세 › 기본 정보 |
| `profile.capital` | 자본금 | `string \| null` | 자본금 열 (`"7억"` 같은 자유 텍스트) | 미확인 | 상세 › 기본 정보 |
| `profile.partnerListNo` | 협력업체 리스트 NO | `number \| null` | NO 열 | 미확인 | 상세 › 기본 정보 |
| `profile.registeredAt` | 업체 등록일 | `null` (전건) | **원본에 필드 없음** | 미확인 | 상세 › 기본 정보 |
| `profile.registeredYearFromCode` | 업체코드 기준 등록연도(참고) | `number \| null` | `companyCode` 앞 2자리 | 미확인 | 상세 › 기본 정보 |

> **개인정보** — `ceo` / `phone` / `fax` / `email` / `address` / `businessNumber` 는 개인정보입니다.
> JSON 에는 원본값이 그대로 들어 있고, **공개 시안(`customer-card-preview.html`)에서만 마스킹**됩니다.
> 마스킹 함수는 `PCMCard.mask.{name,phone,email,address,bizno}` 로 노출되어 있습니다.
> 카드를 사내 시스템에 붙일 때는 `PCMCard.mount(el, companies, { mask: false })` 로 원본을 표시하세요.

> `profile.registeredYearFromCode` 는 **추정값**입니다. 원본 변경사항 내역이 밝힌 업체코드 규칙
> (`연도 2자리 + 순번 3자리`)에서 역산한 값이라 참고용으로만 쓰고, 등록일 필드로 승격하지 마세요.

---

## 3. 담당자 (`manager`, `contacts`)

| 새 필드명 | 표시명 | 형식 | 출처 | 값 없음 |
|---|---|---|---|---|
| `manager.name` | 담당자명 | `null` (전건) | **원본에 없음** | 미확인 |
| `manager.title` | 직책 | `null` (전건) | **원본에 없음** | 미확인 |
| `manager.phone` | 담당자 연락처 | `null` (전건) | **원본에 없음** | 미확인 |
| `manager.email` | 담당자 이메일 | `null` (전건) | **원본에 없음** | 미확인 |
| `manager.internalOwner` | 내부 담당자 | `null` (전건) | **원본에 없음** | 미확인 |
| `manager.note` | 담당자 메모 | `null` (전건) | **원본에 없음** | 미확인 |
| `contacts[]` | 업체 측 연락처 | `object[]` | 협력업체 리스트 대표자·연락처·이메일 | 빈 배열 |

`contacts[]` 원소: `{ name, role, phone, email, isInternal, note, source }` — 현재는 `role: "대표자"` 1건만 생성됩니다.

> **담당자 정보는 원본 어디에도 없습니다.** 시드에 `m1Owner`/`m2Owner` 필드 자체가 존재하지 않고
> (사이트가 런타임에 `null` 로 만들어 씁니다), 통합 커리큘럼 문서에는 팀 단위 담당
> (영업팀 / 김수진 / 신명희)만 있고 업체별 매핑이 없습니다.
> **카드 적용 전에 별도로 받아야 할 1순위 자료입니다.**

---

## 4. MOU 진행 (`mou`)

### `mou.status` ★ 핵심
- **표시명** 최종 MOU 상태 · **형식** `enum` · **필수** 예
- **값** 7종 — `MOU 체결 완료` / `MOU 체결 완료·체결일 미확인` / `MOU 진행 중` / `허들·보류` / `종결` / `기존 협력업체·MOU 상태 확인 필요` / `상태 충돌·담당자 확인 필요`
- **출처·판정 우선순위**
  1. MOU 체결일이 있으면 → `MOU 체결 완료`
  2. 체결 표시(`mouDone`, 협력업체 리스트 “ㅇ”)는 있는데 날짜가 없으면 → `MOU 체결 완료·체결일 미확인`
  3. 허들·보류 탭에 있으면 → `허들·보류`
  4. 진행 현황 탭에만 있으면 → `MOU 진행 중`
  5. 협력업체 리스트/등급 현황에만 있으면 → `기존 협력업체·MOU 상태 확인 필요`
  6. 위 판정과 모순되는 근거가 있고 **체결일도 없으면** → `상태 충돌·담당자 확인 필요`
- **체결일이 있으면 충돌이 있어도 `MOU 체결 완료` 입니다.** 다른 메뉴에 미체결로 남아 있더라도
  결국 MOU 를 체결한 곳이기 때문입니다. 충돌을 지우는 것이 아니라 상태를 우선 확정하는 것이며,
  `validation.statusConflict = true` 와 `validation.conflictResolvedBySigning = true` 로 계속 추적됩니다
  (해당 6개사 — 원본 사이트에서 [진행 현황]·[허들·보류] 정리 필요).
- **카드 위치** 헤더 배지 + 첫 화면 요약 + 카드 왼쪽 테두리 색
- **배지 색상**

  | 상태 | 색 | CSS 클래스 |
  |---|---|---|
  | MOU 체결 완료 | 초록 | `pcm-badge--done` / `pcm-card--done` |
  | MOU 체결 완료·체결일 미확인 | 노랑 | `pcm-badge--nodate` / `pcm-card--nodate` |
  | MOU 진행 중 | 파랑 | `pcm-badge--ongoing` / `pcm-card--ongoing` |
  | 허들·보류 | 주황 | `pcm-badge--hold` / `pcm-card--hold` |
  | 종결 | 어두운 회색 | `pcm-badge--closed` / `pcm-card--closed` |
  | 기존 협력업체·MOU 상태 확인 필요 | 회색 | `pcm-badge--unknown` / `pcm-card--unknown` |
  | 상태 충돌·담당자 확인 필요 | 빨강 | `pcm-badge--alert` / `pcm-card--alert` |

- **검증** 충돌이 있으면 `validation.statusConflict = true` 이고 사유가 `validation.messages` 에 들어 있습니다.
  체결일로 상태가 확정된 경우 `validation.conflictResolvedBySigning = true` 가 함께 붙습니다.

### `mou.statusCandidate`
- **표시명** 우선순위 판정 · **형식** `enum` (위와 동일)
- **뜻** 충돌을 무시하고 우선순위만 적용했을 때의 상태. **충돌을 조용히 덮어쓰지 않기 위해 둘 다 보존**합니다.
- **카드 위치** 헤더 보조 배지(충돌일 때만)

### `mou.stage` / `mou.stageNumber`
- **표시명** 현재 진행 단계 · **형식** `enum` / `0~5`
- **값** `0 질문서 발송·회신 대기` `1 1차 미팅 대기` `2 1차 미팅 완료` `3 2차 미팅 대기` `4 2차 미팅 완료·MOU 체결 준비` `5 MOU 체결`
- **출처** 원본 사이트의 `recalcStage()` 결과 = **화면에 실제로 그려지는 단계**
- **변환 주의** 원본 HTML 시드의 `stage` 값은 **오래된 값**입니다. 사이트가 로드할 때마다 `*Done` 플래그로
  다시 계산하므로, 시드값이 아니라 재계산값을 채택했습니다(65행이 불일치).
- **값 없음** “미확인” — 협력업체 리스트/등급 현황에만 있고 협약체결 칸도 비어 있는 업체 **71개사**.
  협력업체 리스트에서 체결일이 확인된 업체는 신규 MOU 프로세스에 행이 없어도 `5 MOU 체결` 로 둡니다.
- **카드 위치** 헤더 부제 + 첫 화면 요약
- **참고** `3 2차 미팅 대기` 는 **0개사**입니다. 원본이 2차 미팅 예정일을 저장하지 않아 구조적으로 발생하지 않습니다.

### `mou.currentStageDate` / `mou.elapsedDays` / `mou.isStalled`
- **표시명** 현재 단계 진입일 / 경과일 / 장기 미진행
- **형식** `YYYY-MM-DD | null` / `number | null` / `boolean`
- **변환** 진입일 = 현재 단계를 성립시킨 날짜. 경과일 = **2026-09-02 기준** 일수.
  `isStalled` = (진행 중 또는 허들·보류) **그리고** 경과일 ≥ 180
- **값 없음** “미확인”
- **카드 위치** 첫 화면 요약(경과일) / 상세 › MOU 타임라인
- **배지** `isStalled` 면 주황 “장기 미진행”
- **⚠️ 재계산 필요** 카드를 실제 시스템에 붙이면 경과일은 **그날 기준으로 다시 계산**하세요.
  JSON 의 값은 2026-09-02 시점 스냅샷입니다.

### `mou.nextAction` / `mou.nextActionDueAt`
- **표시명** 다음 액션 / 다음 액션 예정일 · **형식** `string | null` / `null`(전건)
- **출처** 허들·보류 탭의 “액션 결정” 셀렉트
- **값** 허들·보류 업체는 전건 `"결정 미입력"`, 그 외는 `null`
- **미수집 사유** 원본에서 이 값은 브라우저 `localStorage.hurdleActions` 에만 저장되고 배포 데이터에 없습니다.
  **추정하지 않았습니다.**
- **카드 위치** 첫 화면 요약

### MOU 타임라인 날짜

| 새 필드명 | 표시명 | 형식 | 출처 열 | 변환 | 값 없음 |
|---|---|---|---|---|---|
| `mou.questionnaireSentAt` | 질문서 발송일 | `YYYY-MM-DD \| null` | 질문서 발송 | `25.10.22` → `2025-10-22` | 미확인 |
| `mou.questionnaireReceivedAt` | 질문서 회신일 | `YYYY-MM-DD \| null` | 질문서 회신 | 동일 | 미확인 |
| `mou.firstMeetingScheduledAt` | 1차 미팅 예정일 | `null` (전건) | **원본에 없음** | — | 미확인 |
| `mou.firstMeetingCompletedAt` | 1차 미팅 완료일 | `YYYY-MM-DD \| null` | 1차미팅 | 동일 | 미확인 |
| `mou.firstMeetingManager` | 1차 미팅 담당자 | `null` (전건) | **원본에 없음** | — | 미확인 |
| `mou.secondMeetingScheduledAt` | 2차 미팅 예정일 | `null` (전건) | **원본에 없음** | — | 미확인 |
| `mou.secondMeetingCompletedAt` | 2차 미팅 완료일 | `YYYY-MM-DD \| null` | 2차미팅 | 동일 | 미확인 |
| `mou.secondMeetingManager` | 2차 미팅 담당자 | `null` (전건) | **원본에 없음** | — | 미확인 |
| `mou.signedAt` | MOU 체결일 | `YYYY-MM-DD \| null` | MOU 체결 / 협력업체 리스트 협약체결 | 동일 | 체결 완료면 “체결일 미확인” |

**날짜 변환 규칙**
- `26.08.28` → `2026-08-28` · `ㅇ25.11.07` → `2025-11-07` · `o 23.11.29` → `2023-11-29` · `24.2.29` → `2024-02-29`
- 접두 기호(`ㅇ` `o` `O`)와 공백은 제거합니다.
- **`YY.M.D` 3조각으로 해석되지 않는 값은 날짜로 만들지 않습니다.** 실존하지 않는 날짜(월 13, 2월 30일 등)도 `null` 입니다.
- 날짜가 아닌 원문(`조율중`, `일정 조율중(05.21)`, `양산지사 예정`, `예정`, `X`)은 버리지 않고
  **`mou.rawLabels.{qSent,qReply,m1,m2,mou}` 에 그대로 보존**하고 카드 타임라인에 “원본 표기: …” 로 표시합니다.

**검증** — 정상 순서는 `발송 ≤ 회신 ≤ 1차 ≤ 2차 ≤ 체결`. 어긋나면 `validation.dateError = true`.
예) `mou.signedAt` 이 `secondMeetingCompletedAt` 보다 이르면 날짜 오류.

**단계 건너뛰기는 오류가 아닙니다.** 미팅 없이 바로 체결하거나 1차를 건너뛰고 체결하는 업체가 실제로 있어,
**체결이 확인된 업체는 중간 단계 날짜가 비어 있어도 오류로 보지 않습니다.**
어떤 단계에 기록이 없는지는 `mou.skippedSteps`(문자열 배열, 참고 정보)에 남깁니다 — 45개사.
아직 체결되지 않은 업체의 단계 공백은 입력 누락일 수 있어 확인 필요로 계속 표시합니다.
원본 사이트도 같은 전제를 두고 있습니다(내부 로직에 `qReplySkipped`/`m1Skipped`/`m2Skipped` 플래그 정의).

### `mou.signedAtSource` / `dateResolution` ★ 체결일 확정 규칙

체결일이 메뉴마다 다르게 기록된 경우, **출처 우선순위**로 최종값을 확정합니다.

| 우선순위 | 출처 |
|---|---|
| 1 | **체결 완료** 메뉴의 MOU 체결일 |
| 2 | MOU 진행 이력 (진행 현황 · 허들·보류) 등 체결 관련 원본 자료 |
| 3 | 협력업체 리스트(내부용)의 체결일 |
| 4 | 기타 화면 · 비고 |

**[체결 완료] 메뉴에 체결일이 있으면 다른 메뉴에 다른 날짜가 있어도 반드시 그 값을 씁니다.**

- `mou.signedAt` — 확정된 최종 체결일. **화면에는 이 값만 표시합니다.**
- `mou.signedAtSource` — 확정값이 온 메뉴 이름 (`"체결 완료"` 등)
- `mou.signedAtSources` — 원본 그대로의 `{menu, date}[]` (감사용, 화면 표시 금지)
- `dateResolution` — 확정 과정 기록

```json
{
  "mou": { "signedAt": "2025-02-26", "signedAtSource": "체결 완료" },
  "dateResolution": {
    "status": "resolved_by_source_priority",
    "selectedDate": "2025-02-26",
    "selectedSource": "체결 완료",
    "originalValues": [
      { "source": "체결 완료", "value": "2025-02-26" },
      { "source": "협력업체 리스트(내부용)", "value": "2025-02-14" }
    ],
    "rule": "체결 완료 메뉴의 날짜를 최종 체결일로 사용",
    "resolutionStatus": "resolved",
    "resolutionMethod": "completed_menu_priority",
    "needsReview": false
  }
}
```

`dateResolution.status` 값

| 값 | 뜻 | 확인 필요 |
|---|---|---|
| `single_source` | 메뉴 간 불일치 없음 | 아니오 |
| `resolved_by_source_priority` | 불일치를 체결 완료 메뉴 기준으로 확정 | 아니오 |
| `unresolved_multiple_in_completed` | **체결 완료 메뉴 안에서** 서로 다른 날짜 발견 | **예** |
| `unresolved_no_completed_date` | 불일치인데 체결 완료 메뉴에 날짜 없음 → 차순위 사용 | **예** |

- **화면 규칙** 카드·목록에는 `mou.signedAt` 하나만 표시합니다. 두 날짜를 나란히 두거나
  협력업체 리스트의 다른 날짜를 최종값으로 표시하지 않습니다.
  출처 이름(`signedAtSource`)만 상세에 함께 보여줍니다.
- **검증** 규칙으로 해결된 불일치는 `needsReview` / `dateError` / `statusConflict` 에 반영하지 않습니다.
  `validation.mouDateResolved = true` (사실 기록), `validation.mouDateNeedsReview = false`.
  뒤의 두 `unresolved_*` 상태일 때만 `mouDateNeedsReview = true` 로 담당자 확인 대상이 됩니다.
- **변경 이력** 처리 결과가 `changeHistory` 에 `type: "mou_date_resolution"` 으로 남습니다
  (`previousDisplayedDate`, `newDisplayedDate`, `changed`, `selectedSource`, `conflictingValues`, `reason`).

### `mou.partnerListMouMark`
- **표시명** 협력업체 리스트 원본 표기 · **형식** `string | null` (예 `"ㅇ25.11.07"`)
- **카드 위치** 상세 › MOU 타임라인 하단 (원본 표기 참고용)

### `mou.attempts`
- **표시명** 원본 행별 진행 이력 · **형식** `object[]`
- **뜻** 같은 업체가 신규 MOU 프로세스에 **여러 행**으로 존재할 때(1차 시도 허들 → 재접근 후 체결)
  값을 섞지 않고 행 단위로 보존한 원본입니다. 원소: `{menu, sourceName, stage, stageNumber, seedStage, isHold, dates, rawLabels, note, siteText}`
- **대표 타임라인**은 가장 진행된 행에서만 가져옵니다(행을 섞으면 없던 날짜 오류가 생깁니다).
- **카드 위치** 상세 › MOU 타임라인 하단 표 (2건 이상일 때만)

---

## 5. 허들·보류 (`hold`)

| 새 필드명 | 표시명 | 형식 | 출처 | 값 없음 |
|---|---|---|---|---|
| `hold.isOnHold` | 허들·보류 여부 | `boolean` | 허들·보류 탭 존재 여부 | — |
| `hold.startedAt` | 보류 시작일 | `null` (전건) | **원본에 없음** | 미확인 |
| `hold.reason` | 보류 사유 | `string \| null` | 허들·보류 탭 **비고/사유** 열 | “사유 미기재” |
| `hold.decision` | 결정 상태 | `"결정 미입력" \| null` | 액션 결정 (localStorage, 미수집) | 결정 미입력 · 체결로 정리된 건은 `null` |
| `hold.nextReviewAt` | 재접근 예정일 | `null` (전건) | **원본에 없음** | 미확인 |
| `hold.isClosed` | 종결 여부 | `false` (전건) | 종결 상태 저장 필드 없음 | 아니오 |
| `hold.resolvedBySigning` | 체결로 정리된 보류 이력 | `boolean` | 허들 등록 후 체결일 확인됨 | — |
| `hold.needsOwnerCheck` | 담당자 확인 필요 | `boolean` | 상태 충돌 또는 사유 미기재 | — |
| `hold.isSuspectedHold` | 보류 의심 | `boolean` | **진행 현황**에 있으나 비고가 보류성 | — |

**보류 의심 판정 키워드** — 비고에 `협약 보류` `협약 진행 안 함` `진행 X` `중단` `종결` `재검토` `추후 진행` `연락 두절`
중 하나가 있으면 진행 현황 탭이더라도 `isSuspectedHold = true` + `statusConflict = true`.

**진행 중과 허들·보류는 절대 합치지 마세요.**
- 진행 중 = 질문서·회신·미팅 등 **다음 절차가 살아 있는** 상태
- 허들·보류 = 절차가 멈춰 **재접근/보류 유지/종결 결정이 필요한** 상태

---

## 6. 협력업체 정보 (`grade`, `sales`, `gradeHistory`, `sites`, `curriculumHistory`)

| 새 필드명 | 표시명 | 형식 | 출처 | 값 없음 |
|---|---|---|---|---|
| `grade` | 현재 등급 | `string \| null` | 등급 현황 | 미확인 |
| `gradeHistory[]` | 연도별 등급 | `{year, grade, sources[], conflictingGrades[]}[]` | 등급 현황 + 연도별 등급(2025/2024/2023) | 빈 배열 |
| `sales[]` | 연도별 매출 | `{year, amount, source}[]` | 등급 현황 **25년 매출** 열 | 빈 배열 |
| `salesTotal` | 누계 매출 | `number \| null` | `sales` 합계 | 미확인 |
| `siteCount` / `sites[]` | 현장 수 / 현장 목록 | `number` / `object[]` | 진행 현황·체결 완료의 **현장** 열 | 0 / 빈 배열 |
| `curriculumHistory[]` | 교육·커리큘럼 이력 | `[]` (전건) | **업체별 기록 없음** | 빈 배열 |
| `documents[]` | MOU 제출 서류 체크 | `[]` (전건) | localStorage (미수집) | 빈 배열 |

- **매출은 2025년만 있습니다.** 연도별 등급(2024/2023) 표의 `sales` 는 전건 0 이라 매출로 쓰지 않았습니다.
- **`gradeHistory[].conflictingGrades`** — 같은 연도 등급이 메뉴마다 다르면 여기에 기록합니다. 임의로 하나를 고르지 않았습니다.
- **`sites[]`** 원소: `{seq, rawText, name: null, dates: {}, source}`.
  원본 현장 정보가 `23.7/20_부천다정한마을쌍용예가(균열보수)_낙찰` 형태의 **자유 텍스트**이고
  연도가 생략된 경우가 많아 **날짜로 확정하지 않고 `rawText` 원문만 보존**했습니다.
  구조화된 현장 날짜(카달로그 요청일·PT·낙찰일 등 9종, `meta.siteDateFields` 참조)는 localStorage/Firebase 에만 있습니다.

---

## 7. 관리 정보 (`notes`, `sourceTabs`, `changeHistory`, `validation`)

| 새 필드명 | 표시명 | 형식 | 출처 | 값 없음 |
|---|---|---|---|---|
| `notes[]` | 비고 | `{source, text}[]` | 각 메뉴의 비고 열 (출처 표기 포함) | 빈 배열 |
| `sourceTabs[]` | 발견된 원본 메뉴 | `string[]` | 통합 과정 | — |
| `changeHistory[]` | 변경 이력 | `[]` (전건) | **업체 단위 이력 없음** | 빈 배열 |
| `dataAsOf` | 데이터 기준일 | `"2026-07-23"` | 저장소 최신 배포일 | — |
| `lastActivityAt` | 마지막 활동일 | `YYYY-MM-DD \| null` | 타임라인 최신 날짜 | 미확인 |

### `validation` — 검증 결과

| 필드 | 뜻 | 건수 |
|---|---|---|
| `validation.possibleDuplicate` | 중복 의심 | 17 |
| `validation.statusConflict` | 상태 충돌 (체결일로 정리된 6건 포함) | 7 |
| `validation.dateError` | 날짜 순서 오류 | 8 |
| `validation.conflictResolvedBySigning` | 충돌이 있었으나 체결일로 상태 확정 | 6 |
| `validation.missingMouDate` | 체결 완료인데 체결일 없음 | 0 |
| `validation.mouDateMismatch` | 메뉴 간 체결일이 달랐다는 사실 | 25 |
| `validation.mouDateResolved` | 그중 확정 규칙으로 해결됨 (문제 아님) | 25 |
| `validation.mouDateNeedsReview` | 규칙 적용 후에도 담당자 확인 필요 | 0 |
| `validation.missingHoldReason` | 보류 사유 없음 (결정 대기 중인 업체 기준) | 15 |
| `validation.missingNextAction` | 다음 액션 없음 (결정 대기 중인 업체 기준) | 17 |
| `validation.partnerWithoutMouStatus` | 협력업체지만 MOU 상태 없음 | 71 |
| `validation.needsReview` | 위 중 하나라도 해당 | 187 |
| `validation.messages[]` | `{type, message}` — 사람이 읽을 수 있는 사유 전문 | — |

`messages[].type` 은 `statusConflict` / `dateError` / `possibleDuplicate` / `review` 네 가지입니다.
카드 첫 화면에는 앞의 두 종류를 빨간 주의 박스로, 나머지는 노란 박스로 최대 3건까지 띄우고
나머지는 상세 › 검증 탭에서 전부 보여줍니다.

---

## 8. 카드 표시 원칙

**첫 화면(항상 보임)** — 업체명 · 업체코드 · MOU 상태 · 진행 단계 · 기존 협력업체 여부 · MOU 체결일 ·
담당자 · 경과일 · 다음 액션 · 주의사항. **이 10가지 외에는 첫 화면에 두지 않습니다.**

**접기·펼치기(상세 8탭)** — 기본 정보 / 담당자 / MOU 타임라인 / 허들·보류 / 등급·매출 / 현장 / 비고·이력 / 검증

---

## 9. 조인 절차 권장안 (기존 고객관리카드에 붙일 때)

1. 기존 카드에 **업체코드**가 있으면 `companyCode` 로 1차 조인
2. 남은 건은 **사업자등록번호**(`businessNumber`, 하이픈 제거 후) 로 2차 조인
3. 남은 건은 **정규화 업체명**(§1 규칙) 으로 3차 조인
4. 그래도 안 붙는 건은 **자동 매칭하지 말고** 목록으로 뽑아 담당자가 확인
5. `validation.possibleDuplicate = true` 인 17개사는 **조인 전에 먼저 정리**해야 합니다
   (사업자번호를 공유하는 3쌍은 상호 변경인지 오등록인지 확인 필요)

## 10. 카드 적용 전에 추가로 필요한 자료

| 필요 자료 | 이유 | 영향 필드 |
|---|---|---|
| **업체별 담당자 정보** | 원본에 전혀 없음 | `manager.*` 전부, `mou.firstMeetingManager`, `mou.secondMeetingManager` |
| **Firebase 최신 데이터 export** | 운영 중 수정분이 공개 배포본에 반영되지 않음 | 전 필드 |
| **허들·보류 액션 결정** (localStorage `hurdleActions`) | 다음 액션·종결 상태가 전건 공란 | `mou.nextAction`, `hold.decision`, `hold.isClosed` |
| **1·2차 미팅 예정일** | 예정일 필드가 원본에 없음 | `mou.*MeetingScheduledAt` |
| **업체별 제출 서류 체크 상태** (localStorage `companyDocs_*`) | MOU 자료 관리 이력이 공란 | `documents[]` |
| **구조화된 현장 기록** (localStorage/Firebase `siteRecords`) | 현장 날짜 9종이 공란 | `sites[].dates` |
| **업체 등록일** | 원본에 필드 없음 | `profile.registeredAt` |
| **기존 고객관리카드의 HTML/필드 목록** | 실제 조인·렌더 위치 확정 | 전체 |
