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

// The whole session is one flow: tinder-style match → talk → private freewrite.
export const PRESETS: Preset[] = [
  {
    name: "Ganthan match",
    blurb: "Swipe → match on a card → talk → write (private)",
    prompt: "",
    durationSecs: 300,
    pairingMode: "tinder",
    writeTarget: "self",
    constraints: { deckLevels: [1, 2, 3] },
    revealMode: "private",
  },
];
