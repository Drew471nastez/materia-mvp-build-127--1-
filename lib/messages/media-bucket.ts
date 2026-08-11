import "server-only"

import type { createAdminClient } from "@/lib/supabase/admin"

/**
 * ===========================================================================
 *  THE BUCKET MESSAGE PHOTOGRAPHS LIVE IN
 * ===========================================================================
 *
 * THE BUG THIS EXISTS TO CLOSE: sending a voice note failed with
 *
 *     Încărcarea a eșuat: mime type audio/webm is not supported
 *
 * Nothing in the voice route was wrong. The `messages` bucket is declared in
 * SQL — supabase/migrations/20260806_message_images_and_safety.sql, and the
 * RUN_*.sql files that carry it — and it was declared
 *
 *     allowed_mime_types = array['image/jpeg', 'image/png', …]
 *
 * back when a photograph was the only thing anyone could attach. Storage
 * enforces that list, so every voice note was refused by the BUCKET, before a
 * line of this application's code ran.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ALLOWLIST IS GONE RATHER THAN LONGER
 * ---------------------------------------------------------------------------
 * Adding the audio types would have fixed today and guaranteed tomorrow: the
 * next attachment kind hits the identical wall, in a place nobody looks, with an
 * error that blames the upload. And it would have to be added in two languages —
 * the SQL that declares the bucket and any code that repairs it — which is one
 * definition kept in two places, agreeing only by luck.
 *
 * What the list actually checked, in any case, was the content type the CLIENT
 * declared. That is a label, not a fact. Both message routes sniff the
 * container's magic bytes and refuse anything that is not really the kind of
 * file it claims to be, which is a strictly stronger gate — so the bucket's list
 * never caught a disguised file, only honest ones. It is now NULL, exactly as
 * the buckets in complete_upload_system.sql are, and for the reason written
 * there: the app layer validates.
 *
 * ---------------------------------------------------------------------------
 * AND IT REPAIRS A BUCKET THAT IS ALREADY WRONG
 * ---------------------------------------------------------------------------
 * Fixing the SQL fixes every database it is run against, and no others. Every
 * deployment already carrying the narrow bucket stays broken until somebody
 * pastes it — so a refusal that names a MIME type is treated as exactly what it
 * is, the bucket's own list, which is cleared before the upload is retried once.
 *
 * If that repair ITSELF fails, that is what gets reported. The previous attempt
 * at this fix ignored the result of the repair, so a repair that could not run
 * came back as the original refusal — the same misleading sentence, now with a
 * fix in the tree that appeared to have failed for no reason.
 */

/** The bucket message photographs are written to. Private. */
export const MESSAGES_BUCKET = "messages"

/** 10MB covers a phone photograph. */
export const MESSAGES_BUCKET_LIMIT = 10 * 1024 * 1024

/**
 * No bucket-level type gate — see above. `null` is how storage spells "accept
 * anything"; the routes are what decide, from the bytes.
 */
const BUCKET_CONFIG = {
  public: false,
  fileSizeLimit: MESSAGES_BUCKET_LIMIT,
  allowedMimeTypes: null,
}

/** Storage says this when the bucket's own allowlist is what refused the file. */
export function isMimeRefusal(message: string | null | undefined): boolean {
  return /mime type .* is not supported/i.test(message ?? "")
}

export function isMissingBucket(message: string | null | undefined): boolean {
  return /bucket.*not.*found/i.test(message ?? "")
}

type Admin = ReturnType<typeof createAdminClient>

/**
 * Upload, and fix the bucket if the bucket is what refused it.
 *
 * Two recoveries, each tried once:
 *
 *   no bucket      create it. A bucket is not schema — there is no data in it
 *                  to migrate and nothing to get wrong — so a missing one is a
 *                  dead end rather than a decision.
 *
 *   wrong MIME     clear the existing one's allowlist and retry. This is the
 *                  case that cannot be fixed by deploying code, because the
 *                  narrow list is already sitting in storage on every database
 *                  the old SQL was ever run against.
 *
 * Anything else is handed straight back. Retrying a quota error against a
 * rewritten bucket would turn one clear failure into two unclear ones.
 */
export async function uploadMessageMedia(
  admin: Admin,
  path: string,
  file: File | Blob,
  contentType: string,
): Promise<{ error: { message: string } | null }> {
  const put = () =>
    admin.storage
      .from(MESSAGES_BUCKET)
      .upload(path, file as File, { contentType, cacheControl: "31536000", upsert: false })

  let { error } = await put()
  if (!error) return { error: null }

  const repair = isMissingBucket(error.message)
    ? { what: "create" as const, run: () => admin.storage.createBucket(MESSAGES_BUCKET, BUCKET_CONFIG) }
    : isMimeRefusal(error.message)
      ? { what: "widen" as const, run: () => admin.storage.updateBucket(MESSAGES_BUCKET, BUCKET_CONFIG) }
      : null

  if (!repair) return { error }

  const { error: repairErr } = await repair.run()
  if (repairErr) {
    // THE FAILURE THAT MUST NOT LOOK LIKE THE ORIGINAL ONE.
    //
    // The service role can normally do this. When it cannot — a restricted key,
    // a storage version that will not take the update — returning the upload's
    // refusal would say "mime type audio/webm is not supported" for a second
    // time, which is exactly the sentence that already sent somebody looking in
    // the wrong place. It says what could not be done, and where the fix is.
    console.error(`[messages] bucket ${repair.what} failed:`, repairErr)
    return {
      error: {
        message: `${error.message} — bucket-ul nu a putut fi reparat automat (${repairErr.message}). Rulează supabase/sql/RUN_MESSAGING_ALL.sql.`,
      },
    }
  }

  ;({ error } = await put())
  return { error: error ?? null }
}
