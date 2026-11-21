import { Platform } from 'react-native';

/**
 * Where the user manages or cancels subscriptions. Only the user can cancel one: neither the app nor
 * the server can end an App Store / Google Play subscription, and deleting the app or the account
 * leaves it running.
 */
export const MANAGE_SUBSCRIPTIONS_URL =
  Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions';
