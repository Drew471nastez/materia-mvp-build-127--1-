/**
 * The Main menu is the header's menu, the way Shopify's header reads the
 * store's Main menu. A site saved before this keeps its links in the
 * header's nav_link blocks; they are shown as the Main menu until it is
 * first edited, and that edit writes them out and points the header at it.
 * Nothing is ever deleted on the way (lib/website-builder/main-menu.ts).
 *
 *   npx tsx tests/menus-main-menu.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { MAIN_MENU, adoptHeaderLinks, headerMenuHandle, mainMenuView, menuChoices } from "@/lib/website-builder/main-menu"
import { headerMenuBlocks } from "@/lib/website-builder/header-settings"
import { siteMenus } from "@/lib/website-builder/storefront-data"
import { cleanMenus } from "@/lib/storelib-theme/values"
import { mapEmbedSrc } from "@/lib/website-builder/map-embed"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const header: SectionInstance = {
  id: "h",
  type: "header",
  name: "Header",
  settings: { menu: "" },
  blocks: [
    { id: "a", type: "nav_link", settings: { label: "Home", url: "/" } },
    { id: "b", type: "nav_link", settings: { label: "Shop", url: "/products" } },
    { id: "b1", type: "nav_link", settings: { label: "Ebooks", url: "/products?type=ebook", parent_id: "b" } },
    { id: "c", type: "nav_link", settings: { label: "Tote", link_type: "product", target_id: "tote" } },
    { id: "s", type: "social", settings: { url: "https://instagram.com/x" } },
  ],
}
const snapshot = JSON.stringify(header)
const footerMenu = { title: "Footer", links: [{ title: "Terms", url: "/terms" }] }

console.log("\nBefore the first edit, the Main menu is the header's links\n")
{
  const view = mainMenuView({ footer: footerMenu }, header)
  check("shown from the header", view.fromHeader === true)
  check("in order, sub-links under their parent", view.menu.links.map((l) => l.title).join() === "Home,Shop,Tote" && view.menu.links[1].links?.[0]?.title === "Ebooks", view.menu)
  check("an old product link keeps the address the header draws", view.menu.links[2].url === "/products/tote")
  check("named Main menu", view.menu.title === "Main menu")
  check("nothing about it changes the header", JSON.stringify(header) === snapshot)
  check("the header is listed as showing the Main menu", headerMenuHandle({}, header) === MAIN_MENU)
  check("Main menu is first among the choices, with its links counted", menuChoices({ footer: footerMenu }, header)[0].handle === MAIN_MENU && menuChoices({ footer: footerMenu }, header)[0].count === 3)
}

console.log("\nThe first edit moves the links over, and loses nothing\n")
{
  const before = { footer: footerMenu }
  const adopted = adoptHeaderLinks(before, header)
  check("a Main menu is written out from the header's links", !!adopted && adopted.menus[MAIN_MENU].links.map((l) => l.title).join() === "Home,Shop,Tote", adopted)
  check("with the sub-link under its parent", adopted!.menus[MAIN_MENU].links[1].links?.[0]?.url === "/products?type=ebook")
  check("and the header pointed at it", adopted!.headerMenu === MAIN_MENU)
  check("the other menus come through untouched", JSON.stringify(adopted!.menus.footer) === JSON.stringify(footerMenu))
  check("the menus passed in are not changed in place", JSON.stringify(before) === JSON.stringify({ footer: footerMenu }))
  check("the header's blocks are not touched, not one of them", JSON.stringify(header) === snapshot)
  check("the header draws the same links from the menu as from its blocks", (() => {
    const fromMenu = headerMenuBlocks(MAIN_MENU, cleanMenus(adopted!.menus))
    return !!fromMenu && fromMenu.filter((b) => !b.settings.parent_id).map((b) => b.settings.label).join() === "Home,Shop,Tote" && fromMenu.some((b) => b.settings.label === "Ebooks" && b.settings.parent_id)
  })())
  check("sections asking for the main menu see the same list before and after", (() => {
    const beforeLinks = siteMenus({ menus: before } as never, [header])[MAIN_MENU]?.links.map((l) => l.title).join()
    const afterLinks = siteMenus({ menus: adopted!.menus } as never, [{ ...header, settings: { menu: MAIN_MENU } }])[MAIN_MENU]?.links.map((l) => l.title).join()
    return beforeLinks === afterLinks && afterLinks === "Home,Shop,Tote"
  })())
}

console.log("\nA Main menu that already has links is never replaced\n")
{
  const mine = { [MAIN_MENU]: { title: "Main menu", links: [{ title: "Mine", url: "/mine" }] } }
  const adopted = adoptHeaderLinks(mine, header)
  check("its links stay", adopted!.menus[MAIN_MENU].links.map((l) => l.title).join() === "Mine")
  check("and the editor shows those, not the header's", mainMenuView(mine, header).menu.links[0].title === "Mine" && mainMenuView(mine, header).fromHeader === false)
}

console.log("\nOnce the header reads a menu, there is nothing to move\n")
{
  const linked = { ...header, settings: { menu: MAIN_MENU } }
  check("no second migration", adoptHeaderLinks({ [MAIN_MENU]: { title: "Main menu", links: [] } }, linked) === null)
  check("an empty Main menu is shown empty, not refilled from old blocks", mainMenuView({ [MAIN_MENU]: { title: "Main menu", links: [] } }, linked).menu.links.length === 0)
  check("and the header draws no links rather than the old ones", JSON.stringify(headerMenuBlocks(MAIN_MENU, { [MAIN_MENU]: { title: "Main menu", links: [] } })) === "[]")
  check("any other empty menu still leaves the header's own links, as before", headerMenuBlocks("footer", { footer: { title: "Footer", links: [] } }) === null)
  check("a header pointed at another menu shows that one", headerMenuHandle({ footer: footerMenu }, { ...header, settings: { menu: "footer" } }) === "footer")
  check("no header, nothing to do", adoptHeaderLinks({}, null) === null)
}

console.log("\nA header with no links of its own\n")
{
  const bare = { ...header, blocks: [] }
  check("an empty Main menu, named", mainMenuView({}, bare).menu.title === "Main menu" && mainMenuView({}, bare).menu.links.length === 0)
  check("the first edit still points the header at it", adoptHeaderLinks({}, bare)?.headerMenu === MAIN_MENU)
}

console.log("\nThe editors\n")
{
  const menus = read("components/website-builder/editor/controls/menus-editor.tsx")
  const list = read("components/website-builder/editor/controls/link-list-editor.tsx")
  const nav = read("components/website-builder/website-settings/navigation.tsx")
  const page = read("app/website-builder/editor/[installId]/page.tsx")
  check("Main menu is always first on the list", /const rows = \[MAIN_MENU, \.\.\.others\]/.test(menus))
  check("the old paragraph is gone", !/A section that shows a menu picks one of these/.test(menus))
  check("a menu opens onto its links, with a way back", /data-menu-back/.test(menus))
  check("the first write of the Main menu points the header at it", /if \(handle === MAIN_MENU && header && !headerReadsMenu\(header\)\) linkHeader\?\.\(\)/.test(menus))
  check("a row shows where the link goes, small", /data-link-dest/.test(list) && /describeLink\(item\.url, ctx\.targets\)/.test(list))
  check("Add sub-link and Delete live in the row's menu", /label: "Add sub-link"/.test(list) && /variant: "destructive"/.test(list) && /<ResponsiveActionMenu/.test(list))
  check("no text buttons left in an open row", !/Remove link/.test(list) && !/data-link-add-under/.test(list))
  check("no box round the links themselves: rows and hairlines only", !/rounded-lg border border-border/.test(list))
  check("one box round the menus in the editor's panel, none inside a settings card", /const BOX = plain \? "" : "rounded-lg border border-border/.test(menus) && /<MenusEditor\s+plain/.test(nav))
  check("the header's sidebar is a menu picker with Edit, not label and URL fields", /<MenuPickerControl[\s\S]{0,200}noneLabel=\{null\}/.test(page) && !/<HeaderNavLinksEditor/.test(page))
  check("Website Settings edits the menus and says where each one shows", /<MenusEditor/.test(nav) && /title="Where menus show"/.test(nav) && !/HeaderNavLinksEditor/.test(nav))
}

console.log("\nA map from an address, not an embed code\n")
{
  check("the address lines are the map", mapEmbedSrc("", ["1 Main St", "", "Springfield", "US"]) === "https://www.google.com/maps?q=1%20Main%20St%2C%20Springfield%2C%20US&output=embed")
  check("an embed address is used as it is", mapEmbedSrc("https://www.google.com/maps/embed?pb=abc", []) === "https://www.google.com/maps/embed?pb=abc")
  check("an ordinary Google Maps place link becomes a map", mapEmbedSrc("https://www.google.com/maps/place/Eiffel+Tower/@48.8,2.29,17z", []) === "https://www.google.com/maps?q=Eiffel%20Tower&output=embed")
  check("a place name typed in works too", mapEmbedSrc("Eiffel Tower", []) === "https://www.google.com/maps?q=Eiffel%20Tower&output=embed")
  check("a javascript: address never reaches the frame", !/javascript/i.test(mapEmbedSrc("javascript:alert(1)", ["Paris"])))
  check("nothing at all is no map", mapEmbedSrc("", []) === "")
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
