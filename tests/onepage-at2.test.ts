/**
 * Round AT, track 2: the OnePage editor and its preview, mostly on a phone.
 *
 *   SUBSCRIBE    the newsletter's button is at full strength with an empty
 *                box and checks the address on the press, with the block's
 *                own inline error (the live page and the preview, which is
 *                the live page in a frame); the header's Subscribe sheet and
 *                a free gift's form the same way
 *   PICTURES     every row of the Links list carries the block's own picture
 *                (lib/onepage/row-picture): a map of the place, a video's
 *                still, a cover, a link's preview image, the shelf's first
 *                product, the creator's photo on the header
 *   + ADD        no :active tint, a press tint only once a finger has rested
 *                without travelling, and the sheet opens from a tap, never
 *                from a scroll that started on the button
 *   SHARE        Share your OnePage ticks in the apps, nothing in a browser
 *   PREVIEW      the frame is marked embedded before its first paint, never
 *                gets the app's status bar shield, and the page's top inset
 *                is 0 there (--op-safe-top), so the profile bar is its slim
 *                60px under the editor's own bar
 *   SWITCH       Preview is warmed while idle and both layers stay laid out
 *   STICKY BACK  a sticky box of the bar's own height, its own layer, faded
 *                by opacity only, still no scroll listener
 *   PERIOD       a block's stats period is a sheet above the stats sheet on
 *                a phone, a popover on a computer
 *
 * scripts/check-onepage-at2.mjs measures them in Chromium at 390 (touch) and 1440.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { drawablePicture, mapTile, rowPictureOf } from "@/lib/onepage/row-picture"
import { signupEmailReady } from "@/lib/onepage/email-signup"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`)
  }
}
function section(name: string) {
  console.log(`\n${name}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

section("SUBSCRIBE")
const live = read("components/onepage/public-onepage.tsx")
check("no shape of the email block waits on the address to be pressable", !/!emailReady/.test(live) && !/signupWait\(/.test(live))
check("the press checks the address and says so under the form", /if \(!signupEmailReady\(email\)\) \{\s*setLeadError\(tt\("Enter a valid email address\."\)\)/.test(live))
check("the box gets the focus back after a bad address", /querySelector<HTMLInputElement>\("input\[type=email\]"\)\?\.focus\(\{ preventScroll: true \}\)/.test(live))
check("typing again clears the error", /setEmail\(e\.target\.value\)\s*if \(leadError\) setLeadError\(null\)/.test(live))
check("the browser's own bubble never comes first: the three forms are noValidate", (live.match(/onSubmit=\{handleSubmit\}\s*noValidate/g) ?? []).length + (live.match(/onSubmit=\{handleSubmit\} noValidate/g) ?? []).length >= 3)
const sheet = read("components/onepage/subscribe-sheet.tsx")
check("the header's Subscribe sheet: full strength, checked on the press", /disabled=\{busy \|\| done\}/.test(sheet) && /if \(!signupEmailReady\(address\)\) \{\s*setError\("Enter a valid email address\."\)/.test(sheet) && /onSubmit=\{submit\} noValidate/.test(sheet))
const gift = read("components/onepage/storelib-blocks.tsx")
check("a free gift's form: full strength, the same address rule", /<button type="submit" disabled=\{sending\}/.test(gift) && /if \(!signupEmailReady\(address\)\) \{/.test(gift))
check("the rule itself is unchanged", signupEmailReady("anna@site.co") && !signupEmailReady("anna@site") && !signupEmailReady(""))

section("PICTURES IN THE LINKS LIST")
const tile = mapTile(44.407097, 26.153009, 14)
check("a point's tile, by the Web Mercator tiling", !!tile && tile.src === "https://tile.openstreetmap.org/14/9382/5931.png" && tile.x > 0 && tile.x < 1 && tile.y > 0 && tile.y < 1, tile)
check("no tile past the map's edge", mapTile(89, 0) === null && mapTile(0, 200) === null && mapTile(NaN, 1) === null)
const pin = rowPictureOf({ type: "map", data: { title: "See", address: "44.407097,26.153009" } })
/* Changed on purpose (round AT, lead): a place is always the drawn map with a pin; no third party tile is asked for. */
check("the owner's map block (a pasted point) shows its map", pin?.kind === "map-drawn", pin)
const link = rowPictureOf({ type: "map", data: { address: "https://www.google.com/maps/place/Empire+State+Building/@40.74,-73.98,17z/data=!3d40.7484405!4d-73.9856644", zoom: "street" } })
check("a Google Maps link with its point draws the map too", link?.kind === "map-drawn", link)
check("a typed address with no point: a drawn map with a pin, never the glyph", rowPictureOf({ type: "map", data: { address: "350 5th Ave, New York" } })?.kind === "map-drawn")
check("an empty map block keeps its glyph", rowPictureOf({ type: "map", data: { address: "" } }) === null)
const img = (b: Parameters<typeof rowPictureOf>[0], ctx?: Parameters<typeof rowPictureOf>[1]) => {
  const p = rowPictureOf(b, ctx)
  return p?.kind === "image" ? p.src : null
}
check("a YouTube video: its own still", img({ type: "video", data: { url: "https://youtu.be/dQw4w9WgXcQ" } }) === "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg")
check("an uploaded video: its poster first", img({ type: "video", data: { url: "https://youtu.be/dQw4w9WgXcQ", poster_url: "https://cdn.example.com/p.jpg" } }) === "https://cdn.example.com/p.jpg")
check("music: the cover read from its address", img({ type: "music", data: { url: "https://open.spotify.com/track/x", artwork_url: "https://i.scdn.co/a.jpg" } }) === "https://i.scdn.co/a.jpg")
check("a course: its picture", img({ type: "course", data: { course_thumbnail: "https://cdn.example.com/c.jpg" } }) === "https://cdn.example.com/c.jpg")
check("a link: its own thumbnail, then the address's preview", img({ type: "link_button", data: { url: "https://a.co", thumbnail_url: "https://cdn.example.com/t.jpg", link_preview: { image: "https://a.co/og.jpg" } } }) === "https://cdn.example.com/t.jpg" && img({ type: "link_button", data: { url: "https://a.co", link_preview: { image: "https://a.co/og.jpg" } } }) === "https://a.co/og.jpg")
check("a preview picture the creator removed stays removed", img({ type: "link_button", data: { url: "https://a.co", link_preview: { image: "https://a.co/og.jpg", image_hidden: true } } }) === null)
check("an icon the creator chose beats the preview picture", img({ type: "link_button", data: { url: "https://a.co", icon: "instagram", link_preview: { image: "https://a.co/og.jpg" } } }) === null)
check("a product: its own thumbnail, then the product's", img({ type: "product", data: { product_thumbnail: "https://cdn.example.com/p.jpg" } }) === "https://cdn.example.com/p.jpg")
check("an image block: its first picture", img({ type: "image", data: { image_url: "", images: [{ image_url: "https://cdn.example.com/1.jpg" }] } }) === "https://cdn.example.com/1.jpg")
check("a signup with a picture, a free gift", img({ type: "email_capture", data: { product_image: "https://cdn.example.com/e.jpg" } }) === "https://cdn.example.com/e.jpg" && img({ type: "lead_magnet", data: { product_thumbnail: "https://cdn.example.com/g.jpg" } }) === "https://cdn.example.com/g.jpg")
const products = [
  { id: "aaaaaaaa-0000-4000-8000-000000000001", thumbnail_url: "https://cdn.example.com/1.jpg", type: "digital" },
  { id: "aaaaaaaa-0000-4000-8000-000000000002", thumbnail_url: "https://cdn.example.com/2.jpg", type: "digital" },
]
check("a shelf: the first picked product's picture, from the catalogue", img({ type: "storelib_shelf", data: { pick: "some", product_ids: ["aaaaaaaa-0000-4000-8000-000000000002"] } }, { products }) === "https://cdn.example.com/2.jpg")
check("a shelf of every product: the first one's", img({ type: "storelib_shelf", data: {} }, { products }) === "https://cdn.example.com/1.jpg")
check("the header: the creator's photo", img({ type: "header", data: {} }, { avatarUrl: "https://cdn.example.com/me.jpg" }) === "https://cdn.example.com/me.jpg")
check("only addresses a row can draw", drawablePicture("javascript:alert(1)") === null && drawablePicture("http://a.co/x.jpg") === "https://a.co/x.jpg" && drawablePicture("/images/x.webp") === "/images/x.webp" && drawablePicture("//evil.co/x") === null)
const tab = read("components/onepage/tabs/links-tab.tsx")
check("the list's rows and a group's rows draw it", /const picture = rowPictureOf\(block, \{ avatarUrl: onepage\?\.avatar_url, products: shelfProducts \}\)/.test(tab) && (tab.match(/<RowPictureView picture=\{picture\} size=\{40\} \/>/g) ?? []).length === 2 && /<RowPictureView picture=\{childPicture\} size=\{32\}/.test(tab))
check("an app block keeps its brand mark (its row's icon), a picture never covers it", rowPictureOf({ type: "app", data: { provider: "substack" } }) === null)
const view = read("components/onepage/row-picture.tsx")
check("the map is OpenStreetMap's public tile, credited, lazy", /title=\{`\$\{picture\.label\} · © OpenStreetMap`\}/.test(view) && /loading="lazy"/.test(view) && !/maps\.googleapis/.test(view + read("lib/onepage/row-picture.ts")))

