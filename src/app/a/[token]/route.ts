import { redirect } from "next/navigation";
import { setAdminCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ token: string }> };

/**
 * Claim the admin link. Mirrors the voter flow: the secret is exchanged for a
 * cookie and then leaves the URL, so a shared screenshot of the address bar
 * doesn't hand over control of the bracket.
 */
export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const bracket = await prisma.bracket.findUnique({
    where: { adminToken: token },
    select: { id: true },
  });
  if (!bracket) {
    redirect("/?error=invalid-admin-link");
  }
  await setAdminCookie(bracket.id, token);
  redirect(`/b/${bracket.id}/admin`);
}
