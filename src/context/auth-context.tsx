import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useLocale } from '@/context/locale-context';
import { LOCAL_MODE, LOCAL_USER } from '@/lib/config';
import { api, ApiError, setAuthToken, setOnUnauthorized } from '@/lib/api';
import { offerLegacyImport } from '@/lib/legacy-import';
import { clearToken, getToken, setToken } from '@/lib/token-storage';

const MIN_PASSWORD_LENGTH = 8;

type User = { id: string; email: string };
type AuthResponse = { token: string; user: User };

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Local mode: data lives on this device, there are no accounts. */
  isLocal: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function ServerAuthProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    await clearToken();
  }, []);

  useEffect(() => {
    // Any request rejected for an invalid/expired session signs the user out.
    setOnUnauthorized(() => {
      clearSession().catch(() => {});
    });
    return () => setOnUnauthorized(null);
  }, [clearSession]);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        setAuthToken(token);
        try {
          const { user: me } = await api<{ user: User }>('/auth/me');
          setUser(me);
        } catch (e) {
          // 401: the token is dead, forget it. Anything else (server
          // unreachable): keep the token and fall back to the login screen.
          if (e instanceof ApiError && e.status === 401) await clearSession();
          else setAuthToken(null);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [clearSession]);

  const startSession = useCallback(
    async ({ token, user: next }: AuthResponse) => {
      await setToken(token);
      setAuthToken(token);
      // Before setUser: the data hooks fetch as soon as the user is set, and
      // must see what the import added (R6.1).
      await offerLegacyImport(t);
      setUser(next);
    },
    [t],
  );

  const register = useCallback(
    async (rawEmail: string, password: string) => {
      const email = normalizeEmail(rawEmail);
      if (!email || !password) throw new Error('ENTER_EMAIL_PASSWORD');
      if (password.length < MIN_PASSWORD_LENGTH) throw new Error('PASSWORD_TOO_SHORT');

      await startSession(await api<AuthResponse>('/auth/register', { method: 'POST', body: { email, password } }));
    },
    [startSession],
  );

  const login = useCallback(
    async (rawEmail: string, password: string) => {
      const email = normalizeEmail(rawEmail);
      if (!email || !password) throw new Error('ENTER_EMAIL_PASSWORD');

      await startSession(await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }));
    },
    [startSession],
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // Server unreachable or session already gone: still sign out locally.
    }
    await clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, isLoading, register, login, logout, isLocal: false }}>{children}</AuthContext.Provider>
  );
}

const LOCAL_VALUE: AuthContextValue = {
  user: LOCAL_USER,
  isLoading: false,
  register: async () => {},
  login: async () => {},
  logout: async () => {},
  isLocal: true,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // LOCAL_MODE is a build-time constant, so the same provider renders every time.
  if (LOCAL_MODE) return <AuthContext.Provider value={LOCAL_VALUE}>{children}</AuthContext.Provider>;
  return <ServerAuthProvider>{children}</ServerAuthProvider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
