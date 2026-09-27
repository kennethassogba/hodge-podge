// Only technical categories cross this boundary. Never include provider messages or transcripts.
const reasons = ['max_output_tokens', 'content_filter', 'turn_detected', 'client_cancelled'];
const codes = ['server_error', 'rate_limit_exceeded', 'insufficient_quota', 'invalid_request_error',
  'authentication_error', 'permission_denied'];
export function safeVoiceDiagnostic(value) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    status: ['failed', 'incomplete'].includes(v.status) ? v.status : 'unknown',
    reason: reasons.includes(v.reason) ? v.reason : 'unknown',
    code: codes.includes(v.code) ? v.code : 'unknown',
    outputTokens: Number.isInteger(v.outputTokens) && v.outputTokens >= 0 && v.outputTokens <= 100000
      ? v.outputTokens : null,
    retryScheduled: v.retryScheduled === true,
  };
}
export function voiceResponseDiagnostic(response) {
  const detail = response.status_details || {};
  return safeVoiceDiagnostic({status: response.status, reason: detail.reason,
    code: codes.includes(detail.error?.code) ? detail.error.code : detail.error?.type,
    outputTokens: response.usage?.output_tokens});
}
