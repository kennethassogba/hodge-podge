import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { QUESTIONS } from '../public/coaching-protocol.js';

// Run the actual UI handlers against fake transport events, not a second implementation.
async function setup({cleanupThrows=false,language='fr',url='https://test.example',signedIn=true,autoCall=true,saveFails=false,saveErrors=[],refreshErrors=[],screenMode='unsupported'}={}){
  const dom=new JSDOM(await readFile('public/index.html','utf8'),{url});
  dom.window.localStorage.setItem('hp_language',language);
  const document=dom.window.document;
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};document.getElementById('feed').scrollTo=()=>{};
  let authenticated=signedIn,didSave=false;
  if(saveFails)saveErrors=[500,500,500];
  let visibility='visible',audio;
  Object.defineProperty(document,'visibilityState',{get:()=>visibility});
  const locks=[],grants=[];let screenRequests=0;
  function makeLock(){
    const lock=new dom.window.EventTarget();lock.released=false;
    lock.release=async()=>{if(!lock.released){lock.released=true;lock.dispatchEvent(new dom.window.Event('release'));}};
    locks.push(lock);return lock;
  }
  const wakeLock=screenMode==='unsupported'?undefined:{async request(type){
    assert.equal(this,wakeLock);assert.equal(type,'screen');screenRequests++;
    if(screenMode==='denied')throw new Error('System denied wake lock');
    if(screenMode==='deferred')return new Promise(resolve=>grants.push(()=>resolve(makeLock())));
    return makeLock();
  }};
  let peer,clock=0,seq=0;const timers=new Map(),sent=[],http=[],tickers=[];
  const uiState={threadId:'fake-thread',threads:[{id:'fake-thread',created_at:Date.now()}],messages:[],notes:[],decisions:[],calls:[]};
  function validTimerReceiver(receiver){if(receiver && receiver!==dom.window && !receiver.document)throw new TypeError('Illegal invocation');}
  function setTimer(fn,delay){validTimerReceiver(this);timers.set(++seq,{fn,at:clock+delay});return seq;}
  function clearTimer(id){validTimerReceiver(this);timers.delete(id);}
  class Peer{
    constructor(){peer=this;this.connectionState='connected';}
    addTrack(){} createDataChannel(){return this.channel={readyState:'open',send:e=>sent.push(JSON.parse(e)),close(){if(cleanupThrows)throw new Error('Channel already closed');}};}
    async createOffer(){return {type:'offer',sdp:'v=0\r\n'};} async setLocalDescription(){}
    async setRemoteDescription(){this.channel.onopen();} close(){}
  }
  const track={stopped:false,stop(){this.stopped=true;},enabled:true};
  const context=vm.createContext({document,window:dom.window,navigator:{onLine:true,wakeLock,mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})}},
    AbortController,RTCPeerConnection:Peer,Audio:class{constructor(){audio=this;this.muted=false;this.paused=false;this.plays=0;}async play(){this.plays++;if(this.failPlay)throw new Error('Audio needs gesture');this.paused=false;}pause(){this.paused=true;}},crypto,
    setTimeout:setTimer,clearTimeout:clearTimer,setInterval:fn=>{tickers.push(fn);return tickers.length;},clearInterval:()=>{},console,
    fetch:async (path,options)=>{
      const data=options?.body?JSON.parse(options.body):null;http.push({path,data});
      if(path==='/api/login'){if(data.code==='valid-passphrase')authenticated=true;else return Response.json({error:'Ce code d’accès ne correspond pas.'},{status:401});}
      if(path.startsWith('/api/state')&&!authenticated)return Response.json({error:'Code required'},{status:401});
      const fault=path==='/api/call/end'?saveErrors.shift():path.startsWith('/api/state')&&didSave?refreshErrors.shift():null;
      if(fault==='network'){const error=new Error('Network unavailable');error.name='TypeError';throw error;}
      if(fault==='timeout')return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{const error=new Error('Aborted');error.name='AbortError';reject(error);},{once:true}));
      if(fault==='html')return new Response('<html>Unavailable</html>',{status:503});
      if(fault)return Response.json({error:'test failure'},{status:fault});
      if(path==='/api/call/end'){didSave=true;uiState.calls=[{id:'fake-call-id',ended_at:Date.now(),language,feedback_submitted:0}];}
      if(path==='/api/feedback')Object.assign(uiState.calls[0],{feedback_submitted:1});
      return Response.json(path==='/api/status'?{ready:true}:path==='/api/call'?{callId:'fake-call-id',sdp:'v=0\r\n'}:path.startsWith('/api/state')?uiState:{ok:true});
    }});

  const bundled=await build({entryPoints:['public/app.js'],bundle:true,write:false,format:'iife',platform:'browser'});
  vm.runInContext(bundled.outputFiles[0].text,context);
  const settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};await settle();
  if(autoCall){document.getElementById('call-button').click();await settle();}
  const emit=e=>peer.channel.onmessage({data:JSON.stringify(e)});
  function question(i){const id='response-'+i;emit({type:'response.created',response:{id}});emit({type:'response.output_item.added',item:{id:'item-'+i,role:'assistant'}});emit({type:'response.output_audio_transcript.done',response_id:id,item_id:'item-'+i,transcript:QUESTIONS[i]});emit({type:'response.done',response:{id,status:'completed'}});emit({type:'output_audio_buffer.stopped',response_id:id});}
  return {document,window:dom.window,http,sent,emit,question,settle,track,locks,grants,screenRequests:()=>screenRequests,audio:()=>audio,visibility(value){visibility=value;document.dispatchEvent(new dom.window.Event('visibilitychange'));},close:()=>dom.window.close(),tick(ms){clock+=ms;for(const ticker of tickers)ticker();for(const [id,t]of [...timers])if(t.at<=clock){timers.delete(id);t.fn();}},requests:()=>sent.filter(x=>x.type==='response.create')};
}
test('native replies are accepted after each user turn without client timers or transcription',async()=>{
  const s=await setup();try{
    assert.equal(s.requests().length,1); // Only the greeting is client-triggered.
    s.question(0);
    for(let i=1;i<=3;i++){
      s.emit({type:'input_audio_buffer.speech_started',item_id:'user-'+i});
      s.emit({type:'input_audio_buffer.speech_stopped',item_id:'user-'+i});
      s.emit({type:'conversation.item.input_audio_transcription.failed',item_id:'user-'+i});
      s.emit({type:'response.created',response:{id:'response-'+i}});
      s.emit({type:'output_audio_buffer.started',response_id:'response-'+i});
      assert.equal(s.document.getElementById('call-status').textContent,'Le coach te répond.');
      s.question(i);
    }
    assert.equal(s.requests().length,1);
    assert.equal(s.sent.filter(e=>['response.cancel','output_audio_buffer.clear'].includes(e.type)).length,0);
    assert.equal(s.document.getElementById('call-panel').hidden,false);
  }finally{s.close();}
});
test('hangup restores the UI and stops the microphone even if transport cleanup throws',async()=>{
  const s=await setup({cleanupThrows:true});try{
    s.question(0);s.document.getElementById('hangup-button').click();await s.settle();
    assert.equal(s.document.getElementById('call-panel').hidden,true);
    assert.equal(s.document.getElementById('call-button').disabled,false);
    assert.equal(s.track.stopped,true);
  }finally{s.close();}
});
test('missing provider response times out cleanly, with native-style timer receiver checks',async()=>{
  const s=await setup();try{
    s.tick(21000);await s.settle();
    assert.equal(s.document.getElementById('call-panel').hidden,true);
    assert.match(s.document.getElementById('error').textContent,/ne répond pas/);
    assert.equal(s.track.stopped,true);
  }finally{s.close();}
});

