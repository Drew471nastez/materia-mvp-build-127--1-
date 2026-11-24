/**
 * Round 60 (h2): an app's media, its sticky bar and its type.
 *
 *   videos     a demo for every integration that can be installed, each one
 *              checked with YouTube's oEmbed against the provider's own
 *              channel (lib/integrations/videos.ts): its ID, title, channel
 *              and the day it was checked; none for Telegram and Storelib's
 *              own apps, and none guessed
 *   gallery    each provider's 2 to 4 videos as tiles by their own YouTube
 *              thumbnails, from i.ytimg.com at display time (never /public),
 *              lazy, sized and alt-texted; "+ 1 more" past three; Storelib's
 *              drawn scenes where there are none; the youtube-nocookie frame
 *              still only on a press
 *   the bar    stuck from scroll 0 (--pin-lift), so it never slides with the
 *              page while it fades; opacity and translate only
 *   type       semibold titles, regular body in a softer grey
 *   related    More apps like this: up to three in the same category, from
 *              the catalog, with no ratings
 *
 * scripts/check-apps-media-r60.mjs measures the pages in Chromium at 360,
 * 390, 768 and 1280 (thumbnails loaded, CLS, a per-frame scroll trace of
 * the bar, the sheet over the bar, the video playing on a press).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { INTEGRATIONS, integrationById } from "@/lib/integrations/catalog"
import { GALLERY_VIDEOS, VERIFIED_VIDEOS, YOUTUBE_ID, mediaFor, relatedOf, youtubeThumbUrl } from "@/lib/integrations/listing"
import { AppMediaGallery, slidesOf } from "@/components/app/integrations/app-media"
import { AppListing } from "@/components/app/integrations/app-listing"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const AI = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform)\b/i
const installable = INTEGRATIONS.filter((i) => !i.comingSoon && i.kind !== "listed")
/* Looked for and not found: no channel run by Telegram, and Storelib's own apps have no provider to film them. */
const NONE_FOUND = ["storelib-reviews", "send-analytics", "telegram", "courier-tracking", "custom-webhook"]
/* The one place a gallery video may be on another channel: a second channel the same company runs. */
const SISTER: Record<string, string> = { discord: "https://www.youtube.com/@DiscordDevelopers", "google-tag-manager": "https://www.youtube.com/@GoogleAnalytics" }

