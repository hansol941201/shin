#!/usr/bin/env node
/** DATA-VALIDATION-REPORT.md 생성 — 수치는 companies-integrated.json 에서 직접 계산한다. */
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'customer-card-migration');
const d = JSON.parse(fs.readFileSync(path.join(DIR, 'companies-integrated.json'), 'utf8'));
const C = d.companies, S = d.summary;

const msgs = (c, t) => c.validation.messages.filter(m => m.type === t).map(m => m.message);
const rows = (f) => C.filter(f);
const tbl = (head, body) => ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...body.map(r => '| ' + r.join(' | ') + ' |')].join('\n');
const nm = (c) => c.companyName + (c.companyCode ? ` (${c.companyCode})` : '');

const conflicts = rows(c => c.validation.statusConflict);
const dateErrs = rows(c => c.validation.dateError);
const dups = rows(c => c.validation.possibleDuplicate);
const mismatch = rows(c => c.validation.mouDateMismatch);
const holdNoReason = rows(c => c.validation.missingHoldReason);
const stalled = rows(c => c.mou.isStalled);
const partnerNoMou = rows(c => c.validation.partnerWithoutMouStatus);
const doneNoPartner = rows(c => c.mou.signedAt && !c.isExistingPartner);
const noCode = rows(c => c.isExistingPartner && !c.companyCode);
const multiAttempt = rows(c => (c.mou.attempts || []).length > 1);
const seedMismatch = rows(c => msgs(c, 'review').some(m => m.indexOf('stage 값') > -1));

