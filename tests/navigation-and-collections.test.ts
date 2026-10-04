/**
 * Navigation is the store's own place, and collections are every shop's.
 *
 *   /app/website-builder/navigation   the store's menus, outside any theme
 *   Website Settings › Navigation     lists them; their links open in the builder's Navigation
 *   the header                        shows the Main menu once it has links
 *   /collections/<handle>             one collection's products, any kind
 *   Product grid › A collection       a section shows a collection
 *
 *   npx tsx tests/navigation-and-collections.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { headerMenuBlocks, headerMenuHandleOf } from "@/lib/website-builder/header-settings"
import { storeLinkTargets } from "@/lib/website-builder/link-targets"
import { linkMenu } from "@/lib/website-builder/link-menu"
import { collectionSections } from "@/lib/website-builder/shop-page"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nNavigation, a place of its own\n")
{
  const page = "app/app/website-builder/navigation/page.tsx"
  const client = "app/app/website-builder/navigation/navigation-client.tsx"
  check("/app/website-builder/navigation exists", existsSync(page) && existsSync(client))
  const c = read(client)
  check("  it edits the store's menus with the builder's own editor", /<MenusEditor plain value=\{menus\} onChange=\{setMenus\}/.test(c))
  check("  and saves them to the store as they change", /fetch\("\/api\/website-builder\/menus", \{\s*method: "PUT"/.test(c) && /SAVE_AFTER_MS/.test(c))
  check("  says where each menu shows, changed in the builder", /Where menus show/.test(c) && /\?settings=navigation/.test(c))
  check("the Website page has a way in", /href="\/app\/website-builder\/navigation"/.test(read("app/app/website-builder/website-builder-client.tsx")))
  const nav = read("components/website-builder/website-settings/navigation.tsx")
  check("Website Settings › Navigation lists menus, never edits their links inline", !/<MenusEditor/.test(nav) && /data-nav-menu-row/.test(nav))
  check("General settings has no Menus group", /THEME_SETTINGS_GROUPS\.filter\(group => group\.id !== "colors" && group\.id !== "menus"\)/.test(read("app/website-builder/editor/[installId]/page.tsx")))
}

console.log("\nThe header and the Main menu\n")
{
  const menus = { "main-menu": { title: "Main menu", links: [{ title: "Courses", url: "/collections/courses" }] }, footer: { title: "Footer", links: [] } }
  check("a header never pointed anywhere shows the Main menu once it has links", headerMenuHandleOf("", menus) === "main-menu")
  check("  and its own links while the Main menu is empty", headerMenuHandleOf("", { "main-menu": { title: "Main menu", links: [] } }) === "")
  check("  a header pointed at a menu keeps it", headerMenuHandleOf("footer", menus) === "footer")
  check("  drawn as nav links", headerMenuBlocks(headerMenuHandleOf("", menus), menus)?.[0]?.settings.label === "Courses")
  check("the header section reads it so", /headerMenuBlocks\(headerMenuHandleOf\(str\(s\.menu\), siteMenus\), siteMenus\)/.test(read("components/website-builder/sections/renderers/HeaderSection.tsx")))
}

console.log("\nWhere a link can go\n")
{
  const targets = storeLinkTargets({
    customPages: [{ key: "size-guide", name: "Size guide" }],
    products: [{ slug: "ebook", title: "Ebook" }],
    collections: [{ handle: "courses", title: "Courses" }],
  })
  check("pages, collections and products, one list for the builder and Navigation", targets.some((t) => t.href === "/size-guide") && targets.some((t) => t.href === "/collections/courses" && t.kind === "collection") && targets.some((t) => t.href === "/products/ebook"))
  check("  collections are a kind of their own in the picker", linkMenu(targets).some((e) => e.category.key === "collections" && e.targets.length === 2))
  check("  no collections, no Collections row", !linkMenu(storeLinkTargets({})).some((e) => e.category.key === "collections"))
}

console.log("\nCollections, every shop's\n")
{
  const home: SectionInstance[] = [
    { id: "h", type: "header", name: "Header", settings: {}, blocks: [] },
    { id: "f", type: "footer", name: "Footer", settings: {}, blocks: [] },
  ]
  const page = collectionSections(home, {}, { title: "Courses", description: "Everything I teach" })
  const grid = page.find((s) => s.type === "product_grid")
  check("a collection's page is the shop page under its own name and words", grid?.settings.heading === "Courses" && grid?.settings.subheading === "Everything I teach" && grid?.settings.source === "shop")
  check("  between the site's header and footer", page[0].type === "header" && page[page.length - 1].type === "footer")
  const route = "app/(site)/w/[username]/collections/[handle]/page.tsx"
  check("/collections/<handle> exists and lists only that collection, in its order", existsSync(route) && /productsInCollection\(/.test(read(route)) && /order\.has\(p\.id\)/.test(read(route)))
  check("  not behind physical commerce", !/isPhysicalCommerceEnabled/.test(read(route)) && !/isPhysicalCommerceEnabled/.test(read("app/(site)/w/[username]/collections/page.tsx")))
  const grid2 = read("themes/default/sections/product_grid.storelib")
  check("Product grid shows a collection", /"value": "collection"/.test(grid2) && /"type": "collection_picker",\s*"id": "collection"/.test(grid2) && /\{% elsif settings\.source == 'collection' %\}/.test(grid2))
  check("  its button goes to the whole collection", /\{% if settings\.source == 'collection' and settings\.collection\.title %\}\s*<div class="s__btns more"><a class="s__btn s__btn--secondary" href="\{\{ settings\.collection \| url \}\}">/.test(grid2))
  check("  the generated sources carry it", /A collection/.test(read("themes/default/sources.generated.ts")))
  const editor = read("app/app/collections/collections-client.tsx")
  check("the collection editor speaks every kind: a product type to pick, a kind under each product", /const PRODUCT_KINDS = \[/.test(editor) && /KIND_LABEL\[p\.type\]/.test(editor))
  check("  stock and weight rules only where there is stock", /PHYSICAL_RULES/.test(editor) && /usePhysicalCommerceEnabled\(\)/.test(editor))
  check("Products has a way to Collections", /href="\/app\/collections" data-products-collections/.test(read("app/app/products/products-client.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
