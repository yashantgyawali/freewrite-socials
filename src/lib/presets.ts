import type { Constraints, PairingMode, RevealMode, WriteTarget } from "./types";

export interface Preset {
  name: string;
  funName: string;
  blurb: string;
  prompt: string;
  durationSecs: number;
  pairingMode: PairingMode;
  writeTarget: WriteTarget;
  constraints: Constraints;
  revealMode: RevealMode;
}

export const PRESETS: Preset[] = [
  {
    name: "The Warmup",
    funName: "Open Page",
    blurb: "Free writing — no constraints",
    prompt: "",
    durationSecs: 180,
    pairingMode: "tinder",
    writeTarget: "self",
    constraints: { deckLevels: [1, 2, 3] },
    revealMode: "private",
  },
  {
    name: "No Regrets",
    funName: "Forward Only",
    blurb: "Every word sticks — no backspace",
    prompt: "",
    durationSecs: 180,
    pairingMode: "tinder",
    writeTarget: "self",
    constraints: { deckLevels: [1, 2, 3], noBackspace: true },
    revealMode: "private",
  },
  {
    name: "Into the Fog",
    funName: "Words Fade",
    blurb: "Your text disappears as you write",
    prompt: "",
    durationSecs: 180,
    pairingMode: "tinder",
    writeTarget: "self",
    constraints: { deckLevels: [1, 2, 3], fadeText: true },
    revealMode: "private",
  },
  {
    name: "Don't Stop",
    funName: "The Bomb",
    blurb: "Pause and your text is gone",
    prompt: "",
    durationSecs: 180,
    pairingMode: "tinder",
    writeTarget: "self",
    constraints: {
      deckLevels: [1, 2, 3],
      pauseBomb: { enabled: true, timeoutSecs: 10, loseText: true },
    },
    revealMode: "private",
  },
];
