// 일정(월간 달력) 화면 확인 — 데스크톱/모바일
// 실행: npx playwright install chromium && node qa/calendar-check.mjs
// (앱 자체에는 의존성이 없습니다. 이 파일은 확인용 스크립트라 배포에 포함되지 않습니다.)
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = '/home/user/shin';
const out = process.env.SHOT_DIR || '/tmp';
const failures = [];
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const server=http.createServer((req,res)=>{
  const f=path.join(root,decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'')||'index.html');
  if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('x');}
  res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));});
await new Promise(r=>server.listen(0,r));
const base=`http://localhost:${server.address().port}`;
const ok=(n,p,d='')=>{ if(!p) failures.push(n); console.log(`${p?'PASS':'FAIL'}  ${n}${d?` — ${d}`:''}`); };
const b=await chromium.launch({executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:1600,height:1000}});
await ctx.route('**cdn.jsdelivr.net/**', r=>r.abort());
await ctx.route('**gstatic.com/**', r=>r.abort());
const page=await ctx.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.goto(base+'/index.html');
await page.waitForTimeout(900);
ok('자바스크립트 오류 없음', errors.length===0, errors.join(' | '));

// 기존 기능 보존
ok('기존 사이드바 메뉴 유지', await page.isVisible('#homeNavLink') && await page.isVisible('#todayFooterLink')
  && await page.isVisible('#companiesFooterLink') && await page.isVisible('#vaultFooterLink') && await page.isVisible('#perfSearchLink'));
ok('기존 검색창·할 일 유지', await page.isVisible('#globalSearch') && await page.isVisible('#noteBtn'));

// 상단 '일정' 탭
ok('상단 메뉴에 일정 탭', await page.isVisible('#scheduleTopLink'));
await page.click('#scheduleTopLink'); await page.waitForTimeout(500);
ok('월간 달력 표시', await page.isVisible('.cal-grid') && (await page.$$('.cal-cell')).length>=35,
   `${(await page.$$('.cal-cell')).length}칸`);
ok('제목 = 조재연 일정', (await page.textContent('.cal-title')).trim()==='조재연 일정');
ok('빨간 범례 표시', await page.isVisible('.cal-legend'));

// 필터 칩 9개
const chips = await page.$$eval('.cal-chip', n=>n.map(x=>x.dataset.type));
ok('필터 9종', JSON.stringify(chips)===JSON.stringify(['전체','영업','PT','현설','세미나','아스퀘','개인','휴가','회의']), JSON.stringify(chips));

// 조재연만 표시
const titles = await page.$$eval('.cal-event .ev-title', n=>n.map(x=>x.textContent));
ok('다른 담당자 일정 숨김', !titles.some(t=>t.includes('다른 담당자')), JSON.stringify(titles));
ok('조재연 일정은 표시', titles.some(t=>t.includes('한솔아파트')), JSON.stringify(titles));
const evColor = await page.$eval('.cal-event', n=>{const c=getComputedStyle(n);return {bg:c.backgroundColor,border:c.borderLeftColor,color:c.color};});
ok('빨간 계열 강조', evColor.border==='rgb(194, 32, 26)' && evColor.bg==='rgb(253, 236, 234)', JSON.stringify(evColor));

// 오늘 강조 · 요일 색
ok('오늘 강조', (await page.$$('.cal-cell.today')).length===1);
const sun = await page.$eval('.cal-weekdays span.sun', n=>getComputedStyle(n).color);
const sat = await page.$eval('.cal-weekdays span.sat', n=>getComputedStyle(n).color);
ok('일요일 빨강·토요일 파랑', sun==='rgb(194, 32, 26)' && sat==='rgb(37, 99, 235)', `${sun} / ${sat}`);

// 월 이동
const monthText = () => page.textContent('.cal-month');
const before = await monthText();
await page.click('[data-action="cal-next"]'); await page.waitForTimeout(300);
const after = await monthText();
ok('다음 달 이동', before!==after, `${before} → ${after}`);
await page.click('[data-action="cal-prev"]'); await page.waitForTimeout(300);
ok('이전 달 이동', (await monthText())===before);
await page.click('[data-action="cal-today"]'); await page.waitForTimeout(300);
ok('오늘 버튼', (await monthText())===before);

