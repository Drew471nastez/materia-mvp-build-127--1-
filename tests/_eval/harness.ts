/**
 * Round R (R4): what the harness does with a generated website after the
 * engine is done, through the same code a creator's actions go through:
 *
 *   render     the render check per page (renderCheckForInstall: the page
 *              as a preview link draws it, the template engine)
 *   browser    ./browser.ts (real Chromium, JS off and JS on)
 *   editor     the editor's own routes: GET the home sections, change the
 *              first section's heading as the editor's inspector would, PUT
 *              it as a draft, GET it again; the change is in the database,
 *              every other section and item untouched, the site's own
 *              component files unchanged; a Theme settings save through
 *              PUT /settings round trips the accent
 *   publish    POST /publish, then the live site's reader (/w/<user>) finds
 *              the published site, draws the same sections with the edited
 *              heading, and another page of the site too
 */
import type { AiWorld } from "../ai-builder-e2e-kit"
import { installFiles, installSettings } from "../ai-builder-e2e-kit"
import type { EvalShot, EvalSite } from "@/lib/ai-builder/eval/types"
import type { SectionInstance } from "@/lib/website-builder/types"
import type { Person } from "../_journey/harness"
import { schemaInfo } from "@/lib/ai-builder/agent/validate"
import { browseSite, pagesToCheck, shootHome } from "./browser"

type Browser = import("puppeteer-core").Browser

const EDITED = "Edited in the editor, kept on publish"

export async function renderPages(site: EvalSite, creatorId: string): Promise<NonNullable<EvalSite["render"]>> {
  const { renderCheckForInstall } = await import("@/lib/ai-builder/render-check-server")
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const admin = createAdminClient() as never
  const out: NonNullable<EvalSite["render"]> = []
  for (const p of site.pages.filter((x) => x.sections.some((s) => !s.group && !["header", "footer"].includes(s.type)))) {
    const r = await renderCheckForInstall(admin, { creatorId, installId: site.installId!, page: p.key })
    out.push({ page: p.key, ok: r.ok, errors: r.issues.filter((i) => i.severity === "error").map((i) => i.message.slice(0, 200)) })
  }
  return out
}

/** The first section a visitor reads that has a text heading the inspector can change. */
function editable(sections: SectionInstance[], site: EvalSite): { id: string; key: string } | null {
  for (const s of sections) {
    if (s.group || s.type === "header" || s.type === "footer") continue
    const info = schemaInfo(s.type, site.sources)
    const f = info?.settings.find((x) => /^(?:heading|title)$/.test(x.id) && /text|richtext|inline_richtext|textarea/.test(x.type))
    if (f) return { id: s.id, key: f.id }
  }
  return null
}

