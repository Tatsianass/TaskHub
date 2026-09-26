import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const ESCALATION_DAYS_KEY = 'settings:escalationDays';

type EscalationContextValue = {
  escalationDays: number | null;
  setEscalationDays: (days: number | null) => void;
};

const EscalationContext = createContext<EscalationContextValue | null>(null);

export function EscalationProvider({ children }: { children: ReactNode }) {
  const [escalationDays, setEscalationDaysState] = useState<number | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ESCALATION_DAYS_KEY).then((saved) => {
      if (saved === null) return;
      const parsed = Number(saved);
      if (Number.isFinite(parsed)) setEscalationDaysState(parsed);
    });
  }, []);

  const setEscalationDays = useCallback((days: number | null) => {
    setEscalationDaysState(days);
    if (days === null) {
      AsyncStorage.removeItem(ESCALATION_DAYS_KEY).catch(() => {});
    } else {
      AsyncStorage.setItem(ESCALATION_DAYS_KEY, String(days)).catch(() => {});
    }
  }, []);

  return (
    <EscalationContext.Provider value={{ escalationDays, setEscalationDays }}>{children}</EscalationContext.Provider>
  );
}

export function useEscalationSettings() {
  const context = useContext(EscalationContext);
  if (!context) throw new Error('useEscalationSettings must be used within an EscalationProvider');
  return context;
}
