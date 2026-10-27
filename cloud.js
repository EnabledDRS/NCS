'use strict';
const CLOUD_URL='https://ncs-study-sync-enabled.limdaehyeon34.chatgpt.site/api/sync';
const CLOUD_STORE='ncs-cloud-code-v1';
let cloudAuth=null,cloudBusy=false,cloudQueued=false,cloudTimer,cloudLastSync=0,cloudError='',cloudSessionFingerprint='',cloudSessionAck=0;
const cloudHistoryAck=new Map();
try{const stored=JSON.parse(localStorage.getItem(CLOUD_STORE));if(stored&&/^[a-f0-9]{64}$/.test(stored.token))cloudAuth=stored;}catch{}
function sessionFingerprint(){const s=state.session;return s?JSON.stringify({ids:s.ids,index:s.index,responses:s.responses,drafts:s.drafts,finished:s.finished}):'null';}
function queueCloudSync(){
 const fingerprint=sessionFingerprint();if(fingerprint!==cloudSessionFingerprint){state.sessionAt=Math.max(Date.now(),(state.sessionAt||0)+1);cloudSessionFingerprint=fingerprint;}
 if(!cloudAuth)return;cloudQueued=true;clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>syncCloud(),700);cloudStatus();
}
function cloudStatus(){
 const button=$('#cloudStatus');if(!button)return;
 button.textContent=cloudAuth?(cloudBusy?'동기화 중…':cloudError?'저장 대기':cloudQueued?'저장 중…':'기기 연결됨'):'기기 연결';
 button.classList.toggle('connected',!!cloudAuth&&!cloudError);
 if($('#cloudConnection'))$('#cloudConnection').textContent=cloudAuth?`코드 끝 ${cloudAuth.hint} · ${cloudError|| (cloudLastSync?'최근 동기화 '+new Date(cloudLastSync).toLocaleTimeString('ko-KR'):'연결 중')}`:'아직 연결하지 않았습니다.';
}
async function cloudRequest(token,payload){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
 try{const response=await fetch(CLOUD_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload),signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error(response.status===429?'요청이 많습니다. 잠시 뒤 다시 시도해 주세요.':'온라인 저장에 연결하지 못했습니다.');return await response.json();}finally{clearTimeout(timeout);}
}
function mergeCloud(data){
 let changed=false;for(const[id,h]of Object.entries(data.history||{}))if(bank.some(q=>q.id===id)&&(!state.history[id]||h.at>state.history[id].at)){state.history[id]=h;changed=true;}
 if(data.session&&data.sessionAt>(state.sessionAt||0)&&data.session.ids.every(id=>bank.some(q=>q.id===id))){state.session=data.session;state.sessionAt=data.sessionAt;cloudSessionFingerprint=sessionFingerprint();changed=true;}
 for(const[id,h]of Object.entries(data.history||{}))cloudHistoryAck.set(id,h.at);
 cloudSessionAck=data.sessionAt||0;
 try{localStorage.setItem(STORE,JSON.stringify(state));}catch{}
 if(changed){const y=window.scrollY;if(view==='home')home();else if(view==='quiz')quiz();else if(view==='results')results();window.scrollTo({top:y,behavior:'instant'});}
}
function cloudPayload(){
 const history={};for(const[id,h]of Object.entries(state.history))if(h.at>(cloudHistoryAck.get(id)||0))history[id]=h;
 const payload={history};if(state.session&&(state.sessionAt||0)>cloudSessionAck){payload.session=structuredClone(state.session);payload.sessionAt=state.sessionAt;}
 return payload;
}
async function syncCloud(){
 if(!cloudAuth||!bank.length)return;if(cloudBusy){cloudQueued=true;return;}
 if(!navigator.onLine){cloudError='오프라인: 연결되면 자동 저장합니다.';cloudStatus();return;}
 cloudBusy=true;cloudQueued=false;cloudStatus();const token=cloudAuth.token;
 try{const data=await cloudRequest(token,cloudPayload());if(!cloudAuth||cloudAuth.token!==token)return;if(!data.exists)throw Error('코드 연결을 다시 확인해 주세요.');mergeCloud(data);cloudLastSync=Date.now();cloudError='';}
 catch(error){cloudError=error.name==='AbortError'?'연결 지연: 잠시 뒤 다시 저장합니다.':error.message;}
 finally{cloudBusy=false;cloudStatus();if(cloudQueued){clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>syncCloud(),1000);}}
}
async function deriveCloudToken(code){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(code),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode('NCS-study-sync-code-v1'),iterations:100000,hash:'SHA-256'},key,256);return Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('');}
function openCloud(){
 const dialog=$('#cloudDialog');$('#cloudInput').value='';$('#cloudMessage').textContent='';$('#cloudConnectedActions').hidden=!cloudAuth;cloudStatus();dialog.showModal();
}
async function connectCloud(){
 const code=$('#cloudInput').value.trim().toUpperCase();if(!/^[A-Z0-9]{8}$/.test(code)){$('#cloudMessage').textContent='영문·숫자 8자리 코드를 입력해 주세요.';return;}
 const button=$('#cloudConnect');button.disabled=true;$('#cloudMessage').textContent='코드와 기록을 확인하고 있습니다…';
 try{
  const token=await deriveCloudToken(code);let data=await cloudRequest(token,{});
  if(!data.exists){const allowed=await ask('아직 사용하지 않은 코드입니다. 이 코드로 새 기록 공간을 만들까요? 기존 코드를 입력한 것이라면 철자를 확인해 주세요.');if(!allowed){$('#cloudMessage').textContent='코드를 확인한 뒤 다시 연결해 주세요.';return;}data=await cloudRequest(token,{create:true});}
  cloudAuth={token,hint:code.slice(-2)};localStorage.setItem(CLOUD_STORE,JSON.stringify(cloudAuth));cloudHistoryAck.clear();cloudSessionAck=0;
  mergeCloud(data);cloudError='';$('#cloudInput').value='';$('#cloudDialog').close();await syncCloud();notify(cloudError?'코드가 연결되었습니다. 연결되면 기록을 저장합니다.':'기기가 연결되었습니다. 같은 코드로 다른 기기에서 이어 풀 수 있습니다.');
 }catch(error){$('#cloudMessage').textContent=error.name==='AbortError'?'연결 시간이 초과됐습니다. 다시 시도해 주세요.':error.message;}
 finally{button.disabled=false;cloudStatus();}
}
function newCloudCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const bytes=crypto.getRandomValues(new Uint8Array(8));const code=Array.from(bytes,b=>alphabet[b%alphabet.length]).join('');$('#cloudInput').value=code;$('#cloudInput').type='text';$('#cloudReveal').checked=true;$('#cloudMessage').textContent='이 코드를 기억해 두세요. 다른 기기에서도 같은 코드를 입력합니다.';}
async function disconnectCloud(){if(!await ask('이 기기의 코드 연결을 해제할까요? 온라인 기록과 이 기기의 학습 기록은 그대로 남습니다.'))return;cloudAuth=null;cloudHistoryAck.clear();cloudSessionAck=0;cloudError='';cloudQueued=false;clearTimeout(cloudTimer);try{localStorage.removeItem(CLOUD_STORE);}catch{}$('#cloudDialog').close();cloudStatus();notify('이 기기의 연결을 해제했습니다.');}
function setupCloud(){
 if($('#cloudStatus'))return;
 if(!Number.isSafeInteger(state.sessionAt))state.sessionAt=state.session?Math.max(state.session.startedAt||0,...state.session.ids.map(id=>state.history[id]?.at||0)):0;
 cloudSessionFingerprint=sessionFingerprint();
 const button=document.createElement('button');button.id='cloudStatus';button.className='text-button cloud-status';button.onclick=openCloud;$('.topbar').append(button);
 const dialog=document.createElement('dialog');dialog.id='cloudDialog';dialog.innerHTML=`<div class="cloud-content"><div class="section-head"><h2 class="section-title">어디서든, 이어서 풀기</h2><button class="text-button" id="cloudClose">닫기 ✕</button></div><p class="small">휴대폰과 태블릿에 같은 8자리 코드를 입력하면 학습 기록과 진행 중인 문제를 공유합니다.</p><p id="cloudConnection" class="cloud-connection"></p><label class="small" for="cloudInput">8자리 접속 코드 · 영문과 숫자, 대소문자 구분 없음</label><input id="cloudInput" class="cloud-input" type="password" minlength="8" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="8자리 코드"><label class="small cloud-reveal"><input id="cloudReveal" type="checkbox"> 코드 보기</label><p class="small">처음이라면 새 코드를 만들거나 직접 정하세요. 같은 코드를 아는 사람은 같은 기록을 읽고 변경할 수 있습니다. 이 기기의 기존 학습 기록도 함께 합칩니다.</p><p id="cloudMessage" class="cloud-message" role="status"></p><div class="cloud-actions"><button class="secondary" id="cloudGenerate">새 코드 만들기</button><button class="primary" id="cloudConnect">이 코드로 연결</button></div><div id="cloudConnectedActions" class="cloud-actions" hidden><button class="secondary" id="cloudNow">지금 동기화</button><button class="text-button" id="cloudDisconnect">이 기기 연결 해제</button></div><p class="small">코드를 잊으면 온라인 기록을 찾을 수 없습니다. 코드는 별도로 기억해 주세요. 연결이 끊겨도 이 기기에서 공부한 기록은 남고, 다시 연결되면 저장합니다.</p></div>`;document.body.append(dialog);
 $('#cloudClose').onclick=()=>dialog.close();$('#cloudConnect').onclick=connectCloud;$('#cloudGenerate').onclick=newCloudCode;$('#cloudDisconnect').onclick=disconnectCloud;$('#cloudNow').onclick=async()=>{await syncCloud();notify(cloudError||'최신 기록을 불러왔습니다.');};$('#cloudReveal').onchange=e=>$('#cloudInput').type=e.target.checked?'text':'password';$('#cloudInput').onkeydown=e=>{if(e.key==='Enter')connectCloud();};
 cloudStatus();if(!cloudAuth)openCloud();syncCloud();setInterval(()=>{if(!document.hidden)syncCloud();},20000);
 window.addEventListener('online',()=>syncCloud());document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncCloud();});
}
document.addEventListener('ncs:ready',setupCloud);if(bank.length)setupCloud();
