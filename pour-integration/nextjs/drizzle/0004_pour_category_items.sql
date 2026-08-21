-- ============================================================================
-- 0004_pour_category_items.sql
-- 공종의 대분류+세부 짝을 담을 category_items 열 (순방향)
--
-- 0003_pour_record_year.sql 다음에 실행합니다.
--
-- 원칙
--   · 열 하나만 더합니다. 기존 공종 열(category)은 그대로 둡니다
--   · NULL 허용이라 기존 행은 그대로 NULL 이 됩니다
--     (읽을 때 기존 공종 이름에서 분류를 붙여 주므로 자료가 비지 않습니다)
--   · DROP / DELETE / TRUNCATE / 표 교체를 쓰지 않습니다
--
-- 담기는 값: JSON 배열. 예) [{"group":"주차장","name":"우레탄"}]
-- 같은 세부 공종이 여러 대분류에 있어서 이름만으로는 대분류를 알 수 없기 때문입니다.
--
-- ⚠ Drizzle 마이그레이션 기록(journal)이 파일마다 한 번씩만 실행해 줍니다.
--    기록 없이 손으로 돌릴 때는 lib/pour/migrate.ts 의 migratePourSchema() 를 쓰세요.
-- ============================================================================

ALTER TABLE projects ADD COLUMN category_items TEXT;
