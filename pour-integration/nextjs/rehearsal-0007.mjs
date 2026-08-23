/**
 * 0007 적용 예행연습 — 운영과 같은 조건(2,029건)에서 실제 SQLite 로 확인한다.
 *   node pour-integration/nextjs/rehearsal-0007.mjs
 *
 * 하는 일
 *   1. 0007 적용 전 스키마(운영 현재 모습)에 2,029건을 넣는다
 *   2. 0007 을 포함한 순방향 마이그레이션을 돌린다
 *   3. 건수·열·값이 하나도 변하지 않았는지 지문(체크섬)으로 확인한다
 *   4. 공고 등록 → 동기화 → 새로고침 → 낙찰 변경 → 동기화 → 다른 환경에서 재조회
 *
 * 운영 데이터베이스는 건드리지 않는다 (메모리에서만 돈다).
 */
import assert from "node:assert";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const { listRecords, upsertRecords } = require("./.tmp-build/lib/pour/store.js");
const { migratePourSchema, PROJECT_COLUMNS } = require("./.tmp-build/lib/pour/migrate.js");
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

// 실제 실적 자료(seed-records.sql)는 저장소에 올리지 않으므로, 없으면 건너뛴다.
const SEED = "./drizzle/seed-records.sql";
if (!existsSync(SEED)) {
  console.log("\nseed-records.sql 이 없어 예행연습을 건너뜁니다.");
  console.log("  python3 pour-integration/scripts/import-records.py <연도별 실적List.xlsx>");
  process.exit(0);
}

const db = new Database(":memory:");
const DB = d1(db);
const cols = () => db.prepare("PRAGMA table_info(projects)").all().map((c) => c.name);
const rowCount = () => db.prepare("SELECT COUNT(*) c FROM projects").get().c;

/**
 * 기존 자료의 지문. 값이 한 칸이라도 바뀌면 달라진다.
 * 검증 중에 새로 넣는 행은 빼고, 처음부터 있던 행만 본다.
 */
