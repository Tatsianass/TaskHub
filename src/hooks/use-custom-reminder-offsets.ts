import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { PRESET_OFFSETS, sanitizeOffsets } from '@/utils/reminders';

const KEY = 'settings:reminderOffsets';
const MAX_SAVED = 8;

/** The alert timings the user typed in themselves ("my options"), kept on this device. */
export function useCustomReminderOffsets() {
  const [offsets, setOffsets] = useState<number[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setOffsets(sanitizeOffsets(JSON.parse(raw)));
      })
      .catch(() => {});
  }, []);

  const save = useCallback((next: number[]) => {
    setOffsets(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  /** Remembers a timing the presets don't already offer. */
  const remember = useCallback(
    (minutes: number) => {
      if ((PRESET_OFFSETS as readonly number[]).includes(minutes) || offsets.includes(minutes)) return;
      save([...offsets, minutes].slice(-MAX_SAVED));
    },
    [offsets, save],
  );

  const forget = useCallback((minutes: number) => save(offsets.filter((item) => item !== minutes)), [offsets, save]);

  return { offsets, remember, forget };
}
