export type NotionEnv = Env & {
  NOTION_CLIENT_ID?: string; NOTION_CLIENT_SECRET?: string; NOTION_TOKEN_KEY?: string;
  NOTION_REDIRECT_URI?: string; OPENAI_API_KEY?: string;
};
export type Account = {id:string;workspace_name:string;credentials:string;expires_at:number};
export class NotionError extends Error { constructor(public status:number, public code:string){super(code);} }
export const reject = (status:number,code:string):never=>{throw new NotionError(status,code);};
export const reply = (value:unknown,status=200,headers:Record<string,string>={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});
export const random = ()=>[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
export const sha = async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export const ready = (env:NotionEnv)=>Boolean(env.NOTION_CLIENT_ID&&env.NOTION_CLIENT_SECRET&&env.NOTION_TOKEN_KEY&&env.NOTION_REDIRECT_URI);
export const cookie = (r:Request,name:string)=>r.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)??'';
export const sessionCookie = (r:Request,value:string,age=30*86400)=>`hp_notion=${value}; HttpOnly; SameSite=Strict; Path=/api/notion; Max-Age=${age}${new URL(r.url).protocol==='https:'?'; Secure':''}`;
export const cleanText = (value:unknown,max:number)=>typeof value==='string'&&value.trim().length>0&&value.length<=max?value.trim():reject(400,'invalid_input');
export const pageId = (value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)?value.toLowerCase():reject(400,'invalid_page');
export async function limitedJSON(message:Request|Response,max=2_000_000):Promise<Record<string,any>> {
  const reader=message.body?.getReader();if(!reader)return reject(400,'invalid_input');
  const decoder=new TextDecoder();let total=0,text='';
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();return reject(413,'too_large');}text+=decoder.decode(value,{stream:true});}
  try {const value=JSON.parse(text+decoder.decode());if(!value||typeof value!=='object'||Array.isArray(value))return reject(400,'invalid_input');return value;}catch{return reject(502,'invalid_response');}
}
const enc=new TextEncoder();
async function key(env:NotionEnv){if(!env.NOTION_TOKEN_KEY||!/^[a-f0-9]{64}$/i.test(env.NOTION_TOKEN_KEY))return reject(503,'not_configured');return crypto.subtle.importKey('raw',Uint8Array.from(env.NOTION_TOKEN_KEY.match(/../g)!,x=>parseInt(x,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function seal(env:NotionEnv,owner:string,value:unknown){const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(owner)},await key(env),enc.encode(JSON.stringify(value)));return btoa(String.fromCharCode(...iv,...new Uint8Array(ciphertext)));}
export async function unseal(env:NotionEnv,owner:string,value:string){const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:enc.encode(owner)},await key(env),bytes.slice(12));return JSON.parse(new TextDecoder().decode(plain)) as {access_token:string;refresh_token?:string};}
export async function account(request:Request,env:NotionEnv):Promise<Account>{
  const token=cookie(request,'hp_notion');if(!/^[a-f0-9]{64}$/.test(token))return reject(401,'sign_in');
  const row=await env.DB.prepare('SELECT a.* FROM notion_accounts a JOIN notion_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>? AND a.expires_at>?').bind(await sha(token),Date.now(),Date.now()).first<Account>();
  return row??reject(401,'sign_in');
}
export async function oauth(env:NotionEnv,path:string,input:object){
  const response=await fetch('https://api.notion.com/v1/oauth/'+path,{method:'POST',headers:{Authorization:'Basic '+btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`),'Content-Type':'application/json','Notion-Version':'2026-03-11'},body:JSON.stringify(input),signal:AbortSignal.timeout(15000)}).catch(()=>reject(502,'notion_unavailable'));
  if(!response.ok){await response.body?.cancel();return reject(response.status===429?429:502,'notion_authorization_failed');}
  return limitedJSON(response);
}
export async function notion(env:NotionEnv,owner:string,path:string,method='GET',body?:unknown):Promise<Record<string,any>>{
  let row=await env.DB.prepare('SELECT * FROM notion_accounts WHERE id=? AND expires_at>?').bind(owner,Date.now()).first<Account>();if(!row)return reject(401,'sign_in');
  let credentials=await unseal(env,owner,row.credentials);
  const send=async()=>{
    for(let attempt=0;;attempt++){
      const response=await fetch('https://api.notion.com/v1'+path,{method,headers:{Authorization:'Bearer '+credentials.access_token,'Notion-Version':'2026-03-11','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)}).catch(()=>reject(502,'notion_unavailable'));
      if(response.status!==429||attempt>=2||(method==='POST'&&path==='/pages'))return response;
      const delay=Math.min(5000,Math.max(1000,(Number(response.headers.get('retry-after'))||1)*1000));
      await response.body?.cancel();await new Promise(resolve=>setTimeout(resolve,delay));
    }
  };
  let response=await send();
  if(response.status===401&&credentials.refresh_token){
    await response.body?.cancel();
    const locked=await env.DB.prepare('UPDATE notion_accounts SET refresh_until=? WHERE id=? AND refresh_until<? AND credentials=?').bind(Date.now()+30000,owner,Date.now(),row.credentials).run();
    if(!locked.meta.changes)return reject(409,'connection_busy');
    try{const fresh=await oauth(env,'token',{grant_type:'refresh_token',refresh_token:credentials.refresh_token});if(typeof fresh.access_token!=='string'||typeof fresh.refresh_token!=='string')return reject(502,'notion_authorization_failed');credentials={access_token:fresh.access_token,refresh_token:fresh.refresh_token};const saved=await env.DB.prepare('UPDATE notion_accounts SET credentials=? WHERE id=? AND credentials=?').bind(await seal(env,owner,credentials),owner,row.credentials).run();if(!saved.meta.changes)return reject(401,'sign_in');}finally{await env.DB.prepare('UPDATE notion_accounts SET refresh_until=0 WHERE id=?').bind(owner).run();}
    response=await send();
  }
  if(!response.ok){await response.body?.cancel();return reject(response.status===429?429:response.status===401?401:response.status===403||response.status===404?403:502,response.status===401?'reconnect':response.status===403||response.status===404?'page_access':response.status===429?'notion_rate_limit':'notion_unavailable');}
  return limitedJSON(response);
}
export const notionURL=(id:string)=>`https://www.notion.so/${id.replaceAll('-','')}`;
