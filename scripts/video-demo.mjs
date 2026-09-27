// Local-only capture fixture: fictitious Notion documents, actual application and OpenAI agents.
// Nothing is published to a real Notion workspace or the production coaching database.
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'livrables/video/assets');
await mkdir(assets,{recursive:true});
const pages=[
  {id:'11111111-1111-4111-8111-111111111111',title:'Projet Atlas · règles de décision',blocks:[
    'Toutes les décisions du projet Atlas, y compris les ajustements courants, doivent être validées par le manager avant exécution.',
    'L’équipe peut préparer des options et des recommandations. Le manager prend la décision finale et donne son accord dans le compte rendu.',
    'Cette règle peut être revue collectivement lors du prochain point de fonctionnement.'
  ]},
  {id:'22222222-2222-4222-8222-222222222222',title:'Projet Atlas · point d’équipe',blocks:[
    'Le changement de l’ordre des tâches, le choix du format du compte rendu et l’ajustement d’une réunion sont en attente de validation du manager.',
    'L’équipe demande de clarifier quelles décisions courantes elle peut prendre sans solliciter le manager.',
    'Aucune nouvelle règle n’a encore été décidée. La proposition sera discutée avec l’équipe avant tout changement.'
  ]}
];
const cache=resolve(assets,'demo-data.json');
let state;
try{state=JSON.parse(await readFile(cache,'utf8'));console.log('Reusing recorded demo outputs');}catch{
  const vars=await readFile(resolve(root,'.dev.vars'),'utf8');
  const key=vars.split('\n').find(l=>l.startsWith('OPENAI_API_KEY='))?.slice(15).trim().replace(/^["']|["']$/g,'');
  if(!key)throw Error('Missing OpenAI key');
  const built=await build({entryPoints:[resolve(root,'worker/index.ts')],bundle:true,write:false,format:'esm',platform:'browser'});
  const modelRuns=[];
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-09-26',d1Databases:['DB'],bindings:{TEXT_MODEL:'gpt-4.1-mini',OPENAI_API_KEY:key,APP_ACCESS_CODE:'video-demo-local-only',NOTION_REDIRECT_URI:'http://localhost/api/notion/callback',NOTION_CLIENT_ID:'demo',NOTION_CLIENT_SECRET:'demo',NOTION_TOKEN_KEY:'12'.repeat(32)},serviceBindings:{ASSETS:()=>new Response('asset')},outboundService:async req=>{
    const u=new URL(req.url);
    if(u.hostname==='api.openai.com'){
      const input=await req.json();modelRuns.push({role:input.text?.format?.name,model:input.model});
      return fetch(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(input)});
    }
    if(u.pathname==='/v1/oauth/token')return Response.json({access_token:'demo-token',workspace_id:'demo-workspace',workspace_name:'Projet Atlas',owner:{type:'user',user:{id:'demo-user'}}});
    if(u.pathname==='/v1/search')return Response.json({results:pages.map(p=>({id:p.id,properties:{Name:{type:'title',title:[{plain_text:p.title}]}}})),has_more:false});
    const p=pages.find(p=>u.pathname.includes(p.id));
    if(p&&u.pathname.startsWith('/v1/pages/'))return Response.json({id:p.id,last_edited_time:'2026-09-27T00:00:00Z',properties:{Name:{type:'title',title:[{plain_text:p.title}]}}});
    if(p&&u.pathname.includes('/children'))return Response.json({results:p.blocks.map((text,i)=>({id:(p.id.startsWith('1')?'33333333':'44444444')+'-3333-4333-8333-'+String(i+1).padStart(12,'0'),type:'paragraph',paragraph:{rich_text:[{plain_text:text}]}})),has_more:false});
    throw Error('Unexpected demo request '+u.pathname);
  }}));
  const db=await mf.getD1Database('DB');for(const file of (await readdir(resolve(root,'migrations'))).sort())for(const stmt of (await readFile(resolve(root,'migrations',file),'utf8')).split(';').filter(s=>s.trim()))await db.prepare(stmt).run();
  let coachCookie='',notionCookie='';
  async function api(path,data,cookie=path.startsWith('notion/')?notionCookie:coachCookie){
    const r=await mf.dispatchFetch('http://localhost/api/'+path,{method:data?'POST':'GET',headers:{Origin:'http://localhost','Content-Type':'application/json',Cookie:cookie},body:data?JSON.stringify(data):undefined,redirect:'manual'});
    if(r.status>=400)throw Error('Demo API '+path+': '+r.status+' '+await r.text());
    return {headers:r.headers,data:r.headers.get('content-type')?.includes('json')?await r.json():null};
  }
  try{
    const login=await api('login',{code:'video-demo-local-only'});coachCookie=login.headers.get('set-cookie').split(';')[0];
    const tid=(await api('threads',{})).data.id;
    for(const text of ['Je voudrais parler de mon équipe. Toutes les décisions reviennent vers moi et je finis par tout valider.','Je me demande comment leur laisser plus de place pour décider, sans devoir vérifier chaque détail.','Je voudrais clarifier avec mon équipe les décisions courantes qu’elle peut prendre seule.']){
      await api('chat',{threadId:tid,id:crypto.randomUUID(),text,language:'fr'});
    }
    const note=(await api('draft',{threadId:tid,language:'fr'})).data.text;
    await api('notes',{text:note});
    const coach=(await api('state?thread='+tid)).data;
    const auth=await api('notion/start',{});const flow=auth.headers.get('set-cookie').split(';')[0],oauthState=new URL(auth.data.url).searchParams.get('state');
    const cb=await api('notion/callback?state='+oauthState+'&code=demo',null,flow);
    notionCookie=cb.headers.get('set-cookie').match(/hp_notion=[a-f0-9]{64}/)[0];
    const jobId=crypto.randomUUID();
    await api('notion/jobs',{id:jobId,intention:'Je veux clarifier les décisions que mon équipe peut prendre sans mon accord.',pages:pages.map(p=>p.id),language:'fr',consent:true});
    let job;
    for(let i=0;i<180;i++){
      job=(await api('notion/jobs/'+jobId)).data;
      if(job.status!=='pending')break;
      await api('notion/jobs/'+jobId+'/advance',{});await delay(1000);
    }
    if(job.status!=='draft')throw Error('Proposal not ready: '+job.status);
    state={coach,job,pages:pages.map(p=>({id:p.id,title:p.title})),modelRuns,provenance:'Actual OpenAI model calls, fictitious Notion sources, local database only. No real publication.'};
    await writeFile(cache,JSON.stringify(state,null,2));console.log('Captured real model outputs:',modelRuns.map(r=>r.role).join(', '));
  }finally{await mf.dispose();}
}
createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://127.0.0.1:8791');
    if(u.pathname.startsWith('/api/')){
      let data={};
      if(u.pathname==='/api/status')data={ready:true};
      else if(u.pathname==='/api/state')data=(u.searchParams.has('thread')||req.headers.referer?.includes('/demo-session'))?state.coach:{...state.coach,messages:[],threadId:null,threads:[],notes:[],calls:[]};
      else if(u.pathname==='/api/notion/status')data={configured:true,connected:true,workspace:'Projet Atlas'};
      else if(u.pathname==='/api/notion/pages')data={pages:state.pages,nextCursor:null};
      else if(u.pathname==='/api/notion/jobs'&&req.method==='GET')data={jobs:[state.job]};
      else if(u.pathname==='/api/notion/jobs'&&req.method==='POST')data={id:state.job.id};
      else if(u.pathname==='/api/notion/jobs/'+state.job.id)data=state.job;
      else if(u.pathname==='/api/draft')data={text:state.coach.notes[0].text};
      else {res.statusCode=405;data={error:'Capture locale, action non disponible.'};}
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;
    }
    let path=u.pathname==='/'?'/index.html':u.pathname==='/notion'?'/notion.html':u.pathname;
    if(path==='/demo-session')path='/index.html';
    const file=resolve(root,'public','.'+path);if(!file.startsWith(resolve(root,'public')+'/'))throw Error('Forbidden');
    let content=await readFile(file);
    res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':file.endsWith('.svg')?'image/svg+xml':'text/html');
    res.setHeader('Cache-Control','no-store');res.end(content);
  }catch{res.statusCode=404;res.end('Not found');}
}).listen(8791,'127.0.0.1',()=>console.log('Local video captures: http://127.0.0.1:8791'));
