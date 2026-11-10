import "server-only"

/**
 * ===========================================================================
 *  THE ADMIN'S REFERENCE LIBRARY: WHAT EACH ROUTE DOES
 * ===========================================================================
 * app/api/admin/design-references/** call these after their own
 * requireAdmin(); each handler asks again (isAdmin), so a handler reached
 * any other way still refuses. Services are passed in (database, picture
 * transformer, vision analyser, clock) so tests drive the whole flow with a
 * scripted model and an in-memory database.
 *
 *   list     every row, newest first, with what generation would use
 *   upload   one picture + a note: checked, redrawn, deduplicated by hash,
 *            stored privately, analysed by the vision model, saved
 *   patch    the admin's edits to a record (version bumped), or enabled
 *   remove   the row and its pictures
 *   analyse  run the analysis again (after a failure or a better note)
 *   image    the picture, streamed to the signed in admin (never a URL)
 *
 * Spend: one model call per upload or re-analysis, capped per hour and in
 * total (store.ts), on Storelib's key, each call's cost recorded on the row.
 */
import { NextResponse } from "next/server"

import type { AgentImage } from "@/lib/sites/agent/attachments"
import { costOf, rateFor } from "@/lib/sites/agent/models"
import type { AnalysisResult } from "./analyze"
import { referenceFromAnalysis, uploadReferenceId } from "./analyze"
import { checkReferenceImage, toBase64, type ImageTransformer } from "./ingest"
import { EDITABLE_FIELDS, MAX_ANALYSES_PER_HOUR, MAX_STORED_REFERENCES, REFERENCES_BUCKET, REFERENCES_TABLE, ROW_COLUMNS, editedRecord, forgetStoredReferences, isMissingTable, listRows, rowById, rowBySha, usableRecord, usageNow, type ReferenceRow } from "./store"
import { isReferenceId } from "./types"

type Db = { from: (table: string) => any; storage: { from: (bucket: string) => any } } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ReferenceAdminDeps {
  isAdmin: () => Promise<boolean>
  db: () => Db
  transform: ImageTransformer
  /** The vision call: the analysis pictures and the admin's note in, the coerced fields out. */
  analyze: (images: AgentImage[], notes: string) => Promise<AnalysisResult>
  now?: () => Date
}

const NO_STORE = { "Cache-Control": "no-store" }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const denied = () => json({ error: "Not signed in" }, 401)
export const NOTE_MAX = 2_000
export const SOURCE_NOTE_MAX = 300
const MISSING = "The reference library is not on this database yet. Run SQL part 431 (supabase/sql/run-now/431_design_references.sql)."

