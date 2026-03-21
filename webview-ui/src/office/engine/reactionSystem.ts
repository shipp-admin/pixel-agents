import {
  REACTION_BUBBLE_DURATION_SEC,
  REACTION_CLOSE_RADIUS_TILES,
  REACTION_COMPLETION_EMOTE_DURATION_SEC,
  REACTION_COMPLETION_TOOL_THRESHOLD,
  REACTION_EMOTE_DURATION_SEC,
  REACTION_PERMISSION_DURATION_SEC,
  REACTION_PERMISSION_RADIUS_TILES,
  REACTION_SPAWN_RADIUS_TILES,
} from '../../constants.js';
import type { Character } from '../types.js';

const SPAWN_PHRASES = ["Who's this?", 'New hire 👋', 'Welcome!', 'Oh hey!'] as const;
const CLOSE_PHRASES = ['Later 👋', 'See ya', 'Gone already?', 'Bye!'] as const;
const PERMISSION_PHRASES = ['Uh oh...', 'They need help', 'Needs approval...'] as const;

function getNearbyCharacters(
  characters: Map<number, Character>,
  subjectId: number,
  radiusTiles: number,
): Character[] {
  const subject = characters.get(subjectId);
  if (!subject) return [];
  const result: Character[] = [];
  for (const ch of characters.values()) {
    if (ch.id === subjectId) continue;
    if (ch.isSubagent) continue;
    if (ch.matrixEffect === 'despawn') continue;
    const dist = Math.abs(ch.tileCol - subject.tileCol) + Math.abs(ch.tileRow - subject.tileRow);
    if (dist <= radiusTiles) result.push(ch);
  }
  return result;
}

type OsReact = {
  setEmote(id: number, emoji: string, dur?: number): void;
  setActivityText(id: number, text: string, dur?: number): void;
};

type OsEmoteOnly = {
  setEmote(id: number, emoji: string, dur?: number): void;
};

export function triggerSpawnReactions(
  characters: Map<number, Character>,
  os: OsReact,
  subjectId: number,
): void {
  const neighbors = getNearbyCharacters(characters, subjectId, REACTION_SPAWN_RADIUS_TILES);
  // All eligible neighbors: show 👀 emote
  for (const ch of neighbors) {
    if (ch.emoteTimer === 0) {
      os.setEmote(ch.id, '👀', REACTION_EMOTE_DURATION_SEC);
    }
  }
  // One random neighbor: show spoken bubble
  const eligible = neighbors.filter((ch) => ch.activityTextTimer === 0);
  if (eligible.length > 0) {
    const chosen = eligible[Math.floor(Math.random() * eligible.length)];
    const phrase = SPAWN_PHRASES[Math.floor(Math.random() * SPAWN_PHRASES.length)];
    os.setActivityText(chosen.id, phrase, REACTION_BUBBLE_DURATION_SEC);
  }
}

export function triggerCloseReactions(
  characters: Map<number, Character>,
  os: OsReact,
  subjectId: number,
): void {
  const neighbors = getNearbyCharacters(characters, subjectId, REACTION_CLOSE_RADIUS_TILES);
  for (const ch of neighbors) {
    if (ch.emoteTimer === 0) {
      os.setEmote(ch.id, '👋', REACTION_EMOTE_DURATION_SEC);
    }
  }
  const eligible = neighbors.filter((ch) => ch.activityTextTimer === 0);
  if (eligible.length > 0) {
    const chosen = eligible[Math.floor(Math.random() * eligible.length)];
    const phrase = CLOSE_PHRASES[Math.floor(Math.random() * CLOSE_PHRASES.length)];
    os.setActivityText(chosen.id, phrase, REACTION_BUBBLE_DURATION_SEC);
  }
}

export function triggerPermissionReactions(
  characters: Map<number, Character>,
  os: OsReact,
  subjectId: number,
): void {
  const neighbors = getNearbyCharacters(characters, subjectId, REACTION_PERMISSION_RADIUS_TILES);
  if (neighbors.length === 0) return;
  const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
  if (chosen.emoteTimer === 0) {
    os.setEmote(chosen.id, '👀', REACTION_PERMISSION_DURATION_SEC);
  }
  if (chosen.activityTextTimer === 0) {
    const phrase = PERMISSION_PHRASES[Math.floor(Math.random() * PERMISSION_PHRASES.length)];
    os.setActivityText(chosen.id, phrase, REACTION_PERMISSION_DURATION_SEC);
  }
}

export function triggerCompletionReactions(
  characters: Map<number, Character>,
  os: OsEmoteOnly,
  subjectId: number,
  toolCount: number,
): void {
  if (toolCount < REACTION_COMPLETION_TOOL_THRESHOLD) return;
  const neighbors = getNearbyCharacters(characters, subjectId, REACTION_SPAWN_RADIUS_TILES);
  if (neighbors.length === 0) return;
  const eligible = neighbors.filter((ch) => ch.emoteTimer === 0);
  if (eligible.length === 0) return;
  const chosen = eligible[Math.floor(Math.random() * eligible.length)];
  const emote = Math.random() < 0.5 ? '👏' : '✨';
  os.setEmote(chosen.id, emote, REACTION_COMPLETION_EMOTE_DURATION_SEC);
}
