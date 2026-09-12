import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { closeRound, ServiceError } from "@/lib/service";

type Params = { params: Promise<{ id: string }> };

/** Close the round in progress: tally, break ties, advance winners. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireAdmin(id);
    const bracket = await prisma.bracket.findUnique({ where: { id } });
    if (!bracket) throw new ServiceError("Bracket not found.");
    const result = await closeRound(id, bracket.currentRound);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
