/**
 * ===========================================================================
 *  A CAMPAIGN IS SENT ONCE, TO THE RIGHT PEOPLE, AND SAYS WHAT HAPPENED
 * ===========================================================================
 * The send pipeline (lib/email-campaigns/*) run against a stand-in database
 * (tests/fake-campaign-db.ts) and a stand-in provider, both before and after
 * supabase/sql/RUN_EMAIL_SENDING.sql:
 *
 *   two Sends at once start one send, and write one row per address
 *   every address gets at most one message, however the work is split
 *     between workers, retried, or picked up after a crash: a message that
 *     may have arrived is never sent again
 *   unsubscribed, bounced, invalid and duplicate addresses are not mailed,
 *     including someone who leaves between Send and their turn
 *   a 5xx is retried later, a refusal is recorded, a credentials problem
 *     pauses the campaign without failing anybody
 *   the end state (sent, partly sent, not sent, stopped) matches the rows
 *
 * And the pure parts: the state machine, addresses, the sanitizer, content
 * checks, plan limits, the brand and its contrast checks, the rich text
 * renderer, the one layout, signed links, and the blocks as saved and read
 * back.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

/* Links are signed with a server key; the suite has its own. */
process.env.EMAIL_LINK_SECRET = "a-test-key-that-is-long-enough"

import { FakeDb, tick } from "./fake-campaign-db"
import {
  cancelSend,
  countRecipients,
  isModernSchema,
  prepareContent,
  processCampaign,
  resetSchemaCache,
  resolveAudience,
  retryFailed,
  runCampaignQueue,
  startSend,
  trackLinks,
} from "@/lib/email-campaigns/queue"
import { canTransition, finalStatus, readStatus, sourcesOf, storedSources, storedStatus, EMPTY_COUNTS } from "@/lib/email-campaigns/state"
import { normalizeAddress, safeDisplayName } from "@/lib/email-campaigns/address"
import { afterAttempt, classify, MAX_ATTEMPTS, plainReason } from "@/lib/email-campaigns/retry"
import { sanitizeForSend, sanitizeForStorage, visibleText } from "@/lib/email-campaigns/sanitize"
import { checkContent, cleanSubject } from "@/lib/email-campaigns/validate"
import { emailPlanOf, fitsPlan, monthlyLimit } from "@/lib/email-campaigns/limits"
import { buildEmail, emailText, personalizeHtml, personalizeSubject, unknownMergeFields } from "@/lib/email-campaigns/template"
import { appearsIn } from "@/lib/email-campaigns/links"
import { decodeTarget, signLink, verifyLink } from "@/lib/email-campaigns/link-sign"
import { blockIssues, hasRealContent, newBlock, renderBlocks, safeUrl, storeBlocks, textOn, type Block } from "@/lib/email-campaigns/blocks"
import { readStoredBody } from "@/lib/email-campaigns/stored"
import { addressLine, brandName, buttonColors, contrast, httpsUrl, themeOf } from "@/lib/email-campaigns/brand"
import { emailHref, richToEmail } from "@/lib/email-campaigns/rich"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}

/* ─── The pure parts ─────────────────────────────────────────────────── */

console.log("\nThe state machine")
check("a draft may be scheduled or queued, never marked sent", canTransition("draft", "queued") && canTransition("draft", "scheduled") && !canTransition("draft", "sent"))
check("a sent campaign goes nowhere", ["draft", "scheduled", "queued", "sending", "failed"].every((s) => !canTransition("sent", s as never)))
check("queued is reached only from draft and scheduled", sourcesOf("queued").sort().join() === "draft,scheduled")
check("sending is reached from queued and the retry of a failed send", sourcesOf("sending").sort().join() === "failed,partially_failed,queued")
check("an unknown stored status reads as a draft, never as sending", readStatus("weird") === "draft")
check("before the migration, queued is stored as sending and a partial send as sent", storedStatus("queued", true) === "sending" && storedStatus("partially_failed", true) === "sent")
check("before the migration, a stop with nothing out is a draft again", storedStatus("cancelled", true, 0) === "draft" && storedStatus("cancelled", true, 3) === "sent")
check("the legacy WHERE only names statuses the old check knows", storedSources("sending", true).every((s) => ["draft", "scheduled", "sending", "sent", "failed"].includes(s)))
check("all out is sent", finalStatus({ ...EMPTY_COUNTS, sent: 3, total: 3 }) === "sent")
check("some out and some failed is partly sent", finalStatus({ ...EMPTY_COUNTS, sent: 2, failed: 1, total: 3 }) === "partially_failed")
check("none out is failed, even when everyone left the list", finalStatus({ ...EMPTY_COUNTS, skipped: 3, total: 3 }) === "failed")
check("delivered and bounced still count as went out", finalStatus({ ...EMPTY_COUNTS, delivered: 1, bounced: 1, total: 2 }) === "sent")

console.log("\nAddresses")
check("an address is trimmed and lower cased", normalizeAddress("  Ana.Pop@Example.COM ") === "ana.pop@example.com")
check("plus tags and subdomains are fine", normalizeAddress("a+news@mail.example.co.uk") === "a+news@mail.example.co.uk")
for (const bad of ["", "ana", "ana@", "@x.com", "ana@x", "a b@x.com", "ana@x.com\r\nBcc: z@y.com", "ana@@x.com", "ana@x..com", ".ana@x.com", "ana.@x.com", "ana@-x.com", "<ana@x.com>", "ana@x.c"]) {
  check(`refused: ${JSON.stringify(bad)}`, normalizeAddress(bad) === null)
}
check("a display name cannot carry an address or a header break", safeDisplayName('Pay"Pal <support@bank.com>\r\nBcc: x') === "PayPal supportbank.com Bcc x")
check("an empty display name falls back", safeDisplayName("  ") === "Storelib")

