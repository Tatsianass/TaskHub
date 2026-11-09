import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  /** Plain text label; use `children` for anything richer (e.g. an icon next to the text). */
  label?: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  /** Extra content rendered before the label. */
  children?: ReactNode;
  /** Style of the rounded pill itself. */
  style?: StyleProp<ViewStyle>;
  /** Style of the pressable wrapping the pill (e.g. `flex: 1` inside a row). */
  wrapperStyle?: StyleProp<ViewStyle>;
};

/** A rounded, selectable chip: highlighted while `active`. Used for filters and option pickers. */
export function OptionPill({ label, active, onPress, disabled, testID, children, style, wrapperStyle }: Props) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} testID={testID} style={wrapperStyle}>
      <View
        style={[
          styles.pill,
          { borderColor: theme.glassBorder, backgroundColor: theme.glassBg },
          active && { backgroundColor: theme.backgroundSelected },
          style,
        ]}>
        {children}
        {label !== undefined && (
          <ThemedText type="small" themeColor={active ? 'text' : 'textSecondary'}>
            {label}
          </ThemedText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    borderWidth: 1,
  },
});
