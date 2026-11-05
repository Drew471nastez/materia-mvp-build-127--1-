/**
 * ROUND 43: THE NEWSLETTER SECTIONS AND AN INTEGRATION'S PAGE.
 *
 *   1  an integration's page settles in 4px and the list 2px, on the /app
 *      landing's 180ms and curve, with no hold before it moves (round 42's
 *      28px / 12px rise, held up to 650ms, read as a bump)
 *   2  every newsletter look has a control for each of its settings: the
 *      Storelib theme's two sections and the Popup's email box
 *   3  each says where its sign ups go: Emails › Subscribers, by the name the
 *      list gives the box, and a website's popup is its own name there
 *
 * Drawn and submitted in a browser by scripts/check-newsletter-sections.mjs
 * and scripts/check-newsletter-embed.mjs; the route against an in-memory
 * database by tests/newsletter-signup.test.ts.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { FORM_NAME, FORMS } from "@/lib/contacts/contact-source"
import { signupFormOf, SUBSCRIBERS_HREF } from "@/components/website-builder/editor/signup-destination-note"
import { LIST_IN_MS, LIST_SETTLE_PX, PAGE_IN_MS, PAGE_SETTLE_PX } from "@/components/app/settings/integrations-directory"
import { NAV_ENTER_MS } from "@/lib/ui/app-navigation"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${ok || detail === undefined ? "" : `\n          ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\n1  into an integration's page and back")
const dir = read("components/app/settings/integrations-directory.tsx")
check("a settle of 4px in, 2px back, the same on a phone and a computer", PAGE_SETTLE_PX === 4 && LIST_SETTLE_PX === 2 && !/PAGE_RISE_PHONE|LIST_SETTLE_PHONE/.test(dir))
check("on the /app landing's time and curve, the way back a little shorter", PAGE_IN_MS === NAV_ENTER_MS && LIST_IN_MS < PAGE_IN_MS && /easing: NAV_ENTER_EASE/.test(dir))
check("no hold before it moves", !/startWhenFramesFlow/.test(dir))

console.log("\n2  every setting has a control")
const ids = (type: string) => (SECTION_SCHEMAS[type]?.fields ?? []).map((f) => f.id)
const want: Record<string, string[]> = {
  newsletter: ["heading", "subheading", "placeholder", "button_text", "disclaimer", "success_message", "show_name_field", "name_placeholder", "layout", "form_layout", "align", "max_width", "bg_image", "padding_top", "padding_bottom", "min_height", "color_scheme"],
  promo_newsletter: ["heading", "subheading", "placeholder", "button_text", "note", "success", "show_name", "name_placeholder", "align", "form_layout", "max_width", "bg_image", "overlay", "padding_top", "padding_bottom", "min_height", "color_scheme"],
  popup: ["heading", "text", "placeholder", "button_text", "note", "success", "width", "delay", "color_scheme"],
}
for (const [type, fields] of Object.entries(want)) {
  const have = ids(type)
  const missing = fields.filter((f) => !have.includes(f))
  check(`${type}: ${fields.length} settings, each in the panel`, missing.length === 0, missing)
}
const pn = read("themes/default/sections/promo_newsletter.storelib")
check("promo_newsletter's thank you is the section's own, shown in place of the form", /data-storelib-success hidden>\{\{ settings\.success \}\}/.test(pn))
check("  its name box is the one the page sends as the name", /\{% if settings\.show_name %\}<input class="nl__input nl__input--name" type="text" name="name"/.test(pn))
check("  its button is never under 44px", /\.nl__go \{ flex: none; min-height: 44px; \}/.test(pn))
check("the Popup's sign ups are recorded as the popup's", /section\.type === "popup" \? "popup"/.test(read("components/website-builder/sections/StorelibSection.tsx")))

console.log("\n3  where sign ups go")
check("a website's popup is its own name in Subscribers", (FORMS as readonly string[]).includes("site_popup") && FORM_NAME.site_popup === "Popup" && /"popup" \? "site_popup"/.test(read("app/api/website-builder/subscribe/route.ts")))
check("each section names the box it is listed under", signupFormOf("promo_newsletter", {}) === "newsletter" && signupFormOf("newsletter", {}) === "newsletter" && signupFormOf("storelib-newsletter", { look: "bar" }) === "bar" && signupFormOf("storelib-newsletter", { look: "popup" }) === "site_popup" && signupFormOf("storelib-newsletter", { look: "inline" }) === "newsletter" && signupFormOf("popup", { content: "email" }) === "site_popup" && signupFormOf("popup", { content: "button" }) === null && signupFormOf("hero", {}) === null)
check("and links to Emails › Subscribers from its settings", SUBSCRIBERS_HREF === "/app/emails?tab=subscribers" && /<SignupDestinationNote type=\{section\.type\} settings=\{section\.settings\} \/>/.test(read("app/(storelib)/website-builder/editor/[installId]/page.tsx")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
