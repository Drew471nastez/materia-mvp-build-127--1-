/**
 * ===========================================================================
 *  BUILD WEBSITE FOR A CREATOR, FROM STORELIB DEFAULT (round 63)
 * ===========================================================================
 * The admin console's Build website (app/api/admin/creators/site,
 * lib/admin/creator-site). The owner asked for a creator's real website on
 * the current Storelib Default with all their content as they built it, and
 * nothing they did not say. Held here:
 *
 *   admin only         both handlers answer 401 without the admin cookie,
 *                      before any database client exists
 *   never overwrites   the build inserts one new install and writes only
 *                      that install's rows; the live one is untouched
 *   library limit      a full library is refused before anything is made
 *   their content      every read is filtered by this creator's id; another
 *                      creator's rows are never used
 *   nothing invented   the template's sample shop (studio copy, sample
 *                      address, testimonials, popups, sample social links)
 *                      is gone, and the old theme's sample hero line on
 *                      their live site is left out; no bio means no About
 *   unpublished        the new website is a draft and nothing is published
 *
 * The build runs for real: the template composed from theme-packages/,
 * tailored, converted by the converter Add uses and stored by the import's
 * own writes, against an in-memory database (tests/_fake-db.ts).
 *
 * Run with:  npm run test:push
 */
import JSZip from "jszip"

import { fakeDb } from "./_fake-db"
import { readSource, stripComments } from "./_source"
import { composeTemplateFiles } from "../lib/themes/template-packages"
import { creatorSiteContent, safeAddress, sampleTextSet, type CreatorRows } from "../lib/admin/creator-site/content"
import { templateSampleText } from "../lib/admin/creator-site/samples"
import { tailorTemplate, homePage } from "../lib/admin/creator-site/tailor"
import { buildCreatorSite, BUILT_SITE_NAME } from "../lib/admin/creator-site/build"
import { THEME_INSTALL_LIMIT } from "../lib/website-builder/theme-registry"
import { GET, POST } from "../app/api/admin/creators/site/route"
import { POST as PUBLISH } from "../app/api/admin/creators/site/publish/route"
import { ADMIN_BUILT_KEY, publishBuiltSite, undoBuiltSite, type PublishDeps } from "../lib/admin/creator-site/publish"
import { builtSites } from "../lib/admin/creator-site/build"

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

const LIAM = "0eda0834-0749-49d7-aa80-7186a5565ef8"
const LIAM_USER = "a69ef3a8-675a-4324-a4c6-2a2b403fa95f"
const OTHER = "11111111-2222-4333-8444-555555555555"
const LIVE = "99999999-0000-4000-8000-000000000001"
const HERO = "https://storelib.com/media/store-builder-images/a69ef3a8-675a-4324-a4c6-2a2b403fa95f/sections/1793965046471.png"
const LOGO = "https://storelib.com/media/store-builder-images/a69ef3a8-675a-4324-a4c6-2a2b403fa95f/logos/1793965862497.png"
const SAMPLE_SUB = "Templates, presets and guides from a studio that ships."

