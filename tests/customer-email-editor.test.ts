/**
 * Settings › Customer emails: the preview opens at once (drawn in the
 * browser by the template that sends it), a store can change each email's
 * subject, heading, opening text and button label with placeholders, the
 * words are saved per store and used by the senders, and nothing typed can
 * put HTML in an email.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/customer-email-editor.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CUSTOMER_EMAILS, previewCustomerEmail, visibleCustomerEmails } from "@/lib/emails/customer-catalog"
import { COPY_FIELDS, DEFAULT_COPY, PLACEHOLDERS, cleanCopyText, emailIdForJob, fillPlaceholders, itemsText, readCopy, readSavedCopy, resolveCopy, unknownPlaceholders } from "@/lib/emails/customer-custom"
import { checkoutReminderEmail, orderCancelledEmail, orderConfirmationEmail, refundEmail, returnEmail, shipmentEmail } from "@/lib/physical/email-templates"
import { buyerReceiptEmailHtml, buyerReceiptEmailText } from "@/lib/receipts/email"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const SHOP = { name: "Astrid Studio", supportEmail: "hello@astrid.studio", currency: "USD" }

console.log("\nEvery email in Settings can be changed, and has defaults\n")
{
  /* Changed on purpose: the digital Refund is listed with nothing to edit (its words are Storelib's, drawn by lib/emails/notices.ts); every email that can be edited has its four parts. */
  /* Changed on purpose (round AE2): the digital Refund and the seven membership emails take the store's words too, so every listed email is editable. */
  check("every listed email has default words for all four parts", CUSTOMER_EMAILS.every((e) => e.editable) && CUSTOMER_EMAILS.every((e) => DEFAULT_COPY[e.id] && COPY_FIELDS.every((f) => typeof DEFAULT_COPY[e.id][f] === "string")))
  check("every listed email draws a preview", CUSTOMER_EMAILS.every((e) => !!previewCustomerEmail(e.id, SHOP)?.html))
  check("the checkout reminder is listed for every store; shipping ones only with physical commerce", visibleCustomerEmails(false).some((e) => e.id === "checkout_reminder") && !visibleCustomerEmails(false).some((e) => e.id === "shipping_confirmation") && visibleCustomerEmails(true).some((e) => e.id === "shipping_confirmation"))
  const words = Object.values(DEFAULT_COPY).flatMap((c) => Object.values(c)).join(" ")
  check("default words: no em dash, none of the banned words", !/[—–]/.test(words) && !/\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)/i.test(words))
  check("defaults use only known placeholders", Object.values(DEFAULT_COPY).every((c) => COPY_FIELDS.every((f) => unknownPlaceholders(c[f]).length === 0)))
}

console.log("\nWhat is typed is plain text\n")
{
  check("tags are taken out when saved", cleanCopyText('Hi <img src=x onerror="alert(1)">there<script>x</script>', "body") === "Hi therex")
  check("a subject or button is one line", cleanCopyText("Order\n{{order_number}}\tconfirmed", "subject") === "Order {{order_number}} confirmed")
  check("the text keeps its paragraphs, never more than one blank line", cleanCopyText("One\n\n\n\nTwo\nThree", "body") === "One\n\nTwo\nThree")
  check("lengths are held", cleanCopyText("x".repeat(500), "subject").length === 150 && cleanCopyText("x".repeat(500), "button").length === 40)
  const bad = readCopy("order_confirmation", { body: "Hi {{ordr_number}}" })
  check("an unknown placeholder is refused with the ones allowed", bad.ok === false && /ordr_number/.test(bad.error) && PLACEHOLDERS.every((p) => (bad as { error: string }).error.includes(`{{${p.key}}}`)))
  const same = readCopy("order_confirmation", { ...DEFAULT_COPY.order_confirmation })
  check("words that match the default are not saved (the template keeps its own, order by order)", same.ok && same.copy === null)
  const changed = readCopy("order_confirmation", { ...DEFAULT_COPY.order_confirmation, heading: "Thanks, {{customer_name}}!" })
  check("only what changed is saved", changed.ok && JSON.stringify(changed.copy) === JSON.stringify({ heading: "Thanks, {{customer_name}}!" }))
  check("an email id that isn't one is refused", readCopy("seller_payout", { subject: "x" }).ok === false)
  const raw = readSavedCopy({ refund: { subject: "<b>Refund</b> {{order_number}}", body: "<script>alert(1)</script>ok" }, nope: { subject: "x" }, shipping_confirmation: { body: "{{evil}}" } })
  check("words read back are cleaned again: tags out, unknown ids and placeholders dropped", raw.refund?.subject === "Refund {{order_number}}" && raw.refund?.body === "alert(1)ok" && !("nope" in raw) && !raw.shipping_confirmation, raw)
}

