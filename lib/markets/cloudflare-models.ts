/**
 * ===========================================================================
 *  CLOUDFLARE WORKERS AI: THE SECOND FREE TRANSLATOR, ITS MODEL ASKED FOR
 * ===========================================================================
 * Workers AI on Cloudflare's free Workers plan: 10,000 "neurons" a day at no
 * charge and no card (developers.cloudflare.com/workers-ai/platform/pricing,
 * checked 2026-10-25); past that the call fails until 00:00 UTC, it is never
 * billed. Cloudflare does not train on what it is sent. Set up with
 * CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN (a token with "Workers AI
 * Read" and "Workers AI Edit"); CLOUDFLARE_TRANSLATE_MODEL pins a model.
 *
 * Like Gemini, the model is read from the account's own list
 * (GET /accounts/{id}/ai/models/search?task=Text Generation, once a day),
 * not written down: an open instruct model that reads many languages, the
 * cheapest good one first. Gemma (Google's open model, strong in many
 * languages, a mixture of experts so few neurons a token), then EuroLLM
 * (made for European languages), Mistral Small, Llama, Qwen. LoRA bases,
 * guards, coders, vision and reasoning models are left out.
 */

export interface CfListed {
  name?: string
  task?: { name?: string } | null
  properties?: { property_id?: string; value?: unknown }[] | null
}

export const CF_KNOWN_GOOD = ["@cf/google/gemma-4-26b-a4b-it", "@cf/mistralai/mistral-small-3.1-24b-instruct", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct-fp8"]

const LEFT_OUT = /(lora|guard|coder|code|vision|r1|qwq|embed|whisper|tts|math|-awq|-hf$|1b-|3b-|deepseek|kimi)/i
const FAMILIES: RegExp[] = [/\/gemma-\d/i, /eurollm/i, /mistral-small/i, /llama-(3\.[3-9]|[4-9])/i, /qwen3/i, /llama-3/i]

const version = (id: string) => {
  const m = id.match(/-(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : 0
}

function deprecated(m: CfListed, now: number): boolean {
  for (const p of m.properties ?? []) {
    if (!p?.property_id) continue
    if (/deprecat/i.test(p.property_id) && typeof p.value === "string") {
      const t = Date.parse(p.value)
      if (Number.isFinite(t) && t <= now + 7 * 86_400_000) return true
    }
  }
  return false
}

export function rankCfModels(list: CfListed[], now = Date.now()): string[] {
  const out: { id: string; f: number; v: number }[] = []
  for (const m of list) {
    const id = String(m.name ?? "")
    if (!id.startsWith("@cf/") || LEFT_OUT.test(id)) continue
    if (m.task?.name && !/text generation/i.test(m.task.name)) continue
    if (deprecated(m, now)) continue
    const f = FAMILIES.findIndex((r) => r.test(id))
    if (f < 0) continue
    out.push({ id, f, v: version(id) })
  }
  out.sort((a, b) => a.f - b.f || b.v - a.v || a.id.localeCompare(b.id))
  return [...new Set(out.map((x) => x.id))]
}

export async function listCfModels(account: string, token: string, fetchImpl: typeof fetch = fetch, base = "https://api.cloudflare.com/client/v4"): Promise<CfListed[]> {
  const res = await fetchImpl(`${base.replace(/\/+$/, "")}/accounts/${encodeURIComponent(account)}/ai/models/search?task=${encodeURIComponent("Text Generation")}&per_page=200&hide_experimental=true`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw Object.assign(new Error(`models search answered HTTP ${res.status}`), { status: res.status })
  const json = (await res.json()) as { result?: CfListed[] }
  return Array.isArray(json.result) ? json.result : []
}
