/**
 * ===========================================================================
 *  ROUND N (N3): THE WHOLE SITE, EVERY PAGE AND EVERY TEMPLATE
 * ===========================================================================
 *   1. A free start stores home alone: no preset product page, nothing of
 *      the theme (create-website.ts startRows "none").
 *   2. The site plan (report_progress pages): home with ten sections, every
 *      template with sections or a reason, every page six or a reason.
 *   3. The agent with a scripted model on an in-memory website: writes wait
 *      for the plan; list_pages lists the templates; product and collection
 *      are placed on by key with no add_page; add_page refuses a template.
 *   4. Finish refuses an incomplete site with the exact list (home sections,
 *      the product and collection templates, the page's sections, its own
 *      footer, a page nobody links to), then completes once it is all there.
 *   5. The repair budget still bounds it: an incomplete site that runs out of
 *      rounds ends partial, saying what is missing.
 *   6. The product template drawn by the SERVER TEMPLATE ENGINE (interpreted,
 *      nothing generated is executed) with a real-shaped product: title,
 *      price, the pictures, every option with its id, add to cart with the
 *      product's id, the offers island, the description; the collection
 *      template lists the real products; the render check draws a template
 *      with the store's own product.
 *   7. The live cart route draws the cart template's sections and prerenders
 *      coded sections (source check), and the prompt has the block.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-builder-whole-site-n3.test.ts
 */
import { readFileSync } from "node:fs"
import { runAgentSlice } from "@/lib/ai-builder/agent/loop"
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import { AGENT_SYSTEM } from "@/lib/ai-builder/agent/prompts"
import { TOOL_SPECS } from "@/lib/ai-builder/agent/tool-specs"
import { completenessIssues, readSitePlan, templatesFor, MIN_HOME_SECTIONS, MIN_PAGE_SECTIONS, PAGES_AND_TEMPLATES, chromeLinks } from "@/lib/ai-builder/agent/site-plan"
import { renderCheck } from "@/lib/ai-builder/render-check"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { startRows } from "@/lib/website-builder/create-website"
import { toCard, toProductPage } from "@/lib/website-builder/shop-products"
import { productFacts } from "@/lib/website-builder/storefront-data"
import type { AgentDeps, AgentJobInput } from "@/lib/ai-builder/agent/ports"
import type { ProviderRequest } from "@/lib/sites/agent/types"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { DEFAULT_JOB_BUDGET, type AgentEvent, type JobBudget } from "@/lib/ai-builder/types"
import { ABOUT, CAPS, CONCEPT, FOOTER, HEADER, HERO, PROGRAMS, scripted, type Step } from "./ai-builder-agent-fixtures"
import { COLLECTION_PAGE, PRODUCT_PAGE, WHOLE_SITE_FILES, homeSections, pageSections, sitePlan, templateCalls, writeWholeSite } from "./ai-builder-whole-site-fixtures"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail)?.slice(0, 1500)}`}`)
  }
}

const JOB_ID = "33333333-2222-3333-4444-555555555555"
const T0 = Date.UTC(2026, 10, 9, 12, 0, 0)

function jobInput(over: Partial<AgentJobInput> = {}, budget: Partial<JobBudget> = {}): AgentJobInput {
  return { jobId: JOB_ID, creatorId: "creator-a", installId: "install-a", prompt: "A website for my strength coaching: small group classes and an 8 week program.", mode: "blank", options: { generation: "blank", category: "fitness_coach" }, budget: { ...DEFAULT_JOB_BUDGET, ...budget }, startedAt: T0, spentUsd: 0, lastEventSeq: 0, ...over }
}

function depsFor(store: ReturnType<typeof memoryStore>, steps: Step[]) {
  let i = 0
  const role = (id: string) => ({
    id,
    requests: [] as ProviderRequest[],
    async complete(req: ProviderRequest) {
      return scripted([steps[i++] ?? { calls: [["finish", { summary: "Done." }]] }]).complete(req)
    },
  })
  const clock = { t: T0 }
  const deps: AgentDeps = {
    store,
    models: { plan: { provider: role("plan"), model: "claude-opus-5-5", effort: "medium" }, loop: { provider: role("loop"), model: "claude-sonnet-5-5", effort: "low" }, small: { provider: role("loop"), model: "claude-haiku-5-5" }, ownKey: false },
    capabilities: async () => CAPS,
    now: () => (clock.t += 1_000),
  }
  return deps
}

