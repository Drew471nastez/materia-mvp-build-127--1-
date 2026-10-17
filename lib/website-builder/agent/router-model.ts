import "server-only"

/**
 * The small fast model ./router.ts asks when its rules cannot tell which
 * agent a request is for. Claude Haiku 5.5 at low effort, a few hundred
 * output tokens at most, one word back, four seconds or the rules' answer.
 * On the creator's own Claude key when they have one, like every other call
 * (lib/sites/agent/provider.ts), so it never spends Storelib's credit for
 * somebody who connected a key to avoid that.
 */

import { resolveForCreator } from "@/lib/sites/agent/provider"
import { classifierPrompt, readClassifierAnswer, type RouteClassifier } from "./router"

export const ROUTER_MODEL = "claude-haiku-5-5"
const ROUTER_TIMEOUT_MS = 4_000

export function routerClassifier(creatorId: string): RouteClassifier {
  return async (prompt, ctx) => {
    const resolved = await resolveForCreator(creatorId, { requested: "anthropic", model: ROUTER_MODEL })
    if (resolved.id !== "anthropic") return null
    const turn = await resolved.provider.complete({
      model: resolved.model,
      system: "Answer with exactly one word.",
      turns: [{ role: "user", content: classifierPrompt(prompt, ctx.addable) }],
      tools: [],
      maxOutputTokens: 400,
      effort: "low",
      signal: AbortSignal.timeout(ROUTER_TIMEOUT_MS),
    })
    return readClassifierAnswer(turn.text)
  }
}
