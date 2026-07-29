import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { initExecutorch } from "react-native-executorch";
import { ExpoResourceFetcher } from "react-native-executorch-expo-resource-fetcher";
import { runMigrations } from "../src/db/migrate";
import { MilestoneWorker } from "../src/components/MilestoneWorker";
import { requestPermissions, scheduleDayReminder } from "../src/utils/notifications";
import { colors, typography, spacing } from "../src/constants/theme";

// Must be called once before any useLLM / model hooks are used
initExecutorch({ resourceFetcher: ExpoResourceFetcher });

// Suppress known upstream library deprecation warnings
if (__DEV__) {
  const _warn = console.warn;
  console.warn = (...args) => {
    if (typeof args[0] === "string" && args[0].includes("InteractionManager")) return;
    _warn.apply(console, args);
  };
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      runMigrations();
      setReady(true);
      requestPermissions();
      scheduleDayReminder();
    } catch (e: any) {
      setError(e?.message ?? "Database initialization failed");
    }
  }, []);

  if (error) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>Failed to initialize database</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <BottomSheetModalProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "ios_from_right",
        }}
      />
      <MilestoneWorker />
      </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  errorText: {
    ...typography.h3,
    color: colors.errorDark,
    textAlign: "center",
  },
  errorDetail: {
    ...typography.bodyS,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
