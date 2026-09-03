#!/usr/bin/env node
/**
 * partner-dashboard 원본 index.html → customer-card-migration/companies-integrated.json
 *
 * 통합 로직 자체는 tools/integration-core.js 에 있습니다.
 * 목록 HTML 의 [원본과 동기화] 버튼도 같은 모듈을 브라우저에서 실행하므로,
 * 빌드 결과와 동기화 결과가 항상 같은 규칙으로 만들어집니다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Core = require('./integration-core.js');

const SRC = process.argv[2] || '/home/user/pourservice/partner-dashboard/index.html';
const OUTDIR = process.argv[3] || path.join(__dirname, '..', 'customer-card-migration');

const GENERATED_AT = '2026-09-02';        // 조사·생성 시각
const SOURCE_PUBLISHED_AT = '2026-07-23'; // 원본 저장소 최신 배포(커밋)일
const SOURCE_URL = 'https://pourservice.github.io/partner-dashboard/';

// 레거시 관리 엑셀 근거 (있으면 반영)
const EVIDENCE_PATH = path.join(OUTDIR, 'legacy-excel-evidence.json');
const legacyEvidence = fs.existsSync(EVIDENCE_PATH)
  ? JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8'))
  : null;

const html = fs.readFileSync(SRC, 'utf8');
const parsed = Core.parseSourceHtml(html);

const payload = Core.build({
  DATA: parsed.DATA,
  changelog: parsed.changelog,
  checklist: parsed.checklist,
  generatedAt: GENERATED_AT,
  sourceUpdatedAt: SOURCE_PUBLISHED_AT,
  sourceUrl: SOURCE_URL,
  legacyEvidence,
});

fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'companies-integrated.json'), JSON.stringify(payload, null, 2) + '\n');

const S = payload.summary;
console.log(JSON.stringify({ summary: Object.assign({}, S, { menuCounts: undefined }), menuCounts: S.menuCounts }, null, 1));
const msgs = (c, t) => c.validation.messages.filter(m => m.type === t).map(m => m.message);
console.log('\n--- statusConflict rows ---');
payload.companies.filter(x => x.validation.statusConflict).forEach(x => console.log(' ', x.companyName, '::', x.mou.status, '::', msgs(x, 'statusConflict').join(' ; ')));
console.log('\n--- dateError rows ---');
payload.companies.filter(x => x.validation.dateError).forEach(x => console.log(' ', x.companyName, '::', msgs(x, 'dateError').join(' ; ')));
console.log('\n--- duplicate suspects:', payload.companies.filter(x => x.validation.possibleDuplicate).length, '---');
