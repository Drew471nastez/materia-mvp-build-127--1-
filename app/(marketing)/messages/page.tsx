import type { Metadata } from "next"

import { MessagesInbox } from "@/components/messages/inbox"
import { MessagesEmptyState } from "@/components/messages/empty-state"
import { MessagesSplit } from "@/components/messages/split-shell"
import {
  DesktopConversationList,
  NoConversationSelected,
} from "@/components/messages/desktop-conversation-list"
import { listConversations, optionalAdminClient, type InboxConversation } from "@/lib/messages/list"
import { createClient } from "@/lib/supabase/server"

/**
 * /messages — the inbox, rendered with its conversations already in it.
 *
 * This page used to be four lines returning a client component, and the inbox
 * arrived in three separate stages because of it: loading.tsx painted a
 * skeleton, the bundle hydrated and MessagesInbox painted its OWN skeleton
 * because `rows` began as null, and only when /api/messages answered did the
 * conversations appear. A skeleton replacing a skeleton is pure waste, and the
 * last swap was not animated at all while the shell around it had been — which
 * is precisely the "loads the page, then the messages" this fixes.
 *
 * So the first payload is fetched here and handed down. The client keeps every
 * behaviour it had — the focus refresh and its thirty-second window, 401 versus
 * 503, read-marking — but it no longer has a reason to show a skeleton or to
 * refetch on mount, because the data it was born with is a few milliseconds
 * old.
 *
 * Reading cookies makes this dynamic, which is correct: an inbox that could be
 * served from a cache would be somebody else's inbox. loading.tsx still covers
 * the wait, and it is now the only thing on this route that animates.
 */

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Mesaje | Storelib",
  robots: { index: false, follow: true },
}

export default async function MessagesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Signed out is a whole screen, not a state the inbox has to boot up to
  // discover. Rendered here, it is on the page in the first response.
  if (!user) {
    return (
      <MessagesEmptyState
        className="min-h-[60svh]"
        title="Conectează-te pentru mesaje"
        body="Conversațiile cu vânzătorii și cumpărătorii apar aici după ce te conectezi."
        cta={{ href: "/login?next=/messages", label: "Conectează-te" }}
      />
    )
  }

  // `asCaller` is the session client and RLS is what limits it to this
  // person's threads; `asAdmin` only decorates rows that read has already
  // approved. Naming them at the call site is deliberate — rendering the inbox
  // on the server must not widen what a caller can see, and this is the line
  // where that could quietly stop being true.
  let initialConversations: InboxConversation[] | null = null
  try {
    initialConversations = await listConversations({
      asCaller: supabase,
      asAdmin: optionalAdminClient(),
      userId: user.id,
    })
  } catch {
    // The one case where the client's own fetch is still the better answer: it
    // will retry, and its skeleton is the honest thing to show meanwhile. Null
    // rather than an empty array, because an inbox that failed to load and an
    // inbox with nothing in it must not look the same.
    initialConversations = null
  }

  // A nonce, not a timestamp — the conversation route made the same mistake and
  // it is documented in full in lib/render-key.ts. In short: the client used to
  // compare this against its own clock to decide whether the payload had come
  // out of the router cache, and on a phone whose clock runs behind the server
  // that comparison says "fresh" about rows that are minutes old. Which is
  // exactly the conversation that is missing from the list until you reload.
  // BOTH SHAPES, and CSS picks. On a phone the inbox is the screen; from 768px
  // up it is the left column of a split, with a conversation open beside it.
  // Rendering both and letting the media query decide is what stops the desktop
  // view from appearing a frame after the phone one — and only the visible one
  // makes requests. See components/messages/split-shell.tsx.
  const renderKey = crypto.randomUUID()
  return (
    <MessagesSplit
      primary="list"
      list={
        <>
          <div className="flex min-h-0 flex-1 flex-col md:hidden">
            <MessagesInbox
              initialConversations={initialConversations}
              renderKey={renderKey}
              viewerId={user.id}
              dormantWhenWide
            />
          </div>
          <div className="hidden min-h-0 flex-1 flex-col md:flex">
            <DesktopConversationList initialConversations={initialConversations} viewerId={user.id} />
          </div>
        </>
      }
    >
      <NoConversationSelected />
    </MessagesSplit>
  )
}
