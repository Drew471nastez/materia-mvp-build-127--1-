/**
 * ===========================================================================
 *  A RECEIPT OPENS WHAT WAS PAID FOR, AND NOTHING ELSE
 * ===========================================================================
 * The buyer side of a purchase: receipt email, receipt page, download. The
 * flow is written out at the top of lib/receipts/rules.ts. This suite runs the
 * rules for real (who may download which file, what the receipt adds up to)
 * and pins the source where the rule is a property of a route rather than
 * of a function: that an order is found by token and never by id, that the
 * signed URL is short and made per request, that nothing sensitive reaches
 * the browser or a log.
 *
 * What went wrong before, and what each part guards:
 *
 *   A REFUND CLOSED NOTHING. /api/download checked the receipt token and the
 *   product, never the order's status, and the signed-in path accepted any
 *   entitlement, which a refund does not remove.
 *
 *   A VARIANT WAS NOT A VARIANT FOR ACCOUNTS. The entitlement lookup ignored
 *   variant_id, so a signed-in buyer of the cheap option could fetch the
 *   dear option's files. Claiming a guest order wrote an entitlement with no
 *   variant at all, which read as "the whole product".
 *
 *   THE PAGE SHIPPED THE ROW. The receipt handed the client component the
 *   order with select("*") (access token, fingerprints, fees, Stripe ids)
 *   and every asset with its storage path.
 *
 *   A BASKET WAS SEVERAL RECEIPTS, and /checkout/receipt showed "Free" for
 *   every paid order, reading a total_cents column that does not exist.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  accessStateOf,
  assetAllowedForVariants,
  canDeliver,
  decideAccess,
  filesForVariant,
  formatMoney,
  isCheckoutSessionId,
  isPlausibleToken,
  isUuid,
  lineMoney,
  maskAddress,
  orderNumberOf,
  overallState,
  sameSecret,
  sumMoney,
  DENY_MESSAGES,
} from "@/lib/receipts/rules"
import { buyerReceiptEmailHtml } from "@/lib/receipts/email"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? ` — ${detail}` : ""))
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** The refusal's reason. The suite compiles without strict narrowing. */
const why = (d: unknown) => (d as { reason?: string }).reason
/** Source with comments removed, so a guard is about code and not prose. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const PRODUCT = "33333333-3333-4333-8333-333333333333"
const OTHER_PRODUCT = "44444444-4444-4444-8444-444444444444"
const CHEAP = "55555555-5555-4555-8555-555555555555"
const DEAR = "66666666-6666-4666-8666-666666666666"

function main() {
  console.log("\nA receipt opens what was paid for, and nothing else")

  /* ---------------------------------------------------------------------
     ORDER STATE
     --------------------------------------------------------------------- */
  console.log("\n  what an order's status allows")

  check("completed is open", accessStateOf("completed") === "open" && canDeliver("completed"))
  check("pending waits", accessStateOf("pending") === "pending" && !canDeliver("pending"))
  check("refunded is closed", accessStateOf("refunded") === "refunded" && !canDeliver("refunded"))
  check("a full refund, read from the order, closes the files",
    accessStateOf({ status: "refunded", amount_cents: 1000, refund_amount_cents: 1000 }) === "refunded"
      && accessStateOf({ status: "refunded", amount_cents: 1000, refund_amount_cents: null }) === "refunded")
  check("a partial refund keeps them: the sale stands (lib/orders/refund-state, the rule checkout uses)",
    accessStateOf({ status: "refunded", amount_cents: 1000, refund_amount_cents: 300 }) === "open"
      && canDeliver({ status: "refunded", amount_cents: 1000, refund_amount_cents: 300 })
      && accessStateOf("partially_refunded") === "open")
  check("failed is closed", accessStateOf("failed") === "failed" && !canDeliver("failed"))
  check("disputed is held, not open", accessStateOf("disputed") === "held" && !canDeliver("disputed"))
  check(
    "a status nobody wrote a rule for is held, never open",
    accessStateOf("something_new") === "held" && accessStateOf(null) === "held" && accessStateOf("") === "held",
    "guessing open for an unknown state gives files away",
  )
  check("case and spaces do not matter", accessStateOf(" Completed ") === "open")
  check("a basket with one paid line is open", overallState(["refunded", "open"]) === "open")
  check("a basket of refunds is refunded", overallState(["refunded", "refunded"]) === "refunded")

  /* ---------------------------------------------------------------------
     WHO MAY DOWNLOAD
     --------------------------------------------------------------------- */
  console.log("\n  who may have a file")

  const none = new Map<string, string[]>()
  const receipt = (status: string, variant: string | null = null, product = PRODUCT) => ({
    product_id: product,
    variant_id: variant,
    status,
  })

  check("a paid receipt opens its product's file", decideAccess({ assetId: A, assetProductId: PRODUCT, receiptOrder: receipt("completed"), variantFiles: none }).ok)
  const refunded = decideAccess({ assetId: A, assetProductId: PRODUCT, receiptOrder: receipt("refunded"), variantFiles: none })
  check("a refunded receipt does not", !refunded.ok && why(refunded) === "refunded")
  const pending = decideAccess({ assetId: A, assetProductId: PRODUCT, receiptOrder: receipt("pending"), variantFiles: none })
  check("an unpaid one says it is waiting", !pending.ok && why(pending) === "pending")
  const disputed = decideAccess({ assetId: A, assetProductId: PRODUCT, receiptOrder: receipt("disputed"), variantFiles: none })
  check("a disputed one is held", !disputed.ok && why(disputed) === "held")
  const foreign = decideAccess({ assetId: A, assetProductId: OTHER_PRODUCT, receiptOrder: receipt("completed"), variantFiles: none })
  check(
    "a receipt never opens a file of another product",
    !foreign.ok && why(foreign) === "denied",
    "one receipt would otherwise be a key to the catalogue",
  )
  check("no credential at all is denied", !decideAccess({ assetId: A, assetProductId: PRODUCT, variantFiles: none }).ok)

  const mapped = new Map([
    [CHEAP, [A]],
    [DEAR, [A, B]],
  ])
  check("the cheap option opens its own file", decideAccess({ assetId: A, assetProductId: PRODUCT, receiptOrder: receipt("completed", CHEAP), variantFiles: mapped }).ok)
  const cheapDear = decideAccess({ assetId: B, assetProductId: PRODUCT, receiptOrder: receipt("completed", CHEAP), variantFiles: mapped })
  check("and not the dear option's", !cheapDear.ok && why(cheapDear) === "variant")
  check(
    "a variant with nothing mapped is not restricted",
    decideAccess({ assetId: B, assetProductId: PRODUCT, receiptOrder: receipt("completed", CHEAP), variantFiles: new Map([[CHEAP, []]]) }).ok,
    "a one-file product never asks for a mapping, so none exists",
  )

  /* The signed-in path: orders are the ledger. */
  check("the creator always gets their own file", decideAccess({ assetId: A, assetProductId: PRODUCT, isCreator: true, variantFiles: none }).ok)
  check(
    "a signed-in buyer with a paid order gets it",
    decideAccess({ assetId: A, assetProductId: PRODUCT, accountOrders: [{ variant_id: null, status: "completed" }], variantFiles: none }).ok,
  )
  const refundedAccount = decideAccess({
    assetId: A,
    assetProductId: PRODUCT,
    accountOrders: [{ variant_id: null, status: "refunded" }],
    entitlements: [{ variant_id: null }],
    variantFiles: none,
  })
  check(
    "a refund closes the account path even though the entitlement row is still there",
    !refundedAccount.ok && why(refundedAccount) === "refunded",
    "a refund changes the order and leaves the entitlement",
  )
  const accountVariant = decideAccess({
    assetId: B,
    assetProductId: PRODUCT,
    accountOrders: [{ variant_id: CHEAP, status: "completed" }],
    entitlements: [{ variant_id: null }],
    variantFiles: mapped,
  })
  check(
    "a signed-in buyer of the cheap option cannot fetch the dear one's file",
    !accountVariant.ok && why(accountVariant) === "variant",
    "the entitlement lookup used to ignore variant_id",
  )
  check(
    "buying both options opens both",
    decideAccess({
      assetId: B,
      assetProductId: PRODUCT,
      accountOrders: [
        { variant_id: CHEAP, status: "completed" },
        { variant_id: DEAR, status: "completed" },
      ],
      variantFiles: mapped,
    }).ok,
  )
  check(
    "a refunded option does not keep its files because another option was kept",
    !decideAccess({
      assetId: B,
      assetProductId: PRODUCT,
      accountOrders: [
        { variant_id: CHEAP, status: "completed" },
        { variant_id: DEAR, status: "refunded" },
      ],
      entitlements: [{ variant_id: DEAR }],
      variantFiles: mapped,
    }).ok,
  )
  check(
    "an entitlement with no order behind it (a free claim, a gift) still works",
    decideAccess({ assetId: A, assetProductId: PRODUCT, entitlements: [{ variant_id: null }], variantFiles: none }).ok,
  )
  check(
    "a refunded receipt does not borrow a signed-in stranger's nothing",
    !decideAccess({ assetId: A, assetProductId: PRODUCT, receiptOrder: receipt("refunded"), accountOrders: [], variantFiles: none }).ok,
  )
  check("every refusal has words for the buyer", Object.values(DENY_MESSAGES).every((m) => m.length > 20 && !/—/.test(m)))

  check("the variant file rule: mapped means only those", filesForVariant([{ id: A }, { id: B }], [A]).map((f) => f.id).join() === A)
  check("the variant file rule: unmapped means all", filesForVariant([{ id: A }, { id: B }], []).length === 2)
  check(
    "a mapping row pointing outside the product adds nothing",
    filesForVariant([{ id: A }], [A, OTHER_PRODUCT]).length === 1,
  )
  check("no variant means every file", assetAllowedForVariants(B, [null], mapped))

  /* ---------------------------------------------------------------------
     CREDENTIALS
     --------------------------------------------------------------------- */
  console.log("\n  credentials")

  check("a real receipt token passes the shape check", isPlausibleToken("V1StGXR8_Z5jdHi6B-myTV1StGXR8_Z5"))
  check("junk and injection attempts do not", !isPlausibleToken("abc") && !isPlausibleToken("x' or 1=1 --aaaaaaaaaaaa") && !isPlausibleToken(null))
  check("an order id is a uuid or nothing", isUuid(A) && !isUuid("1234") && !isUuid(`${A}x`))
  check("a checkout session id is Stripe's shape", isCheckoutSessionId("cs_test_a1B2c3D4e5F6g7") && !isCheckoutSessionId("cs_test_../../x"))
  check("secrets compare equal only when equal", sameSecret("abcdef", "abcdef") && !sameSecret("abcdef", "abcdeg") && !sameSecret("abc", "abcdef"))
  check("an empty secret never matches", !sameSecret("", "") && !sameSecret(null, null))

  /* ---------------------------------------------------------------------
     MONEY
     --------------------------------------------------------------------- */
  console.log("\n  what the receipt adds up to")

  const withTip = lineMoney({ amount_cents: 1500, tip_cents: 300, status: "completed" })
  check(
    "the tip is carved out of the charge, never added to it",
    withTip.totalCents === 1500 && withTip.tipCents === 300 && withTip.subtotalCents === 1200,
    `got ${JSON.stringify(withTip)}`,
  )
  check("a tip larger than the charge is clamped", lineMoney({ amount_cents: 100, tip_cents: 900 }).subtotalCents === 0)
  check("a partial refund is the refunded amount", lineMoney({ amount_cents: 2000, status: "refunded", refund_amount_cents: 500 }).refundedCents === 500)
  check("a refund with no amount recorded is the whole line", lineMoney({ amount_cents: 2000, status: "refunded" }).refundedCents === 2000)
  const basket = sumMoney([
    { amount_cents: 1000, status: "completed" },
    { amount_cents: 2500, status: "completed" },
    { amount_cents: 500, tip_cents: 0, status: "refunded" },
  ])
  check("a basket sums its lines", basket.totalCents === 4000 && basket.subtotalCents === 4000 && basket.refundedCents === 500)
  check("money is formatted in its currency", formatMoney(1999, "usd", "en-US") === "$19.99")
  check("in the buyer's locale", formatMoney(1999, "EUR", "de-DE").includes("19,99"))
  check("zero-decimal currencies are not divided by 100", formatMoney(500, "JPY", "en-US") === "¥500")
  check("a missing currency is USD, not a crash", formatMoney(100, "", "en-US") === "$1.00")
  check("the order number is short and stable", orderNumberOf("a1b2c3d4-e5f6-4789-8abc-def012345678") === "A1B2C3D4")
  check("the address is shown masked", maskAddress("jonathan@example.com") === "jo••••@example.com")
  check("and a bad address shows nothing", maskAddress("not-an-email") === null)

  /* ---------------------------------------------------------------------
     THE DOWNLOAD ROUTE
     --------------------------------------------------------------------- */
  console.log("\n  the download route")

  const dl = code("app/api/download/[assetId]/route.ts")
  check("it decides through the shared rule", /resolveDownloadAccess\(admin/.test(dl))
  check("a refusal returns the reason, not a file", /if \(!decision\.ok\)[\s\S]{0,200}status: 403/.test(dl))
  check("the signed URL uses the short expiry", /generateSignedDownloadUrl\([\s\S]{0,80}SIGNED_URL_EXPIRY_SECONDS/.test(dl))
  check("and the expiry is five minutes", /SIGNED_URL_EXPIRY_SECONDS = 300\b/.test(read("lib/security.ts")))
  check("the response is never cached", /"Cache-Control": "no-store"/.test(dl))
  check("it is rate limited per address, per signed in buyer, and per purchase",
    /downloadRateLimit\(request, \{ userId, assetId \}\)/.test(dl) && /if \(limited\) return limited/.test(dl)
    && /purchaseRateLimit\(request, \{ orderId, entitlementId/.test(dl) && /if \(byPurchase\) return byPurchase/.test(dl))
  check("the storage path never leaves the server", !/file_path[^\n]*NextResponse\.json|NextResponse\.json\([^)]*(file_path|storage_bucket)/.test(dl))
  check("the old order id and access token door is gone", !/searchParams\.get\("order"\)/.test(dl) && !/allowed_fingerprints/.test(dl))
  check("an asset id is validated before any query", /if \(!isUuid\(assetId\)\)/.test(dl))
  check("each download is recorded", /logDownloadEvent\(admin/.test(dl))

  const access = code("lib/receipts/download-access.ts")
  check("a receipt token is looked up by the database, by token", /\.eq\("receipt_token", input\.receiptToken\)/.test(access))
  /* Every query on orders, up to the next query, must not filter by id. */
  const orderQueries = access.split(".from(").filter((c) => c.startsWith('"orders"'))
  check(
    "never by an order id",
    orderQueries.length >= 2 && orderQueries.every((q) => !/\.eq\("id"/.test(q)),
    "an order id is not a credential",
  )
  check("the signed-in buyer's own orders are read whole, status and refund amount", /\.select\("\*"\)\.eq\("buyer_id", input\.userId\)/.test(access))
  check("and the creator check is by the session's user", /\.eq\("user_id", input\.userId\)/.test(access))

  const v2 = code("app/api/v2/download/[token]/route.ts")
  check("the other download door uses the same rule", /resolveDownloadAccess\(admin/.test(v2) && /DENY_MESSAGES/.test(v2))

  /* ---------------------------------------------------------------------
     THE RECEIPT PAGE
     --------------------------------------------------------------------- */
  console.log("\n  the receipt page")

  const load = code("lib/receipts/load.ts")
  check("the receipt is read by token", /q\.eq\("receipt_token", token\)/.test(load))
  check("with named columns, not the whole row", /const ORDER_COLUMNS = \[/.test(load) && !/"access_token"|"session_fingerprint"|"allowed_fingerprints"|"fee_cents"/.test(load))
  check("files are sent with id, name and size only", /list\.push\(\{ id: a\.id, name: a\.file_name \|\| "File", sizeBytes:/.test(load) && !/file_path/.test(load))
  check("and not while still uploading", /a\.upload_status !== "completed"\) continue/.test(load))
  check("a basket's other lines must share the session AND the buyer email", /eq\("stripe_session_id", session\)/.test(load) && /buyer_email[\s\S]{0,80}=== email/.test(load))
  check("files are only listed for an open line, and not when the variant map cannot be read",
    /state === "open" && !\(mappingUnknown && r\.variant_id\)\s*\?\s*filesForVariant/.test(load))

  const page = code("app/receipt/[token]/page.tsx")
  check("the page is never indexed and sends no Referer", /index: false/.test(page) && /referrer: "no-referrer"/.test(page))
  check("a malformed token is a 404 before any query", /if \(!isPlausibleToken\(token\)\) notFound\(\)/.test(page))
  /* Changed on purpose: the page now adds a discount code's saving to the
     view model (lib/receipts/discount, from the invoice's reading of the
     payment) before handing it over, so it passes `receipt`, which starts
     as `loaded.view`. Still the view model, never an order row. */
  /* Changed on purpose again: the bounded wait for the invoice moved into
     lib/receipts/discount withinTime (tested in receipt-actions), so the
     discount is applied in one line. Still the view model. */
  check("the browser gets the view model, not the order row",
    /let receipt = loaded\.view/.test(page) && /receipt = withDiscount\(receipt, await withinTime\(\(\) => invoiceForReceipt\(admin, token\), \d+\)\)/.test(page) && /<ReceiptView receipt=\{receipt\}/.test(page) && !/select\("\*/.test(page))

  const view = read("app/receipt/[token]/receipt-view.tsx")
  check("a pending payment refreshes by itself", /router\.refresh\(\)/.test(view) && /PENDING_POLL_LIMIT/.test(view))
  check("and stops rather than polling for ever", /polls >= PENDING_POLL_LIMIT/.test(view))
  check("dates are in the buyer's locale and zone", /new Intl\.DateTimeFormat\(locale/.test(view) && /format\(undefined\)/.test(view))
  /* Changed on purpose: in the app a download now ends at Save to Files in the
     share sheet (lib/downloads/download-file.ts), not at Safari's viewer. */
  check("the app says how to keep a file on iPhone", /tap Save to Files/.test(view))
  check("a download error is shown next to the file", /role="alert"/.test(view))

  /* Changed on purpose. The signed address is on storage's origin, and an
     anchor's `download` is ignored across origins: the click became an
     ordinary navigation, the PDF drew itself in the tab, and the receipt
     under it was gone (the owner's report). The file now goes to a tab of
     its own, opened empty inside the press so no pop-up blocker eats it.

     Changed on purpose again: the same shape was needed by the creator's
     own file menu and by a public OnePage, so it moved into one module and
     these pins follow it there. The button's own pins stay on the button.

     Changed on purpose a third time: the button's decision moved into the
     one download path every Download now takes (lib/downloads/download-file.ts,
     with the app's own downloader in front of the system browser), and
     components/download-button.tsx is a thin call into it. The pins follow
     it there; what they pin is the same. */
  const shared = code("lib/platform/download-tab.ts")
  const button = code("lib/downloads/download-file.ts")
  const browserPath = button.slice(button.indexOf("async function downloadInBrowser("), button.indexOf("async function downloadInApp("))
  check("the tab is opened without the noopener feature, which would answer null and leave no tab",
    /window\.open\("", "_blank"\)/.test(shared) && /tab\.opener = null/.test(shared) && !/window\.open\([^)]*"noopener"/.test(shared))
  check("it is pointed at the file with replace, so the empty page is not in its history",
    /tab\.location\.replace\(url\)/.test(shared))
  check("an anchor is kept for an address it really saves: our own origin, a blob, a data URL",
    /\^\(blob\|data\):/.test(shared) && /new URL\(url, window\.location\.href\)\.origin === window\.location\.origin/.test(shared) && /link\.download = filename/.test(shared))
  check("a refused tab gets a notice with the address, never nothing",
    /data-download-blocked-link/.test(shared) && /link\.target = "_blank"/.test(shared) && /link\.rel = "noopener noreferrer"/.test(shared))
  /* Changed on purpose a fourth time: the owner pressed Download and got a
     blank about:blank tab, "taking me to other sites". The file now saves
     where the button is: the address is asked for first (the button says
     Preparing), then storage's attachment is fetched in a hidden frame on
     the page (an iPhone's browser takes it in the tab itself, where an
     attachment never replaces the page). No tab, no window.open, no pop-up.
     scripts/check-buyer-library.mjs presses Download against a real
     attachment in Chromium: a download begins, no target is created and the
     address never changes. A OnePage's lead magnet, a lesson's attachment
     and a creator's own file in the product editor moved onto the same path
     too (the owner hated the about:blank tab wherever it came from); the pins
     below keep all three off the tab helper. It stays only for the builder's
     picture viewer, which saves an image rather than a bought file. */
  check("a browser download opens no tab and no window", !/openDownloadTab|window\.open\(/.test(browserPath))
  for (const file of ["components/courses/download-attachment.ts", "components/onepage/public-onepage.tsx", "lib/platform/own-file.ts"]) {
    const body = code(file)
    check(`${file} opens no tab for a download and saves on the page instead`, !/openDownloadTab|showBlockedDownload/.test(body) && /downloadFile\(|saveInPlace/.test(body))
  }
  check("it asks for the address first, then saves in place", browserPath.indexOf("await resolveTarget(target)") > -1 && browserPath.indexOf("await resolveTarget(target)") < browserPath.indexOf("saveInPlace(url, fileName)"))
  const inPlace = button.slice(button.indexOf("export function saveInPlace("), button.indexOf("/* ─── The app"))
  check("in a hidden frame on this page, left long enough to finish",
    /document\.createElement\("iframe"\)/.test(inPlace) && /data-download-frame/.test(inPlace) && /visibility:hidden/.test(inPlace) && /frame\.remove\(\), 60_000/.test(inPlace))
  check("an iPhone's browser takes it in the tab itself, where an attachment keeps the page", /isIosWebKit\(\)[\s\S]{0,80}window\.location\.assign\(url\)/.test(inPlace))
  check("our own origin still saves through an anchor", /anchorCanSave\(url\)/.test(browserPath) && /clickDownloadLink\(url, fileName\)/.test(browserPath))
  check("a refused request is handed back to the button, nothing opened", /if \("failed" in resolved\) return resolved\.failed/.test(browserPath))
  check("the app still opens the system browser when nothing better is there", /await openInSystemBrowser\(file\.url\)/.test(button))
  check("the button is a thin call into that one path", /return downloadFile\(\{ assetId, receiptToken/.test(code("components/download-button.tsx")))

  const legacy = [
    ["app/checkout/receipt/page.tsx", /redirect\(`\/receipt\/\$\{token\}`\)/],
    ["app/access/[orderId]/page.tsx", /receiptTokenForLegacyLink\(/],
    ["app/downloads/page.tsx", /receiptTokenForLegacyLink\(/],
    ["app/receipt/cart/[sessionId]/page.tsx", /redirect\(`\/receipt\/\$\{token\}`\)/],
    ["app/purchase/success/page.tsx", /redirect\(`\/receipt\/\$\{token\}`\)/],
  ] as const
  for (const [file, pattern] of legacy) check(`${file} forwards to the one receipt`, pattern.test(read(file)))
  check("an old access link compares its token in constant time", /sameSecret\(order\.access_token, input\.accessToken\)/.test(read("lib/receipts/legacy-link.ts")))
  check(
    "payment state comes from Stripe, not from the query string",
    /stripe\.checkout\.sessions\.retrieve\(sessionId\)/.test(read("app/purchase/success/page.tsx")) &&
      !/searchParams\.get\("(paid|status|emailSent)"\)/.test(view),
  )
  check("the checkout-only receipt component is gone", !existsSync(join(process.cwd(), "app/checkout/receipt/checkout-receipt-client.tsx")))
  check("and so is the old receipt component", !existsSync(join(process.cwd(), "components/receipt/receipt-content.tsx")))

  /* ---------------------------------------------------------------------
     THE EMAIL AND THE ROUTES AROUND IT
     --------------------------------------------------------------------- */
  console.log("\n  the email and the routes around it")

  const email = read("lib/email.tsx")
  /* The receipt's drawing moved to lib/receipts/email.ts, pure, so it can be drawn in a test; lib/email.tsx sends it. */
  const receiptEmail = read("lib/receipts/email.ts")
  const tpl = receiptEmail.slice(receiptEmail.indexOf("export function buyerReceiptEmailHtml"), receiptEmail.indexOf("export function buyerReceiptEmailText"))
  /* Drawn by the shared layout (lib/emails/layout.ts), which escapes every value: checked by drawing one with markup in it. */
  const hostile = buyerReceiptEmailHtml({
    firstName: "<b>Al</b>", sellerName: "Shop <i>x</i>", orderNumber: "#1", dateText: "today",
    items: [{ title: "Pack <script>1</script>", variantName: "<u>v</u>", amountText: "$1.00", note: null }],
    subtotalText: null, tipText: null, totalText: "$1.00", refundedText: null,
    link: 'https://storelib.com/receipt/a"onmouseover="x', buttonLabel: "Open", supportEmail: "a@b.co",
  })
  check("titles, variants and names are escaped", !/<script>|<u>v|<b>Al|<i>x/.test(hostile) && hostile.includes("Pack &lt;script&gt;1&lt;/script&gt;") && hostile.includes("&lt;u&gt;v&lt;/u&gt;"))
  check("the link is escaped too", !/"onmouseover="/.test(hostile) && hostile.includes("a&quot;onmouseover=&quot;x"))
  check("escapeHtml escapes quotes as well as brackets", /\.replace\(\/"\/g, "&quot;"\)/.test(email))
  check("no gradient and no em dash in the receipt email", !/gradient/.test(tpl) && !/—/.test(tpl))
  check("it lists every line of the payment from the receipt loader", /loadReceiptByToken\(admin, params\.receiptToken\)/.test(email))
  check("it shows the order number and the total", /Order \$\{m\.orderNumber\}/.test(tpl) && /\{ label: "Total", value: m\.totalText, strong: true \}/.test(tpl) && /Order #1 ·/.test(hostile) && />\$1\.00</.test(hostile))
  const sender = email.slice(email.indexOf("export async function sendBuyerDownloadEmail"), email.indexOf("export async function sendSellerNotificationEmail"))
  check("the buyer's address is never logged in full", !/console\.(log|error)\([^)]*customerEmail\b(?!\))/.test(sender.replace(/maskEmail\(customerEmail\)/g, "")))

  /* The basket's writes moved to lib/checkout/fulfil-cart-session.ts, shared
     by the buyer's return and Stripe's webhook. */
  const cart = code("lib/checkout/fulfil-cart-session.ts")
  check("a basket sends one receipt email, not one per product", (cart.match(/sendBuyerDownloadEmail\(/g) ?? []).length === 1 && /if \(s\.ownsBasket\)/.test(cart))

  const update = code("app/api/receipt/update-email/route.ts")
  check("changing the address from a token alone is limited to a guest order", /if \(order\.buyer_id\)/.test(update))
  check("and to the first week", /CHANGE_WINDOW_DAYS/.test(update))
  check("and is rate limited", /bucket: "receipt-email"/.test(update) && /if \(limited\) return limited/.test(update))
  check("a basket's lines move together", /\.eq\("stripe_session_id", order\.stripe_session_id\)/.test(update))
  check("the address is not logged", !/console\.(log|error)\([^)]*newEmail/.test(update))

  const resend = code("app/api/receipt/resend/route.ts")
  check("resend needs the order id AND its token to match", /\.eq\("receipt_token", receiptToken\)\s*\.eq\("id", orderId\)/.test(resend))
  check("and no longer stores the token in the security log", !/metadata: \{[^}]*receipt_token/.test(resend))

  const claim = code("app/api/purchases/claim/route.ts")
  check("claiming only grants for a paid line", /if \(canDeliver\(line\)\) await grant\(admin, user\.id, line\)/.test(claim))
  check("and the entitlement keeps the variant", /variant_id: line\.variant_id \?\? null/.test(claim))
  check("a basket is claimed whole: every line of the payment, same address, still unclaimed",
    /\.eq\("stripe_session_id", order\.stripe_session_id\)\s*\n\s*\.eq\("buyer_email", order\.buyer_email\)/.test(claim))
  check("two accounts claiming at once: only the one whose update matched gets access",
    /\.is\("buyer_id", null\)\s*\n\s*\.select\("id"\)/.test(claim) && /if \(!won \|\| won\.length === 0\)/.test(claim))
  check("an order on another account stays there", /order\.buyer_id && order\.buyer_id !== user\.id/.test(claim))

  const verify = code("app/api/purchases/verify/route.ts")
  check("the product page stops offering Download for a refunded receipt", /if \(!canDeliver\(order\)\) continue/.test(verify))

  {
    const view = read("app/receipt/[token]/receipt-view.tsx")
    check("a paid card order offers its invoice PDF on the receipt",
      /\/api\/checkout\/invoice\?token=\$\{encodeURIComponent\(receipt\.primary\.token\)\}/.test(view)
        && /invoice: totals\.totalCents > 0 && !!rows\[0\]\.stripe_payment_intent_id/.test(read("lib/receipts/load.ts")))
    check("  a basket's invoice lists every row of the payment", /\.eq\("stripe_session_id", order\.stripe_session_id\)/.test(read("lib/checkout/invoice.ts")))
    check("an unpaid order has no invoice", /if \(orderStatus !== "completed" && orderStatus !== "refunded"\) return null/.test(read("lib/checkout/invoice.ts")))
    const resend = code("app/api/receipt/resend/route.ts")
    check("only the signed-in seller can resend the seller's sale notice",
      /if \(resendType !== "buyer"\) \{[\s\S]{0,400}\.eq\("user_id", user\.id\)/.test(resend) && /status: 403/.test(resend))
    check("resend and change-email read whole rows, so an older database does not answer Order not found",
      /\.select\("\*, product:products\(title, creator_id\)"\)/.test(resend) && /\.select\("\*, product:products\(title, creator_id\)"\)/.test(code("app/api/receipt/update-email/route.ts")))
    check("an address with markup in it is refused", /\[\^\\s@<>"'`\(\),;:\\\\\[\\\]\]\+@/.test(read("app/api/receipt/update-email/route.ts")))
    const email = read("lib/email.tsx")
    /* The sale email is drawn by lib/notify/templates, which escapes every value (tests/sale-email.test.ts renders hostile names). */
    check("the seller's sale email escapes everything a person typed",
      /renderEmail\(first \? "FIRST_SALE" : "NEW_SALE", sale\.data/.test(email) && !/function sellerEmailHtml/.test(email))
    check("the download route and the account checks read whole orders, so the refund amount is there to read",
      /accessStateOf\(o\)/.test(read("lib/receipts/rules.ts")) && /canDeliver\(line\)/.test(read("app/api/purchases/claim/route.ts"))
        && /canDeliver\(order\)/.test(read("app/api/purchases/verify/route.ts")))
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
