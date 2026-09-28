import { permanentRedirect } from "next/navigation"

/**
 * The buyer's settings moved to their account page, /account, which has all
 * of what was here (photo, name, email, password, signing out, deleting the
 * account) and the rest of an account besides. This address is still in
 * emails and bookmarks, so it answers with where it went.
 */
export default function LibrarySettingsMoved() {
  permanentRedirect("/account")
}
