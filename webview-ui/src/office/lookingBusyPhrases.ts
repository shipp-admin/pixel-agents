const PHRASES: readonly string[] = [
  'Totally working...',
  'Very busy. Do not disturb.',
  'Just optimizing things',
  'Nothing to see here',
  'This is fine 🔥',
  'Waiting for a sign...',
  'Hello? Is this thing on?',
  'Pretending to look busy',
  'Just need approval... please',
  'Still here...',
  'Definitely not waiting',
  'Productivity intensifies',
  'Typing noises...',
  'So much work happening',
  'Absolutely crushing it',
];

export function getRandomLookingBusyPhrase(): string {
  return PHRASES[Math.floor(Math.random() * PHRASES.length)];
}
