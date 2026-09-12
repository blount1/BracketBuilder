import { redirect } from "next/navigation";
import { setVoterCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ token: string }> };

/**
 * Claim an invite link: store the voter's token in a cookie scoped to that
 * bracket, then send them to the ballot. The secret leaves the URL bar here.
 */
export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const voter = await prisma.voter.findUnique({ where: { token } });
  if (!voter) {
    redirect("/?error=invalid-invite");
  }

  if (!voter.claimedAt) {
    await prisma.voter.update({
      where: { id: voter.id },
      data: { claimedAt: new Date() },
    });
  }
  await setVoterCookie(voter.bracketId, token);
  redirect(`/b/${voter.bracketId}/vote`);
}
