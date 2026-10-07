/**
 * ===========================================================================
 *  WHAT A LINK FIELD SAVES FROM WHAT WAS TYPED INTO IT
 * ===========================================================================
 * The link field is the address itself now: there is no separate "any
 * address" box under the list of pages. So what somebody types or pastes is
 * the link, and lib/website-builder/link-address.ts decides what is saved.
 * These are the forms people actually type, and the ones that must never be
 * saved as a link on a creator's site at all.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { linkKind, normalizeLinkAddress } from "../lib/website-builder/link-address"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? `: ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function saves(input: string, want: string) {
  const r = normalizeLinkAddress(input)
  check(`"${input}" saves as "${want}"`, r.ok === true && r.href === want, JSON.stringify(r))
}
function refuses(input: string) {
  const r = normalizeLinkAddress(input)
  check(`"${input.replace(/[\t\n]/g, " ")}" is refused, with a reason`, r.ok === false && r.reason.length > 10, JSON.stringify(r))
}

function main() {
  console.log("\nThe site's own pages and places are kept as they are")
  saves("/about", "/about")
  saves("/products/a-bottle", "/products/a-bottle")
  saves("#faq", "#faq")
  saves("?q=shoes", "?q=shoes")
  saves("  /contact  ", "/contact")
  saves("", "")

  console.log("\nAn address typed the way it is said gets what a browser needs")
  saves("shop.example.com/sale", "https://shop.example.com/sale")
  saves("www.example.co.uk", "https://www.example.co.uk")
  saves("//cdn.example.com/x.pdf", "https://cdn.example.com/x.pdf")
  saves("localhost:3000/preview", "https://localhost:3000/preview")
  saves("https://example.com", "https://example.com")
  saves("HTTPS://Example.com/Path?x=1#top", "https://Example.com/Path?x=1#top")
  saves("http://example.com", "http://example.com")
  saves("hello@shop.com", "mailto:hello@shop.com")
  saves("mailto:hello@shop.com", "mailto:hello@shop.com")
  saves("+40 721 000 000", "tel:+40721000000")
  saves("tel:+40 (721) 000-000", "tel:+40721000000")

  console.log("\nWhat can never be a link")
  refuses("javascript:alert(1)")
  refuses("JavaScript:alert(1)")
  refuses("java\tscript:alert(1)")
  refuses(" javascript:alert(document.cookie)")
  refuses("data:text/html,<script>alert(1)</script>")
  refuses("vbscript:msgbox(1)")
  refuses("file:///etc/passwd")
  refuses("blob:https://example.com/1")

  console.log("\nAnd what is not an address yet")
  refuses("hero")
  refuses("our new shop")
  refuses("https://")
  refuses("http://nodot")
  refuses("mailto:nobody")
  refuses("tel:call me")
  refuses("/about us")

  console.log("\nThe mark beside it")
  check("a web address", linkKind("https://example.com") === "web")
  check("an email", linkKind("mailto:a@b.co") === "email")
  check("a phone", linkKind("tel:+4072") === "phone")
  check("the site's own", linkKind("/about") === "site" && linkKind("#faq") === "site")
  check("nothing", linkKind("") === "empty")

  console.log("\nThe field uses it, and the list under it has no address box")
  const picker = read("components/website-builder/link-picker.tsx")
  check("the field saves what the rules say, never the raw text", /const r = normalizeLinkAddress\(text\)/.test(picker) && /if \(r\.ok === false\) \{[\s\S]{0,240}setError\(r\.reason\)\s*return/.test(picker))
  check("a picked page is saved as its path, as before", /if \(t\.href !== value\) onChange\(t\.href\)/.test(picker))
  check("arrows, Enter and Escape", /e\.key === "ArrowDown" \|\| e\.key === "ArrowUp"/.test(picker) && /e\.key === "Enter"/.test(picker) && /e\.key === "Escape"/.test(picker))
  check("a combobox a screen reader can follow", /role="combobox"/.test(picker) && /role="listbox"/.test(picker) && /role="option"/.test(picker) && /aria-activedescendant=/.test(picker))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
