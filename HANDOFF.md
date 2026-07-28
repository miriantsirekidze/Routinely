# Routinely — Session Handoff

## App Overview

**Routinely** is a personal Android-only self-improvement app built with Expo SDK 56 and React Native. It is built entirely for personal use — no multi-user concerns, no analytics, no backend. Runs natively via `expo run:android` (not Expo Go). New Architecture (Fabric) is enabled.

The app covers five main domains:

1. **Activity tracking** — timed sessions with sub-activities (stopwatch), templates, weekly schedule, history, trends
2. **Habit trackers** — abstinence/streak counters, LLM-generated milestone notes at day thresholds, relapse note + LLM encouragement on reset
3. **Calendar / events** — plan one-off or multi-day events with per-day notes, LLM-generated contextual tips per event
4. **Journal** — folder-based system with three folder types: Notes (freeform text), Custom (user-defined tracking fields), Canvas (2D spatial board — see Canvas section below)
5. **Settings** — sound/haptics toggles, notification preferences, CSV/JSON export, DB backup/restore, schedule import/export

---

## Tech Stack

| Layer | Library |
|---|---|
| Framework | React Native 0.85 + Expo SDK 56 |
| Navigation | expo-router (file-based, Stack + Tabs) |
| Language | TypeScript |
| Database | expo-sqlite + Drizzle ORM (SQLite on-device) |
| State | Zustand 5 (timerStore + settingsStore) |
| Animations | react-native-reanimated 4 |
| Gestures | react-native-gesture-handler 2 |
| Charts | react-native-gifted-charts |
| SVG | react-native-svg |
| GPU Canvas | @shopify/react-native-skia 2.6.2 |
| Icons | @expo/vector-icons (FontAwesome5, Feather, MaterialCommunityIcons) |
| Audio | expo-audio |
| Image pick | expo-image-picker |
| Image render | expo-image (animated WebP/GIF support via Glide) |
| Video | expo-video |
| LLM | react-native-executorch (Qwen 2.5 1.5B quantized, on-device) |
| Bottom sheets | @gorhom/bottom-sheet v5 |
| Notifications | expo-notifications |
| File I/O | expo-file-system |
| Canvas drag | react-native-draggable-flatlist |
| Web | expo-web-browser |

**Key conventions:**
- No `Alert.alert` anywhere — use inline confirmation UI or `DeleteConfirmSheet`
- All dates use `localDateStr()` from `src/utils/date.ts` (never `.toISOString()` which gives UTC)
- Title case applied at display time via `titleCase()` from `src/utils/text.ts`
- npm installs require `--legacy-peer-deps`
- Migrations are hand-written SQL in `src/db/migrate.ts` (not drizzle-kit at runtime)

---

## Design System

Defined in `src/constants/theme.ts`.

- **Primary**: `#006FFD` (blue)
- **Green accent** (trackers, events, journal): `#15803D` / `#14532D` / `#DCFCE7`
- **Surface**: `#F8F9FE`, **Background**: `#FFFFFF`
- **Canvas background**: `#F8FAFF`
- **Typography**: h1–h5, bodyXL–bodyXS, actionL/M/S, captionM
- **Spacing**: xs=4, sm=8, md=16, lg=24, xl=32, xxl=48
- **Radius**: sm=8, md=12, lg=16, xl=24, full=9999
- Light theme only, portrait only, Android only

---

## Folder Structure

```
routinely/
├── app/
│   ├── _layout.tsx              Root layout: DB migrations, executorch init,
│   │                            GestureHandlerRootView, BottomSheetModalProvider
│   ├── (tabs)/
│   │   ├── _layout.tsx          Tab bar (5 tabs)
│   │   ├── index.tsx            Today screen
│   │   ├── history.tsx          Session history
│   │   ├── journal.tsx          Journal folder list
│   │   ├── schedule.tsx         Plan tab
│   │   └── settings.tsx         App settings
│   ├── journal/
│   │   ├── canvas-editor.tsx    ← CANVAS BOARD (see detailed section below)
│   │   ├── canvas.tsx           Canvas folder → list of canvas files
│   │   ├── new-canvas-file.tsx  Create a canvas file
│   │   └── (other journal screens)
│   └── (other screens)
│
├── src/
│   ├── db/
│   │   ├── canvas.ts            Canvas file + node + connection CRUD
│   │   ├── canvas-components.ts Canvas card supplemental data (todos, media, link, place)
│   │   ├── migrate.ts           Hand-written migration runner (0000–0014)
│   │   └── schema.ts            All Drizzle table definitions
│   └── (other db, utils, components, etc.)
```

