/**
 * Google Fonts for the hero's photographs (scripts/hero-shots.mjs).
 *
 * The demo stores use Storelib's real theme fonts (lib/website-builder/
 * font-options.ts), which a published site asks Google for. A headless
 * browser here cannot reach Google directly, so this fetches the stylesheet
 * and its font files once with curl (which goes through the machine's proxy
 * and its certificates) and keeps them in a folder; the photographer answers
 * the page's requests for fonts.googleapis.com and fonts.gstatic.com from it.
 * Every family is under the SIL Open Font License.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/* A desktop Chrome's user agent, so the stylesheet names woff2 files. */
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

export function fontCache(dir) {
  mkdirSync(dir, { recursive: true })
  const file = (url) => join(dir, createHash("sha1").update(url).digest("hex"))
  const get = (url) => {
    const f = file(url)
    if (existsSync(f)) return readFileSync(f)
    try {
      const body = execFileSync("curl", ["-sSfL", "--max-time", "30", "-A", UA, url], { maxBuffer: 32 * 1024 * 1024 })
      writeFileSync(f, body)
      return body
    } catch {
      return null
    }
  }
  return {
    /** The response for a Google Fonts request, or null to let it fail (the page then draws its fallback face). */
    answer(url) {
      const u = new URL(url)
      if (u.hostname === "fonts.googleapis.com") {
        const body = get(url)
        return body ? { status: 200, contentType: "text/css; charset=utf-8", body } : null
      }
      if (u.hostname === "fonts.gstatic.com") {
        const body = get(url)
        return body ? { status: 200, contentType: "font/woff2", body, headers: { "access-control-allow-origin": "*" } } : null
      }
      return null
    },
    /** @font-face rules for these families with their files inlined, for a page that is not a theme page (the product pictures). */
    inline(families, axes = "ital,wght@0,400;0,600;0,700;0,800;1,600") {
      const q = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:${axes}`).join("&")
      const css = get(`https://fonts.googleapis.com/css2?${q}&display=block`)
      if (!css) return ""
      return css.toString().replace(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g, (_, u) => {
        const b = get(u)
        return b ? `url(data:font/woff2;base64,${b.toString("base64")})` : `url(${u})`
      })
    },
  }
}
