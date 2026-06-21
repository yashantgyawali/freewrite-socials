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
