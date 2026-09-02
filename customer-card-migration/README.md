# 고객관리카드 마이그레이션 패키지

[POUR 파트너 대시보드](https://pourservice.github.io/partner-dashboard/)의 **전 메뉴를 읽기 전용으로 조사**해
업체 단위로 통합하고, 기존 고객관리카드에 붙일 수 있는 형태로 정리한 결과물입니다.

- 조사일 **2026-09-02** · 데이터 기준일 **2026-07-23** · 데이터 내 최신 날짜 **2026-04-30**
- 고유 업체 **353개사** (원본 1,754행 → 업체 단위 통합)
- 원본 사이트·저장소는 **읽기만** 했습니다. 수정·추가·삭제한 것이 없습니다.

> 이 패키지는 **최종 운영 시스템이 아닙니다.** 기존 고객관리카드에 옮겨 붙이기 위한
> 데이터 + 컴포넌트 시안 + 매핑 문서입니다.

---

## 파일 목록

| 파일 | 목적 | 이식 대상 |
|---|---|---|
| `companies-integrated.json` | 353개사 통합 원본 데이터 (1.5MB) | ✅ 데이터 |
| `customer-card-component.css` | `pcm-` 접두사 카드 스타일 | ✅ 그대로 복사 |
| `customer-card-component.js` | 카드 렌더 + 상세 펼치기 + 탭 (`window.PCMCard`) | ✅ 그대로 복사 |
| `customer-card-component.html` | 카드 마크업 구조 (빈 템플릿 + 실제 렌더 결과) | ✅ 참고용 마크업 |
| `companies-list.html` | **전체 353개사 표 목록** (검색·필터·정렬·상세 펼치기·CSV) | ❌ 확인·공유용 |
| `customer-card-preview.html` | 상태별 카드 8종 + 전체 353개사 카드 시안 | ❌ 확인용 |
| `CUSTOMER-CARD-MAPPING.md` | 필드 매핑표 (출처·변환·검증·표시 위치) | ❌ 문서 |
| `DATA-VALIDATION-REPORT.md` | 중복·상태 충돌·날짜 오류·누락 보고서 | ❌ 문서 |
| `README.md` | 이 문서 | ❌ 문서 |

**먼저 볼 것**

- `companies-list.html` — **353개사 전체를 표로** 봅니다. 데이터가 파일 안에 들어 있어
  **더블클릭 한 번으로 열립니다.** 다른 파일이 필요 없어 그대로 전달·공유해도 됩니다.
- `customer-card-preview.html` — 카드가 어떻게 보이는지 확인합니다.
  같은 폴더의 `.css` / `.js` 를 상대경로로 읽으므로 **폴더째** 열어야 합니다.

---

## 적용 방법 (3단계)

### 1. 파일 추가

```html
<link rel="stylesheet" href="customer-card-component.css">
<script src="customer-card-component.js" defer></script>
```

### 2. 카드를 넣을 자리 마련

```html
<div id="pcm-card-host" class="pcm-cards"></div>
```

### 3. 데이터 연결

```js
fetch('/data/companies-integrated.json')
  .then(function (r) { return r.json(); })
  .then(function (d) {
    PCMCard.mount(document.getElementById('pcm-card-host'), d.companies, {
      mask: false,                    // 사내 시스템이면 false (공개 시안만 true)
      dataAsOf: d.sourceUpdatedAt,
    });
  });
```

서버 템플릿으로 직접 렌더하려면 `customer-card-component.html` 의 **B(빈 구조 템플릿)** 또는
**C(실제 렌더 결과)** 마크업을 복사한 뒤, 감싸는 컨테이너에 `PCMCard.bind(el)` 만 호출하면
상세 펼치기·탭이 동작합니다 (JSON 을 프런트에서 다시 읽을 필요가 없습니다).

### API

| 호출 | 설명 |
|---|---|
| `PCMCard.mount(el, companies, opts)` | 컨테이너에 카드 목록을 그리고 이벤트를 연결 |
| `PCMCard.render(company, opts, index)` | 카드 1건의 HTML 문자열 반환 (직접 삽입용) |
| `PCMCard.bind(el)` | **이미 그려져 있는** 카드 마크업(서버 템플릿 렌더 결과)에 동작만 연결 |
| `PCMCard.mask.{name,phone,email,address,bizno}` | 개인정보 마스킹 함수 |

**옵션** — `mask`(개인정보 마스킹, 기본 `false`) · `open`(처음부터 펼침, 기본 `false`) · `dataAsOf`(기준일 표기)

이벤트는 컨테이너에 **위임**되어 있습니다. 카드를 나중에 추가로 삽입해도 리스너를 다시 달 필요가 없고,
`PCMCard.mount(el, [], opts)` 로 빈 컨테이너에 위임만 걸어 둔 뒤 `PCMCard.render()` 결과를 append 해도 동작합니다
(시안 페이지의 “더 보기”가 이 방식입니다).

---

## 기존 CSS와 충돌하지 않는 이유

- 모든 선택자가 **`.pcm-` 접두사**로 시작합니다.
- `body` `html` `div` `button` `table` 같은 **전역 태그 선택자를 단독으로 쓰지 않습니다.**
  태그 스타일이 필요한 곳은 `.pcm-card button`, `.pcm-card table.pcm-card__table` 처럼 컴포넌트 내부로 한정했습니다.
- CSS 변수(`--pcm-*`)는 `.pcm-card` / `.pcm-cards` 안에만 정의해 기존 페이지 변수와 겹치지 않습니다.
- **외부 CDN·프레임워크·웹폰트를 쓰지 않습니다.** JS도 순수 DOM이고 전역은 `window.PCMCard` 하나뿐입니다.
- `customer-card-preview.html` 안의 `.pcmx-` 규칙은 **시안 페이지 껍데기 전용**이라 이식 대상이 아닙니다.

### 상태 색상

| 상태 | 색 | 카드 클래스 | 배지 클래스 |
|---|---|---|---|
| MOU 체결 완료 | 초록 | `pcm-card--done` | `pcm-badge--done` |
| MOU 체결 완료·체결일 미확인 | 노랑 | `pcm-card--nodate` | `pcm-badge--nodate` |
| MOU 진행 중 | 파랑 | `pcm-card--ongoing` | `pcm-badge--ongoing` |
| 허들·보류 | 주황 | `pcm-card--hold` | `pcm-badge--hold` |
| 종결 | 어두운 회색 | `pcm-card--closed` | `pcm-badge--closed` |
| 기존 협력업체·MOU 상태 확인 필요 | 회색 | `pcm-card--unknown` | `pcm-badge--unknown` |
| 상태 충돌·날짜 오류 | 빨강 | `pcm-card--alert` | `pcm-badge--alert` |

---

## 카드 구성

**첫 화면** — 업체명 · 업체코드 · MOU 상태 · 진행 단계 · 기존 협력업체 여부 · MOU 체결일 · 담당자 · 경과일 · 다음 액션 · 주의사항

**“상세 보기”를 누르면 펼쳐지는 8개 탭** — 기본 정보 / 담당자 / MOU 타임라인 / 허들·보류 / 등급·매출 / 현장 / 비고·이력 / 검증

값이 없는 필드는 빈칸이 아니라 **“미확인”** 을 출력합니다.

---

## 데이터 요약

| 최종 MOU 상태 | 업체 수 |
|---|---|
| MOU 체결 완료 | 220 |
| MOU 체결 완료·체결일 미확인 | 0 |
| MOU 진행 중 | 44 |
| 허들·보류 | 17 |
| 종결 | 0 |
| 기존 협력업체·MOU 상태 확인 필요 | 71 |
| 상태 충돌·담당자 확인 필요 | 1 |
| **합계** | **353** |

기존 협력업체 275 · 신규 MOU 프로세스 유입 159 · 등급 보유 257

| 검증 | 건수 |
|---|---|
| 중복 의심 | 17 |
| 상태 충돌 | 7 |
| 날짜 오류 | 8 |
| 메뉴 간 체결일 값 불일치 | 25 |
| 보류 사유 미기재 | 15 |
| 다음 액션 미입력 | 17 |
| 협력업체지만 MOU 상태 확인 불가 | 71 |

자세한 내용은 `DATA-VALIDATION-REPORT.md` 를 보세요.

---

## 데이터를 다룰 때 꼭 지킬 것

1. **기존 협력업체 ≠ MOU 체결.** `isExistingPartner` 와 `mou.status` 는 **별개 속성**입니다.
   협력업체 리스트에 있다는 이유로 체결로 추정하지 않았습니다(협약체결 칸이 빈 71개사는 “상태 확인 필요”).
2. **진행 중과 허들·보류를 합치지 마세요.** 둘 다 미체결이지만 운영 액션이 다릅니다.
3. **체결일이 있으면 다른 메뉴에 미체결로 남아 있어도 `MOU 체결 완료` 입니다.** 결국 체결한 곳이기 때문입니다.
   충돌 사실은 지우지 않고 `validation.statusConflict` 로 계속 표시하니(7건), 원본 사이트 정리 대상은 그대로 추적됩니다.
   체결 근거가 없는 충돌 1건만 `mou.status = "상태 충돌·담당자 확인 필요"` 입니다.
4. **단계를 건너뛴 것은 오류가 아닙니다.** 미팅 없이 바로 체결하는 업체가 있어, 체결이 확인되면 중간 단계가
   비어 있어도 오류로 보지 않습니다. 어떤 단계에 기록이 없는지는 `mou.skippedSteps` 에 참고 정보로 있습니다.
5. **날짜를 지어내지 마세요.** 날짜로 해석되지 않는 원문(`조율중`, `예정`, `X`)은 `mou.rawLabels` 에 원문 그대로 있습니다.
6. **경과일은 다시 계산하세요.** `mou.elapsedDays` 는 2026-09-02 기준 스냅샷입니다.
7. **`id` 는 영구 키가 아닙니다.** 조인은 `companyCode` → `businessNumber` → 정규화 업체명 순으로 하세요
   (`CUSTOMER-CARD-MAPPING.md` §9).
8. **개인정보** — JSON 에는 대표자·연락처·이메일·주소·사업자번호 원본값이 들어 있습니다.
   공개 배포 시 `mask: true` 를 쓰거나 해당 필드를 제거하세요.

---

## 아직 못 가져온 것

원본의 **공개 정적 데이터**만 조사했습니다. 다음은 비공개 저장소(Firebase Realtime Database /
브라우저 localStorage)에 있거나 원본에 필드 자체가 없어 가져오지 못했습니다.
**개인 인증정보나 비공개 시스템에는 접근하지 않았습니다.**

- Firebase 실시간 동기화 데이터 (운영 중 수정분)
- 업체별 담당자 정보 — **원본에 필드 자체가 없음. 카드 적용 전 1순위로 필요**
- 허들·보류 “액션 결정” (재접근/종결/보류 유지/재발송/확인 필요) → 종결 상태가 0건인 이유
- 1·2차 미팅 **예정일**
- 업체별 MOU 제출 서류 체크 상태
- 구조화된 현장 날짜 9종 (현장 텍스트 원문은 보존)
- 업체별 변경 이력 · 업체 등록일
- 2024·2023년 매출액 (원본 값이 전건 0)

전체 목록과 사유는 `companies-integrated.json` 의 `notCollected` 와
`DATA-VALIDATION-REPORT.md` §10 에 있습니다.

---

## 다음 단계

기존 고객관리카드의 **HTML 구조 또는 프로젝트 파일을 주시면**, 그 구조를 먼저 분석한 뒤
이 데이터와 카드 컴포넌트를 실제 카드에 맞춰 붙이겠습니다.
현재 단계에서는 기존 카드 코드를 추측하거나 변경하지 않았습니다.
