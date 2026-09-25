/**
 * The Emails list screen, rebuilt in the Orders page's language
 * (app/app/emails/emails-home.tsx). scripts/check-emails-page.mjs measures it
 * in a browser; this holds the structure that measurement depends on.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const page = read("app/app/emails/page.tsx")
const home = read("app/app/emails/emails-home.tsx")

console.log("\nThe Emails screen")
check("the page draws the list with EmailsHome and writes in the composer", /<EmailsHome\n/.test(page) && /<EmailComposer/.test(page))
check("a send that is not simply done says so in the Sent list", /function SendBadge/.test(home) && /Partly sent/.test(home) && /Not sent/.test(home))
check("the old pill tabs, stat boxes and flow cards are gone", !/Tabs - Pill Style/.test(page) && !/grid grid-cols-2 sm:grid-cols-4 gap-4/.test(page) && !/rounded-full transition-all whitespace-nowrap/.test(page))
check("it is drawn with the Orders page's own parts", /from "\.\.\/orders\/order-parts"/.test(home) && /<PaneBar /.test(home) && /StatusBadge/.test(home))
check("the views are tabs in the card's toolbar", /role="tablist" aria-label="Views"/.test(home) && /flex h-12 items-center gap-2 border-b/.test(home))
check("the first column stays put on a phone", /const sticky = "sticky left-0/.test(home))
check("rows are dense", /const td = "h-12 /.test(home))
check("fifty to a page", /const PAGE_SIZE = 50/.test(home))
check("a row's actions are the shared menu: a dropdown on a desktop, a sheet on a phone", (home.match(/<ResponsiveActionMenu/g) ?? []).length === 3)
check("and its trigger takes the menu's handlers, or the desktop dropdown never opens",
  /trigger=\{<RowMenuButton /.test(home) && /export const RowMenuButton = React\.forwardRef<HTMLButtonElement/.test(read("app/app/orders/order-parts.tsx")) && /\{\.\.\.rest\}/.test(read("app/app/orders/order-parts.tsx")))
check("a search box is 16px on a phone, so iOS does not zoom", /text-\[16px\][^"]*sm:text-\[13px\]/.test(home))
check("a resend reads Sent again, not a raw (Resend) suffix", /Sent again/.test(home))
check("no em dash in what it says", !home.replace(/\/\*[\s\S]*?\*\//g, "").includes("—"))

/*
 * Depth at the cut. "Bscribed" ran flat into the frozen Email column with
 * nothing to say the row carried on under it. Every table in /app that
 * scrolls sideways under a frozen column is framed by the one ScrollEdge,
 * and marks its frozen column's cells, header included, so the shadow is one
 * line from the header to the last row. scripts/check-scroll-edge.mjs
 * measures the line, its fade and the cells' opacity in a browser.
 */
console.log("\nTables that scroll sideways under a frozen column")
{
  const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const edge = code("components/app/scroll-edge.tsx")
  const css = read("app/globals.css")
  check("the frame flips two attributes from a passive listener, once a frame, only when they change, and re-renders nothing",
    /addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(edge) && /raf = requestAnimationFrame\(/.test(edge)
      && /if \(frame\.dataset\.start !== start\) frame\.dataset\.start = start/.test(edge) && !/useState/.test(edge))
  check("where the frozen column ends is measured once, from its marked cells, and handed to the CSS as one number",
    /querySelectorAll<HTMLElement>\("\[data-scroll-edge\]"\)/.test(edge) && /setProperty\("--scroll-edge-x"/.test(edge) && /new ResizeObserver/.test(edge))
  check("the shadow and the right shade are the frame's own pseudo elements, over the table, faded on opacity alone, stopped for reduced motion",
    /\.scroll-edge::before,\s*\.scroll-edge::after \{[^}]*pointer-events: none;[^}]*opacity: 0;\s*transition: opacity 160ms ease-out;/.test(css)
      && /\.scroll-edge::before \{\s*left: var\(--scroll-edge-x, 0px\);\s*top: var\(--scroll-edge-top, 0px\);\s*height: var\(--scroll-edge-h, 100%\);/.test(css)
      && /\.scroll-edge\[data-start="true"\]::before,\s*\.scroll-edge\[data-end="true"\]::after \{\s*opacity: 1;/.test(css)
      && /@media \(prefers-reduced-motion: reduce\) \{\s*\.scroll-edge::before,\s*\.scroll-edge::after \{\s*transition: none;/.test(css))
  check("Emails' three tables use it, and mark the frozen column in the header and in every row",
    (home.match(/<ScrollEdge>/g) ?? []).length === 3 && (home.match(/<th data-scroll-edge="" className=\{cn\(th, stickyHead\)\}>/g) ?? []).length === 3
      && (home.match(/<td data-scroll-edge="" className=\{cn\(td, sticky/g) ?? []).length === 3)
  check("the frozen cells are the row's own opaque colour, hover included", /const sticky = "sticky left-0 z-\[1\] bg-white group-hover:bg-\[#fafbfb\]"/.test(home) && /const stickyHead = "sticky left-0 z-\[1\] bg-\[#fafbfb\]"/.test(home))
  const flow = read("app/app/emails/flow/[id]/builder.tsx")
  check("so does an automation's runs table", /<ScrollEdge>/.test(flow) && (flow.match(/data-scroll-edge="" className="sticky left-0 z-\[1\]/g) ?? []).length === 2)
  const orders = read("app/app/orders/orders-list.tsx")
  check("and the orders list, which had its own copy of the listener and the shadow",
    /<ScrollEdge className="orders-scroller">/.test(orders) && !/scrollerRef|orders-edge|data-overflow/.test(orders) && !/orders-edge|orders-scroller\[/.test(css))
  const walk = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith(".tsx") ? [`${dir}/${e.name}`] : [])
  const offenders = [...walk("app/app"), ...walk("components/app")]
    .filter((f) => /<(td|th)\b[^>]*(sticky left-|orders-sticky)/.test(read(f)) && !/<ScrollEdge\b/.test(read(f)))
  check("no other table in /app freezes a column without it", offenders.length === 0, offenders.join(", "))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
