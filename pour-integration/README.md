# POUR 공사실적 통합관리 — 입력·실적표 모듈

「한솔 공사실적 통합관리」 사이트에 붙이기 위한 독립 모듈입니다.
대상 사이트의 소스를 확보하지 못해, **소스에 의존하지 않는 순수 로직과 화면 위젯**으로
먼저 구현했습니다. 소스가 준비되면 기존 입력칸·표에 연결하기만 하면 됩니다.

`app.html` 을 브라우저로 열면 전체 화면을 바로 확인할 수 있습니다.
(`demo.html` 은 모듈 단위 동작을 확인하는 보조 화면입니다.)

## 메인 화면 구성 (`app.html`)

상단 메뉴(공고·실적 / 특허별 실적 / 가져오기·내보내기 / 통계·분석 / 설정) →
작업 버튼 → 상태 필터 탭 → 엑셀형 전체 목록 순서로, 목록이 화면의 중심입니다.
공고 등록·수정과 낙찰 입력은 오른쪽에서 밀려 나오는 패널로 열리고 목록은 뒤에 그대로 남습니다.

- 21개 열, 머리글 고정, 주요 식별 열(No.·상태·발주처) 고정, 가로 스크롤
- 열 제목 클릭 정렬 / 열별 필터 / 열 너비 드래그 조절
- 행 한 번 클릭 = 선택(네이비 테두리), 두 번 클릭 = 상세 수정
- 상태 배지와 다특허 배지, 특허번호 미기재 낙찰 경고 배지
- 색: 진한 네이비 `#17213B` · 중간 네이비 `#33415F` · 배경 `#F4F6F8` ·
  표 머리글 `#E9EDF2` · 셀 테두리 `#CBD2DC`

## 파일 구성

| 파일 | 내용 |
|---|---|
| `regions.data.js` | 전국 시·도 / 시·군·구 매핑 (행정안전부 법정동 코드, 기준일 2026-07-30, 269개) |
| `pour-region.js` | 「지역·도시」 입력 해석 — 도시만 입력해도 시·도 자동 판단 |
| `pour-patents.js` | 특허 엑셀 파싱·정규화·검색, POUR 특허 저장소 |
| `pour-records.js` | 공사실적 자료 모델, 실적표 열 정의, 다특허 판정, 수정 이력, 알림 |
| `pour-export.js` | CSV·엑셀 내보내기 (특허별 워크시트 분리) |
| `pour-ui.js` | 자동완성·엑셀형 표·특허 탭 위젯 |
| `pour-patent-editor.js` | POUR/타사 특허 2탭 입력기 |
| `pour-integration.css` | 표·탭·드롭다운 스타일 |
| `pour-grid.js` | 엑셀형 표 (정렬·열 필터·열 너비 조절·행 선택·열 고정) |
| `app.html` · `app.js` · `app.css` | **메인 화면** — 업무용 데이터 관리 화면 |
| `demo.html` · `demo.js` | 모듈 동작 확인용 보조 화면 |
| `test/` | 로직 116건 + 브라우저 133건 검증 (첨부 엑셀 원본 포함) |

## 사용법

### 1. 지역·도시 (`pour-region.js`)

화면에는 도시만 입력받고, 저장은 기존 구조대로 `region` / `city` 를 나눕니다.

```js
PourRegion.parse("하남");      // { status:"resolved", region:"경기", city:"하남" }
PourRegion.parse("금산군");    // { status:"resolved", region:"충남", city:"금산" }
PourRegion.parse("서울 강남"); // { status:"resolved", region:"서울", city:"강남" }
PourRegion.parse("중구");      // { status:"ambiguous", candidates:[서울 중구, 부산 중구, ...] }
```

여러 시도에 같은 이름이 있는 7개(`중구` `동구` `서구` `남구` `북구` `강서` `고성`)는
임의로 확정하지 않고 선택 목록을 돌려줍니다.

### 2. 특허 엑셀 (`pour-patents.js`)

```js
PourPatents.load(rows, storage);   // { inserted, updated, duplicated, errors, total }
PourPatents.search("193");         // 번호 시작 일치 우선, 최대 10개
PourPatents.search("POUR");        // 특허명·공법명 검색
PourPatents.formatNumber("1935719");  // "제10-1935719호"
```

