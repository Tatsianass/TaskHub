import { StyleSheet, View } from 'react-native';

type IconProps = { color: string; size?: number };

// Drawn with plain views so the outline icons look the same on iOS, Android and web
// without an icon font or SVG dependency. Proportions follow a 24px grid, 2px stroke.

/** A circle with a check mark inside (Tabler "circle-check"). */
export function CheckCircleIcon({ color, size = 24 }: IconProps) {
  const scale = size / 24;
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View
        style={{
          width: 20 * scale,
          height: 20 * scale,
          borderRadius: 10 * scale,
          borderWidth: 2 * scale,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: 9 * scale,
          height: 5 * scale,
          marginTop: -1.5 * scale,
          borderLeftWidth: 2 * scale,
          borderBottomWidth: 2 * scale,
          borderColor: color,
          borderBottomLeftRadius: 1 * scale,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}

/** A plain plus sign (Tabler "plus"). */
export function PlusIcon({ color, size = 24 }: IconProps) {
  const scale = size / 24;
  const bar = { backgroundColor: color, borderRadius: scale, position: 'absolute' as const };
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View style={[bar, { width: 14 * scale, height: 2 * scale }]} />
      <View style={[bar, { width: 2 * scale, height: 14 * scale }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
