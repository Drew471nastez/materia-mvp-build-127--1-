/**
 * ===========================================================================
 *  SAVES, GROUPS AND DEFAULTS
 * ===========================================================================
 *   npx tsx tests/editor-groups-saves.test.ts
 *
 * What the builder stores is what its routes accept (an imported theme's
 * page included), what a failed save says, the Overlay group from the
 * schema to the page, an older theme's static header coming in as an
 * editable section, and the two collections a store starts with.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"
import { z } from "zod"
import { SectionSaveSchema } from "../lib/website-builder/section-save-schema"
import { saveProblem } from "../lib/website-builder/save-problem"
import { GROUP_ORDER, GROUP_LABELS, orderByGroup, placeSection, sectionGroupsFor, splitGroups } from "../lib/storelib-theme/section-groups"
import { sectionGroupsOf } from "../lib/storelib-theme/schema/normalise"
import { applyUniversalChrome } from "../lib/website-builder/universal-chrome"
import { packageFilesFromPages, pagesFromPackageFiles, OVERLAY_GROUP_PATH } from "../lib/website-builder/theme-pages"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { drawPage, drawSection, pageContextFor, themeOfInstall } from "../lib/storelib-theme/compat/page"
import { exportShopifyTheme } from "../lib/storelib-theme/compat/export"
import { compatPageForHref } from "../lib/storelib-theme/compat/install"
import { answer } from "../lib/storelib-theme/compat/site"
import { DEFAULT_COLLECTIONS } from "../lib/physical/default-collections"
import { inSmartCollection, readRules } from "../lib/physical/collections"
import type { SectionInstance } from "../lib/website-builder/types"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const root = join(__dirname, "..")
const read = (p: string) => readFileSync(join(root, p), "utf8")

;(async () => {
  console.log("\nWhat a save route accepts\n")
  const page = z.array(SectionSaveSchema)
  check("a section with no name is accepted, read as the empty name (a Shopify group names none)", page.safeParse([{ id: "a", type: "header", settings: {} }]).success && page.parse([{ id: "a", type: "header", settings: {} }])[0].name === "")
  check("a section with no settings is accepted, read as none", page.parse([{ id: "a", type: "x" }])[0].settings !== undefined)
  check("the Overlay group and a theme's group file are kept", JSON.stringify(page.parse([{ id: "p", type: "popup", group: "overlay", slot: "overlay-group", settings: {} }])[0]).includes('"slot":"overlay-group"'))
  check("a group that is not one is refused", !page.safeParse([{ id: "p", type: "x", group: "sidebar", settings: {} }]).success)
  check("a group file name that is not a name is refused", !page.safeParse([{ id: "p", type: "x", group: "overlay", slot: "../x", settings: {} }]).success)
  for (const route of ["app/api/website-builder/themes/[installId]/sections/route.ts", "app/api/website-builder/themes/[installId]/sections/sync-global/route.ts"]) {
    const src = read(route)
    check(`${route.split("/").slice(-2).join("/")} reads sections by the one schema`, src.includes("SectionSaveSchema") && !/name: z\.string\(\)\.max\(256\),/.test(src))
  }
  check("the header and footer sync copies the Overlay group to every page", read("app/api/website-builder/themes/[installId]/sections/sync-global/route.ts").includes("overlay_group"))

  console.log("\nWhat a failed save says\n")
  check("Invalid body is never shown as it is", !/invalid body/i.test(JSON.stringify(saveProblem(400, "Invalid body"))))
  check("a signed out save says so and offers Sign in", saveProblem(401, "Unauthorized").fix === "sign-in")
  check("Theme not found says what happened and offers the themes", saveProblem(404, "Theme not found").fix === "themes" && /not in your account/.test(saveProblem(404, "Theme not found").title))
  check("a limit keeps the route's own words", saveProblem(413, "A page holds 25 sections. This one has 26.").detail.includes("25 sections"))
  check("a dropped connection and a rate limit are tried again by themselves", saveProblem(0, null).retries && saveProblem(429, null).retries)
  check("the words are plain: no em dash", !JSON.stringify([0, 400, 401, 403, 404, 413, 429, 500].map((s) => saveProblem(s, null))).includes("—"))
  check("the editor shows the banner and no longer toasts the route's words", read("app/website-builder/editor/[installId]/page.tsx").includes("<SaveProblemBanner") && !read("app/website-builder/editor/[installId]/page.tsx").includes('"Failed to save sections"'))

  console.log("\nThe Overlay group\n")
  check("it is a group, after the footer, called Overlay", GROUP_ORDER[GROUP_ORDER.length - 1] === "overlay" && GROUP_LABELS.overlay === "Overlay")
  check("a popup, a mobile bottom bar and back to top go in it", ["Newsletter popup", "Mobile bottom bar", "Back to top"].every((name) => sectionGroupsFor({ name } as never, { type: "x", kind: null })[0] === "overlay"))
  check("an ordinary section does not", sectionGroupsFor({ name: "Image with text" } as never, { type: "image_with_text", kind: null }).every((g) => g !== "overlay"))
  check("Shopify's aside and custom groups read as the overlay", sectionGroupsOf({ enabled_on: { groups: ["custom.overlay"] } }).includes("overlay") && sectionGroupsOf({ enabled_on: { groups: ["aside"] } }).includes("overlay"))
  check("disabled_on header and footer does not drop a section into it", !sectionGroupsOf({ disabled_on: { groups: ["header", "footer"] } }).includes("overlay"))
  const s = (id: string, extra: Partial<SectionInstance> = {}): SectionInstance => ({ id, type: id, name: id, settings: {}, ...extra })
  const list = [s("header"), s("hero"), s("popup", { group: "overlay" }), s("footer")]
  check("it is drawn after the footer", orderByGroup(list).map((x) => x.id).join() === "header,hero,footer,popup")
  const placed = placeSection(list, s("bar"), { groups: ["overlay", "template"], group: "overlay" })
  check("a section added to it lands in it", placed.group === "overlay" && splitGroups(placed.sections).overlay.map((x) => x.id).join() === "popup,bar")
  const pages = applyUniversalChrome({ home: orderByGroup(list), about: [s("text")] })
  check("every page wears the home page's Overlay group", splitGroups(pages.about).overlay.map((x) => x.id).join() === "popup")
  const files = packageFilesFromPages([{ page_key: "home", sections: orderByGroup(list) } as never])
  check("a theme package keeps it in its own group file", typeof files[OVERLAY_GROUP_PATH] === "string" && pagesFromPackageFiles(files).some((p) => p.page_key === "home" && splitGroups(p.sections).overlay.length === 1))
  check("the page draws it", read("components/website-builder/theme/ThemePage.tsx").includes('render(section, "overlay", false)'))
  check("the sidebar lists it", read("components/website-builder/editor/sections-list.tsx").includes('data-section-group="overlay"'))

  console.log("\nAn imported theme's header, its other groups and its words\n")
  const zip = new JSZip()
  zip.file("layout/theme.liquid", `<html><head></head><body>{% section 'header' %}<main>{{ content_for_layout }}</main>{% section 'footer' %}{% sections 'overlay-group' %}</body></html>`)
  zip.file("config/settings_schema.json", JSON.stringify([{ name: "theme_info", theme_name: "Old Shop", theme_version: "1.0.0" }]))
  zip.file("config/settings_data.json", JSON.stringify({ current: { sections: { header: { type: "header", settings: { tagline: "Hand made" } } } } }))
  zip.file("locales/en.default.json", "{}")
  zip.file("locales/en.default.schema.json", JSON.stringify({ popup: { default_text: "Join the list" } }))
  zip.file("sections/header.liquid", `<header class="old-header">{{ section.settings.tagline }}</header>{% schema %}{ "name": "Header", "settings": [{ "type": "text", "id": "tagline", "label": "Tagline", "default": "Shop" }] }{% endschema %}`)
  zip.file("sections/footer.liquid", `<footer>Old footer</footer>{% schema %}{ "name": "Footer", "settings": [] }{% endschema %}`)
  zip.file("sections/popup.liquid", `<div class="popup">{{ section.settings.text }}</div>{% schema %}{ "name": "Popup", "settings": [{ "type": "text", "id": "text", "label": "Text", "default": "t:popup.default_text" }], "presets": [{ "name": "Popup" }] }{% endschema %}`)
  zip.file("sections/overlay-group.json", JSON.stringify({ type: "custom.overlay", name: "Overlay", sections: { pop: { type: "popup", settings: {} } }, order: ["pop"] }))
  zip.file("sections/text.liquid", `<p>Body</p>{% schema %}{ "name": "Text", "settings": [], "presets": [{ "name": "Text" }] }{% endschema %}`)
  zip.file("templates/index.json", JSON.stringify({ sections: { t: { type: "text" } }, order: ["t"] }))
  const r = await convertShopifyTheme(zip)
  if (r.ok === false) { check("an older theme converts", false, r.error); return }
  const home = r.theme.pages.find((p) => p.page_key === "home")!
  const header = home.sections.find((x) => x.id === "header")
  check("a static {% section 'header' %} comes in as the Header group's section, by its name", header?.group === "header" && header.type === "theme-header" && header.settings.tagline === "Hand made")
  check("a static section after the content comes in as the Footer group's", home.sections.find((x) => x.id === "footer")?.group === "footer")
  const pop = home.sections.find((x) => x.id === "pop")
  check("another section group comes into the Overlay group, remembering its file", pop?.group === "overlay" && pop.slot === "overlay-group" && (r.theme.settings.compat as { slots?: string[] }).slots?.includes("overlay-group") === true)
  check("every imported section has a name, so a save of the page is accepted", home.sections.every((x) => typeof x.name === "string" && x.name.length > 0) && page.safeParse(home.sections).success)
  const theme = themeOfInstall(r.theme.files, r.theme.settings, { assetUrl: (n) => `/a/${n}` })
  const draw = (sections: typeof home.sections) => drawPage(theme, { template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" } }, sections as never, { scripts: false }).html
  const edited = home.sections.map((x) => (x.id === "header" ? { ...x, settings: { ...x.settings, tagline: "Edited here" } } : x))
  check("the layout's {% section 'header' %} draws the page's copy, so an edit shows", draw(edited).includes("Edited here") && !draw(edited).includes("Hand made"))
  check("a hidden static header is not drawn", !draw(home.sections.map((x) => (x.id === "header" ? { ...x, hidden: true } : x))).includes("old-header"))
  check("the overlay group draws the page's sections", draw(home.sections).includes('class="popup"'))
  check("deleting the overlay section takes it off the page, rather than the group file's copy coming back", !draw(home.sections.filter((x) => x.id !== "pop")).includes('class="popup"'))
  check("a schema's t: default is drawn in words", draw(home.sections).includes("Join the list") && !draw(home.sections).includes("t:popup"))
  const asHeaderGroup = drawSection(theme, pageContextFor(theme, { template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" } } as never, home.sections as never), { id: "h2", type: "text", settings: {} }, 0, "header").html
  check("a group's sections wear Shopify's group class (shopify-section-group-header-group)", draw(home.sections).includes("shopify-section-group-overlay-group") && asHeaderGroup.includes("shopify-section-group-header-group"))
  const out = exportShopifyTheme(r.theme.files as never, r.theme.settings as never, Object.fromEntries(r.theme.pages.map((p) => [p.page_key, edited])) as never)
  const exported = out.files as Record<string, string>
  check("exported again, the static header goes back to settings_data.json and the overlay to its group file", JSON.parse(exported["config/settings_data.json"]).current.sections.header.settings.tagline === "Edited here" && !!exported["sections/overlay-group.json"])

  console.log("\nLinks in an imported theme\n")
  const keys = ["home", "product", "collection", "collections", "cart", "search", "contact", "page"]
  const go = (h: string) => JSON.stringify(compatPageForHref(h, keys))
  check("Shopify's addresses open their pages in the builder", go("/") === '{"key":"home"}' && go("/products/linen-shirt") === '{"key":"product","product":"linen-shirt"}' && go("/collections/all") === '{"key":"collection"}' && go("/collections") === '{"key":"collections"}' && go("/cart") === '{"key":"cart"}' && go("/search?q=a") === '{"key":"search"}')
  check("a page of the theme's own by its handle, and Storelib's /products as the shop", go("/pages/contact") === '{"key":"contact"}' && go("/pages/about") === '{"key":"page"}' && go("/products") === '{"key":"collection"}')
  check("a link off the site, an anchor or a page the install has none of opens nothing", ["https://x.com", "//x.com", "#top", "mailto:a@b.c", "/blogs/news"].every((h) => compatPageForHref(h, keys) === null))
  const site = { creatorId: "c", theme, pages: { home: home.sections as never }, products: [], collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" }, host: "x", designMode: false, product: async () => null } as never
  const shop = await answer(site, { method: "GET", path: "/products", query: new URLSearchParams("sort_by=price-ascending"), body: null, cart: [] })
  check("the live site sends /products to every product, as Shopify does", shop.status === 303 && shop.headers?.Location === "/collections/all?sort_by=price-ascending")

  console.log("\nThe two collections a store starts with\n")
  check("Home page at frontpage, hand-picked, and All products at all, smart", DEFAULT_COLLECTIONS.map((c) => `${c.title}:${c.slug}:${c.kind}`).join() === "Home page:frontpage:manual,All products:all:smart")
  const all = DEFAULT_COLLECTIONS[1]
  const product = (priceCents: number) => ({ id: "p", title: "Thing", type: "", tags: [], vendor: null, priceCents, compareAtCents: null, inventory: null, weightGrams: null })
  check("All products holds every product, a free one included", readRules(all.rules).length === 1 && [0, 1, 999999].every((c) => inSmartCollection(readRules(all.rules), all.match, product(c))))
  const sql = read("supabase/sql/run-now/108_default_collections.sql")
  check("the SQL part makes the same two", DEFAULT_COLLECTIONS.every((c) => sql.includes(`'${c.title}', '${c.slug}', '${c.kind}'`)) && sql.includes(JSON.stringify(all.rules).replace(/,/g, ",")))
  check("  on every new store, and never on an existing one", sql.includes("AFTER INSERT ON public.creators") && !/UPDATE public\.creators|FROM public\.creators/i.test(sql))
  check("  and the migration copy is the same bytes", read("supabase/migrations/20261128_default_collections.sql") === sql)
  check("onboarding makes them when it finishes", read("app/api/onboarding/finalize/route.ts").includes("ensureDefaultCollections(admin, finalCreator.id)"))

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
})()
