/**
 * D1 연동 검증 — 실제 SQLite 로 API 저장 로직을 확인한다.
 *   npx tsc -p tsconfig.build.json && node test-d1.mjs
 *
 * 확인하는 것
 *   · 기존 projects 행과 열을 지우지 않는다
 *   · id 기준 upsert (전체 교체 아님)
 *   · patentItems 가 빈 배열이면 이전 특허를 되살리지 않는다
 *   · 발주처 전화번호와 시공사 전화번호가 섞이지 않는다
 */
import assert from "node:assert";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const { listRecords, upsertRecords, listPatents, upsertPatents } =
  require("./.tmp-build/lib/pour/store.js");
const { migratePourSchema } = require("./.tmp-build/lib/pour/migrate.js");
const PourRecords = require("./lib/pour/core/pour-records.js");

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log("  ✓ " + name); passed++; }
  catch (e) { console.log("  ✗ " + name + "\n      " + e.message); failed++; }
}
function section(t) { console.log("\n" + t); }

/** D1 바인딩 흉내 */
function d1(db) {
  return {
    prepare(sql) {
      let params = [];
      const api = {
        bind(...args) { params = args; return api; },
        async first() { return db.prepare(sql).get(...params) ?? null; },
        async all() { return { results: db.prepare(sql).all(...params) }; },
        async run() { return db.prepare(sql).run(...params); }
      };
      return api;
    }
  };
}

/* 운영 D1 을 흉내 낸 기존 자료 (마이그레이션이 끝난 상태) */
const db = new Database(":memory:");
db.exec(`
  CREATE TABLE projects (
    id TEXT PRIMARY KEY, client TEXT, region TEXT, city TEXT, project_name TEXT,
    category TEXT, phone TEXT, households INTEGER, status TEXT,
    notice_date TEXT, bid_date TEXT, award_date TEXT, award_amount INTEGER,
    expected_amount INTEGER, contractor TEXT, patent_numbers TEXT, remark TEXT,
    created_at TEXT, legacy_memo TEXT,
    document_due_date TEXT, bid_type TEXT, bid_type_raw TEXT,
    contractor_phone TEXT, contractor_contact_name TEXT, contractor_mobile TEXT,
    contractor_address TEXT, contractor_business_no TEXT, contractor_note TEXT,
    notice_patent_text TEXT, notice_multi_flag INTEGER DEFAULT 0,
    patent_confirmed INTEGER DEFAULT 0, scopes TEXT, quality TEXT, address TEXT,
    agreement_no TEXT, is_rebid INTEGER DEFAULT 0, rebid_round INTEGER,
    rebid_reason TEXT, previous_fail_date TEXT, original_project_id TEXT,
    previous_project_id TEXT, result_entered_at TEXT, updated_at TEXT,
    patents_migrated INTEGER DEFAULT 0
  );
  CREATE TABLE pour_patents (
    number TEXT PRIMARY KEY, display TEXT, name TEXT, categories TEXT,
    company TEXT, prefix TEXT, remark TEXT, active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT, updated_at TEXT);
  CREATE TABLE pour_project_patents (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, number TEXT NOT NULL,
    display TEXT, name TEXT, method TEXT, company TEXT, category TEXT, remark TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT);
  CREATE UNIQUE INDEX uq_ppp ON pour_project_patents (project_id, kind, number);
  CREATE TABLE pour_project_history (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, changed_at TEXT NOT NULL,
    action TEXT, status_before TEXT, status_after TEXT, changes_json TEXT, created_at TEXT);

  INSERT INTO projects (id, client, region, city, project_name, category, phone, households,
                        status, notice_date, expected_amount, patent_numbers, created_at, legacy_memo)
  VALUES
    ('p-1','가나아파트','경기','하남','외벽 도장공사','재도장','031-000-1111',500,'공고',
     '2026-01-05', 900000000, '1935719', '2026-01-01', '옛 메모 1'),
    ('p-2','나다아파트','충남','금산','옥상 방수공사','방수','041-222-3333',430,'공고',
     '2026-02-01', 500000000, NULL, '2026-02-01', '옛 메모 2');
`);

