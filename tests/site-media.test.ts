/**
 * Every picture and video a Storelib section draws loads the same way,
 * whoever wrote the section: lib/website-builder/media-pass.ts and
 * media-fade.ts, wired through lib/website-builder/storelib-runtime.ts.
 *
 * Run with:  npm run test:push
 */

import { optimizeSectionMedia } from "@/lib/website-builder/media-pass"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { themeStylesheet } from "@/lib/website-builder/theme-css"
import { buildSection } from "@/lib/website-builder/agent/operations"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

// Changed on purpose (round AW): Storelib's own storage project; the optimizer no longer fetches from any other *.supabase.co (next.config.mjs OWN_STORAGE_HOSTS).
const SUPA = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/media/shirt.jpg"

{
  const out = optimizeSectionMedia(`<figure><img src="${SUPA}" alt="A shirt" width="600" height="800"></figure>`)
  check("a picture is lazy and decoded off the main thread", /loading="lazy"/.test(out) && /decoding="async"/.test(out))
  check("it is offered at the widths a screen needs, through the optimizer", /srcset="\/_next\/image\?url=[^"]*&amp;w=384&amp;q=90 384w, /.test(out) && /2048w"/.test(out), out)
  check("sized by its own width", /sizes="\(min-width: 600px\) 600px, 100vw"/.test(out))
  check("and marked to fade in", /data-sl-media=""/.test(out))
  check("everything else about it is untouched", out.startsWith(`<figure><img src="${SUPA}" alt="A shirt" width="600" height="800"`) && out.endsWith("</figure>"))
}
{
  const out = optimizeSectionMedia(`<img src="${SUPA}" loading="eager" decoding="sync" srcset="${SUPA} 1x" sizes="50vw" alt="">`)
  check("what the author chose wins: loading, decoding, srcset, sizes", (out.match(/loading=/g) ?? []).length === 1 && /loading="eager"/.test(out) && /decoding="sync"/.test(out) && !/_next\/image/.test(out) && (out.match(/sizes=/g) ?? []).length === 1)
}
{
  const out = optimizeSectionMedia(`<img src="https://example.org/a.jpg" alt="">`)
  check("a host the optimizer cannot fetch is loaded as it is, lazily", !/srcset/.test(out) && /loading="lazy"/.test(out))
  const data = optimizeSectionMedia(`<img src="data:image/png;base64,AAAA" alt="">`)
  check("so is an inline picture", !/srcset/.test(data))
}
{
  const out = optimizeSectionMedia(`<video src="/v.mp4" autoplay loop></video><video src="/w.mp4" controls></video><iframe src="https://www.youtube.com/embed/x"></iframe>`)
  check("an autoplaying video is muted and plays inline, so a phone plays it", /<video src="\/v.mp4" autoplay loop preload="auto" muted playsinline data-sl-media="">/.test(out), out)
  check("a video with controls fetches only what it needs to show its first frame", /<video src="\/w.mp4" controls preload="metadata" data-sl-media="">/.test(out))
  check("an embed waits until it is near the screen", /<iframe src="https:\/\/www.youtube.com\/embed\/x" loading="lazy">/.test(out))
}
check("markup with no media is returned as it was", optimizeSectionMedia("<p>Hello</p>") === "<p>Hello</p>")
check("and running it twice changes nothing more", optimizeSectionMedia(optimizeSectionMedia(`<img src="${SUPA}" alt="">`)) === optimizeSectionMedia(`<img src="${SUPA}" alt="">`))

{
  /* Through the real renderer: a built-in section with a picture, as every site draws it. */
  const section = buildSection("hero-1", "hero_split")!
  section.settings = { ...section.settings, image: SUPA }
  const drawn = renderStorelibSection(section, {} as ThemeSettingsValues, { template: "index" })
  check("every .storelib section goes through it on its way out of the renderer", drawn.ok === true && /<img[^>]*data-sl-media=""/.test(drawn.html) && /_next\/image/.test(drawn.html), drawn.ok === true ? drawn.html.slice(0, 300) : "")
}
{
  const css = themeStylesheet({} as ThemeSettingsValues)
  check("the stylesheet hides a picture only once the page's script is running", /\[data-storelib-theme\]\[data-sl-fade\] \[data-sl-media\]:not\(\[data-sl-loaded\]\)\{opacity:0;\}/.test(css))
  check("and fades it, except for anyone who asked for less motion", /\[data-sl-media\]\{transition:opacity/.test(css) && /prefers-reduced-motion:reduce\)\{[^}]*\}\[data-storelib-theme\] \[data-sl-media\]\{transition:none;\}/.test(css))
  const hook = readFileSync(join(process.cwd(), "components/website-builder/theme/use-site-motion.ts"), "utf8")
  check("the page root installs it, in the canvas and on every published page", /installMediaFade\(root\)/.test(hook))
  const fade = readFileSync(join(process.cwd(), "lib/website-builder/media-fade.ts"), "utf8")
  check("a picture that fails is shown, not left hidden", /root\.addEventListener\("error", onLoad, true\)/.test(fade))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
