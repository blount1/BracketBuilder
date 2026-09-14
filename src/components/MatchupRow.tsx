"use client";

import { useState } from "react";
import { Badge, SeedChip } from "@/components/ui";
import type { MatchupView } from "@/lib/view";

/** One matchup as a two-row card, used in the admin console and the bracket tree. */
export function MatchupRow({
  matchup,
  showTally,
  eligibleVoters,
}: {
  matchup: MatchupView;
  showTally?: boolean;
  /** When given, the row reports turnout as "3 of 5 voted". */
  eligibleVoters?: number;
}) {
  const { candidateA, candidateB, winnerId, status } = matchup;
  const showTurnout =
    showTally && matchup.votesCast !== null && (eligibleVoters ?? 0) > 0;

  return (
    <div className="rounded-lg border border-line bg-ink/50">
      <Side
        candidate={candidateA}
        votes={matchup.votesA}
        isWinner={Boolean(winnerId && candidateA?.id === winnerId)}
        decided={status === "DECIDED"}
        showTally={showTally}
      />
      <div className="h-px bg-line" />
      <Side
        candidate={candidateB}
        votes={matchup.votesB}
        isWinner={Boolean(winnerId && candidateB?.id === winnerId)}
        decided={status === "DECIDED"}
        showTally={showTally}
        isBye={matchup.isBye}
      />
      {matchup.decidedByFlip ? <FlipNote matchup={matchup} /> : null}
      {status === "OPEN" || showTurnout ? (
        <div className="flex items-center gap-2 border-t border-line px-3 py-1.5">
          {status === "OPEN" ? <Badge tone="live">Voting open</Badge> : null}
          {showTurnout ? (
            <span className="ml-auto text-xs tabular-nums text-white/45">
              {matchup.votesCast} of {eligibleVoters} voted
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Side({
  candidate,
  votes,
  isWinner,
  decided,
  showTally,
  isBye,
}: {
  candidate: MatchupView["candidateA"];
  votes: number | null;
  isWinner: boolean;
  decided: boolean;
  showTally?: boolean;
  isBye?: boolean;
}) {
  if (!candidate) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-white/25">
        {isBye ? "Bye" : "To be decided"}
      </div>
    );
  }
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 ${
        decided && !isWinner ? "opacity-40" : ""
      }`}
    >
      <SeedChip seed={candidate.seed} />
      <span className={`min-w-0 flex-1 truncate text-sm ${isWinner ? "font-semibold" : ""}`}>
        {candidate.name}
      </span>
      {showTally && votes !== null ? (
        <span className="shrink-0 text-xs tabular-nums text-white/45">{votes}</span>
      ) : null}
      {isWinner ? <span className="shrink-0 text-accent">✓</span> : null}
    </div>
  );
}

/**
 * The audit trail for a tie-break. The commitment was published when the
 * matchup was created; the seed is revealed once it's decided, and anyone can
 * recompute the result from them.
 */
function FlipNote({ matchup }: { matchup: MatchupView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-line px-3 py-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Badge tone="flip">Tied — decided by coin flip</Badge>
        <span className="ml-auto text-xs text-white/35">{open ? "hide" : "verify"}</span>
      </button>
      {open ? (
        <dl className="mt-2 space-y-1 text-[11px] text-white/40">
          <div>
            <dt className="inline font-medium text-white/55">Commitment: </dt>
            <dd className="inline break-all font-mono">{matchup.flipCommit}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-white/55">Revealed seed: </dt>
            <dd className="inline break-all font-mono">{matchup.flipSeed}</dd>
          </div>
          <p className="pt-1 text-white/35">
            The commitment is sha256(&quot;bracketbuilder/commit/v1|&quot; + seed) and was
            stored before voting opened. The winning side is the low bit of
            sha256(&quot;bracketbuilder/flip/v1|&quot; + seed) — 0 picks the top slot.
          </p>
        </dl>
      ) : null}
    </div>
  );
}