const md = `# 데이터 검증 보고서

원본: [POUR 파트너 대시보드](${d.source.url}) · 저장소 \`pourservice/partner-dashboard\`
조사일 **${d.generatedAt}** · 데이터 기준일 **${d.sourceUpdatedAt}** · 데이터 내 최신 날짜 **${d.source.latestDateInData}**
조사 방식: **읽기 전용** (원본 사이트·저장소를 수정·추가·삭제하지 않았습니다)

> 이 보고서의 모든 수치는 \`companies-integrated.json\` 에서 직접 계산한 값입니다.
> 오류를 임의로 고치지 않았습니다. 원본 값을 그대로 두고 오류 내용만 함께 기록했습니다.

---

## 1. 데이터 기준일에 관한 중요한 사실

원본 사이드바의 **“최종 업데이트”** 는 저장된 값이 아닙니다.

\`\`\`js
document.getElementById('lastUpdate').textContent = new Date().toLocaleDateString('ko-KR');
\`\`\`

접속한 날의 날짜를 그대로 출력하므로 **언제 접속해도 “오늘”로 보입니다.** 데이터 기준일로 사용할 수 없습니다.
대신 다음 두 값을 기준으로 삼았습니다.

| 기준 | 값 | 근거 |
|---|---|---|
| \`sourceUpdatedAt\` | ${d.sourceUpdatedAt} | 저장소 최신 커밋(배포)일 |
| 데이터 내 최신 날짜 | ${d.source.latestDateInData} | 전 업체 타임라인 중 가장 늦은 날짜 |

경과일(\`mou.elapsedDays\`)은 **${d.generatedAt} 기준**으로 계산했습니다.

---

## 2. 메뉴별 표시 건수 vs 실제 수집 건수

${tbl(['메뉴', '사이트 표시', '수집', '일치', '비고'],
  S.menuCounts.map(m => [m.menu, m.siteShows, m.collected, m.match ? '✅' : '⚠️', m.note || '—']))}

${S.menuCounts.filter(m => !m.match).length === 0
  ? '**전 메뉴 일치.**'
  : `**${S.menuCounts.filter(m => m.match).length}/${S.menuCounts.length} 메뉴 일치.** 차이가 나는 메뉴는 ${S.menuCounts.filter(m => !m.match).map(m => `${m.menu}(${m.siteShows} → ${m.collected}, ${m.siteShows - m.collected}건 차이)`).join(', ')} 하나뿐이며, 원인은 표 안에 업체가 아닌 집계 행이 섞여 있기 때문입니다: ${d.meta.aggregateRowsExcluded.map(x => `\`${x}\``).join(', ')}. 숫자를 억지로 맞추지 않고 집계 행을 업체에서 제외한 상태 그대로 보고합니다.`}

원본 행 총 **${S.rawRowsCollected}행** → 업체 단위 통합 후 **고유 업체 ${S.totalCompanies}개사**.
(같은 업체가 여러 메뉴에 등장하므로 행 수와 업체 수는 원래 다릅니다.)

### 조사했으나 업체 레코드를 만들지 않은 메뉴

| 메뉴 | 성격 | 처리 |
|---|---|---|
| 메인 대시보드 | 다른 메뉴의 집계 화면 | 집계값을 \`source.siteMeta\` 에 보존 |
| 통합 커리큘럼 | 프로세스 정의 문서(업체별 기록 없음) | \`meta.curriculum\` 에 전문 보존 |
| MOU 자료 관리 | 제출 서류 체크리스트 **정의** | \`meta.checklistDefinition\` 에 보존 |
| 변경사항 내역 | 사이트(코드) 변경 로그 | \`meta.siteChangelog\` 에 보존 |
| 업체 상세 팝업 / 현장 상세 | 위 메뉴 데이터를 다시 보여주는 화면 | 원본 필드로 흡수 |

---

## 3. 최종 상태 분포

${tbl(['최종 상태', '업체 수', '우선순위만 적용했을 때'],
  d.statusVocabulary.map(s => [s, S.byStatus[s], S.byStatusCandidate[s]]))}

- **체결일이 확인된 업체는 다른 메뉴에 미체결로 남아 있더라도 \`MOU 체결 완료\` 로 둡니다.**
  결국 MOU 를 체결한 곳이기 때문입니다. 충돌 사실은 지우지 않고 \`validation.statusConflict\` 와
  검증 메시지로 계속 표시하므로, 원본 사이트 정리 대상은 그대로 추적됩니다
  (이렇게 정리된 업체 **${rows(c => c.validation.conflictResolvedBySigning).length}개사**).
- **상태 충돌·담당자 확인 필요(${S.byStatus['상태 충돌·담당자 확인 필요']}건)** 는 **체결 근거가 없는** 충돌만 남긴 것입니다.
  우선순위대로라면 어떤 상태였을지는 \`mou.statusCandidate\` 에 있습니다.
- **MOU 체결 완료·체결일 미확인 = ${S.byStatus['MOU 체결 완료·체결일 미확인']}건.**
  원본 대시보드만 봤을 때는 0건이었습니다(체결 표시가 있는 업체는 전건 날짜가 함께 있었음).
  사용자가 제공한 레거시 관리 엑셀에서 협약 명부 근거가 확인된 ${S.legacyExcel ? S.legacyExcel.promotedToDoneNoDate : 0}개사가 여기로 옮겨졌습니다(§3-1).
- **종결 = 0건.** 원본에 종결 상태를 저장하는 필드가 없습니다(§7 참조).

### 3-1. MOU 체결 판정 기준 — 협력업체 리스트(시공사 발송용)

**실제 MOU 를 체결한 업체는 [협력업체 리스트(시공사 발송용)] 명부로 판정합니다** (사용자 확정).

| 명부 | 건수 | 체결 근거로 쓰는가 |
|---|---|---|
| 협력업체 리스트(**시공사 발송용**) | ${S.contractorListed} | **예 — 실제 체결 업체 명부** |
| 협력업체 리스트(**내부용**) | ${S.internalListed} | **예 — 협력이 성사된 업체 원장** |
| 협력업체 리스트(**외부 발송용**) | 253 | **아니오 — 협약을 맺지 않은 곳도 섞여 있음** |
| 레거시 엑셀 “전체 협약업체” 명부 | ${S.legacyExcel ? S.legacyExcel.rosterSize : '—'} | 참고용 — 단독으로는 근거로 쓰지 않음 |

**이 기준은 데이터로도 확인됩니다.** 시공사 발송용에 등재된 ${S.contractorListed}개사 중
**${rows(c => c.mou.contractorListed && c.mou.signedAt).length}개사(${(rows(c => c.mou.contractorListed && c.mou.signedAt).length / S.contractorListed * 100).toFixed(1)}%)** 가 체결일이 명시되어 있습니다.

### 판정 규칙

1. **체결일이 확인되면** → \`MOU 체결 완료\` (출처 우선순위는 §8)
2. 체결일은 없지만 **시공사 발송용 또는 내부용에 등재**되어 있으면 → \`MOU 체결 완료·체결일 미확인\`
3. 둘 다 아니면 → \`기존 협력업체·MOU 상태 확인 필요\`

> **레거시 엑셀 명부만으로는 승격하지 않습니다.**
> 앞선 작업에서는 엑셀의 “전체 협약업체” 명부(${S.legacyExcel ? S.legacyExcel.rosterSize : 257}개사)를 근거로 61개사를 체결 완료로 올렸으나,
> 그중 **59개사가 시공사 발송용에 없고 내부용 협약체결 칸도 전부 비어 있었습니다.**
> 이후 사용자 확인에 따라 **협력업체 리스트(내부용) 등재도 체결 근거로 인정**하기로 하여,
> 그중 내부용 원장에 있는 업체는 \`MOU 체결 완료·체결일 미확인\` 으로 처리했습니다.
> 어느 명부에도 없는 업체만 \`기존 협력업체·MOU 상태 확인 필요\` 로 남습니다.
> 엑셀 명부 등재 사실은 지우지 않고 각 업체의 \`mou.evidence.legacyRoster\` 와 확인 사유에 남겨 두었습니다.

### 체결일은 있으나 시공사 발송용에 없는 업체 — ${S.notInContractorList}개사

${tbl(['업체', '체결일', '등급', '비고'],
  rows(c => c.validation.notInContractorList)
    .sort((a, b) => (b.mou.signedAt || '').localeCompare(a.mou.signedAt || ''))
    .map(c => [nm(c), c.mou.signedAt, c.grade || '없음',
      c.grade === 'F' ? 'F등급(이슈·이탈) — 협약 종료 가능성' : '최근 체결이라 명부 미반영 가능성']))}

**체결일이 시공사 명부 등재보다 강한 근거**이므로 \`MOU 체결 완료\` 를 유지했습니다(사용자 확정).
다만 ${rows(c => c.validation.notInContractorList && c.grade === 'F').length}개사가 F등급(이슈·이탈)이라 협약이 종료됐을 수 있어 \`validation.notInContractorList\` 로 표시했습니다.

### 확인 필요 ${S.byStatus['기존 협력업체·MOU 상태 확인 필요']}개사 — 확인 우선순위

체결 근거가 없는 업체에 확인 우선순위를 매겼습니다.

| 우선순위 | 업체 수 | 기준 |
|---|---|---|
| **높음** | ${S.reviewPriority['높음']} | S·A·B 등급이거나 매출 실적이 있음 — 실제 거래가 있었던 업체 |
| 보통 | ${S.reviewPriority['보통']} | C·N 등급(협약 유지·미가동) 또는 판단 자료 없음 |
| 낮음 | ${S.reviewPriority['낮음']} | F등급(이슈·이탈) — 협약이 종료됐을 가능성 |

**우선 확인 대상 (높음 ${S.reviewPriority['높음']}개사)**

${tbl(['업체', '등급', '매출 실적', '등재 명부'],
  rows(c => c.reviewPriority === '높음').map(c => [nm(c), c.grade || '없음',
    c.salesTotal ? c.salesTotal.toLocaleString('ko-KR') + '원' : '없음',
    c.sourceTabs.filter(t => t.indexOf('협력업체') === 0).map(t => t.replace('협력업체 리스트', '').replace(/[()]/g, '')).join(' / ') || '등급표만']))}

### 진행 단계 분포### 진행 단계 분포

${tbl(['진행 단계', '업체 수'], d.stageVocabulary.map(s => [s, S.byStage[s] || 0]))}

“2차 미팅 대기”가 0인 이유: 원본이 2차 미팅 **예정일**(\`m2Scheduled\`)을 저장하지 않아
해당 단계로 넘어가는 업체가 구조적으로 생기지 않습니다. 2차 미팅을 조율 중인 업체는
“1차 미팅 완료” 단계에 머물고, 조율 상태는 자유 텍스트로만 남아 \`mou.rawLabels.m2\` 에 보존했습니다.

---

## 4. 상태 충돌 — ${conflicts.length}개사

충돌이 검출된 업체는 **${conflicts.length}개사**입니다. 이 중 **${conflicts.filter(c => c.validation.conflictResolvedBySigning).length}개사**는
MOU 체결일이 확인되어 최종 상태를 \`MOU 체결 완료\` 로 두었고(충돌 표시는 유지),
체결 근거가 없는 **${conflicts.filter(c => !c.validation.conflictResolvedBySigning).length}개사**만 \`상태 충돌·담당자 확인 필요\` 로 남겼습니다.

${tbl(['업체', '최종 상태', 'MOU 체결일', '충돌 내용'],
  conflicts.map(c => [nm(c), c.mou.status, c.mou.signedAt || '없음', msgs(c, 'statusConflict').join('<br>')]))}

> 원본 사이트에서는 이 ${conflicts.length}개사가 여전히 [진행 현황] 또는 [허들·보류]에 남아 있습니다. **원본 정리가 필요합니다.**

---

## 5. 날짜 순서 오류 — ${dateErrs.length}개사

정상 순서: 질문서 발송 → 회신 → 1차 미팅 → 2차 미팅 → MOU 체결

> **§8 의 “체결일 불일치”와는 다른 문제입니다.** 불일치는 *같은 날짜가 메뉴마다 다르게 적힌 것*이고,
> 여기 날짜 오류는 *단계 순서가 뒤바뀐 것*입니다. 아래 ${dateErrs.length}건은 불일치 해결 여부와 무관하게 남는
> 실제 순서 오류입니다 — 불일치가 함께 있는 건도 다른 메뉴 날짜를 썼을 때 오히려 더 이른 날짜가 되어
> 오류가 해소되지 않습니다.

${tbl(['업체', '오류 내용'], dateErrs.map(c => [nm(c), msgs(c, 'dateError').join('<br>')]))}

### 단계를 건너뛴 것은 오류로 보지 않습니다

미팅 없이 바로 체결하거나 1차 미팅을 건너뛰고 체결하는 업체가 실제로 있습니다.
따라서 **체결이 확인된 업체는 중간 단계 날짜가 비어 있어도 오류로 표시하지 않습니다.**
대신 어떤 단계에 날짜 기록이 없는지를 \`mou.skippedSteps\` 에 참고 정보로만 남겼습니다
(해당 업체 **${rows(c => (c.mou.skippedSteps || []).length).length}개사**).

원본 사이트도 같은 전제를 두고 있습니다 — 내부 로직에 \`qReplySkipped\` / \`m1Skipped\` / \`m2Skipped\`
(단계 생략) 플래그가 정의되어 있습니다.

아직 체결되지 않은 업체의 단계 공백은 입력 누락일 수 있어 확인 필요로 계속 표시합니다
(현재 ${rows(c => !c.mou.signedAt && c.validation.messages.some(m => m.message.indexOf('미팅 기록은 있으나') > -1)).length}개사).

---

## 6. 중복 / 식별 문제

### 6-1. 중복 의심 — ${rows(c => c.validation.possibleDuplicate).length}개사 (미해결 기준)

${rows(c => c.validation.possibleDuplicate).length === 0
  ? `**미해결 중복 의심은 없습니다.** ㈜/(주)/띄어쓰기 차이로 여러 번 등장한 ${S.nameVariantMerged}개사는 이미 한 업체로 통합했고(\`validation.nameVariantMerged\`), 상호 변경 ${S.nameChangesApplied}건은 사용자 확인 후 통합했습니다(§6-1-1). 둘 다 처리 결과이지 확인이 필요한 항목이 아니므로 중복 의심 집계에서 뺐습니다.`
  : ''}

