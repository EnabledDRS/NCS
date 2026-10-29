'use strict';
// Coordinates use the original image proportions so notes survive layout changes.
const Ink=(()=>{
 const DB='ncs-handwriting-v1',surfaces=new Set();
 let enabled=true,color='#2563eb',width=3,eraser=false,active=null,dispose=()=>{};
 const ready=new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('notes',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 ready.catch(()=>{});
 async function read(id){const db=await ready;return new Promise((resolve,reject)=>{const r=db.transaction('notes').objectStore('notes').get(id);r.onsuccess=()=>resolve(r.result?.strokes||[]);r.onerror=()=>reject(r.error);});}
 async function write(s){try{const db=await ready;await new Promise((resolve,reject)=>{const tx=db.transaction('notes','readwrite');tx.objectStore('notes').put({id:s.key,strokes:s.strokes,at:Date.now()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}catch{notify('필기를 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.');}}
 function controls(){const bar=document.querySelector('.ink-tools');if(!bar)return;bar.querySelector('[data-ink="toggle"]').textContent=enabled?'✎ 필기 켜짐':'필기 꺼짐';bar.querySelector('[data-ink="toggle"]').setAttribute('aria-pressed',enabled);bar.querySelector('[data-ink="eraser"]').setAttribute('aria-pressed',eraser);bar.querySelector('[data-ink="undo"]').disabled=!active?.undo.length;bar.querySelector('[data-ink="redo"]').disabled=!active?.redo.length;for(const s of surfaces){s.canvas.hidden=!enabled;s.wrapper.classList.toggle('ink-on',enabled);}}
 function draw(s){const c=s.canvas,ctx=c.getContext('2d'),r=c.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,3);if(!r.width||!r.height)return;const w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(c.width!==w||c.height!==h){c.width=w;c.height=h;}ctx.setTransform(w,0,0,h,0,0);ctx.clearRect(0,0,1,1);ctx.lineCap='round';ctx.lineJoin='round';for(const stroke of [...s.strokes,...(s.pending?[s.pending]:[])]){ctx.strokeStyle=stroke.color;ctx.fillStyle=stroke.color;ctx.lineWidth=stroke.width;const p=stroke.points;if(!p.length)continue;if(p.length===1){ctx.beginPath();ctx.ellipse(p[0][0],p[0][1],stroke.width/2,stroke.width*s.ratio/2,0,0,Math.PI*2);ctx.fill();continue;}ctx.save();ctx.setTransform(w,0,0,w,0,0);ctx.beginPath();ctx.moveTo(p[0][0],p[0][1]/s.ratio);for(let i=1;i<p.length;i++)ctx.lineTo(p[i][0],p[i][1]/s.ratio);ctx.stroke();ctx.restore();}}
 function snapshot(s){s.undo.push(s.strokes.slice());if(s.undo.length>40)s.undo.shift();s.redo=[];}
 function changed(s){draw(s);controls();write(s);}
 function distance(p,a,b,ratio){const px=p[0],py=p[1]/ratio,ax=a[0],ay=a[1]/ratio,bx=b[0],by=b[1]/ratio,dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(px-ax-t*dx,py-ay-t*dy);}
 function eraseAt(s,p){s.strokes=s.strokes.filter(stroke=>!stroke.points.some((a,i)=>distance(p,a,stroke.points[Math.max(0,i-1)],s.ratio)<.018+stroke.width/2));}
 const penEraser=e=>e.pointerType==='pen'&&((e.buttons&34)!==0||(e.buttons===undefined&&(e.button===2||e.button===5)));
 const contact=e=>e.pointerType!=='pen'||e.pressure>0||(e.buttons&33)!==0||(e.buttons===undefined&&e.button===0);
 function mount(){
  dispose();surfaces.clear();active=null;const targets=[...app.querySelectorAll('.source-image')].filter(img=>!img.closest('.explanation'));
  if(!targets.length)return;
  const bar=document.createElement('div');bar.className='ink-tools';bar.setAttribute('aria-label','문제 필기 도구');bar.innerHTML=`<div class="ink-buttons"><button type="button" data-ink="toggle" aria-pressed="true">✎ 필기 켜짐</button><label>색상 <input type="color" value="${color}" aria-label="필기 색상"></label><label>굵기 <select aria-label="필기 굵기"><option value="2">가는 펜</option><option value="3">보통 펜</option><option value="5">굵은 펜</option></select></label><button type="button" data-ink="eraser" aria-pressed="false">지우개</button><button type="button" data-ink="undo" disabled>되돌리기</button><button type="button" data-ink="redo" disabled>다시 실행</button><button type="button" data-ink="clear">이 문제 필기 지우기</button></div><p>문제·지문에 S펜으로 필기 · S펜 버튼을 누른 채 문지르면 지우기 · 손가락은 스크롤<br>필기는 이 기기에 자동 저장됩니다. 지우개는 닿은 획을 지웁니다. 정답은 아래에서 터치하세요.</p>`;
  const first=app.querySelector('.common')||app.querySelector('.source-hint');first.before(bar);
  const diagnostic=document.createElement('details');diagnostic.className='ink-diagnostic';const summary=document.createElement('summary');summary.textContent='S펜이 안 될 때 · 입력 확인';const output=document.createElement('pre');output.textContent='버전 20261029-3\n이 창을 연 채 문제 위에 S펜을 대고, 옆 버튼을 눌렀다 놓아 보세요.\n표시되는 내용을 복사해 알려주시면 원인을 확인할 수 있습니다.';diagnostic.append(summary);diagnostic.append(output);bar.append(diagnostic);
  const events=[];let lastReport=0;
  function report(e){if(!diagnostic.open)return;const now=Date.now();if(e.type==='pointermove'&&now-lastReport<150)return;lastReport=now;events.push(`${e.type||'pointer'} ${e.pointerType||'-'} button=${e.button??'-'} buttons=${e.buttons??'-'} pressure=${e.pressure??'-'} contact=${contact(e)?1:0} eraser=${penEraser(e)?1:0}`);if(events.length>8)events.shift();output.textContent='버전 20261029-3 · 브라우저 입력 확인\n'+events.join('\n');}
  bar.querySelector('select').value=String(width);bar.querySelector('select').onchange=e=>width=Number(e.target.value);bar.querySelector('input').oninput=e=>{color=e.target.value;eraser=false;controls();};
  bar.querySelector('[data-ink="toggle"]').onclick=()=>{enabled=!enabled;controls();for(const s of surfaces)draw(s);};
  bar.querySelector('[data-ink="eraser"]').onclick=()=>{eraser=!eraser;enabled=true;controls();};
  for(const name of ['undo','redo'])bar.querySelector(`[data-ink="${name}"]`).onclick=()=>{if(!active||!active[name].length)return;active[name==='undo'?'redo':'undo'].push(active.strokes.slice());active.strokes=active[name].pop();changed(active);};
  bar.querySelector('[data-ink="clear"]').onclick=async()=>{const current=[...surfaces];if(!current.some(s=>s.strokes.length))return;if(!await ask('이 문제와 공통 지문의 필기를 모두 지울까요?'))return;for(const s of current){snapshot(s);s.strokes=[];changed(s);}};
  const observer=new ResizeObserver(entries=>{for(const s of surfaces)if(entries.some(e=>e.target===s.wrapper))draw(s);});let alive=true;
  for(const img of targets){
   const wrapper=document.createElement('div');wrapper.className='ink-surface';img.before(wrapper);wrapper.append(img);const canvas=document.createElement('canvas');canvas.className='ink-canvas';canvas.setAttribute('aria-hidden','true');wrapper.append(canvas);const zoom=document.createElement('button');zoom.type='button';zoom.className='ink-zoom';zoom.textContent='원본 확대';zoom.onclick=()=>img.click();wrapper.after(zoom);
   const s={key:img.getAttribute('src'),wrapper,canvas,strokes:[],undo:[],redo:[],pending:null,ratio:1,pointer:null,loaded:false};surfaces.add(s);
   function size(){s.ratio=img.naturalWidth/(img.naturalHeight||1);draw(s);}img.addEventListener('load',size);if(img.complete)size();observer.observe(wrapper);
   read(s.key).then(strokes=>{if(!alive)return;s.strokes=strokes;s.loaded=true;draw(s);}).catch(()=>{notify('필기를 불러오지 못했습니다. 브라우저 저장소를 확인해 주세요.');});
   const point=e=>{const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];};
   // Pen hover/over occurs before contact; disable native gestures only for the pen.
   canvas.onpointerover=e=>{report(e);if(e.pointerType==='pen'||e.pointerType==='mouse')canvas.style.touchAction='none';else if(s.pointer===null)canvas.style.touchAction='pan-y pinch-zoom';};
   canvas.onpointerleave=()=>{if(s.pointer===null)canvas.style.touchAction='pan-y pinch-zoom';};
   canvas.oncontextmenu=e=>{report(e);e.preventDefault();};
   canvas.onpointerdown=e=>{report(e);if(!enabled||!s.loaded||e.pointerType==='touch'||s.pointer!==null||!contact(e)||(e.pointerType!=='pen'&&e.button!==0))return;e.preventDefault();active=s;s.pointer=e.pointerId;canvas.setPointerCapture(e.pointerId);snapshot(s);s.erasing=eraser||penEraser(e);if(s.erasing)eraseAt(s,point(e));else s.pending={color,width:width/800,points:[point(e)]};draw(s);controls();};
   canvas.onpointermove=e=>{
    report(e);
    // A barrel button can start a pointer while hovering. Start ink only on tip contact.
    if(s.pointer===null&&e.pointerType==='pen'&&contact(e))canvas.onpointerdown(e);
    if(e.pointerId!==s.pointer)return;if(!contact(e)){end(e);return;}e.preventDefault();
    const nextErase=eraser||penEraser(e);
    if(nextErase!==s.erasing){if(s.pending)s.strokes.push(s.pending);s.pending=nextErase?null:{color,width:width/800,points:[point(e)]};s.erasing=nextErase;}
    const events=e.getCoalescedEvents?.()||[e];for(const ev of events){const p=point(ev);if(s.erasing)eraseAt(s,p);else if(s.pending&&s.pending.points.length<12000)s.pending.points.push(p);}draw(s);
   };
   function end(e){report(e);if(e.pointerId!==s.pointer)return;if(s.pending)s.strokes.push(s.pending);s.pending=null;s.pointer=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);changed(s);}
   canvas.onpointerup=end;canvas.onpointercancel=end;canvas.onlostpointercapture=end;
  }
  dispose=()=>{alive=false;observer.disconnect();for(const s of surfaces){if(s.pending){s.strokes.push(s.pending);s.pending=null;write(s);}}};controls();
 }
 return {mount,unmount(){dispose();surfaces.clear();active=null;}};
})();
