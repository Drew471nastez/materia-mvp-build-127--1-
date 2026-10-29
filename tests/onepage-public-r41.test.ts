/**
 * ===========================================================================
 *  ROUND 41: A OnePage'S EDGES, EMBEDS, ICONS, SHARE, SUBSCRIBE AND PRODUCT SHEET
 * ===========================================================================
 * The rules behind what scripts/check-onepage-public-r41.mjs measures in a browser:
 *
 *   EDGES      a button with a border stops its fill inside the border, so
 *              the rounded edge is the border's alone (lib/onepage/button-style)
 *   EMBEDS     an X post takes the card's own width and is not clipped; the
 *              frame's colour scheme matches the service's document
 *   ICONS      a social icon's hover changes its opacity, never its size
 *   DIALOGS    opening Share or Subscribe never touches html or body overflow;
 *              Share is the card from before round 40 with the creator's photo
 *   PRODUCTS   three choices for a tap, the sheet's own button, an option and a
 *              quantity chosen before paying, a product that ships checked out
 *              in the cart checkout
 *   VIDEO      a new profile video replaces the old one without a gap
 *
 *   npx tsx --conditions=react-server tests/onepage-public-r41.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { themeButtonStyle } from "@/lib/onepage/button-style"
import { embedHeightFromMessage, embedWidthFromMessage } from "@/lib/onepage/creator-blocks"
import {
  PRODUCT_TAP_CHOICES,
  productSheetAction,
  productTapChoice,
  productTapPlan,
  sheetBuyBlocker,
  sheetMaxQuantity,
  sheetShowsPageLink,
  tapChoicePatch,
} from "@/lib/onepage/product-block"
import { shareBandBackground, shareBandInk } from "@/components/onepage/share-sheet"
import { isPostEmbed, POST_RADIUS } from "@/components/onepage/embed-frame"
import { physicalCheckoutHref } from "@/lib/physical/cart-link"
import type { ProductBlockData } from "@/lib/onepage/types"

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
function section(t: string) {
  console.log(`\n${t}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** The code without its comments, so a rule is checked against what runs. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const theme = (over: Record<string, unknown>) =>
  ({
    button_style: "filled",
    button_color: "#27272a",
    button_text_color: "#ffffff",
    button_border_radius: 999,
    button_border_width: 1,
    button_border_color: "#3f3f46",
    button_shadow: "none",
    ...over,
  }) as unknown as Parameters<typeof themeButtonStyle>[0]

section("Edges: the fill stops inside the border")
{
  const bordered = themeButtonStyle(theme({}))
  check("a bordered button clips its fill to the padding box", bordered.backgroundClip === "padding-box", JSON.stringify(bordered))
  check("  its border is drawn as before", bordered.borderWidth === "1px" && bordered.borderColor === "#3f3f46")
  const outline = themeButtonStyle(theme({ button_style: "outline", button_border_width: 0 }))
  check("an outline button (at least 2px) clips too", outline.backgroundClip === "padding-box" && outline.borderWidth === "2px")
  const plain = themeButtonStyle(theme({ button_border_width: 0 }))
  check("a button with no border is left as it was", plain.backgroundClip === undefined && plain.borderWidth === "0px")
  const page = code("components/onepage/public-onepage.tsx")
  check("the share and bell buttons clip their fill inside their ring", (page.match(/backgroundClip: "padding-box"/g) ?? []).length >= 2)
}

section("Embeds: X's own width and corners, a transparent canvas")
{
  const msg = { "twttr.embed": { method: "twttr.private.resize", params: [{ height: 612, width: 518 }] } }
  check("X's width is read from its resize message", embedWidthFromMessage("x", "https://platform.twitter.com", msg) === 518)
  check("  with its height, as before", embedHeightFromMessage("x", "https://platform.twitter.com", msg) === 612)
  check("  only from X, and only a card's width", embedWidthFromMessage("x", "https://evil.example", msg) === null && embedWidthFromMessage("instagram", "https://www.instagram.com", msg) === null && embedWidthFromMessage("x", "https://platform.twitter.com", { "twttr.embed": { method: "twttr.private.resize", params: [{ width: 5000 }] } }) === null)
  check("posts are X and Instagram, players are not", isPostEmbed("x") && isPostEmbed("instagram") && !isPostEmbed("loom") && !isPostEmbed("twitch"))
  check("X's card corner is 12px", POST_RADIUS.x === 12)
  const frame = code("components/onepage/embed-frame.tsx")
  check("a post is not clipped; a player is", /post \? "relative mx-auto w-full bg-transparent \[contain:layout\]" : "relative mx-auto w-full overflow-hidden/.test(frame))
  check("the frame's colour scheme is the services' own (normal), so its canvas stays transparent", /colorScheme: "normal"/.test(frame))
  check("the frame takes the width X said", /width: post && w \? w : undefined/.test(frame))
}

section("Social icons: hover changes opacity, never size")
{
  const page = code("components/onepage/public-onepage.tsx")
  const row = page.slice(page.indexOf('case "social_row"'), page.indexOf('case "link_button"'))
  check("no scale on hover in the row", !/hover:scale/.test(row), row.match(/hover:scale[^"\s]*/)?.[0])
  check("  only opacity transitions", /transition-opacity duration-150 ease-out/.test(row) && /hover:opacity-70/.test(row) && !/transition-all/.test(row))
  check("the share and bell buttons do not grow either", !/rounded-full transition-all duration-300 hover:scale-105/.test(page))
}

