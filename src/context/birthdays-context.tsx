import { createContext, useContext, type ReactNode } from 'react';

import { useBirthdays } from '@/hooks/use-birthdays';

type BirthdaysContextValue = ReturnType<typeof useBirthdays>;

const BirthdaysContext = createContext<BirthdaysContextValue | null>(null);

/** One shared birthdays list, so the Birthdays tab and the calendar never disagree. */
export function BirthdaysProvider({ children }: { children: ReactNode }) {
  const value = useBirthdays();
  return <BirthdaysContext.Provider value={value}>{children}</BirthdaysContext.Provider>;
}

export function useBirthdaysContext() {
  const context = useContext(BirthdaysContext);
  if (!context) throw new Error('useBirthdaysContext must be used within a BirthdaysProvider');
  return context;
}
