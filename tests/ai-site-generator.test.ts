/**
 * ===========================================================================
 *  START WITH AI: ONE DESCRIPTION, A WHOLE WEBSITE, ON THE SERVER
 * ===========================================================================
 * The generator in lib/website-builder/ai-site/* with fake providers, a fake
 * Openverse and a website held in memory (tests/ai-site-fakes.ts). No network
 * and no real model.
 *
 *   1. THE PLAN: one strong call; types, pages, layout values, fonts and
 *      presets checked; sections needing proof the store lacks taken out.
 *   2. THE BUILD: theme settings from the preset, every page's sections with
 *      ids, the header and footer the same on every page, drafts only.
 *   3. THE WORDS: one call per section in parallel on a shared cached
 *      system prefix, the section's own controls as the shape, every value
 *      through checkSettings, one repair, nothing invented.
 *   4. THE PHOTOS: Openverse briefs, copied through the SSRF guard,
 *      credited; no photo means no grey box.
 *   5. THE CHECK and the job: deterministic and visual findings, targeted
 *      repair, complete or partial honestly; steps that resume, a key that
 *      makes one job, the fallback without SQL part 380.
 *   6. THE EDITOR: the operations replayed onto the starting page give the
 *      stored page exactly (so the canvas fills in, editable and undoable).
 *   7. MEASURED: calls and tokens per site, and the cost they imply.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { startRows } from "@/lib/website-builder/create-website"
import { costOf } from "@/lib/sites/agent/models"
import { ZERO_USAGE, addUsage } from "@/lib/sites/agent/types"
import { readSitePlan, sitePlanTool, plannableTypes, unavailableBecause, layoutFields, themeSettingsFor, rhythmFor } from "@/lib/website-builder/agent/site-plan"
import { DESIGN_PRESETS } from "@/lib/website-builder/design-presets"
import { describeCapabilities, proofAvailable, realNumbers, readCapabilities } from "@/lib/website-builder/ai-site/capabilities"
import { applySiteOps, buildSite, syncChrome, ANY_PAGE, type SiteState } from "@/lib/website-builder/ai-site/apply"
import { checkFill, fillSpec, bindOps, fillSystem, writeOps, type FillContext } from "@/lib/website-builder/ai-site/fill"
import { fallbackFor, fillSlot, openverseUrl, rankImages, creditsHtml, OPENVERSE_LICENSES } from "@/lib/website-builder/ai-site/images"
import { deterministicFindings, visualFindings } from "@/lib/website-builder/ai-site/verify"
import { newJob, runStep, runUntil, publicView, canContinue, fillContext, keepPhotos, type Job, type JobDeps } from "@/lib/website-builder/ai-site/job"
import { PLAN_MODEL, SMALL_MODEL, WRITE_MODEL, pool, type Models } from "@/lib/website-builder/ai-site/models"
import { isStartKey, startJobRow } from "@/lib/website-builder/ai-site/start"
import { downloadExternalImage } from "@/lib/blog/copy-image"
import { applyOp } from "@/lib/website-builder/agent/operations"
import { ceramicsPlan, emptyCaps, fakeOpenverse, fakeProvider, memorySite, richCaps, tokens, type CallLog } from "./ai-site-fakes"
import { GenerationPanel, generationPhase } from "@/components/website-builder/ai-generation/generation-panel"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const schemas = SECTION_SCHEMAS
const addable = [...ADDABLE_SECTIONS]
const PROMPT = "A website for my ceramics studio in Porto: hand thrown stoneware, wheel classes for beginners, warm and calm."

function startingSite(): SiteState {
  const rows = startRows()!
  return { settings: rows.settings as Record<string, unknown>, pages: Object.fromEntries(rows.pages.map((p) => [p.page_key, p.sections])) }
}

function models(log: CallLog[], opts: Parameters<typeof fakeProvider>[1] = {}): Models {
  const provider = fakeProvider(log, opts)
  return { plan: { provider, model: PLAN_MODEL, effort: "medium" }, write: { provider, model: WRITE_MODEL, effort: "low" }, small: { provider, model: SMALL_MODEL, effort: "low" } }
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("1. The plan is checked against what exists and what is real")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const caps = emptyCaps()
    const plan = readSitePlan(ceramicsPlan(), { caps, addable, schemas })
    check("a plan comes back", !!plan)
    const home = plan!.pages[0]
    check("home is first and the shop template is never written", home.key === "home" && !plan!.pages.some((p) => p.key === "products"))
    check("an unknown type is left out and said", !home.sections.some((s) => s.type === "not_a_section") && plan!.corrections.some((c) => /not_a_section/.test(c)))
    check("testimonials are left out when the store has no buyer quotes", !home.sections.some((s) => s.type === "proof_testimonials") && plan!.corrections.some((c) => /proof_testimonials.*no real buyer quotes/.test(c)))
    check("a layout value the control does not take is dropped, a good one kept", !("image_side" in home.sections.find((s) => s.type === "text_image")!.layout) && home.sections[0].layout.image_side === "right")
    check("columns arrive as a number from the range control", home.sections.find((s) => s.type === "media_gallery")!.layout.columns === 3)
    check("picture briefs only for real slots", home.sections[0].images[0]?.slot === "image" && home.sections.find((s) => s.type === "media_gallery")!.images[0]?.slot === "block:picture")
    check("adjustments go through Theme settings' controls", plan!.adjustments.border_radius === 4 && plan!.adjustments.button_shape === "rounded")
    const bad = readSitePlan(ceramicsPlan({ preset: "nope", typography: { heading: "Comic Sans", body: "Inter" } }), { caps, addable, schemas })!
    check("an unknown preset falls back to a real one and says so", bad.preset === DESIGN_PRESETS[0].id && bad.corrections.some((c) => /preset/.test(c)))
    check("a font the theme cannot load is replaced", bad.typography.heading !== "Comic Sans" && bad.corrections.some((c) => /Comic Sans/.test(c)))
    check("no home page with a section, no plan", readSitePlan({ pages: [{ key: "about", title: "About", sections: [{ type: "cta_simple" }] }] }, { caps, addable, schemas }) === null)
    check("a plan sent as text (no tool call) is read too", !!readSitePlan(`Here:\n${JSON.stringify(ceramicsPlan())}`, { caps, addable, schemas }))
    const many = ceramicsPlan({ pages: [{ key: "home", title: "Home", purpose: "", sections: Array.from({ length: 14 }, () => ({ type: "cta_simple", purpose: "", content: "", scheme: "light", layout: [], images: [] })) }] })
    check("home is cut to nine sections", readSitePlan(many, { caps, addable, schemas })!.pages[0].sections.length === 9)

    const types = plannableTypes(addable, schemas, caps)
    check("the library is read from the manifest, less what this creator cannot show", types.length > 20 && !types.includes("product_grid") && !types.includes("reviews_carousel") && !types.includes("proof_logos") && types.includes("hero_split"))
    const rich = plannableTypes(addable, schemas, richCaps())
    check("with products, reviews and quotes, those sections are offered", rich.includes("product_grid") && rich.includes("proof_testimonials") && rich.includes("reviews_carousel") && rich.includes("collection_featured"))
    check("logos and team are never offered (no real logos, no real people)", !rich.includes("proof_logos") && unavailableBecause("team_grid", richCaps()) !== null && unavailableBecause("logo_cloud", richCaps()) !== null)
    check("a future section from the design library is judged by its name", unavailableBecause("testimonial_wall", caps) !== null && unavailableBecause("stats_band", caps) !== null && unavailableBecause("bento_grid", caps) === null && unavailableBecause("hero_editorial", caps) === null)

    const tool = sitePlanTool(types)
    const strictOk = (s: unknown): boolean => {
      if (!s || typeof s !== "object") return true
      const o = s as Record<string, unknown>
      if (o.type === "object") {
        const props = Object.keys((o.properties ?? {}) as object)
        if (o.additionalProperties !== false || JSON.stringify([...(o.required as string[])].sort()) !== JSON.stringify(props.sort())) return false
      }
      return Object.values(o).every((v) => (Array.isArray(v) ? v.every(strictOk) : strictOk(v)))
    }
    check("the plan tool is a strict schema: every object closed, every field required", strictOk(tool.parameters))
    check("no numeric or length constraints strict mode would refuse", !/"(minimum|maximum|minLength|maxLength|minItems|maxItems)"/.test(JSON.stringify(tool.parameters)))
    check("its section enum is this site's library", JSON.stringify(tool.parameters).includes('"hero_split"') && !JSON.stringify(tool.parameters).includes('"proof_testimonials"'))
    check("layout choices are select or radio controls (and columns), never colours or bindings", layoutFields("product_grid", schemas).every((f) => f.id !== "source" && f.id !== "color_scheme"))

    const themed = themeSettingsFor(plan!)
    const preset = DESIGN_PRESETS.find((p) => p.id === "warm_atelier")!
    check("theme settings: the preset's whole look (schemes, text styles), the fonts and the brand, each checked", themed.settings.font_heading === "Fraunces" && themed.settings.brand_name === "Clay & Kiln" && JSON.stringify(themed.settings.color_schemes) === JSON.stringify((preset.settings as Record<string, unknown>).color_schemes) && !!themed.settings.typography_styles && themed.notes.length === 0, themed.notes)
    check("the plan left the palette to the preset", Object.keys(plan!.palette.colors).length === 0)
    check("each section takes the preset's scheme rhythm", rhythmFor(plan!).length > 0 && rhythmFor(plan!)[0] === preset.sectionRhythm[0])
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("2. Capabilities: what this creator really has")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const rich = richCaps()
    check("real numbers only: products, reviews and their average", JSON.stringify(realNumbers(rich).sort()) === JSON.stringify(["2", "4", "4.8", "4.8/5"].sort()))
    check("proof kinds that are real", JSON.stringify(proofAvailable(rich)) === JSON.stringify({ quotes: true, reviews: true, numbers: true }) && JSON.stringify(proofAvailable(emptyCaps())) === JSON.stringify({ quotes: false, reviews: false, numbers: false }))
    check("an empty store says to plan no proof", /Plan no testimonials/.test(describeCapabilities(emptyCaps())) && /no products yet/.test(describeCapabilities(emptyCaps())))
    const calls: string[] = []
    const db = {
      from: (t: string) => {
        calls.push(t)
        const chain: Record<string, unknown> = {}
        const self = new Proxy(chain, {
          get: (_x, k) => (k === "then" ? (res: (v: unknown) => void) => res(t === "communities" ? { data: [{ id: "k1", name: "Clay club", status: "published", visibility: "public" }, { id: "k2", name: "Hidden", status: "draft", visibility: "public" }], error: null } : t === "site_blog_posts" ? { count: 3, error: null } : { data: null, error: { code: "42P01" } }) : k === "maybeSingle" ? async () => ({ data: t === "profiles" ? { display_name: "Ana Costa", avatar_url: "https://x.test/a.jpg" } : null }) : () => self),
        })
        return self
      },
    }
    const read = await readCapabilities(db, { creatorId: "c1", ownerUserId: "u1" }, async () => rich.facts)
    check("the manifest: published public communities only, posts counted, a missing table is none", read.communities.length === 1 && read.communities[0].id === "k1" && read.blog.posts === 3 && read.forms.published === 0, read)
    check("the brand from the profile when the store has no name of its own", read.brand.name === "Ana Costa" && read.brand.avatarUrl === "https://x.test/a.jpg")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("3. Section words: the section's shape, the editor's checks, nothing invented")
  // ═══════════════════════════════════════════════════════════════════════
  const caps = richCaps()
  const plan = readSitePlan(ceramicsPlan(), { caps, addable, schemas })!
  const ctx: FillContext = { site: plan, caps, capsText: describeCapabilities(caps), prompt: PROMPT, schemas, links: [{ path: "/", title: "Home" }, { path: "/classes", title: "Classes" }, { path: "/contact", title: "Contact" }, { path: "/products/wheel-class", title: "Wheel class" }], defaultLink: "/contact" }
  {
    const hero = fillSpec("hero_split", schemas)
    check("the hero's shape is its own text controls, never images, colours or alt", hero.fields.some((f) => f.id === "heading") && hero.fields.some((f) => f.id === "button_url") && !hero.fields.some((f) => /image|color|scheme|alt/.test(f.id)) && hero.items === null)
    const faq = fillSpec("faq_accordion", schemas)
    check("an FAQ writes its questions as items", faq.items?.type === "qa" && faq.items.fields.some((f) => f.id === "question") && faq.items.max <= 8)
    check("testimonials and product grids are bound, not written", fillSpec("proof_testimonials", schemas).items === null && fillSpec("product_grid", schemas).items === null && !fillSpec("proof_featured", schemas).fields.some((f) => f.id === "quote" || f.id === "name"))
    const good = checkFill(JSON.stringify({ settings: { heading: "Plates made slowly", subheading: "Thrown in Porto", button_text: "Book a class", button_url: "/classes", nonsense: "x" }, items: [] }), hero, ctx, "hero_split")
    check("a good answer passes; an id the section does not have is ignored", good.problems.length === 0 && good.settings.heading === "Plates made slowly" && !("nonsense" in good.settings), good.problems)
    const bad = checkFill(JSON.stringify({ settings: { heading: "Unlock your creativity", subheading: "Only $49 — today", button_text: "Go", button_url: "https://evil.example" } }), hero, ctx, "hero_split")
    check("slop words, em dashes, invented prices and links off the site are refused", bad.problems.some((p) => /unlock/i.test(p)) && bad.problems.some((p) => /\$49/.test(p)) && bad.problems.some((p) => /SITE LINKS/.test(p)), bad.problems)
    const real = checkFill(JSON.stringify({ settings: { heading: "Two hours at the wheel", subheading: "A class is €65, clay and firing included.", button_text: "Book", button_url: "" } }), hero, ctx, "hero_split")
    check("a real price passes, and a button with words and no address goes to the site's conversion", real.problems.length === 0 && real.settings.button_url === "/contact", real)
    check("not JSON is a problem", checkFill("I think the heading should be...", hero, ctx, "hero_split").problems[0] === "the answer was not one JSON object")
    const thin = checkFill(JSON.stringify({ settings: { heading: "Questions" }, items: [{ question: "Q?", answer: "<p>A.</p>" }] }), faq, ctx, "faq_accordion")
    check("a section with items needs at least two", thin.problems.some((p) => /at least 2 items/.test(p)))
    const statCtx = checkFill(JSON.stringify({ settings: { heading: "About us", body: "<p>Hi</p>" }, items: [{ value: "500+", label: "happy customers" }, { value: "4.8", label: "average rating" }] }), fillSpec("about_image", schemas), ctx, "about_image")
    check("a number that is not real is refused in a fact; a real one passes", statCtx.problems.some((p) => /500/.test(p)) && !statCtx.problems.some((p) => /4\.8/.test(p)), statCtx.problems)

    const rows = startRows()!
    const testimonials = { id: "t1", type: "proof_testimonials", name: "", settings: {}, blocks: [{ id: "b1", type: "quote", settings: { quote: "Demo", name: "Sam Okafor" } }] }
    const bound = bindOps(testimonials as never, caps, schemas)
    const quotes = bound.ops.filter((o) => o.kind === "add_block")
    check("testimonials quote real buyers only: demo people removed, each quote the buyer's words", bound.ops.some((o) => o.kind === "remove_block" && o.blockId === "b1") && quotes.length === 2 && quotes.every((o) => o.kind === "add_block" && caps.facts!.reviews!.quotes.some((q) => q.text === o.settings!.quote && q.name === o.settings!.name)))
    const grid = bindOps({ id: "g", type: "product_grid", name: "", settings: {}, blocks: [{ id: "x", type: "product", settings: { title: "Demo tee" } }] } as never, caps, schemas)
    check("a product grid draws the shop live and drops its demo products", grid.ops.some((o) => o.kind === "update_section" && o.settings.source === "shop") && grid.ops.some((o) => o.kind === "remove_block"))
    const spot = bindOps({ id: "s", type: "product_spotlight", name: "", settings: {}, blocks: [] } as never, caps, schemas)
    check("a spotlight is a real product: its link and real price", spot.ops.some((o) => o.kind === "update_section" && o.settings.button_url === "/products/wheel-class" && o.settings.price === "€65"), spot.ops)
    const pricing = writeOps({ id: "pt", type: "pricing_table", name: "", settings: {}, blocks: [] } as never, fillSpec("pricing_table", schemas), { settings: {}, items: [{ name: "Gold plan", price: "$999", summary: "Two hours" }, { name: "x", summary: "A bowl" }, { name: "y", summary: "Third" }], problems: [] }, caps)
    const plans = pricing.filter((o) => o.kind === "add_block")
    check("plans are the store's products: names, prices and links from the store, one per product", plans.length === 2 && plans[0].kind === "add_block" && plans[0].settings!.name === "Wheel class, two hours" && plans[0].settings!.price === "€65" && plans[0].settings!.button_url === "/products/wheel-class", plans)
    void rows
    const sys = fillSystem(ctx)
    check("the shared system prefix carries the brief, voice, site links and store facts, and the never-invent rules", /NEVER INVENT/.test(sys) && sys.includes(PROMPT) && sys.includes("/classes") && sys.includes("Breakfast bowl") && sys.length > 2500)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("4. Photos: Openverse, copied under the SSRF guard, credited, no grey boxes")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const url = new URL(openverseUrl("potter hands wheel", "portrait"))
    check("the search asks for commercial, adaptable licences only, large, safe, the right shape", url.host === "api.openverse.org" && url.searchParams.get("license") === "cc0,pdm,by,by-sa" && url.searchParams.get("license_type") === "commercial" && url.searchParams.get("aspect_ratio") === "tall" && url.searchParams.get("mature") === "false")
    check("no 'no derivatives' licence", !(OPENVERSE_LICENSES as readonly string[]).some((l) => /nd/.test(l)))
    const searches: string[] = []
    const results = await fakeOpenverse(searches)("q")
    const ranked = rankImages(results, "landscape", new Set(["q-1"]))
    check("photos ranked: big enough, the right shape first, never one already used", ranked.length > 0 && !ranked.some((r) => r.id === "q-1") && ranked[0].width / ranked[0].height >= 1.2)

    /* The real download path, with a name that resolves to a private address: refused before anything is fetched. */
    let fetched = 0
    const guarded = (raw: string) => downloadExternalImage(raw, { resolve: async () => ["169.254.169.254"], fetch: (async () => { fetched++; return new Response("x") }) as never })
    const refused = await guarded("https://metadata.example/latest")
    check("the copy refuses an address that resolves to a private network, and never fetches it", !refused.ok && fetched === 0, refused)
    const http = await downloadExternalImage("http://example.com/a.jpg", { resolve: async () => ["93.184.216.34"], fetch: (async () => new Response("x")) as never })
    check("the copy refuses plain http", !http.ok)

    const hero = { id: "h1", type: "hero_split", name: "", settings: { heading: "Plates" }, blocks: [] }
    const used = new Set<string>()
    const copied: string[] = []
    const deps = { search: fakeOpenverse(searches), copy: async (u: string) => (copied.push(u), { ok: true as const, url: `https://cdn.storelib.test/store-builder-images/u1/sections/${copied.length}.jpg` }) }
    const r = await fillSlot({ page: "home", section: hero as never, planned: plan.pages[0].sections[0], slot: "image", brief: { slot: "image", query: "potter hands wheel clay", aspect: "portrait" } }, deps, used, schemas)
    const op = r.ops[0]
    check("a slot gets a copied photo (the creator's own address), alt text and a credit", op?.kind === "update_section" && String(op.settings.image).startsWith("https://cdn.storelib.test/store-builder-images/") && typeof op.settings.image_alt === "string" && r.credits.length === 1 && r.credits[0].license.startsWith("C"), r)
    const gallery = { id: "g1", type: "media_gallery", name: "", settings: {}, blocks: [{ id: "a", type: "picture", settings: {} }, { id: "b", type: "picture", settings: {} }] }
    const g = await fillSlot({ page: "home", section: gallery as never, planned: plan.pages[0].sections[2], slot: "block:picture", brief: { slot: "block:picture", query: "stoneware bowls", aspect: "square" } }, deps, used, schemas)
    check("every gallery item gets a different photo", g.ops.length === 2 && new Set(g.ops.map((o) => (o.kind === "update_block" ? o.settings.image : ""))).size === 2)
    const nothing = await fillSlot({ page: "home", section: hero as never, planned: plan.pages[0].sections[0], slot: "image", brief: { slot: "image", query: "zzz", aspect: "landscape" } }, { search: async () => [], copy: deps.copy }, used, schemas)
    check("no photo found: reported missing, nothing written", nothing.ops.length === 0 && nothing.missing[0] === "image")
    const failingCopy = await fillSlot({ page: "home", section: hero as never, planned: plan.pages[0].sections[0], slot: "image", brief: { slot: "image", query: "kiln", aspect: "landscape" } }, { search: fakeOpenverse([]), copy: async () => ({ ok: false as const, error: "That address leads somewhere that is not on the public internet." }) }, used, schemas)
    check("a photo the guard refuses is skipped, never stored", failingCopy.ops.length === 0 && failingCopy.missing.length === 1)

    let n = 0
    const fb = fallbackFor({ id: "h1", type: "hero_split", name: "", settings: { heading: "Plates", subheading: "Thrown in Porto", button_text: "Book", image: "" } } as never, ["image"], 1, { schemas, addable, newId: (t) => `${t}-new${n++}` })
    const add = fb?.ops.find((o) => o.kind === "add_section")
    check("a hero with no photo becomes its words-only sibling with the same words, in its place", fb?.ops[0].kind === "remove_section" && add?.kind === "add_section" && /^hero_(editorial|centered)$/.test(add.sectionType) && add.settings!.heading === "Plates" && add.index === 1 && !Object.keys(add.settings!).some((k) => /image/.test(k)), fb)
    const bg = fallbackFor({ id: "c1", type: "cta_banner", name: "", settings: { background: "image" } } as never, ["image"], 2, { schemas, addable, newId: (t) => t })
    check("a banner over a photo goes back to its colour", bg?.ops.length === 1 && bg.ops[0].kind === "update_section" && bg.ops[0].settings.background === "colour")
    const gl = fallbackFor(gallery as never, ["block:picture#a", "block:picture#b"], 3, { schemas, addable, newId: (t) => t })
    check("a gallery without photos is left out, never grey squares", gl?.ops[0].kind === "remove_section")
    const feat = fallbackFor({ id: "f1", type: "features_grid", name: "", settings: { marker: "image" }, blocks: [{ id: "p", type: "point", settings: {} }] } as never, ["block:point#p"], 1, { schemas, addable, newId: (t) => t })
    check("features without their small pictures fall back to numbers", feat?.ops[0].kind === "update_section" && feat.ops[0].settings.marker === "number")
    const html = creditsHtml([{ title: "Bowls <b>", creator: "Ana", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", source: "javascript:alert(1)", page: "home" }])
    check("credits: title, author, licence and Openverse, escaped, never a script link", /Bowls &lt;b&gt;/.test(html) && /CC BY 4.0/.test(html) && !/javascript:/.test(html) && /Openverse/.test(html))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("5. The whole job, with fakes: steps, the editor's replay, calls and tokens")
  // ═══════════════════════════════════════════════════════════════════════
  const log: CallLog[] = []
  const searches: string[] = []
  const site = memorySite(startingSite())
  const saves: Job[] = []
  let visualAsked = 0
  const deps: JobDeps = {
    models: models(log, { thinking: { plan: 6000, write: 400 } }),
    site,
    capabilities: async () => richCaps(),
    images: { search: fakeOpenverse(searches, { empty: /kiln fire/ }), copy: async (u) => ({ ok: true, url: `https://cdn.storelib.test/store-builder-images/u1/sections/${encodeURIComponent(u).slice(-24)}` }) },
    visual: async () => {
      visualAsked++
      return []
    },
    schemas,
    addable,
    save: async (j) => {
      saves.push(j)
    },
  }
  let job = newJob({ id: "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0", creatorId: "c1", ownerUserId: "u1", installId: "i1", prompt: PROMPT })
  const steps: string[] = []
  const t0 = Date.now()
  while (job.step !== "done" && steps.length < 12) {
    steps.push(job.step)
    job = await runStep(job, deps)
  }
  const ms = Date.now() - t0
  const final = site.state()
  check("the five steps in order, each once", steps.join(",") === "plan,build,write,photos,check", steps)
  check("it ends complete with nothing left to fix", job.status === "complete" && job.progress === 100 && job.state.findings.length === 0, { status: job.status, findings: job.state.findings, notes: job.state.notes })
  check("one strong call plans the whole site", log.filter((c) => c.kind === "plan").length === 1 && log[0].model === PLAN_MODEL)
  const writes = log.filter((c) => c.kind === "write")
  check("one writer call per section, on Sonnet or Haiku", writes.length === job.state.placed.length - job.state.placed.filter((p) => /proof_testimonials|contact/.test(p.type)).length || writes.length >= job.state.placed.length - 3, { writes: writes.length, placed: job.state.placed.length })
  check("tiny sections on Haiku, the rest on Sonnet", writes.some((c) => c.model === SMALL_MODEL) && writes.some((c) => c.model === WRITE_MODEL) && writes.every((c) => c.model !== PLAN_MODEL))
  check("every writer call shares one system prefix (cached after the first)", new Set(writes.map((c) => c.system)).size === 1 && writes.filter((c) => c.usage.cachedInputTokens > 0).length >= writes.length - 2)
  const pages = Object.keys(final.pages)
  const bodyOf = (list: SiteState["pages"][string]) => JSON.stringify(list.filter((x) => x.type !== "header" && x.type !== "footer"))
  check("home, about, classes and contact pages, plus Photo credits; the product template's body untouched", ["home", "about", "classes", "contact", "photo-credits"].every((k) => pages.includes(k)) && bodyOf(final.pages.product) === bodyOf(startingSite().pages.product), pages)
  const headers = pages.map((k) => JSON.stringify(final.pages[k].find((s) => s.type === "header")))
  const footers = pages.map((k) => JSON.stringify(final.pages[k].find((s) => s.type === "footer")))
  check("the same header and footer on every page, the product template included", new Set(headers).size === 1 && new Set(footers).size === 1)
  const header = final.pages.home.find((s) => s.type === "header")!
  check("the header shows this site's own pages, not the store's shared menu", header.settings.menu === "" && (header.blocks ?? []).filter((b) => b.type === "nav_link").map((b) => b.settings.url).join(",") === "/products,/about,/classes,/contact", header.blocks?.map((b) => b.settings.url))
  const footer = final.pages.home.find((s) => s.type === "footer")!
  check("the footer links the pages and the Photo credits", (footer.blocks ?? []).some((b) => b.settings.url === "/photo-credits") && (footer.blocks ?? []).some((b) => b.settings.url === "/classes"))
  const body = final.pages.home.filter((s) => s.type !== "header" && s.type !== "footer")
  check("home: the plan's sections in order (the unknown one left out)", body.map((s) => s.type).join(",") === "hero_split,proof_testimonials,text_image,media_gallery,faq_accordion,cta_simple", body.map((s) => s.type))
  const generated = Object.entries(final.pages).filter(([k]) => k !== "product").flatMap(([, v]) => v)
  check("every section has its id and is a built-in, addable type (editable in the sidebar)", generated.every((s) => typeof s.id === "string" && s.id && (s.type === "header" || s.type === "footer" || addable.includes(s.type))), generated.filter((s) => !(s.type === "header" || s.type === "footer" || addable.includes(s.type))).map((s) => s.type))
  const demo = JSON.stringify(final.pages.home)
  check("no preset demo people or products left", !/Sam Okafor|Lorem|Your headline/i.test(demo))
  const hero = body[0]
  check("the hero: its words, a copied photo with alt text, its layout choice", typeof hero.settings.heading === "string" && /Plates made slowly/.test(hero.settings.heading as string) && String(hero.settings.image).startsWith("https://cdn.storelib.test/") && !!hero.settings.image_alt && hero.settings.image_side === "right")
  const quotes = body.find((s) => s.type === "proof_testimonials")!
  check("testimonials are the store's real quotes", (quotes.blocks ?? []).length === 2 && (quotes.blocks ?? []).every((b) => richCaps().facts!.reviews!.quotes.some((q) => q.text === b.settings.quote)))
  const gallery = body.find((s) => s.type === "media_gallery")!
  check("the gallery's items each have a photo", (gallery.blocks ?? []).length >= 2 && (gallery.blocks ?? []).every((b) => String(b.settings.image).startsWith("https://")))
  const about = final.pages.about.filter((s) => s.type !== "header" && s.type !== "footer")
  check("a section whose photo was not found became its words-only sibling (no grey box), said in plain words", about[0].type === "text_rich" && !!about[0].settings.heading && job.state.notes.some((n) => /About \+ Image section became a Rich Text section, without a photo.*the About page/.test(n)), about.map((s) => s.type))
  check("theme settings: the preset's and the plan's, in the draft", final.settings.font_heading === "Fraunces" && final.settings.brand_name === "Clay & Kiln" && !!final.settings.color_schemes)
  check("the photo credits page lists each photo used", job.state.credits.length >= 4 && JSON.stringify(final.pages["photo-credits"]).includes("Openverse"))
  check("the visual check ran on the home page", visualAsked === 1)

  /* THE EDITOR'S REPLAY: the starting page plus the job's operations for it, in order, is the stored page. */
  let replay = { sections: startingSite().pages.home, settings: startingSite().settings }
  for (const o of job.state.ops) if (o.page === "home" || o.page === ANY_PAGE) replay = applyOp(replay, o.op, schemas)
  check("replaying the job's operations on the editor's page gives exactly the stored home page", JSON.stringify(replay.sections) === JSON.stringify(final.pages.home), { replay: replay.sections.map((s) => s.type), stored: final.pages.home.map((s) => s.type) })
  check("and exactly the stored theme settings", JSON.stringify(replay.settings) === JSON.stringify(final.settings))
  const view = publicView(job, 10)
  check("the poll gives the operations after the editor's cursor", view.ops.every((o) => o.seq > 10) && view.seq === job.state.seq && !("caps" in view) && !("plan" in view))
  check("saved after every step and every wave", saves.length >= 6)

  /* ── measured ── */
  const total = log.reduce((u, c) => addUsage(u, c.usage), ZERO_USAGE)
  const byModel = (m: string) => log.filter((c) => c.model === m).reduce((u, c) => addUsage(u, c.usage), ZERO_USAGE)
  const usd = [PLAN_MODEL, WRITE_MODEL, SMALL_MODEL].reduce((sum, m) => sum + costOf(m, byModel(m)).usd, 0)
  console.log(`\n  MEASURED (fake provider, 4 chars a token, thinking 6000 plan / 400 per write):`)
  console.log(`    calls: ${log.length} (plan ${log.filter((c) => c.kind === "plan").length}, write ${writes.length}: ${writes.filter((c) => c.model === WRITE_MODEL).length} Sonnet, ${writes.filter((c) => c.model === SMALL_MODEL).length} Haiku)`)
  for (const m of [PLAN_MODEL, WRITE_MODEL, SMALL_MODEL]) {
    const u = byModel(m)
    console.log(`    ${m}: in ${u.inputTokens} (cache read ${u.cachedInputTokens}, cache write ${u.cacheWriteTokens}), out ${u.outputTokens}, $${costOf(m, u).usd.toFixed(4)}`)
  }
  console.log(`    total: in ${total.inputTokens}, out ${total.outputTokens}, estimated $${usd.toFixed(3)} per site; Openverse searches ${searches.length}; wall ${ms} ms with instant fakes`)
  check("a site costs well under a dollar at these token counts", usd > 0 && usd < 1, usd)
  check("the job's own spend record agrees with the calls", job.state.spend.calls === log.length && Math.abs(job.state.spend.usd - usd) < 0.001, job.state.spend)

  // ═══════════════════════════════════════════════════════════════════════
  section("6. Repair, failure and resume")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /* The first answer for every section invents a price; the repair is clean. */
    const log2: CallLog[] = []
    let firstBad = 0
    const s2 = memorySite(startingSite())
    const d2: JobDeps = {
      ...deps,
      site: s2,
      visual: undefined,
      save: async () => {},
      models: models(log2, {
        write: (user, n) => {
          if (/YOUR PREVIOUS ANSWER/.test(user)) return null
          if (n === 0 || /faq_accordion/.test(user)) {
            firstBad++
            return JSON.stringify({ settings: { heading: "Only $19 today" }, items: [] })
          }
          return null
        },
      }),
    }
    let j2 = newJob({ id: "1b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0", creatorId: "c1", ownerUserId: "u1", installId: "i1", prompt: PROMPT })
    j2 = await runUntil(j2, d2)
    const repairs = log2.filter((c) => /YOUR PREVIOUS ANSWER/.test(c.user))
    check("an answer with an invented price is sent back once, with the problem named", repairs.length === firstBad && repairs.every((c) => /price \(\$19\)/.test(c.user)), { repairs: repairs.length, firstBad })
    check("and the repaired words are what lands", !JSON.stringify(s2.state()).includes("$19") && j2.status === "complete", j2.state.findings)

    /* A writer that never answers usable JSON: the section is left out, said, and the job is partial. */
    const s3 = memorySite(startingSite())
    const d3: JobDeps = { ...deps, site: s3, visual: undefined, save: async () => {}, models: models([], { write: (user) => (/faq_columns/.test(user) ? "Sorry, I cannot." : null) }) }
    const j3 = await runUntil(newJob({ id: "2b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0", creatorId: "c1", ownerUserId: "u1", installId: "i1", prompt: PROMPT }), d3)
    check("a section that cannot be written is taken off the page, not left with demo copy", !s3.state().pages.classes.some((s) => s.type === "faq_columns") && j3.state.notes.some((n) => /Two Column FAQ section on the Classes page could not be written truthfully and was left out/.test(n)))
    check("and the job says partial, honestly", j3.status === "partial" && j3.step === "done")

    /* The plan call fails twice: failed, with the website untouched and Continue offered. */
    const s4 = memorySite(startingSite())
    const broken = { id: "x", complete: async () => { throw new Error("overloaded") } }
    const j4 = await runStep(newJob({ id: "3b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0", creatorId: "c1", ownerUserId: "u1", installId: "i1", prompt: PROMPT }), { ...deps, site: s4, save: async () => {}, models: { ...deps.models, plan: { provider: broken, model: PLAN_MODEL } } })
    check("a plan that cannot be made: failed, nothing written, Continue offered", j4.status === "failed" && j4.step === "plan" && s4.writes === 0 && canContinue(j4) && !!j4.error)

    /* Out of time in the middle of writing: the step stops, keeps what it did, and the next call finishes it. */
    const s5 = memorySite(startingSite())
    let clock = 0
    const d5: JobDeps = { ...deps, site: s5, visual: undefined, save: async () => {}, concurrency: 3, now: () => clock, models: models([]) }
    let j5 = newJob({ id: "4b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0", creatorId: "c1", ownerUserId: "u1", installId: "i1", prompt: PROMPT })
    j5 = await runStep(j5, d5)
    j5 = await runStep(j5, d5)
    let calls = 0
    /* The clock reads 0 when the step starts and before its first wave, then is past the deadline. */
    const timed: JobDeps = { ...d5, deadline: 100, now: () => (calls++ < 2 ? 0 : 1000) }
    j5 = await runStep(j5, timed)
    const firstPass = j5.state.filled.length
    check("a write step out of time stops after a wave, still on write, with its sections recorded", j5.step === "write" && firstPass === 3 && j5.status === "running", { step: j5.step, filled: firstPass })
    j5 = await runStep(j5, d5)
    check("the next call finishes the rest, writing none twice", j5.step === "photos" && new Set(j5.state.filled).size === j5.state.filled.length && j5.state.filled.length + j5.state.failed.length === j5.state.placed.length)
    const before = JSON.stringify(s5.state())
    const again = buildSite({ plan: j5.plan!, site: s5.state(), schemas, addable, idSeed: "4b1c2d3e", shop: true })
    check("building the same plan again makes the same ids (a resumed build adds nothing twice)", again.placed.every((p) => j5.state.placed.some((q) => q.id === p.id)))
    void before
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("7. The job row: one per press, and the fallback before SQL part 380")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("a press's key: 8 to 80 letters, digits and dashes", isStartKey("3f0c-9a1b-77d2") && !isStartKey("short") && !isStartKey("has space here") && !isStartKey(42))
    const table = (result: unknown, second?: unknown) => ({ from: () => { let n = 0; const q: Record<string, unknown> = {}; const p = new Proxy(q, { get: (_t, k) => (k === "single" || k === "maybeSingle" ? async () => (n++ === 0 ? result : second) : () => p) }); return p } })
    check("made: the new row's id", JSON.stringify(await startJobRow(table({ data: { id: "j1" }, error: null }) as never, { creatorId: "c", ownerUserId: "u", installId: "i", prompt: "p", key: "abcdefgh" })) === JSON.stringify({ kind: "made", id: "j1" }))
    check("without the table: missing, so the editor builds in its own request", (await startJobRow(table({ data: null, error: { code: "42P01" } }) as never, { creatorId: "c", ownerUserId: "u", installId: "i", prompt: "p", key: "abcdefgh" })).kind === "missing")
    const dupDb = { from: () => { const p: Record<string, unknown> = new Proxy({}, { get: (_t, k) => (k === "single" ? async () => ({ data: null, error: { code: "23505" } }) : k === "maybeSingle" ? async () => ({ data: { id: "j0", install_id: "i0" }, error: null }) : () => p) }); return p } }
    check("the same press twice: the first job, never a second", JSON.stringify(await startJobRow(dupDb as never, { creatorId: "c", ownerUserId: "u", installId: "i", prompt: "p", key: "abcdefgh" })) === JSON.stringify({ kind: "duplicate", id: "j0", installId: "i0" }))

    const create = code("app/api/website-builder/themes/create/route.ts")
    check("create: the same key finds its job before anything is made", create.indexOf('.eq("idempotency_key", key)') < create.indexOf("createStartWebsite("))
    check("create: the per creator limit (rate limit and one running job) before the website is made", /bucket: "site-generate"/.test(create) && /MAX_RUNNING_JOBS/.test(create) && create.indexOf("MAX_RUNNING_JOBS") < create.indexOf("createStartWebsite("))
    check("create: without the table the answer says fallback; with it, the job is kicked after the answer", /fallback: true/.test(create) && /after\(\(\) => kickJob\(origin, job\.id\)\)/.test(create))
    check("create: only the owner generates", /generating && !site\.isOwner/.test(create))
    const run = code("app/api/website-builder/ai-jobs/[jobId]/run/route.ts")
    check("run: only with this server's token for this job, answers at once, works after", /verifyJobToken\(jobId, req\.headers\.get\("x-ai-job-token"\)\)/.test(run) && /after\(\(\) => driveJob/.test(run) && /status: 202/.test(run) && /maxDuration = 300/.test(run))
    const poll = code("app/api/website-builder/ai-jobs/[jobId]/route.ts")
    check("poll: the caller's own client and creator, and a lapsed runner is taken over", /site\.supabase\.from\(JOBS_TABLE\)/.test(poll) && /\.eq\("creator_id", site\.creatorId\)/.test(poll) && /leaseLapsed\(light\)/.test(poll) && /select\(LIGHT\)/.test(poll) && /seq > afterSeq/.test(poll) && /driveJob/.test(poll))
    const gen = code("app/api/website-builder/themes/[installId]/generate/route.ts")
    check("fallback: the same steps in the request, NDJSON, with a checkpoint for Continue", /runUntil\(/.test(gen) && /application\/x-ndjson/.test(gen) && /checkpointOf\(end\)/.test(gen) && /websiteInstallCaller\(installId\)/.test(gen) && /isOwner/.test(gen))
    const runner = code("lib/website-builder/ai-site/runner.ts")
    check("runner: claims, runs to its budget, lets go, hands over", runner.indexOf("claimJob(") < runner.indexOf("runUntil(") && /releaseJob\(/.test(runner) && /kickJob\(origin, jobId\)/.test(runner))
    const server = code("lib/website-builder/ai-site/server.ts")
    check("drafts only: the job writes draft_sections and draft_settings, never the live columns", /draft_sections: sections/.test(server) && /draft_settings: sanitizeThemeSettings/.test(server) && !/update\(\{ sections:/.test(server) && !/update\(\{ settings:/.test(server))
    check("photos are copied through Copy to Storelib's guarded download into the creator's media folder", /downloadExternalImage\(url\)/.test(server) && /store-builder-images/.test(server) && /\$\{ownerUserId\}\/sections\//.test(server))
    const sql = read("supabase/sql/run-now/380_ai_site_jobs.sql")
    check("SQL 380: owner reads, server writes, one job per press, byte copy in migrations", /ai_site_jobs_select_own/.test(sql) && /REVOKE ALL ON public\.ai_site_jobs FROM anon, authenticated/.test(sql) && /GRANT SELECT ON public\.ai_site_jobs TO authenticated/.test(sql) && /UNIQUE INDEX IF NOT EXISTS ai_site_jobs_idempotency ON public\.ai_site_jobs \(creator_id, idempotency_key\)/.test(sql) && sql === read("supabase/migrations/20271138_ai_site_jobs.sql") && sql.split("\n").filter(Boolean).every((l) => l.trim().endsWith(";") || l.startsWith("/*")))
    check("the check after includes part 380", /p380_ai_site_jobs/.test(read("supabase/sql/run-now/99_check_after.sql")))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("8. The progress view")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const base = { id: "j", installId: "i", status: "running" as const, step: "plan" as const, progress: 5, error: null, seq: 0, ops: [], pages: [], notes: [], findings: [], credits: 0 }
    const html = (view: Parameters<typeof GenerationPanel>[0]["view"], extra: Partial<Parameters<typeof GenerationPanel>[0]> = {}) => renderToStaticMarkup(createElement(GenerationPanel, { view, mode: "job", onContinue: () => {}, onAskFix: () => {}, onClose: () => {}, ...extra }))
    check("planning: the first line, with progress", /Planning your design/.test(html(base)) && /role="progressbar"/.test(html(base)) && /aria-valuenow="5"/.test(html(base)))
    check("writing, photos, checking: each its own line", /Writing pages/.test(html({ ...base, step: "write" })) && /Adding photos/.test(html({ ...base, step: "photos" })) && /Checking/.test(html({ ...base, step: "check" })))
    check("finished: a clear done state with what to do next", /Your website is ready/.test(html({ ...base, step: "done", status: "complete", progress: 100 })) && /data-generation="complete"/.test(html({ ...base, step: "done", status: "complete", progress: 100 })))
    const partial = html({ ...base, step: "done", status: "partial", progress: 100, notes: ["The faq columns section on classes could not be written and was left out."] })
    check("partial: says what was left out and offers Ask AI to fix", /Ask AI to fix/.test(partial) && /left out/.test(partial))
    const stopped = html({ ...base, step: "write", status: "failed", error: "Could not finish writing the pages." })
    check("stopped part way: keeps what was made, offers Continue and Ask AI to fix", /Continue/.test(stopped) && /Ask AI to fix/.test(stopped) && /kept/.test(stopped))
    check("the fallback says to keep the tab open", /Keep this tab open/.test(html(base, { mode: "inline" })))
    check("phase helper", generationPhase({ ...base, step: "done", status: "complete" }) === "complete" && generationPhase({ ...base, status: "failed" }) === "stopped" && generationPhase(base) === "working")
  }

  {
    const kept = keepPhotos({ id: "g", type: "media_gallery", name: "", settings: {}, blocks: [{ id: "a", type: "picture", settings: { image: "https://cdn/1.jpg", alt: "Bowls" } }, { id: "b", type: "picture", settings: { image: "https://cdn/2.jpg" } }] } as never, [
      { kind: "remove_block", sectionId: "g", blockId: "a" },
      { kind: "add_block", sectionId: "g", blockId: "picture-g-0", blockType: "picture", settings: { caption: "New words" } },
      { kind: "add_block", sectionId: "g", blockId: "picture-g-1", blockType: "picture", settings: { caption: "More", image: "" } },
    ])
    check("a section written again by the check keeps its photos, item by item", kept[1].kind === "add_block" && kept[1].settings!.image === "https://cdn/1.jpg" && kept[1].settings!.alt === "Bowls" && kept[1].settings!.caption === "New words" && kept[2].kind === "add_block" && kept[2].settings!.image === "https://cdn/2.jpg")
  }

  /* Sanity that the pool helper keeps order and limits. */
  {
    let live = 0
    let peak = 0
    const out = await pool([1, 2, 3, 4, 5], 2, async (n) => {
      live++
      peak = Math.max(peak, live)
      await new Promise((r) => setTimeout(r, 5))
      live--
      return n * 2
    })
    check("the parallel pool keeps order and its limit", out.join(",") === "2,4,6,8,10" && peak === 2)
  }
  void tokens
  void fillContext
  void deterministicFindings
  void visualFindings
  void applySiteOps
  void syncChrome

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
