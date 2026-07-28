import { db } from "./client";
import { tags, templateTags } from "./schema";
import { eq, asc, and } from "drizzle-orm";

export type Tag = {
  id: number;
  name: string;
  color: string;
};

const TAG_COLORS = [
  "#006FFD",
  "#298267",
  "#E86339",
  "#ED3241",
  "#6FBAFF",
  "#3AC0A0",
  "#FFB37C",
  "#FF616D",
];

export function getTagColor(index: number): string {
  return TAG_COLORS[index % TAG_COLORS.length];
}

export async function getAllTags(): Promise<Tag[]> {
  return db.select().from(tags).orderBy(asc(tags.name));
}

export async function createTag(name: string, color?: string): Promise<Tag> {
  const existing = await db
    .select()
    .from(tags)
    .where(eq(tags.name, name.trim()))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const allTags = await getAllTags();
  const tagColor = color ?? getTagColor(allTags.length);

  const result = await db
    .insert(tags)
    .values({ name: name.trim(), color: tagColor })
    .returning();

  return result[0];
}

export async function deleteTag(id: number): Promise<void> {
  await db.delete(tags).where(eq(tags.id, id));
}

export async function getTagsForTemplate(templateId: number): Promise<Tag[]> {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(templateTags)
    .innerJoin(tags, eq(templateTags.tagId, tags.id))
    .where(eq(templateTags.templateId, templateId));

  return rows;
}

export async function addTagToTemplate(
  templateId: number,
  tagId: number
): Promise<void> {
  const existing = await db
    .select()
    .from(templateTags)
    .where(
      and(
        eq(templateTags.templateId, templateId),
        eq(templateTags.tagId, tagId)
      )
    )
    .limit(1);

  if (existing.length > 0) return;

  await db.insert(templateTags).values({ templateId, tagId });
}

export async function removeTagFromTemplate(
  templateId: number,
  tagId: number
): Promise<void> {
  await db
    .delete(templateTags)
    .where(
      and(
        eq(templateTags.templateId, templateId),
        eq(templateTags.tagId, tagId)
      )
    );
}
