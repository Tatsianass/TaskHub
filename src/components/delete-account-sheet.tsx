import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetModal } from '@/components/bottom-sheet-modal';
import { PasswordField } from '@/components/password-field';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { ApiError } from '@/lib/api';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Deletes the account with this password; rejects with the reason it could not. */
  onConfirm: (password: string) => Promise<void>;
};

/** Asks an email account for its password before it is deleted for good. */
export function DeleteAccountSheet({ visible, onClose, onConfirm }: Props) {
  const { t } = useLocale();
  const theme = useTheme();
  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      header={
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <ThemedText type="smallBold">{t('settings.deleteAccountTitle')}</ThemedText>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            style={[styles.close, { borderColor: theme.glassBorder, backgroundColor: theme.glassBg }]}>
            <ThemedText style={styles.closeIcon}>✕</ThemedText>
          </Pressable>
        </View>
      }>
      {/* Mounted only while open, so a reopened sheet starts empty. */}
      <DeleteAccountBody onConfirm={onConfirm} />
    </BottomSheetModal>
  );
}

function DeleteAccountBody({ onConfirm }: Pick<Props, 'onConfirm'>) {
  const { t } = useLocale();
  const theme = useTheme();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(password);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      setError(
        code === 'WRONG_PASSWORD' || code === 'TOO_MANY_REQUESTS' || code === 'SERVER_UNREACHABLE'
          ? t(`errors.${code}`)
          : t('settings.deleteAccountFailed'),
      );
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.body}>
      <ThemedText themeColor="textSecondary">{t('settings.deletePasswordHint')}</ThemedText>
      <PasswordField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        textContentType="password"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {!!error && <ThemedText type="small" style={{ color: theme.danger }}>{error}</ThemedText>}
      <PrimaryButton title={t('settings.deleteAccount')} onPress={submit} variant="danger" disabled={!password} loading={busy} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  headerSide: { width: 32 },
  close: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 14 },
  body: { gap: Spacing.three, padding: Spacing.three },
});
