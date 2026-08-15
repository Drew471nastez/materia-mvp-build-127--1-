import { MessagesInbox } from "@/components/messages/inbox"
import { MessagesSplit } from "@/components/messages/split-shell"
import { DesktopConversationList } from "@/components/messages/desktop-conversation-list"
import { listConversations, optionalAdminClient, type InboxConversation } from "@/lib/messages/list"
import { createClient } from "@/lib/supabase/server"

/**
 * ===========================================================================
 *  THE LEFT COLUMN IS THE SHELL, AND IT IS MOUNTED ONCE
 * ===========================================================================
 *
 * This layout exists to fix one bug, and the bug is a mount.
 *
 * /messages and /messages/[id] each used to render their OWN MessagesSplit and
 * their own DesktopConversationList. In the App Router a page is keyed by its
 * route segment, so /messages/A and /messages/B are two different pages —
 * clicking a conversation while reading another one unmounted the entire left
 * column and mounted a second one in its place. Everything about it was rebuilt
 * from scratch: every row, every product thumbnail, every avatar.
 *
 * That is exactly what the flashing is. `InitialAvatar` and `AvatarPhoto` start
 * at `opacity-0` and fade in when the bytes land, because an <img> paints
 * NOTHING until it decodes and popping in at full opacity is worse. Both guard
 * the cached case by reading `img.complete` in a ref callback — but that only
 * catches an image already decoded at the instant React attaches the node, and
 * on a remount of thirty rows at once most of them are not. So the column went
 * grey and faded back in, once per conversation you clicked. The bytes were
 * cached; the PAINT is what cannot survive a remount.
 *
 * A layout is the one thing Next keeps mounted while the page under it changes.
 * Moving the split and the list here means the column is mounted when you enter
 * /messages and unmounted when you leave it — switching conversations replaces
 * the right-hand pane and touches nothing on the left. No re-decode, no fade,
 * no lost scroll position, and no second fetch of a list that was already on
 * screen and already correct.
 *
 * ---------------------------------------------------------------------------
 * WHICH CONVERSATION IS OPEN IS READ FROM THE PATH, ON THE CLIENT
 * ---------------------------------------------------------------------------
 * The obvious way to keep the active row marked would be to pass the id down
 * from here — and it is the wrong way, because this layout would then have to
 * re-render per conversation, which is the thing being fixed. `MessagesSplit`
 * and `DesktopConversationList` read `usePathname()` instead. It is the same
 * fact from a source that costs no round trip and no re-render.
 *
 * ---------------------------------------------------------------------------
 * SIGNED OUT RENDERS THE CHILD AND NOTHING ELSE
 * ---------------------------------------------------------------------------
 * No session means no conversations, so there is no column to draw and the page
 * below owns the whole screen for its "conectează-te" state. Rendering an empty
 * split around it would put a 340px rule down a page whose entire content is
 * one centred sentence.
 */

export const dynamic = "force-dynamic"

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return <>{children}</>

  /**
   * `asCaller` is the session client and RLS is what limits it to this person's
   * threads; `asAdmin` only decorates rows that read has already approved.
   * Naming them at the call site is deliberate — rendering the inbox on the
   * server must not widen what a caller can see, and this is the line where
   * that could quietly stop being true.
   */
  let initialConversations: InboxConversation[] | null = null
  try {
    initialConversations = await listConversations({
      asCaller: supabase,
      asAdmin: optionalAdminClient(),
      userId: user.id,
    })
  } catch {
    // Null rather than an empty array: an inbox that failed to load and an
    // inbox with nothing in it must not look the same. The client will retry.
    initialConversations = null
  }

  /**
   * A NONCE, not a timestamp. The client used to compare a `renderedAt` against
   * its own clock to decide whether the payload had come out of the router
   * cache, and a phone whose clock runs behind the server calls rows that are
   * minutes old "fresh" — which is the conversation missing from the list until
   * you reload. A value that changes per render answers the real question with
   * no clock in it. See lib/render-key.ts.
   */
  const renderKey = crypto.randomUUID()

  return (
    <MessagesSplit
      list={
        <>
          {/* BOTH SHAPES, and CSS picks. On a phone the inbox is the screen;
              from 768px up it is the left column of a split with a conversation
              open beside it. Rendering both is what stops the desktop view
              appearing a frame after the phone one, and only the visible one
              makes requests — see components/messages/split-shell.tsx. */}
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
      {children}
    </MessagesSplit>
  )
}
