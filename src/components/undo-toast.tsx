import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  message: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
  /** Hides itself after this long unless the user acts first. */
  duration?: number;
};

/** A short-lived bar at the bottom of the screen with one action, e.g. "Undo". */
export function UndoToast({ message, actionLabel, onAction, onDismiss, duration = 4000 }: Props) {
  const theme = useTheme();

  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration, message]);

  return (
    <View
      pointerEvents="box-none"
      style={styles.wrapper}
      accessibilityLiveRegion="polite">
      <View style={[styles.toast, { backgroundColor: theme.background, borderColor: theme.glassBorder }]}>
        <ThemedText type="small" style={styles.message} numberOfLines={2}>
          {message}
        </ThemedText>
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <ThemedText type="smallBold" style={{ color: theme.primary }}>
            {actionLabel}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: Spacing.four,
    right: Spacing.four,
    bottom: Spacing.three,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
  },
  message: {
    flex: 1,
  },
});
