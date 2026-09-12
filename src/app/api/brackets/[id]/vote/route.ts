import { NextResponse } from "next/server";
import { requireVoter } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http";
import { castVote } from "@/lib/service";

type Params = { params: Promise<{ id: string }> };

interface VoteBody {
  matchupId?: string;
  candidateId?: string;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const voter = await requireVoter(id);
    const body = await readJson<VoteBody>(request);
    if (!body.matchupId || !body.candidateId) {
      return NextResponse.json({ error: "Pick a side." }, { status: 400 });
    }
    await castVote(id, voter.id, body.matchupId, body.candidateId);
    return NextResponse.json({ ok: true, candidateId: body.candidateId });
  } catch (error) {
    return errorResponse(error);
  }
}