---

## Database — Current Tables (migrations 0000–0014)

| Table | Purpose |
|---|---|
| `days` | One row per calendar date |
| `sessions` | Activity sessions |
| `sub_activities` | Sub-activities within a session |
| `pauses` | Pause records |
| `session_templates` | Reusable templates |
| `sub_activity_templates` | Sub-activities within a template |
| `weekly_schedule` | Templates assigned to days of week |
| `tags` / `template_tags` | Tags |
| `streaks` | Streak tracking |
| `trackers` | Habit/abstinence trackers |
| `tracker_resets` | Reset history |
| `calendar_events` | One-off/multi-day events |
| `event_day_notes` | Per-day plans within an event |
| `journal_folders` | Journal folders (notes/custom/canvas) |
| `journal_variables` | Field schema for custom folders |
| `journal_entries` | Entries within a folder |
| `journal_field_values` | Field values per entry |
| `canvas_files` | Canvas documents within a canvas folder |
| `canvas_nodes` | Cards on the canvas (position, size, type, aspectRatio) |
| `canvas_todo_items` | Todo items within a todo card |
| `canvas_media` | Media URIs for image/gif/video/place cards |
| `canvas_link_meta` | OG metadata for link cards |
| `canvas_place_meta` | Location metadata for place cards |
| `canvas_connections` | Arrow connections between nodes (fromNodeId, toNodeId) |

**Next migration number: 0015**

---

## LLM Integration

Library: `react-native-executorch` with `react-native-executorch-expo-resource-fetcher`.
Model: `QWEN2_5_1_5B_QUANTIZED` (~880MB, downloads once and caches).
Initialized in `app/_layout.tsx`.

Active LLM features: tracker milestones, relapse notes, event tips, folder description.
All prompts in `src/llm/config.ts`.

---

# Canvas Board — Detailed Documentation

## Overview

The canvas board is a 2D spatial infinite canvas where users can place 8 types of cards, connect them with arrows, pan/zoom, and organize visual content. Located at `app/journal/canvas-editor.tsx` (~2700 lines).

## Architecture Layers (render order, bottom to top)

```
1. DotGridBackground      ← Skia Canvas, screen-space, SkSL shader (infinite dots)
2. ConnectionsSkiaLayer   ← Skia Canvas, screen-space, draws bezier arrows + X circles
3. Gesture layer          ← GestureDetector(Race(connectTap, canvasGesture))
4. Canvas Animated.View   ← Transformed by translateX/Y/scale; contains:
   └── Cards (CanvasCard × N)
5. Loading Modal          ← React Native Modal, covers everything during load
6. Fixed UI overlay       ← Header, FABs (SafeAreaView absoluteFill)
7. Drawer                 ← Slides in from right
8. Edit sheet             ← BottomSheetModal
```

## Canvas Transform

The canvas uses three Reanimated shared values:

```ts
const translateX = useSharedValue(SW / 2);  // initial: screen center
const translateY = useSharedValue(SH / 2);
const scale = useSharedValue(1);
// MIN_SCALE = 0.2, MAX_SCALE = 1
```

Transform applied to the canvas `Animated.View`:
```ts
canvasStyle = { transform: [{ translateX }, { translateY }, { scale }] }
```

**Canvas → screen coordinate formula:**
```
screenX = (canvasX - SW/2) * scale + SW/2 + translateX
```

**Screen → canvas (used in fitNodesToView, connectTap gesture):**
```
canvasX = (screenX - SW/2 - translateX) / scale + SW/2
```

The canvas uses `savedTx`, `savedTy`, `savedScale` shared values to record the position after each gesture ends (used to resume drag from correct position).

