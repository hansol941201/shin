/* 핵심 텍스트가 '완전한 불투명도'로 실제 몇 초나 머무는지 잰다.
   요소 자신의 opacity 만 보면 안 되고 부모 체인(sub/scene 래퍼)까지 곱해야
   화면에 실제로 보이는 값이 나온다. */
const {chromium}=require('playwright');const path=require('path');
const {resolve}=require('./assets');const {A}=resolve('assets');
const STEP=+(process.env.STEP||0.1), MIN=+(process.env.MINHOLD||1.5);
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--allow-file-access-from-files']});
  const p=await b.newPage({viewport:{width:1920,height:1080}});
  await p.addInitScript(a=>{window.__ASSETS__=a;},A);
  if(process.env.PHLABEL) await p.addInitScript(()=>{window.__PHLABEL__=true;});
  await p.goto('file://'+path.resolve(process.env.FILM||'film2.html'),{waitUntil:'load'});
  await p.waitForFunction(()=>window.seek); await p.waitForTimeout(800);
  const T=await p.evaluate(()=>TOTAL);
  await p.evaluate(()=>{
    window.__eff=el=>{let o=1,n=el;while(n&&n!==document.body){o*=parseFloat(getComputedStyle(n).opacity||'1');n=n.parentElement;}return o;};
    /* DOM 은 로드 시 한 번에 만들어지므로 요소마다 고정 id 를 붙인다.
       위치를 키로 쓰면 애니메이션 중 좌표가 바뀌어 매 프레임 새 항목이 되고
       '유지 시간'이 항상 0 으로 나온다. */
    let uid=0; window.__T=[];
    for(const el of document.querySelectorAll('#stage *')){
      if(el.children.length) continue;
      const t=(el.textContent||'').trim(); if(!t||t.length<2) continue;
      const fs=parseFloat(getComputedStyle(el).fontSize)||0; if(fs<26) continue;
      el.dataset.hc=++uid; window.__T.push([el,t,fs,uid]);
    }
    window.__snap=()=>window.__T.map(([el,t,fs,id])=>[id,t,fs,+window.__eff(el).toFixed(3)]);
  });
  const seen=new Map();
  for(let t=0;t<=T;t+=STEP){
    await p.evaluate(v=>window.seek(v),+t.toFixed(2));
    for(const [k,tx,fs,o] of await p.evaluate(()=>window.__snap())){
      if(!seen.has(k)) seen.set(k,{tx,fs,run:0,best:0,at:0,t0:t});
      const r=seen.get(k);
      if(o>=0.98){ r.run+=STEP; if(r.run>r.best){r.best=r.run;r.at=t;} } else r.run=0;
    }
  }
  await b.close();
  const bad=[...seen.values()].filter(r=>r.best<MIN-1e-6).sort((a,b)=>a.best-b.best);
  console.log(`=== 완전 불투명 유지 ${MIN}s 미만: ${bad.length}건 (검사 ${seen.size}개) ===`);
  for(const r of bad.slice(0,60))
    console.log(`  "${r.tx.slice(0,34)}"  ${r.fs}px  최대유지 ${r.best.toFixed(1)}s  @${r.at.toFixed(1)}s`);
})();
