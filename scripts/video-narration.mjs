// Generate the hackathon pitch voiceover. Never print the API key.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../livrables/video/',import.meta.url);
const vars=await readFile(new URL('../.dev.vars',import.meta.url),'utf8');
const key=vars.split('\n').find(l=>l.startsWith('OPENAI_API_KEY='))?.slice(15).trim().replace(/^["']|["']$/g,'');
if(!key)throw Error('Missing local OpenAI key');
const scenes=JSON.parse(await readFile(new URL('storyboard.json',root),'utf8'));
await mkdir(new URL('assets/',root),{recursive:true});
const instructions='Parle en français de France, avec une diction nette, naturelle et vivante. Tu présentes un projet dans un hackathon. Ton énergique, assuré, chaleureux, jamais crié ni publicitaire. Débit soutenu autour de 165 mots par minute. Pauses brèves. Ne lis que le texte fourni. Même timbre et même énergie du début à la fin.';
for(let at=0;at<scenes.length;at+=2){
  await Promise.all(scenes.slice(at,at+2).map(async s=>{
    const target=new URL(`assets/${s.id}.wav`,root);
    try{await readFile(target);console.log(s.id+': reused');return;}catch{}
    const r=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini-tts',voice:'cedar',input:s.narration,instructions,response_format:'wav',speed:1.05}),signal:AbortSignal.timeout(90000)});
    if(!r.ok)throw Error(`Speech generation ${s.id}: HTTP ${r.status}`);
    await writeFile(target,Buffer.from(await r.arrayBuffer()));console.log(s.id+': generated');
  }));
}
