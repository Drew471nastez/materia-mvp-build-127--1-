"use client"

import { cn } from "@/lib/utils"

/**
 * The messages screen, in the two shapes it has.
 *
 * On a phone a conversation and the list of them are two SCREENS, one at a
 * time, with a back arrow between them. On anything wider they are two PANES of
 * one screen, side by side, and moving between conversations is a change of
 * pane rather than a change of page. Both are right for their device, and the
 * mistake would be picking one and stretching it: a phone inbox on a 1440px
 * monitor is a narrow column of rows in the middle of an empty page, and a
 * split view on a phone is two things fighting over 390 pixels.
 *
 * ---------------------------------------------------------------------------
 * How both exist at once without either flashing
 * ---------------------------------------------------------------------------
 * Both are rendered, always, and the media query decides which is drawn. That
 * means there is nothing to detect, nothing to hydrate around, and no frame in
 * which the wrong layout is visible — the alternative, measuring the window
 * after mount, necessarily shows the phone layout first and then replaces it,
 * which is a visible jump on the one screen you open most.
 *
 * What it costs is that a hidden pane still runs its effects, and that is paid
 * for in exactly one place: the conversation list asks whether it is the one on
 * screen before making any request at all. See lib/use-wide-viewport.ts.
 *
 * The `data-app-screen` attribute is what tells the marketing shell that this
 * page owns its own scrolling and needs a measurable height rather than a
 * minimum one — the difference between a list that scrolls inside its column
 * and a list that computed to zero pixels tall, which is what the desktop inbox
 * was doing. See `.marketing-flex-wrapper:has([data-app-screen])` in
 * app/globals.css.
 */

export function MessagesSplit({
  /** The list. Drawn on a phone only when it is the screen you are on. */
  list,
  /** The conversation, or the placeholder that stands in for one. */
  children,
  /**
   * Which of the two the phone is showing. `list` on /messages, `detail` in a
   * conversation. On a wide screen it changes nothing — both are up.
   */
  primary,
}: {
  list: React.ReactNode
  children: React.ReactNode
  primary: "list" | "detail"
}) {
  return (
    <div data-app-screen className="flex min-h-0 flex-1 flex-col md:flex-row md:overflow-hidden">
      <aside
        className={cn(
          "min-h-0 flex-col",
          primary === "list" ? "flex flex-1" : "hidden",
          // 340px, and fixed rather than a fraction. A conversation row is a
          // name, a stamp and a line of preview, and that is a stable amount of
          // text — given a percentage of a 2560px monitor the column becomes a
          // half-empty ribbon while the messages beside it stretch to a line
          // length nobody can read back. The pane grows; the list does not need
          // to.
          "md:flex md:w-[340px] md:flex-none md:border-r md:border-neutral-200 lg:w-[380px]",
        )}
      >
        {list}
      </aside>

      {/* THE DIVIDER IS THE BORDER ABOVE, not an element between them.
          A draggable split is a genuine feature on a desktop app that people
          live in all day; here it is a control nobody asked for, that has to
          store a width somewhere, and that can be dragged into a state where
          neither side works. A hairline says the same thing about what belongs
          to what and cannot be broken. */}
      <section
        className={cn(
          "msg-pane min-h-0 min-w-0 flex-col bg-white",
          primary === "detail" ? "flex flex-1" : "hidden",
          "md:flex md:flex-1",
        )}
      >
        {children}
      </section>
    </div>
  )
}
