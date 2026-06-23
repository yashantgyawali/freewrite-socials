import data from "./prompts.json";

export interface Prompt {
  id: string;
  level: number;
  levelName: string;
  category: string;
  text: string;
}

export const PROMPTS = data.prompts as Prompt[];

const byId = new Map(PROMPTS.map((p) => [p.id, p]));

export function getPrompt(id: string | null | undefined): Prompt | undefined {
  return id ? byId.get(id) : undefined;
}

export function getPromptText(id: string | null | undefined): string {
  return getPrompt(id)?.text ?? "";
}

// Each person swipes their own randomly-shuffled deck, in batches of this size.
export const BATCH_SIZE = 15;

// A shuffled deck for swiping, optionally restricted to certain levels.
export function buildDeck(levels?: number[]): Prompt[] {
  const list =
    levels && levels.length ? PROMPTS.filter((p) => levels.includes(p.level)) : [...PROMPTS];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// The shared, fixed card order for a tinder round — generated once (by the
// admin) and stored on the round so every phone presents identical batches.
export function buildDeckOrder(levels?: number[]): string[] {
  return buildDeck(levels).map((p) => p.id);
}

// Resolve a stored order (or a fallback level filter) into Prompt cards.
export function promptsFromOrder(order?: string[], levels?: number[]): Prompt[] {
  if (order && order.length) {
    return order.map((id) => getPrompt(id)).filter((p): p is Prompt => !!p);
  }
  return buildDeck(levels);
}
