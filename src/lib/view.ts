import { roundCount, roundName } from "@/lib/bracket";
import { flipWinner } from "@/lib/coinflip";
import { prisma } from "@/lib/prisma";

/**
 * Read model for the pages. One query set, shaped into plain serializable
 * objects so server components can hand it straight to client components.
 *
 * `includeTallies` is the privacy switch: while a matchup is open only the
 * admin sees running vote counts, so voters aren't nudged by a scoreboard.
 * Once a matchup is decided the counts are public - the result should be
 * checkable by everyone who voted.
 */

export interface CandidateView {
  id: string;
  name: string;
  seed: number;
  blurb: string | null;
  rationale: string | null;
}

export interface MatchupView {
  id: string;
  round: number;
  slot: number;
  status: "PENDING" | "OPEN" | "DECIDED";
  candidateA: CandidateView | null;
  candidateB: CandidateView | null;
  winnerId: string | null;
  decidedByFlip: boolean;
  /** Revealed only once the matchup is decided. */
  flipSeed: string | null;
  flipCommit: string;
  votesA: number | null;
  votesB: number | null;
  isBye: boolean;
}

export interface BracketView {
  id: string;
  title: string;
  category: string;
  size: number;
  status: "DRAFT" | "ACTIVE" | "COMPLETE";
  currentRound: number;
  totalRounds: number;
  candidates: CandidateView[];
  rounds: { round: number; name: string; matchups: MatchupView[] }[];
  voterCount: number;
  champion: CandidateView | null;
}

export async function loadBracket(
  id: string,
  { includeTallies }: { includeTallies: boolean },
): Promise<BracketView | null> {
  const bracket = await prisma.bracket.findUnique({
    where: { id },
    include: {
      candidates: { orderBy: { seed: "asc" } },
      matchups: {
        orderBy: [{ round: "asc" }, { slot: "asc" }],
        include: { candidateA: true, candidateB: true },
      },
      _count: { select: { voters: true } },
    },
  });
  if (!bracket) return null;

  const counts = await prisma.vote.groupBy({
    by: ["matchupId", "candidateId"],
    where: { matchup: { bracketId: id } },
    _count: { _all: true },
  });
  const countFor = (matchupId: string, candidateId: string | null) =>
    candidateId
      ? (counts.find((c) => c.matchupId === matchupId && c.candidateId === candidateId)
          ?._count._all ?? 0)
      : 0;

  const toCandidate = (c: (typeof bracket.candidates)[number] | null): CandidateView | null =>
    c
      ? { id: c.id, name: c.name, seed: c.seed, blurb: c.blurb, rationale: c.rationale }
      : null;

  const totalRounds = bracket.size > 0 ? roundCount(bracket.size) : 0;

  const matchups: MatchupView[] = bracket.matchups.map((m) => {
    const decided = m.status === "DECIDED";
    const showTally = includeTallies || decided;
    const isBye = decided && Boolean(m.candidateAId) !== Boolean(m.candidateBId);
    return {
      id: m.id,
      round: m.round,
      slot: m.slot,
      status: m.status,
      candidateA: toCandidate(m.candidateA),
      candidateB: toCandidate(m.candidateB),
      winnerId: m.winnerId,
      decidedByFlip: m.decidedByFlip,
      // Revealing the seed early would give away a pending tie-break.
      flipSeed: decided ? m.flipSeed : null,
      flipCommit: m.flipCommit,
      votesA: showTally ? countFor(m.id, m.candidateAId) : null,
      votesB: showTally ? countFor(m.id, m.candidateBId) : null,
      isBye,
    };
  });

  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1).map((round) => ({
    round,
    name: roundName(round, bracket.size),
    matchups: matchups.filter((m) => m.round === round),
  }));

  const finalMatchup = matchups.find((m) => m.round === totalRounds);
  const champion =
    bracket.status === "COMPLETE" && finalMatchup?.winnerId
      ? (bracket.candidates
          .map(toCandidate)
          .find((c) => c?.id === finalMatchup.winnerId) ?? null)
      : null;

  return {
    id: bracket.id,
    title: bracket.title,
    category: bracket.category,
    size: bracket.size,
    status: bracket.status,
    currentRound: bracket.currentRound,
    totalRounds,
    candidates: bracket.candidates.map((c) => toCandidate(c)!),
    rounds,
    voterCount: bracket._count.voters,
    champion,
  };
}

/** The side a revealed flip chose, for the verification panel. */
export function revealedFlipSide(seed: string | null): "A" | "B" | null {
  return seed ? flipWinner(seed) : null;
}

/** Open matchups a given voter can still act on, with their current pick. */
export async function loadBallot(bracketId: string, voterId: string) {
  const matchups = await prisma.matchup.findMany({
    where: { bracketId, status: "OPEN" },
    orderBy: { slot: "asc" },
    include: { candidateA: true, candidateB: true },
  });
  const votes = await prisma.vote.findMany({
    where: { voterId, matchupId: { in: matchups.map((m) => m.id) } },
  });
  return matchups.map((m) => ({
    id: m.id,
    round: m.round,
    slot: m.slot,
    candidateA: {
      id: m.candidateA!.id,
      name: m.candidateA!.name,
      seed: m.candidateA!.seed,
      blurb: m.candidateA!.blurb,
    },
    candidateB: {
      id: m.candidateB!.id,
      name: m.candidateB!.name,
      seed: m.candidateB!.seed,
      blurb: m.candidateB!.blurb,
    },
    myVote: votes.find((v) => v.matchupId === m.id)?.candidateId ?? null,
  }));
}

export type BallotMatchup = Awaited<ReturnType<typeof loadBallot>>[number];