console.log("\nPlaceholders fill in, escaped\n")
{
  const vars = { customer_name: '<b onmouseover="x">Ada</b>', order_number: "#1042", shop_name: "Astrid & Co", items: itemsText(["Mug", "Apron"]) }
  const r = resolveCopy({ subject: "Order {{order_number}} from {{shop_name}}", heading: "Thanks {{customer_name}}", body: "Hi {{ customer_name }},\nwe got {{items}}.\n\nSee you.", button: "Open {{order_number}}" }, vars)!
  check("the subject is plain text with the values in", r.subject === "Order #1042 from Astrid & Co")
  check("the opening text is escaped HTML: a name cannot write markup", r.introHtml === "Hi &lt;b onmouseover=&quot;x&quot;&gt;Ada&lt;/b&gt;,<br>we got Mug and Apron.<br><br>See you." , r.introHtml)
  check("no first name reads there", fillPlaceholders("Hi {{customer_name}}", {}) === "Hi there")
  check("{{items}} names what they bought", itemsText(["Mug"]) === "Mug" && itemsText(["Mug", "Apron", "Honey"]) === "Mug and 2 more" && itemsText([]) === "your order")
  const conf = orderConfirmationEmail({ shopName: "Astrid", orderNumber: "#1042", buyerFirstName: "Ada", lines: [{ title: "Mug", variantName: null, quantity: 1, cents: 1000, imageUrl: null }], totals: { subtotal: 1000, discount: 0, shipping: 0, shippingDiscount: 0, tax: 0, taxIncluded: false, total: 1000, currency: "USD" }, address: null, deliveryName: null, deliveryEstimate: null, statusUrl: "https://storelib.com/o/1", hasDownloads: false, copy: resolveCopy({ heading: "<i>Yay</i> {{customer_name}}", button: "See it <now>" }, vars) })
  check("a heading and a button label are escaped by the template", conf.html.includes("&lt;i&gt;Yay&lt;/i&gt; &lt;b onmouseover=&quot;x&quot;&gt;Ada&lt;/b&gt;") && conf.html.includes("See it &lt;now&gt;") && !conf.html.includes("<i>Yay"))
}

