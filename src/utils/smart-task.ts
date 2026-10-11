import * as chrono from 'chrono-node';

const chronoByLocale: Record<string, { parse: typeof chrono.en.parse }> = {
  ru: chrono.ru,
  en: chrono.en,
  es: chrono.es,
  fr: chrono.fr,
  de: chrono.de,
  pt: chrono.pt,
  zh: chrono.zh,
};

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses a natural-language date/time mention out of free text, e.g. "встреча в четверг в 15:00". */
export function parseSmartDate(text: string, locale: string): string | null {
  const parser = chronoByLocale[locale] ?? chrono.en;
  const results = parser.parse(text, new Date(), { forwardDate: true });
  if (results.length === 0) return null;
  return toISODate(results[0].start.date());
}

export type SpokenTask = {
  /** The phrase with the date/time words taken out, e.g. "купить хлеб завтра" → "купить хлеб". */
  title: string;
  date: string | null;
  /** HH:MM, only when a clock time was actually spoken. */
  time: string | null;
};

/** Splits a dictated phrase into the task text and the date/time it mentions. */
export function parseSpokenTask(text: string, locale: string): SpokenTask {
  const parser = chronoByLocale[locale] ?? chrono.en;
  const [result] = parser.parse(text, new Date(), { forwardDate: true });
  if (!result) return { title: text.trim(), date: null, time: null };

  const when = result.start.date();
  const time = result.start.isCertain('hour')
    ? `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`
    : null;
  const title = `${text.slice(0, result.index)} ${text.slice(result.index + result.text.length)}`
    .replace(/\s+/g, ' ')
    .replace(/\s+(на|в|во|к|до|on|at|by|for)$/i, '')
    .trim();
  // A phrase that was only a date ("завтра") leaves nothing to name the task; keep the original.
  return { title: title || text.trim(), date: toISODate(when), time };
}

const URGENT_KEYWORDS: Record<string, string[]> = {
  ru: ['срочно', 'срочный', 'срочная', 'срочное', 'сейчас', 'немедленно', 'сегодня', 'завтра', 'дедлайн', 'скорее', 'горит'],
  en: ['urgent', 'asap', 'now', 'immediately', 'today', 'tomorrow', 'deadline', 'quickly'],
  es: ['urgente', 'ya', 'ahora', 'inmediatamente', 'hoy', 'mañana', 'plazo', 'rápido'],
  fr: ['urgent', 'urgente', 'maintenant', 'immédiatement', "aujourd'hui", 'demain', 'délai', 'vite'],
  de: ['dringend', 'jetzt', 'sofort', 'heute', 'morgen', 'frist', 'schnell'],
  pt: ['urgente', 'agora', 'imediatamente', 'hoje', 'amanhã', 'prazo', 'rápido'],
  zh: ['紧急', '马上', '立刻', '今天', '明天', '截止', '尽快'],
};

const IMPORTANT_KEYWORDS: Record<string, string[]> = {
  ru: ['важно', 'важный', 'важная', 'важное', 'критично', 'критически', 'обязательно', 'ключевой', 'приоритет'],
  en: ['important', 'critical', 'crucial', 'priority', 'key', 'must'],
  es: ['importante', 'crítico', 'crucial', 'prioridad', 'clave', 'imprescindible'],
  fr: ['important', 'importante', 'critique', 'crucial', 'priorité', 'clé', 'essentiel'],
  de: ['wichtig', 'kritisch', 'entscheidend', 'priorität', 'unbedingt'],
  pt: ['importante', 'crítico', 'crucial', 'prioridade', 'chave', 'essencial'],
  zh: ['重要', '关键', '必须', '优先'],
};

/** Suggests whether a task is important from keywords in the text. Returns null when no signal is found. */
export function suggestImportance(text: string, locale: string): boolean | null {
  const lower = text.toLowerCase();
  const urgentWords = URGENT_KEYWORDS[locale] ?? URGENT_KEYWORDS.en;
  const importantWords = IMPORTANT_KEYWORDS[locale] ?? IMPORTANT_KEYWORDS.en;

  if (importantWords.some((word) => lower.includes(word))) return true;
  if (urgentWords.some((word) => lower.includes(word))) return false;
  return null;
}
