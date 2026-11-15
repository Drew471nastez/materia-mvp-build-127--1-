/**
 * Round AZ: the AI source bank (lib/storelib-ai/bank, lib/ai-builder/agent/bank-templates.ts,
 * /admin/ai-bank, SQL part 467). The owner: the AI should build from the Materia themes in their
 * library, their sections, structure and product pages, and adapt them to each business (no shop
 * for a coach).
 *
 * The source here is a real Storelib Default website: the theme's own preset pages
 * (buildThemePreset), filled the way a live store is (product ids, photographs, a logo, an
 * announcement, an email address and a phone number), with a code file of its own.
 *
 *   1. Snapshot: nothing of the source account's business left (pictures, record ids, contact
 *      details, outside links, brand settings); its look kept; its code renamed into the bank's
 *      prefix with the instances following; slots and bindings for what was taken out.
 *   2. Profile: roles, features (a shop), industries from its words.
 *   3. Fit: a coach who does not sell gets no product sections, no product page, no shop menu
 *      links, no slot or binding pointing at what went; a store gets everything; home never empty.
 *   4. Choice: a store brief starts from the bank site; a coach brief does not start from a
 *      shop-led site (the built-in templates answer); a coaching bank site is chosen for a coach.
 *   5. Apply and resume: pages, files and look written through the agent's own store; the fit
 *      recorded; a later slice reads back the same template (preloadBankTemplate); the finish
 *      gate sees the source words as untouched copy.
 *   6. An imported theme is a pattern reference: never poured in, its sections shown as examples.
 *   7. SQL part 467 and the admin route are where the app expects them.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-template-bank.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { buildThemePreset, getThemeDefinition, STORELIB_DEFAULT_ID } from "@/lib/website-builder/theme-registry"
import { briefFrom } from "@/lib/storelib-ai/direction/brief"
import { snapshotSite, isImportedSnapshot, isPourable, lookSettings, withoutContact, roleOf, type SnapshotInput } from "@/lib/storelib-ai/bank/snapshot"
import { chooseBankEntry, fitTemplate, listingOf, wantsOf, refitTemplate } from "@/lib/storelib-ai/bank/fit"
import { bankRowView } from "@/lib/storelib-ai/bank/admin"
import { bankTemplateLibrary, preloadBankTemplate, type BankReader } from "@/lib/ai-builder/agent/bank-templates"
import { defaultTemplates } from "@/lib/ai-builder/agent/templates"
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import { WRITABLE_PATH } from "@/lib/ai-builder/agent-tools"
import { SITE_TEMPLATES, TEMPLATE_SETTING, untouchedTemplateParts } from "@/lib/storelib-ai/templates"
import { CHROME_SOURCES } from "@/lib/storelib-ai/library/examples.generated"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`) }
}
const section = (t: string) => console.log(`\n${t}`)
const root = process.cwd()

/* ── a live store, as the owner's library has it ───────────────────────── */

const PRODUCT_A = "8b0c7a6e-1d2f-4c3b-9a8e-7f6d5c4b3a21"
const PRODUCT_B = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
const COLLECTION = "c0ffee00-1111-4222-8333-444455556666"
const PHOTO = "https://cdn.materia.example/uploads/prime1-hero.webp"
const SOURCE_EMAIL = "hello@prime1.example"
const SOURCE_PHONE = "+40 721 555 123"

