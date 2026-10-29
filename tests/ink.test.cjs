const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture({whale=false}={}){
 const saved=new Map(),canvases=[],bars=[];
 class Element{
  constructor(tag){this.tag=tag;this.style={};this.children=[];this.disabled=false;this.hidden=false;this.attrs={};this.width=0;this.height=0;this.rect={left:0,top:0,width:800,height:400};}
  setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}
  get classList(){return {toggle(){}};}before(){}after(){}append(e){this.children.push(e);}addEventListener(){}
  closest(s){return this.explanation&&s==='.explanation';}
  getBoundingClientRect(){return this.rect;}
  getContext(){return new Proxy({},{get:()=>()=>{}});}
  setPointerCapture(id){this.capture=id;}hasPointerCapture(id){return this.capture===id;}releasePointerCapture(){this.capture=null;}
  set innerHTML(v){this.html=v;this.elements={};for(const k of ['toggle','eraser','undo','redo','clear'])this.elements[`[data-ink="${k}"]`]=new Element('button');this.elements.select=new Element('select');this.elements.input=new Element('input');}
  querySelector(s){return this.elements[s];}
 }
 const images=['question','common','explanation'].map(name=>{const e=new Element('img');e.attrs.src=name;e.explanation=name==='explanation';e.naturalWidth=1600;e.naturalHeight=800;e.complete=true;return e;});
 const document={createElement(tag){const e=new Element(tag);if(tag==='canvas')canvases.push(e);return e;},querySelector(){return bars.at(-1);}};
 const app={querySelectorAll(){return images;},querySelector(){return {before(e){bars.push(e);}};}};
 const db={transaction(){const tx={objectStore(){return {get(id){const r={};setImmediate(()=>{r.result=saved.get(id);r.onsuccess();});return r;},put(value){saved.set(value.id,structuredClone(value));setImmediate(()=>tx.oncomplete());}};}};return tx;}};
 const indexedDB={open(){const r={};setImmediate(()=>{r.result=db;r.onsuccess();});return r;}};
 const context={indexedDB,document,app,navigator:{userAgent:whale?'Android Whale/3.0':'test'},ResizeObserver:class{observe(){}disconnect(){}},window:{devicePixelRatio:2},notify(){},ask:async()=>true};vm.createContext(context);vm.runInContext(fs.readFileSync('ink.js','utf8')+'\nthis.ink=Ink;',context);
 const event=(type,x,y,id=1)=>({pointerType:type,clientX:x,clientY:y,pointerId:id,button:0,preventDefault(){this.prevented=true;}});
 return {context,images,saved,canvases,bars,event,async mount(){context.ink.mount();await tick();await tick();await tick();}};
}
test('pen draws only on source images, touch is ignored, normalized notes persist across remounts',async()=>{
 const f=fixture();await f.mount();assert.equal(f.canvases.length,2,'no canvas over explanations or answer controls');const c=f.canvases[0];
 const finger=f.event('touch',100,100);c.onpointerdown(finger);c.onpointermove(finger);c.onpointerup(finger);await tick();assert.equal(f.saved.size,0);assert.equal(finger.prevented,undefined);
 c.onpointerover(f.event('pen',100,100));assert.equal(c.style.touchAction,'none');c.onpointerdown(f.event('pen',100,100));c.onpointermove(f.event('pen',400,200));c.onpointerup(f.event('pen',400,200));await tick();await tick();
 assert.deepEqual(f.saved.get('question').strokes[0].points,[[.125,.25],[.5,.5]]);
 f.context.ink.unmount();await f.mount();const restored=f.canvases[2];restored.onpointerdown(f.event('pen',10,10));restored.onpointerup(f.event('pen',10,10));await tick();await tick();assert.equal(f.saved.get('question').strokes.length,2,'saved first stroke restored before next stroke');
});
test('undo, redo and stroke eraser work independently of answer selection',async()=>{
 const f=fixture();await f.mount();const c=f.canvases[0],bar=f.bars[0];c.onpointerdown(f.event('pen',100,100));c.onpointermove(f.event('pen',400,100));c.onpointerup(f.event('pen',400,100));await tick();await tick();
 bar.querySelector('[data-ink="undo"]').onclick();await tick();await tick();assert.equal(f.saved.get('question').strokes.length,0);
 bar.querySelector('[data-ink="redo"]').onclick();await tick();await tick();assert.equal(f.saved.get('question').strokes.length,1);
 bar.querySelector('[data-ink="eraser"]').onclick();c.onpointerdown(f.event('pen',250,100));c.onpointerup(f.event('pen',250,100));await tick();await tick();assert.equal(f.saved.get('question').strokes.length,0);
 bar.querySelector('[data-ink="undo"]').onclick();await tick();await tick();assert.equal(f.saved.get('question').strokes.length,1);
});
test('S Pen barrel button temporarily erases, including toggles while the tip stays down',async()=>{
 const f=fixture();await f.mount();const c=f.canvases[0];
 const pen=(x,y,buttons=1,button=-1,pressure=.5)=>({...f.event('pen',x,y),buttons,button,pressure});
 c.onpointerdown(pen(100,100,1,0));c.onpointermove(pen(400,100));c.onpointerup(pen(400,100,0,0,0));await tick();await tick();
 c.onpointerdown(pen(250,100,3,2));c.onpointerup(pen(250,100,0,0,0));await tick();await tick();assert.equal(f.saved.get('question').strokes.length,0,'barrel button erases instead of right-clicking');
 c.onpointerdown(pen(100,100,1,0));c.onpointermove(pen(400,100));c.onpointermove(pen(250,100,3,2));c.onpointermove(pen(250,200,1,2));c.onpointermove(pen(400,200));c.onpointerup(pen(400,200,0,0,0));await tick();await tick();
 const strokes=f.saved.get('question').strokes;assert.equal(strokes.length,1);assert.equal(strokes[0].points[0][1],.5,'releasing barrel returns to pen with no joining line');
});
test('hovering barrel button does not erase; tip contact and inverted eraser do',async()=>{
 const f=fixture();await f.mount();const c=f.canvases[0],pen=(x,y,buttons,pressure,button=-1)=>({...f.event('pen',x,y),buttons,pressure,button});
 c.onpointerdown(pen(100,100,1,.5,0));c.onpointerup(pen(100,100,0,0,0));await tick();await tick();
 c.onpointerdown(pen(100,100,2,0,2));c.onpointermove(pen(100,100,2,0));await tick();assert.equal(f.saved.get('question').strokes.length,1);
 c.onpointermove(pen(100,100,3,.5));c.onpointermove(pen(100,100,2,0));await tick();await tick();assert.equal(f.saved.get('question').strokes.length,0);
 c.onpointerdown(pen(100,100,1,.5,0));c.onpointerup(pen(100,100,0,0,0));await tick();await tick();c.onpointerdown(pen(100,100,32,.5,5));c.onpointerup(pen(100,100,0,0,5));await tick();await tick();assert.equal(f.saved.get('question').strokes.length,0);
 let blocked=false;c.oncontextmenu({preventDefault(){blocked=true;}});assert.equal(blocked,true);
});
test('Whale hover button with buttons=1 arms eraser, pressure gates contact, release restores pen',async()=>{
 const f=fixture({whale:true});await f.mount();const c=f.canvases[0];
 const pen=(type,x,y,buttons,pressure,button=-1)=>({...f.event('pen',x,y),type,buttons,pressure,button});
 c.onpointerover(pen('pointerover',100,100,0,0));
 c.onpointerdown(pen('pointerdown',100,100,1,.4,0));c.onpointermove(pen('pointermove',400,100,1,.7));c.onpointerup(pen('pointerup',400,100,0,0,0));await tick();await tick();assert.equal(f.saved.get('question').strokes.length,1,'ordinary pressure draws');
 c.onpointerdown(pen('pointerdown',250,100,1,0,0));c.onpointermove(pen('pointermove',250,100,1,0));await tick();assert.equal(f.saved.get('question').strokes.length,1,'hover button never writes or erases');
 c.onpointermove(pen('pointermove',250,100,1,.3));c.onpointermove(pen('pointermove',250,100,1,0));await tick();await tick();assert.equal(f.saved.get('question').strokes.length,0,'same buttons=1 plus real pressure erases');
 c.onpointerup(pen('pointerup',250,100,0,0,0));
 c.onpointerdown(pen('pointerdown',100,200,1,.4,0));c.onpointermove(pen('pointermove',400,200,1,.6));c.onpointerup(pen('pointerup',400,200,0,0,0));await tick();await tick();assert.equal(f.saved.get('question').strokes.length,1,'release clears hover latch');assert.equal(f.saved.get('question').strokes[0].points[0][1],.5);
});
test('Whale hover button released without contact leaves saved notes unchanged',async()=>{
 const f=fixture({whale:true});await f.mount();const c=f.canvases[0];const pen=(type,buttons,pressure,button=0)=>({...f.event('pen',100,100),type,buttons,pressure,button});
 c.onpointerdown(pen('pointerdown',1,0));c.onpointerup(pen('pointerup',0,0));await tick();assert.equal(f.saved.size,0);
 c.onpointerdown(pen('pointerdown',1,.5));c.onpointerup(pen('pointerup',0,0));await tick();await tick();assert.equal(f.saved.get('question').strokes.length,1);
});