section("+ ADD ON A PHONE")
const picker = read("components/onepage/add-block-picker.tsx")
check("a click that ends a scroll (travel past TAP_SLOP_PX, or the browser's cancel) opens nothing; a key always does", /const wasScroll = scrolled\.current && e\.detail > 0/.test(picker) && /onPointerCancel=\{\(\) => \{\s*\/\*[^*]*\*\/\s*scrolled\.current = true/.test(picker) && /TAP_SLOP_PX\)\) \{\s*scrolled\.current = true/.test(picker))
/* The resting :active style lives in components/ui/depth-button.ts (accentNoActive), so the picker names no violet (tests/onepage-creator-blocks.test.ts). */
check("no :active tint; the press is data-pressed, after a finger rests", /"touch-manipulation",\s*accentNoActive,/.test(picker) && /export const accentNoActive = "active:bg-\[#8b5cf6\] active:shadow-/.test(read("components/ui/depth-button.ts")) && /data-\[pressed\]:bg-\[#6d28d9\]/.test(picker) && /window\.setTimeout\(\(\) => setPressed\(true\), ADD_PRESS_DELAY_MS\)/.test(picker))
check("a finger that travels lets go at once", /Math\.abs\(e\.clientX - p\.x\) > TAP_SLOP_PX \|\| Math\.abs\(e\.clientY - p\.y\) > TAP_SLOP_PX\)\) \{\s*scrolled\.current = true\s*letGo\(\)/.test(picker))

section("SHARE")
const editor = read("components/onepage/onepage-editor.tsx")
check("both Share buttons tick in the apps, and only there", (editor.match(/onClick=\{openShare\}/g) ?? []).length === 2 && /const openShare = \(\) => \{\s*if \(isNativeApp\(\)\) hapticTap\("light"\)/.test(editor))

section("THE PREVIEW'S TOP BAR")
const layout = read("app/(storelib)/layout.tsx")
check("the frame is marked before its first paint, and never gets the app class", /window\.self!==window\.top&&\/\^\\\\\/onepage-preview/.test(layout) && /&&!document\.documentElement\.hasAttribute\('data-onepage-embedded'\)\)\{var h=document\.documentElement;h\.classList\.add\('capacitor'\)/.test(layout))
const previewDoc = read("components/onepage/preview-document.tsx")
check("and the frame's own document says so again before the page is drawn", /if \(window\.self !== window\.top\) \{\s*document\.documentElement\.setAttribute\("data-onepage-embedded", ""\)\s*document\.documentElement\.classList\.remove\("capacitor"\)/.test(previewDoc))
const css = read("app/globals.css")
check("the page's top inset: the notch, and 0 in the frame", /:root \{\s*--op-safe-top: env\(safe-area-inset-top, 0px\);\s*\}\s*:root\[data-onepage-embedded\] \{\s*--op-safe-top: 0px;/.test(css))
const bar = read("components/onepage/hero-scroll.tsx")
check("the bar pads by it, not by the screen's inset", /op-topbar fixed inset-x-0 top-0 z-\[19\] pt-\[var\(--op-safe-top,0px\)\]/.test(bar) && !/pt-\[env\(safe-area-inset-top\)\]/.test(bar))
check("so do the corner buttons, the block sheets and the lightbox", /top-\[calc\(var\(--op-safe-top,0px\)\+10px\)\]/.test(live) && !/env\(safe-area-inset-top/.test(read("components/onepage/block-sheet.tsx")) && !/env\(safe-area-inset-top/.test(read("components/onepage/product-lightbox.tsx")))

section("PREVIEW AND EDIT")
check("warmed once the editor is idle on a phone", /requestIdleCallback\(warm, \{ timeout: PREVIEW_WARM_MS \}\)/.test(editor) && /matchMedia\("\(max-width: 767px\)"\)\.matches/.test(editor))
check("a press on Preview starts it if idle has not", /onPointerDown=\{\(\) => \{\s*if \(!mobilePreviewKept\) setMobilePreviewKept\(true\)/.test(editor))
check("both layers stay laid out; a switch is visibility and inert", /showMobilePreview && "max-md:invisible"/.test(editor) && /"absolute inset-0 z-\[3\] flex flex-col overflow-hidden md:hidden", !showMobilePreview && "invisible pointer-events-none"/.test(editor) && !/showMobilePreview \? "hidden" : "block"/.test(editor))
check("the tab bar is kept mounted under Preview", !/\{!showMobilePreview && \(\s*<div\s*className="md:hidden fixed bottom-0/.test(editor) && /showMobilePreview && "invisible"\)\}/.test(editor))

section("THE STICKY WAY BACK")
const design = read("components/onepage/tabs/design-tab.tsx")
const sticky = design.slice(design.indexOf("function StickyPanelBack"), design.indexOf("function NameStyleRows"))
check("a sticky box of the bar's own height, its own layer", /className="pointer-events-none sticky top-0 z-20 -mb-14 h-14 will-change-transform"/.test(sticky))
check("faded by opacity only: no slide, no blur, no scroll listener", /transition-opacity duration-\[180ms\]/.test(sticky) && !/translate:/.test(sticky) && !/backdrop/.test(sticky) && !/addEventListener\("scroll"/.test(sticky) && /new IntersectionObserver\(/.test(sticky))

section("THE STATS PERIOD")
const drp = read("components/app/date-range-picker.tsx")
check("a phone: the shared sheet, above the sheet it was opened from", /if \(phone\) \{/.test(drp) && /zIndex=\{overlay \? OVERLAY_SHEET_Z : undefined\}/.test(drp) && /export const OVERLAY_SHEET_Z = 210/.test(drp))
check("a computer: the popover, never taller than the room it has", /data-drp-overlay=\{overlay \? "" : undefined\}/.test(drp) && /max-h-\[var\(--radix-popover-content-available-height\)\]/.test(drp))
check("the trigger opens the sheet on a phone", /onClick=\{inline \|\| phone \? \(\) => setShown\(inline \? !open : true\) : undefined\}/.test(drp))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