// 날짜 클릭 → 상세 목록
await page.click('.cal-cell.today'); await page.waitForTimeout(300);
ok('날짜 클릭 시 상세 목록', (await page.$$('.cal-detail')).length>0);
const sideText = await page.textContent('.cal-side');
ok('상세에 상태·담당자·현장·공종·업체', ['확정','담당자','현장명','공종','요청 업체'].every(k=>sideText.includes(k)), sideText.slice(0,120));
ok('상세에도 조재연만', !sideText.includes('다른 담당자'));

ok('저장된 일정이 없으면 예시 안내', await page.isVisible('.cal-sample-note'));
ok('예시는 수정·삭제 버튼 없음', (await page.$$('.cal-detail [data-action="cal-edit"]')).length===0 && (await page.$$('.cal-sample-tag')).length>0);
ok('담당자 여러 명도 조재연 포함 시 표시', (await page.textContent('.cal-layout')).includes('우단건설 현장설명회'));

// 필터 적용
await page.click('[data-action="cal-filter"][data-type="휴가"]'); await page.waitForTimeout(300);
const filtered = await page.$$eval('.cal-event .ev-type', n=>[...new Set(n.map(x=>x.textContent))]);
ok('유형 필터 적용', filtered.length===0 || (filtered.length===1 && filtered[0]==='휴가'), JSON.stringify(filtered));
await page.click('[data-action="cal-next"]'); await page.waitForTimeout(250);
ok('월 이동해도 필터 유지', await page.evaluate(()=>document.querySelector('.cal-chip.active').textContent.includes('휴가')));
await page.click('[data-action="cal-prev"]'); await page.waitForTimeout(250);
await page.click('[data-action="cal-filter"][data-type="전체"]'); await page.waitForTimeout(300);

// 추가 → 수정 → 삭제
await page.click('[data-action="cal-add"]'); await page.waitForTimeout(400);
ok('일정 추가 창', await page.isVisible('#scheduleForm'));
await page.fill('#scheduleForm input[name="title"]','테스트 현장설명회');
await page.selectOption('#scheduleForm select[name="type"]','현설');
await page.fill('#scheduleForm input[name="time"]','11:00');
await page.fill('#scheduleForm input[name="site"]','테스트 현장');
await page.fill('#scheduleForm input[name="trade"]','방수');
await page.fill('#scheduleForm input[name="client"]','테스트건설');
await page.click('#scheduleForm button[type="submit"]'); await page.waitForTimeout(500);
ok('일정 추가됨', (await page.textContent('.cal-side')).includes('테스트 현장설명회'));
const stored = await page.evaluate(()=>JSON.parse(localStorage.getItem('work-guide-state-v1')).schedules.map(s=>s.title));
ok('localStorage 에 저장', stored.includes('테스트 현장설명회'), `${stored.length}건`);
ok('클라우드 동기화 대상 아님', await page.evaluate(()=>!CLOUD_COLLECTIONS.includes('schedules') && getCloudSlice('schedules')===null));

await page.click('.cal-detail:has-text("테스트 현장설명회") [data-action="cal-edit"]'); await page.waitForTimeout(400);
await page.fill('#scheduleForm input[name="title"]','테스트 현장설명회(수정)');
await page.click('#scheduleForm button[type="submit"]'); await page.waitForTimeout(500);
ok('일정 수정됨', (await page.textContent('.cal-side')).includes('테스트 현장설명회(수정)'));

page.once('dialog', d=>d.accept());
await page.click('.cal-detail:has-text("테스트 현장설명회(수정)") [data-action="cal-delete"]'); await page.waitForTimeout(500);
ok('일정 삭제됨', !(await page.textContent('.cal-side')).includes('테스트 현장설명회'));

