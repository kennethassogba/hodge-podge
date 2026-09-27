import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatRecap} from '../worker/prompts.js';

test('no-action recaps are one theme sentence and an explicit absence of decisions',()=>{
  assert.equal(formatRecap({theme:'ma fatigue au travail',hasActionOrDecision:false,items:[]}),
    'Cette bulle portait sur ma fatigue au travail.\n\nAucune action ni décision n’est ressortie de cette bulle.');
  assert.equal(formatRecap({theme:'my work priorities.',hasActionOrDecision:false,items:[]},'en'),
    'This bubble focused on my work priorities.\n\nNo action or decision emerged from this bubble.');
  assert.throws(()=>formatRecap({theme:'Work',hasActionOrDecision:true,items:[]}));
});
