import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Candidate research and seeding.
 *
 * Two stages, because the two jobs want different things from the model:
 *
 *   1. Research - web search enabled, free-form output. The model gathers
 *      current evidence about what actually wins in this category.
 *   2. Structuring - strict schema, no tools. The notes are turned into an
 *      ordered list the bracket builder can consume.
 *
 * Splitting them keeps the schema-constrained call simple and lets the research
 * stage be skipped entirely (RESEARCH_WEB_SEARCH=false) when you would rather
 * lean on the model's own knowledge and save the search round-trips.
 */

const MODEL = "claude-opus-5";

const CandidateSchema = z.object({
  name: z.string().describe("The contender's name, as people would say it out loud."),
  blurb: z
    .string()
    .describe("One short line of description shown to voters on the ballot."),
  rationale: z
    .string()
    .describe("Why this was ranked where it was - the evidence behind the seed."),
});

const ResearchSchema = z.object({
  candidates: z
    .array(CandidateSchema)
    .describe(
      "Contenders ordered strongest first. Position 1 is the predicted winner.",
    ),
});

export type ResearchedCandidate = z.infer<typeof CandidateSchema>;

export interface ResearchResult {
  candidates: ResearchedCandidate[];
  /** Whether live web search actually ran, so the UI can say so honestly. */
  usedWebSearch: boolean;
  notes: string;
}

export class ResearchError extends Error {}

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ResearchError(
      "ANTHROPIC_API_KEY is not set, so candidates cannot be researched automatically. Add the key to .env, or enter candidates by hand.",
    );
  }
  return new Anthropic();
}

/**
 * Web search is opt-in, not opt-out.
 *
 * Measured on this app: research takes ~30s without search and ~170s with it.
 * Serverless hosts cut a request off well before three minutes on entry-level
 * plans, so a search-by-default deploy fails in production while working
 * locally. Search also costs roughly ten times as much per bracket, and for
 * categories that aren't time-sensitive it doesn't improve the field. Turn it
 * on with RESEARCH_WEB_SEARCH=true when the category needs current evidence
 * and the host allows a long enough request.
 */
const webSearchEnabled = () => process.env.RESEARCH_WEB_SEARCH === "true";

/** Stage 1: gather evidence about the category. */
async function gatherNotes(
  anthropic: Anthropic,
  category: string,
  count: number,
): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
    system:
      "You research head-to-head popularity contests. You find what real people and credible sources actually rank highly, and you are specific about evidence rather than guessing.",
    messages: [
      {
        role: "user",
        content: `Research the category: "${category}".

Find the ${count} strongest contenders and work out how they would rank against each other in a popular vote. Look for evidence of genuine popularity and acclaim - rankings, awards, critics' lists, sales, enduring reputation, what people order or pick most.

Write up notes covering:
- The ${count} contenders you'd put in a bracket for this category.
- A defensible ordering from strongest to weakest, with the reasoning.
- Which ones are close calls and which are clear favorites.

Notes only - no need to format them as a final answer.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new ResearchError(
      `The research request was declined${
        response.stop_details && "explanation" in response.stop_details
          ? `: ${response.stop_details.explanation}`
          : ""
      }. Try rewording the category, or enter candidates by hand.`,
    );
  }

  // Server tool failures come back as 200s with an error block rather than a
  // thrown exception, so a search that fails just leaves us with thinner notes.
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/** Stage 2: turn notes (or bare knowledge) into a ranked, seedable list. */
async function structure(
  anthropic: Anthropic,
  category: string,
  count: number,
  notes: string,
): Promise<ResearchedCandidate[]> {
  const basis = notes
    ? `Use these research notes as your basis:\n\n<research_notes>\n${notes}\n</research_notes>`
    : "Work from your own knowledge of the category.";

  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system:
      "You turn research into tournament seedings. Seed 1 is the contender most likely to win a popular vote; the last seed is the weakest contender still worth including.",
    messages: [
      {
        role: "user",
        content: `Produce exactly ${count} contenders for a bracket on: "${category}".

${basis}

Rules:
- Return exactly ${count} entries, ordered strongest first. The order is the seeding.
- Every entry must be a distinct, real, specific thing a person could vote for - no ties, no duplicates, no near-synonyms of each other.
- Keep each blurb to one short line a voter can read at a glance.
- The rationale should say what puts it at that rank.`,
      },
    ],
    output_config: { format: zodOutputFormat(ResearchSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new ResearchError(
      "The candidate list request was declined. Try rewording the category, or enter candidates by hand.",
    );
  }
  const parsed = response.parsed_output;
  if (!parsed) {
    throw new ResearchError(
      "The model did not return a usable candidate list. Try again, or enter candidates by hand.",
    );
  }
  return parsed.candidates;
}

/**
 * Research a category and return candidates ranked strongest first.
 * The caller assigns seeds by position, so ordering is the whole contract.
 */
export async function researchCandidates(
  category: string,
  count: number,
): Promise<ResearchResult> {
  const anthropic = client();
  const useSearch = webSearchEnabled();

  let notes = "";
  if (useSearch) {
    notes = await gatherNotes(anthropic, category, count);
  }

  const candidates = await structure(anthropic, category, count, notes);
  const deduped = dedupe(candidates);

  if (deduped.length < count) {
    throw new ResearchError(
      `Only ${deduped.length} distinct candidates came back for "${category}" but ${count} are needed. Try a broader category or a smaller bracket.`,
    );
  }

  return {
    candidates: deduped.slice(0, count),
    usedWebSearch: useSearch && notes.length > 0,
    notes,
  };
}

/** Guards the seed/unique constraint against a model that repeats itself. */
function dedupe(candidates: ResearchedCandidate[]): ResearchedCandidate[] {
  const seen = new Set<string>();
  const out: ResearchedCandidate[] = [];
  for (const candidate of candidates) {
    const name = candidate.name.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...candidate, name });
  }
  return out;
}
