/* 안전영역(120px 마진, 자막 영역 제외) 안에서 실제 콘텐츠가 차지하는 면적 비율.
   배경/베일은 콘텐츠가 아니다 — 글자, 카드, 이미지 프레임, 그래픽만 센다. */
const {chromium}=require('playwright');const path=require('path');
const {resolve}=require('./assets');const {A}=resolve('assets');
const STEP=+(process.env.STEP||0.5), MINR=+(process.env.MINR||0.55);
const SX=120,SY=120,SW=1920-240,SH=820-120;      // 자막 상단(약 840) 위까지
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--allow-file-access-from-files']});
  const p=await b.newPage({viewport:{width:1920,height:1080}});
  await p.addInitScript(a=>{window.__ASSETS__=a;},A);
  if(process.env.PHLABEL) await p.addInitScript(()=>{window.__PHLABEL__=true;});
  await p.goto('file://'+path.resolve(process.env.FILM||'film2.html'),{waitUntil:'load'});
  await p.waitForFunction(()=>window.seek); await p.waitForTimeout(800);
  const T=await p.evaluate(()=>TOTAL);
  const rows=[];
  for(let t=0;t<=T;t+=STEP){
    await p.evaluate(v=>window.seek(v),+t.toFixed(2));
    rows.push([t, await p.evaluate(([SX,SY,SW,SH])=>{
      const eff=el=>{let o=1,n=el;while(n&&n!==document.body){o*=parseFloat(getComputedStyle(n).opacity||'1');n=n.parentElement;}return o;};
      /* 32px 격자로 덮인 칸 수를 센다 — 겹침을 중복으로 세지 않는다 */
      const G=32, cols=Math.ceil(SW/G), rowsN=Math.ceil(SH/G), grid=new Uint8Array(cols*rowsN);
      for(const el of document.querySelectorAll('#stage *')){
        const cs=getComputedStyle(el);
        /* 풀블리드 사진/면도 '보이는 콘텐츠'다. 베일과 씬 래퍼만 제외한다. */
        if(el.classList.contains('veil')||el.classList.contains('scene')) continue;
        const txt=(el.textContent||'').trim(), leaf=!el.children.length;
        const paints = (leaf&&txt) || el.classList.contains('card') || el.classList.contains('ph')
                    || el.classList.contains('pedestal') || el.classList.contains('box')
                    || (cs.backgroundImage!=='none') || (cs.backgroundColor!=='rgba(0, 0, 0, 0)');
        if(!paints) continue;
        if(eff(el)<0.35) continue;
        const r=el.getBoundingClientRect();
        if(r.width<4||r.height<4) continue;
        const x0=Math.max(SX,r.left),y0=Math.max(SY,r.top),x1=Math.min(SX+SW,r.right),y1=Math.min(SY+SH,r.bottom);
        if(x1<=x0||y1<=y0) continue;
        for(let gy=Math.floor((y0-SY)/G);gy<Math.ceil((y1-SY)/G);gy++)
          for(let gx=Math.floor((x0-SX)/G);gx<Math.ceil((x1-SX)/G);gx++)
            if(gy>=0&&gy<rowsN&&gx>=0&&gx<cols) grid[gy*cols+gx]=1;
      }
      let n=0; for(const v of grid) n+=v;
      return +(n/grid.length).toFixed(3);
    },[SX,SY,SW,SH])]);
  }
  await b.close();
  const low=rows.filter(r=>r[1]<MINR);
  const avg=rows.reduce((a,r)=>a+r[1],0)/rows.length;
  console.log(`평균 밀도 ${(avg*100).toFixed(1)}%  /  ${(MINR*100)|0}% 미만 ${low.length}/${rows.length} 프레임`);
  /* 연속 구간으로 묶어 출력 */
  let run=null; const outs=[];
  for(const [t,v] of rows){
    if(v<MINR){ if(!run) run={a:t,b:t,min:v}; else {run.b=t; run.min=Math.min(run.min,v);} }
    else if(run){ outs.push(run); run=null; }
  }
  if(run) outs.push(run);
  for(const r of outs) if(r.b-r.a>=0.9) console.log(`  ${r.a.toFixed(1)}s ~ ${r.b.toFixed(1)}s  최저 ${(r.min*100).toFixed(0)}%`);
})();
