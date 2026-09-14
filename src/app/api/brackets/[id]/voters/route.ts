import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { appUrl, errorResponse, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/service";
import { newToken } from "@/lib/tokens";

type Params = { params: Promise<{ id: string }> };

interface VotersBody {
  /** Either names to invite, or a plain count of anonymous invite links. */
  labels?: string[];
  count?: number;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireAdmin(id);

    const bracket = await prisma.bracket.findUnique({ where: { id } });
    if (!bracket) throw new ServiceError("Bracket not found.");

    const body = await readJson<VotersBody>(request);
    const existing = await prisma.voter.count({ where: { bracketId: id } });

    let labels: string[];
    if (body.labels?.length) {
      labels = body.labels.map((l) => l.trim()).filter(Boolean);
    } else {
      const count = Number(body.count ?? 0);
      if (!Number.isInteger(count) || count < 1) {
        throw new ServiceError("Say how many invite links to create.");
      }
      labels = Array.from({ length: count }, (_, i) => `Voter ${existing + i + 1}`);
    }
    if (labels.length === 0) throw new ServiceError("Say who to invite.");
    if (labels.length > 500) throw new ServiceError("That is too many invites at once.");

    const created = await prisma.$transaction(
      labels.map((label) =>
        prisma.voter.create({ data: { bracketId: id, label, token: newToken() } }),
      ),
    );

    const origin = appUrl(request);
    return NextResponse.json({
      voters: created.map((voter) => ({
        id: voter.id,
        label: voter.label,
        inviteUrl: `${origin}/v/${voter.token}`,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Existing invites, so the admin page can re-show links it already handed out. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireAdmin(id);
    const voters = await prisma.voter.findMany({
      where: { bracketId: id },
      orderBy: { createdAt: "asc" },
    });
    const origin = appUrl(request);
    return NextResponse.json({
      voters: voters.map((voter) => ({
        id: voter.id,
        label: voter.label,
        claimed: Boolean(voter.claimedAt),
        inviteUrl: `${origin}/v/${voter.token}`,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