- 번호 정규화: `특허 제10-1935719호` · `10-1935719` · `1935719` → 모두 `1935719`
- 열 이름 자동 인식: 특허번호 / 특허명·공법명 / 공종 / 구분 / 사용여부 / 비고
- 같은 번호를 다시 올리면 새로 만들지 않고 **갱신**
- 필수 열이 없으면 어떤 열이 필요한지 한국어로 안내

### 3. 실적 자료 (`pour-records.js`)

한 현장은 **반드시 한 행**입니다. 공고를 낙찰로 바꿔도 같은 `id` 를 갱신합니다.

```js
PourRecords.save(data, storage);            // 등록 (특허번호 없어도 가능)
PourRecords.award(id, payload, storage);    // 낙찰 전환
PourRecords.update(id, changes, storage);   // 어느 화면에서든 같은 자료 수정 + 이력 기록
PourRecords.patentStats(record, storage);   // 다특허 판정과 배지
PourRecords.alerts(records, storage);       // 상단 알림 묶음
```

낙찰 필수 항목은 **낙찰일 · 시공사 · 낙찰금액 · 최종 공종** 이고,
POUR 특허번호는 필수가 아닙니다. 비어 있으면 `needsConfirm` 확인 경고만 돌려줍니다.

### 4. POUR / 타사 특허

특허는 `patentItems` 배열에 개별 항목으로 저장되며 `kind` 로 구분합니다.

```js
{ id, recordId, kind: "POUR" | "THIRD_PARTY", number, display,
  name, method, company, category, remark, createdAt, updatedAt }
```

- `patentNumbers` 는 **POUR 특허만** 모읍니다 → 타사 번호를 넣어도 POUR 미기재 알림이 풀리지 않습니다
- 다특허 여부는 개수로 자동 판정 (POUR + 타사 ≥ 2)
- 배지 색상: POUR만 파랑 / 혼합 보라 / 타사만 회색 / 번호 미확인 주황

기존 `patentNumbers` 자료는 `migratePatentItems()` 로 POUR 특허 항목으로 옮기고,
엑셀과 일치하지 않는 번호는 자동 확정하지 않고 검토 대상으로 표시합니다.
`rollbackMigration()` 으로 되돌릴 수 있습니다.

### 5. 낙찰 전환

상태가 `공고` · `재공고` 인 행에 **「낙찰로 변경」** 버튼이 붙고, 누르면
「낙찰 상세정보 입력」 창이 열립니다. 창 위쪽에 기존 공고 내용을 요약해 보여줘
다른 공고를 잘못 고치는 것을 막습니다.

- 필수: 시공사명 · 시공사 전화번호 · 낙찰일 · 낙찰금액 · 최종 공종
  (누락 항목은 각 입력칸 아래에 따로 표시)
- POUR 특허번호는 필수가 아니며, 비어 있으면 확인 후 저장됩니다
- 발주처 전화번호(`phone`)와 시공사 전화번호(`contractorPhone`)는 **다른 필드**이며
  자동으로 복사되지 않습니다
- 전화번호는 문자열로 저장되고, 숫자만 입력하면 보기용 하이픈만 붙습니다
- 저장 중에는 버튼이 잠겨 중복 요청을 막습니다
- 저장해도 새 행을 만들지 않고 같은 `id` 를 갱신하며, 최초 등록일과 공고 내용은 유지됩니다

### 6. 공고 등록 카드 배치

| 줄 | 구성 |
|---|---|
| 제목 | 새 공고 등록 + 재공고 건 체크박스 (같은 줄, 간격 14px) |
| 1행 | 아파트·단지명 / 공사명 / 공종 (3열) |
| 2행 | 지역 / 도시 / 전화번호(선택) / 세대수(선택) (4열) |
| 3행 | 공고일* / 서류 마감일(선택) / 개찰일(선택) / 입찰종류(서류접수·전자입찰) (4열) |
| 4행 | 특허·공사범위·추가정보 펼치기 |
| 하단 | 오른쪽 정렬 「공고 등록하기」 |

`repeat(4, minmax(0, 1fr))` 를 써서 각 칸이 정확히 4분의 1 너비가 되고,
태블릿(≤1024px) 2열, 모바일(≤640px) 1열로 바뀝니다.
필수는 **공고일** 뿐이며, 비워둔 값은 `0` 이나 `—` 로 바꾸지 않고 빈칸으로 저장합니다.

### 7. 내보내기 (`pour-export.js`)

