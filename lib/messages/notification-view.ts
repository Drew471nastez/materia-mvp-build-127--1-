/**
 * ===========================================================================
 *  READING A NOTIFICATION — the parts both inboxes need
 * ===========================================================================
 *
 * A notification row is the same sentence on a phone and on a desktop: who did
 * it, what they did, when, and where tapping it goes. Only the geometry differs
 * — a 76px row with a big avatar on a phone, a denser line in a 340px column
 * beside an open conversation.
 *
 * These lived inside components/messages/inbox.tsx, which was correct while the
 * phone was the only screen with a notifications tab. The desktop split view
 * now has one too, and a second copy of `notifHref` is a second answer to
 * "where does a follow notification go" waiting to disagree with the first.
 * The rendering stays with each list; the meaning lives here.
 */

export type Notif = {
  id: string
  kind: "follow" | "offer_received" | "offer_accepted" | "offer_declined" | "message" | "like" | "trending"
  createdAt: string
  readAt: string | null
  conversationId: string | null
  actor: { id: string; display_name: string | null; username: string | null; avatar_url: string | null } | null
  listing: { id: string; title: string; slug: string; thumbnail_url: string | null } | null
}

/** "3 min", "5 h", "2 z", "3 săpt". Short because it sits at the end of a line
 *  that is already carrying a name and a verb. */
export function ago(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000))
  if (mins < 60) return `${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} z`
  return `${Math.round(days / 7)} săpt`
}

/**
 * The verb, and the one colour left.
 *
 * ---------------------------------------------------------------------------
 * THE VIOLET IS GONE, and it was doing less than it looked like it was
 * ---------------------------------------------------------------------------
 * A like and a trending row used to render their verb in the brand violet. The
 * intent was emphasis; the effect was a feed in which a third of the sentences
 * were coloured for no reason a reader could infer — the violet did not mean
 * "urgent", it did not mean "yours", and it did not mean "act on this". It was
 * decoration on the one screen that is nothing but a list of sentences, and
 * beside the violet unread wash behind the row it was two different violets
 * saying two different things a pixel apart.
 *
 * The accepted offer keeps its emerald, and that is the distinction: it is the
 * only notification in the list that means MONEY IS ABOUT TO MOVE. A colour
 * that appears on one row in fifty is read as information. One that appears on
 * every third row is read as a theme.
 */
export function notifText(kind: Notif["kind"]): { verb: string; accent?: string } {
  switch (kind) {
    case "follow":
      return { verb: "a început să te urmărească" }
    case "offer_received":
      return { verb: "ți-a trimis o ofertă" }
    case "offer_accepted":
      return { verb: "ți-a acceptat oferta", accent: "text-emerald-600" }
    case "offer_declined":
      return { verb: "ți-a refuzat oferta" }
    case "message":
      return { verb: "ți-a trimis un mesaj" }
    case "like":
      return { verb: "ți-a apreciat anunțul" }
    // The only row with no actor — nobody DID it, it is a fact about the
    // listing. The name slot renders "Storelib" through the same fallback the
    // other kinds use for a deleted account, which reads correctly here.
    case "trending":
      return { verb: "anunțul tău este în tendințe" }
  }
}

export function notifHref(n: Notif): string | null {
  if (n.kind === "follow") return n.actor?.username ? `/member/${n.actor.username}` : null
  if (n.conversationId) return `/messages/${n.conversationId}`
  return n.listing?.slug ? `/products/${n.listing.slug}` : null
}

/** "Astăzi" / "Săptămâna aceasta" / "Mai demult" — the three buckets people
 *  actually think in. Anything older than a month never arrives here; the API
 *  cuts it, because a follow from March is an archive rather than a notice. */
export function bucketOf(iso: string): "today" | "week" | "older" {
  const age = Date.now() - Date.parse(iso)
  if (age < 24 * 60 * 60 * 1000) return "today"
  if (age < 7 * 24 * 60 * 60 * 1000) return "week"
  return "older"
}

export const BUCKET_LABEL: Record<string, string> = {
  today: "Astăzi",
  week: "Săptămâna aceasta",
  older: "Mai demult",
}
