/**
 * ===========================================================================
 *  WHAT IS LEFT IN THE DATABASE AFTER A FEATURE IS REMOVED
 * ===========================================================================
 *
 * Voice notes and voice calls have been taken out of the app. The code is gone;
 * the ROWS are not, and cannot be — people sent those messages and they are part
 * of conversations that still exist.
 *
 * Both were stored the same way, as an ordinary TEXT row whose body begins with
 * a sentinel no human types (see the modules that used to decode them). That was
 * the right call for shipping without a migration and it is the reason this file
 * has to exist now: with the decoders deleted, those bodies would render as
 * their raw contents — a control character followed by `storelib:voice` and a
 * storage path — straight into the conversation. Gibberish in somebody's chat
 * history is a worse outcome than the feature having been removed.
 *
 * So the sentinels are still recognised, and nothing else about them is. A row
 * that was a voice note becomes a line that says a voice message was sent; a row
 * that was a call becomes a line that says there was a call. No player, no
 * duration, no waveform, no link to an object nobody can reach any more.
 *
 * DELETING THE ROWS WAS THE ALTERNATIVE AND IS WORSE. It would silently rewrite
 * two people's history to match a decision neither of them made, and a
 * conversation that reads as if a message was never sent is a conversation
 * lying about itself.
 */

/** U+0002 — what a voice note's body started with. */
const VOICE = "storelib:voice"
/** U+0003 — what a call record's body started with. */
const CALL = "storelib:call"

export type LegacyMedia = "voice" | "call"

/** Which removed feature wrote this body, if either. */
export function legacyMediaKind(body: string | null | undefined): LegacyMedia | null {
  if (!body) return null
  if (body.startsWith(VOICE)) return "voice"
  if (body.startsWith(CALL)) return "call"
  return null
}

/**
 * What the row says now.
 *
 * Deliberately past tense and deliberately vague: the exact duration of a call
 * or the length of a recording could be decoded out of these bodies, and
 * printing them would suggest the thing is still there to be opened.
 */
export function legacyMediaLabel(kind: LegacyMedia): string {
  return kind === "voice" ? "Mesaj vocal" : "Apel vocal"
}
