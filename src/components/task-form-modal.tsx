import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateField } from '@/components/date-field';
import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { QUADRANTS } from '@/constants/quadrants';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useTheme } from '@/hooks/use-theme';
import { hexToRgba } from '@/utils/colors';
import type { TaskDraft } from '@/hooks/use-tasks';
import type { QuadrantId, Task } from '@/types/task';

type Props = {
  visible: boolean;
  initialTask: Task | null;
  defaultQuadrantId: QuadrantId;
  onClose: () => void;
  onSave: (draft: TaskDraft) => void;
  onDelete?: () => void;
};

export function TaskFormModal({ visible, initialTask, defaultQuadrantId, onClose, onSave, onDelete }: Props) {
  const { t } = useLocale();
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [quadrantId, setQuadrantId] = useState<QuadrantId>(defaultQuadrantId);
  const [dueDate, setDueDate] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(initialTask?.title ?? '');
    setDescription(initialTask?.description ?? '');
    setQuadrantId(initialTask?.quadrantId ?? defaultQuadrantId);
    setDueDate(initialTask?.dueDate ?? null);
  }, [visible, initialTask, defaultQuadrantId]);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({ title, description, quadrantId, dueDate });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView style={styles.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.header}>
              <ThemedText type="smallBold">{initialTask ? t('taskForm.editTitle') : t('taskForm.addTitle')}</ThemedText>
              <View style={styles.headerActions}>
                {onDelete && (
                  <Pressable onPress={onDelete} hitSlop={8}>
                    <ThemedText style={styles.deleteIcon}>🗑</ThemedText>
                  </Pressable>
                )}
                <Pressable onPress={onClose} hitSlop={8}>
                  <ThemedText style={styles.closeIcon}>✕</ThemedText>
                </Pressable>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              <TextField
                label={t('taskForm.titleLabel')}
                value={title}
                onChangeText={setTitle}
                placeholder={t('taskForm.titlePlaceholder')}
                autoFocus
              />
              <TextField
                label={t('taskForm.descriptionLabel')}
                value={description}
                onChangeText={setDescription}
                placeholder={t('taskForm.descriptionPlaceholder')}
                multiline
                numberOfLines={3}
                style={styles.multiline}
              />

              <DateField
                label={t('taskForm.dateLabel')}
                placeholder={t('taskForm.datePlaceholder')}
                value={dueDate}
                onChange={setDueDate}
              />

              <ThemedText type="small" themeColor="textSecondary" style={styles.quadrantLabel}>
                {t('taskForm.sectionLabel')}
              </ThemedText>
              <View style={[styles.quadrantTabs, { backgroundColor: theme.glassBg, borderColor: theme.glassBorder }]}>
                {QUADRANTS.map((quadrant) => {
                  const isActive = quadrant.id === quadrantId;
                  return (
                    <Pressable key={quadrant.id} style={styles.quadrantTabWrapper} onPress={() => setQuadrantId(quadrant.id)}>
                      <View
                        style={[
                          styles.quadrantTab,
                          isActive && {
                            backgroundColor: hexToRgba(quadrant.color, 0.32),
                            borderColor: theme.glassBorder,
                          },
                        ]}>
                        <ThemedText style={styles.quadrantTabIcon}>{quadrant.icon}</ThemedText>
                        <ThemedText type="small" themeColor={isActive ? 'text' : 'textSecondary'}>
                          {t(quadrant.shortLabelKey)}
                        </ThemedText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <PrimaryButton title={t('taskForm.save')} onPress={handleSave} disabled={!title.trim()} />
            </ScrollView>
          </SafeAreaView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,22,28,0.25)',
  },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  deleteIcon: {
    fontSize: 18,
  },
  closeIcon: {
    fontSize: 18,
  },
  form: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  quadrantLabel: {
    marginTop: Spacing.one,
  },
  quadrantTabs: {
    flexDirection: 'row',
    gap: Spacing.one,
    padding: Spacing.one,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  quadrantTabWrapper: {
    flex: 1,
  },
  quadrantTab: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  quadrantTabIcon: {
    fontSize: 17,
  },
});
