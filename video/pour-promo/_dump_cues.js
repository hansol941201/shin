const {chromium}=require('playwright');const path=require('path');const fs=require('fs');
const {resolve}=require('./assets');const {A}=resolve('assets');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--allow-file-access-from-files']});
const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.addInitScript(a=>{window.__ASSETS__=a;},A);
  if(process.env.RATE) await p.addInitScript(r=>{window.__RATE__=r;}, +process.env.RATE);
await p.goto('file://'+path.resolve('film2.html'),{waitUntil:'load'});
await p.waitForFunction(()=>window.seek);await p.waitForTimeout(600);
const out=await p.evaluate(()=>{
  const rows=[];
  for(const id of Object.keys(CUE))
    CUE[id].forEach((c,i)=>rows.push({scene:id,idx:i,t0:+c.t0.toFixed(3),t1:+c.t1.toFixed(3),tx:c.tx}));
  return {rows,TOTAL:+TOTAL.toFixed(3)};
});
fs.writeFileSync('cues.json',JSON.stringify(out,null,1));
console.log('lines',out.rows.length,'TOTAL',out.TOTAL);
await b.close();})();
