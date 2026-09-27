import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { QUESTIONS } from '../public/coaching-protocol.js';

// Run the actual UI handlers against fake transport events, not a second implementation.
async function setup({cleanupThrows=false,language='fr',url='https://test.example',signedIn=true,autoCall=true,saveFails=false}={}){
  const dom=new JSDOM(await readFile('public/index.html','utf8'),{url});
  dom.window.localStorage.setItem('hp_language',language);
  const document=dom.window.document;
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};document.getElementById('feed').scrollTo=()=>{};
  let authenticated=signedIn;
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
  const context=vm.createContext({document,window:dom.window,navigator:{onLine:true,mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})}},
    RTCPeerConnection:Peer,Audio:class{constructor(){this.muted=false;}async play(){}pause(){}},crypto,
    setTimeout:setTimer,clearTimeout:clearTimer,setInterval:fn=>{tickers.push(fn);return tickers.length;},clearInterval:()=>{},console,
    fetch:async (path,options)=>{
      const data=options?.body?JSON.parse(options.body):null;http.push({path,data});
      if(path==='/api/login'){if(data.code==='valid-passphrase')authenticated=true;else return Response.json({error:'Ce code d’accès ne correspond pas.'},{status:401});}
      if(path.startsWith('/api/state')&&!authenticated)return Response.json({error:'Code required'},{status:401});
      if(path==='/api/call/end'&&saveFails){saveFails=false;return Response.json({error:'test failure'},{status:500});}
      if(path==='/api/call/end')uiState.calls=[{id:'fake-call-id',ended_at:Date.now(),language,feedback_submitted:0}];
      if(path==='/api/feedback')Object.assign(uiState.calls[0],{feedback_submitted:1});
      return Response.json(path==='/api/status'?{ready:true}:path==='/api/call'?{callId:'fake-call-id',sdp:'v=0\r\n'}:path.startsWith('/api/state')?uiState:{ok:true});
    }});

  const bundled=await build({entryPoints:['public/app.js'],bundle:true,write:false,format:'iife',platform:'browser'});
  vm.runInContext(bundled.outputFiles[0].text,context);
  const settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};await settle();
  if(autoCall){document.getElementById('call-button').click();await settle();}
  const emit=e=>peer.channel.onmessage({data:JSON.stringify(e)});
  function question(i){const id='response-'+i;emit({type:'response.created',response:{id}});emit({type:'response.output_item.added',item:{id:'item-'+i,role:'assistant'}});emit({type:'response.output_audio_transcript.done',response_id:id,item_id:'item-'+i,transcript:QUESTIONS[i]});emit({type:'response.done',response:{id,status:'completed'}});emit({type:'output_audio_buffer.stopped',response_id:id});}
  return {document,window:dom.window,http,sent,emit,question,settle,track,close:()=>dom.window.close(),tick(ms){clock+=ms;for(const ticker of tickers)ticker();for(const [id,t]of [...timers])if(t.at<=clock){timers.delete(id);t.fn();}},requests:()=>sent.filter(x=>x.type==='response.create')};
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
