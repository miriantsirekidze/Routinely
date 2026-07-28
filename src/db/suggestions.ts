import { db } from "./client";
import { sessions, sessionTemplates } from "./schema";
import { eq, isNotNull } from "drizzle-orm";

type TemplateTimePattern = {
  templateId: number;
  templateName: string;
  dayOfWeek: number;
  avgMinuteOfDay: number;
  occurrences: number;
};

export type Suggestion = {
  templateId: number;
  templateName: string;
  typicalTime: string;
  confidence: number;
  minutesFromNow: number;
};

async function getPatterns(): Promise<TemplateTimePattern[]> {
  const rows = await db
    .select({
      templateId: sessions.templateId,
      templateName: sessions.name,
      startedAt: sessions.startedAt,
    })
    .from(sessions)
    .where(isNotNull(sessions.templateId));

  const grouped: Record<
    string,
    {
      templateId: number;
      templateName: string;
      dayOfWeek: number;
      minutesOfDay: number[];
    }
  > = {};

  for (const row of rows) {
    if (!row.startedAt || !row.templateId) continue;

    const d = new Date(row.startedAt);
    const dayOfWeek = d.getDay();
    const minuteOfDay = d.getHours() * 60 + d.getMinutes();
    const key = `${row.templateId}-${dayOfWeek}`;

    if (!grouped[key]) {
      grouped[key] = {
        templateId: row.templateId,
        templateName: row.templateName,
        dayOfWeek,
        minutesOfDay: [],
      };
    }
    grouped[key].minutesOfDay.push(minuteOfDay);
  }

  return Object.values(grouped).map((g) => {
    const avg =
      g.minutesOfDay.reduce((a, b) => a + b, 0) / g.minutesOfDay.length;
    return {
      templateId: g.templateId,
      templateName: g.templateName,
      dayOfWeek: g.dayOfWeek,
      avgMinuteOfDay: Math.round(avg),
      occurrences: g.minutesOfDay.length,
    };
  });
}

function formatMinuteOfDay(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export async function getSuggestions(
  lookaheadMinutes = 20
): Promise<Suggestion[]> {
  const now = new Date();
  const currentDay = now.getDay();
  const currentMinute = now.getHours() * 60 + now.getMinutes();

  const patterns = await getPatterns();

  const todayPatterns = patterns.filter(
    (p) => p.dayOfWeek === currentDay && p.occurrences >= 2
  );

  const suggestions: Suggestion[] = [];

  for (const p of todayPatterns) {
    const diff = p.avgMinuteOfDay - currentMinute;

    if (diff >= -10 && diff <= lookaheadMinutes) {
      suggestions.push({
        templateId: p.templateId,
        templateName: p.templateName,
        typicalTime: formatMinuteOfDay(p.avgMinuteOfDay),
        confidence: Math.min(p.occurrences / 5, 1),
        minutesFromNow: diff,
      });
    }
  }

  suggestions.sort((a, b) => a.minutesFromNow - b.minutesFromNow);

  return suggestions;
}

export async function getAllDaySuggestions(): Promise<Suggestion[]> {
  const now = new Date();
  const currentDay = now.getDay();
  const currentMinute = now.getHours() * 60 + now.getMinutes();

  const patterns = await getPatterns();

  const todayPatterns = patterns
    .filter((p) => p.dayOfWeek === currentDay && p.occurrences >= 2)
    .sort((a, b) => a.avgMinuteOfDay - b.avgMinuteOfDay);

  return todayPatterns.map((p) => ({
    templateId: p.templateId,
    templateName: p.templateName,
    typicalTime: formatMinuteOfDay(p.avgMinuteOfDay),
    confidence: Math.min(p.occurrences / 5, 1),
    minutesFromNow: p.avgMinuteOfDay - currentMinute,
  }));
}
