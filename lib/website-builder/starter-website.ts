/**
 * ===========================================================================
 *  A NEW ACCOUNT ALREADY HAS A WEBSITE TO OPEN
 * ===========================================================================
 * The first visit to /app/website-builder used to call the database's
 * `initialize_creator_themes`, which installed three themes with sections
 * written by hand in 2026's first migration, and PUBLISHED one of them. On a
 * database where that function was missing or failed, the page drew
 * "Nothing is live" over an empty library: a dead end with nothing to open.
 *
 * Now the first visit installs Storelib Default the same way Browse themes
 * adds a template (lib/themes/template-install.ts): the Materia template
 * Browse themes shows as Storelib Default, the Sundry sample shop
 * (lib/themes/marketplace-shared.ts DEFAULT_CODE_TEMPLATE), with its pages,
 * settings, files and pictures. As a DRAFT. Nothing goes live until the
 * creator presses Publish.
 *
 * Changed on purpose (r63): it used to install the native registry theme of
 * the same name (theme-registry.ts STORELIB_DEFAULT_ID), the old default with
 * the indigo hero, which Browse themes no longer offers. Websites already made
 * from it are never touched here.
 *
 * WHEN. Only while the creator's library is empty. That is a new account, an
 * account from before this existed whose seed never ran, and a library whose
 * every website was removed; all three get the same starting point on their
 * next visit. A library with anything in it is never touched.
 *
 * NEVER TWICE. Two visits at once (two tabs, a prefetch beside a click) can
 * both find the library empty and both install. Each then reads the starter
 * installs back, oldest first, and the one that is not first removes itself.
 * Both answer with the same keeper.
 *
 * NEVER BREAKS THE PAGE. Every failure is logged by code and answered with
 * `created: false`; the page then draws what the database has, which for an
 * empty library is the Add theme way in.
 *
 * Server only: it writes with the service role. The creator id and the
 * owner's user id (whose media folder the template's pictures go in) come
 * from the signed-in caller, never from a request.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { DEFAULT_CODE_TEMPLATE, DEFAULT_TEMPLATE_NAME } from "@/lib/themes/marketplace-shared"
import { installCodeTemplate } from "@/lib/themes/template-install"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** The template a new account starts with: the current Storelib Default (theme-packages/materia/templates/default). */
export const STARTER_TEMPLATE = DEFAULT_CODE_TEMPLATE
/** The starter website's name, Browse themes' own for it. */
export const STARTER_NAME = DEFAULT_TEMPLATE_NAME

/** Whether a library of this size gets a starter: empty only, and never on a count that could not be read. */
export function needsStarter(count: number | null | undefined): boolean {
  return count === 0
}

/**
 * Of the starter installs that exist for a creator, the one that stays: the
 * oldest, and the smaller id when two were made in the same instant. Every
 * concurrent request computes the same answer from the same rows.
 */
export function starterKeeper(rows: { id: string; created_at?: string | null }[]): string | null {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => {
    const ta = Date.parse(a.created_at ?? "") || 0
    const tb = Date.parse(b.created_at ?? "") || 0
    if (ta !== tb) return ta - tb
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return sorted[0].id
}

export interface StarterResult {
  created: boolean
  installId: string | null
}

const NONE: StarterResult = { created: false, installId: null }

export interface StarterDeps {
  /** The template's import, as Browse themes and Start with AI make one. A test passes its own. */
  install?: typeof installCodeTemplate
}

/**
 * Installs Storelib Default as a draft when the creator has no website.
 * Idempotent; see the note at the top of this file.
 */
export async function ensureStarterWebsite(db: Db, creatorId: string, who: { userId: string }, deps: StarterDeps = {}): Promise<StarterResult> {
  if (!creatorId || !who?.userId) return NONE
  try {
    const { count, error: countErr } = await db
      .from("store_theme_installs")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", creatorId)
    if (countErr || !needsStarter(count)) return NONE

    const made = await (deps.install ?? installCodeTemplate)(db as unknown as SupabaseClient, { userId: who.userId, creatorId }, STARTER_TEMPLATE, { name: STARTER_NAME })
    if (made.ok === false) {
      console.error("[starter-website] could not install the default template", { status: made.status, code: made.code })
      return NONE
    }
    const installId = made.installId

    /* Another request made one at the same moment: the older one stays. The library was empty, so every starter-named install is one of these. */
    const { data: twins } = await db
      .from("store_theme_installs")
      .select("id, created_at")
      .eq("creator_id", creatorId)
      .eq("name", STARTER_NAME)
      .order("created_at", { ascending: true })
      .limit(10)
    const keeper = starterKeeper((twins ?? []) as { id: string; created_at?: string | null }[]) ?? installId
    if (keeper !== installId) {
      await db.from("store_theme_installs").delete().eq("id", installId)
      return { created: false, installId: keeper }
    }
    return { created: true, installId }
  } catch (e) {
    console.error("[starter-website] failed", { message: e instanceof Error ? e.name : "unknown" })
    return NONE
  }
}
