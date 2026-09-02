/* ===== POUR B2B film — deterministic timeline renderer ===== */
const AVAILABLE = window.__ASSETS__ || {};      // slot -> filename (injected by renderer)
const RATE = 9.2;                                // 초당 낭독 글자수
const PAD  = 0.24;                               // 줄 사이 호흡
const MINL = 1.34;                               // 자막 최소 노출(짧은 줄도 읽을 시간 확보)

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
const OPEN = 0;                                  // 오프닝 타이틀 카드 제거
const CUE = {}, SCN = {};
let clock = OPEN;
for (const s of SCRIPT){
  const start = clock, arr = [];
  s.lines.forEach((tx,i)=>{
    const d = Math.max(MINL, tx.replace(/\s/g,'').length / RATE) + PAD;
    arr.push({tx, t0:clock, t1:clock+d});
    clock += d;
  });
  CUE[s.id] = arr;
  SCN[s.id] = {t0:start, t1:clock};
}
const OUTRO = 6.2;                 // 엔딩 로고 + 문의 정보 노출
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
function slot(parent, key, label, css, fit, bg, pos){
  /* key 에 배열을 주면 먼저 확보된 원본을 쓴다(실사 우선, AI 이미지 대체). */
  if(Array.isArray(key)){ key = key.find(k=>AVAILABLE[k]) || key[0]; }   /* 없으면 1순위를 안내 */
  const wrap = mk('div','', Object.assign({position:'absolute',overflow:'hidden'}, bg?{background:bg}:{}, px(css||{})), parent);
  const a = AVAILABLE[key];
  if(a){
    const i = mk('img','',{width:'100%',height:'100%',objectFit:fit||'cover',
      objectPosition:pos||'center',display:'block',
      filter:(a.alpha? 'none' : (TONE[key]||'contrast(1.03) saturate(0.96)'))},wrap);
    i.src = 'assets/'+(typeof a==='string'?a:a.f);
  } else {
    mk('div','ph',{},wrap,`<div class="t">${label}</div><div class="s">원본 이미지 필요 · ${key}</div>`);
  }
  return wrap;
}

/* 연번 슬롯 중 실제 파일이 있는 것만. 하나도 없으면 어떤 원본이 필요한지 보이도록 전량 유지 */
function series(prefix,n){
  const got=[]; for(let i=1;i<=n;i++) if(AVAILABLE[prefix+i]) got.push(i);
  return got.length? got : Array.from({length:n},(_,i)=>i+1);
}
const DOCBG='#F4F7FB';
/* #9 원본마다 촬영 조건이 달라 톤이 튄다. 슬롯별로 최소 보정만 적용해
   한 편의 영상으로 보이게 맞춘다(내용은 건드리지 않는다). */
const TONE={
  factory_yongin:'contrast(1.06) saturate(0.94) brightness(1.01)',
  seminar_1:     'contrast(1.08) saturate(0.88) brightness(1.03)',
  tech_doc_1:    'contrast(1.05) saturate(0.93)',
  hq_meeting:    'contrast(1.06) saturate(0.90)',
  site_visit:    'contrast(1.06) saturate(0.90)',
  rooftop_1:     'contrast(1.05) saturate(0.92)',
  drone_1:       'contrast(1.06) saturate(0.92)',
  drone_2:       'contrast(1.06) saturate(0.92)',
  apt_wide_1:    'contrast(1.05) saturate(0.94)',
};
/* 이미지 실제 비율. 없으면 null */
function ratioOf(key){ const a=AVAILABLE[key]; return (a&&a.w&&a.h)? a.w/a.h : null; }
/* 주어진 최대 박스 안에서 이미지 비율에 정확히 맞는 크기.
   contain을 써도 여백이 남지 않도록 틀 자체를 이미지에 맞춘다. */
function fitBox(key,bw,bh,fallback){
  const r = ratioOf(key) || fallback || bw/bh;
  let w=bw, h=bw/r;
  if(h>bh){ h=bh; w=bh*r; }
  return {w:Math.round(w), h:Math.round(h)};
}
/* 박스 중앙 정렬용 좌표 보정 */
function centered(x,y,bw,bh,fb){ return {left:Math.round(x+(bw-fb.w)/2), top:Math.round(y+(bh-fb.h)/2)}; }

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
/* ===== 모션 어휘 =====
   요소 성격에 따라 다른 등장 방식을 쓴다. 전부 같은 slide-up이면 리듬이 죽는다.
   텍스트=마스크 와이프 / 사진=마스크가 열리며 이미지 안착 / 노드=짧은 스냅
   문서=기울어 내려앉기 / 문장=어절 스태거                                        */
function clipStr(p,dir,r){
  const q=((1-p)*100).toFixed(2), rd=r?` round ${r}px`:'';
  if(dir==='right') return `inset(0 ${q}% 0 0${rd})`;   // 좌→우
  if(dir==='left')  return `inset(0 0 0 ${q}%${rd})`;   // 우→좌
  if(dir==='up')    return `inset(${q}% 0 0 0${rd})`;   // 아래→위
  return `inset(0 0 ${q}% 0${rd})`;                      // 위→아래
}
/* 텍스트/바: 자리를 옮기지 않고 마스크만 열린다 */
function wipe(el,t0,o={}){
  const d=o.d||.5, dir=o.dir||'up', ez=o.ez||outQuint;
  el.style.opacity=0;
  reg(T=>{
    const p=ez(c01((T-t0)/d));
    let op = p>0?1:0;
    if(o.out!=null) op*=1-c01((T-o.out)/(o.outD||.4));
    el.style.opacity=op;
    el.style.clipPath = p>=1?'none':clipStr(p,dir,o.r);
    if(o.dx||o.dy) el.style.transform=`translate(${((o.dx||0)*(1-p)).toFixed(2)}px,${((o.dy||0)*(1-p)).toFixed(2)}px)`;
  });
}
/* 노드/칩: 짧고 단단하게 튀어나온다 */
function snap(el,t0,o={}){
  const d=o.d||.28, s0=o.s0!==undefined?o.s0:.86, ez=o.ez||outBack;
  reg(T=>{
    const p=c01((T-t0)/d), e=ez(p);
    let op=outCubic(c01((T-t0)/(d*.5)));
    if(o.out!=null) op*=1-c01((T-o.out)/(o.outD||.35));
    el.style.opacity=op;
    el.style.transform=`translate(${((o.dx||0)*(1-e)).toFixed(2)}px,${((o.dy||0)*(1-e)).toFixed(2)}px) scale(${(s0+(1-s0)*e).toFixed(4)})`;
  });
}
/* 사진: 프레임 마스크가 열리는 동안 안의 이미지가 살짝 줄며 안착 */
function revealCard(el,t0,o={}){
  const d=o.d||.72, dir=o.dir||'right', ez=o.ez||outQuint, r=o.r!==undefined?o.r:14;
  const img=el.querySelector('img'), z=o.zoom!==undefined?o.zoom:.13;
  el.style.opacity=0;
  reg(T=>{
    const p=ez(c01((T-t0)/d));
    let op=p>0?1:0;
    if(o.out!=null) op*=1-c01((T-o.out)/(o.outD||.4));
    el.style.opacity=op;
    el.style.clipPath = p>=1?'none':clipStr(p,dir,r);
    if(img) img.style.transform=`scale(${(1+z-z*p).toFixed(4)})`;
  });
}
/* 문서: 종이가 놓이듯 살짝 기울어 내려앉는다 */
function dropCard(el,t0,o={}){
  const d=o.d||.66, rot=o.rot||0, dy=o.dy!==undefined?o.dy:-52, ez=o.ez||outQuint;
  reg(T=>{
    const p=ez(c01((T-t0)/d));
    let op=outCubic(c01((T-t0)/(d*.42)));
    if(o.out!=null) op*=1-c01((T-o.out)/(o.outD||.4));
    el.style.opacity=op;
    el.style.transform=`translateY(${(dy*(1-p)).toFixed(2)}px) rotate(${(rot*(1-p)).toFixed(3)}deg) scale(${(1.05-.05*p).toFixed(4)})`;
  });
}
/* 문장: 한 덩어리로 띄우지 않고 어절 단위로 흘려보낸다 */
function words(el,t0,o={}){
  const step=o.step||.075, d=o.d||.44, dy=o.dy!==undefined?o.dy:24;
  const units=[];                      // 애니메이션 단위
  const out=[];                        // 새 자식 노드
  el.childNodes.forEach(n=>{
    if(n.nodeType===3){                // 텍스트: 어절로 분해
      n.textContent.split(/(\s+)/).forEach(tk=>{
        if(!tk) return;
        if(/^\s+$/.test(tk)){ out.push(document.createTextNode(tk)); return; }
        const sp=document.createElement('span');
        sp.style.display='inline-block'; sp.style.opacity='0'; sp.style.willChange='transform,opacity';
        sp.textContent=tk; out.push(sp); units.push(sp);
      });
    } else if(n.nodeName==='BR'){      // 줄바꿈은 그대로, 애니메이션 대상 아님
      out.push(n.cloneNode(true));
    } else {                           // <span> 등 요소는 한 덩어리
      const c=n.cloneNode(true);
      c.style.display='inline-block'; c.style.opacity='0'; c.style.willChange='transform,opacity';
      out.push(c); units.push(c);
    }
  });
  el.innerHTML=''; out.forEach(n=>el.appendChild(n)); el.style.opacity=1;
  units.forEach((sp,i)=>{
    const tt=t0+i*step;
    reg(T=>{
      const p=outQuint(c01((T-tt)/d));
      let op=outCubic(c01((T-tt)/(d*.55)));
      if(o.out!=null) op*=1-c01((T-o.out)/(o.outD||.4));
      sp.style.opacity=op;
      sp.style.transform=`translateY(${(dy*(1-p)).toFixed(2)}px)`;
    });
  });
  return el;
}

