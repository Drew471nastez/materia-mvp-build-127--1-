/** Claude selection, account isolation and actual adapter request shape. No paid calls. */
import assert from "node:assert/strict"
import type Anthropic from "@anthropic-ai/sdk"
import { createAnthropicProvider } from "@/lib/sites/agent/anthropic-provider"
import { resolveForCreator, resolveProvider } from "@/lib/sites/agent/provider"
import { enginesWithClaudeModels, engineFromSaved } from "@/lib/website-builder/ask-engines"
import { claudeModels } from "@/lib/sites/agent/claude-models"
import { seal } from "@/lib/ai-keys/crypto"

async function main() {
  const previous = { ...process.env }
  const realFetch = globalThis.fetch
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://claude-integration-db.invalid"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "integration-only-sealing-key"
  process.env.ANTHROPIC_API_KEY = "integration-platform-claude-key"
  delete process.env.OPENAI_API_KEY
  const ownKey = "integration-personal-claude-key"
  const sealed = seal(ownKey)
  const calls: string[] = []
  const model = (id: string, name: string, adaptive: boolean, maxTokens: number): Anthropic.ModelInfo => ({
    id, display_name: name, created_at: "2026-10-01T00:00:00Z", type: "model", max_tokens: maxTokens, max_input_tokens: 200000,
    capabilities: { structured_outputs: { supported: true }, thinking: { supported: adaptive, types: { adaptive: { supported: adaptive }, enabled: { supported: false } } }, effort: { supported: adaptive, low: { supported: adaptive }, medium: { supported: adaptive }, high: { supported: adaptive }, max: { supported: false } } } as Anthropic.ModelCapabilities,
  })
  const available = [model("claude-sonnet-5", "Claude Sonnet 5", true, 16000), model("claude-haiku-4-5", "Claude Haiku 4.5", false, 8000)]
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input)
    if (url.startsWith("https://claude-integration-db.invalid/rest/v1/creator_ai_keys")) {
      const owner = new URL(url).searchParams.get("creator_id")
      return Response.json(owner === "eq.personal" ? [{ provider: "anthropic", sealed_key: sealed }] : [])
    }
    if (url.startsWith("https://api.anthropic.com/v1/models")) {
      const headers = new Headers(input instanceof Request ? input.headers : init?.headers)
      calls.push(headers.get("x-api-key") === ownKey ? "personal" : "platform")
      return Response.json({ data: available, has_more: false, first_id: available[0].id, last_id: available[1].id })
    }
    throw new Error("Unexpected external call in Claude integration test")
  }
  try {
    const platform = resolveProvider({ requested: "anthropic", tier: "fast" })
    assert.equal(platform.id, "anthropic")
    assert.equal(platform.provider.id, "anthropic")
    const selected = await resolveForCreator("platform", { requested: "anthropic", model: "claude-haiku-4-5" })
    assert.equal(selected.model, "claude-haiku-4-5")
    assert.equal(selected.own, null)
    const personal = await resolveForCreator("personal", { requested: "anthropic", model: "claude-sonnet-5" })
    assert.equal(personal.provider.id, "own:anthropic")
    assert.equal(personal.own, "anthropic")
    assert.deepEqual(calls, ["platform", "personal"], "catalog credentials must follow the account paying for generation")
    await Promise.all([claudeModels(ownKey), claudeModels(ownKey)])
    assert.equal(calls.length, 2, "repeat discovery uses the bounded account-scoped cache")
    await assert.rejects(resolveForCreator("platform", { requested: "anthropic", model: "claude-forged-model" }), /no longer available/)
    await assert.rejects(resolveForCreator("platform", { requested: "anthropic", model: "https://attacker.invalid" }), /Choose a Claude model/)
    const engines = enginesWithClaudeModels(available)
    assert.equal(engines[0].id, "claude")
    assert.equal(engines[0].model, "claude-sonnet-5")
    assert.ok(engines.some((engine) => engine.model === "claude-haiku-4-5"))
    assert.ok(engines.some((engine) => engine.provider === "openai"))
    assert.equal(engineFromSaved("claude:claude-haiku-4-5"), "claude:claude-haiku-4-5")
    assert.equal(engineFromSaved("claude:https://attacker.invalid"), "claude")

    const sent: Record<string, any>[] = []
    const transport = { messages: { stream(body: Record<string, any>) {
      sent.push(body)
      return { finalMessage: async () => ({ content: [{ type: "tool_use", id: "call1", name: "read_page", input: {} }], stop_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 20, cache_creation_input_tokens: 2 } }) }
    } } }
    for (const info of available) {
      const provider = createAnthropicProvider(() => transport as never, { modelInfo: info })
      const result = await provider.complete({ model: info.id, system: "Storelib rules", turns: [{ role: "user", content: "Change the page" }], tools: [{ name: "read_page", description: "Read the page", parameters: { type: "object", properties: {}, additionalProperties: false } }], maxOutputTokens: 24000, effort: "high" })
      assert.equal(result.toolCalls[0].name, "read_page")
      assert.equal(result.usage.inputTokens, 32, "cached and uncached Anthropic usage must be summed")
    }
    assert.equal(sent[0].max_tokens, 16000)
    assert.deepEqual(sent[0].thinking, { type: "adaptive" })
    assert.equal(sent[0].output_config.effort, "high")
    assert.equal(sent[1].max_tokens, 8000)
    assert.ok(!("thinking" in sent[1]) && !("output_config" in sent[1]), "Haiku must not receive unsupported reasoning parameters")
    assert.deepEqual(sent[0].system[0].cache_control, { type: "ephemeral" })
    console.log("PASS: Claude platform/personal selection, isolated cached model discovery, forged model rejection, persisted choices, tool calling, cache accounting and model-specific API limits.")
  } finally {
    globalThis.fetch = realFetch
    process.env = previous
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
