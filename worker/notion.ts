import {NotionEnv,NotionError,account,ready,reply,reject,cookie,sessionCookie,random,sha,seal,unseal,oauth,notion,cleanText,pageId,limitedJSON,notionURL} from './notion-core';
import {advanceJob,Source} from './notion-agents';
const flowCookie=(r:Request,value:string,age=600)=>`hp_notion_flow=${value}; HttpOnly; SameSite=Lax; Path=/api/notion/callback; Max-Age=${age}${new URL(r.url).protocol==='https:'?'; Secure':''}`;
const redirect=(r:Request,result:string,session?:string)=>{const headers=new Headers({'Location':'/notion.html?result='+result,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});headers.append('Set-Cookie',flowCookie(r,'',0));if(session)headers.append('Set-Cookie',sessionCookie(r,session));return new Response(null,{status:303,headers});};
async function route(r:Request,env:NotionEnv,ctx:ExecutionContext){
  const url=new URL(r.url),path=url.pathname.replace('/api/notion',''),method=r.method;
  if(method!=='GET'&&(r.headers.get('origin')!==url.origin||r.headers.get('sec-fetch-site')==='cross-site'))return reject(403,'invalid_origin');
  if(path==='/status'&&method==='GET'){
    let who;try{who=await account(r,env);}catch(e){if(!(e instanceof NotionError)||e.status!==401)throw e;}
    return reply({configured:ready(env),connected:!!who,workspace:who?.workspace_name??null});
  }
  if(path==='/start'&&method==='POST'){
    if(!ready(env))return reject(503,'not_configured');
    if(new URL(env.NOTION_REDIRECT_URI!).origin!==url.origin)return reject(400,'invalid_redirect');
    const bucket=Math.floor(Date.now()/600000),ip=await sha(r.headers.get('cf-connecting-ip')??'local');
    const rate=await env.DB.prepare('INSERT INTO quotas(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<20 RETURNING count').bind(`notion-oauth:${ip}:${bucket}`,(bucket+1)*600000).first();if(!rate)return reject(429,'try_later');
    const state=random(),browser=random();await env.DB.prepare('INSERT INTO notion_oauth_states(state_hash,browser_hash,expires_at) VALUES(?,?,?)').bind(await sha(state),await sha(browser),Date.now()+600000).run();
    const auth=new URL('https://api.notion.com/v1/oauth/authorize');auth.search=new URLSearchParams({client_id:env.NOTION_CLIENT_ID!,redirect_uri:env.NOTION_REDIRECT_URI!,response_type:'code',owner:'user',state}).toString();
    return reply({url:auth.href},200,{'Set-Cookie':flowCookie(r,browser)});
  }
  if(path==='/callback'&&method==='GET'){
    const state=url.searchParams.get('state')??'',browser=cookie(r,'hp_notion_flow');
    if(!/^[a-f0-9]{64}$/.test(state)||!/^[a-f0-9]{64}$/.test(browser))return redirect(r,'invalid_state');
    const flow=await env.DB.prepare('DELETE FROM notion_oauth_states WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING state_hash').bind(await sha(state),await sha(browser),Date.now()).first();
    if(!flow)return redirect(r,'invalid_state');
    if(url.searchParams.has('error'))return redirect(r,'cancelled');
    try{
      const code=cleanText(url.searchParams.get('code'),2000);
      const token=await oauth(env,'token',{grant_type:'authorization_code',code,redirect_uri:env.NOTION_REDIRECT_URI});
      // A workspace bot alone is not a personal identity. Never merge by workspace/bot ID.
      if(token.owner?.type!=='user'||typeof token.owner.user?.id!=='string'||typeof token.workspace_id!=='string'||typeof token.access_token!=='string')return redirect(r,'identity_unavailable');
      const owner=await sha(token.workspace_id+':'+token.owner.user.id),session=random(),expires=Date.now()+30*86400000;
      await env.DB.batch([
        env.DB.prepare('DELETE FROM notion_accounts WHERE id=? AND expires_at<?').bind(owner,Date.now()),
        env.DB.prepare(`INSERT INTO notion_accounts(id,workspace_name,credentials,created_at,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET credentials=excluded.credentials,workspace_name=excluded.workspace_name,expires_at=excluded.expires_at,refresh_until=0`).bind(owner,String(token.workspace_name??'Notion').slice(0,200),await seal(env,owner,{access_token:token.access_token,refresh_token:typeof token.refresh_token==='string'?token.refresh_token:undefined}),Date.now(),expires),
        env.DB.prepare('INSERT INTO notion_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').bind(await sha(session),owner,expires),
      ]);
      return redirect(r,'connected',session);
    }catch{return redirect(r,'connection_failed');}
  }
  const who=await account(r,env);
  if(path==='/logout'&&method==='POST'){
    await env.DB.prepare('DELETE FROM notion_sessions WHERE token_hash=?').bind(await sha(cookie(r,'hp_notion'))).run();
    return reply({ok:true},200,{'Set-Cookie':sessionCookie(r,'',0)});
  }
  if(path==='/connection'&&method==='DELETE'){
    const active=await env.DB.prepare("SELECT id FROM notion_jobs WHERE account_id=? AND status='publishing' AND lease_until>?").bind(who.id,Date.now()).first();if(active)return reject(409,'publication_busy');
    // Delete local credentials/jobs even when the provider cannot confirm revocation.
    await env.DB.prepare('DELETE FROM notion_accounts WHERE id=?').bind(who.id).run();
    let revoked=false;try{const credentials=await unseal(env,who.id,who.credentials);await oauth(env,'revoke',{token:credentials.access_token});revoked=true;}catch{}
    return reply({ok:true,revoked},200,{'Set-Cookie':sessionCookie(r,'',0)});
  }
  if(path==='/pages'&&method==='GET'){
    const cursor=url.searchParams.get('cursor'),query=url.searchParams.get('q')??'';if(query.length>100||cursor&&cursor.length>200)return reject(400,'invalid_input');
    const data=await notion(env,who.id,'/search','POST',{filter:{value:'page',property:'object'},page_size:50,...(query?{query}:{}),...(cursor?{start_cursor:cursor}:{})});
    const pages=(data.results??[]).filter((p:any)=>!p.archived&&!p.in_trash).map((p:any)=>({id:pageId(p.id),title:(Object.values(p.properties??{}).find((v:any)=>v.type==='title') as any)?.title?.map((t:any)=>t.plain_text??t.text?.content??'').join('')||'Untitled',url:notionURL(pageId(p.id))}));
    return reply({pages,nextCursor:data.has_more?data.next_cursor:null});
  }
  if(path==='/jobs'&&method==='GET'){
    const jobs=(await env.DB.prepare('SELECT id,intention,stage,status,error,created_at,published_url FROM notion_jobs WHERE account_id=? ORDER BY created_at DESC LIMIT 30').bind(who.id).all()).results;return reply({jobs});
  }
  if(path==='/jobs'&&method==='POST'){
    const input=await limitedJSON(r,20000),id=pageId(input.id),intention=cleanText(input.intention,2500);
    if(input.consent!==true||!Array.isArray(input.pages)||input.pages.length<1||input.pages.length>3)return reject(400,'consent_and_pages');
    const pages=[...new Set(input.pages.map(pageId))];
    const duplicate=await env.DB.prepare('SELECT id FROM notion_jobs WHERE id=? AND account_id=?').bind(id,who.id).first();if(duplicate)return reply({id},200);
    try{await env.DB.prepare('INSERT INTO notion_jobs(id,account_id,intention,language,page_ids,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,who.id,intention,input.language==='en'?'en':'fr',JSON.stringify(pages),Date.now(),Date.now()).run();}catch{return reject(409,'job_busy');}
    ctx.waitUntil(advanceJob(env,id));return reply({id},202);
  }
  const match=path.match(/^\/jobs\/([a-f0-9-]{36})(?:\/(advance|publish))?$/);
  if(match){
    const id=pageId(match[1]),action=match[2];
    const job=await env.DB.prepare('SELECT * FROM notion_jobs WHERE id=? AND account_id=?').bind(id,who.id).first<Record<string,any>>();if(!job)return reject(404,'not_found');
    if(!action&&method==='GET')return reply({id,intention:job.intention,language:job.language,stage:job.stage,status:job.status,error:job.error,sources:JSON.parse(job.sources),findings:job.findings?JSON.parse(job.findings):null,review:job.review?JSON.parse(job.review):null,draft:job.draft?JSON.parse(job.draft):null,publishedUrl:job.published_url});
    if(!action&&method==='DELETE'){
      if(job.status==='publishing'&&job.lease_until>Date.now())return reject(409,'publication_busy');
      await env.DB.prepare('DELETE FROM notion_jobs WHERE id=? AND account_id=?').bind(id,who.id).run();return reply({ok:true});
    }
    if(action==='advance'&&method==='POST'){ctx.waitUntil(advanceJob(env,id));return reply({ok:true},202);}
    if(action==='publish'&&method==='POST'){
      const input=await limitedJSON(r,15000);if(input.approved!==true)return reject(400,'approval_required');
      if(job.status==='published')return reply({url:job.published_url});
      if(job.status!=='draft')return reject(409,job.status==='publish_unknown'?'publish_unknown':'not_ready');
      const parent=pageId(input.parent),title=cleanText(input.title,120),text=cleanText(input.body,6000);
      const destination=await notion(env,who.id,`/pages/${parent}`);if(destination.archived||destination.in_trash)return reject(403,'page_access');
      const sourcePages=new Map((JSON.parse(job.sources) as Source[]).filter(s=>s.edited).map(s=>[s.page,s.edited]));
      for(const [source,edited]of sourcePages){const fresh=source===parent?destination:await notion(env,who.id,`/pages/${source}`);if(fresh.archived||fresh.in_trash||fresh.last_edited_time!==edited)return reject(409,'sources_changed');}
      const locked=await env.DB.prepare("UPDATE notion_jobs SET status='publishing',lease_until=?,publish_title=?,publish_body=?,publish_parent=? WHERE id=? AND account_id=? AND status='draft'").bind(Date.now()+90000,title,text,parent,id,who.id).run();if(!locked.meta.changes)return reject(409,'publication_busy');
      const sources=JSON.parse(job.sources) as Source[],evidence=JSON.parse(job.findings).evidence as {source:string;quote:string}[];
      const paragraph=(content:string)=>({object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content}}]}});
      const paragraphs=text.split(/\n\s*\n/).flatMap(line=>line.match(/[\s\S]{1,1800}/g)??[]);
      const children:object[]=paragraphs.map(paragraph);
      children.push(paragraph(job.language==='en'?'Sources examined (excerpts; not a complete audit)':'Sources examinées (extraits ; ce n’est pas un audit complet)'));
      for(const e of evidence){const s=sources.find(s=>s.id===e.source);if(s)children.push(paragraph(`${s.title}\n${e.quote}\n${s.url}`));}
      try{
        // One create request only: an ambiguous timeout must never silently duplicate a page.
        const page=await notion(env,who.id,'/pages','POST',{parent:{type:'page_id',page_id:parent},properties:{title:{type:'title',title:[{type:'text',text:{content:title}}]}},children});
        const link=notionURL(pageId(page.id));await env.DB.prepare("UPDATE notion_jobs SET status='published',published_url=?,updated_at=? WHERE id=? AND account_id=?").bind(link,Date.now(),id,who.id).run();return reply({url:link});
      }catch(e){
        const definite=e instanceof NotionError&&[401,403,429].includes(e.status);
        await env.DB.prepare('UPDATE notion_jobs SET status=?,error=?,updated_at=? WHERE id=? AND account_id=?').bind(definite?'draft':'publish_unknown',definite?(e as NotionError).code:'publish_unknown',Date.now(),id,who.id).run();
        if(definite)throw e;return reject(409,'publish_unknown');
      }
    }
  }
  return reject(404,'not_found');
}
export async function notionRoute(request:Request,env:NotionEnv,ctx:ExecutionContext){
  try{return await route(request,env,ctx);}catch(error){return reply({error:error instanceof NotionError?error.code:'notion_unavailable'},error instanceof NotionError?error.status:502);}
}
