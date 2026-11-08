/**
 * ===========================================================================
 *  STORELIB AI, MEASURED ON WHAT CREATORS ACTUALLY TYPE (round Z3)
 * ===========================================================================
 * Twenty two owner prompts, each run against a fixture page with a fixture
 * selection, and held to the decision a person would expect:
 *
 *   ROUTE    which agent takes it, how far it reaches, whether only the open
 *            section may change, whether it goes into code (./router.ts)
 *   INTENT   what kind of change it is and what follows from it (./intent.ts)
 *
 * Then four runs of the page assistant against a scripted provider, with the
 * real schemas and the real operation applier, for the paths the production
 * log showed failing: a long run that hit "This edit reached its token
 * budget.", a reply cut off at the output limit, a new section on an
 * imported theme, and the browser check on an imported theme.
 *
 * No network and no model: every decision here is deterministic. The score
 * is printed (EVAL a/b) so a change to the rules shows what it moved.
 *
 * Run with:  npm run test:push
 */
import { routeByRules, type RouteSelection } from "@/lib/website-builder/agent/router"
import { classifyIntent, intentGuidance, type Intent } from "@/lib/website-builder/agent/intent"
import { themeAgent, type ThemeAgentEvent, type ThemeAgentInput, type ThemeAgentResult } from "@/lib/website-builder/agent/loop"
import { buildSection, describeStore, type ThemeState } from "@/lib/website-builder/agent/operations"
import { composePageDocument } from "@/lib/website-builder/agent/page-document"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { AGENT_LIMITS, runSpend, nearCeiling, overCeiling } from "@/lib/website-builder/agent/limits"
import { importedSectionWrite } from "@/lib/website-builder/agent/imported-write"
import type { AgentProvider, ProviderRequest, ProviderTurn, ToolCall, TokenUsage } from "@/lib/sites/agent/types"
import { SOUND_DESIGN, soundsOn } from "@/lib/website-builder/ask-sounds"
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === "" ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const section = (title: string) => console.log(`\n${title}`)

/* ── Fixtures ── */
const hero: RouteSelection = { sectionId: "hero-1", sectionType: "hero_centered", sectionName: "Hero", origin: "builtin" }
const ownHero: RouteSelection = { ...hero, sectionType: "bandidos_hero", origin: "own" }
const faq: RouteSelection = { sectionId: "faq-2", sectionType: "faq_accordion", sectionName: "FAQ", origin: "builtin" }
const grid: RouteSelection = { sectionId: "grid-3", sectionType: "product_grid", sectionName: "Bestsellers", origin: "builtin" }
const addable = [
  { type: "faq_accordion", name: "FAQ" },
  { type: "proof_testimonials", name: "Testimonials" },
  { type: "promo_newsletter", name: "Newsletter" },
  { type: "product_grid", name: "Product grid" },
  { type: "pricing_table", name: "Pricing" },
]
const onPage = [{ type: "hero_centered", name: "Hero" }, { type: "faq_accordion", name: "FAQ" }, { type: "product_grid", name: "Bestsellers" }]

type Expect = {
  agent?: "page" | "writer"
  target?: string
  lock?: boolean
  code?: boolean
  kind?: Intent["kind"]
  kindNot?: Intent["kind"]
  newPage?: boolean
  settingsLayout?: boolean
  products?: boolean
}
type Case = { name: string; prompt: string; sel: RouteSelection | null; chip: boolean; images?: number; want: Expect }

