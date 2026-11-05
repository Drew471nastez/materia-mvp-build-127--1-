/**
 * The sidebar's link list: how a row says where it goes, how the header's
 * flat nav_link blocks become rows with sub-links under their parent, and
 * how a drag lands back in the flat list the header saves. Plus the markup
 * rules the owner asked for: two fields, no handle, no red bin.
 *
 *   npx tsx tests/nav-links.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { NAV_MAX_DEPTH, describeLink, moveNavBlock, navBlockHref, navBlocksToItems, navTreeOrder, nestMenuLink, nestNavBlock, nestTargetOf, unnestNavBlock, type NavBlock } from "@/lib/website-builder/nav-links"
import { untt } from "./i18n-source"


let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
}
const root = process.cwd()
const read = (p: string) => untt(readFileSync(join(root, p), "utf8"), p)

console.log("\nWhere a row says it goes\n")
const targets = [
  { href: "/products", label: "Shop", kind: "page" as const },
  { href: "/about", label: "About", kind: "page" as const },
]
check("a page of the site by its name", describeLink("/products", targets) === "Shop")
check("the home page", describeLink("/", targets) === "Home")
check("another website by its domain", describeLink("https://www.instagram.com/me", targets) === "instagram.com")
check("an email by its address", describeLink("mailto:hi@example.com?subject=x") === "hi@example.com")
check("nothing yet", describeLink("#") === "No link yet" && describeLink("") === "No link yet")
check("any other path as itself", describeLink("/faq", targets) === "/faq")

console.log("\nThe header's blocks as rows\n")
const blocks: NavBlock[] = [
  { id: "a", type: "nav_link", settings: { label: "Home", url: "/" } },
  { id: "b", type: "nav_link", settings: { label: "Shop", url: "/products" } },
  { id: "b1", type: "nav_link", settings: { label: "Ebooks", url: "/products?type=ebook", parent_id: "b" } },
  { id: "c", type: "nav_link", settings: { label: "Tote", link_type: "product", target_id: "tote", url: "/x" } },
  { id: "b2", type: "nav_link", settings: { label: "Courses", url: "/products?type=course", parent_id: "b" } },
  { id: "z", type: "social", settings: {} },
]
const items = navBlocksToItems(blocks)
check("roots in order, sub-links under their parent", items.map((i) => i.id).join() === "a,b,c" && items[1].children!.map((c) => c.id).join() === "b1,b2", items)
check("an old product link shows the address the header draws", navBlockHref(blocks[3].settings) === "/products/tote" && items[2].url === "/products/tote")

console.log("\nA drag, saved as the header saves it\n")
const down = moveNavBlock(blocks, null, 0, 2)
check("a top-level link moves past its siblings", navBlocksToItems(down).map((i) => i.id).join() === "b,c,a", down.map((b) => b.id))
check("its sub-links stay with their parent", navBlocksToItems(down)[0].children!.map((c) => c.id).join() === "b1,b2")
check("nothing else moves", down.length === blocks.length && down[5].id === "z")
const up = moveNavBlock(blocks, "b", 1, 0)
check("sub-links reorder within their parent", navBlocksToItems(up)[1].children!.map((c) => c.id).join() === "b2,b1")
check("a move to the same place changes nothing", moveNavBlock(blocks, null, 1, 1) === blocks)
check("a move out of range changes nothing", moveNavBlock(blocks, null, 0, 9) === blocks)
const ids = (list: NavBlock[]) => list.map((b) => b.id).join()
check("after a move the saved list reads as the tree: each link, then its sub-links", ids(down) === "b,b1,b2,c,a,z", ids(down))
check("and the block that is not a link keeps its slot", down[5].id === "z")
check("tree order of a list already in it is the same list", navTreeOrder(down) === down)

console.log("\nIn a level and out of one, as the header draws it\n")
check("two levels: a dropdown under a link, and no deeper", NAV_MAX_DEPTH === 2)
const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
check("  which is what the header draws: one childrenByParent level, no grandchildren",
  /childrenByParent\[block\.id\]/.test(header) && !/childrenByParent\[child\.id\]/.test(header))
const inC = nestNavBlock(blocks, "c")
check("a link goes under the one above it, last among its sub-links", inC.find((b) => b.id === "c")!.settings.parent_id === "b" && navBlocksToItems(inC)[1].children!.map((k) => k.id).join() === "b1,b2,c")
check("  and the list stays in tree order", ids(inC) === "a,b,b1,b2,c,z", ids(inC))
check("  in one write: the same blocks, nothing added or lost", inC.length === blocks.length)
check("the first link has nothing above it to go under", nestNavBlock(blocks, "a") === blocks && nestTargetOf(blocks, "a") === null)
check("a link with sub-links does not go under another: that would be a third level", nestNavBlock(blocks, "b") === blocks && nestTargetOf(blocks, "b") === null)
check("a sub-link does not nest again", nestNavBlock(blocks, "b1") === blocks)
const outB1 = unnestNavBlock(blocks, "b1")
check("a sub-link comes out to sit right after its parent's sub-links", ids(outB1) === "a,b,b2,b1,c,z", ids(outB1))
check("  with parent_id taken off, not blanked", !("parent_id" in outB1.find((b) => b.id === "b1")!.settings))
check("a top-level link has nothing to come out of", unnestNavBlock(blocks, "a") === blocks)
check("in and back out is where it started", ids(unnestNavBlock(inC, "c")) === "a,b,b1,b2,c,z" && !unnestNavBlock(inC, "c").find((b) => b.id === "c")!.settings.parent_id)

console.log("\nA menu's links, in a level and out\n")
const menu = [{ title: "Shop", url: "/products", links: [{ title: "Ebooks", url: "/e" }] }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }]
const nestedMenu = nestMenuLink(menu, "1", 1)
check("About goes under Shop, last", nestedMenu.length === 2 && nestedMenu[0].links!.map((l) => l.title).join() === "Ebooks,About")
const outMenu = nestMenuLink(menu, "0/0", -1)
check("Ebooks comes out to sit right after Shop", outMenu.map((l) => l.title).join() === "Shop,Ebooks,About,Contact" && outMenu[0].links!.length === 0)
check("Shop, the first, has nothing above it", nestMenuLink(menu, "0", 1) === menu)
check("the original menu is not changed in place", menu.length === 3 && menu[0].links!.length === 1)

console.log("\nThe editor asks for two things\n")
const editor = read("components/website-builder/editor/controls/link-list-editor.tsx")
const menus = read("components/website-builder/editor/controls/menus-editor.tsx")
const page = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
check("an opened link shows Label and Link", />Label</.test(editor) && />Link</.test(editor))
check("no Handle, Links to or Submenu links in the sidebar", !/>\s*(Handle|Links to|Submenu links)\s*</.test(editor) && !/Submenu links|Add Link to \{label\}/.test(page))
/* The header reads the Main menu now (tests/menus-main-menu.test.ts), and its sidebar picks a menu rather than drawing a second list. */
check("the header picks a menu, and edits it in the same list as every menu", /<MenuPickerControl/.test(page) && !/<HeaderNavLinksEditor/.test(page) && !/function SortableNavLink/.test(page) && /<LinkListEditor/.test(menus))
check("a menu's handle is not printed", !/\{handle\} ·/.test(menus))
check("delete is in the row's menu, red as a destructive row, never a red bin", /variant: "destructive"/.test(editor) && !/text-red-400|bg-red-500/.test(editor))
check("sub-links are added from their parent's row", /label: "Add sub-link", onClick: \(\) => ctx\.add\(item\.id\)/.test(editor))
check("rows are compact: 36px, 44px under a thumb, 13px type", /const BAR = "flex h-9 max-sm:h-11 items-center"/.test(editor) && /text-\[13px\] max-sm:text-\[15px\]/.test(editor))
check("where a link goes is shown once, small, on its row", /data-link-dest/.test(editor) && !/data-link-where/.test(editor))
check("a menu is one row: its name, its first links under it, a chevron", /data-menu-row=\{handle\}/.test(menus) && /links\.map\(\(l\) => l\.title\)\.filter\(Boolean\)\.join\(", "\)/.test(menus) && /min-h-\[52px\]/.test(menus))
check("the grip owns its finger", /touchAction: "none"/.test(read("components/website-builder/editor/controls/use-reorder.ts")) && /setPointerCapture/.test(read("components/website-builder/editor/controls/use-reorder.ts")))
check("no em dash in what the sidebar prints", !/>[^<]*—[^<]*</.test(editor))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