/** Liam's rows as his public pages show them (scratchpad r63/j2/liam-content.json), and another creator's beside them. */
function world(installs = 1) {
  const extra = Array.from({ length: Math.max(0, installs - 1) }, (_, i) => ({ id: `99999999-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`, creator_id: LIAM, status: "draft", sort_order: i + 1, name: `Draft ${i}` }))
  return fakeDb({
    creators: [
      { id: LIAM, user_id: LIAM_USER, slug: "liam-bailey", username: "liam-bailey", display_name: "liam bailey" },
      { id: OTHER, user_id: "other-user", slug: "someone", username: "someone", display_name: "Someone Else" },
    ],
    profiles: [{ id: LIAM_USER, display_name: "liam bailey", username: "liam-bailey", avatar_url: null }],
    store_builder_configs: [
      { creator_id: LIAM, page_type: "shop", published_config: { headerSettings: { bio: "", contactEmail: "private@example.org", socialLinks: { instagram: { enabled: true, url: "" }, tiktok: { enabled: false, url: "https://tiktok.com/@hidden" } } } } },
      { creator_id: OTHER, page_type: "shop", published_config: { headerSettings: { bio: "I bake bread.", socialLinks: { instagram: { enabled: true, url: "https://instagram.com/someone" } } } } },
    ],
    store_theme_installs: [
      { id: LIVE, creator_id: LIAM, status: "published", sort_order: 0, name: "Storelib Default", theme_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" },
      { id: "88888888-0000-4000-8000-000000000001", creator_id: OTHER, status: "published", sort_order: 0, name: "Bakery" },
      ...extra,
    ],
    store_theme_pages: [
      {
        install_id: LIVE,
        page_key: "home",
        sections: [
          { id: "header", type: "header", settings: { logo_text: "Northwind", logo_url: LOGO, cta_text: "Shop now" }, blocks: [] },
          { id: "hero", type: "hero", settings: { heading: "TRANSFORM YOUR BODY TODAY", subheading: SAMPLE_SUB, bg_type: "image", bg_image: HERO, button_text: "Shop now", button2_text: "Learn more" }, blocks: [] },
          { id: "testimonials", type: "testimonials", settings: { heading: "What customers say", subheading: "Real words from real buyers." }, blocks: [] },
        ],
      },
      { install_id: LIVE, page_key: "products", sections: [{ id: "grid", type: "product_list", settings: { heading: "Gym Programmes" }, blocks: [] }] },
      { install_id: "88888888-0000-4000-8000-000000000001", page_key: "home", sections: [{ id: "hero", type: "hero", settings: { heading: "Fresh bread daily", bg_image: "https://storelib.com/media/bread.png" } }] },
    ],
    store_theme_settings: [{ install_id: LIVE, settings: { brand_name: "Northwind" } }],
    products: [
      { id: "p1", creator_id: LIAM, status: "published", title: "The Skinny To Strong Programme", slug: "the-skinny-to-strong-programme" },
      { id: "p2", creator_id: LIAM, status: "published", title: "Gym Beginner Program", slug: "gym-beginner-program" },
      { id: "p3", creator_id: LIAM, status: "draft", title: "Unfinished", slug: "unfinished" },
      { id: "p4", creator_id: OTHER, status: "published", title: "Sourdough loaf", slug: "sourdough" },
    ],
    themes: [{ id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }],
    store_menus: [{ creator_id: LIAM, menus: { "main-menu": { title: "Main menu", links: [{ title: "Home", url: "/" }, { title: "Programmes", url: "/products" }, { title: "About", url: "/about" }] } } }],
  })
}

/** The fake client with the storage calls storeImportedTheme makes. `rpc` answers as a database without SQL part 130 (the publish's step by step path) unless told otherwise. */
function client(db: ReturnType<typeof fakeDb>, rpc: "missing" | "ok" = "missing") {
  const uploads: string[] = []
  const rpcs: { name: string; args: Record<string, unknown> }[] = []
  return {
    db,
    uploads,
    rpcs,
    admin: {
      ...db,
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcs.push({ name, args })
        return rpc === "missing" ? { data: null, error: { code: "PGRST202", message: "Could not find the function" } } : { data: { files: [] }, error: null }
      },
      storage: {
        from: () => ({
          upload: async (path: string) => (uploads.push(path), { data: { path }, error: null }),
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storelib.com/media/store-builder-images/${path}` } }),
        }),
      },
    } as never,
  }
}

const files = async () => ({ files: composeTemplateFiles("materia/default"), version: null })

const SAMPLE_WORDS = ["Sundry", "hello@example.com", "small studio", "Customer name", "10% off", "Monday to Friday", SAMPLE_SUB, "Northwind", "Acme", "https://instagram.com\"", "https://pinterest.com", "Good everyday things", "Made in small batches", "What people say"]

async function main() {
  console.log("\nadmin only")
  {
    const g = await GET(new Request(`https://storelib.com/api/admin/creators/site?id=${LIAM}`) as never)
    check("GET without the admin cookie is 401", g.status === 401)
    const p = await POST(new Request("https://storelib.com/api/admin/creators/site", { method: "POST", body: JSON.stringify({ creatorId: LIAM }) }) as never)
    check("POST without the admin cookie is 401", p.status === 401)
    const src = stripComments(readSource("app/api/admin/creators/site/route.ts"))
    for (const h of ["GET", "POST"]) {
      const body = src.slice(src.indexOf(`export async function ${h}`))
      const gate = body.indexOf("await requireAdmin()")
      const db = body.indexOf("createAdminClient()")
      check(`${h} asks requireAdmin before any database client`, gate > 0 && (db === -1 || gate < db))
    }
  }

  console.log("\ntheir content, nothing invented (pure)")
  {
    const rows: CreatorRows = {
      creator: { id: LIAM, display_name: "liam bailey", username: "liam-bailey" },
      shopConfig: { headerSettings: { bio: "", socialLinks: { instagram: { enabled: true, url: "javascript:alert(1)" }, youtube: { enabled: false, url: "https://youtube.com/@x" }, tiktok: { enabled: true, url: "https://www.tiktok.com/@liam" } } } },
      live: { pages: [{ page_key: "home", sections: [{ type: "hero", settings: { heading: "TRANSFORM YOUR BODY TODAY", subheading: `<p>${SAMPLE_SUB}</p>`, bg_image: HERO } }] }] },
      menus: { "main-menu": { links: [{ title: "Programmes", url: "/products" }] } },
      products: [{ id: "p1", title: "The Skinny To Strong Programme", slug: "x" }],
    }
    const c = creatorSiteContent(rows, templateSampleText())
    check("his hero picture is the one his live site draws", c.hero.image === HERO, String(c.hero.image))
    check("his hero words are kept exactly", c.hero.heading === "TRANSFORM YOUR BODY TODAY", c.hero.heading)
    check("the old theme's sample line under the hero is left out", c.hero.subheading === "" && c.leftOut.some((l) => l.includes(SAMPLE_SUB)), JSON.stringify(c.leftOut))
    check("the products heading is the label he gave the shop in his menu", c.productsHeading === "Programmes", c.productsHeading)
    check("a javascript: link and a switched off link are not used; a real one is", !c.socials.instagram && !c.socials.youtube && c.socials.tiktok === "https://www.tiktok.com/@liam", JSON.stringify(c.socials))
    check("an address that is not https is no address", safeAddress("http://x.com/a.png") === null && safeAddress("data:image/png;base64,AA") === null && safeAddress("/media/a.png") === "/media/a.png")
    check("sample text is compared without case and markup", sampleTextSet(["<p>Shop NOW.</p>"]).has("shop now"))

    const home = homePage(c) as { order: string[]; sections: Record<string, { type: string; settings: Record<string, unknown>; blocks: Record<string, { settings: Record<string, unknown> }> }> }
    check("home is his hero then his products, and no About without a bio", home.order.join(",") === "hero,products", home.order.join(","))
    check("the hero draws his picture", home.sections.hero.settings.image === HERO)
    check("no hero line is made up for him", !Object.values(home.sections.hero.blocks).some((b) => "text" in b.settings && String(b.settings.text).includes("<p>")))
    const withBio = homePage({ ...c, bio: "I coach beginners.", avatar: "https://storelib.com/media/a.png" }) as { order: string[]; sections: Record<string, { blocks: Record<string, { settings: Record<string, unknown> }> }> }
    check("a bio he wrote becomes his About, in his words, escaped", withBio.order.includes("about") && JSON.stringify(withBio.sections.about.blocks).includes("<p>I coach beginners.</p>"))
    const xss = homePage({ ...c, bio: "<script>x</script>" }) as { sections: Record<string, unknown> }
    check("a bio is text, never markup", !JSON.stringify(xss).includes("<script>"))

    const tailored = tailorTemplate(composeTemplateFiles("materia/default"), c)
    const json = [...tailored].filter(([p]) => /^(templates|sections)\/.*\.json$/.test(p)).map(([, b]) => b.toString("utf8")).join("\n")
    const settingsCurrent = JSON.stringify((JSON.parse(tailored.get("config/settings_data.json")!.toString("utf8")) as { current: unknown }).current)
    for (const w of SAMPLE_WORDS) check(`no "${w}" in the tailored pages`, !json.includes(w) && !settingsCurrent.includes(w))
    check("the template's FAQ and shipping pages are gone, and About without a bio", !tailored.has("templates/page.faqs.json") && !tailored.has("templates/page.shipping.json") && !tailored.has("templates/page.about.json"))
    check("the template's own sample pictures are not carried", ![...tailored.keys()].some((k) => /^assets\/default-/.test(k)))
    const overlay = JSON.parse(tailored.get("sections/overlay-group.json")!.toString("utf8")) as { sections: Record<string, { disabled?: boolean }> }
    check("no popup is carried (one offered a 10% code), and what is left stays off", Object.keys(overlay.sections).length > 0 && Object.values(overlay.sections).every((s) => s.disabled === true) && !JSON.stringify(overlay).includes("popup"))
    const product = JSON.parse(tailored.get("templates/product.json")!.toString("utf8")) as { order: string[]; sections: Record<string, { type: string; block_order?: string[]; blocks?: Record<string, { type: string }> }> }
    check("the product page has no sample testimonials or promises", !product.order.some((k) => /testimonial|text-columns/.test(product.sections[k].type)))
    const main = Object.values(product.sections).find((s) => s.type === "main-product")!
    check("the product keeps its own description, price and buttons", ["title", "price", "buy_buttons", "collapsible_row"].every((t) => main.block_order!.some((id) => main.blocks![id].type === t)) && !main.block_order!.some((id) => /infotables|vertical_benefits/.test(main.blocks![id].type)))
    check("Liam's own words reach the home page file", tailored.get("templates/index.json")!.toString("utf8").includes("TRANSFORM YOUR BODY TODAY"))
  }

  console.log("\nthe build, end to end against the in-memory database")
  {
    const { db, admin, uploads } = client(world())
    const before = JSON.stringify(db.tables.store_theme_installs.find((r) => r.id === LIVE))
    const beforePages = JSON.stringify(db.tables.store_theme_pages.filter((r) => r.install_id === LIVE))
    const built = await buildCreatorSite(admin, LIAM, { files })
    check("the build succeeds", built.ok === true, JSON.stringify(built).slice(0, 300))
    if (built.ok) {
      const mine = db.tables.store_theme_installs.filter((r) => r.creator_id === LIAM)
      const made = mine.find((r) => r.id === built.installId)
      check("one new install for him", mine.length === 2 && !!made)
      check("it is a draft, not published", made?.status === "draft" && !made?.published_at, JSON.stringify(made))
      check("it is named for what it is", made?.name === BUILT_SITE_NAME)
      check("his live install is exactly as it was", JSON.stringify(db.tables.store_theme_installs.find((r) => r.id === LIVE)) === before)
      check("his live pages are exactly as they were", JSON.stringify(db.tables.store_theme_pages.filter((r) => r.install_id === LIVE)) === beforePages)
      const writes = db.log.filter((l) => l.op !== "select" && /^store_theme_/.test(l.table))
      const foreign = writes.filter((l) => {
        if (l.op === "insert") {
          const rows = (Array.isArray(l.payload) ? l.payload : [l.payload]) as Record<string, unknown>[]
          return rows.some((r) => (l.table === "store_theme_installs" ? r.creator_id !== LIAM : r.install_id !== built.installId))
        }
        return !l.filters.some(([, col, v]) => (col === "install_id" || col === "id") && v === built.installId)
      })
      check("every write is the new install's own", foreign.length === 0, JSON.stringify(foreign).slice(0, 400))
      check("no update or delete touches his live install", !db.log.some((l) => (l.op === "update" || l.op === "delete") && l.filters.some(([, , v]) => v === LIVE)))
      check("nothing was published (no status other than draft, no published_at written)", !writes.some((l) => (Array.isArray(l.payload) ? l.payload : [l.payload ?? {}]).some((r: Record<string, unknown>) => ("status" in r && r.status !== "draft") || "published_at" in r)))

      const reads = db.log.filter((l) => l.op === "select" && ["creators", "products", "store_builder_configs", "store_theme_installs", "store_menus"].includes(l.table))
      check("every read of his rows is filtered by his id", reads.every((l) => l.filters.some(([, col, v]) => (col === "creator_id" || col === "id") && v === LIAM)), JSON.stringify(reads.filter((l) => !l.filters.some(([, , v]) => v === LIAM))).slice(0, 300))
      const pages = db.tables.store_theme_pages.filter((r) => r.install_id === built.installId)
      const stored = JSON.stringify(pages) + JSON.stringify(db.tables.store_theme_settings.find((r) => r.install_id === built.installId))
      check("his hero picture and words are stored", stored.includes(HERO) && stored.includes("TRANSFORM YOUR BODY TODAY"))
      check("his shop heading from his live site is stored", stored.includes("Gym Programmes"))
      check("another creator's content is not", !stored.includes("Fresh bread daily") && !stored.includes("bread.png") && !stored.includes("I bake bread") && !stored.includes("instagram.com/someone"))
      check("his private contact address is not", !stored.includes("private@example.org"))
      check("a switched off link is not shown", !stored.includes("tiktok.com/@hidden"))
      for (const w of SAMPLE_WORDS) check(`stored pages do not say "${w}"`, !JSON.stringify(pages).includes(w))
      check("the new website remembers it came from Storelib Default", stored.includes("storelib-default"))
      check("only his own account's folder holds its pictures", uploads.every((p) => p.startsWith(`${LIAM_USER}/`)))
      check("the products grid is there for his two published products", built.content.products.map((p) => p.title).join("|") === "The Skinny To Strong Programme|Gym Beginner Program")
    }
  }

  console.log("\nthe library limit")
  {
    const { db, admin } = client(world(THEME_INSTALL_LIMIT))
    let composed = false
    const full = await buildCreatorSite(admin, LIAM, { files: async () => ((composed = true), files()) })
    check("a full library is refused with library_full", full.ok === false && (full as { code?: string }).code === "library_full" && (full as { status: number }).status === 409)
    check("nothing is composed or written", !composed && !db.log.some((l) => l.op !== "select"))
    const { db: db6, admin: admin6 } = client(world(THEME_INSTALL_LIMIT - 1))
    const room = await buildCreatorSite(admin6, LIAM, { files })
    check("one slot left is enough", room.ok === true && db6.tables.store_theme_installs.filter((r) => r.creator_id === LIAM).length === THEME_INSTALL_LIMIT)
  }

  console.log("\nother refusals")
  {
    const { admin } = client(world())
    const missing = await buildCreatorSite(admin, "00000000-0000-4000-8000-00000000abcd", { files })
    check("an unknown creator is 404 and nothing is made", missing.ok === false && (missing as { status: number }).status === 404)
    const broken = fakeDb({ creators: [{ id: LIAM, user_id: LIAM_USER }] }, { failWith: { products: { message: "down" } } })
    const half = await buildCreatorSite({ ...broken, storage: {} } as never, LIAM, { files })
    check("a read that fails builds nothing (never a site from half his rows)", half.ok === false && (half as { status: number }).status === 503 && !broken.log.some((l) => l.op !== "select"))
  }

  console.log("\nthe zip the import takes is the tailored one")
  {
    const { admin } = client(world())
    let seen: Buffer | null = null
    await buildCreatorSite(admin, LIAM, {
      files,
      install: async (_a, _w, template, opts) => {
        seen = await opts.deps!.compose!(`materia/${template}`)
        return { ok: true, installId: "x", name: opts.name, template }
      },
    })
    const zip = seen ? await JSZip.loadAsync(seen) : null
    const index = zip ? await zip.file("templates/index.json")!.async("string") : ""
    check("the import is handed his home page, not the template's", index.includes("TRANSFORM YOUR BODY TODAY") && !index.includes("Good everyday things"))
  }

  console.log("\nadmin Publish and Undo")
  {
    const p = await PUBLISH(new Request("https://storelib.com/api/admin/creators/site/publish", { method: "POST", body: JSON.stringify({ creatorId: LIAM, installId: LIVE, action: "publish" }) }) as never)
    check("Publish without the admin cookie is 401", p.status === 401)
    const src = stripComments(readSource("app/api/admin/creators/site/publish/route.ts"))
    check("Publish asks requireAdmin before any database client", src.indexOf("await requireAdmin()") > 0 && src.indexOf("await requireAdmin()") < src.indexOf("createAdminClient()"))

    const { db, admin, rpcs } = client(world())
    const revalidated: string[] = []
    const later: string[] = []
    const deps: PublishDeps = { revalidate: async (id) => void revalidated.push(id), later: (work) => void later.push(String(work).slice(0, 60)), menus: async () => null as never }
    const built = await buildCreatorSite(admin, LIAM, { files })
    if (!built.ok) throw new Error("build failed")
    const marked = db.tables.store_theme_settings.find((r) => r.install_id === built.installId)
    check("the build marks its website as made here", !!marked?.settings?.[ADMIN_BUILT_KEY] && marked.settings[ADMIN_BUILT_KEY].by === "admin")
    check("the panel lists it as a draft to publish", (await builtSites(admin, LIAM)).some((b) => b.id === built.installId && b.status === "draft"))

    const notBuilt = await publishBuiltSite(admin, LIAM, LIVE, deps)
    check("a website the builder did not make is refused (403 not_admin_built)", notBuilt.ok === false && (notBuilt as { code?: string }).code === "not_admin_built")
    const otherCreators = await publishBuiltSite(admin, OTHER, built.installId, deps)
    check("another creator's id cannot publish it (404)", otherCreators.ok === false && (otherCreators as { status: number }).status === 404)
    check("refusals change nothing and invalidate nothing", revalidated.length === 0 && db.tables.store_theme_installs.find((r) => r.id === LIVE)?.status === "published")

    const live = await publishBuiltSite(admin, LIAM, built.installId, deps)
    check("publish succeeds", live.ok === true, JSON.stringify(live))
    const installs = db.tables.store_theme_installs
    check("the built website is live, with published_at", installs.find((r) => r.id === built.installId)?.status === "published" && !!installs.find((r) => r.id === built.installId)?.published_at)
    check("the old one stays in his library, unpublished", installs.find((r) => r.id === LIVE)?.status === "unpublished")
    check("one live website at a time", installs.filter((r) => r.creator_id === LIAM && r.status === "published").length === 1)
    check("the other creator's live website is untouched", installs.find((r) => r.id === "88888888-0000-4000-8000-000000000001")?.status === "published")
    check("the publish function is asked first, as the creator's publish does", rpcs.some((r) => r.name === "publish_theme_install" && r.args.p_install === built.installId && r.args.p_creator === LIAM))
    check("the published site's cache is invalidated for him, as the normal publish does", revalidated.join() === LIAM)
    check("the after work is the normal publish's: history and backup, warm, release, search engines", later.length === 4, JSON.stringify(later))
    const remembered = db.tables.store_theme_settings.find((r) => r.install_id === built.installId)?.settings?.[ADMIN_BUILT_KEY]
    check("the website it replaced is remembered for Undo", remembered?.previous_install === LIVE)
    check("publishing it again is refused", (await publishBuiltSite(admin, LIAM, built.installId, deps)).ok === false)

    /* Something he left unpublished on the old site stays unpublished when it comes back. */
    const oldPage = db.tables.store_theme_pages.find((r) => r.install_id === LIVE && r.page_key === "home")!
    oldPage.draft_sections = [{ id: "x", type: "hero", settings: { heading: "Unfinished draft" } }]
    const undone = await undoBuiltSite(admin, LIAM, built.installId, deps)
    check("Undo succeeds", undone.ok === true && (undone as { restored?: string }).restored === LIVE, JSON.stringify(undone))
    check("Undo puts the old website back live", installs.find((r) => r.id === LIVE)?.status === "published")
    check("and keeps the built one in the library, unpublished", installs.find((r) => r.id === built.installId)?.status === "unpublished")
    check("Undo invalidates the cache again", revalidated.length === 2)
    check("Undo does not push his unpublished drafts live", JSON.stringify(oldPage.sections).includes("TRANSFORM YOUR BODY TODAY") && !!oldPage.draft_sections)
    check("Undo twice is refused (the built one is not live)", (await undoBuiltSite(admin, LIAM, built.installId, deps)).ok === false)
  }

  console.log("\nthe creator's own publish route is not changed")
  {
    const src = readSource("app/api/website-builder/themes/[installId]/publish/route.ts")
    check("it does not import the admin publish", !src.includes("creator-site"))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