## Dot Grid Background

**Implementation**: Skia `RuntimeEffect` shader (SkSL). Screen-sized `Canvas` (SW × SH) placed OUTSIDE the canvas `Animated.View`.

**Why Skia**: react-native-svg crashes on Android when any SVG has a `Rect + Pattern` fill larger than the device's texture limit (≈400MB+). Even a 2000×2000 SVG with a pattern fill approaches this on 3× DPI devices. The Skia shader runs entirely on the GPU, has zero memory cost, and is truly infinite.

**How it works**: The shader receives `resolution`, `translate`, `zoom` as uniforms (updated via Reanimated `useDerivedValue`). Each pixel computes its canvas-space coordinate, finds the nearest grid point (mod 32), draws a dot if close enough.

```glsl
// Key shader logic
float lx = (pos.x - resolution.x * 0.5 - translate.x) / zoom + resolution.x * 0.5;
float ly = (pos.y - resolution.y * 0.5 - translate.y) / zoom + resolution.y * 0.5;
float2 cell = mod(float2(lx, ly), float2(32.0)) - float2(16.0);
float dist = length(cell);
// draw blue dot if dist < 1.5, antialiased
```

**Fallback**: If `Skia.RuntimeEffect.Make()` returns null, falls back to a screen-sized SVG (SW × SH ≈ 13MB on 3× DPI — safe).

## Connection Arrows

**Implementation**: Second Skia `Canvas` (screen-space, absoluteFill). A single `useDerivedValue` worklet (`buildConnPaths`) computes SVG path strings for all connections simultaneously.

### ConnRenderData — Atomic Shared Value

All connection rendering data lives in ONE shared value:
```ts
type ConnRenderData = {
  positions: Record<number, { x: number; y: number; w: number }>;
  connections: Array<{ id: number; fromNodeId: number; toNodeId: number }>;
  heights: Record<number, number>;
};
const connRenderData = useSharedValue<ConnRenderData>({ positions: {}, connections: [], heights: {} });
```

**Why atomic**: Previously used 4 separate shared values (`cardPositions`, `connectionsShared`, `cardHeightsShared`, `renderTick`). They sent independent JS→UI thread messages and arrived in unknown order, causing the worklet to see partial state. One value = one message = atomic consistency.

**Updated by:**
- `useEffect([nodes, connections, cardHeights])` — full rebuild
- `handleCreateConnection` — immediate add after DB write
- `handleDeleteConnection` — immediate filter after DB delete
- `CanvasCard` drag gesture `onUpdate` — real-time position update during drag:
  ```ts
  const cur = connRenderData.value;
  connRenderData.value = { ...cur, positions: { ...cur.positions, [node.id]: { x, y, w } } };
  ```

### buildConnPaths Worklet

```ts
function buildConnPaths(positions, conns, heights, s, tx, ty, showX): string {
  'worklet';
  // Returns "curvePath|||arrowPath|||xCirclesPath|||xMarksPath"
  // All in screen space (applies canvas transform internally)
}
```

For each connection:
1. Compute anchor points (right/left/top/bottom midpoints based on relative node position)
2. Convert canvas coords → screen coords
3. Build cubic bezier SVG path with 45% distance control point offset
4. Build arrowhead triangle at target anchor
5. If `showX` (connect mode): build 12px circle + X mark at midpoint

The `"|||"` separator splits the result into 4 `useDerivedValue` consumers for separate Skia `Path` components.

### Dependency Tracking Pattern

**Critical**: Reanimated only tracks a shared value as a dependency if it's read BEFORE any early return in the worklet. If `connectionsShared.length === 0` causes an early return before `connectModeShared.value` is read, Reanimated never registers `connectModeShared` as a dependency.

**Fix**: Read all dependencies before the first early return:
```ts
const allPaths = useDerivedValue(() => {
  void localTick.value;          // ← ALWAYS read (dependency forced)
  const showX = showXShared.value; // ← ALWAYS read
  const d = connRenderData.value;  // ← ALWAYS read
  if (d.connections.length === 0) return "|||";
  // ... rest of computation
});
```

