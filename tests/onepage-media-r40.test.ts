/**
 * ===========================================================================
 *  ONEPAGE ROUND 40: THE HEADER, ITS MEDIA, UPLOADS, CAROUSELS, ARRIVAL
 * ===========================================================================
 * The owner, in order:
 *
 *   pencil      "In the Header, the edit icon is overlapping under the
 *               avatar image"     -> the avatar is its own stacking context
 *                                    and the pencil sits above it, inside it
 *   hero        "When I add a video and profile image layout is Hero, it
 *               hides the name, the description and the social media. Hero
 *               doesn't work with patterns"
 *                                 -> the video no longer carries a loose
 *                                    z-index; the hero is masked into the
 *                                    page instead of painted over, so a
 *                                    pattern carries on under it, and Hero
 *                                    is offered with a pattern
 *   morph       "it shows the profile photo and then the video; they morph
 *               and interlace"    -> the video's own first frame is saved
 *                                    with it and drawn under it in the same
 *                                    box; the video fades in on `playing`,
 *                                    opacity only; reduced motion and data
 *                                    saver keep the still
 *   uploads     smoother states   -> the crop sheet never flicks back to
 *                                    its buttons between upload and save
 *   remove      "Removing them is smooth and clean"
 *                                 -> one edit, and the account photo too
 *   files       "I can also pick from my own Storelib files"
 *                                 -> Your files beside every OnePage upload
 *   compact     "Image pickers are too big"
 *                                 -> a picture is one row
 *   slides      no blanks, autoplay that can be on or off
 *                                 -> empty rows are not slides; autoplay
 *                                    only on screen, never with reduced motion
 *   arrival     "Going back from checkout to the one page must not flash"
 *                                 -> a return shows the page in place
 *
 * Run with:  npx tsx --conditions=react-server tests/onepage-media-r40.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runInNewContext } from "node:vm"
import { readCode } from "./_source"
import { HERO_FADE_MASK, firstFrameSrc, posterPlan, prefersStill, videoPoster, withPoster } from "../lib/onepage/poster-video"
import { normalizeCrop } from "../lib/onepage/media-crop"
import { ONEPAGE_ARRIVAL } from "../components/onepage/page-arrival"

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
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n          ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const POSTER = "https://x.supabase.co/storage/v1/object/public/onepage-assets/u/avatar-video-poster-1.jpg"

function run() {
  console.log("\nthe poster rules (lib/onepage/poster-video)")
  {
    const crop = { x: 10, y: 5, width: 50, height: 50, v: 2 as const }
    const saved = withPoster(crop, POSTER)
    check("a poster is kept on the crop the video is drawn through", saved.poster === POSTER && videoPoster(saved) === POSTER)
    check("the crop itself is untouched by it", normalizeCrop(saved)?.x === 10 && normalizeCrop(saved)?.width === 50 && normalizeCrop(saved)?.v === 2)
    check("no poster leaves no poster key", !("poster" in withPoster({ ...crop, poster: POSTER } as never, null)))
    check("only an address the page may draw is read back", videoPoster({ poster: "javascript:alert(1)" }) === null && videoPoster({ poster: "http://x.com/a.jpg" }) === null && videoPoster({ poster: '"/><img' }) === null && videoPoster(null) === null && videoPoster({ poster: "/media/a.jpg" }) === "/media/a.jpg")
    check("without a poster the video asks for its own first frame", firstFrameSrc("https://a.b/v.mp4") === "https://a.b/v.mp4#t=0.001" && firstFrameSrc("https://a.b/v.mp4#t=2") === "https://a.b/v.mp4#t=2")
    check("reduced motion is a still", prefersStill({ matchMedia: (q) => ({ matches: q.includes("reduce") }) }))
    check("the data saver is a still", prefersStill({ matchMedia: () => ({ matches: false }), navigator: { connection: { saveData: true } } }))
    check("an ordinary visit plays", !prefersStill({ matchMedia: () => ({ matches: false }), navigator: {} }) && !prefersStill(null))

    const playing = posterPlan({ poster: POSTER, fallback: "photo", still: false, failed: false })
    check("playing: the poster under the video, never the photo, revealed on playing", playing.base === "poster" && playing.video && playing.reveal === "playing")
    const legacy = posterPlan({ poster: null, fallback: "photo", still: false, failed: false })
    check("a video saved before posters: nothing under it, and NOT the profile photo (the morph)", legacy.base === null && legacy.video)
    const still = posterPlan({ poster: POSTER, fallback: "photo", still: true, failed: false })
    check("still with a poster: the poster alone, no video loaded", still.base === "poster" && !still.video)
    const stillPhoto = posterPlan({ poster: null, fallback: "photo", still: true, failed: false })
    check("still without a poster: the photo", stillPhoto.base === "fallback" && !stillPhoto.video)
    const stillBare = posterPlan({ poster: null, fallback: null, still: true, failed: false })
    check("still with nothing else: the paused video's first frame, shown once it has it", stillBare.video && stillBare.reveal === "loadeddata")
    const broken = posterPlan({ poster: null, fallback: "photo", still: false, failed: true })
    check("a video that will not play leaves the photo", broken.base === "fallback" && !broken.video)
    check("the hero mask starts opaque and ends clear", /^linear-gradient\(to bottom, #000 0%/.test(HERO_FADE_MASK) && /transparent 100%\)$/.test(HERO_FADE_MASK))
  }

  console.log("\nthe video element (components/onepage/poster-video)")
  {
    const pv = readCode("components/onepage/poster-video.tsx")
    check("its own stacking context", /absolute inset-0 isolate block overflow-hidden/.test(pv))
    check("faded in on opacity only, never a transform, a blur or a scale", /transition-opacity duration-300/.test(pv) && /opacity: shown \? 1 : 0/.test(pv) && !/transition-all|transition-transform|blur-|scale-/.test(pv))
    check("muted, inline, metadata first, no autoplay attribute (play() once the page runs)", /\bmuted\b/.test(pv) && /playsInline/.test(pv) && /preload="metadata"/.test(pv) && !/autoPlay/.test(pv) && /v\.play\(\)/.test(pv))
    check("revealed on playing", /onPlaying=\{\(\) => setShown\(true\)\}/.test(pv))
    check("paused off screen and in a background tab, resumed from the back/forward cache", /new IntersectionObserver/.test(pv) && /visibilitychange/.test(pv) && /e\.persisted/.test(pv))
    check("reduced motion follows the system while open", /useSyncExternalStore\(subscribeStill/.test(pv))
    check("a refused play() (Low Power Mode) becomes the still", /NotAllowedError/.test(pv) && /setBlocked\(true\)/.test(pv))
    check("the poster is drawn with the video's own style", /style=\{plan\.base === "poster" \? mediaStyle : fallbackStyle\}/.test(pv) && /style=\{\{ \.\.\.mediaStyle, opacity/.test(pv))
  }

  console.log("\nthe live page (components/onepage/public-onepage)")
  {
    const live = readCode("components/onepage/public-onepage.tsx")
    const smooth = live.slice(live.indexOf("function SmoothAvatarVideo"), live.indexOf("const SpotifyModalContext"))
    check("SmoothAvatarVideo is the poster video now, with no z-index, blur or scale of its own", /<PosterVideo/.test(smooth) && !/z-\[1\]|blur-|scale-\[|setTimeout/.test(smooth))
    const hero = live.slice(live.indexOf('data-hero-header=""'), live.indexOf("// Classic layout"))
    check("the hero is masked into the page, not painted over with its colour", /maskImage: HERO_FADE_MASK, WebkitMaskImage: HERO_FADE_MASK/.test(hero) && !/background: isGradientBg|fadeColor/.test(hero))
    check("the hero's media box is its own stacking context of fixed shape", /className="relative isolate w-full overflow-hidden"/.test(hero) && /aspectRatio, maskImage/.test(hero))
    check("the name and bio are drawn over the media", /"absolute left-0 right-0 z-\[1\] text-center px-6"/.test(hero))
    check("the hero video starts from its poster, at high priority", /poster=\{videoPoster\(profile\.avatar_video_crop\)\}[\s\S]*?priority/.test(hero))
    check("the social row pulled onto the hero is drawn above it", /isHeroLayout && "relative z-\[1\]"/.test(live))
    check("the round avatar video starts from its poster too, its photo moved with translate, not transform", /poster=\{videoPoster\(profile\.avatar_video_crop\)\}/.test(live) && /translate: `0 \$\{\(theme as any\)\.avatar_offset_y \|\| 0\}px`/.test(live))
    check("an image row with no address is not a slide", /\.filter\(\(img\) => !!img\?\.image_url\)/.test(live))
    check("a picture saved with its size reserves its box", /width=\{\(img as \{ width\?: number \}\)\.width \|\| undefined\}/.test(live))
    check("autoplay waits off screen and in a hidden tab, and never runs with reduced motion",
      /if \(!autoplay \|\| isHovered \|\| !inView \|\| images\.length <= 1\) return/.test(live) && /prefers-reduced-motion: reduce\)"\)\.matches\) return/.test(live) && /document\.hidden\) return/.test(live))
    check("the blocks' entrance is marked, so a return can take it off", (live.match(/data-onepage-enter=\{animClass \? "" : undefined\}/g) ?? []).length === 3)
  }

  console.log("\na return never flashes (components/onepage/page-arrival)")
  {
    const route = read("app/(marketing)/l/[slug]/page.tsx")
    check("the route places the check before the page", route.indexOf("<OnePageArrival />") > 0 && route.indexOf("<OnePageArrival />") < route.indexOf("<PublicOnePage"))
    const runScript = (o: { type: string; seen?: boolean; referrer?: string }) => {
      const added: { text: string }[] = []
      const store: Record<string, string> = o.seen ? { "op-seen:/satori": "1" } : {}
      const doc = {
        referrer: o.referrer ?? "",
        head: { appendChild: (n: { textContent: string }) => added.push({ text: n.textContent }) },
        createElement: () => ({ textContent: "", setAttribute() {} }),
      }
      runInNewContext(ONEPAGE_ARRIVAL.script, {
        document: doc,
        location: { pathname: "/satori" },
        performance: { getEntriesByType: () => [{ type: o.type }] },
        sessionStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } },
      })
      return { added, store }
    }
    const first = runScript({ type: "navigate" })
    check("a first visit keeps its entrance, and is remembered", first.added.length === 0 && first.store["op-seen:/satori"] === "1")
    check("Back takes the entrance off before the first paint", runScript({ type: "back_forward" }).added[0]?.text === ONEPAGE_ARRIVAL.returnRule)
    check("a second visit in this tab does too", runScript({ type: "navigate", seen: true }).added.length === 1)
    check("so does arriving from a checkout", runScript({ type: "navigate", referrer: "https://checkout.stripe.com/c/pay/cs_test" }).added.length === 1)
    check("the rule shows the blocks where they are", /animation:none!important;opacity:1!important/.test(ONEPAGE_ARRIVAL.returnRule))
    check("reduced motion never gets the entrance", /prefers-reduced-motion:reduce/.test(ONEPAGE_ARRIVAL.style))
  }

  console.log("\nthe Header panel (components/onepage/tabs/design-tab)")
  {
    const design = readCode("components/onepage/tabs/design-tab.tsx")
    check("the avatar button is a stacking context and the picture sits under the pencil", /relative isolate aspect-square h-\[88px\] w-\[88px\]/.test(design) && /data-editor-avatar="" className="absolute inset-0 overflow-hidden rounded-full isolate z-0/.test(design))
    check("the pencil is above the picture and inside the button's box", /data-avatar-pencil="" className="absolute bottom-0 right-0 z-\[2\]/.test(design))
    check("the panel's video is the page's own element, through the crop kept in settings", /<PosterVideo/.test(design) && /\(onepage\.settings as any\)\?\.avatar_video_crop/.test(design))
    const blocked = design.slice(design.indexOf("const heroBlockedBy ="), design.indexOf("const heroBlockedBy =") + 400)
    check("Hero is offered with a pattern", !/background_pattern/.test(blocked) && !/Remove the pattern/.test(design))
    check("Remove is one edit that also removes the account photo", /updateProfile\(\{ avatar_url: null, avatar_video_url: null, avatar_video_crop: null \}\)/.test(design) && /body: JSON\.stringify\(\{ url: null \}\)/.test(design) && /onClick=\{handleRemoveMedia\}/.test(design))
    check("Your files beside the photo, the video, the logo and the wallpaper", (design.match(/<LibraryRow\b/g) ?? []).length >= 4 && /<LibraryButton\b/.test(design) && (design.match(/<FilesLibraryChooser\b/g) ?? []).length >= 2)
    check("a video from Files is cropped where it is, not uploaded again", /existingUrl=\{tempVideo\.existing\}/.test(design))
    check("the drop boxes say drag and drop and take a drop", (design.match(/onDrop=\{\(e\) => \{\s*e\.preventDefault\(\)\s*void pickImage\(e\.dataTransfer\.files\?\.\[0\]/g) ?? []).length === 2)
  }

  console.log("\nthe Links tab, the share card, the crop sheet")
  {
    const links = readCode("components/onepage/tabs/links-tab.tsx")
    check("an Image block's picture is one compact row", /<OnePageImageField\b/.test(links) && !/aspect-video rounded-lg border-2 border-dashed border-gray-200/.test(links))
    check("its upload writes into the block as it is when it ends", /const now = \(blockRef\.current\.data \|\| \{\}\) as ImageBlockData/.test(links) && /blockRef\.current = block/.test(links))
    check("the Links tab's avatar draws its video like the page, the pencil above it", /<PosterVideo/.test(links) && /relative isolate bg-gray-100/.test(links) && /absolute inset-0 z-\[2\] bg-black\/50 rounded-full/.test(links))
    check("Your files for the profile photo, the video, a thumbnail and a product image", (links.match(/<LibraryRow\b/g) ?? []).length >= 3 && (links.match(/<FilesLibraryChooser\b/g) ?? []).length === 2 && /field: 'link_thumbnail'/.test(links))
    const seo = readCode("components/onepage/seo-panel.tsx")
    check("the custom share picture can come from Files", /<LibraryButton onClick=\{\(\) => setChoosing\(true\)\}/.test(seo) && /<FilesLibraryChooser\b/.test(seo))
    const field = readCode("components/onepage/image-field.tsx")
    check("the image row: a 56px square, Upload or Replace, Your files, Remove", /h-14 w-14 shrink-0/.test(field) && /"Replace"/.test(field) && /"Upload"/.test(field) && /<LibraryButton\b/.test(field) && /data-image-remove/.test(field))
    check("the file shows at once and stays until the stored copy has decoded", /URL\.createObjectURL\(file\)/.test(field) && /img\.decode\(\)/.test(field) && /if \(localRef\.current === shownLocal\) showLocal\(null\)/.test(field))
    check("its size goes with the address", /measurePicture\(preview\)/.test(field) && /changeRef\.current\(result\.url, size\)/.test(field))
    const crop = readCode("components/onepage/crop-upload.tsx")
    check("a video goes up with its first frame, saved on its crop", /captureVideoPoster\(src\)/.test(crop) && /withPoster\(crop, poster\)/.test(crop) && /prefix: `\$\{prefix\}-poster`/.test(crop))
    check("between the upload and the save the sheet shows a full bar that reads Saving", /writing \? \(/.test(crop) && /finishing \/>/.test(crop) && /tt\("Saving"\)/.test(read("components/onepage/upload-progress.tsx")))
    check("before the first byte it shows the line too, not the buttons", /saving && up\.state\.phase === "idle" \? \(/.test(crop))
    const capture = readCode("lib/onepage/capture-poster.ts")
    check("the frame is read past zero, whole, as a small JPEG, and never fails the save", /video\.currentTime = at/.test(capture) && /"image\/jpeg"/.test(capture) && /maxSide \?\? 720/.test(capture) && /return null/.test(capture))
  }

  console.log("\nno transform is transitioned in what this round wrote")
  {
    for (const f of ["components/onepage/poster-video.tsx", "components/onepage/image-field.tsx", "components/onepage/library-pick.tsx", "components/onepage/page-arrival.tsx", "components/onepage/upload-progress.tsx", "components/onepage/crop-upload.tsx"]) {
      const src = readCode(f)
      check(`${f}: no transition-all, no transition-transform`, !/transition-all|transition-transform|transition:\s*["']?transform/.test(src))
    }
    const copy = ["components/onepage/library-pick.tsx", "components/onepage/image-field.tsx", "lib/onepage/poster-video.ts", "components/onepage/poster-video.tsx", "components/onepage/page-arrival.tsx"].map(read).join("\n")
    check("no em dash and none of the banned words", !/—/.test(copy) && !/\b(unlock|elevate|seamless|effortless|supercharge)\b/i.test(copy))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}
run()
