import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file');
}

// Expo Router's dev/export server renders once in Node (no `window`) before the
// app ever reaches a real browser or the RN runtime. AsyncStorage's web shim
// assumes `window` exists, so every storage call is routed through Node there
// instead, avoiding the crash without affecting real (RN or browser) sessions.
const isServerRender = typeof window === 'undefined';

const authStorage = {
  getItem: (key: string) => (isServerRender ? Promise.resolve(null) : AsyncStorage.getItem(key)),
  setItem: (key: string, value: string) => (isServerRender ? Promise.resolve() : AsyncStorage.setItem(key, value)),
  removeItem: (key: string) => (isServerRender ? Promise.resolve() : AsyncStorage.removeItem(key)),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase's token auto-refresh must be paused while the app is backgrounded,
// otherwise it keeps firing and can throw on some platforms. This API doesn't
// exist during the Node-side render pass either, so it's skipped there too.
if (Platform.OS !== 'web' || !isServerRender) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
