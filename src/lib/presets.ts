import type { Constraints, PairingMode, RevealMode, WriteTarget } from "./types";

export interface Preset {
  name: string;
  blurb: string;
  prompt: string;
  durationSecs: number;
  pairingMode: PairingMode;
  writeTarget: WriteTarget;
  constraints: Constraints;
  revealMode: RevealMode;
}

// The planned workshop arc. All editable live before each round starts.
export const PRESETS: Preset[] = [
  {
    name: "Ganthan match",
    blurb: "Swipe · match on a card · write & swap",
    prompt: "",
    durationSecs: 300,
    pairingMode: "tinder",
    writeTarget: "self",
    constraints: { deckLevels: [1, 2, 3] },
    revealMode: "send-to-partner",
  },
  {
    name: "Warm-up",
    blurb: "Solo · just write",
    prompt: "Write whatever is on your mind. Don't stop, don't edit, don't judge.",
    durationSecs: 180,
    pairingMode: "solo",
    writeTarget: "self",
    constraints: {},
    revealMode: "private",
  },
  {
    name: "About your partner",
    blurb: "Pairs · no backspace · sent to them",
    prompt: "You just talked. Now write about your partner — keep going, no deleting.",
    durationSecs: 240,
    pairingMode: "pairs",
    writeTarget: "partner",
    constraints: { noBackspace: true },
    revealMode: "send-to-partner",
  },
  {
    name: "Brainstorm, write your own",
    blurb: "New pairs · no backspace · private",
    prompt: "Brainstorm together out loud, then write your own thing. No backspace.",
    durationSecs: 240,
    pairingMode: "pairs",
    writeTarget: "self",
    constraints: { noBackspace: true },
    revealMode: "private",
  },
  {
    name: "Into the void",
    blurb: "Solo · words vanish · pause = bomb",
    prompt: "Type into the void. Your words disappear as you write. Don't stop — or the bomb gets you.",
    durationSecs: 180,
    pairingMode: "solo",
    writeTarget: "self",
    constraints: { fadeText: true, pauseBomb: { enabled: true, timeoutSecs: 5, loseText: false } },
    revealMode: "private",
  },
];
