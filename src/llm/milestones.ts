import { getTrackers } from "../db/trackers";
import { getMilestoneDay } from "./config";

export type PendingMilestone = {
  id: number;
  name: string;
  description: string | null;
  day: number;
};

/**
 * Trackers whose current milestone threshold has no cached note yet. These are what the
 * background worker generates in a single model load.
 */
export async function getPendingMilestones(): Promise<PendingMilestone[]> {
  const trackers = await getTrackers();
  const pending: PendingMilestone[] = [];
  for (const t of trackers) {
    const day = getMilestoneDay(t.elapsedMs);
    if (day === null) continue;
    if (t.milestoneDay === day && t.milestoneText) continue; // already cached for this day
    pending.push({ id: t.id, name: t.name, description: t.description, day });
  }
  return pending;
}
