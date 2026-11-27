/**
 * ===========================================================================
 *  A NEW WEBSITE FROM ONE OF STORELIB'S TEMPLATES, ON THE SERVER (round 26)
 * ===========================================================================
 * Start with AI builds like the templates are built: the new website IS the
 * closest Materia template (lib/storelib-ai/materia/reference.ts
 * chooseMateriaTemplate), imported exactly as Browse themes adds one
 * (app/api/themes/marketplace/add): the template's zip composed from
 * theme-packages (lib/themes/template-packages.ts), converted as every
 * Shopify-format theme is (lib/storelib-theme/shopify/convert.ts) and stored
 * by the import's own writes (./imported-theme-store.ts: media checked and
 * copied, the install within the library limit, its rows all or nothing).
 * The website agent then places and adapts Materia's real sections and only
 * writes its own code for the edge.
 *
 * Like Add, a store with no menus anywhere yet is given the template's own
 * navigation; the store's menus always win. Unlike Add, the website is not
 * marked as the marketplace listing: it becomes the creator's own site.
 *
 * Every step is injectable (`deps`) so tests run it with no files, no zip
 * and no database. Server only.
 */
import { createHash } from "node:crypto"
import JSZip from "jszip"
import type { SupabaseClient } from "@supabase/supabase-js"
import { convertShopifyTheme } from "@/lib/storelib-theme/shopify/convert"
import { CODE_THEME_PACKAGE } from "./marketplace-shared"
import { composeTemplateFiles, isCodePackageId, templateMenus, templateZipOf } from "./template-packages"
import { storeImportedTheme, type StoreFailure } from "./imported-theme-store"
import { readStoreMenus, writeStoreMenus } from "@/lib/website-builder/store-menus-server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

export type TemplateInstalled = { ok: true; installId: string; name: string; template: string }

export interface TemplateInstallDeps {
  /** The template's whole theme as a Shopify-format zip. */
  compose?: (packageId: string) => Promise<Buffer>
  /** The zip converted (the import's own conversion). */
  convert?: typeof convertShopifyTheme
  /** The converted theme stored as a website (the import's own writes). */
  store?: typeof storeImportedTheme
  /** The template's menus for a store with none. */
  menus?: (admin: Admin, creatorId: string, packageId: string) => Promise<void>
}

const FAILED = "Could not make the website from its template. Try again."

type Converted = Awaited<ReturnType<typeof convertShopifyTheme>>
type ConvertedOk = Extract<Converted, { ok: true }>

/*
  ═══════════════════════════════════════════════════════════════════════
   A TEMPLATE IS CONVERTED ONCE PER SERVER (round 27)
  ═══════════════════════════════════════════════════════════════════════
  The owner: adding a theme "takes too long". A code template's files are
  the code's: the same input every time on one deployment, so the same
  converted theme (1.0 to 1.8 s of the add, measured on clothing). It is
  kept here, the newest TEMPLATES_KEPT of them, keyed by the template and
  by what its files hold (a hash of every path and its bytes, so a release
  with other files is never the same entry). Each use gets its own report
  and its own pages and settings: storing them changes those.
*/
const TEMPLATES_KEPT = 2
const converted = new Map<string, Promise<ConvertedOk | null>>()

/** The files' fingerprint: every path and the bytes it holds. */
export function filesKey(files: ReadonlyMap<string, Buffer>): string {
  const h = createHash("sha256")
  for (const [rel, bytes] of [...files].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    h.update(rel)
    h.update("\0")
    h.update(bytes)
    h.update("\0")
  }
  return h.digest("hex")
}

/** A converted theme to store: shared files and pictures (never written to), its own report, pages and settings. */
function freshCopy(c: ConvertedOk): ConvertedOk {
  return {
    ...c,
    theme: { ...c.theme, pages: structuredClone(c.theme.pages), settings: structuredClone(c.theme.settings) },
    report: structuredClone(c.report),
  }
}

/**
 * The files of a theme converted as every Shopify-format import is, from the
 * archive object (no zip written and read back), held per server under their
 * fingerprint. Null when they do not convert.
 */
export async function convertTemplateFiles(files: ReadonlyMap<string, Buffer>, name: string, convert: typeof convertShopifyTheme = convertShopifyTheme): Promise<ConvertedOk | null> {
  const key = `${filesKey(files)}|${convert === convertShopifyTheme ? "own" : "given"}`
  let held = converted.get(key)
  if (!held) {
    held = convert(templateZipOf(files), { fallbackName: name }).then((c) => (c.ok === false ? null : (c as ConvertedOk)))
    converted.set(key, held)
    /* A failure is not kept: the next add tries again. */
    held.then((c) => { if (!c) converted.delete(key) }, () => converted.delete(key))
    while (converted.size > TEMPLATES_KEPT) converted.delete(converted.keys().next().value as string)
  } else {
    /* The newest used is the last let go. */
    converted.delete(key)
    converted.set(key, held)
  }
  const c = await held
  return c ? freshCopy(c) : null
}

