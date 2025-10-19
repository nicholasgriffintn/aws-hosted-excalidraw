import { nanoid } from "nanoid";

const STORAGE_KEY = "excalidraw:userId";

export function getOrCreateUserId(): string {
  if (typeof window === "undefined") {
    return nanoid();
  }

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const generated = nanoid();
    window.localStorage.setItem(STORAGE_KEY, generated);
    return generated;
  } catch {
    return nanoid();
  }
}