function materiaSite(): SnapshotInput {
  const def = getThemeDefinition(STORELIB_DEFAULT_ID)!
  const preset = buildThemePreset(def)
  const fill = (sections: SectionInstance[]): SectionInstance[] =>
    JSON.parse(JSON.stringify(sections)).map((s: SectionInstance) => {
      const st = s.settings as Record<string, unknown>
      if (/hero|image|banner|slideshow/.test(s.type)) st.image = PHOTO
      if (/product|collection/.test(s.type)) { st.product = PRODUCT_A; st.products = [PRODUCT_A, PRODUCT_B]; st.collection = COLLECTION }
      if (s.type === "hero" || s.type === "hero_split") st.heading = "Fuel your focus. Own your day."
      for (const b of s.blocks ?? []) if (b.settings && "image" in b.settings) (b.settings as Record<string, unknown>).image = PHOTO
      return s
    })
  const home = fill(preset.pages.home)
  /* A contact band with the source's own address and phone, and a button to their other shop. */
  home.splice(home.length - 1, 0, { id: "contact-1", type: "contact", name: "Contact", settings: { heading: "Questions?", text: `Write to ${SOURCE_EMAIL} or call ${SOURCE_PHONE}.`, button_url: "https://materiabuilder.store/collections/all" }, blocks: [] } as SectionInstance)
  /* The site's own code: a cart drawer of its own, as a creator writes one. */
  const cartFile = CHROME_SOURCES.find((c) => c.file === "ai_chrome_cart_side.storelib")!.source
  home.splice(1, 0, { id: "own-cart", type: "custom_cart", name: "Cart", group: "header", settings: {}, blocks: [] } as SectionInstance)
  return {
    installId: "5f0e1d2c-3b4a-4958-8776-655443322110",
    name: "Materia Themes",
    pages: [
      { key: "home", sections: home },
      { key: "product", sections: fill(preset.pages.product) },
      { key: "about", sections: [{ id: "about-1", type: "about_founder", name: "Founder", settings: { heading: "Built for training days", text: "Prime1 blends clean energy and focus for athletes." }, blocks: [] } as SectionInstance] },
    ],
    files: { "sections/custom_cart.storelib": cartFile, "snippets/notes.txt": "x" },
    settings: {
      ...preset.settings,
      logo_url: "https://cdn.materia.example/logo.png",
      brand_name: "loud",
      tagline: "Fuel your focus",
      announcement_bar_enabled: true,
      announcement_text: "Free shipping on orders over $99",
      free_shipping_threshold: 99,
      social_links: ["https://instagram.com/prime1"],
      color_schemes: { "scheme-1": { name: "Light", background: "#f6f6f4", text: "#141414", text_muted: "#5a5a5a", primary_button_background: "#111111", primary_button_text: "#ffffff", border: "#e2e2e2" } },
      default_color_scheme: "scheme-1",
      font_heading: "Archivo",
      font_body: "Inter",
      menus: { "main-menu": { title: "Main", links: [{ title: "Shop", url: "/products" }, { title: "About", url: "/pages/about" }, { title: "Instagram", url: "https://instagram.com/prime1" }] } },
      custom_css: ".x{background:url(https://cdn.materia.example/bg.png);color:red}",
    },
  }
}

function coachSite(): SnapshotInput {
  return {
    installId: "9a8b7c6d-5e4f-4321-8fed-cba987654321",
    name: "Radu Coaching",
    pages: [{
      key: "home",
      sections: [
        { id: "h", type: "header", name: "Header", group: "header", settings: {}, blocks: [] },
        { id: "hero", type: "hero_split", name: "Hero", settings: { heading: "Strength coaching that fits your week", image: PHOTO }, blocks: [] },
        { id: "how", type: "sticky_story", name: "How it works", settings: { heading: "How coaching works" }, blocks: [] },
        { id: "price", type: "pricing_table", name: "Plans", settings: { heading: "Coaching plans" }, blocks: [] },
        { id: "faq", type: "faq_accordion", name: "Questions", settings: { heading: "Questions" }, blocks: [] },
        { id: "f", type: "footer", name: "Footer", group: "footer", settings: {}, blocks: [] },
      ] as SectionInstance[],
    }],
    files: {},
    settings: { color_schemes: { a: { name: "Dark", background: "#101010", text: "#f2f2f2" } }, font_heading: "Oswald" },
  }
}

const reader = (entries: { template: SiteTemplate; profile: ReturnType<typeof snapshotSite>["profile"] }[]): BankReader & { loads: string[] } => {
  const loads: string[] = []
  return {
    loads,
    async list() { return entries.map((e) => listingOf(e.template.id, e.template.name, e.profile)) },
    async load(id) { loads.push(id); const e = entries.find((x) => x.template.id === id); return e ? JSON.parse(JSON.stringify(e)) : null },
  }
}

