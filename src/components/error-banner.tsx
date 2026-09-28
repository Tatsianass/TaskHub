import { Pressable, StyleSheet } from 'react-native';

import { GlassPanel } from '@/components/glass-panel';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useTheme } from '@/hooks/use-theme';
import { hexToRgba } from '@/utils/colors';

type Props = {
  /** An error code from the API (e.g. `SERVER_UNREACHABLE`), or null to render nothing. */
  code: string | null;
  onDismiss: () => void;
};

/** A tap-to-dismiss banner for a failed data request. Unknown codes read as `errors.UNKNOWN`. */
export function ErrorBanner({ code, onDismiss }: Props) {
  const { t } = useLocale();
  const theme = useTheme();

  if (!code) return null;

  const key = `errors.${code}`;
  const message = t(key);

  return (
    <Pressable onPress={onDismiss} accessibilityRole="alert">
      <GlassPanel style={styles.banner} contentStyle={styles.content} tintColor={hexToRgba(theme.danger, 0.15)}>
        <ThemedText type="small" style={styles.text}>
          {message === key ? t('errors.UNKNOWN') : message}
        </ThemedText>
        <ThemedText themeColor="textSecondary">✕</ThemedText>
      </GlassPanel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginBottom: Spacing.three,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  text: {
    flex: 1,
  },
});
