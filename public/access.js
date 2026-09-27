// Fragments stay in the browser: the invitation code never goes into request URLs.
window.addEventListener('pageshow', () => document.body.classList.remove('leaving-bubble'));

export function takeAccessCode() {
  const url = new window.URL(window.location.href);
  const fragment = new window.URLSearchParams(url.hash.slice(1));
  const code = fragment.get('access') || url.searchParams.get('access');
  if (code !== null) {
    fragment.delete('access'); url.searchParams.delete('access');
    url.hash = fragment.toString();
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  return code;
}

export function afterLink(threadId, callId) {
  if (!threadId) return '/notion';
  const params = new window.URLSearchParams({thread: threadId});
  if (callId) params.set('call', callId);
  return '/notion?' + params;
}

export function goAfter(threadId, callId) {
  const href = afterLink(threadId, callId);
  if (document.body.classList.contains('leaving-bubble')) return;
  document.body.classList.add('leaving-bubble');
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(() => window.location.assign(href), reduced ? 0 : 220);
}
