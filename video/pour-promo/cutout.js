/* 흰 배경 제거(누끼).
   제품 자체가 흰색이면(파우더 봉투, 페인트 통) 단순 임계값으로는 제품이 지워진다.
   또 밝은 하이라이트가 배경과 얇게 이어져 있으면 flood fill 이 제품 안으로 샌다.
   -> 후보 마스크를 침식해 얇은 통로를 끊고, 테두리에서 채운 뒤, 후보 안에서만 다시 팽창한다. */
const {chromium}=require('playwright');
const path=require('path'),fs=require('fs');
const SRC=process.argv[2], DST=process.argv[3];
if(!SRC||!DST){ console.error('사용법: node cutout.js <입력> <출력>'); process.exit(1); }
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--allow-file-access-from-files']});
  const p=await b.newPage();
  await p.goto('file://'+path.resolve('.')+'/');
  const dataUrl='data:image/'+(SRC.endsWith('.png')?'png':'jpeg')+';base64,'+fs.readFileSync(SRC).toString('base64');
  const out=await p.evaluate(async(src)=>{
    const im=new Image(); im.src=src; await im.decode();
    const W=im.naturalWidth,H=im.naturalHeight,N=W*H;
    const c=document.createElement('canvas'); c.width=W; c.height=H;
    const g=c.getContext('2d',{willReadFrequently:true});
    g.drawImage(im,0,0);
    const d=g.getImageData(0,0,W,H), px=d.data;
    const lum=i=>0.2126*px[i]+0.7152*px[i+1]+0.0722*px[i+2];
    const sat=i=>{const r=px[i],gg=px[i+1],bb=px[i+2];
      const mx=Math.max(r,gg,bb),mn=Math.min(r,gg,bb); return mx? (mx-mn)/mx : 0;};

    const HI=249, LO=226;
    /* 1) 배경 후보 */
    const cand=new Uint8Array(N);
    for(let k=0;k<N;k++){ const i=k*4; if(lum(i)>=LO && sat(i)<=0.14) cand[k]=1; }

    const morph=(src,r,erode)=>{           // r회 침식 또는 팽창 (4-이웃)
      let a=src;
      for(let it=0;it<r;it++){
        const b2=new Uint8Array(N);
        for(let y=0;y<H;y++)for(let x=0;x<W;x++){
          const k=y*W+x;
          const nb=[k, x>0?k-1:k, x<W-1?k+1:k, y>0?k-W:k, y<H-1?k+W:k];
          b2[k]= erode ? (nb.every(q=>a[q])?1:0) : (nb.some(q=>a[q])?1:0);
        }
        a=b2;
      }
      return a;
    };
    /* 2) 얇은 통로를 끊는다 */
    const core=morph(cand,2,true);
    /* 3) 테두리에서 flood fill (침식된 마스크 안에서만) */
    const bg=new Uint8Array(N), st=[];
    const seed=k=>{ if(core[k]&&!bg[k]){ bg[k]=1; st.push(k);} };
    for(let x=0;x<W;x++){ seed(x); seed((H-1)*W+x); }
    for(let y=0;y<H;y++){ seed(y*W); seed(y*W+W-1); }
    while(st.length){
      const k=st.pop(), x=k%W, y=(k/W)|0;
      if(x>0)seed(k-1); if(x<W-1)seed(k+1); if(y>0)seed(k-W); if(y<H-1)seed(k+W);
    }
    /* 4) 후보 범위 안에서만 다시 팽창 — 제품 경계까지 배경을 회복 */
    let cur=bg;
    for(let it=0; it<4; it++){
      const nx=morph(cur,1,false);
      for(let k=0;k<N;k++) if(nx[k]&&!cand[k]) nx[k]=0;
      cur=nx;
    }
    /* 5) 알파 램프 + 흰색 언프리멀티플라이(경계 흰 테두리 제거) */
    let cleared=0;
    for(let k=0;k<N;k++){
      if(!cur[k]) continue;
      const i=k*4, L=lum(i);
      let a = L>=HI ? 0 : Math.min(255, Math.round((HI-L)/(HI-LO)*255));
      if(a===0){ px[i+3]=0; cleared++; continue; }
      const af=a/255;
      for(let ch=0; ch<3; ch++){
        const v=(px[i+ch]-(1-af)*255)/af;
        px[i+ch]=Math.max(0,Math.min(255,Math.round(v)));
      }
      px[i+3]=a;
    }
    g.putImageData(d,0,0);
    /* 6) 내용 경계로 crop */
    let x0=W,y0=H,x1=-1,y1=-1;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      if(px[(y*W+x)*4+3]>8){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
    }
    const cw=x1-x0+1, ch2=y1-y0+1;
    const c2=document.createElement('canvas'); c2.width=cw; c2.height=ch2;
    c2.getContext('2d').drawImage(c,x0,y0,cw,ch2,0,0,cw,ch2);
    /* 제품 내부가 뚫렸는지 점검: 불투명 영역 안의 투명 픽셀 비율 */
    let inner=0;
    for(let y=1;y<ch2-1;y++){
      const row=c2.getContext('2d').getImageData(0,y,cw,1).data;
      let first=-1,last=-1;
      for(let x=0;x<cw;x++){ if(row[x*4+3]>200){ if(first<0)first=x; last=x; } }
      if(first<0) continue;
      for(let x=first;x<=last;x++) if(row[x*4+3]<200) inner++;
    }
    return {png:c2.toDataURL('image/png'), W,H, cw, ch:ch2, cleared, inner};
  }, dataUrl);
  await b.close();
  fs.writeFileSync(DST, Buffer.from(out.png.split(',')[1],'base64'));
  console.log(`${SRC} ${out.W}x${out.H} → ${DST} ${out.cw}x${out.ch}`);
  console.log(`  배경 ${out.cleared}px 제거 · 제품 내부 반투명 ${out.inner}px`);
})();
