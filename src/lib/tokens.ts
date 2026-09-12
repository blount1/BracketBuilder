import { randomBytes } from "node:crypto";

/**
 * URL-safe random tokens. These are the only credential in the system - an
 * invite link is the voter's identity and the admin link is the owner's - so
 * they carry 192 bits of entropy and are never derived from anything guessable.
 */
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}
