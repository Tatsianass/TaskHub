import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '@/context/auth-context';

const storageKey = (userId: string) => `onboarding:seen:${userId}`;

type OnboardingContextValue = {
  /** `null` until the stored flag for the signed-in user has loaded. */
  seen: boolean | null;
  /** Remembers that the intro slides were shown (finished or skipped), per account. */
  markSeen: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<{ owner: string; seen: boolean } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey(userId))
      .catch(() => null)
      .then((raw) => {
        if (!cancelled) setState({ owner: userId, seen: raw === 'true' });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const markSeen = useCallback(() => {
    if (!userId) return;
    setState({ owner: userId, seen: true });
    AsyncStorage.setItem(storageKey(userId), 'true').catch(() => {});
  }, [userId]);

  const seen = userId && state?.owner === userId ? state.seen : null;

  return <OnboardingContext.Provider value={{ seen, markSeen }}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error('useOnboarding must be used within an OnboardingProvider');
  return context;
}