**Local shared values**: `ConnectionsSkiaLayer` uses `showXShared` and `localTick` as LOCAL `useSharedValue` instances synced from the `showXButtons` React prop via `useEffect`. This avoids cross-component dependency tracking failures that occur when shared values are passed as props from a parent.

### Connect Mode & X Button Deletion

**Connect FAB**: Positioned above the + FAB. White border when inactive, primary blue when active.

**Connect flow**:
1. Tap connect FAB → `setConnectMode(true)`, `connectModeShared.value = true`
2. Tap/double-tap card A → `handleEditById` (single tap) or `handleInteractById→handleEditById` (double tap) → `setPendingSourceId(A.id)` (blue border on A)
3. Tap/double-tap card B → `handleCreateConnection(A.id, B.id)` → DB write + immediate `connRenderData` update
4. Arrow appears. Connect mode stays active for next connection.
5. Tap FAB again → exits connect mode.

**`connectTap` gesture**: Full-screen tap gesture added to canvas gesture via `Race(connectTap, canvasGesture)`. Must be defined AFTER `handleDeleteConnection` in the component body — Reanimated's Babel plugin serializes worklet closures at compile time. Forward references (declaring gesture before its callback) result in `undefined` in the worklet, causing `__remoteFunction` errors.

**X deletion**: In connect mode, Skia draws red circles at connection midpoints. The `connectTap` gesture's `onEnd` worklet checks if the tap screen position is within 12px of any midpoint (computed from `connRenderData` + current transform). Calls `runOnJS(handleDeleteConnection)(conn.id)`.

## Card Types (8 types)

### Card Gestures (all types)

| Gesture | Action |
|---|---|
| Single tap (200ms delay, waits for double-tap to fail) | Opens edit settings sheet |
| Double tap | Content interaction (type-dependent, see below) |
| Long press 300ms + move | Drag card |
| Long press 600ms still | Opens delete confirm sheet |
| Drag bottom-right resize handle | Resize card width (MIN_CARD_W=140, MAX_CARD_W=360) |

**In connect mode**: both single-tap and double-tap call `handleEditById` (connect flow) — `handleInteractById` redirects to `handleEditById` when `connectMode` is true.

**Todo checkboxes**: check `connectModeShared.value` before toggling — ignored in connect mode.

### 1. text-titled (Note)
- Stores: `node.title`, `node.description`
- Display: title centered (h4), description left-aligned
- Double tap: no action

### 2. text-quote (Quote)
- Stores: `node.description` (the quote text; title is empty)
- Display: left accent bar + italic text
- Double tap: no action

### 3. image
- Stores: `canvas_media` URIs, `node.aspectRatio` (1:1 / 3:2 / 2:3)
- Display: full-bleed paginated ScrollView, height from aspect ratio (max 300px)
- Edit: aspect ratio picker + gallery/camera picker
- Double tap: opens full-screen modal (RN `Image`)

### 4. link
- Stores: `canvas_link_meta` (url, ogTitle, ogDescription, ogImageUrl, fetchFailed)
- OG fetch: `fetchOpenGraph(url)` — 5s timeout, regex parse
- Display: OG image at top (full-bleed), title, URL subtitle (only if title present)
- Double tap: `WebBrowser.openBrowserAsync(url)`

### 5. todo
- Stores: `canvas_todo_items` (text, checked, sort_order)
- Display: checkbox rows (max 6 shown), "+N more" if overflow
- Edit: `DraggableFlatList` for reorder, `onSubmitEditing` to add items
- Double tap: no action

### 6. place
- Stores: `canvas_place_meta` (googleMapsUrl, placeTitle, plusCode), `canvas_media`
- Edit: place name + Google Maps URL (any maps.app.goo.gl link or coordinates)
- Display: full-bleed images, title, URL row with map-pin icon
- Double tap: `WebBrowser.openBrowserAsync(googleMapsUrl)`

