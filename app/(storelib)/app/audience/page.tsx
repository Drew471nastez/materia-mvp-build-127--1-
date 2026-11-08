import { redirect } from "next/navigation"

/* The Audience item is gone (round AL). Its leads are Contacts' now (round 51): the People list, showing leads. */
export default function Page() {
  redirect("/app/contacts?filter=leads")
}
