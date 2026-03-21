/** One office event entry */
interface OfficeEvent {
  readonly emote: string;
  readonly phrases: readonly string[];
}

const OFFICE_EVENTS: readonly OfficeEvent[] = [
  {
    emote: '☕',
    phrases: ['Coffee break!', 'Caffeine time ☕', 'BRB, coffee', 'Need my coffee'],
  },
  {
    emote: '🤔',
    phrases: [
      'Anyone else stuck?',
      'Stack Overflow to the rescue',
      'Why is this broken...',
      'Did I break prod?',
    ],
  },
  {
    emote: '😤',
    phrases: [
      "Why. Won't. It. Compile.",
      'Works on my machine',
      'Merge conflict... again',
      'Who pushed to main?!',
    ],
  },
  {
    emote: '🎉',
    phrases: ['Just shipped it!', "It's alive!", 'Green across the board', 'Deploy successful 🚀'],
  },
  {
    emote: '😴',
    phrases: ['3pm slump hitting hard', 'Is it Friday yet?', 'Need a nap', 'Brain offline'],
  },
  {
    emote: '💬',
    phrases: ['Standup in 5', 'Anyone in the call?', 'Link in Slack', 'Just gonna be a quick sync'],
  },
  {
    emote: '🍕',
    phrases: [
      'Pizza in the break room',
      'Free lunch!',
      'Someone brought donuts',
      'Team lunch today?',
    ],
  },
] as const;

let _lastEventIndex = -1;

export function pickOfficeEvent(): OfficeEvent {
  const candidates = OFFICE_EVENTS.filter((_, i) => i !== _lastEventIndex);
  const idx = Math.floor(Math.random() * candidates.length);
  _lastEventIndex = OFFICE_EVENTS.indexOf(candidates[idx] as (typeof OFFICE_EVENTS)[number]);
  return candidates[idx];
}