const TOKENS = { colors: { background: "#f4efe6", surface: "#ebe4d8", text: "#1d1b18", muted: "#5c564d", accent: "#c2410c", accentText: "#ffffff", border: "#d6cdbd", inverse: { background: "#1d1b18", text: "#f4efe6", accent: "#fb923c" } }, fonts: { heading: "Oswald", body: "Inter" } }
const CORE: [string, Record<string, unknown>][] = [
  ["write_file", { path: "sections/ai_coach_header.storelib", content: HEADER }],
  ["write_file", { path: "sections/ai_coach_hero.storelib", content: HERO }],
  ["write_file", { path: "sections/ai_program_list.storelib", content: PROGRAMS }],
  ["write_file", { path: "sections/ai_coach_footer.storelib", content: FOOTER }],
  ["write_file", { path: "sections/ai_coach_story.storelib", content: ABOUT }],
]
const toolResults = (events: AgentEvent[]) => events.filter((e): e is Extract<AgentEvent, { kind: "tool" }> => e.kind === "tool")

/** The last tool output the model was handed for a call to `name`, from the next request it was sent. */
function lastOutput(req: ProviderRequest | undefined, contains: string): string {
  const turns = (req?.turns ?? []) as { role: string; results?: { output: string }[] }[]
  const out = turns.flatMap((t) => (t.role === "tool" ? (t.results ?? []).map((r) => r.output) : []))
  return [...out].reverse().find((o) => o.includes(contains)) ?? ""
}