### 7. gif
- Stores: `canvas_media` URI (URL only — no local gallery for GIFs)
- URL input: press Go key on keyboard (onSubmitEditing) — the + button doesn't work reliably inside BottomSheetScrollView due to RNGH gesture interception
- Display: `expo-image` with `autoplay` (supports animated WebP + GIF)
- Double tap: opens full-screen GIF modal using `ExpoImage`

### 8. video
- Stores: `canvas_media` URI (gallery picks via `MediaTypeOptions.Videos`)
- Display: dark thumbnail with play icon, `VideoPlayerModal` on double-tap
- VideoPlayerModal: custom controls (no native settings button), tap-anywhere-to-close
- Double tap: opens VideoPlayerModal

## CanvasCard Component

```
GestureDetector(Race(dragGesture, longPress, doubleTap, tapGesture))
└── Animated.View (position: absolute, left: absX, top: absY, width: cardWidth)
    ├── renderContent() — type-specific content
    └── GestureDetector(resizeGesture)
        └── View (resize handle, bottom-right corner)
```

Cards measure their actual height via `onLayout` → `handleMeasureHeight` → `cardHeights` state → `cardHeightsShared` in `connRenderData`. Used for accurate connection anchor point calculation.

## Auto-fit on Load

After `loadCanvas` completes, `fitNodesToView(nodes)` computes the bounding box of all nodes and animates the canvas to show all cards:

```ts
scale = Math.min(availableW / contentW, availableH / contentH, MAX_SCALE)
translateX = -(centerCanvasX - SW/2) * scale
translateY = usableCenterY - (centerCanvasY - SH/2) * scale - SH/2
// Animated with withTiming(500ms)
```

The loading Modal covers the canvas during the 2-second load period. After `setIsLoading(false)`, a 50ms delay allows React to unmount the Modal before the fit animation starts, so the user sees the zoom-out animation cleanly.

## Layers Drawer (ComponentsDrawer)

Slides in from the right (DRAWER_W = min(58% of SW, 240)). Uses `renderToHardwareTextureAndroid` for smooth slide animation.

**Phased loading** (fixes 500ms animation delay):
- Phase 1 (instant, 0ms): header only renders
- Phase 2 (290ms): FlatList with card items (after slide animation completes)
- Phase 3 (440ms): Connections section appended as FlatList footer

`DrawerCardItem` and `DrawerMiniPreview` are wrapped in `React.memo` to prevent unnecessary re-renders.

**Mini preview**: Each card type shows a 44×44px thumbnail:
- image/place/gif: actual image via `Image`/`ExpoImage`
- video: dark box with play icon
- todo: dot-and-line checklist visualization
- link: OG image if fetched
- text/quote: horizontal line skeleton

---

## Known Issues & Solutions

### 1. SVG Bitmap OOM Crash (Android)
**Problem**: `react-native-svg` rasterizes ANY SVG (even path-only) to a bitmap. On a 3× DPI device, a 4000×4000dp SVG = 12000×12000px = 576MB → `Canvas: trying to draw too large bitmap` crash.

**Solution**: Skia shader for dot grid (zero allocation). Skia screen-space canvas for connections (SW×SH ≈ 13MB — always safe). Connection paths computed as SVG path strings in Reanimated worklets.

### 2. Reanimated Worklet Dependency Tracking
**Problem**: If a shared value is read only after an early return, Reanimated doesn't register it as a dependency. Changes to that value won't trigger worklet re-evaluation.

**Solution**: Always read ALL shared values before any early return:
```ts
void renderTick.value;   // read first, always
void connRenderData.value; // read first, always
if (d.connections.length === 0) return; // early return AFTER reads
```

### 3. Cross-Component Dependency Tracking Failure
**Problem**: Shared values created in a parent component and passed as props to a child component's `useDerivedValue` don't reliably trigger re-evaluation when changed from the parent.

**Solution**: Use local `useSharedValue` instances inside the child component, synced from React props via `useEffect`. The dependency tracking works reliably when both the source and the `useDerivedValue` are in the same component scope.

### 4. Forward References in Reanimated Worklets
**Problem**: Reanimated's Babel plugin serializes worklet closures at compile time. If a gesture worklet references a `useCallback` declared later in the component body (forward reference), the worklet captures `undefined`. Results in `TypeError: Cannot read property '__remoteFunction' of undefined`.

