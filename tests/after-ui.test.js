import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

async function setup({language='fr',failRecap=false,stored=null,oauth=false,emailAvailable=true}={}){
  const dom=new JSDOM(await readFile('public/notion.html','utf8'),{url:'https://test.example/notion'+(oauth?'?result=connected':'?thread=test-thread&call=test-call')});
  const {document}=dom.window,requests=[],copies=[];
  document.getElementById('language').value=language;
  dom.window.localStorage.setItem('hp_language',language);
  if(stored)for(const [key,value] of Object.entries(stored))dom.window.sessionStorage.setItem(key,value);
  const ctx=vm.createContext({window:dom.window,document,navigator:{clipboard:{writeText:async text=>copies.push(text)}},console,
    fetch:async(path,options={})=>{
      const data=options.body?JSON.parse(options.body):null;requests.push({path,data});
      if(path.startsWith('/api/after?'))return Response.json({scope:'call:test-call',sourceHash:'current',messages:[{role:'user',text:'Test'}],feedbackSubmitted:false,recap:null,emailAvailable});
      if(path==='/api/recap')return failRecap?Response.json({error:'test failure'},{status:502}):Response.json({text:data.language==='en'?'My decision: ask Alex.':'Ma décision : parler à Alex.'});
      return Response.json({ok:true});
    }});
  vm.runInContext(await readFile('public/after.js','utf8'),ctx);
  const settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};await settle();
  const el=id=>document.getElementById(id);
  return {dom,document,el,requests,copies,settle,session:()=>Object.fromEntries(Object.keys(dom.window.sessionStorage).map(k=>[k,dom.window.sessionStorage.getItem(k)]))};
}
test('recap works without Notion, copies edits, and feedback is directly available',async()=>{
  const s=await setup();try{
    assert.equal(s.el('recap').value,'Ma décision : parler à Alex.');assert.equal(s.el('after-content').hidden,false);
    assert.equal(s.el('include-transcript').checked,true);assert.equal(s.el('integrations').open,false);
    assert.equal(s.requests.some(r=>r.path.includes('/notion/')),false);
    s.el('recap').value='Ma version personnelle';s.el('recap').dispatchEvent(new s.dom.window.Event('input'));
    s.el('copy-recap').click();await s.settle();assert.deepEqual(s.copies,['Ma version personnelle']);
    s.document.querySelector('#after-rating input[value="0"]').checked=true;s.el('after-reason').value='Pas utile cette fois';
    s.el('after-feedback-send').click();await s.settle();
    assert.equal(s.requests.find(r=>r.path==='/api/feedback').data.recommendation,0);
    assert.equal(s.el('after-feedback-form').hidden,true);assert.equal(s.el('after-feedback-thanks').hidden,false);
  }finally{s.dom.window.close();}
});
test('OAuth round trip preserves the edited recap and selected conversation',async()=>{
  const s=await setup();let saved;try{s.el('recap').value='Ce sont mes mots';s.el('recap').dispatchEvent(new s.dom.window.Event('input'));saved=s.session();}finally{s.dom.window.close();}
  const next=await setup({oauth:true,stored:saved});try{
    assert.equal(next.el('recap').value,'Ce sont mes mots');assert(!next.requests.some(r=>r.path==='/api/recap'));
    assert.match(next.requests[0].path,/thread=test-thread.*call=test-call/);
  }finally{next.dom.window.close();}
});
test('email sends the edited recap and respects the transcript checkbox',async()=>{
  const s=await setup({language:'en'});try{
    assert.equal(s.el('recap-title').textContent,'Your recap');assert.match(s.el('recap').value,/My decision/);
    s.el('email-open').click();s.el('email-address').value='me@example.com';s.el('recap').value='Edited recap';
    s.el('include-transcript').checked=false;s.el('email-send').click();await s.settle();
    const payload=s.requests.find(r=>r.path==='/api/recap/email').data;
    assert.equal(payload.text,'Edited recap');assert.equal(payload.includeTranscript,false);assert.equal(payload.language,'en');
    assert.equal(s.el('email-form').hidden,true);assert.match(s.el('email-status').textContent,/has been sent/);
  }finally{s.dom.window.close();}
});
test('unavailable email never pretends to send; failed recap still permits a manual recap and feedback',async()=>{
  const s=await setup({failRecap:true,emailAvailable:false});try{
    assert.equal(s.el('recap').disabled,false);assert.equal(s.el('recap-retry').hidden,false);
    s.el('recap').value='Récap manuel';s.el('recap').dispatchEvent(new s.dom.window.Event('input'));
    s.el('email-open').click();assert.equal(s.el('email-form').hidden,true);
    assert.match(s.el('email-status').textContent,/bientôt disponible/);
    assert(!s.requests.some(r=>r.path==='/api/recap/email'));assert.equal(s.el('after-feedback-form').hidden,false);
  }finally{s.dom.window.close();}
});
