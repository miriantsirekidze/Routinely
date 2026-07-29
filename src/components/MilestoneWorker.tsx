import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useLLM, QWEN2_5_1_5B_QUANTIZED } from "react-native-executorch";
import { getPendingMilestones, PendingMilestone } from "../llm/milestones";
import { buildMilestonePrompt } from "../llm/config";
import { saveMilestone } from "../db/trackers";
import { acquireLlm, releaseLlm, onLlmFree } from "../llm/llmLock";

/**
 * Headless: batch-generates any missing tracker milestone notes with a SINGLE model load,
 * then unloads (by unmounting the inner worker). Runs shortly after launch and whenever the
 * app returns to the foreground. Because notes are cached in the DB, this rarely has work to
 * do — and when it does, tracker screens stay instant (they never load the model themselves).
 */
export function MilestoneWorker() {
  const [queue, setQueue] = useState<PendingMilestone[] | null>(null);
  const checkingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (cancelled || checkingRef.current || queue) return;
      checkingRef.current = true;
      try {
        const pending = await getPendingMilestones();
        if (!cancelled && pending.length > 0 && acquireLlm()) {
          setQueue(pending);
        }
      } finally {
        checkingRef.current = false;
      }
    };

    // Delay the first pass so it never competes with app startup.
    const timer = setTimeout(check, 4000);
    const appSub = AppState.addEventListener("change", (s) => { if (s === "active") check(); });
    const freeSub = onLlmFree(check); // retry once an interactive caller releases the model

    return () => { cancelled = true; clearTimeout(timer); appSub.remove(); freeSub(); };
  }, [queue]);

  if (!queue) return null;
  return <GenerateWorker queue={queue} onDone={() => { releaseLlm(); setQueue(null); }} />;
}

function GenerateWorker({ queue, onDone }: { queue: PendingMilestone[]; onDone: () => void }) {
  const llm = useLLM({ model: QWEN2_5_1_5B_QUANTIZED });
  const startedRef = useRef(false);

  useEffect(() => {
    if (!llm.isReady || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      for (const m of queue) {
        try {
          const text = await llm.generate(
            buildMilestonePrompt(m.name, m.description, m.day) as any
          );
          if (text) await saveMilestone(m.id, m.day, text);
        } catch {
          // Skip a failed tracker; the next launch/foreground pass will retry it.
        }
      }
      onDone();
    })();
  }, [llm.isReady]);

  return null;
}
