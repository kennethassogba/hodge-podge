
const $ = id => document.getElementById(id);
let state = { threads: [], messages: [], notes: [], decisions: [], threadId: null };
let authenticated = false, initialized = false, busy = false, editingNote = null, call = null, pendingSave = null;
const date = ms => new Intl.DateTimeFormat('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }).format(ms);
function error(message='',tone='error') { $('error').textContent = message; $('error').hidden = !message; $('error').dataset.tone=tone; }
async function api(path, data, method = data ? 'POST' : 'GET') {
  const response = await fetch(`/api/${path}`, {method,headers:data ? {'Content-Type':'application/json'} : {},body:data ? JSON.stringify(data) : undefined});
  const result = await response.json();
  if (!response.ok) { const e = new Error(result.error || 'La demande a échoué.'); e.status=response.status; throw e; }
  return result;
}
function node(tag, className, content) { const n = document.createElement(tag); if (className) n.className=className; if (content !== undefined) n.textContent=content; return n; }
function updateControls() {
  document.querySelectorAll('.thread-button').forEach(button=>{button.disabled=busy||Boolean(call)||Boolean(pendingSave);});
  $('send-button').disabled = !initialized || busy || Boolean(call) || !navigator.onLine;
  $('call-button').disabled = !initialized || busy || Boolean(call) || Boolean(pendingSave) || !navigator.onLine;
  $('new-thread').disabled = !initialized || busy || Boolean(call) || Boolean(pendingSave);
  $('add-note').disabled = !initialized;
  $('message').disabled = Boolean(call);
  $('draft-button').disabled = busy || Boolean(call) || Boolean(pendingSave) || !state.messages.some(m=>m.role==='user');
  $('typing').hidden=!busy;
}
function render() {
  $('welcome').hidden = state.messages.length > 0 || Boolean(call);
  $('messages').replaceChildren(...state.messages.map(m=>{
    const row=node('div',`bubble-row ${m.role}`); row.append(node('span','bubble-label',m.role==='user' ? 'Toi' : 'La Bulle'),node('div','bubble',m.text));
    if (m.source==='voice') row.firstChild.textContent += ' · appel';
    return row;
  }));
  $('threads').replaceChildren(...state.threads.map((t,index)=>{
    const button=node('button','thread-button',`Séance du ${date(t.created_at)}`); button.setAttribute('aria-current',String(t.id===state.threadId));
    button.disabled=Boolean(call)||busy||Boolean(pendingSave); button.addEventListener('click',()=>guard(async()=>{await load(t.id);}));return button;
  }));
  if (!state.threads.length) $('threads').append(node('p','muted small','Ton premier échange commence ici.'));
  $('notes').replaceChildren(...state.notes.map(n=>{
    const card=node('article','note');const time=node('time','',date(n.created_at));time.dateTime=new Date(n.created_at).toISOString();card.append(time,node('p','',n.text));
    const actions=node('div','note-actions');const edit=node('button','','Modifier');edit.addEventListener('click',()=>openNote(n.text,n.id));
    const remove=node('button','','Effacer');remove.addEventListener('click',()=>guard(async()=>{if(await confirm('Effacer cette note ?','Elle ne sera plus utilisée par le coach lors des prochaines séances.')){await api(`notes/${n.id}`,undefined,'DELETE');await load();}}));
    actions.append(edit,remove);card.append(actions);return card;
  }));
  $('note-empty').hidden=state.notes.length>0;
  $('decisions').replaceChildren(...state.decisions.map(d=>node('li','',`${date(d.created_at)} · ${d.action}`)));
  if(!state.decisions.length)$('decisions').append(node('li','','Les choix apparaîtront après un message.'));
  $('mode-label').textContent=authenticated ? 'Coach IA · tes silences ont leur place.' : 'Un coach IA, du temps pour réfléchir.';
  updateControls();
}
async function load(threadId=state.threadId) { state=await api(`state${threadId ? `?thread=${encodeURIComponent(threadId)}`:''}`);authenticated=true;render(); }
async function guard(fn) { error();try{await fn();}catch(e){if(e.status===401){authenticated=false;$('access-dialog').showModal();}else error(e.message);} }
function access() { if(authenticated)return true;$('access-dialog').showModal();return false; }
async function ensureThread() {if(!state.threadId){const r=await api('threads',{});state.threadId=r.id;}}
function scrollFeed() { $('feed').scrollTo({top:$('feed').scrollHeight,behavior:'smooth'}); }
function openNote(value='',key=null) {editingNote=key;$('note-text').value=value;$('note-error').textContent='';$('note-dialog').showModal();}
function confirm(title,description){$('confirm-title').textContent=title;$('confirm-description').textContent=description;$('confirm-dialog').showModal();return new Promise(resolve=>{
  $('confirm-yes').onclick=()=>{$('confirm-dialog').close('yes');};$('confirm-no').onclick=()=>{$('confirm-dialog').close('no');};
  $('confirm-dialog').addEventListener('close',()=>resolve($('confirm-dialog').returnValue==='yes'),{once:true});
});}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
$('about-button').onclick=()=>$('about-dialog').showModal();
document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{$('message').value=b.dataset.prompt;$('message').focus();});
$('access-form').addEventListener('submit',async event=>{
  event.preventDefault();$('access-submit').disabled=true;$('access-error').textContent='';
  try{await api('login',{code:$('access-code').value});$('access-code').value='';await load();$('access-dialog').close();$('message').focus();}
  catch(e){$('access-error').textContent=e.message;}finally{$('access-submit').disabled=false;}
});
$('composer').addEventListener('submit',event=>{event.preventDefault();void guard(async()=>{
  const value=$('message').value.trim();if(!value||busy||call||!access())return;
  busy=true;updateControls();const requestId=crypto.randomUUID();
  try{await ensureThread();await api('chat',{threadId:state.threadId,text:value,id:requestId});$('message').value='';await load();scrollFeed();}
  finally{busy=false;updateControls();$('message').focus();}
});});
$('message').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('composer').requestSubmit();}});
$('new-thread').onclick=()=>guard(async()=>{if(!access()||call||busy||pendingSave)return;const result=await api('threads',{});await load(result.id);});
$('add-note').onclick=()=>{if(access())openNote();};
$('draft-button').onclick=()=>guard(async()=>{
  if(!access()||busy||call||pendingSave)return;busy=true;updateControls();
  try{const r=await api('draft',{threadId:state.threadId});if(!r.text){error('Le coach ne propose pas de note pour cet échange. Tu peux en écrire une avec le bouton +.');return;}openNote(r.text);}
  finally{busy=false;updateControls();}
});
$('note-form').addEventListener('submit',async event=>{
  event.preventDefault();$('note-save').disabled=true;$('note-error').textContent='';
  try{await api('notes',{id:editingNote,text:$('note-text').value});await load();$('note-dialog').close();}
  catch(e){$('note-error').textContent=e.message;}finally{$('note-save').disabled=false;}
});
$('erase-button').onclick=()=>guard(async()=>{
  if(call){error('Termine l’appel avant d’effacer ton espace.');return;}
  if(await confirm('Effacer tout mon espace ?','Le fil, les transcriptions et les notes de ce navigateur seront supprimés du serveur. Cette action est définitive.')){
    await api('data',undefined,'DELETE');authenticated=false;state={threads:[],messages:[],notes:[],decisions:[],threadId:null};render();
  }
});

