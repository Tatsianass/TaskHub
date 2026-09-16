import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const USERS_KEY = 'auth:users';
const SESSION_KEY = 'auth:session';

type StoredUser = { email: string; salt: string; passwordHash: string };
type User = { email: string };

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function hashPassword(password: string, salt: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
}

async function loadUsers(): Promise<Record<string, StoredUser>> {
  const raw = await AsyncStorage.getItem(USERS_KEY);
  return raw ? (JSON.parse(raw) as Record<string, StoredUser>) : {};
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const email = await AsyncStorage.getItem(SESSION_KEY);
        if (email) {
          const users = await loadUsers();
          if (users[email]) setUser({ email });
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const register = useCallback(async (rawEmail: string, password: string) => {
    const email = normalizeEmail(rawEmail);
    if (!email || !password) throw new Error('ENTER_EMAIL_PASSWORD');
    if (password.length < 4) throw new Error('PASSWORD_TOO_SHORT');

    const users = await loadUsers();
    if (users[email]) throw new Error('EMAIL_TAKEN');

    const salt = Crypto.randomUUID();
    const passwordHash = await hashPassword(password, salt);
    users[email] = { email, salt, passwordHash };

    await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
    await AsyncStorage.setItem(SESSION_KEY, email);
    setUser({ email });
  }, []);

  const login = useCallback(async (rawEmail: string, password: string) => {
    const email = normalizeEmail(rawEmail);
    if (!email || !password) throw new Error('ENTER_EMAIL_PASSWORD');

    const users = await loadUsers();
    const stored = users[email];
    if (!stored) throw new Error('USER_NOT_FOUND');

    const passwordHash = await hashPassword(password, stored.salt);
    if (passwordHash !== stored.passwordHash) throw new Error('WRONG_PASSWORD');

    await AsyncStorage.setItem(SESSION_KEY, email);
    setUser({ email });
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, register, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
