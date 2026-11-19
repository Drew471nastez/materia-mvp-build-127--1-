/**
 * Round AR3, OnePage block layouts, display and embeds:
 *
 *   - image 137: a block's settings that grow while they open can never stay
 *     at opacity 0 (components/onepage/reveal), and every block type the
 *     editor can hold has a settings panel to draw
 *   - music and video have three layouts (lib/onepage/media-layout), a new
 *     one plays on the page, and a video can be a file Storelib holds
 *   - Cover, Fit and Full for pictures on links, products, shelves and lists
 *   - a link shows Calendly, Typeform, Canva, Google Maps, podcasts and
 *     Apple Music in place; Canva is an embed of its own
 *   - a pasted address's card from oEmbed, read from recorded answers
 *     (tests/fixtures/oembed), with a fixed endpoint list and checked output
 *   - Fourthwall and Bonfire are gone from the sheet, saved ones are links
 *   - "Total followers" from one field: a link or an @handle
 *   - more links in a link block, documents with page count and download
 *
 * scripts/check-onepage-ar3.mjs measures the layouts, words, embeds and
 * settings in headless Chromium at 390 and 1440.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { mediaLayoutOf, mediaLayoutPatch, videoFileUrl } from "@/lib/onepage/media-layout"
import { videoSource, EXTRA_BLOCK_TYPES } from "@/lib/onepage/extra-blocks"
import { createDefaultBlock } from "@/lib/onepage/types"
import { blockInteraction } from "@/lib/onepage/block-sheet"
import { socialPresentation, socialProfile, embedIsTool } from "@/lib/onepage/block-presentation"
import { embedSource, EMBED_FRAME_HOSTS } from "@/lib/onepage/creator-blocks"
import { oembedEndpoint, parseOEmbed } from "@/lib/onepage/oembed"
import { parseLinkMetadata } from "@/lib/onepage/link-metadata"
import { detectFollowerInput } from "@/lib/onepage/storelib-blocks"
import { isRetiredAppProvider, APP_PROVIDERS } from "@/lib/onepage/app-blocks"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, got?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("IMAGE 137: A BLOCK'S SETTINGS NEVER STAY INVISIBLE")
{
  const reveal = read("components/onepage/reveal.tsx")
  check("the held open plays its fade whenever the fade is still this open's (not only when the height animation is)", /if \(!animRef\.current\.includes\(fade\)\) return/.test(reveal) && !/if \(animRef\.current\[0\] !== a\) return/.test(reveal))
  check("a watchdog finishes any fade still running or paused once the open's time is up", /fade\.playState === "paused" \|\| fade\.playState === "running"\) fade\.finish\(\)/.test(reveal) && /\}, ms \+ 400\)/.test(reveal))
  /* Every block type the editor holds is drawn by a case of its own, the extra blocks' editor, or the group's own panel. */
  const types = [...read("lib/onepage/types.ts").matchAll(/^\s+\| "([a-z_]+)"$/gm)].map((m) => m[1])
  const links = read("components/onepage/tabs/links-tab.tsx")
  const body = links.slice(links.indexOf("const renderSettingsContent = () => {"), links.indexOf("// Special handling for group blocks with Links/Layout tabs"))
  const cased = new Set([...body.matchAll(/case "([a-z_]+)":/g)].map((m) => m[1]))
  const extra = new Set<string>(EXTRA_BLOCK_TYPES as readonly string[])
  const orphan = types.filter((t) => !cased.has(t) && !extra.has(t))
  check(`every one of the ${types.length} block types has its own settings (none falls to "No settings available")`, types.length >= 28 && orphan.length === 0, orphan)
  check("the Digital products shelf is drawn by the shelf's own editor", extra.has("storelib_shelf") && /case "storelib_shelf":\s+return <ShelfEditor/.test((read("components/onepage/storelib-blocks.tsx") + "\n" + read("components/onepage/storelib-blocks-editor.tsx"))))
  check("the browser check opens every type and fails on a body under 60px, under opacity 1 or with no field", /m\.h < 60 \|\| m\.opacity < 0\.99 \|\| m\.fields < 1/.test(read("scripts/check-onepage-ar3.mjs")))
}

