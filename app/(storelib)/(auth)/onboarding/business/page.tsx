import { redirect } from "next/navigation"

/**
 * /onboarding/business used to be a page that explained a second business
 * before making one. "New business" in the account menu now makes it right
 * there and opens the creator onboarding (components/app/business-switcher),
 * so an old link to this address just goes to the dashboard.
 */
export default function NewBusinessPage() {
  redirect("/app")
}