console.log("\nProvider answers")
check("a 2xx is sent", classify({ success: true, status: 200 }) === "sent")
check("429, 5xx and a connection that never opened are retried", ["retry", "retry", "retry"].join() === [classify({ success: false, status: 429 }), classify({ success: false, status: 503 }), classify({ success: false, connectFailed: true })].join())
check("a timeout or a dropped connection may have been sent, so it is never retried", classify({ success: false, timedOut: true }) === "unknown" && classify({ success: false }) === "unknown" && /may have arrived/.test(plainReason({ success: false, timedOut: true })))
check("a 400 about the message is a failure, not retried", classify({ success: false, status: 400 }) === "failed")
check("401 and 403 halt the campaign instead of failing addresses", classify({ success: false, status: 401 }) === "halt" && classify({ success: false, status: 403 }) === "halt")
check("no API key halts too", classify({ success: false, notConfigured: true }) === "halt")
check(`after ${MAX_ATTEMPTS} tries a retry becomes a failure`, afterAttempt({ success: false, status: 500 }, MAX_ATTEMPTS) === "failed" && afterAttempt({ success: false, status: 500 }, 1) === "retry")
check("the reason never repeats the provider's words, which can carry the address", !plainReason({ success: false, status: 400, error: "to: ana@x.com is bad" }).includes("ana@"))

console.log("\nThe sanitizer")
const dirty = `<p onclick="steal()">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><img src="data:image/png;base64,AAA"><img src="https://cdn.x.com/a.png" onerror="x()"><div style="display:none">hidden words</div><p style="background:url(https://t.co/x);color:#123456">c</p><iframe src="https://x.com"></iframe><table data-sl-block="button" data-sl-props="{}"><tr><td>b</td></tr></table>`
const sent = sanitizeForSend(dirty)
check("no script, iframe or event handler survives", !/<script|<iframe|onclick|onerror/i.test(sent), sent)
check("a javascript: link loses its href", !/javascript:/i.test(sent))
check("a data: image is dropped", !/data:image/i.test(sent))
check("an https image stays", /<img src="https:\/\/cdn\.x\.com\/a\.png"/.test(sent))
check("display:none is removed, so nothing is hidden in the body", !/display:\s*none/i.test(sent))
check("a style that loads something is removed, a colour stays", !/url\(/i.test(sent) && /color:#123456/.test(sent))
check("the editor's markers are stripped from what is sent", !/data-sl-/.test(sent))
check("and kept in the saved draft", /data-sl-block="button"/.test(sanitizeForStorage(dirty)))
check("visible text reads through entities and tags", visibleText("<p>Hi&nbsp;<b>there</b></p>") === "Hi there")

console.log("\nContent checks")
const facts = (o: Partial<Parameters<typeof checkContent>[0]>) => checkContent({ subject: "Hello", previewText: "", text: "Some words", images: 0, bytes: 100, unknownFields: [], ...o })
check("a normal email passes", facts({}).errors.length === 0)
check("no subject is refused under the subject", facts({ subject: " " }).errors.some((e) => e.field === "subject"))
check("a long subject warns before it refuses", facts({ subject: "x".repeat(70) }).errors.length === 0 && facts({ subject: "x".repeat(70) }).warnings.length === 1 && facts({ subject: "x".repeat(151) }).errors.length === 1)
check("an empty body is refused", facts({ text: "  ", images: 0 }).errors.some((e) => e.field === "body"))
check("a picture alone is content", facts({ text: "", images: 1 }).errors.length === 0)
check("past Gmail's clipping size it warns, past 200 KB it refuses", facts({ bytes: 95_000 }).warnings.length === 1 && facts({ bytes: 250_000 }).errors.length === 1)
check("an unknown {{field}} is refused by name", /\{\{nmae\}\}/.test(facts({ unknownFields: ["nmae"] }).errors[0]?.message ?? ""))
check("unknownMergeFields finds it and ignores the known ones", unknownMergeFields("Hi {{first_name}} {{nmae}} {{ email }}").join() === "nmae")
check("a subject is one line", cleanSubject("Hello\r\nBcc: x") === "Hello Bcc: x")

console.log("\nPlan limits")
check("plans read as the billing page promises", monthlyLimit("free", "active") === 500 && monthlyLimit("growth", "active") === 2000 && monthlyLimit("professional", "active") === 5000)
check("a cancelled plan is free", emailPlanOf("pro", "canceled") === "free")
check("a send that fits, fits", fitsPlan(100, 300, 500).ok)
const over = fitsPlan(300, 300, 500)
check("one that does not says how many are left", !over.ok && /200 left/.test((over as { message: string }).message))

console.log("\nThe brand, checked before an email wears it")
check("a pale accent is not a button anybody could see: the default ink is used", themeOf({ accent: "#fef3c7" }).button === "#1a1a2e")
check("a dark accent keeps white words, a light one ink", themeOf({ accent: "#7c3aed" }).buttonText === "#ffffff" && buttonColors("#f59e0b", themeOf({ accent: "#7c3aed" })).text === "#111827" && buttonColors("#fde047", themeOf({ accent: "#7c3aed" })).fill === "#1a1a2e")
check("links take the accent only when it reads as text on white (4.5:1)", themeOf({ accent: "#7c3aed" }).link === "#7c3aed" && themeOf({ accent: "#f59e0b" }).link === "#111827")
check("the contrast formula is WCAG's", Math.abs(contrast("#ffffff", "#000000") - 21) < 0.01 && Math.abs(contrast("#777777", "#ffffff") - 4.48) < 0.02)
check("a button with no colour of its own wears the brand's", buttonColors("", themeOf({ accent: "#0f766e" })).fill === "#0f766e")
check("half an address is not an address", addressLine({ line1: "12 Main St" }) === null && addressLine({ line1: "12 Main St", city: "Springfield", state: "IL", postal: "62701", country: "United States" }) === "12 Main St, Springfield, IL 62701, United States")
check("a logo is https or nothing", httpsUrl("http://x.com/a.png") === null && httpsUrl("javascript:alert(1)") === null && httpsUrl("https://cdn.x.com/l.png") === "https://cdn.x.com/l.png")
check("a store name is one line with no markup", !/[<>\n]/.test(brandName("  Ana\n<b>Shop</b> ")) && brandName("", null, " Ana ") === "Ana")

console.log("\nRich text, as an inbox draws it")
const theme = themeOf({ accent: "#0f766e" })
const rich = richToEmail(
  `<h2>Title</h2><p onclick="x()">Hi <strong>{{first_name}}</strong>, <a href="javascript:alert(1)">bad</a> <a href="http://ana.shop/new?a=1&amp;b=2">new</a> <a href="mailto:ana@ana.shop">mail</a></p><ul><li>One</li><li>Two<ul><li>Deep</li></ul></li></ul><blockquote><p>Quoted</p></blockquote><hr><script>steal()</script><style>p{}</style><iframe src="https://x.com"></iframe><p><img src="http://cdn.x.com/a.png" alt="A"><img src="data:image/png;base64,AAA"></p><p><a href="https://ana.shop/buy" style="display:inline-block;padding:10px 18px;background-color:#1a1a2e;color:#fff">Buy now</a></p>`,
  theme,
)
check("every element carries its own style", /<h2 style="[^"]*font-size:22px/.test(rich) && /<p style="margin:0 0 16px;[^"]*"/.test(rich) && /<ul style="/.test(rich) && /<blockquote style="[^"]*border-left:3px/.test(rich))
check("nothing that runs survives: no script, no style block, no iframe, no handler", !/<script|<style|<iframe|onclick|javascript:/i.test(rich), rich)
check("a javascript: link keeps its words and loses its link", /, bad </.test(rich) && !/href="javascript/i.test(rich))
check("http links and pictures are upgraded to https", /href="https:\/\/ana\.shop\/new\?a=1&amp;b=2"/.test(rich) && /src="https:\/\/cdn\.x\.com\/a\.png"/.test(rich))
check("mailto stays mailto", /href="mailto:ana@ana\.shop"/.test(rich))
check("an inline picture is dropped", !/data:image/.test(rich))
check("links wear the brand's colour, underlined", /<a href="https:\/\/ana\.shop\/new[^"]*" target="_blank" style="color:#0f766e;text-decoration:underline;">/.test(rich))
check("a nested list stays nested", /<li style="[^"]*">Two<ul style="margin:6px 0 0;/.test(rich))
check("a field stays for the send to fill in", /\{\{first_name\}\}/.test(rich))
check("a paragraph that is only a button becomes a button Outlook paints, in the brand's colour", /bgcolor="#0f766e"[^>]*mso-padding-alt:12px 24px/.test(rich) && /<span style="color:#ffffff;">Buy now<\/span>/.test(rich))
check("a button in the text that chose its own colour keeps it", /bgcolor="#dc2626"/.test(richToEmail('<p><a href="https://x.com" style="display:inline-block;padding:10px 18px;background-color:#dc2626;color:#fff">Go</a></p>', theme)))
check("the unsubscribe placeholder survives as a link", /href="\{\{unsubscribe_url\}\}"/.test(richToEmail('<p><a href="{{unsubscribe_url}}">leave</a></p>', theme)))
check("a relative link means nothing in an inbox and is dropped", !/href=/.test(richToEmail('<p><a href="/app">x</a></p>', theme)))
check("emailHref: https, mailto, tel; never javascript or data", emailHref("http://a.co/x") === "https://a.co/x" && emailHref("tel:+123456") === "tel:+123456" && emailHref("javascript:x") === null && emailHref("data:text/html,x") === null)

