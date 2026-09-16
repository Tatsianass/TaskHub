function parseISODate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function dayDiffFromToday(dateStr: string): number {
  const target = parseISODate(dateStr);
  const diffMs = target.getTime() - startOfToday().getTime();
  return Math.round(diffMs / 86400000);
}

export function formatDueDate(dateStr: string, t: (key: string) => string, locale: string): string {
  const diff = dayDiffFromToday(dateStr);
  if (diff === 0) return t('calendar.today');
  if (diff === 1) return t('calendar.tomorrow');
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(parseISODate(dateStr));
}

export function nextBirthdayDayDiff(dateStr: string): number {
  const [, month, day] = dateStr.split('-').map(Number);
  const today = startOfToday();
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, month - 1, day);
  }
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}
