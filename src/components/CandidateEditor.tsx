"use client";

import { useState } from "react";

/**
 * Type or paste the field by hand: one contender per line, strongest first,
 * with an optional " - description" after the name.
 *
 * This is the path that needs no API key, and the one to reach for when you
 * already know the list you want to settle.
 */
export function CandidateEditor({
  bracketId,
  size,
  initial,
  onSaved,
}: {
  bracketId: string;
  size: number;
  initial: { name: string; blurb: string | null }[];
  onSaved: () => void;
}) {
  const [text, setText] = useState(
    initial.map((c) => (c.blurb ? `${c.name} - ${c.blurb}` : c.name)).join("\n"),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const minimum = size / 2 + 1;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const candidates = lines.map((line) => {
        // Split on the first " - " only, so names may contain hyphens.
        const match = line.match(/^(.*?)\s+-\s+(.*)$/);
        return match
          ? { name: match[1].trim(), blurb: match[2].trim() }
          : { name: line };
      });
      const response = await fetch(`/api/brackets/${bracketId}/candidates`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save the list.");
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the list.");
    } finally {
      setBusy(false);
    }
  }

  const tooFew = lines.length > 0 && lines.length < minimum;

  return (
    <div className="mt-5 rounded-lg border border-line bg-ink/50 p-4">
      <label className="block text-sm font-medium" htmlFor="candidate-list">
        Enter the field yourself
      </label>
      <p className="mt-1 text-sm text-white/50">
        One per line, strongest first — the order is the seeding. Add an optional
        description after a dash.
      </p>
      <textarea
        id="candidate-list"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={10}
        spellCheck={false}
        placeholder={"Shrimp Cocktail - the one everyone reaches for\nCrab Cakes\nBacon-Wrapped Scallops"}
        className="mt-3 w-full rounded-lg border border-line bg-ink px-3 py-2.5 font-mono text-sm outline-none placeholder:text-white/25 focus:border-accent"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={busy || lines.length === 0 || tooFew}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Saving…" : `Save ${lines.length || ""} contender${lines.length === 1 ? "" : "s"}`}
        </button>
        <span className="text-xs text-white/40">
          {lines.length === 0
            ? `A ${size} bracket needs ${minimum}–${size}.`
            : tooFew
              ? `Need at least ${minimum} for a ${size} bracket.`
              : lines.length < size
                ? `${size - lines.length} top seed${size - lines.length === 1 ? "" : "s"} will get a bye.`
                : "Full bracket — no byes."}
        </span>
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
