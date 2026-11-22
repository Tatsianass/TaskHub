import { Redirect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/bottom-sheet-modal';
import { DateField } from '@/components/date-field';
import { ErrorBanner } from '@/components/error-banner';
import { PlusIcon, TrashIcon } from '@/components/header-icons';
import { GlassPanel } from '@/components/glass-panel';
import { PrimaryButton } from '@/components/primary-button';
import { TimeField } from '@/components/time-field';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { MAX_NAME_LENGTH } from '@/constants/limits';
import { MAX_ACTIVE_TASKS_PER_QUADRANT, QUADRANTS } from '@/constants/quadrants';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useBirthdaysContext } from '@/context/birthdays-context';
import { useTasksContext } from '@/context/tasks-context';
import { useLocale } from '@/context/locale-context';
import { useNotificationsSettings } from '@/context/notifications-context';
import { useToday } from '@/context/today-context';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import type { Birthday } from '@/types/birthday';
import type { QuadrantId } from '@/types/task';
import { hexToRgba } from '@/utils/colors';
import { addDaysISO, dayDiffFromToday, nextBirthdayDayDiff } from '@/utils/dates';

const ALERT_OPTIONS = [1, 3, 7, 14];
const DEFAULT_ALERT_DAYS = 7;
const SOON_DAYS = 30;
const CLOSE_DAYS = 7;
const ACTION_WIDTH = 76;

function initialOf(name: string) {
  return (Array.from(name.trim())[0] ?? '?').toUpperCase();
}

/** Same name, same colour: picks one of the theme's blob colours so avatars stay on-palette. */
function avatarColor(name: string, palette: readonly string[]) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
      <GlassPanel>{children}</GlassPanel>
    </View>
  );
}

type Entry = { birthday: Birthday; diff: number; dateLabel: string };

/** Revealed under a row while it is swiped left; fades in so it never shows through a resting row. */
function DeleteAction({ progress, onPress }: { progress: SharedValue<number>; onPress: () => void }) {
  const { t } = useLocale();
  const theme = useTheme();
  const fade = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Animated.View style={[styles.deleteAction, fade]}>
      <Pressable
        onPress={onPress}
        style={[styles.deleteButton, { backgroundColor: theme.danger }]}
        accessibilityRole="button"
        accessibilityLabel={t('overdue.delete')}>
        <TrashIcon color={theme.background} size={20} />
      </Pressable>
    </Animated.View>
  );
}

