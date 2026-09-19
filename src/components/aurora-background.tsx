import { BlurView } from 'expo-blur';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useThemeMode } from '@/context/theme-mode-context';

type Blob = { left: number; top: number; size: number; color: string; opacity: number };

const BLOB_LAYOUT: Omit<Blob, 'color'>[] = [
  { left: -80, top: -60, size: 340, opacity: 0.55 },
  { left: 240, top: 120, size: 300, opacity: 0.42 },
  { left: -60, top: 500, size: 320, opacity: 0.38 },
  { left: 200, top: 720, size: 260, opacity: 0.45 },
];

type Props = {
  style?: ViewStyle;
  children?: React.ReactNode;
};

export function AuroraBackground({ style, children }: Props) {
  const theme = useTheme();
  const { mode } = useThemeMode();

  const blobs: Blob[] = BLOB_LAYOUT.map((layout, index) => ({
    ...layout,
    color: theme.blobs[index % theme.blobs.length],
  }));

  return (
    <View style={[styles.container, { backgroundColor: theme.background }, style]}>
      {blobs.map((blob, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            left: blob.left,
            top: blob.top,
            width: blob.size,
            height: blob.size,
            borderRadius: blob.size / 2,
            backgroundColor: blob.color,
            opacity: blob.opacity,
          }}
        />
      ))}
      <BlurView intensity={90} tint={mode} style={StyleSheet.absoluteFill} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
  },
});
