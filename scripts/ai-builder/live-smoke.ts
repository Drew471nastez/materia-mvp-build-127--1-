/**
 * ONE REAL GENERATION THROUGH THE REAL PATH, OPT IN, WITH A HARD SPEND CAP.
 *
 * The production runner (runAgentInvocation) and stepper (sliceStepper), one
 * model call per step, requests chained with the checkpoint saved through
 * JSON between them, on an in-memory job table and website (no database is
 * touched). See scripts/ai-builder/smoke-run.ts for what each part is.
 *
 * It does nothing unless BOTH are true (checked by name; no value is printed):
 *   STORELIB_LIVE_AI_SMOKE=1
 *   ANTHROPIC_API_KEY is set
 *
 *   STORELIB_LIVE_AI_SMOKE=1 ANTHROPIC_API_KEY=... \
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/ai-builder/live-smoke.ts [outDir]
 *
 * Caps: AI_SMOKE_MAX_USD (default 1, at most 5), AI_SMOKE_MAX_MINUTES
 * (default 15, at most 30), AI_SMOKE_MAX_OUTPUT_TOKENS per call (default
 * 12000). A cap hit ends the run partial or cancelled, which is a valid
 * result: what was made is still reported and saved.
 * AI_SMOKE_REQUEST_SECONDS (default 240, like production) is each request's
 * time; set it lower (say 90) to make the run hand over between requests
 * more often.
 * The generated files, pages, settings and events go to outDir, default a
 * new folder under the system temp directory.
 */
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createAnthropicProvider, anthropicClientFor } from "@/lib/sites/agent/anthropic-provider"
import { PLAN_MODEL, SMALL_MODEL, WRITE_MODEL } from "@/lib/website-builder/ai-site/models"
import type { RuntimeCapabilities } from "@/lib/ai-builder/runtime-contract"
import { describeSmoke, runSmoke, smokeGate, smokeLimits } from "./smoke-run"

/** The store the smoke builds for: a strength coach with one real product, no reviews. */
export const SMOKE_CAPABILITIES: RuntimeCapabilities = {
  store: { name: "Iron & Chalk", currency: "GBP", brandImage: null, tagline: null },
  products: [{ id: "prod_smoke_8week", title: "8 week strength block", kind: "service", price: "£120", url: "/products/8-week-strength-block", checkout_url: "/checkout?productId=prod_smoke_8week", available: true, variants: [] }],
  collections: [],
  communities: [],
  forms: [],
  pages: [],
  menus: [],
  blog: { posts: 0 },
  reviews: { count: 0, average: null },
  links: { creatorPage: null, social: [] },
  features: ["shop"],
}

export const SMOKE_PROMPT = "A website for my strength coaching studio in Leeds: small group classes, an 8 week program people can buy, and a page about me."

/** The whole live smoke: the gate, the caps, the run, the report. Returns null when the gate says no. */
export async function liveSmoke(env: Record<string, string | undefined>, print: (line: string) => void = (l) => console.log(l), argOutDir?: string) {
  const gate = smokeGate(env)
  if ("reason" in gate) {
    print(gate.reason)
    return null
  }
  const limits = smokeLimits(env)
  const seconds = Number(env.AI_SMOKE_REQUEST_SECONDS)
  const perInvocationMs = Number.isFinite(seconds) && seconds >= 75 ? Math.min(240, seconds) * 1000 : undefined
  /* The key is read once, by the name the gate found, and handed to the client; it is never printed. */
  const key = env[gate.keyName] as string
  const provider = createAnthropicProvider(() => anthropicClientFor(key))
  const outDir = argOutDir || mkdtempSync(join(tmpdir(), "storelib-ai-smoke-"))
  print(`Live smoke: cap $${limits.capUsd.toFixed(2)}, ${Math.round(limits.wallMs / 60_000)} min, ${limits.maxOutputTokensPerCall} output tokens a call. Key: ${gate.keyName} (set).`)
  const { report } = await runSmoke({
    models: { plan: { provider, model: PLAN_MODEL, effort: "medium" }, loop: { provider, model: WRITE_MODEL, effort: "low" }, small: { provider, model: SMALL_MODEL, effort: "low" }, ownKey: false },
    capabilities: SMOKE_CAPABILITIES,
    prompt: SMOKE_PROMPT,
    mode: "blank",
    category: "fitness_coach",
    ...limits,
    ...(perInvocationMs ? { perInvocationMs } : {}),
    outDir,
    log: print,
  })
  print(`\n${describeSmoke(report)}`)
  return report
}

/* Run only as a script: the test imports the constants above. */
if (process.argv[1] && /live-smoke\.ts$/.test(process.argv[1])) {
  liveSmoke(process.env, undefined, process.argv[2]).catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