test('English interface sends language and microphone choice, and feedback remains opt-in after the call',async()=>{
  const s=await setup({language:'en'});try{
    assert.equal(s.document.documentElement.lang,'en');assert.equal(s.document.querySelector('h1').textContent,'Your space to talk');
    assert.equal(s.http.find(r=>r.path==='/api/call').data.language,'en');
    assert.ok(s.requests()[0].response.instructions.includes('Welcome to this bubble. This is time for you, I am here to listen. What would you like to talk about?'));
    assert.equal(s.http.find(r=>r.path==='/api/call').data.microphone,'speaker');
    assert.equal(s.document.getElementById('language').disabled,true);
    s.question(0);s.tick(19*60*1000);assert.equal(s.document.getElementById('call-panel').hidden,false);
    s.document.getElementById('hangup-button').click();await s.settle();
    assert.equal(s.document.getElementById('feedback-panel').hidden,false);
    assert.equal(s.document.getElementById('feedback-dialog').open,false);
    assert.equal(s.http.filter(r=>r.path==='/api/feedback').length,0);
    s.document.getElementById('feedback-button').click();
    assert.equal(s.document.getElementById('feedback-share'),null);
    assert.equal(s.document.getElementById('feedback-delete'),null);
    assert.equal(s.document.querySelectorAll('input[name=recommendation]').length,11);
    assert.equal(s.document.querySelector('legend').textContent,'How likely are you to recommend a coaching bubble to a friend or colleague?');
    s.document.getElementById('feedback-form').dispatchEvent(new s.window.Event('submit',{cancelable:true}));await s.settle();
    assert.equal(s.http.filter(r=>r.path==='/api/feedback').length,0);
    s.document.querySelector('input[name=recommendation][value="0"]').checked=true;
    s.document.getElementById('feedback-reason').value='Useful reflection';
    s.document.getElementById('feedback-value').value='An hour saved';
    s.document.getElementById('feedback-suggestions').value='Keep it simple';
    s.document.getElementById('feedback-form').dispatchEvent(new s.window.Event('submit',{cancelable:true}));await s.settle();
    const feedback=s.http.find(r=>r.path==='/api/feedback').data;assert.equal(feedback.recommendation,0);assert.equal(feedback.reason,'Useful reflection');assert.equal(feedback.valueEstimate,'An hour saved');assert.equal(feedback.suggestions,'Keep it simple');assert.equal(feedback.messages,undefined);
    assert.equal(s.document.getElementById('feedback-button').hidden,true);
    assert.equal(s.document.getElementById('feedback-prompt').textContent,'Thanks for your feedback!');
    const select=s.document.getElementById('language');select.value='fr';select.dispatchEvent(new s.window.Event('change'));
    assert.equal(s.document.querySelector('h1').textContent,'Ton espace pour parler');assert.equal(s.document.getElementById('feedback-prompt').textContent,'Merci pour ton retour !');
    assert.equal(s.document.querySelector('legend').textContent,'Quelle est la probabilité que tu recommandes une bulle de coaching à un ami ou un collègue ?');
  }finally{s.close();}
});

