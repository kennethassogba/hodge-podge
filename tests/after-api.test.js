import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';

let mf, cookie, otherCookie, threadId, callId, db, owner, modelCalls=0, modelInput, emails=[], emailFails=false;
const origin='http://localhost';
async function request(path, data, session=cookie, method=data?'POST':'GET') {
  const response=await mf.dispatchFetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(session?{Cookie:session}:{})},body:data?JSON.stringify(data):undefined});
  return {status:response.status,data:await response.json(),headers:response.headers};
}
before(async()=>{
  const buildResult=await build({entryPoints:['worker/index.ts'],bundle:true,write:false,format:'esm',platform:'browser'});
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:buildResult.outputFiles[0].text,compatibilityDate:'2026-09-26',d1Databases:['DB'],
    bindings:{OPENAI_API_KEY:'test',APP_ACCESS_CODE:'test-access-only',ADMIN_ACCESS_CODE:'test-admin-only-distinct',TEXT_MODEL:'test',VOICE_MODEL:'test',RESEND_API_KEY:'test',EMAIL_FROM:'La Bulle <test@example.com>'},
    serviceBindings:{ASSETS:()=>new Response('asset')},outboundService:async req=>{
      if(req.url==='https://api.resend.com/emails'){
        emails.push({payload:await req.json(),key:req.headers.get('Idempotency-Key')});
        return Response.json(emailFails?{error:'test'}:{id:'email-accepted'}, {status:emailFails?503:200});
      }
      modelCalls++;modelInput=await req.json();
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({theme:'My work priorities.',hasActionOrDecision:true,items:['I will ask Alex.']})}]}]});
    }}));
  db=await mf.getD1Database('DB');
  for(const name of ['0001_initial.sql','0002_feedback.sql','0004_nps.sql','0005_after_bubble.sql'])
    for(const sql of (await readFile('migrations/'+name,'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
  cookie=(await request('login',{code:'test-access-only'},'')).headers.get('set-cookie').split(';')[0];
  otherCookie=(await request('login',{code:'test-access-only'},'')).headers.get('set-cookie').split(';')[0];
  threadId=(await request('threads',{})).data.id;
  owner=(await db.prepare('SELECT owner FROM threads WHERE id=?').bind(threadId).first()).owner;
  callId=crypto.randomUUID();
  await db.prepare('INSERT INTO calls(id,owner,thread_id,created_at,ended_at) VALUES(?,?,?,?,?)').bind(callId,owner,threadId,1,2).run();
  // More than the coach's 40-message history; the recap and attachment must include all of it.
  await db.batch(Array.from({length:64},(_,i)=>db.prepare('INSERT INTO messages(id,thread_id,role,text,source,created_at) VALUES(?,?,?,?,?,?)').bind(callId+'-'+i,threadId,i%2?'assistant':'user',`Phrase ${i} avec des accents éèà.`,'voice',i)));
  await db.prepare('INSERT INTO messages(id,thread_id,role,text,source,created_at) VALUES(?,?,?,?,?,?)').bind('other-message',threadId,'user','Outside this call','text',100).run();
});
after(async()=>{await mf?.dispose();});
test('after-bubble scope includes the full selected call and rejects another owner',async()=>{
  const path=`after?thread=${threadId}&call=${callId}`;
  assert.equal((await request(path,undefined,otherCookie)).status,404);
  const result=await request(path);assert.equal(result.status,200);
  assert.equal(result.data.messages.length,64);assert.equal(result.data.emailAvailable,true);
  assert.equal(result.data.messages[0].text,'Phrase 0 avec des accents éèà.');
  assert.equal(result.data.recap,null);
  assert.equal((await request(`after?thread=${threadId}`)).data.messages.length,65);
});
test('recaps are cached per source and language and invalidated by a correction',async()=>{
  const input={threadId,callId,language:'fr'};
  assert.equal((await request('recap',input,otherCookie)).status,404);
  const first=await request('recap',input);assert.equal(first.status,200);
  const count=modelCalls;await request('recap',input);assert.equal(modelCalls,count);
  assert.equal(modelInput.store,false);assert.equal(JSON.parse(modelInput.input).length,64);
  assert.match(modelInput.instructions,/no action|no.*action/i);
  await request('recap',{...input,language:'en'});assert.equal(modelCalls,count+1);
  await request('messages/'+callId+'-0',{text:'Correction réelle'},cookie,'PATCH');
  assert.equal((await request(`after?thread=${threadId}&call=${callId}`)).data.recap,null);
  const corrected=await request('recap',input);assert.equal(modelCalls,count+2);
  assert.notEqual(corrected.data.sourceHash,first.data.sourceHash);
});
test('an empty bubble cannot create a recap or feedback',async()=>{
  const empty=(await request('threads',{})).data.id,count=modelCalls;
  assert.equal((await request('recap',{threadId:empty})).status,400);
  assert.equal((await request('feedback',{threadId:empty,recommendation:8})).status,400);
  assert.equal(modelCalls,count);
});
test('email sends edited text, escapes HTML, attaches the whole UTF-8 transcript, and deduplicates',async()=>{
  const input={threadId,callId,text:'Mon récap modifié <script>bad</script>',email:'recipient@example.com',includeTranscript:true};
  assert.equal((await request('recap/email',input,otherCookie)).status,404);
  assert.equal((await request('recap/email',{...input,email:'a@example.com\r\nBcc:other@example.com'})).status,400);
  assert.equal((await request('recap/email',{...input,includeTranscript:undefined})).status,400);
  assert.equal(emails.length,0);
  assert.equal((await request('recap/email',input)).status,200);
  const sent=emails.at(-1);assert.equal(sent.payload.text,input.text);assert.doesNotMatch(sent.payload.html,/<script>/);
  const attachment=Buffer.from(sent.payload.attachments[0].content,'base64').toString('utf8');
  assert.match(attachment,/Correction réelle/);assert.match(attachment,/Phrase 63 avec des accents éèà/);assert.doesNotMatch(attachment,/Outside this call/);
  assert.equal((await request('recap/email',input)).data.duplicate,true);assert.equal(emails.length,1);
  assert.equal((await request('recap/email',{...input,includeTranscript:false})).status,200);
  assert.equal(emails.at(-1).payload.attachments,undefined);
  const stored=JSON.stringify((await db.prepare('SELECT * FROM recap_emails').all()).results);
  assert.doesNotMatch(stored,/recipient@example|Mon récap|Correction réelle/);
});
test('uncertain email delivery reuses the idempotency key on retry',async()=>{
  const input={threadId,callId,text:'Second recap',email:'recipient@example.com',includeTranscript:false};
  emailFails=true;assert.equal((await request('recap/email',input)).status,502);
  const previous=emails.at(-1);emailFails=false;
  assert.equal((await request('recap/email',input)).status,200);
  assert.equal(emails.at(-1).key,previous.key);assert.deepEqual(emails.at(-1).payload,previous.payload);
});
test('written bubbles contribute once to NPS, without exposing recaps or conversation',async()=>{
  const input={threadId,recommendation:10,reason:'Helpful',valueEstimate:'An hour',suggestions:''};
  assert.equal((await request('feedback',input,otherCookie)).status,404);
  assert.equal((await request('feedback',input)).status,200);
  await request('feedback',{...input,recommendation:0});
  assert.equal((await request(`after?thread=${threadId}`)).data.feedbackSubmitted,true);
  const login=await request('admin/login',{code:'test-admin-only-distinct'}),admin=login.headers.get('set-cookie').split(';')[0];
  const dashboard=(await request('admin/feedback',undefined,admin)).data;
  assert.equal(dashboard.ratings.responses,1);assert.equal(dashboard.ratings.nps,100);
  assert.doesNotMatch(JSON.stringify(dashboard),/Phrase 63|Correction réelle|Mes prochaines|owner/);
  await request('data',undefined,cookie,'DELETE');
  for(const table of ['recap_emails','session_recaps','feedback_text'])assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,0);
});
