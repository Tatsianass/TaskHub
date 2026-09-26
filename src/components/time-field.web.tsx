import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  label?: string;
  placeholder: string;
  value: string | null;
  onChange: (value: string) => void;
};

export function TimeField({ label, value, onChange }: Props) {
  const theme = useTheme();

  return (
    <View style={{ gap: Spacing.one }}>
      {!!label && (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      )}
      <input
        type="time"
        value={value ?? ''}
        onClick={(event) => {
          const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
          if (typeof input.showPicker === 'function') {
            try {
              input.showPicker();
            } catch {
              // Some browsers throw if called too soon after a previous picker closed — ignore.
            }
          }
        }}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
        style={{
          backgroundColor: theme.backgroundElement,
          color: theme.text,
          border: `1px solid ${theme.border}`,
          borderRadius: Spacing.two,
          padding: '10px 12px',
          fontSize: 15,
          fontFamily: 'inherit',
          colorScheme: 'dark',
        }}
      />
    </View>
  );
}
