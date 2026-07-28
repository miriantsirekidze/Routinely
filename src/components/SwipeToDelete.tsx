import { useRef } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { colors, typography, spacing, radius } from "../constants/theme";

type Props = {
  children: React.ReactNode;
  onDelete: () => void;
};

export function SwipeToDelete({ children, onDelete }: Props) {
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = () => (
    <Pressable
      style={styles.deleteAction}
      onPress={() => {
        swipeableRef.current?.close();
        onDelete();
      }}
    >
      <Text style={styles.deleteText}>Delete</Text>
    </Pressable>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  deleteAction: {
    backgroundColor: colors.errorDark,
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },
  deleteText: {
    ...typography.actionM,
    color: colors.white,
  },
});
