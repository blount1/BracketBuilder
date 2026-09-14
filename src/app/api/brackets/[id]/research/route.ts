import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { researchCandidates } from "@/lib/research";
import { ServiceError } from "@/lib/service";

type Params = { params: Promise<{ id: string }> };

/**
 * Research is slow - tens of seconds without web search, longer with it - and
 * serverless platforms cut a request off at a per-plan ceiling. Ask for the
 * headroom explicitly; hosts clamp this down to whatever the plan allows.
 */
export const maxDuration = 300;

/**
 * Research the category and replace the draft's candidate list, seeded in the
 * order the research returned.
 */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireAdmin(id);

    const bracket = await prisma.bracket.findUnique({ where: { id } });
    if (!bracket) throw new ServiceError("Bracket not found.");
    if (bracket.status !== "DRAFT") {
      throw new ServiceError("This bracket has already started.");
    }

    const result = await researchCandidates(bracket.category, bracket.size);

    // Replace wholesale; re-running research is how an admin asks for a redo.
    await prisma.$transaction([
      prisma.candidate.deleteMany({ where: { bracketId: id } }),
      prisma.candidate.createMany({
        data: result.candidates.map((candidate, index) => ({
          bracketId: id,
          name: candidate.name,
          blurb: candidate.blurb,
          rationale: candidate.rationale,
          seed: index + 1,
        })),
      }),
    ]);

    return NextResponse.json({
      usedWebSearch: result.usedWebSearch,
      candidates: result.candidates.map((c, i) => ({ ...c, seed: i + 1 })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
