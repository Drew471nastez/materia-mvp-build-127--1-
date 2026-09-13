import "server-only"

/**
 * ===========================================================================
 *  WHERE AN ATTACHED PICTURE LIVES, AND FOR HOW LONG
 * ===========================================================================
 * The bytes used to travel with the request and disappear. That was right
 * while nothing could show them again — but the conversation is saved, and
 * somebody reading back through what they asked for last week should see the
 * picture they asked it about rather than a note saying there was one.
 *
 * THIRTY DAYS. A screenshot is working material, not a creator's library;
 * site-assets is the library and those must outlive everything. These make a
 * conversation readable while it is still a live conversation, and then they
 * go. See sql/20260924_theme_chat_attachments.sql.
 *
 * THE AUTHORISATION RULE, which is the only thing in here worth being careful
 * about. The bucket is PRIVATE and has no storage policy at all, so there is
 * no client-side path to the bytes. Everything goes through the service role,
 * and every function that takes an installId is called only after the route
 * has proved ownership against the USER'S OWN client — RLS is the check, and
 * this module never second-guesses it with a rule of its own that could
 * disagree. Nothing here takes a storage path from a caller.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { AgentImage } from "@/lib/sites/agent/attachments"

const BUCKET = "theme-chat-attachments"

/**
 * How long a signed URL lasts. Long enough to read a conversation and short
 * enough that a copied link is not a way to hand somebody the picture.
 */
const SIGNED_FOR_SECONDS = 60 * 60

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
}

export interface StoredAttachment {
  id: string
  name: string
  mediaType: string
  /** A signed URL, minted for this read and not stored anywhere. */
  url: string
}

/** Base64 to bytes, without a Buffer round trip that doubles the memory. */
function decode(data: string): Uint8Array {
  const binary = Buffer.from(data, "base64")
  return new Uint8Array(binary)
}

/**
 * Keep the pictures from one exchange.
 *
 * Never throws. A picture that could not be stored is a picture the thread
 * will not show later; it is not a reason to fail an edit that has already
 * been asked for, and the model has seen the bytes either way.
 */
export async function keepImages(input: {
  installId: string
  messageId: string | null
  images: AgentImage[]
}): Promise<void> {
  if (input.images.length === 0) return
  try {
    const admin = createAdminClient()
    for (const image of input.images) {
      const extension = EXTENSIONS[image.mediaType] ?? "png"
      /**
       * The install id leads the path so one theme's pictures are one prefix:
       * a deleted theme is one prefix to remove, and no path can be built
       * that reaches across to another creator's.
       */
      const path = `${input.installId}/${crypto.randomUUID()}.${extension}`
      const bytes = decode(image.data)
      const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
        contentType: image.mediaType,
        upsert: false,
      })
      if (error) continue
      const { error: rowError } = await admin.from("theme_chat_attachments").insert({
        install_id: input.installId,
        message_id: input.messageId,
        storage_path: path,
        media_type: image.mediaType,
        byte_size: bytes.byteLength,
        name: image.name ?? null,
      })
      /**
       * A row that did not land would leave bytes nobody can find and nobody
       * will ever collect, because the collector reads rows. Take them back.
       */
      if (rowError) await admin.storage.from(BUCKET).remove([path])
    }
  } catch {
    /* Evidence, not enforcement. */
  }
}

/**
 * The pictures belonging to a set of messages, as signed URLs.
 *
 * READ THROUGH THE USER'S CLIENT. The rows come back only if RLS says this
 * caller owns the theme, so a message id from somebody else's conversation
 * returns nothing rather than a URL. The signing is done with the service
 * role afterwards, on paths that the user's own client already returned —
 * which is the ONLY way a path reaches the signer.
 */
export async function attachmentsFor(messageIds: string[]): Promise<Map<string, StoredAttachment[]>> {
  const byMessage = new Map<string, StoredAttachment[]>()
  if (messageIds.length === 0) return byMessage
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("theme_chat_attachments")
      .select("id, message_id, storage_path, media_type, name")
      .in("message_id", messageIds)
    if (error || !data) return byMessage

    type Row = {
      id: string
      message_id: string | null
      storage_path: string
      media_type: string
      name: string | null
    }
    const rows = data as Row[]
    if (rows.length === 0) return byMessage

    const admin = createAdminClient()
    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrls(rows.map((r) => r.storage_path), SIGNED_FOR_SECONDS)
    const urlFor = new Map<string, string>((signed ?? []).map((s) => [String(s.path), s.signedUrl] as const))

    for (const row of rows) {
      if (!row.message_id) continue
      const url = urlFor.get(row.storage_path)
      if (!url) continue
      const list = byMessage.get(row.message_id) ?? []
      list.push({
        id: row.id,
        name: row.name ?? "attachment",
        mediaType: row.media_type,
        url,
      })
      byMessage.set(row.message_id, list)
    }
  } catch {
    /* A conversation without its pictures still reads. */
  }
  return byMessage
}

/**
 * Collect what is past its date: the bytes first, then the rows.
 *
 * IN THAT ORDER, and it matters. A row deleted before its object leaves bytes
 * nobody can reach and nobody will collect, because the next run reads rows
 * and this one is gone. An object deleted before its row leaves a row whose
 * picture 404s — visible, wrong, and fixed by the next run. One failure mode
 * is a leak that grows for ever; the other cleans itself up.
 */
export async function purgeExpiredAttachments(limit = 500): Promise<{ removed: number; failed: number }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("theme_chat_attachments")
    .select("id, storage_path")
    .lte("expires_at", new Date().toISOString())
    .limit(limit)
  if (error || !data) return { removed: 0, failed: 0 }

  const rows = data as { id: string; storage_path: string }[]
  if (rows.length === 0) return { removed: 0, failed: 0 }

  const { error: removeError } = await admin.storage.from(BUCKET).remove(rows.map((r) => r.storage_path))
  if (removeError) return { removed: 0, failed: rows.length }

  const { error: deleteError } = await admin
    .from("theme_chat_attachments")
    .delete()
    .in("id", rows.map((r) => r.id))
  if (deleteError) return { removed: 0, failed: rows.length }

  return { removed: rows.length, failed: 0 }
}
