-- ============================================================================
-- 0008_pour_patent_master.sql
-- 특허 마스터에 구분·공법명·확인일을 담을 열 네 개 (순방향)
--
-- 0007_pour_notice_no_partner.sql 다음에 실행합니다.
--
-- 담기는 값
--   patent_type    "POUR" / "타사" / "미분류"
--                  개별 특허 한 건의 구분입니다. 현장 전체의 구분과는 다릅니다.
--                  현장 구분(POUR·타사·다특허(PD)·다특허)은 저장하지 않고
--                  그 현장에 든 특허들을 보고 그때그때 계산합니다.
--   method_name    공법명. 특허명(name)과 따로 둡니다.
--   first_seen_at  이 번호를 현장에서 처음 본 날
--   last_seen_at   마지막으로 본 날
--
-- 쓰임
--   나중에 업체별 공고·낙찰 건수, 지역·공종 분포, POUR 와 같이 나온 타사 특허를
--   집계할 수 있도록 특허번호 하나에 업체 정보를 한 번만 모아 두기 위해서입니다.
--   현장과의 연결은 이미 있는 pour_project_patents 표가 그대로 담당합니다.
--
-- 원칙
--   · 열만 더합니다. 기존 열·행을 지우거나 바꾸지 않습니다
--   · 기존 자료의 네 열은 NULL 로 남습니다
--     (patent_type 이 비어 있으면 읽을 때 POUR 로 봅니다. 이 표는 지금까지
--      POUR 특허 목록으로만 쓰여 왔기 때문이며, 값을 지어내지 않습니다)
--   · 업체명·공법명을 임의로 채우지 않습니다
--   · DROP / DELETE / TRUNCATE / 표 교체를 쓰지 않습니다
-- ============================================================================

ALTER TABLE pour_patents ADD COLUMN patent_type TEXT;
ALTER TABLE pour_patents ADD COLUMN method_name TEXT;
ALTER TABLE pour_patents ADD COLUMN first_seen_at TEXT;
ALTER TABLE pour_patents ADD COLUMN last_seen_at TEXT;
