import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { fileOf } from "@/lib/cart-uploads/image"
import { UUID } from "@/lib/forms/actions"
import { validateDefinition } from "@/lib/forms/definition"
import { PUBLIC_HEADERS, formError, NEEDS_SQL, noteFormsTables } from "@/lib/forms/server"
import { UPLOAD_LIMITS, formSubject } from "@/lib/forms/spam"
import { FORM_UPLOAD_MAX_BYTES, keepFormUpload } from "@/lib/forms/uploads-server"

/*
  POST /api/forms/<id>/upload, multipart: file, field, token.

  One file for one file question of a published form, checked by its
  bytes (lib/forms/uploads-server.ts) and kept privately. The answer is a
  reference signed for this form and this submission token; the response
  that names it claims it. The body is refused unread past the size cap.
*/

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: PUBLIC_HEADERS })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Form not found."), 404, PUBLIC_HEADERS)
  const declared = Number(request.headers.get("content-length") || 0)
  if (declared > FORM_UPLOAD_MAX_BYTES + 64 * 1024) return formError(new Error("Files can be up to 4 MB."), 413, PUBLIC_HEADERS)
  const limited = await rateLimit({ bucket: "native-form-upload", subjects: [formSubject(addressSubject(request), id)], windows: UPLOAD_LIMITS, message: "That is a lot of uploads. Try again in a few minutes." })
  if (limited) {
    for (const [key, value] of Object.entries(PUBLIC_HEADERS)) limited.headers.set(key, value)
    return limited
  }
  let data: FormData
  try {
    data = await request.formData()
  } catch {
    return formError(new Error("The file could not be read."), 400, PUBLIC_HEADERS)
  }
  const token = String(data.get("token") || "").toLowerCase()
  const fieldId = String(data.get("field") || "")
  const file = fileOf(data.get("file"))
  if (!UUID.test(token) || !file) return formError(new Error("Reload the form and try again."), 400, PUBLIC_HEADERS)
  const db = createAdminClient()
  const { data: form, error } = await db.from("native_forms").select("id,owner_id,published").eq("id", id).eq("status", "published").maybeSingle()
  if (noteFormsTables(error)) return NextResponse.json({ error: "This form is not available.", code: "forms_missing" }, { status: 404, headers: PUBLIC_HEADERS })
  if (error) return formError(new Error("The form could not be read. Try again."), 503, PUBLIC_HEADERS)
  if (!form?.published) return formError(new Error("This form is not available."), 404, PUBLIC_HEADERS)
  let fieldOk = false
  try {
    fieldOk = validateDefinition(form.published).fields.some((f) => f.id === fieldId && f.type === "file")
  } catch {}
  if (!fieldOk) return formError(new Error("This form has changed. Reload it before uploading."), 409, PUBLIC_HEADERS)
  const kept = await keepFormUpload(db as never, { ownerId: form.owner_id, formId: id, fieldId, token, file })
  if (kept.ok === false) {
    const failed = kept as { status: number; error: string; missing?: boolean }
    return formError(new Error(failed.missing ? NEEDS_SQL.replace("This needs", "Uploads need") : failed.error), failed.status, PUBLIC_HEADERS)
  }
  return NextResponse.json({ ref: kept.ref, name: kept.name, type: kept.type, size: kept.size }, { status: 201, headers: PUBLIC_HEADERS })
}
