// Module-level anti-repeat tracking (shared across all agents)
let _lastPhraseIndex = -1;

const PHRASES: readonly string[] = [
  'Is it Friday yet?',
  'Just ship it',
  'Coffee first',
  'Rubber duck time',
  'Have you tried turning it off and on again?',
  "Why won't this build...",
  'I should write tests for this',
  'git blame never lies',
  'It worked on my machine',
  'Only 3 more steps...',
  'Pretending to be busy',
  'Anyone else hear that?',
  'Ship it and pray',
  'undefined is not a function',
  'TODO: fix later',
  'Why is this O(n²)?',
  'Works in prod',
  'Have you committed recently?',
  'Just one more refactor',
  'This is fine 🔥',
];

export function getIdleChatterPhrase(): string {
  const indices = PHRASES.map((_, i) => i).filter((i) => i !== _lastPhraseIndex);
  const idx = indices[Math.floor(Math.random() * indices.length)];
  _lastPhraseIndex = idx;
  return PHRASES[idx];
}
