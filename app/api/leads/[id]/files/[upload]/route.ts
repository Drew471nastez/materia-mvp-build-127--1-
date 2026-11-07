import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { formActor, formError } from "@/lib/forms/server"
import { UUID } from "@/lib/forms/actions"
import { FORM_UPLOAD_BUCKET, OWNER_LINK_SECONDS } from "@/lib/forms/uploads-server"

/*
  GET /api/leads/<lead>/files/<upload>: the owner's own file, through a
  signed link that lasts a minute and downloads rather than renders. The
  row is read as the owner (RLS), so another creator's ids find nothing.
*/
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; upload: string }> }) {
  const { id, upload } = await params
  if (!UUID.test(id) || !UUID.test(upload)) return formError(new Error("File not found."), 404)
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const { data: row } = await actor.db.from("form_uploads").select("path,file_name").eq("id", upload).eq("submission_id", id).eq("owner_id", actor.user.id).maybeSingle()
  if (!row || !String(row.path).startsWith(`${actor.user.id}/`) || String(row.path).includes("..")) return formError(new Error("File not found."), 404)
  const { data, error } = await createAdminClient().storage.from(FORM_UPLOAD_BUCKET).createSignedUrl(row.path, OWNER_LINK_SECONDS, { download: row.file_name })
  if (error || !data?.signedUrl) return formError(new Error("The file could not be opened. Try again."), 503)
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
}