/* 장면 전환은 은은한 페이드 + 짧은 슬라이드로만. 방향은 흐름을 따라간다. */
const MOVE={                       // [들어오는 방향], [나가는 방향], [살아있는 동안의 아주 느린 이동]
  s1:{i:[20,0],  o:[-20,0], p:[0,-6]},
  s2:{i:[0,26],  o:[0,-26], p:[6,0]},
  s3:{i:[-20,0], o:[20,0],  p:[0,-7]},
  s4:{i:[0,24],  o:[0,-24], p:[-6,0]},
  s5:{i:[22,0],  o:[-22,0], p:[0,-8]},
  fin:{i:[0,18], o:[0,0],   p:[0,-4]},
};
function pushPaint(el,t0,t1,d,inD,outD){
  const I=d.i||[0,0], O=d.o||[0,0], P=d.p||[0,0];
  reg(T=>{
    const inn=c01((T-(t0-inD))/(inD+.20)), outp=c01((T-(t1-outD))/outD);
    const o=Math.min(inn,1-outp);
    el.style.opacity=o;
    el.style.visibility = o<=0.001?'hidden':'visible';
    const pi=outQuint(inn), po=outCubic(outp);
    const life=c01((T-t0)/Math.max(.001,t1-t0));
    const x=I[0]*(1-pi)+O[0]*po+P[0]*life;
    const y=I[1]*(1-pi)+O[1]*po+P[1]*life;
    const k=1+.018*(1-pi)+.018*po+.006*life;   // 전환 중 최소 줌 — 이동해도 여백이 안 보이는 정도까지만
    el.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${k.toFixed(4)})`;
  });
}
function scene(id){
  const s=mk('div','scene'); s.id=id;
  const b=SCN[id];
  pushPaint(s,b.t0,b.t1,MOVE[id]||{},.35,.45);
  return s;
}

/* FINAL overlaps the tail of scene 5 */
SCN.s5.t1 = L('s5',5)+0.10;
SCN.fin.t0 = L('s5',5)-0.10;

function sub(parent, ta, tb, d){
  const g = mk('div','',{position:'absolute',inset:'0',opacity:0,willChange:'transform,opacity'},parent);
  pushPaint(g,ta,tb,d||{},.42,.38);
  return g;
}

function scene(id){
  const s=mk('div','scene'); s.id=id;
  const b=SCN[id];
  pushPaint(s,b.t0,b.t1,MOVE[id]||{},.35,.45);
  return s;
}

/* FINAL overlaps the tail of scene 5 */
SCN.s5.t1 = L('s5',5)+0.10;
SCN.fin.t0 = L('s5',5)-0.10;

function sub(parent, ta, tb, d){
  const g = mk('div','',{position:'absolute',inset:'0',opacity:0,willChange:'transform,opacity'},parent);
  pushPaint(g,ta,tb,d||{},.42,.38);
  return g;
}

function chip(parent,text,x,y,t,size){
  const c=mk('div','chip el',px({left:x,top:y,opacity:1}),parent);
  const bar=mk('div','bar',px({height:(size||56)*.86,transformOrigin:'50% 100%',opacity:0}),c);
  const tx=mk('div','tx',px({fontSize:size||60}),c,text);
  reg(T=>{ const q=outQuint(c01((T-t)/.32));
    bar.style.opacity=q>0?1:0; bar.style.transform=`scaleY(${q.toFixed(3)})`; });
  wipe(tx,t+.13,{d:.46,dir:'right'});
  return c;
}
function keyRow(parent,text,x,y,t,size){
  const r=mk('div','row el',px({left:x,top:y,opacity:1}),parent);
  const k=mk('div','k',px({opacity:0}),r);
  const tx=mk('div','t',px({fontSize:size||40}),r,text);
  snap(k,t,{d:.30,s0:.15});
  wipe(tx,t+.09,{d:.44,dir:'right'});
  return r;
}
function sectionLabel(parent,text,t,sub2){
  const w=mk('div','el',px({left:120,top:150,opacity:1}),parent);
  const k=mk('div','kicker',px({marginBottom:16,opacity:0}),w,sub2||'POUR SUPPORT');
  const h=mk('div','h2',px({opacity:0}),w,text);
  wipe(k,t,{d:.40,dir:'right'});
  wipe(h,t+.13,{d:.62,dir:'up'});
  return w;
}

/* ============================ SCENE 1 ============================ */
(function(){
  const S=scene('s1'), B=SCN.s1;
  mk('div','veil v-off',{},S);

  /* --- phase A : 3 keywords + 3 field cards --- */
  const A=sub(S,B.t0,L('s1',4)+.30,{o:[-22,0]});
  /* 배경 전체를 사진으로 채우고 좌측에 밝은 워시를 깔아 글자를 얹는다 */
  const shot=mk('div','bg',{},A);
  slot(shot,['ai_inspect_1','apt_wide_1'],'태블릿으로 현장을 점검하는 건설 전문가',
       {left:0,top:0,width:'100%',height:'100%'});
  kenburns(shot,L('s1',0),L('s1',4)+.30,1.14,1.03,'62%','42%');   /* 느린 푸시인 */
  mk('div','veil v-wash',{},A);

  const k=mk('div','el',px({left:120,top:314,opacity:1}),A,'<div class="kicker">새로운 공법을 찾는 이유</div>');
  wipe(k,L('s1',0)+.25,{d:.5,dir:'right'});
  chip(A,'더 나은 현장',120,384,L('s1',1));
  chip(A,'새로운 기회',120,498,L('s1',2));
  chip(A,'시장 경쟁력',120,612,L('s1',3));


  /* --- phase B : 4-step process chain (화면 전체를 쓰는 4-up) --- */
  const Bp=sub(S,L('s1',5)-.10,B.t1,{i:[24,0]});
  mk('div','veil v-cool',{},Bp);

  const hk=mk('div','el',px({left:120,top:132,opacity:1}),Bp,'<div class="kicker">PROCESS</div>');
  wipe(hk,L('s1',5),{d:.42,dir:'right'});
  const hh=mk('div','el',px({left:120,top:170,fontSize:56,fontWeight:800,color:'var(--ink-1)',
    letterSpacing:'-.035em',opacity:1}),Bp,'기술이 현장에 닿기까지');
  wipe(hh,L('s1',5)+.12,{d:.58,dir:'up'});

  const steps=[['기술 검토',['analysis_1','ai_engineer_1'],'현장 조건을 분석하는 엔지니어'],
               ['자료 준비','consulting_1','컨설팅 내역서'],
               ['적용 방안','cad_1','CAD 도면'],
               ['실제 시공',['construction_1','ai_concrete_1'],'콘크리트 타설 · 구조 작업']];
  const ST=[L('s1',6),L('s1',7),L('s1',7)+.92,L('s1',8)+.55];

  const M0=120, GAP=24, CW=Math.round((1920-M0*2-GAP*3)/4), CH=556, CY=296;
  const RY=262;                                   // 진행 레일
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); Bp.appendChild(svg);
  const base=document.createElementNS('http://www.w3.org/2000/svg','line');
  base.setAttribute('x1',M0); base.setAttribute('x2',1920-M0);
  base.setAttribute('y1',RY); base.setAttribute('y2',RY);
  base.setAttribute('stroke','rgba(255,255,255,.14)'); base.setAttribute('stroke-width',2);
  svg.appendChild(base); fade(base,L('s1',5)+.30,.5);
  const fill=document.createElementNS('http://www.w3.org/2000/svg','line');
  fill.setAttribute('x1',M0); fill.setAttribute('y1',RY); fill.setAttribute('y2',RY);
  fill.setAttribute('stroke','var(--blue-500)'); fill.setAttribute('stroke-width',2);
  svg.appendChild(fill);
  const cx=i=>M0+i*(CW+GAP)+CW/2;
  reg(T=>{
    let p=0;
    for(let i=0;i<4;i++){ const q=c01((T-ST[i])/.55); p=Math.max(p, (i+q)/4); }
    fill.setAttribute('x2', M0 + (1920-M0*2)*outQuint(c01(p)));
    fill.style.opacity = T>=ST[0]?1:0;
  });

  steps.forEach((st,i)=>{
    const x=M0+i*(CW+GAP);
    /* 레일 위 노드 */
    const dot=mk('div','el',px({left:cx(i)-9,top:RY-9,width:18,height:18,borderRadius:9,
      background:'var(--blue-500)',boxShadow:'0 0 0 5px rgba(47,123,232,.20)'}),Bp);
    snap(dot,ST[i],{d:.30,s0:.2});

    /* 사진은 틀을 꽉 채운다. 문서는 상단(제목부)이 보이도록 위 기준 crop */
    const isDoc = st[1]==='consulting_1'||st[1]==='cad_1';
    const card=mk('div','card el',px({left:x,top:CY,width:CW,height:CH}),Bp);
    slot(card,st[1],st[2],{left:0,top:0,width:'100%',height:'100%'},'cover',
         isDoc?DOCBG:null, isDoc?'center top':'center');
    /* 카드 하단에 번호/이름을 얹어 아래 여백을 없앤다 */
    /* 사진 위 반투명 정보 카드 — 밝은 면과 톤을 맞춘다 */
    const foot=mk('div','',px({position:'absolute',left:0,right:0,bottom:0,padding:'20px 24px 22px',
      background:'rgba(255,255,255,.92)',borderTop:'1px solid rgba(12,44,82,.10)',
      backdropFilter:'blur(6px)',opacity:0}),card);
    mk('div','',px({fontSize:20,fontWeight:800,color:'var(--blue-500)',letterSpacing:'.16em',marginBottom:6}),foot,'0'+(i+1));
    mk('div','',px({fontSize:40,fontWeight:800,color:'#0C2C52',letterSpacing:'-.035em'}),foot,st[0]);
    revealCard(card,ST[i],{d:.62,dir:'down'});
    wipe(foot,ST[i]+.26,{d:.44,dir:'up'});
  });

  /* 마지막에 결론을 우상단에 놓아 상단 여백도 채운다 */
  const tail=mk('div','el',px({left:1040,top:176,width:740,textAlign:'right',fontSize:44,fontWeight:800,
    color:'var(--blue-400)',letterSpacing:'-.035em',whiteSpace:'nowrap',opacity:1}),Bp,'POUR가 함께하는 과정');
  words(tail,L('s1',9),{step:.10,d:.46,dy:18});
})();

/* ============================ SCENE 2 ============================ */
(function(){
  const S=scene('s2'), B=SCN.s2;
  mk('div','veil v-cool',{},S);

  /* --- rapid count-up : 핵심 수치는 딥블루 면에서 강조한다 --- */
  const MIL=[0,18500,73200,184000,420000,870000,1340000,1920000,2310000,2570000,2600000];
  const CT0=B.t0+.18, CD=1.35;
  const NZ=mk('div','deep',{position:'absolute',inset:'0',opacity:0},S);
  mk('div','veil v-hero',{},NZ);
  const nbg=mk('div','bg',{opacity:.22},NZ);
  slot(nbg,['ai_city_1','apt_wide_1'],'현대 도시 · 건축물 전경',{left:0,top:0,width:'100%',height:'100%'});
  kenburns(nbg,B.t0,CT0+3.4,1.12,1.02);
  reg(T=>{ NZ.style.opacity = Math.min(outCubic(c01((T-(B.t0-.2))/.5)), 1-c01((T-(CT0+4.10))/.60)); });
  const wrapN=mk('div','el',px({left:0,top:300,width:1920,textAlign:'center',zIndex:5}),S);
  const nEl=mk('div','num',px({fontSize:210,lineHeight:'1.22'}),wrapN,'0');
  const uEl=mk('div','el',px({left:0,top:572,width:1920,textAlign:'center',fontSize:56,fontWeight:700,
              color:'#7DB4FF',letterSpacing:'.30em',zIndex:5}),S,'세대');
  const rule=mk('div','el',px({left:810,top:658,width:300,height:5,background:'#4A93F5',transformOrigin:'50% 50%',zIndex:5}),S);
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

  const badge=mk('div','el',px({left:120,top:132}),S,
    '<div class="kicker" style="margin-bottom:12px">경험과 데이터</div>'+
    '<div style="font-size:56px;font-weight:900;color:#fff;letter-spacing:-.04em;font-variant-numeric:tabular-nums">'+
    '2,600,000<span style="font-size:34px;font-weight:700;color:var(--blue-400);margin-left:14px;letter-spacing:.1em">세대</span></div>');
  wipe(badge,CT0+2.45,{d:.52,dir:'right',out:L('s2',4)-.15,outD:.4});

  /* --- site mosaic fills --- */
  const M=sub(S,CT0+2.6,L('s2',2)+.15,{i:[0,24],o:[0,-24]});
  const tiles=[[120,250,488,336],[632,250,656,336],[1312,250,488,336],
               [120,610,316,240],[461,610,316,240],[802,610,316,240],[1143,610,316,240],[1484,610,316,240]];
  const MT=[0,.26,.52,.86,1.02,1.18,1.34,1.50];
  tiles.forEach((t,i)=>{
    const c=mk('div','card el',px({left:t[0],top:t[1],width:t[2],height:t[3]}),M);
    slot(c,'apt_'+(i+1),'아파트 현장 '+(i+1),{left:0,top:0,width:'100%',height:'100%'});
    revealCard(c,CT0+2.75+MT[i],{d:.46,dir:['down','right','left','up'][i%4]});
  });
  const mcap=mk('div','el',px({left:1080,top:186,width:700,textAlign:'right',opacity:1}),M,
    '<div class="kicker">전국 아파트 현장</div>');
  wipe(mcap,CT0+2.9,{d:.44,dir:'left'});

  /* --- diagnosis / conditions --- */
  const D=sub(S,L('s2',2)+.05,L('s2',4)-.05,{i:[22,0],o:[-22,0]});
  /* 좌측 리스트 / 우측 사진 — 사진을 배경 전체로 채우고 좌측에 밝은 워시 */
  const big=mk('div','bg',{},D);
  slot(big,['ai_engineer_1','drone_1'],'현장 조건과 공법을 분석하는 엔지니어',{left:0,top:0,width:'100%',height:'100%'});
  kenburns(big,L('s2',2),L('s2',4),1.12,1.02,'64%','46%');
  mk('div','veil v-wash',{},D);
  const dk=mk('div','el',px({left:120,top:268,opacity:1}),D,'<div class="kicker">현장 진단</div>');
  wipe(dk,L('s2',2)+.15,{d:.44,dir:'right'});
  ['외벽 상태','적용 환경','공정 조건','현장 요구사항'].forEach((t,i)=>
    keyRow(D,t,120,352+i*104,L('s2',2)+.42+i*.46,42));

  /* --- conclusion flow --- */
  const F=sub(S,L('s2',4)-.10,B.t1,{i:[0,24]});
  const fl=[['경험 · 데이터',L('s2',4)],['현장 분석',L('s2',4)+.85],['적합한 적용 방향',L('s2',5)+.35]];
  fl.forEach(([t,tt],i)=>{
    const e=mk('div','el',px({left:0,top:300+i*168,width:1920,textAlign:'center',
      fontSize:i===2?68:56,fontWeight:i===2?900:800,color:i===2?'#fff':'rgba(255,255,255,.86)',letterSpacing:'-.035em'}),F,t);
    words(e,tt,{step:.09,d:.44,dy:20});
    if(i>0){
      const a=mk('div','el',px({left:0,top:246+i*168,width:1920,textAlign:'center',
        fontSize:34,color:'var(--blue-500)',fontWeight:800}),F,'↓');
      fade(a,tt-.18,.3);
    }
  });
})();

/* ============================ SCENE 3 ============================ */
(function(){
  const S=scene('s3'), B=SCN.s3, C=i=>L('s3',i);

  /* ---- 3-1 기술개발 · 자재생산 (용인공장 full bleed) ---- */
  const A=sub(S,B.t0-.05,C(2)-.15,{o:[-24,0]}); A.classList.add('deep');
  const bgA=mk('div','bg',{},A); slot(bgA,'factory_yongin','용인공장 전경',{left:0,top:0,width:'100%',height:'100%'});
  kenburns(bgA,B.t0,C(2),1.04,1.14);
  mk('div','veil',{background:'linear-gradient(180deg,rgba(7,27,51,.88) 0%,rgba(7,27,51,.60) 42%,rgba(7,27,51,.94) 100%)'},A);
  sectionLabel(A,'기술개발 · 자재생산',B.t0+.10,'POUR SUPPORT 01');
  const matIdx=series('material_',4), mn=matIdx.length;
  const GAPM=40, BASE=850, MAXH=mn>=4?380:420;
  const colW=Math.floor((1920-240-GAPM*(mn-1))/mn);
  const PAD=30;
  matIdx.forEach((idx,i)=>{
    const k='material_'+idx, a=AVAILABLE[k], cut=!!(a&&a.alpha);
    const colX=120+i*(colW+GAPM);
    if(cut){
      /* 누끼 자재 — 흰 카드 없이 배경 위에 제품만. 아래 기준선에 맞춰 정렬한다.
         라벨·색상·형태는 원본 그대로, 어떤 보정도 걸지 않는다. */
      const fb=fitBox(k, colW, MAXH);
      const w=mk('div','el',px({left:colX+(colW-fb.w)/2, top:BASE-fb.h, width:fb.w, height:fb.h,
        filter:'drop-shadow(0 20px 30px rgba(2,10,22,.50))'}),A);
      slot(w,k,'POUR 자재 '+idx,{left:0,top:0,width:'100%',height:'100%'},'contain');
      rise(w,C(1)-.15+i*.42,{d:.66,dy:52,s0:.84,ez:outBack});
    } else {
      const fb=fitBox(k, colW-PAD*2, MAXH-PAD*2);
      const pw=fb.w+PAD*2, ph=fb.h+PAD*2;
      const p=mk('div','pedestal el',px({left:colX+(colW-pw)/2, top:BASE-ph, width:pw, height:ph}),A);
      slot(p,k,'POUR 자재 '+idx,{left:PAD,top:PAD,width:fb.w,height:fb.h},'contain');
      rise(p,C(1)-.15+i*.42,{d:.66,dy:52,s0:.84,ez:outBack});
    }
  });

  /* ---- 3-2 공법설명회 ---- */
  const Bx=sub(S,C(2)-.15,C(3)-.15,{i:[24,0],o:[0,-24]});
  Bx.classList.add('deep');
  mk('div','veil v-hero',{},Bx);
  const semN=series('seminar_',3).length;
  const bgB=mk('div','bg',{opacity: semN===1 ? 1 : .26},Bx);
  slot(bgB,['seminar_1'],'공법설명회 현장',{left:0,top:0,width:'100%',height:'100%'});
  kenburns(bgB,C(2),C(3),1.10,1.02,'64%','44%');
  /* 사진 한 장이면 배경으로 꽉 채우고 좌측만 어둡게 눌러 글자를 받는다 */
  mk('div','veil '+(semN===1?'v-deepL':'v-deep'),{opacity: semN===1 ? 1 : .55},Bx);
  sectionLabel(Bx,'공법설명회',C(2)-.05,'POUR SUPPORT 02');
  const semLb={1:'공법설명회 현장',2:'공법설명회 발표',3:'시공사 참석'};
  const semIdx=series('seminar_',3), sn=semIdx.length;
  /* 사진이 여러 장일 때만 카드로 비교 배치한다. 한 장이면 위 배경으로 충분하다. */
  if(sn>1){
    const sw = sn>=3?496:700, sh = sn>=3?440:470;
    const sgap=32, sspan=sn*sw+(sn-1)*sgap, sx0=(1920-sspan)/2;
    semIdx.forEach((idx,i)=>{
      const c=mk('div','card el',px({left:sx0+i*(sw+sgap),top:900-sh-60,width:sw,height:sh}),Bx);
      slot(c,'seminar_'+idx,semLb[idx],{left:0,top:0,width:'100%',height:'100%'});
      mk('div','cap',{},c,semLb[idx]);
      revealCard(c,C(2)+.42+i*.36,{d:.62,dir:i%2?'right':'down'});
    });
  } else {
    /* 한 장이면 배경 위에 핵심 장점만 얹는다. 자막과 같은 문장을 반복하지 않는다. */
    const one=mk('div','el',px({left:120,top:452,width:900,opacity:1}),Bx);
    const oneK=mk('div','',px({fontSize:22,fontWeight:700,letterSpacing:'.22em',
      color:'var(--teal-400)',marginBottom:16,opacity:0}),one,'선정으로 이어지는 설명회');
    const oneT=mk('div','',px({fontSize:72,fontWeight:900,color:'var(--ink-1)',
      letterSpacing:'-.04em',lineHeight:'1.16',opacity:0}),one,'높은 선정률');
    wipe(oneK,C(2)+.45,{d:.44,dir:'right'});
    wipe(oneT,C(2)+.62,{d:.60,dir:'up'});
  }

  /* ---- 3-3 기술자료 (stacking) ---- */
  const Cx=sub(S,C(3)-.15,C(4)-.15,{i:[0,24],o:[-24,0]});
  mk('div','veil v-cool',{},Cx);
  sectionLabel(Cx,'현장 맞춤 기술자료',C(3)-.05,'POUR SUPPORT 03');
  /* 세로형 문서는 잘리지 않게 흰 바탕에 contain, 사진은 cover */
  const docs=[['consulting_1','컨설팅 내역서',660,258,392,524,'contain'],
              ['tech_doc_1','기술자료',1004,414,660,442,'cover'],
              ['cad_1','CAD 도면',742,550,404,300,'contain']];
  docs.forEach(([k,lb,x,y,w,h,fit],i)=>{
    if(fit==='contain'){ const fb=fitBox(k,w,h); x+=Math.round((w-fb.w)/2); y+=Math.round((h-fb.h)/2); w=fb.w; h=fb.h; }
    const c=mk('div','card el',px({left:x,top:y,width:w,height:h,zIndex:10+i}),Cx);
    slot(c,k,lb,{left:0,top:0,width:'100%',height:'100%'},fit, fit==='contain'?DOCBG:null);
    /* 카드가 계단식으로 겹치므로 라벨은 항상 드러나는 좌상단에.
       자료 자체의 인쇄 제목과 경쟁하지 않도록 작은 태그로 둔다. */
    mk('div','',px({position:'absolute',left:14,top:14,padding:'7px 14px',borderRadius:6,
      fontSize:20,fontWeight:700,color:'var(--ink-1)',letterSpacing:'-.01em',
      background:'rgba(6,18,35,.86)',border:'1px solid rgba(255,255,255,.18)'}),c,lb);
    dropCard(c,C(3)+.10+i*.62,{d:.68,rot:[-3.2,2.4,-1.8][i],dy:-64});
    const t=mk('div','el',px({left:120,top:404+i*94,fontSize:34,fontWeight:700,color:'var(--ink-1)',opacity:1}),Cx,'· '+lb);
    wipe(t,C(3)+.20+i*.62,{d:.44,dir:'right'});
  });

  /* ---- 3-4 AI · 디지털 ---- */
  const Dx=sub(S,C(4)-.15,C(6)+.55,{i:[24,0],o:[0,-24]});
  Dx.classList.add('deep');
  const bgD=mk('div','bg',{},Dx); slot(bgD,'drone_1','드론 외벽진단',{left:0,top:0,width:'100%',height:'100%'});
  kenburns(bgD,C(4),C(6)+.55,1.14,1.02);
  mk('div','veil v-deepL',{},Dx);
  sectionLabel(Dx,'정확한 기술검토<br>빠른 현장지원',C(4)-.05,'POUR SUPPORT 04');
  const dsteps=[['드론 현장진단','drone_2','드론 촬영'],['현장 데이터','data_1','현장 데이터'],
                ['AI 분석','ai_1','AI 분석'],['기술검토','review_1','기술검토']];
  const svgD=document.createElementNS('http://www.w3.org/2000/svg','svg'); Dx.appendChild(svgD);
  dsteps.forEach((s,i)=>{
    const y=286+i*146, tt=C(4)+.45+i*.85;
    const g=mk('div','el',px({left:980,top:y,width:800,height:126,opacity:1}),Dx);
    const bx=mk('div','box',px({position:'absolute',left:0,top:0,width:800,height:126,opacity:0}),g);
    const th=mk('div','',px({position:'absolute',left:14,top:14,width:170,height:98,borderRadius:8,overflow:'hidden',opacity:0}),bx);
    slot(th,s[1],s[2],{left:0,top:0,width:'100%',height:'100%'});
    const nm=mk('div','',px({position:'absolute',left:210,top:38,fontSize:36,fontWeight:800,color:'var(--ink-1)',letterSpacing:'-.03em',opacity:0}),bx,s[0]);
    const no=mk('div','',px({position:'absolute',right:26,top:44,fontSize:22,fontWeight:700,color:'rgba(90,160,255,.85)',letterSpacing:'.14em',opacity:0}),bx,'0'+(i+1));
    wipe(bx,tt,{d:.40,dir:'right',r:16});
    revealCard(th,tt+.16,{d:.40,dir:'right',r:8});
    wipe(nm,tt+.22,{d:.40,dir:'right'});
    snap(no,tt+.34,{d:.26,s0:.5});
    if(i<3){
      const ln=document.createElementNS('http://www.w3.org/2000/svg','line');
      ln.setAttribute('x1',1060);ln.setAttribute('x2',1060);
      ln.setAttribute('y1',y+126);ln.setAttribute('y2',y+146);
      ln.setAttribute('stroke','var(--blue-500)');ln.setAttribute('stroke-width',3);
      svgD.appendChild(ln); drawLine(ln,tt+.44,.28,20);
    }
  });

  /* ---- 3-5 공사 전 · 중 · 후 ---- */
  const Ex=sub(S,C(6)+.45,C(8)+1.30,{i:[0,24],o:[0,-24]});
  mk('div','veil v-off',{},Ex);
  sectionLabel(Ex,'공사 전 · 중 · 후 현장관리',C(6)+.55,'POUR SUPPORT 05');
  const phs=[['공사 전','kakao_1','현장 공유 커뮤니케이션'],
             ['공사 중',['rooftop_1','ai_concrete_1'],'옥상 방수 도장 작업'],
             ['공사 후','netform_doc','NETFORM 준공 공문']];
  const svgE=document.createElementNS('http://www.w3.org/2000/svg','svg'); Ex.appendChild(svgE);
  phs.forEach(([t,k,lb],i)=>{
    const x=136+i*568, tt=C(6)+.78+i*.50;
    const g=mk('div','el',px({left:x,top:352,width:512,height:498,opacity:1}),Ex);
    const bx=mk('div','box',px({position:'absolute',left:0,top:0,width:512,height:498,opacity:0}),g);
    const hd=mk('div','hd',{},bx);
    const dot=mk('div','dot',px({opacity:0}),hd);
    const ttl=mk('div','t',px({opacity:0}),hd,t);
    const md=mk('div','media',px({height:352,opacity:0}),bx);
    slot(md,k,lb,{left:0,top:0,width:'100%',height:'100%'}, k==='netform_doc'?'contain':'cover');
    wipe(bx,tt,{d:.38,dir:'down',r:16});
    snap(dot,tt+.14,{d:.26,s0:.2});
    wipe(ttl,tt+.18,{d:.36,dir:'right'});
    revealCard(md,tt+.26,{d:.46,dir:'down',r:10});
    if(i<2){
      const ar=mk('div','el',px({left:x+512+8,top:594,fontSize:40,color:'var(--blue-500)',fontWeight:800,width:48,textAlign:'center'}),Ex,'→');
      fade(ar,tt+.40,.28);
    }
  });

  /* ---- 3-6 60명 전문 인력 ---- */
  const Fx=sub(S,C(8)+1.20,B.t1,{i:[0,24]});
  mk('div','veil v-cool',{},Fx);
  const coop=mk('div','el',px({left:1180,top:0,width:740,height:1080,opacity:0}),Fx);
  slot(coop,['ai_team_1'],'여러 분야 현장 전문가의 협업',{left:0,top:0,width:'100%',height:'100%'});
  mk('div','veil',{background:'linear-gradient(90deg,#EDF1F6 0%,rgba(237,241,246,.72) 46%,rgba(237,241,246,.30) 100%)'},coop);
  fade(coop,C(8)+1.05,1.1);
  reg(T=>{ coop.style.opacity=Math.min(coop.style.opacity||1, 0.55); });
  const W0=C(8)+1.25;
  const hub=mk('div','',{position:'absolute',inset:'0'},Fx);
  reg(T=>{ hub.style.opacity=1-c01((T-(C(10)-.52))/.30); });
  const svgF=document.createElementNS('http://www.w3.org/2000/svg','svg'); hub.appendChild(svgF);
  const CX=960, CY=540;
  const cen=mk('div','el',px({left:CX-140,top:CY-58,width:280,height:116,borderRadius:12,
    background:'var(--blue-500)',display:'flex',alignItems:'center',justifyContent:'center',
    fontSize:36,fontWeight:800,color:'var(--ink-1)',letterSpacing:'-.03em',boxShadow:'0 20px 60px rgba(47,123,232,.45)'}),hub,'하나의 현장');
  snap(cen,W0,{d:.36,s0:.66});
  const sat=['기술개발','자재생산','공법설명회','기술자료','AI 분석','현장관리','기술지원','영업지원'];
  sat.forEach((t,i)=>{
    const a=(-90+i*45)*Math.PI/180, rx=560, ry=318;
    const x=CX+Math.cos(a)*rx, y=CY+Math.sin(a)*ry, tt=W0+.25+i*.17;
    const ln=document.createElementNS('http://www.w3.org/2000/svg','line');
    const ux=(x-CX), uy=(y-CY), d=Math.hypot(ux,uy);
    const x1=CX+ux/d*78, y1=CY+uy/d*62, x2=CX+ux/d*(d-46), y2=CY+uy/d*(d-46);
    ln.setAttribute('x1',x1);ln.setAttribute('y1',y1);ln.setAttribute('x2',x2);ln.setAttribute('y2',y2);
    ln.setAttribute('stroke','rgba(90,160,255,.55)');ln.setAttribute('stroke-width',2);
    svgF.appendChild(ln); drawLine(ln,tt,.30,Math.hypot(x2-x1,y2-y1));
    const n=mk('div','el',px({left:x-108,top:y-32,width:216,height:64,borderRadius:32,
      background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.22)',
      display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,fontWeight:700,color:'var(--ink-1)'}),hub,t);
    snap(n,tt+.16,{d:.34,s0:.58,dx:-ux/d*44,dy:-uy/d*44});
  });
  const big60=mk('div','el',px({left:0,top:238,width:1920,textAlign:'center',fontSize:200,fontWeight:900,
    color:'var(--ink-1)',letterSpacing:'-.05em',lineHeight:'1.22'}),Fx,'60');
  snap(big60,C(10)-.08,{d:.44,s0:.58});
  const lbl60=mk('div','el',px({left:0,top:534,width:1920,textAlign:'center',fontSize:56,fontWeight:800,
    color:'var(--blue-400)',letterSpacing:'-.03em'}),Fx,'60명 전문 인력');
  words(lbl60,C(10)+.24,{step:.10,d:.42,dy:18});
  const mv=mk('div','el',px({left:0,top:636,width:1920,textAlign:'center',fontSize:34,fontWeight:600,
    color:'rgba(255,255,255,.80)',letterSpacing:'-.025em'}),Fx,'하나의 현장을 중심으로 함께 움직입니다.');
  words(mv,C(10)+.72,{step:.055,d:.40,dy:14});
  const fin3=mk('div','el',px({left:0,top:722,width:1920,textAlign:'center'}),Fx,
    '<span style="display:inline-block;padding:16px 44px;border:2px solid #2F7BE8;border-radius:50px;'+
    'font-size:40px;font-weight:800;color:#fff;letter-spacing:-.03em">POUR 통합 지원 체계</span>');
  snap(fin3,C(11)+.15,{d:.46,s0:.80});
})();

/* ============================ SCENE 4 ============================ */
(function(){
  const S=scene('s4'), B=SCN.s4, C=i=>L('s4',i);
  mk('div','veil v-off',{},S);

  const rail=[['01','POUR 본사 미팅'],['02','시공사 방문 미팅'],['03','MOU 체결']];
  const CHK=[C(3)+.95, C(6)+1.50, C(8)+1.20];
  const ACT=[C(1)-.15, C(4)-.15, C(7)-.15];
  rail.forEach(([n,t],i)=>{
    const x=132+i*572;
    const g=mk('div','el',px({left:x,top:132,width:540,zIndex:20}),S);
    const bar=mk('div','',px({width:540,height:4,background:'var(--hair-2)',borderRadius:2,marginBottom:22}),g);
    const fill=mk('div','',px({width:0,height:4,background:'var(--blue-500)',borderRadius:2}),bar);
    const rw=mk('div','',px({display:'flex',alignItems:'baseline',gap:16}),g);
    const num=mk('div','',px({fontSize:34,fontWeight:900,color:'var(--ink-3)',letterSpacing:'.06em'}),rw,n);
    const lb=mk('div','',px({fontSize:30,fontWeight:700,color:'var(--ink-3)',letterSpacing:'-.03em'}),rw,t);
    const ck=mk('div','',px({fontSize:30,fontWeight:900,color:'var(--blue-500)',opacity:0}),rw,'✓');
    wipe(g,B.t0+.15+i*.14,{d:.50,dir:'right'});
    reg(T=>{
      const on=T>=ACT[i], done=T>=CHK[i];
      const p=c01((T-ACT[i])/(CHK[i]-ACT[i]));
      fill.style.width=(540*outCubic(p)).toFixed(1)+'px';
      num.style.color = done?'var(--blue-500)' : on?'var(--ink-1)':'var(--ink-3)';
      lb.style.color  = on?'var(--ink-1)':'var(--ink-3)';
      ck.style.opacity= outBack(c01((T-CHK[i])/.34));
    });
  });
  const intro=mk('div','el',px({left:0,top:470,width:1920,textAlign:'center'}),S,
    '<div class="kicker" style="margin-bottom:20px">COOPERATION PROCESS</div>'+
    '<div style="font-size:72px;font-weight:800;color:#fff;letter-spacing:-.04em">협력 프로세스</div>');
  wipe(intro.firstElementChild,B.t0+.30,{d:.44,dir:'right',out:C(1)-.35,outD:.4});
  words(intro.lastElementChild,B.t0+.44,{step:.10,d:.48,dy:26,out:C(1)-.35,outD:.4});
  intro.style.opacity=1;

  /* STEP 01 */
  const P1=sub(S,C(1)-.15,C(4)-.15,{i:[22,0],o:[-22,0]});
  /* 사진을 배경 전체로, 텍스트가 놓이는 우측만 밝게 눌러준다 */
  const c1=mk('div','bg',{},P1);
  slot(c1,['hq_meeting','ai_meeting_1'],'밝은 회의실에서 도면을 검토하는 관계자',{left:0,top:0,width:'100%',height:'100%'});
  kenburns(c1,C(1),C(4),1.12,1.02,'38%','46%');
  mk('div','veil v-wash-r',{},P1);
  const h1=mk('div','el',px({left:1004,top:352,fontSize:44,fontWeight:800,color:'var(--ink-1)',letterSpacing:'-.035em'}),P1,'POUR 본사 미팅');
  wipe(h1,C(1)+.12,{d:.52,dir:'up'});
  ['기술 운영 방식','현장 지원 체계','협력 방향'].forEach((t,i)=>
    keyRow(P1,t,1006,452+i*106,C(2)+.05+i*.72,42));

  /* STEP 02 */
  const P2=sub(S,C(4)-.15,C(7)-.15,{i:[22,0],o:[-22,0]});
  const c2=mk('div','bg',{},P2);
  slot(c2,['site_visit','ai_inspect_1'],'시공사 방문 · 현장 확인',{left:0,top:0,width:'100%',height:'100%'});
  kenburns(c2,C(4),C(7),1.12,1.02,'62%','46%');
  mk('div','veil v-wash',{},P2);
  const h2=mk('div','el',px({left:120,top:352,fontSize:44,fontWeight:800,color:'var(--ink-1)',letterSpacing:'-.035em'}),P2,'시공사 방문 미팅');
  wipe(h2,C(4)+.12,{d:.52,dir:'up'});
  ['주요 사업','현장 운영 방향','POUR 적용 방식','지원 내용'].forEach((t,i)=>
    keyRow(P2,t,120,436+i*104,C(5)+.05+i*.78,42));

  /* STEP 03 — 실제 MOU 문서 */
  const P3=sub(S,C(7)-.15,B.t1,{i:[70,0]});
  const h3=mk('div','el',px({left:0,top:238,width:1920,textAlign:'center',fontSize:44,fontWeight:800,
    color:'var(--ink-1)',letterSpacing:'-.035em'}),P3,'MOU 체결');
  wipe(h3,C(7)+.10,{d:.52,dir:'up'});
  const DPAD=26, dfb=fitBox('mou_doc',600-DPAD*2,560-DPAD*2,0.76);
  const dw=dfb.w+DPAD*2, dh=dfb.h+DPAD*2;
  const doc=mk('div','pedestal el',px({left:960-dw/2,top:290+(560-dh)/2,width:dw,height:dh}),P3);
  slot(doc,'mou_doc','POUR공법 특허 사용<br>MOU 체결서',{left:DPAD,top:DPAD,width:dfb.w,height:dfb.h},'contain');
  dropCard(doc,C(7)+.60,{d:.86,rot:-2.2,dy:-70});
  const hs=mk('div','card el',px({left:1330,top:564,width:400,height:286}),P3);
  slot(hs,'handshake','악수 (협약 체결)',{left:0,top:0,width:'100%',height:'100%'});
  revealCard(hs,C(8)+.25,{d:.56,dir:'left'});
  const t3=mk('div','el',px({left:120,top:640,fontSize:40,fontWeight:700,color:'var(--ink-2)',letterSpacing:'-.03em'}),P3,
    'POUR공법 특허 사용<br>MOU 체결');
  words(t3,C(8)+.05,{step:.09,d:.44,dy:18});
})();

/* ============================ SCENE 5 ============================ */
(function(){
  const S=scene('s5'), B=SCN.s5, C=i=>L('s5',i);
  S.classList.add('deep');
  mk('div','veil v-hero',{},S);
  const bg=mk('div','bg',{opacity:.30},S);
  slot(bg,'ai_result_1','완성된 현대식 건축물 전경',{left:0,top:0,width:'100%',height:'100%'});
  kenburns(bg,B.t0,B.t1,1.04,1.16);
  const vl=mk('div','veil v-deep',{},S); reg(T=>{ vl.style.opacity=(0.30+0.42*c01((T-C(3))/1.0)).toFixed(3); });

  const t1=mk('div','el',px({left:0,top:376,width:1920,textAlign:'center',fontSize:44,fontWeight:600,
    color:'rgba(255,255,255,.86)',letterSpacing:'-.03em'}),S,'좋은 공법의 기준은 결국');
  words(t1,B.t0+.25,{step:.085,d:.42,dy:18,out:C(1)-.25,outD:.35});
  const t2=mk('div','el',px({left:0,top:452,width:1920,textAlign:'center',fontSize:104,fontWeight:900,
    color:'var(--ink-1)',letterSpacing:'-.045em'}),S,'현장에서 이기는 것');
  snap(t2,B.t0+1.20,{d:.42,s0:.80,out:C(1)-.25,outD:.35});

  /* 선택 → 적용 → 수주 → 실적 */
  const CH=sub(S,C(1)-.15,B.t1,{i:[0,22]});
  const CHAIN=['선택','적용','수주','실적'];
  const WT=[C(1)+.05,C(1)+.52,C(2)+.05,C(2)+.62];
  CHAIN.forEach((w,i)=>{
    const x=210+i*400;
    const e=mk('div','el',px({left:x,top:250,width:300,textAlign:'center',fontSize:82,fontWeight:900,
      color:'var(--ink-1)',letterSpacing:'-.04em'}),CH,w);
    snap(e,WT[i],{d:.30,s0:.62});
    reg(T=>{ const up=outCubic(c01((T-C(3))/.6)); e.style.top=(250-118*up)+'px';
      e.style.fontSize=(82-24*up)+'px'; });
    if(i<3){
      const a=mk('div','el',px({left:x+300,top:274,width:100,textAlign:'center',fontSize:44,
        color:'var(--blue-500)',fontWeight:800}),CH,'→');
      fade(a,WT[i]+.30,.24);
      reg(T=>{ const up=outCubic(c01((T-C(3))/.6)); a.style.top=(272-112*up)+'px'; });
    }
  });

  /* 실적으로 채워지는 현장들 */
  const M=sub(S,C(3)-.15,B.t1,{i:[0,24]});
  const tiles=[[120,250,544,330],[688,250,544,330],[1256,250,544,330],
               [120,604,402,246],[546,604,402,246],[972,604,402,246],[1398,604,402,246]];
  tiles.forEach((t,i)=>{
    const c=mk('div','card el',px({left:t[0],top:t[1],width:t[2],height:t[3]}),M);
    slot(c,'apt_'+(i+1),'아파트 현장 '+(i+1),{left:0,top:0,width:'100%',height:'100%'});
    revealCard(c,C(3)+.05+i*.19,{d:.38,dir:['up','left','down','right'][i%4]});
  });
  const o1=mk('div','el',px({left:0,top:452,width:1920,textAlign:'center'}),M,
    '<span style="display:inline-block;padding:18px 46px;border-radius:8px;background:rgba(6,16,31,.80);'+
    'font-size:56px;font-weight:900;color:#fff;letter-spacing:-.04em">더 많이 수주</span>');
  snap(o1,C(3)+.55,{d:.36,s0:.84,out:C(4)+.02,outD:.26});
  const o2=mk('div','el',px({left:0,top:452,width:1920,textAlign:'center'}),M,
    '<span style="display:inline-block;padding:18px 46px;border-radius:8px;background:rgba(47,123,232,.92);'+
    'font-size:56px;font-weight:900;color:#fff;letter-spacing:-.04em">더 많은 실적</span>');
  snap(o2,C(4)+.36,{d:.36,s0:.84});
})();

/* ============================ FINAL ============================ */
(function(){
  const S=scene('fin'), B=SCN.fin, C=i=>L('s5',i); S.classList.add('deep');
  mk('div','veil v-hero',{},S);
  const lg=mk('div','el',px({left:610,top:246,width:700,height:240,display:'flex',
    alignItems:'center',justifyContent:'center'}),S);
  slot(lg,'pour_logo','POUR 로고',{left:0,top:0,width:'100%',height:'100%'},'contain');
  revealCard(lg,B.t0+.20,{d:.95,dir:'right',r:0,zoom:.10});
  reg(T=>{ const p=outCubic(c01((T-(LE('s5',7)+.15))/1.1));
    lg.style.transform=`translate(0px,${(-26*p).toFixed(1)}px) scale(${(1+0.045*p).toFixed(4)})`; });
  const f1=mk('div','el',px({left:0,top:530,width:1920,textAlign:'center',fontSize:40,fontWeight:600,
    color:'rgba(255,255,255,.80)',letterSpacing:'-.03em'}),S,'기술부터 영업, 현장 적용까지');
  words(f1,C(5)+.15,{step:.085,d:.44,dy:18,out:LE('s5',7)+.35,outD:.55});
  const f2=mk('div','el',px({left:0,top:596,width:1920,textAlign:'center',fontSize:56,fontWeight:800,
    color:'var(--ink-1)',letterSpacing:'-.035em',lineHeight:'1.32'}),S,'시공사가 이길 수 있는<br>모든 과정에 POUR가 함께합니다.');
  words(f2,C(6)+.15,{step:.075,d:.46,dy:22,out:LE('s5',7)+.35,outD:.55});
  const rl=mk('div','el',px({left:910,top:516,width:100,height:3,background:'var(--blue-500)',transformOrigin:'50% 50%'}),S);
  reg(T=>{ const e=outQuint(c01((T-(LE('s5',7)+.55))/.7));
    rl.style.opacity=e*(1-c01((T-(LE('s5',7)+1.05))/.45));
    rl.style.transform=`scaleX(${e.toFixed(3)})`; });

  /* #14 문의 정보 — 컨설팅 내역서에 인쇄된 회사 정보 그대로 */
  const CT=LE('s5',7)+1.30;
  const line=mk('div','el',px({left:660,top:640,width:600,height:1,background:'var(--hair-2)',
    transformOrigin:'50% 50%'}),S);
  reg(T=>{ const e=outQuint(c01((T-CT)/.6)); line.style.opacity=e*.9; line.style.transform=`scaleX(${e.toFixed(3)})`; });

  const co=mk('div','el',px({left:0,top:686,width:1920,textAlign:'center',fontSize:34,fontWeight:800,
    color:'var(--ink-1)',letterSpacing:'-.03em',opacity:1}),S,'주식회사 넷폼알앤디');
  wipe(co,CT+.18,{d:.5,dir:'up'});

  const tel=mk('div','el',px({left:0,top:742,width:1920,textAlign:'center',fontSize:44,fontWeight:800,
    color:'var(--blue-400)',letterSpacing:'-.01em',opacity:1}),S,'TEL. 070-7705-1311');
  wipe(tel,CT+.40,{d:.5,dir:'up'});

  const ad=mk('div','el',px({left:0,top:806,width:1920,textAlign:'center',fontSize:26,fontWeight:600,
    color:'var(--ink-2)',letterSpacing:'-.02em',lineHeight:'1.5',opacity:1}),S,
    'FAX. 031-373-2734　|　경기도 오산시 서동로 77, 3층');
  wipe(ad,CT+.60,{d:.5,dir:'up'});
})();

/* ============================ SUBTITLES + DRIVER ============================ */
const ALL=[]; for(const s of SCRIPT) for(const c of CUE[s.id]) ALL.push(c);
reg(T=>{
  let cur=null;
  for(const c of ALL){ if(T>=c.t0-.12 && T<c.t1-.04){ cur=c; break; } }
  if(!cur){ subEl.style.opacity=0; return; }
  if(subEl.dataset.tx!==cur.tx){ subEl.dataset.tx=cur.tx; subEl.textContent=cur.tx; }
  const a=c01((T-cur.t0)/.20), b=1-c01((T-(cur.t1-.20))/.20);   /* 0.2초 페이드 인·아웃 */
  subEl.style.opacity=Math.min(a,b);
});
reg(T=>{ progEl.style.width=(1920*c01(T/TOTAL))+'px'; });

/* ===== 고정 워드마크 =====
   무대 바깥 레이어에 두어 장면 전환(슬라이드/줌)의 영향을 받지 않는다.
   따라서 전 장면에서 위치·크기가 완전히 동일하다.
   실제 로고 파일이 들어오면 텍스트 대신 원본을 쓰고, 높이만 고정해
   가로세로비를 유지한다(찌그러짐 방지). */
(function(){
  const mark=document.getElementById('mark');
  const lg=AVAILABLE['pour_logo'];
  if(lg){
    const H=30, r=(lg.w&&lg.h)? lg.w/lg.h : 3.4;
    mark.innerHTML='';
    const im=mk('img','',{height:H+'px',width:Math.round(H*r)+'px',objectFit:'contain',display:'block'},mark);
    im.src='assets/'+lg.f;
  }
  const OUT=SCN.fin.t0;                       // 엔딩에서는 중앙 로고에 자리를 내준다
  /* 딥블루 구간 — 그 외에는 모두 밝은 면이므로 워드마크는 기본이 네이비다 */
  const DEEPZ=[
               [SCN.s2.t0-.2, SCN.s2.t0+4.9],            // 260만 카운트업
               [SCN.s3.t0-.2, L('s3',3)-.15],            // 3-1 기술개발·자재생산 + 3-2 공법설명회
               [L('s3',4)-.15, L('s3',6)+.55],           // 3-4 AI·디지털
               [SCN.s5.t0-.2, SCN.fin.t1]];              // 클라이맥스 + 엔딩
  const txt=mark.querySelector('.m');
  reg(T=>{
    const o=outCubic(c01((T-0.35)/.7)) * (1-c01((T-(OUT-.45))/.5));
    mark.style.opacity=o*0.92;
    let f=0;
    for(const [a,b] of DEEPZ) f=Math.max(f, Math.min(c01((T-a+.18)/.36), 1-c01((T-(b-.18))/.36)));
    if(txt){
      const r=Math.round(12+(255-12)*f), g=Math.round(44+(255-44)*f), bl=Math.round(82+(255-82)*f);
      txt.style.color=`rgb(${r},${g},${bl})`;
    }
  });
})();

window.__TOTAL__ = TOTAL;
window.seek = function(T){ for(const p of painters) p(T); };
window.seek(0);
