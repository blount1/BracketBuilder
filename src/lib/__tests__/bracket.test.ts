import { describe, expect, it } from "vitest";
import {
  BRACKET_SIZES,
  firstRoundPairs,
  matchupsInRound,
  nextSlot,
  roundCount,
  roundName,
  seedOrder,
  smallestSizeFor,
  tally,
} from "../bracket";
import { commitFor, createFlip, flipWinner, verifyFlip } from "../coinflip";

describe("seedOrder", () => {
  it("produces the textbook orders", () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(seedOrder(16)).toEqual([
      1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11,
    ]);
  });

  it("uses every seed exactly once at every supported size", () => {
    for (const size of BRACKET_SIZES) {
      const order = seedOrder(size);
      expect(order).toHaveLength(size);
      expect([...new Set(order)].sort((a, b) => a - b)).toEqual(
        Array.from({ length: size }, (_, i) => i + 1),
      );
    }
  });

  it("pairs every opening matchup to sum to size + 1", () => {
    // This is the defining property of standard seeding: strongest meets weakest.
    for (const size of BRACKET_SIZES) {
      const order = seedOrder(size);
      for (let i = 0; i < size; i += 2) {
        expect(order[i] + order[i + 1]).toBe(size + 1);
      }
    }
  });

  it("keeps the top two seeds apart until the final", () => {
    for (const size of BRACKET_SIZES) {
      const order = seedOrder(size);
      // Seed 1 sits in the first half, seed 2 in the second half, so they can
      // only meet in the last round.
      expect(order.indexOf(1)).toBeLessThan(size / 2);
      expect(order.indexOf(2)).toBeGreaterThanOrEqual(size / 2);
    }
  });

  it("rejects sizes that are not powers of two", () => {
    expect(() => seedOrder(12)).toThrow(/power of two/);
    expect(() => seedOrder(0)).toThrow(/power of two/);
  });
});

describe("firstRoundPairs", () => {
  it("creates size/2 matchups for a full bracket", () => {
    const pairs = firstRoundPairs(16, 16);
    expect(pairs).toHaveLength(8);
    expect(pairs[0]).toEqual({ slot: 0, seedA: 1, seedB: 16 });
    expect(pairs.every((p) => p.seedB !== null)).toBe(true);
  });

  it("awards byes to the strongest seeds when the field is short", () => {
    const pairs = firstRoundPairs(16, 12); // seeds 13-16 are missing
    const byes = pairs.filter((p) => p.seedB === null).map((p) => p.seedA);
    expect(byes.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    // Everyone else still has a real opponent.
    for (const pair of pairs.filter((p) => p.seedB !== null)) {
      expect(pair.seedA + pair.seedB!).toBe(17);
    }
  });

  it("never leaves a matchup with nobody in it", () => {
    for (const size of BRACKET_SIZES) {
      for (let count = size / 2 + 1; count <= size; count++) {
        const pairs = firstRoundPairs(size, count);
        expect(pairs).toHaveLength(size / 2);
        const seeds = pairs.flatMap((p) => (p.seedB === null ? [p.seedA] : [p.seedA, p.seedB]));
        expect(seeds.sort((a, b) => a - b)).toEqual(
          Array.from({ length: count }, (_, i) => i + 1),
        );
      }
    }
  });

  it("refuses a field that cannot fill half the bracket", () => {
    expect(() => firstRoundPairs(16, 8)).toThrow(/too few/);
    expect(() => firstRoundPairs(16, 17)).toThrow(/do not fit/);
  });
});

describe("advancement", () => {
  it("feeds adjacent slots into the same parent", () => {
    expect(nextSlot(0)).toEqual({ slot: 0, side: "A" });
    expect(nextSlot(1)).toEqual({ slot: 0, side: "B" });
    expect(nextSlot(2)).toEqual({ slot: 1, side: "A" });
    expect(nextSlot(7)).toEqual({ slot: 3, side: "B" });
  });

  it("halves the field each round down to a single final", () => {
    expect(matchupsInRound(64, 1)).toBe(32);
    expect(matchupsInRound(64, roundCount(64))).toBe(1);
    expect(roundCount(128)).toBe(7);
  });

  it("names rounds from the final backwards", () => {
    expect(roundName(1, 16)).toBe("Round of 16");
    expect(roundName(2, 16)).toBe("Quarterfinals");
    expect(roundName(3, 16)).toBe("Semifinals");
    expect(roundName(4, 16)).toBe("Final");
    expect(roundName(1, 128)).toBe("Round of 128");
    expect(roundName(7, 128)).toBe("Final");
  });

  it("routes a full 16-bracket of chalk results to the top seed", () => {
    // Simulate every round with the better seed always winning.
    let alive = seedOrder(16);
    while (alive.length > 1) {
      const next: number[] = [];
      for (let i = 0; i < alive.length; i += 2) {
        next.push(Math.min(alive[i], alive[i + 1]));
      }
      alive = next;
    }
    expect(alive).toEqual([1]);
  });
});

describe("smallestSizeFor", () => {
  it("picks the tightest bracket that holds the field", () => {
    expect(smallestSizeFor(16)).toBe(16);
    expect(smallestSizeFor(12)).toBe(16);
    expect(smallestSizeFor(17)).toBe(32);
    expect(smallestSizeFor(128)).toBe(128);
  });

  it("rejects fields outside the supported range", () => {
    expect(() => smallestSizeFor(8)).toThrow(/9-128/);
    expect(() => smallestSizeFor(129)).toThrow(/9-128/);
  });
});

describe("tally", () => {
  it("reports a winner or a tie", () => {
    expect(tally(5, 3).outcome).toBe("A");
    expect(tally(3, 5).outcome).toBe("B");
    expect(tally(4, 4).outcome).toBe("tie");
    expect(tally(0, 0).outcome).toBe("tie");
  });
});

describe("coin flip", () => {
  it("is deterministic in the seed", () => {
    const { seed } = createFlip();
    expect(flipWinner(seed)).toBe(flipWinner(seed));
  });

  it("verifies a correctly revealed flip", () => {
    const { seed, commit } = createFlip();
    const winner = flipWinner(seed);
    expect(verifyFlip(seed, commit, winner).valid).toBe(true);
  });

  it("rejects a tampered winner or a seed that does not match the commit", () => {
    const { seed, commit } = createFlip();
    const winner = flipWinner(seed);
    const other = winner === "A" ? "B" : "A";
    expect(verifyFlip(seed, commit, other).winnerValid).toBe(false);
    expect(verifyFlip(createFlip().seed, commit, winner).commitValid).toBe(false);
  });

  it("does not leak the flip through the commit", () => {
    // The commit must not simply be the flip hash under another name.
    const { seed, commit } = createFlip();
    expect(commit).not.toBe(seed);
    expect(commitFor(seed)).toBe(commit);
  });

  it("splits roughly evenly over many seeds", () => {
    let a = 0;
    const runs = 4000;
    for (let i = 0; i < runs; i++) {
      if (flipWinner(createFlip().seed) === "A") a++;
    }
    // A fair flip over 4000 trials lands well inside these bounds; a broken
    // derivation (constant, or keyed off something non-random) would not.
    expect(a).toBeGreaterThan(runs * 0.45);
    expect(a).toBeLessThan(runs * 0.55);
  });
});
