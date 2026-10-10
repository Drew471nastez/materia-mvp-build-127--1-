/**
 * ===========================================================================
 *  THE IMAGE BOX GOES EMPTY BETWEEN CHOOSING A PICTURE AND SEEING IT
 * ===========================================================================
 * Reported with a screenshot: the box under the label is a blank grey
 * rectangle for a moment, "and it looks cheap and then the image appears
 * very cheap quick".
 *
 * One omission, two symptoms. The upload finishes, `onChange` hands back a
 * public URL, and the filled branch renders `<img src={url}>` pointing at an
 * object the browser has never fetched. Until those bytes arrive the element
 * occupies its 96px and draws nothing, and when they do arrive it is simply
 * there at full opacity in the frame it decoded.
 *
 * The file was in hand the entire time. `URL.createObjectURL` makes it
 * paintable from memory with no network, so the picture is on screen before
 * the upload starts and stays until the stored copy has decoded behind it.
 *
 * scripts/check-image-picker.mjs drives the real component through a real
 * upload in a browser and samples the box the whole way, because "never
 * empty" is a claim about frames. This pins the rules that produce it.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

function main() {
  const picker = read("components/website-builder/editor/image-picker.tsx")
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const css = read("app/globals.css")

  console.log("\nThe picture you chose is on screen before the upload finishes")

  check("the file becomes something an <img> can paint immediately",
    /previewRef\.current = file \? URL\.createObjectURL\(file\) : null/.test(picker))
  check("set before the upload starts, not after it returns",
    /showFile\(file\)\s*\n\s*setUploading\(true\)/.test(picker),
    "after the upload is exactly the gap that was reported")
  check("and revoked when it is replaced and when the panel goes away",
    /if \(previewRef\.current\) URL\.revokeObjectURL\(previewRef\.current\)/.test(picker)
      && /useEffect\(\(\) => \(\) => \{ if \(previewRef\.current\) URL\.revokeObjectURL/.test(picker),
    "an object URL that is never revoked holds the file for the life of the tab")
  check("an upload that fails takes it away again",
    /showFile\(null\)\s*\n\s*toast\.error/.test(picker),
    "otherwise the box keeps showing a picture the panel does not actually have")
  check("so the first upload is the preview layout, not the dashed empty box",
    /if \(url \|\| preview\) \{/.test(picker))
  check("and the spinner sits over the picture rather than replacing it",
    /\{uploading && \(\s*\n\s*<span className="absolute inset-0 z-10 flex items-center justify-center bg-white\/55">/.test(picker))
  check("with Replace and Remove held while it runs",
    /* Two in the box layout, two in the sidebar's one-line layout, and Choose from your files under both. */
    (picker.match(/disabled=\{uploading\}/g) ?? []).length === 5)

  console.log("\nThe stored copy arrives over it, and never under an empty box")

  /*
    The same trap the analytics chart had: an effect that resets a "loaded"
    flag runs a render AFTER the one that received the new url, so for one
    render the box believes a picture it has never fetched is ready. Deriving
    it from a comparison has no such gap.
  */
  check("whether it has decoded is derived, not reset by an effect",
    /const ready = url !== null && readyUrl === url/.test(picker)
      && !/useEffect\(\(\) => \{ setReadyUrl\(null\)/.test(strip(picker)),
    "an effect that clears the flag runs one render late, which is a frame of wrong")
  check("a cached picture counts as decoded even though onLoad already fired",
    /ref=\{el => \{ if \(el\?\.complete && el\.naturalWidth > 0\) setReadyUrl\(url\) \}\}/.test(picker),
    "React attaches onLoad after mount; an image out of cache is complete before that")
  // Changed on purpose: a picture that will not load is asked for once more,
  // then the box says so in words instead of the browser's broken image.
  check("and one that will not load does not leave the box waiting for ever",
    /onError=\{storedFailed\}/.test(picker) && /setMiss\(\{ url, tries: 2 \}\)/.test(picker) && /This picture could not be loaded/.test(picker))
  /*
    THE GLITCH AT THE END OF AN UPLOAD, which was this component's own. The
    layer underneath was removed the moment `ready` turned true, and `ready`
    only means the stored copy is allowed to START appearing: it begins at
    nothing and takes IMAGE_FADE_MS to arrive. So the empty box came back for
    a quarter of a second, right as the upload finished.
  */
  check("what is underneath outlives the fade that covers it",
    /const faded = url !== null && fadedUrl === url/.test(picker)
      && /\{!faded && \(|\) : !faded && \(/.test(picker),
    "removing it when the fade STARTS puts an empty box under an image at zero opacity")
  check("with the end of the fade timed from the picture, not from a mount",
    /const timer = setTimeout\(\(\) => setFadedUrl\(url\), IMAGE_FADE_MS\)/.test(picker)
      && /\}, \[ready, faded, url\]\)/.test(picker))
  check("and choosing a replacement starts the sequence over",
    /if \(file\) \{ setReadyUrl\(null\); setFadedUrl\(null\) \}/.test(picker),
    "otherwise the previous picture still counts as arrived and hides the file just chosen")
  check("the file is let go once it is no longer holding anything up",
    /if \(faded && previewRef\.current\) showFile\(null\)/.test(picker))

  check("until then the box holds the local file, or a sweep when there is none",
    /preview\s*\n\s*\? <img src=\{preview\}/.test(picker)
      && /: <span data-wb-image-layer="waiting" className="wb-image-skeleton absolute inset-0"/.test(picker))
  check("and the stored copy fades in rather than appearing",
    /"wb-image-fade relative h-full w-full object-contain p-2",\s*\n\s*ready \? "opacity-100" : "opacity-0",/.test(picker))

  console.log("\nThe two rules that make waiting visible, and reduced motion respected")

  check("the sweep is in the stylesheet", /@keyframes wb-image-sweep/.test(css)
    && /\.wb-image-skeleton::after \{/.test(css))
  check("over a background that is not the box's own colour",
    /\.wb-image-skeleton \{\s*\n\s*background: #f1f2f4;/.test(css),
    "a skeleton the same colour as the box it sits in is an empty box")
  check("the sweep waits before it starts, so a quick picture never flashes one",
    /animation: wb-image-sweep 1\.15s cubic-bezier\(0\.4, 0, 0\.6, 1\) 300ms infinite backwards;/.test(css),
    "a sweep that starts and is cut off a moment later is the favicon flash in Website Settings")
  check("and in a dark panel it waits on a dark tone, not a light block",
    /\.dark \.wb-image-skeleton \{\s*\n\s*background: rgba\(255, 255, 255, 0\.07\);/.test(css))
  check("the fade is a transition on opacity", /\.wb-image-fade \{\s*\n\s*transition: opacity 260ms/.test(css))
  check("and both stop for reduced motion",
    /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\.wb-image-skeleton::after \{ animation: none; \}\s*\n\s*\.wb-image-fade \{ transition: none; \}/.test(css))

  console.log("\nAnd the probe drives the component the editor actually renders")

  check("the picker is a module of its own",
    /export function WbImagePicker/.test(picker))
  check("and the editor imports it rather than keeping a copy",
    /import \{ WbImagePicker \} from "@\/components\/website-builder\/editor\/image-picker"/.test(editor)
      && !/^function WbImagePicker\(\{/m.test(editor))
  check("the probe mounts that module",
    /from "\.\.\/components\/website-builder\/editor\/image-picker"/.test(read("scripts/render-image-picker.tsx")))
  check("and says what it cannot see",
    /WHAT THIS CAN AND CANNOT SEE/.test(read("scripts/check-image-picker.mjs")))
  check("and it watches the frame the fade starts on, which is where the glitch was",
    /the picture underneath is still there when the stored copy starts to appear/.test(read("scripts/check-image-picker.mjs")),
    "reverting the component to `!ready` makes that assertion fail, which is how it was checked")

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
