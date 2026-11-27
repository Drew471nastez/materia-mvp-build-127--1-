/**
 * A Materia template as the marketplace stores it, for scripts/check-editor-open-r68.mjs: converted by
 * convertTemplateFiles, and the files route's answers drawn from its rows as the route draws them.
 */
import { composeTemplateFiles } from "@/lib/themes/template-packages"
import { convertTemplateFiles } from "@/lib/themes/template-install"
import { partSectionPaths, partTypes, sectionTagNames } from "@/lib/website-builder/source-parts"
import { PLAIN_SCRIPT, textVersion } from "@/lib/storelib-theme/compat/script-version"
import { withStorelibReviewsSection } from "@/lib/storelib-theme/compat/storelib-reviews"

export async function load(id: string) {
  const r = await convertTemplateFiles(composeTemplateFiles(id), id)
  if (!r) throw new Error(`${id} did not convert`)
  const all = r.theme.files as Record<string, string>
  const sources = Object.fromEntries(Object.entries(all).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(all).filter(([p, t]) => p.startsWith("shopify/") && !t.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
  const assets = Object.fromEntries(Object.entries(all).filter(([p]) => p.startsWith("shopify/assets/")))
  const pages = Object.fromEntries(r.theme.pages.map((p: { page_key: string; sections: unknown }) => [p.page_key, p.sections]))
  const filesAnswer = (query: string): unknown => {
    const q = new URLSearchParams(query)
    if (q.get("compat") === "1") {
      if (q.get("scripts") !== "versions") return { files }
      const lean: Record<string, string> = {}
      const versions: Record<string, string> = {}
      for (const [p, t] of Object.entries(files)) {
        const m = PLAIN_SCRIPT.exec(p)
        if (m) versions[m[1]] = textVersion(t)
        else lean[p] = t
      }
      return { files: lean, script_versions: versions }
    }
    if (q.get("sources") === "1") {
      /* As app/api/website-builder/themes/[installId]/files/route.ts answers the two parts. */
      const types = partTypes(q.get("types"))
      const rest = types ? null : partTypes(q.get("rest"))
      if (rest) {
        const not = new Set(partSectionPaths(rest))
        return { files: Object.fromEntries(Object.entries(sources).filter(([p]) => p.startsWith("sections/") && !not.has(p))), settings_schema: null, part: "rest" }
      }
      if (types) {
        const want = new Set(partSectionPaths(types))
        const files = Object.fromEntries(Object.entries(sources).filter(([p]) => !p.startsWith("sections/") || want.has(p)))
        for (const t of sectionTagNames(files)) if (sources[`sections/${t}.storelib`] !== undefined) files[`sections/${t}.storelib`] = sources[`sections/${t}.storelib`]
        return { files: withStorelibReviewsSection(files), settings_schema: null, part: "page" }
      }
      return { files: withStorelibReviewsSection(sources), settings_schema: null }
    }
    return { files: {} }
  }
  return { settings: r.theme.settings, pages, assets, filesAnswer }
}