/** For the tests: forget every converted template. */
export function forgetConvertedTemplates(): void {
  converted.clear()
}

/** A store with no menus anywhere is given the template's own; never over the store's. Never fails the website. */
async function templateMenusForEmptyStore(admin: Admin, creatorId: string, packageId: string): Promise<void> {
  try {
    const menus = templateMenus(packageId)
    if (menus && (await readStoreMenus(admin, creatorId)).kind === "none") await writeStoreMenus(admin, creatorId, menus)
  } catch {
    /* The website is made whatever happens to its menus. */
  }
}

/**
 * A home page with only the site's frame: the header, footer and overlay groups the converter marks
 * (convert.ts `group`). Start from blank (r63) is the default template with its sample home sections left out.
 */
export function homeChromeOnly<P extends { page_key: string; sections: { group?: unknown }[] }>(pages: P[]): P[] {
  return pages.map((p) => (p.page_key === "home" ? { ...p, sections: p.sections.filter((s) => !!s.group) } : p))
}

/** Round 69: the pages a from scratch website keeps of its template: the store's working templates, never its marketing pages. */
export const BARE_KEEPS: ReadonlySet<string> = new Set(["product", "collection", "products", "list-collections", "collections", "search", "cart", "404", "blog", "article", "password"])

/**
 * Round 69, Start with AI from scratch: the template's theme (every Materia section, its settings) with nothing of
 * its site: home empty (no header, no footer, no sections), its own pages (about, contact, faqs...) left out, the
 * store's working templates (product, collection, search, cart...) kept so the store works until the AI designs them.
 */
export function bareSite<P extends { page_key: string; sections: unknown[] }>(pages: P[]): P[] {
  return pages.filter((p) => p.page_key === "home" || BARE_KEEPS.has(p.page_key) || /^policy|policy$/.test(p.page_key)).map((p) => (p.page_key === "home" ? { ...p, sections: [] } : p))
}

/**
 * `template` is a CODE_TEMPLATES folder ("trainer"). The website is named `name`. `blankHome` keeps the template's
 * frame and every other page, and leaves its home page's own sections out (Start from blank). `bare` keeps the
 * theme and the store's templates only (Start with AI from scratch, round 69).
 */
export async function installCodeTemplate(
  admin: Admin,
  who: { userId: string; creatorId: string },
  template: string,
  opts: { name: string; blankHome?: boolean; bare?: boolean; deps?: TemplateInstallDeps },
): Promise<TemplateInstalled | StoreFailure> {
  const packageId = `${CODE_THEME_PACKAGE}/${template}`
  if (!isCodePackageId(packageId)) return { ok: false, status: 400, error: "No template has this name." }
  const deps = opts.deps ?? {}
  let theme: Awaited<ReturnType<typeof convertShopifyTheme>>
  try {
    if (deps.compose) {
      theme = await (deps.convert ?? convertShopifyTheme)(await JSZip.loadAsync(await deps.compose(packageId)), { fallbackName: opts.name })
    } else {
      /* Round 27: the template's files straight to the conversion, held per server (convertTemplateFiles); no zip in between. */
      theme = (await convertTemplateFiles(composeTemplateFiles(packageId), opts.name, deps.convert)) ?? { ok: false, error: "did not convert" }
    }
  } catch (e) {
    console.error("[themes/template-install] could not compose or convert the template", { template, error: e instanceof Error ? e.message : String(e) })
    return { ok: false, status: 500, error: FAILED }
  }
  if (theme.ok === false) {
    console.error("[themes/template-install] the template did not convert", { template })
    return { ok: false, status: 500, error: FAILED }
  }
  const converted = opts.bare ? { ...theme.theme, pages: bareSite(theme.theme.pages) } : opts.blankHome ? { ...theme.theme, pages: homeChromeOnly(theme.theme.pages) } : theme.theme
  const stored = await (deps.store ?? storeImportedTheme)(admin, who, converted, theme.report, { name: opts.name })
  if (stored.ok === false) return stored
  await (deps.menus ?? templateMenusForEmptyStore)(admin, who.creatorId, packageId)
  return { ok: true, installId: stored.installId, name: stored.name, template }
}
