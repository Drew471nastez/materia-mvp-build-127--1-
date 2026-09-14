import { redirect } from "next/navigation"

/**
 * The workspace is its own screen again, at /creator-page.
 *
 * It moved under /app for a round so it would keep the sidebar, and the owner
 * asked for it back out: editing a page that is itself a full-width design
 * inside a two-thirds-of-a-window frame is looking at the wrong thing. This
 * address was live in between and is in links, so it keeps answering.
 */
export default function CreatorPageMovedOutOfApp() {
  redirect("/creator-page")
}
