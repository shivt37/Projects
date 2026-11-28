
/* Badge Composer feature module, inlined for the all-in-one edition. */
(()=>{
'use strict';
const $=id=>document.getElementById(id), NS='http://www.w3.org/2000/svg';
const textMode=$('modeTextBtn'),badgeMode=$('modeBadgeBtn'),originalLayout=document.querySelector('.layout'),composer=$('badgeComposerMode');
textMode.addEventListener('click',()=>{originalLayout.style.display='';composer.classList.remove('active');textMode.classList.add('active');textMode.setAttribute('aria-pressed','true');badgeMode.classList.remove('active');badgeMode.setAttribute('aria-pressed','false');const skip=$('skipToWork');if(skip)skip.href='#workspacePanel';});
badgeMode.addEventListener('click',()=>{originalLayout.style.display='none';composer.classList.add('active');composer.setAttribute('tabindex','-1');badgeMode.classList.add('active');badgeMode.setAttribute('aria-pressed','true');textMode.classList.remove('active');textMode.setAttribute('aria-pressed','false');const skip=$('skipToWork');if(skip)skip.href='#badgeComposerMode';render();requestAnimationFrame(fitStage);});
let W=320,H=90,layers=[],selectedId=null,selectedIds=new Set(),keyObjectId=null,history=[],future=[],drag=null,pathEditId=null,gridOn=false,snapOn=false,checkerOn=true,zoom=100,autoFit=true,imageReplaceTargetId=null,svgjs=null,svgjsPromise=null,svgo=null,svgoPromise=null,opentypePromise=null,hbModule=null,hbPromise=null;
const fonts=new Map(),hbFonts=new Map(),opticalFontFaces=new Map();
function getProjectFontShelf(){const out=[],seen=new Set();const walk=arr=>{for(const layer of arr||[]){if(layer.type==='text'&&layer.fontData){const key=layer.fontData;if(!seen.has(key)){seen.add(key);out.push({id:layer.id,name:layer.fontName||layer.fontFamily||'Embedded font'});}}if(layer.type==='group')walk(layer.children||[]);}};walk(layers);return out;}
function importWithTimeout(url,ms=6000){let timer;const parsed=new URL(url,document.baseURI);const task=import(parsed.href);return Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Loading '+parsed.hostname+' timed out.')),ms);})]).finally(()=>clearTimeout(timer));}
const uid=()=>`l_${Math.random().toString(36).slice(2,9)}${Date.now().toString(36).slice(-3)}`;
const clone=x=>JSON.parse(JSON.stringify(x));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const safeName=s=>String(s||'badge').trim().replace(/[^a-z0-9._-]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,70)||'badge';
const MAX_PORTABLE_PROJECT_BYTES=100*1024*1024;
function assertPortableProjectSize(blobOrText,label='Project'){const size=blobOrText instanceof Blob?blobOrText.size:new Blob([String(blobOrText??'')]).size;if(size>MAX_PORTABLE_PROJECT_BYTES)throw new Error(`${label} is ${(size/1048576).toFixed(1)} MB; the portable project limit is 100 MB. Reduce embedded assets or export in smaller parts.`);return size;}
const num=(v,f=0)=>{const n=Number(v);if(Number.isFinite(n))return n;const p=parseFloat(v);return Number.isFinite(p)?p:f;};
function regularShapePath(sides,radius,innerRadius=0,rotation=0){const count=Math.max(3,Math.min(64,Math.round(num(sides,6)))),r=Math.max(.1,num(radius,20)),star=Number(innerRadius)>0,inner=star?Math.max(.1,Math.min(r*.9,num(innerRadius,r*.45))):0,points=[];const total=star?count*2:count;for(let i=0;i<total;i++){const a=(rotation-90+i*360/total)*Math.PI/180,rr=star&&i%2?inner:r;points.push([Math.cos(a)*rr,Math.sin(a)*rr]);}return points.map((p,i)=>(i?'L':'M')+p.map(v=>Number(v.toFixed(3))).join(' ')).join(' ')+' Z';}
function addGeneratedShape(kind){const isStar=kind==='star',sides= isStar?5:6,radius= isStar?22:20;add('path',{name:isStar?'Star':'Polygon',x:W/2,y:H/2,d:regularShapePath(sides,radius,isStar?radius*.46:0),generatedShape:kind,shapeSides:sides,shapeRadius:radius,shapeInnerRadius:isStar?radius*.46:0});}
function current(){return findLayer(selectedId)||null}
const BADGE_DRAFT_DB_NAME='GlyphStudioBadgeDrafts';
const BADGE_DRAFT_STORE_NAME='drafts';
let badgeDraftDbConnection=null,badgeDraftDbOpening=null,badgeDraftDbLastError=null;
function badgeDraftDbIsUsable(db){
 try{return !!db&&typeof db.transaction==='function'&&!!db.objectStoreNames&&typeof db.objectStoreNames.contains==='function'&&db.objectStoreNames.contains(BADGE_DRAFT_STORE_NAME);}catch(_){return false;}
}
function discardBadgeDraftDb(db){
 const target=db||badgeDraftDbConnection;
 if(target===badgeDraftDbConnection)badgeDraftDbConnection=null;
 try{target?.close?.();}catch(_){}
}
function openBadgeDraftDb(versionOverride=null,repairMissingStore=true){
 return new Promise((resolve,reject)=>{
  if(!window.indexedDB||typeof window.indexedDB.open!=='function'){reject(new Error('IndexedDB is unavailable in this browser context.'));return;}
  let request,settled=false,blocked=false,timer=null;
  const finish=(fn,value)=>{if(settled)return false;settled=true;if(timer)clearTimeout(timer);fn(value);return true;};
  try{request=versionOverride==null?window.indexedDB.open(BADGE_DRAFT_DB_NAME):window.indexedDB.open(BADGE_DRAFT_DB_NAME,versionOverride);}catch(err){finish(reject,err);return;}
  timer=setTimeout(()=>finish(reject,new Error(blocked?'Opening draft storage is blocked by another tab.':'Opening draft storage timed out.')),15000);
  request.onupgradeneeded=()=>{
   try{const db=request.result;if(!db.objectStoreNames.contains(BADGE_DRAFT_STORE_NAME))db.createObjectStore(BADGE_DRAFT_STORE_NAME);}
   catch(err){try{request.transaction?.abort();}catch(_){}finish(reject,err);}
  };
  request.onblocked=()=>{blocked=true;};
  request.onerror=()=>finish(reject,request.error||new Error('Could not open IndexedDB draft storage.'));
  request.onsuccess=()=>{
   const db=request.result;
   const hasStore=!!db?.objectStoreNames&&typeof db.objectStoreNames.contains==='function'&&db.objectStoreNames.contains(BADGE_DRAFT_STORE_NAME);
   if(!hasStore&&db&&repairMissingStore&&Number.isFinite(Number(db.version))){
    const nextVersion=Math.max(1,Number(db.version)+1);try{db.close();}catch(_){}
    openBadgeDraftDb(nextVersion,false).then(value=>finish(resolve,value),err=>finish(reject,err));
    return;
   }
   if(!badgeDraftDbIsUsable(db)){
    try{db?.close?.();}catch(_){}
    const detail={type:db?.constructor?.name||typeof db,transaction:typeof db?.transaction,name:db?.name||null,version:db?.version??null,stores:db?.objectStoreNames?Array.from(db.objectStoreNames):[]};
    finish(reject,new TypeError('IndexedDB opened an invalid draft database handle: '+JSON.stringify(detail)));
    return;
   }
   if(!finish(resolve,db)){try{db.close();}catch(_){}return;}
   badgeDraftDbConnection=db;
   db.onversionchange=()=>discardBadgeDraftDb(db);
   db.onclose=()=>{if(badgeDraftDbConnection===db)badgeDraftDbConnection=null;};
  };
 });
}
function getBadgeDraftDb(forceReopen=false){
 if(forceReopen)discardBadgeDraftDb();
 if(badgeDraftDbIsUsable(badgeDraftDbConnection))return Promise.resolve(badgeDraftDbConnection);
 if(badgeDraftDbOpening)return badgeDraftDbOpening;
 const pending=openBadgeDraftDb();badgeDraftDbOpening=pending;
 pending.then(()=>{if(badgeDraftDbOpening===pending)badgeDraftDbOpening=null;},()=>{if(badgeDraftDbOpening===pending)badgeDraftDbOpening=null;});
 return pending;
}
async function badgeDraftDbTransaction(mode,makeRequest){
 let lastError=null;
 for(let attempt=0;attempt<2;attempt++){
  let db=null;
  try{
   db=await getBadgeDraftDb(attempt>0);
   if(!badgeDraftDbIsUsable(db))throw new TypeError('Draft database connection is invalid; transaction() is unavailable or the drafts store is missing.');
   return await new Promise((resolve,reject)=>{
    let tx,request,result,settled=false;
    const finish=(fn,value)=>{if(settled)return;settled=true;fn(value);};
    try{tx=db.transaction(BADGE_DRAFT_STORE_NAME,mode);request=makeRequest(tx.objectStore(BADGE_DRAFT_STORE_NAME));}
    catch(err){finish(reject,err);return;}
    if(request&&typeof request==='object'){
     request.onsuccess=()=>{result=request.result;};
     request.onerror=()=>finish(reject,request.error||new Error('Draft storage request failed.'));
    }
    tx.oncomplete=()=>finish(resolve,result);
    tx.onerror=()=>finish(reject,tx.error||request?.error||new Error('Draft storage transaction failed.'));
    tx.onabort=()=>finish(reject,tx.error||request?.error||new Error('Draft storage transaction was aborted.'));
   });
  }catch(err){
   lastError=err;badgeDraftDbLastError=err;
   const retryable=!badgeDraftDbIsUsable(db)||err?.name==='InvalidStateError'||err?.name==='NotFoundError'||/transaction is not a function|transaction\(\) is unavailable/i.test(String(err?.message||''));
   if(attempt===0&&retryable){discardBadgeDraftDb(db);continue;}
   throw err;
  }
 }
 throw lastError||new Error('Draft storage failed after reconnecting.');
}
let badgeDraftWriteQueue=Promise.resolve(),badgeDraftWriteVersion=0,badgeDraftSaveTimer=null,badgeDraftPendingResolve=null;
let badgeDraftRevision=0;function badgeDraftRecord(){return{format:'GlyphStudioBadgeDraft',version:4,revision:++badgeDraftRevision,savedAt:Date.now(),W,H,canvas:readBadgeCanvasSettings(),exportSettings:typeof readBcExportSettings==='function'?readBcExportSettings():null,layers,selectedId,selectedIds:[...selectedIds],keyObjectId};}
function parseBadgeDraftForCompare(value){try{const record=typeof value==='string'?JSON.parse(value):value;if(!record||record.format!=='GlyphStudioBadgeDraft'||!Array.isArray(record.layers))return null;const savedAt=Number(record.savedAt)||Date.parse(record.savedAt)||0;return{value,record,savedAt,revision:Number(record.revision)||0};}catch(_){return null;}}
async function readStoredBadgeDraft(){let idbValue=null,localValue=null;try{idbValue=await badgeDraftDbTransaction('readonly',store=>store.get('latest'));}catch(err){badgeDraftDbLastError=err;console.warn('[Glyph Studio] Draft recovery from IndexedDB failed:',err);}try{localValue=localStorage.getItem('glyphStudioBadgeDraft');}catch(_){}const idb=parseBadgeDraftForCompare(idbValue),local=parseBadgeDraftForCompare(localValue);let winner=null;if(idb&&local){winner=(local.savedAt>idb.savedAt||(local.savedAt===idb.savedAt&&local.revision>idb.revision))?local:idb;}else winner=idb||local;if(!winner)return null;if(winner===local&&localValue!=null){try{await badgeDraftDbTransaction('readwrite',store=>store.put(typeof localValue==='string'?localValue:JSON.stringify(localValue),'latest'));try{if(localStorage.getItem('glyphStudioBadgeDraft')===localValue)localStorage.removeItem('glyphStudioBadgeDraft');}catch(_){}}catch(err){console.warn('[Glyph Studio] Newer local fallback draft could not be migrated yet:',err);}}return winner.value;}
function flushBadgeDraftNow(){
 if(badgeDraftSaveTimer){clearTimeout(badgeDraftSaveTimer);badgeDraftSaveTimer=null;}
 if(!badgeDraftPendingResolve)return badgeDraftWriteQueue;
 const settle=badgeDraftPendingResolve;badgeDraftPendingResolve=null;let data;
 try{data=JSON.stringify(badgeDraftRecord());}catch(err){status('Draft NOT saved: project data could not be serialized. '+err.message,'error');settle(false);return Promise.resolve(false);}
 const version=++badgeDraftWriteVersion;
 badgeDraftWriteQueue=badgeDraftWriteQueue.catch(()=>{}).then(async()=>{
  try{
   await badgeDraftDbTransaction('readwrite',store=>store.put(data,'latest'));
   badgeDraftDbLastError=null;try{localStorage.removeItem('glyphStudioBadgeDraft');}catch(_){}
  }catch(idbError){
   badgeDraftDbLastError=idbError;
   if(data.length>900000){
    const reason=idbError?.name==='QuotaExceededError'?'The browser reported that its IndexedDB storage quota was exceeded.':`IndexedDB draft storage failed (${idbError?.name||'Error'}: ${idbError?.message||String(idbError)}).`;
    throw new Error(reason+' This project is too large for the small localStorage fallback. Download a project backup before continuing.');
   }
   try{localStorage.setItem('glyphStudioBadgeDraft',data);}
   catch(storageError){throw new Error(`IndexedDB draft storage failed (${idbError?.name||'Error'}: ${idbError?.message||String(idbError)}); localStorage fallback failed (${storageError?.name||'Error'}: ${storageError?.message||String(storageError)}).`);}
  }
  return true;
 }).catch(err=>{
  console.warn('Badge autosave failed:',err);
  if(version===badgeDraftWriteVersion)status('Draft NOT saved. '+err.message,'error');
  return false;
 });
 badgeDraftWriteQueue.then(ok=>settle(ok));
 return badgeDraftWriteQueue;
}
function persistBadgeDraft(){if(badgeDraftSaveTimer)clearTimeout(badgeDraftSaveTimer);if(badgeDraftPendingResolve){badgeDraftPendingResolve(false);badgeDraftPendingResolve=null;}return new Promise(resolve=>{badgeDraftPendingResolve=resolve;badgeDraftSaveTimer=setTimeout(()=>flushBadgeDraftNow(),350);});}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushBadgeDraftNow();});
window.addEventListener('pagehide',()=>{flushBadgeDraftNow();});
let badgeTemplateStorageMode='indexedDB';
let badgeTemplateDbConnection=null,badgeTemplateDbOpening=null;
function badgeTemplateDbUsable(db){try{return !!db&&typeof db.transaction==='function'&&db.objectStoreNames?.contains('templates');}catch(_){return false;}}
async function getBadgeTemplateDb(force=false){
 if(force){try{badgeTemplateDbConnection?.close?.();}catch(_){}badgeTemplateDbConnection=null;badgeTemplateDbOpening=null;}
 if(badgeTemplateDbUsable(badgeTemplateDbConnection))return badgeTemplateDbConnection;
 if(badgeTemplateDbOpening)return badgeTemplateDbOpening;
 badgeTemplateDbOpening=new Promise((resolve,reject)=>{
  let req;try{if(!window.indexedDB?.open)throw new Error('IndexedDB is unavailable in this browser context.');req=indexedDB.open('GlyphStudioBadgeTemplates',1);}catch(err){reject(err);return;}
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('templates'))db.createObjectStore('templates');};
  req.onerror=()=>reject(req.error||new Error('Could not open template storage.'));
  req.onblocked=()=>reject(new Error('Template storage is blocked by another open browser tab.'));
  req.onsuccess=()=>{const db=req.result;if(!badgeTemplateDbUsable(db)){try{db?.close?.();}catch(_){}reject(new Error('Template database connection is invalid.'));return;}badgeTemplateDbConnection=db;db.onversionchange=()=>{try{db.close();}catch(_){}if(badgeTemplateDbConnection===db)badgeTemplateDbConnection=null;};db.onclose=()=>{if(badgeTemplateDbConnection===db)badgeTemplateDbConnection=null;};resolve(db);};
 }).finally(()=>{badgeTemplateDbOpening=null;});
 return badgeTemplateDbOpening;
}
async function badgeTemplateDbAction(mode,method,name,value){
 let lastError;
 for(let attempt=0;attempt<2;attempt++){
  let db;
  try{
   db=await getBadgeTemplateDb(attempt>0);
   return await new Promise((resolve,reject)=>{
    let tx,req,result;
    try{
     tx=db.transaction('templates',mode);const store=tx.objectStore('templates');
     if(method==='keys')req=store.getAllKeys();
     else if(method==='get')req=store.get(name);
     else if(method==='put')req=store.put(value,name);
     else if(method==='delete')req=store.delete(name);
     else throw new Error('Unknown template database operation: '+method);
     if(req){req.onsuccess=()=>result=req.result;req.onerror=()=>reject(req.error||new Error('Template storage request failed.'));}
     tx.oncomplete=()=>resolve(method==='put'||method==='delete'?true:result);
     tx.onerror=()=>reject(tx.error||req?.error||new Error('Template storage transaction failed.'));
     tx.onabort=()=>reject(tx.error||req?.error||new Error('Template storage transaction aborted.'));
    }catch(err){reject(err);}
   });
  }catch(err){lastError=err;if(attempt===0&&(!badgeTemplateDbUsable(db)||['InvalidStateError','NotFoundError','TransactionInactiveError'].includes(err?.name))){try{db?.close?.();}catch(_){}badgeTemplateDbConnection=null;continue;}throw err;}
 }
 throw lastError||new Error('Template storage failed after reconnecting.');
}

function badgeTemplateFallback(method,name,value){
 const key='glyphStudioBadgeTemplatesV1';let records;
 try{records=JSON.parse(localStorage.getItem(key)||'{}');if(!records||typeof records!=='object'||Array.isArray(records))records={};}catch(_){records={};}
 if(method==='put'){
  records[name]=value;const json=JSON.stringify(records);
  // Web Storage is deliberately only a small-template fallback. Large font/image data must use a file or IndexedDB.
  if(json.length>900000)throw new Error('This template contains too much embedded data for browser localStorage. Use Download template to save it as a file.');
  try{localStorage.setItem(key,json);}catch(err){throw new Error('Browser storage quota is full. Use Download template to save this design as a portable JSON file.');}return true;
 }
 if(method==='get')return records[name]||undefined;
 if(method==='delete'){delete records[name];localStorage.setItem(key,JSON.stringify(records));return true;}
 if(method==='keys')return Object.keys(records);
 throw new Error('Unknown template storage operation.');
}
async function badgeTemplateRequest(mode,method,name,value){
 const fallbackKeys=()=>{try{const records=JSON.parse(localStorage.getItem('glyphStudioBadgeTemplatesV1')||'{}');return records&&typeof records==='object'&&!Array.isArray(records)?records:{};}catch(_){return {};}};
 try{
  if(method==='keys'){
   let keys=[];try{keys=await badgeTemplateDbAction('readonly','keys')||[];}catch(err){badgeTemplateStorageMode='localStorage';}const records=fallbackKeys();return [...new Set([...(keys||[]),...Object.keys(records)])].sort((a,b)=>String(a).localeCompare(String(b)));
  }
  if(method==='get'){
   let stored;let dbError=null;try{stored=await badgeTemplateDbAction('readonly','get',name);}catch(err){dbError=err;badgeTemplateStorageMode='localStorage';}
   const fallback=fallbackKeys(),local=fallback[name];
   const stamp=value=>{const raw=value?.savedAt;const parsed=typeof raw==='number'?raw:Date.parse(raw||'');return Number.isFinite(parsed)?parsed:0;};
   if(stored!==undefined&&local!==undefined){
    const winner=stamp(local)>stamp(stored)?local:stored;
    if(winner===local){try{await badgeTemplateDbAction('readwrite','put',name,local);delete fallback[name];try{localStorage.setItem('glyphStudioBadgeTemplatesV1',JSON.stringify(fallback));}catch(_){}}catch(_){/* Keep the newer fallback record intact if migration cannot complete. */}return local;}
    return stored;
   }
   if(stored!==undefined)return stored;
   if(local!==undefined){try{await badgeTemplateDbAction('readwrite','put',name,local);delete fallback[name];try{localStorage.setItem('glyphStudioBadgeTemplatesV1',JSON.stringify(fallback));}catch(_){}}catch(_){/* The fallback remains recoverable. */}return local;}
   if(dbError)throw dbError;return undefined;
  }
  if(method==='put'){
   try{await badgeTemplateDbAction('readwrite','put',name,value);const fallback=fallbackKeys();if(fallback[name]!==undefined){delete fallback[name];try{localStorage.setItem('glyphStudioBadgeTemplatesV1',JSON.stringify(fallback));}catch(_){}}return true;}
   catch(err){if(err?.name==='QuotaExceededError')throw new Error('Browser template storage quota was exceeded. Download this template as a file before continuing.');const fallback=fallbackKeys();fallback[name]=value;const json=JSON.stringify(fallback);if(json.length>900000)throw new Error(`Template database failed (${err?.name||'Error'}: ${err?.message||String(err)}), and this template is too large for the localStorage fallback. Download template as a file.`);try{localStorage.setItem('glyphStudioBadgeTemplatesV1',json);return true;}catch(storageError){throw new Error(`Template database failed (${err?.message||String(err)}); local fallback failed (${storageError?.message||String(storageError)}).`);}}
  }
  if(method==='delete'){
   let dbError=null;try{await badgeTemplateDbAction('readwrite','delete',name);}catch(err){dbError=err;}
   const fallback=fallbackKeys();if(name in fallback){delete fallback[name];try{localStorage.setItem('glyphStudioBadgeTemplatesV1',JSON.stringify(fallback));}catch(err){if(dbError)throw new Error(`Could not delete template from IndexedDB (${dbError.message}) or local fallback (${err.message}).`);throw err;}}
   if(dbError&&!(name in fallback))throw dbError;return true;
  }
  throw new Error('Unknown template storage operation.');
 }catch(err){throw err;}
}

function readBadgeCanvasSettings(){return {padding:Math.max(0,Math.min(1000,num($('bcCanvasPadding')?.value,12))),checker:!!$('bcChecker')?.checked,grid:!!gridOn,gridSize:Math.max(2,Math.min(200,Math.round(num($('bcGridSize')?.value,10)))),snap:!!snapOn,zoom:Math.max(1,Math.min(2000,num(zoom,100))),autoFit:!!autoFit,showCenterGuides:!!$('bcShowCenterGuides')?.checked,showTypographyGuides:$('bcShowTypographyGuides')?.checked!==false};}
function applyBadgeCanvasSettings(c={}){$('bcCanvasPadding').value=Math.max(0,Math.min(1000,num(c.padding,12)));$('bcChecker').checked=c.checker!==false;$('bcStage').classList.toggle('bc-checker',$('bcChecker').checked);gridOn=!!c.grid;$('bcGrid').checked=gridOn;$('bcGridSize').value=Math.max(2,Math.min(200,Math.round(num(c.gridSize,10))));snapOn=!!c.snap;$('bcSnap').checked=snapOn;zoom=Math.max(1,Math.min(2000,num(c.zoom,100)));autoFit=c.autoFit!==false;$('bcZoom').value=String(Math.round(zoom));if($('bcShowCenterGuides'))$('bcShowCenterGuides').checked=!!c.showCenterGuides;if($('bcShowTypographyGuides'))$('bcShowTypographyGuides').checked=c.showTypographyGuides!==false;}
function currentBadgeTemplateRecord(name='') {return {format:'GlyphStudioBadgeTemplate',version:2,name,savedAt:new Date().toISOString(),width:W,height:H,selectedId:findLayer(selectedId)?selectedId:null,selectedIds:[...selectedIds].filter(id=>findLayer(id)),keyObjectId:findLayer(keyObjectId)?keyObjectId:null,layers:sanitizeProjectLayers(clone(layers)),canvas:readBadgeCanvasSettings(),exportSettings:typeof readBcExportSettings==='function'?readBcExportSettings():null};}
async function refreshBadgeTemplateList(){const select=$('bcSavedTemplateSelect');if(!select)return;const previous=select.value;try{const keys=await badgeTemplateRequest('readonly','keys');select.replaceChildren(new Option('Saved templates…',''));keys.map(String).sort((a,b)=>a.localeCompare(b)).forEach(name=>select.add(new Option(name,name)));if(keys.includes(previous))select.value=previous;$('bcDeleteTemplate').disabled=!select.value;}catch(err){select.replaceChildren(new Option('Use Import template for file-based templates',''));$('bcDeleteTemplate').disabled=true;status('Saved templates unavailable: '+err.message,'error');}}
function downloadBadgeTemplate(record){const json=JSON.stringify(record,null,2);const blob=new Blob([json],{type:'application/json;charset=utf-8'});assertPortableProjectSize(blob,'Template export');download(blob,safeName(record.name||'badge-template')+'.glyph-template.json');}
async function saveBadgeTemplate(){const name=$('bcTemplateName').value.trim().slice(0,64);if(!name){status('Enter a name for this template.','error');$('bcTemplateName').focus();return;}const record=currentBadgeTemplateRecord(name);try{await badgeTemplateRequest('readwrite','put',name,record);await refreshBadgeTemplateList();$('bcSavedTemplateSelect').value=name;$('bcDeleteTemplate').disabled=false;status(`Template “${name}” saved on this device with canvas, export settings, fonts and images.`,'ok');}catch(err){if(/Download template|quota|localStorage|storage is full/i.test(err.message)){try{downloadBadgeTemplate(record);status(`Browser storage could not hold “${name}”. A complete template JSON file was downloaded instead; use Import template to load it later.`,'ok');}catch(exportError){status('Template could not be saved or downloaded: '+exportError.message,'error');}}else status('Template could not be saved: '+err.message,'error');}}
async function applyBadgeTemplateRecord(record,nameHint='template'){
 if(!record||record.format!=='GlyphStudioBadgeTemplate'||![1,2].includes(record.version))throw new Error('This is not a supported Badge Composer template.');
 const width=Number(record.width),height=Number(record.height);if(!Number.isFinite(width)||width<1||width>10000||!Number.isFinite(height)||height<1||height>5000)throw new Error('Template artboard dimensions are outside the supported range.');
 const nextLayers=sanitizeProjectLayers(record.layers);snap();W=width;H=height;layers=nextLayers;fonts.clear();hbFonts.clear();opticalFontFaces.forEach(entry=>{if(entry?.face){try{document.fonts.delete(entry.face);}catch(_){}}});opticalFontFaces.clear();pathEditId=null;drag=null;
 const valid=new Set(allLayers(layers).map(l=>l.id));selectedIds=new Set((record.selectedIds||[]).filter(id=>valid.has(id)));selectedId=valid.has(record.selectedId)?record.selectedId:[...selectedIds][0]||layers[0]?.id||null;if(selectedId&&!selectedIds.has(selectedId))selectedIds.add(selectedId);keyObjectId=valid.has(record.keyObjectId)?record.keyObjectId:null;
 applyBadgeCanvasSettings(record.canvas||{});if(record.exportSettings&&typeof applyBcExportSettings==='function')applyBcExportSettings(record.exportSettings);
 const fontRestore=await prepareVisibleOpticalFonts();if(fontRestore.warning)status(fontRestore.warning,'warn');
 render();if(autoFit)fitStage();else renderCanvas();persistBadgeDraft();status(`Template “${record.name||nameHint}” loaded · ${countLayers()} layers · ${W} × ${H}.`,'ok');
}
async function loadBadgeTemplate(){const name=$('bcSavedTemplateSelect').value;if(!name){status('Choose a saved template first.','error');return;}try{const record=await badgeTemplateRequest('readonly','get',name);await applyBadgeTemplateRecord(record,name);}catch(err){status('Template could not be loaded: '+err.message,'error');}}
async function deleteBadgeTemplate(){
 const select=$('bcSavedTemplateSelect'),name=String(select?.value||'').trim();
 if(!name){status('Choose a saved template first.','error');return;}
 if(typeof window.confirm==='function'&&!window.confirm(`Delete the saved template “${name}” from this device?`))return;
 try{
  await badgeTemplateRequest('readwrite','delete',name);
  await refreshBadgeTemplateList();
  if($('bcTemplateName'))$('bcTemplateName').value='';
  if(select)select.value='';
  $('bcDeleteTemplate').disabled=true;
  status(`Template “${name}” deleted from this device.`,'ok');
 }catch(err){status('Template could not be deleted: '+(err?.message||String(err)),'error');}
}
async function importBadgeTemplateFile(file){if(!file)return;try{if(file.size>MAX_PORTABLE_PROJECT_BYTES)throw Error('Template file exceeds the 100 MB portable project limit.');const record=JSON.parse(await file.text());await applyBadgeTemplateRecord(record,file.name);}catch(err){status('Template import failed: '+err.message,'error');}}


// 0.6.49: free canvas dragging by default, transform-aware movement, precision keyboard nudges and explicit grid snapping.
// 0.6.50: default arrow-key nudge reduced from 1 to 0.01 SVG unit.
// 0.6.51: validated/reopenable IndexedDB draft connection, retryable transactions and precise storage errors.
// 0.6.48: signed source-based path thickness, safe outward expansion, inherited group strokes and icon-bridged row detection.
// 0.6.31: temporary geometry previews are kept outside the project model until committed.
// 0.6.34: precision inset entry and selectable joins.
// 0.6.35: stronger topology/area validation and more precise safe-limit search.
let pathInsetPreviewState=null;
let pathInsetPreviewTask=0;
let pathInsetPreviewTimer=null;
let pathInsetPreviewPendingRootId=null;let pathRoundPreviewState=null,pathRoundPreviewTimer=null;const pathRoundPreviewById=new Map();
const pathInsetPreviewDrafts=new Map();
const pathInsetPreviewTimers=new Map();
const pathInsetPreviewTasks=new Map();
let pathInsetCornerJoin='miter';
let pathOffsetCornerJoin='miter';
let pathThicknessDirection='in';
let pathInsetSafeLimitState=null;
let pathExpansionSafeLimitState=null;
// Path thickness has no arbitrary UI amount ceiling. The numeric field accepts
// any finite non-negative SVG-unit amount; the range control expands its domain
// dynamically. Geometry validation, not a hard-coded number, determines safety.
const PATH_THICKNESS_SLIDER_MIN_MAX=10;
function pathThicknessSliderMax(value,minimum=PATH_THICKNESS_SLIDER_MIN_MAX){
 const n=Number(value),base=Number.isFinite(n)?Math.max(0,n):0;
 const expanded=base>0&&base<=Number.MAX_VALUE/1.25?base*1.25:base;
 const floor=Number.isFinite(Number(minimum))?Math.max(0,Number(minimum)):PATH_THICKNESS_SLIDER_MIN_MAX;
 return Math.max(floor,base,expanded);
}
function pathThicknessSliderStep(max){
 const n=Number(max);
 return Number.isFinite(n)&&n>0.001&&n<=100?0.001:Number.isFinite(n)&&n>100?n/1000:0.001;
}
function growPathThicknessSlider(range){
 if(!range)return;
 const current=Number(range.value)||0,max=Number(range.max)||PATH_THICKNESS_SLIDER_MIN_MAX;
 if(current<max*.999999)return;
 const next=max<=Number.MAX_VALUE/2?max*2:Number.MAX_VALUE;
 if(next>max){range.max=String(next);range.step=String(pathThicknessSliderStep(next));}
}
const HISTORY_MAX_ENTRIES=80,HISTORY_MAX_BYTES=96*1024*1024,HISTORY_ASSET_THRESHOLD=4096;
const historyAssetVault=new Map();let historyEncodedBytes=0,historyAssetBytes=0;
function historyAssetKey(value){let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return `${value.length}_${(hash>>>0).toString(16)}`;}
function captureHistoryEntry(source=null){
 const state=source==null?{W,H,layers,selectedId,selectedIds:[...selectedIds],keyObjectId}:(typeof source==='string'?JSON.parse(source):source),refs=new Set();
 const assetKeys=new Set(['fontData','href','markup','d','thinSourceD','pathOffsetSourceD']);
 const encoded=JSON.stringify(state,(key,value)=>{if(assetKeys.has(key)&&typeof value==='string'&&value.length>=HISTORY_ASSET_THRESHOLD){let base=historyAssetKey(value),id=base,suffix=0;while(historyAssetVault.has(id)&&historyAssetVault.get(id).value!==value)id=`${base}_${++suffix}`;if(!historyAssetVault.has(id)){historyAssetVault.set(id,{value,refs:0,bytes:value.length*2});historyAssetBytes+=value.length*2;}refs.add(id);return{__gspHistoryAssetRef:id};}return value;});
 const assetRefs=[...refs];for(const id of assetRefs)historyAssetVault.get(id).refs++;
 const entry={__gspHistoryEntry:1,encoded,assetRefs,bytes:encoded.length*2};historyEncodedBytes+=entry.bytes;return entry;
}
function releaseHistoryEntry(entry){if(!entry?.__gspHistoryEntry)return;historyEncodedBytes=Math.max(0,historyEncodedBytes-entry.bytes||0);for(const id of entry.assetRefs||[]){const item=historyAssetVault.get(id);if(!item)continue;item.refs--;if(item.refs<=0){historyAssetBytes=Math.max(0,historyAssetBytes-item.bytes);historyAssetVault.delete(id);}}}
function reviveHistoryEntry(entry){return JSON.parse(entry.encoded,(key,value)=>{if(value&&typeof value==='object'&&typeof value.__gspHistoryAssetRef==='string'){const asset=historyAssetVault.get(value.__gspHistoryAssetRef);if(!asset)throw new Error('An embedded asset required by this undo record has expired.');return asset.value;}return value;});}
function trimHistory(){const total=()=>historyEncodedBytes+historyAssetBytes;while(history.length>HISTORY_MAX_ENTRIES){const old=history.shift();releaseHistoryEntry(old);}while(total()>HISTORY_MAX_BYTES&&(history.length||future.length)){const old=history.length?history.shift():future.shift();releaseHistoryEntry(old);}}
function clearHistory(){for(const item of history)releaseHistoryEntry(item);for(const item of future)releaseHistoryEntry(item);history=[];future=[];historyAssetVault.clear();historyEncodedBytes=0;historyAssetBytes=0;updateHistory();}
function pushHistoryEntry(entry,clearRedo=true){if(clearRedo){for(const item of future)releaseHistoryEntry(item);future=[];}history.push(entry);trimHistory();if(!history.includes(entry))status('This change could not be retained in Undo history because the project exceeded the 96 MB history memory budget. The edit itself is kept; consider reducing embedded assets or exporting a backup.','warn');updateHistory();}
function finishHistoryEdit(entry,changed){if(!entry)return;if(changed)pushHistoryEntry(entry);else releaseHistoryEntry(entry);}
function badgeInspectorHistorySnapshot(){return JSON.stringify({W,H,layers,selectedId,selectedIds:[...selectedIds],keyObjectId});}
function finishBadgeInspectorHistory(before){if(before==null)return false;const after=badgeInspectorHistorySnapshot();if(before===after)return false;pushHistoryEntry(captureHistoryEntry(before));return true;}
function historyMemoryStats(){return{undoEntries:history.length,redoEntries:future.length,encodedBytes:historyEncodedBytes,sharedAssetBytes:historyAssetBytes,estimatedBytes:historyEncodedBytes+historyAssetBytes,assetCount:historyAssetVault.size,limitBytes:HISTORY_MAX_BYTES};}
function snap(){if(pathRoundPreviewState)clearPathRoundPreview(true);pushHistoryEntry(captureHistoryEntry());persistBadgeDraft();}
function restore(raw,renderNow=true){const s=raw?.__gspHistoryEntry?reviveHistoryEntry(raw):JSON.parse(raw);W=s.W;H=s.H;layers=s.layers;selectedId=s.selectedId;selectedIds=new Set(s.selectedIds||[]);keyObjectId=findLayer(s.keyObjectId)?s.keyObjectId:null;if(!findLayer(selectedId))selectedId=[...selectedIds].find(id=>findLayer(id))||null;selectedIds=new Set([...selectedIds].filter(id=>findLayer(id)));if(selectedId&&!selectedIds.has(selectedId))selectedIds.add(selectedId);if(renderNow)render();}
async function restoreHistoryState(raw,kind){restore(raw,false);const fontRestore=await prepareVisibleOpticalFonts();render();if(autoFit)fitStage();else renderCanvas();return fontRestore;}
async function undo(){if(pathRoundPreviewState)clearPathRoundPreview(true);clearAllPathInsetDrafts();if(!history.length)return;future.push(captureHistoryEntry());const p=history.pop();try{const fontRestore=await restoreHistoryState(p,'undo');status(fontRestore.warning||'Undo complete.',fontRestore.warning?'warn':'ok');}catch(err){status('Undo could not fully restore embedded fonts: '+err.message,'error');}finally{releaseHistoryEntry(p);trimHistory();updateHistory();}}
async function redo(){if(pathRoundPreviewState)clearPathRoundPreview(true);clearAllPathInsetDrafts();if(!future.length)return;const p=future.pop();pushHistoryEntry(captureHistoryEntry(),false);try{const fontRestore=await restoreHistoryState(p,'redo');status(fontRestore.warning||'Redo complete.',fontRestore.warning?'warn':'ok');}catch(err){status('Redo could not fully restore embedded fonts: '+err.message,'error');}finally{releaseHistoryEntry(p);trimHistory();updateHistory();}}
function updateHistory(){$('bcUndo').disabled=!history.length;$('bcRedo').disabled=!future.length;}
function status(t,kind=''){const e=$('bcStatus');e.textContent=t;e.className='bc-status '+(kind||'');}
function makeLayer(type,props={}){const defaults={id:uid(),type,name:type[0].toUpperCase()+type.slice(1),x:10,y:10,rotate:0,scaleX:100,scaleY:100,transformSkewX:0,opacity:1,visible:true,locked:false,fill:'#FFFFFF',fillAlpha:255,fillType:'solid',fill2:'#8FB8F4',fill2Alpha:255,gradientAngle:0,fillOpacity:1,stroke:'none',strokeAlpha:255,strokeWidth:1,strokeOpacity:1,strokeDasharray:'',strokeDashoffset:0,linecap:'round',linejoin:'round',strokeMiterlimit:4,shadow:false,thicknessMatchRadius:0,opticalGapX:0,opticalGapY:0};
 const spec={text:{text:'Text',fontFamily:'Roboto, Arial, sans-serif',fontSize:18,fontWeight:500,letterSpacing:0,anchor:'start',lineSpacing:1.2,baseline:'alphabetic',pathMode:false,fontData:'',fontName:''},path:{d:'M0 0 L24 0 L12 20 Z'},circle:{r:5},ellipse:{rx:10,ry:6},rect:{w:30,h:18,rx:2},line:{x2:35,y2:0,stroke:'#FFFFFF',strokeWidth:1.5},image:{href:'',w:40,h:30,preserveAspectRatio:'xMidYMid meet'},svg:{markup:'',w:48,h:14,viewX:0,viewY:0,viewW:48,viewH:14,preserveAspectRatio:'xMidYMid meet',typography:null},group:{children:[],w:40,h:30}};
 return {...defaults,...(spec[type]||{}),...props,id:props.id||uid(),type};}
function add(type,props){snap();const l=makeLayer(type,props||{});layers.push(l);select(l.id);render();status(`${l.name} added.`,'ok');return l;}
function select(id,extend=false){if(pathRoundPreviewState)clearPathRoundPreview(true);if(extend){if(selectedIds.has(id)){selectedIds.delete(id);if(selectedId===id)selectedId=[...selectedIds].filter(x=>findLayer(x)).pop()||null;}else{selectedIds.add(id);selectedId=id;}}else{selectedId=id;selectedIds=new Set([id]);}if(!findLayer(selectedId))selectedId=[...selectedIds].filter(x=>findLayer(x)).pop()||null;if(keyObjectId&&!selectedIds.has(keyObjectId))keyObjectId=null;if(pathEditId&&pathEditId!==id)pathEditId=null;activatePathInsetDraftForSelection();renderList();renderInspector();renderCanvas();updateBadgeTypographyPanel();}
function toggleLayerSelection(id,checked){if(pathRoundPreviewState)clearPathRoundPreview(true);if(!findLayer(id))return;if(checked){selectedIds.add(id);selectedId=id;}else{selectedIds.delete(id);if(selectedId===id)selectedId=[...selectedIds].filter(x=>findLayer(x)).pop()||null;}if(keyObjectId&&!selectedIds.has(keyObjectId))keyObjectId=null;if(pathEditId&&pathEditId!==selectedId)pathEditId=null;activatePathInsetDraftForSelection();renderList();renderInspector();renderCanvas();}
function findLayer(id,arr=layers){for(const l of arr){if(l.id===id)return l;if(l.type==='group'){const x=findLayer(id,l.children);if(x)return x;}}return null;}
function allLayers(arr=layers,out=[]){for(const l of arr||[]){out.push(l);if(l.type==='group')allLayers(l.children||[],out);}return out;}
function findParent(id,arr=layers,parent=null){for(let i=0;i<arr.length;i++){const l=arr[i];if(l.id===id)return {arr,index:i,parent};if(l.type==='group'){const r=findParent(id,l.children,l);if(r)return r;}}return null;}
function removeLayer(id){const f=findParent(id);if(!f)return false;const removedIds=new Set();const collect=l=>{removedIds.add(l.id);if(l.type==='group')(l.children||[]).forEach(collect);};collect(f.arr[f.index]);f.arr.splice(f.index,1);/* Keep parsed fonts cached while undo history may restore this layer. */selectedIds.delete(id);if(keyObjectId&&removedIds.has(keyObjectId))keyObjectId=null;const clearRefs=arr=>{for(const l of arr||[]){if(l.type==='text'&&removedIds.has(l.textPathId))l.textPathId='';if(l.type==='group')clearRefs(l.children);}};clearRefs(layers);return true;}
function deleteLayerById(id){const target=findLayer(id);if(!target)return;if(isEffectivelyLocked(target)){status('This layer is locked directly or by a locked parent group. Unlock its parent before deleting it.','warn');return;}if(pathInsetPreviewState)resetPathInsetPreview(true);if(!findLayer(id))return;snap();removeLayer(id);if(selectedId===id||!findLayer(selectedId))selectedId=[...selectedIds].find(x=>findLayer(x))||null;selectedIds=new Set([...selectedIds].filter(x=>findLayer(x)));if(!selectedIds.size&&selectedId)selectedIds.add(selectedId);if(pathEditId===id)pathEditId=null;if(keyObjectId&&!findLayer(keyObjectId))keyObjectId=null;render();status('Layer deleted.','ok');}
function deleteSelectedLayers(){if(pathInsetPreviewState)resetPathInsetPreview(true);const picked=selectedRoots();if(!picked.length)return;const names=picked.length===1?picked[0].name:`${picked.length} selected layers`;snap();picked.forEach(l=>removeLayer(l.id));selectedId=null;selectedIds.clear();pathEditId=null;if(keyObjectId&&!findLayer(keyObjectId))keyObjectId=null;render();status(`${names} deleted.`,'ok');}
function shiftRootLayer(l,dx,dy){l.x=num(l.x)+dx;l.y=num(l.y)+dy;if(l.type==='line'){l.x2=num(l.x2)+dx;l.y2=num(l.y2)+dy;}}
function getArtworkBounds(){const hasVisible=l=>l.visible!==false&&num(l.opacity,1)>0&&(l.type!=='group'||(l.children||[]).some(hasVisible));const visible=layers.filter(hasVisible);if(!visible.length)return null;const bs=visible.map(l=>getLayerWorldBounds(l)||visualBounds(l)).filter(b=>b&&[b.x,b.y,b.w,b.h].every(Number.isFinite));if(!bs.length)return null;const x=Math.min(...bs.map(b=>b.x)),y=Math.min(...bs.map(b=>b.y)),right=Math.max(...bs.map(b=>b.x+b.w)),bottom=Math.max(...bs.map(b=>b.y+b.h));return{x,y,w:right-x,h:bottom-y};}
function hasVisibleLockedLayer(layer){if(!layer||layer.visible===false||num(layer.opacity,1)<=0)return false;if(layer.locked)return true;return layer.type==='group'&&(layer.children||[]).some(hasVisibleLockedLayer);}
function requireUnlockedVisibleArtwork(action){if(layers.some(hasVisibleLockedLayer)){status(`Unlock all visible layers before ${action}. Locked artwork has been left untouched.`,'error');return false;}return true;}
// Auto Center uses two different measurements for two different jobs:
// 1) SVG geometry bounds place the visible artwork within the padded artboard.
// 2) A supersampled alpha-mask centroid measures the painted ink distribution
//    inside eligible descender text. This replaces the old fixed 35% descent rule.
function visibleTextLayers(layer,out=[]){
 if(!layer||layer.visible===false||num(layer.opacity,1)<=0)return out;
 if(layer.type==='text')out.push(layer);
 else if(layer.type==='group')(layer.children||[]).forEach(child=>visibleTextLayers(child,out));
 return out;
}
function fontHasRealDescender(layer){
 const value=String(layer.text||'');
 if(!value.trim())return false;
 const parsed=fonts.get(layer.id);
 if(parsed&&typeof parsed.charToGlyph==='function'){
  const upem=Math.max(1,num(parsed.unitsPerEm,0)||num(parsed.tables?.head?.unitsPerEm,0)||1000);
  const fontDescender=Math.abs(num(parsed.descender,0)||num(parsed.tables?.os2?.sTypoDescender,0)||num(parsed.tables?.hhea?.descender,0));
  const threshold=Math.max(upem*.06,fontDescender*.22);
  for(const character of Array.from(value)){
   if(/\s/.test(character))continue;
   try{
    const glyph=parsed.charToGlyph(character);let box=null;
    try{box=glyph?.getBoundingBox?.()||glyph?.path?.getBoundingBox?.()||null;}catch(_){}
    const yMin=Number.isFinite(Number(box?.y1))?Number(box.y1):Number(glyph?.yMin);
    if(Number.isFinite(yMin)&&yMin < -threshold)return true;
   }catch(_){}
  }
  return false;
 }
 // For editable text without an available OpenType object, use actual browser
 // ink descent from the same rendered font. Tiny baseline overshoots do not count.
 const wrapper=getLayerNode(layer.id),textNode=wrapper?.querySelector('text');
 if(textNode){
  const spans=textNode.children.length?[...textNode.querySelectorAll('tspan')]:[textNode];
  for(const span of spans){
   const text=String(span.textContent||'');if(!text.trim())continue;
   let style;try{style=getComputedStyle(span);}catch(_){continue;}
   const anchor=style.textAnchor||textNode.getAttribute('text-anchor')||'start';
   const baseline=style.dominantBaseline||textNode.getAttribute('dominant-baseline')||'alphabetic';
   const metrics=window.GlyphStudioInkMetrics?.measure?.(text,style,anchor,baseline);
   const size=Math.max(1,parseFloat(style.fontSize)||num(layer.fontSize,16));
   if(metrics&&metrics.descent>Math.max(.75,size*.08))return true;
  }
  return false;
 }
 // Conservative fallback for unavailable font parsing; normal words are not nudged.
 return /[gjpqy]/.test(value);
}
function svgMatrixString(m){return `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;}
async function measureLayerInkCentroid(layer,bounds){
 if(!bounds||!(bounds.w>0&&bounds.h>0))return null;
 const node=getLayerNode(layer.id),matrix=node&&getCanvasRelativeMatrix(node);
 if(!node||!matrix||![matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].every(Number.isFinite))return null;
 const margin=Math.max(.75,Math.min(4,Math.max(bounds.w,bounds.h)*.035));
 const vx=bounds.x-margin,vy=bounds.y-margin,vw=bounds.w+margin*2,vh=bounds.h+margin*2;
 // Cap memory while retaining up to 32 samples per SVG unit for small badges.
 const scale=Math.min(32,4096/vw,4096/vh,Math.sqrt(4000000/(vw*vh)));
 if(!Number.isFinite(scale)||scale<=0)return null;
 const pixelW=Math.max(1,Math.ceil(vw*scale)),pixelH=Math.max(1,Math.ceil(vh*scale));
 const NS='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(NS,'svg');
 svg.setAttribute('xmlns',NS);svg.setAttribute('xmlns:xlink','http://www.w3.org/1999/xlink');
 svg.setAttribute('width',String(pixelW));svg.setAttribute('height',String(pixelH));
 svg.setAttribute('viewBox',`${vx} ${vy} ${vw} ${vh}`);svg.setAttribute('preserveAspectRatio','none');
 const defs=$('bcDefs');if(defs)svg.appendChild(defs.cloneNode(true));
 const style=document.createElementNS(NS,'style');
 // Editable custom-font text is rendered in the isolated SVG image too; embed its
 // own font bytes so the raster measurement cannot silently substitute a fallback.
 if(layer.fontData&&!layer.pathMode){
  const family=String(layer.fontFamily||layer.fontName||'GlyphStudioEmbedded').replace(/["\\]/g,'');
  const weight=Math.max(100,Math.min(900,Math.round(num(layer.fontWeight,400))));
  style.textContent=`@font-face{font-family:"${family}";src:url(data:font/otf;base64,${layer.fontData}) format("opentype");font-weight:${weight};font-style:normal}`;
  svg.appendChild(style);
 }
 const clone=node.cloneNode(true);clone.setAttribute('transform',svgMatrixString(matrix));
 svg.appendChild(clone);
 let url=null;
 try{
  const xml=new XMLSerializer().serializeToString(svg);
  url=URL.createObjectURL(new Blob([xml],{type:'image/svg+xml;charset=utf-8'}));
  const img=new Image();img.src=url;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=pixelW;canvas.height=pixelH;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return null;
  ctx.clearRect(0,0,pixelW,pixelH);ctx.drawImage(img,0,0,pixelW,pixelH);
  const pixels=ctx.getImageData(0,0,pixelW,pixelH).data;
  let alphaSum=0,xSum=0,ySum=0;
  for(let y=0;y<pixelH;y++){
   const row=y*pixelW*4;
   for(let x=0;x<pixelW;x++){
    const alpha=pixels[row+x*4+3]/255;if(alpha<=0)continue;
    alphaSum+=alpha;xSum+=(x+.5)*alpha;ySum+=(y+.5)*alpha;
   }
  }
  if(!(alphaSum>0))return null;
  const sx=pixelW/vw,sy=pixelH/vh;
  return{x:vx+(xSum/alphaSum)/sx,y:vy+(ySum/alphaSum)/sy,alpha:alphaSum,sampleScaleX:sx,sampleScaleY:sy};
 }catch(_){
  // Foreign images, unsupported SVG resources or a tainted canvas should not
  // break centering. The caller reports that optical measurement fell back.
  return null;
 }finally{if(url)URL.revokeObjectURL(url);}
}
async function textInkOpticalShift(layer){
 if(!fontHasRealDescender(layer))return{shift:0,measured:true};
 const textBounds=getLayerWorldBounds(layer)||visualBounds(layer);if(!textBounds)return{shift:0,measured:false};
 const centroid=await measureLayerInkCentroid(layer,textBounds);
 if(!centroid)return{shift:0,measured:false};
 // Positive means the ink mass sits above its geometric box centre, so moving
 // the layer down by this amount balances the painted shape visually.
 const shift=(textBounds.y+textBounds.h/2)-centroid.y;
 return{shift:Number.isFinite(shift)?shift:0,measured:true};
}
async function artworkOpticalDrop(bounds){
 if(!bounds||!(bounds.w>0&&bounds.h>0))return{shift:0,complete:true};
 const visible=layers.filter(l=>l.visible!==false&&num(l.opacity,1)>0);
 let weighted=0,textArea=0,complete=true;
 for(const root of visible){
  for(const textLayer of visibleTextLayers(root)){
   const measured=await textInkOpticalShift(textLayer);
   if(!measured.measured){complete=false;continue;}
   if(!measured.shift)continue;
   const tb=getLayerWorldBounds(textLayer)||visualBounds(textLayer);if(!tb)continue;
   const area=Math.max(0,tb.w*tb.h);if(!area)continue;
   weighted+=measured.shift*area;textArea+=area;
  }
 }
 if(!textArea)return{shift:0,complete};
 const contribution=Math.min(1,textArea/Math.max(1,bounds.w*bounds.h));
 return{shift:(weighted/textArea)*contribution,complete};
}
function embeddedFontFingerprint(layer){const value=String(layer.fontData||'');return `${value.length}_${value.slice(0,12)}_${value.slice(-12)}`;}
async function prepareVisibleOpticalFonts(){
 const visible=layers.flatMap(root=>visibleTextLayers(root)).filter(layer=>layer.fontData);
 const missingParsed=visible.filter(layer=>!fonts.has(layer.id));
 let parsedLoaded=false,warning='';
 if(missingParsed.length){
  try{
   const ot=await ensureOpenType();
   for(const layer of missingParsed){try{fonts.set(layer.id,ot.parse(base64ToBuffer(layer.fontData)));parsedLoaded=true;}catch(err){warning=`Embedded font outlines could not be restored for “${layer.name||layer.id}”: ${err.message||err}`;break;}}
  }catch(err){warning=`Embedded font parser was unavailable (${err.message||err}); geometric centering was still applied.`;}
 }
 // FontFace lets Canvas measure the exact uploaded font instead of substituting the
 // browser default. Keep OpenType outline metrics as a fallback for older browsers.
 if(typeof FontFace==='function'&&document.fonts){
  for(const layer of visible){
   const fingerprint=embeddedFontFingerprint(layer),existing=opticalFontFaces.get(layer.id);
   if(existing?.fingerprint===fingerprint)continue;
   if(existing?.face){try{document.fonts.delete(existing.face);}catch(_){}}
   try{
    const family=`GSP_Optical_${String(layer.id).replace(/[^a-z0-9_]/gi,'_')}_${fingerprint}`;
    const bytes=new Uint8Array(base64ToBuffer(layer.fontData));
    const face=new FontFace(family,bytes,{weight:String(Math.max(100,Math.min(900,Math.round(num(layer.fontWeight,400))))),style:'normal'});
    await face.load();document.fonts.add(face);
    opticalFontFaces.set(layer.id,{family,face,fingerprint});
   }catch(err){if(!warning)warning=`Canvas could not load the embedded font for optical measurement (${err.message||err}); outline metrics were used instead.`;}
  }
 }
 return {loaded:parsedLoaded,warning};
}
// Automatic text-aware centering for Badge Composer text layers.
// Works for editable SVG <text> AND path-rendered text layers because the layer
// model retains the original string, font size, baseline mode and embedded font.
function automaticTextCapMetrics(layer){
 if(!layer||layer.type!=='text'||layer.textPathId||String(layer.text||'').includes('\\n'))return null;
 const size=Math.max(.1,num(layer.fontSize,18)),base=String(layer.baseline||'alphabetic').toLowerCase();
 const isAlphabetic=base==='alphabetic'||base==='auto';
 const parsed=fonts.get(layer.id);
 if(parsed&&isAlphabetic){
  const upem=Math.max(1,num(parsed.unitsPerEm,0)||num(parsed.tables?.head?.unitsPerEm,0)||1000);
  let cap=0;try{const glyph=parsed.charToGlyph('H'),box=glyph?.getBoundingBox?.()||glyph?.path?.getBoundingBox?.();cap=Number(box?.y2)||Number(glyph?.yMax)||0;}catch(_){}
  if(cap>0)return{capHeight:cap/upem*size,ascent:cap/upem*size,descent:0,centerOffset:cap/upem*size/2,source:'embedded font outline'};
 }
 const family=layer.fontFamily||'Arial,sans-serif',opticalFace=opticalFontFaces.get(layer.id);let face=family;if(opticalFace?.family)face=`"${opticalFace.family}"`;
 const ctx=document.createElement('canvas').getContext('2d');
 if(ctx){
  const weight=Math.max(100,Math.min(900,Math.round(num(layer.fontWeight,400))));ctx.font=`${weight} ${size}px ${face}`;
  const baseMap={auto:'alphabetic',alphabetic:'alphabetic',hanging:'hanging',middle:'middle',central:'middle',ideographic:'ideographic','text-top':'top','before-edge':'top','text-before-edge':'top','text-bottom':'bottom','after-edge':'bottom','text-after-edge':'bottom',mathematical:'alphabetic'};
  const canvasBase=baseMap[base]||'alphabetic';try{ctx.textBaseline=canvasBase;}catch(_){}
  const m=ctx.measureText('H'),ascent=Math.max(0,Number(m.actualBoundingBoxAscent)||0),descent=Math.max(0,Number(m.actualBoundingBoxDescent)||0);
  if(ascent+descent>0)return{capHeight:ascent+descent,ascent,descent,centerOffset:(ascent-descent)/2,source:opticalFace?'embedded font canvas metrics':'browser font metrics'};
 }
 return null;
}
function getAutomaticTextTargets(roots){
 const found=[];const walk=l=>{if(!l||l.visible===false||num(l.opacity,1)<=0)return;if(l.type==='text'&&!l.textPathId&&String(l.text||'').trim())found.push(l);else if(l.type==='group')(l.children||[]).forEach(walk);};roots.forEach(walk);
 return found;
}
function centerSelectedTextAutomatically(textLayers,forceCommonBaseline=false){
 const measured=textLayers.map(measureAutomaticTextBaseline);
 if(!measured.length||measured.some(x=>!x))return null;
 const union=unionWorldBounds(textLayers);if(!union)return null;
 const sharedDx=measured.length>1?W/2-(union.x+union.w/2):null;
 if(forceCommonBaseline){
  // Common Baseline is a true shared writing-line operation. Center the overall
  // cap band on the artboard, then put every visible baseline on the same Y.
  const top=Math.max(...measured.map(x=>Number(x.capTop??x.cap??0)));
  const bottom=Math.max(...measured.map(x=>Number(x.capBottom??0)));
  const targetBaselineY=H/2+(top-bottom)/2;
  return measured.map(x=>({layer:x.layer,dx:sharedDx==null?W/2-(x.bounds.x+x.bounds.w/2):sharedDx,dy:targetBaselineY-x.baseline.y}));
 }
 // Smart Auto Center aligns the visible cap-band centres. Different font sizes
 // can therefore have different baseline Y positions without visual drift.
 const offsets=measured.map(x=>Number(x.centerOffset??(x.cap/2))),targetOffset=Math.max(...offsets);
 return measured.map((x,i)=>({layer:x.layer,dx:sharedDx==null?W/2-(x.bounds.x+x.bounds.w/2):sharedDx,dy:(H/2+offsets[i])-x.baseline.y}));
}
function unionWorldBounds(items){
 const boxes=items.map(l=>getLayerWorldBounds(l)||visualBounds(l)).filter(b=>b&&[b.x,b.y,b.w,b.h].every(Number.isFinite)&&b.w>=0&&b.h>=0);
 if(!boxes.length)return null;
 const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y)),right=Math.max(...boxes.map(b=>b.x+b.w)),bottom=Math.max(...boxes.map(b=>b.y+b.h));
 return{x,y,w:right-x,h:bottom-y};
}
function getCompositionParts(roots,selectionExplicit=false){
 const textLayers=[],iconRoots=[],unsupported=[];
 const walk=(l,isSelectedRoot=false)=>{
  if(!l||l.visible===false||num(l.opacity,1)<=0)return;
  if(l.type==='text'){
   if(l.textPathId||String(l.text||'').includes('\n'))unsupported.push(l);else if(String(l.text||'').trim())textLayers.push(l);
   return;
  }
  // A saved writing-line guide explicitly identifies a vector/group as a
  // typography label, so retain that semantic identity even when selected.
  if(hasSavedVectorBaseline(l)){textLayers.push(l);return;}
  if(l.type==='group'){
   // Explicit selection defines the unit of work. A selected group is one
   // composite object, even when it contains several paths or editable text
   // descendants. Do not silently split it into child icons/labels: its
   // internal layout is intentional. Text-containing composite groups are
   // later protected from size matching but can be centred as one object.
   if(selectionExplicit&&isSelectedRoot){iconRoots.push(l);return;}
   const hasText=(l.children||[]).some(child=>containsVisibleText(child));
   if(hasText)(l.children||[]).forEach(child=>walk(child,false));else iconRoots.push(l);
   return;
  }
  iconRoots.push(l);
 };
 roots.forEach(root=>walk(root,selectionExplicit));
 return{textLayers,iconRoots,unsupported};
}
function hasSavedVectorBaseline(layer){
 if(!layer||!['path','svg','group'].includes(layer.type)||!layer.typography)return false;
 const meta=layer.typography;
 return Number.isFinite(Number(meta.baselineY))&&Number.isFinite(Number(meta.capY))&&Number(meta.capY)<Number(meta.baselineY);
}
function containsVisibleText(l){if(!l||l.visible===false||num(l.opacity,1)<=0)return false;if(l.type==='text'&&String(l.text||'').trim())return true;if(hasSavedVectorBaseline(l))return true;return l.type==='group'&&(l.children||[]).some(containsVisibleText);}
function areTextLayersOneHorizontalRun(textLayers,iconRoots=[]){
 if(!Array.isArray(textLayers)||textLayers.length<=1)return true;
 const records=textLayers.map(layer=>({layer,bounds:getLayerWorldBounds(layer)||visualBounds(layer),metrics:measureAutomaticTextBaseline(layer)}));
 const iconRecords=(iconRoots||[]).map(layer=>({layer,bounds:getLayerWorldBounds(layer)||visualBounds(layer)})).filter(r=>r.bounds&&r.bounds.w>0&&r.bounds.h>0);
 if(records.some(r=>!r.bounds||!(r.bounds.w>0&&r.bounds.h>0)||!Number.isFinite(r.metrics?.baseline?.y)))return false;
 // Row membership is a local/adjacent relationship. Comparing every pair made
 // a long row fail simply because its first and last labels were far apart.
 const sorted=[...records].sort((a,b)=>(a.bounds.x+a.bounds.w/2)-(b.bounds.x+b.bounds.w/2));
 for(let i=0;i<sorted.length-1;i++){
  const a=sorted[i],b=sorted[i+1],cap=Math.max(.1,Math.min(a.metrics.cap||a.bounds.h,b.metrics.cap||b.bounds.h));
  const baselineDelta=Math.abs(a.metrics.baseline.y-b.metrics.baseline.y);
  const overlapY=Math.max(0,Math.min(a.bounds.y+a.bounds.h,b.bounds.y+b.bounds.h)-Math.max(a.bounds.y,b.bounds.y));
  const overlapRatio=overlapY/Math.max(.0001,Math.min(a.bounds.h,b.bounds.h));
  const centerDelta=Math.abs((a.bounds.y+a.bounds.h/2)-(b.bounds.y+b.bounds.h/2));
  const overlapX=Math.max(0,Math.min(a.bounds.x+a.bounds.w,b.bounds.x+b.bounds.w)-Math.max(a.bounds.x,b.bounds.x));
  const overlapXRatio=overlapX/Math.max(.0001,Math.min(a.bounds.w,b.bounds.w));
  const gap=Math.max(0,b.bounds.x-(a.bounds.x+a.bounds.w));
  // A badge row can have deliberately generous gaps and labels may start
  // substantially misaligned. Use the larger neighbouring cap band as the
  // vertical tolerance, but require actual ink overlap and side-by-side X
  // positions. This still rejects stacked rows/columns (no vertical overlap
  // or significant horizontal overlap) while letting Auto Center repair drift.
  const maxRowGap=Math.max(18,cap*8,Math.min(a.bounds.w,b.bounds.w)*1.5);
  let bridgedByIcons=false;
  if(gap>maxRowGap&&gap>0){
   // A run may contain several separate icon layers between two text labels.
   // Measure their occupied intervals rather than treating the full text-to-text
   // gap as empty space. This keeps long text–icon–icon–…–text rows eligible.
   const left=a.bounds.x+a.bounds.w,right=b.bounds.x;
   const bridges=iconRecords.filter(r=>{
    const q=r.bounds,centerX=q.x+q.w/2;
    const maxIconHeight=cap*3.2,maxIconWidth=cap*6;
    // Do not use the icon's current Y coordinate to decide whether it belongs
    // to this row: Auto Center is specifically meant to repair vertical drift.
    return centerX>left+.01&&centerX<right-.01&&q.h<=maxIconHeight&&q.w<=maxIconWidth;
   }).sort((x,y)=>x.bounds.x-y.bounds.x);
   if(bridges.length){
    let cursor=left,maxUncovered=0,covered=0;
    for(const bridge of bridges){const q=bridge.bounds,lo=Math.max(left,q.x),hi=Math.min(right,q.x+q.w);if(hi<=lo)continue;if(lo>cursor)maxUncovered=Math.max(maxUncovered,lo-cursor);const start=Math.max(cursor,lo);if(hi>start)covered+=hi-start;cursor=Math.max(cursor,hi);}
    maxUncovered=Math.max(maxUncovered,right-cursor);
    const bridgeRatio=covered/Math.max(.001,gap);
    const allowedResidual=Math.max(18,cap*2.6,Math.min(a.bounds.w,b.bounds.w)*.5);
    bridgedByIcons=bridgeRatio>=.2&&maxUncovered<=allowedResidual;
   }
  }
  const sideBySide=overlapXRatio<=.12&&(gap<=maxRowGap||bridgedByIcons);
  const rowScale=Math.max(cap,Math.min(Math.max(a.metrics.cap||0,b.metrics.cap||0),Math.max(a.bounds.h,b.bounds.h)));
  const visiblyOneRow=baselineDelta<=rowScale*1.1&&overlapRatio>=.34&&centerDelta<=rowScale*.95&&sideBySide;
  if(!visiblyOneRow)return false;
 }
 return true;
}
function getLayerThinBaselineShiftWorld(layer,matrix){
 if(!layer||!matrix)return 0;
 const lenX=Math.hypot(matrix.a,matrix.b),lenY=Math.hypot(matrix.c,matrix.d);
 if(!(lenX>1e-8&&lenY>1e-8))return 0;
 // A thinning inset moves the bottom edge of ordinary horizontal glyphs toward
 // the cap area. Measure each path's transformed local-Y direction so nested
 // group transforms and non-uniform scales are respected.
 const normal={x:matrix.c/lenY,y:matrix.d/lenY};
 const paths=[];
 const walk=item=>{if(!item)return;if(item.type==='path'&&num(item.pathOffsetAmount,item.thinAmount)>0)paths.push(item);else if(item.type==='group')(item.children||[]).forEach(walk);};
 if(layer.type==='path')walk(layer);else if(layer.type==='group')walk(layer);
 if(!paths.length&&num(layer.pathOffsetAmount,layer.thinAmount)>0)return num(layer.pathOffsetAmount,layer.thinAmount)*lenY;
 const shifts=[];
 for(const item of paths){
  const node=getLayerNode(item.id),m=node&&getCanvasRelativeMatrix(node);if(!m)continue;
  const projection=Math.abs(m.c*normal.x+m.d*normal.y);
  const shift=Math.max(0,num(item.pathOffsetAmount,item.thinAmount))*projection;
  if(Number.isFinite(shift))shifts.push(shift);
 }
 if(!shifts.length)return 0;
 // Use the median: a group can contain several glyph contours and a small icon;
 // one unusually transformed child should not dominate its writing-line guide.
 shifts.sort((a,b)=>a-b);const mid=Math.floor(shifts.length/2);
 return shifts.length%2?shifts[mid]:(shifts[mid-1]+shifts[mid])/2;
}
function typographyNormal(matrix){
 const len=Math.hypot(matrix?.c||0,matrix?.d||0);
 return len>1e-8?{x:matrix.c/len,y:matrix.d/len}:null;
}
function measureAutomaticTextBaseline(layer){
 const bounds=getLayerWorldBounds(layer)||visualBounds(layer);if(!bounds)return null;
 if(layer?.type==='text'){
  const metrics=automaticTextCapMetrics(layer),node=getLayerNode(layer.id),matrix=node&&getCanvasRelativeMatrix(node),normal=matrix&&typographyNormal(matrix);
  if(!metrics||!matrix||!normal||Math.abs(num(layer.rotate))>.001||Math.abs(matrix.b)>.001||Math.abs(matrix.c)>.001)return null;
  const scaleY=Math.hypot(matrix.c,matrix.d),baselinePad=getLayerStrokeExpansionWorld(layer,normal),capPad=getLayerStrokeExpansionWorld(layer,{x:-normal.x,y:-normal.y}),rawBaseline=transformPoint2D(0,0,matrix);
  const baseline={x:rawBaseline.x+normal.x*baselinePad,y:rawBaseline.y+normal.y*baselinePad};
  const capTop=metrics.ascent*scaleY+baselinePad+capPad,capBottom=metrics.descent*scaleY,cap=capTop+capBottom;
  if(!(cap>0&&Number.isFinite(cap))||!Number.isFinite(baseline.y))return null;
  return{layer,bounds,baseline,cap,capTop,capBottom,centerOffset:(capTop-capBottom)/2,baselineType:layer.baseline||'alphabetic',source:metrics.source};
 }
 if(hasSavedVectorBaseline(layer)){
  const node=typographyNodeForLayer(layer),matrix=node&&getCanvasRelativeMatrix(node),meta=layer.typography,normal=matrix&&typographyNormal(matrix);
  if(!matrix||!normal||Math.abs(matrix.b)>.001||Math.abs(matrix.c)>.001)return null;
  const baselineX=Number.isFinite(Number(meta.baselineX))?Number(meta.baselineX):0,baselineY=Number(meta.baselineY),capY=Number(meta.capY);
  const baselinePad=getLayerStrokeExpansionWorld(layer,normal),capPad=getLayerStrokeExpansionWorld(layer,{x:-normal.x,y:-normal.y}),thin=getLayerThinBaselineShiftWorld(layer,matrix);
  const rawBaseline=transformPoint2D(baselineX,baselineY,matrix),rawCap=transformPoint2D(baselineX,capY,matrix);
  const baseline={x:rawBaseline.x+normal.x*(baselinePad-thin),y:rawBaseline.y+normal.y*(baselinePad-thin)};
  const visibleCap={x:rawCap.x-normal.x*capPad,y:rawCap.y-normal.y*capPad};
  const cap=(baseline.x-visibleCap.x)*normal.x+(baseline.y-visibleCap.y)*normal.y;
  if(!(cap>0&&Number.isFinite(cap))||Math.abs((visibleCap.x-rawBaseline.x)*(-normal.y)+(visibleCap.y-rawBaseline.y)*normal.x)>Math.max(.05,cap*.01)||!Number.isFinite(baseline.y))return null;
  return{layer,bounds,baseline,cap,capTop:cap,capBottom:0,centerOffset:cap/2,baselineType:'alphabetic',source:meta.engine==='manual'?'manually marked writing line':'saved typography metadata'};
 }
 return null;
}
function setLayerOriginWorld(layer,x,y){
 const m=getLayerParentMatrix(layer),det=m.a*m.d-m.b*m.c;if(Math.abs(det)<1e-10)return false;
 const px=x-m.e,py=y-m.f;layer.x=(m.d*px-m.c*py)/det;layer.y=(-m.b*px+m.a*py)/det;return Number.isFinite(layer.x)&&Number.isFinite(layer.y);
}
function scaleLayerWorldAbout(layer,factor,pivot){
 if(!Number.isFinite(factor)||factor<=0)return false;
 if(Math.abs(factor-1)<0.0001)return true;
 const node=getLayerNode(layer.id),matrix=node&&getCanvasRelativeMatrix(node);if(!matrix)return false;
 const origin={x:matrix.e,y:matrix.f},target={x:pivot.x+(origin.x-pivot.x)*factor,y:pivot.y+(origin.y-pivot.y)*factor};
 const sx=num(layer.scaleX,100)*factor,sy=num(layer.scaleY,100)*factor;if(sx<.01||sx>10000||sy<.01||sy>10000)return false;
 layer.scaleX=Number(sx.toFixed(6));layer.scaleY=Number(sy.toFixed(6));return setLayerOriginWorld(layer,Number(target.x.toFixed(6)),Number(target.y.toFixed(6)));
}
/*
 * 0.6.53 — reference-based icon size matching.
 * Measure only painted descendants in canvas/world coordinates. SVG getBBox()
 * is local-space geometry and intentionally ignores visibility/opacity/strokes;
 * the editor's CTM mapper and stroke bounds helper supply those missing pieces.
 */
function iconMatchPaintIsTransparent(value){
 const v=String(value||'').trim().toLowerCase();
 return !v||v==='none'||v==='transparent'||/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(v);
}
function getIconMatchCanvasMatrix(node){
 // getCTM() can be relative to an inner SVG viewport for nested <svg> content.
 // Comparing screen CTMs against the artboard root produces one consistent
 // canvas coordinate space for ordinary and nested SVGs alike.
 try{
  const root=$('bcStage'),rootScreen=root?.getScreenCTM(),nodeScreen=node?.getScreenCTM();
  if(rootScreen&&nodeScreen){const inverse=invertAffineMatrix(rootScreen);if(inverse)return multiplyAffineMatrices(inverse,nodeScreen);}
 }catch(_){}
 return getCanvasRelativeMatrix(node);
}
function getIconSizeMatchBounds(layer){
 if(!layer||!isLayerEffectivelyAvailable(layer))return null;
 if(layer.iconPixelBounds&&layer.iconPixelBoundsKey===fallbackLayerSignature(layer))return {...layer.iconPixelBounds};
 const outer=getLayerNode(layer.id);if(!outer||typeof outer.querySelectorAll!=='function')return null;
 const outerMatrix=getIconMatchCanvasMatrix(outer);if(!outerMatrix||![outerMatrix.a,outerMatrix.b,outerMatrix.c,outerMatrix.d,outerMatrix.e,outerMatrix.f].every(Number.isFinite))return null;
 let result=null;const selector='path,rect,circle,ellipse,line,polyline,polygon,text,image,use';
 const items=[...outer.querySelectorAll(selector)];
 const rootScreen=$('bcStage')?.getScreenCTM();
 const stageScale=rootScreen?Math.sqrt(Math.max(1e-12,Math.hypot(rootScreen.a,rootScreen.b)*Math.hypot(rootScreen.c,rootScreen.d))):1;
 for(const item of items){
  try{
   if(item.closest('defs,clipPath,mask,pattern,marker,symbol'))continue;
   if(!getElementEffectivePainted(item,outer))continue;
   const style=getComputedStyle(item);if(!style||style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)continue;
   const tag=item.localName,isImage=tag==='image';
   const hasImageSource=isImage&&!!(item.getAttribute('href')||item.getAttributeNS('http://www.w3.org/1999/xlink','href'));
   const fillVisible=!isImage&&!iconMatchPaintIsTransparent(style.fill)&&num(style.fillOpacity,1)>0;
   const rawStrokeWidth=Math.max(0,num(style.strokeWidth,0));
   const strokeVisible=!isImage&&!iconMatchPaintIsTransparent(style.stroke)&&rawStrokeWidth>0&&num(style.strokeOpacity,1)>0;
   if(isImage?!hasImageSource:!(fillVisible||strokeVisible))continue;
   const matrix=getIconMatchCanvasMatrix(item);if(!matrix||![matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].every(Number.isFinite))continue;
   let raw;try{raw=item.getBBox();}catch(_){continue;}
   if(!raw||![raw.x,raw.y,raw.width,raw.height].every(Number.isFinite)||raw.width<0||raw.height<0)continue;
   const box=tag==='text'?(getSvgTextInkBounds(item)||raw):raw;
   const nonScaling=String(style.vectorEffect||item.getAttribute('vector-effect')||'').toLowerCase()==='non-scaling-stroke';
   // Non-scaling strokes are specified in viewport pixels. Convert their width
   // into artboard units before combining them with canvas-space geometry.
   const strokeWidth=nonScaling?rawStrokeWidth/Math.max(1e-6,stageScale):rawStrokeWidth;
   const measuredStyle={
    stroke:strokeVisible?style.stroke:'none',strokeWidth,strokeOpacity:style.strokeOpacity,
    vectorEffect:nonScaling?'non-scaling-stroke':'none',strokeLinejoin:style.strokeLinejoin,
    strokeMiterlimit:style.strokeMiterlimit,markerStart:style.markerStart,markerMid:style.markerMid,markerEnd:style.markerEnd
   };
   const bounds=strokeVisualBounds(item,box,matrix,measuredStyle);
   if(!bounds||![bounds.x,bounds.y,bounds.w,bounds.h].every(Number.isFinite))continue;
   result=unionRectBounds(result,bounds);
  }catch(_){/* Ignore one malformed/unmeasurable SVG descendant, not the complete icon. */}
 }
 if(!result||!(result.w>1e-7&&result.h>1e-7))return null;
 return result;
}
function iconMatchContainsText(layer){
 if(!layer||layer.visible===false||num(layer.opacity,1)<=0)return false;
 if(layer.type==='text'||hasSavedVectorBaseline(layer))return true;
 return layer.type==='group'&&(layer.children||[]).some(iconMatchContainsText);
}
function iconMatchContainsRaster(layer){
 if(!layer||layer.visible===false||num(layer.opacity,1)<=0)return false;
 if(layer.type==='image'||(layer.type==='svg'&&/<image\b/i.test(String(layer.markup||''))))return true;
 return layer.type==='group'&&(layer.children||[]).some(iconMatchContainsRaster);
}
function iconMatchContainsUnsupportedEffects(layer){
 if(!layer||layer.visible===false||num(layer.opacity,1)<=0)return false;
 // Clip paths, masks and filters can change the actually visible silhouette;
 // defer these assets instead of pretending their un-clipped path bounds are exact.
  if(layer.shadow)return true;
  if(layer.type==='svg'){
   const markup=String(layer.markup||'');
   if(/<(?:mask|filter)\b|\b(?:mask|filter)\s*=/i.test(markup))return true;
   if(/<(?:clipPath)\b|\bclip-path\s*=/i.test(markup)&&!(layer.iconPixelBounds&&layer.iconPixelBoundsKey===fallbackLayerSignature(layer)))return true;
  }
 return layer.type==='group'&&(layer.children||[]).some(iconMatchContainsUnsupportedEffects);
}
function iconSizeMatchIneligibleReason(layer){
 if(!layer)return 'missing layer';
 if(iconMatchContainsText(layer))return 'contains editable text or a saved text baseline';
 if(!['path','svg','group','circle','ellipse','rect'].includes(layer.type))return 'not a supported vector layer';
 if(iconMatchContainsRaster(layer))return 'contains embedded raster image content';
 if(iconMatchContainsUnsupportedEffects(layer))return 'contains clipping, masking, filter or shadow effects';
 return null;
}
function isIconSizeMatchLayer(layer){return !!layer&&!iconSizeMatchIneligibleReason(layer);}
function updateIconSizeMatchControls(){
 const button=$('bcMatchIconSizes'),info=$('bcIconSizeMatchReference');if(!button||!info)return;
  const ref=findLayer(keyObjectId),roots=selectedRoots();
   for(const layer of roots){
     if(layer?.type!=='svg'||!/\bclip-path\s*=/i.test(String(layer.markup||''))||(layer.iconPixelBounds&&layer.iconPixelBoundsKey===fallbackLayerSignature(layer))||layer._pixelBoundsPending)continue;
    const signature=fallbackLayerSignature(layer);
    if(layer._pixelBoundsSignature!==signature){layer._pixelBoundsSignature=signature;layer._pixelBoundsAttempts=0;}
    if(layer._pixelBoundsAttempts>=2)continue;
    layer._pixelBoundsAttempts++;layer._pixelBoundsPending=true;
    measureLayerPixelBounds(layer).then(ok=>{layer._pixelBoundsPending=false;if(ok)delete layer._pixelBoundsAttempts;updateIconSizeMatchControls();});
   }
  const selectedRef=!!ref&&roots.some(layer=>layer.id===ref.id);
 const refAvailable=!!ref&&isLayerEffectivelyAvailable(ref)&&isIconSizeMatchLayer(ref);
 const eligibleTargets=roots.filter(layer=>layer.id!==keyObjectId&&isLayerEffectivelyAvailable(layer)&&!hasVisibleLockedLayer(layer)&&isIconSizeMatchLayer(layer));
 if(!ref)info.textContent='Choose an icon that must keep its size: select it and click ★ in the layer list.';
 else if(!refAvailable)info.textContent=`Reference “${ref.name||'Unnamed'}” is hidden, locked, or is not an eligible vector icon.`;
 else if(!selectedRef)info.textContent=`Reference: ${ref.name||'Unnamed'} · include it in the selection.`;
 else if(!eligibleTargets.length)info.textContent=`Reference: ${ref.name||'Unnamed'} · select at least one eligible vector icon.`;
 else info.textContent=`Reference: ${ref.name||'Unnamed'} · ${eligibleTargets.length} eligible target${eligibleTargets.length===1?'':'s'} ready.`;
 button.disabled=!(refAvailable&&selectedRef&&eligibleTargets.length>0);
}
function restoreIconMatchLayer(layer,snapshot){
 if(!layer||!snapshot)return;for(const key of Object.keys(layer))delete layer[key];Object.assign(layer,clone(snapshot));
}
function matchSelectedIconSizes(){
 clearInsetPreviewBeforeLayout();
 const reference=findLayer(keyObjectId);if(!reference){status('Choose a reference icon first. Select it and click the ★ key control in the layer list. Nothing was changed.','warn');return;}
 const selectedLayers=[...selectedIds].map(id=>findLayer(id)).filter(Boolean);
 const hasSelectedAncestor=layer=>{let parent=findParent(layer.id)?.parent;while(parent){if(selectedIds.has(parent.id))return true;parent=findParent(parent.id)?.parent;}return false;};
 const roots=selectedLayers.filter(layer=>!hasSelectedAncestor(layer));
 if(!roots.some(layer=>layer.id===reference.id)){status('The reference icon must be part of the current selection. Nothing was changed.','warn');return;}
 if(!isLayerEffectivelyAvailable(reference)||!isIconSizeMatchLayer(reference)){
  status('The reference must be a visible, unlocked vector icon without embedded raster, clipping, masking or filter effects. Text and raster layers cannot be used as references. Nothing was changed.','warn');return;
 }
 const referenceBounds=getIconSizeMatchBounds(reference);
 if(!referenceBounds){status('The reference has no measurable visible artwork. Check its SVG content, visibility and paint settings. Nothing was changed.','warn');return;}
 const referenceHeight=referenceBounds.h,referenceCenter={x:referenceBounds.x+referenceBounds.w/2,y:referenceBounds.y+referenceBounds.h/2};
 const targets=roots.filter(layer=>layer.id!==reference.id);
 if(!targets.length){status('Select one or more target icons in addition to the reference. Nothing was changed.','warn');return;}
 const skipped=[],ready=[];
 for(const layer of targets){
  if(!isLayerEffectivelyAvailable(layer)){skipped.push(`${layer.name||layer.id}: hidden or locked`);continue;}
  if(hasVisibleLockedLayer(layer)){skipped.push(`${layer.name||layer.id}: contains a visible locked child`);continue;}
  const ineligibleReason=iconSizeMatchIneligibleReason(layer);if(ineligibleReason){skipped.push(`${layer.name||layer.id}: ${ineligibleReason}`);continue;}
  const bounds=getIconSizeMatchBounds(layer);
  if(!bounds){skipped.push(`${layer.name||layer.id}: no measurable visible artwork`);continue;}
  ready.push({layer,bounds,snapshot:clone(layer),center:{x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2}});
 }
 if(!ready.length){status(`No eligible target icons were found. ${skipped.length?`Skipped: ${skipped.join('; ')}.`:''} Nothing was changed.`,'warn');return;}
 const before=badgeInspectorHistorySnapshot();let changed=0,already=0;const matched=[],failed=[];
 const tolerance=Math.max(.005,referenceHeight*.0005);
 try{
  for(const item of ready){
   const {layer,center}=item;let currentBounds=getIconSizeMatchBounds(layer);
   if(!currentBounds){restoreIconMatchLayer(layer,item.snapshot);failed.push(`${layer.name||layer.id}: measurement failed`);continue;}
   let error=Math.abs(currentBounds.h-referenceHeight);
   if(error<=tolerance){already++;matched.push(`${layer.name||layer.id} (already matched)`);continue;}
   let success=false;
   // Re-measure after every scale. This also compensates for fixed non-scaling
   // strokes, so matching is based on final visible height rather than a guess.
   for(let pass=0;pass<20;pass++){
    currentBounds=getIconSizeMatchBounds(layer);if(!currentBounds||!(currentBounds.h>1e-7))break;
    const ratio=referenceHeight/currentBounds.h;
    if(!Number.isFinite(ratio)||ratio<=0)break;
    if(Math.abs(currentBounds.h-referenceHeight)<=tolerance){success=true;break;}
    const nextX=num(layer.scaleX,100)*ratio,nextY=num(layer.scaleY,100)*ratio;
    if(!Number.isFinite(nextX)||!Number.isFinite(nextY)||nextX<.01||nextX>10000||nextY<.01||nextY>10000)break;
    if(!scaleLayerWorldAbout(layer,ratio,center))break;
    renderCanvas();
    const after=getIconSizeMatchBounds(layer);if(!after)break;
    const centerX=after.x+after.w/2,centerY=after.y+after.h/2,dx=center.x-centerX,dy=center.y-centerY;
    if(!Number.isFinite(dx)||!Number.isFinite(dy))break;
    if(Math.abs(dx)>.0001||Math.abs(dy)>.0001){if(!moveLayerWorld(layer,dx,dy))break;renderCanvas();}
    const verified=getIconSizeMatchBounds(layer);
    if(verified&&Math.abs(verified.h-referenceHeight)<=tolerance){success=true;break;}
   }
   const finalBounds=getIconSizeMatchBounds(layer);
   if(!success&&finalBounds&&Math.abs(finalBounds.h-referenceHeight)<=tolerance)success=true;
   if(success){changed++;matched.push(`${layer.name||layer.id} (${finalBounds.h.toFixed(3)} units)`);}
   else{restoreIconMatchLayer(layer,item.snapshot);renderCanvas();failed.push(`${layer.name||layer.id}: safe scale limit or measurement tolerance reached`);}
  }
  if(changed){
   pushHistoryEntry(captureHistoryEntry(before));persistBadgeDraft();render();
  }else render();
  const parts=[];
  if(changed)parts.push(`${changed} icon${changed===1?'':'s'} matched to ${referenceHeight.toFixed(3)} units`);
  if(already)parts.push(`${already} already matched`);
  if(skipped.length)parts.push(`${skipped.length} skipped`);
  if(failed.length)parts.push(`${failed.length} could not be matched safely`);
  const detail=[...skipped,...failed].slice(0,5);
  const message=`Size matching ${changed||already?'completed':'not applied'}: reference “${reference.name||'Unnamed'}” unchanged; ${parts.join(', ')||'no eligible targets'}. Target proportions and centres were preserved.${detail.length?` Details: ${detail.join('; ')}${skipped.length+failed.length>5?'; and more':''}.`:''}`;
  status(message,changed||already?'ok':'warn');
 }catch(err){
  restore(before,false);render();persistBadgeDraft();
  status(`Icon size matching was rolled back because the operation could not be completed: ${err.message||err}. No partial changes were kept.`,'error');
 }
}

/* GSP 0.6.63 — reference-based visual thickness matching with alpha-aware exact Euclidean distance measurement.
   Measures rendered alpha geometry (distance transform + medial-axis skeleton),
   then applies a reversible, portable SVG morphology filter and re-measures. */
const thicknessMatchPreview=new Map();

function thicknessLayerReferenceBounds(layer){
 let b=null;try{b=getIconSizeMatchBounds(layer);}catch(_){}if(!b||!(b.w>0&&b.h>0))try{b=getLayerWorldBounds(layer)||visualBounds(layer);}catch(_){}
 if(!b||![b.x,b.y,b.w,b.h].every(Number.isFinite)||!(b.w>0&&b.h>0))return null;
 const localRadius=Math.abs(Number(layer.thicknessMatchRadius)||0),m=getLayerModelMatrix(layer.id),sx=m?Math.hypot(m.a,m.b):1,sy=m?Math.hypot(m.c,m.d):1,worldRadius=localRadius*Math.max(sx,sy);
 const margin=Math.max(2,Math.min(512,Math.max(Math.min(b.w,b.h)*.16,worldRadius*3+2)));
 return{x:b.x-margin,y:b.y-margin,w:b.w+margin*2,h:b.h+margin*2,raw:b,margin};
}
function thicknessLayerKeepIds(layer){
 const keep=new Set(),addTree=l=>{if(!l)return;keep.add(l.id);if(l.type==='group')(l.children||[]).forEach(addTree);};addTree(layer);
 let parent=findParent(layer.id)?.parent;while(parent){keep.add(parent.id);parent=findParent(parent.id)?.parent;}
 return keep;
}
function thicknessDescendantTextLayers(layer,out=[]){
 if(!layer)return out;if(layer.type==='text')out.push(layer);if(layer.type==='group')for(const child of layer.children||[])thicknessDescendantTextLayers(child,out);return out;
}
async function rasterizeLayerForThickness(layer){
 if(!layer||!isLayerEffectivelyAvailable(layer))throw Error('The layer is hidden, empty or unavailable.');
 const bounds=thicknessLayerReferenceBounds(layer);if(!bounds)throw Error('The visible artwork has no measurable bounds.');
 const stage=$('bcStage');if(!stage)throw Error('The canvas renderer is unavailable.');
 const keep=thicknessLayerKeepIds(layer),cloneRoot=stage.cloneNode(true);cloneRoot.setAttribute('xmlns',NS);cloneRoot.setAttribute('class','gsp-thickness-measure-svg');cloneRoot.removeAttribute('style');
 cloneRoot.querySelectorAll('.bc-selected-outline,.bc-handle,.bc-transform-handle,.bc-transform-line,.bc-path-overlay,.inspector-canvas,[data-gsp-overlay],[data-gsp-guide],[data-gsp-typography-guides]').forEach(n=>n.remove());
 const view={x:bounds.x,y:bounds.y,w:bounds.w,h:bounds.h},maxSide=Math.max(view.w,view.h),area=Math.max(1,view.w*view.h);
 // More pixels per document unit improve thin-stroke measurements. The total
 // pixel budget is bounded to avoid large allocations on imported poster SVGs.
 const scale=Math.min(128,5200/maxSide,Math.sqrt(6000000/area));
 if(!Number.isFinite(scale)||scale<=0)throw Error('The artwork dimensions are outside the measurement range.');
 const width=Math.max(16,Math.ceil(view.w*scale)),height=Math.max(16,Math.ceil(view.h*scale));
 if(width*height>6100000)throw Error('The artwork is too large or has an extreme aspect ratio for reliable thickness measurement.');
 cloneRoot.setAttribute('width',String(width));cloneRoot.setAttribute('height',String(height));cloneRoot.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);cloneRoot.setAttribute('preserveAspectRatio','none');
 const modelIds=new Set(allLayers().map(item=>item.id));
 for(const node of cloneRoot.querySelectorAll('[data-layer-id]')){const id=node.getAttribute('data-layer-id');if(modelIds.has(id)&&!keep.has(id)){node.setAttribute('display','none');node.style.setProperty('display','none','important');}}
 // Embed any project fonts referenced by live text. An SVG loaded as an image is
 // isolated from the document's CSS FontFaceSet; without this, it can silently
 // measure a fallback font rather than the text the user actually sees.
 const fontRules=[];for(const textLayer of thicknessDescendantTextLayers(layer))if(textLayer.fontData&&!textLayer.pathMode){
  const family=String(textLayer.fontFamily||textLayer.fontName||'GlyphStudioEmbedded').replace(/["\\]/g,'');
  const weight=Math.max(100,Math.min(900,Math.round(num(textLayer.fontWeight,400))));
  fontRules.push(`@font-face{font-family:"${family}";src:url(data:font/otf;base64,${textLayer.fontData}) format("opentype");font-weight:${weight};font-style:normal}`);
 }
 if(fontRules.length){const style=document.createElementNS(NS,'style');style.textContent=fontRules.join('\n');cloneRoot.insertBefore(style,cloneRoot.firstChild);}
 // The clone keeps the actual browser-rendered SVG subtree, definitions, effects,
 // group transforms, nested viewports, paint and clipping. Only other model layers
 // and editor-only interaction chrome are hidden.
 cloneRoot.style.filter='none';cloneRoot.style.overflow='visible';
 const source=new XMLSerializer().serializeToString(cloneRoot),blob=new Blob([source],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
 try{
  const image=new Image();image.decoding='async';
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('The rendered SVG could not be rasterized. It may contain an unavailable external resource.'));image.src=url;});
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas pixel measurement is unavailable.');
  ctx.clearRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
  let pixels;try{pixels=ctx.getImageData(0,0,width,height).data;}catch(_){throw Error('The SVG uses an external image or resource that prevents safe pixel measurement.');}
  return{pixels,width,height,scale,view,layerId:layer.id};
 }finally{URL.revokeObjectURL(url);}
}
function thicknessBuildMask(pixels,width,height){
 const pixelCount=width*height;let maxAlpha=0;
 for(let i=0;i<pixelCount;i++)if(pixels[i*4+3]>maxAlpha)maxAlpha=pixels[i*4+3];
 if(!maxAlpha)throw Error('No visible non-transparent artwork was found.');
 // Use a threshold relative to the source's peak alpha, not a fixed alpha value.
 // Low-opacity artwork (including semi-transparent imported SVGs) remains measurable.
 const threshold=Math.max(1,Math.min(88,Math.round(maxAlpha*.35)));
 const mask=new Uint8Array(pixelCount);let minX=width,minY=height,maxX=-1,maxY=-1,count=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  if(pixels[(y*width+x)*4+3]>=threshold){const i=y*width+x;mask[i]=1;count++;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
 }
 if(!count||maxX<minX||maxY<minY)throw Error('No visible non-transparent artwork was found at a usable alpha threshold.');
 const w=maxX-minX+1,h=maxY-minY+1;
 // Explicit zero border: distance calculations must see transparent pixels
 // beyond the rendered silhouette rather than treating its crop edge as ink.
 const paddedWidth=w+2,paddedHeight=h+2,crop=new Uint8Array(paddedWidth*paddedHeight);
 for(let y=0;y<h;y++)crop.set(mask.subarray((minY+y)*width+minX,(minY+y)*width+minX+w),(y+1)*paddedWidth+1);
 return{mask:crop,width:paddedWidth,height:paddedHeight,offsetX:minX,offsetY:minY,coverage:count/pixelCount,alphaThreshold:threshold,maxAlpha};
}
// Zhang-Suen deletion rules are invariant for each 8-neighbour pattern.
// Precompute the 256 possible patterns once, rather than rebuilding the ring,
// transition count and Boolean tests for every foreground pixel in every pass.
const THICKNESS_ZS_DELETE_TABLES=(()=>{
 const phaseA=new Uint8Array(256),phaseB=new Uint8Array(256);
 for(let bits=0;bits<256;bits++){
  const p2=bits&1,p3=(bits>>>1)&1,p4=(bits>>>2)&1,p5=(bits>>>3)&1;
  const p6=(bits>>>4)&1,p7=(bits>>>5)&1,p8=(bits>>>6)&1,p9=(bits>>>7)&1;
  const neighbours=p2+p3+p4+p5+p6+p7+p8+p9;
  if(neighbours<2||neighbours>6)continue;
  const ring=[p2,p3,p4,p5,p6,p7,p8,p9,p2];let transitions=0;
  for(let k=0;k<8;k++)if(ring[k]===0&&ring[k+1]===1)transitions++;
  if(transitions!==1)continue;
  if(p2*p4*p6===0&&p4*p6*p8===0)phaseA[bits]=1;
  if(p2*p4*p8===0&&p2*p6*p8===0)phaseB[bits]=1;
 }
 return{phaseA,phaseB};
})();
function thicknessSkeletonizeFullScanReference(mask,width,height,maxIterations=512){
 const out=mask.slice(),remove=[],active=[];let changed=true,iterations=0;
 // Pixels can only be deleted. Thus every pixel that can ever be deleted is
 // in this row-major list of original foreground pixels; scanning transparent
 // pixels and maintaining a shrinking bounding rectangle are unnecessary.
 for(let y=1;y<height-1;y++){
  const row=y*width;
  for(let x=1;x<width-1;x++){const i=row+x;if(out[i])active.push(i);}
 }
 const limit=Math.max(1,Math.min(512,Math.floor(Number(maxIterations)||512)));
 while(changed&&iterations<limit){
  changed=false;
  for(let phase=0;phase<2;phase++){
   remove.length=0;
   const table=phase===0?THICKNESS_ZS_DELETE_TABLES.phaseA:THICKNESS_ZS_DELETE_TABLES.phaseB;
   for(let j=0;j<active.length;j++){
    const i=active[j];if(!out[i])continue;
    const p2=out[i-width],p3=out[i-width+1],p4=out[i+1],p5=out[i+width+1];
    const p6=out[i+width],p7=out[i+width-1],p8=out[i-1],p9=out[i-width-1];
    const bits=p2|(p3<<1)|(p4<<2)|(p5<<3)|(p6<<4)|(p7<<5)|(p8<<6)|(p9<<7);
    if(table[bits])remove.push(i);
   }
   if(remove.length){changed=true;for(let j=0;j<remove.length;j++)out[remove[j]]=0;}
  }
  iterations++;
 }
 out.iterations=iterations;out.converged=!changed;return out;
}
function thicknessSkeletonizeFrontier(mask,width,height,maxIterations=512){
 const out=mask.slice(),removeA=[],removeB=[],marks=new Uint32Array(out.length);
 let epoch=0,iterations=0;
 const limit=Math.max(1,Math.min(512,Math.floor(Number(maxIterations)||512)));
 const all=[];
 for(let y=1;y<height-1;y++){const row=y*width;for(let x=1;x<width-1;x++){const i=row+x;if(out[i])all.push(i);}}
 let candidatesA=all,candidatesB=all;
 const affected=(deletedA,deletedB=null,base=null)=>{
  const list=[];epoch++;if(epoch===0){marks.fill(0);epoch=1;}
  const add=i=>{if(out[i]&&marks[i]!==epoch){marks[i]=epoch;list.push(i);}};
  if(base)for(let k=0;k<base.length;k++)add(base[k]);
  const addAround=src=>{
   if(!src)return;
   for(let k=0;k<src.length;k++){
    const i=src[k],x=i%width,y=(i/width)|0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
     if(!dx&&!dy)continue;
     const xx=x+dx,yy=y+dy;
     if(xx>0&&yy>0&&xx<width-1&&yy<height-1)add(yy*width+xx);
    }
   }
  };
  addAround(deletedA);addAround(deletedB);
  return list;
 };
 let changed=true;
 while(changed&&iterations<limit){
  changed=false;
  removeA.length=0;
  const tableA=THICKNESS_ZS_DELETE_TABLES.phaseA;
  for(let j=0;j<candidatesA.length;j++){
   const i=candidatesA[j];if(!out[i])continue;
   const p2=out[i-width],p3=out[i-width+1],p4=out[i+1],p5=out[i+width+1];
   const p6=out[i+width],p7=out[i+width-1],p8=out[i-1],p9=out[i-width-1];
   const bits=p2|(p3<<1)|(p4<<2)|(p5<<3)|(p6<<4)|(p7<<5)|(p8<<6)|(p9<<7);
   if(tableA[bits])removeA.push(i);
  }
  if(removeA.length){changed=true;for(let j=0;j<removeA.length;j++)out[removeA[j]]=0;}
  // Only pixels whose 8-neighbourhood changed can change phase-B eligibility.
  const candidatesBCurrent=affected(removeA,null,candidatesB);
  removeB.length=0;
  const tableB=THICKNESS_ZS_DELETE_TABLES.phaseB;
  for(let j=0;j<candidatesBCurrent.length;j++){
   const i=candidatesBCurrent[j];if(!out[i])continue;
   const p2=out[i-width],p3=out[i-width+1],p4=out[i+1],p5=out[i+width+1];
   const p6=out[i+width],p7=out[i+width-1],p8=out[i-1],p9=out[i-width-1];
   const bits=p2|(p3<<1)|(p4<<2)|(p5<<3)|(p6<<4)|(p7<<5)|(p8<<6)|(p9<<7);
   if(tableB[bits])removeB.push(i);
  }
  if(removeB.length){changed=true;for(let j=0;j<removeB.length;j++)out[removeB[j]]=0;}
  if(!changed){iterations++;break;}
  // Next phase-A candidates are neighbours of every deletion in this iteration;
  // next phase-B candidates are neighbours of phase-B deletions only.
  candidatesA=affected(removeA,removeB);
  candidatesB=affected(removeB);
  iterations++;
 }
 out.iterations=iterations;out.converged=!changed;return out;
}
function thicknessSkeletonize(mask,width,height,maxIterations=512){
 return thicknessSkeletonizeFrontier(mask,width,height,maxIterations);
}

function thicknessEDT1D(source,n,destination,sites,breakpoints){
 // Felzenszwalb-Huttenlocher lower-envelope transform: exact squared Euclidean
 // distance to the closest zero sample along one dimension, in linear time.
 let k=0;sites[0]=0;breakpoints[0]=-Infinity;breakpoints[1]=Infinity;
 for(let q=1;q<n;q++){
  let site=sites[k],intersection=((source[q]+q*q)-(source[site]+site*site))/(2*q-2*site);
  while(intersection<=breakpoints[k]&&k>0){k--;site=sites[k];intersection=((source[q]+q*q)-(source[site]+site*site))/(2*q-2*site);}
  if(intersection<=breakpoints[k]){k=0;sites[0]=q;breakpoints[0]=-Infinity;breakpoints[1]=Infinity;}
  else{k++;sites[k]=q;breakpoints[k]=intersection;breakpoints[k+1]=Infinity;}
 }
 k=0;for(let q=0;q<n;q++){while(breakpoints[k+1]<q)k++;const dx=q-sites[k];destination[q]=dx*dx+source[sites[k]];}
}
function thicknessDistanceMap(mask,width,height){
 const size=width*height,INF=1e20,temp=new Float64Array(size),dist=new Float32Array(size),maxDim=Math.max(width,height),source=new Float64Array(maxDim),destination=new Float64Array(maxDim),sites=new Int32Array(maxDim),breakpoints=new Float64Array(maxDim+1);
 for(let y=0;y<height;y++){
  const row=y*width;for(let x=0;x<width;x++)source[x]=mask[row+x]?INF:0;
  thicknessEDT1D(source,width,destination,sites,breakpoints);for(let x=0;x<width;x++)temp[row+x]=destination[x];
 }
 for(let x=0;x<width;x++){
  for(let y=0;y<height;y++)source[y]=temp[y*width+x];
  thicknessEDT1D(source,height,destination,sites,breakpoints);for(let y=0;y<height;y++)dist[y*width+x]=Math.sqrt(destination[y]);
 }
 return dist;
}
function thicknessTopology(mask,width,height){
 const n=mask.length,visited=new Uint8Array(n),queue=new Int32Array(n),fg=[],bg=[];
 const count=(wantForeground)=>{visited.fill(0);let components=0,holes=0;
  for(let start=0;start<n;start++){if(visited[start]||((mask[start]===1)!==wantForeground))continue;let head=0,tail=0,border=false,area=0;queue[tail++]=start;visited[start]=1;
   while(head<tail){const i=queue[head++],x=i%width,y=(i/width)|0;area++;if(x===0||y===0||x===width-1||y===height-1)border=true;
    const offsets=wantForeground?[-width-1,-width,-width+1,-1,1,width-1,width,width+1]:[-width,-1,1,width];
    for(const off of offsets){const j=i+off;if(j<0||j>=n||visited[j]||((mask[j]===1)!==wantForeground))continue;if((off===-1||off===1)&&Math.abs((j%width)-x)!==1)continue;visited[j]=1;queue[tail++]=j;}
   }
   if(area>=3){components++;if(!wantForeground&&!border)holes++;}
  }
  return wantForeground?components:holes;
 };
 return{components:count(true),holes:count(false)};
}
function thicknessQuantileSorted(a,q){if(!a.length)return 0;const p=Math.max(0,Math.min(a.length-1,(a.length-1)*q)),lo=Math.floor(p),hi=Math.ceil(p);return a[lo]+(a[hi]-a[lo])*(p-lo);}
function thicknessQuantile(values,q){if(!values.length)return 0;return thicknessQuantileSorted(values.slice().sort((x,y)=>x-y),q);}
function thicknessSkeletonDegree(skeleton,index,width,height){
 const x=index%width,y=(index/width)|0;
 const at=(xx,yy)=>xx>=0&&yy>=0&&xx<width&&yy<height?skeleton[yy*width+xx]:0;
 let degree=0;
 for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0],[1,-1],[1,1],[-1,1],[-1,-1]])if(at(x+dx,y+dy))degree++;
 return degree;
}
function thicknessBranchInteriorSamples(skeleton,dist,width,height,scale){
 const size=width*height,degree=new Uint8Array(size),queue=new Int32Array(size),depth=new Uint8Array(size);depth.fill(255);
 let count=0,medianRadiusPx=0;const radii=[];
 for(let i=0;i<size;i++)if(skeleton[i]){count++;const r=dist[i];if(Number.isFinite(r)&&r>.45)radii.push(r);degree[i]=thicknessSkeletonDegree(skeleton,i,width,height);}
 if(!count)return{values:[],branchCount:0,pruned:false};
 const medianRadius=thicknessQuantile(radii,.5);medianRadiusPx=medianRadius;
 // Remove short skeleton runs adjacent to endpoints and junctions. Their local
 // radius includes cap/junction geometry and is not representative of the bar
 // or stem width. The graph-distance pruning follows the skeleton, not a disk
 // in the image, so it does not erase unrelated nearby branches.
 const pruneSteps=Math.max(2,Math.min(28,Math.round(medianRadiusPx*.42)));
 let head=0,tail=0,critical=0;
 for(let i=0;i<size;i++)if(skeleton[i]&&(degree[i]<=1||degree[i]>=3)){depth[i]=0;queue[tail++]=i;critical++;}
 if(critical){
  while(head<tail){const i=queue[head++],d=depth[i];if(d>=pruneSteps)continue;const x=i%width,y=(i/width)|0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=width||yy>=height)continue;const j=yy*width+xx;if(!skeleton[j]||depth[j]<=d+1)continue;depth[j]=d+1;queue[tail++]=j;}
  }
 }
 const values=[];for(let i=0;i<size;i++)if(skeleton[i]&&depth[i]>pruneSteps&&Number.isFinite(dist[i])&&dist[i]>.45)values.push(2*Math.max(.05,dist[i]-.5)/scale);
 // Short/complex glyphs may not have enough stable branch interior after
 // pruning. Fall back to the complete medial-axis samples rather than invent
 // a measurement from too few pixels.
 if(values.length<Math.max(10,Math.floor(count*.18))){values.length=0;for(let i=0;i<size;i++)if(skeleton[i]&&Number.isFinite(dist[i])&&dist[i]>.45)values.push(2*Math.max(.05,dist[i]-.5)/scale);return{values,branchCount:critical,pruned:false};}
 return{values,branchCount:critical,pruned:critical>0};
}

/* Visual Thickness Engine 3.2.0 — cached Paper.js session with identical vector-offset baseline plus guarded orientation-aware optical residual refinement; objective-bounded search and contour protections retained.
   The distance field supplies subpixel-refined medial samples; the existing filled
   vector contours are deformed directly, without raster-tracing/rebuilding the glyph. */
function thicknessGraphNeighbors(index,skeleton,width,height,out=[]){
 out.length=0;const x=index%width,y=(index/width)|0;
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=width||yy>=height)continue;
  const j=yy*width+xx;if(!skeleton[j])continue;
  // Prevent diagonal shortcuts where an orthogonal skeleton connection already exists.
  if(dx&&dy&&(skeleton[y*width+xx]||skeleton[yy*width+x]))continue;
  out.push(j);
 }
 return out;
}
function thicknessBilinearDistance(dist,width,height,x,y){
 const x0=Math.max(0,Math.min(width-1,Math.floor(x))),y0=Math.max(0,Math.min(height-1,Math.floor(y)));
 const x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),tx=Math.max(0,Math.min(1,x-x0)),ty=Math.max(0,Math.min(1,y-y0));
 const a=dist[y0*width+x0],b=dist[y0*width+x1],c=dist[y1*width+x0],d=dist[y1*width+x1];
 return(a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+d*tx)*ty;
}
function thicknessRefineMedialPoint(x,y,tx,ty,dist,width,height){
 const len=Math.hypot(tx,ty)||1,nx=-ty/len,ny=tx/len,d0=thicknessBilinearDistance(dist,width,height,x,y);
 const dm=thicknessBilinearDistance(dist,width,height,x-nx,y-ny),dp=thicknessBilinearDistance(dist,width,height,x+nx,y+ny);
 const denom=dm-2*d0+dp;let shift=Math.abs(denom)>1e-7?.5*(dm-dp)/denom:0;
 shift=Math.max(-.5,Math.min(.5,Number.isFinite(shift)?shift:0));
 const peak=d0-.25*(dm-dp)*shift;
 return{x:x+nx*shift,y:y+ny*shift,radiusPx:Math.max(.1,peak),normalX:nx,normalY:ny};
}
function thicknessSkeletonCriticalPixelCount(skeleton,width,height){
 const size=skeleton.length;let critical=0;
 for(let i=0;i<size;i++)if(skeleton[i]){
  const y=(i/width)|0,x=i-y*width;let degree=0,j;
  if(y>0){j=i-width;if(skeleton[j])degree++;if(x>0){j=i-width-1;if(skeleton[j])degree++;}if(x+1<width){j=i-width+1;if(skeleton[j])degree++;}}
  if(y+1<height){j=i+width;if(skeleton[j])degree++;if(x>0){j=i+width-1;if(skeleton[j])degree++;}if(x+1<width){j=i+width+1;if(skeleton[j])degree++;}}
  if(x>0){j=i-1;if(skeleton[j])degree++;}if(x+1<width){j=i+1;if(skeleton[j])degree++;}
  if(degree<=1||degree>=3)critical++;
 }
 return critical;
}

function thicknessBuildMedialBranchGraph(skeleton,dist,width,height,raster,built){
 const size=width*height,degree=new Uint8Array(size),nodeMask=new Uint8Array(size),nodeId=new Int32Array(size);nodeId.fill(-1);
 const neighborsAt=i=>thicknessGraphNeighbors(i,skeleton,width,height,[]);
 const radii=[];let skeletonCount=0,criticalPixelCount=0;
 for(let i=0;i<size;i++)if(skeleton[i]){skeletonCount++;if(Number.isFinite(dist[i])&&dist[i]>.45)radii.push(dist[i]);const n=neighborsAt(i);degree[i]=n.length;if(n.length!==2){nodeMask[i]=1;criticalPixelCount++;}}
 if(!skeletonCount)return{samples:[],branches:[],nodes:[],branchCount:0,junctionCount:0,endpointCount:0,components:0,criticalPixelCount:0};
 const nodeQueue=new Int32Array(size),nodes=[];
 for(let start=0;start<size;start++)if(nodeMask[start]&&nodeId[start]<0){
  let head=0,tail=0;nodeQueue[tail++]=start;nodeId[start]=nodes.length;const pixels=[];let hasJunction=false,hasEndpoint=false;
  while(head<tail){const i=nodeQueue[head++];pixels.push(i);if(degree[i]>=3)hasJunction=true;if(degree[i]===1)hasEndpoint=true;
   for(const j of neighborsAt(i))if(nodeMask[j]&&nodeId[j]<0){nodeId[j]=nodes.length;nodeQueue[tail++]=j;}
  }
  const sx=pixels.reduce((a,i)=>a+i%width,0)/pixels.length,sy=pixels.reduce((a,i)=>a+(i/width|0),0)/pixels.length;
  nodes.push({id:nodes.length,pixels,x:sx,y:sy,type:hasJunction?'junction':hasEndpoint?'endpoint':'isolated',degree:pixels.reduce((a,i)=>a+degree[i],0)});
 }
 const usedEdges=new Set(),edgeKey=(a,b)=>a<b?a*size+b:b*size+a,branches=[];
 const trace=(start,next,startNode)=>{
  const path=[start,next];usedEdges.add(edgeKey(start,next));let prev=start,cur=next,guard=0;
  while(!nodeMask[cur]&&guard++<size){
   const options=neighborsAt(cur).filter(j=>j!==prev&&!usedEdges.has(edgeKey(cur,j)));
   if(!options.length)break;
   let chosen=options[0];
   if(options.length>1){const px=cur%width-prev%width,py=(cur/width|0)-(prev/width|0);let bestDot=-Infinity;for(const candidate of options){const dx=candidate%width-cur%width,dy=(candidate/width|0)-(cur/width|0),dot=(px*dx+py*dy)/(Math.hypot(px,py)*Math.hypot(dx,dy)||1);if(dot>bestDot){bestDot=dot;chosen=candidate;}}}
   usedEdges.add(edgeKey(cur,chosen));path.push(chosen);prev=cur;cur=chosen;
  }
  return{path,startNode,endNode:nodeMask[cur]?nodeId[cur]:-1,loop:path[0]===path[path.length-1]};
 };
 for(const node of nodes)for(const i of node.pixels)for(const j of neighborsAt(i)){
  if(nodeMask[j]||usedEdges.has(edgeKey(i,j)))continue;
  const traced=trace(i,j,node.id);if(traced.path.length>2)branches.push(traced);
 }
 // A closed medial loop has no endpoint or junction pixels. Trace any remaining edges.
 for(let start=0;start<size;start++)if(skeleton[start]&&!nodeMask[start])for(const next of neighborsAt(start))if(!nodeMask[next]&&!usedEdges.has(edgeKey(start,next))){
  const traced=trace(start,next,-1);if(traced.path.length>3)branches.push(traced);
 }
 const scale=Math.max(1,Number(raster.scale)||1),view=raster.view||{x:0,y:0},offX=Number(built.offsetX)||0,offY=Number(built.offsetY)||0;
 const medianRadiusPx=thicknessQuantile(radii,.5),prunePx=Math.max(2,Math.min(28,medianRadiusPx*.42)),samples=[];
 for(let branchIndex=0;branchIndex<branches.length;branchIndex++){
  const branch=branches[branchIndex],pts=branch.path,cum=new Float64Array(pts.length);let lengthPx=0;
  for(let i=1;i<pts.length;i++){const dx=pts[i]%width-pts[i-1]%width,dy=(pts[i]/width|0)-(pts[i-1]/width|0);lengthPx+=Math.hypot(dx,dy);cum[i]=lengthPx;}
  const loop=!!branch.loop,startPrune=loop?0:prunePx,endPrune=loop?0:prunePx;
  if(lengthPx<=startPrune+endPrune+2)continue;
  const stride=Math.max(1,Math.round(1.8));let lastAt=-Infinity;const branchSamples=[];
  for(let i=1;i<pts.length-1;i++){
   const arc=cum[i];if(arc<startPrune||lengthPx-arc<endPrune||arc-lastAt<stride)continue;lastAt=arc;
   const lo=Math.max(0,i-3),hi=Math.min(pts.length-1,i+3),a=pts[lo],b=pts[hi],tx=b%width-a%width,ty=(b/width|0)-(a/width|0);
   const x=pts[i]%width,y=(pts[i]/width)|0,refined=thicknessRefineMedialPoint(x,y,tx,ty,dist,width,height);
   const theta=(Math.atan2(ty,tx)+Math.PI*2)%Math.PI,worldX=view.x+(offX+refined.x-1+.5)/scale,worldY=view.y+(offY+refined.y-1+.5)/scale;
   const radius=Math.max(.00001,(refined.radiusPx-.5)/scale),widthValue=radius*2;
   const prevA=pts[Math.max(0,i-2)],prevB=pts[i],nextA=pts[i],nextB=pts[Math.min(pts.length-1,i+2)];
   const a1=Math.atan2((prevB/width|0)-(prevA/width|0),prevB%width-prevA%width),a2=Math.atan2((nextB/width|0)-(nextA/width|0),nextB%width-nextA%width);
   let turn=a2-a1;while(turn>Math.PI)turn-=Math.PI*2;while(turn<-Math.PI)turn+=Math.PI*2;
   const sample={x:worldX,y:worldY,radius,width:widthValue,angle:theta,curvature:Math.abs(turn)/(4/scale),branchId:branchIndex,arc:arc/scale,branchLength:lengthPx/scale,branchLoop:loop};samples.push(sample);branchSamples.push(sample);
  }
  branch.length=lengthPx/scale;branch.sampleStart=samples.length;
  branch.samples=branchSamples;branch.sampleCount=branchSamples.length;
  if(branch.sampleCount){const widths=branch.samples.map(x=>x.width),angles=branch.samples.map(x=>x.angle),cs=branch.samples.map(x=>x.curvature),sortedWidths=widths.slice().sort((a,b)=>a-b),sortedCurvatures=cs.slice().sort((a,b)=>a-b);branch.medianWidth=thicknessQuantileSorted(sortedWidths,.5);branch.profile=[.1,.25,.5,.75,.9].map(q=>thicknessQuantileSorted(sortedWidths,q));const c=Math.atan2(angles.reduce((a,v)=>a+Math.sin(2*v),0),angles.reduce((a,v)=>a+Math.cos(2*v),0))/2;branch.orientation=(c+Math.PI)%Math.PI;branch.curvature=thicknessQuantileSorted(sortedCurvatures,.5);}
 }
 // If graph pruning removes nearly everything (tiny marks / short glyphs), retain
 // a clearly-labelled full-skeleton fallback rather than fabricating branch data.
 let fallback=false;
 if(samples.length<Math.max(12,Math.floor(skeletonCount*.025))){fallback=true;samples.length=0;for(let i=0;i<size;i++)if(skeleton[i]&&Number.isFinite(dist[i])&&dist[i]>.45){const x=i%width,y=(i/width)|0,radius=Math.max(.00001,(dist[i]-.5)/scale);samples.push({x:view.x+(offX+x-1+.5)/scale,y:view.y+(offY+y-1+.5)/scale,radius,width:2*radius,angle:0,curvature:0,branchId:-1,arc:0,branchLength:0});}}
 const endpoints=nodes.filter(n=>n.type==='endpoint').length,junctions=nodes.filter(n=>n.type==='junction').length;
 const worldNodes=nodes.filter(n=>n.type!=='isolated').map(n=>({x:view.x+(offX+n.x-1+.5)/scale,y:view.y+(offY+n.y-1+.5)/scale,type:n.type}));
 return{samples,branches:branches.filter(b=>b.sampleCount>0).map(b=>({id:branches.indexOf(b),length:b.length,sampleCount:b.sampleCount,medianWidth:b.medianWidth,profile:b.profile,orientation:b.orientation,curvature:b.curvature,startNode:b.startNode,endNode:b.endNode,loop:b.startNode<0&&b.endNode<0})),nodes:worldNodes,branchCount:branches.filter(b=>b.sampleCount>0).length,junctionCount:junctions,endpointCount:endpoints,components:topologyComponentCountFromSkeleton(skeleton,width,height),fallback,prunePixels:prunePx,criticalPixelCount};
}
function topologyComponentCountFromSkeleton(skeleton,width,height){
 const seen=new Uint8Array(skeleton.length),queue=new Int32Array(skeleton.length);let count=0;
 for(let i=0;i<skeleton.length;i++)if(skeleton[i]&&!seen[i]){count++;let h=0,t=0;queue[t++]=i;seen[i]=1;while(h<t){const p=queue[h++];for(const n of thicknessGraphNeighbors(p,skeleton,width,height,[]))if(!seen[n]){seen[n]=1;queue[t++]=n;}}}
 return count;
}
function thicknessOrientationGroup(angle){
 let a=((Number(angle)||0)%Math.PI+Math.PI)%Math.PI;
 if(a<Math.PI/6||a>5*Math.PI/6)return'horizontal';
 if(a>Math.PI/3&&a<2*Math.PI/3)return'vertical';
 return'diagonal';
}
function thicknessProfileFromWidths(values){
 const q=[.05,.1,.15,.2,.3,.4,.5,.6,.7,.8,.85,.9,.95];return q.map(v=>thicknessQuantile(values,v));
}
function thicknessProfileRms(a,b){if(!a?.length||!b?.length||a.length!==b.length)return Infinity;let sum=0,wSum=0;for(let i=0;i<a.length;i++){const t=i/Math.max(1,a.length-1),w=.65+.7*(1-Math.abs(.5-t)*2);sum+=w*(a[i]-b[i])**2;wSum+=w;}return Math.sqrt(sum/Math.max(1e-9,wSum));}
function thicknessUndirectedAngleDistance(a,b){let d=Math.abs((Number(a)||0)-(Number(b)||0))%Math.PI;return Math.min(d,Math.PI-d);}
function thicknessBranchPairCost(a,b,alignmentError=0){
 const angle=thicknessUndirectedAngleDistance(a.orientation,b.orientation)/(Math.PI/2);
 const curve=Math.abs(Math.log1p(Math.max(0,a.curvature||0))-Math.log1p(Math.max(0,b.curvature||0)))/2.5;
 const loop=!!a.loop!==!!b.loop?1:0;
 const am=Math.max(1e-8,Number(a.medianWidth)||thicknessQuantile(a.profile||[],.5)||1);
 const bm=Math.max(1e-8,Number(b.medianWidth)||thicknessQuantile(b.profile||[],.5)||1);
 const ap=a.profile||[],bp=b.profile||[];let shape=1;
 if(ap.length&&ap.length===bp.length){let sum=0;for(let i=0;i<ap.length;i++)sum+=(ap[i]/am-bp[i]/bm)**2;shape=Math.sqrt(sum/ap.length);}
 return .34*angle+.18*Math.min(1,curve)+.12*loop+.18*Math.min(1,shape)+.18*Math.min(1,Math.max(0,alignmentError));
}
function thicknessAssignBranchPairs(target,reference){
 const targetLists=thicknessBranchSamples(target),referenceLists=thicknessBranchSamples(reference),candidates=[];
 const targetMeta=target?.medialBranches||[],referenceMeta=reference?.medialBranches||[];
 for(const tm of targetMeta){
  const tList=targetLists.get(tm.id);if(!tList||tList.length<8)continue;
  for(const rm of referenceMeta){
   const rList=referenceLists.get(rm.id);if(!rList||rList.length<8)continue;
   // Open branches must not be paired with closed loops: their arc parameter
   // spaces and endpoint semantics are different.
   if(!!tm.loop!==!!rm.loop)continue;
   const alignment=thicknessFindBranchAlignment(tList,rList,!!tm.loop);
   if(!Number.isFinite(alignment.error)||alignment.error>.62)continue;
   const cost=thicknessBranchPairCost(tm,rm,alignment.error);
   if(cost>.64)continue;
   candidates.push({targetId:tm.id,referenceId:rm.id,targetMeta:tm,referenceMeta:rm,targetList:tList,referenceList:rList,alignment,cost});
  }
 }
 candidates.sort((a,b)=>a.cost-b.cost || a.targetId-b.targetId || a.referenceId-b.referenceId);
 const usedTarget=new Set(),usedReference=new Set(),pairs=[];
 // Conservative one-to-one assignment. A branch is never stretched to match
 // multiple unrelated target branches. Ambiguous branches remain untouched.
 for(const item of candidates){
  if(usedTarget.has(item.targetId)||usedReference.has(item.referenceId))continue;
  usedTarget.add(item.targetId);usedReference.add(item.referenceId);pairs.push(item);
 }
 return pairs;
}
function thicknessBranchProfileError(a,b){
 const pairs=thicknessAssignBranchPairs(a,b),errors=[];
 for(const pair of pairs){
  const ta=pair.targetMeta,rb=pair.referenceMeta;
  if(Array.isArray(ta.profile)&&Array.isArray(rb.profile)&&ta.profile.length===rb.profile.length){
   errors.push({name:`branch ${ta.id}`,error:thicknessProfileRms(ta.profile,rb.profile),aCount:pair.targetList.length,bCount:pair.referenceList.length,match:rb.id,cost:pair.cost});
  }
 }
 if(errors.length){
  const weight=errors.reduce((v,x)=>v+Math.max(1,Math.min(x.aCount,x.bCount)),0);
  return{error:Math.sqrt(errors.reduce((v,x)=>v+x.error*x.error*Math.max(1,Math.min(x.aCount,x.bCount)),0)/Math.max(1,weight)),groups:errors,fallback:false,method:'one-to-one branch-profile assignment'};
 }
 const bins=['horizontal','diagonal','vertical'],fallbackErrors=[];
 for(const name of bins){
  const av=(a?.medialSamples||[]).filter(s=>thicknessOrientationGroup(s.angle)===name).map(s=>s.width);
  const bv=(b?.medialSamples||[]).filter(s=>thicknessOrientationGroup(s.angle)===name).map(s=>s.width);
  if(av.length<12||bv.length<12)continue;
  fallbackErrors.push({name,error:thicknessProfileRms(thicknessProfileFromWidths(av),thicknessProfileFromWidths(bv)),aCount:av.length,bCount:bv.length});
 }
 if(!fallbackErrors.length)return{error:thicknessProfileRms(a?.profile,b?.profile),groups:[],fallback:true,method:'global-profile-fallback'};
 const weight=fallbackErrors.reduce((v,x)=>v+Math.min(x.aCount,x.bCount),0);
 return{error:Math.sqrt(fallbackErrors.reduce((v,x)=>v+x.error*x.error*Math.min(x.aCount,x.bCount),0)/Math.max(1,weight)),groups:fallbackErrors,fallback:true,method:'orientation-profile-fallback'};
}
function thicknessQuantileValue(sorted,q){if(!sorted.length)return 0;const p=Math.max(0,Math.min(sorted.length-1,(sorted.length-1)*q)),lo=Math.floor(p),hi=Math.ceil(p);return sorted[lo]+(sorted[hi]-sorted[lo])*(p-lo);}
function thicknessBranchSamples(measure){
 const map=new Map();for(const sample of measure?.medialSamples||[]){if(sample.branchId<0)continue;if(!map.has(sample.branchId))map.set(sample.branchId,[]);map.get(sample.branchId).push(sample);}
 for(const list of map.values())list.sort((a,b)=>a.arc-b.arc);return map;
}
function thicknessSampleBranchWidth(list,u,reverse=false,shift=0,loop=false){
 if(!list?.length)return 0;let v=reverse?1-u:u;if(loop){v=(v+shift)%1;if(v<0)v+=1;}else v=Math.max(0,Math.min(1,v));
 const total=Math.max(1e-9,Number(list[0].branchLength)||Number(list[list.length-1].arc)||1);let position=v*total;
 if(loop){const first=list[0],last=list[list.length-1];if(position<first.arc)position+=total;if(position>=last.arc){const a=last,b=first,aa=last.arc,bb=first.arc+total,t=Math.max(0,Math.min(1,(position-aa)/(bb-aa||1)));return a.width+(b.width-a.width)*t;}}
 let lo=0,hi=list.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(list[mid].arc<position)lo=mid+1;else hi=mid;}
 const b=list[lo],a=list[Math.max(0,lo-1)],span=b.arc-a.arc,t=span>1e-9?Math.max(0,Math.min(1,(position-a.arc)/span)):0;return a.width+(b.width-a.width)*t;
}
function thicknessNormalizedBranchPattern(list,reverse=false,shift=0,loop=false,count=24){
 const med=thicknessQuantile(list.map(s=>s.width),.5)||1,out=[];for(let i=0;i<count;i++)out.push(thicknessSampleBranchWidth(list,i/count,reverse,shift,loop)/med);return out;
}
function thicknessFindBranchAlignment(targetList,referenceList,loop){
 const count=24,target=thicknessNormalizedBranchPattern(targetList,false,0,loop,count);let best={reverse:false,shift:0,error:Infinity};
 const shifts=loop?count:1;for(let reverse=0;reverse<2;reverse++)for(let si=0;si<shifts;si++){
  const shift=loop?si/count:0,pattern=thicknessNormalizedBranchPattern(referenceList,!!reverse,shift,loop,count);let error=0;for(let i=0;i<count;i++)error+=(target[i]-pattern[i])**2;error=Math.sqrt(error/count);
  if(error<best.error)best={reverse:!!reverse,shift,error};
 }return best;
}
function thicknessBuildMedialFeatureTree(samples){
 const pts=[];for(const sample of samples||[]){const angle=((Number(sample.angle)||0)%Math.PI+Math.PI)%Math.PI,x=angle*.85,y=Math.log1p(Math.max(0,Number(sample.curvature)||0))*.32;pts.push({x,y,source:sample},{x:x+Math.PI*.85,y,source:sample},{x:x-Math.PI*.85,y,source:sample});}return thicknessBuildKdTree(pts);
}
function thicknessFeatureNeighbors(tree,sample,count=80){
 const angle=((Number(sample.angle)||0)%Math.PI+Math.PI)%Math.PI,x=angle*.85,y=Math.log1p(Math.max(0,Number(sample.curvature)||0))*.32,nearest=thicknessKdNearest(tree,x,y,count*3,[]),seen=new Set(),out=[];
 for(const item of nearest){const source=item.point.source;if(seen.has(source))continue;seen.add(source);out.push({sample:source,d2:item.d2});if(out.length>=count)break;}return out;
}
function thicknessBuildLocalCorrectionModel(target,reference){
 const targetSamples=target?.medialSamples||[],referenceSamples=reference?.medialSamples||[];
 if(targetSamples.length<12||referenceSamples.length<12)throw Error('Too few stable medial-branch samples for adaptive matching.');
 const targetBranches=thicknessBranchSamples(target),assignments=thicknessAssignBranchPairs(target,reference);
 const raw=new Map(),mappings=[];
 // Only structurally compatible, one-to-one branch pairs may generate a
 // deformation. Orientation/curvature-only guesses are useful for diagnostics,
 // but are not reliable enough to move filled vector boundaries.
 for(const pair of assignments){
  const {targetId:branchId,referenceId:referenceBranch,targetList:tList,referenceList:rList,targetMeta:tm,referenceMeta:rm,alignment}=pair;
  const loop=!!tm.loop&&!!rm.loop,tLength=Math.max(1e-9,tm.length||tList[tList.length-1].arc||1);
  for(const sample of tList){
   const u=Math.max(0,Math.min(1,sample.arc/tLength));
   const paired=thicknessSampleBranchWidth(rList,u,alignment.reverse,alignment.shift,loop);
   const rawDelta=(paired-sample.width)/2;
   // Reject implausibly large local changes rather than bending a branch until
   // it resembles a structurally different reference.
   const limit=sample.radius*.18;
   const delta=Math.max(-limit,Math.min(limit,rawDelta));
   raw.set(sample,{delta,source:'branch',referenceBranch,alignmentError:alignment.error});
  }
  mappings.push({targetBranch:branchId,referenceBranch,cost:pair.cost,alignmentError:alignment.error,loop});
 }
 // A single-glyph reference (for example, the letter V) often has a medial
 // graph that cannot be paired to bowls, stems, crossbars or junctions in other
 // glyphs. Do not leave those regions unchanged merely because their topology
 // differs. Use the reference's robust whole-glyph median width as an
 // orientation-independent fallback for every target sample not covered by a
 // high-confidence branch pair. Compatible pairs retain their richer local
 // width profile; only genuinely unmatched samples use this scalar baseline.
 const scalarReferenceWidth=Number(reference?.thickness)>0?Number(reference.thickness):thicknessQuantile(referenceSamples.map(sample=>sample.width).filter(Number.isFinite),.5);
 let scalarMappedSamples=0;
 if(Number.isFinite(scalarReferenceWidth)&&scalarReferenceWidth>0){
  for(const branchList of targetBranches.values())for(const sample of branchList){
   if(raw.has(sample)||!Number.isFinite(sample.width)||!Number.isFinite(sample.radius)||sample.radius<=1e-6)continue;
   const rawDelta=(scalarReferenceWidth-sample.width)/2;
   const limit=Math.min(sample.radius*.18,.16);
   const delta=Math.max(-limit,Math.min(limit,rawDelta));
   raw.set(sample,{delta,source:'scalar',referenceBranch:null,alignmentError:1});
   scalarMappedSamples++;
  }
 }
 const deltas=new Map();
 for(const [branchId,list] of targetBranches){
  list.sort((a,b)=>a.arc-b.arc);
  const loop=!!list[0]?.branchLoop;
  const spacing=thicknessQuantile(list.slice(1).map((sample,i)=>Math.abs(sample.arc-list[i].arc)).filter(v=>v>0),.5)||.014;
  const sigma=Math.max(.075,Math.min(.18,spacing*8));
  for(let i=0;i<list.length;i++){
   const current=list[i],rawCurrent=raw.get(current);
   if(!rawCurrent){deltas.set(current,0);continue;}
   let sum=0,weights=0;
   for(let j=Math.max(0,i-24);j<=Math.min(list.length-1,i+24);j++){
    const other=list[j],entry=raw.get(other);if(!entry)continue;
    let d=Math.abs(other.arc-current.arc);
    if(loop&&current.branchLength>0)d=Math.min(d,Math.max(0,current.branchLength-d));
    const w=Math.exp(-.5*(d/sigma)**2);
    sum+=entry.delta*w;weights+=w;
   }
   let delta=weights>1e-9?sum/weights:0;
   delta=Math.max(-current.radius*.18,Math.min(current.radius*.18,delta));
   deltas.set(current,delta);
  }
 }
 const points=targetSamples.map(sample=>{const entry=raw.get(sample);return{...sample,delta:deltas.has(sample)?deltas.get(sample):entry?.delta||0,correctionSource:entry?.source||'unmatched',referenceBranch:entry?.referenceBranch??null};});
 const junctions=(target?.medialNodes||[]).filter(n=>n.type==='junction'||n.type==='endpoint');
 return{points,junctions,maxRadius:points.reduce((m,p)=>Math.max(m,p.radius),0),meanAbsCorrection:points.reduce((a,p)=>a+Math.abs(p.delta),0)/Math.max(1,points.length),branchMappings:mappings,branchMappedSamples:points.filter(p=>p.correctionSource==='branch').length,scalarMappedSamples:points.filter(p=>p.correctionSource==='scalar').length,featureMappedSamples:0,unmatchedSamples:points.filter(p=>p.correctionSource==='unmatched').length,scalarReferenceWidth};
}
function thicknessCreateDisplacementField(model,factor=1){
 const valid=(model.points||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.branchId>=0&&(p.correctionSource==='branch'||p.correctionSource==='scalar')&&Number.isFinite(p.delta)&&p.radius>1e-6);
 const grouped=new Map();
 for(const point of valid){if(!grouped.has(point.branchId))grouped.set(point.branchId,[]);grouped.get(point.branchId).push(point);}
 const branches=new Map();
 for(const [id,list] of grouped){list.sort((a,b)=>a.arc-b.arc);const spacing=thicknessQuantile(list.slice(1).map((p,i)=>Math.abs(p.arc-list[i].arc)).filter(v=>v>0),.5)||.015;branches.set(id,{list,sigma:Math.max(.035,Math.min(.09,spacing*4)),byPoint:new Map(list.map((p,i)=>[p,i]))});}
 const zeroLocked=()=>({x:0,y:0,eligible:false,locked:true,confidence:0});
 const tree=thicknessBuildKdTree(valid);if(!tree)return()=>zeroLocked();
 const smoothstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a||1)));return t*t*(3-2*t);};
 return(x,y)=>{
  const nearest=thicknessKdNearest(tree,x,y,12,[]);if(!nearest.length)return zeroLocked();
  const seed=nearest[0].point,branch=branches.get(seed.branchId);if(!branch)return zeroLocked();
  const seedDistance=Math.sqrt(nearest[0].d2),ratio=seedDistance/Math.max(seed.radius,1e-8);
  if(ratio<.74||ratio>1.30)return zeroLocked();
  // Reject nearby samples belonging to a different branch: these are usually
  // corners, narrow gaps or junctions where a medial-to-boundary assignment is ambiguous.
  for(let i=1;i<nearest.length;i++){
   const rival=nearest[i].point;if(rival.branchId===seed.branchId)continue;
   const d=Math.sqrt(nearest[i].d2),r=d/Math.max(rival.radius,1e-8);
   if(r>=.72&&r<=1.32&&Math.abs(d-seedDistance)<Math.max(.025,seed.radius*.10))return zeroLocked();
  }
  const list=branch.list,index=branch.byPoint.get(seed);if(index===undefined)return zeroLocked();
  const sigma=branch.sigma,loop=!!seed.branchLoop;
  let delta=0,rad=0,tx=0,ty=0,weight=0;
  // Interpolate only the width correction along this branch. Keep the actual
  // medial point fixed; averaging its position can bend normals on concave curves.
  for(let j=-8;j<=8;j++){
   let k=index+j;if(loop)k=(k%list.length+list.length)%list.length;if(k<0||k>=list.length)continue;
   const p=list[k];let da=Math.abs(p.arc-seed.arc);if(loop&&seed.branchLength>0)da=Math.min(da,Math.max(0,seed.branchLength-da));
   if(da>2.5*sigma)continue;const w=Math.exp(-.5*(da/sigma)**2);delta+=p.delta*w;rad+=p.radius*w;
   const a=Number(p.angle)||0,px=Math.cos(a),py=Math.sin(a);if(px*Math.cos(seed.angle)+py*Math.sin(seed.angle)<0){tx-=px*w;ty-=py*w;}else{tx+=px*w;ty+=py*w;}weight+=w;
  }
  if(weight<1e-8)return zeroLocked();delta=delta/weight*factor;rad=rad/weight;
  const tangentLength=Math.hypot(tx,ty);if(tangentLength<1e-8||rad<=1e-7)return zeroLocked();tx/=tangentLength;ty/=tangentLength;
  const mx=-ty,my=tx,dx=x-seed.x,dy=y-seed.y,distance=Math.hypot(dx,dy);if(distance<1e-6)return zeroLocked();
  const radialX=dx/distance,radialY=dy/distance,alignment=Math.abs(radialX*mx+radialY*my);
  if(alignment<.72)return zeroLocked();
  const radialGate=smoothstep(.78,.96,ratio)*(1-smoothstep(1.04,1.27,ratio));
  let endpointGate=1;if(!loop&&seed.branchLength>0){const edge=Math.min(seed.arc,Math.max(0,seed.branchLength-seed.arc));endpointGate=smoothstep(.055,.24,edge);}
  let nodeDistance=Infinity;for(const node of model.junctions||[])nodeDistance=Math.min(nodeDistance,Math.hypot(seed.x-node.x,seed.y-node.y));
  const junctionGate=Number.isFinite(nodeDistance)?smoothstep(.075,.28,nodeDistance):1;
  // The old absolute 0.06-unit cap prevented larger glyphs from reaching the
  // reference. Allow a radius-scaled offset, with a finite cap; profile deltas,
  // local curvature checks and post-warp topology/area guards remain authoritative.
  const maxAmount=Math.min(rad*.18,.16);
  const amount=Math.max(-maxAmount,Math.min(maxAmount,delta))*radialGate*alignment*endpointGate*junctionGate;
  if(Math.abs(amount)<1e-8)return zeroLocked();
  return{x:radialX*amount,y:radialY*amount,eligible:true,locked:endpointGate<.02||junctionGate<.02,confidence:alignment};
 };
}

function thicknessSubdivideStraightSegmentsOnly(item,Engine,maxLength=.24){
 let inserted=0;
 if(item?.segments?.length&&item?.curves?.length){
  const count=item.curves.length,segmentCount=item.segments.length;
  // Only straight curves with zero handles are split. New anchors are collinear,
  // so the source outline is mathematically unchanged before adaptive movement.
  // Curved Bézier segments are never subdivided.
  for(let i=count-1;i>=0;i--){
   const a=item.segments[i],b=item.segments[(i+1)%segmentCount];if(!a||!b)continue;
   const hasCurveHandles=Math.hypot(a.handleOut.x,a.handleOut.y)>1e-8||Math.hypot(b.handleIn.x,b.handleIn.y)>1e-8;
   if(hasCurveHandles)continue;
   const curve=item.curves[i];if(!curve)continue;
   const length=Number(curve.length)||0;if(length<=maxLength*1.05)continue;
   const pieces=Math.min(32,Math.max(2,Math.ceil(length/Math.max(.12,maxLength))));
   for(let part=pieces-1;part>=1;part--){
    const offset=length*part/pieces;
    try{const live=item.curves[i];if(live&&offset>1e-7&&offset<live.length-1e-7&&live.divideAt(offset))inserted++;}catch(_){/* retain the original exact line if Paper.js rejects a split */}
   }
  }
 }
 for(const child of Array.from(item?.children||[]))inserted+=thicknessSubdivideStraightSegmentsOnly(child,Engine,maxLength);
 return inserted;
}
function thicknessSubdivideCurvedSegmentsOnly(item,editableSegments,maxLength=.22){
 let inserted=0,curveCount=0;
 if(item?.segments?.length&&item?.curves?.length){
  // Sample the *existing* Bézier geometry by exact Paper.js curve division.
  // Original endpoint segments are never made editable; only newly inserted
  // interior samples may move. Dividing a Bézier preserves its exact locus.
  const originalCurves=Array.from(item.curves);
  for(let i=originalCurves.length-1;i>=0;i--){
   const curve=originalCurves[i];
   let isCurved=false;try{isCurved=!!curve?.hasHandles?.()&&!curve?.isStraight?.();}catch(_){}
   const length=Number(curve?.length)||0;
   if(!isCurved||length<Math.max(.34,maxLength*1.6))continue;
   const pieces=Math.min(48,Math.max(3,Math.ceil(length/Math.max(.12,maxLength))));
   let made=0;
   // Descending offsets keep each split on the still-live first subcurve.
   for(let part=pieces-1;part>=1;part--){
    const offset=length*part/pieces;
    try{
     if(offset<=1e-7||offset>=(Number(curve.length)||0)-1e-7)continue;
     const second=curve.divideAt(offset);
     const insertedSegment=second?.segment1||null;
     if(insertedSegment){editableSegments.add(insertedSegment);inserted++;made++;}
    }catch(_){/* Keep this original curve segment untouched if division fails. */}
   }
   if(made)curveCount++;
  }
 }
 for(const child of Array.from(item?.children||[])){
  const result=thicknessSubdivideCurvedSegmentsOnly(child,editableSegments,maxLength);
  inserted+=result.inserted;curveCount+=result.curveCount;
 }
 return{inserted,curveCount};
}
function thicknessCollectOriginalSegments(item,set=new Set()){
 for(const segment of item?.segments||[])set.add(segment);
 for(const child of Array.from(item?.children||[]))thicknessCollectOriginalSegments(child,set);
 return set;
}
function paperLockedSegmentSignature(item,lockedSegments,parts=[]){
 for(const segment of item?.segments||[])if(lockedSegments.has(segment)){
  const vals=[segment.point.x,segment.point.y,segment.handleIn.x,segment.handleIn.y,segment.handleOut.x,segment.handleOut.y];
  parts.push(vals.map(v=>Number(v).toPrecision(14)).join(','));
 }
 for(const child of Array.from(item?.children||[]))paperLockedSegmentSignature(child,lockedSegments,parts);
 return parts.join('|');
}
function paperCountCurves(item){
 let count=item?.curves?.length||0;
 for(const child of Array.from(item?.children||[]))count+=paperCountCurves(child);
 return count;
}
function paperCurveCurvatureAtTime(curve,time){
 const t=Math.max(0,Math.min(1,Number(time)||0));
 // Compare curvature at the same normalized Bézier parameter before and after
 // deformation. getCurvatureAt() accepts an arc-length offset, while
 // getCurvatureAtTime() explicitly accepts normalized curve time.
 if(typeof curve?.getCurvatureAtTime==='function')return Number(curve.getCurvatureAtTime(t));
 const length=Number(curve?.length)||0;
 return Number(curve?.getCurvatureAt?.(length*t));
}
function paperCollectCurvedSubsegments(item,parts=[]){
 for(const curve of item?.curves||[]){
  let curved=false;try{curved=!!curve?.hasHandles?.()&&!curve?.isStraight?.();}catch(_){}
  if(curved)parts.push(curve);
 }
 for(const child of Array.from(item?.children||[]))paperCollectCurvedSubsegments(child,parts);
 return parts;
}
function paperCurveConcavitySignature(item,parts=[]){
 for(const curve of item?.curves||[]){
  let curved=false;try{curved=!!curve?.hasHandles?.()&&!curve?.isStraight?.();}catch(_){}
  if(!curved)continue;
  const values=[];
  // Dense normalized-time samples reduce the chance of missing a local
  // concavity reversal between the previous five check locations.
  for(const t of [.05,.15,.25,.35,.45,.55,.65,.75,.85,.95]){
   let value=NaN;try{value=paperCurveCurvatureAtTime(curve,t);}catch(_){}
   values.push(Number.isFinite(value)?value:NaN);
  }
  parts.push(values);
 }
 for(const child of Array.from(item?.children||[]))paperCurveConcavitySignature(child,parts);
 return parts;
}
function paperCheckCurveConcavity(before,after){
 const failures=[];
 if(before.length!==after.length)return{ok:false,reason:'Curved segment count changed during reconstruction.',failures:[{curveIndex:-1,sampleIndex:-1,kind:'count'}]};
 for(let i=0;i<before.length;i++)for(let j=0;j<10;j++){
  const a=before[i][j],b=after[i]?.[j];
  if(!Number.isFinite(b)){failures.push({curveIndex:i,sampleIndex:j,kind:'nonfinite'});continue;}
  if(!Number.isFinite(a))continue;
  if(a*b<0&&Math.abs(a)>.02&&Math.abs(b)>.02)
   failures.push({curveIndex:i,sampleIndex:j,kind:'concavity'});
  else if(Math.abs(b)>Math.max(40,Math.abs(a)*2.8+2))
   failures.push({curveIndex:i,sampleIndex:j,kind:'curvature'});
 }
 if(!failures.length)return{ok:true,reason:'',failures:[]};
 const kinds=new Set(failures.map(f=>f.kind));
 const reason=kinds.has('concavity')?'A curved segment materially reversed its concavity.':
  kinds.has('nonfinite')?'A curved segment produced non-finite curvature.':
  'A curved segment developed excessive curvature.';
 return{ok:false,reason,failures};
}
function paperBackoffCurveScales(curves,failures,editableSegments,scales,backoffAll=false){
 const affected=new Set();
 if(!backoffAll){
  for(const failure of failures||[]){
   const curve=curves?.[failure.curveIndex];
   if(!curve)continue;
   // A failed subcurve is controlled by its endpoint anchors. Exact de Casteljau
   // samples are the only movable endpoints; authored endpoints remain locked.
   for(const segment of [curve.segment1,curve.segment2])
    if(segment&&editableSegments?.has(segment))affected.add(segment);
  }
 }
 if(backoffAll||!affected.size)for(const segment of editableSegments||[])affected.add(segment);
 let changed=0;
 for(const segment of affected){
  const current=Math.max(0,Math.min(1,Number(scales.get(segment)??1)));
  if(current<=1e-8)continue;
  const next=current<=.03125?0:current*.5;
  if(next<current-1e-9){scales.set(segment,next);changed++;}
 }
 return{changed,affected:affected.size};
}
function thicknessBuildKdTree(points,depth=0){
 if(!points.length)return null;const axis=depth%2,items=points.slice().sort((a,b)=>axis===0?a.x-b.x:a.y-b.y),mid=items.length>>1;
 return{point:items[mid],axis,left:thicknessBuildKdTree(items.slice(0,mid),depth+1),right:thicknessBuildKdTree(items.slice(mid+1),depth+1)};
}
function thicknessKdNearest(root,x,y,k=6,best=[]){
 if(!root)return best;const p=root.point,dx=x-p.x,dy=y-p.y,d2=dx*dx+dy*dy;
 if(best.length<k||d2<best[best.length-1].d2){best.push({point:p,d2});best.sort((a,b)=>a.d2-b.d2);if(best.length>k)best.pop();}
 const diff=root.axis===0?dx:dy,near=diff<0?root.left:root.right,far=diff<0?root.right:root.left;
 thicknessKdNearest(near,x,y,k,best);const limit=best.length<k?Infinity:best[best.length-1].d2;if(diff*diff<=limit)thicknessKdNearest(far,x,y,k,best);return best;
}

function thicknessSmoothContourDisplacements(source,rawDisplacements,closed=false){
 const n=source?.length||0;
 if(n<4)return{values:(rawDisplacements||[]).map(v=>({x:Number(v?.x)||0,y:Number(v?.y)||0})),sigma:0};
 const positions=new Array(n);positions[0]=0;
 const steps=[];
 for(let i=1;i<n;i++){
  const d=Math.hypot(source[i].x-source[i-1].x,source[i].y-source[i-1].y);
  positions[i]=positions[i-1]+d;if(d>1e-6)steps.push(d);
 }
 const closing=closed?Math.hypot(source[0].x-source[n-1].x,source[0].y-source[n-1].y):0;
 if(closing>1e-6)steps.push(closing);
 const spacing=thicknessQuantile(steps,.5)||.06;
 // Smooth over roughly two-and-a-half control-point intervals. This removes Voronoi/KD
 // seed changes along the outline without averaging across separate contours.
 const sigma=Math.max(.055,Math.min(.16,spacing*2.4));
 const radius=Math.max(2,Math.min(18,Math.ceil(2.6*sigma/Math.max(.015,spacing))));
 const active=(rawDisplacements||[]).map(v=>v?.eligible===true||(v?.eligible!==false&&Math.hypot(v?.x||0,v?.y||0)>1e-8));
 const total=positions[n-1]+closing;
 const values=new Array(n);
 for(let i=0;i<n;i++){
  const raw=rawDisplacements[i]||{x:0,y:0};
  // Explicitly ambiguous/unmatched samples remain locked at zero. The field's
  // endpoint and junction tapers already bring neighbouring active samples
  // smoothly toward these protected positions.
  if(!active[i]||rawDisplacements[i]?.locked===true){values[i]={x:0,y:0};continue;}
  let sx=0,sy=0,sw=0;
  for(let k=-radius;k<=radius;k++){
   let j=i+k;
   if(closed)j=(j%n+n)%n;
   else if(j<0||j>=n)continue;
   if(!active[j])continue;
   let distance=Math.abs(positions[j]-positions[i]);
   if(closed&&total>1e-8)distance=Math.min(distance,Math.max(0,total-distance));
   if(distance>2.6*sigma)continue;
   const w=Math.exp(-.5*(distance/sigma)**2);
   sx+=(rawDisplacements[j]?.x||0)*w;
   sy+=(rawDisplacements[j]?.y||0)*w;
   sw+=w;
  }
  const avg=sw>1e-9?{x:sx/sw,y:sy/sw}:raw;
  // Blend strongly, but retain a small raw component so the local branch-specific displacement is not erased.
  values[i]={x:raw.x*.06+avg.x*.94,y:raw.y*.06+avg.y*.94};
 }
 // Project the smoothed displacement field onto a contour-wise Lipschitz
 // bound. This prevents a large local correction from appearing abruptly next
 // to a guarded endpoint, junction or unmatched region. Locked samples remain
 // exactly fixed; adjacent movable samples absorb the transition gradually.
 const fixed=active.map((isActive,i)=>!isActive||rawDisplacements[i]?.locked===true);
 const gradientLimit=.26;
 const pairCount=closed?n:Math.max(0,n-1);
 for(let pass=0;pass<36;pass++){
  let changed=false;
  for(let i=0;i<pairCount;i++){
   const j=(i+1)%n;
   const step=j===0?closing:Math.hypot(source[j].x-source[i].x,source[j].y-source[i].y);
   const maxJump=gradientLimit*Math.max(.02,step);
   const dx=values[j].x-values[i].x,dy=values[j].y-values[i].y,d=Math.hypot(dx,dy);
   if(d<=maxJump+1e-10)continue;
   const scale=(d-maxJump)/Math.max(d,1e-12),cx=dx*scale,cy=dy*scale;
   if(fixed[i]&&fixed[j])continue;
   if(fixed[i]){values[j].x-=cx;values[j].y-=cy;}
   else if(fixed[j]){values[i].x+=cx;values[i].y+=cy;}
   else{values[i].x+=cx*.5;values[i].y+=cy*.5;values[j].x-=cx*.5;values[j].y-=cy*.5;}
   changed=true;
  }
  if(!changed)break;
 }
 return{values,sigma,gradientLimit};
}
function thicknessUnitVector(v){const len=Math.hypot(Number(v?.x)||0,Number(v?.y)||0);return len>1e-9?{x:v.x/len,y:v.y/len}:null;}
function thicknessPointInsideRoot(root,x,y,Engine){
 try{return !!root?.contains?.(new Engine.Point(x,y));}catch(_){return false;}
}
function thicknessOutwardNormalAtSegment(item,index,root,Engine){
 const segments=item?.segments||[],n=segments.length;if(n<3)return null;
 const segment=segments[index],p=segment.point,closed=!!item.closed;
 const prev=segments[(index-1+n)%n],next=segments[(index+1)%n];
 const incoming=thicknessUnitVector(Math.hypot(segment.handleIn.x,segment.handleIn.y)>1e-7?{x:-segment.handleIn.x,y:-segment.handleIn.y}:{x:p.x-prev.point.x,y:p.y-prev.point.y});
 const outgoing=thicknessUnitVector(Math.hypot(segment.handleOut.x,segment.handleOut.y)>1e-7?{x:segment.handleOut.x,y:segment.handleOut.y}:{x:next.point.x-p.x,y:next.point.y-p.y});
 if(!incoming||!outgoing)return null;
 const tangentDot=Math.max(-1,Math.min(1,incoming.x*outgoing.x+incoming.y*outgoing.y));
 // Preserve intentional corners/cusps rather than rounding or pulling them
 // with a guessed bisector. Smooth curve anchors remain eligible.
 if(tangentDot<.45)return null;
 let tx=incoming.x+outgoing.x,ty=incoming.y+outgoing.y;const tangent=thicknessUnitVector({x:tx,y:ty});if(!tangent)return null;
 let normal={x:-tangent.y,y:tangent.x};
 // Miter compensation for moderate corners. Very sharp corners were rejected above.
 const n1={x:-incoming.y,y:incoming.x},n2={x:-outgoing.y,y:outgoing.x};
 let bis=thicknessUnitVector({x:n1.x+n2.x,y:n1.y+n2.y});if(!bis)return null;
 const miterDot=Math.abs(bis.x*n1.x+bis.y*n1.y);if(miterDot<.62)return null;
 const probe=Math.max(.0005,Math.min(.004,Number(root?.bounds?.width||1)*.00008));
 let plus=thicknessPointInsideRoot(root,p.x+bis.x*probe,p.y+bis.y*probe,Engine);
 let minus=thicknessPointInsideRoot(root,p.x-bis.x*probe,p.y-bis.y*probe,Engine);
 if(plus===minus){
  // Retry with a wider probe around numerically delicate curve boundaries.
  const eps=probe*3;plus=thicknessPointInsideRoot(root,p.x+bis.x*eps,p.y+bis.y*eps,Engine);minus=thicknessPointInsideRoot(root,p.x-bis.x*eps,p.y-bis.y*eps,Engine);
 }
 if(plus===minus)return null;
 const outward=plus?{x:-bis.x,y:-bis.y}:bis;
 return{normal:outward,miter:Math.min(1.6,1/Math.max(.62,miterDot)),tangentDot};
}
function thicknessAnchorTouchesBezier(item,index,editableCurvedSegments,lockedOriginalSegments=new Set()){
 const segments=item?.segments||[],n=segments.length;if(!n)return false;
 const current=segments[index];if(!current)return true;
 // Every anchor that existed before subdivision is immutable during the
 // residual optical pass. This includes straight-run vertices as well as
 // Bézier endpoints; only newly inserted interior samples may move.
 if(lockedOriginalSegments?.has(current))return true;
 // Exact de Casteljau subdivision creates interior samples that are allowed
 // to move. Original anchors remain locked, preserving corners and endpoints.
 if(editableCurvedSegments?.has(current))return false;
 const has=v=>Math.hypot(Number(v?.x)||0,Number(v?.y)||0)>1e-9;
 const closed=!!item.closed;
 const prev=index>0?segments[index-1]:(closed?segments[n-1]:null);
 const next=index<n-1?segments[index+1]:(closed?segments[0]:null);
 const incomingCurve=!!prev&&(has(prev.handleOut)||has(current.handleIn));
 const outgoingCurve=!!next&&(has(current.handleOut)||has(next.handleIn));
 return incomingCurve||outgoingCurve;
}
function thicknessWarpPaperPathItem(item,field,Engine,root=item,editableCurvedSegments=new Set(),curveAdjustmentScale=1,lockedOriginalSegments=new Set()){
 let stats={maxDisplacement:0,maxAdjacentJump:0,maxGradient:0,anchors:0,smoothingSigma:0,gradientLimit:0,curveCount:0,lockedCorners:0,normalRejected:0,curveAnchorsLocked:0};
 if(item?.segments?.length){
  // Curved runs have already been sampled by exact de Casteljau division.
  // Original anchors/corners remain locked; only tracked interior samples are
  // eligible. This separates controlled curve-offset reconstruction from
  // speculative movement of the original glyph's authored vertices.
  const source=item.segments.map(segment=>({x:segment.point.x,y:segment.point.y,hin:{x:segment.handleIn.x,y:segment.handleIn.y},hout:{x:segment.handleOut.x,y:segment.handleOut.y}}));
  const raw=source.map((p,i)=>{
   // Preserve original authored anchors, including every corner and curve
   // endpoint. Only newly inserted points on a curved segment may move.
   if(thicknessAnchorTouchesBezier(item,i,editableCurvedSegments,lockedOriginalSegments)){stats.curveAnchorsLocked=(stats.curveAnchorsLocked||0)+1;return{x:0,y:0,eligible:false,locked:true};}
   const requested=field(p.x,p.y);if(!requested?.eligible||requested.locked)return{x:0,y:0,eligible:false,locked:true};
   const outward=thicknessOutwardNormalAtSegment(item,i,root,Engine);if(!outward){stats.normalRejected++;stats.lockedCorners++;return{x:0,y:0,eligible:false,locked:true};}
   const magnitude=Math.hypot(requested.x,requested.y);if(magnitude<1e-8)return{x:0,y:0,eligible:false,locked:true};
   // Project the medial correction onto the true boundary normal. This removes
   // tangential drift which otherwise reshapes concave/inward curves.
   let amount=requested.x*outward.normal.x+requested.y*outward.normal.y;
   const alignment=Math.abs(amount)/magnitude;if(alignment<.82){stats.normalRejected++;return{x:0,y:0,eligible:false,locked:true};}
   amount*=outward.miter;
   // Limit movement relative to local curve curvature. Parallel-curve offsets
   // become singular when |curvature * offset| approaches 1; keep a wide margin.
   const prev=item.curves?.[(i-1+item.curves.length)%item.curves.length],next=item.curves?.[i];
   let curvature=0;try{
    const a=Math.abs(paperCurveCurvatureAtTime(prev,1)||0);
    const b=Math.abs(paperCurveCurvatureAtTime(next,0)||0);
    curvature=Math.max(a,b);
   }catch(_){}
   if(Number.isFinite(curvature)&&curvature>1e-7){const curvatureCap=.12/curvature;amount=Math.max(-curvatureCap,Math.min(curvatureCap,amount));}
   return{x:outward.normal.x*amount,y:outward.normal.y*amount,eligible:true,locked:false};
  });
  const smoothed=thicknessSmoothContourDisplacements(source,raw,!!item.closed);
  // Curved samples get their own safety scale. Straight-edge samples retain
  // their full field correction, so a local concavity risk does not discard
  // otherwise-safe changes across the entire glyph.
  const scaledValues=smoothed.values.map((value,i)=>{
   const curveSegmentScale=editableCurvedSegments?.has(item.segments[i])
     ?(curveAdjustmentScale instanceof Map?Number(curveAdjustmentScale.get(item.segments[i])??1):Number(curveAdjustmentScale))
     :1;
   const scale=Math.max(0,Math.min(1,Number.isFinite(curveSegmentScale)?curveSegmentScale:1));
   return{x:(Number(value?.x)||0)*scale,y:(Number(value?.y)||0)*scale};
  });
  const changes=source.map((p,i)=>{
   const dp=scaledValues[i]||{x:0,y:0},segment=item.segments[i],prevIndex=i>0?i-1:(item.closed?source.length-1:-1),nextIndex=i<source.length-1?i+1:(item.closed?0:-1);
   let hin={...p.hin},hout={...p.hout};
   // For inserted samples on a Bézier, update the two adjacent control handles
   // by the derivative of the local displacement field. For a locally linear
   // displacement D(s), cubic controls shift by (2D0+D1)/3 and (D0+2D1)/3.
   // This approximates a true variable normal offset and avoids translating
   // handles rigidly, which can produce flattened or wavy inward curves.
   if(editableCurvedSegments?.has(segment)){
    if(prevIndex>=0){
     const prevDp=scaledValues[prevIndex]||{x:0,y:0},prevCurve=item.curves?.[prevIndex];
     if(prevCurve&&prevCurve.hasHandles?.()&&!prevCurve.isStraight?.()){
      hin.x+=(prevDp.x-dp.x)/3;hin.y+=(prevDp.y-dp.y)/3;
     }
    }
    if(nextIndex>=0){
     const nextDp=scaledValues[nextIndex]||{x:0,y:0},nextCurve=item.curves?.[i];
     if(nextCurve&&nextCurve.hasHandles?.()&&!nextCurve.isStraight?.()){
      hout.x+=(nextDp.x-dp.x)/3;hout.y+=(nextDp.y-dp.y)/3;
     }
    }
   }
   return{p:{x:p.x+dp.x,y:p.y+dp.y},hin,hout,dp};
  });
  stats.smoothingSigma=smoothed.sigma;stats.gradientLimit=smoothed.gradientLimit||0;
  for(let i=0;i<changes.length;i++){
   const c=changes[i];stats.anchors++;stats.maxDisplacement=Math.max(stats.maxDisplacement,mag2(c.dp));
   if(i){const prev=changes[i-1],step=Math.hypot(source[i].x-source[i-1].x,source[i].y-source[i-1].y),jump=Math.hypot(c.dp.x-prev.dp.x,c.dp.y-prev.dp.y);stats.maxAdjacentJump=Math.max(stats.maxAdjacentJump,jump);stats.maxGradient=Math.max(stats.maxGradient,jump/Math.max(.02,step));}
  }
  if(item.closed&&changes.length>2){const last=changes[changes.length-1],first=changes[0],step=Math.hypot(source[0].x-source[source.length-1].x,source[0].y-source[source.length-1].y),jump=Math.hypot(first.dp.x-last.dp.x,first.dp.y-last.dp.y);stats.maxAdjacentJump=Math.max(stats.maxAdjacentJump,jump);stats.maxGradient=Math.max(stats.maxGradient,jump/Math.max(.02,step));}
  item.segments.forEach((segment,i)=>{const c=changes[i];segment.point=new Engine.Point(c.p.x,c.p.y);segment.handleIn=new Engine.Point(c.hin.x,c.hin.y);segment.handleOut=new Engine.Point(c.hout.x,c.hout.y);});
  stats.curveCount=item.curves?.length||0;
  stats.curveSamplesEditable=(stats.curveSamplesEditable||0)+source.filter((p,i)=>editableCurvedSegments?.has(item.segments[i])).length;
 }
 for(const child of Array.from(item?.children||[])){
  const childStats=thicknessWarpPaperPathItem(child,field,Engine,root,editableCurvedSegments,curveAdjustmentScale,lockedOriginalSegments);
  stats.maxDisplacement=Math.max(stats.maxDisplacement,childStats.maxDisplacement);stats.maxAdjacentJump=Math.max(stats.maxAdjacentJump,childStats.maxAdjacentJump);stats.maxGradient=Math.max(stats.maxGradient,childStats.maxGradient);stats.smoothingSigma=Math.max(stats.smoothingSigma,childStats.smoothingSigma);stats.gradientLimit=Math.max(stats.gradientLimit,childStats.gradientLimit);stats.anchors+=childStats.anchors;stats.curveCount+=childStats.curveCount;stats.lockedCorners+=childStats.lockedCorners;stats.normalRejected+=childStats.normalRejected;stats.curveAnchorsLocked=(stats.curveAnchorsLocked||0)+(childStats.curveAnchorsLocked||0);stats.curveSamplesEditable=(stats.curveSamplesEditable||0)+(childStats.curveSamplesEditable||0);
 }
 return stats;
}
function mag2(v){return Math.hypot(v?.x||0,v?.y||0);}
function countPaperCurveHandles(item){
 let count=0;for(const segment of item?.segments||[]){if(Math.hypot(segment.handleIn.x,segment.handleIn.y)>1e-9||Math.hypot(segment.handleOut.x,segment.handleOut.y)>1e-9)count++;}
 for(const child of item?.children||[])count+=countPaperCurveHandles(child);return count;
}
function paperCaptureWarpState(item,states=[]){
 if(item?.segments?.length)states.push({item,segments:item.segments.map(segment=>({
  point:{x:segment.point.x,y:segment.point.y},
  handleIn:{x:segment.handleIn.x,y:segment.handleIn.y},
  handleOut:{x:segment.handleOut.x,y:segment.handleOut.y}
 }))});
 for(const child of Array.from(item?.children||[]))paperCaptureWarpState(child,states);
 return states;
}
function paperRestoreWarpState(states,Engine){
 for(const state of states||[]){
  if(!state?.item?.segments||state.item.segments.length!==state.segments.length)throw Error('Curve backoff could not restore the original sampled contour.');
  state.item.segments.forEach((segment,i)=>{
   const saved=state.segments[i];
   segment.point=new Engine.Point(saved.point.x,saved.point.y);
   segment.handleIn=new Engine.Point(saved.handleIn.x,saved.handleIn.y);
   segment.handleOut=new Engine.Point(saved.handleOut.x,saved.handleOut.y);
  });
 }
}
function thicknessPaperSessionKey(entry){
 const matrix=entry.worldMatrix?['a','b','c','d','e','f'].map(k=>Number(entry.worldMatrix[k]||0).toPrecision(12)).join(','):'identity';
 return `${entry.id||''}\u0000${entry.fillRule||'nonzero'}\u0000${entry.allowImplicitClose===false?'open':'close'}\u0000${matrix}\u0000${entry.d||''}`;
}
async function thicknessCreatePaperSession(){
 const P=await ensurePaper();let scope=null,project=null,previousProject=null,canvas=null,Engine=P,disposed=false;
 canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;
 if(typeof P.PaperScope==='function'){scope=new P.PaperScope();project=scope.setup(canvas)||scope.project;Engine=scope;}
 else{previousProject=P.project||null;project=P.setup(canvas)||P.project;Engine=P;}
 if(!project||typeof Engine.CompoundPath!=='function'){
  try{scope?.remove?.();project?.remove?.();canvas?.remove?.();}catch(_){}
  throw Error('Paper.js compound-path support is unavailable.');
 }
 const cache=new Map();
 const recordFor=entry=>{
  const key=thicknessPaperSessionKey(entry);let record=cache.get(key);
  if(record)return record;
  const prepared=prepareFilledPathForOffset(entry.d,entry.allowImplicitClose!==false);
  const source=new Engine.CompoundPath(prepared.d);
  if(!source||source.isEmpty?.(true)){try{source?.remove?.();}catch(_){}throw Error('The source path is empty.');}
  source.fillRule=entry.fillRule==='evenodd'?'evenodd':'nonzero';
  record={key,prepared,source,metadata:null};cache.set(key,record);return record;
 };
 const matrixKey=entry=>entry.worldMatrix?['a','b','c','d','e','f'].map(k=>Number(entry.worldMatrix[k]||0).toPrecision(12)).join(','):'identity';
 return{
  P,Engine,scope,project,canvas,
  getPrepared(entry){return recordFor(entry).prepared;},
  cloneShape(entry){const record=recordFor(entry);const shape=record.source.clone({insert:false});shape.fillRule=entry.fillRule==='evenodd'?'evenodd':'nonzero';return shape;},
  getOffsetMetadata(entry){
   const record=recordFor(entry),key=matrixKey(entry);
   if(record.metadata?.key===key)return record.metadata.value;
   let probe=null;
   try{
    probe=record.source.clone({insert:false});
    if(entry.worldMatrix){const m=entry.worldMatrix;probe.transform(new Engine.Matrix(m.a,m.b,m.c,m.d,m.e,m.f));}
    const b=probe.bounds;
    if(!b||![b.x,b.y,b.width,b.height,b.center?.x,b.center?.y].every(Number.isFinite))throw Error('The source glyph has invalid or zero-area bounds; no vector offset was attempted.');
    const value={
     bounds:{x:b.x,y:b.y,width:b.width,height:b.height,center:{x:b.center.x,y:b.center.y}},
     area:entry.fillRule==='evenodd'?null:paperFilledArea(probe),
     contacts:paperContourIntersectionCount(probe)
    };
    record.metadata={key,value};return value;
   }finally{try{probe?.remove?.();}catch(_){}}
  },
  dispose(){
   if(disposed)return;disposed=true;
   for(const record of cache.values())try{record.source?.remove?.();}catch(_){}
   cache.clear();
   try{if(scope&&typeof scope.remove==='function')scope.remove();else if(project?.remove)project.remove();}catch(_){}
   try{if(previousProject&&previousProject!==project&&typeof previousProject.activate==='function')previousProject.activate();}catch(_){}
   if(canvas?.parentNode)canvas.remove();
  }
 };
}

async function thicknessAdaptiveWarpBatch(entries,targetMeasure,referenceMeasure,factor=1,modelOverride=null,paperSession=null){
 const model=modelOverride||thicknessBuildLocalCorrectionModel(targetMeasure,referenceMeasure);
 const field=thicknessCreateDisplacementField(model,factor),preparedEntries=entries.map(e=>({...e,prepared:paperSession?paperSession.getPrepared(e):prepareFilledPathForOffset(e.d,e.allowImplicitClose!==false)}));
 const P=paperSession?paperSession.P:await ensurePaper();let scope=null,project=null,previousProject=null,canvas=null,Engine=P;const ownsPaperSession=!paperSession;
 try{
  if(paperSession){scope=paperSession.scope;project=paperSession.project;Engine=paperSession.Engine;}
  else{canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;if(typeof P.PaperScope==='function'){scope=new P.PaperScope();project=scope.setup(canvas)||scope.project;Engine=scope;}else{previousProject=P.project||null;project=P.setup(canvas)||P.project;Engine=P;}}
  if(!project||typeof Engine.CompoundPath!=='function')throw Error('Paper.js compound-path support is unavailable.');
  const results=new Map();let totalInsertedSegments=0,totalCurvedSubdivisions=0,totalCurveAdjustmentScale=1,totalCurveBackoffRounds=0,totalCurveBackedOffSamples=0,totalCurveFullyLockedSamples=0,totalWarpStats={maxDisplacement:0,maxAdjacentJump:0,maxGradient:0,smoothingSigma:0,gradientLimit:0,anchors:0,curveAnchorsLocked:0,curveSamplesEditable:0};
  for(const entry of preparedEntries){let shape=null;
   try{
    shape=paperSession?paperSession.cloneShape(entry):new Engine.CompoundPath(entry.prepared.d);if(!shape||shape.isEmpty?.(true))throw Error('The source glyph is empty.');shape.fillRule=entry.fillRule==='evenodd'?'evenodd':'nonzero';
    let inverse=null;if(entry.worldMatrix){const m=entry.worldMatrix,det=m.a*m.d-m.b*m.c;if(!Number.isFinite(det)||Math.abs(det)<1e-10)throw Error('The target has a singular transform.');inverse={a:m.d/det,b:-m.b/det,c:-m.c/det,d:m.a/det,e:(m.c*m.f-m.d*m.e)/det,f:(m.b*m.e-m.a*m.f)/det};shape.transform(new Engine.Matrix(m.a,m.b,m.c,m.d,m.e,m.f));}
    // Keep every original anchor/handle fixed, but insert exact de Casteljau
    // samples along curved runs. Only these new interior samples may move.
    // This lets the engine correct curved stroke thickness without moving
    // original corners/endpoints or flattening concave Bézier geometry.
    const beforeD=paperPathDataPrecise(shape,10),beforeCurveCommands=(beforeD.match(/[CcQqSsTt]/g)||[]).length;
    const originalSegments=thicknessCollectOriginalSegments(shape),editableCurvedSegments=new Set();
    const maxStraightSpacing=Math.max(.16,Math.min(.30,(targetMeasure?.unitResolution||.008)*28));
    const maxCurvedSpacing=Math.max(.13,Math.min(.22,(targetMeasure?.unitResolution||.008)*24));
    const insertedStraightSegments=thicknessSubdivideStraightSegmentsOnly(shape,Engine,maxStraightSpacing);
    const curvedSubdivision=thicknessSubdivideCurvedSegmentsOnly(shape,editableCurvedSegments,maxCurvedSpacing);totalCurvedSubdivisions+=curvedSubdivision.inserted;
    const insertedSegments=insertedStraightSegments+curvedSubdivision.inserted;
    totalInsertedSegments+=insertedSegments;
    const beforeBounds=shape.bounds,beforeArea=paperFilledArea(shape),beforeContacts=paperContourIntersectionCount(shape),beforeCount=validateClosedOffsetPath(beforeD);
    const lockedSignatureBefore=paperLockedSegmentSignature(shape,originalSegments);
    const concavityBefore=paperCurveConcavitySignature(shape);
    const curvesBeforeWarp=paperCountCurves(shape);
    const handlesBeforeWarp=countPaperCurveHandles(shape);
    const warpBaseline=paperCaptureWarpState(shape);
    const smoothnessLimit=Math.max(.018,Math.min(.075,(targetMeasure?.unitResolution||.008)*8.5));
    // A scale is maintained for each inserted Bézier sample. When a specific
    // subcurve fails the curvature test, only its editable endpoint samples are
    // backed off; safe curved regions and all safe straight-edge corrections stay.
    const curveScalesBySegment=new Map(Array.from(editableCurvedSegments,segment=>[segment,1]));
    const curvedSubsegments=paperCollectCurvedSubsegments(shape);
    const maxCurveBackoffRounds=8;
    let warpStats=null,worldD='',acceptedCurveScale=1,acceptedWarp=false,lastCurveFailure='',curveBackoffRounds=0;
    for(let attempt=0;attempt<=maxCurveBackoffRounds;attempt++){
     if(attempt>0)paperRestoreWarpState(warpBaseline,Engine);
     warpStats=thicknessWarpPaperPathItem(shape,field,Engine,shape,editableCurvedSegments,curveScalesBySegment,originalSegments);
     if(warpStats.maxAdjacentJump>smoothnessLimit||warpStats.maxGradient>.42){
      lastCurveFailure=`Adaptive boundary field was too abrupt (jump ${warpStats.maxAdjacentJump.toFixed(5)}, gradient ${warpStats.maxGradient.toFixed(3)}).`;
      if(attempt<maxCurveBackoffRounds&&editableCurvedSegments.size){
       const reduced=paperBackoffCurveScales(curvedSubsegments,[],editableCurvedSegments,curveScalesBySegment,true);
       if(reduced.changed){curveBackoffRounds++;continue;}
      }
      throw Error(lastCurveFailure);
     }
     worldD=paperPathDataPrecise(shape,10).trim();if(!worldD)throw Error('Adaptive deformation produced empty geometry.');
     const afterCurveCommands=(worldD.match(/[CcQqSsTt]/g)||[]).length;
     const afterCurveHandles=countPaperCurveHandles(shape);
     const lockedSignatureAfter=paperLockedSegmentSignature(shape,originalSegments);
     if(lockedSignatureBefore!==lockedSignatureAfter)throw Error('Curve endpoint guard: an original anchor or its handles moved.');
     if(afterCurveCommands===0&&beforeCurveCommands>0)throw Error('Curve-preservation guard: the output would flatten original Bézier curves.');
     if(afterCurveHandles<handlesBeforeWarp)throw Error('Curve-preservation guard: curved handles were lost.');
     const concavityAfter=paperCurveConcavitySignature(shape),concavityCheck=paperCheckCurveConcavity(concavityBefore,concavityAfter);
     if(!concavityCheck.ok){
      lastCurveFailure=concavityCheck.reason;
      if(attempt<maxCurveBackoffRounds&&editableCurvedSegments.size){
       const reduced=paperBackoffCurveScales(curvedSubsegments,concavityCheck.failures,editableCurvedSegments,curveScalesBySegment,false);
       if(reduced.changed){curveBackoffRounds++;continue;}
      }
      throw Error(`Curve-concavity guard: ${concavityCheck.reason}`);
     }
     const scaleValues=Array.from(curveScalesBySegment.values());
     acceptedCurveScale=scaleValues.length?scaleValues.reduce((a,v)=>a+v,0)/scaleValues.length:1;
     acceptedWarp=true;break;
    }
    if(!acceptedWarp)throw Error(`Curve-concavity guard: ${lastCurveFailure||'no safe local curved-boundary correction was found'}`);
    totalCurveAdjustmentScale=Math.min(totalCurveAdjustmentScale,acceptedCurveScale);
    const acceptedCurveScales=Array.from(curveScalesBySegment.values());
    totalCurveBackoffRounds+=curveBackoffRounds;
    totalCurveBackedOffSamples+=acceptedCurveScales.filter(value=>value<.999).length;
    totalCurveFullyLockedSamples+=acceptedCurveScales.filter(value=>value<=1e-8).length;
    totalWarpStats.maxDisplacement=Math.max(totalWarpStats.maxDisplacement,warpStats.maxDisplacement);totalWarpStats.maxAdjacentJump=Math.max(totalWarpStats.maxAdjacentJump,warpStats.maxAdjacentJump);totalWarpStats.maxGradient=Math.max(totalWarpStats.maxGradient,warpStats.maxGradient);totalWarpStats.smoothingSigma=Math.max(totalWarpStats.smoothingSigma,warpStats.smoothingSigma);totalWarpStats.gradientLimit=Math.max(totalWarpStats.gradientLimit,warpStats.gradientLimit);totalWarpStats.anchors+=warpStats.anchors;totalWarpStats.curveAnchorsLocked+=warpStats.curveAnchorsLocked||0;totalWarpStats.curveSamplesEditable=(totalWarpStats.curveSamplesEditable||0)+(warpStats.curveSamplesEditable||0);
    const afterCurveCommands=(worldD.match(/[CcQqSsTt]/g)||[]).length;
    const curvesAfterWarp=paperCountCurves(shape);
    if(curvesAfterWarp!==curvesBeforeWarp)throw Error('Curve reconstruction changed the sampled curve topology.');
    const afterCount=validateClosedOffsetPath(worldD),afterBounds=shape.bounds,afterArea=paperFilledArea(shape),afterContacts=paperContourIntersectionCount(shape);
    if(afterCount!==beforeCount)throw Error('Adaptive deformation changed contour count.');
    if(!afterBounds||!(afterBounds.width>1e-5&&afterBounds.height>1e-5))throw Error('Adaptive deformation collapsed a glyph bound.');
    if(beforeArea!==null&&afterArea!==null&&beforeArea>1e-7&&afterArea<beforeArea*.78)throw Error('Adaptive deformation removed too much filled area.');
    if(beforeArea!==null&&afterArea!==null&&beforeArea>1e-7&&afterArea>beforeArea*1.28)throw Error('Adaptive deformation expanded too much filled area.');
    if(beforeBounds&&afterBounds&&(afterBounds.width>beforeBounds.width*1.32||afterBounds.height>beforeBounds.height*1.32||afterBounds.width<beforeBounds.width*.68||afterBounds.height<beforeBounds.height*.68))throw Error('Adaptive deformation changed the glyph bounds beyond its safety limit.');
    if(beforeContacts!==null&&afterContacts!==null&&afterContacts>beforeContacts)throw Error('Adaptive deformation created contour intersections.');
    if(inverse)shape.transform(new Engine.Matrix(inverse.a,inverse.b,inverse.c,inverse.d,inverse.e,inverse.f));
    const localD=paperPathDataPrecise(shape,10).trim();if(!localD)throw Error('Inverse transform produced empty path geometry.');parseEditablePath(localD);results.set(entry.id,localD);
   }finally{try{shape?.remove?.();}catch(_){}}
  }
  return{paths:results,model,insertedSegments:totalInsertedSegments,curvedSamples:totalWarpStats.curveSamplesEditable||0,curvedAnchors:totalCurvedSubdivisions,curveAdjustmentScale:totalCurveAdjustmentScale,curveBackoffRounds:totalCurveBackoffRounds,curveBackedOffSamples:totalCurveBackedOffSamples,curveFullyLockedSamples:totalCurveFullyLockedSamples,warpStats:totalWarpStats};
 }finally{if(ownsPaperSession){try{if(scope&&typeof scope.remove==='function')scope.remove();else if(project?.remove)project.remove();}catch(_){}try{if(previousProject&&previousProject!==project&&typeof previousProject.activate==='function')previousProject.activate();}catch(_){}if(canvas?.parentNode)canvas.remove();}}
}
async function measureLayerVisualThicknessV3(layer){
 return measureLayerVisualThickness(layer,{includeBranches:true});
}
async function measureLayerVisualThickness(layer,options={}){
 const raster=await rasterizeLayerForThickness(layer),built=thicknessBuildMask(raster.pixels,raster.width,raster.height),topology=thicknessTopology(built.mask,built.width,built.height);
 if(built.coverage>.94)throw Error('The artwork fills almost the entire measurement viewport; isolate the artwork from its background first.');
 const dist=thicknessDistanceMap(built.mask,built.width,built.height);let maxRadiusPx=0;
 for(let i=0;i<dist.length;i++)if(built.mask[i]&&Number.isFinite(dist[i])&&dist[i]>maxRadiusPx)maxRadiusPx=dist[i];
 const thinningLimit=Math.max(64,Math.min(512,Math.ceil(maxRadiusPx*1.55+16)));
 const skeleton=thicknessSkeletonize(built.mask,built.width,built.height,thinningLimit);
 const medial=options?.includeBranches?thicknessBuildMedialBranchGraph(skeleton,dist,built.width,built.height,raster,built):null;
 const medialSamples=medial?.samples||[];
 // When the branch graph supplies the final measurement vector, the legacy
 // branch-interior pass cannot affect the result. Reuse its identical critical
 // pixel count from the graph instead of walking the same skeleton a second time.
 const interior=medialSamples.length>=4
  ?{values:[],branchCount:thicknessSkeletonCriticalPixelCount(skeleton,built.width,built.height),pruned:false}
  :thicknessBranchInteriorSamples(skeleton,dist,built.width,built.height,raster.scale);
 const samples=medialSamples.length>=4?medialSamples.map(x=>x.width):interior.values;
 if(samples.length<4)throw Error('The artwork is too small, too thin or too irregular for a reliable medial-axis measurement.');
 const q=[.05,.1,.15,.2,.3,.4,.5,.6,.7,.8,.85,.9,.95],sortedSamples=samples.slice().sort((a,b)=>a-b),profile=q.map(v=>thicknessQuantileSorted(sortedSamples,v));
 // Keep semantic measurements tied to their quantile values, not array positions.
 // Engine 2.0 retained the old seven-entry median index (3), which silently
 // changed the reported "median" to the 20th percentile after expanding to 13.
 const medianIndex=q.indexOf(.5),lowIndex=q.indexOf(.2),highIndex=q.indexOf(.8);
 if(medianIndex<0||lowIndex<0||highIndex<0)throw Error('The thickness quantile configuration is incomplete.');
 const median=profile[medianIndex],low=profile[lowIndex],high=profile[highIndex],spread=high/Math.max(low,1e-6);
 if(!Number.isFinite(median)||median<=0)throw Error('A reliable thickness value could not be calculated.');
 let skeletonPixels=0,maskPixels=0;for(let i=0;i<skeleton.length;i++){skeletonPixels+=skeleton[i];maskPixels+=built.mask[i];}
 const confidence=!skeleton.converged?'low':samples.length>=24&&spread<=2.8?'high':samples.length>=10&&spread<=5.5?'medium':'low';
 return{thickness:median,low,high,spread,samples:samples.length,components:topology.components,holes:topology.holes,confidence,scale:raster.scale,unitResolution:1/raster.scale,profile,profileQuantiles:q,profileMethod:medialSamples.length>=4?'subpixel-medial-branch':interior.pruned?'branch-interior':'full-skeleton-fallback',branchNodes:interior.branchCount,medialSamples:medialSamples.length>=4?medialSamples:undefined,medialBranches:medial?.branches,medialNodes:medial?.nodes,medialGraph:medial?{branchCount:medial.branchCount,junctionCount:medial.junctionCount,endpointCount:medial.endpointCount,components:medial.components,fallback:medial.fallback,prunePixels:medial.prunePixels}:undefined,maskWidth:built.width,maskHeight:built.height,maskPixels,skeletonPixels,skeletonIterations:skeleton.iterations,skeletonConverged:skeleton.converged,alphaThreshold:built.alphaThreshold,maxAlpha:built.maxAlpha};
}
function attachVisualThicknessFilter(wrapper,layer,defs,shadowAlreadyOnChild=false){
 const delta=Number(layer?.thicknessMatchRadius)||0;if(!wrapper||!Number.isFinite(delta)||Math.abs(delta)<1e-8)return;
 const id='thickness_match_'+String(layer.id).replace(/[^a-z0-9_-]/gi,'_');
 // Filter regions expressed as percentages of objectBoundingBox are invalid for
 // open paths and hairline geometry whose geometric bbox has zero height/width.
 // Use the wrapper's own local coordinate system and explicitly pad its region.
 let box=null;try{const b=wrapper.getBBox();if(b&&[b.x,b.y,b.width,b.height].every(Number.isFinite))box={x:b.x,y:b.y,w:b.width,h:b.height};}catch(_){}
 if(!box){const b=bounds(layer);if(b&&[b.x,b.y,b.w,b.h].every(Number.isFinite))box={x:b.x-num(layer.x),y:b.y-num(layer.y),w:b.w,h:b.h};}
 if(!box)box={x:0,y:0,w:1,h:1};
 const matrix=getLayerModelMatrix(layer.id),scaleX=Math.max(1e-4,matrix?Math.hypot(matrix.a,matrix.b):1),scaleY=Math.max(1e-4,matrix?Math.hypot(matrix.c,matrix.d):1);
 // thicknessMatchRadius is kept in artboard units. Convert it into local X/Y
 // radii so a stretched layer does not receive a correspondingly stretched
 // world-space adjustment. feMorphology accepts independent X and Y radii.
 const radius=Math.abs(delta)/Math.max(scaleX,scaleY),radiusX=radius,radiusY=radius; // Engine 4.0: uniform radius
 let maxStroke=0;try{for(const node of [wrapper,...wrapper.querySelectorAll('*')]){const style=getComputedStyle(node),width=Math.max(0,num(style.strokeWidth||node.getAttribute?.('stroke-width'),0));if(width>maxStroke)maxStroke=width;}}catch(_){}
 const padX=Math.max(4,radiusX*3+3,maxStroke*3+3),padY=Math.max(4,radiusY*3+3,maxStroke*3+3);
 const fx=box.x-padX,fy=box.y-padY,fw=Math.max(1,box.w)+padX*2,fh=Math.max(1,box.h)+padY*2;
 const filter=svgEl('filter',{id,x:fx,y:fy,width:fw,height:fh,filterUnits:'userSpaceOnUse',primitiveUnits:'userSpaceOnUse','color-interpolation-filters':'sRGB'},defs);
 const op=delta>0?'dilate':'erode',rx=Number(radiusX.toFixed(8)),ry=Number(radiusY.toFixed(8));
 svgEl('feMorphology',{in:'SourceGraphic',operator:op,radius:`${rx} ${ry}`,result:'gspThickness'},filter);
 // For a group/SVG layer, its own shadow was previously attached to this same
 // wrapper. Rebuild that chain after morphology instead of dropping the shadow.
 if(layer.shadow&&!shadowAlreadyOnChild){
  svgEl('feGaussianBlur',{in:'gspThickness',stdDeviation:1.2,result:'gspBlur'},filter);
  svgEl('feOffset',{in:'gspBlur',dx:0,dy:1,result:'gspOffset'},filter);
  const transfer=svgEl('feComponentTransfer',{in:'gspOffset',result:'gspShadow'},filter);svgEl('feFuncA',{type:'linear',slope:.28},transfer);
  const merge=svgEl('feMerge',{},filter);svgEl('feMergeNode',{in:'gspShadow'},merge);svgEl('feMergeNode',{in:'gspThickness'},merge);
 }
 wrapper.setAttribute('filter',`url(#${id})`);
}
function thicknessLayerContains(root,id){
 if(!root||!id)return false;if(root.id===id)return true;
 if(root.type==='group')return(root.children||[]).some(child=>thicknessLayerContains(child,id));return false;
}
function thicknessHasDrawableGeometry(layer){
 if(!layer)return false;if(['path','text','rect','circle','ellipse','line','svg','image'].includes(layer.type))return true;
 return layer.type==='group'&&(layer.children||[]).some(thicknessHasDrawableGeometry);
}
function thicknessPartitionSelectedRoot(root,excludedId=null){
 if(!root)return[];
 if(root.type!=='group')return root.id===excludedId?[]:[root];
 const children=(root.children||[]).filter(child=>child&&child.id!==excludedId&&child.visible!==false&&num(child.opacity,1)>0&&!thicknessLayerContains(child,excludedId));
 const groupChildren=children.filter(child=>child.type==='group'&&thicknessHasDrawableGeometry(child));
 // Split only a true group-of-groups. Keep a group's multiple paths and all
 // subpaths of a compound path together; these may be one visual glyph.
 if(groupChildren.length>=2&&groupChildren.length===children.length){
  return groupChildren.flatMap(child=>thicknessPartitionSelectedRoot(child,excludedId));
 }
 return thicknessHasDrawableGeometry(root)&&root.id!==excludedId?[root]:[];
}
function thicknessBuildTargetPartitions(roots,referenceId){
 const out=[];for(const root of roots||[])out.push(...thicknessPartitionSelectedRoot(root,referenceId));
 const seen=new Set();return out.filter(layer=>{if(seen.has(layer.id))return false;seen.add(layer.id);return true;});
}
function thicknessCentralProfileError(a,b){
 if(!Array.isArray(a?.profile)||!Array.isArray(b?.profile)||a.profile.length!==b.profile.length)return Infinity;
 // Engine 2.1 compares a denser trimmed width distribution. The centre remains
 // important, but the tails are retained so a matching median cannot hide a
 // substantial population of over- or under-weight regions.
 const weights=a.profile.map((_,i)=>{const t=i/Math.max(1,a.profile.length-1);return .65+.7*(1-Math.abs(.5-t)*2);});
 const sum=a.profile.reduce((total,value,i)=>total+weights[i]*(Number(value)-Number(b.profile[i]))**2,0);
 return Math.sqrt(sum/weights.reduce((x,y)=>x+y,0));
}
function thicknessNextAdaptiveOffsetProbe(lastSafeDistance,bestDistance,directionLimit,resolutionStep,seed){
 const edgeTolerance=Math.max((Number(resolutionStep)||0)*1.5,(Number(seed)||0)*.15);
 if(!(lastSafeDistance>0)||bestDistance<lastSafeDistance-edgeTolerance)return null;
 const next=Math.min(Number(directionLimit)||0,Math.max(lastSafeDistance+(Number(resolutionStep)||1e-4),lastSafeDistance*1.65));
 return next>lastSafeDistance+1e-7?next:null;
}
function thicknessMatchScore(measure,reference,medianTolerance=.008,visualReferenceProfile=null){
 // Engine 4.0 — ONE definition for reference and target. The optimiser
 // minimises the raw stem-width error; the angular profile is diagnostic only
 // and can never become an acceptance gate. See testing/02_reports/DESIGN.md.
 const raw=Math.abs(Number(measure?.thickness)-Number(reference?.thickness));
 const profile=thicknessCentralProfileError(measure,reference);
 return (Number.isFinite(raw)?raw:1e9)+(Number.isFinite(profile)?profile*1e-6:0);
}
function sameThicknessTopology(a,b){return a.components===b.components&&a.holes===b.holes;}
function thicknessVectorPathEntries(zone){
 const entries=[];let unsupported=false;
 const walk=layer=>{
  if(!layer||layer.visible===false||num(layer.opacity,1)<=0)return;
  if(layer.type==='group'){for(const child of layer.children||[])walk(child);return;}
  if(layer.type!=='path'){unsupported=true;return;}
  if(String(layer.fill||'').toLowerCase()==='none'||num(layer.fillOpacity,1)<=0||num(layer.fillAlpha,255)<=0){unsupported=true;return;}
  try{prepareFilledPathForOffset(layer.d||'',true);const m=getLayerModelMatrix(layer.id);if(!m)throw Error('missing world transform');entries.push({id:layer.id,d:layer.d,fillRule:layer.fillRule||'nonzero',worldMatrix:m,allowImplicitClose:true});}
  catch(_){unsupported=true;}
 };
 walk(zone);return !unsupported&&entries.length?entries:null;
}
function thicknessApplyVectorResult(entries,result){
 for(const entry of entries){const layer=findLayer(entry.id),d=result?.get(entry.id);if(!layer||typeof d!=='string'||!d.trim())throw Error('A vector offset result was incomplete; no geometry was committed.');}
 for(const entry of entries)findLayer(entry.id).d=result.get(entry.id);
}
function updateThicknessMatchControls(){
 const button=$('bcMatchThickness'),info=$('bcThicknessMatchReference');if(!button||!info)return;
 const ref=findLayer(keyObjectId),roots=selectedRoots(),selectedRef=!!ref&&roots.some(layer=>thicknessLayerContains(layer,ref.id));
 const calibrationLayers=thicknessFindSiblingCalibrationLayers(ref),calibrationToggle=$('bcThicknessUseSiblingCalibration'),calibrationInfo=$('bcThicknessCalibrationAvailability');
 const excludedCalibrationLayers=calibrationToggle?.checked!==false?calibrationLayers:[];
 // Keep the UI target count identical to the actual match runner: visible
 // sibling glyphs used as calibration references must never be counted as targets.
 const targets=roots.filter(layer=>!thicknessLayerContains(layer,ref?.id)&&!excludedCalibrationLayers.some(sibling=>thicknessLayerContains(layer,sibling.id)));
 if(!ref)info.textContent='Set the ★ Key Object in the Layers panel; it will be used as the thickness reference.';
 else if(!isLayerEffectivelyAvailable(ref)||isEffectivelyLocked(ref))info.textContent=`★ Key Object “${ref.name||'Unnamed'}” is hidden or locked.`;
 else if(!selectedRef)info.textContent=`★ Key Object: ${ref.name||'Unnamed'} · select it with the target artwork.`;
 else if(!targets.length)info.textContent=`★ Key Object: ${ref.name||'Unnamed'} · select one or more target layers.`;
 else info.textContent=`★ Key Object: ${ref.name||'Unnamed'} · ${thicknessBuildTargetPartitions(targets,ref.id).length} independently measured glyph target(s).`;
 if(calibrationToggle)calibrationToggle.disabled=!calibrationLayers.length;
 if(calibrationInfo)calibrationInfo.textContent=calibrationLayers.length?`${calibrationLayers.length} visible sibling glyph(s) available · ★ remains the primary reference.`:'No sibling component glyphs detected; the ★ Key Object will be used alone.';
 button.disabled=!(ref&&selectedRef&&targets.length>0&&isLayerEffectivelyAvailable(ref)&&!isEffectivelyLocked(ref));
}
// Engine 4.0: one estimator, one objective. The reference and every target are
// measured by the same raster medial-axis statistic (`thickness`), and the solver
// minimises |target - reference|. Angular profiles, junction diagnostics and
// sibling glyphs remain available as read-only diagnostics; the guessed 3.5%
// orientation prior has been removed because it was a heuristic, not a law.
const THICKNESS_OPTICAL_BIAS=0;
function thicknessCurrentOpticalBias(){return 0; /* Engine 4.0: no guessed orientation prior. */}
const THICKNESS_OPTICAL_STRAIGHT_WINDOW=.18;
const THICKNESS_OPTICAL_STRAIGHT_DRIFT=.08;
function thicknessOpticalHorizontalness(angle){
 const a=((Number(angle)||0)%Math.PI+Math.PI)%Math.PI;
 return Math.max(0,Math.min(1,(1+Math.cos(2*a))/2));
}
function thicknessOpticalStraightSamples(measure){
 const source=(measure?.medialSamples||[]).filter(sample=>sample.branchId>=0&&Number.isFinite(sample.angle)&&Number.isFinite(sample.width)&&sample.width>0&&Number.isFinite(sample.arc)&&Number.isFinite(sample.branchLength));
 const byBranch=new Map();for(const sample of source){if(!byBranch.has(sample.branchId))byBranch.set(sample.branchId,[]);byBranch.get(sample.branchId).push(sample);}
 const eligibleSet=new Set(),undirectedDelta=(a,b)=>Math.abs(.5*Math.atan2(Math.sin(2*(a-b)),Math.cos(2*(a-b))));
 const minimumRunSamples=8,minimumRunLength=.10,window=THICKNESS_OPTICAL_STRAIGHT_WINDOW;
 for(const list of byBranch.values()){
  list.sort((a,b)=>a.arc-b.arc);const count=list.length,loop=!!list[0]?.branchLoop,branchLength=Number(list[0]?.branchLength)||0;
  const gaps=list.slice(1).map((sample,i)=>sample.arc-list[i].arc).filter(value=>value>1e-6),spacing=thicknessQuantile(gaps,.5)||.014;
  const maxGap=Math.max(.035,spacing*2.6),flags=new Array(count).fill(false),windowSteps=Math.min(count-1,Math.ceil(window/spacing*1.8)+3);
  for(let index=0;index<count;index++){
   const sample=list[index],diffs=[];
   if(loop&&branchLength>0){
    for(let step=-windowSteps;step<=windowSteps;step++){
     const otherIndex=(index+step+count)%count,other=list[otherIndex];let distance=Math.abs(other.arc-sample.arc);distance=Math.min(distance,Math.max(0,branchLength-distance));
     if(distance<=window)diffs.push(undirectedDelta(other.angle,sample.angle));
    }
   }else{
    let left=index,right=index;
    while(left>0&&sample.arc-list[left-1].arc<=window)left--;
    while(right<count-1&&list[right+1].arc-sample.arc<=window)right++;
    for(let j=left;j<=right;j++)diffs.push(undirectedDelta(list[j].angle,sample.angle));
   }
   // Median tangent drift is more stable than raw raster curvature on diagonal stair-steps.
   flags[index]=diffs.length>=6&&thicknessQuantileValue(diffs.sort((a,b)=>a-b),.5)<=THICKNESS_OPTICAL_STRAIGHT_DRIFT;
  }
  const runs=[];let run=[];
  for(let i=0;i<count;i++){
   const contiguous=run.length&&list[i].arc-list[i-1].arc<=maxGap;
   if(flags[i]){if(!contiguous&&run.length){runs.push(run);run=[];}run.push(list[i]);}
   else if(run.length){runs.push(run);run=[];}
  }
  if(run.length)runs.push(run);
  // Merge a straight run that crosses the arc origin of a closed medial loop.
  if(loop&&runs.length>1&&branchLength>0){const first=runs[0],last=runs[runs.length-1],wrapGap=first[0].arc+branchLength-last[last.length-1].arc;if(wrapGap>=0&&wrapGap<=maxGap){runs[0]=last.concat(first);runs.pop();}}
  for(const candidate of runs){
   if(candidate.length<minimumRunSamples)continue;
   let runLength=0;for(let i=1;i<candidate.length;i++){let distance=Math.abs(candidate[i].arc-candidate[i-1].arc);if(loop&&branchLength>0&&distance>branchLength*.5)distance=branchLength-distance;runLength+=distance;}
   if(runLength+spacing<minimumRunLength)continue;
   for(const sample of candidate)eligibleSet.add(sample);
  }
 }
 return source.filter(sample=>eligibleSet.has(sample));
}
function thicknessOpticalProfileSamples(measure){
 const straight=thicknessOpticalStraightSamples(measure);
 if(straight.length>=24)return{samples:straight,mode:'stable-straight-runs'};
 // Round/curved reference glyphs may not contain a long, low-curvature run.
 // The medial graph already trims endpoint and junction neighborhoods on open
 // branches; closed loops retain their interior samples. Use that geometry as a
 // scalar/local-orientation fallback rather than declaring an O unusable.
 const medial=(measure?.medialSamples||[]).filter(sample=>sample.branchId>=0&&Number.isFinite(sample.angle)&&Number.isFinite(sample.width)&&sample.width>0&&Number.isFinite(sample.arc)&&Number.isFinite(sample.branchLength));
 if(medial.length>=24)return{samples:medial,mode:'medial-axis-curved-fallback'};
 return{samples:straight.length?straight:medial,mode:'insufficient-samples'};
}
function thicknessFindSiblingCalibrationLayers(reference){
 if(!reference?.id)return[];
 const location=findParent(reference.id),parent=location?.parent;
 if(!parent||parent.type!=='group'||!/components/i.test(String(parent.name||''))||!Array.isArray(parent.children))return[];
 return parent.children.filter(layer=>layer&&layer.id!==reference.id&&layer.visible!==false&&num(layer.opacity,1)>0&&thicknessHasDrawableGeometry(layer));
}
function thicknessMedianSorted(values){
 const sorted=(values||[]).filter(Number.isFinite).slice().sort((a,b)=>a-b);
 return sorted.length?thicknessQuantileValue(sorted,.5):null;
}
function thicknessBuildSupplementaryAngularCalibration(primaryProfile,primaryMeasure,supplementaryMeasures,bias){
 const sourceRecords=[{label:'★ Key Object',measure:primaryMeasure,primary:true},...(supplementaryMeasures||[])];
 const records=[],skipped=[];
 for(const source of sourceRecords){
  const measure=source.measure;
  if(!measure||!['high','medium'].includes(measure.confidence)||!Array.isArray(measure.medialSamples)){skipped.push({label:source.label,reason:'measurement confidence or medial samples insufficient'});continue;}
  const profileSamples=thicknessOpticalProfileSamples(measure),samples=thicknessOpticalIndependentSamples(profileSamples.samples||[],.05);
  if(samples.length<24){skipped.push({label:source.label,reason:`only ${samples.length} independent stable samples`});continue;}
  const effective=samples.map(sample=>Number(sample.width)*(1+bias*thicknessOpticalHorizontalness(sample.angle))).filter(Number.isFinite);
  const baseline=thicknessMedianSorted(effective);
  if(!(baseline>0)){skipped.push({label:source.label,reason:'invalid per-glyph baseline'});continue;}
  const grid=[];
  for(let deg=0;deg<180;deg+=15){
   const angle=deg*Math.PI/180,stats=thicknessOpticalAngularWeightedStats(samples,angle,bias,.14,.26);
   const support=thicknessOpticalRunSupportDiagnostics(stats.samples||[],measure);
   const minimumSupport=Math.max(.65,(Number(measure.thickness)||1.5)*.35);
   // Straight-direction calibration requires one genuinely continuous run.
   // Summing several short arcs around O or S would otherwise fabricate a
   // long straight reference that does not exist in the glyph.
   const supported=stats.count>=8&&stats.effectiveN>=8&&stats.nearest<=.26&&stats.median>0&&support.supportLength+1e-9>=minimumSupport&&support.longestRunLength+1e-9>=minimumSupport;
   grid.push({deg,angle,supported,medianRatio:supported?stats.median/baseline:null,q25Ratio:supported?stats.q25/baseline:null,q75Ratio:supported?stats.q75/baseline:null,count:stats.count,effectiveN:stats.effectiveN,supportLength:support.supportLength,longestRunLength:support.longestRunLength,runCount:support.runCount,minimumSupport,curvatureMedian:support.curvatureMedian});
  }
  const supportedCount=grid.filter(item=>item.supported).length;
  if(!supportedCount){skipped.push({label:source.label,reason:'no angular group met continuous support and effective-sample requirements',sampleCount:samples.length});continue;}
  records.push({label:source.label,primary:!!source.primary,baseline,sampleCount:samples.length,mode:profileSamples.mode,grid,measurement:measure});
 }
 // Repeated identical glyphs (e.g. the two i characters) must not gain extra
 // authority simply because the word contains them twice. Deduplicate profiles
 // by their supported angular ratios while retaining their labels for reporting.
 const unique=[];
 for(const record of records){
  const signature=record.grid.filter(g=>g.supported).map(g=>`${g.deg}:${record.grid[g.deg/15].medianRatio.toFixed(3)}:${record.grid[g.deg/15].q25Ratio.toFixed(3)}:${record.grid[g.deg/15].q75Ratio.toFixed(3)}`).join('|');
  const match=unique.find(item=>item.signature===signature&&item.signature);
  if(match){match.labels.push(record.label);match.duplicateLabels.push(record.label);continue;}
  unique.push({...record,signature,labels:[record.label],duplicateLabels:[]});
 }
 const angularCalibration=[];
 for(let deg=0;deg<180;deg+=15){
  const primary=unique.find(record=>record.primary),primaryGrid=primary?.grid[deg/15];
  // The ★ Key Object has strict precedence wherever it has direct support.
  // Supplementary glyphs fill missing directions only; they must never shift
  // a direction that the user explicitly selected as the primary reference.
  const rows=primaryGrid?.supported
   ?[{record:primary,grid:primaryGrid}]
   :unique.filter(record=>!record.primary).map(record=>({record,grid:record.grid[deg/15]})).filter(item=>item.grid.supported);
  const median=key=>thicknessMedianSorted(rows.map(item=>item.grid[key]));
  angularCalibration.push({
   angleDegrees:deg,
   supported:rows.length>0,
   medianRatio:rows.length?median('medianRatio'):null,
   q25Ratio:rows.length?median('q25Ratio'):null,
   q75Ratio:rows.length?median('q75Ratio'):null,
   sourceGlyphs:rows.flatMap(item=>item.record.labels),
   independentGlyphs:rows.length,
   primaryUsed:!!(primaryGrid?.supported),
   supplementaryOnly:rows.length>0&&!primaryGrid?.supported,
   sampleCount:rows.reduce((sum,item)=>sum+item.grid.count,0),
   effectiveSamples:rows.reduce((sum,item)=>sum+item.grid.effectiveN,0),
   minimumSupport:rows.length?Math.max(...rows.map(item=>item.grid.minimumSupport)):null
  });
 }
 const directAngles=angularCalibration.filter(row=>row.supported).map(row=>row.angleDegrees),primaryRecord=unique.find(record=>record.primary);
 const usedSupplementary=unique.filter(record=>!record.primary&&record.grid.some((g,index)=>g.supported&&!primaryRecord?.grid[index]?.supported));
 const diagnosticOnly=unique.filter(record=>!record.primary&&!usedSupplementary.includes(record)).map(record=>({label:record.labels.join(' + '),reason:'reliable straight-run angles are already covered by the ★ Key Object; retained as diagnostic only'}));
 return{
  angularCalibration,
  supplementaryReferenceCount:usedSupplementary.length,
  supplementaryReferenceLabels:usedSupplementary.flatMap(record=>record.labels),
  supplementaryDiagnosticOnly:diagnosticOnly,
  primaryReferenceLabel:'★ Key Object',
  measuredReferenceGlyphCount:unique.length,
  angularSupportDegrees:directAngles,
  supplementaryOnlyAngles:angularCalibration.filter(row=>row.supplementaryOnly).map(row=>row.angleDegrees),
  supplementaryCandidates:(supplementaryMeasures||[]).length,
  supplementarySkipped:skipped,
  duplicateReferenceLabels:unique.flatMap(record=>record.duplicateLabels),
  referenceSources:unique.map(record=>({label:record.labels.join(' + '),baseline:record.baseline,samples:record.sampleCount,mode:record.mode,usedForNewDirections:usedSupplementary.includes(record),angles:record.grid.filter(g=>g.supported).map(g=>({degrees:g.deg,medianRatio:g.medianRatio,support:g.supportLength,longestRun:g.longestRunLength,effectiveN:g.effectiveN}))}))
 };
}

function thicknessOpticalAngleNormalize(angle){
 const a=(Number(angle)||0)%Math.PI;return a<0?a+Math.PI:a;
}
function thicknessOpticalAngleDistance(a,b){
 const d=Math.abs(thicknessOpticalAngleNormalize(a)-thicknessOpticalAngleNormalize(b));return Math.min(d,Math.PI-d);
}
function thicknessOpticalCircularMean(samples){
 let c=0,s=0,w=0;for(const sample of samples||[]){const a=thicknessOpticalAngleNormalize(sample.angle),weight=Math.max(0,Number(sample.weight)||1);c+=weight*Math.cos(2*a);s+=weight*Math.sin(2*a);w+=weight;}
 if(!w||Math.hypot(c,s)<1e-9)return thicknessOpticalAngleNormalize(samples?.[0]?.angle||0);
 return thicknessOpticalAngleNormalize(.5*Math.atan2(s,c));
}
function thicknessOpticalWeightedQuantile(values,weights,q){
 const rows=[];for(let i=0;i<(values||[]).length;i++){const value=Number(values[i]),weight=Number(weights?.[i]??1);if(Number.isFinite(value)&&Number.isFinite(weight)&&weight>0)rows.push({value,weight});}
 if(!rows.length)return 0;rows.sort((a,b)=>a.value-b.value);const total=rows.reduce((sum,row)=>sum+row.weight,0),target=Math.max(0,Math.min(1,Number(q)||0))*total;let acc=0;
 for(const row of rows){acc+=row.weight;if(acc>=target)return row.value;}return rows[rows.length-1].value;
}
function thicknessOpticalIndependentSamples(samples,minimumArcSpacing=.05){
 const byBranch=new Map();for(const sample of samples||[]){if(!Number.isFinite(sample.angle)||!Number.isFinite(sample.width)||sample.width<=0||sample.branchId<0)continue;if(!byBranch.has(sample.branchId))byBranch.set(sample.branchId,[]);byBranch.get(sample.branchId).push(sample);}
 const out=[];for(const list of byBranch.values()){
  list.sort((a,b)=>a.arc-b.arc);let last=-Infinity;for(const sample of list){if(!Number.isFinite(sample.arc)||sample.arc-last>=minimumArcSpacing-1e-9){out.push(sample);last=Number(sample.arc)||0;}}
  if(list.length>1&&out.length&&out[out.length-1]!==list[list.length-1]){const lastSample=list[list.length-1];if(lastSample.arc-last>=minimumArcSpacing*.45)out.push(lastSample);}
 }
 return out;
}
function thicknessOpticalStrokeContextDiagnostics(measure){
 const samples=measure?.medialSamples||[],branches=measure?.medialBranches||[],nodes=measure?.medialNodes||[],branchMap=new Map(branches.map(branch=>[branch.id,branch]));
 const core=[],junction=[],terminal=[],contextBySample=new Map();
 const zoneLength=Math.max(.16,Math.min(.55,(Number(measure?.thickness)||1.5)*.34));
 for(const sample of samples){
  const branch=branchMap.get(sample.branchId);let context='core',nodeType=null,edgeDistance=Infinity;
  if(branch&&!branch.loop&&!sample.branchLoop){
   const start=nodes[branch.startNode],end=nodes[branch.endNode];
   if(start&&Number.isFinite(sample.arc)&&sample.arc<zoneLength){context=start.type==='junction'?'junction':start.type==='endpoint'?'terminal':'core';nodeType=start.type;edgeDistance=sample.arc;}
   const endDistance=Math.max(0,(Number(branch.length)||Number(sample.branchLength)||0)-(Number(sample.arc)||0));
   if(end&&endDistance<zoneLength&&endDistance<edgeDistance){context=end.type==='junction'?'junction':end.type==='endpoint'?'terminal':'core';nodeType=end.type;edgeDistance=endDistance;}
  }
  if(context==='junction')junction.push(sample);else if(context==='terminal')terminal.push(sample);else core.push(sample);
  contextBySample.set(sample,{context,nodeType,edgeDistance,branchId:sample.branchId});
 }
 const med=items=>{const v=(items||[]).map(s=>Number(s.width)).filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);return v.length?thicknessQuantileValue(v,.5):null;};
 const coreMedian=med(core)||Number(measure?.thickness)||0,junctionMedian=med(junction),terminalMedian=med(terminal);
 const countType=type=>nodes.filter(node=>node.type===type).length;
 return{core,junction,terminal,contextBySample,diagnostics:{junctionNodes:countType('junction'),terminalNodes:countType('endpoint'),junctionSamples:junction.length,terminalSamples:terminal.length,coreSamples:core.length,coreMedian,junctionMedian,terminalMedian,junctionToCoreRatio:junctionMedian&&coreMedian>0?junctionMedian/coreMedian:null,terminalToCoreRatio:terminalMedian&&coreMedian>0?terminalMedian/coreMedian:null,protectedArcLength:zoneLength,method:'branch endpoint/junction neighbourhoods excluded from core stroke scoring; retained as diagnostics'}};
}
function thicknessOpticalRunSupportDiagnostics(samples,measure){
 const byBranch=new Map(),branchMap=new Map((measure?.medialBranches||[]).map(branch=>[branch.id,branch])),nodes=measure?.medialNodes||[];
 for(const sample of samples||[]){if(sample.branchId<0||!Number.isFinite(sample.arc))continue;if(!byBranch.has(sample.branchId))byBranch.set(sample.branchId,[]);byBranch.get(sample.branchId).push(sample);}
 const runs=[];let minJunctionDistance=Infinity,minTerminalDistance=Infinity;
 for(const [branchId,list] of byBranch){
  list.sort((a,b)=>a.arc-b.arc);const branch=branchMap.get(branchId),branchLength=Number(branch?.length)||Number(list[0]?.branchLength)||0,loop=!!(branch?.loop||list[0]?.branchLoop);let current=[];
  const flush=()=>{if(!current.length)return;const span=current.length>1?Math.max(0,current[current.length-1].arc-current[0].arc):0;runs.push({branchId,samples:current.length,span,startArc:current[0].arc,endArc:current[current.length-1].arc,loop});current=[];};
  for(let i=0;i<list.length;i++){if(i&&list[i].arc-list[i-1].arc>.42)flush();current.push(list[i]);}flush();
  if(loop&&branchLength>0&&runs.length>1){
   const branchRuns=runs.filter(run=>run.branchId===branchId);
   if(branchRuns.length>1){const first=branchRuns[0],last=branchRuns[branchRuns.length-1],wrapGap=first.startArc+branchLength-last.endArc;
    if(wrapGap>=0&&wrapGap<=.42){last.span+=first.span+wrapGap;last.samples+=first.samples;last.startArc=first.startArc;runs.splice(runs.indexOf(first),1);}
   }
  }
  if(!loop&&branch){
   const start=nodes[branch.startNode],end=nodes[branch.endNode];
   for(const sample of list){const startDistance=Math.max(0,Number(sample.arc)||0),endDistance=Math.max(0,branchLength-(Number(sample.arc)||0));
    if(start?.type==='junction')minJunctionDistance=Math.min(minJunctionDistance,startDistance);
    if(end?.type==='junction')minJunctionDistance=Math.min(minJunctionDistance,endDistance);
    if(start?.type==='endpoint')minTerminalDistance=Math.min(minTerminalDistance,startDistance);
    if(end?.type==='endpoint')minTerminalDistance=Math.min(minTerminalDistance,endDistance);
   }
  }
 }
 const supportLength=runs.reduce((sum,run)=>sum+run.span,0),longestRunLength=runs.reduce((max,run)=>Math.max(max,run.span),0),curvatures=(samples||[]).map(sample=>Number(sample.curvature)).filter(Number.isFinite).sort((a,b)=>a-b);
 const curvatureQ=q=>curvatures.length?thicknessQuantileValue(curvatures,q):null;
 return{supportLength,longestRunLength,runCount:runs.length,branchCount:byBranch.size,minJunctionDistance:Number.isFinite(minJunctionDistance)?minJunctionDistance:null,minTerminalDistance:Number.isFinite(minTerminalDistance)?minTerminalDistance:null,curvatureQ25:curvatureQ(.25),curvatureMedian:curvatureQ(.5),curvatureQ75:curvatureQ(.75),runs};
}
function thicknessOpticalCoreSelection(measure,referenceProfile=null){
 const basic=thicknessOpticalProfileSamples(measure),zones=thicknessOpticalStrokeContextDiagnostics(measure),coreSet=new Set(zones.core);
 const candidates=basic.samples.filter(sample=>coreSet.has(sample));
 const spaced=thicknessOpticalIndependentSamples(candidates,.05);
 const clusters=thicknessOpticalAngularClusters(spaced,.14).map(cluster=>({...cluster,support:thicknessOpticalRunSupportDiagnostics(cluster.samples,measure)}));
 // The reference defines what kind of evidence is meaningful. A curved reference
 // may use shorter continuous arc segments; a straight reference (e.g. V) must
 // not promote a target's short junction transition merely because that target
 // itself fell back to medial-axis sampling.
 const calibrationMode=referenceProfile?.measurementMode||basic.mode;
 const curvedReference=String(calibrationMode).includes('medial-axis-curved-fallback');
 const minimumSupportLength=curvedReference?.18:Math.max(.65,(Number(measure?.thickness)||1.5)*.45);
 const scoredClusters=clusters.filter(cluster=>cluster.support.supportLength+1e-9>=minimumSupportLength);
 const diagnosticClusters=clusters.filter(cluster=>cluster.support.supportLength+1e-9<minimumSupportLength);
 const reliableRuns=scoredClusters.flatMap(cluster=>cluster.samples);
 const samples=reliableRuns.length>=24?reliableRuns:[];
 const runFallback=samples.length<24;
 return{samples,mode:basic.mode+(runFallback?'+insufficient-supported-runs':''),zones,featureFallback:false,runFallback,candidateSamples:candidates.length,reliableRunSamples:reliableRuns.length,scoredClusters,diagnosticClusters,minimumSupportLength,calibrationMode};
}
function thicknessOpticalAngularClusters(samples,gapRadians=.14){
 const byBranch=new Map();
 for(const sample of samples||[]){
  if(!Number.isFinite(sample.angle)||!Number.isFinite(sample.width)||sample.width<=0||!Number.isFinite(sample.arc)||sample.branchId<0)continue;
  if(!byBranch.has(sample.branchId))byBranch.set(sample.branchId,[]);byBranch.get(sample.branchId).push(sample);
 }
 const qualifiedRuns=[],minimumRunSamples=8,minimumRunSpan=.18;
 for(const list of byBranch.values()){
  list.sort((a,b)=>a.arc-b.arc);
  const gaps=list.slice(1).map((sample,i)=>Math.abs(sample.arc-list[i].arc)).filter(v=>v>1e-6);
  const ordered=gaps.slice().sort((a,b)=>a-b),spacing=thicknessOpticalWeightedQuantile(ordered,ordered.map(()=>1),.5)||.05;
  const maxArcGap=Math.max(.42,spacing*6),runs=[];let run=[];
  const flush=()=>{if(run.length){runs.push(run);run=[];}};
  for(let i=0;i<list.length;i++){
   const sample=list[i],previous=i?list[i-1]:null;
   const split=previous&&(sample.arc-previous.arc>maxArcGap||thicknessOpticalAngleDistance(sample.angle,previous.angle)>gapRadians);
   if(split)flush();run.push(sample);
  }
  flush();
  const loop=!!list[0]?.branchLoop,branchLength=Number(list[0]?.branchLength)||0;
  // Join the two ends of a closed medial loop when the same stable run crosses arc zero.
  if(loop&&branchLength>0&&runs.length>1){
   const first=runs[0],last=runs[runs.length-1],wrapGap=first[0].arc+branchLength-last[last.length-1].arc;
   const angleGap=thicknessOpticalAngleDistance(first[0].angle,last[last.length-1].angle);
   if(wrapGap>=0&&wrapGap<=maxArcGap&&angleGap<=gapRadians){runs[0]=last.concat(first);runs.pop();}
  }
  for(const candidate of runs){
   const span=candidate.length>1?Math.max(...candidate.map(x=>x.arc))-Math.min(...candidate.map(x=>x.arc)):0;
   if(candidate.length>=minimumRunSamples&&span>=minimumRunSpan)qualifiedRuns.push(...candidate);
  }
 }
 const sorted=qualifiedRuns.sort((a,b)=>thicknessOpticalAngleNormalize(a.angle)-thicknessOpticalAngleNormalize(b.angle));
 if(!sorted.length)return[];
 // Once short/disconnected fragments are removed, merge valid runs with nearby angles.
 const clusters=[];let current=[sorted[0]];
 for(let i=1;i<sorted.length;i++){
  if(thicknessOpticalAngleNormalize(sorted[i].angle)-thicknessOpticalAngleNormalize(sorted[i-1].angle)<=gapRadians)current.push(sorted[i]);
  else{clusters.push(current);current=[sorted[i]];}
 }
 if(current.length)clusters.push(current);
 if(clusters.length>1){
  const first=clusters[0],last=clusters[clusters.length-1];
  const wrap=thicknessOpticalAngleNormalize(first[0].angle)+Math.PI-thicknessOpticalAngleNormalize(last[last.length-1].angle);
  if(wrap<=gapRadians){clusters[0]=last.concat(first);clusters.pop();}
 }
 return clusters.map(items=>({samples:items,angle:thicknessOpticalCircularMean(items)})).sort((a,b)=>a.angle-b.angle);
}
function thicknessOpticalAngularWeightedStats(samples,angle,bias,sigma=.21,maxDistance=.48){
 const values=[],weights=[],kept=[];let nearest=Infinity;
 for(const sample of samples||[]){const d=thicknessOpticalAngleDistance(sample.angle,angle);nearest=Math.min(nearest,d);if(d>maxDistance)continue;const w=Math.exp(-.5*(d/sigma)**2);if(w<.015)continue;values.push(sample.width*(1+bias*thicknessOpticalHorizontalness(sample.angle)));weights.push(w);kept.push(sample);}
 const sum=weights.reduce((a,b)=>a+b,0),sum2=weights.reduce((a,b)=>a+b*b,0),effectiveN=sum2>0?sum*sum/sum2:0;
 if(!values.length)return{count:0,effectiveN:0,nearest,median:null,q10:null,q25:null,q75:null,q90:null,spread:null};
 const q=p=>thicknessOpticalWeightedQuantile(values,weights,p);
 return{count:values.length,effectiveN,nearest,median:q(.5),q10:q(.1),q25:q(.25),q75:q(.75),q90:q(.9),spread:q(.75)-q(.25),samples:kept,values,weights};
}
function thicknessBuildOpticalReferenceProfile(reference,bias=thicknessCurrentOpticalBias(),supplementaryMeasures=[]){
 const selection=thicknessOpticalCoreSelection(reference);let source=selection.samples;
 if(source.length<24)return null;
 let samples=thicknessOpticalIndependentSamples(source,.05);if(samples.length<24)samples=source.slice();
 const effective=samples.map(sample=>sample.width*(1+bias*thicknessOpticalHorizontalness(sample.angle))).sort((a,b)=>a-b);
 if(effective.length<24)return null;
 const quantiles={q10:thicknessQuantileValue(effective,.1),q25:thicknessQuantileValue(effective,.25),median:thicknessQuantileValue(effective,.5),q75:thicknessQuantileValue(effective,.75),q90:thicknessQuantileValue(effective,.9)};
 const angularCounts=[];for(let deg=0;deg<180;deg+=15){const center=deg*Math.PI/180,stats=thicknessOpticalAngularWeightedStats(samples,center,bias,.14,.26);angularCounts.push({angleDeg:deg,count:stats.count,effectiveN:Number(stats.effectiveN.toFixed(2)),median:stats.median});}
 const context=selection.zones.diagnostics;
 const profile={width:Number(reference.thickness),perceivedWidth:quantiles.median,bias,meanHorizontalness:samples.reduce((sum,s)=>sum+thicknessOpticalHorizontalness(s.angle),0)/samples.length,sampleCount:samples.length,measurementMode:selection.mode,angularBandwidthRadians:.14,angularSupportLimitRadians:.26,minAngularEffectiveSamples:8,angularSamples:samples.map(sample=>({angle:thicknessOpticalAngleNormalize(sample.angle),width:Number(sample.width),branchId:sample.branchId,arc:sample.arc})),fallbackQuantiles:quantiles,angularCounts,featureDiagnostics:context,referenceBranches:(reference.medialBranches||[]).length,referenceJunctions:context.junctionNodes,referenceTerminals:context.terminalNodes,baselineMethod:'continuous periodic angular-kernel profile; local measured support within 14.9 degrees, otherwise scalar perceptual prior for unseen directions'};
 if(Array.isArray(supplementaryMeasures)&&supplementaryMeasures.length){
  const calibration=thicknessBuildSupplementaryAngularCalibration(profile,reference,supplementaryMeasures,bias);
  profile.angularCalibration=calibration.angularCalibration;
  profile.supplementaryReferenceCount=calibration.supplementaryReferenceCount;
  profile.supplementaryReferenceLabels=calibration.supplementaryReferenceLabels;
  profile.supplementaryCandidates=calibration.supplementaryCandidates;
  profile.supplementarySkipped=calibration.supplementarySkipped;
  profile.duplicateReferenceLabels=calibration.duplicateReferenceLabels;
  profile.referenceSources=calibration.referenceSources;
  profile.supplementaryDiagnosticOnly=calibration.supplementaryDiagnosticOnly;
  profile.supplementaryOnlyAngles=calibration.supplementaryOnlyAngles;
  profile.measuredReferenceGlyphCount=calibration.measuredReferenceGlyphCount;
  profile.angularSupportDegrees=calibration.angularSupportDegrees;
  if(profile.supplementaryReferenceCount>0){
   profile.measurementMode=`multi-reference sibling calibration (${profile.supplementaryReferenceCount} supplementary glyphs; ${selection.mode} primary)`;
   profile.baselineMethod='★ Key Object anchors absolute perceived weight; supplementary sibling glyphs contribute equal-glyph, per-letter-normalized local angular medians and q25/q75 only where independently supported; duplicate siblings are deduplicated; unsupported directions retain the perceptual prior';
  }
 }
 return profile;
}
function thicknessOpticalExpectedEffectiveWidth(angle,referenceProfile){
 if(!referenceProfile)return{median:0,source:'unavailable',effectiveN:0};
 const grid=referenceProfile.angularCalibration;
 if(Array.isArray(grid)&&grid.length===12){
  const normalized=thicknessOpticalAngleNormalize(angle),position=normalized*180/Math.PI/15,index=Math.floor(position)%12,next=(index+1)%12,t=position-Math.floor(position),a=grid[index],b=grid[next];
  const make=row=>row?.supported?{median:referenceProfile.perceivedWidth*row.medianRatio,q25:referenceProfile.perceivedWidth*row.q25Ratio,q75:referenceProfile.perceivedWidth*row.q75Ratio,source:row.primaryUsed?'measured ★ Key Object reference':'measured supplementary multi-reference calibration',count:row.sampleCount,effectiveN:row.effectiveSamples,nearestAngleDegrees:0,supportGlyphs:row.sourceGlyphs,independentGlyphs:row.independentGlyphs}:null;
  const av=make(a),bv=make(b);
  if(av&&bv){
   const blend=(x,y)=>Number(x)+(Number(y)-Number(x))*t;
   const used=t<=1e-9?[av]:(t>=1-1e-9?[bv]:[av,bv]);
   const source=t<=1e-9?av.source:(t>=1-1e-9?bv.source:(av.source===bv.source?av.source:'measured interpolated primary/supplementary reference'));
   return{median:blend(av.median,bv.median),q25:blend(av.q25,bv.q25),q75:blend(av.q75,bv.q75),source,count:used.reduce((sum,x)=>sum+x.count,0),effectiveN:used.reduce((sum,x)=>sum+x.effectiveN,0),nearestAngleDegrees:0,supportGlyphs:[...new Set(used.flatMap(x=>x.supportGlyphs||[]))],independentGlyphs:Math.max(...used.map(x=>x.independentGlyphs))};
  }
  const candidates=[av,bv].map((item,i)=>item?{...item,nearestAngleDegrees:thicknessOpticalAngleDistance(normalized,(i?index+1:index)*Math.PI/12)*180/Math.PI}:null).filter(Boolean);
  if(candidates.length){
   const best=candidates.sort((x,y)=>x.nearestAngleDegrees-y.nearestAngleDegrees)[0];
   // A single neighbouring grid centre may only supply a direct reference when
   // it is inside the same angular support limit used by the base measurement.
   // This prevents a 15-degree extrapolation from being mislabeled as direct.
   if(best.nearestAngleDegrees<=(referenceProfile.angularSupportLimitRadians||.26)*180/Math.PI)
    return best;
  }
 }
 const samples=referenceProfile.angularSamples||[],stats=thicknessOpticalAngularWeightedStats(samples,angle,referenceProfile.bias,referenceProfile.angularBandwidthRadians||.14,referenceProfile.angularSupportLimitRadians||.26);
 if(stats.effectiveN>=(referenceProfile.minAngularEffectiveSamples||8)&&stats.nearest<=(referenceProfile.angularSupportLimitRadians||.26)&&stats.median>0)
  return{median:stats.median,q10:stats.q10,q25:stats.q25,q75:stats.q75,q90:stats.q90,spread:stats.spread,source:'measured continuous angular neighbourhood',count:stats.count,effectiveN:stats.effectiveN,nearestAngleDegrees:stats.nearest*180/Math.PI};
 const fallback=Number(referenceProfile.perceivedWidth)||Number(referenceProfile.width)||0;
 return{median:fallback,q10:referenceProfile.fallbackQuantiles?.q10??fallback,q25:referenceProfile.fallbackQuantiles?.q25??fallback,q75:referenceProfile.fallbackQuantiles?.q75??fallback,q90:referenceProfile.fallbackQuantiles?.q90??fallback,spread:null,source:'perceptual prior; no direct reference support at this angle',count:0,effectiveN:0,nearestAngleDegrees:stats.nearest*180/Math.PI};
}
function thicknessOpticalWidthFactor(angle,referenceProfile){
 if(!referenceProfile)return 1;
 const expected=thicknessOpticalExpectedEffectiveWidth(angle,referenceProfile),desiredRaw=Number(expected.median)/(1+referenceProfile.bias*thicknessOpticalHorizontalness(angle));
 return desiredRaw/Math.max(1e-9,Number(referenceProfile.width)||1);
}
function thicknessBuildOpticalCorrectionModel(target,referenceProfile){
 const selection=thicknessOpticalCoreSelection(target,referenceProfile),source=target?.medialSamples||[],eligibleSet=new Set(selection.samples);
 if(selection.samples.length<24||!referenceProfile)throw Error('Too few protected core-stroke samples for continuous optical refinement.');
 const points=source.filter(sample=>sample.branchId>=0&&eligibleSet.has(sample)&&Number.isFinite(sample.x)&&Number.isFinite(sample.y)&&Number.isFinite(sample.width)&&Number.isFinite(sample.radius)&&sample.radius>1e-6).map(sample=>({...sample,delta:0,correctionSource:'continuous-angle',referenceBranch:null}));
 const branches=new Map();
 for(const point of points){
  const expected=thicknessOpticalExpectedEffectiveWidth(point.angle,referenceProfile),desiredRaw=Number(expected.median)/(1+referenceProfile.bias*thicknessOpticalHorizontalness(point.angle));
  const limit=Math.min(point.radius*.18,.025);point.delta=Math.max(-limit,Math.min(limit,(desiredRaw-point.width)/2));point.referenceSource=expected.source;
  if(!branches.has(point.branchId))branches.set(point.branchId,[]);branches.get(point.branchId).push(point);
 }
 let eligible=0,meanAbs=0;
 for(const list of branches.values()){
  list.sort((a,b)=>a.arc-b.arc);const gaps=list.slice(1).map((sample,i)=>Math.abs(sample.arc-list[i].arc)).filter(v=>v>1e-6),spacing=thicknessQuantileValue(gaps.slice().sort((a,b)=>a-b),.5)||.014;
  const sigma=Math.max(.06,Math.min(.16,spacing*7)),raw=list.map(point=>point.delta),loop=!!list[0]?.branchLoop,branchLength=Number(list[0]?.branchLength)||0;
  const neighborRadius=Math.min(20,Math.max(0,Math.floor((list.length-1)/2)));
  for(let i=0;i<list.length;i++){
   let sum=0,weight=0;
   for(let offset=-neighborRadius;offset<=neighborRadius;offset++){
    let j=i+offset;if(loop&&branchLength>0)j=(j+list.length)%list.length;if(j<0||j>=list.length)continue;
    let distance=Math.abs(list[j].arc-list[i].arc);if(loop&&branchLength>0)distance=Math.min(distance,Math.max(0,branchLength-distance));if(distance>2.5*sigma)continue;
    const w=Math.exp(-.5*(distance/sigma)**2);sum+=raw[j]*w;weight+=w;
   }
   list[i].delta=weight>1e-9?sum/weight:raw[i];const cap=Math.min(list[i].radius*.18,.025);list[i].delta=Math.max(-cap,Math.min(cap,list[i].delta));eligible++;meanAbs+=Math.abs(list[i].delta);
  }
 }
 const junctions=(target?.medialNodes||[]).filter(node=>node.type==='junction'||node.type==='endpoint');
 if(eligible<24)throw Error('Fewer than 24 stable core-stroke samples are eligible for optical refinement.');
 return{points,junctions,maxRadius:points.reduce((max,p)=>Math.max(max,p.radius),0),meanAbsCorrection:meanAbs/eligible,branchMappings:[],branchMappedSamples:0,scalarMappedSamples:eligible,featureMappedSamples:0,unmatchedSamples:Math.max(0,source.length-eligible),scalarReferenceWidth:referenceProfile.width,opticalReferenceProfile:referenceProfile,opticalEligibleSamples:eligible,measurementMode:selection.mode,featureDiagnostics:selection.zones.diagnostics,continuousAngular:true};
}
function thicknessOpticalProfileMetrics(measure,referenceProfile){
 if(!referenceProfile)return{error:Infinity,samples:0,groups:[],reason:'continuous reference profile unavailable'};
 const selection=thicknessOpticalCoreSelection(measure,referenceProfile),samples=thicknessOpticalIndependentSamples(selection.samples,.05),groups=[],weightedMedianErrors=[],distributionErrors=[],fallbackGroups=[];
 const append=(angle,angleDeg,stats,expected,support,scored,reason='')=>{
  const medianError=stats.median-expected.median,direct=String(expected.source).startsWith('measured');
  const q25Error=direct?stats.q25-expected.q25:null,q75Error=direct?stats.q75-expected.q75:null;
  const distributionError=direct?Math.sqrt((q25Error*q25Error+q75Error*q75Error)/2):null;
  const distributionWeight=direct?.14:0,localScore=Math.sqrt(medianError*medianError+distributionWeight*(distributionError||0)**2);
  const row={name:`${angleDeg.toFixed(1)}°`,angleDeg,angleRadians:angle,samples:stats.count,effectiveN:stats.effectiveN,median:stats.median,medianError,referenceMedian:expected.median,referenceSource:expected.source,nearestReferenceAngleDegrees:expected.nearestAngleDegrees??null,q10:stats.q10,q25:stats.q25,q50:stats.median,q75:stats.q75,q90:stats.q90,centralSpread:stats.spread,referenceQ25:direct?expected.q25:null,referenceQ75:direct?expected.q75:null,distributionError,distributionComparable:direct,localScore,scored,supportLength:support.supportLength,longestRunLength:support.longestRunLength,runCount:support.runCount,branchCount:support.branchCount,minJunctionDistance:support.minJunctionDistance,minTerminalDistance:support.minTerminalDistance,curvatureQ25:support.curvatureQ25,curvatureMedian:support.curvatureMedian,curvatureQ75:support.curvatureQ75,minimumSupportLength:selection.minimumSupportLength??null,diagnosticReason:reason||null};
  groups.push(row);
  if(scored){weightedMedianErrors.push(medianError);if(direct&&Number.isFinite(distributionError))distributionErrors.push(distributionError);else fallbackGroups.push(row.name);}
 };
 // Evaluate a smooth 15-degree grid over the undirected orientation domain.
 // Each center uses a continuous angular kernel, not a hard orientation bin.
 for(let deg=0;deg<180;deg+=15){
  const angle=deg*Math.PI/180,stats=thicknessOpticalAngularWeightedStats(samples,angle,referenceProfile.bias,referenceProfile.angularBandwidthRadians||.14,referenceProfile.angularSupportLimitRadians||.26);
  if(stats.effectiveN<6||stats.count<8||!Number.isFinite(stats.median))continue;
  const support=thicknessOpticalRunSupportDiagnostics(stats.samples,measure);
  if(support.supportLength+1e-9<(selection.minimumSupportLength||.65))continue;
  const expected=thicknessOpticalExpectedEffectiveWidth(angle,referenceProfile);
  append(angle,deg,stats,expected,support,true);
 }
 // Keep short or junction-adjacent runs visible, but never let them control
 // the deformation merely because they sit near a supported reference angle.
 for(const cluster of selection.diagnosticClusters||[]){
  const stats=thicknessOpticalAngularWeightedStats(cluster.samples,cluster.angle,referenceProfile.bias,referenceProfile.angularBandwidthRadians||.14,referenceProfile.angularSupportLimitRadians||.26);
  if(stats.effectiveN<6||stats.count<6||!Number.isFinite(stats.median))continue;
  const support=cluster.support||thicknessOpticalRunSupportDiagnostics(stats.samples,measure),expected=thicknessOpticalExpectedEffectiveWidth(cluster.angle,referenceProfile);
  const nearJunction=support.minJunctionDistance!==null&&support.minJunctionDistance<(Number(measure?.thickness)||1.5)*.75;
  const reason=`insufficient continuous stroke support (${support.supportLength.toFixed(3)} < ${(selection.minimumSupportLength||0).toFixed(3)} units)${nearJunction?'; junction-adjacent transition':''}`;
  append(cluster.angle,cluster.angle*180/Math.PI,stats,expected,support,false,reason);
 }
 const scoredGroups=groups.filter(group=>group.scored);
 if(!scoredGroups.length)return{error:Infinity,medianError:Infinity,samples:samples.length,groups,scoredGroups,measurementMode:selection.mode,reason:'no angular direction has sufficient continuous stroke support',featureDiagnostics:selection.zones.diagnostics,excludedLowSupportGroups:groups.filter(g=>!g.scored).length,calibrationMode:selection.calibrationMode};
 const error=Math.sqrt(scoredGroups.reduce((sum,g)=>sum+g.localScore*g.localScore,0)/scoredGroups.length),medianError=thicknessQuantileValue(weightedMedianErrors.slice().sort((a,b)=>a-b),.5),medianRms=Math.sqrt(weightedMedianErrors.reduce((sum,v)=>sum+v*v,0)/weightedMedianErrors.length),distributionRms=distributionErrors.length?Math.sqrt(distributionErrors.reduce((sum,v)=>sum+v*v,0)/distributionErrors.length):null;
 const perceivedMedian=thicknessQuantileValue(scoredGroups.map(g=>g.median).sort((a,b)=>a-b),.5);
 return{error,medianError,medianRms,distributionRms,perceivedMedian,samples:samples.length,groups,scoredGroups,measurementMode:selection.mode,continuousAngular:true,angularGridStepDegrees:15,angleClusterCount:scoredGroups.length,measuredReferenceClusters:scoredGroups.filter(g=>g.distributionComparable).length,priorOnlyClusters:scoredGroups.filter(g=>!g.distributionComparable).length,priorOnlyAngles:fallbackGroups,featureDiagnostics:selection.zones.diagnostics,excludedLowSupportGroups:groups.filter(g=>!g.scored).length,minimumStrokeSupport:selection.minimumSupportLength,calibrationMode:selection.calibrationMode,distributionMethod:'15-degree orientation evaluation grid with continuous angular kernels; q25/q75 checked only where reference direction is directly measured; low-support/feature-adjacent runs diagnostic-only'};
}
async function thicknessTryOpticalRefinement(zone,entries,baselineMeasure,referenceMeasure,medianTolerance,paperSession=null,referenceProfileOverride=null){
 const referenceProfile=referenceProfileOverride||thicknessBuildOpticalReferenceProfile(referenceMeasure);
 if(!referenceProfile)return{accepted:false,reason:'Key Object has insufficient straight-orientation samples; smooth vector result retained.'};
 let model;try{model=thicknessBuildOpticalCorrectionModel(baselineMeasure,referenceProfile);}catch(error){return{accepted:false,reason:error.message||'optical correction model unavailable'};}
 const beforeMetrics=thicknessOpticalProfileMetrics(baselineMeasure,referenceProfile);
 if(!Number.isFinite(beforeMetrics.error))return{accepted:false,reason:beforeMetrics.reason||'visual-weight profile could not be measured',referenceProfile,beforeMetrics};
 const baselinePaths=new Map(entries.map(entry=>[entry.id,entry.d]));
 const baselineShapeProfileError=thicknessCentralProfileError(baselineMeasure,referenceMeasure);
 const baselineRawMedianError=Math.abs(Number(baselineMeasure?.thickness)-Number(referenceMeasure?.thickness));
 const resolution=Math.max(Number(baselineMeasure?.unitResolution)||0,Number(referenceMeasure?.unitResolution)||0);
 const minGain=Math.max(.0025,resolution*.25);
 const visualProfileTolerance=Math.max(.01,referenceProfile.perceivedWidth*.01);
 const baselineVisualMedianError=Math.abs(Number(beforeMetrics.medianError)||0);
 const maxVisualMedianError=baselineVisualMedianError<=medianTolerance
  ?medianTolerance
  :baselineVisualMedianError+Math.min(.00075,Math.max(.0001,resolution*.08));
 const groupRegressionTolerance=Math.max(.002,resolution*.5);
 let winner=null,evaluations=0,rejected=0,lastReason='',attempted=0,geometryMs=0,measurementMs=0;
 const restore=()=>thicknessApplyVectorResult(entries,baselinePaths);
 for(const factor of [.06,.10,.14,.18,.24,.32,.42,.54,.68,.82,1.00]){
  attempted++;restore();
  try{
   const geometryStarted=performance.now();const candidate=await thicknessAdaptiveWarpBatch(entries,baselineMeasure,referenceMeasure,factor,model,paperSession);geometryMs+=performance.now()-geometryStarted;
   if(!candidate?.paths||candidate.paths.size!==entries.length){rejected++;lastReason='incomplete optical candidate';continue;}
   thicknessApplyVectorResult(entries,candidate.paths);renderCanvas();
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const measurementStarted=performance.now();const measured=await measureLayerVisualThicknessV3(zone);measurementMs+=performance.now()-measurementStarted;evaluations++;
   if(measured.confidence==='low'||!sameThicknessTopology(baselineMeasure,measured)){rejected++;lastReason='measurement confidence or component/counter topology changed';continue;}
   const metrics=thicknessOpticalProfileMetrics(measured,referenceProfile);
   const rawMedianError=Math.abs(measured.thickness-referenceMeasure.thickness),shapeProfileError=thicknessCentralProfileError(measured,referenceMeasure);
   const visualMedianError=Math.abs(Number(metrics.medianError)||0);
   if(rawMedianError>baselineRawMedianError+1e-9){
    rejected++;lastReason='candidate worsened the raw stem width';continue;
   }
   // Do not permit a candidate to fix one stroke direction by making another
   // measured direction materially worse. The allowance is bounded by raster resolution.
   const regressedGroup=metrics.groups.filter(group=>group.scored!==false).find(group=>{const previous=beforeMetrics.groups.reduce((best,item)=>!best||thicknessOpticalAngleDistance(item.angleRadians,group.angleRadians)<thicknessOpticalAngleDistance(best.angleRadians,group.angleRadians)?item:best,null);return previous&&thicknessOpticalAngleDistance(previous.angleRadians,group.angleRadians)<=.16&&Math.abs(group.medianError)>Math.abs(previous.medianError)+groupRegressionTolerance;});
   const distributionRegressionTolerance=Math.max(.004,resolution*.75);
   const distributionRegression=metrics.groups.filter(group=>group.scored!==false).find(group=>{if(!group.distributionComparable)return false;const previous=beforeMetrics.groups.reduce((best,item)=>!best||thicknessOpticalAngleDistance(item.angleRadians,group.angleRadians)<thicknessOpticalAngleDistance(best.angleRadians,group.angleRadians)?item:best,null);return previous?.distributionComparable&&Number.isFinite(group.distributionError)&&Number.isFinite(previous.distributionError)&&group.distributionError>previous.distributionError+distributionRegressionTolerance;});
   if(regressedGroup){lastReason=`${regressedGroup.name} angular profile diagnostic`;} // Engine 4.0: diagnostic only
   if(distributionRegression){lastReason=`${distributionRegression.name} distribution diagnostic`;} // Engine 4.0: diagnostic only
   // The complete 13-quantile profile is reported, but not used as an acceptance
   // gate: its tails encode glyph-specific tips, counters and junctions.
   if(rawMedianError<baselineRawMedianError-minGain&&(!winner||rawMedianError<winner.rawMedianError))
    winner={factor,paths:candidate.paths,measure:measured,metrics,medianError:rawMedianError,visualMedianError,rawMedianError,profileError:shapeProfileError,candidate};
  }catch(error){rejected++;lastReason=String(error?.message||error).slice(0,140);}
  restore();renderCanvas();
 }
 if(!winner){restore();renderCanvas();return{accepted:false,reason:`no optical candidate reduced orientation-group median error by at least ${minGain.toFixed(5)} while preserving topology and the perceptual median band; ${lastReason||'baseline retained'}`,referenceProfile,beforeMetrics,evaluations,rejected,attempted,geometryMs,measurementMs,minGain,medianTolerance,maxVisualMedianError,visualProfileTolerance,baselineVisualMedianError,baselineRawMedianError,baselineShapeProfileError};}
 thicknessApplyVectorResult(entries,winner.paths);renderCanvas();
 return{accepted:true,reason:'orientation-group visual weight improved beyond raster uncertainty; glyph-specific full-profile tails retained as diagnostics',referenceProfile,beforeMetrics,afterMetrics:winner.metrics,factor:winner.factor,paths:winner.paths,measure:winner.measure,medianError:winner.medianError,rawMedianError:winner.rawMedianError,profileError:winner.profileError,evaluations,rejected,attempted,geometryMs,measurementMs,minGain,medianTolerance,maxVisualMedianError,visualProfileTolerance,baselineVisualMedianError,baselineRawMedianError,baselineShapeProfileError,candidate:winner.candidate};
}
async function matchSelectedVisualThicknessVector315(){
 if(pathInsetPreviewState)resetPathInsetPreview(true);
 const reference=findLayer(keyObjectId);if(!reference){status('Set the existing ★ Key Object in the Layers panel first. Nothing was changed.','warn');return;}
 const roots=selectedRoots(),selectedReference=roots.some(root=>thicknessLayerContains(root,reference.id));
 if(!selectedReference){status('Select the ★ Key Object together with the target artwork. Nothing was changed.','warn');return;}
 if(!isLayerEffectivelyAvailable(reference)||isEffectivelyLocked(reference)){status('The ★ Key Object must be visible and unlocked. Nothing was changed.','warn');return;}
 const useSiblingCalibration=$('bcThicknessUseSiblingCalibration')?.checked!==false;
 const supplementaryLayers=useSiblingCalibration?thicknessFindSiblingCalibrationLayers(reference):[];
 const selectedTargets=roots.filter(root=>!thicknessLayerContains(root,reference.id)&&!supplementaryLayers.some(sibling=>thicknessLayerContains(root,sibling.id)));
 if(!selectedTargets.length){status('Select one or more target layers in addition to the ★ Key Object. Supplementary reference siblings are not treated as targets.','warn');return;}
 const targets=thicknessBuildTargetPartitions(selectedTargets,reference.id);if(!targets.length){status('No independently measurable target glyphs were found. Nothing was changed.','warn');return;}
 const operationStarted=performance.now();let paperSession=null,totalOffsetAttempts=0,totalOpticalAttempts=0,totalOffsetMs=0,totalWarpMs=0,totalMeasurementMs=0;
 let referenceMeasure;try{status(`Measuring ★ Key Object “${reference.name||'Unnamed'}” with Thickness Engine 4.0 · exact stem-width matching…`,'');const measurementStarted=performance.now();referenceMeasure=await measureLayerVisualThicknessV3(reference);totalMeasurementMs+=performance.now()-measurementStarted;}catch(error){status(`The ★ Key Object could not be measured: ${error.message||error}. Nothing was changed.`,'error');return;}
 if(referenceMeasure.confidence==='low'){status('The ★ Key Object has low measurement confidence. Choose a clear, sufficiently large reference. Nothing was changed.','warn');return;}
 const supplementaryMeasures=[],supplementarySkips=[];
 for(const layer of supplementaryLayers){
  try{
   const started=performance.now(),measure=await measureLayerVisualThicknessV3(layer);totalMeasurementMs+=performance.now()-started;
   const availableSamples=thicknessOpticalProfileSamples(measure).samples.length;
   if(!['high','medium'].includes(measure.confidence)||availableSamples<24){supplementarySkips.push(`${layer.name||'Sibling glyph'}: insufficient reliable samples (${availableSamples})`);continue;}
   supplementaryMeasures.push({label:layer.name||'Supplementary glyph',measure});
  }catch(error){supplementarySkips.push(`${layer.name||'Sibling glyph'}: ${String(error?.message||error).slice(0,100)}`);}
 }
 const visualReferenceProfile=thicknessBuildOpticalReferenceProfile(referenceMeasure,thicknessCurrentOpticalBias(),supplementaryMeasures);
 const referenceGuard=JSON.stringify(reference),supplementaryGuards=supplementaryMeasures.map(item=>({label:item.label,layer:findLayer(supplementaryLayers.find(layer=>layer.name===item.label)?.id)||null,serialized:null})),before=badgeInspectorHistorySnapshot(),changed=[],partial=[],already=[],skipped=[],failed=[],zoneReports=[];
 for(let i=0;i<supplementaryGuards.length;i++){const layer=supplementaryLayers.find(item=>item.name===supplementaryMeasures[i].label)||supplementaryLayers[i];supplementaryGuards[i].layer=layer;supplementaryGuards[i].serialized=JSON.stringify(layer);}

 try{
  for(let zoneIndex=0;zoneIndex<targets.length;zoneIndex++){
   const zone=targets[zoneIndex],zoneName=zone.name&&zone.name!=='Imported group'?zone.name:`Glyph ${zoneIndex+1}`;
   if(!isLayerEffectivelyAvailable(zone)||isEffectivelyLocked(zone)||hasVisibleLockedLayer(zone)){skipped.push(`${zoneName}: hidden or locked`);continue;}
   const snapshot=clone(zone);let base;
   try{const measurementStarted=performance.now();base=await measureLayerVisualThicknessV3(zone);totalMeasurementMs+=performance.now()-measurementStarted;}catch(error){skipped.push(`${zoneName}: ${error.message||'measurement unavailable'}`);continue;}
   if(base.confidence==='low'){skipped.push(`${zoneName}: low-confidence branch measurement`);continue;}
   const tolerance=Math.max(2/Math.max(1,Math.min(referenceMeasure.scale,base.scale)),.008);
   const visualProfileTolerance=visualReferenceProfile?Math.max(.01,visualReferenceProfile.perceivedWidth*.01):Infinity;
   const initialVisualMetrics=thicknessOpticalProfileMetrics(base,visualReferenceProfile);
   const rawDelta=base.thickness-referenceMeasure.thickness,initialMedianError=Math.abs(Number(initialVisualMetrics.medianError)||0),initialProfileError=thicknessCentralProfileError(base,referenceMeasure),initialVisualProfileError=initialVisualMetrics.error,initialRawMedianError=Math.abs(rawDelta),initialScore=thicknessMatchScore(base,referenceMeasure,tolerance,visualReferenceProfile);
   if(initialRawMedianError<=tolerance){already.push(`${zoneName} (visual median error ${initialMedianError.toFixed(6)}; orientation RMS ${initialVisualProfileError.toFixed(6)})`);zoneReports.push({name:zoneName,before:base.thickness,after:base.thickness,delta:0,rawMedianError:initialRawMedianError,visualMedianError:initialMedianError,visualWeightRms:initialProfileError,visualWeightTolerance:visualProfileTolerance,shapeProfileError:thicknessCentralProfileError(base,referenceMeasure),score:initialScore,method:'already within visual-weight and orientation-group tolerances'});continue;}
   const startRadius=Number(zone.thicknessMatchRadius)||0,maxRadius=Math.max(.12,Math.min(8,Math.max(base.thickness,referenceMeasure.thickness)*.75));
   const vectorEntries=startRadius===0?thicknessVectorPathEntries(snapshot):null,useVector=!!vectorEntries;
   let best={radius:startRadius,measure:base,medianError:initialMedianError,visualMetrics:initialVisualMetrics,profileError:initialProfileError,score:initialScore,vectorResult:null},evaluations=0,unsafe=false;
   const restoreVectorSource=()=>{if(useVector){for(const entry of vectorEntries){const live=findLayer(entry.id);if(live)live.d=entry.d;}zone.thicknessMatchRadius=0;}else zone.thicknessMatchRadius=startRadius;};
   const measureAt=async requestedRadius=>{
    const radius=Math.max(-maxRadius,Math.min(maxRadius,requestedRadius));let vectorResult=null;
    if(useVector){if(!paperSession)paperSession=await thicknessCreatePaperSession();totalOffsetAttempts++;const offsetStarted=performance.now();vectorResult=await offsetPathBatch(vectorEntries,radius,'miter',{keepGlyphBounds:true,sourceThickness:base.thickness,targetThickness:referenceMeasure.thickness,minAxisRatio:3,miterLimit:2,paperSession});totalOffsetMs+=performance.now()-offsetStarted;thicknessApplyVectorResult(vectorEntries,vectorResult);zone.thicknessMatchRadius=0;}
    else zone.thicknessMatchRadius=Number(radius.toFixed(8));
    renderCanvas();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const measurementStarted=performance.now();const measured=await measureLayerVisualThicknessV3(zone);totalMeasurementMs+=performance.now()-measurementStarted;evaluations++;
    if(measured.confidence==='low'||!sameThicknessTopology(base,measured))return{safe:false,measure:measured,radius,vectorResult};
    const visualMetrics=thicknessOpticalProfileMetrics(measured,visualReferenceProfile),medianError=Math.abs(Number(visualMetrics.medianError)||0),profileError=thicknessCentralProfileError(measured,referenceMeasure),score=thicknessMatchScore(measured,referenceMeasure,tolerance,visualReferenceProfile);
    if(score<best.score-1e-10)best={radius,measure:measured,medianError,visualMetrics,profileError,score,vectorResult};
    return{safe:true,measure:measured,radius,medianError,visualMetrics,profileError,score,vectorResult};
   };
   // Engine 4.0 performs a bounded coarse-to-fine search against the raw
   // stem-width objective. It never stops merely because the median crossed zero.
   // Candidates are always rebuilt from the original vector paths.
   const medianDirection=rawDelta>0?-1:1;
   // If the medians already agree but the distribution does not, the profile
   // objective may improve in either direction. Otherwise search the physically
   // expected direction first, avoiding needless shape distortion.
   const directions=rawDelta===0?[1,-1]:[medianDirection];
   const candidates=[];let boundaryReached=false,boundaryProbed=false,boundaryReason='',objectiveStopped=false,totalRangeExtensions=0;
   const safeLimitByDirection=new Map();
   const isExpectedOffsetBoundary=message=>/collapsed|zero-extent geometry|split or collapse|open contour|empty geometry|unexpected (?:expanded|reduced) bound|did not (?:reduce|increase) the filled area|separate contours intersect|counter|excessive affine scale|glyph-bounds compensation/i.test(String(message||''));
   const evaluateDistance=async(direction,distance)=>{
    const radius=startRadius+direction*distance;
    try{
     const result=await measureAt(radius);
     if(!result.safe)return{...result,safe:false,boundary:true,searchDirection:direction,searchDistance:distance};
     return{...result,searchDirection:direction,searchDistance:distance};
    }catch(error){
     const message=String(error?.message||error);
     return{safe:false,boundary:isExpectedOffsetBoundary(message),fatal:!isExpectedOffsetBoundary(message),reason:message,searchDirection:direction,searchDistance:distance};
    }
   };
   // Scan each allowed direction independently. A collapsed contour is a
   // boundary sample, not a reason to abandon refinement or the opposite side.
   for(const direction of directions){
    const directionLimit=Math.max(0,direction>0?maxRadius-startRadius:maxRadius+startRadius);
    if(directionLimit<=1e-8){safeLimitByDirection.set(direction,0);continue;}
    let lastSafeDistance=0,blockedDistance=null,blockedResult=null;
    let bestDirectionScore=Infinity,bestDirectionDistance=0,worseningAfterBest=0,stoppedOnObjective=false;
    // Search near the physically expected half-width correction first. The old
    // uniform 1/8-of-range scan started around 0.14 units for this fixture even
    // when only ~0.03–0.08 units were needed, skipping the useful local interval.
    // Keep progressively wider probes as a safety net for glyph-bounds scaling.
    const expectedOffset=Math.abs(initialRawMedianError)/2;
    const resolutionStep=Math.max(1e-4,Math.min(.02,Math.max(Number(base.unitResolution)||0,Number(referenceMeasure.unitResolution)||0)*.75));
    const seed=Math.max(expectedOffset,resolutionStep);
    const distanceProbes=[seed*.5,seed,seed*1.5,seed*2,seed*3];
    const distances=[...new Set(distanceProbes.filter(v=>Number.isFinite(v)&&v>1e-7&&v<=directionLimit).map(v=>Number(v.toFixed(8))))].sort((a,b)=>a-b);
    for(const distance of distances){
     const result=await evaluateDistance(direction,distance);
     if(!result.safe){
      blockedDistance=distance;blockedResult=result;
      if(result.boundary){boundaryProbed=true;boundaryReason=boundaryReason||result.reason||'topology or contour safety limit';}
      else if(result.fatal)failed.push(`${zoneName}: candidate evaluation failed (${result.reason||'unknown error'})`);
      break;
     }
     lastSafeDistance=distance;candidates.push(result);
     // A scalar offset has a smooth, mostly unimodal profile score around the
     // useful stroke-width correction. Once two larger, safe offsets clearly
     // worsen the best score after the median has entered tolerance, stop the
     // scan instead of deliberately probing all the way to a collapsed glyph.
     // This avoids reporting a routine far-range collapse as a target-specific
     // contour failure and saves expensive raster feedback evaluations.
     if(result.score<bestDirectionScore-1e-7){
      bestDirectionScore=result.score;bestDirectionDistance=distance;worseningAfterBest=0;
     }else if(bestDirectionScore<1e5&&distance>bestDirectionDistance+1e-7&&
              result.score>bestDirectionScore+Math.max(.0015,Math.abs(bestDirectionScore)*.012)){
      worseningAfterBest++;
     }else if(distance>bestDirectionDistance+1e-7){
      worseningAfterBest=0;
     }
     if(worseningAfterBest>=2){
      stoppedOnObjective=true;objectiveStopped=true;
      safeLimitByDirection.set(direction,lastSafeDistance);
      break;
     }
    }
    // Adaptive range extension: if the best result is still the largest safe
    // distance tested, extend the bracket in controlled 1.65x steps. Stop as
    // soon as the score clearly worsens, an unsafe boundary is hit, or three
    // extensions have been tested. This avoids both premature truncation and
    // the old blind scan across the full maximum radius.
    let rangeExtensions=0;
    if(blockedDistance===null&&!stoppedOnObjective){
     for(let extension=0;extension<3;extension++){
      const nextDistance=thicknessNextAdaptiveOffsetProbe(lastSafeDistance,bestDirectionDistance,directionLimit,resolutionStep,seed);
      if(nextDistance===null)break;
      const expanded=await evaluateDistance(direction,nextDistance);rangeExtensions++;
      if(!expanded.safe){
       blockedDistance=nextDistance;blockedResult=expanded;
       if(expanded.boundary){boundaryProbed=true;boundaryReason=boundaryReason||expanded.reason||'topology or contour safety limit';}
       else if(expanded.fatal)failed.push(`${zoneName}: adaptive range extension failed (${expanded.reason||'unknown error'})`);
       break;
      }
      lastSafeDistance=nextDistance;candidates.push(expanded);
      if(expanded.score<bestDirectionScore-1e-7){bestDirectionScore=expanded.score;bestDirectionDistance=nextDistance;worseningAfterBest=0;}
      else if(bestDirectionScore<1e5&&expanded.score>bestDirectionScore+Math.max(.0015,Math.abs(bestDirectionScore)*.012)){
       objectiveStopped=true;stoppedOnObjective=true;safeLimitByDirection.set(direction,lastSafeDistance);break;
      }
      if(nextDistance>=directionLimit-1e-7)break;
     }
    }
    totalRangeExtensions+=rangeExtensions;
    if(blockedDistance!==null&&blockedResult?.boundary){
     // Keep the last positively verified safe candidate. We do not spend up to
     // fourteen more raster measurements locating a boundary that is irrelevant
     // when the best candidate is already well inside the safe interval.
     const nearBoundary=bestDirectionDistance>=lastSafeDistance-Math.max(resolutionStep*1.5,seed*.15);
     if(nearBoundary&&bestDirectionScore<1e5)boundaryReached=true;
     safeLimitByDirection.set(direction,lastSafeDistance);
    }else if(!stoppedOnObjective){
     safeLimitByDirection.set(direction,blockedDistance===null?lastSafeDistance:lastSafeDistance);
    }
   }
   if(candidates.length){
    // Refine around the best coarse/boundary candidate. Search is parameterised
    // by distance from the unmodified source so positive and negative offsets
    // share the same safe-boundary logic.
    const winner=candidates.slice().sort((a,b)=>a.score-b.score)[0];
    const sameDirection=candidates.filter(x=>x.searchDirection===winner.searchDirection).sort((a,b)=>a.searchDistance-b.searchDistance);
    const index=sameDirection.findIndex(x=>Math.abs(x.searchDistance-winner.searchDistance)<1e-9);
    const safeLimit=safeLimitByDirection.get(winner.searchDirection)??maxRadius;
    const left=index>0?sameDirection[index-1].searchDistance:0;
    const right=index>=0&&index<sameDirection.length-1?sameDirection[index+1].searchDistance:safeLimit;
    let lo=Math.max(0,Math.min(left,right)),hi=Math.min(safeLimit,Math.max(left,right));
    const searchResolution=Math.max(Number(base.unitResolution)||0,Number(referenceMeasure.unitResolution)||0);
    if(hi-lo>Math.max(1e-4,searchResolution*.75)){
     const phi=.6180339887498949;
     let x1=hi-phi*(hi-lo),x2=lo+phi*(hi-lo);
     let r1=await evaluateDistance(winner.searchDirection,x1),r2=await evaluateDistance(winner.searchDirection,x2);
     for(let pass=0;pass<8&&hi-lo>Math.max(1e-4,searchResolution*.75);pass++){
      // If a refinement point crosses the safe boundary, move the upper bound
      // inward. It must never cause a valid partial candidate to be discarded.
      if(!r1.safe||!r2.safe){
       const rejected=!r1.safe?r1:r2;
       if(rejected.boundary){boundaryProbed=true;boundaryReason=boundaryReason||rejected.reason||'topology or contour safety limit';}
       if(!r1.safe&&(!r2.safe||x1<=x2))hi=x1;
       else hi=x2;
       if(r1.fatal||r2.fatal)failed.push(`${zoneName}: profile refinement stopped (${r1.reason||r2.reason||'candidate evaluation failed'})`);
       x1=hi-phi*(hi-lo);x2=lo+phi*(hi-lo);
       r1=await evaluateDistance(winner.searchDirection,x1);r2=await evaluateDistance(winner.searchDirection,x2);
       continue;
      }
      if(r1.score<=r2.score){hi=x2;x2=x1;r2=r1;x1=hi-phi*(hi-lo);r1=await evaluateDistance(winner.searchDirection,x1);}
      else{lo=x1;x1=x2;r1=r2;x2=lo+phi*(hi-lo);r2=await evaluateDistance(winner.searchDirection,x2);}
      if(r1.fatal||r2.fatal)failed.push(`${zoneName}: profile refinement stopped (${r1.reason||r2.reason||'candidate evaluation failed'})`);
     }
    }
   }
   if(!best||best.score>=initialScore-1e-9){restoreVectorSource();renderCanvas();failed.push(`${zoneName}: no safe profile improvement`);continue;}
   let opticalReport=null;
   if(useVector){
    if(best.vectorResult)thicknessApplyVectorResult(vectorEntries,best.vectorResult);zone.thicknessMatchRadius=0;renderCanvas();
    // Re-measure the committed smooth-vector baseline before testing any
    // optical residuals. Every refinement candidate starts from this baseline.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const opticalBaselineStarted=performance.now();const opticalBaseline=await measureLayerVisualThicknessV3(zone);totalMeasurementMs+=performance.now()-opticalBaselineStarted;
    const opticalEntries=vectorEntries.map(entry=>({...entry,d:findLayer(entry.id)?.d||entry.d}));
    opticalReport=await thicknessTryOpticalRefinement(zone,opticalEntries,opticalBaseline,referenceMeasure,tolerance,paperSession,visualReferenceProfile);
    totalOpticalAttempts+=Number(opticalReport.attempted)||0;totalWarpMs+=Number(opticalReport.geometryMs)||0;totalMeasurementMs+=Number(opticalReport.measurementMs)||0;
    if(opticalReport.accepted){
     const baselineRaw=Math.abs(Number(best.measure?.thickness)-Number(referenceMeasure.thickness));
     const candidateRaw=Math.abs(Number(opticalReport.measure?.thickness)-Number(referenceMeasure.thickness));
     if(candidateRaw<=baselineRaw+1e-9){
      best.vectorResult=opticalReport.paths;best.measure=opticalReport.measure;
      best.medianError=opticalReport.medianError;best.visualMetrics=opticalReport.afterMetrics;best.profileError=opticalReport.profileError;
      best.score=thicknessMatchScore(best.measure,referenceMeasure,tolerance,visualReferenceProfile);
     }else opticalReport.accepted=false;
    }
   }else zone.thicknessMatchRadius=best.radius;
   renderCanvas();
   const finalVisual=best.visualMetrics||thicknessOpticalProfileMetrics(best.measure,visualReferenceProfile);
   const rawFinalError=Math.abs(Number(best.measure?.thickness)-Number(referenceMeasure.thickness));
    const medianMatched=rawFinalError<=tolerance;
   const shapeProfileError=thicknessCentralProfileError(best.measure,referenceMeasure);
   if(medianMatched)changed.push(`${zoneName} (raw stem error ${rawFinalError.toFixed(6)}; orientation RMS ${finalVisual.error.toFixed(6)} diagnostic)`);
   else partial.push(`${zoneName} (raw stem residual ${rawFinalError.toFixed(6)}; orientation RMS ${finalVisual.error.toFixed(6)} diagnostic)`);
   zoneReports.push({name:zoneName,before:base.thickness,after:best.measure.thickness,delta:best.radius-startRadius,rawMedianError:Math.abs(best.measure.thickness-referenceMeasure.thickness),visualMedianError:Math.abs(Number(finalVisual.medianError)||0),medianTolerance:tolerance,visualWeightRms:finalVisual.error,visualWeightTolerance:visualProfileTolerance,orientationGroups:finalVisual.groups,excludedLowSupportGroups:finalVisual.excludedLowSupportGroups||0,minimumStrokeSupport:finalVisual.minimumStrokeSupport??null,calibrationMode:finalVisual.calibrationMode??null,distributionRms:finalVisual.distributionRms??null,featureDiagnostics:finalVisual.featureDiagnostics||null,shapeProfileError,score:best.score,visualStatus:medianMatched?'raw stem width within tolerance':'raw stem width differs',searchStopReason:objectiveStopped?'raw stem-width score worsened at larger safe offsets':boundaryReached?'geometric/topology safety boundary':'search range completed',method:useVector?'Paper.js smooth filled-vector offset + local orientation visual-weight refinement':'morphology fallback + local orientation visual-weight measurement',opticalRefinement:opticalReport?{accepted:!!opticalReport.accepted,reason:opticalReport.reason||'',factor:opticalReport.factor??null,beforeError:opticalReport.beforeMetrics?.error??null,afterError:opticalReport.afterMetrics?.error??null,samples:opticalReport.afterMetrics?.samples??opticalReport.beforeMetrics?.samples??0,evaluations:opticalReport.evaluations||0,rejected:opticalReport.rejected||0,medianTolerance:opticalReport.medianTolerance??null,maxVisualMedianError:opticalReport.maxVisualMedianError??null,visualProfileTolerance:opticalReport.visualProfileTolerance??null,baselineVisualMedianError:opticalReport.baselineVisualMedianError??null,baselineRawMedianError:opticalReport.baselineRawMedianError??null,referenceHorizontalness:opticalReport.referenceProfile?.meanHorizontalness??null,referenceMeasurementMode:opticalReport.referenceProfile?.measurementMode??null,distributionRms:opticalReport.afterMetrics?.distributionRms??opticalReport.beforeMetrics?.distributionRms??null,referenceAngularSamples:opticalReport.referenceProfile?.sampleCount??null}:null,evaluations,topologySafe:true,unsafeBoundaryReached:boundaryReached,boundaryProbed,boundaryReason,rangeExtensions:totalRangeExtensions});
   status(`Engine 4.0 · ${zoneName} · ${evaluations} offset measurements · ${opticalReport?.attempted||0} optical candidates · ${((performance.now()-operationStarted)/1000).toFixed(1)}s elapsed · visual RMS ${finalVisual.error.toFixed(6)}…`,'');
  }
  if(JSON.stringify(reference)!==referenceGuard)throw Error('The ★ Key Object changed during matching; the entire operation was rolled back.');
  for(const guard of supplementaryGuards)if(guard.layer&&JSON.stringify(guard.layer)!==guard.serialized)throw Error(`Supplementary calibration reference “${guard.label}” changed during matching; the entire operation was rolled back.`);
  if(changed.length||partial.length){pushHistoryEntry(captureHistoryEntry(before));persistBadgeDraft();render();}else render();
  const summary=zoneReports.map(z=>`${z.name}: raw ${z.before.toFixed(5)} → ${z.after.toFixed(5)} (visual median error ${z.visualMedianError.toFixed(5)}, continuous-angle RMS ${z.visualWeightRms.toFixed(5)}, low-support groups ${z.excludedLowSupportGroups||0}, local distribution RMS ${Number.isFinite(z.distributionRms)?z.distributionRms.toFixed(5):'not directly comparable'}, junction/core ${z.featureDiagnostics?.junctionToCoreRatio?z.featureDiagnostics.junctionToCoreRatio.toFixed(3):'n/a'}, terminal/core ${z.featureDiagnostics?.terminalToCoreRatio?z.featureDiagnostics.terminalToCoreRatio.toFixed(3):'n/a'}, shape-only 13-quantile diagnostic ${z.shapeProfileError.toFixed(5)}, ${z.opticalRefinement?.accepted?`optical RMS ${z.opticalRefinement.beforeError.toFixed(5)} → ${z.opticalRefinement.afterError.toFixed(5)} at factor ${z.opticalRefinement.factor.toFixed(2)}, `:z.opticalRefinement?`optical refinement retained baseline (${z.opticalRefinement.reason}), `:''}offset ${z.delta.toFixed(5)}, ${z.evaluations||0} evaluations)`).join(' | ');
  const boundaryCount=zoneReports.filter(z=>z.unsafeBoundaryReached).length,boundaryProbeCount=zoneReports.filter(z=>z.boundaryProbed).length;
  const visualPartial=partial.length;
  const parts=[];if(changed.length)parts.push(`${changed.length} stem-width matched`);if(visualPartial)parts.push(`${visualPartial} stem-width partial`);if(already.length)parts.push(`${already.length} already within stem-width tolerance`);if(boundaryCount)parts.push(`${boundaryCount} best candidate(s) limited by geometric/topology safety`);if(boundaryProbeCount)parts.push(`${boundaryProbeCount} rejected safety probe(s) kept outside the winning interval`);if(skipped.length)parts.push(`${skipped.length} skipped`);if(failed.length)parts.push(`${failed.length} candidate errors`);
  const boundaryDetails=zoneReports.filter(z=>z.unsafeBoundaryReached).map(z=>`${z.name}: winning safe offset is boundary-limited${z.boundaryReason?` (${z.boundaryReason})`:''}`);
  const details=[...skipped,...failed,...boundaryDetails];
  const measurementPixelSize=1/Math.max(1,Number(referenceMeasure.scale)||1);
  const elapsedSeconds=(performance.now()-operationStarted)/1000;
  const message=`Thickness Engine 4.0 · exact stem-width matching ${changed.length?'completed':'finished'}: ★ Key Object “${reference.name||'Unnamed'}” unchanged (${referenceMeasure.thickness.toFixed(6)} raw units). ${parts.join(', ')||'no eligible targets'}. One estimator is used for the reference and every target; the optimiser minimises |target − reference| on that single measurement and rebuilds each target with a uniform, height-preserving vector offset. Angular profiles, junction diagnostics and sibling glyphs are reported only as diagnostics; the guessed orientation prior has been removed. Offsets that change topology, collapse a counter or require an excessive affine scale are refused. Raster sampling is approximately ${(1/Math.max(1,Number(referenceMeasure.scale)||1)).toFixed(6)} units/pixel.${(supplementarySkips.length||(visualReferenceProfile?.supplementarySkipped||[]).length)?` Supplementary references skipped: ${[...supplementarySkips,...(visualReferenceProfile?.supplementarySkipped||[]).map(item=>`${item.label}: ${item.reason}`)].join('; ')}.`:''} ${(details.length?` Details: ${details.slice(0,6).join('; ')}.`:'')}`;
  status(message,partial.length||failed.length||skipped.length?'warn':changed.length||already.length?'ok':'warn');
  return{engine:'4.0',reference:referenceMeasure,referenceProfile:visualReferenceProfile,supplementaryReferences:supplementaryMeasures.map(item=>({label:item.label,thickness:item.measure.thickness,samples:item.measure.medialSamples?.length||0})),supplementarySkips,zoneReports,changed,partial,already,skipped,failed};
 }catch(error){restore(before,false);render();persistBadgeDraft();status(`Thickness matching was rolled back: ${error.message||error}. No partial changes were kept.`,'error');return{engine:'4.0',reference:referenceMeasure,zoneReports,changed,partial,already,skipped,failed,rolledBack:true};}
 finally{try{paperSession?.dispose?.();}catch(_){}}
}
// Engine 4.0 entry point: the uniform vector-offset feedback solver. All
// thickness matching goes through this single path.
async function matchSelectedVisualThicknessV2(){
 return matchSelectedVisualThicknessVector315();
}
async function matchSelectedVisualThickness(){
 return matchSelectedVisualThicknessVector315();
}

function getSmartIconAlignmentBounds(layer){
 return getIconSizeMatchBounds(layer)||getLayerWorldBounds(layer)||visualBounds(layer);
}
function classifyScalableIconRoots(iconRoots,textBounds,capHeight,textLayers=[],selectionExplicit=false){
 const accepted=[],textRecords=textLayers.map(layer=>({layer,b:getLayerWorldBounds(layer)||visualBounds(layer)})).filter(r=>r.b&&r.b.w>0&&r.b.h>0).sort((a,b)=>a.b.x-b.b.x);
 const maxIconH=Math.max(capHeight*3.2,capHeight+2);
 for(const root of iconRoots){
  if(!isLayerEffectivelyAvailable(root)||['line','text'].includes(root.type))continue;
  const b=getSmartIconAlignmentBounds(root);if(!b||!(b.w>0&&b.h>0))continue;
  // Explicit selection is the user's intent. Every selected icon root is one
  // alignment unit: a selected group remains one unit, while separately
  // selected layers/groups remain separate units. Do not reject it because
  // its current Y position is far from the text or because it overlaps text.
  if(selectionExplicit){accepted.push({layer:root,b,side:'selected',slot:null,oldGap:null,selectedUnit:true});continue;}
  // With no explicit selection, use conservative geometric discovery to avoid
  // treating large backgrounds/decorations as inline icons.
  if(b.h>maxIconH||b.w>capHeight*6||b.w*b.h>Math.max(1,textBounds.w*textBounds.h)*2.2)continue;
  let side=null,slot=null,oldGap=null;
  if(b.x+b.w<=textBounds.x+.5){side='left';oldGap=textBounds.x-(b.x+b.w);}
  else if(b.x>=textBounds.x+textBounds.w-.5){side='right';oldGap=b.x-(textBounds.x+textBounds.w);}
  else{
   // Match an icon in the horizontal gap between adjacent label layers.
   // Current vertical displacement is deliberately ignored.
   for(let i=0;i<textRecords.length-1;i++){
    const a=textRecords[i].b,z=textRecords[i+1].b,g0=a.x+a.w,g1=z.x,tol=Math.max(.25,capHeight*.08);
    if(g1-g0<Math.max(0,b.w-tol))continue;
    const center=b.x+b.w/2;
    if(center>=g0-tol&&center<=g1+tol&&b.x>=g0-tol&&b.x+b.w<=g1+tol){side='inline';slot=i;oldGap=null;break;}
   }
  }
  if(!side)continue;
  accepted.push({layer:root,b,side,slot,oldGap,selectedUnit:false});
 }
 return accepted;
}
function moveRootsWorld(roots,dx,dy){
 const originals=roots.map(layer=>({layer,x:layer.x,y:layer.y,x2:layer.x2,y2:layer.y2}));
 for(const item of originals){if(!moveLayerWorld(item.layer,dx,dy)){for(const old of originals){old.layer.x=old.x;old.layer.y=old.y;if(old.layer.type==='line'){old.layer.x2=old.x2;old.layer.y2=old.y2;}}return false;}}
 return true;
}
function resizeIconLayerToCapHeight(layer,targetHeight,pivot){
 const original=clone(layer),initial=getIconSizeMatchBounds(layer);
 if(!initial||!(initial.h>1e-7))return{success:false,reason:'no precise visible vector bounds'};
 const requested=targetHeight/initial.h;
 if(!Number.isFinite(requested)||requested<.35||requested>2.5)return{success:false,reason:'required size change is outside the safe 35–250% range'};
 const tolerance=Math.max(.005,targetHeight*.0005);
 if(Math.abs(initial.h-targetHeight)<=tolerance)return{success:true,already:true,factor:1,bounds:initial};
 let success=false,current=initial;
 for(let pass=0;pass<20;pass++){
  current=getIconSizeMatchBounds(layer);if(!current||!(current.h>1e-7))break;
  if(Math.abs(current.h-targetHeight)<=tolerance){success=true;break;}
  const factor=targetHeight/current.h;
  const sx=num(layer.scaleX,100)*factor,sy=num(layer.scaleY,100)*factor;
  if(!Number.isFinite(factor)||factor<=0||sx<.01||sx>10000||sy<.01||sy>10000)break;
  if(!scaleLayerWorldAbout(layer,factor,pivot))break;
  renderCanvas();
  const after=getIconSizeMatchBounds(layer);if(!after)break;
  // Fixed-pixel non-scaling strokes can move the measured visual centre slightly.
  // Correct that drift after every scale pass without changing the icon's anchor.
  const dx=pivot.x-(after.x+after.w/2),dy=pivot.y-(after.y+after.h/2);
  if(!Number.isFinite(dx)||!Number.isFinite(dy))break;
  if(Math.abs(dx)>.0001||Math.abs(dy)>.0001){if(!moveLayerWorld(layer,dx,dy))break;renderCanvas();}
  const verified=getIconSizeMatchBounds(layer);
  if(verified&&Math.abs(verified.h-targetHeight)<=tolerance){success=true;current=verified;break;}
 }
 const finalBounds=getIconSizeMatchBounds(layer);
 if(!success&&finalBounds&&Math.abs(finalBounds.h-targetHeight)<=tolerance)success=true;
 if(!success){restoreIconMatchLayer(layer,original);renderCanvas();return{success:false,reason:'safe scale limit or measurement tolerance reached'};}
 return{success:true,already:false,factor:requested,bounds:finalBounds};
}
function centerMixedTextAndIcon(roots,parts,matchIconSize=true,forceCommonBaseline=false,selectionExplicit=false){
 const measured=parts.textLayers.map(measureAutomaticTextBaseline);if(!measured.length||measured.some(x=>!x))return null;
 const offsets=measured.map(x=>Number(x.centerOffset??(x.cap/2))),targetCenterOffset=Math.max(...offsets);
 const maxCapTop=Math.max(...measured.map(x=>Number(x.capTop??x.cap??0))),maxCapBottom=Math.max(...measured.map(x=>Number(x.capBottom??0)));
 const targetBaselineY=forceCommonBaseline?H/2+(maxCapTop-maxCapBottom)/2:H/2+targetCenterOffset;
 const textDeltas=measured.map((x,i)=>({layer:x.layer,dy:forceCommonBaseline?targetBaselineY-x.baseline.y:(H/2+offsets[i])-x.baseline.y}));
 const textUnionBefore=unionWorldBounds(parts.textLayers);if(!textUnionBefore)return null;
 const iconEntries=classifyScalableIconRoots(parts.iconRoots,textUnionBefore,Math.max(...measured.map(x=>x.cap)),parts.textLayers,selectionExplicit);
 const iconDetected=iconEntries.length>0,iconCount=iconEntries.length,iconResults=[];
 // Each root is processed independently. A selected composite group is one
 // entry; two selected groups are two entries; separately selected icons are
 // never collapsed into one left/right collection.
 for(const entry of iconEntries){
  const layer=entry.layer,before=entry.b;
  if(!before||!(before.h>1e-7))continue;
  const pivot={x:before.x+before.w/2,y:before.y+before.h/2};
  const result={entry,layer,before,pivot,matched:false,already:false,matchSkipped:false,reason:null};
  if(matchIconSize){
   const ineligible=iconSizeMatchIneligibleReason(layer);
   if(ineligible){result.matchSkipped=true;result.reason=ineligible;}
   else{
    const sized=resizeIconLayerToCapHeight(layer,Math.max(...measured.map(x=>x.cap)),pivot);
    result.matched=!!sized.success&&!sized.already;result.already=!!sized.success&&!!sized.already;
    result.factor=sized.factor??null;result.reason=sized.reason||null;
   }
  }
  iconResults.push(result);
 }
 // Align the text first. Auto Center gives each text layer its own cap-band
 // centre; Common Baseline gives every supported text layer one writing line.
 for(const item of textDeltas)if(Math.abs(item.dy)>.004&&!moveLayerWorld(item.layer,0,item.dy))return null;
 renderCanvas();
 const textAfter=unionWorldBounds(parts.textLayers);if(!textAfter)return null;
 const capBandCenterY=targetBaselineY-(maxCapTop-maxCapBottom)/2;
 const iconMode=$('bcIconVerticalAlign')?.value==='baseline'?'baseline':'center';
 let alignedCount=0,alignmentFailures=[];
 for(const item of iconResults){
  const layer=item.layer;
  let iconAfter=getSmartIconAlignmentBounds(layer);if(!iconAfter||!(iconAfter.h>1e-7)){alignmentFailures.push(`${layer.name||layer.id}: visible bounds unavailable`);continue;}
  // Smart centre is the default for every shape, including wide logos such as
  // Dolby. Baseline behaviour is an explicit user choice, never inferred from
  // aspect ratio.
  const anchor=iconMode==='baseline'?iconAfter.y+iconAfter.h:iconAfter.y+iconAfter.h/2;
  const target=iconMode==='baseline'?targetBaselineY:capBandCenterY;
  const dy=target-anchor;
  if(Math.abs(dy)>.004&&!moveLayerWorld(layer,0,dy)){alignmentFailures.push(`${layer.name||layer.id}: could not move safely`);continue;}
  renderCanvas();iconAfter=getSmartIconAlignmentBounds(layer);if(!iconAfter){alignmentFailures.push(`${layer.name||layer.id}: final bounds unavailable`);continue;}
  // In automatic (unselected) discovery mode, preserve each external icon's
  // individual gap to the text edge. Explicitly selected items retain their X
  // centres, which is the least surprising interpretation of a direct selection.
  if(!selectionExplicit&&item.entry.side!=='inline'&&Number.isFinite(item.entry.oldGap)&&item.entry.oldGap>=-.02){
   const desiredEdge=item.entry.side==='left'?textAfter.x-item.entry.oldGap:textAfter.x+textAfter.w+item.entry.oldGap;
   const dx=item.entry.side==='left'?desiredEdge-(iconAfter.x+iconAfter.w):desiredEdge-iconAfter.x;
   if(Math.abs(dx)>.004&&!moveLayerWorld(layer,dx,0)){alignmentFailures.push(`${layer.name||layer.id}: could not preserve its text gap`);continue;}
   renderCanvas();iconAfter=getSmartIconAlignmentBounds(layer);if(!iconAfter){alignmentFailures.push(`${layer.name||layer.id}: final bounds unavailable`);continue;}
  }
  const finalAnchor=iconMode==='baseline'?iconAfter.y+iconAfter.h:iconAfter.y+iconAfter.h/2;
  if(Math.abs(finalAnchor-target)>Math.max(.01,Math.abs(target)*1e-6)){alignmentFailures.push(`${layer.name||layer.id}: alignment verification outside tolerance`);continue;}
  alignedCount++;
 }
 if(alignmentFailures.length)return null;
 const allBounds=unionWorldBounds(roots);if(!allBounds)return null;
 const dx=W/2-(allBounds.x+allBounds.w/2);if(Math.abs(dx)>.004&&!moveRootsWorld(roots,dx,0))return null;
 render();const finalBounds=unionWorldBounds(roots);
 const iconScales=iconResults.filter(r=>r.matched).map(r=>r.factor);
 const skippedDetails=iconResults.filter(r=>r.matchSkipped||r.reason).map(r=>`${r.layer.name||r.layer.id}: ${r.reason||'not resized'}`);
 return{capHeight:targetCenterOffset*2,targetBaselineY,iconScale:iconScales[0]??null,iconScales,iconCount,iconDetected,iconMatchSkipped:iconResults.some(r=>r.matchSkipped||r.reason),iconMatchedGroups:iconResults.filter(r=>r.matched).length,iconAlreadyMatched:iconResults.filter(r=>r.already).length,iconAlignedCount:alignedCount,iconAlignmentMode:iconMode,iconSkippedDetails:skippedDetails,textCount:parts.textLayers.length,finalBounds,dx,commonBaseline:forceCommonBaseline};
}
let centerArtworkRunning=false;
async function centerArtwork(forceCommonBaseline=false){
 clearInsetPreviewBeforeLayout();
 if(centerArtworkRunning)return;
 centerArtworkRunning=true;
 try{
  const selectedEntries=[...selectedIds].map(id=>findLayer(id)).filter(Boolean);
  if(selectedEntries.some(layer=>hasVisibleLockedLayer(layer))){status('Unlock the selected layers before Auto Center. The selected composition was left unchanged.','error');return;}
  const picked=selectedRoots();
  const selectionExplicit=picked.length>0;
  const roots=(selectionExplicit?picked:layers.filter(l=>l.visible!==false&&num(l.opacity,1)>0));
  if(!roots.length){status('Select some artwork first, or add an object to the artboard.','error');return;}
  if(roots.some(root=>hasVisibleLockedLayer(root))){status('Unlock the selected layers before Auto Center. Unselected locked layers are not affected.','error');return;}
  const available=roots.filter(isLayerEffectivelyAvailable);
  if(!available.length){status('The selected artwork is hidden or unavailable.','error');return;}
  const fontState=await prepareVisibleOpticalFonts();if(fontState.loaded)render();
  const parts=getCompositionParts(available,selectionExplicit);
  const textIsOneRow=areTextLayersOneHorizontalRun(parts.textLayers,parts.iconRoots);
  if(forceCommonBaseline&&!parts.textLayers.length){status('Common baseline needs editable single-line text or path/SVG label layers with saved writing-line guides. Select supported labels and try again.','warn');return;}
  if(forceCommonBaseline&&parts.unsupported.length){status('Common baseline cannot safely align multiline or text-on-path text. Simplify those text layers or select only the single-line text layers. Nothing was changed.','warn');return;}
  if(parts.unsupported.length&&!forceCommonBaseline){status('This selection contains multiline or text-on-path text. Auto Center used safe visible-artwork centering; simplify those text layers for automatic baseline matching.','warn');}
  const selectionIsText=available.length>0&&parts.textLayers.length>0&&parts.iconRoots.length===0&&parts.unsupported.length===0&&(textIsOneRow||forceCommonBaseline);
  if(selectionIsText){
   const targets=centerSelectedTextAutomatically(parts.textLayers,forceCommonBaseline);
   if(targets){
    const changes=targets.filter(t=>Math.abs(t.dx)>.004||Math.abs(t.dy)>.004);
    if(changes.length){snap();for(const t of changes)moveLayerWorld(t.layer,t.dx,t.dy);render();persistBadgeDraft();}
    const actionLabel=forceCommonBaseline?'Common baseline':'Auto Center';
    status(forceCommonBaseline?(changes.length?`Common Baseline aligned ${targets.length} text layer${targets.length===1?'':'s'} to one shared visible writing line and centered the cap band. Font size and scale were preserved.`:`Selected text ${targets.length===1?'is':'layers are'} already on one shared visible baseline and centered. Font size and scale were preserved.`):(changes.length?`Smart Auto Center optically centered ${targets.length} text layer${targets.length===1?'':'s'} using visible cap-height metrics. Font size and scale were preserved.`:`Selected text ${targets.length===1?'is':'layers are'} already optically centered. Font size and scale were preserved.`),'ok');return;
   }
   if(forceCommonBaseline){status('Common baseline could not measure every selected text layer reliably. No changes were made. Check that the text uses a supported horizontal writing line and that its font metrics are available.','warn');return;}
  }
  // Mixed selection path: snapshot first, then apply baseline + icon sizing + composition centering.
  if(parts.textLayers.length&&parts.iconRoots.length&&!parts.unsupported.length&&(textIsOneRow||forceCommonBaseline)){
   const snapshot=JSON.stringify({W,H,layers,selectedId,selectedIds:[...selectedIds],keyObjectId});
   const matchIconSize=$('bcAutoMatchIconSize')?.checked!==false;
   let result=null;
   try{result=centerMixedTextAndIcon(available,parts,matchIconSize,forceCommonBaseline,selectionExplicit);}
   catch(err){restore(snapshot);render();throw err;}
   if(result){pushHistoryEntry(captureHistoryEntry(snapshot));persistBadgeDraft();
    let iconMessage;
    if(!result.iconDetected)iconMessage='no eligible icon layer/group was detected';
    else if(!matchIconSize)iconMessage=`${result.iconCount} icon unit${result.iconCount===1?'':'s'} independently aligned in ${result.iconAlignmentMode} mode; original sizes preserved`;
    else if(result.iconMatchedGroups>0&&result.iconMatchSkipped)iconMessage=`${result.iconMatchedGroups} of ${result.iconCount} icon units matched individually; ${result.iconCount-result.iconMatchedGroups-result.iconAlreadyMatched} skipped safely`;
    else if(result.iconMatchedGroups>0)iconMessage=`${result.iconMatchedGroups} of ${result.iconCount} icon units independently matched to text cap height`;
    else if(result.iconAlreadyMatched>0)iconMessage=`${result.iconAlreadyMatched} icon units already matched; all aligned independently`;
    else iconMessage=`${result.iconCount} icon units aligned; sizes preserved for safety`;
    const actionLabel=forceCommonBaseline?'Common baseline':'Smart Auto Center';
    status(`${actionLabel}: ${result.textCount} text layer${result.textCount===1?'':'s'} ${forceCommonBaseline?'matched to one shared baseline':'optically centered'}; ${iconMessage}. Composition centered. Text size was preserved.`, 'ok');return;
   }
   // Restore any partial transforms before using the safe geometric fallback.
   restore(snapshot);
   status('Smart text-and-icon alignment could not be measured safely. No changes were kept; use ordinary Auto Center or review the selected icon size.','warn');return;
  }
  if(forceCommonBaseline&&parts.textLayers.length){status('Common baseline could not safely process this selection. Nothing was changed. Use single-line editable text layers and try again.','warn');return;}
  // Non-text artwork, unsupported text or mixed artwork without a safe icon match:
  // centre only the selected composition (or all visible artwork if nothing selected).
  const b=unionWorldBounds(available);
  if(!b||!(b.w>0||b.h>0)){status('There is no visible artwork to center.','error');return;}
  const padding=Math.max(0,Math.min(1000,num($('bcCanvasPadding')?.value,12)));
  const innerW=Math.max(0,W-padding*2),innerH=Math.max(0,H-padding*2),targetX=innerW>0?padding+innerW/2:W/2,targetY=innerH>0?padding+innerH/2:H/2;
  const dx=targetX-(b.x+b.w/2),dy=targetY-(b.y+b.h/2);
  if(Math.abs(dx)>.004||Math.abs(dy)>.004){snap();moveRootsWorld(available,dx,dy);render();persistBadgeDraft();}
  const finalB=unionWorldBounds(available)||b;
  const clearances={left:finalB.x,right:W-(finalB.x+finalB.w),top:finalB.y,bottom:H-(finalB.y+finalB.h)},padOk=Object.values(clearances).every(v=>v>=padding-.01);
  const suffix=fontState.warning?` ${fontState.warning}`:'';
  const baseMessage=parts.textLayers.length>1&&!textIsOneRow?'Text layers appear to be on separate rows, so their separate line positions were preserved. Visible composition centered geometrically.':'Visible artwork centered. Original sizes were preserved.';
  status(`${baseMessage}${padOk?` ${padding}-unit padding is preserved.`:' Padding could not be met without resizing; use Fit Artwork if desired.'}${suffix}`,padOk?'ok':'warn');
 }catch(err){status(`Auto Center could not finish: ${err.message||err}`,'error');}
 finally{centerArtworkRunning=false;}
}
function autoWidthToArtwork(){clearInsetPreviewBeforeLayout();if(!requireUnlockedVisibleArtwork('fitting the artboard width'))return;const b=getArtworkBounds();if(!b){status('There is no visible artwork to size.','error');return;}const padding=Math.max(0,Math.min(1000,num($('bcCanvasPadding')?.value,12)));const nextW=Math.max(1,Math.ceil(b.w+padding*2));if(nextW>10000){status('Artwork plus horizontal padding exceeds the 10000-unit width limit.','error');return;}snap();const hasVisible=l=>l.visible!==false&&num(l.opacity,1)>0&&(l.type!=='group'||(l.children||[]).some(hasVisible));const dx=padding-b.x;layers.filter(hasVisible).forEach(l=>shiftRootLayer(l,dx,0));W=nextW;render();fitStage();status(`Artboard width fitted to artwork · ${W} units with ${padding} units left and right padding. Height was unchanged.`,'ok');persistBadgeDraft();}
function fitCanvasToArtwork(){clearInsetPreviewBeforeLayout();if(!requireUnlockedVisibleArtwork('fitting the canvas'))return;const b=getArtworkBounds();if(!b){status('There is no visible artwork to fit.','error');return;}const padding=Math.max(0,Math.min(1000,num($('bcCanvasPadding')?.value,12)));const nextW=Math.max(1,Math.ceil(b.w+padding*2)),nextH=Math.max(1,Math.ceil(b.h+padding*2));if(nextW>10000||nextH>5000){status('Artwork plus padding exceeds canvas limits (10000 × 5000).','error');return;}const hasVisible=l=>l.visible!==false&&num(l.opacity,1)>0&&(l.type!=='group'||(l.children||[]).some(hasVisible));snap();const dx=padding-b.x,dy=padding-b.y;layers.filter(hasVisible).forEach(l=>shiftRootLayer(l,dx,dy));W=nextW;H=nextH;render();fitStage();status(`Canvas fitted to artwork · ${W} × ${H} SVG units with ${padding} units padding. Hidden root layers were left in place.`,'ok');persistBadgeDraft();}
function fitArtworkToCanvas(){
 clearInsetPreviewBeforeLayout();
 const b=getArtworkBounds();if(!b||!(b.w>0||b.h>0)){status('There is no visible artwork to fit.','error');return;}
 if(!requireUnlockedVisibleArtwork('fitting artwork'))return;
 const padding=Math.max(0,Math.min(1000,num($('bcCanvasPadding')?.value,12))),roomW=W-padding*2,roomH=H-padding*2;
 if(roomW<=0||roomH<=0){status('Padding is larger than the current artboard. Reduce padding first.','error');return;}
 const isVisible=l=>l.visible!==false&&num(l.opacity,1)>0&&(l.type!=='group'||(l.children||[]).some(isVisible));
 const roots=layers.filter(isVisible);if(!roots.length){status('There is no visible artwork to fit.','error');return;}
 // Use the same uniform scale factor in both directions: values below 1 shrink,
 // values above 1 expand. The smaller available-area ratio preserves the full artwork.
 const factor=Math.min(roomW/Math.max(.0001,b.w),roomH/Math.max(.0001,b.h));
 if(!Number.isFinite(factor)||factor<=0){status('Could not calculate a valid artwork fit scale. Check the canvas and padding values.','error');return;}
 // Layer scale values are limited to 0.01–10000%. Do not silently clamp the
 // requested fit, because that would leave the artwork incorrectly sized.
 const minFactor=Math.max(...roots.flatMap(l=>[.01/Math.max(.0001,Math.abs(num(l.scaleX,100))),.01/Math.max(.0001,Math.abs(num(l.scaleY,100)))]));
 const maxFactor=Math.min(...roots.flatMap(l=>[10000/Math.max(.0001,Math.abs(num(l.scaleX,100))),10000/Math.max(.0001,Math.abs(num(l.scaleY,100)))]));
 if(factor<minFactor-1e-10){status('Artwork is too large to fit within the supported minimum layer scale. Reduce its size or increase the artboard.','error');return;}
 if(factor>maxFactor+1e-10){status('Artwork cannot be enlarged enough because one or more layer scales would exceed the supported 10000% limit. Increase the artboard or raise the layer scale limit manually.','error');return;}
 const dx=(W-factor*b.w)/2-factor*b.x,dy=(H-factor*b.h)/2-factor*b.y;
 snap();
 for(const l of roots){
  const ox=num(l.x),oy=num(l.y),nextX=dx+factor*ox,nextY=dy+factor*oy,moveX=nextX-ox,moveY=nextY-oy;
  l.x=Number(nextX.toFixed(6));l.y=Number(nextY.toFixed(6));
  // A line stores both endpoints in its parent's coordinates. Its local endpoint
  // vector must stay unchanged: the layer transform above supplies the fit scale.
  // Move the second endpoint only by the same translation as the first.
  if(l.type==='line'){l.x2=Number((num(l.x2)+moveX).toFixed(6));l.y2=Number((num(l.y2)+moveY).toFixed(6));}
  l.scaleX=Number((num(l.scaleX,100)*factor).toFixed(6));
  l.scaleY=Number((num(l.scaleY,100)*factor).toFixed(6));
 }
 render();fitStage();persistBadgeDraft();
 const action=factor<.999999?'reduced':factor>1.000001?'enlarged':'already at the required scale';
 status(`Artwork ${action} to fit the available area (${(factor*100).toFixed(1)}%) and centered. Artboard remains ${W} × ${H}; ${padding} units of padding are preserved. X/Y scale ratios are preserved.`,'ok');
}

function reorder(id,delta){const target=findLayer(id);if(isEffectivelyLocked(target)){status('This layer cannot be reordered while it or its parent group is locked.','warn');return;}const f=findParent(id);if(!f)return;const j=f.index+delta;if(j<0||j>=f.arr.length)return;snap();[f.arr[f.index],f.arr[j]]=[f.arr[j],f.arr[f.index]];render();}
function duplicate(id){const l=findLayer(id);if(!l)return;if(isEffectivelyLocked(l)){status('This layer cannot be duplicated while it or its parent group is locked.','warn');return;}snap();const cp=clone(l),idMap=new Map();function renew(x,source){const oldId=x.id,newId=uid();idMap.set(oldId,newId);x.id=newId;if(fonts.has(oldId))fonts.set(newId,fonts.get(oldId));if(hbFonts.has(oldId))hbFonts.set(newId,hbFonts.get(oldId));x.name=(x.name||x.type)+' copy';if(x.type==='group')x.children.forEach((c,i)=>renew(c,source?.children?.[i]));}renew(cp,l);function remapRefs(x){if(x.type==='text'&&x.textPathId&&idMap.has(x.textPathId))x.textPathId=idMap.get(x.textPathId);if(x.type==='group')x.children.forEach(remapRefs);}remapRefs(cp);cp.x=num(cp.x)+6;cp.y=num(cp.y)+6;const f=findParent(id);f.arr.splice(f.index+1,0,cp);select(cp.id);status('Layer duplicated. Internal text-to-path links were remapped.','ok');}
function bounds(l){
 if(l.type==='group'){
  const bs=(l.children||[]).filter(c=>c.visible!==false&&num(c.opacity,1)>0).map(visualBounds).filter(b=>b&&[b.x,b.y,b.w,b.h].every(Number.isFinite));
  if(!bs.length)return{x:l.x,y:l.y,w:0,h:0};
  const x=Math.min(...bs.map(b=>b.x)),y=Math.min(...bs.map(b=>b.y)),right=Math.max(...bs.map(b=>b.x+b.w)),bottom=Math.max(...bs.map(b=>b.y+b.h));
  return{x:l.x+x,y:l.y+y,w:right-x,h:bottom-y};
 }
 if(l.type==='circle')return{x:l.x,y:l.y,w:l.r*2,h:l.r*2};
 if(l.type==='ellipse')return{x:l.x,y:l.y,w:l.rx*2,h:l.ry*2};
 if(l.type==='rect'||l.type==='image'||l.type==='svg')return{x:l.x,y:l.y,w:l.w,h:l.h};
 if(l.type==='line')return{x:Math.min(l.x,l.x2),y:Math.min(l.y,l.y2),w:Math.abs(l.x2-l.x),h:Math.abs(l.y2-l.y)};
 if(l.type==='text'){
  if(!l.textPathId){const wrapper=getLayerNode(l.id),textNode=wrapper?.querySelector('text');const ink=textNode&&getSvgTextInkBounds(textNode);if(ink)return{x:num(l.x)+ink.x,y:num(l.y)+ink.y,w:ink.w,h:ink.h};}
  if(l.textPathId){const target=findLayer(l.textPathId);if(target&&target.type==='path'){const pb=bounds(target),fs=num(l.fontSize,18);return{x:Math.min(l.x,pb.x),y:Math.min(l.y-fs,pb.y-fs),w:Math.max(pb.x+pb.w,l.x+5)-Math.min(l.x,pb.x),h:Math.max(pb.y+pb.h,l.y+fs)-Math.min(l.y-fs,pb.y-fs)};}}
  const lines=String(l.text||'').split(/\r?\n/),fs=num(l.fontSize,18),ls=Math.max(.5,Math.min(4,num(l.lineSpacing,1.2)));
  return{x:l.x,y:l.y-fs,w:Math.max(5,...lines.map(t=>t.length*fs*.58)),h:fs+(Math.max(0,lines.length-1)*fs*ls)+fs*.25};
 }
 if(l.type==='path'){let holder,path;try{holder=svgEl('svg',{width:1,height:1,viewBox:'0 0 1 1'});holder.style.cssText='position:absolute;left:-10000px;top:-10000px;visibility:hidden;overflow:visible';path=svgEl('path',{d:l.d||''},holder);document.body.append(holder);const b=path.getBBox();holder.remove();return{x:l.x+b.x,y:l.y+b.y,w:b.width,h:b.height};}catch(_){holder?.remove();return{x:l.x,y:l.y,w:30,h:20};}}
 return{x:l.x,y:l.y,w:num(l.w,30),h:num(l.h,20)};
}
function groupSelected(){if(pathInsetPreviewState)resetPathInsetPreview(true);
 const rawIds=[...selectedIds];
 const blocked=rawIds.map(id=>findLayer(id)).find(isEffectivelyLocked);if(blocked){status('Locked layers cannot be grouped or reorganised. Unlock the layer and its parent group first.','warn');return;}
 const ids=rawIds.filter(id=>!rawIds.some(other=>other!==id&&(()=>{const parent=findParent(id);let p=parent?.parent;while(p){if(p.id===other)return true;p=findParent(p.id)?.parent;}return false;})()));
 if(ids.length<2){status('Select at least two independent layers (Ctrl/⌘ + click).','error');return;}
 const refs=ids.map(id=>findParent(id)).filter(Boolean).sort((a,b)=>a.index-b.index);
 if(refs.some(r=>r.arr!==refs[0].arr)){status('Group layers from the same parent level.','error');return;}
 const arr=refs[0].arr,parent=refs[0].parent,referenceNode=parent?getLayerNode(parent.id):$('bcCanvasLayers');
 const items=refs.map(r=>r.arr[r.index]);
 const bs=items.map(l=>getLayerWorldBounds(l,referenceNode)||visualBounds(l)).filter(b=>b&&[b.x,b.y,b.w,b.h].every(Number.isFinite));
 if(bs.length!==items.length){status('Could not calculate reliable bounds for every selected layer.','error');return;}
 const minX=Math.min(...bs.map(b=>b.x)),minY=Math.min(...bs.map(b=>b.y)),maxX=Math.max(...bs.map(b=>b.x+b.w)),maxY=Math.max(...bs.map(b=>b.y+b.h));
 snap();refs.sort((a,b)=>b.index-a.index).forEach(r=>arr.splice(r.index,1));
 items.forEach(l=>{l.x=num(l.x)-minX;l.y=num(l.y)-minY;if(l.type==='line'){l.x2-=minX;l.y2-=minY;}});
 const g=makeLayer('group',{name:'Group',x:minX,y:minY,w:maxX-minX,h:maxY-minY,children:items});
 arr.splice(Math.min(...refs.map(r=>r.index)),0,g);if(ids.includes(keyObjectId))keyObjectId=g.id;selectedId=g.id;selectedIds=new Set([g.id]);render();status('Layers grouped using measured artwork bounds.','ok');
}
function ungroupSelected(){if(pathInsetPreviewState)resetPathInsetPreview(true);const g=current();if(!g||g.type!=='group'){status('Select a group first.','error');return;}if(isEffectivelyLocked(g)){status('This group is locked directly or by a locked parent. Unlock it before ungrouping.','warn');return;}const transformed=Math.abs(num(g.rotate))>1e-7||Math.abs(num(g.scaleX,100)-100)>1e-7||Math.abs(num(g.scaleY,100)-100)>1e-7||Math.abs(num(g.transformSkewX))>1e-7;if(transformed||num(g.opacity,1)!==1||num(g.fillOpacity,1)!==1||num(g.strokeOpacity,1)!==1||g.shadow){status('Ungroup is only lossless for groups with no rotation, scaling, opacity or shadow. Reset those group properties first; the group was left unchanged.','error');return;}snap();const f=findParent(g.id),children=g.children.map(l=>{l.x=num(l.x)+g.x;l.y=num(l.y)+g.y;if(l.type==='line'){l.x2+=g.x;l.y2+=g.y;}return l;});f.arr.splice(f.index,1,...children);if(keyObjectId===g.id)keyObjectId=children[0]?.id||null;selectedId=children[0]?.id||null;selectedIds=new Set(selectedId?[selectedId]:[]);render();status('Group released into individual layers.','ok');}
function renderList(){
 const root=$('bcLayerList');root.replaceChildren();root.setAttribute('role','list');root.setAttribute('aria-label','Badge layers');
 const addRows=(arr,depth=0)=>{[...arr].reverse().forEach(l=>{
  const locked=isEffectivelyLocked(l),row=document.createElement('div');row.className='bc-layer'+(selectedIds.has(l.id)?' selected':'')+(selectedIds.size>1&&selectedIds.has(l.id)?' multi':'')+(keyObjectId===l.id?' key-object':'');row.setAttribute('role','listitem');row.setAttribute('aria-level',String(depth+1));row.setAttribute('aria-label',`${l.name}, ${l.type}${locked?', locked':''}`);row.draggable=!locked;row.dataset.id=l.id;row.style.marginLeft=(depth*10)+'px';
  const pick=document.createElement('input');pick.type='checkbox';pick.className='bc-layer-select';pick.checked=selectedIds.has(l.id);pick.setAttribute('aria-label','Select '+l.name);pick.title='Include this layer in selection';pick.addEventListener('click',e=>e.stopPropagation());pick.addEventListener('change',e=>toggleLayerSelection(l.id,e.target.checked));
  const name=document.createElement('button');name.type='button';name.className='bc-layer-name bc-layer-name-button';name.textContent=(l.visible?'':'◌ ')+l.name;name.title=l.name;name.setAttribute('aria-pressed',String(selectedIds.has(l.id)));name.setAttribute('aria-label',`Select ${l.name}${locked?', locked':''}`);name.addEventListener('click',e=>{e.stopPropagation();select(l.id,e.ctrlKey||e.metaKey);});name.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;const buttons=[...root.querySelectorAll('.bc-layer-name-button')];const index=buttons.indexOf(name);const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(e.key==='ArrowDown'?1:-1)));buttons[next]?.focus();e.preventDefault();e.stopPropagation();});
  const keyTag=keyObjectId===l.id?document.createElement('span'):null;if(keyTag){keyTag.className='bc-key-tag';keyTag.textContent='KEY';keyTag.title='Key alignment object';}
  const typ=document.createElement('span');typ.className='bc-layer-type';typ.textContent=l.type;
  const tools=document.createElement('span');tools.className='bc-layer-actions';
  const eye=document.createElement('button');eye.className='bc-iconbtn';eye.type='button';eye.textContent=l.visible?'◉':'○';eye.title=l.visible?'Hide layer':'Show layer';eye.setAttribute('aria-label',eye.title);eye.addEventListener('click',e=>{e.stopPropagation();snap();l.visible=!l.visible;render();});
  const keyBtn=document.createElement('button');keyBtn.className='bc-iconbtn bc-layer-key';keyBtn.type='button';keyBtn.textContent=keyObjectId===l.id?'★':'☆';keyBtn.title=keyObjectId===l.id?'Current key object':'Set as key alignment object';keyBtn.setAttribute('aria-label',keyBtn.title);keyBtn.setAttribute('aria-pressed',String(keyObjectId===l.id));keyBtn.disabled=locked;keyBtn.addEventListener('click',e=>{e.stopPropagation();chooseKeyObject(l.id);});
  const up=document.createElement('button');up.className='bc-iconbtn';up.type='button';up.textContent='↑';up.title='Move up';up.setAttribute('aria-label','Move layer up');up.disabled=locked;up.addEventListener('click',e=>{e.stopPropagation();reorder(l.id,1);});
  const down=document.createElement('button');down.className='bc-iconbtn';down.type='button';down.textContent='↓';down.title='Move down';down.setAttribute('aria-label','Move layer down');down.disabled=locked;down.addEventListener('click',e=>{e.stopPropagation();reorder(l.id,-1);});
  const del=document.createElement('button');del.className='bc-iconbtn bc-delete-layer';del.type='button';del.textContent='×';del.title='Delete layer';del.setAttribute('aria-label','Delete '+l.name);del.disabled=locked;del.addEventListener('click',e=>{e.stopPropagation();deleteLayerById(l.id);});
  tools.append(eye,keyBtn,up,down,del);row.append(pick,name);if(keyTag)row.append(keyTag);row.append(typ,tools);
  row.addEventListener('click',e=>{if(e.target.closest('button,input'))return;select(l.id,e.ctrlKey||e.metaKey);});
  row.addEventListener('dragstart',e=>{if(isEffectivelyLocked(l)){e.preventDefault();return;}e.dataTransfer.setData('text/plain',l.id);row.classList.add('dragging');});row.addEventListener('dragend',()=>row.classList.remove('dragging'));row.addEventListener('dragover',e=>{const from=findLayer(e.dataTransfer?.getData('text/plain'));if(!isEffectivelyLocked(l)&&from&&!isEffectivelyLocked(from))e.preventDefault();row.classList.add('bc-drop-target');});row.addEventListener('dragleave',()=>row.classList.remove('bc-drop-target'));row.addEventListener('drop',e=>{e.preventDefault();row.classList.remove('bc-drop-target');const from=e.dataTransfer.getData('text/plain'),to=l.id;if(from===to)return;const moving=findLayer(from),targetLayer=findLayer(to);if(isEffectivelyLocked(moving)||isEffectivelyLocked(targetLayer))return;const a=findParent(from),b=findParent(to);if(!a||!b||a.arr!==b.arr)return;snap();const [item]=a.arr.splice(a.index,1);const target=findParent(to);target.arr.splice(target.index+(a.index<target.index?0:1),0,item);render();});
  root.append(row);if(l.type==='group')addRows(l.children,depth+1);
 });};addRows(layers);
 $('bcLayerCount').textContent=`${countLayers()} layers`;const remove=$('bcDeleteSelected');if(remove)remove.disabled=selectedRoots().length===0;const summary=$('bcAlignSelectionSummary');if(summary)summary.textContent=`${selectedRoots().length} selected`;const keyStatus=$('bcKeyObjectStatus');if(keyStatus)keyStatus.textContent='Key object: '+(findLayer(keyObjectId)?.name||'not set');const setKey=$('bcSetKeyObject');if(setKey)setKey.disabled=!selectedId||!selectedIds.has(selectedId)||isEffectivelyLocked(findLayer(selectedId));updateIconSizeMatchControls();updateThicknessMatchControls();renderGridAssignments();
}
function countLayers(arr=layers){return arr.reduce((n,l)=>n+1+(l.type==='group'?countLayers(l.children):0),0);}
function svgEl(tag,attrs={},parent){const e=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>{if(v!==undefined&&v!==null)e.setAttribute(k,String(v));});if(parent)parent.append(e);return e;}
function fillFor(l,defs){if(l.fillType==='linear'||l.fillType==='radial'){const id='grad_'+l.id;if(!defs.querySelector('#'+CSS.escape(id))){const alpha1=Math.max(0,Math.min(255,num(l.fillAlpha,255)))/255,alpha2=Math.max(0,Math.min(255,num(l.fill2Alpha,255)))/255;if(l.fillType==='linear'){const angle=num(l.gradientAngle),rad=angle*Math.PI/180,x1=50-50*Math.cos(rad),y1=50-50*Math.sin(rad),x2=50+50*Math.cos(rad),y2=50+50*Math.sin(rad);const g=svgEl('linearGradient',{id,x1:x1+'%',y1:y1+'%',x2:x2+'%',y2:y2+'%'},defs);svgEl('stop',{offset:'0%','stop-color':l.fill,'stop-opacity':alpha1},g);svgEl('stop',{offset:'100%','stop-color':l.fill2,'stop-opacity':alpha2},g);}else{const g=svgEl('radialGradient',{id,cx:'50%',cy:'50%',r:'70%'},defs);svgEl('stop',{offset:'0%','stop-color':l.fill,'stop-opacity':alpha1},g);svgEl('stop',{offset:'100%','stop-color':l.fill2,'stop-opacity':alpha2},g);}}return `url(#${id})`;}return l.fill||'none';}
function addSvgWrapperEffects(wrapper,layer,defs){
 wrapper.setAttribute('opacity',String(layer.opacity??1));
 if(!layer.shadow)return;const id='shadow_'+layer.id;
 if(!defs.querySelector('#'+CSS.escape(id))){const filter=svgEl('filter',{id,x:'-30%',y:'-30%',width:'160%',height:'160%'},defs);svgEl('feGaussianBlur',{in:'SourceAlpha',stdDeviation:1.2,result:'blur'},filter);svgEl('feOffset',{in:'blur',dx:0,dy:1,result:'off'},filter);svgEl('feComponentTransfer',{in:'off',result:'shadow'},filter).append(svgEl('feFuncA',{type:'linear',slope:.28}));const merge=svgEl('feMerge',{},filter);svgEl('feMergeNode',{in:'shadow'},merge);svgEl('feMergeNode',{in:'SourceGraphic'},merge);}
 wrapper.setAttribute('filter',`url(#${id})`);
}
function strokeLineJoinForLayer(layer){const value=String(layer?.linejoin||'round');if(value!=='match-thin')return ['miter','round','bevel'].includes(value)?value:'miter';const remembered=layer?.pathOffsetJoin||layer?.thinCornerJoin||pathInsetCornerJoin||pathOffsetCornerJoin||'miter';return remembered==='round'?'round':remembered==='bevel'?'bevel':'miter';}
function strokeMiterLimitForLayer(layer){if(String(layer?.linejoin||'')==='match-thin'&&strokeLineJoinForLayer(layer)==='miter')return 10;return Math.max(1,num(layer?.strokeMiterlimit,4));}
function addEffects(el,l,defs){const attrs={opacity:l.opacity??1,fill:fillFor(l,defs),stroke:l.stroke==='none'?'none':l.stroke,'stroke-width':l.strokeWidth??1,'stroke-linecap':l.linecap||'round','stroke-linejoin':strokeLineJoinForLayer(l),'stroke-miterlimit':strokeMiterLimitForLayer(l),'fill-opacity':(l.fillOpacity??1)*(['linear','radial'].includes(l.fillType)?1:(Math.max(0,Math.min(255,num(l.fillAlpha,255)))/255)),'stroke-opacity':(l.strokeOpacity??1)*(Math.max(0,Math.min(255,num(l.strokeAlpha,255)))/255),'fill-rule':l.fillRule||'nonzero'};if(l.strokeDasharray&&l.strokeDasharray!=='none')attrs['stroke-dasharray']=l.strokeDasharray;if(Math.abs(num(l.strokeDashoffset))>1e-10)attrs['stroke-dashoffset']=num(l.strokeDashoffset);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));if(l.shadow){const id='shadow_'+l.id;if(!defs.querySelector('#'+CSS.escape(id))){const f=svgEl('filter',{id,x:'-30%',y:'-30%',width:'160%',height:'160%'},defs);svgEl('feGaussianBlur',{in:'SourceAlpha',stdDeviation:1.2,result:'blur'},f);svgEl('feOffset',{in:'blur',dx:0,dy:1,result:'off'},f);svgEl('feComponentTransfer',{in:'off',result:'shadow'},f).append(svgEl('feFuncA',{type:'linear',slope:.28}));const m=svgEl('feMerge',{},f);svgEl('feMergeNode',{in:'shadow'},m);svgEl('feMergeNode',{in:'SourceGraphic'},m);}el.setAttribute('filter',`url(#${id})`);}}
function attachLayerShadow(target,l,defs){
 if(!l?.shadow)return;const id='shadow_'+l.id;
 if(!defs.querySelector('#'+CSS.escape(id))){const f=svgEl('filter',{id,x:'-30%',y:'-30%',width:'160%',height:'160%'},defs);svgEl('feGaussianBlur',{in:'SourceAlpha',stdDeviation:1.2,result:'blur'},f);svgEl('feOffset',{in:'blur',dx:0,dy:1,result:'off'},f);svgEl('feComponentTransfer',{in:'off',result:'shadow'},f).append(svgEl('feFuncA',{type:'linear',slope:.28}));const m=svgEl('feMerge',{},f);svgEl('feMergeNode',{in:'shadow'},m);svgEl('feMergeNode',{in:'SourceGraphic'},m);}
 target.setAttribute('filter',`url(#${id})`);
}
function validatePathSyntax(d){const src=String(d||'').trim();if(!src)throw Error('Path data is empty.');const tokenRe=/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g;const tokens=src.match(tokenRe)||[];const remainder=src.replace(tokenRe,'').replace(/[\s,]+/g,'');if(remainder)throw Error('Unexpected character in path data.');const arity={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7};let i=0,cmd=null,segments=0;while(i<tokens.length){if(/^[A-Za-z]$/.test(tokens[i])){cmd=tokens[i++].toUpperCase();if(cmd==='Z'){segments++;continue;}if(!arity[cmd])throw Error('Unsupported path command.');}else if(!cmd)throw Error('Path must begin with a command.');const start=i;while(i<tokens.length&&!/^[A-Za-z]$/.test(tokens[i]))i++;const count=i-start,n=arity[cmd];if(!count||count%n!==0)throw Error(`Incomplete ${cmd} command: expected groups of ${n} values.`);for(let j=start;j<i;j++)if(!Number.isFinite(Number(tokens[j])))throw Error('Path contains a non-finite number.');if(cmd==='A')for(let j=start;j<i;j+=7)if(!['0','1'].includes(tokens[j+3])||!['0','1'].includes(tokens[j+4]))throw Error('Arc flags must be 0 or 1.');segments+=count/n;if(cmd==='M')cmd='L';}if(!segments)throw Error('Path contains no drawing commands.');return segments;}
function parseEditablePath(d){
 validatePathSyntax(d);const tokens=String(d).match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)||[];
 const arity={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7};let i=0,cmd=null,x=0,y=0,sx=0,sy=0,prevC=null,prevQ=null,prevType='',out=[];
 while(i<tokens.length){if(/^[A-Za-z]$/.test(tokens[i]))cmd=tokens[i++];if(!cmd)throw Error('Path must begin with a command.');const upper=cmd.toUpperCase(),rel=cmd!==upper;
  if(upper==='Z'){out.push({cmd:'Z'});x=sx;y=sy;prevC=prevQ=null;prevType='Z';cmd=null;continue;}
  const n=arity[upper];if(!n)throw Error('Unsupported path command '+cmd+'.');const start=i;while(i<tokens.length&&!/^[A-Za-z]$/.test(tokens[i]))i++;const vals=tokens.slice(start,i).map(Number);if(!vals.length||vals.length%n)throw Error('Incomplete '+cmd+' command.');
  for(let j=0;j<vals.length;j+=n){const v=vals.slice(j,j+n),ox=x,oy=y;let seg;
   if(upper==='M'||upper==='L'){const nx=v[0]+(rel?ox:0),ny=v[1]+(rel?oy:0);seg={cmd:upper==='M'&&j===0?'M':'L',x:nx,y:ny};x=nx;y=ny;if(seg.cmd==='M'){sx=x;sy=y;}}
   else if(upper==='H'){x=v[0]+(rel?ox:0);seg={cmd:'L',x,y};}
   else if(upper==='V'){y=v[0]+(rel?oy:0);seg={cmd:'L',x,y};}
   else if(upper==='C'){seg={cmd:'C',c1:{x:v[0]+(rel?ox:0),y:v[1]+(rel?oy:0)},c2:{x:v[2]+(rel?ox:0),y:v[3]+(rel?oy:0)},x:v[4]+(rel?ox:0),y:v[5]+(rel?oy:0)};x=seg.x;y=seg.y;prevC=seg.c2;}
   else if(upper==='S'){const c1=(prevType==='C'&&prevC)?{x:2*ox-prevC.x,y:2*oy-prevC.y}:{x:ox,y:oy};seg={cmd:'C',c1,c2:{x:v[0]+(rel?ox:0),y:v[1]+(rel?oy:0)},x:v[2]+(rel?ox:0),y:v[3]+(rel?oy:0)};x=seg.x;y=seg.y;prevC=seg.c2;}
   else if(upper==='Q'){seg={cmd:'Q',c:{x:v[0]+(rel?ox:0),y:v[1]+(rel?oy:0)},x:v[2]+(rel?ox:0),y:v[3]+(rel?oy:0)};x=seg.x;y=seg.y;prevQ=seg.c;}
   else if(upper==='T'){const c=(prevType==='Q'&&prevQ)?{x:2*ox-prevQ.x,y:2*oy-prevQ.y}:{x:ox,y:oy};seg={cmd:'Q',c,x:v[0]+(rel?ox:0),y:v[1]+(rel?oy:0)};x=seg.x;y=seg.y;prevQ=seg.c;}
   else if(upper==='A'){seg={cmd:'A',rx:v[0],ry:v[1],rotation:v[2],largeArc:v[3],sweep:v[4],x:v[5]+(rel?ox:0),y:v[6]+(rel?oy:0)};x=seg.x;y=seg.y;}
   out.push(seg);if(upper!=='C'&&upper!=='S')prevC=null;if(upper!=='Q'&&upper!=='T')prevQ=null;prevType=upper;
   if(upper==='M'&&j===0)cmd=rel?'l':'L';
  }
 }
 if(!out.length||out[0].cmd!=='M')throw Error('Path must start with moveto (M or m).');return out;
}
function editablePathToString(segs){const f=n=>{const v=Math.round(Number(n)*1000)/1000;return Object.is(v,-0)?'0':String(v);};return segs.map(s=>{switch(s.cmd){case'M':case'L':return`${s.cmd} ${f(s.x)} ${f(s.y)}`;case'C':return`C ${f(s.c1.x)} ${f(s.c1.y)} ${f(s.c2.x)} ${f(s.c2.y)} ${f(s.x)} ${f(s.y)}`;case'Q':return`Q ${f(s.c.x)} ${f(s.c.y)} ${f(s.x)} ${f(s.y)}`;case'A':return`A ${f(s.rx)} ${f(s.ry)} ${f(s.rotation)} ${f(s.largeArc)} ${f(s.sweep)} ${f(s.x)} ${f(s.y)}`;case'Z':return'Z';default:throw Error('Unsupported path segment.');}}).join(' ');}
function pathHandlePoint(seg,role){if(role==='anchor')return{x:seg.x,y:seg.y};if(role==='c1')return seg.c1;if(role==='c2')return seg.c2;if(role==='c')return seg.c;return null;}
function pathStageMatrix(layer){const stage=$('bcStage'),node=[...stage.querySelectorAll('[data-layer-id]')].find(n=>n.getAttribute('data-layer-id')===layer.id);if(!node)return null;const sm=stage.getScreenCTM(),lm=node.getScreenCTM();if(!sm||!lm)return null;return sm.inverse().multiply(lm);}
function drawPathNodeEditor(layer,overlay){let segs;try{segs=parseEditablePath(layer.d||'');}catch(e){return;}
 const matrix=pathStageMatrix(layer);if(!matrix)return;const stageScale=Math.max(.02,Math.abs($('bcStage').getScreenCTM()?.a||1)),controlR=3.25/stageScale,anchorR=4.25/stageScale;const transform=pt=>{const p=$('bcStage').createSVGPoint();p.x=pt.x;p.y=pt.y;return p.matrixTransform(matrix);};const og=svgEl('g',{class:'bc-path-overlay'},overlay);let previous=null;
 segs.forEach((seg,index)=>{const end=pathHandlePoint(seg,'anchor');if(seg.cmd==='Z'){previous=null;return;}if(seg.cmd==='C'){const a=transform(previous||{x:seg.c1.x,y:seg.c1.y}),c1=transform(seg.c1),c2=transform(seg.c2),b=transform(end);svgEl('line',{x1:a.x,y1:a.y,x2:c1.x,y2:c1.y,class:'bc-path-node-line'},og);svgEl('line',{x1:b.x,y1:b.y,x2:c2.x,y2:c2.y,class:'bc-path-node-line'},og);[['c1',c1],['c2',c2]].forEach(([role,p])=>svgEl('circle',{cx:p.x,cy:p.y,r:controlR,class:'bc-path-node-handle bc-path-node-control','data-path-index':index,'data-path-role':role},og));}
 if(seg.cmd==='Q'){const a=transform(previous||seg.c),c=transform(seg.c),b=transform(end);svgEl('line',{x1:a.x,y1:a.y,x2:c.x,y2:c.y,class:'bc-path-node-line'},og);svgEl('line',{x1:b.x,y1:b.y,x2:c.x,y2:c.y,class:'bc-path-node-line'},og);svgEl('circle',{cx:c.x,cy:c.y,r:controlR,class:'bc-path-node-handle bc-path-node-control','data-path-index':index,'data-path-role':'c'},og);}
 const p=transform(end);svgEl('circle',{cx:p.x,cy:p.y,r:anchorR,class:'bc-path-node-handle bc-path-node-anchor','data-path-index':index,'data-path-role':'anchor'},og);previous=end;
 });
}

function openTypeLinePath(fontObj,text,x,y,size,letterSpacing=0){
 const glyphs=fontObj?.stringToGlyphs?.(String(text||''))||[];if(!glyphs.length)return '';
 const path=new opentype.Path(),segments=(()=>{try{return typeof Intl!=='undefined'&&Intl.Segmenter?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(String(text||''))].map(v=>v.segment):Array.from(String(text||''));}catch(_){return Array.from(String(text||''));}})();
 const split=segments.map(v=>fontObj.stringToGlyphs(v)),flat=split.flat(),mappingSafe=flat.length===glyphs.length&&flat.every((g,i)=>Number.isInteger(g.index)&&Number.isInteger(glyphs[i].index)&&g.index===glyphs[i].index);
 const clusterEnds=new Set();if(mappingSafe){let offset=0;for(const group of split){offset+=group.length;if(offset>0)clusterEnds.add(offset-1);}}
 let penX=num(x),penY=num(y);const scale=num(size,18)/Math.max(1,num(fontObj.unitsPerEm,1000)),gap=num(letterSpacing);
 for(let i=0;i<glyphs.length;i++){
  const glyph=glyphs[i],gp=glyph.getPath(penX,penY,size);if(gp?.commands)path.commands.push(...gp.commands);
  penX+=num(glyph.advanceWidth)*scale;
  if(i<glyphs.length-1){const kern=fontObj.getKerningValue?fontObj.getKerningValue(glyph,glyphs[i+1]):0;penX+=num(kern)*scale;
   const nextText=segments[i+1]||'';let combining=false;try{combining=/^\p{M}/u.test(nextText);}catch(_){}
   if(mappingSafe?clusterEnds.has(i):!combining)penX+=gap;
  }
 }
 return path.toPathData(3);
}
function fontTextPath(l){const f=fonts.get(l.id);if(!f)return null;try{return openTypeLinePath(f,l.text||'',0,0,num(l.fontSize,18),num(l.letterSpacing,0));}catch(e){return null;}}
function getLayerLocalMatrix(layer){
 const angle=num(layer?.rotate)*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle),sx=num(layer?.scaleX,100)/100,sy=num(layer?.scaleY,100)/100,shear=num(layer?.transformSkewX,0);
 return{a:cs*sx,b:sn*sx,c:cs*shear*sx-sn*sy,d:sn*shear*sx+cs*sy,e:num(layer?.x),f:num(layer?.y)};
}
function getLayerParentModelMatrix(layer){
 let ref=findParent(layer?.id);if(!ref)return{a:1,b:0,c:0,d:1,e:0,f:0};const parents=[];
 while(ref.parent){parents.unshift(ref.parent);ref=findParent(ref.parent.id);if(!ref)return null;}
 let m={a:1,b:0,c:0,d:1,e:0,f:0};for(const parent of parents)m=multiplyAffineMatrices(m,getLayerLocalMatrix(parent));return m;
}
function getLayerModelMatrix(id){
 const ref=findParent(id);if(!ref)return null;const chain=[ref.arr[ref.index]];let parent=ref.parent;
 while(parent){chain.unshift(parent);const next=findParent(parent.id);if(!next)return null;parent=next.parent;}
 let m={a:1,b:0,c:0,d:1,e:0,f:0};for(const layer of chain)m=multiplyAffineMatrices(m,getLayerLocalMatrix(layer));return m;
}
function setLayerWorldMatrix(layer,worldMatrix){
 if(!layer||!worldMatrix)return false;const parent=getLayerParentModelMatrix(layer),inverse=invertAffineMatrix(parent);if(!inverse)return false;
 const local=multiplyAffineMatrices(inverse,worldMatrix),sx=Math.hypot(local.a,local.b);if(!Number.isFinite(sx)||sx<1e-8)return false;
 const det=local.a*local.d-local.b*local.c,sy=det/sx;if(!Number.isFinite(sy)||Math.abs(sy)<1e-8)return false;
 const shear=(local.a*local.c+local.b*local.d)/(sx*sx),rotation=Math.atan2(local.b,local.a)*180/Math.PI;
 if(![local.e,local.f,rotation,sx,sy,shear].every(Number.isFinite))return false;
 layer.x=local.e;layer.y=local.f;layer.rotate=rotation;layer.scaleX=Math.max(.01,Math.min(10000,sx*100));layer.scaleY=Math.max(.01,Math.min(10000,sy*100));layer.transformSkewX=shear;return true;
}

function renderTextLayer(l,parent,defs,exportOptions={}){
 const lines=String(l.text||'').split(/\r?\n/),size=num(l.fontSize,18),leading=Math.max(.5,Math.min(4,num(l.lineSpacing,1.2)))*size,baseline=l.baseline||'alphabetic';
 const hb=l.harfBuzz?hbFonts.get(l.id):null,parsed=fonts.get(l.id);
 if(l.textPathId){
  if(exportOptions.textMode==='paths'&&String(l.text||'').trim())throw Error(`Text-on-path layer “${l.name||l.id}” cannot yet be exported as outlined paths. Switch to Editable text or detach the text from its path.`);
  const target=findLayer(l.textPathId);if(target&&target.type==='path'){
   const pathId='textpath_'+String(l.id).replace(/[^a-z0-9_-]/gi,'_');let ref=defs.querySelector('#'+CSS.escape(pathId));
   if(!ref){
    const textMatrix=getLayerModelMatrix(l.id),pathMatrix=getLayerModelMatrix(target.id),inverseText=invertAffineMatrix(textMatrix),relative=inverseText&&pathMatrix?multiplyAffineMatrices(inverseText,pathMatrix):null;
    if(relative){const matrix=`matrix(${relative.a} ${relative.b} ${relative.c} ${relative.d} ${relative.e} ${relative.f})`;ref=svgEl('path',{id:pathId,d:target.d||'',transform:matrix},defs);}
   }
   if(ref){const spacingValue=`${num(l.letterSpacing,0)}px`;const text=svgEl('text',{x:0,y:0,'font-family':l.fontFamily||'Roboto,Arial,sans-serif','font-size':size,'font-weight':l.fontWeight||400,'letter-spacing':spacingValue,'text-anchor':l.anchor||'start',style:`letter-spacing:${spacingValue}`},parent);
    const tp=svgEl('textPath',{href:'#'+pathId,startOffset:`${Math.max(0,Math.min(100,num(l.textPathOffset,0)))}%`},text);tp.textContent=String(l.text||'').replace(/\r?\n/g,' ');return text;}
  }
 }
 if(hb&&exportOptions.textMode!=='editable'){
  const root=svgEl('g',{},parent),scale=size/hb.face.upem;
  lines.forEach((line,index)=>{const lineGroup=svgEl('g',{transform:`translate(0 ${index*leading}) scale(${scale} ${-scale})`},root);const buf=new hbModule.Buffer();buf.addText(line);if(l.hbScript)buf.setScript(l.hbScript);if(l.hbLanguage)buf.setLanguage(l.hbLanguage);buf.guessSegmentProperties();if(l.hbDirection&&hbModule.Direction){const dir=hbModule.Direction[l.hbDirection.toUpperCase()];if(dir!==undefined)buf.setDirection(dir);}if(l.hbAxisValues){const ax=Object.values(hb.face.getAxisInfos?.()||{});if(ax.length)hb.font.setVariations(ax.map(v=>new hbModule.Variation(v.tag,Number(l.hbAxisValues[v.tag]??v.default))));}hbModule.shape(hb.font,buf);let infos=[],positions=[];if(buf.getGlyphInfosAndPositions){const pairs=buf.getGlyphInfosAndPositions();infos=pairs.map(x=>({codepoint:x.codepoint,cluster:x.cluster}));positions=pairs;}else{infos=buf.getGlyphInfos();positions=buf.getGlyphPositions();}const hSign=positions.find(v=>Math.abs(num(v.xAdvance))>.000001)?.xAdvance<0?-1:1,gapUnits=num(l.letterSpacing)*hb.face.upem/Math.max(1,size);let px=0,py=0;for(let i=0;i<infos.length;i++){const inf=infos[i],pos=positions[i]||{},gp=hb.font.glyphToPath(inf.codepoint);if(gp){const gg=svgEl('g',{transform:`translate(${px+num(pos.xOffset)} ${py+num(pos.yOffset)})`},lineGroup);svgEl('path',{d:gp},gg);}px+=num(pos.xAdvance);py+=num(pos.yAdvance);const next=infos[i+1],sameCluster=next&&inf.cluster!==undefined&&next.cluster!==undefined&&inf.cluster===next.cluster;if(next&&!sameCluster&&Math.abs(num(pos.xAdvance))>.000001)px+=hSign*gapUnits;}});
  return root;
 }
 if(exportOptions.textMode==='paths'&&!parsed&&String(l.text||'').trim())throw Error(`Text layer “${l.name||l.id}” has no loaded embedded font. Load a TTF, OTF or WOFF font before exporting vector paths.`);
 if(exportOptions.textMode!=='editable'&&(l.pathMode||exportOptions.textMode==='paths')&&parsed){const root=svgEl('g',{},parent);lines.forEach((line,index)=>{let d='';try{d=openTypeLinePath(parsed,line,0,index*leading,size,num(l.letterSpacing,0));}catch(_){}if(d)svgEl('path',{d},root);});return root;}
 const spacingValue=`${num(l.letterSpacing,0)}px`;
 const text=svgEl('text',{x:0,y:0,'font-family':l.fontFamily||'Roboto,Arial,sans-serif','font-size':size,'font-weight':l.fontWeight||400,'letter-spacing':spacingValue,'dominant-baseline':baseline,'text-anchor':l.anchor||'start',style:`letter-spacing:${spacingValue}`},parent);
 lines.forEach((line,index)=>{const t=svgEl('tspan',{x:0,dy:index===0?0:leading},text);t.textContent=line;});return text;
}
function appendLayerTypographyMetadata(target,meta){if(!target||!meta)return;let md=[...target.children].find(n=>n.localName==='metadata'&&n.getAttribute('data-gsp-kind')==='typography');if(!md)md=svgEl('metadata',{'data-gsp-kind':'typography'},target);md.textContent=JSON.stringify(meta);}
function groupStrokeStyle(layer){if(!layer||String(layer.stroke||'none').toLowerCase()==='none'||!(num(layer.strokeWidth,1)>0))return null;return{stroke:layer.stroke,strokeAlpha:layer.strokeAlpha??255,strokeOpacity:layer.strokeOpacity??1,strokeWidth:layer.strokeWidth??1,linecap:layer.linecap||'round',linejoin:layer.linejoin||'round',strokeMiterlimit:layer.strokeMiterlimit??4,strokeDasharray:layer.strokeDasharray||'',strokeDashoffset:layer.strokeDashoffset||0};}
function withInheritedGroupStroke(layer,stroke){if(!stroke||String(layer?.stroke||'none').toLowerCase()!=='none')return layer;return{...layer,...stroke};}
function renderNode(l,parent,defs,exportOptions={},inheritedGroupStroke=null){if(!l.visible)return;const localMatrix=getLayerLocalMatrix(l),wrapAttrs={'data-layer-id':l.id};if(Math.abs(localMatrix.e)>1e-10||Math.abs(localMatrix.f)>1e-10||Math.abs(localMatrix.a-1)>1e-10||Math.abs(localMatrix.b)>1e-10||Math.abs(localMatrix.c)>1e-10||Math.abs(localMatrix.d-1)>1e-10)wrapAttrs.transform=`matrix(${localMatrix.a} ${localMatrix.b} ${localMatrix.c} ${localMatrix.d} ${localMatrix.e} ${localMatrix.f})`;const g=svgEl('g',wrapAttrs,parent);if(l.locked)g.setAttribute('data-locked','1');
 if(l.type==='group'){
  const ownGroupStroke=groupStrokeStyle(l),effectiveGroupStroke=ownGroupStroke||inheritedGroupStroke,paintGroup=withInheritedGroupStroke(l,inheritedGroupStroke);
  addEffects(g,paintGroup,defs);l.children.forEach(c=>renderNode(c,g,defs,exportOptions,effectiveGroupStroke));if(Math.abs(num(l.thicknessMatchRadius))>1e-8)attachVisualThicknessFilter(g,l,defs,false);if(l.typography)appendLayerTypographyMetadata(g,l.typography);return g;
 }
 const paintLayer=withInheritedGroupStroke(l,inheritedGroupStroke);if(inheritedGroupStroke&&l.type==='svg'&&String(l.stroke||'none').toLowerCase()==='none')addEffects(g,{...l,...inheritedGroupStroke,fill:'none',fillType:'solid',fillAlpha:255,fillOpacity:0,shadow:false},defs);
 let el;
 if(l.type==='circle'){el=svgEl('circle',{cx:l.r,cy:l.r,r:l.r},g);}
 else if(l.type==='ellipse'){el=svgEl('ellipse',{cx:l.rx,cy:l.ry,rx:l.rx,ry:l.ry},g);}
 else if(l.type==='rect'){el=svgEl('rect',{x:0,y:0,width:l.w,height:l.h,rx:l.rx||0,ry:l.rx||0},g);}
 else if(l.type==='line'){el=svgEl('line',{x1:0,y1:0,x2:num(l.x2)-num(l.x),y2:num(l.y2)-num(l.y)},g);}
 else if(l.type==='path'){const preview=getPathInsetPreviewForLayer(l.id),d=preview?.d||pathRoundPreviewById.get(l.id)||l.d||'',openIndices=preview?.openIndices?.length?preview.openIndices:(l.thinOpenSubpaths||[]);el=svgEl('path',{d},g);if(openIndices.length){const fillLayer={...l,opacity:1,stroke:'none',shadow:false};addEffects(el,fillLayer,defs);if(paintLayer.stroke!=='none'&&num(paintLayer.strokeWidth,1)>0){const strokeD=pathDataWithoutImplicitClose(d,openIndices),strokeEl=svgEl('path',{d:strokeD,'data-gsp-thin-stroke-overlay':'1'},g);const strokeLayer={...paintLayer,opacity:1,fill:'none',fillType:'solid',fillAlpha:255,fillOpacity:0,shadow:false};addEffects(strokeEl,strokeLayer,defs);}g.setAttribute('opacity',String(l.opacity??1));if(l.shadow)attachLayerShadow(g,l,defs);el.dataset.gspThinSplitPaint='1';} }
 else if(l.type==='text'){el=renderTextLayer(l,g,defs,exportOptions);}
 else if(l.type==='image'){el=svgEl('image',{x:0,y:0,width:l.w,height:l.h,href:l.href,'preserveAspectRatio':l.preserveAspectRatio||'xMidYMid meet'},g);}
 else if(l.type==='svg'){el=svgEl('svg',{x:0,y:0,width:l.w,height:l.h,viewBox:`${num(l.viewX)} ${num(l.viewY)} ${l.viewW||l.w} ${l.viewH||l.h}`,'preserveAspectRatio':l.preserveAspectRatio||'xMidYMid meet'},g);const doc=new DOMParser().parseFromString(`<svg xmlns="${NS}">${l.markup||''}</svg>`,'image/svg+xml');if(!doc.querySelector('parsererror'))[...doc.documentElement.childNodes].forEach(n=>{if(n.nodeType===1||n.nodeType===8)el.append(document.importNode(n,true));});if(l.rootAttrs)Object.entries(l.rootAttrs).forEach(([k,v])=>el.setAttribute(k,String(v)));if(l.typography)appendLayerTypographyMetadata(el,l.typography);}
 if(el){if(l.type==='svg'){addSvgWrapperEffects(g,l,defs);applySvgLayerOverrides(el,l);}else if(!(l.type==='path'&&el.dataset.gspThinSplitPaint==='1'))addEffects(el,paintLayer,defs);}if(Math.abs(num(l.thicknessMatchRadius))>1e-8)attachVisualThicknessFilter(g,l,defs,l.type!=='svg'&&l.type!=='group');if(l.typography&&l.type!=='svg')appendLayerTypographyMetadata(g,l.typography);return g;}
function selectedRoots(){
 const selected=selectedIds,rootMap=new Map();
 const visit=(items,selectedAncestor=false,lockedAncestor=false)=>{
  for(const layer of items||[]){
   const ownSelected=selected.has(layer.id),locked=lockedAncestor||!!layer.locked;
   if(ownSelected&&!selectedAncestor&&!locked)rootMap.set(layer.id,layer);
   if(layer.type==='group')visit(layer.children||[],selectedAncestor||ownSelected,locked);
  }
 };
 visit(layers,false,false);
 // Preserve the user's selection order; it is meaningful to alignment and spacing tools.
 return [...selected].map(id=>rootMap.get(id)).filter(Boolean);
}
function visualBounds(l){const b=bounds(l),sx=num(l.scaleX,100)/100,sy=num(l.scaleY,100)/100,a=num(l.rotate)*Math.PI/180,c=Math.cos(a),sn=Math.sin(a),pts=[[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]].map(([x,y])=>{const xx=(x-l.x)*sx,yy=(y-l.y)*sy;return{x:l.x+xx*c-yy*sn,y:l.y+xx*sn+yy*c};});const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
function selectionBox(){const chosen=selectedRoots();if(!chosen.length)return null;const bs=chosen.map(l=>getLayerWorldBounds(l)||visualBounds(l)).filter(Boolean);if(!bs.length)return null;const x=Math.min(...bs.map(b=>b.x)),y=Math.min(...bs.map(b=>b.y)),right=Math.max(...bs.map(b=>b.x+b.w)),bottom=Math.max(...bs.map(b=>b.y+b.h));return{x,y,w:right-x,h:bottom-y,chosen};}
function drawBadgeCenterGuides(group,screenScale){
 if(!$('bcShowCenterGuides')?.checked)return;
 const x=W/2,y=H/2;
 svgEl('line',{x1:x,y1:0,x2:x,y2:H,stroke:'#2489dc','stroke-width':1/screenScale,'stroke-dasharray':`${4/screenScale} ${3/screenScale}`,'pointer-events':'none','data-gsp-guide':'center-x'},group);
 svgEl('line',{x1:0,y1:y,x2:W,y2:y,stroke:'#30a46c','stroke-width':1/screenScale,'stroke-dasharray':`${4/screenScale} ${3/screenScale}`,'pointer-events':'none','data-gsp-guide':'center-y'},group);
}
function drawBadgeTypographyGuides(group,screenScale){
 if(!$('bcShowTypographyGuides')?.checked)return;
 const layer=current();if(!layer||!layer.visible)return;const outer=getLayerNode(layer.id);if(!outer)return;let node=null,meta=null;
 if(layer.typography){node=typographyNodeForLayer(layer,outer);meta=layer.typography;}
 else if(layer.type==='text'&&!layer.textPathId){node=outer.querySelector('text');const size=num(layer.fontSize,16),family=layer.fontFamily||'Arial,sans-serif',weight=layer.fontWeight||400;let cap=0,xh=0;try{const c=document.createElement('canvas').getContext('2d');c.font=`${weight} ${size}px ${family}`;cap=c.measureText('H').actualBoundingBoxAscent||size*.7;xh=c.measureText('x').actualBoundingBoxAscent||size*.52;}catch(_){cap=size*.7;xh=size*.52;}const baselineX=num(node?.getAttribute('x'),0),baselineY=num(node?.getAttribute('y'),0);meta={baselineX,baselineY,capY:baselineY-cap,xHeightY:baselineY-xh};}
 if(!node||!meta)return;const m=getCanvasRelativeMatrix(node);if(!m)return;
 const lines=[['baselineY','#e09a35','baseline'],['capY','#a47be2','cap-height'],['xHeightY','#44b7ae','x-height']];
 let range={x0:-10,x1:Math.max(10,num(layer.w,100))};
 if(layer.type==='svg')range={x0:num(layer.viewX)-1,x1:num(layer.viewX)+num(layer.viewW,layer.w)+1};
 else if(layer.type==='path'||layer.type==='group'){try{const b=node.getBBox();range={x0:b.x-1,x1:b.x+b.width+1};}catch(_){}}
 for(const [key,color,label] of lines){if(meta[key]===undefined||meta[key]===null||!Number.isFinite(Number(meta[key])))continue;const y=Number(meta[key]),a=transformPoint2D(range.x0,y,m),b=transformPoint2D(range.x1,y,m);svgEl('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:color,'stroke-width':1/screenScale,'stroke-dasharray':`${5/screenScale} ${3/screenScale}`,'pointer-events':'none','data-gsp-guide':label},group);}
 if(meta.referenceGlyphBounds){const b=meta.referenceGlyphBounds,pts=[[b.x1,b.y1],[b.x2,b.y1],[b.x2,b.y2],[b.x1,b.y2]].map(([x,y])=>transformPoint2D(x,y,m)),d=pts.map((v,i)=>(i?'L':'M')+v.x+' '+v.y).join(' ')+' Z';svgEl('path',{d,fill:'none',stroke:'#f4c15d','stroke-width':1/screenScale,'stroke-dasharray':`${2/screenScale} ${2/screenScale}`,'pointer-events':'none','data-gsp-guide':'reference-glyph'},group);const cx=(Number(b.x1)+Number(b.x2))/2,y0=range.x0,y1=range.x1;const a=transformPoint2D(cx,y0,m),z=transformPoint2D(cx,y1,m);svgEl('line',{x1:a.x,y1:a.y,x2:z.x,y2:z.y,stroke:'#f4c15d','stroke-width':1/screenScale,'stroke-dasharray':`${3/screenScale} ${3/screenScale}`,'pointer-events':'none','data-gsp-guide':'reference-center'},group);}
 if(meta.inkCentroid&&Number.isFinite(Number(meta.inkCentroid.x))&&Number.isFinite(Number(meta.inkCentroid.y))){const p=transformPoint2D(Number(meta.inkCentroid.x),Number(meta.inkCentroid.y),m);svgEl('circle',{cx:p.x,cy:p.y,r:2.2/screenScale,fill:'#ef6aa8',stroke:'#fff','stroke-width':1/screenScale,'pointer-events':'none','data-gsp-guide':'ink-centroid'},group);}
}
function renderCanvas(){const stage=$('bcStage');if(svgjs){try{const wrapped=svgjs.SVG(stage);wrapped.size(W,H).viewbox(0,0,W,H);}catch(_){}}stage.setAttribute('viewBox',`0 0 ${W} ${H}`);stage.setAttribute('width',W);stage.setAttribute('height',H);stage.style.width=`${Math.max(1,W*zoom/100)}px`;stage.style.height=`${Math.max(1,H*zoom/100)}px`;const defs=$('bcDefs'),content=$('bcCanvasLayers');defs.replaceChildren();content.replaceChildren();const gridSize=Math.max(2,Math.min(200,Math.round(num($('bcGridSize')?.value,10))));if(gridOn){const minor=svgEl('pattern',{id:'bcGridPattern',width:gridSize,height:gridSize,patternUnits:'userSpaceOnUse'},defs);svgEl('path',{d:`M ${gridSize} 0 L 0 0 0 ${gridSize}`,fill:'none',stroke:'#71849c','stroke-opacity':.58,'stroke-width':.45},minor);const majorStep=gridSize*5,major=svgEl('pattern',{id:'bcGridMajorPattern',width:majorStep,height:majorStep,patternUnits:'userSpaceOnUse'},defs);svgEl('path',{d:`M ${majorStep} 0 L 0 0 0 ${majorStep}`,fill:'none',stroke:'#536b87','stroke-opacity':.78,'stroke-width':.8},major);svgEl('rect',{width:W,height:H,fill:'url(#bcGridPattern)','pointer-events':'none'},content);svgEl('rect',{width:W,height:H,fill:'url(#bcGridMajorPattern)','pointer-events':'none'},content);}layers.forEach(l=>renderNode(l,content,defs));const sel=$('bcSelection');sel.replaceChildren();const screenScale=Math.max(.02,Math.abs(stage.getScreenCTM()?.a||1)),handleR=4.25/screenScale,rotateR=4.5/screenScale,geometry=svgEl('g',{'data-gsp-selection-geometry':'1'},sel),centerGuides=svgEl('g',{'data-gsp-center-guides':'1'},sel),typographyGuides=svgEl('g',{'data-gsp-typography-guides':'1'},sel);drawBadgeCenterGuides(centerGuides,screenScale);if(!pathEditId){const box=selectionBox();if(box){const{x,y,w,h}=box;svgEl('rect',{x,y,width:Math.max(.5,w),height:Math.max(.5,h),class:'bc-selected-outline'},geometry);if(box.chosen.length===1){const pts={nw:[x,y],n:[x+w/2,y],ne:[x+w,y],e:[x+w,y+h/2],se:[x+w,y+h],s:[x+w/2,y+h],sw:[x,y+h],w:[x,y+h/2]};Object.entries(pts).forEach(([key,p])=>svgEl('circle',{cx:p[0],cy:p[1],r:handleR,class:'bc-transform-handle','data-transform-handle':key},geometry));}else{[['nw',x,y],['ne',x+w,y],['se',x+w,y+h],['sw',x,y+h]].forEach(([key,cx,cy])=>svgEl('circle',{cx,cy,r:handleR,class:'bc-transform-handle','data-transform-handle':key},geometry));}const cx=x+w/2,rotateY=y-9/screenScale;svgEl('line',{x1:cx,y1:y,x2:cx,y2:rotateY+rotateR*.6,class:'bc-transform-line'},geometry);svgEl('circle',{cx,cy:rotateY,r:rotateR,class:'bc-transform-handle','data-transform-handle':'rotate'},geometry);}}drawBadgeTypographyGuides(typographyGuides,screenScale);if(pathEditId){const active=findLayer(pathEditId);if(active&&active.type==='path'&&active.visible)drawPathNodeEditor(active,sel);else pathEditId=null;}$('bcDimensions').textContent=`${W} × ${H}`;if($('bcDimensionsFoot'))$('bcDimensionsFoot').textContent=`${W} × ${H} viewBox`;$('bcCanvasW').value=W;$('bcCanvasH').value=H;$('bcZoomVal').textContent=(Math.round(zoom*10)/10)+'%';}
// Build O(n) references once at pointerdown. This avoids repeatedly searching the whole
// layer tree and SVG DOM for every selected object on every pointermove.
function buildLayerDragContext(){
 const identity={a:1,b:0,c:0,d:1,e:0,f:0},nodeMap=new Map(),parentMatrices=new Map();
 const stage=$('bcCanvasLayers');
 if(stage)for(const node of stage.querySelectorAll('[data-layer-id]'))nodeMap.set(node.getAttribute('data-layer-id'),node);
 const visit=(items,parentWorld)=>{
  for(const layer of items||[]){
   parentMatrices.set(layer.id,parentWorld);
   if(layer.type==='group')visit(layer.children||[],multiplyAffineMatrices(parentWorld,getLayerLocalMatrix(layer)));
  }
 };
 visit(layers,identity);
 return{nodeMap,parentMatrices};
}
function restoreLayerDragOriginFast(layer,origin,dx,dy){
 if(!layer||!origin)return false;
 const m=origin.parentMatrix||{a:1,b:0,c:0,d:1,e:0,f:0},det=m.a*m.d-m.b*m.c;
 if(!Number.isFinite(det)||Math.abs(det)<1e-10)return false;
 const localX=(m.d*dx-m.c*dy)/det,localY=(-m.b*dx+m.a*dy)/det;
 if(!Number.isFinite(localX)||!Number.isFinite(localY))return false;
 layer.x=num(origin.x)+localX;layer.y=num(origin.y)+localY;
 if(layer.type==='line'){layer.x2=num(origin.x2)+localX;layer.y2=num(origin.y2)+localY;}
 return true;
}
// Translation-only drag renderer: the editable model is still updated from the original
// pointerdown coordinates and cached parent matrix. The already-rendered SVG tree is reused.
// Only selected root wrappers and movable overlays receive updated transforms; a full render
// follows pointerup to refresh exact bounds, handles, guides, and all dependent UI.
function syncLayerWrapperTransform(layer,node){
 if(!node||!layer)return false;
 const m=getLayerLocalMatrix(layer);if(!m)return false;
 const isIdentity=Math.abs(m.e)<=1e-10&&Math.abs(m.f)<=1e-10&&Math.abs(m.a-1)<=1e-10&&Math.abs(m.b)<=1e-10&&Math.abs(m.c)<=1e-10&&Math.abs(m.d-1)<=1e-10;
 if(isIdentity)node.removeAttribute('transform');
 else node.setAttribute('transform',`matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
 return true;
}
function applyFastTranslationDragFrame(state){
 const pending=state?.pendingTranslation;if(!pending)return;
 let complete=true;
 for(const origin of state.origins||[]){const layer=origin.layer||findLayer(origin.id);if(!layer||!syncLayerWrapperTransform(layer,origin.node)){complete=false;break;}}
 const selectionGeometry=$('bcSelection')?.querySelector('[data-gsp-selection-geometry]');
 const typographyGuides=$('bcSelection')?.querySelector('[data-gsp-typography-guides]');
 if(!selectionGeometry)complete=false;
 if(!complete){renderCanvas();return;}
 const transform=`translate(${pending.dx} ${pending.dy})`;
 selectionGeometry.setAttribute('transform',transform);
 if(typographyGuides)typographyGuides.setAttribute('transform',transform);
 state.lastRenderedTranslation={dx:pending.dx,dy:pending.dy};
}
function queueFastTranslationDragFrame(state,dx,dy){
 state.pendingTranslation={dx,dy};
 if(state.framePending)return;
 state.framePending=true;
 state.frameId=requestAnimationFrame(()=>{
  state.framePending=false;
  if(drag!==state)return;
  applyFastTranslationDragFrame(state);
 });
}
function flushFastTranslationDragFrame(state){
 if(!state)return;
 if(state.frameId)cancelAnimationFrame(state.frameId);
 state.framePending=false;
 if(state.pendingTranslation)applyFastTranslationDragFrame(state);
}

const CDN_SRI={'https://cdn.jsdelivr.net/npm/paper@0.17.0/dist/paper-core.min.js':'sha384-gEmegBKRT6L+DIqjFe+6tIxhQ7JBbgggu3FMFb3mCDohcT6VmOXNW41bs+JB/Tv/','https://unpkg.com/paper@0.17.0/dist/paper-core.min.js':'sha384-gEmegBKRT6L+DIqjFe+6tIxhQ7JBbgggu3FMFb3mCDohcT6VmOXNW41bs+JB/Tv/','https://cdn.jsdelivr.net/npm/opentype.js@2.0.0/dist/opentype.min.js':'sha384-rZipYyCodoDMAXvm3BS6DXnn3CAyORo9RZ+7OSlLIj1y1YP4KeMFwgKVkO+9W3nB','https://unpkg.com/opentype.js@2.0.0/dist/opentype.min.js':'sha384-rZipYyCodoDMAXvm3BS6DXnn3CAyORo9RZ+7OSlLIj1y1YP4KeMFwgKVkO+9W3nB'};
let paperPromise=null;
function loadExternalClassicScript(src,timeoutMs=7000){return new Promise((resolve,reject)=>{const script=document.createElement('script');let settled=false;const finish=err=>{if(settled)return;settled=true;clearTimeout(timer);if(err){script.remove();reject(err);}else resolve(script);};const host=(()=>{try{return new URL(src,document.baseURI).hostname;}catch(_){return 'external host';}})();const timer=setTimeout(()=>finish(Error(`Loading ${host} timed out. Check your internet connection and try again.`)),timeoutMs);script.async=true;const sri=CDN_SRI[src];if(sri){script.integrity=sri;script.crossOrigin='anonymous';}script.onload=()=>finish();script.onerror=()=>finish(Error(`Could not load script from ${host}.`));script.src=src;document.head.append(script);});}
async function ensurePaper(){if(window.paper)return window.paper;if(!paperPromise)paperPromise=(async()=>{let last;for(const src of ['js/vendor/paper-core.min.js','https://cdn.jsdelivr.net/npm/paper@0.17.0/dist/paper-core.min.js','https://unpkg.com/paper@0.17.0/dist/paper-core.min.js']){try{await loadExternalClassicScript(src,6500);if(!window.paper)throw Error('Paper.js loaded without its API');return window.paper;}catch(e){last=e;}}throw last||Error('Paper.js unavailable');})();try{return await paperPromise;}catch(e){paperPromise=null;throw e;}}
async function applyBooleanOperation(operation){
 if(pathInsetPreviewState)resetPathInsetPreview(true);
 let project=null;const picked=selectedRoots();if(picked.length!==2||picked.some(l=>l.type!=='path')||picked.some(l=>!layers.includes(l))){status('Select exactly two top-level path layers for a Boolean operation.','error');return;}
 try{const P=await ensurePaper(),canvas=document.createElement('canvas');canvas.width=Math.max(1,W);canvas.height=Math.max(1,H);project=P.setup(canvas);project.activate();
  const makePath=l=>{const item=new P.Path({pathData:l.d||''});item.applyMatrix=true;const m=getLayerLocalMatrix(l);item.transform(new P.Matrix(m.a,m.b,m.c,m.d,m.e,m.f));item.fillColor='#000';return item;};
  const a=makePath(picked[0]),b=makePath(picked[1]);let result;
  if(operation==='unite')result=a.unite(b,{insert:false});else if(operation==='subtract')result=a.subtract(b,{insert:false});else if(operation==='intersect')result=a.intersect(b,{insert:false});else if(operation==='exclude')result=a.exclude(b,{insert:false});else throw Error('Unknown Boolean operation');
  const d=result?.pathData;if(!d||!d.trim())throw Error('The operation produced an empty result. Check that the paths overlap.');
  const before=captureHistoryEntry();pushHistoryEntry(before);
  const idx=Math.min(...picked.map(l=>layers.indexOf(l)));layers=layers.filter(l=>!picked.includes(l));const base=picked[0];const out={...clone(base),id:uid(),name:`${operation[0].toUpperCase()+operation.slice(1)} result`,type:'path',d,x:0,y:0,x2:0,y2:0,rotate:0,scaleX:100,scaleY:100,transformSkewX:0,generatedShape:undefined,shapeSides:undefined,shapeRadius:undefined,shapeInnerRadius:undefined,thinSourceD:undefined,thinAmount:undefined,thinCornerJoin:undefined};layers.splice(Math.max(0,idx),0,out);selectedId=out.id;selectedIds=new Set([out.id]);pathEditId=null;project.remove();project=null;render();persistBadgeDraft();status(`Boolean ${operation} completed. Original paths were replaced by the result.`,'ok');
 }catch(e){status(`Boolean operation failed: ${e.message}`,'error');}finally{project?.remove();}
}
document.querySelectorAll('[data-boolean]').forEach(btn=>btn.addEventListener('click',()=>applyBooleanOperation(btn.dataset.boolean)));

async function bakeSelectedPathTransform(){if(pathInsetPreviewState)resetPathInsetPreview(true);let project=null;const picked=selectedRoots();if(picked.length!==1||picked[0].type!=='path'||!layers.includes(picked[0])){status('Select one top-level path to bake its transform.','error');return;}const l=picked[0];try{const P=await ensurePaper(),canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;project=P.setup(canvas);project.activate();const item=new P.Path({pathData:l.d||''});item.applyMatrix=true;const m=getLayerLocalMatrix(l);item.transform(new P.Matrix(m.a,m.b,m.c,m.d,m.e,m.f));const d=item.pathData;if(!d)throw Error('Transform produced an empty path.');parseEditablePath(d);snap();clearStoredThinning(l);l.d=d;l.x=0;l.y=0;l.rotate=0;l.scaleX=100;l.scaleY=100;l.transformSkewX=0;project.remove();project=null;render();persistBadgeDraft();status('Transform baked into path geometry.','ok');}catch(e){status('Could not bake transform: '+e.message,'error');}finally{project?.remove();}}
function splitEditableSubpaths(segments){
 const groups=[];let current=null;
 for(const seg of segments){
  if(seg.cmd==='M'){if(current)groups.push(current);current=[seg];}
  else if(current)current.push(seg);
 }
 if(current)groups.push(current);return groups;
}
function reverseEditableSubpath(group){
 const start=group[0],closed=group.at(-1)?.cmd==='Z',body=group.slice(1,closed?-1:undefined);
 if(!body.length)return [...group];
 const endpoint=s=>({x:s.x,y:s.y});
 const previousAt=i=>i===0?{x:start.x,y:start.y}:endpoint(body[i-1]);
 const firstPoint=closed?endpoint(body.at(-1)):endpoint(body.at(-1));
 const out=[{cmd:'M',x:firstPoint.x,y:firstPoint.y}];
 for(let i=body.length-1;i>=0;i--){
  const seg=body[i],prev=previousAt(i);
  if(seg.cmd==='L')out.push({cmd:'L',x:prev.x,y:prev.y});
  else if(seg.cmd==='C')out.push({cmd:'C',c1:{...seg.c2},c2:{...seg.c1},x:prev.x,y:prev.y});
  else if(seg.cmd==='Q')out.push({cmd:'Q',c:{...seg.c},x:prev.x,y:prev.y});
  else if(seg.cmd==='A')out.push({cmd:'A',rx:seg.rx,ry:seg.ry,rotation:seg.rotation,largeArc:seg.largeArc,sweep:seg.sweep?0:1,x:prev.x,y:prev.y});
  else throw Error('This path command cannot be reversed safely.');
 }
 if(closed)out.push({cmd:'Z'});
 return out;
}
function reverseEditablePathData(d){
 const groups=splitEditableSubpaths(parseEditablePath(d));
 if(!groups.length)throw Error('The selected path has no subpaths.');
 return editablePathToString(groups.flatMap(reverseEditableSubpath));
}
function toggleEditablePathClosed(d){
 const groups=splitEditableSubpaths(parseEditablePath(d));let changed=false;
 const out=groups.flatMap(group=>{
  if(group.length<2)return group;
  changed=true;
  if(group.at(-1)?.cmd==='Z')return group.slice(0,-1);
  return [...group,{cmd:'Z'}];
 });
 if(!changed)throw Error('The selected path needs at least one drawable segment.');
 return editablePathToString(out);
}
async function applyPathRefinement(operation){
 if(pathInsetPreviewState)resetPathInsetPreview(true);
 const picked=selectedRoots();if(picked.length!==1||picked[0].type!=='path'||!layers.includes(picked[0])){status('Select exactly one top-level path layer.','error');return;}
 const layer=picked[0];let project=null;
 // Direction and close/open are deterministic path-data operations and should
 // remain available offline; they do not need to load a geometry engine.
 if(operation==='reverse'||operation==='toggle-close'){
  try{const d=operation==='reverse'?reverseEditablePathData(layer.d||''):toggleEditablePathClosed(layer.d||'');validatePathSyntax(d);snap();clearStoredThinning(layer);layer.d=d;render();persistBadgeDraft();status(operation==='reverse'?'Path direction reversed.':`Subpath closure toggled.`, 'ok');}
  catch(e){status(`Path ${operation} failed: ${e.message}`,'error');}return;
 }
 try{const P=await ensurePaper(),canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;project=P.setup(canvas);project.activate();const item=new P.Path({pathData:layer.d||''});if(!item.segments.length)throw Error('The selected path is empty.');
  if(operation==='simplify'){const tolerance=Math.max(.1,Math.min(20,num($('bcPathTolerance')?.value,1)));item.simplify(tolerance);}
  else if(operation==='cleanup'){item.flatten(.25);item.simplify(.1);}
  else throw Error('Unknown path refinement.');
  const d=item.pathData;if(!d||!d.trim())throw Error('The operation produced an empty path.');parseEditablePath(d);snap();clearStoredThinning(layer);layer.d=d;project.remove();project=null;render();persistBadgeDraft();status(`Path ${operation} completed.`,'ok');
 }catch(e){status(`Path refinement failed: ${e.message}`,'error');}finally{project?.remove();}
}
document.querySelectorAll('[data-path-refine]').forEach(btn=>btn.addEventListener('click',()=>applyPathRefinement(btn.dataset.pathRefine)));
// True vector inset/offset using Paper.js PathItem.offset().
// CompoundPath is intentional: Path(pathData) ignores later moveto subpaths,
// which would destroy counters such as the hole inside the A glyph.
function thinSourcePathData(layer){if(typeof layer?.pathOffsetSourceD==='string'&&layer.pathOffsetSourceD.trim())return layer.pathOffsetSourceD;return typeof layer?.thinSourceD==='string'&&layer.thinSourceD.trim()?layer.thinSourceD:(layer?.d||'');}
function clearStoredThinning(layer){if(!layer||layer.type!=='path')return;delete layer.pathOffsetSourceD;delete layer.pathOffsetAmount;delete layer.pathOffsetJoin;delete layer.pathOffsetOpenSubpaths;delete layer.thinSourceD;delete layer.thinAmount;delete layer.thinCornerJoin;delete layer.thinOpenSubpaths;}
function storedThinSummary(roots=selectedRoots()){
 const targets=collectOffsetTargetsForRoots(roots).targets;
 if(!targets.length)return{targets,hasAny:false,isExpanded:false,mixed:false,amount:0,signedAmount:0,join:pathInsetCornerJoin};
 // Positive stored values mean inward thinning; negative values mean outward thickening.
 // Always show the absolute magnitude in the shared amount control.
 // Older project records can contain null/empty current fields while still
 // carrying the legacy thinAmount. Do not let Number(null) silently mask that
 // legacy value; normalize every stored amount to a finite signed number.
 const signed=targets.map(layer=>{
  const current=layer.pathOffsetAmount;
  if(current!==null&&current!==undefined&&String(current).trim()!==''&&Number.isFinite(Number(current)))return Number(current);
  const legacy=layer.thinAmount;
  return legacy!==null&&legacy!==undefined&&String(legacy).trim()!==''&&Number.isFinite(Number(legacy))?Number(legacy):0;
 });
 const amounts=signed.map(v=>Math.abs(v));
 const joins=targets.map(layer=>['miter','bevel','round'].includes(layer.pathOffsetJoin)?layer.pathOffsetJoin:(['miter','bevel','round'].includes(layer.thinCornerJoin)?layer.thinCornerJoin:'miter'));
 const mixed=amounts.some(v=>Math.abs(v-amounts[0])>1e-7)||joins.some(v=>v!==joins[0])||signed.some(v=>Math.sign(v)!==Math.sign(signed[0]));
 const hasAny=targets.some((layer,i)=>typeof thinSourcePathData(layer)==='string'&&thinSourcePathData(layer).trim().length>0&&Math.abs(signed[i])>1e-7);
 return{targets,hasAny,isExpanded:!mixed&&signed[0]<-1e-7,mixed,amount:mixed?null:amounts[0],signedAmount:mixed?null:signed[0],join:joins.every(v=>v===joins[0])?joins[0]:pathInsetCornerJoin};
}
function collectOffsetPathTargets(root){
 const targets=[],skipped=[];
 const walk=layer=>{
  if(!layer||layer.visible===false||num(layer.opacity,1)<=0)return;
  if(layer.locked){skipped.push(layer);return;}
  if(layer.type==='path'){try{prepareFilledPathForOffset(thinSourcePathData(layer),layer.fill!=='none'&&num(layer.fillOpacity,1)>0);targets.push(layer);}catch(_){skipped.push(layer);}return;}
  if(layer.type==='group'){(layer.children||[]).forEach(walk);return;}
  skipped.push(layer);
 };
 walk(root);return{targets,skipped};
}
function editablePathToStringPrecise(segs,digits=10){
 const f=value=>{
  const n=Number(value);if(!Number.isFinite(n))throw Error('Path contains a non-finite coordinate.');
  let out=n.toFixed(digits);if(out.includes('.'))out=out.replace(/0+$/,'').replace(/\.$/,'');
  return out==='-0'?'0':out;
 };
 return segs.map(seg=>{
  switch(seg.cmd){
   case'M':case'L':return`${seg.cmd} ${f(seg.x)} ${f(seg.y)}`;
   case'C':return`C ${f(seg.c1.x)} ${f(seg.c1.y)} ${f(seg.c2.x)} ${f(seg.c2.y)} ${f(seg.x)} ${f(seg.y)}`;
   case'Q':return`Q ${f(seg.c.x)} ${f(seg.c.y)} ${f(seg.x)} ${f(seg.y)}`;
   case'A':return`A ${f(seg.rx)} ${f(seg.ry)} ${f(seg.rotation)} ${f(seg.largeArc)} ${f(seg.sweep)} ${f(seg.x)} ${f(seg.y)}`;
   case'Z':return'Z';
   default:throw Error('Unsupported path segment.');
  }
 }).join(' ');
}
function prepareFilledPathForOffset(d,allowImplicitClose=true){
 const subpaths=splitEditableSubpaths(parseEditablePath(d));
 if(!subpaths.length)throw Error('The selected path contains no drawable contours.');
 const normalized=[],openIndices=[];
 subpaths.forEach((part,index)=>{
  const drawable=part.filter(seg=>seg.cmd!=='M'&&seg.cmd!=='Z');
  if(drawable.length<2)throw Error('A contour has too few points to form a filled area.');
  const isClosed=part.at(-1)?.cmd==='Z';
  if(!isClosed){
   if(!allowImplicitClose)throw Error('This path has an open contour but no fill. Only filled open SVG subpaths can be implicitly closed for thinning.');
   openIndices.push(index);normalized.push([...part,{cmd:'Z'}]);
  }else normalized.push(part);
 });
 return{d:editablePathToStringPrecise(normalized.flat(),10),count:subpaths.length,openIndices};
}
function validateClosedOffsetPath(d){return prepareFilledPathForOffset(d,true).count;}
function paperFilledArea(item){
 try{const area=Number(item?.area);return Number.isFinite(area)?Math.abs(area):null;}catch(_){return null;}
}
function paperContourIntersectionCount(item){
 try{
  const children=Array.from(item?.children||[]);if(children.length<2)return 0;
  let count=0;
  for(let i=0;i<children.length;i++)for(let j=i+1;j<children.length;j++){
   if(typeof children[i]?.getIntersections!=='function')return null;
   const hits=children[i].getIntersections(children[j]);
   count+=Array.isArray(hits)?hits.length:0;
  }
  return count;
 }catch(_){return null;}
}
function paperPathDataPrecise(item,precision=8){
 if(!item)return '';
 const digits=Math.max(6,Math.min(12,Math.round(Number(precision)||8)));
 if(typeof item.getPathData==='function'){
  try{return String(item.getPathData(null,digits)||'');}catch(_){}
 }
 return String(item.pathData||'');
}
async function offsetPathBatch(entries,distance,join='miter',options={}){
 if(!Number.isFinite(distance)||Math.abs(distance)<1e-12)throw Error('Choose a non-zero offset amount.');
 const paperSession=options?.paperSession||null,preparedEntries=entries.map(entry=>({...entry,prepared:paperSession?paperSession.getPrepared(entry):prepareFilledPathForOffset(entry.d,entry.allowImplicitClose!==false)}));
 const P=paperSession?paperSession.P:await ensurePaper();let scope=null,project=null,previousProject=null,canvas=null,Engine=P;const ownsPaperSession=!paperSession;
 try{
  if(paperSession){scope=paperSession.scope;project=paperSession.project;Engine=paperSession.Engine;}
  else{canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;if(typeof P.PaperScope==='function'){scope=new P.PaperScope();project=scope.setup(canvas)||scope.project;Engine=scope;}else{previousProject=P.project||null;project=P.setup(canvas)||P.project;Engine=P;}}
  if(!project||typeof Engine.CompoundPath!=='function')throw Error('Paper.js compound-path support is unavailable.');
  const result=new Map();
  for(const entry of preparedEntries){
   let shape=null,offset=null;
   try{
    // Fill semantics implicitly close open SVG subpaths. Normalize only the geometry copy
    // sent to Paper.js; the imported/source path data is never rewritten by this step.
    const sourceContourCount=entry.prepared.count;
    shape=paperSession?paperSession.cloneShape(entry):new Engine.CompoundPath(entry.prepared.d);
    if(!shape||shape.isEmpty?.(true))throw Error('The source path is empty.');
    shape.fillRule=entry.fillRule==='evenodd'?'evenodd':'nonzero';
    if(typeof shape.offset!=='function')throw Error('Paper.js PathItem.offset() is not available.');
    let inverseWorld=null;
    if(entry.worldMatrix){
     const m=entry.worldMatrix,det=m.a*m.d-m.b*m.c;if(!Number.isFinite(det)||Math.abs(det)<1e-10)throw Error('The target has a singular world transform.');
     inverseWorld={a:m.d/det,b:-m.b/det,c:-m.c/det,d:m.a/det,e:(m.c*m.f-m.d*m.e)/det,f:(m.b*m.e-m.a*m.f)/det};
     shape.transform(new Engine.Matrix(m.a,m.b,m.c,m.d,m.e,m.f));
    }
    const cachedMeta=paperSession?paperSession.getOffsetMetadata(entry):null,before=cachedMeta?.bounds||shape.bounds,beforeArea=cachedMeta?cachedMeta.area:(entry.fillRule==='evenodd'?null:paperFilledArea(shape)),beforeContacts=cachedMeta?cachedMeta.contacts:paperContourIntersectionCount(shape);
    offset=shape.offset(distance,{join,miterLimit:Math.max(1,Number(options?.miterLimit)||10),insert:false});
    if(!offset)throw Error('The vector offset engine returned no geometry.');
    // Match the standalone matcher's useful "keep glyph height/width" behavior:
    // compensate the expanded/reduced outline back to the source bounds, per axis,
    // but only when that dimension is large enough relative to the stroke width.
    // Rotated/sheared layers skip this world-axis compensation to avoid
    // distorting their local axes. The feedback loop re-measures the compensated
    // result, so final stroke width is solved from the rendered candidate.
    if(options?.keepGlyphBounds){
     const m=entry.worldMatrix;
     const axisAlignedWorld=!m||(Math.abs(Number(m.b)||0)<1e-8&&Math.abs(Number(m.c)||0)<1e-8);
     const expanded=offset.bounds;
     const usableBounds=b=>!!b&&[b.x,b.y,b.width,b.height,b.center?.x,b.center?.y].every(Number.isFinite)&&b.width>1e-6&&b.height>1e-6;
     if(!usableBounds(before))
      throw Error('The source glyph has invalid or zero-area bounds; no vector offset was attempted.');
     if(!usableBounds(expanded))
      throw Error('The requested offset collapsed to empty or zero-extent geometry before glyph-bounds compensation.');
     const referenceWidth=Math.max(1e-6,Number(options.sourceThickness)||0,Number(options.targetThickness)||0);
     const threshold=Math.max(1,Number(options.minAxisRatio)||3);
     // Engine 4.0 — uniform height-preserving scale only. Per-axis scaling made
     // the delivered stroke depend on glyph aspect ratio and broke monotonicity.
     const keep=axisAlignedWorld&&before.height/referenceWidth>=threshold;
     const s=keep?before.height/expanded.height:1;
     if(!Number.isFinite(s)||s<.55||s>1.8)
      throw Error('Glyph-bounds compensation would require an excessive affine scale.');
     if(keep){
      const tx=before.center.x-s*expanded.center.x,ty=before.center.y-s*expanded.center.y;
      offset.transform(new Engine.Matrix(s,0,0,s,tx,ty));
     }
    }
    const worldNext=paperPathDataPrecise(offset,8).trim();
    if(!worldNext)throw Error('The offset collapsed this contour. Try a smaller amount.');
    const resultContourCount=validateClosedOffsetPath(worldNext);
    if(resultContourCount!==sourceContourCount)throw Error('This amount would split or collapse a contour or counter. A smaller thinning amount is safer.');
    // A valid inset must remain closed, non-empty, and smaller. Do not accept
    // geometry that merely serializes successfully after a counter collapses.
    const after=offset.bounds,afterArea=entry.fillRule==='evenodd'?null:paperFilledArea(offset),afterContacts=paperContourIntersectionCount(offset);
    if(offset.closed===false)throw Error('The offset created an open contour. A smaller amount is safer.');
    if(!before||!after||!(after.width>1e-5&&after.height>1e-5))throw Error('The offset produced empty geometry.');
    // Engine 4.0: height is the dimension restored by the uniform scale, so it
    // is the only bound that must not grow (inset) or shrink (outset). Width may
    // legitimately change for wide/short glyphs when height is restored: checking
    // it here rejected valid offsets on the '0' glyph. Area monotonicity and the
    // topology/contour guards below still catch real collapsed geometry.
    if(distance<0&&after.height>before.height+0.02)throw Error('The inset increased the restored glyph height; the original path was kept.');
    if(distance>0&&after.height<before.height-0.02)throw Error('The offset reduced the restored glyph height; the original path was kept.');
    if(distance<0&&beforeArea!==null&&afterArea!==null&&beforeArea>1e-6&&afterArea>1e-7&&afterArea>=beforeArea-Math.max(1e-9,beforeArea*1e-9))throw Error('The inset did not reduce the filled area cleanly. A smaller amount is safer.');
    if(distance>0&&beforeArea!==null&&afterArea!==null&&beforeArea>1e-6&&afterArea>1e-7&&afterArea<=beforeArea+Math.max(1e-9,beforeArea*1e-9))throw Error('The outward offset did not increase the filled area cleanly.');
    if(beforeContacts!==null&&afterContacts!==null&&afterContacts>beforeContacts)throw Error('The offset made separate contours intersect. A smaller amount is safer.');
    if(inverseWorld)offset.transform(new Engine.Matrix(inverseWorld.a,inverseWorld.b,inverseWorld.c,inverseWorld.d,inverseWorld.e,inverseWorld.f));
    const next=paperPathDataPrecise(offset,8).trim();if(!next)throw Error('The inverse transform produced empty path geometry.');
    // Ensure the local-space output remains parseable before it can be committed.
    parseEditablePath(next);
    result.set(entry.id,next);
   }finally{try{offset?.remove?.();}catch(_){}try{shape?.remove?.();}catch(_){}}
  }
  return result;
 }finally{
  if(ownsPaperSession){try{if(scope&&typeof scope.remove==='function')scope.remove();else if(project?.remove)project.remove();}catch(_){}
   try{if(previousProject&&previousProject!==project&&typeof previousProject.activate==='function')previousProject.activate();}catch(_){}
   if(canvas?.parentNode)canvas.remove();}
 }
}
function insetSelectionKey(roots=selectedRoots()){
 return (roots||[]).map(root=>root?.id).filter(Boolean).sort().join('|');
}
function pathInsetDraftIsCurrent(state){
 if(!state?.byId||!state.sourceById)return false;
 for(const [id,source] of state.sourceById){
  const layer=findLayer(id);if(!layer||thinSourcePathData(layer)!==source)return false;
  if(state.fillRuleById&&String(layer.fillRule||'nonzero')!==String(state.fillRuleById.get(id)||'nonzero'))return false;
 }
 return true;
}
function getPathInsetPreviewForLayer(id){
 for(const state of pathInsetPreviewDrafts.values()){
  if(!state?.byId?.has(id))continue;
  if(!pathInsetDraftIsCurrent(state)){pathInsetPreviewDrafts.delete(state.key);continue;}
  return{d:state.byId.get(id),openIndices:state.openById?.get(id)||[],state};
 }
 return null;
}
function activatePathInsetDraftForSelection(){
 const roots=selectedRoots(),key=insetSelectionKey(roots),state=pathInsetPreviewDrafts.get(key);
 if(state&&!pathInsetDraftIsCurrent(state))pathInsetPreviewDrafts.delete(key);
 pathInsetPreviewState=state&&pathInsetDraftIsCurrent(state)?state:null;
 const pending=pathInsetPreviewTimers.has(key);
 pathInsetPreviewPendingRootId=pending?key:null;
 const summary=storedThinSummary(roots);
 pathInsetCornerJoin=pathInsetPreviewState?.join||summary.join||'miter';
 pathOffsetCornerJoin=pathInsetCornerJoin;
 pathThicknessDirection=pathInsetPreviewState?.direction||(summary.hasAny?(summary.isExpanded?'out':'in'):pathThicknessDirection);
}
function cancelPathInsetDraftTimer(key){
 const timer=pathInsetPreviewTimers.get(key);if(timer){clearTimeout(timer);pathInsetPreviewTimers.delete(key);}
 pathInsetPreviewTasks.set(key,(pathInsetPreviewTasks.get(key)||0)+1);
 if(pathInsetPreviewPendingRootId===key)pathInsetPreviewPendingRootId=null;
}
function clearAllPathInsetDrafts(){
 for(const [key,timer] of pathInsetPreviewTimers)clearTimeout(timer);
 pathInsetPreviewTimers.clear();pathInsetPreviewTasks.clear();pathInsetPreviewDrafts.clear();
 pathInsetPreviewState=null;pathInsetPreviewPendingRootId=null;pathInsetPreviewTimer=null;pathInsetPreviewTask++;
}
function pathDataWithoutImplicitClose(d,openIndices=[]){
 if(!openIndices?.length)return d;
 const selected=new Set(openIndices),groups=splitEditableSubpaths(parseEditablePath(d));
 return editablePathToString(groups.flatMap((part,index)=>selected.has(index)&&part.at(-1)?.cmd==='Z'?part.slice(0,-1):part));
}
function resetPathInsetPreview(quiet=false,preserveDirection=false){
 const key=insetSelectionKey();cancelPathInsetDraftTimer(key);pathInsetPreviewDrafts.delete(key);
 pathInsetPreviewState=null;pathInsetPreviewTask++;
 const range=$('bcPathInsetRange'),value=$('bcPathInsetAmount'),output=$('bcPathInsetValue'),state=$('bcPathInsetState');
 const summary=storedThinSummary();
 if(!preserveDirection&&summary.hasAny)pathThicknessDirection=summary.isExpanded?'out':'in';
 const direction=pathThicknessDirection,shown=summary.mixed?null:(summary.amount??0),shownText=shown==null?'':shown.toFixed(6);
 if(range){const sliderMax=pathThicknessSliderMax(shown??0);range.max=String(sliderMax);range.step=String(pathThicknessSliderStep(sliderMax));range.value=String(Math.min(sliderMax,shown??0));range.setAttribute('aria-label',direction==='in'?'Preview smart path thinning':'Preview smart path thickening');}
 if(value){value.removeAttribute('max');value.value=shownText;value.setAttribute('aria-label',direction==='in'?'Path thickness (thinning)':'Path thickness (thickening)');}
 if(output)output.textContent=summary.mixed?'Mixed':(shown??0).toFixed(6);
 document.querySelectorAll('.bc-appearance-thin-modes button').forEach(button=>{const active=button.dataset.direction===direction;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
 const panelLabel=document.querySelector('.bc-appearance-thin-head label');if(panelLabel)panelLabel.textContent=summary.hasAny?(summary.isExpanded?'Applied thickening':'Applied thinning'):(direction==='out'?'Thicken path':'Thin path');
 renderCanvas();
 if(state)state.textContent=summary.hasAny?'Preview cleared. The committed path thickness remains applied and editable.':'Preview cleared. The original path geometry is unchanged.';
 if(!quiet&&pathInsetPreviewDrafts.size===0)status('Path thickness preview cleared. The committed geometry was kept.','ok');
}

function collectOffsetTargetsForRoots(roots){
 const targets=[],skipped=[],seen=new Set();
 for(const root of roots){
  if(!root||!['path','group'].includes(root.type)){skipped.push(root);continue;}
  const found=collectOffsetPathTargets(root);
  for(const layer of found.targets)if(!seen.has(layer.id)){seen.add(layer.id);targets.push(layer);}
  skipped.push(...found.skipped);
 }
 return{targets,skipped};
}
function sameInsetSelection(state,roots){
 if(!state)return false;
 const a=(state.rootIds||[state.rootId]).filter(Boolean).slice().sort();
 const b=roots.map(root=>root.id).slice().sort();
 return a.length===b.length&&a.every((id,i)=>id===b[i]);
}
function pathInsetEntriesSignature(entries,join){
 let hash=2166136261;
 const source=String(join)+'|'+entries.map(v=>`${v.id}\u0000${v.fillRule||'nonzero'}\u0000${v.d||''}`).join('\u0001');
 for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return `${join}:${(hash>>>0).toString(16)}:${entries.length}`;
}
async function findLargestSafePathOffset(entries,requestedAmount,join,direction){
 const requested=Number(requestedAmount),sign=direction==='in'?-1:1;
 if(!Number.isFinite(requested)||requested<=0)return 0;
 const test=amount=>offsetPathBatch(entries,sign*amount,join);
 const isEngineFailure=err=>/Paper\.js|PaperScope|CompoundPath support|PathItem\.offset\(\).*not available|CDN|timed out|engine unavailable|could not load script/i.test(String(err?.message||err));
 const refine=async(low,high)=>{
  for(let i=0;i<40;i++){
   const mid=low+(high-low)/2;
   if(!(mid>low&&mid<high))break;
   try{await test(mid);}catch(err){if(isEngineFailure(err))throw err;high=mid;continue;}
   low=mid;
   const tolerance=Math.max(1e-8,Math.abs(high)*1e-9);
   if(high-low<=tolerance)break;
  }
  const safe=low>0?Math.max(0,low-Math.max(1e-9,low*1e-9)):0;
  return safe>=1e-8?safe:0;
 };
 // Start with a tiny geometric probe. If even that fails, inspect only this
 // small interval; otherwise grow by decades until the requested amount is
 // safe or the first unsafe boundary is bracketed. The search has no fixed
 // SVG-unit ceiling and is bounded only by finite JavaScript number precision.
 const first=Math.min(requested,0.0001);
 let low=0,high=null;
 try{await test(first);low=first;}catch(err){if(isEngineFailure(err))throw err;high=first;return refine(0,high);}
 if(low>=requested)return requested;
 for(let i=0;i<324&&low<requested;i++){
  const multiplied=low*10,candidate=Math.min(requested,Number.isFinite(multiplied)?multiplied:requested);
  if(!(candidate>low))break;
  try{await test(candidate);low=candidate;if(low>=requested)return requested;}
  catch(err){if(isEngineFailure(err))throw err;high=candidate;return refine(low,high);}
 }
 if(low>=requested)return requested;
 throw new Error('The requested amount is beyond the vector engine’s reliable numeric range. Try a smaller amount; no artwork was changed.');
}
async function findMaxSafeInset(entries,upperBound,join){
 const safe=await findLargestSafePathOffset(entries,upperBound,join,'in');
 if(safe>0){const signature=pathInsetEntriesSignature(entries,join);pathInsetSafeLimitState={signature,join,max:safe};}
 return safe;
}
async function resolveSafeInset(entries,requestedAmount,join){
 const signature=pathInsetEntriesSignature(entries,join);let amount=Number(requestedAmount);
 if(!Number.isFinite(amount)||amount<=0)throw Error('Choose a positive thinning amount or set it to 0 to restore the source contour.');
 await ensurePaper();
 const cached=pathInsetSafeLimitState,hasCached=!!cached&&cached.signature===signature&&cached.join===join;let limited=false;
 if(hasCached&&amount>cached.max){amount=cached.max;limited=true;}
 try{const byId=await offsetPathBatch(entries,-amount,join);return{amount,byId,signature,maxSafe:hasCached?cached.max:null,limited};}
 catch(firstError){const safe=await findMaxSafeInset(entries,amount,join);if(!(safe>0))throw new Error(`No safe inset could be found without collapsing a contour or counter. ${firstError.message||firstError}`);pathInsetSafeLimitState={signature,join,max:safe};const byId=await offsetPathBatch(entries,-safe,join);return{amount:safe,byId,signature,maxSafe:safe,limited:true,reason:firstError.message||String(firstError)};}
}
async function findMaxSafeExpansion(entries,upperBound,join){
 return findLargestSafePathOffset(entries,upperBound,join,'out');
}
async function resolveSafeExpansion(entries,requestedAmount,join){
 const signature=pathInsetEntriesSignature(entries,join);let amount=Number(requestedAmount);
 if(!Number.isFinite(amount)||amount<=0)throw Error('Choose a positive thickening amount or set it to 0 to restore the source contour.');
 await ensurePaper();
 const cached=pathExpansionSafeLimitState,hasCached=!!cached&&cached.signature===signature&&cached.join===join;let limited=false;
 if(hasCached&&amount>cached.max){amount=cached.max;limited=true;}
 try{const byId=await offsetPathBatch(entries,amount,join);return{amount,byId,signature,maxSafe:hasCached?cached.max:null,limited};}
 catch(firstError){const safe=await findMaxSafeExpansion(entries,amount,join);if(!(safe>0))throw new Error(`No safe expansion could be found without collapsing or intersecting a counter/contour. ${firstError.message||firstError}`);pathExpansionSafeLimitState={signature,join,max:safe};const byId=await offsetPathBatch(entries,safe,join);return{amount:safe,byId,signature,maxSafe:safe,limited:true,reason:firstError.message||String(firstError)};}
}
function syncPathInsetControls(amount,max=null,forceValue=false,direction=pathThicknessDirection,sliderMax=null){
 const range=$('bcPathInsetRange'),value=$('bcPathInsetAmount'),output=$('bcPathInsetValue');
 const raw=Number(amount),n=Number.isFinite(raw)?Math.max(0,raw):0;
 const safe=Number(max),hasSafe=max!==null&&max!==undefined&&Number.isFinite(safe)&&safe>=0;
 const shown=hasSafe?Math.min(n,safe):n;
 const rangeCap=Math.max(pathThicknessSliderMax(shown),Number(sliderMax)||0,Number(range?.max)||0);
 if(range){range.max=String(rangeCap);range.step=String(pathThicknessSliderStep(rangeCap));range.value=String(Math.min(rangeCap,shown));}
 if(value){value.removeAttribute('max');if(forceValue||document.activeElement!==value)value.value=shown.toFixed(6);}
 if(output)output.textContent=shown.toFixed(6);
 return shown;
}
async function previewPathInset(value,rootsOverride=null,keyOverride=null,taskOverride=null,joinOverride=null,directionOverride=null){
 const picked=rootsOverride||selectedRoots(),key=keyOverride||insetSelectionKey(picked),isActive=key===insetSelectionKey();
 const direction=directionOverride==='out'?'out':'in',join=joinOverride||pathInsetCornerJoin;
 const range=isActive?$('bcPathInsetRange'):null,numeric=isActive?$('bcPathInsetAmount'):null,output=isActive?$('bcPathInsetValue'):null,stateEl=isActive?$('bcPathInsetState'):null;
 const task=taskOverride??((pathInsetPreviewTasks.get(key)||0)+1);pathInsetPreviewTasks.set(key,task);
 const requested=Number(value);
 if(!Number.isFinite(requested)||requested<0){if(isActive&&stateEl)stateEl.textContent='Enter a finite non-negative amount. No geometry was changed.';return;}
 let amount=requested;
 if(amount<=0){
  const roots=picked.filter(root=>['path','group'].includes(root.type)),found=collectOffsetTargetsForRoots(picked);
  const hasStored=found.targets.some(layer=>(typeof layer.pathOffsetSourceD==='string'&&layer.pathOffsetSourceD.trim())||(typeof layer.thinSourceD==='string'&&layer.thinSourceD.trim()));
  if(hasStored){
   const entries=found.targets.map(layer=>({id:layer.id,d:thinSourcePathData(layer),fillRule:layer.fillRule||'nonzero'}));
   const byId=new Map(entries.map(entry=>[entry.id,entry.d]));
   const prepared=new Map(entries.map(entry=>[entry.id,prepareFilledPathForOffset(entry.d,found.targets.find(layer=>layer.id===entry.id)?.fill!=='none') ]));
   const draft={key,rootId:roots[0]?.id,rootIds:picked.map(root=>root.id),amount:0,direction,join,signature:pathInsetEntriesSignature(entries,join),byId,sourceIds:entries.map(x=>x.id),sourceById:new Map(entries.map(x=>[x.id,x.d])),fillRuleById:new Map(entries.map(x=>[x.id,x.fillRule||'nonzero'])),openById:new Map([...prepared].map(([id,v])=>[id,v.openIndices])),maxSafe:0};
   pathInsetPreviewDrafts.set(key,draft);if(isActive)pathInsetPreviewState=draft;
  }else{pathInsetPreviewDrafts.delete(key);if(isActive)pathInsetPreviewState=null;}
  if(isActive){pathInsetPreviewPendingRootId=null;if(range)range.value='0';if(numeric)numeric.value='0';if(output)output.textContent='0.000000';if(stateEl)stateEl.textContent=hasStored?'Original contour preview. Choose Apply / Update to restore the retained source geometry.':'No path thickness is previewed. Enter an amount or move the slider.';}
  renderCanvas();return;
 }
 const roots=picked.filter(root=>['path','group'].includes(root.type));
 if(!roots.length){pathInsetPreviewDrafts.delete(key);if(isActive){pathInsetPreviewState=null;pathInsetPreviewPendingRootId=null;if(stateEl)stateEl.textContent='Select one or more editable paths or groups containing paths.';status('Select editable path layers or groups to preview thickness.','error');}renderCanvas();return;}
 const found=collectOffsetTargetsForRoots(picked);
 if(!found.targets.length){pathInsetPreviewDrafts.delete(key);if(isActive){pathInsetPreviewState=null;pathInsetPreviewPendingRootId=null;if(stateEl)stateEl.textContent='This selection contains no editable filled path geometry. Filled SVG subpaths without Z are supported; unfilled open paths are not.';status('The selected objects have no editable filled path geometry for thickness adjustment. Open unfilled paths cannot be offset as filled contours.','error');}renderCanvas();return;}
 const entries=found.targets.map(layer=>({id:layer.id,d:thinSourcePathData(layer),fillRule:layer.fillRule||'nonzero',allowImplicitClose:layer.fill!=='none'&&num(layer.fillOpacity,1)>0}));
 const signature=pathInsetEntriesSignature(entries,join);
 if(isActive)pathInsetPreviewPendingRootId=key;
 if(isActive&&stateEl)stateEl.textContent=direction==='in'?'Checking a safe thinning preview…':'Checking a safe thickening preview…';
 try{
  const resolved=direction==='in'?await resolveSafeInset(entries,amount,join):await resolveSafeExpansion(entries,amount,join);
  if(pathInsetPreviewTasks.get(key)!==task)return;
  amount=resolved.amount;
  const preparedById=new Map(entries.map(entry=>[entry.id,prepareFilledPathForOffset(entry.d,entry.allowImplicitClose)]));
  const draft={key,rootId:roots[0]?.id,rootIds:picked.map(root=>root.id),amount,direction,join,signature,byId:resolved.byId,sourceIds:entries.map(x=>x.id),sourceById:new Map(entries.map(x=>[x.id,x.d])),fillRuleById:new Map(entries.map(x=>[x.id,x.fillRule])),openById:new Map([...preparedById].map(([id,v])=>[id,v.openIndices])),maxSafe:resolved.maxSafe};
  pathInsetPreviewDrafts.set(key,draft);
  if(isActive){
   pathInsetPreviewState=draft;pathInsetPreviewPendingRootId=null;
   const cached=direction==='in'?pathInsetSafeLimitState:pathExpansionSafeLimitState;
   const max=resolved.maxSafe??(cached?.signature===signature?cached.max:null);
   const currentRangeMax=Math.max(Number(range?.max)||0,pathThicknessSliderMax(amount));
   syncPathInsetControls(amount,max,!!resolved.limited,direction,currentRangeMax);
  }
  renderCanvas();
  const verb=direction==='in'?'thinning':'thickening',sign=direction==='in'?'−':'+';
  let message=`Previewing ${verb} on ${found.targets.length} path layer${found.targets.length===1?'':'s'} at ${sign}${amount.toFixed(6)} units. `;
  message+=join==='miter'?'Smart corners — existing curves stay smooth and sharp joins stay sharp':join==='bevel'?'Bevel corners':'Rounded corners';
  message+=' selected; existing Bézier curves stay curved.';
  if(resolved.limited)message+=` The requested amount was reduced to ${amount.toFixed(6)} units, the largest safe geometry for this selection. Narrow details and counters were protected.`;
  else if(resolved.maxSafe)message+=` Safe limit: ${resolved.maxSafe.toFixed(6)} units.`;
  if(found.skipped.length)message+=` ${found.skipped.length} unsupported, unfilled-open, or locked layer(s) untouched.`;
  if(isActive&&stateEl){stateEl.textContent=message;status(resolved.limited?`Smart ${verb} preview adjusted to the largest geometry-safe value: ${amount.toFixed(6)} units.`:`Smart ${verb} preview ready · ${found.targets.length} path layer(s) · ${amount.toFixed(6)} units. Nothing committed.`,'ok');}
 }catch(err){
  if(pathInsetPreviewTasks.get(key)!==task)return;
  pathInsetPreviewDrafts.delete(key);if(isActive){pathInsetPreviewState=null;pathInsetPreviewPendingRootId=null;}
  renderCanvas();if(isActive&&stateEl){stateEl.textContent=`No safe preview at this amount. ${err.message||err}`;status(`Smart ${direction==='in'?'thinning':'thickening'} preview failed: ${err.message||err}`,'error');}
 }
}

function schedulePathInsetPreview(value,direction=pathThicknessDirection){
 const roots=selectedRoots(),key=insetSelectionKey(roots);
 cancelPathInsetDraftTimer(key);
 const task=pathInsetPreviewTasks.get(key)||0,join=pathInsetCornerJoin,mode=direction==='out'?'out':'in';
 const timer=setTimeout(()=>{
  pathInsetPreviewTimers.delete(key);
  if(pathInsetPreviewPendingRootId===key)pathInsetPreviewPendingRootId=null;
  previewPathInset(value,roots,key,task,join,mode);
 },100);
 pathInsetPreviewTimers.set(key,timer);
 if(key===insetSelectionKey())pathInsetPreviewPendingRootId=key;
}

function clearInsetPreviewBeforeLayout(){
 // Canvas alignment, centering, resize and placement do not change local path geometry.
 // Keep per-layer thinning drafts visible and editable through these layout operations.
 return;
}

function refreshTypographyAfterPathOffset(root){
 if(!root?.typography)return;
 const node=typographyNodeForLayer(root);if(!node)return;
 try{
  // SVG getBBox() reports the updated geometric contour without stroke expansion.
  // This is the right source for capY; stroke expansion is added separately during
  // visual-centering calculations so changing Stroke never corrupts the true guide.
  const b=node.getBBox(),baseline=Number(root.typography.baselineY);
  if(![b.y,b.height,baseline].every(Number.isFinite))return;
  const capY=Math.min(baseline,b.y);
  if(!(capY<baseline))return;
  root.typography={...root.typography,baselineY:baseline,capY,capHeight:baseline-capY,verticalBasis:'baseline'};
  delete root.typography.inkCentroid;delete root.typography.referenceGlyphBounds;delete root.typography.referenceGlyphIndex;
  delete root.typography.referenceGlyph;delete root.typography.advanceStartX;delete root.typography.advanceEndX;root.typography.horizontalBasis='visible';
 }catch(_){/* Keep the saved writing line if fresh local bounds cannot be measured. */}
}
async function applyPathOffset(direction,requestedAmount=null){
 const mode=direction==='out'?'out':'in';
 const picked=selectedRoots(),roots=picked;
 if(!roots.length){status('Select one or more editable path layers or groups for thickness adjustment.','error');return;}
 const found=collectOffsetTargetsForRoots(picked);
 if(!found.targets.length){status('The selected objects contain no editable closed filled paths.','error');return;}
 // Cancel any still-running slider preview before committing. Preserve a completed
 // matching draft so Apply can commit exactly the geometry currently previewed.
 const selectionKey=insetSelectionKey(picked),completedDraft=pathInsetPreviewDrafts.get(selectionKey);
 cancelPathInsetDraftTimer(selectionKey);
 if(completedDraft)pathInsetPreviewDrafts.set(selectionKey,completedDraft);
 const rawAmount=Number(requestedAmount??$('bcPathInsetAmount')?.value??$('bcPathInsetRange')?.value??0);
 if(!Number.isFinite(rawAmount)||rawAmount<0){status('Enter a finite non-negative SVG-unit amount. Nothing was changed.','error');return;}
 const rootIds=picked.map(root=>root.id);
 // Zero restores the retained source, for either direction.
 if(rawAmount<=0){
  const restorable=found.targets.filter(layer=>(typeof layer.pathOffsetSourceD==='string'&&layer.pathOffsetSourceD.trim())||(typeof layer.thinSourceD==='string'&&layer.thinSourceD.trim()));
  if(!restorable.length){if(mode==='in')resetPathInsetPreview(true,true);else resetPathInsetPreview(true,true);status('No committed path thickness adjustment is present on this selection.','ok');return;}
  try{
   snap();
   for(const layer of restorable){layer.d=thinSourcePathData(layer);clearStoredThinning(layer);delete layer.generatedShape;}
   for(const root of roots)if(root.type==='group'){delete root.pathOffsetAmount;delete root.pathOffsetJoin;delete root.thinAmount;delete root.thinCornerJoin;}
   pathInsetPreviewDrafts.delete(insetSelectionKey(picked));pathInsetPreviewState=null;cancelPathInsetDraftTimer(insetSelectionKey(picked));pathInsetPreviewTask++;
   renderCanvas();restorable.forEach(refreshTypographyAfterPathOffset);roots.forEach(root=>{if(root.type==='group')refreshTypographyAfterPathOffset(root);});
   render();persistBadgeDraft();
   const state=$('bcPathInsetState');if(state)state.textContent=`Restored ${restorable.length} original path layer(s).`;
   status(`Restored ${restorable.length} original editable contour(s).${found.skipped.length?` ${found.skipped.length} unsupported/open/locked layer(s) were left untouched.`:''}`,'ok');
  }catch(error){status(`Could not restore the original contours: ${error.message||error}`,'error');}
  return;
 }
 const amount=rawAmount;
 const join=pathInsetCornerJoin;
 const distance=mode==='in'?-amount:amount;
 const entries=found.targets.map(layer=>({id:layer.id,d:thinSourcePathData(layer),fillRule:layer.fillRule||'nonzero',allowImplicitClose:layer.fill!=='none'&&num(layer.fillOpacity,1)>0}));
 const sourceData=new Map(found.targets.map(layer=>[layer.id,layer.d||'']));
 const baseData=new Map(found.targets.map(layer=>[layer.id,thinSourcePathData(layer)]));
 const preparedSource=new Map(entries.map(entry=>[entry.id,prepareFilledPathForOffset(entry.d,entry.allowImplicitClose)]));
 const signature=pathInsetEntriesSignature(entries,join);
 let byId,actualAmount=amount,limited=false;
 try{
  const currentDraft=pathInsetPreviewDrafts.get(insetSelectionKey(picked));
  const previewMatches=currentDraft&&pathInsetDraftIsCurrent(currentDraft)&&sameInsetSelection(currentDraft,picked)&&currentDraft.direction===mode&&currentDraft.join===join&&Math.abs(currentDraft.amount-amount)<1e-7&&currentDraft.signature===signature&&currentDraft.byId.size===found.targets.length&&found.targets.every(layer=>currentDraft.byId.has(layer.id));
  if(previewMatches){byId=currentDraft.byId;actualAmount=currentDraft.amount;}
  else{
   const resolved=mode==='in'?await resolveSafeInset(entries,amount,join):await resolveSafeExpansion(entries,amount,join);
   byId=resolved.byId;actualAmount=resolved.amount;limited=resolved.limited;
  }
  if(byId.size!==found.targets.length)throw Error('Not every selected path produced a valid offset. No changes were applied.');
  const latest=selectedRoots().map(root=>root.id).sort(),expected=rootIds.slice().sort();
  if(latest.length!==expected.length||!latest.every((id,i)=>id===expected[i])||picked.some(root=>findLayer(root.id)!==root)||found.targets.some(layer=>findLayer(layer.id)!==layer||(layer.d||'')!==sourceData.get(layer.id)||thinSourcePathData(layer)!==baseData.get(layer.id)))throw Error('The selection or path data changed while the offset was calculated. Nothing was changed; select the artwork again and retry.');
  snap();
  for(const layer of found.targets){
   const d=byId.get(layer.id);if(!d)throw Error(`No offset geometry was returned for “${layer.name||'path'}”.`);
   layer.pathOffsetSourceD=baseData.get(layer.id);layer.pathOffsetAmount=mode==='in'?actualAmount:-actualAmount;layer.pathOffsetJoin=join;layer.pathOffsetOpenSubpaths=preparedSource.get(layer.id)?.openIndices||[];
   if(mode==='in'){
    layer.thinSourceD=baseData.get(layer.id);layer.thinAmount=actualAmount;layer.thinCornerJoin=join;layer.thinOpenSubpaths=preparedSource.get(layer.id)?.openIndices||[];
   }else{delete layer.thinSourceD;delete layer.thinAmount;delete layer.thinCornerJoin;layer.thinOpenSubpaths=preparedSource.get(layer.id)?.openIndices||[];}
   layer.d=d;delete layer.generatedShape;
  }
  for(const root of roots)if(root.type==='group'){
   root.pathOffsetAmount=mode==='in'?actualAmount:-actualAmount;root.pathOffsetJoin=join;
   if(mode==='in'){root.thinAmount=actualAmount;root.thinCornerJoin=join;}else{delete root.thinAmount;delete root.thinCornerJoin;}
  }
  pathInsetPreviewDrafts.delete(insetSelectionKey(picked));pathInsetPreviewState=null;pathInsetPreviewTask++;pathInsetPreviewPendingRootId=null;
  renderCanvas();found.targets.forEach(layer=>refreshTypographyAfterPathOffset(layer));for(const root of roots)refreshTypographyAfterPathOffset(root);
  render();persistBadgeDraft();
  const otherCount=found.skipped.length,cornerLabel=join==='miter'?'smart · preserve sharp corners and original curves':join==='bevel'?'bevel':'round';
  const directionLabel=mode==='in'?'thinning':'thickening';
  const state=$('bcPathInsetState');if(state)state.textContent=`Applied ${directionLabel} from the retained source contour at ${actualAmount.toFixed(6)} units using ${cornerLabel}. Adjust again from the same original geometry, or set the amount to 0 to restore it.`;
  status(`Smart ${directionLabel} applied to ${found.targets.length} path layer(s) · ${actualAmount.toFixed(6)} local units · ${cornerLabel} · original editable contours retained.${limited?` The requested amount was reduced to the largest geometry-safe value (${actualAmount.toFixed(6)}).`:''}${otherCount?` ${otherCount} unsupported/open/locked layer(s) left untouched.`:''}`,'ok');
 }catch(e){
  pathInsetPreviewTask++;pathInsetPreviewDrafts.delete(insetSelectionKey(picked));pathInsetPreviewState=null;renderCanvas();
  const state=$('bcPathInsetState');if(state)state.textContent='Operation failed. The committed geometry and original source contour were left unchanged. '+(e.message||e);
  status(`Path ${mode==='in'?'thinning':'thickening'} failed: ${e.message||e}`,'error');
 }
}
function filletPointLerp(a,b,t){return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
function filletPointDistance(a,b){return Math.hypot(b.x-a.x,b.y-a.y);}
function filletSegmentPoint(seg,t){const u=Math.max(0,Math.min(1,t)),v=1-u,p0=seg.p0,p1=seg.p1;if(seg.cmd==='L')return filletPointLerp(p0,p1,u);if(seg.cmd==='Q'){const c=seg.c;return{x:v*v*p0.x+2*v*u*c.x+u*u*p1.x,y:v*v*p0.y+2*v*u*c.y+u*u*p1.y};}if(seg.cmd==='C'){const a=seg.c1,b=seg.c2;return{x:v*v*v*p0.x+3*v*v*u*a.x+3*v*u*u*b.x+u*u*u*p1.x,y:v*v*v*p0.y+3*v*v*u*a.y+3*v*u*u*b.y+u*u*u*p1.y};}throw Error('Unsupported curve segment.');}
function filletSegmentTangent(seg,t){const u=Math.max(0,Math.min(1,t)),v=1-u,p0=seg.p0,p1=seg.p1;if(seg.cmd==='L')return{x:p1.x-p0.x,y:p1.y-p0.y};if(seg.cmd==='Q'){const c=seg.c;return{x:2*(v*(c.x-p0.x)+u*(p1.x-c.x)),y:2*(v*(c.y-p0.y)+u*(p1.y-c.y))};}if(seg.cmd==='C'){const a=seg.c1,b=seg.c2;return{x:3*(v*v*(a.x-p0.x)+2*v*u*(b.x-a.x)+u*u*(p1.x-b.x)),y:3*(v*v*(a.y-p0.y)+2*v*u*(b.y-a.y)+u*u*(p1.y-b.y))};}throw Error('Unsupported curve segment.');}
function filletSegmentLengthTo(seg,t){if(seg.cmd==='L')return filletPointDistance(seg.p0,filletSegmentPoint(seg,t));const steps=32;let total=0,prev=seg.p0;for(let i=1;i<=steps;i++){const q=filletSegmentPoint(seg,t*i/steps);total+=filletPointDistance(prev,q);prev=q;}return total;}
function filletSegmentLength(seg){return filletSegmentLengthTo(seg,1);}
function filletParameterAtDistance(seg,distance,total){const target=Math.max(0,Math.min(total,distance));if(target<=1e-9)return 0;if(total-target<=1e-9)return 1;let lo=0,hi=1;for(let i=0;i<26;i++){const mid=(lo+hi)/2;if(filletSegmentLengthTo(seg,mid)<target)lo=mid;else hi=mid;}return(lo+hi)/2;}
function splitFilletSegment(seg,t){const p0=seg.p0,p1=seg.p1,u=Math.max(0,Math.min(1,t));if(seg.cmd==='L'){const q=filletPointLerp(p0,p1,u);return[{cmd:'L',p0,p1:q,x:q.x,y:q.y},{cmd:'L',p0:q,p1,x:p1.x,y:p1.y}];}if(seg.cmd==='Q'){const a=filletPointLerp(p0,seg.c,u),b=filletPointLerp(seg.c,p1,u),m=filletPointLerp(a,b,u);return[{cmd:'Q',p0,c:a,p1:m,x:m.x,y:m.y},{cmd:'Q',p0:m,c:b,p1,x:p1.x,y:p1.y}];}if(seg.cmd==='C'){const a=filletPointLerp(p0,seg.c1,u),b=filletPointLerp(seg.c1,seg.c2,u),c=filletPointLerp(seg.c2,p1,u),d=filletPointLerp(a,b,u),e=filletPointLerp(b,c,u),m=filletPointLerp(d,e,u);return[{cmd:'C',p0,c1:a,c2:d,p1:m,x:m.x,y:m.y},{cmd:'C',p0:m,c1:e,c2:c,p1,x:p1.x,y:p1.y}];}throw Error('Only line, quadratic and cubic curve segments can be filleted.');}
function trimFilletSegment(seg,startDistance,endDistance,total){const t0=filletParameterAtDistance(seg,startDistance,total),t1=1-filletParameterAtDistance({...seg,p0:seg.p1,p1:seg.p0,...(seg.cmd==='Q'?{c:seg.c}:{}),...(seg.cmd==='C'?{c1:seg.c2,c2:seg.c1}:{})},endDistance,total);if(t1<t0+1e-7)throw Error('Two corner radii consume the same short edge. Reduce the radius.');const right=splitFilletSegment(seg,t0)[1],relative=(t1-t0)/(1-t0);return splitFilletSegment(right,relative)[0];}
function filletPathCommand(seg){if(seg.cmd==='L')return{cmd:'L',x:seg.p1.x,y:seg.p1.y};if(seg.cmd==='Q')return{cmd:'Q',c:{...seg.c},x:seg.p1.x,y:seg.p1.y};if(seg.cmd==='C')return{cmd:'C',c1:{...seg.c1},c2:{...seg.c2},x:seg.p1.x,y:seg.p1.y};throw Error('Unsupported fillet output segment.');}
function filletUnit(v){const n=Math.hypot(v.x,v.y);if(!Number.isFinite(n)||n<1e-9)throw Error('A corner has a zero-length tangent. Remove duplicate path points first.');return{x:v.x/n,y:v.y/n};}
function splitClosedPathContours(d){const segs=parseEditablePath(d),contours=[];let current=null,pen=null;for(const seg of segs){if(seg.cmd==='M'){if(current)throw Error('Every contour must be closed before the next moveto.');current={start:{x:seg.x,y:seg.y},edges:[]};pen=current.start;continue;}if(seg.cmd==='Z'){if(!current)throw Error('A close command has no matching contour.');if(filletPointDistance(pen,current.start)>1e-8)current.edges.push({cmd:'L',p0:pen,p1:current.start,x:current.start.x,y:current.start.y});if(current.edges.length<3)throw Error('Each closed contour needs at least three segments.');contours.push(current);current=null;pen=null;continue;}if(!current)throw Error('Path must start each contour with moveto (M).');if(!['L','Q','C'].includes(seg.cmd))throw Error('Smart Fillet supports line, quadratic and cubic segments. Elliptical arc (A) segments must be converted to curves first.');const edge={...seg,p0:pen,p1:{x:seg.x,y:seg.y}};current.edges.push(edge);pen=edge.p1;}if(current)throw Error('Smart Fillet only changes closed contours. Close the path before applying it.');if(!contours.length)throw Error('No closed contour was found.');return contours;}
function roundClosedPolygonPath(d,radius,perCorner=[]){const contours=splitClosedPathContours(d),out=[];let cornerIndex=0,hasFillet=false;if(!(Number(radius)>0)&&!perCorner.some(v=>Number(v)>0))return d;for(const contour of contours){const edges=contour.edges,n=edges.length,lengths=edges.map(filletSegmentLength);if(lengths.some(v=>!Number.isFinite(v)||v<1e-6))throw Error('The path contains a zero-length or invalid edge. Normalize it before filleting.');const corners=[];for(let i=0;i<n;i++){const incoming=edges[(i+n-1)%n],outgoing=edges[i],tin=filletUnit(filletSegmentTangent(incoming,1)),tout=filletUnit(filletSegmentTangent(outgoing,0)),cross=tin.x*tout.y-tin.y*tout.x,dot=Math.max(-1,Math.min(1,tin.x*tout.x+tin.y*tout.y)),turn=Math.abs(Math.atan2(cross,dot)),requested=perCorner[cornerIndex]??radius;cornerIndex++;if(turn<1e-4||requested<=0){corners.push({trim:0,turn,tin,tout});continue;}const tangentFactor=Math.tan(Math.min(Math.PI-.001,turn)/2),wanted=requested*tangentFactor,clearance=Math.min(lengths[(i+n-1)%n],lengths[i])*.45;corners.push({trim:Math.min(wanted,clearance),turn,tin,tout,requested});}
  if(corners.some(c=>c.trim>=1e-6&&c.turn>=1e-4))hasFillet=true;const trimStart=corners.map(c=>c.trim),trimEnd=Array.from({length:n},(_,i)=>corners[(i+1)%n].trim);
  for(let i=0;i<n;i++){const sum=trimStart[i]+trimEnd[i],limit=lengths[i]*.82;if(sum>limit){const scale=limit/sum;trimStart[i]*=scale;trimEnd[i]*=scale;}}
  const params=edges.map((edge,i)=>{const total=lengths[i],a=filletParameterAtDistance(edge,trimStart[i],total),rev={...edge,p0:edge.p1,p1:edge.p0,...(edge.cmd==='Q'?{c:edge.c}:{}),...(edge.cmd==='C'?{c1:edge.c2,c2:edge.c1}:{})},b=1-filletParameterAtDistance(rev,trimEnd[i],total);if(b<a+1e-7)throw Error('Corner radii leave no room on an edge. Reduce the radius.');return{a,b};});
  const trimmed=edges.map((edge,i)=>{const {a,b}=params[i],right=splitFilletSegment(edge,a)[1];return splitFilletSegment(right,(b-a)/(1-a))[0];});
  const fillets=corners.map((corner,i)=>{const prev=(i+n-1)%n,entry=filletSegmentPoint(edges[prev],params[prev].b),exit=filletSegmentPoint(edges[i],params[i].a);if(corner.trim<1e-6||corner.turn<1e-4)return{active:false,entry:edges[prev].p1,exit:edges[i].p0};const tin=filletUnit(filletSegmentTangent(edges[prev],params[prev].b)),tout=filletUnit(filletSegmentTangent(edges[i],params[i].a)),inTrim=trimEnd[prev],outTrim=trimStart[i],turn=Math.min(Math.PI-.001,corner.turn),tanHalf=Math.tan(turn/2),effectiveRadius=Math.min(inTrim,outTrim)/Math.max(1e-8,tanHalf),control=(4/3)*effectiveRadius*Math.tan(turn/4);return{active:true,entry,exit,c1:{x:entry.x+tin.x*control,y:entry.y+tin.y*control},c2:{x:exit.x-tout.x*control,y:exit.y-tout.y*control}};});
  const first=fillets[0],start=first.active?first.exit:edges[0].p0;out.push({cmd:'M',x:start.x,y:start.y});for(let i=0;i<n;i++){out.push(filletPathCommand(trimmed[i]));const next=(i+1)%n,f=fillets[next];if(f.active)out.push({cmd:'C',c1:f.c1,c2:f.c2,x:f.exit.x,y:f.exit.y});}out.push({cmd:'Z'});
 }
 return hasFillet?editablePathToString(out):d;
}
function getSelectedFilletTargets(){const roots=selectedRoots(),targets=[];const walk=l=>{if(!l||isEffectivelyLocked(l))return;if(l.type==='path')targets.push(l);else if(l.type==='group')(l.children||[]).forEach(walk);};roots.forEach(walk);return{roots,targets};}
function clearPathRoundPreview(quiet=false){if(pathRoundPreviewTimer){clearTimeout(pathRoundPreviewTimer);pathRoundPreviewTimer=null;}const changed=pathRoundPreviewById.size>0;pathRoundPreviewById.clear();pathRoundPreviewState=null;const state=$('bcPathRoundPreviewState');if(state)state.textContent='Preview cleared. No path data was changed.';if(changed&&!quiet)renderCanvas();}
function previewPathRoundCorners(){const stateLabel=$('bcPathRoundPreviewState');try{if(pathInsetPreviewState)resetPathInsetPreview(true);const {roots,targets}=getSelectedFilletTargets();if(!targets.length)throw Error('Select one or more editable paths, or a group containing paths.');const radius=Math.max(0,Math.min(200,num($('bcPathRound')?.value,3))),raw=String($('bcPathRoundPerCorner')?.value||'').trim(),perCorner=raw?raw.split(',').map((v,i)=>{if(!v.trim())return null;const n=Number(v);if(!Number.isFinite(n)||n<0||n>200)throw Error(`Per-corner radius ${i+1} must be between 0 and 200.`);return n;}):[];if(perCorner.some(v=>v===null))throw Error('Use a number for every listed corner radius, for example 2, 5, 0.');const entries=targets.map(layer=>{const source=layer.d||'',result=roundClosedPolygonPath(source,radius,perCorner);validatePathSyntax(result);return{id:layer.id,layer,source,result};});pathRoundPreviewById.clear();for(const entry of entries)pathRoundPreviewById.set(entry.id,entry.result);pathRoundPreviewState={rootIds:roots.map(l=>l.id).sort(),entries,radius,perCorner};if(stateLabel)stateLabel.textContent=`Live preview · ${entries.length} path layer(s) · ${perCorner.length?'per-corner':'uniform'} radius`;renderCanvas();status(`Smart Fillet preview ready for ${entries.length} editable path layer(s). Nothing has been committed yet.`,'ok');return true;}catch(err){clearPathRoundPreview(true);if(stateLabel)stateLabel.textContent='Preview unavailable: '+(err.message||err);status('Smart Fillet preview failed: '+(err.message||err),'error');return false;}}
function applyPathRoundCorners(){if(!pathRoundPreviewState&&!previewPathRoundCorners())return;const state=pathRoundPreviewState;if(!state)return;if(state.entries.every(entry=>entry.result===entry.source)){clearPathRoundPreview(true);status('No corners needed rounding. Original path data was left unchanged.','warn');return;}for(const entry of state.entries)if(findLayer(entry.id)!==entry.layer||(entry.layer.d||'')!==entry.source){clearPathRoundPreview(true);status('Path selection or data changed after preview. Nothing was applied; preview again.','warn');return;}const entries=state.entries.slice();clearPathRoundPreview(true);snap();for(const entry of entries){clearStoredThinning(entry.layer);entry.layer.d=entry.result;delete entry.layer.generatedShape;refreshTypographyAfterPathOffset(entry.layer);}render();persistBadgeDraft();status(`Smart Fillet applied to ${entries.length} path layer(s). Original geometry is available through Undo.`,'ok');}
function collectStrokeOutlineTargets(roots){
 const targets=[],skippedFilled=[],skippedUnsupported=[];
 const visibleFill=l=>String(l?.fill??'none').toLowerCase()!=='none'&&num(l?.fillOpacity,1)>0&&num(l?.fillAlpha,255)>0;
 const resolveGroupStyle=l=>{const value=groupStrokeStyle(l);if(!value)return null;return{...value,linejoin:strokeLineJoinForLayer(l),strokeMiterlimit:strokeMiterLimitForLayer(l)};};
 const walk=(layer,inherited=null)=>{
  if(!layer||layer.visible===false||num(layer.opacity,1)<=0)return;
  if(layer.locked){skippedUnsupported.push(layer);return;}
  if(layer.type==='group'){const style=resolveGroupStyle(layer)||inherited;(layer.children||[]).forEach(child=>walk(child,style));return;}
  if(layer.type!=='path'){if(inherited||groupStrokeStyle(layer))skippedUnsupported.push(layer);return;}
  const own=groupStrokeStyle(layer),base=own?{...own,linejoin:strokeLineJoinForLayer(layer),strokeMiterlimit:strokeMiterLimitForLayer(layer)}:inherited;
  if(!base||!(num(base.strokeWidth,1)>0)||num(base.strokeOpacity,1)<=0||num(base.strokeAlpha,255)<=0)return;
  if(visibleFill(layer)){skippedFilled.push(layer);return;}
  targets.push({layer,style:{...base},inherited:!own,sourceD:String(layer.d||''),signature:JSON.stringify([layer.stroke,layer.strokeWidth,layer.strokeOpacity,layer.strokeAlpha,layer.linecap,layer.linejoin,layer.strokeDasharray,layer.strokeDashoffset,layer.pathOffsetJoin,layer.thinCornerJoin])});
 };
 roots.forEach(root=>walk(root,null));return{targets,skippedFilled,skippedUnsupported};
}
async function outlineStrokeBatch(entries){
 const P=await ensurePaper();let scope=null,project=null,previousProject=null,canvas=null,Engine=P;
 try{
  canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;
  if(typeof P.PaperScope==='function'){scope=new P.PaperScope();project=scope.setup(canvas)||scope.project;Engine=scope;}
  else{previousProject=P.project||null;project=P.setup(canvas)||P.project;Engine=P;}
  if(!project||typeof Engine.CompoundPath!=='function')throw Error('Paper.js compound-path support is unavailable.');
  const result=new Map();
  for(const entry of entries){let source=null,outline=null;try{
   source=new Engine.CompoundPath(entry.sourceD);if(!source||source.isEmpty?.(true))throw Error(`“${entry.layer.name||'Path'}” has no outlineable path geometry.`);
   const style=entry.style,width=num(style.strokeWidth,1),join=['miter','round','bevel'].includes(style.linejoin)?style.linejoin:'miter',cap=['butt','round','square'].includes(style.linecap)?style.linecap:'round',miterLimit=Math.max(1,num(style.strokeMiterlimit,4));
   if(!(width>0))throw Error(`“${entry.layer.name||'Path'}” has no positive stroke width.`);
   source.strokeColor=style.stroke;source.strokeWidth=width;source.strokeJoin=join;source.strokeCap=cap;source.miterLimit=miterLimit;
   const dash=String(style.strokeDasharray||'').trim();source.dashArray=dash&&dash.toLowerCase()!=='none'?dash.split(/[\s,]+/).map(Number).filter(n=>Number.isFinite(n)&&n>=0):[];source.dashOffset=num(style.strokeDashoffset,0);
   if(typeof source.outline!=='function')throw Error('Paper.js PathItem.outline() is not available.');
   outline=source.outline({width,join,cap,miterLimit,insert:false});const next=String(outline?.pathData||'').trim();if(!next)throw Error(`The stroke outline for “${entry.layer.name||'Path'}” is empty.`);
   const contours=splitEditableSubpaths(parseEditablePath(next));if(!contours.length||contours.some(parts=>parts.at(-1)?.cmd!=='Z'))throw Error(`The stroke outline for “${entry.layer.name||'Path'}” did not produce closed filled contours.`);
   const b=outline.bounds;if(!b||!(b.width>1e-5&&b.height>1e-5))throw Error(`The stroke outline for “${entry.layer.name||'Path'}” has zero visible area.`);
   result.set(entry.layer.id,next);
  }finally{try{outline?.remove?.();}catch(_){}try{source?.remove?.();}catch(_){}}
  }
  return result;
 }finally{try{if(scope&&typeof scope.remove==='function')scope.remove();else if(project?.remove)project.remove();}catch(_){}try{if(previousProject&&previousProject!==project&&typeof previousProject.activate==='function')previousProject.activate();}catch(_){}if(canvas?.parentNode)canvas.remove();}
}
async function applyStrokeOutline(){
 if(pathInsetPreviewState)resetPathInsetPreview(true);
 const roots=selectedRoots();if(!roots.length){status('Select one or more stroked path layers, or a group containing them.','error');return;}
 const found=collectStrokeOutlineTargets(roots);
 if(!found.targets.length){const why=found.skippedFilled.length?'The selected paths have visible fills as well as strokes. Their fills were left untouched; select unfilled stroke-only paths for conversion.':'No supported unfilled stroked path was found. Select a path with a visible Stroke and no visible Fill.';status(why,'warn');return;}
 const rootIds=roots.map(x=>x.id).sort(),entries=found.targets;
 try{
  status(`Outlining ${entries.length} stroked path${entries.length===1?'':'s'}…`,'');
  const byId=await outlineStrokeBatch(entries);
  const latest=selectedRoots().map(x=>x.id).sort();
  if(latest.length!==rootIds.length||!latest.every((id,i)=>id===rootIds[i])||entries.some(entry=>findLayer(entry.layer.id)!==entry.layer||(entry.layer.d||'')!==entry.sourceD||JSON.stringify([entry.layer.stroke,entry.layer.strokeWidth,entry.layer.strokeOpacity,entry.layer.strokeAlpha,entry.layer.linecap,entry.layer.linejoin,entry.layer.strokeDasharray,entry.layer.strokeDashoffset,entry.layer.pathOffsetJoin,entry.layer.thinCornerJoin])!==entry.signature))throw Error('The selection or stroke style changed while the outline was calculated. Nothing was changed; select the artwork again and retry.');
  if(byId.size!==entries.length)throw Error('The stroke engine did not return geometry for every selected path. Nothing was changed.');
  snap();
  for(const entry of entries){const layer=entry.layer,next=byId.get(layer.id),style=entry.style;if(!next)throw Error(`No outline geometry was returned for “${layer.name||'Path'}”.`);layer.d=next;layer.fill=style.stroke;layer.fillType='solid';layer.fillAlpha=Math.max(0,Math.min(255,num(style.strokeAlpha,255)));layer.fillOpacity=Math.max(0,Math.min(1,num(style.strokeOpacity,1)));layer.fill2=style.stroke;layer.fill2Alpha=layer.fillAlpha;layer.stroke=entry.inherited?style.stroke:'none';layer.strokeAlpha=255;layer.strokeOpacity=entry.inherited?0:1;layer.strokeWidth=Math.max(.01,num(style.strokeWidth,1));layer.linecap=style.linecap||'round';layer.linejoin=style.linejoin||'miter';layer.strokeMiterlimit=Math.max(1,num(style.strokeMiterlimit,4));layer.strokeDasharray='';layer.strokeDashoffset=0;layer.fillRule='nonzero';clearStoredThinning(layer);delete layer.generatedShape;}
  render();persistBadgeDraft();status(`Expanded ${entries.length} stroke layer${entries.length===1?'':'s'} into editable filled path geometry. Stroke width, cap, join and dash pattern were baked into the outlines.${found.skippedFilled.length?` ${found.skippedFilled.length} filled path${found.skippedFilled.length===1?' was':'s were'} left as editable fill + live Stroke to protect their fills.`:''}${found.skippedUnsupported.length?` ${found.skippedUnsupported.length} unsupported object${found.skippedUnsupported.length===1?' was':'s were'} left unchanged.`:''}`,'ok');
 }catch(error){status(`Stroke expansion failed: ${error.message||error}. Original paths and stroke styles were left unchanged.`,'error');}
}
document.querySelector('[data-stroke-outline]')?.addEventListener('click',applyStrokeOutline);
document.querySelector('[data-path-round-preview]')?.addEventListener('click',previewPathRoundCorners);
document.querySelector('[data-path-round]')?.addEventListener('click',applyPathRoundCorners);
document.querySelector('[data-path-round-reset]')?.addEventListener('click',()=>clearPathRoundPreview());
['bcPathRound','bcPathRoundPerCorner'].forEach(id=>$(id)?.addEventListener('input',()=>{if(pathRoundPreviewTimer)clearTimeout(pathRoundPreviewTimer);pathRoundPreviewTimer=setTimeout(()=>previewPathRoundCorners(),180);}));



function collectSelectedEditableLayers(){const out=[],seen=new Set();const visit=l=>{if(!l||l.locked||seen.has(l.id))return;seen.add(l.id);if(l.type==='group'){(l.children||[]).forEach(visit);return;}out.push(l);};selectedRoots().forEach(visit);return out;}
function bulkCommonValue(items,getter){if(!items.length)return'';const values=items.map(getter).map(v=>v==null?'':String(v));return values.every(v=>v===values[0])?values[0]:'';}
function isSafeCssColor(value,allowNone=true){const raw=String(value??'').trim();if(allowNone&&raw.toLowerCase()==='none')return true;if(/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw))return true;if(!raw||/[<>"'{};]/.test(raw)||/(?:url|expression|javascript)\s*\(/i.test(raw))return false;try{return !!(window.CSS&&CSS.supports('color',raw));}catch(_){return false;}}
function svgLayerRepresentativePaint(layer,property){
 if(layer?.rootAttrs?.[property]!=null){const value=String(layer.rootAttrs[property]).trim();return /url\s*\(/i.test(value)?'__embedded__':value;}
 try{
  const doc=new DOMParser().parseFromString(`<svg xmlns="${NS}">${layer?.markup||''}</svg>`,'image/svg+xml');
  if(doc.querySelector('parsererror,style'))return'__mixed__';
  const nodes=[...doc.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line,text,use,image')];
  if(!nodes.length)return property==='fill'?'#000000':'none';
  const values=nodes.map(node=>{let current=node;while(current&&current!==doc.documentElement){if(current.hasAttribute(property))return String(current.getAttribute(property)).trim();const inline=current.getAttribute('style')||'';for(const part of inline.split(';')){const index=part.indexOf(':');if(index>0&&part.slice(0,index).trim().toLowerCase()===property)return part.slice(index+1).trim();}if(current.hasAttribute('class'))return'__mixed__';current=current.parentElement;}return String(layer?.rootAttrs?.[property]??(property==='fill'?'#000000':'none')).trim();});
  if(values.some(value=>/url\s*\(/i.test(value)))return'__embedded__';const unique=[...new Set(values)];return unique.length===1?unique[0]:'__mixed__';
 }catch(_){return'__mixed__';}
}
function applyImportedSvgPaint(layer,property,value){
 if(!layer||layer.type!=='svg')return 0;
 if(property==='fill'){layer.fill=value;layer.svgFillOverride=true;}
 else if(property==='stroke'){layer.stroke=value;layer.svgStrokeOverride=true;}
 else return 0;
 return Math.max(1,(String(layer.markup||'').match(/<(?:path|rect|circle|ellipse|polygon|polyline|line|text|use|image)\b/gi)||[]).length);
}
function svgOpacityNumber(value,fallback=1){if(value==null||value==='')return fallback;const raw=String(value).trim(),n=parseFloat(raw);if(!Number.isFinite(n))return fallback;return Math.max(0,Math.min(1,raw.endsWith('%')?n/100:n));}
function svgLayerStrokeControlValue(layer,key){
 const flag=key==='linecap'?'svgLinecapOverride':'svgLinejoinOverride';
 if(layer?.[flag])return String(layer[key]||(key==='linecap'?'butt':'miter'));
 const outer=getLayerNode(layer?.id),root=outer?.querySelector('svg');
 if(!root)return key==='linecap'?'butt':'miter';
 const property=key==='linecap'?'strokeLinecap':'strokeLinejoin',values=[];
 for(const el of root.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line,text,use')){
  let style=null;try{style=getComputedStyle(el);}catch(_){}
  if(style&&(style.display==='none'||style.visibility==='hidden'||String(style.stroke||'none').toLowerCase()==='none'))continue;
  const value=String(style?.[property]||el.getAttribute(key==='linecap'?'stroke-linecap':'stroke-linejoin')||(key==='linecap'?'butt':'miter')).trim();
  if(value)values.push(value);
 }
 const unique=[...new Set(values)];return unique.length>1?'__mixed__':unique[0]||(key==='linecap'?'butt':'miter');
}
function applySvgLayerOverrides(svgRoot,layer){
 if(!svgRoot||!layer)return;
 const drawables=[...svgRoot.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line,text,use,image')];
 for(const el of drawables){
  let computed;try{computed=getComputedStyle(el);}catch(_){computed=null;}
  const originalFill=String(computed?.fill||el.getAttribute('fill')||'').trim().toLowerCase();
  const baseFill=svgOpacityNumber(computed?.fillOpacity??el.getAttribute('fill-opacity'),1);
  const baseStroke=svgOpacityNumber(computed?.strokeOpacity??el.getAttribute('stroke-opacity'),1);
  if(layer.svgFillOverride&&el.localName!=='line'&&el.localName!=='image'&&originalFill!=='none')el.style.setProperty('fill',String(layer.fill??'none'),'important');
  if(layer.svgStrokeOverride&&el.localName!=='image')el.style.setProperty('stroke',String(layer.stroke??'none'),'important');
  if(el.localName!=='image'&&layer.svgLinecapOverride)el.style.setProperty('stroke-linecap',String(layer.linecap||'butt'),'important');
  if(el.localName!=='image'&&layer.svgLinejoinOverride){
   const join=strokeLineJoinForLayer(layer);el.style.setProperty('stroke-linejoin',join,'important');
   if(String(layer.linejoin)==='match-thin'&&join==='miter')el.style.setProperty('stroke-miterlimit','10','important');
  }
  const fa=Math.max(0,Math.min(255,num(layer.fillAlpha,255)))/255*Math.max(0,Math.min(1,num(layer.fillOpacity,1)));
  const sa=Math.max(0,Math.min(255,num(layer.strokeAlpha,255)))/255*Math.max(0,Math.min(1,num(layer.strokeOpacity,1)));
  if(fa<.999999)el.style.setProperty('fill-opacity',String(baseFill*fa),'important');
  if(sa<.999999)el.style.setProperty('stroke-opacity',String(baseStroke*sa),'important');
 }
}function applyBulkSelectionStyles(values){
 const targets=collectSelectedEditableLayers();if(!targets.length){status('Select one or more unlocked layers first.','error');return;}
 const has=k=>values[k]!==undefined&&values[k]!==null&&String(values[k]).trim()!=='';
 const validColor=v=>isSafeCssColor(v,true);
 const fillValue=has('fill')?String(values.fill).trim():null,strokeValue=has('stroke')?String(values.stroke).trim():null;
  const fillAlpha=has('fillAlpha')?Number(values.fillAlpha):null,strokeAlpha=has('strokeAlpha')?Number(values.strokeAlpha):null;
  if(fillAlpha!==null&&(!Number.isFinite(fillAlpha)||fillAlpha<0||fillAlpha>255))throw new Error('Fill alpha must be between 0 and 255.');
  if(strokeAlpha!==null&&(!Number.isFinite(strokeAlpha)||strokeAlpha<0||strokeAlpha>255))throw new Error('Stroke alpha must be between 0 and 255.');
 if(fillValue!==null&&!validColor(fillValue))throw new Error('Enter a valid fill colour or “none”.');
 if(strokeValue!==null&&!validColor(strokeValue))throw new Error('Enter a valid stroke colour or “none”.');
 const fillTargets=targets.filter(l=>!['image','line'].includes(l.type));
 const strokeTargets=targets.filter(l=>l.type!=='image');
 const textTargets=targets.filter(l=>l.type==='text');
 const family=has('fontFamily')?String(values.fontFamily).trim():'';
 if(family.length>256)throw new Error('Font family name is too long (maximum 256 characters).');
 const size=has('fontSize')?Number(values.fontSize):null,weight=has('fontWeight')?Number(values.fontWeight):null,spacing=has('letterSpacing')?Number(values.letterSpacing):null;
 if(size!==null&&(!Number.isFinite(size)||size<1||size>1000))throw new Error('Font size must be between 1 and 1000.');
 if(weight!==null&&(!Number.isFinite(weight)||weight<100||weight>900))throw new Error('Font weight must be between 100 and 900.');
 if(spacing!==null&&(!Number.isFinite(spacing)||spacing< -1000||spacing>1000))throw new Error('Letter spacing must be between -1000 and 1000.');
 const wantsType=!!(family||size!==null||weight!==null||spacing!==null);
 if(!((fillValue!==null||fillAlpha!==null)&&fillTargets.length)&&!((strokeValue!==null||strokeAlpha!==null)&&strokeTargets.length)&&!(wantsType&&textTargets.length)){
  status('No compatible selected layers or no changes were supplied. Images cannot be recoloured; typography applies to text layers.','error');return;
 }
 // Capture the history snapshot before changing any layer so Undo restores every selected value.
 snap();let fillCount=0,strokeCount=0,textCount=0;
 if(fillValue!==null||fillAlpha!==null){for(const l of fillTargets){if(fillValue!==null){if(l.type==='svg')applyImportedSvgPaint(l,'fill',fillValue);else l.fill=fillValue;}if(fillAlpha!==null)l.fillAlpha=fillAlpha;fillCount++;}}
  if(strokeValue!==null||strokeAlpha!==null){for(const l of strokeTargets){if(strokeValue!==null){if(l.type==='svg')applyImportedSvgPaint(l,'stroke',strokeValue);else l.stroke=strokeValue;}if(strokeAlpha!==null)l.strokeAlpha=strokeAlpha;strokeCount++;}}
 if(wantsType){for(const l of textTargets){let familyChanged=false;if(family&&family!==l.fontFamily){l.fontFamily=family;familyChanged=true;}if(size!==null)l.fontSize=size;if(weight!==null)l.fontWeight=weight;if(spacing!==null)l.letterSpacing=spacing;if(familyChanged){l.pathMode=false;l.harfBuzz=false;l.fontData='';l.fontName='';fonts.delete(l.id);hbFonts.delete(l.id);}}textCount=textTargets.length;}
 render();persistBadgeDraft();const parts=[];if(fillCount)parts.push(`fill on ${fillCount}`);if(strokeCount)parts.push(`stroke on ${strokeCount}`);if(textCount)parts.push(`typography on ${textCount} text`);status(`Applied selection styles: ${parts.join(', ')} layer(s).`,'ok');
}
 function createAppearanceThinControl(host){
 const roots=selectedRoots();if(!roots.some(root=>['path','group'].includes(root.type)))return;
 const summary=storedThinSummary(roots),key=insetSelectionKey(roots);
 const active=pathInsetPreviewState&&pathInsetDraftIsCurrent(pathInsetPreviewState)&&sameInsetSelection(pathInsetPreviewState,roots);
 let direction=active?pathInsetPreviewState.direction:(summary.hasAny?(summary.isExpanded?'out':'in'):pathThicknessDirection);
 if(direction!=='out')direction='in';
 pathThicknessDirection=direction;pathInsetCornerJoin=active?.join||summary.join||pathInsetCornerJoin;pathOffsetCornerJoin=pathInsetCornerJoin;
 const rawInitialAmount=active?pathInsetPreviewState.amount:(summary.mixed?null:(summary.amount??0));
 const parsedInitialAmount=rawInitialAmount==null?null:Number(rawInitialAmount);
 const initialAmount=Number.isFinite(parsedInitialAmount)?Math.max(0,parsedInitialAmount):null;
 const formatAmount=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed.toFixed(6):'—';};
 const initialText=initialAmount===null?'':formatAmount(initialAmount);
 const panel=document.createElement('section');panel.className='bc-appearance-thin';panel.setAttribute('aria-label','Smart path thickness');
 const head=document.createElement('div');head.className='bc-appearance-thin-head';
 const label=document.createElement('label');
 label.textContent=active?`Previewing ${direction==='in'?'thinning':'thickening'}`:summary.mixed?'Mixed path thickness':summary.hasAny?(summary.isExpanded?'Applied thickening':'Applied thinning'):'Path thickness';
 label.htmlFor='bcPathInsetAmount';
 const amount=document.createElement('output');amount.id='bcPathInsetValue';amount.textContent=summary.mixed?'Mixed':formatAmount(initialAmount??0);amount.htmlFor='bcPathInsetAmount';head.append(label,amount);
 const modes=document.createElement('div');modes.className='bc-appearance-thin-modes';modes.setAttribute('role','group');modes.setAttribute('aria-label','Path thickness direction');
 const modeButtons={};
 [['in','Thin'],['out','Thicken']].forEach(([value,text])=>{
  const button=document.createElement('button');button.type='button';button.className='bc-btn';button.textContent=text;button.dataset.direction=value;button.setAttribute('aria-pressed',String(direction===value));
  if(direction===value)button.classList.add('active');modeButtons[value]=button;modes.append(button);
 });
 const valueRow=document.createElement('div');valueRow.className='bc-appearance-thin-value-row';
 const range=document.createElement('input');range.type='range';range.id='bcPathInsetRange';range.min='0';range.max=String(pathThicknessSliderMax(initialAmount??0));range.step=String(pathThicknessSliderStep(Number(range.max)));range.value=String(initialAmount??0);range.setAttribute('aria-label',direction==='in'?'Preview smart path thinning':'Preview smart path thickening');
 const valueWrap=document.createElement('div');valueWrap.className='bc-appearance-thin-value-wrap';
 const numeric=document.createElement('input');numeric.type='number';numeric.id='bcPathInsetAmount';numeric.min='0';numeric.removeAttribute('max');numeric.step='0.00001';numeric.value=initialText;numeric.placeholder=summary.mixed?'Mixed values':'';numeric.inputMode='decimal';numeric.setAttribute('aria-label',direction==='in'?'Path thickness (thinning)':'Path thickness (thickening)');numeric.title='Move the slider or enter an amount to preview from the retained original contour. Choose Apply to commit; choose 0 to restore the original.';
 const unit=document.createElement('small');unit.textContent='units';valueWrap.append(numeric,unit);valueRow.append(range,valueWrap);
 const corners=document.createElement('div');corners.className='bc-appearance-thin-corners';
 const cornerLabel=document.createElement('label');cornerLabel.textContent='Corners';cornerLabel.htmlFor='bcPathInsetCorners';
 const cornerSelect=document.createElement('select');cornerSelect.id='bcPathInsetCorners';cornerSelect.setAttribute('aria-label','Corners');
 [['miter','Smart · preserve original'],['bevel','Bevel'],['round','Round']].forEach(([v,t])=>{const option=document.createElement('option');option.value=v;option.textContent=t;cornerSelect.append(option);});cornerSelect.value=pathInsetCornerJoin;corners.append(cornerLabel,cornerSelect);
 const actions=document.createElement('div');actions.className='bc-appearance-thin-actions';
 const apply=document.createElement('button');apply.type='button';apply.className='bc-btn primary';
 const reset=document.createElement('button');reset.type='button';reset.className='bc-btn';reset.textContent='Reset preview';
 actions.append(apply,reset);
 const updateActionLabel=()=>{
  const raw=String(numeric.value??'').trim();
  if(!raw){apply.textContent=summary.mixed?'Apply to selected paths':(direction==='in'?'Apply thinning':'Apply thickening');return;}
  const value=Number(raw);
  if(!Number.isFinite(value)||value<0){apply.textContent='Apply thickness';return;}
  const sameModeApplied=summary.hasAny&&!summary.mixed&&((direction==='out')===summary.isExpanded);
  apply.textContent=value<=0&&summary.hasAny?'Restore original':sameModeApplied?(direction==='in'?'Update thinning':'Update thickening'):(direction==='in'?'Apply thinning':'Apply thickening');
 };
 const clearPreviewForNewSettings=()=>{
  cancelPathInsetDraftTimer(key);pathInsetPreviewDrafts.delete(key);if(insetSelectionKey()===key)pathInsetPreviewState=null;pathInsetPreviewTask++;pathInsetPreviewPendingRootId=null;renderCanvas();
 };
 const requestPreview=(v,preserveTypedValue=false,fromRange=false)=>{
  if(v===null||String(v).trim()===''||!Number.isFinite(Number(v)))return;
  const raw=Number(v);if(raw<0)return;
  const cachedLimit=direction==='in'?pathInsetSafeLimitState:pathExpansionSafeLimitState;
  const hasSafeLimit=cachedLimit?.signature===signature&&Number.isFinite(cachedLimit.max);
  const next=hasSafeLimit?Math.min(raw,cachedLimit.max):raw,wasClamped=Math.abs(raw-next)>1e-8;
  const existingMax=Number(range.max)||PATH_THICKNESS_SLIDER_MIN_MAX;
  const sliderCap=fromRange?existingMax:Math.max(existingMax,pathThicknessSliderMax(next));
  range.max=String(sliderCap);range.step=String(pathThicknessSliderStep(sliderCap));numeric.removeAttribute('max');range.value=String(Math.min(sliderCap,next));
  if(!preserveTypedValue||wasClamped)numeric.value=next.toFixed(6);
  amount.textContent=next.toFixed(6);updateActionLabel();schedulePathInsetPreview(next,direction);
 };
 const baseEntries=collectOffsetTargetsForRoots(roots).targets.map(layer=>({id:layer.id,d:thinSourcePathData(layer),fillRule:layer.fillRule||'nonzero'}));
 const signature=baseEntries.length?pathInsetEntriesSignature(baseEntries,pathInsetCornerJoin):'';
 const cached=direction==='in'?pathInsetSafeLimitState:pathExpansionSafeLimitState;
 if(cached?.signature===signature&&cached?.join===pathInsetCornerJoin){const sliderMax=pathThicknessSliderMax(cached.max);range.max=String(Math.max(Number(range.max)||0,sliderMax));range.step=String(pathThicknessSliderStep(Number(range.max)));}
 if(active){const shown=pathInsetPreviewState.amount,sliderMax=pathThicknessSliderMax(shown);range.max=String(Math.max(Number(range.max)||0,sliderMax));range.step=String(pathThicknessSliderStep(Number(range.max)));numeric.removeAttribute('max');}
 range.addEventListener('input',()=>requestPreview(range.value,false,true));
 range.addEventListener('change',()=>growPathThicknessSlider(range));
 numeric.addEventListener('input',()=>requestPreview(numeric.value,true,false));
 numeric.addEventListener('change',()=>requestPreview(numeric.value,false,false));
 Object.entries(modeButtons).forEach(([mode,button])=>button.addEventListener('click',()=>{
  if(mode===direction)return;
  const entered=Number(numeric.value),keep=Number.isFinite(entered)?Math.max(0,entered):Math.max(0,Number(initialAmount)||0);
  clearPreviewForNewSettings();direction=mode;pathThicknessDirection=mode;
  Object.entries(modeButtons).forEach(([v,b])=>{b.classList.toggle('active',v===mode);b.setAttribute('aria-pressed',String(v===mode));});
  const sliderMax=pathThicknessSliderMax(keep);range.max=String(sliderMax);range.step=String(pathThicknessSliderStep(sliderMax));range.value=String(keep);range.setAttribute('aria-label',mode==='in'?'Preview smart path thinning':'Preview smart path thickening');
  numeric.removeAttribute('max');numeric.value=keep.toFixed(6);numeric.setAttribute('aria-label',mode==='in'?'Path thickness (thinning)':'Path thickness (thickening)');
  label.textContent=summary.hasAny?(mode==='out'?'Previewing thickening':'Previewing thinning'):(mode==='out'?'Thicken path':'Thin path');
  amount.textContent=keep.toFixed(6);updateActionLabel();schedulePathInsetPreview(keep,mode);
 }));
 cornerSelect.addEventListener('change',()=>{
  const keep=Math.max(0,num(numeric.value,initialAmount??0));pathInsetCornerJoin=cornerSelect.value;pathOffsetCornerJoin=cornerSelect.value;pathInsetSafeLimitState=null;pathExpansionSafeLimitState=null;
  clearPreviewForNewSettings();range.max=String(Math.max(Number(range.max)||0,pathThicknessSliderMax(keep)));range.step=String(pathThicknessSliderStep(Number(range.max)));
  if(keep>0||summary.hasAny)schedulePathInsetPreview(keep,direction);
 });
 apply.addEventListener('click',()=>{
  if(numeric.value.trim()===''){status('Enter an amount before applying path thickness. The existing geometry has been kept.','warn');return;}
  applyPathOffset(direction,num(numeric.value,0));
 });
 reset.addEventListener('click',()=>resetPathInsetPreview());
 const hint=document.createElement('div');hint.className='bc-help';
 hint.textContent='The numeric amount accepts 0.00001-unit steps (five decimal places); the SVG path is retained at 8 decimal places. The slider is a coarse convenience control. There is no preset amount ceiling: enter any finite SVG-unit amount. Thin moves the contour inward; Thicken moves it outward. Both recalculate from the retained original path, not from the last result. Geometry checks automatically reduce an unsafe request to the largest safe amount rather than damaging narrow details or counters. Smart preserves existing curves and sharp corners; Bevel and Round affect newly created offset corners. Adjustments are shown as a live canvas preview and are not committed until Apply is clicked. Set the amount to 0 to restore the original contour.';
 const state=document.createElement('div');state.className='bc-help';state.id='bcPathInsetState';state.setAttribute('role','status');state.setAttribute('aria-live','polite');
 if(active){
  state.textContent='Live preview is active. Choose Apply to commit the preview.';
 }else if(summary.mixed){
  state.textContent='The selected paths have mixed thickness amounts, directions or corner settings. No single amount represents the whole selection. Select one path to inspect its individual setting, or enter a new amount to apply consistently.';
 }else if(summary.hasAny&&Number.isFinite(Number(summary.amount))){
  state.textContent=`Original path geometry is retained. Current applied operation: ${summary.isExpanded?'thickening':'thinning'} by ${formatAmount(summary.amount)} units.`;
 }else if(!summary.targets.length){
  state.textContent='No eligible editable paths were found in this selection. Select a closed filled path or a group containing editable paths.';
 }else{
  state.textContent='Select closed filled path artwork, then enter an amount or move the slider to preview it.';
 }
 panel.append(head,modes,valueRow,corners,actions,hint,state);host.append(panel);
 updateActionLabel();
 if(active){const max=pathInsetPreviewState.maxSafe??(cached?.signature===signature?cached.max:null);syncPathInsetControls(pathInsetPreviewState.amount,max,false,direction,Number(range.max));}
}

function renderInspectorContent(){
 const box=$('bcInspector');box.replaceChildren();const l=current();$('bcSelectedType').textContent=l?`${l.type}${selectedRoots().length>1?' · +'+(selectedRoots().length-1):''}`:'No selection';
 if(!l){box.innerHTML='<div class="bc-empty">Select a layer to edit its transform, geometry, typography or appearance.</div>';return;}
 const makeSection=(title,description,open=false)=>{const d=document.createElement('details');d.className='bc-inspector-group';d.open=open;const sum=document.createElement('summary');sum.textContent=title;const small=document.createElement('small');small.textContent=description;sum.append(small);const body=document.createElement('div');body.className='bc-inspector-group-body';d.append(sum,body);box.append(d);return body;};
 if(selectedIds.size>1){
  const targets=collectSelectedEditableLayers(),textTargets=targets.filter(v=>v.type==='text'),bulk=document.createElement('section');bulk.className='bc-bulk-panel';
  const title=document.createElement('div');title.className='bc-bulk-title';const ttl=document.createElement('span');ttl.textContent='Apply to selection';const badge=document.createElement('span');badge.className='bc-bulk-sub';badge.textContent=`${selectedIds.size} selected · ${targets.length} editable · ${textTargets.length} text`;title.append(ttl,badge);bulk.append(title);
  const help=document.createElement('div');help.className='bc-help';help.textContent='Choose the properties to change, then apply once. Fill/stroke affect compatible selected artwork; font settings affect every selected text layer, including text inside selected groups.';bulk.append(help);
  const grid=document.createElement('div');grid.className='bc-bulk-grid';let uiLabelSerial=0;
  const colorControl=(label,key,items,getter)=>{const wrap=document.createElement('div');wrap.className='bc-bulk-field';const lab=document.createElement('label');lab.textContent=label;const colorId=`bc-bulk-color-${++uiLabelSerial}`;lab.htmlFor=colorId;const row=document.createElement('div');row.className='bc-bulk-color';const picker=document.createElement('input');picker.type='color';picker.id=colorId;picker.setAttribute('aria-label',label+' picker');const text=document.createElement('input');text.type='text';text.setAttribute('aria-label',label+' value');const common=bulkCommonValue(items,getter);text.value=common;if(!common)text.placeholder='Mixed values';picker.value=/^#[0-9a-f]{6}$/i.test(common)?common:'#ffffff';picker.addEventListener('input',()=>text.value=picker.value);row.append(picker,text);const alphaKey=key+'Alpha',commonAlpha=bulkCommonValue(items,v=>v[alphaKey]??255),alphaMixed=commonAlpha==='',alphaRow=document.createElement('div');alphaRow.className='bc-bulk-alpha';const alpha=document.createElement('input');alpha.type='range';alpha.min='0';alpha.max='255';alpha.step='1';alpha.value=alphaMixed?'255':String(Math.max(0,Math.min(255,Number(commonAlpha))));alpha.setAttribute('aria-label',label+' alpha');const alphaValue=document.createElement('output');alphaValue.textContent=alphaMixed?'Mixed':Math.round(Number(alpha.value)/2.55)+'%';let alphaTouched=false;alpha.addEventListener('input',()=>{alphaTouched=true;alphaValue.textContent=Math.round(Number(alpha.value)/2.55)+'%';});alphaRow.append(alpha,alphaValue);wrap.append(lab,row,alphaRow);return{wrap,text,picker,alpha,get alphaTouched(){return alphaTouched;}};};
  const fillItems=targets.filter(v=>!['image','line'].includes(v.type));const strokeItems=targets.filter(v=>v.type!=='image');
  const fill= colorControl('Fill colour','fill',fillItems,v=>v.type==='svg'?(v.svgFillOverride?v.fill:svgLayerRepresentativePaint(v,'fill')):v.fill);
  const stroke=colorControl('Stroke colour','stroke',strokeItems,v=>v.type==='svg'?(v.svgStrokeOverride?v.stroke:svgLayerRepresentativePaint(v,'stroke')):v.stroke);
  grid.append(fill.wrap,stroke.wrap);
  const typography=document.createElement('div');typography.className='bc-bulk-panel';typography.style.margin='9px 0 0';const typetitle=document.createElement('div');typetitle.className='bc-bulk-title';typetitle.textContent='Text styling';const typebadge=document.createElement('span');typebadge.className='bc-bulk-sub';typebadge.textContent=`${textTargets.length} text layer(s)`;typetitle.append(typebadge);typography.append(typetitle);
  const tgrid=document.createElement('div');tgrid.className='bc-bulk-grid';
  const makeBulkInput=(label,key,type,items,getter,placeholder='Mixed values')=>{const w=document.createElement('div');w.className='bc-bulk-field';const lab=document.createElement('label');lab.textContent=label;const bulkId=`bc-bulk-input-${++uiLabelSerial}`;lab.htmlFor=bulkId;const input=document.createElement('input');input.type=type;input.id=bulkId;input.setAttribute('aria-label',label+' for selected text');const common=bulkCommonValue(items,getter);input.value=common;if(!common)input.placeholder=placeholder;w.append(lab,input);tgrid.append(w);return input;};
  const family=makeBulkInput('Font family','fontFamily','text',textTargets,v=>v.fontFamily||'');family.maxLength=256;const size=makeBulkInput('Font size','fontSize','number',textTargets,v=>v.fontSize??'');size.min='1';size.max='1000';size.step='0.1';const weight=makeBulkInput('Font weight','fontWeight','number',textTargets,v=>v.fontWeight??'');weight.min='100';weight.max='900';weight.step='100';const spacing=makeBulkInput('Letter spacing','letterSpacing','number',textTargets,v=>v.letterSpacing??'');spacing.min='-1000';spacing.max='1000';spacing.step='0.1';[family,size,weight,spacing].forEach(el=>{el.disabled=!textTargets.length;});
  typography.append(tgrid);const typetip=document.createElement('div');typetip.className='bc-help';typetip.style.marginTop='7px';typetip.textContent='Applying a different family switches selected text to live text and clears its previous embedded outline font. Upload the new font to outline it again.';typography.append(typetip);
  const actions=document.createElement('div');actions.className='bc-bulk-actions';const apply=document.createElement('button');apply.className='bc-btn primary';apply.type='button';apply.textContent='Apply to selected';apply.disabled=!targets.length;apply.onclick=()=>{try{applyBulkSelectionStyles({fill:fill.text.value,stroke:stroke.text.value,fillAlpha:fill.alphaTouched?Number(fill.alpha.value):undefined,strokeAlpha:stroke.alphaTouched?Number(stroke.alpha.value):undefined,fontFamily:family.value,fontSize:size.value,fontWeight:weight.value,letterSpacing:spacing.value});}catch(err){status('Could not apply selection styles: '+err.message,'error');}};actions.append(apply);bulk.append(grid,typography,actions);box.append(bulk);
 }
 let inspectorFieldSerial=0;const field=(label,key,type='number',opts={})=>{const w=document.createElement('div');w.className='bc-field';const lab=document.createElement('label');lab.textContent=label;const sourceValue=l.type==='svg'&&['linecap','linejoin'].includes(key)?svgLayerStrokeControlValue(l,key):(l[key]??'');let actual;if(opts.options){actual=document.createElement('select');const optionList=sourceValue==='__mixed__'?[['__mixed__','Mixed (SVG source)'],...opts.options]:opts.options;optionList.forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;actual.append(o);});actual.value=sourceValue??'';}else{actual=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')actual.type=type;actual.value=sourceValue??'';if(opts.min!==undefined)actual.min=opts.min;if(opts.max!==undefined)actual.max=opts.max;if(opts.step!==undefined)actual.step=opts.step;}const fieldId=`bc-inspector-field-${++inspectorFieldSerial}`;actual.id=fieldId;actual.setAttribute('aria-label',label);lab.htmlFor=fieldId;
  let before=null;const initial=String(sourceValue??'');let dirty=false;
  const beginEdit=()=>{if(before===null)before=badgeInspectorHistorySnapshot();};
  const read=()=>{let v=actual.value;if(type==='number')v=num(v);if(key==='name'&&!String(v).trim())v=l.name;if(key==='opacity'||key==='fillOpacity'||key==='strokeOpacity')v=Math.max(0,Math.min(1,num(v)));if(key==='lineSpacing')v=Math.max(.5,Math.min(4,num(v)));if(key==='scaleX'||key==='scaleY')v=Math.max(.01,Math.min(10000,num(v,100)));return v;};
  // Capture only when a real edit starts, not when a field is merely focused.
  actual.addEventListener('input',()=>{if(['number','color','text','textarea'].includes(type)){
   beginEdit();
   // An empty numeric field is a normal intermediate editing state. Do not turn it
   // into zero while the user is replacing a value (font size, radius, dimensions).
   if(type==='number'&&actual.value.trim()===''){dirty=true;return;}
   if(key==='d')clearStoredThinning(l);l[key]=read();dirty=true;renderCanvas();
  }});
  actual.addEventListener('change',()=>{
   beginEdit();let v=read();
   if(type==='number'){
    const min=opts.min!==undefined?Number(opts.min):-Infinity,max=opts.max!==undefined?Number(opts.max):Infinity;
    if(!Number.isFinite(v))v=Number.isFinite(Number(initial))?Number(initial):0;
    v=Math.max(min,Math.min(max,v));actual.value=String(v);
   }
   l[key]=v;
   if(l.type==='svg'&&key==='linecap')l.svgLinecapOverride=true;
   if(l.type==='svg'&&key==='linejoin')l.svgLinejoinOverride=true;
   if(l.type==='group'&&(key==='linecap'||key==='linejoin')){
    for(const child of allLayers(l.children||[])){
     if(isEffectivelyLocked(child)||child.type==='image')continue;
     child[key]=v;
     if(child.type==='svg')child[key==='linecap'?'svgLinecapOverride':'svgLinejoinOverride']=true;
    }
   }
   finishBadgeInspectorHistory(before);before=null;dirty=false;
   persistBadgeDraft();if(key==='name')renderList();renderCanvas();
   if(['fillType','textPathId','harfBuzz'].includes(key))requestAnimationFrame(renderInspector);
  });
  w.append(lab,actual);return w;
 };
 const colorField=(label,key)=>{const w=document.createElement('div');w.className='bc-field';const lab=document.createElement('label');lab.textContent=label;const pickerId=`bc-color-${++inspectorFieldSerial}`;lab.htmlFor=pickerId;const wrap=document.createElement('div');wrap.className='bc-color-control';const picker=document.createElement('input');picker.type='color';picker.id=pickerId;picker.setAttribute('aria-label',label+' colour picker');const alphaKey=key+'Alpha';const overrideKey='svg'+key[0].toUpperCase()+key.slice(1)+'Override';const sourceValue=String(l.type==='svg'&&!l[overrideKey]?svgLayerRepresentativePaint(l,key):(l[key]??'none'));const mixedSource=sourceValue==='__mixed__'||sourceValue==='__embedded__';const initialColor=mixedSource?sourceValue:(isSafeCssColor(sourceValue,true)?sourceValue:'none');picker.value=/^#[0-9a-f]{6}$/i.test(initialColor)?initialColor:'#ffffff';const text=document.createElement('input');text.type='text';text.setAttribute('aria-label',label+' colour value');text.value=mixedSource?'':initialColor;text.placeholder=mixedSource?'Mixed / SVG-defined colour':'';if(!Number.isFinite(Number(l[alphaKey])))l[alphaKey]=255;const alphaRow=document.createElement('div');alphaRow.className='bc-color-alpha';const alpha=document.createElement('input');alpha.type='range';alpha.min='0';alpha.max='255';alpha.step='1';alpha.value=String(Math.max(0,Math.min(255,Number(l[alphaKey]))));alpha.setAttribute('aria-label',label+' alpha');const alphaValue=document.createElement('output');const alphaLabel=()=>Math.round(Number(alpha.value)/2.55)+'%';alphaValue.textContent=alphaLabel();let before=null,committedColor=initialColor,draftColor=initialColor,alphaDirty=false;
  const beginColorEdit=()=>{if(before===null)before=badgeInspectorHistorySnapshot();};
  const finishColorEdit=()=>{const snapshot=before;before=null;return finishBadgeInspectorHistory(snapshot);};
  const applyColor=value=>{if(l.type==='svg')applyImportedSvgPaint(l,key,value);else l[key]=value;};
  const syncEnabled=()=>{alpha.disabled=String(committedColor).trim().toLowerCase()==='none';};
  const commit=()=>{beginColorEdit();const raw=String(draftColor).trim();if(mixedSource&&!raw){if(alphaDirty){l[alphaKey]=Math.max(0,Math.min(255,Math.round(Number(alpha.value)||0)));finishColorEdit();persistBadgeDraft();alphaDirty=false;}else before=null;syncEnabled();renderCanvas();return;}if(!isSafeCssColor(raw,true)){text.value=committedColor.startsWith('__')?'':committedColor;draftColor=committedColor;picker.value=/^#[0-9a-f]{6}$/i.test(committedColor)?committedColor:'#ffffff';const alphaChanged=alphaDirty;alphaDirty=false;if(alphaChanged){l[alphaKey]=Math.max(0,Math.min(255,Math.round(Number(alpha.value)||0)));finishColorEdit();persistBadgeDraft();}else before=null;status('Invalid colour. The last valid value was kept. Use #RGB, #RGBA, #RRGGBB, #RRGGBBAA or a supported CSS colour.','error');syncEnabled();renderCanvas();return;}
   const colourChanged=raw!==committedColor;if(colourChanged)applyColor(raw);const changed=colourChanged||alphaDirty;if(changed){committedColor=raw;finishColorEdit();persistBadgeDraft();}else before=null;text.value=committedColor.startsWith('__')?'':committedColor;draftColor=committedColor;picker.value=/^#[0-9a-f]{6}$/i.test(committedColor)?committedColor:'#ffffff';alphaDirty=false;syncEnabled();renderCanvas();
  };
  // Color history starts on the first actual input/change, not on focus or pointerdown.
  picker.addEventListener('input',()=>{beginColorEdit();draftColor=picker.value;text.value=draftColor;text.placeholder='';applyColor(draftColor);renderCanvas();});
  text.addEventListener('input',()=>{beginColorEdit();draftColor=text.value;});
  alpha.addEventListener('input',()=>{beginColorEdit();l[alphaKey]=Math.max(0,Math.min(255,Math.round(Number(alpha.value)||0)));alphaValue.textContent=alphaLabel();alphaDirty=true;renderCanvas();});
  text.addEventListener('change',commit);picker.addEventListener('change',commit);alpha.addEventListener('change',commit);syncEnabled();alphaRow.append(alpha,alphaValue);wrap.append(picker,text,alphaRow);w.append(lab,wrap);return w;};
  const row=(...nodes)=>{const d=document.createElement('div');d.className='bc-row';nodes.forEach(n=>d.append(n));return d;};const row3=(...nodes)=>{const d=document.createElement('div');d.className='bc-row3';nodes.forEach(n=>d.append(n));return d;};
 // Transform and layer management
 const transform=makeSection('Transform & layer','Position, rotation, scale and state',true);
 transform.append(field('Layer name','name','text'));
 transform.append(row3(field('X','x','number'),field('Y','y','number'),field('Rotation °','rotate','number')));
 transform.append(row(field('Scale X %','scaleX','number',{min:.01,max:10000}),field('Scale Y %','scaleY','number',{min:.01,max:10000})));
 const stateRow=document.createElement('div');stateRow.className='bc-pillrow';
 const vis=document.createElement('label');vis.className='bc-check';const vi=document.createElement('input');vi.type='checkbox';vi.checked=l.visible;vi.dataset.allowWhenLocked='true';vi.onchange=()=>{snap();l.visible=vi.checked;render();};vis.append(vi,'Visible');
 const lock=document.createElement('label');lock.className='bc-check';const li=document.createElement('input');li.type='checkbox';li.checked=l.locked;li.disabled=hasLockedAncestor(l);li.dataset.allowWhenLocked='true';li.onchange=()=>{snap();l.locked=li.checked;render();};lock.append(li,'Locked');stateRow.append(vis,lock);
 const del=document.createElement('button');del.className='bc-btn bc-danger';del.type='button';del.textContent='Delete layer';del.onclick=()=>deleteLayerById(l.id);stateRow.append(del);transform.append(stateRow);
 // Geometry section: shape parameters, path editor and imported artwork information
 const hasGeometry=['circle','ellipse','rect','line','image','svg','group','path'].includes(l.type);
 if(hasGeometry){const geometry=makeSection('Geometry','Dimensions and vector structure',['path','svg','image'].includes(l.type));
  if(l.type==='circle')geometry.append(field('Radius','r','number',{min:.1}));
  if(l.type==='ellipse')geometry.append(row(field('Radius X','rx','number',{min:.1}),field('Radius Y','ry','number',{min:.1})));
  if(['rect','image','svg','group'].includes(l.type))geometry.append(row(field('Width','w','number',{min:1}),field('Height','h','number',{min:1})));
  if(l.type==='rect')geometry.append(field('Corner radius','rx','number',{min:0}));
  if(l.type==='line')geometry.append(row(field('End X','x2','number'),field('End Y','y2','number')));
  if(l.type==='path'){
   const bake=document.createElement('button');bake.className='bc-btn';bake.type='button';bake.textContent='Bake position / rotation / scale into path';bake.onclick=()=>bakeSelectedPathTransform();geometry.append(bake);
   if(l.generatedShape){const params=document.createElement('div');params.className='bc-pop';const heading=document.createElement('div');heading.className='bc-muted';heading.textContent=l.generatedShape==='star'?'Star geometry':'Polygon geometry';params.append(heading);const makeParam=(label,key,min,max,step=1)=>{const wrap=document.createElement('div');wrap.className='bc-field';const lab=document.createElement('label');lab.textContent=label;const input=document.createElement('input');input.type='number';input.min=min;input.max=key==='shapeInnerRadius'?Math.max(min,l.shapeRadius*.9):max;input.step=step;input.value=l[key];input.dataset.shapeParam=key;input.addEventListener('change',()=>{const before=captureHistoryEntry();const limit=key==='shapeInnerRadius'?Math.max(min,l.shapeRadius*.9):max;const next=Math.max(min,Math.min(limit,num(input.value,l[key])));if(next!==l[key]){pushHistoryEntry(before);if(key==='shapeRadius'&&l.generatedShape==='star'){const inner=params.querySelector('[data-shape-param=shapeInnerRadius]');const cap=Math.max(.1,l.shapeRadius*.9);if(l.shapeInnerRadius>cap)l.shapeInnerRadius=cap;if(inner){inner.max=cap;inner.value=l.shapeInnerRadius;}}}else releaseHistoryEntry(before);l[key]=key==='shapeSides'?Math.round(next):next;clearStoredThinning(l);l.d=regularShapePath(l.shapeSides,l.shapeRadius,l.generatedShape==='star'?l.shapeInnerRadius:0);render();});wrap.append(lab,input);params.append(wrap);return input;};makeParam('Sides / points','shapeSides',3,32,1);makeParam('Outer radius','shapeRadius',1,500,.5);if(l.generatedShape==='star')makeParam('Inner radius','shapeInnerRadius',.1,500,.5);geometry.append(params);}
   geometry.append(field('SVG path data (d)','d','textarea'));
   const pv=document.createElement('div');pv.className='bc-path-tools';const validate=document.createElement('button');validate.className='bc-btn';validate.textContent='Validate path';const edit=document.createElement('button');edit.className='bc-btn';edit.textContent=pathEditId===l.id?'Close node editor':'Edit nodes on canvas';if(pathEditId===l.id)edit.classList.add('bc-path-edit-active');edit.onclick=()=>{try{if(pathEditId===l.id){pathEditId=null;status('Path node editor closed.');}else{if(isEffectivelyLocked(l)){status('This path is locked directly or by a locked parent. Unlock it before editing nodes.','warn');return;}parseEditablePath(l.d||'');pathEditId=l.id;status('Drag the blue anchor nodes or gold Bezier handles.','ok');}renderCanvas();requestAnimationFrame(renderInspector);}catch(err){status('Path node editor: '+err.message,'error');}};
   const info=document.createElement('span');info.className='bc-help';validate.onclick=()=>{let holder,test;try{const segs=parseEditablePath(l.d||'');holder=svgEl('svg',{width:1,height:1,viewBox:'0 0 1 1'});holder.style.cssText='position:absolute;left:-10000px;top:-10000px;visibility:hidden;overflow:visible';test=svgEl('path',{d:l.d||''},holder);document.body.append(holder);const length=test.getTotalLength(),bb=test.getBBox();info.textContent=`Valid path · ${segs.length} segments · ${length.toFixed(1)} units · ${bb.width.toFixed(1)} × ${bb.height.toFixed(1)} bounds`;info.style.color='#8dd9b1';}catch(err){info.textContent=err.message||'Path could not be parsed.';info.style.color='#ff9e9e';}finally{holder?.remove();}};pv.append(validate,edit,info);geometry.append(pv);
   if(pathEditId===l.id){const hint=document.createElement('div');hint.className='bc-help';hint.textContent='Blue circles are anchors. Gold circles are Bézier handles. Drag them directly on the artboard.';geometry.append(hint);}
  }
  if(l.type==='svg'){const note=document.createElement('p');note.className='bc-help';note.textContent='This SVG component uses embedded SVG rendering to preserve advanced features that are not yet editable as native paths. Compatible sibling components can still be edited separately.';geometry.append(note);if(l.typography){const t=l.typography,meta=document.createElement('div');meta.className='bc-pop';meta.innerHTML=`<strong style="font-size:10px">Typography metadata available</strong><div class="bc-help">${esc(t.text||'Outlined text')} · ${esc(t.fontFamily||'Unknown font')} · ${Number(t.fontSize||0).toFixed(2)} px<br>Baseline Y ${Number(t.baselineY).toFixed(2)} · Cap height ${Number(t.capHeight).toFixed(2)} · X-height ${Number(t.xHeight||0).toFixed(2)}</div>`;geometry.append(meta);}else{const meta=document.createElement('div');meta.className='bc-help';meta.textContent='This SVG has no typography metadata. A flattened path does not reliably reveal its original text, font size or baseline. Regenerate it from Text to SVG to retain baseline/cap/x-height guides.';geometry.append(meta);}}
  if(l.type==='group'){const note=document.createElement('p');note.className='bc-help';note.textContent=`${(l.children||[]).length} direct child layers. Edit children from the Layers panel. Complex transformed groups cannot always be ungrouped losslessly.`;geometry.append(note);}
  if(l.type==='image'){const note=document.createElement('p');note.className='bc-help';note.textContent='Image data is embedded in this project. Use Replace image to change its source.';geometry.append(note);}
 }
 // Typography section
 if(l.type==='text'){
  const typography=makeSection('Typography','Text content, font and shaping',true);
  typography.append(field('Text content','text','textarea'));
  typography.append(field('Font family','fontFamily','text'));
  typography.append(row3(field('Font size','fontSize','number',{min:1,max:1000}),field('Weight','fontWeight','number',{min:100,max:900,step:100}),field('Letter spacing','letterSpacing','number',{step:.1})));
  typography.append(row(field('Line spacing ×','lineSpacing','number',{min:.5,max:4,step:.05}),field('Baseline','baseline','select',{options:[['alphabetic','Alphabetic'],['hanging','Hanging'],['middle','Middle'],['central','Central'],['text-before-edge','Text before edge'],['text-after-edge','Text after edge']]})));
  const pathOptions=[['','Straight text'],...allLayers().filter(v=>v.type==='path'&&v.id!==l.id).map(v=>[v.id,v.name||'Path'])];
  typography.append(field('Text path','textPathId','select',{options:pathOptions}));
  if(l.textPathId){typography.append(field('Start offset (%)','textPathOffset','number',{min:0,max:100,step:.5}));const pathHint=document.createElement('div');pathHint.className='bc-help';pathHint.textContent='Text follows the selected path. The path remains a separate editable layer and can be hidden independently.';typography.append(pathHint);}
  const layoutHint=document.createElement('div');layoutHint.className='bc-help';layoutHint.textContent='Use line breaks for multiple lines. Line spacing is a multiplier of font size. Baseline controls the first line’s vertical reference.';typography.append(layoutHint);
  const actions=document.createElement('div');actions.className='bc-pillrow';const upload=document.createElement('button');upload.className='bc-btn';upload.textContent='Load font';upload.onclick=()=>$('bcFontFile').click();const convert=document.createElement('button');convert.className='bc-btn';convert.textContent=l.pathMode?'Use live text':'Convert to path';convert.disabled=!fonts.has(l.id)&&!l.pathMode;convert.onclick=()=>{snap();l.pathMode=!l.pathMode;render();status(l.pathMode?'Text path rendering enabled.':'Live text restored.','ok');};actions.append(upload,convert);typography.append(actions);
  const shelf=getProjectFontShelf().filter(f=>f.id!==l.id);if(shelf.length){const shelfWrap=document.createElement('div');shelfWrap.className='bc-field';const shelfLabel=document.createElement('label');shelfLabel.textContent='Reuse a font from this project';const shelfRow=document.createElement('div');shelfRow.className='bc-row';const shelfSelect=document.createElement('select');shelf.forEach(f=>{const o=document.createElement('option');o.value=f.id;o.textContent=f.name;shelfSelect.append(o);});const applyFont=document.createElement('button');applyFont.className='bc-btn';applyFont.textContent='Apply';applyFont.onclick=async()=>{const source=findLayer(shelfSelect.value);if(!source?.fontData)return;try{const ot=await ensureOpenType(),bytes=base64ToBuffer(source.fontData),parsed=ot.parse(bytes);snap();l.fontData=source.fontData;l.fontName=source.fontName||source.fontFamily;l.fontFamily=source.fontFamily||l.fontName;l.pathMode=true;fonts.set(l.id,parsed);if(source.harfBuzz){try{const hb=await ensureHB(),face=new hb.Face(new hb.Blob(bytes)),font=new hb.Font(face);font.setScale(face.upem,face.upem);hbFonts.set(l.id,{face,font});l.harfBuzz=true;l.hbAxisValues={...(source.hbAxisValues||{})};}catch(_){l.harfBuzz=false;}}else{l.harfBuzz=false;hbFonts.delete(l.id);}render();status(`Applied ${l.fontName} to this text layer.`,'ok');}catch(err){status('Could not reuse font: '+err.message,'error');}};shelfRow.append(shelfSelect,applyFont);shelfWrap.append(shelfLabel,shelfRow);typography.append(shelfWrap);}
  const fontStatus=document.createElement('div');fontStatus.className='bc-help';fontStatus.textContent=fonts.has(l.id)?`Font loaded: ${l.fontName||'Custom font'}. Embedded in this project.`:'Load a TTF/OTF/WOFF font for exact OpenType path conversion.';typography.append(fontStatus);
  const hbRow=document.createElement('label');hbRow.className='bc-check';const hbCheck=document.createElement('input');hbCheck.type='checkbox';hbCheck.checked=!!l.harfBuzz;hbCheck.disabled=!l.fontData;hbCheck.addEventListener('change',async()=>{try{snap();if(hbCheck.checked){const hb=await ensureHB(),bytes=base64ToBuffer(l.fontData),face=new hb.Face(new hb.Blob(bytes)),hfont=new hb.Font(face);hfont.setScale(face.upem,face.upem);hbFonts.set(l.id,{face,font:hfont});l.harfBuzz=true;l.pathMode=true;status('HarfBuzz text shaping enabled.','ok');}else{l.harfBuzz=false;hbFonts.delete(l.id);status('HarfBuzz shaping disabled.','ok');}render();}catch(err){hbCheck.checked=false;l.harfBuzz=false;status('HarfBuzz unavailable: '+err.message,'error');}});hbRow.append(hbCheck,'Use HarfBuzz shaping');typography.append(hbRow);
  if(l.harfBuzz){typography.append(field('Script tag','hbScript','text'));typography.append(field('Language tag','hbLanguage','text'));typography.append(field('Direction','hbDirection','select',{options:[['ltr','Left to right'],['rtl','Right to left'],['ttb','Top to bottom']]}));const hb=hbFonts.get(l.id);if(hb?.face){const axes=Object.values(hb.face.getAxisInfos?.()||{});if(axes.length){const axisBox=document.createElement('div');axisBox.className='bc-pop';const title=document.createElement('div');title.className='bc-muted';title.textContent='Variable font axes';axisBox.append(title);axes.forEach(a=>{const wrap=document.createElement('div');wrap.className='bc-field';const label=document.createElement('label');label.textContent=a.name||a.tag;const range=document.createElement('input');range.type='range';range.min=a.min;range.max=a.max;range.step=(a.max-a.min)/500||1;range.value=l.hbAxisValues?.[a.tag]??a.default;range.addEventListener('input',()=>{l.hbAxisValues=l.hbAxisValues||{};l.hbAxisValues[a.tag]=Number(range.value);const variations=axes.map(v=>new hbModule.Variation(v.tag,Number(l.hbAxisValues[v.tag]??v.default)));hb.font.setVariations(variations);renderCanvas();});wrap.append(label,range);axisBox.append(wrap);});typography.append(axisBox);}}}
  const anchor=field('Text alignment','anchor','select',{options:[['start','Left'],['middle','Center'],['end','Right']]});typography.append(anchor);
 }
 // Appearance is always separated from transform and geometry.
 const appearance=makeSection('Appearance','Fill, stroke, opacity and effects',false);
 if(l.type!=='line'){
  appearance.append(colorField('Fill colour or none','fill'));
  appearance.append(field('Fill mode','fillType','select',{options:[['solid','Solid'],['linear','Linear gradient'],['radial','Radial gradient']]}));
  if(l.fillType!=='solid')appearance.append(row(colorField('Second colour','fill2'),field('Gradient angle °','gradientAngle','number')));
 }else appearance.append(colorField('Line colour','stroke'));
 if(l.type!=='line')appearance.append(colorField('Stroke colour or none','stroke'));
 appearance.append(row(field('Stroke width','strokeWidth','number',{min:0,step:.25}),field('Opacity 0–1','opacity','number',{min:0,max:1,step:.05})));
 createAppearanceThinControl(appearance);
 appearance.append(row(field('Fill opacity','fillOpacity','number',{min:0,max:1,step:.05}),field('Stroke opacity','strokeOpacity','number',{min:0,max:1,step:.05})));
 appearance.append(row(field('Line cap','linecap','select',{options:[['butt','Butt'],['round','Round'],['square','Square']]}),field('Line join','linejoin','select',{options:[['match-thin','Match path thickness corners'],['miter','Miter'],['round','Round'],['bevel','Bevel']]})));
 appearance.append(field('Stroke dash pattern','strokeDasharray','text'));
 const shadow=document.createElement('label');shadow.className='bc-check';const sh=document.createElement('input');sh.type='checkbox';sh.checked=!!l.shadow;sh.onchange=()=>{snap();l.shadow=sh.checked;render();};shadow.append(sh,'Soft drop shadow');appearance.append(shadow);
 // Spacing controls are advanced and no longer mixed into the default property dump.
 const spacing=makeSection('Optical spacing','Manual gap corrections for layout',false);
 spacing.append(row(field('Gap after → X','opticalGapX','number',{min:-1000,max:1000,step:.5}),field('Gap after ↓ Y','opticalGapY','number',{min:-1000,max:1000,step:.5})));
 const hint=document.createElement('div');hint.className='bc-help';hint.textContent='Signed outgoing corrections are applied only when optical gap adjustment is enabled in Layout & alignment. This is manual visual tuning, not automatic optical kerning.';spacing.append(hint);
 if(l.type==='image'){
  const replace=document.createElement('button');replace.className='bc-btn';replace.textContent='Replace image…';replace.onclick=()=>{imageReplaceTargetId=l.id;$('bcImageFile').click();};const note=document.createElement('div');note.className='bc-help';note.textContent='The image is embedded in the editable project. Its raw data URL is intentionally hidden.';const geometry=box.querySelector('.bc-inspector-group:nth-child(2) .bc-inspector-group-body');geometry?.append(replace,note);
 }
 if(l.type==='svg'){
  const note=document.createElement('div');note.className='bc-help';note.textContent='The imported vector source is retained safely as embedded SVG. Advanced child-level editing is available only when the importer can decompose the source without losing definitions.';const geometry=box.querySelector('.bc-inspector-group:nth-child(2) .bc-inspector-group-body');geometry?.append(note);
 }
 if(isEffectivelyLocked(l)){
  const lockNotice=document.createElement('div');lockNotice.className='bc-lock-notice';lockNotice.setAttribute('role','status');lockNotice.textContent=hasLockedAncestor(l)?'This layer is inside a locked parent group. Unlock the parent group to edit its contents. Visibility can still be changed.':'This layer is locked. Unlock it above to edit its properties.';
  box.prepend(lockNotice);
  box.querySelectorAll('input,select,textarea,button').forEach(control=>{if(control.dataset.allowWhenLocked!=='true')control.disabled=true;});
 }
}
function renderInspector(){
 try{
 activatePathInsetDraftForSelection();
 const box=$('bcInspector');if(!box){renderInspectorContent();return;}
 const openSections=new Map([...box.querySelectorAll('details.bc-inspector-group')].map(d=>[String(d.querySelector('summary')?.firstChild?.textContent||'').trim(),d.open]));
 const scrollPositions=[];for(let node=box;node;node=node.parentElement){if(node.scrollHeight>node.clientHeight+2)scrollPositions.push([node,node.scrollTop]);}
 const active=document.activeElement,focusState=active&&box.contains(active)?{id:active.id||'',aria:active.getAttribute?.('aria-label')||'',name:active.getAttribute?.('name')||'',type:active.type||'',start:typeof active.selectionStart==='number'?active.selectionStart:null,end:typeof active.selectionEnd==='number'?active.selectionEnd:null}:null;
 renderInspectorContent();
 for(const d of box.querySelectorAll('details.bc-inspector-group')){const key=String(d.querySelector('summary')?.firstChild?.textContent||'').trim();if(openSections.has(key))d.open=openSections.get(key);}
 for(const [node,value] of scrollPositions)if(node.isConnected)node.scrollTop=value;
 if(focusState){let target=null;if(focusState.id)target=box.querySelector('#'+CSS.escape(focusState.id));if(!target&&focusState.aria)target=[...box.querySelectorAll('[aria-label]')].find(el=>el.getAttribute('aria-label')===focusState.aria);if(!target&&focusState.name)target=box.querySelector(`[name="${CSS.escape(focusState.name)}"]`);if(target){try{target.focus({preventScroll:true});if(focusState.start!==null&&typeof target.setSelectionRange==='function')target.setSelectionRange(focusState.start,focusState.end);}catch(_){}}}
 }catch(error){
  // Inspector content is secondary to the document itself. A malformed or
  // unexpected property must never prevent the canvas/history/draft from
  // updating. Keep a visible recovery message and retain the console trace.
  console.error('Badge inspector rendering failed; document rendering continued:',error);
  const box=$('bcInspector');
  if(box){box.replaceChildren();const notice=document.createElement('div');notice.className='bc-empty';notice.setAttribute('role','alert');notice.textContent='The Properties panel could not display this selection. The artwork and document remain available. Reselect the layer or reload the project. See the browser console for details.';box.append(notice);}
  try{status('Properties panel encountered an unexpected value. The canvas remains available; see the browser console for details.','warn');}catch(_){}
 }
}
function render(){renderList();renderInspector();renderCanvas();updateBadgeTypographyPanel();updateHistory();persistBadgeDraft();}
function loadPreset(name){snap();let a=[];if(name==='bluray'){W=48;H=14;a=[makeLayer('circle',{name:'BluRay outer ring',x:4,y:2,r:4.2,fill:'none',stroke:'#FFFFFF',strokeWidth:1}),makeLayer('circle',{name:'BluRay center dot',x:7.8,y:5.8,r:1.2,fill:'#FFFFFF'}),makeLayer('text',{name:'BluRay',text:'BluRay',x:17,y:10.5,fontSize:9,fontWeight:500,fill:'#FFFFFF'})];}
 const dolbySymbol=()=>[makeLayer('path',{name:'Dolby left D',x:4,y:3,d:'M0 0 L2.2 0 A3 4 0 0 1 2.2 8 L0 8 Z',fill:'#FFFFFF'}),makeLayer('path',{name:'Dolby right D',x:15,y:3,d:'M0 0 L-2.2 0 A3 4 0 0 0 -2.2 8 L0 8 Z',fill:'#FFFFFF'})];
 if(name==='dolbyVision'||name==='dolbyAtmos'){W=name==='dolbyVision'?72:74;H=14;a=[...dolbySymbol(),makeLayer('text',{name:'Dolby',text:'Dolby',x:18,y:10.5,fontSize:9,fontWeight:500,fill:'#FFFFFF'}),makeLayer('text',{name:name==='dolbyVision'?'Vision':'Atmos',text:name==='dolbyVision'?'Vision':'Atmos',x:43.7,y:10.5,fontSize:9,fontWeight:300,opacity:.92,fill:'#FFFFFF'})];}
 if(name==='dolbyDigital'){W=78;H=14;a=[...dolbySymbol(),makeLayer('text',{name:'Dolby Digital+',text:'Dolby Digital+',x:18,y:10.5,fontSize:9,fontWeight:500,fill:'#FFFFFF'})];}
 if(name==='empty'){W=320;H=90;a=[];}
 layers=a;pathEditId=null;fonts.clear();hbFonts.clear();selectedId=a[0]?.id||null;selectedIds=new Set(selectedId?[selectedId]:[]);render();fitStage();status(`Loaded ${name==='empty'?'blank canvas':name+' template'}.`,'ok');}
$('bcPresetMenu').addEventListener('click',()=>{const name=$('bcPresetSelect').value;if(!name){status('Choose a template first.','error');return;}loadPreset(name);$('bcPresetSelect').value='';});
$('bcSaveTemplate').addEventListener('click',saveBadgeTemplate);$('bcLoadTemplate').addEventListener('click',loadBadgeTemplate);$('bcDeleteTemplate').addEventListener('click',deleteBadgeTemplate);$('bcExportTemplate').addEventListener('click',()=>{try{downloadBadgeTemplate(currentBadgeTemplateRecord($('bcTemplateName').value.trim()||'badge-template'));status('Portable template JSON downloaded, including embedded fonts and images.','ok');}catch(err){status('Template download failed: '+err.message,'error');}});$('bcImportTemplate').addEventListener('click',()=>$('bcTemplateFile').click());$('bcTemplateFile').addEventListener('change',async e=>{await importBadgeTemplateFile(e.target.files?.[0]);e.target.value='';});$('bcSavedTemplateSelect').addEventListener('change',()=>{$('bcDeleteTemplate').disabled=!$('bcSavedTemplateSelect').value;});$('bcTemplateName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveBadgeTemplate();}});refreshBadgeTemplateList();
document.querySelectorAll('[data-generated]').forEach(b=>b.addEventListener('click',()=>addGeneratedShape(b.dataset.generated)));
document.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>{const type=b.dataset.add;if(type==='image'){imageReplaceTargetId=null;$('bcImageFile').click();return;}const defaults={text:{text:'New text',x:W/2,y:H/2,fontSize:18,fill:'#FFFFFF'},path:{x:12,y:12,fill:'#FFFFFF'},circle:{x:12,y:12,r:6,fill:'#FFFFFF'},rect:{x:12,y:12,w:40,h:24,fill:'#FFFFFF'},ellipse:{x:12,y:12,rx:14,ry:8,fill:'#FFFFFF'},line:{x:12,y:12,x2:55,y2:12,stroke:'#FFFFFF'}};add(type,defaults[type]);}));
function getLayerNode(id){const stage=$('bcCanvasLayers');if(!stage)return null;return [...stage.querySelectorAll('[data-layer-id]')].find(n=>n.getAttribute('data-layer-id')===id)||null;}
function transformPoint2D(x,y,m){return{x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f};}
function invertAffineMatrix(m){if(!m)return null;const det=m.a*m.d-m.b*m.c;if(!Number.isFinite(det)||Math.abs(det)<1e-10)return null;return{a:m.d/det,b:-m.b/det,c:-m.c/det,d:m.a/det,e:(m.c*m.f-m.d*m.e)/det,f:(m.b*m.e-m.a*m.f)/det};}
function multiplyAffineMatrices(a,b){return{a:a.a*b.a+a.c*b.b,b:a.b*b.a+a.d*b.b,c:a.a*b.c+a.c*b.d,d:a.b*b.c+a.d*b.d,e:a.a*b.e+a.c*b.f+a.e,f:a.b*b.e+a.d*b.f+a.f};}
// getCTM() includes the root SVG's viewBox/CSS scaling in common browser engines.
// Remove that root transform so all alignment geometry is expressed in document units.
function getCanvasRelativeMatrix(node){try{const m=node?.getCTM(),root=$('bcStage')?.getCTM();if(!m)return null;if(!root)return m;const inv=invertAffineMatrix(root);return inv?multiplyAffineMatrices(inv,m):null;}catch(_){return null;}}
function transformedRectBounds(b,m,padX=0,padY=padX){
 if(!b||!m||![b.x,b.y,b.width,b.height,m.a,m.b,m.c,m.d,m.e,m.f,padX,padY].every(Number.isFinite))return null;
 const x=b.x-padX,y=b.y-padY,w=b.width+padX*2,h=b.height+padY*2;
 const corners=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>transformPoint2D(p[0],p[1],m));
 const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
}
function unionRectBounds(a,b){if(!a)return b;if(!b)return a;const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),right=Math.max(a.x+a.w,b.x+b.w),bottom=Math.max(a.y+a.h,b.y+b.h);return{x,y,w:right-x,h:bottom-y};}
function parseSvgUrlReference(value){const m=String(value||'').match(/url\(\s*["']?#([^)'"\s]+)["']?\s*\)/i);return m?.[1]||null;}
function svgLengthInBox(value,base,fallback,objectUnits=false){
 if(value==null||String(value).trim()==='')return fallback;
 const raw=String(value).trim(),n=parseFloat(raw);if(!Number.isFinite(n))return fallback;
 if(raw.endsWith('%'))return n*base/100;
 // In objectBoundingBox units, unitless values are fractions (1 = 100%), not user units.
 return objectUnits?n*base:n;
}
function getFilterRegionBounds(node,b){
 try{
  const style=getComputedStyle(node),id=parseSvgUrlReference(style?.filter)||parseSvgUrlReference(node.getAttribute('filter'));if(!id)return null;
  const f=document.getElementById(id);if(!f||f.localName!=='filter')return null;
  const objectUnits=(f.getAttribute('filterUnits')||'objectBoundingBox')==='objectBoundingBox';let x,y,w,h;
  if(objectUnits){
   const ox=svgLengthInBox(f.getAttribute('x'),b.width,-.1*b.width,true),oy=svgLengthInBox(f.getAttribute('y'),b.height,-.1*b.height,true);
   x=b.x+ox;y=b.y+oy;w=svgLengthInBox(f.getAttribute('width'),b.width,1.2*b.width,true);h=svgLengthInBox(f.getAttribute('height'),b.height,1.2*b.height,true);
  }else{
   // Percentages in userSpaceOnUse depend on the SVG viewport. Using the element's
   // local bounds as a conservative reference is safer than treating fractions as pixels.
   const local=(v,base,fallback)=>svgLengthInBox(v,base,fallback,false);
   x=f.hasAttribute('x')?local(f.getAttribute('x'),b.width,b.x):b.x-.1*b.width;
   y=f.hasAttribute('y')?local(f.getAttribute('y'),b.height,b.y):b.y-.1*b.height;
   w=local(f.getAttribute('width'),b.width,1.2*b.width);h=local(f.getAttribute('height'),b.height,1.2*b.height);
   if(String(f.getAttribute('x')||'').trim().endsWith('%'))x=b.x+x;
   if(String(f.getAttribute('y')||'').trim().endsWith('%'))y=b.y+y;
  }
  if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return null;
  return{x,y,width:w,height:h};
 }catch(_){return null;}
}
function getMarkerExpansion(node,style,strokeWidth){
 let radius=0;
 for(const prop of ['markerStart','markerMid','markerEnd']){
  const attr=prop.replace(/[A-Z]/g,m=>'-'+m.toLowerCase()),id=parseSvgUrlReference(style?.[prop])||parseSvgUrlReference(node.getAttribute(attr));if(!id)continue;
  const marker=document.getElementById(id);if(!marker||marker.localName!=='marker')continue;
  const mw=Math.max(0,num(marker.getAttribute('markerWidth'),3)),mh=Math.max(0,num(marker.getAttribute('markerHeight'),3)),unit=marker.getAttribute('markerUnits')||'strokeWidth';
  // Marker artwork can rotate along the path tangent. A radial bound intentionally
  // overestimates its extent to avoid clipping during alignment calculations.
  const factor=unit==='userSpaceOnUse'?1:Math.max(.01,strokeWidth);
  radius=Math.max(radius,Math.hypot(mw,mh)*factor*.5);
 }
 return radius;
}
function affineMaxScale(m){if(!m)return 1;const tr=m.a*m.a+m.b*m.b+m.c*m.c+m.d*m.d,det=m.a*m.d-m.b*m.c,disc=Math.sqrt(Math.max(0,tr*tr-4*det*det));return Math.sqrt(Math.max(0,(tr+disc)/2));}
function expandWorldBounds(b,padX,padY=padX){if(!b)return null;return{x:b.x-padX,y:b.y-padY,w:b.w+padX*2,h:b.h+padY*2};}
function getSvgMiterTipWorldPoints(item,matrix,strokeWidth,miterLimit,nonScaling=false){
 if(!item||!matrix||!(strokeWidth>0)||!Number.isFinite(miterLimit)||miterLimit<=1)return[];
 const d=item.getAttribute?.('d');if(!d)return[];const chunks=parseSvgSubpathRecords(d);if(!chunks?.length)return[];
 const numRe=/[MLCQAZ]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;
 const unit=(x,y)=>{const l=Math.hypot(x,y);return l>1e-9?{x:x/l,y:y/l}:null;};
 const arcTangent=(x0,y0,x1,y1,rx,ry,phiDeg,laf,sweep,atEnd)=>{
  rx=Math.abs(rx);ry=Math.abs(ry);
  if(rx<1e-9||ry<1e-9)return unit(x1-x0,y1-y0);
  const phi=phiDeg*Math.PI/180,cp=Math.cos(phi),sp=Math.sin(phi),hx=(x0-x1)/2,hy=(y0-y1)/2;
  const xp=cp*hx+sp*hy,yp=-sp*hx+cp*hy,lam=xp*xp/(rx*rx)+yp*yp/(ry*ry);
  if(lam>1){const s=Math.sqrt(lam);rx*=s;ry*=s;}
  const sgn=(laf!==sweep)?1:-1,num=Math.max(0,rx*rx*ry*ry-rx*rx*yp*yp-ry*ry*xp*xp),den=rx*rx*yp*yp+ry*ry*xp*xp||1,co=sgn*Math.sqrt(num/den);
  const cxp=co*rx*yp/ry,cyp=co*-ry*xp/rx,cx=cp*cxp-sp*cyp+(x0+x1)/2,cy=sp*cxp+cp*cyp+(y0+y1)/2;
  const px=atEnd?x1:x0,py=atEnd?y1:y0,qx=cp*(px-cx)+sp*(py-cy),qy=-sp*(px-cx)+cp*(py-cy);
  let tx=-rx*qy/ry,ty=ry*qx/rx;
  const wx=cp*tx-sp*ty,wy=sp*tx+cp*ty;
  return unit(sweep?wx:-wx,sweep?wy:-wy);
 };
 const tips=[],half=strokeWidth/2;
 for(const chunk of chunks){
  const toks=chunk.d.match(numRe)||[],segs=[];let cur=null,start=null,i=0,closed=false,closingIn=null;
  while(i<toks.length){
   const t=toks[i];
   if(!/^[MLCQAZ]$/.test(t)){i++;continue;}
   i++;
   if(t==='M'){cur={x:Number(toks[i]),y:Number(toks[i+1])};start={...cur};i+=2;continue;}
   if(t==='Z'){if(cur&&start){if(Math.hypot(start.x-cur.x,start.y-cur.y)>1e-9){const ts=unit(start.x-cur.x,start.y-cur.y);segs.push({start:{...cur},end:{...start},ts,te:ts});}else if(segs.length)closingIn=segs[segs.length-1].te;cur={...start};}closed=true;continue;}
   if(!cur)break;
   const p0={...cur};let p,ts,te;
   if(t==='L'){p={x:Number(toks[i]),y:Number(toks[i+1])};i+=2;ts=unit(p.x-p0.x,p.y-p0.y);te=ts;}
   else if(t==='C'){const c1={x:Number(toks[i]),y:Number(toks[i+1])},c2={x:Number(toks[i+2]),y:Number(toks[i+3])};p={x:Number(toks[i+4]),y:Number(toks[i+5])};i+=6;ts=unit(c1.x-p0.x,c1.y-p0.y);te=unit(p.x-c2.x,p.y-c2.y);}
   else if(t==='Q'){const c={x:Number(toks[i]),y:Number(toks[i+1])};p={x:Number(toks[i+2]),y:Number(toks[i+3])};i+=4;ts=unit(c.x-p0.x,c.y-p0.y);te=unit(p.x-c.x,p.y-c.y);}
   else if(t==='A'){const rx=Number(toks[i]),ry=Number(toks[i+1]),phi=Number(toks[i+2]),laf=Number(toks[i+3]),sweep=Number(toks[i+4]);p={x:Number(toks[i+5]),y:Number(toks[i+6])};i+=7;ts=arcTangent(p0.x,p0.y,p.x,p.y,rx,ry,phi,laf,sweep,false);te=arcTangent(p0.x,p0.y,p.x,p.y,rx,ry,phi,laf,sweep,true);}
   else break;
   if(p)segs.push({start:p0,end:p,ts,te});
   cur=p;
  }
   const joint=(v,inv,outv)=>{
    if(!inv||!outv)return;
    let cv=v,a=inv,b=outv;
    if(nonScaling){
     cv=transformPoint2D(v.x,v.y,matrix);
     a=unit(matrix.a*inv.x+matrix.c*inv.y,matrix.b*inv.x+matrix.d*inv.y);
     b=unit(matrix.a*outv.x+matrix.c*outv.y,matrix.b*outv.x+matrix.d*outv.y);
     if(!a||!b)return;
    }
    const cross=a.x*b.y-a.y*b.x,dot=Math.max(-1,Math.min(1,a.x*b.x+a.y*b.y)),absTurn=Math.abs(Math.atan2(cross,dot));
    if(absTurn<.32||absTurn>Math.PI-.025)return;
    const denom=Math.cos(absTurn/2);if(1/Math.max(.0001,denom)>miterLimit)return;
    const sign=cross>0?-1:1,n1={x:-a.y*sign,y:a.x*sign},n2={x:-b.y*sign,y:b.x*sign};let bx=n1.x+n2.x,by=n1.y+n2.y,bl=Math.hypot(bx,by);if(bl<1e-6)return;
    bx/=bl;by/=bl;const dist=half/Math.max(.0001,denom);tips.push({x:cv.x+bx*dist,y:cv.y+by*dist});
   };
  for(let j=1;j<segs.length;j++)joint(segs[j-1].end,segs[j-1].te,segs[j].ts);
   if(closed&&segs.length>1)joint(segs[segs.length-1].end,closingIn||segs[segs.length-1].te,segs[0].ts);
  }
  return nonScaling?tips:tips.map(p=>transformPoint2D(p.x,p.y,matrix));
}
function strokeVisualBounds(item,box,m,style){
 const normalizedBox=box?{x:Number(box.x),y:Number(box.y),width:Number(box.width??box.w),height:Number(box.height??box.h)}:null;
 const geometry=transformedRectBounds(normalizedBox,m,0);if(!geometry)return null;
 box=normalizedBox;
 const stroke=style?.stroke||item.getAttribute('stroke')||'none',width=Math.max(0,num(style?.strokeWidth||item.getAttribute('stroke-width'),0));
 const markerPad=getMarkerExpansion(item,style||{},width);let out=geometry;
 if(String(stroke).toLowerCase()!=='none'&&width>0&&Number(style?.strokeOpacity??1)!==0){
  const nonScaling=String(style?.vectorEffect||item.getAttribute('vector-effect')||'').toLowerCase()==='non-scaling-stroke',half=width/2;
  out=nonScaling?expandWorldBounds(geometry,half):transformedRectBounds(box,m,half+markerPad);
  if(nonScaling&&markerPad)out=expandWorldBounds(out,markerPad*affineMaxScale(m));
  const join=style?.strokeLinejoin||item.getAttribute('stroke-linejoin')||'miter',limit=Math.max(1,num(style?.strokeMiterlimit||item.getAttribute('stroke-miterlimit'),4));
  if(join==='miter'&&limit>1){const tips=getSvgMiterTipWorldPoints(item,m,width,limit,nonScaling);for(const p of tips)out=unionRectBounds(out,{x:p.x,y:p.y,w:0,h:0});}
 }else if(markerPad)out=transformedRectBounds(box,m,markerPad);
 return out;
}
const svgWorldBoundsCache=new WeakMap(),svgStrokePadCache=new WeakMap();
function fallbackLayerSignature(layer){
 if(!layer)return '';
 return JSON.stringify([layer.x,layer.y,layer.rotate,layer.scaleX,layer.scaleY,layer.w,layer.h,layer.viewX,layer.viewY,layer.viewW,layer.viewH,layer.preserveAspectRatio,layer.rootAttrs,layer.markup,layer.opacity,layer.visible]);
}
async function measureLayerPixelBounds(layer){
 if(!layer||layer.type!=='svg')return false;
 const markup=String(layer.markup||'');
 if(!/\bclip-path\s*=/i.test(markup))return true;
 if(/<(?:mask|filter)\b|\b(?:mask|filter)\s*=/i.test(markup)||layer.shadow)return false;
 const key=fallbackLayerSignature(layer);
 if(layer.iconPixelBoundsKey===key)return true;
 const stage=$('bcStage');if(!stage||!getLayerNode(layer.id))return false;
 const view={x:num(layer.x),y:num(layer.y),w:Math.max(1,num(layer.w)),h:Math.max(1,num(layer.h))};
 const maxSide=Math.max(view.w,view.h),area=Math.max(1,view.w*view.h);
 const scale=Math.min(160,1400/maxSide,Math.sqrt(500000/area));if(!(scale>0))return false;
 const width=Math.max(32,Math.ceil(view.w*scale)),height=Math.max(32,Math.ceil(view.h*scale));if(width*height>520000)return false;
 const clone=stage.cloneNode(true);clone.setAttribute('xmlns',NS);clone.removeAttribute('style');
 clone.querySelectorAll('.bc-selected-outline,.bc-handle,.bc-transform-handle,.bc-transform-line,.bc-path-overlay,.inspector-canvas,[data-gsp-overlay],[data-gsp-guide],[data-gsp-typography-guides]').forEach(n=>n.remove());
 const modelIds=new Set(allLayers().map(item=>item.id));
 for(const node of clone.querySelectorAll('[data-layer-id]')){const id=node.getAttribute('data-layer-id');if(modelIds.has(id)&&id!==layer.id){node.setAttribute('display','none');node.style.setProperty('display','none','important');}}
 clone.setAttribute('width',String(width));clone.setAttribute('height',String(height));clone.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);clone.setAttribute('preserveAspectRatio','none');clone.style.overflow='visible';
 const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'}));
 try{
  const image=new Image();image.decoding='async';
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('pixel bounds unavailable'));image.src=url;});
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return false;
  ctx.clearRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
  const data=ctx.getImageData(0,0,width,height).data;let minX=width,minY=height,maxX=-1,maxY=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>12){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
  if(maxX<0)return false;
  layer.iconPixelBounds={x:view.x+minX/width*view.w,y:view.y+minY/height*view.h,w:(maxX-minX+1)/width*view.w,h:(maxY-minY+1)/height*view.h};
  layer.iconPixelBoundsKey=key;return true;
 }catch(_){return false;}finally{URL.revokeObjectURL(url);}
}
function getLayerStrokeExpansionWorld(layer,direction=null){
 if(layer?.svgImportFallback&&!direction){
  const key=fallbackLayerSignature(layer),cached=svgStrokePadCache.get(layer);
  if(cached?.key===key)return cached.value;
  const value=computeLayerStrokeExpansionWorld(layer,direction);
  svgStrokePadCache.set(layer,{key,value});return value;
 }
 return computeLayerStrokeExpansionWorld(layer,direction);
}
function computeLayerStrokeExpansionWorld(layer,direction=null){
 const outer=getLayerNode(layer?.id);if(!outer)return 0;
 const drawable='path,rect,circle,ellipse,polygon,polyline,line,text,use',nodes=[...(outer.matches?.(drawable)?[outer]:[]),...outer.querySelectorAll(drawable)];let maxPad=0;
 const dir=direction&&Number.isFinite(direction.x)&&Number.isFinite(direction.y)?(()=>{const len=Math.hypot(direction.x,direction.y);return len>1e-8?{x:direction.x/len,y:direction.y/len}:null;})():null;
 for(const item of nodes){
  let style;try{style=getComputedStyle(item);}catch(_){continue;}
  if(!style||style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||Number(style.strokeOpacity)===0||String(style.stroke||'none').toLowerCase()==='none')continue;
  const width=Math.max(0,num(style.strokeWidth||item.getAttribute('stroke-width'),0));if(!(width>0))continue;
  const matrix=getCanvasRelativeMatrix(item);if(!matrix)continue;
  const nonScaling=String(style.vectorEffect||item.getAttribute('vector-effect')||'').toLowerCase()==='non-scaling-stroke';
  const half=width/2,basePad=nonScaling?half:half*affineMaxScale(matrix);let pad=basePad;
  const join=style.strokeLinejoin||item.getAttribute('stroke-linejoin')||'miter',limit=Math.max(1,num(style.strokeMiterlimit||item.getAttribute('stroke-miterlimit'),4));
  if(join==='miter'&&limit>1&&typeof item.getBBox==='function'){
   let box;try{box=item.getBBox();}catch(_){box=null;}
   if(box){const geom=transformedRectBounds(box,matrix,0),tips=getSvgMiterTipWorldPoints(item,matrix,width,limit,nonScaling);
    if(geom&&tips.length){
     if(dir){const maxGeom=Math.max(...[[geom.x,geom.y],[geom.x+geom.w,geom.y],[geom.x+geom.w,geom.y+geom.h],[geom.x,geom.y+geom.h]].map(p=>p[0]*dir.x+p[1]*dir.y));for(const p of tips)pad=Math.max(pad,p.x*dir.x+p.y*dir.y-maxGeom);}
     else for(const p of tips){const extra=Math.max(0,geom.x-half-p.x,p.x-(geom.x+geom.w)-half,geom.y-half-p.y,p.y-(geom.y+geom.h)-half);pad=Math.max(pad,basePad+extra);}
    }
   }
  }
  if(Number.isFinite(pad))maxPad=Math.max(maxPad,pad);
 }
 return maxPad;
}
function firstSvgLength(node,attribute,fallback=0){
 try{const animated=node?.[attribute]?.baseVal;if(animated){if('numberOfItems'in animated&&animated.numberOfItems)return Number(animated.getItem(0).value);if(Number.isFinite(animated.value))return Number(animated.value);}}catch(_){}
 const raw=node?.getAttribute?.(attribute);if(raw==null||String(raw).trim()==='')return fallback;const value=parseFloat(String(raw).trim());return Number.isFinite(value)?value:fallback;
}
function getSvgTextInkBounds(textNode){
 if(!textNode||textNode.localName!=='text'||textNode.querySelector('textPath'))return null;
 const service=window.GlyphStudioInkMetrics;if(!service||typeof service.measure!=='function')return null;
 const unsupported=['textLength','lengthAdjust','rotate','dx','baseline-shift','alignment-baseline'];
 if(unsupported.some(a=>textNode.hasAttribute(a)))return null;
 const hasLengthList=(node,attribute)=>{const value=node.getAttribute(attribute);return value!=null&&String(value).trim().split(/[\s,]+/).filter(Boolean).length>1;};
 if(['x','y'].some(a=>hasLengthList(textNode,a)))return null;
 const direct=[...textNode.children];
 if(direct.some(el=>el.localName!=='tspan'||el.querySelector('tspan,textPath')||['transform','dx','rotate','textLength','lengthAdjust','baseline-shift','alignment-baseline'].some(a=>el.hasAttribute(a))||['x','y'].some(a=>hasLengthList(el,a))))return null;
 if(direct.length&&[...textNode.childNodes].some(n=>n.nodeType===3&&String(n.nodeValue||'').trim()))return null;
 const spans=direct.length?direct:[textNode];let charIndex=0,acc=null,lastBaseline=firstSvgLength(textNode,'y',0),baseX=firstSvgLength(textNode,'x',0);
 for(const span of spans){
  const value=String(span.textContent||'');const startIndex=charIndex;charIndex+=Array.from(value).length;
  if(!value.trim())continue;
  if(span!==textNode&&span.hasAttribute('dx'))return null;
  let baselineY=lastBaseline,positionMeasured=false;
  try{if(typeof textNode.getNumberOfChars==='function'&&typeof textNode.getStartPositionOfChar==='function'&&textNode.getNumberOfChars()>startIndex){const pt=textNode.getStartPositionOfChar(startIndex);if(Number.isFinite(pt.y)){baselineY=pt.y;positionMeasured=true;}}}catch(_){}
  if(span!==textNode&&!positionMeasured&&(span.hasAttribute('dy')||span.hasAttribute('y')))return null;
  const xAnchor=span!==textNode&&span.hasAttribute('x')?firstSvgLength(span,'x',baseX):baseX;
  const style=getComputedStyle(span),anchor=style.textAnchor||textNode.getAttribute('text-anchor')||'start',baseline=style.dominantBaseline||textNode.getAttribute('dominant-baseline')||'alphabetic';
  // Canvas can mirror ordinary horizontal SVG text, but not every SVG shaping
  // feature. Fall back to the browser's native box rather than returning a
  // deceptively precise result for writing modes/features it cannot reproduce.
  if((style.writingMode&&style.writingMode!=='horizontal-tb')||(style.alignmentBaseline&&style.alignmentBaseline!=='auto'&&style.alignmentBaseline!=='baseline')||(style.baselineShift&&style.baselineShift!=='0px'&&style.baselineShift!=='baseline')||(style.fontVariationSettings&&style.fontVariationSettings!=='normal')||(style.fontFeatureSettings&&style.fontFeatureSettings!=='normal')||(style.unicodeBidi&&style.unicodeBidi!=='normal'))return null;
  const metrics=service.measure(value,style,anchor,baseline);if(!metrics)return null;
  const box={x:xAnchor+metrics.left,y:baselineY+metrics.top,w:metrics.right-metrics.left,h:metrics.bottom-metrics.top};
  if(![box.x,box.y,box.w,box.h].every(Number.isFinite))return null;
  acc=unionRectBounds(acc,{x:box.x,y:box.y,w:box.w,h:box.h});
  // Browser character-position APIs account for tspan dy/y, including units.
  // Retain only a simple scalar fallback for engines lacking that API.
  if(span!==textNode&&!positionMeasured){if(span.hasAttribute('dy')&&/[a-z%]/i.test(span.getAttribute('dy')))return null;const dy=parseFloat(span.getAttribute('dy')||'0');if(Number.isFinite(dy))lastBaseline+=dy;if(span.hasAttribute('y'))lastBaseline=firstSvgLength(span,'y',lastBaseline);}
 }
 return acc&&acc.w>=0&&acc.h>=0?{x:acc.x,y:acc.y,w:acc.w,h:acc.h}:null;
}
function getElementEffectivePainted(item,stopNode){
 for(let p=item;p&&p!==stopNode.parentElement;p=p.parentElement){let style;try{style=getComputedStyle(p);}catch(_){style=null;}if(style&&(style.display==='none'||Number(style.opacity)===0))return false;if(p===item&&style?.visibility==='hidden')return false;if(p===stopNode)break;}
 return true;
}
function getLayerWorldBounds(layer,referenceNode=null){
 if(layer?.svgImportFallback&&!referenceNode){
  const key=fallbackLayerSignature(layer),cached=svgWorldBoundsCache.get(layer);
  if(cached?.key===key)return cached.value;
  const value=computeLayerWorldBounds(layer,referenceNode);
  svgWorldBoundsCache.set(layer,{key,value});return value;
 }
 return computeLayerWorldBounds(layer,referenceNode);
}
function computeLayerWorldBounds(layer,referenceNode=null){
 const node=getLayerNode(layer.id);if(node&&typeof node.getBBox==='function'){
  let result=null;const refMatrix=referenceNode?getIconMatchCanvasMatrix(referenceNode):null,refInverse=referenceNode?(refMatrix&&invertAffineMatrix(refMatrix)):null;
  if(referenceNode&&!refInverse)return visualBounds(layer);
  const candidates=[node,...node.querySelectorAll('g,svg,path,rect,circle,ellipse,line,polyline,polygon,text,image,use')];
  for(const item of candidates){
   try{
    const tag=item.localName,isContainer=tag==='g'||tag==='svg';if(!getElementEffectivePainted(item,node))continue;
    const canvasMatrix=getIconMatchCanvasMatrix(item),m=canvasMatrix&&(refInverse?multiplyAffineMatrices(refInverse,canvasMatrix):canvasMatrix);
    if(!m||![m.a,m.b,m.c,m.d,m.e,m.f].every(Number.isFinite))continue;
    let style;try{style=getComputedStyle(item);}catch(_){style=null;}
    if(style&&(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0))continue;
    let rawBox;try{rawBox=item.getBBox();}catch(_){continue;}
    if(![rawBox.x,rawBox.y,rawBox.width,rawBox.height].every(Number.isFinite))continue;
    if(isContainer){const filterBox=getFilterRegionBounds(item,rawBox);if(filterBox)result=unionRectBounds(result,transformedRectBounds(filterBox,m,0));continue;}
    const box=tag==='text'?(getSvgTextInkBounds(item)||rawBox):rawBox;
    let bounds=strokeVisualBounds(item,box,m,style||{});
    const filterBox=getFilterRegionBounds(item,rawBox);if(filterBox)bounds=unionRectBounds(bounds,transformedRectBounds(filterBox,m,0));
    result=unionRectBounds(result,bounds);
   }catch(_){/* Continue measuring other drawable descendants. */}
  }
  if(result&&[result.x,result.y,result.w,result.h].every(Number.isFinite))return result;
 }
 return visualBounds(layer);
}
function getLayerParentMatrix(layer){return getLayerParentModelMatrix(layer)||{a:1,b:0,c:0,d:1,e:0,f:0};}
function moveLayerLocal(layer,dx,dy){layer.x=num(layer.x)+dx;layer.y=num(layer.y)+dy;if(layer.type==='line'){layer.x2=num(layer.x2)+dx;layer.y2=num(layer.y2)+dy;}}
function moveLayerWorld(layer,dx,dy){
 if(!Number.isFinite(dx)||!Number.isFinite(dy))return false;
 const m=getLayerParentMatrix(layer),det=m.a*m.d-m.b*m.c;if(!Number.isFinite(det)||Math.abs(det)<1e-10)return false;
 const localX=(m.d*dx-m.c*dy)/det,localY=(-m.b*dx+m.a*dy)/det;
 if(!Number.isFinite(localX)||!Number.isFinite(localY))return false;
 moveLayerLocal(layer,localX,localY);return true;
}
// The wrapper's transformed origin is the reliable canvas-space anchor for snapping,
// including children inside rotated/scaled groups. Fall back to the parent matrix
// when a browser has not yet produced a current SVG CTM.
function getLayerCanvasOrigin(layer){
 const node=layer&&getLayerNode(layer.id),matrix=getCanvasRelativeMatrix(node);
 if(matrix){const point=transformPoint2D(0,0,matrix);if(Number.isFinite(point.x)&&Number.isFinite(point.y))return point;}
 const parent=getLayerParentMatrix(layer);return transformPoint2D(num(layer.x),num(layer.y),parent);
}
function restoreLayerDragOrigin(layer,origin,dx,dy){
 if(!layer||!origin)return false;
 layer.x=origin.x;layer.y=origin.y;
 if(layer.type==='line'){layer.x2=origin.x2;layer.y2=origin.y2;}
 return moveLayerWorld(layer,dx,dy);
}
function hasLockedAncestor(layer){let parent=findParent(layer?.id)?.parent;while(parent){if(parent.locked)return true;parent=findParent(parent.id)?.parent;}return false;}
function isEffectivelyLocked(layer){return !!layer&&(!!layer.locked||hasLockedAncestor(layer));}
function isLayerEffectivelyAvailable(layer){if(!layer||layer.visible===false||layer.locked||num(layer.opacity,1)<=0)return false;let parent=findParent(layer.id)?.parent;while(parent){if(parent.visible===false||parent.locked||num(parent.opacity,1)<=0)return false;parent=findParent(parent.id)?.parent;}return true;}
function alignmentRecords(){return selectedRoots().filter(isLayerEffectivelyAvailable).map(l=>({l,b:getLayerWorldBounds(l)})).filter(o=>[o.b.x,o.b.y,o.b.w,o.b.h].every(Number.isFinite));}
function unionBounds(records){const x=Math.min(...records.map(o=>o.b.x)),y=Math.min(...records.map(o=>o.b.y)),right=Math.max(...records.map(o=>o.b.x+o.b.w)),bottom=Math.max(...records.map(o=>o.b.y+o.b.h));return{x,y,w:right-x,h:bottom-y};}
function getAlignmentReference(records){
 const mode=$('bcAlignReference')?.value||'selection';if(mode==='canvas')return{bounds:{x:0,y:0,w:W,h:H},fixedId:null,label:'canvas'};
 if(mode==='selection')return{bounds:unionBounds(records),fixedId:null,label:'selection'};
 let target=null;
 if(mode==='key'){target=records.find(o=>o.l.id===keyObjectId);if(!target)throw Error('Set a selected layer as the key object first.');}
 if(mode==='first'||mode==='last'){const ids=[...selectedIds];const id=mode==='first'?ids.find(x=>records.some(o=>o.l.id===x)):[...ids].reverse().find(x=>records.some(o=>o.l.id===x));target=records.find(o=>o.l.id===id);}
 if(mode==='largest'||mode==='smallest'){const ranked=[...records].sort((a,b)=>(a.b.w*a.b.h)-(b.b.w*b.b.h));target=mode==='largest'?ranked[ranked.length-1]:ranked[0];}
 if(!target)throw Error('The selected reference object is unavailable.');return{bounds:target.b,fixedId:target.l.id,label:target.l.name};
}
function alignSelection(mode){
 clearInsetPreviewBeforeLayout();
 const records=alignmentRecords();const refMode=$('bcAlignReference')?.value||'selection';
 if(records.length<(refMode==='canvas'?1:2)){status(refMode==='canvas'?'Select at least one visible unlocked layer.':'Select at least two visible unlocked layers.','error');return;}
 let ref;try{ref=getAlignmentReference(records);}catch(err){status(err.message,'error');return;}
 const r=ref.bounds,tx=mode==='left'?r.x:mode==='right'?r.x+r.w:mode==='centerX'?r.x+r.w/2:mode==='top'?r.y:mode==='bottom'?r.y+r.h:r.y+r.h/2;
 const targets=records.filter(o=>o.l.id!==ref.fixedId);if(!targets.length){status('Nothing to move for this reference.','error');return;}
 snap();let moved=0;for(const o of targets){let dx=0,dy=0;if(mode==='left')dx=tx-o.b.x;else if(mode==='right')dx=tx-(o.b.x+o.b.w);else if(mode==='centerX')dx=tx-(o.b.x+o.b.w/2);else if(mode==='top')dy=tx-o.b.y;else if(mode==='bottom')dy=tx-(o.b.y+o.b.h);else if(mode==='centerY')dy=tx-(o.b.y+o.b.h/2);if(moveLayerWorld(o.l,dx,dy))moved++;}
 render();status(`Aligned ${moved} layer${moved===1?'':'s'} relative to ${ref.label}.`,'ok');
}
function distributeSelection(axis){
 clearInsetPreviewBeforeLayout();
 const records=alignmentRecords();if(records.length<3){status('Select at least three visible unlocked layers to distribute.','error');return;}
 const horizontal=axis==='x',key=horizontal?'x':'y',size=horizontal?'w':'h';const sorted=[...records].sort((a,b)=>a.b[key]-b.b[key]);
 const useBias=!!$('bcUseOpticalBias')?.checked,biasKey=horizontal?'opticalGapX':'opticalGapY',biasTotal=useBias?sorted.slice(0,-1).reduce((n,o)=>n+num(o.l[biasKey]),0):0,start=sorted[0].b[key],end=sorted.at(-1).b[key]+sorted.at(-1).b[size],total=sorted.reduce((n,o)=>n+o.b[size],0),gap=(end-start-total-biasTotal)/(sorted.length-1);
 snap();let cursor=start,moved=0;for(const o of sorted){const delta=cursor-o.b[key];if(moveLayerWorld(o.l,horizontal?delta:0,horizontal?0:delta))moved++;cursor+=o.b[size]+gap+(useBias?num(o.l[biasKey]):0);}
 render();status(`${horizontal?'Horizontal':'Vertical'} gaps made equal across ${moved} layers.`,'ok');
}
function distributeCenters(axis){
 clearInsetPreviewBeforeLayout();
 const records=alignmentRecords();if(records.length<3){status('Select at least three visible unlocked layers to distribute centres.','error');return;}
 const horizontal=axis==='x',key=horizontal?'x':'y',size=horizontal?'w':'h';const sorted=[...records].sort((a,b)=>(a.b[key]+a.b[size]/2)-(b.b[key]+b.b[size]/2));
 const first=sorted[0].b[key]+sorted[0].b[size]/2,last=sorted[sorted.length-1].b[key]+sorted[sorted.length-1].b[size]/2,step=(last-first)/(sorted.length-1);
 snap();let moved=0;sorted.slice(1,-1).forEach((o,i)=>{const center=o.b[key]+o.b[size]/2,delta=first+step*(i+1)-center;if(moveLayerWorld(o.l,horizontal?delta:0,horizontal?0:delta))moved++;});
 render();status(`Distributed ${horizontal?'horizontal':'vertical'} object centres evenly.`,'ok');
}
function applyExactSpacing(){
 clearInsetPreviewBeforeLayout();
 const records=alignmentRecords();if(records.length<2){status('Select at least two visible unlocked layers.','error');return;}
 const gap=Math.max(0,Math.min(10000,num($('bcExactGap')?.value,16))),horizontal=$('bcExactGapAxis')?.value!=='y',key=horizontal?'x':'y',size=horizontal?'w':'h';
 const sorted=[...records].sort((a,b)=>a.b[key]-b.b[key]),useBias=!!$('bcUseOpticalBias')?.checked,biasKey=horizontal?'opticalGapX':'opticalGapY';let cursor=sorted[0].b[key]+sorted[0].b[size],moved=0;
 snap();for(let i=1;i<sorted.length;i++){const prev=sorted[i-1],o=sorted[i],effectiveGap=Math.max(-Math.min(prev.b[size],o.b[size])*.95,gap+(useBias?num(prev.l[biasKey]):0)),delta=cursor+effectiveGap-o.b[key];if(moveLayerWorld(o.l,horizontal?delta:0,horizontal?0:delta))moved++;cursor+=effectiveGap+o.b[size];}
 render();status(`Applied ${gap} document-unit ${horizontal?'horizontal':'vertical'} gaps${useBias?' with per-layer optical adjustments':''}.`,'ok');
}
function centerSelection(axis){
 clearInsetPreviewBeforeLayout();
 const records=alignmentRecords();if(!records.length){status('Select at least one visible unlocked layer.','error');return;}
 const b=unionBounds(records),dx=axis==='y'?0:W/2-(b.x+b.w/2),dy=axis==='x'?0:H/2-(b.y+b.h/2);
 snap();let moved=0;for(const o of records)if(moveLayerWorld(o.l,dx,dy))moved++;
 render();status(axis==='x'?'Selection centered horizontally on canvas.':axis==='y'?'Selection centered vertically on canvas.':'Selection centered on canvas as one composition.','ok');
}
function typographyNodeForLayer(layer,outer=getLayerNode(layer.id)){
 if(!outer)return null;
 if(layer.type==='svg')return outer.querySelector('svg')||outer;
 return outer;
}
function typographyGuideFrame(layer,guide='baseline'){
 const outer=getLayerNode(layer.id);if(!outer)return null;
 if(guide==='bounds'){const b=getLayerWorldBounds(layer);return b?{p:{x:b.x+b.w/2,y:b.y+b.h/2},d:{x:1,y:0},source:'visible artwork centre'}:null;}
 let node=null,meta=null;
 if(layer.type==='text'&&!layer.textPathId){node=outer.querySelector('text');const size=num(layer.fontSize,16),family=layer.fontFamily||'Arial,sans-serif',weight=layer.fontWeight||400;let cap=0,xh=0;try{const c=document.createElement('canvas').getContext('2d');c.font=`${weight} ${size}px ${family}`;cap=c.measureText('H').actualBoundingBoxAscent||size*.7;xh=c.measureText('x').actualBoundingBoxAscent||size*.52;}catch(_){cap=size*.7;xh=size*.52;}const baselineX=num(node?.getAttribute('x')),baselineY=num(node?.getAttribute('y'));meta={baselineX,baselineY,capY:baselineY-cap,xHeightY:baselineY-xh};}
 else if(layer.typography){node=typographyNodeForLayer(layer,outer);meta=layer.typography;}
 if(!node||!meta)return null;const m=getCanvasRelativeMatrix(node);if(!m)return null;const len=Math.hypot(m.a,m.b),normal=typographyNormal(m);if(len<1e-8||!normal)return null;
 if(guide==='reference'){
  const b=meta.referenceGlyphBounds;if(!b)return null;
  const p=transformPoint2D((Number(b.x1)+Number(b.x2))/2,(Number(b.y1)+Number(b.y2))/2,m);
  return{p,d:{x:-m.b/len,y:m.a/len},source:'reference letter'};
 }
 if(guide==='ink'){
  const c=meta.inkCentroid;if(!c||!Number.isFinite(Number(c.x))||!Number.isFinite(Number(c.y)))return null;
  return{p:transformPoint2D(Number(c.x),Number(c.y),m),d:{x:m.a/len,y:m.b/len},source:'ink centre'};
 }
 const key=guide==='cap'?'capY':guide==='x-height'?'xHeightY':'baselineY',y=Number(meta[key]);
 if(!Number.isFinite(y))return null;
 const x=guide==='baseline'?(Number(meta.baselineX)||0):0;let p=transformPoint2D(x,y,m);
 const pad=getLayerStrokeExpansionWorld(layer,normal),oppositePad=getLayerStrokeExpansionWorld(layer,{x:-normal.x,y:-normal.y}),thin=guide==='baseline'?getLayerThinBaselineShiftWorld(layer,m):0;
 // The geometric cap top is already updated when thinning is committed. Stroke
 // expands the writing-line and cap edges independently; thinning shifts only
 // the visible writing-line guide. Keep stored typography metadata untouched.
 const shift=guide==='baseline'?pad-thin:(guide==='cap'||guide==='x-height'?-oppositePad:0);
 p={x:p.x+normal.x*shift,y:p.y+normal.y*shift};
 return{p,d:{x:m.a/len,y:m.b/len},source:guide};
}
function typographyHorizontalAnchor(layer,mode){
 const b=getLayerWorldBounds(layer);if(!b)return null;
 if(mode==='visible')return b.x+b.w/2;
 const outer=getLayerNode(layer.id);if(!outer)return null;
 if(layer.typography){
  const meta=layer.typography,node=typographyNodeForLayer(layer,outer),m=getCanvasRelativeMatrix(node);if(!m)return null;
  if(mode==='advance'&&Number.isFinite(Number(meta.advanceStartX))&&Number.isFinite(Number(meta.advanceEndX))){const p=transformPoint2D((Number(meta.advanceStartX)+Number(meta.advanceEndX))/2,Number(meta.baselineY)||0,m);return p.x;}
  if(mode==='reference'&&meta.referenceGlyphBounds){const r=meta.referenceGlyphBounds,p=transformPoint2D((Number(r.x1)+Number(r.x2))/2,(Number(r.y1)+Number(r.y2))/2,m);return p.x;}
 }
 if(layer.type==='text'&&!layer.textPathId){
  const node=outer.querySelector('text'),m=getCanvasRelativeMatrix(node);if(!node||!m)return null;
  if(mode==='advance'&&typeof node.getComputedTextLength==='function'){
   try{const width=node.getComputedTextLength(),x=num(node.getAttribute('x')),anchor=node.getAttribute('text-anchor')||layer.anchor||'start',start=anchor==='middle'?x-width/2:anchor==='end'?x-width:x;return transformPoint2D(start+width/2,0,m).x;}catch(_){return null;}
  }
  if(mode==='reference'){
   const wanted=String($('bcTypographyReferenceCharacter')?.value||'').trim();if(!wanted)return null;
   try{const text=Array.from(node.textContent||''),idx=text.indexOf(wanted);if(idx<0||typeof node.getExtentOfChar!=='function')return null;const r=node.getExtentOfChar(idx);return transformPoint2D(r.x+r.width/2,r.y+r.height/2,m).x;}catch(_){return null;}
  }
 }
 return null;
}
function typographyVerticalFrame(layer,mode){
 if(mode==='bounds')return typographyGuideFrame(layer,'bounds');
 return typographyGuideFrame(layer,mode);
}
function updateBadgeTypographyPanel(){
 const info=$('bcTypographySelectionInfo'),help=$('bcTypographyActionHelp'),badge=$('bcTypographyStateBadge'),single=$('bcCenterTypography'),multi=$('bcAlignTextBaseline'),selection=selectedRoots();
 if(!info||!badge)return;
 if(single)single.disabled=!selection.length;if(multi)multi.disabled=selection.length<2;
 if(single)single.textContent='Auto center selected text';
 if(!selection.length){badge.textContent='Ready';info.innerHTML='<strong>Start here:</strong> add or select a text layer, then click the main <strong>Auto center</strong> button above the artboard.';}
 else if(selection.every(l=>l.type==='text'&&!l.textPathId)){badge.textContent=`${selection.length} text layer${selection.length===1?'':'s'} selected`;info.textContent='Automatic text detection is ready. Auto Center will use the actual font metrics and writing line, center the label(s), and preserve their size and scale.';}
 else if(selection.some(l=>l.type==='text'||hasSavedVectorBaseline(l))){badge.textContent='Text detected';info.textContent='Auto Center can use editable Badge Composer text and imported SVG/path layers that have saved writing-line guides. Other selected artwork is included using its visible bounds. Plain flattened paths without a guide are not guessed as text.';}
 else{badge.textContent='Artwork selected';info.textContent='This selection contains no editable text or saved writing-line guides. Auto Center will use visible artwork bounds. For an imported outline label, use “Mark writing line” first; ordinary flattened paths do not retain enough information to recover their original baseline reliably.';}
 if(help)help.textContent='Editable text is measured automatically. For imported outlined labels, mark and save each writing line once; Common baseline can then align those guided labels.';
}
function centerSelectedTypography(){
 clearInsetPreviewBeforeLayout();
 const records=alignmentRecords();if(records.length!==1){status('Select exactly one visible, unlocked label to center it on the artboard.','error');return;}
 const l=records[0].l;let hMode=$('bcTypographyHorizontalMode')?.value||'visible',vMode=$('bcTypographyAlignMode')?.value||'baseline';let usedFallback=false;
 let ax=typographyHorizontalAnchor(l,hMode);if(!Number.isFinite(ax)){if(hMode==='advance'||hMode==='reference'){hMode='visible';ax=typographyHorizontalAnchor(l,'visible');usedFallback=true;}if(!Number.isFinite(ax)){status('Could not measure this label. Try Visible letters centre.','error');return;}}
 let frame=typographyVerticalFrame(l,vMode);if(!frame&&vMode!=='bounds'){if((l.type==='svg'||l.type==='path'||l.type==='group')&&!l.typography){vMode='bounds';frame=typographyVerticalFrame(l,'bounds');usedFallback=true;}}
 if(!frame){status(vMode==='baseline'?'This label has no writing-line guide yet. Press “Mark writing line (older SVG)” and click where the main letters rest.':'This guide is not saved for this layer. Choose Whole visible shape centre or add the guide in Text to SVG.','error');return;}
 const C={x:W/2,y:H/2};let deltaX=C.x-ax,deltaY=C.y-frame.p.y;
 if(vMode==='baseline'){
  const cap=typographyGuideFrame(l,'cap');if(cap){const normal={x:-frame.d.y,y:frame.d.x},d=(cap.p.x-frame.p.x)*normal.x+(cap.p.y-frame.p.y)*normal.y;const targetBaseline=C.y-d/2;deltaY=targetBaseline-frame.p.y;}
 }
 const moved=Math.abs(deltaX)>.001||Math.abs(deltaY)>.001;if(moved){snap();moveLayerWorld(l,deltaX,deltaY);render();persistBadgeDraft();}
 status(usedFallback?'Centered using the visible artwork because this imported file has no saved typography guide. Its size and scale were preserved.':'Selected label centered. Font size and artwork scale were preserved.','ok');
}
function alignTextBaselines(){
 clearInsetPreviewBeforeLayout();
 const hMode=$('bcTypographyHorizontalMode')?.value||'visible',vMode=$('bcTypographyAlignMode')?.value||'baseline',records=alignmentRecords();
 if(records.length<2){status('Select at least two visible, unlocked labels. Select the reference label first, then Ctrl/⌘ + click the others.','error');return;}
 const anchors=records.map(o=>({o,x:typographyHorizontalAnchor(o.l,hMode),f:typographyVerticalFrame(o.l,vMode)}));
 if(anchors.some(v=>!Number.isFinite(v.x))){status(hMode==='advance'?'Text spacing alignment needs typography information on every label. Re-export these labels from Text to SVG or choose Visible artwork centre.':'Reference-letter alignment needs saved reference-letter information on every label. Choose the reference character in Text to SVG, export again, and re-import.','error');return;}
 if(anchors.some(v=>!v.f)){status(vMode==='baseline'?'One or more SVGs have no baseline guide. Select each plain SVG separately, press “Mark baseline on canvas”, and click where its main letters sit. Then try again.':'One or more labels do not have that guide. Re-export from Text to SVG or choose Visible artwork centre.','error');return;}
 const first=anchors[0],normal={x:-first.f.d.y,y:first.f.d.x};
 if(anchors.some(v=>Math.abs(first.f.d.x*v.f.d.y-first.f.d.y*v.f.d.x)>.01)){status('The selected text guides point in different directions. Rotate the labels to the same angle before matching them.','error');return;}
 const firstNormal=first.f.p.x*normal.x+first.f.p.y*normal.y;snap();let moved=0;
 for(const v of anchors.slice(1)){
  const thisNormal=v.f.p.x*normal.x+v.f.p.y*normal.y,verticalDelta=firstNormal-thisNormal;
  const dx=first.x-v.x+normal.x*verticalDelta,dy=normal.y*verticalDelta;
  if(moveLayerWorld(v.o.l,dx,dy))moved++;
 }
 render();persistBadgeDraft();const names={baseline:'baselines',cap:'capital-letter height lines','x-height':'lowercase x-height lines',bounds:'visible artwork centres',ink:'ink centres'};
 status(`Matched ${moved+1} labels to the first selected label using ${hMode==='visible'?'visible artwork':hMode==='advance'?'text spacing':'reference letter'} horizontally and ${names[vMode]||vMode} vertically. Font sizes and scales were preserved.`,'ok');
}
function startManualBaselinePick(){
 const records=alignmentRecords();if(records.length!==1||!['svg','path','group'].includes(records[0].l.type)){status('Select one imported SVG, path or group layer first.','error');return;}
 const l=records[0].l; if($('bcTypographyAlignMode'))$('bcTypographyAlignMode').value='baseline';snap();window.__gspManualBaselinePick=l.id;$('bcCursor').textContent='Writing-line picker active · click where the main letters rest';status('Writing-line marker active. Click on the artboard at the line where ordinary letters sit — not at the bottom of y or g. Press Esc to cancel.','ok');
}
function gridAssignmentsFor(records){
 const columns=Math.max(1,Math.min(50,Math.floor(num($('bcTidyColumns')?.value,3))));
 return records.map((o,i)=>({o,row:Math.max(1,Math.min(50,Math.floor(num(o.l.gridRow,Math.floor(i/columns)+1)))),column:Math.max(1,Math.min(50,Math.floor(num(o.l.gridColumn,i%columns+1))))}));
}
function renderGridAssignments(){
 const root=$('bcGridAssignments');if(!root)return;root.replaceChildren();const items=selectedRoots();if(!items.length){const note=document.createElement('div');note.className='bc-align-note';note.textContent='Select layers to assign row and column positions.';root.append(note);return;}
 const columns=Math.max(1,Math.min(50,Math.floor(num($('bcTidyColumns')?.value,3))));
 items.forEach((layer,i)=>{const row=document.createElement('div');row.className='bc-grid-assignment';const name=document.createElement('span');name.className='bc-grid-assignment-name';name.textContent=layer.name||layer.type;name.title=layer.name||layer.type;const make=(field,label,value)=>{const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type='number';input.min='1';input.max='50';input.step='1';input.value=String(Math.max(1,Math.min(50,Math.floor(num(layer[field],value)))));input.setAttribute('aria-label',`${label} for ${layer.name||layer.type}`);input.addEventListener('change',()=>{const next=Math.max(1,Math.min(50,Math.floor(num(input.value,1))));input.value=String(next);if(num(layer[field],NaN)!==next){snap();layer[field]=next;persistBadgeDraft();status(`${layer.name||'Layer'} assigned to row ${field==='gridRow'?next:layer.gridRow||Math.floor(i/columns)+1}, column ${field==='gridColumn'?next:layer.gridColumn||i%columns+1}.`,'ok');}});wrap.append(input);return wrap;};row.append(name,make('gridRow','Row',Math.floor(i/columns)+1),make('gridColumn','Col',i%columns+1));root.append(row);});
}
function autoAssignGridCells(){
 clearInsetPreviewBeforeLayout();
 const records=alignmentRecords();if(records.length<1){status('Select at least one visible unlocked layer.','error');return;}
 const columns=Math.max(1,Math.min(50,Math.floor(num($('bcTidyColumns')?.value,3)))),sorted=[...records].sort((a,b)=>a.b.y===b.b.y?a.b.x-b.b.x:a.b.y-b.b.y);snap();sorted.forEach((o,i)=>{o.l.gridRow=Math.floor(i/columns)+1;o.l.gridColumn=i%columns+1;});render();persistBadgeDraft();status(`Assigned ${sorted.length} layers to ${columns}-column grid cells.`,'ok');
}
function applyManualGridCells(){
 clearInsetPreviewBeforeLayout();
 const records=alignmentRecords();if(!records.length){status('Select at least one visible unlocked layer.','error');return;}
 const assigned=gridAssignmentsFor(records),gapX=Math.max(0,Math.min(10000,num($('bcTidyGapX')?.value,16))),gapY=Math.max(0,Math.min(10000,num($('bcTidyGapY')?.value,16))),useBias=!!$('bcUseOpticalBias')?.checked;
 const maxCol=Math.max(...assigned.map(v=>v.column)),maxRow=Math.max(...assigned.map(v=>v.row)),colWidths=Array(maxCol).fill(0),rowHeights=Array(maxRow).fill(0),all=unionBounds(records);
 assigned.forEach(v=>{colWidths[v.column-1]=Math.max(colWidths[v.column-1],v.o.b.w);rowHeights[v.row-1]=Math.max(rowHeights[v.row-1],v.o.b.h);});
 const colX=[],rowY=[],colBias=Array(maxCol).fill(0),rowBias=Array(maxRow).fill(0),colCounts=Array(maxCol).fill(0),rowCounts=Array(maxRow).fill(0);
 if(useBias)assigned.forEach(v=>{colBias[v.column-1]+=num(v.o.l.opticalGapX);rowBias[v.row-1]+=num(v.o.l.opticalGapY);colCounts[v.column-1]++;rowCounts[v.row-1]++;});
 const xBias=colBias.map((v,i)=>useBias&&colCounts[i]?v/colCounts[i]:0),yBias=rowBias.map((v,i)=>useBias&&rowCounts[i]?v/rowCounts[i]:0);
 let x=all.x,y=all.y;for(let c=0;c<maxCol;c++){colX[c]=x;x+=colWidths[c]+Math.max(0,gapX+xBias[c]);}for(let r=0;r<maxRow;r++){rowY[r]=y;y+=rowHeights[r]+Math.max(0,gapY+yBias[r]);}
 const cells=new Map();assigned.forEach(v=>{const key=`${v.row}:${v.column}`;cells.set(key,(cells.get(key)||0)+1);});
 snap();let moved=0;for(const v of assigned){const cx=colX[v.column-1]+(colWidths[v.column-1]-v.o.b.w)/2,cy=rowY[v.row-1]+(rowHeights[v.row-1]-v.o.b.h)/2;if(moveLayerWorld(v.o.l,cx-v.o.b.x,cy-v.o.b.y))moved++;}
 render();persistBadgeDraft();const collisions=[...cells.values()].filter(n=>n>1).length;status(`Placed ${moved} layers in manually assigned grid cells.${collisions?` ${collisions} cell(s) contain stacked objects.`:''}`,'ok');
}
function tidySelection(mode){
 clearInsetPreviewBeforeLayout();
 const records=alignmentRecords();if(records.length<2){status('Select at least two visible unlocked layers to arrange.','error');return;}
 const gapX=Math.max(0,Math.min(10000,num($('bcTidyGapX')?.value,16))),gapY=Math.max(0,Math.min(10000,num($('bcTidyGapY')?.value,16))),useBias=!!$('bcUseOpticalBias')?.checked;
 const sorted=[...records].sort((a,b)=>a.b.y===b.b.y?a.b.x-b.b.x:a.b.y-b.b.y);const all=unionBounds(records);let targets=[];
 if(mode==='x'){
  const ordered=[...records].sort((a,b)=>a.b.x-b.b.x);let cursor=all.x;const cy=all.y+all.h/2;for(const o of ordered){targets.push({o,dx:cursor-o.b.x,dy:cy-(o.b.y+o.b.h/2)});cursor+=o.b.w+gapX+(useBias?num(o.l.opticalGapX):0);}
 }else if(mode==='y'){
  const ordered=[...records].sort((a,b)=>a.b.y-b.b.y);let cursor=all.y;const cx=all.x+all.w/2;for(const o of ordered){targets.push({o,dx:cx-(o.b.x+o.b.w/2),dy:cursor-o.b.y});cursor+=o.b.h+gapY+(useBias?num(o.l.opticalGapY):0);}
 }else{
  const columns=Math.max(1,Math.min(50,Math.floor(num($('bcTidyColumns')?.value,3))));const rows=Math.ceil(sorted.length/columns),colWidths=Array(columns).fill(0),rowHeights=Array(rows).fill(0);
  sorted.forEach((o,i)=>{const c=i%columns,r=Math.floor(i/columns);colWidths[c]=Math.max(colWidths[c],o.b.w);rowHeights[r]=Math.max(rowHeights[r],o.b.h);});
  const colX=[],rowY=[],colBias=Array(columns).fill(0),rowBias=Array(rows).fill(0),colCounts=Array(columns).fill(0),rowCounts=Array(rows).fill(0);
  if(useBias)sorted.forEach((o,i)=>{const c=i%columns,r=Math.floor(i/columns);colBias[c]+=num(o.l.opticalGapX);rowBias[r]+=num(o.l.opticalGapY);colCounts[c]++;rowCounts[r]++;});
  let x=all.x,y=all.y;for(let c=0;c<columns;c++){colX[c]=x;x+=colWidths[c]+Math.max(0,gapX+(useBias&&colCounts[c]?colBias[c]/colCounts[c]:0));}for(let r=0;r<rows;r++){rowY[r]=y;y+=rowHeights[r]+Math.max(0,gapY+(useBias&&rowCounts[r]?rowBias[r]/rowCounts[r]:0));}
  sorted.forEach((o,i)=>{const c=i%columns,r=Math.floor(i/columns),targetX=colX[c]+(colWidths[c]-o.b.w)/2,targetY=rowY[r]+(rowHeights[r]-o.b.h)/2;targets.push({o,dx:targetX-o.b.x,dy:targetY-o.b.y});});
 }
 snap();let moved=0;for(const t of targets)if(moveLayerWorld(t.o.l,t.dx,t.dy))moved++;
 render();status(`Arranged ${moved} layers in a ${mode==='x'?'horizontal row':mode==='y'?'vertical column':'grid'}${useBias&&mode!=='grid'?' with optical gap adjustments':''}.`,'ok');
}

function chooseKeyObject(id){
 const active=findLayer(id);if(!isLayerEffectivelyAvailable(active)){status('The key object and all of its parent groups must be visible and unlocked.','error');return false;}
 let parent=findParent(id)?.parent;while(parent){selectedIds.delete(parent.id);parent=findParent(parent.id)?.parent;}
 selectedIds.add(id);selectedId=id;keyObjectId=id;renderList();renderInspector();renderCanvas();status(`“${active.name}” is now the key alignment object.`,'ok');persistBadgeDraft();return true;
}
function setActiveKeyObject(){if(!selectedId||!selectedIds.has(selectedId)){status('Select a layer to use as the key object.','error');return;}chooseKeyObject(selectedId);}
document.querySelectorAll('[data-align]').forEach(b=>b.addEventListener('click',()=>alignSelection(b.dataset.align)));
document.querySelectorAll('[data-distribute]').forEach(b=>b.addEventListener('click',()=>distributeSelection(b.dataset.distribute)));
document.querySelectorAll('[data-distribute-centers]').forEach(b=>b.addEventListener('click',()=>distributeCenters(b.dataset.distributeCenters)));
document.querySelectorAll('[data-center-selection]').forEach(b=>b.addEventListener('click',()=>centerSelection(b.dataset.centerSelection)));
document.querySelectorAll('[data-tidy]').forEach(b=>b.addEventListener('click',()=>tidySelection(b.dataset.tidy)));
$('bcJumpTypography')?.addEventListener('click',()=>{const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;$('bcStageWrap')?.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});$('bcCenterArtwork')?.focus();});$('bcSetKeyObject').onclick=setActiveKeyObject;$('bcApplyExactGap').onclick=applyExactSpacing;$('bcAlignTextBaseline').onclick=alignTextBaselines;$('bcTypographyAlignMode').onchange=()=>{renderCanvas();updateBadgeTypographyPanel();};$('bcTypographyHorizontalMode').onchange=()=>updateBadgeTypographyPanel();$('bcCenterTypography').onclick=centerSelectedTypography;if($('bcPickBaseline'))$('bcPickBaseline').onclick=startManualBaselinePick;$('bcTypographyReferenceCharacter').onchange=()=>updateBadgeTypographyPanel();$('bcOpenTextSettings').onclick=()=>{if(!$('modeTextBtn').classList.contains('active'))$('modeTextBtn').click();const d=$('textCanvasAlignmentSettings');if(d)d.open=true;d?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});};window.addEventListener('keydown',e=>{const active=document.activeElement,tag=active?.tagName;if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||active?.isContentEditable||active?.closest?.('[contenteditable="true"]'))return;if(e.key==='Escape'&&window.__gspManualBaselinePick){window.__gspManualBaselinePick=null;$('bcCursor').textContent='';status('Baseline picking cancelled.','ok');}});
$('bcAlignReference').onchange=()=>{$('bcSetKeyObject').disabled=!selectedId||!selectedIds.has(selectedId);};$('bcThicknessBias').addEventListener('input',()=>{$('bcThicknessBiasValue').textContent=`${Number($('bcThicknessBias').value).toFixed(1)}%`;});$('bcThicknessUseSiblingCalibration')?.addEventListener('change',updateThicknessMatchControls);$('bcMatchIconSizes').onclick=matchSelectedIconSizes;$('bcMatchThickness').onclick=matchSelectedVisualThickness;$('bcGridAutoAssign').onclick=autoAssignGridCells;$('bcApplyManualGrid').onclick=applyManualGridCells;
$('bcNew').onclick=()=>{if(confirm('Start a new blank badge? Unsaved changes will be replaced.'))loadPreset('empty');};$('bcDeleteSelected').onclick=deleteSelectedLayers;$('bcGroup').onclick=groupSelected;$('bcUngroup').onclick=ungroupSelected;$('bcDuplicate').onclick=()=>selectedId&&duplicate(selectedId);$('bcUndo').onclick=undo;$('bcRedo').onclick=redo;
$('bcChecker').onchange=e=>{$('bcStage').classList.toggle('bc-checker',e.target.checked);};$('bcShowCenterGuides').onchange=()=>renderCanvas();$('bcShowTypographyGuides').onchange=()=>renderCanvas();$('bcGrid').onchange=e=>{gridOn=e.target.checked;renderCanvas();};$('bcGridSize').onchange=e=>{e.target.value=Math.max(2,Math.min(200,Math.round(num(e.target.value,10))));renderCanvas();};$('bcSnap').onchange=e=>snapOn=e.target.checked;$('bcAutoWidth').onclick=autoWidthToArtwork;$('bcFitCanvas').onclick=fitCanvasToArtwork;$('bcFitArtwork').onclick=fitArtworkToCanvas;$('bcCenterArtwork').onclick=()=>centerArtwork(false);$('bcCommonBaseline').onclick=()=>centerArtwork(true);const bcIconMatchPrefKey='glyphStudioSmartCenterMatchIconSizeV1';try{const savedIconMatch=localStorage.getItem(bcIconMatchPrefKey);if(savedIconMatch!==null)$('bcAutoMatchIconSize').checked=savedIconMatch!=='false';}catch(_){}$('bcAutoMatchIconSize').addEventListener('change',e=>{try{localStorage.setItem(bcIconMatchPrefKey,e.target.checked?'true':'false');}catch(_){}});const bcIconAlignPrefKey='glyphStudioIconVerticalAlignV1';try{const savedIconAlign=localStorage.getItem(bcIconAlignPrefKey);if(['center','baseline'].includes(savedIconAlign))$('bcIconVerticalAlign').value=savedIconAlign;}catch(_){}$('bcIconVerticalAlign').addEventListener('change',e=>{const value=e.target.value==='baseline'?'baseline':'center';try{localStorage.setItem(bcIconAlignPrefKey,value);}catch(_){}});$('bcZoom').oninput=e=>{zoom=num(e.target.value,100);autoFit=false;renderCanvas();};function fitStage(){const wrap=$('bcStageWrap');if(!wrap||!wrap.clientWidth)return;const maxW=Math.max(24,wrap.clientWidth-56),maxH=Math.max(24,wrap.clientHeight-56);zoom=Math.max(1,Math.min(2000,maxW/Math.max(1,W)*100,maxH/Math.max(1,H)*100));$('bcZoom').value=String(Math.round(zoom));autoFit=true;renderCanvas();}$('bcFit').onclick=fitStage;window.addEventListener('resize',()=>{if(composer.classList.contains('active')&&autoFit)fitStage();});if('ResizeObserver'in window){const stageResizeObserver=new ResizeObserver(()=>{if(composer.classList.contains('active')&&autoFit)requestAnimationFrame(fitStage);});stageResizeObserver.observe($('bcStageWrap'));}
function svgPoint(evt){const svg=$('bcStage'),pt=svg.createSVGPoint();pt.x=evt.clientX;pt.y=evt.clientY;const m=svg.getScreenCTM();if(!m)return{x:0,y:0};const p=pt.matrixTransform(m.inverse());return{x:p.x,y:p.y};}
$('bcStage').addEventListener('pointerdown',e=>{
 const id=window.__gspManualBaselinePick;if(!id)return;const layer=findLayer(id);if(!layer||!['svg','path','group'].includes(layer.type)){window.__gspManualBaselinePick=null;return;}
 try{const outer=getLayerNode(id),node=layer.type==='svg'?(outer?.querySelector('svg')||outer):outer,matrix=getCanvasRelativeMatrix(node),inverse=matrix&&invertAffineMatrix(matrix);if(!node||!inverse)throw Error('Could not map the canvas click into this artwork.');const p=svgPoint(e),local=transformPoint2D(p.x,p.y,inverse);let b={x:num(layer.viewX),y:num(layer.viewY),width:num(layer.viewW,layer.w),height:num(layer.viewH,layer.h)};try{const measured=node.getBBox();if([measured.x,measured.y,measured.width,measured.height].every(Number.isFinite)&&measured.width+measured.height>0)b=measured;}catch(_){}const capY=Math.min(local.y,b.y),capHeight=Math.max(0,local.y-capY);layer.typography={...(layer.typography||{}),version:2,engine:'manual',text:String(layer.name||'Manually marked artwork').slice(0,4000),fontFamily:'Manual guide',fontSize:1,unitsPerEm:1,ascender:0,descender:0,capHeight,baselineModel:'manual',baselineX:b.x+b.width/2,baselineY:local.y,capY,horizontalBasis:'visible',verticalBasis:'baseline'};window.__gspManualBaselinePick=null;render();persistBadgeDraft();$('bcCursor').textContent='Writing line saved';status('Writing line saved for this artwork. Its upper visible edge is used only as an approximate capital-height guide. Repeat for each label, select them together, then press “Common baseline”.','ok');}catch(err){window.__gspManualBaselinePick=null;status('Could not save the writing line: '+err.message,'error');}e.preventDefault();e.stopImmediatePropagation();
},true);
$('bcStage').addEventListener('pointerdown',e=>{const transformHandle=e.target.closest('[data-transform-handle]');if(transformHandle&&!pathEditId){const box=selectionBox();if(box){const p=svgPoint(e),kind=transformHandle.dataset.transformHandle,cx=box.x+box.w/2,cy=box.y+box.h/2; snap();drag={pointerId:e.pointerId,kind:kind==='rotate'?'rotate-selection':'resize-selection',handle:kind,box:{x:box.x,y:box.y,w:box.w,h:box.h,cx,cy},start:p,origins:box.chosen.map(item=>({id:item.id,world:getLayerModelMatrix(item.id)})),startAngle:Math.atan2(p.y-cy,p.x-cx)};$('bcStage').setPointerCapture(e.pointerId);e.preventDefault();return;}}const handle=e.target.closest('[data-path-index][data-path-role]');if(handle&&pathEditId){const l=findLayer(pathEditId);if(!l||l.locked||hasLockedAncestor(l))return;const matrix=pathStageMatrix(l);if(!matrix)return;const inverse=matrix.inverse();snap();drag={pointerId:e.pointerId,kind:'node',id:l.id,segIndex:Number(handle.dataset.pathIndex),role:handle.dataset.pathRole,inverse};$('bcStage').setPointerCapture(e.pointerId);e.preventDefault();return;}const g=e.target.closest('[data-layer-id]');if(!g)return;const l=findLayer(g.dataset.layerId);if(!l||l.locked||hasLockedAncestor(l))return;if(!selectedIds.has(l.id))select(l.id,e.ctrlKey||e.metaKey);if(l.locked||hasLockedAncestor(l))return;const movable=selectedRoots();if(!movable.length)return;snap();const dragContext=buildLayerDragContext();drag={pointerId:e.pointerId,kind:movable.length>1?'multi-layer':'layer',start:svgPoint(e),origins:movable.map(item=>{const parentMatrix=dragContext.parentMatrices.get(item.id)||{a:1,b:0,c:0,d:1,e:0,f:0};return{id:item.id,layer:item,node:dragContext.nodeMap.get(item.id)||null,parentMatrix,x:item.x,y:item.y,x2:item.x2,y2:item.y2,worldOrigin:transformPoint2D(num(item.x),num(item.y),parentMatrix)};})};$('bcStage').setPointerCapture(e.pointerId);});
$('bcStage').addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointerId)return;const p=svgPoint(e),l=drag.kind==='node'?findLayer(drag.id):null;if(drag.kind==='rotate-selection'){const b=drag.box,angle=Math.atan2(p.y-b.cy,p.x-b.cx),delta=(angle-drag.startAngle)*180/Math.PI,a=delta*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a),around={a:cs,b:sn,c:-sn,d:cs,e:b.cx-cs*b.cx+sn*b.cy,f:b.cy-sn*b.cx-cs*b.cy};for(const o of drag.origins){const item=findLayer(o.id);if(item&&o.world)setLayerWorldMatrix(item,multiplyAffineMatrices(around,o.world));}renderCanvas();$('bcCursor').textContent=`Rotation · ${delta.toFixed(1)}°`;return;}if(drag.kind==='resize-selection'){const b=drag.box,h=drag.handle;let left=b.x,right=b.x+b.w,top=b.y,bottom=b.y+b.h;if(h.includes('w'))left=p.x;if(h.includes('e'))right=p.x;if(h.includes('n'))top=p.y;if(h.includes('s'))bottom=p.y;const anchorX=h.includes('w')?b.x+b.w:h.includes('e')?b.x:b.x+b.w/2,anchorY=h.includes('n')?b.y+b.h:h.includes('s')?b.y:b.y+b.h/2;let sx=(right-left)/(b.w||1),sy=(bottom-top)/(b.h||1);if(e.shiftKey){const factor=Math.abs(sx-1)>Math.abs(sy-1)?sx:sy;sx=sy=factor;}if(!h.includes('e')&&!h.includes('w'))sx=1;if(!h.includes('n')&&!h.includes('s'))sy=1;if(!Number.isFinite(sx)||!Number.isFinite(sy))return;sx=Math.max(.02,Math.min(50,sx));sy=Math.max(.02,Math.min(50,sy));const around={a:sx,b:0,c:0,d:sy,e:anchorX*(1-sx),f:anchorY*(1-sy)};for(const o of drag.origins){const item=findLayer(o.id);if(item&&o.world)setLayerWorldMatrix(item,multiplyAffineMatrices(around,o.world));}renderCanvas();$('bcCursor').textContent=`Resize · ${Math.round(sx*100)}% × ${Math.round(sy*100)}%`;return;}if(drag.kind==='node'){try{const local=$('bcStage').createSVGPoint();local.x=p.x;local.y=p.y;const q=local.matrixTransform(drag.inverse),segs=parseEditablePath(l.d);const seg=segs[drag.segIndex];if(!seg)return;clearStoredThinning(l);const current=pathHandlePoint(seg,drag.role);if(!current)return;current.x=q.x;current.y=q.y;l.d=editablePathToString(segs);renderCanvas();$('bcCursor').textContent=`Path point · X ${q.x.toFixed(2)} · Y ${q.y.toFixed(2)}`;}catch(err){status('Path edit failed: '+err.message,'error');}return;}let dx=p.x-drag.start.x,dy=p.y-drag.start.y;const fineDrag=!!e.shiftKey;if(fineDrag){dx*=.2;dy*=.2;}const first=drag.origins[0];if(snapOn&&!fineDrag){const snapStep=Math.max(2,Math.min(200,Math.round(num($('bcGridSize')?.value,10))));const anchor=first.worldOrigin||getLayerCanvasOrigin(findLayer(first.id));if(anchor){dx=Math.round((anchor.x+dx)/snapStep)*snapStep-anchor.x;dy=Math.round((anchor.y+dy)/snapStep)*snapStep-anchor.y;}}for(const o of drag.origins){const item=o.layer||findLayer(o.id);if(!item)continue;restoreLayerDragOriginFast(item,o,dx,dy);}if((drag.kind==='layer'||drag.kind==='multi-layer')&&!pathEditId)queueFastTranslationDragFrame(drag,dx,dy);else renderCanvas();$('bcCursor').textContent=drag.origins.length>1?`Selection · ${drag.origins.length} objects${fineDrag?' · fine':''}`:`X ${((first.worldOrigin?.x??first.x)+dx).toFixed(2)} · Y ${((first.worldOrigin?.y??first.y)+dy).toFixed(2)}${fineDrag?' · fine':''}`;});
function finishBadgePointerGesture(interrupted=false,event=null){if(!drag||(event&&event.pointerId!==drag.pointerId))return;const state=drag,kind=state.kind,fastTranslation=kind==='layer'||kind==='multi-layer';if(fastTranslation)flushFastTranslationDragFrame(state);drag=null;try{if($('bcStage').hasPointerCapture?.(state.pointerId))$('bcStage').releasePointerCapture(state.pointerId);}catch(_){}persistBadgeDraft();renderList();renderInspector();status(interrupted?'Pointer gesture interrupted; the last visible edit was saved.':kind==='node'?'Path node updated.':kind==='multi-layer'?'Selected objects moved together.':kind==='resize-selection'?'Selection resized.':kind==='rotate-selection'?'Selection rotated.':'Layer position updated.',interrupted?'warn':'ok');}
$('bcStage').addEventListener('pointerup',e=>finishBadgePointerGesture(false,e));$('bcStage').addEventListener('pointercancel',e=>finishBadgePointerGesture(true,e));
$('bcFontFile').onchange=async e=>{const file=e.target.files?.[0],l=current();if(!file||!l||l.type!=='text')return;try{const ot=await ensureOpenType();const buf=await file.arrayBuffer(),parsed=ot.parse(buf);snap();fonts.set(l.id,parsed);l.fontData=arrayBufferToBase64(buf);l.fontName=parsed.names.fontFamily?.en||file.name;l.fontFamily=l.fontName;l.pathMode=true;render();status(`Loaded ${file.name}; text path preview enabled.`,'ok');}catch(err){status('Font load failed: '+err.message,'error');}e.target.value='';};
async function ensureOpenType(){if(window.opentype)return window.opentype;if(opentypePromise)return opentypePromise;opentypePromise=(async()=>{let last;for(const u of ['js/vendor/opentype.min.js','https://cdn.jsdelivr.net/npm/opentype.js@2.0.0/dist/opentype.min.js','https://unpkg.com/opentype.js@2.0.0/dist/opentype.min.js']){try{await new Promise((res,rej)=>{const sc=document.createElement('script');sc.src=u;const sri=CDN_SRI[u];if(sri){sc.integrity=sri;sc.crossOrigin='anonymous';}const timer=setTimeout(()=>{sc.remove();rej(Error('OpenType.js CDN request timed out'));},6500);sc.onload=()=>{clearTimeout(timer);window.opentype?res():rej(Error('OpenType.js not available'));};sc.onerror=()=>{clearTimeout(timer);rej(Error('CDN failed'));};document.head.append(sc);});return window.opentype;}catch(e){last=e;}}throw last||Error('Font engine unavailable');})();try{return await opentypePromise;}finally{opentypePromise=null;}}
function arrayBufferToBase64(buf){const bytes=new Uint8Array(buf);let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out);}
function base64ToBuffer(b64){const bin=atob(b64),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes.buffer;}
$('bcImageFile').onchange=async e=>{const f=e.target.files?.[0],target=imageReplaceTargetId?findLayer(imageReplaceTargetId):null;if(!f)return;try{if(f.size>15000000)throw Error('Image import is limited to 15 MB.');if(!/^image\/(?:png|jpeg|webp|gif)$/.test(f.type))throw Error('Choose a PNG, JPG, WebP or GIF image.');const url=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(Error('The image file could not be read.'));r.readAsDataURL(f);});if(target?.type==='image'){snap();target.href=url;target.name=f.name;render();status('Image source replaced.','ok');}else add('image',{name:f.name,href:url,w:120,h:80});}catch(err){status('Image import failed: '+err.message,'error');}finally{imageReplaceTargetId=null;e.target.value='';}};
function svgAbsoluteLengthToCssPx(value,fallback=NaN){if(value==null||String(value).trim()==='')return fallback;const m=String(value).trim().match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(px|pt|pc|mm|cm|in|q)?$/i);if(!m)return fallback;const n=Number(m[1]),unit=(m[2]||'px').toLowerCase(),factors={px:1,pt:96/72,pc:16,mm:96/25.4,cm:96/2.54,in:96,q:96/101.6};return Number.isFinite(n)?n*factors[unit]:fallback;}
function parseSvgLength(v,fallback=0,axis='x',context={}){if(v==null||String(v).trim()==='')return fallback;const m=String(v).trim().match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(px|pt|pc|mm|cm|in|q|%)?$/i);if(!m)return fallback;const n=Number(m[1]),unit=(m[2]||'').toLowerCase();if(!Number.isFinite(n))return fallback;if(!unit)return n;const width=Number(context.width)||100,height=Number(context.height)||100,base=axis==='y'?height:axis==='diag'?Math.hypot(width,height)/Math.SQRT2:width;if(unit==='%')return n*base/100;const factors={px:1,pt:96/72,pc:16,mm:96/25.4,cm:96/2.54,in:96,q:96/101.6},cssPx=n*factors[unit],userScale=axis==='y'?Number(context.userUnitsPerCssY??context.userUnitsPerCss??1):axis==='diag'?Number(context.userUnitsPerCssDiag??context.userUnitsPerCss??1):Number(context.userUnitsPerCssX??context.userUnitsPerCss??1);return cssPx*(Number.isFinite(userScale)&&userScale>0?userScale:1);}
function sanitizeTypographyMetadata(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const out={version:Math.max(1,Math.min(2,Math.floor(Number(raw.version)||1)))};
 const strings={engine:24,text:4000,fontFamily:256,fontFile:256,horizontalBasis:24,verticalBasis:24,hAlign:12,vAlign:12,referenceGlyph:32,capHeightSource:64,xHeightSource:64,baselineModel:32};
 for(const [k,max] of Object.entries(strings))if(typeof raw[k]==='string'){if(raw[k].length>max)throw Error(`Layer field ${k} exceeds the supported ${max.toLocaleString()}-character limit.`);out[k]=raw[k];}
 const nums=['fontSize','opticalFineTune','unitsPerEm','ascender','descender','capHeight','xHeight','baselineX','baselineY','capY','xHeightY','advanceStartX','advanceEndX','referenceGlyphIndex'];
 for(const k of nums)if(Number.isFinite(Number(raw[k])))out[k]=Math.max(-100000,Math.min(100000,Number(raw[k])));
 if(raw.referenceGlyphBounds&&typeof raw.referenceGlyphBounds==='object'){
  const b=raw.referenceGlyphBounds,values=['x1','y1','x2','y2'].map(k=>Number(b[k]));
  if(values.every(Number.isFinite))out.referenceGlyphBounds={x1:values[0],y1:values[1],x2:values[2],y2:values[3]};
 }
 if(raw.inkCentroid&&typeof raw.inkCentroid==='object'){
  const x=Number(raw.inkCentroid.x),y=Number(raw.inkCentroid.y);if(Number.isFinite(x)&&Number.isFinite(y))out.inkCentroid={x,y};
 }
 if(!Number.isFinite(out.baselineY)||!Number.isFinite(out.fontSize)||!Number.isFinite(out.capHeight))return null;
 if(!['baseline','cap-center','x-center','bounds','ink'].includes(out.verticalBasis))out.verticalBasis='baseline';
 if(!['visible','advance','reference'].includes(out.horizontalBasis))out.horizontalBasis='visible';
 return out;
}
function svgAttributeHasExternalUrl(value){const urls=[...String(value||'').matchAll(/url\s*\(([^)]*)\)/gi)];return urls.some(m=>!/^\s*(['"]?)#[-\w:.]+\1\s*$/.test(m[1]))}
function sanitizeSvg(svgText){
 let doc=new DOMParser().parseFromString(svgText,'image/svg+xml');
 if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('The file is not valid SVG.');
 // Standalone SVGs from icon tools sometimes omit xmlns; normalize only that case.
 if(!doc.documentElement.namespaceURI){
  const normalized=String(svgText).replace(/<svg\b(?![^>]*\bxmlns\s*=)/i,'<svg xmlns="'+NS+'"');
  if(normalized!==String(svgText)){
   doc=new DOMParser().parseFromString(normalized,'image/svg+xml');
   if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg'||doc.documentElement.namespaceURI!==NS)throw Error('The SVG namespace could not be normalized.');
  }
 }
 const root=doc.documentElement,importWarnings=[];
 const noteOnce=message=>{if(!importWarnings.includes(message))importWarnings.push(message);};
 // Active content is intentionally removed. SVG animation is imported as its
 // static first frame/state; this editor does not reproduce animation timelines.
 root.querySelectorAll('script,iframe,object,embed,audio,video').forEach(n=>{noteOnce('Active scripts or embedded interactive media were removed for safety.');n.remove();});
 root.querySelectorAll('foreignObject').forEach(n=>{noteOnce('HTML foreignObject content was removed for safety; its surrounding SVG artwork was retained.');n.remove();});
 root.querySelectorAll('animate,animateTransform,animateMotion,set,discard').forEach(n=>{noteOnce('SVG animation elements were removed; only the static artwork state is retained.');n.remove();});
 root.querySelectorAll('style').forEach(node=>{
  let css=node.textContent||'';
  if(/@import|@namespace|expression\s*\(|javascript:|behavior\s*:|-moz-binding/i.test(css)){
   noteOnce('A stylesheet containing active or external CSS instructions was removed for safety.');node.remove();return;
  }
  if(/@font-face/i.test(css))noteOnce('CSS font-face rules are preserved only for local or embedded fonts. External font URLs are removed; text may use a fallback font if its font data is not embedded.');
  const externalCssUrl=/url\(\s*(['"]?)(?!#|data:(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|font\/(?:woff2?|ttf|otf));base64,)[^)]+\)/i;
  if(externalCssUrl.test(css))noteOnce('External CSS resources were removed; local fragment references and embedded base64 image/font data are retained.');
  const externalCssUrlAll=/url\(\s*(['"]?)(?!#|data:(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|font\/(?:woff2?|ttf|otf));base64,)[^)]+\)/gi;
  css=css.replace(externalCssUrlAll,'none');node.textContent=css;
 });
 [root,...root.querySelectorAll('*')].forEach(el=>{
  [...el.attributes].forEach(a=>{
   const n=a.name.toLowerCase(),v=a.value.trim();
   if(n.startsWith('on')){el.removeAttribute(a.name);noteOnce('Event-handler attributes were removed for safety.');return;}
   if((n==='href'||n.endsWith(':href'))&&!v.startsWith('#')&&!/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,/i.test(v)){
    if(el.localName==='use'){
     noteOnce('An external <use> reference was removed. External symbol files are not fetched; include the symbol in this SVG to retain it.');
     el.remove();return;
    }else if(el.localName==='image'){
     noteOnce('An external linked image was removed. Embed the image as a data URI to keep it self-contained.');
     el.remove();return;
    }else noteOnce('An external link/reference was removed. External resources are not fetched during import.');
    el.removeAttribute(a.name);return;
   }
    if(svgAttributeHasExternalUrl(v)){el.removeAttribute(a.name);noteOnce('External CSS/SVG resource URLs were removed; internal #id references are retained.');}
   if((n==='style'||n==='filter'||n==='fill'||n==='stroke')&&/(?:javascript:|expression\s*\()/i.test(v)){el.removeAttribute(a.name);noteOnce('Unsafe CSS declarations were removed for safety.');}
  });
 });
 // Namespace every imported ID so two imported SVGs cannot cross-link definitions.
 const idMap=new Map(),prefix='gsp'+Math.random().toString(36).slice(2,10)+'-';
 [root,...root.querySelectorAll('[id]')].forEach(el=>{if(!el.hasAttribute?.('id'))return;const old=el.getAttribute('id');if(!old)return;const next=prefix+old.replace(/[^a-zA-Z0-9_.-]/g,'_');idMap.set(old,next);el.setAttribute('id',next);});
 root.querySelectorAll('style').forEach(node=>{let css=node.textContent||'';for(const [old,next] of idMap)css=css.replace(new RegExp('(#)'+old.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![a-zA-Z0-9_.-])','g'),'$1'+next);node.textContent=css;});
 [root,...root.querySelectorAll('*')].forEach(el=>{[...el.attributes].forEach(a=>{let v=a.value;if((a.name==='href'||a.name.endsWith(':href'))&&v.startsWith('#')&&idMap.has(v.slice(1)))v='#'+idMap.get(v.slice(1));v=v.replace(/url\(\s*(['"]?)#([^)\s'"]+)\1\s*\)/g,(m,q,id)=>idMap.has(id)?`url(#${idMap.get(id)})`:m);if(v!==a.value)el.setAttribute(a.name,v);});});
 root.setAttribute('xmlns',NS);
 const vb=(root.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number),validViewBox=vb.length===4&&vb.every(Number.isFinite)&&vb[2]>0&&vb[3]>0,rawWidth=root.getAttribute('width'),rawHeight=root.getAttribute('height'),widthPercent=/%\s*$/.test(String(rawWidth||'')),heightPercent=/%\s*$/.test(String(rawHeight||'')),cssViewportW=svgAbsoluteLengthToCssPx(rawWidth,300),cssViewportH=svgAbsoluteLengthToCssPx(rawHeight,150),viewX=validViewBox?vb[0]:0,viewY=validViewBox?vb[1]:0,viewW=validViewBox?vb[2]:Math.max(.01,cssViewportW),viewH=validViewBox?vb[3]:Math.max(.01,cssViewportH),preserveAspectRatio=(root.getAttribute('preserveAspectRatio')||'xMidYMid meet').trim();let userUnitsPerCssX=1,userUnitsPerCssY=1;if(validViewBox){const sx=viewW/Math.max(.01,cssViewportW),sy=viewH/Math.max(.01,cssViewportH);if(/^none(?:\s|$)/i.test(preserveAspectRatio)){userUnitsPerCssX=sx;userUnitsPerCssY=sy;}else{const uniform=/slice/i.test(preserveAspectRatio)?Math.min(sx,sy):Math.max(sx,sy);userUnitsPerCssX=uniform;userUnitsPerCssY=uniform;}}const lengthContext={width:viewW,height:viewH,userUnitsPerCssX,userUnitsPerCssY,userUnitsPerCssDiag:Math.sqrt(userUnitsPerCssX*userUnitsPerCssY),unknownViewportPercent:!!((widthPercent||heightPercent)&&!validViewBox)},w=viewW,h=viewH;
 let typography=null;const metaNode=root.querySelector('metadata[data-gsp-kind="typography"]');if(metaNode){try{typography=sanitizeTypographyMetadata(JSON.parse(metaNode.textContent||'{}'));}catch(_){typography=null;}}
 const rootAttrs={};const rootKeep=['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','vector-effect','paint-order','fill-rule','clip-rule','color','font-family','font-size','font-weight','font-style','font-stretch','font-kerning','font-variant','font-feature-settings','font-variation-settings','font-optical-sizing','letter-spacing','word-spacing','text-anchor','text-decoration','text-transform','white-space','direction','unicode-bidi','writing-mode','dominant-baseline','alignment-baseline','baseline-shift','opacity','fill-opacity','stroke-opacity','shape-rendering','text-rendering','image-rendering','color-interpolation','color-interpolation-filters','color-rendering','overflow','clip','mix-blend-mode','isolation','style','preserveAspectRatio','transform','display','visibility','clip-path','mask','filter','marker-start','marker-mid','marker-end','class','id'];rootKeep.forEach(k=>{const v=root.getAttribute(k);if(v!==null)rootAttrs[k]=v;});
 return {root,rootAttrs,typography,markup:[...root.childNodes].filter(n=>n.nodeType===1).map(n=>new XMLSerializer().serializeToString(n)).join(''),w,h,viewX,viewY,viewW,viewH,lengthContext,preserveAspectRatio,importWarnings};
}
function styleMap(el,inherited={}){
 const out={...inherited};
 const names=['fill','stroke','color','dominant-baseline','alignment-baseline','opacity','fill-opacity','stroke-opacity','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','fill-rule','clip-rule','font-family','font-size','font-weight','font-style','font-stretch','font-kerning','font-variant','font-feature-settings','font-variation-settings','font-optical-sizing','letter-spacing','word-spacing','text-anchor','text-decoration','text-transform','white-space','direction','unicode-bidi','writing-mode','baseline-shift','display','visibility','transform','vector-effect','paint-order','clip-path','clip','mask','filter','marker-start','marker-mid','marker-end','shape-rendering','text-rendering','image-rendering','color-interpolation','color-interpolation-filters','mix-blend-mode','isolation','overflow','stop-color','stop-opacity','flood-color','flood-opacity'];
 for(const k of names){const v=el.getAttribute(k);if(v!==null)out[k]=v;}
 const style=el.getAttribute('style');if(style)style.split(';').forEach(pair=>{const i=pair.indexOf(':');if(i>0)out[pair.slice(0,i).trim().toLowerCase()]=pair.slice(i+1).trim();});
 return out;
}
// Normalize common Iconify SVG delivery variants for editable decomposition.
// SVG presentation can come from attributes, inline style, embedded style blocks,
// or inherited values. Resolve the browser's actual cascade on a temporary clone.
function expandSimpleLocalSvgUses(root,lengthContext={width:100,height:100}){
 const refs=new Map([...root.querySelectorAll('[id]')].map(el=>[el.getAttribute('id'),el]));
 let expansions=0;
 const safeTree=node=>{
  if(!node||node.namespaceURI!==NS)return false;
  if(['script','foreignObject','image','filter','mask','clipPath','pattern','linearGradient','radialGradient','marker','svg','text','textPath','tspan'].includes(node.localName))return false;
  for(const el of [node,...node.querySelectorAll('*')]){
   if(el!==node&&el.hasAttribute('id'))return false;
   for(const a of [...el.attributes]){
    const val=String(a.value||'');
    if((a.localName==='href'||a.name==='href'||a.name.endsWith(':href'))||/url\s*\(/i.test(val))return false;
   }
  }
  return true;
 };
 const expandWithin=(parent,stack=new Set(),depth=0)=>{
  if(depth>12)return false;
  for(const use of [...parent.querySelectorAll('use')].filter(el=>el.parentElement===parent)){
   if(++expansions>128)return false;
   const href=use.getAttribute('href')||use.getAttributeNS('http://www.w3.org/1999/xlink','href')||use.getAttribute('xlink:href')||'';
   if(!href.startsWith('#')||href.length<2)return false;
   const id=href.slice(1),target=refs.get(id);if(!target||stack.has(id)||!safeTree(target))return false;
   // <symbol> is a viewport-bearing instance, not a normal group. Exact
   // rendering depends on viewport clipping, preserveAspectRatio, inherited
   // presentation, and SVG's transform order. Until the full instance matrix
   // is represented losslessly in the layer model, preserve the whole SVG.
   // This is safer than expanding to editable shapes at incorrect coordinates.
   if(target.localName==='symbol')return false;
   const wrapper=document.createElementNS(NS,'g');
   for(const attr of [...use.attributes]){
    const name=attr.name;
    if(['href','xlink:href','x','y','width','height'].includes(name)||name.endsWith(':href'))continue;
    wrapper.setAttribute(name,attr.value);
   }
   const x=parseSvgLength(use.getAttribute('x'),0,'x',lengthContext),y=parseSvgLength(use.getAttribute('y'),0,'y',lengthContext);
   if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(parseFloat(use.getAttribute('x')||'0'))||!Number.isFinite(parseFloat(use.getAttribute('y')||'0')))return false;
   const existing=use.getAttribute('transform');
   // This branch handles only ordinary path/group references. Symbol instances
   // are preserved as complete SVG objects above until viewport mapping can be
   // represented losslessly by the editable layer model.
   if(target.localName==='symbol'){
    if(existing)wrapper.setAttribute('transform',existing);
   }else if(x||y){
    wrapper.setAttribute('transform',`translate(${x} ${y})${existing?' '+existing:''}`);
   }else if(existing){wrapper.setAttribute('transform',existing);}
   const clone=target.cloneNode(true);clone.removeAttribute('id');
   const nextStack=new Set(stack);nextStack.add(id);
   if(clone.localName==='symbol'){
    const vb=(clone.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);
    if(vb.length!==4||!vb.every(Number.isFinite)||vb[2]<=0||vb[3]<=0)return false;
    const width=parseSvgLength(use.getAttribute('width'),vb[2],'x',lengthContext),height=parseSvgLength(use.getAttribute('height'),vb[3],'y',lengthContext);
    if(!(width>0&&height>0))return false;
    const pa=(use.getAttribute('preserveAspectRatio')||clone.getAttribute('preserveAspectRatio')||'xMidYMid meet').trim();
    let sx=width/vb[2],sy=height/vb[3],dx=0,dy=0;
    if(!/^none(?:\s|$)/i.test(pa)){
     const scale=/slice/i.test(pa)?Math.max(sx,sy):Math.min(sx,sy);sx=scale;sy=scale;
     const spareX=width-vb[2]*scale,spareY=height-vb[3]*scale;
     const ax=/xMax/i.test(pa)?1:/xMid/i.test(pa)?.5:0,ay=/YMax/i.test(pa)?1:/YMid/i.test(pa)?.5:0;
     dx=spareX*ax;dy=spareY*ay;
    }
    const inner=document.createElementNS(NS,'g');
    for(const attr of [...clone.attributes])if(!['id','viewBox','preserveAspectRatio','width','height','x','y','overflow'].includes(attr.name))inner.setAttribute(attr.name,attr.value);
    const tx=parseSvgLength(use.getAttribute('x'),0,'x',lengthContext),ty=parseSvgLength(use.getAttribute('y'),0,'y',lengthContext);
    const map=document.createElementNS(NS,'g');map.setAttribute('transform',`translate(${tx+dx} ${ty+dy}) scale(${sx} ${sy}) translate(${-vb[0]} ${-vb[1]})`);
    for(const child of [...clone.children])map.append(child.cloneNode(true));
    inner.append(map);
    if(!expandWithin(inner,nextStack,depth+1))return false;
    wrapper.append(inner);
   }else{
    if(!expandWithin(clone,nextStack,depth+1))return false;
    wrapper.append(clone);
   }
   use.replaceWith(wrapper);
  }
  // A nested <use> can be deeper than one parent level.
  for(const child of [...parent.children])if(child.localName!=='defs'&&child.localName!=='style'&&child.localName!=='use'){
   if(child.querySelector('use')&&!expandWithin(child,stack,depth+1))return false;
  }
  return true;
 };
 return expandWithin(root);
}
function materializeSvgComputedStyles(root){
 const host=document.createElement('div');host.setAttribute('aria-hidden','true');
 host.style.cssText='all:initial;display:block;position:fixed;left:-100000px;top:-100000px;width:1000px;height:1000px;overflow:hidden;pointer-events:none;opacity:0;z-index:-1;color:#000000;font-family:serif;font-size:16px;font-weight:400;line-height:normal';
 document.body.append(host);host.append(root);
 try{
  const props=['color','fill','fill-rule','fill-opacity','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-opacity','stroke-dasharray','stroke-dashoffset','display','visibility','opacity','font-family','font-size','font-weight','letter-spacing','text-anchor','dominant-baseline','alignment-baseline','clip-path','mask','filter','vector-effect','paint-order'];
  for(const el of [root,...root.querySelectorAll('*')]){
   if(el.localName==='style'||el.localName==='title'||el.localName==='desc'||el.localName==='metadata')continue;
   const cs=getComputedStyle(el);
   const cssTransform=cs.getPropertyValue('transform').trim();
   if(cssTransform&&cssTransform!=='none'&&!el.hasAttribute('transform')){
    // CSS transform-origin and transform-box are not represented by the editor's
    // affine layer model. Keep the SVG intact rather than silently moving it.
    return false;
   }
   // These rendering properties are retained on an embedded SVG island when
   // they cannot be represented by ordinary editor layers. Do not reject the
   // entire document merely because one element uses them.
   for(const prop of props){
    const value=cs.getPropertyValue(prop).trim();
    if(!value)continue;
    // The original attribute transform is parsed by importedShape. Do not
    // replace its author value with a browser matrix representation.
    if(prop==='transform')continue;
    el.setAttribute(prop,value);
   }
  }
  // The computed values are now explicit. Classes and embedded CSS are no
  // longer needed and would otherwise force the entire SVG into fallback mode.
  root.querySelectorAll('style').forEach(el=>el.remove());
  [root,...root.querySelectorAll('*')].forEach(el=>el.removeAttribute('class'));
  return true;
 }catch(_){return false;}finally{host.remove();}
}
function svgStylesheetCanBeMaterialized(root){
 const styles=[...(root?.querySelectorAll?.('style')||[])];
 for(const style of styles){
  const css=String(style.textContent||'');
  // These rules are time-, viewport-, or pseudo-element-dependent and cannot
  // be represented by static per-element presentation attributes.
  if(/@font-face|@media|@supports|@container|@keyframes|@-webkit-keyframes|::(?:before|after|marker)|:(?:hover|active|focus|focus-visible|visited|target|checked|disabled|enabled)\b|animation\s*:|transition\s*:/i.test(css))return false;
  if(/content\s*:/i.test(css))return false;
 }
 return true;
}
function prepareSvgForEditableDecomposition(v){
 if(!svgStylesheetCanBeMaterialized(v?.root))return null;
 const root=v.root.cloneNode(true);
 if(!expandSimpleLocalSvgUses(root,v.lengthContext||{width:v.viewW,height:v.viewH}))return null;
 if(!materializeSvgComputedStyles(root))return null;
 const rootAttrs={};const keep=['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','vector-effect','paint-order','fill-rule','clip-rule','color','font-family','font-size','font-weight','text-anchor','opacity','fill-opacity','stroke-opacity','shape-rendering','text-rendering','style','preserveAspectRatio','transform','display','visibility','clip-path','mask','filter','marker-start','marker-mid','marker-end','id'];
 keep.forEach(k=>{const value=root.getAttribute(k);if(value!==null)rootAttrs[k]=value;});
 return{...v,root,rootAttrs,markup:[...root.childNodes].filter(n=>n.nodeType===1).map(n=>new XMLSerializer().serializeToString(n)).join('')};
}
function parseSvgTransform(value){
 if(!value||String(value).trim()===''||String(value).trim().toLowerCase()==='none')return{tx:0,ty:0,rot:0,sx:1,sy:1,shear:0};
 const str=String(value).trim();let ma=1,mb=0,mc=0,md=1,me=0,mf=0;
 const mul=(fa,fb,fc,fd,fe,ff)=>{const na=ma*fa+mc*fb,nb=mb*fa+md*fb,nc=ma*fc+mc*fd,nd=mb*fc+md*fd,ne=ma*fe+mc*ff+me,nf=mb*fe+md*ff+mf;ma=na;mb=nb;mc=nc;md=nd;me=ne;mf=nf;};
 const re=/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;let m;
 while((m=re.exec(str))){const fn=m[1].toLowerCase(),args=m[2].split(/[\s,]+/).filter(Boolean).map(Number);if(!args.length||args.some(n=>!Number.isFinite(n)))return null;
  if(fn==='translate'){if(args.length>2)return null;mul(1,0,0,1,args[0],args[1]||0);}
  else if(fn==='scale'){if(args.length>2)return null;const a=args[0],b=args.length>1?args[1]:a;if(!a||!b)return null;mul(a,0,0,b,0,0);}
  else if(fn==='rotate'){if(args.length!==1&&args.length!==3)return null;const rad=args[0]*Math.PI/180,c=Math.cos(rad),sn=Math.sin(rad);if(args.length===3)mul(1,0,0,1,args[1],args[2]);mul(c,sn,-sn,c,0,0);if(args.length===3)mul(1,0,0,1,-args[1],-args[2]);}
  else if(fn==='matrix'){if(args.length!==6)return null;mul(args[0],args[1],args[2],args[3],args[4],args[5]);}
  else if(fn==='skewx'||fn==='skewy'){if(args.length!==1)return null;const tangent=Math.tan(args[0]*Math.PI/180);if(!Number.isFinite(tangent)||Math.abs(tangent)>1000)return null;if(fn==='skewx')mul(1,0,tangent,1,0,0);else mul(1,tangent,0,1,0,0);}
 }
 if(str.replace(re,'').replace(/[\s,]+/g,'')!=='')return null;
 const det=ma*md-mb*mc;if(!Number.isFinite(det)||det<=1e-9)return null; // reflections/singular transforms stay as SVG islands
 const sx=Math.hypot(ma,mb);if(!Number.isFinite(sx)||sx<1e-8)return null;
 const sy=det/sx,shear=(ma*mc+mb*md)/(sx*sx),rot=Math.atan2(mb,ma)*180/Math.PI;
 // The native layer model can represent positive-determinant affine transforms,
 // but do not clamp extreme matrices: preserve those exactly as embedded SVG.
 if(![me,mf,sx,sy,shear,rot].every(Number.isFinite)||sx<.0001||sx>100||sy<.0001||sy>100||Math.abs(shear)>1000)return null;
 return{tx:me,ty:mf,rot:Math.abs(rot)<1e-10?0:Math.round(rot*1e10)/1e10,sx:Math.round(sx*1e10)/1e10,sy:Math.round(sy*1e10)/1e10,shear:Math.round(shear*1e10)/1e10};
}
const GSP_IMPORT_SKIP=new Set(['desc','title','metadata','namedview','defs','mask','filter','clipPath','pattern','linearGradient','radialGradient','marker','symbol']);
// Smart SVG component separation + fill-aware contour topology (0.6.46).
// Resolve relative moveto commands before splitting. In SVG, a relative `m`
// after a closed subpath starts at the previous current point, not at (0,0).
function parseSvgSubpathRecords(d){
 const source=String(d||''),tokens=[],numberRe=/^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/;let pos=0,cmdLetter='',paramIndex=0;
 while(pos<source.length){
  const ch=source[pos];
  if(/[\s,]/.test(ch)){pos++;continue;}
  if(/^[AaCcHhLlMmQqSsTtVvZz]$/.test(ch)){tokens.push({v:ch,start:pos,end:pos+1,isCommand:true});cmdLetter=ch;paramIndex=0;pos++;continue;}
  const needFlag=cmdLetter.toUpperCase()==='A'&&(paramIndex%7===3||paramIndex%7===4);
  if(needFlag){if(ch!=='0'&&ch!=='1')return null;tokens.push({v:ch,start:pos,end:pos+1,isCommand:false});paramIndex++;pos++;continue;}
  const m=numberRe.exec(source.slice(pos));if(!m)return null;tokens.push({v:m[0],start:pos,end:pos+m[0].length,isCommand:false});paramIndex++;pos+=m[0].length;
 }
 const arity={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7},fmt=n=>{const v=Number(n);return Object.is(v,-0)?'0':String(v);};
 const out=[];let cur=null,subStart={x:0,y:0},current={x:0,y:0},cmd=null,prevC=null,prevQ=null,prevType='',i=0;
 const begin=p=>{if(cur)out.push({d:cur,start:0,x:subStart.x,y:subStart.y});cur=`M ${fmt(p.x)} ${fmt(p.y)}`;subStart={x:p.x,y:p.y};current={x:p.x,y:p.y};prevC=prevQ=null;prevType='M';};
 const finish=()=>{if(cur){out.push({d:cur,start:0,x:subStart.x,y:subStart.y});cur=null;}};
 while(i<tokens.length){
  if(tokens[i].isCommand){cmd=tokens[i].v;i++;if(cmd.toUpperCase()==='Z'){if(cur){cur+=' Z';finish();}current={...subStart};cmd=null;prevC=prevQ=null;prevType='Z';continue;}if(!arity[cmd.toUpperCase()])return null;}
  if(!cmd)return null;
  const upper=cmd.toUpperCase(),rel=cmd!==upper,n=arity[upper];
  if(i+n>tokens.length||tokens.slice(i,i+n).some(t=>t.isCommand))return null;
  const vals=tokens.slice(i,i+n).map(t=>Number(t.v));if(vals.some(v=>!Number.isFinite(v)))return null;
  const ox=current.x,oy=current.y,abs=(a,b)=>[rel?a+ox:a,rel?b+oy:b];let seg='';
  if(upper==='M'){const p=abs(vals[0],vals[1]);begin({x:p[0],y:p[1]});cmd=rel?'l':'L';i+=n;continue;}
  if(!cur)begin(current);
  if(upper==='L'){const p=abs(vals[0],vals[1]);seg=`L ${fmt(p[0])} ${fmt(p[1])}`;current={x:p[0],y:p[1]};prevC=prevQ=null;prevType=upper;}
  else if(upper==='H'){const x=rel?ox+vals[0]:vals[0];seg=`L ${fmt(x)} ${fmt(oy)}`;current={x,y:oy};prevC=prevQ=null;prevType=upper;}
  else if(upper==='V'){const y=rel?oy+vals[0]:vals[0];seg=`L ${fmt(ox)} ${fmt(y)}`;current={x:ox,y};prevC=prevQ=null;prevType=upper;}
  else if(upper==='C'){const c1=abs(vals[0],vals[1]),c2=abs(vals[2],vals[3]),p=abs(vals[4],vals[5]);seg=`C ${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p[0])} ${fmt(p[1])}`;current={x:p[0],y:p[1]};prevC={x:c2[0],y:c2[1]};prevQ=null;prevType=upper;}
  else if(upper==='S'){const c2=abs(vals[0],vals[1]),p=abs(vals[2],vals[3]),c1=(prevType==='C'||prevType==='S')&&prevC?{x:2*ox-prevC.x,y:2*oy-prevC.y}:{x:ox,y:oy};seg=`C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p[0])} ${fmt(p[1])}`;current={x:p[0],y:p[1]};prevC={x:c2[0],y:c2[1]};prevQ=null;prevType=upper;}
  else if(upper==='Q'){const c=abs(vals[0],vals[1]),p=abs(vals[2],vals[3]);seg=`Q ${fmt(c[0])} ${fmt(c[1])} ${fmt(p[0])} ${fmt(p[1])}`;current={x:p[0],y:p[1]};prevQ={x:c[0],y:c[1]};prevC=null;prevType=upper;}
  else if(upper==='T'){const p=abs(vals[0],vals[1]),c=(prevType==='Q'||prevType==='T')&&prevQ?{x:2*ox-prevQ.x,y:2*oy-prevQ.y}:{x:ox,y:oy};seg=`Q ${fmt(c.x)} ${fmt(c.y)} ${fmt(p[0])} ${fmt(p[1])}`;current={x:p[0],y:p[1]};prevQ={x:c.x,y:c.y};prevC=null;prevType=upper;}
  else if(upper==='A'){if(!['0','1'].includes(tokens[i+3].v)||!['0','1'].includes(tokens[i+4].v))return null;const p=abs(vals[5],vals[6]);seg=`A ${fmt(vals[0])} ${fmt(vals[1])} ${fmt(vals[2])} ${Number(tokens[i+3].v)} ${Number(tokens[i+4].v)} ${fmt(p[0])} ${fmt(p[1])}`;current={x:p[0],y:p[1]};prevC=prevQ=null;prevType=upper;}
  else return null;
  cur+=' '+seg;
  i+=n;
 }
 finish();
 return out.length?out:null;
}
// Return painted intervals along a subpath for SVG stroke-dasharray. Geometry
// tests must use the visible dash segments, not the undashed centerline: two
// paths can geometrically cross while their painted dashes never touch.
function svgDashIntervals(total,rawArray='none',rawOffset=0){
 const raw=String(rawArray??'none').trim();
 if(!raw||raw.toLowerCase()==='none')return[[0,total]];
 // Percentage dash lengths depend on the normalized viewport diagonal. The
 // caller does not have a reliable per-element viewport unit after transforms,
 // so leave those paths intact rather than guessing and merging incorrectly.
 if(raw.includes('%'))return null;
 let values=raw.split(/[ ,]+/).filter(Boolean).map(v=>Number.parseFloat(v));
 if(!values.length||values.some(v=>!Number.isFinite(v)||v<0))return null;
 if(values.length%2)values=values.concat(values);
 const period=values.reduce((a,b)=>a+b,0);
 if(!(period>1e-9))return[[0,total]];
 let phase=Number(rawOffset)||0;phase=((phase%period)+period)%period;
 let index=0;
 while(index<values.length-1&&phase>=values[index]-1e-10){phase-=values[index];index++;}
 let remain=Math.max(0,values[index]-phase),cursor=0,guard=0;const out=[];
 while(cursor<total-1e-9&&guard++<100000){
  if(remain<=1e-10){index=(index+1)%values.length;remain=values[index];continue;}
  const end=Math.min(total,cursor+remain);
  if(index%2===0&&end>cursor+1e-9)out.push([cursor,end]);
  const advance=end-cursor;cursor=end;remain-=advance;
  if(end>=total-1e-9)break;
  if(remain<=1e-9){index=(index+1)%values.length;remain=values[index];}
 }
 return out;
}
function estimateSvgContourArea(node,length){
 // SVG fill implicitly closes open subpaths. Sampling the contour and closing
 // the polygon gives a useful zero-area discriminator for open line contours;
 // it is not used to split curved artwork by itself.
 try{
  const count=Math.max(24,Math.min(256,Math.ceil(length/2))),pts=[];
  for(let i=0;i<count;i++){const p=node.getPointAtLength(length*i/count);if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return NaN;pts.push(p);}
  let twice=0;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];twice+=a.x*b.y-b.x*a.y;}
  return Math.abs(twice)*.5;
 }catch(_){return NaN;}
}
function splitSvgPathComponents(d,fillRule='nonzero',strokeWidth=0,hasStroke=false,hasFill=true,strokeDasharray='none',strokeDashoffset=0,linecap='butt'){
 const chunks=parseSvgSubpathRecords(d);if(!chunks||chunks.length<2||chunks.length>1024)return null;
 const svg=document.createElementNS(NS,'svg');svg.setAttribute('xmlns',NS);svg.setAttribute('width','1');svg.setAttribute('height','1');svg.setAttribute('viewBox','0 0 1 1');
 svg.style.cssText='position:fixed;left:-100000px;top:-100000px;width:1px;height:1px;overflow:visible;visibility:hidden;pointer-events:none';
 const records=[],rule=fillRule==='evenodd'?'evenodd':'nonzero';
 const makePath=(pathData)=>{const node=document.createElementNS(NS,'path');node.setAttribute('d',pathData);node.setAttribute('fill','#000');node.setAttribute('fill-rule',rule);node.setAttribute('stroke','none');svg.append(node);return node;};
 const fillAt=(node,p)=>{const pt=svg.createSVGPoint();pt.x=p.x;pt.y=p.y;try{return node.isPointInFill(pt);}catch(_){return false;}};
 const interiorSamples=record=>{
  const out=[],b=record.box,node=record.node;
  if(!(b.w>0&&b.h>0)||typeof node.isPointInFill!=='function')return out;
  for(const grid of [13,27]){
   for(let iy=1;iy<grid;iy++)for(let ix=1;ix<grid;ix++){
    const p={x:b.x1+b.w*ix/grid,y:b.y1+b.h*iy/grid};if(fillAt(node,p)){
     if(!out.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<Math.min(b.w,b.h)*.015))out.push(p);
     if(out.length>=16)return out;
    }
   }
   if(out.length)break;
  }
  if(!out.length){
   const len=record.length;for(let i=0;i<24;i++){let p;try{p=node.getPointAtLength(len*(i+.37)/24);}catch(_){break;}if(!p)continue;
    for(const e of [Math.max(.001,Math.min(b.w,b.h)*.002),Math.max(.01,Math.min(b.w,b.h)*.02),Math.max(.05,Math.min(b.w,b.h)*.08)]){
     for(const sign of [-1,1]){const q={x:p.x+sign*e,y:p.y};if(fillAt(node,q)){out.push(q);return out;}}
    }
   }
  }
  return out;
 };
 const boxArea=r=>Math.max(1e-9,r.box.w*r.box.h);
 const boxContains=(outer,inner)=>{const e=Math.max(1e-5,Math.max(outer.box.w,outer.box.h,inner.box.w,inner.box.h)*1e-6);return inner.box.x1>=outer.box.x1-e&&inner.box.y1>=outer.box.y1-e&&inner.box.x2<=outer.box.x2+e&&inner.box.y2<=outer.box.y2+e&&boxArea(outer)>boxArea(inner)*(1+1e-6);};
 const containsContour=(outer,inner)=>{
  if(!boxContains(outer,inner)||typeof outer.node.isPointInFill!=='function'||typeof inner.node.getPointAtLength!=='function')return false;
  const samples=14;let inside=0;
  for(let j=0;j<samples;j++){let p;try{p=inner.node.getPointAtLength(inner.length*((j+.419)/samples));}catch(_){return false;}if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return false;if(fillAt(outer.node,p))inside++;}
  return inside>=samples-2;
 };
 try{
  document.body.append(svg);
  for(let index=0;index<chunks.length;index++){
   const node=makePath(chunks[index].d);let box,len;try{box=node.getBBox();len=node.getTotalLength();}catch(_){return null;}
   if(![box.x,box.y,box.width,box.height,len].every(Number.isFinite)||box.width<1e-7&&box.height<1e-7||len<1e-7)return null;
   const areaEstimate=estimateSvgContourArea(node,len);
   const zeroFillArea=(box.width<1e-7||box.height<1e-7||Number.isFinite(areaEstimate)&&areaEstimate<=Math.max(1e-9,Math.max(box.width,box.height)**2*1e-10));
   records.push({d:chunks[index].d,node,box:{x1:box.x,y1:box.y,x2:box.x+box.width,y2:box.y+box.height,w:box.width,h:box.height},length:len,index,probes:[],zeroFillArea,areaEstimate});
  }
  let fullNode=null;if(hasFill){fullNode=makePath(chunks.map(c=>c.d).join(' '));
   for(const r of records){
    r.probes=interiorSamples(r);
    if(!r.probes.length){
     // A fill-only contour with exactly zero area (for example Iconify's
     // `M5 5v14z` in material-symbols:4k-outline) paints nothing. It must not
     // invalidate the other useful contours. If a stroke is present, however,
     // the same geometry is visible and must remain an independent component.
     if(r.zeroFillArea){
      if(hasStroke){r.role='stroke-only';continue;}
      r.role='ignored-zero-area';continue;
     }
     return null;
    }
    let role=null;
    for(const p of r.probes){const full=fillAt(fullNode,p),withoutNode=makePath(chunks.filter((_,k)=>k!==r.index).map(c=>c.d).join(' ')),without=fillAt(withoutNode,p);withoutNode.remove();
     if(full!==without){role=full?'add':'hole';break;}
    }
    r.role=role||'redundant';
   }
  }else records.forEach(r=>r.role='add');
  // Find the smallest geometric container for each contour. This is topology,
  // not semantic letter recognition; counters are assigned to their nearest
  // enclosing filled component only after the fill contribution is measured.
  const parent=new Array(records.length).fill(-1);
  if(hasFill)for(let i=0;i<records.length;i++){
   if(records[i].role==='ignored-zero-area')continue;
   let best=-1,bestArea=Infinity;for(let j=0;j<records.length;j++){
    if(i===j||records[j].role==='ignored-zero-area'||boxArea(records[j])>=bestArea||!boxContains(records[j],records[i]))continue;
    if(containsContour(records[j],records[i])){best=j;bestArea=boxArea(records[j]);}
   }parent[i]=best;
  }
  const owner=new Array(records.length).fill(-1),insideHole=new Array(records.length).fill(false);
  for(let i=0;i<records.length;i++){
   if(records[i].role==='ignored-zero-area'){owner[i]=-2;continue;}
   if(records[i].role==='stroke-only'){owner[i]=i;continue;}
   if(records[i].role==='add'){owner[i]=i;let p=parent[i],guard=0;while(p>=0&&guard++<records.length){if(records[p].role==='hole'){insideHole[i]=true;break;}p=parent[p];}continue;}
   let p=parent[i],guard=0;while(p>=0&&guard++<records.length&&records[p].role!=='add')p=parent[p];
   if(p<0)return null;owner[i]=p;
  }
  const roots=records.map((r,i)=>i).filter(i=>records[i].role==='add'||records[i].role==='stroke-only');if(!roots.length)return null;
  const componentData=()=>roots.map(root=>{
   const items=records.filter((r,i)=>owner[i]===root),dList=items.sort((a,b)=>a.index-b.index).map(r=>r.d),b=items.reduce((a,r)=>({x1:Math.min(a.x1,r.box.x1),y1:Math.min(a.y1,r.box.y1),x2:Math.max(a.x2,r.box.x2),y2:Math.max(a.y2,r.box.y2)}),{x1:Infinity,y1:Infinity,x2:-Infinity,y2:-Infinity});
   return{root,items,d:dList.join(' '),box:{...b,w:b.x2-b.x1,h:b.y2-b.y1},area:Math.max(1e-9,(b.x2-b.x1)*(b.y2-b.y1)),insideHole:insideHole[root]};
  });
  let comps=componentData();const dsu=new Map(roots.map(i=>[i,i]));
  const find=i=>{let p=dsu.get(i);while(p!==dsu.get(p)){dsu.set(p,dsu.get(dsu.get(p)));p=dsu.get(p);}return p;};
  const unite=(a,b)=>{a=find(a);b=find(b);if(a!==b)dsu.set(b,a);};
  // Bounding boxes are only a broad-phase filter. Independent diagonal or
  // curved contours often have intersecting boxes without touching each other.
  // Merge only when the painted fill/stroke regions actually intersect.
  const overlapNodeFor=component=>{
   const node=makePath(component.d);
   node.setAttribute('fill',hasFill?'#000':'none');
   node.setAttribute('fill-rule',rule);
   node.setAttribute('stroke',hasStroke?'#000':'none');
   node.setAttribute('stroke-width',String(Math.max(0,Number(strokeWidth)||0)));
   node.setAttribute('stroke-linecap','round');node.setAttribute('stroke-linejoin','round');
   return node;
  };
  const pathSamples=node=>{
   const pts=[];let len=0,b;
   try{len=node.getTotalLength();b=node.getBBox();}catch(_){return null;}
   if(!Number.isFinite(len)||len<=0)return null;
   const rec={node,length:len,box:{x1:b.x,y1:b.y,x2:b.x+b.width,y2:b.y+b.height,w:b.width,h:b.height}};
   if(hasFill)pts.push(...interiorSamples(rec));
   const n=Math.max(32,Math.min(768,Math.ceil(len/Math.max(.08,Math.min(b.width||1,b.height||1)*.025))));
   for(let k=0;k<n;k++){let p;try{p=node.getPointAtLength(len*(k+.5)/n);}catch(_){return null;}if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))pts.push({x:p.x,y:p.y});}
   return pts;
  };
  const inFill=(node,p)=>{try{return fillAt(node,p);}catch(_){return false;}};
  const visualNodes=comps.map(overlapNodeFor),visualSamples=visualNodes.map(pathSamples);
  // SVGGeometryElement.isPointInStroke is not implemented consistently in all
  // browsers. Approximate stroked-contour overlap from the source path geometry
  // instead of merging every pair whose bounding boxes happen to intersect.
  const dashIntervals=svgDashIntervals(Math.max(...records.map(r=>r.length)),strokeDasharray,strokeDashoffset);
  if(hasStroke&&dashIntervals===null)return null;
  const strokeSegments=component=>{
   const segments=[],sw=Math.max(.01,Number(strokeWidth)||1),step=Math.max(.12,Math.min(.8,sw/4));
   for(const record of component.items){
    // Dash pattern restarts at each SVG subpath. Never bridge the gaps between
    // dashes, nor bridge independent M commands.
    const intervals=svgDashIntervals(record.length,strokeDasharray,strokeDashoffset);
    if(!intervals)return null;
    for(const interval of intervals){
     const [start,end]=interval,n=Math.max(1,Math.min(4096,Math.ceil((end-start)/step)));let prev=null;
     for(let k=0;k<=n;k++){
      let p;try{p=record.node.getPointAtLength(start+(end-start)*k/n);}catch(_){prev=null;continue;}
      if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)){prev=null;continue;}
      if(prev){const dx=p.x-prev.x,dy=p.y-prev.y,dist=Math.hypot(dx,dy);
       if(dist<=step*2.4+1e-4)segments.push({a:prev,b:{x:p.x,y:p.y},minX:Math.min(prev.x,p.x),maxX:Math.max(prev.x,p.x),minY:Math.min(prev.y,p.y),maxY:Math.max(prev.y,p.y)});
      }
      prev={x:p.x,y:p.y};
     }
    }
   }
   return segments;
  };
  const pointSegmentDistanceSq=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;if(den<1e-12)return(p.x-a.x)**2+(p.y-a.y)**2;const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)),x=a.x+t*dx,y=a.y+t*dy;return(p.x-x)**2+(p.y-y)**2;};
  const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const segmentsCross=(a,b)=>{const o1=orient(a.a,a.b,b.a),o2=orient(a.a,a.b,b.b),o3=orient(b.a,b.b,a.a),o4=orient(b.a,b.b,a.b);return((o1>=0&&o2<=0)||(o1<=0&&o2>=0))&&((o3>=0&&o4<=0)||(o3<=0&&o4>=0));};
  const strokeSegmentsOverlap=(aa,bb)=>{
   if(!aa.length||!bb.length)return false;const limit=Math.max(.01,Number(strokeWidth)||0)+1e-4,lim2=limit*limit;
   // Cheap broad phase on individual segment bounds keeps icons with many
   // contours performant. Stroke width is the sum of the two half-widths.
   for(const a of aa)for(const b of bb){
    if(a.maxX+limit<b.minX||b.maxX+limit<a.minX||a.maxY+limit<b.minY||b.maxY+limit<a.minY)continue;
    if(segmentsCross(a,b))return true;
    if(Math.min(pointSegmentDistanceSq(a.a,b.a,b.b),pointSegmentDistanceSq(a.b,b.a,b.b),pointSegmentDistanceSq(b.a,a.a,a.b),pointSegmentDistanceSq(b.b,a.a,a.b))<=lim2)return true;
   }
   return false;
  };
  const componentStrokeSegments=hasStroke?comps.map(strokeSegments):[];
  if(hasStroke&&componentStrokeSegments.some(v=>!v))return null;
  // Filled paths can be authored as several contours that meet only at an
  // endpoint/edge (for example, the two strokes that form the letter K in
  // Material Icons 4K). Their painted interiors do not overlap, so the old
  // overlap-only test left them as unrelated layers. Detect near-exact contour
  // contact separately; do not merge shapes merely because their bounding
  // boxes overlap or because they are visually close.
  const geometryScale=Math.max(24,...records.map(r=>Math.max(r.box.w,r.box.h)));
  const boundaryTolerance=Math.max(.01,Math.min(.08,geometryScale*.0003));
  const boundaryCache=new Map();
  const componentBoundarySegments=index=>{
   if(boundaryCache.has(index))return boundaryCache.get(index);
   const segments=[];
   for(const record of comps[index].items){
    const step=Math.max(.02,Math.min(.08,Math.min(record.box.w||1,record.box.h||1)*.0125));
    const n=Math.max(24,Math.min(6000,Math.ceil(record.length/step)));let prev=null;
    for(let k=0;k<=n;k++){
     let p;try{p=record.node.getPointAtLength(record.length*k/n);}catch(_){prev=null;continue;}
     if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)){prev=null;continue;}
     if(prev){const dx=p.x-prev.x,dy=p.y-prev.y,dist=Math.hypot(dx,dy);
      if(dist<=step*2.4+1e-4)segments.push({a:prev,b:{x:p.x,y:p.y},minX:Math.min(prev.x,p.x),maxX:Math.max(prev.x,p.x),minY:Math.min(prev.y,p.y),maxY:Math.max(prev.y,p.y)});
     }
     prev={x:p.x,y:p.y};
    }
   }
   boundaryCache.set(index,segments);return segments;
  };
  const fillBoundariesTouch=(i,j)=>{
   const aa=componentBoundarySegments(i),bb=componentBoundarySegments(j);if(!aa.length||!bb.length)return false;
   const tol=boundaryTolerance,tol2=tol*tol;
   for(const a of aa)for(const b of bb){
    if(a.maxX+tol<b.minX||b.maxX+tol<a.minX||a.maxY+tol<b.minY||b.maxY+tol<a.minY)continue;
    // Endpoint-to-segment distance is deliberately used here instead of the
    // generic segment-cross helper: collinear but separated segments must not
    // be mistaken for an intersection. True endpoint joins still fall within
    // the very small geometry tolerance.
    if(Math.min(pointSegmentDistanceSq(a.a,b.a,b.b),pointSegmentDistanceSq(a.b,b.a,b.b),pointSegmentDistanceSq(b.a,a.a,a.b),pointSegmentDistanceSq(b.b,a.a,a.b))<=tol2)return true;
   }
   return false;
  };
  const actualOverlap=(i,j)=>{
   const a=comps[i],b=comps[j],pad=hasStroke?Math.max(0,Number(strokeWidth)||0)/2:0;
   const gapX=Math.max(0,a.box.x1-b.box.x2,b.box.x1-a.box.x2),gapY=Math.max(0,a.box.y1-b.box.y2,b.box.y1-a.box.y2);
   const broadTolerance=Math.max(boundaryTolerance,pad);
   if(gapX>broadTolerance||gapY>broadTolerance)return false;
   const ox=Math.min(a.box.x2+pad,b.box.x2+pad)-Math.max(a.box.x1-pad,b.box.x1-pad),oy=Math.min(a.box.y2+pad,b.box.y2+pad)-Math.max(a.box.y1-pad,b.box.y1-pad);
   const na=visualNodes[i],nb=visualNodes[j],pa=visualSamples[i],pb=visualSamples[j];
   const positiveBBoxOverlap=ox>1e-5&&oy>1e-5;
   if(positiveBBoxOverlap){
    // If fill hit-testing is missing, retain components together to avoid
    // visual regressions. Stroke intersection itself uses the geometry fallback above.
    if(hasFill&&(!pa||!pb||typeof nb.isPointInFill!=='function'))return true;
    if(hasFill&&(pa.some(p=>inFill(nb,p))||pb.some(p=>inFill(na,p))))return true;
   }else if(hasFill&&fillBoundariesTouch(i,j)){
    // Only run endpoint/edge contact detection when the component bounds
    // actually meet. Contained shapes (such as the 4 inside the 4K frame) must
    // not be merged just because their boxes overlap.
    return true;
   }
   if(hasStroke&&strokeSegmentsOverlap(componentStrokeSegments[i],componentStrokeSegments[j]))return true;
   return false;
  };
  for(let i=0;i<comps.length;i++)for(let j=i+1;j<comps.length;j++){
   const a=comps[i],b=comps[j];
   const nestedIslandA=a.insideHole&&records[a.root]&&parent[a.root]>=0&&owner[parent[a.root]]===b.root;
   const nestedIslandB=b.insideHole&&records[b.root]&&parent[b.root]>=0&&owner[parent[b.root]]===a.root;
   if(nestedIslandA||nestedIslandB)continue;
   if(actualOverlap(i,j))unite(a.root,b.root);
  }
  visualNodes.forEach(node=>node.remove());
  const groups=()=>{const map=new Map();for(const c of comps){const k=find(c.root);if(!map.has(k))map.set(k,[]);map.get(k).push(c);}return [...map.values()].map(items=>{
   const b=items.reduce((a,c)=>({x1:Math.min(a.x1,c.box.x1),y1:Math.min(a.y1,c.box.y1),x2:Math.max(a.x2,c.box.x2),y2:Math.max(a.y2,c.box.y2)}),{x1:Infinity,y1:Infinity,x2:-Infinity,y2:-Infinity});
   return{items,box:{...b,w:b.x2-b.x1,h:b.y2-b.y1},area:Math.max(1e-9,(b.x2-b.x1)*(b.y2-b.y1)),insideHole:items.some(c=>c.insideHole)};
  });};
  let gs=groups();
  // Detached dots/accent marks can be associated with a nearby glyph. Never
  // absorb an island that lives inside a counter/hole of another component.
  for(const small of [...gs].sort((a,b)=>a.area-b.area)){
   const smallRoot=small.items[0].items[0].index;if(small.insideHole||find(smallRoot)!==find(gs.find(g=>g.items.includes(small.items[0]))?.items[0]?.items[0]?.index??smallRoot))continue;
   let best=null,bestScore=Infinity;
   for(const large of gs){if(large===small||large.insideHole||large.area<small.area*1.45)continue;
    const xOverlap=Math.max(0,Math.min(small.box.x2,large.box.x2)-Math.max(small.box.x1,large.box.x1)),xRatio=xOverlap/Math.max(1e-6,Math.min(small.box.w,large.box.w));
    const yGap=small.box.y2<large.box.y1?large.box.y1-small.box.y2:large.box.y2<small.box.y1?small.box.y1-large.box.y2:0,smallHeightRatio=small.box.h/Math.max(1e-6,large.box.h);
    // Only attach a detached accent/dot when it sits above a likely glyph body.
    // Previously any small contour inside a larger icon's bounding box could be
    // swallowed (for example, separate marks inside a stroked Iconify frame).
    const sitsAbove=small.box.y2<=large.box.y1+Math.max(.01,large.box.h*.015);
    const smallCenter=(small.box.x1+small.box.x2)/2,largeCenter=(large.box.x1+large.box.x2)/2;
    const centered=Math.abs(smallCenter-largeCenter)<=Math.max(small.box.w*.8,large.box.w*.28);
    if(!sitsAbove||!centered||xRatio<.58||smallHeightRatio>.62||yGap>large.box.h*.78)continue;
    const score=(1-xRatio)*2+yGap/Math.max(1,large.box.h)+small.area/large.area*.2;if(score<bestScore){best=large;bestScore=score;}
   }
   if(best){unite(small.items[0].root,best.items[0].root);gs=groups();}
  }
  const finalGroups=groups().sort((a,b)=>a.box.x1-b.box.x1||a.box.y1-b.box.y1);
  if(finalGroups.length<2)return null;
  return finalGroups.map(group=>group.items.flatMap(c=>c.items).sort((a,b)=>a.index-b.index).map(r=>r.d).join(' '));
 }catch(_){return null;}finally{svg.remove();}
}
function resolveImportedSvgPaint(value,style,fallback='none'){
 const raw=String(value??fallback).trim();if(!raw)return fallback;
 if(raw.toLowerCase()==='currentcolor'){
  const color=String(style?.color||'').trim();return color&&color.toLowerCase()!=='currentcolor'?color:'#000000';
 }
 if(raw.toLowerCase()==='context-fill')return resolveImportedSvgPaint(style?.fill,style,'#000000');
 if(raw.toLowerCase()==='context-stroke')return resolveImportedSvgPaint(style?.stroke,style,'none');
 return raw;
}
function svgDeclaredStyleValue(el,property){
 const attr=el?.getAttribute?.(property);if(attr!==null&&attr!==undefined)return String(attr).trim();
 const inline=el?.getAttribute?.('style')||'';for(const declaration of inline.split(';')){const colon=declaration.indexOf(':');if(colon>0&&declaration.slice(0,colon).trim().toLowerCase()===property)return declaration.slice(colon+1).trim();}
 return null;
}
function resolveSvgFontSize(el,parentFontSize,rootRemSize,lengthContext={}){
 const raw=svgDeclaredStyleValue(el,'font-size');if(raw==null||raw==='')return parentFontSize;
 const value=String(raw).trim().toLowerCase(),scale=Number(lengthContext.userUnitsPerCssY)||1;
 const keywords={'xx-small':9/16,'x-small':10/16,small:13/16,medium:1,large:18/16,'x-large':24/16,'xx-large':32/16};
 if(value==='smaller')return parentFontSize*5/6;if(value==='larger')return parentFontSize*1.2;if(Object.prototype.hasOwnProperty.call(keywords,value))return 16*scale*keywords[value];
 const m=value.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(px|pt|pc|mm|cm|in|q|%|em|rem)?$/i);if(!m)return null;
 const n=Number(m[1]),unit=(m[2]||'').toLowerCase();if(!Number.isFinite(n)||n<0)return null;
 if(unit==='%')return parentFontSize*n/100;if(unit==='em')return parentFontSize*n;if(unit==='rem')return rootRemSize*n;
 if(!unit)return n;
 const cssPx=svgAbsoluteLengthToCssPx(`${n}${unit}`);return Number.isFinite(cssPx)?cssPx*scale:null;
}
function resolveSvgLetterSpacing(raw,fontSize,rootRemSize,lengthContext={}){
 if(raw==null||String(raw).trim()==='')return 0;if(String(raw).trim().toLowerCase()==='normal')return 0;
 const value=String(raw).trim().toLowerCase(),scale=Number(lengthContext.userUnitsPerCssX)||1;
 const m=value.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(px|pt|pc|mm|cm|in|q|%|em|rem)?$/i);if(!m)return 0;
 const n=Number(m[1]),unit=(m[2]||'').toLowerCase();if(!Number.isFinite(n))return 0;
 if(unit==='%')return fontSize*n/100;if(unit==='em')return fontSize*n;if(unit==='rem')return rootRemSize*n;if(!unit)return n;
 const cssPx=svgAbsoluteLengthToCssPx(`${n}${unit}`);return Number.isFinite(cssPx)?cssPx*scale:0;
}
function resolveSvgFontWeight(el,parentWeight=400){const raw=svgDeclaredStyleValue(el,'font-weight');if(raw==null||raw==='')return parentWeight;const value=String(raw).trim().toLowerCase();if(value==='normal')return 400;if(value==='bold')return 700;if(value==='bolder')return parentWeight<350?400:parentWeight<550?700:900;if(value==='lighter')return parentWeight>750?700:parentWeight>550?400:100;const n=Number(value);return Number.isFinite(n)?Math.max(1,Math.min(1000,n)):parentWeight;}
function importedSvgBaseline(style){
 let raw=String(style?.['dominant-baseline']||style?.['alignment-baseline']||'alphabetic').trim().toLowerCase();
 const aliases={'before-edge':'text-top','text-before-edge':'text-top','after-edge':'text-bottom','text-after-edge':'text-bottom','baseline':'alphabetic'};
 raw=aliases[raw]||raw;
 const allowed=new Set(['auto','text-bottom','alphabetic','ideographic','middle','central','mathematical','hanging','text-top']);
 return allowed.has(raw)?raw:'alphabetic';
}
function svgIslandLabel(el){
 const label=el?.getAttribute?.('aria-label')||el?.getAttribute?.('data-name')||el?.getAttribute?.('inkscape:label')||el?.getAttribute?.('id')||el?.localName||'SVG component';
 return String(label).replace(/[_-]+/g,' ').slice(0,96)||'SVG component';
}
function createEmbeddedSvgIsland(source,element,inherited={},offsetX=0,offsetY=0,nested=false){
 if(!source?.root||!element||element.namespaceURI!==NS||source.lengthContext?.unknownViewportPercent)return null;
 const root=source.root;
 // Root-level group effects apply to the whole composition. They must not be
 // duplicated independently on fragments; importSvgSources keeps those files whole.
 const wrapper=document.createElementNS(NS,'svg');
 const defs=document.createElementNS(NS,'defs');let hasDefs=false;
 const definitionNames=new Set(['linearGradient','radialGradient','pattern','marker','clipPath','mask','filter','symbol']);
 const addDefinition=node=>{if(node===element||node.contains?.(element))return;defs.append(document.importNode(node,true));hasDefs=true;};
 for(const node of [...root.children])if(node.localName==='defs')addDefinition(node);else if(definitionNames.has(node.localName))addDefinition(node);
 // Definitions nested in groups are also collected. Their computed style has
 // already been materialized when a stylesheet was present.
 for(const node of root.querySelectorAll('defs'))if(![...defs.children].some(d=>d.isEqualNode(node)))addDefinition(node);
 if(hasDefs)wrapper.append(defs);
 // Recreate the inherited presentation context without repeating transforms or
 // group opacity: those are represented by the editor's parent group layer.
 const inheritedGroup=document.createElementNS(NS,'g');
 const inheritedAllowed=new Set(['fill','stroke','color','fill-rule','clip-rule','fill-opacity','stroke-opacity','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','font-family','font-size','font-weight','font-style','font-stretch','font-kerning','font-variant','font-feature-settings','font-variation-settings','font-optical-sizing','letter-spacing','word-spacing','text-anchor','text-decoration','text-transform','white-space','direction','unicode-bidi','writing-mode','dominant-baseline','alignment-baseline','baseline-shift','visibility','vector-effect','paint-order','shape-rendering','text-rendering','image-rendering','color-interpolation','color-interpolation-filters']);
 for(const [key,value] of Object.entries(inherited||{}))if(inheritedAllowed.has(key)&&value!=null&&String(value)!=='')inheritedGroup.setAttribute(key,String(value));
 inheritedGroup.append(document.importNode(element,true));wrapper.append(inheritedGroup);
 // Preserve any local ID targets used by this component, including textPath
 // geometry or <use> targets defined outside a conventional <defs> block.
 const sourceIds=new Map([...root.querySelectorAll('[id]')].map(node=>[node.getAttribute('id'),node]).filter(([id])=>!!id));
 const copiedIds=new Set([...defs.querySelectorAll('[id]')].map(node=>node.getAttribute('id')).filter(Boolean));
 const isInside=(node,parent)=>{for(let n=node;n;n=n.parentElement)if(n===parent)return true;return false;};
 const queue=[];
 const scanReferences=node=>{
  for(const el of [node,...node.querySelectorAll('*')])for(const attr of [...el.attributes]){
   const value=String(attr.value||'');
   if((attr.localName==='href'||attr.name==='href'||attr.name.endsWith(':href'))&&value.trim().startsWith('#'))queue.push(value.trim().slice(1));
   const re=/url\(\s*['"]?#([^ )\s'"]+)/g;let match;while((match=re.exec(value)))queue.push(match[1]);
  }
 };
 scanReferences(inheritedGroup);if(hasDefs)scanReferences(defs);
 const referenced=new Set();
 while(queue.length){
  const id=queue.shift();if(!id||referenced.has(id)||copiedIds.has(id))continue;referenced.add(id);
  const target=sourceIds.get(id);if(!target)continue;
  // References to a root/ancestor can include unrelated siblings and change
  // stacking order. Let the caller retain the larger containing SVG subtree.
  if(target===root||isInside(element,target))return null;
  if(isInside(target,element))continue; // already present inside the selected component
  const copy=document.importNode(target,true);defs.append(copy);hasDefs=true;
  for(const el of [copy,...copy.querySelectorAll('*')])if(el.hasAttribute('id'))copiedIds.add(el.getAttribute('id'));
  scanReferences(copy);
 }
 if(hasDefs&&!defs.parentNode)wrapper.insertBefore(defs,wrapper.firstChild);
 const markup=[...wrapper.childNodes].map(n=>new XMLSerializer().serializeToString(n)).join('');
 if(!markup)return null;
 return makeLayer('svg',{
  name:svgIslandLabel(element)+' · preserved SVG',x:num(offsetX,0),y:num(offsetY,0),w:source.viewW,h:source.viewH,
  viewX:0,viewY:0,viewW:source.viewW,viewH:source.viewH,preserveAspectRatio:source.preserveAspectRatio||'xMidYMid meet',
  rootAttrs:{},markup,typography:null,svgImportFallback:true
 });
}
function svgGradientInfo(root,paint){
 const m=/url\(\s*(['"]?)#([^)\s'"]+)\1\s*\)/i.exec(String(paint||''));if(!m)return null;
 const id=m[2],node=[...(root?.querySelectorAll?.('linearGradient,radialGradient')||[])].find(g=>g.getAttribute('id')===id);if(!node)return null;
 const type=node.localName.toLowerCase()==='radialgradient'?'radial':'linear';
 if(node.hasAttribute('gradientTransform')||String(node.getAttribute('gradientUnits')||'').toLowerCase()==='userspaceonuse')return null;
 const stops=[...node.children].filter(c=>c.localName.toLowerCase()==='stop');if(stops.length!==2)return null;
 const colors=[],alphas=[];
 for(const stop of stops){const st=styleMap(stop),color=String(st['stop-color']||stop.getAttribute('stop-color')||'').trim();if(!color||/url\(|currentColor|context-|var\(/i.test(color))return null;colors.push(color);alphas.push(Math.max(0,Math.min(1,svgOpacityNumber(st['stop-opacity'],1))));}
 let angle=0;
 if(type==='radial'){if(['cx','cy','r','fx','fy'].some(a=>node.hasAttribute(a)))return null;}
 else{const pct=(v,d)=>{if(v==null||v==='')return d;const n=parseFloat(String(v));return Number.isFinite(n)?n:null};const x1=pct(node.getAttribute('x1'),0),y1=pct(node.getAttribute('y1'),0),x2=pct(node.getAttribute('x2'),100),y2=pct(node.getAttribute('y2'),0);if([x1,y1,x2,y2].some(v=>v===null))return null;angle=Math.atan2(y2-y1,x2-x1)*180/Math.PI;}
 return{fillType:type,fill:colors[0],fill2:colors[1],fillAlpha:Math.round(alphas[0]*255),fill2Alpha:Math.round(alphas[1]*255),gradientAngle:Number(angle.toFixed(3))};
}
function svgSimpleGradientSupported(root,node){const id=node?.getAttribute?.('id');return !!id&&!!svgGradientInfo(root,`url(#${id})`)}
function svgDefinitionAllowedForMapping(root,node){const tag=node.localName.toLowerCase();if(['lineargradient','radialgradient'].includes(tag))return svgSimpleGradientSupported(root,node);if(tag==='defs')return [...node.children].every(c=>['title','desc','metadata'].includes(c.localName.toLowerCase())||svgDefinitionAllowedForMapping(root,c));return ['title','desc','metadata'].includes(tag)}
function svgMappablePaintStyle(root,style,allowGradientMapping){if(!allowGradientMapping||!style)return{style,paint:null};const paint=svgGradientInfo(root,style.fill);if(!paint)return{style,paint:null};return{style:{...style,fill:paint.fill,'paint-order':String(style['paint-order']||'').toLowerCase()==='fill'?undefined:style['paint-order']},paint}}
function svgElementRequiresIsland(tag,style){
 if(['image','use','symbol','switch','foreignObject','textPath','tspan','svg'].includes(tag))return true;
 const hasUrl=v=>/url\s*\(/i.test(String(v||''));
 if(hasUrl(style?.fill)||hasUrl(style?.stroke)||hasUrl(style?.['clip-path'])||hasUrl(style?.mask)||hasUrl(style?.filter)||hasUrl(style?.['marker-start'])||hasUrl(style?.['marker-mid'])||hasUrl(style?.['marker-end']))return true;
 if(String(style?.['vector-effect']||'').toLowerCase()==='non-scaling-stroke')return true;
 if(style?.['paint-order']&&!['normal','fill stroke markers'].includes(String(style['paint-order']).trim().toLowerCase()))return true;
 if(style?.['mix-blend-mode']&&String(style['mix-blend-mode']).toLowerCase()!=='normal')return true;
 if(style?.isolation&&String(style.isolation).toLowerCase()==='isolate')return true;
 if(style?.clip&&String(style.clip).toLowerCase()!=='auto')return true;
 return false;
}
function importedShape(el,offsetX=0,offsetY=0,inherited={},lengthContext={width:100,height:100},importOptions={}){
 if(el.namespaceURI!==NS)return null;
  const tag=el.localName,st=styleMap(el,inherited),tf=parseSvgTransform(st.transform);if(!tf)return null;
  const mappedPaint=svgMappablePaintStyle(importOptions.source?.root,st,importOptions.allowGradientMapping&&!['g','a'].includes(tag)),paintStyle=mappedPaint.style,gradientPaint=mappedPaint.paint;
 const parentFontSize=Number(lengthContext.parentFontSize)||16*(Number(lengthContext.userUnitsPerCssY)||1),rootRemSize=Number(lengthContext.rootRemSize)||16*(Number(lengthContext.userUnitsPerCssY)||1),computedFontSize=resolveSvgFontSize(el,parentFontSize,rootRemSize,lengthContext);if(computedFontSize===null)return null;
 const computedFontWeight=resolveSvgFontWeight(el,Number(lengthContext.parentFontWeight)||400),ownLetterSpacing=svgDeclaredStyleValue(el,'letter-spacing'),computedLetterSpacing=ownLetterSpacing==null?Number(lengthContext.parentLetterSpacing)||0:resolveSvgLetterSpacing(ownLetterSpacing,computedFontSize,rootRemSize,lengthContext);
 const childLengthContext={...lengthContext,parentFontSize:computedFontSize,rootRemSize,parentFontWeight:computedFontWeight,parentLetterSpacing:computedLetterSpacing};
 if(String(st.display||'').toLowerCase()==='none')return [];
 if(tag!=='g'&&['hidden','collapse'].includes(String(st.visibility||'').toLowerCase()))return [];
 const co=Math.cos(tf.rot*Math.PI/180),si=Math.sin(tf.rot*Math.PI/180),rsx=(px,py)=>co*tf.sx*px+(co*(tf.shear||0)*tf.sx-si*tf.sy)*py,rsy=(px,py)=>si*tf.sx*px+(si*(tf.shear||0)*tf.sx+co*tf.sy)*py;
  const xoff=offsetX+tf.tx,yoff=offsetY+tf.ty,common={x:xoff,y:yoff,rotate:tf.rot,scaleX:tf.sx*100,scaleY:tf.sy*100,fill:gradientPaint?gradientPaint.fill:resolveImportedSvgPaint(paintStyle.fill,paintStyle,'#000000'),stroke:resolveImportedSvgPaint(paintStyle.stroke,paintStyle,'none'),strokeWidth:parseSvgLength(paintStyle['stroke-width'],1,'diag',lengthContext),opacity:svgOpacityNumber(paintStyle.opacity,1),fillOpacity:svgOpacityNumber(paintStyle['fill-opacity'],1),strokeOpacity:svgOpacityNumber(paintStyle['stroke-opacity'],1),linecap:paintStyle['stroke-linecap']||'butt',linejoin:paintStyle['stroke-linejoin']||'miter',strokeMiterlimit:parseSvgLength(paintStyle['stroke-miterlimit'],4),strokeDasharray:paintStyle['stroke-dasharray']||'none',strokeDashoffset:parseSvgLength(paintStyle['stroke-dashoffset'],0,'diag',lengthContext),fillRule:paintStyle['fill-rule']||'nonzero',transformSkewX:tf.shear||0};
  if(gradientPaint)Object.assign(common,gradientPaint);
 if(tag==='g'||tag==='a'){
  if(svgElementRequiresIsland(tag,paintStyle))return null;
  const children=[],childStyle=Object.fromEntries(Object.entries(st).filter(([k])=>k!=='opacity'&&k!=='transform'));
  for(const child of [...el.children]){
   if(GSP_IMPORT_SKIP.has(child.localName))continue;
   let layer=importedShape(child,0,0,childStyle,childLengthContext,{...importOptions,nested:true});
   if(layer===null&&importOptions.allowSvgIslands)layer=createEmbeddedSvgIsland(importOptions.source,child,childStyle,0,0,true);
   if(layer===null)return null;if(Array.isArray(layer))children.push(...layer);else children.push(layer);
  }
  if(!children.length)return [];return makeLayer('group',{...common,name:el.getAttribute('inkscape:label')||el.getAttribute('aria-label')||el.getAttribute('data-name')||el.getAttribute('id')||'Imported group',x:offsetX+tf.tx,y:offsetY+tf.ty,w:100,h:100,children});
 }
 if(svgElementRequiresIsland(tag,paintStyle))return null;
 if(tag==='path'){
  const d=el.getAttribute('d')||'',baseName=el.getAttribute('inkscape:label')||el.getAttribute('aria-label')||el.getAttribute('data-name')||el.getAttribute('id')||'Imported path';
  const fillVisible=String(common.fill||'none').toLowerCase()!=='none'&&common.fillOpacity>0;
  const strokeVisible=String(common.stroke||'none').toLowerCase()!=='none'&&common.strokeWidth>0&&common.strokeOpacity>0;
  if(!fillVisible&&!strokeVisible)return [];
  const components=importOptions.preserveCompoundPaths?null:splitSvgPathComponents(d,common.fillRule,common.strokeWidth,strokeVisible,fillVisible,common.strokeDasharray,common.strokeDashoffset,common.linecap);
  if(components&&components.length>1){
   const children=components.map((component,i)=>makeLayer('path',{...common,x:0,y:0,rotate:0,scaleX:100,scaleY:100,opacity:1,shadow:false,name:`${baseName} · component ${i+1}`,d:component}));
   return makeLayer('group',{...common,name:`${baseName} · components`,w:100,h:100,children});
  }
  return makeLayer('path',{...common,name:baseName,d});
 }
 if(tag==='circle'){const r=parseSvgLength(el.getAttribute('r'),0,'diag',lengthContext),cx=parseSvgLength(el.getAttribute('cx'),0,'x',lengthContext),cy=parseSvgLength(el.getAttribute('cy'),0,'y',lengthContext);return makeLayer('circle',{...common,name:el.getAttribute('inkscape:label')||el.getAttribute('aria-label')||el.getAttribute('data-name')||el.getAttribute('id')||'Imported circle',x:xoff+rsx(cx-r,cy-r),y:yoff+rsy(cx-r,cy-r),r});}
 if(tag==='ellipse'){const rx=parseSvgLength(el.getAttribute('rx'),0,'x',lengthContext),ry=parseSvgLength(el.getAttribute('ry'),0,'y',lengthContext),cx=parseSvgLength(el.getAttribute('cx'),0,'x',lengthContext),cy=parseSvgLength(el.getAttribute('cy'),0,'y',lengthContext);return makeLayer('ellipse',{...common,name:el.getAttribute('inkscape:label')||el.getAttribute('aria-label')||el.getAttribute('data-name')||el.getAttribute('id')||'Imported ellipse',x:xoff+rsx(cx-rx,cy-ry),y:yoff+rsy(cx-rx,cy-ry),rx,ry});}
 if(tag==='rect'){const x0=parseSvgLength(el.getAttribute('x'),0,'x',lengthContext),y0=parseSvgLength(el.getAttribute('y'),0,'y',lengthContext);return makeLayer('rect',{...common,name:el.getAttribute('inkscape:label')||el.getAttribute('aria-label')||el.getAttribute('data-name')||el.getAttribute('id')||'Imported rectangle',x:xoff+rsx(x0,y0),y:yoff+rsy(x0,y0),w:parseSvgLength(el.getAttribute('width'),0,'x',lengthContext),h:parseSvgLength(el.getAttribute('height'),0,'y',lengthContext),rx:parseSvgLength(el.getAttribute('rx'),0,'x',lengthContext)});}
 if(tag==='line'){const x1=parseSvgLength(el.getAttribute('x1'),0,'x',lengthContext),y1=parseSvgLength(el.getAttribute('y1'),0,'y',lengthContext),x2=parseSvgLength(el.getAttribute('x2'),0,'x',lengthContext),y2=parseSvgLength(el.getAttribute('y2'),0,'y',lengthContext),startX=xoff+rsx(x1,y1),startY=yoff+rsy(x1,y1);return makeLayer('line',{...common,name:el.getAttribute('inkscape:label')||el.getAttribute('aria-label')||el.getAttribute('data-name')||el.getAttribute('id')||'Imported line',x:startX,y:startY,x2:startX+(x2-x1),y2:startY+(y2-y1),fill:'none'});}
 if(tag==='text'){const x0=parseSvgLength(el.getAttribute('x'),0,'x',lengthContext),y0=parseSvgLength(el.getAttribute('y'),0,'y',lengthContext);if(el.children.length)return null;return makeLayer('text',{...common,name:el.getAttribute('inkscape:label')||el.getAttribute('aria-label')||el.getAttribute('data-name')||el.getAttribute('id')||'Imported text',text:el.textContent??'',x:xoff+rsx(x0,y0),y:yoff+rsy(x0,y0),fontFamily:st['font-family']||'Roboto,Arial,sans-serif',fontSize:computedFontSize,fontWeight:computedFontWeight,letterSpacing:computedLetterSpacing,anchor:st['text-anchor']||'start',baseline:importedSvgBaseline(st)});}
 if(tag==='polygon'||tag==='polyline'){const pts=(el.getAttribute('points')||'').trim().split(/[ ,]+/).map(Number);if(pts.length<4||pts.length%2)return null;let d='';for(let i=0;i<pts.length;i+=2)d+=(i===0?'M':' L')+pts[i]+' '+pts[i+1];if(tag==='polygon')d+=' Z';return makeLayer('path',{...common,name:el.getAttribute('inkscape:label')||el.getAttribute('aria-label')||el.getAttribute('data-name')||el.getAttribute('id')||`Imported ${tag}`,d});}
 return null;
}
function decomposeSimpleSvg(v,importOptions={}){
 if(v.lengthContext?.unknownViewportPercent)return null;
 const hybrid=!!importOptions.allowSvgIslands;
 if(v.typography)return null;
 // A transform on the outermost <svg> participates in viewport/root transform
 // semantics. Preserve the whole document rather than reinterpreting it as a
 // regular editor group transform.
 if(v.root.hasAttribute('transform'))return null;
 if(!hybrid&&v.root.querySelector('text > *'))return null;
 if(!hybrid&&v.root.querySelector('[vector-effect="non-scaling-stroke"], [style*="non-scaling-stroke"]'))return null;
 // Stylesheets must first be resolved on a temporary clone. If any CSS feature
 // cannot be materialized safely, keep the original SVG intact.
 if(v.root.querySelector('style'))return null;
 // A root-level effect composites the complete drawing and cannot be duplicated
 // per component. Keep such documents as one SVG layer.
 const rootStyleForEffects=styleMap(v.root);
 for(const key of ['clip-path','mask','filter','marker-start','marker-mid','marker-end'])if(rootStyleForEffects[key]&&String(rootStyleForEffects[key]).toLowerCase()!=='none')return null;
 if(rootStyleForEffects['mix-blend-mode']&&String(rootStyleForEffects['mix-blend-mode']).toLowerCase()!=='normal')return null;
  const complexEls=[...v.root.querySelectorAll('defs,mask,filter,clipPath,pattern,linearGradient,radialGradient,marker,symbol')].filter(n=>!(importOptions.allowGradientMapping&&svgDefinitionAllowedForMapping(v.root,n)));
 if(!hybrid&&complexEls.length){
  const idSet=new Set(complexEls.map(n=>n.getAttribute('id')).filter(Boolean));let referenced=false;
  [v.root,...v.root.querySelectorAll('*')].forEach(n=>{if(referenced)return;[...(n.attributes||[])].forEach(a=>{const val=String(a.value);const re=/url\(\s*['"]?#([^ )\s'"]+)/g;let mm;while((mm=re.exec(val))){if(idSet.has(mm[1])){referenced=true;break;}}if(!referenced&&(a.localName==='href'||a.name==='href'||a.name.endsWith(':href'))&&val.trim().startsWith('#')&&idSet.has(val.trim().slice(1)))referenced=true;});});
  if(referenced)return null;
 }
 const rootStyle=styleMap(v.root),rootTf=parseSvgTransform(v.root.getAttribute('transform')??rootStyle.transform);if(!rootTf)return null;
 if(String(rootStyle.display||'').toLowerCase()==='none')return null;
 const baseLengthContext=v.lengthContext||{width:v.viewW,height:v.viewH},rootRemSize=16*(Number(baseLengthContext.userUnitsPerCssY)||1),rootFontSize=resolveSvgFontSize(v.root,rootRemSize,rootRemSize,baseLengthContext);if(rootFontSize===null)return null;
 const rootFontWeight=resolveSvgFontWeight(v.root,400),rootLetterSpacingRaw=svgDeclaredStyleValue(v.root,'letter-spacing'),rootLetterSpacing=rootLetterSpacingRaw==null?0:resolveSvgLetterSpacing(rootLetterSpacingRaw,rootFontSize,rootRemSize,baseLengthContext);
 const inherited=Object.fromEntries(Object.entries(rootStyle).filter(([k])=>k!=='opacity'&&k!=='transform'));
 const importLengthContext={...baseLengthContext,parentFontSize:rootFontSize,rootRemSize,parentFontWeight:rootFontWeight,parentLetterSpacing:rootLetterSpacing};
 const out=[],options={...importOptions,source:v,allowSvgIslands:hybrid};
 for(const child of [...v.root.children]){
  if(child.namespaceURI!==NS||GSP_IMPORT_SKIP.has(child.localName))continue;
  let layer=importedShape(child,-v.viewX,-v.viewY,inherited,importLengthContext,{...options,nested:false});
  if(layer===null&&hybrid)layer=createEmbeddedSvgIsland(v,child,inherited,-v.viewX,-v.viewY,false);
  if(layer===null)return null;if(Array.isArray(layer))out.push(...layer);else out.push(layer);
 }
 if(!out.length)return null;
 const rootOpacity=svgOpacityNumber(rootStyle.opacity,1),hasRootTransform=!!(rootTf.tx||rootTf.ty||rootTf.rot||Math.abs(rootTf.sx-1)>1e-8||Math.abs(rootTf.sy-1)>1e-8||Math.abs(rootTf.shear||0)>1e-8);
 if(hasRootTransform||rootOpacity<.999999||v.typography){
  return[makeLayer('group',{name:'Imported SVG root',x:rootTf.tx,y:rootTf.ty,rotate:rootTf.rot,scaleX:rootTf.sx*100,scaleY:rootTf.sy*100,transformSkewX:rootTf.shear||0,opacity:rootOpacity,w:v.viewW,h:v.viewH,typography:v.typography||null,children:out})];
 }
 return out;
}
function decomposeHybridSvg(v){
 if(!v||v.lengthContext?.unknownViewportPercent)return null;
 let source=v;
 if(v.root.querySelector('style')){
  source=prepareSvgForEditableDecomposition(v);
  if(!source)return null;
 }
 return decomposeSimpleSvg(source,{allowSvgIslands:true});
}
async function decomposeViaPaper(v){
 if(v.typography)return null;
 // These constructs cannot currently be represented faithfully by the editor's
 // path/text layer model. Keep the original as one SVG layer instead of flattening.
 if(v.root.querySelector('style,image,filter,mask,clipPath,pattern,linearGradient,radialGradient,marker,foreignObject,use,symbol,tspan'))return null;
 let P=null,scope=null,project=null,previousProject=null,canvas=null,unsupported=false;
 try{
  P=await ensurePaper();if(!P||typeof P.setup!=='function')return null;
  canvas=document.createElement('canvas');canvas.width=Math.max(2,Math.ceil(v.viewW||100));canvas.height=Math.max(2,Math.ceil(v.viewH||100));
  if(typeof P.PaperScope==='function'){scope=new P.PaperScope();project=scope.setup(canvas)||scope.project;}
  else{previousProject=P.project||null;project=P.setup(canvas)||P.project;}
  if(!project||typeof project.importSVG!=='function')return null;
  const attrs={xmlns:NS,width:v.viewW||canvas.width,height:v.viewH||canvas.height,viewBox:`${v.viewX} ${v.viewY} ${v.viewW||canvas.width} ${v.viewH||canvas.height}`,...(v.rootAttrs||{})};
  const attrText=Object.entries(attrs).map(([k,val])=>`${k}="${String(val).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"`).join(' ');
  const item=project.importSVG(`<svg ${attrText}>${v.markup}</svg>`,{expandShapes:true,applyMatrix:true});if(!item)return null;
  const out=[];
  const cssColor=c=>{try{if(c==null)return null;if(c.type&&String(c.type).toLowerCase()==='gradient')return null;return c.toCSS(true);}catch(_){return null;}};
  const addPath=(node,parentOpacity)=>{
   const d=node.pathData;if(!d){unsupported=true;return;}
   const fc=node.fillColor,sc=node.strokeColor;
   if((fc?.type&&String(fc.type).toLowerCase()==='gradient')||(sc?.type&&String(sc.type).toLowerCase()==='gradient')){unsupported=true;return;}
   const fill=cssColor(fc)??'#000000',stroke=cssColor(sc)??'none',strokeWidth=node.strokeWidth!=null?node.strokeWidth:1;
   const common={x:0,y:0,rotate:0,scaleX:100,scaleY:100,fill,stroke,strokeWidth,opacity:Math.max(0,Math.min(1,(node.opacity==null?1:node.opacity)*parentOpacity)),fillOpacity:fc&&typeof fc.alpha==='number'?fc.alpha:1,strokeOpacity:sc&&typeof sc.alpha==='number'?sc.alpha:1,linecap:node.strokeCap||'round',linejoin:node.strokeJoin||'round',strokeDasharray:node.dashArray&&node.dashArray.length?node.dashArray.join(' '):'none',strokeDashoffset:Number(node.dashOffset)||0,fillRule:node.fillRule||'nonzero'};
   const fillVisible=String(fill).toLowerCase()!=='none'&&common.fillOpacity>0,strokeVisible=String(stroke).toLowerCase()!=='none'&&strokeWidth>0&&common.strokeOpacity>0;
   const components=splitSvgPathComponents(d,common.fillRule,strokeWidth,strokeVisible,fillVisible,(node.dashArray&&node.dashArray.length?node.dashArray.join(' '):'none'),Number(node.dashOffset)||0,node.strokeCap||'butt');
   if(components&&components.length>1){
    const children=components.map((component,i)=>makeLayer('path',{...common,x:0,y:0,rotate:0,scaleX:100,scaleY:100,opacity:1,name:`${node.name||'Imported path'} · component ${i+1}`,d:component}));
    out.push(makeLayer('group',{name:(node.name||'Imported path')+' · components',x:0,y:0,rotate:0,scaleX:100,scaleY:100,opacity:common.opacity,fill:'none',stroke:'none',children}));
   }else out.push(makeLayer('path',{...common,name:node.name||'Imported path',d}));
  };
  const addText=(node,parentOpacity)=>{const content=String(node.content??'');if(!content)return;const fc=node.fillColor;if(fc?.type&&String(fc.type).toLowerCase()==='gradient'){unsupported=true;return;}const jw={left:'start',center:'middle',right:'end'}[node.justification]||'start';let fw=node.fontWeight;if(typeof fw==='string'&&/bold/i.test(fw))fw=700;out.push(makeLayer('text',{x:node.point.x,y:node.point.y,rotate:0,scaleX:100,scaleY:100,name:node.name||'Imported text',text:content,fontFamily:node.fontFamily||'Roboto,Arial,sans-serif',fontSize:Number(node.fontSize)||16,fontWeight:Number(fw)||400,letterSpacing:Number(node.letterSpacing)||0,anchor:jw,fill:cssColor(fc)??'#000000',stroke:'none',strokeWidth:1,opacity:Math.max(0,Math.min(1,(node.opacity==null?1:node.opacity)*parentOpacity))}));};
  const walk=(node,parentOpacity=1)=>{
   if(unsupported||!node||node.visible===false)return;
   const ownOpacity=(node.opacity==null?1:node.opacity),combined=ownOpacity*parentOpacity;
   if(node.className==='PointText'){addText(node,parentOpacity);return;}
   if(node.pathData){addPath(node,parentOpacity);return;}
   if(Array.isArray(node.children)&&node.children.length){node.children.forEach(child=>walk(child,combined));return;}
   if(node===item)return;
   // Do not silently discard Raster, shape or unknown leaf types.
   unsupported=true;
  };
  walk(item,svgOpacityNumber(styleMap(v.root).opacity,1));
  return !unsupported&&out.length?out:null;
 }catch(err){return null;}
 finally{
  try{if(scope&&typeof scope.remove==='function')scope.remove();else if(project){if(typeof project.remove==='function')project.remove();else{project.clear?.();project.view?.remove?.();}}}catch(_){}
  try{if(previousProject&&previousProject!==project&&typeof previousProject.activate==='function')previousProject.activate();}catch(_){}
  if(canvas?.parentNode)canvas.remove();
 }
}
// Verify a proposed editable decomposition against the sanitized source SVG.
// SVG path components can be topologically separate yet rasterize slightly
// differently after being emitted as independent elements. This guard lets the
// editor keep a decomposition only when the visual output remains acceptably close.
async function assessSvgImportFidelity(source,parts){
 if(!Array.isArray(parts)||!parts.length)return{ok:false,reason:'No editable candidate was produced.'};
 const pathNodes=[...source.root.querySelectorAll('path')];
 const compoundRisk=pathNodes.some(node=>(parseSvgSubpathRecords(node.getAttribute('d')||'')||[]).length>1);
 const transformRisk=source.root.hasAttribute('transform')||!!source.root.querySelector('[transform]');
 const viewportRisk=/%\s*$/.test(String(source.root.getAttribute('width')||''))||/%\s*$/.test(String(source.root.getAttribute('height')||''));
 const styleRisk=!!source.root.querySelector('style,[style],[stroke-dasharray],[stroke-dashoffset],[vector-effect],[paint-order]');
 const referenceRisk=!!source.root.querySelector('use,symbol,image,textPath,tspan,filter,mask,clipPath,pattern,linearGradient,radialGradient,marker,foreignObject');
 const paintServerRisk=[...source.root.querySelectorAll('*')].some(el=>[...el.attributes].some(a=>/url\s*\(/i.test(String(a.value||''))));
 if(!compoundRisk&&!transformRisk&&!viewportRisk&&!styleRisk&&!referenceRisk&&!paintServerRisk)return{ok:true,skipped:true,reason:'No compound-path, transform, viewport, style or reference decomposition risk was detected.'};
 const countEditable=arr=>arr.reduce((n,l)=>n+(l.type==='group'?countEditable(l.children||[]):1),0);
 const componentCount=countEditable(parts);
 // Avoid expensive duplicate raster passes for huge documents. The safe result
 // for high-complexity artwork is to preserve its original SVG object.
 const markupSize=String(source.markup||'').length;
 if(componentCount>256||markupSize>1200000)return{ok:false,reason:'The SVG exceeds the safe visual-verification complexity budget.'};
 let originalUrl='',candidateUrl='';
 try{
  const originalRoot=source.root.cloneNode(true);originalRoot.setAttribute('width',String(source.w||source.viewW||100));originalRoot.setAttribute('height',String(source.h||source.viewH||100));const originalText=new XMLSerializer().serializeToString(originalRoot);
  const candidate=document.createElementNS(NS,'svg');
  candidate.setAttribute('xmlns',NS);candidate.setAttribute('width',String(source.w||source.viewW||100));candidate.setAttribute('height',String(source.h||source.viewH||100));candidate.setAttribute('viewBox',`0 0 ${source.viewW||100} ${source.viewH||100}`);candidate.setAttribute('preserveAspectRatio',source.preserveAspectRatio||'xMidYMid meet');
  const defs=svgEl('defs',{},candidate),content=svgEl('g',{},candidate);
  parts.forEach(layer=>renderNode(layer,content,defs,{}));
  const candidateText=new XMLSerializer().serializeToString(candidate);
  const raster=async text=>{
   const url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml;charset=utf-8'}));
   try{
    const img=new Image();img.src=url;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=192;canvas.height=192;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('2D canvas unavailable');
    ctx.clearRect(0,0,192,192);ctx.drawImage(img,0,0,192,192);
    return ctx.getImageData(0,0,192,192).data;
   }finally{URL.revokeObjectURL(url);}
  };
  const [a,b]=await Promise.all([raster(originalText),raster(candidateText)]);
  let changed=0,large=0,max=0,total=0;
  for(let i=0;i<a.length;i++){
   const delta=Math.abs(a[i]-b[i]);if(delta){changed++;total+=delta;if(delta>8)large++;if(delta>max)max=delta;}
  }
  const channels=a.length,changedRatio=changed/channels,largeRatio=large/channels,meanDelta=total/channels;
  // Small antialiasing deltas are tolerated. Large local errors or widespread
  // shifts cause rollback to the original SVG so import never silently damages it.
  const ok=(max<=64||(largeRatio<=.0002&&meanDelta<=.1))&&changedRatio<=.012&&largeRatio<=.0025;
  return{ok,changedChannels:changed,largeDeltaChannels:large,largeDeltaRatio:largeRatio,maxDelta:max,meanDelta,changedRatio,reason:ok?'Within visual-fidelity tolerance.':'Decomposition changed the rendered artwork beyond the safe tolerance.'};
 }catch(err){return{ok:false,reason:'Visual verification could not complete: '+(err?.message||String(err))};}
}
const IMPORT_MODE_KEY='gsp_svg_import_mode';
function getImportMode(){const v=$('bcImportMode')?.value;return ['auto','editable','preserve'].includes(v)?v:'auto'}
try{const saved=localStorage.getItem(IMPORT_MODE_KEY);if(saved&&$('bcImportMode'))$('bcImportMode').value=saved}catch(_){}
$('bcImportMode')?.addEventListener('change',()=>{try{localStorage.setItem(IMPORT_MODE_KEY,getImportMode())}catch(_){}});
$('bcImportSvg').onclick=()=>$('bcSvgFile').click();

function decodeSvgBytes(bytes){
 let encoding='utf-8',start=0;
 if(bytes.length>=2&&bytes[0]===0xff&&bytes[1]===0xfe){encoding='utf-16le';start=2;}
 else if(bytes.length>=2&&bytes[0]===0xfe&&bytes[1]===0xff){encoding='utf-16be';start=2;}
 else if(bytes.length>=3&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf){encoding='utf-8';start=3;}
 else if(bytes.length>=2&&bytes[0]===0x3c&&bytes[1]===0x00)encoding='utf-16le';
 else if(bytes.length>=2&&bytes[0]===0x00&&bytes[1]===0x3c)encoding='utf-16be';
 else{
  const head=new TextDecoder('windows-1252').decode(bytes.subarray(0,Math.min(bytes.length,512)));
  const declared=head.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i);
  if(declared&&declared[1])encoding=declared[1].toLowerCase();
 }
 try{return new TextDecoder(encoding,{fatal:false}).decode(bytes.subarray(start));}
 catch(_){return new TextDecoder('utf-8',{fatal:false}).decode(bytes);}
}
async function readSvgFileText(file){
 if(!file||typeof file.arrayBuffer!=='function')throw Error('SVG file contents could not be read.');
 const buffer=await file.arrayBuffer();
 const bytes=new Uint8Array(buffer);
 const isGzip=bytes.length>=2&&bytes[0]===0x1f&&bytes[1]===0x8b;
 if(!isGzip){
  const text=decodeSvgBytes(bytes);
  if(new Blob([text]).size>4*1024*1024)throw Error('SVG exceeds the 4 MB uncompressed file limit.');
  return text;
 }
 if(typeof DecompressionStream!=='function')throw Error('This browser cannot decompress SVGZ files. Extract the .svg from the .svgz archive and import that instead.');
 let stream;
 try{stream=new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));}
 catch(err){throw Error('The SVGZ gzip stream could not be opened: '+(err?.message||String(err)));}
 const reader=stream.getReader(),chunks=[];let total=0;
 try{
  while(true){
   const part=await reader.read();if(part.done)break;
   total+=part.value?.byteLength||0;
   if(total>4*1024*1024){try{await reader.cancel();}catch(_){}throw Error('Decompressed SVGZ exceeds the 4 MB uncompressed file limit.');}
   chunks.push(part.value);
  }
 }finally{try{reader.releaseLock();}catch(_){}}
 const merged=new Uint8Array(total);let offset=0;
 for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}
 return decodeSvgBytes(merged);
}

function svgWholeDocumentFallbackReason(v){
 if(!v?.root)return 'the SVG root could not be parsed safely';
 const rootStyle=styleMap(v.root);
 if(v.lengthContext?.unknownViewportPercent)return 'the root viewport uses percentage dimensions without a viewBox, so the user-coordinate system is unknown';
 if(v.typography)return 'the file contains editor typography metadata that must remain attached to the original SVG';
 if(v.root.hasAttribute('transform'))return 'the outermost SVG has a viewport-level transform, which is safer to preserve in its original SVG context';
 for(const key of ['clip-path','mask','filter','marker-start','marker-mid','marker-end'])if(rootStyle[key]&&String(rootStyle[key]).toLowerCase()!=='none')return `a root-level ${key} effect applies to the complete composition and cannot be split without changing its rendering`;
 if(rootStyle['mix-blend-mode']&&String(rootStyle['mix-blend-mode']).toLowerCase()!=='normal')return 'a root-level blend mode applies to the complete composition';
 if(v.root.querySelector('style')&&/@font-face/i.test([...v.root.querySelectorAll('style')].map(node=>node.textContent||'').join('\n')))return 'the stylesheet defines fonts that need to remain attached to the SVG so embedded font data and font-face rules are not lost';
 if(v.root.querySelector('style')&&!svgStylesheetCanBeMaterialized(v.root))return 'the stylesheet contains responsive, animated or state-dependent CSS that cannot be flattened to static layer styles';
 if(v.root.querySelector('style'))return 'the stylesheet could not be converted to stable per-element styles without changing its cascade';
 return 'a lossless editable decomposition could not be verified';
}
function svgNeedsWholeDocumentFallback(v){
 if(!v?.root)return true;
 const rootStyle=styleMap(v.root);
 // Root-level effects and semantics that depend on the outer SVG viewport stay intact.
 return !!(v.lengthContext?.unknownViewportPercent||v.typography||v.root.hasAttribute('transform')||['clip-path','mask','filter','marker-start','marker-mid','marker-end'].some(k=>rootStyle[k]&&String(rootStyle[k]).toLowerCase()!=='none')||(rootStyle['mix-blend-mode']&&String(rootStyle['mix-blend-mode']).toLowerCase()!=='normal')||v.root.querySelector('style'));
}
async function importSvgSources(items,options={}){
 if(!items.length)return {files:0,components:0,topLevel:0,retainedWhole:0,embeddedComponents:0,errors:[],notes:[]};
 const MAX_SVG_BATCH_FILES=30,MAX_SVG_BATCH_BYTES=32*1024*1024,MAX_SVG_FILE_BYTES=4*1024*1024;
 if(items.length>MAX_SVG_BATCH_FILES)throw Error(`Select no more than ${MAX_SVG_BATCH_FILES} SVG files at once.`);
 const totalBytes=items.reduce((sum,item)=>sum+Number(item?.file?.size??item?.size??(typeof item?.text==='string'?new Blob([item.text]).size:0)),0);
 if(totalBytes>MAX_SVG_BATCH_BYTES)throw Error(`The selected SVG batch is ${(totalBytes/1048576).toFixed(1)} MB; the safe batch limit is 32 MB. Split the import into smaller batches.`);
  const mode=options.mode||getImportMode();
  const imported=[];let firstSize=null,retainedWhole=0,embeddedComponents=0;const errors=[],notes=[];
 const countEditableComponents=arr=>arr.reduce((n,l)=>n+(l.type==='group'?countEditableComponents(l.children||[]):1),0);
 const countEmbeddedSvg=arr=>arr.reduce((n,l)=>n+(l.type==='svg'?1:l.type==='group'?countEmbeddedSvg(l.children||[]):0),0);
 for(const item of items){try{
  const name=String(item?.name||item?.file?.name||'Imported SVG'),sourceFile=item?.file||item;
  const text=typeof item?.text==='string'?item.text:await readSvgFileText(sourceFile);
  if(typeof text!=='string')throw Error('SVG file contents could not be read.');
  if(new Blob([text]).size>MAX_SVG_FILE_BYTES)throw Error('SVG exceeds the 4 MB uncompressed file limit.');
  const v=sanitizeSvg(text);if(!firstSize)firstSize={w:v.viewW,h:v.viewH};
  const hasRenderableContent=!!v.root.querySelector('path,rect,circle,ellipse,line,polygon,polyline,text,image,use,foreignObject,switch,svg');
  if(!hasRenderableContent){errors.push(`${name}: no renderable SVG artwork remained after safe import cleanup.${v.importWarnings?.length?' '+v.importWarnings.join(' '):''}`);continue;}
   const gradients=[...v.root.querySelectorAll('linearGradient,radialGradient')];
   const complexGradients=gradients.some(g=>!svgSimpleGradientSupported(v.root,g));
   let forcePreserve=mode==='preserve'||((mode==='auto'||mode==='editable')&&complexGradients),preserveReason='';
   if(forcePreserve)preserveReason=mode==='preserve'?'import mode preserves original colors':'its gradient cannot be represented as an editable gradient layer';
   let decomposeSource=v,parts=forcePreserve?null:decomposeSimpleSvg(v,{allowGradientMapping:true});
   if(!forcePreserve&&(!parts||!parts.length)){
    const prepared=prepareSvgForEditableDecomposition(v);
    if(prepared){decomposeSource=prepared;parts=decomposeSimpleSvg(prepared,{allowGradientMapping:true});}
   }
   // Hybrid decomposition keeps compatible siblings editable and retains only
   // the individual unsupported components as embedded SVG sublayers.
   if(!forcePreserve&&(!parts||!parts.length))parts=decomposeHybridSvg(decomposeSource);
   const requiresWhole=svgNeedsWholeDocumentFallback(v);
   if(!forcePreserve&&(!parts||!parts.length)){
    // Paper.js is a last-resort converter only for plain geometry/text. Calling it
    // for SVG effects, embedded content or references wastes time and can flatten
    // unsupported semantics. Those are preserved as an intact SVG object instead.
    const advanced=!!v.root.querySelector('style,image,use,symbol,textPath,tspan,foreignObject,filter,mask,clipPath,pattern,linearGradient,radialGradient,marker,iframe,object,embed');
    if(!requiresWhole&&!advanced){try{const pp=await decomposeViaPaper(v);if(pp&&pp.length)parts=pp;}catch(_){}}
   }
  if(parts&&parts.length){
   let fidelity=await assessSvgImportFidelity(v,parts);
   if(!fidelity.ok){
    const hasCompoundPaths=[...decomposeSource.root.querySelectorAll('path')].some(node=>(parseSvgSubpathRecords(node.getAttribute('d')||'')||[]).length>1);
    if(hasCompoundPaths){
      const safeParts=decomposeSimpleSvg(decomposeSource,{preserveCompoundPaths:true,allowSvgIslands:true,allowGradientMapping:true});
     if(safeParts?.length){const safeFidelity=await assessSvgImportFidelity(v,safeParts);if(safeFidelity.ok){parts=safeParts;fidelity=safeFidelity;notes.push(`${name}: compound path contours were kept together to preserve letter counters and holes; other components were decomposed.`);}}
    }
     if(!fidelity.ok){notes.push(`${name}: editable decomposition changed the visual result beyond the safe tolerance (${fidelity.reason}). The original SVG was preserved instead.`);parts=null;forcePreserve=true;preserveReason='the editable result could not be verified visually';}
   }
  }
  if(v.importWarnings?.length)notes.push(`${name}: ${v.importWarnings.join(' ')}`);
  if(parts&&parts.length){
   const count=countEditableComponents(parts),embedded=countEmbeddedSvg(parts);embeddedComponents+=embedded;
   if(count===1){
    const only=parts.length===1?parts[0]:null;
    if(only?.type==='path'){
     const hasMultipleContours=(String(only.d||'').match(/[Mm]/g)||[]).length>1;
     notes.push(hasMultipleContours?`${name}: retained as one editable compound path to preserve its original fill topology.`:`${name}: imported as one editable path component.`);
    }
   }
   if(embedded)notes.push(`${name}: ${embedded} complex component${embedded===1?' was':'s were'} retained as embedded SVG sublayer${embedded===1?'':'s'} so gradients, clipping, masks, filters, images, text shaping or advanced SVG features keep their appearance; compatible siblings were decomposed.`);
   imported.push(...parts);
  }else{
   imported.push(makeLayer('svg',{name,x:0,y:0,w:v.viewW,h:v.viewH,viewX:v.viewX,viewY:v.viewY,viewW:v.viewW,viewH:v.viewH,preserveAspectRatio:v.preserveAspectRatio,rootAttrs:v.rootAttrs,markup:v.markup,typography:v.typography,svgImportFallback:true}));retainedWhole++;
    notes.push(`${name}: retained as one complete SVG because ${forcePreserve&&preserveReason?preserveReason:svgWholeDocumentFallbackReason(v)}. The original SVG context and rendering are kept intact.`);
  }
 }catch(err){errors.push(`${String(item?.name||item?.file?.name||'SVG')}: ${err?.message||String(err)}`);}}
  if(imported.length){snap();pathEditId=null;if(!layers.length&&firstSize){W=firstSize.w;H=firstSize.h;}layers.push(...imported);selectedId=imported[imported.length-1].id;selectedIds=new Set([selectedId]);render();fitStage();for(const importedLayer of imported)if(importedLayer.type==='svg'&&/\bclip-path\s*=/i.test(String(importedLayer.markup||'')))await measureLayerPixelBounds(importedLayer);}
 const componentCount=countEditableComponents(imported),fileCount=items.length,layerWord=componentCount===1?'editable component':'editable components';
 let message=`Imported ${fileCount} SVG file${fileCount===1?'':'s'} with ${componentCount} ${layerWord}.`;
 if(retainedWhole)message+=` ${retainedWhole} file${retainedWhole===1?' was':'s were'} kept as a complete SVG object because the entire composition could not be split safely.`;
 if(embeddedComponents)message+=` ${embeddedComponents} advanced component${embeddedComponents===1?' was':'s were'} preserved as embedded SVG sublayers.`;
 if(notes.length)message+=' '+notes.join(' ');
 if(errors.length)message+=` ${errors.length} file${errors.length===1?'':'s'} could not be fully imported: ${errors.join(' | ')}`;
 status(message,errors.length?'warn':notes.length?'warn':'ok');
 return {files:fileCount,components:componentCount,topLevel:imported.length,retainedWhole,embeddedComponents,errors:[...errors],notes:[...notes]};
}

// Optional Iconify asset search. Use Iconify's structured IconifyJSON endpoint
// for imports rather than the SVG-rendering endpoint. Iconify documents the
// JSON form as {prefix}.json?icons={name}; each icon's body is SVG content
// without the outer <svg>, so we control and normalize that wrapper ourselves.
const assetPanel=$('bcAssetPanel'),assetResults=$('bcAssetResults'),assetStatus=$('bcAssetStatus');
$('bcAssetToggle').addEventListener('click',()=>{assetPanel.hidden=!assetPanel.hidden;if(!assetPanel.hidden)$('bcAssetQuery').focus();});
$('bcAssetClose').addEventListener('click',()=>assetPanel.hidden=true);
const ICONIFY_API_HOSTS=['https://api.iconify.design','https://api.simplesvg.com','https://api.unisvg.com'];
const ASSET_INITIAL_LIMIT=48,ASSET_API_MAX_LIMIT=999,ASSET_RENDER_STEP=48;
let assetSearchRequestId=0,assetSearchState=null;

function resolveIconifyJsonIcon(data,iconName){
 if(!data||typeof data!=='object')return null;
 const defaults={left:Number(data.left??0),top:Number(data.top??0),width:Number(data.width??16),height:Number(data.height??16)};
 if(![defaults.left,defaults.top,defaults.width,defaults.height].every(Number.isFinite)||defaults.width<=0||defaults.height<=0)return null;
 const icons=data.icons&&typeof data.icons==='object'?data.icons:{};
 const aliases=data.aliases&&typeof data.aliases==='object'?data.aliases:{};
 const walk=(key,seen=new Set())=>{
  if(seen.has(key)||seen.size>32)return null;seen.add(key);
  const direct=icons[key];
  if(direct&&typeof direct==='object'&&typeof direct.body==='string'){
   return{body:direct.body,left:Number(direct.left??defaults.left),top:Number(direct.top??defaults.top),width:Number(direct.width??defaults.width),height:Number(direct.height??defaults.height),rotate:Number(direct.rotate??0),hFlip:!!direct.hFlip,vFlip:!!direct.vFlip,hidden:!!direct.hidden};
  }
  const alias=aliases[key];if(!alias||typeof alias!=='object'||typeof alias.parent!=='string')return null;
  const parent=walk(alias.parent,seen);if(!parent)return null;
  const rotation=((parent.rotate+(Number(alias.rotate)||0))%4+4)%4;
  return{body:parent.body,left:Number(alias.left??parent.left),top:Number(alias.top??parent.top),width:Number(alias.width??parent.width),height:Number(alias.height??parent.height),rotate:rotation,hFlip:parent.hFlip!==!!alias.hFlip,vFlip:parent.vFlip!==!!alias.vFlip,hidden:!!alias.hidden};
 };
 const icon=walk(iconName);
 if(!icon||icon.hidden||typeof icon.body!=='string'||!icon.body.trim())return null;
 if(![icon.left,icon.top,icon.width,icon.height,icon.rotate].every(Number.isFinite)||icon.width<=0||icon.height<=0)return null;
 return icon;
}
function iconifyJsonToSvg(icon){
 // The API's generated SVG endpoint applies transformations, sizing and
 // preserveAspectRatio rules. Use this structured wrapper only for untransformed
 // icon data; transformed aliases are fetched from the SVG endpoint instead.
 if(icon.rotate%4!==0||icon.hFlip||icon.vFlip)return null;
 const n=v=>String(Number(v));
 return `<svg xmlns="${NS}" width="${n(icon.width)}" height="${n(icon.height)}" viewBox="${n(icon.left)} ${n(icon.top)} ${n(icon.width)} ${n(icon.height)}">${icon.body}</svg>`;
}
async function fetchIconifySvg(prefix,iconName){
 const errors=[];
 // Preferred path: structured IconifyJSON. This avoids importer behaviour
 // depending on generated root attributes / wrapper markup from the SVG route.
 for(const host of ICONIFY_API_HOSTS){
  try{
   const url=new URL(`${host}/${encodeURIComponent(prefix)}.json`);url.searchParams.set('icons',iconName);
   const response=await fetch(url.href,{headers:{Accept:'application/json'},mode:'cors',credentials:'omit'});
   if(!response.ok)throw Error(`HTTP ${response.status}`);
   const data=await response.json();
   const icon=resolveIconifyJsonIcon(data,iconName);
   if(icon){
    const normalized=iconifyJsonToSvg(icon);
    if(normalized)return{markup:normalized,source:'IconifyJSON',url:url.href};
    // Preserve Iconify's transformation semantics for flipped/rotated aliases.
    break;
   }
   throw Error(data?.not_found?.includes?.(iconName)?'Icon was not found in the requested collection.':'The JSON response did not contain usable icon body data.');
  }catch(err){errors.push(`${host}: ${err.message}`);}
 }
 // Compatibility fallback for aliases/transformed icons or older API instances.
 for(const host of ICONIFY_API_HOSTS){
  try{
   const url=`${host}/${encodeURIComponent(prefix)}/${encodeURIComponent(iconName)}.svg`;
   const response=await fetch(url,{headers:{Accept:'image/svg+xml'},mode:'cors',credentials:'omit'});
   if(!response.ok)throw Error(`HTTP ${response.status}`);
   const markup=await response.text();
   if(!/<svg(?:\s|>)/i.test(markup.slice(0,2000)))throw Error('The API response was not an SVG document.');
   return{markup,source:'Iconify SVG fallback',url};
  }catch(err){errors.push(`${host} SVG: ${err.message}`);}
 }
 throw Error(errors.join(' | ')||'No Iconify API server returned usable icon data.');
}
function assetSourceLabel(source){
 return source==='lucide'?'Lucide':source==='iconify'?'Iconify (excluding Lucide)':'All collections';
}
async function fetchIconifySearchPage(query,source,start,limit){
 let lastError=null;
 for(const host of ICONIFY_API_HOSTS){
  try{
   const url=new URL(`${host}/search`);
   url.searchParams.set('query',query);
   url.searchParams.set('limit',String(limit));
   if(start>0)url.searchParams.set('start',String(start));
   if(source==='lucide')url.searchParams.set('prefix','lucide');
   const response=await fetch(url.href,{headers:{Accept:'application/json'},mode:'cors',credentials:'omit'});
   if(!response.ok)throw Error(`HTTP ${response.status}`);
   const data=await response.json();
   return{icons:Array.isArray(data?.icons)?data.icons:[],host};
  }catch(err){lastError=err;}
 }
 throw Error(lastError?.message||'No Iconify API server returned usable search results.');
}
function addAssetSearchNames(state,names){
 for(const name of names){
  if(typeof name!=='string'||!/^[a-z0-9-]+:[a-z0-9-]+$/i.test(name))continue;
  if(state.source==='lucide'&&!name.startsWith('lucide:'))continue;
  if(state.source==='iconify'&&name.startsWith('lucide:'))continue;
  if(state.seen.has(name))continue;
  state.seen.add(name);state.names.push(name);
 }
}
function createVectorAssetButton(name,preferredHost){
 const [prefix,iconName]=name.split(':');
 const button=document.createElement('button');button.type='button';button.className='bc-asset-item';button.title='Insert '+name;
 const img=document.createElement('img');
 img.alt=`${name} preview`;img.width=38;img.height=38;img.loading='eager';img.decoding='async';
 img.setAttribute('aria-hidden','true');img.dataset.state='loading';
 const thumbHosts=[ICONIFY_API_HOSTS[0],...ICONIFY_API_HOSTS.slice(1)];
 const THUMBNAIL_HOST_TIMEOUT=7000;
 let thumbHostIndex=0,thumbAttempt=0,thumbTimer=null,thumbFinished=false;
 const finishThumbnail=(ok)=>{
  if(thumbFinished)return;thumbFinished=true;if(thumbTimer)clearTimeout(thumbTimer);
  img.dataset.state=ok?'loaded':'failed';
  if(!ok){img.removeAttribute('src');img.alt='Preview unavailable';button.classList.add('bc-asset-preview-failed');}
 };
 const tryNextThumbnail=()=>{
  if(thumbFinished)return;
  if(thumbTimer){clearTimeout(thumbTimer);thumbTimer=null;}
  if(thumbHostIndex>=thumbHosts.length){finishThumbnail(false);return;}
  const host=thumbHosts[thumbHostIndex++],attempt=++thumbAttempt;
  img.onload=()=>{if(attempt!==thumbAttempt||thumbFinished)return;finishThumbnail(true);};
  img.onerror=()=>{if(attempt!==thumbAttempt||thumbFinished)return;tryNextThumbnail();};
  thumbTimer=setTimeout(()=>{if(attempt===thumbAttempt&&!thumbFinished)tryNextThumbnail();},THUMBNAIL_HOST_TIMEOUT);
  img.src=`${host}/${encodeURIComponent(prefix)}/${encodeURIComponent(iconName)}.svg`;
 };
 tryNextThumbnail();
 const itemLabel=document.createElement('span');itemLabel.textContent=name;button.append(img,itemLabel);
 button.addEventListener('click',async()=>{
  button.disabled=true;assetStatus.textContent='Loading structured icon data for '+name+'…';
  try{
   const fetched=await fetchIconifySvg(prefix,iconName);
   const stats=(()=>{try{const doc=new DOMParser().parseFromString(fetched.markup,'image/svg+xml');if(doc.querySelector('parsererror'))return{paths:0,subpaths:0};const paths=[...doc.querySelectorAll('path')];const subpaths=paths.reduce((n,node)=>{const records=parseSvgSubpathRecords(node.getAttribute('d')||'');return n+(records?.length||1);},0);return{paths:paths.length,subpaths};}catch(_){return{paths:0,subpaths:0};}})();
   const result=await importSvgSources([{name:name.replace(':','-')+'.svg',text:fetched.markup}]);
   if(!result||result.errors?.length)throw Error(result?.errors?.join(' | ')||'The SVG importer did not return an import result.');
   const componentLabel=result.components===1?'1 editable component':`${result.components} editable components`;
   assetStatus.textContent=`Inserted ${name}: ${componentLabel}; ${stats.paths} path element${stats.paths===1?'':'s'} / ${stats.subpaths} path subpath${stats.subpaths===1?'':'s'} (${fetched.source}).`;
   console.info('[Glyph Studio] Iconify import diagnostics',{name,source:fetched.source,url:fetched.url,pathElements:stats.paths,pathSubpaths:stats.subpaths,editableComponents:result.components,topLevelLayers:result.topLevel,notes:result.notes});
  }catch(err){assetStatus.textContent='Could not insert '+name+': '+err.message;}
  finally{button.disabled=false;}
 });
 return button;
}
function renderNextVectorAssetResults(state){
 const end=Math.min(state.names.length,state.rendered+ASSET_RENDER_STEP);
 for(let i=state.rendered;i<end;i++)assetResults.append(createVectorAssetButton(state.names[i],state.lastHost));
 state.rendered=end;
}
function updateVectorAssetResultsUI(state,extraMessage=''){
 const moreButton=$('bcAssetLoadMore'),moreRow=$('bcAssetMoreRow');
 const hasCached=state.rendered<state.names.length;
 const hasRemote=state.serverHasMore;
 moreRow.hidden=!(hasCached||hasRemote);
 moreButton.disabled=false;
 moreButton.textContent=hasCached?`Show ${Math.min(ASSET_RENDER_STEP,state.names.length-state.rendered)} more results`:'Load next results';
 const sourceName=assetSourceLabel(state.source);
 let message;
 if(!state.names.length){
  message=hasRemote?`No ${state.source==='iconify'?'non-Lucide ':''}matches in the first batch. More results may be available.`:`No matching icons found in ${sourceName}.`;
 }else{
  message=`Showing ${state.rendered} of ${state.names.length} loaded matches · ${sourceName}.`;
  if(hasRemote)message+=' More matches may be available.';
  else if(!hasCached)message+=' Search results complete.';
 }
 assetStatus.textContent=extraMessage?`${message} ${extraMessage}`:message;
}
async function searchVectorAssets(){
 const query=$('bcAssetQuery').value.trim(),source=$('bcAssetSource').value;
 if(query.length<2){
  assetSearchRequestId++;assetSearchState=null;assetResults.replaceChildren();$('bcAssetMoreRow').hidden=true;
  assetStatus.textContent='Enter at least two characters to search.';return;
 }
 const requestId=++assetSearchRequestId;
 const state={requestId,query,source,names:[],seen:new Set(),rendered:0,nextStart:0,serverHasMore:false,lastHost:ICONIFY_API_HOSTS[0]};
 assetSearchState=state;assetResults.replaceChildren();$('bcAssetMoreRow').hidden=true;
 const searchButton=$('bcAssetSearch');searchButton.disabled=true;assetStatus.textContent=`Searching ${assetSourceLabel(source)}…`;
 try{
  const page=await fetchIconifySearchPage(query,source,0,ASSET_INITIAL_LIMIT);
  if(assetSearchState!==state)return;
  state.lastHost=page.host;state.nextStart=page.icons.length;state.serverHasMore=page.icons.length===ASSET_INITIAL_LIMIT;
  addAssetSearchNames(state,page.icons);
  renderNextVectorAssetResults(state);
  updateVectorAssetResultsUI(state);
 }catch(err){
  if(assetSearchState===state){assetStatus.textContent='Icon search unavailable: '+err.message+'. You can still import SVG files from your device.';}
 }finally{if(assetSearchState===state)searchButton.disabled=false;}
}
async function loadMoreVectorAssets(){
 const state=assetSearchState,moreButton=$('bcAssetLoadMore');
 if(!state||moreButton.disabled)return;
 if(state.rendered<state.names.length){renderNextVectorAssetResults(state);updateVectorAssetResultsUI(state);return;}
 if(!state.serverHasMore){$('bcAssetMoreRow').hidden=true;return;}
 moreButton.disabled=true;moreButton.textContent='Loading…';
 try{
  const page=await fetchIconifySearchPage(state.query,state.source,state.nextStart,ASSET_API_MAX_LIMIT);
  if(assetSearchState!==state)return;
  const previousCount=state.names.length;
  state.lastHost=page.host;state.nextStart+=page.icons.length;state.serverHasMore=page.icons.length===ASSET_API_MAX_LIMIT;
  addAssetSearchNames(state,page.icons);
  if(state.names.length>state.rendered){renderNextVectorAssetResults(state);updateVectorAssetResultsUI(state);}
  else if(state.serverHasMore){updateVectorAssetResultsUI(state,'This batch had no new icons for the selected filter. Load the next batch to continue.');}
  else{updateVectorAssetResultsUI(state,previousCount===state.names.length?'There are no more matching icons.':'');}
 }catch(err){
  if(assetSearchState===state){assetStatus.textContent='Could not load more icons: '+err.message+'. You can retry or refine the search.';}
 }finally{
  if(assetSearchState===state){moreButton.disabled=false;moreButton.textContent=state.rendered<state.names.length?`Show ${Math.min(ASSET_RENDER_STEP,state.names.length-state.rendered)} more results`:'Load next results';}
 }
}
$('bcAssetSearch').addEventListener('click',searchVectorAssets);
$('bcAssetQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchVectorAssets();}});
$('bcAssetLoadMore').addEventListener('click',loadMoreVectorAssets);
$('bcAssetSource').addEventListener('change',()=>searchVectorAssets());

$('bcSvgFile').onchange=async e=>{const files=[...e.target.files||[]];if(!files.length)return;try{await importSvgSources(files.map(file=>({name:file.name,file})));}catch(err){status('SVG batch import stopped: '+err.message,'error');}finally{e.target.value='';}};
$('bcImportSvgUrl').onclick=async()=>{const raw=prompt('Enter a direct URL to an SVG file (the host must allow cross-origin browser access):');if(!raw)return;try{const url=new URL(raw);if(!['http:','https:'].includes(url.protocol))throw Error('Only HTTP and HTTPS URLs are supported.');const response=await fetch(url.href,{mode:'cors',credentials:'omit'});if(!response.ok)throw Error(`HTTP ${response.status} ${response.statusText}`);const type=response.headers.get('content-type')||'';const text=await response.text();if(!/svg|xml|text\//i.test(type)&&!/<svg[\s>]/i.test(text.slice(0,1000)))throw Error('The URL did not return SVG content.');await importSvgSources([{name:url.pathname.split('/').pop()||'remote.svg',text}]);}catch(err){status(`URL import failed: ${err.message}. The server may block CORS; download the SVG and use Import SVGs instead.`,'error');}};
function createSvgString(exportOptions={}){const svg=document.createElementNS(NS,'svg');svg.setAttribute('xmlns',NS);svg.setAttribute('width',W);svg.setAttribute('height',H);svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('style','position:fixed;left:-100000px;top:-100000px;visibility:hidden;pointer-events:none');document.body.appendChild(svg);try{const defs=svgEl('defs',{},svg),root=svgEl('g',{},svg);layers.forEach(l=>renderNode(l,root,defs,exportOptions));svg.removeAttribute('style');return new XMLSerializer().serializeToString(svg);}finally{svg.remove();}}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);}
function safeExportBaseName(value){const clean=String(value??'').trim().replace(/\.(?:svg|png|zip)$/i,'');return safeName(clean)||'badge-composition';}
const BC_EXPORT_PREF='glyphStudioBadgeExportSettingsV2';
const BC_EXPORT_PREF_OLD='glyphStudioBadgeExportSettingsV1';
const BC_EXPORT_DEFAULTS={textMode:'editable',fileName:'badge-composition',optimize:false,level:'balanced',precision:3,multipass:true,keepViewBox:true,keepIds:true,keepA11y:true,keepMetadata:true,nuvioSafe:false,pngScale:2,zipProject:true,zipPng:true,zipOriginal:true};
function readBcExportSettings(){const $v=id=>$(id)?.value;const $c=id=>!!$(id)?.checked;const precisionRaw=$v('bcExportPrecision'),p=precisionRaw===''?BC_EXPORT_DEFAULTS.precision:Number(precisionRaw);return{textMode:['editable','paths'].includes($v('bcExportTextMode'))?$v('bcExportTextMode'):'editable',fileName:safeExportBaseName($v('bcExportFileName')||'badge-composition'),optimize:$c('bcExportOptimize'),level:['conservative','balanced','maximum'].includes($v('bcExportOptimizationLevel'))?$v('bcExportOptimizationLevel'):'balanced',precision:Math.max(2,Math.min(6,Math.round(Number.isFinite(p)?p:3))),multipass:$c('bcExportMultipass'),keepViewBox:$c('bcExportKeepViewBox'),keepIds:$c('bcExportKeepIds'),keepA11y:$c('bcExportKeepA11y'),keepMetadata:$c('bcExportKeepMetadata'),nuvioSafe:$c('bcExportNuvioSafe'),pngScale:Math.max(1,Math.min(4,Number($v('bcExportPngScale'))||2)),zipProject:$c('bcExportZipProject'),zipPng:$c('bcExportZipPng'),zipOriginal:$c('bcExportZipOriginal')};}
function applyBcExportSettings(settings){const raw={...BC_EXPORT_DEFAULTS,...(settings||{})},p=raw.precision==null||raw.precision===''?BC_EXPORT_DEFAULTS.precision:Number(raw.precision),scale=raw.pngScale==null||raw.pngScale===''?BC_EXPORT_DEFAULTS.pngScale:Number(raw.pngScale);const s={textMode:['editable','paths'].includes(raw.textMode)?raw.textMode:'editable',fileName:safeExportBaseName(raw.fileName||'badge-composition'),optimize:!!raw.optimize,level:['conservative','balanced','maximum'].includes(raw.level)?raw.level:'balanced',precision:Math.max(2,Math.min(6,Math.round(Number.isFinite(p)?p:3))),multipass:(['conservative','balanced','maximum'].includes(raw.level)?raw.level:'balanced')==='conservative'?false:!!raw.multipass,keepViewBox:raw.keepViewBox!==false,keepIds:raw.keepIds!==false,keepA11y:raw.keepA11y!==false,keepMetadata:raw.keepMetadata!==false,nuvioSafe:!!raw.nuvioSafe,pngScale:Math.max(1,Math.min(4,Number.isFinite(scale)?scale:2)),zipProject:raw.zipProject!==false,zipPng:raw.zipPng!==false,zipOriginal:raw.zipOriginal!==false};$('bcExportTextMode').value=s.textMode;$('bcExportFileName').value=s.fileName;$('bcExportOptimize').checked=s.optimize;$('bcExportOptimizationLevel').value=s.level;$('bcExportPrecision').value=s.precision;$('bcExportMultipass').checked=s.multipass;$('bcExportKeepViewBox').checked=s.keepViewBox;$('bcExportKeepIds').checked=s.keepIds;$('bcExportKeepA11y').checked=s.keepA11y;$('bcExportKeepMetadata').checked=s.keepMetadata;$('bcExportNuvioSafe').checked=s.nuvioSafe;$('bcExportPngScale').value=String(s.pngScale);$('bcExportZipProject').checked=s.zipProject;$('bcExportZipPng').checked=s.zipPng;$('bcExportZipOriginal').checked=s.zipOriginal;syncBcExportUi();}
function persistBcExportSettings(){try{localStorage.setItem(BC_EXPORT_PREF,JSON.stringify(readBcExportSettings()));}catch(_){}if(typeof persistBadgeDraft==='function')persistBadgeDraft();}
function exportTextLayers(){const out=[];const walk=(arr,visible=true)=>{for(const l of arr||[]){const shown=visible&&l.visible!==false;if(!shown)continue;if(l.type==='text'&&String(l.text||'').trim())out.push(l);if(l.type==='group')walk(l.children||[],shown);}};walk(layers);return out;}
function updateBcExportInventory(){const texts=exportTextLayers(),embedded=texts.filter(l=>!!l.fontData).length,liveHB=texts.filter(l=>hbFonts.has(l.id)).length,onPath=texts.filter(l=>!!l.textPathId).length;$('bcExportInventory').textContent=`${allLayers().length} total layers · ${texts.length} visible text · ${embedded} embedded fonts`;
 const warning=$('bcExportTextWarning');if(readBcExportSettings().textMode==='paths'){
  const missing=texts.filter(l=>!l.fontData&&!fonts.has(l.id)&&!hbFonts.has(l.id)),pathTexts=texts.filter(l=>l.textPathId),blocked=[...new Set([...missing,...pathTexts])];
  if(blocked.length){warning.textContent=`Outlined export is unavailable for: ${blocked.map(l=>`${l.name||l.id}${l.textPathId?' (text-on-path)':' (no embedded font)'}`).join(', ')}. Embed a compatible font for ordinary text; detach text-on-path or export it as editable text.`;warning.classList.remove('ready');warning.classList.add('show');}
  else{warning.textContent=liveHB?'Ready: all visible text layers have outline-capable embedded fonts, including HarfBuzz-shaped text.':'Ready: all visible text layers have outline-capable fonts.';warning.classList.add('ready');warning.classList.add('show');}
 }else{warning.textContent='';warning.classList.remove('show','ready');}
 const viewBoxNote=$('bcExportViewBoxNote');if(viewBoxNote){viewBoxNote.classList.toggle('show',!$('bcExportKeepViewBox').checked&&$('bcExportOptimize').checked);}
}
function syncBcExportUi(){
 const optimize=$('bcExportOptimize').checked;
 const level=$('bcExportOptimizationLevel').value;
 const conservative=level==='conservative';
 ['bcExportOptimizationLevel','bcExportKeepViewBox','bcExportKeepIds','bcExportKeepA11y','bcExportKeepMetadata'].forEach(id=>$(id).disabled=!optimize);
 $('bcExportMultipass').disabled=!optimize||conservative;
 // Conservative deliberately preserves path commands, so path precision is only
 // applicable when Balanced or Maximum runs SVGO's convertPathData plugin.
 $('bcExportPrecision').disabled=!optimize||level==='conservative';
 $('bcExportZipOriginal').disabled=!optimize;
 $('bcExportZipProject').disabled=false;
 $('bcExportZipPng').disabled=false;
 updateBcExportInventory();
 persistBcExportSettings();
}
function openBcExportDialog(){try{let saved=JSON.parse(localStorage.getItem(BC_EXPORT_PREF)||'null');if(!saved)saved=JSON.parse(localStorage.getItem(BC_EXPORT_PREF_OLD)||'null');applyBcExportSettings(saved||BC_EXPORT_DEFAULTS);}catch(_){applyBcExportSettings(BC_EXPORT_DEFAULTS);}updateBcExportInventory();const d=$('bcExportDialog');if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');}
$('bcOpenExport').addEventListener('click',openBcExportDialog);
$('bcExportClose').addEventListener('click',()=>$('bcExportDialog').close());
$('bcExportDialog').addEventListener('click',e=>{if(e.target===$('bcExportDialog'))$('bcExportDialog').close();});
const bcExportDialog=$('bcExportDialog');
$('bcExportDialog').addEventListener('cancel',()=>{});
$('bcExportDialog').addEventListener('close',()=>{try{$('bcOpenExport').focus();}catch(_){}});
bcExportDialog.addEventListener('keydown',e=>{
 if(e.key!=='Tab')return;
 const focusables=bcExportDialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[href]');
 if(!focusables.length)return;
 const first=focusables[0],last=focusables[focusables.length-1];
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
 else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 else if(!bcExportDialog.contains(document.activeElement)){e.preventDefault();first.focus();}
});
$('bcOpenExport').addEventListener('click',()=>{try{setTimeout(()=>{const c=bcExportDialog.querySelector('.bc-export-close,[data-close]')||bcExportDialog.querySelector('button');if(c&&typeof c.focus==='function')c.focus();},50);}catch(_){}});
['bcExportTextMode','bcExportFileName','bcExportOptimize','bcExportOptimizationLevel','bcExportPrecision','bcExportMultipass','bcExportKeepViewBox','bcExportKeepIds','bcExportKeepA11y','bcExportKeepMetadata','bcExportNuvioSafe','bcExportPngScale','bcExportZipProject','bcExportZipPng','bcExportZipOriginal'].forEach(id=>$(id).addEventListener('change',()=>{
 if(id==='bcExportOptimizationLevel'){
  // Presets select the search strategy, not the user's path precision.
  const preset={conservative:{multipass:false},balanced:{multipass:true},maximum:{multipass:true}}[$(id).value];
  $('bcExportMultipass').checked=preset.multipass;
 }
 syncBcExportUi();
}));
$('bcExportFileName').addEventListener('input',()=>{const clean=safeName($('bcExportFileName').value);$('bcExportFileName').dataset.clean=clean;});
async function prepareVectorTextExport(){const texts=exportTextLayers(),blockers=[];if(texts.some(l=>l.textPathId))blockers.push(...texts.filter(l=>l.textPathId).map(l=>`${l.name||l.id} (text-on-path)`));const candidates=texts.filter(l=>!l.textPathId);
 if(candidates.some(l=>!l.fontData&&!fonts.has(l.id)&&!hbFonts.has(l.id)))blockers.push(...candidates.filter(l=>!l.fontData&&!fonts.has(l.id)&&!hbFonts.has(l.id)).map(l=>`${l.name||l.id} (font not embedded)`));
 if(blockers.length)throw Error('Cannot export every text layer as vector paths. '+blockers.join(', ')+'. Load and embed a font, or choose Editable text.');
 const withData=candidates.filter(l=>l.fontData&&!fonts.has(l.id)&&!hbFonts.has(l.id));if(withData.length){const ot=await ensureOpenType();for(const l of withData){try{fonts.set(l.id,ot.parse(base64ToBuffer(l.fontData)));}catch(err){throw Error(`Could not outline “${l.name||l.id}”: ${err.message}`);}}}
 const stillMissing=candidates.filter(l=>!fonts.has(l.id)&&!hbFonts.has(l.id));if(stillMissing.length)throw Error('Font outlines unavailable for: '+stillMissing.map(l=>l.name||l.id).join(', '));
}
function svgoConfigForExport(settings){
 const precision=Math.max(2,Math.min(6,Math.round(Number.isFinite(Number(settings?.precision))?Number(settings.precision):BC_EXPORT_DEFAULTS.precision)));
 const level=['conservative','balanced','maximum'].includes(settings?.level)?settings.level:'balanced';
 const overrides={
  cleanupIds:!settings.keepIds,
  convertShapeToPath:level==='maximum',
  removeDesc:settings.keepA11y?false:{removeAny:true},
  removeComments:!settings.keepMetadata,
  removeMetadata:!settings.keepMetadata
 };
 if(level==='conservative'){
  // Preserve path commands and grouping; SVGO may still clean non-geometric
  // markup through preset-default, but it does not round or rewrite path data.
  Object.assign(overrides,{
   convertPathData:false,
   convertTransform:false,
   collapseGroups:false,
   mergePaths:false,
   cleanupNumericValues:false
  });
 }else{
  // Path precision maps directly to SVGO convertPathData.floatPrecision.
  // Do not silently apply it to transforms, mergePaths, or other numeric plugins.
  overrides.convertPathData={floatPrecision:precision};
  overrides.cleanupNumericValues={floatPrecision:precision};
 }
 const plugins=[{name:'preset-default',params:{overrides}}];
 // SVGO v4 removed these from preset-default; apply only when explicitly requested.
 if(!settings.keepViewBox)plugins.push('removeViewBox');
 if(!settings.keepA11y)plugins.push('removeTitle');
 const multipass=level==='conservative'?false:!!settings.multipass;
 return{multipass,plugins};
}
function flattenNuvioSvg(svgText){
 const doc=new DOMParser().parseFromString(svgText,'image/svg+xml');
 if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('Nuvio-safe export could not parse the SVG.');
 const holder=document.createElementNS(NS,'svg');
 holder.setAttribute('style','position:fixed;left:-100000px;top:-100000px;width:1px;height:1px;visibility:hidden;pointer-events:none');
 holder.appendChild(document.importNode(doc.documentElement,true));
 document.body.appendChild(holder);
 try{
  const rootEl=holder.firstElementChild,nested=[...rootEl.querySelectorAll('svg')];
  for(let i=nested.length-1;i>=0;i--){
   const inner=nested[i],m=inner.getCTM(),parentMatrix=inner.parentElement?.getCTM(),inverseParent=parentMatrix?invertAffineMatrix(parentMatrix):null,relative=inverseParent&&m?multiplyAffineMatrices(inverseParent,m):m,g=document.createElementNS(NS,'g');
   g.setAttribute('transform',relative?`matrix(${relative.a} ${relative.b} ${relative.c} ${relative.d} ${relative.e} ${relative.f})`:'');
   for(const attr of [...inner.attributes]){if(['x','y','width','height','viewBox','preserveAspectRatio','transform','data-layer-id','xmlns'].includes(attr.name))continue;g.setAttribute(attr.name,attr.value);}
    let outer=g;
    if(String(inner.getAttribute('overflow')||'').toLowerCase()!=='visible'){
     const x=Number(inner.getAttribute('x')||0),y=Number(inner.getAttribute('y')||0),w=Number(inner.getAttribute('width')||0),h=Number(inner.getAttribute('height')||0);
     if([x,y,w,h].every(Number.isFinite)&&w>0&&h>0){
      let defs=rootEl.querySelector('defs');if(!defs){defs=document.createElementNS(NS,'defs');rootEl.insertBefore(defs,rootEl.firstChild);}
      const clipId=`nuvio_flat_clip_${i}_${Math.random().toString(36).slice(2,9)}`,clip=document.createElementNS(NS,'clipPath');clip.setAttribute('id',clipId);clip.setAttribute('clipPathUnits','userSpaceOnUse');svgEl('rect',{x,y,width:w,height:h},clip);defs.appendChild(clip);outer=document.createElementNS(NS,'g');outer.setAttribute('clip-path',`url(#${clipId})`);outer.appendChild(g);
     }
    }
    while(inner.firstChild)g.appendChild(inner.firstChild);
    inner.replaceWith(outer);
  }
  rootEl.removeAttribute('style');
  return new XMLSerializer().serializeToString(rootEl);
 }finally{holder.remove();}
}
async function createConfiguredSvg(settings){if(settings.textMode==='paths')await prepareVectorTextExport();const raw=createSvgString({textMode:settings.textMode});let svg=raw;let optimized=false;if(settings.optimize){const engine=await ensureSVGO(),result=engine.optimize(raw,svgoConfigForExport(settings));if(!result||typeof result.data!=='string'||!result.data.includes('<svg'))throw Error('SVGO did not return a valid SVG document.');svg=result.data;optimized=true;}if(settings.nuvioSafe)svg=flattenNuvioSvg(svg);return{svg,original:raw,optimized};}
async function rasterizeConfiguredSvg(svgText,requestedScale){let url='';try{const blob=new Blob([svgText],{type:'image/svg+xml;charset=utf-8'});url=URL.createObjectURL(blob);const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('SVG could not be rasterised. Check external images or SVG filters.'));img.src=url;});const scale=Math.min(requestedScale,16384/W,16384/H,Math.sqrt(64000000/(W*H)));if(!(scale>0))throw Error('Canvas dimensions are too large for PNG export.');const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(W*scale));canvas.height=Math.max(1,Math.floor(H*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('2D canvas is unavailable.');ctx.drawImage(img,0,0,canvas.width,canvas.height);const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw Error('PNG encoding failed.');return{blob:png,width:canvas.width,height:canvas.height,actualScale:scale};}finally{if(url)URL.revokeObjectURL(url);}}
function safeProjectText(value,max=4000){return String(value??'').slice(0,max);}
function sanitizeProjectLayers(input){
 if(!Array.isArray(input))throw Error('Project layers must be an array.');
 if(input.length>2000)throw Error('Project contains too many layers (maximum 2,000).');
 const types=new Set(['text','path','circle','ellipse','rect','line','image','svg','group']);
 const numeric={x:[-100000,100000,0],y:[-100000,100000,0],x2:[-100000,100000,0],y2:[-100000,100000,0],rotate:[-360000,360000,0],scaleX:[0.01,10000,100],scaleY:[0.01,10000,100],transformSkewX:[-1000,1000,0],opacity:[0,1,1],fillOpacity:[0,1,1],strokeOpacity:[0,1,1],fillAlpha:[0,255,255],fill2Alpha:[0,255,255],strokeAlpha:[0,255,255],strokeWidth:[0,10000,1],strokeDashoffset:[-100000,100000,0],strokeMiterlimit:[1,1000,4],gradientAngle:[-360000,360000,0],opticalGapX:[-1000,1000,0],opticalGapY:[-1000,1000,0],fontSize:[1,1000,18],fontWeight:[100,900,500],letterSpacing:[-1000,1000,0],lineSpacing:[.5,4,1.2],textPathOffset:[0,100,0],r:[0,100000,5],rx:[0,100000,10],ry:[0,100000,6],w:[0,100000,30],h:[0,100000,18],viewX:[-100000,100000,0],viewY:[-100000,100000,0],viewW:[.01,100000,100],viewH:[.01,100000,100],shapeRadius:[.1,100000,20],shapeInnerRadius:[0,100000,9],shapeSides:[3,64,5],gridColumn:[0,99,0],gridRow:[0,99,0],thicknessMatchRadius:[-2000,2000,0]};
 const bools=['visible','locked','shadow','pathMode','harfBuzz','svgLinecapOverride','svgLinejoinOverride'];
 const strings={name:160,text:4000,fontFamily:256,fontName:256,anchor:16,baseline:32,fill:128,fill2:128,fillType:16,stroke:128,strokeDasharray:256,linecap:16,linejoin:16,thinCornerJoin:16,pathOffsetJoin:16,fillRule:16,generatedShape:16,href:22000000,preserveAspectRatio:80,textPathId:64,hbScript:32,hbLanguage:32,hbDirection:16};
 const ids=new Set();let count=0,markupBytes=0;
 function clean(raw,depth){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('A project layer is not a valid object.');
  if(depth>12)throw Error('Project group nesting exceeds 12 levels.');
  if(++count>2000)throw Error('Project contains more than 2,000 layers.');
  const type=String(raw.type||'');if(!types.has(type))throw Error('Unsupported project layer type: '+type);
  const props={};let id=typeof raw.id==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(raw.id)?raw.id:'';
  if(!id||ids.has(id))id=uid();ids.add(id);props.id=id;
  for(const [key,[min,max,fallback]] of Object.entries(numeric))if(Object.hasOwn(raw,key)){const n=Number(raw[key]);props[key]=Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;}
  // These are stored SVG-unit offsets, not UI-bounded slider values. Preserve
  // every finite magnitude and let the geometry engine decide whether it is safe.
  if(Object.hasOwn(raw,'thinAmount')){const n=Number(raw.thinAmount);if(Number.isFinite(n))props.thinAmount=Math.max(0,n);}
  if(Object.hasOwn(raw,'pathOffsetAmount')){const n=Number(raw.pathOffsetAmount);if(Number.isFinite(n))props.pathOffsetAmount=n;}
  for(const key of bools)if(Object.hasOwn(raw,key))props[key]=!!raw[key];
  for(const [key,max] of Object.entries(strings))if(typeof raw[key]==='string')props[key]=safeProjectText(raw[key],max);
  const MAX_PATH_DATA_CHARS=5000000;for(const key of ['d','thinSourceD','pathOffsetSourceD'])if(typeof raw[key]==='string'){if(raw[key].length>MAX_PATH_DATA_CHARS)throw Error(`Vector path ${key} is ${raw[key].length.toLocaleString()} characters; the safe limit is ${MAX_PATH_DATA_CHARS.toLocaleString()}. The project was not modified.`);props[key]=raw[key];}
  if(Array.isArray(raw.thinOpenSubpaths))props.thinOpenSubpaths=[...new Set(raw.thinOpenSubpaths.map(Number).filter(v=>Number.isInteger(v)&&v>=0&&v<1000))].slice(0,1000);
  if(Array.isArray(raw.pathOffsetOpenSubpaths))props.pathOffsetOpenSubpaths=[...new Set(raw.pathOffsetOpenSubpaths.map(Number).filter(v=>Number.isInteger(v)&&v>=0&&v<1000))].slice(0,1000);
  if(props.fillType&&!['solid','linear','radial'].includes(props.fillType))props.fillType='solid';
  if(props.anchor&&!['start','middle','end'].includes(props.anchor))props.anchor='start';
  if(props.baseline&&!['alphabetic','hanging','middle','central','text-before-edge','text-after-edge'].includes(props.baseline))props.baseline='alphabetic';
  if(props.linecap&&!['butt','round','square'].includes(props.linecap))props.linecap='round';
  if(props.linejoin&&!['miter','round','bevel','match-thin'].includes(props.linejoin))props.linejoin='round';
  if(props.thinCornerJoin&&!['miter','round','bevel'].includes(props.thinCornerJoin))delete props.thinCornerJoin;
  if(props.pathOffsetJoin&&!['miter','round','bevel'].includes(props.pathOffsetJoin))delete props.pathOffsetJoin;
  if(props.fillRule&&!['nonzero','evenodd'].includes(props.fillRule))props.fillRule='nonzero';
  if(props.generatedShape&&!['polygon','star'].includes(props.generatedShape))delete props.generatedShape;
  if(props.generatedShape==='star'){const outer=Math.max(.1,Number(props.shapeRadius)||20);props.shapeInnerRadius=Math.max(.1,Math.min(outer*.9,Number(props.shapeInnerRadius)||outer*.46));}
  if(props.name!==undefined)props.name=props.name.replace(/[\u0000-\u001f]/g,'').trim()||type;
  for(const key of ['fill','fill2','stroke'])if(props[key]!==undefined&&/(?:javascript:|expression\s*\(|url\s*\(\s*https?:)/i.test(props[key]))props[key]=key==='stroke'?'none':'#FFFFFF';
  if(type==='path'){
   if(!props.d)throw Error('A path layer has no path data.');
   validatePathSyntax(props.d);
   if(props.thinSourceD){validatePathSyntax(props.thinSourceD);if(!(props.thinAmount>0))delete props.thinSourceD;}
   else delete props.thinAmount;
   if(props.pathOffsetSourceD){validatePathSyntax(props.pathOffsetSourceD);if(!Number.isFinite(Number(props.pathOffsetAmount))||Math.abs(Number(props.pathOffsetAmount))<1e-8)delete props.pathOffsetSourceD;}
   else if(props.thinSourceD){props.pathOffsetSourceD=props.thinSourceD;props.pathOffsetAmount=num(props.thinAmount,0);props.pathOffsetJoin=props.thinCornerJoin||'miter';}
   if(props.pathOffsetSourceD){if(!Number.isFinite(Number(props.pathOffsetAmount)))delete props.pathOffsetSourceD;if(!props.pathOffsetJoin)props.pathOffsetJoin=props.thinCornerJoin||'miter';}
   else{delete props.pathOffsetAmount;delete props.pathOffsetJoin;delete props.pathOffsetOpenSubpaths;}
  }
  if(type==='text'){
   props.text=String(props.text??'').slice(0,4000);
   if(typeof raw.fontData==='string'){
    if(raw.fontData.length>22000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(raw.fontData))throw Error('An embedded font has invalid or oversized base64 data.');
    props.fontData=raw.fontData;
   }else props.fontData='';
   if(raw.hbAxisValues&&typeof raw.hbAxisValues==='object'&&!Array.isArray(raw.hbAxisValues)){
    const axes={};for(const [tag,value] of Object.entries(raw.hbAxisValues).slice(0,32)){const n=Number(value);if(/^[A-Za-z0-9]{4}$/.test(tag)&&Number.isFinite(n))axes[tag]=Math.max(-100000,Math.min(100000,n));}props.hbAxisValues=axes;
   }
   if(props.hbDirection&&!['ltr','rtl','ttb','btt'].includes(props.hbDirection))props.hbDirection='ltr';
  }
  if(type==='image'){
   const href=String(raw.href||'');if(!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(href)||href.length>22000000)throw Error('An image layer contains an unsupported or external image source.');props.href=href;
  }
  if(type==='svg'){
   const markup=String(raw.markup||'');if(markup.length>4000000)throw Error('An imported SVG layer exceeds the 4 MB markup limit.');if(markupBytes+markup.length>12000000)throw Error('Combined imported SVG markup exceeds the 12 MB project limit.');
   const parsed=new DOMParser().parseFromString(`<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink">${markup}</svg>`,'image/svg+xml');
   if(parsed.querySelector('parsererror')||parsed.documentElement.localName!=='svg')throw Error('An imported SVG layer contains invalid markup.');
   const wrapper=parsed.documentElement;
   const rootAllow=['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','vector-effect','paint-order','fill-rule','clip-rule','color','font-family','font-size','font-weight','text-anchor','opacity','fill-opacity','stroke-opacity','shape-rendering','text-rendering','style','preserveAspectRatio'];
   const attrs=raw.rootAttrs&&typeof raw.rootAttrs==='object'&&!Array.isArray(raw.rootAttrs)?raw.rootAttrs:{};
   for(const key of rootAllow)if(typeof attrs[key]==='string')wrapper.setAttribute(key,attrs[key].slice(0,512));
   const cleanSvg=sanitizeSvg(new XMLSerializer().serializeToString(wrapper));
   props.markup=cleanSvg.markup;props.rootAttrs=cleanSvg.rootAttrs;
   props.w=Math.max(.01,Math.min(100000,num(raw.w,cleanSvg.w||100)));props.h=Math.max(.01,Math.min(100000,num(raw.h,cleanSvg.h||100)));
   props.viewX=cleanSvg.viewX;props.viewY=cleanSvg.viewY;props.viewW=Math.max(.01,cleanSvg.viewW);props.viewH=Math.max(.01,cleanSvg.viewH);props.preserveAspectRatio=cleanSvg.preserveAspectRatio;props.typography=sanitizeTypographyMetadata(raw.typography)||cleanSvg.typography;
   markupBytes+=props.markup.length;if(markupBytes>12000000)throw Error('Combined imported SVG markup exceeds the 12 MB project limit.');
  }
  // Keep validated writing-line metadata on imported outline paths and
  // groups as well as SVG layers. Without this, a manually marked baseline
  // would disappear when the editable project is saved and reopened.
  if((type==='path'||type==='group')&&raw.typography)props.typography=sanitizeTypographyMetadata(raw.typography);
  if(type==='group'){
   const children=Array.isArray(raw.children)?raw.children:[];props.children=children.map(child=>clean(child,depth+1));
  }
  const layer=makeLayer(type,props);
  if(type==='line'){layer.x2=Math.max(-100000,Math.min(100000,num(raw.x2,layer.x2)));layer.y2=Math.max(-100000,Math.min(100000,num(raw.y2,layer.y2)));}
  return layer;
 }
 const result=input.map(layer=>clean(layer,0));
 const byId=new Map(allLayers(result).map(l=>[l.id,l]));
 for(const l of allLayers(result))if(l.type==='text'&&l.textPathId){const target=byId.get(l.textPathId);if(!target||target.type!=='path')l.textPathId='';}
 return result;
}
function currentProjectJson(){
 const projectLayers=clone(layers),previewStates=[...pathInsetPreviewDrafts.values()].filter(pathInsetDraftIsCurrent);
 const previewById=new Map();for(const state of previewStates)for(const [id,d] of state.byId)previewById.set(id,{d,source:state.sourceById?.get(id),amount:state.amount,direction:state.direction||'in',join:state.join,open:state.openById?.get(id)||[]});
 if(previewById.size){
  const sync=(source,target)=>{
   let changed=false;const preview=previewById.get(source.id);
   if(source.type==='path'&&preview){
    target.d=preview.d;changed=true;
    if(preview.amount>0){target.pathOffsetSourceD=preview.source;target.pathOffsetAmount=preview.direction==='in'?preview.amount:-preview.amount;target.pathOffsetJoin=preview.join;target.pathOffsetOpenSubpaths=preview.open;
     if(preview.direction==='in'){target.thinSourceD=preview.source;target.thinAmount=preview.amount;target.thinCornerJoin=preview.join;target.thinOpenSubpaths=preview.open;}
     else{delete target.thinSourceD;delete target.thinAmount;delete target.thinCornerJoin;delete target.thinOpenSubpaths;}
    }else{delete target.pathOffsetSourceD;delete target.pathOffsetAmount;delete target.pathOffsetJoin;delete target.pathOffsetOpenSubpaths;delete target.thinSourceD;delete target.thinAmount;delete target.thinCornerJoin;delete target.thinOpenSubpaths;}
   }
   if(source.type==='group')for(let i=0;i<(source.children||[]).length;i++)if(sync(source.children[i],target.children[i]))changed=true;
   if(changed&&source.typography){
    const node=getLayerNode(source.id);try{const b=node?.getBBox(),baseline=Number(source.typography.baselineY);if(b&&Number.isFinite(b.y)&&Number.isFinite(baseline)&&b.y<baseline){target.typography={...source.typography,baselineY:baseline,capY:b.y,capHeight:baseline-b.y,verticalBasis:'baseline',horizontalBasis:'visible'};delete target.typography.inkCentroid;delete target.typography.referenceGlyphBounds;delete target.typography.referenceGlyphIndex;delete target.typography.referenceGlyph;delete target.typography.advanceStartX;delete target.typography.advanceEndX;}}catch(_){/* Preserve source guide if bounds cannot be measured. */}
   }
   return changed;
  };
  for(let i=0;i<layers.length;i++)sync(layers[i],projectLayers[i]);
 }
 return JSON.stringify({format:'GlyphStudioBadgeProject',version:2,width:W,height:H,canvas:readBadgeCanvasSettings(),exportSettings:typeof readBcExportSettings==='function'?readBcExportSettings():null,selectedId:findLayer(selectedId)?selectedId:null,selectedIds:[...selectedIds].filter(id=>findLayer(id)),keyObjectId:findLayer(keyObjectId)?keyObjectId:null,layers:projectLayers},null,2);
}
$('bcSaveProject').addEventListener('click',()=>{try{const blob=new Blob([currentProjectJson()],{type:'application/json;charset=utf-8'});assertPortableProjectSize(blob,'Project export');download(blob,'badge-composition.json');status('Editable project saved as badge-composition.json.','ok');}catch(err){status('Project save failed: '+err.message,'error');}});
$('bcImportProject').addEventListener('click',()=>$('bcProjectFile').click());
$('bcProjectFile').addEventListener('change',async event=>{
 const file=event.target.files?.[0];if(!file)return;
 try{
  if(file.size>MAX_PORTABLE_PROJECT_BYTES)throw Error('Project file exceeds the 100 MB portable project limit.');
  const parsed=JSON.parse(await file.text());
  if(!parsed||parsed.format!=='GlyphStudioBadgeProject'||![1,2].includes(parsed.version))throw Error('This is not a supported Glyph Studio Badge Composer project.');
  const width=Number(parsed.width),height=Number(parsed.height);
  if(!Number.isFinite(width)||width<1||width>10000||!Number.isFinite(height)||height<1||height>5000)throw Error('Project artboard dimensions are outside the supported range.');
  const nextLayers=sanitizeProjectLayers(parsed.layers);
  snap();W=width;H=height;layers=nextLayers;fonts.clear();hbFonts.clear();pathEditId=null;drag=null;
  const validIds=new Set(allLayers(layers).map(l=>l.id));selectedIds=new Set((Array.isArray(parsed.selectedIds)?parsed.selectedIds:[]).filter(id=>validIds.has(id)));
  selectedId=validIds.has(parsed.selectedId)?parsed.selectedId:[...selectedIds][0]||layers[0]?.id||null;
  if(selectedId&&!selectedIds.has(selectedId))selectedIds.add(selectedId);
  keyObjectId=validIds.has(parsed.keyObjectId)?parsed.keyObjectId:null;
  applyBadgeCanvasSettings(parsed.canvas||{});if(parsed.exportSettings&&typeof applyBcExportSettings==='function')applyBcExportSettings(parsed.exportSettings);
  const fontRestore=await prepareVisibleOpticalFonts();if(fontRestore.warning)status(fontRestore.warning,'warn');
  render();if(autoFit)fitStage();else renderCanvas();updateHistory();status(`Opened ${file.name} · ${countLayers()} layers · ${W} × ${H} SVG units.`,'ok');
 }catch(err){status('Project could not be opened: '+(err?.message||String(err)),'error');}
 finally{event.target.value='';}
});
function exportSettingsManifest(settings,details={}){return JSON.stringify({application:'Glyph Studio Pro',version:'0.6.103',exportedAt:new Date().toISOString(),fileName:settings.fileName,canvas:{width:W,height:H},settings:{...settings},result:details},null,2);}
let bcExportBusy=false;
async function runBcExport(action){if(bcExportBusy)return;bcExportBusy=true;const buttons=['bcExportNowSvg','bcExportNowPng','bcExportNowZip','bcExportNowAll'].map(id=>$(id));buttons.forEach(b=>b.disabled=true);const report=$('bcExportStatus');report.className='bc-export-status';report.textContent='Preparing export…';try{
 const settings=readBcExportSettings();persistBcExportSettings();const result=await createConfiguredSvg(settings);const base=safeExportBaseName(settings.fileName||'badge-composition');
 if(action==='svg'){download(new Blob([result.svg],{type:'image/svg+xml;charset=utf-8'}),base+'.svg');report.textContent=`SVG downloaded${result.optimized?' · optimised':' · original markup'} · ${(new TextEncoder().encode(result.svg).length).toLocaleString()} bytes.`;report.classList.add('ok');status('SVG export completed.','ok');return;}
 if(action==='png'){const png=await rasterizeConfiguredSvg(result.svg,settings.pngScale);download(png.blob,base+'.png');report.textContent=`PNG downloaded · ${png.width.toLocaleString()} × ${png.height.toLocaleString()} px (${png.actualScale.toFixed(2)}×).`;report.classList.add('ok');status('PNG export completed.','ok');return;}
 if(!window.JSZip)throw Error('JSZip is unavailable; ZIP packaging cannot be created.');const zip=new JSZip();zip.file(base+'.svg',result.svg);
 const includeProject=action==='all'||settings.zipProject;const includePng=action==='all'||settings.zipPng;
 if(includeProject){const projectJson=currentProjectJson();assertPortableProjectSize(projectJson,'Editable project in ZIP');zip.file('project.json',projectJson);}
 zip.file('export-settings.json',exportSettingsManifest(settings,{optimized:result.optimized,action,includes:{project:includeProject,png:includePng}}));
 if(result.optimized&&settings.zipOriginal)zip.file(base+'-original.svg',result.original);
 let pngInfo=null;if(includePng){pngInfo=await rasterizeConfiguredSvg(result.svg,settings.pngScale);zip.file(base+'.png',pngInfo.blob);}
 if(action==='all')zip.file('README.txt',`Glyph Studio Pro export package\n\nFiles:\n- ${base}.svg: exported SVG using the selected text and optimisation settings\n${includePng?`- ${base}.png: PNG preview at ${pngInfo.width} × ${pngInfo.height} pixels\n`:''}${includeProject?'- project.json: editable Badge Composer project, including embedded assets and fonts\n':''}- export-settings.json: settings used for this export\n${result.optimized&&settings.zipOriginal?`- ${base}-original.svg: SVG before optimisation\n`:''}\nOpen project.json using Badge Composer > Open project to continue editing.\n`);
 report.textContent='Building ZIP archive…';const zipBlob=await zip.generateAsync({type:'blob'},meta=>{if(meta.percent!=null)report.textContent=`Building ZIP archive… ${Math.round(meta.percent)}%`;});download(zipBlob,action==='all'?base+'-export-all.zip':base+'.zip');const files=Object.keys(zip.files).filter(k=>!zip.files[k].dir);report.textContent=`${action==='all'?'Export All':'Project ZIP'} downloaded · ${files.length} files${pngInfo?` · PNG ${pngInfo.width} × ${pngInfo.height}`:''}${result.optimized?' · optimised SVG':''}.`;report.classList.add('ok');status(`${action==='all'?'Export All':'ZIP'} completed. ${files.length} files packaged.`,'ok');
 }catch(err){const detail=err?.message||String(err),hint=/svgo|unpkg|jsdelivr|optimizer/i.test(detail)?' Turn off optimisation and retry to export the original SVG.':'';report.textContent='Export failed: '+detail+hint;report.className='bc-export-status error';status('Export failed: '+detail+hint,'error');}finally{bcExportBusy=false;buttons.forEach(b=>b.disabled=false);}}
$('bcExportNowSvg').addEventListener('click',()=>runBcExport('svg'));
$('bcExportNowPng').addEventListener('click',()=>runBcExport('png'));
$('bcExportNowZip').addEventListener('click',()=>runBcExport('zip'));
$('bcExportNowAll').addEventListener('click',()=>runBcExport('all'));
$('bcLoadSvgJs').onclick=async()=>{try{if(!svgjs){if(!svgjsPromise){const pending=(async()=>{let last;for(const u of ['js/vendor/svg.esm.js','https://esm.sh/@svgdotjs/svg.js@3.2.8?bundle','https://cdn.jsdelivr.net/npm/@svgdotjs/svg.js@3.2.8/dist/svg.esm.js']){try{return await importWithTimeout(u,5500);}catch(e){last=e;}}throw last||Error('SVG.js unavailable');})();svgjsPromise=pending;}try{svgjs=await svgjsPromise;}catch(err){svgjsPromise=null;throw err;}}svgjs.SVG($('bcStage')).size(W,H).viewbox(0,0,W,H);$('bcEngineStatus').textContent='SVG.js 3.2.8 ready';status('SVG.js loaded. Native SVG remains the rendering fallback.','ok');}catch(e){$('bcEngineStatus').textContent='Native SVG';status('SVG.js CDN could not load; native SVG editing remains available. You can retry now. '+e.message,'error');}};
$('bcStage').addEventListener('dblclick',e=>{const g=e.target.closest('[data-layer-id]');if(!g)return;const l=findLayer(g.dataset.layerId);if(l?.type==='text'){select(l.id);const text=$('bcInspector').querySelector('textarea');text?.focus();}});
window.addEventListener('keydown',e=>{
 if(!composer.classList.contains('active'))return;
 const active=document.activeElement,tag=active?.tagName;
 if($('bcExportDialog')?.open||active?.closest?.('#bcExportDialog'))return;
 if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||active?.isContentEditable||active?.closest?.('[contenteditable="true"]'))return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&!e.ctrlKey&&!e.metaKey&&!window.__gspManualBaselinePick){
  if(active?.closest?.('#bcLayerList'))return;
  const roots=selectedRoots().filter(item=>!hasLockedAncestor(item));if(!roots.length)return;
  // Alt is the finest increment; Shift is the coarse increment. Keyboard nudges
  // intentionally bypass Snap to grid so exact positioning is always possible.
  const step=e.altKey?.1:e.shiftKey?10:.01;
  const dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0;
  const dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;
  e.preventDefault();if(!e.repeat)snap();
  let moved=0;for(const item of roots)if(moveLayerWorld(item,dx,dy))moved++;
  if(moved){renderCanvas();renderList();renderInspector();persistBadgeDraft();$('bcCursor').textContent=`Nudge · ${dx?`X ${dx>0?'+':''}${dx}`:''}${dx&&dy?' · ':''}${dy?`Y ${dy>0?'+':''}${dy}`:''} · ${moved} layer${moved===1?'':'s'}`;}
  return;
 }
 if(e.key==='Delete'||e.key==='Backspace'){if(selectedIds.size)deleteSelectedLayers();}
});
// SVGO is loaded only when explicitly requested from the optional optimised export action.

$('bcInspector').addEventListener('change',()=>{renderList();renderCanvas();});
// Dimension controls via keyboard shortcut: double-click the dimensions label.
$('bcCanvasW').onchange=()=>{const v=+$('bcCanvasW').value;if(!(v>0&&v<=10000)){status('Artboard width must be between 1 and 10000 SVG units.','error');$('bcCanvasW').value=W;return;}snap();W=v;render();if(autoFit)fitStage();};$('bcCanvasH').onchange=()=>{const v=+$('bcCanvasH').value;if(!(v>0&&v<=5000)){status('Artboard height must be between 1 and 5000 SVG units.','error');$('bcCanvasH').value=H;return;}snap();H=v;render();if(autoFit)fitStage();};
// Load the last draft from IndexedDB first. Older localStorage drafts are migrated.
const badgeComposerRoot=$('badgeComposerMode');badgeComposerRoot.style.pointerEvents='none';badgeComposerRoot.setAttribute('aria-busy','true');
(async()=>{let restoredDraft=false;try{const saved=await readStoredBadgeDraft();if(saved){const d=typeof saved==='string'?JSON.parse(saved):saved;if(d.format==='GlyphStudioBadgeDraft'&&[1,2,3,4].includes(d.version)&&Array.isArray(d.layers)&&Number(d.W)>=1&&Number(d.W)<=10000&&Number(d.H)>=1&&Number(d.H)<=5000){W=Number(d.W);H=Number(d.H);layers=sanitizeProjectLayers(d.layers);selectedId=findLayer(d.selectedId)?d.selectedId:layers[0]?.id||null;selectedIds=new Set((d.selectedIds||[selectedId]).filter(id=>findLayer(id)));if(!selectedIds.size&&selectedId)selectedIds.add(selectedId);if(!selectedIds.has(selectedId))selectedId=[...selectedIds].pop()||null;keyObjectId=findLayer(d.keyObjectId)?d.keyObjectId:null;applyBadgeCanvasSettings(d.canvas||{});if(d.exportSettings&&typeof applyBcExportSettings==='function')applyBcExportSettings(d.exportSettings);const fontRestore=await prepareVisibleOpticalFonts();if(fontRestore.warning)status(fontRestore.warning,'warn');render();if(autoFit)fitStage();else renderCanvas();restoredDraft=true;status('Recovered your last Badge Composer draft.','ok');if(typeof saved==='string'||d.version<4)persistBadgeDraft();}}}catch(err){console.warn('Badge draft recovery skipped:',err);status('Previous draft could not be recovered. The starter project is loaded; check your exported backup.','warn');}if(!restoredDraft){loadPreset('dolbyVision');clearHistory();}else{clearHistory();}})().finally(()=>{badgeComposerRoot.style.pointerEvents='';badgeComposerRoot.removeAttribute('aria-busy');});
// Lazy engine integrations: SVGO and HarfBuzz can be loaded for advanced workflows.
async function ensureSVGO(){if(svgo)return svgo;if(window.SVGO&&typeof window.SVGO.optimize==='function')return svgo=window.SVGO;if(!svgoPromise){const pending=(async()=>{let last;for(const u of ['js/vendor/svgo.browser.js','https://cdn.jsdelivr.net/npm/svgo@4.1.0/dist/svgo.browser.js','https://unpkg.com/svgo@4.1.0/dist/svgo.browser.js']){try{const m=await importWithTimeout(u,5500);if(typeof m.optimize!=='function')throw Error('SVGO API not found');return svgo=m;}catch(e){last=e;}}throw last||Error('SVGO unavailable');})();svgoPromise=pending;try{return await pending;}catch(err){if(svgoPromise===pending)svgoPromise=null;throw err;}}return svgoPromise;}

async function ensureHB(){if(hbModule)return hbModule;if(!hbPromise){const pending=(async()=>{let last;for(const u of ['js/vendor/harfbuzz/index.mjs','https://esm.sh/harfbuzzjs@1.6.4?bundle','https://cdn.jsdelivr.net/npm/harfbuzzjs@1.6.4/dist/index.mjs']){try{return hbModule=await importWithTimeout(u,5500);}catch(e){last=e;}}throw last||Error('HarfBuzz unavailable');})();hbPromise=pending;try{return await pending;}catch(err){if(hbPromise===pending)hbPromise=null;throw err;}}return hbPromise;}
// Expose explicit integrations in the console for QA and future extension without polluting the existing app scope.
window.GlyphBadgeComposer={
 // Engine 5.0 canvas bridge helpers
 getVisibleLayerTree:()=>clone(layers),
 getLiveLayer:id=>findLayer(id)||null,
 getSelectedLayerIds:()=>[...selectedIds].filter(id=>findLayer(id)),
 getLayerWorldMatrix:id=>{const m=getLayerModelMatrix(id);return m?{a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f}:null;},
 isKeyLayerOrDescendant:id=>{const key=findLayer(keyObjectId);return !!key&&(key.id===id||thicknessLayerContains(key,id));},
 refreshCanvas:()=>{render();persistBadgeDraft();},
 beginEdit:()=>{if(pathInsetPreviewState)resetPathInsetPreview(true);if(pathRoundPreviewState)clearPathRoundPreview(true);snap();return badgeInspectorHistorySnapshot();},
 rollbackEdit:before=>{restore(before,false);if(history.length)history.pop();persistBadgeDraft();},
 clearLayerThinning:id=>{const l=findLayer(id);if(l)clearStoredThinning(l);},
 isLayerUsable:id=>{const l=findLayer(id);return !!(l&&isLayerEffectivelyAvailable(l)&&!isEffectivelyLocked(l));},
 setStatus:(msg,kind)=>status(msg,kind||''),
 centerSelectedTypography,alignTextBaselines,startManualBaselinePick,updateBadgeTypographyPanel,centerArtwork,matchSelectedIconSizes,matchSelectedVisualThickness,matchSelectedVisualThicknessV2,matchSelectedVisualThicknessVector315,measureLayerVisualThickness:id=>{const l=findLayer(id);return l?measureLayerVisualThickness(l):Promise.reject(new Error('Layer not found.'));},measureLayerVisualThicknessV3:id=>{const l=findLayer(id);return l?measureLayerVisualThicknessV3(l):Promise.reject(new Error('Layer not found.'));},getIconSizeMatchBounds:id=>{const l=findLayer(id),b=l?getIconSizeMatchBounds(l):null;return b?{...b}:null;},setKeyObject:chooseKeyObject,getKeyObjectId:()=>keyObjectId,previewPathInset,applyPathOffset,resetPathInsetPreview,areTextLayersOneHorizontalRun,getPathInsetPreviewInfo:()=>({active:!!pathInsetPreviewState,rootId:pathInsetPreviewState?.rootId||null,rootIds:pathInsetPreviewState?.rootIds||[],amount:pathInsetPreviewState?.amount||0,direction:pathInsetPreviewState?.direction||pathThicknessDirection,join:pathInsetPreviewState?.join||pathInsetCornerJoin,pathCount:pathInsetPreviewState?.byId?.size||0,maxSafe:pathInsetPreviewState?.maxSafe??(pathThicknessDirection==='out'?pathExpansionSafeLimitState?.max:pathInsetSafeLimitState?.max)??null}),getPathInsetCornerJoin:()=>pathInsetCornerJoin,getPathOffsetCornerJoin:()=>pathInsetCornerJoin,getProject:()=>({width:W,height:H,layers:clone(layers)}),getProjectJson:currentProjectJson,getTemplateRecord:currentBadgeTemplateRecord,importTemplateRecord:applyBadgeTemplateRecord,getCanvasSettings:readBadgeCanvasSettings,getArtworkBounds:()=>{const b=getArtworkBounds();return b?{...b}:null;},getOpticalCenterDrop:async()=>{const state=await prepareVisibleOpticalFonts();if(state.loaded)render();const b=getArtworkBounds();return b?(await artworkOpticalDrop(b)).shift:0;},getLayerBounds:id=>{const l=findLayer(id);const b=l?getLayerWorldBounds(l):null;return b?{...b}:null;},getLayerCanvasOrigin:id=>{const l=findLayer(id);const p=l?getLayerCanvasOrigin(l):null;return p?{...p}:null;},moveLayerWorld:(id,dx,dy)=>{const l=findLayer(id);if(!l||l.locked||hasLockedAncestor(l))return false;snap();const ok=moveLayerWorld(l,Number(dx),Number(dy));if(ok){render();persistBadgeDraft();}return ok;},getTextInkBounds:id=>{const n=getLayerNode(id)?.querySelector('text');const b=n?getSvgTextInkBounds(n):null;return b?{...b}:null;},importSvgSources, getSvg:createSvgString,getExportSettings:readBcExportSettings,getSVGOConfig:svgoConfigForExport,createConfiguredSvg,loadPreset,fitArtworkToCanvas,applyBulkSelectionStyles,saveTemplate:saveBadgeTemplate,loadTemplate:loadBadgeTemplate,refreshTemplates:refreshBadgeTemplateList,ensureSVGjs:()=>$('bcLoadSvgJs').click(),ensureSVGO,ensureHarfBuzz:ensureHB,render};
})();


