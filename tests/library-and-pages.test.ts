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
 *   HEIGHTS   A short section (the "My banner" preview) sat at the top of a
 *             tall fixed frame over a large empty area. Each card is its
 *             section's height now, between a floor and the crop, and never
 *             gets shorter where somebody can see it.
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
import { BUILT_IN_PAGE_KEYS, NOT_FOUND_PAGE_KEY, pagePath } from "@/lib/website-builder/site-pages"
import { POLICY_PAGES } from "@/lib/website-builder/policy-pages"
import { ACCOUNT_PAGE_PATHS } from "@/lib/website-builder/account-pages"
import { afterAddSettles, sheetCoverAbovePeek } from "@/lib/website-builder/section-arrival"
import { PREVIEW_MIN_HEIGHT, previewCardHeight, previewCentered } from "@/lib/website-builder/preview-markup"
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
    check("the groups are the ones a shop has, in order", groups.map((g) => g.key).join(",") === "home,shop,products,pages,accounts,contact,policies,other", groups.map((g) => g.key).join(","))
    check("named plainly: Home, Shop, Products, Pages, Customer accounts, Contact, Policies, Other",
      PAGE_GROUP_ORDER.map((g) => PAGE_GROUP_LABELS[g]).join(", ") === "Home, Shop, Products, Pages, Customer accounts, Contact, Policies, Other")
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
    /* Every site draws a page for an address it does not have (main's e85caf74), and the builder opens it. */
    /* And the password page beside it (lib/site-password): a page visitors land on, never one a menu links to. */
    check("the 404 page is a page of its own, under Other, at the end, with the password page", keysOf("other").join(",") === `${NOT_FOUND_PAGE_KEY},password` && groups[groups.length - 1].key === "other", keysOf("other").join(","))
    check("the visitor's pages are exactly the ones account-pages.ts serves, contact aside",
      keysOf("accounts").join(",") === Object.keys(ACCOUNT_PAGE_PATHS).filter((k) => k !== "contact").join(","))
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
    /* The bar's menu took 10px for Chrome's bar the moment it scrolled (scripts/check-page-menu-scroll.mjs). */
    check("the bar's menu scrolls under a drawn thumb that takes no width, and is capped by the window",
      /"cp-overlay-scroll max-h-\[min\(400px,calc\(100dvh-200px\)\)\] p-1\.5"/.test(switcher) && /\{!light && <OverlayRail scrollerRef=\{scrollRef\} tone="dark" \/>\}/.test(switcher) && /\.cp-overlay-rail\[data-tone="dark"\] \.cp-overlay-thumb/.test(css))
    check("the sidebar's light list keeps its slim bar", /\? cn\("wb-slim-scroll flex-1", sidePad/.test(switcher))
    check("a group's heading is 12px, muted, and not in capitals", /<h3 className=\{cn\("text-\[12px\] font-medium", skin\.heading\)\}>/.test(switcher) && !/uppercase/.test(switcherCode))
    check("rows are 40px on a computer and 48px on a phone", /touch \? "h-12 pr-14 text-\[15px\]" : "h-10 pr-10 text-\[14px\]"/.test(switcher))
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
  console.log("\nPAGES: one indent grid, and every row on it")
  // ═════════════════════════════════════════════════════════════════════════
  {
    /**
     * "This kind of UI misaligned should never happen." A child's name used
     * to start 28px into the menu and its group's 34px, so a page sat to the
     * LEFT of the group it belongs to, and the `pl-4` on the children's list
     * pushed their highlights 16px in while the group's ran the full width.
     * The numbers below are the whole grid; scripts/check-builder-menu-align
     * .mjs measures the rendered menu against them at 390 and 1280.
     */
    const grid = switcher.slice(switcher.indexOf("export const PAGE_MENU_GRID"), switcher.indexOf("type RowItem"))
    check("the grid is written down: 12 of padding, a 22px chevron column, one 12px step",
      /rowPadX: 12/.test(grid) && /chevronCol: 22/.test(grid) && /childStep: 12/.test(grid))
    check("so a group's label starts at 34 and a child's at 46", /groupLabelX: 34/.test(grid) && /childLabelX: 46/.test(grid))
    check("and the rows carry those two numbers", /indented \? "pl-\[46px\]" : "pl-3"/.test(switcher))
    check("a group's row is px-3 with a 3.5 chevron and a gap-2: 12 + 14 + 8 = 34",
      /"flex h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-\[13px\]/.test(switcher) && /<ChevronDown\s*\n\s*className=\{cn\("h-3\.5 w-3\.5 shrink-0/.test(switcher))
    check("the children's list has no padding of its own, so their highlights keep their group's edges",
      /<ul role="list" className="pb-1">\{rows\}<\/ul>/.test(switcher) && !/pl-4/.test(switcherCode))
    check("every row in the menu is a child of its group, so every one of them is indented",
      /pageRow\(row\.page, collapsible\)/.test(switcher) && /productRow\(row\.product, collapsible\)/.test(switcher) && /moreRow\(row\.count, collapsible\)/.test(switcher))
    check("the tick, a page's bin and a group's count end on one right edge", /const slot = cn\("right-1 justify-end pr-2", touch \? "w-11" : "w-8"\)/.test(switcher))
    check("Create page shares the rows' edges and starts on the group labels' x", /border-t border-white\/10 p-1\.5/.test(switcher) && /flex h-10 w-full items-center gap-1\.5 rounded-lg px-3/.test(switcher))
    check("the dark search puts what is typed on that same x and its clear button on the counts' column",
      /border-b border-white\/10 pl-3\.5 pr-4/.test(switcher))
    check("the sidebar's heading starts where the names in its box do", /justify-between px-\[13px\]/.test(switcher))
    check("and the light list's side padding is one number, shared by its search and its rows",
      /const sidePad = boxed \? \(touch \? "px-4" : "px-3"\) : "px-2"/.test(switcher) && (switcherCode.match(/sidePad/g) ?? []).length === 3)
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
    check("a category switch starts the list at its top, before paint, and fades nothing",
      /useLayoutEffect\(\(\) => \{\s*\n\s*if \(lastFilter\.current === filterKey\) return\s*\n\s*lastFilter\.current = filterKey\s*\n\s*if \(scroller\.current\) scroller\.current\.scrollTop = 0\s*\n[^\n]*\n\s*releaseHeld\(false\)\s*\n\s*\}, \[filterKey\]\)/.test(filter))
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
    const eagerMemo = library.slice(library.indexOf("const eager = useMemo("), library.indexOf("THE PILLS START AT THE START"))
    check("the top of a category is drawn the moment it is shown, not a few grey frames later",
      /contentVisibility: eager \? "visible" : "auto"/.test(library) && /eager=\{eager\.has\(k\)\}/.test(library) && /const EAGER_CARDS = 3/.test(library))
    check("as many cards as fill the window, at the heights they are drawn at, and never fewer than three",
      /if \(out\.size >= EAGER_CARDS && y >= reach\) break/.test(eagerMemo) &&
        /y \+= previewCardHeight\(HEIGHTS\.get\(e\.keyFor\(renderWidth\)\), cardWidth, renderWidth, ratio\)/.test(eagerMemo) &&
        /const reach = cardWidth > 0 && typeof window !== "undefined" \? window\.innerHeight : 0/.test(eagerMemo) &&
        /\}, \[entries, shown, heightsSeen, cardWidth, renderWidth, ratio\]\)/.test(eagerMemo))
    check("a fresh open is on All from its first frame", /useLayoutEffect\(\(\) => \{\s*\n\s*if \(open\) \{\s*\n\s*setActiveCategory\(null\)/.test(library))
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\nHEIGHTS: a card is as tall as its section, and never shrinks in sight")
  // ═════════════════════════════════════════════════════════════════════════
  {
    /* The numbers the library draws at: a computer's card in its dialog, and a phone's in its sheet. */
    const desk = { card: 760, drawnAt: 800, ratio: 0.56 }
    const phone = { card: 356, drawnAt: 390, ratio: 1.22 }
    const tallest = (d: typeof desk) => Math.round(d.card * d.ratio)
    check("until its section is measured, a card is as tall as a card can be (most sections are)",
      previewCardHeight(undefined, desk.card, desk.drawnAt, desk.ratio) === tallest(desk) && previewCardHeight(undefined, phone.card, phone.drawnAt, phone.ratio) === tallest(phone))
    check("and so is one whose preview failed to draw", previewCardHeight(0, desk.card, desk.drawnAt, desk.ratio) === tallest(desk))
    check("a short section's card is its own height, scaled as the card scales it, rounded up",
      previewCardHeight(120, desk.card, desk.drawnAt, desk.ratio) === 114 && previewCardHeight(137, phone.card, phone.drawnAt, phone.ratio) === Math.ceil((137 * 356) / 390),
      `${previewCardHeight(120, desk.card, desk.drawnAt, desk.ratio)}`)
    check(`a sliver of a section still gets ${PREVIEW_MIN_HEIGHT}px, enough to read as a section`,
      PREVIEW_MIN_HEIGHT === 80 && previewCardHeight(30, desk.card, desk.drawnAt, desk.ratio) === 80 && previewCardHeight(1, phone.card, phone.drawnAt, phone.ratio) === 80)
    check("and sits in the middle of it, not on a block of white",
      previewCentered(40, desk.card, desk.drawnAt, 80) && previewCentered(45, phone.card, phone.drawnAt, 80))
    check("a section at its own height, or held at the crop, starts at the top like a page",
      !previewCentered(120, desk.card, desk.drawnAt, 114) && !previewCentered(40, desk.card, desk.drawnAt, tallest(desk)) && !previewCentered(undefined, desk.card, desk.drawnAt, 80))
    check("a tall section is cut at the crop, as before",
      previewCardHeight(2000, desk.card, desk.drawnAt, desk.ratio) === tallest(desk) && previewCardHeight(1400, phone.card, phone.drawnAt, phone.ratio) === tallest(phone))
    check("and before the list has a width, the box keeps its shape by ratio", previewCardHeight(120, 0, desk.drawnAt, desk.ratio) === 0 && /aspectRatio: height \? undefined : `1 \/ \$\{ratio\}`/.test(library))

    const pump = library.slice(library.indexOf("function pump()"), library.indexOf("export function requestPreviews"))
    check("each preview is measured once, after it is drawn and its styles are in",
      /if \(unmeasured\.length\) \{\s*\n[^\n]*\n\s*flushStyles\(\)/.test(pump) && /height = measureOne\(next\.html, next\.width\)/.test(pump))
    check("and its card is handed the preview and the height together",
      /HEIGHTS\.set\(next\.key, height\)\s*\n\s*MARKUP\.set\(next\.key, next\.html\)/.test(pump) && /unmeasured\.push\(\{ key: job\.key, html, width: job\.width \}\)/.test(pump) && !/MARKUP\.set\(job\.key/.test(pump))
    check("an idle moment measures or draws, never both, and stops at its deadline",
      /\} while \(unmeasured\.length && deadline\.timeRemaining\(\) > MEASURE_ROOM_MS\)/.test(pump) && /\} else \{\s*\n\s*do \{/.test(pump) && /\} while \(queue\.length && deadline\.timeRemaining\(\) > 12\)/.test(pump))
    check("and a preview being measured is not asked for twice", /!MARKUP\.has\(j\.key\) && !queued\.has\(j\.key\) && !pending\.has\(j\.key\)/.test(library))
    const flush = library.slice(library.indexOf("function flushStyles()"), library.indexOf("/* ── The preview store"))
    check("each idle moment's styles go in a small sheet of their own, not on the end of one that is read again",
      /const sheet = document\.createElement\("style"\)\s*\n\s*sheet\.setAttribute\("data-section-preview-styles", ""\)\s*\n\s*sheet\.textContent = styleQueue\.splice\(0\)\.join\("\\n"\)\s*\n\s*document\.head\.appendChild\(sheet\)/.test(flush) &&
        !/createTextNode/.test(libraryCode))
    check("a closed library is not drawn again for every height that lands, only an open one",
      /const subscribeWhileOpen = useCallback\(\(l: \(\) => void\) => \(open \? subscribe\(l\) : \(\) => \{\}\), \[open\]\)/.test(library) &&
        /const heightsSeen = useSyncExternalStore\(subscribeWhileOpen, \(\) => heightsVersion, \(\) => 0\)/.test(library))
    check("in a ruler out of sight, as wide as the preview is drawn, kept to itself",
      /ruler\.style\.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;contain:layout paint"/.test(library) && /ruler\.style\.width = `\$\{width\}px`/.test(library) && /ruler\.textContent = ""/.test(library))
    const box = library.slice(library.indexOf("const PreviewBox = memo("), library.indexOf("const LibraryCard = memo("))
    check("a card takes that height, from its first frame when it is known by then",
      /const height = useSteadyHeight\(boxRef, previewCardHeight\(drawn, width, renderWidth, ratio\), width, drawn !== undefined\)/.test(box) &&
        /ref=\{boxRef\}/.test(box) && /useState\(\(\) => \(\{ height: wanted, width \}\)\)/.test(library))
    check("a section shorter than its card still sits on white to the card's foot",
      /minHeight: height \? Math\.ceil\(height \/ scale\) : undefined/.test(box) && /height: height \|\| undefined,/.test(box))
    check("in the middle of it under the floor", /const centered = previewCentered\(drawn, width, renderWidth, height\)/.test(box) && /\.\.\.\(centered \? IN_THE_MIDDLE : null\)/.test(box))
    const steady = library.slice(library.indexOf("function useSteadyHeight("), library.indexOf("const PreviewBox = memo("))
    check("a card is never made shorter where somebody can see it: it is held instead",
      /if \(wanted > kept\.height \|\| !box \|\| !inSight\(box\)\) \{\s*\n\s*take\(\)/.test(steady) && /heldCards\.add\(held\)/.test(steady) && /heldCards\.delete\(held\)/.test(steady))
    check("and one not measured yet keeps what it has rather than growing to the crop and back", /if \(kept\.height === wanted \|\| !known\) return/.test(steady))
    const sight = library.slice(library.indexOf("function inSight("), library.indexOf("function releaseHeld("))
    check("in sight counts a card above the fold too, since iOS will not anchor the list for it",
      /return box\.getBoundingClientRect\(\)\.top < list\.getBoundingClientRect\(\)\.bottom/.test(sight) && /visibilityProperty: true, opacityProperty: true/.test(sight))
    check("a held card takes its height when the library opens again, before its first frame",
      /if \(open\) \{\s*\n\s*setActiveCategory\(null\)\s*\n\s*setQuery\(""\)\s*\n[^\n]*\n\s*releaseHeld\(true\)/.test(library))
    check("or when a new category leaves it out of sight", /releaseHeld\(false\)\s*\n\s*\}, \[filterKey\]\)/.test(library))
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\nAFTER: on a phone the sheet comes up on the new section's settings")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const add = editor.slice(editor.indexOf("const addSection = (type: string, presetIndex = 0, replaceConfirmed = false) => {"), editor.indexOf("// Add custom page"))
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
