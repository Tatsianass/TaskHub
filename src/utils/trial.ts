/** A free trial that is running: when it ends, and whether the store will start charging then. */
export type Trial = { endsAt: Date; willRenew: boolean };

/** How long before the trial ends the user is reminded. */
export const TRIAL_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

type EntitlementLike = {
  periodType: string;
  expirationDateMillis: number | null;
  willRenew: boolean;
};

/** The running trial of an active entitlement, or null when it isn't a trial (or never expires). */
export function trialOf(entitlement: EntitlementLike | undefined | null): Trial | null {
  if (!entitlement || entitlement.periodType.toUpperCase() !== 'TRIAL') return null;
  if (entitlement.expirationDateMillis === null) return null;
  return { endsAt: new Date(entitlement.expirationDateMillis), willRenew: entitlement.willRenew };
}

/** When to remind the user that `trial` ends soon, or null if that moment has already passed. */
export function trialReminderDate(trial: Trial | null, now: Date): Date | null {
  if (!trial) return null;
  const at = new Date(trial.endsAt.getTime() - TRIAL_REMINDER_LEAD_MS);
  return at > now ? at : null;
}
