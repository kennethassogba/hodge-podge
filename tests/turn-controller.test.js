import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TurnController } from '../public/turn-controller.js';
import { CoachingProtocol, QUESTIONS } from '../public/coaching-protocol.js';
function setup(){
  let time=0,replies=0,available=true,seq=0;const tasks=new Map();
  const controller=new TurnController({respond:()=>{if(!available)return false;replies++;return true;},interrupt:()=>{},
    setTimer:(fn,delay)=>{tasks.set(++seq,{at:time+delay,fn});return seq;},clearTimer:id=>tasks.delete(id)});
  controller.start();
  return {controller,set available(v){available=v;},get replies(){return replies;},tick(ms){time+=ms;for(const [id,t]of [...tasks])if(t.at<=time){tasks.delete(id);t.fn();}}};
}
test('audio continues after five seconds with no transcription event',()=>{
  const s=setup();s.controller.speechStart();s.controller.speechStop('a');s.tick(4999);assert.equal(s.replies,0);s.tick(1);assert.equal(s.replies,1);s.tick(10000);assert.equal(s.replies,1);
});
test('speech at 4.8 seconds restarts the protected silence',()=>{
  const s=setup();s.controller.speechStop();s.tick(4800);s.controller.speechStart();s.tick(200);assert.equal(s.replies,0);s.controller.speechStop();s.tick(5000);assert.equal(s.replies,1);
});
test('a response still cancelling cannot consume and lose the next turn',()=>{
  const s=setup();s.available=false;s.controller.speechStop();s.tick(5000);assert.equal(s.replies,0);s.available=true;s.controller.responseDone();assert.equal(s.replies,1);s.tick(250);assert.equal(s.replies,1);
});
test('disconnect cancels a pending reply and cancellation retry',()=>{
  const s=setup();s.available=false;s.controller.speechStop();s.tick(5000);s.controller.stop();s.available=true;s.tick(250);assert.equal(s.replies,0);
});
test('successive spoken turns continue without commands or transcript callbacks',()=>{
  const s=setup();for(let i=1;i<=4;i++){s.controller.speechStart();s.controller.speechStop();s.tick(5000);assert.equal(s.replies,i);s.controller.responseDone();}
});
test('protocol preserves all fourteen questions, ordering and the final debrief',()=>{
  const p=new CoachingProtocol();assert.equal(QUESTIONS.length,14);
  for(const q of QUESTIONS){assert.ok(p.instructions().includes(q));p.heard(q);}
  assert.equal(p.next,14);assert.match(p.instructions(),/Ne pose aucune autre question/);
});
test('explanations or paraphrases do not skip the prescribed question',()=>{
  const p=new CoachingProtocol();p.heard('Bonjour, de quoi veux-tu parler ?');assert.equal(p.next,0);p.heard(QUESTIONS[0].replaceAll('’',"'"));assert.equal(p.next,1);p.heard('Je peux répéter.');assert.equal(p.next,1);
});
