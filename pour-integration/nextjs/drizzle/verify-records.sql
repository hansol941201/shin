-- ============================================================================
-- 연도별 실적 List 옮겨 심기 전후 검증 질의
--   npx wrangler d1 execute <DB> --remote --file drizzle/verify-records.sql
--
-- 순서
--   1) [적용 전] 아래 [1]~[4] 를 실행해 결과를 저장한다
--   2) scripts/pour-migrate.mjs 로 record_year 를 포함한 새 열을 더한다
--   3) drizzle/seed-records.sql 을 실행한다
--   4) [5]~[11] 을 실행해 [1]~[4] 와 비교한다
--
-- 이 파일은 읽기 전용이다. 자료를 바꾸는 문장이 없다.
-- ============================================================================

-- ------------------------------------------------------------------ 적용 전
-- [1] 기존 자료 규모 (적용 후와 비교할 기준값)
SELECT COUNT(*) AS 기존_전체행수 FROM projects;
SELECT status AS 상태, COUNT(*) AS 건수 FROM projects GROUP BY status ORDER BY 건수 DESC;

-- [2] 옮겨 심을 id 가 이미 쓰이고 있지는 않은지 (0 이어야 한다)
SELECT COUNT(*) AS 겹치는_id FROM projects WHERE id LIKE 'rec-imp-%';

-- [3] record_year 열이 있는지 (없으면 pour-migrate.mjs 를 먼저 실행)
PRAGMA table_info(projects);

-- [4] 표본 10건 — 적용 후 그대로인지 눈으로 비교한다
SELECT * FROM projects WHERE id NOT LIKE 'rec-imp-%' ORDER BY rowid LIMIT 10;

-- ---------------------------------------------------------------------------
-- 여기까지 저장한 뒤 마이그레이션 → seed-records.sql 순서로 적용한다
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------------ 적용 후
-- [5] 기존 행은 그대로, 옮겨 온 행만 늘었는지
--     기존_남은행수 가 [1] 과 같아야 한다
SELECT
  COUNT(*)                                                   AS 전체행수,
  SUM(CASE WHEN id LIKE 'rec-imp-%' THEN 0 ELSE 1 END)       AS 기존_남은행수,
  SUM(CASE WHEN id LIKE 'rec-imp-%' THEN 1 ELSE 0 END)       AS 옮겨온_행수
FROM projects;

-- [6] 표본 10건이 그대로인지 ([4] 와 비교)
SELECT * FROM projects WHERE id NOT LIKE 'rec-imp-%' ORDER BY rowid LIMIT 10;

-- [7] 연도별 건수 — 원본 시트와 맞는지
--     2026:320 2025:478 2024:316 2023:260 2022:185 2021:229 2020:120 2019:67 2018:4 (합계 1,979)
SELECT record_year AS 연도, COUNT(*) AS 건수
FROM projects WHERE id LIKE 'rec-imp-%'
GROUP BY record_year ORDER BY 연도 DESC;

-- [8] 겹치는 실적이 없는지 (0 이어야 한다)
SELECT COUNT(*) AS 겹치는_묶음 FROM (
  SELECT client, project_name FROM projects
  WHERE id LIKE 'rec-imp-%'
  GROUP BY client, project_name HAVING COUNT(*) > 1
);

-- [9] 전화번호가 문자열로 남아 앞자리 0 이 살아 있는지
--     앞자리0_전화 가 0 보다 커야 하고, typeof 는 모두 text 여야 한다
SELECT
  SUM(CASE WHEN phone LIKE '0%' THEN 1 ELSE 0 END) AS 앞자리0_전화,
  SUM(CASE WHEN typeof(phone) = 'text'  THEN 1 ELSE 0 END) AS 문자열_전화,
  SUM(CASE WHEN typeof(phone) = 'integer' THEN 1 ELSE 0 END) AS 숫자로_변한_전화
FROM projects WHERE id LIKE 'rec-imp-%' AND phone IS NOT NULL AND phone <> '';

-- [10] 특허 연결 — 옮겨 온 행에 붙은 POUR 특허 수와 번호 종류
SELECT
  COUNT(*)                AS 특허연결_건수,
  COUNT(DISTINCT number)  AS 특허번호_종류,
  SUM(CASE WHEN kind <> 'POUR' THEN 1 ELSE 0 END) AS POUR가_아닌_것
FROM pour_project_patents WHERE project_id LIKE 'rec-imp-%';

-- [11] 원본에 없던 날짜를 만들어 넣지 않았는지 (셋 다 0 이어야 한다)
SELECT
  SUM(CASE WHEN notice_date IS NOT NULL AND notice_date <> '' THEN 1 ELSE 0 END) AS 공고일_채워짐,
  SUM(CASE WHEN bid_date    IS NOT NULL AND bid_date    <> '' THEN 1 ELSE 0 END) AS 개찰일_채워짐,
  SUM(CASE WHEN award_date  IS NOT NULL AND award_date  <> '' THEN 1 ELSE 0 END) AS 낙찰일_채워짐
FROM projects WHERE id LIKE 'rec-imp-%';

-- [12] 두 번 실행해도 늘지 않는지 확인하려면 seed-records.sql 을 한 번 더 실행하고
--      [5] 를 다시 본다. 숫자가 모두 같아야 한다.
