import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  tintColor?: string;
  children?: React.ReactNode;
};

// The colorful backdrop is already blurred once by <AuroraBackground>, so a
// "glass" panel just needs a translucent tint + border sitting on top of it —
// no extra per-panel BlurView (that would just re-blur an already-blurred
// background and cost more on lower-end Android devices for no visible gain).
export function GlassPanel({ style, contentStyle, tintColor, children }: Props) {
  const theme = useTheme();

  return (
    <View style={[styles.outer, { borderColor: theme.glassBorder, backgroundColor: tintColor ?? theme.glassBg }, style]}>
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
