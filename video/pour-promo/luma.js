/* 실제 프레임을 5fps로 뽑아 ffmpeg signalstats로 평균 휘도를 재고
   딥블루(어두운 면) 비중을 산출한다. 추정이 아니라 실측이다. */
const {chromium}=require('playwright');
const path=require('path'),{spawn}=require('child_process');
const FF=process.env.FFMPEG||'/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
const FPS=5;
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1920,height:1080}});
  const {A}=require('./assets').resolve('assets');
  await require('./alpha')(b,A);
  await p.addInitScript(a=>{window.__ASSETS__=a;},A);
  await p.goto('file://'+path.resolve(process.env.FILM||'film.html'),{waitUntil:'load'});
  await p.evaluate(()=>document.fonts.ready);
  await p.waitForFunction(()=>typeof window.seek==='function');
  const total=await p.evaluate(()=>window.__TOTAL__);
  const n=Math.round(total*FPS);
  const ff=spawn(FF,['-y','-hide_banner','-loglevel','error','-f','image2pipe','-framerate',String(FPS),
    '-i','pipe:0','-vf','crop=1920:940:0:0,signalstats,metadata=print:file=-','-f','null','-'],
    {stdio:['pipe','pipe','inherit']});
  let out=''; ff.stdout.on('data',d=>out+=d);
  const done=new Promise(r=>ff.on('close',r));
  ff.stdin.on('error',()=>{});
  for(let i=0;i<n;i++){
    await p.evaluate(t=>window.seek(t), i/FPS);
    const buf=await p.screenshot({type:'jpeg',quality:60});
    if(!ff.stdin.write(buf)) await new Promise(r=>ff.stdin.once('drain',r));
  }
  ff.stdin.end(); await done; await b.close();
  const y=[...out.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map(m=>+m[1]);
  const DARK=96;                                   // Y 96/255 미만이면 어두운 면
  const dark=y.filter(v=>v<DARK).length;
  console.log(`프레임 ${y.length}개 · 평균 Y ${(y.reduce((a,c)=>a+c,0)/y.length).toFixed(1)}`);
  console.log(`딥블루(어두운 면) 비중 ${(dark/y.length*100).toFixed(1)}%`);
  let cur=null,st=0; const seg=[];
  y.forEach((v,i)=>{ const t=i/FPS, d=v<DARK;
    if(cur===null){cur=d;st=t;} else if(d!==cur){seg.push([cur,st,t]);cur=d;st=t;} });
  seg.push([cur,st,y.length/FPS]);
  const f=x=>Math.floor(x/60)+':'+String(Math.round(x%60)).padStart(2,'0');
  seg.filter(x=>x[2]-x[1]>=1).forEach(([d,a,c])=>console.log(`  ${d?'딥블루':'밝은면'}  ${f(a)}~${f(c)}  ${(c-a).toFixed(1)}s`));
})();
