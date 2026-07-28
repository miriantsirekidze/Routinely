export type LLMMessage = { role: "system" | "user" | "assistant"; content: string };

// Day thresholds at which we generate (and cache) a new milestone note
export const MILESTONE_THRESHOLDS = [1, 2, 3, 5, 7, 14, 21, 30, 60, 90, 180, 365];

// Returns the highest crossed threshold for a given elapsed time, or null if < day 1
export function getMilestoneDay(elapsedMs: number): number | null {
  const days = Math.floor(elapsedMs / 86400000);
  for (let i = MILESTONE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (days >= MILESTONE_THRESHOLDS[i]) return MILESTONE_THRESHOLDS[i];
  }
  return null;
}

export function buildMilestonePrompt(
  name: string,
  description: string | null,
  day: number
): LLMMessage[] {
  const context = description ? `\nContext: ${description}` : "";
  return [
    {
      role: "system",
      content:
        "You are a concise wellness assistant. Provide factual milestone information for abstinence and habit tracking. Keep responses to exactly 2 sentences. No generic motivation — only specific physiological or psychological facts.",
    },
    {
      role: "user",
      content: `Tracker: "${name}"${context}\n\nDay ${day}: describe one specific change happening in the body or mind at this milestone. Be factual and specific.`,
    },
  ];
}

export function buildFolderDescriptionPrompt(
  name: string,
  variables: { name: string; varType: string; unit?: string | null }[]
): LLMMessage[] {
  const fields =
    variables.length > 0
      ? variables.map((v) => `${v.name}${v.unit ? ` (${v.unit})` : ""}`).join(", ")
      : "free text notes";
  return [
    {
      role: "system",
      content:
        "You write short 2-sentence folder descriptions for a personal journal app. Be specific about what the folder tracks. No filler phrases.",
    },
    {
      role: "user",
      content: `Folder: "${name}"\nFields: ${fields}\n\nDescribe what this folder is for in 2 sentences.`,
    },
  ];
}

export function buildRelapsePrompt(name: string, days: number): LLMMessage[] {
  return [
    {
      role: "system",
      content:
        "You are a warm, non-judgmental friend. Someone just reset their habit tracker. Write one encouraging sentence to help them start fresh. Casual tone, no corporate speak. Reference the days they had.",
    },
    {
      role: "user",
      content: `Tracker: "${name}". They had ${days} days before resetting. One encouraging message:`,
    },
  ];
}

export function buildEventPrompt(
  title: string,
  description: string | null
): LLMMessage[] {
  const context = description ? `\nDetails: ${description}` : "";
  return [
    {
      role: "system",
      content:
        "You are a chill, witty friend giving a quick heads-up before someone's plans. Keep it casual and conversational — like a text from a mate who's been there. One practical tip, 1-2 sentences, no corporate speak.",
    },
    {
      role: "user",
      content: `About to: "${title}"${context}\n\nGive me one quick tip.`,
    },
  ];
}
