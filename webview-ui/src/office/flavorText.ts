import { FLAVOR_TEXT_MAX_LENGTH } from '../constants.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type PhraseEntry = {
  readonly generic: readonly string[];
  readonly withFile?: readonly string[];
};

// ── Phrase Table ──────────────────────────────────────────────────────────────

const FLAVOR_PHRASES = {
  Read: {
    generic: [
      'Checking something out...',
      'Let me have a look...',
      'Reading up on this',
      'Reviewing the source',
    ],
    withFile: [
      'Checking out {file}...',
      'Reading {file}',
      'Eyes on {file}...',
      'Let me look at {file}',
    ],
  },
  Edit: {
    generic: [
      'Making some changes...',
      'Tweaking the code',
      'In the middle of an edit',
      'Rewriting something...',
    ],
    withFile: [
      'Making changes to {file}',
      'Tweaking {file}...',
      'Editing {file}',
      'Rewriting {file}...',
    ],
  },
  Write: {
    generic: ['Writing something new...', 'Creating a file', 'Putting this together'],
    withFile: ['Writing {file}', 'Creating {file}...', 'Putting together {file}'],
  },
  MultiEdit: {
    generic: ['Making several changes...', 'Editing multiple things', 'Batch editing...'],
    withFile: ['Multiple edits to {file}', 'Rewriting parts of {file}'],
  },
  Bash: {
    generic: [
      'Running something...',
      'Just need to run this real quick',
      'Executing a command',
      'Hope this works...',
    ],
  },
  Glob: {
    generic: [
      'Scanning the files...',
      'Finding files...',
      'Mapping the terrain',
      'Where did that go...',
    ],
  },
  Grep: {
    generic: [
      'Digging through the codebase',
      'Where is that...',
      'Searching...',
      'Looking for something',
      'Grep time',
    ],
  },
  WebFetch: {
    generic: [
      'Fetching something...',
      'Checking the docs',
      'Loading a page...',
      'Making a request',
    ],
  },
  WebSearch: {
    generic: [
      'Googling something real quick',
      'Down the rabbit hole...',
      'Looking this up...',
      'Searching the web',
      'One sec, checking online',
    ],
  },
  Task: {
    generic: [
      'Spinning up a subtask',
      'Delegating...',
      'Getting some help on this',
      'Launching a sub-agent',
    ],
  },
  Agent: {
    generic: [
      'Spinning up a subtask',
      'Delegating...',
      'Getting some help on this',
      'Launching a sub-agent',
    ],
  },
  AskUserQuestion: {
    generic: ['Waiting on you...', 'Your turn', 'Needs your input', 'Ball is in your court'],
  },
  EnterPlanMode: {
    generic: [
      'Thinking this through...',
      'Let me plan this out',
      'Mapping it out...',
      'Strategizing...',
    ],
  },
} satisfies Record<string, PhraseEntry>;

// ── Internal Helpers ──────────────────────────────────────────────────────────

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

const FILE_VERB_PREFIXES = ['Reading ', 'Editing ', 'Writing '] as const;

function extractFileFromStatus(rawStatus: string): string | null {
  for (const prefix of FILE_VERB_PREFIXES) {
    if (rawStatus.startsWith(prefix)) {
      return rawStatus.slice(prefix.length);
    }
  }
  return null;
}

const CMD_PREFIX = 'Running: ';

function extractCmdFromStatus(rawStatus: string): string | null {
  if (rawStatus.startsWith(CMD_PREFIX)) {
    return rawStatus.slice(CMD_PREFIX.length);
  }
  return null;
}

function truncate(text: string): string {
  if (text.length <= FLAVOR_TEXT_MAX_LENGTH) return text;
  return text.slice(0, FLAVOR_TEXT_MAX_LENGTH - 3) + '...';
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getFlavorText(toolName: string, rawStatus: string): string {
  const entry = (FLAVOR_PHRASES as Record<string, PhraseEntry>)[toolName];

  if (entry === undefined) {
    return truncate(pickRandom(['Working on something...', 'Give me a sec...', 'On it'] as const));
  }

  let picked: string;

  if (toolName === 'Bash') {
    const cmd = extractCmdFromStatus(rawStatus);
    if (cmd !== null) {
      const cmdLabel = `Running: ${cmd.slice(0, 22)}${cmd.length > 22 ? '...' : ''}`;
      const expanded = [...entry.generic, cmdLabel] as const;
      picked = pickRandom(expanded);
    } else {
      picked = pickRandom(entry.generic);
    }
  } else if (
    toolName === 'Read' ||
    toolName === 'Edit' ||
    toolName === 'Write' ||
    toolName === 'MultiEdit'
  ) {
    const file = extractFileFromStatus(rawStatus);
    if (file !== null && entry.withFile !== undefined) {
      const template = pickRandom(entry.withFile);
      picked = template.replace('{file}', file);
    } else {
      picked = pickRandom(entry.generic);
    }
  } else {
    picked = pickRandom(entry.generic);
  }

  return truncate(picked);
}
