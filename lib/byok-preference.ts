/**
 * BYOK (bring your own key): the user's own Anthropic API key.
 *
 * The key lives ONLY in this browser (localStorage) and is sent as an
 * `X-BYOK-Api-Key` header on each agent request — the servers never store it.
 * When set, Catalyst runs on the user's Anthropic account: their bill, and the
 * app's credit limits don't apply. Clearing the field returns to house credits.
 */

const STORAGE_KEY = "notes9.byokAnthropicKey";

export function getByokKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && v.trim().length >= 16 ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setByokKey(key: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!key || !key.trim()) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, key.trim());
  } catch {
    // storage unavailable — the key just won't persist
  }
}

/** Headers to attach to agent requests; {} when BYOK is off. */
export function byokRequestHeaders(): Record<string, string> {
  const key = getByokKey();
  return key ? { "X-BYOK-Provider": "anthropic", "X-BYOK-Api-Key": key } : {};
}
