const {chromium}=require('playwright');const path=require('path'),fs=require('fs');
const TS=process.argv.slice(2).map(Number);
(async()=>{
  const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});const p=await b.newPage({viewport:{width:1920,height:1080}});
  await p.addInitScript(()=>{window.__ASSETS__={};});
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('file://'+path.resolve('film.html'),{waitUntil:'load'});
  await p.evaluate(()=>document.fonts.ready);
  await p.waitForFunction(()=>typeof window.seek==='function');
  if(errs.length){console.error('PAGE ERRORS:\n'+errs.join('\n'));process.exit(1);}
  console.log('TOTAL',(await p.evaluate(()=>window.__TOTAL__)).toFixed(2));
  fs.mkdirSync('probe',{recursive:true});
  for(const t of TS){await p.evaluate(x=>window.seek(x),t);
    await p.screenshot({path:`probe/t${String(t).padStart(5,'0')}.jpg`,type:'jpeg',quality:80});}
  console.log('probes:',TS.join(', '));await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
