import { redirect } from "next/navigation"

/**
 * The workspace lives under /app again, with the sidebar. It was full screen
 * for a round because a sidebar left the page two thirds of a window; the
 * owner wants the sidebar back, and it is their product. This address was
 * live in between and is in links, so it keeps answering.
 */
export default function CreatorPageMoved() {
  redirect("/app/creator-page")
}
