import { createTemplate, getAllTemplates } from "./templates";
import { createTag, getAllTags, addTagToTemplate, getTagsForTemplate } from "./tags";
import { addToSchedule, getFullSchedule } from "./schedule";

type ImportActivity = {
  name: string;
  expectedMinutes?: number;
  restSeconds?: number;
};

type ImportTemplate = {
  name: string;
  expectedMinutes?: number;
  tags?: string[];
  activities: ImportActivity[];
};

type ImportSchedule = {
  monday?: string[];
  tuesday?: string[];
  wednesday?: string[];
  thursday?: string[];
  friday?: string[];
  saturday?: string[];
  sunday?: string[];
};

type ImportData = {
  templates: ImportTemplate[];
  schedule: ImportSchedule;
};

const DAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export async function importSchedule(data: ImportData): Promise<{
  templatesCreated: number;
  templatesSkipped: number;
  scheduleEntries: number;
  tagsCreated: number;
}> {
  const existingTemplates = await getAllTemplates();
  const existingNames = new Set(existingTemplates.map((t) => t.name));

  let templatesCreated = 0;
  let templatesSkipped = 0;
  let tagsCreated = 0;

  const templateNameToId: Record<string, number> = {};

  for (const t of existingTemplates) {
    templateNameToId[t.name] = t.id;
  }

  for (const tmpl of data.templates) {
    if (existingNames.has(tmpl.name)) {
      templatesSkipped++;
      continue;
    }

    const subs = tmpl.activities.map((a) => ({
      name: a.name,
      expectedDuration: a.expectedMinutes
        ? a.expectedMinutes * 60
        : undefined,
      restDuration: a.restSeconds ?? 30,
    }));

    const templateId = await createTemplate(
      tmpl.name,
      tmpl.expectedMinutes ? tmpl.expectedMinutes * 60 : undefined,
      subs
    );

    templateNameToId[tmpl.name] = templateId;
    templatesCreated++;

    if (tmpl.tags && tmpl.tags.length > 0) {
      for (const tagName of tmpl.tags) {
        const tag = await createTag(tagName);
        await addTagToTemplate(templateId, tag.id);
        tagsCreated++;
      }
    }
  }

  let scheduleEntries = 0;

  for (const [dayName, templateNames] of Object.entries(data.schedule)) {
    const dayNum = DAY_MAP[dayName.toLowerCase()];
    if (dayNum === undefined || !templateNames) continue;

    for (const name of templateNames) {
      const templateId = templateNameToId[name];
      if (!templateId) continue;

      await addToSchedule(dayNum, templateId);
      scheduleEntries++;
    }
  }

  return { templatesCreated, templatesSkipped, scheduleEntries, tagsCreated };
}

export function validateImportData(json: any): string | null {
  if (!json || typeof json !== "object") return "Invalid JSON";
  if (!Array.isArray(json.templates)) return "Missing 'templates' array";
  if (!json.schedule || typeof json.schedule !== "object")
    return "Missing 'schedule' object";

  for (const t of json.templates) {
    if (!t.name || typeof t.name !== "string")
      return "Each template must have a 'name' string";
    if (!Array.isArray(t.activities) || t.activities.length === 0)
      return `Template "${t.name}" must have at least one activity`;
    for (const a of t.activities) {
      if (!a.name || typeof a.name !== "string")
        return `Activities in "${t.name}" must have a 'name' string`;
    }
  }

  const validDays = Object.keys(DAY_MAP);
  for (const key of Object.keys(json.schedule)) {
    if (!validDays.includes(key.toLowerCase()))
      return `Invalid day name: "${key}"`;
    if (!Array.isArray(json.schedule[key]))
      return `Schedule for "${key}" must be an array of template names`;
  }

  return null;
}

const NUM_TO_DAY: Record<number, string> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

export async function exportSchedule(): Promise<string> {
  const templates = await getAllTemplates();
  const schedule = await getFullSchedule();

  const scheduleTemplateIds = new Set<number>();
  for (const entries of Object.values(schedule)) {
    for (const entry of entries) {
      scheduleTemplateIds.add(entry.templateId);
    }
  }

  const usedTemplates = templates.filter((t) => scheduleTemplateIds.has(t.id));

  const exportData: any = {
    templates: [],
    schedule: {} as Record<string, string[]>,
  };

  for (const t of usedTemplates) {
    const tags = await getTagsForTemplate(t.id);
    exportData.templates.push({
      name: t.name,
      expectedMinutes: t.expectedDuration
        ? Math.round(t.expectedDuration / 60)
        : undefined,
      tags: tags.length > 0 ? tags.map((tg) => tg.name) : undefined,
      activities: t.subActivities.map((a) => ({
        name: a.name,
        expectedMinutes: a.expectedDuration
          ? Math.round(a.expectedDuration / 60)
          : undefined,
        restSeconds: a.restDuration,
      })),
    });
  }

  for (let day = 0; day < 7; day++) {
    const entries = schedule[day] ?? [];
    if (entries.length > 0) {
      exportData.schedule[NUM_TO_DAY[day]] = entries.map(
        (e) => e.templateName
      );
    }
  }

  return JSON.stringify(exportData, null, 2);
}
