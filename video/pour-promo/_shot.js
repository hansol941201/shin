const {chromium}=require('playwright');const path=require('path');
const {resolve}=require('./assets');const {A}=resolve('assets');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--allow-file-access-from-files','--force-color-profile=srgb','--disable-lcd-text','--font-render-hinting=none']});
const pg=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
await require('./alpha')(b,A);
await pg.addInitScript(a=>{window.__ASSETS__=a;},A);
  if(process.env.RATE) await pg.addInitScript(r=>{window.__RATE__=r;}, +process.env.RATE);
  if(process.env.PHLABEL) await pg.addInitScript(()=>{window.__PHLABEL__=true;});
await pg.goto('file://'+path.resolve('film2.html'),{waitUntil:'load'});
await pg.waitForFunction(()=>window.seek);await pg.waitForTimeout(900);
for(const t of process.argv.slice(2)){await pg.evaluate(v=>window.seek(v),+t);await pg.waitForTimeout(90);
  await pg.screenshot({path:`/tmp/s_${t}.png`});}
await b.close();})();
