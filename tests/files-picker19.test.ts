/**
 * Round 19: "Choose from your files" as the app's own sheet on a phone and
 * its dialog on a computer, small thumbnails that fade in without moving,
 * a three dots menu per picture with real actions, and a cross fade between
 * the pills.
 *
 * Frame by frame: node scripts/check-files-picker.mjs
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { THUMB_QUALITY, THUMB_WIDTHS, fileThumb, filePreview, thumbable } from "@/lib/files/thumb"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

const lib = read("components/files/files-library.tsx")
const thumbSrc = read("lib/files/thumb.ts")
const menu = read("components/ui/responsive-action-menu.tsx")
const config = read("next.config.mjs")
const route = read("app/api/files/route.ts")

console.log("\nThumbnails are small copies from Next's optimizer, never the original")
const own = "https://storelib.com/media/store-builder-images/u1/files/1.jpg"
const t = fileThumb(own)
check("a file's own address is resized", thumbable(own) && t.src.startsWith("/_next/image?url=") && t.src.includes(encodeURIComponent(own)), t)
check("it offers 128, 256, 384 and 640 wide copies, with sizes (640 since round V, for Files' two across grid on a phone)", (t.srcSet ?? "").split(", ").length === 4 && /128w/.test(t.srcSet ?? "") && /384w/.test(t.srcSet ?? "") && /640w/.test(t.srcSet ?? "") && !!t.sizes, t)
check("every width is one Next serves (imageSizes/deviceSizes)", THUMB_WIDTHS.every((w) => [32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840].includes(w)))
const qualities = config.match(/qualities:\s*\[([^\]]*)\]/)?.[1] ?? ""
check("the quality is in next.config's list, so the optimizer answers 200", qualities.split(",").map((q) => Number(q.trim())).includes(THUMB_QUALITY), qualities)
check("next.config lets the optimizer fetch Storelib's /media/ addresses", /pathname:\s*'\/media\/\*\*'/.test(config))
check("a data or blob address is drawn as it is", fileThumb("data:image/png;base64,AA").src === "data:image/png;base64,AA" && !fileThumb("blob:x").srcSet)
check("an unknown host is drawn as it is", fileThumb("https://example.com/a.jpg").src === "https://example.com/a.jpg")
check("the storage host is never put in the address", !/supabase/.test(t.src + (t.srcSet ?? "")))
check("the preview is a 1080 copy", filePreview(own).includes("&w=1080&"))
check("the thumbnail helper uses no metered storage transform", !/render\/image/.test(thumbSrc))

console.log("\nA tile: decoded off the main thread, lazy after the first rows, fixed square, fade once decoded")
check("decoding is async", /decoding="async"/.test(lib))
check("eager only for the first rows, lazy after", /loading=\{index < EAGER \? "eager" : "lazy"\}/.test(lib) && /const EAGER = 12/.test(lib))
check("a fixed square box with a quiet grey in it", /aspect-square w-full overflow-hidden bg-\[#f3f4f6\]/.test(lib))
check("shown once decoded, written onto the element, not through React state", /img\.decode\(\)\.then\(show, show\)/.test(lib) && /img\.dataset\.loaded = ""/.test(lib))
check("a picture the browser already has is there at once, no fade", /data-\[instant\]:transition-none/.test(lib) && /img\.complete && img\.naturalWidth > 0/.test(lib))
check("the fade is opacity only, 200ms", /opacity-0 transition-opacity duration-200/.test(lib))
check("a refused copy falls back to the original once", /function fallBack/.test(lib) && /removeAttribute\("srcset"\)/.test(lib))

console.log("\nThe chooser: the app's bottom sheet on a phone, its dialog on a computer")
check("SheetDialog decides, with the phone known before the first frame", /<SheetDialog/.test(lib) && /useState\(\(\) => typeof window !== "undefined" && window\.matchMedia\(PHONE\)\.matches\)/.test(lib))
check("no third sheet: the old physical Modal is gone from Files", !/\bModal\b/.test(lib.replace(/modal=\{false\}/g, "")))
check("a fixed height, so a list arriving never moves the top edge", /height: SHEET_HEIGHT, maxHeight: SHEET_HEIGHT/.test(lib))
check("kept after the first open, so it leaves with its own motion and opens again at once", /keepMounted: true/.test(lib) && /if \(open && !used\) setUsed\(true\)/.test(lib))
check("the desktop dialog fades and scales on the compositor", /data-\[state=closed\]:zoom-out-95 data-\[state=open\]:zoom-in-95/.test(read("components/ui/dialog.tsx")))
check("a list arriving mid open renders in pieces", /React\.startTransition\(\(\) => \{\s*setFilesState\(list\)/.test(lib))

console.log("\nThe three dots: real actions")
check("one menu for the grid, not one per tile", (lib.match(/<DropdownMenuPrimitive\.Root/g) ?? []).length === 1 && (lib.match(/<BottomSheet/g) ?? []).length === 1)
check("the dropdown's look is the app's (shared content)", /export function ActionDropdownContent/.test(menu) && /<ActionDropdownContent/.test(lib))
check("the phone sheet's rows are the app's", /export const ActionSheetRows/.test(menu) && /<ActionSheetRows/.test(lib))
for (const label of ["Preview", "Copy link", "Download", "Delete", "Use this picture"]) check(`menu has ${label}`, lib.includes(`label: "${label}"`))
check("no Rename: a file's name is its address", !/label: "Rename"/.test(lib))
check("Delete asks first", /Delete this picture\?/.test(lib) && /setConfirming\(f\)/.test(lib))
/* Changed on purpose (round 39): the route deletes through lib/files/keep.ts removeFromFiles, which keeps a file still in use. */
check("Delete is the existing owner only endpoint", /api<RemoveAnswer>\("\/api\/files", \{ method: "DELETE", body: \{ bucket: f\.bucket, path: f\.path \} \}\)/.test(lib) && /* Changed on purpose (round 41 team): the owner, or a team member with Products */
/shopCaller\("products"\)/.test(route) && /removeFromFiles/.test(route))
/* "Picture" or "Video" (a video setting's chooser lists videos), named by noun(f). */
check("Download saves through the shared helper (a blob in a browser, the system browser in the app)", /saveFile\(\{/.test(lib) && /savedMessage\(outcome, noun\(f\)\)/.test(lib) && /isVideo\(f\) \? "Video" : "Picture"/.test(lib))
check("a dropdown held against moving dots closes on a scroll", /addEventListener\("scroll", close/.test(lib))

console.log("\nA switch: cached, no empty frame, nothing fades")
/* Kept per kind (pictures, videos), so the video chooser has its own list. */
check("the list is kept for the session and shown at once", /const kept: Record<LibraryKind, LibraryFile\[\] \| null> = \{ image: null, video: null, media: null \}/.test(lib) && /useState<LibraryFile\[\] \| null>\(\(\) => kept\[kind\]\)/.test(lib))
check("a pill only hides tiles, it never rebuilds them", /hidden=\{at === undefined\}/.test(lib) && /files\.map\(\(f\) =>/.test(lib))
/*
  Round 21 replaced the copy layer with the grid's own fade. Round H took the fade away: the grid going to white and
  back was the flash the owner saw between pills (every tile on screen blank for two or three frames a switch). Now the
  tiles that belong show and the rest are put away in the press itself, and nothing is animated or copied.
*/
const swap = lib.slice(lib.indexOf("const swapGrid"), lib.indexOf("const chooseSource"))
check("a switch shows and puts away tiles in the same frame: no grid fade, nothing copied", !/\.animate\(/.test(swap) && !/opacity: 0/.test(swap) && /putAway\(li, !keep\.has/.test(swap) && !/cloneNode/.test(lib))
check("  a picture that arrived while its tile was away is shown without a fade", /function notDrawn\(img: HTMLImageElement\)/.test(lib) && /contentVisibilityAuto: true/.test(lib) && /\[data-loaded\]:not\(\[data-instant\]\)/.test(lib))
check("  every pill's first screen is fetched ahead, on idle and on a hover of its pill", /const warmPill = React\.useCallback/.test(lib) && /requestIdleCallback\(run/.test(lib) && /onPointerEnter=\{\(\) => onWarm\?\.\(s\)\}/.test(lib))
/* Round W6: the pills are Storelib's segmented control (Support, Analytics), one white mark sliding under the chosen one rather than a black fill blinking from pill to pill. */
check("the pills' mark slides over 200ms, on the compositor, every pill the same height", /data-files-pill-mark=""/.test(lib) && /transition-\[translate,width\] duration-200/.test(lib) && /translate: `\$\{mark\.x\}px 0`/.test(lib) && /inline-flex h-8 shrink-0 items-center rounded-lg/.test(lib))
check("reduced motion: nothing on a switch moves anyway", !/\.animate\(/.test(swap))

console.log("\nCopy")
/* Spelled in pieces, so this file does not carry the words it looks for. */
const words = [["un", "lock"], ["ele", "vate"], ["seam", "less"], ["power", "ful"], ["effort", "less"], ["effort", "lessly"], ["super", "charge"], ["trans", "form"]].map((w) => w.join(""))
const banned = new RegExp(`\u2014|\\b(${words.join("|")})\\b`, "i")
for (const [name, src] of [["files-library", lib], ["thumb", thumbSrc], ["probe", read("scripts/check-files-picker.mjs")], ["harness", read("scripts/render-files-picker.tsx")]] as const) {
  check(`${name}: no em dashes or banned words`, !banned.test(src), src.match(banned)?.[0])
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
