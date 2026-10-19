// Must be referenced literally as process.env.EXPO_PUBLIC_* so Expo inlines it.
// 'local' (default): everything lives on the device, no server and no sign-in.
// 'server': talk to the API in server/ (needs EXPO_PUBLIC_API_URL).
export const LOCAL_MODE = process.env.EXPO_PUBLIC_STORAGE_MODE !== 'server';

/** The one implicit user of local mode. */
export const LOCAL_USER = { id: 'local', email: '' };

// Shown on the paywall (the stores require both links). Apple's standard EULA is the default terms page.
export const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? '';
