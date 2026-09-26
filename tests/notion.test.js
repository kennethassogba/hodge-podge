import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const origin='http://localhost',p1='11111111-1111-4111-8111-111111111111',p2='22222222-2222-4222-8222-222222222222',block='33333333-3333-4333-8333-333333333333',published='44444444-4444-4444-8444-444444444444';
const passage='Toutes les décisions doivent être validées par la direction avant exécution.';
let mf,db,cookieA,cookieB,providerCalls=[],notionWrites=0,sourceChanged=false,rejectEvidence=false,reviewApproval=true,ambiguousPublish=false,expiredToken=false,refreshCount=0;
async function request(path,{data,method=data?'POST':'GET',cookie=cookieA,customOrigin=origin,query=''}={}){
 const r=await mf.dispatchFetch(origin+'/api/notion/'+path+query,{method,headers:{Origin:customOrigin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined,redirect:'manual'});return {status:r.status,headers:r.headers,data:r.headers.get('content-type')?.includes('json')?await r.json():null};
}
async function connect(user='alice'){
 const start=await request('start',{data:{},cookie:''});assert.equal(start.status,200);const browser=start.headers.get('set-cookie').split(';')[0],state=new URL(start.data.url).searchParams.get('state');
 const callback=await request('callback',{cookie:browser,query:'?state='+state+'&code='+user});assert.equal(callback.headers.get('location'),'/notion.html?result=connected');const raw=callback.headers.get('set-cookie');return raw.match(/hp_notion=([a-f0-9]{64})/)[0];
}
async function advance(id){const before=await db.prepare('SELECT stage,status FROM notion_jobs WHERE id=?').bind(id).first();await request('jobs/'+id+'/advance',{data:{}});for(let i=0;i<100;i++){const row=await db.prepare('SELECT stage,status,lease_until FROM notion_jobs WHERE id=?').bind(id).first();if(!row||(row.lease_until===0&&(row.stage!==before.stage||row.status!==before.status)))return;await delay(20);}throw Error('job did not settle');}
async function makeJob(){const id=crypto.randomUUID();const r=await request('jobs',{data:{id,intention:'Je veux clarifier les décisions.',pages:[p1],language:'fr',consent:true}});assert.equal(r.status,202);for(let i=0;i<100;i++){const row=await db.prepare('SELECT stage FROM notion_jobs WHERE id=?').bind(id).first();if(row.stage==='investigate')return id;await delay(20);}throw Error('reading did not settle');}
before(async()=>{
 const built=await build({stdin:{contents:"import worker from './worker/index.ts'; export default { async fetch(r,e,c){ if(new URL(r.url).pathname==='/__test_tick'){await worker.scheduled({cron:'* * * * *'},e);return Response.json({ok:true});} return worker.fetch(r,e,c); } };",resolveDir:process.cwd(),sourcefile:'notion-test-entry.js'},bundle:true,write:false,format:'esm',platform:'browser'});
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-09-26',d1Databases:['DB'],bindings:{TEXT_MODEL:'test',NOTION_REDIRECT_URI:origin+'/api/notion/callback',NOTION_CLIENT_ID:'client',NOTION_CLIENT_SECRET:'secret',NOTION_TOKEN_KEY:'12'.repeat(32),OPENAI_API_KEY:'test-key'},serviceBindings:{ASSETS:()=>new Response('asset')},outboundService:async req=>{
   const u=new URL(req.url);const input=req.method==='POST'?await req.json():null;providerCalls.push({path:u.pathname,method:req.method,input});
   if(u.pathname==='/v1/oauth/token'){
    if(input.grant_type==='refresh_token'){refreshCount++;expiredToken=false;return Response.json({access_token:'new-secret-alice',refresh_token:'new-refresh'});}
    const user=input.code;return Response.json({access_token:'secret-'+user,refresh_token:'refresh-'+user,workspace_id:'same-workspace',workspace_name:'Test workspace',owner:{type:'user',user:{id:user}}});
   }
   if(u.pathname==='/v1/oauth/revoke')return Response.json({request_id:'revoked'});
   if(u.hostname==='api.notion.com'&&expiredToken)return Response.json({error:'expired'},{status:401});
   if(u.pathname==='/v1/search')return Response.json({results:[p1,p2].map(id=>({id,properties:{Name:{type:'title',title:[{plain_text:id===p1?'Projet':'Destination'}]}}})),has_more:false});
   if(u.pathname.startsWith('/v1/pages/'))return Response.json({id:u.pathname.split('/').at(-1),last_edited_time:sourceChanged?'2026-09-28T00:00:00Z':'2026-09-27T00:00:00Z',properties:{Name:{type:'title',title:[{plain_text:'Projet'}]}}});
   if(u.pathname.includes('/children'))return Response.json({results:[{id:block,type:'paragraph',paragraph:{rich_text:[{plain_text:passage}]}}],has_more:false});
   if(u.pathname==='/v1/pages'){notionWrites++;if(ambiguousPublish)return new Response('unavailable',{status:500});return Response.json({id:published});}
   if(u.pathname==='/v1/responses'){
    assert.equal(input.store,false);assert(!JSON.stringify(input.input).includes('secret-alice'));const role=input.text.format.name;
    const output=role==='investigator'?{hypothesis:'Une validation centralisée pourrait ralentir les décisions.',evidence:[{source:block,quote:rejectEvidence?'Une citation inventée qui ne figure pas dans le document.':passage,observation:'Le document impose une validation.'}],uncertainties:['Le périmètre est limité.'],enough:true}:role==='reviewer'?{approved:reviewApproval,explanation:'Hypothèse limitée au document.',objections:['À vérifier avec l’équipe.']}:{title:'Proposition de règle de décision',body:'Proposition à discuter : préciser les décisions qui peuvent être prises sans validation.'};
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]});
   }
   throw Error('Unexpected outbound URL '+u.pathname);
 }}));db=await mf.getD1Database('DB');for(const name of (await readdir('migrations')).sort()){const sql=await readFile('migrations/'+name,'utf8');for(const statement of sql.split(';').filter(x=>x.trim()))await db.prepare(statement).run();}
});
after(async()=>{await mf?.dispose();});
test('OAuth is optional, uses state plus browser cookie, rejects CSRF and consumes the callback once',async()=>{
 assert.equal((await request('status',{cookie:''})).data.connected,false);
 assert.equal((await request('pages',{cookie:''})).status,401);
 assert.equal((await request('start',{data:{},customOrigin:'https://attacker.test'})).status,403);
 const start=await request('start',{data:{},cookie:''}),state=new URL(start.data.url).searchParams.get('state'),browser=start.headers.get('set-cookie').split(';')[0];
 assert.match(start.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);
 const bad=await request('callback',{cookie:'',query:'?state='+state+'&code=alice'});assert.match(bad.headers.get('location'),/invalid_state/);
 const denied=await request('callback',{cookie:browser,query:'?state='+state+'&error=access_denied'});assert.match(denied.headers.get('location'),/cancelled/);
 const replay=await request('callback',{cookie:browser,query:'?state='+state+'&code=alice'});assert.match(replay.headers.get('location'),/invalid_state/);
 cookieA=await connect('alice');cookieB=await connect('bob');
 const credentials=(await db.prepare('SELECT credentials FROM notion_accounts').all()).results;assert.equal(credentials.length,2);assert(!JSON.stringify(credentials).includes('secret-alice'));
});
test('same Notion user reconnects across browsers without merging coaching spaces or other workspace users',async()=>{
 const id=await makeJob();const other=await request('jobs/'+id,{cookie:cookieB});assert.equal(other.status,404);
 const again=await connect('alice');assert.equal((await request('jobs/'+id,{cookie:again})).status,200);assert.equal((await db.prepare('SELECT COUNT(*) n FROM visitors').first()).n,0);
 await request('jobs/'+id,{method:'DELETE'});
});
test('three agents cite sources and publication requires explicit approval; duplicate publish creates one page',async()=>{
 const id=await makeJob();assert.equal((await request('jobs',{data:{id:crypto.randomUUID(),intention:'Autre intention',pages:[p1],consent:true}})).status,409);
 await advance(id);await advance(id);await advance(id);
 const job=(await request('jobs/'+id)).data;assert.equal(job.status,'draft');assert.equal(job.findings.evidence[0].quote,passage);assert.equal(notionWrites,0);
 assert.equal((await request('jobs/'+id+'/publish',{data:{parent:p2,title:'Validé',body:'Ma version'}})).status,400);
 assert.equal((await request('jobs/'+id+'/publish',{cookie:cookieB,data:{approved:true,parent:p2,title:'Validé',body:'Ma version'}})).status,404);
 const data={approved:true,parent:p2,title:'Règle à discuter',body:'Ma version relue.'};assert.equal((await request('jobs/'+id+'/publish',{data})).status,200);assert.equal((await request('jobs/'+id+'/publish',{data})).status,200);assert.equal(notionWrites,1);
 const write=providerCalls.find(x=>x.path==='/v1/pages'&&x.method==='POST');assert.equal(write.input.parent.page_id,p2);assert(JSON.stringify(write.input).includes('Ma version relue.'));assert(!JSON.stringify(write.input).includes('Je veux clarifier'));
});
test('invented evidence stops before the reviewer or writer, and a critical reviewer can veto publication',async()=>{
 rejectEvidence=true;const id=await makeJob();await advance(id);assert.equal((await request('jobs/'+id)).data.status,'needs_context');rejectEvidence=false;
 reviewApproval=false;const second=await makeJob();await advance(second);await advance(second);assert.equal((await request('jobs/'+second)).data.status,'needs_context');assert.equal((await request('jobs/'+second+'/publish',{data:{approved:true}})).status,409);reviewApproval=true;
});
test('background scheduler resumes an abandoned lease and refuses publication after sources change',async()=>{
 const id=await makeJob();await db.prepare("UPDATE notion_jobs SET lease_id='abandoned',lease_until=?,attempts=1 WHERE id=?").bind(Date.now()-1,id).run();
 for(let i=0;i<3;i++){const result=await mf.dispatchFetch(origin+'/__test_tick');assert.equal(result.status,200);}
 assert.equal((await request('jobs/'+id)).data.status,'draft');
 sourceChanged=true;const count=notionWrites;assert.equal((await request('jobs/'+id+'/publish',{data:{approved:true,parent:p2,title:'Texte relu',body:'Une proposition'}})).data.error,'sources_changed');assert.equal(notionWrites,count);sourceChanged=false;
 await request('jobs/'+id,{method:'DELETE'});
});
test('refresh tokens rotate, ambiguous publication is not retried, and disconnect cascades only this account',async()=>{
 expiredToken=true;assert.equal((await request('pages')).status,200);assert.equal(refreshCount,1);
 const id=await makeJob();await advance(id);await advance(id);await advance(id);ambiguousPublish=true;const data={approved:true,parent:p2,title:'Test ambigu',body:'Texte relu.'};assert.equal((await request('jobs/'+id+'/publish',{data})).status,409);const count=notionWrites;assert.equal((await request('jobs/'+id+'/publish',{data})).data.error,'publish_unknown');assert.equal(notionWrites,count);ambiguousPublish=false;
 const deletion=await request('connection',{method:'DELETE'});assert.equal(deletion.status,200);assert.equal(deletion.data.revoked,true);assert.equal((await request('status')).data.connected,false);assert.equal((await request('status',{cookie:cookieB})).data.connected,true);assert.equal((await db.prepare('SELECT COUNT(*) n FROM notion_jobs').first()).n,0);
});
