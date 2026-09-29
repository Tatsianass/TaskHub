function parseISODate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** The current local date as YYYY-MM-DD. */
export function todayISODate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Whole days from `today` (defaults to the current date) to `dateStr`. Screens pass `today`
 * from `useToday()` so their results update at midnight.
 */
export function dayDiffFromToday(dateStr: string, today: string = todayISODate()): number {
  const diffMs = parseISODate(dateStr).getTime() - parseISODate(today).getTime();
  return Math.round(diffMs / 86400000);
}

export function formatDueDate(
  dateStr: string,
  t: (key: string) => string,
  locale: string,
  today: string = todayISODate(),
): string {
  const diff = dayDiffFromToday(dateStr, today);
  if (diff === 0) return t('calendar.today');
  if (diff === 1) return t('calendar.tomorrow');
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(parseISODate(dateStr));
}

export function nextBirthdayDayDiff(dateStr: string, todayStr: string = todayISODate()): number {
  const [, month, day] = dateStr.split('-').map(Number);
  const today = parseISODate(todayStr);
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, month - 1, day);
  }
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}
