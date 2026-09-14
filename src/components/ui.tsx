import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div className="min-w-0">
        <Link
          href="/"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-accent hover:underline"
        >
          BracketBuilder
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight break-words sm:text-4xl">
          {title}
        </h1>
        {subtitle ? <p className="mt-2 text-sm text-white/60">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </header>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface/70 p-5 shadow-lg shadow-black/20 ${className}`}
    >
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "live" | "done" | "flip";
}) {
  const tones = {
    neutral: "bg-white/10 text-white/70",
    live: "bg-emerald-500/15 text-emerald-300",
    done: "bg-sky-500/15 text-sky-300",
    flip: "bg-accent/15 text-accent",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function SeedChip({ seed }: { seed: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-white/10 px-1 text-[11px] font-semibold tabular-nums text-white/60">
      {seed}
    </span>
  );
}
