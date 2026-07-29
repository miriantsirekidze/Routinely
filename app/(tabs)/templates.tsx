import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ToastAndroid,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  getAllTemplates,
  deleteTemplate,
  TemplateWithSubs,
} from "../../src/db/templates";
import { useCachedQuery } from "../../src/db/queryCache";
import { ActionButton } from "../../src/components/ActionButton";
import { TagChip } from "../../src/components/TagChip";
import { formatDuration } from "../../src/utils/time";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

export default function TemplatesScreen() {
  const router = useRouter();
  const { data: templates = [], refresh } = useCachedQuery<TemplateWithSubs[]>(
    "templates:all",
    getAllTemplates
  );

  const handleDelete = async (t: TemplateWithSubs) => {
    await deleteTemplate(t.id);
    refresh();
    ToastAndroid.show(`"${t.name}" deleted`, ToastAndroid.SHORT);
  };

  const renderItem = ({
    item,
    index,
  }: {
    item: TemplateWithSubs;
    index: number;
  }) => (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(300)}>
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/templates/edit?id=${item.id}`)}
        onLongPress={() => handleDelete(item)}
      >
        <View style={styles.cardRow}>
          <View style={styles.cardIcon}>
            <Text style={styles.cardIconText}>
              {item.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.cardSubs} numberOfLines={1}>
              {item.subActivities.map((s) => s.name).join(" → ")}
            </Text>
          </View>
          {item.expectedDuration != null && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>
                {formatDuration(item.expectedDuration)}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.cardFooter}>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {item.subActivities.length}
            </Text>
          </View>
          <Text style={styles.cardCount}>
            activit{item.subActivities.length === 1 ? "y" : "ies"}
          </Text>
        </View>
        {item.tags.length > 0 && (
          <View style={styles.tagRow}>
            {item.tags.map((tag) => (
              <TagChip key={tag.id} tag={tag} small />
            ))}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Templates</Text>
      </View>

      {templates.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>+</Text>
          </View>
          <Text style={styles.emptyText}>No templates yet</Text>
          <Text style={styles.emptySubtext}>
            Create session templates to reuse
          </Text>
        </View>
      ) : (
        <FlatList
          data={templates}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.footer}>
        <ActionButton
          label="New Template"
          onPress={() => router.push("/templates/edit")}
          variant="primary"
          style={styles.fullButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  title: {
    ...typography.h1,
    color: colors.neutralDarkDarkest,
  },
  list: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLightest,
    alignItems: "center",
    justifyContent: "center",
  },
  cardIconText: {
    ...typography.h2,
    color: colors.primary,
  },
  cardContent: {
    flex: 1,
  },
  cardName: {
    ...typography.h4,
    color: colors.neutralDarkDarkest,
  },
  cardSubs: {
    ...typography.bodyS,
    color: colors.textSecondary,
    marginTop: 2,
  },
  durationBadge: {
    backgroundColor: colors.neutralLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  durationText: {
    ...typography.actionS,
    color: colors.neutralDarkMedium,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingLeft: 56,
  },
  countBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.neutralLight,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    ...typography.bodyXS,
    color: colors.neutralDarkMedium,
    fontWeight: "700",
  },
  cardCount: {
    ...typography.bodyXS,
    color: colors.textMuted,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingLeft: 56,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyIconText: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.neutralLightDark,
  },
  emptyText: {
    ...typography.h3,
    color: colors.neutralDarkLight,
  },
  emptySubtext: {
    ...typography.bodyM,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  fullButton: {
    width: "100%",
  },
});
