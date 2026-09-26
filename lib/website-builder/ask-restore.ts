/**
 * ===========================================================================
 *  A CONVERSATION READ BACK FROM THE DATABASE, AS THE THREAD DRAWS IT
 * ===========================================================================
 * The transcript keeps two rows per exchange, the question and the reply
 * (lib/website-builder/agent/chat.ts); the chat shows one exchange. This
 * pairs them, and reads each question back the way it was sent:
 *
 *   ITS WORDS       without the note the route keeps for its pictures
 *                   ("[an image attached]"), which is never shown as text.
 *                   A picture sent with no words reads "Build this.", as it
 *                   did when it was sent.
 *   ITS PICTURES    the ones that came back, as signed URLs the server made
 *                   for this read, and a count of the ones that did not:
 *                   collected after thirty days, never kept because the
 *                   database update had not run, or gone for another
 *                   reason. Those are drawn as "Picture no longer
 *                   available", one tile each, where the picture was.
 *   ITS ANSWER      the reply, an error, the changes counted (never
 *                   replayed: the transcript is a record, not a script),
 *                   and a question when the run stopped to ask one.
 *
 * Pure, so tests/ask-pictures.test.ts holds it with made up transcripts.
 */

import { activityFromOps, questionFromReply, type Activity } from "./ask-activity"
import { readPictureNote } from "./ask-attach"

/** One row as GET /chat answers it. */
export interface StoredMessage {
  id: string
  role: string
  content: string
  ops?: unknown[] | null
  error?: string | null
  images?: { id: string; name: string; url: string }[]
}

export interface RestoredPicture {
  id: string
  name: string
  url: string
}

export interface RestoredExchange {
  id: string
  /** The question's row, which Report names. */
  messageId: string
  prompt: string
  reply?: string
  error?: string
  activity: Activity
  images: RestoredPicture[]
  /** Pictures the question was sent with that did not come back. */
  missingImages: number
}

/** What a question with pictures and no words reads as, live and read back. */
export function promptForPictures(count: number): string {
  return count === 1 ? "Build this." : "Build these."
}

export function restoreExchanges(messages: StoredMessage[]): RestoredExchange[] {
  const restored: RestoredExchange[] = []
  for (const message of messages) {
    if (message.role === "user") {
      const images = (message.images ?? []).filter((image) => image && typeof image.url === "string" && image.url)
      const { text, count } = readPictureNote(message.content ?? "")
      const pictures = Math.max(count, images.length)
      restored.push({
        id: message.id,
        messageId: message.id,
        prompt: text || (pictures > 0 ? promptForPictures(pictures) : ""),
        activity: activityFromOps([]),
        images: images.map((image) => ({ id: image.id, name: image.name || "Picture", url: image.url })),
        missingImages: Math.max(0, count - images.length),
      })
      continue
    }
    const open = restored[restored.length - 1]
    if (!open) continue
    open.reply = message.content || undefined
    open.error = message.error ?? undefined
    /**
     * The operations are counted rather than replayed. Replaying them would
     * apply the same edits a second time to a page that already has them:
     * the transcript is a record, not a script.
     */
    const counted = activityFromOps(Array.isArray(message.ops) ? message.ops : [])
    /* A run that stopped to ask kept its question as text: it is a question again, answered by the message after it. */
    const question = questionFromReply(open.reply, message.id)
    open.activity = question ? { ...counted, question } : counted
  }
  return restored
}
