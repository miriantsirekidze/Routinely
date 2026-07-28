import { useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  SectionList,
  TextInput,
  Dimensions,
} from "react-native";
import { colors, typography, radius, spacing } from "../constants/theme";
import { BadgeIcon } from "./BadgeIcon";

// All icons use @expo/vector-icons via the @family/name prefix system.
// @fa5/ = FontAwesome5, @fe/ = Feather, @mci/ = MaterialCommunityIcons
// Vector icons always render monochrome and respect the color prop on Android.

type Sym = { char: string; name: string };

const CATEGORIES: { label: string; symbols: Sym[] }[] = [
  {
    label: "Habits",
    symbols: [
      // Feather — outline/thin style
      { char: "@fe/tv", name: "television tv youtube watching screen" },
      { char: "@fe/smartphone", name: "phone mobile social media screen" },
      { char: "@fe/monitor", name: "computer monitor screen desktop" },
      { char: "@fe/book-open", name: "open book reading study" },
      { char: "@fe/headphones", name: "headphones music listen audio" },
      { char: "@fe/moon", name: "moon sleep night bedtime" },
      { char: "@fe/sun", name: "sun morning wake outdoor" },
      { char: "@fe/coffee", name: "coffee caffeine morning drink" },
      { char: "@fe/music", name: "music note song" },
      { char: "@fe/edit-3", name: "writing journal notes diary pencil" },
      { char: "@fe/activity", name: "activity health heartbeat fitness" },
      { char: "@fe/eye", name: "eye screen time watching" },
      { char: "@fe/eye-off", name: "eye off no screen break" },
      { char: "@fe/heart", name: "heart health love self care" },
      { char: "@fe/zap", name: "energy bolt power productivity" },
      { char: "@fe/target", name: "target goal focus aim" },
      { char: "@fe/award", name: "award achievement streak goal" },
      { char: "@fe/trending-up", name: "trending up improve progress" },
      // FontAwesome5 — for things Feather doesn't have
      { char: "@fa5/smoking", name: "smoking cigarette tobacco" },
      { char: "@fa5/smoking-ban", name: "no smoking quit stop cigarette" },
      { char: "@fa5/gamepad", name: "gaming video game controller" },
      { char: "@fa5/running", name: "running exercise jogging cardio" },
      { char: "@fa5/dumbbell", name: "dumbbell gym weightlifting" },
      { char: "@fa5/walking", name: "walking steps daily" },
      { char: "@fa5/bicycle", name: "bicycle cycling exercise" },
      { char: "@fa5/bed", name: "bed sleep rest night" },
      { char: "@fa5/beer", name: "beer alcohol drinking" },
      { char: "@fa5/wine-glass", name: "wine alcohol drinking" },
      { char: "@fa5/pills", name: "pills medicine supplement" },
      { char: "@fa5/apple-alt", name: "apple healthy food eating" },
      { char: "@fa5/utensils", name: "utensils food eating meal" },
      { char: "@fa5/water", name: "water hydration drink" },
      { char: "@fa5/brain", name: "brain mindfulness thinking focus" },
      { char: "@fa5/guitar", name: "guitar instrument music" },
      { char: "@fa5/newspaper", name: "newspaper news reading" },
    ],
  },
  {
    label: "Nature",
    symbols: [
      { char: "@fa5/tree", name: "tree nature forest" },
      { char: "@fa5/leaf", name: "leaf nature green plant" },
      { char: "@fa5/fire", name: "fire flame hot streak" },
      { char: "@fa5/water", name: "water drop liquid hydration" },
      { char: "@fa5/mountain", name: "mountain hiking nature" },
      { char: "@fa5/cloud", name: "cloud sky overcast" },
      { char: "@fa5/cloud-rain", name: "rain cloud weather" },
      { char: "@fa5/snowflake", name: "snowflake snow cold winter" },
      { char: "@fa5/sun", name: "sun sunny bright warm" },
      { char: "@fa5/moon", name: "moon night sleep lunar" },
      { char: "@fa5/wind", name: "wind breeze air" },
      { char: "@fa5/bolt", name: "lightning bolt energy electric" },
      { char: "@fa5/seedling", name: "seedling plant growth nature" },
      { char: "@fa5/spa", name: "spa flower wellness relax" },
      { char: "@fa5/globe", name: "globe world earth" },
    ],
  },
  {
    label: "Animals",
    symbols: [
      { char: "@fa5/dog", name: "dog pet animal" },
      { char: "@fa5/cat", name: "cat pet animal" },
      { char: "@fa5/fish", name: "fish sea animal" },
      { char: "@fa5/horse", name: "horse animal" },
      { char: "@fa5/dragon", name: "dragon fantasy creature" },
      { char: "@fa5/dove", name: "dove bird peace" },
      { char: "@fa5/crow", name: "crow bird raven" },
      { char: "@fa5/frog", name: "frog amphibian animal" },
      { char: "@fa5/hippo", name: "hippo animal" },
      { char: "@fa5/otter", name: "otter animal cute" },
      { char: "@fa5/spider", name: "spider insect bug" },
      { char: "@fa5/bug", name: "bug insect nature" },
      { char: "@fa5/feather", name: "feather bird light" },
      { char: "@fa5/paw", name: "paw animal pet" },
      { char: "@fa5/kiwi-bird", name: "kiwi bird animal" },
    ],
  },
  {
    label: "Sports & Activity",
    symbols: [
      { char: "@fa5/running", name: "running exercise jogging cardio" },
      { char: "@fa5/walking", name: "walking steps daily" },
      { char: "@fa5/bicycle", name: "bicycle cycling exercise" },
      { char: "@fa5/dumbbell", name: "dumbbell gym weightlifting" },
      { char: "@fa5/hiking", name: "hiking outdoor trail" },
      { char: "@fa5/swimming-pool", name: "swimming pool water sport" },
      { char: "@fa5/skiing", name: "skiing snow winter sport" },
      { char: "@fa5/skating", name: "skating ice winter" },
      { char: "@fa5/football-ball", name: "football american sport" },
      { char: "@fa5/basketball-ball", name: "basketball sport" },
      { char: "@fa5/golf-ball", name: "golf sport" },
      { char: "@fa5/table-tennis", name: "table tennis ping pong" },
      { char: "@fa5/chess", name: "chess game strategy" },
      { char: "@fa5/dice", name: "dice game chance random" },
      { char: "@fa5/trophy", name: "trophy win award" },
      { char: "@fa5/medal", name: "medal award achievement" },
    ],
  },
  {
    label: "Food & Drink",
    symbols: [
      { char: "@fa5/coffee", name: "coffee caffeine morning drink" },
      { char: "@fa5/beer", name: "beer alcohol drinking" },
      { char: "@fa5/wine-glass", name: "wine alcohol drinking" },
      { char: "@fa5/cocktail", name: "cocktail drink alcohol" },
      { char: "@fa5/pizza-slice", name: "pizza food junk" },
      { char: "@fa5/hamburger", name: "burger fast food" },
      { char: "@fa5/apple-alt", name: "apple fruit healthy food" },
      { char: "@fa5/carrot", name: "carrot vegetable healthy" },
      { char: "@fa5/ice-cream", name: "ice cream dessert sweet" },
      { char: "@fa5/birthday-cake", name: "cake dessert birthday sweet" },
      { char: "@fa5/cookie", name: "cookie biscuit sweet snack" },
      { char: "@fa5/utensils", name: "utensils food eating meal" },
      { char: "@fa5/drumstick-bite", name: "chicken meat food" },
      { char: "@fa5/pepper-hot", name: "pepper spicy hot chili" },
    ],
  },
  {
    label: "Travel & Places",
    symbols: [
      { char: "@fa5/plane", name: "airplane flight travel" },
      { char: "@fa5/car", name: "car drive travel road" },
      { char: "@fa5/train", name: "train transport travel" },
      { char: "@fa5/ship", name: "ship boat cruise sea" },
      { char: "@fa5/motorcycle", name: "motorcycle ride" },
      { char: "@fa5/bus", name: "bus public transport" },
      { char: "@fa5/map", name: "map travel explore navigate" },
      { char: "@fa5/map-marker-alt", name: "location place marker pin" },
      { char: "@fa5/compass", name: "compass direction navigate" },
      { char: "@fa5/home", name: "home house building" },
      { char: "@fa5/hotel", name: "hotel accommodation stay" },
      { char: "@fa5/suitcase", name: "suitcase luggage travel pack" },
      { char: "@fa5/passport", name: "passport travel document" },
      { char: "@fa5/camera", name: "camera photo picture" },
      { char: "@fa5/campground", name: "campground camping tent outdoor" },
      { char: "@fa5/umbrella-beach", name: "beach vacation summer" },
    ],
  },
  {
    label: "Work & Tech",
    symbols: [
      { char: "@fa5/laptop", name: "laptop computer work screen" },
      { char: "@fa5/code", name: "code programming developer" },
      { char: "@fa5/database", name: "database server data storage" },
      { char: "@fa5/briefcase", name: "briefcase work business" },
      { char: "@fa5/chart-line", name: "chart analytics progress trend" },
      { char: "@fa5/chart-bar", name: "bar chart statistics data" },
      { char: "@fa5/dollar-sign", name: "dollar money finance" },
      { char: "@fa5/coins", name: "coins money savings wealth" },
      { char: "@fa5/calculator", name: "calculator math numbers" },
      { char: "@fa5/microscope", name: "microscope science research" },
      { char: "@fa5/flask", name: "flask science chemistry lab" },
      { char: "@fa5/atom", name: "atom science physics" },
      { char: "@fa5/graduation-cap", name: "graduation study education" },
      { char: "@fa5/pen-nib", name: "pen writing calligraphy" },
      { char: "@fa5/paperclip", name: "paperclip attach document" },
      { char: "@fa5/print", name: "print document paper" },
    ],
  },
  {
    label: "Health & Wellness",
    symbols: [
      { char: "@fa5/heart", name: "heart love health care" },
      { char: "@fa5/brain", name: "brain mind thinking mental" },
      { char: "@fa5/lungs", name: "lungs breathing respiratory" },
      { char: "@fa5/bone", name: "bone strength body" },
      { char: "@fa5/eye", name: "eye vision sight" },
      { char: "@fa5/smile", name: "smile happy mood positive" },
      { char: "@fa5/smile-beam", name: "big smile happy joy" },
      { char: "@fa5/meh", name: "neutral mood okay" },
      { char: "@fa5/frown", name: "frown sad mood" },
      { char: "@fa5/stethoscope", name: "stethoscope medical doctor health" },
      { char: "@fa5/hand-holding-heart", name: "care giving love nurture" },
      { char: "@fa5/baby", name: "baby child family" },
    ],
  },
  {
    label: "Music & Arts",
    symbols: [
      { char: "@fa5/music", name: "music note song melody" },
      { char: "@fa5/guitar", name: "guitar instrument music" },
      { char: "@fa5/drum", name: "drum percussion beat" },
      { char: "@fa5/microphone", name: "microphone sing recording" },
      { char: "@fa5/headphones", name: "headphones music listen audio" },
      { char: "@fa5/volume-up", name: "volume sound speaker loud" },
      { char: "@fa5/film", name: "film movie cinema" },
      { char: "@fa5/video", name: "video camera record" },
      { char: "@fa5/theater-masks", name: "theater drama performance" },
      { char: "@fa5/paint-brush", name: "paint brush art creative" },
      { char: "@fa5/palette", name: "palette colors art design" },
      { char: "@fa5/pencil-ruler", name: "design drawing architecture" },
      { char: "@fa5/puzzle-piece", name: "puzzle game brain" },
      { char: "@fa5/images", name: "photos gallery art" },
    ],
  },
  {
    label: "Social & People",
    symbols: [
      { char: "@fa5/user", name: "person user profile individual" },
      { char: "@fa5/users", name: "people group team community" },
      { char: "@fa5/user-friends", name: "friends social people" },
      { char: "@fa5/handshake", name: "handshake deal partnership" },
      { char: "@fa5/comments", name: "comments chat conversation talk" },
      { char: "@fa5/envelope", name: "envelope email mail letter" },
      { char: "@fa5/phone", name: "phone call contact" },
      { char: "@fa5/thumbs-up", name: "thumbs up like good" },
      { char: "@fa5/thumbs-down", name: "thumbs down dislike bad" },
      { char: "@fa5/star", name: "star favorite rating achievement" },
      { char: "@fa5/crown", name: "crown king achievement royalty" },
      { char: "@fa5/gift", name: "gift present birthday surprise" },
      { char: "@fa5/ring", name: "ring wedding love engagement" },
      { char: "@fa5/handshake", name: "agreement partnership deal" },
    ],
  },
  {
    label: "Symbols & Signs",
    symbols: [
      { char: "@fa5/infinity", name: "infinity forever loop endless" },
      { char: "@fa5/ban", name: "ban stop forbidden no" },
      { char: "@fa5/check", name: "check done complete tick" },
      { char: "@fa5/times", name: "x cross delete remove" },
      { char: "@fa5/question", name: "question unknown help" },
      { char: "@fa5/exclamation", name: "exclamation important alert" },
      { char: "@fa5/lock", name: "lock locked secure private" },
      { char: "@fa5/unlock", name: "unlock open access" },
      { char: "@fa5/key", name: "key unlock access" },
      { char: "@fa5/shield-alt", name: "shield protect security safe" },
      { char: "@fa5/flag", name: "flag goal mark milestone" },
      { char: "@fa5/tag", name: "tag label category" },
      { char: "@fa5/clock", name: "clock time hour schedule" },
      { char: "@fa5/calendar", name: "calendar date schedule plan" },
      { char: "@fa5/anchor", name: "anchor sea stability grounded" },
      { char: "@fa5/fire-alt", name: "fire flame streak hot" },
      { char: "@fa5/recycle", name: "recycle environment green loop" },
      { char: "@fa5/random", name: "random shuffle mix" },
      { char: "@fa5/sync", name: "sync refresh loop repeat" },
      { char: "@fa5/redo", name: "redo repeat restart" },
    ],
  },
];

