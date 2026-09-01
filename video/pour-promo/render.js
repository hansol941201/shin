const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');

const FFMPEG=process.env.FFMPEG||'ffmpeg';  // libx264 포함 빌드 필요
const FPS=+(process.env.FPS||30);
const OUT=process.env.OUT||'POUR_홍보영상.mp4';
const W=1920,H=1080;

const {resolve}=require('./assets');
const {A,have,miss,SLOTS}=resolve('assets');
console.log(`[assets] ${have.length}/${SLOTS.length} 매칭됨: ${have.join(', ')||'없음'}`);
if(miss.length) console.log(`[assets] 누락(플레이스홀더 처리): ${miss.join(', ')}`);

(async()=>{
  const browser=await chromium.launch({...(process.env.CHROME?{executablePath:process.env.CHROME}:{}),args:['--force-color-profile=srgb','--disable-lcd-text','--font-render-hinting=none']});
  const page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
  await page.addInitScript(a=>{window.__ASSETS__=a;},A);
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('file://'+path.resolve('film.html'),{waitUntil:'load'});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>typeof window.seek==='function',{timeout:15000});
  if(errs.length){console.error('[page errors]\n'+errs.join('\n'));process.exit(1);}

  const total=await page.evaluate(()=>window.__TOTAL__);
  const frames=Math.round(total*FPS);
  console.log(`[render] ${total.toFixed(2)}s @ ${FPS}fps = ${frames} frames -> ${OUT}`);

  const ff=spawn(FFMPEG,['-y','-f','image2pipe','-framerate',String(FPS),'-i','pipe:0',
    '-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p',
    '-movflags','+faststart','-r',String(FPS),OUT],{stdio:['pipe','ignore','pipe']});
  let ffErr=''; ff.stderr.on('data',d=>{ffErr+=d.toString();if(ffErr.length>8000)ffErr=ffErr.slice(-4000);});
  const done=new Promise((res,rej)=>ff.on('close',c=>c===0?res():rej(new Error('ffmpeg exit '+c+'\n'+ffErr))));
  ff.stdin.on('error',()=>{});

  const t0=Date.now();
  for(let i=0;i<frames;i++){
    await page.evaluate(t=>window.seek(t), i/FPS);
    const buf=await page.screenshot({type:'jpeg',quality:95});
    if(!ff.stdin.write(buf)) await new Promise(r=>ff.stdin.once('drain',r));
    if(i%150===0||i===frames-1){
      const pct=((i+1)/frames*100).toFixed(1), el=(Date.now()-t0)/1000;
      const eta=el/(i+1)*(frames-i-1);
      console.log(`  ${pct}%  frame ${i+1}/${frames}  elapsed ${el.toFixed(0)}s  eta ${eta.toFixed(0)}s`);
    }
  }
  ff.stdin.end();
  await done;
  await browser.close();
  const sz=fs.statSync(OUT).size;
  console.log(`[done] ${OUT}  ${(sz/1048576).toFixed(1)} MB  ${total.toFixed(1)}s`);
})().catch(e=>{console.error(e);process.exit(1);});
