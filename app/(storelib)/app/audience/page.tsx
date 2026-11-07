import { redirect } from "next/navigation"

/* The Audience item is gone (round AL): its Leads are a tab of Emails. */
export default function Page() {
  redirect("/app/emails?tab=leads")
}
