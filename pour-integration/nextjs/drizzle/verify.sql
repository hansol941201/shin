-- ============================================================================
-- 마이그레이션 전후 검증 질의
--   npx wrangler d1 execute <DB> --remote --file drizzle/verify.sql
-- ============================================================================

-- [1] 적용 전: 실제 열 이름 확인 → lib/pour/mapping.ts 의 COLUMN_MAP 을 여기에 맞춘다
PRAGMA table_info(projects);

-- [2] 적용 전: 자료 규모 기록 (적용 후와 비교할 기준값)
SELECT COUNT(*) AS 전체_행수 FROM projects;
SELECT status AS 상태, COUNT(*) AS 건수 FROM projects GROUP BY status ORDER BY 건수 DESC;
SELECT MIN(rowid) AS 최소_rowid, MAX(rowid) AS 최대_rowid FROM projects;

-- [3] 적용 전: 표본 10건을 저장해 두고 적용 후 그대로인지 비교한다
SELECT * FROM projects ORDER BY rowid LIMIT 10;

-- ---------------------------------------------------------------------------
-- 여기까지 실행해 결과를 저장한 뒤 마이그레이션을 적용한다
-- ---------------------------------------------------------------------------

-- [4] 적용 후: 행 수가 같아야 한다 (반드시 [2] 와 동일)
SELECT COUNT(*) AS 전체_행수 FROM projects;

-- [5] 적용 후: 기존 열이 그대로 있고 새 열이 더해졌는지
PRAGMA table_info(projects);

-- [6] 적용 후: 새 열은 전부 NULL 이어야 한다 (기존 행을 건드리지 않았다는 뜻)
SELECT
  COUNT(*) AS 전체,
  SUM(CASE WHEN contractor_phone IS NULL THEN 1 ELSE 0 END) AS 시공사전화_NULL,
  SUM(CASE WHEN document_due_date IS NULL THEN 1 ELSE 0 END) AS 서류마감일_NULL,
  SUM(CASE WHEN rebid_round IS NULL THEN 1 ELSE 0 END) AS 재공고차수_NULL
FROM projects;

-- [7] 적용 후: 기존 열 값이 살아 있는지 (예상금액도 지우지 않았다)
SELECT COUNT(*) AS 예상금액_있는_행 FROM projects WHERE expected_amount IS NOT NULL;

-- [8] 새 표 3개가 만들어졌는지
SELECT name FROM sqlite_master
WHERE type = 'table' AND name IN ('pour_patents', 'pour_project_patents', 'pour_project_history');

-- [9] 특허 자료 업로드 후: 등록 건수와 공종 수
SELECT COUNT(*) AS 등록_특허수 FROM pour_patents;
SELECT COUNT(DISTINCT TRIM(value)) AS 공종수
FROM pour_patents, json_each('["' || REPLACE(categories, char(10), '","') || '"]');

-- [10] 저장 후: 한 현장에 특허가 여러 개 붙었는지 (다특허 확인)
SELECT project_id,
       SUM(CASE WHEN kind = 'POUR' THEN 1 ELSE 0 END) AS POUR개수,
       SUM(CASE WHEN kind = 'THIRD_PARTY' THEN 1 ELSE 0 END) AS 타사개수,
       COUNT(*) AS 전체개수
FROM pour_project_patents
GROUP BY project_id
HAVING COUNT(*) >= 2
ORDER BY 전체개수 DESC;

-- [11] 특허번호 미기재 낙찰 (상단 알림 대상과 같아야 한다)
SELECT p.id, p.client, p.status
FROM projects p
LEFT JOIN pour_project_patents pp
  ON pp.project_id = p.id AND pp.kind = 'POUR'
WHERE p.status = '낙찰' AND pp.id IS NULL;

-- [12] 발주처 전화번호와 시공사 전화번호가 섞이지 않았는지
SELECT COUNT(*) AS 같은번호_행
FROM projects
WHERE phone IS NOT NULL AND contractor_phone IS NOT NULL AND phone = contractor_phone;

-- [13] 전화번호 앞자리 0 이 살아 있는지 (문자열로 저장되어야 한다)
SELECT COUNT(*) AS 앞자리0_행 FROM projects WHERE phone LIKE '0%';
