/**
 * ROUND AW: the Help Center's contact form, the editor's sidebar that went
 * dead until a reload, and the canvas switch that splashed the other layout.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CONTACT_REASONS, SUPPORT_INBOX, contactProblems, reasonLabel } from "@/lib/help/contact"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail === "" ? "" : `  ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nContact support, in the Help Center\n")
const good = { reason: "orders", name: "Ana", email: "ana@example.com", link: "", message: "My payout has not arrived since Monday." }
check("a complete message passes", contactProblems(good) === null)
check("it needs a reason, an email to reply to and a real message", (() => {
  const p = contactProblems({ ...good, reason: "", email: "nope", message: "help" }) ?? {}
  return !!p.reason && !!p.email && !!p.message
})())
check("eight reasons, each with a short hint", CONTACT_REASONS.length === 8 && CONTACT_REASONS.every((r) => r.label && r.hint))
check("an unknown reason reads as Something else", reasonLabel("x") === "Something else")
check("it goes to team@storelib.com", SUPPORT_INBOX === "team@storelib.com")
const route = read("app/api/help/contact/route.ts")
check("the route sends to the team with the sender as Reply-To", /to: SUPPORT_INBOX/.test(route) && /replyTo: email/.test(route))
check("  limited per address and per email, and a bot's hidden field is answered without sending", /bucket: "help-contact"/.test(route) && /body\.company\.trim\(\)\) return NextResponse\.json\(\{ ok: true \}\)/.test(route))
check("  drawn in the shared layout, which escapes everything typed", /platformEmail\(\{/.test(route) && /quote: \{ text: message/.test(route) && !/<div style=/.test(route))
const form = read("components/help/contact-form.tsx")
check("the form posts to its own origin, so it works on help.storelib.com", /fetch\("\/api\/help\/contact"/.test(form))
check("  offers articles that might answer it while the message is written", /searchHelp\(query, 3/.test(form) && /data-contact-suggestions/.test(form))
check("  fills the reply address for someone signed in", /mainSiteUrl\("\/api\/help\/me"\)/.test(form))
check("the page is help.storelib.com/contact", /canonical: publicHelpUrl\("\/contact"\)/.test(read("app/help/contact/page.tsx")))
check("the header and Still need help open it, not a mail app", /helpHref\("\/help\/contact"\)/.test(read("components/help/help-header.tsx")) && /publicHelpUrl\("\/contact"\)/.test(read("components/help/help-parts.tsx")) && !/mailto:/.test(read("components/help/help-header.tsx")))

console.log("\nThe sidebar that went dead until a reload\n")
const stuck = read("lib/website-builder/stuck-layer.ts")
check("a kept sheet at rest, an inert or closed layer is not an open modal", /const NOT_AT_REST = ':not\(\[data-app-sheet-rest\]\)/.test(stuck) && /:not\(\[inert\]\)/.test(stuck) && /`\[aria-modal="true"\]\$\{NOT_AT_REST\}`/.test(stuck))

console.log("\nThe size switch\n")
const editor = read("app/website-builder/editor/[installId]/page.tsx")
/* Changed on purpose (round AX, the owner: "it disappears, it fades"): no fade out any more, one view transition instead (editor-y1 pins it). */
check("the page never fades out or sits out the glide", !/CANVAS_FADE_OUT_MS|content-visibility", "hidden"/.test(editor) && /startViewTransition/.test(editor))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
