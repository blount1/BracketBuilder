"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = [
  "Best Steakhouse Appetizers",
  "Greatest One-Hit Wonders",
  "Best Pixar Movies",
  "Most Overrated Airport Foods",
];

export function CreateBracketForm({ sizes }: { sizes: number[] }) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [size, setSize] = useState(16);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/brackets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, title, size }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create the bracket.");
      router.push(`/b/${data.id}/admin`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-line bg-surface/70 p-5 shadow-lg shadow-black/20"
    >
      <label className="block text-sm font-medium" htmlFor="category">
        Category
      </label>
      <input
        id="category"
        value={category}
        onChange={(event) => setCategory(event.target.value)}
        placeholder="Best Steakhouse Appetizers"
        required
        maxLength={200}
        className="mt-2 w-full rounded-lg border border-line bg-ink px-3 py-2.5 outline-none placeholder:text-white/25 focus:border-accent"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setCategory(example)}
            className="rounded-full border border-line px-3 py-1 text-xs text-white/50 transition hover:border-accent hover:text-accent"
          >
            {example}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="title">
            Title <span className="text-white/40">(optional)</span>
          </label>
          <input
            id="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Defaults to the category"
            maxLength={200}
            className="mt-2 w-full rounded-lg border border-line bg-ink px-3 py-2.5 outline-none placeholder:text-white/25 focus:border-accent"
          />
        </div>
        <div>
          <span className="block text-sm font-medium">Bracket size</span>
          <div className="mt-2 flex gap-2">
            {sizes.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSize(option)}
                aria-pressed={size === option}
                className={`flex-1 rounded-lg border px-2 py-2.5 text-sm font-semibold transition ${
                  size === option
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-line text-white/60 hover:border-white/30"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || !category.trim()}
        className="mt-5 w-full rounded-lg bg-accent px-4 py-3 font-semibold text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-8"
      >
        {busy ? "Creating…" : "Create bracket"}
      </button>
    </form>
  );
}