section("Dialogs: the page keeps its scrollbar")
{
  const dialog = code("components/onepage/onepage-dialog.tsx")
  check("nothing sets overflow on html or body", !/documentElement\.style\.overflow|body\.style\.overflow|html\.style\.overflow/.test(dialog))
  check("the page is held still by refusing the scroll instead", /useStillPage\(open, rootRef\)/.test(dialog) && /addEventListener\("wheel", onWheel, opts\)/.test(dialog) && /addEventListener\("touchmove", onMove, opts\)/.test(dialog))
  check("the card moves with translate and scale, never a transition of transform", !/transform/.test(dialog) && /translate: shown \? "0 0" : "0 8px"/.test(dialog))
  const page = code("components/onepage/public-onepage.tsx")
  check("the share and bell buttons slide in with translate", !/transform: shouldShow/.test(page) && (page.match(/translate: shouldShow \? "0 0" : "0 -10px"/g) ?? []).length === 2)
}

section("Share: the card from before, with the creator's photo")
{
  check("the band is the page's gradient", shareBandBackground({ backgroundType: "gradient", backgroundGradient: "linear-gradient(#000,#fff)" }) === "linear-gradient(#000,#fff)")
  check("  else its colour, a white page's being no band", shareBandBackground({ backgroundType: "solid", backgroundColor: "#0a0a0a" }) === "#0a0a0a" && shareBandBackground({ backgroundType: "solid", backgroundColor: "#ffffff", accentColor: "#2340c7" }) === "#2340c7")
  check("  else Storelib's ink", shareBandBackground({ backgroundType: "solid", backgroundColor: "#ffffff", accentColor: "#ffffff" }) === "#1a1a2e")
  check("white words on a dark band, ink on a light one", shareBandInk("#0a0a0a") === "light" && shareBandInk("#fffbeb") === "dark")
  const share = code("components/onepage/share-sheet.tsx")
  check("it is the centred card at every width, with no surface of its own behind the band", /centered bare>/.test(share))
  check("the creator's photo, or their video, large in the band", /<AppAvatar src=\{onePageImageSrc\(avatarUrl, 160\)\}/.test(share) && /<PosterVideo src=\{avatarVideoUrl\}/.test(share))
  check("the four places and the Storelib card, as before", ["Copy link", '"X"', '"Facebook"', '"WhatsApp"', "Create your own page", "Build your store with Storelib", ">Join<"].every((w) => share.includes(w)))
  check("a share never leaves the editor's preview", (share.match(/isOnePagePreview\(\)/g) ?? []).length >= 2)
  check("its buttons do not grow on hover", !/hover:scale/.test(share))
  const page = code("components/onepage/public-onepage.tsx")
  check("the page hands it its colours", /band=\{\{ backgroundType: themeBackgroundType, backgroundColor: themeBackgroundColor, backgroundGradient: themeBackgroundGradient, accentColor \}\}/.test(page))
}

