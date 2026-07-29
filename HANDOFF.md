# Routinely — Project Handoff

> Working notes for picking up development in a fresh session. Read this first,
> then open only the files relevant to your task (see **Where to work** below).

## What the app is

**Routinely** is a personal, **Android-only**, single-user self-improvement app built
with **Expo SDK 56 + React Native 0.85** (New Architecture / Fabric on). No backend,
no auth, no analytics — everything is on-device. Runs natively via `expo run:android`
(not Expo Go, because of native modules). Light theme only, portrait only.

It has five domains:

1. **Activity tracking** — timed sessions with sub-activities (stopwatch), pause/rest/rep-rest, templates, a weekly schedule, history, trends, an activity heatmap, and a streak.
2. **Habit trackers** — abstinence/streak counters with on-device LLM milestone notes at day thresholds and encouragement on relapse.
3. **Calendar / events** — one-off or multi-day events with per-day notes and LLM-generated tips.
4. **Journal** — folder-based, three folder types: **Notes** (freeform text), **Custom** (user-defined tracking fields), **Canvas** (2D spatial storyboard board).
5. **Settings** — sound/haptics, notifications, CSV/JSON export, DB backup/restore, schedule import/export.

## Tech stack

| Layer | Library |
|---|---|
| Framework | React Native 0.85 + Expo SDK 56 (New Arch) |
| Navigation | expo-router (file-based; Stack + Tabs) |
| Language | TypeScript |
| DB | expo-sqlite + Drizzle ORM (on-device SQLite) |
| State | Zustand 5 (`timerStore`, `settingsStore`) |
| Animation | react-native-reanimated 4 (+ react-native-worklets) |
| Gestures | react-native-gesture-handler 2 |
| Draggable lists | react-native-draggable-flatlist |
| Charts | react-native-gifted-charts |
| SVG / GPU | react-native-svg, @shopify/react-native-skia |
| Icons | @expo/vector-icons (Feather, FontAwesome5, MaterialCommunityIcons) |
| Audio | expo-audio |
| Files | expo-file-system, expo-document-picker |
| Media pick | expo-image-picker, expo-image, expo-video |
| WebView / YouTube | react-native-webview, react-native-youtube-iframe |
| Bottom sheets | @gorhom/bottom-sheet v5 |
| Notifications | expo-notifications |
| LLM | react-native-executorch (Qwen 2.5 1.5B quantized, on-device, ~880MB) |

## Project conventions (IMPORTANT — follow these)

