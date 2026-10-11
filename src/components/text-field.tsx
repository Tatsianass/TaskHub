import type { ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = TextInputProps & {
  label?: string;
  /** Rendered inside the field, at its right edge (e.g. a mic button). */
  accessory?: ReactNode;
};

export function TextField({ label, style, accessory, ...rest }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.wrapper}>
      {!!label && (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      )}
      <View>
        <TextInput
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.glassBg, borderColor: theme.glassBorder },
            !!accessory && styles.inputWithAccessory,
            style,
          ]}
          {...rest}
        />
        {!!accessory && <View style={styles.accessory}>{accessory}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 15,
  },
  inputWithAccessory: {
    paddingRight: 48,
  },
  accessory: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 6,
    justifyContent: 'center',
  },
});
