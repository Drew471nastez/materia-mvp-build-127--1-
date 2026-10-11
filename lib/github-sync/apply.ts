/**
 * ===========================================================================
 *  FILES FROM THE REPOSITORY, TAKEN INTO THE SITE AS DRAFTS
 * ===========================================================================
 * A push, or Pull from GitHub, brings files in their repository layout
 * (lib/github-sync/snapshot.ts). Each kind goes through the door the builder
 * itself uses for it, so a file from GitHub is held to exactly what the same
 * change made in the builder is held to:
 *
 *   A Storelib theme
 *     sections/*.storelib, blocks/*.storelib
 *                      compiled and saved through saveThemeFile, a section
 *                      checked like an agent's (validateSection), a built-in
 *                      one refused (agentMayWrite)
 *     templates/<page>.json, sections/<header|footer|overlay>-group.json
 *                      read back into pages as the theme import reads them
 *                      (pagesFromPackageFiles), cleaned (sanitizeSections),
 *                      held to the page limits, saved as the page's draft
 *     config/settings.json
 *                      cleaned (sanitizeThemeSettings), saved as the draft
 *                      settings
 *   An imported Shopify theme
 *     sections, blocks: the markup comes in, the file's settings stay as the
 *                      import made them (a schema change needs a new import,
 *                      and is said so)
 *     snippets, layout: wrapped as the import wraps them
 *     assets, locales, config/settings_schema.json: text, as they are
 *     templates and settings_data: not taken; the builder edits those
 *
 * A file the site already has, byte for byte, is left alone, so GitHub
 * redelivering a webhook changes nothing. A file that fails is reported with
 * its first error and not saved; the rest still go in.
 */
import "server-only"
import { validateSection } from "@/lib/storelib-ai/validate"
import { saveThemeFile } from "@/lib/website-builder/save-theme-file"
import { publicError } from "@/lib/agent-access/operations"
import { agentMayWrite } from "@/lib/agent-access/protected"
import { readOwnSectionFields, sanitizeSections, sanitizeThemeSettings } from "@/lib/website-builder/sanitize-sections"
import { blockTreeProblem } from "@/lib/website-builder/block-tree"
import { isPageKey } from "@/lib/website-builder/site-pages"
import { pagesFromPackageFiles, HEADER_GROUP_PATH, FOOTER_GROUP_PATH, OVERLAY_GROUP_PATH } from "@/lib/website-builder/theme-pages"
import { kindLookup } from "@/lib/storelib-theme/section-groups"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { LIMITS } from "@/lib/storelib-theme/types"
import { COMPAT_PREFIX, compatOf } from "@/lib/storelib-theme/compat/install"
import { isCompatSource, splitCompatFile, wrapCompatTemplate } from "@/lib/storelib-theme/compat/theme"
import type { SectionInstance } from "@/lib/website-builder/types"
import { BLOCK_FILE, SHOPIFY_FILE, STORELIB_DATA, SYNCED } from "./core"
import { jsonFile, type SiteSnapshot } from "./snapshot"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Taken {
  saved: string[]
  unchanged: string[]
  failed: { path: string; error: string }[]
}

const GROUPS = new Set([HEADER_GROUP_PATH, FOOTER_GROUP_PATH, OVERLAY_GROUP_PATH])
/* An imported theme's text files; a picture or a font is not carried by the repository. */
const TEXT_ASSET = /\.(?:css|js|mjs|json|liquid|svg|txt|scss|map|html|xml)$/i

/** The same value, written the same way: key order and spacing do not count as a change. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object).sort().map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(",")}}`
  }
  return JSON.stringify(value ?? null)
}

async function logActivity(db: Db, installId: string, who: string, row: { path: string; action: string; detail?: unknown }) {
  try {
    await db.from("theme_agent_activity").insert({ install_id: installId, token_id: null, agent_name: who, path: row.path, action: row.action, ...(row.detail ? { detail: row.detail } : {}) })
  } catch {
    /* the builder hears about it on its next load instead */
  }
}