// 담당자에 조재연이 없으면 화면에 안 나온다(원본은 남아 있다)
await page.click('[data-action="cal-add"]'); await page.waitForTimeout(400);
await page.fill('#scheduleForm input[name="title"]','타인 일정');
await page.fill('#scheduleForm input[name="owners"]','홍길동');
await page.click('#scheduleForm button[type="submit"]'); await page.waitForTimeout(500);
ok('조재연 아닌 일정은 화면에서 숨김', !(await page.textContent('.cal-layout')).includes('타인 일정'));
ok('원본 데이터는 남아 있음', await page.evaluate(()=>JSON.parse(localStorage.getItem('work-guide-state-v1')).schedules.some(s=>s.title==='타인 일정')));
ok('일정이 생기면 예시는 사라짐', !(await page.isVisible('.cal-sample-note')));

// 담당자가 여러 명이어도 그중 조재연이 있으면 표시
await page.click('[data-action="cal-add"]'); await page.waitForTimeout(400);
await page.fill('#scheduleForm input[name="title"]','공동 담당 현설');
await page.fill('#scheduleForm input[name="owners"]',' 김대리 ,  조재연 ');
await page.click('#scheduleForm button[type="submit"]'); await page.waitForTimeout(500);
ok('담당자 여러 명도 조재연 포함 시 표시', (await page.textContent('.cal-layout')).includes('공동 담당 현설'));

await page.screenshot({path:out+'/cal-desktop.png', fullPage:false});

// 기존 화면 복귀 확인
await page.click('#homeNavLink'); await page.waitForTimeout(400);
ok('홈 화면 정상 복귀', (await page.textContent('#content')).includes('처리할 업무'));
await page.click('#companiesFooterLink'); await page.waitForTimeout(400);
ok('업체관리 정상', !(await page.textContent('#content')).includes('cal-grid'));
await page.click('#scheduleNavLink'); await page.waitForTimeout(400);
ok('사이드바 일정 메뉴', await page.isVisible('.cal-grid'));

// 새로고침 — 이 사이트는 원래 항상 홈부터 시작한다(기존 규칙 유지). 일정 데이터는 남아 있어야 한다.
await page.reload(); await page.waitForTimeout(800);
ok('새로고침 시 기존 규칙대로 홈부터', (await page.textContent('#content')).includes('처리할 업무'));
await page.click('#scheduleTopLink'); await page.waitForTimeout(500);
ok('새로고침 후에도 일정 데이터 유지', (await page.textContent('.cal-layout')).includes('공동 담당 현설'));

// 모바일
await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(500);
const m = await page.evaluate(()=>{
  const board=document.querySelector('.cal-board').getBoundingClientRect();
  const layout=getComputedStyle(document.querySelector('.cal-layout')).gridTemplateColumns;
  const side=document.querySelector('.cal-side').getBoundingClientRect();
  const boardBox=document.querySelector('.cal-board').getBoundingClientRect();
  return { docOverflow: Math.round(document.documentElement.scrollWidth - window.innerWidth),
           boardW: Math.round(board.width), cols: layout.split(' ').length,
           sideBelow: side.top > boardBox.top + 10 };
});
ok('모바일 1열 · 선택 날짜 목록이 달력 아래', m.cols===1 && m.sideBelow, JSON.stringify(m));
ok('모바일에서 화면이 가로로 깨지지 않음', m.docOverflow<=1, JSON.stringify(m));
ok('모바일에서도 7칸이 한 화면에', await page.evaluate(()=>{
  const b=document.querySelector('.cal-board');
  const cells=[...document.querySelectorAll('.cal-cell')].slice(0,7);
  return b.scrollWidth <= b.clientWidth + 1 && cells.length===7 && cells.every(c=>c.getBoundingClientRect().width > 30); }));
await page.screenshot({path:out+'/cal-mobile.png', fullPage:false});

ok('끝까지 오류 없음', errors.length===0, errors.join(' | '));
await b.close(); server.close();
console.log(failures.length ? `\n실패 ${failures.length}건` : '\n모두 통과');
process.exit(failures.length?1:0);