const CASES: Case[] = [
  /* New pages */
  { name: "new page, nothing open", prompt: "create me a new page for my shipping FAQ", sel: null, chip: false, want: { agent: "page", target: "page", lock: false, newPage: true } },
  { name: "new page with the hero open", prompt: "create a new About page and add it to the menu", sel: hero, chip: true, want: { agent: "page", target: "page", lock: false, newPage: true } },
  { name: "lookbook page from products", prompt: "build me a lookbook page with my products", sel: null, chip: false, want: { agent: "page", lock: false, newPage: true, products: true } },
  { name: "size guide page, chip on", prompt: "add a new page called Size guide with a sizing table", sel: faq, chip: true, want: { agent: "page", target: "page", lock: false, newPage: true } },
  /* New sections */
  { name: "new section below the open one", prompt: "add a new section below this section with three testimonials", sel: hero, chip: true, want: { lock: false, target: "section" } },
  { name: "new section under this one, own kind", prompt: "create a new section under this one with a countdown to our launch", sel: hero, chip: true, want: { agent: "writer", lock: false } },
  { name: "a section the theme has", prompt: "add a testimonials section", sel: null, chip: false, want: { agent: "page", target: "section", lock: false } },
  { name: "a section of its own", prompt: "create a new section with a before and after slider of my work", sel: null, chip: false, want: { agent: "writer", lock: false } },
  /* Rearranging a section's settings */
  { name: "rearrange the settings", prompt: "rearrange the settings of this section so the colours come first", sel: hero, chip: true, want: { lock: true, code: true, settingsLayout: true } },
  { name: "group the settings", prompt: "group this section's settings under Content, Layout and Style", sel: ownHero, chip: true, want: { lock: true, code: true, settingsLayout: true } },
  { name: "move settings above others", prompt: "move the button settings above the heading settings", sel: faq, chip: true, want: { lock: true, code: true, settingsLayout: true } },
  /* Site wide, with a section open */
  { name: "a menu link, chip on", prompt: "add a Pricing link to the main menu", sel: hero, chip: true, want: { lock: false } },
  { name: "the font across the site, chip on", prompt: "change the font across the site to something more editorial", sel: hero, chip: true, want: { target: "theme", lock: false } },
  { name: "darker palette site wide", prompt: "make the whole site use a darker palette", sel: faq, chip: true, want: { target: "theme", lock: false } },
  /* Content from the store */
  { name: "real products in the open grid", prompt: "show my real products in this section with their prices", sel: grid, chip: true, want: { lock: true, code: false, products: true } },
  { name: "FAQ answers from the catalogue", prompt: "rewrite the FAQ answers using my real product names", sel: faq, chip: true, want: { lock: true, kind: "CONTENT_CHANGE", products: true } },
  /* Restyle and redesign */
  { name: "tighter spacing, bigger heading", prompt: "make this section's spacing tighter and the heading bigger", sel: hero, chip: true, want: { lock: true, code: false } },
  { name: "motion in own code", prompt: "make the cards slide in on scroll", sel: ownHero, chip: true, want: { lock: true, code: true, kind: "FUNCTIONAL_CHANGE" } },
  /* Changed on purpose (w5 aifix): "feels premium" is how it looks, so the sections stay; a redesign that names structure is still one. */
  { name: "redesign the home page", prompt: "redesign the home page so it feels premium", sel: null, chip: false, want: { agent: "page", target: "page", kind: "STYLE_CHANGE" } },
  { name: "redesign the home page's structure", prompt: "redesign the home page with new sections and a different layout", sel: null, chip: false, want: { agent: "page", target: "page", kind: "PAGE_REDESIGN" } },
  { name: "several sections redesigned", prompt: "redesign the hero, the features and the FAQ so they feel premium", sel: null, chip: false, want: { agent: "page", target: "page", lock: false, kindNot: "LOCAL_EDIT" } },
  /* Questions stay questions */
  { name: "a question", prompt: "what can you do?", sel: null, chip: false, want: { kind: "QUESTION" } },
  { name: "a question about the open section", prompt: "why is this section dark?", sel: hero, chip: true, want: { kind: "QUESTION", lock: true } },
]

/** Words about the store's catalogue, which the run reads up front (STORE_WORDS in ./loop.ts). */
const STORE_WORDS = /\b(products?|price[sd]?|pricing|shop|store|catalog(ue)?|sell(s|ing)?|buy|checkout|cart|collections?)\b/i

