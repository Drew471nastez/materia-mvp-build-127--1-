/**
 * Round P (P2a): the site template library and its first six templates.
 *
 *   1. The gallery: six templates, unique ids and type prefixes, every file a
 *      path the agent writes, exportable as JSON for P2b.
 *   2. Every template, every file: the agent's own gate (validateFile:
 *      compile, integration rules, the anti-slop section gate, manifest,
 *      imports), drawn with each placed instance's settings.
 *   3. Every page: the section types exist, every section (header and footer
 *      too) has blocks and every block has words or a choice in it; home has
 *      10 to 14 sections of six or more kinds; product, collection, shop,
 *      search, about and contact exist; the site validates (bindings,
 *      routes, menus) and is complete by the finish rules (N3).
 *   4. The round L render check of every page, and the round O3 slop engine
 *      over the files, the Theme settings and the drawn pages: no P0.
 *   5. Real Chromium (/opt/pw-browsers/chromium): home, product, collection,
 *      about and contact at 1440 and 390, JavaScript off, through the O4
 *      critic's own document and measurements: nothing scrolls sideways, no
 *      unreadable text, no dead call to action.
 *   6. chooseTemplate picks the right template for six briefs (and none for
 *      a law firm); applyTemplate writes everything through a memory store
 *      (files, pages with blocks, tokens as Theme settings, menus, DESIGN.md);
 *      the direction's palette replaces the template's; given pictures land
 *      in their settings; untouchedTemplateParts sees the template copy and
 *      stops seeing it once a section is changed.
 *   7. The agent can browse it: list_templates and search_knowledge.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-templates-p2a.test.ts
 */
import { existsSync } from "node:fs"
import { SITE_TEMPLATES, templateById, templateCatalog } from "@/lib/storelib-ai/templates/registry"
import { chooseTemplate } from "@/lib/storelib-ai/templates/choose"
import { applyTemplate, templatePlan, untouchedTemplateParts, imageTasks, TEMPLATE_SETTING } from "@/lib/storelib-ai/templates/apply"
import { LIST_TEMPLATES_TOOL, runListTemplates, templateEntries } from "@/lib/storelib-ai/templates/gallery"
import type { SiteTemplate } from "@/lib/storelib-ai/templates/types"
import { briefFrom } from "@/lib/storelib-ai/direction/brief"
import { chooseDirection } from "@/lib/storelib-ai/direction/choose"
import { parseDesignMd, DESIGN_MD_PATH } from "@/lib/storelib-ai/direction/design-md"
import { validateFile, validateSite, errorsOf, schemaInfo } from "@/lib/ai-builder/agent/validate"
import { completenessIssues, readSitePlan } from "@/lib/ai-builder/agent/site-plan"
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import { WRITABLE_PATH } from "@/lib/ai-builder/agent-tools"
import { renderCheck } from "@/lib/ai-builder/render-check"
import { librarySlop } from "@/lib/ai-builder/agent/knowledge"
import { runSearchKnowledge } from "@/lib/storelib-ai/library"
import { composeDraftDocument } from "@/lib/ai-builder/visual-critic/document"
import { shootPages } from "@/lib/ai-builder/visual-critic/shoot"
import { measuredDefects } from "@/lib/ai-builder/visual-critic/measure"
import { templateForPage } from "@/lib/website-builder/site-pages"
import { cleanMenus } from "@/lib/storelib-theme/values"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import type { RuntimeCapabilities } from "@/lib/ai-builder/runtime-contract"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import type { ProductCard } from "@/lib/website-builder/shop-products"
import type { StorefrontData } from "@/lib/storelib-theme/types"
import { OFFERED_FAMILIES } from "@/lib/website-builder/font-link"
import { isSlopDisplayFont } from "@/lib/storelib-ai/library/type-systems"
import { motionFindings } from "@/lib/storelib-theme/motion-islands"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 1600) : JSON.stringify(detail).slice(0, 1600)}`}`)
  }
}

