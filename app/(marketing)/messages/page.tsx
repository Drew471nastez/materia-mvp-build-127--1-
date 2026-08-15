import type { Metadata } from "next"

import { MessagesEmptyState } from "@/components/messages/empty-state"
import { NoConversationSelected } from "@/components/messages/desktop-conversation-list"
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
  // discover. Rendered here, it is on the page in the first response — and the
  // layout draws no column around it, so this owns the width.
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

  /**
   * THE RIGHT-HAND PANE, AND NOTHING ELSE.
   *
   * The inbox itself — both shapes of it — is the messages LAYOUT's now, so it
   * is mounted once for the whole visit instead of once per page. This page
   * used to render its own copy, which meant walking from the inbox into a
   * conversation and back rebuilt the column every time. See
   * app/(marketing)/messages/layout.tsx.
   *
   * On a phone this is hidden (the list is the screen); from 768px up it is the
   * placeholder beside the column.
   */
  return <NoConversationSelected />
}
