import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { getSystemUserId } from "@/lib/system-account"

/**
 * ===========================================================================
 *  THE STORELIB THREAD IS SOMETHING YOU READ, NOT SOMETHING YOU WRITE INTO
 * ===========================================================================
 *
 * Storelib's conversation sits in every inbox and carries announcements and
 * selling tips. It was built as an ordinary conversation with an unusual party
 * on the other end, which is what made it cheap to build — and it meant the
 * composer worked. Anyone could type into it, and nobody was reading: replies
 * landed in a thread owned by a service account with no inbox behind it, so a
 * person asking for help got silence from an account whose own welcome note had
 * invited them to write.
 *
 * A control that accepts input nothing consumes is worse than no control. The
 * composer is gone from that thread (components/messages/thread.tsx) and support
 * is where support is: the Help Centre.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ALSO ENFORCED ON THE SERVER
 * ---------------------------------------------------------------------------
 * Hiding a text box hides a text box. The endpoint behind it stayed open, and
 * "the button is not rendered" is not an access rule — a stale tab with the old
 * bundle, a queued offline send, or anybody with a session and curl still gets
 * a row into that conversation. So the write is refused where the write
 * happens, and the missing composer is the courtesy rather than the mechanism.
 *
 * Fails OPEN, deliberately. `getSystemUserId` returns null in an environment
 * where the official account was never seeded, and in that environment no
 * conversation is the official one — refusing on a null would be an outage of
 * ordinary messaging caused by an unconfigured marketing feature.
 */
export async function isOfficialThread(
  admin: SupabaseClient,
  convo: { buyer_id: string; seller_id: string },
): Promise<boolean> {
  const systemId = await getSystemUserId(admin)
  if (!systemId) return false
  return convo.buyer_id === systemId || convo.seller_id === systemId
}

/** What the refusal says. One sentence, and it points somewhere useful rather
 *  than just saying no. */
export const OFFICIAL_THREAD_REFUSAL =
  "Nu poți răspunde în conversația oficială Storelib. Pentru ajutor, scrie-ne prin Centrul de ajutor."