console.log("\nThe one layout")
const brand = { name: "Ana & Co", logoUrl: "https://cdn.ana.shop/logo.png", storeUrl: "https://storelib.com/ana", accent: "#0f766e", address: "12 Main St, Springfield, IL 62701" }
const frame = buildEmail({ subject: "Hi <b>", previewText: "Look <here>", bodyHtml: "<p>Body</p>", brand, kind: "marketing", unsubscribeUrl: "https://storelib.com/unsubscribe?token=t1" })
check("the subject, preview and name are escaped", /<title>Hi &lt;b&gt;<\/title>/.test(frame) && /Look &lt;here&gt;/.test(frame) && /Ana &amp; Co/.test(frame))
check("marketing email says who it is from, why, where, and how to leave", /joined Ana &amp; Co's list/.test(frame) && /12 Main St, Springfield, IL 62701/.test(frame) && /href="https:\/\/storelib\.com\/unsubscribe\?token=t1"/.test(frame))
check("the logo is the store's, with its name as alt text, linking to the store", /<a href="https:\/\/storelib\.com\/ana"[^>]*><img class="sl-logo" src="https:\/\/cdn\.ana\.shop\/logo\.png" alt="Ana &amp; Co"/.test(frame))
check("with no logo the store's name is written instead", /class="sl-brand"[^>]*>Ana &amp; Co</.test(buildEmail({ subject: "s", bodyHtml: "", brand: { ...brand, logoUrl: null }, kind: "marketing", unsubscribeUrl: "#" })))
check("fluid to 600px, with a fixed table only for Outlook", /max-width:600px/.test(frame) && /<!--\[if mso\]><table role="presentation" width="600"/.test(frame))
check("dark mode is declared and styled", /name="color-scheme" content="light dark"/.test(frame) && /prefers-color-scheme: dark/.test(frame) && /\[data-ogsc\]/.test(frame))
check("the logo has no frame in any scheme: no border, padding, plate or radius on it, inline or in the style block", (() => {
  const img = /<img class="sl-logo"[^>]*>/.exec(frame)?.[0] ?? ""
  const style = /style="([^"]*)"/.exec(img)?.[1] ?? ""
  return !!img && /border:0/.test(style) && !/padding|background|border-radius|box-shadow|border:\s*[1-9]/.test(style) && !/\.sl-logo\s*\{/.test(frame)
})())
check("the preheader is hidden and padded so the body stays out of the inbox line", /class="sl-preheader" style="display:none;[^"]*mso-hide:all;">Look &lt;here&gt;(&#8199;&#65279;&#847; ){60}/.test(frame))
check("no tracking pixel unless one is given", !/width="1" height="1"/.test(frame) && /width="1" height="1"/.test(buildEmail({ subject: "s", bodyHtml: "", brand, kind: "marketing", unsubscribeUrl: "#", openPixelUrl: "https://storelib.com/api/email/track?t=x" })))
const receipt = buildEmail({ subject: "s", bodyHtml: "<p>x</p>", brand, kind: "transactional", reason: "You bought from Ana." })
check("a receipt has no unsubscribe link and says why it came", !/Unsubscribe/.test(receipt) && /You bought from Ana\./.test(receipt))
const text = emailText({ bodyHtml: richToEmail('<h2>Hello</h2><p>Read <a href="https://x.com/a?b=1&amp;c=2">here</a></p><ul><li>One</li></ul>', theme), brand, kind: "marketing", unsubscribeUrl: "https://u" })
check("the text part is the same words, links written out, lists dashed", /^Hello\n\nRead here \(https:\/\/x\.com\/a\?b=1&c=2\)\n\n- One/.test(text), text)
check("and ends with the name, the address and the way out", text.endsWith("Ana & Co\n12 Main St, Springfield, IL 62701\nYou are getting this because you joined Ana & Co's list.\nUnsubscribe: https://u"), text)
check("a name is escaped when it is put in the body", personalizeHtml("<p>Hi {{first_name}}</p>", { name: "<img src=x> Ana" }) === "<p>Hi &lt;img</p>")
check("a missing name reads there", personalizeSubject("Hi {{ first_name }}", { name: "" }) === "Hi there")
check("click tracking signs https links and leaves mailto, unsubscribe and http alone", (() => {
  const t = trackLinks('<a href="https://x.com/p?a=1&amp;b=2">a</a><a href="mailto:a@b.co">m</a><a href="https://storelib.com/unsubscribe?token=1">u</a>', "11111111-1111-4111-8111-111111111111")
  const m = /api\/email\/click\?u=([A-Za-z0-9_-]+)&amp;t=11111111-1111-4111-8111-111111111111&amp;s=([0-9a-f]{32})/.exec(t)
  return !!m && decodeTarget(m[1]) === "https://x.com/p?a=1&b=2" && verifyLink("11111111-1111-4111-8111-111111111111", "https://x.com/p?a=1&b=2", m[2]) && /mailto:a@b\.co/.test(t) && /storelib\.com\/unsubscribe\?token=1/.test(t)
})())
check("a signature for one reader does not open the redirect for another link", !verifyLink("11111111-1111-4111-8111-111111111111", "https://evil.example/", signLink("11111111-1111-4111-8111-111111111111", "https://x.com/p")))
check("links in emails sent before signatures still decode", decodeTarget(Buffer.from("https://x.com/a").toString("base64")) === "https://x.com/a")
check("the old redirect check still follows a link that is in the email, escaped or not", appearsIn('<a href="https://x.com/a?b=1&amp;c=2">x</a>', "https://x.com/a?b=1&c=2") && appearsIn("<a href='https://x.com/'>x</a>", "https://x.com"))
check("and refuses one that is not", !appearsIn('<a href="https://x.com/a">x</a>', "https://evil.example/a"))

