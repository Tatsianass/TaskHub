import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { PRIVACY_URL, TERMS_URL } from '@/lib/config';

/** Terms and privacy policy links; the privacy link only shows once EXPO_PUBLIC_PRIVACY_URL is set. */
export function LegalLinks() {
  const { t } = useLocale();

  return (
    <View style={styles.links}>
      <Pressable onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} hitSlop={8} accessibilityRole="link">
        <ThemedText type="small" themeColor="textSecondary">
          {t('pro.termsLink')}
        </ThemedText>
      </Pressable>
      {!!PRIVACY_URL && (
        <Pressable onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} hitSlop={8} accessibilityRole="link">
          <ThemedText type="small" themeColor="textSecondary">
            {t('pro.privacyLink')}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.three },
});
