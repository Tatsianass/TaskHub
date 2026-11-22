import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { LOCALES, translations } from '@/i18n/translations';

const placeholders = (text: string) => (text.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(',');

describe('translations: every language is complete', () => {
  const english = translations.en;
  // Plural variants a language does not use (e.g. Chinese has no "one") may be absent.
  const isPluralVariant = (key: string) => /\.(one|few|many|other)$/.test(key);

  for (const { code } of LOCALES) {
    test(`${code}: no key from en is missing`, () => {
      const missing = Object.keys(english).filter((key) => !(key in translations[code]) && !isPluralVariant(key));
      assert.deepEqual(missing, []);
    });

    test(`${code}: placeholders match en and values are non-empty`, () => {
      for (const [key, value] of Object.entries(translations[code])) {
        assert.ok(value.trim(), `${key} is empty`);
        if (key in english) assert.equal(placeholders(value), placeholders(english[key]), key);
      }
    });
  }
});
