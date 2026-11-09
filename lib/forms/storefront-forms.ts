/**
 * ===========================================================================
 *  THE FORMS A WEBSITE SECTION MAY NAME (form_picker)
 * ===========================================================================
 * A section setting of type `form_picker` holds a native form's id. What the
 * template may read about it is read here, on the server, with three checks
 * that decide whether there is anything to draw at all:
 *
 *   whose   the form's owner is the website's creator's user, so a section
 *           holding somebody else's id resolves empty (resolve.ts formRef)
 *   what    published (status "published" with a published definition)
 *   how     public facts only: id, title, kind and its own page
 *
 * The database is passed in (the service role on the live site, after the
 * site was found by its own address; the builder's route after its
 * ownership check), so the rule is driven in tests with a stand in.
 * Every read is bounded and a read that fails is "no forms", never an error.
 */
import { formKind } from "./kind"
import type { FormDefinition } from "./definition"
import type { StorefrontForm } from "@/lib/storelib-theme/types"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The most forms one read returns. A builder list and a page both stay small. */
export const MAX_SITE_FORMS = 50

export interface FormRow {
  id: string
  owner_id?: string | null
  title?: string | null
  status?: string | null
  published?: unknown
}

/** One published row as a section reads it; null for anything that is not live. */
export function storefrontForm(row: FormRow): StorefrontForm | null {
  if (!row || typeof row.id !== "string" || !UUID_RE.test(row.id)) return null
  if (row.status !== "published" || !row.published || typeof row.published !== "object") return null
  const def = row.published as Partial<FormDefinition>
  const kind = formKind(def)
  const title = String(row.title || (def as { title?: unknown }).title || "Form").replace(/\s+/g, " ").trim().slice(0, 160)
  const id = row.id.toLowerCase()
  return { id, title, kind, booking: kind === "booking", url: `/request/forms/${id}` }
}

/** The rows as the engine's `forms` map, by id. Rows owned by anybody but `ownerUserId` are dropped. */
export function storefrontFormsFrom(rows: readonly FormRow[] | null | undefined, ownerUserId: string): Record<string, StorefrontForm> {
  const out: Record<string, StorefrontForm> = {}
  for (const row of rows ?? []) {
    if (!row || row.owner_id !== ownerUserId) continue
    const f = storefrontForm(row)
    if (f) out[f.id] = f
  }
  return out
}

/** The creator's user, whose forms these are (native_forms.owner_id). */
export async function creatorUserId(db: Db, creatorId: string): Promise<string | null> {
  try {
    const { data } = await db.from("creators").select("user_id").eq("id", creatorId).maybeSingle()
    const id = (data as { user_id?: unknown } | null)?.user_id
    return typeof id === "string" && id ? id : null
  } catch {
    return null
  }
}

/**
 * The creator's published forms: the ones `ids` names (a page), or the
 * newest MAX_SITE_FORMS of them (`"all"`: the builder's picker, the
 * agent's capabilities). `ownerUserId` may be given when the caller already
 * knows it; otherwise it is read from the creator.
 */
export async function storefrontForms(
  db: Db,
  creatorId: string,
  ids: readonly string[] | "all",
  ownerUserId?: string | null,
): Promise<Record<string, StorefrontForm>> {
  if (!creatorId) return {}
  const wanted = ids === "all" ? "all" : [...new Set(ids.map((x) => x.trim().toLowerCase()).filter((x) => UUID_RE.test(x)))].slice(0, MAX_SITE_FORMS)
  if (wanted !== "all" && wanted.length === 0) return {}
  const owner = ownerUserId ?? (await creatorUserId(db, creatorId))
  if (!owner) return {}
  try {
    let q = db.from("native_forms").select("id, owner_id, title, status, published").eq("owner_id", owner).eq("status", "published")
    q = wanted === "all" ? q.order("created_at", { ascending: false }).limit(MAX_SITE_FORMS) : q.in("id", wanted)
    const { data, error } = await q
    if (error) return {}
    return storefrontFormsFrom((data ?? []) as FormRow[], owner)
  } catch {
    return {}
  }
}
