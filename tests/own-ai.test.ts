/**
 * YOUR OWN AI IN STORELIB AI.
 *
 * A creator connects their own Claude key, OpenAI key or OpenRouter account,
 * and the chat answers on it: the key is sealed before it is stored, checked
 * for shape before a provider is asked, sent to the right place with the
 * right model name, explained in their terms when it is refused, and those
 * runs are left out of the plan's AI edits.
 */
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key-for-sealing"

import { readFileSync } from "node:fs"
import { tamperBase64url } from "./tamper"
import { join } from "node:path"
import { hintOf, open, seal } from "@/lib/ai-keys/crypto"
import { describeOwnKeyError } from "@/lib/ai-keys/errors"
import { looksLike } from "@/lib/ai-keys/verify"
import { returnPath } from "@/lib/ai-keys/openrouter"
import { anthropicClientFor, createAnthropicProvider } from "@/lib/sites/agent/anthropic-provider"
import { createOpenAIProvider, openAIClientFor } from "@/lib/sites/agent/openai-provider"
import { OWN_PREFIX, ownAccount } from "@/lib/sites/agent/provider"
import { ownFor } from "@/components/website-builder/use-own-ai"
import type { AgentProvider, ProviderRequest } from "@/lib/sites/agent/types"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)

const request = (model: string): ProviderRequest => ({ model, system: "s", turns: [{ role: "user", content: "hi" }], tools: [], maxOutputTokens: 1000 })

