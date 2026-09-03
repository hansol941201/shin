/* 모든 텍스트의 '실제 렌더된 배경' 대비 명암비를 측정한다.
   글자를 숨긴 프레임을 찍어 각 글자 영역의 평균 휘도를 재므로,
   그라디언트·사진·반투명 레이어가 겹쳐도 정확하다. */
const {chromium}=require('playwright');const path=require('path');
const STEP=+(process.env.STEP||0.5), MIN=+(process.env.MIN||3.0);
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--allow-file-access-from-files']});
  const p=await b.newPage({viewport:{width:1920,height:1080}});
  const {A}=require('./assets').resolve('assets');
  await require('./alpha')(b,A);
  await p.addInitScript(a=>{window.__ASSETS__=a;},A);
  await p.goto('file://'+path.resolve(process.env.FILM||'film.html'),{waitUntil:'load'});
  await p.evaluate(()=>document.fonts.ready);
  await p.waitForFunction(()=>typeof window.seek==='function');

  await p.evaluate(()=>{
    window.__vis=el=>{ let o=1,n=el;
      while(n&&n!==document.body){ const cs=getComputedStyle(n);
        if(cs.visibility==='hidden'||cs.display==='none') return 0;
        o*=parseFloat(cs.opacity||'1'); n=n.parentElement; }
      return o; };
    window.__collect=()=>{
      const out=[];
      document.querySelectorAll('#stage *, #sub, #mark .m').forEach(el=>{
        const own=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('');
        if(!own || window.__vis(el)<0.85) return;
        if(el.closest('.ph')) return;                 // 플레이스홀더는 제외
        const rg=document.createRange(); rg.selectNodeContents(el);
        const rs=[...rg.getClientRects()].filter(q=>q.width>2&&q.height>2);
        if(!rs.length) return;
        const r={l:Math.min(...rs.map(q=>q.left)),t:Math.min(...rs.map(q=>q.top)),
                 r:Math.max(...rs.map(q=>q.right)),b:Math.max(...rs.map(q=>q.bottom))};
        out.push({tx:own.slice(0,26),color:getComputedStyle(el).color,rect:r,el});
      });
      window.__last=out;
      return out.map(o=>({tx:o.tx,color:o.color,rect:o.rect}));
    };
    /* visibility:hidden 으로 숨기면 그 요소가 가진 배경(자막 알약 등)까지
       사라져 엉뚱한 뒤 배경을 재게 된다. 글자만 투명하게 만든다. */
    window.__hide=()=>{ (window.__last||[]).forEach(o=>{
      o._c=o.el.style.color; o._s=o.el.style.textShadow;
      o.el.style.color='transparent'; o.el.style.textShadow='none'; }); };
    window.__show=()=>{ (window.__last||[]).forEach(o=>{
      o.el.style.color=o._c||''; o.el.style.textShadow=o._s||''; }); };
    window.__measure=async(shot,items)=>{
      const im=new Image(); im.src=shot; await im.decode();
      const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
      const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(im,0,0);
      const lin=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4);};
      return items.map(it=>{
        const x=Math.max(0,Math.round(it.rect.l)), y=Math.max(0,Math.round(it.rect.t));
        const w=Math.max(1,Math.round(it.rect.r-it.rect.l)), h=Math.max(1,Math.round(it.rect.b-it.rect.t));
        const d=g.getImageData(x,y,Math.min(w,c.width-x),Math.min(h,c.height-y)).data;
        let s=0,n=0;
        for(let i=0;i<d.length;i+=4){ s+=0.2126*lin(d[i])+0.7152*lin(d[i+1])+0.0722*lin(d[i+2]); n++; }
        return s/n;
      });
    };
  });

  const total=await p.evaluate(()=>window.__TOTAL__);
  const bad=new Map();
  const lin=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4);};
  for(let t=0;t<total;t+=STEP){
    await p.evaluate(x=>window.seek(x),t);
    const items=await p.evaluate(()=>window.__collect());
    if(!items.length) continue;
    await p.evaluate(()=>window.__hide());
    const buf=await p.screenshot({type:'png'});
    await p.evaluate(()=>window.__show());
    const bgL=await p.evaluate(([shot,its])=>window.__measure(shot,its),
      ['data:image/png;base64,'+buf.toString('base64'), items]);
    items.forEach((it,i)=>{
      const m=it.color.match(/\d+/g).map(Number);
      const fg=0.2126*lin(m[0])+0.7152*lin(m[1])+0.0722*lin(m[2]);
      const bg=bgL[i];
      const ratio=(Math.max(fg,bg)+0.05)/(Math.min(fg,bg)+0.05);
      if(ratio<MIN){
        const k=`"${it.tx}"  색 ${it.color}  대비 ${ratio.toFixed(2)}`;
        if(!bad.has(k)) bad.set(k,[]);
        if(bad.get(k).length<3) bad.get(k).push(t.toFixed(1));
      }
    });
  }
  await b.close();
  console.log(`\n=== 명암비 ${MIN} 미만: ${bad.size}건 ===`);
  [...bad.entries()].forEach(([k,v])=>console.log(`  ${k}   @ ${v.join(', ')}s`));
})().catch(e=>{console.error(e);process.exit(1)});
