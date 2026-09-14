import Link from "next/link";
import { notFound } from "next/navigation";
import { Ballot } from "@/components/Ballot";
import { Card, PageHeader } from "@/components/ui";
import { currentVoter } from "@/lib/auth";
import { roundName } from "@/lib/bracket";
import { loadBallot, loadBracket } from "@/lib/view";

type Params = { params: Promise<{ id: string }> };

export default async function VotePage({ params }: Params) {
  const { id } = await params;
  const bracket = await loadBracket(id, { includeTallies: false });
  if (!bracket) notFound();

  const voter = await currentVoter(id);
  if (!voter) {
    return (
      <main className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-2xl font-bold">You need an invite</h1>
        <p className="mt-3 text-white/60">
          Voting on “{bracket.title}” is limited to invited people. Open the
          personal link you were sent and you&rsquo;ll be able to vote.
        </p>
        <Link
          href={`/b/${id}`}
          className="mt-6 inline-block rounded-lg border border-line px-5 py-2.5 font-medium text-white/70"
        >
          Follow the bracket instead
        </Link>
      </main>
    );
  }

  const matchups = await loadBallot(id, voter.id);

  return (
    <main>
      <PageHeader
        title={bracket.title}
        subtitle={`Voting as ${voter.label} · ${
          bracket.status === "ACTIVE"
            ? roundName(bracket.currentRound, bracket.size)
            : bracket.status === "COMPLETE"
              ? "complete"
              : "not started yet"
        }`}
      >
        <Link
          href={`/b/${id}`}
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/30"
        >
          See the bracket
        </Link>
      </PageHeader>

      {matchups.length === 0 ? (
        <Card>
          <p className="py-10 text-center text-white/50">
            {bracket.status === "COMPLETE"
              ? `All done — ${bracket.champion?.name ?? "a champion"} won it.`
              : bracket.status === "DRAFT"
                ? "This bracket hasn't started. Check back once the first round opens."
                : "Nothing to vote on right now. The next round will appear here when it opens."}
          </p>
        </Card>
      ) : (
        <Ballot bracketId={id} matchups={matchups} />
      )}
    </main>
  );
}