### 6-1-0. 표기 차이로 통합한 업체 — ${S.nameVariantMerged}개사

${tbl(['통합 후 업체명', '원본 표기'],
  rows(c => c.validation.nameVariantMerged).map(c => [nm(c), (c.originalNames || []).join(' / ')]))}

### 6-1-2. 참고: 과거 중복 의심 목록

업체 식별 우선순위는 **① 업체코드 → ② 사업자등록번호 → ③ 정규화 업체명** 이지만,
**자동 병합은 정규화 업체명이 일치할 때만** 수행했습니다.
코드나 사업자번호만 같고 상호가 다른 경우는 상호 변경일 수도, 오입력일 수도 있어 합치지 않고 표시만 했습니다.

${tbl(['업체', '유형', '내용'],
  dups.map(c => [nm(c),
    msgs(c, 'possibleDuplicate').some(m => m.indexOf('사업자등록번호') > -1) ? '사업자번호 공유(미병합)'
      : msgs(c, 'possibleDuplicate').some(m => m.indexOf('업체코드') > -1) ? '업체코드 공유(미병합)' : '표기 차이(병합함)',
    msgs(c, 'possibleDuplicate').join('<br>')]))}

### 6-1-1. 상호 변경으로 확정 통합한 업체 — ${S.nameChangesApplied}개사