console.log("\nBlocks, saved and read back")
check("a link without a scheme gets https, http is upgraded, a script link is refused", safeUrl("example.com/x") === "https://example.com/x" && safeUrl("http://example.com/x") === "https://example.com/x" && safeUrl("javascript:alert(1)") === "" && safeUrl("/relative") === "")
check("button text is white on dark and ink on light", textOn("#1a1a2e") === "#ffffff" && textOn("#fde68a") === "#111827")
const blocks: Block[] = [
  newBlock("rich", { html: "<h2>Title</h2><p>Hello <a href=\"https://ana.shop\">there</a>, {{first_name}}</p><ul><li>One</li><li>Two</li></ul>" } as Partial<Block>),
  newBlock("button", { label: "Buy <now>", url: "shop.example.com" } as Partial<Block>),
  newBlock("button", { label: "Mine", url: "https://x.com", color: "#dc2626" } as Partial<Block>),
  newBlock("image", { src: "https://cdn.x.com/a.png", alt: "", width: 50 } as Partial<Block>),
  newBlock("product", { productId: "p1", title: "Guide", price: "$9.00", url: "https://storelib.com/ana/guide", imageUrl: "https://cdn.x.com/g.png" } as Partial<Block>),
  newBlock("divider"),
  newBlock("spacer", { size: 48 } as Partial<Block>),
]
const html = renderBlocks(blocks, themeOf({ accent: "#0f766e" }))
check("text renders as email HTML", /<h2 style="[^"]*">Title<\/h2>/.test(html) && /<ul style="[^"]*"><li style="[^"]*">One<\/li>/.test(html))
check("a button is a table with an escaped label and a real link", /<a href="https:\/\/shop\.example\.com\/"[^>]*><span[^>]*>Buy &lt;now&gt;<\/span><\/a>/.test(html))
check("a button with no colour wears the brand, one with a colour keeps it", /bgcolor="#0f766e"[^>]*>[^]*Buy &lt;now&gt;/.test(html) && /bgcolor="#dc2626"/.test(html))
check("an image at half width is 260px wide and fluid", /width="260"/.test(html) && /max-width:260px/.test(html) && /width:100%;max-width:260px/.test(html))
check("what is sent carries no editor markers", !/data-sl-/.test(html))
const stored = storeBlocks(blocks)
check("what is saved marks every block", (stored.match(/data-sl-block=/g) ?? []).length === blocks.length)
const back = readStoredBody(sanitizeForStorage(stored))
check("a saved draft reads back as the same blocks, through the storage sanitizer", back.blocks.map((b) => b.type).join() === blocks.map((b) => b.type).join() && !back.legacy, back.blocks.map((b) => b.type))
check("a text block comes back as the editor's HTML", back.blocks[0].type === "rich" && /^<h2>Title<\/h2><p>Hello <a href="https:\/\/ana\.shop"[^>]*>there<\/a>, \{\{first_name\}\}<\/p><ul><li>One<\/li><li>Two<\/li><\/ul>$/.test((back.blocks[0] as { html: string }).html), (back.blocks[0] as { html: string }).html)
check("a block's settings come back, colour included", (back.blocks[2] as { color: string }).color === "#dc2626" && (back.blocks[1] as { color: string }).color === "" && (back.blocks[3] as { width: number }).width === 50)
check("and render the same as before they were saved", renderBlocks(back.blocks, themeOf({ accent: "#0f766e" })) === html)
const firstComposer = readStoredBody('<h2 data-sl-block="text" data-sl-style="h2" style="x">Hi</h2><ul data-sl-block="list"><li>A</li><li>B</li></ul>')
check("a draft from the first composer reads as rich text", firstComposer.blocks.length === 2 && firstComposer.blocks.every((b) => b.type === "rich") && /<h2>Hi<\/h2>/.test((firstComposer.blocks[0] as { html: string }).html) && /<ul><li>A<\/li><li>B<\/li><\/ul>/.test((firstComposer.blocks[1] as { html: string }).html))
const legacy = readStoredBody('<p>Hello</p><p><img src="https://cdn.x.com/p.png" alt="P"></p><div style="text-align:center"><a href="https://ana.shop" style="display:inline-block;padding:12px 24px;background-color:#2563eb;color:#fff">Shop</a></div><p>Bye</p>')
check("a draft from the old editor: its words, its picture and its button come back as blocks", legacy.legacy && legacy.blocks.map((b) => b.type).join() === "rich,image,button,rich" && (legacy.blocks[2] as { color: string; align: string }).color === "#2563eb" && (legacy.blocks[2] as { align: string }).align === "center", legacy.blocks)
check("an empty body is one empty text block", readStoredBody("").blocks.length === 1 && readStoredBody("").blocks[0].type === "rich")
check("a saved block cannot smuggle a script through its settings", !/<script|javascript:/i.test(renderBlocks(readStoredBody(`<div data-sl-block="button" data-sl-props="${'{"label":"<script>x</script>","url":"javascript:alert(1)"}'.replace(/"/g, "&quot;")}"></div>`).blocks)))
check("a lone divider is not content", !hasRealContent([newBlock("divider")]) && hasRealContent(blocks))
check("an image without a description is a warning, an empty button an error", (() => {
  const issues = blockIssues([...blocks, newBlock("button")])
  return issues.some((i) => i.level === "warning") && issues.some((i) => i.level === "error" && /no text/.test(i.message))
})())