test('calls end at twenty minutes, save the transcript, and count as normal endings',async()=>{
  const s=await setup();try{
    s.question(0);
    s.emit({type:'input_audio_buffer.speech_started',item_id:'timeout-user'});
    s.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'timeout-user',transcript:'Je veux clarifier mes priorités.'});
    s.emit({type:'input_audio_buffer.speech_stopped',item_id:'timeout-user'});s.question(1);
    s.tick(1199000);await s.settle();assert.equal(s.document.getElementById('call-panel').hidden,false);
    s.tick(1000);await s.settle();assert.equal(s.document.getElementById('call-panel').hidden,true);
    assert.equal(s.track.stopped,true);assert.equal(s.document.getElementById('call-button').disabled,false);
    const ending=s.http.find(r=>r.path==='/api/call/end').data;
    assert.equal(ending.outcome,'ended');assert.ok(ending.messages.some(m=>m.text==='Je veux clarifier mes priorités.'));
    assert.match(s.document.getElementById('error').textContent,/vingt minutes/);
    assert.equal(s.document.getElementById('error').dataset.tone,'info');
    assert.equal(s.document.getElementById('decisions'),null);assert.equal(s.document.getElementById('mode-label'),null);
  }finally{s.close();}
});

test('invitation URL signs in automatically and removes the code from browser history',async()=>{
  const s=await setup({url:'https://test.example/#access=valid-passphrase',signedIn:false,autoCall:false});try{
    assert.equal(s.window.location.hash,'');assert.equal(s.http.find(r=>r.path==='/api/login').data.code,'valid-passphrase');
    assert.equal(s.document.getElementById('access-dialog').open,false);
    assert.equal(s.document.getElementById('call-button').disabled,false);
  }finally{s.close();}
  const invalid=await setup({url:'https://test.example/#access=wrong',signedIn:false,autoCall:false});try{
    assert.equal(invalid.window.location.hash,'');assert.equal(invalid.document.getElementById('access-dialog').open,true);
    assert.match(invalid.document.getElementById('access-error').textContent,/ne correspond pas/);
  }finally{invalid.close();}
  const existing=await setup({url:'https://test.example/#access=valid-passphrase',autoCall:false});try{
    assert.equal(existing.http.some(r=>r.path==='/api/login'),false);
  }finally{existing.close();}
});

function requestFinish(s){
  s.question(0);
  s.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'last-user',transcript:'Merci, je veux passer à l’action.'});
  s.emit({type:'response.created',response:{id:'finish-response'}});
  s.emit({type:'response.done',response:{id:'finish-response',status:'completed',output:[{type:'function_call',name:'finish_bubble',call_id:'finish-tool'}]}});
}
test('automatic finish waits for the farewell audio and a successful save before transitioning',async()=>{
  const s=await setup();try{
    requestFinish(s);assert.equal(s.requests().at(-1).response.tool_choice,'none');
    s.emit({type:'response.created',response:{id:'farewell'}});
    s.emit({type:'output_audio_buffer.started'});
    s.emit({type:'response.output_audio_transcript.done',item_id:'farewell-item',transcript:'Merci pour ce moment partagé.'});
    s.emit({type:'response.done',response:{id:'farewell',status:'completed'}});
    s.tick(1000);await s.settle();assert.equal(s.document.getElementById('call-panel').hidden,false);
    s.emit({type:'output_audio_buffer.stopped'});s.tick(450);await s.settle();
    assert.equal(s.document.getElementById('call-panel').hidden,true);
    assert.equal(s.http.filter(r=>r.path==='/api/call/end').length,1);
    assert.equal(s.document.body.classList.contains('leaving-bubble'),true);
  }finally{s.close();}
});
test('a resumed user turn cancels automatic closing, and a save failure prevents navigation',async()=>{
  const s=await setup();try{
    requestFinish(s);s.emit({type:'response.created',response:{id:'farewell'}});
    s.emit({type:'response.done',response:{id:'farewell',status:'completed'}});
    s.emit({type:'input_audio_buffer.speech_started',item_id:'new-thought'});s.tick(500);await s.settle();
    assert.equal(s.document.getElementById('call-panel').hidden,false);assert(!s.document.body.classList.contains('leaving-bubble'));
  }finally{s.close();}
  const failed=await setup({saveFails:true});try{
    failed.question(0);failed.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'user',transcript:'Une idée.'});
    failed.document.getElementById('hangup-button').click();await failed.settle();
    assert(!failed.document.body.classList.contains('leaving-bubble'));
    failed.tick(750);await failed.settle();failed.tick(1750);await failed.settle();
    failed.document.querySelector('#error button').click();await failed.settle();
    assert(failed.document.body.classList.contains('leaving-bubble'));
  }finally{failed.close();}
});