```js
PourExport.toCsv(records);                          // 화면 표와 같은 열 순서
PourExport.buildPatentWorkbook(tabs, records);      // 특허번호별 워크시트
```

엑셀은 **ExcelJS** 가 있을 때만 만듭니다 (`window.ExcelJS` 또는 `require("exceljs")`).
제목 행 굵게·가운데, 첫 행 고정, 자동 필터, 열 너비, 셀 경계선, 줄바꿈 유지,
전화번호 문자열, 세대수·금액 숫자 서식을 적용합니다.
없으면 CSV 로 대체됩니다.

> `vendor/exceljs.min.js` 는 저장소에 포함하지 않습니다.
> `npm i exceljs` 후 `node_modules/exceljs/dist/exceljs.min.js` 를 복사하거나 CDN 을 쓰세요.

## 검증

```sh
sh pour-integration/test/run-all.sh
```

| 파일 | 항목 | 결과 |
|---|---|---|
| `test/logic.test.js` | 지역 분류, 엑셀 업로드, 자동검색, 실적표, 엑셀 파일 재확인 | 47건 통과 |
| `test/edit.test.js` | 수정 기능, 미기재 알림, 수정 이력 | 20건 통과 |
| `test/multipatent.test.js` | POUR/타사 분리, 다특허, 자료 이전 | 30건 통과 |
| `test/real-excel.test.js` | 첨부해 주신 POUR 특허 엑셀 원본으로 검증 | 19건 통과 |
| `test/browser.test.js` | 모듈 동작·레이아웃 (demo.html) | 85건 통과 |
| `test/app.test.js` | 메인 화면 동작 (app.html) | 48건 통과 |

브라우저 테스트는 Playwright 를 씁니다.
사전 설치된 Chromium 을 쓰려면 `chromium.launch({ executablePath })` 경로를 환경에 맞게 고치세요.

## 첨부 특허 엑셀 분석 결과

`POUR공법_공종별 분류` 시트 1장, 1행은 제목, **2행이 머리글**, 3행부터 자료(94행).

| 엑셀 열 | 인식한 항목 |
|---|---|
| A 공종 | 공종 분류 (병합 셀 — 그룹 첫 줄에만 값) |
| B 특허번호 | 특허번호 (`제 10-2119347호` 처럼 띄어쓴 표기) |
| C 특허명 | 특허명·공법명 |
| D 특허권자 | 회사명 (전량 ㈜넷폼알앤디 — 소유 구분 열은 따로 없음) |
| E 발명자 / F 출원번호 / G 출원일 / H 등록일 | 사용하지 않음 |
| I 비고 | 비고 (값이 있는 행 없음) |

- **등록 50건**, 빈 특허번호 0건, 형식 오류 0건
- 공종 **23종**, 자료 행 94행 → 특허 50건
- 같은 특허가 여러 공종에 걸쳐 반복됩니다(50건 중 **23건**). 중복으로 버리지 않고
  **공종을 합쳐 한 건으로** 보관합니다. 예: 제10-2425081호 → 듀얼, 우레탄, 폴리우레아,
  탄성강화보강 (바탕면), 에폭시, 엠보라이닝
- 특허명이 전부 국문 기술명이라 `POUR` 글자가 없습니다. `POUR` 검색은
  **우리 특허 전체**를 뜻하는 검색어로 처리합니다.

## 기존 사이트에 붙일 때

1. `regions.data.js` → `pour-region.js` → `pour-patents.js` → `pour-records.js` →
   `pour-export.js` → `pour-ui.js` → `pour-patent-editor.js` 순서로 불러옵니다.
2. `pour-integration.css` 를 추가하고, 자동완성이 잘리지 않도록
   입력칸 조상에 `overflow:hidden` 이 걸려 있지 않은지 확인합니다.
3. 강조색은 `.pour-scope` 의 `--pour-accent` 변수만 기존 사이트 색으로 바꾸면 됩니다.
4. 저장은 `localStorage` 대신 기존 API/D1 을 쓰도록 `list` / `save` / `update` 의
   저장소 인자만 바꿔 끼우면 됩니다. 모듈은 `getItem` / `setItem` 만 요구합니다.

## 주의

- 특허번호와 공종의 연결은 **업로드한 엑셀에서만** 옵니다. 코드에 하드코딩된 값이 없습니다.
- 예상금액은 화면과 신규 저장 처리에서 쓰지 않지만, 모델에는 남아 있어 기존 값이 보존됩니다.
