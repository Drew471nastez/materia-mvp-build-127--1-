/**
 * The render check for one page of one website, read from the database the
 * way a preview link draws it: the draft page in home's draft chrome, the
 * section files as last saved, the draft theme settings, this creator's own
 * shop, collections, communities and forms (published-site.ts dressPage, no
 * cache). Nothing is written. The caller (the agent's tool, bound to its job
 * row) passes the job's creator and install; the install is checked to be
 * that creator's here as well, so a wrong pair reads nothing.
 */
import { renderCheck, esbuildScriptParser, type RenderCheckResult } from "./render-check"
import type { RuntimeCapabilities } from "./runtime-contract"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export async function renderCheckForInstall(
  db: Db,
  input: { creatorId: string; installId: string; page: string; capabilities?: RuntimeCapabilities },
): Promise<RenderCheckResult> {
  const { creatorId, installId, page } = input
  const [{ pageSections, themeSettings: themeSettingsOf }, { sanitizeSections }, { kindLookup, repairChrome }, { chromeOf, homeChromeOnly, withUniversalChrome, CHROMELESS_PAGES, withoutChrome }, { SECTION_SCHEMAS }, { templateForPage, pageTitleFromKey }, { ownerOf, dressPage }, { withStoreMenus, storeMenusOrNull }] =
    await Promise.all([
      import("@/lib/website-builder/preview-link"),
      import("@/lib/website-builder/sanitize-sections"),
      import("@/lib/storelib-theme/section-groups"),
      import("@/lib/website-builder/universal-chrome"),
      import("@/lib/website-builder/section-schemas"),
      import("@/lib/website-builder/site-pages"),
      import("@/lib/website-builder/published-site"),
      import("@/lib/website-builder/store-menus-server"),
    ])
  const empty: RenderCheckResult = { ok: false, issues: [{ severity: "error", code: "render.empty_page", message: `There is no page "${page}" on this website.` }], htmlBytes: 0, sections: [] }
  const { data: install } = await db
    .from("store_theme_installs")
    .select("id, creator_id, store_theme_settings ( settings, draft_settings )")
    .eq("id", installId)
    .eq("creator_id", creatorId)
    .maybeSingle()
  if (!install) return empty
  const settingsRow = Array.isArray(install.store_theme_settings) ? (install.store_theme_settings[0] ?? null) : (install.store_theme_settings ?? null)
  const theme = withStoreMenus((themeSettingsOf(settingsRow as never, true) ?? {}) as ThemeSettingsValues, await storeMenusOrNull(db as never, creatorId).catch(() => null))
  const keys = page === "home" ? ["home"] : [page, "home"]
  const { data: rows } = await db.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", installId).in("page_key", keys)
  const byKey = new Map(((rows ?? []) as { page_key: string; sections: unknown; draft_sections: unknown }[]).map((r) => [r.page_key, r]))
  const row = byKey.get(page)
  if (!row) return empty
  const { owner, products, productCount } = await ownerOf(creatorId, installId, theme, { cached: false, draft: true })
  const kinds = kindLookup(owner.sources, SECTION_SCHEMAS as never)
  const own = repairChrome(sanitizeSections(pageSections<SectionInstance[]>(row as never, true) ?? []), kinds).sections
  const home = page === "home" ? own : repairChrome(sanitizeSections(pageSections<SectionInstance[]>(byKey.get("home") as never, true) ?? []), kinds).sections
  const sections = CHROMELESS_PAGES.has(page) ? withoutChrome(own) : withUniversalChrome(own, chromeOf(home, { homeOnly: homeChromeOnly(theme as Record<string, unknown>) }))
  const template = templateForPage(page)
  const dressed = await dressPage(owner, sections, products, productCount, template, pageTitleFromKey(page), undefined, { cached: false })
  return renderCheck({
    page,
    sections: dressed.sections,
    sources: owner.sources,
    theme,
    template,
    products,
    data: dressed.data,
    capabilities: input.capabilities,
    parseScript: (await esbuildScriptParser()) ?? undefined,
  })
}
