/**
 * ===========================================================================
 *  ADD A SECTION AND THE PAGE SWITCHER, AS THE OWNER ASKED FOR THEM
 * ===========================================================================
 *
 *   PAGES     "Make sure the pages are organized into categories ... like
 *             Shopify has done it. It has sub-levels with sub scroll bars,
 *             it's weird and bad."
 *   ROWS      "Make sure the Add section modal displays only one section per
 *             row, not 2 per row."
 *   WORDS     "It should not show at the end 'after (whatever)'." And
 *             "'Created by you' should be called 'Created' only."
 *   PILLS     "When I switch between the category pills of the sections,
 *             there should be no flash and no glitch in the preview cards."
 *   AFTER     "When I click to add a section ... it then needs to open, from
 *             the bottom, smoothly, the sections mobile bottom sheet on that
 *             section's settings."
 *
 * The grouping and the timing of the sheet are functions, so they are run
 * here. What they look like and how they move is measured in a browser:
 * scripts/check-add-section.mjs (every frame of a category switch, filmed,
 * and of an add on a phone) and scripts/check-page-switcher.mjs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  PAGE_GROUP_LABELS,
  PAGE_GROUP_ORDER,
  PAGE_SEARCH_FROM,
  PRODUCTS_LISTED,
  groupPages,
  pageGroupOf,
  pageMatches,
} from "@/lib/website-builder/page-groups"
import { BUILT_IN_PAGE_KEYS, pagePath } from "@/lib/website-builder/site-pages"
import { POLICY_PAGES } from "@/lib/website-builder/policy-pages"
import { ACCOUNT_PAGE_PATHS } from "@/lib/website-builder/account-pages"
import { afterAddSettles, sheetCoverAbovePeek } from "@/lib/website-builder/section-arrival"
import { SECTION_CATEGORIES } from "@/lib/website-builder/section-schemas"
import { CUSTOM_SECTION_CATEGORY } from "@/lib/website-builder/storelib-schemas"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? `: ${detail}` : ""))
    console.log(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** A source without its comments, so a comment describing what was removed does not count as it being there. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const switcher = read("components/website-builder/page-switcher.tsx")
const switcherCode = code(switcher)
const library = read("components/website-builder/editor/section-library.tsx")
const libraryCode = code(library)
const editor = read("app/website-builder/editor/[installId]/page.tsx")
const sheet = read("components/website-builder/mobile-editor-sheet.tsx")
const css = read("app/globals.css")
const chat = read("components/website-builder/theme-chat.tsx")
const manifest = JSON.parse(read("themes/default/manifest.json")) as { section_categories: Record<string, string> }

async function main() {
  // ═════════════════════════════════════════════════════════════════════════
  console.log("\nPAGES: every page the site has, in the group a shop puts it in")
  // ═════════════════════════════════════════════════════════════════════════
  {
    /* The pages exactly as the editor lists them: the theme's nine, three policies, two of the creator's own. */
    const pages = [
      ...[...BUILT_IN_PAGE_KEYS].map((k) => ({ key: k, name: k, path: pagePath(k) })),
      ...POLICY_PAGES.map((p) => ({ key: p.key, name: p.title, path: `/${p.key}`, custom: true })),
      { key: "lookbook", name: "Lookbook", path: "/lookbook", custom: true },
      { key: "faq", name: "FAQ", path: "/faq", custom: true },
    ]
    const groups = groupPages(pages)
    const keysOf = (g: string) => groups.find((x) => x.key === g)?.pages.map((p) => p.key) ?? []
    check("the groups are the ones a shop has, in order", groups.map((g) => g.key).join(",") === "home,shop,products,pages,accounts,contact,policies", groups.map((g) => g.key).join(","))
    check("named plainly: Home, Shop, Products, Pages, Customer accounts, Contact, Policies",
      PAGE_GROUP_ORDER.map((g) => PAGE_GROUP_LABELS[g]).join(", ") === "Home, Shop, Products, Pages, Customer accounts, Contact, Policies")
    check("home on its own", keysOf("home").join(",") === "home")
    check("the shop, then its search", keysOf("shop").join(",") === "products,search")
    check("the product page under Products", keysOf("products").join(",") === "product")
    check("About first among the pages, then the creator's own in the order they came", keysOf("pages").join(",") === "about,lookbook,faq", keysOf("pages").join(","))
    check("the visitor's account, sign in and wishlist together", keysOf("accounts").join(",") === "account,login,wishlist")
    check("and every one of them is a page the account pages module serves", keysOf("accounts").every((k) => pagePath(k) === ACCOUNT_PAGE_PATHS[k]))
    check("contact on its own", keysOf("contact").join(",") === "contact")
    check("the three policies in the footer's order", keysOf("policies").join(",") === POLICY_PAGES.map((p) => p.key).join(","))
    check("no page is left out or listed twice", groups.reduce((n, g) => n + g.pages.length, 0) === pages.length)
    check("a key nobody knows is one of the creator's pages", pageGroupOf("size-guide") === "pages")
    check("an empty group is not there", groupPages([{ key: "home", name: "Home", path: "/" }]).length === 1)

    check("a search matches a name or an address, any case, every word", pageMatches({ name: "Sign in", path: "/account/login" }, "LOGIN") && pageMatches({ name: "Refund Policy", path: "/refund-policy" }, "refund pol") && !pageMatches({ name: "Wishlist", path: "/wishlist" }, "cart"))
    check("and nothing typed matches everything", pageMatches({ name: "Home page", path: "/" }, "  "))
    check("the search appears once there are more than eight pages", PAGE_SEARCH_FROM === 9)
    check("a store's products are listed a few at a time", PRODUCTS_LISTED === 5)
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\nPAGES: one list, one scroll, no folds")
  // ═════════════════════════════════════════════════════════════════════════
  {
    check("the list is grouped by the one rule", /groupPages\(pages\)/.test(switcherCode) && /from "@\/lib\/website-builder\/page-groups"/.test(switcher))
    check("nothing folds: no group opens and shuts behind a row of its own", !/yoursOpen|productsOpen|setYoursOpen|setProductsOpen/.test(switcherCode) && !/ChevronRight/.test(switcherCode))
    check("and nothing scrolls inside the list", !/PAGES_BEFORE_SCROLL/.test(switcherCode) && !/max-h-\[132px\]/.test(switcherCode) && (switcherCode.match(/overflow-y-auto/g) ?? []).length === 1)
    check("the one scroller is marked for the phone's sheet", /data-page-list-scroll=""\s*\n\s*data-sheet-scroll=""/.test(switcher))
    check("a group's heading is 12px, muted, and not in capitals", /<h3 className=\{cn\("text-\[12px\] font-medium", skin\.heading\)\}>/.test(switcher) && !/uppercase/.test(switcherCode))
    check("rows are 40px on a computer and 48px on a phone", /touch \? "h-12 pl-3 pr-14 text-\[15px\]" : "h-10 pl-3 pr-10 text-\[14px\]"/.test(switcher))
    check("a search at the top once the list is long", /const searchable = count >= PAGE_SEARCH_FROM/.test(switcher) && /placeholder="Search pages"/.test(switcher))
    check("the page being edited is ticked and says so", /aria-current=\{active \? "page" : undefined\}/.test(switcher) && /<Check className="h-4 w-4" strokeWidth=\{2\.25\} \/>/.test(switcher))
    check("Create page is kept: at the foot of the menu, and beside Pages in the sidebar", (switcherCode.match(/Create page/g) ?? []).length === 2 && /g\.key === "pages" && onCreate/.test(switcher))
    check("a store's products are the product page's rows, the one being edited always among them", /if \(on && !shown\.includes\(on\)\) shown\.push\(on\)/.test(switcher) && /Show all \{n\} products/.test(switcher))
    check("a product is chosen by its id, not its title", /onSelectProduct\?: \(id: string\) => void/.test(switcher) && /onSelectProduct=\{selectProductById\}/.test(editor))
    check("a page's delete is always there on a phone and under the pointer on a computer", /touch \? "h-11" : "h-8 opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover\/row:opacity-100"/.test(switcher))

    /* The menu opens and closes on the compositor, and a close plays out. */
    check("the menu is kept for the length of its close, so the close plays, and then goes",
      /if \(open && !present\) setPresent\(true\)/.test(switcher) && /setTimeout\(\(\) => setPresent\(false\), MENU_EXIT_MS\)/.test(switcher) &&
        /\{present && \(/.test(switcher) && /data-state=\{open \? "open" : "closed"\}/.test(switcher))
    check("its exit and the time it is kept for are the same length", /const MENU_EXIT_MS = 140/.test(switcher) && /visibility 0s linear 120ms/.test(css))
    check("and a closing one is out of the tab order", /<div inert=\{!open\}/.test(switcher))
    {
      const menu = css.slice(css.indexOf(".wb-pages-menu {"), css.indexOf(".wb-pages-menu {") + 1200)
      check("it moves by opacity and transform alone", /transition: opacity 140ms ease-out, transform 200ms/.test(menu) && !/transition:[^;]*(height|top|left|width)/.test(menu))
      check("hidden once its exit has played", /visibility: hidden;[\s\S]{0,160}visibility 0s linear 120ms/.test(menu))
      check("its first opening plays too", /@starting-style \{\s*\n\s*\.wb-pages-menu\[data-state="open"\]/.test(menu))
      check("and it holds still for somebody who asked for less motion", /prefers-reduced-motion: reduce[\s\S]{0,120}\.wb-pages-menu/.test(menu))
    }

    /* The phone's page switcher is the Pages tab of its sheet: the same list, light, 48px rows. */
    const browser = editor.slice(editor.indexOf("const renderPageBrowser = () =>"), editor.indexOf("WHICH PANEL IS IN THE SIDEBAR"))
    check("the Pages tab is the same list", /<PageList/.test(browser) && /tone="light"/.test(browser) && /touch=\{isMobileView\}/.test(browser))
    check("with every page the pill has, from one place", /pages=\{sitePages\}/.test(browser) && /<PageSwitcher\s*\n\s*pages=\{sitePages\}/.test(editor))
    check("and the old boxes are gone", !/>Custom Pages<|>Product Pages<|pageBrowserSearch/.test(code(editor)))
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\nROWS AND WORDS: one section per row, no line saying where, Created")
  // ═════════════════════════════════════════════════════════════════════════
  {
    check("the cards are one column", /data-library-grid="" className="flex flex-col"/.test(library) && !/grid-cols-2/.test(libraryCode))
    check("each as wide as the list", /const cardWidth = gridWidth > 0 \? gridWidth - 2 : 0/.test(library))
    check("no where line in either shell", !/data-library-where|where\?: string|\{where &&/.test(libraryCode))
    check("and the editor no longer works one out", !/libraryWhere|whereItGoes|where=\{/.test(code(editor)))
    check("the creator's own category is called Created", manifest.section_categories.yours === "Created" && SECTION_CATEGORIES[CUSTOM_SECTION_CATEGORY] === "Created")
    check("and Ask Storelib calls it the same", /Add it from Add Section, under Created\./.test(chat) && !/Created by you/.test(chat))
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\nPILLS: a category switch fades nothing and drops nothing")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const filter = library.slice(library.indexOf("const filterKey ="), library.indexOf("CLOSE FIRST, ADD ON THE NEXT FRAME"))
    check("a category switch starts the list at its top, before paint, and does nothing else", /useLayoutEffect\(\(\) => \{\s*\n\s*if \(lastFilter\.current === filterKey\) return\s*\n\s*lastFilter\.current = filterKey\s*\n\s*if \(scroller\.current\) scroller\.current\.scrollTop = 0\s*\n\s*\}, \[filterKey\]\)/.test(filter))
    check("the list is not faded in on a category", !/\.animate\(/.test(code(filter)) && !/opacity: 0\.25/.test(libraryCode))
    check("a preview's fade is no longer a class a re-shown card replays", !/wb-preview-arrive/.test(libraryCode) && !/\.wb-preview-arrive\s*\{/.test(css))
    const box = library.slice(library.indexOf("const PreviewBox = memo("), library.indexOf("const LibraryCard = memo("))
    check("it is played once, by hand, when a preview lands in front of somebody",
      /if \(held\.current\) return/.test(box) && /inFrontOfSomebody\(el\)/.test(box) && /el\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\]/.test(box))
    check("in front of somebody means shown, not in a closed shell, not skipped below the fold",
      /contentVisibilityAuto: true, visibilityProperty: true, opacityProperty: true/.test(library))
    check("a preview that is in stays in, whatever category comes next", /const \[live, setLive\] = useState<ReadonlySet<string>>/.test(library) && /live=\{live\.has\(k\)\}/.test(library) && !/< filled/.test(libraryCode))
    check("the cards keep their keys, so a switch rebuilds none", /key=\{k\}/.test(library) && /const cardKey = /.test(library) && /hidden=\{!shown\.has\(e\)\}/.test(library))
    check("a short category cannot widen the list and redraw every card", (library.match(/\[scrollbar-gutter:stable\]/g) ?? []).length === 2)
    check("the top of a category is drawn the moment it is shown, not a few grey frames later",
      /const eager = useMemo\(\(\) => new Set\(order\.slice\(0, Math\.min\(EAGER_CARDS, shown\.size\)\)\), \[order, shown\]\)/.test(library) &&
        /contentVisibility: eager \? "visible" : "auto"/.test(library) && /eager=\{eager\.has\(k\)\}/.test(library) && /const EAGER_CARDS = 3/.test(library))
    check("a fresh open is on All from its first frame", /useLayoutEffect\(\(\) => \{\s*\n\s*if \(open\) \{\s*\n\s*setActiveCategory\(null\)/.test(library))
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\nAFTER: on a phone the sheet comes up on the new section's settings")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const add = editor.slice(editor.indexOf("const addSection = (type: string, presetIndex = 0) => {"), editor.indexOf("// Add custom page"))
    check("adding selects the section and puts the sidebar on it, whichever tab it was on",
      /setSelectedPanel\(\{ type: "section", sectionId: newSection\.id \}\)\s*\n[\s\S]{0,240}setPageBrowserOpen\(false\)\s*\n\s*setSidebarMode\("sections"\)/.test(add))
    check("on a phone the canvas brings it into the room above the risen sheet", /bottomInset: isMobileView \? sheetCoverAbovePeek\(document\.documentElement\.style\) : undefined/.test(add))
    check("and the canvas plays it with that room", /bottomInset: plan\.bottomInset \?\? peek/.test(editor))
    check("then the sheet rises, once the library has gone and the canvas is still",
      /if \(isMobileView\) riseOnAdded\(newSection\.id\)/.test(add) &&
        /afterAddSettles\(\s*\n\s*\{ waitMs: sheetMoveMs\(\), scroller: document\.getElementById\("wb-preview-root"\), sectionId \}/.test(add))
    check("to the stop it opens to, on the section it was brought up for",
      /setMobileSidebarOpen\(true\)\s*\n\s*setSheetRestKey\(\(n\) => n \+ 1\)/.test(add) && /restKey=\{sheetRestKey\}/.test(editor))
    check("not if the library was opened again in the meantime", /if \(addSectionOpenRef\.current\) return/.test(add))
    check("and its settings are already in the sheet, arrived without a slide to be caught as it comes into view",
      /quietPanel\.current = `section:\$\{newSection\.id\}`/.test(add) &&
        /const quiet = quietPanel\.current === sidebarPanelKey\s*\n\s*quietPanel\.current = null/.test(editor) &&
        /dir: quiet \? 0 : panelDepth\(sidebarPanelKey\) - panelDepth\(panelMove\.current\.key\)/.test(editor))
    check("a computer is as it was: no sheet, nothing waits", /if \(isMobileView\) riseOnAdded/.test(add))

    check("the sheet tells how long it takes to move, once", /export function sheetMoveMs\(\): number \{\s*\n\s*return prefersReducedMotion\(\) \? REDUCED_MOTION_MS : SNAP_DURATION_MS/.test(sheet))
    check("and publishes the room it takes when up, beside its peek", /root\.style\.setProperty\("--wb-sheet-open", `\$\{openCover\}px`\)/.test(sheet) && /if \(peek <= 0 \|\| openCover <= 0\) return/.test(sheet))
    check("a new rest key sends an open sheet back to the stop it opens to", /if \(restKey === restKeySeen\.current\) return\s*\n\s*restKeySeen\.current = restKey\s*\n\s*setRestIndex\(null\)/.test(sheet))

    /* Run, not read: what the risen sheet covers of the canvas. */
    const style = (open: string, peek: string) => ({ getPropertyValue: (n: string) => (n === "--wb-sheet-open" ? open : n === "--wb-sheet-peek" ? peek : "") })
    check("the risen sheet covers its height less the peek the canvas already keeps clear", sheetCoverAbovePeek(style("422px", "72px")) === 350)
    check("nothing where there is no sheet", sheetCoverAbovePeek(style("", "")) === 0 && sheetCoverAbovePeek(style("", "72px")) === 0)

    /* Run, not read: the rise waits for the library, the arrival and a still canvas. */
    const g = globalThis as unknown as Record<string, unknown>
    const hadRaf = "requestAnimationFrame" in g
    const hadDoc = "document" in g
    let arrival: string | null = null
    /* A frame every 4ms, and while `moving` the canvas has travelled a little further by each one. */
    let moving = false
    const scroller = { scrollTop: 0 } as unknown as HTMLElement
    g.requestAnimationFrame = (cb: (t: number) => void) =>
      setTimeout(() => {
        if (moving) (scroller as unknown as { scrollTop: number }).scrollTop += 40
        cb(performance.now())
      }, 4) as unknown as number
    g.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as NodeJS.Timeout)
    g.document = { getElementById: () => ({ hasAttribute: (n: string) => n === "data-arrival" && arrival !== null }) }
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    {
      let doneAt = -1
      const t0 = performance.now()
      afterAddSettles({ waitMs: 30, scroller, sectionId: "x", maxMs: 400 }, () => { doneAt = performance.now() - t0 })
      await wait(15)
      check("it does not rise while the library is still closing", doneAt < 0)
      await wait(60)
      check("nor before the section has started to arrive", doneAt < 0)
      arrival = "playing"
      moving = true
      await wait(40)
      check("nor while the canvas is scrolling to it", doneAt < 0)
      moving = false
      await wait(80)
      check("and rises once the canvas has stopped", doneAt > 0, `${Math.round(doneAt)}ms`)
    }
    {
      arrival = null
      let done = false
      const cancel = afterAddSettles({ waitMs: 5, scroller, sectionId: "x", maxMs: 60 }, () => { done = true })
      await wait(120)
      check("a section that never arrives does not hold it for ever", done)
      let called = false
      const cancel2 = afterAddSettles({ waitMs: 20, scroller, sectionId: "x" }, () => { called = true })
      cancel2()
      await wait(60)
      check("and a cancelled rise does not happen", !called)
      cancel()
    }
    if (!hadRaf) { delete g.requestAnimationFrame; delete g.cancelAnimationFrame }
    if (!hadDoc) delete g.document
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
