import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { colors, typography, spacing, radius } from "../constants/theme";

export type DeleteConfirmSheetRef = {
  present: (label: string) => void;
  dismiss: () => void;
};

type Props = {
  onConfirm: () => void;
};

export const DeleteConfirmSheet = forwardRef<DeleteConfirmSheetRef, Props>(
  ({ onConfirm }, ref) => {
    const sheetRef = useRef<BottomSheetModal>(null);
    const [label, setLabel] = useState("");

    useImperativeHandle(ref, () => ({
      present: (l: string) => {
        setLabel(l);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const handleConfirm = () => {
      sheetRef.current?.dismiss();
      onConfirm();
    };

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={["30%"]}
        backgroundStyle={styles.bg}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetView style={styles.container}>
          <Text style={styles.title}>Delete this?</Text>
          {!!label && <Text style={styles.label} numberOfLines={1}>{label}</Text>}

          <View style={styles.buttons}>
            <Pressable style={styles.cancelBtn} onPress={() => sheetRef.current?.dismiss()}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.deleteBtn} onPress={handleConfirm}>
              <Text style={styles.deleteText}>Yes, delete</Text>
            </Pressable>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

const styles = StyleSheet.create({
  bg: { backgroundColor: colors.background, borderRadius: radius.xl },
  handle: { backgroundColor: colors.neutralLight },
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  title: { ...typography.h3, color: colors.neutralDarkDarkest, textAlign: "center" },
  label: { ...typography.bodyM, color: colors.textMuted, textAlign: "center" },
  buttons: { flexDirection: "row", gap: spacing.md },
  cancelBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelText: { ...typography.actionM, color: colors.neutralDarkDarkest },
  deleteBtn: {
    flex: 1,
    backgroundColor: colors.errorLight,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
  },
  deleteText: { ...typography.actionM, color: colors.errorDark },
});
