import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useSheetGestures } from "@/context/sheet-gestures-context";

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Header content; dragging it down closes the sheet when gestures are enabled. */
  header: ReactNode;
  maxHeight?: `${number}%`;
};

const CLOSE_DISTANCE = 90;
const CLOSE_VELOCITY = 0.8;

/**
 * Bottom sheet. With the "sheet gestures" setting on it also closes by tapping the dimmed area
 * or dragging the header down; with it off, only the controls inside `header` can close it.
 */
export function BottomSheetModal({
  visible,
  onClose,
  children,
  header,
  maxHeight,
}: Props) {
  const { sheetGestures } = useSheetGestures();
  const [translateY] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          sheetGestures && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => translateY.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY) {
            onClose();
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () =>
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start(),
      }),
    [sheetGestures, translateY, onClose],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {sheetGestures && (
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        )}
        <Animated.View
          style={[
            maxHeight ? { maxHeight } : null,
            { transform: [{ translateY }] },
          ]}
        >
          <ThemedView style={styles.sheet}>
            <View {...panResponder.panHandlers}>{header}</View>
            {children}
          </ThemedView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(20,22,28,0.25)",
  },
  sheet: {
    flexShrink: 1,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
  },
});
