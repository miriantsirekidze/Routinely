import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const sessionTemplates = sqliteTable("session_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  expectedDuration: integer("expected_duration"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const subActivityTemplates = sqliteTable("sub_activity_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  templateId: integer("template_id")
    .notNull()
    .references(() => sessionTemplates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  expectedDuration: integer("expected_duration"),
  restDuration: integer("rest_duration").default(30),
});

export const weeklySchedule = sqliteTable("weekly_schedule", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dayOfWeek: integer("day_of_week").notNull(),
  templateId: integer("template_id")
    .notNull()
    .references(() => sessionTemplates.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull(),
});

export const days = sqliteTable("days", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  exported: integer("exported", { mode: "boolean" }).default(false),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dayId: integer("day_id")
    .notNull()
    .references(() => days.id, { onDelete: "cascade" }),
  templateId: integer("template_id").references(() => sessionTemplates.id),
  name: text("name").notNull(),
  startedAt: integer("started_at", { mode: "timestamp" }),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  expectedDuration: integer("expected_duration"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const subActivities = sqliteTable("sub_activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  startedAt: integer("started_at", { mode: "timestamp" }),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  elapsedMs: integer("elapsed_ms").default(0),
  expectedDuration: integer("expected_duration"),
  note: text("note"),
});

export const pauses = sqliteTable("pauses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subActivityId: integer("sub_activity_id")
    .notNull()
    .references(() => subActivities.id, { onDelete: "cascade" }),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  durationMs: integer("duration_ms").default(0),
  reason: text("reason"),
});

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#006FFD"),
});

export const templateTags = sqliteTable("template_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  templateId: integer("template_id")
    .notNull()
    .references(() => sessionTemplates.id, { onDelete: "cascade" }),
  tagId: integer("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
});

export const streaks = sqliteTable("streaks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  currentStreak: integer("current_streak").default(0),
  longestStreak: integer("longest_streak").default(0),
  lastActiveDate: text("last_active_date"),
});

