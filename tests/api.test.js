import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

let mf, cookieA, cookieB, threadA, noteA, lastInput, voiceConfig, providerCalls=0;
const origin='http://localhost';
async function request(path,{data,method=data?'POST':'GET',cookie=cookieA,customOrigin=origin}={}){
  const r=await mf.dispatchFetch(origin+'/api/'+path,{method,headers:{'Content-Type':'application/json','Origin':customOrigin,...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});
  return {status:r.status,headers:r.headers,data:await r.json()};
}
before(async()=>{
  const result=await build({entryPoints:['worker/index.ts'],bundle:true,write:false,format:'esm',platform:'browser'});
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-09-26',d1Databases:['DB'],
    bindings:{OPENAI_API_KEY:'test-only-not-real',APP_ACCESS_CODE:'integration-test-access',ADMIN_ACCESS_CODE:'test-only-admin-code-distinct',TEXT_MODEL:'test',VOICE_MODEL:'test',DAILY_TEXT_LIMIT:'150',DAILY_CALL_LIMIT:'12'},
    serviceBindings:{ASSETS:()=>new Response('asset')},
    outboundService:async req=>{
      if(req.url.endsWith('/hangup'))return new Response(null,{status:200});
      if(req.url.endsWith('/realtime/calls')){
        const form=await req.formData();assert.ok(form.get('sdp').endsWith('\r\n'),'SDP requires its final line ending');
        voiceConfig=JSON.parse(form.get('session'));
        return new Response('v=0\r\n',{status:201,headers:{Location:'https://api.openai.com/v1/realtime/calls/test-call-id'}});
      }
      providerCalls++;lastInput=await req.json();
      const draft=lastInput.text?.format?.schema?.properties?.text;
      const latest=Array.isArray(lastInput.input)?lastInput.input.at(-1).content:'';
      const result=draft?{text:'Je souhaite réfléchir avant de répondre.'}:latest.includes('pas d’action')?{reply:'D’accord. Avec quoi repars-tu de cet échange ?',action:'cloturer'}:{reply:'Qu’aimerais-tu éclaircir en premier ?',action:'clarifier'};
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
    }}));
  const db=await mf.getD1Database('DB');const sql=(await Promise.all(['0001_initial.sql','0002_feedback.sql','0004_nps.sql'].map(f=>readFile('migrations/'+f,'utf8')))).join('\n');
  for(const statement of sql.split(';').filter(x=>x.trim()))await db.prepare(statement).run();
});
after(async()=>{await mf?.dispose();});
test('unauthenticated and cross-origin requests are denied',async()=>{
  assert.equal((await request('state')).status,401);
  assert.equal((await request('login',{data:{code:'integration-test-access'},customOrigin:'https://untrusted.example'})).status,403);
  assert.equal((await request('login',{data:{code:'wrong-password'}})).status,401);
});
test('separate browsers get separate spaces',async()=>{
  const a=await request('login',{data:{code:'integration-test-access'}});cookieA=a.headers.get('set-cookie').split(';')[0];assert.match(a.headers.get('set-cookie'),/HttpOnly/);
  const b=await request('login',{data:{code:'integration-test-access'},cookie:''});cookieB=b.headers.get('set-cookie').split(';')[0];assert.notEqual(cookieA,cookieB);
  threadA=(await request('threads',{data:{}})).data.id;
  assert.equal((await request('state?thread='+threadA,{cookie:cookieB})).status,404);
  assert.equal((await request('chat',{cookie:cookieB,data:{threadId:threadA,id:crypto.randomUUID(),text:'Bonjour'}})).status,404);
});
test('real orchestration stores distinct model decisions and deduplicates messages',async()=>{
  const id=crypto.randomUUID();const first=await request('chat',{data:{threadId:threadA,text:'Je prépare un échange.',id}});assert.equal(first.status,200);
  const count=providerCalls;await request('chat',{data:{threadId:threadA,text:'Je prépare un échange.',id}});assert.equal(providerCalls,count);
  await request('chat',{data:{threadId:threadA,text:'Je ne veux pas d’action.',id:crypto.randomUUID()}});
  const s=(await request('state')).data;assert.equal(s.messages.length,4);assert.ok(s.decisions.some(d=>d.action==='cloturer'));assert.equal(s.notes.length,0);
});
test('drafting does not save memory; explicit approval does; next thread receives it',async()=>{
  const draft=await request('draft',{data:{threadId:threadA}});assert.equal(draft.status,200);assert.equal((await request('state')).data.notes.length,0);
  noteA=(await request('notes',{data:{text:draft.data.text}})).data.id;
  const second=(await request('threads',{data:{}})).data.id;
  await request('chat',{data:{threadId:second,text:'On reprend ?',id:crypto.randomUUID()}});
  assert.ok(JSON.stringify(lastInput.input).includes(draft.data.text));assert.equal(lastInput.store,false);
  assert.equal((await request('state',{cookie:cookieB})).data.notes.length,0);
  assert.equal((await request('notes',{cookie:cookieB,data:{id:noteA,text:'Modification interdite'}})).status,404);
});
test('voice session uses native automatic turn-taking and closes only for its owner',async()=>{
  const result=await request('call',{data:{threadId:threadA,sdp:'v=0\r\no=test\r\n'}});assert.equal(result.status,200);
  assert.equal(voiceConfig.audio.input.turn_detection.create_response,true);
  assert.equal(voiceConfig.audio.input.turn_detection.type,'semantic_vad');
  assert.equal(voiceConfig.audio.input.turn_detection.interrupt_response,true);
  assert.equal((await request('call',{data:{threadId:threadA,sdp:'v=0\r\n'}})).status,409);
  assert.equal((await request('call/end',{cookie:cookieB,data:{callId:result.data.callId,messages:[]}})).status,404);
  const ending={callId:result.data.callId,messages:[{role:'user',text:'Parole de test.'}]};
  assert.equal((await request('call/end',{data:ending})).status,200);
  assert.equal((await request('call/end',{data:ending})).status,200);
  const saved=(await request('state?thread='+threadA)).data.messages.filter(x=>x.source==='voice');assert.equal(saved.length,1);
});
test('English prompts, transcription language, noise reduction and unrestricted call count',async()=>{
  for(let i=0;i<14;i++){
    const r=await request('call',{data:{threadId:threadA,sdp:'v=0\r\n',language:'en',microphone:'headset'}});assert.equal(r.status,200);
    assert.equal(r.data.maxSeconds,1200);assert.equal(voiceConfig.audio.input.transcription.language,'en');
    assert.equal(voiceConfig.audio.input.transcription.model,'gpt-4o-transcribe');
    assert.equal(voiceConfig.audio.input.noise_reduction.type,'near_field');assert.match(voiceConfig.instructions,/Welcome to this bubble/);assert.doesNotMatch(voiceConfig.instructions,/Parle français/);
    await request('call/end',{data:{callId:r.data.callId,messages:[],durationSeconds:900,interruptions:2,outcome:'ended'}});
  }
  await request('chat',{data:{threadId:threadA,id:crypto.randomUUID(),text:'Hello',language:'en'}});assert.match(lastInput.instructions,/Speak natural English/);
  await request('draft',{data:{threadId:threadA,language:'en'}});assert.match(lastInput.instructions,/note in English/);
});
test('feedback submits once, validates NPS answers, isolates owners and keeps admin projections private',async()=>{
  const r=await request('call',{data:{threadId:threadA,sdp:'v=0\r\n'}});const callId=r.data.callId;
  assert.equal(voiceConfig.audio.input.noise_reduction.type,'far_field');
  const value={callId,recommendation:0,reason:'An explicit reason',valueEstimate:'30 minutes saved',suggestions:'Larger buttons'};
  assert.equal((await request('feedback',{data:value})).status,404);
  await request('call/end',{data:{callId,messages:[{role:'user',text:'Private sentence, must never be visible to the team.'}],outcome:'error',durationSeconds:65,transcriptionFailures:1}});
  assert.equal((await request('feedback',{cookie:cookieB,data:value})).status,404);
  assert.equal((await request('feedback',{data:{...value,recommendation:11}})).status,400);
  assert.equal((await request('feedback',{data:{...value,recommendation:1.5}})).status,400);
  assert.equal((await request('feedback',{data:{...value,recommendation:null}})).status,400);
  assert.equal((await request('feedback',{data:{...value,recommendation:-1}})).status,400);
  assert.equal((await request('feedback',{data:{...value,reason:'x'.repeat(2001)}})).status,400);
  assert.equal((await request('feedback',{data:{...value,suggestions:42}})).status,400);
  assert.equal((await request('feedback',{data:value})).status,200);
  assert.equal((await request('admin/feedback')).status,401);
  assert.equal((await request('admin/login',{data:{code:'integration-test-access'}})).status,401);
  const a=await request('admin/login',{data:{code:'test-only-admin-code-distinct'}});const admin=a.headers.get('set-cookie').split(';')[0];
  assert.match(a.headers.get('set-cookie'),/HttpOnly/);assert.match(a.headers.get('set-cookie'),/Path=\/api\/admin/);
  let dashboard=(await request('admin/feedback',{cookie:admin})).data;
  assert.equal(dashboard.ratings.responses,1);assert.equal(dashboard.ratings.nps,-100);assert.equal(dashboard.summary.errors,1);
  assert.equal(dashboard.entries[0].reason,value.reason);assert.equal(dashboard.entries[0].value_estimate,value.valueEstimate);assert.equal(dashboard.entries[0].suggestions,value.suggestions);assert.doesNotMatch(JSON.stringify(dashboard),/Private sentence|owner|provider_id|thread_id|token_hash/);
  await request('feedback',{data:{...value,recommendation:10}});dashboard=(await request('admin/feedback',{cookie:admin})).data;
  assert.equal(dashboard.ratings.responses,1);assert.equal(dashboard.ratings.nps,-100);assert.equal((await request('state?thread='+threadA)).data.calls.find(c=>c.id===callId).feedback_submitted,1);
  await request('feedback/'+callId,{cookie:cookieB,method:'DELETE'});assert.equal((await request('admin/feedback',{cookie:admin})).data.ratings.responses,1);
  await request('feedback/'+callId,{method:'DELETE'});assert.equal((await request('admin/feedback',{cookie:admin})).data.ratings.responses,0);assert.equal((await request('admin/feedback',{cookie:admin})).data.ratings.nps,null);
  await request('feedback',{data:value});
  await request('admin/logout',{cookie:admin,data:{}});assert.equal((await request('admin/feedback',{cookie:admin})).status,401);
  const saved=(await request('state?thread='+threadA)).data.messages.find(m=>m.text.startsWith('Private sentence'));
  assert.equal((await request('messages/'+saved.id,{cookie:cookieB,method:'PATCH',data:{text:'Forbidden'}})).status,404);
  assert.equal((await request('messages/'+saved.id,{method:'PATCH',data:{text:'Corrected by the speaker.'}})).status,200);
  assert.equal((await request('state?thread='+threadA)).data.messages.find(m=>m.id===saved.id).text,'Corrected by the speaker.');
  assert.equal((await request('messages/'+saved.id,{method:'DELETE'})).status,200);
});
test('NPS uses all valid responses, handles boundaries and excludes the previous questionnaire',async()=>{
  const db=await mf.getD1Database('DB');const owner=(await db.prepare('SELECT owner FROM threads WHERE id=?').bind(threadA).first()).owner;
  // The previous test left a zero. Add 6,7,8,9,10: two promoters and two detractors out of six.
  const added=[];
  for(const recommendation of [6,7,8,9,10]){
    const callId=crypto.randomUUID();added.push(callId);
    await db.prepare('INSERT INTO calls(id,owner,thread_id,created_at,ended_at) VALUES(?,?,?,?,?)').bind(callId,owner,threadA,Date.now(),Date.now()).run();
    assert.equal((await request('feedback',{data:{callId,recommendation}})).status,200);
  }
  const legacyId=crypto.randomUUID();added.push(legacyId);
  await db.prepare('INSERT INTO calls(id,owner,thread_id,created_at,ended_at) VALUES(?,?,?,?,?)').bind(legacyId,owner,threadA,Date.now(),Date.now()).run();
  await db.prepare('INSERT INTO feedback(call_id,owner,clarity,quality,comment,language,created_at,updated_at) VALUES(?,?,10,10,?,\'fr\',?,?)').bind(legacyId,owner,'Previous questionnaire',Date.now(),Date.now()).run();
  const login=await request('admin/login',{data:{code:'test-only-admin-code-distinct'}});const admin=login.headers.get('set-cookie').split(';')[0];
  let data=(await request('admin/feedback',{cookie:admin})).data;
  assert.equal(data.ratings.responses,6);assert.equal(data.ratings.promoters,2);assert.equal(data.ratings.passives,2);assert.equal(data.ratings.detractors,2);assert.equal(data.ratings.nps,0);
  assert.ok(data.entries.some(e=>e.recommendation===null&&e.comment==='Previous questionnaire'));
  await request('feedback/'+added[0],{method:'DELETE'});
  data=(await request('admin/feedback',{cookie:admin})).data;assert.equal(data.ratings.nps,20);
  for(const callId of added)await db.prepare('DELETE FROM calls WHERE id=?').bind(callId).run();
});
test('notes can be corrected and removed; deletion removes personal data',async()=>{
  await request('notes',{data:{id:noteA,text:'Correction choisie.'}});assert.equal((await request('state')).data.notes[0].text,'Correction choisie.');
  await request('notes/'+noteA,{method:'DELETE'});assert.equal((await request('state')).data.notes.length,0);
  await request('data',{method:'DELETE'});assert.equal((await request('state')).status,401);
  const db=await mf.getD1Database('DB');assert.equal((await db.prepare('SELECT count(*) as n FROM messages').first()).n,0);
  assert.equal((await db.prepare('SELECT count(*) as n FROM feedback').first()).n,0);
  assert.equal((await db.prepare('SELECT count(*) as n FROM feedback_nps').first()).n,0);
  assert.equal((await db.prepare('SELECT count(*) as n FROM calls').first()).n,0);
});
