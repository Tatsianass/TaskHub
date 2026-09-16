import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Birthday } from '@/types/birthday';

const STORAGE_KEY = 'task-manager:birthdays:v1';

export type BirthdayDraft = {
  name: string;
  date: string;
};

export function useBirthdays() {
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const hasLoaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setBirthdays(JSON.parse(raw) as Birthday[]);
      } finally {
        hasLoaded.current = true;
        setIsLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(birthdays)).catch(() => {});
  }, [birthdays]);

  const addBirthday = useCallback((draft: BirthdayDraft) => {
    const name = draft.name.trim();
    if (!name || !draft.date) return;
    const birthday: Birthday = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      date: draft.date,
    };
    setBirthdays((prev) => [...prev, birthday]);
  }, []);

  const deleteBirthday = useCallback((id: string) => {
    setBirthdays((prev) => prev.filter((birthday) => birthday.id !== id));
  }, []);

  return { birthdays, isLoaded, addBirthday, deleteBirthday };
}