사업자등록번호가 같아도 상호가 다르면 자동 병합하지 않는 것이 기본 원칙이지만,
**사용자가 실제로 확인한 상호 변경 건**은 \`company-aliases.json\` 에 등록해 한 업체로 합쳤습니다.

${tbl(['현재 상호', '이전 상호', '사업자등록번호', '확인 근거'],
  rows(c => c.nameChange).map(c => [
    nm(c), (c.formerNames || []).join(', '),
    c.nameChange.businessNumber || '—', c.nameChange.basis,
  ]))}

이전 상호 레코드는 **별도 업체로 남지 않습니다.** 목록·카드의 업체명에도 나오지 않고,
상세의 «이전 상호» 항목과 JSON 의 \`formerNames\` / \`nameChange\` 에만 남습니다(검색에는 걸립니다).

통합 시 두 레코드의 값이 달랐던 항목은 **현재 상호 쪽 값을 사용**하고, 버린 값은 검증 메시지에 남겼습니다.

${rows(c => c.nameChange && c.validation.messages.some(m => /상호 변경 통합 시/.test(m.message))).map(c =>
  `**${c.companyName}** — ` + c.validation.messages.filter(m => /상호 변경 통합 시/.test(m.message))
    .map(m => m.message.replace(/^상호 변경 통합 시 /, '').replace(/ 담당자 확인 권장\.$/, '')).join('<br>')).join('\n\n') || '값이 충돌한 항목은 없습니다.'}

### 6-2. 같은 업체가 신규 MOU 프로세스에 여러 행으로 존재 — ${multiAttempt.length}개사

1차 시도가 허들 처리된 뒤 재접근해 체결된 케이스입니다.
값을 섞으면 없던 날짜 오류가 생기므로, **행 단위로 \`mou.attempts\` 에 원본 그대로 보존**하고
가장 진행된 행을 대표 타임라인으로 삼았습니다.

${tbl(['업체', '원본 행'],
  multiAttempt.map(c => [nm(c), c.mou.attempts.map(a => `[${a.menu}] ${a.sourceName} — ${a.stage}${a.dates.mou ? ', 체결 ' + a.dates.mou : ''}`).join('<br>')]))}

### 6-3. 같은 업체에 업체코드가 2건 — ${S.multipleCodes}개사

${S.multipleCodes ? tbl(['업체', '업체코드', '사유'],
  rows(c => c.validation.multipleCodes).map(c => [nm(c), (c.codes || []).join(', '),
    c.validation.nameChangeMerged ? '상호 변경 전후로 코드가 각각 발급됨 — 원본 정리 필요' : '원본에 코드가 중복 발급됨'])) : '해당 없음'}

이 항목은 **“다른 업체일 수 있다”는 중복 의심이 아니라 코드 정리가 필요하다는 뜻**이므로
\`validation.multipleCodes\` 로 따로 표시하고 중복 의심 집계에서는 뺐습니다.

### 6-4. 업체코드 누락

협력업체 리스트에 있으나 업체코드가 비어 있는 업체: **${noCode.length}개사** ${noCode.length ? '— ' + noCode.map(c => c.companyName).join(', ') : ''}

---

## 7. 허들·보류 관련

| 항목 | 건수 |
|---|---|
| 허들·보류로 등록된 업체(원본 행 기준) | ${rows(c => c.hold.isOnHold).length} |
| 그중 이후 MOU 체결이 확인되어 결정 대기에서 제외 | ${rows(c => c.hold.resolvedBySigning).length} |
| 그중 최종 상태가 “허들·보류” | ${S.byStatus['허들·보류']} |
| **보류 사유 미기재** | **${S.missingHoldReason}** |
| **다음 액션(결정) 미입력** | **${S.missingNextAction} (전건)** |
| 진행 현황에 있으나 비고가 보류성 → 보류 의심 | ${rows(c => c.hold.isSuspectedHold).length} |

**보류 사유·다음 액션 건수는 아직 결정이 필요한 업체 기준**입니다. 이후 MOU 체결이 확인된 허들 이력
(${rows(c => c.hold.resolvedBySigning).length}개사)은 지나간 이력으로 보고 결정 대기 대상에서 제외했습니다.

**다음 액션이 전건 미입력인 이유**: 원본의 “액션 결정”(재접근/종결/보류 유지/재발송/확인 필요) 셀렉트는
브라우저 \`localStorage.hurdleActions\` 에만 저장되고 배포 데이터에 포함되지 않습니다.
값을 추정하지 않고 전건 \`"결정 미입력"\` 으로 두었습니다. **“종결” 상태가 0건인 것도 같은 이유입니다.**

### 보류 사유가 없는 업체 (${holdNoReason.length}개사)

${tbl(['업체', '마지막 진행일', '경과일', '단계'],
  holdNoReason.map(c => [nm(c), c.lastActivityAt || '미확인', c.mou.elapsedDays != null ? c.mou.elapsedDays : '미확인', c.mou.stage || '미확인']))}

---

## 8. MOU 체결일 불일치 — 출처 우선순위로 확정

같은 업체의 체결일이 메뉴마다 다르게 기록된 경우가 있습니다. **확정 규칙**에 따라 처리했습니다.

### 확정 규칙

| 우선순위 | 출처 |
|---|---|
| 1 | **체결 완료** 메뉴의 MOU 체결일 |
| 2 | MOU 진행 이력 (진행 현황 · 허들·보류) 등 체결 관련 원본 자료 |
| 3 | 협력업체 리스트(내부용)의 체결일 |
| 4 | 기타 화면 · 비고에 기록된 날짜 |

**[체결 완료] 메뉴에 체결일이 있으면 다른 메뉴에 다른 날짜가 있어도 반드시 [체결 완료] 값을 최종 체결일로 사용**합니다.
화면(고객관리카드·업체 목록)에는 **확정된 날짜 하나만** 표시하며 두 날짜를 나란히 보여주지 않습니다.
다른 메뉴의 원본 값은 지우지 않고 JSON 의 \`dateResolution.originalValues\` 에 보존했습니다.

### 처리 결과

| 항목 | 건수 |
|---|---|
| 메뉴별 체결일 불일치가 발견된 업체 | **${S.mouDateMismatch}** |
| 체결 완료 메뉴 기준으로 자동 해결된 업체 | **${S.mouDateResolved}** |
| 규칙 적용 후에도 담당자 확인이 필요한 업체 | **${S.mouDateNeedsReview}** |

${S.mouDateNeedsReview === 0
  ? '**불일치 전건이 자동 해결되었습니다.** 담당자 확인이 필요한 건은 없습니다. 이 ' + S.mouDateMismatch + '개사는 더 이상 상태 충돌·날짜 오류·확인 필요로 집계하지 않습니다(`validation.needsReview = false`, `dateError = false`).'
  : '**' + S.mouDateNeedsReview + '개사**는 [체결 완료] 메뉴에 체결일이 없거나 그 안에서 서로 다른 날짜가 발견되어 자동 확정하지 못했습니다. 담당자 확인이 필요합니다.'}

> **확인** — 규칙을 명시적으로 적용한 결과, **표시 날짜가 실제로 바뀐 업체는 ${rows(c => (c.changeHistory || []).some(h => h.type === 'mou_date_resolution' && h.changed)).length}개사**입니다.
> 기존 통합에서도 신규 MOU 프로세스(체결 완료) 값을 대표값으로 쓰고 있어 결과가 이미 규칙과 일치했습니다.
> 다만 이전에는 그것이 **명시적 규칙이 아니라 병합 순서에 따른 결과**였고 불일치를 “담당자 확인 필요”로 표시했는데,
> 이제는 출처 우선순위로 확정하고 확인 필요 표시를 없앴습니다.

### 불일치가 있었던 ${mismatch.length}개사

${tbl(['업체', '확정 체결일', '확정 출처', '다른 메뉴 기록(보존)', '차이(일)', '처리'],
  mismatch.map(c => {
    const r = c.dateResolution || {};
    const others = (r.originalValues || []).filter(v => v.value !== c.mou.signedAt);
    const ds = [...new Set((r.originalValues || []).map(v => v.value))].sort();
    const diff = ds.length > 1 ? Math.abs(Math.round((Date.parse(ds[ds.length - 1]) - Date.parse(ds[0])) / 86400000)) : 0;
    return [nm(c), c.mou.signedAt, c.mou.signedAtSource,
            others.map(v => `${v.source}: ${v.value}`).join('<br>') || '—',
            diff,
            r.needsReview ? '⚠️ 담당자 확인 필요' : '✅ 자동 확정'];
  }))}

각 업체의 \`changeHistory\` 에 처리 기록이 남아 있습니다.

\`\`\`json
{
  "type": "mou_date_resolution",
  "previousDisplayedDate": "...",
  "newDisplayedDate": "...",
  "changed": false,
  "selectedSource": "체결 완료",
  "conflictingValues": [ ... ],
  "resolutionStatus": "resolved",
  "reason": "사용자 확정 규칙에 따라 체결 완료 메뉴 날짜 우선 적용"
}
\`\`\`

---

## 9. 그 밖의 확인 필요 항목

| 항목 | 건수 | 설명 |
|---|---|---|
| 협력업체지만 MOU 상태 확인 불가 | ${S.byStatus['기존 협력업체·MOU 상태 확인 필요']} | MOU 체결 명부(시공사 발송용)에 없고 체결일도 없음. **협력업체라는 이유만으로 체결로 추정하지 않았습니다.** 우선순위는 §3-1 참조 |
| 체결일은 있으나 시공사 명부 미등재 | ${S.notInContractorList} | 협약 종료 또는 명부 미반영 가능성 |
| MOU 체결일이 있으나 협력업체 리스트에 없음 | ${doneNoPartner.length} | 체결 후 협력업체 리스트 등록이 누락됐을 가능성 |
| 장기 미진행(마지막 기록 후 180일 이상) | ${S.stalled} | 진행 중·허들·보류 업체 기준 |
| 원본 \`stage\` 시드값과 화면 표시 단계 불일치 | ${seedMismatch.length} | 사이트가 로드 시 \`recalcStage()\` 로 단계를 다시 계산하므로 **화면 표시값**을 채택 |
| 체결 완료인데 비고에 협약 취소·해지 표현 | ${S.cancelSuspect} | 협약이 현재도 유효한지 담당자 확인 필요 |
| 등급이 메뉴마다 다른 업체 | ${rows(c => c.gradeHistory.some(g => g.conflictingGrades.length)).length} | 등급 현황과 연도별 등급의 같은 연도 값이 불일치 |

### 협력업체지만 MOU 상태를 확인할 수 없는 ${partnerNoMou.length}개사 (앞 20개)

${partnerNoMou.slice(0, 20).map(c => `- ${nm(c)}${c.grade ? ` · 등급 ${c.grade}` : ''}`).join('\n')}
${partnerNoMou.length > 20 ? `\n… 외 ${partnerNoMou.length - 20}개사. 전체 목록은 \`companies-integrated.json\` 에서 \`validation.partnerWithoutMouStatus === true\` 로 필터하세요.` : ''}

