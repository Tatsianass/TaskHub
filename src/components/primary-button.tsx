import { LinearGradient } from 'expo-linear-gradient';
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
  const isGradient = variant === 'primary';
  const resolvedTextColor = textColor ?? (isGhost ? theme.text : '#ffffff');

  const content = loading ? (
    <ActivityIndicator color={resolvedTextColor} />
  ) : (
    <ThemedText type="smallBold" style={{ color: resolvedTextColor }}>
      {title}
    </ThemedText>
  );

  if (isGradient) {
    return (
      <Pressable onPress={onPress} disabled={disabled || loading} style={[{ opacity: disabled ? 0.5 : 1 }, style]}>
        <LinearGradient
          colors={[theme.gradientStart, theme.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.button}>
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  const backgroundColor = isGhost ? 'transparent' : theme.danger;

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
      {content}
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
