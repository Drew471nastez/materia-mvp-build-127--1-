/**
 * The Emails list screen, rebuilt in the Orders page's language
 * (app/app/emails/emails-home.tsx). scripts/check-emails-page.mjs measures it
 * in a browser; this holds the structure that measurement depends on.
 */
import { readFileSync } from "node:fs"
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
check("the page draws the list with EmailsHome and keeps the editors", /<EmailsHome\n/.test(page) && /<EmailEditor/.test(page))
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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
