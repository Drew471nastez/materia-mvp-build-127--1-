import { redirect } from "next/navigation"

/**
 * The workspace was briefly a route under /app so it would inherit the
 * sidebar. It renders a full-width design and a sidebar left it about two
 * thirds of a narrow window, so it is full screen now. This address is kept
 * because it was live, and a link that stops answering is a link somebody
 * loses rather than a decision anybody made.
 */
export default function CreatorPageMoved() {
  redirect("/creator-page")
}
