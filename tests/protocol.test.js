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
