const fs=require('fs'),path=require('path');
const {imageSize}=require('image-size');
const SLOTS=['apt_wide_1','diag_1','meet_1','seminar_1','seminar_2','seminar_3','analysis_1',
 'consulting_1','tech_doc_1','cad_1','construction_1','apt_1','apt_2','apt_3','apt_4','apt_5',
 'apt_6','apt_7','apt_8','drone_1','drone_2','data_1','ai_1','review_1','factory_yongin',
 'material_1','material_2','material_3','material_4','kakao_1','rooftop_1','netform_doc',
 'hq_meeting','site_visit','mou_doc','handshake','pour_logo'];
function resolve(dir){
  dir=dir||'assets';
  let files=[]; try{files=fs.readdirSync(dir).filter(f=>/\.(jpg|jpeg|png|webp|gif)$/i.test(f));}catch(e){}
  let map={}; try{map=JSON.parse(fs.readFileSync(path.join(dir,'map.json'),'utf8'));}catch(e){}
  const A={};
  for(const s of SLOTS){
    if(map[s]&&files.includes(map[s])){A[s]=map[s];continue;}
    const hit=files.find(f=>f.toLowerCase().startsWith(s.toLowerCase()+'.')) ||
              files.find(f=>f.toLowerCase().includes(s.toLowerCase()));
    if(hit)A[s]=hit;
  }
  /* 실제 픽셀 크기를 함께 넘겨 틀을 이미지 비율에 맞춘다 (여백/잘림 방지) */
  const out={};
  for(const k in A){
    let w=null,h=null;
    try{ const d=imageSize(fs.readFileSync(path.join(dir,A[k]))); w=d.width; h=d.height; }catch(e){}
    out[k]={f:A[k], w, h};
  }
  return {A:out, have:Object.keys(out), miss:SLOTS.filter(s=>!out[s]), SLOTS};
}
module.exports={SLOTS,resolve};