async function main() {
  const source = materiaSite()
  const { template, profile } = snapshotSite(source)
  const all = JSON.stringify(template)

  section("1. Snapshot: nothing of the source account's business")
  check("no picture of the source stays (pages, blocks, settings, css)", !all.includes("cdn.materia.example"), (all.match(/cdn\.materia\.example[^"]*/g) ?? []).slice(0, 3))
  check("no product or collection id of the source stays", !all.includes(PRODUCT_A) && !all.includes(PRODUCT_B) && !all.includes(COLLECTION))
  check("no email address or phone number of the source stays", !all.includes(SOURCE_EMAIL) && !all.includes("721 555 123"))
  check("no outside link stays (the other shop, the socials)", !all.includes("materiabuilder.store") && !all.includes("instagram.com"))
  const look = template.themeSettings ?? {}
  check("its look is kept: colour schemes, fonts", !!(look.color_schemes as Record<string, unknown>)?.["scheme-1"] && look.font_heading === "Archivo")
  check("its brand is not: logo, name, tagline, announcement, socials, free shipping, menus", ["logo_url", "brand_name", "tagline", "announcement_bar_enabled", "announcement_text", "social_links", "free_shipping_threshold", "menus"].every((k) => !(k in look)), Object.keys(look).filter((k) => /logo|brand|tagline|announce|social|free_ship|menus/.test(k)))
  check("custom CSS kept without the source's picture", typeof look.custom_css === "string" && !String(look.custom_css).includes("url(") && String(look.custom_css).includes("color:red"))
  const own = Object.keys(template.files)
  check("its own code renamed into the bank's prefix, and writable by the agent", own.length === 1 && own[0].startsWith(`sections/ai_${template.prefix}_`) && WRITABLE_PATH.test(own[0]), own)
  check("  the placed instance follows the new name", template.pages[0].sections.some((s) => `sections/${s.type}.storelib` === own[0]))
  check("  files that are not sections are not carried", !own.some((p) => p.startsWith("snippets/")))
  check("every picture taken out is a slot pointing at a real setting", template.imageSlots.length > 0 && template.imageSlots.every((s) => s.targets.every((t) => template.pages.find((p) => p.key === t.page)?.sections.some((x) => x.id === t.section))), template.imageSlots.length)
  check("every record taken out is a binding for the new creator's own", template.bindings.some((b) => b.kind === "products") && template.bindings.some((b) => b.kind === "collection"), template.bindings.slice(0, 3))
  check("the source's menu is never copied (its titles are its business)", Object.keys(template.menus).length === 0)
  check("the source's words stay as drafts (the finish gate refuses them unchanged)", all.includes("Fuel your focus. Own your day."))
  check("withoutContact takes addresses and phone numbers, keeps prices and years", withoutContact(`Mail ${SOURCE_EMAIL}, call ${SOURCE_PHONE}. From €24, since 2019.`) === "Mail , call . From €24, since 2019.", withoutContact(`Mail ${SOURCE_EMAIL}, call ${SOURCE_PHONE}. From €24, since 2019.`))
  check("lookSettings never takes a key it does not know", Object.keys(lookSettings({ secret_key: "x", stripe_account: "y", color_schemes: {} })).join() === "color_schemes")
  check("tokens read from the site's own scheme", template.tokens.colors.background === "#f6f6f4" && template.tokens.colors.accent === "#111111" && template.tokens.fonts.heading === "Archivo")
  check("snapshotting twice is the same snapshot", JSON.stringify(snapshotSite(materiaSite()).template) === all)

  section("2. Profile")
  check("a starting site", profile.kind === "starting")
  check("it needs a shop", profile.features.includes("shop"), profile.features)
  check("home's roles read: header, hero, products", ["header", "hero", "products"].every((r) => profile.sections.some((s) => s.page === "home" && s.role === r)), profile.sections.filter((s) => s.page === "home").map((s) => `${s.type}:${s.role}`))
  check("the header never needs a shop, whatever it holds", profile.sections.filter((s) => s.role === "header").every((s) => s.needs === null))
  check("roleOf: a product page section, a collection grid, a pricing table", roleOf("product") === "product-page" && roleOf("collections_grid") === "collections" && roleOf("pricing_table") === "pricing")
  check("industries read from its words (a hint the admin can change)", profile.industries.length > 0 && snapshotSite(coachSite()).profile.industries[0] === "fitness", { materia: profile.industries, coach: snapshotSite(coachSite()).profile.industries })
  check("the admin's view carries no snapshot", !("snapshot" in bankRowView({ id: "x", install_id: "y", template_id: template.id, name: "M", kind: "starting", enabled: true, industries: [], keywords: [], profile, snapshot_at: new Date().toISOString() })))

  section("3. Fit: what the business can use")
  const coachBrief = briefFrom("A personal strength coach in Bucharest. People book a free first call, then train with me in the gym or online.")
  const shopBrief = briefFrom("An online store for my supplements: clean energy powders, sold with a cart and checkout.")
  check("wantsOf: a coach who does not sell wants no shop, wants bookings", !wantsOf(coachBrief).has("shop") && wantsOf(coachBrief).has("booking"), [...wantsOf(coachBrief)])
  check("wantsOf: a store wants a shop", wantsOf(shopBrief).has("shop"))
  const coachFit = fitTemplate(template, profile, coachBrief)
  const coachTypes = coachFit.template.pages.flatMap((p) => p.sections.map((s) => s.type))
  check("for the coach: no product or collection section stays", !coachTypes.some((t) => /product|collection/.test(t)), coachTypes)
  check("  no product page", !coachFit.template.pages.some((p) => p.key === "product"))
  check("  no slot or binding points at what went", coachFit.template.imageSlots.every((s) => s.targets.every((t) => coachFit.template.pages.find((p) => p.key === t.page)?.sections.some((x) => x.id === t.section))) && coachFit.template.bindings.every((b) => coachFit.template.pages.find((p) => p.key === b.page)?.sections.some((x) => x.id === b.section)))
  check("  home is never emptied", coachFit.template.pages.find((p) => p.key === "home")!.sections.filter((s) => !s.group).length > 0)
  check("  the agent is told what went and why", coachFit.notes.some((n) => /products to sell/.test(n)) && coachFit.notes.some((n) => /pages/.test(n)), coachFit.notes)
  const coachMenu = JSON.stringify(coachFit.template.menus)
  check("  its menus are rebuilt from the pages it keeps: no shop, no source titles, no outside links", coachMenu.includes('"/about"') && !coachMenu.includes("/products") && !/Instagram|Sounds|http/.test(coachMenu), coachFit.template.menus)
  check("Storelib's built-in header and footer never travel: the site writes its own", !coachTypes.includes("header") && !coachTypes.includes("footer") && coachFit.notes.some((n) => /write this site's own/.test(n)), coachTypes)
  const shopFit = fitTemplate(template, profile, shopBrief)
  check("for the store: every section it can use stays (only the built-in chrome goes)", shopFit.removed.pages.length === 0 && shopFit.template.pages.length === template.pages.length && shopFit.removed.sections.every((x) => /header|footer|announcement/.test(profile.sections.find((s) => `${s.page}/${s.id}` === x)?.role ?? "")), shopFit.removed)
  check("  its menus link the shop and its pages", JSON.stringify(shopFit.template.menus).includes('"/products"') && JSON.stringify(shopFit.template.menus).includes('"/about"'))
  check("refitTemplate with the recorded removal is the same template", JSON.stringify(refitTemplate(template, coachFit.removed)) === JSON.stringify(coachFit.template))

  section("4. Choice: a site of Storelib's own sections is the plan, never poured in")
  const coach = snapshotSite(coachSite())
  const listings = [listingOf(template.id, template.name, profile), listingOf(coach.template.id, coach.template.name, coach.profile)]
  check("Materia (Storelib's own sections) is not pourable", !isPourable(profile) && !isPourable(coach.profile))
  const forShop = chooseBankEntry(listings, shopBrief)
  check("a store brief is matched with the store in the bank", forShop?.entry.id === template.id, forShop)
  const forCoach = chooseBankEntry(listings, coachBrief)
  check("a coach brief with the coaching site, never the shop-led one", forCoach?.entry.id === coach.template.id, forCoach)
  check("with only the shop-led site, a coach gets none from the bank", chooseBankEntry([listings[0]], coachBrief) === null)
  const bank = reader([{ template, profile }, { template: coach.template, profile: coach.profile }])
  const lib = bankTemplateLibrary(bank)
  const chosenShop = await lib.choose(shopBrief, null)
  const builtInShop = await defaultTemplates.choose(shopBrief, null)
  check("the library pours none of it in: the built-in templates (code) answer", (chosenShop?.id ?? null) === (builtInShop?.id ?? null) && chosenShop?.source?.kind !== "bank", chosenShop?.id)
  const plan = await lib.patterns(shopBrief, chosenShop)
  check("  its structure is the plan in the brief: Materia's pages in order, the product page's included", /THE PLAN FROM THE OWNER'S LIBRARY: Materia Themes/.test(plan) && /- product:/.test(plan) && /never Storelib's built-in sections, header or footer/.test(plan), plan.slice(0, 500))
  check("  the plan names no source words or pictures", !plan.includes("Fuel your focus") && !plan.includes("cdn.materia.example"))
  const coachPlan = await lib.patterns(coachBrief, await lib.choose(coachBrief, null))
  check("  a coach gets the coaching site's plan, with no shop in it", /Radu Coaching/.test(coachPlan) && !/product/.test(coachPlan), coachPlan.slice(0, 400))
  const broken = bankTemplateLibrary({ async list() { throw new Error("db down") }, async load() { throw new Error("db down") } })
  check("a bank that cannot be read is no bank: the built-in templates answer", (await broken.choose(shopBrief, null))?.id === (await defaultTemplates.choose(shopBrief, null))?.id)

  section("5. A site written as code is poured in, fitted, and resumed")
  const built = SITE_TEMPLATES.find((t) => t.id === "course-coach")!
  const codeSite = snapshotSite({
    installId: "77777777-6666-4555-8444-333322221111",
    name: "Course studio",
    pages: built.pages.map((p) => ({ key: p.key, title: p.title, sections: JSON.parse(JSON.stringify(p.sections)) })),
    files: built.files,
    settings: { color_schemes: { a: { name: "Ink", background: "#fbf8f2", text: "#1b1a17", primary_button_background: "#2f4f3a", primary_button_text: "#ffffff" } }, default_color_scheme: "a", font_heading: "Fraunces", font_body: "Inter" },
  })
  check("its own code: pourable", isPourable(codeSite.profile) && codeSite.profile.kind === "starting")
  const courseBrief = briefFrom("An online course teaching beginners to sketch, with lessons, a curriculum and enrolment.")
  const codeEntry = { template: codeSite.template, profile: codeSite.profile }
  const codeReader: BankReader = { async list() { return [listingOf(codeSite.template.id, codeSite.template.name, codeSite.profile, { industries: [courseBrief.business.kind] })] }, async load(id) { return id === codeSite.template.id ? JSON.parse(JSON.stringify(codeEntry)) : null } }
  const codeLib = bankTemplateLibrary(codeReader)
  const poured = await codeLib.choose(courseBrief, null)
  check("a course brief starts from it", poured?.id === codeSite.template.id && poured?.source?.kind === "bank", poured?.id)
  const store = memoryStore({ pages: { home: [] }, settings: { site_chrome: "home" } })
  const r = await codeLib.apply(store, poured!, courseBrief, { jobId: "job-1", choice: null })
  check("applied: its pages and its own code written, under the bank's prefix", r.ok && r.pages.includes("home") && r.files.length > 0 && r.files.every((f) => f.startsWith(`sections/ai_${codeSite.template.prefix}_`) && WRITABLE_PATH.test(f)), { ok: r.ok, files: r.files.slice(0, 3), problems: r.problems })
  const settings = store.project.settings
  check("  its look written as Theme settings, its schemes beside the agent's own", !!(settings.color_schemes as Record<string, unknown>)?.a && settings.font_heading === "Fraunces", Object.keys((settings.color_schemes as object) ?? {}))
  check("  its own palette, not a chosen direction's", JSON.stringify(settings).includes("#fbf8f2"))
  check("  the site still its own chrome (site_chrome kept)", settings.site_chrome === "home")
  const mark = settings[TEMPLATE_SETTING] as { id: string; bank?: { removed: unknown } }
  check("  the fit recorded on the site", mark?.id === codeSite.template.id && !!mark.bank)
  check("  the adaptation notes say it is a library site written as code", /real website from the Storelib library, written as its own code/.test(r.next ?? ""), (r.next ?? "").slice(0, 300))
  const u = untouchedTemplateParts(poured!, { files: store.project.files, pages: await store.listPages() })
  check("the finish gate sees the source's words as untouched copy", u.sections.length > 0, { sections: u.sections.length })
  const resumed = await preloadBankTemplate(codeReader, settings)
  check("a later slice reads back the same fitted template", JSON.stringify(resumed) === JSON.stringify(poured))
  check("  and the library hands it to the finish gate by id", bankTemplateLibrary(codeReader, { preloaded: [resumed!] }).byId(codeSite.template.id)?.pages.length === poured!.pages.length)
  check("  a site not started from the bank reads back nothing", (await preloadBankTemplate(codeReader, { [TEMPLATE_SETTING]: { id: "coffee-house", v: 1 } })) === null)

  section("6. An imported theme is a pattern, never poured in")
  const imported = snapshotSite({
    installId: "11111111-2222-4333-8444-555566667777",
    name: "Dawn import",
    pages: [{ key: "home", sections: [{ id: "a", type: "main-product", name: "Product", settings: {}, blocks: [] } as SectionInstance] }],
    files: {
      "layout/theme.storelib": "<template compat>{{ content_for_layout }}</template>",
      "sections/main-product.storelib": `<template compat><div class="product">{{ product.title }} write to ${SOURCE_EMAIL}</div></template>`,
      "sections/footer.storelib": "<template compat><footer></footer></template>",
    },
    settings: {},
  })
  check("recognised as imported", isImportedSnapshot({ "layout/theme.storelib": "<template compat></template>" }) && imported.profile.kind === "reference")
  check("its product page first among the examples, contact details out", imported.profile.examples[0] === "sections/main-product.storelib" && !imported.template.files["sections/main-product.storelib"].includes(SOURCE_EMAIL))
  const withRef = bankTemplateLibrary(reader([{ template, profile }, imported]))
  const refListings = await reader([imported]).list()
  check("never chosen as a starting site", chooseBankEntry(refListings, shopBrief) === null)
  const shopChosen = await withRef.choose(shopBrief, null)
  const patterns = await withRef.patterns(shopBrief, shopChosen)
  check("its product page is shown as a worked example", /WORKED EXAMPLES/.test(patterns) && patterns.includes("sections/main-product.storelib") && /never copy its words/.test(patterns), patterns.slice(0, 300))
  const noneChosen = await bankTemplateLibrary(reader([{ template, profile }])).patterns(shopBrief, null)
  check("with no bank site poured in, the closest store's composition is shown", /A composition that works/.test(noneChosen) && /product/.test(noneChosen), noneChosen.slice(0, 300))
  check("patterns stay small", patterns.length <= 9_100)

  section("7. Where the app expects it")
  const sql = readFileSync(join(root, "supabase/sql/run-now/467_ai_template_bank.sql"), "utf8")
  check("SQL part 467: one statement a line, safe again, pgrst last", sql.trim().split("\n").every((l) => l.startsWith("/*") || l.endsWith(";")) && /CREATE TABLE IF NOT EXISTS public\.ai_template_bank/.test(sql) && sql.trim().endsWith("notify pgrst, 'reload schema';"))
  check("  server only: row level security on, nothing for anon or authenticated", /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.ai_template_bank FROM public, anon, authenticated/.test(sql))
  check("  a bank row goes with its website", /references public\.store_theme_installs\(id\) on delete cascade/.test(sql))
  check("  every template id the snapshot makes fits the column's check", /^bank-bk[0-9a-z]{1,8}$/.test(template.id) && /^bank-bk[0-9a-z]{1,8}$/.test(coach.template.id))
  check("  registered (catalog, parts, after check)", readFileSync(join(root, "lib/admin/sql-parts.generated.ts"), "utf8").includes("467_ai_template_bank.sql") && readFileSync(join(root, "supabase/sql/run-now/99_check_after.sql"), "utf8").includes("p467_ai_template_bank"))
  const route = readFileSync(join(root, "app/api/admin/ai-bank/route.ts"), "utf8") + readFileSync(join(root, "app/api/admin/ai-bank/[id]/route.ts"), "utf8")
  check("the admin routes are behind the admin cookie, every method", (route.match(/export async function (GET|POST|PATCH|DELETE)/g) ?? []).length === 4 && (route.match(/const denied = await requireAdmin\(\)/g) ?? []).length === 4)
  check("the console links to it", readFileSync(join(root, "app/(storelib)/admin/_console/shell.tsx"), "utf8").includes('"/admin/ai-bank"'))
  const server = readFileSync(join(root, "lib/ai-builder/agent/server.ts"), "utf8")
  check("an AI job reads the bank, and a resumed one its fitted template", /templates: bankTemplateLibrary\(bank/.test(server) && /preloadBankTemplate\(bank/.test(server))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
