import "server-only"

/**
 * ===========================================================================
 *  WHERE AN ATTACHED PICTURE LIVES, AND FOR HOW LONG
 * ===========================================================================
 * The bytes used to travel with the request and disappear. That was right
 * while nothing could show them again, but the conversation is saved, and
 * somebody reading back through what they asked for last week should see the
 * picture they asked it about rather than a note saying there was one.
 *
 * THIRTY DAYS. A screenshot is working material, not a creator's library;
 * site-assets is the library and those must outlive everything. These make a
 * conversation readable while it is still a live conversation, and then they
 * go. The bucket and the table are run-now part 33
 * (supabase/migrations/20261005_theme_chat_attachments.sql).
 *
 * THE AUTHORISATION RULE, which is the only thing in here worth being careful
 * about. The bucket is PRIVATE and has no storage policy at all, so there is
 * no client-side path to the bytes. Everything goes through the service role,
 * and every function that takes an installId is called only after the route
 * has proved ownership against the USER'S OWN client. RLS is the check, and
 * this module never second-guesses it with a rule of its own that could
 * disagree. Nothing here takes a storage path from a caller, and a path is
 * signed only when it lies under the install that was proved to be theirs.
 *
 * BEFORE THE DATABASE UPDATE the bucket or the table is missing, and every
 * picture would be dropped without a word. Both functions say so instead
 * (`problem: "not_set_up"`), and the chat tells the creator their pictures
 * are not kept yet rather than showing them a note where the picture was.
 *
 * The clients are injected so tests/ask-pictures.test.ts can hand in a fake
 * database and bucket. The routes pass nothing and get the real ones.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { AgentImage } from "@/lib/sites/agent/attachments"
import { isMissingBucket, isMissingTable } from "./db-errors"

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

/** Why pictures were not kept or not read back: the update is not run yet, or something failed. */
export type PictureProblem = "not_set_up" | "failed"

/** As much of a supabase-js client as this module uses. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any; storage: { from: (bucket: string) => any } }

export interface StoreClients {
  /** The signed in creator's own client. RLS applies. */
  user: Db
  /** The service role: storage, and writes on rows the route has proved are theirs. */
  admin: Db
}

async function realClients(): Promise<StoreClients> {
  return { user: (await createClient()) as unknown as Db, admin: createAdminClient() as unknown as Db }
}

/** Base64 to bytes, without a Buffer round trip that doubles the memory. */
function decode(data: string): Uint8Array {
  const binary = Buffer.from(data, "base64")
  return new Uint8Array(binary)
}

/**
 * A path this install may have signed: its own prefix, one plain file name
 * after it. A row naming anything else is not signed, whoever wrote it.
 */
export function pathOnInstall(path: string, installId: string): boolean {
  if (!path.startsWith(`${installId}/`)) return false
  const rest = path.slice(installId.length + 1)
  return /^[A-Za-z0-9._-]+$/.test(rest) && !rest.includes("..")
}

export interface KeepResult {
  /** How many of the pictures were kept. */
  kept: number
  /** How many there were. */
  of: number
  problem: PictureProblem | null
}

/**
 * Keep the pictures from one exchange, against the message they came with.
 *
 * Never throws. A picture that could not be stored is a picture the thread
 * will not show later; it is not a reason to fail an edit that has already
 * been asked for, and the model has seen the bytes either way. The result
 * says how many were kept and, when not all were, why, so the chat can say
 * so rather than showing a note where the picture was next week.
 *
 * All at once, not one after another: the stream waits for this, and four
 * uploads in a row were four round trips before anything moved on screen.
 */
