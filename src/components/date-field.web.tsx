import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  label?: string;
  placeholder: string;
  value: string | null;
  onChange: (value: string | null) => void;
};

export function DateField({ label, value, onChange }: Props) {
  const theme = useTheme();

  return (
    <View style={{ gap: Spacing.one }}>
      {!!label && (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      )}
      <input
        type="date"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
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
