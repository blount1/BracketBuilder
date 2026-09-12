import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { buildBracket } from "@/lib/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireAdmin(id);
    const bracket = await buildBracket(id);
    return NextResponse.json({ status: bracket.status, currentRound: bracket.currentRound });
  } catch (error) {
    return errorResponse(error);
  }
}
