/* ===== POUR B2B film — deterministic timeline renderer ===== */
const AVAILABLE = window.__ASSETS__ || {};      // slot -> filename (injected by renderer)
const RATE = 9.2;                                // chars/sec narration pace
const PAD  = 0.22;                               // pause after each line

const stage = document.getElementById('stage');
const subEl = document.getElementById('sub');
const progEl= document.getElementById('prog');

/* ---------- easing ---------- */
const c01 = x => x<0?0:x>1?1:x;
const outCubic = t => 1-Math.pow(1-t,3);
const outQuint = t => 1-Math.pow(1-t,5);
const outExpo  = t => t>=1?1:1-Math.pow(2,-11*t);
const outBack  = t => t<=0?0 : t>=1?1 : 1+2.4*Math.pow(t-1,3)+1.4*Math.pow(t-1,2);
const inOut    = t => t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

/* ---------- painters ---------- */
const painters = [];
const reg = fn => painters.push(fn);

/* ---------- narration ---------- */
const SCRIPT = [
 { id:'s1', lines:[
   '시공사가 새로운 공법을 찾는 이유는 분명합니다.',
   '더 나은 현장을 만들고,',
   '새로운 기회를 준비하고,',
   '시장에서 경쟁력을 갖추기 위해서입니다.',
   '하지만 좋은 기술을 선택하는 것만으로',
   '모든 가능성이 현실이 되는 것은 아닙니다.',
   '현장에 적합한 기술을 검토하고,',
   '필요한 자료와 적용 방안을 준비해',
   '실제 시공까지 연결하는 과정이 필요합니다.',
   'POUR는 기술이 현장에 닿기까지의 과정을 생각합니다.' ]},
 { id:'s2', lines:[
   '260만 세대의 현장에서 쌓아온 경험과 데이터를 바탕으로',
   '현장의 조건과 요구사항을 먼저 살펴봅니다.',
   '같은 공법이라도 현장의 적용 환경과 공정 조건에 따라',
   '요구되는 기술과 기준은 달라집니다.',
   'POUR는 축적된 경험을 바탕으로',
   '각 현장에 적합한 적용 방향을 찾아갑니다.' ]},
 { id:'s3', lines:[
   'POUR는 기술과 자재만 제공하지 않습니다.',
   '기술개발과 자재 생산부터 공사 전·중·후 현장관리까지.',
   '높은 선정률로 이어지는 공법설명회를 진행하고,',
   '각 현장에 맞는 기술자료를 체계적으로 기획·제작합니다.',
   '각 분야의 전문가와 AI 디지털 기술을 연결해',
   '현장에 필요한 정보를 정밀하게 분석하고,',
   '기술검토의 정확도와 지원의 속도를 높입니다.',
   '시공사의 판단은 더 명확하게,',
   '현장 대응과 제안의 완성도는 한 단계 높아지도록.',
   'POUR의 60명 전문 인력이',
   '하나의 현장을 중심으로 함께 움직입니다.',
   '이것이 POUR의 지원 체계입니다.' ]},
 { id:'s4', lines:[
   'POUR와의 협력은 서로의 방향을 확인하는 것에서 시작합니다.',
   '첫 번째는 POUR 본사 미팅입니다.',
   'POUR의 기술 운영 방식과 현장 지원 체계를 소개하고,',
   '협력을 위한 기본 방향을 함께 정리합니다.',
   '두 번째는 시공사 방문 미팅입니다.',
   'POUR가 직접 방문해 시공사의 주요 사업과 현장 운영 방향을 듣고',
   'POUR 공법의 적용 방식과 지원 내용을 구체적으로 설명합니다.',
   '두 차례의 만남을 통해 협력의 기준이 마련되면',
   '세 번째 단계로 MOU를 체결합니다.' ]},
 { id:'s5', lines:[
   '좋은 공법의 기준은 결국 현장에서 이기는 것입니다.',
   '선택되고, 적용되고,',
   '수주와 실적으로 이어져야 합니다.',
   '더 많이 수주하고,',
   '더 많은 실적을 만들 수 있도록.',
   '기술부터 영업, 현장 적용까지',
   '시공사가 이길 수 있는 모든 과정에',
   'POUR가 함께합니다.' ]},
];

/* build cue table: L(sceneId, idx) -> start time ; scene bounds */
const CUE = {}, SCN = {};
let clock = 0;
for (const s of SCRIPT){
  const start = clock, arr = [];
  s.lines.forEach((tx,i)=>{
    const d = Math.max(1.05, tx.replace(/\s/g,'').length / RATE) + PAD;
    arr.push({tx, t0:clock, t1:clock+d});
    clock += d;
  });
  CUE[s.id] = arr;
  SCN[s.id] = {t0:start, t1:clock};
}
const OUTRO = 3.4;                 // final logo hold after last line
const TOTAL = clock + OUTRO;
SCN.fin = {t0:clock, t1:TOTAL};
const L = (s,i) => CUE[s][i].t0;
const LE= (s,i) => CUE[s][i].t1;

/* ---------- DOM helpers ---------- */
function mk(tag, cls, css, parent, html){
  const e=document.createElement(tag);
  if(cls) e.className=cls;
  if(css) Object.assign(e.style, css);
  if(html!=null) e.innerHTML=html;
  (parent||stage).appendChild(e);
  return e;
}
const UNITLESS=new Set(['fontWeight','opacity','zIndex','lineHeight','flex','flexGrow','flexShrink','order','zoom']);
function px(o){ const r={}; for(const k in o) r[k]=(typeof o[k]==='number'&&!UNITLESS.has(k))?o[k]+'px':String(o[k]); return r; }

