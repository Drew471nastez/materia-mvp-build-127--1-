/**
 * Shop data as pills in every text box, text boxes that grow instead of
 * scrolling sideways, menu links dragged anywhere in the tree, and the new
 * menu's name. The geometry and the typing are measured in a browser by
 * scripts/check-value-pills.mjs and scripts/check-menu-drag.mjs; this pins
 * the pure parts and the wiring.
 *
 *   npx tsx tests/value-pills-menus.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { withValueChips, withoutValueChips } from "../components/website-builder/rich-text-field"
import { pillHtml, pillLabel, stripZw, ZWSP } from "../components/website-builder/value-pills"
import { placeMenuLink, placeNavBlock, type NavBlock } from "../lib/website-builder/nav-links"
import type { MenuLink } from "../lib/storelib-theme/values"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

console.log("\nA value in the words is a pill, saved exactly as before\n")
{
  check("a known source is named by its own name", pillLabel("shop.brand_headline") === "Brand headline", pillLabel("shop.brand_headline"))
  check("an unknown one by its last two words", pillLabel("closest.collection.title") === "Collection title")
  const html = "<p>Welcome to {{ shop.name }}</p><p>{{shop.brand_headline}} and <a href=\"/x?{{ keep }}\">x</a></p>"
  const shown = withValueChips(html)
  check("each value in the text becomes a pill, never one inside an attribute", (shown.match(/data-value=/g) ?? []).length === 2 && shown.includes('href="/x?{{ keep }}"'))
  check("  with a place for the caret after it", shown.includes(`</span>${ZWSP}`))
  check("  and the pill is atomic and named for a screen reader", /contenteditable="false" role="button" aria-haspopup="listbox" aria-label="Shop name, shop data"/.test(shown))
  check("saved back, a spaced value is the same and nothing else changes", withoutValueChips(shown) === "<p>Welcome to {{ shop.name }}</p><p>{{ shop.brand_headline }} and <a href=\"/x?{{ keep }}\">x</a></p>", withoutValueChips(shown))
  check("the place holder spaces never reach a save", !withoutValueChips(shown + ZWSP).includes(ZWSP) && stripZw(`a${ZWSP}b`) === "ab")
  check("a pill's markup is one flat span, so the save pattern finds its end", !/<span[^>]*>[^<]*<span/.test(pillHtml("shop.name")))
  check("the pill is grey with the builder's violet ring when changed, no gradient", /background:#eceef1/.test(pillHtml("shop.name")) && /#8b5cf6/.test(read("components/website-builder/value-pills.ts")) && !/gradient/.test(read("components/website-builder/value-pills.ts")))
}

console.log("\nTyping never stops\n")
{
  const ds = read("components/website-builder/editor/controls/dynamic-source-field.tsx")
  const ir = read("components/website-builder/editor/controls/inline-richtext-control.tsx")
  const rt = read("components/website-builder/rich-text-field.tsx")
  check("a text setting that is one source keeps its box: only a picture, link or number is connected whole", /const bound = whole \? wholeSource\(value\) : null/.test(ds))
  check("an insert into a box that draws pills goes in at its caret, on the DOM", /insertPill\(box, range\.current, s\.id, !phone\)/.test(ds))
  check("a pressed pill opens its list with Remove, a pick replaces it", /data-pill-remove/.test(ds) && /replacePill\(old, s\.id\)/.test(ds) && /removePill\(pill\)/.test(ds))
  check("the heading editor skips its own echo instead of rewriting itself under the caret", /if \(sent\.current\.includes\(incoming\)\) return/.test(ir) && /withoutValueChips\(el\.innerHTML\)/.test(ir))
  check("the rich text field skips an older echo too", /if \(recent\.current\.includes\(incoming\)\) return/.test(rt))
  check("braces typed or pasted become a pill where they stand, not by rewriting the field", /pillsFromText\(el, VALUE_IN_TEXT\)/.test(rt) && !/el\.innerHTML = withValueChips\(el\.innerHTML\)/.test(rt))
  check("every pill box answers Backspace, Delete and the arrows as one piece, and copies its placeholder", [rt, ir, read("components/website-builder/editor/controls/chip-text-input.tsx")].every((s) => /pillKeyDown\(e, /.test(s) && /copyWithPills\(e, /.test(s)))
}

console.log("\nTaller, never sideways\n")
{
  const page = read("app/website-builder/editor/[installId]/page.tsx")
  check("a one line text setting is a box that wraps and grows", /function EchoTextInput[\s\S]{0,400}<AutoTextarea\s+singleLine/.test(page))
  check("  where Enter is refused and a pasted break is a space", /if \(singleLine && e\.key === "Enter"\) e\.preventDefault\(\)/.test(read("components/website-builder/auto-textarea.tsx")))
  check("the heading editor grows to a ceiling, then scrolls up and down only", /overflow-x-hidden overflow-y-auto wb-slim-scroll max-h-\[180px\]/.test(read("components/website-builder/editor/controls/inline-richtext-control.tsx")))
  check("the words-and-pills box the same", /overflow-x-hidden overflow-y-auto wb-slim-scroll max-h-\[196px\]/.test(read("components/website-builder/editor/controls/chip-text-input.tsx")))
  check("the app's rich text editor never scrolls sideways", /overflow-x-hidden \[&_img\]:max-w-full/.test(read("components/app/rich-text-editor.tsx")))
}

console.log("\nA store menu's link, dropped anywhere\n")
{
  const menu: MenuLink[] = [
    { title: "Shop", url: "/s", links: [{ title: "Ebooks", url: "/e" }, { title: "Courses", url: "/c" }] },
    { title: "About", url: "/a" },
    { title: "Contact", url: "/k" },
  ]
  const tree = (l: MenuLink[]) => l.map((x) => x.title + (x.links?.length ? `(${x.links.map((c) => c.title).join(",")})` : "")).join(",")
  check("About into Shop, between its two sub-links", tree(placeMenuLink(menu, "1", "0", 1)) === "Shop(Ebooks,About,Courses),Contact", tree(placeMenuLink(menu, "1", "0", 1)))
  check("Ebooks out to the top, last", tree(placeMenuLink(menu, "0/0", null, 3)) === "Shop(Courses),About,Contact,Ebooks")
  check("Contact under Shop: a parent after the link's old place keeps its index", tree(placeMenuLink(menu, "2", "0", 0)) === "Shop(Contact,Ebooks,Courses),About")
  const second: MenuLink[] = [{ title: "A", url: "/" }, { title: "B", url: "/", links: [] }]
  check("a link taken from above its new parent: the parent moves up one", tree(placeMenuLink(second, "0", "1", 0)) === "B(A)", tree(placeMenuLink(second, "0", "1", 0)))
  check("a link with sub-links does not go under another", placeMenuLink(menu, "0", "1", 0) === menu)
  check("nor under itself", placeMenuLink(second, "1", "1", 0) === second)
  check("a reorder within the top level", tree(placeMenuLink(menu, "2", null, 0)) === "Contact,Shop(Ebooks,Courses),About")
  check("the menu given is not changed in place", tree(menu) === "Shop(Ebooks,Courses),About,Contact")
}

console.log("\nThe header's own links, dropped anywhere\n")
{
  const b = (id: string, parent?: string): NavBlock => ({ id, type: "nav_link", settings: parent ? { label: id, parent_id: parent } : { label: id } })
  const blocks = [b("home"), b("shop"), b("ebooks", "shop"), b("courses", "shop"), b("about"), { id: "x", type: "logo", settings: {} }, b("insta")]
  const tops = (l: NavBlock[]) => l.filter((x) => x.type === "nav_link" && !x.settings.parent_id).map((x) => x.id).join(",")
  const kids = (l: NavBlock[], p: string) => l.filter((x) => x.settings.parent_id === p).map((x) => x.id).join(",")
  const a = placeNavBlock(blocks, "about", "shop", 1)
  check("About under Shop, between Ebooks and Courses", kids(a, "shop") === "ebooks,about,courses" && tops(a) === "home,shop,insta", { kids: kids(a, "shop"), tops: tops(a) })
  check("  a block that is not a link keeps its slot", a[5].id === "x")
  const o = placeNavBlock(blocks, "ebooks", null, 0)
  check("Ebooks out to the top, first, and its parent_id is taken off", tops(o) === "ebooks,home,shop,about,insta" && !("parent_id" in o.find((x) => x.id === "ebooks")!.settings))
  check("Shop, which has sub-links, never goes under Home", placeNavBlock(blocks, "shop", "home", 0) === blocks)
  check("nor under a sub-link", placeNavBlock(blocks, "home", "ebooks", 0) === blocks)
}

console.log("\nThe drag itself\n")
{
  const drag = read("components/website-builder/editor/controls/use-link-tree-drag.ts")
  const list = read("components/website-builder/editor/controls/link-list-editor.tsx")
  check("the gap between a link and its first sub-link only takes a sub-link", /const minDepth = next \? next\.depth : 0/.test(drag) && /if \(minDepth > maxDepth\) return null/.test(drag))
  check("two levels, and a link with sub-links stays at the top", /Math\.min\(prev\.depth \+ 1, 1\)/.test(drag) && /!d\.hasKids/.test(drag))
  check("a full level takes no more", /o\.maxSubLinks \?\? Infinity/.test(drag))
  check("the grip owns its finger; a held finger elsewhere on a row picks it up", /touchAction: "none"/.test(drag) && /LONG_PRESS_MS = 380/.test(drag) && /passive: false/.test(drag))
  check("Escape puts it back; the keys still move and nest", /ev\.key !== "Escape"/.test(drag) && /ArrowRight/.test(drag) && /ArrowUp/.test(drag))
  check("the line is the builder's violet", /const LINE = "#8b5cf6"/.test(drag))
  check("one drop is one save through the menu's own path", /onPlace=\{\(id, parentId, index\) => \{\s*const next = placeNavBlock/.test(list) && /placeMenuLink\(links, id, parentId, index\)/.test(read("components/website-builder/editor/controls/menus-editor.tsx")))
  check("Add sub-link stays in the row's menu", /label: "Add sub-link"/.test(list))
}

console.log("\nA new menu's name\n")
{
  const menus = read("components/website-builder/editor/controls/menus-editor.tsx")
  check("the box says New menu, not Footer", /placeholder="New menu"/.test(menus) && !/placeholder="Footer"/.test(menus))
  check("the menus people make most are one press away, the ones the store has left out", /MENU_SUGGESTIONS = \["Footer", "Shop", "Help", "Legal", "Social"\]/.test(menus) && /filter\(\(s\) => !have\.has\(s\.toLowerCase\(\)\)\)/.test(menus) && /data-menu-suggestion=\{s\}/.test(menus))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
