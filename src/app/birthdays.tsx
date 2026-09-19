import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuroraBackground } from '@/components/aurora-background';
import { DateField } from '@/components/date-field';
import { GlassPanel } from '@/components/glass-panel';
import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { useTheme } from '@/hooks/use-theme';
import { useBirthdays } from '@/hooks/use-birthdays';
import { nextBirthdayDayDiff } from '@/utils/dates';

export default function BirthdaysScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const theme = useTheme();
  const { birthdays, isLoaded, addBirthday, deleteBirthday } = useBirthdays();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...birthdays].sort((a, b) => nextBirthdayDayDiff(a.date) - nextBirthdayDayDiff(b.date)),
    [birthdays],
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
    <AuroraBackground>
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={[styles.iconButton, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
            <ThemedText style={styles.back}>←</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">🎂 {t('settings.birthdays')}</ThemedText>
          <Pressable
            onPress={openModal}
            hitSlop={10}
            style={[styles.iconButton, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
            <ThemedText style={styles.add}>➕</ThemedText>
          </Pressable>
        </View>

        {isLoaded && (
          <GlassPanel style={styles.listPanel} contentStyle={styles.listContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {sorted.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                  {t('birthdays.empty')}
                </ThemedText>
              )}
              {sorted.map((birthday) => {
                const diff = nextBirthdayDayDiff(birthday.date);
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
            </ScrollView>
          </GlassPanel>
        )}
      </View>
      </SafeAreaView>

      <Modal visible={isModalOpen} animationType="slide" transparent onRequestClose={() => setIsModalOpen(false)}>
        <View style={styles.backdrop}>
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
        </View>
      </Modal>
    </AuroraBackground>
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
    paddingBottom: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    fontSize: 16,
  },
  add: {
    fontSize: 15,
  },
  listPanel: {
    flex: 1,
    marginBottom: Spacing.three,
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
