import { db } from "./client";
import { sessionTemplates, subActivityTemplates } from "./schema";
import { eq, asc } from "drizzle-orm";
import { getTagsForTemplate, Tag } from "./tags";

export type TemplateSubActivity = {
  name: string;
  expectedDuration?: number;
  restDuration: number;
  sortOrder: number;
};

export type TemplateWithSubs = {
  id: number;
  name: string;
  expectedDuration: number | null;
  createdAt: Date;
  subActivities: TemplateSubActivity[];
  tags: Tag[];
};

export async function getAllTemplates(): Promise<TemplateWithSubs[]> {
  const templates = await db
    .select()
    .from(sessionTemplates)
    .orderBy(asc(sessionTemplates.name));

  const result: TemplateWithSubs[] = [];

  for (const t of templates) {
    const subs = await db
      .select()
      .from(subActivityTemplates)
      .where(eq(subActivityTemplates.templateId, t.id))
      .orderBy(asc(subActivityTemplates.sortOrder));

    const tTags = await getTagsForTemplate(t.id);

    result.push({
      id: t.id,
      name: t.name,
      expectedDuration: t.expectedDuration,
      createdAt: t.createdAt,
      tags: tTags,
      subActivities: subs.map((s) => ({
        name: s.name,
        expectedDuration: s.expectedDuration ?? undefined,
        restDuration: s.restDuration ?? 30,
        sortOrder: s.sortOrder,
      })),
    });
  }

  return result;
}

export async function getTemplate(id: number): Promise<TemplateWithSubs | null> {
  const t = await db
    .select()
    .from(sessionTemplates)
    .where(eq(sessionTemplates.id, id))
    .limit(1);

  if (t.length === 0) return null;

  const subs = await db
    .select()
    .from(subActivityTemplates)
    .where(eq(subActivityTemplates.templateId, id))
    .orderBy(asc(subActivityTemplates.sortOrder));

  const tTags = await getTagsForTemplate(id);

  return {
    id: t[0].id,
    name: t[0].name,
    expectedDuration: t[0].expectedDuration,
    createdAt: t[0].createdAt,
    tags: tTags,
    subActivities: subs.map((s) => ({
      name: s.name,
      expectedDuration: s.expectedDuration ?? undefined,
      restDuration: s.restDuration ?? 30,
      sortOrder: s.sortOrder,
    })),
  };
}

export async function createTemplate(
  name: string,
  expectedDuration: number | undefined,
  subs: Omit<TemplateSubActivity, "sortOrder">[]
): Promise<number> {
  const result = await db
    .insert(sessionTemplates)
    .values({
      name,
      expectedDuration: expectedDuration ?? null,
      createdAt: new Date(),
    })
    .returning();

  const templateId = result[0].id;

  for (let i = 0; i < subs.length; i++) {
    await db.insert(subActivityTemplates).values({
      templateId,
      name: subs[i].name,
      sortOrder: i,
      expectedDuration: subs[i].expectedDuration ?? null,
      restDuration: subs[i].restDuration,
    });
  }

  return templateId;
}

export async function updateTemplate(
  id: number,
  name: string,
  expectedDuration: number | undefined,
  subs: Omit<TemplateSubActivity, "sortOrder">[]
): Promise<void> {
  await db
    .update(sessionTemplates)
    .set({ name, expectedDuration: expectedDuration ?? null })
    .where(eq(sessionTemplates.id, id));

  await db
    .delete(subActivityTemplates)
    .where(eq(subActivityTemplates.templateId, id));

  for (let i = 0; i < subs.length; i++) {
    await db.insert(subActivityTemplates).values({
      templateId: id,
      name: subs[i].name,
      sortOrder: i,
      expectedDuration: subs[i].expectedDuration ?? null,
      restDuration: subs[i].restDuration,
    });
  }
}

export async function deleteTemplate(id: number): Promise<void> {
  await db.delete(sessionTemplates).where(eq(sessionTemplates.id, id));
}
