/**
 * The layouts a new email can start from (lib/email-campaigns/starters.ts),
 * and the email HTML they are sent as (lib/email-campaigns/template.ts):
 * every one is the composer's own blocks, saves and reads back as those
 * blocks, renders in the 600px table layout with every style inline, has no
 * frame round the logo, and says nothing in the words the house rules ban.
 */
import { STORE_LOGO_RADIUS } from "@/lib/brand/store-logo"
import { STARTERS, starterDraft, type StarterId } from "@/lib/email-campaigns/starters"
import { blockIssues, renderBlocks, storeBlocks, type Block } from "@/lib/email-campaigns/blocks"
import { readStoredBody } from "@/lib/email-campaigns/stored"
import { themeOf } from "@/lib/email-campaigns/brand"
import { buildEmail, emailText, personalizeHtml } from "@/lib/email-campaigns/template"
import { checkContent, byteLength } from "@/lib/email-campaigns/validate"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const ctx = { name: "Ana & Co", storeUrl: "https://storelib.com/ana" }
const brand = { name: "Ana & Co", logoUrl: "https://cdn.ana.shop/logo.png", storeUrl: "https://storelib.com/ana", accent: "#0f766e", address: "12 Main St, Springfield, IL 62701" }
const theme = themeOf(brand)
const BANNED = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b|—/i
const typeOf = (bs: Block[]) => bs.map((b) => b.type).join(",")

console.log("\nThe set")
check("five starters: a letter, an announcement, a new product, a newsletter and a sale", STARTERS.map((s) => s.id).join(",") === "letter,announcement,product,newsletter,sale")
check("each has a name, one line and a sketch", STARTERS.every((s) => s.name && s.line && s.line.length < 70 && s.sketch.length >= 3))
check("none of their words are the banned ones, and no em dash", STARTERS.every((s) => !BANNED.test(`${s.name} ${s.line}`)))

for (const s of STARTERS) {
  console.log(`\n${s.name}`)
  const a = starterDraft(s.id, ctx)
  const b = starterDraft(s.id, ctx)
  check("made of the composer's blocks", a.blocks.length > 0 && a.blocks.every((x) => ["rich", "button", "image", "product", "divider", "spacer"].includes(x.type)), typeOf(a.blocks))
  check("fresh block ids each time it is used", a.blocks.every((x, i) => x.id !== b.blocks[i].id) && new Set(a.blocks.map((x) => x.id)).size === a.blocks.length)
  const words = `${a.subject} ${a.previewText} ${a.blocks.map((x) => JSON.stringify(x)).join(" ")}`
  check("its words avoid the banned ones and em dashes", !BANNED.test(words), words.match(BANNED)?.[0])
  check("the store's name is escaped where it is written", !/Ana & Co</.test(a.blocks.filter((x) => x.type === "rich").map((x) => (x as { html: string }).html).join("")))

  const stored = storeBlocks(a.blocks)
  const back = readStoredBody(stored)
  check("saves and reads back as the same blocks", !back.legacy && typeOf(back.blocks) === typeOf(a.blocks), `${typeOf(a.blocks)} vs ${typeOf(back.blocks)}`)
  check("and renders the same after the round trip", renderBlocks(back.blocks, theme) === renderBlocks(a.blocks, theme))

  const body = renderBlocks(a.blocks, theme)
  const html = buildEmail({ subject: a.subject || "Hello", previewText: a.previewText, bodyHtml: personalizeHtml(body, { name: "Maya Lee" }), brand, kind: "marketing", unsubscribeUrl: "https://storelib.com/u" })
  check("sent in the 600px layout, with a fixed 600px table for Outlook", /max-width:600px/.test(html) && /<!--\[if mso\]><table role="presentation" width="600"/.test(html))
  check("every tag in the body has its style inline, no class hooks it depends on", !/<(p|h2|h3|ul|ol|li|blockquote)>/.test(body) && !/<(p|h2|h3)\s(?![^>]*style=)/.test(body))
  check("the reader's first name is filled in", /Hi Maya/.test(html) || s.id === "sale")
  check("nothing that runs", !/<script|javascript:|\son[a-z]+=/i.test(html))
  if (s.id === "announcement" || s.id === "sale") {
    check("its button goes to the store and is a painted table cell", /bgcolor="#0f766e"[^>]*>[\s\S]*href="https:\/\/storelib\.com\/ana"/.test(body))
    check("and there is nothing left to finish before it can be sent", blockIssues(a.blocks).filter((i) => i.level === "error").length === 0)
  }
  if (s.id === "sale") check("the sale is centred, heading and text", /<h2 style="[^"]*text-align:center;/.test(body) && /<p style="[^"]*text-align:center;/.test(body))
  if (s.id === "product") check("the product block asks for a product before it can be sent", blockIssues(a.blocks).some((i) => i.level === "error" && /product/.test(i.message)))
  const verdict = checkContent({ subject: a.subject || "Hello", previewText: a.previewText, text: emailText({ bodyHtml: body, brand, kind: "marketing", unsubscribeUrl: "https://storelib.com/u" }), images: 0, bytes: byteLength(body), unknownFields: [] })
  check("passes the content checks a send runs", verdict.errors.length === 0, JSON.stringify(verdict.errors))
}

console.log("\nWith no store address")
const bare = starterDraft("announcement", { name: "", storeUrl: null })
check("the button has no link yet, and Send says so", blockIssues(bare.blocks).some((i) => i.level === "error" && /no link/.test(i.message)))
check("the sign off is the {{creator_name}} tag, filled with the profile's name when it is sent", /\{\{creator_name\}\}/.test(JSON.stringify(bare.blocks)) && /Maya Studio/.test(personalizeHtml(bare.blocks.map((b) => (b as { html?: string }).html ?? "").join(""), { creatorName: "Maya Studio" })))

console.log("\nThe logo, as the email is sent")
const html = buildEmail({ subject: "s", bodyHtml: "<p>x</p>", brand, kind: "marketing", unsubscribeUrl: "#" })
const logo = /<img class="sl-logo"[^>]*>/.exec(html)?.[0] ?? ""
/* Changed on purpose (round 49): the store logo's small corner (lib/brand/store-logo.ts), no other radius, no shadow. */
check("drawn with no border, padding, background or shadow, only the store logo's small corner", !!logo && /border:0/.test(logo) && !/padding|background|box-shadow/.test(logo) && (logo.match(/border-radius:[^;"]*/g) ?? []).join() === `border-radius:${STORE_LOGO_RADIUS}px`, logo)
check("and nothing in the style block gives it one in dark mode", !/\.sl-logo\s*\{/.test(html))
check("40px tall, as wide as it is, up to 200px", /height="40"/.test(logo) && /max-width:200px/.test(logo))

const id: StarterId = "letter"
void id

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
