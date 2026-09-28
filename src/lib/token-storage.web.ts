const TOKEN_KEY = 'session-token';

// Expo Router renders once in Node (no `window`) before the app reaches a real
// browser, and localStorage can throw when storage is blocked (e.g. some
// private modes). Both cases behave as "no token stored".
function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function getToken(): Promise<string | null> {
  try {
    return storage()?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  try {
    storage()?.setItem(TOKEN_KEY, token);
  } catch {
    // Storage unavailable: the session lasts until the page is reloaded.
  }
}

export async function clearToken(): Promise<void> {
  try {
    storage()?.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored that we could remove.
  }
}
