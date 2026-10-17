import "server-only"

/**
 * ===========================================================================
 *  STORELIB REVIEWS WIDGETS: THE SAVED CONFIGURATIONS
 * ===========================================================================
 * review_widget_configs (run-now part 216): one row per named look of a
 * widget, the store's own. Written only here, with the server's key, after
 * the caller was checked as the store's owner (or a teammate with the
 * store area: lib/physical/auth shopCaller). Read for a website by the
 * server only, cleaned again (./config.ts readWidgetConfigRow), and held a
 * minute under the creator's tag like the reviews themselves, which a save
 * clears.
 *
 * Before part 216 runs there is no table: the list is empty, saving says
 * which part it needs, and every widget draws with its defaults.
 */
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { creatorTag } from "@/lib/commerce/product-page-cache"
import { MAX_CONFIGS_PER_STORE, cleanWidgetConfigInput, readWidgetConfigRow, type WidgetConfig } from "./config"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const TABLE = "review_widget_configs"
const COLUMNS = "id, type, name, settings, updated_at"
export const WIDGETS_SQL_PART = "216"

const missingTable = (e: { code?: string } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST204")

export async function listWidgetConfigs(db: Db, creatorId: string): Promise<{ configs: WidgetConfig[]; ready: boolean }> {
  const { data, error } = await db.from(TABLE).select(COLUMNS).eq("creator_id", creatorId).order("updated_at", { ascending: false }).limit(MAX_CONFIGS_PER_STORE)
  if (error) return { configs: [], ready: !missingTable(error) }
  return { configs: ((data ?? []) as unknown[]).map(readWidgetConfigRow).filter((c): c is WidgetConfig => !!c), ready: true }
}

export type SaveResult = { ok: true; config: WidgetConfig } | { ok: false; error: string; status: number }

function failure(error: { code?: string } | null | undefined): SaveResult {
  if (missingTable(error)) return { ok: false, error: `Saved widgets need the database update. Run SQL part ${WIDGETS_SQL_PART}, then try again.`, status: 503 }
  if (error?.code === "23514") return { ok: false, error: "One of the values is out of range.", status: 400 }
  return { ok: false, error: "That could not be saved. Try again in a moment.", status: 500 }
}

export async function createWidgetConfig(db: Db, creatorId: string, body: unknown): Promise<SaveResult> {
  const clean = cleanWidgetConfigInput(body)
  if (!clean.ok) return { ok: false, error: "error" in clean ? clean.error : "Bad request.", status: 400 }
  const { count, error: countError } = await db.from(TABLE).select("id", { count: "exact", head: true }).eq("creator_id", creatorId)
  if (countError) return failure(countError)
  if ((count ?? 0) >= MAX_CONFIGS_PER_STORE) return { ok: false, error: `You can keep up to ${MAX_CONFIGS_PER_STORE} saved widgets. Delete one first.`, status: 400 }
  const { data, error } = await db.from(TABLE).insert({ creator_id: creatorId, type: clean.type, name: clean.name, settings: clean.settings }).select(COLUMNS).single()
  if (error) return failure(error)
  const config = readWidgetConfigRow(data)
  return config ? { ok: true, config } : failure(null)
}

export async function updateWidgetConfig(db: Db, creatorId: string, id: string, body: unknown): Promise<SaveResult> {
  const { data: row, error: readError } = await db.from(TABLE).select("id, type").eq("id", id).eq("creator_id", creatorId).maybeSingle()
  if (readError) return failure(readError)
  if (!row) return { ok: false, error: "That widget is gone.", status: 404 }
  /* The type stays what it was: a section that names this configuration draws the widget it was made for. */
  const clean = cleanWidgetConfigInput({ ...(body as object), type: (row as { type: string }).type })
  if (!clean.ok) return { ok: false, error: "error" in clean ? clean.error : "Bad request.", status: 400 }
  const { data, error } = await db
    .from(TABLE)
    .update({ name: clean.name, settings: clean.settings, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("creator_id", creatorId)
    .select(COLUMNS)
    .single()
  if (error) return failure(error)
  const config = readWidgetConfigRow(data)
  return config ? { ok: true, config } : failure(null)
}

export async function deleteWidgetConfig(db: Db, creatorId: string, id: string): Promise<{ ok: boolean; error?: string; status?: number }> {
  const { error } = await db.from(TABLE).delete().eq("id", id).eq("creator_id", creatorId)
  if (error) {
    const f = failure(error)
    return "error" in f ? { ok: false, error: f.error, status: f.status } : { ok: true }
  }
  return { ok: true }
}

/** What a page hands its widgets: each configuration's type and settings, by id. Nothing else of the row. */
export type PublicWidgetConfigs = Record<string, { type: string; settings: WidgetConfig["settings"] }>

export function publicConfigs(configs: WidgetConfig[]): PublicWidgetConfigs {
  return Object.fromEntries(configs.map((c) => [c.id, { type: c.type, settings: c.settings }]))
}

/** For a published page: held a minute under the creator's tag (a save clears it). Never throws. */
export function cachedWidgetConfigs(creatorId: string): Promise<PublicWidgetConfigs> {
  return unstable_cache(
    async () => {
      try {
        return publicConfigs((await listWidgetConfigs(createAdminClient(), creatorId)).configs)
      } catch {
        return {}
      }
    },
    ["review-widget-configs", creatorId],
    { revalidate: 60, tags: [creatorTag(creatorId)] },
  )().catch(() => ({}))
}
