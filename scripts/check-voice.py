# Optional paid integration check. Requires aiohttp and aiortc. Never uses a microphone.
import asyncio,json,pathlib,aiohttp,sys,time,fractions,av,subprocess,unicodedata,re,shutil,tempfile
from aiortc import RTCPeerConnection,RTCSessionDescription,AudioStreamTrack
ROOT=pathlib.Path(__file__).resolve().parent.parent
NODE=shutil.which('node')
assert NODE, 'Node.js must be available on PATH'
FINISH='--finish' in sys.argv
LANGUAGE=sys.argv[2] if len(sys.argv)>2 and sys.argv[2]=='en' else 'fr'
protocol=json.loads(subprocess.check_output([NODE,'--input-type=module','-e',"import {QUESTIONS,QUESTIONS_EN} from './public/coaching-protocol.js';console.log(JSON.stringify({fr:QUESTIONS.slice(0,3),en:QUESTIONS_EN.slice(0,3)}));"],cwd=ROOT))[LANGUAGE]
class Speech(AudioStreamTrack):
    def __init__(self):super().__init__();self.pts=0;self.start=None;self.buffer=b''
    async def recv(self):
        if self.start is None:self.start=time.monotonic()
        await asyncio.sleep(max(0,self.start+self.pts/48000-time.monotonic()))
        raw=self.buffer[:1920];self.buffer=self.buffer[1920:];raw=raw.ljust(1920,b'\0')
        frame=av.AudioFrame(format='s16',layout='mono',samples=960);frame.planes[0].update(raw);frame.sample_rate=48000;frame.pts=self.pts;frame.time_base=fractions.Fraction(1,48000);self.pts+=960;return frame