const P2A_IDS = ["pressure-coaching", "dial-in-coffee", "off-cut-streetwear", "calibre-watches", "low-end-samples", "still-water-spa"]

/** A store that sells: three products (one with options), a collection, a booking form. */
const CAPS: RuntimeCapabilities = {
  store: { name: "North Yard", currency: "GBP", brandImage: null, tagline: null },
  products: [
    { id: "prod_a", title: "Twelve week block", kind: "service", price: "£480", url: "/products/twelve-week-block", checkout_url: "/checkout?productId=prod_a&src=website", available: true, variants: [] },
    { id: "prod_b", title: "Starter pack", kind: "digital", price: "£24", url: "/products/starter-pack", checkout_url: "/checkout?productId=prod_b&src=website", available: true, variants: [{ id: "var_1", name: "Standard", price: "£24", checkout_url: "/checkout?productId=prod_b&variantId=var_1&src=website" }, { id: "var_2", name: "Extended", price: "£39", checkout_url: "/checkout?productId=prod_b&variantId=var_2&src=website" }] },
    { id: "prod_c", title: "Gift card", kind: "physical", price: "£50", url: "/products/gift-card", checkout_url: "/checkout?productId=prod_c&src=website", available: true, variants: [] },
  ],
  collections: [{ id: "col_1", title: "Everything", url: "/collections/everything", products_count: 3 } as never],
  communities: [],
  forms: [{ id: "form_book", title: "Book a first visit", kind: "booking", booking: true, url: "/request/forms/form_book" }],
  pages: [],
  menus: [],
  blog: { posts: 0 },
  reviews: { count: 0, average: null },
  links: { creatorPage: null, social: [] },
  features: ["shop", "forms", "bookings"],
}

