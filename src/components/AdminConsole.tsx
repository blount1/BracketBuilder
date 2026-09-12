"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Card, PageHeader, SeedChip } from "@/components/ui";
import { MatchupRow } from "@/components/MatchupRow";
import type { BracketView, CandidateView } from "@/lib/view";

interface Invite {
  id: string;
  label: string;
  inviteUrl: string;
  claimed?: boolean;
}

export function AdminConsole({
  bracket,
  hasApiKey,
}: {
  bracket: BracketView;
  hasApiKey: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [inviteCount, setInviteCount] = useState(8);

  async function call(action: string, path: string, init?: RequestInit) {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "That didn't work.");
      return data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function research() {
    const data = await call("research", `/api/brackets/${bracket.id}/research`, {
      method: "POST",
    });
    if (data) {
      setNotice(
        data.usedWebSearch
          ? "Researched with live web search and seeded by predicted strength."
          : "Seeded from the model's own knowledge (web search was off or returned nothing).",
      );
      router.refresh();
    }
  }

  async function start() {
    if (await call("start", `/api/brackets/${bracket.id}/start`, { method: "POST" })) {
      router.refresh();
    }
  }

  async function closeRound() {
    const data = await call("close", `/api/brackets/${bracket.id}/close`, {
      method: "POST",
    });
    if (data) {
      const flips = data.decided.filter(
        (d: { decidedByFlip: boolean }) => d.decidedByFlip,
      ).length;
      setNotice(
        data.bracketComplete
          ? "That's the final. Champion crowned."
          : `Round closed. ${data.decided.length} matchups decided${
              flips ? `, ${flips} by coin flip` : ""
            }.`,
      );
      router.refresh();
    }
  }

  async function createInvites() {
    const data = await call("invite", `/api/brackets/${bracket.id}/voters`, {
      method: "POST",
      body: JSON.stringify({ count: inviteCount }),
    });
    if (data) {
      setInvites(data.voters);
      router.refresh();
    }
  }

  async function loadInvites() {
    const data = await call("load-invites", `/api/brackets/${bracket.id}/voters`);
    if (data) setInvites(data.voters);
  }

  const currentRound = bracket.rounds.find((r) => r.round === bracket.currentRound);
  const openCount = currentRound?.matchups.filter((m) => m.status === "OPEN").length ?? 0;

  return (
    <main>
      <PageHeader
        title={bracket.title}
        subtitle={`${bracket.size}-contender bracket · ${bracket.category}`}
      >
        <Link
          href={`/b/${bracket.id}`}
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/30"
        >
          Public view
        </Link>
      </PageHeader>

      {error ? (
        <p className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </p>
      ) : null}

      {bracket.status === "DRAFT" ? (
        <DraftStage
          bracket={bracket}
          hasApiKey={hasApiKey}
          busy={busy}
          onResearch={research}
          onStart={start}
        />
      ) : null}

      {bracket.status !== "DRAFT" ? (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                {bracket.status === "COMPLETE"
                  ? "Complete"
                  : `${currentRound?.name ?? ""} in progress`}
              </h2>
              <p className="mt-1 text-sm text-white/55">
                {bracket.status === "COMPLETE"
                  ? `${bracket.champion?.name ?? "A champion"} took it.`
                  : `${openCount} matchup${openCount === 1 ? "" : "s"} open · ${
                      bracket.voterCount
                    } invited voter${bracket.voterCount === 1 ? "" : "s"}`}
              </p>
            </div>
            {bracket.status === "ACTIVE" ? (
              <button
                onClick={closeRound}
                disabled={busy !== null}
                className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-ink transition hover:brightness-110 disabled:opacity-40"
              >
                {busy === "close" ? "Closing…" : `Close ${currentRound?.name ?? "round"}`}
              </button>
            ) : null}
          </div>
          {bracket.status === "ACTIVE" ? (
            <p className="mt-4 rounded-lg border border-line bg-ink/60 px-3 py-2 text-xs text-white/45">
              Closing tallies every open matchup, breaks any tie with that
              matchup&rsquo;s pre-committed coin flip, and advances the winners. A
              matchup with no votes at all is decided the same way.
            </p>
          ) : null}
        </Card>
      ) : null}

      <InvitePanel
        invites={invites}
        inviteCount={inviteCount}
        setInviteCount={setInviteCount}
        onCreate={createInvites}
        onLoad={loadInvites}
        busy={busy}
        voterCount={bracket.voterCount}
      />

      {currentRound && bracket.status === "ACTIVE" ? (
        <Card className="mt-6">
          <h2 className="mb-4 text-lg font-semibold">
            {currentRound.name} — live tallies
          </h2>
          <div className="space-y-2">
            {currentRound.matchups.map((matchup) => (
              <MatchupRow key={matchup.id} matchup={matchup} showTally />
            ))}
          </div>
        </Card>
      ) : null}
    </main>
  );
}

function DraftStage({
  bracket,
  hasApiKey,
  busy,
  onResearch,
  onStart,
}: {
  bracket: BracketView;
  hasApiKey: boolean;
  busy: string | null;
  onResearch: () => void;
  onStart: () => void;
}) {
  const ready = bracket.candidates.length > bracket.size / 2;
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Seed the field</h2>
          <p className="mt-1 max-w-xl text-sm text-white/55">
            Claude researches “{bracket.category}”, ranks the contenders by how
            likely they are to win a popular vote, and seeds them so the favorites
            open against the weakest of the field.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onResearch}
            disabled={busy !== null || !hasApiKey}
            className="rounded-lg border border-accent px-4 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent/10 disabled:opacity-40"
          >
            {busy === "research"
              ? "Researching…"
              : bracket.candidates.length
                ? "Re-run research"
                : "Research and seed"}
          </button>
          <button
            onClick={onStart}
            disabled={busy !== null || !ready}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-40"
          >
            {busy === "start" ? "Starting…" : "Lock in and start"}
          </button>
        </div>
      </div>

      {!hasApiKey ? (
        <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Set <code className="font-mono">ANTHROPIC_API_KEY</code> in your
          environment to research candidates automatically.
        </p>
      ) : null}

      {bracket.candidates.length ? (
        <>
          <p className="mt-5 text-xs uppercase tracking-widest text-white/40">
            {bracket.candidates.length} seeded
            {!ready
              ? ` — need more than ${bracket.size / 2} for a ${bracket.size} bracket`
              : bracket.candidates.length < bracket.size
                ? ` — the top ${bracket.size - bracket.candidates.length} seed(s) will get a bye`
                : ""}
          </p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {bracket.candidates.map((candidate) => (
              <CandidateCard key={candidate.id} candidate={candidate} />
            ))}
          </ol>
        </>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-white/40">
          No candidates yet. Run the research to fill the bracket.
        </p>
      )}
    </Card>
  );
}

