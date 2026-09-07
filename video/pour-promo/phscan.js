/* 최종 영상에 '원본 이미지 필요', 슬롯 이름, 빈 액자가 남아 있지 않은지 확인 */
const {chromium}=require('playwright');const path=require('path');
const {resolve}=require('./assets');const {A,miss}=resolve('assets');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--allow-file-access-from-files']});
  const p=await b.newPage({viewport:{width:1920,height:1080}});
  await p.addInitScript(a=>{window.__ASSETS__=a;},A);
  if(process.env.RATE) await p.addInitScript(r=>{window.__RATE__=r;}, +process.env.RATE);
  await p.goto('file://'+path.resolve(process.env.FILM||'film2.html'),{waitUntil:'load'});
  await p.waitForFunction(()=>window.seek); await p.waitForTimeout(800);
  const T=await p.evaluate(()=>TOTAL);
  const hits=new Set(); let phCount=0;
  for(let t=0;t<=T;t+=0.25){
    await p.evaluate(v=>window.seek(v),+t.toFixed(2));
    const r=await p.evaluate(slots=>{
      const bad=[];
      const txt=document.getElementById('stage').innerText||'';
      if(/원본 이미지 필요/.test(txt)) bad.push('원본 이미지 필요');
      for(const k of slots) if(txt.includes(k)) bad.push('슬롯명:'+k);
      let n=0;
      for(const el of document.querySelectorAll('.ph')){
        let o=1,x=el; while(x&&x!==document.body){o*=parseFloat(getComputedStyle(x).opacity||'1');x=x.parentElement;}
        if(o>0.05) n++;
      }
      return {bad,n};
    },miss);
    r.bad.forEach(x=>hits.add(x+' @'+t.toFixed(2)+'s'));
    phCount=Math.max(phCount,r.n);
  }
  await b.close();
  console.log(`자리표시자 문구/파일명 노출: ${hits.size}건`);
  [...hits].slice(0,20).forEach(h=>console.log('  '+h));
  console.log(`빈 슬롯 면(.ph) 동시 최대 노출 수: ${phCount}  (문구 없는 브랜드 면으로만 렌더)`);
})();
