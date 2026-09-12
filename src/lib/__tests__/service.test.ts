import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { roundCount, seedOrder } from "../bracket";
import { flipWinner, verifyFlip } from "../coinflip";
import { prisma } from "../prisma";
import { buildBracket, castVote, closeRound, ServiceError } from "../service";
import { newToken } from "../tokens";

/**
 * These run against a real Postgres (DATABASE_URL), because the parts most
 * worth proving - the unique vote index, transactional round closing, winners
 * landing in the right parent slot - only exist in the database.
 */

async function makeBracket(size: number, candidateCount = size) {
  const bracket = await prisma.bracket.create({
    data: {
      title: `Test ${size}`,
      category: "test category",
      size,
      adminToken: newToken(),
      candidates: {
        create: Array.from({ length: candidateCount }, (_, i) => ({
          name: `Seed ${i + 1}`,
          seed: i + 1,
          blurb: `blurb ${i + 1}`,
        })),
      },
    },
    include: { candidates: true },
  });
  return bracket;
}

async function makeVoters(bracketId: string, n: number) {
  const voters = [];
  for (let i = 0; i < n; i++) {
    voters.push(
      await prisma.voter.create({
        data: { bracketId, label: `Voter ${i + 1}`, token: newToken() },
      }),
    );
  }
  return voters;
}

const seedOf = async (candidateId: string) =>
  (await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } })).seed;

/** Vote every open matchup for whichever side has the better (lower) seed. */
async function voteChalk(bracketId: string, round: number, voterIds: string[]) {
  const open = await prisma.matchup.findMany({
    where: { bracketId, round, status: "OPEN" },
    include: { candidateA: true, candidateB: true },
  });
  for (const m of open) {
    const better =
      m.candidateA!.seed < m.candidateB!.seed ? m.candidateA! : m.candidateB!;
    for (const voterId of voterIds) {
      await castVote(bracketId, voterId, m.id, better.id);
    }
  }
  return open.length;
}

beforeEach(async () => {
  // Cascades clear candidates, matchups, voters and votes.
  await prisma.bracket.deleteMany({});
});

afterAll(async () => {
  await prisma.bracket.deleteMany({});
  await prisma.$disconnect();
});

describe("buildBracket", () => {
  it("creates every matchup in every round with a flip commitment", async () => {
    const bracket = await makeBracket(16);
    await buildBracket(bracket.id);

    const matchups = await prisma.matchup.findMany({ where: { bracketId: bracket.id } });
    expect(matchups).toHaveLength(8 + 4 + 2 + 1);
    // Commitments exist before anyone votes, which is what makes a later tie
    // break verifiable.
    expect(matchups.every((m) => m.flipSeed.length === 64 && m.flipCommit.length === 64)).toBe(
      true,
    );
    expect(new Set(matchups.map((m) => m.flipSeed)).size).toBe(matchups.length);
  });

  it("pairs the opening round strongest against weakest", async () => {
    const bracket = await makeBracket(16);
    await buildBracket(bracket.id);
    const round1 = await prisma.matchup.findMany({
      where: { bracketId: bracket.id, round: 1 },
      include: { candidateA: true, candidateB: true },
      orderBy: { slot: "asc" },
    });
    expect(round1.map((m) => [m.candidateA!.seed, m.candidateB!.seed])).toEqual(
      Array.from({ length: 8 }, (_, i) => [seedOrder(16)[i * 2], seedOrder(16)[i * 2 + 1]]),
    );
    expect(round1.every((m) => m.status === "OPEN")).toBe(true);
  });

  it("refuses to start twice", async () => {
    const bracket = await makeBracket(16);
    await buildBracket(bracket.id);
    await expect(buildBracket(bracket.id)).rejects.toThrow(ServiceError);
  });
});

describe("byes", () => {
  it("advances short-field byes without a vote and opens the rest", async () => {
    const bracket = await makeBracket(16, 12); // seeds 1-4 get byes
    await buildBracket(bracket.id);

    const round1 = await prisma.matchup.findMany({
      where: { bracketId: bracket.id, round: 1 },
      include: { candidateA: true },
    });
    const byes = round1.filter((m) => m.status === "DECIDED");
    expect(byes).toHaveLength(4);
    expect((await Promise.all(byes.map((m) => seedOf(m.winnerId!)))).sort((a, b) => a - b)).toEqual(
      [1, 2, 3, 4],
    );
    expect(round1.filter((m) => m.status === "OPEN")).toHaveLength(4);

    // The bye winners are already sitting in their round-2 slots.
    const round2 = await prisma.matchup.findMany({
      where: { bracketId: bracket.id, round: 2 },
    });
    const placed = round2.flatMap((m) => [m.candidateAId, m.candidateBId]).filter(Boolean);
    expect(placed).toHaveLength(4);
  });
});

