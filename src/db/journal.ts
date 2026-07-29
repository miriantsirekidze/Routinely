import { db } from "./client";
import { journalFolders, journalVariables, journalEntries, journalFieldValues } from "./schema";
import { eq, desc, asc } from "drizzle-orm";
import { invalidate } from "./queryCache";

export type VarType = "number" | "text" | "description" | "image" | "checkbox" | "voice";

export type JournalVariable = {
  id: number;
  folderId: number;
  name: string;
  varType: VarType;
  unit: string | null;
  required: boolean;
  allowMultiple: boolean;
  sortOrder: number;
};

export type JournalFolder = {
  id: number;
  name: string;
  emoji: string | null;
  description: string | null;
  folderType: "notes" | "custom" | "canvas";
  sortOrder: number;
  createdAt: Date;
  variables: JournalVariable[];
};

export type FieldValue = {
  id: number;
  entryId: number;
  variableId: number;
  textValue: string | null;
  numberValue: number | null;
  mediaUris: string[] | null; // parsed from JSON
};

export type JournalEntry = {
  id: number;
  folderId: number;
  title: string;
  entryDate: string | null;
  createdAt: Date;
  values: FieldValue[];
};

// ─── Folders ────────────────────────────────────────────────────────────────

async function loadVariables(folderId: number): Promise<JournalVariable[]> {
  return db.select().from(journalVariables)
    .where(eq(journalVariables.folderId, folderId))
    .orderBy(asc(journalVariables.sortOrder)) as Promise<JournalVariable[]>;
}

export async function getFolders(): Promise<JournalFolder[]> {
  const folders = await db.select().from(journalFolders)
    .orderBy(asc(journalFolders.sortOrder)) as JournalFolder[];
  for (const f of folders) {
    f.variables = await loadVariables(f.id);
  }
  return folders;
}

export async function getFolder(id: number): Promise<JournalFolder | null> {
  const rows = await db.select().from(journalFolders)
    .where(eq(journalFolders.id, id)).limit(1);
  if (!rows[0]) return null;
  const folder = rows[0] as JournalFolder;
  folder.variables = await loadVariables(id);
  return folder;
}

export async function saveFolderDescription(id: number, description: string): Promise<void> {
  invalidate("journal");
  await db.update(journalFolders).set({ description }).where(eq(journalFolders.id, id));
}

export async function updateFolder(
  id: number,
  patch: { name?: string; emoji?: string | null; description?: string | null }
): Promise<void> {
  invalidate("journal");
  await db.update(journalFolders).set(patch).where(eq(journalFolders.id, id));
}

export async function setFolderVariables(
  folderId: number,
  incoming: Array<{
    id?: number; // present = existing variable to update
    name: string;
    varType: VarType;
    unit?: string;
    required?: boolean;
    allowMultiple?: boolean;
  }>
): Promise<void> {
  invalidate("journal");
  const existing = await db.select().from(journalVariables)
    .where(eq(journalVariables.folderId, folderId));

  const incomingIds = new Set(incoming.filter((v) => v.id).map((v) => v.id!));

  // Delete variables that were removed
  for (const ev of existing) {
    if (!incomingIds.has(ev.id)) {
      await db.delete(journalVariables).where(eq(journalVariables.id, ev.id));
    }
  }

  for (let i = 0; i < incoming.length; i++) {
    const v = incoming[i];
    if (v.id) {
      // Update existing
      await db.update(journalVariables).set({
        name: v.name,
        varType: v.varType,
        unit: v.unit ?? null,
        required: v.required ?? false,
        allowMultiple: v.allowMultiple ?? false,
        sortOrder: i,
      }).where(eq(journalVariables.id, v.id));
    } else {
      // Insert new
      await db.insert(journalVariables).values({
        folderId,
        name: v.name,
        varType: v.varType,
        unit: v.unit ?? null,
        required: v.required ?? false,
        allowMultiple: v.allowMultiple ?? false,
        sortOrder: i,
      });
    }
  }
}

export async function createFolder(data: {
  name: string;
  emoji?: string | null;
  folderType?: "notes" | "custom" | "canvas";
  variables: Array<{
    name: string;
    varType: VarType;
    unit?: string;
    required?: boolean;
    allowMultiple?: boolean;
  }>;
}): Promise<JournalFolder> {
  invalidate("journal");
  const existing = await db.select().from(journalFolders)
    .orderBy(desc(journalFolders.sortOrder)).limit(1);
  const nextOrder = existing[0] ? existing[0].sortOrder + 1 : 0;

  const result = await db.insert(journalFolders).values({
    name: data.name,
    emoji: data.emoji ?? null,
    folderType: data.folderType ?? "notes",
    sortOrder: nextOrder,
  }).returning();
  const folder = result[0] as JournalFolder;

  for (let i = 0; i < data.variables.length; i++) {
    const v = data.variables[i];
    await db.insert(journalVariables).values({
      folderId: folder.id,
      name: v.name,
      varType: v.varType,
      unit: v.unit ?? null,
      required: v.required ?? false,
      allowMultiple: v.allowMultiple ?? false,
      sortOrder: i,
    });
  }

  folder.variables = await loadVariables(folder.id);
  return folder;
}

