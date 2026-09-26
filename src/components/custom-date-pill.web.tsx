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
        justifyContent: 'center',
        gap: 6,
        height: 40,
        paddingHorizontal: Spacing.three,
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
