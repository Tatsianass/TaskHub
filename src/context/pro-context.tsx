import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { PaywallSheet } from '@/components/paywall-sheet';

/** What the paywall was opened for; it picks the headline the user sees. */
export type ProFeature = 'voice' | 'reminders' | 'widgets' | 'backup' | 'themes' | 'general';

/**
 * While true every feature is unlocked for everyone and the Pro entry is hidden in settings. Flip it
 * to false to bring the paywall back (the plan is a 14-day trial, then a monthly subscription).
 */
export const ALL_FEATURES_FREE = true;

/** Reminders per task on the free plan. */
export const FREE_REMINDERS = 1;

/** The entitlement id set up in the RevenueCat dashboard; the 7-day trial and the paid plans all unlock it. */
const ENTITLEMENT = 'pro';

// Must be referenced literally as process.env.EXPO_PUBLIC_* so Expo inlines them.
const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

type PurchasesModule = typeof import('react-native-purchases').default;

/**
 * react-native-purchases is native-only and needs a key; on web, or before the key is set, the
 * store is simply unavailable and the app runs on the free plan.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
function loadPurchases(): PurchasesModule | null {
  if (Platform.OS === 'web' || !API_KEY) return null;
  try {
    return require('react-native-purchases').default as PurchasesModule;
  } catch {
    return null;
  }
}
/* eslint-enable @typescript-eslint/no-require-imports */

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'failed';

type ProContextValue = {
  /** True during the free trial and for paying users. */
  isPro: boolean;
  /** False until the first answer from the store, so Pro features don't flash locked at launch. */
  ready: boolean;
  /** The store is connected (a key is set and the native module is there). */
  storeAvailable: boolean;
  packages: PurchasesPackage[];
  loadPackages: () => void;
  openPaywall: (feature?: ProFeature) => void;
  closePaywall: () => void;
  paywallFeature: ProFeature | null;
  purchase: (pkg: PurchasesPackage) => Promise<PurchaseOutcome>;
  restore: () => Promise<boolean>;
  /** Development builds without a store key only: flip Pro on and off to test both states. */
  devToggle: (() => void) | null;
};

const ProContext = createContext<ProContextValue | null>(null);

let configured = false;
const purchases = loadPurchases();

export function ProProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<CustomerInfo | null>(null);
  const [ready, setReady] = useState(!purchases);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [paywallFeature, setPaywallFeature] = useState<ProFeature | null>(null);
  const [devPro, setDevPro] = useState(false);

  useEffect(() => {
    if (!purchases || !API_KEY) return;
    if (!configured) {
      purchases.configure({ apiKey: API_KEY });
      configured = true;
    }
    const onUpdate = (next: CustomerInfo) => setInfo(next);
    purchases.addCustomerInfoUpdateListener(onUpdate);
    purchases
      .getCustomerInfo()
      .then(setInfo)
      .catch(() => {})
      .finally(() => setReady(true));
    return () => {
      purchases.removeCustomerInfoUpdateListener(onUpdate);
    };
  }, []);

  // Prices are only needed where plans are shown (the paywall and the subscription page).
  const loadPackages = useCallback(() => {
    if (!purchases) return;
    purchases
      .getOfferings()
      .then((offerings) => setPackages(offerings.current?.availablePackages ?? []))
      .catch(() => setPackages([]));
  }, []);

  const purchase = useCallback(
    async (pkg: PurchasesPackage): Promise<PurchaseOutcome> => {
      if (!purchases) return 'failed';
      try {
        const result = await purchases.purchasePackage(pkg);
        setInfo(result.customerInfo);
        return result.customerInfo.entitlements.active[ENTITLEMENT] ? 'purchased' : 'failed';
      } catch (e) {
        return (e as { userCancelled?: boolean }).userCancelled ? 'cancelled' : 'failed';
      }
    },
    [],
  );

  const restore = useCallback(async () => {
    if (!purchases) return false;
    try {
      const restored = await purchases.restorePurchases();
      setInfo(restored);
      return !!restored.entitlements.active[ENTITLEMENT];
    } catch {
      return false;
    }
  }, []);

  const openPaywall = useCallback((feature: ProFeature = 'general') => setPaywallFeature(feature), []);
  const closePaywall = useCallback(() => setPaywallFeature(null), []);

  const isPro = ALL_FEATURES_FREE || !!info?.entitlements.active[ENTITLEMENT] || devPro;
  const toggleDev = useCallback(() => setDevPro((value) => !value), []);
  const devToggle = __DEV__ && !purchases ? toggleDev : null;

  const value = useMemo<ProContextValue>(
    () => ({
      isPro,
      ready,
      storeAvailable: !!purchases,
      packages,
      loadPackages,
      openPaywall,
      closePaywall,
      paywallFeature,
      purchase,
      restore,
      devToggle,
    }),
    [isPro, ready, packages, loadPackages, openPaywall, closePaywall, paywallFeature, purchase, restore, devToggle],
  );

  return (
    <ProContext.Provider value={value}>
      {children}
      <PaywallSheet />
    </ProContext.Provider>
  );
}

export function usePro() {
  const context = useContext(ProContext);
  if (!context) throw new Error('usePro must be used within a ProProvider');
  return context;
}
