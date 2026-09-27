const $ = id => document.getElementById(id);
let language = $('language').value, context = null, generation = 0, sending = false;
const l = (fr, en) => language === 'en' ? en : fr;
const translated = [...document.querySelectorAll('[data-en]')].map(node => ({node, fr: node.textContent, en: node.dataset.en}));
const read = key => {try{return JSON.parse(window.sessionStorage.getItem(key));}catch{return null;}};
const save = (key, value) => {try{window.sessionStorage.setItem(key, JSON.stringify(value));}catch{}};
const draftKey = () => `hp_after_draft:${context.scope}:${language}`;
const params = new window.URLSearchParams(window.location.search);
let selection = params.has('thread') ? {threadId: params.get('thread'), callId: params.get('call')} : read('hp_after_selection');

function translate() {
  language = $('language').value;
  for (const item of translated) item.node.textContent = item[language];
  $('recap').placeholder = l('Tes décisions, tes idées et les prochaines étapes…', 'Your decisions, ideas and next steps…');
}
function signalRecap() {window.dispatchEvent(new window.CustomEvent('bulle:recap'));}
function actions() {
  const empty = !$('recap').value.trim() || !context;
  $('copy-recap').disabled = empty;
  $('email-open').disabled = empty;
}
function remember() {
  if (!context) return;
  save(draftKey(), {text: $('recap').value, sourceHash: context.sourceHash});
  actions(); signalRecap();
}
async function api(path, data) {
  const response = await fetch('/api/' + path, {method: data ? 'POST' : 'GET',
    headers: data ? {'Content-Type':'application/json'} : {},
    body: data ? JSON.stringify({...data, language}) : undefined});
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error); error.status = response.status; throw error;
  }
  return result;
}
function feedbackState() {
  $('after-feedback-form').hidden = context.feedbackSubmitted;
  $('after-feedback-thanks').hidden = !context.feedbackSubmitted;
}
async function prepareRecap() {
  if (!context) return;
  const version = ++generation, target = context;
  $('recap-retry').hidden = true; $('recap').disabled = true;
  $('recap').value = ''; actions();
  $('recap-status').textContent = l('Ton récap prend forme…', 'Your recap is taking shape…');
  const draft = read(draftKey());
  try {
    const result = draft?.sourceHash === target.sourceHash ? draft :
      target.recap !== null ? {text: target.recap} : await api('recap', selection);
    if (version !== generation) return;
    $('recap').value = result.text;
    $('recap-status').textContent = l('Prêt à copier dans Notion, Gemini ou ton assistant habituel.', 'Ready to paste into Notion, Gemini or your usual assistant.');
    remember();
  } catch {
    if (version !== generation) return;
    $('recap-status').textContent = l('Le récap n’a pas pu être préparé. Réessaie ou écris le tien.', 'The recap could not be prepared. Try again or write your own.');
    $('recap-retry').hidden = false;
  } finally {
    if (version === generation) {$('recap').disabled = false; actions(); signalRecap();}
  }
}
async function load() {
  const version = ++generation;
  $('after-loading').hidden = false;
  try {
    if (!selection?.threadId) {
      const state = await api('state');
      if (!state.threadId || !state.messages?.some(m => m.role === 'user')) throw new Error('empty');
      const last=state.messages.at(-1);
      const callId=last?.source==='voice'?state.calls?.find(c=>last.id?.startsWith(c.id+'-'))?.id:null;
      selection = {threadId: state.threadId, callId: callId || null};
    }
    const query = new window.URLSearchParams({thread: selection.threadId, language});
    if (selection.callId) query.set('call', selection.callId);
    const result = await api('after?' + query);
    if (version !== generation) return;
    if (!result.messages.some(m => m.role === 'user')) throw new Error('empty');
    context = result; save('hp_after_selection', selection);
    $('after-content').hidden = false; $('after-empty').hidden = true;
    $('email-form').hidden = true; $('email-status').textContent = '';
    feedbackState();
    $('after-loading').hidden = true;
    await prepareRecap();
  } catch (error) {
    if (version !== generation) return;
    context = null; $('after-content').hidden = true; $('after-empty').hidden = false;
    if (error.message !== 'empty') {
      $('after-empty').querySelector('p').textContent = error.status === 401 ?
        l('Rouvre ta bulle pour retrouver ton récap.', 'Open your bubble again to retrieve your recap.') :
        l('Ce récap n’est pas accessible. Reviens à ta bulle pour réessayer.', 'This recap is unavailable. Return to your bubble to try again.');
    }
    $('after-loading').hidden = true;
  }
}

$('recap').addEventListener('input', remember);
$('recap-retry').onclick = () => {void prepareRecap();};
$('copy-recap').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('recap').value);
    $('recap-status').textContent = l('Copié. À toi de jouer.', 'Copied. Over to you.');
  } catch {
    $('recap').focus(); $('recap').select();
    $('recap-status').textContent = l('Sélectionné : utilise Copier dans ton navigateur.', 'Selected: use Copy in your browser.');
  }
};
$('email-open').onclick = () => {
  if (!context?.emailAvailable) {
    $('email-status').textContent = l('L’envoi par email sera bientôt disponible. Tu peux déjà copier ton récap.', 'Email will be available soon. You can already copy your recap.');
    return;
  }
  $('email-form').hidden = false; $('email-address').focus();
};
$('email-form').onsubmit = async event => {
  event.preventDefault();
  if (sending || !$('email-form').reportValidity()) return;
  sending = true; $('email-send').disabled = true; $('language').disabled = true;
  $('email-status').textContent = l('Envoi…', 'Sending…');
  try {
    await api('recap/email', {...selection, text: $('recap').value, email: $('email-address').value,
      includeTranscript: $('include-transcript').checked});
    $('email-status').textContent = l('Ton email est envoyé. Pense à vérifier les indésirables.', 'Your email has been sent. Check your spam folder too.');
    // Restore focus before hiding the form, including on mobile browsers with an open keyboard.
    if ($('email-form').contains(document.activeElement)) $('email-open').focus({preventScroll: true});
    $('email-form').hidden = true;
  } catch (error) {
    $('email-status').textContent = language === 'fr' ? error.message : 'Sending could not be confirmed. Check your address, then try again; the same email will not be sent twice.';
  } finally {sending = false; $('email-send').disabled = false; $('language').disabled = false;}
};
for (let i = 0; i <= 10; i++) {
  const label = document.createElement('label'), input = document.createElement('input'), number = document.createElement('span');
  label.className = 'nps-choice'; input.type = 'radio'; input.name = 'recommendation'; input.value = String(i);
  input.id = `after-recommendation-${i}`; label.htmlFor = input.id;
  input.required = true; input.setAttribute('aria-describedby', 'after-nps-help'); number.textContent = String(i);
  label.append(input, number); $('after-rating').append(label);
}
$('after-feedback-form').onsubmit = async event => {
  event.preventDefault();
  if (!context || !$('after-feedback-form').reportValidity()) return;
  $('after-feedback-send').disabled = true; $('after-feedback-error').textContent = '';
  try {
    await api('feedback', {...selection,
      recommendation: Number($('after-rating').querySelector('input:checked').value),
      reason: $('after-reason').value, valueEstimate: $('after-value').value, suggestions: $('after-suggestions').value});
    context.feedbackSubmitted = true; feedbackState();
  } catch {
    $('after-feedback-error').textContent = l('Ton retour n’a pas pu être envoyé. Réessaie.', 'Your feedback could not be sent. Try again.');
  } finally {$('after-feedback-send').disabled = false;}
};
$('language').addEventListener('change', () => {translate(); void load();});
translate(); void load();
