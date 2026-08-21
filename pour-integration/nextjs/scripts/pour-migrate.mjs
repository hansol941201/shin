#!/usr/bin/env node
/**
 * projects 표에 없는 열만 골라 추가한다.
 *
 *   npx wrangler d1 execute <DB> --file drizzle/0002_pour_integration.sql   # 새 표 3개
 *   node scripts/pour-migrate.mjs --db <DB> [--remote] [--table projects]   # 열 추가
 *
 * 이미 있는 열은 건너뛰므로 여러 번 실행해도 안전하다.
 * 기존 자료를 지우거나 바꾸지 않는다.
 */
import { execFileSync } from "node:child_process";

const NEW_COLUMNS = [
  ["document_due_date", "TEXT"],
  ["bid_type", "TEXT"],
  ["bid_type_raw", "TEXT"],
  ["contractor_phone", "TEXT"],
  ["contractor_contact_name", "TEXT"],
  ["contractor_mobile", "TEXT"],
  ["contractor_address", "TEXT"],
  ["contractor_business_no", "TEXT"],
  ["contractor_note", "TEXT"],
  ["notice_patent_text", "TEXT"],
  ["notice_multi_flag", "INTEGER DEFAULT 0"],
  ["patent_confirmed", "INTEGER DEFAULT 0"],
  ["scopes", "TEXT"],
  ["quality", "TEXT"],
  ["is_rebid", "INTEGER DEFAULT 0"],
  ["rebid_round", "INTEGER"],
  ["rebid_reason", "TEXT"],
  ["previous_fail_date", "TEXT"],
  ["original_project_id", "TEXT"],
  ["previous_project_id", "TEXT"],
  ["result_entered_at", "TEXT"],
  ["updated_at", "TEXT"],
  ["patents_migrated", "INTEGER DEFAULT 0"],
  ["record_year", "TEXT"],
  ["category_items", "TEXT"],
  ["record_source", "TEXT"],
  ["source_ref", "TEXT"],
  ["duplicate_of", "TEXT"]
];

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
}

const dbName = arg("db");
const table = arg("table", "projects");
const remote = process.argv.includes("--remote");
if (!dbName) {
  console.error("사용법: node scripts/pour-migrate.mjs --db <D1 이름> [--remote]");
  process.exit(1);
}

function d1(sql) {
  const args = ["wrangler", "d1", "execute", dbName, remote ? "--remote" : "--local",
                "--json", "--command", sql];
  const out = execFileSync("npx", args, { encoding: "utf8" });
  return JSON.parse(out);
}

console.log(`대상: ${dbName} / ${table} (${remote ? "운영" : "로컬"})`);

const before = d1(`SELECT COUNT(*) AS n FROM ${table}`);
const beforeCount = before?.[0]?.results?.[0]?.n;
console.log(`적용 전 ${table} 행 수: ${beforeCount}`);

const info = d1(`PRAGMA table_info(${table})`);
const existing = new Set((info?.[0]?.results || []).map((c) => c.name));

const added = [];
const skipped = [];
for (const [column, type] of NEW_COLUMNS) {
  if (existing.has(column)) { skipped.push(column); continue; }
  d1(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  added.push(column);
}

const after = d1(`SELECT COUNT(*) AS n FROM ${table}`);
const afterCount = after?.[0]?.results?.[0]?.n;

console.log(`추가한 열 ${added.length}개: ${added.join(", ") || "(없음)"}`);
console.log(`건너뛴 열 ${skipped.length}개 (이미 있음)`);
console.log(`적용 후 ${table} 행 수: ${afterCount}`);

if (beforeCount !== afterCount) {
  console.error("행 수가 달라졌습니다. 즉시 확인이 필요합니다.");
  process.exit(1);
}
console.log("기존 자료는 그대로입니다.");
