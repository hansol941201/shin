# 기존 Sites 프로젝트(Next.js + D1)로 이식하기

`pour-integration/` 에서 만들고 검증한 화면·로직을 운영 구조에 맞게 옮긴 것입니다.
**새 앱이 아니라 기존 프로젝트에 합치는 것**이고, `app.html` 을 iframe 으로 넣지 않습니다.

## 왜 로직을 다시 쓰지 않았나

`lib/pour/core/` 의 다섯 파일은 `pour-integration/` 에서 **272건의 테스트로 검증된 코드 그대로**입니다.
UMD 라 webpack 이 CommonJS 로 해석해 Next.js 에서 바로 import 됩니다.
TypeScript 로 다시 옮기면 동작이 달라질 위험이 있어, 대신 `.d.ts` 로 타입만 붙였습니다.
화면(React)과 서버(API·D1)는 전부 새로 TypeScript 로 썼습니다.

## 파일 목록

| 구분 | 파일 | 성격 |
|---|---|---|
| 화면 | `app/pour/page.tsx` | 새 화면 진입점 (`/pour`) |
| 화면 | `app/pour/pour.css` | `.pour-scope` 안에만 적용되는 스타일 |
| 화면 | `components/pour/PourApp.tsx` | 메인 화면 (메뉴·툴바·상태탭·목록) |
| 화면 | `components/pour/PourGrid.tsx` | 엑셀형 표 (정렬·필터·너비·선택·고정) |
| 화면 | `components/pour/NoticePanel.tsx` | 새 공고 등록 · 자료 수정 패널 |
| 화면 | `components/pour/AwardPanel.tsx` | 낙찰 상세정보 입력 |
| 화면 | `components/pour/PatentEditor.tsx` | POUR/타사 2탭 특허 입력 + 자동완성 |
| 화면 | `lib/pour/useProjectStore.ts` | API 에서 읽고 쓰는 훅 (localStorage 안 씀) |
| 로직 | `lib/pour/core/*.js` + `*.d.ts` | 검증된 공용 로직 (그대로 가져옴) |
| 서버 | `app/api/records/route.ts` | `GET`/`PUT /api/records` |
| 서버 | `app/api/patents/route.ts` | `GET`/`PUT /api/patents` |
| 서버 | `lib/pour/store.ts` | D1 읽기·upsert |
| 서버 | `lib/pour/mapping.ts` | `projects` 행 ↔ record 변환 |
| DB | `drizzle/0002_pour_integration.sql` | 새 표 3개 (순방향) |
| DB | `scripts/pour-migrate.mjs` | `projects` 에 없는 열만 추가 |
| DB | `db/pour-schema.ts` | Drizzle 표 정의 (기존 schema.ts 에 이어 붙임) |
| DB | `drizzle/verify.sql` | 적용 전후 검증 질의 |
| 문서 | `TESTING.md` | 배포 전 테스트 절차 |

## 적용 순서

1. **검증 질의 [1]~[3] 실행** (`drizzle/verify.sql`) — 열 이름과 행 수를 기록
2. **`lib/pour/mapping.ts` 의 `COLUMN_MAP` 을 실제 열 이름에 맞게 수정**
   ← 이 단계를 건너뛰면 안 됩니다. 초기값은 흔한 이름을 넣어 둔 것입니다.
3. `drizzle/0002_pour_integration.sql` 실행 (새 표 3개)
4. `node scripts/pour-migrate.mjs --db <DB>` 실행 (없는 열만 추가)
5. `db/pour-schema.ts` 를 `db/schema.ts` 에 이어 붙이기
   (또는 `export * from "./pour-schema";` 한 줄 추가)
6. `lib/pour/` 와 `components/pour/` 복사
7. `app/api/records/route.ts`, `app/api/patents/route.ts` 복사
   → **`getDb()` 를 프로젝트의 D1 바인딩 방식에 맞게 고치기** (한 함수만 고치면 됩니다)
8. `app/pour/` 복사 후 `/pour` 에서 확인
9. 확인이 끝나면 `app/page.tsx` 에서 `<PourApp />` 를 렌더하도록 교체
   (기존 `app/page.tsx` 는 백업해 두고, 필요하면 그대로 되돌립니다)
10. `TESTING.md` 의 4~5단계 확인 후 **승인 요청**

## 기존 것을 건드리지 않는 부분

- `app/api/projects/route.ts` 와 `[id]/route.ts` 는 **그대로 둡니다.**
  새 주소(`/api/records`, `/api/patents`)를 따로 만들었습니다.
- `projects` 표의 기존 열은 하나도 지우거나 이름을 바꾸지 않습니다.
- `expected_amount` 는 화면에서 쓰지 않을 뿐, 값은 그대로 보존됩니다.
- 옛 `patent_numbers` 열도 지우지 않습니다. `patents_migrated` 표시로만 읽기를 멈춥니다.
- `PUT` 은 요청에 담긴 id 만 손댑니다. 요청에 없는 행은 그대로 둡니다.
  빈 배열을 받으면 아무것도 하지 않습니다 (전체 삭제 방지).

## 특허를 지웠을 때

`patentItems` 가 **빈 배열**로 오면 "특허를 모두 지웠다"는 뜻입니다.

- `pour_project_patents` 에서 그 현장의 행을 지웁니다
- 옛 `patent_numbers` 열을 다시 읽지 않습니다 (`patents_migrated = 1`)
- 결과적으로 POUR 특허번호가 비게 되고, 상태가 낙찰이면 **미기재 알림에 포함**됩니다

이 동작은 `test-d1.mjs` 로 실제 SQLite 에서 확인합니다.
