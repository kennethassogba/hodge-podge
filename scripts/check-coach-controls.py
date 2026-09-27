"""Optional paid check of real Realtime reasoning; synthetic text only, no microphone or saved data.
Run with a Python environment containing aiohttp and Node.js on PATH.
"""
import asyncio, json, os, pathlib, subprocess, sys
import aiohttp

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', """
import {voicePrompt, PAUSE_COACHING, FINISH_BUBBLE} from './worker/prompts.js';
import {QUESTIONS, QUESTIONS_EN} from './public/coaching-protocol.js';
console.log(JSON.stringify({fr:{prompt:voicePrompt('fr'),questions:QUESTIONS},
 en:{prompt:voicePrompt('en'),questions:QUESTIONS_EN},tools:[PAUSE_COACHING,FINISH_BUBBLE]}));
"""], cwd=ROOT))
VALUES = dict(line.split('=', 1) for line in (ROOT / '.dev.vars').read_text().splitlines()
              if '=' in line and not line.startswith('#'))
KEY = VALUES['OPENAI_API_KEY'].strip().strip('"')
MODEL = os.environ.get('VOICE_MODEL', 'gpt-realtime-2.1')

async def completed(ws):
    async with asyncio.timeout(45):
        async for event in ws:
            data = json.loads(event.data)
            if data['type'] == 'error':
                raise AssertionError(data.get('error', {}).get('code', 'provider_error'))
            if data['type'] == 'response.done':
                assert data['response']['status'] == 'completed', data['response']['status']
                return data['response']['output']
    raise AssertionError('Realtime connection closed')

async def turn(ws, message):
    await ws.send_json({'type':'conversation.item.create','item':{'type':'message','role':'user',
        'content':[{'type':'input_text','text':message}]}})
    await ws.send_json({'type':'response.create'})
    return await completed(ws)

def answer(output):
    return ' '.join(c.get('text', c.get('transcript', '')) for item in output for c in item.get('content', []))

async def scenario(session, language, request, expected):
    cfg = CONFIG[language]
    async with session.ws_connect('wss://api.openai.com/v1/realtime?model='+MODEL,
                                  headers={'Authorization':'Bearer '+KEY}) as ws:
        await ws.send_json({'type':'session.update','session':{'type':'realtime',
            'instructions':cfg['prompt'], 'output_modalities':['text'],
            'tools':CONFIG['tools'], 'tool_choice':'auto', 'max_output_tokens':400}})
        # Two original protocol questions with a single completed answer between them.
        history=[('assistant',cfg['questions'][0]),('user','I want to give my team more autonomy.' if language=='en' else 'Je veux laisser plus d’autonomie à mon équipe.'),('assistant',cfg['questions'][1])]
        if expected == 'back':
            # Establish this as an active call, not injected context from an older session.
            await ws.send_json({'type':'response.create'})
            greeting = answer(await completed(ws))
            assert cfg['questions'][0] in greeting, greeting
            second = answer(await turn(ws, history[1][1]))
            assert cfg['questions'][1] in second, second
        else:
            for role, value in history:
                await ws.send_json({'type':'conversation.item.create','item':{'type':'message','role':role,
                    'content':[{'type':'input_text' if role=='user' else 'output_text','text':value}]}})
        output = await turn(ws, request)
        tools = [item for item in output if item['type']=='function_call']
        if isinstance(expected, int):
            assert len(tools)==1 and tools[0]['name']=='pause_coaching', (language,request,answer(output),tools)
            assert json.loads(tools[0]['arguments'])['seconds']==expected, (request,tools[0]['arguments'])
            print(language, 'pause', expected, 'PASS', flush=True)
        else:
            text = answer(output)
            assert not tools, tools
            assert not any(q in text for q in cfg['questions']), text
            assert not any(phrase in text.lower() for phrase in ['ne peux pas','cannot','can’t','unable','impossible']),text
            completion = ('What I had not finished saying is that I also worry about delegating. That completes my previous answer.' if language=='en' else 'Je n’avais pas fini : j’ai aussi peur de déléguer. Voilà, j’ai terminé ma réponse à la première question.')
            resumed = answer(await turn(ws, completion))
            assert cfg['questions'][1] in resumed, (text,resumed)
            print(language, 'return and resume at unanswered question PASS:',text,flush=True)

async def main():
    cases=[
        ('fr', 'Attends, je suis en train de noter quelque chose.',20),
        ('fr', 'Donne-moi une minute.',20),
        ('en', 'Give me two minutes to think.',20),
        ('fr', 'Attends 45 secondes avant de me relancer.',45),
        ('en', 'Please wait exactly one minute before checking on me.',60),
        ('fr', 'Attends, je te dirai quand reprendre. Ne me relance pas.',0),
        ('en', 'Please wait; I will tell you when I am ready.',0),
        ('fr', 'Je n’avais pas fini de répondre à la première question, peux-tu revenir en arrière ?', 'back'),
        ('en', 'I had not finished answering your first question. Can we go back?', 'back'),
    ]
    async with aiohttp.ClientSession() as session:
        for case in cases:
            if '--back' in sys.argv and case[2] != 'back':
                continue
            await scenario(session,*case)
    print('PASS: backtracking in French and English.' if '--back' in sys.argv else
          'PASS: requested pauses and backtracking in French and English.')

asyncio.run(main())
