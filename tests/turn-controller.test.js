import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TurnController } from '../public/turn-controller.js';

function setup(){
  let time=0,replies=0,interruptions=0,seq=0;const tasks=new Map();
  const controller=new TurnController({respond:()=>replies++,interrupt:()=>interruptions++,
    setTimer:(fn,delay)=>{tasks.set(++seq,{at:time+delay,fn});return seq;},clearTimer:id=>tasks.delete(id)});
  controller.start();
  return {controller,get replies(){return replies;},get interruptions(){return interruptions;},tick(ms){time+=ms;for(const [id,t]of [...tasks])if(t.at<=time){tasks.delete(id);t.fn();}}};
}
test('a pause protects the whole five seconds, then allows one response',()=>{
  const s=setup();s.controller.speechStart();s.controller.speechStop('a');s.controller.transcriptDone('a');s.tick(4999);assert.equal(s.replies,0);s.tick(1);assert.equal(s.replies,1);s.tick(10000);assert.equal(s.replies,1);
});
test('speech at 4.8 seconds invalidates the earlier timer',()=>{
  const s=setup();s.controller.speechStop('a');s.controller.transcriptDone('a');s.tick(4800);s.controller.speechStart();s.tick(200);assert.equal(s.replies,0);s.controller.speechStop('b');s.controller.transcriptDone('b');s.tick(4999);assert.equal(s.replies,0);s.tick(1);assert.equal(s.replies,1);
});
test('voluntary pause persists through new speech and a long silence',()=>{
  const s=setup();s.controller.hold();s.controller.speechStart();s.controller.speechStop('a');s.controller.transcriptDone('a');s.tick(20000);assert.equal(s.replies,0);s.controller.giveFloor();assert.equal(s.replies,1);
});
test('late transcripts cannot produce a question on partial input',()=>{
  const s=setup();s.controller.speechStop('a');s.tick(6000);assert.equal(s.replies,0);s.controller.transcriptDone('a');assert.equal(s.replies,1);
});
test('muting and disconnecting suppress pending replies',()=>{
  const s=setup();s.controller.speechStop('a');s.controller.transcriptDone('a');s.controller.mute(true);s.tick(10000);assert.equal(s.replies,0);s.controller.mute(false);s.controller.stop();s.tick(10000);assert.equal(s.replies,0);
});
test('give-floor waits for ongoing speech and pending transcription',()=>{
  const s=setup();s.controller.speechStart();s.controller.giveFloor();assert.equal(s.replies,0);s.controller.speechStop('a');s.controller.giveFloor();assert.equal(s.replies,0);s.controller.transcriptDone('a');assert.equal(s.replies,1);
});