async function main() {
  section("A key is sealed, never stored as text")
  const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123"
  const sealed = seal(key)
  check("sealed, it does not contain the key", !sealed.includes(key) && !sealed.includes("abcdefghij"), sealed)
  check("and opens back to it", open(sealed) === key)
  check("two seals of one key differ (a fresh nonce each time)", seal(key) !== sealed)
  const parts = sealed.split(".")
  parts[3] = tamperBase64url(parts[3])
  check("a changed byte opens to nothing, not to garbage", open(parts.join(".")) === null)
  const before = process.env.AI_KEYS_SECRET
  process.env.AI_KEYS_SECRET = "another-secret"
  check("sealed with another secret, it does not open", open(sealed) === null)
  if (before === undefined) delete process.env.AI_KEYS_SECRET
  else process.env.AI_KEYS_SECRET = before
  check("the creator is shown the last four characters only", hintOf(key) === "0123")

  section("A pasted key is checked for shape before any provider is asked")
  check("a Claude key must start sk-ant-", !!looksLike("anthropic", "sk-proj-abcdefghijklmnopqrstu") && looksLike("anthropic", key) === null)
  check("a Claude key in the OpenAI box is named for what it is", /Claude key/.test(looksLike("openai", key) ?? ""))
  check("an OpenAI key passes", looksLike("openai", "sk-proj-abcdefghijklmnopqrstuvwxyz") === null)
  check("half a key, or one with a space in it, is refused", !!looksLike("openai", "sk-abc") && !!looksLike("openai", "sk-abcdefghij klmnopqrstuvwxyz"))

  section("A refusal on their account is said in their terms")
  const said = (status: number, source: "anthropic" | "openai" | "openrouter" = "anthropic") => describeOwnKeyError({ status }, source)
  check("401: the key was refused, and where to fix it", /Your Claude key was refused/.test(said(401) ?? "") && /Connections/.test(said(401) ?? ""))
  check("402: out of credit", /OpenRouter account is out of credit/.test(said(402, "openrouter") ?? ""))
  check("429: rate limited by its own provider", /rate limited/.test(said(429, "openai") ?? ""))
  check("500: their provider's trouble, not ours", /provider is having trouble/.test(said(503) ?? ""))
  check("no status (a timeout, an abort): not about the key", describeOwnKeyError(new Error("x"), "anthropic") === null)

  section("Their account, asked the right way")
  const sent: Record<string, unknown>[] = []
  const fakeAnthropic = {
    messages: {
      stream: (params: Record<string, unknown>) => {
        sent.push(params)
        return { finalMessage: async () => ({ content: [{ type: "text", text: "hi" }], stop_reason: "end_turn", usage: { input_tokens: 3, output_tokens: 2 } }) }
      },
    },
  }
  const viaRouter = createAnthropicProvider(() => fakeAnthropic as never, { modelPrefix: "anthropic/" })
  const turn = await viaRouter.complete(request("claude-sonnet-5"))
  check("through OpenRouter, Claude is asked for by OpenRouter's name", sent[0]?.model === "anthropic/claude-sonnet-5", sent[0]?.model)
  check("and the answer comes back as any other", turn.text === "hi" && turn.stop === "done")
  const direct = createAnthropicProvider(() => fakeAnthropic as never)
  await direct.complete(request("claude-sonnet-5"))
  check("on their own Claude key, by Anthropic's own name", sent[1]?.model === "claude-sonnet-5")

  const openaiSent: Record<string, unknown>[] = []
  const fakeOpenAI = {
    responses: {
      create: async (params: Record<string, unknown>) => {
        openaiSent.push(params)
        return { output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }], usage: { input_tokens: 1, output_tokens: 1 }, incomplete_details: null }
      },
    },
  }
  await createOpenAIProvider(() => fakeOpenAI as never, { modelPrefix: "openai/" }).complete(request("gpt-5.6-luna"))
  check("ChatGPT through OpenRouter: openai/gpt-5.6-luna", openaiSent[0]?.model === "openai/gpt-5.6-luna", openaiSent[0]?.model)

  const routerClient = anthropicClientFor("sk-or-v1-abcdefghijklmnopqrstuvwxyz", "openrouter") as unknown as { baseURL: string; apiKey: string | null; authToken: string | null }
  check("OpenRouter's Claude endpoint, with the key as a bearer token", routerClient.baseURL === "https://openrouter.ai/api" && routerClient.authToken === "sk-or-v1-abcdefghijklmnopqrstuvwxyz" && !routerClient.apiKey, { baseURL: routerClient.baseURL })
  const routerOpenAI = openAIClientFor("sk-or-v1-abcdefghijklmnopqrstuvwxyz", "openrouter") as unknown as { baseURL: string }
  check("OpenRouter's Responses endpoint for ChatGPT", routerOpenAI.baseURL === "https://openrouter.ai/api/v1", routerOpenAI.baseURL)

  section("A run on their account is marked as theirs, and refused plainly")
  const refusing: AgentProvider = { id: "anthropic", complete: async () => { throw Object.assign(new Error("401 {\"type\":\"error\"}"), { status: 401 }) } }
  const wrapped = ownAccount(refusing, "anthropic", "creator-test")
  check("its provider is recorded as own:anthropic", wrapped.id === `${OWN_PREFIX}anthropic`)
  let thrown: unknown = null
  try {
    await wrapped.complete(request("claude-sonnet-5"))
  } catch (e) {
    thrown = e
  }
  check("a refused key reads as a sentence, not the provider's JSON", thrown instanceof Error && thrown.name === "OwnKeyError" && /Your Claude key was refused/.test(thrown.message), (thrown as Error)?.message)
  const aborting: AgentProvider = { id: "openai", complete: async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }) } }
  let abort: unknown = null
  try {
    await ownAccount(aborting, "openai", "creator-test").complete(request("gpt-5.6-luna"))
  } catch (e) {
    abort = e
  }
  check("a Stop is still a Stop", abort instanceof Error && abort.name === "AbortError")

  section("Which connection answers which model")
  const k = (source: "anthropic" | "openai" | "openrouter") => ({ source, hint: "abcd", connectedAt: "", lastUsedAt: null, lastError: null })
  check("their Claude key answers Claude", ownFor([k("anthropic")], "anthropic") === "anthropic")
  check("and not ChatGPT", ownFor([k("anthropic")], "openai") === null)
  check("OpenRouter answers both", ownFor([k("openrouter")], "anthropic") === "openrouter" && ownFor([k("openrouter")], "openai") === "openrouter")
  check("a vendor's own key comes before OpenRouter", ownFor([k("openrouter"), k("openai")], "openai") === "openai")

  section("Wired through, and out of the plan's AI edits")
  const provider = read("lib/sites/agent/provider.ts")
  const run = read("lib/sites/agent/run.ts")
  check("the monthly count leaves own runs out", /\.not\("provider", "like", "own:%"\)/.test(run))
  check("a run on their account is not stopped by the monthly allowance", /if \(providerId\.startsWith\("own:"\)\) return null/.test(run) && /await monthlyQuotaError\(creatorId, plan, provider\.id\)/.test(run))
  check("and costs Storelib nothing on the books", /provider\.id\.startsWith\("own:"\) \? \{ usd: 0, priced: true \}/.test(run))
  check("their key for that vendor first, then OpenRouter, then Storelib's", provider.indexOf("const direct = wanted") < provider.indexOf("const router = keys.openrouter") && provider.indexOf("const router = keys.openrouter") < provider.lastIndexOf("return resolveProvider(input)"))
  const routes = [
    "app/api/website-builder/themes/[installId]/agent/route.ts",
    "app/api/website-builder/themes/[installId]/sections/code/route.ts",
    "app/api/website-builder/themes/[installId]/sections/code/fix/route.ts",
    "app/api/sites/[siteId]/agent/route.ts",
  ]
  const unwired = routes.filter((r) => !/resolveForCreator\(/.test(read(r)) || /resolveProvider\(/.test(read(r)))
  check("every AI route resolves on the creator's account", unwired.length === 0, unwired)
  check("a creator with only their own key is answered even when Storelib has none", /canAnswer\(/.test(read(routes[0])) && /canAnswer\(/.test(read(routes[3])))

  section("The key never goes back to a browser")
  const store = read("lib/ai-keys/store.ts")
  const list = store.slice(store.indexOf("export async function listKeys"), store.indexOf("export async function readKeys"))
  check("the list the settings read never selects the sealed key", !/sealed_key/.test(list))
  const sql = read("supabase/sql/run-now/37_own_ai_keys.sql")
  check("the table has row level security and no policy: server only", /ENABLE ROW LEVEL SECURITY/.test(sql) && !/CREATE POLICY/i.test(sql) && /REVOKE ALL ON public\.creator_ai_keys FROM anon, authenticated/.test(sql))
  check("and the migration is the same", /ENABLE ROW LEVEL SECURITY/.test(read("supabase/migrations/20261006_creator_ai_keys.sql")))
  check("adding keys is rate limited, so this is no free key checker", /rateLimit\(\{ bucket: "ai-key"/.test(read("app/api/ai-keys/route.ts")))

  section("OpenRouter in one click, safely")
  const start = read("app/api/ai-keys/openrouter/route.ts")
  const callback = read("app/api/ai-keys/openrouter/callback/route.ts")
  check("PKCE with S256, the verifier in an httpOnly cookie", /code_challenge_method", "S256"/.test(start) && /httpOnly: true/.test(start) && /createHash\("sha256"\)/.test(start))
  check("the code is kept only for the person who started it", /started\.c !== creatorId/.test(callback))
  check("back only to the editor or the builder, never a free address", returnPath("../../evil") === "/app/website-builder" && returnPath("abc-123") === "/website-builder/editor/abc-123" && returnPath(null) === "/app/website-builder")
  check("the editor hands the result to Connections and takes it off the address", /url\.searchParams\.delete\("ownai"\)/.test(read("app/website-builder/editor/[installId]/page.tsx")))

  section("One way in, for somebody who has never heard of any of this")
  const panel = read("components/website-builder/website-settings/own-ai.tsx")
  check("nothing connected: one button, not three rows to choose between",
    /connected\.length === 0 && !keys/.test(panel) && /data-own-ai-start=""/.test(panel) && /Connect my AI/.test(panel))
  check("it says what will happen, in plain words, including the credit",
    /sign in with OpenRouter/.test(panel) && /few dollars of credit/.test(panel) && /about a minute/.test(panel))
  check("a key is for people who already have one, behind a line of text",
    /Already have a Claude or OpenAI key\?/.test(panel) && /setKeys\(true\)/.test(panel) &&
    /SOURCES\.filter\(\(s\) => s\.id === "openrouter"\)/.test(panel))
  check("and the rows come back once something is connected", /connected\.length > 0 \|\| keys/.test(panel))

  section("Where the creator finds it")
  check("Connections opens on Your own AI", /<OwnAiSettings installId=\{ctx\.installId\} \/>/.test(read("components/website-builder/website-settings/connections.tsx")))
  const picker = read("components/website-builder/ask-model-picker.tsx")
  check("the model menu says which models are on their account", /data-ask-model-own=""/.test(picker) && /data-ask-own-ai=/.test(picker))
  check("and the chat feeds it", /own=\{ownByEngine\}/.test(read("components/website-builder/theme-chat.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailed:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
