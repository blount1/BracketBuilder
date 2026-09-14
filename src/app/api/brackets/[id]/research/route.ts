import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { type ResearchProgress, researchCandidates } from "@/lib/research";
import { ServiceError } from "@/lib/service";

type Params = { params: Promise<{ id: string }> };

/**
 * Research is slow - tens of seconds without web search, longer with it - and
 * serverless platforms cut a request off at a per-plan ceiling. Ask for the
 * headroom explicitly; hosts clamp this down to whatever the plan allows.
 */
export const maxDuration = 300;

/** One newline-delimited JSON event. */
type ResearchEvent =
  | ({ type: "progress" } & ResearchProgress)
  | { type: "done"; usedWebSearch: boolean; count: number }
  | { type: "error"; error: string };

/**
 * Research the category and replace the draft's candidate list, seeded in the
 * order the research returned.
 *
 * The response streams newline-delimited JSON rather than returning one object
 * at the end. Research takes tens of seconds, and a client watching the stages
 * go by can show what is actually happening instead of an unexplained wait.
 */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;

  // Anything that can fail before streaming starts should fail as a normal
  // error response, so the client gets a status code rather than a stream
  // whose first event is a failure.
  try {
    await requireAdmin(id);
    const bracket = await prisma.bracket.findUnique({ where: { id } });
    if (!bracket) throw new ServiceError("Bracket not found.");
    if (bracket.status !== "DRAFT") {
      throw new ServiceError("This bracket has already started.");
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: ResearchEvent) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

        try {
          const result = await researchCandidates(
            bracket.category,
            bracket.size,
            (progress) => send({ type: "progress", ...progress }),
          );

          // Replace wholesale; re-running research is how an admin asks for a redo.
          await prisma.$transaction([
            prisma.candidate.deleteMany({ where: { bracketId: id } }),
            prisma.candidate.createMany({
              data: result.candidates.map((candidate, index) => ({
                bracketId: id,
                name: candidate.name,
                blurb: candidate.blurb,
                rationale: candidate.rationale,
                seed: index + 1,
              })),
            }),
          ]);

          send({
            type: "done",
            usedWebSearch: result.usedWebSearch,
            count: result.candidates.length,
          });
        } catch (error) {
          // The status code is already 200 by the time streaming starts, so a
          // failure has to travel as an event the client knows to look for.
          send({
            type: "error",
            error:
              error instanceof Error ? error.message : "Research failed. Try again.",
          });
          if (!(error instanceof ServiceError)) console.error("Research failed:", error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        // Stops intermediary buffering from holding events back until the end,
        // which would defeat the point of streaming them.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
