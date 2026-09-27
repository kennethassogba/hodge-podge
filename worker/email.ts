export type EmailConfig = { RESEND_API_KEY?: string; EMAIL_FROM?: string };

export const emailReady = (env: EmailConfig) => Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export function recapEmail(from: string, to: string, recap: string, language: string,
  messages: {role: string; text: string}[] | null) {
  const en = language === 'en';
  const subject = en ? 'What you take from your bubble' : 'Ce que tu emportes de ta bulle';
  const payload: Record<string, unknown> = {
    from, to: [to], subject, text: recap,
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:32px auto;color:#203d31"><p style="font-size:24px;font-weight:700">la bulle</p><h1 style="font-size:22px">${subject}</h1><div style="white-space:pre-wrap;line-height:1.7">${escape(recap)}</div></div>`,
  };
  if (messages) {
    const transcript = messages.map(m => `${m.role === 'user' ? (en ? 'You' : 'Toi') : 'La Bulle'}\n${m.text}`).join('\n\n');
    const bytes = new TextEncoder().encode(transcript);
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    payload.attachments = [{filename: en ? 'bubble-transcript.txt' : 'retranscription-bulle.txt',
      content: btoa(binary), content_type: 'text/plain; charset=utf-8'}];
  }
  return payload;
}

export async function sendRecapEmail(env: EmailConfig, key: string, payload: Record<string, unknown>) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: {'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json', 'Idempotency-Key': key},
    body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({})) as {id?: string};
  if (!response.ok || !data.id) throw new Error('email_not_confirmed');
}