console.log("\nThe templates use the store's words, and keep the order's facts\n")
{
  const vars = { customer_name: "Ada", order_number: "#1042", shop_name: "Astrid", items: "Mug" }
  const copy = resolveCopy({ subject: "Your {{shop_name}} order {{order_number}}", heading: "On its way, {{customer_name}}", body: "Packed with care.", button: "Follow it" }, vars)
  const ship = shipmentEmail({ shopName: "Astrid", orderNumber: "#1042", buyerFirstName: "Ada", lines: [{ title: "Mug", variantName: null, quantity: 1, cents: 0, imageUrl: null }], carrier: "DHL", trackingNumber: "JD1", trackingUrl: "https://dhl.example/JD1", address: null, statusUrl: "https://storelib.com/o/1", kind: "shipped", copy })
  check("shipping: subject, heading, text and button are the store's", ship.subject === "Your Astrid order #1042" && ship.html.includes("On its way, Ada") && ship.html.includes("Packed with care.") && ship.html.includes("Follow it") && ship.text.includes("Packed with care."))
  check("  the tracking number and items are still there", ship.html.includes("JD1") && ship.html.includes("Mug"))
  const cancelled = orderCancelledEmail({ shopName: "Astrid", orderNumber: "#1042", buyerFirstName: "Ada", reason: null, refundedCents: 9300, totalCents: 9300, currency: "USD", lines: [], statusUrl: "https://storelib.com/o/1", copy: resolveCopy({ body: "Sorry about this." }, vars) })
  check("cancelled: the refund is said whatever the store wrote", cancelled.html.includes("Sorry about this.") && cancelled.html.includes("Your payment of $93.00 was refunded"))
  const done = returnEmail({ shopName: "Astrid", orderNumber: "#1042", status: "completed", note: null, refundedCents: 3200, currency: "USD", statusUrl: "https://storelib.com/o/1", copy: resolveCopy({ body: "All done." }, vars) })
  check("return complete: the refund is said whatever the store wrote", done.html.includes("All done.") && done.html.includes("$32.00"))
  const refund = refundEmail({ shopName: "Astrid", orderNumber: "#1042", buyerFirstName: "Ada", amountCents: 3200, refundedCents: 3200, totalCents: 9300, currency: "USD", paymentLabel: null, statusUrl: "https://storelib.com/o/1", copy: resolveCopy({ heading: "Money back" }, vars) })
  check("refund: the amounts table stays", refund.html.includes("Money back") && refund.html.includes("This refund") && refund.html.includes("$32.00"))
  const untouched = shipmentEmail({ shopName: "Astrid", orderNumber: "#1042", buyerFirstName: "Ada", lines: [], carrier: null, trackingNumber: null, trackingUrl: null, address: null, statusUrl: "https://storelib.com/o/1", kind: "shipped", partial: true })
  check("with nothing saved, the template's own words, part shipments included", untouched.html.includes("Part of your order is on the way") && untouched.subject === "Part of order #1042 is on the way")
  const receipt = { firstName: "Ada", sellerName: "Astrid", orderNumber: "AB12", dateText: "1 May", items: [{ title: "Course", variantName: null, amountText: "$49.00", note: null }], subtotalText: "$49.00", tipText: null, taxText: "$9.31", taxIncluded: false, totalText: "$58.31", refundedText: null, link: "https://storelib.com/receipt/x", buttonLabel: "Get it", supportEmail: "a@b.co", heading: "Welcome <in>", introHtml: "Line one<br>two" }
  const html = buyerReceiptEmailHtml(receipt)
  check("receipt: the store's heading (escaped), text and button, and the tax row", html.includes("Welcome &lt;in&gt;") && html.includes("Line one<br>two") && html.includes("Get it") && html.includes(">Tax<") && buyerReceiptEmailText({ ...receipt, introText: "Line one\ntwo" }).includes("Tax: $9.31"))
  const reminder = checkoutReminderEmail({ shopName: "Astrid", buyerFirstName: "<Ada>", lines: [{ title: "Mug", variantName: null, quantity: 1, cents: 0, imageUrl: null }], checkoutUrl: "https://storelib.com/checkout/physical?shop=x", unsubscribeUrl: "https://storelib.com/unsubscribe?token=t" })
  check("checkout reminder: a way back, the person's own unsubscribe link, and an escaped name", reminder.html.includes("https://storelib.com/checkout/physical?shop=x") && reminder.html.includes("unsubscribe?token=t") && reminder.text.includes("Unsubscribe: https://storelib.com/unsubscribe?token=t") && reminder.html.includes("&lt;Ada&gt;"))
}

console.log("\nThe preview draws exactly what is typed\n")
{
  const p = previewCustomerEmail("order_confirmation", SHOP, { subject: "Got it, {{customer_name}}", body: "Thanks!" })!
  check("the subject and text the editor shows are the ones sent", p.subject === "Got it, Maria" && p.html.includes("Thanks!"))
  check("the receipt preview takes its words too", previewCustomerEmail("receipt", SHOP, { heading: "Hello {{customer_name}}", button: "Open" })!.html.includes("Hello Maria"))
  const evil = previewCustomerEmail("refund", { ...SHOP, name: "<script>alert(1)</script>" }, { body: "{{shop_name}}" })!
  check("a store name with markup is escaped in the preview too", !evil.html.includes("<script>alert(1)</script>") && evil.html.includes("&lt;script&gt;"))
}

