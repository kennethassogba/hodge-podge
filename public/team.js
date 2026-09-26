import {t,getLanguage,initLanguage,setLanguage} from './i18n.js?v=0.3.0';
initLanguage(document);
const $=id=>document.getElementById(id);
let entries=[],nextOffset=null,summary=null,ratings=null;
const el=(tag,text,className='')=>{const n=document.createElement(tag);n.textContent=text;n.className=className;return n;};
async function api(path,data){
  const r=await fetch('/api/admin/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
  const result=await r.json();if(!r.ok){const e=new Error(t(result.error));e.status=r.status;throw e;}return result;
}
function clear(){entries=[];summary=null;ratings=null;$('team-stats').replaceChildren();$('team-entries').replaceChildren();$('team-data').hidden=true;$('team-login').hidden=false;}
function render(){
  if(!summary)return;
  const fmt=(v,digits=0)=>v==null?'—':new Intl.NumberFormat(getLanguage()==='en'?'en-GB':'fr-FR',{maximumFractionDigits:digits}).format(v);
  const cards=[['Appels démarrés',summary.calls],['Fins enregistrées',summary.ended??0],['Erreurs signalées',summary.errors??0],['Durée moyenne (min)',summary.average_seconds==null?null:summary.average_seconds/60],['Retours partagés',ratings.responses],['Clarté / 10',ratings.clarity],['Qualité / 10',ratings.quality],['Interruptions détectées',summary.interruptions],['Échecs de transcription',summary.transcription_failures]];
  $('team-stats').replaceChildren(...cards.map(([label,value])=>{const card=el('article','','stat-card');card.append(el('span',t(label)),el('strong',fmt(value,1)));return card;}));
  $('team-entries').replaceChildren(...entries.map(entry=>{
    const card=el('article','','feedback-entry');const when=new Intl.DateTimeFormat(getLanguage()==='en'?'en-GB':'fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(entry.created_at);
    card.append(el('p',`${when} · ${entry.language.toUpperCase()}`,'muted small'),el('p',`${t('Clarté')} ${entry.clarity}/10 · ${t('Qualité')} ${entry.quality}/10`),el('p',entry.comment||t('Aucun commentaire.'),'feedback-comment'));return card;
  }));
  if(!entries.length)$('team-entries').append(el('p',t('Aucun retour partagé pour le moment.'),'muted'));
  $('team-more').hidden=nextOffset===null;
}
async function load(more=false){
  $('team-error').textContent='';
  const result=await api('feedback'+(more?`?offset=${nextOffset}`:''));summary=result.summary;ratings=result.ratings;entries=more?[...entries,...result.entries]:result.entries;nextOffset=result.nextOffset;
  $('team-data').hidden=false;$('team-login').hidden=true;render();
}
async function guarded(fn){try{await fn();}catch(e){if(e.status===401)clear();$('team-error').textContent=e.message;}}
$('team-login').onsubmit=async e=>{e.preventDefault();$('team-enter').disabled=true;try{await guarded(async()=>{await api('login',{code:$('admin-code').value});$('admin-code').value='';await load();});}finally{$('team-enter').disabled=false;}};
$('team-refresh').onclick=()=>guarded(()=>load());
$('team-more').onclick=async()=>{$('team-more').disabled=true;try{await guarded(()=>load(true));}finally{$('team-more').disabled=false;}};
$('team-logout').onclick=()=>guarded(async()=>{await api('logout',{});clear();});
$('language').onchange=()=>{setLanguage($('language').value,document);render();};
void load().catch(e=>{clear();if(e.status!==401)$('team-error').textContent=e.message;});
