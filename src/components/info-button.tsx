import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  /** Screen-reader label for the ⓘ button. */
  accessibilityLabel: string;
  title: string;
  closeLabel: string;
  children: ReactNode;
};

/** A small ⓘ button that opens a bottom sheet explaining a setting. */
export function InfoButton({ accessibilityLabel, title, closeLabel, children }: Props) {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setIsOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.button, { borderColor: theme.textSecondary }]}>
        <ThemedText themeColor="textSecondary" style={styles.buttonText}>
          i
        </ThemedText>
      </Pressable>

      <Modal visible={isOpen} animationType="fade" transparent onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)}>
          {/* Taps inside the sheet shouldn't close it. */}
          <Pressable onPress={() => {}}>
            <ThemedView style={styles.sheet}>
              <SafeAreaView edges={['bottom']} style={styles.sheetContent}>
                <View style={[styles.handle, { backgroundColor: theme.border }]} />
                <ThemedText type="subtitle" style={styles.title}>
                  {title}
                </ThemedText>
                {children}
                <PrimaryButton title={closeLabel} onPress={() => setIsOpen(false)} />
              </SafeAreaView>
            </ThemedView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: 700,
    fontStyle: 'italic',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,22,28,0.35)',
  },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
  },
  sheetContent: {
    padding: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.three,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.one,
  },
  title: {
    fontSize: 20,
  },
});
