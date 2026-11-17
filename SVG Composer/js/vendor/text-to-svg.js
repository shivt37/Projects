
/* Text-to-SVG feature module, inlined for the all-in-one edition. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  // Text-to-SVG and Badge Composer are isolated feature modules. Keep a timeout-aware
  // dynamic-import helper in this module instead of relying on a function declared
  // inside Badge Composer's separate IIFE. Dynamic import cannot be aborted, so the
  // timeout only releases the caller; the import promise remains safely observed.
  async function importWithTimeout(url, ms=6000) {
    const parsed = new URL(url, document.baseURI);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) module URLs are supported.');
    let timer;
    const task = import(parsed.href);
    return Promise.race([task, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Loading ' + parsed.hostname + ' timed out.')), ms);
    })]).finally(() => clearTimeout(timer));
  }
  const ids = ['text','fontFile','fontPick','fontName','fontInfo','fontBadge','fontSize','fontSizeVal','glyphSelect','glyphOffset','glyphOffsetVal','widthScale','widthVal','letterSpacing','spacingVal','weight','weightVal','autoSize','targetHeight','canvasW','padTop','padRight','padBottom','padLeft','padAll','resetGlyph','resetTypeface','resetFineTune','resetCanvas','resetAppearance','resetReference','resetComparison','hAlign','vAlign','optical','horizontalBasis','verticalBasis','referenceGlyph','referenceCharacter','baselineTarget','opticalFineTune','showAlignmentGuides','alignmentHint','fill','fillAlpha','fillAlphaVal','bg','bgAlpha','bgAlphaVal','transparent','referencePick','referenceFile','referenceName','referenceOpacity','referenceOpacityVal','showReference','removeReference','comparePick','compareFile','compareName','compareInfo','removeCompare','previewGrid','compareStage','comparePreview','compareArtboard','compareStageName','compareDimensions','preview','artboard','referenceLayer','canvasWrap','dimensions','primaryStageName','fontMeta','boundsMeta','outputMeta','status','source','sourcePanel','selectSource','download','copy','zip','checkerToggle','glyphOffsetY','glyphScaleX','glyphScaleY','glyphRotate','referenceX','referenceY','referenceScale','referenceRotate','referenceDifference','compareList','exportCompareSheet','measureWidth','measureHeight','measureAdvance','measureAscender','measureDescender','measureUpem','undoBtn','redoBtn','resetAll','presetSelect','presetName','savePreset','loadPreset','deletePreset','clearHistory','historyLabel','variationAxis','variationCount','variationStep','generateVariants','useHarfBuzz','detectAxes','hbStatus','axisControls','textScript','textDirection','glyphSearch','glyphMap','glyphCount','showPathPoints','showPathMetrics','pathInspector','optimizeLevel','pathPrecision','optimizeDownload','optimizeZip','compareOptimized','optimizationReport','optimizedPreview','originalSize','optimizedSize','originalOptPreview','optimizedOptPreview','optimizationHint','glyphMappingHint','textSvgMode','textSvgWhitespace','textSvgFormatReport','downloadFormattedSvg','copyFormattedSvg','hbRetry'];
  const E = Object.fromEntries(ids.map(id => [id,$(id)]));
  let font=null,fontName='Uploaded font',fontFileName='',fontVersion=0,comparisonFont=null,comparisonName='Comparison font';
  let currentSvg='',referenceUrl='',referenceFileName='',primaryFontBytes=null;
  let hAlign='middle',vAlign='middle',checkerOn=true,glyphOffsets=[],glyphTransforms=[],glyphText='',glyphClusters=[],glyphMappingSafe=false;
  let comparisonFonts=[],hbModule=null,hbFace=null,hbFont=null,hbEnabled=false,hbAxes=[],hbAxisValues={},bidiModule=null,bidiLoadPromise=null,historyStack=[],redoStack=[],historyBaseline=null,historyCommitted=false,lastState=null;
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const cleanNum = n => Number(Number(n).toFixed(3));
  // 0.6.26 fixes (A-001, A-003, A-004, A-006, A-008).
  const COMPLEX_SCRIPT_RE = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0900-\u097F\u0E00-\u0E7F]/;
  function textNeedsShaping(){const t=E.text.value.split(/\r?\n/).find(x=>x.trim())||'';return COMPLEX_SCRIPT_RE.test(t);}
  function clearArtworkState(){currentSvg='';optimizedSvgCache='';setButtons(false);E.generateVariants.disabled=true;E.exportCompareSheet.disabled=true;E.optimizeDownload.disabled=true;E.optimizeZip.disabled=true;E.compareOptimized.disabled=true;E.optimizedPreview.classList.add('hide');E.optimizationReport.textContent='Generate a valid SVG before using optimisation.';E.artboard.classList.add('empty');E.preview.replaceChildren();E.source.value='';E.dimensions.textContent='— × —';}
  async function copyTextToClipboardResilient(text,okMessage,fallbackMessage,updateSource){if(navigator.clipboard&&window.isSecureContext){try{await navigator.clipboard.writeText(text);setStatus(okMessage,'ok');return;}catch(_){}}const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.focus();ta.select();let ok=false;try{ok=document.execCommand('copy');}catch(_){ok=false;}ta.remove();if(ok){setStatus(okMessage,'ok');return;}if(updateSource)E.source.value=text;E.sourcePanel.open=true;E.source.focus();E.source.select();setStatus(fallbackMessage,'error');E.sourcePanel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});}
  const fmt = n => Number(n).toFixed(1).replace(/\.0$/,'');
  function colorWithAlpha(hex,alpha=1){const m=String(hex||'').match(/^#([0-9a-f]{6})$/i);if(!m)return hex;const n=parseInt(m[1],16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;return `rgba(${r},${g},${b},${Math.max(0,Math.min(1,Number(alpha)||0))})`;}
  // Visible-ink metrics shared with Badge Composer. Unlike SVG getBBox(),
  // Canvas actualBoundingBox* measures the rendered glyph outlines around the
  // selected anchor/baseline, including descenders such as y, g, p, q and j.
  let inkMetricsCanvas=null;
  function measureCanvasInk(text,style={},anchor='start',baseline='alphabetic'){
    const value=String(text??'');if(!value||!value.trim())return null;
    try{
      if(!inkMetricsCanvas)inkMetricsCanvas=document.createElement('canvas');
      const ctx=inkMetricsCanvas.getContext('2d');if(!ctx)return null;
      const fontSize=parseFloat(style.fontSize)||16;
      const family=style.fontFamily||'sans-serif';
      const fontStyle=style.fontStyle||'normal',fontVariant=style.fontVariant||'normal',fontWeight=style.fontWeight||'400';
      const fontString=style.font||`${fontStyle} ${fontVariant} ${fontWeight} ${fontSize}px ${family}`;
      ctx.font=fontString;
      ctx.textAlign=anchor==='middle'?'center':(anchor==='end'?'end':'start');
      const dir=String(style.direction||'ltr').toLowerCase();if('direction'in ctx)ctx.direction=dir;
      const base=String(baseline||'alphabetic').toLowerCase();
      const baselineMap={auto:'alphabetic',alphabetic:'alphabetic',central:'middle',middle:'middle',hanging:'hanging','text-before-edge':'top',beforeedge:'top','text-after-edge':'bottom',afteredge:'bottom',ideographic:'ideographic',mathematical:'alphabetic'};
      ctx.textBaseline=baselineMap[base]||'alphabetic';
      if('fontKerning'in ctx&&style.fontKerning)ctx.fontKerning=style.fontKerning;
      if(style.fontStretch){
        // Canvas accepts the nine CSS font-stretch keywords, not computed CSS
        // percentages (for example, Chromium reports normal as 100%). Map only
        // exact keyword-equivalent percentages. Unsupported values fall back to
        // native SVG bounds rather than measuring with a mismatched font face.
        const stretchRaw=String(style.fontStretch).trim().toLowerCase();
        const stretchKeywords=new Set(['ultra-condensed','extra-condensed','condensed','semi-condensed','normal','semi-expanded','expanded','extra-expanded','ultra-expanded']);
        let stretch=stretchRaw;
        if(!stretchKeywords.has(stretch)){
          const match=stretchRaw.match(/^([0-9]+(?:\.[0-9]+)?)%$/);
          if(!match)return null;
          const percent=Number(match[1]);
          const standard=[[50,'ultra-condensed'],[62.5,'extra-condensed'],[75,'condensed'],[87.5,'semi-condensed'],[100,'normal'],[112.5,'semi-expanded'],[125,'expanded'],[150,'extra-expanded'],[200,'ultra-expanded']];
          const exact=standard.find(([value])=>Math.abs(value-percent)<0.001);
          if(!exact)return null;
          stretch=exact[1];
        }
        if('fontStretch'in ctx){try{ctx.fontStretch=stretch;}catch(_){return null;}}
        else if(stretch!=='normal')return null;
      }
      if('fontVariantCaps'in ctx&&style.fontVariantCaps)ctx.fontVariantCaps=style.fontVariantCaps;
      const letterSpacing=String(style.letterSpacing||'0px');
      const wordSpacing=String(style.wordSpacing||'0px');
      const supportsLetterSpacing='letterSpacing'in ctx,supportsWordSpacing='wordSpacing'in ctx;
      if(supportsLetterSpacing)ctx.letterSpacing=letterSpacing;
      if(supportsWordSpacing)ctx.wordSpacing=wordSpacing;
      const m=ctx.measureText(value);
      const keys=['actualBoundingBoxLeft','actualBoundingBoxRight','actualBoundingBoxAscent','actualBoundingBoxDescent'];
      if(keys.some(k=>!Number.isFinite(m[k])))return null;
      let left=-m.actualBoundingBoxLeft,right=m.actualBoundingBoxRight;
      // Older Canvas implementations do not expose letterSpacing/wordSpacing.
      // Expand the horizontal visible bounds conservatively without changing ink height.
      if(!supportsLetterSpacing){const n=Math.max(0,Array.from(value).length-1),extra=(parseFloat(letterSpacing)||0)*n;
        if(ctx.textAlign==='center'){left-=extra/2;right+=extra/2;}
        else if((ctx.textAlign==='end'&&dir!=='rtl')||(ctx.textAlign==='start'&&dir==='rtl'))left-=extra;
        else right+=extra;
      }
      if(!supportsWordSpacing){const count=(value.match(/\s+/g)||[]).length,extra=(parseFloat(wordSpacing)||0)*count;
        if(ctx.textAlign==='center'){left-=extra/2;right+=extra/2;}
        else if((ctx.textAlign==='end'&&dir!=='rtl')||(ctx.textAlign==='start'&&dir==='rtl'))left-=extra;
        else right+=extra;
      }
      const spacingExtra=(!supportsLetterSpacing?(parseFloat(letterSpacing)||0)*Math.max(0,Array.from(value).length-1):0)+(!supportsWordSpacing?(parseFloat(wordSpacing)||0)*(value.match(/\s+/g)||[]).length:0);
      return{left,top:-m.actualBoundingBoxAscent,right,bottom:m.actualBoundingBoxDescent,width:m.width+spacingExtra,ascent:m.actualBoundingBoxAscent,descent:m.actualBoundingBoxDescent,fontAscent:Number(m.fontBoundingBoxAscent)||m.actualBoundingBoxAscent,fontDescent:Number(m.fontBoundingBoxDescent)||m.actualBoundingBoxDescent};
    }catch(_){return null;}
  }
  window.GlyphStudioInkMetrics=Object.freeze({measure:measureCanvasInk});
  function setStatus(message,kind=''){E.status.textContent=message;E.status.className='status '+kind;}
  function safeName(s){return String(s).trim().replace(/[^a-z0-9_-]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,60)||'text';}
  function setButtons(enabled){E.download.disabled=E.copy.disabled=E.selectSource.disabled=E.zip.disabled=!enabled;syncTextExportButtons(enabled);}
  function getSettings(){
    const w=Math.floor(Number(E.canvasW.value));
    const h=Math.floor(Number(E.targetHeight.value));
    const pads={top:Number(E.padTop.value),right:Number(E.padRight.value),bottom:Number(E.padBottom.value),left:Number(E.padLeft.value)};
    for(const [k,v] of Object.entries(pads)) if(!Number.isFinite(v)||v<0||v>1000) throw Error('Canvas margins must be between 0 and 1,000 px.');
    if(!Number.isFinite(w)||w<1||w>10000) throw Error('Canvas width must be between 1 and 10,000 px.');
    if(!Number.isFinite(h)||h<1||h>5000) throw Error('Canvas height must be between 1 and 5,000 px.');
    return {w,h,pads,size:Number(E.fontSize.value),spacing:Number(E.letterSpacing.value),weight:Number(E.weight.value),widthScale:Number(E.widthScale.value)/100,glyphOffsets:glyphOffsets.slice(),glyphTransforms:glyphTransforms.map(t=>({...t})),autoSize:E.autoSize.checked,fill:E.fill.value,fillAlpha:Math.max(0,Math.min(255,Number(E.fillAlpha.value)))/255,bg:E.bg.value,bgAlpha:Math.max(0,Math.min(255,Number(E.bgAlpha.value)))/255,transparent:E.transparent.checked,optical:E.optical.checked,hAlign,vAlign,horizontalBasis:E.horizontalBasis.value||'visible',verticalBasis:E.verticalBasis.value||'baseline',referenceGlyphIndex:Number(E.referenceGlyph.value)||0,referenceCharacter:E.referenceCharacter.value.trim(),baselineTarget:E.baselineTarget.value.trim()===''?null:Number(E.baselineTarget.value),opticalFineTune:Number(E.opticalFineTune.value)||0,showGuides:E.showAlignmentGuides.checked};
  }
  function transformGlyphCommands(commands, t){
    const sx=(t.scaleX||100)/100,sy=(t.scaleY||100)/100,angle=(t.rotate||0)*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle);
    const xs=[],ys=[];for(const c of commands){for(const k of ['x','x1','x2'])if(Number.isFinite(c[k]))xs.push(c[k]);for(const k of ['y','y1','y2'])if(Number.isFinite(c[k]))ys.push(c[k]);}
    const cx=xs.length?(Math.min(...xs)+Math.max(...xs))/2:0,cy=ys.length?(Math.min(...ys)+Math.max(...ys))/2:0;
    return commands.map(c=>{const out={...c};for(const [xk,yk] of [['x','y'],['x1','y1'],['x2','y2']]){if(Number.isFinite(c[xk])&&Number.isFinite(c[yk])){const x=(c[xk]-cx)*sx,y=(c[yk]-cy)*sy;out[xk]=cx+x*co-y*si+(t.x||0);out[yk]=cy+x*si+y*co+(t.y||0);}}return out;});
  }
  function fontVerticalMetrics(fontObj,fontSize){
    const upem=Math.max(1,Number(fontObj?.unitsPerEm)||1000),os2=fontObj?.tables?.os2||{};
    const glyphMetric=(ch)=>{try{const b=fontObj.charToGlyph(ch)?.getBoundingBox?.();return Math.max(0,Number(b?.y2)||0);}catch(_){return 0;}};
    const os2Cap=Number(os2.sCapHeight),os2X=Number(os2.sxHeight);
    const capFallback=glyphMetric('H')||glyphMetric('I'),xFallback=glyphMetric('x');
    const capUnits=Math.max(0,os2Cap||capFallback),xUnits=Math.max(0,os2X||xFallback);
    const ascUnits=Math.max(capUnits,Number(os2.sTypoAscender)||Number(fontObj?.ascender)||capUnits);
    const descUnits=Math.abs(Number(os2.sTypoDescender)||Number(fontObj?.descender)||0);
    const scale=Number(fontSize)/upem;
    return {unitsPerEm:upem,capHeight:capUnits*scale,xHeight:xUnits*scale,ascender:ascUnits*scale,descender:descUnits*scale,capHeightSource:os2Cap?'OS/2 sCapHeight':'H/I outline fallback',xHeightSource:os2X?'OS/2 sxHeight':'x outline fallback',baselineModel:'alphabetic'};
  }
  function measurePathInkCentroid(pathData,bounds,widthScale=1,strokeWidth=0){
    try{
      if(typeof Path2D!=='function'||typeof document.createElement('canvas').getContext!=='function')return null;
      const sw=Math.max(0,Number(strokeWidth)||0),pad=4,artW=(bounds.x2-bounds.x1)*widthScale+sw*widthScale,artH=(bounds.y2-bounds.y1)+sw;
      if(!(artW>0&&artH>0))return null;
      const ratio=Math.min(12,Math.sqrt(900000/Math.max(1,artW*artH))),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.ceil(artW*ratio+pad*2));canvas.height=Math.max(1,Math.ceil(artH*ratio+pad*2));
      const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return null;
      const path=new Path2D(pathData);ctx.setTransform(ratio*widthScale,0,0,ratio,pad-bounds.x1*widthScale*ratio,pad-bounds.y1*ratio);ctx.fillStyle='#000';ctx.fill(path);
      if(sw>0){ctx.strokeStyle='#000';ctx.lineWidth=sw;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke(path);}
      const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let total=0,sumX=0,sumY=0;
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const a=data[(y*canvas.width+x)*4+3]/255;if(a>0){total+=a;sumX+=(x+.5)*a;sumY+=(y+.5)*a;}}
      if(!total)return null;
      return {x:(sumX/total-pad)/ratio+bounds.x1*widthScale,y:(sumY/total-pad)/ratio+bounds.y1,weight:total,method:'alpha-mask'};
    }catch(_){return null;}
  }
  function shouldAddTrackingAfterGlyph(text,fontObj,glyphs,index,mapping){
    if(index>=glyphs.length-1)return false;
    // OpenType.js exposes cmap glyphs rather than HarfBuzz clusters. When each
    // grapheme maps one-to-one, insert tracking only at those grapheme boundaries.
    if(mapping?.safe&&mapping.clusters?.length===glyphs.length)return true;
    // Fallback for decomposed characters: do not insert a gap before a combining mark.
    const clusters=getGraphemeClusters(text);
    if(clusters.length===glyphs.length)return true;
    const next=clusters[index+1]||'';
    try{if(/^\p{M}/u.test(next))return false;}catch(_){}
    return true;
  }
  function makePath(text,s,fontObj){
    const glyphs=fontObj.stringToGlyphs(text);
    if(!glyphs.length) throw Error('This text produced no visible glyphs.');
    const mapping=inspectGlyphMapping(text,fontObj);let estimatedAdvance=0,estimatedTracking=0;
    for(let gi=0;gi<glyphs.length;gi++){estimatedAdvance+=Math.abs((glyphs[gi].advanceWidth||0)*s.size/fontObj.unitsPerEm);if(gi<glyphs.length-1){const kern=fontObj.getKerningValue?fontObj.getKerningValue(glyphs[gi],glyphs[gi+1]):0;estimatedAdvance+=Math.abs(kern*s.size/fontObj.unitsPerEm);if(shouldAddTrackingAfterGlyph(text,fontObj,glyphs,gi,mapping))estimatedTracking+=Math.abs(s.spacing);}}
    const estimatedWidth=estimatedAdvance+estimatedTracking+Math.max(0,s.pads.left+s.pads.right)+Math.abs(s.weight*s.widthScale);
    if(s.autoSize&&estimatedWidth>5000)throw Error('This line is about '+Math.round(estimatedWidth)+'px wide after kerning, tracking, stroke and padding. Split it into several lines, or switch off auto width to continue.');
    const combined=new opentype.Path(),glyphBounds=[];
    let x=0;
    const useOffsets=mapping.safe;
    for(let i=0;i<glyphs.length;i++){
      const glyph=glyphs[i],t=useOffsets?(s.glyphTransforms[i]||{}):{},gp=glyph.getPath(x,0,s.size);
      const transformed=transformGlyphCommands(gp.commands,{x:Number(t.x)||0,y:Number(t.y)||0,scaleX:Number(t.scaleX)||100,scaleY:Number(t.scaleY)||100,rotate:Number(t.rotate)||0});
      combined.commands.push(...transformed);
      const single=new opentype.Path();single.commands=transformed;
      const gb=single.getBoundingBox();
      glyphBounds.push({index:i,x1:gb.x1,y1:gb.y1,x2:gb.x2,y2:gb.y2,cluster:mapping.clusters?.[i]||''});
      x+=glyph.advanceWidth*s.size/fontObj.unitsPerEm;
      if(i<glyphs.length-1){
        const kern=fontObj.getKerningValue?fontObj.getKerningValue(glyph,glyphs[i+1]):0;
        x+=kern*s.size/fontObj.unitsPerEm;
        if(shouldAddTrackingAfterGlyph(text,fontObj,glyphs,i,mapping))x+=s.spacing;
      }
    }
    const bounds=combined.getBoundingBox();
    if(![bounds.x1,bounds.y1,bounds.x2,bounds.y2].every(Number.isFinite)) throw Error('Could not calculate glyph bounds.');
    if(!(bounds.x2>bounds.x1)||!(bounds.y2>bounds.y1)) throw Error('The selected text has no measurable visible artwork.');
    const finalVisibleHeight=(bounds.y2-bounds.y1)+Math.abs(s.weight)+Math.max(0,s.pads.top+s.pads.bottom);
    if(s.autoSize&&finalVisibleHeight>5000)throw Error('Final visible glyph bounds plus stroke and vertical padding are about '+Math.ceil(finalVisibleHeight)+'px tall. Reduce glyph scale or padding, or use fixed-width mode.');
    const metrics=fontVerticalMetrics(fontObj,s.size),totalAdvance=x*s.widthScale;
    const ink=measurePathInkCentroid(combined.toPathData(6),bounds,s.widthScale,s.weight);
    const safePads=s.pads,halfX=s.weight*s.widthScale/2,halfY=s.weight/2,innerW=s.w-safePads.left-safePads.right,innerH=s.h-safePads.top-safePads.bottom;
    const leftVisible=bounds.x1*s.widthScale-halfX,rightVisible=bounds.x2*s.widthScale+halfX,centerVisible=(leftVisible+rightVisible)/2;
    const requestedReference=String(s.referenceCharacter||'').trim();
    const requestedIndex=requestedReference?glyphBounds.findIndex(g=>String(g.cluster||'').normalize('NFC')===requestedReference.normalize('NFC')):Math.max(0,Math.min(glyphBounds.length-1,Number(s.referenceGlyphIndex)||0));
    const refIndex=requestedIndex>=0?requestedIndex:-1,ref=refIndex>=0?(glyphBounds[refIndex]||null):null;
    const referenceSafe=!!(mapping.safe&&ref&&s.horizontalBasis==='reference'&&!s.autoSize);
    let horizontalBasis=s.horizontalBasis||'visible';if(horizontalBasis==='reference'&&!referenceSafe)horizontalBasis='visible';
    let dx=0;
    if(s.autoSize){
      const artW=(rightVisible-leftVisible),w=Math.max(1,Math.ceil(artW+safePads.left+safePads.right));if(w>5000)throw Error('Final visible glyph bounds plus padding are about '+w+'px wide. Split the text or use fixed-width mode.');
      dx=safePads.left-leftVisible;
      // Auto-width defines its own width; align to the visible left edge so long and short labels retain their font size.
      return buildPathResult({text,s,fontObj,combined,bounds,glyphBounds,metrics,ink,advance:x,dx,dy:null,w,h:s.h,autoWidth:true,horizontalBasis:'visible',referenceGlyph:null,referenceBounds:null});
    }
    const centerX=safePads.left+innerW/2;
    let x1=leftVisible,x2=rightVisible,anchorX=centerVisible;
    if(horizontalBasis==='advance'){x1=0;x2=totalAdvance;anchorX=(x1+x2)/2;}
    else if(horizontalBasis==='reference'&&referenceSafe){x1=ref.x1*s.widthScale-halfX;x2=ref.x2*s.widthScale+halfX;anchorX=(x1+x2)/2;}
    if(s.hAlign==='start')dx=safePads.left-x1;
    else if(s.hAlign==='end')dx=s.w-safePads.right-x2;
    else dx=centerX-anchorX;

    const basis=s.verticalBasis||'baseline';
    const verticalAnchor=basis==='baseline'?0:basis==='cap-center'?-metrics.capHeight/2:basis==='x-center'?-metrics.xHeight/2:basis==='ink'?(ink?.y??(bounds.y1+bounds.y2)/2):(bounds.y1+bounds.y2)/2;
    let targetY;
    if(basis==='baseline'){
      if(Number.isFinite(s.baselineTarget))targetY=s.baselineTarget;
      else if(s.vAlign==='start')targetY=safePads.top+metrics.ascender+halfY;
      else if(s.vAlign==='end')targetY=s.h-safePads.bottom-metrics.descender-halfY;
      else targetY=safePads.top+innerH/2+metrics.capHeight/2;
    }else if(basis==='cap-center'||basis==='x-center'){
      const height=basis==='cap-center'?metrics.capHeight:metrics.xHeight;
      targetY=s.vAlign==='start'?safePads.top+height/2:s.vAlign==='end'?s.h-safePads.bottom-height/2:safePads.top+innerH/2;
    }else if(basis==='ink'&&ink){
      targetY=s.vAlign==='start'?safePads.top+(verticalAnchor-bounds.y1+halfY):s.vAlign==='end'?s.h-safePads.bottom-(bounds.y2-verticalAnchor+halfY):safePads.top+innerH/2;
    }else{
      const y1=bounds.y1-halfY,y2=bounds.y2+halfY;
      targetY=s.vAlign==='start'?safePads.top+(verticalAnchor-y1):s.vAlign==='end'?s.h-safePads.bottom-(y2-verticalAnchor):safePads.top+innerH/2;
    }
    const dy=targetY-verticalAnchor+(Number(s.opticalFineTune)||0);
    const transformedBounds={x1:dx+leftVisible,x2:dx+rightVisible,y1:dy+bounds.y1-halfY,y2:dy+bounds.y2+halfY};
    const clearances={left:transformedBounds.x1,right:s.w-transformedBounds.x2,top:transformedBounds.y1,bottom:s.h-transformedBounds.y2};
    const outOfCanvas=clearances.left<-.01||clearances.right<-.01||clearances.top<-.01||clearances.bottom<-.01;
    const referenceBounds=referenceSafe?{x1:dx+ref.x1*s.widthScale,x2:dx+ref.x2*s.widthScale,y1:dy+ref.y1,y2:dy+ref.y2}:null;
    const d=combined.toPathData(6),w=s.w,h=s.h;
    const metadata=makeTypographyMetadata({text,s,fontObj,metrics,dx,dy,advance:x,referenceGlyph:referenceSafe?ref.cluster:null,referenceGlyphIndex:referenceSafe?refIndex:null,referenceBounds,ink,horizontalBasis,verticalBasis:basis});
    return {d,bounds,dx,dy,advance:x,scaledWidth:(bounds.x2-bounds.x1)*s.widthScale,scaledHeight:bounds.y2-bounds.y1,font:fontObj,glyphBounds,metrics,ink,referenceBounds,referenceGlyph:referenceSafe?ref.cluster:null,referenceSafe,horizontalBasis,verticalBasis:basis,w,h,clearances,outOfCanvas,typography:metadata};
  }
  function makeTypographyMetadata({text,s,fontObj,metrics,dx,dy,advance,referenceGlyph,referenceGlyphIndex,referenceBounds,ink,horizontalBasis,verticalBasis}){
    return {version:2,engine:hbEnabled?'harfbuzz':'opentype',text:String(text).slice(0,4000),fontFamily:String(fontName||'Uploaded font').slice(0,256),fontFile:String(fontFileName||'').slice(0,256),fontSize:Number(s.size)||0,unitsPerEm:metrics.unitsPerEm,ascender:metrics.ascender,descender:metrics.descender,capHeight:metrics.capHeight,xHeight:metrics.xHeight,capHeightSource:metrics.capHeightSource||'outline-derived',xHeightSource:metrics.xHeightSource||'outline-derived',baselineModel:'alphabetic',opticalFineTune:Number(s.opticalFineTune)||0,baselineX:dx,baselineY:dy,capY:dy-metrics.capHeight,xHeightY:dy-metrics.xHeight,advanceStartX:dx,advanceEndX:dx+advance*s.widthScale,horizontalBasis,verticalBasis,hAlign:s.hAlign,vAlign:s.vAlign,referenceGlyph,referenceGlyphIndex,referenceGlyphBounds:referenceBounds,inkCentroid:ink?{x:dx+ink.x,y:dy+ink.y}:null};
  }
  function buildPathResult({text,s,fontObj,combined,bounds,glyphBounds,metrics,ink,advance,dx,dy,w,h,autoWidth,horizontalBasis,referenceGlyph,referenceBounds}){
    const innerH=h-s.pads.top-s.pads.bottom,halfY=s.weight/2;
    const basis=s.verticalBasis||'baseline';
    const anchor=basis==='baseline'?0:basis==='cap-center'?-metrics.capHeight/2:basis==='x-center'?-metrics.xHeight/2:basis==='ink'?(ink?.y??(bounds.y1+bounds.y2)/2):(bounds.y1+bounds.y2)/2;
    let target=basis==='baseline'?(Number.isFinite(s.baselineTarget)?s.baselineTarget:s.pads.top+innerH/2+metrics.capHeight/2):basis==='cap-center'?s.pads.top+innerH/2:basis==='x-center'?s.pads.top+innerH/2:basis==='ink'&&ink? s.pads.top+innerH/2:s.pads.top+innerH/2;
    if(basis==='baseline'&&!Number.isFinite(s.baselineTarget)&&s.vAlign==='start')target=s.pads.top+metrics.ascender+halfY;
    else if(basis==='baseline'&&!Number.isFinite(s.baselineTarget)&&s.vAlign==='end')target=h-s.pads.bottom-metrics.descender-halfY;
    else if(basis!=='baseline'&&s.vAlign==='start')target=s.pads.top+(basis==='cap-center'?metrics.capHeight/2:basis==='x-center'?metrics.xHeight/2:anchor-bounds.y1+halfY);
    else if(basis!=='baseline'&&s.vAlign==='end')target=h-s.pads.bottom-(basis==='cap-center'?metrics.capHeight/2:basis==='x-center'?metrics.xHeight/2:bounds.y2-anchor+halfY);
    dy=target-anchor+(Number(s.opticalFineTune)||0);
    const transformed={x1:dx+bounds.x1*s.widthScale-halfY*s.widthScale,x2:dx+bounds.x2*s.widthScale+halfY*s.widthScale,y1:dy+bounds.y1-halfY,y2:dy+bounds.y2+halfY};
    const clearances={left:transformed.x1,right:w-transformed.x2,top:transformed.y1,bottom:h-transformed.y2};
    const outOfCanvas=clearances.left<-.01||clearances.right<-.01||clearances.top<-.01||clearances.bottom<-.01;
    const metadata=makeTypographyMetadata({text,s,fontObj,metrics,dx,dy,advance,referenceGlyph,referenceGlyphIndex:null,referenceBounds,ink,horizontalBasis,verticalBasis:basis});
    const r={d:combined.toPathData(6),bounds,dx,dy,advance,scaledWidth:(bounds.x2-bounds.x1)*s.widthScale,scaledHeight:bounds.y2-bounds.y1,font:fontObj,glyphBounds,metrics,ink,referenceBounds,referenceGlyph,horizontalBasis,verticalBasis:basis,w,h,clearances,outOfCanvas,typography:metadata};
    return r;
  }
  function clampVerticalPlacement(bounds,dy,halfStroke,canvasHeight,label='Text'){
    const top=bounds.y1+dy-halfStroke,bottom=bounds.y2+dy+halfStroke;
    const height=bottom-top;
    if(!(height>0)||height>canvasHeight+1e-6){
      throw Error(`${label} is taller than the canvas at the selected font size. Increase Canvas height or reduce Font size; Auto width keeps the font size unchanged.`);
    }
    let next=dy;
    if(top<0)next-=top;
    if(bottom>canvasHeight)next-=bottom-canvasHeight;
    return next;
  }
  function buildSvg(text,s,fontObj){
    const r=makePath(text,s,fontObj);
    const w=r.w||s.w,h=r.h||s.h;
    const transform=`translate(${cleanNum(r.dx)} ${cleanNum(r.dy)}) scale(${cleanNum(s.widthScale)} 1)`;
    const bg=s.transparent?'':`<rect width="${w}" height="${h}" fill="${s.bg}" fill-opacity="${cleanNum(s.bgAlpha??1)}"/>`;
    const alpha=cleanNum(Math.max(0,Math.min(1,Number(s.fillAlpha??1))));
    const strokeAttrs=s.weight>0?` stroke="${s.fill}" stroke-opacity="${alpha}" stroke-width="${cleanNum(s.weight)}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke fill"`:'';
    const path=`<path d="${r.d}" fill="${s.fill}" fill-opacity="${alpha}"${strokeAttrs}/>`;
    const meta=esc(JSON.stringify(r.typography)).replace(/&apos;/g,'&apos;');
    const metadata=`<metadata id="glyph-studio-typography" data-gsp-kind="typography">${meta}</metadata>`;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${metadata}
${bg?bg+'\n':''}<g transform="${transform}">${path}</g>
</svg>`;
    r.transform=transform;r.scale=1;r.artworkWidth=r.scaledWidth+s.weight*s.widthScale;r.artworkHeight=r.scaledHeight+s.weight;r.fontSizePreserved=true;r.w=w;r.h=h;r.autoWidth=!!s.autoSize;
    r.svg=svg;
    return r;
  }
  function addAlignmentGuides(svgElement,result,s){
    if(!s.showGuides)return;
    const ns='http://www.w3.org/2000/svg',g=document.createElementNS(ns,'g');g.setAttribute('data-preview-guides','1');g.setAttribute('pointer-events','none');g.setAttribute('opacity','.95');
    const line=(x1,y1,x2,y2,color,dash='4 3')=>{const el=document.createElementNS(ns,'line');Object.entries({x1,y1,x2,y2,stroke:color,'stroke-width':.18,'stroke-dasharray':dash,'vector-effect':'non-scaling-stroke'}).forEach(([k,v])=>el.setAttribute(k,String(v)));g.appendChild(el);};
    const label=(x,y,t,color)=>{const el=document.createElementNS(ns,'text');el.setAttribute('x',String(x));el.setAttribute('y',String(y));el.setAttribute('font-size',String(Math.max(1.2,Math.min(3,result.h*.075))));el.setAttribute('font-family','Arial,sans-serif');el.setAttribute('font-weight','700');el.setAttribute('fill',color);el.setAttribute('stroke','#fff');el.setAttribute('stroke-width','.18');el.setAttribute('paint-order','stroke');el.textContent=t;g.appendChild(el);};
    const cx=result.w/2,cy=result.h/2,ty=result.dy,capY=result.typography?.capY,xY=result.typography?.xHeightY;
    line(cx,0,cx,result.h,'#2489dc','3 2');label(cx+.6,2.7,'CENTER X','#2489dc');
    line(0,cy,result.w,cy,'#30a46c','3 2');label(1,cy-1,'CENTER Y','#30a46c');
    if(Number.isFinite(ty)){line(0,ty,result.w,ty,'#e09a35','5 2');label(1,Math.max(2,ty-1),'BASELINE','#e09a35');}
    if(Number.isFinite(capY)){line(0,capY,result.w,capY,'#a47be2','3 2');label(1,Math.max(2,capY-1),'CAP HEIGHT','#a47be2');}
    if(Number.isFinite(xY)){line(0,xY,result.w,xY,'#44b7ae','2 2');label(1,Math.max(2,xY-1),'X-HEIGHT','#44b7ae');}
    if(result.referenceBounds){const b=result.referenceBounds,cx=(b.x1+b.x2)/2;line(cx,0,cx,result.h,'#f4c15d','2 2');const rect=document.createElementNS(ns,'rect');Object.entries({x:b.x1,y:b.y1,width:b.x2-b.x1,height:b.y2-b.y1,fill:'none',stroke:'#f4c15d','stroke-width':.25,'stroke-dasharray':'1.5 1','vector-effect':'non-scaling-stroke'}).forEach(([k,v])=>rect.setAttribute(k,String(v)));g.appendChild(rect);label(cx+.5,result.h-1,'REF','#f4c15d');}
    const ink=result.typography?.inkCentroid;if(ink&&Number.isFinite(ink.x)&&Number.isFinite(ink.y)){const dot=document.createElementNS(ns,'circle');Object.entries({cx:ink.x,cy:ink.y,r:.42,fill:'#ef6aa8',stroke:'#fff','stroke-width':.22,'vector-effect':'non-scaling-stroke','data-ink-centroid':'1'}).forEach(([k,v])=>dot.setAttribute(k,String(v)));g.appendChild(dot);}
    svgElement.appendChild(g);
  }
  function drawSvg(svgElement,result,s){
    svgElement.setAttribute('viewBox',`0 0 ${result.w} ${result.h}`);
    svgElement.setAttribute('width',result.w);svgElement.setAttribute('height',result.h);
    const alpha=cleanNum(Math.max(0,Math.min(1,Number(s.fillAlpha??1))));
    const stroke=s.weight>0?` stroke="${s.fill}" stroke-opacity="${alpha}" stroke-width="${cleanNum(s.weight)}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke fill"`:'';
    svgElement.innerHTML=`${s.transparent?'':`<rect width="${result.w}" height="${result.h}" fill="${s.bg}" fill-opacity="${cleanNum(s.bgAlpha??1)}"/>`}<g transform="${result.transform}"><path d="${result.d}" fill="${s.fill}" fill-opacity="${alpha}"${stroke}/></g>`;
    addAlignmentGuides(svgElement,result,s);
  }
  function setArtboardRatio(artboard,result){artboard.style.aspectRatio=`${result.w}/${result.h}`;artboard.style.minHeight='0';}
  function updateLabels(s,r){
    E.dimensions.textContent=`${r.w} × ${r.h} px`;
    E.primaryStageName.textContent=`Primary · ${fontName}`;
    E.fontMeta.innerHTML=`Font <strong>${esc(fontName)}</strong>`;
    E.boundsMeta.innerHTML=`Artwork <strong>${fmt(r.artworkWidth)} × ${fmt(r.artworkHeight)} px</strong>`;
    E.measureWidth.textContent=fmt(r.artworkWidth)+' px';E.measureHeight.textContent=fmt(r.artworkHeight)+' px';E.measureAdvance.textContent=fmt(r.advance*s.widthScale*(r.scale||1))+' px';E.measureAscender.textContent=fmt((font?.ascender||0)*s.size/(font?.unitsPerEm||1)*(r.scale||1))+' px';E.measureDescender.textContent=fmt((font?.descender||0)*s.size/(font?.unitsPerEm||1)*(r.scale||1))+' px';E.measureUpem.textContent=String(font?.unitsPerEm||'—');if(r.clearances){E.outputMeta.textContent=`Clearance · L ${fmt(r.clearances.left)} · R ${fmt(r.clearances.right)} · T ${fmt(r.clearances.top)} · B ${fmt(r.clearances.bottom)}`;}
  }
  function getGraphemeClusters(text){
    if(typeof Intl!=='undefined'&&Intl.Segmenter){
      try{return [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(x=>x.segment);}catch(_){ }
    }
    return Array.from(text);
  }
  function inspectGlyphMapping(text,fontObj=font){
    const clusters=getGraphemeClusters(text);let glyphs=[];
    if(fontObj){try{glyphs=fontObj.stringToGlyphs(text);}catch(_){return {safe:false,clusters,glyphs:[]};}}
    if(!fontObj||!clusters.length||glyphs.length!==clusters.length)return {safe:false,clusters,glyphs};
    const splitGlyphs=clusters.flatMap(cluster=>fontObj.stringToGlyphs(cluster));
    const same=splitGlyphs.length===glyphs.length&&splitGlyphs.every((g,i)=>Number.isInteger(g.index)&&Number.isInteger(glyphs[i].index)&&g.index===glyphs[i].index);
    return {safe:same,clusters,glyphs};
  }
  function refreshGlyphControls(force=false){
    const previewText=E.text.value.split(/\r?\n/).find(t=>t.trim())||'';
    const mapping=inspectGlyphMapping(previewText);const clusters=mapping.clusters;
    if(force||previewText!==glyphText){glyphText=previewText;glyphOffsets=clusters.map(()=>0);glyphTransforms=clusters.map(()=>({x:0,y:0,scaleX:100,scaleY:100,rotate:0}));}
    glyphClusters=clusters;glyphMappingSafe=mapping.safe;
    const previous=E.glyphSelect.value,previousRef=E.referenceGlyph.value;
    E.glyphSelect.replaceChildren();E.referenceGlyph.replaceChildren();
    clusters.forEach((cluster,i)=>{const text=cluster===' '?'space':cluster;const option=document.createElement('option');option.value=String(i);option.textContent=`${i+1} · ${text}`;E.glyphSelect.appendChild(option);const ref=document.createElement('option');ref.value=String(i);ref.textContent=`${i+1} · ${text}`;E.referenceGlyph.appendChild(ref);});
    if(clusters.length){const index=Math.min(Number(previous)||0,clusters.length-1),refIndex=Math.min(Number(previousRef)||0,clusters.length-1);E.glyphSelect.value=String(index);E.referenceGlyph.value=String(refIndex);}
    const selected=Number(E.glyphSelect.value)||0,t=glyphTransforms[selected]||{x:0,y:0,scaleX:100,scaleY:100,rotate:0},offset=t.x||0;
    E.glyphOffset.value=String(offset);E.glyphOffsetY.value=String(t.y||0);E.glyphScaleX.value=String(t.scaleX||100);E.glyphScaleY.value=String(t.scaleY||100);E.glyphRotate.value=String(t.rotate||0);E.glyphOffsetVal.textContent=`${fmt(offset)} px`;
    const canEdit=!!font&&clusters.length>0&&mapping.safe&&!hbEnabled;
    [E.glyphSelect,E.glyphOffset,E.glyphOffsetY,E.glyphScaleX,E.glyphScaleY,E.glyphRotate,E.resetGlyph].forEach(el=>el.disabled=!canEdit);
    const refMode=E.horizontalBasis.value==='reference';E.referenceGlyph.disabled=!canEdit||!refMode||E.autoSize.checked;
    E.glyphMappingHint.textContent=!font?'Upload a font to enable individual character editing.':hbEnabled?'Individual glyph editing is disabled while HarfBuzz shaping is active because shaped glyph clusters can differ from typed characters.':mapping.safe?'Safe mapping: each visible character cluster corresponds to exactly one font glyph.':'Unavailable for this text: one or more character clusters map to multiple or substituted glyphs. Change the text or use a simpler sequence to edit characters individually.';
    E.showPathPoints.disabled=!font||hbEnabled;E.showPathMetrics.disabled=!font||hbEnabled;
    updateTypographyControls();
  }
  function updateTypographyControls(){
    if(!E.horizontalBasis)return;
    const auto=E.autoSize.checked;
    const referenceOption=E.horizontalBasis.querySelector('option[value="reference"]');
    // HarfBuzz can still align by visible outlines or text advance. Only the
    // per-character anchor is unavailable because shaped clusters may merge/reorder.
    if(referenceOption)referenceOption.disabled=auto||hbEnabled;
    if(hbEnabled&&E.horizontalBasis.value==='reference')E.horizontalBasis.value='visible';
    const reference=E.horizontalBasis.value==='reference';
    E.horizontalBasis.disabled=auto;
    E.referenceGlyph.disabled=auto||hbEnabled||!reference||!glyphMappingSafe||!glyphClusters.length;
    E.referenceCharacter.disabled=auto||hbEnabled||!reference;
    E.baselineTarget.disabled=E.verticalBasis.value!=='baseline';
    if(hbEnabled&&reference)E.alignmentHint.textContent='Reference-glyph anchoring is disabled with HarfBuzz because shaping may combine or reorder characters. Choose Visible outline or Text advance; both remain available.';
    else if(auto)E.alignmentHint.textContent='Auto width changes only the SVG width and keeps the font size. Horizontal anchors are calculated from the visible outline; vertical typography alignment remains active.';
    else if(hbEnabled)E.alignmentHint.textContent='HarfBuzz mode supports Visible outline and Text advance horizontal alignment. Reference-glyph alignment is unavailable because shaped clusters may combine or reorder characters.';
    else if(reference&&E.referenceCharacter.value.trim()&&!glyphClusters.includes(E.referenceCharacter.value.trim().normalize('NFC')))E.alignmentHint.textContent=`The character “${E.referenceCharacter.value.trim()}” is not in this label. Visible-outline centring is used for this label; other settings remain active.`;
    else if(reference&&hbEnabled)E.alignmentHint.textContent='Reference-glyph anchoring is unavailable with HarfBuzz. Choose Visible outline or Text advance.';
    else if(E.verticalBasis.value==='baseline')E.alignmentHint.textContent='Baseline mode aligns the alphabetic baseline. With Baseline Y blank, the cap-height region is centred in the padded canvas area. Enter one exact SVG Y value to reuse the same baseline across a batch.';
    else if(E.verticalBasis.value==='ink')E.alignmentHint.textContent='Ink-mass mode centres the rendered alpha-weighted ink, not the full font box. Use Optical fine-tune for a small final adjustment; size is never changed.';
    else if(E.verticalBasis.value==='bounds')E.alignmentHint.textContent='Visible-outline mode centres the complete geometric outline, including descenders. Use it when equal outer bounds matter more than a shared baseline.';
    else E.alignmentHint.textContent='The selected vertical reference is aligned independently of the horizontal reference. Auto Center never changes the font size.';
  }
  function render(){
    E.fontSizeVal.textContent=E.fontSize.value+' px';
    E.widthVal.textContent=E.widthScale.value+'%';
    E.spacingVal.textContent=Number(E.letterSpacing.value).toFixed(2).replace(/\.?0+$/,'')+' px';
    E.weightVal.textContent=Number(E.weight.value).toFixed(1).replace(/\.?0+$/,'')+' px';
    E.referenceOpacityVal.textContent=E.referenceOpacity.value+'%';
    E.fillAlphaVal.textContent=Math.round(Number(E.fillAlpha.value)/2.55)+'%';
    E.bgAlphaVal.textContent=Math.round(Number(E.bgAlpha.value)/2.55)+'%';
    E.referenceLayer.style.opacity=String(Number(E.referenceOpacity.value)/100);
    if(!font){
      currentSvg='';optimizedSvgCache='';setButtons(false);E.generateVariants.disabled=true;E.exportCompareSheet.disabled=true;
      E.optimizeDownload.disabled=true;E.optimizeZip.disabled=true;E.compareOptimized.disabled=true;
      E.optimizationReport.textContent='Generate an SVG before using optimisation.';E.optimizedPreview.classList.add('hide');
      E.artboard.classList.add('empty');E.preview.replaceChildren();E.source.value='';E.dimensions.textContent='— × —';
      E.compareList.replaceChildren();E.compareStage.classList.add('hide');E.previewGrid.classList.remove('comparing');E.pathInspector.style.display='none';
      ['measureWidth','measureHeight','measureAdvance','measureAscender','measureDescender','measureUpem'].forEach(id=>E[id].textContent='—');
      E.fontMeta.innerHTML='Font <strong>not loaded</strong>';E.boundsMeta.innerHTML='Artwork <strong>—</strong>';
      E.glyphSelect.replaceChildren();[E.glyphSelect,E.glyphOffset,E.glyphOffsetY,E.glyphScaleX,E.glyphScaleY,E.glyphRotate,E.showPathPoints,E.showPathMetrics].forEach(el=>el.disabled=true);
      E.glyphMap.replaceChildren();E.glyphMap.textContent='Upload a font to browse its glyphs.';E.glyphCount.textContent='— glyphs';
      return;
    }
    try{
      const s=getSettings(),text=E.text.value.split(/\r?\n/).find(t=>t.trim())||'';
      if(!text.trim()) throw Error('Enter some text to preview.');
      const r=buildSvg(text,s,font);currentSvg=r.svg;optimizedSvgCache='';E.optimizedPreview.classList.add('hide');E.optimizationReport.textContent='Optimisation has not been run for this version.';
      drawSvg(E.preview,r,s);setArtboardRatio(E.artboard,r);E.artboard.classList.remove('empty');
      E.canvasWrap.style.backgroundColor=colorWithAlpha(E.bg.value,s.bgAlpha);
      updateLabels(s,r);E.source.value=currentSvg;setButtons(true);
      E.compareStage.classList.add('hide');E.previewGrid.classList.toggle('comparing',comparisonFonts.length>0);renderComparisonCards(text,s);
      E.generateVariants.disabled=!font||!window.JSZip;E.optimizeDownload.disabled=!currentSvg;E.optimizeZip.disabled=!currentSvg;E.compareOptimized.disabled=!currentSvg;drawPathInspector(text,s,r);
      E.referenceLayer.classList.toggle('visible',!!referenceUrl&&E.showReference.checked);
      setStatus(r.outOfCanvas?'Typography alignment extends beyond the canvas. Increase Canvas height/width or change alignment; font size is not modified.':`Preview updated. ${r.typography?.verticalBasis==='baseline'?'Shared alphabetic baseline':'Selected vertical reference'} · font size preserved. Guides are preview-only.`,'ok');
    }catch(err){
      if(!hbEnabled&&primaryFontBytes&&/lookupType|substFormat|GSUB/i.test(String(err.message||err))){
        setStatus('This font needs HarfBuzz shaping. Enabling it automatically…','ok');
        E.useHarfBuzz.checked=true;
        (async()=>{try{await initializeHarfBuzz();hbEnabled=true;E.hbRetry.hidden=true;refreshGlyphControls();render();}catch(hbErr){E.useHarfBuzz.checked=false;hbEnabled=false;E.hbRetry.hidden=false;E.hbStatus.textContent='Unavailable';const ft=document.getElementById('fontTechSettings');if(ft)ft.open=true;setStatus('HarfBuzz could not be loaded; OpenType.js remains active. '+hbErr.message,'error');}})();
        return;
      }
      clearArtworkState();
      const gspEmptyNote=document.createElement('div');
      gspEmptyNote.className='hint';gspEmptyNote.style.cssText='display:flex;align-items:center;justify-content:center;height:100%;min-height:120px;color:var(--muted);text-align:center;padding:16px';
      gspEmptyNote.textContent='No artwork yet \u2014 enter text to generate a preview.';
      E.preview.replaceChildren(gspEmptyNote);
      setStatus(err.message,'error');
    }
  }
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  const CDN_SRI={'https://cdn.jsdelivr.net/npm/paper@0.17.0/dist/paper-core.min.js':'sha384-gEmegBKRT6L+DIqjFe+6tIxhQ7JBbgggu3FMFb3mCDohcT6VmOXNW41bs+JB/Tv/','https://unpkg.com/paper@0.17.0/dist/paper-core.min.js':'sha384-gEmegBKRT6L+DIqjFe+6tIxhQ7JBbgggu3FMFb3mCDohcT6VmOXNW41bs+JB/Tv/','https://cdn.jsdelivr.net/npm/opentype.js@2.0.0/dist/opentype.min.js':'sha384-rZipYyCodoDMAXvm3BS6DXnn3CAyORo9RZ+7OSlLIj1y1YP4KeMFwgKVkO+9W3nB','https://unpkg.com/opentype.js@2.0.0/dist/opentype.min.js':'sha384-rZipYyCodoDMAXvm3BS6DXnn3CAyORo9RZ+7OSlLIj1y1YP4KeMFwgKVkO+9W3nB'};
  let openTypeLoadPromise=null;
  async function ensureOpenType(){
    if(window.opentype)return window.opentype;
    if(openTypeLoadPromise)return openTypeLoadPromise;
    openTypeLoadPromise=(async()=>{
      const urls=['js/vendor/opentype.min.js','https://cdn.jsdelivr.net/npm/opentype.js@2.0.0/dist/opentype.min.js','https://unpkg.com/opentype.js@2.0.0/dist/opentype.min.js'];
      let lastError;
      for(const url of urls){
        try{
          await new Promise((resolve,reject)=>{
            const script=document.createElement('script');script.src=url;script.async=true;const sri=CDN_SRI[url];if(sri){script.integrity=sri;script.crossOrigin='anonymous';}
            const timer=setTimeout(()=>{script.remove();reject(new Error('Loading '+new URL(url).hostname+' timed out.'));},6500);
            script.onload=()=>{clearTimeout(timer);window.opentype?resolve():reject(new Error('The script loaded but did not expose OpenType.js.'));};
            script.onerror=()=>{clearTimeout(timer);reject(new Error('Could not load '+new URL(url).hostname));};
            document.head.appendChild(script);
          });
          if(window.opentype)return window.opentype;
        }catch(err){lastError=err;}
      }
      throw new Error('OpenType.js could not be loaded from either CDN. Font parsing requires an internet connection. '+(lastError?.message||''));
    })();
    try{return await openTypeLoadPromise;}finally{openTypeLoadPromise=null;}
  }
  async function loadFontFile(file,asComparison=false){
    try{
      const opentypeLib=await ensureOpenType();
      const fileBuffer=await file.arrayBuffer();const parsed=opentypeLib.parse(fileBuffer);
      const name=parsed.names.fontFamily?.en||parsed.names.fontFamily?.[Object.keys(parsed.names.fontFamily||{})[0]]||file.name;
      if(asComparison){comparisonFonts.push({font:parsed,name,fileName:file.name,bytes:new Uint8Array(fileBuffer.slice(0))});comparisonFont=comparisonFonts[0]?.font||null;comparisonName=comparisonFonts[0]?.name||'Comparison font';E.compareName.textContent=comparisonFonts.map(x=>x.name).join(', ')||'Choose comparison font';E.compareInfo.textContent=`${comparisonFonts.length} of 3 comparison fonts loaded`;E.removeCompare.disabled=!comparisonFonts.length;E.exportCompareSheet.disabled=!comparisonFonts.length;}
      else{hbEnabled=false;hbFont=null;hbFace=null;hbAxes=[];E.useHarfBuzz.checked=false;E.axisControls.classList.add('hide');E.detectAxes.disabled=true;E.hbStatus.textContent='HarfBuzz not loaded';E.hbRetry.hidden=true;font=parsed;primaryFontBytes=new Uint8Array(fileBuffer.slice(0));fontName=name;try{await storePresetFont('__lastFont',primaryFontBytes);storageSet('glyphStudioLastFont',JSON.stringify({fileName:file.name}));}catch(_){ }fontAxesFromOpenType();E.fontName.textContent=name;E.fontInfo.textContent=`${file.name} · ${parsed.unitsPerEm} units/em`;E.fontBadge.textContent='READY';fontFileName=file.name;fontVersion++;E.detectAxes.disabled=true;renderGlyphMap();refreshGlyphControls(true);}
      render();if(!asComparison){lastState=captureState();storageSet('glyphStudioSession',JSON.stringify(lastState));}
    }catch(err){if(asComparison){comparisonFont=comparisonFonts[0]?.font||null;E.compareName.textContent=comparisonFonts.map(x=>x.name).join(', ')||'Choose comparison font';E.compareInfo.textContent=`${comparisonFonts.length} of 3 comparison fonts loaded`;E.removeCompare.disabled=!comparisonFonts.length;}else{font=null;primaryFontBytes=null;fontFileName='';fontVersion++;hbEnabled=false;hbFont=null;hbFace=null;hbAxes=[];hbAxisValues={};E.useHarfBuzz.checked=false;E.axisControls.classList.add('hide');E.detectAxes.disabled=true;E.hbStatus.textContent='Unavailable';E.fontBadge.textContent='ERROR';setButtons(false);}render();if(!asComparison){lastState=captureState();storageSet('glyphStudioSession',JSON.stringify(lastState));}setStatus('Font error: '+err.message,'error');}
  }
  // Section-level resets restore only the controls owned by that section.
  function resetSectionButton(button,fn){button.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(typeof pushHistory==='function')pushHistory(captureState());fn();render();lastState=captureState();storageSet('glyphStudioSession',JSON.stringify(lastState));setStatus('Section settings reset.','ok');});}
  resetSectionButton(E.resetTypeface,()=>{
    E.fontSize.value='48';font=null;primaryFontBytes=null;fontFileName='';fontVersion++;hbEnabled=false;hbFont=null;hbFace=null;hbAxes=[];hbAxisValues={};E.useHarfBuzz.checked=false;E.axisControls.classList.add('hide');E.detectAxes.disabled=true;E.hbStatus.textContent='HarfBuzz not loaded';fontName='Uploaded font';E.fontFile.value='';
    E.fontName.textContent='Choose a font file';E.fontInfo.textContent='TTF, OTF or WOFF · file stays on device; font parser loads from CDN';E.fontBadge.textContent='NOT LOADED';
    refreshGlyphControls(true);renderGlyphMap();
  });
  resetSectionButton(E.resetFineTune,()=>{
    E.widthScale.value='100';E.letterSpacing.value='0';E.weight.value='0';
    glyphOffsets=Array.from(glyphText).map(()=>0);glyphTransforms=Array.from(glyphText).map(()=>({x:0,y:0,scaleX:100,scaleY:100,rotate:0}));refreshGlyphControls();
    const i=Number(E.glyphSelect.value)||0;E.glyphOffset.value='0';E.glyphOffsetVal.textContent='0 px';
  });
  resetSectionButton(E.resetCanvas,()=>{
    E.autoSize.checked=true;E.targetHeight.value='50';E.canvasW.value='158';
    ['padTop','padRight','padBottom','padLeft'].forEach(id=>E[id].value='8');E.padAll.value='8';
    hAlign='middle';vAlign='middle';
    E.hAlign.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.value==='middle');b.setAttribute('aria-pressed',String(b.dataset.value==='middle'));});
    E.vAlign.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.value==='middle');b.setAttribute('aria-pressed',String(b.dataset.value==='middle'));});
    E.optical.checked=true;syncCanvasMode();
  });
  resetSectionButton(E.resetAppearance,()=>{E.fill.value='#000000';E.fillAlpha.value='255';E.bg.value='#242424';E.bgAlpha.value='255';E.transparent.checked=true;});
  resetSectionButton(E.resetReference,()=>{
    if(referenceUrl)URL.revokeObjectURL(referenceUrl);referenceUrl='';E.referenceFile.value='';
    E.referenceLayer.removeAttribute('src');E.referenceLayer.classList.remove('visible');
    E.referenceName.textContent='Choose reference artwork';E.showReference.checked=false;E.showReference.disabled=true;
    E.removeReference.disabled=true;E.referenceX.value='0';E.referenceY.value='0';E.referenceScale.value='100';E.referenceRotate.value='0';E.referenceDifference.checked=false;E.referenceLayer.style.transform='';E.referenceLayer.style.mixBlendMode='normal';E.referenceOpacity.value='42';E.referenceOpacityVal.textContent='42%';E.referenceLayer.style.opacity='.42';
  });
  resetSectionButton(E.resetComparison,()=>{
    comparisonFonts=[];comparisonFont=null;comparisonName='Comparison font';E.compareFile.value='';
    E.compareName.textContent='Choose comparison font';E.compareInfo.textContent='Upload up to three additional font files';E.removeCompare.disabled=true;
  });

  E.fontPick.addEventListener('click',()=>E.fontFile.click());
  E.fontFile.addEventListener('change',ev=>{const f=ev.target.files?.[0];if(f){pushHistory(captureState());loadFontFile(f,false);}});
  E.comparePick.addEventListener('click',()=>E.compareFile.click());
  E.compareFile.addEventListener('change',async ev=>{comparisonFonts=[];const files=[...ev.target.files].slice(0,3);for(const f of files)await loadFontFile(f,true);if(ev.target.files.length>3)setStatus('Only the first three comparison fonts were loaded.','error');render();});
  E.removeCompare.addEventListener('click',()=>{comparisonFonts=[];comparisonFont=null;comparisonName='Comparison font';E.compareFile.value='';E.compareName.textContent='Choose comparison font';E.compareInfo.textContent='Upload up to three comparison fonts';E.removeCompare.disabled=true;E.exportCompareSheet.disabled=true;render();});
  E.referencePick.addEventListener('click',()=>E.referenceFile.click());
  E.referenceFile.addEventListener('change',ev=>{
    const file=ev.target.files?.[0];if(!file)return;
    if(referenceUrl)URL.revokeObjectURL(referenceUrl);
    referenceUrl=URL.createObjectURL(file);referenceFileName=file.name;
    E.referenceLayer.src=referenceUrl;E.referenceName.textContent=file.name;E.showReference.disabled=false;E.showReference.checked=true;E.removeReference.disabled=false;
    E.referenceLayer.classList.add('visible');setStatus('Reference loaded. Adjust opacity to compare the outlines.','ok');
  });
  E.removeReference.addEventListener('click',()=>{if(referenceUrl)URL.revokeObjectURL(referenceUrl);referenceUrl='';E.referenceFile.value='';E.referenceLayer.removeAttribute('src');E.referenceLayer.classList.remove('visible');E.referenceName.textContent='Choose reference artwork';E.showReference.checked=false;E.showReference.disabled=true;E.removeReference.disabled=true;});
  E.showReference.addEventListener('change',()=>E.referenceLayer.classList.toggle('visible',!!referenceUrl&&E.showReference.checked));
  E.referenceOpacity.addEventListener('input',()=>{E.referenceOpacityVal.textContent=E.referenceOpacity.value+'%';E.referenceLayer.style.opacity=String(Number(E.referenceOpacity.value)/100);});
  function updateReferenceTransform(){E.referenceLayer.style.transform=`translate(${Number(E.referenceX.value)||0}%,${Number(E.referenceY.value)||0}%) scale(${(Number(E.referenceScale.value)||100)/100}) rotate(${Number(E.referenceRotate.value)||0}deg)`;E.referenceLayer.style.mixBlendMode=E.referenceDifference.checked?'difference':'normal';}
  [E.referenceX,E.referenceY,E.referenceScale,E.referenceRotate,E.referenceDifference].forEach(el=>el.addEventListener('input',updateReferenceTransform));
  E.text.addEventListener('input',()=>{refreshGlyphControls();render();});
  E.glyphSelect.addEventListener('change',()=>{const i=Number(E.glyphSelect.value)||0,t=glyphTransforms[i]||{x:0,y:0,scaleX:100,scaleY:100,rotate:0},offset=t.x||0;E.glyphOffset.value=String(offset);E.glyphOffsetY.value=String(t.y||0);E.glyphScaleX.value=String(t.scaleX||100);E.glyphScaleY.value=String(t.scaleY||100);E.glyphRotate.value=String(t.rotate||0);E.glyphOffsetVal.textContent=`${fmt(offset)} px`;});
  E.referenceGlyph.addEventListener('change',()=>{render();});
  E.glyphOffset.addEventListener('input',()=>updateGlyphTransform('x',E.glyphOffset.value));
  E.glyphOffsetY.addEventListener('input',()=>updateGlyphTransform('y',E.glyphOffsetY.value));E.glyphScaleX.addEventListener('input',()=>updateGlyphTransform('scaleX',E.glyphScaleX.value));E.glyphScaleY.addEventListener('input',()=>updateGlyphTransform('scaleY',E.glyphScaleY.value));E.glyphRotate.addEventListener('input',()=>updateGlyphTransform('rotate',E.glyphRotate.value));
  E.resetGlyph.addEventListener('click',()=>{const i=Number(E.glyphSelect.value)||0;pushHistory(captureState());glyphOffsets[i]=0;glyphTransforms[i]={x:0,y:0,scaleX:100,scaleY:100,rotate:0};refreshGlyphControls();render();lastState=captureState();storageSet('glyphStudioSession',JSON.stringify(lastState));setStatus('Selected character reset.','ok');});
  E.padAll.addEventListener('input',()=>{const value=Number(E.padAll.value);if(!Number.isFinite(value)||value<0||value>1000)return;['padTop','padRight','padBottom','padLeft'].forEach(id=>E[id].value=String(value));render();});
  ['padTop','padRight','padBottom','padLeft'].forEach(id=>E[id].addEventListener('input',()=>{const values=['padTop','padRight','padBottom','padLeft'].map(k=>E[k].value);E.padAll.value=values.every(v=>v===values[0])?values[0]:'';}));
  ['fontSize','widthScale','letterSpacing','weight','targetHeight','canvasW','padTop','padRight','padBottom','padLeft','autoSize','fill','bg','transparent','horizontalBasis','verticalBasis','referenceCharacter','baselineTarget','opticalFineTune','showAlignmentGuides'].forEach(id=>E[id].addEventListener('input',()=>{updateTypographyControls();render();}));E.letterSpacing.addEventListener('change',()=>{updateTypographyControls();render();});E.referenceGlyph.addEventListener('change',render);E.referenceCharacter.addEventListener('input',render);
  function syncCanvasMode(){
    const fit=E.autoSize.checked;
    E.canvasW.disabled=fit;
    E.optical.disabled=false;
    [...E.hAlign.querySelectorAll('button')].forEach(button=>button.disabled=fit);
    E.horizontalBasis.disabled=fit;
    updateTypographyControls();
    [...E.vAlign.querySelectorAll('button')].forEach(button=>button.disabled=false);
    $('alignmentHint').textContent=fit?'Auto width changes only the SVG width. Font size is preserved; vertical alignment and visible-glyph alignment remain active.':'Fixed-width mode uses the entered canvas width and enables both horizontal and vertical alignment.';
  }
  E.autoSize.addEventListener('change',()=>{syncCanvasMode();render();});
  syncCanvasMode();
  function setupSegment(id,axis){$(id).addEventListener('click',ev=>{const btn=ev.target.closest('button[data-value]');if(!btn)return;if(typeof pushHistory==='function')pushHistory(captureState());$(id).querySelectorAll('button').forEach(x=>{x.classList.toggle('active',x===btn);x.setAttribute('aria-pressed',String(x===btn));});if(axis==='h')hAlign=btn.dataset.value;else vAlign=btn.dataset.value;render();lastState=captureState();storageSet('glyphStudioSession',JSON.stringify(lastState));});}
  setupSegment('hAlign','h');setupSegment('vAlign','v');
  function formatSvgMarkup(source, pretty=false){
    const doc=new DOMParser().parseFromString(source,'image/svg+xml');if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('Generated SVG is not valid XML.');const root=doc.documentElement;
    if(!pretty)return new XMLSerializer().serializeToString(root).replace(/>\s+</g,'><').trim();
    const escAttr=v=>String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
    const walk=(node,depth=0)=>{const pad='  '.repeat(depth);if(node.nodeType===3){const t=node.nodeValue.trim();return t?pad+t:'';}if(node.nodeType!==1)return '';const attrs=[...node.attributes].map(a=>` ${a.name}="${escAttr(a.value)}"`).join('');const children=[...node.childNodes].map(n=>walk(n,depth+1)).filter(Boolean);return children.length?`${pad}<${node.tagName}${attrs}>\n${children.join('\n')}\n${pad}</${node.tagName}>`:`${pad}<${node.tagName}${attrs}/>`;};
    return '<?xml version="1.0" encoding="UTF-8"?>\n'+walk(root);
  }
  function buildLiveTextSvg(text,settings,result){
    const doc=new DOMParser().parseFromString(result.svg,'image/svg+xml');
    if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('Could not inspect generated SVG.');
    const root=doc.documentElement,ns='http://www.w3.org/2000/svg';
    [...root.children].filter(el=>el.localName==='g').forEach(el=>el.remove());
    const group=document.createElementNS(ns,'g');group.setAttribute('transform',result.transform);
    const el=document.createElementNS(ns,'text');el.setAttribute('x','0');el.setAttribute('y','0');el.setAttribute('dominant-baseline','alphabetic');
    const realFontWeight=Number(font&&font.tables&&font.tables.os2&&font.tables.os2.usWeightClass)||400;el.setAttribute('fill',settings.fill);el.setAttribute('fill-opacity',String(settings.fillAlpha??1));el.setAttribute('font-family',fontName||'sans-serif');el.setAttribute('font-size',String(settings.size));el.setAttribute('font-weight',String(realFontWeight));
    if(settings.spacing){const spacingValue=`${settings.spacing}px`;el.setAttribute('letter-spacing',spacingValue);el.style.setProperty('letter-spacing',spacingValue);}
    if(settings.weight>0){el.setAttribute('stroke',settings.fill);el.setAttribute('stroke-opacity',String(settings.fillAlpha??1));el.setAttribute('stroke-width',String(settings.weight));el.setAttribute('stroke-linejoin','round');el.setAttribute('stroke-linecap','round');el.setAttribute('paint-order','stroke fill');}
    el.textContent=text;group.appendChild(el);root.appendChild(group);
    return new XMLSerializer().serializeToString(root);
  }
  function getTextExport(text,settings){const result=buildActiveSvg(text,settings);const source=E.textSvgMode.value==='text'?buildLiveTextSvg(text,settings,result):result.svg;return formatSvgMarkup(source,E.textSvgWhitespace.value==='pretty');}
  function syncTextExportButtons(enabled){if(E.downloadFormattedSvg)E.downloadFormattedSvg.disabled=!enabled;if(E.copyFormattedSvg)E.copyFormattedSvg.disabled=!enabled;}
  E.textSvgMode.addEventListener('change',()=>{E.textSvgFormatReport.textContent=E.textSvgMode.value==='text'?'Live text SVG: editable as text, but font appearance depends on installed fonts.':'Outlined path SVG: exact uploaded-font outlines, portable across devices.';});
  E.download.addEventListener('click',async()=>{try{const s=getSettings(),t=E.text.value.split(/\r?\n/).find(x=>x.trim())||'text';downloadBlob(new Blob([getTextExport(t,s)],{type:'image/svg+xml;charset=utf-8'}),safeName(t)+'.svg');}catch(e){setStatus(e.message,'error');}});
  E.downloadFormattedSvg?.addEventListener('click',()=>{try{const s=getSettings(),t=E.text.value.split(/\r?\n/).find(x=>x.trim())||'text';downloadBlob(new Blob([getTextExport(t,s)],{type:'image/svg+xml;charset=utf-8'}),safeName(t)+'_formatted.svg');setStatus('SVG exported with selected output settings.','ok');}catch(e){setStatus(e.message,'error');}});
  E.copyFormattedSvg.addEventListener('click',async()=>{try{const s=getSettings(),t=E.text.value.split(/\r?\n/).find(x=>x.trim())||'text';await copyTextToClipboardResilient(getTextExport(t,s),'Formatted SVG copied.','Formatted copy is blocked. The formatted SVG is selected in the source box; long-press and choose Copy.',true);}catch(e){setStatus(e.message,'error');}});
  E.selectSource.addEventListener('click',()=>{if(!currentSvg)return;E.source.focus();E.source.select();setStatus('SVG source selected. Use your device or browser Copy command.','ok');});
  E.copy.addEventListener('click',async()=>{if(!currentSvg)return;await copyTextToClipboardResilient(currentSvg,'SVG code copied to clipboard.','Clipboard is blocked. The source is selected below; long-press and choose Copy.',false);});
  E.zip.addEventListener('click',async()=>{
    try{
      if(!window.JSZip)throw Error('Could not load JSZip. Check your internet connection and reload this page.');
      const s=getSettings(),lines=E.text.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      if(!lines.length)throw Error('Enter at least one label, one per line.');
      const zip=new JSZip(),counts={};
      for(const line of lines){const base=safeName(line);counts[base]=(counts[base]||0)+1;const name=base+(counts[base]>1?'_'+counts[base]:'')+'.svg';zip.file(name,getTextExport(line,s));}
      setStatus(`Creating ${lines.length} SVG file(s)…`);
      const blob=await zip.generateAsync({type:'blob'});downloadBlob(blob,'glyph-studio-export.zip');setStatus(`ZIP created with ${lines.length} SVG file(s).`,'ok');
    }catch(e){setStatus(e.message,'error');}
  });
  E.checkerToggle.addEventListener('click',()=>{checkerOn=!checkerOn;E.checkerToggle.classList.toggle('active',checkerOn);E.checkerToggle.setAttribute('aria-pressed',String(checkerOn));[...document.querySelectorAll('.artboard-shell')].forEach(el=>{el.style.backgroundImage=checkerOn?'linear-gradient(45deg,#c9ced6 25%,transparent 25%),linear-gradient(-45deg,#c9ced6 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#c9ced6 75%),linear-gradient(-45deg,transparent 75%,#c9ced6 75%)':'none';el.style.backgroundColor=checkerOn?'#dfe3e9':colorWithAlpha(E.bg.value,Number(E.bgAlpha.value)/255);});});
  E.fillAlpha.addEventListener('input',()=>{E.fillAlphaVal.textContent=Math.round(Number(E.fillAlpha.value)/2.55)+'%';render();});
   E.bg.addEventListener('input',()=>{if(!checkerOn)document.querySelectorAll('.artboard-shell').forEach(el=>el.style.backgroundColor=colorWithAlpha(E.bg.value,Number(E.bgAlpha.value)/255));render();});
   E.bgAlpha.addEventListener('input',()=>{E.bgAlphaVal.textContent=Math.round(Number(E.bgAlpha.value)/2.55)+'%';if(!checkerOn)document.querySelectorAll('.artboard-shell').forEach(el=>el.style.backgroundColor=colorWithAlpha(E.bg.value,Number(E.bgAlpha.value)/255));render();});

  // ----- Extended typography and productivity tools -----
  function updateGlyphTransform(key,value){
    const i=Number(E.glyphSelect.value)||0;if(!glyphTransforms[i])glyphTransforms[i]={x:0,y:0,scaleX:100,scaleY:100,rotate:0};
    const bounds={x:[-40,40],y:[-100,100],scaleX:[10,300],scaleY:[10,300],rotate:[-180,180]}[key];
    let n=Number(value);if(!Number.isFinite(n))return;n=Math.max(bounds[0],Math.min(bounds[1],n));glyphTransforms[i][key]=n;
    if(key==='x'){glyphOffsets[i]=n;E.glyphOffsetVal.textContent=`${fmt(n)} px`;}
    render();
  }
  function fontAxesFromOpenType(){
    E.axisControls.innerHTML='<div class="hint">Variable axes are detected through the optional HarfBuzz engine. Enable it and choose “Detect variable axes”.</div>';
  }
  function getComparisonResult(text,s,item){
    if(hbEnabled&&hbModule){
      const context=getComparisonContext(item);
      return buildHarfBuzzSvg(text,s,context.font,context.face);
    }
    return buildSvg(text,s,item.font);
  }
  function getComparisonContext(item){if(!item.hbContext){const bytes=item.bytes;const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);const face=new hbModule.Face(new hbModule.Blob(buffer));const hbFontForComparison=new hbModule.Font(face);hbFontForComparison.setScale(face.upem,face.upem);item.hbContext={face,font:hbFontForComparison};}return item.hbContext;}
  function renderComparisonCards(text,s){
    if(!E.compareList)return;E.compareList.replaceChildren();
    comparisonFonts.forEach((item,index)=>{
      try{
        const result=getComparisonResult(text,s,item),card=document.createElement('div');card.className='compare-mini';
        const head=document.createElement('div');head.className='compare-mini-head';
        const title=document.createElement('span');title.textContent=item.name;
        const dims=document.createElement('span');dims.textContent=`${result.w} × ${result.h} px`;
        head.append(title,dims);const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${result.w} ${result.h}`);svg.setAttribute('width',String(result.w));svg.setAttribute('height',String(result.h));svg.setAttribute('role','img');svg.setAttribute('aria-label',`Font comparison ${item.name}`);
        const parsed=new DOMParser().parseFromString(result.svg,'image/svg+xml');svg.innerHTML=parsed.documentElement.innerHTML;
        card.append(head,svg);E.compareList.appendChild(card);
      }catch(err){const card=document.createElement('div');card.className='compare-mini';card.textContent=`${item.name}: ${err.message}`;E.compareList.appendChild(card);}
    });
    E.exportCompareSheet.disabled=!comparisonFonts.length;
  }
  E.exportCompareSheet.addEventListener('click',()=>{
    try{
      if(!font||!comparisonFonts.length)throw Error('Load a primary font and at least one comparison font.');
      const text=E.text.value.split(/\r?\n/).find(x=>x.trim())||'text',s=getSettings();
      const items=[{font,name:fontName,bytes:primaryFontBytes},...comparisonFonts].slice(0,4);
      const results=items.map((item,index)=>({name:item.name,...(index===0?buildActiveSvg(text,s):getComparisonResult(text,s,item))}));
      const cellW=Math.max(...results.map(x=>x.w)),cellH=Math.max(...results.map(x=>x.h))+26,cols=2,rows=Math.ceil(results.length/cols),W=cols*cellW,H=rows*cellH;
      const parts=results.map((r,i)=>{const x=(i%cols)*cellW,y=Math.floor(i/cols)*cellH;const doc=new DOMParser().parseFromString(r.svg,'image/svg+xml');const inner=doc.documentElement.innerHTML;return `<text x="${x+8}" y="${y+16}" fill="#64748b" font-size="11">${esc(r.name)}</text><svg x="${x}" y="${y+22}" width="${r.w}" height="${r.h}" viewBox="0 0 ${r.w} ${r.h}">${inner}</svg>`;}).join('');
      const sheet=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts}</svg>`;downloadBlob(new Blob([sheet],{type:'image/svg+xml'}),safeName(text)+'_font_comparison.svg');
    }catch(err){setStatus(err.message,'error');}
  });
  function renderGlyphMap(){
    if(!E.glyphMap)return;E.glyphMap.replaceChildren();if(!font){E.glyphMap.textContent='Upload a font to browse its glyphs.';E.glyphCount.textContent='— glyphs';return;}
    const total=font.glyphs?.length||0;E.glyphCount.textContent=`${total} glyphs`;const q=(E.glyphSearch.value||'').trim().toLowerCase();let count=0;
    for(let i=0;i<total&&count<400;i++){
      const g=font.glyphs.get(i),codes=(g.unicodes?.length?g.unicodes:(g.unicode!=null?[g.unicode]:[]));if(!codes.length)continue;
      for(const cp of codes){let ch='';try{ch=String.fromCodePoint(cp);}catch(_){continue;}const name=g.name||'';const codeQuery=q.replace(/^u\+/,'').replace(/^0x/,'');const matchChar=q.length===1?ch.toLowerCase()===q:ch.toLowerCase().includes(q);const matchName=q.length===1?name.toLowerCase()===q:name.toLowerCase().includes(q);if(q&&!matchChar&&!matchName&&!cp.toString(16).includes(codeQuery))continue;
        const b=document.createElement('button');b.type='button';b.title=`${name||'Glyph'} · U+${cp.toString(16).toUpperCase()}`;b.textContent=ch;b.dataset.char=ch;b.addEventListener('click',()=>insertGlyph(ch));E.glyphMap.appendChild(b);count++;if(count>=400)break;
      }
    }
    if(!count)E.glyphMap.textContent='No matching glyphs found.';
  }
  function insertGlyph(ch){const start=E.text.selectionStart??E.text.value.length,end=E.text.selectionEnd??start;E.text.setRangeText(ch,start,end,'end');E.text.dispatchEvent(new Event('input',{bubbles:true}));E.text.focus();}
  E.glyphSearch.addEventListener('input',renderGlyphMap);
  function drawPathInspector(text,s,r){
    const canvas=E.pathInspector;if(!canvas)return;
    const show=E.showPathPoints.checked||E.showPathMetrics.checked;
    canvas.style.display=show&&!hbEnabled?'block':'none';
    if(!show||hbEnabled||!font)return;
    const rect=E.artboard.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1);
    if(!rect.width||!rect.height)return;
    canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
    const ctx=canvas.getContext('2d');if(!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);
    const scaleX=rect.width/r.w,scaleY=rect.height/r.h;
    ctx.setTransform(dpr*scaleX,0,0,dpr*scaleY,0,0);
    ctx.save();ctx.translate(r.dx||0,r.dy||0);ctx.scale((r.scale||1)*s.widthScale,r.scale||1);
    try{
      const mapping=inspectGlyphMapping(text,font),glyphs=mapping.glyphs,canMap=mapping.safe;
      let penX=0;
      glyphs.forEach((glyph,index)=>{
        const t=canMap?(s.glyphTransforms[index]||{}):{};
        const path=glyph.getPath(penX,0,s.size),bb=path.getBoundingBox();
        const sx=(Number(t.scaleX)||100)/100,sy=(Number(t.scaleY)||100)/100,angle=(Number(t.rotate)||0)*Math.PI/180;
        const cx=(bb.x1+bb.x2)/2,cy=(bb.y1+bb.y2)/2;
        ctx.save();ctx.translate(Number(t.x)||0,Number(t.y)||0);ctx.translate(cx,cy);ctx.rotate(angle);ctx.scale(sx,sy);ctx.translate(-cx,-cy);
        if(E.showPathPoints.checked&&typeof glyph.drawPoints==='function')glyph.drawPoints(ctx,penX,0,s.size);
        if(E.showPathMetrics.checked&&typeof glyph.drawMetrics==='function')glyph.drawMetrics(ctx,penX,0,s.size);
        ctx.restore();
        penX+=glyph.advanceWidth*s.size/font.unitsPerEm;
        if(index<glyphs.length-1){penX+=s.spacing;const kern=font.getKerningValue?font.getKerningValue(glyph,glyphs[index+1]):0;penX+=kern*s.size/font.unitsPerEm;}
      });
    }catch(err){console.warn('Path inspector:',err);}
    ctx.restore();
  }
  E.showPathPoints.addEventListener('change',()=>render());E.showPathMetrics.addEventListener('change',()=>render());[E.textScript,E.textDirection].forEach(el=>el.addEventListener('change',()=>render()));
  window.addEventListener('resize',()=>{if(font){try{const s=getSettings(),t=E.text.value.split(/\r?\n/).find(x=>x.trim())||'',r=buildSvg(t,s,font);drawPathInspector(t,s,r);}catch(_){}}});

  // Comparison of reference artwork with independent positioning controls.
  [E.referenceX,E.referenceY,E.referenceScale,E.referenceRotate,E.referenceDifference].forEach(el=>el.addEventListener('change',updateReferenceTransform));

  // Safe storage: use persistent localStorage when available, otherwise a session-only in-memory fallback.
  const fallbackStore={};
  function storageGet(key){try{return window.localStorage.getItem(key);}catch(_){return fallbackStore[key]??null;}}
  function storageSet(key,value){fallbackStore[key]=String(value);try{window.localStorage.setItem(key,String(value));}catch(_){}}
  function storageRemove(key){delete fallbackStore[key];try{window.localStorage.removeItem(key);}catch(_){}}
  // Undo/redo snapshots cover editable design controls and character transforms.
  const stateIds=['text','fontSize','widthScale','letterSpacing','weight','autoSize','targetHeight','canvasW','padTop','padRight','padBottom','padLeft','padAll','optical','horizontalBasis','verticalBasis','referenceGlyph','referenceCharacter','baselineTarget','opticalFineTune','showAlignmentGuides','fill','fillAlpha','bg','bgAlpha','transparent','glyphOffset','glyphOffsetY','glyphScaleX','glyphScaleY','glyphRotate','referenceOpacity','referenceX','referenceY','referenceScale','referenceRotate','referenceDifference','textScript','textDirection','optimizeLevel','pathPrecision'];
  function captureState(){const values={};stateIds.forEach(id=>{const el=$(id);if(el)values[id]=el.type==='checkbox'?el.checked:el.value;});return {values,hAlign,vAlign,glyphTransforms:glyphTransforms.map(t=>({...t})),glyphOffsets:glyphOffsets.slice(),hbAxisValues:{...hbAxisValues}};}
  function stateKey(st){return JSON.stringify({values:st.values,hAlign:st.hAlign,vAlign:st.vAlign,glyphTransforms:st.glyphTransforms,glyphOffsets:st.glyphOffsets,hbAxisValues:st.hbAxisValues,_fontVersion:st._fontVersion});}
  function historySnapshot(st=captureState()){return {...st,_fontObject:font,_fontBytes:primaryFontBytes,_fontName:fontName,_fontFileName:fontFileName,_fontVersion:fontVersion,_hbEnabled:hbEnabled,_hbFont:hbFont,_hbFace:hbFace,_hbAxes:hbAxes.slice()};}
  function updateHistoryUI(){E.undoBtn.disabled=!historyStack.length;E.redoBtn.disabled=!redoStack.length;E.historyLabel.textContent=`${historyStack.length} undo · ${redoStack.length} redo`;}
  function pushHistory(st){if(!st)return;const entry=historySnapshot(st),prev=historyStack[historyStack.length-1];if(prev&&stateKey(prev)===stateKey(entry))return;historyStack.push(entry);if(historyStack.length>80)historyStack.shift();redoStack=[];updateHistoryUI();}
  function applyState(st){
    if(!st)return;
    if(Object.prototype.hasOwnProperty.call(st,'_fontObject')){
      font=st._fontObject;primaryFontBytes=st._fontBytes;fontName=st._fontName||'Uploaded font';fontFileName=st._fontFileName||'';fontVersion=st._fontVersion||fontVersion;
      hbEnabled=!!st._hbEnabled;hbFont=st._hbFont||null;hbFace=st._hbFace||null;hbAxes=Array.isArray(st._hbAxes)?st._hbAxes.slice():[];
      E.fontFile.value='';E.fontName.textContent=font?fontName:'Choose a font file';E.fontInfo.textContent=font?`${fontFileName||'Restored font'} · ${font.unitsPerEm} units/em`:'TTF, OTF or WOFF · file stays on device; font parser loads from CDN';E.fontBadge.textContent=font?'READY':'NOT LOADED';E.useHarfBuzz.checked=hbEnabled;E.detectAxes.disabled=!hbFace;E.hbStatus.textContent=hbEnabled?'HarfBuzz restored from history':(font?'Enable HarfBuzz for variable axes':'HarfBuzz not loaded');
      if(hbEnabled&&hbAxes.length)buildAxisControls();else E.axisControls.classList.add('hide');
    }
    st.values=st.values||{};
    stateIds.forEach(id=>{const el=$(id);if(!el||!(id in st.values))return;if(el.type==='checkbox')el.checked=!!st.values[id];else el.value=st.values[id];});
    hAlign=st.hAlign||'middle';vAlign=st.vAlign||'middle';
    glyphText=E.text.value.split(/\r?\n/).find(x=>x.trim())||'';
    glyphTransforms=Array.isArray(st.glyphTransforms)?st.glyphTransforms.map(t=>({...t})) : Array.from(glyphText).map(()=>({x:0,y:0,scaleX:100,scaleY:100,rotate:0}));
    glyphOffsets=Array.isArray(st.glyphOffsets)?st.glyphOffsets.slice():glyphTransforms.map(t=>Number(t.x)||0);
    hbAxisValues={...(st.hbAxisValues||{})};
    E.hAlign.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.value===hAlign);b.setAttribute('aria-pressed',String(b.dataset.value===hAlign));});E.vAlign.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.value===vAlign);b.setAttribute('aria-pressed',String(b.dataset.value===vAlign));});
    refreshGlyphControls(false);syncCanvasMode();updateReferenceTransform();if(hbFont){applyHBAxes();buildAxisControls();}render();lastState=captureState();
  }
  document.addEventListener('input',ev=>{if(ev.target.matches('input,textarea,select')){const now=captureState();if(lastState&&stateKey(now)!==stateKey(lastState))pushHistory(lastState);lastState=now;storageSet('glyphStudioSession',JSON.stringify(now));}});
  document.addEventListener('change',ev=>{if(ev.target.matches('input,textarea,select')){const now=captureState();if(lastState&&stateKey(now)!==stateKey(lastState))pushHistory(lastState);lastState=now;}});
  E.undoBtn.addEventListener('click',()=>{if(!historyStack.length)return;redoStack.push(historySnapshot());const prev=historyStack.pop();applyState(prev);updateHistoryUI();});
  E.redoBtn.addEventListener('click',()=>{if(!redoStack.length)return;historyStack.push(historySnapshot());const next=redoStack.pop();applyState(next);updateHistoryUI();});
  E.clearHistory.addEventListener('click',()=>{historyStack=[];redoStack=[];updateHistoryUI();});
  document.addEventListener('keydown',ev=>{if(!$('modeTextBtn')?.classList.contains('active'))return;const target=ev.target,tag=target?.tagName;if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||target?.isContentEditable||target?.closest?.('[contenteditable="true"]'))return;if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){ev.preventDefault();(ev.shiftKey?E.redoBtn:E.undoBtn).click();}else if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='y'){ev.preventDefault();E.redoBtn.click();}});
  const presetKey='glyphStudioPresetsV1';
  // Font binaries are stored in IndexedDB (not localStorage) to avoid its small text quota.
  let presetDbConnection=null,presetDbOpening=null,presetDbLastError=null;
function presetDbUsable(db){try{return!!db&&typeof db.transaction==='function'&&db.objectStoreNames?.contains('fonts');}catch(_){return false;}}
function openPresetDb(versionOverride=null){return new Promise((resolve,reject)=>{let req;try{req=versionOverride==null?indexedDB.open('GlyphStudioAssets'):indexedDB.open('GlyphStudioAssets',versionOverride);}catch(err){reject(err);return;}req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('fonts'))db.createObjectStore('fonts');};req.onerror=()=>reject(req.error||new Error('Could not open font storage'));req.onblocked=()=>reject(new Error('Font storage is blocked by another browser tab'));req.onsuccess=()=>{const db=req.result;if(!presetDbUsable(db)){const version=db?.version||0;db?.close?.();if(version>0){reject(Object.assign(new Error('Font database is missing its fonts object store.'),{code:'PRESET_STORE_MISSING',version}));return;}reject(new Error('Font database connection is invalid.'));return;}presetDbConnection=db;db.onversionchange=()=>{try{db.close();}catch(_){}if(presetDbConnection===db)presetDbConnection=null;};db.onclose=()=>{if(presetDbConnection===db)presetDbConnection=null;};resolve(db);};});}
async function getPresetDb(force=false){if(force){try{presetDbConnection?.close?.();}catch(_){}presetDbConnection=null;presetDbOpening=null;}if(presetDbUsable(presetDbConnection))return presetDbConnection;if(presetDbOpening)return presetDbOpening;presetDbOpening=(async()=>{try{return await openPresetDb();}catch(err){if(err?.code==='PRESET_STORE_MISSING'&&Number.isInteger(err.version)&&err.version<Number.MAX_SAFE_INTEGER)return openPresetDb(err.version+1);throw err;}})().finally(()=>{presetDbOpening=null;});return presetDbOpening;}
async function presetDbAction(mode,key,value){let last;for(let attempt=0;attempt<2;attempt++){let db;try{db=await getPresetDb(attempt>0);return await new Promise((resolve,reject)=>{let tx,req,result;try{tx=db.transaction('fonts',mode);const store=tx.objectStore('fonts');req=mode==='readwrite'?(value===undefined?store.delete(key):store.put(value,key)):store.get(key);if(req){req.onsuccess=()=>result=req.result;req.onerror=()=>reject(req.error||new Error('Font storage request failed.'));}tx.oncomplete=()=>resolve(result??(mode==='readwrite'?true:null));tx.onerror=()=>reject(tx.error||req?.error||new Error('Font storage transaction failed.'));tx.onabort=()=>reject(tx.error||req?.error||new Error('Font storage transaction aborted.'));}catch(err){reject(err);}});}catch(err){last=err;if(attempt===0&&(!presetDbUsable(db)||['InvalidStateError','NotFoundError','TransactionInactiveError'].includes(err?.name))){try{db?.close?.();}catch(_){}presetDbConnection=null;continue;}presetDbLastError=err;throw err;}}throw last||new Error('Font storage failed after reconnecting.');}
  async function storePresetFont(name,bytes){return presetDbAction('readwrite',name,bytes.slice().buffer);}
  async function readPresetFont(name){return (await presetDbAction('readonly',name))||null;}
  async function deletePresetFont(name){try{return await presetDbAction('readwrite',name,undefined);}catch(_){}}
  function readPresets(){try{return JSON.parse(storageGet(presetKey)||'{}');}catch(_){return {};}}
  function refreshPresetList(){const presets=readPresets(),selected=E.presetSelect.value;E.presetSelect.replaceChildren(new Option('Choose preset…',''));Object.keys(presets).sort().forEach(name=>E.presetSelect.add(new Option(name,name)));if(presets[selected])E.presetSelect.value=selected;}
  E.savePreset.addEventListener('click',async()=>{const name=E.presetName.value.trim();if(!name){setStatus('Enter a preset name first.','error');return;}const presets=readPresets(),record={state:captureState(),fontName,fontFileName,hasFont:!!(font&&primaryFontBytes)};try{if(record.hasFont)await storePresetFont(name,primaryFontBytes);else await deletePresetFont(name);presets[name]=record;storageSet(presetKey,JSON.stringify(presets));refreshPresetList();E.presetSelect.value=name;setStatus(record.hasFont?`Preset “${name}” and its font file saved on this device.`:`Preset “${name}” saved (no font was loaded).`,'ok');}catch(err){setStatus('Preset could not save its font file: '+err.message+'. Settings were not saved.','error');}});
  E.loadPreset.addEventListener('click',async()=>{const name=E.presetSelect.value,record=readPresets()[name];if(!record){setStatus('Choose a saved preset.','error');return;}const st=record.state||record;pushHistory(captureState());try{if(record.hasFont){const bytes=await readPresetFont(name);if(!bytes)throw new Error('The saved font data is missing. The browser may have cleared site storage.');const blob=new Blob([bytes]);const file=new File([blob],record.fontFileName||'saved-font.otf',{type:'font/otf'});await loadFontFile(file,false);if(!font)throw new Error('The saved font could not be parsed.');}applyState(st);storageSet('glyphStudioSession',JSON.stringify(captureState()));setStatus(record.hasFont?`Preset “${name}” and its font loaded.`:`Preset “${name}” loaded. No font was included.`,'ok');}catch(err){setStatus(`Could not fully load preset “${name}”: ${err.message}`,'error');}});
  E.deletePreset.addEventListener('click',async()=>{const name=E.presetSelect.value;if(!name)return;const presets=readPresets();delete presets[name];storageSet(presetKey,JSON.stringify(presets));await deletePresetFont(name);refreshPresetList();setStatus(`Preset “${name}” deleted, including its saved font.`, 'ok');});
  refreshPresetList();updateHistoryUI();
  E.resetAll.addEventListener('click',()=>{pushHistory(captureState());E.text.value='HEVC';E.fontSize.value='48';E.widthScale.value='100';E.letterSpacing.value='0';E.weight.value='0';glyphTransforms=Array.from('HEVC').map(()=>({x:0,y:0,scaleX:100,scaleY:100,rotate:0}));glyphOffsets=Array.from('HEVC').map(()=>0);E.autoSize.checked=true;E.targetHeight.value='50';E.canvasW.value='158';['padTop','padRight','padBottom','padLeft','padAll'].forEach(id=>E[id].value='8');E.optical.checked=true;E.horizontalBasis.value='visible';E.verticalBasis.value='baseline';E.referenceGlyph.value='0';E.referenceCharacter.value='';E.baselineTarget.value='';E.opticalFineTune.value='0';E.showAlignmentGuides.checked=false;hAlign=vAlign='middle';E.hAlign.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.value==='middle');b.setAttribute('aria-pressed',String(b.dataset.value==='middle'));});E.vAlign.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.value==='middle');b.setAttribute('aria-pressed',String(b.dataset.value==='middle'));});E.fill.value='#000000';E.fillAlpha.value='255';E.bg.value='#242424';E.bgAlpha.value='255';E.transparent.checked=true;E.variationAxis.value='width';E.variationCount.value='5';E.variationStep.value='2';E.textScript.value='auto';E.textDirection.value='auto';E.optimizeLevel.value='balanced';E.pathPrecision.value='3';updateOptimizationControls();E.showPathPoints.checked=false;E.showPathMetrics.checked=false;E.useHarfBuzz.checked=false;hbEnabled=false;hbFont=null;hbFace=null;hbAxes=[];hbAxisValues={};E.axisControls.classList.add('hide');E.detectAxes.disabled=true;E.hbStatus.textContent='HarfBuzz not loaded';E.resetReference.click();E.removeCompare.click();refreshGlyphControls(true);E.glyphSelect.value='0';syncCanvasMode();render();E.optimizedPreview.classList.add('hide');E.optimizationReport.textContent='Optimisation is optional. The standard SVG export remains unchanged.';lastState=captureState();storageSet('glyphStudioSession',JSON.stringify(lastState));setStatus('Design settings reset. Uploaded primary font retained.','ok');});

  // Autosave design controls locally; named presets can additionally retain the uploaded font in IndexedDB.
  try{const session=JSON.parse(storageGet('glyphStudioSession')||'null');if(session?.values){applyState(session);setStatus('Previous design settings restored. Re-upload your font to continue.');}}catch(_){ }

  // 0.6.26 (Fix 7 + Fix 3): restore the last used font, or fall back to a built-in OFL font.
  (async()=>{try{
    if(font)return;
    let lastBytes=null,lastMeta=null;
    try{lastBytes=await readPresetFont('__lastFont');const raw=storageGet('glyphStudioLastFont');lastMeta=raw?JSON.parse(raw):null;}catch(_){ }
    if(lastBytes&&(lastBytes.length||lastBytes.byteLength)){
      const restoredFile=new File([lastBytes],(lastMeta&&lastMeta.fileName)||'restored-font.otf',{type:'font/otf'});
      await loadFontFile(restoredFile,false);
      if(font)setStatus('Previous font and design settings restored from this device.','ok');
      return;
    }
    const bf=window.GlyphStudioBuiltinFonts&&window.GlyphStudioBuiltinFonts['Inter'];
    if(bf){
      const bin=atob(bf.b64),fbytes=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++)fbytes[i]=bin.charCodeAt(i);
      try{const ff=new FontFace(bf.family,fbytes.buffer);await ff.load();document.fonts.add(ff);}catch(_){ }
      await loadFontFile(new File([fbytes],bf.fileName,{type:'font/ttf'}),false);
      if(font)setStatus('Built-in Inter font loaded so you can start right away. Upload your own font any time.','ok');
    }
  }catch(_){ }})();

  // Variation generator: builds ZIP alternatives without changing the live design.
  E.generateVariants.addEventListener('click',async()=>{
    try{if(!font)throw Error('Upload a font first.');if(!window.JSZip)throw Error('JSZip is unavailable. Check your internet connection.');const base=getSettings(),axis=E.variationAxis.value,count=Number(E.variationCount.value),step=Number(E.variationStep.value);if(!(step>0&&step<=20))throw Error('Step size must be between 0 and 20.');const center=axis==='width'?Number(E.widthScale.value):axis==='weight'?Number(E.weight.value):Number(E.letterSpacing.value),zip=new JSZip(),textLines=E.text.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!textLines.length)throw Error('Enter at least one label.');
      const limits=axis==='width'?[70,130]:axis==='weight'?[0,6]:[-12,36],seen=new Set(),values=[];
      for(let i=0;i<count;i++){const raw=center+(i-(count-1)/2)*step,value=Math.max(limits[0],Math.min(limits[1],raw)),key=value.toFixed(3);if(!seen.has(key)){seen.add(key);values.push(value);}}
      const duplicateNames={};
      for(const value of values){const s={...base,pads:{...base.pads}};if(axis==='width')s.widthScale=value/100;if(axis==='weight')s.weight=value;if(axis==='spacing')s.spacing=value;const tag=axis==='width'?`width_${Math.round(s.widthScale*100)}`:axis==='weight'?`weight_${fmt(s.weight).replace('.','p')}`:`spacing_${fmt(s.spacing).replace('-','m').replace('.','p')}`;textLines.forEach(line=>{const baseName=safeName(line),key=`${tag}/${baseName}`;duplicateNames[key]=(duplicateNames[key]||0)+1;zip.file(`${key}${duplicateNames[key]>1?'_'+duplicateNames[key]:''}.svg`,buildActiveSvg(line,s).svg);});}
      if(!values.length)throw Error('No unique variants could be generated.');
      const blob=await zip.generateAsync({type:'blob'});downloadBlob(blob,'glyph-studio-variations.zip');setStatus(`${values.length} unique variation(s) generated; current design unchanged.${values.length<count?' Some duplicates were omitted at the setting limits.':''}`,'ok');
    }catch(err){setStatus(err.message,'error');}
  });

  // HarfBuzz is loaded on demand. The OpenType.js path engine remains the default fallback.
  let hbLoadPromise=null;
  async function ensureHarfBuzz(bust){
    if(hbModule)return hbModule;if(hbLoadPromise)return hbLoadPromise;
    hbLoadPromise=(async()=>{let lastError;for(const url of ['js/vendor/harfbuzz/index.mjs','https://esm.sh/harfbuzzjs@1.6.4?bundle','https://cdn.jsdelivr.net/npm/harfbuzzjs@1.6.4/dist/index.mjs']){try{hbModule=await import(url+(bust?((url.includes('?')?'&':'?')+'hbr='+Date.now()):''));return hbModule;}catch(err){lastError=err;}}throw lastError||Error('HarfBuzz module could not be loaded.');})();
    try{return await hbLoadPromise;}finally{hbLoadPromise=null;}
  }
  async function ensureBidi(){
    if(bidiModule)return bidiModule;if(bidiLoadPromise)return bidiLoadPromise;
    bidiLoadPromise=(async()=>{let last;for(const url of ['js/vendor/bidi-js.esm.js','https://esm.sh/bidi-js@1.1.0?bundle','https://cdn.jsdelivr.net/npm/bidi-js@1.1.0/+esm']){try{const mod=await importWithTimeout(url,6500),factory=mod.default||mod;if(typeof factory!=='function')throw Error('bidi-js factory export was not found');bidiModule=factory();if(typeof bidiModule.getEmbeddingLevels!=='function')throw Error('bidi-js Unicode bidi API is incomplete');return bidiModule;}catch(err){last=err;}}throw last||Error('Unicode Bidirectional Algorithm module could not load.');})();
    try{return await bidiLoadPromise;}catch(err){bidiLoadPromise=null;throw err;}
  }
  function offsetsIndexForBidiCodeUnit(chars,codeUnit){let offset=0;for(let i=0;i<chars.length;i++){if(codeUnit>=offset&&codeUnit<offset+chars[i].length)return i;offset+=chars[i].length;}return-1;}
  // Resolve script runs for common and less-common writing systems instead
  // of silently shaping Greek/Cyrillic/etc. as Latin. Build regexes dynamically
  // so a browser with an older Unicode property table can skip unknown scripts
  // without making the entire application fail to parse.
  const HB_SCRIPT_TESTS=[
    ['Latn','Latin'],['Grek','Greek'],['Cyrl','Cyrillic'],['Armn','Armenian'],['Geor','Georgian'],
    ['Hebr','Hebrew'],['Arab','Arabic'],['Syrc','Syriac'],['Thaa','Thaana'],['Nkoo','Nko'],
    ['Adlm','Adlam'],['Rohg','Hanifi_Rohingya'],['Deva','Devanagari'],['Beng','Bengali'],['Guru','Gurmukhi'],
    ['Gujr','Gujarati'],['Orya','Oriya'],['Taml','Tamil'],['Telu','Telugu'],['Knda','Kannada'],['Mlym','Malayalam'],
    ['Sinh','Sinhala'],['Thai','Thai'],['Laoo','Lao'],['Mymr','Myanmar'],['Khmr','Khmer'],['Tibt','Tibetan'],
    ['Ethi','Ethiopic'],['Cher','Cherokee'],['Cans','Canadian_Aboriginal'],['Bopo','Bopomofo'],['Mong','Mongolian'],
    ['Hira','Hiragana'],['Kana','Katakana'],['Hang','Hangul'],['Hani','Han'],['Yiii','Yi'],['Vaii','Vai'],
    ['Copt','Coptic'],['Glag','Glagolitic'],['Goth','Gothic'],['Runr','Runic'],['Ogam','Ogham'],['Osma','Osmanya'],
    ['Mtei','Meetei_Mayek'],['Brah','Brahmi'],['Gran','Grantha'],['Shrd','Sharada'],['Sidd','Siddham'],['Modi','Modi'],
    ['Takr','Takri'],['Tirh','Tirhuta'],['Newa','Newa'],['Sora','Sora_Sompeng'],['Nshu','Nushu'],['Mend','Mende_Kikakui'],
    ['Kthi','Kaithi'],['Mahj','Mahajani'],['Mult','Multani'],['Dogr','Dogra'],['Gong','Gunjala_Gondi'],['Kawi','Kawi'],
    ['Nagm','Nag_Mundari'],['Toto','Toto'],['Bali','Balinese'],['Batk','Batak'],['Bugi','Buginese'],['Java','Javanese'],
    ['Kali','Kayah_Li'],['Lepc','Lepcha'],['Limb','Limbu'],['Olck','Ol_Chiki'],['Sund','Sundanese'],['Sylo','Syloti_Nagri'],
    ['Tale','Tai_Le'],['Talu','New_Tai_Lue'],['Tavt','Tai_Viet'],['Ugar','Ugaritic'],['Xsux','Cuneiform'],['Phnx','Phoenician']
  ];
  const HB_SCRIPT_PATTERNS=HB_SCRIPT_TESTS.flatMap(([tag,name])=>{try{return[[tag,new RegExp('\\p{Script='+name+'}','u')]];}catch(_){return[];}});
  function scriptTagForChar(ch){for(const [tag,re] of HB_SCRIPT_PATTERNS)if(re.test(ch))return tag;return'Zyyy';}
  function makeHarfBuzzRuns(text,explicitDirection='auto',explicitScript='auto',bidi=bidiModule){
    const chars=Array.from(String(text??''));if(!chars.length)return[];
    if(explicitDirection==='ttb')return[{text:chars.join(''),script:explicitScript==='auto'?'Zyyy':explicitScript,direction:'ttb',level:0}];
    let levels,mirrored=new Map(),baseLevel=explicitDirection==='rtl'?1:0,bidiResult=null;
    if(bidi){bidiResult=bidi.getEmbeddingLevels(chars.join(''),explicitDirection==='auto'?undefined:explicitDirection);levels=Uint8Array.from(bidiResult.levels);baseLevel=bidiResult.paragraphs?.[0]?.level??baseLevel;try{mirrored=bidi.getMirroredCharactersMap(chars.join(''),bidiResult.levels)||new Map();}catch(_){mirrored=new Map();}
      // UAX #9 L1: reset trailing whitespace in each paragraph to that
      // paragraph's base embedding level before applying run-level L2.
      for(const paragraph of bidiResult.paragraphs||[]){for(let cu=paragraph.end;cu>=paragraph.start;cu--){const ci=offsetsIndexForBidiCodeUnit(chars,cu);if(ci<0||!/[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u.test(chars[ci]))break;levels[cu]=paragraph.level;}}
    }
    else if(/[\u0590-\u08ff\ufb1d-\ufeff]/u.test(chars.join(''))){throw Error('Right-to-left text needs bidi-js for correct mixed-direction layout. Reconnect to the network and retry HarfBuzz.');}
    const offsets=[];let codeUnit=0;for(const ch of chars){offsets.push(codeUnit);codeUnit+=ch.length;}
    const scripts=chars.map(ch=>scriptTagForChar(ch));
    // Common punctuation/marks attach to the nearest same-direction script run.
    for(let i=0;i<scripts.length;i++)if(scripts[i]==='Zyyy'){
      const level=levels?.[offsets[i]]??baseLevel;let prior=null,next=null;
      for(let j=i-1;j>=0;j--)if(scripts[j]!=='Zyyy'&&(levels?.[offsets[j]]??baseLevel)===level){prior=scripts[j];break;}
      for(let j=i+1;j<scripts.length;j++)if(scripts[j]!=='Zyyy'&&(levels?.[offsets[j]]??baseLevel)===level){next=scripts[j];break;}
      scripts[i]=prior||next||'Zyyy';
    }
    const logical=[];
    for(let i=0;i<chars.length;i++){
      const level=levels?.[offsets[i]]??baseLevel,script=explicitScript==='auto'?scripts[i]:explicitScript,direction=(level&1)?'rtl':'ltr',replacement=mirrored.get?.(offsets[i])||chars[i],last=logical[logical.length-1];
      if(last&&last.level===level&&last.script===script&&last.direction===direction)last.text+=replacement;
      else logical.push({text:replacement,level,script,direction});
    }
    // UAX #9 rule L2 applied to script/direction runs (rather than UTF-16 code units).
    const maxLevel=Math.max(...logical.map(r=>r.level)),oddLevels=logical.filter(r=>r.level&1).map(r=>r.level),minOdd=oddLevels.length?Math.min(...oddLevels):Infinity;
    if(Number.isFinite(minOdd))for(let level=maxLevel;level>=minOdd;level--){let i=0;while(i<logical.length){while(i<logical.length&&logical[i].level<level)i++;let j=i;while(j<logical.length&&logical[j].level>=level)j++;if(j>i){const reversed=logical.slice(i,j).reverse();logical.splice(i,j-i,...reversed);}i=j;}}
    return logical;
  }
  async function initializeHarfBuzz(bust){
    if(!primaryFontBytes)throw Error('Upload a primary font first.');const hb=await ensureHarfBuzz(bust);try{await ensureBidi();}catch(err){bidiModule=null;}const bytes=primaryFontBytes.buffer.slice(primaryFontBytes.byteOffset,primaryFontBytes.byteOffset+primaryFontBytes.byteLength);hbFace=new hb.Face(new hb.Blob(bytes));hbFont=new hb.Font(hbFace);hbFont.setScale(hbFace.upem,hbFace.upem);hbAxes=Object.values(hbFace.getAxisInfos?.()||{});const savedAxes={...hbAxisValues};hbAxisValues={};hbAxes.forEach(a=>hbAxisValues[a.tag]=Number.isFinite(Number(savedAxes[a.tag]))?Number(savedAxes[a.tag]):a.default);buildAxisControls();E.hbStatus.textContent=hbAxes.length?`${hbAxes.length} variable axis/axes detected`:'Engine ready · static font';E.hbStatus.style.color='var(--good)';E.detectAxes.disabled=false;
  }
  function buildAxisControls(){E.axisControls.replaceChildren();if(!hbAxes.length){const note=document.createElement('div');note.className='hint';note.textContent='No variable-font axes were found in this file. HarfBuzz shaping can still improve complex-script layout.';E.axisControls.append(note);return;}hbAxes.forEach(axis=>{const row=document.createElement('div');row.className='axis-row';const label=document.createElement('label');label.textContent=axis.tag;label.title=`${axis.tag} · ${axis.min} to ${axis.max}`;const range=document.createElement('input');range.type='range';range.min=axis.min;range.max=axis.max;range.step=(axis.max-axis.min)/500||1;range.value=hbAxisValues[axis.tag]??axis.default;const output=document.createElement('output');output.textContent=fmt(range.value);range.addEventListener('input',()=>{hbAxisValues[axis.tag]=Number(range.value);output.textContent=fmt(range.value);applyHBAxes();render();});row.append(label,range,output);E.axisControls.append(row);});E.axisControls.classList.remove('hide');}
  function applyHBAxes(){if(!hbFont||!hbModule)return;const vars=hbAxes.map(a=>new hbModule.Variation(a.tag,Number(hbAxisValues[a.tag]??a.default)));hbFont.setVariations(vars);}
  E.detectAxes.addEventListener('click',async()=>{try{E.hbStatus.textContent='Loading HarfBuzz…';await initializeHarfBuzz();if(E.useHarfBuzz.checked){hbEnabled=true;render();}setStatus('HarfBuzz font inspection completed.','ok');}catch(err){E.hbStatus.textContent='Unavailable';setStatus('HarfBuzz could not load: '+err.message,'error');}});
  E.useHarfBuzz.addEventListener('change',async()=>{if(!E.useHarfBuzz.checked){hbEnabled=false;hbFont=null;hbFace=null;E.axisControls.classList.add('hide');E.detectAxes.disabled=true;E.hbStatus.textContent='HarfBuzz disabled';refreshGlyphControls();render();return;}try{E.hbStatus.textContent='Loading shaping engine…';await initializeHarfBuzz();hbEnabled=true;E.hbRetry.hidden=true;refreshGlyphControls();render();setStatus('HarfBuzz shaping enabled.','ok');}catch(err){E.useHarfBuzz.checked=false;hbEnabled=false;E.hbRetry.hidden=false;E.hbStatus.textContent='Unavailable';E.detectAxes.disabled=true;const ft=document.getElementById('fontTechSettings');if(ft)ft.open=true;setStatus('HarfBuzz could not be loaded; OpenType.js remains active. Click Retry to try again. '+err.message,'error');}});
  E.hbRetry.addEventListener('click',async()=>{if(!primaryFontBytes){setStatus('Upload a font first, then retry HarfBuzz shaping.','error');return;}E.hbRetry.hidden=true;E.hbStatus.textContent='Retrying HarfBuzz…';E.useHarfBuzz.checked=true;try{await initializeHarfBuzz(true);hbEnabled=true;E.detectAxes.disabled=false;refreshGlyphControls();render();setStatus('HarfBuzz shaping enabled.','ok');}catch(err){E.useHarfBuzz.checked=false;hbEnabled=false;E.hbRetry.hidden=false;E.hbStatus.textContent='Unavailable';const ft=document.getElementById('fontTechSettings');if(ft)ft.open=true;setStatus('HarfBuzz could not be loaded; OpenType.js remains active. '+err.message,'error');}});
  function measureHarfBuzzInk(shaped,engineFont,bb,baseScale,widthScale,weight){
    try{
      if(typeof Path2D!=='function')return null;
      const left=bb.x1*baseScale*widthScale,top=-bb.y2*baseScale;
      const artW=(bb.x2-bb.x1)*baseScale*widthScale+weight*widthScale,artH=(bb.y2-bb.y1)*baseScale+weight;
      if(!(artW>0&&artH>0))return null;
      const ratio=Math.min(12,Math.sqrt(900000/Math.max(1,artW*artH))),pad=4,canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.ceil(artW*ratio+pad*2));canvas.height=Math.max(1,Math.ceil(artH*ratio+pad*2));
      const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return null;
      ctx.setTransform(ratio*baseScale*widthScale,0,0,-ratio*baseScale,pad-left*ratio,pad-top*ratio);
      let penX=0,penY=0;const lineWidth=baseScale>0?weight/baseScale:0;
      for(let i=0;i<shaped.length;i++){
        const item=shaped[i],d=engineFont.glyphToPath(item.codepoint);
        if(d){ctx.save();ctx.translate(penX+(item.xOffset||0),penY+(item.yOffset||0));const path=new Path2D(d);ctx.fillStyle='#000';ctx.fill(path);if(lineWidth>0){ctx.strokeStyle='#000';ctx.lineWidth=lineWidth;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke(path);}ctx.restore();}
        penX+=item.xAdvance||0;penY+=item.yAdvance||0;
      }
      const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let total=0,sumX=0,sumY=0;
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const a=data[(y*canvas.width+x)*4+3]/255;if(a>0){total+=a;sumX+=(x+.5)*a;sumY+=(y+.5)*a;}}
      if(!total)return null;
      return{x:(sumX/total-pad)/ratio+left,y:(sumY/total-pad)/ratio+top,weight:total,method:'harfbuzz-alpha-mask'};
    }catch(_){return null;}
  }
  function buildHarfBuzzSvg(text,s,engineFont=hbFont,engineFace=hbFace){
    if(!hbModule||!engineFont||!engineFace)throw Error('HarfBuzz is not ready.');
    if(engineFont===hbFont)applyHBAxes();
    const runs=makeHarfBuzzRuns(text,E.textDirection.value,E.textScript.value,bidiModule),gapUnits=s.size?s.spacing*engineFace.upem/s.size:0,paths=[],inkGlyphs=[];let penX=0,penY=0,guardAdvance=0;
    if(!runs.length)throw Error('No text runs were produced for HarfBuzz.');
    for(const run of runs){
      const buffer=new hbModule.Buffer();buffer.addText(run.text);buffer.guessSegmentProperties();
      const direction=run.direction.toUpperCase(),directionEnum=hbModule.Direction||{},directionValue=directionEnum[direction]??({LTR:4,RTL:5,TTB:6,BTT:7}[direction]);if(directionValue===undefined)throw Error('HarfBuzz does not support the '+direction+' direction.');
      if(typeof buffer.setDirection==='function')buffer.setDirection(directionValue);if(run.script&&run.script!=='Zyyy'&&typeof buffer.setScript==='function')buffer.setScript(run.script);
      hbModule.shape(engineFont,buffer);const shaped=buffer.getGlyphInfosAndPositions();if(!shaped.length)continue;
      let rawAdvance=0,clusterGaps=0;for(let i=0;i<shaped.length;i++){rawAdvance+=shaped[i].xAdvance||0;const next=shaped[i+1];if(next&&shaped[i].cluster!==undefined&&next.cluster!==undefined&&next.cluster!==shaped[i].cluster)clusterGaps++;}
      const sign=Math.sign(rawAdvance)||(run.direction==='rtl'?-1:1),absoluteAdvance=Math.abs(rawAdvance),runWidth=Math.max(0,absoluteAdvance+clusterGaps*gapUnits);
      guardAdvance+=absoluteAdvance+clusterGaps*Math.abs(gapUnits);
      if(s.autoSize&&guardAdvance*(s.size/engineFace.upem)*s.widthScale+s.weight*s.widthScale+s.pads.left+s.pads.right>5000)throw Error('This line is about '+Math.round(guardAdvance*(s.size/engineFace.upem)*s.widthScale+s.weight*s.widthScale+s.pads.left+s.pads.right)+'px wide after script shaping, tracking, stroke and padding. Split it into several lines or use fixed-width mode.');
      let localX=sign<0?runWidth:0,localY=0;
      for(let i=0;i<shaped.length;i++){
        const item=shaped[i],d=engineFont.glyphToPath(item.codepoint),gx=penX+localX+(item.xOffset||0),gy=penY+localY+(item.yOffset||0);
        if(d){paths.push(`<g transform="translate(${cleanNum(gx)} ${cleanNum(gy)})"><path d="${d}"/></g>`);inkGlyphs.push({codepoint:item.codepoint,xAdvance:0,yAdvance:0,xOffset:gx,yOffset:gy});}
        localX+=item.xAdvance||0;localY+=item.yAdvance||0;const next=shaped[i+1],sameCluster=next&&item.cluster!==undefined&&next.cluster!==undefined&&item.cluster===next.cluster;if(i<shaped.length-1&&!sameCluster)localX+=sign*gapUnits;
      }
      penX+=runWidth;
    }
    if(!paths.length)throw Error('HarfBuzz did not produce any glyph outlines.');
    const markup=paths.join('');
    const temp=document.createElementNS('http://www.w3.org/2000/svg','svg');temp.setAttribute('xmlns','http://www.w3.org/2000/svg');temp.setAttribute('width','100000');temp.setAttribute('height','100000');temp.style.cssText='position:fixed;left:-120000px;top:-120000px;visibility:hidden;overflow:visible';temp.innerHTML=markup;document.body.appendChild(temp);
    let bb;try{const g=temp.getBBox();bb={x1:g.x,y1:g.y,x2:g.x+g.width,y2:g.y+g.height};}finally{temp.remove();}
    if(!(bb.x2>bb.x1&&bb.y2>bb.y1))throw Error('HarfBuzz outlines have no measurable bounds.');
    const baseScale=s.size/engineFace.upem,halfX=s.weight*s.widthScale/2,halfY=s.weight/2,metrics=fontVerticalMetrics(font,s.size);
    const vis={x1:bb.x1*baseScale*s.widthScale-halfX,x2:bb.x2*baseScale*s.widthScale+halfX,y1:-bb.y2*baseScale-halfY,y2:-bb.y1*baseScale+halfY};
    const ink=measureHarfBuzzInk(inkGlyphs,engineFont,bb,baseScale,s.widthScale,s.weight);
    const artW=vis.x2-vis.x1,artH=vis.y2-vis.y1,h=s.h;
    const w=s.autoSize?Math.max(1,Math.ceil(artW+s.pads.left+s.pads.right)):s.w;if(s.autoSize&&Math.max(w,Math.ceil(artH+s.pads.top+s.pads.bottom))>5000)throw Error('Final HarfBuzz outline bounds plus padding exceed 5,000 px. Split the text or use fixed-width mode.');
    const innerW=w-s.pads.left-s.pads.right,innerH=h-s.pads.top-s.pads.bottom;
    if(innerW<0||innerH<0)throw Error('Canvas padding is larger than the available canvas area.');
    const horizontalBasis=s.autoSize?'visible':(s.horizontalBasis==='reference'?'visible':(s.horizontalBasis||'visible'));
    const runStart=0,runEnd=penX,advStart=runStart*baseScale*s.widthScale,advEnd=runEnd*baseScale*s.widthScale;
    let x1=vis.x1,x2=vis.x2,anchorX=(x1+x2)/2;
    if(horizontalBasis==='advance'){x1=advStart;x2=advEnd;anchorX=(x1+x2)/2;}
    let dx;
    if(s.autoSize)dx=s.pads.left-vis.x1;
    else if(s.hAlign==='start')dx=s.pads.left-x1;
    else if(s.hAlign==='end')dx=w-s.pads.right-x2;
    else dx=s.pads.left+innerW/2-anchorX;

    const basis=s.verticalBasis||'baseline';
    const verticalAnchor=basis==='baseline'?0:basis==='cap-center'?-metrics.capHeight/2:basis==='x-center'?-metrics.xHeight/2:basis==='ink'?(ink?.y??(vis.y1+vis.y2)/2):(vis.y1+vis.y2)/2;
    let targetY;
    if(basis==='baseline'){
      if(Number.isFinite(s.baselineTarget))targetY=s.baselineTarget;
      else if(s.vAlign==='start')targetY=s.pads.top+metrics.ascender+halfY;
      else if(s.vAlign==='end')targetY=h-s.pads.bottom-metrics.descender-halfY;
      else targetY=s.pads.top+innerH/2+metrics.capHeight/2;
    }else if(basis==='cap-center'||basis==='x-center'){
      const height=basis==='cap-center'?metrics.capHeight:metrics.xHeight;
      targetY=s.vAlign==='start'?s.pads.top+height/2:s.vAlign==='end'?h-s.pads.bottom-height/2:s.pads.top+innerH/2;
    }else if(basis==='ink'&&ink){
      targetY=s.vAlign==='start'?s.pads.top+(verticalAnchor-vis.y1):s.vAlign==='end'?h-s.pads.bottom-(vis.y2-verticalAnchor):s.pads.top+innerH/2;
    }else{
      targetY=s.vAlign==='start'?s.pads.top+(verticalAnchor-vis.y1):s.vAlign==='end'?h-s.pads.bottom-(vis.y2-verticalAnchor):s.pads.top+innerH/2;
    }
    const dy=targetY-verticalAnchor+(Number(s.opticalFineTune)||0);
    const finalBounds={x1:dx+vis.x1,x2:dx+vis.x2,y1:dy+vis.y1,y2:dy+vis.y2};
    const clearances={left:finalBounds.x1,right:w-finalBounds.x2,top:finalBounds.y1,bottom:h-finalBounds.y2};
    const outOfCanvas=Object.values(clearances).some(v=>v<-.01);
    const transform=`translate(${cleanNum(dx)} ${cleanNum(dy)}) scale(${cleanNum(baseScale*s.widthScale)} ${cleanNum(-baseScale)})`;
    const alpha=cleanNum(Math.max(0,Math.min(1,Number(s.fillAlpha??1))));
    const stroke=s.weight?` stroke="${s.fill}" stroke-opacity="${alpha}" stroke-width="${cleanNum(s.weight/baseScale)}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke fill"`:'';
    const background=s.transparent?'':`<rect width="${w}" height="${h}" fill="${s.bg}" fill-opacity="${cleanNum(s.bgAlpha??1)}"/>`;
    const ext=engineFont.hExtents?.()||{};
    const metadata=makeTypographyMetadata({text,s,fontObj:font,metrics,dx,dy,advance:(runEnd-runStart)*baseScale,referenceGlyph:null,referenceGlyphIndex:null,referenceBounds:null,ink,horizontalBasis,verticalBasis:basis});
    const meta=esc(JSON.stringify(metadata));
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><metadata id="glyph-studio-typography" data-gsp-kind="typography">${meta}</metadata>${background}<g transform="${transform}">${markup.replace(/<path /g,`<path fill="${s.fill}" fill-opacity="${alpha}"${stroke} `)}</g></svg>`;
    return {svg,w,h,transform,markup,bounds:bb,advance:(runEnd-runStart)*baseScale*s.widthScale,artworkWidth:artW,artworkHeight:artH,scale:baseScale,dx,dy,baseScale,ascender:Number(ext.ascender)||metrics.ascender,descender:Number(ext.descender)||-metrics.descender,upem:engineFace.upem,clearances,outOfCanvas,typography:metadata,ink,verticalBasis:basis};
  }
  function renderHarfBuzz(){
    try{const s=getSettings(),text=E.text.value.split(/\r?\n/).find(x=>x.trim())||'';if(!text.trim())throw Error('Enter some text to preview.');const r=buildHarfBuzzSvg(text,s);currentSvg=r.svg;optimizedSvgCache='';E.optimizedPreview.classList.add('hide');E.optimizationReport.textContent='Optimisation has not been run for this version.';E.preview.setAttribute('viewBox',`0 0 ${r.w} ${r.h}`);E.preview.setAttribute('width',r.w);E.preview.setAttribute('height',r.h);E.preview.innerHTML=r.svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1]||'';addAlignmentGuides(E.preview,r,s);setArtboardRatio(E.artboard,r);E.artboard.classList.remove('empty');E.source.value=currentSvg;setButtons(true);E.dimensions.textContent=`${r.w} × ${r.h} px`;E.primaryStageName.textContent=`Primary · ${fontName} · HarfBuzz`;E.fontMeta.innerHTML=`Font <strong>${esc(fontName)}</strong> · HarfBuzz`;E.boundsMeta.innerHTML=`Artwork <strong>${fmt(r.artworkWidth)} × ${fmt(r.artworkHeight)} px</strong>`;E.measureWidth.textContent=fmt(r.artworkWidth)+' px';E.measureHeight.textContent=fmt(r.artworkHeight)+' px';E.measureAdvance.textContent=fmt(r.advance)+' px';E.measureAscender.textContent=r.ascender?fmt(r.ascender*r.baseScale)+' px':'—';E.measureDescender.textContent=r.descender?fmt(r.descender*r.baseScale)+' px':'—';E.measureUpem.textContent=String(r.upem||hbFace.upem);E.outputMeta.textContent=`Clearance · L ${fmt(r.clearances.left)} · R ${fmt(r.clearances.right)} · T ${fmt(r.clearances.top)} · B ${fmt(r.clearances.bottom)}`;E.pathInspector.style.display='none';E.compareStage.classList.add('hide');E.previewGrid.classList.toggle('comparing',comparisonFonts.length>0);renderComparisonCards(text,s);E.generateVariants.disabled=!font||!window.JSZip;E.optimizeDownload.disabled=false;E.optimizeZip.disabled=false;E.compareOptimized.disabled=false;E.referenceLayer.classList.toggle('visible',!!referenceUrl&&E.showReference.checked);setStatus(r.outOfCanvas?'Text extends outside the canvas. Increase canvas size or reduce padding; font size has been preserved.':'Preview updated with HarfBuzz shaping and the selected typography alignment.','ok');}catch(err){currentSvg='';optimizedSvgCache='';setButtons(false);E.optimizeDownload.disabled=true;E.optimizeZip.disabled=true;E.compareOptimized.disabled=true;clearArtworkState();setStatus('HarfBuzz: '+err.message,'error');}
  }
  const renderOpenType=render;render=function(){if(hbEnabled&&hbFont)renderHarfBuzz();else renderOpenType();};
  function buildActiveSvg(text,s){return hbEnabled&&hbFont?buildHarfBuzzSvg(text,s):buildSvg(text,s,font);}

  // SVG optimiser is deliberately loaded only after the user requests it.
  let svgoModule=null,svgoLoadPromise=null,optimizedSvgCache='';
  async function loadSVGO(){
    if(svgoModule)return svgoModule;
    if(svgoLoadPromise)return svgoLoadPromise;
    svgoLoadPromise=(async()=>{
      let lastError;
      for(const url of ['js/vendor/svgo.browser.js','https://cdn.jsdelivr.net/npm/svgo@4.1.0/dist/svgo.browser.js','https://unpkg.com/svgo@4.1.0/dist/svgo.browser.js']){
        try{const mod=await importWithTimeout(url,6000);if(typeof mod.optimize!=='function')throw Error('SVGO browser bundle does not expose optimize().');svgoModule=mod;return mod;}
        catch(err){lastError=err;}
      }
      throw lastError||Error('SVGO could not be loaded.');
    })();
    try{return await svgoLoadPromise;}finally{svgoLoadPromise=null;}
  }
  function updateOptimizationControls(){
    const level=E.optimizeLevel.value;
    E.pathPrecision.disabled=level==='safe';
    E.optimizationHint.textContent=level==='safe'
      ?'Safe removes redundant markup and metadata while preserving the original path commands. Precision applies to Balanced and Aggressive only.'
      :level==='balanced'
        ?'Balanced also rewrites path coordinates to the selected precision. Review the preview because path data may change slightly.'
        :'Aggressive enables multi-pass optimisation and path rewriting. It may change geometry slightly; keep the original when exact fidelity matters.';
  }
  E.optimizeLevel.addEventListener('change',updateOptimizationControls);
  updateOptimizationControls();
  async function optimizeSvg(source){
    const svgo=await loadSVGO(),level=E.optimizeLevel.value,precision=Number(E.pathPrecision.value)||3;
    const overrides={removeViewBox:false,cleanupIds:false,convertShapeToPath:false,removeMetadata:false};
    if(level==='safe'){
      Object.assign(overrides,{convertPathData:false,convertTransform:false,collapseGroups:false,mergePaths:false,cleanupNumericValues:false});
    }else{
      overrides.convertPathData={floatPrecision:precision};
      overrides.cleanupNumericValues={floatPrecision:precision};
    }
    const config={multipass:level==='aggressive',plugins:[{name:'preset-default',params:{overrides}}]};
    const result=svgo.optimize(source,config);
    if(!result||typeof result.data!=='string')throw Error('SVGO returned an invalid result.');
    return result.data;
  }
  function svgBytes(str){return new TextEncoder().encode(str).length;}
  function previewSvgIn(target,svg){const doc=new DOMParser().parseFromString(svg,'image/svg+xml');if(doc.querySelector('parsererror'))throw Error('Could not parse optimised SVG.');target.replaceChildren();const root=doc.documentElement;const node=document.importNode(root,true);node.style.width='100%';node.style.height='auto';node.style.maxHeight='120px';target.appendChild(node);}
  async function runOptimization(){
    if(!currentSvg)throw Error('Generate an SVG first.');
    const text=E.text.value.split(/\r?\n/).find(x=>x.trim())||'text';
    // Optimise the exact selected export representation (editable text or paths),
    // not always the path-only live preview.
    const original=getTextExport(text,getSettings()),out=await optimizeSvg(original);
    const a=svgBytes(original),b=svgBytes(out),delta=a-b,pct=a?delta/a*100:0;optimizedSvgCache=out;
    const origDoc=new DOMParser().parseFromString(original,'image/svg+xml'),optDoc=new DOMParser().parseFromString(out,'image/svg+xml');
    if(origDoc.querySelector('parsererror')||optDoc.querySelector('parsererror')||optDoc.documentElement.localName!=='svg')throw Error('SVGO returned invalid SVG XML.');
    const origPath=[...origDoc.querySelectorAll('path')].map(p=>p.getAttribute('d')||''),optPath=[...optDoc.querySelectorAll('path')].map(p=>p.getAttribute('d')||'');
    const pathState=origPath.length||optPath.length?(JSON.stringify(origPath)===JSON.stringify(optPath)?'unchanged':'rewritten by SVGO'):'not applicable (editable text output)';
    E.optimizationReport.textContent=`Original: ${a.toLocaleString()} bytes\nOptimised: ${b.toLocaleString()} bytes\n${delta>=0?'Saved':'Added'}: ${Math.abs(delta).toLocaleString()} bytes (${Math.abs(pct).toFixed(1)}%)\nPath data: ${pathState}\nViewBox: ${optDoc.documentElement.getAttribute('viewBox')||'not present'}\n\nA rewritten path string does not necessarily mean the visible geometry changed. Review the preview before using the optimised file.`;
    E.originalSize.textContent=`${a.toLocaleString()} B`;E.optimizedSize.textContent=`${b.toLocaleString()} B`;
    previewSvgIn(E.originalOptPreview,original);previewSvgIn(E.optimizedOptPreview,out);return out;
  }
  E.optimizeDownload.addEventListener('click',async()=>{try{E.optimizationReport.textContent='Optimising…';const out=await runOptimization(),t=E.text.value.split(/\r?\n/).find(x=>x.trim())||'text';downloadBlob(new Blob([out],{type:'image/svg+xml'}),safeName(t)+'_optimized.svg');setStatus('Optimised SVG downloaded. Original remains unchanged.','ok');}catch(err){E.optimizationReport.textContent='Optimisation unavailable: '+err.message;setStatus('SVGO error: '+err.message,'error');}});
  E.compareOptimized.addEventListener('click',async()=>{try{await runOptimization();E.optimizedPreview.classList.remove('hide');setStatus('Original and optimised previews are ready.','ok');}catch(err){E.optimizationReport.textContent='Optimisation unavailable: '+err.message;setStatus('SVGO error: '+err.message,'error');}});
  E.optimizeZip.addEventListener('click',async()=>{try{if(!window.JSZip)throw Error('JSZip is unavailable.');const s=getSettings(),lines=E.text.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!lines.length)throw Error('Enter at least one label.');const zip=new JSZip(),counts={};for(const line of lines){const base=safeName(line);counts[base]=(counts[base]||0)+1;const name=base+(counts[base]>1?'_'+counts[base]:'')+'_optimized.svg';const original=getTextExport(line,s);zip.file(name,await optimizeSvg(original));}downloadBlob(await zip.generateAsync({type:'blob'}),'glyph-studio-optimized.zip');setStatus(`Optimised ZIP created with ${lines.length} SVG(s). Original export remains available.`, 'ok');}catch(err){setStatus('Optimised ZIP: '+err.message,'error');}});

  // Keep the primary export path original by default; only explicit optimise actions invoke SVGO.
  E.compareFile.setAttribute('multiple','multiple');E.generateVariants.disabled=!font||!window.JSZip;E.exportCompareSheet.disabled=!comparisonFonts.length;
  E.referenceDifference.addEventListener('change',updateReferenceTransform);

  window.addEventListener('beforeunload',()=>{if(referenceUrl)URL.revokeObjectURL(referenceUrl);});
  refreshGlyphControls(true);
  render();
  lastState=captureState();
})();

/* GSP 0.6.53: icon-to-icon visible-height matching is independent of text cap-height matching. */

