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

/** A microphone: capsule, pickup arc and stand (Tabler "microphone"). */
export function MicIcon({ color, size = 24 }: IconProps) {
  const scale = size / 24;
  const stroke = 2 * scale;
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View
        style={{
          position: 'absolute',
          top: 2 * scale,
          width: 8 * scale,
          height: 13 * scale,
          borderRadius: 4 * scale,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 9 * scale,
          width: 14 * scale,
          height: 8 * scale,
          borderBottomLeftRadius: 7 * scale,
          borderBottomRightRadius: 7 * scale,
          borderWidth: stroke,
          borderTopWidth: 0,
          borderColor: color,
        }}
      />
      <View style={{ position: 'absolute', top: 17 * scale, width: stroke, height: 4 * scale, backgroundColor: color }} />
    </View>
  );
}

/** An outline trash can: lid with handle and a tapered bin (Tabler "trash"). */
export function TrashIcon({ color, size = 24 }: IconProps) {
  const scale = size / 24;
  const stroke = 2 * scale;
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View style={{ position: 'absolute', top: 3 * scale, width: 6 * scale, height: 3 * scale, borderTopLeftRadius: 2 * scale, borderTopRightRadius: 2 * scale, borderWidth: stroke, borderBottomWidth: 0, borderColor: color }} />
      <View style={{ position: 'absolute', top: 5 * scale, width: 18 * scale, height: stroke, borderRadius: scale, backgroundColor: color }} />
      <View style={{ position: 'absolute', top: 7 * scale, width: 14 * scale, height: 14 * scale, borderBottomLeftRadius: 3 * scale, borderBottomRightRadius: 3 * scale, borderWidth: stroke, borderTopWidth: 0, borderColor: color }} />
      <View style={{ position: 'absolute', top: 11 * scale, left: 9.5 * scale, width: stroke, height: 6 * scale, borderRadius: scale, backgroundColor: color }} />
      <View style={{ position: 'absolute', top: 11 * scale, right: 9.5 * scale, width: stroke, height: 6 * scale, borderRadius: scale, backgroundColor: color }} />
    </View>
  );
}

/** A U-turn arrow pointing back-left (Tabler "arrow-back-up"). */
export function RestoreIcon({ color, size = 24 }: IconProps) {
  const scale = size / 24;
  const stroke = 2 * scale;
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View style={{ position: 'absolute', left: 6 * scale, top: 7 * scale, width: 12 * scale, height: 10 * scale, borderTopRightRadius: 5 * scale, borderBottomRightRadius: 5 * scale, borderWidth: stroke, borderLeftWidth: 0, borderColor: color }} />
      <View style={{ position: 'absolute', left: 3.5 * scale, top: 4.5 * scale, width: 7 * scale, height: 7 * scale, borderLeftWidth: stroke, borderTopWidth: stroke, borderColor: color, transform: [{ rotate: '-45deg' }] }} />
    </View>
  );
}


const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
