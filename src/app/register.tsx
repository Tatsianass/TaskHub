import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuroraBackground } from '@/components/aurora-background';
import { AppleSignInButton } from '@/components/apple-sign-in-button';
import { GlassPanel } from '@/components/glass-panel';
import { PrimaryButton } from '@/components/primary-button';
import { PasswordField } from '@/components/password-field';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { Spacing } from '@/constants/theme';

export default function RegisterScreen() {
  const { user, register } = useAuth();
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) return <Redirect href="/" />;

  const handleSubmit = async () => {
    setError('');
    if (password !== confirmPassword) {
      setError(t('errors.PASSWORDS_MISMATCH'));
      return;
    }
    setIsSubmitting(true);
    try {
      await register(email, password);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'REGISTER_FAILED';
      setError(t(`errors.${code}`));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuroraBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <SafeAreaView style={styles.safeArea}>
        <View style={styles.inner}>
          <View style={styles.hero}>
            <ThemedText type="title" style={styles.brand}>
              {t('app.brand')}
            </ThemedText>
            <ThemedText themeColor="textSecondary">{t('auth.register.tagline')}</ThemedText>
          </View>

          <GlassPanel contentStyle={styles.form}>
            <TextField
              label={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.emailPlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              returnKeyType="next"
              submitBehavior="submit"
            />
            <PasswordField
              label={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.passwordPlaceholderMin')}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              submitBehavior="submit"
            />
            <PasswordField
              label={t('auth.confirmPassword')}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t('auth.passwordPlaceholderDots')}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />

            {!!error && (
              <ThemedText themeColor="danger" type="small">
                {error}
              </ThemedText>
            )}

            <PrimaryButton title={t('auth.registerButton')} onPress={handleSubmit} loading={isSubmitting} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.or}>
              {t('auth.or')}
            </ThemedText>
            <AppleSignInButton onError={setError} onBusyChange={setIsSubmitting} />
          </GlassPanel>

          <View style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('auth.haveAccount')}
            </ThemedText>
            <Link href="/login">
              <ThemedText type="small" themeColor="primary">
                {' '}
                {t('auth.signIn')}
              </ThemedText>
            </Link>
          </View>
        </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.five,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  brand: {
    fontSize: 36,
  },
  form: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
  or: {
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
