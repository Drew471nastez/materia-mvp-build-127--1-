/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR BUGS OF ROUND OP-EDITOR
 * ===========================================================================
 * Three things a creator could lose or be misled by:
 *
 *   SHARE   An address typed in Settings is put in the page when the tab is
 *           left, before any Save. Copy link, Open in a new tab and the share
 *           sheet read the page's own slug, so they handed out an address
 *           that was not live (or, after a save refused it as taken, somebody
 *           else's page). They read the address as last saved now
 *           (lib/onepage/editor-state liveSlug).
 *   UPLOADS A picture field's upload that was stopped, or replaced (a library
 *           pick, a second file), still wrote its picture when it answered,
 *           over the choice made since. A library pick did not even stop it.
 *   INTEGRATIONS  A read of what is connected that failed showed every tool
 *           as "Not connected" / "Not set up", and a tool's sheet offered
 *           Connect, so pressing it replaced a working key (a webhook's
 *           signing secret too). The kept answer was also never read again
 *           for the rest of the visit.
 *
 * The rule that is pure runs here; what lives in components is pinned by
 * reading its source, and seen working in scripts/check-onepage-editor-bugs.mjs
 * (which fails on the code before these fixes).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { liveSlug } from "@/lib/onepage/editor-state"
import { stripComments } from "./_source"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` (${detail})` : "")); console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const code = (p: string) => stripComments(read(p))

function main() {
  console.log("\nThe address the editor shares is the one that is live")
  {
    check("the saved address wins over one typed and not saved", liveSlug("satori", "satori-new") === "satori")
    check("after a refused save, still the saved one", liveSlug("satori", "taken-by-someone") === "satori")
    check("with no save known, the page's own", liveSlug(null, "satori") === "satori" && liveSlug("", "satori") === "satori" && liveSlug(undefined, "satori") === "satori")
    check("never undefined", liveSlug(null, undefined) === "")

    const editor = code("components/onepage/onepage-editor.tsx")
    check("the editor reads the address as last saved", /liveSlug\(getSavedSettings\(\)\?\.slug, onepage\.slug\)/.test(editor))
    check("Copy link and Open read it, never the draft's slug", /getLinksShareUrl\(shareSlug\)/.test(editor) && /getLinksUrlWithCustomDomain\(shareSlug, connectedDomain\)/.test(editor) && !/getLinksShareUrl\(onepage\.slug\)/.test(editor))
    check("the share sheet's handle and Instagram steps read it too", /\/\{slug\}<\/p>/.test(editor) && /<InstagramBioShare slug=\{slug\}/.test(editor) && /slug=\{shareSlug\}/.test(editor))
  }

  console.log("\nAn upload that was stopped or replaced writes nothing")
  {
    const hook = code("components/onepage/upload-progress.tsx")
    const success = hook.slice(hook.indexOf("const result = await uploadOnePageMedia"), hook.indexOf("} catch (err)"))
    check("a result is answered only while its upload is still the wanted one", /if \(ctrl\.current !== c\) return null[\s\S]*return result/.test(success))
    check("a field that has gone still gets its upload (B3 kept)", !/if \(!alive\.current\) return null/.test(success))
    const field = code("components/onepage/image-field.tsx")
    const pick = field.slice(field.indexOf("const pick ="), field.indexOf("const remove ="))
    check("a library pick stops an upload still going up", /up\.cancel\(\)/.test(pick) && !/up\.clear\(\)/.test(pick))
    const design = code("components/onepage/tabs/design-tab.tsx")
    const wall = design.slice(design.indexOf("const uploadWallpaperImage"), design.indexOf("const handleImageUpload"))
    check("a replaced wallpaper upload leaves the newer preview alone", /if \(old !== preview\) return old/.test(wall.slice(0, wall.indexOf("updateTheme("))))
  }

  console.log("\nA failed read of what is connected is not 'Not connected'")
  {
    const page = code("components/onepage/page-integrations.tsx")
    check("the kept answer is read again when it is old, one request for all rows", /Date\.now\(\) - readAt > FRESH_MS/.test(page) && /if \(!reading\) reading = reload\(\)/.test(page))
    check("a row whose read failed says it could not be checked", /unread \? \{ text: [^,]*Could not be checked/.test(page) && /unread=\{all === null\}/.test(page))
    check("a tool's sheet offers Try again, not Connect, when it could not read", /\{all === null \? \(/.test(page) && /data-integration-unread/.test(page) && /reloadPageIntegrations\(\)/.test(page))
    check("and its header does not say Not connected either", /const s = all === null \? \{ text: [^,]*Could not be checked/.test(page))
    const settings = code("components/onepage/settings-integrations.tsx")
    check("the store's tags: a failed read is said, with Try again", /tags === null \? \(\s*<UnreadNote onRetry=\{retryTags\} \/>/.test(settings))
    check("the email tools: the same", /tools === null \? \(\s*<UnreadNote onRetry=\{retryTools\} \/>/.test(settings))
    for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
      const words = readFileSync(join(process.cwd(), `lib/i18n/catalog/${lang}.ts`), "utf8")
      check(`${lang}: the new lines are translated`, ["Could not be checked", "Could not check what is connected.", "Could not check what is connected. Try again in a moment."].every((k) => words.includes(JSON.stringify(k) + ":")))
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
