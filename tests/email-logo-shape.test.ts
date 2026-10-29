/**
 * ===========================================================================
 *  EVERY EMAIL DRAWS THE STORE'S LOGO WHOLE (round 43)
 * ===========================================================================
 * The owner: a "loud LIB." wordmark arrived as "OUC" in a black circle (the
 * refund drew every picture as a round avatar), while the receipt showed it
 * whole. Now one mark (lib/emails/brand-mark.ts) draws every email's sender:
 * the picture at its own shape inside 200 by 40, never round, never cropped,
 * alone when it is a wordmark, the name beside it when it is a square icon,
 * the name in type when there is no picture. A logo whose shape the
 * template cannot know is settled at send from the picture's own size.
 */
import { brandMarkHtml, settleBrandMarks, autoLogoSources, shapeOfSize, logoImg, LOGO_MAX_H, LOGO_MAX_W } from "@/lib/emails/brand-mark"
import { readImageSize } from "@/lib/images/metadata"
import { CUSTOMER_EMAILS, previewCustomerEmail } from "@/lib/emails/customer-catalog"
import { buyerRefundEmail } from "@/lib/emails/notices"
import { buyerReceiptEmailHtml, type ReceiptEmailModel } from "@/lib/receipts/email"
import { senderPicture } from "@/lib/email-campaigns/sender"
import { buildEmail } from "@/lib/email-campaigns/template"
import { reviewRequestEmail } from "@/lib/reviews/request-email"
import { renderEmail } from "@/lib/notify/templates"
import { logoFetchTarget } from "@/lib/emails/logo-source"
import { teamInviteEmail } from "@/lib/team/invite-email"
import { readFileSync } from "node:fs"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`)
  }
}

const LOGO = "https://bread.example/loud-lib-wordmark.png"
const FONT = "Arial"
const imgsOf = (html: string) => html.match(/<img\b[^>]*>/g) ?? []
/** The store's picture in an email: its header logo or its sender mark (never a product thumbnail, never Storelib's own mark). */
const logosOf = (html: string) => imgsOf(html).filter((i) => /class="(e-store-logo|sl-logo|e-avatar)"/.test(i))
/** Drawn whole: its own shape inside 200 by 40, no circle, no crop. */
function whole(img: string): string | null {
  if (/border-radius/.test(img)) return "rounded"
  if (/object-fit/.test(img)) return "cropped"
  if (!/width:auto;height:auto;/.test(img)) return "a fixed size"
  if (!new RegExp(`max-width:${LOGO_MAX_W}px;max-height:${LOGO_MAX_H}px`).test(img)) return "not inside 200 by 40"
  if (/\bwidth="\d+"/.test(img)) return "a width attribute"
  return null
}

console.log("\n1. One mark\n")
{
  const wide = brandMarkHtml({ name: "loud LIB.", src: LOGO, shape: "wide", font: FONT, ink: "#111" })
  check("a wordmark is drawn alone, its alt the name", imgsOf(wide).length === 1 && /alt="loud LIB\."/.test(wide) && !/>loud LIB\.<\/td>/.test(wide) && whole(imgsOf(wide)[0]) === null, wide)
  const square = brandMarkHtml({ name: "loud LIB.", src: LOGO, shape: "square", font: FONT, ink: "#111" })
  check("a square icon gets the name beside it, its own alt empty", /alt=""/.test(square) && />loud LIB\.<\/td>/.test(square) && whole(imgsOf(square)[0]) === null, square)
  const none = brandMarkHtml({ name: "Shop <x>", src: null, shape: "auto", font: FONT, ink: "#111" })
  check("no picture: the name in type, escaped", imgsOf(none).length === 0 && />Shop &lt;x&gt;<\/td>/.test(none), none)
  const auto = brandMarkHtml({ name: "A--B", src: LOGO, shape: "auto", font: FONT, ink: "#111" })
  check("a shape not known: drawn as a logo, the name waiting in a comment that cannot close early", /data-logo-shape="auto"/.test(auto) && /<!--e-logo-name[\s\S]*A-&#45;B[\s\S]*e-logo-name-->/.test(auto) && !/<!--e-logo-name[\s\S]*--[^>]*e-logo-name-->/.test(auto.replace("<!--", "").replace("-->", "")), auto)
  check("its picture is found to be read", autoLogoSources(auto).join() === LOGO)
  const asSquare = settleBrandMarks(auto, new Map([[LOGO, "square" as const]]))
  check("settled square: the name beside it, the alt emptied, no comment left", /data-logo-shape="square"/.test(asSquare) && />A--B<\/td>/.test(asSquare) && /alt=""/.test(asSquare) && !/e-logo-name/.test(asSquare), asSquare)
  const asWide = settleBrandMarks(auto, new Map([[LOGO, "wide" as const]]))
  check("settled wide: alone, the comment gone", /data-logo-shape="wide"/.test(asWide) && !/e-logo-name/.test(asWide) && /alt="A--B"/.test(asWide), asWide)
  check("not read: left exactly as drawn", settleBrandMarks(auto, new Map()) === auto)
  check("the picture's own shape decides: 4:1 is a wordmark, 1:1 and 5:4 are icons", shapeOfSize({ width: 400, height: 100 }) === "wide" && shapeOfSize({ width: 100, height: 100 }) === "square" && shapeOfSize({ width: 125, height: 100 }) === "square" && shapeOfSize(null) === null)
  const png = (w: number, h: number) => {
    const b = new Uint8Array(33)
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
    new DataView(b.buffer).setUint32(16, w)
    new DataView(b.buffer).setUint32(20, h)
    return b
  }
  check("read from the file's header alone", shapeOfSize(readImageSize(png(1200, 300))) === "wide" && shapeOfSize(readImageSize(png(512, 512))) === "square")
  check("the picture itself", whole(logoImg(LOGO, "x")) === null, logoImg(LOGO, "x"))
}

console.log("\n2. Every customer email, as its preview draws it\n")
{
  const SHOP = { name: "loud LIB.", supportEmail: "hi@loud.example", storeUrl: "https://loud.example", currency: "EUR", logoUrl: LOGO, phone: null, accent: "#111111" }
  const CREATOR = { name: "Maria Popescu", photoUrl: "https://bread.example/maria.jpg", logoUrl: null }
  for (const channel of ["website", "storelib"] as const) {
    for (const e of CUSTOMER_EMAILS) {
      const m = previewCustomerEmail(e.id, SHOP, null, { channel, creator: CREATOR })
      if (!m) continue
      const logos = logosOf(m.html)
      const bad = logos.map(whole).filter(Boolean)
      check(`${e.id} (${channel}): the picture whole, never round`, logos.length >= 1 && bad.length === 0 && !/border-radius:50%/.test(m.html) && !/class="e-avatar"/.test(m.html), { logos, bad })
    }
  }
}

console.log("\n3. The emails that are sent\n")
{
  const refund = buyerRefundEmail({ storeName: "loud LIB.", productTitle: "Guide", amount: "€12.00", orderRef: "#1A2B3C4D", reason: "Requested", orderDate: "1 October 2026", refundDate: "3 October 2026", contactEmail: "a@b.co", sellerPictureUrl: LOGO, creditNote: { number: "CN-1", url: "https://loud.example/cn.pdf" } } as Parameters<typeof buyerRefundEmail>[0])
  check("a refund with its credit note: the logo whole, alone until its shape is read", logosOf(refund.html).length === 1 && whole(logosOf(refund.html)[0]) === null && /data-logo-shape="auto"/.test(refund.html), logosOf(refund.html))
  const model: ReceiptEmailModel = { firstName: "Ana", sellerName: "loud LIB.", sellerPicture: senderPicture({ logoUrl: LOGO }), orderNumber: "#1", dateText: "1 October 2026", items: [{ title: "Guide", variantName: null, amountText: "€12.00", note: null, thumbnailUrl: null }], subtotalText: null, tipText: null, totalText: "€12.00", refundedText: null, link: "https://loud.example/r", buttonLabel: "View", supportEmail: "a@b.co" } as unknown as ReceiptEmailModel
  const receipt = buyerReceiptEmailHtml(model)
  check("a receipt with the store's logo", logosOf(receipt).length === 1 && whole(logosOf(receipt)[0]) === null, logosOf(receipt))
  const photo = buyerReceiptEmailHtml({ ...model, sellerPicture: senderPicture({ photoUrl: "https://bread.example/maria.jpg" }) })
  check("a receipt signed by a photo: square, the name beside it, not cut round", logosOf(photo).length === 1 && whole(logosOf(photo)[0]) === null && /data-logo-shape="square"/.test(photo) && />loud LIB\.<\/td>/.test(photo), logosOf(photo))
  const review = reviewRequestEmail({ reminder: false, shopName: "loud LIB.", logoUrl: LOGO, productTitle: "Guide", pageUrl: "https://loud.example/review" })
  check("a review request", logosOf(review.html).length === 1 && whole(logosOf(review.html)[0]) === null, logosOf(review.html))
  const campaign = buildEmail({ subject: "s", bodyHtml: "<p>Hi</p>", brand: { name: "loud LIB.", logoUrl: LOGO, storeUrl: null, accent: "#111111", address: null }, avatarUrl: null, kind: "marketing", unsubscribeUrl: "#" })
  check("a campaign", logosOf(campaign).length === 1 && whole(logosOf(campaign)[0]) === null, logosOf(campaign))
  const withPhoto = buildEmail({ subject: "s", bodyHtml: "<p>Hi</p>", brand: { name: "loud LIB.", logoUrl: null, storeUrl: null, accent: "#111111", address: null }, avatarUrl: "https://bread.example/maria.jpg", kind: "marketing", unsubscribeUrl: "#" })
  check("a campaign's photo in its footer is never cut round either", !/border-radius:14px;border:0;object-fit:cover/.test(withPhoto) && !/object-fit/.test(imgsOf(withPhoto).join("")))
  const community = renderEmail("COMMUNITY_WELCOME", { communityName: "loud LIB.", brandName: "loud LIB.", brandKind: "community", brandLogoUrl: LOGO, brandPicture: "mark" }, { baseUrl: "https://storelib.com" })
  check("a community email", logosOf(community.html).length === 1 && logosOf(community.html).every((i) => whole(i) === null) && !/border-radius:50%|border-radius:18px/.test(community.html), logosOf(community.html))
}

console.log("\n4. The send reads only Storelib's own stored pictures (no SSRF)\n")
{
  const was = { supa: process.env.NEXT_PUBLIC_SUPABASE_URL, app: process.env.NEXT_PUBLIC_APP_URL, main: process.env.NEXT_PUBLIC_MAIN_DOMAIN }
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co"
  process.env.NEXT_PUBLIC_APP_URL = "https://storelib.com"
  delete process.env.NEXT_PUBLIC_MAIN_DOMAIN
  const OBJ = "https://abc.supabase.co/storage/v1/object/public/logos/c1/logo.png"
  check("a stored object is read as it is", logoFetchTarget(OBJ) === OBJ)
  check("Storelib's /media/ address is read at the object", logoFetchTarget("https://storelib.com/media/logos/c1/logo.png") === OBJ)
  check("the inbox resizer on Storelib's origin is read at its source", logoFetchTarget(`https://storelib.com/api/email/img?u=${encodeURIComponent(OBJ)}&w=400`) === OBJ)
  const refused: [string, string][] = [
    ["another host", "https://evil.example/logo.png"],
    ["plain http", "http://abc.supabase.co/storage/v1/object/public/logos/c1/logo.png"],
    ["another Supabase project", "https://other.supabase.co/storage/v1/object/public/logos/c1/logo.png"],
    ["a private object path", "https://abc.supabase.co/storage/v1/object/sign/logos/c1/logo.png"],
    ["the storage API outside public objects", "https://abc.supabase.co/rest/v1/creators"],
    ["a user and password", "https://u:p@abc.supabase.co/storage/v1/object/public/logos/c1/logo.png"],
    ["another port", "https://abc.supabase.co:8443/storage/v1/object/public/logos/c1/logo.png"],
    ["a private address", "https://127.0.0.1/storage/v1/object/public/a.png"],
    ["metadata service", "https://169.254.169.254/latest/meta-data/"],
    ["the resizer wrapping another host", `https://storelib.com/api/email/img?u=${encodeURIComponent("https://evil.example/x.png")}&w=400`],
    ["the resizer wrapping itself", `https://storelib.com/api/email/img?u=${encodeURIComponent(`https://storelib.com/api/email/img?u=${encodeURIComponent(OBJ)}`)}&w=400`],
    ["the resizer on another host", `https://evil.example/api/email/img?u=${encodeURIComponent(OBJ)}&w=400`],
    ["a path climbing out", "https://abc.supabase.co/storage/v1/object/public/../../rest/v1/x"],
    ["not an address", "javascript:alert(1)"],
  ]
  for (const [what, src] of refused) check(`refused: ${what}`, logoFetchTarget(src) === null, logoFetchTarget(src))
  process.env.NEXT_PUBLIC_SUPABASE_URL = ""
  check("no storage configured: nothing is read", logoFetchTarget(OBJ) === null)
  if (was.supa === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = was.supa
  if (was.app === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = was.app
  if (was.main !== undefined) process.env.NEXT_PUBLIC_MAIN_DOMAIN = was.main
  const server = readFileSync("lib/emails/logo-shape-server.ts", "utf8")
  check("the fetch goes only to that address, through fetchPublic (private addresses refused), following no redirect", /const target = logoFetchTarget\(src\)\s*if \(!target\) return null/.test(server) && /fetchPublic\(target, \{[^}]*maxRedirects: 0 \}\)/.test(server) && !/trustOrigins/.test(server))
}

console.log("\n5. The team invite\n")
{
  const invite = teamInviteEmail({ storeName: "loud LIB.", storeImageUrl: LOGO, inviterName: "Andrew", role: "manager", email: "a@b.co", link: "https://storelib.com/api/team/join?token=abc" })
  const pics = logosOf(invite.html)
  check("the store's picture by the shared mark: whole, never round, its shape read at send", pics.length === 1 && whole(pics[0]) === null && /data-logo-shape="auto"/.test(invite.html) && !/border-radius:24px/.test(invite.html), pics)
  check("its access still under it", /Manager|Orders/.test(invite.html))
  check("the address is sized for a logo", /storeImageUrl: emailImageSrc\(avatar, LOGO_FILE_PX\)/.test(readFileSync("lib/team/server.ts", "utf8")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