/** The store's products as the renderer's cards (the same shape the critic's document uses). */
function storefront(settings: Record<string, unknown>): { data: StorefrontData; products: ProductCard[] } {
  return {
    data: { menus: cleanMenus(settings.menus), shop: { name: CAPS.store.name }, catalog: CAPS.products.map((p) => ({ id: p.id, type: p.kind, settings: { title: p.title, url: p.url, price: p.price, checkout_url: p.checkout_url } })) } as unknown as StorefrontData,
    products: CAPS.products.map((p) => ({ id: p.id, type: "product", price_cents: 0, settings: { title: p.title, url: p.url, price: p.price, checkout_url: p.checkout_url, available: p.available, kind: p.kind, slug: p.url.replace(/^\/products\//, ""), image: "", images: [], compare_price: "", variants: p.variants.map((v) => ({ ...v, available: true })) } })) as unknown as ProductCard[],
  }
}

/** Words or a choice in a block: at least one string setting with letters, or a picker value. */
function blockHasContent(settings: Record<string, unknown>): boolean {
  return Object.values(settings).some((v) => (typeof v === "string" && /[A-Za-z0-9]/.test(v.replace(/<[^>]*>/g, ""))) || (Array.isArray(v) && v.length > 0))
}

/** The store's capabilities with the template's pages, as list_capabilities answers once they exist. */
function capsFor(t: SiteTemplate): RuntimeCapabilities {
  return { ...CAPS, pages: t.pages.map((p) => ({ key: p.key, title: p.title, url: p.key === "home" ? "/" : `/${p.key}` })) }
}

async function appliedSettings(t: SiteTemplate): Promise<Record<string, unknown>> {
  const store = memoryStore()
  await applyTemplate(store, t, null, { jobId: "job-t" })
  return store.project.settings
}

const body = (sections: SectionInstance[]) => sections.filter((s) => s.group !== "header" && s.group !== "footer")

async function main() {
  console.log("\n1. The gallery")
  {
    const ids = SITE_TEMPLATES.map((t) => t.id)
    check("P2a's six templates are registered", P2A_IDS.every((id) => ids.includes(id)), ids)
    check("ids and prefixes are unique", new Set(ids).size === ids.length && new Set(SITE_TEMPLATES.map((t) => t.prefix)).size === ids.length)
    for (const t of SITE_TEMPLATES) {
      const paths = Object.keys(t.files)
      check(`${t.id}: every file is an agent path with its own prefix`, paths.length > 0 && paths.every((p) => WRITABLE_PATH.test(p) && p.startsWith(`sections/ai_${t.prefix}_`)), paths.filter((p) => !p.startsWith(`sections/ai_${t.prefix}_`)))
    }
    for (const t of SITE_TEMPLATES) {
      const fonts = [t.tokens.fonts.heading, t.tokens.fonts.body, t.tokens.fonts.accent].filter((f): f is string => !!f)
      check(`${t.id}: its fonts are ones the site can load, and the display face is not a default one`, fonts.every((f) => OFFERED_FAMILIES.has(f)) && !isSlopDisplayFont(t.tokens.fonts.heading), fonts.filter((f) => !OFFERED_FAMILIES.has(f)))
    }
    const catalog = templateCatalog()
    check("the catalog exports as JSON with every template's pages and slots", JSON.parse(JSON.stringify(catalog)).length === SITE_TEMPLATES.length && catalog.every((c) => c.pages.length >= 6 && c.imageSlots > 0))
  }

  for (const t of SITE_TEMPLATES) {
    console.log(`\n2-4. ${t.id} (${t.name})`)
    const settings = await appliedSettings(t)
    const sources = t.files

    /* Files: the agent's gate, each drawn with its placed instances. */
    const placed = t.pages.flatMap((p) => p.sections)
    const fileErrors: string[] = []
    const fileWarnings: string[] = []
    for (const [path, text] of Object.entries(t.files)) {
      const type = path.replace(/^sections\//, "").replace(/\.storelib$/, "")
      const instances = placed.filter((s) => s.type === type)
      const issues = validateFile(path, text, { instances, theme: settings, sources, formPicker: true })
      for (const i of issues) (i.severity === "error" ? fileErrors : fileWarnings).push(`${path}: ${i.code} ${i.message.slice(0, 300)}`)
      if (!instances.length) fileErrors.push(`${path}: placed nowhere`)
    }
    check(`${t.id}: every file passes the agent's gate (compile, integration, slop gate, manifest, imports)`, fileErrors.length === 0, fileErrors)
    if (fileWarnings.length) console.log(`        (warnings: ${fileWarnings.length}) ${fileWarnings.slice(0, 3).join(" | ")}`)

    /* Pages. */
    const keys = t.pages.map((p) => p.key)
    check(`${t.id}: home, product, collection, shop, search, about and contact`, ["home", "product", "collection", "products", "search", "about", "contact"].every((k) => keys.includes(k)), keys)
    const home = body(t.pages[0].sections)
    check(`${t.id}: home has 10 to 14 sections of six or more kinds`, t.pages[0].key === "home" && home.length >= 10 && home.length <= 14 && new Set(home.map((s) => s.type)).size >= 6, home.length)
    check(`${t.id}: every page has the header and the footer`, t.pages.every((p) => p.sections[0]?.group === "header" && p.sections[p.sections.length - 1]?.group === "footer"))
    const empty: string[] = []
    for (const p of t.pages) {
      for (const s of p.sections) {
        const info = schemaInfo(s.type, sources)
        if (!info) {
          empty.push(`${p.key} › ${s.id}: no file for ${s.type}`)
          continue
        }
        if (!s.blocks?.length) empty.push(`${p.key} › ${s.id}: no blocks`)
        for (const b of s.blocks ?? []) {
          if (!info.blocks[b.type]) empty.push(`${p.key} › ${s.id}: block type ${b.type} is not declared`)
          else if (!blockHasContent(b.settings)) empty.push(`${p.key} › ${s.id} › ${b.id}: an empty block`)
        }
        const declared = Object.keys(info.blocks)
        const used = new Set((s.blocks ?? []).map((b) => b.type))
        const unused = declared.filter((d) => !used.has(d))
        if (unused.length && p.key === "home") empty.push(`${p.key} › ${s.id}: declares ${unused.join(", ")} but places none`)
      }
    }
    check(`${t.id}: every section on every page has filled blocks (every declared block type used on home)`, empty.length === 0, empty)
    const presetEmpty = Object.entries(t.files).filter(([path, text]) => {
      const c = compileSection(text, { file: path })
      const presets = c.ok ? ((c.value.schema as unknown as { presets?: { blocks?: unknown[] }[] }).presets ?? []) : []
      return !presets.length || !(presets[0].blocks?.length ?? 0)
    })
    check(`${t.id}: every component's preset carries filled blocks (Add section arrives complete)`, presetEmpty.length === 0, presetEmpty.map(([p]) => p))

    const site = errorsOf(validateSite({ pages: t.pages, sources, settings, caps: CAPS, mode: "blank" }))
    check(`${t.id}: the site validates (types, bindings, links, menus, own chrome)`, site.length === 0, site)
    const plan = readSitePlan(templatePlan(t), CAPS, null)
    check(`${t.id}: its plan is a valid site plan`, plan.ok === true, plan.ok === false ? plan.missing : undefined)
    const complete = errorsOf(completenessIssues({ pages: t.pages, sources, settings, caps: CAPS, mode: "blank", plan: plan.ok ? plan.plan : null }))
    check(`${t.id}: complete by the finish rules (home, pages, product, collection, shop, search, own header and footer, every page reachable)`, complete.length === 0, complete)

    /* Image slots and bindings. */
    const aspects = new Set(["1:1", "4:5", "3:4", "2:3", "4:3", "3:2", "16:9", "21:9", "9:16"])
    check(`${t.id}: 6 to 16 image slots, each with a prompt, an aspect and alt text`, t.imageSlots.length >= 6 && t.imageSlots.length <= 16 && t.imageSlots.every((s) => s.prompt.length > 30 && aspects.has(s.aspect) && s.alt.length > 5 && s.targets.length > 0), t.imageSlots.length)
    const badSlots = t.imageSlots.flatMap((slot) =>
      slot.targets
        .filter((tg) => {
          const s = t.pages.find((p) => p.key === tg.page)?.sections.find((x) => x.id === tg.section)
          const info = s ? schemaInfo(s.type, sources) : null
          const fields = tg.block ? info?.blocks[s?.blocks?.find((b) => b.id === tg.block)?.type ?? ""] : info?.settings
          return !fields?.some((f) => f.id === tg.setting && f.type === "image_picker")
        })
        .map((tg) => `${slot.key} -> ${tg.page}/${tg.section}/${tg.block ?? ""}/${tg.setting}`),
    )
    check(`${t.id}: every slot carries P1's generate_image call (landscape, portrait or square; a purpose; a style)`, t.imageSlots.every((s) => !!s.generate && ["landscape", "portrait", "square"].includes(s.generate.aspect) && ["hero", "product", "portrait", "people", "place", "detail", "gallery", "background"].includes(s.generate.purpose) && ["photo", "studio", "editorial", "illustration", "render"].includes(s.generate.style)), t.imageSlots.filter((s) => !s.generate).map((s) => s.key))
    check(`${t.id}: every image slot lands on an image setting`, badSlots.length === 0, badSlots)
    const control = { product: "product_picker", products: "product_list", collection: "collection_picker", form: "form_picker", menu: "link_list" } as const
    const badBindings = t.bindings.filter((b) => {
      const s = t.pages.find((p) => p.key === b.page)?.sections.find((x) => x.id === b.section)
      const info = s ? schemaInfo(s.type, sources) : null
      return !info?.settings.some((f) => f.id === b.setting && f.type === control[b.kind])
    })
    check(`${t.id}: every binding is a real picker setting of a placed section`, t.bindings.length >= 2 && badBindings.length === 0, badBindings)

    /* Round L render check of every page, and the slop engine over everything drawn. */
    const rendered: { page: string; html: string; css?: string }[] = []
    const renderErrors: string[] = []
    const { data, products } = storefront(settings)
    for (const p of t.pages) {
      const rc = await renderCheck({ page: p.key, sections: p.sections, sources, theme: settings as unknown as ThemeSettingsValues, template: templateForPage(p.key), products, data, capabilities: capsFor(t) })
      for (const i of rc.issues) if (i.severity === "error") renderErrors.push(`${p.key}: ${i.code} ${i.message.slice(0, 240)}`)
      if (rc.drawn) rendered.push({ page: p.key, html: rc.drawn.html, css: rc.drawn.css })
    }
    check(`${t.id}: the render check passes on every page`, renderErrors.length === 0, renderErrors)
    /* Round P (P3): every motion island's params are the contract's, in range, within the page limits. */
    const motion = rendered.flatMap((r) => motionFindings(r.html).map((f) => `${r.page}: ${f.message}`))
    check(`${t.id}: no motion island findings on any page (P3 motionFindings)`, motion.length === 0, motion)
    const slop = await librarySlop({ files: Object.entries(t.files).map(([path, text]) => ({ path, text })), concept: null, capabilities: CAPS, brief: "", settings, rendered, sections: home.map((s) => ({ type: s.type })) })
    const p0 = slop.filter((i) => i.severity === "error")
    check(`${t.id}: no slop P0 on the files, the Theme settings or the drawn pages`, p0.length === 0, p0)
    const p1 = slop.filter((i) => i.severity === "warning")
    if (p1.length) console.log(`        (slop P1/P2: ${p1.map((i) => i.code).join(", ")})`)
  }

  console.log("\n5. Real Chromium, 1440 and 390, JavaScript off")
  {
    const chrome = process.env.CHROME ?? "/opt/pw-browsers/chromium"
    if (!existsSync(chrome)) {
      console.log(`  skip  no Chromium at ${chrome}: not visually checked`)
    } else {
      const puppeteer = (await import("puppeteer-core")).default
      for (const t of SITE_TEMPLATES) {
        const settings = await appliedSettings(t)
        const pages = ["home", "product", "collection", "about", "contact"].map((page) => {
          const doc = composeDraftDocument({ page, pages: t.pages, settings, sources: t.files, capabilities: CAPS })
          return { page, html: doc.html, failed: doc.failed }
        })
        check(`${t.id}: every section draws in the critic's document`, pages.every((p) => p.failed.length === 0), pages.flatMap((p) => p.failed))
        const shot = await shootPages(
          pages.map((p) => ({ page: p.page, html: p.html })),
          { photos: false, timeoutMs: 180_000, launch: () => puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox", "--disable-gpu"] }) as never },
        )
        check(`${t.id}: drawn in Chromium`, !!shot && shot.jsDisabled === true)
        if (!shot) continue
        const gates: string[] = []
        const notes: string[] = []
        for (const m of shot.measurements) {
          for (const d of [...measuredDefects(m.page, m.desktop), ...measuredDefects(m.page, m.mobile)]) {
            const line = `${m.page} ${d.viewport} ${d.kind}: ${d.what}`
            /* Round P (P5): an empty <img> or an empty section is a hard gate for the agent's finish; a template is drawn here before its pictures are made, so those are noted, not counted. */
            if (d.gate && d.kind !== "image-missing" && d.kind !== "empty-section") gates.push(line)
            else notes.push(line)
          }
          if (m.desktop.scrollOverflow > 1) gates.push(`${m.page} desktop scrolls sideways by ${m.desktop.scrollOverflow}px`)
        }
        check(`${t.id}: nothing scrolls sideways, no unreadable text, no dead call to action (desktop and 390)`, gates.length === 0, gates)
        const serious = notes.filter((n) => /contrast|heading-wrap|placeholder|cta|image-missing|empty-section/.test(n))
        if (serious.length) console.log(`        (notes: ${serious.slice(0, 6).join(" | ")})`)
      }
    }
  }

  console.log("\n6. Choosing, applying, and what is still the template's")
  {
    const cases: [string, string][] = [
      ["I'm a personal trainer in Leeds, strength coaching for busy people, I want clients to book a consultation", "pressure-coaching"],
      ["A neighbourhood coffee shop and bakery, specialty coffee, pastries, open early", "dial-in-coffee"],
      ["Streetwear clothing brand selling hoodies, tees and caps in small drops", "off-cut-streetwear"],
      ["Luxury watch brand, hand assembled mechanical watches", "calibre-watches"],
      ["I'm a music producer selling sample packs and drum kits for trap and house producers", "low-end-samples"],
      ["Med spa offering facials, skin treatments and massage, book online", "still-water-spa"],
    ]
    for (const [prompt, want] of cases) {
      const brief = briefFrom(prompt, null, CAPS)
      const choice = chooseTemplate(brief, { choice: chooseDirection(brief, [], { seed: "t" }) })
      check(`"${prompt.slice(0, 48)}..." starts from ${want}`, choice.template?.id === want, { got: choice.template?.id, kind: brief.business.kind, story: brief.story, reasons: choice.reasons, alternates: choice.alternates })
    }
    const law = chooseTemplate(briefFrom("A small law firm for tenants' rights", null, null))
    check("a law firm starts from nothing (no close template)", law.template === null, law)

    const t = templateById("pressure-coaching")!
    const store = memoryStore()
    const brief = briefFrom("Personal trainer, strength coaching for busy parents", null, CAPS)
    const r = await applyTemplate(store, t, brief, { jobId: "job-1", images: { hero: { url: "https://cdn.storelib.test/hero.jpg", alt: "A squat in the gym" } } })
    check("applyTemplate writes every file through the store, as drafts by the AI for the job", r.ok && r.files.length === Object.keys(t.files).length && store.versions.filter((v) => v.path.startsWith("sections/")).every((v) => v.author === "ai" && v.jobId === "job-1"), r.problems)
    check("  every page with its blocks", t.pages.every((p) => JSON.stringify(store.project.pages[p.key]?.map((s) => s.blocks?.length)) === JSON.stringify(p.sections.map((s) => s.blocks?.length))))
    const st = store.project.settings as Record<string, unknown>
    const schemes = st.color_schemes as Record<string, { background?: string }>
    check("  the tokens as Theme settings: the site's own schemes, fonts, motion feel", st.default_color_scheme === "site" && schemes.site?.background === t.tokens.colors.background && !!schemes.site_inverse && st.font_heading === t.tokens.fonts.heading && st.motion_tier === t.tokens.motion.tier, { d: st.default_color_scheme, f: st.font_heading, m: st.motion_tier })
    check("  the menus, each page's search title and which template it started from", !!(st.menus as Record<string, unknown>)["main-menu"] && !!(st.page_seo as Record<string, unknown>).about && (st[TEMPLATE_SETTING] as { id?: string }).id === t.id)
    const md = store.project.files[DESIGN_MD_PATH]
    const parsed = md ? parseDesignMd(md) : null
    check("  DESIGN.md, in the round O2 format", !!parsed && parsed.ok === true && md.includes(t.name), parsed && parsed.ok === false ? parsed.errors : undefined)
    const heroNow = store.project.pages.home.find((s) => s.id === "pc-hero")!
    check("  a picture already made lands in its setting; the rest come back as tasks for generate_image", heroNow.settings.image === "https://cdn.storelib.test/hero.jpg" && r.images.length === t.imageSlots.length - 1 && r.images.every((i) => i.prompt.includes(brief.business.label)) && !r.images.some((i) => i.key === "hero"))
    check("  and the next steps say to adapt, never ship it as it is", /never ship|nothing of it ships/i.test(r.next) && r.next.includes("generate_image"))

    const u = untouchedTemplateParts(t, { files: store.project.files, pages: await store.listPages() })
    check("untouchedTemplateParts: right after applying with the hero picture, every other home section is still the template's", u.homeIdentical === false && u.home.untouched === u.home.total - 1 && !u.emptyImageSlots.includes("hero"), u.home)
    const fresh = memoryStore()
    await applyTemplate(fresh, t, null, { jobId: "job-2" })
    const u0 = untouchedTemplateParts(t, { files: fresh.project.files, pages: await fresh.listPages() })
    check("  with nothing changed, home is byte for byte the template (finish must refuse)", u0.homeIdentical === true && u0.files.length === Object.keys(t.files).length && u0.emptyImageSlots.length === t.imageSlots.length, u0)
    const pages = await fresh.listPages()
    const home = pages.find((p) => p.key === "home")!
    const coach = home.sections.find((s) => s.id === "pc-coach")!
    coach.settings = { ...coach.settings, heading: "Coached by Sam, who still trains at six every morning" }
    await fresh.writePages([home])
    const u1 = untouchedTemplateParts(t, { files: fresh.project.files, pages: await fresh.listPages() })
    check("  one section rewritten: home is no longer identical, and that section is not listed", u1.homeIdentical === false && !u1.sections.some((x) => x.id === "pc-coach") && u1.sections.some((x) => x.id === "pc-hero"), u1.home)
    const file = "sections/ai_pc_hero.storelib"
    await fresh.writeFile(file, fresh.project.files[file].replace("Lift", "Lift heavy"), { expectedVersion: (await import("@/lib/ai-builder/agent/version")).versionOf(fresh.project.files[file]), author: "ai", jobId: "job-2" })
    const u2 = untouchedTemplateParts(t, { files: fresh.project.files, pages: await fresh.listPages() })
    check("  a component's file edited: it is not listed as untouched", !u2.files.includes(file) && !u2.sections.some((x) => x.id === "pc-hero"))

    const direction = chooseDirection(brief, [], { seed: "s" })
    const dstore = memoryStore()
    await applyTemplate(dstore, t, brief, { jobId: "job-3", choice: direction })
    const ds = dstore.project.settings as Record<string, unknown>
    check("with the job's direction, the palette and fonts are the direction's", (ds.color_schemes as Record<string, { background?: string }>).site?.background === direction.palette.background && ds.font_heading === direction.fonts.display, { bg: (ds.color_schemes as Record<string, { background?: string }>).site?.background, want: direction.palette.background })
    check("image tasks name the creator's business", imageTasks(t, brief).every((i) => i.prompt.includes(brief.business.label)))
    const heroTask = imageTasks(t, brief).find((i) => i.key === "hero")!
    check("  and each is a ready generate_image call: a 16:9 hero is landscape, purpose hero", heroTask.call.aspect === "landscape" && heroTask.call.purpose === "hero" && heroTask.call.prompt === heroTask.prompt && heroTask.call.style === "photo")
    check("  a 4:5 portrait is portrait, a product shot is studio", imageTasks(t, brief).find((i) => i.key === "coach")?.call.aspect === "portrait" && imageTasks(templateById("calibre-watches")!, brief).find((i) => i.key === "hero-piece")?.call.style === "studio")
  }

  console.log("\n7. The agent can browse the gallery")
  {
    const listed = runListTemplates({ query: "coffee shop" })
    check("list_templates finds the coffee template first", listed.templates[0]?.id === "dial-in-coffee", listed.templates.map((x) => x.id))
    const one = runListTemplates({ query: "low-end-samples" })
    check("  by id, with its full plan", one.templates.length === 1 && !!one.templates[0].plan?.length)
    check("  the tool spec is well formed", LIST_TEMPLATES_TOOL.name === "list_templates" && (LIST_TEMPLATES_TOOL.parameters as { additionalProperties?: boolean }).additionalProperties === false)
    const k = runSearchKnowledge({ query: "site template for a med spa" })
    check("search_knowledge answers a template question with the template", k.entries.some((e) => e.id === "template:still-water-spa"), k.entries.map((e) => e.id))
    const plain = runSearchKnowledge({ query: "product page layout" })
    check("  and leaves other questions alone", !plain.entries.some((e) => e.id.startsWith("template:")))
    check("  a template by id", templateEntries("calibre-watches")[0]?.id === "template:calibre-watches")
  }

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
