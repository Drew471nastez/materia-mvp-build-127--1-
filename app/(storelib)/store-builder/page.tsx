import { redirect } from "next/navigation"

/**
 * ===========================================================================
 *  /store-builder IS NOW /creator-page
 * ===========================================================================
 * "Store Builder", "Website" and "OnePage" in one menu asked somebody to work
 * out, on their first visit, which of three things builds the page their name
 * points at. Two of them sound like the answer and only one is.
 *
 * The thing this edits is the creator's page at storelib.com/u/<handle>: a
 * picture, a bio, links, products, communities, a newsletter. It is not a
 * store and it is not a website, so it is called what it is.
 *
 * THE OLD ADDRESS STILL WORKS, and has to. It is in bookmarks, in the owner
 * menu on published pages, and in links people have sent each other. A rename
 * that breaks those is not a rename, it is a removal.
 */
export default function StoreBuilderRedirect() {
  redirect("/creator-page")
}
