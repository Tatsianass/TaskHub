import type { Locale } from '@/i18n/translations';

export type PluralCategory = 'one' | 'few' | 'many' | 'other';

/**
 * CLDR plural category for whole numbers. Hand-rolled because Hermes doesn't ship
 * Intl.PluralRules; covers exactly the app's languages.
 */
export function pluralCategory(locale: Locale, n: number): PluralCategory {
  const abs = Math.abs(n);
  switch (locale) {
    case 'ru': {
      const mod10 = abs % 10;
      const mod100 = abs % 100;
      if (mod10 === 1 && mod100 !== 11) return 'one';
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
      return 'many';
    }
    case 'fr':
    case 'pt':
      return abs === 0 || abs === 1 ? 'one' : 'other';
    case 'zh':
      return 'other';
    default:
      return abs === 1 ? 'one' : 'other';
  }
}
