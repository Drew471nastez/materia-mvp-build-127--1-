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
import JSZip from "jszip"
import type { SupabaseClient } from "@supabase/supabase-js"
import { convertShopifyTheme } from "@/lib/storelib-theme/shopify/convert"
import { CODE_THEME_PACKAGE } from "./marketplace-shared"
import { composeTemplateZip, isCodePackageId, templateMenus } from "./template-packages"
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

/**
 * `template` is a CODE_TEMPLATES folder ("trainer"). The website is named `name`. `blankHome` keeps the template's
 * frame and every other page, and leaves its home page's own sections out (Start from blank).
 */
export async function installCodeTemplate(
  admin: Admin,
  who: { userId: string; creatorId: string },
  template: string,
  opts: { name: string; blankHome?: boolean; deps?: TemplateInstallDeps },
): Promise<TemplateInstalled | StoreFailure> {
  const packageId = `${CODE_THEME_PACKAGE}/${template}`
  if (!isCodePackageId(packageId)) return { ok: false, status: 400, error: "No template has this name." }
  const deps = opts.deps ?? {}
  let theme: Awaited<ReturnType<typeof convertShopifyTheme>>
  try {
    const zip = await (deps.compose ?? composeTemplateZip)(packageId)
    theme = await (deps.convert ?? convertShopifyTheme)(await JSZip.loadAsync(zip), { fallbackName: opts.name })
  } catch (e) {
    console.error("[themes/template-install] could not compose or convert the template", { template, error: e instanceof Error ? e.message : String(e) })
    return { ok: false, status: 500, error: FAILED }
  }
  if (theme.ok === false) {
    console.error("[themes/template-install] the template did not convert", { template })
    return { ok: false, status: 500, error: FAILED }
  }
  const converted = opts.blankHome ? { ...theme.theme, pages: homeChromeOnly(theme.theme.pages) } : theme.theme
  const stored = await (deps.store ?? storeImportedTheme)(admin, who, converted, theme.report, { name: opts.name })
  if (stored.ok === false) return stored
  await (deps.menus ?? templateMenusForEmptyStore)(admin, who.creatorId, packageId)
  return { ok: true, installId: stored.installId, name: stored.name, template }
}
