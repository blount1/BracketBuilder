import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Auditable coin flip for tied matchups.
 *
 * A bare Math.random() at close time is indistinguishable from an admin who
 * re-rolled until they liked the answer. Instead this is a commit-reveal:
 *
 *   1. When the matchup is created - before a single vote exists - a random
 *      seed is generated and only its hash (the "commit") is stored publicly.
 *   2. If the round ends in a tie, the winner is derived from the seed by a
 *      fixed rule. Nobody can influence it at that point; it was fixed before
 *      voting opened.
 *   3. The seed is revealed once the matchup is decided, so anyone can recheck
 *      both that the seed matches the published commit and that the published
 *      winner is what the rule produces.
 *
 * Distinct domain prefixes keep the commit from leaking the flip bit.
 */

const COMMIT_DOMAIN = "bracketbuilder/commit/v1|";
const FLIP_DOMAIN = "bracketbuilder/flip/v1|";

const sha256 = (input: string) => createHash("sha256").update(input, "utf8").digest("hex");

export function createFlip(): { seed: string; commit: string } {
  const seed = randomBytes(32).toString("hex");
  return { seed, commit: commitFor(seed) };
}

export function commitFor(seed: string): string {
  return sha256(COMMIT_DOMAIN + seed);
}

/** The side a tie resolves to. Deterministic in the seed alone. */
export function flipWinner(seed: string): "A" | "B" {
  const digest = sha256(FLIP_DOMAIN + seed);
  // Low bit of the first byte: an even split over a uniformly random seed.
  return parseInt(digest.slice(0, 2), 16) % 2 === 0 ? "A" : "B";
}

/** Re-checks a revealed flip. Used by the verification panel in the UI. */
export function verifyFlip(
  seed: string,
  commit: string,
  claimedWinner: "A" | "B",
): { commitValid: boolean; winnerValid: boolean; valid: boolean } {
  const expected = Buffer.from(commitFor(seed), "hex");
  const actual = Buffer.from(commit, "hex");
  const commitValid =
    expected.length === actual.length && timingSafeEqual(expected, actual);
  const winnerValid = flipWinner(seed) === claimedWinner;
  return { commitValid, winnerValid, valid: commitValid && winnerValid };
}
