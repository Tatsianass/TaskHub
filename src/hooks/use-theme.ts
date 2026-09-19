import { Colors } from '@/constants/theme';
import { useThemeMode } from '@/context/theme-mode-context';

export function useTheme() {
  const { mode } = useThemeMode();
  return Colors[mode];
}
