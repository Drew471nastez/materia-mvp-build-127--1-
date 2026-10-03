/**
 * ===========================================================================
 *  ONE QUESTION, WHEN GUESSING WOULD BUILD THE WRONG THING
 * ===========================================================================
 * The rulebook's questions policy (lib/agent-rules, "Questions"), as a tool
 * Ask Storelib can call. It uses the same question shape and limits as the
 * code agent's (lib/sites/agent/questions.ts: a sentence, a reason, a few
 * short choices) so a question looks the same wherever it is asked.
 *
 * WHY ASKING ENDS THE RUN HERE, when the code agent's waits. The code agent
 * holds its request open and polls a row (site_agent_questions, keyed to a
 * code site) for the answer. This agent runs inside one short streamed
 * request, and holding it open for a person to read, think and tap would be
 * a serverless function idling on the creator's credits. So it asks and
 * stops, like Lovable and Bolt do: the question arrives as a `question`
 * event, the creator's tap arrives as the next message in the same
 * conversation, and the agent reads its own question back from the
 * conversation (lib/website-builder/agent/memory.ts). Nothing is guessed,
 * nothing waits, and no table is needed.
 *
 * THE POLICY IS ALSO CHECKED HERE, where it can be: one question a run, two
 * to four choices, never the same question twice in a row, and never
 * "which product" to a store that has one.
 */
import { parseQuestion, type AgentQuestion } from "@/lib/sites/agent/questions"
import type { ToolSpec } from "@/lib/sites/agent/types"

/** Asked once a run at most. A second question is a decision the agent can make. */
export const MAX_BUILDER_ASKS = 1

export const ASK_TOOL: ToolSpec<string> = {
  name: "ask_creator",
  description:
    "Ask the creator ONE short question with two to four choices, and stop. Only when the answer changes what you build and nothing you can read answers it: which product to feature, which page it goes on, brand colours the site does not have yet, a fact about the business that is not in the store or on the page, or a picture you cannot read. Never ask what the page, the theme, the store or the conversation already answers, and never about taste you can decide. The run ends when you ask: changes you already made stay, and the creator's answer is their next message.",
  parameters: {
    type: "object",
    properties: {
      question: { type: "string", description: "One sentence, under 160 characters. \"Which product should the hero show?\"" },
      options: {
        type: "array",
        items: { type: "string" },
        description: "Two to four short answers they can tap, under 48 characters each, taken from what you read: real product names, real page names.",
      },
      why: { type: "string", description: "Why it matters, in a few words. \"The hero sells one product.\"" },
      imageSectionId: {
        type: "string",
        description:
          'ONLY WHEN YOU NEED A PICTURE FROM THEM (their portrait, their product photo): the id of the section whose image setting it goes in, and options exactly "Upload image" and "Paste image URL". The chat turns those two into a file picker and an address box and puts the picture straight into that setting. "" for any other question.',
      },
      imageBlockId: { type: "string", description: 'The block path inside that section when the picture is a block\'s setting, else "".' },
      imageSetting: { type: "string", description: 'The image_picker setting id the picture goes in, else "".' },
    },
    required: ["question", "options", "why", "imageSectionId", "imageBlockId", "imageSetting"],
    additionalProperties: false,
  },
}

export interface AskContext {
  /** Published products, when the catalogue has been read this run. */
  products: number | null
  /** The last thing the assistant said in this conversation, when it asked. */
  previousQuestion?: string | null
  /** How many questions this run has already asked. */
  asked: number
}

function same(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()
  return norm(a) !== "" && norm(a) === norm(b)
}

/**
 * The question the model asked, or why it may not ask it. A refusal is a tool
 * result it can act on (decide, and say what it chose), never an exception.
 */
export function readAsk(argumentsJson: string, id: string, ctx: AskContext): { question: AgentQuestion } | { refused: string } {
  if (ctx.asked >= MAX_BUILDER_ASKS) {
    return { refused: "You have already asked this run. Decide this yourself with the most plausible choice and say in your reply what you chose." }
  }
  let args: Record<string, unknown>
  try {
    args = JSON.parse(argumentsJson || "{}") as Record<string, unknown>
  } catch {
    return { refused: "The arguments were not JSON. Send question, options and why." }
  }
  const question = parseQuestion({ question: args.question, why: args.why, suggestions: args.options }, id)
  if (!question) return { refused: "Send the question as one short sentence." }
  if (question.suggestions.length < 2 || question.suggestions.length > 4) {
    return { refused: "Give two to four short options to choose from, taken from what you read." }
  }
  if (ctx.previousQuestion && same(ctx.previousQuestion.split("\n")[0], question.question)) {
    return { refused: "You asked exactly this last time and they answered with their message. Read their message as the answer and carry on." }
  }
  if (ctx.products !== null && ctx.products <= 1 && /\bwhich\b[^?]*\bproduct/i.test(question.question)) {
    return {
      refused:
        ctx.products === 0
          ? "The store has no products yet, so there is nothing to choose between. Build without a product section and say so."
          : "The store has one product, so that is the one. Use it without asking.",
    }
  }
  /* A picture it needs, named by where it goes: checked against the page by the loop before it is offered. */
  const sectionId = typeof args.imageSectionId === "string" ? args.imageSectionId.trim() : ""
  const setting = typeof args.imageSetting === "string" ? args.imageSetting.trim() : ""
  const blockId = typeof args.imageBlockId === "string" ? args.imageBlockId.trim() : ""
  if (sectionId && setting) question.target = { sectionId, setting, ...(blockId ? { blockId } : {}) }
  return { question }
}

/**
 * The question as the transcript keeps it and as a client that does not draw
 * `question` events shows it: the sentence, then the choices, one a line.
 */
export function questionText(question: AgentQuestion): string {
  return [question.question, ...question.suggestions.map((s) => `- ${s}`)].join("\n")
}
