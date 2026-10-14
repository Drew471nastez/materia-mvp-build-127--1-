import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { createHash } from "node:crypto"

const held = new Map<string, { until: number; result: Promise<Anthropic.ModelInfo[]> }>()

/** Account-scoped discovery. Model listing does not generate tokens or spend credits. */
export function claudeModels(apiKey: string): Promise<Anthropic.ModelInfo[]> {
  const tag = createHash("sha256").update(apiKey).digest("hex")
  const previous = held.get(tag)
  if (previous && previous.until > Date.now()) return previous.result
  const client = new Anthropic({ apiKey, maxRetries: 0 })
  const result = (async () => {
    const page = await client.models.list({ limit: 100 }, { timeout: 8_000 })
    return page.data.filter((model) => /^claude-[a-z0-9-]{1,100}$/.test(model.id))
  })()
  if (held.size >= 100) held.delete(held.keys().next().value!)
  held.set(tag, { until: Date.now() + 5 * 60_000, result })
  result.catch(() => { if (held.get(tag)?.result === result) held.delete(tag) })
  return result
}
