/**
 * ===========================================================================
 *  ONE PICTURE OF THE CREATOR, IN EVERY EMAIL, AND A RECEIPT THAT SHOWS WHAT WAS BOUGHT
 * ===========================================================================
 * The report: an automated email for Luca Dragoste had a square dark "LD"
 * logo on top and a round, different photo beside his name at the bottom.
 * The layout filled its header from the website's logo and its footer from
 * the profile photo, and the automation reader put the photo in the logo's
 * place when there was no website, so it was two pictures either way.
 *
 * What this holds:
 *
 *   the rule         lib/email-campaigns/sender senderPicture: the photo,
 *                    else the logo, else nothing; one, never two
 *   the layout       buildEmail draws only that one picture, in the footer
 *                    (a photo) or the header (a logo)
 *   every path       each email that shows the creator reads the rule:
 *                    campaigns, automations and their previews, the
 *                    composer, the unsubscribe page, the receipt, refunds
 *   sizing           a stored picture is asked of the site's resizer at
 *                    twice its drawn width, as an absolute https address
 *   the receipt      each product's thumbnail (width, height, alt) and
 *                    name, the creator's picture, a Download button that
 *                    Outlook paints too, fluid to 600px, dark mode, the
 *                    house rules on words
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { emailImageSrc, initialOf, senderPhoto, senderPicture } from "@/lib/email-campaigns/sender"
import { buildEmail } from "@/lib/email-campaigns/template"
import { automationEmail, brandOfIdentity } from "@/lib/email-automation"
import { buyerReceiptEmailHtml, buyerReceiptEmailText, type ReceiptEmailModel } from "@/lib/receipts/email"
import { APP_ORIGIN } from "@/lib/email-variables"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const PHOTO = "https://cdn.example.com/luca-loud.jpg"
const LOGO = "https://cdn.example.com/ld-logo.png"
const SUPA = "https://abc.supabase.co/storage/v1/object/public/avatars/u1/avatar-1.jpg"
const brand = { name: "Luca Dragoste", logoUrl: LOGO, storeUrl: "https://storelib.com/luca", accent: "#1a1a2e", address: null }

/** Every <img> except the 1x1 open pixel. */
const pictures = (html: string) => (html.match(/<img\b[^>]*>/g) ?? []).filter((i) => !/width="1" height="1"/.test(i))

console.log("\nThe rule")
check("the photo wins over the logo", JSON.stringify(senderPicture({ photoUrl: PHOTO, logoUrl: LOGO })) === JSON.stringify({ url: PHOTO, kind: "photo" }))
check("the logo stands in when there is no photo", senderPicture({ photoUrl: null, logoUrl: LOGO })?.kind === "logo")
check("nothing when there is neither", senderPicture({}) === null)
check("an http photo, the placeholder and an empty string are no photo", senderPicture({ photoUrl: "http://x.com/a.png", logoUrl: LOGO })?.kind === "logo" && senderPhoto("/placeholder.svg") === null && senderPhoto("  ") === null)
check("a photo on our own site by path is made whole", senderPhoto("/avatars/a.png") === `${APP_ORIGIN}/avatars/a.png`)
check("an initial is a letter or a digit, upper case", initialOf("luca") === "L" && initialOf("  ") === "S" && initialOf("#1 pack", "#") === "#" && initialOf("Élan") === "É")

