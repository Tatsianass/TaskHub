import { Colors, PRO_THEMES } from '@/constants/theme';
import { usePro } from '@/context/pro-context';
import { useThemeMode } from '@/context/theme-mode-context';

export function useTheme() {
  const { mode } = useThemeMode();
  const { isPro, ready } = usePro();
  // A Pro theme picked during the trial falls back to the default once the trial ends.
  return Colors[PRO_THEMES.includes(mode) && ready && !isPro ? 'dark' : mode];
}
