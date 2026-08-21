-- ============================================================================
-- 0003_pour_record_year.sql
-- 연도별 실적 List 의 연도를 담을 record_year 열 (순방향)
--
-- 0002_pour_integration.sql 다음에 실행합니다.
--
-- 원칙
--   · 열 하나만 더합니다. 기존 열·행·표를 지우거나 바꾸지 않습니다
--   · NULL 허용이라 기존 행은 그대로 NULL 이 됩니다
--   · DROP / DELETE / TRUNCATE / 표 교체를 쓰지 않습니다
--
-- ⚠ Drizzle 마이그레이션 기록(journal)이 파일마다 한 번씩만 실행해 줍니다.
--    기록 없이 손으로 돌릴 때는 이미 열이 있으면 오류가 납니다.
--    그때는 lib/pour/migrate.ts 의 migratePourSchema() 를 쓰세요
--    (없는 열만 골라 더하므로 몇 번을 실행해도 안전합니다).
-- ============================================================================

ALTER TABLE projects ADD COLUMN record_year TEXT;
