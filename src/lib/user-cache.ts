import AsyncStorage from '@react-native-async-storage/async-storage';

// Server mode only: the signed-in user, kept next to the session token so the app can open
// offline (the token alone can't say who it belongs to without asking the server).
const KEY = 'cache:user:v1';

export type CachedUser = { id: string; email: string };

export async function readCachedUser(): Promise<CachedUser | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as Partial<CachedUser> | null;
    return user && typeof user.id === 'string' && typeof user.email === 'string'
      ? { id: user.id, email: user.email }
      : null;
  } catch {
    return null;
  }
}

export async function writeCachedUser(user: CachedUser) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ id: user.id, email: user.email }));
  } catch {
    // Without it the next offline launch shows the login screen, as before.
  }
}

export async function clearCachedUser() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing more we can do; sign-in overwrites it.
  }
}