async function main() {
  console.log("\n1. A free start stores home alone")
  {
    const blank = startRows("none")!
    check("one page, home, with no sections: no preset product page", blank.pages.length === 1 && blank.pages[0].page_key === "home" && blank.pages[0].sections.length === 0, blank.pages)
    const theme = startRows("theme")!
    check("  inside the theme is unchanged: home and the product page", theme.pages.map((p) => p.page_key).join() === "home,product")
  }

  console.log("\n2. The site plan")
  {
    const ok = readSitePlan(sitePlan(["programs", "about"]), CAPS)
    check("a whole plan is accepted", ok.ok === true, ok)
    const no = readSitePlan([{ key: "home", sections: ["a", "b"] }, { key: "about", sections: ["x"] }], CAPS)
    const missing = no.ok === false ? no.missing.join("\n") : ""
    check("  short home refused with the number", /home: 2 sections planned; a home page has at least 10/.test(missing), missing)
    check("  every missing template named, product and collection required while the store sells", /product \(Product page/.test(missing) && /collection \(Collection page/.test(missing) && /search \(Search results/.test(missing) && /404/.test(missing) && /cart/.test(missing), missing)
    check("  a page under six sections with no reason refused", /about: 1 section planned; a page has at least 6/.test(missing), missing)
    const withReason = sitePlan(["about"]).map((p) => (p.key === "about" ? { key: "about", sections: ["story"], reason: "A short page: the story is all it needs." } : p))
    check("  a page with fewer and a reason is accepted", readSitePlan(withReason, CAPS).ok === true)
    const productReason = sitePlan([]).map((p) => (p.key === "product" ? { key: "product", sections: [], reason: "The platform's layout will do for now." } : p))
    check("  the product template cannot be skipped with a reason while the store sells", readSitePlan(productReason, CAPS).ok === false)
    const noShop = { ...CAPS, products: [] }
    check("  a store that sells nothing may skip it with a reason", readSitePlan(productReason, noShop).ok === true)
    check("  the blog's templates only when there is a blog", !templatesFor(CAPS).some((t) => t.key === "blogs") && templatesFor({ ...CAPS, blog: { posts: 3 } }).some((t) => t.key === "article"))
    check("  a template key cannot be misspelled", readSitePlan([...sitePlan([]), { key: "Prod uct", sections: ["x"] }], CAPS).ok === false)
  }

  console.log("\n3 and 4. The agent: plan first, templates by key, finish refuses an incomplete site with the exact list")
  const store = memoryStore({ pages: { home: [] }, settings: {} })
  const steps: Step[] = [
    /* The concept alone: accepted, but the writes stay closed until the plan. */
    { calls: [["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT }], ["write_file", { path: "sections/ai_coach_hero.storelib", content: HERO }]] },
    /* A plan that is too thin is refused with every reason; then the whole plan. */
    { calls: [["report_progress", { phase: "plan", label: "Plan", pages: [{ key: "home", sections: ["hero"] }] }], ["list_pages", {}]] },
    { calls: [["report_progress", { phase: "plan", label: "Plan", pages: sitePlan(["programs", "about"]) }], ["set_tokens", { tokens: TOKENS }]] },
    { calls: CORE },
    { calls: [["add_page", { key: "programs", title: "Programs" }], ["add_page", { key: "about", title: "About" }], ["add_page", { key: "product", title: "Product" }]] },
    /* A thin site: four sections on home, one on each page, no templates, no footer, and a page nobody links to. */
    {
      calls: [
        ["set_page_sections", { page: "home", sections: [{ type: "ai_coach_header", group: "header" }, { type: "ai_coach_hero" }, { type: "ai_program_list" }] }],
        ["set_page_sections", { page: "programs", sections: [{ type: "ai_program_list" }] }],
        ["set_page_sections", { page: "about", sections: [{ type: "ai_coach_story" }] }],
      ],
    },
    { calls: [["finish", { summary: "Thin." }]] },
    /* The repair: the rest of the components, home of ten, pages of six, the templates, the footer. */
    ...writeWholeSite().map((calls) => ({ calls })),
    {
      calls: [
        ["set_page_sections", { page: "home", sections: homeSections([{ type: "ai_coach_hero" }, { type: "ai_program_list" }]) }],
        ["set_page_sections", { page: "programs", sections: pageSections({ type: "ai_program_list", settings: { heading: "All programs" } }) }],
        ["set_page_sections", { page: "about", sections: pageSections({ type: "ai_coach_story" }) }],
        ...templateCalls(),
        ["list_pages", {}],
      ],
    },
    { calls: [["render_check", { page: "product" }], ["render_check", { page: "collection" }]] },
    { calls: [["finish", { summary: "The whole site." }]] },
  ]
  const deps = depsFor(store, steps)
  const requests: ProviderRequest[] = []
  for (const role of [deps.models.plan, deps.models.loop]) {
    const inner = role.provider.complete.bind(role.provider)
    role.provider = { ...role.provider, complete: (req: ProviderRequest) => (requests.push({ ...req, turns: [...req.turns] }), inner(req)) }
  }
  const r = await runAgentSlice(jobInput(), null, deps, { deadline: T0 + 30 * 60_000 })
  const tools = toolResults(r.events)
  check("the concept alone is accepted, the write after it waits for the plan", tools[0]?.tool === "report_progress" && tools[0].ok && tools[1]?.tool === "write_file" && tools[1].ok === false, tools.slice(0, 2))
  const refusal = lastOutput(requests[1], "plan.site_missing")
  check("  and says so: the site plan comes first", /Hand in the site plan first/.test(refusal), refusal.slice(0, 300))
  check("a thin plan is refused (ok: false) and the summary says the plan needs another pass", tools[2]?.tool === "report_progress" && tools[2].ok === false && /site plan needs another pass/.test(tools[2].summary), tools[2])
  const listed = lastOutput(requests[2], "\"template\":true")
  check("list_pages lists the templates before they are stored, with where and what they read", ["product", "collection", "products", "search", "cart", "404", "contact"].every((k) => listed.includes(`"key":"${k}"`)) && /"stored":false/.test(listed) && /page\.product\.settings\.variants/.test(listed), listed.slice(0, 600))
  const reports = tools.filter((t) => t.tool === "report_progress")
  check("the whole plan is accepted", reports.length === 3 && reports[2].ok, reports)
  check("  and its note lists the plan back", /Site plan accepted:\\nhome: ai_coach_hero/.test(lastOutput(requests[3], "Site plan accepted")) && /You can write now/.test(lastOutput(requests[3], "Site plan accepted")))
  check("add_page refuses a template and says how to design it", tools.some((t) => t.tool === "add_page" && t.ok === false && /page product/.test(t.summary)) && lastOutput(requests[5], "is a template").includes("set_page_sections page \\\"product\\\""), lastOutput(requests[5], "template"))
  const firstFinish = lastOutput(requests[7], "Not finished")
  check("finish refused the thin site", /Not finished/.test(firstFinish), firstFinish.slice(0, 400))
  check("  home: how many of its own, how many it needs", new RegExp(`home has 2 sections of your own; it needs at least ${MIN_HOME_SECTIONS}`).test(firstFinish), firstFinish)
  check("  each page under six", new RegExp(`programs has 1 section of your own; a page needs at least ${MIN_PAGE_SECTIONS}`).test(firstFinish) && /about has 1 section/.test(firstFinish))
  check("  the product and collection templates, with what to draw", /The product page \(\/products\/<slug>\) is not designed/.test(firstFinish) && /data-storelib-add-to-cart=\\"\{\{ product\.id \}\}\\"/.test(firstFinish) && /The collection page \(\/collections\/<handle>\) is not designed/.test(firstFinish))
  check("  its own footer (free mode)", /The site has no footer of its own/.test(firstFinish))
  check("  and the repair phase began", r.events.some((e) => e.kind === "phase" && e.phase === "repair"))
  check("after the repair the job completes", r.status === "complete", { status: r.status, summary: r.summary, failing: r.checkpoint.final })
  const pages = store.project.pages
  const own = (key: string) => (pages[key] ?? []).filter((s) => !s.group && s.type.startsWith("ai_"))
  check("home: ten of its own between its header and footer", own("home").length === 10 && pages.home[0].group === "header" && pages.home[pages.home.length - 1].group === "footer", pages.home.map((s) => s.type))
  check("programs and about: six each", own("programs").length === 6 && own("about").length === 6)
  check("the product template holds the product component; the collection template the grid", own("product").map((s) => s.type).join() === "ai_product_page" && own("collection").map((s) => s.type).join() === "ai_collection_grid", { product: pages.product, collection: pages.collection })
  check("  made by the first placement, with the site's header and footer, and reported as created", pages.product?.[0]?.group === "header" && r.events.some((e) => e.kind === "page" && e.page === "product" && e.action === "created"))
  check("  templates are not added to the Main menu", !((store.project.settings.menus as Record<string, { links: { url: string }[] }>)["main-menu"]?.links ?? []).some((l) => /products|collections/.test(l.url)))
  const renderOuts = [lastOutput(requests[requests.length - 1], "htmlBytes")]
  check("the render check passed on the product and collection templates", toolResults(r.events).filter((t) => t.tool === "render_check").every((t) => t.ok), { outs: renderOuts.map((o) => o.slice(0, 400)), tools: toolResults(r.events).filter((t) => t.tool === "render_check") })

  console.log("\n5. The repair budget still bounds it")
  {
    const thin = memoryStore({ pages: { home: [] }, settings: {} })
    const thinSteps: Step[] = [
      { calls: [["report_progress", { phase: "plan", label: "Concept and plan", concept: CONCEPT, pages: sitePlan(["programs", "about"]) }]] },
      { calls: CORE },
      { calls: [["set_page_sections", { page: "home", sections: [{ type: "ai_coach_header", group: "header" }, { type: "ai_coach_hero" }, { type: "ai_coach_footer", group: "footer" }] }]] },
      { calls: [["finish", { summary: "1" }]] },
      { calls: [["finish", { summary: "2" }]] },
      { calls: [["finish", { summary: "3" }]] },
    ]
    const p = await runAgentSlice(jobInput(), null, depsFor(thin, thinSteps), { deadline: T0 + 30 * 60_000 })
    check("it ends partial, honestly, after the rounds it had", p.status === "partial" && p.checkpoint.verifyCycles === DEFAULT_JOB_BUDGET.maxVerifyCycles, { status: p.status, cycles: p.checkpoint.verifyCycles })
    check("  the summary names what is missing", /site\.home_sections/.test(p.summary ?? "") || /site\./.test(JSON.stringify(p.checkpoint.final?.failing ?? [])), { summary: p.summary, failing: p.checkpoint.final?.failing })
    check("  the plan pages it never made are named", completenessIssues({ pages: Object.entries(thin.project.pages).map(([key, sections]) => ({ key, sections })), sources: Object.fromEntries(Object.entries(thin.project.files).map(([k, v]) => [k, v.text])), settings: thin.project.settings, caps: CAPS, mode: "blank", plan: p.checkpoint.sitePlan ?? null }).some((i) => i.code === "site.plan_page_missing" && /"programs"/.test(i.message)))
  }

  console.log("\n6. Templates drawn by the server template engine with a real-shaped product")
  {
    const row = { id: "9b1f2c3d-0000-4000-8000-00000000aaaa", title: "Linen apron", slug: "linen-apron", price_cents: 4800, compare_at_cents: 6000, thumbnail_url: "https://cdn.storelib.test/apron-front.jpg", gallery_urls: ["https://cdn.storelib.test/apron-back.jpg"], status: "published", type: "physical", description: "<p>Washed linen, <strong>two pockets</strong>.</p><script>alert(1)</script>", pay_what_you_want: false }
    const variants = [
      { id: "var-sand", product_id: row.id, name: "Sand", price_cents: 4800, position: 0 },
      { id: "var-ink", product_id: row.id, name: "Ink", price_cents: 5200, position: 1 },
    ]
    const theme = { color_schemes: {}, font_heading: "Oswald" } as unknown as ThemeSettingsValues
    const section: SectionInstance = { id: "pp-1", type: "ai_product_page", settings: {}, blocks: [] }
    const sources = { ...WHOLE_SITE_FILES }
    const page = { template: "product", product: toProductPage(row as never, variants as never, "USD") }
    const out = renderStorelibSection(section, theme, page, sources, [], { product: productFacts(row as never, "USD") } as never)
    const html = out.ok ? out.html : JSON.stringify(out)
    check("the product template draws", out.ok === true, html.slice(0, 400))
    check("  its title and price", html.includes("Linen apron") && html.includes("$48.00") && html.includes("$60.00"), html.slice(0, 1200))
    check("  both pictures", html.includes("apron-front.jpg") && html.includes("apron-back.jpg"))
    check("  every option, each an add to cart with the product id and the option's id", /data-storelib-add-to-cart="9b1f2c3d-0000-4000-8000-00000000aaaa"[^>]*data-variant-id="var-sand"/.test(html) && /data-variant-id="var-ink"/.test(html) && html.includes("$52.00"), html.match(/<button[^>]*>/g))
    check("  the offers island for this product", /data-storelib-offers="9b1f2c3d-0000-4000-8000-00000000aaaa"/.test(html))
    check("  the description as cleaned markup: kept bold, no script", html.includes("<strong>two pockets</strong>") && !/<script>alert/.test(html))
    const single = renderStorelibSection(section, theme, { template: "product", product: toProductPage(row as never, [], "USD") }, sources, [], { product: productFacts(row as never, "USD") } as never)
    check("  with no options, one add to cart button", single.ok === true && /class="pp__add"[^>]*data-storelib-add-to-cart="9b1f2c3d-0000-4000-8000-00000000aaaa"/.test(single.html))
    const another = renderStorelibSection(section, theme, { template: "product", product: toProductPage({ ...row, id: "other-id", title: "Canvas tote" } as never, [], "USD") }, sources, [], { product: productFacts({ ...row, id: "other-id", title: "Canvas tote" } as never, "USD") } as never)
    check("  the same template draws whichever product it is handed", another.ok === true && another.html.includes("Canvas tote") && !another.html.includes("Linen apron"))
    check("  the file holds no product: everything comes from the data", !PRODUCT_PAGE.includes("Linen") && /product\.title/.test(PRODUCT_PAGE))

    const cards = [toCard(row as never, [], [], "USD"), toCard({ ...row, id: "p2", title: "Canvas tote", slug: "canvas-tote" } as never, [], [], "USD")]
    const coll = renderStorelibSection({ id: "cl-1", type: "ai_collection_grid", settings: {}, blocks: [] }, theme, { template: "collection" }, sources, cards, { collection: { id: "c1", title: "Kitchen", handle: "kitchen", description: "Things for the kitchen.", image: "", url: "/collections/kitchen", products_count: 2, products: [] } } as never)
    const ch = coll.ok ? coll.html : JSON.stringify(coll)
    check("the collection template lists the real products under the collection's name", coll.ok === true && ch.includes("Kitchen") && ch.includes("Linen apron") && ch.includes("Canvas tote") && /href="\/products\/canvas-tote"/.test(ch) && /data-storelib-add-to-cart="p2"/.test(ch), ch.slice(0, 800))
    check("  no file executed on the server: the template is interpreted (no <script> in either file)", !/<script\b/.test(PRODUCT_PAGE) && !/<script\b/.test(COLLECTION_PAGE))

    const rc = await renderCheck({ page: "product", sections: [section], sources, theme, template: "page.product", products: cards, capabilities: { ...CAPS, products: cards.map((c) => ({ id: c.id, title: String(c.settings.title), kind: "physical", price: String(c.settings.price), url: String(c.settings.url), checkout_url: "", available: true, variants: [] })) } })
    check("the render check draws the product template with the store's own product, and it passes", rc.ok && rc.htmlBytes > 500, rc.issues)
    const bare = await renderCheck({ page: "product", sections: [section], sources, theme, template: "page.product", products: [], capabilities: { ...CAPS, products: [] } })
    check("  with no product it is drawn bare (and says so)", !bare.ok && bare.issues.some((i) => i.code === "binding.unbound"), bare.issues)
  }

  console.log("\n7. Reachability, chrome, the live cart route and the prompt")
  {
    const header: SectionInstance = { id: "h", type: "ai_coach_header", group: "header", settings: {}, blocks: [] }
    const footer: SectionInstance = { id: "f", type: "ai_coach_footer", group: "footer", settings: {}, blocks: [] }
    const src = { "sections/ai_coach_header.storelib": HEADER, "sections/ai_coach_footer.storelib": FOOTER }
    const links = chromeLinks([header, footer], src, { menus: { "main-menu": { title: "Main", links: [{ title: "Programs", url: "/programs" }] } } })
    check("links: the header's menu (by its setting's default), the footer's url setting", links.has("/programs") && links.has("/about") && links.has("/"), [...links])
    const issues = completenessIssues({ pages: [{ key: "home", sections: [header] }, { key: "classes", sections: [] }], sources: src, settings: { menus: {} }, caps: CAPS, mode: "blank", plan: null })
    const codes = issues.map((i) => i.code)
    check("a page nobody links to, no footer of its own, no plan: each named", codes.includes("site.unreachable") && codes.includes("site.footer_own") && codes.includes("site.plan_missing") && !codes.includes("site.header_own"), codes)
    const themeMode = completenessIssues({ pages: [{ key: "home", sections: [] }], sources: {}, settings: {}, caps: CAPS, mode: "theme", plan: null })
    check("  inside a theme the frame is not required to be the AI's", !themeMode.some((i) => i.code === "site.header_own" || i.code === "site.footer_own"))
    const ten = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, type: i < 5 ? "ai_a" : "ai_b", settings: {}, blocks: [] }))
    check("  ten copies of two components is not a home page", completenessIssues({ pages: [{ key: "home", sections: ten }], sources: {}, settings: {}, caps: { ...CAPS, products: [] }, mode: "theme", plan: null }).some((i) => i.code === "site.home_variety"))

    const cart = readFileSync("app/(site)/w/[username]/cart/page.tsx", "utf8")
    check("the live cart route draws the cart template's own sections, in the site's header and footer", /site\.pages\.cart/.test(cart) && /withUniversalChrome\(cartOwn, chromeOf\(/.test(cart))
    check("  and prerenders coded sections there (an AI header drew nothing on /cart without it)", /renderWithSources\(site\.sources, sections, site\.themeSettings, "cart"/.test(cart) && /<StorelibSourcesProvider prerendered=\{prerendered\} page=\{\{ template: "cart" \}\}>/.test(cart))
    check("the system prompt carries the pages and templates block", AGENT_SYSTEM.includes(PAGES_AND_TEMPLATES) && /data-storelib-add-to-cart="\{\{ product\.id \}\}"/.test(AGENT_SYSTEM) && /data-storelib-offers/.test(AGENT_SYSTEM))
    check("report_progress takes pages; set_page_sections names the templates", JSON.stringify(TOOL_SPECS.report_progress.parameters).includes("\"pages\"") && /product, collection, products, search, cart, 404/.test(TOOL_SPECS.set_page_sections.description))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
