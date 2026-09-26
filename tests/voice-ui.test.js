import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { TurnController } from '../public/turn-controller.js';
import { CoachingProtocol, QUESTIONS } from '../public/coaching-protocol.js';

// Run the actual UI handlers against fake transport events, not a second implementation.
async function setup(){
  const dom=new JSDOM(await readFile('public/index.html','utf8'),{url:'https://test.example'});
  const document=dom.window.document;document.getElementById('feed').scrollTo=()=>{};
  let peer,clock=0,seq=0;const timers=new Map(),sent=[];
  const setTimer=(fn,delay)=>{timers.set(++seq,{fn,at:clock+delay});return seq;};
  const clearTimer=id=>timers.delete(id);
  class Turns extends TurnController{constructor(options){super({...options,setTimer,clearTimer});}}
  class Peer{
    constructor(){peer=this;this.connectionState='connected';}
    addTrack(){} createDataChannel(){return this.channel={readyState:'open',send:e=>sent.push(JSON.parse(e)),close(){}};}
    async createOffer(){return {type:'offer',sdp:'v=0\r\n'};} async setLocalDescription(){}
    async setRemoteDescription(){this.channel.onopen();} close(){}
  }
  const track={stop(){},enabled:true};
  const context=vm.createContext({document,window:dom.window,navigator:{onLine:true,mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})}},
    TurnController:Turns,CoachingProtocol,RTCPeerConnection:Peer,Audio:class{async play(){}pause(){}},crypto,
    setTimeout:setTimer,clearTimeout:clearTimer,setInterval:()=>0,clearInterval:()=>{},console,
    fetch:async path=>Response.json(path==='/api/status'?{ready:true}:path==='/api/call'?{callId:'fake-call-id',sdp:'v=0\r\n'}:path==='/api/state'?{threadId:'fake-thread',threads:[],messages:[],notes:[],decisions:[]}:{ok:true})});
  vm.runInContext((await readFile('public/app.js','utf8')).replace(/^import .*;\n/gm,''),context);
  const settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};await settle();
  document.getElementById('call-button').click();await settle();
  const emit=e=>peer.channel.onmessage({data:JSON.stringify(e)});
  function question(i){const id='response-'+i;emit({type:'response.created',response:{id}});emit({type:'response.output_item.added',item:{id:'item-'+i,role:'assistant'}});emit({type:'response.output_audio_transcript.done',response_id:id,item_id:'item-'+i,transcript:QUESTIONS[i]});emit({type:'response.done',response:{id,status:'completed'}});emit({type:'output_audio_buffer.stopped',response_id:id});}
  return {document,sent,emit,question,settle,close:()=>dom.window.close(),tick(ms){clock+=ms;for(const [id,t]of [...timers])if(t.at<=clock){timers.delete(id);t.fn();}},requests:()=>sent.filter(x=>x.type==='response.create')};
}
test('actual UI continues through missing transcription and natural words without control buttons',async()=>{
  const s=await setup();try{
    for(const name of ['hold-button','floor-button','mute-button'])assert.equal(s.document.getElementById(name),null);
    assert.ok(s.requests()[0].response.instructions.includes(QUESTIONS[0]));s.question(0);
    s.emit({type:'input_audio_buffer.speech_started',item_id:'user-1'});s.emit({type:'input_audio_buffer.speech_stopped',item_id:'user-1'});
    s.emit({type:'conversation.item.input_audio_transcription.failed',item_id:'user-1'});
    s.tick(4999);assert.equal(s.requests().length,1);s.tick(1);assert.equal(s.requests().length,2);assert.ok(s.requests()[1].response.instructions.includes(QUESTIONS[1]));
    s.question(1);s.emit({type:'input_audio_buffer.speech_started',item_id:'user-2'});
    s.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'user-2',transcript:'Je réfléchis à la façon de parler à mon équipe.'});
    s.emit({type:'input_audio_buffer.speech_stopped',item_id:'user-2'});s.tick(5000);assert.equal(s.requests().length,3);assert.ok(s.requests()[2].response.instructions.includes(QUESTIONS[2]));
  }finally{s.close();}
});
test('interrupting an in-flight greeting waits for cancellation, then resumes without losing the turn',async()=>{
  const s=await setup();try{
    s.emit({type:'response.created',response:{id:'old'}});
    s.emit({type:'input_audio_buffer.speech_started',item_id:'user'});s.emit({type:'input_audio_buffer.speech_stopped',item_id:'user'});s.tick(5000);assert.equal(s.requests().length,1);
    s.emit({type:'response.done',response:{id:'old',status:'cancelled'}});assert.equal(s.requests().length,2);
    assert.ok(s.requests()[1].response.instructions.includes(QUESTIONS[0]));
    assert.ok(s.sent.some(e=>e.type==='response.cancel'));
  }finally{s.close();}
});