const DB = d1(db);
// 옛 스키마로 만든 표에 순방향 마이그레이션을 돌린다 (운영이 거치는 길과 같다)
await migratePourSchema(DB);
const beforeCount = db.prepare("SELECT COUNT(*) AS n FROM projects").get().n;

section("1. 기존 자료 읽기");

let records;
await test("projects 행을 record 형식으로 읽어온다", async () => {
  records = await listRecords(DB);
  assert.strictEqual(records.length, 2);
  const one = records.find((r) => r.id === "p-1");
  assert.strictEqual(one.client, "가나아파트");
  assert.strictEqual(one.region, "경기");
  assert.strictEqual(one.city, "하남");
  assert.deepStrictEqual(one.projectNames, ["외벽 도장공사"]);
  assert.strictEqual(one.phone, "031-000-1111");
  assert.strictEqual(one.households, 500);
});

await test("옛 patent_numbers 열의 번호가 POUR 특허로 옮겨진다", async () => {
  const one = records.find((r) => r.id === "p-1");
  assert.deepStrictEqual(one.patentNumbers, ["1935719"]);
  assert.strictEqual(one.patentItems.length, 1);
  assert.strictEqual(one.patentItems[0].kind, "POUR");
});

await test("변환에서 다루지 않는 열도 잃지 않는다", async () => {
  const one = records.find((r) => r.id === "p-1");
  assert.strictEqual(one.__extra.legacy_memo, "옛 메모 1");
});

section("2. 저장 (id 기준 upsert)");

await test("한 건만 보내도 나머지 행은 그대로 남는다", async () => {
  const target = records.find((r) => r.id === "p-1");
  target.remark = "수정함";
  const result = await upsertRecords(DB, [target]);
  assert.strictEqual(result.updated, 1);
  assert.strictEqual(result.inserted, 0);
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM projects").get().n, beforeCount);
  assert.strictEqual(db.prepare("SELECT client FROM projects WHERE id='p-2'").get().client, "나다아파트");
});

await test("변환에서 다루지 않는 열이 저장 후에도 남아 있다", () => {
  const row = db.prepare("SELECT legacy_memo, expected_amount FROM projects WHERE id='p-1'").get();
  assert.strictEqual(row.legacy_memo, "옛 메모 1");
  assert.strictEqual(row.expected_amount, 900000000, "예상금액이 지워짐");
});

await test("새 행은 INSERT 된다", async () => {
  const fresh = PourRecords.normalize({
    client: "새 현장", region: "경기", city: "평택", status: "공고",
    noticeDate: "2026-03-02", phone: "031-647-3158",
    patentItems: [{ kind: "POUR", number: "1935719" },
                  { kind: "THIRD_PARTY", number: "2091977", company: "타사명" }]
  });
  const result = await upsertRecords(DB, [fresh]);
  assert.strictEqual(result.inserted, 1);
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM projects").get().n, beforeCount + 1);
});

await test("POUR 특허와 타사 특허가 구분되어 저장된다", () => {
  const rows = db.prepare(
    "SELECT kind, number, company FROM pour_project_patents ORDER BY kind").all();
  const pour = rows.filter((r) => r.kind === "POUR");
  const third = rows.filter((r) => r.kind === "THIRD_PARTY");
  assert.ok(pour.length >= 1);
  assert.strictEqual(third.length, 1);
  assert.strictEqual(third[0].number, "2091977");
  assert.strictEqual(third[0].company, "타사명");
});

section("3. 특허를 지운 경우");