export async function deleteFolder(id: number): Promise<void> {
  invalidate("journal");
  await db.delete(journalFolders).where(eq(journalFolders.id, id));
}

// ─── Entries ─────────────────────────────────────────────────────────────────

function parseFieldValues(raw: any[]): FieldValue[] {
  return raw.map((r) => ({
    ...r,
    mediaUris: r.mediaUris ? JSON.parse(r.mediaUris) : null,
  }));
}

export async function getEntries(folderId: number): Promise<JournalEntry[]> {
  const entries = await db.select().from(journalEntries)
    .where(eq(journalEntries.folderId, folderId))
    .orderBy(desc(journalEntries.createdAt)) as JournalEntry[];

  for (const e of entries) {
    const rawValues = await db.select().from(journalFieldValues)
      .where(eq(journalFieldValues.entryId, e.id));
    e.values = parseFieldValues(rawValues);
  }
  return entries;
}

export async function getEntry(id: number): Promise<JournalEntry | null> {
  const rows = await db.select().from(journalEntries)
    .where(eq(journalEntries.id, id)).limit(1);
  if (!rows[0]) return null;
  const entry = rows[0] as JournalEntry;
  const rawValues = await db.select().from(journalFieldValues)
    .where(eq(journalFieldValues.entryId, id));
  entry.values = parseFieldValues(rawValues);
  return entry;
}

export async function createEntry(data: {
  folderId: number;
  title: string;
  entryDate?: string;
  values: Array<{
    variableId: number;
    textValue?: string | null;
    numberValue?: number | null;
    mediaUris?: string[] | null;
  }>;
}): Promise<JournalEntry> {
  const result = await db.insert(journalEntries).values({
    folderId: data.folderId,
    title: data.title,
    entryDate: data.entryDate ?? null,
  }).returning();
  const entry = result[0] as JournalEntry;

  for (const v of data.values) {
    await db.insert(journalFieldValues).values({
      entryId: entry.id,
      variableId: v.variableId,
      textValue: v.textValue ?? null,
      numberValue: v.numberValue ?? null,
      mediaUris: v.mediaUris ? JSON.stringify(v.mediaUris) : null,
    });
  }

  entry.values = parseFieldValues(
    await db.select().from(journalFieldValues).where(eq(journalFieldValues.entryId, entry.id))
  );
  return entry;
}

export async function updateFieldValue(
  entryId: number,
  variableId: number,
  data: { textValue?: string | null; numberValue?: number | null; mediaUris?: string[] | null }
): Promise<void> {
  const existing = await db.select().from(journalFieldValues)
    .where(eq(journalFieldValues.entryId, entryId))
    .limit(100);
  const found = existing.find((r) => r.variableId === variableId);

  const payload = {
    textValue: data.textValue ?? null,
    numberValue: data.numberValue ?? null,
    mediaUris: data.mediaUris ? JSON.stringify(data.mediaUris) : null,
  };

  if (found) {
    await db.update(journalFieldValues).set(payload).where(eq(journalFieldValues.id, found.id));
  } else {
    await db.insert(journalFieldValues).values({ entryId, variableId, ...payload });
  }
}

export async function updateEntry(
  id: number,
  patch: Partial<Pick<JournalEntry, "title" | "entryDate">>
): Promise<void> {
  await db.update(journalEntries).set(patch).where(eq(journalEntries.id, id));
}

export async function deleteEntry(id: number): Promise<void> {
  await db.delete(journalEntries).where(eq(journalEntries.id, id));
}

// Chart data: all values for a number-type variable in a folder, ordered by date
export async function getNumberHistory(
  folderId: number,
  variableId: number
): Promise<{ date: string; value: number }[]> {
  const entries = await db.select({
    entryDate: journalEntries.entryDate,
    createdAt: journalEntries.createdAt,
  }).from(journalEntries).where(eq(journalEntries.folderId, folderId))
    .orderBy(asc(journalEntries.entryDate));

  const result: { date: string; value: number }[] = [];
  for (const e of entries) {
    const vals = await db.select().from(journalFieldValues)
      .where(eq(journalFieldValues.entryId, (e as any).id))
      .limit(50);
    const match = vals.find((v) => v.variableId === variableId);
    if (match?.numberValue !== null && match?.numberValue !== undefined) {
      result.push({
        date: e.entryDate ?? "",
        value: match.numberValue,
      });
    }
  }
  return result;
}
