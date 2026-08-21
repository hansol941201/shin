# 배포 전 테스트 절차

운영 배포는 **승인 전까지 하지 않습니다.** 아래 순서로 로컬 → 프리뷰까지 확인하세요.

## 0. 적용 전 기록 남기기 (필수)

```bash
npx wrangler d1 execute <DB> --remote --command "SELECT COUNT(*) AS n FROM projects"
npx wrangler d1 execute <DB> --remote --command "PRAGMA table_info(projects)"
npx wrangler d1 execute <DB> --remote --command "SELECT * FROM projects ORDER BY rowid LIMIT 10"
```

세 결과를 파일로 저장해 두세요. 적용 후 같은 질의로 비교합니다.
전체 질의 모음은 `drizzle/verify.sql` 에 있습니다.

## 1. 로컬 D1 에서 마이그레이션

```bash
npx wrangler d1 execute <DB> --local --file drizzle/0002_pour_integration.sql
node scripts/pour-migrate.mjs --db <DB> --table projects
```

스크립트가 적용 전후 행 수를 비교해 다르면 실패로 끝냅니다.
같은 명령을 두 번 실행해도 "추가한 열 0개" 가 나와야 합니다.

## 2. 열 이름 맞추기

`PRAGMA table_info(projects)` 결과와 `lib/pour/mapping.ts` 의 `COLUMN_MAP` 을 비교해
다른 이름이 있으면 `COLUMN_MAP` 을 고칩니다. **스키마를 고치지 말고 매핑을 고치세요.**

## 3. 로컬 실행

```bash
npm run dev
```

- `/pour` 로 접속 → 목록이 기존 자료로 채워지는지
- 브라우저 콘솔에 오류가 없는지
- 네트워크 탭에서 `GET /api/records`, `GET /api/patents` 가 200 인지

## 4. 기능 확인 (직접)

| # | 확인할 것 | 기대 |
|---|---|---|
| 1 | 첫 화면 | 엑셀형 목록이 중심, 입력폼이 펼쳐져 있지 않음 |
| 2 | ＋ 새 공고 | 오른쪽 패널이 열리고 목록은 뒤에 남음 |
| 3 | 전화번호·세대수 비우고 등록 | 빈칸으로 저장 (0 으로 바뀌지 않음) |
| 4 | 입찰종류 | 서류접수·전자입찰 택일, 선택 시 네이비 |
| 5 | POUR 특허 드롭다운 | 빈칸 클릭 시 목록 / `193` / `23` / 공종명 검색 |
| 6 | 특허 선택 | 공종 자동 입력, 여러 개면 중복 제거, 지우면 재계산 |
| 7 | 타사 특허 | 별도 탭에서 3개 이상 추가, 중복 차단 |
| 8 | 다특허 | `다특허 · 총 N개` 배지 |
| 9 | 낙찰로 변경 | 같은 행이 갱신되고 새 행이 생기지 않음 |
| 10 | 시공사 전화번호 | 발주처 전화번호와 다른 열, 자동 복사 없음 |
| 11 | 전화번호 하이픈 | `0316473158` → `031-647-3158` |
| 12 | 상태 탭 | 전체/낙찰/공고/재공고(유찰) 건수와 필터 |
| 13 | 검색·필터·정렬 | 통합검색, 열별 필터, 열 제목 정렬 |
| 14 | 행 선택 | 1회 클릭 선택, 2회 클릭 수정 |
| 15 | 특허번호 지우고 낙찰 저장 | 확인 후 저장, 이전 번호가 되살아나지 않음 |
| 16 | 미기재 알림 | 특허 빈 낙찰이 상단에 뜨고, 누르면 그 건만 표시 |
| 17 | 새로고침 | 자료가 그대로 (D1 에서 다시 읽음) |
| 18 | PC·태블릿·모바일 | 4열 → 2열 → 1열, 모바일 햄버거 메뉴 |

## 5. D1 검증 질의

`drizzle/verify.sql` 의 [4]~[13] 을 실행합니다. 특히:

```sql
-- 행 수가 적용 전과 같아야 한다
SELECT COUNT(*) FROM projects;

-- 발주처 전화번호와 시공사 전화번호가 섞이지 않았는지
SELECT COUNT(*) FROM projects
WHERE phone IS NOT NULL AND contractor_phone IS NOT NULL AND phone = contractor_phone;

-- 특허번호 미기재 낙찰 (화면 상단 알림 건수와 같아야 한다)
SELECT p.id, p.client FROM projects p
LEFT JOIN pour_project_patents pp ON pp.project_id = p.id AND pp.kind = 'POUR'
WHERE p.status = '낙찰' AND pp.id IS NULL;
```

## 6. 이식물 자체 검증

```bash
npx tsc -p tsconfig.json --noEmit         # 타입 검사
npx tsc -p tsconfig.build.json && node test-d1.mjs   # D1 저장 로직 (실제 SQLite)
```

공용 로직은 `pour-integration/test/` 에서 272건이 통과한 상태 그대로 씁니다.

## 7. 프리뷰 배포 후 승인 요청

프리뷰(또는 `--remote` 가 아닌 별도 D1)에서 1~5 를 다시 확인하고,
화면 캡처와 검증 질의 결과를 정리해 **승인을 요청한 뒤** 운영에 올립니다.

## 되돌리기

- 코드: 이전 커밋으로 되돌리면 됩니다.
- D1: 더한 표와 열은 **그대로 두세요.** 지우면 그 안의 자료가 함께 사라집니다.
  화면만 예전 것으로 돌리면 새 열은 무시되고 기존 열로 그대로 동작합니다.
- 옛 `patent_numbers` 열은 지우지 않았으므로, `patents_migrated` 를 0 으로 되돌리면
  예전 방식으로 다시 읽힙니다.