await test("patentItems 가 빈 배열이면 이전 특허를 되살리지 않는다", async () => {
  const all = await listRecords(DB);
  const target = all.find((r) => r.id === "p-1");
  assert.deepStrictEqual(target.patentNumbers, ["1935719"], "준비 상태 확인");

  const cleared = PourRecords.update(
    target.id,
    { patentItems: [] },
    { getItem: () => JSON.stringify(all), setItem: () => {} }
  ).record;
  cleared.__extra = target.__extra;

  await upsertRecords(DB, [cleared]);
  const rows = db.prepare("SELECT * FROM pour_project_patents WHERE project_id='p-1'").all();
  assert.strictEqual(rows.length, 0, "특허 행이 남아 있음");

  const again = await listRecords(DB);
  const after = again.find((r) => r.id === "p-1");
  assert.deepStrictEqual(after.patentNumbers, [], "이전 번호가 되살아남");
});

await test("특허가 빈 낙찰은 미기재 알림 대상이 된다", async () => {
  const all = await listRecords(DB);
  const target = all.find((r) => r.id === "p-1");
  const awarded = PourRecords.award(
    target.id,
    { contractor: "코지건설", contractorPhone: "031-647-3158", awardDate: "2026-05-10",
      awardAmount: 1250000000, categories: ["재도장"], patentItems: [],
      confirmedWithoutPatent: true },
    { getItem: () => JSON.stringify(all), setItem: () => {} }
  ).record;
  awarded.__extra = target.__extra;
  await upsertRecords(DB, [awarded]);

  const again = await listRecords(DB);
  const missing = PourRecords.missingPatentRecords(again, null);
  assert.ok(missing.some((r) => r.id === "p-1"), "미기재 알림에서 빠짐");
});

section("4. 전화번호 분리");

await test("발주처 전화번호와 시공사 전화번호가 다른 열에 저장된다", () => {
  const row = db.prepare("SELECT phone, contractor_phone FROM projects WHERE id='p-1'").get();
  assert.strictEqual(row.phone, "031-000-1111", "발주처 전화번호가 덮어써짐");
  assert.strictEqual(row.contractor_phone, "031-647-3158");
});

await test("앞자리 0 이 문자열로 유지된다", () => {
  const rows = db.prepare("SELECT phone, contractor_phone FROM projects").all();
  rows.forEach((r) => {
    if (r.phone) assert.strictEqual(typeof r.phone, "string");
    if (r.contractor_phone) assert.strictEqual(typeof r.contractor_phone, "string");
  });
  assert.ok(rows.some((r) => String(r.phone || "").startsWith("0")));
});

section("5. 특허 자료");

await test("특허번호 기준 upsert (기존 특허를 지우지 않는다)", async () => {
  await upsertPatents(DB, [
    { number: "1935719", name: "POUR공법", categories: ["균열보수", "균열보수 및 재도장"], company: "㈜넷폼알앤디" },
    { number: "2425081", name: "POUR 슬라브공법", categories: ["듀얼", "에폭시"], company: "㈜넷폼알앤디" }
  ]);
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM pour_patents").get().n, 2);

  const again = await upsertPatents(DB, [
    { number: "1935719", name: "POUR공법(개정)", categories: ["균열보수"], company: "㈜넷폼알앤디" }
  ]);
  assert.strictEqual(again.inserted, 0);
  assert.strictEqual(again.updated, 1);
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM pour_patents").get().n, 2, "기존 특허가 사라짐");
  assert.strictEqual(db.prepare("SELECT name FROM pour_patents WHERE number='1935719'").get().name, "POUR공법(개정)");
});

await test("특허를 읽으면 공종이 배열로 돌아온다", async () => {
  const list = await listPatents(DB);
  const one = list.find((p) => p.number === "2425081");
  assert.deepStrictEqual(one.categories, ["듀얼", "에폭시"]);
});

section("6. 마무리 확인");

await test("기존 두 행이 끝까지 남아 있다", () => {
  const ids = db.prepare("SELECT id FROM projects ORDER BY id").all().map((r) => r.id);
  assert.ok(ids.includes("p-1"));
  assert.ok(ids.includes("p-2"));
});

console.log("\n" + "=".repeat(52));
console.log(`  통과 ${passed} · 실패 ${failed}`);
console.log("=".repeat(52));
process.exit(failed ? 1 : 0);