console.log("\nEvery integration's demo, checked on its provider's own channel\n")
{
  const all = Object.entries(VERIFIED_VIDEOS).flatMap(([id, v]) => [{ id, v: v!, main: true }, ...(GALLERY_VIDEOS[id] ?? []).map((g) => ({ id, v: g, main: false }))])
  check("every entry has an 11 character ID, a title, a channel, the channel's address and the day it was checked", all.length > 0 && all.every(({ v }) => YOUTUBE_ID.test(v.youtubeId) && v.title.trim().length > 0 && v.channel.trim().length > 0 && /^https:\/\/www\.youtube\.com\/@[\w.-]+$/.test(v.channelUrl) && /^\d{4}-\d{2}-\d{2}$/.test(v.checked)), all.filter(({ v }) => !(YOUTUBE_ID.test(v.youtubeId) && v.channel && /^\d{4}-\d{2}-\d{2}$/.test(v.checked))))
  check("  checked on a real day, not in the future", all.every(({ v }) => !Number.isNaN(Date.parse(v.checked)) && Date.parse(v.checked) <= Date.now()))
  check("  no ID twice", new Set(all.map(({ v }) => v.youtubeId)).size === all.length)
  check("  every gallery video is on the demo's channel, or a second channel the same company runs", Object.entries(GALLERY_VIDEOS).every(([id, list]) => (list ?? []).every((g) => g.channelUrl === VERIFIED_VIDEOS[id]?.channelUrl || g.channelUrl === SISTER[id])), Object.entries(GALLERY_VIDEOS).flatMap(([id, list]) => (list ?? []).filter((g) => g.channelUrl !== VERIFIED_VIDEOS[id]?.channelUrl && g.channelUrl !== SISTER[id]).map((g) => `${id}:${g.youtubeId}`)))
  const missing = installable.filter((i) => !VERIFIED_VIDEOS[i.id]).map((i) => i.id).sort()
  check("every integration that can be installed has a demo, except the ones looked for and not found", JSON.stringify(missing) === JSON.stringify([...NONE_FOUND].sort()), missing)
  check(`  that is ${installable.length - NONE_FOUND.length} of ${installable.length}`, Object.keys(VERIFIED_VIDEOS).length === installable.length - NONE_FOUND.length, Object.keys(VERIFIED_VIDEOS).length)
  check("  nothing for one not yet available, and no ID for an integration that does not exist", Object.keys(VERIFIED_VIDEOS).every((id) => installable.some((i) => i.id === id)) && Object.keys(GALLERY_VIDEOS).every((id) => !!VERIFIED_VIDEOS[id]))
  check("  2 to 4 videos for each provider that has any", Object.keys(VERIFIED_VIDEOS).every((id) => { const n = 1 + (GALLERY_VIDEOS[id]?.length ?? 0); return n >= 2 && n <= 4 }))
  check("  the demos named in the report: Printful's what it is, ShipStation's overview, Klaviyo's what it is", VERIFIED_VIDEOS.printful?.youtubeId === "u04owj7jiM4" && VERIFIED_VIDEOS.printful.channel === "Printful Custom Printing" && VERIFIED_VIDEOS.shipstation?.youtubeId === "V50bZh_o3uo" && VERIFIED_VIDEOS.klaviyo?.youtubeId === "6Pxd9VKH2Gg")
  /* Changed on purpose (r24, the owner): the gallery shows exactly one video; the rest stay here, checked, for the record. */
  check("  mediaFor gives the demo alone, and Storelib's pictures; none for one coming soon", mediaFor(integrationById("printful")!).video?.youtubeId === "u04owj7jiM4" && !("more" in mediaFor(integrationById("printful")!)) && mediaFor(integrationById("printful")!).screenshots.length === 2 && mediaFor(integrationById("sendcloud")!).video === null && mediaFor(integrationById("sendcloud")!).screenshots.length === 0)
}

