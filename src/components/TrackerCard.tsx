import { useState } from "react";
import { Pressable, Text, View, StyleSheet, Dimensions } from "react-native";
import { Tracker } from "../db/trackers";
import { colors, typography, radius } from "../constants/theme";
import { titleCase } from "../utils/text";
import { BadgeIcon } from "./BadgeIcon";

const CARD_W = Math.round(Dimensions.get("window").width / 3);
const CARD_H = 110;
const PAD = 10;
const CONTENT_W = CARD_W - PAD * 2;

// Badge height matches one line of the name text (16px / lineHeight 20)
const BADGE = 20;
const BADGE_RADIUS = 4;
const BADGE_GAP = 4;

// Width of text on the first line (beside the badge)
const TEXT_W = CONTENT_W - BADGE - BADGE_GAP;

// Fixed height for the title area — 2 lines at lineHeight 20
const TITLE_H = 20 * 2; // 40px

function formatElapsed(ms: number): string {
  if (ms < 3600000) return `${Math.max(1, Math.floor(ms / 60000))}m`;
  if (ms < 86400000) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(ms / 86400000);
  return `${d} ${d === 1 ? "day" : "days"}`;
}

type Props = { tracker: Tracker; onPress: () => void };

export function TrackerCard({ tracker, onPress }: Props) {
  const elapsed = formatElapsed(tracker.elapsedMs);
  const since = tracker.startedAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // null = not yet measured. We fire an invisible render at TEXT_W to learn
  // where the name breaks, then split: line 1 sits beside the badge, line 2+
  // start flush-left (under the badge) at the full content width.
  const [lines, setLines] = useState<string[] | null>(null);

  const displayName = titleCase(tracker.name);
  const line1 = lines ? lines[0] ?? "" : displayName;
  const line2 = lines && lines.length > 1 ? lines[1] ?? "" : "";

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {/* Invisible measurement text — fires onTextLayout, no layout impact */}
      {lines === null && (
        <Text
          style={styles.measure}
          numberOfLines={2}
          onTextLayout={(e) =>
            setLines(e.nativeEvent.lines.map((l) => l.text.trimEnd()))
          }
        >
          {displayName}
        </Text>
      )}

      {/* Title block: fixed height so date/elapsed don't shift */}
      <View style={styles.titleBlock}>
        {/* Row 1: badge + first line, vertically centered with each other */}
        <View style={styles.row}>
          <View style={styles.badge}>
            <BadgeIcon value={tracker.emoji ?? "★"} size={BADGE} color={colors.white} />
          </View>
          <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
            {line1}
          </Text>
        </View>

        {/* Row 2: second line at full content width, starting under the badge */}
        {line2 ? (
          <Text style={styles.name} numberOfLines={1}>
            {line2}
          </Text>
        ) : null}
      </View>

      <Text style={styles.since} numberOfLines={1}>
        {since}
      </Text>
      <Text style={styles.elapsed} numberOfLines={1}>
        {elapsed}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: PAD,
  },

  measure: {
    fontSize: 16,
    fontWeight: "700" as const,
    lineHeight: 20,
    position: "absolute",
    width: TEXT_W,
    opacity: 0,
    includeFontPadding: false,
  },

  titleBlock: {
    minHeight: TITLE_H,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: BADGE_GAP,
  },

  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE_RADIUS,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },


  name: {
    fontSize: 16,
    fontWeight: "700" as const,
    lineHeight: 20,
    color: colors.green,
    includeFontPadding: false,
  },

  since: {
    ...typography.bodyXS,
    color: colors.textMuted,
    marginTop: 3,
    includeFontPadding: false,
  },

  elapsed: {
    ...typography.h2,
    color: colors.neutralDarkDarkest,
    marginTop: "auto",
    includeFontPadding: false,
  },
});
