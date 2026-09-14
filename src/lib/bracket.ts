/**
 * Pure bracket math: seeding, pairing, byes and advancement.
 *
 * Nothing in here touches the database or the network, which keeps the part
 * that has to be exactly right independently testable.
 */

export const BRACKET_SIZES = [16, 32, 64, 128] as const;
export type BracketSize = (typeof BRACKET_SIZES)[number];

export function isBracketSize(n: number): n is BracketSize {
  return (BRACKET_SIZES as readonly number[]).includes(n);
}

/** Number of rounds a bracket of `size` entrants takes. 16 -> 4, 128 -> 7. */
export function roundCount(size: number): number {
  return Math.log2(size);
}

/**
 * Human name for a round, counting back from the final.
 * `round` is 1-indexed: round 1 is the opening round.
 */
export function roundName(round: number, size: number): string {
  const remaining = size / 2 ** (round - 1);
  switch (remaining) {
    case 2:
      return "Final";
    case 4:
      return "Semifinals";
    case 8:
      return "Quarterfinals";
    default:
      return `Round of ${remaining}`;
  }
}

/**
 * Standard bracket seeding order.
 *
 * Returns the seeds in slot order, so that reading the array in pairs gives the
 * opening-round matchups. The recursive construction is what guarantees the
 * property the user cares about: the top seed always faces the weakest
 * remaining seed, and the two best seeds cannot meet before the final.
 *
 *   seedOrder(4)  -> [1, 4, 2, 3]              (1v4, 2v3)
 *   seedOrder(8)  -> [1, 8, 4, 5, 2, 7, 3, 6]  (1v8, 4v5, 2v7, 3v6)
 */
export function seedOrder(size: number): number[] {
  if (size < 1 || (size & (size - 1)) !== 0) {
    throw new Error(`seedOrder requires a power of two, got ${size}`);
  }
  let order = [1];
  while (order.length < size) {
    const round = order.length * 2;
    const next: number[] = [];
    for (const seed of order) {
      next.push(seed, round + 1 - seed);
    }
    order = next;
  }
  return order;
}

export interface SeededPair {
  slot: number;
  seedA: number;
  /** null when the bracket is not full and this slot is a bye. */
  seedB: number | null;
}

/**
 * Opening-round pairings for a bracket of `size` slots filled by
 * `candidateCount` real entrants.
 *
 * When there are fewer entrants than slots, the missing seeds are the weakest
 * ones, which means the byes fall to the strongest entrants - the same
 * convention used by every tournament that awards byes on merit.
 */
export function firstRoundPairs(size: number, candidateCount: number): SeededPair[] {
  if (candidateCount > size) {
    throw new Error(`${candidateCount} candidates do not fit in a ${size}-slot bracket`);
  }
  // At or below half capacity every opening matchup would be a bye, which is
  // really just a smaller bracket wearing the wrong label. Reject it here so a
  // short research result surfaces as an error instead of a round nobody votes in.
  if (candidateCount <= size / 2) {
    throw new Error(
      `${candidateCount} candidates is too few for a ${size} bracket; use a ${size / 2} bracket instead`,
    );
  }
  const order = seedOrder(size);
  const pairs: SeededPair[] = [];
  for (let slot = 0; slot < size / 2; slot++) {
    const seedA = order[slot * 2];
    const seedB = order[slot * 2 + 1];
    // A seed higher than the entrant count has nobody in it.
    const aLive = seedA <= candidateCount;
    const bLive = seedB <= candidateCount;
    if (!aLive && !bLive) {
      throw new Error(
        `slot ${slot} would be empty on both sides; ${candidateCount} candidates is too few for a ${size} bracket`,
      );
    }
    pairs.push(
      aLive
        ? { slot, seedA, seedB: bLive ? seedB : null }
        : // Only B is live - put it on side A so byes always read "A advances".
          { slot, seedA: seedB, seedB: null },
    );
  }
  return pairs;
}

/**
 * The smallest legal bracket size for a given number of candidates, so a
 * category that only yields e.g. 22 good answers still produces a clean
 * 32-bracket with 10 byes rather than an error.
 */
export function smallestSizeFor(candidateCount: number): BracketSize {
  const size = BRACKET_SIZES.find((s) => candidateCount > s / 2 && candidateCount <= s);
  if (!size) {
    throw new Error(
      `${candidateCount} candidates cannot fill any supported bracket size (need 9-128)`,
    );
  }
  return size;
}

/** Where the winner of (round, slot) goes next. */
export function nextSlot(slot: number): { slot: number; side: "A" | "B" } {
  return { slot: Math.floor(slot / 2), side: slot % 2 === 0 ? "A" : "B" };
}

/** Matchups in a given round. Round 1 has size/2, and it halves from there. */
export function matchupsInRound(size: number, round: number): number {
  return size / 2 ** round;
}

export interface TallyResult {
  votesA: number;
  votesB: number;
  /** "A" | "B" when the votes decide it, "tie" when a coin flip is needed. */
  outcome: "A" | "B" | "tie";
}

export function tally(votesA: number, votesB: number): TallyResult {
  const outcome = votesA > votesB ? "A" : votesB > votesA ? "B" : "tie";
  return { votesA, votesB, outcome };
}
