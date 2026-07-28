import * as Haptics from "expo-haptics";
import { useSettingsStore } from "../stores/settingsStore";

function hapticsEnabled() {
  return useSettingsStore.getState().hapticsEnabled;
}

export function lightHaptic() {
  if (!hapticsEnabled()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function mediumHaptic() {
  if (!hapticsEnabled()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function heavyHaptic() {
  if (!hapticsEnabled()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

export function successHaptic() {
  if (!hapticsEnabled()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function warningHaptic() {
  if (!hapticsEnabled()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

export function errorHaptic() {
  if (!hapticsEnabled()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}

export function selectionHaptic() {
  if (!hapticsEnabled()) return;
  Haptics.selectionAsync();
}