- **No `Alert.alert` anywhere.** Use inline confirmation UI or `DeleteConfirmSheet`.
- **All dates via `localDateStr()`** from `src/utils/date.ts` — never `.toISOString()` (that's UTC).
- **Title case at display time** via `titleCase()` from `src/utils/text.ts`.
- **npm installs need `--legacy-peer-deps`.** For Expo modules: `npm_config_legacy_peer_deps=true npx expo install <pkg>`.
- **Migrations are hand-written SQL** in `src/db/migrate.ts` (an ordered array, each guarded by a unique `id`; runs on app launch). Not drizzle-kit at runtime. **Next migration id: `0018`.** Adding a native module requires a rebuild (`expo run:android`); a pure JS change or a new migration only needs a reload.
- **Read the versioned Expo docs** (`https://docs.expo.dev/versions/v56.0.0/`) before using any Expo API — SDK 56 changed several (e.g., `expo-file-system` legacy API, `ImagePicker.MediaTypeOptions` is deprecated → use `['images']`/`['videos']`).
- **TypeScript baseline is now 0 errors** (`npx tsc --noEmit` is clean). The formerly ~17 non-blocking errors were fixed: reanimated `SharedValue` now imported as a type, `expo-file-system` `cacheDirectory` via the `/legacy` entrypoint, `absoluteFillObject`/BottomSheetModal ref typing, and `new-folder.tsx`. The two runtime-sensitive forward-references in `canvas-editor.tsx` (`connections`, `handleEditById` used in dep arrays before declaration) are intentional and kept via documented `@ts-expect-error` — **do not reorder those declarations.** It still builds via Metro/Babel, not `tsc`. **After a change, confirm the count is still 0.**

## Database

SQLite via Drizzle. Tables (migrations 0000–0017):

`days`, `sessions`, `sub_activities`, `pauses`, `session_templates`,
`sub_activity_templates`, `weekly_schedule`, `tags`, `template_tags`, `streaks`,
`trackers`, `tracker_resets`, `calendar_events`, `event_day_notes`,
`journal_folders`, `journal_variables`, `journal_entries`, `journal_field_values`,
`canvas_files`, `canvas_nodes`, `canvas_todo_items`, `canvas_media`,
`canvas_link_meta`, `canvas_place_meta`, `canvas_connections`, `canvas_audio_meta`.

- Schema: `src/db/schema.ts`. Migration runner + SQL: `src/db/migrate.ts`.
- DB helpers per domain live in `src/db/*.ts` (e.g. `journal.ts`, `events.ts`, `trackers.ts`, `templates.ts`, `history.ts`, `trends.ts`, `heatmap.ts`, `canvas.ts`, `canvas-components.ts`).

## Folder map

```
app/
├── _layout.tsx              Root: DB migrations, executorch init, providers
├── (tabs)/
│   ├── index.tsx            Today screen  ← has visual bugs to fix
│   ├── history.tsx          Session history
│   ├── journal.tsx          Journal folder list
│   ├── schedule.tsx         Plan tab
│   ├── templates.tsx        Templates
│   └── settings.tsx         Settings
├── journal/
│   ├── folder.tsx / new-folder.tsx / folder-settings.tsx
│   ├── entry.tsx / new-entry.tsx           ← Notes editor lives here (rich text TODO)
│   ├── canvas.tsx / new-canvas-file.tsx
│   └── canvas-editor.tsx                    ← Canvas Studio (3.7k lines; frozen)
├── session/ (new, active, summary)   events/ (…)   trackers/ (…)   templates/edit.tsx
src/
├── db/  stores/  components/  hooks/  utils/  constants/theme.ts  llm/config.ts
```

## Where to work next (priorities)

These are the areas the owner wants addressed. **Canvas Studio is feature-complete and
should be left alone unless explicitly asked.**

### 1. Notes — add rich text
- The **Notes** journal folder type stores freeform text entries.
- Relevant files: `app/journal/entry.tsx`, `app/journal/new-entry.tsx`, `app/journal/folder.tsx`, `src/db/journal.ts`, schema tables `journal_entries` / `journal_field_values`.
- Goal: rich-text editing (bold/italic/lists/etc.). Investigate a RN rich-text approach compatible with SDK 56 / New Arch (there's no rich-text dep installed yet — evaluate options before adding one; a native module means a rebuild).

### 2. Today screen — visual bugs
- File: `app/(tabs)/index.tsx` (~520 lines). Sections: heatmap + streak, trackers row, upcoming events, "Up Next" suggestions, quick-start templates, scheduled list, footer actions.
- Get a specific repro from the owner; fix layout/spacing/state issues.

### 3. General performance
- Likely candidates: large screens re-rendering, list virtualization, image loading, the on-device LLM init cost, and `canvas-editor.tsx` size (see Dev notes).

## Canvas Studio — condensed reference (frozen; don't edit unless asked)

Everything lives in **one file**: `app/journal/canvas-editor.tsx` (~3,669 lines).
DB: `canvas.ts` (files/nodes/connections) + `canvas-components.ts` (todos/media/link/place/audio meta).

Feature summary:
- **9 card types**: text-titled, text-quote, image, link, todo, place, gif, video, **audio**.
- **Audio**: one canvas-level player, one track at a time. Local files (expo-document-picker) via expo-audio; **YouTube** via a hidden off-screen `react-native-youtube-iframe` (oEmbed for title/thumb). Now-playing bar (play/pause, ±10s). Foreground-only.
- **Connections**: directional arrows drawn by a Skia worklet; connect-mode FAB; tap the red X midpoints to sever.
- **Collapse**: every card has an eye chip (bottom-right) that hides its whole downstream branch (arrow direction = pick order; "any parent" hides). Hidden cards stay mounted at `opacity 0`. Collapse-all/expand-all FAB.
- **Frames + numbering**: a "frame" = a root card (no incoming arrow). Frames are numbered **1..N by left-to-right canvas position** (blue badge top-left, styled like the eye). The menu ("Frames") is a read-only ordered list.
- **Organize FAB**: lays frames into an evenly-spaced, center-aligned horizontal row in their left-to-right order, carrying each frame's subtree along, then fits the camera.
- **Lock (viewer) mode FAB**: disables all card gestures + the +/connect/collapse/organize FABs; only pan/zoom (and the audio bar) work.
- **Gestures**: single tap = interact, double tap = edit sheet, long-press+drag = move card, long-press-still = delete; resize handle top-right (proportional — media height bound to the live card width). Pan/zoom works over cards: the canvas pan+pinch gesture is an **ancestor** of the cards; card long-press-drag and resize `blocksExternalGesture(panRef)`.

### Canvas gotchas (if you ever must touch it)
- **Reanimated worklets serialize closures at compile time** — a gesture worklet must be defined *after* any callback it references (`connectTap` after `handleDeleteConnection`), or the ref is `undefined` at runtime.
- **Effect dep forward-references**: an effect placed above the `useState` it depends on reads `undefined` in its dep array and only runs once — keep sync effects (e.g. `connectModeShared`) below their state.
- **All connection render data is one atomic `connRenderData` SharedValue** (positions/connections/heights) — one JS→UI message, no races.
- **Skia connection layer + gesture receiver wrap the cards**; card interaction gestures are descendants that block the ancestor pan when active.

## Dev notes / working efficiently

- **Start a fresh Claude session per task.** Context and speed degrade as a session grows; `canvas-editor.tsx` alone is ~40–50k tokens to read. Fresh session = fast + full budget. This HANDOFF is the on-ramp.
- `node_modules/` is git-ignored and excluded from search — not a context concern. No `.claudeignore` needed.
- If canvas ever needs edits, consider **splitting `canvas-editor.tsx`** into modules (content components / gestures / drawer / db) so reads are cheap.
- Rebuild (`expo run:android`) only when a **native module** is added; JS changes and new SQL migrations just need a reload/restart.
- Verify changes keep the TS baseline at 0 errors with `npx tsc --noEmit`.
