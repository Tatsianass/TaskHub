import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { todayISODate } from '@/utils/dates';

const TodayContext = createContext<string | null>(null);

function msUntilNextMidnight() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return midnight.getTime() - now.getTime();
}

/**
 * Today's local date (YYYY-MM-DD), updated at midnight and whenever the app comes back to the
 * foreground (timers don't fire while it's suspended). Everything that depends on "today" —
 * deadline escalation, "Today"/"Tomorrow" labels, the calendar — reads it from here, so it
 * all moves on together while the app stays open.
 */
export function TodayProvider({ children }: { children: ReactNode }) {
  const [today, setToday] = useState(todayISODate);

  useEffect(() => {
    // +1s so the timer never lands a hair before midnight and reschedules for the same day.
    const timer = setTimeout(() => setToday(todayISODate()), msUntilNextMidnight() + 1000);
    return () => clearTimeout(timer);
  }, [today]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(todayISODate());
    });
    return () => subscription.remove();
  }, []);

  return <TodayContext.Provider value={today}>{children}</TodayContext.Provider>;
}

export function useToday() {
  const today = useContext(TodayContext);
  if (today === null) throw new Error('useToday must be used within a TodayProvider');
  return today;
}
