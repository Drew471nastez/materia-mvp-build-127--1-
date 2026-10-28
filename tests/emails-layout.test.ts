/**
 * ===========================================================================
 *  EVERY EMAIL IN ONE LAYOUT
 * ===========================================================================
 * lib/emails/layout.ts is the one layout every Storelib email is drawn in:
 * Storelib's own (an invite, a code, a reset, a sale, a payout) and a
 * store's to its buyers (a receipt, an order, a shipment, a sign in code).
 * This draws every template with sample data and pins, for each:
 *
 *   it is the shared layout (the white page, the 560px column, the footer)
 *   it has a preview line for the inbox and a plain text part with no markup
 *   no em or en dash, and never the words Shopify or Liquid
 *   every picture has alt text and an https source, every link is https
 *   or mailto
 *
 * Then the team invite itself: the store and the role, the address it was
 * sent to as text Gmail will not turn blue, one Accept button. And no file
 * that sends mail draws a document of its own any more.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { emailDocument, emailKit, emailTheme, identity, platformEmail, PLATFORM_ACCENT } from "@/lib/emails/layout"
import { teamInviteEmail } from "@/lib/team/invite-email"
import { codeEmail } from "@/lib/account/code-email"
import { googleSignInEmail, resetPasswordEmail } from "@/lib/account/reset-email"
import { codeEmail as siteCodeEmail } from "@/lib/site-accounts/code-email"
import { buyerReceiptEmailHtml, buyerReceiptEmailText, type ReceiptEmailModel } from "@/lib/receipts/email"
import { CUSTOMER_EMAILS, previewCustomerEmail } from "@/lib/emails/customer-catalog"
import { orderConfirmationEmail, orderLinkEmail, supplierOrderEmail } from "@/lib/physical/email-templates"
import { buyerRefundEmail, leadMagnetEmail, reviewNoticeEmail, sellerRefundEmail } from "@/lib/emails/notices"
import { sellerMessageEmail } from "@/lib/receipts/contact"
import { creatorEmail } from "@/lib/site-contact/contact"
import { contactEmail } from "@/lib/communities/server/membership-lifecycle"
import { duplicateEmail } from "@/lib/memberships/duplicates"
import { NOTIFICATION_TYPES } from "@/lib/notify/types"
import { renderEmail } from "@/lib/notify/templates"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
  }
}

const IMG = "https://cdn.example.com/p.png"
type Mail = { subject?: string; html: string; text?: string | null }
const all: [string, Mail][] = []
const add = (name: string, m: Mail | null) => {
  if (m) all.push([name, m])
}

/* ── Storelib's own ───────────────────────────────────────────────────── */
const invite = teamInviteEmail({ storeName: "AndrewRullz", storeImageUrl: IMG, inviterName: "Andrew", role: "manager", email: "andreibalanradu112@gmail.com", link: "https://storelib.com/api/team/join?token=abc" })
add("team invite", invite)
add("team invite, no picture or name", teamInviteEmail({ storeName: "AndrewRullz", role: "manager", email: "a@b.co", link: "https://storelib.com/api/team/join?token=abc" }))
add("code", { subject: "123456 is your Storelib code", ...codeEmail({ heading: "Confirm your email", lead: "Enter this code to confirm your email.", code: "123456", minutes: 10, footer: "If you didn't ask for this, ignore this email." }) })
add("password reset", resetPasswordEmail({ resetUrl: "https://storelib.com/reset-password?code=abc" }))
add("google sign in", googleSignInEmail({ loginUrl: "https://storelib.com/login" }))
add("review notice", reviewNoticeEmail({ productTitle: "Presets", reviewerName: "Sam", rating: 4, content: "Lovely.", link: "https://storelib.com/app/reviews?review=1" }))
add("seller refund", sellerRefundEmail({ storeName: "Loudlib", productTitle: "Presets", amount: "$29.00", orderDate: "Oct 1, 2026", refundDate: "Oct 2, 2026", reason: "Asked", orderRef: "#1A2B", buyerEmail: "sam@example.com", payoutsUrl: "https://storelib.com/dashboard/payouts" }))
add("seller message", sellerMessageEmail({ orderNumber: "1042", items: ["Presets"], buyerName: "Sam", buyerEmail: "sam@example.com", message: "Hi there", orderLink: "https://storelib.com/app/orders/1" } as never))
add("site contact", creatorEmail({ store: "Loudlib", site: "loudlib.storelib.com", contactUrl: "https://storelib.com/app/emails", msg: { name: "Ana", email: "ana@example.com", subject: "", message: "Hello", page: "home", consent: false } as never }))
add("community contact", contactEmail({ communityName: "Film Club", senderName: "Ana", senderEmail: "ana@example.com", subject: "Meetup", message: "Friday?", link: "https://storelib.com/app/communities" }))
add("membership duplicate", duplicateEmail({ title: "Inner Circle" }, "https://storelib.com/account/library/memberships/m1"))
const NOTIFY = { storeName: "Ana's Studio", creatorName: "Ana Lopez", email: "ana@example.com", productTitle: "Presets", productId: "p1", amountCents: 12040, currency: "usd", orderId: "o1", orderNumber: "1042", customerName: "Sam", receiptToken: "rt_1", occurredAt: "2026-09-26T15:14:00Z" }
for (const t of NOTIFICATION_TYPES) {
  add(`notification ${t}`, renderEmail(t, NOTIFY, { baseUrl: "https://storelib.com", recipientName: "Ana", unsubscribeUrl: "https://storelib.com/api/notify/unsubscribe?t=a", preferencesUrl: "https://storelib.com/app/settings?tab=notifications" }))
}

