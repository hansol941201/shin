/**
 * 연도별 실적 List 옮겨 심기 (id 기준 UPSERT)
 *
 * Sites 배포에서 D1 바인딩(`DB`)과 실적 자료를 넘겨 부릅니다.
 *
 *   import { migratePourSchema } from "@/lib/pour/migrate";
 *   import { seedRecords } from "@/lib/pour/seed-records";
 *   await migratePourSchema(env.DB);
 *   const result = await seedRecords(env.DB, records);
 *
 * 원칙
 *   · 지우지 않는다. DELETE / DROP / TRUNCATE 를 한 번도 쓰지 않는다
 *   · id 기준 UPSERT. 같은 id 면 그 행만 갱신하고 새 행을 만들지 않는다
 *   · 특허 연결은 (project_id, kind, number) 기준 UPSERT. 사람이 나중에 더한
 *     타사 특허를 지우지 않는다
 *   · 두 번 실행해도 행이 늘지 않는다
 *   · 전화번호는 문자열 그대로 넣는다 (앞자리 0 보존)
 *   · 원본에 없는 날짜·특허번호를 만들어 넣지 않는다
 */
import type { D1Like, StoreOptions } from "./store";

/** import-records.py 가 만든 자료 한 건 */
export interface SeedRecord {
  id: string;
  status: string;
  year: string;
  categories: string[];
  region: string;
  city: string;
  patentItems: SeedPatent[];
  noticePatentText: string;
  client: string;
  projectNames: string[];
  scopes: string[];
  phone: string;
  households: number | "";
  quality: string;
  contractor: string;
  remark: string;
  createdAt: string;
}

export interface SeedPatent {
  id: string;
  kind: string;
  number: string;
  display: string;
  createdAt: string;
  updatedAt: string;
}

export interface SeedResult {
  inserted: number;
  updated: number;
  patentsInserted: number;
  patentsUpdated: number;
  skipped: number;
  /** 옮겨 심기 전 projects 행 수 */
  rowsBefore: number;
  /** 옮겨 심은 뒤 projects 행 수 */
  rowsAfter: number;
}

export interface SeedOptions extends StoreOptions {
  /**
   * "upsert" (기본) — 같은 id 가 있으면 실적 자료 값으로 갱신한다
   * "fill"          — 같은 id 가 있으면 비어 있는 칸만 채우고 기존 값은 그대로 둔다
   */
  mode?: "upsert" | "fill";
}

/** 화면 필드 → projects 열. mapping.ts 의 COLUMN_MAP 과 같은 이름을 쓴다. */
const COLUMNS: ReadonlyArray<readonly [string, (r: SeedRecord) => unknown]> = [
  ["status", (r) => r.status],
  ["record_year", (r) => r.year],
  ["region", (r) => r.region],
  ["city", (r) => r.city],
  ["client", (r) => r.client],
  ["project_name", (r) => join(r.projectNames)],
  ["category", (r) => join(r.categories)],
  ["scopes", (r) => join(r.scopes)],
  ["phone", (r) => text(r.phone)],              // 문자열 그대로 — 앞자리 0 보존
  ["households", (r) => (r.households === "" ? null : r.households)],
  ["quality", (r) => text(r.quality)],
  ["contractor", (r) => text(r.contractor)],
  ["notice_patent_text", (r) => text(r.noticePatentText)],
  ["remark", (r) => text(r.remark)],
  ["patents_migrated", () => 1],
  ["created_at", (r) => r.createdAt],
  ["updated_at", (r) => r.createdAt]
] as const;

function join(list: string[] | undefined): string | null {
  const value = (list || []).join("\n");
  return value ? value : null;
}

function text(value: string | undefined): string | null {
  const v = String(value == null ? "" : value);
  return v ? v : null;
}

export async function seedRecords(
  db: D1Like,
  records: SeedRecord[],
  options?: SeedOptions
): Promise<SeedResult> {
  const table = options?.projectsTable || "projects";
  const mode = options?.mode || "upsert";
  const result: SeedResult = {
    inserted: 0, updated: 0, patentsInserted: 0, patentsUpdated: 0, skipped: 0,
    rowsBefore: 0, rowsAfter: 0
  };

  const countRow = async () =>
    (await db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first<{ c: number }>())?.c ?? 0;
  result.rowsBefore = await countRow();

  // 운영 스키마에 실제로 있는 열만 쓴다 (없는 열을 넣으면 오류가 난다)
  const info = (await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()).results || [];
  const have = new Set(info.map((c) => c.name));
  const usable = COLUMNS.filter(([name]) => have.has(name));

  for (const record of records) {
    if (!record || !record.id) { result.skipped++; continue; }

    const exists = await db.prepare(`SELECT id FROM ${table} WHERE id = ?`)
      .bind(record.id).first<{ id: string }>();

    const names = ["id", ...usable.map(([name]) => name)];
    const values: unknown[] = [record.id, ...usable.map(([, read]) => read(record))];

    // created_at 은 새로 넣을 때만 쓴다. 이미 있는 행의 최초 등록일은 바꾸지 않는다.
    const updatable = usable
      .map(([name]) => name)
      .filter((name) => name !== "created_at");

    const setClause = updatable
      .map((name) => (mode === "fill"
        // 비어 있는 칸만 채운다 — 사람이 고쳐 둔 값은 그대로 둔다
        ? `${name} = COALESCE(NULLIF(${table}.${name}, ''), excluded.${name})`
        : `${name} = excluded.${name}`))
      .join(", ");

    await db.prepare(
      `INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})
       ON CONFLICT(id) DO UPDATE SET ${setClause}`
    ).bind(...values).run();

    if (exists) result.updated++; else result.inserted++;

    for (let i = 0; i < (record.patentItems || []).length; i++) {
      const p = record.patentItems[i];
      if (!p || !p.number) continue;
      const kind = p.kind === "THIRD_PARTY" ? "THIRD_PARTY" : "POUR";
      const already = await db.prepare(
        "SELECT id FROM pour_project_patents WHERE project_id = ? AND kind = ? AND number = ?"
      ).bind(record.id, kind, p.number).first<{ id: string }>();

      await db.prepare(
        `INSERT INTO pour_project_patents
           (id, project_id, kind, number, display, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id, kind, number) DO UPDATE SET
           display = excluded.display,
           sort_order = excluded.sort_order,
           updated_at = excluded.updated_at`
      ).bind(
        p.id, record.id, kind, p.number, p.display, i, p.createdAt, p.updatedAt
      ).run();

      if (already) result.patentsUpdated++; else result.patentsInserted++;
    }
  }

  result.rowsAfter = await countRow();
  return result;
}
