import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateField } from '@/components/date-field';
import { ErrorBanner } from '@/components/error-banner';
import { PlusIcon } from '@/components/header-icons';
import { GlassPanel } from '@/components/glass-panel';
import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useBirthdaysContext } from '@/context/birthdays-context';
import { useLocale } from '@/context/locale-context';
import { useToday } from '@/context/today-context';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { nextBirthdayDayDiff } from '@/utils/dates';

export default function BirthdaysScreen() {
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const theme = useTheme();
  const today = useToday();
  const { birthdays, isLoaded, addBirthday, deleteBirthday, error, clearError, refresh } = useBirthdaysContext();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const { refreshing, onRefresh } = usePullToRefresh(refresh);
  const [name, setName] = useState('');
  const [date, setDate] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...birthdays].sort((a, b) => nextBirthdayDayDiff(a.date, today) - nextBirthdayDayDiff(b.date, today)),
    [birthdays, today],
  );

  if (!user) return <Redirect href="/login" />;

  const openModal = () => {
    setName('');
    setDate(null);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!name.trim() || !date) return;
    addBirthday({ name, date });
    setIsModalOpen(false);
  };

  return (
    <>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.title}>
            🎉 {t('settings.birthdays')}
          </ThemedText>
          <Pressable
            onPress={openModal}
            hitSlop={10}
            style={[styles.iconButton, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
            <PlusIcon color={theme.text} />
          </Pressable>
        </View>

        <ErrorBanner code={error} onDismiss={clearError} />

        {isLoaded && (
          <GlassPanel style={styles.listPanel} contentStyle={styles.listContent}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />
              }>
              {sorted.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                  {t('birthdays.empty')}
                </ThemedText>
              )}
              {sorted.map((birthday) => {
                const diff = nextBirthdayDayDiff(birthday.date, today);
                const dateLabel = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(
                  new Date(`${birthday.date}T00:00:00`),
                );
                return (
                  <View key={birthday.id} style={styles.row}>
                    <View style={styles.rowText}>
                      <ThemedText type="smallBold">{birthday.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {dateLabel}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="primary">
                      {diff === 0 ? t('birthdays.today') : t('birthdays.inDays', { n: diff })}
                    </ThemedText>
                    <Pressable onPress={() => deleteBirthday(birthday.id)} hitSlop={8} style={styles.delete}>
                      <ThemedText themeColor="textSecondary">✕</ThemedText>
                    </Pressable>
                  </View>
                );
              })}
              <Pressable onPress={openModal} style={styles.freeArea} />
            </ScrollView>
          </GlassPanel>
        )}
      </View>
      </SafeAreaView>

      <Modal visible={isModalOpen} animationType="slide" transparent onRequestClose={() => setIsModalOpen(false)}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ThemedView style={styles.sheet}>
            <SafeAreaView edges={['bottom']}>
              <View style={styles.modalHeader}>
                <ThemedText type="smallBold">{t('birthdays.addTitle')}</ThemedText>
                <Pressable onPress={() => setIsModalOpen(false)} hitSlop={8}>
                  <ThemedText style={styles.closeIcon}>✕</ThemedText>
                </Pressable>
              </View>

              <View style={styles.form}>
                <TextField
                  label={t('birthdays.nameLabel')}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('birthdays.namePlaceholder')}
                  autoFocus
                />
                <DateField
                  label={t('birthdays.dateLabel')}
                  placeholder={t('taskForm.datePlaceholder')}
                  value={date}
                  onChange={setDate}
                />
                <PrimaryButton title={t('birthdays.save')} onPress={handleSave} disabled={!name.trim() || !date} />
              </View>
            </SafeAreaView>
          </ThemedView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 22,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listPanel: {
    flex: 1,
    marginBottom: Spacing.three,
  },
  // Fills the panel so pull-to-refresh works from anywhere in it, even when the list is short or empty.
  scrollContent: {
    flexGrow: 1,
  },
  listContent: {
    flex: 1,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    padding: Spacing.two,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  freeArea: {
    flex: 1,
    minHeight: Spacing.six,
  },
  delete: {
    paddingLeft: Spacing.one,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,22,28,0.25)',
  },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  closeIcon: {
    fontSize: 18,
  },
  form: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
});
