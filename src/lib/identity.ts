"use client";

// Stable per-device id so a participant rejoining (reload / reconnect) maps to
// the same row. Plus the display name and admin secrets, all in localStorage.

const CLIENT_ID_KEY = "fw_client_id";
const NAME_KEY = "fw_display_name";
const ADMIN_KEY = "fw_admin"; // { [code]: { roomId, secret } }

export function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function getDisplayName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NAME_KEY) ?? "";
}

export function setDisplayName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}

type AdminEntry = { roomId: string; secret: string };

function readAdminMap(): Record<string, AdminEntry> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(ADMIN_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveAdminSecret(code: string, roomId: string, secret: string): void {
  const map = readAdminMap();
  map[code.toUpperCase()] = { roomId, secret };
  localStorage.setItem(ADMIN_KEY, JSON.stringify(map));
}

export function getAdminSecret(code: string): AdminEntry | null {
  return readAdminMap()[code.toUpperCase()] ?? null;
}
