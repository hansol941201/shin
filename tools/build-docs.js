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
- **MOU 체결 완료·체결일 미확인 = 0건.** 체결 표시(\`mouDone\`, 협력업체 리스트의 “ㅇ”)가 있는 업체는
  **전건 날짜가 함께 입력**되어 있었습니다. 억지로 채우지 않고 0으로 보고합니다.
- **종결 = 0건.** 원본에 종결 상태를 저장하는 필드가 없습니다(§7 참조).

### 진행 단계 분포

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

### 6-1. 중복 의심 — ${dups.length}개사

업체 식별 우선순위는 **① 업체코드 → ② 사업자등록번호 → ③ 정규화 업체명** 이지만,
**자동 병합은 정규화 업체명이 일치할 때만** 수행했습니다.
코드나 사업자번호만 같고 상호가 다른 경우는 상호 변경일 수도, 오입력일 수도 있어 합치지 않고 표시만 했습니다.

${tbl(['업체', '유형', '내용'],
  dups.map(c => [nm(c),
    msgs(c, 'possibleDuplicate').some(m => m.indexOf('사업자등록번호') > -1) ? '사업자번호 공유(미병합)'
      : msgs(c, 'possibleDuplicate').some(m => m.indexOf('업체코드') > -1) ? '업체코드 공유(미병합)' : '표기 차이(병합함)',
    msgs(c, 'possibleDuplicate').join('<br>')]))}

### 6-2. 같은 업체가 신규 MOU 프로세스에 여러 행으로 존재 — ${multiAttempt.length}개사

1차 시도가 허들 처리된 뒤 재접근해 체결된 케이스입니다.
값을 섞으면 없던 날짜 오류가 생기므로, **행 단위로 \`mou.attempts\` 에 원본 그대로 보존**하고
가장 진행된 행을 대표 타임라인으로 삼았습니다.

${tbl(['업체', '원본 행'],
  multiAttempt.map(c => [nm(c), c.mou.attempts.map(a => `[${a.menu}] ${a.sourceName} — ${a.stage}${a.dates.mou ? ', 체결 ' + a.dates.mou : ''}`).join('<br>')]))}

### 6-3. 업체코드 누락

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

## 8. MOU 체결일 값 불일치 — ${mismatch.length}개사

같은 업체의 체결일이 **[체결 완료] 탭과 [협력업체 리스트]에서 서로 다르게** 기록된 건입니다.
대부분 1~4일 차이로, 체결일과 등록일을 다르게 적었을 가능성이 높습니다.
어느 쪽이 맞는지 알 수 없어 **양쪽 값을 모두 \`mou.signedAtSources\` 에 보존**하고,
대표값 \`mou.signedAt\` 은 신규 MOU 프로세스 쪽 값을 사용했습니다.

> **이 ${mismatch.length}개사는 전건 \`MOU 체결 완료\` 입니다.** 날짜 값만 며칠 어긋난 것이라 상태 분류에는 영향이 없고,
> 어느 날짜가 맞는지 확인이 필요하다는 데이터 품질 메모입니다.

${tbl(['업체', '체결 완료 탭', '협력업체 리스트', '차이(일)'],
  mismatch.map(c => {
    const a = c.mou.signedAtSources.find(s => s.menu === '체결 완료');
    const b = c.mou.signedAtSources.find(s => s.menu.indexOf('협력업체') === 0);
    const diff = (a && b) ? Math.abs(Math.round((Date.parse(a.date) - Date.parse(b.date)) / 86400000)) : '—';
    return [nm(c), a ? a.date : '—', b ? b.date : '—', diff];
  }))}

---

## 9. 그 밖의 확인 필요 항목

| 항목 | 건수 | 설명 |
|---|---|---|
| 협력업체지만 MOU 상태 확인 불가 | ${S.partnerWithoutMouStatus} | 협력업체 리스트/등급 현황에만 있고 협약체결 칸이 비어 있음. **기존 협력업체라는 이유로 체결로 추정하지 않았습니다.** |
| MOU 체결일이 있으나 협력업체 리스트에 없음 | ${doneNoPartner.length} | 체결 후 협력업체 리스트 등록이 누락됐을 가능성 |
| 장기 미진행(마지막 기록 후 180일 이상) | ${S.stalled} | 진행 중·허들·보류 업체 기준 |
| 원본 \`stage\` 시드값과 화면 표시 단계 불일치 | ${seedMismatch.length} | 사이트가 로드 시 \`recalcStage()\` 로 단계를 다시 계산하므로 **화면 표시값**을 채택 |
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
| MOU 진행 중 | ${S.byStatus['MOU 진행 중']} |
| 허들·보류 | ${S.byStatus['허들·보류']} |
| 종결 | ${S.byStatus['종결']} |
| 기존 협력업체·상태 확인 필요 | ${S.byStatus['기존 협력업체·MOU 상태 확인 필요']} |
| 상태 충돌·담당자 확인 필요 | ${S.byStatus['상태 충돌·담당자 확인 필요']} |
| 중복 의심 | ${S.possibleDuplicate} |
| 날짜 오류 | ${S.dateError} |
| 체결일 값 불일치 | ${S.mouDateMismatch} |
| 보류 사유 미기재 | ${S.missingHoldReason} |
| 확인 필요 사항이 1건 이상인 업체 | ${S.needsReview} |
`;

fs.writeFileSync(path.join(DIR, 'DATA-VALIDATION-REPORT.md'), md);
console.log('DATA-VALIDATION-REPORT.md written,', md.length, 'chars');
