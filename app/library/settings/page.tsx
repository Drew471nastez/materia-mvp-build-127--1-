import { permanentRedirect } from "next/navigation"

/**
 * The buyer's settings moved to their profile's Settings tab,
 * /account/settings, which has all of what was here (photo, name, email,
 * password, signing out, deleting the account) and preferences besides. This address is still in
 * emails and bookmarks, so it answers with where it went.
 */
export default function LibrarySettingsMoved() {
  permanentRedirect("/account/settings")
}
