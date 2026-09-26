import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Option = { value: string; label: string };

type Props = {
  label?: string;
  value: string;
  options: Option[];
  onSelect: (value: string) => void;
};

export function DropdownField({ label, value, options, onSelect }: Props) {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.wrapper}>
      {!!label && (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      )}
      <Pressable
        onPress={() => setIsOpen(true)}
        style={[styles.trigger, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText>{selected?.label ?? ''}</ThemedText>
        <ThemedText themeColor="textSecondary">▾</ThemedText>
      </Pressable>

      <Modal visible={isOpen} animationType="fade" transparent onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)}>
          <ThemedView style={styles.sheet}>
            <SafeAreaView edges={['bottom']}>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    onSelect(option.value);
                    setIsOpen(false);
                  }}
                  style={[styles.row, option.value === value && { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText themeColor={option.value === value ? 'primary' : 'text'}>{option.label}</ThemedText>
                </Pressable>
              ))}
            </SafeAreaView>
          </ThemedView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,22,28,0.25)',
  },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    paddingVertical: Spacing.two,
  },
  row: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
});