test('a farewell already spoken with the finish tool is not repeated; back navigation restores the page',async()=>{
  const s=await setup();try{
    s.question(0);
    s.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'last-user',transcript:'Je veux terminer.'});
    s.emit({type:'response.created',response:{id:'closing-with-tool'}});
    s.emit({type:'output_audio_buffer.started'});
    s.emit({type:'response.output_audio_transcript.done',item_id:'bye',transcript:'Merci, bonne continuation.'});
    s.emit({type:'response.done',response:{id:'closing-with-tool',status:'completed',output:[{type:'function_call',name:'finish_bubble',call_id:'finish'}]}});
    assert.equal(s.requests().length,1);
    s.emit({type:'output_audio_buffer.stopped'});s.tick(450);await s.settle();
    assert(s.document.body.classList.contains('leaving-bubble'));
    s.window.dispatchEvent(new s.window.Event('pageshow'));
    assert(!s.document.body.classList.contains('leaving-bubble'));
  }finally{s.close();}
});

function pauseRequest(s,seconds=20,{spoken=false}={}){
  s.emit({type:'input_audio_buffer.speech_started',item_id:'pause-user'});
  s.emit({type:'input_audio_buffer.speech_stopped',item_id:'pause-user'});
  s.emit({type:'response.created',response:{id:'pause-tool-response'}});
  if(spoken){
    s.emit({type:'output_audio_buffer.started',response_id:'pause-tool-response'});
    s.emit({type:'response.output_audio_transcript.done',response_id:'pause-tool-response',item_id:'pause-ack-item',transcript:'Bien sûr, prends ton temps.'});
  }
  s.emit({type:'response.done',response:{id:'pause-tool-response',status:'completed',output:[{type:'function_call',name:'pause_coaching',call_id:'pause-tool',arguments:JSON.stringify({seconds})}]}});
  return s.requests().at(-1);
}
function pauseReply(s,request,id='pause-ack-response',{drain=true}={}){
  s.emit({type:'response.created',response:{id,metadata:request.response.metadata}});
  s.emit({type:'output_audio_buffer.started',response_id:id});
  s.emit({type:'response.output_audio_transcript.done',response_id:id,item_id:id+'-item',transcript:request.response.instructions});
  s.emit({type:'response.done',response:{id,status:'completed'}});
  if(drain)s.emit({type:'output_audio_buffer.stopped',response_id:id});
}
test('requested pause starts after acknowledgement playback and checks readiness only once',async()=>{
  const s=await setup();try{
    s.question(0);assert.equal(s.http.find(r=>r.path==='/api/call').data.pauseSupport,true);
    const ack=pauseRequest(s);assert.match(ack.response.instructions,/Bien sûr, prends ton temps/);
    pauseReply(s,ack,'ack',{drain:false});s.tick(25000);await s.settle();
    assert.equal(s.requests().length,2); // Still playing the acknowledgement, not yet counting the pause.
    s.emit({type:'output_audio_buffer.stopped',response_id:'ack'});
    s.tick(19999);assert.equal(s.requests().length,2);
    s.tick(1);assert.equal(s.requests().length,3);
    const check=s.requests().at(-1);assert.match(check.response.instructions,/Est-ce qu’on peut continuer/);
    assert.equal(check.response.tool_choice,'none');pauseReply(s,check,'check');
    s.tick(120000);await s.settle();assert.equal(s.requests().length,3);
    assert.equal(s.document.getElementById('call-panel').hidden,false);
    s.emit({type:'input_audio_buffer.speech_started',item_id:'ready'});
    s.emit({type:'input_audio_buffer.speech_stopped',item_id:'ready'});s.question(0);
    assert.equal(s.requests().length,3); // The resumed response remains native.
  }finally{s.close();}
});
test('speaking during a pause cancels its check-in without affecting native turns',async()=>{
  const s=await setup();try{
    s.question(0);pauseReply(s,pauseRequest(s));s.tick(10000);
    s.emit({type:'input_audio_buffer.speech_started',item_id:'early-resume'});
    s.emit({type:'input_audio_buffer.speech_stopped',item_id:'early-resume'});s.question(1);
    s.tick(60000);await s.settle();assert.equal(s.requests().length,2);
    assert.equal(s.document.getElementById('call-panel').hidden,false);
    assert.equal(s.sent.filter(e=>e.type==='session.update').length,0);
  }finally{s.close();}
});
test('explicit longer pauses and indefinite waits do not trigger a transport timeout',async()=>{
  for(const seconds of [75,0]){
    const s=await setup({language:'en'});try{
      s.question(0);const ack=pauseRequest(s,seconds);assert.match(ack.response.instructions,/Of course, take your time/);
      pauseReply(s,ack);s.tick(seconds?74999:120000);await s.settle();
      assert.equal(s.requests().length,2);assert.equal(s.document.getElementById('call-panel').hidden,false);
      if(seconds){s.tick(1);assert.match(s.requests().at(-1).response.instructions,/Are you ready to continue/);}
    }finally{s.close();}
  }
});
test('an acknowledgement spoken alongside a pause tool is not repeated',async()=>{
  const s=await setup();try{
    s.question(0);pauseRequest(s,20,{spoken:true});assert.equal(s.requests().length,1);
    s.emit({type:'output_audio_buffer.stopped',response_id:'pause-tool-response'});s.tick(20000);
    assert.equal(s.requests().length,2);assert.match(s.requests().at(-1).response.instructions,/continuer/);
  }finally{s.close();}
});
test('late pause tools and late acknowledgement responses cannot pause a resumed user',async()=>{
  const s=await setup();try{
    s.question(0);s.emit({type:'response.created',response:{id:'late-tool'}});
    s.emit({type:'input_audio_buffer.speech_started',item_id:'new-thought'});
    s.emit({type:'input_audio_buffer.speech_stopped',item_id:'new-thought'});
    s.emit({type:'response.done',response:{id:'late-tool',status:'completed',output:[{type:'function_call',name:'pause_coaching',call_id:'late-tool-call',arguments:'{"seconds":20}'}]}});
    assert.equal(s.requests().length,1);
    assert.match(s.sent.at(-1).item.output,/cancelled/);
    const ack=pauseRequest(s);s.emit({type:'input_audio_buffer.speech_started',item_id:'interrupt-ack'});
    s.emit({type:'response.created',response:{id:'late-ack',metadata:ack.response.metadata}});
    const cancel=s.sent.at(-1);assert.equal(cancel.type,'response.cancel');assert.equal(cancel.response_id,'late-ack');
    s.emit({type:'error',error:{event_id:cancel.event_id,code:'response_cancel_not_active'}});
    s.emit({type:'response.done',response:{id:'late-ack',status:'cancelled'}});
    s.emit({type:'input_audio_buffer.speech_stopped',item_id:'interrupt-ack'});s.question(1);
    s.tick(60000);await s.settle();assert.equal(s.requests().length,2);
    assert.equal(s.document.getElementById('call-panel').hidden,false);
  }finally{s.close();}
});
test('hangup and the twenty-minute limit cancel even an indefinite pause',async()=>{
  for(const limit of [false,true]){
    const s=await setup();try{
      s.question(0);pauseReply(s,pauseRequest(s,limit?0:20));
      if(limit)s.tick(1200000);else s.document.getElementById('hangup-button').click();
      await s.settle();s.tick(20000);await s.settle();
      assert.equal(s.document.getElementById('call-panel').hidden,true);
      assert.equal(s.requests().length,2);assert.equal(s.track.stopped,true);
    }finally{s.close();}
  }
});

