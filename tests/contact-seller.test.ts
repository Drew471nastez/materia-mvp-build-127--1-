/**
 * ===========================================================================
 *  A MESSAGE TO THE SELLER, AND EVERY EMAIL'S LAST STEP
 * ===========================================================================
 * Contact seller, from the receipt, run through the real mailer
 * (lib/email.tsx sendSellerMessageEmail -> lib/mail.ts -> lib/mailgun.ts)
 * with Mailgun's API replaced by a recorder at fetch, so what is pinned is
 * the request Mailgun would get:
 *
 *   WHO           lib/seller-inbox: the support address the seller set, then
 *                 the login's address as it is now (the owner's, for a second
 *                 business, even after the owner changed it), then the
 *                 profile's; a "+slb-" tag never reaches the To; nobody is
 *                 null, never Storelib's support inbox
 *   REPLY-TO      the buyer, so the seller answers with Reply
 *   ESCAPED       a message or a name with markup arrives as text; no line
 *                 break reaches a header
 *   FAILURE       a 5xx from Mailgun, or no connection, is { success: false }
 *   NOT LOGGED    no console line carries the buyer's address or words
 *
 * And the pieces every email now passes (lib/mail-document.ts, and the
 * picture sizing in lib/email-campaigns/sender.ts): a fragment leaves as a
 * whole document, a whole document is left alone, a button is a table cell
 * Outlook paints, and a picture in a campaign is asked of the resizer at
 * twice its drawn width instead of downloaded whole.
 */
