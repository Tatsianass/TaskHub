import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  /** Called with a translated message when sign-in fails; the user cancelling is not an error. */
  onError: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
};

/** Apple's own button; renders nothing where Sign in with Apple isn't available (Android, web). */
export function AppleSignInButton({ onError, onBusyChange }: Props) {
  const { loginWithApple } = useAuth();
  const { t } = useLocale();
  const theme = useTheme();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);

  if (!available) return null;

  const handlePress = async () => {
    onError('');
    onBusyChange?.(true);
    try {
      await loginWithApple();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'APPLE_FAILED';
      if (code !== 'APPLE_CANCELED') onError(t(`errors.${code}`));
    } finally {
      onBusyChange?.(false);
    }
  };

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      // Apple's guidelines: white on dark backgrounds, black on light ones.
      buttonStyle={
        theme.scheme === 'dark'
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
      }
      cornerRadius={14}
      style={styles.button}
      onPress={handlePress}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 50,
  },
});
