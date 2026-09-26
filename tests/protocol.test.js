import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../public/coaching-protocol.js';
import { VOICE } from '../worker/prompts.js';
test('voice instructions preserve the fourteen questions in order and never require manual turns',()=>{
  assert.equal(QUESTIONS.length,14);assert.equal(new Set(QUESTIONS).size,14);
  let previous=-1;for(const q of QUESTIONS){const at=VOICE.indexOf(q);assert.ok(at>previous);previous=at;}
  assert.match(VOICE,/Ne réclame jamais un bouton/);
  assert.match(VOICE,/après la réponse/i);
});

test('both languages explicitly permit skipping and ending without a forced debrief',async()=>{
  const {coachPrompt,voicePrompt,draftPrompt}=await import('../worker/prompts.js');
  const {QUESTIONS_EN}=await import('../public/coaching-protocol.js');
  assert.equal(QUESTIONS_EN.length,14);
  let previous=-1;for(const q of QUESTIONS_EN){const at=voicePrompt('en').indexOf(q);assert.ok(at>previous);previous=at;}
  assert.match(coachPrompt('fr'),/passer une question/);assert.match(coachPrompt('fr'),/refuse le débrief/);
  assert.match(voicePrompt('en'),/wants to take action now/);assert.match(voicePrompt('en'),/without another question/);
  assert.match(voicePrompt('fr'),/français de France/);assert.match(draftPrompt('en'),/omit incoherent or uncertain fragments/);
});
