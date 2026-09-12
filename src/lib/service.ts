import { Prisma } from "@/generated/prisma/client";
import {
  firstRoundPairs,
  matchupsInRound,
  nextSlot,
  roundCount,
  tally,
} from "@/lib/bracket";
import { createFlip, flipWinner } from "@/lib/coinflip";
import { prisma } from "@/lib/prisma";

export class ServiceError extends Error {}

/**
 * Build the full tournament tree from a draft's candidates and open round 1.
 *
 * Every matchup in every round is created up front - empty ones for later
 * rounds - so each has a coin-flip commitment that predates any voting. Byes
 * are resolved immediately, before the first ballot is cast.
 */
export async function buildBracket(bracketId: string) {
  return prisma.$transaction(async (tx) => {
    const bracket = await tx.bracket.findUnique({
      where: { id: bracketId },
      include: { candidates: { orderBy: { seed: "asc" } } },
    });
    if (!bracket) throw new ServiceError("Bracket not found.");
    if (bracket.status !== "DRAFT") {
      throw new ServiceError("This bracket has already started.");
    }

    const candidates = bracket.candidates;
    if (candidates.length === 0) {
      throw new ServiceError("Add candidates before starting the bracket.");
    }
    // firstRoundPairs enforces the field-size rules and throws a message the
    // admin can act on.
    const pairs = firstRoundPairs(bracket.size, candidates.length);
    const bySeed = new Map(candidates.map((c) => [c.seed, c]));

    const rounds = roundCount(bracket.size);
    const data: Prisma.MatchupCreateManyInput[] = [];

    for (let round = 1; round <= rounds; round++) {
      for (let slot = 0; slot < matchupsInRound(bracket.size, round); slot++) {
        const flip = createFlip();
        const pair = round === 1 ? pairs[slot] : undefined;
        data.push({
          bracketId,
          round,
          slot,
          flipSeed: flip.seed,
          flipCommit: flip.commit,
          candidateAId: pair ? (bySeed.get(pair.seedA)?.id ?? null) : null,
          candidateBId:
            pair && pair.seedB !== null ? (bySeed.get(pair.seedB)?.id ?? null) : null,
          status: "PENDING",
        });
      }
    }

    await tx.matchup.createMany({ data });
    await tx.bracket.update({
      where: { id: bracketId },
      data: { status: "ACTIVE", currentRound: 1 },
    });

    await resolveByesAndOpen(tx, bracketId, 1);
    return tx.bracket.findUniqueOrThrow({ where: { id: bracketId } });
  });
}

type Tx = Prisma.TransactionClient;

/**
 * Decide any matchup in `round` that has only one side (a bye), advance those
 * winners, and open the rest for voting.
 */
async function resolveByesAndOpen(tx: Tx, bracketId: string, round: number) {
  const matchups = await tx.matchup.findMany({
    where: { bracketId, round, status: "PENDING" },
    orderBy: { slot: "asc" },
  });

  for (const matchup of matchups) {
    const a = matchup.candidateAId;
    const b = matchup.candidateBId;
    if (a && b) {
      await tx.matchup.update({
        where: { id: matchup.id },
        data: { status: "OPEN", openedAt: new Date() },
      });
    } else if (a || b) {
      // A bye: the lone entrant advances without a vote.
      const winnerId = (a ?? b)!;
      await tx.matchup.update({
        where: { id: matchup.id },
        data: { status: "DECIDED", winnerId, closedAt: new Date() },
      });
      await advance(tx, bracketId, round, matchup.slot, winnerId);
    }
  }
}

/** Write a winner into its parent slot in the next round. */
async function advance(
  tx: Tx,
  bracketId: string,
  round: number,
  slot: number,
  winnerId: string,
) {
  const parent = nextSlot(slot);
  const updated = await tx.matchup.updateMany({
    where: { bracketId, round: round + 1, slot: parent.slot },
    data: parent.side === "A" ? { candidateAId: winnerId } : { candidateBId: winnerId },
  });
  // updated.count is 0 for the final, which has no parent - that's expected.
  return updated.count;
}

export interface DecidedMatchup {
  matchupId: string;
  slot: number;
  winnerId: string;
  votesA: number;
  votesB: number;
  decidedByFlip: boolean;
}

