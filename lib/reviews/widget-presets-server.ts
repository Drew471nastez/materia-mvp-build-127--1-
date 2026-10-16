import "server-only"

/**
 * ===========================================================================
 *  STORELIB REVIEWS WIDGETS: THE SAVED ONES
 * ===========================================================================
 * A store's named settings for a review widget (run-now part 205,
 * review_widget_presets), read and written with the service role for the
 * store the signed in owner runs (app/api/reviews/widgets/presets). What a
 * preset may hold is decided by lib/reviews/widgets.ts against the widget's
 * own section schema, so nothing stored can draw a setting the section does
 * not have.
 *
 * Before part 205 runs the table is not there: a read answers no presets and
 * `ready: false`, and a write says which part to run. Never a table name in
 * a message the store reads.
 */
import { STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { MAX_PRESET_BYTES, MAX_PRESETS, REVIEW_WIDGET_TYPES, cleanPresetName, cleanPresetSettings, type PresetField, type WidgetPreset } from "./widgets"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
type PgError = { code?: string; message?: string } | null | undefined

const COLUMNS = "id, widget, name, settings, created_at, updated_at"

export const PRESETS_NEED_SQL = "Saving widgets needs SQL part 205. Run it in Supabase, then try again."

/** The table is not there yet (part 205 not run). */
export function missingTable(error: PgError): boolean {
  const code = String(error?.code ?? "")
  return code === "42P01" || code === "PGRST205" || code === "PGRST200"
}

/** The settings a widget's section has, as a preset checks them. */
export function widgetFields(widget: string): PresetField[] | null {
  if (!REVIEW_WIDGET_TYPES.includes(widget)) return null
  const schema = STORELIB_SCHEMAS[widget]
  if (!schema) return null
  return (schema.fields ?? []).map((f) => ({
    id: f.id,
    type: f.type,
    options: Array.isArray(f.options) ? f.options.map((o) => ({ value: String((o as { value?: unknown }).value ?? "") })) : undefined,
    min: typeof f.min === "number" ? f.min : undefined,
    max: typeof f.max === "number" ? f.max : undefined,
    responsive: f.responsive === true,
  }))
}

function toPreset(row: Record<string, unknown>): WidgetPreset {
  return {
    id: String(row.id),
    widget: String(row.widget),
    name: String(row.name),
    settings: row.settings && typeof row.settings === "object" && !Array.isArray(row.settings) ? (row.settings as Record<string, unknown>) : {},
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  }
}

export async function listPresets(db: Db, creatorId: string): Promise<{ ready: boolean; presets: WidgetPreset[] }> {
  const { data, error } = await db.from("review_widget_presets").select(COLUMNS).eq("creator_id", creatorId).order("updated_at", { ascending: false }).limit(MAX_PRESETS)
  if (error) return { ready: !missingTable(error), presets: [] }
  return { ready: true, presets: ((data ?? []) as Record<string, unknown>[]).map(toPreset) }
}

export async function readPreset(db: Db, creatorId: string, id: string): Promise<WidgetPreset | null> {
  const { data, error } = await db.from("review_widget_presets").select(COLUMNS).eq("creator_id", creatorId).eq("id", id).maybeSingle()
  if (error || !data) return null
  return toPreset(data as Record<string, unknown>)
}

export type PresetWrite = { ok: true; preset: WidgetPreset } | { ok: false; status: number; error: string }

/** What a create or an update was sent, checked. */
export function checkPresetInput(body: Record<string, unknown> | null, opts: { widget?: string } = {}): { ok: true; widget: string; name: string | null; settings: Record<string, unknown> | null } | { ok: false; error: string } {
  const widget = opts.widget ?? (typeof body?.widget === "string" ? body.widget : "")
  const fields = widgetFields(widget)
  if (!fields) return { ok: false, error: "That widget does not exist." }
  const name = body && "name" in body ? cleanPresetName(body.name) : null
  if (body && "name" in body && !name) return { ok: false, error: "Give it a name." }
  const settings = body && "settings" in body ? cleanPresetSettings(body.settings, fields) : null
  if (settings && JSON.stringify(settings).length > MAX_PRESET_BYTES) return { ok: false, error: "Those settings are too large to save." }
  return { ok: true, widget, name, settings }
}

function failure(error: PgError): { ok: false; status: number; error: string } {
  if (missingTable(error)) return { ok: false, status: 503, error: PRESETS_NEED_SQL }
  if (String(error?.code) === "23505") return { ok: false, status: 409, error: "You already have a saved widget with that name." }
  return { ok: false, status: 500, error: "That could not be saved. Try again in a moment." }
}

export async function createPreset(db: Db, creatorId: string, input: { widget: string; name: string; settings: Record<string, unknown> }): Promise<PresetWrite> {
  const { count, error: countError } = await db.from("review_widget_presets").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)
  if (countError) return failure(countError)
  if ((count ?? 0) >= MAX_PRESETS) return { ok: false, status: 409, error: `You can keep up to ${MAX_PRESETS} saved widgets. Delete one first.` }
  const { data, error } = await db.from("review_widget_presets").insert({ creator_id: creatorId, widget: input.widget, name: input.name, settings: input.settings }).select(COLUMNS).single()
  if (error || !data) return failure(error)
  return { ok: true, preset: toPreset(data as Record<string, unknown>) }
}

export async function updatePreset(db: Db, creatorId: string, id: string, patch: { name?: string | null; settings?: Record<string, unknown> | null }): Promise<PresetWrite> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name) row.name = patch.name
  if (patch.settings) row.settings = patch.settings
  const { data, error } = await db.from("review_widget_presets").update(row).eq("creator_id", creatorId).eq("id", id).select(COLUMNS).maybeSingle()
  if (error) return failure(error)
  if (!data) return { ok: false, status: 404, error: "That saved widget is gone." }
  return { ok: true, preset: toPreset(data as Record<string, unknown>) }
}

export async function deletePreset(db: Db, creatorId: string, id: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { error } = await db.from("review_widget_presets").delete().eq("creator_id", creatorId).eq("id", id)
  if (error) return failure(error)
  return { ok: true }
}
