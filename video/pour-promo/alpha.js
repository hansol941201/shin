/* 실제 투명 픽셀을 샘플링해 누끼 여부를 판정한다.
   PNG의 알파 채널 유무만으로는 알 수 없다(문서 스캔도 RGBA로 저장된다). */
const path=require('path');
module.exports = async function measureAlpha(browser, A){
  const page=await browser.newPage();
  await page.goto('file://'+path.resolve('film.html').replace(/[^/]+$/,''),{waitUntil:'domcontentloaded'}).catch(()=>{});
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
        /* 테두리 픽셀 중 투명 비율 — 누끼는 가장자리가 비어 있다 */
        let edge=0, clear=0;
        const at=(x,y)=>d[(y*W+x)*4+3];
        for(let x=0;x<W;x++){ for(const y of [0,H-1]){ edge++; if(at(x,y)<16) clear++; } }
        for(let y=0;y<H;y++){ for(const x of [0,W-1]){ edge++; if(at(x,y)<16) clear++; } }
        out[k]= clear/edge > 0.55;
      }catch(e){ out[k]=false; }
    }
    return out;
  }, files);
  await page.close();
  for(const k in res) if(A[k]) A[k].alpha=res[k];
  return A;
};
