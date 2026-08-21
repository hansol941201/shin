/**
 * db/schema.ts 에 이어 붙일 표 정의 (Drizzle · SQLite/D1)
 *
 * 기존 projects 정의는 건드리지 않습니다. 아래 세 표만 새로 추가합니다.
 * db/schema.ts 끝에 `export * from "./pour-schema";` 한 줄을 넣거나,
 * 이 파일 내용을 그대로 옮겨 붙이세요.
 */
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/** 업로드한 POUR 특허 관리 자료 */
export const pourPatents = sqliteTable(
  "pour_patents",
  {
    number: text("number").primaryKey(),          // 숫자만 남긴 특허번호
    display: text("display"),                     // 제10-1935719호
    name: text("name"),
    categories: text("categories"),               // 공종 여러 개 — 줄바꿈으로 구분
    company: text("company"),                     // 특허권자
    prefix: text("prefix"),                       // 탭 앞 구분 (예: DO)
    remark: text("remark"),
    active: integer("active").notNull().default(1),
    createdAt: text("created_at"),
    updatedAt: text("updated_at")
  },
  (table) => ({
    nameIdx: index("idx_pour_patents_name").on(table.name)
  })
);

/** 현장에 붙은 특허 (POUR / 타사) */
export const pourProjectPatents = sqliteTable(
  "pour_project_patents",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    kind: text("kind").notNull(),                 // 'POUR' | 'THIRD_PARTY'
    number: text("number").notNull(),
    display: text("display"),
    name: text("name"),
    method: text("method"),
    company: text("company"),                     // 타사 특허 보유 회사
    category: text("category"),
    remark: text("remark"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at"),
    updatedAt: text("updated_at")
  },
  (table) => ({
    projectIdx: index("idx_ppp_project").on(table.projectId),
    numberIdx: index("idx_ppp_number").on(table.kind, table.number),
    uniqueByKind: uniqueIndex("uq_ppp_project_kind_number")
      .on(table.projectId, table.kind, table.number)
  })
);

/** 수정 이력 */
export const pourProjectHistory = sqliteTable(
  "pour_project_history",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    changedAt: text("changed_at").notNull(),
    action: text("action"),
    statusBefore: text("status_before"),
    statusAfter: text("status_after"),
    changesJson: text("changes_json"),
    createdAt: text("created_at")
  },
  (table) => ({
    projectIdx: index("idx_pph_project").on(table.projectId, table.changedAt)
  })
);

/**
 * projects 에 더해지는 열 가운데 하나만 설명이 필요합니다.
 *
 *   patents_migrated INTEGER DEFAULT 0
 *
 * 특허를 pour_project_patents 표로 옮겼는지 나타냅니다.
 * 1 이 되면 옛 patent_numbers 열을 더 이상 읽지 않습니다.
 * (옛 값은 지우지 않고 그대로 남겨 두되, 화면에서 특허를 모두 지웠을 때
 *  옛 번호가 되살아나지 않도록 하기 위한 표시입니다.)
 *
 *   record_year TEXT
 *
 * 연도별 실적 List 엑셀에서 옮겨 온 행의 연도입니다.
 * 원본에 공고일·낙찰일이 없어 날짜를 지어내지 않고 연도만 담습니다.
 * 비어 있으면 화면은 예전처럼 공고일·낙찰일의 앞 네 자리를 씁니다.
 */