import "./_mailgun-env"
import { fakeDb } from "./_fake-db"
import { inboxAddress, loginEmailFrom, sellerInbox } from "@/lib/seller-inbox"
import { sellerMessageEmail, type SellerMessage } from "@/lib/receipts/contact"
import { resolveCreatorIdentity, sendSellerMessageEmail } from "@/lib/email"
import { quotedFrom } from "@/lib/mailgun"
import { emailButton, finalizeEmailHtml } from "@/lib/mail-document"
import { emailImageSrc, inboxImageSrc } from "@/lib/email-campaigns/sender"
import { PLAIN_THEME, newBlock, renderBlocks, type Block } from "@/lib/email-campaigns/blocks"
import { richToEmail } from "@/lib/email-campaigns/rich"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    process.stdout.write(`  ok    ${label}\n`)
  } else {
    failed++
    failures.push(label)
    process.stdout.write(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}\n`)
  }
}

function section(title: string) {
  process.stdout.write(`\n${title}\n`)
}

/* ── Every console line, to be searched for the buyer's address and words ── */
const logged: string[] = []
const original = { log: console.log, warn: console.warn, error: console.error, info: console.info }
for (const k of ["log", "warn", "error", "info"] as const) {
  console[k] = (...args: unknown[]) => {
    logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "))
  }
}

/* ── Mailgun, at fetch ─────────────────────────────────────────────────── */
type Sent = Record<string, string[]>
const mailgun = { sent: [] as Sent[], answer: 200 as number | "offline" }
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  /* The suppression lookups before a send: not on either list. */
  if (!init || (init.method ?? "GET") === "GET") return new Response("{}", { status: 404 })
  if (mailgun.answer === "offline") throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })
  if (!/\/v3\/storelib\.com\/messages$/.test(url)) return new Response("{}", { status: 404 })
  const form = init.body as FormData
  const fields: Sent = {}
  for (const [k, v] of form.entries()) (fields[k] ??= []).push(typeof v === "string" ? v : "[file]")
  mailgun.sent.push(fields)
  return mailgun.answer === 200
    ? new Response(JSON.stringify({ id: "<m1@storelib.com>", message: "Queued. Thank you." }), { status: 200 })
    : new Response(JSON.stringify({ message: "Internal error" }), { status: mailgun.answer })
}) as typeof fetch

const CREATOR = "11111111-1111-4111-8111-111111111111"
const MEMBER = "22222222-2222-4222-8222-222222222222"
const OWNER = "33333333-3333-4333-8333-333333333333"
const BUYER_EMAIL = "Ghita.Buyer@Example.com"
const WORDS = "the zip for order 55821 will not open"

async function main() {
  /* ═════════════════════════════════════════════════════════════════════ */
  section("Who a message to the seller goes to")
  {
    const db = fakeDb({ creators: [{ id: CREATOR, user_id: MEMBER, support_email: " Help@Seller.Example " }], profiles: [{ id: MEMBER, email: "andrew@example.com" }] })
    const got = await sellerInbox(db, CREATOR, async () => "andrew@example.com")
    check("the support address the seller set comes first, trimmed and lower case", got?.to === "help@seller.example" && got.via === "support", got)
  }
  {
    const db = fakeDb({ creators: [{ id: CREATOR, user_id: MEMBER, support_email: null }], profiles: [{ id: MEMBER, email: "andrew.old@example.com" }] })
    const got = await sellerInbox(db, CREATOR, async (id) => (id === MEMBER ? "andrew.now@example.com" : null))
    check("no support address: the login's address as it is now, not the profile's copy", got?.to === "andrew.now@example.com" && got.via === "login", got)
  }
  {
    const db = fakeDb({
      creators: [{ id: CREATOR, user_id: MEMBER, support_email: "" }],
      profiles: [{ id: MEMBER, email: "andrew+slb-1a2b3c4d@old.example" }],
      business_links: [{ member_id: MEMBER, owner_id: OWNER }],
    })
    const logins: Record<string, string> = { [MEMBER]: "andrew+slb-1a2b3c4d@old.example", [OWNER]: "andrew@new.example" }
    const got = await sellerInbox(db, CREATOR, async (id) => logins[id] ?? null)
    check("a second business: the owner's login as it is now, after they changed it", got?.to === "andrew@new.example", got)
    const noOwnerLogin = await sellerInbox(db, CREATOR, async (id) => (id === MEMBER ? logins[MEMBER] : null))
    check("owner unreadable: the business's own address with the tag taken off", noOwnerLogin?.to === "andrew@old.example", noOwnerLogin)
    /* The receipt, the sale email and a refund read the seller through resolveCreatorIdentity: the same inbox now. */
    const withAuth = Object.assign(db, { auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: logins[id] ?? null } } }) } } })
    const identity = await resolveCreatorIdentity(withAuth, CREATOR)
    check("a receipt's Reply-To for a second business is the owner's login as it is now", identity.replyTo === "andrew@new.example" && identity.sellerEmail === "andrew@new.example", identity)
  }
  {
    const db = fakeDb({ creators: [{ id: CREATOR, user_id: MEMBER, support_email: null }], profiles: [{ id: MEMBER, email: "andrew+slb-1a2b3c4d@example.com" }] }, { failWith: { business_links: { code: "42P01", message: "relation does not exist" } } })
    const got = await sellerInbox(db, CREATOR, async () => null)
    check("before the businesses SQL, and with auth unreadable: the profile's address, untagged", got?.to === "andrew@example.com" && got.via === "profile", got)
  }
  {
    const db = fakeDb({ creators: [{ id: CREATOR, user_id: MEMBER, support_email: null }], profiles: [{ id: MEMBER, email: "slb-1a2b3c4d@businesses.invalid" }] })
    check("a business with no owner address is nobody: null, never a support inbox", (await sellerInbox(db, CREATOR, async () => null)) === null)
    check("no creator: null", (await sellerInbox(fakeDb({ creators: [] }), CREATOR, async () => "x@example.com")) === null)
    check("a broken address is not an address", inboxAddress("a@b") === null && inboxAddress("a b@c.com") === null && inboxAddress("Jo@Example.com") === "jo@example.com")
  }
  {
    const admin = { auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id.slice(0, 4)}@example.com` } } }) } } }
    check("the admin client's auth reader is used as the login reader", (await loginEmailFrom(admin)(OWNER)) === "3333@example.com")
    check("a client without auth reads nothing, and throws nothing", (await loginEmailFrom({})(OWNER)) === null)
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  section("The message, as the seller gets it")
  const message: SellerMessage = {
    buyerName: `Ghita <img src=x onerror=alert(1)>\r\nBcc: evil@example.com`,
    buyerEmail: BUYER_EMAIL.toLowerCase(),
    orderNumber: "#1042",
    items: ["Drewwww", "Brand <b>Workbook</b>"],
    message: `Hi, ${WORDS}.\n\n<script>alert(1)</script> <a href="javascript:alert(1)">click</a>`,
    orderLink: "https://storelib.com/app/orders/11111111-1111-4111-8111-111111111111",
  }
  const mail = sellerMessageEmail(message)
  check("the subject is one line and names the order", !/[\r\n]/.test(mail.subject) && /^Order #1042: a message from /.test(mail.subject), mail.subject)
  check("the sender's name is one line with no markup", !/[\r\n<>"]/.test(mail.fromName) && / via Storelib$/.test(mail.fromName), mail.fromName)
  /* The one picture is the Storelib mark of the shared layout (lib/emails/layout.ts); nothing the buyer typed becomes a tag. */
  check(
    "the words arrive as text: no script, no tag, no javascript: link",
    !/<script|<b>|href="javascript/i.test(mail.html) && (mail.html.match(/<img\b[^>]*>/g) ?? []).every((t) => t.includes("storelib-logo-email")) && mail.html.includes("&lt;script&gt;"),
    mail.html,
  )
  check("a whole document: lang, charset, a preheader of the message", /<html lang="en"[\s>]/.test(mail.html) && /<meta charset="utf-8">/.test(mail.html) && /display:none[^>]*>Hi, the zip/.test(mail.html))
  check(
    "the button is a table cell Outlook paints, and a roundrect for Outlook on Windows",
    /<td class="e-btn[^"]*" align="center" bgcolor="#1a1a2e"[^>]*>\s*<a class="e-btn-a[^"]*" href="https:\/\/storelib\.com\/app\/orders\//.test(mail.html) && /<v:roundrect[^>]*href="https:\/\/storelib\.com\/app\/orders\//.test(mail.html),
    mail.html,
  )
  check("the text part has the message and where a reply goes", mail.text.includes(WORDS) && mail.text.includes(`goes to ${message.buyerEmail}`))

  /* ═════════════════════════════════════════════════════════════════════ */
  section("Sent through the real mailer, Mailgun stubbed")
  {
    mailgun.sent = []
    mailgun.answer = 200
    const r = await sendSellerMessageEmail(null, { to: " Help@Seller.Example ", message })
    const f = mailgun.sent[0] ?? {}
    check("sent: success", r.success === true && mailgun.sent.length === 1, r)
    check("to the seller's inbox", f.to?.[0] === "help@seller.example", f.to)
    check("Reply-To is the buyer, so the seller answers with Reply", f["h:Reply-To"]?.[0] === "ghita.buyer@example.com", f["h:Reply-To"])
    /* The name carried a colon and an @ ("Bcc: evil@example.com" typed as a first name): quoted, so no server reads a second address in it. */
    check("from Storelib's own address, with the buyer's name, quoted when it holds a colon or an @", /^"Ghita [^"]* via Storelib" <noreply@storelib\.com>$/.test(f.from?.[0] ?? "") && !/[\r\n]/.test(f.from?.[0] ?? ""), f.from)
    check("the subject as built, one line", f.subject?.[0] === mail.subject)
    check("an HTML part and a text part", /^<!doctype html>/i.test(f.html?.[0] ?? "") && (f.text?.[0] ?? "").includes(WORDS))
    check("no List-Unsubscribe on a message between two people", !Object.keys(f).some((k) => /list-unsubscribe/i.test(k)))
  }
  {
    mailgun.sent = []
    mailgun.answer = 500
    const r = await sendSellerMessageEmail(null, { to: "help@seller.example", message })
    check("Mailgun answers 500: not sent, said so", r.success === false && typeof r.error === "string", r)
    mailgun.answer = "offline"
    const offline = await sendSellerMessageEmail(null, { to: "help@seller.example", message })
    check("no connection: not sent, said so", offline.success === false, offline)
    mailgun.answer = 200
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  section("Every email leaves as a whole document")
  {
    const fragment = `<div style="max-width:600px;"><a href="https://storelib.com/reset?code=a&amp;b">Reset</a></div>`
    const doc = finalizeEmailHtml(fragment, "Reset your <password>")
    check("a fragment is wrapped: doctype, lang, charset, viewport, title", /^<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">/.test(doc) && /<meta name="viewport"/.test(doc) && /<title>Reset your &lt;password&gt;<\/title>/.test(doc))
    check("and its markup is untouched inside the body", doc.includes(`<body>\n${fragment}\n</body>`))
    check("wrapping twice changes nothing", finalizeEmailHtml(doc, "Reset your <password>") === doc)
    const partial = `<!doctype html><html><head><title>x</title></head><body>hi</body></html>`
    const fixed = finalizeEmailHtml(partial)
    check("a document without lang or charset gets them, nothing else", fixed === `<!doctype html><html lang="en"><head>\n<meta charset="utf-8"><title>x</title></head><body>hi</body></html>`, fixed)
    const bare = finalizeEmailHtml(`<html><body>hi</body></html>`)
    check("no doctype and no head: both added", /^<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<\/head><body>hi<\/body><\/html>$/.test(bare), bare)
    const whole = `<!DOCTYPE html>\n<html lang="fr"><head><meta charset="utf-8"></head><body>ok</body></html>`
    check("a whole document is left exactly as it was", finalizeEmailHtml(whole) === whole)
  }
  {
    mailgun.sent = []
    const { sendEmail } = await import("@/lib/mail")
    await sendEmail({ to: "someone@example.com", subject: "Reset your password", html: "<div><p>Reset</p></div>" })
    const f = mailgun.sent[0] ?? {}
    check("the mailer sends the whole document, not the fragment", /^<!DOCTYPE html>\n<html lang="en">/.test(f.html?.[0] ?? ""), f.html)
    check("a text part is made when none is given, without the title", (f.text?.[0] ?? "") === "Reset", f.text)
    check("a From with a display name and Storelib's domain", f.from?.[0] === "Storelib <noreply@storelib.com>", f.from)
  }
  {
    check("a plain name is left as it is", quotedFrom("Ana Pop Studio <noreply@storelib.com>") === "Ana Pop Studio <noreply@storelib.com>")
    check("a name with a comma is quoted", quotedFrom("Ana, Studio <noreply@storelib.com>") === '"Ana, Studio" <noreply@storelib.com>')
    check("quotes and line breaks inside a name are taken out", quotedFrom('Jo "The" \r\nBcc: x@y.z <noreply@storelib.com>') === '"Jo The Bcc: x@y.z" <noreply@storelib.com>', quotedFrom('Jo "The" \r\nBcc: x@y.z <noreply@storelib.com>'))
    check("an address with no name is left for withDisplayName", quotedFrom("noreply@storelib.com") === "noreply@storelib.com")
  }
  {
    const b = emailButton({ href: "https://storelib.com/x?a=1&amp;b=2", label: "Download now", fill: "#7c3aed", padding: "14px 26px", radius: 10, text: "font-size:15px;", align: "center" })
    check("a button: role presentation, bgcolor on the cell, Outlook's padding, the link fills it", /^<table role="presentation"[^>]* align="center"/.test(b) && /bgcolor="#7c3aed"/.test(b) && /mso-padding-alt:14px 26px/.test(b) && /<a href="https:\/\/storelib\.com\/x\?a=1&amp;b=2" target="_blank" style="display:inline-block;padding:14px 26px;/.test(b), b)
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  section("Pictures, sized for the inbox")
  const STORE = "https://abc.supabase.co/storage/v1/object/public"
  {
    const thumb = emailImageSrc(`${STORE}/products/p1/cover.webp`, 64) ?? ""
    check("a stored WebP thumbnail drawn at 64 is made by the inbox route at 192 (3x), absolute https", thumb === `https://storelib.com/api/email/img?u=${encodeURIComponent(`${STORE}/products/p1/cover.webp`)}&w=192`, thumb)
    check("an SVG is never the creator's picture (Gmail and Outlook do not show SVG)", emailImageSrc(`${STORE}/logos/l.svg`, 40) === null)
    check("but an SVG a creator put in the body is kept as stored, not dropped", inboxImageSrc(`${STORE}/art/a.svg`, 520) === `${STORE}/art/a.svg`)
    const own = inboxImageSrc("https://storelib.com/images/brand/cover.png", 260) ?? ""
    check("a picture on Storelib's own site is resized by its path", own === "https://storelib.com/_next/image?url=%2Fimages%2Fbrand%2Fcover.png&w=640&q=75", own)
    check("a host the resizer does not fetch is drawn from its stored address", inboxImageSrc("https://cdn.example.com/a.png", 96) === "https://cdn.example.com/a.png")
  }
  {
    const blocks = [
      newBlock("image", { src: `${STORE}/campaign/hero.png`, alt: "The shop", width: 100 } as Partial<Block>),
      newBlock("image", { src: `${STORE}/campaign/half.webp`, alt: "Half", width: 50 } as Partial<Block>),
      newBlock("product", { productId: "p1", title: "Scene", price: "$12.00", imageUrl: `${STORE}/products/p1/cover.webp`, url: "https://storelib.com/negru/scene" } as Partial<Block>),
    ]
    const html = renderBlocks(blocks)
    const srcs = [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))
    check("a full width campaign picture (520) is asked at 1080, not downloaded whole", /\/api\/email\/img\?u=[^&]*hero\.png&w=1080$/.test(srcs[0] ?? ""), srcs[0])
    check("a half width one (260) at 640", /half\.webp&w=640$/.test(srcs[1] ?? ""), srcs[1])
    check("a product card's 96px picture at 192", /cover\.webp&w=192$/.test(srcs[2] ?? ""), srcs[2])
    check("each keeps its drawn width, alt and border 0", /width="520"[^>]*max-width:520px;height:auto;border:0/.test(html) && /alt="The shop"/.test(html) && /width="96" height="96"[^>]*border:0/.test(html))
    const rich = richToEmail(`<p><img src="${STORE}/campaign/inline.jpg" alt="Inline" width="300"></p>`, PLAIN_THEME)
    check("a picture in the text is sized by its width attribute", /inline\.jpg&amp;w=640" alt="Inline" width="300"/.test(rich), rich)
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  section("Nothing personal in the logs")
  {
    const all = logged.join("\n").toLowerCase()
    check("no console line carries the buyer's address", !all.includes("ghita.buyer@example.com"))
    check("or the seller's", !all.includes("help@seller.example"))
    check("or the buyer's words", !all.includes(WORDS))
  }

  Object.assign(console, original)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  Object.assign(console, original)
  console.error(e)
  process.exit(1)
})
