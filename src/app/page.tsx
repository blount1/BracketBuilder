import { BRACKET_SIZES } from "@/lib/bracket";
import { CreateBracketForm } from "@/components/CreateBracketForm";

export default function HomePage() {
  return (
    <main>
      <div className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          BracketBuilder
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          Settle it with a bracket.
        </h1>
        <p className="mt-4 max-w-2xl text-white/60">
          Name a category — Best Steakhouse Appetizers, say. Claude researches the
          field and seeds it so the predicted favorites open against the weakest
          contenders. Then the people you invite vote it out, round by round.
          Ties are broken by a coin flip committed to before voting starts.
        </p>
      </div>

      <CreateBracketForm sizes={[...BRACKET_SIZES]} />

      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          {
            step: "1",
            title: "Research and seed",
            body: "Claude finds the strongest contenders, ranks them, and explains each seed. Review and edit before you lock it in.",
          },
          {
            step: "2",
            title: "Invite your voters",
            body: "Generate one private link per person. No accounts, no passwords — one vote each, enforced by the database.",
          },
          {
            step: "3",
            title: "Run the rounds",
            body: "Close a round and winners advance automatically. Every result, including any coin flip, stays on the record.",
          },
        ].map((item) => (
          <div key={item.step} className="rounded-xl border border-line bg-surface/60 p-5">
            <span className="text-xs font-semibold text-accent">{item.step}</span>
            <h2 className="mt-2 font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm text-white/55">{item.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
