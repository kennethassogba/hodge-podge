import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeVoiceDiagnostic,voiceResponseDiagnostic} from '../public/voice-diagnostics.js';
test('voice diagnostics contain only known technical categories, never provider messages or content',()=>{
  const raw={status:'failed',status_details:{error:{type:'server_error',code:'undocumented_failure',message:'Private provider text'}},usage:{output_tokens:300},output:[{content:[{transcript:'Private conversation'}]}]};
  assert.deepEqual(voiceResponseDiagnostic(raw),{status:'failed',reason:'unknown',code:'server_error',outputTokens:300,retryScheduled:false});
  assert.deepEqual(safeVoiceDiagnostic({status:'private',code:'user@example.com',reason:'A secret',outputTokens:'300',retryScheduled:'true',transcript:'private'}),{status:'unknown',reason:'unknown',code:'unknown',outputTokens:null,retryScheduled:false});
});