let baselineIds = null;
function fingerprint(columns) {
  const list = columns.join(",");
  let rows = db.prepare(`SELECT ${list} FROM projects ORDER BY id`).all();
  if (baselineIds) rows = rows.filter((r) => baselineIds.has(r.id));
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

/* ── 1. 0007 적용 전 상태 만들기 ───────────────────────────────── */
section("1. 0007 적용 전 (운영 현재 모습 재현)");

// 0002~0006 까지 적용된 상태 = 0007 의 두 열만 없는 상태
const BEFORE_COLUMNS = PROJECT_COLUMNS
  .filter(([name]) => name !== "notice_no" && name !== "is_partner");
// 특허 마스터도 0008 적용 전 모습으로 만든다 (열 넷이 없는 상태)
db.exec(`
  CREATE TABLE projects (
    id TEXT PRIMARY KEY, client TEXT, region TEXT, city TEXT,
    project_name TEXT, category TEXT, phone TEXT, households INTEGER,
    status TEXT, notice_date TEXT, bid_date TEXT, award_date TEXT,
    award_amount INTEGER, expected_amount INTEGER, contractor TEXT,
    patent_numbers TEXT, agreement_no TEXT, address TEXT, remark TEXT, created_at TEXT
  );
`);
BEFORE_COLUMNS.forEach(([name, type]) => {
  db.exec(`ALTER TABLE projects ADD COLUMN ${name} ${type}`);
});
// 0002 가 만들어 둔 특허·이력 표를 0008 이전 모습으로 만든다
// (0002 원본에는 새 열이 없다. 운영이 지금 이 모습이다)
db.exec(`
  CREATE TABLE pour_patents (
    number TEXT PRIMARY KEY, display TEXT, name TEXT, categories TEXT,
    company TEXT, prefix TEXT, remark TEXT, active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT, updated_at TEXT);
  CREATE TABLE pour_project_patents (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, number TEXT NOT NULL,
    display TEXT, name TEXT, method TEXT, company TEXT, category TEXT, remark TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT);
  CREATE UNIQUE INDEX uq_ppp_project_kind_number
    ON pour_project_patents (project_id, kind, number);
  CREATE TABLE pour_project_history (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, changed_at TEXT NOT NULL,
    action TEXT, status_before TEXT, status_after TEXT, changes_json TEXT, created_at TEXT);
`);
// 운영에 이미 있던 자료 두 건 (엑셀 이전분보다 먼저 있던 행)
db.exec(`
  INSERT INTO projects (id, client, region, city, project_name, phone, households,
                        status, notice_date, award_date, award_amount, contractor,
                        agreement_no, remark, created_at) VALUES
    ('p-1','기존 운영 아파트 1','경기','하남','외벽 재도장공사','031-000-1111',500,
     '낙찰','2026-01-05','2026-02-05',1250000000,'코지건설','HS-2026-001','기존 자료','2026-01-01'),
    ('p-2','기존 운영 아파트 2','충남','금산','외벽 도장공사','041-222-3333',430,
     '공고','2026-02-01',NULL,NULL,NULL,NULL,'','2026-02-01');
`);
// 엑셀에서 옮겨 온 2,029건
db.exec(readFileSync(SEED, "utf8"));

const beforeColumns = cols();
const beforeRows = rowCount();
const beforePrint = fingerprint(beforeColumns);
// 이 뒤로 더해지는 행은 지문에서 뺀다 (기존 자료가 그대로인지만 본다)
baselineIds = new Set(db.prepare("SELECT id FROM projects").all().map((r) => r.id));

await test(`적용 전 행 수 = ${beforeRows}건 (엑셀 2,029 + 기존 운영 2)`, () => {
  assert.strictEqual(beforeRows, 2031);
  assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM projects WHERE record_source='import'").get().c, 2029);
});
await test("적용 전에는 notice_no · is_partner 열이 없다", () => {
  assert.ok(!beforeColumns.includes("notice_no"));
  assert.ok(!beforeColumns.includes("is_partner"));
});

/* ── 2. 0007 적용 ──────────────────────────────────────────────── */
section("2. 0007 마이그레이션 적용");

const result = await migratePourSchema(DB);
await test("더해진 열이 0007·0008·0009 가 말하는 것과 정확히 같다", () => {
  assert.deepStrictEqual(result.addedColumns, [
    // 0007 — 공고번호 · 협약사 여부
    "notice_no", "is_partner",
    // 0008 — 특허 마스터의 공법 · 공법명 · 확인일
    "patent_type", "method_name", "first_seen_at", "last_seen_at",
    // 0009 — 소속 (자사계열 / 타사 / 미분류)
    "affiliation_type"
  ], JSON.stringify(result));
});
await test("특허 마스터에도 열 다섯이 더해졌다", () => {
  const cols = db.prepare("PRAGMA table_info(pour_patents)").all().map((c) => c.name);
  ["patent_type", "method_name", "first_seen_at", "last_seen_at",
   "affiliation_type"].forEach((c) => {
    assert.ok(cols.includes(c), `${c} 열이 없다`);
  });
});

await test("기존 열이 하나도 사라지지 않았다", () => {
  const after = cols();
  beforeColumns.forEach((c) => assert.ok(after.includes(c), `${c} 열이 사라졌다`));
  assert.strictEqual(after.length, beforeColumns.length + 2);
});

/* ── 3. 자료 보존 확인 ─────────────────────────────────────────── */
section("3. 기존 자료 보존 (건수 · 값)");

await test(`행 수가 그대로 ${beforeRows}건`, () => {
  assert.strictEqual(rowCount(), beforeRows);
});
await test("모든 행의 모든 값이 한 칸도 바뀌지 않았다 (지문 일치)", () => {
  assert.strictEqual(fingerprint(beforeColumns), beforePrint);
});
await test("새 두 열은 전부 비어 있다 (값을 지어내지 않았다)", () => {
  const filled = db.prepare(
    "SELECT COUNT(*) c FROM projects WHERE notice_no IS NOT NULL OR is_partner IS NOT NULL").get().c;
  assert.strictEqual(filled, 0);
});
await test("엑셀 이전분 2,029건이 그대로", () => {
  assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM projects WHERE record_source='import'").get().c, 2029);
});
await test("전화번호 앞자리 0 이 문자열로 남아 있다", () => {
  const row = db.prepare("SELECT phone FROM projects WHERE id='p-1'").get();
  assert.strictEqual(row.phone, "031-000-1111");
});
await test("두 번 실행해도 더할 것이 없다", async () => {
  const again = await migratePourSchema(DB);
  assert.deepStrictEqual(again.addedColumns, []);
  assert.strictEqual(rowCount(), beforeRows);
  assert.strictEqual(fingerprint(beforeColumns), beforePrint);
});

/* ── 4. 저장 → 새로고침 → 재조회 ──────────────────────────────── */
section("4. 공고 등록 → 동기화 → 새로고침 → 낙찰 변경 → 재조회");

// 화면(localStorage) 흉내
function browserStorage(seed) {
  const map = seed ? { "pour.records.v1": JSON.stringify(seed) } : {};
  return { getItem: (k) => (k in map ? map[k] : null), setItem: (k, v) => { map[k] = String(v); } };
}

// ① 새 공고 등록 (화면에서)
const s1 = browserStorage();
const notice = PourRecords.save({
  client: "검증용 신규아파트", city: "하남", status: "공고",
  noticeDate: "2026-05-04", bidDate: "2026-05-20",
  noticeNo: "K-APT-2026-9999",
  categoryItems: [{ group: "옥상방수", name: "옥상방수" }],
  patentNumbers: ["10-1935719"]
}, s1);

await test("새 공고는 상태가 '공고' 로 저장되고 낙찰 정보는 비어 있다", () => {
  assert.strictEqual(notice.status, "공고");
  assert.strictEqual(notice.noticeNo, "K-APT-2026-9999");
  assert.strictEqual(notice.contractor, "");
  assert.strictEqual(notice.agreementNo, "");
  assert.strictEqual(notice.awardAmount, "");
});

// ② 동기화 (D1 로 올림)
const sync1 = await upsertRecords(DB, [notice]);
await test("동기화 한 번에 1건만 새로 들어간다", () => {
  assert.strictEqual(sync1.inserted, 1);
  assert.strictEqual(sync1.updated, 0);
  assert.strictEqual(rowCount(), beforeRows + 1);
});

// ③ 새로고침 = D1 에서 다시 읽어 화면을 새로 만든다
const afterReload = await listRecords(DB);
const reloaded = afterReload.filter((r) => r.id === notice.id)[0];
await test("새로고침 뒤에도 공고번호가 그대로 돌아온다", () => {
  assert.ok(reloaded, "새로고침 뒤 자료를 찾지 못했다");
  assert.strictEqual(reloaded.status, "공고");
  assert.strictEqual(reloaded.noticeNo, "K-APT-2026-9999");
  assert.strictEqual(reloaded.client, "검증용 신규아파트");
  assert.strictEqual(reloaded.noticeDate, "2026-05-04");
});
await test(`새로고침 뒤 전체 건수 ${beforeRows + 1}건 (기존 ${beforeRows}건 그대로)`, () => {
  assert.strictEqual(afterReload.length, beforeRows + 1);
  assert.strictEqual(fingerprint(beforeColumns), beforePrint);
});

// ④ 다른 환경에서 불러온 상태로 낙찰 변경
const s2 = browserStorage(afterReload);
const awarded = PourRecords.award(notice.id, {
  contractor: "검증건설", contractorPhone: "031-777-8888",
  awardDate: "2026-06-10", awardAmount: "820000000",
  address: "하남시 미사강변대로 99, 관리사무소",
  isPartner: "예", agreementNo: "HS-2026-9999",
  patentNumbers: ["10-1935719", "10-2425081"]
}, s2);
await test("낙찰 변경이 기존 행을 그대로 쓴다 (같은 id · 새 행 없음)", () => {
  assert.ok(awarded.ok, awarded.message);
  assert.strictEqual(awarded.record.id, notice.id);
  assert.strictEqual(PourRecords.list(s2).length, afterReload.length);
});

// ⑤ 동기화
const sync2 = await upsertRecords(DB, [awarded.record]);
await test("낙찰 동기화는 새로 넣지 않고 같은 행을 고친다", () => {
  assert.strictEqual(sync2.inserted, 0);
  assert.strictEqual(sync2.updated, 1);
  assert.strictEqual(rowCount(), beforeRows + 1);
});

// ⑥ 또 다른 환경에서 재조회
const finalList = await listRecords(DB);
const final = finalList.filter((r) => r.id === notice.id)[0];
await test("재조회 시 공고 때 값과 낙찰 뒤 값이 한 행에 함께 있다", () => {
  assert.strictEqual(final.status, "낙찰");
  assert.strictEqual(final.noticeNo, "K-APT-2026-9999");   // 공고 단계 값 유지
  assert.strictEqual(final.noticeDate, "2026-05-04");
  assert.strictEqual(final.contractor, "검증건설");
  assert.strictEqual(final.contractorPhone, "031-777-8888");
  assert.strictEqual(final.awardDate, "2026-06-10");
  assert.strictEqual(String(final.awardAmount), "820000000");
  assert.strictEqual(final.address, "하남시 미사강변대로 99, 관리사무소");
  assert.strictEqual(final.isPartner, "예");
  assert.strictEqual(final.agreementNo, "HS-2026-9999");
  assert.strictEqual(final.patentNumbers.length, 2);
  assert.strictEqual(PourRecords.agreementStage(final), "정리 완료");
});
await test(`재조회 뒤에도 전체 ${beforeRows + 1}건 (같은 현장이 두 건으로 늘지 않았다)`, () => {
  assert.strictEqual(finalList.length, beforeRows + 1);
  assert.strictEqual(finalList.filter((r) => r.client === "검증용 신규아파트").length, 1);
});
await test(`기존 ${beforeRows}건의 값은 이 모든 과정 뒤에도 그대로`, () => {
  assert.strictEqual(fingerprint(beforeColumns), beforePrint);
  assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM projects WHERE record_source='import'").get().c, 2029);
});

// ⑦ 상세 수정 뒤 동기화도 같은 행에 남는지
const s3 = browserStorage(finalList);
PourRecords.update(notice.id, { remark: "준공 예정 2026-12", quality: "상" }, s3);
const edited = PourRecords.list(s3).filter((r) => r.id === notice.id)[0];
await upsertRecords(DB, [edited]);
const afterEdit = await listRecords(DB);
await test("상세 수정 → 동기화 → 재조회에도 낙찰 정보가 남는다", () => {
  const r = afterEdit.filter((x) => x.id === notice.id)[0];
  assert.strictEqual(r.remark, "준공 예정 2026-12");
  assert.strictEqual(r.quality, "상");
  assert.strictEqual(r.agreementNo, "HS-2026-9999");
  assert.strictEqual(r.isPartner, "예");
  assert.strictEqual(r.noticeNo, "K-APT-2026-9999");
  assert.strictEqual(afterEdit.length, beforeRows + 1);
});

console.log(`\n합계 ${passed + failed}건 · 통과 ${passed} · 실패 ${failed}`);
process.exit(failed ? 1 : 0);
