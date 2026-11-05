import { permanentRedirect } from "next/navigation"

/*
  ONE TERMS OF SERVICE. This address drew a short, older text of its own, with
  a date that was always today and a contact address at another domain, while
  the full agreement lived at /terms. Old links (store listings, older
  OnePages and communities) still reach it, so it answers with a permanent
  redirect to the one document.
*/
export default function LegalTermsPage() {
  permanentRedirect("/terms")
}