console.log("MUSIC AND VIDEO LAYOUTS")
{
  check("a saved block with no layout reads its Interaction: inline is the player, a sheet or a link the button", mediaLayoutOf({ open_mode: "inline" }) === "player" && mediaLayoutOf({}) === "player" && mediaLayoutOf({ open_mode: "sheet" }) === "button" && mediaLayoutOf({ open_mode: "direct" }) === "button")
  check("a picked layout wins and writes an Interaction that agrees", mediaLayoutOf({ layout: "card", open_mode: "inline" }) === "card" && mediaLayoutPatch("player", { open_mode: "direct" }).open_mode === "inline" && mediaLayoutPatch("card", { open_mode: "direct" }).open_mode === "direct" && mediaLayoutPatch("button", { open_mode: "inline" }).open_mode === "sheet")
  for (const t of ["music", "video"] as const) {
    const b = createDefaultBlock(t)
    check(`a new ${t} block starts as the player, on the page`, mediaLayoutOf(b.data as never) === "player" && blockInteraction(b) === "inline")
  }
  check("a video file Storelib holds plays: an https or same-site mp4, mov, webm", videoFileUrl("https://x.supabase.co/storage/v1/object/public/onepage-assets/u/video_1.mp4") !== null && videoFileUrl("/media/a.webm") !== null && videoFileUrl("https://cdn.example.com/a.MOV?x=1") !== null)
  check("never a javascript:, data:, http:, protocol-relative or non-video address", [ "javascript:alert(1)//a.mp4", "data:video/mp4;base64,AAAA", "http://example.com/a.mp4", "//evil.test/a.mp4", "https://example.com/a.mp4.html", "https://example.com/page" ].every((u) => videoFileUrl(u) === null))
  check("videoSource knows the file kind, and YouTube first", videoSource("https://example.com/v/clip.mp4")?.kind === "file" && videoSource("https://youtu.be/dQw4w9WgXcQ")?.kind === "youtube")
  const extra = (read("components/onepage/extra-blocks.tsx") + "\n" + read("components/onepage/extra-blocks-editor.tsx"))
  check("the page draws music and video by their layout: the card, the button or the player", /if \(layout === "button"\) return <SheetBlock/.test(extra) && /if \(layout === "card"\) return <MediaCardBlock/.test(extra))
  check("an uploaded video plays in Storelib's own player, lazy, muted autoplay only when asked and never under reduced motion", /<FileVideoPlayer src=\{source\.id\}/.test(extra) && /preload=\{near \? "metadata" : "none"\}/.test(read("components/onepage/media-blocks.tsx")) && /!autoplay \|\| !near \|\| !box \|\| !v \|\| reducedMotion\(\)/.test(read("components/onepage/media-blocks.tsx")))
  check("the Layout tab of a music or video block draws Player, Card and Button", /block\.type === "music" \|\| block\.type === "video" \? \(/.test(read("components/onepage/tabs/links-tab.tsx")) && /<MediaLayoutPicker/.test(read("components/onepage/tabs/links-tab.tsx")))
  check("a video can be uploaded or picked from the store's videos", /want: "video"/.test(read("components/onepage/media-editor.tsx")) && /<FilesLibraryChooser open=\{choosing\} onClose=\{\(\) => setChoosing\(false\)\} kind="video"/.test(read("components/onepage/media-editor.tsx")))
  check("a song's cover for the card is read from the address's preview, server side", /\/api\/onepage\/link-preview\?url=/.test(read("components/onepage/cover-from-preview.ts")) && /useCoverFromPreview\(data\.url, data\.artwork_url, "artwork_url"/.test((read("components/onepage/creator-blocks.tsx") + "\n" + read("components/onepage/creator-blocks-editor.tsx"))))
}

console.log("PICTURE FIT: COVER, FIT, FULL")
{
  check("a link card draws Cover, Fit and Full", /const fit=d\.display_mode === "contain" \|\| d\.display_mode === "full"/.test(read("components/onepage/block-presentation.tsx")) && /data-picture-fit="full"/.test(read("components/onepage/block-presentation.tsx")))
  check("a product's picture follows image_fit", /data\.image_fit === "contain" \|\| data\.image_fit === "full"/.test(read("components/onepage/product-block.tsx")))
  /* Wave 16: the owner's product tiles were empty frames the size of a picture. A picture that will not draw gives way to the next one the block knows, then to none. */
  {
    const pb = read("components/onepage/product-block.tsx")
    /* Changed on purpose (round 19): the same order through withOriginalCover (the card copy swapped for the original wherever it stands), the card copy last, each tried in turn. */
    check("a product picture that will not draw falls back to the next one, then to no picture (never an empty frame)", /withOriginalCover\(\[data\.custom_thumbnail, data\.product_cover, data\.product_thumbnail\][^\n]*\.concat\(data\.product_thumbnail \|\| \[\]\)\.find\(\(u\) => !unloadable\.includes\(u\)\)/.test(pb) && /onError: \(\) => dropPicture\(src\)/.test(pb) && /el\.complete && el\.naturalWidth === 0/.test(pb) && (pb.match(/pictureFails\(image\)/g) || []).length === 3)
  }
  check("a shelf's plain cards and a list's pictures follow it too", /const shelfFit = /.test((read("components/onepage/storelib-blocks.tsx") + "\n" + read("components/onepage/storelib-blocks-editor.tsx"))) && /data\.image_fit === "contain" \|\| data\.image_fit === "full"/.test(read("components/onepage/app-block.tsx")))
  check("one control, offered on links with a picture, products, shelves and lists", /export function PictureFitControl/.test(read("components/onepage/layout-pickers.tsx")) && /<PictureFitControl/.test(read("components/onepage/tabs/links-tab.tsx")) && /<PictureFitControl/.test((read("components/onepage/storelib-blocks.tsx") + "\n" + read("components/onepage/storelib-blocks-editor.tsx"))) && /<PictureFitControl/.test(read("components/onepage/app-block-editor.tsx")))
}

console.log("LINKS SHOWN IN PLACE, AND CANVA")
{
  const cases: [string, string][] = [
    ["https://calendly.com/satori/intro", "Calendly"],
    ["https://form.typeform.com/to/abcDEF12", "Typeform"],
    ["https://www.canva.com/design/DAFabcdEFGH/xyz123/view", "Canva"],
    ["https://www.google.com/maps/place/Time+Out+Market+Lisboa", "Google Maps"],
    ["https://podcasts.apple.com/us/podcast/the-show/id1234567890", "Apple Podcasts"],
    ["https://music.apple.com/us/album/name/123456789?i=987654321", "Apple Music"],
  ]
  for (const [url, name] of cases) check(`${name}: a link shows it in place`, socialPresentation(url)?.platform === name, socialPresentation(url))
  check("no frame for a look-alike host or a profile", ["https://calendly.com.evil.test/x", "https://www.canva.com.evil.test/design/DAFabcdEFGH/view", "https://evilgoogle.com/maps/place/x", "https://www.amazon.com/dp/B0B6XZ7Q3X"].every((u) => socialPresentation(u) === null) && socialProfile("https://instagram.com/satori")?.handle === "satori")
  check("a form, a booking page or a map is filled in inside its frame (forms allowed), a video is not", embedIsTool("Calendly") && embedIsTool("Typeform") && !embedIsTool("YouTube") && /allow-forms/.test(read("components/onepage/block-presentation.tsx")))
  const canva = embedSource("https://www.canva.com/design/DAFabcdEFGH/xyz123/view")
  check("Canva plays in its own player, from an edit link too", canva?.kind === "canva" && canva.embedUrl === "https://www.canva.com/design/DAFabcdEFGH/xyz123/view?embed" && embedSource("https://www.canva.com/design/DAFabcdEFGH/edit")?.embedUrl === "https://www.canva.com/design/DAFabcdEFGH/view?embed")
  check("Canva's frame is allowed by the page's frame-src", EMBED_FRAME_HOSTS.includes("https://www.canva.com" as never) && read("lib/security/csp.ts").includes('"https://www.canva.com"'))
  check("Canva is in the Add block sheet; Podcasts already was", /embed\("int_canva", "Canva"/.test(read("components/onepage/add-block-picker.tsx")) && /app\("podcasts", "media"/.test(read("components/onepage/add-block-picker.tsx")))
}

console.log("A LINK'S CARD FROM oEMBED, RECORDED")
{
  const rec = JSON.parse(read("tests/fixtures/oembed/recorded.json")) as Record<string, { address: string; answer: unknown }>
  const yt = oembedEndpoint(rec.youtube.address)
  check("each service's fixed endpoint, the address only as a parameter", yt?.url === `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(rec.youtube.address)}` && oembedEndpoint("https://open.spotify.com/track/x")?.url.startsWith("https://open.spotify.com/oembed?url=") === true)
  check("no endpoint for any other host, a look-alike or a non-web address", ["https://youtube.com.evil.test/watch?v=x", "https://example.com/oembed", "javascript:alert(1)", "https://user:pw@vimeo.com/1", "https://vimeo.com:8443/1"].every((u) => oembedEndpoint(u) === null))
  for (const k of ["youtube", "spotify", "vimeo", "tiktok"]) {
    const m = parseOEmbed(rec[k].answer, rec[k].address, oembedEndpoint(rec[k].address)!.provider)
    check(`${k}: title, picture and the author line from the recorded answer`, !!m && !!m.title && /^https:\/\//.test(m.image || "") && m.url === rec[k].address, m)
  }
  const tt = parseOEmbed(rec.tiktok.answer, rec.tiktok.address, "TikTok")
  check("markup in a title is dropped as text, never kept", !!tt && !/[<>]/.test(tt.title))
  const hostile = parseOEmbed(rec.hostile.answer, rec.hostile.address, "YouTube")
  check("a javascript: picture is refused and the answer's html is never read", !!hostile && hostile.image === null && hostile.title === "Free" && !/<script|alert/.test(JSON.stringify(hostile)))
  check("a picture on a private address is refused", parseOEmbed(rec.private_thumbnail.answer, rec.private_thumbnail.address, "Vimeo")?.image === null)
  check("an answer that is not an object is nothing", parseOEmbed("<html>", rec.youtube.address, "YouTube") === null && parseOEmbed([], rec.youtube.address, "YouTube") === null)
  const amazon = parseLinkMetadata(read("tests/fixtures/oembed/amazon-product.html"), "https://www.amazon.com/dp/0593652886")
  check("an Amazon book's page gives its Open Graph card (no oEmbed there)", amazon.title === "The Creative Act: A Way of Being" && amazon.image === "https://m.media-amazon.com/images/I/71g8Jfr2NRL._SY425_.jpg" && oembedEndpoint("https://www.amazon.com/dp/0593652886") === null)
  const route = read("app/api/onepage/link-preview/route.ts")
  check("the route asks oEmbed through the same private address guard, 64 KB at most, JSON only", /fetchPublic\(at\.url, \{ maxBytes: 65_536/.test(route) && /json\/i\.test/.test(route) && /routeUser\(\)/.test(route) && /rateLimit\(/.test(route))
}

console.log("FOURTHWALL AND BONFIRE")
{
  check("not in the Add block sheet", !/app\("fourthwall"|app\("bonfire"/.test(read("components/onepage/add-block-picker.tsx")))
  check("a saved one keeps its data and is drawn as a plain link", isRetiredAppProvider("bonfire") && isRetiredAppProvider("fourthwall") && !!APP_PROVIDERS.bonfire && /if \(isRetiredAppProvider\(data\.provider\)\) return <RetiredView/.test(read("components/onepage/app-block.tsx")))
}

console.log("TOTAL FOLLOWERS FROM ONE FIELD")
{
  check("a profile link says its network and account", JSON.stringify(detectFollowerInput("https://www.instagram.com/satori/")) === JSON.stringify({ network: "instagram", handle: "satori" }) && detectFollowerInput("tiktok.com/@satori")?.network === "tiktok" && detectFollowerInput("https://youtube.com/@satori")?.handle === "@satori" && detectFollowerInput("https://bsky.app/profile/satori.bsky.social")?.handle === "satori.bsky.social")
  check("a bare @handle asks for the network; a Bluesky handle is Bluesky's", JSON.stringify(detectFollowerInput("@satori")) === JSON.stringify({ network: null, handle: "satori" }) && detectFollowerInput("satori.bsky.social")?.network === "bluesky")
  check("anything else is nothing", detectFollowerInput("") === null && detectFollowerInput("javascript:alert(1)") === null && detectFollowerInput("https://example.com/satori") === null && detectFollowerInput("two words") === null)
  const ed = (read("components/onepage/storelib-blocks.tsx") + "\n" + read("components/onepage/storelib-blocks-editor.tsx"))
  check("the count is read at once where it can be, and said plainly where it cannot", /void refresh\(entry, next\)/.test(ed) && /does not share follower counts with other sites\. Type your number\./.test(ed))
}

console.log("MORE")
{
  const links = read("components/onepage/tabs/links-tab.tsx")
  check("a website added as a link takes the Card layout on its first preview with a picture, never a social address", /const firstPreview=!socialProfile\(url\)&&!socialPresentation\(url\)&&!data\.link_preview\?\.url/.test(links) && /variant:"visual" as const/.test(links))
  check("a link block can become a group of links in one step, keeping its id", /function MakeGroupRow/.test(links) && /children: \[\{ \.\.\.current, sort_order: 0 \}/.test(links))
  check("a document in the sheet says its pages and offers Open and Download", /data-pdf-count=/.test(read("components/onepage/pdf-pages.tsx")) && /download=\{name\}/.test(read("components/onepage/pdf-pages.tsx")) && (read("components/onepage/public-onepage.tsx").match(/<PdfPages url=\{pdfUrl\} title=\{pdfTitle\} tools \/>/g) ?? []).length === 2)
  check("a document or a menu may be a picture too, under the same upload rules", /'\.pdf,application\/pdf,image\/jpeg,image\/png,image\/webp/.test(links))
  check("TikTok and Instagram: Single without a post is the profile as a large card, Carousel always slides with the profile last", /data-app-spotlight=""/.test(read("components/onepage/app-block.tsx")) && /data-app-profile-slide=""/.test(read("components/onepage/app-block.tsx")))
  check("a Featured YouTube link and a Spotify player link draw their description", /<BlockSubtitle subtitle=\{p\.subtitle\} \/>/.test(read("components/onepage/public-onepage.tsx")) && /data-link-player=\{service\}/.test(read("components/onepage/public-onepage.tsx")))
  const extraSrc = (read("components/onepage/extra-blocks.tsx") + "\n" + read("components/onepage/extra-blocks-editor.tsx"))
  check("a map block has its own settings: how close and how tall, on the page and in the sheet", extraSrc.includes('mapEmbedSrc(place, data.zoom || "area")') && extraSrc.includes('mapEmbedSrc(place, d.zoom || "area")') && /&z=\$\{ZOOM\[zoom\] \?\? 15\}/.test(readFileSync(join(process.cwd(), "lib/onepage/map-place.ts"), "utf8")) && extraSrc.includes('tt("Map height")'))
  check("the probe and this test are registered", read("scripts/run-push-tests.mjs").includes("tests/onepage-ar3.test.ts"))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
