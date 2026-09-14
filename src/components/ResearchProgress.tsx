"use client";

import { useEffect, useState } from "react";
import type { ResearchStage } from "@/lib/research";

export interface ResearchState {
  stage: ResearchStage;
  stageNumber: number;
  totalStages: number;
  startedAt: number;
}

const LABELS: Record<ResearchStage, { title: string; detail: string }> = {
  searching: {
    title: "Searching the web",
    detail: "Gathering evidence about what actually wins in this category.",
  },
  ranking: {
    title: "Ranking the field",
    detail: "Working out the order, strongest first — that ordering is the seeding.",
  },
  finishing: {
    title: "Saving the bracket",
    detail: "Writing the seeded field so you can review it.",
  },
};

/**
 * Progress for a research run.
 *
 * The bar advances on stages the server actually reached, not on a timer - a
 * timer-driven bar is just an animation that lies when a call runs long. Within
 * a stage it creeps toward that stage's ceiling so the UI doesn't look frozen,
 * but it can never claim a stage finished before it did. The elapsed count is
 * there because the honest answer to "is this stuck?" is usually "no, it has
 * been 22 seconds".
 */
export function ResearchProgress({ state }: { state: ResearchState }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - state.startedAt) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [state.startedAt]);

  const label = LABELS[state.stage];
  // Floor: stages genuinely completed. Ceiling: the end of the current stage.
  const floor = ((state.stageNumber - 1) / state.totalStages) * 100;
  const ceiling = (state.stageNumber / state.totalStages) * 100;
  // Creep most of the way across the current stage over ~40s, never reaching
  // the ceiling, so arrival at the next stage is always a visible jump.
  const creep = 1 - Math.exp(-elapsed / 40);
  const percent = Math.min(floor + (ceiling - floor) * creep * 0.85, 97);

  return (
    <div
      className="mt-4 rounded-lg border border-line bg-ink/60 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{label.title}</p>
        <p className="shrink-0 text-xs tabular-nums text-white/40">
          {elapsed}s · step {state.stageNumber} of {state.totalStages}
        </p>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-2.5 text-sm text-white/50">{label.detail}</p>
      {elapsed > 75 ? (
        <p className="mt-1.5 text-xs text-white/35">
          Taking longer than usual — still running, not stuck. Web search runs
          push this past two minutes.
        </p>
      ) : null}
    </div>
  );
}
