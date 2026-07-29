import { expo } from "./client";

type Migration = {
  id: string;
  statements?: string[];
  // Optional JS step for migrations that need conditional logic (e.g. pragma checks)
  // that can't be expressed as static SQL. Runs after `statements`.
  run?: () => void;
};

const migrations: Migration[] = [
  {
    id: "0000_initial",
    statements: [
      `CREATE TABLE IF NOT EXISTS "days" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "date" text NOT NULL,
        "finished_at" integer,
        "exported" integer DEFAULT 0
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "days_date_unique" ON "days" ("date")`,
      `CREATE TABLE IF NOT EXISTS "session_templates" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" text NOT NULL,
        "expected_duration" integer,
        "created_at" integer NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS "sessions" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "day_id" integer NOT NULL,
        "template_id" integer,
        "name" text NOT NULL,
        "started_at" integer,
        "ended_at" integer,
        "expected_duration" integer,
        "sort_order" integer DEFAULT 0 NOT NULL,
        FOREIGN KEY ("day_id") REFERENCES "days"("id") ON DELETE CASCADE,
        FOREIGN KEY ("template_id") REFERENCES "session_templates"("id")
      )`,
      `CREATE TABLE IF NOT EXISTS "sub_activities" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "session_id" integer NOT NULL,
        "name" text NOT NULL,
        "sort_order" integer NOT NULL,
        "started_at" integer,
        "ended_at" integer,
        "elapsed_ms" integer DEFAULT 0,
        "expected_duration" integer,
        "note" text,
        FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS "pauses" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "sub_activity_id" integer NOT NULL,
        "started_at" integer NOT NULL,
        "ended_at" integer,
        "duration_ms" integer DEFAULT 0,
        "reason" text,
        FOREIGN KEY ("sub_activity_id") REFERENCES "sub_activities"("id") ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS "sub_activity_templates" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "template_id" integer NOT NULL,
        "name" text NOT NULL,
        "sort_order" integer NOT NULL,
        "expected_duration" integer,
        "rest_duration" integer DEFAULT 30,
        FOREIGN KEY ("template_id") REFERENCES "session_templates"("id") ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS "weekly_schedule" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "day_of_week" integer NOT NULL,
        "template_id" integer NOT NULL,
        "sort_order" integer NOT NULL,
        FOREIGN KEY ("template_id") REFERENCES "session_templates"("id") ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS "streaks" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "current_streak" integer DEFAULT 0,
        "longest_streak" integer DEFAULT 0,
        "last_active_date" text
      )`,
    ],
  },
  {
    id: "0001_tags",
    statements: [
      `CREATE TABLE IF NOT EXISTS "tags" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" text NOT NULL UNIQUE,
        "color" text NOT NULL DEFAULT '#006FFD'
      )`,
      `CREATE TABLE IF NOT EXISTS "template_tags" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "template_id" integer NOT NULL,
        "tag_id" integer NOT NULL,
        FOREIGN KEY ("template_id") REFERENCES "session_templates"("id") ON DELETE CASCADE,
        FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE
      )`,
    ],
  },
  {
    id: "0002_calendar",
    statements: [
      `CREATE TABLE IF NOT EXISTS "trackers" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" text NOT NULL,
        "started_at" integer NOT NULL,
        "target_days" integer,
        "paused_at" integer,
        "paused_ms" integer NOT NULL DEFAULT 0,
        "created_at" integer NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS "tracker_resets" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "tracker_id" integer NOT NULL,
        "reset_at" integer NOT NULL,
        "duration_ms" integer NOT NULL,
        "note" text,
        FOREIGN KEY ("tracker_id") REFERENCES "trackers"("id") ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS "calendar_events" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "title" text NOT NULL,
        "start_date" text NOT NULL,
        "end_date" text NOT NULL,
        "completed" integer NOT NULL DEFAULT 0,
        "created_at" integer NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS "event_day_notes" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "event_id" integer NOT NULL,
        "date" text NOT NULL,
        "note" text NOT NULL DEFAULT '',
        "completed" integer NOT NULL DEFAULT 0,
        FOREIGN KEY ("event_id") REFERENCES "calendar_events"("id") ON DELETE CASCADE
      )`,
    ],
  },
  {
    id: "0003_tracker_emoji",
    statements: [
      `ALTER TABLE "trackers" ADD COLUMN "emoji" text`,
    ],
  },
  {
    id: "0004_descriptions",
    statements: [
      `ALTER TABLE "trackers" ADD COLUMN "description" text`,
      `ALTER TABLE "calendar_events" ADD COLUMN "description" text`,
    ],
  },
  {
    id: "0006_journal",
    statements: [
      `CREATE TABLE IF NOT EXISTS "journal_folders" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" text NOT NULL,
        "emoji" text,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" integer NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS "journal_variables" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "folder_id" integer NOT NULL,
        "name" text NOT NULL,
        "var_type" text NOT NULL,
        "unit" text,
        "required" integer NOT NULL DEFAULT 0,
        "allow_multiple" integer NOT NULL DEFAULT 0,
        "sort_order" integer NOT NULL DEFAULT 0,
        FOREIGN KEY ("folder_id") REFERENCES "journal_folders"("id") ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS "journal_entries" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "folder_id" integer NOT NULL,
        "title" text NOT NULL,
        "entry_date" text,
        "created_at" integer NOT NULL,
        FOREIGN KEY ("folder_id") REFERENCES "journal_folders"("id") ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS "journal_field_values" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "entry_id" integer NOT NULL,
        "variable_id" integer NOT NULL,
        "text_value" text,
        "number_value" real,
        "media_uris" text,
        FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE,
        FOREIGN KEY ("variable_id") REFERENCES "journal_variables"("id") ON DELETE CASCADE
      )`,
    ],
  },
  {
    id: "0008_journal_folder_description",
    statements: [
      `ALTER TABLE "journal_folders" ADD COLUMN "description" text`,
    ],
  },
  {
    id: "0011_canvas_nodes",
    statements: [
      `CREATE TABLE IF NOT EXISTS "canvas_nodes" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "file_id" integer NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "x" real NOT NULL DEFAULT 0,
        "y" real NOT NULL DEFAULT 0,
        "width" real NOT NULL DEFAULT 220,
        "created_at" integer NOT NULL,
        FOREIGN KEY ("file_id") REFERENCES "canvas_files"("id") ON DELETE CASCADE
      )`,
    ],
  },
  {
    id: "0010_canvas_files",
    statements: [
      `CREATE TABLE IF NOT EXISTS "canvas_files" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "folder_id" integer NOT NULL,
        "title" text NOT NULL,
        "emoji" text,
        "created_at" integer NOT NULL,
        FOREIGN KEY ("folder_id") REFERENCES "journal_folders"("id") ON DELETE CASCADE
      )`,
    ],
  },
  {
    id: "0009_journal_folder_type",
    statements: [
      `ALTER TABLE "journal_folders" ADD COLUMN "folder_type" text NOT NULL DEFAULT 'notes'`,
    ],
  },
  {
    // Drops and recreates journal tables — the original 0006_journal had a
    // `type text NOT NULL` column on journal_folders that was removed when
    // the schema was redesigned. Drop in reverse FK order, recreate fresh.
    id: "0007_journal_rework",
    statements: [
      `DROP TABLE IF EXISTS "journal_field_values"`,
      `DROP TABLE IF EXISTS "journal_entries"`,
      `DROP TABLE IF EXISTS "journal_variables"`,
      `DROP TABLE IF EXISTS "journal_folders"`,
      `CREATE TABLE IF NOT EXISTS "journal_folders" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" text NOT NULL,
        "emoji" text,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" integer NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS "journal_variables" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "folder_id" integer NOT NULL,
        "name" text NOT NULL,
        "var_type" text NOT NULL,
        "unit" text,
        "required" integer NOT NULL DEFAULT 0,
        "allow_multiple" integer NOT NULL DEFAULT 0,
        "sort_order" integer NOT NULL DEFAULT 0,
        FOREIGN KEY ("folder_id") REFERENCES "journal_folders"("id") ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS "journal_entries" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "folder_id" integer NOT NULL,
        "title" text NOT NULL,
        "entry_date" text,
        "created_at" integer NOT NULL,
        FOREIGN KEY ("folder_id") REFERENCES "journal_folders"("id") ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS "journal_field_values" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "entry_id" integer NOT NULL,
        "variable_id" integer NOT NULL,
        "text_value" text,
        "number_value" real,
        "media_uris" text,
        FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE,
        FOREIGN KEY ("variable_id") REFERENCES "journal_variables"("id") ON DELETE CASCADE
      )`,
    ],
  },
  {
    id: "0005_llm_cache",
    statements: [
      `ALTER TABLE "trackers" ADD COLUMN "milestone_day" integer`,
      `ALTER TABLE "trackers" ADD COLUMN "milestone_text" text`,
      `ALTER TABLE "calendar_events" ADD COLUMN "llm_note" text`,
    ],
  },
  {
    id: "0014_canvas_connections",
    statements: [
      `CREATE TABLE IF NOT EXISTS canvas_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL REFERENCES canvas_files(id) ON DELETE CASCADE,
        from_node_id INTEGER NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
        to_node_id INTEGER NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
        label TEXT
      )`,
    ],
  },
  {
    id: "0013_node_aspect_ratio",
    statements: [
      `ALTER TABLE canvas_nodes ADD COLUMN aspect_ratio TEXT NOT NULL DEFAULT '3:2'`,
    ],
  },
  {
    id: "0015_node_collapsed",
    statements: [
      `ALTER TABLE canvas_nodes ADD COLUMN collapsed INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    id: "0017_node_seq_order",
    statements: [
      `ALTER TABLE canvas_nodes ADD COLUMN seq_order INTEGER`,
    ],
  },
  {
    id: "0016_canvas_audio",
    statements: [
      `CREATE TABLE IF NOT EXISTS canvas_audio_meta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id INTEGER NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL DEFAULT 'local',
        youtube_video_id TEXT,
        title TEXT,
        author TEXT,
        thumbnail_url TEXT
      )`,
    ],
  },
  {
    id: "0012_canvas_components",
    statements: [
      `ALTER TABLE canvas_nodes ADD COLUMN card_type TEXT NOT NULL DEFAULT 'text-titled'`,
      `CREATE TABLE IF NOT EXISTS canvas_todo_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id INTEGER NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        checked INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS canvas_media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id INTEGER NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
        uri TEXT NOT NULL,
        media_type TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS canvas_link_meta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id INTEGER NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        og_title TEXT,
        og_description TEXT,
        og_image_url TEXT,
        fetch_failed INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS canvas_place_meta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id INTEGER NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
        plus_code TEXT NOT NULL,
        lat REAL,
        lng REAL,
        place_title TEXT,
        google_maps_url TEXT,
        osm_url TEXT
      )`,
    ],
  },
  {
    // Self-heal `journal_folders`: the historical migration order applies
    // `0007_journal_rework` (which DROPs & recreates journal_folders WITHOUT the
    // `description`/`folder_type` columns) AFTER 0008/0009 which added them, so a fresh
    // DB ends up missing both columns and every getFolders() query throws. Rather than
    // reorder historical migrations (risky), reconcile the columns here idempotently.
    // Fixes fresh installs and any existing DB left in the broken state.
    id: "0018_journal_folders_reconcile",
    run: () => {
      const cols = expo
        .getAllSync<{ name: string }>(`PRAGMA table_info("journal_folders")`)
        .map((c) => c.name);
      if (!cols.includes("description")) {
        expo.execSync(`ALTER TABLE "journal_folders" ADD COLUMN "description" text`);
      }
      if (!cols.includes("folder_type")) {
        expo.execSync(
          `ALTER TABLE "journal_folders" ADD COLUMN "folder_type" text NOT NULL DEFAULT 'notes'`
        );
      }
    },
  },
];

export function runMigrations() {
  expo.execSync(
    `CREATE TABLE IF NOT EXISTS "__migrations" (
      "id" text PRIMARY KEY NOT NULL,
      "applied_at" integer NOT NULL
    )`
  );

  for (const migration of migrations) {
    const existing = expo.getFirstSync<{ id: string }>(
      `SELECT id FROM "__migrations" WHERE id = ?`,
      migration.id
    );

    if (existing) continue;

    for (const sql of migration.statements ?? []) {
      expo.execSync(sql);
    }
    migration.run?.();

    expo.runSync(
      `INSERT INTO "__migrations" (id, applied_at) VALUES (?, ?)`,
      migration.id,
      Date.now()
    );
  }
}
