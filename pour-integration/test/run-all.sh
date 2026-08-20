#!/bin/sh
# 전체 검증. 저장소 루트에서 실행하세요.
#   sh pour-integration/test/run-all.sh
set -e
node pour-integration/test/logic.test.js
node pour-integration/test/edit.test.js
node pour-integration/test/multipatent.test.js
node pour-integration/test/real-excel.test.js
node pour-integration/test/browser.test.js
