"""Optional paid Realtime check: reproduce a truncated audio response, then recover in the same session.
Uses fictional text, no microphone, and no saved application data. Requires aiohttp and Node.js.
"""
import asyncio, json, pathlib, subprocess
import aiohttp

ROOT = pathlib.Path(__file__).resolve().parent.parent
VALUES = dict(line.split('=', 1) for line in (ROOT / '.dev.vars').read_text().splitlines()
              if '=' in line and not line.startswith('#'))
KEY = VALUES['OPENAI_API_KEY'].strip().strip('"')
CONFIG = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', """
import {voicePrompt} from './worker/prompts.js';
console.log(JSON.stringify({instructions:voicePrompt('fr')}));
"""], cwd=ROOT))
EXPLANATION = ('La question porte sur ce qui t’a aidé pendant cet échange. Tu peux penser à une question '
    'qui a ouvert une piste, à une idée que tu as formulée, ou simplement au fait de prendre un moment '
    'pour réfléchir. Il n’y a pas de bonne réponse attendue. Ce qui compte, c’est ce que toi tu retiens '
    'de cette bulle et ce qui te semble utile maintenant.')

async def completed(ws):
    async with asyncio.timeout(60):
        async for event in ws:
            data = json.loads(event.data)
            if data['type'] == 'error':
                raise AssertionError(data.get('error', {}).get('code', 'provider_error'))
            if data['type'] == 'response.done':
                return data['response']
    raise AssertionError('Realtime connection closed')

async def main():
    async with aiohttp.ClientSession() as session:
        async with session.ws_connect('wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1',
                                      headers={'Authorization':'Bearer '+KEY}) as ws:
            await ws.send_json({'type':'session.update','session':{'type':'realtime',
                'instructions':CONFIG['instructions'], 'output_modalities':['audio'],
                'max_output_tokens':2048, 'audio':{'output':{'voice':'marin'}}}})
            spec={'instructions':'Say only this exact coaching explanation, calmly: '+EXPLANATION}
            await ws.send_json({'type':'response.create','response':{**spec,'max_output_tokens':300}})
            partial=await completed(ws)
            assert partial['status']=='incomplete', partial['status']
            assert partial['status_details']['reason']=='max_output_tokens', partial['status_details']
            print('Reproduced: incomplete / max_output_tokens at 300 tokens.',flush=True)
            for item in partial['output']:
                await ws.send_json({'type':'conversation.item.delete','item_id':item['id']})
            await ws.send_json({'type':'response.create','response':{**spec,'max_output_tokens':4096}})
            recovered=await completed(ws)
            assert recovered['status']=='completed', recovered.get('status_details')
            transcript=' '.join(c.get('transcript','') for item in recovered['output'] for c in item.get('content',[]))
            assert 'utile maintenant' in transcript, transcript
            print('PASS: completed in the same session after removing unfinished output; tokens:',
                  recovered['usage']['output_tokens'],flush=True)

asyncio.run(main())
