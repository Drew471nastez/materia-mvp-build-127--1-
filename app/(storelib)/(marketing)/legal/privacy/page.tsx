import { permanentRedirect } from "next/navigation"

/*
  ONE PRIVACY POLICY, at /privacy. This address drew a "has moved" note and
  sent the browser on with a script, which a crawler or a browser without
  JavaScript never followed. A permanent redirect from the server does both,
  and the browser keeps a #cookies across it.
*/
export default function LegalPrivacyPage() {
  permanentRedirect("/privacy")
}
