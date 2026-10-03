/**
 * YOUR OWN AI IN STORELIB AI.
 *
 * A creator connects their own OpenAI key (a Claude key kept from before
 * stays stored and unused), and the chat answers on it: the key is sealed before it is stored, checked
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
  const said = (status: number, source: "anthropic" | "openai" = "anthropic") => describeOwnKeyError({ status }, source)
  check("401: the key was refused, and where to fix it", /Your Claude key was refused/.test(said(401) ?? "") && /Connections/.test(said(401) ?? ""))
  check("402: out of credit", /Your OpenAI key is out of credit/.test(said(402, "openai") ?? ""))
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
  const direct = createAnthropicProvider(() => fakeAnthropic as never)
  const turn = await direct.complete(request("claude-sonnet-5"))
  check("on their own Claude key, by Anthropic's own name", sent[0]?.model === "claude-sonnet-5", sent[0]?.model)
  check("and the answer comes back as any other", turn.text === "hi" && turn.stop === "done")

  const openaiSent: Record<string, unknown>[] = []
  const fakeOpenAI = {
    responses: {
      create: async (params: Record<string, unknown>) => {
        openaiSent.push(params)
        return { output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }], usage: { input_tokens: 1, output_tokens: 1 }, incomplete_details: null }
      },
    },
  }
  await createOpenAIProvider(() => fakeOpenAI as never).complete(request("gpt-5.6-luna"))
  check("on their own OpenAI key, by OpenAI's own name", openaiSent[0]?.model === "gpt-5.6-luna", openaiSent[0]?.model)

  const ownOpenAI = openAIClientFor("sk-proj-abcdefghijklmnopqrstuvwxyz") as unknown as { baseURL: string; apiKey: string }
  check("their OpenAI key goes straight to OpenAI", ownOpenAI.baseURL === "https://api.openai.com/v1" && ownOpenAI.apiKey === "sk-proj-abcdefghijklmnopqrstuvwxyz", ownOpenAI.baseURL)
  const ownClaude = anthropicClientFor("sk-ant-api03-abcdefghijklmnopqrstuvwxyz") as unknown as { baseURL: string }
  check("and a Claude key straight to Anthropic", ownClaude.baseURL === "https://api.anthropic.com", ownClaude.baseURL)

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
  const k = (source: "anthropic" | "openai") => ({ source, hint: "abcd", connectedAt: "", lastUsedAt: null, lastError: null })
  check("their Claude key answers Claude", ownFor([k("anthropic")], "anthropic") === "anthropic")
  check("and not ChatGPT", ownFor([k("anthropic")], "openai") === null)
  check("their OpenAI key answers ChatGPT", ownFor([k("openai")], "openai") === "openai")
  check("nothing connected, nothing answers on their account", ownFor([], "openai") === null)

  section("Wired through, and out of the plan's AI edits")
  const provider = read("lib/sites/agent/provider.ts")
  const run = read("lib/sites/agent/run.ts")
  check("the monthly count leaves own runs out", /\.not\("provider", "like", "own:%"\)/.test(run))
  check("a run on their account is not stopped by the monthly allowance", /if \(providerId\.startsWith\("own:"\)\) return null/.test(run) && /await monthlyQuotaError\(creatorId, plan, provider\.id\)/.test(run))
  check("and costs Storelib nothing on the books", /provider\.id\.startsWith\("own:"\) \? \{ usd: 0, priced: true \}/.test(run))
  check("their OpenAI key first, then Storelib's", provider.indexOf("const direct = keys.openai") > 0 && provider.indexOf("const direct = keys.openai") < provider.lastIndexOf("return resolveProvider(input)"))
  /* Storelib AI runs on ChatGPT only for now: a Claude key kept from before is not deleted, and not used. */
  check("a Claude key kept from before answers nothing, and is not deleted", !/keys\.anthropic/.test(provider) && /ANSWERING_SOURCES: readonly KeySource\[\] = \["openai"\]/.test(provider) && !/removeKey\(creatorId, "anthropic"\)/.test(read("app/api/ai-keys/route.ts")))
  check("and a new one is not taken", /if \(source !== "openai"\) return NextResponse\.json\(\{ error: "Add an OpenAI key\." \}, \{ status: 400 \}\)/.test(read("app/api/ai-keys/route.ts")))
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

  section("Storelib AI is OpenAI only: no OpenRouter anywhere")
  check("a connection is an OpenAI key or a Claude key kept from before, nothing else", /export type KeySource = "anthropic" \| "openai"\n/.test(store) && !/openrouter/i.test(store))
  check("a row saved under a source no longer offered is read as nothing connected, and never deleted",
    /\.filter\(\(r\) => isKeySource\(r\.provider\)\)/.test(store) && /if \(!isKeySource\(row\.provider\)\) continue/.test(store) && !/\.delete\(\)\.eq\("creator_id", creatorId\)\s*\n?\s*\.neq/.test(store))
  const offOpenRouter = [
    "lib/ai-keys/store.ts", "lib/ai-keys/verify.ts", "lib/ai-keys/errors.ts", "lib/ai-keys/crypto.ts",
    "lib/sites/agent/provider.ts", "lib/sites/agent/openai-provider.ts", "lib/sites/agent/anthropic-provider.ts",
    "app/api/ai-keys/route.ts", "app/api/website-builder/themes/[installId]/agent/route.ts", "app/website-builder/editor/[installId]/page.tsx",
    "components/website-builder/use-own-ai.ts", "components/website-builder/website-settings/own-ai.tsx",
    "components/website-builder/ask-model-picker.tsx", "components/website-builder/theme-chat.tsx", "content/developers/ai.md",
  ].filter((f) => /openrouter/i.test(read(f)))
  check("no code, screen or doc names OpenRouter", offOpenRouter.length === 0, offOpenRouter)
  const { existsSync } = await import("node:fs")
  check("its sign in routes are gone", !existsSync(join(root, "app/api/ai-keys/openrouter")) && !existsSync(join(root, "lib/ai-keys/openrouter.ts")))

  section("One way in")
  const panel = read("components/website-builder/website-settings/own-ai.tsx")
  check("Connections offers OpenAI, and no Claude key line for now",
    /id: "openai"/.test(panel) && !/id: "anthropic"/.test(panel) && !/sk-ant-/.test(panel) && !/Claude or OpenAI key|Claude and ChatGPT then|use Claude or ChatGPT on your account/.test(panel))
  check("the OpenAI row is there from the start: paste a key from platform.openai.com",
    /\{SOURCES\.map\(/.test(panel) && /platform\.openai\.com/.test(panel) && /It is checked before it is kept\./.test(panel))

  section("Where the creator finds it")
  check("Connections opens on Your own AI", /<OwnAiSettings \/>/.test(read("components/website-builder/website-settings/connections.tsx")))
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
