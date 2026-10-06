import { useCallback } from 'react';

import { useServerList } from '@/hooks/use-server-list';
import { api } from '@/lib/api';
import type { Birthday } from '@/types/birthday';

export type BirthdayDraft = {
  name: string;
  date: string;
  remindMe: boolean;
  remindTime: string | null;
};

export function useBirthdays() {
  const { items: birthdays, isLoaded, error, clearError, mutate, refresh } = useServerList<Birthday>('/birthdays');

  const addBirthday = useCallback(
    (draft: BirthdayDraft) => {
      const name = draft.name.trim();
      if (!name || !draft.date) return;
      const birthday: Birthday = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        date: draft.date,
        remindMe: draft.remindMe,
        remindTime: draft.remindMe ? draft.remindTime : null,
      };
      mutate(
        (prev) => [...prev, birthday],
        () => api('/birthdays', { method: 'POST', body: birthday }),
        (prev) => prev.filter((item) => item.id !== birthday.id),
      );
    },
    [mutate],
  );

  const deleteBirthday = useCallback(
    (id: string) => {
      const index = birthdays.findIndex((birthday) => birthday.id === id);
      if (index === -1) return;
      const removed = birthdays[index];
      mutate(
        (prev) => prev.filter((birthday) => birthday.id !== id),
        () => api(`/birthdays/${encodeURIComponent(id)}`, { method: 'DELETE' }),
        (prev) =>
          prev.some((birthday) => birthday.id === id)
            ? prev
            : [...prev.slice(0, index), removed, ...prev.slice(index)],
      );
    },
    [birthdays, mutate],
  );

  return { birthdays, isLoaded, addBirthday, deleteBirthday, error, clearError, refresh };
}
