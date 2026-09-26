import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { QUESTIONS } from '../public/coaching-protocol.js';

// Run the actual UI handlers against fake transport events, not a second implementation.
async function setup({cleanupThrows=false}={}){
  const dom=new JSDOM(await readFile('public/index.html','utf8'),{url:'https://test.example'});
  const document=dom.window.document;document.getElementById('feed').scrollTo=()=>{};
  let peer,clock=0,seq=0;const timers=new Map(),sent=[];
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
    setTimeout:setTimer,clearTimeout:clearTimer,setInterval:()=>0,clearInterval:()=>{},console,
    fetch:async path=>Response.json(path==='/api/status'?{ready:true}:path==='/api/call'?{callId:'fake-call-id',sdp:'v=0\r\n'}:path.startsWith('/api/state')?{threadId:'fake-thread',threads:[],messages:[],notes:[],decisions:[]}:{ok:true})});
  vm.runInContext((await readFile('public/app.js','utf8')).replace(/^import .*;\n/gm,''),context);
  const settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};await settle();
  document.getElementById('call-button').click();await settle();
  const emit=e=>peer.channel.onmessage({data:JSON.stringify(e)});
  function question(i){const id='response-'+i;emit({type:'response.created',response:{id}});emit({type:'response.output_item.added',item:{id:'item-'+i,role:'assistant'}});emit({type:'response.output_audio_transcript.done',response_id:id,item_id:'item-'+i,transcript:QUESTIONS[i]});emit({type:'response.done',response:{id,status:'completed'}});emit({type:'output_audio_buffer.stopped',response_id:id});}
  return {document,sent,emit,question,settle,track,close:()=>dom.window.close(),tick(ms){clock+=ms;for(const [id,t]of [...timers])if(t.at<=clock){timers.delete(id);t.fn();}},requests:()=>sent.filter(x=>x.type==='response.create')};
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