console.log("\nThe gallery: the providers' own thumbnails, loaded from YouTube's image host\n")
{
  check("a thumbnail is i.ytimg.com's maxresdefault, only for a well formed ID", youtubeThumbUrl("u04owj7jiM4") === "https://i.ytimg.com/vi/u04owj7jiM4/maxresdefault.jpg" && youtubeThumbUrl("../x") === null && youtubeThumbUrl("abc\"def") === null)
  const pub = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? pub(join(dir, d.name)) : [d.name]))
  check("  none is copied into /public", existsSync("public") && !pub("public").some((f) => /maxresdefault|hqdefault|ytimg/.test(f)))
  /* Changed on purpose (r24, the owner): one video, its own YouTube cover; the other frames are Storelib's pictures of the app connected (tests/integrations-r24). */
  const printful = integrationById("printful")!
  const html = renderToStaticMarkup(React.createElement(AppMediaGallery, { item: printful, media: mediaFor(printful), color: "#2c2c2c" }))
  const thumbs = (html.match(/<img[^>]*src="https:\/\/i\.ytimg[^>]*>/g) ?? [])
  check("Printful: one video and two pictures, the video's cover lazy, 1280 by 720, with its title as alt text", slidesOf(printful, mediaFor(printful)).map((x) => x.kind).join() === "video,image,image" && thumbs.length > 0 && thumbs.every((t) => /loading="lazy"/.test(t) && /width="1280"/.test(t) && /height="720"/.test(t) && /alt="[^"]{8,}"/.test(t) && /maxresdefault\.jpg/.test(t)) && new Set(thumbs.map((t) => t.match(/vi\/([\w-]{11})\//)![1])).size === 1, thumbs.slice(0, 2))
  check("  every frame has its shape before the picture comes (16:9, as the cover and the pictures are)", /aspect-video/.test(html) && !/aspect-\[16\/10\]/.test(html))
  check("  three frames, nothing counted past them", !/data-app-gallery-more/.test(html))
  check("  a tile is a button: the pictures open in the large frame", (html.match(/data-app-gallery-thumb=/g) ?? []).length === 2)
  /* Changed on purpose (r25, the owner): YouTube's own player in the page, lazy (the browser fetches it near the screen), from youtube-nocookie only. */
  check("  YouTube's own player, lazy, from youtube-nocookie and nowhere else on youtube.com", /<iframe[^>]*youtube-nocookie\.com\/embed\/u04owj7jiM4[^>]*loading="lazy"/.test(html) && !/www\.youtube\.com/.test(html))
  const pin = integrationById("pinterest-tag")!
  const pinSlides = slidesOf(pin, mediaFor(pin))
  check("Pinterest Tag: its video and two pictures of its tag events", pinSlides.map((s) => s.kind).join() === "video,image,image")
  const tg = integrationById("telegram")!
  const tgHtml = renderToStaticMarkup(React.createElement(AppMediaGallery, { item: tg, media: mediaFor(tg), color: "#2c2c2c" }))
  check("Telegram, with none found: Storelib's drawn scenes, no picture from YouTube", slidesOf(tg, mediaFor(tg)).every((s) => s.kind === "scene") && !/ytimg/.test(tgHtml) && /aspect-\[16\/10\]/.test(tgHtml))
  const media = read("components/app/integrations/app-media.tsx")
  /* Changed on purpose (r25, the owner): the player is in the page from the start (lazy), not after a press on a drawn button; it overhangs its box by 1px so no edge line shows. */
  check("the embed is still youtube-nocookie, lazy, in the frame's own box", /youtubeEmbedUrl\(id, autoplay\)/.test(media) && /<iframe src=\{src\} title=\{title\} loading="lazy"/.test(media) && /className="absolute -inset-px h-\[calc\(100%\+2px\)\] w-\[calc\(100%\+2px\)\] max-w-none border-0"/.test(media) && !/data-app-video-poster/.test(media))
  /* Changed on purpose (r25, the owner): showing another slide takes the player away (it stops); pressing the video's tile brings it back playing. */
  check("  showing another slide stops it; its tile brings it back playing", /i === at \? <VideoSlide item=\{item\} id=\{s\.id\} title=\{s\.title\} color=\{color\} autoplay=\{chosen\} \/> : null/.test(media) && /setChosen\(slides\[i\]\?\.kind === "video"\)/.test(media))
  check("  a thumbnail that does not come leaves the tint and the mark, never a hole", /onError=\{\(\) => setState\("failed"\)\}/.test(media) && /state === "failed" \|\| !src/.test(media))
  check("  it fades in on opacity alone", /transition-opacity duration-200[^"]*", state === "ready" \? "opacity-100" : "opacity-0"/.test(media))
}

console.log("\nThe sticky bar: stuck from the first pixel\n")
{
  const ui = read("components/app/settings/integration-detail.tsx")
  check("the bar's box sticks at --pin-lift and the bar is lifted by the same number: one place under the top in every frame", /className="sticky top-\[var\(--pin-lift\)\] z-20 h-0 \[--pin-lift:40px\]"/.test(ui) && /absolute inset-x-0 top-\[calc\(var\(--pin-lift\)\*-1\)\]/.test(ui))
  check("  it comes and goes on opacity and translate only", /transition-\[opacity,translate\] duration-200/.test(ui) && !/data-integration-pin-box[^]*?transition-\[[^\]]*(top|height|margin)/.test(ui.slice(ui.indexOf("data-integration-pin-box"), ui.indexOf("data-integration-pin-box") + 900)))
  check("  under every sheet: the bar is z-20 in the page, the install dialog and the phone's sheet z-80 over the page", /z-20 h-0/.test(ui) && /fixed inset-0 z-\[80\]/.test(read("components/app/integrations/install-sheet.tsx")) && /fixed inset-0 z-\[80\]/.test(read("components/physical/ui.tsx")))
}

console.log("\nThe type: lighter, as the app store's\n")
{
  const files = ["components/app/integrations/app-listing.tsx", "components/app/integrations/install-sheet.tsx", "components/app/integrations/installed-app.tsx"].map(read)
  check("no bold on the listing, the sheet or the installed cards; the titles are semibold", files.every((f) => !/font-bold/.test(f)) && /<Title className="text-\[22px\] font-semibold/.test(files[0]) && /<Title className="text-\[24px\] font-semibold leading-\[30px\][^"]*sm:text-\[28px\]/.test(read("components/app/settings/integration-detail.tsx")))
  check("  the body is regular, in the softer grey, with room between lines", /const BODY = "text-\[14px\] leading-\[22px\] text-\[#6b7280\] sm:text-\[15px\] sm:leading-6"/.test(files[0]) && /text-\[14px\] leading-\[22px\] text-\[#6b7280\] sm:text-\[15px\] sm:leading-6/.test(read("components/app/integrations/app-media.tsx")))
  check("  the facts read as the app store's: the label dark and medium, the value regular and grey", /<dt className="text-\[13px\] font-medium text-\[#1a1a2e\]">/.test(files[0]) && /<dd className="mt-0\.5 text-\[13\.5px\] leading-5 text-\[#4b5563\]">/.test(files[0]))
  check("  the sheet's steps and the installed page's rows the same way", /leading-\[22px\] text-\[#4b5563\]">\s*<span className="sr-only">/.test(files[1]) && /text-\[13px\] font-medium text-\[#1a1a2e\]">\{tt\(r\.slice\(0, at\)\)\}/.test(files[2]))
}

console.log("\nMore apps like this\n")
{
  const printful = integrationById("printful")!
  const rel = relatedOf(printful, INTEGRATIONS)
  check("up to three in the same category that can be installed now", rel.map((i) => i.id).join() === "printify,gelato" && relatedOf(integrationById("klaviyo")!, INTEGRATIONS).length === 3 && relatedOf(integrationById("klaviyo")!, INTEGRATIONS).every((i) => i.category === "email" && i.id !== "klaviyo"))
  check("  never one coming soon, never itself", INTEGRATIONS.every((i) => relatedOf(i, INTEGRATIONS).every((r) => r.id !== i.id && !r.comingSoon && r.kind !== "listed")))
  const props = { item: printful, Title: "h1" as const, standing: { label: "Not connected", dot: "bg-[#9ca3af]" }, color: "#2c2c2c", action: null }
  const html = renderToStaticMarkup(React.createElement(AppListing, { ...props, related: rel, onOpen: () => {} }))
  check("  drawn under the listing: the mark, the name, the pricing line and what it does; links that open in place", /data-app-related="2"/.test(html) && />More apps like this</.test(html) && /href="\/app\/integrations\?integration=printify"/.test(html) && />Free to install</.test(html))
  check("  no rating, no stars, no count", !/rating|★|stars?\b/i.test(html.slice(html.indexOf("data-app-related"))))
  check("  not drawn without a way to open one (the settings sheet's single page)", !/data-app-related/.test(renderToStaticMarkup(React.createElement(AppListing, { ...props, related: rel }))))
}

console.log("\nPlain words\n")
{
  const src = ["components/app/integrations/app-media.tsx", "components/app/integrations/app-listing.tsx", "lib/integrations/listing.ts"].map(read).join("\n")
  const words = [...src.matchAll(/tt\("([^"]+)"/g)].map((m) => m[1]).join(" | ")
  check("no em or en dash in what Storelib writes, nothing that sounds like an ad", !/[—–]/.test(src) && !AI.test(words), (words.match(AI) ?? [])[0])
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