/* image slot: real asset if present, else labelled placeholder (never AI-substituted) */
function slot(parent, key, label, css, fit){
  const wrap = mk('div','', Object.assign({position:'absolute',overflow:'hidden'}, px(css||{})), parent);
  const f = AVAILABLE[key];
  if(f){
    const i = mk('img','',{width:'100%',height:'100%',objectFit:fit||'cover',display:'block'},wrap);
    i.src = 'assets/'+f;
  } else {
    mk('div','ph',{},wrap,`<div class="t">${label}</div><div class="s">원본 이미지 필요 · ${key}</div>`);
  }
  return wrap;
}

/* ---------- animation primitives ---------- */
function fade(el,t0,d,t1,d1){
  reg(T=>{ let o=outCubic(c01((T-t0)/d));
    if(t1!=null) o*= 1-c01((T-t1)/(d1||.35));
    el.style.opacity=o; });
}
function rise(el,t0,o={}){
  const d=o.d||.62, dy=o.dy!==undefined?o.dy:34, dx=o.dx||0, s0=o.s0||1, ez=o.ez||outQuint;
  reg(T=>{
    const p=c01((T-t0)/d), e=ez(p);
    let o2=outCubic(c01((T-t0)/(d*.62)));
    if(o.out!=null) o2*=1-c01((T-o.out)/(o.outD||.4));
    el.style.opacity=o2;
    el.style.transform=`translate(${(dx*(1-e)).toFixed(2)}px,${(dy*(1-e)).toFixed(2)}px) scale(${(s0+(1-s0)*e).toFixed(4)})`;
  });
}
function pop(el,t0,o={}){ rise(el,t0,Object.assign({d:.55,dy:16,s0:.86,ez:outBack},o)); }
function kenburns(el,t0,t1,from,to,ox,oy){
  reg(T=>{ const p=inOut(c01((T-t0)/(t1-t0)));
    el.style.transformOrigin=(ox||'50%')+' '+(oy||'50%');
    el.style.transform=`scale(${(from+(to-from)*p).toFixed(4)})`; });
}
function drawLine(el,t0,d,len){
  el.style.strokeDasharray=len; 
  reg(T=>{ const e=outQuint(c01((T-t0)/(d||.5)));
    el.style.strokeDashoffset=(len*(1-e)).toFixed(2);
    el.style.opacity=c01((T-t0)/.2); });
}
function scene(id){
  const s=mk('div','scene'); s.id=id;
  const b=SCN[id];
  reg(T=>{
    const inn=c01((T-(b.t0-.35))/.55), out=1-c01((T-(b.t1-.30))/.45);
    const o=Math.min(inn,out);
    s.style.opacity=o;
    s.style.visibility = o<=0.001 ? 'hidden':'visible';
  });
  return s;
}

/* FINAL overlaps the tail of scene 5 */
SCN.s5.t1 = L('s5',5)+0.10;
SCN.fin.t0 = L('s5',5)-0.10;

function sub(parent, ta, tb){
  const g = mk('div','',{position:'absolute',inset:'0',opacity:0},parent);
  reg(T=>{ const o=Math.min(outCubic(c01((T-ta)/.42)), 1-c01((T-(tb-.30))/.38));
    g.style.opacity=o; g.style.visibility=o<=.001?'hidden':'visible'; });
  return g;
}
function chip(parent,text,x,y,t,size){
  const c=mk('div','chip el',px({left:x,top:y}),parent,
    `<div class="bar" style="height:${(size||60)*.86}px"></div><div class="tx" style="font-size:${size||60}px">${text}</div>`);
  rise(c,t,{d:.62,dy:26,dx:-18}); return c;
}
function keyRow(parent,text,x,y,t,size){
  const r=mk('div','row el',px({left:x,top:y}),parent,
    `<div class="k"></div><div class="t" style="font-size:${size||40}px">${text}</div>`);
  rise(r,t,{d:.55,dy:18,dx:-14}); return r;
}
function sectionLabel(parent,text,t,sub2){
  const w=mk('div','el',px({left:120,top:150}),parent,
    `<div class="kicker" style="margin-bottom:16px">${sub2||'POUR SUPPORT'}</div>
     <div class="h2">${text}</div>`);
  rise(w,t,{d:.7,dy:24,dx:-16}); return w;
}

