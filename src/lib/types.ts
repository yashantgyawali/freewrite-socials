export type Phase =
  | "lobby"
  | "pairing"
  | "talk"
  | "writing"
  | "submitted"
  | "reveal";

export type PairingMode = "solo" | "pairs" | "tinder";
export type WriteTarget = "self" | "partner";
export type RevealMode = "private" | "send-to-partner" | "show-on-admin";

export interface PauseBomb {
  enabled: boolean;
  timeoutSecs: number;
  loseText: boolean;
}

export interface Constraints {
  noBackspace?: boolean;
  fadeText?: boolean;
  pauseBomb?: PauseBomb;
  deckLevels?: number[]; // tinder: which prompt levels are in the swipe deck
}

export interface RoomState {
  id: string;
  code: string;
  status: "lobby" | "running" | "ended";
  current_round_id: string | null;
  phase: Phase;
  phase_ends_at: string | null;
}

export interface Round {
  id: string;
  room_id: string;
  ordinal: number;
  prompt: string;
  duration_secs: number;
  pairing_mode: PairingMode;
  write_target: WriteTarget;
  constraints: Constraints;
  reveal_mode: RevealMode;
}

export interface Participant {
  id: string;
  room_id: string;
  client_id: string;
  display_name: string;
  is_facilitator: boolean;
  status: "active" | "out" | "left";
}

export interface Pairing {
  id: string;
  round_id: string;
  participant_id: string;
  partner_id: string | null;
  group_id: number | null;
  card_id: string | null;
}
