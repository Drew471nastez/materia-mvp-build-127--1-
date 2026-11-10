/**
 * Round P, P1: the AI builder makes pictures (lib/storelib-ai/images).
 *
 *   1. safety: unsafe prompts refused before any call; ordinary shop words pass
 *   2. prompt shaping: art direction, light, lens, "no text, no logos"
 *   3. each provider over a fake HTTP, request shape as documented:
 *        OpenAI   POST /v1/images/generations (model, prompt, n, size, quality,
 *                 output_format; no response_format), b64_json back, usage priced;
 *                 gpt-image-1 shut down 2026-10-23, so gpt-image-2.5-flare first
 *        Gemini   POST /v1beta/interactions with x-goog-api-key and Api-Revision
 *                 2026-05-20, response_format { type: image, aspect_ratio }, the
 *                 image read from steps[].content[] (or outputs[])
 *        Pexels   GET /v1/search?query&orientation with Authorization: <key>, the
 *                 photo downloaded from images.pexels.com only, credit kept
 *      timeouts and one retry; a model the account lacks moves to the next
 *   4. the chain: own key before Storelib's, a refused own key never replaced by a
 *      paid platform provider, OpenAI then Gemini then stock then none; the cap
 *   5. storage: the files bucket, the owner's ai-images folder, file_details with
 *      source and origin (and without them before part 441), the /media/ address
 *   6. no key in any log line or result
 *   7. the agent's tools: refused before the concept, side by side (at most three),
 *      spend added to the job, the per-job cap, plain progress words, the brief's note
 *   8. Regenerate: owner only, own AI pictures only, rate limited, cost capped
 *   9. the files library lists the folder as "AI"
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-images-p1.test.ts
 */
import { checkImagePrompt } from "@/lib/storelib-ai/images/safety"
import { altFromPrompt, imageBriefNote, makingWords, shapeImagePrompt } from "@/lib/storelib-ai/images/prompt"
import { geminiImage, geminiImageOf, openAIImage, pexelsPhoto, scrub, type Fetch } from "@/lib/storelib-ai/images/providers"
import { findPhoto, generateImage, imageServices, type ImageDeps } from "@/lib/storelib-ai/images/generate"
import { saveImageToLibrary } from "@/lib/storelib-ai/images/store"
import { aiImagePathOf, isAiImagePath } from "@/lib/storelib-ai/images/paths"
import { handleRegenerate, type RegenerateDeps } from "@/lib/storelib-ai/images/regenerate"
import type { ImageOrigin, ImageOutcome } from "@/lib/storelib-ai/images/types"
import { listLibrary } from "@/lib/files/library"
import { runAgentSlice, inPool, PICTURE_CONCURRENCY } from "@/lib/ai-builder/agent/loop"
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import { TOOL_SPECS } from "@/lib/ai-builder/agent/tool-specs"
import { jobImages, maxImagesFromEnv } from "@/lib/ai-builder/agent/server"
import type { AgentDeps, AgentJobInput, ImageService } from "@/lib/ai-builder/agent/ports"
import type { ProviderRequest } from "@/lib/sites/agent/types"
import { AGENT_TOOL_NAMES, DEFAULT_JOB_BUDGET, type AgentEvent, type JobBudget } from "@/lib/ai-builder/types"
import { CAPS, CONCEPT, scripted, type Step } from "./ai-builder-agent-fixtures"
import { sitePlan } from "./ai-builder-whole-site-fixtures"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 800)}`}`)
  }
}

/* A real 4x3 PNG: the storage gate reads the bytes. */
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGNocFCAIwacHADRZwqBZaYHGAAAAABJRU5ErkJggg=="
const PNG = new Uint8Array(Buffer.from(PNG_B64, "base64"))

const PLATFORM_OPENAI = "sk-platform-SECRET-0000aaaa"
const OWN_OPENAI = "sk-own-creator-SECRET-1111bbbb"
const GEMINI = "AIzaGEMINI-SECRET-2222cccc-dddddddd"
const PEXELS = "pexels-SECRET-3333eeee"
const SECRETS = [PLATFORM_OPENAI, OWN_OPENAI, GEMINI, PEXELS]

type Seen = { url: string; method: string; headers: Record<string, string>; body: unknown }
type Route = ((req: Seen) => Response | Promise<Response>) | "throw" | "hang"