function send(c,event) {if(call===c && c.channel?.readyState==='open')c.channel.send(JSON.stringify(event));}
function callStatus(c,label,speaking=false){
  if(call!==c)return;
  $('call-status').textContent=label;
  $('call-hint').textContent='Parle naturellement. Tu peux interrompre le coach.';
  $('call-panel').dataset.state=speaking?'speaking':'listening';
}
function interrupted(c){
  for(const key of c.currentItems){const item=c.transcript.get(key);if(item)item.interrupted=true;}
  c.currentItems.clear();c.playing=false;
}
function transcript(c,key,role) {if(!c.transcript.has(key))c.transcript.set(key,{role,text:'',order:c.sequence++});return c.transcript.get(key);}
function handleEvent(c,e) {
  if(call!==c)return;
  if(e.type==='input_audio_buffer.speech_started'){
    clearTimeout(c.responseTimer);c.speaking=true;
    transcript(c,e.item_id,'user');interrupted(c);callStatus(c,'Je t’écoute.',true);
  }else if(e.type==='input_audio_buffer.speech_stopped'){
    c.speaking=false;callStatus(c,'Le coach prépare sa réponse…');
    clearTimeout(c.responseTimer);
    c.responseTimer=setTimeout(()=>{if(call===c)void endCall('Le service vocal ne répond plus. Tu peux relancer l’appel.');},30000);
  }else if(e.type==='conversation.item.input_audio_transcription.completed'){
    transcript(c,e.item_id,'user').text=e.transcript||'';
  }else if(e.type==='conversation.item.input_audio_transcription.failed'){
    // Transcription is for the saved notes; native audio turn-taking continues.
    error('Un passage n’a pas pu être transcrit. La conversation continue.','info');
  }else if(e.type==='response.created'){
    clearTimeout(c.responseTimer);c.responseId=e.response.id;
    c.responseTimer=setTimeout(()=>{if(call===c)void endCall('Le service vocal ne répond plus. Tu peux relancer l’appel.');},45000);
    callStatus(c,'Le coach prépare sa réponse…');
  }else if(e.type==='response.output_item.added' && e.item?.role==='assistant'){
    c.currentItems.add(e.item.id);transcript(c,e.item.id,'assistant');
  }else if(e.type==='response.output_audio_transcript.done'){
    transcript(c,e.item_id,'assistant').text=e.transcript||'';
  }else if(e.type==='output_audio_buffer.started'){
    c.playing=true;callStatus(c,'Le coach te répond.');
  }else if(e.type==='output_audio_buffer.cleared'){
    interrupted(c);callStatus(c,'Je t’écoute.',c.speaking);
  }else if(e.type==='output_audio_buffer.stopped'){
    c.playing=false;c.currentItems.clear();callStatus(c,'Je t’écoute.',c.speaking);
  }else if(e.type==='response.done'){
    if(e.response?.id!==c.responseId)return;
    clearTimeout(c.responseTimer);
    if(e.response.status==='failed'||e.response.status==='incomplete'){
      void endCall('Le service vocal n’a pas pu terminer sa réponse. Tu peux relancer l’appel.');
    }
  }else if(e.type==='error'){
    console.warn('voice_error',e.error?.code||'unknown');
    void endCall('La connexion vocale a rencontré une erreur. Tu peux relancer l’appel.');
  }
}
async function startCall(){
  if(!access()||call||busy||pendingSave)return;
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Le micro nécessite HTTPS ou localhost et un navigateur compatible.');
  busy=true;updateControls();
  try{await ensureThread();}finally{busy=false;updateControls();}
  const c={peer:new RTCPeerConnection(),audio:new Audio(),stream:null,channel:null,callId:null,sequence:0,transcript:new Map(),currentItems:new Set(),responseId:null,speaking:false,playing:false,ending:false};
  call=c;render();$('call-panel').hidden=false;$('call-status').textContent='Autorise le micro pour commencer.';$('call-time').textContent='00:00';
  c.audio.autoplay=true;
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    if(call!==c){stream.getTracks().forEach(t=>t.stop());return;}
    c.stream=stream;stream.getTracks().forEach(t=>c.peer.addTrack(t,stream));
    c.peer.ontrack=e=>{c.audio.srcObject=e.streams[0]||new MediaStream([e.track]);c.audio.play().catch(()=>{void endCall('Le navigateur bloque le son. Autorise la lecture audio puis relance l’appel.');});};
    c.channel=c.peer.createDataChannel('oai-events');
    c.channel.onmessage=e=>{try{handleEvent(c,JSON.parse(e.data));}catch{void endCall('La connexion vocale a rencontré un problème. Tu peux relancer l’appel.');}};
    c.channel.onopen=()=>{
      if(call!==c)return;clearTimeout(c.connectionTimer);c.started=Date.now();callStatus(c,'Le coach prépare sa réponse…');
      c.ticker=setInterval(()=>{const seconds=Math.floor((Date.now()-c.started)/1000);$('call-time').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;if(seconds>=600)void endCall('Les dix minutes sont écoulées. Tu peux garder quelques notes.');},1000);
      // Native VAD creates all later responses; the client only requests the greeting.
      send(c,{type:'response.create'});
      c.responseTimer=setTimeout(()=>{if(call===c)void endCall('Le coach ne répond pas. Tu peux relancer l’appel.');},20000);
    };
    c.channel.onclose=()=>{if(call===c&&!c.ending)void endCall('La connexion audio a été fermée.');};
    c.peer.onconnectionstatechange=()=>{if(call!==c||c.ending)return;if(['failed','disconnected'].includes(c.peer.connectionState))void endCall('La connexion a été interrompue. Les propos reçus sont conservés si possible.');};
    const offer=await c.peer.createOffer();await c.peer.setLocalDescription(offer);
    $('call-status').textContent='Connexion au coach…';
    const result=await api('call',{threadId:state.threadId,sdp:offer.sdp});c.callId=result.callId;
    if(call!==c){await api('call/end',{callId:c.callId,messages:[]});return;}
    await c.peer.setRemoteDescription({type:'answer',sdp:result.sdp});
    c.connectionTimer=setTimeout(()=>{if(call===c&&c.channel.readyState!=='open')void endCall('La connexion audio n’a pas abouti. Réessaie.');},20000);
  }catch(e){await endCall();throw new Error(e.name==='NotAllowedError'?'Le micro n’est pas autorisé. Tu peux continuer par écrit ou autoriser le micro dans ton navigateur.':e.message);}
}
async function saveCall(){
  if(!pendingSave)return;
  await api('call/end',pendingSave);pendingSave=null;await load();updateControls();
}
async function endCall(message=''){
  const c=call;if(!c||c.ending)return;c.ending=true;
  clearInterval(c.ticker);clearTimeout(c.connectionTimer);clearTimeout(c.responseTimer);
  // Reset the UI first. A failed transport cleanup must never leave the call stuck.
  call=null;$('call-panel').hidden=true;
  for(const cleanup of [()=>c.stream?.getTracks().forEach(t=>t.stop()),()=>c.channel?.close(),()=>c.peer.close(),()=>c.audio.pause(),()=>{c.audio.srcObject=null;}]){try{cleanup();}catch{}}
  const messages=[...c.transcript.values()].sort((a,b)=>a.order-b.order).filter(m=>m.text.trim()&&!m.interrupted).map(m=>({role:m.role,text:m.text}));
  if(c.callId)pendingSave={callId:c.callId,messages};
  try{await saveCall();if(message)error(message);else if(messages.length)error('Appel terminé. Tu peux relire le fil et choisir « Garder quelques notes ».','info');}
  catch{error('La transcription n’a pas encore été sauvegardée. Garde cette page ouverte et utilise « Réessayer la sauvegarde ».');}
  render();if(pendingSave){const retry=node('button','text-button','Réessayer la sauvegarde');retry.onclick=()=>guard(async()=>{await saveCall();error();render();});$('error').append(retry);}scrollFeed();
}
$('call-button').onclick=()=>guard(startCall);
$('hangup-button').onclick=()=>{void endCall();};
window.addEventListener('offline',()=>{document.body.classList.add('offline');error('Tu es hors connexion. Ton message reste ici.');if(call)void endCall('Connexion perdue. Garde cette page ouverte pour sauvegarder le fil.');updateControls();});
window.addEventListener('online',()=>{document.body.classList.remove('offline');updateControls();if(pendingSave)void guard(saveCall);else error();});
window.addEventListener('beforeunload',event=>{if(call||pendingSave){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{if(call){call.stream?.getTracks().forEach(t=>t.stop());call.peer.close();}});

async function init(){
  updateControls();
  try{const status=await api('status');$('config-hint').textContent=status.ready?'':'Le service doit encore recevoir sa clé OpenAI et son code d’accès.';}catch{error('Le serveur n’est pas accessible.');}
  try{await load();}catch(e){if(e.status!==401)error(e.message);render();}
  initialized=true;updateControls();
}
void init();