function judge(c: Case): string[] {
  const d = routeByRules({ prompt: c.prompt, selection: c.sel, scoped: c.chip, images: c.images ?? 0, bodySections: 3, addable, onPage })
  const intent = classifyIntent(c.prompt, { selected: !!c.sel, locked: d.lock, codeFocus: d.codeFocus, bodySections: 3 })
  const wrong: string[] = []
  const w = c.want
  if (w.agent && d.agent !== w.agent) wrong.push(`agent ${d.agent}, wanted ${w.agent}`)
  if (w.target && d.target !== w.target) wrong.push(`target ${d.target}, wanted ${w.target}`)
  if (w.lock !== undefined && d.lock !== w.lock) wrong.push(`lock ${d.lock}, wanted ${w.lock}`)
  if (w.code !== undefined && d.codeFocus !== w.code) wrong.push(`code ${d.codeFocus}, wanted ${w.code}`)
  if (w.kind && intent.kind !== w.kind) wrong.push(`kind ${intent.kind}, wanted ${w.kind}`)
  if (w.kindNot && intent.kind === w.kindNot) wrong.push(`kind ${intent.kind}`)
  if (w.newPage !== undefined && !!intent.newPage !== w.newPage) wrong.push(`newPage ${!!intent.newPage}`)
  if (w.settingsLayout !== undefined && !!(intent as Intent & { settingsLayout?: boolean }).settingsLayout !== w.settingsLayout) wrong.push(`settingsLayout ${!!(intent as Intent & { settingsLayout?: boolean }).settingsLayout}`)
  if (w.products && !STORE_WORDS.test(c.prompt)) wrong.push("the catalogue would not be read up front")
  /* What the run is told: a settings layout request is pointed at the schema, a new page at build_page. */
  const told = intentGuidance(intent)
  if (w.settingsLayout && !/SETTINGS PANEL/.test(told)) wrong.push("not told how to rearrange a panel")
  if (w.newPage && !/build_page/.test(told)) wrong.push("not told to build_page")
  return wrong
}

/* ── A scripted provider, with usage the test sets per turn ── */
type Step = { text?: string; calls?: Array<[string, Record<string, unknown>]>; usage?: Partial<TokenUsage>; stop?: ProviderTurn["stop"] }
function scripted(script: Step[], sent: ProviderRequest[]): AgentProvider {
  let n = 0
  return {
    id: "scripted",
    async complete(request): Promise<ProviderTurn> {
      sent.push(JSON.parse(JSON.stringify({ ...request, signal: undefined })))
      const step = script[n++] ?? { text: "Done." }
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], i) => ({ id: `c${n}_${i}`, name, argumentsJson: JSON.stringify(args) }))
      return {
        text: step.text ?? "",
        toolCalls,
        raw: [],
        usage: { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 20, ...step.usage },
        stop: step.stop ?? (toolCalls.length ? "tool_calls" : "done"),
      }
    },
  } as AgentProvider
}
const page = (): ThemeState => ({
  sections: ["header", "hero_centered", "faq_accordion", "footer"].map((t, i) => buildSection(`${t}-${i}`, t)!),
  settings: { brand_name: "Lumen" },
})
async function drive(input: Partial<ThemeAgentInput> & { script: Step[] }) {
  const sent: ProviderRequest[] = []
  const events: ThemeAgentEvent[] = []
  const gen = themeAgent({ provider: scripted(input.script, sent), model: "claude-opus-5-5", page: "home", addable: ADDABLE_SECTIONS, prompt: "x", state: page(), ...input } as ThemeAgentInput)
  for (;;) {
    const step = await gen.next()
    if (step.done === true) return { result: step.value as ThemeAgentResult, events, sent }
    events.push(step.value as ThemeAgentEvent)
  }
}

const NATIVE = `<template>
<section class="z3-count"><h2>{{ settings.heading }}</h2></section>
</template>

<style>
.z3-count { padding: 48px 16px; }
</style>

<schema>
{ "name": "Launch countdown", "type": "launch_countdown", "settings": [ { "type": "text", "id": "heading", "label": "Heading", "default": "Doors open soon" } ], "presets": [ { "name": "Launch countdown" } ] }
</schema>
`
const COMPAT = `<template compat="shopify">
<div class="banner">{{ section.settings.title }}<script>window.x = 1</script></div>
</template>

<schema>
{ "name": "Banner", "settings": [ { "type": "text", "id": "title", "label": "Title", "default": "Hi" } ] }
</schema>
`