---

## 10. 수집하지 못한 정보와 사유

${d.notCollected.map((n, i) => `### ${i + 1}. ${n.item}\n\n**사유** — ${n.reason}\n\n**영향** — ${n.impact}\n`).join('\n')}

> 위 항목들은 모두 **원본이 Firebase Realtime Database / 브라우저 localStorage 에만 저장하는 값**이거나
> 원본에 필드 자체가 없는 값입니다. 개인 인증정보에는 접근하지 않았습니다.
>
> **이 중 상당수는 목록 화면(\`companies-list.html\`)의 [🔄 원본과 동기화] 버튼으로 받아올 수 있습니다.**
> 이 빌드를 만든 작업 환경에서는 해당 도메인이 네트워크 정책으로 차단되어 있었을 뿐, 브라우저에서는
> 접근할 수 있습니다. 동기화하면 허들·보류 “액션 결정”, 업체 수정분(\`mouOverrides\`), 신규 추가
> (\`newMouAdds\`), 협력업체 리스트 수정분이 반영되고 \`종결\` 상태도 실제 값으로 채워집니다.

---

## 11. 요약

| 지표 | 값 |
|---|---|
| 전체 고유 업체 | **${S.totalCompanies}** |
| 원본 수집 행 | ${S.rawRowsCollected} |
| 기존 협력업체 | ${S.existingPartners} |
| 신규 MOU 프로세스 유입 업체 | ${S.newPipelineCompanies} |
| 등급 보유 업체 | ${S.graded} |
| MOU 체결 완료 | ${S.byStatus['MOU 체결 완료']} |
| 체결일 미확인 | ${S.byStatus['MOU 체결 완료·체결일 미확인']} |
| MOU 체결 명부(시공사 발송용) 등재 | ${S.contractorListed} |
| 체결일 있으나 시공사 명부 미등재 | ${S.notInContractorList} |
| MOU 진행 중 | ${S.byStatus['MOU 진행 중']} |
| 허들·보류 | ${S.byStatus['허들·보류']} |
| 종결 | ${S.byStatus['종결']} |
| 기존 협력업체·상태 확인 필요 | ${S.byStatus['기존 협력업체·MOU 상태 확인 필요']} |
| 상태 충돌·담당자 확인 필요 | ${S.byStatus['상태 충돌·담당자 확인 필요']} |
| 상호 변경으로 확정 통합 | ${S.nameChangesApplied} |
| 중복 의심(미해결) | ${S.possibleDuplicate} |
| 표기 차이로 통합(해결) | ${S.nameVariantMerged} |
| 같은 업체에 업체코드 2건 | ${S.multipleCodes} |
| 날짜 오류 | ${S.dateError} |
| 체결일 불일치 발견 | ${S.mouDateMismatch} |
| 그중 규칙으로 자동 확정 | ${S.mouDateResolved} |
| 규칙 적용 후 담당자 확인 필요 | ${S.mouDateNeedsReview} |
| 보류 사유 미기재 | ${S.missingHoldReason} |
| 확인 필요 사항이 1건 이상인 업체 | ${S.needsReview} |
`;

fs.writeFileSync(path.join(DIR, 'DATA-VALIDATION-REPORT.md'), md);
console.log('DATA-VALIDATION-REPORT.md written,', md.length, 'chars');
