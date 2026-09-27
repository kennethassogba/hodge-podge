import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import {JSDOM} from 'jsdom';
async function setup(connected){const dom=new JSDOM(await readFile('public/notion.html','utf8'),{url:'https://test.example/notion.html'}),requests=[];const id='11111111-1111-4111-8111-111111111111';const job={id,intention:'Test intention',status:'draft',stage:'done',sources:[],findings:{evidence:[]},review:{explanation:'Verified',objections:[]},draft:{title:'Proposal',body:'Test body'}};const context=vm.createContext({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,location:dom.window.location,URLSearchParams,Option:dom.window.Option,crypto,clearTimeout,setTimeout,fetch:async(path,options={})=>{requests.push({path,options});if(path==='/api/state')return Response.json({}, {status:401});return Response.json(path.endsWith('/status')?{connected,configured:true,workspace:'Test'}:path.includes('/pages')?{pages:[{id,title:'Example'}]}:path.endsWith('/jobs')?(options.method==='POST'?{id}:{jobs:[job]}):path.endsWith('/jobs/'+id)?job:{ok:true});}});vm.runInContext(await readFile('public/notion.js','utf8'),context);async function settle(){for(let i=0;i<10;i++)await new Promise(setImmediate);}await settle();return {dom,document:dom.window.document,requests,settle};}
test('Notion login is opt-in and its page never automatically starts OAuth or reads documents',async()=>{const s=await setup(false);try{assert.equal(s.document.getElementById('connect-panel').hidden,false);assert.equal(s.document.getElementById('connected').hidden,true);assert.deepEqual(s.requests.map(r=>r.path),['/api/notion/status']);}finally{s.dom.window.close();}});
test('opening a proposal shows editable content without publishing; approval resets on edits',async()=>{const s=await setup(true);try{s.document.querySelector('#jobs button').click();await s.settle();assert.equal(s.document.getElementById('result').hidden,false);assert.equal(s.document.getElementById('draft-body').value,'Test body');assert.equal(s.document.getElementById('approve').checked,false);assert(!s.requests.some(r=>r.path.endsWith('/publish')));s.document.getElementById('approve').checked=true;s.document.getElementById('draft-body').dispatchEvent(new s.dom.window.Event('input'));assert.equal(s.document.getElementById('approve').checked,false);}finally{s.dom.window.close();}});

test('analysis starts on form submission without an extra consent checkbox',async()=>{
  const s=await setup(true);
  try{
    const submissions=()=>s.requests.filter(r=>r.path==='/api/notion/jobs'&&r.options.method==='POST');
    assert.equal(s.document.getElementById('consent'),null);
    assert.equal(submissions().length,0);
    s.document.getElementById('intention').value='Clarifier les décisions';
    s.document.getElementById('investigate').click();await s.settle();
    assert.equal(submissions().length,0);
    s.document.querySelector('#pages input').checked=true;
    s.document.getElementById('investigate').click();await s.settle();
    assert.equal(submissions().length,1);
    const payload=JSON.parse(submissions()[0].options.body);
    assert.equal(payload.intention,'Clarifier les décisions');assert.equal(payload.pages.length,1);assert.equal(payload.consent,true);
    assert.equal(s.document.getElementById('publish-form').hidden,false);
    assert(!s.requests.some(r=>r.path.endsWith('/publish')));
  }finally{s.dom.window.close();}
});

test('Notion uses the edited recap plus additions as its intention',async()=>{
  const s=await setup(true);try{
    s.document.getElementById('after-content').hidden=false;
    s.document.getElementById('recap').value='Décision : demander à Alex sa proposition vendredi.';
    s.dom.window.dispatchEvent(new s.dom.window.CustomEvent('bulle:recap'));
    assert.equal(s.document.getElementById('intention').required,false);
    s.document.getElementById('intention').value='Précision : avant 14 h.';
    s.document.querySelector('#pages input').checked=true;
    s.document.getElementById('investigate').click();await s.settle();
    const request=s.requests.find(r=>r.path==='/api/notion/jobs'&&r.options.method==='POST');
    assert.equal(JSON.parse(request.options.body).intention,'Décision : demander à Alex sa proposition vendredi.\n\nPrécision : avant 14 h.');
  }finally{s.dom.window.close();}
});
