/**
 * ===========================================================================
 *  A HEADER AS FLEXIBLE AS A SHOPIFY ONE
 * ===========================================================================
 * The owner asked for six things of the storefront header, and each one is
 * checked here:
 *
 *   1. menu styles: a link or a button that opens its links, and links in
 *      the row or a menu button with a drawer from the left, right or top
 *   2. drawers that open and close smoothly, close on a swipe or a tap on
 *      the backdrop, and stand still for reduced motion
 *   3. search as a field in the header, a window, or the search page
 *   4. the logo image when one is set, else the store name
 *   5. the logo as the site's icon when no favicon is set
 *   6. a header of the creator's own reaching the same drawers
 *
 * And a header saved before any of this draws what it drew. The motion is
 * filmed by a probe in headless Chromium; this is the rules and the wiring.
 *
 *   npx tsx tests/header-flex.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import {
  desktopDrawerEdge,
  desktopMenu,
  drawerClosedTransform,
  isMenuButton,
  mobileMenuStyle,
  searchMode,
} from "@/lib/website-builder/header-settings"
import { drawerEdgeHere, menuDrawerExists } from "@/lib/website-builder/header-drawers"
import {
  DRAWER_CLOSE_EASE,
  DRAWER_OPEN_EASE,
  swipeCloses,
  swipeProgress,
  swipeStarts,
} from "@/components/website-builder/drawer-frame"
import { siteIconUrl, siteIcons } from "@/lib/website-builder/site-icon"
import {
  cartCountText,
  hookEdge,
  hooksIn,
  menuDrawerItems,
  menuHandleOf,
} from "@/lib/website-builder/storefront-hooks"
import { claimDrawer, drawerHosts } from "@/components/website-builder/site-drawer-host"
import { HeaderSection } from "@/components/website-builder/sections/renderers/HeaderSection"
import { DEVELOPER_DOCS } from "@/lib/developers/content.generated"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}

const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
const frame = read("components/website-builder/drawer-frame.ts")
const modal = read("components/website-builder/header-search-modal.tsx")
const schema = JSON.parse(read("themes/default/sections/header.json")) as { fields: { id: string; default?: unknown; options?: { value: string }[] }[] }
const field = (id: string) => schema.fields.find((f) => f.id === id)
const values = (id: string) => (field(id)?.options ?? []).map((o) => o.value)
const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")

const theme = { brand_name: "Fern Studio" } as ThemeSettingsValues
const links = [
  { id: "home", type: "nav_link", settings: { label: "Home", url: "/" } },
  { id: "shop", type: "nav_link", settings: { label: "Shop", url: "/products" } },
  { id: "shop-a", type: "nav_link", settings: { label: "Prints", url: "/products/prints", parent_id: "shop" } },
  { id: "more", type: "nav_link", settings: { label: "More", url: "#" } },
  { id: "more-a", type: "nav_link", settings: { label: "Journal", url: "/blog", parent_id: "more" } },
  { id: "more-b", type: "nav_link", settings: { label: "Contact", url: "/contact", parent_id: "more" } },
]
const headerWith = (settings: Record<string, unknown>, t: ThemeSettingsValues = theme) =>
  renderToStaticMarkup(createElement(HeaderSection, {
    section: { id: "hdr", type: "header", settings, blocks: links } as unknown as SectionInstance,
    theme: t,
    deviceMode: "desktop",
  } as never))

console.log("\n1. Menu styles: a link, or a button that opens its links")
{
  check("a link with sub-links and an address of its own is a link", isMenuButton("/products", 2) === false)
  check("a link with sub-links and no address is a button", isMenuButton("", 2) === true && isMenuButton(" ", 1) === true)
  check("so is one whose address is the # a menu uses for nowhere", isMenuButton("#", 3) === true)
  check("a link with no sub-links is a link, whatever its address", isMenuButton("#", 0) === false && isMenuButton("", 0) === false)

  const html = headerWith({})
  check("the button is drawn as a button that says it opens a menu", /<button[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*aria-controls="more-menu"/.test(html))
  check("and its links are in a menu it controls", /role="menu" id="more-menu" data-open="false"/.test(html) && html.includes(">Journal<") && html.includes(">Contact<"))
  check("a link with an address is still an <a> to it, its links opening under the pointer", /<a href="\/products"/.test(html) && /role="menu" id="shop-menu"(?! data-open)/.test(html))
  check("the link's sub-links open under the keyboard's focus too", /group-focus-within\/navitem:opacity-100/.test(header))
  check("the button opens on a press and on a resting mouse, never on a touch", /setOpenDropdown\(dropdownOpen \? null : block\.id\)/.test(header) && /e\.pointerType === "mouse"/.test(header))
  check("Escape and a press elsewhere close it, and choosing a link does", /e\.key !== "Escape"/.test(header) && /document\.addEventListener\("pointerdown", onDown\)/.test(header) && /setOpenDropdown\(null\)\s*\n\s*if \(onEditorNavigate\)/.test(header))
  check("in the phone drawer a link with sub-links opens them in the drawer", /data-submenu-trigger=\{item\.id\}/.test(header))
  check("the link editor offers the choice for a link with sub-links", /When pressed/.test(read("components/website-builder/editor/controls/link-list-editor.tsx")) && /Opens its sub-links/.test(read("components/website-builder/editor/controls/link-list-editor.tsx")))
}

console.log("\n1. Menu styles: links in the row, or a menu button and a drawer")
{
  check("Menu on phones can drop down from the top", mobileMenuStyle("top") === "top" && values("mobile_menu_style").includes("top"))
  check("and is still the left for anything it does not know", mobileMenuStyle(undefined) === "left" && mobileMenuStyle("<x>") === "left")
  check("Menu on larger screens is links in the row unless told otherwise", desktopMenu(undefined) === "inline" && desktopMenu("sideways") === "inline" && field("desktop_menu")?.default === "inline")
  check("with three drawers to choose from", ["drawer_left", "drawer_right", "drawer_top"].every((v) => values("desktop_menu").includes(v) && desktopMenu(v) === v))
  check("each names its edge", desktopDrawerEdge("drawer_left") === "left" && desktopDrawerEdge("drawer_right") === "right" && desktopDrawerEdge("drawer_top") === "top" && desktopDrawerEdge("inline") === null)
  check("a drawer on larger screens exists on the desktop canvas", menuDrawerExists("desktop", true) && menuDrawerExists("tablet", true))
  check("and without one it still does not", menuDrawerExists("desktop") === false && menuDrawerExists("desktop", false) === false)
  check("the edge is the phone's on a phone and the larger screen's elsewhere",
    drawerEdgeHere("left", "top", "mobile", true) === "left" && drawerEdgeHere("left", "top", "desktop", false) === "top")
  check("published, it follows the window", drawerEdgeHere("right", "top", undefined, true) === "top" && drawerEdgeHere("right", "top", undefined, false) === "right")
  check("with no drawer on larger screens the phone's edge is the only one", drawerEdgeHere("right", null, "desktop", true) === "right")

  const inline = headerWith({})
  check("a header that never set it draws its links in the row, and no menu button", inline.includes(">Home<") && !inline.includes('data-menu-button="desktop"'))
  const drawn = headerWith({ desktop_menu: "drawer_right" })
  check("set to a drawer, the row has a menu button", /data-menu-button="desktop"[^>]*>|aria-label="Open menu"[^>]*data-menu-button="desktop"/.test(drawn) && drawn.includes('data-menu-button="desktop"'))
  check("and the links leave the row", !drawn.includes(">Home<"))
  check("the published drawer is not hidden at md when larger screens have one", /phoneOnly=\{!deviceMode && !drawerOnDesktop\}/.test(header))
  check("changing it in the editor opens the drawer to show it", /if \(drawerOnDesktop\) openMenu\(\)/.test(header))
  check("the editor offers it beside the desktop layout", /label="Menu on larger screens"/.test(editor) && /onUpdateSetting\("desktop_menu", v\)/.test(editor))
  check("and Menu on phones offers the top", /\{ label: "Drops down from the top", value: "top" \}/.test(editor))
}

console.log("\n2. Drawers open and close smoothly")
{
  check("each edge rests off screen by a transform alone",
    drawerClosedTransform("left") === "translate3d(-101%, 0, 0)" && drawerClosedTransform("right") === "translate3d(101%, 0, 0)" && drawerClosedTransform("top") === "translate3d(0, -101%, 0)" && drawerClosedTransform("full") === "translate3d(-101%, 0, 0)")
  check("the menu reads its resting place from that rule", /drawerClosedTransform\(menuStyle\)/.test(header))
  check("from the top it drops inside a frame that clips under the header", /data-drawer-frame="top"/.test(header) && /"left-0 right-0 overflow-hidden"/.test(header))
  check("it closes on the curve it opens with, the iOS one", DRAWER_CLOSE_EASE === DRAWER_OPEN_EASE && DRAWER_OPEN_EASE === "cubic-bezier(0.32, 0.72, 0, 1)")
  check("motion is transform and opacity, started on a painted frame", /frame\.current = requestAnimationFrame\(\(\) => \{/.test(frame) && /property: "transform" \| "opacity"/.test(frame))
  check("reduced motion: no travel", /if \(prefersStill\(\)\) \{\s*el\.style\.transition = "none"/.test(frame))
  check("a tap on the backdrop closes it, on the press", /node\.addEventListener\("pointerdown", dismiss\)/.test(frame))

  check("a drag toward the edge counts, the other way does not", swipeProgress("left", -100, 0, 300) > 0.33 && swipeProgress("left", 100, 0, 300) === 0)
  check("a third of the way closes it", swipeCloses("right", 101, 0, 300, 0) && !swipeCloses("right", 60, 0, 300, 0.1))
  check("so does a flick", swipeCloses("left", -40, 0, 300, 0.6) && !swipeCloses("left", -10, 0, 300, 0.9))
  check("a drawer from the top is pushed up", swipeCloses("top", 0, -150, 400, 0) && swipeProgress("top", 0, 80, 400) === 0)
  check("a sideways drag on a side drawer starts a swipe, an up and down one is a scroll", swipeStarts("left", -20, 4, null) && !swipeStarts("left", -4, 20, null) && !swipeStarts("right", -20, 0, null))
  check("a drawer from the top lets go only once its list has nowhere further to scroll",
    !swipeStarts("top", 0, -20, { scrollTop: 0, scrollHeight: 800, clientHeight: 400 }) && swipeStarts("top", 0, -20, { scrollTop: 400, scrollHeight: 800, clientHeight: 400 }))
  check("the menu and the cart both take the swipe", /useDrawerSwipe\("right", onClose, backdropNode\)/.test(header) && /useDrawerSwipe\(menuStyle === "right" \? "right" : fromTop \? "top" : "left", onClose, backdropNode\)/.test(header))
  check("the drag writes to the nodes, never to state", /panel\.style\.transform = t/.test(frame) && !/setState|useState\(/.test(frame.slice(frame.indexOf("export function useDrawerSwipe"), frame.indexOf("export interface DrawerFrame"))))
  check("a drag let go too early settles back open", /panel\.style\.transform = "translate3d\(0, 0, 0\)"/.test(frame))
}

console.log("\n3. Search: in the header, in a window, or the page")
{
  check("three answers, and the header's field stays the default", searchMode(undefined) === "header" && searchMode("modal") === "modal" && searchMode("page") === "page" && field("search_behaviour")?.default === "header")
  /* Changed on purpose (round 1023): the choice is a WbSelect, which draws buttons or the dropdown by the one rule for every select (controls/choice-control.tsx). */
  check("the schema and the editor offer the window", values("search_behaviour").includes("modal") && /\{ label: "Open a search window", value: "modal" \}/.test(editor))
  check("the window replaces the field over the row, it does not join it", /showSearch && searchOpensInHeader && !searchInWindow && \(/.test(header) && /showSearch && searchInWindow \? \(\s*<SearchModal/.test(header))
  check("its live results come from the store's own search", /\/api\/website-builder\/search\?\$\{askAs\}&q=/.test(modal))
  check("which filters with the rule the search page uses", /productMatchesQuery/.test(read("app/api/website-builder/search/route.ts")))
  check("it is a real form to /search", /action="\/search"/.test(modal) && /name="q"/.test(modal))
  check("it is a dialog in the drawers' frame, locked and portalled", /role="dialog"/.test(modal) && /useDrawerFrame\(open, scopedToPreview, onClose\)/.test(modal) && /createPortal\(/.test(modal))
  check("it moves on transform and opacity", /useDrawerMotion\(open, "transform"/.test(modal) && /useDrawerMotion\(open, "opacity"/.test(modal))
  check("it holds the page still like a drawer", /\(searchInWindow && searchOpen\)/.test(header))
}

console.log("\n4. The logo")
{
  const named = headerWith({})
  check("no logo anywhere: the store's name", named.includes(">Fern Studio<") && !/<img[^>]*class="block shrink-0 object-contain"/.test(named))
  const fromTheme = headerWith({}, { ...theme, logo_url: "https://cdn.example/fern.png", logo_width: 140 } as ThemeSettingsValues)
  check("Theme settings' logo shows in the header", fromTheme.includes('src="https://cdn.example/fern.png"'))
  check("kept within Theme settings' logo width", /max-width:140px/.test(fromTheme))
  const own = headerWith({ logo_url: "https://cdn.example/own.png" }, { ...theme, logo_url: "https://cdn.example/fern.png" } as ThemeSettingsValues)
  check("the header's own logo wins in the header", own.includes('src="https://cdn.example/own.png"') && !own.includes("fern.png"))
  check("a phone may have its own logo", /s\.use_mobile_logo && s\.mobile_logo_url \? str\(s\.mobile_logo_url\) : headerLogo/.test(header))
}

console.log("\n5. The tab's icon")
{
  check("the favicon when there is one", siteIconUrl({ favicon_url: "https://x/f.png", logo_url: "https://x/l.png" }) === "https://x/f.png")
  check("else Theme settings' logo", siteIconUrl({ logo_url: "https://x/l.png" }) === "https://x/l.png")
  check("else the header's own logo", siteIconUrl({}, [{ type: "hero", settings: { logo_url: "https://x/no.png" } }, { type: "header", settings: { logo_url: "/logo.png" } }]) === "/logo.png")
  check("not from a hidden header", siteIconUrl({}, [{ type: "header", hidden: true, settings: { logo_url: "/logo.png" } }]) === "")
  check("nothing when there is nothing, so the route's default stays", siteIcons({}, []) === undefined)
  check("never an address a tab cannot fetch", siteIconUrl({ favicon_url: "javascript:alert(1)", logo_url: "//evil.example/x.png" }) === "")
  /* Changed on purpose (round 41, tests/indexing-r41.test.ts): the same picture, linked at the site's own host (lib/website-builder/site-favicon.ts). */
  check("the site's pages use it", /ownHostIcons\(origin, siteIconUrl\(settings as Record<string, unknown>, found\.site\.pages\.home \?\? found\.site\.sections\)\)/.test(read("app/(site)/w/[username]/render-site.tsx")))
  check("and so does a product page", /ownHostIcons\(origin, siteIconUrl\(settings, found\.site\.pages\.home \?\? found\.site\.sections\)\)/.test(read("app/(site)/w/[username]/products/[slug]/page.tsx")))
}

console.log("\n6. A header of the creator's own reaches the same drawers")
{
  const f = hooksIn('<button data-storelib-menu="main-menu"></button><a href="/cart" data-storelib-cart>Bag <span data-storelib-cart-count></span></a>')
  check("each attribute is read", f.menu && f.cart && f.cartCount && !f.search)
  check("the count is not mistaken for the bag", hooksIn("<span data-storelib-cart-count></span>").cart === false)
  check("nor anything that only starts the same way", hooksIn('<i data-storelib-cartography="1"></i>').cart === false)
  check("the search with a placeholder as its value", hooksIn('<button data-storelib-search="Find a print">').search)
  check("the drawer's edge: left unless it says right or top", hookEdge("right") === "right" && hookEdge("top") === "top" && hookEdge("bottom") === "left")
  check("the count waits for the cart, then caps like the badge", cartCountText(3, false) === "" && cartCountText(3, true) === "3" && cartCountText(140, true) === "99+")
  check("an empty menu value is the main menu", menuHandleOf("") === "main-menu" && menuHandleOf(" footer ") === "footer")
  const items = menuDrawerItems({ title: "Main", links: [{ title: "Shop", url: "/products", links: [{ title: "Prints", url: "/products/prints" }] }, { title: "About", url: "" }] }, "main-menu")
  check("a menu becomes the drawer's two levels", items.length === 2 && items[0].children?.[0].label === "Prints" && items[1].href === "#")

  const cartA = () => {}
  const cartB = () => {}
  const one = claimDrawer(cartA, "header")
  const two = claimDrawer(cartA, "custom")
  const other = claimDrawer(cartB, "custom")
  check("one drawer per cart: the first to ask draws it", drawerHosts(cartA)[0] === "header")
  check("and a second cart on the page has a drawer of its own", drawerHosts(cartB)[0] === "custom")
  one()
  check("the next takes over when the first goes", drawerHosts(cartA)[0] === "custom")
  two(); other()
  check("the built-in header asks for its cart's drawer too", /useDrawerHost\(setCartOpen, section\.id, showCart\)/.test(header))

  const section = read("components/website-builder/sections/StorelibSection.tsx")
  const hooks = read("components/website-builder/sections/site-chrome-hooks.tsx")
  check("a section's press on a trigger is the page's", /if \(drawerTrigger\.current\?\.\(e\)\) return/.test(section) && /<StorefrontHooks/.test(section))
  check("and only a section that asks for a drawer listens to the cart", /\{asksDrawers && \(/.test(section) && !/useSiteCart/.test(section))
  check("it opens the same drawers the built-in header draws", /<HeaderMobileNavDrawer/.test(hooks) && /<HeaderCartDrawer/.test(hooks) && /<SearchModal/.test(hooks))
  check("and says which is open on the trigger, for CSS", /setAttribute\("aria-expanded", String\(open\)\)/.test(hooks))
  check("a trigger that is a link is left to the page in the canvas", /el\.setAttribute\("data-self-nav", ""\)/.test(hooks))
  check("the menu data, the account and the search page were already there", /link_list/.test(DEVELOPER_DOCS["dynamic-values"] ?? "") && /account_url/.test(read("lib/storelib-theme/globals.ts")) && /search_url/.test(read("lib/storelib-theme/globals.ts")))
  const doc = DEVELOPER_DOCS["header-and-footer"] ?? ""
  check("the developer docs list every attribute", ["data-storelib-menu", "data-storelib-menu-from", "data-storelib-cart", "data-storelib-cart-count", "data-storelib-search"].every((a) => doc.includes(`\`${a}\``)))
  check("with a worked example", /### The site's drawers/.test(doc) && /data-storelib-menu="\{\{ settings\.menu\.handle \}\}"/.test(doc))
  check("the generated docs match the markdown", doc === read("content/developers/header-and-footer.md"))
  check("an agent told no is told how", /data-storelib-menu on its menu button/.test(read("lib/storelib-theme/chrome.ts")))
}

console.log("\nA header saved before this draws what it drew")
{
  const before = headerWith({ search_behaviour: "header", mobile_menu_style: "left" })
  const now = headerWith({})
  check("no setting is the same as the old defaults", before === now)
  check("links in the row, the field over the header, the menu from the left", now.includes(">Home<") && !now.includes('data-menu-button="desktop"') && /searchOpensInHeader = str\(s\.search_behaviour, "header"\) !== "page"/.test(header))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