console.log("\nWhich saved email a physical job sends\n")
{
  check("the jobs map to the emails Settings lists", emailIdForJob("confirmation") === "order_confirmation" && emailIdForJob("shipment", "shipped") === "shipping_confirmation" && emailIdForJob("shipment", "tracking") === "tracking_changed" && emailIdForJob("shipment", "out_for_delivery") === "out_for_delivery" && emailIdForJob("shipment", "delivered") === "delivered" && emailIdForJob("shipment", "delivered", null, true) === "picked_up" && emailIdForJob("shipment", "shipped", null, true) === "ready_for_pickup" && emailIdForJob("return", null, "approved") === "return_approved" && /* Changed on purpose (round AB): a declined return is its own email now, Return declined. */ emailIdForJob("return", null, "rejected") === "return_declined" && emailIdForJob("return", null, "requested") === "return_requested" && emailIdForJob("shipment", "issue") === "delivery_issue" && emailIdForJob("cancelled") === "order_cancelled" && emailIdForJob("refund") === "refund")
  check("  and every id it can answer is a listed email", ["order_confirmation", "shipping_confirmation", "tracking_changed", "out_for_delivery", "delivered", "picked_up", "ready_for_pickup", "return_approved", "return_received", "return_completed", "order_cancelled", "refund"].every((id) => CUSTOMER_EMAILS.some((e) => e.id === id)))
}

