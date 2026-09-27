// Align the generated narration for subtitles. Only this synthetic audio is sent.
import {readFile, writeFile} from 'node:fs/promises';
const root = new URL('../livrables/video/', import.meta.url);
const vars = await readFile(new URL('../.dev.vars', import.meta.url), 'utf8');
const key = vars.split('\n').find(l => l.startsWith('OPENAI_API_KEY='))
  ?.slice(15).trim().replace(/^["']|["']$/g, '');
if (!key) throw Error('Missing local OpenAI key');
const form = new FormData();
form.append('file', new Blob([await readFile(new URL('assets/narration.wav', root))],
  {type: 'audio/wav'}), 'narration.wav');
form.append('model', 'whisper-1');
form.append('response_format', 'verbose_json');
form.append('timestamp_granularities[]', 'word');
form.append('timestamp_granularities[]', 'segment');
form.append('language', 'fr');
form.append('prompt', 'La Bulle, Hodge Podge, Kedo, Notion, OpenAI, Kenneth, Séb, Fano, X-IA.');
const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST', headers: {Authorization: 'Bearer ' + key}, body: form,
  signal: AbortSignal.timeout(120000),
});
if (!response.ok) throw Error('Subtitle alignment: HTTP ' + response.status);
const result = await response.json();
await writeFile(new URL('assets/transcription.json', root), JSON.stringify(result, null, 2));
console.log('Aligned words:', result.words?.length);