describe("a full tournament", () => {
  it("crowns the top seed when every vote goes to the better seed", async () => {
    const bracket = await makeBracket(16);
    await buildBracket(bracket.id);
    const voters = await makeVoters(bracket.id, 5);
    const voterIds = voters.map((v) => v.id);

    for (let round = 1; round <= roundCount(16); round++) {
      const opened = await voteChalk(bracket.id, round, voterIds);
      expect(opened).toBe(16 / 2 ** round);
      const result = await closeRound(bracket.id, round);
      expect(result.decided.every((d) => !d.decidedByFlip)).toBe(true);
      if (round < roundCount(16)) {
        expect(result.bracketComplete).toBe(false);
        expect(result.nextRound).toBe(round + 1);
      } else {
        expect(result.bracketComplete).toBe(true);
        expect(await seedOf(result.championId!)).toBe(1);
      }
    }

    const finished = await prisma.bracket.findUniqueOrThrow({ where: { id: bracket.id } });
    expect(finished.status).toBe("COMPLETE");
  });

  it("lets an underdog through when the votes say so", async () => {
    const bracket = await makeBracket(16);
    await buildBracket(bracket.id);
    const [voter] = await makeVoters(bracket.id, 1);

    // Seed 16 beats seed 1 in the opening round.
    const upset = await prisma.matchup.findFirstOrThrow({
      where: { bracketId: bracket.id, round: 1, slot: 0 },
      include: { candidateA: true, candidateB: true },
    });
    await castVote(bracket.id, voter.id, upset.id, upset.candidateBId!);
    for (const m of await prisma.matchup.findMany({
      where: { bracketId: bracket.id, round: 1, status: "OPEN", slot: { not: 0 } },
      include: { candidateA: true, candidateB: true },
    })) {
      await castVote(bracket.id, voter.id, m.id, m.candidateA!.id);
    }

    await closeRound(bracket.id, 1);
    const r2 = await prisma.matchup.findFirstOrThrow({
      where: { bracketId: bracket.id, round: 2, slot: 0 },
    });
    expect(await seedOf(r2.candidateAId!)).toBe(16);
  });
});

describe("ties", () => {
  it("breaks an even split with the committed coin flip", async () => {
    const bracket = await makeBracket(16);
    await buildBracket(bracket.id);
    const voters = await makeVoters(bracket.id, 2); // an even electorate

    const matchups = await prisma.matchup.findMany({
      where: { bracketId: bracket.id, round: 1, status: "OPEN" },
      orderBy: { slot: "asc" },
    });
    // Every matchup splits 1-1.
    for (const m of matchups) {
      await castVote(bracket.id, voters[0].id, m.id, m.candidateAId!);
      await castVote(bracket.id, voters[1].id, m.id, m.candidateBId!);
    }

    const result = await closeRound(bracket.id, 1);
    expect(result.decided).toHaveLength(8);
    expect(result.decided.every((d) => d.decidedByFlip)).toBe(true);
    expect(result.decided.every((d) => d.votesA === 1 && d.votesB === 1)).toBe(true);

    // Each winner is the side the pre-committed seed dictated, and the reveal
    // verifies against the commitment published before voting.
    for (const decision of result.decided) {
      const m = await prisma.matchup.findUniqueOrThrow({ where: { id: decision.matchupId } });
      const side = flipWinner(m.flipSeed);
      expect(m.winnerId).toBe(side === "A" ? m.candidateAId : m.candidateBId);
      expect(verifyFlip(m.flipSeed, m.flipCommit, side).valid).toBe(true);
    }
  });

  it("flips a matchup nobody voted in rather than stalling", async () => {
    const bracket = await makeBracket(16);
    await buildBracket(bracket.id);
    const result = await closeRound(bracket.id, 1);
    expect(result.decided).toHaveLength(8);
    expect(result.decided.every((d) => d.decidedByFlip && d.votesA === 0)).toBe(true);
  });
});

describe("vote integrity", () => {
  it("keeps one vote per person per matchup, replacing rather than stacking", async () => {
    const bracket = await makeBracket(16);
    await buildBracket(bracket.id);
    const [voter] = await makeVoters(bracket.id, 1);
    const m = await prisma.matchup.findFirstOrThrow({
      where: { bracketId: bracket.id, round: 1, slot: 0 },
    });

    await castVote(bracket.id, voter.id, m.id, m.candidateAId!);
    await castVote(bracket.id, voter.id, m.id, m.candidateBId!);
    await castVote(bracket.id, voter.id, m.id, m.candidateBId!);

    const votes = await prisma.vote.findMany({ where: { matchupId: m.id } });
    expect(votes).toHaveLength(1);
    expect(votes[0].candidateId).toBe(m.candidateBId);
  });

  it("rejects a vote for someone who is not in the matchup", async () => {
    const bracket = await makeBracket(16);
    await buildBracket(bracket.id);
    const [voter] = await makeVoters(bracket.id, 1);
    const [m, other] = await prisma.matchup.findMany({
      where: { bracketId: bracket.id, round: 1 },
      orderBy: { slot: "asc" },
      take: 2,
    });
    await expect(
      castVote(bracket.id, voter.id, m.id, other.candidateAId!),
    ).rejects.toThrow(/not in this matchup/);
  });

  it("rejects votes on a closed matchup", async () => {
    const bracket = await makeBracket(16);
    await buildBracket(bracket.id);
    const [voter] = await makeVoters(bracket.id, 1);
    const m = await prisma.matchup.findFirstOrThrow({
      where: { bracketId: bracket.id, round: 1, slot: 0 },
    });
    await closeRound(bracket.id, 1);
    await expect(castVote(bracket.id, voter.id, m.id, m.candidateAId!)).rejects.toThrow(
      /closed/,
    );
  });

  it("refuses to close a round that is not in progress", async () => {
    const bracket = await makeBracket(16);
    await buildBracket(bracket.id);
    await expect(closeRound(bracket.id, 2)).rejects.toThrow(/not the round in progress/);
  });
});

describe("larger brackets", () => {
  it("runs a 64 bracket end to end", async () => {
    const bracket = await makeBracket(64);
    await buildBracket(bracket.id);
    const voters = await makeVoters(bracket.id, 3);
    const voterIds = voters.map((v) => v.id);

    let champion: string | null = null;
    for (let round = 1; round <= roundCount(64); round++) {
      await voteChalk(bracket.id, round, voterIds);
      const result = await closeRound(bracket.id, round);
      champion = result.championId ?? champion;
    }
    expect(await seedOf(champion!)).toBe(1);
  }, 60_000);
});
