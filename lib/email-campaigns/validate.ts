/**
 * ===========================================================================
 *  WHAT AN EMAIL NEEDS BEFORE IT MAY GO OUT
 * ===========================================================================
 * The same rules on both sides: the compose page shows them as the creator
 * types, and the send route refuses on them whatever the page said. Each
 * problem names the field it belongs to, so the page can put the words under
 * that field instead of in a toast.
 *
 * Limits, and where they come from:
 *   subject     150 characters. Past about 60 a phone cuts it; that is a
 *               warning, not a refusal.
 *   preview     150 characters, the most any inbox shows.
 *   body        some words or a picture. An empty email is refused, and so
 *               is one that is only whitespace or a lone divider.
 *   size        Gmail cuts a message off at 102 KB and hides the rest behind
 *               "View entire message", which also hides the unsubscribe link.
 *               Warned from 90 KB, refused past 200 KB.
 *   fields      {{first_name}}, {{name}} and {{email}}. Anything else in
 *               braces would arrive as braces, so it is refused by name.
 */

export const SUBJECT_MAX = 150
export const SUBJECT_SHORT = 60
export const PREVIEW_MAX = 150
export const BODY_WARN_BYTES = 90_000
export const BODY_MAX_BYTES = 200_000

export type Field = "subject" | "previewText" | "body" | "audience"

export interface Problem {
  field: Field
  message: string
}

export interface ContentFacts {
  subject: string
  previewText: string
  /** The words a reader would see in the body. */
  text: string
  images: number
  /** Size of the body HTML in bytes. */
  bytes: number
  /** {{fields}} nobody fills in. */
  unknownFields: string[]
}

export interface Verdict {
  errors: Problem[]
  warnings: Problem[]
}

export function checkContent(f: ContentFacts): Verdict {
  const errors: Problem[] = []
  const warnings: Problem[] = []
  const subject = f.subject.trim()
  if (!subject) errors.push({ field: "subject", message: "Add a subject." })
  else if (subject.length > SUBJECT_MAX) errors.push({ field: "subject", message: `Keep the subject under ${SUBJECT_MAX} characters.` })
  else if (subject.length > SUBJECT_SHORT) warnings.push({ field: "subject", message: "Phones cut subjects past about 60 characters." })

  if (f.previewText.trim().length > PREVIEW_MAX) errors.push({ field: "previewText", message: `Keep the preview text under ${PREVIEW_MAX} characters.` })

  if (f.text.replace(/\s+/g, "").length < 2 && f.images === 0) errors.push({ field: "body", message: "Write something in the email first." })
  if (f.bytes > BODY_MAX_BYTES) errors.push({ field: "body", message: "This email is too long to send. Remove some blocks or images." })
  else if (f.bytes > BODY_WARN_BYTES) warnings.push({ field: "body", message: "Gmail will hide the end of an email this long behind a link." })

  if (f.unknownFields.length) {
    const list = f.unknownFields.map((k) => `{{${k}}}`).join(", ")
    errors.push({ field: "body", message: `${list} is not a field that can be filled in. Use {{first_name}}, {{name}} or {{email}}.` })
  }
  return { errors, warnings }
}

/** A subject line as a header may carry it: one line, no control characters. */
export function cleanSubject(raw: unknown): string {
  return (typeof raw === "string" ? raw : "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim()
}

export function cleanPreview(raw: unknown): string {
  return cleanSubject(raw)
}

export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}