const ALL_SYMBOLS: Sym[] = CATEGORIES.flatMap((c) => c.symbols);

const SCREEN_W = Dimensions.get("window").width;
const CELL = 36;
const GAP = 3;
const COLS = Math.floor((SCREEN_W - spacing.lg * 2) / (CELL + GAP));

type Row = Sym[];
type Section = { title: string; data: Row[] };

function chunkRows(symbols: Sym[]): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < symbols.length; i += COLS) {
    rows.push(symbols.slice(i, i + COLS));
  }
  return rows;
}

type Props = {
  selected: string | null;
  onSelect: (sym: string | null) => void;
};

export function SymbolPicker({ selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const sections: Section[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const hits = ALL_SYMBOLS.filter((s) => s.name.includes(q));
      return [{ title: "", data: chunkRows(hits) }];
    }
    return CATEGORIES.map((cat) => ({
      title: cat.label,
      data: chunkRows(cat.symbols),
    }));
  }, [query]);

  const handlePick = (sym: string) => {
    onSelect(sym === selected ? null : sym);
    setOpen(false);
    setQuery("");
  };

  const handleClose = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        {selected ? (
          <View style={styles.triggerRow}>
            <View style={styles.triggerBadge}>
              <BadgeIcon value={selected} size={36} color={colors.white} />
            </View>
            <Text style={styles.triggerMuted}>Tap to change</Text>
          </View>
        ) : (
          <Text style={styles.triggerMuted}>Tap to choose a symbol</Text>
        )}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
        statusBarTranslucent
      >
        {/* Root View is the dark overlay. A flex:1 Pressable above the sheet
            takes all remaining vertical space — tapping it closes the modal.
            The sheet sits below it. No z-order tricks needed. */}
        <View style={styles.modalRoot}>
          <Pressable style={styles.tapArea} onPress={handleClose} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Choose a symbol</Text>

            <TextInput
              style={styles.search}
              placeholder="Search…"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />

            <SectionList
              sections={sections}
              keyExtractor={(_, index) => String(index)}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) =>
                section.title ? (
                  <Text style={styles.catLabel}>{section.title}</Text>
                ) : null
              }
              renderSectionFooter={() => <View style={{ height: spacing.sm }} />}
              renderItem={({ item: row }) => (
                <View style={styles.gridRow}>
                  {row.map((sym) => {
                    const isSel = sym.char === selected;
                    return (
                      <Pressable
                        key={sym.char}
                        style={[styles.cell, isSel && styles.cellSelected]}
                        onPress={() => handlePick(sym.char)}
                      >
                        <BadgeIcon
                          value={sym.char}
                          size={CELL}
                          color={isSel ? colors.white : colors.neutralDarkDarkest}
                        />
                      </Pressable>
                    );
                  })}
                  {Array(COLS - row.length)
                    .fill(null)
                    .map((_, i) => (
                      <View key={`p${i}`} style={styles.cell} />
                    ))}
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.noResults}>No symbols found</Text>
              }
              contentContainerStyle={{ paddingBottom: spacing.xxl }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    justifyContent: "center",
  },
  triggerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  triggerBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerSymbol: { fontSize: 18, color: colors.white },
  triggerMuted: { ...typography.bodyM, color: colors.textMuted },

  modalRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  tapArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    height: Dimensions.get("window").height * 0.72,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.neutralLight,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  sheetTitle: {
    ...typography.h3,
    color: colors.neutralDarkDarkest,
    marginBottom: spacing.sm,
  },
  search: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    ...typography.bodyM,
    color: colors.neutralDarkDarkest,
    marginBottom: spacing.md,
  },
  catLabel: {
    ...typography.captionM,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  gridRow: {
    flexDirection: "row",
    gap: GAP,
    marginBottom: GAP,
    alignItems: "center",
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  cellSelected: { backgroundColor: colors.green },
  symbol: { fontSize: 22, color: colors.neutralDarkDarkest },
  symbolSelected: { color: colors.white },
  noResults: {
    ...typography.bodyM,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
});
