/**
 * Round 56 (r56-a): the frame every generated website gets, in both engines.
 *
 * scripts/check-ai-site-chrome-r56.mjs renders the scripted evaluation's
 * sites (agent and native) and every starting template with the live page's
 * own React tree in Chromium at 360 to 1280 px and measures the header, the
 * phone menu, the selectors, the cart and search panels, tap targets and
 * contrast. These are the unit level pins for what it found and what was
 * changed:
 *
 *   1. The native header's button: the starting website wrote its preset's
 *      indigo (#6366f1) and "Shop now" into every header. The native engine
 *      now clears the colour (the header's scheme, the site's palette) and
 *      writes the site's main action: Shop now where it sells, its booking or
 *      contact page where it does not, no button where it has neither. The
 *      renderer keeps the label readable on the fill (4.5:1) and ignores the
 *      leftover indigo on a site whose primary is something else.
 *   2. Footer links (native and kit) take a finger: 44 px.
 *   3. The ebook section's tilted cover fits a phone column.
 *   4. The chrome kit's header and footer start clean: no running notice
 *      line, no frosted phone bar, no pill chips or round icon buttons, one
 *      display size, drawers on the dynamic viewport and clear of the notch.
 *   5. A popover drawer (the kit's menu, any header written that way) keeps
 *      the page still and the keyboard inside, as the built-in drawer does.
 *   6. When the harness has been run here, its last results show no failure.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { legibleLabel, ratioOf } from "../lib/website-builder/button-legible"
import { chromeOps, headerAction, type SiteState } from "../lib/website-builder/ai-site/apply"
import { SITE_TEMPLATES } from "../lib/storelib-ai/templates"
import { evaluateSlop } from "../lib/ai-builder/slop"
import type { SitePlan } from "../lib/website-builder/agent/site-plan"
import type { SectionInstance } from "../lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── 1. the header's button ─────────────────────────────────────────────── */

console.log("\nthe header button's label reads on its fill")
{
  /* The scripted fitness site: a lime accent with an off white label (1.1:1). */
  const label = legibleLabel("#d7ff3a", "#f2f2ef", ["#f2f2ef", "#141414", "#141414"])
  check("lime fill, off white label: the palette's dark text instead", label === "#141414" && (ratioOf(label, "#d7ff3a") ?? 0) >= 4.5, label)
  check("a pair that reads is kept", legibleLabel("#2443d1", "#ffffff", ["#000000"]) === "#ffffff")
  check("no palette colour reads: the better of black and white", (ratioOf(legibleLabel("#777777", "#888888", ["#999999"]), "#777777") ?? 0) > 3.5)
  check("a fill that is not a plain colour keeps its label", legibleLabel("var(--x)", "#fff") === "#fff")
}

