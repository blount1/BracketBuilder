import { NextResponse } from "next/server";
import { isBracketSize } from "@/lib/bracket";
import { setAdminCookie } from "@/lib/auth";
import { appUrl, badRequest, errorResponse, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { newToken } from "@/lib/tokens";

interface CreateBody {
  title?: string;
  category?: string;
  size?: number;
}

export async function POST(request: Request) {
  try {
    const body = await readJson<CreateBody>(request);
    const category = body.category?.trim();
    const size = Number(body.size);

    if (!category) return badRequest("Give the bracket a category.");
    if (category.length > 200) return badRequest("That category is too long.");
    if (!isBracketSize(size)) {
      return badRequest("Bracket size must be 16, 32, 64 or 128.");
    }

    const bracket = await prisma.bracket.create({
      data: {
        title: body.title?.trim() || category,
        category,
        size,
        adminToken: newToken(),
      },
    });

    // Whoever creates a bracket runs it, so plant the admin cookie right away.
    await setAdminCookie(bracket.id, bracket.adminToken);

    return NextResponse.json({
      id: bracket.id,
      title: bracket.title,
      adminUrl: `${appUrl(request)}/a/${bracket.adminToken}`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