function failedResponse(s,id,{status='incomplete',reason='max_output_tokens',code,output=[]}={}){
  s.emit({type:'response.done',response:{id,status,status_details:{reason,error:code?{code}:undefined},output,usage:{output_tokens:300}}});
}
test('a truncated response is retried once without hanging up or advancing from partial output',async()=>{
  const s=await setup();try{
    s.question(0);
    s.emit({type:'input_audio_buffer.speech_started',item_id:'answer'});
    s.emit({type:'input_audio_buffer.speech_stopped',item_id:'answer'});
    s.emit({type:'response.created',response:{id:'truncated'}});
    s.emit({type:'response.output_item.added',item:{id:'partial-question',role:'assistant'}});
    s.emit({type:'output_audio_buffer.started',response_id:'truncated'});
    s.emit({type:'response.output_audio_transcript.done',response_id:'truncated',item_id:'partial-question',transcript:'Quelles sont les…'});
    const output=[{id:'partial-question',type:'message',role:'assistant'}];
    failedResponse(s,'truncated',{output});failedResponse(s,'truncated',{output}); // Duplicate events cannot exhaust the retry budget.
    assert.equal(s.document.getElementById('call-panel').hidden,false);
    assert.equal(s.http.filter(r=>r.path==='/api/call/end').length,0);
    assert(s.sent.some(e=>e.type==='conversation.item.delete'&&e.item_id==='partial-question'));
    s.tick(250);const retry=s.requests().at(-1);
    assert.equal(s.requests().length,2);assert.equal(retry.response.max_output_tokens,4096);
    assert.equal(retry.response.instructions,undefined); // Session protocol remains authoritative.
    s.emit({type:'response.created',response:{id:'recovered',metadata:retry.response.metadata}});
    s.emit({type:'response.output_item.added',item:{id:'complete-question',role:'assistant'}});
    s.emit({type:'response.output_audio_transcript.done',response_id:'recovered',item_id:'complete-question',transcript:QUESTIONS[1]});
    s.emit({type:'response.done',response:{id:'recovered',status:'completed'}});
    s.emit({type:'output_audio_buffer.stopped',response_id:'recovered'});
    s.document.getElementById('hangup-button').click();await s.settle();
    const ending=s.http.find(r=>r.path==='/api/call/end').data;
    assert(!ending.messages.some(m=>m.text==='Quelles sont les…'));assert(ending.messages.some(m=>m.text===QUESTIONS[1]));
    const diagnostic=s.http.find(r=>r.path==='/api/call/diagnostic').data;
    assert.equal(diagnostic.reason,'max_output_tokens');assert.equal(diagnostic.retryScheduled,true);
    assert.doesNotMatch(JSON.stringify(diagnostic),/Quelles sont|Bienvenue/);
  }finally{s.close();}
});
test('a transient provider error retries once; repeated failure terminates cleanly without a loop',async()=>{
  const s=await setup();try{
    s.question(0);s.emit({type:'response.created',response:{id:'server-failure'}});
    failedResponse(s,'server-failure',{status:'failed',code:'server_error'});
    s.tick(999);assert.equal(s.requests().length,1);s.tick(1);
    const retry=s.requests().at(-1);assert.equal(s.requests().length,2);
    s.emit({type:'response.created',response:{id:'failed-retry',metadata:retry.response.metadata}});
    failedResponse(s,'failed-retry',{status:'failed',code:'server_error'});await s.settle();
    assert.equal(s.document.getElementById('call-panel').hidden,true);assert.equal(s.track.stopped,true);
    s.tick(5000);await s.settle();assert.equal(s.requests().length,2);
    assert.equal(s.http.filter(r=>r.path==='/api/call/end').length,1);
  }finally{s.close();}
});
test('content filtering and quota failures are not retried',async()=>{
  for(const failure of [{reason:'content_filter'},{status:'failed',code:'insufficient_quota'}]){
    const s=await setup();try{
      s.question(0);s.emit({type:'response.created',response:{id:'non-retryable'}});
      failedResponse(s,'non-retryable',{reason:undefined,...failure});await s.settle();
      s.tick(2000);assert.equal(s.requests().length,1);
      assert.equal(s.document.getElementById('call-panel').hidden,true);
    }finally{s.close();}
  }
});
test('resuming speech cancels a pending recovery, including a response created late',async()=>{
  for(const createdLate of [false,true]){
    const s=await setup();try{
      s.question(0);s.emit({type:'response.created',response:{id:'failed-old-turn'}});
      failedResponse(s,'failed-old-turn');
      if(createdLate)s.tick(250);
      const pending=s.requests().at(-1);
      s.emit({type:'input_audio_buffer.speech_started',item_id:'resumed'});
      if(createdLate){
        s.emit({type:'response.created',response:{id:'late-retry',metadata:pending.response.metadata}});
        assert(s.sent.some(e=>e.type==='response.cancel'&&e.response_id==='late-retry'));
      }
      s.emit({type:'input_audio_buffer.speech_stopped',item_id:'resumed'});s.question(1);
      s.tick(2000);await s.settle();assert.equal(s.requests().length,createdLate?2:1);
      assert.equal(s.document.getElementById('call-panel').hidden,false);
    }finally{s.close();}
  }
});
test('recovery preserves the greeting, pause acknowledgement and farewell purpose',async()=>{
  for(const kind of ['greeting','pause','farewell']){
    const s=await setup();try{
      let request=s.requests()[0];
      if(kind==='pause'){s.question(0);request=pauseRequest(s);}
      if(kind==='farewell'){requestFinish(s);request=s.requests().at(-1);}
      s.emit({type:'response.created',response:{id:'special-response',metadata:request.response.metadata}});
      failedResponse(s,'special-response');s.tick(250);
      const retry=s.requests().at(-1);assert.equal(retry.response.instructions,request.response.instructions);
      assert.equal(retry.response.tool_choice,request.response.tool_choice);
      s.emit({type:'response.created',response:{id:'special-retry',metadata:retry.response.metadata}});
      s.emit({type:'output_audio_buffer.started',response_id:'special-retry'});
      s.emit({type:'response.done',response:{id:'special-retry',status:'completed'}});
      s.emit({type:'output_audio_buffer.stopped',response_id:'special-retry'});
      if(kind==='pause'){
        s.tick(19999);assert.notEqual(s.requests().at(-1).response.metadata.pause_kind,'check');
        s.tick(1);assert.equal(s.requests().at(-1).response.metadata.pause_kind,'check');
      }
      if(kind==='farewell'){s.tick(450);await s.settle();assert.equal(s.document.getElementById('call-panel').hidden,true);}
    }finally{s.close();}
  }
});

