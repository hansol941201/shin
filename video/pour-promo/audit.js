/* 전체 타임라인 자동 점검: 안전여백 이탈 / 글자 잘림 / 텍스트 겹침 */
const {chromium}=require('playwright');const path=require('path');
const STEP=+(process.env.STEP||0.25);
const SAFE={l:96,r:1824,t:40,b:1044};       // 5% 타이틀 세이프
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1920,height:1080}});
  const {A}=require('./assets').resolve('assets');
  await p.addInitScript(a=>{window.__ASSETS__=a;},A);
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('file://'+path.resolve(process.env.FILM||'film.html'),{waitUntil:'load'});
  await p.evaluate(()=>document.fonts.ready);
  await p.waitForFunction(()=>typeof window.seek==='function');
  if(errs.length){console.error('PAGE ERRORS:\n'+errs.join('\n'));process.exit(1);}

  await p.evaluate((TH)=>{ window.__TH=TH;
    window.__vis=el=>{
      let o=1,n=el;
      while(n && n!==document.body){
        const cs=getComputedStyle(n);
        if(cs.visibility==='hidden'||cs.display==='none') return 0;
        o*=parseFloat(cs.opacity||'1'); n=n.parentElement;
      }
      return o;
    };
    window.__texts=()=>{
      const out=[];
      document.querySelectorAll('#stage *, #sub').forEach(el=>{
        const own=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('');
        if(!own) return;
        if(window.__vis(el)<(window.__TH||0.55)) return;
        /* 요소 박스가 아니라 실제 글자가 차지한 범위로 잰다
           (중앙정렬 full-width div의 오탐 제거) */
        const rg=document.createRange(); rg.selectNodeContents(el);
        const rects=[...rg.getClientRects()].filter(q=>q.width>1&&q.height>1);
        if(!rects.length) return;
        const r={left:Math.min(...rects.map(q=>q.left)), top:Math.min(...rects.map(q=>q.top)),
                 right:Math.max(...rects.map(q=>q.right)), bottom:Math.max(...rects.map(q=>q.bottom))};
        r.width=r.right-r.left; r.height=r.bottom-r.top;
        if(r.width<2||r.height<2) return;
        /* 원본 미투입 플레이스홀더는 실제 이미지가 들어오면 사라지므로 제외 */
        if(el.closest('.ph')) return;
        out.push({t:own.slice(0,26),x:r.left,y:r.top,w:r.width,h:r.height,
                  ox:el.scrollWidth-el.clientWidth, oy:el.scrollHeight-el.clientHeight,
                  id:el.className+'|'+own.slice(0,12),
                  path:(function(n){let a=[];while(n&&n!==document.body){a.push([...(n.parentElement?.children||[])].indexOf(n));n=n.parentElement}return a.join('/')})(el)});
      });
      return out;
    };
  }, +(process.env.TH||0.55));

  const total=await p.evaluate(()=>window.__TOTAL__);
  const viol={safe:new Map(), clip:new Map(), overlap:new Map()};
  const add=(m,k,t)=>{ if(!m.has(k)) m.set(k,[]); if(m.get(k).length<3) m.get(k).push(t.toFixed(2)); };

  for(let t=0;t<total;t+=STEP){
    await p.evaluate(x=>window.seek(x),t);
    const els=await p.evaluate(()=>window.__texts());
    for(const e of els){
      if(e.x<SAFE.l-1||e.x+e.w>SAFE.r+1||e.y<SAFE.t-1||e.y+e.h>SAFE.b+1)
        add(viol.safe, `${e.t} @ x${Math.round(e.x)},y${Math.round(e.y)} ${Math.round(e.w)}x${Math.round(e.h)}`, t);
      if(e.ox>1||e.oy>1) add(viol.clip, `${e.t} (넘침 ${e.ox}x${e.oy})`, t);
    }
    for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){
      const a=els[i],c=els[j];
      if(a.path.endsWith(c.path)||c.path.endsWith(a.path)) continue;
      const ox=Math.min(a.x+a.w,c.x+c.w)-Math.max(a.x,c.x);
      const oy=Math.min(a.y+a.h,c.y+c.h)-Math.max(a.y,c.y);
      if(ox>6&&oy>6) add(viol.overlap, `"${a.t}" ↔ "${c.t}"`, t);
    }
  }
  await b.close();
  const show=(name,m)=>{
    console.log(`\n=== ${name}: ${m.size}건 ===`);
    [...m.entries()].slice(0,25).forEach(([k,v])=>console.log(`  ${k}   @ ${v.join(', ')}s`));
    if(m.size>25) console.log(`  ... 외 ${m.size-25}건`);
  };
  show('안전여백 이탈', viol.safe);
  show('글자 잘림', viol.clip);
  show('텍스트 겹침', viol.overlap);
})().catch(e=>{console.error(e);process.exit(1)});