export async function keepImages(
  input: { installId: string; messageId: string | null; images: AgentImage[] },
  clients?: StoreClients,
): Promise<KeepResult> {
  const of = input.images.length
  if (of === 0) return { kept: 0, of, problem: null }
  /* Nothing to attach them to: the message itself was not kept (see startThemeExchange). */
  if (!input.messageId) return { kept: 0, of, problem: "failed" }
  try {
    const { admin } = clients ?? (await realClients())
    let missing = false
    const uploaded = await Promise.all(
      input.images.map(async (image) => {
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
        if (error) {
          if (isMissingBucket(error)) missing = true
          return null
        }
        return {
          install_id: input.installId,
          message_id: input.messageId,
          storage_path: path,
          media_type: image.mediaType,
          byte_size: bytes.byteLength,
          name: image.name ?? null,
        }
      }),
    )
    const rows = uploaded.filter((row): row is NonNullable<typeof row> => row !== null)
    if (rows.length === 0) return { kept: 0, of, problem: missing ? "not_set_up" : "failed" }

    const { error: rowError } = await admin.from("theme_chat_attachments").insert(rows)
    /**
     * Rows that did not land would leave bytes nobody can find and nobody
     * will ever collect, because the collector reads rows. Take them back.
     */
    if (rowError) {
      await admin.storage.from(BUCKET).remove(rows.map((row) => row.storage_path))
      return { kept: 0, of, problem: isMissingTable(rowError) ? "not_set_up" : "failed" }
    }
    return { kept: rows.length, of, problem: rows.length === of ? null : missing ? "not_set_up" : "failed" }
  } catch {
    /* Evidence, not enforcement. */
    return { kept: 0, of, problem: "failed" }
  }
}

export interface ReadPictures {
  /** Each message's pictures, by message id, as signed URLs. */
  byMessage: Map<string, StoredAttachment[]>
  /** Set when the pictures could not be read at all: the table is not there yet, or the read failed. */
  problem: PictureProblem | null
}

/**
 * The pictures belonging to a set of messages on one install, as signed URLs.
 *
 * READ THROUGH THE USER'S CLIENT. The rows come back only if RLS says this
 * caller owns the theme, so a message id from somebody else's conversation
 * returns nothing rather than a URL. The signing is done with the service
 * role afterwards, on paths that the user's own client already returned and
 * that lie under this install's own prefix, which is the ONLY way a path
 * reaches the signer.
 */
export async function attachmentsFor(installId: string, messageIds: string[], clients?: StoreClients): Promise<ReadPictures> {
  const byMessage = new Map<string, StoredAttachment[]>()
  if (messageIds.length === 0) return { byMessage, problem: null }
  try {
    const { user, admin } = clients ?? (await realClients())
    const { data, error } = await user
      .from("theme_chat_attachments")
      .select("id, message_id, storage_path, media_type, name")
      .eq("install_id", installId)
      .in("message_id", messageIds)
    if (error) return { byMessage, problem: isMissingTable(error) ? "not_set_up" : "failed" }

    type Row = {
      id: string
      message_id: string | null
      storage_path: string
      media_type: string
      name: string | null
    }
    const rows = ((data as Row[] | null) ?? []).filter((row) => !!row.message_id && pathOnInstall(row.storage_path, installId))
    if (rows.length === 0) return { byMessage, problem: null }

    const { data: signed, error: signError } = await admin.storage
      .from(BUCKET)
      .createSignedUrls(rows.map((r) => r.storage_path), SIGNED_FOR_SECONDS)
    if (signError) return { byMessage, problem: isMissingBucket(signError) ? "not_set_up" : "failed" }
    const urlFor = new Map<string, string>(
      ((signed as { path: string | null; signedUrl: string | null }[] | null) ?? [])
        .filter((s) => s.path && s.signedUrl)
        .map((s) => [String(s.path), String(s.signedUrl)] as const),
    )

    for (const row of rows) {
      const url = urlFor.get(row.storage_path)
      /* Its bytes are gone (collected, or deleted): the thread says so where it was. */
      if (!url || !row.message_id) continue
      const list = byMessage.get(row.message_id) ?? []
      list.push({
        id: row.id,
        name: row.name ?? "Picture",
        mediaType: row.media_type,
        url,
      })
      byMessage.set(row.message_id, list)
    }
    return { byMessage, problem: null }
  } catch {
    /* A conversation without its pictures still reads. */
    return { byMessage, problem: "failed" }
  }
}

/**
 * Collect what is past its date: the bytes first, then the rows.
 *
 * IN THAT ORDER, and it matters. A row deleted before its object leaves bytes
 * nobody can reach and nobody will collect, because the next run reads rows
 * and this one is gone. An object deleted before its row leaves a row whose
 * picture 404s: visible, wrong, and fixed by the next run. One failure mode
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
