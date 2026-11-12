/**
 * ===========================================================================
 *  ROUND 3: SOCIAL ICONS, A BLOCK'S ICON STYLE, THE STORY, INSTAGRAM'S PICTURE
 * ===========================================================================
 * The owner:
 *   1  Brand colours as the default, drawn as the reference: each brand's own mark in its own colours on a white
 *      circle; many icons slide sideways, centred when they fit.
 *   2  Every block that shows a service's mark offers Original, Solid, Outline and Glass (the social row's rule).
 *   3  Share: Facebook gives way to an Instagram story picture (1080 x 1920) shared as a file or downloaded.
 *   4  An Instagram profile's picture for its block, copied into Storelib, with what needs Meta's token said.
 *
 * In a browser, at 390 and 1440: scripts/check-onepage-social-r3.mjs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { BLOCK_ICON_LOOKS, blockIconLookOf, blockMarkLook, socialIsBrandDisc, socialMarkColorOf, socialTileStyle, socialIconToneOf, BRAND_DISC_INK } from "@/lib/onepage/social-look"
import { presentationOf } from "@/lib/onepage/block-presentation"
import { STORY_HEIGHT, STORY_WIDTH, fitText, parseCssPaint, storyInk, storyLayout } from "@/lib/onepage/story-image"
import { businessDiscoveryUrl, instagramGraphConfig, instagramUsername, parseBusinessDiscovery, parseProfileOpenGraph } from "@/lib/onepage/instagram-profile"

let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed++
    console.log(`  FAIL ${name}${detail !== undefined ? ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

console.log("\n1. Brand colours: the white disc, the brands' own marks, a row that slides")
{
  const disc = socialTileStyle({ social_icon_style: "filled", social_icon_tone: "brand", social_icon_color: "#ffffff" }, { onLight: false })
  check("Solid in brand colours is a white disc", disc.backgroundColor === "#ffffff" && disc.borderRadius === 999 && disc.borderWidth === 0, disc)
  check("its black marks are near black even when the icon colour is white", socialMarkColorOf({ social_icon_style: "filled", social_icon_tone: "brand", social_icon_color: "#ffffff" }) === BRAND_DISC_INK && disc.color === BRAND_DISC_INK)
  check("on a light page the disc keeps a hairline, so white reads on white", /0 0 0 1px/.test(String(socialTileStyle({ social_icon_tone: "brand" }, { onLight: true }).boxShadow)))
  check("Outline and Glass in brand colours keep their own tiles and the icon colour", !socialIsBrandDisc({ social_icon_style: "outline", social_icon_tone: "brand" }) && socialMarkColorOf({ social_icon_style: "minimal", social_icon_tone: "brand", social_icon_color: "#123456" }) === "#123456")
  check("One colour on Solid is still the tint, in the icon colour", socialTileStyle({ social_icon_tone: "mono", social_icon_color: "#123456" }, { onLight: true }).backgroundColor === "color-mix(in srgb, #123456 12.5%, transparent)")
  check("a page saved before the choice stays one colour; a new page starts on brand colours", socialIconToneOf({}) === "mono" && /social_icon_tone: "brand"/.test(code("lib/onepage/ensure-onepage.ts")))
  const icons = code("components/onepage/brand-icons.tsx")
  check("TikTok in its colours is the note over a cyan and a red copy", /function TikTokMark/.test(icons) && /TIKTOK_STOPS = \["#25F4EE", "#FE2C55"\]/.test(icons) && /tone === "brand" && markKey === "tiktok"/.test(icons))
  check("LinkedIn in its colours is the blue \"in\"", /tone === "brand" && key === "linkedin" \? FaLinkedinIn/.test(icons) && /export function FaLinkedinIn/.test(read("components/icons/brand-icons.generated.ts")))
  const live = code("components/onepage/public-onepage.tsx")
  check("the row, the theme cards and Design draw the mark colour from the rule", /const socialColor = socialMarkColorOf\(theme as never\)/.test(live) && /socialMarkColorOf\(c as never\)/.test(code("components/onepage/themes/theme-preview.tsx")) && (code("components/onepage/tabs/design-tab.tsx").match(/socialMarkColorOf\(/g) || []).length >= 2)
  check("the social row is the sliding row", /<SocialRowScroller/.test(live) && /data-op-social-row=""/.test(code("components/onepage/social-row-scroller.tsx")))
  const css = code("app/globals.css")
  check("it slides on x with a soft snap, no scrollbar, and the edge with more fades", /\.op-social-scroll \{[^}]*overflow-x: auto;[^}]*scroll-snap-type: x proximity;[^}]*scrollbar-width: none;/.test(css) && /\.op-social-scroll::-webkit-scrollbar \{ display: none; \}/.test(css) && /\.op-social-scroll\[data-fade="both"\]/.test(css))
  check("it is centred while it fits", /\.op-social-track \{[^}]*width: max-content; margin-inline: auto;/.test(css))
  const scroller = code("components/onepage/social-row-scroller.tsx")
  check("the scroll is the browser's own: JavaScript only reads it, once a frame at most", /addEventListener\("scroll", soon, \{ passive: true \}\)/.test(scroller) && /requestAnimationFrame\(read\)/.test(scroller) && !/scrollTo|scrollLeft =/.test(scroller))
}

console.log("\n2. A block's Icon style")
{
  check("four looks: Original, Solid, Outline, Glass", BLOCK_ICON_LOOKS.join(",") === "original,solid,outline,glass")
  check("anything else reads as Original", blockIconLookOf("neon") === "original" && blockIconLookOf(undefined) === "original" && blockIconLookOf("glass") === "glass")
  const solid = blockMarkLook("solid", 30)
  const outline = blockMarkLook("outline")
  const glass = blockMarkLook("glass")
  check("Solid is the row's tint, one colour", solid.tone === "mono" && solid.tile.backgroundColor === "color-mix(in srgb, currentColor 12.5%, transparent)" && solid.tile.width === 30)
  check("Outline is the row's 2px ring at 25%, one colour", outline.tone === "mono" && outline.tile.borderWidth === 2 && outline.tile.borderColor === "color-mix(in srgb, currentColor 25%, transparent)")
  check("Glass is frosted, the mark in its own colours", glass.tone === "brand" && /blur/.test(String(glass.tile.backdropFilter)))
  check("saved per block, checked when read", presentationOf({ style: { presentation: { icon_look: "outline" } } } as never).icon_look === "outline" && presentationOf({ style: { presentation: { icon_look: "<x>" } } } as never).icon_look === undefined)
  const app = code("components/onepage/app-block.tsx")
  check("every mark an app block draws reads the block's choice", /<BlockIconLookScope look=\{blockIconLookOf\(presentationOf\(block\)\.icon_look\)\}>/.test(app) && /const chosen = useBlockIconLook\(\)/.test(app))
  check("a cover in the service's colour is Original's; another look draws it in the page's colours", /const ownCover = useBlockIconLook\(\) === "original"/.test(app) && (app.match(/ownCover \? coverFill/g) || []).length === 2)
  const live = code("components/onepage/public-onepage.tsx")
  check("a link with a service's mark draws it in the chosen look, every layout", (live.match(/drawLinkIcon\(iconPlace\)/g) || []).length === 3 && /isLinkBrandIcon\(linkKey\)/.test(live))
  check("the followers block too", /blockIconLookOf\(presentationOf\(block\)\.icon_look\)/.test(code("components/onepage/storelib-blocks.tsx")))
  const settings = code("components/onepage/block-settings.tsx")
  check("Layout offers it only on a block that shows a service's mark", /<BlockIconLookPicker block=\{block\}/.test(settings) && /export function blockServiceMark/.test(settings) && /if \(!mark\) return null/.test(settings))
  check("Reset style forgets it", /\["align", "icon_look",/.test(settings))
}

console.log("\n3. Share to Instagram Story")
{
  check("the picture is 1080 x 1920", STORY_WIDTH === 1080 && STORY_HEIGHT === 1920)
  const paint = parseCssPaint("linear-gradient(135deg, #ff7a59 0%, rgb(194, 24, 91) 55%, #4a148c 100%)")
  check("a page's gradient is painted as itself", paint.kind === "linear" && paint.angle === 135 && paint.stops.length === 3 && paint.stops[1].color === "rgb(194, 24, 91)" && paint.stops[1].at === 0.55, paint)
  const radial = parseCssPaint("radial-gradient(circle at 25% 105%, #FFD600 0%, #FF0069 50%, #7638FA 100%)")
  check("a radial one too, its position not taken for a colour", radial.kind === "radial" && radial.stops.length === 3 && radial.stops[0].color === "#FFD600", radial)
  check("a colour is a colour; nothing readable is Storelib's ink", JSON.stringify(parseCssPaint("#f6f1e7")) === JSON.stringify({ kind: "solid", color: "#f6f1e7" }) && JSON.stringify(parseCssPaint("url(x.png)")) === JSON.stringify({ kind: "solid", color: "#1a1a2e" }))
  check("words are white on a dark ground or a dark gradient, ink on a light one", storyInk("#14141a") === "light" && storyInk("#f6f1e7") === "dark" && storyInk("linear-gradient(135deg, #ff7a59 0%, #c2185b 55%, #4a148c 100%)") === "light")
  const L = storyLayout(400)
  check("the photo, the name, the handle and the pill stack down the middle, clear of Instagram's bars", L.avatar.cx === 540 && L.avatar.cy - L.avatar.r > 250 && L.name.y > L.avatar.cy + L.avatar.r && L.handle.y > L.name.y && L.pill.y > L.handle.y && L.pill.y + L.pill.h < 1920 - 300)
  check("the pill fits its address, between 520 and 900 wide, centred", storyLayout(10).pill.w === 520 && storyLayout(5000).pill.w === 900 && L.pill.x * 2 + L.pill.w === 1080)
  check("a long name is cut with an ellipsis", fitText((t) => t.length * 10, "A very long creator name indeed", 100).endsWith("…") && fitText((t) => t.length * 10, "Short", 100) === "Short")
  const story = code("lib/onepage/story-image.ts")
  check("a phone shares the picture as a file; anything else downloads it and copies the address", /navigator\.canShare\?\.\(\{ files: \[file\] \}\)/.test(story) && /navigator\.share\(\{ files: \[file\] \}\)/.test(story) && /a\.download = fileName/.test(story) && /clipboard\?\.writeText/.test(story))
  check("a photo that taints the canvas is drawn again as the initial", /getImageData\(0, 0, 1, 1\)[\s\S]*?paintStory\(ctx, input, face, null\)/.test(story))
  const hook = code("components/onepage/use-story-share.ts")
  check("the picture is drawn before the tap, so the share keeps the tap's permission", /requestIdleCallback/.test(hook) && /ready\.current/.test(hook))
  const sheet = code("components/onepage/share-sheet.tsx")
  check("the visitor's sheet: Story, no Facebook", /name: "Story"/.test(sheet) && /label: "Share to Instagram Story"/.test(sheet) && !/facebook\.com\/sharer|name: "Facebook"/.test(sheet))
  check("after a download, one line on the link sticker", /Image saved and link copied\. In your story, add a Link sticker and paste it\./.test(sheet))
  const editor = code("components/onepage/onepage-editor.tsx")
  check("the creator's Share window has it too", /tt\("Share to Instagram Story"\)/.test(editor) && /data-share-story=""/.test(editor))
}

console.log("\n4. An Instagram profile's picture")
{
  check("a profile's username from its address, @name or name", instagramUsername("https://www.instagram.com/Satori.Shop/") === "satori.shop" && instagramUsername("@satori") === "satori" && instagramUsername("instagram.com/satori?hl=en") === "satori")
  check("a post, a reel, another site or nonsense is no profile", instagramUsername("https://instagram.com/p/Cx1/") === null && instagramUsername("https://instagram.com/reel/abc") === null && instagramUsername("https://instagram.com/explore") === null && instagramUsername("https://evil.com/satori") === null && instagramUsername("a b") === null)
  check("Meta's token needs both its values", instagramGraphConfig({}) === null && instagramGraphConfig({ INSTAGRAM_GRAPH_ACCESS_TOKEN: "t" }) === null && JSON.stringify(instagramGraphConfig({ INSTAGRAM_GRAPH_ACCESS_TOKEN: "t", INSTAGRAM_GRAPH_USER_ID: "17841400000000000" })) === JSON.stringify({ token: "t", userId: "17841400000000000" }))
  const url = businessDiscoveryUrl({ token: "t/k", userId: "17841400000000000" }, "satori", "v23.0")
  check("with it, Graph's business_discovery for that username", url.startsWith("https://graph.facebook.com/v23.0/17841400000000000?fields=") && decodeURIComponent(url).includes("business_discovery.username(satori){username,name,profile_picture_url,media") && url.endsWith("access_token=t%2Fk"))
  const bd = parseBusinessDiscovery({ business_discovery: { username: "satori", name: "Satori <b>Studio</b>", profile_picture_url: "https://scontent.cdninstagram.com/v/a.jpg?oe=1", media: { data: [{ permalink: "https://www.instagram.com/p/Cx1Ab/" }, { permalink: "javascript:alert(1)" }, { permalink: "https://www.instagram.com/reel/Dd2/" }] } } }, "satori")
  check("its answer: the name cleaned, the picture, the posts that are Instagram posts", bd?.name === "Satori Studio" && bd?.picture === "https://scontent.cdninstagram.com/v/a.jpg?oe=1" && bd?.posts.join(",") === "https://www.instagram.com/p/Cx1Ab/,https://www.instagram.com/reel/Dd2/", bd)
  check("an error answer is nothing", parseBusinessDiscovery({ error: { message: "x" } }, "satori") === null)
  const og = parseProfileOpenGraph(`<html><head><meta property="og:title" content="Satori Studio (@satori) &#x2022; Instagram photos and videos"><meta property="og:image" content="https://scontent-lhr8-1.cdninstagram.com/v/t51/123_n.jpg?stp=dst&amp;oe=6700"></head></html>`, "satori")
  check("without it, the profile page's Open Graph picture and name", og?.picture?.startsWith("https://scontent-lhr8-1.cdninstagram.com/v/t51/123_n.jpg") === true && og?.name === "Satori Studio" && og?.posts.length === 0, og)
  check("Instagram's sign-in page (its own logo) is no picture", parseProfileOpenGraph(`<meta property="og:image" content="https://static.cdninstagram.com/rsrc.php/v3/yt/r/30PrGfR3xhB.png">`, "satori") === null && parseProfileOpenGraph(`<title>Login • Instagram</title>`, "satori") === null)
  check("nor is a picture from anywhere else", parseProfileOpenGraph(`<meta property="og:image" content="https://evil.example/a.jpg">`, "satori") === null)
  const route = code("app/api/onepage/instagram-profile/route.ts")
  check("the route: signed in, a page's owner or team, rate limited", /routeUser\(\)/.test(route) && /onePageActor\(/.test(route) && /bucket: "onepage-instagram-profile"/.test(route))
  check("it reads through the private address guard and copies the picture under the copy rules", (route.match(/fetchPublic\(/g) || []).length === 2 && /downloadExternalImage\(profile\.picture\)/.test(route) && /\.storage\.from\(BUCKET_NAME\)\.upload\(path, got\.bytes/.test(route))
  check("Instagram's own picture address is never answered", !/avatar_url: profile\.picture|picture: profile\.picture/.test(route) && /avatar_url: data\.publicUrl/.test(route))
  const editor = code("components/onepage/app-block-editor.tsx")
  check("the Instagram block offers it beside its picture, and the posts when Meta gave them", /provider\.id === "instagram" \? <InstagramPhoto/.test(editor) && /tt\("Use my Instagram photo"\)/.test(editor) && /tt\("Add your latest posts \(\{value\}\)"/.test(editor))
  check("the editor bundles only the username parser, not the server's reading", /from "@\/lib\/onepage\/instagram-username"/.test(editor) && !/^import/m.test(code("lib/onepage/instagram-username.ts")))
}

console.log("\n5. Every new word in every language")
{
  const words = ["Icon style", "Original", "Solid", "Outline", "Glass", "Share to Instagram Story", "Image saved and link copied. In your story, add a Link sticker and paste it.", "Use my Instagram photo", "Getting your photo", "Instagram didn't share this profile's picture. Upload one instead.", "Instagram didn't answer. Try again or upload a picture.", "Add your latest posts ({value})"]
  for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
    const cat = read(`lib/i18n/catalog/${lang}.ts`)
    const missing = words.filter((w) => !cat.includes(`${JSON.stringify(w)}:`))
    check(`${lang}: all ${words.length}`, missing.length === 0, missing)
  }
}

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log("\nall passed")