export const trackers = sqliteTable("trackers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  emoji: text("emoji"),
  description: text("description"),
  milestoneDay: integer("milestone_day"),
  milestoneText: text("milestone_text"),
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  targetDays: integer("target_days"),
  pausedAt: integer("paused_at", { mode: "timestamp" }),
  pausedMs: integer("paused_ms").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const trackerResets = sqliteTable("tracker_resets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trackerId: integer("tracker_id")
    .notNull()
    .references(() => trackers.id, { onDelete: "cascade" }),
  resetAt: integer("reset_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  durationMs: integer("duration_ms").notNull(),
  note: text("note"),
});

export const calendarEvents = sqliteTable("calendar_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  llmNote: text("llm_note"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  startTime: text("start_time"), // optional "HH:MM" 24h
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  // Location (destination) — OSM/Leaflet picker
  locLat: real("loc_lat"),
  locLng: real("loc_lng"),
  locName: text("loc_name"),
  osmUrl: text("osm_url"),
  // Route origin + cached route (for "leave by")
  originLat: real("origin_lat"),
  originLng: real("origin_lng"),
  originName: text("origin_name"),
  travelMode: text("travel_mode"),
  routeDistM: real("route_dist_m"),
  routeDurS: real("route_dur_s"),
  routeGeo: text("route_geo"), // cached polyline JSON [[lat,lng],...]
  // Cached open-meteo forecast (JSON)
  weatherCache: text("weather_cache"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const eventAttachments = sqliteTable("event_attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id")
    .notNull()
    .references(() => calendarEvents.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // "photo" | "link"
  uri: text("uri").notNull(), // file uri (photo) or url (link)
  title: text("title"), // link OG title / optional caption
  sortOrder: integer("sort_order").notNull().default(0),
});

export const journalFolders = sqliteTable("journal_folders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  emoji: text("emoji"),
  description: text("description"),
  folderType: text("folder_type").notNull().default("notes"), // "notes" | "custom" | "canvas"
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Defines the schema/fields for a folder
export const journalVariables = sqliteTable("journal_variables", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  folderId: integer("folder_id")
    .notNull()
    .references(() => journalFolders.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  varType: text("var_type").notNull(), // "number"|"text"|"description"|"image"|"checkbox"|"voice"
  unit: text("unit"),                  // for number (kg, lbs, $, reps…)
  required: integer("required", { mode: "boolean" }).notNull().default(false),
  allowMultiple: integer("allow_multiple", { mode: "boolean" }).notNull().default(false), // for image
  sortOrder: integer("sort_order").notNull().default(0),
});

export const journalEntries = sqliteTable("journal_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  folderId: integer("folder_id")
    .notNull()
    .references(() => journalFolders.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  entryDate: text("entry_date"),  // YYYY-MM-DD
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Stores the actual value for each variable in each entry
export const journalFieldValues = sqliteTable("journal_field_values", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entryId: integer("entry_id")
    .notNull()
    .references(() => journalEntries.id, { onDelete: "cascade" }),
  variableId: integer("variable_id")
    .notNull()
    .references(() => journalVariables.id, { onDelete: "cascade" }),
  textValue: text("text_value"),          // text, description, checkbox ("true"/"false")
  numberValue: real("number_value"),      // number
  mediaUris: text("media_uris"),          // JSON array of URIs — images (multiple) or voice (single)
});

export const canvasNodes = sqliteTable("canvas_nodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileId: integer("file_id")
    .notNull()
    .references(() => canvasFiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  x: real("x").notNull().default(0),
  y: real("y").notNull().default(0),
  width: real("width").notNull().default(220),
  cardType: text("card_type").notNull().default("text-titled"),
  aspectRatio: text("aspect_ratio").notNull().default("3:2"),
  collapsed: integer("collapsed", { mode: "boolean" }).notNull().default(false),
  seqOrder: integer("seq_order"), // frame sequence order (roots only); null = unordered
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const canvasTodoItems = sqliteTable("canvas_todo_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nodeId: integer("node_id")
    .notNull()
    .references(() => canvasNodes.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  checked: integer("checked", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const canvasMedia = sqliteTable("canvas_media", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nodeId: integer("node_id")
    .notNull()
    .references(() => canvasNodes.id, { onDelete: "cascade" }),
  uri: text("uri").notNull(),
  mediaType: text("media_type").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const canvasLinkMeta = sqliteTable("canvas_link_meta", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nodeId: integer("node_id")
    .notNull()
    .references(() => canvasNodes.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  ogTitle: text("og_title"),
  ogDescription: text("og_description"),
  ogImageUrl: text("og_image_url"),
  fetchFailed: integer("fetch_failed", { mode: "boolean" }).notNull().default(false),
});

export const canvasPlaceMeta = sqliteTable("canvas_place_meta", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nodeId: integer("node_id")
    .notNull()
    .references(() => canvasNodes.id, { onDelete: "cascade" }),
  plusCode: text("plus_code").notNull(),
  lat: real("lat"),
  lng: real("lng"),
  placeTitle: text("place_title"),
  googleMapsUrl: text("google_maps_url"),
  osmUrl: text("osm_url"),
});

export const canvasAudioMeta = sqliteTable("canvas_audio_meta", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nodeId: integer("node_id")
    .notNull()
    .references(() => canvasNodes.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull().default("local"), // "local" | "youtube"
  youtubeVideoId: text("youtube_video_id"),
  title: text("title"),
  author: text("author"),
  thumbnailUrl: text("thumbnail_url"),
});

export const canvasFiles = sqliteTable("canvas_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  folderId: integer("folder_id")
    .notNull()
    .references(() => journalFolders.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  emoji: text("emoji"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const eventDayNotes = sqliteTable("event_day_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id")
    .notNull()
    .references(() => calendarEvents.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  note: text("note").notNull().default(""),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
});

export const canvasConnections = sqliteTable("canvas_connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileId: integer("file_id")
    .notNull()
    .references(() => canvasFiles.id, { onDelete: "cascade" }),
  fromNodeId: integer("from_node_id")
    .notNull()
    .references(() => canvasNodes.id, { onDelete: "cascade" }),
  toNodeId: integer("to_node_id")
    .notNull()
    .references(() => canvasNodes.id, { onDelete: "cascade" }),
  label: text("label"),
});