/** What the admin page shows per row: no storage path, no internal ids beyond the reference id. */
export function rowView(r: ReferenceRow) {
  return {
    id: r.id,
    version: r.version,
    status: r.status,
    enabled: r.enabled,
    usable: !!usableRecord(r),
    record: r.record,
    notes: r.notes,
    sourceNote: r.source_note,
    width: r.width,
    height: r.height,
    bytes: r.bytes,
    hasImage: !!r.view_path,
    analysisModel: r.analysis_model,
    analysisUsd: r.analysis_usd,
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
export type ReferenceRowView = ReturnType<typeof rowView>

function oneLine(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : ""
}

async function download(db: Db, path: string | null): Promise<Uint8Array | null> {
  if (!path) return null
  const { data, error } = await db.storage.from(REFERENCES_BUCKET).download(path)
  if (error || !data) return null
  return new Uint8Array(await (data as Blob).arrayBuffer())
}

export function createReferenceAdmin(deps: ReferenceAdminDeps) {
  const now = () => deps.now?.() ?? new Date()

  /** Runs the vision model on a stored row's pictures and saves what it said. */
  async function analyseRow(db: Db, row: ReferenceRow, notes: string): Promise<ReferenceRow> {
    const view = await download(db, row.view_path)
    const page = await download(db, row.page_path)
    if (!view) {
      await db.from(REFERENCES_TABLE).update({ status: "failed", error: "The picture is missing from storage.", updated_at: now().toISOString() }).eq("id", row.id)
      return { ...row, status: "failed", error: "The picture is missing from storage." }
    }
    const images: AgentImage[] = [{ mediaType: "image/jpeg", data: toBase64(view) }, ...(page ? [{ mediaType: "image/jpeg" as const, data: toBase64(page) }] : [])]
    const result = await deps.analyze(images, notes).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "The analysis failed.", usage: { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }, model: "unknown" }) as AnalysisResult)
    const usd = rateFor(result.model) ? costOf(result.model, result.usage).usd : null
    const at = now()
    const patch: Record<string, unknown> = { analysis_model: result.model, analysis_usd: usd, analysed_at: at.toISOString(), updated_at: at.toISOString() }
    if (result.ok && result.fields) {
      const record = referenceFromAnalysis({
        fields: result.fields,
        sha256: row.image_sha256,
        image: { path: row.view_path!, mediaType: "image/jpeg", width: row.width, height: row.height },
        sourceNote: row.source_note,
        model: result.model,
        now: at,
        version: row.record ? row.record.version + 1 : 1,
        enabled: row.enabled,
      })
      Object.assign(patch, { status: "ready", record, version: record.version, error: null })
    } else {
      Object.assign(patch, { status: "failed", error: (result.error ?? "The analysis failed.").slice(0, 300) })
    }
    const { data, error } = await db.from(REFERENCES_TABLE).update(patch).eq("id", row.id).select(ROW_COLUMNS).maybeSingle()
    forgetStoredReferences()
    if (error || !data) return { ...row, ...(patch as Partial<ReferenceRow>) }
    return data as ReferenceRow
  }

  async function capped(db: Db): Promise<string | null> {
    const u = await usageNow(db, now())
    if (u.total >= MAX_STORED_REFERENCES) return `The library holds at most ${MAX_STORED_REFERENCES} pictures. Remove some first.`
    if (u.lastHour >= MAX_ANALYSES_PER_HOUR) return `At most ${MAX_ANALYSES_PER_HOUR} analyses an hour. Try again later.`
    return null
  }

  return {
    async list(): Promise<NextResponse> {
      if (!(await deps.isAdmin())) return denied()
      try {
        const { rows, missing } = await listRows(deps.db())
        return json({ references: rows.map(rowView), missing: missing ? MISSING : null })
      } catch {
        return json({ error: "The references could not be read." }, 500)
      }
    },

    async upload(req: Request): Promise<NextResponse> {
      if (!(await deps.isAdmin())) return denied()
      if (Number(req.headers.get("content-length") ?? 0) > 4.4 * 1024 * 1024) return json({ error: "Pictures can be up to 4 MB." }, 413)
      let form: FormData
      try {
        form = await req.formData()
      } catch {
        return json({ error: "No picture arrived." }, 400)
      }
      const file = form.get("file")
      if (!(file instanceof Blob) || file.size === 0) return json({ error: "No picture arrived." }, 400)
      const notes = oneLine(form.get("notes"), NOTE_MAX)
      /* A link the admin types is kept as a note about where the picture came from. Nothing fetches it. */
      const sourceNote = oneLine(form.get("source"), SOURCE_NOTE_MAX) || null
      const checked = await checkReferenceImage({ name: (file as File).name || "reference", type: file.type || "", bytes: new Uint8Array(await file.arrayBuffer()) }, deps.transform)
      if (checked.ok === false) return json({ error: checked.error }, checked.status)

      const db = deps.db()
      const existing = await rowBySha(db, checked.sha256).catch(() => null)
      if (existing) return json({ ok: true, duplicate: true, reference: rowView(existing) })
      const cap = await capped(db).catch(() => null)
      if (cap) return json({ error: cap }, 429)

      const id = uploadReferenceId(checked.sha256)
      const dir = `references/${checked.sha256.slice(0, 2)}/${checked.sha256}`
      const d = checked.derivatives
      const put = async (name: string, bytes: Uint8Array) => {
        const { error } = await db.storage.from(REFERENCES_BUCKET).upload(`${dir}/${name}`, Buffer.from(bytes), { contentType: "image/jpeg", upsert: true, cacheControl: "3600" })
        if (error) throw new Error(String(error.message ?? "upload failed"))
        return `${dir}/${name}`
      }
      let paths: { original: string; view: string; page: string | null }
      try {
        paths = { original: await put("original.jpg", d.original), view: await put("view.jpg", d.view), page: d.page ? await put("page.jpg", d.page) : null }
      } catch (e) {
        console.error(`[references] storage: ${e instanceof Error ? e.message.slice(0, 200) : "upload failed"}`)
        return json({ error: "The picture did not upload. Check that SQL part 431 ran (it makes the private bucket), then try again." }, 500)
      }
      const at = now().toISOString()
      const { data: inserted, error } = await db
        .from(REFERENCES_TABLE)
        .insert({ id, version: 1, status: "analyzing", enabled: true, record: null, notes: notes || null, source_note: sourceNote, image_sha256: checked.sha256, original_path: paths.original, view_path: paths.view, page_path: paths.page, width: checked.width, height: checked.height, bytes: d.original.byteLength, created_at: at, updated_at: at })
        .select(ROW_COLUMNS)
        .maybeSingle()
      if (error || !inserted) {
        if (isMissingTable(error)) return json({ error: MISSING }, 503)
        /* Two uploads of the same picture at once: the other one won. */
        const again = await rowBySha(db, checked.sha256).catch(() => null)
        if (again) return json({ ok: true, duplicate: true, reference: rowView(again) })
        return json({ error: "The reference was not saved. Try again." }, 500)
      }
      const analysed = await analyseRow(db, inserted as ReferenceRow, notes)
      return json({ ok: analysed.status === "ready", reference: rowView(analysed), ...(analysed.status === "failed" ? { error: `Saved, but the analysis failed: ${analysed.error}` } : {}) }, 200)
    },

    async patch(req: Request, id: string): Promise<NextResponse> {
      if (!(await deps.isAdmin())) return denied()
      if (!isReferenceId(id)) return json({ error: "No reference has this id." }, 404)
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
      if (!body || typeof body !== "object") return json({ error: "Nothing to change." }, 400)
      const db = deps.db()
      const row = await rowById(db, id)
      if (!row) return json({ error: "No reference has this id." }, 404)
      const patch: Record<string, unknown> = { updated_at: now().toISOString() }
      if (typeof body.enabled === "boolean") {
        patch.enabled = body.enabled
        if (row.record) patch.record = { ...row.record, enabled: body.enabled }
      }
      if (typeof body.notes === "string") patch.notes = oneLine(body.notes, NOTE_MAX) || null
      const edits = (body.record ?? {}) as Record<string, unknown>
      if (Object.keys(edits).some((k) => (EDITABLE_FIELDS as readonly string[]).includes(k))) {
        if (!row.record) return json({ error: "Analyse the picture first, then edit what it says." }, 409)
        const { record, problems } = editedRecord({ ...row.record, enabled: (patch.enabled as boolean | undefined) ?? row.enabled }, edits)
        if (!record) return json({ error: `That edit is not valid: ${problems.slice(0, 3).join("; ")}` }, 400)
        patch.record = record
        patch.version = record.version
      }
      const { data, error } = await db.from(REFERENCES_TABLE).update(patch).eq("id", id).select(ROW_COLUMNS).maybeSingle()
      if (error || !data) return json({ error: "The change was not saved. Try again." }, 500)
      forgetStoredReferences()
      return json({ ok: true, reference: rowView(data as ReferenceRow) })
    },

    async remove(id: string): Promise<NextResponse> {
      if (!(await deps.isAdmin())) return denied()
      if (!isReferenceId(id)) return json({ error: "No reference has this id." }, 404)
      const db = deps.db()
      const row = await rowById(db, id)
      if (!row) return json({ ok: true })
      const paths = [row.original_path, row.view_path, row.page_path].filter((p): p is string => !!p)
      if (paths.length) await db.storage.from(REFERENCES_BUCKET).remove(paths).then(() => null, () => null)
      const { error } = await db.from(REFERENCES_TABLE).delete().eq("id", id)
      if (error) return json({ error: "The reference was not removed. Try again." }, 500)
      forgetStoredReferences()
      return json({ ok: true })
    },

    async analyse(id: string): Promise<NextResponse> {
      if (!(await deps.isAdmin())) return denied()
      if (!isReferenceId(id)) return json({ error: "No reference has this id." }, 404)
      const db = deps.db()
      const row = await rowById(db, id)
      if (!row) return json({ error: "No reference has this id." }, 404)
      const cap = await capped(db).catch(() => null)
      if (cap && !cap.includes("holds at most")) return json({ error: cap }, 429)
      const analysed = await analyseRow(db, row, row.notes ?? "")
      return json({ ok: analysed.status === "ready", reference: rowView(analysed), ...(analysed.status === "failed" ? { error: `The analysis failed: ${analysed.error}` } : {}) })
    },

    async image(id: string, which: "view" | "original"): Promise<Response> {
      if (!(await deps.isAdmin())) return denied()
      if (!isReferenceId(id)) return json({ error: "No reference has this id." }, 404)
      const db = deps.db()
      const row = await rowById(db, id)
      const bytes = row ? await download(db, which === "original" ? row.original_path : row.view_path) : null
      if (!bytes) return json({ error: "No picture." }, 404)
      return new Response(Buffer.from(bytes), { status: 200, headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } })
    },
  }
}
