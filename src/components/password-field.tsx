import { useState } from 'react';
import { Pressable } from 'react-native';

import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useLocale } from '@/context/locale-context';
import type { ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof TextField>, 'secureTextEntry' | 'accessory'>;

/** A password input with a show/hide toggle. */
export function PasswordField(props: Props) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      secureTextEntry={!visible}
      accessory={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={visible ? t('auth.hidePassword') : t('auth.showPassword')}>
          <ThemedText type="small" themeColor="primary">
            {visible ? t('auth.hidePassword') : t('auth.showPassword')}
          </ThemedText>
        </Pressable>
      }
    />
  );
}
