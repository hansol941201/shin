#!/bin/sh
# 전체 검증. 저장소 루트에서 실행하세요.
#   sh pour-integration/test/run-all.sh
set -e
node pour-integration/test/logic.test.js
node pour-integration/test/edit.test.js
node pour-integration/test/multipatent.test.js
node pour-integration/test/categories.test.js
node pour-integration/test/real-excel.test.js
node pour-integration/test/migration.test.mjs
node pour-integration/test/import-records.test.mjs
node pour-integration/scripts/check-no-destructive.mjs
node pour-integration/scripts/check-nextjs-css.mjs
node pour-integration/scripts/sync-core.mjs --check
node pour-integration/test/browser.test.js
node pour-integration/test/app.test.js
node pour-integration/test/api-store.test.js

# Next.js 이식물 검증 (타입 검사 + D1 저장 로직)
npx tsc -p pour-integration/nextjs/tsconfig.json --noEmit
npx tsc -p pour-integration/nextjs/tsconfig.build.json
mkdir -p pour-integration/nextjs/.tmp-build/lib/pour/core
cp pour-integration/nextjs/lib/pour/core/*.js pour-integration/nextjs/.tmp-build/lib/pour/core/
node pour-integration/nextjs/test-d1.mjs
node pour-integration/nextjs/test-seed.mjs
rm -rf pour-integration/nextjs/.tmp-build
