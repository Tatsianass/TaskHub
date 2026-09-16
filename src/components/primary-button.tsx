import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'danger' | 'ghost';
  style?: ViewStyle;
  textColor?: string;
};

export function PrimaryButton({ title, onPress, disabled, loading, variant = 'primary', style, textColor }: Props) {
  const theme = useTheme();
  const isGhost = variant === 'ghost';
  const backgroundColor = isGhost ? 'transparent' : variant === 'danger' ? theme.danger : theme.primary;
  const resolvedTextColor = textColor ?? (isGhost ? theme.text : '#ffffff');

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        { backgroundColor, opacity: disabled ? 0.5 : 1 },
        isGhost && { borderWidth: 1, borderColor: theme.border },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={resolvedTextColor} />
      ) : (
        <ThemedText type="smallBold" style={{ color: resolvedTextColor }}>
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
