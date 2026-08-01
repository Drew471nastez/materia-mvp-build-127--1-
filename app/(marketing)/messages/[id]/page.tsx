import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { MessageThread } from "@/components/messages/thread"
import { readThread } from "@/lib/messages/thread"
import { createClient } from "@/lib/supabase/server"

/**
 * /messages/[id] — the conversation, rendered with its messages already in it.
 *
 * This used to be three lines handing an id to a client component, and the
 * thread arrived in three stages because of it: the route had no loading
 * boundary, so tapping a row sat on the inbox until the payload landed; then
 * the bundle hydrated and MessageThread painted a skeleton, because `thread`
 * began as null; then /api/messages/:id answered and the messages appeared.
 * Three waits stacked on one tap, with only the last of them animated. That is
 * the "it loads glitchy" — not an animation problem at all, a screen genuinely
 * being assembled in front of you.
 *
 * So the conversation is read here and handed down. The client keeps every
 * behaviour it had — the fifteen-second poll, the visibility pause, 401 versus
 * 503, read receipts, offers — but it no longer has a reason to show a skeleton
 * or to fetch on mount, because the data it is born with is milliseconds old.
 * loading.tsx covers the wait, and it is now the only thing on this route that
 * animates.
 *
 * Reading cookies makes this dynamic, which is correct: a conversation that
 * could be served from a cache would be somebody else's conversation.
 */

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Conversație | Storelib",
  robots: { index: false, follow: false },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/messages/${id}`)}`)

  // A malformed id is not a thread that failed to load, and asking Postgres to
  // compare it against a uuid column would only raise. It is simply not found.
  let initial = null
  if (UUID_RE.test(id)) {
    try {
      // `asCaller` is the session client and RLS is what limits it to this
      // person's threads. Naming it at the call site is deliberate: rendering a
      // conversation on the server must not widen what a caller can see, and
      // this is the line where that could quietly stop being true.
      initial = await readThread({ asCaller: supabase, userId: user.id, id })
    } catch {
      // Null rather than a thrown page: the client will fetch, and its own
      // handling of a failed load is better than a crashed route.
      initial = null
    }
  }

  return <MessageThread id={id} initial={initial} />
}
