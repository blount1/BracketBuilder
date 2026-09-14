import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { ResearchError } from "@/lib/research";
import { ServiceError } from "@/lib/service";

/**
 * Turns the app's expected failures into clean JSON. Anything unexpected is
 * logged and reported generically rather than leaking internals to a voter.
 */
export function errorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ServiceError || error instanceof ResearchError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // firstRoundPairs and friends throw plain Errors with actionable messages.
  if (error instanceof RangeError || error instanceof TypeError) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  console.error("Unhandled error:", error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ServiceError("Request body must be JSON.");
  }
}

/** Absolute origin for building shareable links. */
export function appUrl(request: Request): string {
  // Deliberately not a NEXT_PUBLIC_ variable: those are inlined at build time,
  // so one set after deploy would be silently ignored. This is server-only and
  // read at request time.
  const configured = process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");

  // Behind a proxy (Vercel, a load balancer) request.url can carry an internal
  // address. The forwarded headers carry the host the browser actually used,
  // which is the one an invite link has to point at.
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
    const proto = forwardedProto ?? (isLocal ? "http" : "https");
    return `${proto}://${host}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return new URL(request.url).origin;
}