export async function editAndPublish(w: AiWorld, site: EvalSite, person: Person, slug: string): Promise<{ editor: NonNullable<EvalSite["editor"]>; publish: NonNullable<EvalSite["publish"]> }> {
  const { j } = w
  const installId = site.installId!
  const filesBefore = JSON.stringify(installFiles(w, installId))
  const got = await j.call(`GET /api/website-builder/themes/${installId}/sections?page=home`, { as: person })
  const sections = (got.json?.sections ?? []) as SectionInstance[]
  const target = editable(sections, site)
  if (got.status !== 200 || !target) return { editor: { ok: false, detail: `GET sections answered ${got.status}; ${target ? "" : "no section with a heading to edit"}` }, publish: { ok: false, detail: "not tried: the edit failed" } }
  const edited = sections.map((s) => (s.id === target.id ? { ...s, settings: { ...s.settings, [target.key]: EDITED } } : s))
  const put = await j.call(`PUT /api/website-builder/themes/${installId}/sections`, { as: person, body: { page_key: "home", sections: edited, mode: "draft" } })
  const again = await j.call(`GET /api/website-builder/themes/${installId}/sections?page=home`, { as: person })
  const after = (again.json?.sections ?? []) as SectionInstance[]
  const changed = after.find((s) => s.id === target.id)?.settings?.[target.key] === EDITED
  /* Every other section and item kept: the same ids, types and values (a save may add a field's default; it may not change or drop one). */
  const differs = (a: SectionInstance, b: SectionInstance | undefined): string | null => {
    if (!b || b.type !== a.type) return `${a.id} missing or retyped`
    for (const [k, v] of Object.entries(a.settings ?? {})) if (JSON.stringify(b.settings?.[k]) !== JSON.stringify(v)) return `${a.id}.${k}: ${JSON.stringify(v)?.slice(0, 60)} became ${JSON.stringify(b.settings?.[k])?.slice(0, 60)}`
    if ((a.blocks ?? []).map((x) => x.id).join() !== (b.blocks ?? []).map((x) => x.id).join()) return `${a.id} items changed`
    return null
  }
  const diff = sections.filter((s) => s.id !== target.id).map((s) => differs(s, after.find((x) => x.id === s.id))).find(Boolean) ?? null
  const others = !diff
  const filesKept = JSON.stringify(installFiles(w, installId)) === filesBefore
  /* Theme settings through the editor's route: the accent changed and read back, then put back. */
  const draft = installSettings(w, installId).draft ?? installSettings(w, installId).settings
  const { themeSettingsToTokens } = await import("@/lib/ai-builder/tokens")
  const accent = themeSettingsToTokens(draft).colors.accent
  const { tokensToThemeSettings } = await import("@/lib/ai-builder/agent/tokens")
  const t0 = themeSettingsToTokens(draft)
  const panel = { ...draft, ...tokensToThemeSettings({ colors: { ...t0.colors, accent: "#0a7d55" } } as never, draft).settings }
  const s1 = await j.call(`PUT /api/website-builder/themes/${installId}/settings`, { as: person, body: { draft_settings: panel } })
  const accentSaved = themeSettingsToTokens(installSettings(w, installId).draft ?? {}).colors.accent === "#0a7d55"
  const s2 = await j.call(`PUT /api/website-builder/themes/${installId}/settings`, { as: person, body: { draft_settings: { ...panel, ...tokensToThemeSettings({ colors: { ...t0.colors, accent } } as never, panel).settings } } })
  const ok = put.status === 200 && changed && others && filesKept && s1.status === 200 && accentSaved && s2.status === 200
  const editor = {
    ok,
    detail: ok
      ? `home › ${target.id}.${target.key} saved as a draft and read back; ${sections.length - 1} other sections and the site's files unchanged; the accent changed through Theme settings and read back`
      : `PUT ${put.status}, read back ${changed}, others kept ${others}${diff ? ` (${diff})` : ""}, files kept ${filesKept}, settings ${s1.status}/${accentSaved}/${s2.status}`,
  }
  const pub = await j.call(`POST /api/website-builder/themes/${installId}/publish`, { as: person, body: { action: "publish" } })
  const { publishedSiteByName } = await import("@/lib/website-builder/published-site")
  const live = await publishedSiteByName(slug, "home")
  const second = pagesToCheck(site)[1]
  const liveSecond = second ? await publishedSiteByName(slug, second) : null
  const html = live.kind === "site" ? live.site.sections.map((x) => live.site.prerendered[x.id]?.html ?? "").join("\n") : ""
  const liveTypes = live.kind === "site" ? live.site.sections.map((x) => x.type) : []
  const draftTypes = after.filter((s) => !s.hidden).map((s) => s.type)
  const sameTypes = draftTypes.every((t) => liveTypes.includes(t))
  const drawn = live.kind === "site" && live.site.sections.filter((x) => live.site.prerendered[x.id]?.html).length
  const okPub = pub.status === 200 && live.kind === "site" && sameTypes && (html.includes(EDITED) || JSON.stringify(live.kind === "site" ? live.site.sections : []).includes(EDITED)) && (!second || liveSecond?.kind === "site")
  const publish = {
    ok: okPub,
    detail: okPub
      ? `published; /w/${slug} draws ${liveTypes.length} sections (${drawn} on the server), the edited heading included${second ? `; /${second} live too` : ""}`
      : `publish ${pub.status} ${JSON.stringify(pub.json).slice(0, 160)}; live ${live.kind}; types match ${sameTypes}; edited heading live ${html.includes(EDITED)}${second ? `; /${second} ${liveSecond?.kind}` : ""}`,
  }
  return { editor, publish }
}

/** A snapshot of the website as it stands (for a refinement's before). */
export async function snapshot(w: AiWorld, base: EvalSite, installId: string): Promise<EvalSite> {
  const { installPages } = await import("../ai-builder-e2e-kit")
  const pages = Object.entries(installPages(w, installId)).map(([key, p]) => ({ key, sections: (p.draft ?? p.sections) as SectionInstance[] }))
  const settings = installSettings(w, installId).draft ?? installSettings(w, installId).settings
  const sources = Object.fromEntries(Object.entries(installFiles(w, installId)).map(([p, f]) => [p, f.draft ?? f.content ?? ""]))
  return { ...base, installId, pages, settings, sources }
}

export async function photographBefore(browser: Browser | null, site: EvalSite, stem: string | null): Promise<EvalShot | null> {
  if (!browser || !stem) return null
  try {
    return await shootHome(browser, site, stem)
  } catch {
    return null
  }
}

export async function lookInBrowser(browser: Browser | null, site: EvalSite, stem: string | null) {
  return browseSite(browser, site, stem)
}
