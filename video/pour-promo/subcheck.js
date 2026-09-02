/* 모든 자막의 실제 색·대비·줄수·위치를 측정한다 */
const {chromium}=require('playwright');const path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--allow-file-access-from-files']});
  const p=await b.newPage({viewport:{width:1920,height:1080}});
  const {A}=require('./assets').resolve('assets');
  await require('./alpha')(b,A);
  await p.addInitScript(a=>{window.__ASSETS__=a;},A);
  await p.goto('file://'+path.resolve(process.env.FILM||'film.html'),{waitUntil:'load'});
  await p.evaluate(()=>document.fonts.ready);
  await p.waitForFunction(()=>typeof window.seek==='function');
  const total=await p.evaluate(()=>window.__TOTAL__);
  const rows=await p.evaluate(async(total)=>{
    const out=[], seen=new Set(), el=document.getElementById('sub');
    for(let t=0;t<total;t+=0.1){
      window.seek(t);
      if(parseFloat(getComputedStyle(el).opacity)<0.85) continue;
      const tx=el.textContent; if(!tx||seen.has(tx)) continue; seen.add(tx);
      const cs=getComputedStyle(el), r=el.getBoundingClientRect();
      const lh=parseFloat(cs.lineHeight), lines=Math.round(r.height-44)/lh;
      out.push({t:+t.toFixed(1),tx,color:cs.color,bg:cs.backgroundColor,
        fs:cs.fontSize,fw:cs.fontWeight,lines:Math.round(lines),
        top:Math.round(r.top),bottom:Math.round(1080-r.bottom),w:Math.round(r.width)});
    }
    return out;
  }, total);
  await b.close();
  const lum=c=>{const m=c.match(/\d+/g).map(Number);return (0.2126*m[0]+0.7152*m[1]+0.0722*m[2])/255;};
  const bad=rows.filter(r=>lum(r.color)<0.8 || r.lines>2 || r.bottom<110);
  console.log(`자막 ${rows.length}줄 검사`);
  const s0=rows[0];
  console.log(`규격: color ${s0.color} / bg ${s0.bg} / ${s0.fs} / weight ${s0.fw} / 하단 ${s0.bottom}px`);
  const two=rows.filter(r=>r.lines>=2);
  console.log(`2줄 자막 ${two.length}개, 최대 폭 ${Math.max(...rows.map(r=>r.w))}px, 최소 top ${Math.min(...rows.map(r=>r.top))}px`);
  two.forEach(r=>console.log(`   [2줄] ${r.t}s  w=${r.w} top=${r.top}  "${r.tx}"`));
  console.log(`문제 ${bad.length}건`);
  bad.slice(0,10).forEach(r=>console.log(`  ${r.t}s "${r.tx.slice(0,24)}" color=${r.color} lines=${r.lines} bottom=${r.bottom}`));
})();