console.log("\nThe layout draws one picture")
{
  const both = buildEmail({ subject: "s", bodyHtml: "<p>Hi</p>", brand, avatarUrl: PHOTO, kind: "marketing", unsubscribeUrl: "#" })
  const imgs = pictures(both)
  check("a creator with a photo and a logo gets one picture, not two", imgs.length === 1, imgs)
  check("and it is the photo, round, beside the name", /src="https:\/\/cdn\.example\.com\/luca-loud\.jpg"/.test(imgs[0] ?? "") && /border-radius:14px/.test(imgs[0] ?? "") && !/class="sl-logo"/.test(both))
  check("the header then says the name in type", /class="sl-brand"[^>]*>Luca Dragoste</.test(both))

  const logoOnly = buildEmail({ subject: "s", bodyHtml: "<p>Hi</p>", brand, avatarUrl: null, kind: "marketing", unsubscribeUrl: "#" })
  check("with a logo and no photo: the logo in the header, one picture", pictures(logoOnly).length === 1 && /<img class="sl-logo" src="https:\/\/cdn\.example\.com\/ld-logo\.png"/.test(logoOnly))
  check("and the footer is the name alone, no second mark", !/line-height:28px;text-align:center;">L</.test(logoOnly) && /class="sl-name"[^>]*>Luca Dragoste</.test(logoOnly))

  const none = buildEmail({ subject: "s", bodyHtml: "<p>Hi</p>", brand: { ...brand, logoUrl: null }, avatarUrl: null, kind: "marketing", unsubscribeUrl: "#" })
  check("with neither: no picture at all, the initial in the footer", pictures(none).length === 0 && /line-height:28px;text-align:center;">L</.test(none))

  /* The report's own email: an automation, drawn the way the engine draws it. */
  const identity = { fromName: "Luca Dragoste", storeUrl: "https://storelib.com/luca", brand: { name: "Luca Dragoste", logoUrl: LOGO, accentColor: "#1a1a2e" }, avatarUrl: PHOTO }
  const auto = automationEmail({ body: "<p>Hi Alex, thanks for joining.</p>", fromName: identity.fromName, brand: brandOfIdentity(identity), avatarUrl: identity.avatarUrl, unsubscribeToken: "t", openPixelUrl: "https://storelib.com/api/automations/t/o?k=x" })
  check("the automated welcome email carries one picture of Luca", pictures(auto.html).length === 1 && auto.html.includes(PHOTO) && !auto.html.includes(LOGO), pictures(auto.html))
}

console.log("\nSized for the inbox")
{
  const sized = emailImageSrc(SUPA, 28) ?? ""
  check("a stored photo is made by the inbox route, absolute, at three times its width (28 to 96)", sized === `${APP_ORIGIN}/api/email/img?u=${encodeURIComponent(SUPA)}&w=96`, sized)
  check("a thumbnail drawn at 64 is made at 192, a picture drawn at 260 at 640", /&w=192$/.test(emailImageSrc(SUPA, 64) ?? "") && /&w=640$/.test(emailImageSrc(SUPA, 260) ?? ""))
  const billed = SUPA.replace("/object/public/", "/render/image/public/") + "?width=900"
  check("a stored address in the billed resizer's form is read as the original", (emailImageSrc(billed, 28) ?? "").includes(encodeURIComponent(SUPA)) && !(emailImageSrc(billed, 28) ?? "").includes("render"))
  check("a host the resizer does not fetch is drawn as stored", emailImageSrc(PHOTO, 28) === PHOTO)
  check("http and the placeholder are never drawn", emailImageSrc("http://x.com/a.png", 28) === null && emailImageSrc("https://x.com/placeholder.svg", 28) === null)
}

console.log("\nEvery email reads the one rule")
{
  const template = read("lib/email-campaigns/template.ts")
  check("the layout asks senderPicture and draws the logo only when it is the one picture",
    /const picture = senderPicture\(\{ photoUrl: f\.avatarUrl, logoUrl: brand\.logoUrl \}\)/.test(template) && /picture\?\.kind === "logo" \? emailImageSrc\(picture\.url, 200\)/.test(template))
  const store = read("lib/automations/supabase-store.ts")
  check("the automation reader no longer puts the photo in the logo's place", /logoUrl: site\.logo,/.test(store) && !/site\.logo \?\?/.test(store) && /const avatarUrl = senderPhoto\(profile\?\.avatar_url\)/.test(store))
  check("the campaign reader reads the photo through the same rule", /avatarUrl: senderPhoto\(profile\?\.avatar_url\)/.test(read("lib/email-campaigns/brand-server.ts")))
  const composer = read("components/email/compose/composer.tsx")
  check("the composer's preview never falls through to the raw profile field",
    /avatarUrl: brand \? \(brand\.avatarUrl \?\? null\) : senderPhoto\(me\.avatarUrl\)/.test(composer) && !/brand\?\.avatarUrl \?\? me\.avatarUrl/.test(composer))
  check("the unsubscribe page shows the same picture", /senderPicture\(\{ photoUrl: brand\.avatarUrl, logoUrl: brand\.logoUrl \}\)/.test(read("lib/subscriber-unsubscribe-server.ts")))
  const email = read("lib/email.tsx")
  /* Changed on purpose: a logo set in Settings › Store details goes first on receipts, then the same rule. */
  check("the receipt's picture is the rule's", /senderPicture\(\{ photoUrl: photo, logoUrl: brand\?\.logoUrl \}\)/.test(email) && /sellerPicture: pictureOf\(brand\?\.avatarUrl \?\? v\.seller\.avatarUrl\)/.test(email))
  /* The refund email is drawn by lib/emails/notices.ts in the shared layout, which escapes every address it draws. */
  check("the refund email sizes the picture it is handed and passes it to the layout", /const sellerAvatarSrc = emailImageSrc\(sellerAvatarUrl, 36\)/.test(email) && /sellerPictureUrl: sellerAvatarSrc/.test(email))
  const refundRoute = read("app/api/stripe/refund/route.ts")
  check("a creator's refund no longer falls back to the copy in creators.avatar_url", !/creator\.avatar_url/.test(refundRoute) && /senderPicture\(/.test(refundRoute))
  check("and the other two refund paths pass the same picture", /senderPicture\(/.test(read("lib/stripe/refund-sync.ts")) && /senderPicture\(/.test(read("app/api/admin/orders/refund/route.ts")))
  check("the flow builder's preview draws through the same frame as the send", /automationEmail\(\{[\s\S]*avatarUrl: identity\.avatarUrl \?\? null/.test(read("lib/automations/preview.ts")))
}

console.log("\nThe receipt")
{
  const model: ReceiptEmailModel = {
    firstName: "Alex",
    sellerName: "Luca Dragoste",
    sellerPicture: senderPicture({ photoUrl: SUPA, logoUrl: LOGO }),
    orderNumber: "1042",
    dateText: "September 27, 2026",
    items: [
      { title: "Autumn preset pack", variantName: "Lightroom", amountText: "$29.00", note: null, thumbnailUrl: "https://abc.supabase.co/storage/v1/object/public/products/p1/cover.jpg" },
      { title: "Night <sky> guide", variantName: null, amountText: "Free", note: null, thumbnailUrl: null },
    ],
    subtotalText: "$29.00",
    tipText: null,
    totalText: "$29.00",
    refundedText: null,
    link: "https://storelib.com/receipt/tok_123",
    buttonLabel: "Download your files",
    supportEmail: "luca@example.com",
  }
  const html = buyerReceiptEmailHtml(model)
  const text = buyerReceiptEmailText(model)
  const imgs = pictures(html)

  /* Drawn by the shared layout (lib/emails/layout.ts): 56px thumbnails, fetched at 3x. */
  const thumb = imgs.find((i) => i.includes("e-thumb")) ?? ""
  check("a product's thumbnail is drawn with width, height and its name as alt", /width="56"/.test(thumb) && /height="56"/.test(thumb) && /alt="Autumn preset pack"/.test(thumb), thumb)
  check("sized for the inbox, absolute https", thumb.includes(`src="${APP_ORIGIN}/api/email/img?u=${encodeURIComponent("https://abc.supabase.co/storage/v1/object/public/products/p1/cover.jpg")}&amp;w=192"`), thumb)
  check("with a hairline border and a small radius", /border:1px solid #e5e7eb/.test(thumb) && /border-radius:10px/.test(thumb))
  check("a product with no thumbnail gets a tile with its first letter, not a broken picture", /class="e-tile"[^>]*>N<\/td>/.test(html) && imgs.filter((i) => i.includes("e-thumb")).length === 1)
  check("each product's name is there, escaped", html.includes(">Autumn preset pack<") && html.includes("Night &lt;sky&gt; guide") && !html.includes("<sky>"))
  const avatar = imgs.find((i) => i.includes("e-avatar")) ?? ""
  /* Beside the name, so its alt is empty: a reader hears the name once. */
  check("the creator's photo, 36 by 36, round, sized, beside the name", /width="36"/.test(avatar) && /height="36"/.test(avatar) && /alt=""/.test(avatar) && /border-radius:18px/.test(avatar) && /api\/email\/img\?u=[^"]*&amp;w=128"/.test(avatar) && />Luca Dragoste<\/td>/.test(html), avatar)
  check("and it is the only picture of the creator: no logo beside it", !html.includes(LOGO) && imgs.length === 2)
  check("the Download button is a filled cell with the link, and Outlook gets a roundrect",
    /<td class="e-btn[^"]*"[^>]*bgcolor="#1a1a2e"/.test(html) && /<a class="e-btn-a[^"]*" href="https:\/\/storelib\.com\/receipt\/tok_123"[^>]*>Download your files<\/a>/.test(html) && /<v:roundrect[^>]*href="https:\/\/storelib\.com\/receipt\/tok_123"/.test(html))
  check("flat, with 10px corners, no shadow to go muddy in dark mode", /class="e-btn[^"]*"[^>]*border-radius:10px;/.test(html) && !/class="e-btn[^"]*"[^>]*box-shadow/.test(html))
  check("fluid to 560px, with a fixed table only for Outlook", /max-width:560px/.test(html) && /<!--\[if mso\]><table role="presentation" width="560"/.test(html))
  check("on a phone the price keeps its line and the button is full width", /white-space:nowrap;">\$29\.00</.test(html) && /@media only screen and \(max-width:480px\)\{[\s\S]*\.e-btn-wrap\{width:100%!important;\}/.test(html))
  check("dark mode is declared and styled", /name="color-scheme" content="light dark"/.test(html) && /prefers-color-scheme: dark/.test(html) && /\[data-ogsc\]/.test(html))
  check("the viewport meta is there", /<meta name="viewport" content="width=device-width,initial-scale=1">/.test(html))
  check("every picture has alt text and an https source", imgs.every((i) => /\balt="/.test(i) && /\bsrc="https:\/\//.test(i)), imgs)
  check("every picture says its size", imgs.every((i) => /\b(width|height)="\d+"/.test(i)))
  check("no em dash, no en dash, no gradient", !/[—–]/.test(html + text) && !/gradient/i.test(html))
  check("none of the words the house rules ban", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\w*/i.test(html + text))
  check("no violet: the button is the ink the receipt page uses", !/#8b5cf6|#6d28d9|#7c3aed/i.test(html))
  check("the text part lists the products and the link", text.includes("Autumn preset pack (Lightroom): $29.00") && text.includes("Download your files: https://storelib.com/receipt/tok_123"))

  const bare = buyerReceiptEmailHtml({ ...model, sellerPicture: null })
  check("a creator with no picture gets their initial, no image", /class="e-tile-accent"[^>]*>L<\/td>/.test(bare) && !pictures(bare).some((i) => i.includes("e-avatar")))
  const logo = buyerReceiptEmailHtml({ ...model, sellerPicture: senderPicture({ logoUrl: LOGO }) })
  check("a creator with only a logo gets the logo, not cut round", logo.includes(`src="${LOGO}"`) && !/src="https:\/\/cdn\.example\.com\/ld-logo\.png"[^>]*border-radius/.test(logo))

  const src = read("lib/email.tsx")
  check("the receipt model carries each product's thumbnail from the receipt loader", /thumbnailUrl: i\.thumbnailUrl,/.test(src))
  check("and the send hands it the creator", /creatorId,\n\s*fallback: \{ productTitle, variantName, amountCents: params\.amountCents, orderId \}/.test(src))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