function CandidateCard({ candidate }: { candidate: CandidateView }) {
  return (
    <li className="rounded-lg border border-line bg-ink/50 p-3">
      <div className="flex items-start gap-2">
        <SeedChip seed={candidate.seed} />
        <div className="min-w-0">
          <p className="font-medium">{candidate.name}</p>
          {candidate.blurb ? (
            <p className="mt-0.5 text-sm text-white/50">{candidate.blurb}</p>
          ) : null}
          {candidate.rationale ? (
            <p className="mt-1.5 text-xs text-white/35">{candidate.rationale}</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function InvitePanel({
  invites,
  inviteCount,
  setInviteCount,
  onCreate,
  onLoad,
  busy,
  voterCount,
}: {
  invites: Invite[] | null;
  inviteCount: number;
  setInviteCount: (n: number) => void;
  onCreate: () => void;
  onLoad: () => void;
  busy: string | null;
  voterCount: number;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Invite voters</h2>
          <p className="mt-1 text-sm text-white/55">
            Each link is one person&rsquo;s ballot. Send them out however you like —
            they can vote without making an account.{" "}
            {voterCount > 0 ? `${voterCount} issued so far.` : ""}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-white/50">How many</span>
            <input
              type="number"
              min={1}
              max={500}
              value={inviteCount}
              onChange={(event) => setInviteCount(Number(event.target.value))}
              className="w-24 rounded-lg border border-line bg-ink px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <button
            onClick={onCreate}
            disabled={busy !== null}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-40"
          >
            {busy === "invite" ? "Creating…" : "Create links"}
          </button>
          {voterCount > 0 ? (
            <button
              onClick={onLoad}
              disabled={busy !== null}
              className="rounded-lg border border-line px-4 py-2.5 text-sm text-white/70 transition hover:border-white/30 disabled:opacity-40"
            >
              Show all
            </button>
          ) : null}
        </div>
      </div>

      {invites?.length ? (
        <div className="mt-5 space-y-2">
          <CopyAll invites={invites} />
          {invites.map((invite) => (
            <InviteRow key={invite.id} invite={invite} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function CopyAll({ invites }: { invites: Invite[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(
          invites.map((i) => `${i.label}: ${i.inviteUrl}`).join("\n"),
        );
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-lg border border-line px-3 py-1.5 text-xs text-white/60 transition hover:border-accent hover:text-accent"
    >
      {copied ? "Copied all links" : "Copy all links"}
    </button>
  );
}

function InviteRow({ invite }: { invite: Invite }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-ink/50 px-3 py-2">
      <span className="w-24 shrink-0 truncate text-sm text-white/60">{invite.label}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-white/40">
        {invite.inviteUrl}
      </code>
      {invite.claimed ? <Badge tone="done">opened</Badge> : null}
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(invite.inviteUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded border border-line px-2 py-1 text-xs text-white/60 transition hover:border-accent hover:text-accent"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
