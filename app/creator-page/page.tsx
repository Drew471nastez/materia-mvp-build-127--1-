import { redirect } from "next/navigation"

/**
 * The workspace lives under /app, with the sidebar.
 *
 * It has been both, twice, on the owner's instruction each time, and this is
 * where it settles: /app/creator-page. This address was live in between and
 * is in links and bookmarks, so it keeps answering.
 */
export default function CreatorPageMoved() {
  redirect("/app/creator-page")
}
