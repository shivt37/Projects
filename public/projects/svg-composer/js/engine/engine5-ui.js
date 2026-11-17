
(function(){
'use strict';
const E=window.ThicknessEngine,F=window.Engine5;
if(!E||!F){console.warn('Engine 5.0 libs unavailable');return;}
const $=s=>document.querySelector(s);
function groups(parts){
  if(!parts.length)return[];
  const xs=parts.map(p=>({x:E.bounds(p.poly)[0],r:E.bounds(p.poly)[2],h:E.bounds(p.poly)[3]-E.bounds(p.poly)[1]}))
    .sort((a,b)=>a.x-b.x);
  const hs=xs.map(x=>x.h).sort((a,b)=>a-b),th=.35*hs[hs.length>>1];
  const G=[];let cur=[xs[0]],mr=xs[0].r;
  for(const x of xs.slice(1)){if(x.x-mr>th){G.push(cur);cur=[x];mr=x.r;}else{cur.push(x);mr=Math.max(mr,x.r);}}
  G.push(cur);
  return G.map(g=>parts.filter(p=>{const x=E.bounds(p.poly)[0];return g.some(c=>Math.abs(c.x-x)<1e-6);}).map(p=>p.index));
}
function run(text,opts){
  opts=opts||{};
  const parts=E.parseSVG(text);
  if(!parts.length)return{ok:false,reason:'no measurable shapes'};
  const gs=groups(parts);
  let external=null;
  if(opts.referenceSvg){
    const rp=E.parseSVG(opts.referenceSvg);
    if(!rp.length)return{ok:false,reason:'reference SVG has no measurable shapes'};
    const ri=opts.referenceIndices||groups(rp)[0]||rp.map(p=>p.index);
    external=F.referenceByRole(ri.map(i=>rp[i].poly),0.07);
  }
  const refIdx=external?[]:(opts.referenceIndices||gs[0]||parts.map(p=>p.index));
  const res=F.matchSVG(text,{referenceIndices:refIdx,reference:external,targetIndices:opts.targetIndices,spacing:0.07});
  res.groups=gs.length;res.referenceIndices=refIdx;
  return res;
}
window.GlyphBadgeComposer=window.GlyphBadgeComposer||{};
window.GlyphBadgeComposer.matchVisualWeight5=run;
window.GlyphBadgeComposer.Engine5=F;

// ---- Canvas bridge: run Engine 5.0 directly on selected canvas layers ----
function domMatrixArray(m){return m?[m.a,m.b,m.c,m.d,m.e,m.f]:null;}
function renderedTextParts(layer,M){
  const stage=document.querySelector('#bcCanvasLayers');if(!stage)return [];
  const wrap=[...stage.querySelectorAll('[data-layer-id]')].find(n=>n.getAttribute('data-layer-id')===layer.id);
  if(!wrap)return [];
  const out=[],skip=el=>el.closest('defs,metadata,[data-gsp-overlay],[data-gsp-thin-stroke-overlay],.bc-selected-outline,.bc-handle,.bc-transform-handle');
  let wrapCTM;try{wrapCTM=wrap.getCTM();}catch(_){return [];}
  if(!wrapCTM)return [];
  const invWrap=E.matInv(domMatrixArray(wrapCTM));if(!invWrap)return [];
  for(const node of wrap.querySelectorAll('path')){
    if(skip(node))continue;
    const d=node.getAttribute('d');if(!d)continue;
    let nodeCTM;try{nodeCTM=node.getCTM();}catch(_){continue;}
    if(!nodeCTM)continue;
    const rel=E.matMul(invWrap,domMatrixArray(nodeCTM)),world=E.matMul(M,rel);
    let rings;try{rings=E.parsePath(d,0.004);}catch(_){continue;}
    const pts=rings.map(r=>r.map(p=>E.matApply(world,p[0],p[1])));
    E.ringsToPolys(pts).forEach((poly,k)=>out.push({layerId:layer.id,poly,sub:'text-'+out.length+'-'+k,referenceOnly:true}));
  }
  return out;
}
function canvasParts(){
  const G=window.GlyphBadgeComposer,out=[],seen=new Set();
  const walk=layer=>{
    if(layer.type==='group'){(layer.children||[]).forEach(walk);return;}
    if(!G.isLayerUsable(layer.id))return;
    if(seen.has(layer.id))return;seen.add(layer.id);
    const m=G.getLayerWorldMatrix(layer.id);if(!m)return;
    const M=[m.a,m.b,m.c,m.d,m.e,m.f];
    if(layer.type==='path'&&layer.d){
      let rings;try{rings=E.parsePath(layer.d,0.004);}catch(_){return;}
      const world=rings.map(r=>r.map(p=>E.matApply(M,p[0],p[1])));
      E.ringsToPolys(world).forEach((poly,k)=>out.push({layerId:layer.id,poly,sub:k}));
      return;
    }
    if(layer.type==='text')out.push(...renderedTextParts(layer,M));
  };
  G.getSelectedLayerIds().forEach(id=>{const l=G.getLiveLayer(id);if(l)walk(l);});
  return out;
}
function matchCanvas(){
  const G=window.GlyphBadgeComposer;
  const parts=canvasParts();
  if(!parts.length)return{ok:false,reason:'Select measurable path layers (the ★ Key Object and the targets).'};
  const refs=parts.filter(p=>G.isKeyLayerOrDescendant(p.layerId));
  const tgts=parts.filter(p=>!G.isKeyLayerOrDescendant(p.layerId)&&!p.referenceOnly);
  if(!refs.length){
    const keyId=G.getKeyObjectId&&G.getKeyObjectId(),keySelected=keyId&&G.getSelectedLayerIds().includes(keyId);
    if(keySelected)return{ok:false,reason:'The ★ Key Object has no measurable outlines. Enable path rendering with an imported font, or use a path layer as the key.'};
    return{ok:false,reason:'The ★ Key Object must be selected.'};
  }
  if(!tgts.length)return{ok:false,reason:'Select target path layers. Text layers can be references only; they cannot be rewritten by Engine 5.1.'};
  const ref=F.referenceByRole(refs.map(p=>p.poly),0.06);
  if(!ref||!F.roleKeys(ref).length)return{ok:false,reason:'the reference has no measurable stroke roles'};
  const biasInput=document.querySelector('#e5Bias'),bias=biasInput?(parseFloat(biasInput.value)||0)/100:0;
  if(bias&&ref.__global){const f=1+bias;ref.__global.w0*=f;ref.__global.wTheta=ref.__global.wTheta.map(v=>v==null?null:v*f);
   for(const k of F.roleKeys(ref)){if(ref.__reliable&&ref.__reliable[k]){ref[k].w0*=f;ref[k].wTheta=ref[k].wTheta.map(v=>v==null?null:v*f);}}}
  const solved=new Map(),report=[],matrices=new Map();
  for(const p of tgts){
    const sig=F.signature(p.poly,0.06);
    if(!sig){report.push({layerId:p.layerId,role:'unmeasurable',ok:false,reverted:true});continue;}
    const role=F.roleOf(sig);
    const useRef=(ref.__reliable&&ref.__reliable[role])?ref[role]:(ref.__global||ref[role]||F.averageReference(ref));
    const r=F.solve5(p.poly,useRef,{spacing:0.06});
    solved.set(p.layerId+':'+p.sub,r.ok&&!r.reverted?r.poly:p.poly);
    report.push({layerId:p.layerId,role,ok:r.ok,reverted:!!r.reverted,
      before:r.before,after:r.after});
  }
  // Build ALL new path strings before touching the document (atomic commit).
  const newD=new Map();
  for(const p of parts){
    const m=G.getLayerWorldMatrix(p.layerId);
    if(m)matrices.set(p.layerId,[m.a,m.b,m.c,m.d,m.e,m.f]);
  }
  const byLayer=new Map();
  for(const p of parts){
    if(!byLayer.has(p.layerId))byLayer.set(p.layerId,[]);
    byLayer.get(p.layerId).push(p);
  }
  for(const [id,ps] of byLayer){
    if(!report.some(r=>r.layerId===id&&r.ok&&!r.reverted))continue;
    const M=matrices.get(id);if(!M)continue;
    const inv=E.matInv(M);
    newD.set(id,ps.map(p=>E.polyToD(solved.get(id+':'+p.sub)||p.poly,inv)).join(''));
  }
  let before=null;
  try{
    before=G.beginEdit();
    for(const [id,dstr] of newD){const l=G.getLiveLayer(id);if(l&&l.type==='path'){G.clearLayerThinning(id);l.d=dstr;}}
    G.refreshCanvas();
  }catch(e){if(before)G.rollbackEdit(before);return{ok:false,reason:'commit failed: '+e.message};}
  const ok=report.filter(r=>r.ok&&!r.reverted);
  const worstJnd=Math.max(0,...ok.map(r=>r.after.eStem||0));
  return{ok:true,report,changed:ok.length,total:report.length,
    worst:worstJnd,worstStemPct:worstJnd*100*F.JND.stem,reference:ref};
}
window.GlyphBadgeComposer.matchCanvasVisualWeight5=matchCanvas;
const biasEl=$('#e5Bias'),biasVal=$('#e5BiasVal');
if(biasEl&&biasVal)biasEl.addEventListener('input',()=>{biasVal.textContent=biasEl.value;});
const cvBtn=$('#e5CanvasRun');
if(cvBtn)cvBtn.addEventListener('click',()=>{
  let r;try{r=matchCanvas();}catch(e){r={ok:false,reason:e.message};}
  const line=$('#e5CanvasStatus');
  if(r.ok){
   const txt=`${r.changed}/${r.total} layers matched · worst stem error ${r.worstStemPct.toFixed(2)}%`;
   if(line)line.textContent=txt;
   window.GlyphBadgeComposer.setStatus('Engine 5.1 · '+txt,'ok');
   const rep=$('#e5Report');
   if(rep)rep.textContent=r.report.map(x=>`${x.layerId} ${String(x.role).padEnd(11)} w0 ${x.before?x.before.w0.toFixed(3):'n/a'} -> ${x.reverted?'unchanged':(x.after?x.after.w0.toFixed(3):'n/a')}${x.reverted?' (reverted)':''}`).join('\n');
  }else{
   if(line)line.textContent='Engine 5.1: '+r.reason;
   window.GlyphBadgeComposer.setStatus('Engine 5.1: '+r.reason,'warn');
  }
});
let lastOut='';
const out=$('#e5Report'),st=$('#e5Status');
$('#e5Run').addEventListener('click',()=>{
  const text=$('#e5Svg').value.trim();
  if(!text){st.textContent='Paste an SVG first.';return;}
  const refText=$('#e5Ref').value.trim();
  let r;try{r=run(text,refText?{referenceSvg:refText}:{});}catch(e){st.textContent='Error: '+e.message;return;}
  if(!r.ok){st.textContent=r.reason||'failed';return;}
  lastOut=r.svg;
  const fmt=v=>(Number.isFinite(v)?v.toFixed(3):'n/a'),fmtJ=v=>(Number.isFinite(v)?v.toFixed(2):'n/a');
  const roleKeys=F.roleKeys(r.reference);
  const ok=r.report.filter(x=>x.ok&&!x.reverted);
  const errs=ok.map(x=>x.after&&refErr(x,r)).filter(Number.isFinite);
  st.textContent=`${ok.length}/${r.report.length} matched · worst stem error ${(Math.max(0,...errs)*100).toFixed(2)}%`;
  out.textContent='reference roles: '+roleKeys.map(k=>k+'='+fmt(r.reference[k]?.w0)).join(', ')+
    '\n'+r.report.map(x=>`part ${String(x.part).padStart(2)} ${String(x.role).padEnd(9)} w0 ${fmt(x.before?.w0)} -> ${fmt(x.after?.w0)}  J ${fmtJ(x.before?.J)} -> ${fmtJ(x.after?.J)}${x.reverted?'  (unchanged)':''}${x.reason?'  ('+x.reason+')':''}`).join('\n');
  $('#e5Download').disabled=false;
});
function refErr(x,r){
  const keys=F.roleKeys(r.reference);
  const ref=r.reference[x.role]||r.reference[keys[0]];
  if(!x.after||!Number.isFinite(x.after.w0)||!ref||!Number.isFinite(ref.w0)||ref.w0===0)return NaN;
  return Math.abs(x.after.w0-ref.w0)/ref.w0;
}
$('#e5Download').addEventListener('click',()=>{
  if(!lastOut)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([lastOut],{type:'image/svg+xml'}));a.href=url;a.download='engine5-matched.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),2500);
});
})();