export default function BirthdaysScreen() {
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const { askForPermission } = useNotificationsSettings();
  const theme = useTheme();
  const today = useToday();
  const { tasks, addTask } = useTasksContext();
  const { birthdays, isLoaded, addBirthday, updateBirthday, deleteBirthday, error, pendingWrites, clearError, refresh } = useBirthdaysContext();

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

  const entries = useMemo<Entry[]>(() => {
    const format = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' });
    return birthdays
      .map((birthday) => ({
        birthday,
        diff: nextBirthdayDayDiff(birthday.date, today),
        dateLabel: format.format(new Date(`${birthday.date}T00:00:00`)),
      }))
      .sort((a, b) => a.diff - b.diff);
  }, [birthdays, today, locale]);
  const [next, ...rest] = entries;
  const soon = rest.filter((entry) => entry.diff <= SOON_DAYS);
  const later = rest.filter((entry) => entry.diff > SOON_DAYS);

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
    // A birthday with a reminder is the other moment notifications become worth allowing; the sheet must close first.
    if (remindMe || alertOn) setTimeout(() => void askForPermission().catch(() => {}), 600);
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
        repeat: null,
      });
    }
    setIsModalOpen(false);
  };

  const confirmDelete = (birthday: Birthday) => {
    Alert.alert(t('birthdays.deleteTitle'), t('birthdays.deleteMessage', { name: birthday.name }), [
      { text: t('completed.cancel'), style: 'cancel' },
      { text: t('overdue.delete'), style: 'destructive', onPress: () => deleteBirthday(birthday.id) },
    ]);
  };

  const handleRemindToggle =(value: boolean) => {
    setRemindMe(value);
    if (value && !remindTime) setRemindTime('09:00');
  };

  const renderRow = ({ birthday, diff, dateLabel }: Entry, first: boolean) => {
    const color = avatarColor(birthday.name, theme.blobs);
    const pillStyle =
      diff === 0
        ? { backgroundColor: theme.primary, color: theme.background }
        : diff <= CLOSE_DAYS
          ? { backgroundColor: hexToRgba(theme.primary, 0.2), color: theme.primary }
          : { backgroundColor: theme.glassBg, color: theme.textSecondary };
    return (
      <ReanimatedSwipeable
        key={birthday.id}
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        renderRightActions={(progress) => <DeleteAction progress={progress} onPress={() => confirmDelete(birthday)} />}
        containerStyle={!first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.glassBorder }}>
        <Pressable onPress={() => openEdit(birthday)} style={styles.row}>
          <View style={[styles.avatar, { backgroundColor: hexToRgba(color, 0.35) }]}>
            <ThemedText style={styles.avatarText}>{initialOf(birthday.name)}</ThemedText>
          </View>
          <View style={styles.rowText}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {birthday.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {dateLabel}
            </ThemedText>
          </View>
          <View style={[styles.pill, { backgroundColor: pillStyle.backgroundColor }]}>
            <ThemedText type="small" style={{ color: pillStyle.color }}>
              {diff === 0 ? t('birthdays.today') : t('birthdays.inDays', { n: diff })}
            </ThemedText>
          </View>
        </Pressable>
      </ReanimatedSwipeable>
    );
  };

  return (
    <>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.title}>
            {t('settings.birthdays')}
          </ThemedText>
          <Pressable
            onPress={openModal}
            hitSlop={10}
            style={[styles.iconButton, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
            <PlusIcon color={theme.text} />
          </Pressable>
        </View>

        <ErrorBanner code={error ?? (pendingWrites > 0 ? 'QUEUED_OFFLINE' : null)} info={!error} onDismiss={clearError} />

        {isLoaded && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />}>
            {!next && (
              <View style={styles.emptyState}>
                <View style={[styles.emptyCircle, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
                  <ThemedText style={styles.emptyIcon}>🎉</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                  {t('birthdays.empty')}
                </ThemedText>
                <PrimaryButton title={t('birthdays.addTitle')} onPress={openModal} style={styles.emptyButton} />
              </View>
            )}
            {!!next && (
              <Pressable onPress={() => openEdit(next.birthday)}>
                <LinearGradient
                  colors={[theme.gradientStart, theme.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.hero}>
                  <ThemedText style={styles.heroWatermark}>🎂</ThemedText>
                  <ThemedText style={styles.heroLabel}>{t('birthdays.next')}</ThemedText>
                  <View style={styles.heroPerson}>
                    <View style={styles.heroAvatar}>
                      <ThemedText style={styles.heroInitial}>{initialOf(next.birthday.name)}</ThemedText>
                    </View>
                    <View style={styles.rowText}>
                      <ThemedText style={styles.heroName} numberOfLines={1}>
                        {next.birthday.name}
                      </ThemedText>
                      <ThemedText style={styles.heroDate}>{next.dateLabel}</ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.heroCountdown}>
                    {next.diff === 0 ? t('birthdays.today') : t('birthdays.inDays', { n: next.diff })}
                  </ThemedText>
                </LinearGradient>
              </Pressable>
            )}
            {soon.length > 0 && (
              <Section title={t('birthdays.sectionSoon')}>
                {soon.map((entry, index) => renderRow(entry, index === 0))}
              </Section>
            )}
            {later.length > 0 && (
              <Section title={t('birthdays.sectionLater')}>
                {later.map((entry, index) => renderRow(entry, index === 0))}
              </Section>
            )}
          </ScrollView>
        )}
      </View>
      </SafeAreaView>

      <BottomSheetModal
        visible={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxHeight="92%"
        header={
          <View style={styles.modalHeader}>
            <ThemedText type="smallBold">{editing ? t('birthdays.editTitle') : t('birthdays.addTitle')}</ThemedText>
            <Pressable onPress={() => setIsModalOpen(false)} hitSlop={8}>
              <ThemedText style={styles.closeIcon}>✕</ThemedText>
            </Pressable>
          </View>
        }>
        <SafeAreaView edges={['bottom']} style={styles.sheetBody}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.form}>
                <TextField
                  label={t('birthdays.nameLabel')}
                  value={name}
                  onChangeText={setName}
                  maxLength={MAX_NAME_LENGTH}
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
                {editing && (
                  <PrimaryButton
                    title={t('overdue.delete')}
                    variant="danger"
                    onPress={() => {
                      setIsModalOpen(false);
                      confirmDelete(editing);
                    }}
                  />
                )}
              </View>
          </ScrollView>
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
  // Fills the screen so pull-to-refresh works from anywhere, even when the list is short or empty.
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.four,
  },
  hero: {
    borderRadius: Spacing.four - 4,
    padding: Spacing.three,
    gap: Spacing.three,
    overflow: 'hidden',
  },
  heroWatermark: {
    position: 'absolute',
    right: -4,
    top: -12,
    fontSize: 72,
    lineHeight: 88,
    opacity: 0.18,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroPerson: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
  },
  heroAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInitial: {
    color: '#ffffff',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
  },
  heroName: {
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
  },
  heroDate: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
  },
  heroCountdown: {
    color: '#ffffff',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 0.8,
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
    marginLeft: Spacing.one,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  emptyCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 38,
    lineHeight: 48,
  },
  empty: {
    textAlign: 'center',
  },
  emptyButton: {
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three - 4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 3,
  },
  deleteAction: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
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
  sheetBody: {
    flexShrink: 1,
  },
  form: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
});
