import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  active: boolean;
  label: string;
  icon?: string;
  onChange: (value: string) => void;
};

export function CustomDatePill({ active, label, icon, onChange }: Props) {
  const theme = useTheme();

  return (
    <View
      style={{
        position: 'relative',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderRadius: 999,
        borderWidth: 1,
        overflow: 'hidden',
        borderColor: theme.glassBorder,
        backgroundColor: active ? theme.backgroundSelected : theme.glassBg,
      }}>
      {!!icon && <ThemedText style={{ fontSize: 14 }}>{icon}</ThemedText>}
      <ThemedText type="small" themeColor={active ? 'text' : 'textSecondary'}>
        {label}
      </ThemedText>
      <input
        type="date"
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0,
          border: 'none',
          cursor: 'pointer',
          width: '100%',
          height: '100%',
        }}
      />
    </View>
  );
}
