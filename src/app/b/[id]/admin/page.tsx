import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminConsole } from "@/components/AdminConsole";
import { isAdmin } from "@/lib/auth";
import { loadBracket, loadTurnout } from "@/lib/view";

type Params = { params: Promise<{ id: string }> };

export default async function AdminPage({ params }: Params) {
  const { id } = await params;
  const admin = await isAdmin(id);
  // Admins see live tallies; that's the point of the console.
  const bracket = await loadBracket(id, { includeTallies: admin });
  if (!bracket) notFound();

  if (!admin) {
    return (
      <main className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-2xl font-bold">This is the admin view</h1>
        <p className="mt-3 text-white/60">
          Open the admin link you were given when you created “{bracket.title}” to
          manage it. Anyone can follow the public bracket instead.
        </p>
        <Link
          href={`/b/${id}`}
          className="mt-6 inline-block rounded-lg bg-accent px-5 py-2.5 font-semibold text-ink"
        >
          View the bracket
        </Link>
      </main>
    );
  }

  const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const turnout =
    bracket.status === "ACTIVE" ? await loadTurnout(id, bracket.currentRound) : null;
  return <AdminConsole bracket={bracket} hasApiKey={hasApiKey} turnout={turnout} />;
}