**Solution**: Always define gesture handlers AFTER the callbacks they reference. Maintain this ordering: state declarations → callbacks → gesture handlers → render.

### 5. Reading `.value` Inside setState Updaters
**Problem**: React can call setState updater functions during the render phase. Reading/writing Reanimated shared values during render triggers `[Reanimated] Reading from value during component render` warnings.

**Solution**: Move all `.value` reads/writes OUTSIDE setState updater functions. Use functional updates for setState, read state before calling setState:
```ts
// Bad:
setConnections(prev => {
  connRenderData.value = ...; // ← triggers warning
  return prev.filter(...);
});

// Good:
const nextConns = connections.filter(...);
setConnections(nextConns);
connRenderData.value = { ...connRenderData.value, connections: nextConns }; // outside setState
```

### 6. Bottom Sheet Keyboard Blocking Inputs
**Problem**: `autoFocus` on `BottomSheetTextInput` causes the Android keyboard to appear before the bottom sheet animation completes. The sheet renders behind the keyboard on first open.

**Solution**: Remove `autoFocus` from all edit sheet inputs. Users tap to focus. The sheet opens cleanly first.

### 7. runOnJS with Async Functions
**Problem**: `runOnJS(asyncFunction)` in a gesture worklet may not work correctly. The function must be a non-async callable for Reanimated's remote function mechanism.

**Solution**: The async DB operation happens inside the function, but the function itself can be async — just ensure stable deps (no `connections` in deps array) so the reference doesn't change between renders.

### 8. Drawer Animation Lag (500ms)
**Problem**: Mounting the full FlatList with all drawer items (including images) before starting the slide animation blocked the JS thread for ~500ms.

**Solution**: Phased content loading. Mount drawer with only the header (instant), add node list 290ms later (after animation), add connections 440ms later.

### 9. Connection Arrows Not Appearing on Navigate-Back
**Problem**: The `connRenderData` shared value was populated by effects that ran asynchronously after `loadCanvas`. The Skia worklet's dependency tracking was not re-triggered because shared value changes from the JS thread don't reliably propagate before the worklet evaluates.

**Solution**: Atomic `ConnRenderData` (one message = all data at once). Plus `localTick.value += 1` inside the component's own `useEffect` to force worklet re-evaluation.

---

## Canvas Edit Sheet

`<BottomSheetModal snapPoints={["65%"]} keyboardBehavior="extend">` with `<BottomSheetScrollView>` and `<BottomSheetTextInput>` for all inputs.

Each card type has a dedicated branch in `renderEditContent()`. Always includes a "Delete card" button at the bottom that dismisses the sheet and calls `handleDeleteConnection` asynchronously.

URL inputs use `returnKeyType="go"` + `onSubmitEditing` instead of a "+" button (Pressables inside BottomSheetScrollView don't receive touch events reliably when the keyboard is open due to RNGH gesture interception).

---

## Offline Behavior

| Content | Offline |
|---|---|
| All card structure, positions, connections | ✓ Always (SQLite) |
| Text, quote, todo cards | ✓ Always |
| Gallery images/videos | ✓ Always (local file:// URIs) |
| GIF/WebP URLs | ✓ After first load (Glide disk cache) |
| Link OG images | ✓ After first load (Glide disk cache) |
| Opening Links/Maps in browser | ✗ Requires network |
| Unseen GIF/link URLs | ✗ Requires network for first load |

---

## Key Files

| File | Purpose |
|---|---|
| `app/journal/canvas-editor.tsx` | Entire canvas board (~2700 lines) |
| `src/db/canvas.ts` | CanvasNode, CanvasFile, CanvasConnection CRUD |
| `src/db/canvas-components.ts` | Todo items, media, link meta, place meta CRUD |
| `src/db/schema.ts` | All Drizzle table definitions |
| `src/db/migrate.ts` | Migration runner (0000–0014) |
| `src/constants/theme.ts` | Design system tokens |
| `src/utils/date.ts` | `localDateStr()`, date helpers |

---

## Next Migration Number: 0015
