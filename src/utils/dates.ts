function parseISODate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** The current local date as YYYY-MM-DD. */
export function todayISODate(): string {
  return isoDateOf(Date.now());
}

/** The local date (YYYY-MM-DD) of a timestamp in ms. */
export function isoDateOf(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
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

/** `dateStr` shifted by `days` (may be negative), as YYYY-MM-DD. */
export function addDaysISO(dateStr: string, days: number): string {
  const date = parseISODate(dateStr);
  date.setDate(date.getDate() + days);
  return isoDateOf(date.getTime());
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Month (1-12) and day of a birthday in `year`; a Feb 29 birthday falls on Feb 28 in non-leap years. */
export function birthdayMonthDay(dateStr: string, year: number): { month: number; day: number } {
  const [, month, day] = dateStr.split('-').map(Number);
  if (month === 2 && day === 29 && !isLeapYear(year)) return { month: 2, day: 28 };
  return { month, day };
}

/** The birthday's date (YYYY-MM-DD) in `year`. */
export function birthdayInYear(dateStr: string, year: number): string {
  const { month, day } = birthdayMonthDay(dateStr, year);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function nextBirthdayDayDiff(dateStr: string, todayStr: string = todayISODate()): number {
  const today = parseISODate(todayStr);
  let next = parseISODate(birthdayInYear(dateStr, today.getFullYear()));
  if (next.getTime() < today.getTime()) {
    next = parseISODate(birthdayInYear(dateStr, today.getFullYear() + 1));
  }
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}
