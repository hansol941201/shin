#!/usr/bin/env node
/**
 * 사용자 제공 레거시 엑셀 → customer-card-migration/legacy-excel-evidence.json
 *
 * 원본 대시보드가 생기기 전에 쓰던 관리 엑셀에서 "MOU 체결 근거"만 뽑아 둡니다.
 * 엑셀 원본(매출 등 재무 정보 포함)은 저장소에 넣지 않고, 판정에 필요한 근거만 남깁니다.
 *
 *   node tools/extract-legacy-excel.js <xlsx 경로>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = process.argv[2];
if (!SRC) { console.error('사용법: node tools/extract-legacy-excel.js <xlsx 경로>'); process.exit(1); }
const OUT = path.join(__dirname, '..', 'customer-card-migration', 'legacy-excel-evidence.json');

const py = `
import openpyxl, json, sys, re
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)

# 1) '보고' 시트 — "전체 협약업체" 총계와 등급 정의
rep = wb['보고']
total_label = rep['B2'].value
total_count = rep['K2'].value
grade_defs = {}
for r in range(4, 11):
    g = rep.cell(r, 2).value
    if g: grade_defs[str(g)] = str(rep.cell(r, 10).value or '').strip()

# 2) 등급 표에 올라 있는 업체 = 협약업체 (보고/25/24/23 시트)
roster = {}
def add(name, grade, sheet, cell):
    n = str(name or '').strip()
    if not n or n in ('총계', '업체명', '고객군 총계', '등급설정X 및 입주자대표'): return
    roster.setdefault(n, {'name': n, 'grades': [], 'sources': []})
    if grade and str(grade).strip():
        g = str(grade).strip()
        if g not in roster[n]['grades']: roster[n]['grades'].append(g)
    src = sheet + '!' + cell
    if src not in roster[n]['sources']: roster[n]['sources'].append(src)

# 보고 시트는 등급별 6개 블록이 가로로 배치되어 있다
for name_col, grade_col in [(2,4),(9,11),(16,18),(23,25),(30,32),(37,39)]:
    for r in range(15, rep.max_row + 1):
        add(rep.cell(r, name_col).value, rep.cell(r, grade_col).value, '보고',
            openpyxl.utils.get_column_letter(name_col) + str(r))

ws25 = wb['25']
for r in range(2, ws25.max_row + 1):
    add(ws25.cell(r, 2).value, ws25.cell(r, 5).value, '25', 'B' + str(r))

# 3) CRM 시트 — MOU 체결일이 실제로 적힌 유일한 곳
def crm(sheet):
    ws = wb[sheet]
    out = []
    for r in range(3, ws.max_row + 1):
        nm = ws.cell(r, 1).value
        if not nm or not str(nm).strip(): continue
        out.append({
            'name': str(nm).strip(),
            'row': r,
            'qSent': str(ws.cell(r,2).value or '').strip() or None,
            'qReply': str(ws.cell(r,3).value or '').strip() or None,
            'm1': str(ws.cell(r,4).value or '').strip() or None,
            'm2': str(ws.cell(r,5).value or '').strip() or None,
            'mou': str(ws.cell(r,6).value or '').strip() or None,
            'site': str(ws.cell(r,7).value or '').strip() or None,
            'note': str(ws.cell(r,8).value or '').strip() or None,
        })
    return out

json.dump({
    'reportTotalLabel': str(total_label or ''),
    'reportTotalCount': total_count,
    'gradeDefinitions': grade_defs,
    'roster': list(roster.values()),
    'crm': crm('신규업체 CRM'),
    'crm26': crm('신규업체 CRM 26년'),
}, sys.stdout, ensure_ascii=False)
`;

const raw = execFileSync('python3', ['-c', py, SRC], { maxBuffer: 64 * 1024 * 1024 }).toString();
const x = JSON.parse(raw);

const dotDate = (s) => {
  const m = String(s || '').trim().match(/^[^\d]*?(\d{2})\.(\d{1,2})\.(\d{1,2})[^\d]*$/);
  if (!m) return null;
  const y = 2000 + +m[1], mo = +m[2], dd = +m[3];
  const d = new Date(Date.UTC(y, mo - 1, dd));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== dd) return null;
  return `${y}-${String(mo).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
};

const mouDates = [];
for (const [sheet, rows] of [['신규업체 CRM', x.crm], ['신규업체 CRM 26년', x.crm26]]) {
  for (const r of rows) {
    const d = dotDate(r.mou);
    if (d) mouDates.push({ name: r.name, date: d, raw: r.mou, sheet, row: r.row });
  }
}

const evidence = {
  sourceFile: path.basename(SRC),
  extractedAt: new Date().toISOString().slice(0, 10),
  description: '원본 대시보드 이전에 사용하던 관리 엑셀. MOU 체결 근거만 추출했습니다(매출 등 재무 정보는 제외).',
  partnerRoster: {
    label: x.reportTotalLabel,          // "전체 협약업체"
    reportedCount: x.reportTotalCount,  // 257
    cell: '보고!B2 / 보고!K2',
    meaning: '이 엑셀은 등급 표에 올라 있는 업체 전체를 "전체 협약업체"로 집계합니다. 즉 등급이 부여된 업체는 협약(MOU)이 체결된 업체입니다.',
    gradeDefinitions: x.gradeDefinitions,
    companies: x.roster,
  },
  mouDates,
  sheetsWithMouDate: ['신규업체 CRM', '신규업체 CRM 26년'],
  note: 'MOU 체결일이 기록된 시트는 위 두 CRM 시트뿐입니다. 등급/매출/가동 시트에는 체결일 컬럼이 없습니다.',
};

fs.writeFileSync(OUT, JSON.stringify(evidence, null, 1) + '\n');
console.log('roster:', evidence.partnerRoster.companies.length, '개사 ·',
            'MOU 체결일:', mouDates.length, '건 · reportedCount:', x.reportTotalCount);
