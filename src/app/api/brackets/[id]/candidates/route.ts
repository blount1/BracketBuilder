import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/service";

type Params = { params: Promise<{ id: string }> };

interface CandidatesBody {
  candidates?: { name?: string; blurb?: string; rationale?: string }[];
}

/**
 * Overwrite the candidate list by hand. Array order is the seeding, so this is
 * also how an admin re-seeds after reviewing the research.
 */
export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireAdmin(id);

    const bracket = await prisma.bracket.findUnique({ where: { id } });
    if (!bracket) throw new ServiceError("Bracket not found.");
    if (bracket.status !== "DRAFT") {
      throw new ServiceError("This bracket has already started.");
    }

    const body = await readJson<CandidatesBody>(request);
    const cleaned = (body.candidates ?? [])
      .map((c) => ({
        name: c.name?.trim() ?? "",
        blurb: c.blurb?.trim() || null,
        rationale: c.rationale?.trim() || null,
      }))
      .filter((c) => c.name.length > 0);

    if (cleaned.length === 0) throw new ServiceError("Add at least one candidate.");
    if (cleaned.length > bracket.size) {
      throw new ServiceError(
        `A ${bracket.size} bracket holds at most ${bracket.size} candidates; you sent ${cleaned.length}.`,
      );
    }
    const names = new Set(cleaned.map((c) => c.name.toLowerCase()));
    if (names.size !== cleaned.length) {
      throw new ServiceError("Candidate names must be distinct.");
    }

    await prisma.$transaction([
      prisma.candidate.deleteMany({ where: { bracketId: id } }),
      prisma.candidate.createMany({
        data: cleaned.map((c, index) => ({ ...c, bracketId: id, seed: index + 1 })),
      }),
    ]);

    return NextResponse.json({ count: cleaned.length });
  } catch (error) {
    return errorResponse(error);
  }
}