/**
 * Take `incoming` (repository paths under the link's folder, to text) into the
 * site. `snap` is the site as it is now; `rest` reads any other page or group
 * file of the repository at the same commit, which pages are rebuilt from.
 */
export async function applyRepoFiles(
  db: Db,
  installId: string,
  snap: SiteSnapshot,
  incoming: Map<string, string>,
  who: string,
): Promise<Taken> {
  const out: Taken = { saved: [], unchanged: [], failed: [] }
  if (snap.kind === "shopify") {
    await applyShopify(db, installId, snap, incoming, who, out)
    return out
  }

  const data = new Map<string, string>()
  for (const [path, source] of incoming) {
    if (STORELIB_DATA.test(path)) {
      data.set(path, source)
      continue
    }
    if (!SYNCED.test(path) && !BLOCK_FILE.test(path)) continue
    if (snap.files[path] === source) {
      out.unchanged.push(path)
      continue
    }
    /* A built-in section or block in the repository is there to read. A change to one is refused and said so. */
    const allowed = agentMayWrite(path)
    if (allowed.ok === false) {
      out.failed.push({ path, error: allowed.error })
      continue
    }
    if (SYNCED.test(path)) {
      /* Held to what an agent's section is held to: it plugs into the theme like a native one. */
      const checked = validateSection(source, { path, expectType: path.replace(/^sections\//, "").replace(/\.storelib$/, ""), strict: true })
      if (checked.ok === false && checked.reason === "quality") {
        const firstProblem = checked.findings.find((f) => f.severity === "error")
        out.failed.push({ path, error: `${path}: ${firstProblem?.message ?? "does not meet the Storelib section rules"}` })
        continue
      }
    }
    const saved = await saveThemeFile(db, installId, path, source)
    if (saved.ok === false) {
      const first = saved.errors?.[0]
      /* This line can become a commit status, which a public repository shows to everyone: never a database's own words. */
      out.failed.push({ path, error: `${path}${first?.line ? ` line ${first.line}` : ""}: ${first?.message ?? publicError(saved.status, saved.error)}` })
      continue
    }
    out.saved.push(path)
    snap.files[path] = source
    await logActivity(db, installId, who, { path, action: saved.created ? "created" : "updated" })
  }

  if (data.has("config/settings.json")) await applySettings(db, installId, snap, data.get("config/settings.json")!, who, out)
  const pageFiles = [...data.keys()].filter((p) => p !== "config/settings.json")
  if (pageFiles.length) await applyPages(db, installId, snap, data, pageFiles, who, out)
  return out
}

async function applySettings(db: Db, installId: string, snap: SiteSnapshot, text: string, who: string, out: Taken) {
  const path = "config/settings.json"
  if (snap.files[path] === text) {
    out.unchanged.push(path)
    return
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (e) {
    out.failed.push({ path, error: `${path}: not valid JSON (${(e as Error).message.slice(0, 80)})` })
    return
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    out.failed.push({ path, error: `${path}: the theme settings are one JSON object` })
    return
  }
  if (stable(value) === stable(snap.settings)) {
    out.unchanged.push(path)
    return
  }
  /* An imported theme's own settings block is the import's; a Storelib theme never gains one from a file. */
  if (compatOf(value) && !compatOf(snap.settings)) {
    out.failed.push({ path, error: `${path}: the "shopify" settings belong to an imported theme` })
    return
  }
  const clean = sanitizeThemeSettings(value as Record<string, unknown>)
  const { error } = await db.from("store_theme_settings").update({ draft_settings: clean }).eq("install_id", installId)
  if (error) {
    out.failed.push({ path, error: `${path}: could not be saved. Try again.` })
    return
  }
  out.saved.push(path)
  snap.settings = clean
  snap.files[path] = jsonFile(clean)
  await logActivity(db, installId, who, { path: "settings", action: "page", detail: { replaced: true } })
}

async function applyPages(db: Db, installId: string, snap: SiteSnapshot, data: Map<string, string>, changed: string[], who: string, out: Taken) {
  const real = changed.filter((p) => snap.files[p] !== data.get(p))
  for (const p of changed) if (!real.includes(p)) out.unchanged.push(p)
  if (real.length === 0) return

  /* Every page and group file as the repository now has it: the ones this push changed over the site's own. */
  const files: Record<string, string> = {}
  for (const [p, t] of Object.entries(snap.files)) if (STORELIB_DATA.test(p) && p !== "config/settings.json") files[p] = t
  for (const p of changed) files[p] = data.get(p)!
  for (const p of real) {
    try {
      JSON.parse(files[p])
    } catch (e) {
      out.failed.push({ path: p, error: `${p}: not valid JSON (${(e as Error).message.slice(0, 80)})` })
      delete files[p]
    }
  }
  /* A group file changed is every page's header or footer; otherwise only the pages whose own file changed. */
  const everyPage = real.some((p) => GROUPS.has(p) && p in files)
  const wanted = new Set(real.map((p) => /^templates\/([A-Za-z0-9_.-]+)\.json$/.exec(p)?.[1]).filter((k): k is string => !!k && `templates/${k}.json` in files))
  const pages = pagesFromPackageFiles(files, kindLookup(snap.files, SECTION_SCHEMAS as never))
  const current = new Map(snap.pages.map((p) => [p.page_key, p.sections]))
  const touched = new Set<string>()

  for (const page of pages) {
    if (!everyPage && !wanted.has(page.page_key)) continue
    const file = `templates/${page.page_key}.json`
    const exists = current.has(page.page_key)
    if (!exists && !isPageKey(page.page_key)) {
      out.failed.push({ path: file, error: `${file}: a new page's name uses lowercase letters, numbers and hyphens` })
      continue
    }
    const own = await readOwnSectionFields(db, installId, page.sections.map((s) => s.type))
    const sections = sanitizeSections(page.sections as SectionInstance[], own)
    if (sections.length > LIMITS.sectionsPerTemplate) {
      out.failed.push({ path: file, error: `${file}: a page holds ${LIMITS.sectionsPerTemplate} sections, this one has ${sections.length}` })
      continue
    }
    const overfull = sections.map((s) => blockTreeProblem(s)).find((problem) => problem !== null)
    if (overfull) {
      out.failed.push({ path: file, error: `${file}: ${overfull}` })
      continue
    }
    if (exists && stable(sections) === stable(current.get(page.page_key))) continue
    const res = exists
      ? await db.from("store_theme_pages").update({ draft_sections: sections }).eq("install_id", installId).eq("page_key", page.page_key)
      : await db.from("store_theme_pages").insert({ install_id: installId, page_key: page.page_key, sections: [], draft_sections: sections })
    if (res.error) {
      out.failed.push({ path: file, error: `${file}: could not be saved. Try again.` })
      continue
    }
    touched.add(page.page_key)
    current.set(page.page_key, sections)
    await logActivity(db, installId, who, { path: `pages/${page.page_key}`, action: exists ? "page" : "page_created", detail: { page: page.page_key, replaced: true } })
  }
  for (const p of real) {
    if (out.failed.some((f) => f.path === p)) continue
    const key = /^templates\/([A-Za-z0-9_.-]+)\.json$/.exec(p)?.[1]
    if (GROUPS.has(p) || (key && touched.has(key))) out.saved.push(p)
    else out.unchanged.push(p)
  }
  snap.pages = [...current].map(([page_key, sections]) => ({ page_key, sections }))
}

/* ── an imported Shopify theme ────────────────────────────────────────── */

/** The markup and the `{% schema %}` of a section file as the export writes it. */
export function liquidParts(text: string): { markup: string; schema: unknown; bad: boolean } {
  const open = /\{%-?\s*schema\s*-?%\}/.exec(text)
  if (!open) return { markup: text, schema: null, bad: false }
  const rest = text.slice(open.index + open[0].length)
  const close = /\{%-?\s*endschema\s*-?%\}/.exec(rest)
  const body = close ? rest.slice(0, close.index) : rest
  try {
    return { markup: text.slice(0, open.index), schema: JSON.parse(body), bad: false }
  } catch {
    return { markup: text.slice(0, open.index), schema: null, bad: true }
  }
}

/** What comes after `</template>` in a stored compatible file: its panel schema, kept as the import wrote it. */
function tailOf(stored: string): string {
  const lines = stored.split("\n")
  const start = lines.findIndex((l) => /^\s*<template\s+compat="shopify"\s*>/.test(l))
  let end = start + 1
  while (end < lines.length && !/^\s*<\/template>\s*$/.test(lines[end])) end++
  return lines.slice(end + 1).join("\n")
}

/**
 * An imported section or block as the site stores it, from its Liquid in the
 * repository: the new markup in the stored file's place, the stored settings
 * kept. Refused when the `{% schema %}` changed, since an imported theme's
 * settings come from its import.
 */
export function compatFromLiquid(path: string, stored: string, text: string): { ok: true; content: string } | { ok: false; error: string } {
  const parts = liquidParts(text)
  if (parts.bad) return { ok: false, error: `${path}: the {% schema %} is not valid JSON` }
  const had = splitCompatFile(stored).schema
  const theirs = had && typeof had.shopify === "object" ? had.shopify : null
  if (stable(parts.schema ?? {}) !== stable(theirs ?? {})) {
    return { ok: false, error: `${path}: its settings ({% schema %}) changed. An imported theme's settings come from its import: change the markup here, or import the theme again` }
  }
  return { ok: true, content: `${wrapCompatTemplate(parts.markup)}\n${tailOf(stored)}` }
}

async function applyShopify(db: Db, installId: string, snap: SiteSnapshot, incoming: Map<string, string>, who: string, out: Taken) {
  const renamed = (compatOf(snap.settings)?.renamed ?? {}) as Record<string, string>
  for (const [path, text] of incoming) {
    if (!SHOPIFY_FILE.test(path)) continue
    if (snap.files[path] === text) {
      out.unchanged.push(path)
      continue
    }
    let target: string | null = null
    let content = text
    const code = /^(layout|snippets|sections|blocks)\/([^/]+)\.liquid$/.exec(path)
    if (code) {
      const [, folder, name] = code
      if (folder === "layout" || folder === "snippets") {
        target = `${folder}/${name}.storelib`
        content = wrapCompatTemplate(text)
      } else {
        const ours = folder === "sections" ? (renamed[name] ?? name) : name
        target = `${folder}/${ours}.storelib`
        const stored = snap.rows[target]
        if (!stored || !isCompatSource(stored)) {
          out.failed.push({ path, error: `${path}: a new ${folder === "sections" ? "section" : "block"} comes into an imported theme with a fresh import of the theme` })
          continue
        }
        const back = compatFromLiquid(path, stored, text)
        if (back.ok === false) {
          out.failed.push({ path, error: back.error })
          continue
        }
        content = back.content
      }
    } else if (/^(assets|locales)\//.test(path) || path === "config/settings_schema.json") {
      if (!TEXT_ASSET.test(path)) continue
      target = `${COMPAT_PREFIX}${path}`
    } else {
      out.failed.push({ path, error: `${path}: an imported theme's pages and settings are edited in the builder, so this file was not taken` })
      continue
    }
    if (snap.rows[target] === content) {
      out.unchanged.push(path)
      continue
    }
    const saved = await saveThemeFile(db, installId, target, content)
    if (saved.ok === false) {
      const first = saved.errors?.[0]
      out.failed.push({ path, error: `${path}${first?.line ? ` line ${first.line}` : ""}: ${first?.message ?? publicError(saved.status, saved.error)}` })
      continue
    }
    out.saved.push(path)
    snap.rows[target] = content
    snap.files[path] = text
    await logActivity(db, installId, who, { path: target, action: saved.created ? "created" : "updated" })
  }
}
