// Must be referenced literally as process.env.EXPO_PUBLIC_* so Expo inlines it.
// 'local' (default): everything lives on the device, no server and no sign-in.
// 'server': talk to the API in server/ (needs EXPO_PUBLIC_API_URL).
export const LOCAL_MODE = process.env.EXPO_PUBLIC_STORAGE_MODE !== 'server';

/** The one implicit user of local mode. */
export const LOCAL_USER = { id: 'local', email: '' };