/** A fake fetch: routes by host and path, records every request. */
function fakeHttp(routes: Record<string, Route | Route[]>) {
  const seen: Seen[] = []
  const counts: Record<string, number> = {}
  const fetch: Fetch = async (input, init) => {
    const u = new URL(input)
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((v, k) => (headers[k.toLowerCase()] = v))
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined
    const req: Seen = { url: input, method: init?.method ?? "GET", headers, body }
    seen.push(req)
    const key = Object.keys(routes).find((k) => `${u.host}${u.pathname}`.startsWith(k))
    if (!key) throw new Error(`no route for ${u.host}${u.pathname}`)
    const r = routes[key]
    const n = (counts[key] = (counts[key] ?? 0) + 1)
    const route = Array.isArray(r) ? r[Math.min(n, r.length) - 1] : r
    const out = typeof route === "string" ? route : await route(req)
    if (out === "throw") throw Object.assign(new Error("socket hang up"), { name: "TypeError" })
    if (out === "hang") {
      await new Promise((resolve, reject) => {
        const signal = init?.signal
        signal?.addEventListener("abort", () => reject(signal.reason ?? Object.assign(new Error("timeout"), { name: "TimeoutError" })))
      })
    }
    return out as Response
  }
  return { fetch, seen }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const openAIOk = (usage?: unknown) => json({ created: 1, data: [{ b64_json: PNG_B64 }], ...(usage ? { usage } : {}) })
const geminiOk = (schema: "steps" | "outputs" = "steps") =>
  json(schema === "steps" ? { id: "int_1", steps: [{ type: "model_output", content: [{ type: "text", text: "Here it is" }, { type: "image", mime_type: "image/png", data: PNG_B64 }] }] } : { id: "int_1", outputs: [{ type: "image", mime_type: "image/png", data: PNG_B64 }] })
const pexelsSearch = (photos?: unknown[]) =>
  json({
    page: 1,
    per_page: 10,
    photos: photos ?? [
      { id: 1, width: 6000, height: 4000, url: "https://www.pexels.com/photo/1/", alt: "Chalked hands on a barbell", photographer: "Ana Ruiz", photographer_url: "https://www.pexels.com/@ana", src: { large2x: "https://images.pexels.com/photos/1/a.jpeg?w=1880", large: "https://images.pexels.com/photos/1/a.jpeg?w=940" } },
      { id: 2, width: 5000, height: 3000, url: "https://www.pexels.com/photo/2/", alt: "Gym floor", photographer: "Kim Lee", photographer_url: "https://www.pexels.com/@kim", src: { large2x: "https://images.pexels.com/photos/2/b.jpeg?w=1880" } },
    ],
  })
const pexelsImage = () => new Response(PNG, { status: 200, headers: { "content-type": "image/png", "content-length": String(PNG.length) } })

/** A fake media library: what was saved, never a real bucket. */
function fakeSave() {
  const saved: Parameters<NonNullable<ImageDeps["save"]>>[0][] = []
  const save: NonNullable<ImageDeps["save"]> = async (input) => {
    saved.push(input)
    const path = `${input.ownerUserId}/ai-images/${saved.length}.png`
    return { ok: true, url: `https://storelib.com/media/store-builder-images/${path}`, width: input.origin.width, height: input.origin.height, mediaId: `store-builder-images:${path}`, path }
  }
  return { save, saved }
}

const OWNER = "0f0e0d0c-aaaa-bbbb-cccc-000000000001"
const CREATOR = "c0000000-aaaa-bbbb-cccc-000000000002"

function chainDeps(env: Record<string, string>, routes: Record<string, Route | Route[]>, extra: Partial<ImageDeps> = {}) {
  const http = fakeHttp(routes)
  const store = fakeSave()
  const logs: string[] = []
  const notes: (string | null)[] = []
  const deps: ImageDeps = {
    env,
    fetch: http.fetch,
    save: store.save,
    ownOpenAIKey: async () => null,
    noteOwnKey: async (_c, e) => void notes.push(e),
    log: (l) => logs.push(l),
    timeoutMs: 200,
    retryDelayMs: 0,
    ...extra,
  }
  return { deps, http, store, logs, notes }
}

/** The tool results of the slice's last turn (the live turns, not yet sent back to the model). */
const lastResults = (r: { live?: unknown[] }) => (r.live ?? []).filter((t) => (t as { role: string }).role === "tool").at(-1) as { results?: { id: string; output: string }[] } | undefined

const base = { creatorId: CREATOR, ownerUserId: OWNER, jobId: "job-1" }

async function main() {
  /* AbortSignal.timeout's timer does not hold the process open; a fake request that hangs would let it exit. */
  const keepAlive = setInterval(() => undefined, 1_000)
  /* ── 1. safety ────────────────────────────────────────────────────── */
  console.log("\n1. safety")
  for (const bad of ["a nude model on a bed", "a portrait of Taylor Swift holding a coffee", "the Nike logo on a running shoe", "a pistol on a table", "a bloody knife fight", "a celebrity lookalike lifting weights", "children in bikinis at the beach"]) {
    check(`refused: ${bad}`, checkImagePrompt(bad).ok === false)
  }
  for (const good of ["a lavender bath bomb fizzing in a white tub", "a massage gun on a gym bench", "blood orange slices on marble", "a coach spotting a deadlift, no logos, no text", "a baby bath towel folded on a shelf", "sunlight through the Amazon rainforest canopy"]) {
    check(`allowed: ${good}`, checkImagePrompt(good).ok === true, checkImagePrompt(good))
  }

  /* ── 2. shaping ───────────────────────────────────────────────────── */
  console.log("\n2. prompt shaping")
  const shaped = shapeImagePrompt({ prompt: "a coach spotting a client's deadlift in a concrete gym", aspect: "landscape", purpose: "hero", direction: { imagery: "Real training in the real gym: hard side light, sweat and chalk", mood: ["blunt", "warm"], palette: ["#f4efe6", "#c2410c"], mode: "light", avoid: ["stock smiles"] } })
  check("the art direction, mood, palette and avoid list are in", /hard side light, sweat and chalk/.test(shaped) && /blunt, warm/.test(shaped) && /#c2410c/.test(shaped) && /stock smiles/.test(shaped))
  check("light and lens fitted to the direction and the purpose", /hard directional side light/.test(shaped) && /35mm/.test(shaped) && /quiet area where a headline can sit/.test(shaped))
  check("no text, logos or real people, always", /No text, letters, numbers, signage, logos, brand marks or watermarks/.test(shaped) && /No recognisable real person/.test(shaped))
  check("product pictures get a macro lens", /100mm macro/.test(shapeImagePrompt({ prompt: "a candle", aspect: "square", purpose: "product" })))
  check("plain progress words", makingWords("hero") === "Making the hero photo" && makingWords("hero photo", true) === "Made the hero photo" && makingWords(undefined) === "Making a photo")
  check("alt text from the prompt", altFromPrompt("a photo of chalked hands on a barbell. Hard light.") === "Chalked hands on a barbell")

  /* ── 3. providers over fake HTTP ──────────────────────────────────── */
  console.log("\n3. providers, as documented")
  {
    const http = fakeHttp({ "api.openai.com/v1/images/generations": () => openAIOk({ input_tokens: 50, input_tokens_details: { text_tokens: 50, image_tokens: 0 }, output_tokens: 1056, total_tokens: 1106 }) })
    const r = await openAIImage({ key: PLATFORM_OPENAI, prompt: "P", aspect: "landscape", quality: "medium", models: ["gpt-image-2.5-flare"] }, { fetch: http.fetch, timeoutMs: 200, retryDelayMs: 0 })
    const req = http.seen[0]
    const body = req.body as Record<string, unknown>
    check("OpenAI: POST https://api.openai.com/v1/images/generations with Bearer auth and JSON", req.method === "POST" && req.url === "https://api.openai.com/v1/images/generations" && req.headers.authorization === `Bearer ${PLATFORM_OPENAI}` && req.headers["content-type"] === "application/json")
    check("OpenAI body: model, prompt, n 1, size 1536x1024, quality medium, jpeg; no response_format (GPT image models answer base64)", body.model === "gpt-image-2.5-flare" && body.prompt === "P" && body.n === 1 && body.size === "1536x1024" && body.quality === "medium" && body.output_format === "jpeg" && !("response_format" in body), body)
    check("OpenAI: b64_json decoded, usage priced (50 text in at $5/M + 1056 out at $30/M)", r.ok === true && r.bytes.length === PNG.length && Math.abs(r.usd - (50 * 5 + 1056 * 30) / 1e6) < 1e-9 && r.estimated === false, r)
    for (const [aspect, size] of [["square", "1024x1024"], ["portrait", "1024x1536"]] as const) {
      const h = fakeHttp({ "api.openai.com/v1/images/generations": () => openAIOk() })
      const x = await openAIImage({ key: "k-xxxxxx", prompt: "P", aspect, quality: "medium", models: ["m"] }, { fetch: h.fetch, timeoutMs: 200, retryDelayMs: 0 })
      check(`OpenAI ${aspect} is ${size}; no usage is an estimate`, (h.seen[0].body as { size: string }).size === size && x.ok === true && x.estimated === true && x.usd > 0)
    }
    const fall = fakeHttp({ "api.openai.com/v1/images/generations": [() => json({ error: { code: "model_not_found", message: "The model gpt-image-x does not exist" } }, 404), () => openAIOk()] })
    const f = await openAIImage({ key: "k-xxxxxx", prompt: "P", aspect: "square", quality: "medium", models: ["gpt-image-x", "gpt-image-2.6-flare"] }, { fetch: fall.fetch, timeoutMs: 200, retryDelayMs: 0 })
    check("OpenAI: a model the account lacks moves to the next", f.ok === true && f.model === "gpt-image-2.6-flare" && fall.seen.length === 2)
    const retry = fakeHttp({ "api.openai.com/v1/images/generations": [() => json({ error: { message: "busy" } }, 503), () => openAIOk()] })
    check("OpenAI: a 503 is retried once", (await openAIImage({ key: "k-xxxxxx", prompt: "P", aspect: "square", quality: "medium", models: ["m"] }, { fetch: retry.fetch, timeoutMs: 200, retryDelayMs: 0 })).ok === true && retry.seen.length === 2)
    const hang = fakeHttp({ "api.openai.com/v1/images/generations": ["hang", "hang"] })
    const h2 = await openAIImage({ key: "k-xxxxxx", prompt: "P", aspect: "square", quality: "medium", models: ["m"] }, { fetch: hang.fetch, timeoutMs: 50, retryDelayMs: 0 })
    check("OpenAI: a call that hangs times out, is retried once, then fails plainly", h2.ok === false && h2.kind === "unavailable" && /timed out/.test(h2.message) && hang.seen.length === 2, h2)
    const mod = fakeHttp({ "api.openai.com/v1/images/generations": () => json({ error: { code: "moderation_blocked", message: "Your request was rejected by the safety system." } }, 400) })
    const m = await openAIImage({ key: "k-xxxxxx", prompt: "P", aspect: "square", quality: "medium", models: ["m"] }, { fetch: mod.fetch, timeoutMs: 200, retryDelayMs: 0 })
    check("OpenAI: its safety refusal is final (refused, not retried)", m.ok === false && m.kind === "refused" && mod.seen.length === 1)
    const auth = fakeHttp({ "api.openai.com/v1/images/generations": () => json({ error: { message: `Incorrect API key provided: ${OWN_OPENAI}` } }, 401) })
    const a = await openAIImage({ key: OWN_OPENAI, prompt: "P", aspect: "square", quality: "medium", models: ["m"] }, { fetch: auth.fetch, timeoutMs: 200, retryDelayMs: 0 })
    check("OpenAI: 401 is auth, and the key echoed in its error is scrubbed", a.ok === false && a.kind === "auth" && !a.message.includes(OWN_OPENAI) && !a.message.includes("SECRET"), a)
  }
  {
    const http = fakeHttp({ "generativelanguage.googleapis.com/v1beta/interactions": () => geminiOk("steps") })
    const r = await geminiImage({ key: GEMINI, prompt: "P", aspect: "landscape", models: ["gemini-nano-banana-2.1"] }, { fetch: http.fetch, timeoutMs: 200, retryDelayMs: 0 })
    const req = http.seen[0]
    const body = req.body as { model: string; input: { type: string; text: string }[]; response_format: Record<string, string> }
    check("Gemini: POST {base}/interactions with x-goog-api-key and Api-Revision 2026-05-20", req.method === "POST" && req.url === "https://generativelanguage.googleapis.com/v1beta/interactions" && req.headers["x-goog-api-key"] === GEMINI && req.headers["api-revision"] === "2026-05-20" && !req.url.includes("key="))
    check("Gemini body: model, input text, response_format { type image, aspect_ratio 3:2, image_size 1K }", body.model === "gemini-nano-banana-2.1" && body.input[0].type === "text" && body.input[0].text === "P" && body.response_format.type === "image" && body.response_format.aspect_ratio === "3:2" && body.response_format.image_size === "1K", body)
    check("Gemini: the image block read from steps[].content[]", r.ok === true && r.bytes.length === PNG.length && r.mime === "image/png")
    check("Gemini: the older outputs[] schema read too", !!geminiImageOf({ outputs: [{ type: "image", data: PNG_B64, mime_type: "image/png" }] }) && geminiImageOf({ steps: [{ type: "model_output", content: [{ type: "text", text: "no" }] }] }) === null)
    const none = fakeHttp({ "generativelanguage.googleapis.com/v1beta/interactions": () => json({ steps: [{ type: "model_output", content: [{ type: "text", text: "I can't draw that" }] }] }) })
    const n = await geminiImage({ key: GEMINI, prompt: "P", aspect: "square", models: ["g"] }, { fetch: none.fetch, timeoutMs: 200, retryDelayMs: 0 })
    check("Gemini: an answer with no picture is a refusal", n.ok === false && n.kind === "refused")
    const own = fakeHttp({ "gem.test/v1/interactions": () => geminiOk("outputs") })
    check("Gemini: GEMINI_API_BASE is used when set", (await geminiImage({ key: GEMINI, prompt: "P", aspect: "portrait", models: ["g"], base: "https://gem.test/v1/" }, { fetch: own.fetch, timeoutMs: 200, retryDelayMs: 0 })).ok === true && (own.seen[0].body as { response_format: { aspect_ratio: string } }).response_format.aspect_ratio === "2:3")
  }
  {
    const http = fakeHttp({ "api.pexels.com/v1/search": () => pexelsSearch(), "images.pexels.com/": () => pexelsImage() })
    const r = await pexelsPhoto({ key: PEXELS, query: "barbell chalk hands", aspect: "landscape" }, { fetch: http.fetch, timeoutMs: 200, retryDelayMs: 0 })
    const search = new URL(http.seen[0].url)
    check("Pexels: GET /v1/search with query, orientation, size, per_page and Authorization: <key> (no Bearer)", http.seen[0].method === "GET" && search.host === "api.pexels.com" && search.searchParams.get("query") === "barbell chalk hands" && search.searchParams.get("orientation") === "landscape" && search.searchParams.get("per_page") === "10" && http.seen[0].headers.authorization === PEXELS)
    check("Pexels: the photo downloaded from images.pexels.com, with the photographer's credit", r.ok === true && http.seen[1].url.startsWith("https://images.pexels.com/photos/1/") && r.credit.photographer === "Ana Ruiz" && r.credit.sourceUrl === "https://www.pexels.com/photo/1/" && r.alt === "Chalked hands on a barbell", r)
    check("Pexels: the photo's own key never goes to the image host", !("authorization" in http.seen[1].headers))
    const evil = fakeHttp({ "api.pexels.com/v1/search": () => pexelsSearch([{ id: 9, width: 1, height: 1, photographer: "X", src: { large2x: "https://evil.test/x.jpg" } }]) })
    const e = await pexelsPhoto({ key: PEXELS, query: "q", aspect: "square" }, { fetch: evil.fetch, timeoutMs: 200, retryDelayMs: 0 })
    check("Pexels: a photo address off images.pexels.com is never fetched", e.ok === false && e.kind === "none" && evil.seen.length === 1)
    const second = fakeHttp({ "api.pexels.com/v1/search": () => pexelsSearch(), "images.pexels.com/": () => pexelsImage() })
    const s2 = await pexelsPhoto({ key: PEXELS, query: "q", aspect: "square", pick: 1 }, { fetch: second.fetch, timeoutMs: 200, retryDelayMs: 0 })
    check("Pexels: another match for a Regenerate", s2.ok === true && s2.credit.photographer === "Kim Lee")
  }

  /* ── 4. the chain ─────────────────────────────────────────────────── */
  console.log("\n4. the fallback chain")
  {
    const c = chainDeps({ OPENAI_API_KEY: PLATFORM_OPENAI, GEMINI_API_KEY: GEMINI, PEXELS_API_KEY: PEXELS }, { "api.openai.com/": () => openAIOk() })
    const r = await generateImage({ ...base, prompt: "a coach spotting a deadlift", aspect: "landscape", purpose: "hero", alt: "Coach spotting a deadlift" }, c.deps)
    const o = c.store.saved[0]?.origin
    check("OpenAI on Storelib's key first: an AI picture in the files", r.ok === true && r.provider === "openai" && r.source === "ai" && r.url.includes("/media/store-builder-images/") && r.alt === "Coach spotting a deadlift" && c.http.seen[0].headers.authorization === `Bearer ${PLATFORM_OPENAI}`, r)
    check("the media row: source ai, the prompt (unshaped), aspect, model, job", o?.source === "ai" && o.prompt === "a coach spotting a deadlift" && o.aspect === "landscape" && o.model === "gpt-image-2.5-flare" && o.jobId === "job-1" && c.store.saved[0].ownerUserId === OWNER)
    check("the prompt sent is shaped (no text, no logos)", /No text, letters/.test(String((c.http.seen[0].body as { prompt: string }).prompt)))
  }
  {
    const c = chainDeps({ OPENAI_API_KEY: PLATFORM_OPENAI }, { "api.openai.com/": () => openAIOk() }, { ownOpenAIKey: async () => OWN_OPENAI })
    const r = await generateImage({ ...base, prompt: "a candle on oak" }, c.deps)
    check("the creator's own OpenAI key before Storelib's, and its use noted", r.ok === true && r.ownKey === true && c.http.seen[0].headers.authorization === `Bearer ${OWN_OPENAI}` && c.notes.length === 1 && c.notes[0] === null)
  }
  {
    const c = chainDeps({ OPENAI_API_KEY: PLATFORM_OPENAI, GEMINI_API_KEY: GEMINI, PEXELS_API_KEY: PEXELS }, { "api.openai.com/": () => json({ error: { message: "bad key" } }, 401), "generativelanguage.googleapis.com/": () => geminiOk(), "api.pexels.com/": () => pexelsSearch(), "images.pexels.com/": () => pexelsImage() }, { ownOpenAIKey: async () => OWN_OPENAI })
    const r = await generateImage({ ...base, prompt: "a candle on oak" }, c.deps)
    check("a refused own key is noted and NEVER replaced by a paid platform provider: straight to stock", r.ok === true && r.provider === "pexels" && !c.http.seen.some((s) => s.url.includes("generativelanguage")) && c.http.seen.filter((s) => s.url.includes("openai")).length === 1 && typeof c.notes[0] === "string", { r, seen: c.http.seen.map((s) => s.url) })
  }
  {
    const c = chainDeps({ GEMINI_API_KEY: GEMINI }, { "generativelanguage.googleapis.com/": () => geminiOk() })
    const r = await generateImage({ ...base, prompt: "a candle on oak", aspect: "square" }, c.deps)
    check("no OpenAI key: Gemini", r.ok === true && r.provider === "gemini" && r.usd > 0 && c.store.saved[0].origin.provider === "gemini")
  }
  {
    const c = chainDeps({ GOOGLE_AI_API_KEY: GEMINI, GEMINI_IMAGE_USD: "0.05" }, { "generativelanguage.googleapis.com/": () => geminiOk() })
    const r = await generateImage({ ...base, prompt: "a candle on oak" }, c.deps)
    check("GOOGLE_AI_API_KEY works as the translator's does; GEMINI_IMAGE_USD prices it", r.ok === true && r.usd === 0.05)
  }
  {
    const c = chainDeps({ OPENAI_API_KEY: PLATFORM_OPENAI, GEMINI_API_KEY: GEMINI }, { "api.openai.com/": () => json({ error: { message: "down" } }, 500), "generativelanguage.googleapis.com/": () => geminiOk() })
    const r = await generateImage({ ...base, prompt: "a candle on oak" }, c.deps)
    check("OpenAI down (500, retried once): Gemini answers", r.ok === true && r.provider === "gemini" && c.http.seen.filter((s) => s.url.includes("openai")).length === 2)
  }
  {
    const c = chainDeps({ PEXELS_API_KEY: PEXELS }, { "api.pexels.com/": () => pexelsSearch(), "images.pexels.com/": () => pexelsImage() })
    const r = await generateImage({ ...base, prompt: "a photo of chalked hands on a barbell in hard light" }, c.deps)
    check("only Pexels: a stock photo, free, the credit kept on the media row", r.ok === true && r.source === "stock" && r.usd === 0 && r.credit?.photographer === "Ana Ruiz" && c.store.saved[0].origin.source === "stock" && c.store.saved[0].origin.credit?.photographer === "Ana Ruiz")
    check("the stock search is the subject's words, not the art direction", new URL(c.http.seen[0].url).searchParams.get("query") === "chalked hands barbell hard")
  }
  {
    const c = chainDeps({}, {})
    const r = await generateImage({ ...base, prompt: "a candle on oak" }, c.deps)
    check("no service at all: no_provider, said plainly, nothing called", r.ok === false && r.code === "no_provider" && /No picture service is set up/.test(r.reason) && c.http.seen.length === 0)
    check("imageServices says the same", JSON.stringify(imageServices({})) === JSON.stringify({ generate: null, stock: false }) && imageServices({}, true).generate === "openai" && imageServices({ GEMINI_API_KEY: "x" }).generate === "gemini" && imageServices({ PEXELS_API_KEY: "x" }).stock === true)
  }
  {
    const c = chainDeps({ OPENAI_API_KEY: PLATFORM_OPENAI, PEXELS_API_KEY: PEXELS }, { "api.openai.com/": () => openAIOk() })
    const r = await generateImage({ ...base, prompt: "a nude model on a bed" }, c.deps)
    check("an unsafe prompt: refused, nothing called, nothing spent", r.ok === false && r.code === "unsafe" && r.usd === 0 && c.http.seen.length === 0)
  }
  {
    const c = chainDeps({ OPENAI_API_KEY: PLATFORM_OPENAI, GEMINI_API_KEY: GEMINI }, { "api.openai.com/": () => openAIOk(), "generativelanguage.googleapis.com/": () => geminiOk() })
    const r = await generateImage({ ...base, prompt: "a candle on oak", maxUsd: 0.01 }, c.deps)
    check("the cap: no paid provider is asked when its estimate is over the money left", r.ok === false && r.code === "over_budget" && c.http.seen.length === 0, r)
  }
  {
    const c = chainDeps({ OPENAI_API_KEY: PLATFORM_OPENAI, PEXELS_API_KEY: PEXELS }, { "api.openai.com/": () => json({ error: { code: "moderation_blocked", message: "rejected by the safety system" } }, 400), "api.pexels.com/": () => pexelsSearch() })
    const r = await generateImage({ ...base, prompt: "a candle on oak" }, c.deps)
    check("a provider's safety refusal is final: not laundered through another provider", r.ok === false && r.code === "unsafe" && !c.http.seen.some((s) => s.url.includes("pexels")))
  }
  {
    const c = chainDeps({ OPENAI_API_KEY: PLATFORM_OPENAI }, { "api.openai.com/": () => openAIOk() })
    const r = await findPhoto({ ...base, query: "barbell" }, c.deps)
    check("find_photo without PEXELS_API_KEY: refused plainly, OpenAI not used", r.ok === false && r.code === "no_provider" && /PEXELS_API_KEY/.test(r.reason) && c.http.seen.length === 0)
  }

  /* ── 5. storage ───────────────────────────────────────────────────── */
  console.log("\n5. storage")
  {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co"
    const uploads: { bucket: string; path: string; opts: Record<string, unknown> }[] = []
    const rows: Record<string, unknown>[] = []
    let refuseColumns = false
    const admin = {
      storage: {
        from: (bucket: string) => ({
          upload: async (path: string, _bytes: Uint8Array, opts: Record<string, unknown>) => (uploads.push({ bucket, path, opts }), { error: null }),
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
        }),
      },
      from: (table: string) => ({
        upsert: async (row: Record<string, unknown>) => {
          if (table !== "file_details") return { error: { message: "wrong table" } }
          if (refuseColumns && "origin" in row) return { error: { code: "PGRST204", message: "Could not find the 'origin' column of 'file_details' in the schema cache" } }
          rows.push(row)
          return { error: null }
        },
      }),
    }
    const origin: ImageOrigin = { source: "ai", provider: "openai", model: "gpt-image-2.5-flare", prompt: "a candle", aspect: "square", jobId: "job-1", width: 1024, height: 1024, createdAt: "2026-11-10T00:00:00.000Z" }
    const s = await saveImageToLibrary(admin, { ownerUserId: OWNER, creatorId: CREATOR, bytes: PNG, alt: "A candle", origin })
    check("stored in store-builder-images under the owner's ai-images folder, as an image, cached a year", s.ok === true && uploads[0].bucket === "store-builder-images" && new RegExp(`^${OWNER}/ai-images/\\d+-[a-z0-9]+\\.png$`).test(uploads[0].path) && uploads[0].opts.contentType === "image/png" && uploads[0].opts.upsert === false, uploads)
    check("Storelib's /media/ address, never the storage host; real size from the bytes", s.ok === true && s.url.startsWith("https://storelib.com/media/store-builder-images/") && !s.url.includes("supabase") && s.width === 4 && s.height === 3 && s.mediaId === `store-builder-images:${uploads[0].path}`, s)
    check("file_details: the creator, the alt, source ai and the origin", rows[0]?.creator_id === CREATOR && rows[0]?.alt_text === "A candle" && rows[0]?.source === "ai" && (rows[0]?.origin as ImageOrigin).prompt === "a candle" && (rows[0]?.origin as ImageOrigin).width === 4)
    check("the url reads back as an AI picture of this owner, and nobody else's", s.ok === true && aiImagePathOf(s.url) === uploads[0].path && isAiImagePath(OWNER, uploads[0].path) && !isAiImagePath("someone-else", uploads[0].path) && aiImagePathOf("https://storelib.com/media/store-builder-images/u/sections/x.png") === null)
    refuseColumns = true
    const s2 = await saveImageToLibrary(admin, { ownerUserId: OWNER, creatorId: CREATOR, bytes: PNG, alt: "A candle", origin })
    check("before part 441: the picture and its alt text kept all the same", s2.ok === true && rows.length === 2 && !("origin" in rows[1]) && rows[1].alt_text === "A candle")
    const bad = await saveImageToLibrary(admin, { ownerUserId: OWNER, creatorId: CREATOR, bytes: new TextEncoder().encode("<html><script>alert(1)</script></html>"), alt: "x", origin })
    check("bytes that are not a picture are never stored", bad.ok === false && uploads.length === 2)
  }

  /* ── 6. no key in logs ────────────────────────────────────────────── */
  console.log("\n6. keys never logged")
  {
    const lines: string[] = []
    const orig = { log: console.log, warn: console.warn, error: console.error }
    console.warn = (...a: unknown[]) => void lines.push(a.map(String).join(" "))
    console.error = (...a: unknown[]) => void lines.push(a.map(String).join(" "))
    try {
      const http = fakeHttp({
        "api.openai.com/": () => json({ error: { message: `Incorrect API key provided: ${PLATFORM_OPENAI}. Bearer ${PLATFORM_OPENAI}` } }, 401),
        "generativelanguage.googleapis.com/": () => json({ error: { code: 400, status: "INVALID_ARGUMENT", message: `bad request for key=${GEMINI}` } }, 400),
        "api.pexels.com/": () => json({ error: PEXELS }, 500),
      })
      const r = await generateImage({ ...base, prompt: "a candle on oak" }, { env: { OPENAI_API_KEY: PLATFORM_OPENAI, GEMINI_API_KEY: GEMINI, PEXELS_API_KEY: PEXELS }, fetch: http.fetch, save: fakeSave().save, ownOpenAIKey: async () => null, timeoutMs: 200, retryDelayMs: 0 })
      const all = `${lines.join("\n")}\n${JSON.stringify(r)}`
      check("every provider failed and said so (in the default log)", r.ok === false && lines.some((l) => l.includes("[ai-images] openai")) && lines.some((l) => l.includes("[ai-images] gemini")), lines)
      check("no key, in any log line or the result", SECRETS.every((k) => !all.includes(k)) && !/SECRET/.test(all), all)
    } finally {
      Object.assign(console, orig)
    }
    check("scrub takes out keys it was told of and key shapes it was not", !scrub(`x ${PLATFORM_OPENAI} sk-abcdefgh12345678 AIzaSyA1234567890123456789012 Bearer abc.def ?key=zzz`, [PLATFORM_OPENAI]).match(/SECRET|sk-abc|AIzaSy|abc\.def|zzz/))
  }

  /* ── 7. the agent's tools ─────────────────────────────────────────── */
  console.log("\n7. the agent's tools")
  check("generate_image and find_photo are tools with closed schemas", AGENT_TOOL_NAMES.includes("generate_image") && AGENT_TOOL_NAMES.includes("find_photo") && (TOOL_SPECS.generate_image.parameters as { required: string[] }).required.includes("prompt") && (TOOL_SPECS.find_photo.parameters as { additionalProperties: boolean }).additionalProperties === false)
  {
    let live = 0
    let peak = 0
    const out = await inPool(Array.from({ length: 7 }, (_, i) => async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5 * (7 - i))); live--; return i }), PICTURE_CONCURRENCY)
    check("the pool runs at most three at once, results in order", PICTURE_CONCURRENCY === 3 && peak === 3 && out.join() === "0,1,2,3,4,5,6")
  }
  {
    const T0 = Date.UTC(2026, 10, 10, 12)
    const job = (budget: Partial<JobBudget> = {}): AgentJobInput => ({ jobId: "job-1", creatorId: CREATOR, installId: "install-1", prompt: "A website for my strength coaching.", mode: "blank", options: { generation: "blank", category: "fitness_coach" }, budget: { ...DEFAULT_JOB_BUDGET, ...budget }, startedAt: T0, spentUsd: 0, lastEventSeq: 0 })
    const fakeImages = (opts: { usd?: number; fail?: (prompt: string) => string | null; delayMs?: number } = {}) => {
      let live = 0
      const st = { peak: 0, calls: [] as { prompt: string; direction?: unknown; maxUsd?: number }[] }
      const service: ImageService = {
        available: async () => ({ generate: "openai", stock: true }),
        ceiling: () => 0.07,
        generate: async (input) => {
          st.calls.push({ prompt: input.prompt, direction: input.direction, maxUsd: input.maxUsd })
          live++
          st.peak = Math.max(st.peak, live)
          await new Promise((r) => setTimeout(r, opts.delayMs ?? 20))
          live--
          const why = opts.fail?.(input.prompt)
          if (why) return { ok: false, code: "failed", reason: why, usd: 0 } as ImageOutcome
          const n = st.calls.length
          return { ok: true, url: `https://storelib.com/media/store-builder-images/${OWNER}/ai-images/${n}.jpg`, width: 1536, height: 1024, alt: input.alt ?? "x", mediaId: `store-builder-images:${OWNER}/ai-images/${n}.jpg`, source: "ai", provider: "openai", usd: opts.usd ?? 0.05 }
        },
        find: async (input) => ({ ok: true, url: `https://storelib.com/media/store-builder-images/${OWNER}/ai-images/stock.jpg`, width: 6000, height: 4000, alt: input.alt ?? "stock", mediaId: "m", source: "stock", provider: "pexels", usd: 0, credit: { provider: "pexels", photographer: "Ana Ruiz", photographerUrl: null, sourceUrl: null } }),
      }
      return { service, st }
    }
    const depsFor = (steps: Step[], extra: Partial<AgentDeps> = {}) => {
      let i = 0
      const requests: ProviderRequest[] = []
      const role = {
        id: "fake",
        async complete(req: ProviderRequest) {
          requests.push(req)
          return scripted([steps[i++] ?? { calls: [["report_progress", { phase: "build", label: "x" }]] }]).complete(req)
        },
      }
      const clock = { t: T0 }
      const deps: AgentDeps = {
        store: memoryStore(),
        models: { plan: { provider: role, model: "claude-opus-5-5" }, loop: { provider: role, model: "claude-sonnet-5-5" }, small: { provider: role, model: "claude-haiku-5-5" }, ownKey: false },
        capabilities: async () => CAPS,
        now: () => (clock.t += 1_000),
        ...extra,
      }
      return { deps, requests }
    }
    const pic = (n: number) => ["generate_image", { prompt: `a coach and client, frame ${n}`, aspect: "landscape", purpose: n === 1 ? "hero" : "gallery", alt: `Frame ${n}` }] as [string, Record<string, unknown>]
    const concept: Step = { calls: [["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT, pages: sitePlan(["programs", "about"]) }]] }

    /* before the concept */
    {
      const imgs = fakeImages()
      const d = depsFor([{ calls: [pic(1)] }], { images: imgs.service })
      const r = await runAgentSlice(job(), null, d.deps, { deadline: T0 + 600_000, maxIterations: 1 })
      const tool = r.events.find((e) => e.kind === "tool" && e.tool === "generate_image") as Extract<AgentEvent, { kind: "tool" }> | undefined
      check("a picture before the concept is refused (it is made to the art direction)", imgs.st.calls.length === 0 && tool?.ok === false)
      check("the brief says which picture service there is and the limit", /PICTURES: generate_image makes an original photograph \(OpenAI\); find_photo finds a licensed stock photo/.test(String(r.checkpoint.turns[0].text)) && /At most 16 pictures/.test(String(r.checkpoint.turns[0].text)))
    }
    /* side by side, spend, plain words */
    {
      const imgs = fakeImages({ usd: 0.05 })
      const d = depsFor([concept, { calls: [pic(1), pic(2), pic(3), pic(4), pic(5), ["find_photo", { query: "barbell", purpose: "gallery" }]] }], { images: imgs.service })
      const r = await runAgentSlice(job(), null, d.deps, { deadline: T0 + 600_000, maxIterations: 2 })
      const tools = r.events.filter((e): e is Extract<AgentEvent, { kind: "tool" }> => e.kind === "tool" && (e.tool === "generate_image" || e.tool === "find_photo"))
      const spends = r.events.filter((e): e is Extract<AgentEvent, { kind: "spend" }> => e.kind === "spend" && e.inputTokens === 0 && e.outputTokens === 0)
      const toolTurn = lastResults(r)
      const outputs = (toolTurn?.results ?? []).map((x) => JSON.parse(x.output) as { ok: boolean; url?: string; alt?: string; credit?: string; left?: number })
      check("five pictures in one turn made side by side, never more than three at once", imgs.st.calls.length === 5 && imgs.st.peak === 3, imgs.st)
      check("results come back in the order asked, with url, alt, size and what is left", outputs.length === 6 && outputs[0].alt === "Frame 1" && outputs[4].alt === "Frame 5" && outputs.slice(0, 5).every((o) => o.ok && o.url?.includes("/ai-images/")) && outputs[5].credit === "Photo by Ana Ruiz on Pexels" && outputs[5].left === 10, outputs)
      check("each picture's cost is the job's spend: a spend event each, in the slice's usage", spends.length === 5 && spends.every((s) => s.usd === 0.05) && r.usage.usd >= 0.25 && r.checkpoint.images?.made === 6 && Math.abs((r.checkpoint.images?.usd ?? 0) - 0.25) < 1e-9, { spends: spends.length, usage: r.usage })
      check("the progress view says it plainly", r.events.some((e) => e.kind === "note" && e.text === "Making the hero photo") && tools[0].summary === "Made the hero photo" && tools.every((t) => !t.summary.includes("coach and client")), tools.map((t) => t.summary))
      check("the concept's art direction rides with every picture, and the spend left as its cap", imgs.st.calls.every((c) => (c.direction as { imagery?: string })?.imagery === CONCEPT.imagery.direction && ((c.direction as { palette?: string[] })?.palette ?? []).includes("#c2410c") && typeof c.maxUsd === "number" && c.maxUsd > 0 && c.maxUsd <= DEFAULT_JOB_BUDGET.maxUsd))
    }
    /* the cap per job */
    {
      const imgs = fakeImages()
      const d = depsFor([concept, { calls: [pic(1), pic(2), pic(3), pic(4)] }], { images: imgs.service })
      const r = await runAgentSlice(job({ maxImages: 2 }), null, d.deps, { deadline: T0 + 600_000, maxIterations: 2 })
      const outputs = (lastResults(r)?.results ?? []).map((x) => JSON.parse(x.output) as { ok: boolean; reason?: string })
      check("maxImages 2: two made, the rest refused in plain words, even side by side", imgs.st.calls.length === 2 && outputs.filter((o) => o.ok).length === 2 && outputs.filter((o) => !o.ok && /used its 2 pictures/.test(o.reason ?? "")).length === 2 && r.checkpoint.images?.made === 2, outputs)
      check("AI_BUILDER_MAX_IMAGES overrides it on a deployment", maxImagesFromEnv({ AI_BUILDER_MAX_IMAGES: "4" }) === 4 && maxImagesFromEnv({ AI_BUILDER_MAX_IMAGES: "0" }) === 0 && maxImagesFromEnv({}) === undefined && maxImagesFromEnv({ AI_BUILDER_MAX_IMAGES: "x" }) === undefined)
    }
    /* the money left */
    {
      const imgs = fakeImages()
      const d = depsFor([concept, { calls: [pic(1)] }], { images: imgs.service })
      await runAgentSlice({ ...job({ maxUsd: 1 }), spentUsd: 0.98 }, null, d.deps, { deadline: T0 + 600_000, maxIterations: 2 }).catch(() => null)
      check("no picture is started when the job's spend left is under its cost", imgs.st.calls.length === 0)
    }
    /* failures and no service */
    {
      const imgs = fakeImages({ fail: () => "No picture: OpenAI did not make it. Design this spot without a picture." })
      const d = depsFor([concept, { calls: [pic(1)] }], { images: imgs.service })
      const r = await runAgentSlice(job(), null, d.deps, { deadline: T0 + 600_000, maxIterations: 2 })
      const tool = r.events.find((e): e is Extract<AgentEvent, { kind: "tool" }> => e.kind === "tool" && e.tool === "generate_image")
      check("a failed picture says so and how to design around it", tool?.ok === false && /^Could not make the hero photo: No picture/.test(tool.summary) && r.checkpoint.images?.failed === 1, tool)
    }
    {
      const d = depsFor([concept, { calls: [pic(1)] }])
      const r = await runAgentSlice(job(), null, d.deps, { deadline: T0 + 600_000, maxIterations: 2 })
      const brief = String(r.checkpoint.turns[0].text)
      const out = JSON.parse((lastResults(r)?.results ?? [])[0]?.output ?? "{}") as { ok: boolean; reason: string }
      check("no service: the brief tells the agent plainly to design text-forward, never a grey box", /no picture service is set up in this environment/.test(brief) && /Never draw an empty grey box/.test(brief) && /\{% if %\} around the picture/.test(brief))
      check("no service: the tool refuses with the same advice", out.ok === false && /No picture service is set up here/.test(out.reason))
    }
    /* the real binding */
    {
      const svc = jobImages({ creatorId: CREATOR, ownerUserId: OWNER, jobId: "job-9" }, { ownKeys: false, deps: { env: { PEXELS_API_KEY: PEXELS, AI_BUILDER_MAX_IMAGES: "5" }, fetch: fakeHttp({ "api.pexels.com/": () => pexelsSearch(), "images.pexels.com/": () => pexelsImage() }).fetch, save: fakeSave().save, timeoutMs: 200, retryDelayMs: 0 } })
      const avail = await svc.available()
      const r = await svc.find({ query: "barbell", aspect: "square" })
      check("jobImages: bound to the job's creator and owner, a scripted run never looks up own keys, env cap read", avail.generate === null && avail.stock === true && svc.maxImages === 5 && r.ok === true && r.source === "stock")
    }
  }

  /* ── 8. Regenerate ────────────────────────────────────────────────── */
  console.log("\n8. Regenerate")
  {
    const url = `https://storelib.com/media/store-builder-images/${OWNER}/ai-images/1700000000000-abc123.jpg`
    const origin: ImageOrigin = { source: "ai", provider: "openai", prompt: "a candle on oak", aspect: "square", width: 1024, height: 1024, createdAt: "x", direction: { imagery: "soft daylight" } }
    const calls: unknown[] = []
    const make = (over: Partial<RegenerateDeps> = {}): RegenerateDeps => ({
      caller: async () => ({ error: null, status: 200, creatorId: CREATOR, isOwner: true, ownerUserId: OWNER }),
      limited: async () => null,
      readOrigin: async (_c, path) => (path.endsWith("abc123.jpg") ? { origin, alt: "A candle" } : null),
      regenerate: async (input) => (calls.push(input), { ok: true, url: url.replace("abc123", "new999"), width: 1024, height: 1024, alt: "A candle", mediaId: "m", source: "ai", provider: "openai", usd: 0.04 }),
      maxUsd: 0.1,
      ...over,
    })
    const req = (body: unknown) => new Request("https://storelib.com/api/website-builder/images/regenerate", { method: "POST", body: JSON.stringify(body) })
    const signedOut = await handleRegenerate(req({ url }), make({ caller: async () => ({ error: "Sign in", status: 401, creatorId: null, isOwner: false, ownerUserId: null }) }))
    check("signed out: 401", signedOut.status === 401)
    const member = await handleRegenerate(req({ url }), make({ caller: async () => ({ error: null, status: 200, creatorId: CREATOR, isOwner: false, ownerUserId: OWNER }) }))
    check("a team member: 403, owner only", member.status === 403 && calls.length === 0)
    const other = await handleRegenerate(req({ url: url.replace(OWNER, "99999999-aaaa-bbbb-cccc-000000000009") }), make())
    check("another store's AI picture: 404", other.status === 404 && calls.length === 0)
    const upload = await handleRegenerate(req({ url: `https://storelib.com/media/store-builder-images/${OWNER}/sections/1.jpg` }), make())
    check("an upload (not made by the AI): 404", upload.status === 404)
    const traversal = await handleRegenerate(req({ url: `https://storelib.com/media/store-builder-images/${OWNER}/ai-images/../sections/1.jpg` }), make())
    check("a path that climbs out: 404", traversal.status === 404 && calls.length === 0)
    const limited = await handleRegenerate(req({ url }), make({ limited: async () => new Response(JSON.stringify({ error: "That is a lot" }), { status: 429 }) }))
    check("over the store's limit: 429, nothing made", limited.status === 429 && calls.length === 0)
    const noRecord = await handleRegenerate(req({ url: url.replace("abc123", "zzz999") }), make())
    check("an AI-folder file without a record of what it was made from: 404", noRecord.status === 404 && calls.length === 0)
    const ok = await handleRegenerate(req({ url }), make())
    const body = (await ok.json()) as { url: string }
    const sent = calls[0] as { origin: ImageOrigin; maxUsd: number; ownerUserId: string; alt: string }
    check("the owner: a new picture from the same description, capped per call", ok.status === 200 && body.url.includes("new999") && sent.origin.prompt === "a candle on oak" && sent.maxUsd === 0.1 && sent.ownerUserId === OWNER && sent.alt === "A candle")
    const none = await handleRegenerate(req({ url }), make({ regenerate: async () => ({ ok: false, code: "no_provider", reason: "x", usd: 0 }) }))
    check("no service here: 503 in plain words", none.status === 503 && /not set up/.test(((await none.json()) as { error: string }).error))
  }

  /* ── 9. the files library ─────────────────────────────────────────── */
  console.log("\n9. the files library")
  {
    const entries: Record<string, { name: string; id: string | null; created_at?: string; metadata?: { size: number; mimetype: string } | null }[]> = {
      [OWNER]: [{ name: "ai-images", id: null, metadata: null }, { name: "sections", id: null, metadata: null }],
      [`${OWNER}/ai-images`]: [{ name: "1-a.jpg", id: "1", created_at: "2026-11-10T00:00:00Z", metadata: { size: 1000, mimetype: "image/jpeg" } }],
      [`${OWNER}/sections`]: [{ name: "2.jpg", id: "2", created_at: "2026-11-09T00:00:00Z", metadata: { size: 1000, mimetype: "image/jpeg" } }],
    }
    const admin = { storage: { from: (bucket: string) => ({ list: async (prefix: string) => ({ data: bucket === "store-builder-images" ? (entries[prefix] ?? []) : [], error: null }), getPublicUrl: (p: string) => ({ data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${p}` } }) }) } }
    const files = await listLibrary(admin, { userId: OWNER, creatorId: CREATOR })
    check("AI pictures are in Files like uploads, labelled AI", files.length === 2 && files[0].source === "AI" && files[0].url.includes("/media/store-builder-images/") && files[1].source === "Website", files)
  }
  /* the brief note, both ways */
  check("the brief note for stock only names it plainly", /generate_image is not set up here; find_photo finds a licensed stock photo/.test(imageBriefNote({ generate: null, stock: true, maxImages: 16 })))

  clearInterval(keepAlive)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