test('a late failure from the previous turn neither hangs up nor removes the new-turn timeout',async()=>{
  const s=await setup();try{
    s.question(0);s.emit({type:'response.created',response:{id:'old-failure'}});
    s.emit({type:'input_audio_buffer.speech_started',item_id:'new-answer'});
    s.emit({type:'input_audio_buffer.speech_stopped',item_id:'new-answer'});
    failedResponse(s,'old-failure');await s.settle();
    s.tick(1000);assert.equal(s.requests().length,1);assert.equal(s.document.getElementById('call-panel').hidden,false);
    s.tick(29000);await s.settle();assert.equal(s.document.getElementById('call-panel').hidden,true);
    assert.match(s.document.getElementById('error').textContent,/ne répond plus/);
  }finally{s.close();}
});

function hangupWithText(s){
  s.question(0);
  s.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'save-user',transcript:'Une idée à garder.'});
  s.document.getElementById('hangup-button').click();
}
test('temporary save failures recover automatically with the same transcript and one active request',async()=>{
  for(const failure of [500,'network','html']){
    const s=await setup({saveErrors:[failure]});try{
      hangupWithText(s);await s.settle();
      assert.equal(s.track.stopped,true);assert.equal(s.document.getElementById('call-button').disabled,true);
      assert.equal(s.document.getElementById('error').dataset.tone,'info');
      s.window.dispatchEvent(new s.window.Event('online'));s.window.dispatchEvent(new s.window.Event('online'));await s.settle();
      assert.equal(s.http.filter(r=>r.path==='/api/call/end').length,1);
      s.tick(750);await s.settle();
      const writes=s.http.filter(r=>r.path==='/api/call/end');assert.equal(writes.length,2);
      assert.deepEqual(writes[0].data,writes[1].data);
      assert.equal(s.document.getElementById('error').dataset.tone,'info');
      assert(s.document.body.classList.contains('leaving-bubble'));
      assert.equal(s.document.getElementById('error').querySelector('button'),null);
    }finally{s.close();}
  }
});
test('a stalled save times out and retries while keeping the transcript',async()=>{
  const s=await setup({saveErrors:['timeout']});try{
    hangupWithText(s);await s.settle();s.tick(15000);await s.settle();
    assert(!s.document.body.classList.contains('leaving-bubble'));
    s.tick(750);await s.settle();
    assert.equal(s.http.filter(r=>r.path==='/api/call/end').length,2);
    assert(s.document.body.classList.contains('leaving-bubble'));
  }finally{s.close();}
});
test('repeated failures keep a usable retry button and never navigate before confirmation',async()=>{
  const s=await setup({saveErrors:[500,500,500,500,500,500]});try{
    hangupWithText(s);await s.settle();
    s.tick(750);await s.settle();s.tick(1750);await s.settle();
    assert.equal(s.http.filter(r=>r.path==='/api/call/end').length,3);
    s.document.querySelector('#error button').click();await s.settle();
    s.tick(750);await s.settle();s.tick(1750);await s.settle();
    assert.equal(s.http.filter(r=>r.path==='/api/call/end').length,6);
    assert(!s.document.body.classList.contains('leaving-bubble'));
    assert.equal(s.document.getElementById('call-button').disabled,true);
    s.document.querySelector('#error button').click();await s.settle();
    assert(s.document.body.classList.contains('leaving-bubble'));
  }finally{s.close();}
});
test('refresh failures do not repeat a confirmed save or claim the transcript is unsaved',async()=>{
  const s=await setup({language:'en',refreshErrors:[500,500,500]});try{
    hangupWithText(s);await s.settle();s.tick(750);await s.settle();s.tick(1750);await s.settle();
    assert.equal(s.http.filter(r=>r.path==='/api/call/end').length,1);
    assert.match(s.document.getElementById('error').textContent,/conversation is saved/);
    assert.equal(s.document.querySelector('#error button').textContent,'Refresh the thread');
    s.document.querySelector('#error button').click();await s.settle();
    assert.equal(s.http.filter(r=>r.path==='/api/call/end').length,1);
    assert(s.document.body.classList.contains('leaving-bubble'));
  }finally{s.close();}
});
test('invalid or unauthorized saves are not automatically retried',async()=>{
  for(const status of [400,401,403,404,413]){
    const s=await setup({saveErrors:[status]});try{
      hangupWithText(s);await s.settle();s.tick(5000);await s.settle();
      assert.equal(s.http.filter(r=>r.path==='/api/call/end').length,1);
      assert(s.document.querySelector('#error button'));
      assert(!s.document.body.classList.contains('leaving-bubble'));
    }finally{s.close();}
  }
});

