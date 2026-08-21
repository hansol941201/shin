/**
 * 자료를 지우거나 표를 통째로 바꾸는 문장이 없는지 확인한다.
 *   node pour-integration/scripts/check-no-destructive.mjs
 *
 * 검사 대상
 *   · 마이그레이션·옮겨 심기 SQL 전부
 *   · 마이그레이션·옮겨 심기 코드 (lib/pour/migrate.ts, lib/pour/seed-records.ts)
 *
 * 검사하지 않는 것
 *   · lib/pour/store.ts — 화면에서 특허를 모두 지웠을 때 그 현장의 특허 행만 지우는
 *     DELETE 가 하나 있다. 이것은 요청받은 동작이므로 예외로 둔다.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = join(HERE, "..");

const BANNED = [
  [/\bDELETE\s+FROM\b/i, "DELETE"],
  [/\bDROP\s+(TABLE|INDEX|COLUMN|VIEW)\b/i, "DROP"],
  [/\bTRUNCATE\b/i, "TRUNCATE"],
  [/\bREPLACE\s+INTO\b/i, "REPLACE INTO (행을 지우고 다시 넣는다)"],
  [/\bINSERT\s+OR\s+REPLACE\b/i, "INSERT OR REPLACE (행을 지우고 다시 넣는다)"],
  [/\bALTER\s+TABLE\s+\S+\s+RENAME\b/i, "ALTER TABLE … RENAME (표 교체)"],
  [/\bCREATE\s+TABLE\s+\S+\s+AS\s+SELECT\b/i, "CREATE TABLE … AS SELECT (표 교체)"]
];

const targets = [];
const drizzle = join(BASE, "nextjs", "drizzle");
if (existsSync(drizzle)) {
  readdirSync(drizzle).filter((f) => f.endsWith(".sql"))
    .forEach((f) => targets.push(join(drizzle, f)));
}
[join(BASE, "nextjs", "lib", "pour", "migrate.ts"),
 join(BASE, "nextjs", "lib", "pour", "seed-records.ts"),
 join(BASE, "nextjs", "scripts", "pour-migrate.mjs")]
  .filter(existsSync).forEach((f) => targets.push(f));

/** 설명 줄은 빼고 본다 (원칙을 적어 둔 주석에 낱말이 들어 있다) */
function statementsOnly(text, file) {
  if (file.endsWith(".sql")) return text.replace(/^\s*--.*$/gm, "");
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")   // 블록 주석
    .replace(/^\s*\/\/.*$/gm, "")       // 줄 주석
    .replace(/^\s*\*.*$/gm, "");        // JSDoc 본문
}

let bad = 0;
console.log("지우는 문장 검사\n");
for (const file of targets) {
  const name = file.slice(BASE.length + 1);
  const body = statementsOnly(readFileSync(file, "utf8"), file);
  const hits = BANNED.filter(([re]) => re.test(body)).map(([, label]) => label);
  if (hits.length) {
    console.log(`  ✗ ${name} — ${hits.join(", ")}`);
    bad++;
  } else {
    console.log(`  ✓ ${name}`);
  }
}

// 옮겨 심기 SQL 은 반드시 id 기준 UPSERT 여야 한다
const seed = join(drizzle, "seed-records.sql");
if (existsSync(seed)) {
  const text = readFileSync(seed, "utf8");
  const inserts = (text.match(/INSERT INTO projects/g) || []).length;
  const upserts = (text.match(/ON CONFLICT\(id\) DO UPDATE/g) || []).length;
  const ok = inserts > 0 && inserts === upserts;
  console.log(`\n  ${ok ? "✓" : "✗"} seed-records.sql — INSERT ${inserts}건 모두 ON CONFLICT(id) DO UPDATE (${upserts}건)`);
  if (!ok) bad++;
} else {
  console.log("\n  · seed-records.sql 이 없어 건너뜁니다 (import-records.py 로 만듭니다)");
}

console.log(bad ? `\n실패 ${bad}건` : "\n모두 통과");
process.exit(bad ? 1 : 0);
