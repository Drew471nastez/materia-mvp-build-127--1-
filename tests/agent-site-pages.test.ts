/**
 * ===========================================================================
 *  STORELIB AI BUILDS A SITE, NOT A PAGE
 * ===========================================================================
 * lib/website-builder/agent/page-builder.ts and the build_page and
 * list_pages tools in the loop, and the intent flags that say what kind of
 * change a request is (lib/website-builder/agent/intent.ts):
 *
 *   PLAN       a page's sections, settings and blocks (nested too) become
 *              checked operations; a preset's sample blocks give way to the
 *              real ones; a wrong type or block is refused with the reason
 *   REPLACE    a rebuild removes the old sections and keeps the page's own
 *              store section (the product page keeps its product)
 *   KEYS       built-in pages by key, new pages from a title, "shop" is the shop
 *   LOOP       a scripted run that builds the About page streams a "page"
 *              event, counts as work, and never builds the open page
 *   INTENT     "completely different" rebuilds, "a bit" is a light touch,
 *              "add a page" is a new page, "keep the header" is kept,
 *              "logo everywhere" is changed once
 *   SITE       a whole site brief is told to build the pages a real one has
 *   OWN CART   a section's own add button and cart drawer are read safely, and
 *              the assistant is told how to build them (the browser half is
 *              scripts/check-own-cart.mjs)
 *
 * Run with:  npm run test:push
 */

import { planPage, readPageSections, pageKeyFor, isPageEssential, type SitePageTools } from "@/lib/website-builder/agent/page-builder"
import { buildSection, type ThemeState } from "@/lib/website-builder/agent/operations"
import { schemaMapFor } from "@/lib/website-builder/agent/schemas"
import { themeAgent, wholeSiteGuidance, type ThemeAgentEvent, type ThemeAgentInput, type ThemeAgentResult } from "@/lib/website-builder/agent/loop"
import { classifyIntent, intentGuidance, keptPhrases } from "@/lib/website-builder/agent/intent"
import { ARCHETYPES, ARCHETYPE_PAGES, describeArchetypePages } from "@/lib/storelib-ai/archetypes"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import type { AgentProvider, ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import type { SectionInstance } from "@/lib/website-builder/types"
import { addToCartLine, hooksIn, priceCentsFrom, safeHref } from "@/lib/website-builder/storefront-hooks"
import { knowledgeFor } from "@/lib/storelib-ai/knowledge"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)

const make = (id: string, type: string): SectionInstance => {
  const built = buildSection(id, type)
  if (!built) throw new Error(`no section type ${type}`)
  return built
}
let n = 0
const mint = (p: string) => `${p}-t${++n}`
const schemas = schemaMapFor({})

type Step = { text?: string; calls?: [string, Record<string, unknown>][] }
function scripted(script: Step[], sent: ProviderRequest[]): AgentProvider {
  let i = 0
  return {
    id: "scripted",
    async complete(request): Promise<ProviderTurn> {
      sent.push(JSON.parse(JSON.stringify({ ...request, signal: undefined })))
      const step = script[i++] ?? { text: "Done." }
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], k) => ({ id: `c${i}_${k}`, name, argumentsJson: JSON.stringify(args) }))
      return { text: step.text ?? "", toolCalls, raw: [], usage: { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 20 }, stop: toolCalls.length ? "tool_calls" : "done" }
    },
  }
}