section("Subscribe: the creator's photo, a done state that does not resize the card")
{
  const sub = code("components/onepage/subscribe-sheet.tsx")
  check("the creator's photo heads it", /data-subscribe-avatar=""/.test(sub) && /onePageImageSrc\(avatarUrl, 128\)/.test(sub))
  check("the page passes the photo and the video", /avatarUrl=\{avatar_url\}\s*avatarVideoUrl=\{avatar_video_url\}/.test(code("components/onepage/public-onepage.tsx")))
  check("both states share one grid cell (the card never changes height)", /gridArea: "1 \/ 1"/.test(sub) && /style=\{pane\(!done\)\}/.test(sub) && /style=\{pane\(done\)\}/.test(sub))
  check("  opacity, translate and scale only", /transition: `opacity 260ms \$\{ease\}/.test(sub) && !/transform/.test(sub))
  check("the same request as before", /fetch\("\/api\/subscribe"/.test(sub) && /source: "onepage", source_id: onepageId, creator_id: sellerId, origin: pageOrigin\(\)/.test(sub))
}

section("Products: what a tap does, what the sheet's button does")
{
  const d = (o: Partial<ProductBlockData>) => ({ product_id: "p", ...o }) as ProductBlockData
  check("three choices, in order", PRODUCT_TAP_CHOICES.join() === "sheet,instant,page")
  check("an old block (no setting) reads as instant checkout, as it always went to the checkout", productTapChoice(d({})) === "instant")
  check("instant checkout turns the window on", JSON.stringify(tapChoicePatch("instant")) === JSON.stringify({ tap_action: "checkout", instant_checkout: true, quick_checkout: false }))
  check("  and a download then opens it on the page", productTapPlan({ ...tapChoicePatch("instant"), product_type: "digital" } as ProductBlockData) === "instant")
  check("  a product that ships still goes to its page to choose delivery", productTapPlan({ ...tapChoicePatch("instant"), product_type: "physical" } as ProductBlockData) === "navigate")
  check("sheet and page are stored as they are", tapChoicePatch("sheet").tap_action === "sheet" && tapChoicePatch("page").tap_action === "page")
  check("the sheet's button: checkout unless set to the page", productSheetAction(d({})) === "checkout" && productSheetAction(d({ sheet_action: "page" })) === "page")
  check("the link to the full page: on by default, never beside a page button", sheetShowsPageLink(d({})) && !sheetShowsPageLink(d({ sheet_page_link: false })) && !sheetShowsPageLink(d({ sheet_action: "page" })))
  const s = { loaded: true, soldOut: false, variantCount: 0, variantChosen: false, quantity: 1, maxQuantity: 10 }
  check("nothing is paid before an option is chosen", sheetBuyBlocker({ ...s, variantCount: 2 }) === "choose option" && sheetBuyBlocker({ ...s, variantCount: 2, variantChosen: true }) === null)
  check("  one option is chosen for the buyer", sheetBuyBlocker({ ...s, variantCount: 1, variantChosen: true }) === null)
  check("sold out and still loading stop it", sheetBuyBlocker({ ...s, soldOut: true }) === "sold out" && sheetBuyBlocker({ ...s, loaded: false }) === "loading")
  check("a quantity outside 1 to the limit stops it", sheetBuyBlocker({ ...s, quantity: 0 }) === "quantity" && sheetBuyBlocker({ ...s, quantity: 11 }) === "quantity")
  check("the limit: the product's own, else 10", sheetMaxQuantity(3) === 3 && sheetMaxQuantity(null) === 10 && sheetMaxQuantity(0) === 10)
  const href = physicalCheckoutHref("shop1", [{ productId: "p", variantId: "v", quantity: 2 }], "https://storelib.me/a")
  check("a product that ships goes to the cart checkout with its option and quantity", /^\/checkout\/physical\?shop=shop1&items=/.test(href))
  const sheet = code("components/onepage/product-sheet.tsx")
  /* Changed on purpose, round 43: the line also carries what the buyer wrote (personalization), and the choice is made by lib/onepage/product-sheet. */
  check("the sheet builds that address", /physicalCheckoutHref\(p\.shopId, \[\{ productId: p\.id, variantId: variant\?\.id \?\? null, quantity, \.\.\.\(properties \? \{ properties \} : \{\}\) \}\], back\)/.test(sheet))
  check("two or more options: none chosen for the buyer", /sheetStartChoice\(sheetModel\(f\.product\)\)/.test(sheet))
  check("an unpublished product says it is not for sale, with no button", /Not for sale right now/.test(sheet))
  /* Changed on purpose, round 43: the same room above on a phone, beside the words in two columns on a computer. */
  check("the pictures sit inside the sheet under the handle, with their own corners", /"px-4 pt-2 sm:px-5 sm:pt-5"\}>\s*<Gallery/.test(sheet) && /relative overflow-hidden rounded-2xl bg-\[#f4f4f6\]/.test(sheet))
  const route = code("app/api/onepage/product/route.ts")
  check("the product's facts carry its shop and its limit, and leave out options taken off", /shopId: creatorId/.test(route) && /maxQuantity:/.test(route) && /filter\(\(v\) => v\.active !== false\)/.test(route))
  const block = code("components/onepage/product-block.tsx")
  check("the block hands the sheet its button", /action=\{productSheetAction\(data\)\}/.test(block) && /pageLink=\{sheetShowsPageLink\(data\)\}/.test(block))
  const editor = code("components/onepage/tabs/product-block-editor.tsx")
  check("the editor offers the three choices by name", ['tt("Open product sheet")', 'tt("Instant checkout")', 'tt("Product page")'].every((w) => editor.includes(w)))
  check("  and the sheet's button", ['tt("Button in the sheet")', 'tt("Check out now")', 'tt("View full page")'].every((w) => editor.includes(w)))
}

section("Video: a new one replaces the old without a gap")
{
  const pv = code("components/onepage/poster-video.tsx")
  check("the old video is kept, playing, under the new one", /setPrev\(\{ src: forSrc, style: lastStyle\.current \}\)/.test(pv) && /data-poster-video-prev=""/.test(pv))
  check("  in one keyed list, so its element is the same one", /key=\{prev\.src\}/.test(pv) && /key=\{src\}/.test(pv) && /\{layers\}/.test(pv))
  check("  and taken away once the new one shows", /setPrev\(null\), 340/.test(pv))
  check("the new poster fades in over it once loaded", /opacity: prev && !baseReady \? 0 : 1/.test(pv))
}

section("Words")
{
  const de = read("lib/i18n/catalog/de.ts")
  check("the editor's new words are translated", ["Open product sheet", "Button in the sheet", "Check out now", "View full page", "Pay without leaving your page"].every((w) => de.includes(`"${w}":`)))
  const visitor = [code("components/onepage/share-sheet.tsx"), code("components/onepage/subscribe-sheet.tsx"), code("components/onepage/product-sheet.tsx")].join("\n")
  check("no em dashes in what a visitor reads", !visitor.includes("—"))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
