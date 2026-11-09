/**
 * ===========================================================================
 *  ROUND 40: THE ONEPAGE EDITOR'S EDITING
 * ===========================================================================
 * The owner's list, one section each: four products then Show all, the
 * foot of a block's settings (move, archive, delete), Choose icon and the
 * thumbnail sheet, Add social link on a computer, the sheets' drag, Add
 * block's colours, the block settings' choices, the product picker and its
 * two edit links, the schedule's calendar, scheduling on the live page,
 * the sensitive question, and the file an email signup gives.
 *
 * Run: npx tsx --conditions=react-server tests/onepage-editor-r40.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PRODUCTS_SHOWN, productsTabList } from "@/lib/onepage/products-tab"
import { isScheduledNow, scheduleLabel } from "@/lib/onepage/extra-blocks"
import { isoFromWall, wallFromIso } from "@/lib/onepage/schedule"
import { SCHEDULE_SLACK_MS, SCHEDULE_WAIT_CAP_MS, nextScheduleChange, scheduleWait } from "@/lib/onepage/schedule-clock"
import { openableFileUrl, signupFileFor } from "@/lib/onepage/signup-file"
import { drawnBlocks } from "@/lib/onepage/public-shape"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
/** The code without its comments, so a rule about code is not met by a sentence about it. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

/* WCAG contrast of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
  }
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

function main() {
  const tab = read("components/onepage/tabs/links-tab.tsx")
  const productsTab = read("components/onepage/tabs/products-tab.tsx")
  const reveal = read("components/onepage/reveal.tsx")
  const foot = read("components/onepage/block-remove.tsx")
  const picker = read("components/onepage/add-block-picker.tsx")
  const icons = read("components/onepage/block-icons.tsx")
  const pills = read("components/onepage/pill-tabs.tsx")
  const library = read("components/onepage/icon-library.tsx")
  const sheetDialog = read("components/ui/sheet-dialog.tsx")
  const sheet = read("components/ui/bottom-sheet.tsx")
  const kit = read("components/onepage/block-settings-kit.tsx")
  const productPicker = read("components/onepage/product-picker.tsx")
  const productEditor = read("components/onepage/tabs/product-block-editor.tsx")
  const dateField = read("components/onepage/date-time-field.tsx")
  const extra = read("components/onepage/extra-blocks.tsx")
  const route = read("app/(storelib)/(marketing)/l/[slug]/page.tsx")
  const leads = read("app/api/onepage/leads/route.ts")
  const nextConfig = read("next.config.mjs")
  const refresh = read("components/onepage/schedule-refresh.tsx")

  // ═══════════════════════════════════════════════════════════════════════
  section("Products: four, then Show all, opening to its height")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const products = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, title: i === 7 ? "Linen pants" : `Guide ${i}` }))
    const on = new Set(["p6", "p9"])
    const v = productsTabList(products, on, "")
    check("four by default", PRODUCTS_SHOWN === 4 && v.first.length === 4 && !v.searching)
    check("the ones on the page first", v.first[0].id === "p6" && v.first[1].id === "p9" && v.first[2].id === "p0", v.first.map((p) => p.id).join())
    check("the other seven behind Show all, none twice", v.rest.length === 7 && new Set([...v.first, ...v.rest].map((p) => p.id)).size === 11)
    const few = productsTabList(products.slice(0, 3), new Set(), "")
    check("three products: all of them, nothing behind Show all", few.first.length === 3 && few.rest.length === 0)
    const found = productsTabList(products, on, "  PANTS ")
    check("a search looks through all of them, in one list", found.searching && found.first.length === 1 && found.first[0].id === "p7" && found.rest.length === 0)
    check("the tab draws the four, then the rest in a Reveal under them", /productsTabList\(products, addedProductIds, searchQuery\)/.test(productsTab) && /data-products-first=""/.test(productsTab) && /<Reveal open=\{showAll\} id="products-tab-rest" returnFocus=\{moreRef\}>/.test(productsTab))
    check("Show all says how many, is a disclosure, and turns its chevron by rotate", /tt\("Show all \{count\}", \{ count: products\.length \}\)/.test(productsTab) && /aria-expanded=\{showAll\}/.test(productsTab) && /aria-controls="products-tab-rest"/.test(productsTab) && /transition-\[rotate\]/.test(productsTab))
    check("the Reveal animates the height it measured, from where it is", /box\.animate\(\[\{ height: `\$\{from\}px` \}, \{ height: `\$\{to\}px` \}\]/.test(reveal) && /getBoundingClientRect\(\)\.height/.test(reveal) && /inner\.scrollHeight/.test(reveal))
    check("closed is inert and hidden, and focus goes back to the button", /inert=\{shut \? true : undefined\}/.test(reveal) && /aria-hidden=\{shut \? true : undefined\}/.test(reveal) && /returnFocus\.current\.focus/.test(reveal))
    check("reduced motion opens it at once", /prefers-reduced-motion: reduce/.test(reveal))
    check("what is behind Show all is not built until it is first opened", /\{built \? children : null\}/.test(reveal))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A block's foot: move, then Remove opening Archive or Delete")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /* Changed on purpose (round AO): "don't position the remove button thing above the settings and layouts buttons". Move and Remove are the row's more menu (BlockRowMenu) and Remove's question (BlockRemoveQuestion) opens under the row. */
    check("the links tab uses it, and the old swap is gone", /<BlockRowMenu/.test(tab) && /<BlockRemoveQuestion/.test(tab) && !/<BlockFootActions/.test(tab) && !/showDeleteConfirm/.test(tab) && !/Permanently remove/.test(tab))
    /* Changed on purpose (round AO): the more menu sits in the block's row, beside its switch, and nothing sits over the open block's editor. */
    check("it is in the row, after the switch, and the open block starts with its editor", tab.search(/<BlockRowMenu\s+ref=\{menuRef\}/) > tab.search(/<BlockToggle checked=\{block\.enabled\}/) && tab.search(/<BlockRowMenu\s+ref=\{menuRef\}/) < tab.search(/<Reveal open=\{isSelected\}/) && /data-block-settings="">\s*\{\/\*[\s\S]{0,200}\*\/\}\s*<BlockEditor/.test(tab) && !/data-block-bar/.test(foot))
    check("a group's question says its blocks stay", /Remove this group\? Its blocks stay on your page\./.test(tab))
    /* Changed on purpose (round AO): the moves are the menu's first rows, named, and shown off at the ends rather than hidden. */
    check("the moves are one pair with names", /label: tt\("Move up"\)/.test(foot) && /label: tt\("Move down"\)/.test(foot) && /disabled: isFirst/.test(foot) && /disabled: isLast/.test(foot))
    /* Changed on purpose (round AO): Remove is the menu's last row, in red after a hairline; its question opens under the row to its height and gives focus back to the more button. */
    check("Remove is a menu row, and the question opens under it to its height", /label: tt\("Remove"\)[^\n]*variant: "destructive", separatorBefore: true/.test(foot) && /<Reveal open=\{open\} id=\{panelId\} returnFocus=\{returnFocus\}>/.test(foot) && /aria-label=\{tt\("More actions for \{name\}", \{ name \}\)\}/.test(foot))
    check("Archive and Delete, each a name and one line, and Cancel", /data-block-archive=""/.test(foot) && /data-block-delete=""/.test(foot) && /data-block-remove-cancel=""/.test(foot) && /Off the page, back any time/.test(foot) && /Gone for good/.test(foot))
    check("Escape cancels, and focus goes to the first choice", /e\.key === "Escape"/.test(foot) && /firstChoiceRef\.current\?\.focus/.test(foot))
    check("red only where it means delete, not the whole row", /text-\[#b42318\]/.test(foot) && !/border-red-200|text-amber-600/.test(foot))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Choose icon and the thumbnail sheet")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("one width for both views, no transition-all re-centring it", /max-w-\[480px\] sm:max-w-\[480px\]/.test(tab) && !/sm:max-w-\[572px\]/.test(tab) && !/overflow-hidden mx-auto transition-all duration-200 flex flex-col/.test(tab))
    check("the height glides between the views on a computer", /<ThumbnailViews glide=\{!isMobileModalViewport\}>/.test(tab) && /export function AutoHeight/.test(reveal) && /new ResizeObserver/.test(reveal))
    check("each view slides a little from its own side", /slide-in-from-left-3/.test(tab) && /slide-in-from-right-3/.test(tab))
    check("the choices are Add block's rows, no blue tile or red outline", /className=\{THUMB_ROW\}/.test(tab) && !/bg-blue-50 flex items-center justify-center/.test(tab) && !/border border-red-200 text-red-600/.test(tab))
    check("the chosen icon has a check in its corner, the grid six across on a computer", /data-icon-check=""/.test(library) && /cols=\{phone \? 5 : 6\}/.test(library))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Add social link on a computer, and every dialog's open and close")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("one height, so a platform's field does not snap the dialog", /h-\[min\(580px,85vh\)\]/.test(tab) && !/max-w-md rounded-2xl max-h-\[85vh\]/.test(tab))
    check("Back returns to the list, the field slides in", /data-social-back=""/.test(tab) && /key=\{selectedSocial\}[^>]*slide-in-from-right-3/.test(tab))
    check("the search is Add block's", /data-social-search=""/.test(tab) && /placeholder=\{tt\("Search platforms"\)\}/.test(tab))
    check("the dialog opens on iOS's curve from 97% and closes quicker on an ease in", /data-\[state=open\]:zoom-in-97/.test(sheetDialog) && /data-\[state=open\]:duration-\[260ms\]/.test(sheetDialog) && /data-\[state=closed\]:duration-150/.test(sheetDialog) && /data-\[state=open\]:ease-\[cubic-bezier\(0\.32,0\.72,0,1\)\]/.test(sheetDialog))
    check("the dialog's own zoom is off, not stacked under it", /disableDefaultAnimations disableOverlayDefaultAnimations=\{false\} className=\{cn\(SHEET_DIALOG_MOTION, className\)\}/.test(sheetDialog))
    check("the phone still gets the shared sheet", /<BottomSheet\b/.test(sheetDialog))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The sheets: the finger, and now a mouse or a pen")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const c = code(sheet)
    check("the finger is still native, non passive where it must be, and never React state", /addEventListener\("touchmove", onMove, \{ passive: false \}\)/.test(c) && /addEventListener\("touchstart", onStart, \{ passive: true \}\)/.test(c))
    check("a mouse or a pen drags from the handle by pointer events, captured", /addEventListener\("pointerdown", onPointerDown\)/.test(c) && /e\.pointerType === "touch"/.test(c) && /setPointerCapture\(e\.pointerId\)/.test(c) && /closest\?\.\("\[data-sheet-handle\]"\)/.test(c))
    check("both releases settle by the same arithmetic (speed, snap, rubber band)", (c.match(/settle\(/g) ?? []).length >= 3 && /-rubberBand\(-next, PULL_CAP\)/.test(c) && /releaseVelocity\(samplesRef\.current, eventTime\(e\)\)/.test(c))
    const drag = c.slice(c.indexOf("const onPointerMove"), c.indexOf("const onPointerEnd"))
    check("a pointer's move writes the panel and nothing renders", /paint\(\)/.test(drag) && !/set[A-Z]\w*\(/.test(drag))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Add block: the grey tiles again")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /* Changed on purpose (round 41): the owner asked for the round 40 tints and the chips' dots to go. */
/* Changed on purpose (round AL): the owner, "I don't like that they're light gray. You can make them more colour ... for the apps that actually are companies, just use their original icon": each entry is a round tile of its own colour (block-icons RoundTile), a company's mark on its own colour; the blocks list keeps the grey tile. */
    check("the tiles are round, each in its entry's own colour, no tint", /<RoundTile color=\{fill\} ink=\{ink\} size=\{size\}/.test(picker) && !/tint/.test(code(icons)))
    check("the chips carry no dot", !/data-pill-dot/.test(pills) && !/dot:/.test(code(picker)))
    /* Changed on purpose (round AL): a company's mark sits on its own colour; a mark of several colours (Google Maps) and a connected tool's stay on white. */
    check("a mark of several colours keeps them, on white", /isMulticolorMark\(key\)/.test(picker) && /<RoundTile color="#ffffff" ink="#1a1a2e" size=\{size\} style=\{HAIRLINE\}>/.test(picker))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Block settings: one choice, not two switches")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("YouTube, Spotify and Apple Music choose their mode with one list", (tab.match(/<ModeChoice/g) ?? []).length === 3 && /role="radiogroup"/.test(kit) && /role="radio"/.test(kit) && /aria-checked=\{on\}/.test(kit))
    check("the switches that acted as a choice are gone", !/<Toggle label=\{mode\.label\}/.test(tab))
    check("the open block is the app's card, its settings on a light wash", /data-block-settings=""/.test(tab) && !/ring-1 ring-gray-400 border-gray-300/.test(tab))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The product block: the picker, and its two edit links")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("a card, not a dropdown, and Change opens the list", /<ProductPicker/.test(tab) && !/Select a product\.\.\./.test(tab) && /tt\("Change"\)/.test(productPicker) && /<SheetDialog/.test(productPicker))
    check("each row a picture, name and price, the chosen one checked, as options", /role="listbox"/.test(productPicker) && /role="option"/.test(productPicker) && /aria-selected=\{on\}/.test(productPicker))
    check("a phone's sheet closes first and the choice lands after", /data-sheet-close=\{phone \? "" : undefined\}/.test(productPicker) && /onClosed: \(\) => \{/.test(productPicker))
    check("a search once there are more than six", /const SEARCH_FROM = 6/.test(productPicker) && /data-product-picker-search=""/.test(productPicker))
    check("the edit links: two equal keys, the arrow eased by translate", /grid grid-cols-2 gap-2" data-product-edit-links=""/.test(productEditor) && /transition-\[translate,color\]/.test(productEditor) && /data-edit-product=""/.test(productEditor) && /data-edit-product-page=""/.test(productEditor))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Scheduling: the calendar, the zone, and the live page")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("6 PM in New York in winter is 23:00 UTC", isoFromWall("2026-12-04", 18, 0, "America/New_York") === "2026-12-04T23:00:00.000Z")
    check("6 PM in New York in summer is 22:00 UTC", isoFromWall("2026-07-04", 18, 0, "America/New_York") === "2026-07-04T22:00:00.000Z")
    check("9 AM in Bucharest after the clocks went back is 07:00 UTC", isoFromWall("2026-10-26", 9, 0, "Europe/Bucharest") === "2026-10-26T07:00:00.000Z")
    check("and it reads back as the same wall time", (() => { const w = wallFromIso("2026-10-26T07:00:00.000Z", "Europe/Bucharest"); return !!w && w.ymd === "2026-10-26" && w.hour === 9 && w.minute === 0 })())
    const start = isoFromWall("2026-11-06", 18, 0, "America/Los_Angeles")
    const end = isoFromWall("2026-11-06", 20, 0, "America/Los_Angeles")
    const block = { schedule: { start_at: start, end_at: end } }
    const t0 = Date.parse(start)
    check("off a second before it starts, on at the moment", !isScheduledNow(block, t0 - 1000) && isScheduledNow(block, t0))
    check("on a second before it ends, off at the moment", isScheduledNow(block, Date.parse(end) - 1000) && !isScheduledNow(block, Date.parse(end)))
    const blocks = [{ id: "a", enabled: true, schedule: block.schedule }, { id: "b", enabled: true }, { id: "c", schedule: { end_at: "not a date" } }]
    check("the live page's blocks leave it out until it starts", drawnBlocks(blocks, {}, t0 - 1000).map((b) => b.id).join() === "b,c" && drawnBlocks(blocks, {}, t0).map((b) => b.id).join() === "a,b,c")
    check("the next change is its start, then its end, then none", nextScheduleChange(blocks, t0 - 60_000) === t0 && nextScheduleChange(blocks, t0) === Date.parse(end) && nextScheduleChange(blocks, Date.parse(end)) === null)
    check("the page waits until a little after it, never for days", scheduleWait(t0, t0 - 60_000) === 60_000 + SCHEDULE_SLACK_MS && scheduleWait(t0 + 30 * 86_400_000, t0) === SCHEDULE_WAIT_CAP_MS && scheduleWait(null, t0) === null)
    check("the route tells the page when, from the same blocks it drew", /<ScheduleRefresh at=\{nextScheduleChange\(\(onepage\.published_blocks \|\| onepage\.draft_blocks \|\| \[\]\) as unknown\[\], Date\.now\(\)\)\} \/>/.test(route) && /router\.refresh\(\)/.test(refresh) && /visibilitychange/.test(refresh))
    const lBlock = nextConfig.match(/source: '\/l\/:slug\*',[\s\S]{0,200}?\]/)?.[0] ?? ""
    check("/l/ is no longer held by a shared cache for fifteen minutes", !!lBlock && !/s-maxage/.test(lBlock) && /private/.test(lBlock))
    check("the row's day is the day in the picker's zone", scheduleLabel({ schedule: { start_at: "2026-11-07T03:30:00.000Z" } }, Date.parse("2026-11-01T00:00:00Z"), "America/Los_Angeles")?.text === "Starts Nov 6" && scheduleLabel({ schedule: { start_at: "2026-11-07T03:30:00.000Z" } }, Date.parse("2026-11-01T00:00:00Z"), "Europe/Bucharest")?.text === "Starts Nov 7")
    check("the calendar is smaller: 40px days on a phone, 34px on a computer, a 292px popover", /compact \? "h-10 w-10 text-\[15px\]" : "h-\[34px\] w-\[34px\] text-\[13px\]"/.test(dateField) && /w-\[292px\]/.test(dateField))
    check("the phone sheet says what it is changing, and a month slides in from its side", /data-datetime-summary=""/.test(dateField) && /slide-in-from-right-2/.test(dateField) && /slide-in-from-left-2/.test(dateField) && /key=\{`\$\{view\.y\}-\$\{view\.m\}`\}/.test(dateField))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Sensitive content asks first, a player included")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("a frame inside a marked box takes no press until yes", /\[data-sensitive-label\]:not\(\[data-sensitive-ok\]\) iframe\{pointer-events:none\}/.test(extra))
    check("a press on the frame asks, and Continue allows that box", /const onFrame = Array\.from\(box\.querySelectorAll\("iframe"\)\)/.test(extra) && /box\.setAttribute\("data-sensitive-ok", ""\)/.test(extra))
    check("a link or button is still pressed again after yes", /letThrough = target\s*\n\s*target\.click\(\)/.test(extra))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The file an email signup gives")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const file = "https://x.supabase.co/storage/v1/object/public/lead-form-files-v2/c1/digital-products/1.pdf"
    const blocks = [
      { id: "e1", type: "email_capture", data: { enable_digital_product: true, digital_product_file_url: file, digital_product_title: "Guide" } },
      { id: "g1", type: "group", data: { children: [{ id: "e2", type: "email_capture", data: { enable_digital_product: true, digital_product_file_url: file } }] } },
      { id: "e3", type: "email_capture", data: { enable_digital_product: false, digital_product_file_url: file } },
      { id: "e4", type: "email_capture", data: { enable_digital_product: true, digital_product_file_url: "" } },
      { id: "e5", type: "email_capture", data: { enable_digital_product: true, digital_product_file_url: "javascript:alert(1)" } },
    ]
    check("on with a file: that file and its name", signupFileFor(blocks, "e1").url === file && signupFileFor(blocks, "e1").title === "Guide")
    check("inside a group too", signupFileFor(blocks, "e2").url === file)
    check("off, or on with no file, gives nothing", signupFileFor(blocks, "e3").url === null && signupFileFor(blocks, "e4").url === null && signupFileFor(blocks, "e4").found)
    check("an address that does not open is never handed back", signupFileFor(blocks, "e5").url === null && openableFileUrl("/media/a.pdf") === "/media/a.pdf" && openableFileUrl("http://x") === null)
    check("a block that is not on the page is not found", !signupFileFor(blocks, "nope").found && !signupFileFor(null, "e1").found)
    check("the route reads the published block, not the request", /signupFileFor\(\(onepage as \{ published_blocks\?: unknown \}\)\.published_blocks/.test(leads) && /published_blocks, draft_blocks/.test(leads))
    check("a page's own file is uploaded where a visitor can open it", /if \(!isDigitalFile\) try \{/.test(tab) && /if \(!url\) throw new Error\(tt\("Upload failed\. Try again\."\)\)/.test(tab))
    check("on with no file says so in the editor", /data-signup-file-missing=""/.test(tab))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Motion and words")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const fresh = [
      "components/onepage/reveal.tsx",
      "components/onepage/block-remove.tsx",
      "components/onepage/block-settings-kit.tsx",
      "components/onepage/product-picker.tsx",
      "components/onepage/schedule-refresh.tsx",
      "lib/onepage/schedule-clock.ts",
      "lib/onepage/signup-file.ts",
    ]
    const sources = fresh.map((f) => [f, read(f)] as const)
    const moving = sources.filter(([, s]) => /transition-transform|transition-all|transition:\s*transform/.test(code(s)))
    check("no new file transitions transform or everything", moving.length === 0, moving.map(([f]) => f).join(", "))
    const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform your)\b/i
    const words = sources.filter(([, s]) => banned.test(s) || /—/.test(s))
    check("no AI words and no em dashes in the new files", words.length === 0, words.map(([f]) => f).join(", "))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