/* ── A store's, to its buyers ─────────────────────────────────────────── */
const shop = { name: "Wildflower Goods", supportEmail: "hello@wildflower.shop", storeUrl: "https://wildflower.shop", logoUrl: IMG, accent: "#0f766e" }
for (const e of CUSTOMER_EMAILS) add(`customer ${e.id}`, previewCustomerEmail(e.id, shop))
add("order link", orderLinkEmail({ shopName: "Wildflower Goods", orders: [{ number: "#1", date: "today", url: "https://wildflower.shop/o/1", status: null }] }))
add("supplier order", supplierOrderEmail({ shopName: "Wildflower Goods", orderNumber: "#1", locationName: "Farm", lines: [{ title: "Honey", variantName: null, quantity: 1, cents: 100, imageUrl: null }], address: { name: "M", line1: "1 St", city: "B", country: "RO" }, buyerEmail: null, deliveryName: null, note: null }))
add("store sign in code", siteCodeEmail({ store: "Wildflower Goods", code: "123456", host: "wildflower.shop", minutes: 10, logoUrl: IMG }))
const receipt: ReceiptEmailModel = {
  firstName: "Maria", sellerName: "Loudlib", sellerPicture: { url: IMG, kind: "photo" }, orderNumber: "#1042", dateText: "October 10, 2026",
  items: [{ title: "Presets", variantName: null, amountText: "$29.00", note: null, thumbnailUrl: IMG }],
  subtotalText: null, tipText: null, totalText: "$29.00", refundedText: null, link: "https://storelib.com/receipt/rt_1", buttonLabel: "Download your files", supportEmail: "hello@loudlib.com",
}
add("receipt", { subject: "Your receipt", html: buyerReceiptEmailHtml(receipt), text: buyerReceiptEmailText(receipt) })
add("lead magnet", leadMagnetEmail({ sellerName: "Loudlib", productTitle: "Free pack", downloadLink: "https://cdn.example.com/free.zip", supportEmail: "hello@loudlib.com" }))
add("buyer refund", buyerRefundEmail({ storeName: "Loudlib", productTitle: "Presets", amount: "$29.00", orderDate: "Oct 1, 2026", refundDate: "Oct 2, 2026", reason: "Asked", orderRef: "#1A2B", contactEmail: "hello@loudlib.com" }))

