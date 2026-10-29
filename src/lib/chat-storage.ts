/**
 * Shared constants/helpers for the per-provider chat drafts that
 * messages.$providerId.tsx stores in localStorage.
 *
 * These drafts are device-local only (see the "Coming soon" banner in the
 * chat UI) but they are never scoped to anything server-side, so on a
 * shared/public browser a signed-out patient's typed messages would
 * otherwise linger for the next person to use the device. Sign-out flows
 * should call `clearAllChatHistory()` alongside clearing the patient
 * session.
 */

export const CHAT_STORAGE_PREFIX = "spehr-chat:";

/** Removes every stored chat thread (all providers, all patients) from localStorage. */
export function clearAllChatHistory(): void {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(CHAT_STORAGE_PREFIX)) keysToRemove.push(key);
    }
    for (const key of keysToRemove) window.localStorage.removeItem(key);
  } catch {
    /* ignore (private browsing, storage disabled, etc.) */
  }
}
