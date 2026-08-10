/**
 * ===========================================================================
 *  WHAT A CALL LEAVES BEHIND IN THE CHAT
 * ===========================================================================
 *
 * A call that vanishes when it ends is a call you cannot prove happened. Every
 * messenger leaves a line in the thread — "Apel vocal · 2:07", "Apel pierdut" —
 * and it is not decoration: it is the only record either person has that they
 * spoke, and for a marketplace where the call is often about money, it is the
 * only thing that dates the conversation.
 *
 * Stored exactly as photographs and voice notes are: an ordinary TEXT row whose
 * body starts with a sentinel no human types. Same reason as those two — the
 * `messages` table has a CHECK on `kind`, so a new kind is a migration, and a
 * feature that cannot ship until somebody runs SQL against production half
 * exists for as long as that takes.
 *
 * The sentinel is U+0003. U+0001 is the image encoding and U+0002 is voice; a
 * third kind gets a third character rather than a shared one with a field
 * inside it, so a body can never be ambiguous about which decoder owns it.
 */

import type { CallEnding } from "@/lib/calls/protocol"

const SENTINEL = "storelib:call"
const SEP = ""

export interface CallRecord {
  ending: CallEnding
  /** Talk time. Zero for every ending except "ended". */
  ms: number
}

const ENDINGS: CallEnding[] = ["ended", "missed", "declined", "cancelled", "failed"]

export function encodeCallBody(ending: CallEnding, ms: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0))
  return `${SENTINEL}${ending}${SEP}${safe}`
}

export function decodeCallBody(body: string | null | undefined): CallRecord | null {
  if (!body || !body.startsWith(SENTINEL)) return null
  const parts = body.slice(SENTINEL.length).split(SEP)
  const ending = parts[0] as CallEnding
  if (!ENDINGS.includes(ending)) return null
  const ms = Number.parseInt(parts[1] ?? "", 10)
  return { ending, ms: Number.isFinite(ms) && ms > 0 ? ms : 0 }
}

export function isEncodedCall(body: string | null | undefined): boolean {
  return !!body && body.startsWith(SENTINEL)
}

/**
 * What the line says.
 *
 * `mine` matters because the same event reads differently from the two ends: a
 * call you did not answer is "missed" to you and "no answer" to the person who
 * rang. Telling the caller they missed a call they made would be nonsense.
 */
export function callSummary(record: CallRecord, mine: boolean): string {
  switch (record.ending) {
    case "ended":
      return "Apel vocal"
    case "missed":
      return mine ? "Fără răspuns" : "Apel pierdut"
    case "declined":
      return mine ? "Apel refuzat" : "Ai refuzat apelul"
    case "cancelled":
      return mine ? "Apel anulat" : "Apel pierdut"
    case "failed":
      return "Apelul nu a putut fi conectat"
  }
}

/** The one-line preview in the inbox and in a push, where there is no "mine". */
export function callPreview(record: CallRecord): string {
  if (record.ending === "ended") return "Apel vocal"
  if (record.ending === "failed") return "Apel eșuat"
  return "Apel pierdut"
}
