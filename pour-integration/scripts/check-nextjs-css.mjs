/**
 * nextjs/app/pour/pour.css 가 원본과 어긋나지 않았는지 확인한다.
 *   node pour-integration/scripts/check-nextjs-css.mjs
 *
 * 화면 스타일은 pour-integration.css 와 app.css 한 곳에서만 고치고,
 * 이식물 쪽은 build-nextjs-css.py 로 다시 만들어야 한다.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "nextjs", "app", "pour", "pour.css");

const before = readFileSync(OUT, "utf8");
execFileSync("python3", [join(HERE, "build-nextjs-css.py")], { stdio: "pipe" });
const after = readFileSync(OUT, "utf8");

if (before === after) {
  console.log("pour.css — 원본과 일치");
  process.exit(0);
}
console.log("✗ pour.css 가 원본과 다릅니다. 아래를 실행해 다시 만드세요.");
console.log("    python3 pour-integration/scripts/build-nextjs-css.py");
process.exit(1);
