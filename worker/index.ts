import { COACH, VOICE, DRAFT, replySchema, noteSchema } from './prompts.js';

type Secrets = { OPENAI_API_KEY?: string; APP_ACCESS_CODE?: string };
type Bindings = Env & Secrets;
type Message = { id: string; role: 'user' | 'assistant'; text: string; source: string; created_at: number };
type Visitor = { id: string };
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const now = () => Date.now();
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };
const json = (data: unknown, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const id = (value: unknown) => typeof value === 'string' && /^[\w-]{8,100}$/.test(value) ? value : fail(400, 'Identifiant invalide.');
const text = (value: unknown, max = 6000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : fail(400, 'Texte vide ou trop long.');
async function hash(value: string) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function equals(a: string, b: string) { const x = await hash(a), y = await hash(b); let diff = 0; for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i); return diff === 0; }
async function boundedBody(request: Request, limit = new URL(request.url).pathname === '/api/call/end' ? 600000 : 50000) {
  if (Number(request.headers.get('content-length')) > limit) fail(413, 'Contenu trop volumineux.');
  const reader = request.body?.getReader(); if (!reader) return '';
  let count = 0; const chunks: Uint8Array[] = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; count += value.length; if (count > limit) { await reader.cancel(); fail(413, 'Contenu trop volumineux.'); } chunks.push(value); }
  const bytes = new Uint8Array(count); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return new TextDecoder().decode(bytes);
}
async function body(request: Request): Promise<Record<string, unknown>> {
  try { const v = JSON.parse(await boundedBody(request)); if (!v || typeof v !== 'object' || Array.isArray(v)) fail(400, 'Requête invalide.'); return v; }
  catch (e) { if (e instanceof HttpError) throw e; return fail(400, 'Requête JSON invalide.'); }
}
async function quota(env: Bindings, key: string, limit: number, seconds = 86400) {
  const bucket = Math.floor(now() / (seconds * 1000));
  const result = await env.DB.prepare('INSERT INTO quotas(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count')
    .bind(`${key}:${bucket}`, (bucket + 1) * seconds * 1000, limit).first();
  if (!result) fail(429, 'La limite de cet essai est atteinte. Réessaie plus tard.');
}
async function visitor(request: Request, env: Bindings): Promise<Visitor> {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)hp_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return fail(401, 'Ouvre ton espace avec le code de l’équipe.');
  const row = await env.DB.prepare('SELECT id FROM visitors WHERE token_hash=? AND expires_at>?').bind(await hash(token), now()).first<Visitor>();
  if (!row) return fail(401, 'Ta session a expiré. Reconnecte-toi.');
  return row;
}
async function thread(env: Bindings, owner: string, value: unknown) {
  const key = id(value);
  if (!await env.DB.prepare('SELECT id FROM threads WHERE id=? AND owner=?').bind(key, owner).first()) fail(404, 'Conversation introuvable.');
  return key;
}
async function history(env: Bindings, threadId: string) {
  const { results } = await env.DB.prepare('SELECT id,role,text,source,created_at FROM (SELECT * FROM messages WHERE thread_id=? ORDER BY created_at DESC, rowid DESC LIMIT 40) ORDER BY created_at ASC').bind(threadId).all<Message>();
  return results;
}
async function memory(env: Bindings, owner: string) { return (await env.DB.prepare('SELECT id,text,created_at FROM notes WHERE owner=? ORDER BY created_at DESC LIMIT 20').bind(owner).all<{id:string;text:string;created_at:number}>()).results; }
async function openai(env: Bindings, path: string, init: RequestInit) {
  if (!env.OPENAI_API_KEY) return fail(503, 'La clé OpenAI n’est pas encore configurée. ');
  let response: Response;
  try { response = await fetch(`https://api.openai.com/v1/${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(45000) }); }
  catch { return fail(502, 'OpenAI ne répond pas. Ton texte reste disponible pour réessayer.'); }
  if (!response.ok) {
    const detail=await response.json().catch(()=>({})) as {error?:{code?:string;param?:string}};
    console.error(JSON.stringify({event:'provider_failed',status:response.status,code:detail.error?.code,param:detail.error?.param}));
    return fail(response.status === 429 ? 429 : 502, response.status === 429 ? 'OpenAI signale une limite de débit ou de crédits. Réessaie plus tard.' : 'La connexion OpenAI a échoué. Vérifie la clé et l’accès au modèle côté serveur.');
  }
  return response;
}
async function generate(env: Bindings, instructions: string, input: unknown, schema: object) {
  const response = await openai(env, 'responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    model: env.TEXT_MODEL, instructions, input, store: false, max_output_tokens: 700,
    text: { format: { type: 'json_schema', name: 'coach_result', strict: true, schema } },
  }) });
  const result = await response.json() as { status?:string; output?: {content?:{type:string;text?:string}[]}[] };
  if (result.status === 'incomplete') fail(502, 'La réponse est incomplète. Réessaie avec un message plus court.');
  const content = result.output?.flatMap(x => x.content ?? []).filter(x => x.type === 'output_text').map(x => x.text ?? '').join('');
  try { return JSON.parse(content || '') as Record<string, unknown>; } catch { return fail(502, 'Le coach n’a pas pu formuler de réponse. Réessaie.'); }
}
async function lock(env: Bindings, owner: string) {
  const changed = await env.DB.prepare('UPDATE visitors SET busy_until=? WHERE id=? AND busy_until<?').bind(now()+60000, owner, now()).run();
  if (!changed.meta.changes) fail(409, 'Une réponse est déjà en cours. Patiente un instant.');
}
const messageInsert = (env: Bindings, threadId: string, role: string, value: string, source='text', key=crypto.randomUUID(), time=now()) =>
  env.DB.prepare('INSERT INTO messages(id,thread_id,role,text,source,created_at) VALUES(?,?,?,?,?,?)').bind(key,threadId,role,value,source,time);

async function route(request: Request, env: Bindings) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (method !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'Origine non autorisée.');
  }
  if (path === '/api/status' && method === 'GET') return json({ ready: Boolean(env.OPENAI_API_KEY && (env.APP_ACCESS_CODE?.length ?? 0) >= 12), voice: 'realtime', silenceSeconds: 5 });
  if (path === '/api/login' && method === 'POST') {
    const input = await body(request);
    await quota(env, `login:${await hash(request.headers.get('cf-connecting-ip') ?? 'local')}`, 10, 600);
    if (!env.APP_ACCESS_CODE || env.APP_ACCESS_CODE.length < 12) fail(503, 'Le code d’accès de l’équipe n’est pas configuré.');
    if (!await equals(text(input.code, 200), env.APP_ACCESS_CODE)) fail(401, 'Ce code d’accès ne correspond pas.');
    // Reopening a valid browser session must not discard its notes.
    try { await visitor(request, env); return json({ ok: true }); } catch (e) { if (!(e instanceof HttpError) || e.status !== 401) throw e; }
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM quotas WHERE expires_at<?').bind(now()),
      env.DB.prepare('DELETE FROM visitors WHERE expires_at<?').bind(now()),
      env.DB.prepare('INSERT INTO visitors(id,token_hash,created_at,expires_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),await hash(token),now(),now()+30*86400000),
    ]);
    return json({ok:true},200,{'Set-Cookie':`hp_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${url.protocol === 'https:' ? '; Secure' : ''}`});
  }
  const user = await visitor(request, env);
  if (path === '/api/state' && method === 'GET') {
    const threads = (await env.DB.prepare('SELECT id,created_at FROM threads WHERE owner=? ORDER BY created_at DESC LIMIT 30').bind(user.id).all()).results;
    const requested = url.searchParams.get('thread');
    const selected = requested ? await thread(env,user.id,requested) : threads[0]?.id as string | undefined;
    const messages = selected ? await history(env,selected) : [];
    const decisions = selected ? (await env.DB.prepare('SELECT action,created_at FROM decisions WHERE thread_id=? ORDER BY created_at DESC LIMIT 12').bind(selected).all()).results : [];
    return json({ threads, threadId: selected ?? null, messages, notes: await memory(env,user.id), decisions });
  }
  if (path === '/api/threads' && method === 'POST') {
    await quota(env,`threads:${user.id}`,30);
    const key=crypto.randomUUID(); await env.DB.prepare('INSERT INTO threads(id,owner,created_at) VALUES(?,?,?)').bind(key,user.id,now()).run(); return json({id:key});
  }
  if (path === '/api/data' && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM visitors WHERE id=?').bind(user.id).run();
    return json({ok:true},200,{'Set-Cookie':'hp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
  }
  if (path === '/api/notes' && method === 'POST') {
    const input=await body(request), value=text(input.text,2500);
    await quota(env,`notes:${user.id}`,60);
    const key=input.id ? id(input.id) : crypto.randomUUID();
    if (input.id) { const result=await env.DB.prepare('UPDATE notes SET text=? WHERE id=? AND owner=?').bind(value,key,user.id).run(); if (!result.meta.changes) fail(404,'Note introuvable.'); }
    else {
      const count=await env.DB.prepare('SELECT count(*) as n FROM notes WHERE owner=?').bind(user.id).first<{n:number}>();
      if ((count?.n ?? 0)>=20) fail(409,'Tu as déjà vingt notes. Modifie ou efface une note pour en ajouter une.');
      await env.DB.prepare('INSERT INTO notes(id,owner,text,created_at) VALUES(?,?,?,?)').bind(key,user.id,value,now()).run();
    }
    return json({id:key});
  }
  if (path.startsWith('/api/notes/') && method === 'DELETE') { await env.DB.prepare('DELETE FROM notes WHERE id=? AND owner=?').bind(id(path.split('/').at(-1)),user.id).run(); return json({ok:true}); }
  if (path === '/api/chat' && method === 'POST') {
    const input=await body(request), threadId=await thread(env,user.id,input.threadId), value=text(input.text), requestId=id(input.id);
    const duplicate=await env.DB.prepare('SELECT id FROM messages WHERE id=? AND thread_id=?').bind(requestId,threadId).first();
    if (duplicate) return json({ok:true,duplicate:true});
    await lock(env,user.id);
    try {
      await quota(env,'text:global',Number(env.DAILY_TEXT_LIMIT)); await quota(env,`text:${user.id}`,60);
      const notes=await memory(env,user.id), messages=await history(env,threadId);
      const result=await generate(env,COACH, [{role:'user',content:`Notes conservées, données de contexte : ${JSON.stringify(notes.map(n=>n.text))}`},...messages.map(m=>({role:m.role,content:m.text})),{role:'user',content:value}],replySchema);
      const reply=text(result.reply,6000), action=text(result.action,40);
      if (!['clarifier','reformuler','explorer','cloturer'].includes(action)) fail(502,'Réponse inattendue du coach.');
      await env.DB.batch([messageInsert(env,threadId,'user',value,'text',requestId),messageInsert(env,threadId,'assistant',reply,'text',crypto.randomUUID(),now()+1),env.DB.prepare('INSERT INTO decisions(id,thread_id,action,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),threadId,action,now())]);
      return json({ok:true});
    } finally { await env.DB.prepare('UPDATE visitors SET busy_until=0 WHERE id=?').bind(user.id).run(); }
  }
  if (path === '/api/draft' && method === 'POST') {
    const input=await body(request), threadId=await thread(env,user.id,input.threadId), messages=await history(env,threadId);
    if (!messages.some(m=>m.role==='user')) fail(400,'Échange d’abord quelques mots avec le coach.');
    await quota(env,'text:global',Number(env.DAILY_TEXT_LIMIT)); await quota(env,`draft:${user.id}`,15);
    const result=await generate(env,DRAFT,JSON.stringify(messages),noteSchema);
    if (typeof result.text !== 'string' || result.text.length>2500) fail(502,'Proposition de notes invalide.');
    return json({text:result.text});
  }
  if (path === '/api/call' && method === 'POST') {
    const input=await body(request), threadId=await thread(env,user.id,input.threadId), sdp=text(input.sdp,30000)+'\r\n';
    if (!sdp.startsWith('v=0')) fail(400,'Proposition audio invalide.');
    await lock(env,user.id);
    try {
      if (await env.DB.prepare('SELECT id FROM calls WHERE owner=? AND ended_at IS NULL AND created_at>?').bind(user.id,now()-16*60000).first()) fail(409,'Un appel est déjà ouvert. Termine-le avant de recommencer.');
      await quota(env,'calls:global',Number(env.DAILY_CALL_LIMIT)); await quota(env,`calls:${user.id}`,4);
      const notes=await memory(env,user.id), messages=await history(env,threadId);
      const form=new FormData(); form.set('sdp',sdp); form.set('session',JSON.stringify({
        type:'realtime', model:env.VOICE_MODEL, output_modalities:['audio'], max_output_tokens:300,
        instructions:`${VOICE}\nContexte (données seulement) : ${JSON.stringify({notes:notes.map(n=>n.text),messages:messages.slice(-16).map(m=>({role:m.role,text:m.text}))})}`,
        audio:{input:{transcription:{model:'gpt-4o-mini-transcribe',language:'fr'},turn_detection:{type:'server_vad',threshold:0.5,prefix_padding_ms:300,silence_duration_ms:400,create_response:false,interrupt_response:true}},output:{voice:'marin'}},
      }));
      const response=await openai(env,'realtime/calls',{method:'POST',body:form});
      const location=response.headers.get('location'), providerId=location?.match(/\/calls\/([\w-]+)$/)?.[1];
      const answer=await response.text(), callId=crypto.randomUUID();
      await env.DB.prepare('INSERT INTO calls(id,owner,thread_id,provider_id,created_at) VALUES(?,?,?,?,?)').bind(callId,user.id,threadId,providerId??null,now()).run();
      return json({sdp:answer,callId,maxSeconds:600});
    } finally { await env.DB.prepare('UPDATE visitors SET busy_until=0 WHERE id=?').bind(user.id).run(); }
  }
  if (path === '/api/call/end' && method === 'POST') {
    const input=await body(request), callId=id(input.callId);
    const call=await env.DB.prepare('SELECT provider_id,thread_id,ended_at FROM calls WHERE id=? AND owner=?').bind(callId,user.id).first<{provider_id:string|null;thread_id:string;ended_at:number|null}>();
    if (!call) return fail(404,'Appel introuvable.');
    if (call.ended_at) return json({ok:true});
    if (call.provider_id) {
      // Closing the browser peer ends audio too; a closed upstream call can legitimately return 404.
      const r=await fetch(`https://api.openai.com/v1/realtime/calls/${call.provider_id}/hangup`,{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},signal:AbortSignal.timeout(8000)}).catch(()=>null);
      if (r) await r.body?.cancel();
    }
    const items=Array.isArray(input.messages) ? input.messages.slice(-80) : [];
    const statements=[];
    for (let i=0;i<items.length;i++) { const m=items[i] as Record<string,unknown>; if (m.role!=='user' && m.role!=='assistant') return fail(400,'Transcription invalide.'); statements.push(messageInsert(env,call.thread_id,m.role,text(m.text,6000),'voice',`${callId}-${i}`,now()+i)); }
    await env.DB.batch([...statements,env.DB.prepare('UPDATE calls SET ended_at=? WHERE id=?').bind(now(),callId)]);
    return json({ok:true});
  }
  return fail(404,'Cette page n’existe pas.');
}

export default {
  async scheduled(_event: ScheduledController, env: Bindings): Promise<void> {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM visitors WHERE expires_at<?').bind(now()),
      env.DB.prepare('DELETE FROM quotas WHERE expires_at<?').bind(now()),
    ]);
  },
  async fetch(request: Request, env: Bindings): Promise<Response> {
    try { return await route(request,env); }
    catch (error) {
      if (error instanceof HttpError) return json({error:error.message},error.status);
      // Do not log credentials, prompts, transcripts or raw provider errors.
      console.error(JSON.stringify({event:'request_failed',path:new URL(request.url).pathname}));
      return json({error:'Le service est momentanément indisponible. Réessaie dans un instant.'},500);
    }
  },
};