async function main() {
  // ═════════════════════════════════════════════════════════════════════════
  section(`Routing and intent: ${CASES.length} owner prompts`)
  // ═════════════════════════════════════════════════════════════════════════
  let right = 0
  for (const c of CASES) {
    const wrong = judge(c)
    if (!wrong.length) right++
    check(`${c.name}: "${c.prompt}"`, wrong.length === 0, wrong.join("; "))
  }
  console.log(`\n  EVAL routing ${right}/${CASES.length}`)

  // ═════════════════════════════════════════════════════════════════════════
  section("A long run is not ended by a token count")
  // ═════════════════════════════════════════════════════════════════════════
  {
    /* Twelve turns, each re-reading a 40,000 token page from the cache: 480,000 tokens in, about $0.30 on Opus 5.5. */
    const heavy = { inputTokens: 40_000, cachedInputTokens: 38_000, cacheWriteTokens: 0, outputTokens: 900 }
    const script: Step[] = Array.from({ length: 12 }, () => ({ calls: [["read_section", { id: "faq_accordion-2" }]] as Array<[string, Record<string, unknown>]>, usage: heavy }))
    script.push({ calls: [["update_section", { id: "faq_accordion-2", settingsJson: JSON.stringify({ heading: "Questions" }) }]], usage: heavy })
    script.push({ text: "Renamed the FAQ heading.", usage: heavy })
    const { result } = await drive({ script, maxTurns: 40 })
    check("a run that re-reads a cached page twelve times still finishes its work", result.status === "succeeded" && result.ops.length === 1, { status: result.status, error: result.error, ops: result.ops.length })
    check("and never says it reached a token budget", !/token budget/i.test(`${result.error ?? ""} ${result.message}`))
    check("the spend is counted at what the cache costs, not what it weighs", runSpend("claude-opus-5-5", { inputTokens: 480_000, cachedInputTokens: 456_000, cacheWriteTokens: 0, outputTokens: 10_800 }).usd < 1)
  }
  {
    /* A genuine runaway: a dear model writing a lot every turn. It stops at the ceiling, keeps its work, and offers Continue. */
    const dear = { inputTokens: 60_000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 60_000 }
    const script: Step[] = [{ calls: [["update_section", { id: "faq_accordion-2", settingsJson: JSON.stringify({ heading: "One" }) }]], usage: dear }]
    for (let i = 0; i < 30; i++) script.push({ calls: [["read_section", { id: "hero_centered-1" }]], usage: dear })
    const { result, events, sent } = await drive({ script, maxTurns: 80 })
    check("a run past the safety ceiling ends as a finished part, not a failure", result.status === "succeeded" && result.ops.length === 1, { status: result.status, error: result.error })
    check("it says it stopped to keep the cost in check and offers to carry on", result.stopped === "budget" && events.some((e) => e.type === "continue"), { stopped: result.stopped })
    check("it stops near the ceiling, well before the turn cap", sent.length < 30, sent.length)
    const warned = sent.some((r) => r.turns.some((t) => t.role === "tool" && t.results.some((x) => /close to this run's limit/.test(x.output))))
    check("the model was told to wrap up before the ceiling, inside a tool result (the prefix is never edited)", warned)
  }
  {
    const nothing = { inputTokens: 60_000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 60_000 }
    const script: Step[] = Array.from({ length: 30 }, () => ({ calls: [["read_section", { id: "hero_centered-1" }]] as Array<[string, Record<string, unknown>]>, usage: nothing }))
    const { result } = await drive({ script, maxTurns: 80 })
    check("a run that only read when it reached the ceiling is not an error either: it offers Continue", result.status === "succeeded" && result.stopped === "budget" && !/token budget/i.test(result.message), { status: result.status, message: result.message })
  }
  check("the ceilings live in one place and read the environment", typeof AGENT_LIMITS.runUsd === "number" && AGENT_LIMITS.runUsd > 0 && AGENT_LIMITS.turnOutputTokens >= 64_000 && AGENT_LIMITS.wallClockMs > 0)
  check("near and over are fractions of the same ceiling", nearCeiling({ usd: AGENT_LIMITS.runUsd * 0.9, tokens: 0 }) && !overCeiling({ usd: AGENT_LIMITS.runUsd * 0.9, tokens: 0 }) && overCeiling({ usd: AGENT_LIMITS.runUsd, tokens: 0 }))

  // ═════════════════════════════════════════════════════════════════════════
  section("Every turn's request is a prefix of the next (the prompt cache, and the model's own reasoning)")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const { sent } = await drive({
      script: [
        { calls: [["read_section", { id: "faq_accordion-2" }]] },
        { calls: [["update_section", { id: "faq_accordion-2", settingsJson: JSON.stringify({ heading: "Questions" }) }]] },
        { text: "Renamed the FAQ heading." },
      ],
    })
    const same = sent.every((r) => JSON.stringify(r.tools) === JSON.stringify(sent[0].tools) && r.system === sent[0].system)
    check("the tools and the system prompt are the same bytes on every turn", same)
    const prefix = sent.slice(1).every((r, i) => JSON.stringify(r.turns.slice(0, sent[i].turns.length)) === JSON.stringify(sent[i].turns))
    check("and the conversation is only ever added to", prefix)
    check("the run is shown how requests map to tools, with worked examples", /WORKED EXAMPLES/.test(sent[0].system) && /build_page/.test(sent[0].system) && /DESIGN LATITUDE/.test(sent[0].system))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("A reply cut off at the output limit is carried on, not executed half written")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const { result, sent } = await drive({
      script: [
        { calls: [["update_section", { id: "faq_accordion-2", settingsJson: "{\"heading\":\"Hal" }]], stop: "length" },
        { calls: [["update_section", { id: "faq_accordion-2", settingsJson: JSON.stringify({ heading: "Halfway there" }) }]] },
        { text: "Changed the FAQ heading." },
      ],
    })
    check("the cut off turn's tool call is not run", result.ops.length === 1 && JSON.stringify(result.ops[0]).includes("Halfway there"), result.ops)
    check("the same turn is asked again with more room", (sent[1]?.maxOutputTokens ?? 0) > (sent[0]?.maxOutputTokens ?? 0), sent.map((s) => s.maxOutputTokens))
    check("and the cut off turn is not replayed into the conversation", sent[1].turns.length === sent[0].turns.length)
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("An imported theme takes a new section of Storelib's own")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const sources: Record<string, string> = { "layout/theme.storelib": `<template compat="shopify">\n{{ content_for_layout }}\n</template>`, "sections/banner.storelib": COMPAT }
    const made = importedSectionWrite("launch_countdown", NATIVE, sources)
    check("a native section file is accepted for a new section of an imported theme", made.ok === true, made)
    const withScript = importedSectionWrite("launch_countdown", NATIVE.replace("<schema>", "<script>\nexport default function () {}\n</script>\n\n<schema>"), sources)
    check("one with a <script> is sent back with what to do instead", withScript.ok === false && /CSS/.test((withScript as { error: string }).error))
    const asCompat = importedSectionWrite("launch_countdown", COMPAT, sources)
    check("a Liquid file is not how a new one is written: it says to write a Storelib section", asCompat.ok === false && /<template>/.test((asCompat as { error: string }).error))
    const taken = importedSectionWrite("banner", NATIVE.replace(/launch_countdown/g, "banner"), sources)
    check("a type the theme already has is refused", taken.ok === false)
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("The browser check on an imported theme")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const state: ThemeState = { sections: [{ id: "b1", type: "banner", settings: {}, blocks: [] } as never, { id: "n1", type: "launch_countdown", settings: {}, blocks: [] } as never], settings: {} }
    const doc = composePageDocument(state, { "sections/banner.storelib": COMPAT, "sections/launch_countdown.storelib": NATIVE })
    check("the theme's own Liquid section is not reported as one that could not be drawn", !doc.failed.some((f) => f.id === "b1"), doc.failed)
    check("Storelib's section inside it is drawn and measured", doc.drawn.includes("n1"), doc)
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("The store as it is: its currency and what buyers said")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const said = describeStore({
      storeName: "lumen",
      live: true,
      totalProducts: 1,
      publishedProducts: 1,
      products: [{ id: "p1", title: "Linen tote", type: "physical", priceCents: 4500, published: true }],
      currency: "EUR",
      reviews: { count: 12, average: 4.75, quotes: [{ name: "Ana", rating: 5, text: "The stitching is perfect and it carries everything.", product: "Linen tote" }] },
    })
    check("prices are said in the store's own currency", /Prices in EUR/.test(said) && !/Prices in USD/.test(said))
    check("real reviews are there to quote, with the sections that draw them live", /REVIEWS: 12 shown/.test(said) && /Ana, 5\/5 on Linen tote/.test(said) && /reviews_carousel/.test(said))
    const told = describeStore({ storeName: "lumen", live: true, totalProducts: 1, publishedProducts: 1, products: [{ title: "Tote", type: "physical", priceCents: 100, published: true }] })
    check("a store read without them is still described, in US dollars as before", /Prices in USD/.test(told) && !/REVIEWS/.test(told))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("The chat: sending, Continue, the line, AI memory and the sounds")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
    const chat = read("components/website-builder/theme-chat.tsx")
    const dispatch = chat.slice(chat.indexOf("const dispatch = React.useCallback"), chat.indexOf("const dispatchRef"))
    check("the message is on screen and its sound played before the router is asked", dispatch.indexOf("placeExchange(") > 0 && dispatch.indexOf("playAskSound(\"sent\")") > 0 && dispatch.indexOf("placeExchange(") < dispatch.indexOf("decideRoute("))
    check("and the run takes over that same message in place, quietly", /send\(prompt, images, true, \{ codeFocus: route\.codeFocus, lock: route\.lock, into \}\)/.test(dispatch) && /writeOne\(prompt, images, true, into\)/.test(dispatch))
    check("a run that cannot start queues the message rather than dropping it", (chat.match(/dropExchange\(\w+(?:\.into)?\)\s*\n\s*if \(prompt\) setQueued\(\{ text: prompt \}\)/g) ?? []).length === 2)
    check("the box eases to its new height", /easeFieldHeight\(field\)/.test(chat) && /transition = `height \$\{COMPOSER_EASE_MS\}ms/.test(read("lib/website-builder/ask-composer.ts")))
    check("the cost ceiling offers Continue; time and the turn guard carry on by themselves", /event\.reason === "budget"\) patch\(\(e\) => \(\{ \.\.\.e, canContinue: true \}\)\)/.test(chat) && /data-ask-continue=""/.test(chat))
    check("the live line holds each label before the next", /export const LINE_HOLD_MS = 650/.test(read("components/website-builder/ask-activity.tsx")))
    const memory = read("components/website-builder/ask-memory.tsx")
    check("AI memory is read before it opens and opens on its own curve, focus in the panel", /onPointerEnter=\{warm\}/.test(memory) && /ask-memory-pop/.test(memory) && /onOpenAutoFocus/.test(memory) && /\.ask-memory-pop\[data-state="closed"\]/.test(read("app/globals.css")))
    check("sounds: off by default under reduced motion, a choice made is kept", soundsOn({ getItem: () => null, setItem: () => {} }, () => true) === false && soundsOn({ getItem: () => "on", setItem: () => {} }, () => true) === true && soundsOn({ getItem: () => null, setItem: () => {} }, () => false) === true)
    check("the send is a softer tap: a 5ms fade in and a third of the mallet", SOUND_DESIGN.sent.strikes.every((s) => s.attack === 0.005 && s.click <= 0.12))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
