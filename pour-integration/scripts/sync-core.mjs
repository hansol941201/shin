/**
 * 검증된 공용 로직을 Next.js 이식물로 그대로 옮긴다.
 *   node pour-integration/scripts/sync-core.mjs          (옮기기)
 *   node pour-integration/scripts/sync-core.mjs --check  (어긋났는지 확인만)
 *
 * 두 벌을 손으로 관리하다 서로 달라지는 것을 막기 위한 스크립트다.
 */
import { copyFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = join(HERE, "..");
const CORE = join(BASE, "nextjs", "lib", "pour", "core");

// 브라우저 DOM 을 쓰지 않는 로직만 옮긴다 (화면은 이식물의 React 컴포넌트가 맡는다)
const FILES = [
  "regions.data.js", "pour-region.js", "pour-patents.js",
  "pour-categories.js", "pour-records.js", "pour-export.js"
];

const check = process.argv.includes("--check");
let differ = 0;

for (const name of FILES) {
  const from = join(BASE, name);
  const to = join(CORE, name);
  const same = readFileSync(from, "utf8") === readFileSync(to, "utf8");
  if (same) { console.log("  = " + name); continue; }
  differ++;
  if (check) console.log("  ✗ " + name + " — 이식물 쪽이 원본과 다릅니다");
  else { copyFileSync(from, to); console.log("  → " + name + " 옮김"); }
}

if (check && differ) {
  console.log("\n아래를 실행해 맞추세요.");
  console.log("    node pour-integration/scripts/sync-core.mjs");
  process.exit(1);
}
console.log(differ ? "\n" + differ + "개 옮김" : "\n모두 같음");