def norm(s):return re.sub('[^a-z0-9]+',' ',''.join(c for c in unicodedata.normalize('NFD',s.lower()) if not unicodedata.combining(c))).strip()
async def main():
    values=dict(l.split('=',1) for l in (ROOT/'.dev.vars').read_text().splitlines() if '=' in l and not l.startswith('#'));key=values['OPENAI_API_KEY'].strip().strip('"');base=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8787'
    audio_file=pathlib.Path(tempfile.gettempdir())/('hodge-podge-synthetic-test-reply'+('-en' if LANGUAGE=='en' else '')+'.wav')
    async with aiohttp.ClientSession(cookie_jar=aiohttp.CookieJar(unsafe=True),headers={'Origin':base}) as session:
        if not audio_file.exists():
            async with session.post('https://api.openai.com/v1/audio/speech',headers={'Authorization':'Bearer '+key},json={'model':'gpt-4o-mini-tts','voice':'alloy','input':('I am thinking about how to talk to my team. I would like to give them more room to share their ideas.' if LANGUAGE=='en' else 'Je réfléchis à la façon de parler à mon équipe. Je voudrais leur laisser plus de place.'),'response_format':'wav'}) as r:
                assert r.status==200, 'TTS failed: '+str(r.status);audio_file.write_bytes(await r.read())
        reply_two_file=pathlib.Path(tempfile.gettempdir())/('bulle-second-answer-'+LANGUAGE+'.wav')
        if not reply_two_file.exists():
            async with session.post('https://api.openai.com/v1/audio/speech',headers={'Authorization':'Bearer '+key},json={'model':'gpt-4o-mini-tts','voice':'alloy','input':('My question is how to give the team more autonomy without answering for them. I also wonder how to trust their decisions.' if LANGUAGE=='en' else 'Je me demande comment leur laisser plus d’autonomie sans leur donner la réponse. Je me demande aussi comment faire confiance à leurs décisions.'),'response_format':'wav'}) as r:
                assert r.status==200;reply_two_file.write_bytes(await r.read())
        second_audio=b'';resampler_second=av.AudioResampler(format='s16',layout='mono',rate=48000)
        with av.open(str(reply_two_file)) as source:
            for f in source.decode(audio=0):
                for output in resampler_second.resample(f):second_audio+=bytes(output.planes[0])[:output.samples*2]
        finish_audio=b''
        if FINISH:
            finish_file=pathlib.Path(tempfile.gettempdir())/('bulle-finish-'+LANGUAGE+'.wav')
            if not finish_file.exists():
                async with session.post('https://api.openai.com/v1/audio/speech',headers={'Authorization':'Bearer '+key},json={'model':'gpt-4o-mini-tts','voice':'alloy','input':('Thank you. I want to stop this coaching session now and take action. Please finish the bubble.' if LANGUAGE=='en' else 'Merci. Je veux arrêter cette séance maintenant et passer à l’action. Tu peux terminer la bulle.'),'response_format':'wav'}) as r:
                    assert r.status==200;finish_file.write_bytes(await r.read())
            resampler_end=av.AudioResampler(format='s16',layout='mono',rate=48000)
            with av.open(str(finish_file)) as source:
                for f in source.decode(audio=0):
                    for output in resampler_end.resample(f):finish_audio+=bytes(output.planes[0])[:output.samples*2]
        resampler=av.AudioResampler(format='s16',layout='mono',rate=48000);parts=[]
        with av.open(str(audio_file)) as source:
            for f in source.decode(audio=0):
                for output in resampler.resample(f):parts.append(bytes(output.planes[0])[:output.samples*2])
        audio=b''.join(parts)
        async def post(path,data):
            async with session.post(base+'/api/'+path,json=data) as r:
                result=await r.json();assert r.status<400,(r.status,result);return result
        await post('login',{'code':values['APP_ACCESS_CODE'].strip().strip('"')});thread=await post('threads',{})
        peer=RTCPeerConnection();speech=Speech();peer.addTrack(speech);ch=peer.createDataChannel('oai-events');done=asyncio.Event();spoken=[];timers=[];stopped=None;requested=[];failure=[];finish_called=False;finish_sent=False
        @ch.on('open')
        def opened():
            # The only client response.create. Later replies MUST be native.
            requested.append(time.monotonic());ch.send(json.dumps({'type':'response.create'}))
        @ch.on('message')
        def event(raw):
            nonlocal stopped,finish_called,finish_sent
            e=json.loads(raw);kind=e['type']
            if kind=='input_audio_buffer.speech_started':
                for t in timers:t.cancel()
                timers.clear();print('User speech detected',flush=True)
            elif kind=='input_audio_buffer.speech_stopped':
                stopped=time.monotonic();print('Native end of turn; no client response request',flush=True)
            elif kind=='response.output_audio_transcript.done':
                index=len(spoken);spoken.append(e['transcript'])
                if index<3:
                    print('Question',index+1,'exact:',norm(e['transcript'])==norm(protocol[index]),flush=True)
                    if norm(e['transcript'])!=norm(protocol[index]):failure.append('Unexpected question: '+e['transcript'])
                else:print('Farewell received:',e['transcript'],flush=True)
            elif kind=='output_audio_buffer.stopped':
                if len(spoken)>=3:
                    if FINISH and not finish_sent:
                        finish_sent=True;asyncio.get_running_loop().call_later(.7,lambda:setattr(speech,'buffer',finish_audio))
                    elif not FINISH or finish_called:done.set()
                else:asyncio.get_running_loop().call_later(.7,lambda:setattr(speech,'buffer',second_audio if len(spoken)==2 else audio))
            elif kind=='response.done' and FINISH:
                for item in e.get('response',{}).get('output',[]):
                    if item.get('type')=='function_call' and item.get('name')=='finish_bubble':
                        finish_called=True;print('finish_bubble called by the real model',flush=True)
                        ch.send(json.dumps({'type':'conversation.item.create','item':{'type':'function_call_output','call_id':item['call_id'],'output':'The bubble will close after your brief farewell.'}}))
                        requested.append(time.monotonic());ch.send(json.dumps({'type':'response.create','response':{'tool_choice':'none','instructions':'Say only: Thank you for this time together. Take care.' if LANGUAGE=='en' else 'Dis uniquement : Merci pour ce moment partagé. Bonne continuation.'}}))
            elif kind=='error':failure.append(e.get('error',{}).get('code'));done.set()
        @peer.on('track')
        def track(t):
            async def consume():
                try:
                    while True:await t.recv()
                except Exception:pass
            asyncio.create_task(consume())
        call=None
        try:
            await peer.setLocalDescription(await peer.createOffer());call=await post('call',{'threadId':thread['id'],'sdp':peer.localDescription.sdp,'language':LANGUAGE});await peer.setRemoteDescription(RTCSessionDescription(call['sdp'],'answer'))
            await asyncio.wait_for(done.wait(),150 if FINISH else 100);assert (len(spoken)>=4 if FINISH else len(spoken)==3),(len(spoken),failure);assert not failure,failure;assert len(requested)==(2 if FINISH else 1);assert not FINISH or finish_called;print('PASS: exact protocol, native turns'+(', finish tool and farewell.' if FINISH else '.'),flush=True)
        finally:
            for t in timers:t.cancel()
            await peer.close()
            if call:await post('call/end',{'callId':call['callId'],'messages':[]})
            async with session.delete(base+'/api/data') as r:print('Test space removed:',r.status,flush=True)
asyncio.run(main())
