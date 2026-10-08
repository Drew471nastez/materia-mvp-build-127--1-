import { redirect } from "next/navigation"

/** Old or mistaken address: preferences live under Settings. */
export default function AccountPreferencesRedirect() {
  redirect("/account/settings?section=preferences")
}