/* ─── The queue ──────────────────────────────────────────────────────── */

const CREATOR = "c-1"

function seed(db: FakeDb, o: { plan?: string; handle?: string; subscribers?: { email: string; status?: string; is_active?: boolean; source?: string }[] } = {}) {
  db.tables.creators.push({ id: CREATOR, user_id: "u-1", support_email: "Help@Ana.Shop", slug: "ana", headline: null, subscription_plan_id: o.plan ?? "pro", subscription_status: "active" })
  db.tables.profiles.push({ id: "u-1", email: "ana@example.com", display_name: "Ana Pop", username: o.handle ?? "anapop", avatar_url: null, address_line1: "12 Main St", city: "Springfield", state: "IL", postal_code: "62701", country: "United States" })
  const subs = o.subscribers ?? [
    { email: "one@example.com" },
    { email: "two@example.com" },
    { email: "Three@Example.com" },
    { email: "three@example.com" },
    { email: "left@example.com", status: "unsubscribed" },
    { email: "bounced@example.com", status: "bounced" },
    { email: "not-an-address" },
    { email: "off@example.com", is_active: false },
  ]
  subs.forEach((s, i) =>
    db.tables.subscribers.push({ id: `s-${i}`, creator_id: CREATOR, email: s.email, name: i === 0 ? "One Person" : null, status: s.status ?? "subscribed", is_active: s.is_active ?? true, source: s.source ?? "onepage", subscribed_at: tick(), unsubscribe_token: `unsub-${i}` }),
  )
}

function campaign(db: FakeDb, over: Record<string, unknown> = {}) {
  const row = {
    id: `camp-${db.tables.email_campaigns.length + 1}`,
    creator_id: CREATOR,
    subject: "Hello {{first_name}}",
    preview_text: "A short note",
    body: storeBlocks([newBlock("rich", { html: "<p>Hi {{first_name}}, new things.</p>" } as Partial<Block>), newBlock("button", { label: "Look", url: "https://ana.shop/new" } as Partial<Block>)]),
    status: "draft",
    audience_type: "all",
    segment_id: null,
    from_name: null,
    scheduled_at: null,
    sent_at: null,
    audience_count: 0,
    updated_at: tick(),
    created_at: tick(),
    ...(db.modern ? { last_error: null, send_idempotency_key: null, completed_at: null } : {}),
    ...over,
  }
  db.tables.email_campaigns.push(row)
  return row
}

type Sent = { to: string; subject: string; html: string; text: string; headers: Record<string, string>; messageId?: string }
function provider(answers: Record<string, ({ success: boolean; status?: number } | undefined)[]> = {}) {
  const log: Sent[] = []
  const send = async (m: Sent) => {
    log.push(m)
    const queue = answers[m.to]
    const next = queue && queue.length ? queue.shift() : undefined
    const a = next ?? { success: true, status: 200 }
    return a.success ? { ...a, messageId: `<mg-${log.length}@x>` } : a
  }
  return { log, send: send as never }
}

const soon = () => Date.now() + 120_000
const noSleep = async () => {}