test('the screen stays awake only during a call and is released even if transport cleanup throws',async()=>{
  const s=await setup({screenMode:'supported',cleanupThrows:true,autoCall:false});try{
    assert.equal(s.screenRequests(),0);
    s.document.getElementById('call-button').click();await s.settle();
    assert.equal(s.screenRequests(),1);assert.equal(s.locks[0].released,false);
    assert.equal(s.document.getElementById('call-hint').textContent,'L’écran reste allumé pendant l’appel.');
    s.visibility('visible');await s.settle();assert.equal(s.screenRequests(),1);
    s.document.getElementById('hangup-button').click();await s.settle();
    assert.equal(s.locks[0].released,true);
    s.visibility('visible');await s.settle();assert.equal(s.screenRequests(),1);
  }finally{s.close();}
});
test('returning to a visible call restores wake protection and audio without asking a new question',async()=>{
  const s=await setup({screenMode:'supported'});try{
    s.question(0);const responses=s.requests().length;
    s.audio().srcObject={};s.audio().paused=true;
    s.visibility('hidden');await s.settle();assert.equal(s.locks[0].released,true);
    assert.equal(s.screenRequests(),1);assert.equal(s.audio().plays,0);
    s.visibility('visible');await s.settle();
    assert.equal(s.screenRequests(),2);assert.equal(s.locks[1].released,false);
    assert.equal(s.audio().paused,false);assert.equal(s.audio().plays,1);
    assert.equal(s.requests().length,responses);
    assert.equal(s.document.getElementById('call-panel').hidden,false);
  }finally{s.close();}
});
test('unsupported or denied screen protection never prevents coaching',async()=>{
  for(const screenMode of ['unsupported','denied']){
    const s=await setup({screenMode,language:'en'});try{
      s.question(0);
      assert.equal(s.document.getElementById('call-panel').hidden,false);
      assert.equal(s.document.getElementById('error').hidden,true);
      assert.equal(s.document.getElementById('call-hint').textContent,'Keep this screen open during the call.');
      assert.equal(s.requests().length,1);
    }finally{s.close();}
  }
});
test('a delayed wake lock is released if the call ended or the page became hidden',async()=>{
  for(const end of [true,false]){
    const s=await setup({screenMode:'deferred'});try{
      assert.equal(s.screenRequests(),1);
      s.visibility('visible');await s.settle();assert.equal(s.screenRequests(),1);
      if(end)s.document.getElementById('hangup-button').click();else s.visibility('hidden');
      await s.settle();s.grants.shift()();await s.settle();
      assert.equal(s.locks[0].released,true);
      if(!end){s.visibility('visible');await s.settle();assert.equal(s.screenRequests(),2);s.grants.shift()();await s.settle();assert.equal(s.locks[1].released,false);}
    }finally{s.close();}
  }
});
test('system revocation updates the hint without a retry loop; timeout and page exit release the lock',async()=>{
  const s=await setup({screenMode:'supported'});try{
    await s.locks[0].release();await s.settle();assert.equal(s.screenRequests(),1);
    assert.equal(s.document.getElementById('call-hint').textContent,'Garde cet écran ouvert pendant l’appel.');
    s.visibility('hidden');s.visibility('visible');await s.settle();
    s.tick(1200000);await s.settle();assert.equal(s.locks[1].released,true);
  }finally{s.close();}
  const leaving=await setup({screenMode:'supported'});try{
    leaving.window.dispatchEvent(new leaving.window.Event('pagehide'));await leaving.settle();
    assert.equal(leaving.locks[0].released,true);assert.equal(leaving.track.stopped,true);
  }finally{leaving.close();}
});
test('blocked audio resume asks for one tap and never advances the protocol',async()=>{
  const s=await setup({screenMode:'supported',language:'en'});try{
    s.question(0);const responses=s.requests().length;
    s.audio().srcObject={};s.audio().paused=true;s.audio().failPlay=true;
    s.visibility('hidden');s.visibility('visible');await s.settle();
    assert.equal(s.document.getElementById('call-hint').textContent,'Tap the screen to resume audio.');
    assert.equal(s.document.getElementById('call-panel').hidden,false);
    s.audio().failPlay=false;s.document.dispatchEvent(new s.window.Event('click'));await s.settle();
    assert.equal(s.audio().paused,false);assert.equal(s.requests().length,responses);
    assert.equal(s.document.getElementById('call-hint').textContent,'The screen stays on during the call.');
  }finally{s.close();}
});
