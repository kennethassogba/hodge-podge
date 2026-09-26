// Source : PDF fourni par l’équipe, © 2026 Kedo Academy by Tirezio.
export const QUESTIONS = [
  'Bienvenue dans cette bulle. C’est du temps pour toi, je suis là pour t’écouter. De quoi aimerais-tu parler ?',
  'Quelles sont les questions que tu te poses ?',
  'De quoi as-tu le plus besoin en ce moment ?',
  'Avec qui en as-tu déjà parlé ?',
  'Avec qui est-ce que ça aurait du sens d’en parler ?',
  'Qui d’autre est partie prenante ?',
  'Qui d’autre ?',
  'Y a-t-il des prochains pas que tu aimerais te donner ?',
  'Ce serait quoi un bon timing pour le faire ?',
  'Quoi d’autre ?',
  'Merci pour le partage. Avec quoi repars-tu de cette bulle ?',
  'Qu’est-ce qui a été le plus utile dans cette bulle — quelque chose que j’ai fait, ou quelque chose que tu as fait qui a été particulièrement utile ?',
  'Qu’est-ce qui a été moins utile ou moins agréable ?',
  'Y a-t-il quelque chose que tu aurais aimé explorer dans cette bulle, ou que tu aimerais explorer à un autre moment ?',
];
const words = value => value.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9]+/g,' ').trim();
export class CoachingProtocol {
  constructor() { this.next = 0; }
  instructions() {
    if(this.next >= QUESTIONS.length) return 'Les 14 questions de la bulle ont été posées. Accueille brièvement la dernière réponse et remercie la personne. Ne pose aucune autre question et ne propose pas une nouvelle séance.';
    return `Tu suis le protocole Kedo dans son ordre. La prochaine question prévue est la numéro ${this.next+1} : « ${QUESTIONS[this.next]} ».
Par défaut, prononce uniquement cette question, mot pour mot, sans préambule, commentaire, reformulation ni autre question.
Exception : si la personne demande explicitement de répéter ou expliquer la question précédente, réponds très brièvement à cette demande et n'avance pas à la question prévue. Si elle demande du temps, reste sobre et laisse-la réfléchir ; n'annonce pas de minuterie. Si elle veut arrêter ou exprime un danger immédiat, respecte sa demande ou la priorité de sécurité. Une hésitation, un « je ne sais pas » ou un refus d'action ne justifie pas d'inventer une question.
Tu as accès à l'audio du dernier tour : ne dépends pas de sa transcription. Ne récite jamais la suite du script.`;
  }
  heard(transcript) {
    if(this.next < QUESTIONS.length && words(transcript) === words(QUESTIONS[this.next]))this.next++;
  }
}
