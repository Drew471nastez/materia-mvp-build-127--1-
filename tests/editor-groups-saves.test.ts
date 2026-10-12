/**
 * ===========================================================================
 *  SAVES, GROUPS AND DEFAULTS
 * ===========================================================================
 *   npx tsx tests/editor-groups-saves.test.ts
 *
 * The Overlay group from the schema to the page and the save routes, an
 * older theme's static header coming in as an editable section, and where
 * a link in an imported theme goes.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"
import { GROUP_ORDER, GROUP_LABELS, orderByGroup, placeSection, sectionGroupsFor, splitGroups } from "../lib/storelib-theme/section-groups"
import { sectionGroupsOf } from "../lib/storelib-theme/schema/normalise"
import { applyUniversalChrome } from "../lib/website-builder/universal-chrome"
import { packageFilesFromPages, pagesFromPackageFiles, OVERLAY_GROUP_PATH } from "../lib/website-builder/theme-pages"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { drawPage, drawSection, pageContextFor, themeOfInstall, withoutScripts } from "../lib/storelib-theme/compat/page"
import { exportShopifyTheme } from "../lib/storelib-theme/compat/export"
import { compatPageForHref } from "../lib/storelib-theme/compat/install"
import { answer } from "../lib/storelib-theme/compat/site"
import type { SectionInstance } from "../lib/website-builder/types"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const root = join(__dirname, "..")
const read = (p: string) => untt(readFileSync(join(root, p), "utf8"), p)

;(async () => {
  console.log("\nWhat a save route accepts\n")
  for (const route of ["app/api/website-builder/themes/[installId]/sections/route.ts", "app/api/website-builder/themes/[installId]/sections/sync-global/route.ts"]) {
    const src = read(route)
    check(`${route.split("/").slice(-2).join("/")} keeps the Overlay group and a theme's group file`, src.includes('group: z.enum(["header", "footer", "overlay"])') && src.includes("slot: z.string().regex("))
  }
  check("the header and footer sync copies the Overlay group to every page", read("app/api/website-builder/themes/[installId]/sections/sync-global/route.ts").includes("overlay_group") && read("app/website-builder/editor/[installId]/page.tsx").includes("overlay_group: overlayGroup"))

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
  check("every imported section has a name, for the sidebar and the save", home.sections.every((x) => typeof x.name === "string" && x.name.length > 0))
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

  console.log("\nA page with no scripts\n")
  const quiet = withoutScripts(`<head><link rel="stylesheet" href="/a.css" media="print" onload="this.media='all'"><script>x()</script></head><body><img src="/b.png" onerror="y()"><p>on=fine</p></body>`)
  check("a stylesheet loaded late by its onload is loaded outright", quiet.includes('href="/a.css" media="all"') && !quiet.includes("onload"))
  check("scripts and inline handlers are gone, words that look like one are not", !quiet.includes("<script") && !quiet.includes("onerror") && quiet.includes("<p>on=fine</p>"))

  console.log("\nLinks in an imported theme\n")
  const keys = ["home", "product", "collection", "collections", "cart", "search", "contact", "page"]
  const go = (h: string) => JSON.stringify(compatPageForHref(h, keys))
  check("Shopify's addresses open their pages in the builder", go("/") === '{"key":"home"}' && go("/products/linen-shirt") === '{"key":"product","product":"linen-shirt"}' && go("/collections/all") === '{"key":"collection"}' && go("/collections") === '{"key":"collections"}' && go("/cart") === '{"key":"cart"}' && go("/search?q=a") === '{"key":"search"}')
  check("a page of the theme's own by its handle, and Storelib's /products as the shop", go("/pages/contact") === '{"key":"contact"}' && go("/pages/about") === '{"key":"page"}' && go("/products") === '{"key":"collection"}')
  check("a link off the site, an anchor or a page the install has none of opens nothing", ["https://x.com", "//x.com", "#top", "mailto:a@b.c", "/blogs/news"].every((h) => compatPageForHref(h, keys) === null))
  const site = { creatorId: "c", theme, pages: { home: home.sections as never }, products: [], collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" }, host: "x", designMode: false, product: async () => null } as never
  const shop = await answer(site, { method: "GET", path: "/products", query: new URLSearchParams("sort_by=price-ascending"), body: null, cart: [] })
  check("the live site sends /products to every product, as Shopify does", shop.status === 303 && shop.headers?.Location === "/collections/all?sort_by=price-ascending")

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
})()