console.log(`\nEvery email is drawn in the shared layout (${all.length} of them)`)
check("every template was drawn", all.length > 90, all.length)
const markup = /<(table|tr|td|div|p|a|span|br|img|h1|strong)\b|&(amp|lt|gt|quot|#39|nbsp|middot);/i
for (const [name, m] of all) {
  const html = m.html
  const words = `${m.subject ?? ""}\n${html}\n${m.text ?? ""}`
  const bad: string[] = []
  if (!/<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="e-body" style="width:100%;max-width:560px;margin:0 auto;">/.test(html)) bad.push("not the shared layout")
  if (!/<!--\[if mso\]><table role="presentation" width="560"/.test(html)) bad.push("no fixed table for Outlook")
  if (!/<meta name="viewport" content="width=device-width,initial-scale=1">/.test(html) || !/<meta name="color-scheme" content="light dark">/.test(html)) bad.push("no viewport or colour scheme meta")
  const pre = html.match(/<div class="e-preheader"[^>]*>([\s\S]*?)&#8199;/)
  if (!pre || pre[1].trim().length < 2) bad.push("no preview line")
  if (!m.text || m.text.trim().length < 40 || markup.test(m.text)) bad.push("no plain text part, or markup in it")
  if (/[—–]/.test(words)) bad.push("an em or en dash")
  if (/shopify|liquid/i.test(words)) bad.push("says Shopify or Liquid")
  const imgs = html.match(/<img\b[^>]*>/g) ?? []
  if (!imgs.every((i) => /\balt="/.test(i) && /\bsrc="https:\/\//.test(i) && /\b(width|height)="\d+"/.test(i))) bad.push("a picture without alt, https or a size")
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((x) => x[1])
  if (!hrefs.every((h) => /^(https:\/\/|mailto:|tel:)/.test(h))) bad.push(`a link that is not https: ${hrefs.find((h) => !/^(https:\/\/|mailto:|tel:)/.test(h))}`)
  if (/<script|\son[a-z]+=|<link\b/i.test(html)) bad.push("a script, handler or linked stylesheet")
  check(`${name}: shared layout, preview line, text part, no dash, safe pictures and links`, bad.length === 0, bad)
}

console.log("\nThe team invite")
{
  const h = invite.html
  check("the subject names who invited them and the store", invite.subject === "Andrew invited you to AndrewRullz on Storelib", invite.subject)
  check("Storelib on top: the mark and the name", /storelib-logo-email-v2\.png/.test(h) && />Storelib<\/td>/.test(h))
  /* Round 40: an invite carries permissions, not a role; one from before part 320 (role "manager") reads as the Orders it could use. */
  check("the store by its picture and name, with the access and what it does", h.includes(`src="${IMG}"`) && />AndrewRullz<\/p>/.test(h) && />Orders<\/p>/.test(h) && /be able to see, fulfil and ship orders, handle returns\./.test(h))
  check("the address is plain text, split so Gmail does not link it", !/andreibalanradu112@gmail\.com/.test(h.replace(/<title>[\s\S]*?<\/title>/, "")) && /andreibalanradu112<span[^>]*>@<\/span>gmail<span[^>]*>\.<\/span>com/.test(h))
  check("one Accept invite button, near black, with an Outlook roundrect", (h.match(/<td class="e-btn[" ]/g) ?? []).length === 1 && /bgcolor="#1a1a2e"[^>]*>\s*<a class="e-btn-a[^"]*" href="https:\/\/storelib\.com\/api\/team\/join\?token=abc"[^>]*>Accept invite<\/a>/.test(h) && /<v:roundrect[^>]*href="https:\/\/storelib\.com\/api\/team\/join\?token=abc"/.test(h))
  check("the text part has the link and the address in full", invite.text.includes("https://storelib.com/api/team/join?token=abc") && invite.text.includes("Sign in with andreibalanradu112@gmail.com to accept."))
  check("it says how long the link works", /works for 7 days/.test(invite.text) && /works for 7 days/.test(h))
  const bare = all.find(([n]) => n === "team invite, no picture or name")![1]
  check("no picture: the store's letter on a tile; no name: it still reads", />A<\/td>/.test(bare.html) && bare.subject === "You're invited to AndrewRullz on Storelib" && /You&#39;ve been invited to help run AndrewRullz/.test(bare.html))
}

console.log("\nThe layout")
{
  check("Storelib's button is the near black ink", emailTheme({ kind: "storelib" }).accent === PLATFORM_ACCENT)
  check("a store's accent is its button when it reads on white", emailTheme({ kind: "store", name: "S", accent: "#0f766e" }).accent === "#0f766e")
  check("a pale accent falls back to ink, so the button is still seen", emailTheme({ kind: "store", name: "S", accent: "#fde68a" }).accent === PLATFORM_ACCENT)
  check("words on the button read: white on dark, ink on light", emailTheme({ kind: "store", name: "S", accent: "#0f766e" }).onAccent === "#ffffff" && emailTheme({ kind: "store", name: "S", accent: "#f59e0b" }).onAccent !== "#ffffff")
  check("a dark button turns light in dark mode", emailTheme({ kind: "storelib" }).flip && /\.e-btn-flip\{background-color:#f4f4f5!important;\}/.test(invite.html))
  const k = emailKit({ kind: "store", name: "S" })
  check("every value is escaped", k.text("<b>x</b>").includes("&lt;b&gt;x&lt;/b&gt;") && k.facts([{ label: "<i>", value: "<u>" }]).includes("&lt;u&gt;") && !k.button("Go", 'https://a.co/"x').includes('"x"'))
  check("an address in a fact is kept as text", k.facts([{ label: "Email", value: "sam@example.com" }]).includes("sam<span"))
  check("identity() keeps the address readable when copied", identity("a.b@c.co").replace(/<[^>]+>/g, "") === "a.b@c.co")
  const doc = emailDocument({ sender: { kind: "store", name: "Shop <x>" }, subject: "S", preview: "P", rows: [k.text("hi")] })
  check("a store with no picture shows its letter and its name, escaped", />S<\/td>/.test(doc) && /Shop &lt;x&gt;/.test(doc))
  const p = platformEmail({ subject: "S", heading: "H", paragraphs: ["One"], action: { label: "Go", url: "https://storelib.com/x" } })
  check("platformEmail writes the button's address out under it, and in the text part", /Button not working\?/.test(p.html) && p.text.includes("Go:\nhttps://storelib.com/x"))
  check("the phone rules stack columns and widen the button, below 480px", /@media only screen and \(max-width:480px\)\{[\s\S]*\.e-btn-wrap\{width:100%!important;\}[\s\S]*\.e-col\{display:block!important;/.test(doc))
}

console.log("\nNo file that sends mail draws its own document")
{
  const root = process.cwd()
  const walk = (dir: string): string[] =>
    readdirSync(join(root, dir)).flatMap((f) => {
      const p = join(dir, f)
      return statSync(join(root, p)).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
    })
  /*
    The creator's own composed emails (campaigns, automations, course
    nudges, a member update) are drawn by the composer's layout
    (lib/email-campaigns/template.ts) so the preview in the composer is the
    email; the ops report to Storelib's own inbox is a plain <pre>.
  */
  const ALLOWED = new Set(["lib/email-campaigns/template.ts", "lib/emails/layout.ts", "lib/mail-document.ts", "lib/observability/report.ts", "lib/unsubscribe-card.ts"])
  const sends = /from "(@\/lib|\.)\/(mail|mailgun)"|sendMailgunOnce|sendMailgunEmail/
  const own = [...walk("lib"), ...walk("app")].filter((f) => !ALLOWED.has(f)).filter((f) => {
    const src = readFileSync(join(root, f), "utf8")
    return sends.test(src) && /<!doctype html|<body style=|<html lang=|<div style="font-family/i.test(src)
  })
  check("every sender uses the shared layout", own.length === 0, own)
  const mods = ["lib/notify/templates/layout.ts", "lib/physical/email-templates.ts", "lib/receipts/email.ts", "lib/account/code-email.ts", "lib/account/reset-email.ts", "lib/site-accounts/code-email.ts", "lib/team/invite-email.ts", "lib/emails/notices.ts", "lib/support/cases-server.ts", "lib/support/tickets-server.ts", "lib/receipts/contact.ts", "lib/site-contact/contact.ts", "lib/memberships/duplicates.ts"]
  const missing = mods.filter((f) => !/from "@\/lib\/emails\/layout"|from "\.\/layout"/.test(readFileSync(join(root, f), "utf8")))
  check("and every email template imports it", missing.length === 0, missing)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