for (const modern of [true, false]) {
  console.log(`\nThe queue, ${modern ? "after" : "before"} the migration`)
  resetSchemaCache()
  let db = new FakeDb({ modern })
  seed(db)
  check("the schema is read from the database", (await isModernSchema(db)) === modern)

  const aud = await resolveAudience(db, CREATOR, "all")
  check("the audience drops unsubscribed, bounced, inactive, invalid and duplicate addresses", aud.recipients.map((r) => r.email).sort().join() === "one@example.com,three@example.com,two@example.com" && aud.excluded === 5, aud)

  let c = campaign(db)
  const dry = await startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft", "scheduled"], dryRun: true })
  check("the confirm step counts after suppression and changes nothing", dry.kind === "dry_run" && dry.recipients === 3 && dry.excluded === 5 && db.tables.email_campaigns[0].status === "draft" && db.tables.campaign_recipients.length === 0, dry)
  check("and shows the sender: our domain, the creator's name, their reply address", dry.kind === "dry_run" && dry.sender.from === "Ana Pop <noreply@storelib.com>" && dry.sender.replyTo === "help@ana.shop", dry)

  const [a, b] = await Promise.all([
    startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft", "scheduled"], idempotencyKey: "k1" }),
    startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft", "scheduled"], idempotencyKey: "k2" }),
  ])
  const kinds = [a.kind, b.kind].sort().join()
  check("two Sends at once: one starts, the other is told it is under way", kinds === "already,started", [a, b])
  check("one row per address", db.tables.campaign_recipients.length === 3)
  check(`the campaign reads ${modern ? "queued" : "sending"}`, db.tables.email_campaigns[0].status === (modern ? "queued" : "sending"))
  const again = await startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft", "scheduled"], idempotencyKey: "k1" })
  check("the same key again is the same send", again.kind === "already")

  const p = provider()
  const started = a.kind === "started" ? a : (b as typeof a)
  const [r1, r2] = await Promise.all([
    processCampaign(db, c.id, { deadline: soon(), leaseFrom: started.kind === "started" ? started.leaseFrom : null, send: p.send, sleep: noSleep }),
    processCampaign(db, c.id, { deadline: soon(), send: p.send, sleep: noSleep }),
  ])
  check("a second worker finds the lease held and leaves", [r1.outcome, r2.outcome].includes("busy") || [r1.outcome, r2.outcome].includes("lost"), [r1, r2])
  const perAddress = new Map<string, number>()
  p.log.forEach((m) => perAddress.set(m.to, (perAddress.get(m.to) ?? 0) + 1))
  check("every address got exactly one message", p.log.length === 3 && [...perAddress.values()].every((n) => n === 1), [...perAddress])
  check("the campaign is sent, with the count of what went out", db.tables.email_campaigns[0].status === "sent" && db.tables.email_campaigns[0].audience_count === 3, db.tables.email_campaigns[0])
  check("each row is sent, with the provider's id", db.tables.campaign_recipients.every((r) => r.status === "sent" && typeof r.provider_message_id === "string"))
  const m = p.log.find((x) => x.to === "one@example.com")!
  check("the subject and body carry the reader's first name", m.subject === "Hello One" && /Hi One, new things/.test(m.html))
  check("the reader's own unsubscribe link, and the one-click header", /unsubscribe\?token=unsub-0/.test(m.html) && m.headers["List-Unsubscribe"] === "<https://storelib.com/api/email/unsubscribe?token=unsub-0>" && m.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click")
  check("links go through the signed click counter and the open is counted", /api\/email\/click\?u=[A-Za-z0-9_-]+&amp;t=[^&]+&amp;s=[0-9a-f]{32}/.test(m.html) && /api\/email\/track\?t=/.test(m.html))
  check("it is drawn in the one layout, in the creator's name, with their address", /Ana Pop/.test(m.html) && /12 Main St, Springfield, IL 62701, United States/.test(m.html) && /max-width:600px/.test(m.html))
  check("the text part is the same email, with the way out", /Hi One, new things\./.test((m as unknown as { text: string }).text ?? "") && /Unsubscribe: https:\/\/storelib\.com\/unsubscribe\?token=unsub-0/.test((m as unknown as { text: string }).text ?? ""))
  check("the Message-Id is fixed to the row, so a resend is the same message", /^<c.+\.r.+@/.test(m.messageId ?? ""))
  check("the editor's markers are not in what was sent", !/data-sl-/.test(m.html))
  const more = await processCampaign(db, c.id, { deadline: soon(), send: p.send, sleep: noSleep })
  check("working a sent campaign again sends nothing", more.outcome === "not_active" && p.log.length === 3)

  /* Failures, retries and halts. */
  resetSchemaCache()
  db = new FakeDb({ modern })
  seed(db)
  c = campaign(db)
  const s2 = await startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft"] })
  const p2 = provider({ "one@example.com": [{ success: false, status: 503 }], "two@example.com": [{ success: false, status: 400 }] })
  let sleeps = 0
  const passTime = async () => {
    sleeps++
    for (const r of db.tables.campaign_recipients) if (r.next_attempt_at) r.next_attempt_at = new Date(Date.now() - 1000).toISOString()
  }
  await processCampaign(db, c.id, { deadline: soon(), leaseFrom: s2.kind === "started" ? s2.leaseFrom : null, send: p2.send, sleep: passTime })
  const byEmail = (e: string) => db.tables.campaign_recipients.find((r) => r.email === e)!
  check("a 503 is tried again and then goes", byEmail("one@example.com").status === "sent" && p2.log.filter((x) => x.to === "one@example.com").length === 2)
  check("a 400 is recorded as failed with a plain reason, and not retried", byEmail("two@example.com").status === "failed" && /refused/.test(String(byEmail("two@example.com").error_message)) && p2.log.filter((x) => x.to === "two@example.com").length === 1)
  check("the campaign reads partly sent", db.tables.email_campaigns[0].status === (modern ? "partially_failed" : "sent"))
  if (modern) check("with the reason kept", /refused/.test(String(db.tables.email_campaigns[0].last_error)))
  check("the retry waited instead of hammering", sleeps >= 1)

  const retry = await retryFailed(db, CREATOR, c.id)
  const p3 = provider()
  await processCampaign(db, c.id, { deadline: soon(), leaseFrom: retry.leaseFrom, send: p3.send, sleep: noSleep })
  if (modern) {
    check("Send again to the failed ones mails only them", retry.retried === 1 && p3.log.length === 1 && p3.log[0].to === "two@example.com" && db.tables.email_campaigns[0].status === "sent")
  } else {
    check("before the migration a partial send reads sent and can still be retried", retry.ok && p3.log.every((x) => x.to === "two@example.com"))
  }

  /* A halt: the provider refuses us, nobody is marked failed. */
  resetSchemaCache()
  db = new FakeDb({ modern })
  seed(db)
  c = campaign(db)
  const s3 = await startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft"] })
  const p4 = provider({ "one@example.com": [{ success: false, status: 401 }], "two@example.com": [{ success: false, status: 401 }], "three@example.com": [{ success: false, status: 401 }] })
  const halted = await processCampaign(db, c.id, { deadline: soon(), leaseFrom: s3.kind === "started" ? s3.leaseFrom : null, send: p4.send, sleep: noSleep })
  check("a 401 halts the campaign", halted.outcome === "halted")
  check("and fails nobody", db.tables.campaign_recipients.every((r) => r.status === "pending"), db.tables.campaign_recipients.map((r) => r.status))
  check("the campaign stays sending", db.tables.email_campaigns[0].status === "sending")
  if (modern) check("with a reason the creator can read", /Paused/.test(String(db.tables.email_campaigns[0].last_error)))

  /* Somebody leaves between Send and their turn. */
  resetSchemaCache()
  db = new FakeDb({ modern })
  seed(db)
  c = campaign(db)
  const s4 = await startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft"] })
  db.tables.subscribers.find((s) => s.email === "two@example.com")!.status = "unsubscribed"
  const p5 = provider()
  await processCampaign(db, c.id, { deadline: soon(), leaseFrom: s4.kind === "started" ? s4.leaseFrom : null, send: p5.send, sleep: noSleep })
  check("someone who left after Send is not mailed", !p5.log.some((x) => x.to === "two@example.com") && p5.log.length === 2)
  check(`and their row reads ${modern ? "skipped" : "failed with the reason"}`, byEmail("two@example.com").status === (modern ? "skipped" : "failed") && /Left the list/.test(String(byEmail("two@example.com").error_message)))

  /* Stop. */
  resetSchemaCache()
  db = new FakeDb({ modern })
  seed(db)
  c = campaign(db)
  await startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft"] })
  const stop = await cancelSend(db, CREATOR, c.id)
  const p6 = provider()
  const afterStop = await processCampaign(db, c.id, { deadline: soon(), send: p6.send, sleep: noSleep })
  check("Stop before the worker starts sends nothing", stop.ok && p6.log.length === 0 && afterStop.outcome === "not_active", { stop, afterStop })
  check(`and reads ${modern ? "stopped" : "a draft again"}`, db.tables.email_campaigns[0].status === (modern ? "cancelled" : "draft"))
}

console.log("\nCrashes, leases and the cron (after the migration)")
{
  resetSchemaCache()
  const db = new FakeDb({ modern: true })
  seed(db)
  const c = campaign(db)
  await startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft"] })
  /* A worker claimed a row and died. */
  const row = db.tables.campaign_recipients[0]
  row.status = "sending"
  row.claimed_at = new Date(Date.now() - 10 * 60_000).toISOString()
  row.attempts = 1
  const p = provider()
  const fresh = await processCampaign(db, c.id, { deadline: soon(), send: p.send, sleep: noSleep })
  check("a live lease is not taken over", fresh.outcome === "busy" && p.log.length === 0)
  db.tables.email_campaigns[0].updated_at = new Date(Date.now() - 5 * 60_000).toISOString()
  const run = await runCampaignQueue(db, soon(), { send: p.send, sleep: noSleep })
  check("the cron takes over a quiet campaign", run.processed === 1)
  check("the row left mid-send is not sent again: it may already be in the inbox", p.log.filter((x) => x.to === row.email).length === 0 && p.log.length === 2)
  const counts = await countRecipients(db, c.id)
  check("it is counted as may not have arrived, the rest went out", counts.unknown === 1 && counts.sent === 2 && db.tables.email_campaigns[0].status === "partially_failed", counts)
  check("with the reason the creator reads", /may have arrived/.test(String(db.tables.email_campaigns[0].last_error)))
  const again = await retryFailed(db, CREATOR, c.id)
  check("Send again never picks up a message that may have arrived", again.retried === 0 && db.tables.campaign_recipients.find((r) => r.id === row.id)!.status === "unknown")
}
{
  resetSchemaCache()
  const db = new FakeDb({ modern: true })
  seed(db)
  const c = campaign(db, { track_opens: false })
  const s = await startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft"] })
  const p = provider({ "one@example.com": [{ success: false, timedOut: true } as never], "two@example.com": [{ success: false, connectFailed: true } as never] })
  await processCampaign(db, c.id, { deadline: soon(), leaseFrom: s.kind === "started" ? s.leaseFrom : null, send: p.send, sleep: async () => { for (const r of db.tables.campaign_recipients) if (r.next_attempt_at) r.next_attempt_at = new Date(Date.now() - 1000).toISOString() } })
  const by = (e: string) => db.tables.campaign_recipients.find((r) => r.email === e)!
  check("a timeout is sent once and kept as may not have arrived", p.log.filter((x) => x.to === "one@example.com").length === 1 && by("one@example.com").status === "unknown")
  check("a connection that never opened is tried again and goes", p.log.filter((x) => x.to === "two@example.com").length === 2 && by("two@example.com").status === "sent")
  check("with counting opens off, no pixel is sent", p.log.length > 0 && p.log.every((x) => !/api\/email\/track/.test(x.html)))
}
{
  resetSchemaCache()
  const db = new FakeDb({ modern: true })
  seed(db)
  const c = campaign(db, { status: "scheduled", scheduled_at: new Date(Date.now() - 60_000).toISOString() })
  const later = campaign(db, { status: "scheduled", scheduled_at: new Date(Date.now() + 3_600_000).toISOString() })
  const run = await runCampaignQueue(db, soon(), { send: provider().send, sleep: noSleep })
  check("a due scheduled campaign is started and sent by the cron", run.started === 1 && db.tables.email_campaigns.find((x) => x.id === c.id)!.status === "sent")
  check("one not yet due is left alone", db.tables.email_campaigns.find((x) => x.id === later.id)!.status === "scheduled")
  const empty = campaign(db, { status: "scheduled", scheduled_at: new Date(Date.now() - 60_000).toISOString(), body: "<p> </p>" })
  await runCampaignQueue(db, soon(), { send: provider().send, sleep: noSleep })
  const e = db.tables.email_campaigns.find((x) => x.id === empty.id)!
  check("a scheduled campaign that cannot go says why instead of vanishing", e.status === "failed" && /Write something/.test(String(e.last_error)), e)
}

console.log("\nWhat stops a send before it starts")
{
  resetSchemaCache()
  const db = new FakeDb({ modern: true })
  seed(db, { plan: "free" })
  for (let i = 0; i < 499; i++) db.tables.campaign_recipients.push({ id: `old-${i}`, campaign_id: "old", creator_id: CREATOR, email: `x${i}@x.com`, status: "sent", created_at: tick() })
  const c = campaign(db)
  const r = await startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft"] })
  check("past the plan's monthly limit it is refused with the numbers", r.kind === "invalid" && r.status === 402 && /1 left/.test(r.errors[0].message), r)
  check("and nothing moved", db.tables.email_campaigns[0].status === "draft")
}
{
  resetSchemaCache()
  const db = new FakeDb({ modern: true })
  seed(db, { handle: "slotgacor777maxwin" })
  const c = campaign(db)
  const r = await startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft"] })
  check("an account the spam checks block cannot send", r.kind === "invalid" && r.status === 403, r)
}
{
  resetSchemaCache()
  const db = new FakeDb({ modern: true })
  seed(db)
  const c = campaign(db)
  const r = await startSend(db, { creatorId: CREATOR, campaignId: c.id, from: ["draft"], expectedUpdatedAt: "2020-01-01T00:00:00.000Z" })
  check("an edit from another tab is a conflict, not a send of the wrong text", r.kind === "conflict")
  const none = campaign(db, { audience_type: "store_builder" })
  const r2 = await startSend(db, { creatorId: CREATOR, campaignId: none.id, from: ["draft"] })
  check("an empty audience is refused under To", r2.kind === "invalid" && r2.errors[0].field === "audience", r2)
  const bad = campaign(db, { subject: "" })
  const r3 = await startSend(db, { creatorId: CREATOR, campaignId: bad.id, from: ["draft"] })
  check("no subject is refused under Subject", r3.kind === "invalid" && r3.errors[0].field === "subject")
  const unk = prepareContent({ subject: "Hi {{frist_name}}", body: "<p>x y</p>" })
  check("a misspelt field is caught before sending", unk.errors.some((e) => /frist_name/.test(e.message)))
}
{
  resetSchemaCache()
  const db = new FakeDb({ modern: true })
  seed(db)
  db.tables.email_segments.push({ id: "seg-1", creator_id: CREATOR, filters: { subscriber_ids: ["s-1", "s-4"] } })
  db.tables.email_segments.push({ id: "seg-other", creator_id: "someone-else", filters: { subscriber_ids: ["s-0"] } })
  const seg = await resolveAudience(db, CREATOR, "segment", "seg-1")
  check("a segment reaches its own members who are still subscribed", seg.recipients.map((r) => r.email).join() === "two@example.com" && seg.excluded === 1, seg)
  const foreign = await resolveAudience(db, CREATOR, "segment", "seg-other")
  check("another creator's segment reaches nobody", foreign.recipients.length === 0)
}
{
  resetSchemaCache()
  const db = new FakeDb({ modern: true })
  seed(db, { subscribers: [{ email: "fan@example.com" }, { email: "buyer@example.com", status: "customer" }, { email: "left@example.com", status: "unsubscribed" }] })
  const aud = await resolveAudience(db, CREATOR, "all")
  check("a buyer who never asked for news (a customer) gets no campaign, and is not counted as left out", aud.recipients.map((r) => r.email).join() === "fan@example.com" && aud.excluded === 1, aud)
  db.tables.email_segments.push({ id: "seg-2", creator_id: CREATOR, filters: { subscriber_ids: ["s-0", "s-1"] } })
  const seg = await resolveAudience(db, CREATOR, "segment", "seg-2")
  check("not even when a segment names them", seg.recipients.map((r) => r.email).join() === "fan@example.com", seg)
}

console.log("\nThe routes are wired to the pipeline")
{
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
  const send = read("app/api/email/send/route.ts")
  check("the send route starts with the conditional move and works in after()", /startSend\(/.test(send) && /after\(/.test(send) && /maxDuration = 300/.test(send))
  check("the send route is rate limited per creator", /rateLimit\(/.test(send))
  check("the send route never returns a database error's words", !/error\.message/.test(send))
  const test = read("app/api/email/send-test/route.ts")
  check("a test send only goes to the account's own addresses, rate limited", /ownAddresses|own address/i.test(test) && /rateLimit\(/.test(test))
  const cron = read("app/api/cron/process-scheduled-emails/route.ts")
  check("the cron runs the campaign queue", /runCampaignQueue\(/.test(cron))
  const click = read("app/api/email/click/route.ts")
  check("the click redirect only follows a signed link, or one in that email", /verifyLink\(/.test(click) && /appearsIn\(/.test(click))
  const unsub = read("app/api/email/unsubscribe/route.ts")
  check("one-click unsubscribe accepts the form POST mail clients send", /List-Unsubscribe=One-Click/.test(unsub))
  const sql = read("supabase/sql/RUN_EMAIL_SENDING.sql")
  const statements = sql.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.trim()).filter(Boolean)
  check("every SQL line is a whole statement", statements.every((l) => l.endsWith(";")), statements.filter((l) => !l.endsWith(";")))
  check("the migration and the RUN file are the same", sql === read("supabase/migrations/20260929_email_sending.sql"))
  check("no -- comments in the SQL", !/^\s*--/m.test(sql))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