async function run(input: Partial<ThemeAgentInput> & { script: Step[] }) {
  const sent: ProviderRequest[] = []
  const events: ThemeAgentEvent[] = []
  const gen = themeAgent({ provider: scripted(input.script, sent), model: "test", page: "home", addable: ADDABLE_SECTIONS, ...input } as ThemeAgentInput)
  for (;;) {
    const step = await gen.next()
    if (step.done === true) return { result: step.value as ThemeAgentResult, events, sent }
    events.push(step.value as ThemeAgentEvent)
  }
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("PLAN: a page's sections, settings and blocks become checked operations")
  // ═══════════════════════════════════════════════════════════════════════
  const chrome: ThemeState = { sections: [make("header-1", "header"), make("footer-1", "footer")], settings: {} }
  const faq = [
    { question: "Do you ship abroad?", answer: "<p>Yes, to 30 countries.</p>" },
    { question: "How do sizes run?", answer: "<p>True to size; see the size guide.</p>" },
    { question: "Can I return a sale item?", answer: "<p>Within 14 days.</p>" },
    { question: "How do I care for linen?", answer: "<p>Cold wash, line dry.</p>" },
  ]
  const read = readPageSections([
    { type: "hero_split", name: "Our story", settings: { heading: "Made in Porto" } },
    { type: "faq_accordion", blocks: faq.map((settings) => ({ type: "qa", settings })) },
  ])
  check("the sections are read", "sections" in read && read.sections.length === 2)
  const plan = "sections" in read ? planPage(chrome, read.sections, schemas, { mint }) : null
  check("the plan is accepted", !!plan?.ok, plan && plan.ok === false ? plan.error : "")
  if (plan?.ok) {
    const types = plan.state.sections.map((s) => s.type)
    check("header first, footer last, the new sections between in order", types.join(",") === "header,hero_split,faq_accordion,footer", types.join(","))
    const hero = plan.state.sections.find((s) => s.type === "hero_split")
    check("settings reach the section", hero?.settings.heading === "Made in Porto")
    check("and the name the sidebar shows", hero?.name === "Our story")
    const acc = plan.state.sections.find((s) => s.type === "faq_accordion")
    const qs = (acc?.blocks ?? []).map((b) => b.settings.question)
    check("the preset's three sample questions give way to the four real ones", qs.length === 4 && qs[0] === "Do you ship abroad?" && !qs.includes("How long does delivery take?"), JSON.stringify(qs))
    check("two sections created, both reported", plan.created.length === 2)
  }

  const nested = readPageSections([{ type: "blocks_section", blocks: [{ type: "group", settings: {}, blocks: [{ type: "heading", settings: { text: "Fit" } }, { type: "text", settings: {} }] }] }])
  const nestedPlan = "sections" in nested ? planPage(chrome, nested.sections, schemas, { mint }) : null
  if (nestedPlan && nestedPlan.ok) {
    const group = nestedPlan.state.sections.find((s) => s.type === "blocks_section")?.blocks?.find((b) => b.type === "group")
    check("blocks inside a block (a group's children) are placed inside it", (group?.blocks ?? []).map((b) => b.type).join(",") === "heading,text", JSON.stringify(group))
  } else {
    check("blocks inside a block (a group's children) are placed inside it", false, nestedPlan && nestedPlan.ok === false ? nestedPlan.error : "not read")
  }

  const badType = "sections" in readPageSections([{ type: "made_up_section" }]) ? planPage(chrome, (readPageSections([{ type: "made_up_section" }]) as { sections: never[] }).sections, schemas, { mint }) : null
  check("an unknown type is refused with the section named", !!badType && badType.ok === false && /Section 1 \(made_up_section\)/.test(badType.error), badType && badType.ok === false ? badType.error : "")
  const badBlock = planPage(chrome, [{ type: "faq_accordion", blocks: [{ type: "slide", settings: {} }] }], schemas, { mint })
  check("a block the section does not take is refused, naming what it takes", badBlock.ok === false && /qa/.test(badBlock.error), badBlock.ok === false ? badBlock.error : "")
  check("an empty list is refused", "error" in readPageSections([]))
  check("too many sections are refused", "error" in readPageSections(Array.from({ length: 17 }, () => ({ type: "hero_split" }))))
  check("a section with no type is refused", "error" in readPageSections([{ settings: {} }]))

  // ═══════════════════════════════════════════════════════════════════════
  section("REPLACE: a rebuild clears the page and keeps its store section")
  // ═══════════════════════════════════════════════════════════════════════
  const productPage: ThemeState = { sections: [make("header-1", "header"), make("product-1", "product"), make("old-1", "faq_accordion"), make("footer-1", "footer")], settings: {} }
  const rebuilt = planPage(productPage, [{ type: "features_grid" }], schemas, { replace: true, mint })
  check("the old sections go", rebuilt.ok && !rebuilt.state.sections.some((s) => s.id === "old-1"))
  check("the product section stays", rebuilt.ok && rebuilt.state.sections.some((s) => s.id === "product-1") && rebuilt.kept.includes("product-1"))
  check("the store's essential sections are named as such", isPageEssential("product") && isPageEssential("main_account") && isPageEssential("not_found") && !isPageEssential("hero_split"))

  // ═══════════════════════════════════════════════════════════════════════
  section("KEYS: which page a call names")
  // ═══════════════════════════════════════════════════════════════════════
  check("a built-in page by its key", pageKeyFor("about", "") === "about" && pageKeyFor("products", "") === "products" && pageKeyFor("product", "") === "product")
  check('"shop" is the shop', pageKeyFor("shop", "") === "products")
  check("a new page from its title", pageKeyFor("", "Size guide") === "size-guide", String(pageKeyFor("", "Size guide")))
  check("a leading slash is not part of the key", pageKeyFor("/faq", "") === "faq")
  check("nothing usable is null", pageKeyFor("", "") === null && pageKeyFor("!!!", "") === null)

  // ═══════════════════════════════════════════════════════════════════════
  section("LOOP: build_page is work, streamed, and never the open page")
  // ═══════════════════════════════════════════════════════════════════════
  const built: { args: Record<string, unknown> }[] = []
  const pages: SitePageTools = {
    async list() {
      return "THE SITE'S PAGES\n- home: OPEN\n- about: not made yet"
    },
    async build(args) {
      built.push({ args: args as Record<string, unknown> })
      if (args.page === "home") return { ok: false, text: '"home" is the page open in the editor.' }
      return { ok: true, text: 'Made "about".', key: "about", title: "About", created: true }
    },
  }
  const aboutSections = JSON.stringify([{ type: "hero_split", settings: { heading: "Made in Porto" } }])
  const { result, events, sent } = await run({
    pages,
    script: [
      { text: "Building the About page.", calls: [["list_pages", {}], ["build_page", { page: "about", title: "About", replace: false, sectionsJson: aboutSections }]] },
      { text: "I made the About page." },
    ],
    prompt: "add an about page about the brand",
    state: chrome,
  })
  check("the run succeeds on a page built and nothing changed on the open one", result.status === "succeeded" && result.ops.length === 0, `${result.status} ${result.error}`)
  check("the page is in the result", (result.pages ?? []).some((p) => p.key === "about" && p.created))
  check('a "page" event tells the editor', events.some((e) => e.type === "page" && e.key === "about" && e.title === "About"))
  check("the sections reached the server half as parsed JSON", Array.isArray(built[0]?.args.sections))
  const tools = sent[0]?.tools?.map((t) => t.name) ?? []
  check("list_pages and build_page are offered when the run can reach the pages", tools.includes("list_pages") && tools.includes("build_page"))
  const locked = await run({ pages, script: [{ text: "x" }], prompt: "make the heading bigger", state: chrome, lockToSelection: true, selectedSectionId: "header-1" })
  check("a locked edit is not offered them", !(locked.sent[0]?.tools ?? []).some((t) => t.name === "build_page"))
  const without = await run({ script: [{ text: "x" }], prompt: "make the heading bigger", state: chrome })
  check("nor a run without the server half", !(without.sent[0]?.tools ?? []).some((t) => t.name === "build_page"))

  // ═══════════════════════════════════════════════════════════════════════
  section("INTENT: what kind of change, and what it may touch")
  // ═══════════════════════════════════════════════════════════════════════
  const rebuild = classifyIntent("make the faq completely different and much more modern", { selected: true, bodySections: 5 })
  check('"completely different, much more modern" rebuilds the FAQ', rebuild.kind === "SECTION_REDESIGN" && rebuild.rebuild === true, JSON.stringify(rebuild))
  check("and is told to write a new section, not move the old one's settings", /create_section/.test(intentGuidance(rebuild)) && /MADE AGAIN/.test(intentGuidance(rebuild)))
  const redesign = classifyIntent("completely redesign the pricing section", { bodySections: 5 })
  check('"completely redesign the pricing section" rebuilds', redesign.kind === "SECTION_REDESIGN" && redesign.rebuild === true, JSON.stringify(redesign))
  const light = classifyIntent("make the faq a bit cleaner", { selected: true, bodySections: 5 })
  check('"a bit cleaner" is a light touch, not a rebuild', light.light === true && !light.rebuild && /LIGHT TOUCH/.test(intentGuidance(light)), JSON.stringify(light))
  const page = classifyIntent("add an about page that tells our story", { bodySections: 5 })
  check('"add an about page" is a new page, built with build_page', page.newPage === true && /build_page/.test(intentGuidance(page)), JSON.stringify(page))
  const notPage = classifyIntent("make this page better", { bodySections: 5 })
  check('"make this page better" is not a new page', !notPage.newPage)
  const keep = classifyIntent("redesign the whole website but keep the header and don't touch the pricing section", { bodySections: 6 })
  check('"keep the header", "don\'t touch the pricing section" are kept', (keep.keep ?? []).includes("header") && (keep.keep ?? []).some((k) => /pricing/.test(k)), JSON.stringify(keep.keep))
  check("and said back as LEAVE ALONE", /LEAVE ALONE/.test(intentGuidance(keep)))
  check("keptPhrases ignores empty objects", keptPhrases("keep it up, keep going").length === 0, JSON.stringify(keptPhrases("keep it up, keep going")))
  const logo = classifyIntent("update my logo everywhere", { bodySections: 5 })
  check('"update my logo everywhere" is changed once, where it lives', logo.global === true && /update_theme/.test(intentGuidance(logo)), JSON.stringify(logo))
  const question = classifyIntent("what can you do?", {})
  check("a question carries none of it", question.kind === "QUESTION" && !question.rebuild && !question.newPage && !question.global)

  // ═══════════════════════════════════════════════════════════════════════
  section("SITE: a whole site brief is told to build the pages a real one has")
  // ═══════════════════════════════════════════════════════════════════════
  const apparel = wholeSiteGuidance("apparel", "home")
  check("the apparel site lists the shop, product, collections, about, FAQ and contact", ["products:", "product:", "collections:", "about:", "faq:", "contact:"].every((k) => apparel.includes(k)), apparel)
  check("it says the brief wins in both directions", /one page landing for a launch stays one page/.test(apparel))
  check("it never lets a product be typed in by hand", /never a product, price or stock level typed in by hand/.test(apparel))
  check("every page set belongs to a real archetype", Object.keys(ARCHETYPE_PAGES).every((id) => ARCHETYPES.some((a) => a.id === id)))
  check("an unknown archetype adds no page list", describeArchetypePages("nope") === "")
  const site = await run({
    pages,
    script: [{ text: "Plan." }],
    prompt: "build me a complete premium website for my clothing brand that sells linen shirts",
    state: chrome,
    intent: classifyIntent("build me a complete premium website for my clothing brand that sells linen shirts", { bodySections: 0 }),
  })
  const firstTurn = (site.sent[0]?.turns ?? []).filter((t) => t.role === "user").map((t) => (t as { content: string }).content).join("\n")
  check("the first turn of a site build carries the whole-site steps", /A WHOLE SITE IS ASKED FOR/.test(firstTurn) && /build_page/.test(firstTurn), firstTurn.slice(0, 300))

  // ═══════════════════════════════════════════════════════════════════════
  section("OWN CART: a section's own add button and drawer, read safely")
  // ═══════════════════════════════════════════════════════════════════════
  check("prices as printed become cents", priceCentsFrom("$48.00") === 4800 && priceCentsFrom("€1.234,50") === 123450 && priceCentsFrom("1,234.5") === 123450 && priceCentsFrom("48") === 4800 && priceCentsFrom("Free") === 0)
  check("only the site's own addresses and http(s) are written onto a line", safeHref("/img/a.jpg") === "/img/a.jpg" && safeHref("https://cdn.x/a.jpg") === "https://cdn.x/a.jpg" && safeHref("javascript:alert(1)") === "" && safeHref("//evil.com/a") === "" && safeHref("data:text/html,x") === "")
  const attrs: Record<string, string> = { "data-storelib-add-to-cart": "linen-shirt", "data-title": "Linen shirt", "data-price": "$48.00", "data-image": "/img/a.jpg", "data-url": "/products/linen-shirt", "data-kind": "physical", "data-quantity": "3" }
  const line = addToCartLine((n) => attrs[n] ?? null)
  check("a button's line is read off its attributes", !!line && line.productId === "linen-shirt" && line.priceCents === 4800 && line.slug === "linen-shirt" && line.physical && line.quantity === 3, JSON.stringify(line))
  const digital = addToCartLine((n) => ({ ...attrs, "data-kind": "digital" })[n] ?? null)
  check("a digital product is one", !!digital && digital.digital && digital.quantity === 1)
  check("a button naming no product, or markup, adds nothing", addToCartLine(() => null) === null && addToCartLine((n) => (n === "data-storelib-add-to-cart" ? '"><img src=x>' : null)) === null)
  check("the page sees which hooks a section asks for", hooksIn('<button data-storelib-add-to-cart="a">').addToCart && hooksIn('<aside data-storelib-cart-panel>').cartPanel && !hooksIn("<div>").addToCart)
  const cartTopic = knowledgeFor("build me a product grid with my own slide out cart drawer").map((t) => t.id)
  check("a request for its own cart retrieves how to build one", cartTopic.includes("own-cart"), cartTopic.join(","))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

await main()
