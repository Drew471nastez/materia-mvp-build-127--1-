import { redirect } from "next/navigation"

/**
 * The workspace is its own screen, at /creator-page.
 *
 * It has been both addresses twice, on the owner's instruction each time.
 * Both keep answering, so whichever is in somebody's bookmarks works.
 */
export default function CreatorPageMovedOutOfApp() {
  redirect("/creator-page")
}