console.log("\nSaved per store, used by the senders\n")
{
  const jobs = read("lib/physical/jobs-server.ts")
  check("the physical sender reads the store's words once per email", /const saved = await loadCustomerEmailCopy\(db, co\.creator_id\)/.test(jobs))
  for (const [template, pattern] of [
    ["confirmation", /copy: copyFor\("order_confirmation", co\.lines\)/],
    ["pickup", /copy: copyFor\(emailIdForJob\("shipment", p\.kind, null, true\), shipped\)/],
    ["shipment", /copy: copyFor\(emailIdForJob\("shipment", p\.kind, null, false\), shipped\)/],
    ["return", /copy: copyFor\(emailIdForJob\("return", null, p\.status\), returned\)/],
    ["cancelled", /copy: copyFor\("order_cancelled", co\.lines\)/],
    ["refund", /copy: copyFor\("refund", co\.lines\)/],
  ] as const) check(`  ${template} passes them to its template`, pattern.test(jobs))
  const email = read("lib/email.tsx")
  /* Changed on purpose: both build through lib/receipts/receipt-mail.ts buildReceiptEmail, which applies the words (only in the website's own language), the same build the preview draws. */
  /* Changed on purpose (round 28, the owner: "per language"): the words go through pickCopy, the buyer's language's part of them. */
  check("the receipt sender and the receipt copy both use the store's receipt words", (email.match(/buildReceiptEmail\(model, language, saved\.receipt\)/g) ?? []).length === 2 && /resolveCopy\(pickCopy\(saved, language\), \{ customer_name: model\.firstName/.test(read("lib/receipts/receipt-mail.ts")))
  check("the checkout reminder uses its words", /resolveCopy\(pickCopy\(saved\.checkout_reminder, language\),/.test(read("lib/automations/abandoned-reminder.ts")))
  const server = read("lib/emails/customer-copy-server.ts")
  check("saved on the caller's own store_settings row, read back cleaned", /from\("store_settings"\)\.upsert\(\{ creator_id: creatorId, customer_emails: extras \? \{ \.\.\.next, \[COMMUNITY_EXTRAS_KEY\]: extras \} : next/.test(server) /* Changed on purpose (round 28): a community's preview text and footer note, kept beside these words, are kept on save */ && /readSavedCopy\(data\?\.customer_emails\)/.test(server))
  check("  a read that fails sends the default words, never nothing", /if \(error\) return \{\}/.test(server))
  const route = read("app/api/store/emails/route.ts")
  /* Changed on purpose (round 40 team permissions): shopCaller("marketing") is the owner as before, or a team member given Marketing, for the store they work in; both read on the server on each request (lib/team/server creatorFor). */
  check("the API is the owner's (or Marketing's, shopCaller) and returns the shop and the words in one read", (route.match(/await shopCaller\("marketing"\)/g) ?? []).length === 2 && /shop: \{/.test(route) && /copy,/.test(route))
  check("  a reset is copy: null", /body\.copy === null \? null : body\.copy/.test(route))
  check("the database part adds the column, a small object", /ADD COLUMN IF NOT EXISTS customer_emails jsonb NOT NULL DEFAULT '\{\}'::jsonb/.test(read("supabase/sql/run-now/129_customer_email_words_and_tax_on_receipts.sql")))
}

console.log("\nThe sheet opens at once, as a bottom sheet on a phone\n")
{
  const panel = read("components/app/settings/customer-emails-panel.tsx")
  check("the preview is drawn in the browser, not fetched on each open", /previewCustomerEmail\(id, shop,/.test(panel) && !/\/api\/store\/emails\/preview/.test(panel))
  check("  from what Settings already fetched", /peekGet<CustomerEmailsData>\(CUSTOMER_EMAILS_PATH\)/.test(panel) && /emails: \(\) => \["\/api\/store\/emails"\]/.test(read("components/app/settings-form-new.tsx")))
  check("a dialog on a computer, the shared bottom sheet on a phone", /<SheetDialog/.test(panel) && /phone=\{phone\}/.test(panel) && /usePhoneWidth\(\)/.test(panel))
  check("an editor with live preview, Save and Reset to default", /useDeferredValue\(draft\)/.test(panel) && /data-email-save/.test(panel) && /Reset to default/.test(panel))
  /* Each email offers its own values (a membership's price and dates, an order's number): placeholdersFor(id). */
  check("  placeholders can be added with a tap", /placeholdersFor\(id\)\.map/.test(panel) && /data-placeholder/.test(panel))
  check("  closing with unsaved words asks first", /Leave without saving your changes/.test(panel))
  /* Round AD. */
  check("it closes the way it opened: the last email stays in it while it slides away", /const email = asked \?\? kept\.current/.test(panel) && /const saved = asked \? savedAsked : keptSaved\.current/.test(panel))
  check("Send test, on every email, with the words on screen", /data-email-test=""/.test(panel) && /\/api\/store\/emails\/test/.test(panel) && /copy: payloadOf\(draft, !!otherLang\)/.test(panel)) // Changed on purpose (round 28): another language sends only its written parts
  const test = read("app/api/store/emails/test/route.ts")
  /* Changed on purpose (round 40 team permissions): shopCaller("marketing"); c.userId is still the person who pressed it. */
  check("  only to the inbox of the person who pressed it, rate limited, marked [Test]", /await shopCaller\("marketing"\)/.test(test) && /getUserById\(c\.userId\)/.test(test) && /bucket: "customer-email-test"/.test(test) && /subject: `\[Test\] \$\{mail\.subject\}`/.test(test) && /maskEmail\(to\)/.test(test))
  /* Changed on purpose: drawn by lib/emails/customer-preview-server.ts, where it was bought and in the language picked, as the preview on screen. */
  const previewServer = read("lib/emails/customer-preview-server.ts")
  check("  drawn by the same template as the real email, with the store's logo", /storePreview\(db, c\.creatorId, id, words,/.test(test) && /previewCustomerEmail\(\s*id,/.test(previewServer) && /logoUrl: store\?\.logoUrl/.test(previewServer))
  check("the receipt email shows the same picture as the receipt page: logo, else website logo, else profile photo", /storeIdentity\(admin, params\.creatorId as string, \{ logoOnly: true \}\)/.test(read("lib/email.tsx")) && /store\.logoFrom === "profile" \? senderPicture\(\{ photoUrl: store\.logoUrl \}\)/.test(read("lib/email.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
