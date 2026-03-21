const BREAK_PHRASES = [
  'Taking a breather ☕',
  'Coffee time ☕',
  'Quick break...',
  'Recharging...',
  'Need this ☕',
  'Stretching my legs',
  'Two-minute break',
  'Brain needs a reset',
  'Not procrastinating',
  '*stares into the void*',
  'Deserved this',
  'Almost done... after this',
] as const;

let _lastBreakIndex = -1;

export function getBreakPhrase(): string {
  const candidates = BREAK_PHRASES.filter((_, i) => i !== _lastBreakIndex);
  const idx = Math.floor(Math.random() * candidates.length);
  _lastBreakIndex = BREAK_PHRASES.indexOf(candidates[idx] as (typeof BREAK_PHRASES)[number]);
  return candidates[idx];
}
