import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const upstream=process.env.VOICE_TEST_UPSTREAM||'http://127.0.0.1:8787';
// This test-only wrapper substitutes a synthetic microphone and mutes playback.
// The actual application JS, browser WebRTC and OpenAI responses are unchanged.
const fixture=`
const panel=document.createElement('aside');panel.id='voice-test';panel.style.cssText='padding:16px;border:2px solid green;background:white;color:black';panel.innerHTML='<h2>Test navigateur — microphone synthétique</h2><button id="test-speak" disabled>Envoyer une réponse audio fictive</button><pre id="test-events" style="white-space:pre-wrap"></pre>';document.body.prepend(panel);
const log=value=>{document.getElementById('test-events').textContent+=value+'\\n';};
try{const old={clearTimer:window.clearTimeout};old.clearTimer(0);log('Ancien appel de minuterie : accepté dans ce navigateur');}catch(e){log('Ancien appel de minuterie : '+e.name+' '+e.message);}
const audioContext=new AudioContext();const mic=audioContext.createMediaStreamDestination();const carrier=audioContext.createOscillator();const quiet=audioContext.createGain();quiet.gain.value=0.00001;carrier.connect(quiet).connect(mic);carrier.start();audioContext.onstatechange=()=>log('AudioContext '+audioContext.state);
Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>mic.stream});
let clip;
fetch('/__test__/reply.wav').then(r=>r.arrayBuffer()).then(b=>audioContext.decodeAudioData(b)).then(b=>{clip=b;document.getElementById('test-speak').disabled=false;});
document.getElementById('test-speak').onclick=async()=>{await audioContext.resume();const source=audioContext.createBufferSource();source.buffer=clip;source.connect(mic);source.onended=()=>log('Fin du fichier audio; le micro fictif continue à émettre du silence');source.start();log('Réponse fictive envoyée au vrai canal micro WebRTC');};
const NativePeer=window.RTCPeerConnection;
window.RTCPeerConnection=class extends NativePeer{createDataChannel(...args){const ch=super.createDataChannel(...args);ch.addEventListener('open',()=>log('Canal WebRTC ouvert'));ch.addEventListener('message',event=>{const e=JSON.parse(event.data);if(['input_audio_buffer.speech_started','input_audio_buffer.speech_stopped','response.created','output_audio_buffer.started','output_audio_buffer.stopped','response.done','error'].includes(e.type))log(e.type+(e.error?' '+e.error.code:''));if(e.type==='response.output_audio_transcript.done')log('COACH : '+e.transcript);});return ch;}};
const NativeAudio=window.Audio;window.Audio=class extends NativeAudio{constructor(...args){super(...args);this.volume=0;}};
window.addEventListener('error',e=>log('ERREUR JS : '+e.message));window.addEventListener('unhandledrejection',e=>log('PROMESSE REJETÉE : '+e.reason));
`;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:8790');
  if(url.pathname.startsWith('/api/')){
    if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!=='http://127.0.0.1:8790'){res.writeHead(403);res.end('Origin denied');return;}
    const data=[];for await(const part of req)data.push(part);
    const headers=new Headers(req.headers);headers.set('Origin',upstream);headers.delete('host');headers.delete('content-length');
    const r=await fetch(upstream+url.pathname+url.search,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(data)});
    res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')||'application/json',...(r.headers.get('set-cookie')?{'Set-Cookie':r.headers.get('set-cookie').replace(/; Secure/ig,'')}:{} )});res.end(Buffer.from(await r.arrayBuffer()));return;
  }
  if(url.pathname==='/__test__/fixture.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(fixture);return;}
  if(url.pathname==='/__test__/reply.wav'){res.writeHead(200,{'Content-Type':'audio/wav'});res.end(await readFile(resolve(tmpdir(),'hodge-podge-synthetic-test-reply.wav')));return;}
  if(url.pathname==='/'||url.pathname==='/index.html'){
    let html=await readFile(root+'/public/index.html','utf8');html=html.replace('<script type="module" src="/app.js?v=0.2.0"></script>','<script type="module" src="/__test__/fixture.js"></script><script type="module" src="/app.js"></script>');res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;
  }
  const p=resolve(root+'/public','.'+url.pathname);if(!p.startsWith(root+'/public/'))throw Error('Forbidden');
  const type=p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.woff2')?'font/woff2':'image/svg+xml';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(await readFile(p));
 }catch{res.writeHead(500);res.end('Test fixture error');}
});server.listen(8790,'127.0.0.1',()=>console.log('Browser voice fixture on http://127.0.0.1:8790; upstream '+upstream));
