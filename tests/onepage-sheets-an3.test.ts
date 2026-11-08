/**
 * ===========================================================================
 *  ROUND AN, TRACK AN3: THE LAST POP-UPS ON THE SHEET, SWIPE TO CLOSE, THE POST'S FADE
 * ===========================================================================
 * The rules behind what scripts/check-onepage-block-sheet.mjs and
 * scripts/check-onepage-sweep.mjs measure in a browser:
 *
 *   PDF         a PDF and a menu offer the Interaction choice; a saved one reads its two older switches; the page's
 *               own PDF pop-up is gone, the sheet draws the pages (components/onepage/pdf-pages)
 *   MUSIC       a Spotify or Apple Music link opens its player in the block sheet or draws it on the page
 *               (components/onepage/music-sheet); the page's own two pop-ups are gone
 *   SWIPE       letting go of a drawn down sheet: past the line or flicked closes, otherwise back
 *   FADE        a folded Instagram post is masked into whatever is behind it, never painted over in white, and
 *               "View full post" is the page's own button
 *
 *   npx tsx tests/onepage-sheets-an3.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SWIPE, blockInteraction, interactionPatch, offersInteraction, swipeDecision } from "@/lib/onepage/block-sheet"
import { FOLD_FADE_PX, FOLD_MASK, postButtonStyle } from "@/components/onepage/compact-post"
import { appleMusicEmbedUrl, musicPlayerHeight, spotifyEmbedUrl } from "@/components/onepage/music-sheet"
import { createDefaultBlock } from "@/lib/onepage/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const b = (type: string, data: Record<string, unknown>) => ({ type, data })

console.log("PDF")
{
  check("a PDF and a menu offer the choice", offersInteraction("pdf_document") && offersInteraction("food_menu"))
  check("a new PDF opens in the sheet", blockInteraction(createDefaultBlock("pdf_document")) === "sheet" && blockInteraction(createDefaultBlock("food_menu")) === "sheet")
  check("a saved PDF with its preview on opens in the sheet", blockInteraction(b("pdf_document", { enable_preview: true, open_directly: false })) === "sheet")
  check("\"Open directly\" saved is the link", blockInteraction(b("pdf_document", { open_directly: true })) === "direct")
  check("both switches off (a tap did nothing) goes to the file", blockInteraction(b("food_menu", { enable_preview: false, open_directly: false })) === "direct")
  check("open_mode wins over the older switches", blockInteraction(b("pdf_document", { open_mode: "inline", open_directly: true })) === "inline")
  const d = interactionPatch("pdf_document", "direct")
  const s = interactionPatch("food_menu", "sheet")
  check("the older switches follow the choice", d.open_directly === true && d.enable_preview === false && s.open_directly === false && s.enable_preview === true)
  const live = read("components/onepage/public-onepage.tsx")
  check("the page's own PDF pop-up is gone", !/PDFModalContext|openPdfModal|pdfModalData|handlePdfScroll/.test(live))
  check("the PDF and the menu open the sheet with their pages", (live.match(/<PdfPages url=\{pdfUrl\}/g) ?? []).length === 2 && (live.match(/<PdfOnPage/g) ?? []).length === 2)
  check("the sheet still tells the floating buttons it is up", /pdfModalStateChange/.test(read("components/onepage/block-sheet.tsx")))
  const tab = read("components/onepage/tabs/links-tab.tsx")
  check("the two switches gave way to the Interaction choice", !/tt\("Enable Preview"\)|tt\("Open Directly"\)/.test(tab))
  const pages = read("components/onepage/pdf-pages.tsx")
  check("pdf.js is loaded once, pages appear as they are drawn, the browser's viewer if it cannot read the file", /let loading: Promise<PdfJs> \| null/.test(pages) && /setPages\(\(cur\) => \[\.\.\.cur/.test(pages) && /data-pdf-pages="frame"/.test(pages))
  check("the object addresses are let go", /URL\.revokeObjectURL/.test(pages))
}

console.log("MUSIC")
{
  check("Spotify's player for a track", spotifyEmbedUrl("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x")?.src === "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC?utm_source=generator")
  check("an address with a language in it", spotifyEmbedUrl("https://open.spotify.com/intl-de/album/1DFixLWuPkv3KT3TnV35m3")?.type === "album")
  check("not Spotify, no player", spotifyEmbedUrl("https://example.com/track/1") === null)
  check("Apple Music's player, a song when it names one", appleMusicEmbedUrl("https://music.apple.com/us/album/x/1440857781?i=1440857782")?.song === true && appleMusicEmbedUrl("https://music.apple.com/us/album/x/1440857781")?.src.startsWith("https://embed.music.apple.com/") === true)
  check("a look alike host is not Apple Music", appleMusicEmbedUrl("https://music.apple.com.evil.example/us/album/1") === null)
  check("compact for one song, full for a list", musicPlayerHeight("spotify", true) === 152 && musicPlayerHeight("spotify", false) === 352 && musicPlayerHeight("apple_music", true) === 175)
  const live = read("components/onepage/public-onepage.tsx")
  check("the page's own Spotify and Apple Music pop-ups are gone", !/SpotifyModalContext|AppleMusicModalContext|spotifyBody|appleMusicBody|spotifyModalOpen/.test(live))
  check("they open the block sheet", /musicSheetRequest\(\{/.test(live) && /pageSheet\.open\(\{/.test(live))
  check("\"Show on the page\" draws the player in place of the button", /data\.spotify_mode === "on_page"/.test(live) && /data\.apple_music_mode === "on_page"/.test(live))
  const tab = read("components/onepage/tabs/links-tab.tsx")
  check("the editor offers it", (tab.match(/id: 'on_page'/g) ?? []).length === 2)
}

console.log("SWIPE")
{
  check("not moved, not closed", swipeDecision(0, 700, 2) === "back")
  check("a short slow drag springs back", swipeDecision(60, 700, 0.1) === "back")
  check("past a quarter of the sheet, or 140px, closes", swipeDecision(141, 700, 0) === "close" && swipeDecision(101, 400, 0) === "close" && swipeDecision(99, 400, 0) === "back")
  check("a quick flick closes", swipeDecision(30, 700, 0.8) === "close")
  check("a twitch is not a flick", swipeDecision(SWIPE.flickMinPx - 1, 700, 3) === "back")
  const sheet = read("components/onepage/block-sheet.tsx")
  check("it never fights an inner scroll", /if \(el\.scrollTop > 0\) return true/.test(sheet) && /scrolledAbove\(t\)/.test(sheet))
  check("sideways is left to a carousel, up to the sheet's own scroll", /d <= 0 \|\| Math\.abs\(dx\) > Math\.abs\(d\)/.test(sheet))
  check("the finger moves it from where it is (the opening's fill written down)", /a\.commitStyles\(\)/.test(sheet))
  check("a move it takes is not also a scroll", /addEventListener\("touchmove", onMove, \{ passive: false \}\)/.test(sheet) && /if \(e\.cancelable\) e\.preventDefault\(\)/.test(sheet))
  check("closing carries on from the finger", /if \(swipedOut\.current\)/.test(sheet) && /"0 100%"/.test(sheet))
  check("with reduced motion it only fades out", /translate: still \? from\.translate : "0 100%"/.test(sheet))
}

console.log("FADE")
{
  check("the fade is 64px", FOLD_FADE_PX === 64)
  check("it is a mask down to clear, not a colour", /^linear-gradient\(to bottom, #000 calc\(100% - 64px\)/.test(FOLD_MASK) && /transparent 100%\)$/.test(FOLD_MASK))
  const post = read("components/onepage/compact-post.tsx")
  check("nothing white is painted over the post", !/from-white|to-white|via-white/.test(post) && !/className="relative w-full overflow-hidden bg-white/.test(post))
  check("the mask is on the post only while it is folded", /\.\.\.\(folded \? \{ maskImage: FOLD_MASK, WebkitMaskImage: FOLD_MASK \} : \{\}\)/.test(post))
  const style = postButtonStyle({ button_style: "filled", button_color: "#f4f4f5", button_text_color: "#111113", button_border_radius: 999, button_border_width: 0, button_border_color: "transparent" } as never)
  check("\"View full post\" is the page's own button", style.backgroundColor === "#f4f4f5" && style.color === "#111113")
  check("near black where there is no page around it", postButtonStyle(null).backgroundColor === "#111113")
  check("the page hands its theme to the blocks", /<BlockSheetProvider dark=\{!pageIsLight\(safeTheme\)\} theme=\{safeTheme\}>/.test(read("components/onepage/public-onepage.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
