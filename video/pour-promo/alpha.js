/* 실제 투명 픽셀을 샘플링해 누끼 여부를 판정한다.
   PNG의 알파 채널 유무만으로는 알 수 없다(문서 스캔도 RGBA로 저장된다). */
const path=require('path');
module.exports = async function measureAlpha(browser, A){
  const page=await browser.newPage();
  await page.goto('file://'+path.resolve(process.env.FILM||'film.html').replace(/[^/]+$/,''),{waitUntil:'domcontentloaded'}).catch(()=>{});
  const files={}; for(const k in A) files[k]=A[k].f;
  const res=await page.evaluate(async(files)=>{
    const out={};
    for(const k in files){
      try{
        const im=new Image(); im.src='assets/'+files[k];
        await im.decode();
        const c=document.createElement('canvas');
        const W=c.width=Math.min(im.naturalWidth,240), H=c.height=Math.min(im.naturalHeight,240);
        const g=c.getContext('2d',{willReadFrequently:true});
        g.drawImage(im,0,0,W,H);
        const d=g.getImageData(0,0,W,H).data;
        /* 누끼 판정: 전체 투명 픽셀 비율 + 네 모서리.
           내용에 맞춰 타이트하게 자른 컷아웃은 테두리가 제품에 닿으므로
           테두리 비율만으로는 놓친다. */
        const at=(x,y)=>d[(y*W+x)*4+3];
        let clear=0;
        for(let q=3;q<d.length;q+=4) if(d[q]<16) clear++;
        const ratio=clear/(W*H);
        const corners=[at(0,0),at(W-1,0),at(0,H-1),at(W-1,H-1)].filter(v=>v<16).length;
        out[k]= ratio>0.08 && corners>=3;
      }catch(e){ out[k]=false; }
    }
    return out;
  }, files);
  await page.close();
  for(const k in res) if(A[k]) A[k].alpha=res[k];
  return A;
};
