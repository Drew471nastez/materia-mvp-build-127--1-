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

import { describeLink, moveNavBlock, navBlockHref, navBlocksToItems, type NavBlock } from "@/lib/website-builder/nav-links"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

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

console.log("\nThe editor asks for two things\n")
const editor = read("components/website-builder/editor/controls/link-list-editor.tsx")
const menus = read("components/website-builder/editor/controls/menus-editor.tsx")
const page = read("app/website-builder/editor/[installId]/page.tsx")
check("an opened link shows Label and Link", />Label</.test(editor) && />Link</.test(editor))
check("no Handle, Links to or Submenu links in the sidebar", !/>\s*(Handle|Links to|Submenu links)\s*</.test(editor) && !/Submenu links|Add Link to \{label\}/.test(page))
check("the header uses the same list", /<HeaderNavLinksEditor/.test(page) && !/function SortableNavLink/.test(page))
check("a menu's handle is not printed", !/\{handle\} ·/.test(menus))
check("remove is a quiet text action, red only on hover", /Remove link/.test(editor) && !/text-red-400|bg-red-500/.test(editor))
check("sub-links are added from the opened row", /Add sub-link/.test(editor))
check("the grip owns its finger", /touchAction: "none"/.test(read("components/website-builder/editor/controls/use-reorder.ts")) && /setPointerCapture/.test(read("components/website-builder/editor/controls/use-reorder.ts")))
check("no em dash in what the sidebar prints", !/>[^<]*—[^<]*</.test(editor))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