/* ============================ SCENE 1 ============================ */
(function(){
  const S=scene('s1'), B=SCN.s1;
  const bg=mk('div','bg',{},S); slot(bg,'apt_wide_1','대단지 아파트 전경',{left:0,top:0,width:'100%',height:'100%'});
  kenburns(bg,B.t0,B.t1,1.05,1.19);
  mk('div','veil v-navy',{},S);
  const wm=mk('div','wm el',{},S,'<div class="m">POUR</div><div class="r"></div>');
  fade(wm,B.t0+.2,.8);

  /* --- phase A : 3 keywords + 3 field cards --- */
  const A=sub(S,B.t0,L('s1',4)+.30);
  const k=mk('div','el',px({left:120,top:322}),A,'<div class="kicker">새로운 공법을 찾는 이유</div>');
  rise(k,L('s1',0)+.25,{d:.6,dy:18,dx:-14});
  chip(A,'더 나은 현장',120,392,L('s1',1));
  chip(A,'새로운 기회',120,506,L('s1',2));
  chip(A,'시장 경쟁력',120,620,L('s1',3));

  const cards=[['diag_1','현장진단'],['meet_1','시공사 협의'],['seminar_1','공법설명회']];
  cards.forEach(([key,cap],i)=>{
    const c=mk('div','card el',px({left:1150+i*0,top:250+i*212,width:600,height:190}),A);
    slot(c,key,cap,{left:0,top:0,width:'100%',height:'100%'});
    mk('div','cap',{},c,cap);
    rise(c,L('s1',1)+.32+i*.30,{d:.7,dy:0,dx:70,s0:.96});
  });

  /* --- phase B : 4-step process chain --- */
  const Bp=sub(S,L('s1',5)-.10,B.t1);
  mk('div','veil v-deep',{opacity:.55},Bp);
  const hd=mk('div','el',px({left:120,top:168}),Bp,
    '<div class="kicker">기술이 현장에 닿기까지</div>');
  rise(hd,L('s1',5),{d:.6,dy:18,dx:-14});
  const steps=[['기술 검토','analysis_1','현장분석'],['자료 준비','consulting_1','컨설팅 내역서'],
               ['적용 방안','cad_1','CAD 도면'],['실제 시공','construction_1','시공 현장']];
  const ST=[L('s1',6),L('s1',7),L('s1',7)+.92,L('s1',8)+.55];
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); Bp.appendChild(svg);
  steps.forEach((s,i)=>{
    const x=176+i*400;
    const g=mk('div','el',px({left:x,top:300,width:344}),Bp);
    const th=mk('div','card',px({position:'relative',width:344,height:214,left:0,top:0}),g);
    slot(th,s[1],s[2],{left:0,top:0,width:'100%',height:'100%'});
    mk('div','',px({marginTop:26,fontSize:38,fontWeight:800,color:'#fff',letterSpacing:'-.03em'}),g,s[0]);
    mk('div','',px({marginTop:8,fontSize:20,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.10em'}),g,'0'+(i+1));
    rise(g,ST[i],{d:.66,dy:34,s0:.94});
    if(i<3){
      const ln=document.createElementNS('http://www.w3.org/2000/svg','line');
      ln.setAttribute('x1',x+344+14); ln.setAttribute('x2',x+400-14);
      ln.setAttribute('y1',407); ln.setAttribute('y2',407);
      ln.setAttribute('stroke','#2F7BE8'); ln.setAttribute('stroke-width',4); ln.setAttribute('stroke-linecap','round');
      svg.appendChild(ln); drawLine(ln,ST[i]+.42,.34,44);
    }
  });
  const tail=mk('div','el',px({left:0,top:700,width:1920,textAlign:'center'}),Bp,
    '<div style="font-size:52px;font-weight:800;color:#fff;letter-spacing:-.035em">기술 <span style="color:#2F7BE8">→</span> 현장</div>');
  rise(tail,L('s1',9),{d:.7,dy:22,s0:.94});
})();

/* ============================ SCENE 2 ============================ */
(function(){
  const S=scene('s2'), B=SCN.s2;
  const bg=mk('div','bg',{},S); slot(bg,'apt_wide_1','대단지 아파트 전경',{left:0,top:0,width:'100%',height:'100%'});
  kenburns(bg,B.t0,B.t1,1.16,1.03);
  mk('div','veil v-deep',{},S);

  /* --- rapid count-up --- */
  const MIL=[0,18500,73200,184000,420000,870000,1340000,1920000,2310000,2570000,2600000];
  const CT0=B.t0+.18, CD=1.35;
  const wrapN=mk('div','el',px({left:0,top:300,width:1920,textAlign:'center'}),S);
  const nEl=mk('div','num',px({fontSize:210,lineHeight:'1'}),wrapN,'0');
  const uEl=mk('div','el',px({left:0,top:552,width:1920,textAlign:'center',fontSize:56,fontWeight:700,
              color:'#5AA0FF',letterSpacing:'.30em'}),S,'세대');
  const rule=mk('div','el',px({left:810,top:640,width:300,height:5,background:'#2F7BE8',transformOrigin:'50% 50%'}),S);
  reg(T=>{
    const p=c01((T-CT0)/CD);
    const idx=Math.min(MIL.length-1, Math.floor(Math.pow(p,.62)*(MIL.length-1)+1e-6));
    nEl.textContent=MIL[idx].toLocaleString('en-US');
    const app=outCubic(c01((T-CT0)/.28));
    const snap=c01((T-(CT0+CD))/.30);
    const kick=snap<1 ? 1+0.11*Math.sin(snap*Math.PI) : 1;
    wrapN.style.opacity=app*(1-c01((T-(CT0+2.55))/.42));
    wrapN.style.transform=`scale(${(0.92+0.08*app)*kick})`;
    nEl.style.color = p>=1 ? '#FFFFFF' : 'rgba(255,255,255,.88)';
  });
  fade(uEl,CT0+CD-.05,.34,CT0+2.55,.42);
  reg(T=>{ const e=outQuint(c01((T-(CT0+CD))/.45));
    rule.style.opacity=e*(1-c01((T-(CT0+2.55))/.42));
    rule.style.transform=`scaleX(${e.toFixed(3)})`; });

  const badge=mk('div','el',px({left:120,top:150}),S,
    '<div class="kicker" style="margin-bottom:12px">경험과 데이터</div>'+
    '<div style="font-size:64px;font-weight:900;color:#fff;letter-spacing:-.04em;font-variant-numeric:tabular-nums">'+
    '2,600,000<span style="font-size:34px;font-weight:700;color:#5AA0FF;margin-left:14px;letter-spacing:.1em">세대</span></div>');
  rise(badge,CT0+2.45,{d:.6,dy:-16,dx:-14,out:L('s2',4)-.15,outD:.4});

  /* --- site mosaic fills --- */
  const M=sub(S,CT0+2.6,L('s2',2)+.15);
  const tiles=[[200,300,440,400],[660,300,600,400],[1280,300,440,400],
               [200,720,288,250],[508,720,288,250],[816,720,288,250],[1124,720,288,250],[1432,720,288,250]];
  const MT=[0,.26,.52,.86,1.02,1.18,1.34,1.50];
  tiles.forEach((t,i)=>{
    const c=mk('div','card el',px({left:t[0],top:t[1],width:t[2],height:t[3]}),M);
    slot(c,'apt_'+(i+1),'아파트 현장 '+(i+1),{left:0,top:0,width:'100%',height:'100%'});
    pop(c,CT0+2.75+MT[i],{d:.5,dy:22,s0:.9});
  });
  const mcap=mk('div','el',px({left:120,top:170}),M,
    '<div class="kicker">전국 아파트 현장</div>');
  rise(mcap,CT0+2.9,{d:.5,dy:14,dx:-12});

  /* --- diagnosis / conditions --- */
  const D=sub(S,L('s2',2)+.05,L('s2',4)-.05);
  const big=mk('div','card el',px({left:900,top:210,width:900,height:660}),D);
  slot(big,'drone_1','드론 외벽진단 / 현장분석',{left:0,top:0,width:'100%',height:'100%'});
  rise(big,L('s2',2)+.12,{d:.75,dy:0,dx:56,s0:.96});
  const dk=mk('div','el',px({left:120,top:236}),D,'<div class="kicker">현장 진단</div>');
  rise(dk,L('s2',2)+.15,{d:.5,dy:14,dx:-12});
  ['외벽 상태','적용 환경','공정 조건','현장 요구사항'].forEach((t,i)=>
    keyRow(D,t,120,320+i*104,L('s2',2)+.42+i*.46,42));

  /* --- conclusion flow --- */
  const F=sub(S,L('s2',4)-.10,B.t1);
  const fl=[['경험 · 데이터',L('s2',4)],['현장 분석',L('s2',4)+.85],['적합한 적용 방향',L('s2',5)+.35]];
  fl.forEach(([t,tt],i)=>{
    const e=mk('div','el',px({left:0,top:300+i*168,width:1920,textAlign:'center',
      fontSize:i===2?68:56,fontWeight:i===2?900:800,color:i===2?'#fff':'rgba(255,255,255,.86)',letterSpacing:'-.035em'}),F,t);
    rise(e,tt,{d:.6,dy:26,s0:.95});
    if(i>0){
      const a=mk('div','el',px({left:0,top:246+i*168,width:1920,textAlign:'center',
        fontSize:34,color:'#2F7BE8',fontWeight:800}),F,'↓');
      fade(a,tt-.18,.3);
    }
  });
})();

/* ============================ SCENE 3 ============================ */
(function(){
  const S=scene('s3'), B=SCN.s3, C=i=>L('s3',i);

  /* ---- 3-1 기술개발 · 자재생산 (용인공장 full bleed) ---- */
  const A=sub(S,B.t0-.05,C(2)-.15);
  const bgA=mk('div','bg',{},A); slot(bgA,'factory_yongin','용인공장 전경',{left:0,top:0,width:'100%',height:'100%'});
  kenburns(bgA,B.t0,C(2),1.04,1.14);
  mk('div','veil',{background:'linear-gradient(180deg,rgba(10,27,51,.86) 0%,rgba(10,27,51,.62) 40%,rgba(10,27,51,.93) 100%)'},A);
  sectionLabel(A,'기술개발 · 자재생산',B.t0+.10,'POUR SUPPORT 01');
  const mats=[['material_1','POUR 자재 ①'],['material_2','POUR 자재 ②'],['material_3','POUR 자재 ③'],['material_4','POUR 자재 ④']];
  mats.forEach(([k,lb],i)=>{
    const p=mk('div','pedestal el',px({left:214+i*376,top:520,width:340,height:400}),A);
    slot(p,k,lb,{left:'9%',top:'13%',width:'82%',height:'74%'},'contain');
    rise(p,C(1)-.15+i*.30,{d:.62,dy:46,s0:.86,ez:outBack});
  });

  /* ---- 3-2 공법설명회 ---- */
  const Bx=sub(S,C(2)-.15,C(3)-.15);
  mk('div','veil v-deep',{},Bx);
  sectionLabel(Bx,'공법설명회',C(2)-.05,'POUR SUPPORT 02');
  [['seminar_1','공법설명회 현장'],['seminar_2','공법설명회 발표'],['seminar_3','시공사 참석']].forEach(([k,lb],i)=>{
    const c=mk('div','card el',px({left:200+i*524,top:392,width:496,height:440}),Bx);
    slot(c,k,lb,{left:0,top:0,width:'100%',height:'100%'});
    mk('div','cap',{},c,lb);
    rise(c,C(2)+.42+i*.36,{d:.6,dy:38,s0:.93});
  });

  /* ---- 3-3 기술자료 (stacking) ---- */
  const Cx=sub(S,C(3)-.15,C(4)-.15);
  mk('div','veil v-deep',{},Cx);
  sectionLabel(Cx,'현장 맞춤 기술자료',C(3)-.05,'POUR SUPPORT 03');
  [['consulting_1','컨설팅 내역서'],['tech_doc_1','기술자료'],['cad_1','CAD 도면']].forEach(([k,lb],i)=>{
    const c=mk('div','card el',px({left:640+i*220,top:330+i*74,width:640,height:452,zIndex:10+i}),Cx);
    slot(c,k,lb,{left:0,top:0,width:'100%',height:'100%'});
    mk('div','cap',{},c,lb);
    rise(c,C(3)+.10+i*.62,{d:.6,dy:44,dx:-30,s0:.94});
    const t=mk('div','el',px({left:190,top:404+i*94,fontSize:34,fontWeight:700,color:'#fff'}),Cx,'· '+lb);
    rise(t,C(3)+.16+i*.62,{d:.5,dy:16,dx:-12});
  });

  /* ---- 3-4 AI · 디지털 ---- */
  const Dx=sub(S,C(4)-.15,C(6)+.55);
  const bgD=mk('div','bg',{},Dx); slot(bgD,'drone_1','드론 외벽진단',{left:0,top:0,width:'100%',height:'100%'});
  kenburns(bgD,C(4),C(6)+.55,1.14,1.02);
  mk('div','veil v-navy',{},Dx);
  sectionLabel(Dx,'정확한 기술검토<br>빠른 현장지원',C(4)-.05,'POUR SUPPORT 04');
  const dsteps=[['드론 현장진단','drone_2','드론 촬영'],['현장 데이터','data_1','현장 데이터'],
                ['AI 분석','ai_1','AI 분석'],['기술검토','review_1','기술검토']];
  const svgD=document.createElementNS('http://www.w3.org/2000/svg','svg'); Dx.appendChild(svgD);
  dsteps.forEach((s,i)=>{
    const y=402+i*152, tt=C(4)+.45+i*.85;
    const g=mk('div','el',px({left:980,top:y,width:800,height:126}),Dx);
    const bx=mk('div','box',px({position:'absolute',left:0,top:0,width:800,height:126}),g);
    const th=mk('div','',px({position:'absolute',left:14,top:14,width:170,height:98,borderRadius:8,overflow:'hidden'}),bx);
    slot(th,s[1],s[2],{left:0,top:0,width:'100%',height:'100%'});
    mk('div','',px({position:'absolute',left:210,top:38,fontSize:38,fontWeight:800,color:'#fff',letterSpacing:'-.03em'}),bx,s[0]);
    mk('div','',px({position:'absolute',right:26,top:44,fontSize:22,fontWeight:700,color:'rgba(90,160,255,.85)',letterSpacing:'.14em'}),bx,'0'+(i+1));
    rise(g,tt,{d:.6,dy:0,dx:56,s0:.97});
    if(i<3){
      const ln=document.createElementNS('http://www.w3.org/2000/svg','line');
      ln.setAttribute('x1',1060);ln.setAttribute('x2',1060);
      ln.setAttribute('y1',y+126);ln.setAttribute('y2',y+152);
      ln.setAttribute('stroke','#2F7BE8');ln.setAttribute('stroke-width',3);
      svgD.appendChild(ln); drawLine(ln,tt+.44,.28,26);
    }
  });

  /* ---- 3-5 공사 전 · 중 · 후 ---- */
  const Ex=sub(S,C(6)+.45,C(8)+1.30);
  mk('div','veil v-deep',{},Ex);
  sectionLabel(Ex,'공사 전 · 중 · 후 현장관리',C(6)+.55,'POUR SUPPORT 05');
  const phs=[['공사 전','kakao_1','현장 공유 커뮤니케이션'],['공사 중','rooftop_1','옥상 방수 도장 작업'],['공사 후','netform_doc','NETFORM 준공 공문']];
  const svgE=document.createElementNS('http://www.w3.org/2000/svg','svg'); Ex.appendChild(svgE);
  phs.forEach(([t,k,lb],i)=>{
    const x=136+i*568, tt=C(6)+1.00+i*.50;
    const g=mk('div','el',px({left:x,top:372,width:512,height:496}),Ex);
    const bx=mk('div','box',px({position:'absolute',left:0,top:0,width:512,height:496}),g);
    mk('div','hd',{},bx,`<div class="dot"></div><div class="t">${t}</div>`);
    const md=mk('div','media',px({height:352}),bx);
    slot(md,k,lb,{left:0,top:0,width:'100%',height:'100%'}, k==='netform_doc'?'contain':'cover');
    rise(g,tt,{d:.58,dy:38,s0:.93});
    if(i<2){
      const ar=mk('div','el',px({left:x+512+8,top:594,fontSize:40,color:'#2F7BE8',fontWeight:800,width:48,textAlign:'center'}),Ex,'→');
      fade(ar,tt+.40,.28);
    }
  });

  /* ---- 3-6 60명 전문 인력 ---- */
  const Fx=sub(S,C(8)+1.20,B.t1);
  mk('div','veil v-deep',{},Fx);
  const W0=C(8)+1.25;
  const hub=mk('div','',{position:'absolute',inset:'0'},Fx);
  reg(T=>{ hub.style.opacity=1-c01((T-(C(10)-.30))/.34); });
  const svgF=document.createElementNS('http://www.w3.org/2000/svg','svg'); hub.appendChild(svgF);
  const CX=960, CY=540;
  const cen=mk('div','el',px({left:CX-140,top:CY-58,width:280,height:116,borderRadius:12,
    background:'#2F7BE8',display:'flex',alignItems:'center',justifyContent:'center',
    fontSize:38,fontWeight:800,color:'#fff',letterSpacing:'-.03em',boxShadow:'0 20px 60px rgba(47,123,232,.45)'}),hub,'하나의 현장');
  pop(cen,W0,{d:.5});
  const sat=['기술개발','자재생산','공법설명회','기술자료','AI 분석','현장관리','기술지원','영업지원'];
  sat.forEach((t,i)=>{
    const a=(-90+i*45)*Math.PI/180, rx=560, ry=352;
    const x=CX+Math.cos(a)*rx, y=CY+Math.sin(a)*ry, tt=W0+.25+i*.17;
    const ln=document.createElementNS('http://www.w3.org/2000/svg','line');
    const ux=(x-CX), uy=(y-CY), d=Math.hypot(ux,uy);
    const x1=CX+ux/d*78, y1=CY+uy/d*62, x2=CX+ux/d*(d-46), y2=CY+uy/d*(d-46);
    ln.setAttribute('x1',x1);ln.setAttribute('y1',y1);ln.setAttribute('x2',x2);ln.setAttribute('y2',y2);
    ln.setAttribute('stroke','rgba(90,160,255,.55)');ln.setAttribute('stroke-width',2);
    svgF.appendChild(ln); drawLine(ln,tt,.30,Math.hypot(x2-x1,y2-y1));
    const n=mk('div','el',px({left:x-108,top:y-32,width:216,height:64,borderRadius:32,
      background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.22)',
      display:'flex',alignItems:'center',justifyContent:'center',fontSize:27,fontWeight:700,color:'#fff'}),hub,t);
    pop(n,tt+.16,{d:.44});
  });
  const big60=mk('div','el',px({left:0,top:246,width:1920,textAlign:'center',fontSize:250,fontWeight:900,
    color:'#fff',letterSpacing:'-.05em',lineHeight:'1'}),Fx,'60');
  rise(big60,C(10)-.20,{d:.5,dy:0,s0:.7,ez:outBack});
  const lbl60=mk('div','el',px({left:0,top:534,width:1920,textAlign:'center',fontSize:60,fontWeight:800,
    color:'#5AA0FF',letterSpacing:'-.03em'}),Fx,'60명 전문 인력');
  rise(lbl60,C(10)+.24,{d:.5,dy:22});
  const mv=mk('div','el',px({left:0,top:636,width:1920,textAlign:'center',fontSize:36,fontWeight:600,
    color:'rgba(255,255,255,.80)',letterSpacing:'-.025em'}),Fx,'하나의 현장을 중심으로 함께 움직입니다.');
  rise(mv,C(10)+.72,{d:.5,dy:18});
  const fin3=mk('div','el',px({left:0,top:742,width:1920,textAlign:'center'}),Fx,
    '<span style="display:inline-block;padding:16px 44px;border:2px solid #2F7BE8;border-radius:50px;'+
    'font-size:42px;font-weight:800;color:#fff;letter-spacing:-.03em">POUR 통합 지원 체계</span>');
  rise(fin3,C(11)+.15,{d:.55,dy:24,s0:.94});
})();

/* ============================ SCENE 4 ============================ */
(function(){
  const S=scene('s4'), B=SCN.s4, C=i=>L('s4',i);
  mk('div','veil',{background:'linear-gradient(180deg,#0A1B33 0%,#0F2647 100%)'},S);

  const rail=[['01','POUR 본사 미팅'],['02','시공사 방문 미팅'],['03','MOU 체결']];
  const CHK=[C(3)+.95, C(6)+1.50, C(8)+1.20];
  const ACT=[C(1)-.15, C(4)-.15, C(7)-.15];
  rail.forEach(([n,t],i)=>{
    const x=132+i*572;
    const g=mk('div','el',px({left:x,top:132,width:540}),S);
    const bar=mk('div','',px({width:540,height:4,background:'rgba(255,255,255,.16)',borderRadius:2,marginBottom:22}),g);
    const fill=mk('div','',px({width:0,height:4,background:'#2F7BE8',borderRadius:2}),bar);
    const rw=mk('div','',px({display:'flex',alignItems:'baseline',gap:16}),g);
    const num=mk('div','',px({fontSize:34,fontWeight:900,color:'rgba(255,255,255,.35)',letterSpacing:'.06em'}),rw,n);
    const lb=mk('div','',px({fontSize:30,fontWeight:700,color:'rgba(255,255,255,.42)',letterSpacing:'-.03em'}),rw,t);
    const ck=mk('div','',px({fontSize:30,fontWeight:900,color:'#2F7BE8',opacity:0}),rw,'✓');
    rise(g,B.t0+.15+i*.14,{d:.6,dy:16});
    reg(T=>{
      const on=T>=ACT[i], done=T>=CHK[i];
      const p=c01((T-ACT[i])/(CHK[i]-ACT[i]));
      fill.style.width=(540*outCubic(p)).toFixed(1)+'px';
      num.style.color = done?'#2F7BE8' : on?'#fff':'rgba(255,255,255,.35)';
      lb.style.color  = on?'#fff':'rgba(255,255,255,.42)';
      ck.style.opacity= outBack(c01((T-CHK[i])/.34));
    });
  });
  const intro=mk('div','el',px({left:0,top:470,width:1920,textAlign:'center'}),S,
    '<div class="kicker" style="margin-bottom:20px">COOPERATION PROCESS</div>'+
    '<div style="font-size:76px;font-weight:800;color:#fff;letter-spacing:-.04em">협력 프로세스</div>');
  rise(intro,B.t0+.30,{d:.7,dy:26,s0:.95,out:C(1)-.35,outD:.4});

  /* STEP 01 */
  const P1=sub(S,C(1)-.15,C(4)-.15);
  const c1=mk('div','card el',px({left:132,top:346,width:800,height:520}),P1);
  slot(c1,'hq_meeting','POUR 본사 미팅',{left:0,top:0,width:'100%',height:'100%'});
  rise(c1,C(1),{d:.7,dy:0,dx:-56,s0:.96});
  const h1=mk('div','el',px({left:1006,top:340,fontSize:46,fontWeight:800,color:'#fff',letterSpacing:'-.035em'}),P1,'POUR 본사 미팅');
  rise(h1,C(1)+.12,{d:.6,dy:20,dx:14});
  ['기술 운영 방식','현장 지원 체계','협력 방향'].forEach((t,i)=>
    keyRow(P1,t,1006,452+i*106,C(2)+.05+i*.72,42));

  /* STEP 02 */
  const P2=sub(S,C(4)-.15,C(7)-.15);
  const c2=mk('div','card el',px({left:988,top:346,width:800,height:520}),P2);
  slot(c2,'site_visit','시공사 방문 미팅',{left:0,top:0,width:'100%',height:'100%'});
  rise(c2,C(4),{d:.7,dy:0,dx:56,s0:.96});
  const h2=mk('div','el',px({left:132,top:328,fontSize:46,fontWeight:800,color:'#fff',letterSpacing:'-.035em'}),P2,'시공사 방문 미팅');
  rise(h2,C(4)+.12,{d:.6,dy:20,dx:-14});
  ['주요 사업','현장 운영 방향','POUR 적용 방식','지원 내용'].forEach((t,i)=>
    keyRow(P2,t,132,436+i*104,C(5)+.05+i*.78,42));

  /* STEP 03 — 실제 MOU 문서 */
  const P3=sub(S,C(7)-.15,B.t1);
  const h3=mk('div','el',px({left:0,top:300,width:1920,textAlign:'center',fontSize:46,fontWeight:800,
    color:'#fff',letterSpacing:'-.035em'}),P3,'MOU 체결');
  rise(h3,C(7)+.10,{d:.6,dy:20});
  const doc=mk('div','pedestal el',px({left:660,top:372,width:600,height:560}),P3);
  slot(doc,'mou_doc','POUR공법 특허 사용<br>MOU 체결서',{left:'6%',top:'5%',width:'88%',height:'90%'},'contain');
  rise(doc,C(7)+.60,{d:.8,dy:26,s0:.86,ez:outBack});
  const hs=mk('div','card el',px({left:1310,top:640,width:400,height:292}),P3);
  slot(hs,'handshake','악수 (협약 체결)',{left:0,top:0,width:'100%',height:'100%'});
  rise(hs,C(8)+.25,{d:.6,dy:0,dx:44,s0:.92});
  const t3=mk('div','el',px({left:210,top:700,fontSize:40,fontWeight:700,color:'rgba(255,255,255,.9)',letterSpacing:'-.03em'}),P3,
    'POUR공법 특허 사용<br>MOU 체결');
  rise(t3,C(8)+.05,{d:.6,dy:20,dx:-14});
})();

/* ============================ SCENE 5 ============================ */
(function(){
  const S=scene('s5'), B=SCN.s5, C=i=>L('s5',i);
  const bg=mk('div','bg',{},S); slot(bg,'apt_wide_1','대단지 아파트 전경',{left:0,top:0,width:'100%',height:'100%'});
  kenburns(bg,B.t0,B.t1,1.03,1.15);
  mk('div','veil v-soft',{},S);
  const vl=mk('div','veil v-deep',{},S); reg(T=>{ vl.style.opacity=(0.28+0.5*c01((T-C(3))/1.0)).toFixed(3); });

  const t1=mk('div','el',px({left:0,top:376,width:1920,textAlign:'center',fontSize:44,fontWeight:600,
    color:'rgba(255,255,255,.86)',letterSpacing:'-.03em'}),S,'좋은 공법의 기준은 결국');
  rise(t1,B.t0+.25,{d:.6,dy:20,out:C(1)-.25,outD:.35});
  const t2=mk('div','el',px({left:0,top:452,width:1920,textAlign:'center',fontSize:104,fontWeight:900,
    color:'#fff',letterSpacing:'-.045em'}),S,'현장에서 이기는 것');
  rise(t2,B.t0+1.20,{d:.55,dy:0,s0:.86,ez:outBack,out:C(1)-.25,outD:.35});

  /* 선택 → 적용 → 수주 → 실적 */
  const CH=sub(S,C(1)-.15,B.t1);
  const words=['선택','적용','수주','실적'];
  const WT=[C(1)+.05,C(1)+.52,C(2)+.05,C(2)+.62];
  words.forEach((w,i)=>{
    const x=272+i*380;
    const e=mk('div','el',px({left:x,top:250,width:300,textAlign:'center',fontSize:82,fontWeight:900,
      color:'#fff',letterSpacing:'-.04em'}),CH,w);
    rise(e,WT[i],{d:.4,dy:0,s0:.72,ez:outBack});
    reg(T=>{ const up=outCubic(c01((T-C(3))/.6)); e.style.top=(250-118*up)+'px';
      e.style.fontSize=(82-24*up)+'px'; });
    if(i<3){
      const a=mk('div','el',px({left:x+300-10,top:272,width:100,textAlign:'center',fontSize:44,
        color:'#2F7BE8',fontWeight:800}),CH,'→');
      fade(a,WT[i]+.30,.24);
      reg(T=>{ const up=outCubic(c01((T-C(3))/.6)); a.style.top=(272-112*up)+'px'; });
    }
  });

  /* 실적으로 채워지는 현장들 */
  const M=sub(S,C(3)-.15,B.t1);
  const tiles=[[150,300,470,330],[640,300,470,330],[1130,300,640,330],
               [150,650,390,300],[560,650,390,300],[970,650,390,300],[1380,650,390,300]];
  tiles.forEach((t,i)=>{
    const c=mk('div','card el',px({left:t[0],top:t[1],width:t[2],height:t[3]}),M);
    slot(c,'apt_'+(i+1),'아파트 현장 '+(i+1),{left:0,top:0,width:'100%',height:'100%'});
    pop(c,C(3)+.05+i*.19,{d:.42,dy:18,s0:.88});
  });
  const o1=mk('div','el',px({left:0,top:452,width:1920,textAlign:'center'}),M,
    '<span style="display:inline-block;padding:18px 46px;border-radius:8px;background:rgba(6,16,31,.80);'+
    'font-size:62px;font-weight:900;color:#fff;letter-spacing:-.04em">더 많이 수주</span>');
  rise(o1,C(3)+.55,{d:.5,dy:22,s0:.92,out:C(4)+.15,outD:.3});
  const o2=mk('div','el',px({left:0,top:452,width:1920,textAlign:'center'}),M,
    '<span style="display:inline-block;padding:18px 46px;border-radius:8px;background:rgba(47,123,232,.92);'+
    'font-size:62px;font-weight:900;color:#fff;letter-spacing:-.04em">더 많은 실적</span>');
  rise(o2,C(4)+.20,{d:.5,dy:22,s0:.92});
})();

/* ============================ FINAL ============================ */
(function(){
  const S=scene('fin'), B=SCN.fin, C=i=>L('s5',i);
  mk('div','veil',{background:'radial-gradient(120% 90% at 50% 40%,#122C51 0%,#0A1B33 62%,#06111F 100%)'},S);
  const lg=mk('div','el',px({left:610,top:326,width:700,height:260,display:'flex',
    alignItems:'center',justifyContent:'center'}),S);
  slot(lg,'pour_logo','POUR 로고',{left:0,top:0,width:'100%',height:'100%'},'contain');
  rise(lg,B.t0+.20,{d:.9,dy:0,s0:.90,ez:outQuint});
  reg(T=>{ const p=outCubic(c01((T-(LE('s5',7)+.15))/1.1));
    lg.style.transform=`translate(0px,${(-26*p).toFixed(1)}px) scale(${(1+0.045*p).toFixed(4)})`; });
  const f1=mk('div','el',px({left:0,top:640,width:1920,textAlign:'center',fontSize:40,fontWeight:600,
    color:'rgba(255,255,255,.80)',letterSpacing:'-.03em'}),S,'기술부터 영업, 현장 적용까지');
  rise(f1,C(5)+.15,{d:.6,dy:20,out:LE('s5',7)+.35,outD:.55});
  const f2=mk('div','el',px({left:0,top:712,width:1920,textAlign:'center',fontSize:56,fontWeight:800,
    color:'#fff',letterSpacing:'-.035em',lineHeight:'1.32'}),S,'시공사가 이길 수 있는<br>모든 과정에 POUR가 함께합니다.');
  rise(f2,C(6)+.15,{d:.65,dy:24,out:LE('s5',7)+.35,outD:.55});
  const rl=mk('div','el',px({left:910,top:626,width:100,height:3,background:'#2F7BE8',transformOrigin:'50% 50%'}),S);
  reg(T=>{ const e=outQuint(c01((T-(LE('s5',7)+.55))/.7));
    rl.style.opacity=e; rl.style.transform=`scaleX(${e.toFixed(3)})`; });
})();

/* ============================ SUBTITLES + DRIVER ============================ */
const ALL=[]; for(const s of SCRIPT) for(const c of CUE[s.id]) ALL.push(c);
reg(T=>{
  let cur=null;
  for(const c of ALL){ if(T>=c.t0-.12 && T<c.t1-.04){ cur=c; break; } }
  if(!cur){ subEl.style.opacity=0; return; }
  if(subEl.dataset.tx!==cur.tx){ subEl.dataset.tx=cur.tx; subEl.textContent=cur.tx; }
  const a=outCubic(c01((T-cur.t0)/.20)), b=1-c01((T-(cur.t1-.16))/.16);
  subEl.style.opacity=Math.min(a,b)*0.97;
});
reg(T=>{ progEl.style.width=(1920*c01(T/TOTAL))+'px'; });

window.__TOTAL__ = TOTAL;
window.seek = function(T){ for(const p of painters) p(T); };
window.seek(0);
