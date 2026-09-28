import * as SecureStore from 'expo-secure-store';

// Keychain (iOS) / Keystore (Android). SecureStore has no web support, so
// token-storage.web.ts provides the same interface over localStorage.
const TOKEN_KEY = 'session-token';

export function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export function setToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export function clearToken(): Promise<void> {
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}
