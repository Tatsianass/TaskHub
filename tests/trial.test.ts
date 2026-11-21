import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { TRIAL_REMINDER_LEAD_MS, trialOf, trialReminderDate } from '@/utils/trial';

const entitlement = (over = {}) => ({ periodType: 'TRIAL', expirationDateMillis: 2_000_000_000_000, willRenew: true, ...over });

describe('trialOf', () => {
  test('a trial entitlement gives its end and renewal state', () => {
    const trial = trialOf(entitlement());
    assert.equal(trial?.endsAt.getTime(), 2_000_000_000_000);
    assert.equal(trial?.willRenew, true);
  });
  test('period type is case-insensitive', () => assert.ok(trialOf(entitlement({ periodType: 'trial' }))));
  test('paying, intro, missing or non-expiring entitlements are not trials', () => {
    assert.equal(trialOf(entitlement({ periodType: 'NORMAL' })), null);
    assert.equal(trialOf(entitlement({ periodType: 'INTRO' })), null);
    assert.equal(trialOf(entitlement({ expirationDateMillis: null })), null);
    assert.equal(trialOf(undefined), null);
  });
});

describe('trialReminderDate', () => {
  const endsAt = new Date(2_000_000_000_000);
  test('one day before the trial ends', () => {
    const at = trialReminderDate({ endsAt, willRenew: true }, new Date(endsAt.getTime() - 3 * 86_400_000));
    assert.equal(at?.getTime(), endsAt.getTime() - TRIAL_REMINDER_LEAD_MS);
  });
  test('null once that moment has passed, or without a trial', () => {
    assert.equal(trialReminderDate({ endsAt, willRenew: true }, new Date(endsAt.getTime() - 3_600_000)), null);
    assert.equal(trialReminderDate(null, new Date()), null);
  });
});
