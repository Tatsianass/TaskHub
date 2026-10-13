import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/bottom-sheet-modal';
import { DateField } from '@/components/date-field';
import { ErrorBanner } from '@/components/error-banner';
import { PlusIcon } from '@/components/header-icons';
import { GlassPanel } from '@/components/glass-panel';
import { PrimaryButton } from '@/components/primary-button';
import { TimeField } from '@/components/time-field';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { MAX_ACTIVE_TASKS_PER_QUADRANT, QUADRANTS } from '@/constants/quadrants';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useBirthdaysContext } from '@/context/birthdays-context';
import { useTasksContext } from '@/context/tasks-context';
import { useLocale } from '@/context/locale-context';
import { useToday } from '@/context/today-context';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import type { Birthday } from '@/types/birthday';
import type { QuadrantId } from '@/types/task';
import { addDaysISO, dayDiffFromToday, nextBirthdayDayDiff } from '@/utils/dates';

const ALERT_OPTIONS = [1, 3, 7, 14];
const DEFAULT_ALERT_DAYS = 7;

export default function BirthdaysScreen() {
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const theme = useTheme();
  const today = useToday();
  const { tasks, addTask } = useTasksContext();
  const { birthdays, isLoaded, addBirthday, updateBirthday, deleteBirthday, error, clearError, refresh } = useBirthdaysContext();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Birthday | null>(null);
  const { refreshing, onRefresh } = usePullToRefresh(refresh);
  const [name, setName] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [remindMe, setRemindMe] = useState(true);
  const [remindTime, setRemindTime] = useState<string | null>('09:00');
  const [alertOn, setAlertOn] = useState(true);
  const [alertDays, setAlertDays] = useState(DEFAULT_ALERT_DAYS);
  const [giftOn, setGiftOn] = useState(true);
  const [giftQuadrant, setGiftQuadrant] = useState<QuadrantId>('urgent-important');

  const sorted = useMemo(
    () => [...birthdays].sort((a, b) => nextBirthdayDayDiff(a.date, today) - nextBirthdayDayDiff(b.date, today)),
    [birthdays, today],
  );

  if (!user) return <Redirect href="/login" />;

  const openEdit = (birthday: Birthday) => {
    setEditing(birthday);
    setName(birthday.name);
    setDate(birthday.date);
    setRemindMe(birthday.remindMe !== false);
    setRemindTime(birthday.remindTime ?? '09:00');
    setAlertOn(!!birthday.alertDaysBefore);
    setAlertDays(birthday.alertDaysBefore ?? DEFAULT_ALERT_DAYS);
    setGiftOn(false);
    setIsModalOpen(true);
  };

  const openModal = () => {
    setEditing(null);
    setName('');
    setDate(null);
    setRemindMe(true);
    setRemindTime('09:00');
    setAlertOn(true);
    setAlertDays(DEFAULT_ALERT_DAYS);
    setGiftOn(true);
    setGiftQuadrant('urgent-important');
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!name.trim() || !date) return;
    const draft = { name, date, remindMe, remindTime, alertDaysBefore: alertOn ? alertDays : null };
    if (editing) {
      updateBirthday(editing.id, draft);
      setIsModalOpen(false);
      return;
    }
    addBirthday(draft);
    if (giftOn) {
      const leadDays = alertOn ? alertDays : DEFAULT_ALERT_DAYS;
      const birthdayDate = addDaysISO(today, nextBirthdayDayDiff(date, today));
      const dueDate = addDaysISO(birthdayDate, -leadDays);
      // The quadrant caps active tasks; when the chosen one is full, fall back to the planning quadrant.
      const active = tasks.filter((task) => !task.done && task.quadrantId === giftQuadrant).length;
      addTask({
        title: t('birthdays.giftTaskTitle', { name: name.trim() }),
        description: '',
        quadrantId: active >= MAX_ACTIVE_TASKS_PER_QUADRANT ? 'not-urgent-important' : giftQuadrant,
        tag: null,
        dueDate: dayDiffFromToday(dueDate, today) < 0 ? today : dueDate,
        remindTime: null,
        remindOffsets: [],
      });
    }
    setIsModalOpen(false);
  };

  const handleRemindToggle = (value: boolean) => {
    setRemindMe(value);
    if (value && !remindTime) setRemindTime('09:00');
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
                  <Pressable key={birthday.id} onPress={() => openEdit(birthday)} style={styles.row}>
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
                  </Pressable>
                );
              })}
              <Pressable onPress={openModal} style={styles.freeArea} />
            </ScrollView>
          </GlassPanel>
        )}
      </View>
      </SafeAreaView>

      <BottomSheetModal
        visible={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        header={
          <View style={styles.modalHeader}>
            <ThemedText type="smallBold">{editing ? t('birthdays.editTitle') : t('birthdays.addTitle')}</ThemedText>
            <Pressable onPress={() => setIsModalOpen(false)} hitSlop={8}>
              <ThemedText style={styles.closeIcon}>✕</ThemedText>
            </Pressable>
          </View>
        }>
        <SafeAreaView edges={['bottom']}>
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
                <View style={styles.remindRow}>
                  <ThemedText>🔔 {t('taskForm.remindLabel')}</ThemedText>
                  <Switch
                    value={remindMe}
                    onValueChange={handleRemindToggle}
                    trackColor={{ false: theme.glassBorder, true: theme.primary }}
                  />
                </View>
                {remindMe && (
                  <TimeField
                    label={t('taskForm.remindTimeLabel')}
                    placeholder={t('taskForm.remindTimePlaceholder')}
                    value={remindTime}
                    onChange={setRemindTime}
                  />
                )}

                <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
                <View style={styles.remindRow}>
                  <View style={styles.rowText}>
                    <ThemedText>🔔 {t('birthdays.alertLabel')}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('birthdays.alertHint')}
                    </ThemedText>
                  </View>
                  <Switch
                    value={alertOn}
                    onValueChange={setAlertOn}
                    trackColor={{ false: theme.glassBorder, true: theme.primary }}
                  />
                </View>
                {alertOn && (
                  <View style={styles.chips}>
                    {ALERT_OPTIONS.map((days) => (
                      <Pressable
                        key={days}
                        onPress={() => setAlertDays(days)}
                        style={[
                          styles.chip,
                          { borderColor: theme.glassBorder },
                          alertDays === days && { backgroundColor: theme.glassBg, borderColor: theme.primary },
                        ]}>
                        <ThemedText type="small" themeColor={alertDays === days ? 'text' : 'textSecondary'}>
                          {t(`birthdays.alertChip.${days}`)}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                )}

                {!editing && (
                  <>
                <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
                <View style={styles.remindRow}>
                  <View style={styles.rowText}>
                    <ThemedText>🎁 {t('birthdays.giftLabel')}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('birthdays.giftHint')}
                    </ThemedText>
                  </View>
                  <Switch
                    value={giftOn}
                    onValueChange={setGiftOn}
                    trackColor={{ false: theme.glassBorder, true: theme.primary }}
                  />
                </View>
                {giftOn && (
                  <View style={styles.chips}>
                    {QUADRANTS.map((quadrant) => (
                      <Pressable
                        key={quadrant.id}
                        onPress={() => setGiftQuadrant(quadrant.id)}
                        style={[
                          styles.chip,
                          { borderColor: theme.glassBorder },
                          giftQuadrant === quadrant.id && { backgroundColor: theme.glassBg, borderColor: quadrant.color },
                        ]}>
                        <ThemedText type="small" themeColor={giftQuadrant === quadrant.id ? 'text' : 'textSecondary'}>
                          {quadrant.icon} {t(quadrant.titleKey)}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                )}
                  </>
                )}
                <PrimaryButton title={t('birthdays.save')} onPress={handleSave} disabled={!name.trim() || !date} />
              </View>
        </SafeAreaView>
      </BottomSheetModal>
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  remindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: {
    height: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
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
