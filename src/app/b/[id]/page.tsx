import Link from "next/link";
import { notFound } from "next/navigation";
import { MatchupRow } from "@/components/MatchupRow";
import { Badge, Card, PageHeader } from "@/components/ui";
import { currentVoter, isAdmin } from "@/lib/auth";
import { loadBracket } from "@/lib/view";

type Params = { params: Promise<{ id: string }> };

/** Public read-only view of the whole tournament tree. */
export default async function BracketPage({ params }: Params) {
  const { id } = await params;
  const admin = await isAdmin(id);
  const bracket = await loadBracket(id, { includeTallies: admin });
  if (!bracket) notFound();
  const voter = await currentVoter(id);

  return (
    <main>
      <PageHeader
        title={bracket.title}
        subtitle={`${bracket.size}-contender bracket · ${bracket.category}`}
      >
        {voter ? (
          <Link
            href={`/b/${id}/vote`}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink"
          >
            Go vote
          </Link>
        ) : null}
        {admin ? (
          <Link
            href={`/b/${id}/admin`}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/30"
          >
            Admin
          </Link>
        ) : null}
      </PageHeader>

      {bracket.status === "DRAFT" ? (
        <Card>
          <p className="py-8 text-center text-white/50">
            This bracket hasn&rsquo;t started yet.
          </p>
        </Card>
      ) : null}

      {bracket.champion ? (
        <Card className="mb-8 border-accent/40 bg-accent/5 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-accent">Champion</p>
          <p className="mt-2 text-3xl font-bold">{bracket.champion.name}</p>
          {bracket.champion.blurb ? (
            <p className="mt-2 text-sm text-white/55">{bracket.champion.blurb}</p>
          ) : null}
          <p className="mt-3 text-xs text-white/40">
            Entered as the {ordinal(bracket.champion.seed)} seed
          </p>
        </Card>
      ) : null}

      {bracket.status !== "DRAFT" ? (
        <div className="bracket-scroll -mx-4 px-4 pb-4 sm:mx-0 sm:px-0">
          <div className="flex min-w-max items-stretch gap-4">
            {bracket.rounds.map((round) => (
              <div key={round.round} className="flex w-64 shrink-0 flex-col">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-sm font-semibold">{round.name}</h2>
                  {round.round === bracket.currentRound &&
                  bracket.status === "ACTIVE" ? (
                    <Badge tone="live">live</Badge>
                  ) : null}
                </div>
                {/*
                  Every column is the same height and spreads its matchups
                  evenly, so a matchup lands centred between the two it feeds
                  from - the usual bracket shape, without absolute positioning.
                */}
                <div className="flex flex-1 flex-col justify-around gap-2">
                  {round.matchups.map((matchup) => (
                    <MatchupRow key={matchup.id} matchup={matchup} showTally={admin} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}
