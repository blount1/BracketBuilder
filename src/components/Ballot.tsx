"use client";

import { useState } from "react";
import { SeedChip } from "@/components/ui";
import type { BallotMatchup } from "@/lib/view";

/**
 * The voter's ballot. Picks save immediately and can be changed while the round
 * is open; running tallies are deliberately not shown, so nobody votes with the
 * scoreboard in view.
 */
export function Ballot({
  bracketId,
  matchups,
}: {
  bracketId: string;
  matchups: BallotMatchup[];
}) {
  const [picks, setPicks] = useState<Record<string, string | null>>(
    Object.fromEntries(matchups.map((m) => [m.id, m.myVote])),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function vote(matchupId: string, candidateId: string) {
    const previous = picks[matchupId];
    setPicks((current) => ({ ...current, [matchupId]: candidateId }));
    setSaving(matchupId);
    setError(null);
    try {
      const response = await fetch(`/api/brackets/${bracketId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchupId, candidateId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Your vote didn't save.");
    } catch (caught) {
      // Put the old pick back so the page never claims a vote that didn't land.
      setPicks((current) => ({ ...current, [matchupId]: previous ?? null }));
      setError(caught instanceof Error ? caught.message : "Your vote didn't save.");
    } finally {
      setSaving(null);
    }
  }

  const remaining = matchups.filter((m) => !picks[m.id]).length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface/70 px-4 py-3">
        <p className="text-sm text-white/60">
          {remaining === 0
            ? "All set — every matchup voted. You can still change any pick until the round closes."
            : `${remaining} of ${matchups.length} still to pick.`}
        </p>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-accent transition-all"
            style={{
              width: `${((matchups.length - remaining) / matchups.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {error ? (
        <p className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <ol className="grid gap-4 sm:grid-cols-2">
        {matchups.map((matchup, index) => (
          <li
            key={matchup.id}
            className="rounded-xl border border-line bg-surface/70 p-4"
          >
            <p className="mb-3 text-xs uppercase tracking-widest text-white/35">
              Matchup {index + 1}
              {saving === matchup.id ? " · saving…" : ""}
            </p>
            <div className="space-y-2">
              {[matchup.candidateA, matchup.candidateB].map((candidate) => {
                const selected = picks[matchup.id] === candidate.id;
                return (
                  <button
                    key={candidate.id}
                    onClick={() => vote(matchup.id, candidate.id)}
                    aria-pressed={selected}
                    className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-3 text-left transition ${
                      selected
                        ? "border-accent bg-accent/10"
                        : "border-line hover:border-white/30"
                    }`}
                  >
                    <SeedChip seed={candidate.seed} />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block ${selected ? "font-semibold text-accent" : ""}`}
                      >
                        {candidate.name}
                      </span>
                      {candidate.blurb ? (
                        <span className="mt-0.5 block text-sm text-white/45">
                          {candidate.blurb}
                        </span>
                      ) : null}
                    </span>
                    {selected ? <span className="text-accent">✓</span> : null}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
