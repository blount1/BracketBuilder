import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * There are no accounts. Two kinds of secret link grant access:
 *
 *   - the admin link, which carries the bracket's adminToken
 *   - an invite link, which carries one voter's token
 *
 * Following either link stores the token in an httpOnly cookie scoped to that
 * bracket, so a voter stays signed in on that device without the secret sitting
 * in the URL bar for the rest of the session.
 */

export const adminCookie = (bracketId: string) => `bb_admin_${bracketId}`;
export const voterCookie = (bracketId: string) => `bb_voter_${bracketId}`;

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 90, // a bracket can run for a while
} as const;

export async function setAdminCookie(bracketId: string, token: string) {
  (await cookies()).set(adminCookie(bracketId), token, COOKIE_OPTIONS);
}

export async function setVoterCookie(bracketId: string, token: string) {
  (await cookies()).set(voterCookie(bracketId), token, COOKIE_OPTIONS);
}

/**
 * True when the caller holds this bracket's admin token, from either the cookie
 * or an explicit `token` (the first visit to an admin link, before the cookie
 * has been planted).
 */
export async function isAdmin(bracketId: string, explicitToken?: string | null) {
  const bracket = await prisma.bracket.findUnique({
    where: { id: bracketId },
    select: { adminToken: true },
  });
  if (!bracket) return false;
  const cookieToken = (await cookies()).get(adminCookie(bracketId))?.value;
  const supplied = explicitToken ?? cookieToken;
  return Boolean(supplied) && supplied === bracket.adminToken;
}

export async function requireAdmin(bracketId: string, explicitToken?: string | null) {
  if (!(await isAdmin(bracketId, explicitToken))) {
    throw new AuthError("You need this bracket's admin link to do that.");
  }
}

/** The voter this request belongs to, or null if the caller wasn't invited. */
export async function currentVoter(bracketId: string) {
  const token = (await cookies()).get(voterCookie(bracketId))?.value;
  if (!token) return null;
  const voter = await prisma.voter.findUnique({ where: { token } });
  // A token is only good for the bracket it was issued for.
  return voter && voter.bracketId === bracketId ? voter : null;
}

export async function requireVoter(bracketId: string) {
  const voter = await currentVoter(bracketId);
  if (!voter) {
    throw new AuthError("You need an invite link to vote on this bracket.");
  }
  return voter;
}

export class AuthError extends Error {}