export interface CloseRoundResult {
  round: number;
  decided: DecidedMatchup[];
  bracketComplete: boolean;
  championId: string | null;
  nextRound: number | null;
}

/**
 * Close the current round: tally every open matchup, break ties with the
 * pre-committed coin flip, advance the winners, then open the next round (or
 * crown a champion).
 */
export async function closeRound(
  bracketId: string,
  round: number,
): Promise<CloseRoundResult> {
  return prisma.$transaction(async (tx) => {
    const bracket = await tx.bracket.findUnique({ where: { id: bracketId } });
    if (!bracket) throw new ServiceError("Bracket not found.");
    if (bracket.status !== "ACTIVE") {
      throw new ServiceError("This bracket is not currently running.");
    }
    if (bracket.currentRound !== round) {
      throw new ServiceError(
        `Round ${round} is not the round in progress (currently round ${bracket.currentRound}).`,
      );
    }

    const open = await tx.matchup.findMany({
      where: { bracketId, round, status: "OPEN" },
      orderBy: { slot: "asc" },
    });

    const decided: DecidedMatchup[] = [];

    for (const matchup of open) {
      if (!matchup.candidateAId || !matchup.candidateBId) {
        throw new ServiceError(
          `Matchup ${round}/${matchup.slot} is missing a side and cannot be closed.`,
        );
      }
      const counts = await tx.vote.groupBy({
        by: ["candidateId"],
        where: { matchupId: matchup.id },
        _count: { _all: true },
      });
      const countFor = (candidateId: string) =>
        counts.find((c) => c.candidateId === candidateId)?._count._all ?? 0;

      const votesA = countFor(matchup.candidateAId);
      const votesB = countFor(matchup.candidateBId);
      const result = tally(votesA, votesB);

      // A tie - including nobody voting at all - falls to the flip that was
      // committed to when this matchup was created.
      const byFlip = result.outcome === "tie";
      const side = byFlip ? flipWinner(matchup.flipSeed) : result.outcome;
      const winnerId = side === "A" ? matchup.candidateAId : matchup.candidateBId;

      await tx.matchup.update({
        where: { id: matchup.id },
        data: {
          status: "DECIDED",
          winnerId,
          decidedByFlip: byFlip,
          closedAt: new Date(),
        },
      });
      await advance(tx, bracketId, round, matchup.slot, winnerId);

      decided.push({
        matchupId: matchup.id,
        slot: matchup.slot,
        winnerId,
        votesA,
        votesB,
        decidedByFlip: byFlip,
      });
    }

    const isFinalRound = round >= roundCount(bracket.size);
    if (isFinalRound) {
      const final = await tx.matchup.findFirstOrThrow({
        where: { bracketId, round },
      });
      await tx.bracket.update({
        where: { id: bracketId },
        data: { status: "COMPLETE" },
      });
      return {
        round,
        decided,
        bracketComplete: true,
        championId: final.winnerId,
        nextRound: null,
      };
    }

    await tx.bracket.update({
      where: { id: bracketId },
      data: { currentRound: round + 1 },
    });
    await resolveByesAndOpen(tx, bracketId, round + 1);

    return {
      round,
      decided,
      bracketComplete: false,
      championId: null,
      nextRound: round + 1,
    };
  });
}

/**
 * Record one vote. The unique index on (matchupId, voterId) is what actually
 * enforces one-person-one-vote; this upsert just makes changing your mind while
 * the round is open behave sensibly.
 */
export async function castVote(
  bracketId: string,
  voterId: string,
  matchupId: string,
  candidateId: string,
) {
  const matchup = await prisma.matchup.findUnique({ where: { id: matchupId } });
  if (!matchup || matchup.bracketId !== bracketId) {
    throw new ServiceError("That matchup is not part of this bracket.");
  }
  if (matchup.status !== "OPEN") {
    throw new ServiceError("Voting on that matchup is closed.");
  }
  if (candidateId !== matchup.candidateAId && candidateId !== matchup.candidateBId) {
    throw new ServiceError("That choice is not in this matchup.");
  }

  return prisma.vote.upsert({
    where: { matchupId_voterId: { matchupId, voterId } },
    create: { matchupId, voterId, candidateId },
    update: { candidateId },
  });
}