console.log("\nthe header button is the site's main action")
{
  const page = (key: string, title: string) => ({ key, title, purpose: "", sections: [] })
  const plan = (pages: ReturnType<typeof page>[]) => ({ brand: { name: "Halden", tagline: "" }, pages: [page("home", "Home"), ...pages] }) as unknown as SitePlan
  const header = { id: "header-1", type: "header", settings: { show_cta_button: true, cta_text: "Shop now", cta_url: "/products", cta_color: "#6366f1", cta_text_color: "#ffffff" }, blocks: [] } as unknown as SectionInstance
  const site = (keys: string[]): SiteState => ({ settings: {}, pages: Object.fromEntries([["home", [header]], ...keys.map((k) => [k, []])]) })
  check("a shop: Shop now to /products", JSON.stringify(headerAction(plan([page("about", "About")]), site(["about"]), true)) === JSON.stringify({ label: "Shop now", url: "/products" }))
  check("a photographer with a booking page: its title, to it", JSON.stringify(headerAction(plan([page("work", "Work"), page("book", "Book a shoot")]), site(["work", "book"]), false)) === JSON.stringify({ label: "Book a shoot", url: "/book" }))
  check("a consultant with a contact page: Get in touch, to it", headerAction(plan([page("services", "Services"), page("contact", "Contact")]), site(["services", "contact"]), false)?.url === "/contact")
  check("neither: no button", headerAction(plan([page("about", "About")]), site(["about"]), false) === null)
  const withConversion = (conversion: string, pages: ReturnType<typeof page>[]) => ({ ...plan(pages), conversion }) as SitePlan
  const consult = headerAction(withConversion("Book an intro call", [page("services", "Services"), page("contact", "Contact")]), site(["services", "contact"]), true)
  check("a consultant whose store also has products: its main action, to its contact page, not Shop now", JSON.stringify(consult) === JSON.stringify({ label: "Book an intro call", url: "/contact" }), consult)
  const photo = headerAction(withConversion("Commission a story", [page("work", "Work"), page("contact", "Contact")]), site(["work", "contact"]), true)
  check("a photographer with a few prints: Commission a story, to contact", photo?.label === "Commission a story" && photo.url === "/contact", photo)
  const shopDrop = headerAction(withConversion("Shop the drop", [page("about", "About")]), site(["about"]), true)
  check("a clothing brand whose main action is buying: its words, to the shop", JSON.stringify(shopDrop) === JSON.stringify({ label: "Shop the drop", url: "/products" }), shopDrop)
  check("buying with nothing published: no Shop button that leads to an empty shop", headerAction(withConversion("Shop the drop", [page("about", "About")]), site(["about"]), false) === null)
  const long = headerAction(withConversion("Book a free consultation", [page("contact", "Contact")]), site(["contact"]), false)
  check("words too long for the button: the page's own short words", long?.label === "Get in touch" && long.url === "/contact", long)
  const ops = chromeOps(site(["about"]), plan([page("about", "About")]), undefined, { shop: false, credits: false })
  const set = ops.find((o) => o.kind === "update_section" && o.id === "header-1") as { settings: Record<string, unknown> } | undefined
  check("chromeOps: no action, the button off and its indigo cleared", set?.settings.show_cta_button === false && set?.settings.cta_color === "" && set?.settings.cta_text_color === "", set?.settings)
  const credits = chromeOps(site(["about"]), plan([page("about", "About")]), undefined, { shop: false, credits: true })
  const cset = credits.find((o) => o.kind === "update_section" && o.id === "header-1") as { settings: Record<string, unknown> } | undefined
  check("chromeOps for the credits page leaves the button as it is", cset?.settings.show_cta_button === undefined && cset?.settings.cta_color === undefined)
  const header2 = read("components/website-builder/sections/renderers/HeaderSection.tsx")
  check("HeaderSection: the label is made readable (legibleHeaderButton)", /const ctaButton = legibleHeaderButton\(/.test(header2))
  check("HeaderSection: the starting website's leftover indigo gives way to the site's scheme", /STARTER_INDIGO = "#6366f1"/.test(header2) && /staleIndigo \? \{\}/.test(header2))
}

/* ── 2. footer links ───────────────────────────────────────────────────── */

console.log("\nfooter links take a finger")
{
  const footer = read("components/website-builder/sections/renderers/FooterSection.tsx")
  check("native footer: column, loose and policy links are at least 44px", (footer.match(/min-h-11 min-w-11/g) ?? []).length >= 3)
  check("native footer: Cookie preferences 44px tall", /inline-flex min-h-11 cursor-pointer[^"]*"\s*\n?\s*style=\{\{ color: textColor \}\}\s*\n?\s*data-cookie-preferences/.test(footer))
  const kit = read("lib/storelib-ai/templates/kit/chrome.ts")
  check("kit footer: column links 44px", /\.ft__col li a \{[^}]*min-height: 44px; min-width: 44px;/.test(kit))
  check("kit footer: bottom links 44px", /\.ft__base-links a \{[^}]*min-height: 44px; min-width: 44px;/.test(kit))
}

/* ── 3. ebook cover ────────────────────────────────────────────────────── */

console.log("\nthe ebook's tilted cover fits a phone")
{
  const ebook = read("components/website-builder/sections/renderers/EbookShowcaseSection.tsx")
  check("a tilted cover takes 84% of its column", /tilted \? "w-\[84%\]" : "w-full"/.test(ebook))
  /* A 2:3 cover rotated 6 degrees: outline width w(cos 6 + 1.5 sin 6). */
  const outline = 0.84 * (Math.cos(Math.PI / 30) + 1.5 * Math.sin(Math.PI / 30))
  check("  its rotated outline is narrower than the column", outline < 1, outline.toFixed(3))
}

/* ── 4. the kit's frame starts clean ───────────────────────────────────── */

console.log("\nthe chrome kit's header and footer")
{
  const kit = read("lib/storelib-ai/templates/kit/chrome.ts")
  const parts = read("lib/storelib-ai/templates/kit/chrome-parts.ts")
  check("no running notice line (hd-run, run_notices, notice_speed)", !/hd-run|run_notices|notice_speed/.test(kit))
  check("no frosted glass", !/backdrop-filter/.test(kit + parts))
  check("no pill chip: the locale chip and icon buttons are not 999px", !/-loc__chip \{[^}]*999px/.test(parts) && !/-ib \{[^}]*999px/.test(parts) && !/-badge \{[^}]*999px/.test(parts))
  check("one display size for the menu, the mega panel and the search field", (kit.match(/clamp\(1\.75rem, 1rem \+ 3vw, 3rem\)/g) ?? []).length === 3, (kit.match(/clamp\([^)]*\)/g) ?? []))
  check("drawers on the dynamic viewport", /\.hd__drawer--full \{[^}]*100dvh/.test(kit) && /\.hd__drawer--side \{[^}]*100dvh/.test(kit) && /\.hd__drawer--sheet \{[^}]*90dvh/.test(kit))
  check("drawer, search and cart clear of the notch and home bar", /\.hd__drawer \{[^}]*env\(safe-area-inset-top\)[^}]*env\(safe-area-inset-bottom\)/.test(kit) && /\.hd__search-panel \{[^}]*env\(safe-area-inset-top\)/.test(kit) && /\.hd__cart \{[^}]*env\(safe-area-inset-bottom\)/.test(kit))
  check("the language and currency panel never taller than the screen", /-loc__panel \{[^}]*max-height: calc\(100dvh - 24px\); overflow-y: auto;/.test(parts))
  /* Every starting template's frame, as the finish check scores it (lib/ai-builder/slop.ts). Before: 4 warnings on six of them. */
  const frames: Record<string, number> = {}
  for (const t of SITE_TEMPLATES) {
    const home = t.pages.find((p) => p.key === "home") ?? t.pages[0]
    const types = new Set((home?.sections ?? []).filter((s) => s.group === "header" || s.group === "footer").map((s) => s.type))
    const files = Object.entries(t.files).filter(([p]) => types.has(p.replace(/^sections\//, "").replace(/\.storelib$/, ""))).map(([path, content]) => ({ path, content }))
    const r = evaluateSlop({ sources: files })
    frames[t.id] = r.counts.warn + r.counts.error
    const rules = r.findings.filter((f) => f.severity !== "info").map((f) => f.rule)
    check(`${t.id}: its frame has no glass, pill, type-size or animation warning`, !rules.some((x) => ["glass", "pills", "typography", "animation"].includes(x)), rules)
  }
  check("every template's frame carries at most one AI look warning (was four on six)", Object.values(frames).every((n) => n <= 1), frames)
}

/* ── 5. a popover drawer behaves as a drawer ───────────────────────────── */

console.log("\na popover drawer")
{
  const hooks = read("components/website-builder/sections/site-chrome-hooks.tsx")
  check("its toggle is heard on the section", /scriptRoot\.addEventListener\("toggle", onToggle, true\)/.test(hooks))
  check("a large one locks the page and traps focus; a small one is left alone", /if \(open && drawerLike\(el\)\) setPopDrawer\(el\)/.test(hooks) && /popDrawer \? lockPageScroll\(inCanvas\)/.test(hooks) && /useFocusTrap\(!!popDrawer, popDrawerRef, !inCanvas\)/.test(hooks))
}

/* ── 6. the harness's last run ─────────────────────────────────────────── */

console.log("\nthe geometry harness")
{
  const last = join(process.cwd(), ".ai-site-chrome-r56-last.json")
  if (!existsSync(last)) console.log("  (not run here: node scripts/check-ai-site-chrome-r56.mjs writes .ai-site-chrome-r56-last.json)")
  else {
    const r = JSON.parse(readFileSync(last, "utf8")) as { failures: number; table: Record<string, { fail: number; sites: string[] }> }
    const failing = Object.entries(r.table).filter(([, v]) => v.fail > 0).map(([k, v]) => `${k}: ${v.sites.join(", ")}`)
    check("its last results show no failing check", r.failures === 0, failing.slice(0, 12))
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
